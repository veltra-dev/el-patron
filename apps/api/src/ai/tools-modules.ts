import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import {
  EXPENSE_CATEGORIES,
  budgetStatus,
  categoryLabel,
  dueDateIn,
  installmentStatus,
  monthOf,
  shiftMonthIso,
  type User,
} from "@elpatron/shared";
import { z } from "zod";
import * as db from "../db/index.js";
import { localDate } from "../lib/time.js";
import { billSubscription, cashForecast, money } from "./helpers.js";

const json = (v: unknown) => JSON.stringify(v);
const cents = (v: number) => Math.round(v * 100) / 100;

/** Ferramentas dos módulos: orçamentos, metas, assinaturas/parcelas, previsão e modo casal. */
export function moduleTools(user: User) {
  const today = () => localDate(user.timezone);

  const budgets = [
    betaZodTool({
      name: "definir_orcamento",
      description:
        "Define (ou altera) o teto mensal de gastos de uma categoria. O Patrón avisa quando a categoria passa do % de alerta e quando estoura.",
      inputSchema: z.object({
        categoria: z.enum(EXPENSE_CATEGORIES),
        valor: z.number().positive().describe("Teto mensal em reais"),
      }),
      run: async (i) => {
        const b = await db.upsertBudget(user, i.categoria, cents(i.valor));
        return json({ ok: true, categoria: b.category, teto: money(Number(b.amount)), aviso_em: `${user.budget_alert_pct}%` });
      },
    }),
    betaZodTool({
      name: "ver_orcamentos",
      description: "Mostra os orçamentos do mês: teto, quanto já gastou, % usado e quanto resta em cada categoria.",
      inputSchema: z.object({}),
      run: async () => {
        const month = monthOf(today());
        const [list, spent] = await Promise.all([
          db.listBudgets(user),
          db.spentByCategory(user, `${month}-01`, dueDateIn(month, 31)),
        ]);
        if (!list.length) return json({ orcamentos: [], dica: "Nenhum orçamento definido ainda." });
        return json({
          aviso_em: `${user.budget_alert_pct}%`,
          orcamentos: list.map((b) => {
            const g = spent[b.category] ?? 0;
            const st = budgetStatus(g, Number(b.amount), user.budget_alert_pct);
            return {
              categoria: categoryLabel(b.category),
              teto: money(Number(b.amount)),
              gasto: money(g),
              usado: `${Math.round(st.pct)}%`,
              situacao: st.level === "estourou" ? `estourou ${money(-st.remaining)}` : `restam ${money(st.remaining)}`,
            };
          }),
        });
      },
    }),
    betaZodTool({
      name: "remover_orcamento",
      description: "Remove o orçamento de uma categoria.",
      inputSchema: z.object({ categoria: z.enum(EXPENSE_CATEGORIES) }),
      run: async (i) => json({ ok: await db.deleteBudget(user, i.categoria) }),
    }),
    betaZodTool({
      name: "ajustar_alerta_orcamento",
      description: "Muda em qual % do teto o Patrón avisa (padrão 80%). O aviso de estouro (100%) sempre acontece.",
      inputSchema: z.object({ percentual: z.number().int().min(10).max(100) }),
      run: async (i) => {
        await db.setBudgetAlertPct(user.id, i.percentual);
        return json({ ok: true, aviso_em: `${i.percentual}%` });
      },
    }),
  ];

  const goals = [
    betaZodTool({
      name: "criar_meta",
      description: "Cria uma meta/cofrinho para guardar dinheiro para um objetivo (reserva de emergência, viagem, monitor novo).",
      inputSchema: z.object({
        nome: z.string().min(1),
        valor_alvo: z.number().positive(),
        prazo: z.iso.date().optional().describe("Data limite YYYY-MM-DD (opcional)"),
        ja_guardado: z.number().min(0).optional().describe("Quanto já tem guardado para isso"),
      }),
      run: async (i) => {
        const g = await db.insertGoal({
          user_id: user.id,
          name: i.nome,
          target_amount: cents(i.valor_alvo),
          deadline: i.prazo ?? null,
          saved_amount: cents(i.ja_guardado ?? 0),
        });
        return json({ ok: true, id: g.id });
      },
    }),
    betaZodTool({
      name: "listar_metas",
      description: "Lista as metas com quanto já foi guardado, % e prazo. Use também para achar o id antes de guardar/retirar.",
      inputSchema: z.object({}),
      run: async () => {
        const list = await db.listGoals(user);
        return json(
          list.map((g) => ({
            id: g.id,
            nome: g.name,
            alvo: money(Number(g.target_amount)),
            guardado: money(Number(g.saved_amount)),
            progresso: `${Math.min(100, Math.round((Number(g.saved_amount) / Number(g.target_amount)) * 100))}%`,
            prazo: g.deadline,
            concluida: Boolean(g.completed_at),
          })),
        );
      },
    }),
    betaZodTool({
      name: "guardar_na_meta",
      description: "Guarda dinheiro numa meta (valor positivo) ou retira (valor negativo).",
      inputSchema: z.object({ id: z.uuid(), valor: z.number().refine((v) => v !== 0, "valor não pode ser zero") }),
      run: async (i) => {
        const goal = await db.getGoal(user, i.id);
        if (!goal) return json({ ok: false, erro: "Meta não encontrada" });
        const g = await db.depositGoal(user, goal, cents(i.valor));
        return json({
          ok: true,
          guardado: money(Number(g.saved_amount)),
          alvo: money(Number(g.target_amount)),
          concluida: Boolean(g.completed_at),
        });
      },
    }),
    betaZodTool({
      name: "apagar_meta",
      description: "Apaga uma meta.",
      inputSchema: z.object({ id: z.uuid() }),
      run: async (i) => json({ ok: await db.deleteGoal(user, i.id) }),
    }),
  ];

  const subscriptions = [
    betaZodTool({
      name: "registrar_assinatura",
      description:
        "Registra uma cobrança fixa mensal: assinatura (Netflix, academia, plano de saúde) ou compra parcelada. " +
        "Todo mês o Patrón lança a conta a pagar no dia da cobrança e avisa no vencimento. " +
        "Não registre a conta do mês separadamente: esta ferramenta já cria.",
      inputSchema: z.object({
        tipo: z.enum(["assinatura", "parcelamento"]),
        descricao: z.string().min(1),
        valor_mensal: z.number().positive().describe("Valor de cada mês/parcela"),
        dia_cobranca: z.number().int().min(1).max(31),
        categoria: z.enum(EXPENSE_CATEGORIES).optional().describe("Padrão: assinaturas (para parcelamento, a categoria da compra)"),
        total_parcelas: z.number().int().min(2).max(120).optional().describe("Só para parcelamento"),
        parcela_atual: z
          .number()
          .int()
          .min(1)
          .optional()
          .describe("Parcelamento já em andamento: número da parcela deste mês (ex.: 'parcela 3 de 6' = 3). Padrão: 1"),
      }),
      run: async (i) => {
        if (i.tipo === "parcelamento" && !i.total_parcelas) return json({ ok: false, erro: "Informe total_parcelas" });
        const t = today();
        const month = monthOf(t);
        const startMonth = shiftMonthIso(month, -((i.parcela_atual ?? 1) - 1));
        const dueNow = dueDateIn(month, i.dia_cobranca);
        const sub = await db.insertSubscription({
          user_id: user.id,
          kind: i.tipo,
          description: i.descricao,
          amount: cents(i.valor_mensal),
          category: i.categoria ?? "assinaturas",
          billing_day: i.dia_cobranca,
          start_month: `${startMonth}-01`,
          installments_total: i.tipo === "parcelamento" ? i.total_parcelas! : null,
          // cobrança deste mês já passou: considera paga, começa no próximo
          last_billed_on: dueNow < t ? dueNow : null,
        });
        const bill = await billSubscription(sub, user);
        return json({
          ok: true,
          id: sub.id,
          conta_deste_mes: bill ? { vencimento: bill.due_on, valor: money(Number(bill.amount)) } : "já passou, começa no próximo mês",
        });
      },
    }),
    betaZodTool({
      name: "listar_assinaturas",
      description: "Lista assinaturas e parcelamentos ativos, com total mensal e quanto falta quitar dos parcelamentos.",
      inputSchema: z.object({}),
      run: async () => {
        const list = await db.listSubscriptions(user);
        const t = today();
        const items = list.map((s) => {
          const base = { id: s.id, tipo: s.kind, descricao: s.description, valor_mensal: money(Number(s.amount)), dia: s.billing_day };
          if (s.kind !== "parcelamento") return base;
          const st = installmentStatus(s, t);
          return { ...base, parcela: `${st.current} de ${st.total}`, falta_pagar: money(st.remainingAmount), termina_em: st.endMonth };
        });
        return json({ total_mensal: money(list.reduce((s, x) => s + Number(x.amount), 0)), itens: items });
      },
    }),
    betaZodTool({
      name: "cancelar_assinatura",
      description: "Cancela uma assinatura/parcelamento: para de lançar contas novas e remove as futuras ainda não pagas.",
      inputSchema: z.object({ id: z.uuid() }),
      run: async (i) => json({ ok: await db.cancelSubscription(user, i.id) }),
    }),
  ];

  const forecastTool = betaZodTool({
    name: "previsao_caixa",
    description:
      "Projeta o saldo do mês até o último dia: saldo atual (receitas - despesas do mês) menos contas a pagar e assinaturas. " +
      "Diz se e quando o caixa fica negativo. Use para 'vai sobrar dinheiro?', 'quanto falta pra fechar o mês?'.",
    inputSchema: z.object({}),
    run: async () => {
      const f = await cashForecast(user);
      const biggest = [...f.outflows].sort((a, b) => b.amount - a.amount).slice(0, 6);
      return json({
        saldo_hoje: money(f.balance),
        saidas_previstas: money(f.totalOut),
        saldo_fim_do_mes: money(f.endBalance),
        fica_negativo_em: f.zeroOn,
        saldo_cobre: `${Math.round(Math.min(1, f.coverage) * 100)}% das saídas`,
        maiores_saidas: biggest.map((o) => ({ descricao: o.label, valor: money(o.amount), data: o.date })),
      });
    },
  });

  const couple = [
    betaZodTool({
      name: "resumo_casal",
      description:
        "Conta conjunta (modo casal): quanto cada um gastou e recebeu no mês. As finanças dos dois já são uma conta só; " +
        "use para 'quanto a Lais gastou esse mês?' ou 'quem gastou mais?'.",
      inputSchema: z.object({ mes: z.string().regex(/^\d{4}-\d{2}$/).optional().describe("YYYY-MM; padrão o mês atual") }),
      run: async (i) => {
        if (!user.partner_id) return json({ ok: false, erro: "Modo casal não está ativo. Ele é ativado no painel web, em Modo casal." });
        const partner = await db.getUser(user.partner_id);
        if (!partner) return json({ ok: false, erro: "Parceiro não encontrado" });
        const month = i.mes ?? monthOf(today());
        const txs = await db.listTransactions(user, `${month}-01`, dueDateIn(month, 31));
        const sum = (uid: string, kind: string) =>
          money(txs.filter((t) => t.user_id === uid && t.kind === kind).reduce((s, t) => s + Number(t.amount), 0));
        return json({
          mes: month,
          usuario: { gastou: sum(user.id, "despesa"), recebeu: sum(user.id, "receita") },
          [partner.name.split(" ")[0]!]: { gastou: sum(partner.id, "despesa"), recebeu: sum(partner.id, "receita") },
          obs: "Não inclui os lançamentos pessoais do parceiro(a).",
        });
      },
    }),
  ];

  return [...budgets, ...goals, ...subscriptions, forecastTool, ...couple];
}
