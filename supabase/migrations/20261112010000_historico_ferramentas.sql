-- Guarda, junto com a resposta do assistente, as chamadas de ferramenta e os
-- resultados daquela rodada. Sem isso o modelo vê "✅ criei o lembrete" no
-- histórico sem nenhuma prova e passa a duvidar das próprias ações.
alter table public.chat_messages add column blocks jsonb;
