// ─────────────────────────────────────────────────────────────────────────────
// O VOCABULÁRIO DE STATUS É CANÔNICO NA ESCRITA (frente 5 do diagnóstico).
//
// A migração (scripts/unificar-status-legado.ts) converte os DADOS; este
// arquivo garante que o problema não volta pela porta da frente: nenhum
// código pode voltar a ESCREVER uma grafia legada. Sem esta guarda, a
// migração seria enxugar gelo — o próximo `status: "entregue"` recomeçaria a
// bifurcação que seis arquivos hoje remendam com listas duplas.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi } from "vitest";
import { readFileSync, readdirSync } from "fs";
import path from "path";

vi.mock("../db", () => ({ db: {} }));
vi.mock("../storage", () => ({ storage: {} }));

const { CANONICO } = await import("../../scripts/unificar-status-legado");

const LEGADAS = Object.keys(CANONICO);

function arquivosDe(dir: string, ext: string[]): string[] {
  const out: string[] = [];
  for (const f of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory() && f.name !== "__tests__" && f.name !== "node_modules") out.push(...arquivosDe(p, ext));
    else if (ext.some((e) => f.name.endsWith(e))) out.push(p);
  }
  return out;
}

describe("nenhum código escreve grafia legada", () => {
  const raiz = path.resolve(__dirname, "../..");
  const fontes = [
    ...arquivosDe(path.join(raiz, "server"), [".ts"]),
    ...arquivosDe(path.join(raiz, "client/src"), [".ts", ".tsx"]),
  ].filter((p) => !p.includes("permissoes-scan"));

  it("não existe `status: \"<legada>\"` em atribuição nenhuma", () => {
    const violacoes: string[] = [];
    for (const arq of fontes) {
      const src = readFileSync(arq, "utf8");
      for (const g of LEGADAS) {
        // Escrita é `status: "x"` fora de listas de leitura. Leitores usam
        // arrays/Sets ("...", "...") e comparações — a forma de escrita é a
        // chave de objeto. Falso positivo aqui é preferível a falso negativo:
        // quem cair nesta rede legitimamente que escreva o canônico.
        const padrao = new RegExp(`status:\\s*["']${g}["']`);
        if (padrao.test(src)) violacoes.push(`${path.relative(raiz, arq)}: status: "${g}"`);
      }
    }
    expect(violacoes).toEqual([]);
  });
});

describe("o mapa da migração", () => {
  it("cobre as seis grafias que os leitores toleram", () => {
    expect(CANONICO).toEqual({
      pronto_para_producao: "ready_for_production",
      liberado: "approved",
      em_producao: "inProduction",
      produzido: "produced",
      conferido: "conferred",
      entregue: "delivered",
    });
  });

  it("todo destino é um status que o app escreve de verdade", () => {
    // Um typo no destino ("in_production") criaria uma TERCEIRA grafia — a
    // migração viraria geradora do problema que ela resolve.
    const ESCRITOS = ["ready_for_production", "approved", "inProduction", "produced", "conferred", "delivered"];
    for (const destino of Object.values(CANONICO)) {
      expect(ESCRITOS).toContain(destino);
    }
  });

  it("a migração NÃO passa por updateItem — grafia não é transição", () => {
    const SCRIPT = readFileSync(new URL("../../scripts/unificar-status-legado.ts", import.meta.url), "utf8");
    expect(SCRIPT).toContain("UPDATE items SET status = ${destino} WHERE status = ${c.status}");
    expect(SCRIPT).not.toContain("updateItem(");
    // statusChangedAt intocado: peça migrada não pode virar "andou hoje".
    expect(SCRIPT).toContain("statusChangedAt e updatedAt ficam como estão");
    // e deixa rastro na trilha, uma linha por grafia
    expect(SCRIPT).toContain("Grafia de status unificada");
  });

  it("é ensaio por padrão", () => {
    const SCRIPT = readFileSync(new URL("../../scripts/unificar-status-legado.ts", import.meta.url), "utf8");
    expect(SCRIPT).toContain('process.argv.includes("--aplicar")');
  });
});

describe("os leitores tolerantes continuam — são o cinto de segurança", () => {
  it("o funil de prazos ainda aceita as grafias antigas", () => {
    const SRC = readFileSync(new URL("../services/prazo-domain.ts", import.meta.url), "utf8");
    expect(SRC).toContain('"pronto_para_producao"');
    expect(SRC).toContain('"em_producao"');
  });
});
