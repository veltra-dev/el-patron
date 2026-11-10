import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { EXPENSE_CATEGORIES, type User } from "@elpatron/shared";
import { z } from "zod";
import { googleEnabled } from "../config/env.js";
import * as db from "../db/index.js";
import {
  CalendarNotConnectedError,
  createEvent,
  deleteEvent,
  googleConnectUrl,
  listEvents,
} from "../services/calendar.js";
import { formatDateTime, localDate } from "../lib/time.js";

const isoDateTime = z.iso.datetime({ offset: true }).describe("ISO 8601 com offset, ex.: 2026-11-10T15:00:00-03:00");
const isoDate = z.iso.date().describe("Data YYYY-MM-DD");

const json = (v: unknown) => JSON.stringify(v);

/** Cria as ferramentas já presas ao usuário da conversa. */
export function buildTools(user: User) {
  const today = () => localDate(user.timezone);

  const finance = [
    betaZodTool({
      name: "registrar_transacao",
      description: "Registra um gasto (despesa) ou uma entrada de dinheiro (receita).",
      inputSchema: z.object({
        tipo: z.enum(["despesa", "receita"]),
        valor: z.number().positive().describe("Valor em reais, ex.: 45.9"),
        categoria: z.enum(EXPENSE_CATEGORIES),
        descricao: z.string().optional().describe("Ex.: 'ifood', 'conta de luz'"),
        data: isoDate.optional().describe("Data da transação; padrão hoje"),
      }),
      run: async (i) => {
        const t = await db.insertTransaction({
          user_id: user.id,
          kind: i.tipo,
          amount: Math.round(i.valor * 100) / 100,
          category: i.categoria,
          description: i.descricao,
          occurred_on: i.data ?? today(),
        });
        return json({ ok: true, id: t.id, data: t.occurred_on });
      },
    }),
    betaZodTool({
      name: "consultar_transacoes",
      description:
        "Lista transações num período e devolve totais por tipo e por categoria. Use para relatórios e para achar o id antes de remover.",
      inputSchema: z.object({
        inicio: isoDate,
        fim: isoDate,
        categoria: z.enum(EXPENSE_CATEGORIES).optional(),
      }),
      run: async (i) => {
        const rows = await db.listTransactions(user.id, i.inicio, i.fim, i.categoria);
        const totais = { despesa: 0, receita: 0 };
        const porCategoria: Record<string, number> = {};
        for (const r of rows) {
          const v = Number(r.amount);
          totais[r.kind] += v;
          if (r.kind === "despesa") porCategoria[r.category] = (porCategoria[r.category] ?? 0) + v;
        }
        return json({
          totais,
          saldo: totais.receita - totais.despesa,
          despesas_por_categoria: porCategoria,
          transacoes: rows.slice(0, 60).map((r) => ({
            id: r.id,
            tipo: r.kind,
            valor: Number(r.amount),
            categoria: r.category,
            descricao: r.description,
            data: r.occurred_on,
          })),
          total_transacoes: rows.length,
        });
      },
    }),
    betaZodTool({
      name: "remover_transacao",
      description: "Remove uma transação pelo id.",
      inputSchema: z.object({ id: z.uuid() }),
      run: async (i) => json({ ok: await db.deleteTransaction(user.id, i.id) }),
    }),
  ];

  const notes = [
    betaZodTool({
      name: "salvar_nota",
      description: "Salva uma anotação para o usuário consultar depois.",
      inputSchema: z.object({
        conteudo: z.string().min(1),
        tags: z.array(z.string()).optional().describe("Palavras-chave curtas, ex.: ['ideias', 'trabalho']"),
      }),
      run: async (i) => {
        const n = await db.insertNote(user.id, i.conteudo, i.tags ?? []);
        return json({ ok: true, id: n.id });
      },
    }),
    betaZodTool({
      name: "buscar_notas",
      description: "Busca anotações por palavras. Sem consulta, devolve as mais recentes.",
      inputSchema: z.object({
        consulta: z.string().optional(),
        limite: z.number().int().min(1).max(30).optional(),
      }),
      run: async (i) => {
        const rows = await db.searchNotes(user.id, i.consulta, i.limite ?? 10);
        return json(rows.map((n) => ({ id: n.id, conteudo: n.content, tags: n.tags, criada_em: n.created_at })));
      },
    }),
    betaZodTool({
      name: "apagar_nota",
      description: "Apaga uma anotação pelo id.",
      inputSchema: z.object({ id: z.uuid() }),
      run: async (i) => json({ ok: await db.deleteNote(user.id, i.id) }),
    }),
  ];

  const reminders = [
    betaZodTool({
      name: "criar_lembrete",
      description: "Agenda uma mensagem que o assistente vai mandar no WhatsApp do usuário no horário indicado.",
      inputSchema: z.object({
        mensagem: z.string().min(1).describe("Texto do lembrete, ex.: 'Pagar a conta de luz'"),
        quando: isoDateTime,
      }),
      run: async (i) => {
        const when = new Date(i.quando);
        if (when.getTime() < Date.now() - 60_000) {
          return json({ ok: false, erro: "Horário no passado" });
        }
        const r = await db.insertReminder(user.id, i.mensagem, when.toISOString());
        return json({ ok: true, id: r.id, quando: formatDateTime(r.remind_at, user.timezone) });
      },
    }),
    betaZodTool({
      name: "listar_lembretes",
      description: "Lista os lembretes pendentes.",
      inputSchema: z.object({}),
      run: async () => {
        const rows = await db.pendingReminders(user.id);
        return json(rows.map((r) => ({ id: r.id, mensagem: r.message, quando: formatDateTime(r.remind_at, user.timezone) })));
      },
    }),
    betaZodTool({
      name: "cancelar_lembrete",
      description: "Cancela um lembrete pendente pelo id.",
      inputSchema: z.object({ id: z.uuid() }),
      run: async (i) => json({ ok: await db.cancelReminder(user.id, i.id) }),
    }),
  ];

  if (!googleEnabled) return [...finance, ...notes, ...reminders];

  const notConnected = () =>
    json({ ok: false, erro: "Agenda do Google não conectada. Ofereça o link usando a ferramenta conectar_agenda." });

  const calendar = [
    betaZodTool({
      name: "conectar_agenda",
      description: "Gera o link para o usuário conectar (ou reconectar) a Agenda do Google. O link vale 15 minutos.",
      inputSchema: z.object({}),
      run: async () => json({ link: googleConnectUrl(user.id) }),
    }),
    betaZodTool({
      name: "agenda_listar_eventos",
      description: "Lista os eventos da Agenda do Google num intervalo.",
      inputSchema: z.object({ inicio: isoDateTime, fim: isoDateTime }),
      run: async (i) => {
        try {
          return json(await listEvents(user, i.inicio, i.fim));
        } catch (e) {
          if (e instanceof CalendarNotConnectedError) return notConnected();
          throw e;
        }
      },
    }),
    betaZodTool({
      name: "agenda_criar_evento",
      description: "Cria um evento na Agenda do Google. Se não houver horário de término, use 1 hora de duração.",
      inputSchema: z.object({
        titulo: z.string().min(1),
        inicio: isoDateTime,
        fim: isoDateTime,
        descricao: z.string().optional(),
        local: z.string().optional(),
        dia_inteiro: z.boolean().optional(),
      }),
      run: async (i) => {
        try {
          return json({ ok: true, ...(await createEvent(user, { ...i, diaInteiro: i.dia_inteiro })) });
        } catch (e) {
          if (e instanceof CalendarNotConnectedError) return notConnected();
          throw e;
        }
      },
    }),
    betaZodTool({
      name: "agenda_apagar_evento",
      description: "Apaga um evento da Agenda do Google pelo id (obtenha o id listando os eventos).",
      inputSchema: z.object({ id: z.string().min(1) }),
      run: async (i) => {
        try {
          await deleteEvent(user, i.id);
          return json({ ok: true });
        } catch (e) {
          if (e instanceof CalendarNotConnectedError) return notConnected();
          throw e;
        }
      },
    }),
  ];

  return [...finance, ...notes, ...reminders, ...calendar];
}
