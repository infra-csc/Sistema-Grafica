// ─────────────────────────────────────────────────────────────────────────────
// CABEÇALHOS DE SEGURANÇA de toda resposta, e a CSP.
//
// script-src SEM 'unsafe-inline' em produção: o index.html do build só tem
// <script src="/assets/…"> (nenhum plugin do Vite injeta script inline no
// build — o overlay de erro e o preâmbulo do React Refresh são só do `serve`),
// e o app não escreve <script> inline em lugar nenhum (a exportação de PDF
// imprime pela janela que abriu, não por script dentro do popup — o popup
// herda esta CSP). Assim um HTML injetado não executa.
//
// Em desenvolvimento o Vite injeta scripts inline no index.html (preâmbulo do
// React Refresh, overlay de erro do Replit); sem 'unsafe-inline' a tela não
// sobe. Só no dev.
//
// style-src segue com 'unsafe-inline': o app usa `style={…}` em toda tela.
// ─────────────────────────────────────────────────────────────────────────────
import type { Request, Response, NextFunction } from "express";

export function politicaDeConteudo(emProducao: boolean): string {
  return [
    "default-src 'self'",
    emProducao ? "script-src 'self'" : "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https://fonts.gstatic.com",
    "connect-src 'self' wss:",
    // Sem <base> de fora: um HTML injetado não redireciona os caminhos relativos.
    "base-uri 'self'",
    // Dev: o painel de preview do Replit embute o app. Produção: ninguém embute.
    emProducao ? "frame-ancestors 'none'" : "frame-ancestors 'self' https://*.replit.dev https://*.replit.app https://*.repl.co",
  ].join("; ");
}

export function cabecalhosDeSeguranca(emProducao = process.env.NODE_ENV === "production") {
  const csp = politicaDeConteudo(emProducao);
  return (_req: Request, res: Response, next: NextFunction) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    res.setHeader("Referrer-Policy", "same-origin");
    res.setHeader("X-DNS-Prefetch-Control", "off");
    // Sistema interno: fora de buscadores (o client/index.html repete em <meta>).
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    res.setHeader("Content-Security-Policy", csp);
    if (emProducao) {
      res.setHeader("X-Frame-Options", "DENY");
      // HTTPS por 1 ano (o dev roda em HTTP).
      res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }
    next();
  };
}
