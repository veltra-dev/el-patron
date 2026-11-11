-- Módulos do redesign: orçamentos, metas, assinaturas/parcelas, modo casal
-- e origem das transações.

-- Origem do lançamento (mostrada no painel). Os antigos vieram do WhatsApp.
alter table public.transactions
  add column source text not null default 'whatsapp' check (source in ('whatsapp', 'importacao', 'web')),
  add column shared boolean not null default false,          -- modo casal: divide com o parceiro
  add column partner_share_pct int not null default 50 check (partner_share_pct between 0 and 100);

-- ---------- orçamentos ----------
create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  category text not null,
  amount numeric(12, 2) not null check (amount > 0),
  created_at timestamptz not null default now(),
  unique (user_id, category)
);
alter table public.budgets enable row level security;

-- % do teto em que o Patrón avisa (além do aviso de estouro em 100%).
alter table public.users
  add column budget_alert_pct int not null default 80 check (budget_alert_pct between 10 and 100),
  add column partner_id uuid references public.users(id) on delete set null;

-- Avisos já mandados no mês, para não repetir a cada gasto.
create table public.budget_alerts_sent (
  user_id uuid not null references public.users(id) on delete cascade,
  category text not null,
  month text not null,          -- YYYY-MM
  level int not null,           -- % do aviso (ex.: 80) ou 100 (estourou)
  sent_at timestamptz not null default now(),
  primary key (user_id, category, month, level)
);
alter table public.budget_alerts_sent enable row level security;

-- ---------- metas & cofrinhos ----------
create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  target_amount numeric(12, 2) not null check (target_amount > 0),
  saved_amount numeric(12, 2) not null default 0,
  deadline date,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create index goals_user_idx on public.goals (user_id, created_at);
alter table public.goals enable row level security;

create table public.goal_deposits (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.goals(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  amount numeric(12, 2) not null check (amount <> 0),   -- negativo = retirada
  created_at timestamptz not null default now()
);
create index goal_deposits_goal_idx on public.goal_deposits (goal_id, created_at desc);
alter table public.goal_deposits enable row level security;

-- ---------- assinaturas & parcelamentos ----------
-- Cada mês vira uma conta a pagar (bills) no dia da cobrança.
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  kind text not null check (kind in ('assinatura', 'parcelamento')),
  description text not null,
  amount numeric(12, 2) not null check (amount > 0),     -- valor mensal / da parcela
  category text not null default 'assinaturas',
  billing_day int not null check (billing_day between 1 and 31),
  start_month date not null,                             -- 1º dia do mês da 1ª cobrança/parcela
  installments_total int check (installments_total is null or installments_total > 0),
  last_billed_on date,                                   -- último vencimento já lançado em bills
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index subscriptions_user_idx on public.subscriptions (user_id) where active;
alter table public.subscriptions enable row level security;

alter table public.bills
  add column subscription_id uuid references public.subscriptions(id) on delete set null,
  add column installment int;   -- nº da parcela (parcelamentos)
create unique index bills_subscription_due_idx on public.bills (subscription_id, due_on) where subscription_id is not null;

-- ---------- modo casal ----------
create table public.partner_invites (
  from_user uuid not null references public.users(id) on delete cascade,
  to_user uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (from_user, to_user),
  check (from_user <> to_user)
);
alter table public.partner_invites enable row level security;

-- Acertos registrados (quem pagou quem, referente a qual mês).
create table public.couple_settlements (
  id uuid primary key default gen_random_uuid(),
  payer_id uuid not null references public.users(id) on delete cascade,
  receiver_id uuid not null references public.users(id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  month text not null,          -- YYYY-MM
  created_at timestamptz not null default now()
);
create index couple_settlements_idx on public.couple_settlements (month);
alter table public.couple_settlements enable row level security;
