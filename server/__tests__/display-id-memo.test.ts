// ─────────────────────────────────────────────────────────────────────────────
// compareDisplayId COM MEMÓRIA DO PARSE (perf, 17/09).
//
// A mudança é só de implementação: o parse de cada código passou a ser
// guardado por texto. O que este arquivo prende é que a ORDEM não muda — o
// sort com o comparador novo dá exatamente a mesma sequência que o comparador
// de antes (regex a cada chamada), inclusive para códigos tortos, nulos,
// complementos e depois de a memória estourar o teto e recomeçar.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { compareDisplayId, parseDisplayId } from "../../client/src/lib/displayId";

/** O comparador de ANTES, literal. */
function compareAntigo(a?: string | null, b?: string | null): number {
  const A = parseDisplayId(a);
  const B = parseDisplayId(b);
  return A.base !== B.base ? A.base - B.base : A.seq - B.seq;
}

let semente = 7;
const aleatorio = () => { semente = (semente * 1103515245 + 12345) % 2147483648; return semente / 2147483648; };

function gerarCodigos(n: number): Array<string | null | undefined> {
  const out: Array<string | null | undefined> = [];
  for (let i = 0; i < n; i++) {
    const base = Math.floor(aleatorio() * 6000);
    const r = aleatorio();
    if (r < 0.02) out.push(null);
    else if (r < 0.03) out.push(undefined);
    else if (r < 0.04) out.push("");
    else if (r < 0.05) out.push("sem número");
    else if (r < 0.06) out.push(`${base}`); // sem "#"
    else if (r < 0.15) out.push(`#${String(base).padStart(4, "0")}-C${1 + Math.floor(aleatorio() * 3)}`);
    else if (r < 0.17) out.push(`#${String(base).padStart(4, "0")}-c2`); // caixa baixa
    else out.push(`#${String(base).padStart(4, "0")}`);
  }
  return out;
}

describe("compareDisplayId memorizado", () => {
  it("ordena igual ao comparador antigo (5 mil peças, com tortos e complementos)", () => {
    const pecas = gerarCodigos(5000).map((displayId, i) => ({ i, displayId }));
    const antigo = pecas.slice().sort((a, b) => compareAntigo(a.displayId, b.displayId)).map((p) => p.i);
    const novo = pecas.slice().sort((a, b) => compareDisplayId(a.displayId, b.displayId)).map((p) => p.i);
    expect(novo).toEqual(antigo);
    // E de novo, agora com a memória quente.
    const deNovo = pecas.slice().sort((a, b) => compareDisplayId(a.displayId, b.displayId)).map((p) => p.i);
    expect(deNovo).toEqual(antigo);
  });

  it("mesmo sinal em todo par, e continua certo depois de a memória passar do teto", () => {
    const codigos = gerarCodigos(400);
    for (const a of codigos) for (const b of codigos) {
      expect(Math.sign(compareDisplayId(a, b))).toBe(Math.sign(compareAntigo(a, b)));
    }
    // 25 mil códigos distintos: estoura o teto (20 mil) e a memória recomeça.
    for (let k = 0; k < 25_000; k++) compareDisplayId(`#${k}-C1`, `#${k + 1}`);
    expect(compareDisplayId("#0062", "#0062-C1")).toBeLessThan(0);
    expect(compareDisplayId("#0062-C2", "#0063")).toBeLessThan(0);
    expect(compareDisplayId(null, "#0001")).toBeLessThan(0);
    expect(compareDisplayId(undefined, "")).toBe(0);
    // 160 mil expect() (400×400): ~2,3 s sozinho, e passava dos 5 s padrão com
    // a suíte inteira disputando CPU — o teto aqui é de carga, não de regra.
  }, 30_000);

  it("parseDisplayId segue devolvendo objeto novo (a memória não vaza para quem chama)", () => {
    const a = parseDisplayId("#0062-C1");
    a.base = 999;
    expect(parseDisplayId("#0062-C1")).toEqual({ base: 62, seq: 1 });
    expect(compareDisplayId("#0062-C1", "#0063")).toBeLessThan(0);
  });

  it("mede: sort de 5 mil peças, antes × depois", () => {
    const pecas = gerarCodigos(5000).map((displayId) => ({ displayId }));
    const medir = (cmp: typeof compareAntigo) => {
      const t = performance.now();
      for (let r = 0; r < 10; r++) pecas.slice().sort((a, b) => cmp(a.displayId, b.displayId));
      return (performance.now() - t) / 10;
    };
    medir(compareDisplayId); // aquece
    const antes = medir(compareAntigo);
    const depois = medir(compareDisplayId);
    console.log(`[perf] sort de 5.000 peças por displayId  antes: ${antes.toFixed(1)} ms   depois: ${depois.toFixed(1)} ms`);
  });
});
