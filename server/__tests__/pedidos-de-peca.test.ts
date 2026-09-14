// ─────────────────────────────────────────────────────────────────────────────
// PEDIDOS DE PEÇA DO ATENDIMENTO (dono, 14/09).
//
// As decisões do dono, e o que este arquivo pina de cada uma:
//   · o pedido nasce numa aba do Atendimento: evento, patrocinador, quantidade,
//     observação e referências (opcionais, mais de uma);
//   · quem pede: Atendimento e admin; quem resolve: a Solicitação (e admin);
//   · aparece na tela de Eventos e dentro do evento;
//   · aviso por notificação no sistema, nos dois sentidos.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { STATUS_DO_PEDIDO, ROTULO_DO_PEDIDO, MAX_REFERENCIAS_DO_PEDIDO, ehChaveDePedidos } from "@shared/pedidos-de-peca";

const RAIZ = path.resolve(__dirname, "../..");
const ler = (rel: string) => readFileSync(path.resolve(RAIZ, rel), "utf8");
const SCHEMA = ler("shared/schema.ts");
const ROTAS = ler("server/routes/pedidos-de-peca.ts");
const SERVIDOR = ler("server/routes.ts");
const ATENDIMENTO = ler("client/src/pages/atendimento.tsx");
const ABA = ler("client/src/components/pedidos-de-peca-atendimento.tsx");
const EVENTOS = ler("client/src/pages/eventos.tsx");
const EVENTO = ler("client/src/pages/event-detail.tsx");
const PAINEL = ler("client/src/components/pedidos-do-evento.tsx");

describe("o pedido", () => {
  it("tem ciclo aberto → atendido | recusado | cancelado, com rótulo para cada um", () => {
    expect([...STATUS_DO_PEDIDO]).toEqual(["aberto", "atendido", "recusado", "cancelado"]);
    for (const s of STATUS_DO_PEDIDO) expect(ROTULO_DO_PEDIDO[s]).toBeTruthy();
  });

  it("guarda evento, patrocinador, quantidade, observação e várias referências", () => {
    expect(SCHEMA).toContain('export const pedidosDePeca = pgTable("pedidos_de_peca", {');
    expect(SCHEMA).toContain('quantidade: integer("quantidade").notNull(),');
    expect(SCHEMA).toContain('observacao: text("observacao").notNull(),');
    expect(SCHEMA).toContain('referencias: text("referencias").array().notNull().default(sql`ARRAY[]::text[]`),');
    expect(SCHEMA).toContain('itemId: varchar("item_id").references(() => items.id, { onDelete: "set null" }),');
    expect(MAX_REFERENCIAS_DO_PEDIDO).toBeGreaterThan(1);
  });

  it("as chaves de consulta com filtro na URL são reconhecidas pelo prefixo", () => {
    expect(ehChaveDePedidos("/api/pedidos-de-peca?status=aberto")).toBe(true);
    expect(ehChaveDePedidos("/api/items")).toBe(false);
  });
});

describe("o servidor", () => {
  it("as rotas existem e estão registradas", () => {
    for (const rota of [
      'app.get("/api/pedidos-de-peca", requireAuth',
      'app.post("/api/pedidos-de-peca", requirePedirPeca',
      'app.patch("/api/pedidos-de-peca/:id/atender", requireResolverPedido',
      'app.patch("/api/pedidos-de-peca/:id/recusar", requireResolverPedido',
      'app.patch("/api/pedidos-de-peca/:id/cancelar", requirePedirPeca',
    ]) expect(ROTAS).toContain(rota);
    expect(SERVIDOR).toContain("registerPedidosDePecaRoutes(app);");
  });

  it("pede o Atendimento; resolve a Solicitação; admin nos dois", () => {
    expect(ROTAS).toContain('const requirePedirPeca = requireRole("admin", "atendimento");');
    expect(ROTAS).toContain('const requireResolverPedido = requireRole("admin", "solicitacao");');
  });

  it("não aceita pedido para evento finalizado nem patrocinador de fora do evento", () => {
    expect(ROTAS).toContain("const motivo = await motivoEventoDaPeca({ eventId: evento.id });");
    expect(ROTAS).toContain("não é patrocinador de ${evento.name}.");
  });

  it("resolver é condicional: dois atendendo ao mesmo tempo não ligam o pedido a duas peças", () => {
    expect(ROTAS.split('eq(pedidosDePeca.status, "aberto")').length - 1).toBe(3);
    expect(ROTAS).toContain("Este pedido acabou de ser resolvido por outra pessoa.");
  });

  it("atender liga a uma peça DO MESMO evento e leva patrocinador e referências sem sobrescrever", () => {
    expect(ROTAS).toContain("A peça escolhida é de outro evento.");
    expect(ROTAS).toContain("if (jaTem.length === 0) {");
    expect(ROTAS).toContain("((peca as any).referenceUrls ?? []).length === 0");
  });

  it("recusar exige motivo; cancelar é de quem pediu", () => {
    expect(ROTAS).toContain("Diga ao Atendimento por que o pedido foi recusado.");
    expect(ROTAS).toContain("Só quem fez o pedido pode cancelá-lo.");
  });

  it("avisa nos dois sentidos pelo sino", () => {
    expect(ROTAS).toContain('type: "pedidoDePeca",');
    expect(ROTAS).toContain('targetRoles: ["solicitacao", "admin"],');
    expect(ROTAS).toContain('type: "pedidoAtendido",');
    expect(ROTAS).toContain('type: "pedidoRecusado",');
  });
});

describe("as telas", () => {
  it("o Atendimento pede numa aba própria", () => {
    expect(ATENDIMENTO).toContain("{ key: 'pedidos', label: 'Pedidos de peças', count: pedidosAbertos.length },");
    expect(ATENDIMENTO).toContain("<PedidosDePecaAtendimento podePedir={canDecide}");
    expect(ABA).toContain('data-testid="form-pedido-de-peca"');
    expect(ABA).toContain("<ObjectUploader");
    expect(ABA).toContain("multiple");
  });

  it("Eventos mostra o selo de pedidos no cartão e na linha", () => {
    expect(EVENTOS).toContain("data-testid={`selo-pedidos-${eventId}`}");
    expect(EVENTOS.split("pedidosAbertos={pedidosPorEvento.get(event.id) ?? 0}").length - 1).toBe(2);
  });

  it("dentro do evento: criar peça preenchida e ligada, ligar a peça existente, ou recusar", () => {
    expect(EVENTO).toContain("<PedidosDoEvento");
    expect(EVENTO).toContain("atenderPedidoMutation.mutate({ pedidoId: pedidoEmAtendimento.id, itemId: createdItem.id });");
    expect(EVENTO).toContain("observations: pedido.observacao,");
    expect(PAINEL).toContain("data-testid={`button-criar-peca-pedido-${p.id}`}");
    expect(PAINEL).toContain("data-testid={`button-ligar-peca-pedido-${p.id}`}");
    expect(PAINEL).toContain("data-testid={`button-recusar-pedido-${p.id}`}");
  });
});
