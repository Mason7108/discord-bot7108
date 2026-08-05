import type { Request, Response, NextFunction } from "express";

interface Bucket {
  resetAt: number;
  count: number;
}

const buckets = new Map<string, Bucket>();

function cleanup(now: number): void {
  if (buckets.size < 2000) {
    return;
  }

  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
}

export function getRateLimitKey(req: Request, scope: string): string {
  const userId = req.dashboard?.user.id;
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  return `${scope}:${userId ?? ip}`;
}

export function checkRateLimit(input: {
  key: string;
  limit: number;
  windowMs: number;
  now?: number;
}): { ok: true; remaining: number; resetAt: number } | { ok: false; retryAfterSec: number; resetAt: number } {
  const now = input.now ?? Date.now();
  cleanup(now);

  const existing = buckets.get(input.key);
  if (!existing || existing.resetAt <= now) {
    const resetAt = now + input.windowMs;
    buckets.set(input.key, { count: 1, resetAt });
    return { ok: true, remaining: input.limit - 1, resetAt };
  }

  if (existing.count >= input.limit) {
    return {
      ok: false,
      retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - now) / 1_000)),
      resetAt: existing.resetAt
    };
  }

  existing.count += 1;
  return { ok: true, remaining: input.limit - existing.count, resetAt: existing.resetAt };
}

export function rateLimit(scope: string, limit: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = checkRateLimit({
      key: getRateLimitKey(req, scope),
      limit,
      windowMs
    });

    if (!result.ok) {
      res.setHeader("Retry-After", String(result.retryAfterSec));
      res.status(429).json({ ok: false, error: "Too many requests. Try again soon." });
      return;
    }

    res.setHeader("X-RateLimit-Remaining", String(result.remaining));
    next();
  };
}

export function resetRateLimitBucketsForTests(): void {
  buckets.clear();
}
