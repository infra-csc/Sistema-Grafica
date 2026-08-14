import { useQuery, useMutation } from "@tanstack/react-query";
import { FilterSelect } from "@/components/filter-select";
import { AlertCircle, Package, CheckCircle, Truck, Calendar, Eye, Check, Camera, Search, Play, X, Filter, ChevronDown, Printer, RotateCcw, ImagePlus, FileSpreadsheet, ListChecks, PlusCircle, Trash2 } from "lucide-react";
import { Fragment, useState, useMemo, useEffect, useRef } from "react";
import { EventFilterDropdown } from "@/components/event-filter-dropdown";
import { parseDateLocal } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiRequest, queryClient, getCurrentUserName } from "@/lib/queryClient";
import { convertGCSUrlToLocalPath } from "@/lib/artePdfExport";
import { useToast } from "@/hooks/use-toast";
import { ObjectUploader } from "@/components/ObjectUploader";
import { ItemDetailsDialog } from "@/components/item-details-dialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { getStatusMeta, getStatusLabel, getPriorityMeta } from "@/lib/status";
import { StatusPill } from "@/components/status-pill";
import { useAuth } from "@/contexts/auth-context";
import { ModalHeader, modalSurface, HIDE_NATIVE_CLOSE } from "@/components/modal-shell";
// Aritmética de saldo: fonte única em lib/saldo.ts. Estes onze cálculos
// (quanto falta produzir, conferir, entregar, reaproveitar; quanto de m²
// realmente vai para a impressora) viviam duplicados como consts locais no
// topo deste arquivo e eram refeitos "na mão" na ficha da peça e nos modais —
// toda vez que uma regra mudou, uma das cópias ficou para trás. Aqui a lista,
// os modais e a ficha leem os MESMOS números.
import {
  isDelivered, isConferred, isProduced, isInProd,
  qtyOf, producedOf, conferredOf, deliveredOf, reusedOf, reusedTotalOf,
  m2ToProduce, remainingProduce, remainingConfer, remainingDeliver, remainingReuse,
  canConfer, canDeliver,
  isComplement, complementsQtyOf, contractedTotalOf,
} from "@/lib/saldo";
// Leitura/ordenação do código da peça: fonte única em lib/displayId.ts, o mesmo
// módulo que Painel Geral, Arte e Vincular usam (e espelho de server/storage.ts).
// "#0062-C1" tem de ordenar COLADO em "#0062" — com o replace(/\D/g,'') antigo
// virava 621 e o complemento aparecia centenas de linhas longe da mãe.
import { compareDisplayId, splitDisplayId } from "@/lib/displayId";
// AUMENTAR QUANTIDADE nasce AQUI. Esta é a tela onde as peças em produção
// vivem e onde o aumento precisa ser visto — o Detalhe do Evento ficou só com
// a REDUÇÃO (campo Qtd. com piso físico) e aponta para cá. O gate é
// `podeMexerNaQuantidade` (admin | solicitacao), NUNCA `canProduce`: o operador
// da Gráfica vê a peça, o selo, o motivo e o botão Produzir — e não vê Aumentar.
import {
  AumentarQuantidadeDialog,
  ComplementoDaFicha,
  temBlocoDeComplemento,
  podeAumentarQuantidade,
  podeMexerNaQuantidade,
} from "@/components/aumentar-quantidade-dialog";

const TI = {
  bg: "#fafaf9",
  surface: "#ffffff",
  text: "#1c1917",
  accent: "#f97316",
  border: "#e7e5e4",
  muted: "#a8a29e",
  secondary: "#78716c",
};

// Número de colunas da tabela desktop. Estava escrito "10" em quatro lugares
// (cabeçalho de grupo, de evento, de tipo e linha de observação); qualquer
// coluna nova quebrava o alinhamento em silêncio numa delas.
const COLS = 10;

// ─────────────────────────────────────────────────────────────────────────────
// COMPLEMENTO — aumento de quantidade DEPOIS que a peça entrou em produção.
//
// A peça original nunca muda: a diferença nasce como peça-filha (#0062-C1),
// com quantidade, ciclo de produção, conferência, entrega e ativos próprios.
// Nesta tela isso precisa gritar — é trabalho NOVO numa fila que o operador já
// tinha dado por fechada, e o número da linha já é exatamente o que falta
// imprimir (a Gráfica não faz conta).
//
// Tokens da família laranja de lib/status.ts (P.orange), nada inventado.
// Regra da casa respeitada: #f97316 entra só como faixa/bolinha (fundo), nunca
// como cor de TEXTO; #c2410c aparece como texto sobre tint claro (4.96:1) e
// como fundo sólido com texto branco (5.18:1 — AA em 10px/800).
// ─────────────────────────────────────────────────────────────────────────────
const CO = {
  solidBg: "#c2410c", solidText: "#ffffff",
  bg: "#fff7ed", hoverBg: "#ffedd5", border: "#fed7aa",
  text: "#c2410c",        // 4.96:1 sobre #fff7ed — AA
  textStrong: "#7c2d12",  // 8.97:1 sobre #fff7ed — AAA
  stripe: "#f97316",      // SÓ fundo/faixa
  suffix: "#9a3412",      // o "-C1" dentro do displayId
  connector: "#fdba74",   // conector em L (traço, não texto)
};

/** displayId da peça-mãe. Usa o enrich do servidor e, se faltar, deriva do id. */
const parentDisplayIdOf = (item: any) =>
  item?.parent?.displayId || splitDisplayId(item?.displayId).base;
/**
 * O destaque FORTE (fundo, faixa, selo sólido e linha de motivo) vale enquanto
 * o complemento não foi entregue. Entre produzir e entregar ainda há
 * conferência e a carga do caminhão, e o complemento é justamente o lote que
 * corre risco de perder a janela logística. Depois de entregue sobra só a
 * identidade permanente ("complemento de #0062") — o alarme some sozinho, sem
 * ninguém precisar confirmar nada.
 */
const complementOpen = (item: any) => isComplement(item) && !isDelivered(item);
/** Espelha o gate do servidor no DELETE /api/items/:id/complement. */
const complementUntouched = (item: any) =>
  producedOf(item) === 0 && reusedOf(item) === 0 && conferredOf(item) === 0 && deliveredOf(item) === 0;

/** "13/08 14:22" — timestamp real (fuso local), diferente da Saída, que é UTC. */
const fmtDataHora = (v?: string | Date | null) => {
  if (!v) return "";
  const d = new Date(v as any);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
};

/**
 * Fundo da linha da tabela — UMA função para as três mãos (style inicial,
 * onMouseEnter e onMouseLeave). Antes a cor era decidida em três lugares
 * desalinhados: passar o mouse por cima apagava qualquer realce que não
 * estivesse repetido nos três, e o realce do complemento seria a primeira
 * vítima. Precedência: RECÉM-CRIADO > seleção em lote > complemento em aberto >
 * reaproveitado. A seleção passou de #fff7ed para #ffedd5 justamente para não
 * empatar com o fundo do complemento.
 *
 * `isNovo` é o realce de 5 s da peça que acabou de nascer nesta sessão: ele
 * vem primeiro porque é o único que responde a "cadê o que eu acabei de criar?".
 */
const rowBg = (item: any, isSelected: boolean, hover: boolean, isNovo = false) => {
  if (isNovo) return hover ? CO.border : CO.hoverBg;
  if (isSelected) return hover ? CO.border : CO.hoverBg;
  if (complementOpen(item)) return hover ? CO.hoverBg : CO.bg;
  if (item?.isReuse) return hover ? "#dcfce7" : "#f0fdf4";
  return hover ? "#fafaf9" : "";
};

/** Mensagem legível de um erro da API (apiRequest devolve o corpo cru). */
const apiErrorMessage = (error: any) => {
  const raw = String(error?.message ?? "");
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.error) return String(parsed.error);
  } catch { /* não era JSON — usa o texto como veio */ }
  return raw || "Erro inesperado";
};

// Chip de quantidade do card mobile (reaproveitado/produzido/conferido/
// entregue). Tons 700 sobre fundo claro: 10px precisa passar AA.
const qtyChip = (color: string, bg: string): React.CSSProperties => ({
  fontSize: 10, fontWeight: 800, color, backgroundColor: bg,
  border: `1px solid ${color}33`, borderRadius: 6, padding: "2px 6px",
  letterSpacing: "0.04em", whiteSpace: "nowrap",
});

// Chip de prazo da Produção Gráfica — o mesmo visual sobre o cabeçalho escuro
// do evento, tanto na tabela desktop quanto no card mobile.
function DeadlineChip({ event }: { event: any }) {
  if (!event?.truckDepartureDate) return null;
  const days = event.deadlineProducaoGrafica ?? -1;
  // Conta e formata em UTC — a mesma convenção da "Saída" exibida ao lado.
  // Em fuso local o chip podia mostrar um dia a menos que a data do cabeçalho.
  const base = new Date(event.truckDepartureDate);
  const dUTC = Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + days);
  const now = new Date();
  const todayUTC = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((dUTC - todayUTC) / 86400000);
  const ds = new Date(dUTC).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
  const s = diff < 0
    ? { bg: "rgba(255,80,80,0.22)", border: "rgba(255,80,80,0.38)", text: "#ffb3b3" }
    : diff === 0
    ? { bg: "rgba(255,200,80,0.28)", border: "rgba(255,200,80,0.45)", text: "#ffe59c" }
    : diff <= 3
    ? { bg: "rgba(255,160,50,0.22)", border: "rgba(255,160,50,0.38)", text: "#ffc78a" }
    : { bg: "rgba(255,255,255,0.12)", border: "rgba(255,255,255,0.2)", text: "rgba(255,255,255,0.72)" };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, backgroundColor: s.bg, border: `1px solid ${s.border}`, borderRadius: 999, padding: "3px 9px", fontSize: 10, fontWeight: 700, color: s.text, letterSpacing: "0.04em", whiteSpace: "nowrap", alignSelf: "flex-start" }}>
      Produção Gráfica · {ds}{diff >= 0 && diff <= 14 && <span style={{ opacity: 0.65, fontWeight: 500 }}> ({diff}d)</span>}
    </span>
  );
}

// Seletor de fotos (câmera + galeria) com miniaturas e remoção — unifica as
// três cópias que existiam (modais individuais, entrega e conferência em lote).
// Normaliza texto para comparação (minúscula, sem acento, espaço colapsado) —
// mesma regra da Arte para casar type com nome/grupo do catálogo de Modelos.
const normKey = (s: string) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

// PERCURSO das placas de quilometragem. O app não tem campo para isso: a
// distância vive no texto da peça, na forma que a operação escreve — "10k - km 8",
// "5k - km 4", "5k/10k - km 1" (esta última pertence aos DOIS percursos).
// Casa "5k", "10km", "21,1k" e ignora o marcador "km 8" (exige dígito ANTES do k)
// e unidades como "kg" (lookahead).
const PERCURSO_RE = /(\d{1,3}(?:[.,]\d{1,2})?)\s*k(?:m|ms)?(?![a-z])/gi;
function itemPercursos(item: any): string[] {
  const text = `${item?.description ?? ""} ${item?.type ?? ""}`;
  const out = new Set<string>();
  PERCURSO_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PERCURSO_RE.exec(text)) !== null) out.add(`${m[1].replace(".", ",")}k`);
  return Array.from(out);
}

function PhotoPicker({ photos, onAdd, onRemove, onError, label = "Fotos", hint, dense = false }: {
  photos: string[];
  onAdd: (url: string) => void;
  onRemove: (url: string) => void;
  onError: (error: Error) => void;
  label?: string;
  hint?: string;
  dense?: boolean;
}) {
  const buttons = [
    { capture: true, Icon: Camera, text: dense ? "Câmera" : "Tirar Foto" },
    { capture: false, Icon: ImagePlus, text: dense ? "Galeria" : "Anexar Fotos" },
  ];
  return (
    <div>
      <label style={{ display: "block", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#746e69", marginBottom: 10 }}>
        {label} {hint && <span style={{ color: "#746e69", textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>{hint}</span>}
      </label>

      <div style={{ display: "flex", gap: 10 }}>
        {buttons.map(({ capture, Icon, text }) => (
          <div key={text} style={{ flex: 1 }}>
            <ObjectUploader
              {...(capture ? { capture: true } : { multiple: true })}
              maxFileSize={10485760}
              buttonVariant="ghost"
              buttonClassName="w-full h-full p-0 border-0 hover:bg-transparent"
              onComplete={r => onAdd(r.url)}
              onError={onError}
            >
              <div style={{ width: "100%", padding: dense ? "12px 0" : "14px 0", backgroundColor: "#f4f3f0", borderRadius: 8, border: "2px dashed #d6d3d1", display: "flex", flexDirection: "column", alignItems: "center", gap: dense ? 5 : 6, cursor: "pointer" }}>
                <Icon style={{ width: dense ? 18 : 20, height: dense ? 18 : 20, color: "#746e69" }} />
                <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#746e69" }}>{text}</span>
              </div>
            </ObjectUploader>
          </div>
        ))}
      </div>

      {photos.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${dense ? 72 : 84}px, 1fr))`, gap: 8, marginTop: dense ? 10 : 12 }}>
          {photos.map(url => (
            <div key={url} style={{ position: "relative", aspectRatio: "1", borderRadius: 8, overflow: "hidden", border: `1px solid ${TI.border}`, backgroundColor: "#f4f3f0" }}>
              <img src={url} alt="Foto anexada" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              {/* Alvo de toque 44×44 (área invisível maior que o X visível) e
                  confirmação antes de remover — o botão de 20px colado na
                  miniatura removia a foto num toque acidental, sem volta. */}
              <button
                type="button"
                onClick={() => { if (window.confirm("Remover esta foto?")) onRemove(url); }}
                title="Remover foto"
                aria-label="Remover foto"
                style={{ position: "absolute", top: 0, right: 0, width: 44, height: 44, background: "transparent", border: "none", display: "flex", alignItems: "flex-start", justifyContent: "flex-end", padding: 4, cursor: "pointer" }}
              >
                <span style={{ width: 20, height: 20, borderRadius: "50%", backgroundColor: "rgba(28,25,23,0.75)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <X style={{ width: 11, height: 11 }} />
                </span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Dialog dos modos em lote — um único componente para conferência e entrega,
// que eram duas cópias de ~150 linhas divergindo aos poucos.
function BulkActionDialog({
  mode, open, onClose, items, photos, onAddPhoto, onRemovePhoto, onPhotoError,
  notes, onNotesChange, receivedBy = "", onReceivedByChange, isSubmitting, onConfirm, qtyFor,
}: {
  mode: "confer" | "deliver";
  open: boolean;
  onClose: () => void;
  items: any[];
  photos: string[];
  onAddPhoto: (url: string) => void;
  onRemovePhoto: (url: string) => void;
  onPhotoError: (error: Error) => void;
  notes: string;
  onNotesChange: (v: string) => void;
  receivedBy?: string;
  onReceivedByChange?: (v: string) => void;
  isSubmitting: boolean;
  onConfirm: () => void;
  qtyFor: (item: any) => number;
}) {
  const isConfer = mode === "confer";
  const tint = isConfer ? "#0e7490" : TI.accent;
  const canSubmit = isConfer ? photos.length > 0 : receivedBy.trim().length > 0;
  const confirmBg = isConfer ? "#0e7490" : "#15803d";
  const confirmHover = isConfer ? "#155e75" : "#166534";
  const HeaderIcon = isConfer ? CheckCircle : Truck;
  const count = items.length;
  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className={HIDE_NATIVE_CLOSE} style={modalSurface(460)}>
        <DialogTitle className="sr-only">{isConfer ? "Confirmar Conferência em Lote" : "Confirmar Entrega em Lote"}</DialogTitle>
        <DialogDescription className="sr-only">{isConfer ? "Registre a conferência de múltiplas peças de uma vez" : "Registre a entrega de múltiplas peças de uma vez"}</DialogDescription>

        <ModalHeader
          icon={HeaderIcon}
          tint={tint}
          title={isConfer ? "Conferência em lote" : "Entrega em lote"}
          subtitle={`${count} peça${count !== 1 ? "s" : ""} selecionada${count !== 1 ? "s" : ""}`}
          onClose={onClose}
        />

        {/* Body — rola dentro do modal (mesmo padrão do modal individual): o
            modalSurface corta com overflow hidden, e no celular com várias
            fotos o botão Confirmar saía da tela sem caminho até ele. */}
        <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 18, background: "#fafaf9", maxHeight: "calc(88vh - 96px)", overflowY: "auto" }}>
          {!isConfer && (
            <div>
              <label style={{ display: "block", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#746e69", marginBottom: 10 }}>
                Responsável pelo Recebimento *
              </label>
              <input
                type="text"
                value={receivedBy}
                onChange={e => onReceivedByChange?.(e.target.value)}
                // Mesma guarda do botão Confirmar: dois Enters seguidos
                // disparavam o lote duas vezes (o 409 da repetição virava
                // toast de erro falso).
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); if (!isSubmitting && canSubmit) onConfirm(); } }}
                placeholder="Nome de quem recebeu"
                autoFocus
                style={{ width: "100%", boxSizing: "border-box", padding: "14px 16px", background: "#fff", border: "1.5px solid #e7e5e4", borderRadius: 12, fontSize: 15, fontWeight: 600, color: TI.text, transition: "border-color 0.15s, box-shadow 0.15s" }}
                onFocus={e => { e.currentTarget.style.borderColor = tint; e.currentTarget.style.boxShadow = `0 0 0 3px ${tint}22`; }}
                onBlur={e => { e.currentTarget.style.borderColor = "#e7e5e4"; e.currentTarget.style.boxShadow = "none"; }}
              />
            </div>
          )}

          <PhotoPicker
            dense
            photos={photos}
            onAdd={onAddPhoto}
            onRemove={onRemovePhoto}
            onError={onPhotoError}
            label={isConfer ? "Foto da conferência *" : "Comprovante fotográfico"}
            hint={isConfer ? "· mesma para todas as peças" : "· opcional · mesmo para todas as peças"}
          />

          {/* Observações */}
          <div>
            <label style={{ display: "block", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#746e69", marginBottom: 8 }}>
              Observações <span style={{ textTransform: "none", fontWeight: 400, color: "#746e69", letterSpacing: 0 }}>(opcional)</span>
            </label>
            <textarea
              value={notes}
              onChange={e => onNotesChange(e.target.value)}
              placeholder={isConfer ? "Ex.: conferido contra o romaneio, sem avarias..." : "Ex.: entregue na portaria, aguardando retirada..."}
              rows={2}
              style={{ width: "100%", boxSizing: "border-box", padding: "12px 14px", background: "#fff", border: "1.5px solid #e7e5e4", borderRadius: 12, fontSize: 13, fontFamily: "inherit", color: TI.text, resize: "none", lineHeight: 1.5 }}
            />
          </div>

          {/* Peças selecionadas — com a ARTE e a DESCRIÇÃO de cada uma: é a
              última conferência antes de registrar em lote, e "Banner · 3 un."
              repetido cinco vezes não diz ao operador o que ele está
              confirmando. maxHeight maior porque a linha agora tem miniatura. */}
          <div>
            <label style={{ display: "block", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#746e69", marginBottom: 8 }}>
              Peças selecionadas <span style={{ textTransform: "none", fontWeight: 400, letterSpacing: 0 }}>({count})</span>
            </label>
            <div style={{ background: "#fff", border: "1px solid #e7e5e4", borderRadius: 12, maxHeight: 232, overflowY: "auto" }}>
              {items.map((item: any, idx: number) => (
                <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderBottom: idx < count - 1 ? "1px solid #f5f5f4" : "none" }}>
                  <div style={{
                    width: 44, height: 44, flexShrink: 0, borderRadius: 8, overflow: "hidden",
                    border: `1px solid ${TI.border}`, backgroundColor: "#faf9f7",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {item.approvalThumbUrl ? (
                      <img
                        src={convertGCSUrlToLocalPath(item.approvalThumbUrl)}
                        alt=""
                        loading="lazy" decoding="async"
                        style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", display: "block" }}
                        onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                      />
                    ) : (
                      <Package aria-hidden="true" style={{ width: 16, height: 16, color: "#a8a29e" }} />
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 700, color: tint, flexShrink: 0 }}>{item.displayId}</span>
                      {/* O complemento tem a MESMA arte, o mesmo tipo e quase a
                          mesma descrição da peça original: numa conferência em
                          lote com as duas selecionadas, sem este selo as duas
                          linhas são indistinguíveis — e é aqui que o operador
                          dá o último olhar antes de registrar tudo de uma vez. */}
                      {isComplement(item) && (
                        <span
                          title={item.complementReason ? `Complemento — motivo: ${item.complementReason}` : "Peça complementar (aumento de quantidade)"}
                          data-testid={`badge-complemento-lote-${item.id}`}
                          style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 3, backgroundColor: CO.solidBg, color: CO.solidText, borderRadius: 5, padding: "1px 6px", fontSize: 9, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", whiteSpace: "nowrap" }}
                        >
                          <PlusCircle style={{ width: 9, height: 9 }} />
                          Compl. de {parentDisplayIdOf(item)}
                        </span>
                      )}
                      <span style={{ fontSize: 13, fontWeight: 600, color: TI.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.type}</span>
                    </div>
                    {item.description && item.description !== item.type && (
                      <div style={{ fontSize: 12, color: TI.secondary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {item.description}
                      </div>
                    )}
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: TI.secondary, flexShrink: 0 }}>{qtyFor(item)} un.</span>
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div style={{ display: "flex", gap: 10 }}>
            <button
              type="button"
              onClick={onClose}
              style={{ flex: 1, height: 48, borderRadius: 12, background: "transparent", border: "1.5px solid #e7e5e4", color: "#746e69", fontSize: 13, fontWeight: 700, cursor: "pointer", transition: "background 0.12s" }}
              onMouseEnter={e => { e.currentTarget.style.background = "#f5f5f4"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={isSubmitting || !canSubmit}
              style={{
                flex: 2, height: 48, borderRadius: 12, border: "none",
                background: (!canSubmit || isSubmitting) ? "#e7e5e4" : confirmBg,
                color: (!canSubmit || isSubmitting) ? "#78716c" : "#fff",
                fontSize: 13, fontWeight: 800, fontFamily: "'Space Grotesk', sans-serif",
                cursor: (!canSubmit || isSubmitting) ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                boxShadow: canSubmit && !isSubmitting ? `0 4px 14px ${confirmBg}4d` : "none",
                transition: "all 0.15s",
              }}
              onMouseEnter={e => { if (canSubmit && !isSubmitting) e.currentTarget.style.background = confirmHover; }}
              onMouseLeave={e => { if (canSubmit && !isSubmitting) e.currentTarget.style.background = confirmBg; }}
            >
              {isSubmitting
                ? "Salvando..."
                : <><HeaderIcon style={{ width: 15, height: 15 }} />{isConfer ? "Confirmar Conferência" : "Confirmar Entrega"} ({count})</>
              }
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function Grafica() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  // Espelha os gates do servidor (server/routes/items.ts): start-production e
  // confer aceitam apenas grafica/admin; deliver aceita também solicitacao.
  // Sem isto a Solicitação via botões de Produzir/Conferir que o servidor
  // recusava com 403 depois do clique.
  const canProduce = ["grafica", "admin"].includes(user?.role ?? "");
  // MEXER NA QUANTIDADE (criar complemento e cancelar complemento) é outro
  // papel: admin | solicitacao, espelho de `podeMudarQuantidade` no servidor.
  // `canProduce` (grafica|admin) NÃO participa deste gate em ponto nenhum — a
  // Gráfica produz o que pedem, não muda o pedido.
  const podeMexerQtd = podeMexerNaQuantidade(user?.role);
  const { toast } = useToast();
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [modalType, setModalType] = useState<"production" | "delivery" | "conference" | null>(null);
  const [viewDetailsItem, setViewDetailsItem] = useState<any>(null);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [eventFilter, setEventFilter] = useState<string[]>([]);
  const [typeFilter, setTypeFilter] = useState<string[]>([]);
  const [materialFilter, setMaterialFilter] = useState<string[]>([]);
  const [finishFilter, setFinishFilter] = useState<string[]>([]);
  // Pedido da Gráfica: separar o trabalho por GRUPO (ex.: "Placa km") e, dentro
  // dele, por PERCURSO (5k, 10k) — com dezenas de placas quase idênticas na
  // fila, era o único jeito de montar o lote certo sem conferir uma a uma.
  const [groupFilter, setGroupFilter] = useState<string[]>([]);
  const [percursoFilter, setPercursoFilter] = useState<string[]>([]);
  // Chip "complementos": recorta a fila para os aumentos de quantidade pedidos
  // depois que a peça já estava em produção. Não pinamos os complementos no
  // topo da lista (arrancá-los do bloco do evento duplicaria cabeçalhos e a
  // Gráfica trabalha POR EVENTO, com o caminhão marcado) — o acesso rápido vem
  // deste filtro, e o realce visual faz o resto.
  const [complementFilter, setComplementFilter] = useState(false);
  // Confirmação em dois toques do "cancelar complemento" — mesmo idioma dos
  // botões de reaproveitamento desta tela, e nunca destrutivo num clique só.
  const [cancelComplementId, setCancelComplementId] = useState<string | null>(null);
  // ── Aumentar quantidade (o gatilho mora nesta tela) ──
  // complementoItem: a peça-MÃE em foco no modal.
  // novoComplementoId: a peça-filha recém-criada — realce de 5 s + rolagem.
  // bannerComplemento: rede de segurança para quando a filha nasce FORA do
  //   recorte de filtros do operador (a rolagem falharia em silêncio).
  const [complementoItem, setComplementoItem] = useState<any>(null);
  const [novoComplementoId, setNovoComplementoId] = useState<string | null>(null);
  const [bannerComplemento, setBannerComplemento] = useState<{ id: string; displayId: string } | null>(null);
  const abrirComplemento = (item: any) => setComplementoItem(item);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [next10DaysFilter, setNext10DaysFilter] = useState(false);
  const [monthFilter, setMonthFilter] = useState<string[]>([]);
  const [searchFilter, setSearchFilter] = useState<string>("");
  const [isExporting, setIsExporting] = useState(false);
  const [productionData, setProductionData] = useState({ quantityProduced: 0 });
  const [deliveryData, setDeliveryData] = useState({ receivedBy: "" });
  const [conferQty, setConferQty] = useState(0);   // conferência parcial
  const [deliverQty, setDeliverQty] = useState(0); // entrega parcial
  // Fotos anexadas no modal aberto (conferência ou entrega). Várias por vez.
  const [photos, setPhotos] = useState<string[]>([]);
  // A URL assinada do GCS perde o token ao ser gravada; o app serve os arquivos
  // por /objects/... — sem converter, a foto salva não abre depois.
  const addPhoto = (url: string) => setPhotos(prev => [...prev, convertGCSUrlToLocalPath(url)]);
  const removePhoto = (url: string) => setPhotos(prev => prev.filter(p => p !== url));
  const [modalNotes, setModalNotes] = useState("");
  const [reuseConfirmItemId, setReuseConfirmItemId] = useState<string | null>(null);
  const [reuseQty, setReuseQty] = useState(0); // reaproveitamento parcial
  const [correctReuseItemId, setCorrectReuseItemId] = useState<string | null>(null);
  const [correctReuseQty, setCorrectReuseQty] = useState(0); // quantidade corrigida
  // Entrega em lote
  const [bulkDeliveryMode, setBulkDeliveryMode] = useState(false);
  const [bulkSelectedIds, setBulkSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeliveryOpen, setBulkDeliveryOpen] = useState(false);
  const [bulkReceivedBy, setBulkReceivedBy] = useState("");
  const [bulkDeliveryNotes, setBulkDeliveryNotes] = useState("");
  const [isBulkSubmitting, setIsBulkSubmitting] = useState(false);
  const [bulkDeliveryPhotos, setBulkDeliveryPhotos] = useState<string[]>([]);
  const addBulkPhoto = (url: string) => setBulkDeliveryPhotos(prev => [...prev, convertGCSUrlToLocalPath(url)]);
  // ── Conferência em lote (espelha a entrega em lote) ──
  const [bulkConferMode, setBulkConferMode] = useState(false);
  const [bulkConferOpen, setBulkConferOpen] = useState(false);
  const [bulkConferNotes, setBulkConferNotes] = useState("");
  const [bulkConferPhotos, setBulkConferPhotos] = useState<string[]>([]);
  const addBulkConferPhoto = (url: string) => setBulkConferPhotos(prev => [...prev, convertGCSUrlToLocalPath(url)]);
  const isMobile = useIsMobile();
  const { data: items = [], isLoading, isError, error, refetch } = useQuery<any[]>({ queryKey: ["/api/items/approved"] });
  // Enquanto o `npm run db:push` das colunas de complemento não roda, o SELECT
  // do Drizzle pede colunas que não existem e a leitura inteira falha (não só
  // o recurso). Sem esta detecção a tela diria "verifique sua conexão" e o
  // operador ligaria para o suporte errado.
  const migracaoPendente = /parent_item_id|complement_|migra[çc][ãa]o pendente|42703/i
    .test(String((error as any)?.message ?? ""));
  // Histórico DA PEÇA aberta, com escopo no servidor. A listagem global tem
  // teto de 500 registros — peça antiga caía fora da janela e a ficha
  // mostrava "sem histórico" (bug reportado pelo dono).
  const { data: auditLogs = [] } = useQuery<any[]>({
    queryKey: ["/api/audit-logs", "item", viewDetailsItem?.id],
    queryFn: () =>
      fetch(`/api/audit-logs?entityType=item&entityId=${viewDetailsItem!.id}`, { credentials: "include" })
        .then(r => r.ok ? r.json() : Promise.reject(new Error(`Falha ao carregar o histórico (HTTP ${r.status})`))),
    select: d => (Array.isArray(d) ? d : []),
    enabled: !!viewDetailsItem?.id,
    placeholderData: [],
  });
  const { data: standardItems = [] } = useQuery<any[]>({ queryKey: ['/api/standard-items'] });
  const typeToGroup = useMemo(() => {
    const map: Record<string, string> = {};
    (standardItems as any[]).forEach((s: any) => { if (s.group) map[s.name] = s.group; });
    return map;
  }, [standardItems]);

  // Resolve o GRUPO da peça (catálogo de Modelos) tolerando maiúscula, acento
  // e espaço — mesma regra da Arte: o type casa com o NOME de um modelo
  // (name → group) ou direto com um NOME DE GRUPO, para itens vindos da
  // planilha caírem no grupo certo. É o que a Gráfica usa para separar, por
  // exemplo, as placas de 5km das de 10km.
  const groupMaps = useMemo(() => {
    const byName: Record<string, string> = {};
    const byGroup: Record<string, string> = {};
    (standardItems as any[]).forEach((s: any) => {
      if (s.group) {
        byName[normKey(s.name)] = s.group;
        byGroup[normKey(s.group)] = s.group;
      }
    });
    return { byName, byGroup };
  }, [standardItems]);
  const groupOf = (type: string): string => {
    const k = normKey(type);
    return groupMaps.byName[k] || groupMaps.byGroup[k] || "";
  };

  const startProductionMutation = useMutation({
    mutationFn: async ({ itemId, data }: { itemId: string; data: any }) =>
      await apiRequest("PATCH", `/api/items/${itemId}/start-production`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items/approved"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      setSelectedItem(null); setModalType(null);
      setProductionData({ quantityProduced: 0 });
      toast({ title: "Produção iniciada", description: "A produção foi registrada com sucesso" });
    },
    onError: (error: Error) => toast({ title: "Erro ao iniciar produção", description: error.message, variant: "destructive" }),
  });

  const markDeliveredMutation = useMutation({
    mutationFn: async ({ itemId, data }: { itemId: string; data: any }) =>
      await apiRequest("PATCH", `/api/items/${itemId}/deliver`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items/approved"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      setSelectedItem(null); setModalType(null);
      setDeliveryData({ receivedBy: "" });
      setPhotos([]);
      toast({ title: "Entrega confirmada", description: "O item foi marcado como entregue com sucesso" });
    },
    onError: (error: Error) => toast({ title: "Erro ao confirmar entrega", description: error.message, variant: "destructive" }),
  });

  const conferMutation = useMutation({
    mutationFn: async ({ itemId, conferencePhotoUrl, qty, notes }: { itemId: string; conferencePhotoUrl: string; qty: number; notes?: string }) =>
      await apiRequest("POST", `/api/items/${itemId}/confer`, { conferencePhotoUrl, qty, notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items/approved"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      setSelectedItem(null); setModalType(null);
      setPhotos([]);
      toast({ title: "Conferido", description: "A peça foi conferida e está pronta para entrega." });
    },
    onError: (error: Error) => toast({ title: "Erro ao conferir", description: error.message, variant: "destructive" }),
  });

  const markReuseMutation = useMutation({
    // apiRequest devolve o Response cru — sem o .json() o onSuccess lia
    // quantity/reuseQty como undefined e o toast sempre dizia "peça inteira".
    mutationFn: async ({ itemId, qty }: { itemId: string; qty: number }) =>
      await (await apiRequest("POST", `/api/items/${itemId}/mark-reuse`, { qty })).json(),
    onSuccess: (updated: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/items/approved"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      setReuseConfirmItemId(null);
      const falta = (updated?.quantity ?? 0) - (updated?.reuseQty ?? 0);
      toast({
        title: "Reaproveitamento registrado",
        description: falta > 0
          ? `${updated.reuseQty} un. reaproveitada(s). Faltam ${falta} un. para produzir.`
          : "Peça inteira reaproveitada. Segue para conferência.",
      });
    },
    onError: (error: Error) => {
      setReuseConfirmItemId(null);
      toast({ title: "Erro ao marcar reaproveitamento", description: error.message, variant: "destructive" });
    },
  });

  // Corrige reaproveitamento total marcado por engano (só disponível antes de conferir)
  const correctReuseMutation = useMutation({
    // Mesmo caso do mark-reuse: o toast lia o Response cru e anunciava
    // "voltou com as 0 un." — o .json() entrega o item atualizado de verdade.
    mutationFn: async ({ itemId, correctedReuseQty }: { itemId: string; correctedReuseQty: number }) =>
      await (await apiRequest("POST", `/api/items/${itemId}/correct-reuse`, { correctedReuseQty })).json(),
    onSuccess: (updated: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/items/approved"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      setCorrectReuseItemId(null);
      const qty = Number(updated?.quantity) || 0;
      const reused = Number(updated?.reuseQty) || 0;
      toast({
        title: reused === 0 ? "Reaproveitamento removido" : "Reaproveitamento corrigido",
        description: reused === 0
          ? `A peça voltou para a fila de produção com as ${qty} un.`
          : `${reused} un. reaproveitadas. As outras ${qty - reused} voltaram para produção.`,
      });
    },
    onError: (error: Error) => {
      setCorrectReuseItemId(null);
      toast({ title: "Erro ao corrigir reaproveitamento", description: error.message, variant: "destructive" });
    },
  });

  // Cancelar complemento — a janela de arrependimento, aberta também para a
  // Gráfica (é quem percebe o engano na hora, com a fila na frente). O servidor
  // recusa se QUALQUER unidade já foi produzida, reaproveitada, conferida ou
  // entregue; o botão só aparece nesse mesmo caso, para não convidar a uma ação
  // que voltaria como erro. O número -C1 não é reciclado: o próximo será -C2.
  const cancelComplementMutation = useMutation({
    mutationFn: async ({ itemId }: { itemId: string; displayId: string }) =>
      await (await apiRequest("DELETE", `/api/items/${itemId}/complement`)).json(),
    onSuccess: (_data: any, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/items/approved"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      setCancelComplementId(null);
      toast({ title: "Complemento cancelado", description: `${vars.displayId} removido da fila.` });
    },
    onError: (error: Error) => {
      setCancelComplementId(null);
      // O corpo do 409/503 vem como JSON cru dentro da mensagem — sem traduzir,
      // o operador leria {"error":"…","code":"COMPLEMENT_TOUCHED"} no toast.
      toast({ title: "Não foi possível cancelar", description: apiErrorMessage(error), variant: "destructive" });
    },
  });

  // Filtros facetados: cada filtro lista só o que existe no recorte atual,
  // aplicando os OUTROS filtros ativos (com contagem por opção).
  const gFacetPool = (exclude: 'event' | 'status' | 'type' | 'material' | 'finish' | 'group' | 'percurso') =>
    (items as any[]).filter((item: any) => {
      if (exclude !== 'group' && groupFilter.length > 0 && !groupFilter.includes(groupOf(item.type))) return false;
      if (exclude !== 'percurso' && percursoFilter.length > 0 && !itemPercursos(item).some(p => percursoFilter.includes(p))) return false;
      if (exclude !== 'status' && statusFilter.length > 0) {
        // Estrito: "pronto_para_producao" é só grafia legada do mesmo status;
        // "approved" NÃO entra aqui (o KPI Liberados seleciona os dois valores).
        const ok = statusFilter.some(sf => sf === "ready_for_production"
          ? (item.status === "ready_for_production" || item.status === "pronto_para_producao")
          : item.status === sf);
        if (!ok) return false;
      }
      if (exclude !== 'event' && eventFilter.length > 0 && !eventFilter.includes(item.eventId)) return false;
      if (exclude !== 'type' && typeFilter.length > 0 && !typeFilter.includes(item.type)) return false;
      if (exclude !== 'material' && materialFilter.length > 0 && !materialFilter.includes(item.material)) return false;
      if (exclude !== 'finish' && finishFilter.length > 0 && !finishFilter.includes(item.finish)) return false;
      return true;
    });

  const countField = (exclude: any, key: 'type' | 'material' | 'finish') => {
    const map = new Map<string, { value: string; label: string; count: number }>();
    gFacetPool(exclude).forEach((i: any) => {
      const v = i[key];
      if (!v) return;
      const cur = map.get(v);
      if (cur) cur.count++;
      else map.set(v, { value: v, label: v, count: 1 });
    });
    return Array.from(map.values());
  };

  const eventFilterOptions = (() => {
    // Cores de prioridade vêm da fonte única (lib/status) — o mapa hex local
    // divergia dela ("alta" laranja aqui, âmbar no resto do app).
    // 'urgent' é grafia legada de 'urgente' que ainda existe em eventos antigos.
    const dotFor = (priority: string | undefined) =>
      getPriorityMeta(priority === 'urgent' ? 'urgente' : priority)?.dot;
    const map = new Map<string, { value: string; label: string; count: number; dotColor?: string }>();
    gFacetPool('event').forEach((i: any) => {
      if (!i.eventId) return;
      const cur = map.get(i.eventId);
      if (cur) cur.count++;
      else map.set(i.eventId, { value: i.eventId, label: i.event?.name || 'Sem evento', count: 1, dotColor: dotFor(i.event?.priority) });
    });
    return Array.from(map.values());
  })();
  const typeFilterOptions = countField('type', 'type');
  const materialFilterOptions = countField('material', 'material');
  const finishFilterOptions = countField('finish', 'finish');

  // Grupos presentes no recorte atual (ex.: 5KM, 10KM, PÓRTICO). Derivado do
  // catálogo de Modelos, então o filtro só aparece quando há grupo cadastrado
  // e nunca oferece uma opção que não bate em nada.
  const groupFilterOptions = (() => {
    const map = new Map<string, { value: string; label: string; count: number }>();
    gFacetPool('group').forEach((i: any) => {
      const g = groupOf(i.type);
      if (!g) return;
      const cur = map.get(g);
      if (cur) cur.count++;
      else map.set(g, { value: g, label: g, count: 1 });
    });
    // Ordem natural: "5KM" antes de "10KM" (alfabética inverteria os dois).
    return Array.from(map.values())
      .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR', { numeric: true }))
      .map((o) => ({ ...o, pinned: true }));
  })();

  // Percursos presentes no recorte (5k, 10k...). Uma placa "5k/10k" conta nos
  // dois — é peça compartilhada e tem de aparecer em qualquer um dos filtros.
  const percursoFilterOptions = (() => {
    const map = new Map<string, { value: string; label: string; count: number; sort: number }>();
    gFacetPool('percurso').forEach((i: any) => {
      itemPercursos(i).forEach((p) => {
        const cur = map.get(p);
        if (cur) cur.count++;
        else map.set(p, { value: p, label: p, count: 1, sort: parseFloat(p.replace(',', '.')) });
      });
    });
    return Array.from(map.values())
      .sort((a, b) => a.sort - b.sort)
      .map(({ value, label, count }) => ({ value, label, count, pinned: true }));
  })();

  const months = [
    { value: "all", label: "Todos os meses" },
    { value: "1", label: "Janeiro" }, { value: "2", label: "Fevereiro" },
    { value: "3", label: "Março" }, { value: "4", label: "Abril" },
    { value: "5", label: "Maio" }, { value: "6", label: "Junho" },
    { value: "7", label: "Julho" }, { value: "8", label: "Agosto" },
    { value: "9", label: "Setembro" }, { value: "10", label: "Outubro" },
    { value: "11", label: "Novembro" }, { value: "12", label: "Dezembro" },
  ];

  // Filtro compartilhado entre a lista e os KPIs — a única diferença é que os
  // KPIs ignoram o filtro de status (cada card mostra a contagem do seu status
  // dentro do recorte atual). Antes eram duas cópias quase idênticas.
  const matchesFilters = (item: any, opts?: { skipStatus?: boolean }) => {
    if (searchFilter) {
      const q = searchFilter.toLowerCase();
      if (!item.type?.toLowerCase().includes(q) &&
          !item.description?.toLowerCase().includes(q) &&
          !item.displayId?.toLowerCase().includes(q) &&
          !item.event?.name?.toLowerCase().includes(q)) return false;
    }
    if (!opts?.skipStatus && statusFilter.length > 0) {
      // Estrito, como no gFacetPool: escolher "Pronto p/ Produção" no select
      // não pode devolver também os "Liberados" (duplicava a outra opção).
      const ok = statusFilter.some(sf => sf === "ready_for_production"
        ? (item.status === "ready_for_production" || item.status === "pronto_para_producao")
        : item.status === sf);
      if (!ok) return false;
    }
    // O chip de complementos é filtro de RECORTE, como o status: o pool que
    // alimenta os cards e o próprio chip ignora os dois (`skipStatus`), senão
    // cada um zeraria a contagem de onde nasceu.
    if (!opts?.skipStatus && complementFilter && !isComplement(item)) return false;
    if (eventFilter.length > 0 && !eventFilter.includes(item.eventId)) return false;
    if (groupFilter.length > 0 && !groupFilter.includes(groupOf(item.type))) return false;
    // Percurso: casa com QUALQUER um dos selecionados (placa "5k/10k" entra
    // tanto no filtro 5k quanto no 10k).
    if (percursoFilter.length > 0 && !itemPercursos(item).some(p => percursoFilter.includes(p))) return false;
    if (typeFilter.length > 0 && !typeFilter.includes(item.type)) return false;
    if (materialFilter.length > 0 && !materialFilter.includes(item.material)) return false;
    if (finishFilter.length > 0 && !finishFilter.includes(item.finish)) return false;
    if (next10DaysFilter) {
      // Sem data de saída não há como estar "nos próximos 10 dias" — antes o
      // item sem data passava pelo filtro. E a conta é em UTC, o mesmo fuso em
      // que a Saída é exibida na lista.
      if (!item.event?.truckDepartureDate) return false;
      const now = new Date();
      const todayUTC = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
      const dep = new Date(item.event.truckDepartureDate);
      const depUTC = Date.UTC(dep.getUTCFullYear(), dep.getUTCMonth(), dep.getUTCDate());
      if (!(depUTC >= todayUTC && depUTC <= todayUTC + 10 * 86400000)) return false;
    }
    if (monthFilter.length > 0 && item.event?.truckDepartureDate) {
      // getUTCMonth: a exibição da Saída é UTC — com getMonth() local a virada
      // de mês perto da meia-noite UTC caía no mês errado do filtro.
      const month = new Date(item.event.truckDepartureDate).getUTCMonth() + 1;
      if (!monthFilter.includes(month.toString())) return false;
    }
    return true;
  };

  // Memoizado com as deps reais dos filtros — sem isto era um array novo por
  // render, e os useMemo derivados (deliverable/conferable) nunca acertavam.
  const filteredItems = useMemo(() =>
    (items as any[])
      .filter((item: any) => matchesFilters(item))
      .sort((a: any, b: any) => {
        // Urgência primeiro: evento com saída do caminhão mais próxima no topo;
        // sem data vai para o fim. Nome desempata (e mantém os grupos estáveis).
        const da = a.event?.truckDepartureDate ? new Date(a.event.truckDepartureDate).getTime() : Infinity;
        const db = b.event?.truckDepartureDate ? new Date(b.event.truckDepartureDate).getTime() : Infinity;
        if (da !== db) return da - db;
        const ea = a.event?.name || ""; const eb = b.event?.name || "";
        if (ea !== eb) return ea.localeCompare(eb);
        if (a.type !== b.type) return a.type.localeCompare(b.type);
        // 4º critério: o complemento COLA na peça original. #0062 → #0062-C1 →
        // #0062-C2 → #0063. O filho herda eventId e type, então os três
        // critérios anteriores sempre empatam e ele cai logo abaixo da mãe —
        // sem isso "#0062-C1" ordenaria como 621 e apareceria a centenas de
        // linhas dela, criando exatamente a duplicidade confusa que o modelo
        // de complemento existe para evitar. Os cabeçalhos de evento/grupo/tipo
        // (derivados por comparação com a linha anterior) seguem corretos.
        return compareDisplayId(a.displayId, b.displayId);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, searchFilter, statusFilter, eventFilter, groupFilter, percursoFilter, typeFilter, materialFilter, finishFilter, next10DaysFilter, monthFilter, complementFilter, standardItems]);

  // statsPool: todos os filtros ativos (exceto status) — os cards mostram contagens dentro do contexto atual
  const statsPool = useMemo(() =>
    (items as any[]).filter((item: any) => matchesFilters(item, { skipStatus: true })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, searchFilter, eventFilter, groupFilter, percursoFilter, typeFilter, materialFilter, finishFilter, next10DaysFilter, monthFilter, standardItems]);
  const stats = {
    liberados:  statsPool.filter((i: any) => i.status === 'approved' || i.status === 'ready_for_production' || i.status === 'pronto_para_producao').length,
    emProducao: statsPool.filter((i: any) => i.status === 'inProduction').length,
    produzidos: statsPool.filter((i: any) => i.status === 'produced').length,
    conferidos: statsPool.filter((i: any) => i.status === 'conferred').length,
    entregues:  statsPool.filter((i: any) => i.status === 'delivered').length,
    total:      statsPool.length,
  };

  // ── Complementos no recorte atual (alimenta o chip do cabeçalho) ──
  // Em ABERTO = ainda não entregues: é o trabalho que apareceu depois e ainda
  // não terminou. O chip aparece também quando o filtro está ligado e o recorte
  // esvaziou — senão o botão sumiria com o filtro preso e sem caminho de volta.
  const complementosAbertos = useMemo(
    () => statsPool.filter((i: any) => isComplement(i) && !isDelivered(i)),
    [statsPool],
  );
  const complementosNaLista = useMemo(
    () => statsPool.filter((i: any) => isComplement(i)),
    [statsPool],
  );
  const complementoUn = complementosAbertos.reduce((s: number, i: any) => s + qtyOf(i), 0);
  const complementoAProduzir = complementosAbertos.reduce((s: number, i: any) => s + remainingProduce(i), 0);
  const complementoChipLabel = complementosAbertos.length > 0
    // "a produzir" só quando ainda há impressão pela frente; se já produziu
    // tudo e falta conferir/entregar, o texto seria mentira.
    ? `+${complementoUn} un. em ${complementosAbertos.length} complemento${complementosAbertos.length !== 1 ? "s" : ""} ${complementoAProduzir > 0 ? "a produzir" : "em aberto"}`
    : `${complementosNaLista.length} complemento${complementosNaLista.length !== 1 ? "s" : ""} na lista`;

  // Deep link do sino: /grafica?item=<id> cai aqui vindo da notificação de
  // complemento. Joga o displayId no campo de busca (que já procura por ele) e
  // limpa a URL, para um F5 não reaplicar o recorte — mesmo padrão do
  // event-detail. Espera a lista chegar: com o cache vazio o uuid não
  // resolveria para displayId e a busca cairia em "nenhuma peça encontrada".
  useEffect(() => {
    if (isLoading) return;
    const alvoId = new URLSearchParams(window.location.search).get("item");
    if (!alvoId) return;
    const alvo = (items as any[]).find((i: any) => i.id === alvoId);
    setSearchFilter(alvo?.displayId ?? alvoId);
    window.history.replaceState({}, "", window.location.pathname);
  }, [items, isLoading]);

  // ── Depois de confirmar o aumento ──────────────────────────────────────────
  // A peça-filha nasce COLADA na mãe (compareDisplayId já garante a ordem), mas
  // "nasceu em algum lugar da lista" não é resposta para quem acabou de clicar.
  // A sequência: o modal fecha e invalida as queries → a linha aparece → esta
  // tela rola até ela, realça por 5 s e devolve o foco. A ficha NÃO abre: as
  // portas continuam sendo o olho da linha e o "Mostrar" do banner.
  const handleComplementoCriado = (child: any) => {
    if (!child?.id) return;
    setNovoComplementoId(child.id);
    setBannerComplemento(null);
  };

  // O realce dura 5 s. Criar outra peça reinicia a contagem.
  useEffect(() => {
    if (!novoComplementoId) return;
    const t = setTimeout(() => setNovoComplementoId(null), 5000);
    return () => clearTimeout(t);
  }, [novoComplementoId]);

  // Pousar na linha. Enquanto a invalidação não trouxe a peça, nada acontece
  // (nem banner): só depois que ela EXISTE na lista completa e mesmo assim não
  // está no recorte é que o silêncio vira o pior desfecho — e aí abre o banner.
  useEffect(() => {
    if (!novoComplementoId) return;
    const noRecorte = (filteredItems as any[]).some((i: any) => i.id === novoComplementoId);
    if (!noRecorte) {
      const naLista = (items as any[]).find((i: any) => i.id === novoComplementoId);
      if (naLista) setBannerComplemento({ id: naLista.id, displayId: naLista.displayId });
      return;
    }
    document.querySelector(`[data-item-row="${novoComplementoId}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
    // Quem veio pelo teclado não pode ser despejado no <body>, e o leitor de
    // tela precisa anunciar a peça que acabou de nascer.
    (document.querySelector(`[data-testid="text-display-id-${novoComplementoId}"]`) as HTMLElement | null)
      ?.focus({ preventScroll: true });
  }, [items, filteredItems, novoComplementoId]);

  // O banner some sozinho assim que a peça entra no recorte — inclusive quando
  // é o operador que afrouxa um filtro por conta própria.
  useEffect(() => {
    if (!bannerComplemento) return;
    if ((filteredItems as any[]).some((i: any) => i.id === bannerComplemento.id)) setBannerComplemento(null);
  }, [filteredItems, bannerComplemento]);

  // "Mostrar": limpa o recorte e busca a peça. Mesmo mecanismo já provado do
  // deep link do sino. Nunca é automático — mexer no recorte do operador sem
  // ele pedir é justamente o que este banner existe para evitar.
  const mostrarComplementoCriado = () => {
    if (!bannerComplemento) return;
    setStatusFilter([]);
    setEventFilter([]);
    setTypeFilter([]);
    setMaterialFilter([]);
    setFinishFilter([]);
    setGroupFilter([]);
    setPercursoFilter([]);
    setComplementFilter(false);
    setNext10DaysFilter(false);
    setMonthFilter([]);
    setSearchFilter(bannerComplemento.displayId);
    setNovoComplementoId(bannerComplemento.id);
    setBannerComplemento(null);
  };

  const handleSubmitProduction = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;
    startProductionMutation.mutate({ itemId: selectedItem.id, data: productionData });
  };

  const handleSubmitDelivery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;
    if (!deliveryData.receivedBy?.trim()) {
      toast({ title: "Campo obrigatório", description: "Por favor, informe quem recebeu o material", variant: "destructive" });
      return;
    }
    // Mutation PRIMEIRO; fotos só depois do sucesso — mesma disciplina do lote.
    // Antes as fotos eram anexadas antes da entrega, e uma entrega recusada
    // pelo servidor deixava fotos órfãs na galeria da peça.
    const itemId = selectedItem.id;
    const photosToAttach = photos;
    try {
      // A primeira foto vai na própria entrega como photoUrl — é o campo que
      // vira deliveryPhotoUrl e aparece como comprovante na timeline da peça.
      await markDeliveredMutation.mutateAsync({ itemId, data: { ...deliveryData, photoUrl: photosToAttach[0] || null, qty: deliverQty, notes: modalNotes } });
    } catch {
      return; // o onError da mutation já mostrou o toast
    }
    if (photosToAttach.length) {
      const results = await Promise.allSettled(photosToAttach.map(photoUrl =>
        apiRequest("POST", `/api/items/${itemId}/photos`, {
          photoUrl, kind: "delivery",
          uploadedBy: getCurrentUserName(),
        })
      ));
      if (results.some(r => r.status === "rejected")) {
        toast({ title: "Entrega registrada", description: "Parte das fotos não pôde ser anexada.", variant: "destructive" });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/items/approved"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
    }
  };

  const handleSubmitConference = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;
    if (!photos.length) {
      toast({ title: "Foto obrigatória", description: "Envie ao menos uma foto da conferência.", variant: "destructive" });
      return;
    }
    // Mutation PRIMEIRO (a primeira foto vai nela como conferencePhotoUrl, o
    // campo que o restante do app lê); a galeria só recebe as fotos depois do
    // sucesso — mesma disciplina do lote. Antes uma conferência recusada
    // deixava fotos órfãs na galeria.
    const itemId = selectedItem.id;
    const photosToAttach = photos;
    try {
      await conferMutation.mutateAsync({ itemId, conferencePhotoUrl: photosToAttach[0], qty: conferQty, notes: modalNotes });
    } catch {
      return; // o onError da mutation já mostrou o toast
    }
    const results = await Promise.allSettled(photosToAttach.map(photoUrl =>
      apiRequest("POST", `/api/items/${itemId}/photos`, {
        photoUrl, kind: "conference",
        uploadedBy: getCurrentUserName(),
      })
    ));
    if (results.some(r => r.status === "rejected")) {
      toast({ title: "Conferência registrada", description: "Parte das fotos não pôde ser anexada.", variant: "destructive" });
    }
    queryClient.invalidateQueries({ queryKey: ["/api/items/approved"] });
    queryClient.invalidateQueries({ queryKey: ["/api/items"] });
  };

  const onPhotoError = (error: Error) =>
    toast({ title: "Erro no upload", description: error.message, variant: "destructive" });

  // Barra de ações dos modais. No celular o conteúdo (arte grande + specs +
  // fotos + observação) passa da altura da tela, e o botão de confirmar ficava
  // no fim da rolagem: depois de tirar a foto era preciso procurar por ele.
  const modalActionsStyle: React.CSSProperties = {
    display: "flex", gap: 10,
    position: "sticky", bottom: 0,
    backgroundColor: "#ffffff",
    paddingTop: 12, marginTop: -4,
    boxShadow: "0 -8px 12px -8px rgba(28,25,23,0.18)",
  };

  const renderNotesField = (placeholder: string) => (
    <div>
      <label style={{ display: "block", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#746e69", marginBottom: 8 }}>
        Observação <span style={{ color: "#746e69", textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>(opcional)</span>
      </label>
      <textarea
        value={modalNotes}
        onChange={e => setModalNotes(e.target.value)}
        placeholder={placeholder}
        rows={2}
        data-testid="input-notes"
        style={{ width: "100%", padding: "10px 14px", backgroundColor: "#e8e8e7", border: "1px solid transparent", borderRadius: 8, fontSize: 13, color: TI.text, resize: "vertical", fontFamily: "inherit" }}
      />
    </div>
  );

  const openProductionModal = (item: any) => {
    setSelectedItem(item);
    setModalType("production");
    // O que já foi reaproveitado não precisa ser produzido de novo.
    setProductionData({ quantityProduced: qtyOf(item) - reusedOf(item) });
  };

  // Exporta a lista visível. Manda os ids em vez de repetir os filtros no
  // servidor — o arquivo sai idêntico ao que está na tela.
  const handleExportXlsx = async () => {
    if (!filteredItems.length) return;
    setIsExporting(true);
    try {
      const statusNames = statusFilter.map(s => getStatusLabel(s));
      const title = statusNames.length
        ? `Produção — ${statusNames.join(", ")}`
        : "Produção — Gráfica";

      const res = await fetch("/api/items/export-xlsx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ itemIds: filteredItems.map((i: any) => i.id), title }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Falha ao gerar o arquivo");

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${title}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (error: any) {
      toast({ title: "Erro ao exportar", description: error.message, variant: "destructive" });
    } finally {
      setIsExporting(false);
    }
  };

  const openConferenceModal = (item: any) => {
    setSelectedItem(item);
    setModalType("conference");
    setPhotos([]); setModalNotes("");
    setConferQty(remainingConfer(item)); // padrão: o que falta conferir
  };

  const openDeliveryModal = (item: any) => {
    setSelectedItem(item);
    setModalType("delivery");
    setPhotos([]); setModalNotes("");
    setDeliveryData({ receivedBy: "" });
    setDeliverQty(remainingDeliver(item)); // padrão: o que falta entregar
  };

  // Items que podem ser entregues no filtro atual
  const deliverableInFilter = useMemo(
    () => (filteredItems as any[]).filter(i => canDeliver(i)),
    [filteredItems],
  );
  // Conferíveis no filtro atual (para o modo conferência em lote)
  const conferableInFilter = useMemo(
    () => (filteredItems as any[]).filter(i => canConfer(i)),
    [filteredItems],
  );
  // Um modo de lote por vez; a lista elegível depende do modo ativo.
  const bulkOn = bulkDeliveryMode || bulkConferMode;
  const bulkEligibleList = bulkConferMode ? conferableInFilter : deliverableInFilter;
  const allDeliverableSelected =
    bulkEligibleList.length > 0 && bulkEligibleList.every((i: any) => bulkSelectedIds.has(i.id));

  const toggleBulkItem = (id: string) =>
    setBulkSelectedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  // Peças do lote resolvidas na lista COMPLETA (para os dialogs de lote).
  const bulkSelectedItems = useMemo(
    () => Array.from(bulkSelectedIds).map(id => (items as any[]).find(i => i.id === id)).filter(Boolean) as any[],
    [bulkSelectedIds, items],
  );

  const bulkConfirmRef = useRef<HTMLButtonElement>(null);

  // Ao entrar num modo de lote o foco vai para o Confirmar da barra fixa —
  // sem isso, teclado e leitor de tela ficavam perdidos no meio da tabela.
  useEffect(() => {
    if (bulkOn) bulkConfirmRef.current?.focus();
  }, [bulkOn]);

  // Filtros podem mudar com o lote ativo: poda a seleção para manter apenas
  // ids visíveis e elegíveis — evita confirmar peça que não está mais na tela.
  useEffect(() => {
    if (!bulkOn) return;
    setBulkSelectedIds(prev => {
      const eligible = new Set(bulkEligibleList.map((i: any) => i.id));
      const next = new Set(Array.from(prev).filter(id => eligible.has(id)));
      return next.size === prev.size ? prev : next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bulkOn, bulkEligibleList]);

  // Escape sai do modo lote — mas não quando há dialog aberto: o Escape do
  // dialog fecha o dialog, e o estado ainda aponta "aberto" quando este
  // handler roda, então os dois não conflitam.
  useEffect(() => {
    if (!bulkOn) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (bulkDeliveryOpen || bulkConferOpen || viewDetailsItem || selectedItem) return;
      setBulkDeliveryMode(false);
      setBulkConferMode(false);
      setBulkSelectedIds(new Set());
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [bulkOn, bulkDeliveryOpen, bulkConferOpen, viewDetailsItem, selectedItem]);

  // Conferência em lote: mesma disciplina da entrega (allSettled + tolerância a
  // falha parcial). Foto é obrigatória (regra do servidor); a primeira vira o
  // conferencePhotoUrl de cada peça e todas entram na galeria (kind conference).
  const handleBulkConference = async () => {
    if (isBulkSubmitting) return; // Enter repetido no dialog disparava o lote 2x
    if (bulkConferPhotos.length === 0) {
      toast({ title: "Foto obrigatória", description: "Envie ao menos uma foto da conferência.", variant: "destructive" });
      return;
    }
    setIsBulkSubmitting(true);
    // Busca cada peça na lista COMPLETA (items) — buscar em filteredItems fazia
    // a peça "sumir" quando o filtro mudava com o lote aberto, e o fallback
    // qty: 1 registrava conferência de 1 unidade em vez do restante real.
    // Peça não encontrada SAI do lote em vez de ir com quantidade chutada.
    const entries = Array.from(bulkSelectedIds)
      .map(id => (items as any[]).find(i => i.id === id))
      .filter(Boolean) as any[];
    const ids = entries.map(i => i.id);
    try {
      const confer = await Promise.allSettled(entries.map(item =>
        apiRequest("POST", `/api/items/${item.id}/confer`, {
          conferencePhotoUrl: bulkConferPhotos[0],
          qty: remainingConfer(item),
          notes: bulkConferNotes || null,
        })
      ));

      const okIds = ids.filter((_, i) => confer[i].status === "fulfilled");
      const failedIds = ids.filter((_, i) => confer[i].status === "rejected");
      const failed = failedIds.length;

      let photoFailed = 0;
      if (okIds.length > 0) {
        const photos = await Promise.allSettled(
          okIds.flatMap(itemId =>
            bulkConferPhotos.map(photoUrl =>
              apiRequest("POST", `/api/items/${itemId}/photos`, {
                photoUrl, kind: "conference", uploadedBy: getCurrentUserName(),
              })
            )
          )
        );
        photoFailed = photos.filter(p => p.status === "rejected").length;
      }

      queryClient.invalidateQueries({ queryKey: ["/api/items/approved"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });

      if (failed > 0) {
        toast({
          title: "Conferência parcial",
          description: `${okIds.length} de ${ids.length} conferida(s). ${failed} falhou(aram) e continua(m) na lista.`,
          variant: "destructive",
        });
      } else if (photoFailed > 0) {
        toast({
          title: `${okIds.length} peça(s) conferida(s)`,
          description: "A conferência foi registrada, mas parte das fotos não pôde ser anexada.",
          variant: "destructive",
        });
      } else {
        toast({ title: `${okIds.length} peça(s) conferida(s)`, description: "Prontas para entrega." });
      }

      setBulkConferOpen(false);
      if (failed > 0) {
        // O toast promete que as peças que falharam "continuam na lista":
        // mantém o modo ativo com SÓ elas selecionadas (e a foto/notas para
        // reenviar), em vez de zerar a seleção.
        setBulkSelectedIds(new Set(failedIds));
      } else {
        setBulkConferMode(false);
        setBulkSelectedIds(new Set());
        setBulkConferNotes("");
        setBulkConferPhotos([]);
      }
    } catch (e: any) {
      // Mesmas chaves do fluxo feliz — invalidar só /approved deixava as
      // outras telas com o cache velho.
      queryClient.invalidateQueries({ queryKey: ["/api/items/approved"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      toast({ title: "Erro na conferência em lote", description: e.message, variant: "destructive" });
    } finally {
      setIsBulkSubmitting(false);
    }
  };

  const handleBulkDelivery = async () => {
    if (isBulkSubmitting) return; // Enter repetido no dialog disparava o lote 2x
    if (!bulkReceivedBy.trim()) {
      toast({ title: "Campo obrigatório", description: "Informe quem recebeu o material", variant: "destructive" });
      return;
    }
    setIsBulkSubmitting(true);
    // Mesma regra da conferência em lote: resolve na lista COMPLETA (items) e
    // exclui do lote a peça não encontrada — nunca entrega "1" por fallback.
    const entries = Array.from(bulkSelectedIds)
      .map(id => (items as any[]).find(i => i.id === id))
      .filter(Boolean) as any[];
    const ids = entries.map(i => i.id);
    try {
      // allSettled, não all: com Promise.all a primeira falha rejeitava, mas as
      // demais requisições já tinham sido enviadas e concluíam. A tela mostrava
      // "erro na entrega em lote" enquanto as peças apareciam como entregues.
      const delivery = await Promise.allSettled(entries.map(item =>
        apiRequest("PATCH", `/api/items/${item.id}/deliver`, {
          receivedBy: bulkReceivedBy.trim(),
          // O comprovante vai também na entrega (vira deliveryPhotoUrl e
          // aparece na timeline) — antes só entrava na galeria.
          photoUrl: bulkDeliveryPhotos[0] || null,
          qty: remainingDeliver(item),
          notes: bulkDeliveryNotes || null,
        })
      ));

      // Só anexa a foto nas peças cuja entrega passou.
      const deliveredIds = ids.filter((_, i) => delivery[i].status === "fulfilled");
      const failedIds = ids.filter((_, i) => delivery[i].status === "rejected");
      const failed = failedIds.length;

      let photoFailed = 0;
      if (bulkDeliveryPhotos.length > 0 && deliveredIds.length > 0) {
        const photos = await Promise.allSettled(
          deliveredIds.flatMap(itemId =>
            bulkDeliveryPhotos.map(photoUrl =>
              // uploadedBy é NOT NULL no banco: sem ele o insert falhava, a foto
              // não era gravada (por isso não aparecia no card nem em Registros)
              // e o erro derrubava o lote inteiro.
              apiRequest("POST", `/api/items/${itemId}/photos`, {
                photoUrl, kind: "delivery", uploadedBy: getCurrentUserName(),
              })
            )
          )
        );
        photoFailed = photos.filter(p => p.status === "rejected").length;
      }

      // Invalida sempre — mesmo com falha parcial a lista precisa refletir o
      // que de fato foi entregue.
      queryClient.invalidateQueries({ queryKey: ["/api/items/approved"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });

      if (failed > 0) {
        toast({
          title: "Entrega parcial",
          description: `${deliveredIds.length} de ${ids.length} entregue(s). ${failed} falhou(aram) e continua(m) na lista.`,
          variant: "destructive",
        });
      } else if (photoFailed > 0) {
        toast({
          title: `${deliveredIds.length} peça(s) entregue(s)`,
          description: "A entrega foi registrada, mas o comprovante não pôde ser anexado.",
          variant: "destructive",
        });
      } else {
        toast({ title: `${deliveredIds.length} peça(s) entregue(s)`, description: `Recebido por: ${bulkReceivedBy}` });
      }

      setBulkDeliveryOpen(false);
      if (failed > 0) {
        // O toast promete que as peças que falharam "continuam na lista":
        // mantém o modo ativo com SÓ elas selecionadas (e responsável/foto
        // preservados para reenviar), em vez de zerar a seleção.
        setBulkSelectedIds(new Set(failedIds));
      } else {
        setBulkDeliveryMode(false);
        setBulkSelectedIds(new Set());
        setBulkReceivedBy("");
        setBulkDeliveryNotes("");
        setBulkDeliveryPhotos([]);
      }
    } catch (e: any) {
      // Mesmas chaves do fluxo feliz — invalidar só /approved deixava as
      // outras telas com o cache velho.
      queryClient.invalidateQueries({ queryKey: ["/api/items/approved"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      toast({ title: "Erro na entrega em lote", description: e.message, variant: "destructive" });
    } finally {
      setIsBulkSubmitting(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: isMobile ? 12 : 24, padding: isMobile ? "12px 12px" : 24, paddingBottom: bulkOn ? 80 : isMobile ? 12 : 24, backgroundColor: TI.bg, height: "100%", overflowY: "auto" }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: isMobile ? "center" : "flex-end", flexWrap: "wrap", gap: 8 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: isMobile ? 19 : 26, fontWeight: 900, fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "-0.03em", textTransform: "uppercase", color: TI.text }} data-testid="title-grafica">
            Gráfica
          </h1>
          {!isMobile && (
            <p style={{ margin: "4px 0 0", fontSize: 13, color: TI.secondary }}>
              Gestão de ativos gráficos em tempo real
            </p>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {/* Chip de complementos — clicável e visível TAMBÉM no celular (o
              chip de "aguardando produção" ao lado é !isMobile; este é
              importante demais para sumir justamente na tela de quem está no
              galpão). É o atalho para a fila de aumentos sem tirar a peça do
              bloco do evento a que ela pertence. */}
          {(complementosAbertos.length > 0 || complementFilter) && (
            <button
              onClick={() => setComplementFilter(v => !v)}
              aria-pressed={complementFilter}
              data-testid="chip-complementos"
              title={complementFilter
                ? "Mostrando só complementos — toque para ver a lista inteira"
                : "Mostrar só as peças complementares (aumentos de quantidade pedidos após a produção)"}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                backgroundColor: complementFilter ? CO.hoverBg : CO.bg,
                color: CO.text,
                border: `1px solid ${complementFilter ? CO.stripe : CO.border}`,
                borderRadius: 999, padding: isMobile ? "7px 12px" : "5px 11px",
                fontSize: 11, fontWeight: 700, cursor: "pointer",
                whiteSpace: "nowrap", transition: "background-color 0.15s",
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: CO.stripe, display: "inline-block", flexShrink: 0 }} />
              {complementoChipLabel}
            </button>
          )}
          {!isMobile && stats.liberados > 0 && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, backgroundColor: "#fff7ed", color: "#c2410c", border: "1px solid #fed7aa", borderRadius: 6, padding: "6px 12px", fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: "#f97316", display: "inline-block" }} />
              {stats.liberados} peça{stats.liberados !== 1 ? "s" : ""} aguardando produção
            </span>
          )}
          {/* Botão Conferência em Lote — só para quem pode conferir (gate do servidor) */}
          {canProduce && conferableInFilter.length > 0 && !bulkOn && (
            <button
              onClick={() => { setBulkConferMode(true); setBulkSelectedIds(new Set()); }}
              data-testid="button-bulk-confer"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                backgroundColor: '#0e7490', color: '#fff',
                border: 'none', borderRadius: 8, padding: isMobile ? '11px 16px' : '8px 14px',
                fontSize: isMobile ? 13 : 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em',
                cursor: 'pointer', boxShadow: '0 2px 8px rgba(14,116,144,0.3)',
              }}
            >
              <CheckCircle style={{ width: isMobile ? 16 : 14, height: isMobile ? 16 : 14 }} />
              {isMobile ? `Conferir em lote (${conferableInFilter.length})` : `Conferência em Lote (${conferableInFilter.length})`}
            </button>
          )}
          {bulkConferMode && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#ecfeff', color: '#0e7490', border: '1.5px solid #a5f3fc', borderRadius: 8, padding: '7px 12px', fontSize: 11, fontWeight: 800 }}>
              <CheckCircle style={{ width: 13, height: 13 }} />
              {isMobile ? 'Lote ativo' : 'Modo conferência em lote ativo'}
            </span>
          )}
          {/* Botão Entrega em Lote */}
          {deliverableInFilter.length > 0 && !bulkOn && (
            <button
              onClick={() => { setBulkDeliveryMode(true); setBulkSelectedIds(new Set()); }}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                // #c2410c (orange-700): branco sobre #f97316 dava ~2.8:1 (reprova AA)
                backgroundColor: '#c2410c', color: '#fff',
                border: 'none', borderRadius: 8, padding: isMobile ? '11px 16px' : '8px 14px',
                fontSize: isMobile ? 13 : 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em',
                cursor: 'pointer', boxShadow: '0 2px 8px rgba(194,65,12,0.35)',
              }}
            >
              <ListChecks style={{ width: isMobile ? 16 : 14, height: isMobile ? 16 : 14 }} />
              {isMobile ? `Entregar em lote (${deliverableInFilter.length})` : `Entrega em Lote (${deliverableInFilter.length})`}
            </button>
          )}
          {bulkDeliveryMode && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#fff7ed', color: '#c2410c', border: '1.5px solid #fed7aa', borderRadius: 8, padding: '7px 12px', fontSize: 11, fontWeight: 800 }}>
              <ListChecks style={{ width: 13, height: 13 }} />
              {isMobile ? 'Lote ativo' : 'Modo entrega em lote ativo'}
            </span>
          )}
          {/* Exportar Excel — é só um download, funciona igualmente no celular */}
          <button
            onClick={handleExportXlsx}
            disabled={isExporting || filteredItems.length === 0}
            data-testid="button-export-xlsx"
            title={filteredItems.length ? `Exportar ${filteredItems.length} peça(s) em Excel` : "Nada para exportar"}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              backgroundColor: TI.surface, color: TI.text,
              border: `1px solid ${TI.border}`, borderRadius: 6, padding: isMobile ? "10px 14px" : "7px 14px",
              fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em",
              cursor: (isExporting || filteredItems.length === 0) ? "not-allowed" : "pointer",
              opacity: (isExporting || filteredItems.length === 0) ? 0.5 : 1,
            }}
          >
            <FileSpreadsheet style={{ width: 13, height: 13 }} />
            {isExporting ? "Gerando…" : `Exportar Excel${filteredItems.length ? ` (${filteredItems.length})` : ""}`}
          </button>
        </div>
      </div>

      {/* ── KPI Strip ── */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(3, 1fr)" : "repeat(5, 1fr)", gap: isMobile ? 6 : 12 }}>
        {[
          // O KPI Liberados agrega dois status; ele seleciona os DOIS valores
          // no filtro (o filtro em si é estrito — ver matchesFilters).
          { label: "Liberados",    value: stats.liberados,  sub: "Aguard. produção", testId: "stat-approved",   filterVals: ["ready_for_production", "approved"] },
          { label: "Em Produção",  value: stats.emProducao, sub: "Ativo",            testId: "stat-production", filterVals: ["inProduction"] },
          { label: "Produzidos",   value: stats.produzidos, sub: "Ag. conferência",  testId: "stat-produced",   filterVals: ["produced"] },
          { label: "Conferidos",   value: stats.conferidos, sub: "Ag. entrega",      testId: "stat-conferred",  filterVals: ["conferred"] },
          { label: "Entregues",    value: stats.entregues,  sub: "Concluído",        testId: "stat-delivered",  filterVals: ["delivered"] },
        ].map(kpi => {
          const isActive = kpi.filterVals.every(v => statusFilter.includes(v)) && statusFilter.length === kpi.filterVals.length;
          // Cores derivadas do MESMO mapa dos pills (lib/status): dot para a
          // borda, text (tom 700, AA) para o número e para o fundo ativo.
          // Antes cada card tinha hex próprio — "Entregues" saía com borda azul
          // e número verde enquanto o pill era emerald; e o fundo ativo laranja
          // (#f97316) reprovava contraste com o texto branco.
          const m = getStatusMeta(kpi.filterVals[0]);
          return (
            /* Os KPIs são o filtro principal desta tela: clicar num deles é
               como se filtra por status. Eram <div> com onClick, então quem
               navega por teclado não conseguia filtrar de jeito nenhum.
               aria-pressed comunica qual está ativo — que hoje só a cor diz. */
            <div
              key={kpi.label}
              role="button"
              tabIndex={0}
              aria-pressed={isActive}
              aria-label={`Filtrar por ${kpi.label}`}
              onClick={() => setStatusFilter(isActive ? [] : kpi.filterVals)}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setStatusFilter(isActive ? [] : kpi.filterVals);
                }
              }}
              data-testid={kpi.testId}
              style={{
                backgroundColor: isActive ? m.text : TI.surface,
                borderLeft: `4px solid ${m.dot}`,
                borderRadius: 8,
                padding: isMobile ? "10px 10px" : "16px 18px",
                // Anel do estado ativo em boxShadow — o outline fica livre para
                // o anel de foco do navegador ("2px solid transparent" quando
                // inativo suprimia o foco de quem navega por teclado).
                boxShadow: isActive ? `0 4px 16px ${m.dot}33, 0 0 0 2px ${m.dot}` : "0 1px 4px rgba(0,0,0,0.06)",
                cursor: "pointer",
                transition: "all 0.15s",
              }}
              onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLDivElement).style.backgroundColor = `${m.dot}0f`; }}
              onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLDivElement).style.backgroundColor = TI.surface; }}
            >
              <div style={{ fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.06em", color: isActive ? "rgba(255,255,255,0.75)" : TI.secondary, marginBottom: isMobile ? 3 : 6, fontFamily: "'Space Grotesk', sans-serif", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{kpi.label}</div>
              <div style={{ fontSize: isMobile ? 22 : 32, fontWeight: 900, letterSpacing: "-0.03em", fontFamily: "'Space Grotesk', sans-serif", color: isActive ? "#ffffff" : m.text, lineHeight: 1 }}>{kpi.value}</div>
              {!isMobile && <div style={{ fontSize: 11, color: isActive ? "rgba(255,255,255,0.7)" : TI.secondary, marginTop: 4 }}>{isActive ? "Clique para limpar" : kpi.sub}</div>}
            </div>
          );
        })}
        {/* Total — dark card, clica para resetar */}
        <div
          role="button"
          tabIndex={0}
          aria-pressed={statusFilter.length === 0}
          aria-label="Mostrar todos os status"
          onClick={() => setStatusFilter([])}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setStatusFilter([]); }
          }}
          data-testid="stat-total"
          style={{
            backgroundColor: TI.text, borderLeft: `4px solid ${TI.accent}`, borderRadius: 8,
            padding: isMobile ? "10px 10px" : "16px 18px",
            // Estado ativo em boxShadow, outline livre para o foco (ver KPIs).
            boxShadow: statusFilter.length === 0 ? `0 4px 16px rgba(0,0,0,0.14), 0 0 0 2px ${TI.accent}` : "0 4px 16px rgba(0,0,0,0.14)",
            cursor: "pointer", transition: "opacity 0.15s",
          }}
          onMouseEnter={e => ((e.currentTarget as HTMLDivElement).style.opacity = "0.85")}
          onMouseLeave={e => ((e.currentTarget as HTMLDivElement).style.opacity = "1")}
        >
          <div style={{ fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.06em", color: "rgba(255,255,255,0.72)", marginBottom: isMobile ? 3 : 6, fontFamily: "'Space Grotesk', sans-serif" }}>Total</div>
          <div style={{ fontSize: isMobile ? 22 : 32, fontWeight: 900, letterSpacing: "-0.03em", fontFamily: "'Space Grotesk', sans-serif", color: "#ffffff", lineHeight: 1 }}>{stats.total}</div>
          {!isMobile && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.72)", marginTop: 4 }}>{statusFilter.length === 0 ? "Todos selecionados" : "Ver todos"}</div>}
        </div>
      </div>

      {/* ── Filters Bar ── */}
      <div style={{ backgroundColor: "#f3f4f3", borderRadius: 12, padding: "12px 14px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        {/* Search */}
        <div style={{ position: "relative", flex: "1", minWidth: 200 }}>
          <Search style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", width: 14, height: 14, color: TI.muted }} />
          <input
            type="text"
            placeholder="Buscar por ID, descrição ou evento..."
            aria-label="Buscar peças"
            value={searchFilter}
            onChange={e => setSearchFilter(e.target.value)}
            data-testid="input-search-filter"
            style={{ width: "100%", paddingLeft: 32, paddingRight: 12, paddingTop: 8, paddingBottom: 8, backgroundColor: "#e8e8e7", border: "none", borderRadius: 6, fontSize: 13, color: TI.text, boxSizing: "border-box" }}
          />
        </div>

        {/* Event */}
        <EventFilterDropdown
          values={eventFilter}
          onValuesChange={setEventFilter}
          options={eventFilterOptions}
        />

        {/* Status */}
        <FilterSelect
          showAllLabelWhenEmpty hideWhenEmpty={false}
          label="Status" allLabel="Todos os status"
          values={statusFilter} onValuesChange={setStatusFilter}
          options={[
            { value: "ready_for_production", label: "Pronto p/ Produção", pinned: true },
            { value: "approved", label: "Liberados", pinned: true },
            { value: "inProduction", label: "Em Produção", pinned: true },
            { value: "produced", label: "Produzidos", pinned: true },
            { value: "conferred", label: "Conferidos", pinned: true },
            { value: "delivered", label: "Entregues", pinned: true },
          ]}
          searchPlaceholder="Buscar status..." emptyText="Nenhum status encontrado."
          testId="select-status-filter"
          triggerStyle={{ backgroundColor: "#e8e8e7", border: "none", borderRadius: 6, fontSize: 13, color: TI.text }}
        />

        {/* Grupo e Percurso — pedido da Gráfica, na barra principal (e não nos
            avançados) porque é com eles que a fila de placas é separada antes
            de montar um lote. hideWhenEmpty padrão: só aparecem quando o
            recorte tem grupo cadastrado / placa com percurso no texto. */}
        <FilterSelect
          showAllLabelWhenEmpty
          label="Grupo" allLabel="Todos os grupos"
          values={groupFilter} onValuesChange={setGroupFilter}
          options={groupFilterOptions}
          searchPlaceholder="Buscar grupo..." emptyText="Nenhum grupo encontrado."
          testId="select-group-filter"
          triggerStyle={{ backgroundColor: "#e8e8e7", border: "none", borderRadius: 6, fontSize: 13, color: TI.text }}
        />

        <FilterSelect
          showAllLabelWhenEmpty
          label="Percurso" allLabel="Todos os percursos"
          values={percursoFilter} onValuesChange={setPercursoFilter}
          options={percursoFilterOptions}
          searchPlaceholder="Buscar percurso..." emptyText="Nenhum percurso encontrado."
          testId="select-percurso-filter"
          triggerStyle={{ backgroundColor: "#e8e8e7", border: "none", borderRadius: 6, fontSize: 13, color: TI.text }}
        />

        {/* Mês */}
        <FilterSelect
          showAllLabelWhenEmpty hideWhenEmpty={false}
          label="Mês" allLabel={months.find(m => m.value === "all")?.label || "Todos os meses"}
          values={monthFilter} onValuesChange={setMonthFilter}
          options={months.filter(m => m.value !== "all").map(m => ({ value: m.value, label: m.label, pinned: true }))}
          searchPlaceholder="Buscar mês..." emptyText="Nenhum mês encontrado."
          testId="select-month-filter"
          triggerStyle={{ backgroundColor: "#e8e8e7", border: "none", borderRadius: 6, fontSize: 13, color: TI.text }}
        />

        {/* Toggle Próximos 10 dias — rótulo + trilho num único alvo de toque
            (≥44px): antes só o trilho de 38×20 era clicável. */}
        <div style={{ borderLeft: `1px solid ${TI.border}`, paddingLeft: 12, marginLeft: 4 }}>
          <button
            role="switch"
            aria-checked={next10DaysFilter}
            onClick={() => setNext10DaysFilter(v => !v)}
            data-testid="button-next-10-days-filter"
            style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 44, background: "none", border: "none", padding: 0, cursor: "pointer" }}
          >
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: TI.secondary, whiteSpace: "nowrap" }}>Próximos 10 dias</span>
            <span style={{
              width: 38, height: 20, borderRadius: 999, position: "relative", flexShrink: 0, display: "inline-block",
              backgroundColor: next10DaysFilter ? TI.accent : "#d6d3d1", transition: "background-color 0.2s",
            }}>
              <span style={{
                position: "absolute", top: 3, width: 14, height: 14, borderRadius: "50%",
                backgroundColor: "#ffffff", transition: "left 0.2s",
                left: next10DaysFilter ? 20 : 3,
              }} />
            </span>
          </button>
        </div>

        {/* Filtros Avançados */}
        <button
          onClick={() => setShowAdvancedFilters(v => !v)}
          data-testid="button-toggle-advanced-filters"
          style={{ display: "flex", alignItems: "center", gap: 5, backgroundColor: showAdvancedFilters ? TI.text : "transparent", color: showAdvancedFilters ? "#ffffff" : TI.secondary, border: `1px solid ${showAdvancedFilters ? TI.text : TI.border}`, borderRadius: 6, padding: "7px 12px", fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "all 0.15s" }}
        >
          <Filter style={{ width: 13, height: 13 }} />
          Filtros
          <ChevronDown style={{ width: 12, height: 12, transform: showAdvancedFilters ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }} />
        </button>

        {/* Avançados */}
        {showAdvancedFilters && (
          <div style={{ width: "100%", display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", gap: 8, borderTop: `1px solid ${TI.border}`, paddingTop: 10, marginTop: 2 }}>
            {[
              { label: "Tipo", allLabel: "Todos os tipos", values: typeFilter, onValuesChange: setTypeFilter, options: typeFilterOptions, testId: "select-type-filter" },
              { label: "Material", allLabel: "Todos os materiais", values: materialFilter, onValuesChange: setMaterialFilter, options: materialFilterOptions, testId: "select-material-filter" },
              { label: "Acabamento", allLabel: "Todos os acabamentos", values: finishFilter, onValuesChange: setFinishFilter, options: finishFilterOptions, testId: "select-finish-filter" },
            ].map(f => (
              <FilterSelect
                key={f.label}
                fullWidth showAllLabelWhenEmpty hideWhenEmpty={false}
                label={f.label} allLabel={f.allLabel}
                values={f.values} onValuesChange={f.onValuesChange}
                options={f.options}
                searchPlaceholder={`Buscar ${f.label.toLowerCase()}...`}
                emptyText="Nada encontrado."
                testId={f.testId}
                triggerStyle={{ backgroundColor: "#e8e8e7", border: "none", fontSize: 13, color: TI.text }}
              />
            ))}
            {(typeFilter.length > 0 || materialFilter.length > 0 || finishFilter.length > 0) && (
              <div style={{ gridColumn: "1 / -1" }}>
                <button onClick={() => { setTypeFilter([]); setMaterialFilter([]); setFinishFilter([]); }} data-testid="button-reset-advanced-filters" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#dc2626", fontWeight: 600 }}>
                  Limpar filtros avançados
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Tabela Principal ── */}
      <div style={{ backgroundColor: TI.surface, border: `1px solid ${TI.border}`, borderRadius: 12 }}>
        {/* Rede de segurança do recorte. A peça-filha pode nascer FORA dos
            filtros do operador (status, busca, grupo, percurso, evento, chip de
            complementos): aí a rolagem falharia em silêncio, o pior desfecho
            possível logo depois de um clique. O recorte NUNCA é limpo sozinho —
            só por este botão, quando a pessoa pedir. */}
        {bannerComplemento && (
          <div
            role="status"
            data-testid="banner-complemento-fora-do-recorte"
            style={{ background: CO.bg, border: `1px solid ${CO.border}`, borderRadius: 10, padding: "10px 12px", margin: "12px 12px 0", fontSize: 12, color: CO.textStrong, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}
          >
            <span style={{ flex: 1, minWidth: 0, lineHeight: 1.45 }}>
              <strong>{bannerComplemento.displayId} criado</strong> — está fora dos filtros atuais.
            </span>
            <button
              type="button"
              onClick={mostrarComplementoCriado}
              data-testid="button-mostrar-complemento"
              style={{ background: "none", border: "none", padding: "0 4px", minHeight: isMobile ? 44 : 24, fontSize: 11, fontWeight: 800, color: CO.text, textDecoration: "underline", cursor: "pointer", flexShrink: 0 }}
            >
              Mostrar
            </button>
            <button
              type="button"
              onClick={() => setBannerComplemento(null)}
              aria-label="Dispensar"
              data-testid="button-dispensar-banner-complemento"
              style={{ background: "none", border: "none", padding: 0, width: isMobile ? 44 : 24, height: isMobile ? 44 : 24, display: "flex", alignItems: "center", justifyContent: "center", color: CO.text, cursor: "pointer", flexShrink: 0 }}
            >
              <X aria-hidden="true" style={{ width: 14, height: 14 }} />
            </button>
          </div>
        )}
        {isLoading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 48 }}>
            <div style={{ width: 32, height: 32, border: `3px solid ${TI.border}`, borderTopColor: TI.accent, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
          </div>
        ) : isError ? (
          <div style={{ textAlign: "center", padding: "48px 24px" }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#b91c1c", marginBottom: 4 }}>
              {migracaoPendente ? "Atualização do banco pendente" : "Não foi possível carregar as peças"}
            </div>
            <div style={{ fontSize: 13, color: TI.secondary, marginBottom: 16 }}>
              {migracaoPendente
                ? "Falta rodar a atualização do banco (npm run db:push) para o recurso de aumento de quantidade. Fale com o administrador."
                : "Verifique sua conexão e tente novamente."}
            </div>
            <button onClick={() => refetch()} style={{ background: TI.text, color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Tentar novamente</button>
          </div>
        ) : filteredItems.length === 0 ? (
          (() => {
            // Mensagem conforme o motivo: com filtro ativo o problema é o
            // recorte; sem filtro é a fila que está vazia mesmo — "ajuste os
            // filtros" sem filtro nenhum só confundia.
            const hasActiveFilters = !!searchFilter || statusFilter.length > 0 || eventFilter.length > 0 ||
              typeFilter.length > 0 || materialFilter.length > 0 || finishFilter.length > 0 ||
              groupFilter.length > 0 || percursoFilter.length > 0 || complementFilter ||
              next10DaysFilter || monthFilter.length > 0;
            return (
              <div style={{ textAlign: "center", padding: "48px 24px", color: TI.secondary }}>
                <Package style={{ width: 40, height: 40, margin: "0 auto 12px", color: TI.secondary }} />
                <div style={{ fontSize: 15, fontWeight: 700, color: TI.secondary, marginBottom: 4 }}>
                  {hasActiveFilters ? "Nenhuma peça encontrada" : "Nenhuma peça liberada ainda"}
                </div>
                <div style={{ fontSize: 13 }}>
                  {hasActiveFilters ? "Ajuste os filtros para visualizar itens" : "Quando a Arte liberar peças para produção, elas aparecem aqui"}
                </div>
              </div>
            );
          })()
        ) : isMobile ? (
          /* ── View mobile: cards ── */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '8px 8px' }}>
            {(filteredItems as any[]).map((item: any, index: number) => {
              const prev = index > 0 ? (filteredItems as any[])[index - 1] : null;
              const showEvHeader = !prev || prev.event?.name !== item.event?.name;
              const isSelected = bulkSelectedIds.has(item.id);
              const canDeliverItem = canDeliver(item);
              const canConferItem = canConfer(item);
              const bulkEligible = bulkDeliveryMode ? canDeliverItem : bulkConferMode ? canConferItem : false;
              // ── Complemento: os mesmos três números do desktop ──
              const ehComplemento = isComplement(item);
              const coAberto = complementOpen(item);
              const maeDisplayId = ehComplemento ? parentDisplayIdOf(item) : "";
              const complQty = complementsQtyOf(item); // > 0 → esta é a MÃE
              const isNovo = item.id === novoComplementoId;
              // Trilho de ações: dois grupos separados por um divisor. FLUXO
              // (sólidos, o que a Gráfica faz com a peça) e CONTRATO (tintados,
              // o que muda o pedido — papel admin|solicitacao).
              const mostraAumentar = !bulkOn && podeAumentarQuantidade(item, podeMexerQtd);
              const podeProduzirAqui = canProduce && coAberto && !isProduced(item) && !isConferred(item) && !item.isReuse && remainingProduce(item) > 0;
              const podeCancelarCompl = podeMexerQtd && ehComplemento && complementUntouched(item);
              const temGrupoFluxo = podeProduzirAqui || canDeliverItem || (canProduce && canConferItem) || isDelivered(item);
              const temGrupoContrato = mostraAumentar || podeCancelarCompl;

              return (
                <Fragment key={item.id}>
                  {showEvHeader && (
                    <div style={{ padding: '8px 8px 6px', marginTop: index > 0 ? 6 : 0, background: TI.text, borderRadius: '8px 8px 0 0', display: 'flex', flexDirection: 'column', gap: 5 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Package style={{ width: 13, height: 13, color: TI.accent }} />
                        <span style={{ fontSize: 11, fontWeight: 800, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: "'Space Grotesk', sans-serif" }}>
                          {item.event?.name || 'Sem Evento'}
                        </span>
                        {/* A data aqui era o INÍCIO do evento — para a Gráfica o
                            que manda é a SAÍDA do caminhão, a mesma que ordena
                            a lista e o cabeçalho do desktop. */}
                        {item.event?.truckDepartureDate && (
                          <span style={{ marginLeft: 'auto', fontSize: 10, color: 'rgba(255,255,255,0.72)', display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
                            <Truck style={{ width: 10, height: 10 }} />
                            Saída {new Date(item.event.truckDepartureDate).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: 'UTC' })}
                          </span>
                        )}
                      </div>
                      {item.event && <DeadlineChip event={item.event} />}
                    </div>
                  )}
                  <div
                    style={{
                      // Altura acompanha a arte: com a peça na mão, é pelo
                      // desenho que se reconhece o item na lista.
                      display: 'flex', alignItems: 'stretch',
                      minHeight: item.approvalThumbUrl ? 104 : 74,
                      // Complemento em aberto tinge o card inteiro — no celular
                      // não há coluna nenhuma para carregar o sinal, e é no
                      // celular que a Gráfica trabalha com a peça na mão.
                      background: isNovo ? CO.hoverBg : isSelected ? CO.hoverBg : coAberto ? CO.bg : '#fff',
                      border: `1.5px solid ${isSelected ? TI.accent : (isNovo || coAberto) ? CO.border : TI.border}`,
                      // Realce de 5 s da peça recém-criada: no card o anel é
                      // caminho livre (a tabela é que não pinta boxShadow).
                      boxShadow: isNovo ? '0 0 0 3px rgba(249,115,22,0.45)' : undefined,
                      borderRadius: showEvHeader ? '0 0 12px 12px' : 12,
                      overflow: 'hidden',
                      cursor: bulkOn ? (bulkEligible ? 'pointer' : undefined) : 'pointer',
                      transition: 'border-color 0.12s, background 0.12s',
                    }}
                    data-item-row={item.id}
                    /* O "checkbox" da esquerda é um <div> desenhado, não um
                       campo: em modo de entrega em lote não havia como marcar
                       peça alguma sem mouse. role/aria-checked dão ao card o
                       papel que a caixinha só aparenta ter. */
                    {...(bulkOn && bulkEligible ? {
                      role: 'checkbox' as const,
                      tabIndex: 0,
                      'aria-checked': isSelected,
                      'aria-label': `Selecionar ${item.displayId} para ${bulkConferMode ? 'conferência' : 'entrega'}`,
                      onKeyDown: (e: React.KeyboardEvent) => {
                        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleBulkItem(item.id); }
                      },
                    } : {})}
                    // Fora do modo lote o toque no corpo do card abre o detalhe
                    // — o ramo mobile não tinha NENHUM caminho até ele (a arte
                    // e os botões de ação já fazem stopPropagation).
                    onClick={bulkOn
                      ? (bulkEligible ? () => toggleBulkItem(item.id) : undefined)
                      : () => setViewDetailsItem(item)}
                  >
                    {/* Left stripe / checkbox */}
                    {bulkOn ? (
                      bulkEligible ? (
                        <div style={{ width: 52, flexShrink: 0, background: isSelected ? TI.accent : '#f5f5f4', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.15s' }}>
                          <div style={{ width: 22, height: 22, borderRadius: 6, border: `2px solid ${isSelected ? '#fff' : '#d4d4d0'}`, background: isSelected ? 'rgba(255,255,255,0.25)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {isSelected && <Check style={{ width: 14, height: 14, color: '#fff' }} />}
                          </div>
                        </div>
                      ) : (
                        <div style={{ width: 4, flexShrink: 0, background: coAberto ? CO.stripe : '#e7e5e4' }} />
                      )
                    ) : (
                      // A tarja do complemento vem ANTES do verde/laranja/cinza:
                      // enquanto ele não é entregue, é o sinal mais forte do card.
                      <div style={{ width: 4, flexShrink: 0, background: coAberto ? CO.stripe : isDelivered(item) ? '#86efac' : canDeliverItem ? TI.accent : '#e7e5e4' }} />
                    )}

                    {/* Arte aprovada — no celular é ela que identifica a peça
                        de relance, na hora de conferir com o material na mão.
                        Some no modo lote era o pior momento possível para
                        escondê-la: é exatamente aí que o operador está com a
                        peça na mão marcando o que já conferiu. No lote ela
                        fica mais estreita para conviver com a caixa de seleção,
                        e vira <div> (não link) para o toque continuar
                        selecionando o card em vez de abrir outra aba. */}
                    {item.approvalThumbUrl && (() => {
                      const thumbW = bulkOn ? 64 : 88;
                      const thumbImg = (
                        <img src={convertGCSUrlToLocalPath(item.approvalThumbUrl)} alt="Arte"
                          loading="lazy" decoding="async"
                          style={{ maxWidth: '100%', maxHeight: 104, objectFit: 'contain', display: 'block' }}
                          onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                      );
                      const boxStyle: React.CSSProperties = {
                        width: thumbW, flexShrink: 0, alignSelf: 'stretch', backgroundColor: '#faf9f7',
                        borderRight: `1px solid ${TI.border}`, display: 'flex', alignItems: 'center',
                        justifyContent: 'center', padding: 5,
                      };
                      if (bulkOn) {
                        return (
                          <div style={boxStyle} data-testid={`thumb-art-mobile-${item.id}`}>{thumbImg}</div>
                        );
                      }
                      return (
                        <a
                          href={convertGCSUrlToLocalPath(item.approvalThumbUrl)}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          title="Abrir a arte aprovada"
                          data-testid={`thumb-art-mobile-${item.id}`}
                          style={boxStyle}
                        >
                          {thumbImg}
                        </a>
                      );
                    })()}

                    {/* Content */}
                    <div style={{ flex: 1, padding: '11px 12px', display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 700, color: item.isReuse ? '#059669' : '#c2410c' }}>
                          {(() => { const { base, suffix } = splitDisplayId(item.displayId); return (<>{base}{suffix && <span style={{ color: CO.suffix }}>{suffix}</span>}</>); })()}
                        </span>
                        <StatusPill status={item.status} size="sm" showDot={false} />
                        {item.isReuse && <span style={{ fontSize: 10, fontWeight: 800, color: '#059669', background: '#dcfce7', border: '1px solid #86efac', borderRadius: 6, padding: '2px 6px' }}>REAPROV.</span>}
                        {/* Selo do complemento: sólido enquanto o lote está em
                            aberto (trabalho novo), outline depois de entregue —
                            a identidade fica, o alarme não. */}
                        {ehComplemento && (
                          <span
                            data-testid={`badge-complemento-mobile-${item.id}`}
                            title={item.complementReason ? `Motivo: ${item.complementReason}` : `Complemento de ${maeDisplayId}`}
                            style={coAberto
                              ? { fontSize: 9, fontWeight: 800, color: CO.solidText, background: CO.solidBg, borderRadius: 6, padding: '2px 6px', letterSpacing: '0.06em', whiteSpace: 'nowrap' }
                              : { fontSize: 9, fontWeight: 800, color: CO.text, background: CO.bg, border: `1px solid ${CO.border}`, borderRadius: 6, padding: '1px 5px', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}
                          >
                            {coAberto ? `+${qtyOf(item)} COMPL.` : 'COMPL.'}
                          </span>
                        )}
                        {/* Mãe: selo espelho. Sem ele ninguém entende por que
                            uma peça entregue "ganhou parente" logo abaixo. */}
                        {complQty > 0 && (
                          <span
                            title={`Contratado total: ${contractedTotalOf(item)} un. (${qtyOf(item)} + ${complQty})`}
                            style={{ fontSize: 9, fontWeight: 800, color: CO.text, background: CO.bg, border: `1px solid ${CO.border}`, borderRadius: 6, padding: '1px 5px', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}
                          >
                            TEM +{complQty}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: TI.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.type}</div>
                      {/* Identidade permanente: de quem este lote é complemento,
                          quem pediu e quando. Não some depois da entrega. */}
                      {ehComplemento && (
                        <div style={{ fontSize: 11, fontWeight: 600, color: CO.textStrong, lineHeight: 1.3 }}>
                          Complemento de {maeDisplayId}
                          {item.complementRequestedBy ? ` · ${item.complementRequestedBy}` : ''}
                          {item.complementRequestedAt ? `, ${fmtDataHora(item.complementRequestedAt)}` : ''}
                        </div>
                      )}
                      {/* A DESCRIÇÃO é o que distingue duas peças do mesmo tipo
                          ("Banner" x "Banner"): o desktop sempre mostrou, o
                          celular não — e é no celular que se confere com a
                          peça na mão. Duas linhas: nome de peça costuma ser
                          longo e uma linha só virava reticência inútil. */}
                      {item.description && item.description !== item.type && (
                        <div style={{
                          fontSize: 13, color: item.isReuse ? '#065f46' : TI.secondary,
                          fontWeight: item.isReuse ? 600 : 400, lineHeight: 1.35,
                          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        }}>
                          {item.description}
                        </div>
                      )}
                      {/* QUANTIDADES — o desktop tem as colunas QTD, REAPROV. e
                          PROD; o celular não mostrava número nenhum, e é nele
                          que se produz e confere com a peça na mão. Cada etapa
                          só aparece depois de existir, para a linha não virar
                          uma fileira de zeros. */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 3 }}>
                        <span style={{ fontSize: 14, fontWeight: 800, color: TI.text, fontFamily: "'Space Grotesk', sans-serif", lineHeight: 1 }}>
                          {qtyOf(item)}
                          <span style={{ fontSize: 11, fontWeight: 600, color: TI.secondary, marginLeft: 3 }}>un.</span>
                        </span>
                        {reusedTotalOf(item) > 0 && (
                          <span style={qtyChip('#047857', '#dcfce7')} title={item.isReuse ? 'Peça inteira reaproveitada' : `${reusedTotalOf(item)} de ${qtyOf(item)} un. reaproveitadas`}>
                            REAPROV. {reusedTotalOf(item)}
                          </span>
                        )}
                        {producedOf(item) > 0 && (
                          <span style={qtyChip('#c2410c', '#fff7ed')} title={`${producedOf(item)} de ${qtyOf(item)} un. produzidas`}>
                            PROD. {producedOf(item)}
                          </span>
                        )}
                        {conferredOf(item) > 0 && (
                          <span style={qtyChip('#0e7490', '#ecfeff')} title={`${conferredOf(item)} de ${qtyOf(item)} un. conferidas`}>
                            CONF. {conferredOf(item)}
                          </span>
                        )}
                        {deliveredOf(item) > 0 && (
                          <span style={qtyChip('#15803d', '#f0fdf4')} title={`${deliveredOf(item)} de ${qtyOf(item)} un. entregues`}>
                            ENTREG. {deliveredOf(item)}
                          </span>
                        )}
                      </div>
                      {/* MOTIVO do aumento — a informação principal deste card,
                          por extenso (duas linhas): é o "e claro isso ficar nos
                          logs" resolvido sem abrir ficha nenhuma. */}
                      {coAberto && item.complementReason && (
                        <div style={{ fontSize: 11, color: CO.textStrong, display: 'flex', alignItems: 'flex-start', gap: 4, marginTop: 2, lineHeight: 1.35 }}>
                          <PlusCircle style={{ width: 11, height: 11, color: CO.text, flexShrink: 0, marginTop: 1 }} />
                          <span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                            {item.complementReason}
                          </span>
                        </div>
                      )}
                      {item.observations && (
                        <div style={{ fontSize: 11, color: '#b45309', display: 'flex', alignItems: 'center', gap: 4, marginTop: 1 }}>
                          <AlertCircle style={{ width: 10, height: 10, flexShrink: 0 }} />{item.observations}
                        </div>
                      )}
                    </div>

                    {/* Right: action buttons — some em QUALQUER modo de lote
                        (antes só !bulkDeliveryMode: na conferência em lote os
                        botões continuavam aparecendo e disputando o toque). */}
                    {!bulkOn && (
                      <div style={{ flexShrink: 0, minWidth: 116, padding: '10px 10px', display: 'flex', flexDirection: 'column', gap: 5, justifyContent: 'center' }}>
                        {/* PRODUZIR — o celular só tinha Entregar e Conferir.
                            Num complemento isso é o pior buraco possível: a
                            Gráfica em campo vê o alerta laranja e não tem o que
                            fazer com ele. Aparece só nos complementos (o resto
                            da fila segue como estava) e com o mesmo gate de
                            papel do desktop, que o servidor também valida. */}
                        {podeProduzirAqui && (
                          <button
                            onClick={e => { e.stopPropagation(); openProductionModal(item); }}
                            data-testid={`button-production-mobile-${item.id}`}
                            style={{ width: '100%', minHeight: 44, padding: '0 12px', borderRadius: 8, background: CO.solidBg, border: 'none', color: '#fff', fontSize: 13, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, cursor: 'pointer', whiteSpace: 'nowrap' }}
                          >
                            <Play aria-hidden="true" style={{ width: 13, height: 13 }} />
                            Produzir {remainingProduce(item)}
                          </button>
                        )}
                        {canProduce && canConferItem && (
                          <button
                            onClick={e => { e.stopPropagation(); openConferenceModal(item); }}
                            style={{ width: '100%', minHeight: 44, padding: '0 12px', borderRadius: 8, background: '#0891b2', border: 'none', color: '#fff', fontSize: 13, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, cursor: 'pointer', whiteSpace: 'nowrap' }}
                          >
                            <CheckCircle aria-hidden="true" style={{ width: 13, height: 13 }} />
                            Conferir
                          </button>
                        )}
                        {canDeliverItem && (
                          <button
                            onClick={e => { e.stopPropagation(); openDeliveryModal(item); }}
                            style={{ width: '100%', minHeight: 44, padding: '0 12px', borderRadius: 8, background: '#c2410c', border: 'none', color: '#fff', fontSize: 13, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, cursor: 'pointer', whiteSpace: 'nowrap' }}
                          >
                            <Truck aria-hidden="true" style={{ width: 13, height: 13 }} />
                            {deliveredOf(item) > 0 ? `Entregar ${remainingDeliver(item)}` : 'Entregar'}
                          </button>
                        )}
                        {isDelivered(item) && (
                          <span style={{ width: '100%', fontSize: 13, color: '#15803d', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, fontWeight: 700, padding: '4px 8px' }}>
                            <Check aria-hidden="true" style={{ width: 13, height: 13 }} /> Entregue
                          </span>
                        )}

                        {/* Divisor entre FLUXO e CONTRATO. Só existe quando há
                            botão dos dois lados — para a Solicitação o grupo de
                            fluxo costuma estar vazio e "Aumentar" fica sozinho
                            no trilho inteiro, com salência máxima e sem truque. */}
                        {temGrupoFluxo && temGrupoContrato && (
                          <div aria-hidden="true" style={{ height: 1, background: '#e7e5e4', margin: '4px 0', width: '100%' }} />
                        )}

                        {/* AUMENTAR — o gatilho primário do celular. Tintado (não
                            sólido): não é etapa do fluxo de produção, é mudança
                            de contrato. Papel admin|solicitacao. */}
                        {mostraAumentar && (
                          <button
                            onClick={e => { e.stopPropagation(); abrirComplemento(item); }}
                            aria-label={`Aumentar a quantidade de ${item.displayId} — cria uma peça complementar`}
                            data-testid={`button-aumentar-quantidade-mobile-${item.id}`}
                            title="Aumentar quantidade"
                            style={{
                              width: 44, minHeight: 44, padding: 0, borderRadius: 8,
                              background: CO.bg, border: `1.5px solid ${CO.border}`, color: CO.text,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              cursor: 'pointer', flexShrink: 0,
                            }}
                            onPointerDown={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = CO.hoverBg; b.style.color = CO.suffix; }}
                            onPointerUp={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = CO.bg; b.style.color = CO.text; }}
                            onPointerLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = CO.bg; b.style.color = CO.text; }}
                          >
                            {/* Só o ícone (decisão do dono). O aria-label acima
                                carrega o significado para quem usa leitor de
                                tela, e o alvo continua com 44px de toque. */}
                            <PlusCircle aria-hidden="true" style={{ width: 18, height: 18 }} />
                          </button>
                        )}
                        {/* Cancelar complemento criado por engano — dois toques
                            (o segundo confirma), nunca destrutivo de primeira.
                            Alvo de 44px: os 36 de antes reprovavam a régua da
                            casa justo num botão destrutivo. */}
                        {podeCancelarCompl && (
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              if (cancelComplementId === item.id) cancelComplementMutation.mutate({ itemId: item.id, displayId: item.displayId });
                              else setCancelComplementId(item.id);
                            }}
                            disabled={cancelComplementMutation.isPending}
                            title={`Cancelar ${item.displayId} — só enquanto nada foi produzido`}
                            data-testid={`button-cancel-complement-mobile-${item.id}`}
                            style={{
                              width: '100%', minHeight: 44, padding: '0 12px', borderRadius: 8,
                              background: cancelComplementId === item.id ? '#b91c1c' : 'transparent',
                              border: `1px solid ${cancelComplementId === item.id ? '#b91c1c' : TI.border}`,
                              color: cancelComplementId === item.id ? '#fff' : '#b91c1c',
                              fontSize: 11, fontWeight: 700,
                              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                              cursor: cancelComplementMutation.isPending ? 'not-allowed' : 'pointer',
                              opacity: cancelComplementMutation.isPending ? 0.6 : 1, whiteSpace: 'nowrap',
                            }}
                          >
                            <Trash2 aria-hidden="true" style={{ width: 12, height: 12 }} />
                            {cancelComplementMutation.isPending ? 'Cancelando…' : cancelComplementId === item.id ? 'Confirmar?' : 'Cancelar'}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </Fragment>
              );
            })}
          </div>
        ) : (
          /* ── View desktop: tabela ── */
          <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ backgroundColor: TI.text }}>
                {["ID", "Descrição", "QTD", "REAPROV.", "PROD", "Dimensões (V × A)", "M² a produzir", "Material", "Status", ""].map(col => (
                  <th key={col} style={{ padding: "13px 16px", textAlign: col === "" ? "right" : "left", fontSize: 10, fontWeight: 900, color: "rgba(255,255,255,0.72)", textTransform: "uppercase", letterSpacing: "0.08em", whiteSpace: "nowrap" }}>
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item: any, index: number) => {
                const prev = index > 0 ? filteredItems[index - 1] : null;
                const showEvHeader = !prev || (prev as any).event?.name !== item.event?.name;
                const showTypeHeader = !prev || (prev as any).event?.name !== item.event?.name || (prev as any).type !== item.type;
                // Mesmo padrão do mobile: elegível conforme o modo de lote
                // ativo — antes só a entrega em lote tinha checkbox na tabela.
                const isSelected = bulkSelectedIds.has(item.id);
                const bulkEligible = bulkDeliveryMode ? canDeliver(item) : bulkConferMode ? canConfer(item) : false;
                // ── Complemento ──
                // ehComplemento: esta linha nasceu de um aumento de quantidade.
                // coAberto: o realce FORTE ainda vale (não foi entregue).
                // complQty: soma dos complementos vivos → esta linha é a MÃE.
                const ehComplemento = isComplement(item);
                const coAberto = complementOpen(item);
                const maeDisplayId = ehComplemento ? parentDisplayIdOf(item) : "";
                const complQty = complementsQtyOf(item);
                const { base: idBase, suffix: idSuffix } = splitDisplayId(item.displayId);
                // Recém-criada nesta sessão: realce de 5 s (fundo + faixa 4px).
                const isNovo = item.id === novoComplementoId;
                // O gatilho de AUMENTAR. Some em qualquer modo de lote: o
                // complemento exige quantidade e justificativa POR PEÇA.
                const mostraAumentar = !bulkOn && podeAumentarQuantidade(item, podeMexerQtd);

                return (
                  <Fragment key={item.id}>
                    {/* Cabeçalho de Evento */}
                    {(() => {
                      const groupName = typeToGroup[item.type] || '';
                      const prevGroupName = prev ? (typeToGroup[(prev as any).type] || '') : '';
                      const showGroupHeader = !showEvHeader && groupName !== '' && groupName !== prevGroupName;
                      return showGroupHeader ? (
                        <tr style={{ backgroundColor: '#dbeafe' }}>
                          <td colSpan={COLS} style={{ padding: '5px 16px' }}>
                            <span style={{ fontSize: 10, fontWeight: 800, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{groupName}</span>
                          </td>
                        </tr>
                      ) : null;
                    })()}
                    {showEvHeader && (
                      <tr style={{ backgroundColor: "#292524" }}>
                        <td colSpan={COLS} style={{ padding: "10px 16px" }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <Package style={{ width: 16, height: 16, color: TI.accent }} />
                              <span style={{ fontSize: 13, fontWeight: 800, color: "#ffffff", textTransform: "uppercase", letterSpacing: "0.05em", fontFamily: "'Space Grotesk', sans-serif" }}>
                                {item.event?.name || "Sem Evento"}
                              </span>
                            </div>
                            {item.event && (
                              <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "rgba(255,255,255,0.72)" }}>
                                  <Calendar style={{ width: 12, height: 12 }} />
                                  Início: <strong style={{ color: "rgba(255,255,255,0.85)" }}>{parseDateLocal(item.event.startDate).toLocaleDateString("pt-BR")}</strong>
                                </div>
                                <span style={{ color: "rgba(255,255,255,0.72)", fontSize: 10 }}>|</span>
                                <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "rgba(255,255,255,0.72)" }}>
                                  <Truck style={{ width: 12, height: 12 }} />
                                  Saída: <strong style={{ color: "rgba(255,255,255,0.85)" }}>
                                    {new Date(item.event.truckDepartureDate).toLocaleDateString("pt-BR", { timeZone: 'UTC' })} às {new Date(item.event.truckDepartureDate).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: 'UTC' })}
                                  </strong>
                                </div>
                                <DeadlineChip event={item.event} />
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}

                    {/* Cabeçalho de Tipo */}
                    {showTypeHeader && (
                      <tr style={{ backgroundColor: "#f4f3f0" }}>
                        <td colSpan={COLS} style={{ padding: "6px 16px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ width: 3, height: 14, backgroundColor: TI.accent, borderRadius: 999, flexShrink: 0 }} />
                            <span style={{ fontSize: 11, fontWeight: 700, color: TI.text }}>{item.type}</span>
                          </div>
                        </td>
                      </tr>
                    )}

                    {/* Linha do item */}
                    <tr
                      // Fundo em UMA função (rowBg) usada nas três mãos: antes
                      // style, onMouseEnter e onMouseLeave decidiam a cor cada
                      // um por conta própria e o hover apagava qualquer realce
                      // que não estivesse repetido nos três.
                      style={{ borderBottom: `1px solid ${coAberto ? CO.border : item.isReuse ? "#bbf7d0" : "#f4f3f0"}`, cursor: "pointer", transition: "background-color 0.1s", backgroundColor: rowBg(item, isSelected, false, isNovo) || undefined }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = rowBg(item, isSelected, true, isNovo); }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = rowBg(item, bulkSelectedIds.has(item.id), false, isNovo); }}
                      onClick={bulkOn && bulkEligible ? () => toggleBulkItem(item.id) : () => setViewDetailsItem(item)}
                      data-item-row={item.id}
                      data-testid={`row-item-${item.id}`}
                    >
                      {/* ID — a linha abre o detalhe no clique, mas <tr> não
                          recebe foco: sem mouse não havia como abrir peça
                          nenhuma. O ID vira o alvo focável, o rótulo natural da
                          linha (#047857 sobre branco passa AA e continua
                          sinalizando reaproveitamento).
                          A FAIXA LATERAL do complemento mora aqui, como
                          boxShadow inset da primeira célula: com
                          border-collapse a <tr> não renderiza borda esquerda de
                          forma confiável. Ela some quando o lote é entregue; o
                          conector em L (o traço que amarra o filho à mãe logo
                          acima) fica para sempre. */}
                      <td style={{ padding: "13px 16px", boxShadow: isNovo ? `inset 4px 0 0 ${CO.stripe}` : coAberto ? `inset 3px 0 0 ${CO.stripe}` : undefined }}>
                        {ehComplemento && (
                          <span aria-hidden="true" style={{ display: "inline-block", width: 10, height: 8, marginRight: 6, marginBottom: 2, borderLeft: `1px solid ${CO.connector}`, borderBottom: `1px solid ${CO.connector}`, borderBottomLeftRadius: 3, verticalAlign: "middle" }} />
                        )}
                        <button
                          onClick={e => { e.stopPropagation(); setViewDetailsItem(item); }}
                          aria-label={ehComplemento
                            ? `Ver detalhes da peça ${item.displayId}, complemento de ${maeDisplayId}`
                            : `Ver detalhes da peça ${item.displayId}`}
                          style={{ fontSize: 13, fontFamily: "'DM Mono', monospace", color: item.isReuse ? "#047857" : "#c2410c", fontWeight: 700, letterSpacing: "0.04em", background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                          data-testid={`text-display-id-${item.id}`}
                        >
                          {idBase}{idSuffix && <span style={{ color: CO.suffix }}>{idSuffix}</span>}
                        </button>
                      </td>
                      {/* Descrição — com a arte ao lado: a Gráfica identifica a
                          peça pelo desenho, não pelo texto, e antes era preciso
                          abrir o detalhe de cada uma para saber o que era. */}
                      <td style={{ padding: "13px 16px", maxWidth: 320 }}>
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                          {item.approvalThumbUrl && (
                            <a
                              href={convertGCSUrlToLocalPath(item.approvalThumbUrl)}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              title="Abrir a arte aprovada"
                              data-testid={`thumb-art-${item.id}`}
                              style={{ display: "block", width: 44, height: 44, borderRadius: 6, overflow: "hidden", border: `1px solid ${TI.border}`, backgroundColor: "#fff", flexShrink: 0 }}
                            >
                              <img src={convertGCSUrlToLocalPath(item.approvalThumbUrl)} alt="Arte"
                                loading="lazy" decoding="async"
                                style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
                                onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                            </a>
                          )}
                          <div style={{ minWidth: 0, flex: 1 }}>
                        {/* SELO DO COMPLEMENTO — o sinal mais forte da tela, no
                            topo da pilha de badges. Sólido (não outline) porque
                            significa TRABALHO NOVO na fila: o número que está na
                            linha já é exatamente o que falta imprimir, sem
                            conta nenhuma. Depois da entrega vira outline: a
                            identidade permanece, o alarme não. */}
                        {ehComplemento && (
                          <div
                            data-testid={`badge-complemento-${item.id}`}
                            title={item.complementReason ? `Motivo: ${item.complementReason}` : `Complemento de ${maeDisplayId}`}
                            style={coAberto
                              ? { display: "inline-flex", alignItems: "center", gap: 5, backgroundColor: CO.solidBg, color: CO.solidText, borderRadius: 6, padding: "3px 9px", fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 5, marginRight: 5, whiteSpace: "nowrap" }
                              : { display: "inline-flex", alignItems: "center", gap: 5, backgroundColor: CO.bg, color: CO.text, border: `1px solid ${CO.border}`, borderRadius: 6, padding: "2px 8px", fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 5, marginRight: 5, whiteSpace: "nowrap" }}
                          >
                            <PlusCircle style={{ width: 11, height: 11 }} />
                            {coAberto
                              ? `+${qtyOf(item)} un. — complemento de ${maeDisplayId}`
                              : `complemento de ${maeDisplayId}`}
                          </div>
                        )}
                        {/* MÃE — selo espelho, sempre outline: ela não tem
                            trabalho pendente (nada nela mudou), mas sem isto o
                            operador não entende por que uma peça entregue
                            ganhou uma linha nova logo abaixo. */}
                        {complQty > 0 && (
                          <div
                            data-testid={`badge-tem-complemento-${item.id}`}
                            title={`Contratado total: ${contractedTotalOf(item)} un. (${qtyOf(item)} + ${complQty}) · ${(item.complements ?? []).map((c: any) => `${c.displayId} (+${c.quantity})`).join(", ")}`}
                            style={{ display: "inline-flex", alignItems: "center", gap: 5, backgroundColor: CO.bg, color: CO.text, border: `1px solid ${CO.border}`, borderRadius: 6, padding: "2px 8px", fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 5, marginRight: 5, whiteSpace: "nowrap" }}
                          >
                            <PlusCircle style={{ width: 11, height: 11 }} />
                            Tem complemento (+{complQty})
                          </div>
                        )}
                        {/* A cor verde da linha sozinha não diz o que é: o rótulo
                            precisa aparecer sempre que houver reaproveitamento,
                            inclusive nas peças marcadas antes de reuseQty existir. */}
                        {(item.isReuse || reusedOf(item) > 0) && (
                          <div title={item.isReuse ? "Peça inteira reaproveitada" : `${reusedOf(item)} de ${qtyOf(item)} un. reaproveitadas`}
                            style={{ display: "inline-flex", alignItems: "center", gap: 5, backgroundColor: item.isReuse ? "#059669" : "#10b981", color: "#ffffff", borderRadius: 6, padding: "3px 9px", fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 5 }}>
                            <RotateCcw style={{ width: 11, height: 11 }} />
                            {item.isReuse ? "Reaproveitamento" : `Reaproveitamento ${reusedOf(item)}/${qtyOf(item)}`}
                          </div>
                        )}
                        {item.description ? (
                          <div style={{ fontSize: 13, color: item.isReuse ? "#065f46" : TI.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: item.isReuse ? 600 : 400 }}>{item.description}</div>
                        ) : (
                          <div style={{ fontSize: 13, color: TI.secondary }}>—</div>
                        )}
                        {item.observations && (
                          <div style={{ fontSize: 11, color: TI.secondary, fontStyle: "italic", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 2 }}>{item.observations}</div>
                        )}
                        {item.referenceUrl && (
                          <a href={item.referenceUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} title="Ver referência do solicitante" style={{ display: "inline-flex", alignItems: "center", gap: 3, marginTop: 3, fontSize: 10, fontWeight: 700, color: "#c2410c", textDecoration: "none", backgroundColor: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 6, padding: "1px 5px" }} data-testid={`link-reference-grafica-${item.id}`}>
                            <img src={item.referenceUrl} style={{ width: 12, height: 12, objectFit: "cover", borderRadius: 999 }} alt="" onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                            REF
                          </a>
                        )}
                        {/* Arquivo final foi substituído pela Arte após envio inicial */}
                        {item.previousFinalFileUrl && (
                          <div
                            title={`Anterior: ${item.previousFinalFileUrl}`}
                            data-testid={`badge-arquivo-atualizado-${item.id}`}
                            style={{ display: "inline-flex", alignItems: "center", gap: 4, marginTop: 4, fontSize: 10, fontWeight: 800, color: "#92400e", backgroundColor: "#fef3c7", border: "1px solid #fbbf24", borderRadius: 6, padding: "2px 7px", textTransform: "uppercase", letterSpacing: "0.06em" }}
                          >
                            ⚠ Arquivo atualizado
                          </div>
                        )}
                          </div>
                        </div>
                      </td>
                      {/* Qtd — na MÃE ganha o chip "+N": era a única coluna
                          numérica sem tratamento, e é onde a pergunta "afinal,
                          quantas foram contratadas?" nasce. A quantidade da mãe
                          NÃO muda (o complemento é linha própria); o chip mostra
                          o que veio depois e o tooltip soma os dois.

                          É TAMBÉM onde nasce o gatilho de AUMENTAR: a ação é
                          sobre este número, e foi exatamente na coluna de Ações
                          (espremida entre três ícones) que ela se perdeu no
                          Detalhe do Evento. A célula vira uma pilha:
                          número → chip +N → botão. Nada de hover-reveal: o
                          botão é persistente em 100% das linhas elegíveis.
                          Padding 10px em vez de 16 para o botão caber. */}
                      <td style={{ padding: "13px 10px", textAlign: "center", whiteSpace: "nowrap", fontSize: 13, fontWeight: 700, color: TI.text }}>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                          <div>{item.quantity}</div>
                          {complQty > 0 && (
                            <div
                              data-testid={`chip-qtd-complemento-${item.id}`}
                              title={`Contratado total: ${contractedTotalOf(item)} un. — complementos: ${(item.complements ?? []).map((c: any) => `${c.displayId} (+${c.quantity})`).join(", ")}`}
                              style={{ marginTop: 2, display: "inline-block", padding: "0 5px", borderRadius: 4, backgroundColor: CO.hoverBg, border: `1px solid ${CO.border}`, color: CO.text, fontSize: 10, fontWeight: 800 }}
                            >
                              +{complQty}
                            </div>
                          )}
                          {mostraAumentar && (
                            <button
                              type="button"
                              onClick={e => { e.stopPropagation(); abrirComplemento(item); }}
                              aria-label={`Aumentar a quantidade de ${item.displayId} — cria uma peça complementar`}
                              title={`Aumentar quantidade — cria uma peça complementar ligada a ${item.displayId}`}
                              data-testid={`button-aumentar-quantidade-${item.id}`}
                              style={{
                                marginTop: 6, width: 26, height: 26, padding: 0, borderRadius: 6,
                                display: "inline-flex", alignItems: "center", justifyContent: "center",
                                background: CO.bg, border: `1px solid ${CO.border}`, color: CO.text,
                                cursor: "pointer", transition: "background-color 0.15s",
                              }}
                              onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.backgroundColor = CO.hoverBg)}
                              onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.backgroundColor = CO.bg)}
                              onFocus={e => { const b = e.currentTarget as HTMLButtonElement; b.style.outline = `2px solid ${CO.stripe}`; b.style.outlineOffset = "2px"; }}
                              onBlur={e => { (e.currentTarget as HTMLButtonElement).style.outline = "none"; }}
                            >
                              {/* Só o ícone (decisão do dono): o title e o
                                  aria-label acima carregam o significado. */}
                              <PlusCircle aria-hidden="true" style={{ width: 14, height: 14 }} />
                            </button>
                          )}
                        </div>
                      </td>
                      {/* Reaproveitado */}
                      <td style={{ padding: "13px 16px", textAlign: "center", fontSize: 13, fontWeight: 700, color: reusedTotalOf(item) > 0 ? "#059669" : TI.secondary }}>
                        {reusedTotalOf(item) > 0 ? (
                          <span title={item.isReuse ? "Peça inteira reaproveitada" : `${reusedTotalOf(item)} de ${qtyOf(item)} un. reaproveitadas`}>
                            {reusedTotalOf(item)}
                            {reusedTotalOf(item) < qtyOf(item) && (
                              <span style={{ color: TI.secondary, fontWeight: 400 }}>/{qtyOf(item)}</span>
                            )}
                          </span>
                        ) : "—"}
                      </td>
                      {/* Prod */}
                      <td style={{ padding: "13px 16px", textAlign: "center", fontSize: 13, fontWeight: 700, color: item.quantityProduced > 0 ? "#c2410c" : TI.secondary }}>
                        {item.quantityProduced || "—"}
                      </td>
                      {/* Dimensões */}
                      <td style={{ padding: "13px 16px" }}>
                        {item.visualWidth && item.visualHeight ? (
                          <div>
                            <div style={{ fontSize: 11, color: TI.text, fontFamily: "monospace", whiteSpace: "nowrap" }}>
                              <span style={{ color: TI.secondary, fontWeight: 600 }}>V:</span> {item.visualWidth}×{item.visualHeight}
                            </div>
                            {item.fileWidth && item.fileHeight && (
                              <div style={{ fontSize: 11, color: TI.secondary, fontFamily: "monospace", whiteSpace: "nowrap" }}>
                                <span style={{ fontWeight: 600 }}>A:</span> {item.fileWidth}×{item.fileHeight}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span style={{ fontSize: 13, color: TI.secondary }}>—</span>
                        )}
                      </td>
                      {/* m² a produzir — o reaproveitado não vai para a impressora */}
                      <td style={{ padding: "13px 16px", textAlign: "center", fontSize: 13, fontWeight: 700, color: TI.text, fontFamily: "monospace" }}>
                        {(() => {
                          const total = Number(item.calculatedM2) || 0;
                          if (!total) return "—";
                          const toPrint = m2ToProduce(item);
                          if (reusedTotalOf(item) === 0) return total.toFixed(2);
                          return (
                            <span title={`Total da peça: ${total.toFixed(2)} m² · reaproveitado não é impresso`}>
                              <span style={{ color: toPrint === 0 ? "#059669" : TI.text }}>{toPrint.toFixed(2)}</span>
                              <span style={{ display: "block", fontSize: 10, fontWeight: 400, color: TI.secondary, textDecoration: "line-through" }}>
                                {total.toFixed(2)}
                              </span>
                            </span>
                          );
                        })()}
                      </td>
                      {/* Material */}
                      <td style={{ padding: "13px 16px" }}>
                        <div style={{ fontSize: 13, color: TI.text }}>{item.material}</div>
                        {item.finish && <div style={{ fontSize: 11, color: TI.secondary, marginTop: 2 }}>{item.finish}</div>}
                      </td>
                      {/* Status */}
                      <td style={{ padding: "13px 16px" }}>
                        <StatusPill status={item.status} size="sm" showDot={false} />
                      </td>
                      {/* Ações */}
                      <td style={{ padding: "13px 16px", textAlign: "right" }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
                          {/* Ver detalhes */}
                          <button
                            onClick={() => setViewDetailsItem(item)}
                            title="Ver detalhes"
                            data-testid={`button-view-${item.id}`}
                            style={{ background: "none", border: "none", cursor: "pointer", color: TI.secondary, padding: 4, borderRadius: 6, display: "flex", alignItems: "center", transition: "color 0.15s" }}
                            onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.color = TI.text)}
                            onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.color = TI.secondary)}
                          >
                            <Eye style={{ width: 15, height: 15 }} />
                          </button>

                          {/* Cancelar complemento — a janela de arrependimento.
                              Mesmo papel de quem CRIA o complemento (admin |
                              solicitacao), espelho de `podeMudarQuantidade` no
                              DELETE /api/items/:id/complement. Estava com
                              `canProduce`: a Gráfica via um convite falso que
                              virava 403, e quem realmente pode cancelar (a
                              Solicitação) não via botão nenhum.
                              Só enquanto NADA foi produzido, reaproveitado,
                              conferido ou entregue: uma única unidade já é
                              material no galpão. Confirmação em dois passos, no
                              mesmo idioma dos botões de reaproveitamento. */}
                          {podeMexerQtd && ehComplemento && complementUntouched(item) && (
                            cancelComplementId === item.id ? (
                              <div style={{ display: "flex", alignItems: "center", gap: 4 }} onClick={e => e.stopPropagation()}>
                                <span style={{ fontSize: 11, fontWeight: 700, color: "#b91c1c", whiteSpace: "nowrap" }}>Cancelar {item.displayId}?</span>
                                <button
                                  onClick={() => cancelComplementMutation.mutate({ itemId: item.id, displayId: item.displayId })}
                                  disabled={cancelComplementMutation.isPending}
                                  data-testid={`button-cancel-complement-confirm-${item.id}`}
                                  style={{ backgroundColor: "#b91c1c", color: "#fff", border: "none", borderRadius: 6, height: 26, padding: "0 8px", fontSize: 10, fontWeight: 700, cursor: cancelComplementMutation.isPending ? "not-allowed" : "pointer", opacity: cancelComplementMutation.isPending ? 0.6 : 1, whiteSpace: "nowrap" }}
                                >
                                  {cancelComplementMutation.isPending ? "Cancelando…" : "Sim, remover"}
                                </button>
                                <button
                                  onClick={() => setCancelComplementId(null)}
                                  title="Manter o complemento"
                                  aria-label="Manter o complemento"
                                  style={{ background: "none", border: `1px solid ${TI.border}`, borderRadius: 6, height: 26, padding: "0 6px", fontSize: 10, fontWeight: 700, color: TI.muted, cursor: "pointer" }}
                                >
                                  <X style={{ width: 10, height: 10 }} />
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={e => { e.stopPropagation(); setCancelComplementId(item.id); }}
                                title={`Cancelar ${item.displayId} — só enquanto nada foi produzido`}
                                aria-label={`Cancelar o complemento ${item.displayId}`}
                                data-testid={`button-cancel-complement-${item.id}`}
                                style={{ background: "none", border: `1px solid ${TI.border}`, cursor: "pointer", color: "#b91c1c", height: 26, padding: "0 9px", borderRadius: 6, display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, whiteSpace: "nowrap", transition: "background-color 0.15s" }}
                                onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.backgroundColor = "#fef2f2")}
                                onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent")}
                              >
                                <Trash2 style={{ width: 12, height: 12 }} />
                                Cancelar compl.
                              </button>
                            )
                          )}

                          {/* Iniciar / Continuar Produção — oculto para reaproveitamento
                              e para quem o servidor recusa (só grafica/admin produzem).
                              Depois de conferida, a peça só tem a entrega pela frente. */}
                          {canProduce && !isDelivered(item) && !isProduced(item) && !isConferred(item) && !item.isReuse && (
                            <button
                              onClick={() => openProductionModal(item)}
                              title={isInProd(item) ? "Continuar Produção" : "Iniciar Produção"}
                              data-testid={`button-production-${item.id}`}
                              style={{ backgroundColor: TI.text, color: "#ffffff", border: "none", borderRadius: 6, height: 30, padding: "0 12px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, transition: "background-color 0.15s" }}
                              onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.backgroundColor = TI.accent)}
                              onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.backgroundColor = TI.text)}
                            >
                              <Play style={{ width: 11, height: 11 }} />
                              {isInProd(item) ? "Continuar" : "Produzir"}
                            </button>
                          )}

                          {/* Reaproveitar — total ou parcial, enquanto ainda há
                              unidades sem produzir nem reaproveitar */}
                          {!isDelivered(item) && !isProduced(item) && !isConferred(item) && remainingReuse(item) > 0 && (
                            reuseConfirmItemId === item.id ? (
                              <div style={{ display: "flex", alignItems: "center", gap: 4 }} onClick={e => e.stopPropagation()}>
                                <input
                                  type="number"
                                  min={1}
                                  max={remainingReuse(item)}
                                  value={reuseQty}
                                  onChange={e => setReuseQty(Math.max(1, Math.min(remainingReuse(item), parseInt(e.target.value) || 1)))}
                                  title={`Quantas unidades reaproveitar (até ${remainingReuse(item)})`}
                                  data-testid={`input-reuse-qty-${item.id}`}
                                  style={{ width: 52, height: 26, padding: "0 6px", borderRadius: 6, border: `1px solid ${TI.border}`, fontSize: 11, fontWeight: 700, color: TI.text, textAlign: "center" }}
                                />
                                <span style={{ fontSize: 10, color: TI.secondary, whiteSpace: "nowrap" }}>de {remainingReuse(item)}</span>
                                <button
                                  onClick={() => markReuseMutation.mutate({ itemId: item.id, qty: reuseQty })}
                                  disabled={markReuseMutation.isPending}
                                  title="Confirmar reaproveitamento"
                                  data-testid={`button-reuse-confirm-${item.id}`}
                                  style={{ backgroundColor: "#047857", color: "#fff", border: "none", borderRadius: 6, height: 26, padding: "0 8px", fontSize: 10, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
                                >
                                  OK
                                </button>
                                <button
                                  onClick={() => setReuseConfirmItemId(null)}
                                  title="Cancelar"
                                  style={{ background: "none", border: `1px solid ${TI.border}`, borderRadius: 6, height: 26, padding: "0 6px", fontSize: 10, fontWeight: 700, color: TI.muted, cursor: "pointer" }}
                                >
                                  <X style={{ width: 10, height: 10 }} />
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={e => { e.stopPropagation(); setReuseConfirmItemId(item.id); setReuseQty(remainingReuse(item)); }}
                                title={`Reaproveitar (pula produção) — até ${remainingReuse(item)} un.`}
                                data-testid={`button-reuse-${item.id}`}
                                style={{ background: "none", border: "none", cursor: "pointer", color: "#059669", padding: 4, borderRadius: 6, display: "flex", alignItems: "center", transition: "color 0.15s" }}
                                onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.color = "#065f46")}
                                onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.color = "#059669")}
                              >
                                <RotateCcw style={{ width: 15, height: 15 }} />
                              </button>
                            )
                          )}

                          {/* Corrigir reaproveitamento — para quando a marcação foi
                              feita errada, total ou parcial, e a peça ainda não
                              começou a ser conferida nem entregue.
                              O `isProduced` sozinho escondia o caso mais comum:
                              a quantidade sai errada e o erro é notado antes de
                              produzir, com a peça em "Pronto p/ Produção". O
                              admin corrige em qualquer etapa anterior à
                              conferência; para a Gráfica segue como estava. */}
                          {(isProduced(item) || isAdmin) && reusedTotalOf(item) > 0
                            && conferredOf(item) === 0 && deliveredOf(item) === 0 && (
                            correctReuseItemId === item.id ? (
                              <div style={{ display: "flex", alignItems: "center", gap: 4 }} onClick={e => e.stopPropagation()}>
                                {/* Rótulo explícito: sem ele este campo fica ao
                                    lado do de "Produzir", que também é um
                                    número seguido de "de N" — dava para digitar
                                    no lugar errado sem perceber. */}
                                <span style={{ fontSize: 11, fontWeight: 700, color: "#b45309", whiteSpace: "nowrap" }}>Reaprov.:</span>
                                {/* O teto era quantidade-1, então quem marcou
                                    parcial por engano não conseguia voltar para
                                    reaproveitamento total. O admin alcança o
                                    total; para a Gráfica o limite continua
                                    sendo o parcial. */}
                                <input
                                  type="number"
                                  min={0}
                                  max={isAdmin ? qtyOf(item) : qtyOf(item) - 1}
                                  value={correctReuseQty}
                                  autoFocus
                                  onFocus={e => e.currentTarget.select()}
                                  onChange={e => setCorrectReuseQty(Math.max(0, Math.min(isAdmin ? qtyOf(item) : qtyOf(item) - 1, parseInt(e.target.value) || 0)))}
                                  aria-label="Quantidade reaproveitada corrigida"
                                  title={`Quantas unidades reaproveitadas (0 a ${isAdmin ? qtyOf(item) : qtyOf(item) - 1})`}
                                  style={{ width: 52, height: 26, padding: "0 6px", borderRadius: 6, border: "1px solid #fbbf24", fontSize: 11, fontWeight: 700, color: TI.text, textAlign: "center" }}
                                />
                                <span style={{ fontSize: 10, color: TI.secondary, whiteSpace: "nowrap" }}>de {qtyOf(item)}</span>
                                <button
                                  onClick={() => correctReuseMutation.mutate({ itemId: item.id, correctedReuseQty: correctReuseQty })}
                                  disabled={correctReuseMutation.isPending}
                                  title="Confirmar correção"
                                  style={{ backgroundColor: "#b45309", color: "#fff", border: "none", borderRadius: 6, height: 26, padding: "0 8px", fontSize: 10, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
                                >
                                  OK
                                </button>
                                <button
                                  onClick={() => setCorrectReuseItemId(null)}
                                  title="Cancelar"
                                  style={{ background: "none", border: `1px solid ${TI.border}`, borderRadius: 6, height: 26, padding: "0 6px", fontSize: 10, fontWeight: 700, color: TI.muted, cursor: "pointer" }}
                                >
                                  <X style={{ width: 10, height: 10 }} />
                                </button>
                              </div>
                            ) : (
                              /* Era um ícone solto com o texto só no `title`:
                                 ninguém achava o caminho para corrigir. Com
                                 rótulo, a ação fica óbvia ao lado do número
                                 errado. E o campo abre com a quantidade ATUAL,
                                 não com quantidade-1 — quem corrige parte do
                                 valor que está lá, não de um chute. */
                              <button
                                onClick={e => { e.stopPropagation(); setCorrectReuseItemId(item.id); setCorrectReuseQty(reusedTotalOf(item)); }}
                                title="Corrigir a quantidade reaproveitada desta peça"
                                aria-label={`Corrigir reaproveitamento de ${item.displayId}`}
                                data-testid={`button-correct-reuse-${item.id}`}
                                style={{ background: "#fff7ed", border: "1px solid #fed7aa", cursor: "pointer", color: "#b45309", height: 26, padding: "0 9px", borderRadius: 6, display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, whiteSpace: "nowrap", transition: "background-color 0.15s" }}
                                onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.backgroundColor = "#ffedd5")}
                                onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.backgroundColor = "#fff7ed")}
                              >
                                <RotateCcw style={{ width: 12, height: 12 }} />
                                Corrigir reaprov.
                              </button>
                            )
                          )}

                          {/* Conferir — etapa entre Produzido e Entregue (com foto);
                              gate igual ao do servidor (grafica/admin) */}
                          {canProduce && canConfer(item) && (
                            <button
                              onClick={() => openConferenceModal(item)}
                              title={`Conferir (faltam ${remainingConfer(item)} de ${qtyOf(item)})`}
                              data-testid={`button-confer-${item.id}`}
                              style={{
                                backgroundColor: "#0e7490", color: "#ffffff",
                                border: "none", borderRadius: 6, height: 30, padding: "0 12px",
                                fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em",
                                cursor: "pointer", display: "flex", alignItems: "center", gap: 4,
                                transition: "background-color 0.15s",
                              }}
                              onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#155e75"}
                              onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#0e7490"}
                            >
                              <CheckCircle style={{ width: 11, height: 11 }} />
                              {conferredOf(item) > 0 ? `Conferir ${remainingConfer(item)}` : "Conferir"}
                            </button>
                          )}

                          {/* Checkbox seleção em lote — nos DOIS modos (a
                              conferência em lote não tinha checkbox na tabela) */}
                          {bulkOn && bulkEligible && (
                            <div
                              role="checkbox"
                              tabIndex={0}
                              aria-checked={isSelected}
                              aria-label={`Selecionar ${item.displayId} para ${bulkConferMode ? 'conferência' : 'entrega'}`}
                              onClick={e => { e.stopPropagation(); toggleBulkItem(item.id); }}
                              // Mesmo suporte a teclado do card mobile: sem isto
                              // o role="checkbox" nem recebia foco.
                              onKeyDown={e => {
                                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); toggleBulkItem(item.id); }
                              }}
                              style={{ width: 26, height: 26, borderRadius: 6, flexShrink: 0, border: `2px solid ${isSelected ? TI.accent : '#d4d4d0'}`, background: isSelected ? TI.accent : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.12s' }}
                            >
                              {isSelected && <Check style={{ width: 13, height: 13, color: '#fff' }} />}
                            </div>
                          )}
                          {/* Entregar — reaproveitamento: direto; normal: o que já foi conferido */}
                          {canDeliver(item) && (
                            <button
                              onClick={() => openDeliveryModal(item)}
                              title={`Entregar (${remainingDeliver(item)} conferido(s) pendente(s))`}
                              data-testid={`button-deliver-${item.id}`}
                              style={{
                                // #c2410c: branco sobre #f97316 dava ~2.8:1 (reprova AA)
                                backgroundColor: "#c2410c", color: "#ffffff",
                                border: "none", borderRadius: 6, height: 30, padding: "0 12px",
                                fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em",
                                cursor: "pointer", display: "flex", alignItems: "center", gap: 4,
                                transition: "background-color 0.15s",
                              }}
                              onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#9a3412"}
                              onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#c2410c"}
                            >
                              <Truck style={{ width: 11, height: 11 }} />
                              {deliveredOf(item) > 0 ? `Entregar ${remainingDeliver(item)}` : "Entregar"}
                            </button>
                          )}

                          {/* Entregue */}
                          {isDelivered(item) && (
                            <span style={{ fontSize: 13, color: "#15803d", display: "inline-flex", alignItems: "center", gap: 4, fontWeight: 600 }}>
                              <Check style={{ width: 13, height: 13 }} /> Entregue
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* MOTIVO DO AUMENTO — linha de largura total logo abaixo do
                        complemento, no mesmo molde da de observações (as duas
                        coexistem). SEM truncar: a observação corta com
                        reticências porque é acessório; aqui a justificativa é a
                        informação principal, e é o "isso fica nos logs" do
                        pedido resolvido sem abrir ficha nenhuma. Some junto com
                        o resto do realce quando o lote é entregue. */}
                    {coAberto && item.complementReason && (
                      <tr style={{ backgroundColor: CO.bg, borderBottom: `1px solid ${CO.border}` }}>
                        <td colSpan={COLS} style={{ padding: "5px 16px 7px 34px" }}>
                          <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
                            <PlusCircle style={{ width: 12, height: 12, color: CO.text, marginTop: 1, flexShrink: 0 }} />
                            <span style={{ fontSize: 11, color: CO.textStrong, lineHeight: 1.4 }} data-testid={`text-motivo-complemento-${item.id}`}>
                              <strong>
                                Aumento pedido{item.complementRequestedBy ? ` por ${item.complementRequestedBy}` : ""}
                              </strong>
                              {item.complementRequestedAt ? ` (${fmtDataHora(item.complementRequestedAt)})` : ""}: {item.complementReason}
                            </span>
                          </div>
                        </td>
                      </tr>
                    )}

                    {/* Linha de observação */}
                    {item.observations && (
                      <tr style={{ backgroundColor: "#fffbeb", borderBottom: "1px solid #fde68a" }}>
                        <td colSpan={COLS} style={{ padding: "8px 16px" }}>
                          <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                            <AlertCircle style={{ width: 14, height: 14, color: "#d97706", marginTop: 1, flexShrink: 0 }} />
                            <span style={{ fontSize: 13, color: "#92400e" }}>
                              <strong>Observações:</strong> {item.observations}
                            </span>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          </div>
        )}

        {/* Rodapé da tabela */}
        {filteredItems.length > 0 && (
          <div style={{ borderTop: `1px solid ${TI.border}`, padding: "10px 16px", backgroundColor: "#fafaf9", fontSize: 13, color: TI.secondary }}>
            Exibindo <strong style={{ color: TI.text }}>{filteredItems.length}</strong> peça{filteredItems.length !== 1 ? "s" : ""}
            {/* O complemento é +1 linha na contagem (é peça de verdade, com
                produção própria). Dizer quantas são evita a pergunta "por que
                agora são 43 se o evento tem 42?". */}
            {(() => {
              const n = (filteredItems as any[]).filter((i: any) => isComplement(i)).length;
              return n > 0 ? <span style={{ color: CO.text }}> ({n} complemento{n !== 1 ? "s" : ""})</span> : null;
            })()}
            {" · "}
            <strong style={{ color: TI.text }}>{Array.from(new Set(filteredItems.map((i: any) => i.eventId).filter(Boolean))).length}</strong> evento{Array.from(new Set(filteredItems.map((i: any) => i.eventId).filter(Boolean))).length !== 1 ? "s" : ""}
            {(() => {
              // O total que importa para a Gráfica é o que AINDA vai ser
              // impresso: peça entregue já saiu da fila e não entra na soma
              // (nem na economia — senão o entregue viraria "economia" falsa).
              const pending = filteredItems.filter((i: any) => !isDelivered(i));
              const totalM2 = pending.reduce((s: number, i: any) => s + (Number(i.calculatedM2) || 0), 0);
              const printM2 = pending.reduce((s: number, i: any) => s + m2ToProduce(i), 0);
              const reusedUn = pending.reduce((s: number, i: any) => s + reusedTotalOf(i), 0);
              if (!totalM2) return null;
              return (
                <>
                  {" · "}<strong style={{ color: TI.text }}>{printM2.toFixed(2)} m²</strong> a produzir
                  {reusedUn > 0 && (
                    <span style={{ color: "#059669" }}>
                      {" "}(economia de {(totalM2 - printM2).toFixed(2)} m² · {reusedUn} un. reaproveitada{reusedUn !== 1 ? "s" : ""})
                    </span>
                  )}
                </>
              );
            })()}
          </div>
        )}
      </div>

      {/* ── Barra flutuante dos modos em lote (entrega OU conferência) ── */}
      {bulkOn && (
        <div
          role="toolbar"
          aria-label={bulkConferMode ? "Ações da conferência em lote" : "Ações da entrega em lote"}
          style={{
            position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
            background: TI.text,
            padding: '12px 16px',
            display: 'flex', alignItems: 'center', gap: 10,
            boxShadow: '0 -4px 24px rgba(0,0,0,0.28)',
          }}>
          {/* Selecionar tudo / desmarcar */}
          <button
            onClick={() => allDeliverableSelected
              ? setBulkSelectedIds(new Set())
              : setBulkSelectedIds(new Set(bulkEligibleList.map((i: any) => i.id)))
            }
            style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
          >
            {allDeliverableSelected ? 'Desmarcar' : `Sel. ${bulkEligibleList.length}`}
          </button>

          {/* Contador — aria-live anuncia a contagem a cada seleção */}
          <span aria-live="polite" style={{ flex: 1, color: bulkSelectedIds.size > 0 ? '#fff' : 'rgba(255,255,255,0.72)', fontSize: 13, fontWeight: 700, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {bulkSelectedIds.size > 0
              ? `${bulkSelectedIds.size} peça${bulkSelectedIds.size !== 1 ? 's' : ''} selecionada${bulkSelectedIds.size !== 1 ? 's' : ''}`
              : 'Toque nas peças para selecionar'}
          </span>

          {/* Confirmar — aria-disabled (não disabled) para poder receber o foco
              ao entrar no modo; o onClick já ignora o clique sem seleção. */}
          <button
            ref={bulkConfirmRef}
            onClick={() => { if (bulkSelectedIds.size > 0) (bulkConferMode ? setBulkConferOpen(true) : setBulkDeliveryOpen(true)); }}
            aria-disabled={bulkSelectedIds.size === 0}
            style={{
              padding: '12px 18px', borderRadius: 12, border: 'none', flexShrink: 0,
              background: bulkSelectedIds.size === 0 ? 'rgba(255,255,255,0.15)' : bulkConferMode ? '#0e7490' : '#c2410c',
              color: bulkSelectedIds.size === 0 ? 'rgba(255,255,255,0.35)' : '#fff',
              fontSize: 13, fontWeight: 800, fontFamily: "'Space Grotesk', sans-serif",
              cursor: bulkSelectedIds.size === 0 ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 7,
              boxShadow: bulkSelectedIds.size > 0 ? (bulkConferMode ? '0 4px 16px rgba(14,116,144,0.4)' : '0 4px 16px rgba(194,65,12,0.4)') : 'none',
              transition: 'all 0.15s',
            }}
          >
            {bulkConferMode ? <CheckCircle style={{ width: 15, height: 15 }} /> : <Truck style={{ width: 15, height: 15 }} />}
            Confirmar{bulkSelectedIds.size > 0 && ` (${bulkSelectedIds.size})`}
          </button>

          {/* Cancelar modo */}
          <button
            onClick={() => { setBulkDeliveryMode(false); setBulkConferMode(false); setBulkSelectedIds(new Set()); }}
            style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(255,255,255,0.1)', border: 'none', color: 'rgba(255,255,255,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
          >
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>
      )}

      {/* ── Dialogs dos modos em lote (componente único, ver BulkActionDialog) ── */}
      <BulkActionDialog
        mode="deliver"
        open={bulkDeliveryOpen}
        onClose={() => { setBulkDeliveryOpen(false); setBulkDeliveryPhotos([]); }}
        items={bulkSelectedItems}
        photos={bulkDeliveryPhotos}
        onAddPhoto={addBulkPhoto}
        onRemovePhoto={url => setBulkDeliveryPhotos(prev => prev.filter(u => u !== url))}
        onPhotoError={onPhotoError}
        notes={bulkDeliveryNotes}
        onNotesChange={setBulkDeliveryNotes}
        receivedBy={bulkReceivedBy}
        onReceivedByChange={setBulkReceivedBy}
        isSubmitting={isBulkSubmitting}
        onConfirm={handleBulkDelivery}
        qtyFor={remainingDeliver}
      />
      <BulkActionDialog
        mode="confer"
        open={bulkConferOpen}
        onClose={() => { setBulkConferOpen(false); setBulkConferPhotos([]); }}
        items={bulkSelectedItems}
        photos={bulkConferPhotos}
        onAddPhoto={addBulkConferPhoto}
        onRemovePhoto={url => setBulkConferPhotos(prev => prev.filter(u => u !== url))}
        onPhotoError={onPhotoError}
        notes={bulkConferNotes}
        onNotesChange={setBulkConferNotes}
        isSubmitting={isBulkSubmitting}
        onConfirm={handleBulkConference}
        qtyFor={remainingConfer}
      />

      {/* ── Dialog de Detalhes ── */}
      {/* O bloco de complemento da ficha é o MESMO componente das outras telas —
          zero desenho novo. Na mãe: a lista de complementos com status e o total
          realmente contratado; no filho: "complemento de #0062" com motivo,
          autor e data. `onAbrirPeca` resolve o beco sem saída — do complemento
          (que nunca tem o gatilho) chega-se à mãe em um clique.
          `temBlocoDeComplemento` é obrigatório: o slot é testado por verdade do
          nó, e um elemento que renderiza null deixa 36px de buraco em toda peça
          normal. */}
      <ItemDetailsDialog
        item={viewDetailsItem}
        auditLogs={auditLogs}
        open={!!viewDetailsItem}
        onOpenChange={(open) => !open && setViewDetailsItem(null)}
        customActions={temBlocoDeComplemento(viewDetailsItem, podeMexerQtd)
          ? (
            <ComplementoDaFicha
              item={viewDetailsItem}
              canEditLists={podeMexerQtd}
              onAumentar={abrirComplemento}
              onAbrirPeca={(id) => setViewDetailsItem((items as any[]).find((i: any) => i.id === id) ?? viewDetailsItem)}
            />
          )
          : undefined}
      />

      {/* ── Aumentar quantidade: o modal, montado uma vez para a tela ── */}
      <AumentarQuantidadeDialog
        item={complementoItem}
        event={complementoItem?.event ?? null}
        open={!!complementoItem}
        onOpenChange={(o) => { if (!o) setComplementoItem(null); }}
        onCreated={handleComplementoCriado}
      />

      {/* ── Modal de Produção / Entrega ── */}
      <Dialog open={!!selectedItem && !!modalType} onOpenChange={open => { if (!open) { setSelectedItem(null); setModalType(null); } }}>
        <DialogContent className={HIDE_NATIVE_CLOSE} style={modalSurface(468)}>
          <DialogTitle className="sr-only">
            {modalType === "production" ? "Registrar produção"
              : modalType === "conference" ? "Conferir peça"
              : "Confirmar entrega"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {modalType === "production" ? "Registre a quantidade produzida desta peça"
              : modalType === "conference" ? "Anexe a foto da conferência e confirme a quantidade"
              : "Registre quem recebeu o material e confirme a entrega"}
          </DialogDescription>

          {/* rgba(255,255,255,0.4) media ~3.9:1 sobre o cabeçalho escuro — a
              legenda que diz o que fazer era a coisa menos legível do modal. */}
          <ModalHeader
            icon={modalType === "production" ? Play : modalType === "conference" ? CheckCircle : Truck}
            tint={TI.accent}
            title={modalType === "production"
              ? (selectedItem?.quantityProduced > 0 ? "Continuar produção" : "Iniciar produção")
              : modalType === "conference" ? "Conferir peça"
              : "Confirmar entrega"}
            subtitle={modalType === "production" ? "Registre a quantidade produzida"
              : modalType === "conference" ? "Anexe a foto da conferência"
              : "Registre a entrega do material"}
            onClose={() => { setSelectedItem(null); setModalType(null); }}
          />

          {/* ── Corpo ── */}
          <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20, overflowY: "auto", maxHeight: "calc(88vh - 112px)" }}>

            {/* Arte aprovada em destaque — na conferência é o que a pessoa
                compara com a peça na mão, quase sempre pelo celular. Precisa ser
                a maior coisa da tela, não uma miniatura ao lado do texto. */}
            {selectedItem?.approvalThumbUrl && modalType !== "production" && (
              <a
                href={convertGCSUrlToLocalPath(selectedItem.approvalThumbUrl)}
                target="_blank"
                rel="noopener noreferrer"
                title="Tocar para abrir em tamanho real"
                data-testid="thumb-approved-art"
                style={{
                  display: "block", position: "relative", width: "100%",
                  height: isMobile ? 240 : 200,
                  // O corpo do modal é um flex column com rolagem: sem
                  // flexShrink 0 este bloco era espremido até uma linha fina
                  // quando o conteúdo passava da altura máxima.
                  flexShrink: 0,
                  borderRadius: 12, overflow: "hidden",
                  backgroundColor: "#ffffff", border: `1px solid ${TI.border}`,
                }}
              >
                <img
                  src={convertGCSUrlToLocalPath(selectedItem.approvalThumbUrl)}
                  alt="Arte aprovada"
                  style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
                  onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                />
                <span style={{ position: "absolute", top: 8, left: 8, backgroundColor: "rgba(28,25,23,0.78)", color: "#fff", fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", padding: "4px 8px", borderRadius: 6 }}>
                  Arte aprovada
                </span>
                <span style={{ position: "absolute", bottom: 8, right: 8, backgroundColor: "rgba(28,25,23,0.78)", color: "#fff", fontSize: 10, fontWeight: 700, padding: "4px 8px", borderRadius: 6, display: "flex", alignItems: "center", gap: 4 }}>
                  <Search style={{ width: 10, height: 10 }} /> Ampliar
                </span>
              </a>
            )}

            {/* Card de identificação */}
            {selectedItem && (
              <div style={{ backgroundColor: "#f4f3f0", borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <div style={{ backgroundColor: "#ffffff", borderRadius: 8, padding: 8, boxShadow: "0 1px 4px rgba(0,0,0,0.08)", flexShrink: 0 }}>
                    {modalType === "production"
                      ? <Printer style={{ width: 20, height: 20, color: TI.accent }} />
                      : modalType === "conference"
                      ? <CheckCircle style={{ width: 20, height: 20, color: "#0891b2" }} />
                      : <Truck style={{ width: 20, height: 20, color: TI.accent }} />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 3 }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                        <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 13, color: selectedItem.isReuse ? '#059669' : '#c2410c' }}>{selectedItem.displayId}</span>
                        {/* Produzir/conferir/entregar um complemento é registrar
                            um LOTE SEPARADO: o modal precisa dizer isso, senão
                            o operador acha que está lançando na peça original. */}
                        {isComplement(selectedItem) && (
                          <span style={{ backgroundColor: CO.solidBg, color: CO.solidText, borderRadius: 5, padding: "1px 6px", fontSize: 9, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
                            Compl. de {parentDisplayIdOf(selectedItem)}
                          </span>
                        )}
                      </span>
                      <StatusPill status={selectedItem.status} size="sm" showDot={false} />
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: TI.text }}>{selectedItem.type}</div>
                    {selectedItem.description && selectedItem.description !== selectedItem.type && (
                      <div style={{ fontSize: 13, color: TI.secondary, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selectedItem.description}</div>
                    )}
                    {selectedItem.event?.name && (
                      <div style={{ fontSize: 13, color: "#746e69", marginTop: 4, display: "flex", alignItems: "center", gap: 5 }}>
                        <Calendar style={{ width: 11, height: 11, flexShrink: 0 }} />
                        {selectedItem.event.name}
                      </div>
                    )}
                  </div>
                </div>

                {/* Grade de specs */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <div style={{ background: '#fff', borderRadius: 8, padding: '8px 10px' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TI.secondary, marginBottom: 3 }}>Material</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: TI.text }}>{selectedItem.material || '—'}</div>
                    {selectedItem.visualWidth && (
                      <div style={{ fontSize: 11, color: TI.secondary, marginTop: 1 }}>{selectedItem.visualWidth} × {selectedItem.visualHeight}m</div>
                    )}
                  </div>
                  <div style={{ background: '#fff', borderRadius: 8, padding: '8px 10px' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TI.secondary, marginBottom: 3 }}>Acabamento</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: TI.text }}>{selectedItem.finish || '—'}</div>
                    {Number(selectedItem.calculatedM2) > 0 && (
                      <div style={{ fontSize: 11, color: TI.secondary, marginTop: 1 }}>{m2ToProduce(selectedItem).toFixed(2)} m²</div>
                    )}
                  </div>
                  <div style={{ background: '#fff', borderRadius: 8, padding: '8px 10px' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TI.secondary, marginBottom: 2 }}>Quantidade</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: TI.text, fontFamily: "'Space Grotesk', sans-serif", lineHeight: 1 }}>{qtyOf(selectedItem)}<span style={{ fontSize: 11, fontWeight: 500, color: TI.secondary, marginLeft: 3 }}>un.</span></div>
                    {selectedItem.isReuse && <div style={{ fontSize: 10, color: '#059669', marginTop: 2, fontWeight: 600 }}>Reaproveitado</div>}
                  </div>
                  {(modalType === "conference" || modalType === "delivery") && (
                    <div style={{ background: modalType === "conference" ? '#ecfeff' : '#fff7ed', borderRadius: 8, padding: '8px 10px', border: `1px solid ${modalType === "conference" ? '#a5f3fc' : '#fed7aa'}` }}>
                      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: modalType === "conference" ? '#0e7490' : '#c2410c', marginBottom: 2 }}>
                        {modalType === "conference" ? "A Conferir" : "A Entregar"}
                      </div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: modalType === "conference" ? '#0891b2' : '#c2410c', fontFamily: "'Space Grotesk', sans-serif", lineHeight: 1 }}>
                        {modalType === "conference" ? remainingConfer(selectedItem) : remainingDeliver(selectedItem)}<span style={{ fontSize: 11, fontWeight: 500, marginLeft: 3 }}>un.</span>
                      </div>
                      {modalType === "conference" && conferredOf(selectedItem) > 0 && (
                        <div style={{ fontSize: 10, color: '#0e7490', marginTop: 2 }}>{conferredOf(selectedItem)} já conferida{conferredOf(selectedItem) !== 1 ? 's' : ''}</div>
                      )}
                      {modalType === "delivery" && deliveredOf(selectedItem) > 0 && (
                        <div style={{ fontSize: 10, color: '#c2410c', marginTop: 2 }}>{deliveredOf(selectedItem)} já entregue{deliveredOf(selectedItem) !== 1 ? 's' : ''}</div>
                      )}
                    </div>
                  )}
                </div>

                {/* Motivo do aumento — quem está com a peça na mão lê aqui por
                    que este lote existe, antes de mandar para a impressora. */}
                {isComplement(selectedItem) && selectedItem.complementReason && (
                  <div style={{ background: CO.bg, border: `1px solid ${CO.border}`, borderRadius: 8, padding: '8px 10px', display: 'flex', gap: 7, alignItems: 'flex-start' }}>
                    <PlusCircle style={{ width: 12, height: 12, color: CO.text, flexShrink: 0, marginTop: 2 }} />
                    <span style={{ fontSize: 13, color: CO.textStrong, lineHeight: 1.4 }}>
                      <strong>
                        Aumento pedido{selectedItem.complementRequestedBy ? ` por ${selectedItem.complementRequestedBy}` : ""}
                      </strong>
                      {selectedItem.complementRequestedAt ? ` (${fmtDataHora(selectedItem.complementRequestedAt)})` : ""}: {selectedItem.complementReason}
                    </span>
                  </div>
                )}

                {/* Observações */}
                {selectedItem.observations && (
                  <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 10px', display: 'flex', gap: 7, alignItems: 'flex-start' }}>
                    <AlertCircle style={{ width: 12, height: 12, color: '#d97706', flexShrink: 0, marginTop: 1 }} />
                    <span style={{ fontSize: 13, color: '#92400e', lineHeight: 1.4 }}>{selectedItem.observations}</span>
                  </div>
                )}
              </div>
            )}

            {/* ── FORM: PRODUÇÃO ── */}
            {selectedItem && modalType === "production" && (
              <form onSubmit={handleSubmitProduction} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                <div>
                  <label style={{ display: "block", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#746e69", marginBottom: 10 }}>
                    Quantidade a Produzir
                  </label>
                  <div style={{ display: "flex", gap: 8 }}>
                    {/* Teto = quantidade − reaproveitadas (a mesma conta do
                        openProductionModal): o reaproveitado não é produzido,
                        e o teto antigo deixava lançar produção acima do real. */}
                    <input
                      type="number"
                      min={1}
                      max={qtyOf(selectedItem) - reusedOf(selectedItem)}
                      value={productionData.quantityProduced}
                      onChange={e => setProductionData({ quantityProduced: parseInt(e.target.value) || 0 })}
                      required
                      data-testid="input-quantity-produced"
                      style={{ flex: 1, textAlign: "center", fontFamily: "'Space Grotesk', sans-serif", fontSize: 26, fontWeight: 700, color: TI.text, backgroundColor: "#f4f3f0", border: "none", borderRadius: 8, padding: "16px 12px" }}
                    />
                    <button
                      type="button"
                      onClick={() => setProductionData({ quantityProduced: qtyOf(selectedItem) - reusedOf(selectedItem) })}
                      data-testid="button-set-total"
                      style={{ backgroundColor: "#e7e5e4", border: "none", borderRadius: 8, padding: "0 20px", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em", color: "#57534e", cursor: "pointer", whiteSpace: "nowrap", transition: "background-color 0.15s" }}
                      onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.backgroundColor = "#d6d3d1")}
                      onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.backgroundColor = "#e7e5e4")}
                    >
                      Tudo
                    </button>
                  </div>
                </div>

                {/* Footer */}
                <div style={modalActionsStyle}>
                  <button
                    type="button"
                    onClick={() => { setSelectedItem(null); setModalType(null); }}
                    style={{ flex: 1, padding: "12px 0", backgroundColor: "transparent", border: "none", color: "#746e69", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", cursor: "pointer", borderRadius: 8, transition: "background-color 0.15s" }}
                    onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.backgroundColor = "#f4f3f0")}
                    onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent")}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={startProductionMutation.isPending || productionData.quantityProduced === 0}
                    data-testid="button-confirm-production"
                    style={{ flex: 2, padding: "12px 0", backgroundColor: TI.text, border: "none", color: "#ffffff", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 13, textTransform: "uppercase", letterSpacing: "-0.01em", cursor: startProductionMutation.isPending || productionData.quantityProduced === 0 ? "not-allowed" : "pointer", borderRadius: 8, opacity: startProductionMutation.isPending || productionData.quantityProduced === 0 ? 0.6 : 1, transition: "background-color 0.15s" }}
                    onMouseEnter={e => { if (!startProductionMutation.isPending && productionData.quantityProduced > 0) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#000000"; }}
                    onMouseLeave={e => { if (!startProductionMutation.isPending) (e.currentTarget as HTMLButtonElement).style.backgroundColor = TI.text; }}
                  >
                    {startProductionMutation.isPending ? "Salvando..." : "Confirmar Produção"}
                  </button>
                </div>
              </form>
            )}

            {/* ── FORM: ENTREGA ── */}
            {selectedItem && modalType === "delivery" && (
              <form onSubmit={handleSubmitDelivery} style={{ display: "flex", flexDirection: "column", gap: 20 }}>

                {/* Responsável */}
                <div>
                  <label style={{ display: "block", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#746e69", marginBottom: 10 }}>
                    Responsável pelo Recebimento *
                  </label>
                  {/* Campo livre: quem recebe muda a cada entrega, e a lista de
                      nomes anteriores mais atrapalhava do que ajudava. */}
                  <input
                    type="text"
                    value={deliveryData.receivedBy}
                    onChange={e => setDeliveryData({ ...deliveryData, receivedBy: e.target.value })}
                    placeholder="Nome de quem recebeu"
                    autoFocus
                    data-testid="input-received-by"
                    style={{ width: "100%", padding: "12px 14px", backgroundColor: "#e8e8e7", border: "1px solid transparent", borderRadius: 8, fontSize: 13, fontWeight: 500, color: TI.text }}
                  />
                </div>

                {/* Quantidade a entregar (entrega parcial) — só exibe se restar mais de 1 */}
                {remainingDeliver(selectedItem) > 1 && (
                  <div>
                    <label style={{ display: "block", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#746e69", marginBottom: 8 }}>
                      Quantidade a entregar agora <span style={{ color: "#746e69", textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>· já entregue {deliveredOf(selectedItem)}/{qtyOf(selectedItem)}, disponível {remainingDeliver(selectedItem)}</span>
                    </label>
                    <input type="number" min={1} max={remainingDeliver(selectedItem)} value={deliverQty}
                      onChange={e => setDeliverQty(Math.max(1, Math.min(remainingDeliver(selectedItem), parseInt(e.target.value) || 1)))}
                      style={{ width: "100%", padding: "10px 14px", backgroundColor: "#e8e8e7", border: "1px solid transparent", borderRadius: 8, fontSize: 15, fontWeight: 700, color: TI.text }} />
                  </div>
                )}

                {/* Comprovante fotográfico */}
                <PhotoPicker photos={photos} onAdd={addPhoto} onRemove={removePhoto} onError={onPhotoError} hint="(opcional) · pode anexar várias" />

                {renderNotesField("Ex.: entregue na portaria, faltou 1 caixa…")}

                {/* Footer */}
                <div style={modalActionsStyle}>
                  <button
                    type="button"
                    onClick={() => { setSelectedItem(null); setModalType(null); }}
                    style={{ flex: 1, padding: "12px 0", backgroundColor: "transparent", border: "none", color: "#746e69", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", cursor: "pointer", borderRadius: 8, transition: "background-color 0.15s" }}
                    onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.backgroundColor = "#f4f3f0")}
                    onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent")}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={markDeliveredMutation.isPending}
                    data-testid="button-confirm-delivery"
                    style={{ flex: 2, padding: "12px 0", backgroundColor: "#15803d", border: "none", color: "#ffffff", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 13, textTransform: "uppercase", letterSpacing: "-0.01em", cursor: markDeliveredMutation.isPending ? "not-allowed" : "pointer", borderRadius: 8, opacity: markDeliveredMutation.isPending ? 0.7 : 1, transition: "background-color 0.15s" }}
                    onMouseEnter={e => { if (!markDeliveredMutation.isPending) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#166534"; }}
                    onMouseLeave={e => { if (!markDeliveredMutation.isPending) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#15803d"; }}
                  >
                    {markDeliveredMutation.isPending ? "Salvando..." : "Confirmar Entrega"}
                  </button>
                </div>
              </form>
            )}

            {selectedItem && modalType === "conference" && (
              <form onSubmit={handleSubmitConference} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                <p style={{ fontSize: 13, color: "#57534e", margin: 0 }}>
                  Confira a peça produzida e anexe a foto. Pode conferir parcialmente — depois é só conferir o restante.
                </p>
                {remainingConfer(selectedItem) > 1 && (
                  <div>
                    <label style={{ display: "block", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#746e69", marginBottom: 8 }}>
                      Quantidade a conferir agora <span style={{ color: "#746e69", textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>· já conferido {conferredOf(selectedItem)}/{qtyOf(selectedItem)}, faltam {remainingConfer(selectedItem)}</span>
                    </label>
                    <input type="number" min={1} max={remainingConfer(selectedItem)} value={conferQty}
                      onChange={e => setConferQty(Math.max(1, Math.min(remainingConfer(selectedItem), parseInt(e.target.value) || 1)))}
                      style={{ width: "100%", padding: "10px 14px", backgroundColor: "#e8e8e7", border: "1px solid transparent", borderRadius: 8, fontSize: 15, fontWeight: 700, color: TI.text }} />
                  </div>
                )}
                <PhotoPicker photos={photos} onAdd={addPhoto} onRemove={removePhoto} onError={onPhotoError} hint="· obrigatória, pode anexar várias" />

                {renderNotesField("Ex.: cor puxando para o escuro, ilhós faltando…")}
                <div style={modalActionsStyle}>
                  <button type="button" onClick={() => { setSelectedItem(null); setModalType(null); }}
                    style={{ flex: 1, padding: "12px 0", backgroundColor: "transparent", border: "none", color: "#746e69", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", cursor: "pointer", borderRadius: 8 }}>
                    Cancelar
                  </button>
                  <button type="submit" disabled={conferMutation.isPending || !photos.length}
                    data-testid="button-confirm-conference"
                    style={{ flex: 2, padding: "12px 0", backgroundColor: (!photos.length) ? "#a5f3fc" : "#0891b2", border: "none", color: "#ffffff", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 13, textTransform: "uppercase", cursor: (conferMutation.isPending || !photos.length) ? "not-allowed" : "pointer", borderRadius: 8, opacity: conferMutation.isPending ? 0.7 : 1 }}>
                    {conferMutation.isPending ? "Salvando..." : "Confirmar Conferência"}
                  </button>
                </div>
              </form>
            )}

          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
