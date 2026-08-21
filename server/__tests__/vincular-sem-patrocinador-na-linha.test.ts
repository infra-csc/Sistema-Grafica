// ─────────────────────────────────────────────────────────────────────────────
// VINCULAR: "Sem patrocinador" é um chip na linha; o menu "…" tem uma entrada.
//
// Pedido do dono, com captura: o menu de três opções por linha ("Marcar sem
// patrocinador", "Marcar reaproveitamento", "Devolver para Criação") escondia a
// decisão mais comum depois de vincular — a peça que entra sem marca — atrás
// de dois cliques, e oferecia duas ações que não são desta tela.
//
// A conferência ANTES de tirar, porque a regra da casa é não perder
// capacidade:
//   · "Marcar reaproveitamento" tem casa no Detalhe do Evento
//     (button-reuse-item-) e na Revisão (button-reuse-). Aqui era uma segunda
//     porta para a mesma decisão, numa tela cuja pergunta é outra. SAIU.
//   · "Devolver para Criação" só existe AQUI — é a única tela que devolve a
//     peça para antes da vinculação. Tirar daqui apagaria a capacidade do app.
//     FICA no menu: é rara, e menu é o lugar de ação rara.
//   · "Sem patrocinador" SUBIU para a linha, como chip ao lado dos chips de
//     marca — mesma casca, borda tracejada quando desligado (não é uma marca,
//     é a ausência declarada de todas).
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const ler = (rel: string) => readFileSync(path.resolve(__dirname, "../../", rel), "utf8");
const VP = ler("client/src/pages/vincular-patrocinadores.tsx");
const semCom = (s: string) => s.replace(/\r\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n").map(l => l.replace(/^\s*\/\/.*$/, "")).join("\n");

describe("o chip 'Sem patrocinador' na linha", () => {
  it("existe, com o mesmo testid que o item do menu tinha — a capacidade mudou de lugar, não de nome", () => {
    expect(VP).toContain("data-testid={`btn-skip-sponsor-${item.id}`}");
    const i = VP.indexOf("data-testid={`btn-skip-sponsor-${item.id}`}");
    const bloco = VP.slice(i - 700, i + 900);
    expect(bloco).toContain("aria-pressed={semPatrocinador}");
    expect(bloco).toContain("onClick={() => toggleItemSkipApproval(item)}");
    expect(bloco).toContain('<EyeOff aria-hidden="true"');
    expect(bloco).toContain("Sem patrocinador");
  });

  it("tem a casca dos chips de marca e borda tracejada quando desligado", () => {
    expect(VP).toContain("border: semPatrocinador ? '1px solid #fde68a' : '1px dashed #d6d3d1',");
    expect(VP).toContain("height: isMobile ? 44 : 26, padding: '0 10px', borderRadius: 999,");
  });

  it("segue o mesmo gate do 'Todos': só em peça editável e não enviada", () => {
    const i = VP.indexOf("data-testid={`btn-skip-sponsor-${item.id}`}");
    expect(VP.slice(i - 1200, i)).toContain("{editavel && estado !== 'ENVIADO' && (");
  });
});

describe("o menu '…' ficou só com o que não tem outra casa", () => {
  const i = VP.indexOf("rotulo: 'Devolver para Criação'");
  const menu = VP.slice(i - 400, i + 400);

  it("'Devolver para Criação' continua — só esta tela devolve para antes da vinculação", () => {
    expect(VP).toContain("testId: `button-return-creation-${item.id}`");
    // E de fato não há outra tela com essa rota.
    for (const tela of ["event-detail", "solicitacao", "painel-geral", "arte", "atendimento"]) {
      expect(ler(`client/src/pages/${tela}.tsx`)).not.toContain("return-to-creation");
    }
  });

  it("'Marcar reaproveitamento' saiu daqui — e continua onde é decisão de verdade", () => {
    expect(semCom(VP)).not.toContain("btn-reuse-");
    expect(semCom(VP)).not.toContain("Marcar reaproveitamento");
    expect(ler("client/src/pages/event-detail.tsx")).toContain("button-reuse-item-");
    expect(ler("client/src/pages/solicitacao.tsx")).toContain("button-reuse-");
  });

  it("o item de 'sem patrocinador' não está mais no menu", () => {
    expect(menu).not.toContain("Marcar sem patrocinador");
    expect(semCom(VP)).not.toContain("rotulo: semPatrocinador ?");
  });
});
