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
// A ORDEM trava → conta → gravação e as rotas vizinhas (reserva, troca,
// correct-reuse, return-to-review, cancelar) RODAM em regras-producao-itens.test.ts.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { fonteDasRotasDeItens } from "./fonte-das-rotas-de-itens";
import { readFileSync } from "fs";
import path from "path";
import { planejarLancamentoDeImpressas, normalizarPartes, aImprimirDaPeca, partesDaPeca } from "@shared/impressao-dividida";
import { planejarInicioDaImpressao, pausarParte, colunasDaReserva, contaFecha, ocupanteDaImpressora, travasDoInicio } from "@shared/reserva-de-impressora";
import { numerosDaImpressao, fraseDaFila } from "@shared/progresso-da-impressao";
import { agregarRelatorioDeMaquinas } from "../services/relatorioDeMaquinas";
import { rotuloDaMaquina } from "@shared/fluxo-peca";

const ler = (rel: string) => readFileSync(path.resolve(__dirname, "../..", rel), "utf8");
const ITEMS = fonteDasRotasDeItens();
const MAQ = ler("server/routes/maquinas.ts");
const trecho = (fonte: string, de: string, ate: string) => fonte.slice(fonte.indexOf(de), fonte.indexOf(ate, fonte.indexOf(de) + 1));
// A rota (leitura de fora, guardas) + a regra que ela chama sob a linha travada
// (services/impressas-da-peca.ts) — o mesmo trecho de antes da extração.
const PRODUCTION = trecho(ITEMS, 'app.patch("/api/items/:id/start-production"', 'app.post("/api/items/:id/mark-reuse"')
  + trecho(ITEMS, "export async function lancarImpressas(", "export async function cadastrarAtivosDaPecaProduzida(");

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
});

describe("3 · os cantos do lançamento (conta pura)", () => {
  const INTEIRA: Linha = { id: "p1", status: "inProduction", quantity: 10, reuseQty: 0, quantityProduced: 2, printMachine: "1", impressaoPorMaquina: null, productionStartedAt: AGORA, producedAt: null, travadaEm: null };

  it("fração é recusada com frase (virava 500 no banco)", () => {
    expect(planejarLancamentoDeImpressas(INTEIRA as any, { quantityProduced: 4.5 }, AGORA)).toMatchObject({ ok: false, status: 400, corpo: { error: "Informe um número inteiro de unidades impressas" } });
    // texto "4" não passa mais por conversão: o contrato é número inteiro
    expect(planejarLancamentoDeImpressas(INTEIRA as any, { quantityProduced: "4" }, AGORA)).toMatchObject({ ok: false, status: 400, corpo: { error: "Informe um número inteiro de unidades impressas" } });
    expect(planejarLancamentoDeImpressas(INTEIRA as any, { quantityProduced: 4 }, AGORA)).toMatchObject({ ok: true, quantityProduced: 4 });
    expect(planejarLancamentoDeImpressas(INTEIRA as any, {}, AGORA)).toMatchObject({ ok: false, status: 400, corpo: { error: "Informe quantas unidades saíram da impressora" } });
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
    // A rota recusando a peça de reuso legado roda em regras-producao-itens.test.ts.
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

describe("5 · rotas vizinhas", () => {

  it("o aviso de 'Impressão iniciada' não pipoca mais para todo mundo (só invalida)", () => {
    const ws = ler("client/src/hooks/use-websocket.ts");
    const bloco = ws.slice(ws.indexOf("case 'production_started':"), ws.indexOf("case 'deadline_alert':"));
    expect(bloco).not.toContain("toast(");
    expect(ws).toContain("for (const alvo of alvosDaMensagem(data)) agendarNoCoalescer(alvo);");
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
