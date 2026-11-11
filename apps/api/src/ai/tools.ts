import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { EXPENSE_CATEGORIES, describeRecurrence, nextOccurrence, type User } from "@elpatron/shared";
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
import { budgetAlert, createBillReminder, dueLabel, importSummary, money } from "./helpers.js";
import { moduleTools } from "./tools-modules.js";

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
        compartilhada: z
          .boolean()
          .optional()
          .describe("Modo casal: true se o gasto é dividido 50/50 com o parceiro(a) (ex.: 'mercado da casa, divide com a Lais')"),
      }),
      run: async (i) => {
        const t = await db.insertTransaction({
          user_id: user.id,
          kind: i.tipo,
          amount: Math.round(i.valor * 100) / 100,
          category: i.categoria,
          description: i.descricao,
          occurred_on: i.data ?? today(),
          shared: Boolean(i.compartilhada && user.partner_id),
        });
        const alerta = t.kind === "despesa" ? await budgetAlert(user, t.category, t.occurred_on) : null;
        return json({
          ok: true,
          id: t.id,
          data: t.occurred_on,
          ...(i.compartilhada ? { compartilhada: t.shared, ...(t.shared ? {} : { aviso: "Modo casal não está ativo; registrado só para o usuário." }) } : {}),
          ...(alerta ? { alerta_orcamento: alerta } : {}),
        });
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
      description:
        "Agenda uma mensagem que o assistente manda no WhatsApp do usuário no horário indicado. " +
        "Para lembretes que se repetem ('todo dia', 'dias úteis', 'toda segunda', 'todo dia 10'), preencha `repetir`; " +
        "sem `repetir`, o lembrete dispara uma única vez.",
      inputSchema: z.object({
        mensagem: z.string().min(1).describe("Texto do lembrete, ex.: 'Reunião da T10'"),
        quando: isoDateTime.describe(
          "Primeira ocorrência, ISO 8601 com offset. Para recorrentes, o horário daqui vale para todas as repetições.",
        ),
        repetir: z
          .enum(["diario", "dias_uteis", "semanal", "mensal"])
          .optional()
          .describe("diario = todo dia; dias_uteis = segunda a sexta; semanal = dias em `dias_semana`; mensal = mesmo dia do mês de `quando`"),
        dias_semana: z
          .array(z.number().int().min(0).max(6))
          .optional()
          .describe("Só para semanal: 0 = domingo, 1 = segunda … 6 = sábado"),
      }),
      run: async (i) => {
        const when = new Date(i.quando);
        if (!i.repetir) {
          if (when.getTime() < Date.now() - 60_000) return json({ ok: false, erro: "Horário no passado" });
          const r = await db.insertReminder({ user_id: user.id, message: i.mensagem, remind_at: when.toISOString() });
          return json({ ok: true, id: r.id, quando: formatDateTime(r.remind_at, user.timezone), repete: false });
        }

        let days: number[] | null = null;
        if (i.repetir === "semanal") {
          if (!i.dias_semana?.length) return json({ ok: false, erro: "Informe dias_semana para lembrete semanal" });
          days = [...new Set(i.dias_semana)].sort();
        } else if (i.repetir === "mensal") {
          days = [Number(localDate(user.timezone, when).slice(8, 10))];
        }
        // primeira ocorrência válida a partir de `quando` (ou de agora, se `quando` já passou)
        const after = new Date(Math.max(Date.now(), when.getTime() - 1000));
        const first = nextOccurrence(when.toISOString(), i.repetir, days, user.timezone, after);
        const r = await db.insertReminder({
          user_id: user.id,
          message: i.mensagem,
          remind_at: first,
          recurrence: i.repetir,
          recurrence_days: days,
        });
        return json({
          ok: true,
          id: r.id,
          repete: describeRecurrence(r, user.timezone),
          primeira_vez: formatDateTime(r.remind_at, user.timezone),
        });
      },
    }),
    betaZodTool({
      name: "listar_lembretes",
      description: "Lista os lembretes ativos (únicos pendentes e recorrentes).",
      inputSchema: z.object({}),
      run: async () => {
        const rows = await db.pendingReminders(user.id);
        return json(
          rows.map((r) => ({
            id: r.id,
            mensagem: r.message,
            proxima_vez: formatDateTime(r.remind_at, user.timezone),
            repete: describeRecurrence(r, user.timezone) ?? "não (lembrete único)",
          })),
        );
      },
    }),
    betaZodTool({
      name: "cancelar_lembrete",
      description: "Cancela um lembrete pelo id. Para recorrentes, para todas as repetições futuras.",
      inputSchema: z.object({ id: z.uuid() }),
      run: async (i) => json({ ok: await db.cancelReminder(user.id, i.id) }),
    }),
  ];

  const bills = [
    betaZodTool({
      name: "registrar_conta_a_pagar",
      description:
        "Registra uma conta que ainda vai vencer (boleto, fatura, aluguel). Diferente de registrar_transacao, que é para gasto já feito. " +
        "Por padrão o assistente avisa no WhatsApp às 9h do dia do vencimento.",
      inputSchema: z.object({
        descricao: z.string().min(1),
        valor: z.number().positive(),
        vencimento: isoDate,
        categoria: z.enum(EXPENSE_CATEGORIES).optional().describe("Padrão: contas"),
        lembrar_no_vencimento: z.boolean().optional().describe("Padrão: true"),
      }),
      run: async (i) => {
        const [bill] = await db.insertBills([
          {
            user_id: user.id,
            description: i.descricao,
            amount: Math.round(i.valor * 100) / 100,
            category: i.categoria ?? "contas",
            due_on: i.vencimento,
            source: "whatsapp",
          },
        ]);
        const lembrete = i.lembrar_no_vencimento === false ? null : await createBillReminder(user, bill!);
        return json({ ok: true, id: bill!.id, lembrete_no_vencimento: lembrete });
      },
    }),
    betaZodTool({
      name: "listar_contas",
      description: "Lista contas a pagar num período (por vencimento). Use para 'o que vence esse mês?', 'tenho conta atrasada?'.",
      inputSchema: z.object({
        status: z.enum(["pendentes", "pagas", "todas"]).optional().describe("Padrão: pendentes"),
        inicio: isoDate.optional(),
        fim: isoDate.optional(),
      }),
      run: async (i) => {
        const rows = await db.listBills(user.id, { from: i.inicio, to: i.fim, status: i.status ?? "pendentes" });
        const today = localDate(user.timezone);
        const pend = rows.filter((b) => !b.paid_at);
        return json({
          hoje: today,
          total_pendente: pend.reduce((s, b) => s + Number(b.amount), 0),
          atrasadas: pend.filter((b) => b.due_on < today).length,
          contas: rows.map((b) => ({
            id: b.id,
            descricao: b.description,
            valor: Number(b.amount),
            vencimento: b.due_on,
            situacao: b.paid_at ? "paga" : dueLabel(b.due_on, today),
          })),
        });
      },
    }),
    betaZodTool({
      name: "marcar_conta_paga",
      description:
        "Marca uma conta como paga. Por padrão também registra o pagamento como despesa de hoje (para entrar nos relatórios de gastos).",
      inputSchema: z.object({
        id: z.uuid(),
        registrar_como_gasto: z.boolean().optional().describe("Padrão: true"),
        valor_pago: z.number().positive().optional().describe("Se pagou valor diferente do previsto"),
      }),
      run: async (i) => {
        const bill = await db.getBill(user.id, i.id);
        if (!bill) return json({ ok: false, erro: "Conta não encontrada" });
        if (bill.paid_at) return json({ ok: false, erro: "Essa conta já estava paga" });
        let txId: string | null = null;
        if (i.registrar_como_gasto !== false) {
          const t = await db.insertTransaction({
            user_id: user.id,
            kind: "despesa",
            amount: i.valor_pago ?? Number(bill.amount),
            category: bill.category,
            description: bill.description,
            occurred_on: localDate(user.timezone),
          });
          txId = t.id;
        }
        await db.markBillPaid(user.id, bill.id, txId);
        const alerta = txId ? await budgetAlert(user, bill.category, localDate(user.timezone)) : null;
        return json({ ok: true, registrado_como_gasto: Boolean(txId), ...(alerta ? { alerta_orcamento: alerta } : {}) });
      },
    }),
    betaZodTool({
      name: "remover_conta",
      description: "Apaga uma conta a pagar (cadastrada errado, cancelada).",
      inputSchema: z.object({ id: z.uuid() }),
      run: async (i) => json({ ok: await db.deleteBill(user.id, i.id) }),
    }),
  ];

  const importItemTx = z.object({
    tipo: z.enum(["despesa", "receita"]),
    valor: z.number().positive(),
    categoria: z.enum(EXPENSE_CATEGORIES),
    descricao: z.string(),
    data: isoDate,
  });
  const importItemBill = z.object({
    descricao: z.string(),
    valor: z.number().positive(),
    vencimento: isoDate,
    categoria: z.enum(EXPENSE_CATEGORIES).optional(),
  });

  const imports = [
    betaZodTool({
      name: "preparar_importacao",
      description:
        "Use quando o usuário mandar um arquivo (planilha/PDF) com gastos ou contas. Guarda os itens extraídos como RASCUNHO " +
        "(nada é salvo ainda) e devolve um resumo, que você mostra ao usuário pedindo confirmação. " +
        "`transacoes` = gastos/receitas que já aconteceram; `contas` = contas que ainda vão vencer.",
      inputSchema: z.object({
        transacoes: z.array(importItemTx),
        contas: z.array(importItemBill),
        nome_arquivo: z.string().optional(),
      }),
      run: async (i) => {
        if (i.transacoes.length + i.contas.length === 0) return json({ ok: false, erro: "Nenhum item para importar" });
        await db.savePendingImport(user.id, i.nome_arquivo ?? null, { transacoes: i.transacoes, contas: i.contas });
        return json({ ok: true, rascunho_salvo: true, ...(await importSummary(user.id, i.transacoes, i.contas, localDate(user.timezone))) });
      },
    }),
    betaZodTool({
      name: "confirmar_importacao",
      description: "Salva de verdade o último rascunho de importação, depois que o usuário confirmou.",
      inputSchema: z.object({
        ignorar_duplicados: z
          .boolean()
          .optional()
          .describe("true = pula transações que parecem já existir (mesma data e valor). Padrão: true"),
      }),
      run: async (i) => {
        const pending = await db.takePendingImport(user.id);
        if (!pending) return json({ ok: false, erro: "Não há importação aguardando confirmação (ou passou de 24h)." });
        const payload = pending.payload as { transacoes: z.infer<typeof importItemTx>[]; contas: z.infer<typeof importItemBill>[] };

        let txs = payload.transacoes;
        if (i.ignorar_duplicados !== false && txs.length) {
          const dates = txs.map((t) => t.data).sort();
          const existing = await db.listTransactions(user.id, dates[0]!, dates.at(-1)!);
          const seen = new Set(existing.map((e) => `${e.occurred_on}|${Number(e.amount).toFixed(2)}`));
          txs = txs.filter((t) => !seen.has(`${t.data}|${t.valor.toFixed(2)}`));
        }
        const inserted = await db.insertTransactions(
          txs.map((t) => ({
            user_id: user.id,
            kind: t.tipo,
            amount: Math.round(t.valor * 100) / 100,
            category: t.categoria,
            description: t.descricao,
            occurred_on: t.data,
            source: "importacao" as const,
          })),
        );
        const billRows = await db.insertBills(
          payload.contas.map((c) => ({
            user_id: user.id,
            description: c.descricao,
            amount: Math.round(c.valor * 100) / 100,
            category: c.categoria ?? "contas",
            due_on: c.vencimento,
            source: "importacao" as const,
          })),
        );
        let reminders = 0;
        for (const b of billRows) if (await createBillReminder(user, b)) reminders++;
        return json({
          ok: true,
          transacoes_salvas: inserted,
          duplicadas_ignoradas: payload.transacoes.length - txs.length,
          contas_salvas: billRows.length,
          lembretes_de_vencimento: reminders,
          total_contas: money(billRows.reduce((s, b) => s + Number(b.amount), 0)),
        });
      },
    }),
    betaZodTool({
      name: "cancelar_importacao",
      description: "Descarta o rascunho de importação quando o usuário não quer salvar.",
      inputSchema: z.object({}),
      run: async () => json({ ok: await db.discardPendingImport(user.id) }),
    }),
  ];

  const modules = moduleTools(user);
  if (!googleEnabled) return [...finance, ...notes, ...reminders, ...bills, ...imports, ...modules];

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

  return [...finance, ...notes, ...reminders, ...bills, ...imports, ...modules, ...calendar];
}
