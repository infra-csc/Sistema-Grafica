// ─────────────────────────────────────────────────────────────────────────────
// AUDITORIA DE SEGURANÇA 28/10 — achados provados sem banco (regras puras e
// leitura do fonte). Como no arquivo de integração, cada `it` descreve o
// comportamento ATUAL; a correção vira a expectativa invertida.
// Relatório: docs/qa/security-review-2026-10-28.md.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { criarAclDoKit, SQL_ARQUIVOS_DO_KIT_DO_USUARIO } from "../objectAcl";
import { caminhoDaMiniatura } from "../services/miniaturas";
import { podePapel } from "@shared/permissoes";

const ler = (rel: string) => readFileSync(path.resolve(__dirname, "..", rel), "utf8");

describe("M3 (parte 2) corrigido — a miniatura segue a dona do original", () => {
  // A arte de uma peça da ARENA (criada por outra pessoa, sem marca do Kit).
  const ARTE = "/objects/uploads/arte-da-arena";
  const consultar = async (sql: string, params: unknown[]) => {
    if (sql === SQL_ARQUIVOS_DO_KIT_DO_USUARIO) return { rows: [] }; // o Kit não tem peça nenhuma
    // SQL_DONAS_DO_ARQUIVO: só o caminho EXATO do original tem dona.
    return params[0] === ARTE ? { rows: [{ kit_remessa_id: null, criado_por_id: "u-arena" }] } : { rows: [] };
  };

  it("o original é recusado ao Kit…", async () => {
    const acl = criarAclDoKit(consultar);
    expect(await acl.podeLer("u-kit", ARTE)).toBe(false);
  });

  it("…e `<original>/thumb.webp` (onde o upload grava a miniatura) também", async () => {
    const acl = criarAclDoKit(consultar);
    const irma = `/objects/${caminhoDaMiniatura("uploads/arte-da-arena")}`;
    expect(irma).toBe("/objects/uploads/arte-da-arena/thumb.webp");
    expect(await acl.podeLer("u-kit", irma)).toBe(false);
  });
});

describe("BAIXO — a régua declarada diverge do código", () => {
  it("shared/permissoes.ts diz que PATCH /api/notifications/read-all é só do admin; a rota aceita qualquer logado", () => {
    expect(podePapel("PATCH", "/api/notifications/read-all", "grafica")).toBe(false);
    const fonte = ler("routes/notifications.ts");
    expect(fonte).toMatch(/app\.patch\("\/api\/notifications\/read-all", requireAuth,/);
  });
});

describe("BAIXO — o WebSocket não confere a origem do handshake", () => {
  it("o upgrade de /ws só olha a sessão (cookie); nenhum `origin` é conferido", () => {
    const fonte = ler("routes.ts");
    const upgrade = fonte.slice(fonte.indexOf("httpServer.on('upgrade'"), fonte.indexOf("iniciarTempoReal();"));
    expect(upgrade).toContain("req.session?.userId");
    expect(upgrade.toLowerCase()).not.toContain("origin"); // correção: recusar origem ≠ host (como o CSRF de index.ts)
  });
});

describe("BAIXO — o PIN de primeiro acesso é de quem chegar primeiro", () => {
  it("definir-pin aceita qualquer sessão do login compartilhado para o operador que ainda não tem PIN", () => {
    const fonte = ler("routes/operadores.ts");
    const rota = fonte.slice(fonte.indexOf('app.post("/api/operadores/definir-pin"'), fonte.indexOf('app.post("/api/operadores/sair"'));
    expect(rota).toContain("pin_hash IS NULL");
    // Nenhum segredo do próprio operador (código de convite, confirmação do admin) é pedido.
    expect(rota).not.toMatch(/convite|codigoDeAtivacao|token/i);
  });
});
