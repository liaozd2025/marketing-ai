import { createHmac, timingSafeEqual } from "node:crypto";

export interface SessionPayload {
  readonly expiresAt: number;
  readonly memberId: string;
  readonly merchantId: string;
}

function signature(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function signSession(
  payload: SessionPayload,
  secret: string,
): string {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
    "base64url",
  );
  return `${encodedPayload}.${signature(encodedPayload, secret)}`;
}

function isSessionPayload(value: unknown): value is SessionPayload {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  return (
    "expiresAt" in value &&
    typeof value.expiresAt === "number" &&
    "memberId" in value &&
    typeof value.memberId === "string" &&
    value.memberId.length > 0 &&
    "merchantId" in value &&
    typeof value.merchantId === "string" &&
    value.merchantId.length > 0
  );
}

export function verifySession(
  token: string,
  secret: string,
  now = Date.now(),
): SessionPayload | null {
  const [encodedPayload, encodedSignature, extra] = token.split(".");
  if (!encodedPayload || !encodedSignature || extra) {
    return null;
  }

  const expectedSignature = signature(encodedPayload, secret);
  const provided = Buffer.from(encodedSignature);
  const expected = Buffer.from(expectedSignature);

  if (
    provided.length !== expected.length ||
    !timingSafeEqual(provided, expected)
  ) {
    return null;
  }

  try {
    const payload: unknown = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    );
    if (!isSessionPayload(payload) || payload.expiresAt <= now) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}
