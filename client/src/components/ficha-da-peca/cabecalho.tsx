// CABEÇALHO da ficha: identificação, título, saída do caminhão e a trilha de etapas.
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { X, Check, Recycle, Truck, ArrowLeftRight } from "lucide-react";
import { SeloPrazoMolde } from "@/components/prazo-do-molde";
import { prazoDoMolde } from "@shared/prazo-molde";
import { toUTCDisplayDate } from "@/lib/utils";
import { ehMolde, etapaDoMolde, ETAPAS_DO_MOLDE } from "@shared/molde";
import { pecaTravada, fraseDaTrava, seloDaTrava } from "@shared/trava-da-peca";
import { todayBusinessMs } from "@/lib/status";
import { useAuth } from "@/contexts/auth-context";
import { T, TOM, FONT } from "@/lib/theme";
import { DIA_MS, STATUS_STEP, TIMELINE_STEPS } from "./estilos";
import { haQuantoTempo } from "./formatos";
import { SubTrilhaDaProducao } from "./sub-trilha-da-producao";
import type { ItemDaFicha } from "./tipos";

export function CabecalhoDaFicha({ item, isMobile, onTransferir, onOpenChange }: {
  item: ItemDaFicha;
  isMobile: boolean;
  onTransferir: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  const { user } = useAuth();
  const fsf = (n: number) => (isMobile ? Math.max(12, n) : n);
  const rawStatus = (item.status || "").trim();
  // MOLDE (22/09): trilha própria de três etapas — Arte → Revisão → Produzido.
  const step = ehMolde(item) ? etapaDoMolde(rawStatus) : (STATUS_STEP[rawStatus] ?? STATUS_STEP[rawStatus.toLowerCase()] ?? -1);

  // ── Prazo ─────────────────────────────────────────────────────────────────
  // toUTCDisplayDate faz `new Date(x)`, que aceita string e Date do mesmo jeito.
  const saida = item.event?.truckDepartureDate ? toUTCDisplayDate(item.event.truckDepartureDate as string) : null;
  const diasAteSaida = saida ? Math.ceil((saida.getTime() - todayBusinessMs()) / DIA_MS) : null;
  const prazoApertado = diasAteSaida !== null && diasAteSaida <= 7;
  const textoDoPrazo = diasAteSaida === null ? null
    : diasAteSaida < 0 ? `${haQuantoTempo(-diasAteSaida)}`
    : diasAteSaida === 0 ? "é hoje"
    : diasAteSaida === 1 ? "falta 1 dia"
    : `faltam ${diasAteSaida} dias`;

  return (
    <header
      style={{
        flexShrink: 0,
        background: `linear-gradient(135deg, ${T.text} 0%, #2d2926 100%)`,
        color: T.surface,
        padding: isMobile ? "16px 16px 0" : "22px 32px 0",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
        <div style={{ minWidth: 0, flex: "1 1 auto" }}>
          {/* Linha de identificação */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
            <span style={{ fontFamily: FONT.mono, fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.5)", letterSpacing: "0.06em" }}>
              {item.displayId}
            </span>
            <span aria-hidden="true" style={{ width: 1, height: 12, backgroundColor: "rgba(255,255,255,0.18)" }} />
            {/* O EVENTO DESCE DE TÍTULO PARA LINHA DE CONTEXTO. Ele nomeia
                dezenas de peças ao mesmo tempo; quem abre a ficha já sabe em
                que evento está e precisa saber QUAL peça é esta. */}
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 320 }}>
              {item.event?.name || "Sem evento"}
            </span>
            {(item.isReuse || (item.reuseQty ?? 0) > 0) && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 999, backgroundColor: "rgba(22,101,52,0.28)", color: "#4ade80", fontSize: fsf(11), fontWeight: 700, whiteSpace: "nowrap" }}>
                <Recycle aria-hidden="true" style={{ width: 11, height: 11 }} />
                {item.isReuse ? "Reaproveitamento" : `${item.reuseQty}ª de ${item.quantity} usos`}
              </span>
            )}
            {/* TRANSFERIR — só admin (dono, 11/09). Muda só o dono da
                peça; status e todo o resto seguem como estavam. */}
            {user?.role === "admin" && (
              <button
                type="button"
                onClick={onTransferir}
                data-testid="button-transferir-evento"
                title="Transferir esta peça para outro evento, sem mudar o status"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  padding: "3px 10px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.18)",
                  backgroundColor: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.75)",
                  fontSize: fsf(11), fontWeight: 700, whiteSpace: "nowrap", cursor: "pointer",
                }}
              >
                <ArrowLeftRight aria-hidden="true" style={{ width: 11, height: 11 }} />
                Transferir evento
              </button>
            )}
          </div>

          {/* O TÍTULO É A DESCRIÇÃO DA PEÇA. */}
          <h1 style={{
            fontFamily: FONT.display,
            fontSize: isMobile ? 22 : 30, fontWeight: 800,
            letterSpacing: "-0.03em", color: T.surface, margin: 0, lineHeight: 1.12,
          }}>
            {item.description || item.type || item.displayId}
          </h1>
          {/* O SUBTÍTULO NÃO REPETE O TÍTULO (dono, 24/09). Com descrição
              igual ao tipo ("Placa de octanorme (…)" nos dois), a linha de
              baixo repetia o título inteiro antes do material e da medida. */}
          {(() => {
            const tipoRepete = !item.type || !item.description
              || item.type.trim().toLowerCase() === item.description.trim().toLowerCase();
            const partes = [tipoRepete ? null : item.type, item.material, item.measurement].filter(Boolean);
            if (!item.description || partes.length === 0) return null;
            return (
              <p data-testid="subtitulo-da-ficha" style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", margin: "6px 0 0", maxWidth: 620, lineHeight: 1.5 }}>
                {partes.join(" · ")}
              </p>
            );
          })()}
        </div>

        {/* Prazo + fechar */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexShrink: 0 }}>
          {saida && !isMobile && (
            <div style={{ textAlign: "right" }}>
              <p style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 5, fontSize: fsf(10), fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.5)", margin: "0 0 3px" }}>
                <Truck aria-hidden="true" style={{ width: 11, height: 11 }} />
                Saída do caminhão
              </p>
              <p style={{ fontFamily: FONT.mono, fontSize: 17, fontWeight: 700, color: TOM.laranja.border, margin: 0, whiteSpace: "nowrap" }}>
                {format(saida, "dd/MM 'às' HH:mm", { locale: ptBR })}
              </p>
              {textoDoPrazo && (
                <p style={{ fontSize: fsf(11), fontWeight: 600, color: prazoApertado ? TOM.perigo.border : "rgba(255,255,255,0.6)", margin: "2px 0 0", whiteSpace: "nowrap" }}>
                  {textoDoPrazo}
                </p>
              )}
            </div>
          )}
          <button
            onClick={() => onOpenChange(false)}
            aria-label="Fechar"
            data-testid="button-fechar-ficha"
            style={{
              // 44px no celular: o X era 36 — abaixo do alvo de toque.
              width: isMobile ? 44 : 36, height: isMobile ? 44 : 36, borderRadius: 999, flexShrink: 0,
              backgroundColor: "rgba(255,255,255,0.08)", border: "none", cursor: "pointer",
              color: T.surface, display: "flex", alignItems: "center", justifyContent: "center",
              transition: "background 0.15s",
            }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.18)"; }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.08)"; }}
          >
            <X style={{ width: 18, height: 18 }} />
          </button>
        </div>
      </div>

      {/* Prazo no mobile: sob o título, onde há largura para ele. */}
      {saida && isMobile && (
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 12 }}>
          <span style={{ fontSize: fsf(10), fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.5)" }}>Saída</span>
          <span style={{ fontFamily: FONT.mono, fontSize: 15, fontWeight: 700, color: TOM.laranja.border }}>
            {format(saida, "dd/MM 'às' HH:mm", { locale: ptBR })}
          </span>
          {textoDoPrazo && (
            <span style={{ fontSize: fsf(11), fontWeight: 600, color: prazoApertado ? TOM.perigo.border : "rgba(255,255,255,0.6)" }}>{textoDoPrazo}</span>
          )}
        </div>
      )}

      {/* ── TRILHA DE ETAPAS ──
          Decorativa: o estado que importa está escrito na faixa logo
          abaixo, em texto. Anunciar seis etapas com "concluída/atual/
          futura" antes da frase que resolve seria ler o índice antes do
          capítulo.

          Círculos ligados por linha viraram COLUNAS com barra: a linha de
          1px entre bolinhas dava um fio que sumia no gradiente, e os
          rótulos de 10px em coluna forçavam rolagem horizontal. Agora cada
          etapa ocupa a mesma fração da largura e a barra de 3px abaixo dela
          é o que se lê de longe. */}
      {(() => {
        const etapas = ehMolde(item) ? ETAPAS_DO_MOLDE : TIMELINE_STEPS;
        const atual = etapas.find(s => s.idx === step);
        return (
          <>
            <div aria-hidden="true" style={{ display: "flex", gap: 6, margin: isMobile ? "16px 0 0" : "20px 0 0" }} data-testid="trilha-da-ficha">
              {etapas.map(s => {
                const done    = s.idx < step;
                const current = s.idx === step;
                return (
                  <div key={s.idx} style={{ flex: "1 1 0", minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: isMobile ? "center" : undefined, gap: 6, marginBottom: 7, minWidth: 0 }}>
                      <span style={{
                        width: isMobile ? 22 : 18, height: isMobile ? 22 : 18, borderRadius: "50%", flexShrink: 0,
                        backgroundColor: (done || current) ? T.accentText : "rgba(255,255,255,0.09)",
                        boxShadow: current ? "0 0 0 3px rgba(251,146,60,0.25)" : "none",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        color: (done || current) ? T.surface : "rgba(255,255,255,0.55)",
                        fontSize: isMobile ? 12 : 9, fontWeight: 800,
                      }}>
                        {done ? <Check style={{ width: isMobile ? 12 : 10, height: isMobile ? 12 : 10, strokeWidth: 3 }} /> : s.idx + 1}
                      </span>
                      {/* NO CELULAR, SÓ O NÚMERO (revisão de 24/09). Seis
                          rótulos em ~50px cada viravam "Vín…", "Ap…" — a
                          trilha não dizia nada. No celular a coluna fica só
                          com o número/✓ e o NOME DA ETAPA ATUAL vai por
                          extenso logo abaixo. Nenhum alfa abaixo de 0.55
                          sobre este gradiente: 0.35 dá 3,11 e reprova. */}
                      {!isMobile && (
                        <span style={{
                          fontSize: 11, fontWeight: current ? 700 : 500,
                          color: current ? T.surface : "rgba(255,255,255,0.55)",
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0,
                        }}>
                          {s.label}
                        </span>
                      )}
                    </div>
                    <div style={{ height: 3, borderRadius: 999, backgroundColor: (done || current) ? T.accentText : "rgba(255,255,255,0.09)" }} />
                  </div>
                );
              })}
            </div>
            {isMobile && (
              <p data-testid="etapa-atual-da-ficha" style={{ margin: "8px 0 0", fontSize: 13, color: "rgba(255,255,255,0.75)" }}>
                {atual
                  ? <>Etapa {atual.idx + 1} de {etapas.length} · <b style={{ color: T.surface, fontWeight: 700 }}>{atual.label}</b></>
                  : step >= etapas.length
                    ? <>Todas as {etapas.length} etapas concluídas</>
                    : <>Antes da {etapas[0].label}</>}
              </p>
            )}
          </>
        );
      })()}
      {!ehMolde(item) && <SubTrilhaDaProducao item={item} isMobile={isMobile} />}
      {/* Travada pela Solicitação (21/09): texto discreto, com o motivo e quem travou. */}
      {pecaTravada(item) && (
        <div data-testid="selo-travada-ficha" title={fraseDaTrava(item)} style={{ marginTop: 8, fontSize: 12, fontWeight: 700, color: TOM.perigo.border, overflowWrap: "anywhere" }}>{seloDaTrava(item)}</div>
      )}
      {/* PRAZO DO MOLDE (22/09): só no molde de evento que tem o prazo; não entra na Gestão de Prazos. */}
      {prazoDoMolde(item, item.event, new Date()) && (
        <div style={{ marginTop: 8 }}><SeloPrazoMolde item={item} caixa /></div>
      )}
      <div style={{ height: isMobile ? 16 : 20 }} />
    </header>
  );
}
