// ─────────────────────────────────────────────────────────────────────────────
// IMPRESSÃO E MÁQUINAS — a revisão adversarial de 22/09.
//
// O que este arquivo prende:
//   1. [GRAVE] CONCORRÊNCIA na mesma peça: dois lançamentos (ou tirar + iniciar)
//      em impressoras DIFERENTES da mesma peça partiam da mesma leitura e o
//      segundo apagava o primeiro. Duas provas:
//        · COMPORTAMENTO: as funções puras que as rotas chamam, com duas
//          leituras concorrentes simuladas — lidas da MESMA foto (o bug) e lidas
//          sob a linha travada, uma depois da outra (a correção): com a trava
//          nada se perde e a conta em impressão + reservado ≤ a imprimir fecha;
//        · FONTE: leitura (.for("update")), conta e gravação dentro da MESMA
//          transação, depois dos locks das impressoras — nas quatro rotas.
//   2. Os cantos: fração recusada, impressora diferente ignorada, carimbo de
//      etapa, a guarda do reaproveitamento total, a volta para a Revisão sem
//      reserva, a "pausa" no diário quando a peça sai da impressora por outro
//      caminho, o resumo "ainda na máquina" com a peça dividida e o limbo.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { planejarLancamentoDeImpressas, normalizarPartes, aImprimirDaPeca, partesDaPeca } from "@shared/impressao-dividida";
import { planejarInicioDaImpressao, pausarParte, colunasDaReserva, contaFecha, ocupanteDaImpressora, travasDoInicio } from "@shared/reserva-de-impressora";
import { numerosDaImpressao, fraseDaFila } from "@shared/progresso-da-impressao";
import { agregarRelatorioDeMaquinas } from "../services/relatorioDeMaquinas";
import { rotuloDaMaquina } from "@shared/fluxo-peca";

const ler = (rel: string) => readFileSync(path.resolve(__dirname, "../..", rel), "utf8");
const ITEMS = ler("server/routes/items.ts");
const MAQ = ler("server/routes/maquinas.ts");
const trecho = (fonte: string, de: string, ate: string) => fonte.slice(fonte.indexOf(de), fonte.indexOf(ate, fonte.indexOf(de) + 1));
const PRINTING = trecho(ITEMS, 'app.patch("/api/items/:id/start-printing"', 'app.patch("/api/items/:id/start-production"');
const PRODUCTION = trecho(ITEMS, 'app.patch("/api/items/:id/start-production"', "Auto-add to inventory when fully produced");
const TIRAR = trecho(MAQ, "const tirarEColocar = async", 'app.post("/api/grafica/maquinas/:maquina/trocar"');
const RESERVA_ROTA = trecho(MAQ, 'app.patch("/api/items/:id/maquina-prevista"', "// ── TIRAR da impressora");
const semComentario = (s: string) => s.replace(/\/\/.*$/gm, "");

// ─── O banco de mentira: uma linha, e a TRAVA da linha ────────────────────────
type Linha = Record<string, any>;
/**
 * `SELECT … FOR UPDATE` + a gravação, na mesma transação: quem chega segundo
 * ESPERA o primeiro terminar e só então LÊ. É exatamente o que a trava faz no
 * Postgres — e o que a leitura fora da transação não fazia.
 */
function bancoComTrava(inicial: Linha) {
  let linha = { ...inicial };
  let fila: Promise<unknown> = Promise.resolve();
  return {
    get linha() { return linha; },
    comLinhaTravada<T>(gesto: (lida: Linha) => { set: Linha; resultado: T } | { erro: any }): Promise<T | { erro: any }> {
      const vez = fila.then(async () => {
        const lida = { ...linha };                // a leitura é DENTRO da trava
        await new Promise((r) => setTimeout(r, 1)); // o "meio-tempo" em que a corrida acontecia
        const r = gesto(lida);
        if ("erro" in r) return r;
        linha = { ...linha, ...r.set };           // a gravação, na mesma transação
        return r.resultado;
      });
      fila = vez.catch(() => undefined);
      return vez;
    },
  };
}
const AGORA = new Date("2026-09-22T12:00:00.000Z");
const lancar = (pedido: Record<string, unknown>) => (lida: Linha) => {
  const p = planejarLancamentoDeImpressas(lida as any, pedido, AGORA);
  return p.ok ? { set: p.set, resultado: p } : { erro: p };
};

describe("1 · [GRAVE] start-production: dois lançamentos na mesma peça dividida", () => {
  // 20 un.: 10 na Impressora 1 e 10 na 2, nada impresso.
  const DIVIDIDA: Linha = {
    id: "p1", status: "inProduction", quantity: 20, reuseQty: 0, quantityProduced: 0, printMachine: "1",
    impressaoPorMaquina: { "1": { atrib: 10, impressas: 0 }, "2": { atrib: 10, impressas: 0 } },
    productionStartedAt: AGORA, producedAt: null, travadaEm: null,
  };
  const naUm = { maquina: "1", impressasNaMaquina: 4, expectedNaMaquina: 0, expectedProduced: 0, printMachine: "1" };
  const naDois = { maquina: "2", impressasNaMaquina: 3, expectedNaMaquina: 0, expectedProduced: 0, printMachine: "2" };

  it("O BUG (leitura fora da transação): as duas leem a mesma foto e o segundo apaga as impressas do primeiro", () => {
    const foto = { ...DIVIDIDA };
    const a = planejarLancamentoDeImpressas(foto as any, naUm, AGORA);
    const b = planejarLancamentoDeImpressas(foto as any, naDois, AGORA);
    expect(a.ok && b.ok).toBe(true);
    // `where id` só: grava A, depois B por cima.
    const depois = { ...foto, ...(a as any).set, ...(b as any).set };
    expect(depois.quantityProduced).toBe(3);                      // as 4 da Impressora 1 sumiram
    expect(depois.impressaoPorMaquina["1"].impressas).toBe(0);
  });

  it("A CORREÇÃO (linha travada): em qualquer ordem, as duas partes ficam e o total é a soma", async () => {
    for (const ordem of [[naUm, naDois], [naDois, naUm]]) {
      const banco = bancoComTrava(DIVIDIDA);
      const [r1, r2] = await Promise.all(ordem.map((pedido) => banco.comLinhaTravada(lancar(pedido))));
      expect("erro" in (r1 as any) || "erro" in (r2 as any)).toBe(false);
      expect(banco.linha.impressaoPorMaquina).toEqual({ "1": { atrib: 10, impressas: 4 }, "2": { atrib: 10, impressas: 3 } });
      expect(banco.linha.quantityProduced).toBe(7);
      expect(banco.linha.status).toBe("inProduction");
    }
  });

  it("dois na MESMA parte (os dois leram 0): o segundo recebe 409 PRODUCTION_CONFLICT — nada é sobrescrito", async () => {
    const banco = bancoComTrava(DIVIDIDA);
    const [r1, r2] = await Promise.all([
      banco.comLinhaTravada(lancar({ ...naUm, impressasNaMaquina: 4 })),
      banco.comLinhaTravada(lancar({ ...naUm, impressasNaMaquina: 2 })),
    ]);
    expect("erro" in (r1 as any)).toBe(false);
    expect((r2 as any).erro).toMatchObject({ ok: false, status: 409, corpo: { code: "PRODUCTION_CONFLICT" } });
    expect(banco.linha.impressaoPorMaquina["1"].impressas).toBe(4);
  });

  it("peça não dividida: o lock otimista do total vale sobre a linha travada", async () => {
    const inteira: Linha = { ...DIVIDIDA, impressaoPorMaquina: null, quantity: 10 };
    const banco = bancoComTrava(inteira);
    const [r1, r2] = await Promise.all([
      banco.comLinhaTravada(lancar({ quantityProduced: 4, expectedProduced: 0, printMachine: "1" })),
      banco.comLinhaTravada(lancar({ quantityProduced: 5, expectedProduced: 0, printMachine: "1" })),
    ]);
    expect("erro" in (r1 as any)).toBe(false);
    expect((r2 as any).erro.corpo).toMatchObject({ code: "PRODUCTION_CONFLICT", actualProduced: 4 });
    expect(banco.linha.quantityProduced).toBe(4);
  });

  it("FONTE: .for('update') → conta pura → tx.update, na MESMA transação; nada de storage.updateItem nem de conta sobre a leitura de fora", () => {
    const iTx = PRODUCTION.indexOf("await db.transaction(async (tx) => {");
    const iLe = PRODUCTION.indexOf('await tx.select().from(itemsTable).where(eq(itemsTable.id, req.params.id)).for("update");');
    const iPlano = PRODUCTION.indexOf("planejarLancamentoDeImpressas(before as any, req.body ?? {}, new Date())");
    const iGrava = PRODUCTION.indexOf(".set(plano.set as any)");
    expect([iTx > 0, iTx < iLe, iLe < iPlano, iPlano < iGrava]).toEqual([true, true, true, true]);
    expect(semComentario(PRODUCTION)).not.toContain("storage.updateItem(");
    // A leitura de fora (`antes`) só guarda existência, evento, molde e a resposta rápida da trava.
    expect(semComentario(PRODUCTION)).not.toMatch(/antes\.(quantityProduced|impressaoPorMaquina|status|reuseQty)/);
    expect(ITEMS).toContain("res.status((error as any).httpStatus ?? 500).json((error as any).corpo ?? { error: error.message });");
  });
});

describe("2 · [GRAVE] start-printing e tirar/trocar: dois gestos na mesma peça", () => {
  // 20 un.: 10 na Impressora 1 (2 impressas) e 10 reservadas à 2.
  const PECA: Linha = {
    id: "p9", status: "inProduction", quantity: 20, reuseQty: 0, quantityProduced: 2, printMachine: "1",
    impressaoPorMaquina: { "1": { atrib: 10, impressas: 2 } }, reservaPorMaquina: { "2": 10 }, maquinaPrevista: "2",
  };
  /** O que a rota de tirar grava (server/routes/maquinas.ts), sobre a linha lida. */
  const tirarDa1 = (lida: Linha) => {
    const pausa = pausarParte(lida as any, "1", AGORA.toISOString());
    if (!pausa.ok) return { erro: pausa };
    return {
      set: {
        status: pausa.voltaParaAFila ? "ready_for_production" : lida.status,
        impressaoPorMaquina: pausa.partes ? normalizarPartes(pausa.partes, aImprimirDaPeca(lida as any)) : null,
        ...(pausa.voltaParaAFila ? { printMachine: null } : pausa.principal ? { printMachine: pausa.principal } : {}),
        ...colunasDaReserva(pausa.reserva, lida.reservaPorMaquina, pausa.pausas),
      },
      resultado: pausa,
    };
  };
  /** O que o start-printing grava ao iniciar a parte reservada à Impressora 2. */
  const iniciarNa2 = (lida: Linha) => {
    const plano = planejarInicioDaImpressao(lida as any, { printMachine: "2", iniciarParte: true, daReserva: true });
    return plano.ok ? { set: plano.set, resultado: plano } : { erro: plano };
  };
  const emImpressaoNa = (linha: Linha, m: string) => ocupanteDaImpressora([{ ...linha, id: linha.id } as any], m);

  it("O BUG (mesma foto): o start-printing regrava o jsonb velho — a peça TIRADA volta a ocupar a Impressora 1", () => {
    const foto = { ...PECA };
    const a = tirarDa1(foto) as any;
    const b = iniciarNa2(foto) as any;
    const depois = { ...foto, ...a.set, ...b.set };
    expect(emImpressaoNa(depois, "1")).not.toBeNull();       // a pausa sumiu: a 1 "está ocupada" por uma peça que saiu
    expect(depois.reservaPorMaquina).toBeNull();              // e o que faltava na 1 (8 un.) não está em fila nenhuma
  });

  it("A CORREÇÃO (linha travada): em qualquer ordem, a pausa e o início ficam, e a conta fecha", async () => {
    for (const ordem of [[tirarDa1, iniciarNa2], [iniciarNa2, tirarDa1]]) {
      const banco = bancoComTrava(PECA);
      await Promise.all(ordem.map((g) => banco.comLinhaTravada(g as any)));
      const final = banco.linha;
      expect(emImpressaoNa(final, "1")).toBeNull();                          // a 1 ficou livre
      expect(emImpressaoNa(final, "2")?.id).toBe("p9");                       // a 2 imprime a parte dela
      expect(contaFecha(final as any)).toBe(true);                            // em impressão + reservado ≤ a imprimir
      // Nada se perdeu: impressas + o que está na 2 + o reservado à 1 = 20.
      const partes = partesDaPeca(final as any);
      const naImpressora = Object.values(partes).reduce((s, x) => s + (x.atrib - x.impressas), 0);
      const reservado = Object.values((final.reservaPorMaquina ?? {}) as Record<string, any>).reduce((s: number, v: any) => s + (typeof v === "number" ? v : v.qtd), 0);
      expect(final.quantityProduced + naImpressora + reservado).toBe(20);
    }
  });

  it("FONTE start-printing: locks das impressoras (ordenados) → linha FOR UPDATE → guardas → conta pura → tx.update, na mesma transação", () => {
    const iLock = PRINTING.indexOf("pg_advisory_xact_lock");
    const iLe = PRINTING.indexOf('await tx.select().from(itemsTable).where(eq(itemsTable.id, req.params.id)).for("update");');
    const iTrava = PRINTING.indexOf("if (pecaTravada(current as any)) throw falha(409");
    const iPlano = PRINTING.indexOf("planejarInicioDaImpressao(current as any, pedido)");
    const iGrava = PRINTING.indexOf("await tx.update(itemsTable).set({");
    expect([iLock > 0, iLock < iLe, iLe < iTrava, iTrava < iPlano, iPlano < iGrava]).toEqual([true, true, true, true, true]);
    expect(semComentario(PRINTING)).not.toContain("storage.updateItem(");
    // A linha pede uma impressora que a leitura de fora não travou: recomeça (nunca trava fora de ordem).
    expect(PRINTING).toContain("if (precisa.some((m) => !travas.includes(m))) return { recomecar: precisa };");
    expect(travasDoInicio({ printMachine: "3" }, { printMachine: "1", deMaquina: "3" })).toEqual(["1", "3"]);
  });

  it("FONTE tirar/trocar: lock da impressora → as DUAS linhas FOR UPDATE em ordem de id (troca cruzada não trava) → gravação", () => {
    const iLock = TIRAR.indexOf("pg_advisory_xact_lock");
    const iLe = TIRAR.indexOf(".orderBy(itemsTable.id)\n          .for(\"update\");");
    const iGrava = TIRAR.indexOf("await tx.update(itemsTable).set({");
    expect([iLock > 0, iLock < iLe, iLe < iGrava]).toEqual([true, true, true]);
    expect(TIRAR).toContain(".where(inArray(itemsTable.id, comTroca ? [tirarId, colocarId] : [tirarId]))");
    expect(semComentario(TIRAR)).not.toContain("storage.updateItem(");
  });

  it("FONTE reservar: a reserva é lida e gravada sob a linha travada (senão reservava por cima do que o start-printing acabou de iniciar)", () => {
    expect((RESERVA_ROTA.match(/\.for\("update"\)/g) ?? []).length).toBe(2);
    expect(semComentario(RESERVA_ROTA)).not.toContain("storage.updateItem(");
    expect(semComentario(RESERVA_ROTA)).not.toContain("storage.getItem");
  });
});

describe("3 · os cantos do lançamento (conta pura)", () => {
  const INTEIRA: Linha = { id: "p1", status: "inProduction", quantity: 10, reuseQty: 0, quantityProduced: 2, printMachine: "1", impressaoPorMaquina: null, productionStartedAt: AGORA, producedAt: null, travadaEm: null };

  it("fração é recusada com frase (virava 500 no banco)", () => {
    expect(planejarLancamentoDeImpressas(INTEIRA as any, { quantityProduced: 4.5 }, AGORA)).toMatchObject({ ok: false, status: 400, corpo: { error: "Informe um número inteiro de unidades impressas" } });
    expect(planejarLancamentoDeImpressas(INTEIRA as any, { quantityProduced: "4" }, AGORA)).toMatchObject({ ok: true, quantityProduced: 4 });
  });

  it("impressora diferente da atual na peça não dividida é ignorada (trocar é o start-printing); a peça sem impressora aceita a enviada", () => {
    const p = planejarLancamentoDeImpressas(INTEIRA as any, { quantityProduced: 4, printMachine: "3" }, AGORA) as any;
    expect(p.set.printMachine).toBeUndefined();
    expect(p.maquinaDoRegistro).toBe("1");
    const semMaquina = planejarLancamentoDeImpressas({ ...INTEIRA, printMachine: null } as any, { quantityProduced: 4, printMachine: "3" }, AGORA) as any;
    expect(semMaquina.set.printMachine).toBe("3");
  });

  it("virar Produzido carimba statusChangedAt (e producedAt); continuar em impressão não", () => {
    const fecha = planejarLancamentoDeImpressas(INTEIRA as any, { quantityProduced: 10 }, AGORA) as any;
    expect(fecha.set).toMatchObject({ status: "produced", statusChangedAt: AGORA, producedAt: AGORA, impressaoPorMaquina: null, reservaPorMaquina: null, maquinaPrevista: null });
    const parcial = planejarLancamentoDeImpressas(INTEIRA as any, { quantityProduced: 5 }, AGORA) as any;
    expect(parcial.set.statusChangedAt).toBeUndefined();
  });

  it("travada → a marca que a rota troca pela frase e pelo código da trava; fora de impressão → 409", () => {
    expect(planejarLancamentoDeImpressas({ ...INTEIRA, travadaEm: AGORA } as any, { quantityProduced: 4 }, AGORA)).toMatchObject({ ok: false, status: 409, corpo: { error: "__TRAVADA__" } });
    expect(planejarLancamentoDeImpressas({ ...INTEIRA, status: "ready_for_production" } as any, { quantityProduced: 4 }, AGORA)).toMatchObject({ ok: false, status: 409 });
  });

  it("LIMBO: a última parte ativa esgota sem fechar → liberada, sem impressora, e a rota grava a 'pausa' no diário", () => {
    const so10de28: Linha = { ...INTEIRA, quantity: 28, quantityProduced: 0, printMachine: "2", impressaoPorMaquina: { "2": { atrib: 10, impressas: 0 } } };
    const p = planejarLancamentoDeImpressas(so10de28 as any, { maquina: "2", impressasNaMaquina: 10 }, AGORA) as any;
    expect(p).toMatchObject({ ok: true, novoStatus: "ready_for_production", voltouParaAFila: true, maquinaDoRegistro: "2" });
    expect(p.set).toMatchObject({ impressaoPorMaquina: null, printMachine: null, statusChangedAt: AGORA });
    expect(PRODUCTION).toContain('await registrarImpressao(req, { itemId: item.id, maquina: plano.maquinaDoRegistro, tipo: "pausa", quantidade: 0, totalDepois: quantityProduced });');
  });

  it("o start-printing usa aImprimirDaPeca (a peça de reuso legado não tem nada a imprimir)", () => {
    expect(PRINTING).toContain("if (aImprimirDaPeca(current as any) - (current.quantityProduced || 0) <= 0) {");
    expect(aImprimirDaPeca({ quantity: 10, reuseQty: 0, isReuse: true })).toBe(0);
  });
});

describe("3 · números iguais nas duas telas", () => {
  // 28 un.: 10 na Impressora 2 (4 impressas), 8 reservadas à 1, 10 sem impressora.
  const PECA = { status: "inProduction", quantity: 28, reuseQty: 0, quantityProduced: 4, printMachine: "2", impressaoPorMaquina: { "2": { atrib: 10, impressas: 4 } }, reservaPorMaquina: { "1": 8 }, maquinaPrevista: "1" };

  it("'na impressora' = o que falta nas partes ATIVAS (6), não o teto inteiro (24)", () => {
    expect(numerosDaImpressao(PECA as any).frase).toBe("4 de 28 impressas · 6 na impressora");
    expect(numerosDaImpressao(PECA as any, "2").frase).toBe("4 de 10 impressas · 6 na impressora");
    // A peça inteira numa impressora só continua como sempre.
    expect(numerosDaImpressao({ ...PECA, impressaoPorMaquina: null, reservaPorMaquina: null, quantity: 10 } as any).frase).toBe("4 de 10 impressas · 6 na impressora");
  });

  it("a Gráfica mostra a reserva da peça em impressão: 'Fila: Impressora 1 (8)', sem repetir o 'sem impressora'", () => {
    expect(fraseDaFila(PECA as any, { emImpressao: true })).toBe(`Fila: ${rotuloDaMaquina("1")} (8)`);
    expect(fraseDaFila({ ...PECA, reservaPorMaquina: null, maquinaPrevista: null } as any, { emImpressao: true })).toBeNull();
    // A liberada continua com a frase de sempre.
    expect(fraseDaFila({ ...PECA, status: "approved", quantityProduced: 0, impressaoPorMaquina: null, printMachine: null } as any)).toBe(`Fila: ${rotuloDaMaquina("1")} (8) · 20 sem impressora`);
  });
});

describe("4 · recuar é sempre possível", () => {
  it("devolver à fila geral passa por cima da trava e do evento finalizado", () => {
    const fn = trecho(MAQ, "async function motivoDeNaoReservar(", "function aplicarPedidoDeReserva(");
    expect(fn).toContain("async function motivoDeNaoReservar(item: any, maquina?: string | null)");
    expect(fn.indexOf("if (maquina === null) return null;")).toBeLessThan(fn.indexOf("if (pecaTravada(item))"));
    expect(fn.indexOf("if (maquina === null) return null;")).toBeLessThan(fn.indexOf("await motivoEventoDaPeca(item)"));
    expect((MAQ.match(/motivoDeNaoReservar\(atual, pedido\.maquina\)/g) ?? []).length).toBe(2);
  });

  it("'Imprimir esta no lugar' com a reserva de OUTRA impressora: o corpo leva `reservaDe`, e a troca a repassa ao iniciarParte", () => {
    expect(TIRAR).toContain("const inicio = iniciarParte(entra, maquina, { daReserva: temReserva, quantidade, reservaDe });");
    expect(TIRAR).toContain("const reservaDe = ehMaquinaValida(req.body?.reservaDe) && (reservaDaPeca(entra)[req.body.reservaDe] ?? 0) > 0 ? req.body.reservaDe as string : maquina;");
  });
});

describe("5 · rotas vizinhas", () => {
  it("correct-reuse: reaproveitamento TOTAL (vira Produzido) respeita a trava, com a frase e o código do mark-reuse", () => {
    const rota = trecho(ITEMS, 'app.post("/api/items/:id/correct-reuse"', "// Gráfica confere a peça produzida");
    expect(rota).toContain("if (reaproveitaTudo && pecaTravada(current as any)) {");
    expect(rota).toContain("return res.status(409).json({ error: fraseDaTrava(current as any), code: CODIGO_PECA_TRAVADA });");
    expect(rota.indexOf("pecaTravada(current as any)")).toBeLessThan(rota.indexOf("await storage.updateItem(req.params.id, {"));
    // E a peça em impressão que sai por aqui deixa a "pausa" no diário e a impressora livre.
    expect(rota).toContain("await registrarSaidaDaImpressora(req, current);");
    expect(rota).toContain('...(!reaproveitaTudo && (current.status === "inProduction" || current.status === "em_producao") ? { printMachine: null } : {}),');
  });

  it("return-to-review limpa a reserva e o atalho (a peça não volta 'Pausada · no topo')", () => {
    const rota = trecho(ITEMS, 'app.patch("/api/items/:id/return-to-review"', "broadcast({ type: \"item_updated\", item })");
    expect(rota).toContain("reservaPorMaquina: null, maquinaPrevista: null,");
  });

  it("cancelar (unitário e em lote) a peça em impressão grava a 'pausa' de cada impressora com parte ativa", () => {
    const ajudante = trecho(ITEMS, "async function registrarSaidaDaImpressora(", "// ─── MOTIVO das devoluções");
    expect(ajudante).toContain('if (peca.status !== "inProduction" && peca.status !== "em_producao") return;');
    expect(ajudante).toContain("for (const maquina of Object.keys(partesAtivas(partesDaPeca(peca as any)))) {");
    expect(ajudante).toContain('tipo: "pausa", quantidade: 0,');
    // Uma gravação só para os dois (e para os complementos que caem junto).
    expect(trecho(ITEMS, "async function gravarCancelamento(", "async function cancelarComplementosDaMae(")).toContain("await registrarSaidaDaImpressora(req, atual);");
    expect(trecho(ITEMS, 'app.patch("/api/items/:id/cancel"', 'app.patch("/api/items/:id/uncancel"')).toContain("await gravarCancelamento(req, currentItem, motivo);");
    expect(trecho(ITEMS, 'app.patch("/api/items/bulk-cancel"', "res.json({")).toContain("await gravarCancelamento(req, currentItem, motivo);");
  });

  it("o aviso de 'Impressão iniciada' não pipoca mais para todo mundo (só invalida)", () => {
    const ws = ler("client/src/hooks/use-websocket.ts");
    const bloco = ws.slice(ws.indexOf("case 'production_started':"), ws.indexOf("case 'deadline_alert':"));
    expect(bloco).not.toContain("toast(");
    expect(ws).toContain("for (const chave of chavesDaMensagem(data)) invalidateCoalesced(...chave);");
  });

  it("'Desde' da peça no cartão é o início da PARTE naquela impressora (o registro mais recente), não o production_started_at original", () => {
    expect(MAQ).toContain("select distinct on (r.item_id, r.maquina) r.item_id, r.maquina,");
    expect(MAQ).toContain("and r.tipo in ('inicio', 'troca')");
    expect(MAQ).toContain("desde: desdeDaParte.get(`${p.id}:${codigo}`) ?? p.desde");
  });
});

describe("6 · o resumo do dia: 'ainda na máquina'", () => {
  const em = (h: string) => Date.parse(`2026-09-22T${h}:00Z`);
  const reg = (id: string, itemId: string, maquina: string, tipo: string, hora: string, quantidade = 0) =>
    ({ id, itemId, displayId: itemId, tipoPeca: "Backdrop", evento: "X", maquina, tipo, quantidade, totalDepois: 0, aImprimir: 10, dia: "2026-09-22", hora, em: em(hora), quem: "Ana" });

  it("a peça DIVIDIDA conta em cada impressora onde ainda tem parte", () => {
    const dia = agregarRelatorioDeMaquinas([reg("a", "p1", "1", "inicio", "08:00"), reg("b", "p1", "2", "inicio", "08:10"), reg("c", "p1", "1", "parcial", "09:00", 3)] as any)[0];
    expect(dia.maquinas.find((m) => m.maquina === "1")!.aindaNaMaquina).toBe(1);
    expect(dia.maquinas.find((m) => m.maquina === "2")!.aindaNaMaquina).toBe(1);
  });

  it("o LIMBO (parcial + pausa) e o cancelamento (pausa) tiram a peça da impressora; a troca a leva para a outra", () => {
    const dia = agregarRelatorioDeMaquinas([
      reg("a", "p1", "1", "inicio", "08:00"), reg("b", "p1", "1", "parcial", "09:00", 10), reg("c", "p1", "1", "pausa", "09:00"),
      reg("d", "p2", "3", "inicio", "08:00"), reg("e", "p2", "4", "troca", "10:00"),
    ] as any)[0];
    const n = (m: string) => dia.maquinas.find((x) => x.maquina === m)!.aindaNaMaquina;
    expect([n("1"), n("3"), n("4")]).toEqual([0, 0, 1]);
  });
});
