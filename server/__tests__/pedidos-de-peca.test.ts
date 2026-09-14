// ─────────────────────────────────────────────────────────────────────────────
// PEDIDOS DE PEÇA DO ATENDIMENTO (dono, 14/09) + refino "nota 10".
//
// As decisões do dono, e o que este arquivo pina de cada uma:
//   · o pedido nasce numa aba do Atendimento: evento, patrocinador, quantidade
//     (pode vir vazia), observação e referências (opcionais, mais de uma);
//   · quem pede: Atendimento e admin; quem resolve: a Solicitação (e admin);
//   · aparece na tela de Eventos e dentro do evento;
//   · aviso por notificação no sistema, nos dois sentidos;
//   · a lista diz a idade do pedido, os parados, se o evento aceita peça, o
//     que falta e leva à peça gerada; cancelar e recusar pedem motivo num modal.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import {
  STATUS_DO_PEDIDO,
  ROTULO_DO_PEDIDO,
  MAX_REFERENCIAS_DO_PEDIDO,
  MIN_MOTIVO_DO_PEDIDO,
  ehChaveDePedidos,
  idadeDoPedido,
  lacunasDoPedido,
  rotuloDasLacunas,
  seloDoEventoDoPedido,
  textoDaObservacao,
  quantidadeDoPedido,
} from "@shared/pedidos-de-peca";

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
const MODAL = ler("client/src/components/motivo-do-pedido-dialog.tsx");

describe("o pedido", () => {
  it("tem ciclo aberto → atendido | recusado | cancelado, com rótulo para cada um", () => {
    expect([...STATUS_DO_PEDIDO]).toEqual(["aberto", "atendido", "recusado", "cancelado"]);
    for (const s of STATUS_DO_PEDIDO) expect(ROTULO_DO_PEDIDO[s]).toBeTruthy();
  });

  it("guarda evento, patrocinador, quantidade (opcional), observação, referências e os dois motivos", () => {
    expect(SCHEMA).toContain('export const pedidosDePeca = pgTable("pedidos_de_peca", {');
    expect(SCHEMA).toContain('quantidade: integer("quantidade"), // vazia = o solicitante não definiu (pedido válido)');
    expect(SCHEMA).toContain('referencias: text("referencias").array().notNull().default(sql`ARRAY[]::text[]`),');
    expect(SCHEMA).toContain('motivoCancelamento: text("motivo_cancelamento"),');
    expect(MAX_REFERENCIAS_DO_PEDIDO).toBeGreaterThan(1);
  });

  it("pedido sem quantidade é válido e se diz assim", () => {
    expect(quantidadeDoPedido(null)).toBe("sem quantidade");
    expect(quantidadeDoPedido(3)).toBe("3 un.");
  });

  it("a observação é sempre texto — nunca [object Object]", () => {
    expect(textoDaObservacao("dois banners")).toBe("dois banners");
    expect(textoDaObservacao({ texto: "dois banners", autor: "Ana" })).toBe("dois banners");
    expect(textoDaObservacao(null)).toBe("");
  });

  it("as chaves de consulta com filtro na URL são reconhecidas pelo prefixo", () => {
    expect(ehChaveDePedidos("/api/pedidos-de-peca?status=aberto")).toBe(true);
    expect(ehChaveDePedidos("/api/items")).toBe(false);
  });
});

describe("idade do pedido", () => {
  const agora = new Date("2026-09-14T15:00:00Z"); // 12h em São Paulo

  it("hoje, ontem, há N dias — em dias de calendário de São Paulo", () => {
    expect(idadeDoPedido("2026-09-14T11:00:00Z", agora).texto).toBe("hoje");
    expect(idadeDoPedido("2026-09-13T20:00:00Z", agora).texto).toBe("ontem");
    // 01:00Z do dia 14 ainda é dia 13 em São Paulo
    expect(idadeDoPedido("2026-09-14T01:00:00Z", agora).texto).toBe("ontem");
    expect(idadeDoPedido("2026-09-05T12:00:00Z", agora).texto).toBe("há 9 dias");
  });

  it("acima de 7 dias pede atenção; acima de 14, pedido parado", () => {
    expect(idadeDoPedido("2026-09-07T12:00:00Z", agora).nivel).toBe("normal");
    expect(idadeDoPedido("2026-09-06T12:00:00Z", agora).nivel).toBe("atencao");
    expect(idadeDoPedido("2026-08-30T12:00:00Z", agora).nivel).toBe("parado");
  });
});

describe("o que falta e se o evento aceita peça", () => {
  it("lista as lacunas sem bloquear", () => {
    expect(rotuloDasLacunas(lacunasDoPedido({ quantidade: null, sponsorId: "s", referencias: ["x"] }))).toBe("falta quantidade");
    expect(rotuloDasLacunas(lacunasDoPedido({ quantidade: null, sponsorId: "s", referencias: [] }))).toBe("faltam 2 campos");
    expect(rotuloDasLacunas(lacunasDoPedido({ quantidade: 2, sponsorId: "s", referencias: ["x"] }))).toBeNull();
  });

  it("evento encerrado ou realizado bloqueia atender; caminhão que já saiu só avisa", () => {
    const agora = new Date("2026-09-14T15:00:00Z");
    expect(seloDoEventoDoPedido({ motivoFim: "encerrado", saida: null }, agora)).toMatchObject({ texto: "evento encerrado", bloqueiaAtender: true });
    expect(seloDoEventoDoPedido({ motivoFim: "realizado", saida: null }, agora)?.bloqueiaAtender).toBe(true);
    const caminhao = seloDoEventoDoPedido({ motivoFim: null, saida: "2026-08-29T08:00:00Z" }, agora);
    expect(caminhao).toMatchObject({ texto: "caminhão já saiu há 16 dias", bloqueiaAtender: false });
    expect(seloDoEventoDoPedido({ motivoFim: null, saida: "2026-09-20T08:00:00Z" }, agora)).toBeNull();
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

  it("aceita pedido sem quantidade, mas não evento finalizado nem patrocinador de fora", () => {
    expect(ROTAS).toContain(".max(100000).nullable().optional(),");
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

  it("recusar e cancelar exigem motivo com o mínimo; cancelar é de quem pediu e grava o motivo", () => {
    expect(MIN_MOTIVO_DO_PEDIDO).toBe(10);
    expect(ROTAS.split("if (motivo.length < MIN_MOTIVO_DO_PEDIDO) {").length - 1).toBe(2);
    expect(ROTAS).toContain("Só quem fez o pedido pode cancelá-lo.");
    expect(ROTAS).toContain('status: "cancelado", motivoCancelamento: motivo,');
  });

  it("avisa pelo sino: pedido novo e cancelado para a lista; atendido e recusado para o Atendimento", () => {
    for (const tipo of ['type: "pedidoDePeca",', 'type: "pedidoAtendido",', 'type: "pedidoRecusado",', 'type: "pedidoCancelado",']) {
      expect(ROTAS).toContain(tipo);
    }
  });
});

describe("as telas", () => {
  it("o Atendimento pede numa aba própria", () => {
    expect(ATENDIMENTO).toContain("{ key: 'pedidos', label: 'Pedidos de peças', count: pedidosAbertos.length },");
    expect(ATENDIMENTO).toContain("<PedidosDePecaAtendimento podePedir={canDecide}");
    expect(ABA).toContain('data-testid="form-pedido-de-peca"');
    expect(ABA).toContain("<ObjectUploader");
  });

  it("1 · a idade aparece só em pedido que espera", () => {
    expect(ABA).toContain("data-testid={`cell-idade-pedido-${pedido.id}`}");
    expect(ABA).toContain("if (!pedidoEspera(pedido.status)) return null;");
    expect(ABA).toContain('"pedido parado"'.slice(1, -1));
  });

  it("2 · a faixa dos parados nomeia os mais antigos e ordena por idade — sem versão verde", () => {
    expect(ABA).toContain('data-testid="faixa-pedidos-parados"');
    expect(ABA).toContain('data-testid="button-ver-mais-antigos"');
    expect(ABA).toContain("{parados.length > 0 && (");
    expect(ABA).toContain('onClick={() => { setFiltro("aberto"); setOrdem("antigos"); }}');
  });

  it("3 · o evento avisa se aceita peça; o botão de criar fica visível e desabilitado", () => {
    expect(ABA).toContain("data-testid={`selo-evento-${pedidoId}`}");
    expect(PAINEL).toContain("disabled={!!bloqueio} title={bloqueio ?? undefined}");
  });

  it("4 · o que falta se anuncia sem bloquear", () => {
    expect(ABA).toContain("data-testid={`selo-falta-${pedido.id}`}");
    expect(ABA).toContain("O solicitante não informou:");
  });

  it("5 · o pedido atendido leva à peça", () => {
    expect(ABA).toContain("data-testid={`link-peca-gerada-${pedido.id}`}");
    expect(ABA).toContain("href={`/eventos/${pedido.eventId}?item=${pedido.itemId}`}");
  });

  it("6 · cancelar e recusar num modal só, com motivo e botão travado", () => {
    expect(MODAL).toContain('data-testid="dialog-cancelar-pedido"');
    expect(MODAL).toContain("disabled={falta > 0 || pendente}");
    expect(ABA).toContain("<MotivoDoPedidoDialog");
    expect(PAINEL).toContain("<MotivoDoPedidoDialog");
    expect(PAINEL).not.toContain("input-motivo-recusa-");
  });

  it("defeitos: observação como texto entre aspas, patrocinador com elipse, chip zerado legível", () => {
    expect(ABA).toContain("const texto = textoDaObservacao(valor);");
    expect(ABA).toContain("“{texto}”");
    expect(ABA).toContain('style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13.5, fontWeight: 700, color: T.text }}');
    expect(ABA).toContain('f.n === 0 ? "#78716c"');
    expect(ABA).not.toContain("#a8a29e");
  });

  it("Eventos mostra o selo de pedidos no cartão e na linha", () => {
    expect(EVENTOS).toContain("data-testid={`selo-pedidos-${eventId}`}");
    expect(EVENTOS.split("pedidosAbertos={pedidosPorEvento.get(event.id) ?? 0}").length - 1).toBe(2);
  });

  it("dentro do evento: criar peça preenchida e ligada, ligar a peça existente, ou recusar", () => {
    expect(EVENTO).toContain("<PedidosDoEvento");
    expect(EVENTO).toContain("atenderPedidoMutation.mutate({ pedidoId: pedidoEmAtendimento.id, itemId: createdItem.id });");
    expect(EVENTO).toContain("quantity: pedido.quantidade ?? EMPTY_ITEM_FORM.quantity,");
    expect(PAINEL).toContain("data-testid={`button-criar-peca-pedido-${p.id}`}");
    expect(PAINEL).toContain("data-testid={`button-ligar-peca-pedido-${p.id}`}");
    expect(PAINEL).toContain("data-testid={`button-recusar-pedido-${p.id}`}");
  });
});

describe("Eventos sinaliza os pedidos para quem monta a lista", () => {
  it("atalho 'Pedidos do Atendimento' no topo, que filtra os eventos com pedido", () => {
    expect(EVENTOS).toContain("{ key: 'pedidos', label: 'Pedidos do Atendimento', count: focoCounts.pedidos,");
    expect(EVENTOS).toContain('if (foco === "pedidos") return (pedidosPorEvento.get(event.id) ?? 0) > 0;');
  });

  it("faixa para Solicitação e admin com os mais antigos e link direto ao painel do evento", () => {
    expect(EVENTOS).toContain('data-testid="faixa-pedidos-atendimento"');
    expect(EVENTOS).toContain("(user?.role === 'solicitacao' || user?.role === 'admin') && pedidosAbertos.length > 0");
    expect(EVENTOS).toContain("href={`/eventos/${p.eventId}?pedidos=1`}");
    expect(PAINEL).toContain('id="pedidos-do-atendimento"');
  });
});
