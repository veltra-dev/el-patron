import { describeRecurrence, localParts, type Reminder } from "@elpatron/shared";
import { ConfirmButton } from "@/components/confirm-button";
import { Icon } from "@/components/icons";
import { ReminderForm } from "@/components/reminder-form";
import { Empty, PageHeader } from "@/components/ui";
import { listReminders } from "@/lib/db";
import { dateTime, plural, relativeDay, todayIn } from "@/lib/format";
import { requireUser } from "@/lib/session";
import { removeReminder } from "../actions";

export const metadata = { title: "Lembretes · ElPatrón" };

export default async function LembretesPage() {
  const user = await requireUser();
  const today = todayIn(user.timezone);
  const lists = await listReminders(user.id);
  const sent = lists.sent.filter((r) => !r.bill_id);
  const pending = lists.pending;

  const byDay = new Map<string, Reminder[]>();
  for (const r of pending) {
    const d = localParts(r.remind_at, user.timezone).date;
    byDay.set(d, [...(byDay.get(d) ?? []), r]);
  }

  return (
    <>
      <PageHeader title="Lembretes" subtitle={`${plural(pending.length, "agendado", "agendados")} · enviados pelo WhatsApp`} />

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-4 lg:order-1">
          {pending.length === 0 ? (
            <div className="card">
              <Empty>Nenhum lembrete agendado. Crie ao lado ou mande “me lembra amanhã às 9 de…” pro Patrón.</Empty>
            </div>
          ) : (
            [...byDay.entries()].map(([day, items]) => (
              <section key={day} className="flex flex-col gap-2">
                <h2 className={`px-1 text-[13px] font-semibold ${day === today ? "text-accent-soft" : "text-soft"}`}>{relativeDay(day, today)}</h2>
                <ul className="flex flex-col gap-2">
                  {items.map((r) => {
                    const rec = describeRecurrence(r, user.timezone);
                    return (
                      <li key={r.id} className="card flex items-center gap-4 py-3.5 pl-5 pr-2.5">
                        <span className="display num w-14 shrink-0 text-lg font-bold text-accent-soft">{localParts(r.remind_at, user.timezone).time}</span>
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold">{r.message.replace(/^💸 /, "")}</div>
                          <div className="text-[13px] text-muted">{r.bill_id ? "aviso de vencimento · ligado à conta" : rec ? `🔁 ${rec}` : "uma vez"}</div>
                        </div>
                        <form action={removeReminder}>
                          <input type="hidden" name="id" value={r.id} />
                          <ConfirmButton
                            label="Cancelar lembrete"
                            message={r.recurrence ? `Parar de lembrar "${r.message}"? Todas as repetições serão canceladas.` : `Cancelar o lembrete "${r.message}"?`}
                            className="grid size-10 place-items-center rounded-full text-muted hover:bg-raised hover:text-ink"
                          >
                            <Icon name="x" size={18} />
                          </ConfirmButton>
                        </form>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))
          )}

          {sent.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="px-1 text-[13px] font-semibold text-muted">Enviados recentemente</h2>
              <ul className="card divide-y divide-line px-5">
                {sent.slice(0, 8).map((r) => (
                  <li key={r.id} className="flex items-center gap-3 py-3 text-soft">
                    <Icon name="check" size={16} className="text-good" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm">{r.message}</div>
                      <div className="text-xs text-muted">{dateTime(r.remind_at, user.timezone)}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
        <div className="lg:order-2 lg:sticky lg:top-6">
          <ReminderForm today={today} />
        </div>
      </div>
    </>
  );
}
