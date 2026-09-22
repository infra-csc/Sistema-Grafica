// ─────────────────────────────────────────────────────────────────────────────
// AS ETAPAS NOVAS DA PRODUÇÃO, FORA DA GRÁFICA (dono, 21/09): "vai ser
// importante mostrar esses novos status — em impressão, em acabamento etc. —
// para o restante do fluxo, não só na Gráfica".
//
// O que este arquivo pina:
//   · a frase pura de lib/detalhe-producao em cada etapa (fila, impressão,
//     dividida, conferência parcial, tubo, recebedor) e a sub-trilha da ficha
//     (Embalado "não se aplica" na peça entregue sem tubo);
//   · o tubo viaja NA PEÇA (comTubo) e faz a volta no formato compacto;
//   · Atendimento: Conferido e Embalado têm etapa própria — peça conferida
//     NÃO parece concluída; rótulo/cor vêm de getStatusMeta;
//   · Vincular: as duas listas usam PRODUCTION_STATUSES;
//   · rótulos (fases, solicitacao, ficha), a visão da Gráfica, o Excel e o
//     andamento dos pedidos.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { detalheDaProducao, subTrilhaDaProducao, rotuloDoTubo } from "@/lib/detalhe-producao";
import { DetalheProducao } from "@/components/detalhe-producao";
import { PRODUCTION_STATUSES, getStatusMeta } from "@/lib/status";
import { PHASES } from "@/lib/fases";
import { visaoDoPapel } from "@/lib/painel-visoes";
import { rotuloDaMaquina } from "@shared/fluxo-peca";
import { compactarPecas, expandirPecas } from "@shared/itens-compactos";
import { ETAPAS_DA_PECA, etapaDaPeca } from "@shared/pedidos-de-peca";
import { comTubo, type ResumoDoTubo } from "../services/tubosDaPeca";

// O serviço importa ../db (que exige DATABASE_URL); aqui só se testa o puro.
vi.mock("../db", () => ({ db: {} }));

const RAIZ = path.resolve(__dirname, "../..");
const ler = (rel: string) => readFileSync(path.resolve(RAIZ, rel), "utf8");
const M1 = rotuloDaMaquina("1");
const M2 = rotuloDaMaquina("2");

describe("detalheDaProducao — a frase curta de cada etapa", () => {
  it("fora da produção não diz nada (o selo basta)", () => {
    for (const s of ["draft", "awaiting_linking", "awaiting_final_review", "canceled", "", null, undefined]) {
      expect(detalheDaProducao({ status: s as any })).toBeNull();
    }
    expect(detalheDaProducao(null)).toBeNull();
  });

  it("liberada: só fala quando há impressora reservada", () => {
    expect(detalheDaProducao({ status: "ready_for_production" })).toBeNull();
    expect(detalheDaProducao({ status: "approved", maquinaPrevista: "2" })).toBe(`Fila: ${M2}`);
    expect(detalheDaProducao({ status: "ready_for_production", quantity: 10, reservaPorMaquina: { "2": 10 } })).toBe(`Fila: ${M2}`);
    expect(detalheDaProducao({ status: "ready_for_production", quantity: 34, maquinaPrevista: "1", reservaPorMaquina: { "1": 20, "2": 14 } }))
      .toBe(`Fila: ${M1} (20) · ${M2} (14)`);
  });

  it("em impressão: impressora + progresso; o reaproveitado não entra no teto", () => {
    expect(detalheDaProducao({ status: "inProduction", printMachine: "2", quantity: 10, quantityProduced: 3 })).toBe(`${M2} · 3 de 10 impressas`);
    expect(detalheDaProducao({ status: "inProduction", printMachine: "2", quantity: 10, reuseQty: 4, quantityProduced: 0 })).toBe(`${M2} · 0 de 6 impressas`);
    expect(detalheDaProducao({ status: "em_producao", printMachine: "1", quantity: 1, quantityProduced: 0 })).toBe(`${M1} · 0 de 1 impressa`);
    // peça antiga, sem máquina anotada: só o progresso — nunca "máquina não informada"
    expect(detalheDaProducao({ status: "inProduction", quantity: 5, quantityProduced: 2 })).toBe("2 de 5 impressas");
  });

  it("em impressão DIVIDIDA: cada impressora com a sua parte", () => {
    expect(detalheDaProducao({
      status: "inProduction", printMachine: "1", quantity: 10, quantityProduced: 5,
      impressaoPorMaquina: { "1": { atrib: 8, impressas: 5 }, "2": { atrib: 2, impressas: 0 } },
    })).toBe(`${M1} · 5 de 8 · ${M2} · 0 de 2`);
  });

  it("impresso: parcial conta; senão espera a conferência", () => {
    expect(detalheDaProducao({ status: "produced", quantity: 10, conferredQty: 7 })).toBe("7 de 10 conferidas");
    expect(detalheDaProducao({ status: "produced", quantity: 10, conferredQty: 0 })).toBe("Aguardando conferência");
    expect(detalheDaProducao({ status: "produzido", quantity: 10 })).toBe("Aguardando conferência");
  });

  it("conferida, embalada e entregue", () => {
    expect(detalheDaProducao({ status: "conferred" })).toBe("Aguardando embalagem");
    expect(detalheDaProducao({ status: "packed", tuboId: "t", tuboNumero: 2 })).toBe("Tubo 2");
    // 17:32Z = 14:32 em São Paulo — o relógio é o do negócio, não o do servidor
    expect(detalheDaProducao({ status: "packed", tuboId: "t", tuboNumero: 2, tuboFechadoEm: "2026-09-21T17:32:00Z" })).toBe("Tubo 2 · fechado 14:32");
    // tem tubo mas o número não veio (resposta antiga em cache): não inventa número
    expect(detalheDaProducao({ status: "packed", tuboId: "t" })).toBe("Em tubo");
    expect(rotuloDoTubo({ tuboId: null })).toBeNull();
    expect(detalheDaProducao({ status: "delivered", receivedBy: "Fulano" })).toBe("Recebida por Fulano");
    expect(detalheDaProducao({ status: "delivered", tuboNumero: 3, tuboRecebidoPor: "Ciclano", receivedBy: "Fulano" })).toBe("Recebida por Ciclano · Tubo 3");
    expect(detalheDaProducao({ status: "delivered" })).toBeNull();
  });

  it("o componente é texto secundário de 12px — e não desenha nada quando não há frase", () => {
    const html = renderToStaticMarkup(createElement(DetalheProducao, { item: { status: "packed", tuboId: "t", tuboNumero: 2 } }));
    expect(html).toContain("Tubo 2");
    expect(html).toContain("font-size:12px");
    expect(html).toContain("color:#57534e");
    expect(renderToStaticMarkup(createElement(DetalheProducao, { item: { status: "draft" } }))).toBe("");
    const fonte = ler("client/src/components/detalhe-producao.tsx");
    expect(fonte).not.toMatch(/color:\s*"#(f97316|a8a29e)"/i);
  });

  it("sem duplicação: a conta vem da fonte única que a Gráfica e Máquinas leem", () => {
    const fonte = ler("client/src/lib/detalhe-producao.ts");
    expect(fonte).toContain('from "@shared/progresso-da-impressao"');
    expect(fonte).not.toContain("DUPLICAÇÃO CONHECIDA");
  });
});

describe("subTrilhaDaProducao — a etapa Produção aberta na ficha", () => {
  it("nasce de PRODUCTION_STATUSES, com rótulo e cor do selo", () => {
    const t = subTrilhaDaProducao({ status: "produced" })!;
    expect(t.map((p) => p.key)).toEqual(["ready_for_production", ...PRODUCTION_STATUSES]);
    expect(t.map((p) => p.label)).toEqual(["Liberada", "Em Impressão", "Impresso", "Conferido", "Embalado", "Entregue"]);
    for (const p of t.slice(1)) expect(p.cor).toBe(getStatusMeta(p.key).dot);
    expect(t.map((p) => p.estado)).toEqual(["feita", "feita", "atual", "pendente", "pendente", "pendente"]);
  });

  it("produced NÃO é igual a delivered (era o defeito: barra toda completa)", () => {
    const estados = (s: string, tuboId?: string) => subTrilhaDaProducao({ status: s, tuboId })!.map((p) => p.estado).join(",");
    expect(estados("produced")).not.toBe(estados("delivered", "t"));
    expect(estados("conferred")).not.toBe(estados("delivered", "t"));
    expect(estados("packed", "t")).not.toBe(estados("delivered", "t"));
  });

  it("entregue sem tubo: Embalado não se aplica; com tubo: feita", () => {
    const sem = subTrilhaDaProducao({ status: "delivered", tuboId: null })!;
    expect(sem.find((p) => p.key === "packed")!.estado).toBe("nao_se_aplica");
    expect(sem.find((p) => p.key === "delivered")!.estado).toBe("atual");
    const com = subTrilhaDaProducao({ status: "delivered", tuboId: "t1" })!;
    expect(com.find((p) => p.key === "packed")!.estado).toBe("feita");
    // conferida ainda sem tubo: Embalado é PENDENTE (pode vir), não "não se aplica"
    expect(subTrilhaDaProducao({ status: "conferred" })!.find((p) => p.key === "packed")!.estado).toBe("pendente");
  });

  it("legados caem no passo certo; fora da produção não há sub-trilha", () => {
    expect(subTrilhaDaProducao({ status: "liberado" })!.find((p) => p.estado === "atual")!.key).toBe("ready_for_production");
    expect(subTrilhaDaProducao({ status: "em_producao" })!.find((p) => p.estado === "atual")!.key).toBe("inProduction");
    expect(subTrilhaDaProducao({ status: "awaiting_final_review" })).toBeNull();
    expect(subTrilhaDaProducao({ status: "canceled" })).toBeNull();
  });

  it("a ficha desenha a sub-trilha e usa a frase na faixa; carimbos com o nome novo", () => {
    const FICHA = ler("client/src/components/item-details-dialog.tsx");
    expect(FICHA).toContain("<SubTrilhaDaProducao item={item} isMobile={isMobile} />");
    expect(FICHA).toContain('data-testid="sub-trilha-producao"');
    expect(FICHA).toContain("detalhe: detalheDaProducao(item) }");
    expect(FICHA).toContain('label: "Impressão iniciada"');
    expect(FICHA).toContain('label: "Impressão concluída"');
    expect(FICHA).not.toContain('label: "Produção iniciada"');
    expect(FICHA).not.toContain('label: "Produzida"');
  });
});

describe("o tubo viaja na peça", () => {
  const resumo: ResumoDoTubo = { tuboNumero: 2, tuboFechadoEm: new Date("2026-09-21T17:32:00Z"), tuboEntregueEm: null, tuboRecebidoPor: null };
  const porId = new Map([["t1", resumo]]);

  it("comTubo só acrescenta quando há tuboId e o tubo existe — senão devolve A MESMA peça", () => {
    const sem = { id: "p1", tuboId: null };
    expect(comTubo(sem, porId)).toBe(sem);
    const orfa = { id: "p2", tuboId: "sumiu" };
    expect(comTubo(orfa, porId)).toBe(orfa);
    expect(comTubo({ id: "p3", tuboId: "t1" }, porId)).toEqual({ id: "p3", tuboId: "t1", ...resumo });
  });

  it("o enrich das listas chama o select em lote (um por request) — e approved/delta passam por ele", () => {
    const ROTAS = ler("server/routes/items.ts");
    expect(ROTAS).toContain("resumosDeTuboPorIds(list.map((i) => i.tuboId)),");
    expect(ROTAS).toContain("...comTubo(item, tuboPorId),");
    const SERVICO = ler("server/services/tubosDaPeca.ts");
    expect(SERVICO).toContain(".where(inArray(tubos.id, unicos));");
    expect(SERVICO).toContain("if (unicos.length === 0) return new Map();");
    // fotos e observação NÃO viajam
    expect(SERVICO).not.toContain("fotosFechamento:");
    // /api/items/approved (cheio e delta) usa o mesmo enrich
    const iApproved = ROTAS.indexOf('"/api/items/approved"');
    expect(iApproved).toBeGreaterThan(0);
    expect(ROTAS.slice(iApproved, iApproved + 6000)).toContain("enrichItemsWithEventsAndSponsors(");
  });

  it("formato compacto: a peça com as chaves novas faz a volta byte a byte", () => {
    const ev = { id: "e1", name: "A" };
    const pecas = [
      { id: "p1", eventId: "e1", event: ev, status: "conferred", tuboId: null, sponsors: [] },
      { id: "p2", eventId: "e1", event: ev, status: "packed", tuboId: "t1", ...resumo, sponsors: [] },
      { id: "p3", eventId: "e1", event: ev, status: "delivered", tuboId: "t1", ...resumo, tuboRecebidoPor: "Fulano", sponsors: [] },
    ];
    const viaRede = (x: unknown) => JSON.parse(JSON.stringify(x));
    const volta = expandirPecas(viaRede(compactarPecas(pecas)));
    expect(JSON.stringify(volta)).toBe(JSON.stringify(pecas));
    expect(detalheDaProducao(volta[1])).toBe("Tubo 2 · fechado 14:32");
  });
});

describe("Atendimento — Conferido e Embalado têm etapa própria", () => {
  const AT = ler("client/src/pages/atendimento.tsx");
  const iPipe = AT.indexOf("const PIPELINE_STAGES");
  const PIPE = AT.slice(iPipe, AT.indexOf("];", iPipe));

  it("cinco etapas de produção, cada uma com UM status canônico (conferida não cai em Entregue)", () => {
    expect(PIPE).toContain("etapaDeProducao('conferido', ST_CONFERRED,     ['conferido'])");
    expect(PIPE).toContain("etapaDeProducao('embalado',  ST_PACKED,        [])");
    expect(PIPE).toContain("etapaDeProducao('entregue',  ST_DELIVERED,     ['entregue'])");
    // a desestruturação por posição acompanha as 5 de PRODUCTION_STATUSES
    expect([...PRODUCTION_STATUSES]).toEqual(["inProduction", "produced", "conferred", "packed", "delivered"]);
    expect(AT).toContain("const [ST_IN_PRODUCTION, ST_PRODUCED, ST_CONFERRED, ST_PACKED, ST_DELIVERED] = PRODUCTION_STATUSES;");
  });

  it("rótulo e cor vêm de getStatusMeta — sem 'Acabamento' próprio nem Entregue roxo", () => {
    expect(AT).toContain("return { key, label: m.short, color: m.dot, statuses: [status, ...legados] };");
    expect(PIPE).not.toContain("'Acabamento'");
    expect(AT).not.toContain("#7c3aed");
  });

  it("'concluída' é só a ÚLTIMA etapa; Embalado pulado na entrega sem tubo", () => {
    expect(AT).toContain("const concluida = atual >= PIPELINE_STAGES.length - 1;");
    expect(AT).toContain("const pulada = stage.key === 'embalado' && atual > i && !item.tuboId;");
    expect(AT).toContain("conferido:    (i) => i.conferredAt,");
    expect(AT).toContain("entregue:     (i) => i.deliveredAt,");
  });

  it("o cartão do histórico mostra a frase ao lado do selo", () => {
    expect(AT).toContain("<DetalheProducao item={item} style={{ marginTop: 0 }} />");
  });
});

describe("Vincular Patrocinadores — a peça conferida/embalada não some", () => {
  const VP = ler("client/src/pages/vincular-patrocinadores.tsx");
  it("as DUAS listas usam PRODUCTION_STATUSES", () => {
    for (const nome of ["VINCULACAO_VISIBLE_STATUSES", "DOWNSTREAM_STATUSES"]) {
      const i = VP.indexOf(`const ${nome}`);
      const bloco = VP.slice(i, VP.indexOf("];", i));
      expect(bloco, nome).toContain("...PRODUCTION_STATUSES,");
      expect(bloco, nome).not.toContain("'produced'");
    }
  });
});

describe("rótulos, visão, Excel e pedidos", () => {
  it("UM rótulo curto para produced: 'Impresso' (longo: 'Impresso / Acabamento')", () => {
    expect(getStatusMeta("produced").short).toBe("Impresso");
    expect(getStatusMeta("produced").label).toBe("Impresso / Acabamento");
    expect(ler("client/src/lib/status.ts")).not.toContain('é "Acabamento": cabe onde');
  });

  it("fases: 'em impressão' e 'em acabamento' (eram 'em produção'/'produzidas')", () => {
    const nomes = Object.fromEntries(PHASES.map((p) => [p.key, p.noun]));
    expect(nomes.inProduction).toBe("em impressão");
    expect(nomes.produced).toBe("em acabamento");
    expect(PHASES.map((p) => p.key)).toEqual([...PRODUCTION_STATUSES]);
  });

  it("solicitacao.tsx não fala mais 'Produzido' como nome de etapa", () => {
    const S = ler("client/src/pages/solicitacao.tsx");
    expect(S).not.toMatch(/para Produzido|<strong>Produzido<\/strong>/);
    expect(S.match(/Impresso \/ Acabamento/g)!.length).toBeGreaterThanOrEqual(6);
  });

  it("Minha fila (Gráfica) vai até o tubo — e NÃO inclui entregue", () => {
    const st = visaoDoPapel("grafica")!.filtros.status;
    expect(st).toEqual(expect.arrayContaining(["ready_for_production", "approved", "inProduction", "produced", "conferred", "packed"]));
    expect(st).not.toContain("delivered");
  });

  it("Excel: coluna Tubo só no export de peças (produção), ao lado da Impressora", () => {
    const X = ler("server/services/xlsxExport.ts");
    const iProd = X.indexOf("const PRODUCTION_COLS");
    const prod = X.slice(iProd, X.indexOf("];", iProd));
    expect(prod).toContain('{ header: "Tubo",            key: "tuboNumero",   width: 22 },');
    expect(prod.indexOf('"Tubo"')).toBeGreaterThan(prod.indexOf('"Impressora"'));
    // o relatório de máquinas segue sem a coluna
    expect(X.slice(X.indexOf("export function montarPlanilhaDeMaquinas"))).not.toContain("tuboNumero");
  });

  it("pedidos: 5 etapas grossas mantidas (índices intactos); packed NÃO conta como entregue", () => {
    expect(ETAPAS_DA_PECA).toHaveLength(5);
    expect(ETAPAS_DA_PECA[3]).toBe("Acabamento / Conferência");
    expect(etapaDaPeca("packed")).toBe(3);
    expect(etapaDaPeca("conferred")).toBe(3);
    expect(etapaDaPeca("delivered")).toBe(4);
    const UI = ler("client/src/components/pedidos/ui.tsx");
    expect(UI).toContain("<StatusBadge status={p.status} short />");
    expect(UI).toContain("<DetalheProducao item={p}");
    const ROTA = ler("server/routes/pedidos-de-peca.ts");
    expect(ROTA).toContain("tuboId: itemsTable.tuboId,");
    expect(ROTA).toContain("const p = comTubo(crua, tuboPorId);");
  });

  it("Detalhe do evento e Painel geral mostram a frase junto do selo", () => {
    expect(ler("client/src/pages/event-detail.tsx")).toContain("<StatusBadge status={statusDeExibicao(item)} short /><DetalheProducao item={item} />");
    expect(ler("client/src/pages/painel-geral.tsx").match(/<DetalheProducao item=\{item\}/g)!.length).toBe(2);
  });
});

describe("o tubo é enfeite: falha ao lê-lo não derruba a lista", () => {
  it("db quebrado (aqui: mock sem select) → mapa vazio, sem lançar; sem ids → nem toca no banco", async () => {
    const { resumosDeTuboPorIds } = await import("../services/tubosDaPeca");
    const silencio = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(resumosDeTuboPorIds(["t1"])).resolves.toEqual(new Map());
    expect(silencio).toHaveBeenCalledOnce();
    silencio.mockClear();
    await expect(resumosDeTuboPorIds([null, undefined, ""])).resolves.toEqual(new Map());
    expect(silencio).not.toHaveBeenCalled();
    silencio.mockRestore();
  });
});
