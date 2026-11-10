-- Números fora da whitelist que mandaram mensagem. Serve para responder o
-- aviso de "não é cliente" no máximo uma vez a cada X dias, e para o dono
-- saber quem tentou contato (possíveis clientes).
create table public.unknown_contacts (
  phone text primary key,
  push_name text,
  message_count int not null default 0,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_replied_at timestamptz
);
alter table public.unknown_contacts enable row level security;
