// A faixa escura de cada evento na tabela: nome, quantas pendentes, início,
// a saída do caminhão com os dias e os dois prazos da Solicitação.
import { Truck } from "lucide-react";
import { Selo } from "@/components/ui/selo";
import { parseDateLocal } from "@/lib/utils";
import { T, TOM, FS, FONT, ESCURO } from "@/lib/theme";

/**
 * As pílulas da faixa escura: o fundo e a borda translúcidos da casa sobre o
 * escuro (ESCURO.realce/borda) e a COR DO TEXTO dizendo a urgência — o tom
 * claro (border) de cada família, que passa de 9:1 sobre o n10. Eram quatro
 * trios rgba/hex digitados à mão, sem relação com a paleta.
 */
const PILULA_NO_ESCURO = {
  display: "inline-flex", alignItems: "center", gap: 5, flexShrink: 0,
  backgroundColor: ESCURO.realce, border: `1px solid ${ESCURO.borda}`, borderRadius: 999,
  padding: "3px 9px", fontSize: FS.micro, fontWeight: 700, letterSpacing: "0.04em",
  whiteSpace: "nowrap", textTransform: "none",
} as const;
import type { EventoDaPeca } from "./tipos";

/**
 * A SAÍDA DO CAMINHÃO, COM OS DIAS — a mesma conta na faixa escura da tabela
 * e no cabeçalho claro da lista em cartões. A saída é gravada no "horário de
 * exibição" (UTC = relógio de São Paulo), daí o timeZone "UTC" na data e na
 * hora. `nivel` é a régua de urgência: cada superfície pinta com o seu tom.
 */
export function saidaDoCaminhao(event: Pick<EventoDaPeca, "truckDepartureDate" | "datasDoKit">) {
  const saida = new Date(event.truckDepartureDate as string);
  const hoje = new Date(); hoje.setHours(0,0,0,0);
  const dia = new Date(saida); dia.setHours(0,0,0,0);
  const dias = Math.ceil((dia.getTime() - hoje.getTime()) / 86400000);
  const nivel: "perigo" | "laranja" | "neutro" = dias <= 7 ? "perigo" : dias <= 30 ? "laranja" : "neutro";
  const quando = dias < 0 ? `há ${-dias}d`
    : dias === 0 ? "hoje"
    : dias === 1 ? "amanhã"
    : `${dias}d`;
  const data = saida.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", timeZone: 'UTC' }).toUpperCase().replace(".", "");
  const hora = saida.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: 'UTC' });
  const title = `Saída do caminhão em ${saida.toLocaleDateString("pt-BR", { timeZone: 'UTC' })} às ${hora}`;
  return { dias, nivel, quando, data, hora, title, comHora: !event.datasDoKit };
}

export function CabecalhoDoEvento({ eventId, event, total, grupoMarcado, aoMarcarGrupo, colunasDeDados }: {
  eventId: string;
  event: EventoDaPeca | undefined;
  total: number;
  grupoMarcado: boolean;
  aoMarcarGrupo: () => void;
  colunasDeDados: number;
}) {
  return (
    <tr style={{ backgroundColor: T.text, borderTop: `1px solid ${T.strong}`, borderBottom: `1px solid ${T.strong}` }}>
      <td style={{ padding: "10px 24px", textAlign: "center" }}>
        <input
          type="checkbox"
          checked={grupoMarcado}
          onChange={aoMarcarGrupo}
          aria-label={`Selecionar evento ${event?.name || "sem evento"}`}
          data-testid={`checkbox-group-${eventId}`}
          style={{ accentColor: T.accent, width: 20, height: 20, cursor: "pointer", backgroundColor: T.strong }}
        />
      </td>
      {/* colSpan = as colunas de dados depois do checkbox (quatro; três no
          compacto, com a medida fundida). Declarar mais colunas do que existem
          faz o navegador criar colunas FANTASMA e redistribuir a largura — o
          que empurrava o botão Revisar para fora do card. */}
      <td colSpan={colunasDeDados} style={{ padding: "10px 16px" }}>
        {/* flexWrap: quando os chips não cabem ao lado do nome, DESCEM de
            linha — nunca empurram a largura da tabela. */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
            <span style={{
              fontFamily: FONT.display,
              fontSize: FS.meta, fontWeight: 900,
              color: T.surface, textTransform: "uppercase", letterSpacing: "0.06em",
            }}>
              {event?.name || "Sem Evento"}
            </span>
            <Selo tamanho="sm" cores={{ bg: T.accentText, border: T.accentText, text: T.surface }}>
              {total} PENDENTE{total !== 1 ? "S" : ""}
            </Selo>
          </div>
          {event && (
            <div style={{ display: "flex", gap: "6px 10px", fontSize: FS.micro, color: ESCURO.apoio, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", flexWrap: "wrap", alignItems: "center", minWidth: 0 }}>
              {event.startDate && (
                <span>Início <span style={{ color: ESCURO.texto, fontFamily: FONT.mono, letterSpacing: 0 }}>{parseDateLocal(event.startDate).toLocaleDateString("pt-BR")}</span></span>
              )}
              {/* ── A SAÍDA DO CAMINHÃO, COM OS DIAS ──
                  Os eventos já vêm na ordem da saída (ver `itemsByEvent`), mas
                  a DATA sozinha obrigava a fazer a conta de cabeça, evento por
                  evento. A urgência fica escrita. A cor sai da mesma régua dos
                  chips de prazo ao lado — nada de um terceiro vocabulário de
                  urgência no mesmo cabeçalho. */}
              {event.truckDepartureDate && (() => {
                const s = saidaDoCaminhao(event);
                const cor = s.nivel === "perigo" ? TOM.perigo.border : s.nivel === "laranja" ? TOM.laranja.border : ESCURO.texto;
                return (
                  <span
                    data-testid={`chip-caminhao-${eventId}`}
                    title={s.title}
                    style={{ ...PILULA_NO_ESCURO, color: cor }}
                  >
                    <Truck aria-hidden="true" style={{ width: 11, height: 11 }} />
                    {event.datasDoKit ? "Entrega do material" : "Caminhão"} {s.data}
                    {s.comHora && <>{" · "}{s.hora}</>}
                    {" · "}{s.quando}
                  </span>
                );
              })()}
              {event.truckDepartureDate && (() => {
                const dls = [
                  { label: "Lista de Imagens", days: event.deadlineListaImagens  ?? -25 },
                  { label: "Revisão de Lista", days: event.deadlineRevisaoLista   ?? -8  },
                ];
                const tod = new Date(); tod.setHours(0,0,0,0);
                return dls.map(({ label, days }) => {
                  const d = new Date(new Date(event.truckDepartureDate).getTime() + days * 86400000);
                  d.setHours(0,0,0,0);
                  const diff = Math.ceil((d.getTime() - tod.getTime()) / 86400000);
                  const ds = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
                  // Vencido, hoje, em até 3 dias, folgado — a mesma régua de
                  // antes, agora no vocabulário da paleta.
                  const cor = diff < 0 ? TOM.perigo.border
                    : diff === 0 ? TOM.alerta.border
                    : diff <= 3 ? TOM.laranja.border
                    : ESCURO.apoio;
                  return (
                    <span key={label} title={diff < 0 ? `${label}: prazo vencido em ${ds}` : `${label}: até ${ds}`} style={{ ...PILULA_NO_ESCURO, gap: 4, color: cor }}>
                      {diff < 0 && <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: TOM.perigo.dot }} />}
                      {label} · {ds}{diff >= 0 && diff <= 14 && <span style={{ fontWeight: 500, color: ESCURO.apoio }}> ({diff}d)</span>}
                    </span>
                  );
                });
              })()}
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}
