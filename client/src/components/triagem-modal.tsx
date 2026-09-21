import { useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  X, Trash2, Warehouse, Package2,
  Tag, Calendar, Layers, CheckCircle2,
  Archive, Truck, ClipboardCheck, Image, Wrench,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useIsMobile } from "@/hooks/use-mobile";
import { HIDE_NATIVE_CLOSE, modalSurface } from "@/components/modal-shell";
import { CONDITIONS, CONDITION_META, type Condition, type EnrichedAsset } from "@/lib/inventory-meta";

// ─── Types ────────────────────────────────────────────────────────────────────
type TriagemResult = "NO_GALPAO" | "MANUTENCAO" | "DESCARTADO";

interface SplitLine { qty: number; condition: Condition | null; result: TriagemResult; }
interface TriagemEntry { splits: SplitLine[]; notes: string; selected: boolean; mode: "all" | "split"; }

interface TriagemModalProps {
  asset: EnrichedAsset | null;
  linkedItem?: any | null;
  entry: TriagemEntry | null;
  open: boolean;
  isSaving: boolean;
  isSaved: boolean;
  user: any;
  onOpenChange: (open: boolean) => void;
  onUpdateCondition: (c: Condition) => void;
  onUpdateResult: (r: TriagemResult) => void;
  onUpdateNotes: (notes: string) => void;
  /** Onde a peça foi guardada — obrigatório quando volta ao galpão (14/09). */
  /** Devolve `false` quando a gravação NÃO aconteceu (validação ou erro) —
   *  aí o modal fica aberto, com o toast explicando o que falta. */
  onSaveAndClose: () => Promise<boolean | void>;
}

const RESULT_META: Record<TriagemResult, {
  label: string; subLabel: string; color: string; bg: string; border: string; Icon: React.ElementType;
}> = {
  NO_GALPAO:  { label: "Galpão", subLabel: "Retorna ao estoque",                            color: "#1e40af", bg: "#eff6ff", border: "#93c5fd", Icon: Warehouse },
  MANUTENCAO: { label: "Manutenção",     subLabel: "Fica fora do estoque até o reparo terminar",    color: "#92400e", bg: "#fffbeb", border: "#fcd34d", Icon: Wrench    },
  DESCARTADO: { label: "Descartar",      subLabel: "Remover do inventário",                         color: "#991b1b", bg: "#fef2f2", border: "#fca5a5", Icon: Trash2    },
};

// Rótulo de grupo/campo do painel. Era 9px em CAIXA ALTA com 0.14em — o
// menor texto do modal justamente no que diz o que preencher.
const ROTULO: React.CSSProperties = {
  display: "block", fontFamily: "Space Grotesk, sans-serif",
  fontWeight: 600, fontSize: 12, color: "#57534e", marginBottom: 10,
};

export function TriagemModal({
  asset, linkedItem, entry, open, isSaving, isSaved, user,
  onOpenChange, onUpdateCondition, onUpdateResult, onUpdateNotes, onSaveAndClose,
}: TriagemModalProps) {
  // Hooks SEMPRE antes do guard — chamá-los depois de um return condicional
  // viola as regras de hooks quando asset/entry alternam entre null e valor.
  const isMobile = useIsMobile();
  const [thumbImgFailed, setThumbImgFailed] = useState(false);
  // O mapa do galpão já existia na linha da tabela e no quadro; no modal só
  // havia o campo de texto — quem abria a peça para triar com calma tinha de
  // adivinhar o formato "Setor A - Corredor 3".

  if (!asset || !entry) return null;

  // `?? "PERFEITO"` cobre null/undefined — daqui em diante nunca é null.
  const condition: Condition = entry.splits[0]?.condition ?? "PERFEITO";
  const result    = entry.splits[0]?.result    ?? "NO_GALPAO";
  const notes     = entry.notes;
  const qty       = asset.quantity ?? 1;

  const thumbUrl = asset.approvalThumbUrl;
  const isImg    = thumbUrl && (
    /\.(png|jpg|jpeg|gif|webp)/i.test(thumbUrl) ||
    thumbUrl.startsWith('/objects/')
  );

  // Fechava SEMPRE — inclusive quando o salvar recusava por falta de local:
  // o toast "Informe o local no galpão" aparecia com o modal já sumindo, e a
  // pessoa perdia exatamente o campo que precisava preencher.
  async function handleSave() {
    const ok = await onSaveAndClose();
    if (ok !== false) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={`p-0 gap-0 border-0 ${HIDE_NATIVE_CLOSE}`}
        style={{
          // Casca da casa (teto em dvh: a barra recolhível do navegador do
          // celular cobria o Salvar com o 90vh de antes; e `maxWidth: 1040`
          // sem min() encostava nas bordas de um tablet).
          ...modalSurface(1040),
          // Mobile empilha sidebar e conteúdo (padrão do AssetDetailModal).
          flexDirection: isMobile ? "column" : "row",
          overflow: isMobile ? "auto" : "hidden",
        }}
      >
        <DialogTitle className="sr-only">{`Triagem de ${asset.displayId} — ${asset.name}`}</DialogTitle>
        <DialogDescription className="sr-only">
          Classifique a condição e o destino do material retornado do evento.
        </DialogDescription>

        {/* ══════════════════════════════════════════
            LEFT SIDEBAR — Dark
        ══════════════════════════════════════════ */}
        {/* No celular a linha do tempo vai para DEPOIS (order): antes ela
            vinha primeiro e a Classificação Obrigatória — o motivo de abrir o
            modal — só aparecia depois de uma tela inteira de rolagem. */}
        <aside style={{
          width: isMobile ? "100%" : 264, flexShrink: 0, background: "#111827",
          display: "flex", flexDirection: "column",
          order: isMobile ? 2 : 0,
          paddingBottom: isMobile ? 16 : 0,
          overflowY: isMobile ? "visible" : "auto",
        }}>
          {/* Logo — só no desktop; no celular é uma faixa sem informação. */}
          {!isMobile && (
            <div style={{ padding: "24px 24px 20px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
              <div style={{
                fontFamily: "Space Grotesk, sans-serif", fontWeight: 900,
                fontSize: 22, color: "#f9f9f8", letterSpacing: "-0.05em", lineHeight: 1,
              }}>
                NORTE
              </div>
            </div>
          )}

          {/* Rastreabilidade */}
          <div style={{ padding: isMobile ? "20px 16px 0" : "24px 24px 0", flex: 1 }}>
            {/* Cinzas da barra escura em #9ca3af: o #6b7280 dava 3,7:1 sobre
                #111827 em texto de 9–10px (reprova AA). */}
            <div style={{
              fontFamily: "Space Grotesk, sans-serif", fontWeight: 700,
              fontSize: 10, color: "#9ca3af", textTransform: "uppercase",
              letterSpacing: "0.08em", marginBottom: 20,
            }}>
              Rastreabilidade
            </div>

            {/* Timeline */}
            <div style={{ position: "relative", paddingLeft: 32 }}>
              {/* Vertical pipe */}
              <div style={{
                position: "absolute", left: 11, top: 12, bottom: 24,
                width: 1, background: "rgba(255,255,255,0.08)",
              }} />

              {/* Step 1 — Produção / Origem */}
              <div style={{ position: "relative", marginBottom: 28 }}>
                <div style={{
                  position: "absolute", left: -21, top: 2,
                  width: 22, height: 22, borderRadius: "50%",
                  background: "#f97316",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <Package2 size={11} color="#fff" />
                </div>
                <div style={{ paddingTop: 3, paddingLeft: 8 }}>
                  <div style={{ fontFamily: "Plus Jakarta Sans, sans-serif", fontWeight: 600, fontSize: 12, color: "#e5e7eb" }}>
                    {linkedItem?.type ? `Produção · ${linkedItem.type}` : "Produção Gráfica"}
                  </div>
                  <div style={{ fontFamily: "DM Mono, monospace", fontSize: 10, color: "#9ca3af", marginTop: 3, letterSpacing: "0.02em" }}>
                    Auto-cadastrado · {asset.autoAdded ? "Gráfica" : "Manual"}
                  </div>
                </div>
              </div>

              {/* Step 2 — Saída do Estoque */}
              <div style={{ position: "relative", marginBottom: 28 }}>
                <div style={{
                  position: "absolute", left: -21, top: 2,
                  width: 22, height: 22, borderRadius: "50%",
                  background: "#f97316",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <Archive size={11} color="#fff" />
                </div>
                <div style={{ paddingTop: 3, paddingLeft: 8 }}>
                  <div style={{ fontFamily: "Plus Jakarta Sans, sans-serif", fontWeight: 600, fontSize: 12, color: "#e5e7eb" }}>
                    Saída do Estoque
                  </div>
                  <div style={{ fontFamily: "DM Mono, monospace", fontSize: 10, color: "#9ca3af", marginTop: 3, letterSpacing: "0.02em" }}>
                    {asset.eventDate
                      ? format(new Date(asset.eventDate), "dd MMM yyyy · HH:mm", { locale: ptBR })
                      : "Data não registrada"}
                  </div>
                </div>
              </div>

              {/* Step 3 — Em Uso no Evento */}
              <div style={{ position: "relative", marginBottom: 28 }}>
                <div style={{
                  position: "absolute", left: -21, top: 2,
                  width: 22, height: 22, borderRadius: "50%",
                  background: "#f97316",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <Truck size={11} color="#fff" />
                </div>
                <div style={{ paddingTop: 3, paddingLeft: 8 }}>
                  <div style={{ fontFamily: "Plus Jakarta Sans, sans-serif", fontWeight: 600, fontSize: 12, color: "#e5e7eb" }}>
                    {asset.eventName || "Em Uso no Evento"}
                  </div>
                  <div style={{ fontFamily: "DM Mono, monospace", fontSize: 10, color: "#9ca3af", marginTop: 3, letterSpacing: "0.02em" }}>
                    {asset.eventDate ? format(new Date(asset.eventDate), "dd MMM yyyy", { locale: ptBR }) : "—"} · Concluído
                  </div>
                </div>
              </div>

              {/* Step 4 — Aguardando Triagem (active) */}
              <div style={{ position: "relative", marginBottom: 28 }}>
                <div style={{
                  position: "absolute", left: -21, top: 2,
                  width: 22, height: 22, borderRadius: "50%",
                  background: "rgba(249,115,22,0.15)", border: "1.5px solid #f97316",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  boxShadow: "0 0 0 4px rgba(249,115,22,0.08)",
                }}>
                  <ClipboardCheck size={11} color="#f97316" />
                </div>
                <div style={{ paddingTop: 3, paddingLeft: 8 }}>
                  {/* #c2410c sobre branco = 5,18:1 ✓ (#f97316 = 2,94:1). */}
                  <div style={{ fontFamily: "Plus Jakarta Sans, sans-serif", fontWeight: 700, fontSize: 12, color: "#c2410c" }}>
                    Aguardando Triagem
                  </div>
                  <div style={{ fontFamily: "DM Mono, monospace", fontSize: 10, color: "#9ca3af", marginTop: 3, letterSpacing: "0.02em" }}>
                    Agora · Em análise
                  </div>
                </div>
              </div>

              {/* Step 5 — Destino Final (pending) */}
              <div style={{ position: "relative" }}>
                <div style={{
                  position: "absolute", left: -21, top: 2,
                  width: 22, height: 22, borderRadius: "50%",
                  background: "#1f2937", border: "1px solid #374151",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <Warehouse size={11} color="#6b7280" />
                </div>
                <div style={{ paddingTop: 3, paddingLeft: 8 }}>
                  <div style={{ fontFamily: "Plus Jakarta Sans, sans-serif", fontWeight: 600, fontSize: 12, color: "#9ca3af" }}>
                    Destino Final
                  </div>
                  <div style={{ fontFamily: "DM Mono, monospace", fontSize: 10, color: "#9ca3af", marginTop: 3, letterSpacing: "0.02em" }}>
                    Aguardando decisão
                  </div>
                </div>
              </div>
            </div>

            {/* Patrocinadores */}
            {asset.sponsors && asset.sponsors.length > 0 && (
              <div style={{ marginTop: 32, paddingTop: 24, borderTop: "1px solid rgba(255,255,255,0.07)" }}>
                <div style={{
                  fontFamily: "Space Grotesk, sans-serif", fontWeight: 700,
                  fontSize: 10, color: "#9ca3af", textTransform: "uppercase",
                  letterSpacing: "0.08em", marginBottom: 12,
                }}>
                  Patrocinadores
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {asset.sponsors.map(s => (
                    <div key={s.id} style={{
                      display: "inline-flex", alignItems: "center", gap: 4,
                      padding: "4px 8px", background: "#1f2937",
                      borderRadius: 4, border: "1px solid rgba(255,255,255,0.07)",
                    }}>
                      <Tag size={8} color="#6b7280" />
                      <span style={{
                        fontFamily: "Space Grotesk, sans-serif", fontWeight: 700,
                        fontSize: 11, color: "#d1d5db",
                        letterSpacing: "0.06em",
                      }}>
                        {s.name}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

        </aside>

        {/* ══════════════════════════════════════════
            RIGHT MAIN AREA
        ══════════════════════════════════════════ */}
        <div style={{
          flex: 1, display: "flex", flexDirection: "column",
          minWidth: 0, minHeight: 0,
          maxHeight: isMobile ? undefined : "calc(100vh - 48px)",
          overflow: isMobile ? "visible" : "hidden",
          order: isMobile ? 1 : 0,
        }}>
          {/* ── Sticky Header ── */}
          <header style={{
            background: "#030712", padding: isMobile ? "14px 12px 14px 16px" : "20px 28px",
            display: "flex", alignItems: "flex-start", justifyContent: "space-between",
            flexShrink: 0, position: "sticky", top: 0, zIndex: 10,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
                <span style={{
                  background: "#f97316", color: "#0c0a09",
                  fontFamily: "DM Mono, monospace", fontWeight: 700,
                  fontSize: 11,
                  padding: "2px 8px", borderRadius: 4,
                }}>
                  {asset.displayId}
                </span>
                <span style={{
                  fontFamily: "DM Mono, monospace", fontSize: 11, color: "#9ca3af",
                }}>
                  Qtd: {qty} un.
                </span>
              </div>
              {/* No celular o nome quebra linha em vez de cortar: é a única
                  confirmação de QUAL peça está sendo triada. */}
              <h1 style={{
                margin: 0, color: "#f9fafb",
                fontFamily: "Space Grotesk, sans-serif", fontWeight: 700,
                fontSize: isMobile ? 20 : 26, letterSpacing: "-0.03em", lineHeight: 1.15,
                ...(isMobile
                  ? { overflowWrap: "anywhere" as const }
                  : { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, maxWidth: "calc(100% - 20px)" }),
              }}>
                {asset.name}
              </h1>
            </div>
            {/* rgba .72: o .45 anterior dava ~3:1 no ícone de fechar. */}
            <button
              onClick={() => onOpenChange(false)}
              aria-label="Fechar triagem"
              style={{
                marginLeft: 12, flexShrink: 0,
                background: "rgba(255,255,255,0.08)", border: "none",
                cursor: "pointer", color: "rgba(255,255,255,0.72)",
                width: isMobile ? 44 : 40, height: isMobile ? 44 : 40, borderRadius: 8,
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "color 0.15s, background 0.15s",
              }}
              onMouseEnter={e => { e.currentTarget.style.color = "#fff"; e.currentTarget.style.background = "rgba(255,255,255,0.14)"; }}
              onMouseLeave={e => { e.currentTarget.style.color = "rgba(255,255,255,0.72)"; e.currentTarget.style.background = "rgba(255,255,255,0.08)"; }}
            >
              <X size={20} />
            </button>
          </header>

          {/* ── Scrollable Body ── */}
          <div style={{
            flex: "1 1 auto", minHeight: 0, overflowY: isMobile ? "visible" : "auto", background: "#f9f9f8",
            display: "flex", flexDirection: "column", gap: isMobile ? 20 : 28,
            padding: isMobile ? "24px 16px 0" : "28px 28px 0 28px",
          }}>

            {/* ── Painel de Classificação Obrigatória ── */}
            <section style={{ position: "relative" }}>
              {/* Floating label */}
              <div aria-hidden="true" style={{
                position: "absolute", top: -10, left: isMobile ? 14 : 20, zIndex: 2,
                background: "#9d4300", color: "#fff",
                fontFamily: "Space Grotesk, sans-serif", fontWeight: 700,
                fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em",
                padding: "3px 10px", borderRadius: 4,
              }}>
                Classificação Obrigatória
              </div>
              <div style={{
                background: "#fff", border: "2px solid #9d4300",
                borderRadius: 10, padding: isMobile ? "24px 14px 16px" : "28px 24px 24px",
                boxShadow: "0 4px 24px rgba(157,67,0,0.08)",
              }}>
                {/* Uma coluna no celular: lado a lado, os três botões de cada
                    grupo ficavam com ~50px e o rótulo quebrava letra a letra. */}
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: isMobile ? 20 : 24 }}>

                  {/* Condição — rótulo como título do grupo (role="group" +
                      aria-labelledby): era um <label> sem campo associado, e o
                      leitor de tela anunciava três botões soltos. */}
                  <div role="group" aria-labelledby="triagem-rotulo-condicao">
                    <div id="triagem-rotulo-condicao" style={ROTULO}>
                      Condição do item
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      {CONDITIONS.map(c => {
                        const m = CONDITION_META[c];
                        const active = condition === c;
                        return (
                          <button
                            key={c}
                            onClick={() => onUpdateCondition(c)}
                            aria-pressed={active}
                            style={{
                              flex: 1, minWidth: 0, display: "flex", flexDirection: "column",
                              alignItems: "center", justifyContent: "center", gap: 6,
                              minHeight: 64, padding: "10px 6px", borderRadius: 8,
                              border: active ? `2px solid ${m.border}` : "1.5px solid #e2e8f0",
                              background: active ? m.activeBg : "#f8fafc",
                              cursor: "pointer", transition: "background-color 0.15s, border-color 0.15s",
                            }}
                          >
                            <m.Icon size={18} color={active ? m.color : "#64748b"} aria-hidden="true" />
                            <span style={{
                              fontFamily: "Space Grotesk, sans-serif", fontWeight: 700,
                              fontSize: 12, color: active ? m.color : "#475569", textAlign: "center",
                            }}>
                              {m.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    {/* Escolher a condição TROCA o destino ao lado (a sugestão
                        do onUpdateCondition). Sem esta frase, parecia que o
                        segundo grupo tinha mudado sozinho, por erro. */}
                    <p style={{ margin: "8px 0 0", fontSize: 12, color: "#64748b", lineHeight: 1.4 }}>
                      A condição sugere o destino {isMobile ? "abaixo" : "ao lado"} — troque se precisar.
                    </p>
                  </div>

                  {/* Destino — no celular ícone em cima do rótulo (como a
                      Condição): lado a lado, o rótulo do destino não cabia em
                      ~95px e o texto vazava do botão. */}
                  <div role="group" aria-labelledby="triagem-rotulo-destino">
                    <div id="triagem-rotulo-destino" style={ROTULO}>
                      Destino do fluxo
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      {(["NO_GALPAO", "MANUTENCAO", "DESCARTADO"] as TriagemResult[]).map(r => {
                        const m = RESULT_META[r];
                        const active = result === r;
                        return (
                          <button
                            key={r}
                            onClick={() => onUpdateResult(r)}
                            title={m.subLabel}
                            aria-pressed={active}
                            style={{
                              flex: 1, minWidth: 0, display: "flex", alignItems: "center",
                              flexDirection: isMobile ? "column" : "row",
                              justifyContent: "center", gap: isMobile ? 6 : 8,
                              minHeight: isMobile ? 64 : 48, padding: isMobile ? "10px 6px" : "10px 10px",
                              borderRadius: 8,
                              border: active ? `2px solid ${m.border}` : "1.5px solid #e2e8f0",
                              background: active ? m.bg : "#f8fafc",
                              cursor: "pointer", transition: "background-color 0.15s, border-color 0.15s",
                            }}
                          >
                            <m.Icon size={16} color={active ? m.color : "#64748b"} aria-hidden="true" />
                            <span style={{
                              fontFamily: "Space Grotesk, sans-serif", fontWeight: 700,
                              fontSize: 12, color: active ? m.color : "#475569", textAlign: "center",
                            }}>
                              {m.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    {/* O que o destino escolhido FAZ — antes só no title
                        (hover), que não existe no toque. */}
                    <p style={{ margin: "8px 0 0", fontSize: 12, color: "#64748b", lineHeight: 1.4 }}>
                      {RESULT_META[result].subLabel}.
                    </p>
                  </div>

                  {/* Observação */}
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label htmlFor="triagem-observacao" style={{ ...ROTULO, marginBottom: 8 }}>
                      Observação da triagem
                    </label>
                    {/* Borda de foco em #c2410c: o #f97316 dava 2,8:1 contra o
                        branco — abaixo dos 3:1 de componente de interface. */}
                    <textarea
                      id="triagem-observacao"
                      value={notes}
                      onChange={e => onUpdateNotes(e.target.value)}
                      placeholder="Ex: Riscos superficiais na base, necessita polimento..."
                      style={{
                        width: "100%", boxSizing: "border-box",
                        padding: "12px 14px", borderRadius: 8,
                        border: "1.5px solid #e2e8f0", background: "#f8fafc",
                        fontFamily: "Plus Jakarta Sans, sans-serif", fontSize: isMobile ? 16 : 13,
                        color: "#1e293b", resize: "vertical", minHeight: 72,
                        lineHeight: 1.5, transition: "border-color 0.15s, background-color 0.15s",
                      }}
                      onFocus={e => { e.currentTarget.style.borderColor = "#c2410c"; e.currentTarget.style.background = "#fff"; }}
                      onBlur={e => { e.currentTarget.style.borderColor = "#e2e8f0"; e.currentTarget.style.background = "#f8fafc"; }}
                    />
                  </div>
                </div>

                {/* Save row */}
                <div style={{
                  marginTop: 20, paddingTop: 20,
                  borderTop: "1px solid #f1f5f9",
                  display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 12, flexWrap: "wrap",
                }}>
                  {isSaved && (
                    <div role="status" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <CheckCircle2 size={15} color="#15803d" aria-hidden="true" />
                      <span style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, fontSize: 13, color: "#15803d" }}>
                        Triagem salva
                      </span>
                    </div>
                  )}
                  <button
                    onClick={handleSave}
                    disabled={isSaving || isSaved}
                    data-testid="button-triage-modal-save"
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                      padding: "0 28px", borderRadius: 8, border: "none",
                      minHeight: 44, width: isMobile ? "100%" : undefined,
                      background: isSaved ? "#f1f5f9" : "#9d4300",
                      color: isSaved ? "#64748b" : "#fff",
                      fontFamily: "Space Grotesk, sans-serif", fontWeight: 700,
                      fontSize: 14,
                      cursor: isSaved ? "default" : "pointer",
                      boxShadow: isSaved ? "none" : "0 4px 14px rgba(157,67,0,0.24)",
                      transition: "background-color 0.15s, box-shadow 0.15s, opacity 0.15s",
                      opacity: isSaving ? 0.6 : 1,
                    }}
                  >
                    {isSaving ? "Salvando..." : isSaved ? "Salvo" : "Salvar e fechar"}
                  </button>
                </div>
              </div>
            </section>

            {/* ── Read-only grid (Evento + Specs) ── */}
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>

              {/* Evento e Datas */}
              <div style={{ background: "#f3f4f3", borderRadius: 10, padding: "20px 22px" }}>
                <h3 style={{
                  margin: "0 0 16px", display: "flex", alignItems: "center", gap: 8,
                  fontFamily: "Space Grotesk, sans-serif", fontWeight: 700,
                  fontSize: 13, color: "#374151",
                }}>
                  <Calendar size={15} color="#6b7280" />
                  Informações do Evento
                </h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {[
                    { label: "Evento",    value: asset.eventName || "—" },
                    { label: "Data",      value: asset.eventDate ? format(new Date(asset.eventDate), "dd MMM yyyy", { locale: ptBR }) : "—" },
                    { label: "Qtd Total", value: `${qty} un.` },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                      <span style={{ fontFamily: "Plus Jakarta Sans, sans-serif", fontSize: 11, color: "#746e69" }}>{label}</span>
                      <span style={{ fontFamily: "Plus Jakarta Sans, sans-serif", fontWeight: 700, fontSize: 11, color: "#1f2937", textAlign: "right" }}>{value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Especificações Técnicas */}
              <div style={{ background: "#111827", borderRadius: 10, padding: "20px 22px" }}>
                <h3 style={{
                  margin: "0 0 16px", display: "flex", alignItems: "center", gap: 8,
                  fontFamily: "Space Grotesk, sans-serif", fontWeight: 700,
                  fontSize: 13, color: "#f9fafb",
                }}>
                  <Layers size={15} color="#f97316" />
                  Especificações Técnicas
                </h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                  {[
                    { label: "TIPO",        value: linkedItem?.type || "—" },
                    { label: "MATERIAL",    value: linkedItem?.material || "—" },
                    { label: "ACABAMENTO",  value: linkedItem?.finish || "—" },
                    { label: "MEDIDA",      value: linkedItem?.measurement || "—" },
                    {
                      label: "DIMENSÕES",
                      value: linkedItem?.visualWidth && linkedItem?.visualHeight
                        ? `${linkedItem.visualWidth} × ${linkedItem.visualHeight} m`
                        : "—",
                    },
                    {
                      label: "M² TOTAL",
                      value: linkedItem?.calculatedM2 ? `${linkedItem.calculatedM2} m²` : "—",
                    },
                    { label: "QUANTIDADE",    value: linkedItem?.quantity ? `${linkedItem.quantity} un.` : `${asset.quantity ?? 1} un.` },
                    { label: "PATROCINADORES", value: (asset.sponsors ?? []).length > 0 ? (asset.sponsors ?? []).map(s => s.name).join(", ") : "—" },
                  ].map(({ label, value }, i, arr) => (
                    <div key={label} style={{
                      display: "flex", justifyContent: "space-between", alignItems: "flex-start",
                      gap: 8, padding: "9px 0",
                      borderBottom: i < arr.length - 1 ? "1px solid rgba(255,255,255,0.06)" : "none",
                    }}>
                      <span style={{ fontFamily: "DM Mono, monospace", fontSize: 10, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.06em", flexShrink: 0 }}>{label}</span>
                      <span style={{ fontFamily: "DM Mono, monospace", fontWeight: 500, fontSize: 10, color: "#e5e7eb", textAlign: "right" }}>{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ── Imagem de Referência (approval thumb) ── */}
            {thumbUrl && (
              <div style={{ position: "relative", borderRadius: 10, overflow: "hidden", aspectRatio: "21/9" }}>
                {isImg && !thumbImgFailed ? (
                  <img
                    src={thumbUrl}
                    alt=""
                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                    onError={() => setThumbImgFailed(true)}
                  />
                ) : (
                  <div style={{ width: "100%", height: "100%", background: "#1f2937", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Package2 size={48} color="#374151" />
                  </div>
                )}
                <div style={{
                  position: "absolute", inset: 0,
                  background: "linear-gradient(to top, rgba(3,7,18,0.8) 0%, transparent 60%)",
                  display: "flex", alignItems: "flex-end", flexWrap: "wrap", gap: 10,
                  padding: isMobile ? "12px 14px" : "20px 24px",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: "50%",
                      background: "rgba(3,7,18,0.7)", border: "2px solid #f97316",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <Image size={16} color="#f97316" />
                    </div>
                    <div>
                      <div style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, fontSize: 12, color: "#f9fafb" }}>
                        Foto de Referência para Triagem
                      </div>
                      <div style={{ fontFamily: "DM Mono, monospace", fontSize: 10, color: "#d1d5db", marginTop: 2 }}>
                        Arte aprovada · Montagem original
                      </div>
                    </div>
                  </div>
                  <a
                    href={thumbUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      marginLeft: "auto",
                      display: "inline-flex", alignItems: "center", minHeight: isMobile ? 44 : 32,
                      fontFamily: "Space Grotesk, sans-serif", fontWeight: 700,
                      // O link fica no pé da imagem, sobre o degradê ESCURO — o
                      // #c2410c de antes dava ~3:1 ali (a conta de 4,58 era
                      // contra branco). #fdba74 (laranja 300) passa de 8:1.
                      fontSize: 12, color: "#fdba74", textDecoration: "none",
                      background: "rgba(3,7,18,0.55)", border: "1px solid rgba(253,186,116,0.45)",
                      padding: "0 12px", borderRadius: 6,
                    }}
                  >
                    Abrir original ↗
                  </a>
                </div>
              </div>
            )}

            {/* spacer so footer doesn't clip last section */}
            <div style={{ height: 8 }} />
          </div>

          {/* ── Footer ── No celular some: o ID já está no selo do cabeçalho
              e, com a linha do tempo DEPOIS do conteúdo, o Fechar ficaria no
              meio da rolagem (o X do cabeçalho fixo cobre o fechar). */}
          {!isMobile && <footer style={{
            flexShrink: 0,
            background: "#f3f4f3", borderTop: "1px solid #e2e8f0",
            padding: "12px 28px",
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
              {user && (
                <div style={{ lineHeight: 1.3 }}>
                  <div style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, fontSize: 10, color: "#746e69", textTransform: "uppercase", letterSpacing: "0.06em" }}>Operador Atual</div>
                  <div style={{ fontFamily: "Plus Jakarta Sans, sans-serif", fontSize: 12, color: "#374151", fontWeight: 600, marginTop: 1 }}>{user.name || user.username}</div>
                </div>
              )}
              <div style={{ lineHeight: 1.3, borderLeft: "1px solid #d1d5db", paddingLeft: 24 }}>
                <div style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, fontSize: 10, color: "#746e69", textTransform: "uppercase", letterSpacing: "0.06em" }}>ID do Item</div>
                <div style={{ fontFamily: "DM Mono, monospace", fontSize: 12, color: "#374151", fontWeight: 500, marginTop: 1 }}>{asset.displayId}</div>
              </div>
            </div>
            <button
              onClick={() => onOpenChange(false)}
              style={{
                minHeight: 40, padding: "0 16px", borderRadius: 8,
                background: "none", border: "none", cursor: "pointer",
                fontFamily: "Space Grotesk, sans-serif", fontWeight: 700,
                fontSize: 13, color: "#57534e", transition: "color 0.15s, background-color 0.15s",
              }}
              onMouseEnter={e => { e.currentTarget.style.color = "#111827"; e.currentTarget.style.background = "#e7e5e4"; }}
              onMouseLeave={e => { e.currentTarget.style.color = "#57534e"; e.currentTarget.style.background = "none"; }}
            >
              {/* "Cancelar Operação" prometia desfazer — mas o que foi marcado
                  aqui continua na linha da tabela (nada é descartado). */}
              Fechar
            </button>
          </footer>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
