// ─────────────────────────────────────────────────────────────────────────────
// EMBALAGEM — correções da revisão adversarial (21/09), que bloqueavam a
// publicação. Com o DADO REAL de produção medido no dia:
//   · 6 peças `is_reuse = true` com `reuse_qty = 0` ainda antes da produção
//     (4 awaiting_submission, 2 awaiting_final_review) — nenhuma é embalável;
//   · 7 peças `produced` com `delivered_qty > 0` (entrega parcial do modelo
//     antigo) — o que já saiu não é oferecido de novo.
// O que este arquivo pina:
//   1. o STATUS manda na embalagem (conta pura, rota, lista, fila) e a entrega
//      recusa volume com peça cancelada/arquivada/excluída;
//   2. `aEmbalar` desconta a entrega parcial antiga (e o ciclo 7+3 fecha);
//   3. concorrência: transação com o volume e as peças travados;
//   4. o atalho `items.tubo_id` é acertado na entrega;
//   5–7. transferir, corrigir reaproveitamento, reduzir e excluir respeitam a embalagem;
//   8–9. textos da peça sozinha e a foto única do comprovante;
//   10. a migração aditiva roda em banco limpo.
// Os itens 3–7 e a etiqueta (fechadoEm) são EXECUTADOS em
// regras-estoque-tubos-rotas.test.ts e regras-estoque-peca-embalada.test.ts.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import {
  aEmbalar, planejarEmbalar, planejarEntrega, planejarRetirada, todaEmbalada, violacoesDaConta,
  progressoDaEmbalagem, statusEmbalavel, problemaNoVolume, jaSaiuDaConta,
} from "@shared/embalagem";

const RAIZ = path.resolve(__dirname, "../..");
const ler = (rel: string) => readFileSync(path.resolve(RAIZ, rel), "utf8");
const ROTAS = ler("server/routes/tubos.ts");
const DIALOGO = ler("client/src/components/tubos-dialog.tsx");
const FICHA = ler("client/src/components/item-details-dialog.tsx");
const SQL = ler("scripts/migracao-aditiva-producao.sql");

const peca = (extra: Record<string, unknown> = {}) => ({ quantity: 10, quantityProduced: 10, reuseQty: 0, isReuse: false, conferredQty: 10, embaladaQty: 0, deliveredQty: 0, status: "conferred", ...extra });

describe("1 · o status manda na embalagem", () => {
  it("as 6 de reaproveitamento antigo ANTES da produção não são embaláveis (nem na conta, nem no plano)", () => {
    for (const status of ["awaiting_submission", "awaiting_submission", "awaiting_submission", "awaiting_submission", "awaiting_final_review", "awaiting_final_review"]) {
      const legado = peca({ status, isReuse: true, reuseQty: 0, quantityProduced: 0, conferredQty: 0 });
      expect(aEmbalar(legado)).toBe(0);
      expect(planejarEmbalar(legado).ok).toBe(false);
    }
    expect(planejarEmbalar(peca({ status: "awaiting_final_review", isReuse: true })) ).toEqual({ ok: false, motivo: "está em revisão" });
    expect(planejarEmbalar(peca({ status: "awaiting_submission", isReuse: true })) ).toEqual({ ok: false, motivo: "ainda não saiu da impressão" });
    // …e o mesmo reaproveitamento antigo, já Produzido, continua embalando a quantidade inteira
    expect(aEmbalar(peca({ status: "produced", isReuse: true, reuseQty: 0, quantityProduced: 0, conferredQty: 0 }))).toBe(10);
  });

  it("cancelada, arquivada, em aprovação e em revisão nunca embalam — com frase de gente", () => {
    expect(planejarEmbalar(peca({ status: "canceled" }))).toEqual({ ok: false, motivo: "está cancelada" });
    expect(planejarEmbalar(peca({ status: "archived" }))).toEqual({ ok: false, motivo: "está arquivada" });
    for (const s of ["awaiting_review", "in_review", "awaiting_final_review", "awaiting_approval", "ready_for_production", "in_production"]) {
      expect(aEmbalar(peca({ status: s }))).toBe(0);
    }
    for (const s of ["produced", "conferred", "packed"]) expect(statusEmbalavel(s)).toBe(true);
  });

  it("problema dentro do volume: excluída, cancelada, arquivada, devolvida — a entregue e a conferida não", () => {
    expect(problemaNoVolume({ status: "canceled" })).toBe("está cancelada");
    expect(problemaNoVolume({ status: "archived" })).toBe("está arquivada");
    expect(problemaNoVolume({ status: "packed", deletedAt: new Date() })).toBe("foi excluída");
    expect(problemaNoVolume({ status: "in_review" })).toBe("está em revisão");
    expect(problemaNoVolume({ status: "awaiting_submission" })).toBe("voltou para antes da impressão");
    expect(problemaNoVolume({ status: "packed" })).toBeNull();
    expect(problemaNoVolume({ status: "delivered" })).toBeNull();
  });

  it("a rota, a lista 'sem tubo' e a fila da Gráfica usam o gate", () => {
    expect(ROTAS).toContain("const semTubo = pecas.filter((p) => !ehEntregue(p) && statusEmbalavel(p.status) && aEmbalar(p) > 0)");
    expect(ROTAS).toContain("const plano = planejarEmbalar(p, pedido.quantidade);");
    // a fila: aEmbalar() já devolve 0 pelo status, e a revisão continua barrada
    expect(ler("client/src/pages/grafica.tsx")).toContain("!EM_REVISAO.has(item.status) && !soVisualizaKit(item) && !isDelivered(item) && !isPacked(item) && !!item.eventId && aEmbalar(item) > 0;");
  });

  it("/entregar RECUSA (409) volume com peça-problema, dizendo qual e como resolver; a tela mostra o problema", () => {
    const entregar = ROTAS.slice(ROTAS.indexOf("const entregarVolume ="));
    expect(entregar).toContain("const comProblema = aEntregar.filter(({ p }) => problemaNoVolume(p));");
    expect(entregar).toContain("throw new Recusa(409, `Não dá para entregar");
    expect(entregar).toContain("tire ${codigos} do Tubo ${tubo.numero}");
    expect(entregar).toContain("desfaça a embalagem de ${codigos}");
    // a recusa vem ANTES de qualquer escrita
    expect(entregar.indexOf("comProblema.length")).toBeLessThan(entregar.indexOf("await tx.update(tuboItens)"));
    // a entrega enxerga a excluída (conteúdo lido com a trava, sem filtrar deleted_at)
    expect(entregar).toContain("const dentro = await conteudoDoTubo(tubo.id, tx);");
    expect(ROTAS).toContain("problema: linha && !linha.entregueEm ? problemaNoVolume(p) : null,");
    expect(ROTAS).toContain("&& !dentro.some(({ p, l }) => !l.entregueEm && problemaNoVolume(p)),");
    expect(DIALOGO).toContain('`${p.problema} — ${avulso ? "desfaça a embalagem" : "tire do tubo"} para entregar`');
  });
});

describe("2 · a entrega parcial antiga conta como já saída", () => {
  it("10 un., 7 conferidas e 7 entregues antigas → a embalar 0; conferir +3 → 3; embalar 3 → packed; entregar → delivered", () => {
    const antiga = peca({ status: "produced", conferredQty: 7, deliveredQty: 7, embaladaQty: 0 });
    expect(aEmbalar(antiga)).toBe(0);
    expect(planejarEmbalar(antiga)).toEqual({ ok: false, motivo: "não há unidade conferida sem embalar (7 de 10 já embaladas ou entregues)" });
    expect(violacoesDaConta(antiga)).toEqual([]);
    // 22/09: a entrega antiga NÃO é embalagem — a frase diz o que aconteceu.
    expect(progressoDaEmbalagem(antiga)).toBe("7 de 10 entregues");

    const conferida = { ...antiga, status: "conferred", conferredQty: 10 };
    expect(aEmbalar(conferida)).toBe(3);
    const plano = planejarEmbalar(conferida);
    expect(plano).toEqual({ ok: true, quantidade: 3, embaladaQty: 10, viraEmbalada: true });
    expect(planejarEmbalar(conferida, 4)).toEqual({ ok: false, motivo: "só há 3 conferida(s) sem embalar (pediu 4)" });

    const embalada = { ...conferida, status: "packed", embaladaQty: 10 };
    expect(todaEmbalada(embalada)).toBe(true);
    expect(aEmbalar(embalada)).toBe(0); // não oferece de novo
    expect(violacoesDaConta(embalada)).toEqual([]);
    expect(planejarEntrega(embalada, 3)).toEqual({ deliveredQty: 10, viraEntregue: true });
    // tirar do tubo antes de entregar devolve a 7 (o que já saiu), nunca abaixo
    expect(planejarRetirada(embalada, 3)).toEqual({ embaladaQty: 7, voltaAConferida: true });
    expect(jaSaiuDaConta(peca({ embaladaQty: 7, deliveredQty: 7 }))).toBe(7);
  });

  it("toda entregue pelo modelo antigo: nada a embalar", () => {
    expect(aEmbalar(peca({ status: "produced", deliveredQty: 10 }))).toBe(0);
  });
});

describe("8–9 · a peça sozinha nunca vira 'Tubo -1'; o comprovante é uma foto", () => {
  it("textos do volume avulso", () => {
    expect(DIALOGO).toContain('{jaEmTubo.map((t) => (t.avulso ? "embalada sozinha" : `no Tubo ${t.numero}`)).join(", ")}');
    expect(DIALOGO).toContain("const jaEmTubo = (data?.tubos ?? []).filter((t) => !t.entregueEm && t.pecas.some((p) => sumidas.includes(p.id)));");
    expect(DIALOGO).toContain('{avulso ? "A embalagem está vazia" : `O Tubo ${t.numero} está vazio`}');
    expect(DIALOGO).toContain('alt={avulso ? "Foto da embalagem" : `Foto do Tubo ${t.numero}`} />');
    expect(DIALOGO).not.toContain("O Tubo {t.numero} está vazio");
    expect(FICHA).toContain('${item.tuboAvulso ? "Embalada sozinha" : `Embalada');
    expect(ROTAS).toContain('const apagado = tubo.avulso ? "Embalagem avulsa apagada" : `Tubo ${tubo.numero} apagado`;');
    expect(ROTAS).not.toContain("`Tubo ${tubo.numero} apagado — ${devolvidas}");
  });
  it("o seletor do comprovante guarda UMA foto (a nova substitui)", () => {
    expect(DIALOGO).toContain('<Fotos lista={fotos} onMudar={(mudar) => setFotos((atual) => mudar(atual).slice(-1))} alt="Foto do comprovante" />');
  });
});

describe("10 · a migração aditiva roda em banco limpo", () => {
  it("cria tubos e items.tubo_id ANTES dos ALTERs, sem mexer em banco que já os tem", () => {
    // Varredura: a ORDEM dos comandos do .sql só existe no texto (o arquivo não roda nos testes de unidade).
    const onde = (re: RegExp) => { const m = re.exec(SQL); return m ? m.index : -1; };
    const cria = onde(/CREATE TABLE IF NOT EXISTS tubos\s*\(/i);
    const coluna = onde(/ALTER TABLE items ADD COLUMN IF NOT EXISTS tubo_id\b[^;]*REFERENCES tubos\s*\(\s*id\s*\)/i);
    expect(cria).toBeGreaterThan(-1);
    expect(coluna).toBeGreaterThan(cria);
    expect(cria).toBeLessThan(onde(/ALTER TABLE tubos\b/i));
    expect(coluna).toBeLessThan(onde(/CREATE TABLE IF NOT EXISTS tubo_itens\b/i));
    expect(SQL).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS "UQ_tubos_evento_numero" ON tubos\s*\(\s*event_id\s*,\s*numero\s*\)/i);
  });
});
