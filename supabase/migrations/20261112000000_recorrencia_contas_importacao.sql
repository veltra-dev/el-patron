-- Lembretes recorrentes, contas a pagar e importação de arquivos.

-- ---------- contas a pagar ----------
create table public.bills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  description text not null,
  amount numeric(12, 2) not null check (amount > 0),
  category text not null default 'contas',
  due_on date not null,
  paid_at timestamptz,
  transaction_id uuid references public.transactions(id) on delete set null,
  source text not null default 'whatsapp' check (source in ('whatsapp', 'importacao', 'web')),
  created_at timestamptz not null default now()
);
create index bills_user_due_idx on public.bills (user_id, due_on);
alter table public.bills enable row level security;

-- ---------- lembretes recorrentes ----------
-- recurrence nulo = lembrete único.
-- recurrence_days: dias da semana (0 = domingo … 6 = sábado) para 'semanal';
--                  dia do mês ([10]) para 'mensal'.
alter table public.reminders
  add column recurrence text check (recurrence in ('diario', 'dias_uteis', 'semanal', 'mensal')),
  add column recurrence_days int[],
  add column last_sent_at timestamptz,
  add column bill_id uuid references public.bills(id) on delete cascade;

-- ---------- importações aguardando confirmação ----------
create table public.pending_imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  file_name text,
  payload jsonb not null,
  created_at timestamptz not null default now()
);
create index pending_imports_user_idx on public.pending_imports (user_id, created_at desc);
alter table public.pending_imports enable row level security;
