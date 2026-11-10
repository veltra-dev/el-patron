import { describeRecurrence } from "@elpatron/shared";
import { ConfirmButton, TrashIcon } from "@/components/confirm-button";
import { listReminders } from "@/lib/db";
import { dateTime } from "@/lib/format";
import { requireUser } from "@/lib/session";
import { removeReminder } from "../actions";

export const metadata = { title: "Lembretes · ElPatrón" };

export default async function LembretesPage() {
  const user = await requireUser();
  const lists = await listReminders(user.id);
  // avisos de vencimento aparecem na aba Contas
  const pending = lists.pending.filter((r) => !r.bill_id);
  const sent = lists.sent.filter((r) => !r.bill_id);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Lembretes</h1>

      <section>
        <h2 className="mb-2 px-1 text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">Agendados ({pending.length})</h2>
        {pending.length === 0 ? (
          <p className="card py-10 text-center text-sm text-[var(--text-muted)]">
            Nenhum lembrete agendado. Mande “me lembra amanhã às 9 de…” pro ElPatrón.
          </p>
        ) : (
          <ul className="card divide-y divide-[var(--border)]">
            {pending.map((r) => (
              <li key={r.id} className="flex items-center gap-3 py-3 pl-4 pr-2">
                <span className="text-lg" aria-hidden="true">{r.recurrence ? "🔁" : "⏰"}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm">{r.message}</div>
                  <div className="text-xs text-[var(--text-muted)]">
                    {r.recurrence ? (
                      <>
                        <span className="font-medium text-[var(--text-secondary)]">{describeRecurrence(r, user.timezone)}</span> · próximo{" "}
                        {dateTime(r.remind_at, user.timezone)}
                      </>
                    ) : (
                      dateTime(r.remind_at, user.timezone)
                    )}
                  </div>
                </div>
                <form action={removeReminder}>
                  <input type="hidden" name="id" value={r.id} />
                  <ConfirmButton
                    label="Cancelar lembrete"
                    message={r.recurrence ? `Parar de lembrar "${r.message}"? Todas as repetições serão canceladas.` : `Cancelar o lembrete "${r.message}"?`}
                  >
                    <TrashIcon />
                  </ConfirmButton>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      {sent.length > 0 && (
        <section>
          <h2 className="mb-2 px-1 text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">Enviados recentemente</h2>
          <ul className="card divide-y divide-[var(--border)]">
            {sent.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-4 py-3 text-[var(--text-secondary)]">
                <span aria-hidden="true">✓</span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm">{r.message}</div>
                  <div className="text-xs text-[var(--text-muted)]">{dateTime(r.remind_at, user.timezone)}</div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
