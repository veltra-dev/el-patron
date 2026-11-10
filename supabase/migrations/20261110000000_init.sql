-- ElPatrón: schema inicial
-- Rode no SQL Editor do Supabase (ou via `supabase db push`).
-- A API usa a service_role key, que ignora RLS. O RLS fica ligado e sem
-- políticas para que a anon key (futuro app web) não leia nada até
-- definirmos políticas com Supabase Auth.

create extension if not exists pgcrypto;

-- Usuários permitidos (whitelist). Só quem estiver aqui é atendido pelo bot.
create table public.users (
  id uuid primary key default gen_random_uuid(),
  phone text not null unique,          -- 5511999998888
  wa_number text,                      -- como o WhatsApp entrega (pode vir sem o 9)
  name text not null,
  timezone text not null default 'America/Sao_Paulo',
  google_refresh_token text,           -- criptografado (AES-256-GCM) pela API
  created_at timestamptz not null default now()
);

-- Histórico de conversa (somente texto) usado como contexto da IA.
create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);
create index chat_messages_user_created_idx on public.chat_messages (user_id, created_at desc);

-- Gastos e receitas.
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  kind text not null default 'despesa' check (kind in ('despesa', 'receita')),
  amount numeric(12, 2) not null check (amount > 0),
  category text not null default 'outros',
  description text,
  occurred_on date not null default current_date,
  created_at timestamptz not null default now()
);
create index transactions_user_date_idx on public.transactions (user_id, occurred_on desc);

-- Anotações, com busca full-text em português.
-- array_to_string não é IMMUTABLE no Postgres, então colunas geradas não
-- aceitam usá-lo direto; este wrapper com config fixa é seguro para isso.
create function public.notes_search_vector(content text, tags text[])
returns tsvector
language sql
immutable
parallel safe
set search_path = ''
as $$
  select to_tsvector('portuguese'::regconfig, content || ' ' || coalesce(array_to_string(tags, ' '), ''))
$$;

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  content text not null,
  tags text[] not null default '{}',
  search tsvector generated always as (public.notes_search_vector(content, tags)) stored,
  created_at timestamptz not null default now()
);
create index notes_user_created_idx on public.notes (user_id, created_at desc);
create index notes_search_idx on public.notes using gin (search);

-- Lembretes proativos (o scheduler da API envia no horário).
create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  message text not null,
  remind_at timestamptz not null,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index reminders_pending_idx on public.reminders (remind_at) where sent_at is null;

-- Idempotência: a Evolution pode reenviar o mesmo webhook.
create table public.processed_messages (
  id text primary key,
  created_at timestamptz not null default now()
);

alter table public.users enable row level security;
alter table public.chat_messages enable row level security;
alter table public.transactions enable row level security;
alter table public.notes enable row level security;
alter table public.reminders enable row level security;
alter table public.processed_messages enable row level security;
