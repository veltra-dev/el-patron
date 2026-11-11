import { categoryLabel } from "@elpatron/shared";
import { listBills, overdueBills } from "@/lib/db";
import { currentMonth, isValidMonth, monthRange } from "@/lib/format";
import { requireUser } from "@/lib/session";

const cell = (v: string) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** CSV (separador ;, abre direto no Excel em pt-BR) das contas do mês. */
export async function GET(req: Request) {
  const user = await requireUser();
  const mes = new URL(req.url).searchParams.get("mes") ?? undefined;
  const current = currentMonth(user.timezone);
  const month = isValidMonth(mes) ? mes : current;
  const { from, to } = monthRange(month);
  const [bills, late] = await Promise.all([listBills(user.id, from, to), month === current ? overdueBills(user.id, from) : Promise.resolve([])]);
  const lines = [
    ["Conta", "Categoria", "Vencimento", "Valor", "Situação"].join(";"),
    ...[...late, ...bills].map((b) =>
      [
        cell(b.description),
        cell(categoryLabel(b.category)),
        b.due_on.split("-").reverse().join("/"),
        Number(b.amount).toFixed(2).replace(".", ","),
        b.paid_at ? "Paga" : "Em aberto",
      ].join(";"),
    ),
  ];
  return new Response(`﻿${lines.join("\r\n")}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="contas-${month}.csv"`,
    },
  });
}
