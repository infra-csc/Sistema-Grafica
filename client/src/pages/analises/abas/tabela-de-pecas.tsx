// A lista de peças das Análises (o quadro de "Realizado e pendências" e o de
// "Eventos × processo × prazo" usam a mesma régua de colunas). Mora num
// arquivo próprio para os dois submenus da Pré-produção a importarem sem ciclo.
//
// PEÇAS SEM APROVAÇÃO (Pedro/dono, 26/10 — RF06/RF12): o status traz os selos
// das marcas ("Sem patrocínio", "Arte cliente" / "Aguardando arte do
// cliente"); o prazo traz o "Layout normal → ajustado"; o atraso do cliente
// vem marcado à parte do interno.
import * as React from "react";
import { rotuloDaEtapaNoPainel, FASES_DO_PAINEL, type PecaDaLinha } from "@shared/painel-operacional";
import { FS, FONT } from "@/lib/theme";
import { TabelaCompacta, idDaPeca } from "../blocos";
import { AtrasoDaLinha, PrazoDaLinha, SimNao, StatusDaLinha } from "../comum";

/** A lista de peças (pré-produção e problemas usam a mesma régua de colunas). */
export function TabelaDePecas({ pecas, nomes, testId, vazio, mostrarEvento = true, mostrarFuraFila = false }: {
  pecas: PecaDaLinha[]; nomes: Record<string, string>; testId: string; vazio: string; mostrarEvento?: boolean;
  /** A coluna Fura-fila (o quadro de "Eventos × processo × prazo" a pede). */
  mostrarFuraFila?: boolean;
}) {
  return (
    <TabelaCompacta<PecaDaLinha>
      testId={testId}
      larguraDaPrimeira={84}
          encolherAoTransbordar={false}
      legenda="Peças"
      linhas={pecas}
      chave={(p) => p.id}
      limite={15}
      minLargura={900}
      alturaMaxima={560}
      ordemInicial={{ coluna: "atraso", direcao: "desc" }}
      vazio={vazio}
      colunas={[
        { id: "peca", rotulo: "Peça", ordenavel: true, valor: (p) => p.displayId, render: (p) => <span style={{ fontFamily: FONT.mono }}>{idDaPeca(p)}</span> },
        ...(mostrarEvento ? [{ id: "evento", rotulo: "Evento", ordenavel: true, ocultarNoCelular: true, valor: (p: PecaDaLinha) => nomes[p.evento] ?? p.evento }] : []),
        { id: "tipo", rotulo: "Tipo", ordenavel: true, ocultarNoCelular: true, valor: (p) => p.tipo || null },
        { id: "descricao", rotulo: "Descrição", ordenavel: true, valor: (p) => p.descricao || null,
          render: (p) => <span className="pop-texto-longo" title={p.descricao} style={{ fontSize: FS.body }}>{p.descricao || "—"}</span> },
        { id: "qtd", rotulo: "Qtd", alinhar: "direita", ordenavel: true, valor: (p) => p.quantidade },
        { id: "status", rotulo: "Status", ordenavel: true, valor: (p) => rotuloDaEtapaNoPainel(p.etapa), render: (p) => <StatusDaLinha p={p} /> },
        { id: "fase", rotulo: "Fase atual", ordenavel: true, ocultarNoCelular: true, valor: (p) => FASES_DO_PAINEL[p.fase] ?? "—" },
        { id: "prazo", rotulo: "Prazo da fase", ordenavel: true, valor: (p) => p.prazoFase, render: (p) => <PrazoDaLinha p={p} /> },
        { id: "atraso", rotulo: "Atraso (dias)", alinhar: "direita", ordenavel: true, valor: (p) => p.diasAtraso, render: (p) => <AtrasoDaLinha p={p} /> },
        ...(mostrarFuraFila ? [{ id: "fura", rotulo: "Fura-fila", ordenavel: true, valor: (p: PecaDaLinha) => (p.furaFila ? "Sim" : "Não"), render: (p: PecaDaLinha) => <SimNao sim={p.furaFila} /> }] : []),
      ]}
    />
  );
}
