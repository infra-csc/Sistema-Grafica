// ─── Devolvidas para o rascunho ─────────────────────────────────────────────
// Dono, 29/10: "as peças que a arte devolve pra mim (ficam nos rascunhos),
// antigamente eu conseguia ver na tela inicial. Agora não aparece mais." O
// Painel só as contava dentro do card "Solicitado" ("inclui N rascunhos"),
// misturadas com rascunho que nunca saiu e sem dizer o porquê.
//
// O aviso existe só quando há peça devolvida — é trabalho de quem lê, não
// informação de recorte (por isso não segue os filtros da tela, como o número
// no menu). Agrupado por evento, porque é lá que a peça se corrige e sai de
// novo: cada grupo leva direto ao card de rascunhos daquele evento. O motivo
// vem por extenso — sem ele, a pessoa abre o evento e não sabe o que mudar.
import { useState } from "react";
import { ArrowUpRight, Undo2 } from "lucide-react";
import { BotaoLink, Botao } from "@/components/ui/botao";
import { FS, FW, R, SHADOW, T, TOM, FONT } from "@/lib/theme";
import { nomeDaOrigem, rotuloDasDevolvidas, type PecaDevolvida } from "@shared/devolvidas-ao-rascunho";

/** Quantos eventos e quantas peças por evento cabem antes do "mostrar mais". */
const EVENTOS_DE_INICIO = 3;
const PECAS_POR_EVENTO = 4;

/** "28/10 16:26" — a hora real da devolução, no fuso de quem lê. */
const quando = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
};

type GrupoDoEvento = { eventId: string; eventName: string; pecas: PecaDevolvida[] };

/** Agrupa por evento mantendo a ordem da API (a devolução mais recente primeiro). */
function porEvento(pecas: PecaDevolvida[]): GrupoDoEvento[] {
  const grupos = new Map<string, GrupoDoEvento>();
  for (const p of pecas) {
    const g = grupos.get(p.eventId) ?? { eventId: p.eventId, eventName: p.eventName, pecas: [] };
    g.pecas.push(p);
    grupos.set(p.eventId, g);
  }
  return Array.from(grupos.values());
}

export function AvisoDeDevolvidas({ pecas, useCards, dedo }: { pecas: PecaDevolvida[]; useCards: boolean; dedo: boolean }) {
  const [todos, setTodos] = useState(false);
  if (pecas.length === 0) return null;
  const grupos = porEvento(pecas);
  const visiveis = todos ? grupos : grupos.slice(0, EVENTOS_DE_INICIO);
  const escondidos = grupos.length - visiveis.length;

  return (
    <section
      aria-labelledby="titulo-aviso-devolvidas"
      data-testid="aviso-devolvidas"
      style={{
        display: "flex", flexDirection: "column", gap: 10,
        backgroundColor: T.surface, border: `1px solid ${TOM.alerta.border}`, borderRadius: R.lg,
        padding: useCards ? 12 : "12px 16px", boxShadow: SHADOW.sm,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <Undo2 aria-hidden="true" style={{ width: 16, height: 16, color: TOM.alerta.text, flexShrink: 0, marginTop: 2 }} />
        <div style={{ minWidth: 0 }}>
          <h2 id="titulo-aviso-devolvidas" style={{ margin: 0, fontSize: FS.body, fontWeight: FW.forte, color: T.text, lineHeight: 1.4 }}>
            {rotuloDasDevolvidas(pecas.length)}
          </h2>
          <p style={{ margin: "2px 0 0", fontSize: FS.small, color: T.second, lineHeight: 1.45 }}>
            Voltaram para você. Corrija o que o motivo pede e envie de novo pelo card de rascunhos do evento.
          </p>
        </div>
      </div>

      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
        {visiveis.map((g) => {
          const mostradas = g.pecas.slice(0, PECAS_POR_EVENTO);
          const resto = g.pecas.length - mostradas.length;
          return (
            <li
              key={g.eventId}
              data-testid={`devolvidas-evento-${g.eventId}`}
              style={{ border: `1px solid ${T.border}`, borderRadius: R.md, padding: useCards ? 10 : "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                  <span style={{ fontSize: FS.body, fontWeight: FW.forte, color: T.text, overflowWrap: "anywhere" }}>{g.eventName}</span>
                  <span style={{ fontSize: FS.small, color: T.second, marginLeft: 6, fontVariantNumeric: "tabular-nums" }}>
                    · {g.pecas.length} {g.pecas.length === 1 ? "peça" : "peças"}
                  </span>
                </div>
                <BotaoLink
                  href={`/eventos/${g.eventId}#rascunhos-do-evento`}
                  variante="secundario"
                  tamanho={dedo ? "toque" : "sm"}
                  icone={ArrowUpRight}
                  larguraCheia={useCards}
                  data-testid={`abrir-rascunhos-${g.eventId}`}
                >
                  Abrir os rascunhos do evento
                </BotaoLink>
              </div>
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                {mostradas.map((p) => (
                  <li key={p.id} data-testid={`devolvida-${p.id}`} style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", minWidth: 0 }}>
                      {p.displayId && <span style={{ fontFamily: FONT.mono, fontWeight: FW.forte, fontSize: FS.meta, color: T.accentText, flexShrink: 0 }}>{p.displayId}</span>}
                      <span style={{ fontSize: FS.body, color: T.text, minWidth: 0, overflowWrap: "anywhere" }}>
                        {p.description ? `${p.type} · ${p.description}` : p.type}
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: FS.small, color: T.strong, lineHeight: 1.45, overflowWrap: "anywhere" }}>
                      {p.motivo
                        ? <>“{p.motivo}”</>
                        : <span style={{ color: T.second }}>Sem motivo escrito — veja o histórico da peça.</span>}
                    </p>
                    <span style={{ fontSize: FS.micro, color: T.second, fontVariantNumeric: "tabular-nums" }}>
                      Devolvida pela {nomeDaOrigem(p.origem)} · {p.por} · {quando(p.em)}
                    </span>
                  </li>
                ))}
              </ul>
              {resto > 0 && (
                <span style={{ fontSize: FS.small, color: T.second }}>
                  e mais {resto} {resto === 1 ? "peça" : "peças"} neste evento
                </span>
              )}
            </li>
          );
        })}
      </ul>

      {escondidos > 0 && (
        <Botao
          variante="fantasma"
          tamanho={dedo ? "toque" : "sm"}
          onClick={() => setTodos(true)}
          data-testid="mostrar-todas-devolvidas"
          style={{ alignSelf: useCards ? "stretch" : "flex-start" }}
        >
          Mostrar mais {escondidos} {escondidos === 1 ? "evento" : "eventos"}
        </Botao>
      )}
    </section>
  );
}
