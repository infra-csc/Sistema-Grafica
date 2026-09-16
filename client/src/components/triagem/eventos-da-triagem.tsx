// ─────────────────────────────────────────────────────────────────────────────
// TRIAGEM — ENTRADA POR EVENTO (dono, 14/09).
//
// "Uma tela antes aparecendo os eventos disponíveis, quanto tempo está lá;
// depois que clicar no evento ele começa a fazer a triagem." O material volta
// do caminhão por EVENTO — é assim que a pilha chega no galpão —, então a
// triagem começa escolhendo a pilha, não uma tabela com tudo misturado.
//
// Ordem: primeiro o evento com peça RESERVADA para outro evento (a saída do
// caminhão mais próxima primeiro), depois o que espera há mais tempo.
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo } from "react";
import { ArrowRight, BookmarkCheck, CalendarDays, Package, ScanSearch, Table2 } from "lucide-react";
import { miniatura } from "@/lib/miniatura";
import { useIsMobile } from "@/hooks/use-mobile";
import { diaEMes } from "@shared/estoque";
import { FS } from "@/lib/theme";
import type { EnrichedAsset } from "@/lib/inventory-meta";

export type ReservaDaTriagem = { assetId: string; eventName: string; saida: string | null; itemDisplayId: string | null };

const DIA = 86_400_000;

/** Há quanto tempo a peça espera: desde que o ciclo a mandou para a triagem. */
export function tempoDeEspera(desde: number, agora: number) {
  const dias = Math.max(0, Math.floor((agora - desde) / DIA));
  return {
    dias,
    texto: dias === 0 ? "voltou hoje" : dias === 1 ? "voltou ontem" : `voltou há ${dias} dias`,
    cor: dias > 14 ? "#b91c1c" : dias > 7 ? "#b45309" : "#475569",
  };
}

export const SEM_EVENTO = "sem-evento";

export type EventoDaTriagem = {
  id: string;
  nome: string;
  data: string | null;
  pecas: number;
  unidades: number;
  desde: number;
  reservadas: number;
  saidaMaisProxima: number | null;
  patrocinadores: string[];
  thumbs: string[];
};

export function agruparPorEvento(ativos: EnrichedAsset[], reservaPorAtivo: Map<string, ReservaDaTriagem>): EventoDaTriagem[] {
  const porEvento = new Map<string, EventoDaTriagem & { _pats: Set<string> }>();
  for (const a of ativos) {
    const id = a.eventId ?? SEM_EVENTO;
    let e = porEvento.get(id);
    if (!e) {
      e = { id, nome: a.eventName ?? "Sem evento", data: a.eventDate ?? null, pecas: 0, unidades: 0, desde: Infinity, reservadas: 0, saidaMaisProxima: null, patrocinadores: [], thumbs: [], _pats: new Set() };
      porEvento.set(id, e);
    }
    e.pecas += 1;
    e.unidades += a.quantity ?? 1;
    const voltou = new Date((a as any).updatedAt ?? (a as any).createdAt ?? Date.now()).getTime();
    if (voltou < e.desde) e.desde = voltou;
    const r = reservaPorAtivo.get(a.id);
    if (r) {
      e.reservadas += 1;
      if (r.saida) {
        const s = new Date(r.saida).getTime();
        if (e.saidaMaisProxima === null || s < e.saidaMaisProxima) e.saidaMaisProxima = s;
      }
    }
    for (const s of a.sponsors ?? []) e._pats.add(s.name);
    if (a.approvalThumbUrl && e.thumbs.length < 4 && !e.thumbs.includes(a.approvalThumbUrl)) e.thumbs.push(a.approvalThumbUrl);
  }
  return Array.from(porEvento.values())
    .map(({ _pats, ...e }) => ({ ...e, patrocinadores: Array.from(_pats) }))
    .sort((x, y) => {
      if ((x.reservadas > 0) !== (y.reservadas > 0)) return x.reservadas > 0 ? -1 : 1;
      return ((x.saidaMaisProxima ?? Infinity) - (y.saidaMaisProxima ?? Infinity)) || (x.desde - y.desde);
    });
}

const ehImagem = (u: string) => /\.(png|jpe?g|gif|webp)/i.test(u) || u.startsWith("/objects/");

export function EventosDaTriagem({ ativos, reservaPorAtivo, isLoading, isError, onTentarDeNovo, onAbrir, onTabela }: {
  ativos: EnrichedAsset[];
  reservaPorAtivo: Map<string, ReservaDaTriagem>;
  isLoading: boolean;
  isError: boolean;
  onTentarDeNovo: () => void;
  onAbrir: (eventoId: string) => void;
  onTabela: () => void;
}) {
  const isMobile = useIsMobile();
  const eventos = useMemo(() => agruparPorEvento(ativos, reservaPorAtivo), [ativos, reservaPorAtivo]);
  const agora = Date.now();
  const totalPecas = ativos.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: isMobile ? 16 : 24 }}>
      <div style={{ display: "flex", alignItems: isMobile ? "flex-start" : "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 12 : 16, minWidth: 0 }}>
          <div style={{ width: isMobile ? 44 : 48, height: isMobile ? 44 : 48, borderRadius: 12, background: "#c2410c", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 12px rgba(194,65,12,0.22)", flexShrink: 0 }}>
            <ScanSearch size={22} color="#fff" strokeWidth={2.2} aria-hidden="true" />
          </div>
          <div style={{ minWidth: 0 }}>
            {/* Título no padrão da casa (FS.h1, 700): esta é a PRIMEIRA tela da
                triagem e estava em 28/900, diferente da tabela logo depois —
                entrar na tabela parecia trocar de produto. */}
            <h1 style={{ margin: "0 0 3px", fontSize: FS.h1, fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif", color: "#1c1917", letterSpacing: "-0.03em", lineHeight: 1.1 }}>
              Triagem de Retorno
            </h1>
            <p aria-live="polite" style={{ margin: 0, fontSize: 13, color: "#475569", lineHeight: 1.45 }}>
              {isLoading ? "Carregando…" : totalPecas === 0
                ? "Nada esperando triagem."
                : `${eventos.length} ${eventos.length === 1 ? "evento voltou" : "eventos voltaram"} · ${totalPecas} ${totalPecas === 1 ? "peça esperando" : "peças esperando"} — escolha um para começar`}
            </p>
            {/* O QUE É TRIAR, para quem abre a tela pela primeira vez: a
                palavra sozinha não dizia o que se decide nem que dá para
                rearrumar antes de gravar. */}
            {!isLoading && totalPecas > 0 && (
              <p data-testid="dica-o-que-e-triar" style={{ margin: "4px 0 0", fontSize: 12.5, color: "#64748b", lineHeight: 1.45 }}>
                Triar = decidir, peça por peça, se volta ao <strong style={{ color: "#1e40af" }}>Galpão</strong> (com o local), vai para <strong style={{ color: "#92400e" }}>Manutenção</strong> ou é <strong style={{ color: "#991b1b" }}>descartada</strong>. Nada é gravado até salvar.
              </p>
            )}
          </div>
        </div>
        {totalPecas > 0 && (
          <button type="button" onClick={onTabela} data-testid="button-triagem-tabela"
            style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, height: 44, padding: "0 14px", borderRadius: 10, border: "1px solid #e2e8f0", background: "#fff", color: "#334155", fontSize: 13, fontWeight: 700, cursor: "pointer", width: isMobile ? "100%" : undefined, transition: "background-color 0.12s, border-color 0.12s" }}
            onMouseEnter={(ev) => { ev.currentTarget.style.background = "#f8fafc"; ev.currentTarget.style.borderColor = "#cbd5e1"; }}
            onMouseLeave={(ev) => { ev.currentTarget.style.background = "#fff"; ev.currentTarget.style.borderColor = "#e2e8f0"; }}>
            <Table2 size={15} aria-hidden="true" /> Ver todas em tabela
          </button>
        )}
      </div>

      {isLoading ? (
        <div aria-busy="true" aria-label="Carregando os eventos da triagem" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 290px), 1fr))", gap: isMobile ? 12 : 16 }}>
          {[0, 1, 2].map((i) => <div key={i} className="animate-pulse" style={{ height: 210, borderRadius: 16, background: "#e2e8f0" }} />)}
        </div>
      ) : isError ? (
        <div role="alert" style={{ background: "#fff", borderRadius: 16, border: "1px solid #fecaca", padding: isMobile ? "32px 20px" : 40, textAlign: "center" }}>
          <p style={{ margin: "0 0 6px", fontSize: 15, fontWeight: 700, color: "#b91c1c", fontFamily: "Space Grotesk, sans-serif" }}>Não foi possível carregar a triagem</p>
          <p style={{ margin: "0 0 16px", fontSize: 13, color: "#475569" }}>Verifique sua conexão e tente novamente.</p>
          <button type="button" onClick={onTentarDeNovo} style={{ minHeight: 44, background: "#0f172a", color: "#fff", border: "none", borderRadius: 8, padding: "0 18px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Tentar novamente</button>
        </div>
      ) : eventos.length === 0 ? (
        <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0", padding: isMobile ? "40px 20px" : 56, textAlign: "center" }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: "#f0fdf4", border: "1px solid #bbf7d0", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
            <ScanSearch size={24} color="#15803d" aria-hidden="true" />
          </div>
          <p style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 700, color: "#0f172a", fontFamily: "Space Grotesk, sans-serif" }}>Nenhum material aguardando triagem</p>
          <p style={{ margin: 0, fontSize: 13, color: "#475569" }}>As peças entram aqui sozinhas no dia seguinte ao evento.</p>
        </div>
      ) : (
        <div data-testid="lista-eventos-triagem" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 290px), 1fr))", gap: isMobile ? 12 : 16 }}>
          {eventos.map((e) => {
            const espera = tempoDeEspera(e.desde, agora);
            return (
              <button
                key={e.id}
                type="button"
                data-testid={`evento-triagem-${e.id}`}
                onClick={() => onAbrir(e.id)}
                style={{ textAlign: "left", display: "flex", flexDirection: "column", gap: 12, padding: isMobile ? 16 : 18, borderRadius: 16, cursor: "pointer", background: "#fff", border: `1px solid ${e.reservadas ? "#bfdbfe" : "#e2e8f0"}`, borderTop: `3px solid ${e.reservadas ? "#1d4ed8" : "#c2410c"}`, boxShadow: "0 1px 3px rgba(0,0,0,0.05)", transition: "box-shadow 0.15s, transform 0.15s" }}
                onMouseEnter={(ev) => { ev.currentTarget.style.boxShadow = "0 8px 24px rgba(15,23,42,0.10)"; ev.currentTarget.style.transform = "translateY(-2px)"; }}
                onMouseLeave={(ev) => { ev.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.05)"; ev.currentTarget.style.transform = "none"; }}
              >
                {/* Miniaturas decorativas (aria-hidden): o leitor de tela lia o
                    "+N" solto antes do nome do evento. */}
                <div aria-hidden="true" style={{ display: "flex", gap: 6, minHeight: 48 }}>
                  {e.thumbs.length === 0 ? (
                    <div style={{ width: 48, height: 48, borderRadius: 10, background: "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center" }}><Package size={18} color="#94a3b8" /></div>
                  ) : e.thumbs.map((t) => (
                    <div key={t} style={{ width: 48, height: 48, borderRadius: 10, overflow: "hidden", background: "#f1f5f9", border: "1px solid #e2e8f0" }}>
                      {ehImagem(t) ? <img src={miniatura(t)} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}
                    </div>
                  ))}
                  {e.pecas > e.thumbs.length && e.thumbs.length > 0 && (
                    <div style={{ width: 48, height: 48, borderRadius: 10, background: "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: "#475569" }}>+{e.pecas - e.thumbs.length}</div>
                  )}
                </div>

                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 17, fontWeight: 800, color: "#0f172a", fontFamily: "Space Grotesk, sans-serif", lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.nome}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
                    {e.data && (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "#475569" }}>
                        <CalendarDays size={12} /> evento {diaEMes(e.data)}
                      </span>
                    )}
                    <span data-testid={`espera-evento-triagem-${e.id}`} style={{ fontSize: 12.5, fontWeight: espera.dias > 7 ? 800 : 600, color: espera.cor }}>{espera.texto}</span>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                  <span style={{ fontSize: 30, fontWeight: 900, color: "#0f172a", fontFamily: "Space Grotesk, sans-serif", lineHeight: 1 }}>{e.pecas}</span>
                  <span style={{ fontSize: 13, color: "#475569", fontWeight: 600 }}>
                    {e.pecas === 1 ? "peça" : "peças"}{e.unidades !== e.pecas ? ` · ${e.unidades} un.` : ""}
                  </span>
                </div>

                {e.reservadas > 0 && (
                  <span style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 800, color: "#1d4ed8", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 999, padding: "3px 10px" }}>
                    <BookmarkCheck size={12} /> {e.reservadas} {e.reservadas === 1 ? "reservada" : "reservadas"}{e.saidaMaisProxima ? ` · saída ${diaEMes(new Date(e.saidaMaisProxima).toISOString())}` : ""}
                  </span>
                )}

                {e.patrocinadores.length > 0 && (
                  <div style={{ fontSize: 12, color: "#475569", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {e.patrocinadores.slice(0, 3).join(" · ")}{e.patrocinadores.length > 3 ? ` +${e.patrocinadores.length - 3}` : ""}
                  </div>
                )}

                <span style={{ marginTop: "auto", display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 800, color: "#c2410c" }}>
                  Começar triagem <ArrowRight size={14} />
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
