// ─────────────────────────────────────────────────────────────────────────────
// BUSCAR NO ESTOQUE (dono, 14/09) — aberto a partir da peça, na lista do evento.
//
// Mostra as peças do estoque do mesmo tipo e medida, agrupadas em lotes, com
// o que importa para decidir: a arte lado a lado (o layout se confere no
// olho), o patrocinador, a condição, a situação e SE chega a tempo (sem local no
// galpão: o dono decidiu em 21/09 que o sistema não guarda onde a peça fica). Três
// grupos reserváveis — livre no galpão, em uso mas volta a tempo, voltou e
// falta triagem — e, recolhido, o que não dá para usar e por quê.
//
// Reservar só segura a peça física. Quem usa é a Gráfica, marcando o
// reaproveitamento na fila dela — a regra está no servidor
// (server/routes/estoque-reservas.ts) e nas funções de shared/estoque.ts.
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, ChevronDown, Minus, Package, Plus, Warehouse } from "lucide-react";
import type { Sponsor } from "@shared/schema";
import {
  ROTULO_DA_DISPONIBILIDADE,
  ROTULO_DA_RELACAO,
  diaEMes,
  type Disponibilidade,
  type RelacaoDePatrocinio,
} from "@shared/estoque";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { HIDE_NATIVE_CLOSE, ModalHeader, modalSurface } from "@/components/modal-shell";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { miniatura } from "@/lib/miniatura";
import { conditionMeta } from "@/lib/inventory-meta";
import { T, N, TOM, FS, R, FW } from "@/lib/theme";
import { Botao } from "@/components/ui/botao";
import { Selo } from "@/components/ui/selo";
import { EstadoErro, EstadoVazio, Esqueleto } from "@/components/ui/estados";

type Lote = {
  chave: string;
  disponibilidade: Disponibilidade;
  motivo: string;
  aviso: string | null;
  relacao: RelacaoDePatrocinio;
  condicao: string;
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
  /** Por que a peça não aceita reserva (impressão em diante, entregue, cancelada). */
  motivoSemReserva?: string | null;
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

const TOM_DA_DISPONIBILIDADE: Record<Disponibilidade, { cor: string; fundo: string; borda: string }> = {
  disponivel:    { cor: TOM.esmeralda.text, fundo: TOM.esmeralda.bg, borda: TOM.esmeralda.border },
  chega_a_tempo: { cor: TOM.info.text, fundo: TOM.info.bg, borda: TOM.info.border },
  falta_triagem: { cor: TOM.alerta.text, fundo: TOM.alerta.bg, borda: TOM.alerta.border },
  indisponivel:  { cor: T.apoio, fundo: N.n2, borda: T.border },
};

// A relação de patrocínio usa a TINTA CHEIA (fundo 100, texto 800) de
// propósito: ela fica colada nos selos da condição e da disponibilidade, que
// são a tinta clara (50/700) das mesmas famílias — "Mesmo patrocinador" verde
// ao lado de "No galpão" verde, "Diferente" vermelho ao lado de "Sucata"
// vermelho. Com o mesmo token os selos virariam um só. Por isso os três tons
// de cor ficam cravados (o TOM não tem o degrau 100/800); o neutro já existe
// na escada.
const TOM_DA_RELACAO: Record<RelacaoDePatrocinio, { cor: string; fundo: string }> = {
  identica:  { cor: "#065f46", fundo: "#d1fae5" },
  generica:  { cor: T.strong, fundo: T.border },
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
    <div style={{ width: tamanho, height: tamanho, borderRadius: R.md, overflow: "hidden", background: N.n2, border: `1px solid ${T.border}`, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
      {ehImagem(url) && !falhou
        ? <img src={miniatura(url!)} alt="" loading="lazy" decoding="async" onError={() => setFalhou(true)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        : <Package size={Math.round(tamanho / 3)} color={T.second} aria-hidden="true" />}
    </div>
  );
}

/** Selo sem borda aparente (borda = fundo), com reticências no nome longo. */
function Chip({ cor, fundo, title, children }: { cor: string; fundo: string; title?: string; children: React.ReactNode }) {
  return (
    <Selo title={title} cores={{ bg: fundo, text: cor, border: fundo }}
      style={{ gap: 4, padding: "2px 8px", lineHeight: 1.5, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis" }}>
      {children}
    </Selo>
  );
}

function LoteLinha({ lote, indice, nomeDe, maximo, quantidade, onQuantidade, onReservar, reservando, podeAgir }: {
  lote: Lote; indice: number; nomeDe: (id: string) => string; maximo: number; quantidade: number;
  onQuantidade: (n: number) => void; onReservar: () => void; reservando: boolean; podeAgir: boolean;
}) {
  const tom = TOM_DA_DISPONIBILIDADE[lote.disponibilidade];
  const cond = conditionMeta(lote.condicao);
  const rel = TOM_DA_RELACAO[lote.relacao];
  const patrocinadores = lote.sponsorIds.map(nomeDe).join(", ");
  const situacao = lote.disponibilidade === "disponivel" ? (SITUACAO[lote.situacao] ?? lote.situacao) : lote.motivo;
  return (
    <div data-testid={`lote-estoque-${indice}`} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, padding: "12px 14px", background: T.surface, border: `1px solid ${tom.borda}`, borderRadius: R.lg }}>
      <Miniatura url={lote.thumb} />
      <div style={{ flex: "1 1 240px", minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ fontSize: FS.body, fontWeight: FW.rotulo, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {lote.origem.displayId ?? "—"}
          <span style={{ fontWeight: FW.medio, color: T.apoio }}>
            {" · "}{lote.origem.eventName ?? "evento"}{lote.origem.eventInicio ? ` · ${diaEMes(lote.origem.eventInicio)}` : ""}
          </span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
          <Chip cor={rel.cor} fundo={rel.fundo} title={patrocinadores || "Sem patrocinador impresso"}>
            {ROTULO_DA_RELACAO[lote.relacao]}{patrocinadores ? `: ${patrocinadores}` : ""}
          </Chip>
          <Chip cor={cond.color} fundo={cond.bg}>{cond.label}</Chip>
          <Chip cor={tom.cor} fundo={tom.fundo}>{situacao}</Chip>
        </div>
        {lote.aviso && (
          <div style={{ display: "flex", gap: 6, fontSize: FS.meta, color: TOM.alerta.text, lineHeight: 1.4 }}>
            <AlertTriangle size={13} aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{lote.aviso}</span>
          </div>
        )}
      </div>
      <div style={{ marginLeft: "auto", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
        <span style={{ fontSize: 20, fontWeight: 900, color: T.text, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
          {lote.quantidade}<span style={{ fontSize: FS.small, fontWeight: FW.forte, color: T.second }}> un.</span>
        </span>
        {podeAgir && maximo > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {/* Stepper e Reservar com 44px: a busca também abre no celular
                (Detalhe do Evento), e 30px ficavam abaixo da ponta do dedo.
                Os dois lados do stepper são peças de um controle só: ficam
                <button> nativos, com o realce da .ds-botao. */}
            <div style={{ display: "inline-flex", alignItems: "center", border: `1px solid ${T.bdark}`, borderRadius: R.md, overflow: "hidden", height: 44 }}>
              <button type="button" aria-label="Uma a menos" disabled={quantidade <= 1} onClick={() => onQuantidade(quantidade - 1)}
                className="ds-botao"
                style={{ width: 44, height: "100%", border: "none", background: T.bg, cursor: quantidade <= 1 ? "not-allowed" : "pointer", color: T.strong, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Minus size={13} />
              </button>
              <span aria-live="polite" style={{ minWidth: 28, textAlign: "center", fontSize: FS.body, fontWeight: FW.rotulo, fontVariantNumeric: "tabular-nums" }}>{quantidade}</span>
              <button type="button" aria-label="Uma a mais" disabled={quantidade >= maximo} onClick={() => onQuantidade(quantidade + 1)}
                className="ds-botao"
                style={{ width: 44, height: "100%", border: "none", background: T.bg, cursor: quantidade >= maximo ? "not-allowed" : "pointer", color: T.strong, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Plus size={13} />
              </button>
            </div>
            <Botao variante="primario" tamanho="toque" data-testid={`button-reservar-lote-${indice}`} carregando={reservando} onClick={onReservar}
              style={{ fontSize: FS.body }}>
              {reservando ? "Reservando…" : `Reservar ${quantidade} un.`}
            </Botao>
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
      // "Posso desfazer?" — pode: o Liberar fica na lista logo acima. Dizer
      // isso no toast tira o medo do toque.
      toast({ title: `${r.reservadas} un. reservada(s) do estoque`, description: "A peça fica segura para este evento. Mudou de ideia? Use Liberar em “Reservadas para esta peça”.", variant: "success" });
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
    onSuccess: () => { toast({ title: "Reserva liberada", description: "A peça voltou a ficar disponível no estoque.", variant: "success" }); atualizar(); },
    // Recarrega também no erro: o 409 mais comum é "já saiu no caminhão" ou
    // "reserva não encontrada" (outra aba liberou) — a lista precisa mostrar isso.
    onError: (e: Error) => { toast({ title: "Não deu para liberar", description: e.message, variant: "destructive" }); atualizar(); },
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
        // Casca da casa: teto em dvh (no celular a barra do navegador cobria o
        // rodapé com o 100vh de antes), raio e sombra iguais aos outros modais.
        style={{ ...modalSurface(780), backgroundColor: T.bg }}
      >
        <DialogTitle className="sr-only">Buscar no estoque</DialogTitle>
        <DialogDescription className="sr-only">
          {peca
            ? `${peca.displayId ?? "Peça"} · ${peca.type} · ${medida(peca.largura, peca.altura)} · ${peca.quantity} un. Peças do estoque com o mesmo tipo e medida; mesmo patrocinador aparece primeiro.`
            : "Carregando a peça."}
        </DialogDescription>
        {/* Cabeçalho padrão (modal de TRABALHO: escolher peças e reservar). O
            subtítulo diz qual peça se busca e a régua da busca. */}
        <ModalHeader
          icon={Warehouse}
          tint={T.accentText}
          title="Buscar no estoque"
          subtitle={peca
            ? `${peca.displayId ?? "Peça"} · ${peca.type} · ${medida(peca.largura, peca.altura)} · ${peca.quantity} un. — mesmo tipo e medida; mesmo patrocinador primeiro.`
            : "Carregando a peça…"}
          onClose={fechar}
        />

        {peca && (
          <div style={{ padding: "10px 20px", background: T.surface, borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: FS.meta, fontWeight: FW.forte, color: T.strong, marginBottom: 6 }}>
              <span data-testid="reservadas-da-peca">Reservadas {reservadasUn} de {peca.quantity} un.</span>
              <span style={{ color: falta === 0 ? TOM.esmeralda.text : T.second }}>{falta === 0 ? "Quantidade coberta" : `Faltam ${falta}`}</span>
            </div>
            <div style={{ height: 6, borderRadius: 3, background: T.border, overflow: "hidden" }}>
              <div style={{ width: `${Math.min(100, (reservadasUn / Math.max(1, peca.quantity)) * 100)}%`, height: "100%", background: TOM.esmeralda.text, transition: "width 0.2s" }} />
            </div>
          </div>
        )}

        <div style={{ flex: "1 1 auto", minHeight: 0, overflowY: "auto", padding: "16px 20px 20px", display: "flex", flexDirection: "column", gap: 18 }}>
          {/* Carregando: o formato dos lotes em esqueleto, e não uma linha de
              texto que some e empurra tudo para baixo quando a lista chega. */}
          {isLoading && <Esqueleto variante="lista" linhas={3} rotulo="Procurando no estoque" />}
          {isError && (
            <EstadoErro compacto titulo="Não foi possível consultar o estoque." aoTentarDeNovo={() => refetch()} />
          )}

          {data?.semMedida && (
            <p style={{ margin: 0, padding: "10px 12px", borderRadius: R.md, background: TOM.alerta.bg, border: `1px solid ${TOM.alerta.border}`, fontSize: FS.meta, color: TOM.alerta.text }}>
              Esta peça não tem largura e altura. A busca compara pela medida — preencha as dimensões da peça para ver o que tem no estoque.
            </p>
          )}
          {data?.caminhaoJaSaiu && (
            <p style={{ margin: 0, padding: "10px 12px", borderRadius: R.md, background: N.n2, border: `1px solid ${T.border}`, fontSize: FS.meta, color: T.strong }}>
              O caminhão deste evento já saiu — dá para consultar, mas não para reservar.
            </p>
          )}
          {data?.motivoSemReserva && !data.caminhaoJaSaiu && (
            <p data-testid="motivo-sem-reserva" style={{ margin: 0, padding: "10px 12px", borderRadius: R.md, background: N.n2, border: `1px solid ${T.border}`, fontSize: FS.meta, color: T.strong }}>
              {data.motivoSemReserva}
            </p>
          )}
          {data && !podeReservar && (
            <p style={{ margin: 0, fontSize: FS.meta, color: T.second }}>Reservar é da Solicitação e do admin — aqui você só consulta.</p>
          )}

          {data && data.reservadas.length > 0 && (
            <section aria-labelledby="titulo-reservadas" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <h3 id="titulo-reservadas" style={{ margin: 0, fontSize: FS.small, fontWeight: FW.rotulo, letterSpacing: "0.08em", textTransform: "uppercase", color: TOM.esmeralda.text }}>
                Reservadas para esta peça
              </h3>
              {data.reservadas.map((r) => (
                <div key={r.reservaId} data-testid={`reserva-${r.reservaId}`} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: TOM.esmeralda.bg, border: `1px solid ${TOM.esmeralda.border}`, borderRadius: R.md, flexWrap: "wrap" }}>
                  <Miniatura url={r.thumb} tamanho={36} />
                  <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                    <div style={{ fontSize: FS.body, fontWeight: FW.rotulo, color: T.text }}>
                      {r.displayId}{r.quantidade > 1 ? ` ×${r.quantidade}` : ""}
                      <span style={{ fontWeight: FW.medio, color: T.apoio }}>{r.origem ? ` · ${r.origem.displayId ?? ""} · ${r.origem.eventName ?? ""}` : ""}</span>
                    </div>
                    <div style={{ fontSize: FS.small, color: T.strong, marginTop: 2 }}>
                      {SITUACAO[r.situacao ?? ""] ?? "—"}{r.reservadoPor ? ` · reservada por ${r.reservadoPor}` : ""}
                    </div>
                  </div>
                  {r.podeLiberar ? (
                    podeReservar && (
                      <Botao variante="secundario" tamanho="toque" data-testid={`button-liberar-${r.reservaId}`}
                        disabled={liberar.isPending} carregando={liberar.isPending && liberar.variables === r.reservaId}
                        onClick={() => liberar.mutate(r.reservaId)}
                        style={{ fontSize: FS.body, color: TOM.esmeralda.text, borderColor: TOM.esmeralda.border }}>
                        {liberar.isPending && liberar.variables === r.reservaId ? "Liberando…" : "Liberar"}
                      </Botao>
                    )
                  ) : (
                    <span style={{ fontSize: FS.small, fontWeight: FW.forte, color: TOM.esmeralda.text }}>Já saiu no caminhão</span>
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
                <h3 id={`titulo-${grupo}`} style={{ margin: 0, display: "flex", justifyContent: "space-between", fontSize: FS.small, fontWeight: FW.rotulo, letterSpacing: "0.08em", textTransform: "uppercase", color: TOM_DA_DISPONIBILIDADE[grupo].cor }}>
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
                          toast({ title: "Este lote não se divide nessa quantidade", description: "Escolha outra quantidade.", variant: "warning" });
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
            <EstadoVazio
              compacto
              icone={Package}
              titulo="Nada para usar no estoque"
              descricao={indisponiveis.length > 0
                ? "Existem peças iguais, mas nenhuma está livre a tempo — veja o motivo de cada uma abaixo."
                : "Nenhuma peça do mesmo tipo e medida foi guardada até agora."}
            />
          )}

          {indisponiveis.length > 0 && (
            <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <Botao variante="fantasma" tamanho="toque" data-testid="button-ver-indisponiveis" aria-expanded={verIndisponiveis} onClick={() => setVerIndisponiveis((v) => !v)}
                style={{ alignSelf: "flex-start", gap: 6, padding: "0 8px", marginLeft: -8, fontSize: FS.body }}>
                <ChevronDown size={14} aria-hidden="true" style={{ transform: verIndisponiveis ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
                {verIndisponiveis ? "Esconder" : "Ver"} {somaUn(indisponiveis)} un. que não dá para usar
              </Botao>
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

        <footer style={{ padding: "10px 20px", borderTop: `1px solid ${T.border}`, background: T.surface, fontSize: FS.small, color: T.second, lineHeight: 1.45, flexShrink: 0 }}>
          Reservar só segura a peça física para este evento. Quando for usar, a Gráfica marca o reaproveitamento na fila dela.
        </footer>
      </DialogContent>
    </Dialog>
  );
}
