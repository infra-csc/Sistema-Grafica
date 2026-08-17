// ─────────────────────────────────────────────────────────────────────────────
// GRÁFICA E REVISÃO FINAL MOSTRAM EVENTO FINALIZADO — e os botões batem com o
// servidor. Leia isto antes de mexer em qualquer uma das duas telas.
//
// A MUDANÇA (dono, 17/08): "os eventos finalizados devem aparecer ainda na
// Revisão e Gráfica". O commit anterior fizera CINCO filas esconderem essas
// peças. Duas voltaram a mostrar; três continuam escondendo.
//
// POR QUE ESSAS DUAS E NÃO AS OUTRAS TRÊS — é a pergunta que este arquivo trava.
// A guarda de escrita (server/routes/eventoFinalizado.ts) barra o que faz o
// trabalho ANDAR e permite o que ARRUMA A CASA. As exceções que ela abriu para
// peça em fluxo são CONFERIR e REGISTRAR ENTREGA (Gráfica) e EXCLUIR PEÇA
// (Revisão). Esconder a peça tornava impossível executar o que o servidor
// autoriza. Em Arte, Atendimento e Vincular Patrocinadores nada de permitido
// sobrou — lá a peça visível só ofereceria 409, e esconder segue certo.
//
// AS TRÊS COISAS QUE ESTE ARQUIVO PROTEGE, e que ninguém percebe quebrando:
//
//   1. O RECORTE. As duas telas não podem voltar a filtrar, e as outras três
//      não podem parar de filtrar. É uma linha de código em cada uma, do tipo
//      que um "padroniza as cinco filas" desfaz sem querer.
//
//   2. O ALINHAMENTO BOTÃO ↔ ROTA. Com as peças de volta, cada ação visível é
//      ou permitida ou um 409 esperando o clique. A tabela abaixo NÃO afirma de
//      memória quem é quem: ela LÊ server/routes/items.ts e verifica se o
//      handler daquela rota chama a guarda. Se alguém barrar `confer` amanhã,
//      ou tirar a guarda de `start-production`, o teste quebra na tela errada —
//      que é exatamente onde se quer ser avisado.
//
//   3. O SELO. Peça de evento morto misturada às vivas, sem sinal na linha, é
//      pior do que escondê-la: o operador vê "Produzir" apagado e conclui que o
//      sistema quebrou. O selo é PARTE da feature, não enfeite.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { seloPecaEventoFinalizado, motivoAcaoBloqueada } from "@/lib/status";
import { EVENT_CLOSED_STATUS } from "@shared/prazo-dates";

const ler = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

const GRAFICA = ler("client/src/pages/grafica.tsx");
const REVISAO = ler("client/src/pages/solicitacao.tsx");
const ITEMS = ler("server/routes/items.ts");

// ─────────────────────────────────────────────────────────────────────────────
// Ferramentas de leitura. Elas existem para que a tabela de rotas seja uma
// PROVA e não uma cópia da memória de quem escreveu o teste.
// ─────────────────────────────────────────────────────────────────────────────

/** O corpo do handler de uma rota — do registro dela até o próximo registro. */
function handlerDaRota(assinatura: string): string {
  const i = ITEMS.indexOf(assinatura);
  if (i < 0) throw new Error(`rota não encontrada em items.ts: ${assinatura}`);
  const resto = ITEMS.slice(i + assinatura.length);
  const fim = resto.search(/\n {2}app\.(get|post|patch|put|delete)\(/);
  return fim < 0 ? resto : resto.slice(0, fim);
}

/**
 * Esta rota barra evento finalizado?
 *
 * TRÊS formas, e o teste tem de conhecer as três — este predicado nasceu
 * achando que existia só a primeira e reprovou o complemento, que usa a
 * terceira:
 *   · `barraEventoFinalizado(...)` — o atalho das rotas individuais.
 *   · `contadorDeBloqueio()` — as rotas de lote, que não saem no 1º barrado.
 *   · `erroEventoFechado(...)` — quem já tinha o EVENTO em mãos (POST
 *     /api/items/:id/complement carrega o evento da peça-mãe) e responde o 409
 *     à mão, sem reler nada.
 */
const rotaBarrada = (assinatura: string): boolean =>
  /barraEventoFinalizado\(|contadorDeBloqueio\(\)|erroEventoFechado\(/.test(handlerDaRota(assinatura));

/** O JSX de um <button> identificado por um trecho do seu `data-testid`. */
function botao(fonte: string, marca: string): string {
  const i = fonte.indexOf(marca);
  if (i < 0) throw new Error(`botão não encontrado: ${marca}`);
  const ini = fonte.lastIndexOf("<button", i);
  const fim = fonte.indexOf("</button>", i);
  if (ini < 0 || fim < 0) throw new Error(`<button> mal delimitado: ${marca}`);
  return fonte.slice(ini, fim);
}

const HOJE = Date.UTC(2026, 7, 14); // 14/08/2026

// ─────────────────────────────────────────────────────────────────────────────
describe("o recorte: quem mostra e quem esconde", () => {
  it.each([
    ["Gráfica", GRAFICA],
    ["Revisão Final", REVISAO],
  ])("%s NÃO filtra mais evento finalizado do pool base", (_nome, fonte) => {
    // `isEventoFinalizado` era o filtro; `avisoPecasOcultas` era a frase que
    // explicava a ausência. Sem ausência, não há o que explicar — e um aviso
    // de "peças ocultas" numa tela que as mostra seria pior que nenhum.
    expect(fonte).not.toContain("isEventoFinalizado");
    expect(fonte).not.toContain("avisoPecasOcultas");
    expect(fonte).not.toContain("aviso-eventos-encerrados");
  });

  it.each([
    ["Arte", "client/src/pages/arte.tsx"],
    ["Atendimento", "client/src/pages/atendimento.tsx"],
    ["Vincular Patrocinadores", "client/src/pages/vincular-patrocinadores.tsx"],
  ])("%s CONTINUA escondendo, e continua avisando que escondeu", (_nome, caminho) => {
    const fonte = ler(caminho);
    expect(fonte).toContain("isEventoFinalizado");
    expect(fonte).toContain("avisoPecasOcultas");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A TABELA. `barrada` é o que a TELA assume ao desabilitar (ou não) o botão; o
// teste confere essa suposição contra o handler real em items.ts.
// ─────────────────────────────────────────────────────────────────────────────
const ACOES_GRAFICA = [
  { acao: "Produzir",                  rota: `app.patch("/api/items/:id/start-production"`, barrada: true,  marca: "`button-production-${item.id}`",          gate: "disabled={!!selo}" },
  { acao: "Reaproveitar",              rota: `app.post("/api/items/:id/mark-reuse"`,        barrada: true,  marca: "`button-reuse-${item.id}`",               gate: "disabled={!!selo}" },
  { acao: "Corrigir reaproveitamento", rota: `app.post("/api/items/:id/correct-reuse"`,     barrada: true,  marca: "`button-correct-reuse-${item.id}`",       gate: "disabled={!!selo}" },
  { acao: "Aumentar quantidade",       rota: `app.post("/api/items/:id/complement"`,        barrada: true,  marca: "`button-aumentar-quantidade-${item.id}`", gate: "disabled={!!selo}" },
  { acao: "Conferir",                  rota: `app.post("/api/items/:id/confer"`,            barrada: false, marca: "`button-confer-${item.id}`",              gate: null },
  { acao: "Registrar entrega",         rota: `app.patch("/api/items/:id/deliver"`,          barrada: false, marca: "`button-deliver-${item.id}`",             gate: null },
  { acao: "Cancelar complemento",      rota: `app.delete("/api/items/:id/complement"`,      barrada: false, marca: "`button-cancel-complement-${item.id}`",   gate: null },
] as const;

const ACOES_REVISAO = [
  { acao: "Liberar para produção", rota: `app.patch("/api/items/:id/creator-review"`,  barrada: true,  marca: "button-release-modal",      gate: "disabled={!!seloSelecionado" },
  { acao: "Devolver para Arte",    rota: `app.patch("/api/items/:id/return-to-arte"`,  barrada: true,  marca: "button-return-toggle",      gate: "disabled={!!seloSelecionado}" },
  { acao: "Devolver em lote",      rota: `app.patch("/api/items/bulk-return-to-arte"`, barrada: true,  marca: null,                        gate: null },
  { acao: "Salvar observação",     rota: `app.patch("/api/items/:id"`,                 barrada: true,  marca: "button-save-observations",  gate: "disabled={!!seloSelecionado" },
  { acao: "Marcar reaproveitamento", rota: `app.patch("/api/items/:id"`,               barrada: true,  marca: "`button-reuse-${item.id}`", gate: "disabled={!!selo}" },
  { acao: "Excluir peça",          rota: `app.delete("/api/items/:id"`,                barrada: false, marca: "`button-delete-${item.id}`", gate: null },
] as const;

describe.each([
  ["Gráfica", GRAFICA, ACOES_GRAFICA] as const,
  ["Revisão Final", REVISAO, ACOES_REVISAO] as const,
])("%s — cada botão bate com a rota dele", (_tela, fonte, acoes) => {
  it.each(acoes.map(a => [a.acao, a] as const))(
    "%s: a suposição da tela é a mesma do handler em items.ts",
    (_nome, a) => {
      expect(rotaBarrada(a.rota)).toBe(a.barrada);
    },
  );

  it.each(acoes.filter(a => a.marca !== null).map(a => [a.acao, a] as const))(
    "%s: o botão está desabilitado se — e só se — a rota barra",
    (_nome, a) => {
      const jsx = botao(fonte, a.marca!);
      if (a.barrada) {
        expect(jsx).toContain(a.gate!);
        // Desabilitar sem dizer por quê devolve o mesmo silêncio que esconder
        // a peça criava: o `title` é obrigatório, e sai da fonte única.
        expect(jsx).toContain("motivoAcaoBloqueada(");
      } else {
        // Conferir, entregar, cancelar complemento e excluir são as exceções
        // que a guarda abriu DE PROPÓSITO. Desabilitá-las aqui recriaria, com
        // outro nome, o buraco que esconder a peça abria.
        expect(jsx).not.toContain("motivoAcaoBloqueada(");
        expect(jsx).not.toContain("disabled={!!selo");
      }
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
describe("o selo na linha — a contrapartida de mostrar", () => {
  it.each([
    ["Gráfica", GRAFICA],
    ["Revisão Final", REVISAO],
  ])("%s marca a peça na LINHA e no CARD do celular", (_nome, fonte) => {
    expect(fonte).toContain("seloPecaEventoFinalizado");
    expect(fonte).toContain("badge-evento-finalizado-${item.id}");
    expect(fonte).toContain("badge-evento-finalizado-mobile-${item.id}");
  });

  it("o rótulo começa em EVENTO — o que acabou não foi a peça", () => {
    const encerrado = seloPecaEventoFinalizado({ status: EVENT_CLOSED_STATUS }, HOJE)!;
    const realizado = seloPecaEventoFinalizado({ startDate: "2026-08-13" }, HOJE)!;
    expect(encerrado.label).toBe("Evento encerrado");
    expect(realizado.label).toBe("Evento realizado");
  });

  it("evento em jogo não ganha selo nenhum", () => {
    expect(seloPecaEventoFinalizado({ startDate: "2026-08-20" }, HOJE)).toBeNull();
    // No DIA do evento a peça ainda conta: a regra é "passou o dia".
    expect(seloPecaEventoFinalizado({ startDate: "2026-08-14" }, HOJE)).toBeNull();
  });

  it("o selo traz fundo E borda — o marco da trilha só tinha bolinha", () => {
    const s = seloPecaEventoFinalizado({ status: EVENT_CLOSED_STATUS }, HOJE)!;
    expect(s.bg).toBe("#f5f5f4");
    expect(s.border).toBe("#e7e5e4");
    // #44403c sobre #f5f5f4 → 9,42:1; passa AA 4,5:1 nos 10px do selo.
    expect(s.text).toBe("#44403c");
  });

  it("nenhuma cor PROIBIDA da casa entra como cor de texto", () => {
    for (const ev of [{ status: EVENT_CLOSED_STATUS }, { startDate: "2026-08-13" }]) {
      const s = seloPecaEventoFinalizado(ev, HOJE)!;
      expect(["#f97316", "#a8a29e"]).not.toContain(s.text);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("a frase do botão bloqueado", () => {
  it("encerrado à mão OFERECE a volta; realizado não oferece nada", () => {
    expect(motivoAcaoBloqueada("encerrado", "produzir")).toContain("Reabrir o evento");
    // A palavra "reabrir" não entra nem para ser negada — a leitura apressada
    // leva embora só a oferta. Mesmo cuidado de `avisoPecasOcultas`.
    expect(motivoAcaoBloqueada("realizado", "produzir").toLowerCase()).not.toContain("reabrir");
  });

  it("diz qual ação está bloqueada, e que conferir e entregar não estão", () => {
    const f = motivoAcaoBloqueada("realizado", "liberar para produção");
    expect(f).toContain("liberar para produção");
    expect(f).toContain("Conferência e entrega continuam liberadas");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// O LOTE MISTO. O servidor já sabe lidar: item barrado entra na lista de erros
// e os outros passam; 409 só quando o lote INTEIRO caiu por esta regra. A tela
// não pode contradizer isso — nem mandando o que sabe que vai voltar (o
// contador do botão viraria mentira), nem bloqueando o lote todo por causa de
// uma peça (puniria a seleção grande, que é para o que o lote existe).
// ─────────────────────────────────────────────────────────────────────────────
describe("Revisão Final — lote misto", () => {
  it("o servidor trata lote misto item a item, com 409 só no lote inteiro", () => {
    const guarda = ler("server/routes/eventoFinalizado.ts");
    expect(guarda).toContain("respondeLoteInteiro");
    const lote = handlerDaRota(`app.patch("/api/items/bulk-return-to-arte"`);
    // Registra o barrado e SEGUE (continue) — não sai no primeiro.
    expect(lote).toContain("bloqueio.registra(motivoEvento)");
    expect(lote).toContain("bloqueio.respondeLoteInteiro(res, results.length, itemIds.length)");
  });

  it("a tela separa a seleção e manda só as vivas", () => {
    expect(REVISAO).toContain("const selecaoLote");
    // O que vai para as duas mutations é `selecaoLote.vivas`, nunca a seleção
    // crua — senão o "Liberar (12)" mandaria 12 e faria 9.
    expect(REVISAO).toContain("bulkReleaseMutation.mutate(selecaoLote.vivas)");
    expect(REVISAO).toContain("ids: selecaoLote.vivas");
    expect(REVISAO).not.toContain("bulkReleaseMutation.mutate(Array.from(selectedItemIds))");
  });

  it("o contador do botão é o das peças que de fato vão", () => {
    const liberar = botao(REVISAO, "button-bulk-release-hero");
    const devolver = botao(REVISAO, "button-bulk-return-hero");
    for (const jsx of [liberar, devolver]) {
      expect(jsx).toContain("selecaoLote.vivas.length");
      // Espelho do 409 de lote inteiro: nada vivo na seleção → botão apagado,
      // com o motivo no `title`.
      expect(jsx).toContain("disabled={selecaoLote.vivas.length === 0");
      expect(jsx).toContain("Toda a seleção é de evento finalizado");
    }
  });

  it("o que fica de fora é dito ANTES do clique, e com o motivo", () => {
    expect(REVISAO).toContain("avisoLoteFinalizadas");
    expect(REVISAO).toContain("aviso-lote-evento-finalizado");
    expect(REVISAO).toContain("aviso-bulk-release-finalizadas");
    expect(REVISAO).toContain("aviso-bulk-return-finalizadas");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// OS CONTADORES. Uma regra por tela, e é a mesma que o Painel Geral adotou:
// todo número segue o RECORTE VISÍVEL. O que a regra deve — "18 A PRODUZIR" sem
// dizer que 6 são de evento morto — é pago por um contador dedicado em cada
// tela. Sem ele, a regra vira cobrança falsa.
// ─────────────────────────────────────────────────────────────────────────────
describe("contadores", () => {
  it("Gráfica: os KPIs seguem o statsPool e o chip diz quanto dele já acabou", () => {
    // `statsPool` é o recorte visível sem os filtros com forma de status; foi
    // ele que passou a incluir as peças de evento finalizado, e é dele que o
    // chip conta — chip e KPI não podem contar populações diferentes.
    expect(GRAFICA).toContain("const finalizadasNoRecorte");
    expect(GRAFICA).toContain("for (const i of statsPool)");
    expect(GRAFICA).toContain("chip-evento-finalizado");
  });

  it("Revisão Final: 'Aguardando' volta a contar tudo, com o contrapeso ao lado", () => {
    expect(REVISAO).toContain("item.status === REVIEW_STATUS");
    expect(REVISAO).toContain("chip-evento-finalizado");
    expect(REVISAO).toContain("Evento finalizado:");
  });
});
