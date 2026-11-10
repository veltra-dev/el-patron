import Anthropic from "@anthropic-ai/sdk";
import type { User } from "@elpatron/shared";
import { env } from "../config/env.js";
import { recentMessages, saveMessage } from "../db/index.js";
import { logger } from "../lib/logger.js";
import { describeNow } from "../lib/time.js";
import { SYSTEM_PROMPT } from "./prompt.js";
import { buildTools } from "./tools.js";

const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

/**
 * O histórico enviado ao modelo é só texto (pergunta do usuário + resposta
 * final do assistente). Blocos de thinking/tool_use de turnos anteriores não
 * são reenviados, então podemos cortar mensagens antigas pela janela sem
 * quebrar a checagem de histórico do modelo.
 */
async function buildHistory(userId: string): Promise<Anthropic.Beta.BetaMessageParam[]> {
  const rows = await recentMessages(userId, env.AI_HISTORY_MESSAGES);
  const firstUser = rows.findIndex((r) => r.role === "user");
  if (firstUser === -1) return [];
  return rows.slice(firstUser).map((r) => ({ role: r.role, content: r.content }));
}

export async function runAgent(user: User, userText: string): Promise<string> {
  const stamped = `[Usuário: ${user.name} | Agora: ${describeNow(user.timezone)}]\n${userText}`;
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...(await buildHistory(user.id)),
    { role: "user", content: stamped },
  ];

  const final = await anthropic.beta.messages.toolRunner({
    model: env.AI_MODEL,
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    tools: buildTools(user),
    messages,
    output_config: { effort: env.AI_EFFORT },
    cache_control: { type: "ephemeral" },
    // Se um classificador de segurança recusar por engano, a API refaz a
    // requisição num modelo de fallback dentro da mesma chamada.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    max_iterations: 10,
  });

  logger.debug({ usage: final.usage, stop: final.stop_reason }, "resposta da IA");

  let reply = final.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  if (final.stop_reason === "refusal" || !reply) {
    reply = "Não consegui processar esse pedido. Pode tentar reformular?";
  }

  await saveMessage(user.id, "user", stamped);
  await saveMessage(user.id, "assistant", reply);
  return reply;
}
