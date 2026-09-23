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
//
// A ROTA (papel, motivo, destino, janela, aviso) roda de verdade em
// regras-fluxo-devolucoes.test.ts; aqui ficam a tabela e a tela.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { origemDaAcao } from "@shared/maquina-de-estados";
import { readFileSync } from "fs";
import path from "path";

const ler = (rel: string) => readFileSync(path.resolve(__dirname, "../../", rel), "utf8");
const tela = ler("client/src/pages/grafica.tsx");

/** A lista de status declarada em cada lado, na ordem em que foi escrita. */
function listaDeStatus(fonte: string): string[] {
  const m = fonte.match(/STATUS_ANTES_DE_PRODUZIR = \[([^\]]*)\]/);
  if (!m) return [];
  return m[1].split(",").map(s => s.trim().replace(/^"|"$/g, "")).filter(Boolean);
}

describe("a janela da devolução", () => {
  // A lista do servidor é a origem de "devolver-para-a-revisao" na máquina de
  // estados (shared/maquina-de-estados.ts), que a rota consulta.
  const noServidor = [...(origemDaAcao("devolver-para-a-revisao") ?? [])];

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
    expect(listaDeStatus(tela)).toEqual([...(origemDaAcao("devolver-para-a-revisao") ?? [])]);
  });

  it("e o botão da linha usa a regra, não o status cru", () => {
    expect(tela).toContain("canProduce && podeDevolverParaRevisao(item)");
  });
});

describe("o motivo é obrigatório, como nas outras devoluções", () => {
  it("e o modal explica o mínimo em vez de só desabilitar o botão", () => {
    // Botão desabilitado sem explicação é o que faz a pessoa achar que o app
    // travou.
    expect(tela).toContain("Mínimo de {MOTIVO_MIN_DEVOLUCAO} caracteres");
  });
});
