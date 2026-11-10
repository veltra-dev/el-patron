-- Códigos de login do painel web, enviados pelo WhatsApp.
create table public.login_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  code_hash text not null,
  attempts int not null default 0,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index login_codes_user_created_idx on public.login_codes (user_id, created_at desc);

alter table public.login_codes enable row level security;
