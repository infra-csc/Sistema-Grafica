// ─────────────────────────────────────────────────────────────────────────────
// ABA "DESEMPENHO E TEMPO" — a Análises de antes, inteira (regra da casa: não
// perder campo nem bloco): KPIs de ciclos encerrados com comparação, Capacidade
// × Demanda, Tempo por etapa, Ofensores e o CSV.
//
// O corpo continua em pages/dashboard-analises.tsx (PainelDeDesempenho) — é lá
// que os testes dele olham. Aqui ele recebe o recorte de EVENTO e PATROCINADOR
// da faixa do topo; o PERÍODO segue sendo dele, porque a janela de ciclos
// encerrados não tem sentido nas abas de status.
// ─────────────────────────────────────────────────────────────────────────────
import * as React from "react";
import { PainelDeDesempenho } from "@/pages/dashboard-analises";
import type { ContextoDaAnalise } from "../contexto";
import { AvisoDeCobertura } from "../componentes";

export default function AbaDesempenho({ ctx }: { ctx: ContextoDaAnalise }) {
  const { filtros, limparFiltros } = ctx;
  const recorte = React.useMemo(() => ({
    evento: filtros.evento,
    patrocinador: filtros.patrocinador,
    aoLimpar: limparFiltros,
  }), [filtros.evento, filtros.patrocinador, limparFiltros]);
  const foraDaConta = [
    filtros.tipo !== "all" && "tipo de peça",
    filtros.soAtrasadas && "só atrasadas",
    filtros.soTravadas && "só travadas",
    filtros.soPrioritarias && "só prioritárias",
  ].filter(Boolean) as string[];

  return (
    <div data-testid="aba-desempenho">
      {foraDaConta.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <AvisoDeCobertura
            tom="alerta"
            testId="desempenho-filtros-ignorados"
            itens={[
              `Esta aba segue o evento e o patrocinador do topo, mas não ${foraDaConta.length === 1 ? "o filtro" : "os filtros"} ${foraDaConta.join(", ")}:`,
              "aqui se medem ciclos já encerrados (entregas, retrabalho, carga), e esses recortes são do estado de hoje.",
            ]}
          />
        </div>
      )}
      <PainelDeDesempenho recorteExterno={recorte} />
    </div>
  );
}
