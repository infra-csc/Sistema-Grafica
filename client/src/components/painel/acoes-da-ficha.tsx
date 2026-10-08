// ─── Atalhos no topo da ficha da peça ───────────────────────────────────────
// Fecha o ciclo ver → agir: depois de achar o gargalo, o usuário
// fechava a ficha e fazia o roteamento mental (status → tela) sem
// ajuda nenhuma. O mapa status→tela respeita o papel: quando a
// pessoa não entra na tela, o botão não aparece.
import { ArrowUpRight, Copy, Link2, Lock } from "lucide-react";
import { Botao, BotaoLink } from "@/components/ui/botao";
import { motivoEventoFinalizado, todayBusinessMs } from "@/lib/status";
import { proximaTelaDoStatus } from "@/lib/painel-rotas";
import { moldeConcluido } from "@shared/molde";
import { FS, FW, R, T } from "@/lib/theme";
import { PrioridadeNaImpressao } from "@/components/prioridade-na-impressao";
import type { PecaDoPainel } from "./tipos";

export function AcoesDaFicha({ selectedItem, role, onCopiarLink }: {
  selectedItem: PecaDoPainel;
  role: string | null | undefined;
  onCopiarLink: () => void;
}) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
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
              style={{ display: "inline-flex", alignItems: "flex-start", gap: 8, padding: "8px 12px", borderRadius: R.md, border: `1px solid ${T.border}`, background: T.bg, color: T.apoio, fontSize: FS.meta, fontWeight: FW.medio, maxWidth: 420, lineHeight: 1.45 }}
            >
              <Lock aria-hidden="true" style={{ width: 13, height: 13, flexShrink: 0, color: T.second, marginTop: 2 }} />
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
        // A AÇÃO DA FICHA: é a única que leva a pessoa a TRABALHAR na peça,
        // então é a principal (primário escuro) e vem primeiro. As outras
        // duas são leitura e ficam secundárias.
        return (
          <BotaoLink href={tela.path} variante="primario" icone={ArrowUpRight} data-testid="link-continuar-em">
            Continuar em {tela.label}
          </BotaoLink>
        );
      })()}
      {/* PRIORIDADE NA IMPRESSÃO (dono, 08/10): da Revisão Final até a
          impressão terminar, para a Solicitação e o admin. */}
      <PrioridadeNaImpressao item={selectedItem} eventoFinalizado={!!motivoEventoFinalizado(selectedItem.event ?? null, todayBusinessMs())} />
      {selectedItem.eventId && (
        <BotaoLink href={`/eventos/${selectedItem.eventId}`} variante="secundario" icone={Link2} data-testid="link-abrir-evento-ficha">
          Abrir evento
        </BotaoLink>
      )}
      <Botao
        variante="secundario"
        icone={Copy}
        onClick={onCopiarLink}
        data-testid="button-copiar-link-peca"
      >
        Copiar link da peça
      </Botao>
    </div>
  );
}
