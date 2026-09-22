// ─────────────────────────────────────────────────────────────────────────────
// URL SEGURA — a régua única para links que o usuário grava e a tela vira href
// (referência, book, arquivo final). Um `javascript:` gravado ali executaria
// no navegador de quem clicasse, com a sessão dele.
//
// Aceita: http(s), caminhos do próprio app (`/objects/…`), caminho de rede
// (`\\servidor\pasta`) e caminho com letra de unidade (`X:\…`). Texto sem
// esquema (ex.: "drive.google.com/…") também passa: vira link relativo, sem
// risco. Recusa qualquer outro esquema: javascript:, data:, vbscript:, file:…
// ─────────────────────────────────────────────────────────────────────────────

const ESQUEMA = /^([a-z][a-z0-9+.-]*):/i;

/** O navegador ignora espaço/controle no começo e tab/quebra no meio do
 *  esquema ("java\tscript:" executa) — a checagem olha o texto como ele lê. */
function comoONavegadorLe(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/^[\u0000-\u0020]+/, "").replace(/[\t\n\r]/g, "");
}

export function urlSegura(s: string | null | undefined): boolean {
  if (typeof s !== "string") return false;
  const t = comoONavegadorLe(s);
  if (!t) return false;
  if (t.startsWith("\\\\")) return true; // caminho de rede
  if (/^[a-z]:[\\/]/i.test(t)) return true; // X:\pasta ou X:/pasta
  const esquema = ESQUEMA.exec(t);
  if (!esquema) return true; // relativo ou sem esquema
  const nome = esquema[1].toLowerCase();
  return nome === "http" || nome === "https";
}

/** Para `href`: devolve o próprio texto quando seguro, senão `undefined`
 *  (o link fica inerte em vez de executar algo). */
export function hrefSeguro(s: string | null | undefined): string | undefined {
  return typeof s === "string" && urlSegura(s) ? s : undefined;
}

/** Campos de link que chegam do cliente e viram href em alguma tela. */
export const CAMPOS_DE_URL = ["referenceUrl", "referenceUrls", "bookUrl", "finalFileUrl", "approvalBookUrl"] as const;

/**
 * Procura, no corpo da requisição, algum campo de link com valor inseguro.
 * Vazio/nulo passa (é o "limpar o campo"). Desce em objetos e listas (o lote e
 * a importação mandam peças dentro de arrays), com teto de profundidade.
 * Devolve o nome do campo problemático, ou null.
 */
export function campoDeUrlInseguro(corpo: unknown, profundidade = 0): string | null {
  if (profundidade > 6 || corpo === null || typeof corpo !== "object") return null;
  if (Array.isArray(corpo)) {
    for (const x of corpo) {
      const r = campoDeUrlInseguro(x, profundidade + 1);
      if (r) return r;
    }
    return null;
  }
  for (const [chave, valor] of Object.entries(corpo as Record<string, unknown>)) {
    if ((CAMPOS_DE_URL as readonly string[]).includes(chave)) {
      const valores = Array.isArray(valor) ? valor : [valor];
      for (const v of valores) {
        if (v === null || v === undefined || v === "") continue;
        if (typeof v !== "string" || !urlSegura(v)) return chave;
      }
      continue;
    }
    if (valor && typeof valor === "object") {
      const r = campoDeUrlInseguro(valor, profundidade + 1);
      if (r) return r;
    }
  }
  return null;
}
