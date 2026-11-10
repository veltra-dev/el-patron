import { redirect } from "next/navigation";
import { currentUserId } from "@/lib/session";
import { Logo } from "@/components/logo";
import { LoginForm } from "./login-form";

export const metadata = { title: "Entrar · ElPatrón" };

export default async function LoginPage() {
  if (await currentUserId()) redirect("/");

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Logo className="mx-auto mb-3 size-14" />
          <h1 className="text-2xl font-semibold tracking-tight">ElPatrón</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">Seus gastos, notas e lembretes do WhatsApp.</p>
        </div>
        <div className="card p-6">
          <LoginForm />
        </div>
      </div>
    </main>
  );
}
