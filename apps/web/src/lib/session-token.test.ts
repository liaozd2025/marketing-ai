import { describe, expect, it } from "vitest";

import { signSession, verifySession } from "./session-token";

const secret = "a-test-secret-that-is-at-least-32-characters";
const payload = {
  expiresAt: 2_000,
  memberId: "member-a",
  merchantId: "merchant-a",
};

describe("signed session", () => {
  it("round-trips tenant identity from a valid signed token", () => {
    const token = signSession(payload, secret);

    expect(verifySession(token, secret, 1_000)).toEqual(payload);
  });

  it("rejects a tenant identifier changed by the client", () => {
    const token = signSession(payload, secret);
    const [encodedPayload, tokenSignature] = token.split(".");
    const changedPayload = Buffer.from(
      JSON.stringify({ ...payload, merchantId: "merchant-b" }),
    ).toString("base64url");

    expect(
      verifySession(`${changedPayload}.${tokenSignature}`, secret, 1_000),
    ).toBeNull();
    expect(encodedPayload).not.toBe(changedPayload);
  });

  it("rejects expired sessions", () => {
    const token = signSession(payload, secret);

    expect(verifySession(token, secret, 2_001)).toBeNull();
  });
});
