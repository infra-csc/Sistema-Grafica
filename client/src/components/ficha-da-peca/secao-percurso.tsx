// PERCURSO — a lista única dos acontecimentos da peça, mais recente primeiro.
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronDown } from "lucide-react";
import { parseDateLocal } from "@/lib/utils";
import { marcoEventoFinalizado, todayBusinessMs } from "@/lib/status";
import { T, N, FONT } from "@/lib/theme";
import { CARTAO, TITULO_SECAO } from "./estilos";
import { fmtShort } from "./formatos";
import type { EventoDoPercurso, ItemDaFicha } from "./tipos";

const PERCURSO_VISIVEL = 4;

export function SecaoPercurso({ item, eventosPercurso, percursoAberto, setPercursoAberto, ALVO }: {
  item: ItemDaFicha;
  eventosPercurso: EventoDoPercurso[];
  percursoAberto: boolean;
  setPercursoAberto: React.Dispatch<React.SetStateAction<boolean>>;
  /** Alvo de toque / de ponteiro. */
  ALVO: number;
}) {
  // FIM DA HISTÓRIA — o evento desta peça saiu de circulação (encerrado por
  // alguém, ou realizado porque a data passou). Pedido do dono (14/08): a
  // trilha não dizia isso em lugar nenhum, embora seja o que explica a peça ter
  // parado onde parou. Esta ficha abre em cinco telas (Arte, Gráfica,
  // Solicitação, Vincular, Painel Geral), então o marco chega às cinco de uma
  // vez. `item.event` é o evento cru do enrich de /api/items: traz `status` e
  // `startDate`, as duas colunas do predicado.
  const marcoEvento = marcoEventoFinalizado(item.event, todayBusinessMs());

  const percursoVisivel = percursoAberto ? eventosPercurso : eventosPercurso.slice(0, PERCURSO_VISIVEL);
  const percursoEscondidos = eventosPercurso.length - percursoVisivel.length;

  return (
    <section data-testid="section-percurso">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
        <h3 style={TITULO_SECAO}>Percurso</h3>
        <span style={{ fontSize: 12, color: T.apoio }}>{eventosPercurso.length} registro{eventosPercurso.length === 1 ? "" : "s"}</span>
      </div>

      <div style={{ ...CARTAO, padding: "4px 14px" }}>
        {marcoEvento && (
          <div title={marcoEvento.hint} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 0", borderBottom: eventosPercurso.length ? `1px solid ${N.n2}` : "none" }}>
            <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: marcoEvento.dot, marginTop: 6, flexShrink: 0 }} />
            <div style={{ minWidth: 0, flex: "1 1 auto" }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: marcoEvento.text, margin: 0, lineHeight: 1.4 }}>{marcoEvento.label}</p>
              <p style={{ fontSize: 11, color: T.second, margin: "2px 0 0" }}>
                {marcoEvento.dataEventoISO
                  ? format(parseDateLocal(marcoEvento.dataEventoISO), "dd/MM/yy", { locale: ptBR })
                  : "Data e autor no Histórico geral"}
              </p>
            </div>
          </div>
        )}

        {eventosPercurso.length === 0 && !marcoEvento && (
          <p style={{ fontSize: 13, color: T.apoio, margin: 0, padding: "12px 0" }}>Sem registros para esta peça.</p>
        )}

        {percursoVisivel.map((e, i) => (
          <div key={e.chave} style={{
            display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 0",
            borderBottom: i < percursoVisivel.length - 1 ? `1px solid ${N.n2}` : "none",
          }}>
            <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: e.cor, marginTop: 6, flexShrink: 0 }} />
            <div style={{ minWidth: 0, flex: "1 1 auto" }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: T.text, margin: 0, lineHeight: 1.45 }}>{e.texto}</p>
              {e.autor && <p style={{ fontSize: 11, color: T.second, margin: "2px 0 0" }}>{e.autor}</p>}
            </div>
            <span style={{ fontFamily: FONT.mono, fontSize: 11, color: T.second, flexShrink: 0, marginTop: 2 }}>
              {fmtShort(new Date(e.ts).toISOString())}
            </span>
          </div>
        ))}

        {(percursoEscondidos > 0 || percursoAberto) && (
          <button
            type="button"
            onClick={() => setPercursoAberto(v => !v)}
            data-testid="button-percurso-expand"
            style={{
              width: "100%", height: ALVO, marginBottom: 4,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              border: "none", borderTop: `1px solid ${N.n2}`, background: "none",
              cursor: "pointer", font: "inherit", fontSize: 12, fontWeight: 700, color: T.accentText,
            }}
          >
            <ChevronDown aria-hidden="true" style={{ width: 13, height: 13, transform: percursoAberto ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
            {percursoAberto ? "Ver menos" : `Ver os ${percursoEscondidos} registros anteriores`}
          </button>
        )}
      </div>
    </section>
  );
}
