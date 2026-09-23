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
import { useMemo, useState } from "react";
import { ArrowRight, BookmarkCheck, CalendarDays, ChevronDown, Package, ScanSearch, Search, Table2 } from "lucide-react";
import { miniatura } from "@/lib/miniatura";
import { useIsMobile } from "@/hooks/use-mobile";
import { diaEMes } from "@shared/estoque";
import { T, N, TOM, FS, FW, R, FONT, SHADOW } from "@/lib/theme";
import { Botao } from "@/components/ui/botao";
import { Selo } from "@/components/ui/selo";
import { CabecalhoDaPagina } from "@/components/ui/cabecalho-da-pagina";
import { EstadoErro, EstadoVazio, Esqueleto } from "@/components/ui/estados";
import type { EnrichedAsset } from "@/lib/inventory-meta";

export type ReservaDaTriagem = { assetId: string; eventName: string; saida: string | null; itemDisplayId: string | null };

const DIA = 86_400_000;

/** Há quanto tempo a peça espera: desde que o ciclo a mandou para a triagem. */
export function tempoDeEspera(desde: number, agora: number) {
  const dias = Math.max(0, Math.floor((agora - desde) / DIA));
  return {
    dias,
    texto: dias === 0 ? "voltou hoje" : dias === 1 ? "voltou ontem" : `voltou há ${dias} dias`,
    cor: dias > 14 ? TOM.perigo.text : dias > 7 ? TOM.alerta.text : T.apoio,
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

/** Cartões de evento por vez. O acúmulo de 4 mil+ peças se espalha por mais de
 *  cem eventos; cada cartão carrega até quatro miniaturas. */
export const LOTE_DE_EVENTOS = 24;

/** Casa o nome do evento ou de um patrocinador, sem acento nem caixa. */
const semAcento = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
export function filtrarEventos(eventos: EventoDaTriagem[], busca: string): EventoDaTriagem[] {
  const q = semAcento(busca.trim());
  if (!q) return eventos;
  return eventos.filter((e) => semAcento(e.nome).includes(q) || e.patrocinadores.some((p) => semAcento(p).includes(q)));
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
  const [busca, setBusca] = useState("");
  const [mostrando, setMostrando] = useState(LOTE_DE_EVENTOS);
  const noRecorte = useMemo(() => filtrarEventos(eventos, busca), [eventos, busca]);
  const visiveis = noRecorte.slice(0, mostrando);
  // O que pede atenção, dito antes da lista: quantos eventos esperam há mais
  // de duas semanas (o vermelho do cartão, somado).
  const atrasados = useMemo(() => eventos.filter((e) => tempoDeEspera(e.desde, agora).dias > 14).length, [eventos, agora]);

  // O subtítulo é o ESTADO da fila (quantos eventos, quantas peças); a dica do
  // que é triar vem logo abaixo, só quando há o que triar.
  const subtitulo = (
    <>
      <span aria-live="polite" style={{ display: "block" }}>
        {isLoading ? "Carregando…" : totalPecas === 0
          ? "Nada esperando triagem."
          : `${eventos.length} ${eventos.length === 1 ? "evento voltou" : "eventos voltaram"} · ${totalPecas} ${totalPecas === 1 ? "peça esperando" : "peças esperando"} — escolha um para começar`}
      </span>
      {/* O QUE É TRIAR, para quem abre a tela pela primeira vez: a palavra
          sozinha não dizia o que se decide nem que dá para rearrumar antes
          de gravar. */}
      {!isLoading && totalPecas > 0 && (
        <span data-testid="dica-o-que-e-triar" style={{ display: "block", marginTop: 4, fontSize: FS.meta, color: T.second }}>
          Triar = decidir, peça por peça, se volta ao <strong style={{ color: TOM.info.text }}>Galpão</strong>, vai para <strong style={{ color: TOM.alerta.text }}>Manutenção</strong> ou é <strong style={{ color: TOM.perigo.text }}>descartada</strong>. Nada é gravado até salvar.
        </span>
      )}
    </>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: isMobile ? 16 : 24 }}>
      <CabecalhoDaPagina
        titulo="Triagem de Retorno"
        icone={ScanSearch}
        subtitulo={subtitulo}
        acoes={totalPecas > 0 ? (
          <Botao tamanho="toque" icone={Table2} onClick={onTabela} data-testid="button-triagem-tabela" larguraCheia={isMobile}>
            Ver todas em tabela
          </Botao>
        ) : undefined}
      />

      {isLoading ? (
        <Esqueleto variante="cartoes" linhas={3} rotulo="Carregando os eventos da triagem" />
      ) : isError ? (
        <EstadoErro
          titulo="Não foi possível carregar a triagem"
          detalhe="Verifique sua conexão e tente novamente."
          aoTentarDeNovo={onTentarDeNovo}
        />
      ) : eventos.length === 0 ? (
        <EstadoVazio
          icone={ScanSearch}
          titulo="Nenhum material aguardando triagem"
          descricao="As peças entram aqui sozinhas no dia seguinte ao evento."
        />
      ) : (
        <>
        {eventos.length > 6 && (
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div style={{ position: "relative", flex: "1 1 260px", maxWidth: isMobile ? undefined : 380 }}>
              <Search size={15} color={T.second} aria-hidden="true" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
              <input type="search" data-testid="input-busca-eventos-triagem" aria-label="Buscar evento da triagem por nome ou patrocinador"
                placeholder="Buscar evento ou patrocinador…" value={busca}
                onChange={(ev) => { setBusca(ev.target.value); setMostrando(LOTE_DE_EVENTOS); }}
                style={{ width: "100%", boxSizing: "border-box", height: 44, padding: "0 12px 0 36px", borderRadius: R.md, border: `1px solid ${T.border}`, background: T.surface, fontFamily: FONT.corpo, fontSize: isMobile ? FS.lead : FS.body, color: T.text }} />
            </div>
            <p role="status" data-testid="resumo-eventos-triagem" style={{ margin: 0, fontSize: FS.body, color: T.apoio }}>
              {busca.trim() ? `${noRecorte.length} de ${eventos.length} eventos` : null}
              {!busca.trim() && atrasados > 0 ? <><strong style={{ color: TOM.perigo.text }}>{atrasados}</strong> {atrasados === 1 ? "evento espera" : "eventos esperam"} há mais de 14 dias</> : null}
            </p>
          </div>
        )}
        {noRecorte.length === 0 && (
          <div data-testid="eventos-sem-resultado">
            <EstadoVazio
              compacto
              icone={Search}
              titulo={`Nenhum evento com “${busca.trim()}”`}
              descricao={`${eventos.length} eventos esperam triagem fora desta busca.`}
              acao={<Botao tamanho="toque" onClick={() => setBusca("")}>Limpar busca</Botao>}
            />
          </div>
        )}
        <div data-testid="lista-eventos-triagem" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 290px), 1fr))", gap: isMobile ? 12 : 16 }}>
          {visiveis.map((e) => {
            const espera = tempoDeEspera(e.desde, agora);
            // O cartão inteiro é o botão (é a escolha da pilha): <button> de
            // verdade, com o realce de hover/foco da classe da casa.
            return (
              <button
                key={e.id}
                type="button"
                data-testid={`evento-triagem-${e.id}`}
                onClick={() => onAbrir(e.id)}
                className="ds-botao"
                style={{ textAlign: "left", display: "flex", flexDirection: "column", gap: 12, padding: isMobile ? 16 : 18, borderRadius: R.xl, cursor: "pointer", background: T.surface, border: `1px solid ${e.reservadas ? TOM.info.border : T.border}`, borderTop: `3px solid ${e.reservadas ? TOM.info.text : T.accentText}`, boxShadow: SHADOW.sm }}
              >
                {/* Miniaturas decorativas (aria-hidden): o leitor de tela lia o
                    "+N" solto antes do nome do evento. */}
                <div aria-hidden="true" style={{ display: "flex", gap: 6, minHeight: 48 }}>
                  {e.thumbs.length === 0 ? (
                    <div style={{ width: 48, height: 48, borderRadius: 10, background: N.n2, display: "flex", alignItems: "center", justifyContent: "center" }}><Package size={18} color={T.muted} /></div>
                  ) : e.thumbs.map((t) => (
                    <div key={t} style={{ width: 48, height: 48, borderRadius: 10, overflow: "hidden", background: N.n2, border: `1px solid ${T.border}` }}>
                      {ehImagem(t) ? <img src={miniatura(t)} alt="" loading="lazy" decoding="async" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}
                    </div>
                  ))}
                  {e.pecas > e.thumbs.length && e.thumbs.length > 0 && (
                    <div style={{ width: 48, height: 48, borderRadius: 10, background: N.n2, display: "flex", alignItems: "center", justifyContent: "center", fontSize: FS.meta, fontWeight: FW.rotulo, color: T.apoio }}>+{e.pecas - e.thumbs.length}</div>
                  )}
                </div>

                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 17, fontWeight: FW.rotulo, color: T.text, fontFamily: FONT.display, lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.nome}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
                    {e.data && (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: FS.meta, color: T.apoio }}>
                        <CalendarDays size={12} aria-hidden="true" /> evento {diaEMes(e.data)}
                      </span>
                    )}
                    <span data-testid={`espera-evento-triagem-${e.id}`} style={{ fontSize: 12.5, fontWeight: espera.dias > 7 ? FW.rotulo : FW.medio, color: espera.cor }}>{espera.texto}</span>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                  <span style={{ fontSize: 30, fontWeight: 900, color: T.text, fontFamily: FONT.display, lineHeight: 1 }}>{e.pecas}</span>
                  <span style={{ fontSize: FS.body, color: T.apoio, fontWeight: FW.medio }}>
                    {e.pecas === 1 ? "peça" : "peças"}{e.unidades !== e.pecas ? ` · ${e.unidades} un.` : ""}
                  </span>
                </div>

                {e.reservadas > 0 && (
                  <Selo tom="info" icone={BookmarkCheck} style={{ alignSelf: "flex-start", fontSize: FS.meta, fontWeight: FW.rotulo, whiteSpace: "normal" }}>
                    {e.reservadas} {e.reservadas === 1 ? "reservada" : "reservadas"}{e.saidaMaisProxima ? ` · saída ${diaEMes(new Date(e.saidaMaisProxima).toISOString())}` : ""}
                  </Selo>
                )}

                {e.patrocinadores.length > 0 && (
                  <div style={{ fontSize: FS.meta, color: T.apoio, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {e.patrocinadores.slice(0, 3).join(" · ")}{e.patrocinadores.length > 3 ? ` +${e.patrocinadores.length - 3}` : ""}
                  </div>
                )}

                <span style={{ marginTop: "auto", display: "inline-flex", alignItems: "center", gap: 6, fontSize: FS.body, fontWeight: FW.rotulo, color: T.accentText }}>
                  Começar triagem <ArrowRight size={14} aria-hidden="true" />
                </span>
              </button>
            );
          })}
        </div>
        {noRecorte.length > visiveis.length && (
          <Botao tamanho="toque" icone={ChevronDown} data-testid="mostrar-mais-eventos" onClick={() => setMostrando((n) => n + LOTE_DE_EVENTOS)}
            style={{ alignSelf: "center" }}>
            Mostrar mais {Math.min(LOTE_DE_EVENTOS, noRecorte.length - visiveis.length)} · faltam {noRecorte.length - visiveis.length}
          </Botao>
        )}
        </>
      )}
    </div>
  );
}
