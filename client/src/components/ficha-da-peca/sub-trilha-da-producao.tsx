import { subTrilhaDaProducao } from "@/lib/detalhe-producao";
import { T } from "@/lib/theme";
import type { ItemDaFicha } from "./tipos";

/**
 * A etapa "Produção" ABERTA (21/09). A barra de cima tem uma etapa só para
 * tudo o que acontece na gráfica: de Impresso em diante ela ficava inteira
 * laranja, igual à peça entregue. Quando a peça está na produção, esta
 * sub-trilha compacta diz ONDE: Liberada → Em Impressão → Impresso → Conferido
 * → Embalado → Entregue, com a cor do selo de cada etapa (lib/status).
 * Embalado de peça entregue sem tubo aparece tracejado: não se aplica.
 * O fundo é o gradiente escuro do cabeçalho — nenhum texto abaixo de 0.55 de alfa.
 */
export function SubTrilhaDaProducao({ item, isMobile }: { item: ItemDaFicha; isMobile: boolean }) {
  const passos = subTrilhaDaProducao(item);
  if (!passos) return null;
  const atual = passos.find((p) => p.estado === "atual");
  return (
    <div
      data-testid="sub-trilha-producao"
      role="img"
      aria-label={`Etapa da produção: ${atual?.label ?? "—"}`}
      style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: isMobile ? "6px 8px" : "6px 10px", marginTop: 12, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.09)" }}
    >
      {passos.map((p, i) => {
        const naoSeAplica = p.estado === "nao_se_aplica";
        const cheio = p.estado === "feita" || p.estado === "atual";
        return (
          <span key={p.key} data-estado={p.estado} title={naoSeAplica ? `${p.label}: não se aplica — a peça foi entregue sem tubo` : p.label}
            style={{ display: "inline-flex", alignItems: "center", gap: 5, minWidth: 0 }}>
            {i > 0 && <span aria-hidden="true" style={{ width: isMobile ? 8 : 14, height: 1, backgroundColor: "rgba(255,255,255,0.25)" }} />}
            <span aria-hidden="true" style={{
              width: p.estado === "atual" ? 10 : 8, height: p.estado === "atual" ? 10 : 8, borderRadius: "50%", flexShrink: 0, boxSizing: "border-box",
              backgroundColor: cheio ? p.cor : "transparent",
              border: cheio ? "none" : `1.5px ${naoSeAplica ? "dashed" : "solid"} rgba(255,255,255,0.4)`,
              boxShadow: p.estado === "atual" ? "0 0 0 3px rgba(255,255,255,0.18)" : "none",
            }} />
            <span style={{
              fontSize: 12, whiteSpace: "nowrap",
              fontWeight: p.estado === "atual" ? 800 : 500,
              color: p.estado === "atual" ? T.surface : p.estado === "feita" ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.55)",
              textDecoration: naoSeAplica ? "line-through" : "none",
            }}>
              {p.label}
            </span>
          </span>
        );
      })}
    </div>
  );
}
