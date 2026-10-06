// ─────────────────────────────────────────────────────────────────────────────
// <DiferencaDeTexto> — "como está" e "como ficará" com a mudança MARCADA.
//
// Na Correção de textos o antes e o depois diferem por poucos caracteres (um
// "s" que volta no lugar de um espaço) espalhados num parágrafo inteiro. Lado
// a lado sem marca, a revisão era um jogo dos sete erros: o olho lia duas
// frases quase iguais e não achava o que mudava. A marca mostra cada espaço
// que sai (antes) e cada letra que volta (depois).
//
// Diferença por caractere (maior subsequência comum). É só apresentação: o
// texto gravado é o `depois` que veio do servidor, intacto. Texto grande demais
// para a tabela (acima de LIMITE) sai sem marca, em vez de travar a tela.
// ─────────────────────────────────────────────────────────────────────────────
import * as React from "react";

type Trecho = { tipo: "igual" | "sai" | "entra"; texto: string };

const LIMITE = 2400; // caracteres somados — 1,4 mi de células no pior caso

export function diferencaPorCaractere(antes: string, depois: string): Trecho[] | null {
  const a = Array.from(antes);
  const b = Array.from(depois);
  if (a.length + b.length > LIMITE) return null;
  const n = a.length, m = b.length;
  const larg = m + 1;
  const tab = new Uint16Array((n + 1) * larg);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      tab[i * larg + j] = a[i] === b[j]
        ? tab[(i + 1) * larg + j + 1] + 1
        : Math.max(tab[(i + 1) * larg + j], tab[i * larg + j + 1]);
    }
  }
  const saida: Trecho[] = [];
  const empurra = (tipo: Trecho["tipo"], ch: string) => {
    const ult = saida[saida.length - 1];
    if (ult && ult.tipo === tipo) ult.texto += ch; else saida.push({ tipo, texto: ch });
  };
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { empurra("igual", a[i]); i++; j++; }
    else if (tab[(i + 1) * larg + j] >= tab[i * larg + j + 1]) { empurra("sai", a[i]); i++; }
    else { empurra("entra", b[j]); j++; }
  }
  while (i < n) empurra("sai", a[i++]);
  while (j < m) empurra("entra", b[j++]);
  return saida;
}

/** Quantos caracteres voltam — o "N letras devolvidas" do cartão. */
export function letrasQueVoltam(antes: string, depois: string): number | null {
  const d = diferencaPorCaractere(antes, depois);
  if (!d) return null;
  return d.filter((t) => t.tipo === "entra").reduce((s, t) => s + Array.from(t.texto).length, 0);
}

export function TextoComDiferenca({ antes, depois, lado }: { antes: string; depois: string; lado: "antes" | "depois" }) {
  const trechos = React.useMemo(() => diferencaPorCaractere(antes, depois), [antes, depois]);
  if (!trechos) return <>{lado === "antes" ? antes : depois}</>;
  return (
    <>
      {trechos.map((t, k) => {
        if (t.tipo === "igual") return <React.Fragment key={k}>{t.texto}</React.Fragment>;
        if (lado === "antes" && t.tipo === "sai") return <mark key={k} className="adm-sai" style={{ color: "inherit" }}>{t.texto}</mark>;
        if (lado === "depois" && t.tipo === "entra") return <mark key={k} className="adm-volta">{t.texto}</mark>;
        return null;
      })}
    </>
  );
}
