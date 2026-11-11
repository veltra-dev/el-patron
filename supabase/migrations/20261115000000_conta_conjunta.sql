-- Modo casal vira conta conjunta: os dois enxergam as finanças um do outro.
-- Um lançamento "pessoal" (ex.: presente) só aparece para quem lançou.
-- As colunas shared/partner_share_pct e a tabela couple_settlements (do acerto
-- 50/50, nunca usados) ficam por ora para não quebrar a versão no ar durante o
-- deploy; podem ser removidas numa migração futura.

alter table public.transactions
  add column personal boolean not null default false;
