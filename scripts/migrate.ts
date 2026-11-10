/**
 * Aplica as migrations de supabase/migrations/*.sql que ainda não rodaram.
 * Uso (na raiz): pnpm db:migrate
 * Precisa de DATABASE_URL em apps/api/.env (Supabase > Connect > Session pooler).
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("❌ Defina DATABASE_URL em apps/api/.env (Supabase > Connect > Session pooler)");
  process.exit(1);
}

const dir = join(import.meta.dirname, "..", "supabase", "migrations");
const sql = postgres(url, { ssl: "require", max: 1, onnotice: () => {} });

try {
  await sql`create table if not exists public.schema_migrations (
    name text primary key,
    applied_at timestamptz not null default now()
  )`;
  await sql`alter table public.schema_migrations enable row level security`;

  const applied = new Set((await sql<{ name: string }[]>`select name from public.schema_migrations`).map((r) => r.name));
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  const pending = files.filter((f) => !applied.has(f));

  if (pending.length === 0) console.log("✅ Banco já está atualizado.");

  for (const file of pending) {
    const content = await readFile(join(dir, file), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(content);
      await tx`insert into public.schema_migrations (name) values (${file})`;
    });
    console.log(`✅ ${file}`);
  }
} catch (err) {
  console.error("❌ Falha na migration:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await sql.end();
}
