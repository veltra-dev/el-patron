# ElPatrón

Assistente pessoal no WhatsApp com IA: controle de gastos, anotações, lembretes,
Google Agenda e transcrição de áudios.

```
WhatsApp ⇄ Evolution API ──webhook──▶ apps/api (Fastify)
                                        ├─ áudio → OpenAI (transcrição)
                                        ├─ Claude + ferramentas (gastos, notas, lembretes, agenda)
                                        ├─ Supabase (Postgres)
                                        └─ scheduler de lembretes → Evolution
```

## Estrutura

```
apps/api            API do bot (Render)
apps/web            (futuro) painel web em Next.js (Vercel)
packages/shared     tipos e constantes usados pela API e pelo web
supabase/           migrations e seed
infra/              docker-compose da Evolution para dev local
render.yaml         blueprint de deploy (API + Evolution)
```

O canal fica isolado em `apps/api/src/whatsapp/`. Para migrar para a Cloud API
da Meta, implemente outro `WhatsAppProvider` e troque o export em `evolution.ts`.

## O que o bot faz

| Pedido no WhatsApp | Ferramenta |
|---|---|
| "gastei 45 no ifood", "recebi 3000 de salário" | `registrar_transacao` |
| "quanto gastei esse mês?", "gastos com mercado em outubro" | `consultar_transacoes` |
| "anota: ideia de presente pra mãe…", "o que eu anotei sobre o carro?" | `salvar_nota` / `buscar_notas` |
| "me lembra de pagar a luz amanhã às 9" | `criar_lembrete` (enviado pelo scheduler) |
| "o que tenho na agenda amanhã?", "marca dentista sexta 14h" | `agenda_*` |
| áudio próprio ou encaminhado | transcreve e trata como mensagem / resume |

## Rodando localmente

```bash
pnpm install
cp apps/api/.env.example apps/api/.env          # preencha as chaves
docker compose --env-file apps/api/.env -f infra/docker-compose.yml up -d  # Evolution em http://localhost:8080
```

1. **Supabase**: preencha `DATABASE_URL` no `.env` e rode `pnpm db:migrate` (ou cole o SQL de `supabase/migrations/` no SQL Editor). Depois
   cadastre os números permitidos (veja `supabase/seed.example.sql`).
2. **Evolution**: com a Evolution local, use `PUBLIC_URL=http://host.docker.internal:3000`
   no `.env` e rode `pnpm evolution:setup`. Abra `http://localhost:8080/manager` e leia o QR
   Code com o celular do **chip do bot**.
3. `pnpm dev` e mande uma mensagem do seu número para o número do bot.

## Deploy (Render)

1. Suba o repositório no GitHub e crie um **Blueprint** no Render apontando para ele.
   Ele cria `elpatron-api` e `elpatron-evolution`.
2. Na Evolution, `DATABASE_CONNECTION_URI` = string do **Session pooler** do Supabase
   (porta 5432) terminando em `?schema=evolution`. `AUTHENTICATION_API_KEY` = mesma
   chave que vai em `EVOLUTION_API_KEY` na API.
3. Na API, `PUBLIC_URL` = URL do próprio serviço e `EVOLUTION_API_URL` = URL da Evolution.
4. Localmente, com o `.env` apontando para as URLs do Render, rode `pnpm evolution:setup`
   e leia o QR Code em `https://<evolution>.onrender.com/manager`.

> Use plano pago (Starter) nos dois serviços. No free o serviço dorme: a Evolution
> perde a conexão com o WhatsApp e os lembretes atrasam.

## Google Agenda

1. No Google Cloud Console: crie um projeto, ative a **Google Calendar API**, configure a
   tela de consentimento (tipo *Externo*) e crie um **OAuth Client ID** do tipo *Web*.
2. Redirect URI autorizada: `{PUBLIC_URL}/auth/google/callback`.
3. **Publique o app** (status "Em produção"). Em modo *Teste*, o refresh token expira em
   7 dias. Sem verificação, o Google mostra um aviso de "app não verificado", o que é ok
   para uso pessoal (até 100 usuários).
4. No WhatsApp: "conecta minha agenda". O bot manda o link.

## Notas sobre a IA

- Modelo: `claude-opus-5-5` com `effort: low` (respostas rápidas). Ajuste `AI_EFFORT` se
  quiser respostas mais elaboradas.
- Fallback de recusa ativado (`fallbacks: "default"`): se um classificador de segurança
  recusar uma mensagem por engano, a API refaz a chamada em outro modelo automaticamente.
- O histórico enviado ao modelo é só texto (últimas `AI_HISTORY_MESSAGES` mensagens).
- System prompt e ferramentas são estáveis e ficam no cache de prompt. Data/hora vão na
  mensagem.

## Cuidados com a Evolution (API não oficial)

- Use um chip dedicado para o bot.
- O bot só responde a números da tabela `users`. Ignora grupos e números desconhecidos.
- Evite disparos em massa. Para comercializar, migre para a Cloud API da Meta (os
  lembretes vão virar templates *utility*).
