// O que a linha (tabela ou cartão) diz além da peça: a trava e o motivo da
// última recusa num lote.
import { Lock } from "lucide-react";
import { Selo } from "@/components/ui/selo";
import { pecaTravada, fraseDaTrava, seloDaTrava } from "@shared/trava-da-peca";
import { TOM, FS } from "@/lib/theme";
import type { PecaDaRevisao } from "./tipos";

/**
 * A TRAVA na linha: sem ela, "Liberar" numa peça travada só mostrava a escolha
 * dentro da ficha — e o lote a deixava de fora sem dizer por quê. O motivo
 * QUEBRA LINHA em vez de virar reticências: cortado, o porquê só existia no
 * `title`, que o toque não mostra.
 */
export function SeloTravaNaLinha({ item, onde, agora }: {
  item: PecaDaRevisao;
  onde: "tabela" | "cartao";
  /** O relógio da página (useRelogioDoMinuto): o "há N min" anda com ele. */
  agora: number;
}) {
  return pecaTravada(item) ? (
    <Selo
      data-testid={`badge-travada-${onde}-${item.id}`}
      title={fraseDaTrava(item)}
      tom="perigo"
      forma="retangulo"
      icone={Lock}
      // No cartão (a lista do celular) a letra sobe para 12: o Selo comum tem 11.
      style={{ whiteSpace: "normal", overflowWrap: "anywhere", maxWidth: "100%", minWidth: 0, flexShrink: 1, lineHeight: 1.35, ...(onde === "cartao" ? { fontSize: FS.meta } : {}) }}
    >
      {seloDaTrava(item, agora)}
    </Selo>
  ) : null;
}

/** O MOTIVO da última recusa num lote, escrito na linha (#b91c1c = 6,5:1). */
export function FalhaNaLinha({ itemId, falha }: { itemId: string; falha: string | undefined }) {
  return falha ? (
    <p role="status" data-testid={`falha-lote-${itemId}`} style={{ flexBasis: "100%", margin: "4px 0 0", fontSize: FS.meta, lineHeight: 1.4, color: TOM.perigo.text, fontWeight: 600, overflowWrap: "anywhere" }}>
      {falha}
    </p>
  ) : null;
}
