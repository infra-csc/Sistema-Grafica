// ─────────────────────────────────────────────────────────────────────────────
// FASE A DO REDESIGN (dono, 03/11): antes de mudar a cara, os números e textos
// que se contradiziam entre telas, e as ações de risco que agiam em um toque.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { estaAtrasDoMarco } from "@/components/detalhe-do-evento/regras";
import { STATUS_STAGE_RANK } from "../services/prazo-domain";

const ler = (f: string) => readFileSync(path.resolve(__dirname, "../..", f), "utf8");

describe("Detalhe do Evento conta como a Gestão de Prazos", () => {
  it("para todo status do funil, estar atrás do marco é a mesma conta do servidor", () => {
    for (const [status, rank] of Object.entries(STATUS_STAGE_RANK)) {
      for (let marco = 0; marco < 6; marco++) {
        expect(estaAtrasDoMarco(status, marco), `${status} no marco ${marco}`).toBe(rank <= marco);
      }
    }
  });

  it("os dois casos que divergiam: já passou da Finalização, já passou da Revisão", () => {
    expect(estaAtrasDoMarco("awaiting_final_review", 3)).toBe(false);
    expect(estaAtrasDoMarco("awaiting_final_review", 4)).toBe(true);
    expect(estaAtrasDoMarco("ready_for_production", 4)).toBe(false);
    expect(estaAtrasDoMarco("delivered", 5)).toBe(false);
    expect(estaAtrasDoMarco("canceled", 0)).toBe(false);
  });
});

describe("Telas que diziam o que não era", () => {
  it("Painel só diz 'Nada pede atenção' com a Gestão de Prazos confirmando zero", () => {
    const faixa = ler("client/src/components/painel/faixa-de-atencao.tsx");
    expect(faixa).toContain("{!hasActiveFilters && pecasEmEtapaVencida === 0 && <>");
    expect(faixa).toContain(`data-testid="chip-atencao-etapa-vencida"`);
    expect(ler("client/src/pages/painel-geral.tsx")).toContain("pecasEmEtapaVencida={prazos?.kpis?.pecasAtrasadas ?? null}");
  });

  it("a visão do Painel diz de qual atraso fala", () => {
    expect(ler("client/src/lib/painel-visoes.ts")).toContain(`label: "Caminhão atrasado"`);
  });

  it("Prazos separa as peças da etapa do total do evento", () => {
    const p = ler("client/src/pages/gestao-prazos.tsx");
    expect(p).toContain("nesta etapa");
    expect(p).toContain("em atraso no evento");
  });

  it("Relatório mostra a data de que os dias contam", () => {
    expect(ler("client/src/pages/relatorio-evento.tsx")).toContain("(s.prazoEfetivo ?? s.deadline)");
  });

  it("Revisão Final não diz 'Aprovado' em peça que pula a aprovação", () => {
    expect(ler("client/src/components/revisao/ficha-comparacao.tsx")).toContain(`pulaAprovacao(selectedItem) ? "Thumb da Arte · sem aprovação" : "Aprovado pelo patrocinador"`);
  });

  it("Excel não diz 'Todos os eventos' com filtro ligado", () => {
    expect(ler("client/src/components/grafica/modais/exportar-excel.tsx")).toContain(`comFiltros ? "Lista filtrada" : "Todos os eventos"`);
  });

  it("o quadro de Usuários bate com o menu", () => {
    const u = ler("client/src/pages/usuarios.tsx");
    expect(u).toContain(`grafica: "Gráfica, Reaproveitar e Máquinas"`);
    expect(u).toContain("Registros e Análises");
  });
});

describe("Ações de risco perguntam antes", () => {
  it("Reenviar aviso de book", () => {
    const v = ler("client/src/pages/versoes.tsx");
    expect(v).toContain("void pedirReenvio()");
    expect(v).not.toContain("onClick={() => enviar.mutate()}");
  });

  it("Salvar Configurações diz o efeito antes", () => {
    const c = ler("client/src/pages/configuracoes.tsx");
    expect(c).toContain("são recalculados na hora");
    expect(c).toContain("void pedirSalvar()");
  });

  it("Tirar da impressora, no cartão", () => {
    expect(ler("client/src/components/grafica/maquinas/cartao-da-impressora.tsx")).toContain("void confirmarTirada()");
  });

  it("Tirar do tubo, nos cinco lugares", () => {
    const d = ler("client/src/components/tubos-dialog.tsx");
    expect(d).not.toContain("onClick={() => tirar.mutate(");
    expect(ler("client/src/components/grafica/fila/acoes-da-linha.tsx")).toContain("void pedirTirarDoTubo(");
    expect(ler("client/src/components/grafica/fila/acoes-do-cartao.tsx")).toContain("void pedirTirarDoTubo(");
  });

  it("Publicar book avisa quantas peças perdem o link, nas duas portas", () => {
    expect(ler("client/src/components/arte/dialogo-book.tsx")).toContain("i.bookUrl && !bookSelectedIds.has(i.id)");
    expect(ler("client/src/pages/book-gerador.tsx")).toContain("fica\" : \"peças que estão no book atual ficam\"} sem book.");
  });
});
