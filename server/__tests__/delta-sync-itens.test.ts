// ─────────────────────────────────────────────────────────────────────────────
// DELTA-SYNC DE /api/items (auditoria de performance, 27/08 — próximo passo
// aprovado pelo dono: "pode seguir").
//
// O acervo enriquecido é a resposta mais pesada do app e era re-baixado
// INTEIRO a cada invalidação. Agora: primeiro fetch cheio; os seguintes pedem
// ?since= e o servidor devolve só o que mudou. O que este arquivo prende:
//
//  · o VÃO DOS VÍNCULOS: a peça enriquecida muda quando vínculo/aprovação
//    muda, sem tocar a linha de items — por isso TODA escrita dessas tabelas
//    carimba updated_at da peça (touchItem). Sem isso o delta mente.
//  · apagadas VÊM no delta (para o cliente removê-las) — é a única leitura
//    de items sem filtro de soft delete, de propósito.
//  · eventos/patrocinadores vêm inteiros no delta para re-costurar os objetos
//    EMBUTIDOS nas peças que não mudaram (evento renomeado/encerrado).
//  · para os consumidores NADA muda: o queryFn devolve o mesmo array cheio.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const ler = (rel: string) => readFileSync(path.resolve(__dirname, "../..", rel), "utf8");
const STORAGE = ler("server/storage.ts");
const ITEMS = ler("server/routes/items.ts");
const QC = ler("client/src/lib/queryClient.ts");

describe("o carimbo que sustenta o delta", () => {
  it("toda escrita de vínculo/aprovação bumpa updated_at da peça", () => {
    expect(STORAGE).toContain("private async touchItem(itemId: string)");
    // 1 definição + 8 chamadas: add/remove/bulkSync de vínculo, create/update/
    // delete/deleteAll/initialize de aprovação
    expect((STORAGE.match(/touchItem\(/g) ?? []).length).toBe(9);
    // e a falha do carimbo nunca derruba a operação
    const fn = STORAGE.slice(STORAGE.indexOf("private async touchItem"));
    expect(fn.slice(0, 500)).toContain("} catch (e) {");
  });

  it("escritas em lote fora do touchItem também carimbam (vínculo automático por cota, script de correção)", () => {
    // Revisão adversarial 17/09: sem o carimbo o delta não via a peça.
    const auto = STORAGE.slice(STORAGE.indexOf("async autoLinkByQuota"));
    expect(auto.slice(0, 1600)).toContain('.set({ status: "awaiting_linking", updatedAt: new Date() })');
    expect(auto.slice(0, 1600)).toContain(".set({ updatedAt: new Date() }).where(inArray(items.id, ids))");
    expect(ler("server/scripts/corrige-reprovadas.ts")).toContain('.set({ status: "sponsor_approved", updatedAt: new Date() })');
  });

  it("getItemsChangedSince inclui as APAGADAS — o cliente precisa removê-las", () => {
    const fn = STORAGE.slice(STORAGE.indexOf("async getItemsChangedSince"));
    expect(fn.slice(0, 300)).toContain("gte(items.updatedAt, since)");
    expect(fn.slice(0, 300)).not.toContain("deletedAt");
  });
});

describe("a rota", () => {
  const rota = ITEMS.slice(ITEMS.indexOf('app.get("/api/items", requireAuth'), ITEMS.indexOf('app.get("/api/items/deleted"'));

  it("?since= responde delta com itens, removidas, eventos e patrocinadores", () => {
    for (const campo of ["delta: true,", "removidas:", "eventos,", "patrocinadores,"]) {
      expect(rota).toContain(campo);
    }
  });

  it("sobreposição de 60s no `agora` e since velho (>24h) cai no full fetch", () => {
    // Perf 17/09: as duas réguas viraram helpers (a fila da Gráfica usa o mesmo delta).
    expect(rota).toContain("const agora = agoraDoDelta();");
    expect(rota).toContain("const since = lerSince(req);");
    // 17/09: 2s deixava escapar a transação que confirma depois do carimbo.
    expect(ITEMS).toContain("const SOBREPOSICAO_DO_DELTA_MS = 60 * 1000;");
    expect(ITEMS).toContain("new Date(Date.now() - SOBREPOSICAO_DO_DELTA_MS).toISOString()");
    expect(ITEMS).toContain("24 * 60 * 60 * 1000");
  });
});

describe("o cliente", () => {
  it("só a chave /api/items passa pelo delta; o retorno segue sendo o array cheio", () => {
    // Perf 17/09: /api/items/approved (Gráfica) entrou no mesmo delta.
    expect(QC).toContain('const LISTAS_COM_DELTA: ReadonlySet<string> = new Set(["/api/items", "/api/items/approved"]);');
    // Perf 17/09: a lista recortada (["/api/items", "?status=…"]) usa o mesmo
    // delta — a decisão é pelo caminho, sem a query.
    expect(QC).toContain("const temDelta = (url: string) => LISTAS_COM_DELTA.has(url.split(\"?\")[0]);");
    expect(QC).toContain("if (temDelta(url)) {");
    expect(QC).toContain("function aplicarDelta(");
    // resposta em array (servidor antigo / since expirado) reseta o estado
    expect(QC).toContain("if (Array.isArray(corpo)) {");
  });

  it("o merge remove apagadas, substitui mudadas e re-costura evento/patrocinador embutidos", () => {
    const fn = QC.slice(QC.indexOf("function aplicarDelta("));
    expect(fn.slice(0, 1200)).toContain("porId.delete(id)");
    expect(fn.slice(0, 1200)).toContain("porId.set(item.id, item)");
    // Peça do Kit (15/09) re-costura o evento com as datas da remessa; o resto, como sempre.
    expect(fn.slice(0, 2600)).toContain(": evPorId.get(i.eventId) ?? i.event,");
    expect(fn.slice(0, 2600)).toContain("eventoComDatasDoKit(");
    expect(fn.slice(0, 2800)).toContain("approvalStatus: s.approvalStatus ?? null");
  });

  it("a âncora do próximo delta vem do SERVIDOR (agora / maior updated_at) — nunca do relógio do cliente", () => {
    expect(QC).toContain("function maiorCarimbo(");
    expect(QC).toContain("since: corpo.agora ?? itensSync?.since");
    // logout/sessão expirada zeram o estado junto com o cache
    expect((QC.match(/resetItensDelta\(\)/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(ler("client/src/hooks/use-logout.ts")).toContain("resetItensDelta();");
  });
});
