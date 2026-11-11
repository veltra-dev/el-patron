import { ConfirmButton } from "@/components/confirm-button";
import { Icon } from "@/components/icons";
import { NoteForm } from "@/components/note-form";
import { Chips, Empty, PageHeader, SearchBox } from "@/components/ui";
import { listNotes } from "@/lib/db";
import { relativeDay, todayIn } from "@/lib/format";
import { requireUser } from "@/lib/session";
import { removeNote } from "../actions";

export const metadata = { title: "Notas · ElPatrón" };

export default async function NotasPage({ searchParams }: { searchParams: Promise<{ q?: string; tag?: string }> }) {
  const user = await requireUser();
  const { q, tag } = await searchParams;
  const query = q?.trim() || undefined;
  const today = todayIn(user.timezone);
  const [notes, all] = await Promise.all([listNotes(user.id, query), query ? listNotes(user.id) : null]);
  const shown = tag ? notes.filter((n) => n.tags.includes(tag)) : notes;

  // etiquetas mais usadas viram filtros
  const counts = new Map<string, number>();
  for (const n of all ?? notes) for (const t of n.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  const tags = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([t]) => t);
  const href = (t?: string) => {
    const p = new URLSearchParams();
    if (query) p.set("q", query);
    if (t) p.set("tag", t);
    const s = p.toString();
    return s ? `/notas?${s}` : "/notas";
  };

  return (
    <>
      <PageHeader title="Notas">
        <SearchBox defaultValue={query} placeholder="Buscar nas notas…" />
      </PageHeader>

      <NoteForm />

      {tags.length > 0 && <Chips items={[{ href: href(), label: "Todas", active: !tag }, ...tags.map((t) => ({ href: href(t), label: `#${t}`, active: tag === t }))]} />}

      {query && (
        <p className="text-sm text-soft">
          {shown.length} resultado{shown.length === 1 ? "" : "s"} para “{query}” ·{" "}
          <a href="/notas" className="link-accent">
            limpar
          </a>
        </p>
      )}

      {shown.length === 0 ? (
        <div className="card">
          <Empty>{query || tag ? "Nenhuma nota encontrada." : "Nenhuma nota ainda. Escreva acima ou mande “anota: …” pro Patrón."}</Empty>
        </div>
      ) : (
        <ul className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((n) => (
            <li key={n.id} className="card flex flex-col gap-3 p-4">
              <p className="flex-1 whitespace-pre-wrap text-[15px] leading-relaxed">{n.content}</p>
              <div className="flex items-center gap-2">
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                  {n.tags.map((t) => (
                    <a key={t} href={href(t)} className="rounded-full bg-accent-bg px-2.5 py-1 text-xs font-semibold text-accent-soft">
                      #{t}
                    </a>
                  ))}
                  <span className="text-xs text-muted">{relativeDay(n.created_at.slice(0, 10), today).toLowerCase()}</span>
                </div>
                <form action={removeNote}>
                  <input type="hidden" name="id" value={n.id} />
                  <ConfirmButton label="Apagar nota" message="Apagar esta nota?">
                    <Icon name="trash" size={16} />
                  </ConfirmButton>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
