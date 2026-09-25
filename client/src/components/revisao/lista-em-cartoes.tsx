// A fila em CARTÕES (área útil < 820px): um bloco por evento, um cartão por peça.
import { Truck } from "lucide-react";
import { T, TOM, FS } from "@/lib/theme";
import { saidaDoCaminhao } from "./cabecalho-do-evento";
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
          <section key={eventKey} aria-label={evInfo?.name || "Sem Evento"} style={{marginBottom:16}}>
            {/* O CABEÇALHO DO EVENTO também diz a URGÊNCIA (25/09): na tabela a
                faixa escura mostra a saída do caminhão com os dias; aqui só o
                nome aparecia, em 11px cinza — no celular não havia como saber
                qual evento sai primeiro sem abrir peça por peça. Mesma conta
                (`saidaDoCaminhao`), no tom de texto de cada nível (AA sobre o
                fundo claro). */}
            <div style={{display:"flex",alignItems:"center",flexWrap:"wrap",gap:"4px 10px",padding:"8px 0 6px", borderBottom:`2px solid ${T.accent}`, marginBottom:8}}>
              <h2 style={{margin:0,minWidth:0,flex:"1 1 auto",fontSize:FS.meta,fontWeight:900,textTransform:"uppercase",letterSpacing:"0.06em",color:T.strong,overflowWrap:"anywhere"}}>
                {evInfo?.name || "Sem Evento"}
                <span style={{fontWeight:700,color:T.apoio,letterSpacing:0,textTransform:"none"}}>{" · "}{eventItems.length} {eventItems.length === 1 ? "peça" : "peças"}</span>
              </h2>
              {evInfo?.truckDepartureDate && (() => {
                const s = saidaDoCaminhao(evInfo);
                const cor = s.nivel === "perigo" ? TOM.perigo.text : s.nivel === "laranja" ? TOM.laranja.text : T.apoio;
                return (
                  <span data-testid={`chip-caminhao-cartoes-${eventKey}`} title={s.title} style={{display:"inline-flex",alignItems:"center",gap:5,fontSize:FS.meta,fontWeight:700,color:cor,whiteSpace:"nowrap"}}>
                    <Truck aria-hidden="true" style={{width:13,height:13}} />
                    {s.data}{" · "}{s.quando}
                  </span>
                );
              })()}
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
          </section>
        );
      })}
    </div>
  );
}
