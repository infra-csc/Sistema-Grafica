/**
 * Unit tests for the in-memory rate limiter (createRateLimiter) from
 * server/routes/shared.ts.
 *
 * We reproduce the limiter logic as a pure function — same algorithm,
 * no Express dependency — to test it in isolation.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Extracted rate-limiter logic (mirrors shared.ts createRateLimiter exactly)
// ---------------------------------------------------------------------------
interface RateLimiterOpts {
  windowMs: number;
  max: number;
  message: string;
}

function createRateLimiter(opts: RateLimiterOpts) {
  const hits = new Map<string, { count: number; resetAt: number }>();

  return function check(ip: string, nowMs: number): { allowed: boolean; message?: string } {
    const entry = hits.get(ip);

    if (!entry || entry.resetAt < nowMs) {
      hits.set(ip, { count: 1, resetAt: nowMs + opts.windowMs });
      return { allowed: true };
    }

    entry.count += 1;
    if (entry.count > opts.max) {
      return { allowed: false, message: opts.message };
    }
    return { allowed: true };
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("rate limiter", () => {
  const windowMs = 60_000; // 1 minute
  const max = 3;
  const message = "Too many requests";

  it("allows requests up to the limit", () => {
    const limiter = createRateLimiter({ windowMs, max, message });
    const now = Date.now();
    for (let i = 0; i < max; i++) {
      expect(limiter("127.0.0.1", now).allowed).toBe(true);
    }
  });

  it("blocks requests beyond the limit within the window", () => {
    const limiter = createRateLimiter({ windowMs, max, message });
    const now = Date.now();
    for (let i = 0; i < max; i++) limiter("127.0.0.1", now);
    const result = limiter("127.0.0.1", now);
    expect(result.allowed).toBe(false);
    expect(result.message).toBe(message);
  });

  it("resets the counter after the window expires", () => {
    const limiter = createRateLimiter({ windowMs, max, message });
    const t0 = 1_000_000;
    // Exhaust the limit
    for (let i = 0; i <= max; i++) limiter("127.0.0.1", t0);
    // After the window, a new request should be allowed
    const t1 = t0 + windowMs + 1;
    expect(limiter("127.0.0.1", t1).allowed).toBe(true);
  });

  it("tracks different IPs independently", () => {
    const limiter = createRateLimiter({ windowMs, max, message });
    const now = Date.now();
    // Exhaust IP A
    for (let i = 0; i <= max; i++) limiter("1.1.1.1", now);
    // IP B should still be allowed
    expect(limiter("2.2.2.2", now).allowed).toBe(true);
  });

  it("first request in a new window always succeeds (count resets to 1)", () => {
    const limiter = createRateLimiter({ windowMs, max: 1, message });
    const t0 = 0;
    limiter("127.0.0.1", t0);           // count = 1 — allowed
    limiter("127.0.0.1", t0);           // count = 2 — blocked (max=1)
    // New window
    const t1 = t0 + windowMs + 1;
    expect(limiter("127.0.0.1", t1).allowed).toBe(true); // count resets to 1
  });
});
