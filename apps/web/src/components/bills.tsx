import { categoryLabel, type Bill } from "@elpatron/shared";
import { markBillPaid, removeBill } from "@/app/(painel)/actions";
import { dayShort, money } from "@/lib/format";
import { ConfirmButton } from "./confirm-button";
import { Icon } from "./icons";
import { Initial } from "./ui";

export function dueText(b: Bill, today: string) {
  if (b.paid_at) return { text: "Paga", tone: "text-muted" };
  if (b.due_on < today) return { text: `Venceu ${dayShort(b.due_on)}`, tone: "text-bad" };
  if (b.due_on === today) return { text: `Hoje · ${dayShort(b.due_on)}`, tone: "text-accent-soft" };
  return { text: dayShort(b.due_on), tone: "text-muted" };
}

export function PayButton({ bill, variant = "check" }: { bill: Bill; variant?: "check" | "text" }) {
  return (
    <form action={markBillPaid}>
      <input type="hidden" name="id" value={bill.id} />
      <ConfirmButton
        label={`Marcar ${bill.description} como paga`}
        message={`Marcar "${bill.description}" como paga? ${money(Number(bill.amount))} entra como gasto de hoje.`}
        className={
          variant === "check"
            ? "grid size-11 place-items-center rounded-full border border-line-strong text-soft transition-colors hover:border-good hover:text-good"
            : "pill min-h-9 px-3.5"
        }
      >
        {variant === "check" ? <Icon name="check" size={18} /> : "Paguei"}
      </ConfirmButton>
    </form>
  );
}

export function DeleteBillButton({ bill }: { bill: Bill }) {
  return (
    <form action={removeBill}>
      <input type="hidden" name="id" value={bill.id} />
      <ConfirmButton label="Apagar conta" message={`Apagar a conta "${bill.description}"?`}>
        <Icon name="trash" size={17} />
      </ConfirmButton>
    </form>
  );
}

/** Linha de conta (lista mobile / cards): inicial, nome, categoria ou vencimento, valor e ✓. */
export function BillRow({ bill, today, showDue }: { bill: Bill; today: string; showDue?: boolean }) {
  const due = dueText(bill, today);
  return (
    <li className="flex items-center gap-3 py-3">
      <Initial text={bill.description} />
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold">{bill.description}</div>
        <div className={`truncate text-[13px] ${showDue ? due.tone : "text-muted"}`}>{showDue ? due.text : categoryLabel(bill.category)}</div>
      </div>
      <span className={`num shrink-0 font-semibold ${bill.paid_at ? "text-muted line-through" : ""}`}>{money(Number(bill.amount))}</span>
      {!bill.paid_at && <PayButton bill={bill} />}
    </li>
  );
}
