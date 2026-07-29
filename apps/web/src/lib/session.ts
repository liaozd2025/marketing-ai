import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  signSession,
  verifySession,
  type SessionPayload,
} from "./session-token";

const SESSION_COOKIE = "marketing_ai_session";
const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 7;
const DEVELOPMENT_SECRET =
  "development-only-secret-change-before-production";

function sessionSecret(): string {
  const configuredSecret = process.env.SESSION_SECRET;
  if (configuredSecret) {
    if (configuredSecret.length < 32) {
      throw new Error("SESSION_SECRET must be at least 32 characters");
    }
    return configuredSecret;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET is required in production");
  }

  return DEVELOPMENT_SECRET;
}

export async function createSession(input: {
  memberId: string;
  merchantId: string;
}): Promise<void> {
  const payload: SessionPayload = {
    ...input,
    expiresAt: Date.now() + SESSION_DURATION_SECONDS * 1000,
  };
  const cookieStore = await cookies();

  cookieStore.set(SESSION_COOKIE, signSession(payload, sessionSecret()), {
    httpOnly: true,
    maxAge: SESSION_DURATION_SECONDS,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  return token ? verifySession(token, sessionSecret()) : null;
}

export async function requireSession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  return session;
}
