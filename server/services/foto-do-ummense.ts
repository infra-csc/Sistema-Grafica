// ─────────────────────────────────────────────────────────────────────────────
// A FOTO DO UMMENSE em disco (shared/dados/ummense-eventos.json), lida pelo
// servidor. O arquivo é gerado por scripts/importar-ummense.mjs e vai no
// repositório; o servidor o relê quando ele muda (mtime) — atualizar a foto
// não pede reinício nem migração.
//
// Lido do process.cwd(), como o global-quota-rules.json: o servidor roda da
// raiz do repositório (dev e Replit), e o bundle do esbuild não carrega JSON
// solto.
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync, statSync } from "fs";
import path from "path";
import type { FotoDoUmmense } from "@shared/eventos-sugeridos";

export const ARQUIVO_DA_FOTO = path.join(process.cwd(), "shared", "dados", "ummense-eventos.json");

let cache: { mtimeMs: number; foto: FotoDoUmmense } | null = null;

/** A foto, ou null quando o arquivo não existe ou não tem a forma esperada. */
export function lerFotoDoUmmense(arquivo = ARQUIVO_DA_FOTO): FotoDoUmmense | null {
  let mtimeMs: number;
  try {
    mtimeMs = statSync(arquivo).mtimeMs;
  } catch {
    return null;
  }
  if (cache && cache.mtimeMs === mtimeMs && arquivo === ARQUIVO_DA_FOTO) return cache.foto;
  try {
    const cru = JSON.parse(readFileSync(arquivo, "utf8")) as Partial<FotoDoUmmense>;
    if (!cru || typeof cru.fotoDe !== "string" || !Array.isArray(cru.eventos)) return null;
    const foto: FotoDoUmmense = {
      fotoDe: cru.fotoDe,
      origem: typeof cru.origem === "string" ? cru.origem : "Ummense",
      eventos: cru.eventos.filter((e) => e && typeof e.id === "string" && typeof e.nome === "string" && /^\d{4}-\d{2}-\d{2}$/.test(String(e.data)))
        .map((e) => ({ ...e, tags: Array.isArray(e.tags) ? e.tags : [], patrocinadores: Array.isArray(e.patrocinadores) ? e.patrocinadores : [] })),
    };
    if (arquivo === ARQUIVO_DA_FOTO) cache = { mtimeMs, foto };
    return foto;
  } catch (erro) {
    console.error("[eventos-sugeridos] foto do Ummense ilegível:", erro);
    return null;
  }
}
