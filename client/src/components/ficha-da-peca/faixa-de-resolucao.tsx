// FAIXA DE RESOLUÇÃO — o que trava, desde quando, e quem precisa agir.
import { AlertTriangle, CheckCircle2, Clock, Undo2 } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { FS } from "@/lib/theme";
import { Botao } from "@/components/ui/botao";
import { TONS_DA_FICHA, type NomeDoTom } from "./estilos";

export function FaixaDeResolucao({ bloqueio, vezDeQuem, rawStatus, isMobile, descancelando, handleUncancel }: {
  bloqueio: { tom: NomeDoTom; frase: string; detalhe: string | null };
  vezDeQuem: string | null;
  rawStatus: string;
  isMobile: boolean;
  descancelando: boolean;
  handleUncancel: () => void;
}) {
  const { user } = useAuth();
  const tom = TONS_DA_FICHA[bloqueio.tom];
  const IconeDoBloqueio = bloqueio.tom === "ok" ? CheckCircle2 : bloqueio.tom === "reprovado" ? AlertTriangle : Clock;

  return (
    <div
      data-testid="banner-blocker"
      style={{
        flexShrink: 0, padding: isMobile ? "12px 16px" : "14px 32px",
        backgroundColor: tom.bg, borderBottom: `1px solid ${tom.borda}`,
        display: "flex", alignItems: "flex-start", gap: 12,
      }}
    >
      <span aria-hidden="true" style={{
        width: 34, height: 34, borderRadius: 8, flexShrink: 0,
        backgroundColor: tom.ladrilho, color: tom.detalhe,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <IconeDoBloqueio style={{ width: 17, height: 17 }} />
      </span>
      <div style={{ minWidth: 0, flex: "1 1 auto" }}>
        <p style={{ fontSize: 14, fontWeight: 700, color: tom.frase, margin: 0, lineHeight: 1.35 }}>
          {bloqueio.frase}
        </p>
        {bloqueio.detalhe && (
          <p style={{ fontSize: 12, color: tom.detalhe, margin: "3px 0 0", lineHeight: 1.45 }}>
            {bloqueio.detalhe}
          </p>
        )}
        {vezDeQuem && (
          <p data-testid="text-vez-de-quem" style={{ fontSize: 12, fontWeight: 600, color: tom.detalhe, margin: "3px 0 0", lineHeight: 1.45 }}>
            {vezDeQuem}
          </p>
        )}
      </div>
      {/* Descancelar — só admin, só cancelada. Volta para onde estava
          (o servidor sabe: coluna do cancelamento ou trilha). */}
      {rawStatus === "canceled" && user?.role === "admin" && (
        <Botao
          variante="primario"
          icone={Undo2}
          carregando={descancelando}
          onClick={handleUncancel}
          data-testid="button-descancelar"
          style={{ flexShrink: 0, alignSelf: "center", fontSize: FS.meta }}
        >
          {descancelando ? "Descancelando…" : "Descancelar"}
        </Botao>
      )}
    </div>
  );
}
