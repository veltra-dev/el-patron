import { auth, calendar } from "@googleapis/calendar";
import type { User } from "@elpatron/shared";
import { env, googleEnabled } from "../config/env.js";
import { decrypt, encrypt, signState } from "../lib/crypto.js";
import { updateUser } from "../db/index.js";

const SCOPES = ["https://www.googleapis.com/auth/calendar.events"];
export const GOOGLE_REDIRECT_PATH = "/auth/google/callback";

function oauthClient() {
  if (!googleEnabled) throw new Error("Google Calendar não configurado (GOOGLE_CLIENT_ID/SECRET)");
  return new auth.OAuth2(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    `${env.PUBLIC_URL.replace(/\/$/, "")}${GOOGLE_REDIRECT_PATH}`,
  );
}

export function googleConnectUrl(userId: string): string {
  return oauthClient().generateAuthUrl({
    access_type: "offline",
    prompt: "consent", // garante refresh_token mesmo em reconexões
    scope: SCOPES,
    state: signState(userId),
  });
}

export async function finishGoogleConnect(userId: string, code: string): Promise<void> {
  const { tokens } = await oauthClient().getToken(code);
  if (!tokens.refresh_token) throw new Error("Google não retornou refresh_token");
  await updateUser(userId, { google_refresh_token: encrypt(tokens.refresh_token) });
}

function calendarFor(user: User) {
  if (!user.google_refresh_token) return null;
  const client = oauthClient();
  client.setCredentials({ refresh_token: decrypt(user.google_refresh_token) });
  return calendar({ version: "v3", auth: client });
}

export class CalendarNotConnectedError extends Error {}

export async function listEvents(user: User, timeMin: string, timeMax: string) {
  const cal = calendarFor(user);
  if (!cal) throw new CalendarNotConnectedError();
  const res = await cal.events.list({
    calendarId: "primary",
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 50,
    timeZone: user.timezone,
  });
  return (res.data.items ?? []).map((e) => ({
    id: e.id,
    titulo: e.summary ?? "(sem título)",
    inicio: e.start?.dateTime ?? e.start?.date,
    fim: e.end?.dateTime ?? e.end?.date,
    local: e.location ?? undefined,
    descricao: e.description ?? undefined,
  }));
}

export async function createEvent(
  user: User,
  ev: { titulo: string; inicio: string; fim: string; descricao?: string; local?: string; diaInteiro?: boolean },
) {
  const cal = calendarFor(user);
  if (!cal) throw new CalendarNotConnectedError();
  const res = await cal.events.insert({
    calendarId: "primary",
    requestBody: {
      summary: ev.titulo,
      description: ev.descricao,
      location: ev.local,
      start: ev.diaInteiro ? { date: ev.inicio.slice(0, 10) } : { dateTime: ev.inicio, timeZone: user.timezone },
      end: ev.diaInteiro ? { date: ev.fim.slice(0, 10) } : { dateTime: ev.fim, timeZone: user.timezone },
    },
  });
  return { id: res.data.id, link: res.data.htmlLink };
}

export async function deleteEvent(user: User, eventId: string) {
  const cal = calendarFor(user);
  if (!cal) throw new CalendarNotConnectedError();
  await cal.events.delete({ calendarId: "primary", eventId });
}
