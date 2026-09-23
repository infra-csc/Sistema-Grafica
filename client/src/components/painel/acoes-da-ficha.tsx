// ─── Atalhos no topo da ficha da peça ───────────────────────────────────────
// Fecha o ciclo ver → agir: depois de achar o gargalo, o usuário
// fechava a ficha e fazia o roteamento mental (status → tela) sem
// ajuda nenhuma. O mapa status→tela respeita o papel: quando a
// pessoa não entra na tela, o botão não aparece.
import { Link } from "wouter";
import { ArrowUpRight, Copy, Link2, Lock } from "lucide-react";
import { Botao } from "@/components/ui/botao";
import { motivoEventoFinalizado, todayBusinessMs } from "@/lib/status";
import { proximaTelaDoStatus } from "@/lib/painel-rotas";
import { moldeConcluido } from "@shared/molde";
import { FS, FW, R, H, T, TOM } from "@/lib/theme";
import type { PecaDoPainel } from "./tipos";

export function AcoesDaFicha({ selectedItem, role, onCopiarLink }: {
  selectedItem: PecaDoPainel;
  role: string | null | undefined;
  onCopiarLink: () => void;
}) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {selectedItem.eventId && (
        <Link
          href={`/eventos/${selectedItem.eventId}`}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, minHeight: H.md, padding: "0 12px", borderRadius: R.md, border: `1px solid ${T.border}`, background: T.surface, color: T.text, fontSize: FS.meta, fontWeight: FW.forte, textDecoration: "none" }}
        >
          <Link2 style={{ width: 13, height: 13, color: T.second }} />
          Abrir evento
        </Link>
      )}
      {(() => {
        // "Continuar em X" leva à FILA de trabalho — e as filas escondem
        // as peças de evento finalizado. Mandar a pessoa para uma tela
        // onde a peça não aparece é o mesmo beco sem saída do botão que
        // só devolve 409: ela vai procurar, não vai achar, e vai concluir
        // que o sistema perdeu a peça. Aqui o atalho vira a explicação.
        //
        // Só o ATALHO muda. O Painel Geral continua listando a peça de
        // propósito (registro não perde o passado) e "Abrir evento" e
        // "Copiar link" seguem valendo — são leitura.
        const motivoFim = motivoEventoFinalizado(selectedItem.event ?? null, todayBusinessMs());
        if (motivoFim) {
          return (
            <span
              data-testid="aviso-evento-finalizado-ficha"
              style={{ display: "inline-flex", alignItems: "center", gap: 6, minHeight: 34, padding: "6px 12px", borderRadius: R.md, border: `1px solid ${T.border}`, background: T.bg, color: T.apoio, fontSize: FS.meta, fontWeight: FW.medio, maxWidth: 360, lineHeight: 1.4 }}
            >
              <Lock style={{ width: 13, height: 13, flexShrink: 0, color: T.second }} />
              {motivoFim === "encerrado"
                ? "Evento encerrado — esta peça não avança no fluxo. Reabra o evento para voltar a trabalhar nela."
                : "Evento já realizado — esta peça não avança no fluxo. Conferência e entrega seguem liberadas na Gráfica."}
            </span>
          );
        }
        // Molde produzido é o FIM do fluxo dele: não há conferência nem
        // entrega — "Continuar em Gráfica" levaria a uma fila onde nada
        // resta a fazer com ele.
        if (moldeConcluido(selectedItem)) return null;
        const tela = proximaTelaDoStatus(selectedItem.status, role);
        if (!tela) return null;
        return (
          <Link
            href={tela.path}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, minHeight: H.md, padding: "0 12px", borderRadius: R.md, border: `1px solid ${TOM.laranja.border}`, background: TOM.laranja.bg, color: T.accentText, fontSize: FS.meta, fontWeight: FW.rotulo, textDecoration: "none" }}
          >
            <ArrowUpRight style={{ width: 13, height: 13 }} />
            Continuar em {tela.label}
          </Link>
        );
      })()}
      <Botao
        variante="secundario"
        icone={Copy}
        onClick={onCopiarLink}
        style={{ fontSize: FS.meta, color: T.text }}
      >
        Copiar link da peça
      </Botao>
    </div>
  );
}
