// ─────────────────────────────────────────────────────────────────────────────
// FECHAMENTO DO EVENTO NA GRÁFICA (19/10).
//
// Caso real: "Night Run Teresina está apenas com 2 itens; Circuitinho
// Salvador, Girl Power RJ e Petrobras Bike Recife não aparecem no relatório".
// O "Exportar Excel" do topo leva a LISTA VISÍVEL — e a fila esconde o evento
// realizado (08/10) e só traz as entregues recentes. Os dois recortes estão
// certos para o trabalho do dia e errados para o fechamento.
//
// Com evento(s) escolhido(s) no filtro, esta faixa oferece a planilha do
// EVENTO INTEIRO (todas as peças, todo status, entregues, reaproveitadas e em
// trânsito), no mesmo formato. O "Exportar Excel" segue como era. Se o evento
// escolhido for realizado e as peças dele estiverem fora da fila, a faixa diz
// isso e traz o atalho "Mostrar eventos realizados" — a regra de esconder não
// muda.
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo } from "react";
import { FileSpreadsheet } from "lucide-react";
import { Botao } from "@/components/ui/botao";
import { FS, FW, R, T, TOM } from "@/lib/theme";
import { useExportarFechamento } from "@/lib/exportar-fechamento";
import type { FilaDaGrafica } from "@/components/grafica/hooks/use-fila-da-grafica";

export function FaixaDoFechamento({ fila, isMobile, ponteiroGrosso }: {
  fila: FilaDaGrafica;
  isMobile: boolean;
  ponteiroGrosso: boolean;
}) {
  const { filtros, patchFiltros, pecasDoServidor, selosPorItem, eventFilterOptions, filteredItems } = fila;
  const { exportar, exportando } = useExportarFechamento();
  const ids = filtros.evento;

  // O nome de cada evento escolhido (a peça traz o evento cru) e quantas peças
  // dele a fila está escondendo por ser de evento realizado/encerrado.
  const { nomes, escondidas } = useMemo(() => {
    const escolhidos = new Set(ids);
    const nomePorId = new Map<string, string>();
    let ocultas = 0;
    for (const p of pecasDoServidor) {
      if (!escolhidos.has(p.eventId)) continue;
      if (!nomePorId.has(p.eventId) && p.event?.name) nomePorId.set(p.eventId, p.event.name);
      if (!filtros.realizados && selosPorItem.has(p.id)) ocultas++;
    }
    for (const o of eventFilterOptions) if (escolhidos.has(o.value) && !nomePorId.has(o.value)) nomePorId.set(o.value, o.label);
    return { nomes: ids.map((id) => nomePorId.get(id)).filter((n): n is string => !!n), escondidas: ocultas };
  }, [ids, pecasDoServidor, selosPorItem, filtros.realizados, eventFilterOptions]);

  if (ids.length === 0) return null;
  const um = ids.length === 1;
  const nVisiveis = filteredItems.length;
  const tamanho = isMobile || ponteiroGrosso ? "toque" : "md";

  return (
    <section
      data-testid="faixa-fechamento"
      aria-label="Fechamento do evento"
      className="fech-faixa"
      style={{
        display: "flex", flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "stretch" : "center",
        gap: isMobile ? 10 : 16, padding: isMobile ? "12px" : "12px 16px",
        backgroundColor: T.surface, border: `1px solid ${TOM.sucesso.border}`, borderLeft: `4px solid ${TOM.sucesso.dot}`,
        borderRadius: R.md, fontSize: isMobile ? 13 : FS.body, color: T.second, lineHeight: 1.45,
      }}
    >
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start", minWidth: 0, flex: "1 1 auto" }}>
        <FileSpreadsheet aria-hidden="true" style={{ width: 18, height: 18, flexShrink: 0, marginTop: 2, color: TOM.sucesso.text }} />
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: 0, color: T.text, fontWeight: FW.forte }} data-testid="faixa-fechamento-titulo">
            {um
              ? <>Fechamento de {nomes[0] ?? "evento escolhido"}</>
              : <>Fechamento dos {ids.length} eventos escolhidos</>}
          </p>
          <p style={{ margin: "2px 0 0" }}>
            {um ? "A planilha com todas as peças do evento" : "Uma planilha com todas as peças deles, o evento numa coluna"}
            {" — entregues, reaproveitadas e em trânsito —, "}
            {nVisiveis === 0 ? "inclusive as que não aparecem na fila"
              : `não só ${nVisiveis === 1 ? "a peça desta lista" : `as ${nVisiveis} peças desta lista`}`}.
          </p>
          {escondidas > 0 && (
            <p data-testid="faixa-fechamento-ocultas" style={{ margin: "6px 0 0", color: T.strong }}>
              {escondidas} {escondidas === 1 ? "peça está" : "peças estão"} fora da fila porque {um ? "o evento já foi realizado" : "são de evento já realizado"}.{" "}
              <button
                type="button"
                onClick={() => patchFiltros({ realizados: true })}
                data-testid="faixa-fechamento-mostrar-realizados"
                className="fech-link"
                // No toque, linha própria com 44px de alvo: inline, a altura
                // empurrava a frase e abria um vão no meio do parágrafo.
                style={isMobile || ponteiroGrosso ? { display: "flex", minHeight: 44 } : undefined}
              >
                Mostrar eventos realizados
              </button>
            </p>
          )}
        </div>
      </div>
      <Botao
        variante="secundario"
        tamanho={tamanho}
        icone={FileSpreadsheet}
        carregando={exportando}
        larguraCheia={isMobile}
        onClick={() => void exportar(ids)}
        data-testid="button-export-fechamento-grafica"
        title={um ? "Baixar a planilha com todas as peças do evento" : `Baixar uma planilha com todas as peças dos ${ids.length} eventos`}
        style={{ flexShrink: 0 }}
      >
        {exportando ? "Gerando…" : um ? "Exportar fechamento" : `Exportar fechamento (${ids.length} eventos)`}
      </Botao>
    </section>
  );
}
