// ─────────────────────────────────────────────────────────────────────────────
// PEDIDOS DE PEÇA DO ATENDIMENTO (dono, 14/09) — módulo "nota 10".
//
// O que este arquivo pina, pela ordem da revisão do módulo:
//   · segurança: referência só /objects/… ou https (nada de javascript:);
//   · furos de fluxo: editar aberto, reabrir/desfazer com motivo, várias
//     peças por pedido, a peça sai ligada ao pedido na MESMA requisição, a
//     Entrada Rápida some ao atender, salvar trava com imagem subindo;
//   · aviso para QUEM PEDIU (notificação individual);
//   · prazo ("precisa até"), andamento da peça, pedida × criada;
//   · caixa da Solicitação, aba na URL, notificações levando ao lugar certo.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import {
  STATUS_DO_PEDIDO,
  MIN_MOTIVO_DO_PEDIDO,
  ehReferenciaValida,
  ehChaveDePedidos,
  idadeDoPedido,
  prazoDoPedido,
  avisoDoPrazo,
  etapaDaPeca,
  quemReabre,
  seloDoEventoDoPedido,
  textoDaObservacao,
  unidadesCriadas,
} from "@shared/pedidos-de-peca";

const RAIZ = path.resolve(__dirname, "../..");
const ler = (rel: string) => readFileSync(path.resolve(RAIZ, rel), "utf8");
const SCHEMA = ler("shared/schema.ts");
const ROTAS = ler("server/routes/pedidos-de-peca.ts");
const ITEMS = ler("server/routes/items.ts");
const NOTIF = ler("server/routes/notifications.ts");
const STORAGE = ler("server/storage.ts");
const APP = ler("client/src/App.tsx");
const MENU = ler("client/src/components/app-sidebar.tsx");
const ATENDIMENTO = ler("client/src/pages/atendimento.tsx");
const EVENTO = ler("client/src/pages/event-detail.tsx");
const EVENTOS = ler("client/src/pages/eventos.tsx");
const LISTA = ler("client/src/components/pedidos/lista-de-pedidos.tsx");
const FORM = ler("client/src/components/pedidos/formulario-do-pedido.tsx");
const CARTAO = ler("client/src/components/pedidos/cartao-do-pedido.tsx");
const UI = ler("client/src/components/pedidos/ui.tsx");
const PAINEL = ler("client/src/components/pedidos-do-evento.tsx");
const MODAL = ler("client/src/components/motivo-do-pedido-dialog.tsx");
const CAIXA = ler("client/src/pages/pedidos-de-peca.tsx");

describe("regras puras", () => {
  it("ciclo aberto → atendido | recusado | cancelado, e só estados finais se reabrem", () => {
    expect([...STATUS_DO_PEDIDO]).toEqual(["aberto", "atendido", "recusado", "cancelado"]);
    expect(quemReabre("aberto")).toEqual([]);
    expect(quemReabre("atendido")).toEqual(["admin", "solicitacao"]);
    expect(quemReabre("recusado")).toEqual(["admin", "solicitacao"]);
    expect(quemReabre("cancelado")).toEqual(["admin", "atendimento"]);
    expect(MIN_MOTIVO_DO_PEDIDO).toBe(10);
  });

  it("referência só do próprio app ou https — nunca javascript:", () => {
    expect(ehReferenciaValida("/objects/uploads/abc-123.png")).toBe(true);
    expect(ehReferenciaValida("https://storage.googleapis.com/bucket/x.jpg")).toBe(true);
    expect(ehReferenciaValida("javascript:alert(1)")).toBe(false);
    expect(ehReferenciaValida("http://inseguro.com/x.png")).toBe(false);
    expect(ehReferenciaValida("/objects/../../etc\" onerror=")).toBe(false);
    expect(ehReferenciaValida(42)).toBe(false);
  });

  it("prazo: vencido, hoje, amanhã, perto e normal — e aviso quando passa da saída", () => {
    const agora = new Date("2026-09-14T15:00:00Z");
    expect(prazoDoPedido("2026-09-12T12:00:00Z", agora)).toMatchObject({ nivel: "vencido", texto: "prazo venceu há 2 dias" });
    expect(prazoDoPedido("2026-09-14T12:00:00Z", agora)).toMatchObject({ nivel: "perto", texto: "precisa hoje" });
    expect(prazoDoPedido("2026-09-15T12:00:00Z", agora)?.texto).toBe("precisa amanhã");
    expect(prazoDoPedido("2026-09-16T12:00:00Z", agora)).toMatchObject({ nivel: "perto", texto: "precisa até 16/09" });
    expect(prazoDoPedido("2026-09-30T12:00:00Z", agora)?.nivel).toBe("normal");
    expect(prazoDoPedido(null, agora)).toBeNull();
    expect(avisoDoPrazo("2026-09-21T12:00:00Z", "2026-09-20T08:00:00Z")).toContain("depois da saída do caminhão (20/09)");
    expect(avisoDoPrazo("2026-09-20T12:00:00Z", "2026-09-20T08:00:00Z")).toBeNull();
  });

  it("andamento da peça em 5 etapas; cancelada fica de fora da conta", () => {
    expect(etapaDaPeca("draft")).toBe(0);
    expect(etapaDaPeca("awaiting_sponsor_approval")).toBe(1);
    expect(etapaDaPeca("ready_for_production")).toBe(2);
    expect(etapaDaPeca("inProduction")).toBe(2);
    expect(etapaDaPeca("conferred")).toBe(3);
    expect(etapaDaPeca("delivered")).toBe(4);
    expect(etapaDaPeca("cancelled")).toBeNull();
    expect(unidadesCriadas([
      { id: "a", displayId: "#1", type: "x", quantity: 3, status: "draft" },
      { id: "b", displayId: "#2", type: "x", quantity: 5, status: "cancelled" },
    ])).toBe(3);
  });

  it("idade, selo do evento, observação como texto e chave de consulta", () => {
    const agora = new Date("2026-09-14T15:00:00Z");
    expect(idadeDoPedido("2026-08-30T12:00:00Z", agora).nivel).toBe("parado");
    expect(seloDoEventoDoPedido({ motivoFim: "encerrado", saida: null }, agora)?.bloqueiaAtender).toBe(true);
    expect(seloDoEventoDoPedido({ motivoFim: null, saida: "2026-08-29T08:00:00Z" }, agora)?.texto).toBe("caminhão já saiu há 16 dias");
    expect(textoDaObservacao({ texto: "dois banners", autor: "Ana" })).toBe("dois banners");
    expect(ehChaveDePedidos("/api/pedidos-de-peca?limite=300")).toBe(true);
  });
});

describe("o servidor", () => {
  it("papéis: ler (sem Gráfica), pedir/editar/cancelar, resolver e reabrir", () => {
    expect(ROTAS).toContain('const requireLerPedidos = requireRole("admin", "solicitacao", "atendimento", "arte");');
    expect(ROTAS).toContain('const requirePedirPeca = requireRole("admin", "atendimento");');
    expect(ROTAS).toContain('const requireResolverPedido = requireRole("admin", "solicitacao");');
    expect(ROTAS).toContain('const requireReabrirPedido = requireRole("admin", "atendimento", "solicitacao");');
    for (const rota of [
      'app.get("/api/pedidos-de-peca", requireLerPedidos',
      'app.post("/api/pedidos-de-peca", requirePedirPeca',
      'app.patch("/api/pedidos-de-peca/:id", requirePedirPeca',
      'app.patch("/api/pedidos-de-peca/:id/atender", requireResolverPedido',
      'app.patch("/api/pedidos-de-peca/:id/recusar", requireResolverPedido',
      'app.patch("/api/pedidos-de-peca/:id/cancelar", requirePedirPeca',
      'app.patch("/api/pedidos-de-peca/:id/reabrir", requireReabrirPedido',
    ]) expect(ROTAS).toContain(rota);
  });

  it("referências validadas no servidor (P0)", () => {
    expect(ROTAS).toContain("z.string().refine(ehReferenciaValida,");
  });

  it("editar só aberto, com trilha do que mudou e aviso", () => {
    expect(ROTAS).toContain("Só dá para editar pedido aberto");
    expect(ROTAS).toContain("Pedido editado: ${descricao.join(\"; \")}");
    expect(ROTAS).toContain('type: "pedidoEditado",');
  });

  it("várias peças por pedido: a peça atende no máximo um, e o vínculo é condicional", () => {
    expect(SCHEMA).toContain('pedidoDePecaId: varchar("pedido_de_peca_id").references((): any => pedidosDePeca.id, { onDelete: "set null" }),');
    expect(ROTAS).toContain("já atende outro pedido.");
    expect(ROTAS).toContain(".where(and(eq(itemsTable.id, itemId), isNull(itemsTable.pedidoDePecaId)))");
    expect(ROTAS).toContain('if (pedido.status !== "aberto" && pedido.status !== "atendido") {');
  });

  it("atender barra evento finalizado no servidor, não só na tela", () => {
    const vincular = ROTAS.slice(ROTAS.indexOf("export async function vincularPecaAoPedido"), ROTAS.indexOf("export function registerPedidosDePecaRoutes"));
    expect(vincular).toContain("const motivoFim = await motivoEventoDaPeca({ eventId: pedido.eventId });");
  });

  it("a peça criada a partir do pedido sai ligada na mesma requisição, e o cliente não forja o vínculo", () => {
    expect(ITEMS).toContain('const { vincularPecaAoPedido } = await import("./pedidos-de-peca");');
    expect(SCHEMA).toContain("  pedidoDePecaId: true,\n});");
  });

  it("reabrir desfaz atendimento soltando as peças, com motivo e papel de quem desfaz", () => {
    expect(ROTAS).toContain("await db.update(itemsTable).set({ pedidoDePecaId: null, updatedAt: new Date() } as any).where(eq(itemsTable.pedidoDePecaId, pedido.id));");
    expect(ROTAS).toContain("Reabrir pedido cancelado é do Atendimento e do admin.");
  });

  it("avisos para QUEM PEDIU, e o sino e o 'marcar todas' respeitam o destinatário", () => {
    expect(SCHEMA).toContain('targetUserId: varchar("target_user_id"),');
    expect(ROTAS).toContain("targetUserId: pedido.pedidoPorId");
    expect(NOTIF).toContain("lista.filter((n) => !n.targetUserId || n.targetUserId === userId);");
    expect(STORAGE).toContain("const doUsuario = sql`(${notifications.targetUserId} IS NULL OR ${notifications.targetUserId} = ${userId})`;");
  });

  it("prazo nasce da saída do caminhão; tipo e medida opcionais", () => {
    expect(ROTAS).toContain("precisaAte: dados.precisaAte ? paraData(dados.precisaAte) : (evento.truckDepartureDate ?? null),");
    expect(SCHEMA).toContain('precisaAte: timestamp("precisa_ate"),');
    expect(SCHEMA).toContain('tipoDePeca: text("tipo_de_peca"),');
  });
});

describe("as telas", () => {
  it("formulário em gaveta: novo e editar, e salvar trava com imagem subindo", () => {
    expect(FORM).toContain('<SheetContent side="right" data-testid="formulario-pedido-de-peca"');
    expect(FORM).toContain(': envio.isUploading ? "Aguarde o envio das imagens"');
    expect(FORM).toContain('data-testid="aviso-prazo-pedido"');
    expect(LISTA).toContain('data-testid="button-novo-pedido"');
  });

  it("uma lista, dois modos: ações de quem pede e de quem resolve", () => {
    expect(LISTA).toContain("button-editar-pedido-");
    expect(LISTA).toContain("button-cancelar-pedido-");
    expect(LISTA).toContain("href: `/eventos/${p.eventId}?pedidos=1&criar=${p.id}`");
    expect(LISTA).toContain("button-desfazer-pedido-");
    expect(LISTA).toContain('data-testid="filtro-pedidos-meus"');
    expect(LISTA).toContain('data-testid="input-busca-pedidos"');
    expect(LISTA).toContain('data-testid="button-mais-pedidos"');
  });

  it("o cartão mostra prazo, andamento das peças e pedida × criada; sem selo de 'falta'", () => {
    expect(CARTAO).toContain("<AndamentoDoPedido pedido={pedido} />");
    expect(CARTAO).toContain("<PrazoDoPedido pedido={pedido} agora={agora} />");
    expect(UI).toContain("data-testid={`divergencia-pedido-${pedido.id}`}");
    expect(UI).toContain("data-testid={`link-peca-gerada-${p.id}`}");
    expect(CARTAO).not.toContain("selo-falta");
  });

  it("janela de motivo no padrão do app, para cancelar, recusar e reabrir", () => {
    expect(MODAL).toContain("style={modalSurface(520)}");
    expect(MODAL).toContain("<ModalHeader");
    expect(MODAL).toContain('export type AcaoComMotivo = "cancelar" | "recusar" | "reabrir";');
  });

  it("no evento: busca na peça existente, ?criar= abre o formulário, Entrada Rápida some ao atender", () => {
    expect(PAINEL).toContain('searchPlaceholder="Buscar por código, tipo ou descrição…"');
    expect(PAINEL).toContain('const alvoCriar = params.get("criar");');
    expect(EVENTO).toContain("trailing={!editingItem && !pedidoEmAtendimento ? (");
    expect(EVENTO).toContain("...(pedidoEmAtendimento ? { pedidoDePecaId: pedidoEmAtendimento.id } : {}),");
  });

  it("caixa da Solicitação, aba na URL e notificações levando ao lugar certo", () => {
    expect(CAIXA).toContain('<ListaDePedidos modo="solicitacao"');
    expect(APP).toContain('<Route path="/pedidos-de-peca">');
    expect(MENU).toContain('url: "/pedidos-de-peca"');
    expect(ATENDIMENTO).toContain('p.set("aba", "pedidos")');
    expect(APP).toContain('"/atendimento?aba=pedidos"');
    expect(EVENTOS).toContain('data-testid="link-caixa-pedidos"');
  });
});
