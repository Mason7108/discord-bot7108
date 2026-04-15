import { describe, expect, it } from "vitest";
import {
  consumeVerificationSession,
  createVerificationSession,
  inspectVerificationSession,
  takeVerificationButtonRateLimit
} from "../../src/utils/tokenManager.js";

describe("tokenManager", () => {
  it("creates and consumes a single-use token", () => {
    const session = createVerificationSession({
      guildId: "g1",
      userId: "u1",
      ttlMs: 60_000
    });

    const firstCheck = inspectVerificationSession({ token: session.token, userId: "u1" });
    expect(firstCheck.ok).toBe(true);

    const consume = consumeVerificationSession({ token: session.token, userId: "u1" });
    expect(consume.ok).toBe(true);

    const secondConsume = consumeVerificationSession({ token: session.token, userId: "u1" });
    expect(secondConsume.ok).toBe(false);
  });

  it("rejects token use by a different user", () => {
    const session = createVerificationSession({
      guildId: "g2",
      userId: "u2",
      ttlMs: 60_000
    });

    const check = inspectVerificationSession({ token: session.token, userId: "different-user" });
    expect(check.ok).toBe(false);
    if (!check.ok) {
      expect(check.reason).toBe("mismatch");
    }
  });

  it("rate-limits verification button requests", () => {
    const first = takeVerificationButtonRateLimit("g3", "u3", 30_000);
    expect(first.ok).toBe(true);

    const second = takeVerificationButtonRateLimit("g3", "u3", 30_000);
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.msRemaining).toBeGreaterThan(0);
    }
  });
});
