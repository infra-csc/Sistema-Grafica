// ─────────────────────────────────────────────────────────────────────────────
// SOLICITAÇÃO DE PEÇAS DO ATENDIMENTO (dono, 14/09).
//
// O que este arquivo pina:
//   · segurança: referência só /objects/… ou https (nada de javascript:);
//   · UMA SOLICITAÇÃO, VÁRIAS PEÇAS: cada peça com evento, patrocinadores
//     (nenhum, um ou vários) e status próprios; status da solicitação calculado;
//   · Atendimento vê só as suas, não edita, cancela só enquanto aberta e pede
//     ajuste depois de atendida; a Solicitação aceita ou recusa o ajuste;
//   · sem "desfazer atendimento": excluir a peça criada devolve a peça
//     solicitada para aberta sozinha;
//   · a peça sai ligada à peça solicitada na MESMA requisição;
//   · aviso para QUEM PEDIU; prazo, andamento, pedida × criada.
//
// As ROTAS (papéis, validação, recorte do Atendimento, cancelar/ajuste
// condicionais, vínculo único, formato antigo, avisos e prazo) rodam de
// verdade em regras-fluxo-pedidos-de-peca.test.ts; aqui ficam as regras puras
// e as telas.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { fonteDasRotasDeItens } from "./fonte-das-rotas-de-itens";
import { readFileSync } from "fs";
import path from "path";
import {
  STATUS_DO_PEDIDO,
  MIN_MOTIVO_DO_PEDIDO,
  ehReferenciaValida,
  ehChaveDePedidos,
  idadeDoPedido,
  prazoDoPedido,
  prazoMaisProximo,
  avisoDoPrazo,
  etapaDaPeca,
  quemReabre,
  seloDoEventoDoPedido,
  statusDaSolicitacao,
  temPecaAberta,
  rotuloDaLinha,
  patrocinadoresDaLinha,
  resumoDasLinhas,
  textoDaObservacao,
  unidadesCriadas,
  podePedirAjuste,
  ajustePendente,
} from "@shared/pedidos-de-peca";

const RAIZ = path.resolve(__dirname, "../..");
const ler = (rel: string) => readFileSync(path.resolve(RAIZ, rel), "utf8");
const SCHEMA = ler("shared/schema.ts");
const ROTAS = ler("server/routes/pedidos-de-peca.ts");
const ITEMS = fonteDasRotasDeItens();
const APP = ler("client/src/App.tsx");
const MENU = ler("client/src/components/app-sidebar.tsx");
const ATENDIMENTO = ler("client/src/pages/atendimento.tsx");
const EVENTO = ler("client/src/pages/event-detail.tsx");
const EVENTOS = ler("client/src/pages/eventos.tsx");
const LISTA = ler("client/src/components/pedidos/lista-de-pedidos.tsx");
const FORM = ler("client/src/components/pedidos/formulario-do-pedido.tsx");
const CARTAO = ler("client/src/components/pedidos/cartao-do-pedido.tsx");
const DETALHE = ler("client/src/components/pedidos/detalhe-do-pedido.tsx");
const UI = ler("client/src/components/pedidos/ui.tsx");
const PAINEL = ler("client/src/components/pedidos-do-evento.tsx");
const MODAL = ler("client/src/components/motivo-do-pedido-dialog.tsx");
const CAIXA = ler("client/src/pages/pedidos-de-peca.tsx");

describe("regras puras", () => {
  it("ciclo por peça; atendida não se reabre na mão", () => {
    expect([...STATUS_DO_PEDIDO]).toEqual(["aberto", "atendido", "recusado", "cancelado"]);
    expect(quemReabre("aberto")).toEqual([]);
    expect(quemReabre("atendido")).toEqual([]);
    expect(quemReabre("recusado")).toEqual(["admin", "solicitacao"]);
    expect(quemReabre("cancelado")).toEqual(["admin", "atendimento"]);
    expect(MIN_MOTIVO_DO_PEDIDO).toBe(10);
  });

  it("status da solicitação sai das peças", () => {
    expect(statusDaSolicitacao([{ status: "aberto" }, { status: "aberto" }])).toBe("aberto");
    expect(statusDaSolicitacao([{ status: "aberto" }, { status: "atendido" }])).toBe("parcial");
    expect(statusDaSolicitacao([{ status: "atendido" }, { status: "recusado" }])).toBe("atendido");
    expect(statusDaSolicitacao([{ status: "recusado" }, { status: "cancelado" }])).toBe("recusado");
    expect(statusDaSolicitacao([{ status: "cancelado" }])).toBe("cancelado");
    expect(temPecaAberta({ status: "parcial" })).toBe(true);
    expect(temPecaAberta({ status: "atendido" })).toBe(false);
    expect(resumoDasLinhas([{ status: "aberto" }, { status: "atendido" }, { status: "atendido" }])).toBe("1 aberta · 2 atendidas");
  });

  it("peça sem tipo vira 'Peça N'; nenhum, um ou vários patrocinadores", () => {
    expect(rotuloDaLinha({ tipoDePeca: null, ordem: 1 })).toBe("Peça 2");
    expect(rotuloDaLinha({ tipoDePeca: "Banner 3x1", ordem: 0 })).toBe("Banner 3x1");
    expect(patrocinadoresDaLinha({ sponsors: [] })).toBe("Sem patrocinador");
    expect(patrocinadoresDaLinha({ sponsors: [{ name: "A" }, { name: "B" }] })).toBe("A, B");
  });

  it("ajuste só em peça atendida, um por vez", () => {
    expect(podePedirAjuste({ status: "aberto", ajusteStatus: null })).toBe(false);
    expect(podePedirAjuste({ status: "atendido", ajusteStatus: null })).toBe(true);
    expect(podePedirAjuste({ status: "atendido", ajusteStatus: "pendente" })).toBe(false);
    expect(podePedirAjuste({ status: "atendido", ajusteStatus: "recusado" })).toBe(true);
    expect(ajustePendente({ ajusteStatus: "pendente" })).toBe(true);
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
    expect(prazoMaisProximo([
      { status: "aberto", precisaAte: "2026-09-20T12:00:00Z" },
      { status: "atendido", precisaAte: "2026-09-10T12:00:00Z" },
    ])).toBe(new Date("2026-09-20T12:00:00Z").getTime());
  });

  it("andamento da peça em 5 etapas; cancelada fica de fora da conta", () => {
    expect(etapaDaPeca("draft")).toBe(0);
    expect(etapaDaPeca("awaiting_sponsor_approval")).toBe(1);
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
  it("a peça criada sai ligada na mesma requisição, e o cliente não forja o vínculo", () => {
    expect(ITEMS).toContain('const { vincularPecaALinha } = await import("../pedidos-de-peca");');
    expect(SCHEMA).toContain("  pedidoDePecaLinhaId: true,\n");
  });

  it("sem desfazer: excluir a peça criada devolve a peça solicitada para aberta", () => {
    expect(ITEMS).toContain('const { aoExcluirPeca } = await import("../pedidos-de-peca");');
    expect(ROTAS).toContain('.where(and(eq(linhasDoPedidoDePeca.id, linhaId), eq(linhasDoPedidoDePeca.status, "atendido")))');
    expect(ROTAS).toContain("Peça atendida não se reabre na mão");
  });

});

describe("as telas", () => {
  it("formulário: várias peças, cada uma com evento e patrocinadores (nenhum, um ou vários)", () => {
    expect(FORM).toContain('data-testid="formulario-pedido-de-peca"');
    expect(FORM).toContain('data-testid="button-adicionar-peca"');
    expect(FORM).toContain("Patrocinadores {OPCIONAL}");
    expect(FORM).toContain("sponsorIds: p.sponsorIds.includes(v) ? p.sponsorIds : [...p.sponsorIds, v]");
    expect(FORM).toContain('if (p.enviando) return "aguarde o envio das imagens";');
    expect(FORM).not.toContain('apiRequest("PATCH"');
    expect(LISTA).toContain('data-testid="button-novo-pedido"');
  });

  it("lista: sem 'Só as minhas', sem editar, sem desfazer; ações por peça", () => {
    expect(LISTA).not.toContain("filtro-pedidos-meus");
    expect(LISTA).not.toContain("Só as minhas");
    expect(LISTA).not.toContain('chave: "editar"');
    expect(LISTA).not.toContain("Desfazer");
    expect(PAINEL).not.toContain("Desfazer");
    expect(LISTA).toContain("href: `/eventos/${l.eventId}?pedidos=1&criar=${l.id}`");
    expect(LISTA).toContain("button-pedir-ajuste-");
    expect(LISTA).toContain("button-aceitar-ajuste-");
    expect(LISTA).toContain("button-cancelar-pedido-");
    expect(LISTA).toContain('{ k: "ajuste", rotulo: "Ajuste pendente"');
    expect(PAINEL).toContain('data-testid="chip-ajustes-do-evento"');
  });

  it("cartão: a solicitação em cima, cada peça com status, patrocinadores, prazo e andamento", () => {
    expect(CARTAO).toContain("export function LinhaDoCartao(");
    expect(CARTAO).toContain("<AndamentoDaLinha linha={linha} />");
    expect(CARTAO).toContain("<PrazoDaLinha linha={linha} agora={agora} />");
    expect(CARTAO).toContain("<AjusteDaLinha linha={linha} />");
    expect(UI).toContain("data-testid={`divergencia-linha-${linha.id}`}");
    expect(UI).toContain("data-testid={`link-peca-gerada-${p.id}`}");
  });

  it("janela de motivo no padrão do app, para a peça ou a solicitação inteira", () => {
    expect(MODAL).toContain("style={modalSurface(520)}");
    expect(MODAL).toContain('export type AcaoComMotivo = "cancelar" | "recusar" | "reabrir" | "ajuste" | "recusar-ajuste";');
    expect(MODAL).toContain("if (!alvo.linha) return apiRequest(\"PATCH\", `/api/pedidos-de-peca/${alvo.pedido.id}/cancelar`");
  });

  it("no evento: só as peças deste evento, ?criar= abre o formulário, Entrada Rápida some ao atender", () => {
    expect(PAINEL).toContain("const doEvento = (p: PedidoDePeca) => p.linhas.filter((l) => l.eventId === eventId);");
    expect(PAINEL).toContain('const alvoCriar = params.get("criar");');
    expect(EVENTO).toContain("trailing={!editingItem && !pedidoEmAtendimento && !user?.kit ? (");
    expect(EVENTO).toContain("...(pedidoEmAtendimento ? { pedidoDePecaLinhaId: pedidoEmAtendimento.linha.id } : {}),");
    expect(EVENTOS).toContain("for (const { linha } of linhasAbertas)");
  });

  it("lugar único: a página serve quem pede e quem resolve, e saiu do Atendimento", () => {
    expect(CAIXA).toContain("<ListaDePedidos podePedir={podePedir} podeResolver={podeResolver} />");
    expect(APP).toContain('const ROLES_PEDIDOS = ["atendimento", "solicitacao", "admin"];');
    expect(APP).toContain("<RoleProtectedRoute component={PedidosDePeca} allowedRoles={ROLES_PEDIDOS} />");
    expect(MENU).toContain('url: "/pedidos-de-peca",         icon: Inbox,          roles: ["atendimento", "solicitacao", "admin"]');
    expect(ATENDIMENTO).not.toContain("PedidosDePecaAtendimento");
    expect(ATENDIMENTO).not.toContain("/api/pedidos-de-peca");
    expect(EVENTOS).toContain('data-testid="link-caixa-pedidos"');
  });

  it("detalhe: cada peça inteira, com histórico e as ações de cada uma", () => {
    expect(DETALHE).toContain('data-testid="detalhe-do-pedido"');
    expect(DETALHE).toContain("queryKey: [`/api/audit-logs?entityType=pedido_de_peca&entityId=${p?.id ?? \"\"}&limit=100`],");
    expect(DETALHE).toContain('data-testid="historico-do-pedido"');
    expect(DETALHE).toContain("const pecas = linha.pecas ?? [];");
    expect(DETALHE).not.toContain("p.pecas.length");
    expect(CARTAO).toContain("data-testid={`abrir-pedido-${pedido.id}`}");
    expect(LISTA).toContain("onAbrir={() => setDetalhe(p.id)}");
    expect(PAINEL).toContain("<DetalheDoPedido");
  });
});
