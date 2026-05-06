import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomBytes } from "crypto";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { pool } from "./db";

const PgSession = connectPgSimple(session);

async function seedUsers() {
  const users = [
    { name: "Administrador NORTE",                email: "admin@norte.com",                   role: "admin",       mustChange: false },
    { name: "Pedro Telles",                       email: "pedro@nortemkt.com",                role: "admin",       mustChange: false },
    { name: "Guilherme Coelho do Nascimento",     email: "guilherme.nascimento@nortemkt.com", role: "admin",       mustChange: false },
    { name: "Agatha Nadolsky",                    email: "agatha.nadolsky@nortemkt.com",       role: "atendimento", mustChange: true  },
    { name: "Fernanda Sanhudo de Oliveira Penna", email: "fernanda.oliveira@ttkmarketing",     role: "solicitacao", mustChange: true  },
    { name: "Jan Felipe",                         email: "jan.felipe@nortemkt.com",             role: "arte",        mustChange: true  },
    { name: "Enzo Pedote Ascoli",                 email: "enzo.ascoli@nortemkt.com",            role: "atendimento", mustChange: true  },
  ];
  const hash = await bcrypt.hash("norte2026", 10);
  for (const u of users) {
    await pool.query(
      `INSERT INTO users (name, email, password_hash, role, must_change_password)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (email) DO UPDATE
         SET password_hash = EXCLUDED.password_hash,
             name = EXCLUDED.name,
             role = EXCLUDED.role,
             must_change_password = EXCLUDED.must_change_password`,
      [u.name, u.email, hash, u.role, u.mustChange]
    );
  }
  log("seed-users: done");
}

const app = express();
app.set("trust proxy", 1); // Replit sits behind a reverse proxy — needed for secure cookies
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Session configuration
app.use(
  session({
    store: new PgSession({
      pool,
      tableName: "session",
      createTableIfMissing: true,
    }),
    secret: process.env.SESSION_SECRET || "norte-grafica-secret-key-change-in-production",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
    },
  })
);

// ── Portal SSO ───────────────────────────────────────────────────────────────
// One-time exchange tokens: { userId, userName, userRole, expires }
const ssoTokens = new Map<string, { userId: string; userName: string; userRole: string; expires: number }>();
setInterval(() => { const now = Date.now(); ssoTokens.forEach((v, k) => { if (v.expires < now) ssoTokens.delete(k); }); }, 30_000);

// Step 1 — Portal redirects here with ?portal_sso=<JWT>&portal_return=<URL>
// We validate the JWT, create a one-time token, and redirect to /?sso_exchange=TOKEN
app.use(async (req: Request, res: Response, next: NextFunction) => {
  const token = req.query.portal_sso as string | undefined;
  if (!token) return next();

  const secret = process.env.SSO_SECRET || process.env.SESSION_SECRET || "norte-grafica-secret-key-change-in-production";

  try {
    const payload = jwt.verify(token, secret, { issuer: "norte-portal" }) as { email?: string };
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
      if (capturedJsonResponse) {
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
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
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
