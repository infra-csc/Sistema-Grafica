// ─────────────────────────────────────────────────────────────────────────────
// TRIAGEM — QUADRO DO EVENTO (dono, 14/09).
//
// "Aparecer as peças e ele arrastando para o destino." As peças do evento
// ficam em "A triar"; o operador arrasta cada uma (ou várias selecionadas)
// para Galpão, Manutenção ou Descartar. Nada grava até "Salvar triagem" —
// dá para rearrumar à vontade antes.
//
// O que cada destino grava (as mesmas regras do servidor):
//   · Galpão     → NO_GALPAO, condição Perfeito ou Avaria leve (sem local: o
//                  dono decidiu em 21/09 que o sistema não guarda ONDE a peça
//                  fica no galpão);
//   · Manutenção → EM_MANUTENCAO + Avaria leve (fora do estoque até o reparo);
//   · Descartar  → DESCARTADO + Sucata.
//
// No celular não existe arrastar: toca nas peças e escolhe o destino na barra.
// ITENS POR QUANTIDADE JUNTOS (21/09): um cartão por material, com a soma das
// unidades; "Dividir…" reparte a quantidade entre os destinos. As regras puras
// moram em grupos-da-triagem.ts.
// ─────────────────────────────────────────────────────────────────────────────
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, BookmarkCheck, CheckCircle2, ChevronDown, Package, Search, Split, Table2, Trash2, Undo2, Warehouse, Wrench, X } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useElementSize, useIsMobile, usePonteiroGrosso } from "@/hooks/use-mobile";
import { FS } from "@/lib/theme";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { miniatura } from "@/lib/miniatura";
import { diaEMes, ehRecusaDeJaTriada, recusaPorReserva } from "@shared/estoque";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { HIDE_NATIVE_CLOSE, ModalFooter, ModalHeader, modalSurface } from "@/components/modal-shell";
import { useAcompanharAreaVisivel } from "@/components/grafica/area-visivel";
import {
  DESTINOS_FINAIS, SEM_DISTRIBUICAO, agruparAtivos, ajustarDistribuicao, distribuicaoDasFalhas, distribuido, fraseDoDescarte, moverQuantidade,
  planoDeGravacao, restante, resumoDaGravacao, tudoPara,
  type CondicaoNoGalpao, type Distribuicao, type GrupoDaTriagem, type PassoDeGravacao,
} from "@/components/triagem/grupos-da-triagem";
import type { EnrichedAsset } from "@/lib/inventory-meta";
import type { ReservaDaTriagem } from "@/components/triagem/eventos-da-triagem";

export type DestinoDaTriagem = "triar" | "galpao" | "manutencao" | "descartar";

const COLUNAS: Record<DestinoDaTriagem, { titulo: string; sub: string; cor: string; fundo: string; borda: string; Icon: React.ElementType }> = {
  triar:      { titulo: "A triar",    sub: "Arraste o material para o destino", cor: "#334155", fundo: "#f8fafc", borda: "#e2e8f0", Icon: Package },
  galpao:     { titulo: "Galpão",     sub: "Volta ao estoque",                 cor: "#1e40af", fundo: "#eff6ff", borda: "#bfdbfe", Icon: Warehouse },
  manutencao: { titulo: "Manutenção", sub: "Fora do estoque até o reparo",     cor: "#92400e", fundo: "#fffbeb", borda: "#fde68a", Icon: Wrench },
  descartar:  { titulo: "Descartar",  sub: "Sai do inventário como sucata",    cor: "#991b1b", fundo: "#fef2f2", borda: "#fecaca", Icon: Trash2 },
};
const DESTINOS: DestinoDaTriagem[] = ["galpao", "manutencao", "descartar"];

/** O corpo do PATCH /api/inventory/:id/triage para cada destino. */
export function corpoDaTriagem(destino: Exclude<DestinoDaTriagem, "triar">, condicao: CondicaoNoGalpao) {
  if (destino === "galpao") return { condition: condicao, trackingStatus: "NO_GALPAO" };
  if (destino === "manutencao") return { condition: "AVARIA_LEVE", trackingStatus: "EM_MANUTENCAO" };
  return { condition: "SUCATA", trackingStatus: "DESCARTADO" };
}

/** Cartões montados por coluna de cada vez. O acúmulo em triagem passa de 4 mil
 *  peças e a pilha "Sem evento" sozinha pode ter centenas: montar tudo de uma
 *  vez travava o quadro a cada seleção. O resto entra por "Mostrar mais". */
export const LOTE_DA_COLUNA = 40;

/** Gravações simultâneas. Um PATCH por peça, todos de uma vez, abria centenas
 *  de conexões e o servidor devolvia erro no meio do lote. */
export const GRAVACOES_POR_VEZ = 6;

/** Executa `tarefa` sobre `itens` em grupos de `porVez`, na ordem, e devolve o
 *  resultado de cada um no formato do Promise.allSettled. */
export async function emGrupos<T, R>(itens: T[], porVez: number, tarefa: (item: T) => Promise<R>, aoAvancar?: (feitos: number) => void): Promise<PromiseSettledResult<R>[]> {
  const resultados: PromiseSettledResult<R>[] = [];
  for (let i = 0; i < itens.length; i += porVez) {
    const grupo = await Promise.allSettled(itens.slice(i, i + porVez).map(tarefa));
    resultados.push(...grupo);
    aoAvancar?.(resultados.length);
  }
  return resultados;
}

/** Atalhos do cartão focado — a alternativa de TECLADO ao arrastar. */
export const ATALHO_DO_DESTINO: Record<string, DestinoDaTriagem> = { g: "galpao", m: "manutencao", d: "descartar", t: "triar" };

const ehImagem = (u?: string | null) => !!u && (/\.(png|jpe?g|gif|webp)/i.test(u) || u.startsWith("/objects/"));

/** Chave de seleção/arrasto: a fatia de um grupo numa coluna. A chave do grupo
 *  contém "|", por isso a coluna vem ANTES e o corte é no primeiro "|". */
const fatia = (coluna: DestinoDaTriagem, chave: string) => `${coluna}|${chave}`;
const lerFatia = (f: string): { coluna: DestinoDaTriagem; chave: string } => {
  const i = f.indexOf("|");
  return { coluna: f.slice(0, i) as DestinoDaTriagem, chave: f.slice(i + 1) };
};

// memo: selecionar UM cartão não pode redesenhar as outras dezenas. Por isso
// os handlers chegam estáveis (useCallback) e recebem a coluna e a chave.
const CartaoDoGrupo = memo(function CartaoDoGrupo({ grupo, coluna, quantidade, reservadas, saida, selecionada, fantasma, podeArrastar, condicao, onCondicao, onAlternar, onArrastar, onSoltar, onAtalho, onDividir, alvo }: {
  grupo: GrupoDaTriagem;
  coluna: DestinoDaTriagem;
  /** Unidades do grupo NESTA coluna (em "A triar": o que resta sem destino). */
  quantidade: number;
  reservadas: number;
  saida: string | null;
  selecionada: boolean;
  fantasma: boolean;
  podeArrastar: boolean;
  condicao: CondicaoNoGalpao;
  alvo: number;
  onCondicao: (chave: string, c: CondicaoNoGalpao) => void;
  onAlternar: (f: string) => void;
  onArrastar: (e: React.DragEvent, f: string) => void;
  onSoltar: () => void;
  onAtalho: (f: string, destino: DestinoDaTriagem) => void;
  onDividir: (chave: string) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const f = fatia(coluna, grupo.chave);
  const id = `${coluna}-${grupo.ativos[0].id}`;
  const parcial = quantidade < grupo.unidades;
  const primeiro = grupo.ativos[0].displayId;
  // Duas camadas: o invólucro arrasta e desenha a borda; o miolo é o botão de
  // selecionar. Botões dentro de role="button" seriam controle aninhado.
  return (
    <div
      data-cartao=""
      draggable={podeArrastar}
      onDragStart={(e) => onArrastar(e, f)}
      onDragEnd={onSoltar}
      style={{
        display: "flex", flexDirection: "column", borderRadius: 12,
        background: selecionada ? "#fff7ed" : "#fff", cursor: podeArrastar ? "grab" : "pointer", userSelect: "none",
        border: `2px solid ${selecionada ? "#c2410c" : "#e2e8f0"}`,
        boxShadow: selecionada ? "0 0 0 3px rgba(194,65,12,0.15)" : "0 1px 2px rgba(0,0,0,0.05)",
        opacity: fantasma ? 0.4 : 1, transition: "border-color 0.12s, box-shadow 0.12s, opacity 0.12s, background-color 0.12s",
      }}
    >
      <div
        role="button"
        tabIndex={0}
        aria-pressed={selecionada}
        aria-keyshortcuts="G M D T"
        aria-label={`${grupo.nome}, ${quantidade} ${quantidade === 1 ? "unidade" : "unidades"}${parcial ? ` de ${grupo.unidades}` : ""}${selecionada ? " — selecionado" : ""}`}
        data-testid={`cartao-triagem-${id}`}
        onClick={() => onAlternar(f)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onAlternar(f); return; }
          // G/M/D/T movem sem mouse (só a tecla pura: Ctrl+D é do navegador).
          const destino = !e.ctrlKey && !e.metaKey && !e.altKey ? ATALHO_DO_DESTINO[e.key.toLowerCase()] : undefined;
          if (destino) { e.preventDefault(); onAtalho(f, destino); }
        }}
        style={{ display: "flex", flexDirection: "column", gap: 8, padding: "10px 10px 8px", borderRadius: 10 }}
      >
        <div style={{ display: "flex", gap: 10, alignItems: "center", minWidth: 0 }}>
          <div style={{ width: 44, height: 44, borderRadius: 8, overflow: "hidden", background: "#f1f5f9", border: "1px solid #e2e8f0", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {ehImagem(grupo.miniatura) ? <img src={miniatura(grupo.miniatura!)} alt="" loading="lazy" draggable={false} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <Package size={16} color="#94a3b8" aria-hidden="true" />}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div title={grupo.nome} style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{grupo.nome}</div>
            {grupo.patrocinadores.length > 0 && (
              <div style={{ fontSize: 12, color: "#475569", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{grupo.patrocinadores.join(" · ")}</div>
            )}
            <div style={{ fontFamily: "DM Mono, monospace", fontSize: 11, fontWeight: 600, color: "#9a3412", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {primeiro}{grupo.ativos.length > 1 ? ` +${grupo.ativos.length - 1}` : ""}
            </div>
          </div>
          {/* A QUANTIDADE é a informação do cartão: número grande, unidade pequena. */}
          <div data-testid={`quantidade-${id}`} style={{ flexShrink: 0, textAlign: "right", lineHeight: 1 }}>
            <span style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 22, fontWeight: 700, color: "#0f172a", fontVariantNumeric: "tabular-nums" }}>{quantidade}</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: "#64748b", marginLeft: 3 }}>un.</span>
            {parcial && <div style={{ fontSize: 11, color: "#64748b", marginTop: 3 }}>de {grupo.unidades}</div>}
          </div>
          {selecionada && <CheckCircle2 size={18} color="#c2410c" aria-hidden="true" style={{ flexShrink: 0 }} />}
        </div>
        {reservadas > 0 && (
          <span style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 4, maxWidth: "100%", fontSize: 11, fontWeight: 700, color: "#1d4ed8", background: "#eff6ff", borderRadius: 6, padding: "2px 7px" }}>
            <BookmarkCheck size={11} aria-hidden="true" style={{ flexShrink: 0 }} /> {reservadas === 1 ? "1 reservada" : `${reservadas} reservadas`}{saida ? ` · saída ${diaEMes(saida)}` : ""}
          </span>
        )}
      </div>

      {coluna === "galpao" && (
        <div role="radiogroup" aria-label={`Condição de ${grupo.nome} no galpão`} style={{ display: "flex", gap: 4, padding: "0 10px 8px" }}>
          {([["PERFEITO", "Perfeito"], ["AVARIA_LEVE", "Avaria leve"]] as const).map(([valor, rotulo]) => {
            const ativa = condicao === valor;
            return (
              <button key={valor} type="button" role="radio" aria-checked={ativa} data-testid={`condicao-${valor}-${id}`}
                onClick={() => onCondicao(grupo.chave, valor)}
                style={{ flex: 1, height: alvo, borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: "pointer", border: `1px solid ${ativa ? (valor === "PERFEITO" ? "#15803d" : "#b45309") : "#e2e8f0"}`, background: ativa ? (valor === "PERFEITO" ? "#f0fdf4" : "#fffbeb") : "#fff", color: ativa ? (valor === "PERFEITO" ? "#15803d" : "#b45309") : "#475569", transition: "background-color 0.12s, border-color 0.12s, color 0.12s" }}>
                {rotulo}
              </button>
            );
          })}
        </div>
      )}

      {grupo.unidades > 1 && (
        <div style={{ display: "flex", gap: 4, padding: "0 10px 10px" }}>
          <button type="button" data-testid={`dividir-${id}`} onClick={() => onDividir(grupo.chave)}
            style={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5, height: alvo, borderRadius: 7, border: "1px solid #e2e8f0", background: "#f8fafc", color: "#334155", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
            <Split size={13} aria-hidden="true" /> Dividir…
          </button>
          <button type="button" data-testid={`ver-pecas-${id}`} aria-expanded={aberto} onClick={() => setAberto((v) => !v)}
            style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4, height: alvo, padding: "0 10px", borderRadius: 7, border: "1px solid #e2e8f0", background: "#fff", color: "#475569", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
            {grupo.ativos.length} {grupo.ativos.length === 1 ? "registro" : "registros"} <ChevronDown size={13} aria-hidden="true" style={{ transform: aberto ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
          </button>
        </div>
      )}
      {aberto && (
        <ul data-testid={`pecas-${id}`} style={{ listStyle: "none", margin: 0, padding: "0 10px 10px", display: "flex", flexWrap: "wrap", gap: 4, maxHeight: 132, overflowY: "auto" }}>
          {grupo.ativos.map((a) => (
            <li key={a.id} style={{ fontFamily: "DM Mono, monospace", fontSize: 11, color: "#334155", background: "#f1f5f9", borderRadius: 5, padding: "2px 6px" }}>
              {a.displayId}{(a.quantity ?? 1) > 1 ? ` ×${a.quantity}` : ""}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});

/** O controle "ajustar pela quantidade": três campos e o resto ao vivo. */
function DividirGrupo({ grupo, inicial, reservadas, toque, onAplicar, onFechar }: {
  grupo: GrupoDaTriagem;
  inicial: Distribuicao;
  /** Unidades RESERVADAS do grupo: são as primeiras a ir para o Galpão. */
  reservadas: number;
  toque: boolean;
  onAplicar: (d: Distribuicao) => void;
  onFechar: () => void;
}) {
  const isMobile = useIsMobile();
  const superficieRef = useRef<HTMLDivElement>(null);
  useAcompanharAreaVisivel(superficieRef, "centro", isMobile);
  const [d, setD] = useState<Distribuicao>(inicial);
  const resta = restante(grupo.unidades, d);
  const alvo = toque ? 44 : 38;
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onFechar(); }}>
      <DialogContent ref={superficieRef} data-testid="dialogo-dividir" className={HIDE_NATIVE_CLOSE} style={modalSurface(460)}>
        <DialogTitle className="sr-only">Dividir {grupo.nome}</DialogTitle>
        <DialogDescription className="sr-only">Distribua as {grupo.unidades} unidades entre Galpão, Manutenção e Descartar.</DialogDescription>
        <ModalHeader icon={Split} tint="#c2410c" title={grupo.nome} subtitle={`${grupo.unidades} unidades — quantas vão para cada destino?`} onClose={onFechar} />
        <div style={{ padding: isMobile ? 16 : 24, overflowY: "auto", flex: "1 1 auto", minHeight: 0, display: "flex", flexDirection: "column", gap: 14 }}>
          {DESTINOS_FINAIS.map((destino) => {
            const meta = COLUNAS[destino];
            const teto = d[destino] + resta;
            const muda = (v: number) => setD((atual) => ajustarDistribuicao(grupo.unidades, atual, destino, v));
            const passo: React.CSSProperties = { width: alvo, height: alvo, borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", color: "#0f172a", fontSize: 18, fontWeight: 700, cursor: "pointer", flexShrink: 0 };
            return (
              <div key={destino} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span aria-hidden="true" style={{ width: 34, height: 34, borderRadius: 8, background: meta.fundo, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><meta.Icon size={16} color={meta.cor} /></span>
                <label htmlFor={`qtd-${destino}`} style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 700, color: meta.cor }}>
                  {meta.titulo}
                  <span style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#64748b" }}>{meta.sub}</span>
                </label>
                <button type="button" aria-label={`Uma a menos em ${meta.titulo}`} disabled={d[destino] === 0} onClick={() => muda(d[destino] - 1)} style={{ ...passo, opacity: d[destino] === 0 ? 0.4 : 1 }}>−</button>
                <input id={`qtd-${destino}`} data-testid={`qtd-${destino}`} type="text" inputMode="numeric" pattern="[0-9]*" autoComplete="off"
                  value={String(d[destino])}
                  onFocus={(e) => e.currentTarget.select()}
                  onChange={(e) => muda(parseInt(e.target.value.replace(/\D/g, "") || "0", 10))}
                  style={{ width: 64, height: alvo, textAlign: "center", borderRadius: 8, border: "1px solid #cbd5e1", background: "#fff", fontFamily: "Space Grotesk, sans-serif", fontSize: toque ? 16 : 15, fontWeight: 700, color: "#0f172a", fontVariantNumeric: "tabular-nums" }} />
                <button type="button" aria-label={`Uma a mais em ${meta.titulo}`} disabled={resta === 0} onClick={() => muda(d[destino] + 1)} style={{ ...passo, opacity: resta === 0 ? 0.4 : 1 }}>+</button>
                <button type="button" data-testid={`tudo-para-${destino}`} onClick={() => setD(tudoPara(grupo.unidades, destino))} title={`Tudo para ${meta.titulo}`}
                  style={{ height: alvo, padding: "0 10px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#f8fafc", color: "#334155", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
                  {isMobile ? "Tudo" : teto === d[destino] && resta === 0 && d[destino] === grupo.unidades ? "Tudo aqui" : "Tudo"}
                </button>
              </div>
            );
          })}
          <p role="status" aria-live="polite" data-testid="resta-sem-destino" style={{ margin: 0, padding: "10px 12px", borderRadius: 10, fontSize: 13, fontWeight: 600, lineHeight: 1.4, background: resta === 0 ? "#f0fdf4" : "#f8fafc", border: `1px solid ${resta === 0 ? "#bbf7d0" : "#e2e8f0"}`, color: resta === 0 ? "#166534" : "#334155" }}>
            {resta === 0 ? `As ${grupo.unidades} unidades têm destino.` : `${resta === 1 ? "Resta 1" : `Restam ${resta}`} sem destino — ${resta === 1 ? "continua" : "continuam"} aguardando triagem.`}
          </p>
          {/* Reservada só sai da triagem para o Galpão (o servidor recusa o
              resto): avisa AQUI, antes de chegar ao Salvar. */}
          {reservadas > d.galpao + resta && (
            <p role="alert" data-testid="aviso-reservadas-dividir" style={{ margin: 0, padding: "10px 12px", borderRadius: 10, fontSize: 13, fontWeight: 600, lineHeight: 1.4, background: "#eff6ff", border: "1px solid #bfdbfe", color: "#1e40af" }}>
              {reservadas === 1 ? "1 unidade está reservada" : `${reservadas} unidades estão reservadas`} para outro evento e só {reservadas === 1 ? "pode" : "podem"} ir para o Galpão. Deixe pelo menos {reservadas - resta} no Galpão, ou libere a reserva.
            </p>
          )}
        </div>
        <ModalFooter>
          <div style={{ display: "flex", gap: 8, paddingBottom: "calc(0px + env(safe-area-inset-bottom, 0px))" }}>
            <button type="button" data-testid="dividir-zerar" onClick={() => setD(SEM_DISTRIBUICAO)}
              style={{ height: 44, padding: "0 14px", borderRadius: 10, border: "1px solid #e2e8f0", background: "#fff", color: "#475569", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Zerar</button>
            <button type="button" data-testid="dividir-aplicar" onClick={() => onAplicar(d)}
              style={{ flex: 1, height: 44, borderRadius: 10, border: "none", background: "#c2410c", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>Aplicar no quadro</button>
          </div>
        </ModalFooter>
      </DialogContent>
    </Dialog>
  );
}

export function QuadroDaTriagem({ evento, ativos, reservaPorAtivo, onVoltar, onTabela, onConcluido }: {
  evento: { id: string; nome: string; data: string | null };
  ativos: EnrichedAsset[];
  reservaPorAtivo: Map<string, ReservaDaTriagem>;
  onVoltar: () => void;
  onTabela: () => void;
  onConcluido: () => void;
}) {
  const isMobile = useIsMobile();
  const { toast } = useToast();
  // MODO GALPÃO: o quadro é usado em tablet no chão do galpão. Um tablet de
  // 768px+ não é "mobile" para o useIsMobile, mas é dedo e não mouse — e
  // arrastar (HTML5 drag) nem existe em tela de toque. O efeito que fazia esta
  // detecção aqui virou `usePonteiroGrosso` (use-mobile.tsx): era a única
  // cópia dela no app e agora todas as telas usam a mesma.
  const toque = isMobile || usePonteiroGrosso();
  // Largura REAL do quadro (não da janela): com a barra lateral aberta, um
  // tablet de 1024px deixa ~700px para quatro colunas de ~160px cada.
  const { ref: refDoQuadro, width: larguraDoQuadro } = useElementSize<HTMLDivElement>();
  const [confirmarSaida, setConfirmarSaida] = useState(false);
  // A arrumação: por GRUPO, quantas unidades em cada destino. O que não tem
  // destino é o que aparece em "A triar".
  // `base` = o total do grupo QUANDO a arrumação foi feita. Se o total mudar
  // (outra pessoa triou parte do grupo), a arrumação daquele grupo não vale
  // mais: é zerada e o quadro avisa. Antes ela era RECORTADA Galpão→Descartar
  // em silêncio — o que ia para Descartar virava Galpão sem ninguém ver.
  const [dist, setDist] = useState<Record<string, { d: Distribuicao; base: number; nome: string }>>({});
  // Registros que ESTA tela já gravou (ou que voltaram 409): saem do quadro
  // na hora, sem esperar a lista recarregar — senão um novo Salvar mandaria o
  // plano de novo para eles (409 falso) e apagaria a arrumação que sobrou.
  const [jaGravados, setJaGravados] = useState<ReadonlySet<string>>(() => new Set());
  const [atualizando, setAtualizando] = useState(false);
  const [condicoes, setCondicoes] = useState<Record<string, CondicaoNoGalpao>>({});
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [arrastando, setArrastando] = useState<string[] | null>(null);
  const [sobre, setSobre] = useState<DestinoDaTriagem | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [gravadas, setGravadas] = useState(0);
  const [aGravar, setAGravar] = useState(0);
  const [confirmarDescarte, setConfirmarDescarte] = useState(false);
  const [dividindo, setDividindo] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [mostrando, setMostrando] = useState<Record<DestinoDaTriagem, number>>({ triar: LOTE_DA_COLUNA, galpao: LOTE_DA_COLUNA, manutencao: LOTE_DA_COLUNA, descartar: LOTE_DA_COLUNA });
  // Dito ao leitor de tela a cada movimento: o cartão muda de coluna em silêncio.
  const [anuncio, setAnuncio] = useState("");

  // ITENS POR QUANTIDADE JUNTOS (dono, 21/09): uma passada, Map por chave.
  const ativosVivos = useMemo(() => (jaGravados.size ? ativos.filter((a) => !jaGravados.has(a.id)) : ativos), [ativos, jaGravados]);
  const grupos = useMemo(() => agruparAtivos(ativosVivos), [ativosVivos]);
  const grupoPorChave = useMemo(() => new Map(grupos.map((g) => [g.chave, g])), [grupos]);
  // Em UNIDADES (registro ×N reservado conta N), como o resto do quadro.
  const reservaDoGrupo = useMemo(() => {
    const m = new Map<string, { reservadas: number; saida: string | null }>();
    for (const g of grupos) {
      let reservadas = 0; let saida: string | null = null;
      for (const a of g.ativos) {
        const r = reservaPorAtivo.get(a.id);
        if (!r) continue;
        reservadas += a.quantity ?? 1;
        if (r.saida && (!saida || new Date(r.saida) < new Date(saida))) saida = r.saida;
      }
      if (reservadas) m.set(g.chave, { reservadas, saida });
    }
    return m;
  }, [grupos, reservaPorAtivo]);

  // A distribuição só vale para o total em que foi feita. Total diferente =
  // nada distribuído (o efeito abaixo limpa e avisa).
  const distDe = useCallback((g: GrupoDaTriagem): Distribuicao => {
    const e = dist[g.chave];
    if (!e || e.base !== g.unidades) return SEM_DISTRIBUICAO;
    let limpo = SEM_DISTRIBUICAO;
    for (const destino of DESTINOS_FINAIS) limpo = ajustarDistribuicao(g.unidades, limpo, destino, e.d[destino]);
    return limpo;
  }, [dist]);

  // O GRUPO MUDOU DE TAMANHO por fora (outra pessoa triou parte dele, ou
  // voltaram mais unidades): zera a divisão daquele grupo e diz por quê.
  useEffect(() => {
    const mudaram = Object.entries(dist).filter(([chave, e]) => (grupoPorChave.get(chave)?.unidades ?? 0) !== e.base);
    if (mudaram.length === 0) return;
    setDist((prev) => { const n = { ...prev }; for (const [chave] of mudaram) delete n[chave]; return n; });
    const encolheu = mudaram.some(([chave, e]) => (grupoPorChave.get(chave)?.unidades ?? 0) < e.base);
    toast({
      title: encolheu ? "Outra pessoa triou parte deste grupo — refaça a divisão" : "Chegaram mais unidades deste grupo — refaça a divisão",
      description: `${mudaram.map(([, e]) => e.nome).join(", ")}: a divisão foi desfeita e nada foi gravado.`,
      variant: "destructive",
    });
  }, [dist, grupoPorChave, toast]);

  // As quatro colunas numa passada: cada grupo aparece onde tem unidades.
  const termo = busca.trim().toLowerCase();
  const porColuna = useMemo(() => {
    const c: Record<DestinoDaTriagem, { grupo: GrupoDaTriagem; quantidade: number }[]> = { triar: [], galpao: [], manutencao: [], descartar: [] };
    for (const g of grupos) {
      const d = distDe(g);
      const resta = restante(g.unidades, d);
      if (resta > 0) c.triar.push({ grupo: g, quantidade: resta });
      for (const destino of DESTINOS_FINAIS) if (d[destino] > 0) c[destino].push({ grupo: g, quantidade: d[destino] });
    }
    const peso = (x: { grupo: GrupoDaTriagem }) => (reservaDoGrupo.has(x.grupo.chave) ? 0 : 1);
    for (const k of Object.keys(c) as DestinoDaTriagem[]) c[k].sort((x, y) => peso(x) - peso(y));
    return c;
  }, [grupos, distDe, reservaDoGrupo]);
  // A busca recorta só "A triar": é a pilha que cresce.
  const triarNoRecorte = useMemo(() => !termo ? porColuna.triar : porColuna.triar.filter(({ grupo: g }) =>
    g.nome.toLowerCase().includes(termo) || g.patrocinadores.some((p) => p.toLowerCase().includes(termo))
    || g.ativos.some((a) => (a.displayId ?? "").toLowerCase().includes(termo))), [porColuna, termo]);
  const naColuna = (d: DestinoDaTriagem) => (d === "triar" ? triarNoRecorte : porColuna[d]);
  const unidadesEm = (d: DestinoDaTriagem) => porColuna[d].reduce((s, x) => s + x.quantidade, 0);
  const unidadesMovidas = unidadesEm("galpao") + unidadesEm("manutencao") + unidadesEm("descartar");
  const totalDeUnidades = useMemo(() => grupos.reduce((s, g) => s + g.unidades, 0), [grupos]);

  // Mover = levar a quantidade que o grupo tem NA COLUNA DE ORIGEM para o destino.
  const mover = useCallback((fatias: string[], destino: DestinoDaTriagem) => {
    let unidades = 0;
    setDist((prev) => {
      const proximo = { ...prev };
      unidades = 0;
      for (const f of fatias) {
        const { coluna, chave } = lerFatia(f);
        const g = grupoPorChave.get(chave);
        if (!g) continue;
        const e = proximo[chave];
        const atual = e && e.base === g.unidades ? e.d : SEM_DISTRIBUICAO;
        unidades += coluna === "triar" ? restante(g.unidades, atual) : atual[coluna];
        proximo[chave] = { d: moverQuantidade(g.unidades, atual, coluna, destino), base: g.unidades, nome: g.nome };
      }
      return proximo;
    });
    setSelecionadas(new Set());
    setAnuncio(`${unidades} ${unidades === 1 ? "unidade movida" : "unidades movidas"} para ${COLUNAS[destino].titulo}`);
  }, [grupoPorChave]);

  const alternar = useCallback((f: string) =>
    setSelecionadas((prev) => { const n = new Set(prev); if (n.has(f)) n.delete(f); else n.add(f); return n; }), []);

  // A seleção é lida por ref nos handlers estáveis — se entrasse como
  // dependência, todo cartão redesenhava a cada clique e o memo não valia.
  const refSelecionadas = useRef(selecionadas);
  refSelecionadas.current = selecionadas;
  const fatiasDoGesto = (f: string) => (refSelecionadas.current.has(f) ? Array.from(refSelecionadas.current) : [f]);

  const aoArrastar = useCallback((e: React.DragEvent, f: string) => {
    const fatias = fatiasDoGesto(f);
    e.dataTransfer.setData("text/plain", JSON.stringify(fatias));
    e.dataTransfer.effectAllowed = "move";
    setArrastando(fatias);
  }, []);
  const aoSoltar = useCallback(() => { setArrastando(null); setSobre(null); }, []);
  const aoMudarCondicao = useCallback((chave: string, c: CondicaoNoGalpao) => setCondicoes((prev) => ({ ...prev, [chave]: c })), []);
  const aoDividir = useCallback((chave: string) => setDividindo(chave), []);
  // Tecla G/M/D/T no cartão focado. O cartão sai da coluna e o foco iria para
  // o <body>: passa para o vizinho, para triar a pilha inteira só no teclado.
  const aoAtalho = useCallback((f: string, destino: DestinoDaTriagem) => {
    const atual = document.activeElement?.closest("[data-cartao]") as HTMLElement | null;
    const vizinho = (atual?.nextElementSibling ?? atual?.previousElementSibling) as HTMLElement | null;
    const proximo = vizinho?.querySelector<HTMLElement>('[role="button"]')?.dataset.testid;
    mover(fatiasDoGesto(f), destino);
    if (proximo) setTimeout(() => document.querySelector<HTMLElement>(`[data-testid="${proximo}"]`)?.focus(), 0);
  }, [mover]);

  const planos = () => grupos
    .map((g) => ({ grupo: g, d: distDe(g) }))
    .filter(({ d }) => distribuido(d) > 0)
    .map(({ grupo, d }) => ({ grupo, d, plano: planoDeGravacao(grupo, d, condicoes[grupo.chave] ?? "PERFEITO", (id) => reservaPorAtivo.get(id)) }));

  const paraDescartar = porColuna.descartar.map(({ grupo, quantidade }) => ({ nome: grupo.nome, descartar: quantidade, unidades: grupo.unidades }));

  // DESCARTAR é o único destino que destrói (a peça sai do inventário e a
  // triagem não volta atrás pelo app): pede confirmação, com a contagem.
  const salvar = () => {
    if (unidadesMovidas === 0 || salvando || atualizando) return;
    const todos = planos();
    // Registro ×N repartido só em parte: o servidor não guarda "um pedaço
    // aguardando", então a divisão desse registro precisa fechar. (Só sobra
    // quando nenhuma escolha de registros fecha a conta.)
    const incompleto = todos.flatMap((p) => p.plano.incompletos.map((i) => ({ ...i, nome: p.grupo.nome })))[0];
    if (incompleto) {
      toast({ title: `${incompleto.displayId} é um registro de ${incompleto.quantidade} unidades`, description: `Ele precisa ser distribuído inteiro: faltam ${incompleto.faltam} un. de ${incompleto.nome} sem destino.`, variant: "destructive" });
      return;
    }
    // Reservado fora do Galpão: o servidor recusaria (409). Avisa ANTES.
    const conflitos = todos.flatMap((p) => p.plano.conflitos.map((c) => ({ ...c, nome: p.grupo.nome })));
    if (conflitos.length > 0) {
      const [c] = conflitos;
      toast({
        title: conflitos.length === 1 ? "Uma peça reservada iria para fora do Galpão" : `${conflitos.length} peças reservadas iriam para fora do Galpão`,
        description: `${recusaPorReserva(c.displayId, c.reserva)}. Aumente o Galpão de ${c.nome} (ou deixe sem destino) e salve de novo.`,
        variant: "destructive",
      });
      return;
    }
    if (paraDescartar.length > 0) { setConfirmarDescarte(true); return; }
    gravar();
  };

  const gravar = async () => {
    setConfirmarDescarte(false);
    const passos = planos().flatMap((p) => p.plano.passos);
    if (passos.length === 0) return;
    setSalvando(true);
    setGravadas(0);
    setAGravar(passos.length);
    const resultados = await emGrupos(passos, GRAVACOES_POR_VEZ, (p) => apiRequest(p.metodo, p.url, p.corpo), setGravadas);
    // Três desfechos: gravou; OUTRA PESSOA já tinha triado (409 — some na
    // atualização da lista, não é erro de quem está aqui); falhou de verdade.
    let salvas = 0, jaTriadas = 0;
    const falhas: PassoDeGravacao[] = [];
    const saiuDaFila = new Set(jaGravados);
    const unidadesQueSairam: Record<string, number> = {};
    let motivo = "";
    resultados.forEach((r, i) => {
      const p = passos[i];
      if (r.status === "rejected" && !ehRecusaDeJaTriada(r.reason?.message)) { falhas.push(p); motivo ||= r.reason?.message ?? ""; return; }
      if (r.status === "fulfilled") salvas++; else jaTriadas++;
      saiuDaFila.add(p.ativoId);
      unidadesQueSairam[p.chave] = (unidadesQueSairam[p.chave] ?? 0) + p.unidades;
    });
    // A arrumação que fica é só a do que FALHOU — com TODAS as unidades de
    // cada registro (×N volta como N) e o total do grupo JÁ sem o que saiu.
    const resto: Record<string, { d: Distribuicao; base: number; nome: string }> = {};
    for (const [chave, d] of Object.entries(distribuicaoDasFalhas(falhas))) {
      const g = grupoPorChave.get(chave);
      if (g) resto[chave] = { d, base: g.unidades - (unidadesQueSairam[chave] ?? 0), nome: g.nome };
    }
    setJaGravados(saiuDaFila);
    setDist(resto);
    // Salvar fica travado até a lista voltar do servidor: antes, um segundo
    // Salvar nesse meio-tempo mandava o plano para registros já gravados.
    setAtualizando(true);
    setSalvando(false);
    const recarga = Promise.all([
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/awaiting-triage"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/estoque/reservas-ativas"] }),
    ]).finally(() => setAtualizando(false));
    const resumo = resumoDaGravacao(salvas, jaTriadas, falhas.length);
    if (falhas.length > 0) {
      toast({ title: resumo, description: `${motivo ? `${motivo}. ` : ""}As que falharam continuam no destino — tente salvar de novo.`, variant: "destructive" });
    } else {
      const restam = ativos.filter((a) => !saiuDaFila.has(a.id)).length;
      toast({ title: resumo, description: jaTriadas > 0 ? "Outra pessoa triou parte desta pilha — lista atualizada." : restam > 0 ? "Ainda há material deste evento para triar." : "Este evento terminou a triagem." });
      if (restam <= 0) { onConcluido(); return; }
    }
    await recarga;
  };

  // Confirmação no diálogo da casa, e não no window.confirm nativo.
  const voltar = () => {
    if (unidadesMovidas > 0) { setConfirmarSaida(true); return; }
    onVoltar();
  };

  const alvo = toque ? 44 : 38;
  const travado = unidadesMovidas === 0 || salvando || atualizando;
  const layout: "uma" | "tablet" | "larga" =
    larguraDoQuadro === 0 ? (isMobile ? "uma" : "larga")
      : larguraDoQuadro < 600 ? "uma"
        : larguraDoQuadro < 1000 ? "tablet"
          : "larga";

  // FUNÇÃO DE RENDER, não componente: um componente declarado DENTRO do render
  // ganha identidade nova a cada render, o React remonta a coluna inteira e o
  // campo "Local no galpão" perdia o foco a CADA tecla.
  const coluna = (destino: DestinoDaTriagem) => {
    const meta = COLUNAS[destino];
    const todas = naColuna(destino);
    const pecas = todas.slice(0, mostrando[destino]);
    const escondidas = todas.length - pecas.length;
    const total = unidadesEm(destino);
    const destacada = sobre === destino && !!arrastando;
    const todasMarcadas = pecas.length > 0 && pecas.every(({ grupo }) => selecionadas.has(fatia(destino, grupo.chave)));
    return (
      <section
        key={destino}
        aria-label={meta.titulo}
        data-testid={`coluna-triagem-${destino}`}
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (sobre !== destino) setSobre(destino); }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setSobre((s) => (s === destino ? null : s)); }}
        onDrop={(e) => {
          e.preventDefault();
          let fatias = arrastando;
          try { const lidos = JSON.parse(e.dataTransfer.getData("text/plain")); if (Array.isArray(lidos)) fatias = lidos; } catch { /* usa o estado */ }
          if (fatias?.length) mover(fatias, destino);
          setSobre(null); setArrastando(null);
        }}
        style={{
          display: "flex", flexDirection: "column", gap: 10, padding: 12, borderRadius: 16,
          minHeight: layout === "larga" ? 360 : destino === "triar" ? undefined : 140,
          gridColumn: layout === "tablet" && destino === "triar" ? "1 / -1" : undefined,
          background: destacada ? meta.fundo : destino === "triar" ? "#f1f5f9" : "#ffffff",
          border: `2px ${destino === "triar" ? "solid" : "dashed"} ${destacada ? meta.cor : meta.borda}`,
          transition: "background 0.12s, border-color 0.12s",
        }}
      >
        <header style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span aria-hidden="true" style={{ width: 30, height: 30, borderRadius: 8, background: meta.fundo, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <meta.Icon size={15} color={meta.cor} />
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: meta.cor, fontFamily: "Space Grotesk, sans-serif" }}>{meta.titulo}</h2>
            <div style={{ fontSize: 12, color: "#475569" }}>{destino === "triar" && toque ? "Toque no material e escolha o destino" : meta.sub}</div>
          </div>
          <span data-testid={`unidades-${destino}`} aria-label={`${total} ${total === 1 ? "unidade" : "unidades"}`} style={{ minWidth: 26, height: 24, padding: "0 8px", borderRadius: 999, background: meta.fundo, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: meta.cor, fontFamily: "Space Grotesk, sans-serif", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{total} un.</span>
        </header>

        {destino === "triar" && porColuna.triar.length > 8 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <div style={{ position: "relative", flex: "1 1 180px", minWidth: 0 }}>
              <Search size={14} color="#64748b" aria-hidden="true" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
              <input type="search" data-testid="input-busca-quadro" aria-label="Buscar material a triar por nome, código ou patrocinador"
                placeholder="Buscar nesta pilha…" value={busca}
                onChange={(e) => { setBusca(e.target.value); setMostrando((m) => ({ ...m, triar: LOTE_DA_COLUNA })); }}
                style={{ width: "100%", boxSizing: "border-box", height: alvo, padding: "0 10px 0 30px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", fontSize: toque ? 16 : 13, color: "#0f172a" }} />
            </div>
            <button type="button" data-testid="button-selecionar-visiveis" disabled={pecas.length === 0}
              title="Marca só o que está na tela — o resto da pilha entra por Mostrar mais"
              onClick={() => setSelecionadas(todasMarcadas ? new Set() : new Set(pecas.map(({ grupo }) => fatia(destino, grupo.chave))))}
              style={{ height: alvo, padding: "0 12px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", color: "#334155", fontSize: 13, fontWeight: 700, cursor: pecas.length === 0 ? "not-allowed" : "pointer", whiteSpace: "nowrap" }}>
              {todasMarcadas ? "Desmarcar" : `Selecionar os ${pecas.length} visíveis`}
            </button>
          </div>
        )}

        <div style={{
          flex: 1, gap: 8,
          ...(layout === "tablet" && destino === "triar"
            ? { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", alignItems: "start" }
            : { display: "flex", flexDirection: "column" }),
        }}>
          {pecas.length === 0 ? (
            <div style={{ flex: 1, gridColumn: "1 / -1", minHeight: 70, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", fontSize: 13, color: "#64748b", padding: 12 }}>
              {destino === "triar" ? (termo && porColuna.triar.length > 0 ? `Nenhum material com “${busca.trim()}” nesta pilha` : "Tudo arrumado — salve a triagem") : toque ? "Selecione e toque no destino" : "Solte aqui"}
            </div>
          ) : pecas.map(({ grupo, quantidade }) => {
            const f = fatia(destino, grupo.chave);
            const r = reservaDoGrupo.get(grupo.chave);
            return (
              <CartaoDoGrupo
                key={grupo.chave}
                grupo={grupo}
                coluna={destino}
                quantidade={quantidade}
                reservadas={r?.reservadas ?? 0}
                saida={r?.saida ?? null}
                selecionada={selecionadas.has(f)}
                fantasma={!!arrastando?.includes(f)}
                podeArrastar={!isMobile}
                alvo={toque ? 44 : 32}
                condicao={condicoes[grupo.chave] ?? "PERFEITO"}
                onCondicao={aoMudarCondicao}
                onAlternar={alternar}
                onArrastar={aoArrastar}
                onSoltar={aoSoltar}
                onAtalho={aoAtalho}
                onDividir={aoDividir}
              />
            );
          })}
        </div>
        {escondidas > 0 && (
          <button type="button" data-testid={`mostrar-mais-${destino}`}
            onClick={() => setMostrando((m) => ({ ...m, [destino]: m[destino] + LOTE_DA_COLUNA }))}
            style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 44, borderRadius: 10, border: "1px solid #e2e8f0", background: "#fff", color: "#334155", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            <ChevronDown size={15} aria-hidden="true" /> Mostrar mais {Math.min(LOTE_DA_COLUNA, escondidas)} · faltam {escondidas}
          </button>
        )}
      </section>
    );
  };

  const grupoDividindo = dividindo ? grupoPorChave.get(dividindo) : undefined;

  return (
    <div data-testid="quadro-triagem" style={{ display: "flex", flexDirection: "column", gap: 16, paddingBottom: selecionadas.size > 0 ? (isMobile ? 200 : 96) : 0 }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <button type="button" onClick={voltar} data-testid="button-voltar-eventos"
            style={{ display: "inline-flex", alignItems: "center", gap: 6, minHeight: toque ? 44 : 32, background: "none", border: "none", padding: 0, fontSize: 13, fontWeight: 700, color: "#475569", cursor: "pointer", transition: "color 0.12s" }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "#0f172a"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "#475569"; }}>
            <ArrowLeft size={15} aria-hidden="true" /> Eventos da triagem
          </button>
          <h1 style={{ margin: "2px 0 3px", fontSize: FS.h1, fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif", color: "#1c1917", letterSpacing: "-0.03em", lineHeight: 1.15, overflowWrap: "anywhere" }}>{evento.nome}</h1>
          <p aria-live="polite" data-testid="resumo-do-quadro" style={{ margin: 0, fontSize: 13, color: "#475569", lineHeight: 1.45 }}>
            {evento.data ? `Evento ${diaEMes(evento.data)} · ` : ""}{grupos.length} {grupos.length === 1 ? "material" : "materiais"} · {unidadesEm("triar")} de {totalDeUnidades} un. a triar ·{" "}
            {toque ? "toque no material e escolha o destino; Dividir reparte a quantidade" : "arraste o material inteiro, ou use Dividir para repartir a quantidade; no teclado, G, M ou D no cartão"}
            {" · "}nada é gravado até salvar
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", width: isMobile ? "100%" : undefined }}>
          <button type="button" onClick={onTabela} data-testid="button-quadro-tabela" title="A tabela mostra registro por registro, com observação individual"
            style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, height: alvo, padding: "0 14px", borderRadius: 10, border: "1px solid #e2e8f0", background: "#fff", color: "#334155", fontSize: 13, fontWeight: 700, cursor: "pointer", flex: isMobile ? "1 1 100%" : undefined, transition: "background-color 0.12s, border-color 0.12s" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "#f8fafc"; e.currentTarget.style.borderColor = "#cbd5e1"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "#fff"; e.currentTarget.style.borderColor = "#e2e8f0"; }}>
            <Table2 size={15} aria-hidden="true" /> Tabela (registro por registro)
          </button>
          <button type="button" onClick={salvar} data-testid="button-salvar-triagem" disabled={unidadesMovidas === 0 || salvando || atualizando}
            title={unidadesMovidas === 0 ? "Dê destino a pelo menos uma unidade" : `Grava o destino de ${unidadesMovidas} un.`}
            style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, height: alvo, padding: "0 18px", borderRadius: 10, border: "none", fontSize: 14, fontWeight: 700, cursor: travado ? "not-allowed" : "pointer", background: travado ? "#e2e8f0" : "#c2410c", color: travado ? "#64748b" : "#fff", boxShadow: !travado ? "0 4px 14px rgba(194,65,12,0.28)" : "none", flex: isMobile ? "1 1 100%" : undefined, transition: "background-color 0.15s, box-shadow 0.15s" }}>
            <CheckCircle2 size={16} aria-hidden="true" /> {salvando ? `Salvando ${gravadas} de ${aGravar}…` : atualizando ? "Atualizando a lista…" : unidadesMovidas === 0 ? "Salvar triagem" : `Salvar ${unidadesMovidas} un.`}
          </button>
        </div>
      </div>

      <div ref={refDoQuadro} style={{
        display: "grid", gap: 12, alignItems: "start",
        gridTemplateColumns: layout === "uma" ? "minmax(0, 1fr)"
          : layout === "tablet" ? "repeat(3, minmax(0, 1fr))"
            : "minmax(0, 1.25fr) repeat(3, minmax(0, 1fr))",
      }}>
        {coluna("triar")}
        {DESTINOS.map((d) => coluna(d))}
      </div>

      {selecionadas.size > 0 && (
        <div role="toolbar" aria-label="Mover o material selecionado" data-testid="barra-mover-selecionadas"
          style={{
            position: "fixed", zIndex: 50, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "10px 12px", borderRadius: 16, background: "#0f172a", boxShadow: "0 12px 40px rgba(0,0,0,0.35)",
            ...(isMobile
              ? { left: 12, right: 12, bottom: "calc(12px + env(safe-area-inset-bottom, 0px))", transform: "none" }
              : { left: "50%", bottom: 20, transform: "translateX(-50%)", maxWidth: "calc(100vw - 32px)" }),
          }}>
          <span role="status" style={{ color: "#f1f5f9", fontSize: 13, fontWeight: 700, padding: "0 6px", flex: isMobile ? "1 1 100%" : undefined }}>
            {selecionadas.size} {selecionadas.size === 1 ? "selecionado" : "selecionados"} →
          </span>
          {DESTINOS.map((d) => {
            const meta = COLUNAS[d];
            return (
              <button key={d} type="button" data-testid={`mover-para-${d}`} onClick={() => mover(Array.from(selecionadas), d)}
                style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5, height: alvo, padding: "0 12px", borderRadius: 10, border: "none", background: meta.fundo, color: meta.cor, fontSize: 13, fontWeight: 700, cursor: "pointer", flex: isMobile ? "1 1 0" : undefined, minWidth: 0 }}>
                <meta.Icon size={15} aria-hidden="true" /> {meta.titulo}
              </button>
            );
          })}
          <button type="button" data-testid="mover-para-triar" onClick={() => mover(Array.from(selecionadas), "triar")}
            style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5, height: alvo, padding: "0 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.2)", background: "transparent", color: "#e2e8f0", fontSize: 13, fontWeight: 600, cursor: "pointer", flex: isMobile ? "1 1 0" : undefined }}>
            <Undo2 size={15} aria-hidden="true" /> A triar
          </button>
          <button type="button" aria-label="Limpar seleção" title="Limpar seleção" onClick={() => setSelecionadas(new Set())}
            style={{ width: alvo, height: alvo, borderRadius: 10, border: "none", background: "rgba(255,255,255,0.1)", color: "#e2e8f0", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      )}

      <p className="sr-only" role="status" aria-live="polite" data-testid="anuncio-do-quadro">{anuncio}</p>

      {grupoDividindo && (
        <DividirGrupo
          key={grupoDividindo.chave}
          grupo={grupoDividindo}
          inicial={distDe(grupoDividindo)}
          reservadas={reservaDoGrupo.get(grupoDividindo.chave)?.reservadas ?? 0}
          toque={toque}
          onFechar={() => setDividindo(null)}
          onAplicar={(d) => {
            setDist((prev) => ({ ...prev, [grupoDividindo.chave]: { d, base: grupoDividindo.unidades, nome: grupoDividindo.nome } }));
            setSelecionadas(new Set());
            setDividindo(null);
            setAnuncio(`${grupoDividindo.nome}: ${d.galpao} para o Galpão, ${d.manutencao} para Manutenção, ${d.descartar} para Descartar`);
          }}
        />
      )}

      <AlertDialog open={confirmarDescarte} onOpenChange={setConfirmarDescarte}>
        <AlertDialogContent style={{ width: "min(440px, calc(100vw - 32px))", maxWidth: "min(440px, calc(100vw - 32px))", borderRadius: 16 }}>
          <AlertDialogHeader>
            <AlertDialogTitle data-testid="titulo-confirmar-descarte">{fraseDoDescarte(paraDescartar)}</AlertDialogTitle>
            <AlertDialogDescription>
              {unidadesEm("descartar") === 1 ? "Ela sai" : "Elas saem"} do inventário como sucata e a triagem não pode ser desfeita por aqui.
              {unidadesMovidas > unidadesEm("descartar") ? ` As outras ${unidadesMovidas - unidadesEm("descartar")} un. seguem para Galpão e Manutenção.` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter style={{ gap: 8 }}>
            <AlertDialogCancel data-testid="button-rever-descarte" style={{ minHeight: 44 }}>Rever</AlertDialogCancel>
            <AlertDialogAction data-testid="button-confirmar-descarte" onClick={() => gravar()}
              style={{ minHeight: 44, background: "#b91c1c", color: "#fff" }}>
              Descartar e salvar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmarSaida} onOpenChange={setConfirmarSaida}>
        <AlertDialogContent style={{ width: "min(420px, calc(100vw - 32px))", maxWidth: "min(420px, calc(100vw - 32px))", borderRadius: 16 }}>
          <AlertDialogHeader>
            <AlertDialogTitle>Sair sem salvar?</AlertDialogTitle>
            <AlertDialogDescription>
              {unidadesMovidas} {unidadesMovidas === 1 ? "unidade foi arrumada e ainda não foi salva" : "unidades foram arrumadas e ainda não foram salvas"}. Saindo agora, a arrumação se perde.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter style={{ gap: 8 }}>
            <AlertDialogCancel data-testid="button-ficar-no-quadro" style={{ minHeight: 44 }}>Continuar arrumando</AlertDialogCancel>
            <AlertDialogAction data-testid="button-sair-sem-salvar" onClick={() => { setConfirmarSaida(false); onVoltar(); }}
              style={{ minHeight: 44, background: "#b91c1c", color: "#fff" }}>
              Sair sem salvar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
