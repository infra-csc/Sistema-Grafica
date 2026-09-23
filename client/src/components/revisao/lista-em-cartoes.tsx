// A fila em CARTÕES (área útil < 820px): um bloco por evento, um cartão por peça.
import { T, FS } from "@/lib/theme";
import type { EstoqueDaLinha } from "@/components/consulta-de-estoque/na-revisao";
import type { SeloPecaEventoFinalizado } from "@/lib/status";
import { CartaoDaPeca } from "./cartao-da-peca";
import type { EventoDaPeca, PecaDaRevisao } from "./tipos";

export function ListaEmCartoes({
  itemsByEvent, getEventInfo, selectedItemIds, seloDoItem, estoquePorPeca, falhasPorId, desfazendoReuse,
  dedo, admin, agora, aoAbrir, aoMarcar, aoReaproveitar, aoExcluir,
}: {
  itemsByEvent: Map<string, PecaDaRevisao[]>;
  getEventInfo: (eventId: string) => EventoDaPeca | undefined;
  selectedItemIds: Set<string>;
  seloDoItem: (item: PecaDaRevisao) => SeloPecaEventoFinalizado | null;
  estoquePorPeca: Map<string, EstoqueDaLinha>;
  falhasPorId: Record<string, string>;
  desfazendoReuse: (id: string) => boolean;
  dedo: boolean;
  admin: boolean;
  /** O relógio da página, ao minuto (useRelogioDoMinuto). */
  agora: number;
  aoAbrir: (item: PecaDaRevisao) => void;
  aoMarcar: (id: string) => void;
  aoReaproveitar: (item: PecaDaRevisao) => void;
  aoExcluir: (id: string) => void;
}) {
  return (
    <div>
      {Array.from(itemsByEvent.entries()).map(([eventKey, eventItems]) => {
        const evInfo = getEventInfo(eventKey);
        return (
          <div key={eventKey} style={{marginBottom:16}}>
            {/* Event header */}
            <div style={{padding:"8px 0 6px", borderBottom:`2px solid ${T.accent}`, marginBottom:8}}>
              <span style={{fontSize:FS.small,fontWeight:900,textTransform:"uppercase",letterSpacing:"0.08em",color:T.second}}>{evInfo?.name || "Sem Evento"}</span>
            </div>
            {eventItems.map((item) => (
              <CartaoDaPeca
                key={item.id}
                item={item}
                selecionada={selectedItemIds.has(item.id)}
                selo={seloDoItem(item)}
                estoque={estoquePorPeca.get(item.id)}
                falha={falhasPorId[item.id]}
                desfazendo={desfazendoReuse(item.id)}
                dedo={dedo}
                admin={admin}
                agora={agora}
                aoAbrir={aoAbrir}
                aoMarcar={aoMarcar}
                aoReaproveitar={aoReaproveitar}
                aoExcluir={aoExcluir}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}
