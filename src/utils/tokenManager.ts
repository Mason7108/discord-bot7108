import { randomBytes } from "node:crypto";

export interface VerificationSession {
  token: string;
  guildId: string;
  userId: string;
  createdAt: number;
  expiresAt: number;
  used: boolean;
}

export type SessionValidationReason = "not_found" | "expired" | "used" | "mismatch";

const sessionsByToken = new Map<string, VerificationSession>();
const latestTokenByUserKey = new Map<string, string>();
const buttonCooldownByUserKey = new Map<string, number>();

function toUserKey(guildId: string, userId: string): string {
  return `${guildId}:${userId}`;
}

function cleanupExpired(now = Date.now()): void {
  for (const [token, session] of sessionsByToken.entries()) {
    if (session.expiresAt <= now || session.used) {
      sessionsByToken.delete(token);

      const key = toUserKey(session.guildId, session.userId);
      const latestToken = latestTokenByUserKey.get(key);
      if (latestToken === token) {
        latestTokenByUserKey.delete(key);
      }
    }
  }
}

export function takeVerificationButtonRateLimit(
  guildId: string,
  userId: string,
  cooldownMs: number
): { ok: true } | { ok: false; msRemaining: number } {
  const now = Date.now();
  const key = toUserKey(guildId, userId);
  const lastClick = buttonCooldownByUserKey.get(key);

  if (lastClick && lastClick + cooldownMs > now) {
    return { ok: false, msRemaining: lastClick + cooldownMs - now };
  }

  buttonCooldownByUserKey.set(key, now);
  return { ok: true };
}

export function createVerificationSession(input: {
  guildId: string;
  userId: string;
  ttlMs: number;
}): VerificationSession {
  cleanupExpired();

  const key = toUserKey(input.guildId, input.userId);
  const previousToken = latestTokenByUserKey.get(key);
  if (previousToken) {
    sessionsByToken.delete(previousToken);
  }

  const token = randomBytes(32).toString("hex");
  const now = Date.now();
  const session: VerificationSession = {
    token,
    guildId: input.guildId,
    userId: input.userId,
    createdAt: now,
    expiresAt: now + input.ttlMs,
    used: false
  };

  sessionsByToken.set(token, session);
  latestTokenByUserKey.set(key, token);

  return session;
}

export function inspectVerificationSession(input: {
  token: string;
  userId: string;
}):
  | { ok: true; session: VerificationSession }
  | { ok: false; reason: SessionValidationReason } {
  cleanupExpired();

  const session = sessionsByToken.get(input.token);
  if (!session) {
    return { ok: false, reason: "not_found" };
  }

  if (session.used) {
    return { ok: false, reason: "used" };
  }

  if (session.expiresAt <= Date.now()) {
    sessionsByToken.delete(input.token);
    return { ok: false, reason: "expired" };
  }

  if (session.userId !== input.userId) {
    return { ok: false, reason: "mismatch" };
  }

  return { ok: true, session };
}

export function consumeVerificationSession(input: {
  token: string;
  userId: string;
}):
  | { ok: true; session: VerificationSession }
  | { ok: false; reason: SessionValidationReason } {
  const checked = inspectVerificationSession(input);
  if (!checked.ok) {
    return checked;
  }

  checked.session.used = true;
  sessionsByToken.delete(checked.session.token);

  const key = toUserKey(checked.session.guildId, checked.session.userId);
  const latestToken = latestTokenByUserKey.get(key);
  if (latestToken === checked.session.token) {
    latestTokenByUserKey.delete(key);
  }

  return checked;
}
