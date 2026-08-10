/**
 * Unit tests for the CSRF origin-check middleware added in Phase 3.
 *
 * The middleware lives in server/index.ts. Its logic is:
 *   - Skip safe methods (GET, HEAD, OPTIONS, TRACE)
 *   - Skip non-API paths
 *   - Skip explicitly exempt paths
 *   - For everything else: if Origin header is present and its host ≠ the
 *     server host, return 403.
 *
 * We reproduce the logic here as a pure function so it can be tested without
 * booting the Express app or touching the database.
 */
import { describe, it, expect, vi } from "vitest";

// ---------------------------------------------------------------------------
// Extracted CSRF logic (mirrors server/index.ts exactly)
// ---------------------------------------------------------------------------
const CSRF_EXEMPT = new Set(["/api/auth/sso-exchange"]);

function csrfCheck(
  method: string,
  path: string,
  origin: string | undefined,
  host: string | undefined
): { allowed: boolean; reason?: string } {
  const SAFE = ["GET", "HEAD", "OPTIONS", "TRACE"];
  if (SAFE.includes(method)) return { allowed: true, reason: "safe method" };
  if (!path.startsWith("/api/")) return { allowed: true, reason: "non-api path" };
  if (CSRF_EXEMPT.has(path)) return { allowed: true, reason: "exempt path" };
  if (!origin) return { allowed: true, reason: "no origin header (same-origin fetch in dev)" };

  try {
    const originHost = new URL(origin).host;
    if (originHost === host) return { allowed: true, reason: "same host" };
    return { allowed: false, reason: `origin ${origin} ≠ host ${host}` };
  } catch {
    return { allowed: false, reason: `invalid origin: ${origin}` };
  }
}

// ---------------------------------------------------------------------------
// Safe HTTP methods — always pass
// ---------------------------------------------------------------------------
describe("CSRF: safe methods", () => {
  for (const method of ["GET", "HEAD", "OPTIONS", "TRACE"]) {
    it(`allows ${method} regardless of origin`, () => {
      expect(csrfCheck(method, "/api/items", "https://evil.com", "myapp.replit.dev").allowed).toBe(true);
    });
  }
});

// ---------------------------------------------------------------------------
// Non-API paths — always pass (static assets, Vite HMR, etc.)
// ---------------------------------------------------------------------------
describe("CSRF: non-API paths", () => {
  it("allows POST to non-api paths", () => {
    expect(csrfCheck("POST", "/assets/app.js", "https://evil.com", "myapp.replit.dev").allowed).toBe(true);
    expect(csrfCheck("POST", "/", "https://evil.com", "myapp.replit.dev").allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Exempt paths
// ---------------------------------------------------------------------------
describe("CSRF: exempt paths", () => {
  it("allows /api/auth/sso-exchange even with a foreign origin", () => {
    const result = csrfCheck("POST", "/api/auth/sso-exchange", "https://portal.norte.com", "app.norte.com");
    expect(result.allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Same-origin requests — always allowed
// ---------------------------------------------------------------------------
describe("CSRF: same-origin mutations", () => {
  it("allows POST when Origin host matches the server host", () => {
    const result = csrfCheck(
      "POST",
      "/api/items",
      "https://myapp.replit.dev",
      "myapp.replit.dev"
    );
    expect(result.allowed).toBe(true);
  });

  it("allows PATCH/PUT/DELETE from same origin", () => {
    for (const method of ["PATCH", "PUT", "DELETE"]) {
      expect(
        csrfCheck(method, "/api/items/123", "https://myapp.replit.dev", "myapp.replit.dev").allowed
      ).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Cross-origin mutations — must be blocked
// ---------------------------------------------------------------------------
describe("CSRF: cross-origin mutations", () => {
  it("blocks POST from a different origin", () => {
    const result = csrfCheck("POST", "/api/items", "https://evil.com", "myapp.replit.dev");
    expect(result.allowed).toBe(false);
  });

  it("blocks PATCH/PUT/DELETE from a different origin", () => {
    for (const method of ["PATCH", "PUT", "DELETE"]) {
      expect(
        csrfCheck(method, "/api/events/123", "https://attacker.io", "myapp.replit.dev").allowed
      ).toBe(false);
    }
  });

  it("blocks requests with a malformed Origin header", () => {
    const result = csrfCheck("POST", "/api/items", "not-a-url", "myapp.replit.dev");
    expect(result.allowed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Missing Origin header — allowed (same-origin dev fetch sends no Origin)
// ---------------------------------------------------------------------------
describe("CSRF: missing Origin header", () => {
  it("allows mutations with no Origin header (same-origin in-browser fetch)", () => {
    expect(csrfCheck("POST", "/api/items", undefined, "myapp.replit.dev").allowed).toBe(true);
    expect(csrfCheck("DELETE", "/api/events/x", undefined, "myapp.replit.dev").allowed).toBe(true);
  });
});
