// ─────────────────────────────────────────────────────────────────────────────
// AUTORIA DA TRILHA — quem fez, gravado no ato, com id.
//
// O que originou este arquivo: no Histórico com dados reais, o filtro "Sem
// autor registrado" pegava 4.287 de 4.755 linhas. A tabela `audit_logs` sempre
// teve a coluna `user_id` com FK para `users`, e o helper que grava a trilha
// recebia SÓ o nome — a coluna nasceu nula e continuou nula em 100% das linhas.
//
// São três garantias diferentes, e nenhuma delas dá para provar com um teste de
// rota só:
//
//   1. RESOLUÇÃO — o par (userName, userId) sai de um lugar único e nunca sai
//      vazio. Teste de função pura.
//   2. COBERTURA — toda rota de ESCRITA grava auditoria. Uma rota que não grava
//      nada obriga a tela a sintetizar a linha a partir de carimbos da peça, e
//      carimbo não tem autor: é assim que a trilha fica anônima na origem.
//   3. FORMA — nenhuma chamada volta a montar a autoria à mão. Este é o teste
//      "chato" que impede a regressão: basta UMA chamada nova escrita no
//      formato antigo (`createAuditLog(req.userName!, …)`) para a linha voltar
//      a nascer sem id, e nada na tela denunciaria.
//
// (2) e (3) leem o CÓDIGO-FONTE. É deliberado: a alternativa seria exercitar
// ~45 rotas contra um banco que os testes desta casa não têm, e o modo de
// falha que se quer barrar é textual — alguém copiar a linha errada.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi } from "vitest";
import fs from "fs";
import path from "path";

// shared.ts arrasta storage → db, que exige DATABASE_URL. Nada aqui toca banco:
// `resolveActor` é função pura e o resto lê arquivo-fonte.
vi.mock("../db", () => ({ db: {}, pool: {} }));
vi.mock("../storage", () => ({ storage: {} }));

import { resolveActor, SYSTEM_ACTOR } from "../routes/shared";

const raiz = path.resolve(__dirname, "..", "..");
const ler = (rel: string) => fs.readFileSync(path.join(raiz, rel), "utf8");

/** Módulos donos da escrita de PEÇA e EVENTO — os que alimentam o Histórico. */
const FONTES = [
  "server/routes/items.ts",
  "server/routes/sponsors.ts",
  "server/services/xlsxImport.ts",
];

describe("resolveActor — o par (nome, id) sai de um lugar só", () => {
  it("do próprio req vêm as duas colunas", () => {
    expect(resolveActor({ userName: "Ana Souza", userId: "u-1" }))
      .toEqual({ userName: "Ana Souza", userId: "u-1" });
  });

  it("nome solto (assinatura legada) continua aceito, sem id", () => {
    expect(resolveActor("Ana Souza")).toEqual({ userName: "Ana Souza", userId: null });
  });

  it("NUNCA devolve autor vazio — é a omissão que criou o problema", () => {
    for (const entrada of [undefined, null, "", "   ", {}, { userName: "" }, { userName: "  " }]) {
      expect(resolveActor(entrada as any).userName).toBe(SYSTEM_ACTOR);
    }
  });

  it("caminho automático sem sessão fica com id nulo, não com id inventado", () => {
    expect(resolveActor(SYSTEM_ACTOR)).toEqual({ userName: SYSTEM_ACTOR, userId: null });
    expect(resolveActor({ userName: undefined, userId: undefined }))
      .toEqual({ userName: SYSTEM_ACTOR, userId: null });
  });

  it("id sem nome ainda grava 'Sistema' — a coluna userName é NOT NULL", () => {
    expect(resolveActor({ userId: "u-9" })).toEqual({ userName: SYSTEM_ACTOR, userId: "u-9" });
  });
});

/* ── Cobertura: nenhuma rota de escrita muda estado em silêncio ────────────── */

type Rota = { verbo: string; caminho: string; corpo: string };

function rotasDe(rel: string): Rota[] {
  const src = ler(rel);
  const re = /app\.(get|post|patch|put|delete)\(\s*["'`]([^"'`]+)/g;
  const achadas: Array<{ verbo: string; caminho: string; i: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) achadas.push({ verbo: m[1], caminho: m[2], i: m.index });
  return achadas.map((r, k) => ({
    verbo: r.verbo.toUpperCase(),
    caminho: r.caminho,
    corpo: src.slice(r.i, achadas[k + 1]?.i ?? src.length),
  }));
}

/**
 * Rotas de escrita que legitimamente NÃO gravam auditoria — cada uma com o
 * motivo, porque "não grava" é exatamente o defeito que este arquivo persegue.
 */
const SEM_AUDITORIA_POR_DESENHO: Record<string, string> = {
  "POST /api/items/export-xlsx": "só lê e devolve arquivo, não muda estado nenhum",
  "POST /api/events/:id/preview-xlsx": "faz o parse da planilha sem salvar nada",
  "POST /api/events/:id/confirm-import": "delega a handleConfirmImport, que grava a trilha",
  "POST /api/items/:id/production": "rota aposentada, responde 410 sem tocar em nada",
};

describe("toda rota de escrita de peça/evento deixa rastro", () => {
  for (const rel of ["server/routes/items.ts", "server/routes/sponsors.ts"]) {
    it(`${rel} — nenhuma escrita sem auditoria fora da lista justificada`, () => {
      const semRastro = rotasDe(rel)
        .filter(r => r.verbo !== "GET")
        .filter(r => !/createAuditLog\(|insert\(auditLogs\)/.test(r.corpo))
        .map(r => `${r.verbo} ${r.caminho}`)
        .filter(chave => !(chave in SEM_AUDITORIA_POR_DESENHO));
      expect(semRastro).toEqual([]);
    });
  }

  it("a lista de exceções não guarda rota que já não existe", () => {
    const existentes = new Set(
      ["server/routes/items.ts", "server/routes/sponsors.ts"]
        .flatMap(rotasDe)
        .map(r => `${r.verbo} ${r.caminho}`)
    );
    for (const chave of Object.keys(SEM_AUDITORIA_POR_DESENHO)) {
      expect(existentes.has(chave), `${chave} saiu do código — tire da lista`).toBe(true);
    }
  });
});

/* ── Forma: ninguém volta a montar a autoria à mão ─────────────────────────── */

describe("nenhuma chamada de auditoria monta o autor à mão", () => {
  for (const rel of FONTES) {
    it(`${rel} — createAuditLog recebe o ator, não um nome solto`, () => {
      const src = ler(rel);
      const forasDaLei: string[] = [];
      // A alternativa `\{[^}]*\}` vem primeiro para o objeto literal não ser
      // cortado na primeira vírgula ({ userName: x, userId: y }).
      const re = /createAuditLog\(\s*(\{[^}]*\}|[^,]+),/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src))) {
        const ator = m[1].trim();
        // `req` (o caminho normal), `autor` (par já resolvido na rota) ou um
        // objeto que carrega userId. Qualquer `…userName` solto é o formato
        // antigo: grava nome e deixa a coluna userId nula outra vez.
        const ok =
          ator === "req" ||
          ator === "autor" ||
          ator === "SYSTEM_ACTOR" ||
          (ator.startsWith("{") && ator.includes("userId"));
        if (!ok) forasDaLei.push(ator);
      }
      expect(forasDaLei).toEqual([]);
    });

    it(`${rel} — INSERT direto em audit_logs usa o ator resolvido`, () => {
      const src = ler(rel);
      const forasDaLei: string[] = [];
      const re = /insert\(auditLogs\)\.values\(\{\s*([^\n]*)/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src))) {
        const primeiraLinha = m[1].trim();
        const ok =
          primeiraLinha.startsWith("...resolveActor(") || primeiraLinha.startsWith("...autor");
        if (!ok) forasDaLei.push(primeiraLinha);
      }
      expect(forasDaLei).toEqual([]);
    });

    it(`${rel} — nenhum 'userName:' escrito na mão dentro de audit_logs`, () => {
      const src = ler(rel);
      // O padrão que criou o problema: `userName: req.userName || "Sistema"`
      // dentro do values() — grava o nome e nunca o id.
      const blocos = src.match(/insert\(auditLogs\)\.values\(\{[\s\S]{0,400}?\}\)/g) ?? [];
      const comNomeNaMao = blocos.filter(b => /(^|[\s,{])userName\s*:/.test(b));
      expect(comNomeNaMao).toEqual([]);
    });
  }

  it("o helper devolve as duas colunas para o storage, não só o nome", () => {
    const shared = ler("server/routes/shared.ts");
    expect(shared).toContain("...resolveActor(actor)");
  });

  it("o caminho automático de status de evento grava autor explícito", () => {
    // updateEventStatus reescreve events.status sem nenhuma pessoa por trás.
    // A regra da casa: caminho sem usuário grava "Sistema", nunca vazio.
    const shared = ler("server/routes/shared.ts");
    const bloco = shared.slice(shared.indexOf("export async function updateEventStatus"));
    expect(bloco).toMatch(/createAuditLog\(\s*SYSTEM_ACTOR/);
  });
});
