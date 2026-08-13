// Chip de filtro ativo (removível) — o padrão que o Painel Geral já usa.
//
// PORQUÊ: quatro filtros combinam nesta tela e um deles ("Saídas em 7 dias")
// existia unicamente como um anel de 1,5px num KPI, FORA da barra de filtros.
// O diretor clicava no placar, era interrompido, voltava dez minutos depois e
// via uma lista curta: a pergunta é "cadê o resto?" e a resposta não estava
// escrita em lugar nenhum. Estado invisível vira desconfiança do número.
import { useIsMobile } from "@/hooks/use-mobile";
import { R, TI } from "./tokens";

export function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  const isMobile = useIsMobile();
  // Alvo de toque do ×: 24px no desktop, 32px no mobile. Margens negativas
  // compensam a área extra para o chip não inflar visualmente.
  const hit = isMobile ? 32 : 24;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      backgroundColor: TI.chipBg, border: `1px solid ${TI.border}`, borderRadius: R.pill,
      padding: "3px 6px 3px 10px", fontSize: 11, fontWeight: 600, color: "#44403c",
      whiteSpace: "nowrap", maxWidth: 280, overflow: "hidden",
    }}>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remover filtro ${label}`}
        style={{
          background: "none", border: "none", cursor: "pointer", color: TI.secondary,
          fontSize: 13, fontWeight: 800, padding: 0, lineHeight: 1,
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          minWidth: hit, minHeight: hit,
          margin: `${-(hit - 18) / 2}px ${-(hit - 18) / 2}px ${-(hit - 18) / 2}px -2px`,
        }}
      >
        ×
      </button>
    </span>
  );
}
