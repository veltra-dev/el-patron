import { Chat, ShortcutLinks, type ChatMsg } from "@/components/chat";
import { Icon } from "@/components/icons";
import { PageHeader } from "@/components/ui";
import { recentChat } from "@/lib/db";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Patrón · ElPatrón" };

/** Tira a linha de contexto "[Usuário: … | Agora: …]" e as notas internas de arquivo. */
function clean(text: string) {
  return text
    .replace(/^\[Usuário:[^\n]*\]\n?/, "")
    .replace(/\n\((planilha|PDF)[^\n]*lido por completo[^\n]*\)$/, "")
    .trim();
}

export default async function PatronPage({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const user = await requireUser();
  const { msg } = await searchParams;
  const history = await recentChat(user.id, 60);
  const initial: ChatMsg[] = history.map((m) => ({ id: m.id, role: m.role, text: clean(m.content), at: m.created_at })).filter((m) => m.text);

  const auto = [
    "Avisa às 9h no dia do vencimento de cada conta",
    "Lança os gastos que você manda por mensagem ou áudio",
    `Avisa quando uma categoria passa de ${user.budget_alert_pct}% do orçamento`,
    "Lança assinaturas e parcelas em contas a pagar todo mês",
    "Lê planilhas e faturas em PDF e importa depois do seu ok",
  ];

  return (
    <>
      <div className="hidden lg:block">
        <PageHeader
          title="Patrón"
          subtitle={
            <span className="flex items-center gap-1.5 text-[#8FBEA6]">
              <span className="size-1.5 rounded-full bg-good" /> online · mesma conversa do seu WhatsApp
            </span>
          }
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <Chat initial={initial} timezone={user.timezone} prefill={msg?.slice(0, 500)} />
        <div className="hidden flex-col gap-4 lg:flex">
          <section className="card flex flex-col gap-3 p-5">
            <h2 className="text-[17px] font-semibold">Atalhos</h2>
            <ShortcutLinks />
          </section>
          <section className="card flex flex-col gap-3 p-5">
            <h2 className="text-[17px] font-semibold">O que o Patrón faz sozinho</h2>
            <ul className="flex flex-col gap-3">
              {auto.map((a) => (
                <li key={a} className="flex items-center gap-3 text-[15px]">
                  <span className="grid size-6 shrink-0 place-items-center rounded-md bg-accent text-accent-ink">
                    <Icon name="check" size={16} strokeWidth={2.4} />
                  </span>
                  {a}
                </li>
              ))}
            </ul>
            <p className="text-[13px] text-muted">O % do alerta de orçamento muda em Orçamentos → Ajustar alertas.</p>
          </section>
        </div>
      </div>
    </>
  );
}
