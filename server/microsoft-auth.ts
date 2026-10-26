import type { Express } from "express";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { ConfidentialClientApplication } from "@azure/msal-node";

declare module "express-session" {
  interface SessionData {
    microsoftLogin?: { state: string; nonce: string; verifier: string; createdAt: number };
  }
}

type Dependencies = {
  findUser: (email: string) => Promise<string | null>;
  issueExchange: (userId: string) => Promise<string>;
};

export function microsoftConfig(env = process.env) {
  const tenant = env.MICROSOFT_TENANT_ID;
  const clientId = env.MICROSOFT_CLIENT_ID;
  const clientSecret = env.MICROSOFT_CLIENT_SECRET;
  const redirectUri = env.MICROSOFT_REDIRECT_URI;
  if (!tenant || !clientId || !clientSecret || !redirectUri) return null;
  const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!guid.test(tenant) || !guid.test(clientId)) return null;
  try {
    const url = new URL(redirectUri);
    if (url.protocol !== "https:" || url.pathname !== "/api/auth/microsoft/callback" || url.search || url.hash || url.username || url.password) return null;
  } catch { return null; }
  return { tenant, clientId, clientSecret, redirectUri };
}

function sameState(a: string, b: string) {
  const x = Buffer.from(a); const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function reportFailure(stage: string, error: unknown) {
  const code = (error as { errorCode?: unknown })?.errorCode;
  const safeCode = typeof code === "string" && /^[a-z0-9_]+$/i.test(code) ? code : "request_failed";
  console.error(`[microsoft-auth] ${stage}: ${safeCode}`);
}

export function registerMicrosoftAuth(app: Express, dependencies: Dependencies) {
  const config = microsoftConfig();
  const client = () => new ConfidentialClientApplication({ auth: {
    clientId: config!.clientId,
    clientSecret: config!.clientSecret,
    authority: `https://login.microsoftonline.com/${config!.tenant}`,
  } });
  app.get("/api/auth/microsoft/status", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json({ enabled: config !== null });
  });
  app.get("/api/auth/microsoft", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!config) return res.redirect("/login?error=microsoft_not_configured");
    try {
      const attempt = {
        state: randomBytes(32).toString("base64url"),
        nonce: randomBytes(32).toString("base64url"),
        verifier: randomBytes(48).toString("base64url"), createdAt: Date.now(),
      };
      const url = await client().getAuthCodeUrl({
        scopes: ["openid", "profile", "email", "User.Read"], redirectUri: config.redirectUri,
        state: attempt.state, nonce: attempt.nonce,
        codeChallenge: createHash("sha256").update(attempt.verifier).digest("base64url"),
        codeChallengeMethod: "S256", responseMode: "query",
      });
      req.session.microsoftLogin = attempt;
      await new Promise<void>((resolve, reject) => req.session.save(e => e ? reject(e) : resolve()));
      return res.redirect(url);
    } catch (error) {
      reportFailure("authorize", error);
      return res.redirect("/login?error=microsoft_failed");
    }
  });
  app.get("/api/auth/microsoft/callback", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    if (!config) return res.redirect("/login?error=microsoft_not_configured");
    const attempt = req.session.microsoftLogin;
    const state = typeof req.query.state === "string" ? req.query.state : "";
    if (!attempt || !sameState(state, attempt.state) || Date.now() - attempt.createdAt > 10 * 60_000) {
      return res.redirect("/login?error=microsoft_invalid_state");
    }
    try {
      // Consumir antes da troca: callback nao pode reutilizar o mesmo estado.
      delete req.session.microsoftLogin;
      await new Promise<void>((resolve, reject) => req.session.save(e => e ? reject(e) : resolve()));
      if (req.query.error) return res.redirect("/login?error=microsoft_cancelled");
      if (typeof req.query.code !== "string") return res.redirect("/login?error=microsoft_failed");
      const token = await client().acquireTokenByCode({
        code: req.query.code, scopes: ["openid", "profile", "email", "User.Read"],
        redirectUri: config.redirectUri, codeVerifier: attempt.verifier, nonce: attempt.nonce,
      });
      const claims = token?.idTokenClaims as { tid?: string; nonce?: string; oid?: string } | undefined;
      if (!token?.accessToken || claims?.tid?.toLowerCase() !== config.tenant.toLowerCase() || claims.nonce !== attempt.nonce) {
        console.error("[microsoft-auth] identity_claims_mismatch");
        return res.redirect("/login?error=microsoft_failed");
      }
      // Identidade vem do Graph autenticado, nunca de e-mail enviado pelo navegador.
      const response = await fetch("https://graph.microsoft.com/v1.0/me?$select=id,mail,userPrincipalName", {
        headers: { Authorization: `Bearer ${token.accessToken}` }, signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error("graph_identity_failed");
      const identity = await response.json() as { id?: string; mail?: string; userPrincipalName?: string };
      if (!identity.id || identity.id !== claims.oid) throw new Error("identity_mismatch");
      const email = identity.mail || identity.userPrincipalName;
      if (typeof email !== "string" || !email.includes("@")) throw new Error("identity_without_email");
      const userId = await dependencies.findUser(email);
      if (!userId) return res.redirect("/login?error=sso_user_not_found");
      const exchange = await dependencies.issueExchange(userId);
      return res.redirect(`/?sso_exchange=${encodeURIComponent(exchange)}`);
    } catch (error) {
      // Nao registrar code, tokens ou respostas completas da Microsoft.
      reportFailure("callback", error);
      return res.redirect("/login?error=microsoft_failed");
    }
  });
}
