import { Logo } from "@/components/logo";
import { Nav } from "@/components/nav";
import { maskPhone } from "@/lib/format";
import { requireUser } from "@/lib/session";
import { logout } from "../login/actions";

export default async function PainelLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <div className="mx-auto min-h-dvh max-w-3xl px-4 pb-16">
      <header className="flex items-center justify-between gap-3 py-4">
        <div className="flex items-center gap-2.5">
          <Logo className="size-9" />
          <div className="leading-tight">
            <div className="font-semibold">ElPatrón</div>
            <div className="text-xs text-[var(--text-muted)]">
              {user.name} · {maskPhone(user.phone)}
            </div>
          </div>
        </div>
        <form action={logout}>
          <button className="btn-ghost">Sair</button>
        </form>
      </header>
      <Nav />
      <main className="mt-6">{children}</main>
    </div>
  );
}
