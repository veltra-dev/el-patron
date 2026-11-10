import OpenAI, { toFile } from "openai";
import { env } from "../config/env.js";

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

const EXT: Record<string, string> = {
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/aac": "m4a",
  "audio/wav": "wav",
  "audio/webm": "webm",
};

/** Transcreve um áudio do WhatsApp (normalmente ogg/opus) para texto em português. */
export async function transcribe(data: Buffer, mimetype: string): Promise<string> {
  const base = mimetype.split(";")[0]!.trim();
  const file = await toFile(data, `audio.${EXT[base] ?? "ogg"}`, { type: base });
  const result = await openai.audio.transcriptions.create({
    file,
    model: env.TRANSCRIPTION_MODEL,
    language: "pt",
  });
  return result.text.trim();
}
