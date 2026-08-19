// ─────────────────────────────────────────────────────────────────────────────
// DEVOLVER PARA A REVISÃO — a saída que faltava na Gráfica.
//
// O operador abre o arquivo na hora de imprimir e vê que está errado. Antes
// deste caminho ele tinha duas saídas ruins: imprimir mesmo assim, ou deixar a
// peça parada na fila — onde ela continuava contando como "Pronto para
// Produção" para o resto do app, inclusive para a Gestão de Prazos, que a
// cobrava da Gráfica sem que ninguém soubesse que ela estava travada.
//
// A JANELA É ESTREITA DE PROPÓSITO (decisão do dono): só ANTES de produzir.
// A partir do momento em que a produção começa existe material físico,
// `quantityProduced` contado e ativos de inventário criados — devolver para uma
// fila que assume que nada foi feito exigiria um estorno que não existe.
//
// Os três riscos que este arquivo cobre:
//
//   1. A JANELA ABRIR DEMAIS. Se a lista de status de origem crescer para
//      incluir `produced`/`conferred`/`delivered`, a devolução passa a apagar
//      trabalho registrado com foto.
//
//   2. CLIENTE E SERVIDOR DISCORDAREM. O botão some quando o servidor recusa e
//      aparece quando ele aceita — as duas listas têm de ser a mesma. Se o
//      cliente for mais generoso, o clique volta 409; se for mais restrito, a
//      saída existe e ninguém a encontra.
//
//   3. A DEVOLUÇÃO MUDA SEM MOTIVO. Toda devolução do app exige motivo escrito
//      pela mesma razão: quem recebe a peça de volta precisa saber o que
//      refazer.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const ler = (rel: string) => readFileSync(path.resolve(__dirname, "../../", rel), "utf8");
const rotas = ler("server/routes/items.ts");
const tela = ler("client/src/pages/grafica.tsx");

/** A lista de status declarada em cada lado, na ordem em que foi escrita. */
function listaDeStatus(fonte: string): string[] {
  const m = fonte.match(/STATUS_ANTES_DE_PRODUZIR = \[([^\]]*)\]/);
  if (!m) return [];
  return m[1].split(",").map(s => s.trim().replace(/^"|"$/g, "")).filter(Boolean);
}

describe("a janela da devolução", () => {
  const noServidor = listaDeStatus(rotas);

  it("só cobre os status de ANTES de produzir", () => {
    expect(noServidor).toEqual([
      "ready_for_production", "pronto_para_producao", "approved", "liberado",
    ]);
  });

  it("e nunca os de trabalho já feito", () => {
    for (const proibido of ["inProduction", "em_producao", "produced", "produzido", "conferred", "delivered", "entregue"]) {
      expect(noServidor).not.toContain(proibido);
    }
  });
});

describe("cliente e servidor concordam sobre quando devolver", () => {
  it("as duas listas são idênticas", () => {
    expect(listaDeStatus(tela)).toEqual(listaDeStatus(rotas));
  });

  it("e o botão da linha usa a regra, não o status cru", () => {
    expect(tela).toContain("canProduce && podeDevolverParaRevisao(item)");
  });
});

describe("o gate de papel", () => {
  it("devolver é da Gráfica — recusar o trabalho, não executá-lo", () => {
    // `canProduce` (grafica|admin) e não `podeConferir`, que inclui
    // solicitacao: quem decide NÃO imprimir é quem tem a impressora. E a
    // Solicitação é justamente quem RECEBE a peça de volta.
    expect(rotas).toContain('if (req.userRole !== "grafica" && req.userRole !== "admin") {');
    expect(rotas).toContain("Apenas a Gráfica pode devolver para a Revisão");
  });
});

describe("o motivo é obrigatório, como nas outras devoluções", () => {
  it("o servidor passa pelo mesmo leitor de motivo", () => {
    const rota = rotas.slice(rotas.indexOf('/api/items/:id/return-to-review'));
    expect(rota.slice(0, 2000)).toContain("lerMotivoDevolucao(req)");
  });

  it("e o modal explica o mínimo em vez de só desabilitar o botão", () => {
    // Botão desabilitado sem explicação é o que faz a pessoa achar que o app
    // travou.
    expect(tela).toContain("Mínimo de {MOTIVO_MIN_DEVOLUCAO} caracteres");
  });
});

describe("a peça volta para o lugar certo", () => {
  it("para Aguardando Revisão Final, que é a fila da tela Revisão", () => {
    const rota = rotas.slice(rotas.indexOf('/api/items/:id/return-to-review'));
    expect(rota.slice(0, 2500)).toContain('status: "awaiting_final_review"');
  });

  it("e a revisão anterior deixa de valer", () => {
    // Foi ela que liberou a peça para a produção que a Gráfica está recusando.
    const rota = rotas.slice(rotas.indexOf('/api/items/:id/return-to-review'));
    expect(rota.slice(0, 2500)).toContain("creatorReviewedAt: null");
  });

  it("a fila da Gráfica é invalidada pelo broadcast certo", () => {
    // `/api/items/approved` roda com staleTime Infinity: sem `item_updated` a
    // peça devolvida continuaria na tela de quem devolveu até um F5.
    const rota = rotas.slice(rotas.indexOf('/api/items/:id/return-to-review'));
    expect(rota.slice(0, 3000)).toContain('broadcast({ type: "item_updated", item })');
  });
});
