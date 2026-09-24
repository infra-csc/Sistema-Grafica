// TRANSFERIR DE EVENTO — o diálogo que o admin abre pelo cabeçalho da ficha.
import { ArrowLeftRight } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { FilterSelect } from "@/components/filter-select";
import { T, N, TOM, FONT } from "@/lib/theme";
import { Botao } from "@/components/ui/botao";
import { useLetraDaFicha } from "./estilos";
import type { EventoParaTransferir, ItemDaFicha } from "./tipos";

export function DialogoTransferirEvento({
  item, transferOpen, setTransferOpen, transferDestino, setTransferDestino,
  transferindo, todosEventos, eventosCarregando, handleTransferEvent,
}: {
  item: ItemDaFicha;
  transferOpen: boolean;
  setTransferOpen: (aberto: boolean) => void;
  transferDestino: string;
  setTransferDestino: (id: string) => void;
  transferindo: boolean;
  todosEventos: EventoParaTransferir[];
  eventosCarregando: boolean;
  handleTransferEvent: () => void;
}) {
  const fsf = useLetraDaFicha();
  // Diálogo próprio, aninhado ao da ficha (Radix suporta; o de baixo some
  // quando o de cima fecha o item inteiro). Só o eventId muda: nada de
  // status, aprovações ou fotos aqui.
  return (
    <Dialog open={transferOpen} onOpenChange={(v) => { if (!transferindo) { setTransferOpen(v); if (!v) setTransferDestino(""); } }}>
      <DialogContent style={{ maxWidth: 440, padding: 0, gap: 0, borderRadius: 12, overflow: "hidden" }}>
        <div style={{ padding: "22px 24px 18px", borderBottom: `1px solid ${N.n3}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <ArrowLeftRight style={{ width: 17, height: 17, color: TOM.info.dot }} />
            <DialogTitle style={{ fontFamily: FONT.display, fontSize: 17, fontWeight: 800, letterSpacing: "-0.03em", color: T.text, margin: 0 }}>
              Transferir peça de evento
            </DialogTitle>
          </div>
          <DialogDescription style={{ fontSize: 12.5, color: T.second, margin: 0, paddingLeft: 27 }}>
            {item.displayId} · atualmente em "{item.event?.name || "Sem evento"}" — o status não muda.
          </DialogDescription>
        </div>

        <div style={{ padding: "20px 24px" }}>
          <label style={{ fontSize: fsf(11), fontWeight: 700, color: T.second, textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 8 }}>
            Evento de destino
          </label>
          <FilterSelect
            kind="field" fullWidth hideWhenEmpty={false}
            label="Evento de destino"
            placeholder={eventosCarregando ? "Carregando eventos…" : "— Escolha um evento —"}
            disabled={eventosCarregando || transferindo}
            value={transferDestino}
            onChange={setTransferDestino}
            options={todosEventos
              .filter((e) => e.id !== item.eventId)
              .map((e) => ({ value: e.id, label: e.name }))}
            searchPlaceholder="Buscar evento..."
            emptyText="Nenhum outro evento encontrado"
            panelWidth={320}
            testId="select-transfer-destino"
            triggerStyle={{
              width: "100%", padding: "10px 12px 10px 14px", height: "auto", borderRadius: 8,
              border: `1.5px solid ${T.border}`, fontSize: 15,
              fontFamily: FONT.display, backgroundColor: T.surface,
              cursor: eventosCarregando ? "wait" : "pointer",
            }}
          />
        </div>

        <div style={{ padding: "16px 24px", borderTop: `1px solid ${N.n3}`, display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Botao
            variante="fantasma"
            onClick={() => { setTransferOpen(false); setTransferDestino(""); }}
            disabled={transferindo}
            data-testid="button-cancelar-transferencia"
            style={{ minHeight: 40, padding: "0 18px" }}
          >
            Cancelar
          </Botao>
          {/* Primário preto, como o resto do app — o azul de antes era a
              única ação principal da ficha com cor própria. O motivo do
              desabilitado fica visível: sem destino não há o que transferir. */}
          <Botao
            variante="primario"
            onClick={handleTransferEvent}
            disabled={!transferDestino}
            carregando={transferindo}
            motivo={!transferDestino ? "Escolha o evento de destino." : undefined}
            alinharMotivo="end"
            data-testid="button-confirmar-transferencia"
            style={{ minHeight: 40, padding: "0 18px" }}
          >
            {transferindo ? "Transferindo…" : "Transferir"}
          </Botao>
        </div>
      </DialogContent>
    </Dialog>
  );
}
