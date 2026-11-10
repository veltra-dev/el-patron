import "server-only";
import { jwtVerify, SignJWT } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { User } from "@elpatron/shared";
import { env } from "./env";
import { getUser } from "./db";

const COOKIE = "elpatron_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 dias

const key = () => new TextEncoder().encode(env.SESSION_SECRET);

export async function createSession(userId: string) {
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(key());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function destroySession() {
  (await cookies()).delete(COOKIE);
}

async function sessionUserId(): Promise<string | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"] });
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

/** Usuário logado, ou redireciona para /login. */
export async function requireUser(): Promise<User> {
  const id = await sessionUserId();
  const user = id ? await getUser(id) : null;
  if (!user) redirect("/login");
  return user;
}

export async function currentUserId(): Promise<string | null> {
  return sessionUserId();
}
