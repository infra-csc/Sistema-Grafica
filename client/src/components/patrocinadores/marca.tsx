// ─────────────────────────────────────────────────────────────────────────────
// A MARCA DO PATROCINADOR — o ladrilho com as iniciais na cor dele.
//
// A cor da marca é o único dado de identidade que o cadastro tem (não há logo
// no banco). Na lista ela era uma bolinha de 8px, que some ao lado de um nome
// em negrito; aqui vira o ladrilho que o olho usa para achar a marca na lista
// — o mesmo par de tinta (10% de fundo, 30% de borda) e o mesmo texto
// escurecido até 4,5:1 (darkenToContrast) dos chips "colored" das peças.
//
// A cor é DADO do usuário, não tema: por isso o rgba calculado aqui, e não um
// token. O amarelo da paleta (#eab308) sobre a própria tinta dá 1,8:1 — o
// texto das iniciais é escurecido na matiz até passar.
// ─────────────────────────────────────────────────────────────────────────────
import { darkenToContrast, FONT, FS, FW, R, T } from "@/lib/theme";

/** "#2563eb" + 0.1 → "rgba(37,99,235,0.1)". Hex inválido cai no neutro. */
export function tinta(hex: string | null | undefined, alfa: number): string {
  const h = (hex ?? "").trim().replace("#", "");
  const cheio = h.length === 3 ? h.split("").map(c => c + c).join("") : h;
  if (!/^[0-9a-fA-F]{6}$/.test(cheio)) return `rgba(168,162,158,${alfa})`;
  const n = parseInt(cheio, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alfa})`;
}

/** Hex válido de 3 ou 6 dígitos? (o mesmo regex do schema do formulário) */
export const corValida = (c: string | null | undefined) => /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test((c ?? "").trim());

/** Duas iniciais, ignorando "de/do/da" e o que vem entre parênteses. */
export function iniciais(nome: string): string {
  const palavras = nome.replace(/\(.*?\)/g, " ").split(/\s+/)
    .filter(p => p && !/^(de|da|do|das|dos|e|&)$/i.test(p));
  const letras = palavras.slice(0, 2).map(p => (p.match(/[A-Za-zÀ-ÿ0-9]/)?.[0] ?? "").toUpperCase()).join("");
  return letras || "·";
}

/** O fundo branco sob a tinta: o texto é medido contra a mistura, não contra a cor pura. */
function fundoMisturado(hex: string, alfa: number): string {
  const h = hex.replace("#", "");
  const cheio = h.length === 3 ? h.split("").map(c => c + c).join("") : h;
  const n = parseInt(cheio, 16);
  const mix = (c: number) => Math.round(255 - (255 - c) * alfa).toString(16).padStart(2, "0");
  return `#${mix((n >> 16) & 255)}${mix((n >> 8) & 255)}${mix(n & 255)}`;
}

export function corDoTextoNaTinta(cor: string | null | undefined, alfa = 0.12): string {
  if (!corValida(cor)) return T.apoio;
  return darkenToContrast(cor!, fundoMisturado(cor!, alfa));
}

export function MarcaDoPatrocinador({ nome, cor, tamanho = 32 }: { nome: string; cor: string | null | undefined; tamanho?: number }) {
  const valida = corValida(cor);
  return (
    <span
      aria-hidden="true"
      style={{
        width: tamanho, height: tamanho, borderRadius: tamanho >= 36 ? R.md : R.sm + 1, flexShrink: 0,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        backgroundColor: valida ? tinta(cor, 0.12) : T.low,
        border: `1px solid ${valida ? tinta(cor, 0.32) : T.border}`,
        color: corDoTextoNaTinta(cor),
        fontFamily: FONT.display, fontWeight: FW.forte, letterSpacing: "-0.02em",
        fontSize: tamanho >= 40 ? FS.strong : tamanho >= 30 ? FS.meta : FS.small,
        transition: "background-color var(--dur-media) ease, border-color var(--dur-media) ease, color var(--dur-media) ease",
      }}
    >
      {iniciais(nome)}
    </span>
  );
}

/**
 * Como a marca aparece nas peças (o chip "colored" de SponsorChips) — a
 * prévia do formulário. Sem ela, escolher a cor era escolher uma bolinha sem
 * saber onde ela ia parar.
 */
export function ChipDaMarca({ nome, cor }: { nome: string; cor: string | null | undefined }) {
  const valida = corValida(cor);
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", maxWidth: "100%",
        padding: "3px 8px", borderRadius: R.sm - 2,
        fontSize: FS.meta, fontWeight: FW.medio, lineHeight: 1.35,
        backgroundColor: valida ? tinta(cor, 0.1) : T.low,
        border: `1px solid ${valida ? tinta(cor, 0.3) : T.border}`,
        color: valida ? darkenToContrast(cor!, fundoMisturado(cor!, 0.1)) : T.apoio,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        transition: "background-color var(--dur-media) ease, border-color var(--dur-media) ease, color var(--dur-media) ease",
      }}
    >
      {nome}
    </span>
  );
}
