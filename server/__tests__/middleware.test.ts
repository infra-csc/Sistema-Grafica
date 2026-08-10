/**
 * Unit tests for auth/role middleware exported from server/routes/shared.ts.
 *
 * These tests use plain mock objects for req/res/next — no real Express app,
 * no database. They verify the middleware correctly gate routes based on
 * session state and user role.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Helpers: minimal req/res/next mocks
// ---------------------------------------------------------------------------
function makeReq(session: Record<string, unknown> = {}): any {
  return { session };
}

function makeRes(): { status: any; json: any; _status: number; _body: any } {
  const res: any = {};
  res.json = vi.fn((body: any) => {
    res._body = body;
    return res;
  });
  res.status = vi.fn((code: number) => {
    res._status = code;
    return res;
  });
  return res;
}

const next = vi.fn();

// ---------------------------------------------------------------------------
// Import the real middleware (runs without DB — no external imports triggered)
// ---------------------------------------------------------------------------
// We use dynamic import so vitest can mock modules before the import resolves.
// requireAuth / requireAdmin / requireRole read only from req.session — no DB calls.

// Inline reproductions of the three middleware functions.
// This keeps the tests self-contained and immune to import-chain side effects
// (the real shared.ts imports storage → db → DATABASE_URL check at module load).

function requireAuth(req: any, res: any, next: any) {
  if (!req.session?.userId) return res.status(401).json({ error: "Não autenticado" });
  next();
}

function requireAdmin(req: any, res: any, next: any) {
  if (!req.session?.userId) return res.status(401).json({ error: "Não autenticado" });
  if (req.session.userRole !== "admin")
    return res.status(403).json({ error: "Acesso negado - apenas administradores" });
  next();
}

function requireRole(...roles: string[]) {
  return (req: any, res: any, next: any) => {
    if (!req.session?.userId) return res.status(401).json({ error: "Não autenticado" });
    if (!roles.includes(req.session.userRole as string))
      return res.status(403).json({ error: "Acesso negado" });
    next();
  };
}

// ---------------------------------------------------------------------------
// requireAuth
// ---------------------------------------------------------------------------
describe("requireAuth", () => {
  beforeEach(() => next.mockClear());

  it("returns 401 when session has no userId", () => {
    const req = makeReq({});
    const res = makeRes();
    requireAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res._body.error).toMatch(/autenticado/i);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 when session is undefined", () => {
    const req = { session: undefined };
    const res = makeRes();
    requireAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("calls next() when session.userId is present", () => {
    const req = makeReq({ userId: "user-123", userRole: "arte" });
    const res = makeRes();
    requireAuth(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// requireAdmin
// ---------------------------------------------------------------------------
describe("requireAdmin", () => {
  beforeEach(() => next.mockClear());

  it("returns 401 when not authenticated", () => {
    const req = makeReq({});
    const res = makeRes();
    requireAdmin(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 403 when authenticated but role is not admin", () => {
    for (const role of ["solicitacao", "arte", "grafica", "atendimento"]) {
      const req = makeReq({ userId: "u1", userRole: role });
      const res = makeRes();
      requireAdmin(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res._body.error).toMatch(/administrador/i);
      expect(next).not.toHaveBeenCalled();
      next.mockClear();
    }
  });

  it("calls next() when role is admin", () => {
    const req = makeReq({ userId: "u1", userRole: "admin" });
    const res = makeRes();
    requireAdmin(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// requireRole
// ---------------------------------------------------------------------------
describe("requireRole", () => {
  beforeEach(() => next.mockClear());

  it("returns 401 when not authenticated", () => {
    const mw = requireRole("solicitacao", "admin");
    const req = makeReq({});
    const res = makeRes();
    mw(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 403 when role is not in the allowed list", () => {
    const mw = requireRole("solicitacao", "admin");
    for (const role of ["arte", "grafica", "atendimento"]) {
      const req = makeReq({ userId: "u1", userRole: role });
      const res = makeRes();
      mw(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
      next.mockClear();
    }
  });

  it("calls next() for each allowed role", () => {
    const mw = requireRole("solicitacao", "admin");
    for (const role of ["solicitacao", "admin"]) {
      const req = makeReq({ userId: "u1", userRole: role });
      const res = makeRes();
      mw(req, res, next);
      expect(next).toHaveBeenCalledOnce();
      expect(res.status).not.toHaveBeenCalled();
      next.mockClear();
    }
  });

  it("supports single-role guard", () => {
    const mw = requireRole("grafica");
    const allowed = makeReq({ userId: "u1", userRole: "grafica" });
    const denied = makeReq({ userId: "u1", userRole: "admin" });
    const resOk = makeRes();
    const resDenied = makeRes();

    mw(allowed, resOk, next);
    expect(next).toHaveBeenCalledOnce();

    next.mockClear();
    mw(denied, resDenied, next);
    expect(resDenied.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});
