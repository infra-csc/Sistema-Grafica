// ─────────────────────────────────────────────────────────────────────────────
// A VERSÃO DO APP, DITA EM TODA RESPOSTA DA API (21/09).
//
// PORQUÊ: a Gráfica e o Atendimento deixam a aba aberta o dia inteiro. Depois
// de um Republicar, a aba velha segue rodando o JavaScript ANTIGO contra o
// servidor novo — sem os status novos, sem as telas novas — e ninguém avisa.
// O servidor manda `X-App-Versao` em toda resposta /api/*; o cliente guarda o
// primeiro valor que viu e, se mudar, oferece "Recarregar" (lib/versao-do-app).
//
// O VALOR é o hash do index.html do build: ele embute os nomes com hash dos
// chunks, então muda exatamente quando o CLIENTE muda — e é igual em todas as
// instâncias do mesmo deploy (o instante de início do processo daria um valor
// por instância, e a faixa piscaria atrás de um balanceador). Reinício do
// servidor sem build novo não incomoda ninguém. Em desenvolvimento (sem
// build) cai no instante de início: reiniciou o dev server, a aba avisa.
// ─────────────────────────────────────────────────────────────────────────────
import { createHash } from "crypto";
import fs from "fs";
import path from "path";
import type { Request, Response, NextFunction } from "express";

export const CABECALHO_DA_VERSAO = "X-App-Versao";

/** Puro e testável: o conteúdo do index.html (ou null) → a versão. */
export function calcularVersao(indexHtml: string | null, inicioDoProcesso: number): string {
  if (indexHtml) return createHash("sha256").update(indexHtml).digest("hex").slice(0, 12);
  return `inicio-${inicioDoProcesso}`;
}

function lerIndexDoBuild(): string | null {
  try {
    return fs.readFileSync(path.resolve(import.meta.dirname, "public", "index.html"), "utf8");
  } catch {
    return null; // desenvolvimento: o Vite serve o index, não há build em disco
  }
}

export const VERSAO_DO_APP = calcularVersao(
  process.env.NODE_ENV === "production" ? lerIndexDoBuild() : null,
  Date.now(),
);

/** Só /api/*: é o que o cliente lê; arquivo estático e upload não precisam. */
export function cabecalhoDeVersao(versao: string = VERSAO_DO_APP) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith("/api/")) res.setHeader(CABECALHO_DA_VERSAO, versao);
    next();
  };
}
