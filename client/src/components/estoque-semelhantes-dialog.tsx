// ─────────────────────────────────────────────────────────────────────────────
// BUSCAR NO ESTOQUE (dono, 14/09) — aberto a partir da peça, na lista do evento.
//
// Mostra as peças do estoque do mesmo tipo e medida, agrupadas em lotes, com
// o que importa para decidir: a arte lado a lado (o layout se confere no
// olho), o patrocinador, a condição, ONDE está e SE chega a tempo. Três
// grupos reserváveis — livre no galpão, em uso mas volta a tempo, voltou e
// falta triagem — e, recolhido, o que não dá para usar e por quê.
//
// Reservar só segura a peça física. Quem usa é a Gráfica, marcando o
// reaproveitamento na fila dela — a regra está no servidor
// (server/routes/estoque-reservas.ts) e nas funções de shared/estoque.ts.
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, ChevronDown, MapPin, Minus, Package, Plus, Warehouse, X } from "lucide-react";
import type { Sponsor } from "@shared/schema";
import {
  ROTULO_DA_DISPONIBILIDADE,
  ROTULO_DA_RELACAO,
  diaEMes,
  type Disponibilidade,
  type RelacaoDePatrocinio,
} from "@shared/estoque";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { HIDE_NATIVE_CLOSE } from "@/components/modal-shell";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { miniatura } from "@/lib/miniatura";
import { conditionMeta } from "@/lib/inventory-meta";

type Lote = {
  chave: string;
  disponibilidade: Disponibilidade;
  motivo: string;
  aviso: string | null;
  relacao: RelacaoDePatrocinio;
  condicao: string;
  local: string | null;
  situacao: string;
  voltaEm: string | null;
  thumb: string | null;
  sponsorIds: string[];
  origem: { itemId: string; displayId: string | null; tipo: string; descricao: string | null; eventName: string | null; eventInicio: string | null };
  ativos: Array<{ id: string; displayId: string; quantidade: number }>;
  quantidade: number;
};

type Reservada = {
  reservaId: string;
  assetId: string;
  displayId: string;
  situacao: string | null;
  condicao: string | null;
  local: string | null;
  quantidade: number;
  thumb: string | null;
  origem: { displayId: string | null; eventName: string | null } | null;
  reservadoPor: string | null;
  reservadoEm: string;
  podeLiberar: boolean;
};

type Resposta = {
  peca: { id: string; displayId: string | null; type: string; largura: string | null; altura: string | null; quantity: number; sponsorIds: string[]; eventId: string; eventName: string | null; saida: string | null };
  semMedida: boolean;
  caminhaoJaSaiu: boolean;
  podeReservar: boolean;
  unidadesReservadas: number;
  reservadas: Reservada[];
  lotes: Lote[];
};

const SITUACAO: Record<string, string> = {
  NO_GALPAO: "No galpão",
  EM_USO: "Em uso",
  AGUARDANDO_TRIAGEM: "Aguardando triagem",
  EM_MANUTENCAO: "Em manutenção",
  DESCARTADO: "Descartada",
};

const TOM: Record<Disponibilidade, { cor: string; fundo: string; borda: string }> = {
  disponivel:    { cor: "#047857", fundo: "#ecfdf5", borda: "#a7f3d0" },
  chega_a_tempo: { cor: "#1d4ed8", fundo: "#eff6ff", borda: "#bfdbfe" },
  falta_triagem: { cor: "#b45309", fundo: "#fffbeb", borda: "#fde68a" },
  indisponivel:  { cor: "#57534e", fundo: "#f5f5f4", borda: "#e7e5e4" },
};

const TOM_DA_RELACAO: Record<RelacaoDePatrocinio, { cor: string; fundo: string }> = {
  identica:  { cor: "#065f46", fundo: "#d1fae5" },
  generica:  { cor: "#44403c", fundo: "#e7e5e4" },
  a_definir: { cor: "#92400e", fundo: "#fef3c7" },
  diferente: { cor: "#991b1b", fundo: "#fee2e2" },
};

const ehImagem = (u?: string | null) => !!u && (/\.(png|jpe?g|gif|webp)/i.test(u) || u.startsWith("/objects/"));

const emMetros = (v: string | null) => (v == null ? "" : Number(v).toLocaleString("pt-BR"));
const medida = (l: string | null, a: string | null) => (l && a ? `${emMetros(l)} × ${emMetros(a)} m` : "sem medida");

/** Unidades do lote até somar n — lotes vindos da triagem por quantidade
 *  podem ter uma peça ×N, e ela não se divide numa reserva. */
export function escolherAtivos(ativos: Array<{ id: string; quantidade: number }>, n: number): string[] {
  const ids: string[] = [];
  let soma = 0;
  for (const a of ativos) {
    if (soma >= n) break;
    if (soma + a.quantidade > n) continue;
    ids.push(a.id);
    soma += a.quantidade;
  }
  return ids;
}

function Miniatura({ url, tamanho = 56 }: { url: string | null; tamanho?: number }) {
  const [falhou, setFalhou] = useState(false);
  return (
    <div style={{ width: tamanho, height: tamanho, borderRadius: 8, overflow: "hidden", background: "#f5f5f4", border: "1px solid #e7e5e4", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
      {ehImagem(url) && !falhou
        ? <img src={miniatura(url!)} alt="" loading="lazy" decoding="async" onError={() => setFalhou(true)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        : <Package size={Math.round(tamanho / 3)} color="#78716c" aria-hidden="true" />}
    </div>
  );
}

function Chip({ cor, fundo, title, children }: { cor: string; fundo: string; title?: string; children: React.ReactNode }) {
  return (
    <span title={title} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 999, background: fundo, color: cor, fontSize: 11, fontWeight: 700, lineHeight: 1.5, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}

function LoteLinha({ lote, indice, nomeDe, maximo, quantidade, onQuantidade, onReservar, reservando, podeAgir }: {
  lote: Lote; indice: number; nomeDe: (id: string) => string; maximo: number; quantidade: number;
  onQuantidade: (n: number) => void; onReservar: () => void; reservando: boolean; podeAgir: boolean;
}) {
  const tom = TOM[lote.disponibilidade];
  const cond = conditionMeta(lote.condicao);
  const rel = TOM_DA_RELACAO[lote.relacao];
  const patrocinadores = lote.sponsorIds.map(nomeDe).join(", ");
  const situacao = lote.disponibilidade === "disponivel" ? (SITUACAO[lote.situacao] ?? lote.situacao) : lote.motivo;
  return (
    <div data-testid={`lote-estoque-${indice}`} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, padding: "12px 14px", background: "#fff", border: `1px solid ${tom.borda}`, borderRadius: 12 }}>
      <Miniatura url={lote.thumb} />
      <div style={{ flex: "1 1 240px", minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "#1c1917", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {lote.origem.displayId ?? "—"}
          <span style={{ fontWeight: 600, color: "#57534e" }}>
            {" · "}{lote.origem.eventName ?? "evento"}{lote.origem.eventInicio ? ` · ${diaEMes(lote.origem.eventInicio)}` : ""}
          </span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
          <Chip cor={rel.cor} fundo={rel.fundo} title={patrocinadores || "Sem patrocinador impresso"}>
            {ROTULO_DA_RELACAO[lote.relacao]}{patrocinadores ? `: ${patrocinadores}` : ""}
          </Chip>
          <Chip cor={cond.color} fundo={cond.bg}>{cond.label}</Chip>
          {/* "Sem local" em #78716c: #a8a29e é proibido como cor de texto (2,3:1). */}
          <Chip cor={lote.local ? "#44403c" : "#78716c"} fundo="#f5f5f4">
            <MapPin size={10} aria-hidden="true" /> {lote.local ?? "Sem local"}
          </Chip>
          <Chip cor={tom.cor} fundo={tom.fundo}>{situacao}</Chip>
        </div>
        {lote.aviso && (
          <div style={{ display: "flex", gap: 6, fontSize: 12, color: "#92400e", lineHeight: 1.4 }}>
            <AlertTriangle size={13} aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{lote.aviso}</span>
          </div>
        )}
      </div>
      <div style={{ marginLeft: "auto", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
        <span style={{ fontSize: 20, fontWeight: 900, color: "#1c1917", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
          {lote.quantidade}<span style={{ fontSize: 11, fontWeight: 700, color: "#78716c" }}> un.</span>
        </span>
        {podeAgir && maximo > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {/* Stepper e Reservar com 40px: a busca também abre no celular
                (Detalhe do Evento), e 30px ficavam abaixo da ponta do dedo. */}
            <div style={{ display: "inline-flex", alignItems: "center", border: "1px solid #d6d3d1", borderRadius: 8, overflow: "hidden", height: 40 }}>
              <button type="button" aria-label="Uma a menos" disabled={quantidade <= 1} onClick={() => onQuantidade(quantidade - 1)}
                style={{ width: 38, height: "100%", border: "none", background: "#fafaf9", cursor: quantidade <= 1 ? "not-allowed" : "pointer", color: "#44403c", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Minus size={13} />
              </button>
              <span aria-live="polite" style={{ minWidth: 28, textAlign: "center", fontSize: 13, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{quantidade}</span>
              <button type="button" aria-label="Uma a mais" disabled={quantidade >= maximo} onClick={() => onQuantidade(quantidade + 1)}
                style={{ width: 38, height: "100%", border: "none", background: "#fafaf9", cursor: quantidade >= maximo ? "not-allowed" : "pointer", color: "#44403c", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Plus size={13} />
              </button>
            </div>
            <button type="button" data-testid={`button-reservar-lote-${indice}`} disabled={reservando} onClick={onReservar}
              style={{ height: 40, padding: "0 16px", borderRadius: 8, border: "none", background: "#1c1917", color: "#fff", fontWeight: 800, fontSize: 12.5, cursor: reservando ? "wait" : "pointer", opacity: reservando ? 0.6 : 1, whiteSpace: "nowrap" }}>
              {reservando ? "Reservando…" : `Reservar ${quantidade}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function EstoqueSemelhantesDialog({ item, podeReservar, onClose }: {
  item: { id: string; eventId: string } | null;
  /** admin | solicitacao — a mesma régua do servidor. */
  podeReservar: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [escolha, setEscolha] = useState<Record<string, number>>({});
  const [verIndisponiveis, setVerIndisponiveis] = useState(false);
  const chave = item ? `/api/items/${item.id}/estoque-semelhantes` : "";
  const { data, isLoading, isError, refetch } = useQuery<Resposta>({ queryKey: [chave], enabled: !!item });
  const { data: patrocinadores = [] } = useQuery<Sponsor[]>({ queryKey: ["/api/sponsors"], enabled: !!item });
  const nomeDe = (id: string) => patrocinadores.find((s) => s.id === id)?.name ?? "patrocinador";

  const atualizar = () => {
    if (!item) return;
    queryClient.invalidateQueries({ queryKey: [chave] });
    queryClient.invalidateQueries({ queryKey: [`/api/events/${item.eventId}/estoque-resumo`] });
    queryClient.invalidateQueries({ queryKey: ["/api/estoque/reservas-ativas"] });
  };

  const reservar = useMutation({
    mutationFn: async (assetIds: string[]) => (await apiRequest("POST", `/api/items/${item!.id}/reservas`, { assetIds })).json(),
    onSuccess: (r: { reservadas: number }) => {
      toast({ title: `${r.reservadas} un. reservada(s) do estoque`, description: "A peça fica segura para este evento." });
      setEscolha({});
      atualizar();
    },
    onError: (e: Error) => {
      toast({ title: "Não deu para reservar", description: e.message, variant: "destructive" });
      atualizar();
    },
  });

  const liberar = useMutation({
    mutationFn: async (reservaId: string) => (await apiRequest("DELETE", `/api/items/${item!.id}/reservas/${reservaId}`)).json(),
    onSuccess: () => { toast({ title: "Reserva liberada" }); atualizar(); },
    onError: (e: Error) => toast({ title: "Não deu para liberar", description: e.message, variant: "destructive" }),
  });

  const peca = data?.peca;
  const reservadasUn = data?.unidadesReservadas ?? 0;
  const falta = peca ? Math.max(0, peca.quantity - reservadasUn) : 0;
  const podeAgir = podeReservar && !!data?.podeReservar && falta > 0;
  const lotesDe = (d: Disponibilidade) => (data?.lotes ?? []).filter((l) => l.disponibilidade === d);
  const somaUn = (ls: Lote[]) => ls.reduce((s, l) => s + l.quantidade, 0);
  const GRUPOS: Disponibilidade[] = ["disponivel", "chega_a_tempo", "falta_triagem"];
  const indisponiveis = lotesDe("indisponivel");
  const reservaveis = GRUPOS.reduce((s, g) => s + lotesDe(g).length, 0);
  let indice = 0;

  const fechar = () => { setEscolha({}); setVerIndisponiveis(false); onClose(); };

  return (
    <Dialog open={!!item} onOpenChange={(aberto) => { if (!aberto) fechar(); }}>
      <DialogContent
        className={`p-0 gap-0 border-0 ${HIDE_NATIVE_CLOSE}`}
        style={{
          display: "flex", flexDirection: "column", padding: 0, overflow: "hidden",
          width: "min(780px, calc(100vw - 24px))", maxWidth: "min(780px, calc(100vw - 24px))",
          maxHeight: "calc(100vh - 48px)", borderRadius: 16, background: "#fafaf9",
          boxShadow: "0 25px 60px rgba(0,0,0,0.22)",
        }}
      >
        <header style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "18px 20px 14px", background: "#fff", borderBottom: "1px solid #e7e5e4", flexShrink: 0 }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: "#1c1917", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Warehouse size={18} color="#fff" aria-hidden="true" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <DialogTitle asChild>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 900, color: "#1c1917", letterSpacing: "-0.01em" }}>Buscar no estoque</h2>
            </DialogTitle>
            <DialogDescription asChild>
              <p style={{ margin: "3px 0 0", fontSize: 12.5, color: "#57534e", lineHeight: 1.45 }}>
                {peca
                  ? <><strong style={{ color: "#1c1917" }}>{peca.displayId}</strong> · {peca.type} · {medida(peca.largura, peca.altura)} · {peca.quantity} un. — mesmo tipo e medida; mesmo patrocinador aparece primeiro.</>
                  : "Carregando a peça…"}
              </p>
            </DialogDescription>
          </div>
          <button type="button" onClick={fechar} aria-label="Fechar"
            style={{ width: 40, height: 40, borderRadius: 8, border: "none", background: "#f5f5f4", color: "#57534e", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <X size={15} />
          </button>
        </header>

        {peca && (
          <div style={{ padding: "10px 20px", background: "#fff", borderBottom: "1px solid #e7e5e4", flexShrink: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 700, color: "#44403c", marginBottom: 6 }}>
              <span data-testid="reservadas-da-peca">Reservadas {reservadasUn} de {peca.quantity} un.</span>
              <span style={{ color: falta === 0 ? "#047857" : "#78716c" }}>{falta === 0 ? "Quantidade coberta" : `Faltam ${falta}`}</span>
            </div>
            <div style={{ height: 6, borderRadius: 3, background: "#e7e5e4", overflow: "hidden" }}>
              <div style={{ width: `${Math.min(100, (reservadasUn / Math.max(1, peca.quantity)) * 100)}%`, height: "100%", background: "#047857", transition: "width 0.2s" }} />
            </div>
          </div>
        )}

        <div style={{ flex: "1 1 auto", minHeight: 0, overflowY: "auto", padding: "16px 20px 20px", display: "flex", flexDirection: "column", gap: 18 }}>
          {isLoading && <p style={{ margin: 0, fontSize: 13, color: "#78716c" }}>Procurando no estoque…</p>}
          {isError && (
            <div style={{ fontSize: 13, color: "#b91c1c" }}>
              Não foi possível consultar o estoque.{" "}
              <button type="button" onClick={() => refetch()} style={{ border: "none", background: "none", color: "#1c1917", fontWeight: 800, textDecoration: "underline", cursor: "pointer" }}>Tentar de novo</button>
            </div>
          )}

          {data?.semMedida && (
            <p style={{ margin: 0, padding: "10px 12px", borderRadius: 10, background: "#fffbeb", border: "1px solid #fde68a", fontSize: 12.5, color: "#92400e" }}>
              Esta peça não tem largura e altura. A busca compara pela medida — preencha as dimensões da peça para ver o que tem no estoque.
            </p>
          )}
          {data?.caminhaoJaSaiu && (
            <p style={{ margin: 0, padding: "10px 12px", borderRadius: 10, background: "#f5f5f4", border: "1px solid #e7e5e4", fontSize: 12.5, color: "#44403c" }}>
              O caminhão deste evento já saiu — dá para consultar, mas não para reservar.
            </p>
          )}
          {data && !podeReservar && (
            <p style={{ margin: 0, fontSize: 12, color: "#78716c" }}>Reservar é da Solicitação e do admin — aqui você só consulta.</p>
          )}

          {data && data.reservadas.length > 0 && (
            <section aria-labelledby="titulo-reservadas" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <h3 id="titulo-reservadas" style={{ margin: 0, fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "#047857" }}>
                Reservadas para esta peça
              </h3>
              {data.reservadas.map((r) => (
                <div key={r.reservaId} data-testid={`reserva-${r.reservaId}`} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: "#ecfdf5", border: "1px solid #a7f3d0", borderRadius: 10, flexWrap: "wrap" }}>
                  <Miniatura url={r.thumb} tamanho={36} />
                  <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: "#1c1917" }}>
                      {r.displayId}{r.quantidade > 1 ? ` ×${r.quantidade}` : ""}
                      <span style={{ fontWeight: 600, color: "#57534e" }}>{r.origem ? ` · ${r.origem.displayId ?? ""} · ${r.origem.eventName ?? ""}` : ""}</span>
                    </div>
                    <div style={{ fontSize: 11.5, color: "#44403c", marginTop: 2 }}>
                      {SITUACAO[r.situacao ?? ""] ?? "—"} · {r.local ?? "sem local"}{r.reservadoPor ? ` · reservada por ${r.reservadoPor}` : ""}
                    </div>
                  </div>
                  {r.podeLiberar ? (
                    podeReservar && (
                      <button type="button" data-testid={`button-liberar-${r.reservaId}`} disabled={liberar.isPending} onClick={() => liberar.mutate(r.reservaId)}
                        style={{ height: 40, padding: "0 14px", borderRadius: 8, border: "1px solid #a7f3d0", background: "#fff", color: "#065f46", fontSize: 12, fontWeight: 800, cursor: liberar.isPending ? "wait" : "pointer" }}>
                        {liberar.isPending && liberar.variables === r.reservaId ? "Liberando…" : "Liberar"}
                      </button>
                    )
                  ) : (
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: "#065f46" }}>Já saiu no caminhão</span>
                  )}
                </div>
              ))}
            </section>
          )}

          {GRUPOS.map((grupo) => {
            const lotes = lotesDe(grupo);
            if (lotes.length === 0) return null;
            return (
              <section key={grupo} aria-labelledby={`titulo-${grupo}`} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <h3 id={`titulo-${grupo}`} style={{ margin: 0, display: "flex", justifyContent: "space-between", fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: TOM[grupo].cor }}>
                  <span>{ROTULO_DA_DISPONIBILIDADE[grupo]}</span>
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>{somaUn(lotes)} un.</span>
                </h3>
                {lotes.map((lote) => {
                  const maximo = Math.min(lote.quantidade, falta);
                  const quantidade = Math.min(escolha[lote.chave] ?? maximo, maximo);
                  const i = indice++;
                  return (
                    <LoteLinha
                      key={lote.chave}
                      lote={lote}
                      indice={i}
                      nomeDe={nomeDe}
                      maximo={maximo}
                      quantidade={Math.max(1, quantidade)}
                      onQuantidade={(n) => setEscolha((e) => ({ ...e, [lote.chave]: n }))}
                      onReservar={() => {
                        const ids = escolherAtivos(lote.ativos, Math.max(1, quantidade));
                        if (ids.length === 0) {
                          toast({ title: "Este lote não se divide nessa quantidade", description: "Escolha outra quantidade.", variant: "destructive" });
                          return;
                        }
                        reservar.mutate(ids);
                      }}
                      reservando={reservar.isPending}
                      podeAgir={podeAgir}
                    />
                  );
                })}
              </section>
            );
          })}

          {data && !data.semMedida && reservaveis === 0 && (
            <div style={{ textAlign: "center", padding: "22px 12px", color: "#57534e" }}>
              <Package size={26} color="#78716c" aria-hidden="true" />
              <p style={{ margin: "8px 0 2px", fontSize: 14, fontWeight: 800, color: "#1c1917" }}>Nada para usar no estoque</p>
              <p style={{ margin: 0, fontSize: 12.5 }}>
                {indisponiveis.length > 0
                  ? "Existem peças iguais, mas nenhuma está livre a tempo — veja o motivo de cada uma abaixo."
                  : "Nenhuma peça do mesmo tipo e medida foi guardada até agora."}
              </p>
            </div>
          )}

          {indisponiveis.length > 0 && (
            <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button type="button" data-testid="button-ver-indisponiveis" aria-expanded={verIndisponiveis} onClick={() => setVerIndisponiveis((v) => !v)}
                style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 6, border: "none", background: "none", padding: 0, fontSize: 12, fontWeight: 800, color: "#57534e", cursor: "pointer" }}>
                <ChevronDown size={14} style={{ transform: verIndisponiveis ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
                {verIndisponiveis ? "Esconder" : "Ver"} {somaUn(indisponiveis)} un. que não dá para usar
              </button>
              {verIndisponiveis && indisponiveis.map((lote) => {
                const i = indice++;
                return (
                  <LoteLinha key={lote.chave} lote={lote} indice={i} nomeDe={nomeDe} maximo={0} quantidade={0}
                    onQuantidade={() => {}} onReservar={() => {}} reservando={false} podeAgir={false} />
                );
              })}
            </section>
          )}
        </div>

        <footer style={{ padding: "10px 20px", borderTop: "1px solid #e7e5e4", background: "#fff", fontSize: 11.5, color: "#78716c", lineHeight: 1.45, flexShrink: 0 }}>
          Reservar só segura a peça física para este evento. Quando for usar, a Gráfica marca o reaproveitamento na fila dela.
        </footer>
      </DialogContent>
    </Dialog>
  );
}
