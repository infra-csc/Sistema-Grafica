// ─────────────────────────────────────────────────────────────────────────────
// KIT — usuário do Kit, peça do Kit com quem criou, e o filtro "o usuário do
// Kit só vê as dele" (14/09); SIMPLIFICADO em 23/10: uma inclusão só por
// evento, sem datas próprias — o Kit segue os prazos do evento a partir da
// Entrega de layouts (era a Aprovação até 26/10).
//
// O SERVIDOR (schema, login, inclusão do Kit, recorte das listas, criação,
// Entrada Rápida, importação, eventos, prazos, busca, trilha, sino, fotos e
// planilha) roda de verdade em regras-fluxo-kit.test.ts. A junção das remessas
// antigas (migração 0009) roda em kit-inclusao-unica.test.ts.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { fonteDaTela } from "./fonte-da-tela";
import { fonteDoComponente } from "./fonte-dos-componentes";
import { fonteDasRotasDeItens } from "./fonte-das-rotas-de-itens";
import { fonteDaGrafica } from "./fonte-da-grafica";
import { gatesDaGrafica } from "../../client/src/components/grafica/fila/regras";
import { lerTelaOuArquivo } from "./fonte-das-telas-da-arte";
import {
  pecaVisivelPara,
  podeIncluirNoKit,
  textoDoSeloKit,
  grupoDoKit,
  kitCobradoNoMarco,
  MARCOS_QUE_NAO_COBRAM_O_KIT,
  DETALHE_DO_SELO_KIT,
} from "@shared/kit";
import * as kit from "@shared/kit";
import {
  buildEventPrazo, marcoIndexFor, KIT_STAGE_INDEX, APROVACAO_STAGE_INDEX, FINALIZACAO_STAGE_INDEX, STAGE_DEFS,
  type DomainEvent, type DomainItem,
} from "../services/prazo-domain";
import { businessDayStrToMs } from "@shared/prazo-dates";
import { faseDoPrazo, isAtrasadaNaFase, phaseDeadline } from "../../client/src/lib/arte-rules";
import { estaAtrasDoMarco } from "../../client/src/components/detalhe-do-evento/regras";
import { montarPainelOperacional, type PecaDoPainel } from "@shared/painel-operacional";
import { computeKpis } from "../services/prazo-domain";

// Arte, Revisão e Vinculação são lidas como a área inteira (página + pasta).
const ler = (rel: string) => lerTelaOuArquivo(rel);
const ITEMS = fonteDasRotasDeItens();
const AUTH = ler("server/routes/auth.ts");
const ROUTES = ler("server/routes.ts");
const IMPORT = ler("server/services/xlsxImport.ts");
const USUARIOS = ler("client/src/pages/usuarios.tsx");
const EVENTO = fonteDaTela("detalhe-do-evento");

describe("regras puras do Kit", () => {
  it("usuário do Kit só vê as peças do Kit que ele criou; o resto vê tudo", () => {
    const k = { kit: true, userId: "u1" };
    expect(pecaVisivelPara(k, { kitRemessaId: "r1", criadoPorId: "u1" })).toBe(true);
    expect(pecaVisivelPara(k, { kitRemessaId: "r1", criadoPorId: "u2" })).toBe(false);
    expect(pecaVisivelPara(k, { kitRemessaId: null, criadoPorId: "u1" })).toBe(false);
    expect(pecaVisivelPara({ kit: false, userId: "u9" }, { kitRemessaId: "r1", criadoPorId: "u1" })).toBe(true);
    expect(pecaVisivelPara({ kit: false, userId: "u9" }, { kitRemessaId: null, criadoPorId: null })).toBe(true);
  });

  it("quem põe peça no Kit do evento: admin, Solicitação e o usuário do Kit (a inclusão é do EVENTO)", () => {
    expect(podeIncluirNoKit({ role: "admin" })).toBe(true);
    expect(podeIncluirNoKit({ role: "solicitacao" })).toBe(true);
    expect(podeIncluirNoKit({ role: "solicitacao", kit: true })).toBe(true);
    expect(podeIncluirNoKit({ role: "arte" })).toBe(false);
    expect(podeIncluirNoKit({ role: "atendimento" })).toBe(false);
    // A régua antiga por remessa ("só a remessa que ELE criou") saiu com as remessas.
    expect("remessaUtilizavelPor" in kit).toBe(false);
  });

  it("selo e grupo: só 'KIT', sem data (23/10)", () => {
    expect(textoDoSeloKit()).toBe("KIT");
    expect(grupoDoKit({ kitRemessaId: "r1" })).toBe("KIT");
    expect(grupoDoKit({ kitRemessaId: null })).toBeNull();
    expect(DETALHE_DO_SELO_KIT).toContain("Entrega de layouts");
    // As funções das datas e das remessas sumiram do módulo.
    for (const nome of ["eventoComDatasDoKit", "ancoraDoKit", "diaMesDoKit", "rotuloDaRemessa", "detalheDaRemessa"]) {
      expect(nome in kit, nome).toBe(false);
    }
    const SELO = ler("client/src/components/kit/selo-kit.tsx");
    expect(SELO).toContain("{TEXTO_DO_SELO_KIT}");
    expect(SELO).toContain("title={DETALHE_DO_SELO_KIT}");
    expect(SELO).not.toContain("entregaMaterial");
  });
});

// ─── PRAZOS DO KIT: os marcos do evento, da Entrega de layouts em diante (26/10) ─

const HOJE = "2026-10-23";
const HOJE_MS = businessDayStrToMs(HOJE);
// Saída em 05/11: Lista (−25) e Layouts (−20) já venceram; Aprovação (−12 → 24/10) ainda não.
const EVENTO_E1: DomainEvent = { id: "e1", name: "Copa Norte", status: "created", startDate: "2026-11-07", truckDepartureDate: "2026-11-05T08:00:00.000Z" };
const pecaD = (id: string, status: string, kitRemessaId: string | null = null, over: Partial<DomainItem> = {}): DomainItem & { kitRemessaId: string | null } => ({
  id, displayId: `#${id}`, status, type: "Banner", quantity: 1, kitRemessaId, ...over,
});

describe("prazos do Kit pelos marcos do evento (dono, 23/10)", () => {
  it("só a Lista de imagens não cobra o Kit; da Entrega de layouts em diante, sim (26/10)", () => {
    expect(Array.from(MARCOS_QUE_NAO_COBRAM_O_KIT)).toEqual(["listaImagens"]);
    for (const def of STAGE_DEFS) {
      expect(kitCobradoNoMarco(def.key), def.key).toBe(def.key !== "listaImagens");
    }
    expect(KIT_STAGE_INDEX).toBe(STAGE_DEFS.findIndex((s) => s.key === "layouts"));
  });

  it("marcoIndexFor: a peça do Kit na Lista é medida pela Entrega de layouts; nos Layouts, pelos Layouts", () => {
    const LISTA = STAGE_DEFS.findIndex((s) => s.key === "listaImagens");
    const LAYOUTS = STAGE_DEFS.findIndex((s) => s.key === "layouts");
    expect(marcoIndexFor("requested")).toBe(LISTA);
    expect(marcoIndexFor("requested", false, true)).toBe(LAYOUTS);
    expect(marcoIndexFor("awaiting_submission")).toBe(LAYOUTS);
    expect(marcoIndexFor("awaiting_submission", false, true)).toBe(LAYOUTS);
    // Da Aprovação em diante a peça do Kit é cobrada como qualquer outra.
    expect(marcoIndexFor("awaiting_sponsor_approval", false, true)).toBe(APROVACAO_STAGE_INDEX);
    expect(marcoIndexFor("ready_for_production", false, true)).toBe(marcoIndexFor("ready_for_production"));
    // Kit isento de aprovação: vale a regra mais adiante (Finalização).
    expect(marcoIndexFor("awaiting_submission", true, true)).toBe(FINALIZACAO_STAGE_INDEX);
  });

  it("Gestão de Prazos: UMA linha por evento; o Kit é cobrado pela Entrega de layouts, não pela Lista", () => {
    // Só peças do Kit em Lista e Layouts: as duas já venceram; a Lista não cobra
    // o Kit, a Entrega de layouts sim (26/10) — o evento fica vermelho nela.
    const soKit = buildEventPrazo(EVENTO_E1, [pecaD("k1", "requested", "inc"), pecaD("k2", "awaiting_submission", "inc")], { today: HOJE_MS })!;
    expect(soKit.id).toBe("e1");
    expect(soKit.name).toBe("Copa Norte");
    expect(soKit.truckDepartureDate).toBe("2026-11-05T08:00:00.000Z");
    expect(soKit.categoria).toBe("atrasado");
    expect(soKit.stages.find((s) => s.key === "listaImagens")!.directCount).toBe(0);
    expect(soKit.stages.find((s) => s.key === "listaImagens")!.state).not.toBe("overdue");
    expect(soKit.stages.find((s) => s.key === "layouts")!.directCount).toBe(2);
    expect(soKit.stages.find((s) => s.key === "layouts")!.state).toBe("overdue");
    expect(soKit.stages.find((s) => s.key === "aprovacao")!.directCount).toBe(0);
    expect(soKit.pendingItems.every((p) => p.marcoIndex === KIT_STAGE_INDEX)).toBe(true);
    // A mesma peça da Arena acende a Lista de imagens vencida.
    const arena = buildEventPrazo(EVENTO_E1, [pecaD("a1", "requested")], { today: HOJE_MS })!;
    expect(arena.categoria).toBe("atrasado");
    expect(arena.stages.find((s) => s.key === "listaImagens")!.state).toBe("overdue");
    // Misturado: um evento, as contagens somadas — nada de "Copa Norte · KIT".
    const misto = buildEventPrazo(EVENTO_E1, [pecaD("a1", "requested"), pecaD("k1", "requested", "inc")], { today: HOJE_MS })!;
    expect(misto.totalItems).toBe(2);
    expect(misto.stages.find((s) => s.key === "listaImagens")!.directCount).toBe(1);
    expect(misto.stages.find((s) => s.key === "aprovacao")!.pendingCount).toBe(2);
  });

  it("o desdobramento por remessa saiu do domínio, das rotas e do fecho diário", async () => {
    const dominio = await import("../services/prazo-domain");
    for (const nome of ["eventosDoPrazo", "comKit", "idDoEventoReal"]) expect(nome in dominio, nome).toBe(false);
    for (const arquivo of ["server/routes/prazos.ts", "server/services/prazoSnapshots.ts", "server/services/painel-operacional.ts"]) {
      const fonte = ler(arquivo);
      expect(fonte, arquivo).not.toContain("eventosDoPrazo");
      expect(fonte, arquivo).not.toContain("#kit-");
      expect(fonte, arquivo).not.toContain("kitRemessas");
    }
    // O próximo marco do card do evento usa a mesma regra.
    expect(ler("server/routes/events.ts")).toContain("const marco = marcoIndexFor(statusParaContagem(it), it.skipApproval, !!it.kitRemessaId);");
    // Os alertas de prazo do Kit pela entrega do material deixaram de existir.
    const ALERTAS = ler("server/services/deadlineAlerts.ts");
    expect(ALERTAS).not.toContain("kitRemessas");
    expect(ALERTAS).not.toContain("· KIT");
  });

  it("Arte: 'Enviar thumb' e a correção do Kit vencem na Entrega de Layouts, como as outras (26/10)", () => {
    expect(faseDoPrazo("criar-aprovacoes", { kitRemessaId: "inc" })).toBe("criar-aprovacoes");
    expect(faseDoPrazo("correcao", { kitRemessaId: "inc" })).toBe("correcao");
    expect(faseDoPrazo("finalizar-layouts", { kitRemessaId: "inc" })).toBe("finalizar-layouts");
    expect(faseDoPrazo("criar-aprovacoes", { kitRemessaId: null })).toBe("criar-aprovacoes");
    // Saída 05/11: Layouts vence 16/10 (já foi), Aprovação 24/10 (amanhã).
    const evento = { truckDepartureDate: EVENTO_E1.truckDepartureDate as string, name: "Copa Norte" };
    const hoje = new Date(2026, 9, 23);
    expect(phaseDeadline(evento, "criar-aprovacoes", hoje)!.label).toBe("Entrega de Layouts");
    expect(isAtrasadaNaFase({ event: evento, kitRemessaId: null }, "criar-aprovacoes", hoje)).toBe(true);
    expect(isAtrasadaNaFase({ event: evento, kitRemessaId: "inc" }, "criar-aprovacoes", hoje)).toBe(true);
  });

  it("Detalhe do Evento: a agenda não conta o Kit atrás da Lista; dos Layouts em diante, conta", () => {
    expect(estaAtrasDoMarco("requested", 0)).toBe(true);
    expect(estaAtrasDoMarco("requested", 0, true)).toBe(false);
    expect(estaAtrasDoMarco("awaiting_submission", 1, true)).toBe(true);
    expect(estaAtrasDoMarco("awaiting_submission", 2, true)).toBe(true);
    expect(estaAtrasDoMarco("ready_for_production", 5, true)).toBe(true);
  });
});

describe("Análises: a peça do Kit cai no PRÓPRIO evento (sem 'Evento · KIT')", () => {
  it("um evento com peças da Arena e do Kit vira UMA linha, e toda peça aponta para ela", () => {
    const pecaP = (id: string, status: string, kitRemessaId: string | null): PecaDoPainel => ({
      id, displayId: id, eventId: "e1", kitRemessaId, status, type: "Banner", description: id, measurement: "1x1",
      material: "lona", finish: "ilhos", quantity: 2, reuseQty: 0, fileWidth: "1", fileHeight: "1", visualWidth: null, visualHeight: null,
      skipApproval: false, isPriority: false, parentItemId: null, complementReason: null, rejectedBySponsor: false, rejectedByCreator: false,
      createdAt: new Date("2026-10-01T15:00:00Z"), producedAt: new Date("2026-10-22T15:00:00Z"),
    });
    const pecas = [pecaP("a1", "ready_for_production", null), pecaP("k1", "ready_for_production", "inc-1"), pecaP("k2", "produced", "inc-1")];
    const prazo = buildEventPrazo(EVENTO_E1, pecas as never, { today: HOJE_MS })!;
    const painel = montarPainelOperacional({
      pecas, prazos: [prazo], kpis: computeKpis([prazo]), hoje: HOJE, geradoEm: new Date().toISOString(),
      nomeDoEvento: new Map([["e1", "Copa Norte"]]),
    });
    expect(painel.eventos.map((e) => e.chave)).toEqual(["e1"]);
    expect(painel.eventos[0].totalPecas).toBe(3);
    expect(new Set(painel.pecas.map((p) => p.evento))).toEqual(new Set(["e1"]));
    expect(Object.values(painel.nomes).some((n) => n.includes("KIT"))).toBe(false);
    expect(painel.prodRealizado.every((l) => l.evento === "e1")).toBe(true);
  });
});

describe("planilha do Kit (a inclusão continua pela planilha, sem datas)", () => {
  it("lê o cabeçalho do template (o reconhecimento do Kit continua igual)", async () => {
    const { cabecalhoDoKit, dataDaPlanilha } = await import("@shared/kit");
    expect(dataDaPlanilha("46279")).toBe("2026-09-14");
    expect(dataDaPlanilha("20/09/2026")).toBe("2026-09-20");
    expect(dataDaPlanilha("texto")).toBeNull();
    const c = cabecalhoDoKit([
      { rotulo: "Data Solicitação", valor: "46268" },
      { rotulo: "Solicitante", valor: "BRUNO FERREIRA" },
      { rotulo: "Departamento", valor: "Kit" },
      { rotulo: "Versão do Pedido", valor: "V1" },
      { rotulo: "Data de Entrega do material: ", valor: "46279" },
      { rotulo: "Data do Evento", valor: "46285" },
      { rotulo: "Data Carrega caminhão", valor: "46280" },
      { rotulo: "Data Saída Caminhão", valor: "46280" },
    ], "MANGARATIBA");
    expect(c).toMatchObject({ evento: "MANGARATIBA", versao: "V1", solicitante: "BRUNO FERREIRA", departamento: "Kit" });
    expect(cabecalhoDoKit([{ rotulo: "item", valor: "qtde" }], null)).toBeNull();
  });

  it("importar: modal Arena ou Kit; Kit sem formulário de datas e sem escolher remessa", () => {
    const DIALOGO = fonteDoComponente("client/src/components/import-xlsx-dialog.tsx");
    const DESTINO = ler("client/src/components/kit/destino-da-importacao.tsx");
    expect(DIALOGO).toContain("onClick={() => { if (importPreviewItems.length > 0 && comQtdInvalida.length === 0) setEscolhendoDestino(true); }}");
    expect(DESTINO).toContain('title="Estas peças são da Arena ou do Kit?"');
    expect(DESTINO).toContain('bloqueio: somenteKit ? "Usuário do Kit importa só peças do Kit." : undefined');
    expect(DESTINO).toContain('onConfirmar({ tipo: "kit", kit: {');
    for (const velho of ['type="date"', "Nova remessa", "select-destino-remessa", "entregaMaterial"]) expect(DESTINO, velho).not.toContain(velho);
    // O servidor põe as peças na inclusão do evento DENTRO da transação.
    expect(IMPORT).toContain("const r = await obterOuCriarInclusaoDoKit(tx, p.eventId, p.req, p.kit);");
    // O cabeçalho vem da aba do Kit quando é ela a lida (21/10, pasta com abas).
    expect(IMPORT).toContain("kit: lerCabecalhoDoKit(file.buffer, { abaDoKit: leuAbaDoKit ? leitura.arquivoDaAba : null }),");
  });

  it("painel do Kit: 'Incluir peças do Kit (planilha)' → prévia → incluir; sem remessas, datas ou edição", () => {
    const PAINEL_KIT = ler("client/src/components/kit/painel-do-kit.tsx");
    expect(PAINEL_KIT).toContain("Incluir peças do Kit (planilha)");
    expect(PAINEL_KIT).toContain('data-testid="button-planilha-kit"');
    // Para o Kit: numa pasta com as abas "KIT" e "Arena", vale a do Kit (21/10).
    expect(PAINEL_KIT).toContain('fetch(`/api/events/${eventId}/preview-xlsx${consultaDaPrevia("kit", aba)}`');
    expect(PAINEL_KIT).toContain("kit: { solicitante: planilha.solicitante, departamento: planilha.departamento },");
    expect(PAINEL_KIT).toContain("{ocioso ? \"Kit\" : `Kit · ${pecas1(n)}`}");
    for (const velho of ["button-nova-remessa-kit", "button-editar-remessa", "button-excluir-remessa", "kitNovaRemessa", 'type="date"', "entregaMaterial", "/api/kit/remessas/"]) {
      expect(PAINEL_KIT, velho).not.toContain(velho);
    }
  });
});

describe("selo KIT nas etapas", () => {
  it("Arte, Atendimento, Revisão, Painel Geral, Gráfica e Vincular mostram o selo", () => {
    for (const arquivo of [
      "client/src/components/arte/celulas-da-peca.tsx",
      "client/src/components/arte/cartao-da-correcao.tsx",
      "client/src/components/atendimento/cartao-da-peca.tsx",
      "client/src/components/atendimento/linha-do-lote.tsx",
      "client/src/components/atendimento/linha-do-historico.tsx",
      "client/src/components/atendimento/cabecalho-da-revisao.tsx",
      "client/src/components/revisao/linha-da-peca.tsx",
      "client/src/components/revisao/cartao-da-peca.tsx",
      "client/src/components/revisao/modal-de-decisao.tsx",
      "client/src/components/painel/linha-da-peca.tsx",
      "client/src/components/painel/cartao-da-peca.tsx",
      "client/src/components/grafica/fila/linha-da-tabela.tsx",
      "client/src/components/vinculacao/modal-confirmar-envio.tsx",
    ]) {
      const fonte = ler(arquivo);
      expect(fonte, arquivo).toContain('import { SeloKit } from "@/components/kit/selo-kit";');
      expect(fonte, arquivo).toContain("<SeloKit peca={");
    }
  });
});

describe("a peça do Kit enxerga o MESMO evento (23/10)", () => {
  it("peças enriquecidas e o delta do cliente não trocam mais as datas do evento", async () => {
    expect(ITEMS).toContain("event: eventById.get(item.eventId),");
    expect(ITEMS).not.toContain("eventoComDatasDoKit");
    const { aplicarDelta } = await import("../../client/src/lib/queryClient");
    const arena = { id: "e1", name: "Arena", truckDepartureDate: "2026-09-20T08:00:00Z", startDate: "2026-09-21T00:00:00Z" };
    const pecaDoKit = { id: "p1", eventId: "e1", createdAt: "2026-09-01T00:00:00Z", event: arena, sponsors: [], kitRemessaId: "r1" };
    const renomeado = { ...arena, name: "Arena Renomeada" };
    const [depois] = aplicarDelta([pecaDoKit], { delta: true, itens: [], removidas: [], eventos: [renomeado], patrocinadores: [] }, null);
    expect(depois.event).toEqual(renomeado);
  });

  it("Arte e Revisão: o Kit fica no bloco do evento (sem '· KIT' nem chave '#kit-'), na mesma ordem das outras (26/10)", () => {
    const ARTE = ler("client/src/pages/arte.tsx");
    expect(ARTE).toContain("const chave = eventKey;");
    expect(ARTE).not.toContain("#kit-");
    expect(ARTE).not.toContain("datasDoKit");
    // A Arte ordena pela Entrega de Layouts: o Kit não fura mais a fila.
    expect(ARTE).not.toContain("Number(!!b.kitRemessaId) - Number(!!a.kitRemessaId)");
    expect(ARTE).toContain('data-testid="faixa-kit"');
    const REVISAO = ler("client/src/pages/solicitacao.tsx");
    expect(REVISAO).toContain('const key = item.eventId || "__none__";');
    expect(REVISAO).not.toContain("#kit-");
    expect(REVISAO).not.toContain("Entrega do material");
    expect(fonteDaTela("atendimento")).toContain("isEventoAtrasadoNaAprovacao(eventoPorId.get(item.eventId), hoje)");
    // O drill aponta para o evento.
    expect(ler("client/src/components/prazos/event-drilldown.tsx")).toContain("href={`/eventos/${ev.eventId ?? ev.id}`}");
  });
});

describe("Solicitação da Arena e o Kit (15/09)", () => {
  it("Revisão sem Kit para a Solicitação da Arena e sem rolagem; Gráfica só visualiza; servidor barra a escrita", () => {
    const REVISAO = ler("client/src/pages/solicitacao.tsx");
    // A régua mora em @shared/revisao-final desde 26/10 (a mesma do número no menu).
    expect(REVISAO).toContain("pecasParaRevisar(items, user)");
    expect(ler("shared/revisao-final.ts")).toContain('&& !(user?.role === "solicitacao" && !user?.kit && item.kitRemessaId));');
    expect(REVISAO).toContain('<table style={{ width: "100%", tableLayout: "fixed", textAlign: "left", borderCollapse: "collapse" }}>');
    const pecaDoKit = { id: "p", kitRemessaId: "k1", status: "produced", quantity: 2, quantityProduced: 2, conferredQty: 0 } as never;
    const semKit = { id: "p", kitRemessaId: null, status: "produced", quantity: 2, quantityProduced: 2, conferredQty: 0 } as never;
    const arena = gatesDaGrafica({ role: "solicitacao", kit: false });
    expect(arena.soVisualizaKit(pecaDoKit)).toBe(true);
    expect(arena.soVisualizaKit(semKit)).toBe(false);
    expect(gatesDaGrafica({ role: "solicitacao", kit: true }).soVisualizaKit(pecaDoKit)).toBe(false);
    expect(gatesDaGrafica({ role: "grafica" }).soVisualizaKit(pecaDoKit)).toBe(false);
    expect(arena.canConfer(pecaDoKit)).toBe(false);
    expect(arena.canConfer(semKit)).toBe(true);
    expect(ROUTES).toContain('if (req.userRole !== "solicitacao" || req.userKit || !["POST", "PATCH", "PUT", "DELETE"].includes(req.method)) return next();');
    expect(ROUTES).toContain("Peça do Kit: a Solicitação da Arena só visualiza.");
  });

  it("Gráfica esconde aumentar, reaproveitar e cancelar complemento do Kit para a Arena", () => {
    const GRAFICA = fonteDaGrafica();
    expect(GRAFICA).toContain("const mostraAumentar = !bulkOn && !emRevisao && !soVisualizaKit(item) && podeAumentarQuantidade(item, podeMexerQtd);");
    expect(GRAFICA).toContain("{!bulkOn && !emRevisao && !pecaTravada(item) && !soVisualizaKit(item) && !isDelivered(item)");
  });
});

describe("Estoque e Triagem só do admin; Modelos fora do Kit (15/09)", () => {
  it("rotas, menu e servidor", () => {
    const APP = ler("client/src/App.tsx");
    const MENU = ler("client/src/components/app-sidebar.tsx");
    expect(APP).toContain("<RoleProtectedRoute component={Modelos} allowedRoles={ROLES_SOLICITACAO} semKit />");
    expect(MENU).toContain("&& !(item.semKit && user?.kit)");
    expect(ROUTES).toContain('if (req.userKit && req.path.startsWith("/api/standard-items")');
    expect(ler("server/routes/inventory.ts")).toContain('const requireInventoryWrite = requireRole("admin");');
    expect(ler("server/routes/estoque-reservas.ts")).toContain('const requireReservaDeEstoque = requireRole("admin");');
    expect(EVENTO).toContain('const podeReservarEstoque = user?.role === "admin";');
  });
});

describe("Ver como outro perfil (15/09)", () => {
  it("só o admin troca o perfil da sessão, /me devolve o perfil em uso e o menu tem a faixa de volta", () => {
    expect(AUTH).toContain('app.post("/api/auth/ver-como", requireAuth');
    expect(AUTH).toContain('const papelReal = req.session.papelReal ?? req.session.userRole;');
    expect(AUTH).toContain('? { role: req.session.userRole, kit: req.session.userKit === true, cultura: req.session.userCultura === true, papelReal: req.session.papelReal }');
    const APP = ler("client/src/App.tsx");
    expect(APP).toContain('data-testid="faixa-ver-como"');
    expect(APP).toContain('{ chave: "solicitacao-kit", role: "solicitacao", kit: true, rotulo: "Solicitação · Kit" },');
  });
});

describe("telas do Kit", () => {
  it("usuários: marca 'Usuário do Kit' só no perfil Solicitação", () => {
    expect(USUARIOS).toContain('{form.watch("role") === "solicitacao" && (');
    expect(USUARIOS).toContain('data-testid="checkbox-user-kit"');
    expect(USUARIOS).toContain('const kit = data.role === "solicitacao" && data.kit;');
  });

  it("evento: um bloco do Kit, 'Peça de: Arena | Kit' no formulário, selo KIT na lista, sem Entrada Rápida para o usuário do Kit", () => {
    expect(EVENTO).toContain("<PainelDoKit");
    expect(EVENTO).toContain("onAdicionarPeca={() => form.abrirNoKit()}");
    expect(EVENTO).toContain("setFormData({ ...EMPTY_ITEM_FORM, doKit: true });");
    expect(EVENTO).toContain("onAbrirPeca={(peca) => setSelectedItemForDetails(peca)}");
    expect(EVENTO).toContain('data-testid="select-item-kit"');
    expect(EVENTO).toContain('<option value="kit">Kit do evento</option>');
    expect(EVENTO).toContain("...(data.doKit ? { doKit: true } : {}),");
    expect(EVENTO).toContain('<SeloKit peca={item} style={{ marginLeft: 6 }} />');
    expect(EVENTO).toContain("trailing={!editingItem && !pedidoEmAtendimento && !user?.kit && !formData.doKit ? (");
    expect(EVENTO).not.toContain("rotuloDaRemessa");
  });
});
