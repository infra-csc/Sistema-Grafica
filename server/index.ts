import express, { type Request, Response, NextFunction } from "express";
import compression from "compression";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomBytes } from "crypto";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { pool } from "./db";
import { writeRateLimiter } from "./routes/shared";
import { sessionMiddleware, SESSION_SECRET } from "./session";

// SESSION_SECRET é validado (fail-fast) em ./session. Reutilizado aqui como
// fallback do segredo de SSO quando SSO_SECRET não é definido.
const SSO_SECRET = process.env.SSO_SECRET || SESSION_SECRET;

// Ensure no SSO user is stuck with mustChangePassword=true (all access via Microsoft)
async function fixSsoMustChangePassword() {
  await pool.query("UPDATE users SET must_change_password = false WHERE must_change_password = true");
}

// Itens padrão de Adesivo Pódio foram cadastrados sem material — corrige em prod
async function fixStandardItemsMissingMaterial() {
  await pool.query(
    `UPDATE standard_items SET material = 'Adesivo'
     WHERE name IN ('Adesivo Pódio', 'Adesivo Pódio nº 1', 'Adesivo Pódio nº 2', 'Adesivo Pódio nº 3', 'Adesivo')
       AND (material IS NULL OR material = '')`
  );
}

// Seed default users only if they don't already exist. Never overwrite an
// existing user's password_hash on restart — that would silently reset
// credentials for accounts that may have since changed their password.
async function seedUsers() {
  // SEED_PASSWORD must be provided via environment variable — never hardcode
  // credentials in source code (which is in a public repository).
  const seedPassword = process.env.SEED_PASSWORD;
  if (!seedPassword) {
    log("seed-users: SEED_PASSWORD not set — skipping password-based seed (SSO users are unaffected)");
    return;
  }

  const users = [
    { name: "Administrador NORTE",                email: "admin@norte.com",                   role: "admin",       mustChange: true  },
    { name: "Pedro Telles",                       email: "pedro@nortemkt.com",                role: "admin",       mustChange: false },
    { name: "Guilherme Coelho do Nascimento",     email: "guilherme.nascimento@nortemkt.com", role: "admin",       mustChange: false },
    { name: "Agatha Nadolsky",                    email: "agatha.nadolsky@nortemkt.com",       role: "atendimento", mustChange: false },
    { name: "Fernanda Sanhudo de Oliveira Penna", email: "fernanda.oliveira@ttkmarketing",     role: "solicitacao", mustChange: false },
    { name: "Jan Felipe",                         email: "jan.felipe@nortemkt.com",             role: "arte",        mustChange: false },
    { name: "Enzo Pedote Ascoli",                 email: "enzo.ascoli@nortemkt.com",            role: "atendimento", mustChange: false },
  ];
  const hash = await bcrypt.hash(seedPassword, 10);
  for (const u of users) {
    await pool.query(
      `INSERT INTO users (name, email, password_hash, role, must_change_password)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (email) DO NOTHING`,
      [u.name, u.email, hash, u.role, u.mustChange]
    );
  }
  log("seed-users: done");
}

// ── Rede de segurança do processo ────────────────────────────────────────────
// Sem estes handlers, uma Promise rejeitada sem catch (ou uma exceção lançada
// fora do ciclo de request) derruba o processo Node SILENCIOSAMENTE — o servidor
// some e o único rastro é o restart do Replit, sem log da causa. Aqui logamos a
// causa e mantemos o servidor de pé. (Compromisso conhecido: continuar após um
// uncaughtException pode deixar estado inconsistente; para um app interno,
// priorizamos disponibilidade + visibilidade. Se preferir reinício limpo,
// troque por process.exit(1) e deixe o Replit reiniciar.)
process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err);
});

const app = express();
app.set("trust proxy", 1); // Replit sits behind a reverse proxy — needed for secure cookies
// Compressão gzip: as listagens (itens, audit-logs) são JSON grande e repetitivo,
// que comprime ~10x. Sem isto cada navegação baixava megabytes.
app.use(compression());
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: false, limit: "2mb" }));

// Session configuration (definida em ./session e compartilhada com o
// handshake do WebSocket em ./routes).
app.use(sessionMiddleware);

// ── Security headers ─────────────────────────────────────────────────────────
// Applied to every response. Keeps the browser from doing dangerous things
// with our content (sniffing MIME types, embedding in iframes, etc.).
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("X-DNS-Prefetch-Control", "off");
  // CSP — restricts which sources can load scripts/styles/frames.
  // 'unsafe-inline' is required for React (inline event handlers + style props).
  // Tighten to nonce-based in a future hardening pass if XSS risk increases.
  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' wss:",
      "frame-ancestors 'none'",
    ].join("; ")
  );
  // HSTS — force HTTPS for 1 year (production only; dev uses HTTP).
  if (process.env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
});

// ── CSRF protection ──────────────────────────────────────────────────────────
// For state-mutating requests, verify the Origin header matches the server host.
// sameSite: 'lax' already blocks most cross-site CSRF; this is a second layer.
// SSO exchange is exempt — it comes from the same app origin anyway.
const CSRF_EXEMPT = new Set([
  "/api/auth/sso-exchange", // SSO is same-origin AJAX; exempt to keep the flow clear
]);
app.use((req: Request, res: Response, next: NextFunction) => {
  const safe = ["GET", "HEAD", "OPTIONS", "TRACE"];
  if (safe.includes(req.method)) return next();
  if (!req.path.startsWith("/api/")) return next();
  if (CSRF_EXEMPT.has(req.path)) return next();

  const origin = req.headers.origin as string | undefined;
  const host   = req.headers.host   as string | undefined;

  // In development there is no Origin header on same-origin fetch — allow.
  if (!origin) return next();

  try {
    const originHost = new URL(origin).host;
    if (originHost === host) return next();
    log(`[CSRF] blocked ${req.method} ${req.path} — origin ${origin} ≠ host ${host}`);
    return res.status(403).json({ error: "Requisição bloqueada por política de segurança" });
  } catch {
    log(`[CSRF] blocked ${req.method} ${req.path} — invalid Origin: ${origin}`);
    return res.status(403).json({ error: "Requisição bloqueada por política de segurança" });
  }
});

// ── Write rate limiter ───────────────────────────────────────────────────────
// Applied globally to all API mutation requests (POST/PUT/PATCH/DELETE).
// Protects against automated scripts; normal human usage never approaches the limit.
const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
app.use((req: Request, res: Response, next: NextFunction) => {
  if (!WRITE_METHODS.has(req.method)) return next();
  if (!req.path.startsWith("/api/")) return next();
  return writeRateLimiter(req, res, next);
});

// ── Portal SSO ───────────────────────────────────────────────────────────────
// One-time exchange tokens: { userId, userName, userRole, expires }
const ssoTokens = new Map<string, { userId: string; userName: string; userRole: string; expires: number }>();
setInterval(() => { const now = Date.now(); ssoTokens.forEach((v, k) => { if (v.expires < now) ssoTokens.delete(k); }); }, 30_000);

// Step 1 — Portal redirects here with ?portal_sso=<JWT>&portal_return=<URL>
// We validate the JWT, create a one-time token, and redirect to /?sso_exchange=TOKEN
app.use(async (req: Request, res: Response, next: NextFunction) => {
  const token = req.query.portal_sso as string | undefined;
  if (!token) return next();

  try {
    const payload = jwt.verify(token, SSO_SECRET, { issuer: "norte-portal" }) as { email?: string };
    if (!payload?.email) { log("[SSO] payload sem email"); return res.redirect("/login?error=sso_invalid_payload"); }

    const { rows } = await pool.query<{ id: string; name: string; role: string }>(
      "SELECT id, name, role FROM users WHERE email = $1 LIMIT 1",
      [payload.email]
    );
    const user = rows[0];
    if (!user) { log(`[SSO] usuário não encontrado: ${payload.email}`); return res.redirect("/login?error=sso_user_not_found"); }

    // Create one-time exchange token (valid 60s)
    const exchangeToken = randomBytes(32).toString("hex");
    ssoTokens.set(exchangeToken, { userId: user.id, userName: user.name, userRole: user.role, expires: Date.now() + 60_000 });

    log(`[SSO] exchange token gerado para: ${payload.email}`);
    return res.redirect(`/?sso_exchange=${exchangeToken}`);
  } catch (err: any) {
    log(`[SSO] token inválido: ${err.message}`);
    return res.redirect("/login?error=sso_invalid_token");
  }
});

// Step 2 — Frontend calls POST /api/auth/sso-exchange (same-origin AJAX)
// Server creates a proper session and returns the user — cookie is set same-origin, no SameSite issues
app.post("/api/auth/sso-exchange", async (req: Request, res: Response) => {
  const { exchangeToken } = req.body as { exchangeToken?: string };
  if (!exchangeToken) return res.status(400).json({ error: "Token ausente" });

  const entry = ssoTokens.get(exchangeToken);
  if (!entry || entry.expires < Date.now()) {
    ssoTokens.delete(exchangeToken);
    return res.status(401).json({ error: "Token expirado ou inválido" });
  }
  ssoTokens.delete(exchangeToken); // single-use

  // SSO users authenticate via Microsoft — clear any pending password-change requirement
  await pool.query("UPDATE users SET must_change_password = false WHERE id = $1", [entry.userId]);

  // Fetch full user data so the frontend can hydrate auth state without a second request
  const { rows: fullUser } = await pool.query<{
    id: string; name: string; email: string; role: string; must_change_password: boolean;
  }>("SELECT id, name, email, role, must_change_password FROM users WHERE id = $1 LIMIT 1", [entry.userId]);
  if (!fullUser[0]) return res.status(404).json({ error: "Usuário não encontrado" });

  // Regenerate session ID before writing auth data — prevents session fixation.
  await new Promise<void>((resolve, reject) =>
    req.session.regenerate(err => err ? reject(err) : resolve())
  );
  req.session.userId   = entry.userId;
  req.session.userName = entry.userName;
  req.session.userRole = entry.userRole;
  await new Promise<void>((resolve, reject) => req.session.save(e => e ? reject(e) : resolve()));

  log(`[SSO] sessão criada via exchange para userId: ${entry.userId}`);
  res.json({
    id: fullUser[0].id,
    name: fullUser[0].name,
    email: fullUser[0].email,
    role: fullUser[0].role,
    mustChangePassword: fullUser[0].must_change_password,
  });
});
// ────────────────────────────────────────────────────────────────────────────

// Routes whose response bodies must never be logged (contain credentials,
// password hashes, or otherwise sensitive account data).
const SENSITIVE_LOG_PATHS = [
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/change-password",
  "/api/auth/sso-exchange",
  "/api/users",
];
function isSensitiveLogPath(path: string): boolean {
  return SENSITIVE_LOG_PATHS.some((p) => path === p || path.startsWith(`${p}/`));
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse && !isSensitiveLogPath(path)) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await seedUsers();
  await fixSsoMustChangePassword();
  await fixStandardItemsMissingMaterial();
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    // Loga o erro completo no servidor sempre.
    console.error(err);
    // Se a resposta já começou a ser enviada, não dá para reescrever o status/
    // corpo — delega ao handler padrão do Express (senão dá "Cannot set headers
    // after they are sent").
    if (res.headersSent) return next(err);

    const status = err.status || err.statusCode || 500;
    // 5xx não expõe detalhe interno (constraint do Postgres, stack) ao cliente;
    // erros de cliente (4xx com mensagem própria) podem devolver a mensagem.
    // Chave `error` — consistente com o resto da API (antes era `message`, e o
    // cliente que lia `.error` recebia undefined).
    const message = status >= 500
      ? "Erro interno do servidor"
      : (err.message || "Erro na requisição");
    res.status(status).json({ error: message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });
})();
