// ─────────────────────────────────────────────────────────────────────────────
// A TABELA DE PERMISSÕES DIZ A VERDADE — nas duas direções.
//
// shared/permissoes.ts declara a régua de papéis das 74 rotas de escrita.
// Este teste varre o código real (server/permissoes-scan.ts entende as três
// formas de guarda: requireRole, aliases e checagens à mão) e compara:
//
//   · rota no código sem linha na tabela  → a tabela envelheceu, quebra;
//   · linha na tabela sem rota no código  → a rota mudou/sumiu, quebra;
//   · papéis diferentes                   → alguém mudou a régua, quebra.
//
// A quebra é o recurso: é o único momento em que uma mudança de permissão
// fica VISÍVEL num diff legível, em vez de enterrada num `if` de rota.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import path from "path";
import { lerReguaDoServidor } from "../permissoes-scan";
import { REGUA_DE_PAPEIS, podePapel } from "@shared/permissoes";

const chave = (m: string, r: string) => `${m} ${r}`;

describe("tabela ↔ código, sem sobras de nenhum lado", () => {
  const doCodigo = lerReguaDoServidor(path.resolve(__dirname, "../routes"));
  const daTabela = new Map(REGUA_DE_PAPEIS.map((r) => [chave(r.metodo, r.rota), r.papeis]));

  it("toda guarda do código tem linha na tabela, com os MESMOS papéis", () => {
    const problemas: string[] = [];
    for (const r of doCodigo) {
      const declarado = daTabela.get(chave(r.metodo, r.rota));
      if (!declarado) { problemas.push(`FALTA na tabela: ${r.metodo} ${r.rota} (${r.arquivo})`); continue; }
      const a = [...r.papeis].sort().join(","), b = [...declarado].sort().join(",");
      if (a !== b) problemas.push(`DIVERGE: ${r.metodo} ${r.rota} — código diz [${a}], tabela diz [${b}]`);
    }
    expect(problemas).toEqual([]);
  });

  it("toda linha da tabela existe no código — nada de permissão fantasma", () => {
    const noCodigo = new Set(doCodigo.map((r) => chave(r.metodo, r.rota)));
    const fantasmas = REGUA_DE_PAPEIS
      .filter((r) => !noCodigo.has(chave(r.metodo, r.rota)))
      .map((r) => `${r.metodo} ${r.rota}`);
    expect(fantasmas).toEqual([]);
  });

  it("são as 78 — o número que o diagnóstico mediu; mudou, atualize os dois", () => {
    expect(REGUA_DE_PAPEIS.length).toBe(78);
    expect(doCodigo.length).toBe(78);
  });
});

describe("podePapel — a leitura que as telas fazem", () => {
  it("responde pela tabela", () => {
    expect(podePapel("PATCH", "/api/items/:id/submit-for-approval", "arte")).toBe(true);
    expect(podePapel("PATCH", "/api/items/:id/submit-for-approval", "grafica")).toBe(false);
    expect(podePapel("DELETE", "/api/events/:id", "admin")).toBe(true);
    expect(podePapel("DELETE", "/api/events/:id", "solicitacao")).toBe(false);
  });

  it("rota fora da tabela = qualquer logado — a tabela declara restrições, não a ausência delas", () => {
    expect(podePapel("PATCH", "/api/items/:id", "grafica")).toBe(true);
  });
});

describe("invariantes da régua inteira", () => {
  it("admin passa em TODAS as rotas declaradas — é a definição do perfil", () => {
    const semAdmin = REGUA_DE_PAPEIS.filter((r) => !r.papeis.includes("admin"));
    expect(semAdmin.map((r) => `${r.metodo} ${r.rota}`)).toEqual([]);
  });

  it("nenhuma linha vazia — restrição sem papel nenhum é rota morta", () => {
    expect(REGUA_DE_PAPEIS.filter((r) => r.papeis.length === 0)).toEqual([]);
  });

  it("sem duplicatas de método+rota", () => {
    const vistos = new Set<string>();
    for (const r of REGUA_DE_PAPEIS) {
      const k = chave(r.metodo, r.rota);
      expect(vistos.has(k), k).toBe(false);
      vistos.add(k);
    }
  });
});
