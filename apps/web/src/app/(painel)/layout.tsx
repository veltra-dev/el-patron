import { Icon } from "@/components/icons";
import { BottomNav, MobileHeader, Sidebar } from "@/components/shell";
import { greeting } from "@/lib/format";
import { requireUser } from "@/lib/session";
import { logout } from "../login/actions";

export default async function PainelLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <div className="min-h-dvh lg:flex">
      <Sidebar
        name={user.name}
        logout={
          <form action={logout}>
            <button className="flex min-h-10 w-full items-center gap-3 rounded-xl px-3.5 text-sm font-medium text-muted hover:bg-surface hover:text-ink">
              <Icon name="logout" size={18} /> Sair
            </button>
          </form>
        }
      />
      <div className="min-w-0 flex-1">
        <MobileHeader name={user.name} greeting={greeting(user.timezone)} />
        <main className="mx-auto flex w-full max-w-[1240px] flex-col gap-5 px-4 pb-32 pt-3 lg:px-9 lg:pb-12 lg:pt-6">{children}</main>
      </div>
      <BottomNav />
    </div>
  );
}
