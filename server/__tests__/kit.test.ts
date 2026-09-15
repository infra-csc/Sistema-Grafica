// ─────────────────────────────────────────────────────────────────────────────
// KIT — fase 1 (dono, 14/09): usuário do Kit, remessas com as datas do Kit,
// peça do Kit com quem criou, e o filtro "o usuário do Kit só vê as dele".
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import {
  pecaVisivelPara,
  remessaUtilizavelPor,
  textoDoSeloKit,
  rotuloDaRemessa,
  diaMesDoKit,
  detalheDaRemessa,
} from "@shared/kit";

const RAIZ = path.resolve(__dirname, "../..");
const ler = (rel: string) => readFileSync(path.resolve(RAIZ, rel), "utf8");
const SCHEMA = ler("shared/schema.ts");
const ITEMS = ler("server/routes/items.ts");
const EVENTS = ler("server/routes/events.ts");
const KIT = ler("server/routes/kit.ts");
const AUTH = ler("server/routes/auth.ts");
const INDEX = ler("server/index.ts");
const ROUTES = ler("server/routes.ts");
const IMPORT = ler("server/services/xlsxImport.ts");
const USUARIOS = ler("client/src/pages/usuarios.tsx");
const EVENTO = ler("client/src/pages/event-detail.tsx");

describe("regras puras do Kit", () => {
  it("usuário do Kit só vê as peças do Kit que ele criou; o resto vê tudo", () => {
    const kit = { kit: true, userId: "u1" };
    expect(pecaVisivelPara(kit, { kitRemessaId: "r1", criadoPorId: "u1" })).toBe(true);
    expect(pecaVisivelPara(kit, { kitRemessaId: "r1", criadoPorId: "u2" })).toBe(false);
    expect(pecaVisivelPara(kit, { kitRemessaId: null, criadoPorId: "u1" })).toBe(false);
    expect(pecaVisivelPara({ kit: false, userId: "u9" }, { kitRemessaId: "r1", criadoPorId: "u1" })).toBe(true);
    expect(pecaVisivelPara({ kit: false, userId: "u9" }, { kitRemessaId: null, criadoPorId: null })).toBe(true);
    expect(remessaUtilizavelPor(kit, { criadoPorId: "u2" })).toBe(false);
    expect(remessaUtilizavelPor({ kit: false, userId: "u9" }, { criadoPorId: "u2" })).toBe(true);
  });

  it("selo e rótulos: KIT · entrega dd/mm", () => {
    expect(diaMesDoKit("2026-09-20T12:00:00Z")).toBe("20/09");
    expect(textoDoSeloKit({ entregaMaterial: "2026-09-20T12:00:00Z" })).toBe("KIT · entrega 20/09");
    expect(textoDoSeloKit(null)).toBe("KIT");
    expect(rotuloDaRemessa({ versao: "V2", entregaMaterial: "2026-09-20T12:00:00Z" })).toBe("KIT V2 · entrega 20/09");
    expect(detalheDaRemessa({ versao: "V1", entregaMaterial: "2026-09-20T12:00:00Z", saidaCaminhao: "2026-09-21T12:00:00Z" }))
      .toBe("Peça do Kit — remessa V1 · entrega do material 20/09 · saída do caminhão 21/09");
  });
});

describe("servidor do Kit", () => {
  it("schema: marca no usuário, remessa com datas do Kit, peça com remessa e quem criou", () => {
    expect(SCHEMA).toContain('kit: boolean("kit").notNull().default(false),');
    expect(SCHEMA).toContain('export const kitRemessas = pgTable("kit_remessas", {');
    expect(SCHEMA).toContain('entregaMaterial: timestamp("entrega_material").notNull(),');
    expect(SCHEMA).toContain('kitRemessaId: varchar("kit_remessa_id").references((): any => kitRemessas.id, { onDelete: "set null" }),');
    expect(SCHEMA).toContain('criadoPorId: varchar("criado_por_id"),');
    expect(SCHEMA).toContain("  criadoPorId: true,\n});");
  });

  it("a marca vem do login (senha e SSO) e mudar a marca derruba as sessões", () => {
    expect(AUTH).toContain("req.session.userKit = user.kit === true;");
    expect(AUTH).toContain("if (validatedData.role !== undefined || validatedData.kit !== undefined) {");
    expect(INDEX).toContain("req.session.userKit  = entry.userKit;");
    expect(ROUTES).toContain("req.userKit = req.session.userKit === true;");
    expect(ROUTES).toContain("registerKitRoutes(app);");
  });

  it("remessas: criar é admin/Solicitação; o usuário do Kit só lista as dele", () => {
    expect(KIT).toContain('const requireCriarRemessa = requireRole("admin", "solicitacao");');
    expect(KIT).toContain('app.post("/api/kit/remessas", requireCriarRemessa');
    expect(KIT).toContain('if ((req as any).userKit) condicoes.push(eq(kitRemessas.criadoPorId, (req as any).userId ?? ""));');
  });

  it("peças: filtro do usuário do Kit nas listas, na criação e na importação", () => {
    expect(ITEMS).toContain("const allItems = (await storage.getAllItems()).filter((i) => pecaVisivelPara(quemVe(req), i));");
    expect(ITEMS).toContain("(await storage.getItemsByEvent(req.params.eventId)).filter((i) => pecaVisivelPara(quemVe(req), i));");
    expect(ITEMS).toContain("removidas: mudadas.filter((i) => i.deletedAt || !pecaVisivelPara(quemVe(req), i)).map((i) => i.id),");
    expect(ITEMS).toContain('return res.status(400).json({ error: "Usuário do Kit cria só peça do Kit — escolha a remessa do Kit." });');
    expect(ITEMS).toContain("(validatedData as any).criadoPorId = req.userId ?? null;");
    expect(IMPORT).toContain("criadoPorId: (req as any).userId ?? null,");
    expect(IMPORT).toContain("Usuário do Kit importa só peças do Kit");
  });

  it("eventos: o do Kit vê os eventos com as contagens só das peças dele; enviar separa Kit e Arena", () => {
    expect(EVENTS).toContain("if (!it.kitRemessaId || it.criadoPorId !== userId) continue;");
    expect(EVENTS).toContain("? todasAsPecas.filter((i) => !!i.kitRemessaId && i.criadoPorId === userIdKit)");
    expect(EVENTS).toContain("(isAdmin || (doKit ? (!!item.kitRemessaId && item.criadoPorId === userId) : !item.kitRemessaId)));");
  });
});

describe("planilha do Kit e filtros (fase 2)", () => {
  it("lê o cabeçalho do template (datas em série do Excel)", async () => {
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
    expect(c).toEqual({
      evento: "MANGARATIBA", versao: "V1", solicitante: "BRUNO FERREIRA", departamento: "Kit",
      dataSolicitacao: "2026-09-03", entregaMaterial: "2026-09-14", dataEvento: "2026-09-20",
      cargaCaminhao: "2026-09-15", saidaCaminhao: "2026-09-15",
    });
    expect(cabecalhoDoKit([{ rotulo: "item", valor: "qtde" }], null)).toBeNull();
  });

  it("importar: modal Arena ou Kit antes de importar; remessa nova nasce na importação", () => {
    const DIALOGO = ler("client/src/components/import-xlsx-dialog.tsx");
    const DESTINO = ler("client/src/components/kit/destino-da-importacao.tsx");
    expect(DIALOGO).toContain("onClick={() => { if (importPreviewItems.length > 0) setEscolhendoDestino(true); }}");
    expect(DESTINO).toContain('title="Estas peças são da Arena ou do Kit?"');
    expect(DESTINO).toContain('bloqueio={somenteKit ? "Usuário do Kit importa só peças do Kit." : undefined}');
    expect(IMPORT).toContain("const criada = await criarRemessa(req, dadosRemessa.data);");
    expect(IMPORT).toContain("kit: lerCabecalhoDoKit(file.buffer)");
    // Nova remessa à mão também pode vir preenchida pelo template (14/09).
    const PAINEL_KIT = ler("client/src/components/kit/painel-do-kit.tsx");
    // Tela só: planilha preenche a remessa E traz as peças; próximas remessas
    // começam com os dados da última.
    expect(PAINEL_KIT).toContain('data-testid="button-planilha-remessa-kit"');
    expect(PAINEL_KIT).toContain("fetch(`/api/events/${eventId}/preview-xlsx`");
    expect(PAINEL_KIT).toContain("kitNovaRemessa: remessa,");
    expect(PAINEL_KIT).toContain("solicitante: ultima?.solicitante || nomeDoUsuario,");
  });

  it("o usuário do Kit fica no recorte dele em todas as leituras", () => {
    expect(ITEMS).toContain("const pendingItems = (await storage.getPendingItems()).filter((i) => pecaVisivelPara(quemVe(req), i));");
    expect(ITEMS).toContain("const approvedItems = (await storage.getApprovedItems()).filter((i) => pecaVisivelPara(quemVe(req), i));");
    expect(ITEMS).toContain("A Entrada Rápida não cria peça do Kit");
    expect(ler("server/routes/prazos.ts")).toContain("(!doKit || (!!i.kitRemessaId && i.criadoPorId === (req as any).userId))");
    expect(ler("server/routes/busca.ts")).toContain("!(req as any).userKit || (!!p.kitRemessaId && p.criadoPorId === (req as any).userId)");
    expect(ler("server/routes/versoes.ts")).toContain("const dados = await doUsuario(req, await carregar());");
    expect(ler("server/routes/audit-logs.ts")).toContain('logs = logs.filter((l: any) => l.userId === userId || (l.entityType === "item" && minhas.has(l.entityId)));');
    expect(ler("server/routes/notifications.ts")).toContain("const minhasDoKit = (req as any).session?.userKit === true");
    expect(ler("server/routes/photos.ts")).toContain("return res.json(fotos.filter((f: any) => minhas.has(f.itemId)));");
    expect(ler("server/services/xlsxExport.ts")).toContain("const doKit = (req as any).userKit === true;");
  });
});

describe("selo KIT nas etapas (fase 3)", () => {
  it("Arte, Atendimento, Revisão, Painel Geral, Gráfica e Vincular mostram o selo", () => {
    for (const arquivo of [
      "client/src/pages/arte.tsx",
      "client/src/pages/atendimento.tsx",
      "client/src/pages/solicitacao.tsx",
      "client/src/pages/painel-geral.tsx",
      "client/src/pages/grafica.tsx",
      "client/src/pages/vincular-patrocinadores.tsx",
    ]) {
      const fonte = ler(arquivo);
      expect(fonte, arquivo).toContain('import { SeloKit } from "@/components/kit/selo-kit";');
      expect(fonte, arquivo).toContain("<SeloKit peca={");
    }
  });
});

describe("prazos pelas datas do Kit (fase 4)", () => {
  it("a peça do Kit enxerga o evento com as datas da remessa", async () => {
    const { eventoComDatasDoKit, ancoraDoKit } = await import("@shared/kit");
    const evento = { id: "e1", name: "Mangaratiba", startDate: "2026-09-20T12:00:00Z", truckDepartureDate: "2026-09-18T08:00:00Z", deadlineProducaoGrafica: -1 };
    const remessa = { versao: "V1", entregaMaterial: "2026-09-14T12:00:00Z", saidaCaminhao: "2026-09-15T12:00:00Z", dataEvento: null };
    const doKit = eventoComDatasDoKit(evento, remessa)!;
    // 15/09: o prazo é quando eles precisam da peça — a entrega do material.
    expect(doKit.truckDepartureDate).toBe("2026-09-14T12:00:00Z");
    expect(doKit.startDate).toBe("2026-09-20T12:00:00Z");
    expect(doKit.deadlineProducaoGrafica).toBe(-1);
    expect((doKit as any).saidaDaArena).toBe("2026-09-18T08:00:00Z");
    expect(eventoComDatasDoKit(evento, null)).toBe(evento);
    expect(ancoraDoKit({ entregaMaterial: "2026-09-14T12:00:00Z" })).toBe("2026-09-14T12:00:00Z");
  });

  it("Gestão de Prazos: cada remessa do Kit vira linha própria, com link para o evento real", async () => {
    const { eventosDoPrazo, comKit, idDoEventoReal } = await import("../services/prazo-domain");
    const evento = { id: "e1", name: "Mangaratiba", status: "created", startDate: "2026-09-20T12:00:00Z", truckDepartureDate: "2026-09-18T08:00:00Z" };
    const remessas = new Map([["r1", { id: "r1", versao: "V1", entregaMaterial: "2026-09-14T12:00:00Z", saidaCaminhao: "2026-09-15T12:00:00Z", dataEvento: null }]]);
    const blocos = eventosDoPrazo(evento, [{ id: "a", kitRemessaId: null }, { id: "b", kitRemessaId: "r1" }], remessas);
    expect(blocos).toHaveLength(2);
    expect(blocos[0].evento.id).toBe("e1");
    expect(blocos[0].itens.map((i) => i.id)).toEqual(["a"]);
    expect(blocos[1].evento.id).toBe("e1#kit-r1");
    expect(blocos[1].evento.name).toBe("Mangaratiba · KIT V1");
    expect(blocos[1].evento.truckDepartureDate).toBe("2026-09-14T12:00:00Z");
    // Só peças do Kit: não aparece uma linha "sem peças" da Arena.
    expect(eventosDoPrazo(evento, [{ id: "b", kitRemessaId: "r1" }], remessas)).toHaveLength(1);
    expect(idDoEventoReal("e1#kit-r1")).toBe("e1");
    expect(comKit({ id: "e1#kit-r1" } as any, remessas.get("r1")!)).toMatchObject({ eventId: "e1", kit: { remessaId: "r1", versao: "V1" } });
  });

  it("ligações: peças enriquecidas, rota e fecho diário, Arte, Atendimento, alertas e links", () => {
    expect(ITEMS).toContain("event: eventoComDatasDoKit(eventById.get(item.eventId), item.kitRemessaId ? remessaPorId.get(item.kitRemessaId) : null),");
    expect(ler("server/routes/prazos.ts")).toContain(".flatMap((event) => eventosDoPrazo(event, itemsByEvent.get(event.id) ?? [], remessaPorId))");
    const SNAP = ler("server/services/prazoSnapshots.ts");
    expect(SNAP).toContain(".flatMap((ev) => eventosDoPrazo(ev, itemsByEvent.get(ev.id) ?? [], remessaPorId))");
    expect(SNAP).toContain("const eventId = idDoEventoReal(ev.id);");
    expect(ler("client/src/pages/arte.tsx")).toContain("const chave = item.kitRemessaId ? `${eventKey}#kit-${item.kitRemessaId}` : eventKey;");
    expect(ler("client/src/pages/atendimento.tsx")).toContain("isEventoAtrasadoNaAprovacao(item.kitRemessaId && item.event ? item.event : eventoPorId.get(item.eventId), hoje)");
    expect(ler("server/services/deadlineAlerts.ts")).toContain("const ancoraMs = new Date(ancoraDoKit(remessa)).getTime();");
    expect(ler("client/src/components/prazos/event-drilldown.tsx")).toContain("targetId={ev.eventId ?? ev.id}");
  });
});

describe("agrupar como Kit, selo compacto e datas do Kit no delta (15/09)", () => {
  it("grupo da peça: remessa do Kit ou nada", async () => {
    const { grupoDoKit } = await import("@shared/kit");
    expect(grupoDoKit({ kitRemessaId: "r1", kitRemessa: { versao: "V1", entregaMaterial: "2026-09-14T12:00:00Z" } })).toBe("KIT V1 · entrega 14/09");
    expect(grupoDoKit({ kitRemessaId: null })).toBeNull();
  });

  it("lista do evento, rascunhos e Vincular agrupam o Kit; delta mantém as datas do Kit; selo em duas linhas", () => {
    expect(EVENTO).toContain("const g = grupoDoKit(item) ?? (groupOf(item.type) || '');");
    const VINC = ler("client/src/pages/vincular-patrocinadores.tsx");
    expect(VINC).toContain("const abreTipo = !anterior || secaoDaPeca(anterior) !== secaoDaPeca(item);");
    expect(ler("client/src/lib/queryClient.ts")).toContain("eventoComDatasDoKit((evPorId.get(i.eventId) as any) ?? i.event, i.kitRemessa)");
    // Selo de uma linha, curto: "KIT · 14/09" (detalhe no title).
    const SELO = ler("client/src/components/kit/selo-kit.tsx");
    expect(SELO).toContain("KIT{entrega ? <span");
    expect(SELO).toContain("title={detalheDaRemessa(peca.kitRemessa)}");
  });
});

describe("inclusão individual do Kit (15/09)", () => {
  it("cada remessa tem 'Adicionar peça' que abre o formulário já na remessa", () => {
    const PAINEL_KIT = ler("client/src/components/kit/painel-do-kit.tsx");
    expect(PAINEL_KIT).toContain("data-testid={`button-adicionar-peca-remessa-${r.id}`}");
    expect(EVENTO).toContain("setFormData({ ...EMPTY_ITEM_FORM, kitRemessaId: remessaId });");
  });
});

describe("remessa duplicada e detalhe das peças (15/09)", () => {
  it("servidor: versão repetida barrada, aviso não derruba a importação, excluir remessa só antes de andar", () => {
    const SERVICO = ler("server/services/kitRemessas.ts");
    expect(SERVICO).toContain("Já existe a remessa KIT ${dados.versao} neste evento");
    expect(SERVICO).toContain('const andaram = vivas.filter((p) => p.status !== "draft" && p.status !== "requested");');
    expect(KIT).toContain('app.delete("/api/kit/remessas/:id", requireCriarRemessa');
    expect(IMPORT).toContain("peças importadas, mas o aviso falhou");
  });

  it("painel do Kit: cada remessa abre as peças com status e abre o detalhe da peça", () => {
    const PAINEL_KIT = ler("client/src/components/kit/painel-do-kit.tsx");
    expect(PAINEL_KIT).toContain('<td style={{ padding: "8px 12px" }}><StatusBadge status={p.status} /></td>');
    expect(PAINEL_KIT).toContain("data-testid={`button-excluir-remessa-${r.id}`}");
    expect(EVENTO).toContain("onAbrirPeca={(peca) => setSelectedItemForDetails(peca)}");
  });
});

describe("telas do Kit", () => {
  it("usuários: marca 'Usuário do Kit' só no perfil Solicitação", () => {
    expect(USUARIOS).toContain('{form.watch("role") === "solicitacao" && (');
    expect(USUARIOS).toContain('data-testid="checkbox-user-kit"');
    expect(USUARIOS).toContain('const kit = data.role === "solicitacao" && data.kit;');
  });

  it("evento: painel do Kit, 'Peça de' no formulário, selo KIT na lista, sem Entrada Rápida para o usuário do Kit", () => {
    expect(EVENTO).toContain("<PainelDoKit");
    expect(EVENTO).toContain('data-testid="select-item-kit"');
    expect(EVENTO).toContain("...(data.kitRemessaId ? { kitRemessaId: data.kitRemessaId } : {}),");
    expect(EVENTO).toContain('<SeloKit peca={item} style={{ marginLeft: 6 }} />');
    expect(EVENTO).toContain("trailing={!editingItem && !pedidoEmAtendimento && !user?.kit ? (");
  });
});
