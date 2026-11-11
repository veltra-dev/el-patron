import Link from "next/link";
import { Icon, type IconName } from "@/components/icons";
import { Logo } from "@/components/logo";
import { maskPhone } from "@/lib/format";
import { requireUser } from "@/lib/session";
import { logout } from "../../login/actions";

export const metadata = { title: "Mais · ElPatrón" };

const MODULES: { href: string; title: string; desc: string; icon: IconName }[] = [
  { href: "/orcamentos", title: "Orçamentos", desc: "Teto por categoria e alerta do Patrón", icon: "orcamentos" },
  { href: "/metas", title: "Metas & cofrinhos", desc: "Guardar pra um objetivo com prazo", icon: "metas" },
  { href: "/previsao", title: "Previsão de caixa", desc: "Saldo projetado até o fim do mês", icon: "previsao" },
  { href: "/assinaturas", title: "Assinaturas & parcelas", desc: "Recorrências e parcelamentos num lugar", icon: "assinaturas" },
  { href: "/casal", title: "Modo casal", desc: "Dividir contas com quem mora com você", icon: "casal" },
];

export default async function MaisPage() {
  const user = await requireUser();
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <Logo className="size-10 shrink-0" />
          <div className="min-w-0 leading-tight">
            <div className="truncate font-semibold">{user.name}</div>
            <div className="text-xs text-muted">{maskPhone(user.phone)}</div>
          </div>
        </div>
        <form action={logout}>
          <button className="btn btn-outline min-h-10 rounded-full">Sair</button>
        </form>
      </div>
      <h1 className="display text-[30px] font-bold">Mais</h1>

      <section className="flex flex-col gap-3">
        <h2 className="eyebrow px-1">No dia a dia</h2>
        <div className="grid grid-cols-2 gap-3">
          {(
            [
              ["/notas", "Notas", "notas"],
              ["/lembretes", "Lembretes", "lembretes"],
            ] as const
          ).map(([href, label, icon]) => (
            <Link key={href} href={href} className="card flex flex-col gap-3 p-4 hover:border-line-strong">
              <span className="icon-box size-9 rounded-[10px]">
                <Icon name={icon} size={18} />
              </span>
              <span className="font-semibold">{label}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="eyebrow px-1 !text-accent">Módulos</h2>
        {MODULES.map((m) => (
          <Link key={m.href} href={m.href} className="card flex items-center gap-3.5 p-4 hover:border-line-strong">
            <span className="icon-box size-11 bg-accent-bg">
              <Icon name={m.icon} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{m.title}</span>
              <span className="block text-[13px] text-muted">{m.desc}</span>
            </span>
            <Icon name="chevronRight" size={18} className="text-muted" />
          </Link>
        ))}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="eyebrow px-1">Conta & agente</h2>
        <Link href="/patron" className="card-patron flex items-center gap-3.5 p-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent text-accent-ink">
            <Icon name="patron" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold text-accent-soft">Patrón no WhatsApp</span>
            <span className="block text-[13px] text-muted">Conversar e ver o que ele faz sozinho</span>
          </span>
          <Icon name="chevronRight" size={18} className="text-muted" />
        </Link>
      </section>
    </>
  );
}
