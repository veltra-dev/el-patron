import { ConfirmButton, TrashIcon } from "@/components/confirm-button";
import { listNotes } from "@/lib/db";
import { dateTime } from "@/lib/format";
import { requireUser } from "@/lib/session";
import { removeNote } from "../actions";

export const metadata = { title: "Notas · ElPatrón" };

export default async function NotasPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireUser();
  const { q } = await searchParams;
  const query = q?.trim() || undefined;
  const notes = await listNotes(user.id, query);

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold">Notas</h1>

      <form className="flex gap-2" role="search">
        <input name="q" defaultValue={query} placeholder="Buscar nas notas…" className="input" aria-label="Buscar nas notas" />
        <button className="btn-primary shrink-0 px-4">Buscar</button>
      </form>

      {query && (
        <p className="text-sm text-[var(--text-secondary)]">
          {notes.length} resultado{notes.length === 1 ? "" : "s"} para “{query}” ·{" "}
          <a href="/notas" className="link">
            limpar
          </a>
        </p>
      )}

      {notes.length === 0 ? (
        <p className="card py-10 text-center text-sm text-[var(--text-muted)]">
          {query ? "Nenhuma nota encontrada." : "Nenhuma nota ainda. Mande “anota: …” pro ElPatrón."}
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {notes.map((n) => (
            <li key={n.id} className="card flex flex-col p-4">
              <p className="flex-1 whitespace-pre-wrap text-sm leading-relaxed">{n.content}</p>
              <div className="mt-3 flex items-end justify-between gap-2">
                <div>
                  {n.tags.length > 0 && (
                    <div className="mb-1.5 flex flex-wrap gap-1">
                      {n.tags.map((t) => (
                        <a key={t} href={`/notas?q=${encodeURIComponent(t)}`} className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-xs text-[var(--text-secondary)]">
                          #{t}
                        </a>
                      ))}
                    </div>
                  )}
                  <div className="text-xs text-[var(--text-muted)]">{dateTime(n.created_at, user.timezone)}</div>
                </div>
                <form action={removeNote}>
                  <input type="hidden" name="id" value={n.id} />
                  <ConfirmButton label="Apagar nota" message="Apagar esta nota?">
                    <TrashIcon />
                  </ConfirmButton>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
