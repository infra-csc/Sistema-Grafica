// ─────────────────────────────────────────────────────────────────────────────
// MÁQUINAS DA GRÁFICA — o seletor de peça do cartão "Livre".
//
// Selecionar a peça tem de ser fácil (antes abria tudo, sem filtro). Em vez de
// mandar para a Gráfica, a lista das liberadas AQUI: as reservadas para ESTA
// impressora no topo, depois a fila geral, na ordem do caminhão; busca por
// código/peça/evento; um clique abre o modal de impressão já com a impressora
// escolhida. Os dados são os do próprio retrato (filaGeral + naFila de cada
// cartão) — nenhuma chamada a mais, e a lista entra em lotes de 60.
// ─────────────────────────────────────────────────────────────────────────────
import { Fragment, useContext, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { ExternalLink, Printer, Search } from "lucide-react";
import { useIsMobile, alvo as alvoDe } from "@/hooks/use-mobile";
import { Botao } from "@/components/ui/botao";
import { EstadoVazio } from "@/components/ui/estados";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { HIDE_NATIVE_CLOSE, ModalHeader, modalSurface } from "@/components/modal-shell";
import { useAcompanharAreaVisivel } from "@/components/grafica/area-visivel";
import { miniatura } from "@/lib/miniatura";
import { convertGCSUrlToLocalPath } from "@/lib/artePdfExport";
import { T, FS, FW, R } from "@/lib/theme";
import { P } from "@/lib/status";
import { partesDoNomeDaPeca } from "@shared/nome-da-peca";
import { AMBAR, GRAFICA_LIBERADOS, MONO, ROTULO_MICRO } from "./constantes";
import { ToqueContext } from "./contexto";
import { BotaoDaFicha, Pilula, SeloDePrazo } from "./pedacos";
import { apoioDaPeca, candidatasParaImprimir, motivoBloqueio, plural, prazoDaPeca, seloDaPecaNaMaquina } from "./regras";
import type { PecaNaFila } from "./tipos";

const LOTE_DO_SELETOR = 60;

export function SeletorDePeca({ maquina, reservadas, filaGeral, atualizando, hojeMs, onEscolher, onFechar }: {
  maquina: { codigo: string; rotulo: string } | null; reservadas: PecaNaFila[]; filaGeral: PecaNaFila[]; atualizando: boolean; hojeMs: number;
  onEscolher: (p: PecaNaFila, maquina: string) => void; onFechar: () => void;
}) {
  const isMobile = useIsMobile();
  const toque = useContext(ToqueContext) || isMobile;
  const padModal = isMobile ? 16 : 24;
  const [busca, setBusca] = useState("");
  const [visiveis, setVisiveis] = useState(LOTE_DO_SELETOR);
  // A busca abre o teclado: o modal recentra e encolhe para a área visível,
  // e a lista continua rolável acima dele (o mesmo gancho da Gráfica).
  const superficieRef = useRef<HTMLDivElement>(null);
  useAcompanharAreaVisivel(superficieRef, "centro", isMobile && !!maquina);
  const lista = useMemo(() => (maquina ? candidatasParaImprimir(maquina.codigo, reservadas, filaGeral, busca) : []), [maquina, reservadas, filaGeral, busca]);
  const total = reservadas.length + filaGeral.length;
  const mostradas = lista.slice(0, visiveis);
  const fonte = isMobile ? 12 : FS.small;

  return (
    <Dialog open={!!maquina} onOpenChange={(open) => { if (!open) onFechar(); }}>
      <DialogContent ref={superficieRef} className={HIDE_NATIVE_CLOSE} style={modalSurface(620)} data-testid="seletor-de-peca">
        <DialogTitle className="sr-only">Escolher peça para imprimir{maquina ? ` na ${maquina.rotulo}` : ""}</DialogTitle>
        <DialogDescription className="sr-only">Lista das peças liberadas; um toque abre a impressão nesta impressora.</DialogDescription>
        <ModalHeader icon={Printer} tint={T.text} title={maquina ? `Imprimir na ${maquina.rotulo}` : "Escolher peça"} subtitle={total === 0 ? "Nenhuma peça liberada agora" : `${plural(total, "peça liberada", "peças liberadas")}${reservadas.length ? ` · ${reservadas.length} reservada${reservadas.length === 1 ? "" : "s"} para esta` : ""} — toque numa para iniciar`} onClose={onFechar} />
        {maquina && (
          <div style={{ padding: padModal, display: "flex", flexDirection: "column", gap: 12, overflowY: "auto", flex: "1 1 auto", minHeight: 0 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <label htmlFor="busca-peca" className="sr-only">Buscar por código, peça ou evento</label>
              <div style={{ flex: "1 1 220px", position: "relative", minWidth: 0 }}>
                <Search aria-hidden="true" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", width: 14, height: 14, color: T.muted }} />
                <input
                  id="busca-peca"
                  type="search"
                  value={busca}
                  onChange={(e) => { setBusca(e.target.value); setVisiveis(LOTE_DO_SELETOR); }}
                  placeholder="Código, peça ou evento"
                  autoComplete="off"
                  data-testid="busca-peca"
                  style={{ width: "100%", boxSizing: "border-box", minHeight: 44, padding: "0 12px 0 32px", borderRadius: R.md, border: `1px solid ${T.bdark}`, background: T.surface, fontSize: isMobile ? 16 : 13, color: T.text }}
                />
              </div>
              <Link href={GRAFICA_LIBERADOS} className="mq-link" data-testid="link-ver-na-grafica" style={{ display: "inline-flex", alignItems: "center", gap: 4, minHeight: alvoDe(34, toque), fontSize: fonte, fontWeight: FW.forte, color: T.second, textDecoration: "none", whiteSpace: "nowrap" }}>
                Ver na Gráfica <ExternalLink aria-hidden="true" style={{ width: 11, height: 11 }} />
              </Link>
            </div>
            {atualizando && <p role="status" style={{ margin: 0, fontSize: fonte, color: T.second }}>Atualizando a lista…</p>}

            {total === 0 ? (
              <div data-testid="seletor-vazio">
                <EstadoVazio compacto icone={Printer} titulo="Nenhuma peça liberada agora." descricao="Quando a Arte liberar uma peça para a Gráfica, ela aparece aqui." />
              </div>
            ) : lista.length === 0 ? (
              <p data-testid="seletor-sem-resultado" style={{ margin: 0, padding: "20px 8px", textAlign: "center", fontSize: FS.body, color: T.second }}>Nada bate com “{busca}”.</p>
            ) : (
              <div role="list" data-testid="seletor-lista" style={{ display: "flex", flexDirection: "column", border: `1px solid ${T.border}`, borderRadius: R.lg, overflow: "hidden" }}>
                {mostradas.map((p, i) => {
                  const selo = seloDaPecaNaMaquina(p, hojeMs);
                  const prazo = prazoDaPeca(p.saidaCaminhao, p.prazoProducaoGrafica);
                  const thumb = p.miniatura ? miniatura(convertGCSUrlToLocalPath(p.miniatura)) : undefined;
                  const cabecalhoGeral = !p.reservada && (i === 0 || mostradas[i - 1].reservada);
                  // Celular: "Reservada · 20 un." + prazo numa coluna à direita
                  // deixavam ~100px para o nome da peça; ali os selos descem para
                  // baixo do texto e o nome usa a largura toda.
                  const selos = (
                    <>
                      {p.reservada && <Pilula pal={P.amber} fonte={fonte} testId={`selo-reservada-${p.id}`}>{p.reservadas != null && p.reservadas < p.aImprimir ? `Reservada · ${p.reservadas} un.` : "Reservada"}</Pilula>}
                      <SeloDePrazo p={prazo} fonte={fonte} />
                    </>
                  );
                  return (
                    <Fragment key={p.id}>
                      {cabecalhoGeral && reservadas.length > 0 && (
                        <div style={{ ...ROTULO_MICRO, fontSize: isMobile ? 12 : FS.micro, padding: "8px 12px 4px", background: T.bg, borderTop: i ? `1px solid ${T.low}` : "none" }}>Fila geral</div>
                      )}
                      <div role="listitem" style={{ display: "flex", alignItems: "stretch" }}>
                      <button
                        type="button"
                        className="mq-peca"
                        onClick={() => { if (!selo) onEscolher(p, maquina.codigo); }}
                        disabled={!!selo}
                        data-testid={`escolher-peca-${p.id}`}
                        title={selo ? motivoBloqueio(selo, "iniciar impressão", p) : `Iniciar a impressão de ${p.displayId ?? "esta peça"} na ${maquina.rotulo}`}
                        style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", padding: isMobile ? "8px 12px" : "8px 12px", minHeight: 56, border: "none", borderTop: i || (cabecalhoGeral && reservadas.length) ? `1px solid ${T.low}` : "none", background: p.reservada ? AMBAR.bg : T.surface, cursor: selo ? "not-allowed" : "pointer", opacity: selo ? 0.6 : 1, color: T.text }}
                      >
                        <span aria-hidden="true" style={{ width: 40, height: 40, borderRadius: R.md, background: T.low, border: `1px solid ${T.border}`, flexShrink: 0, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {thumb ? <img src={thumb} alt="" loading="lazy" decoding="async" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : <Printer style={{ width: 14, height: 14, color: T.muted }} />}
                        </span>
                        <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                          <span style={{ fontSize: FS.body, fontWeight: FW.forte, lineHeight: 1.3, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflowWrap: "anywhere" }}>
                            <span style={{ fontFamily: MONO, color: T.accentText, marginRight: 6 }}>{p.displayId ?? "—"}</span>{partesDoNomeDaPeca(p.tipo, p.descricao).destaque}
                            {partesDoNomeDaPeca(p.tipo, p.descricao).tipo && <span style={{ fontWeight: FW.corpo, color: T.second, marginLeft: 6 }}>{partesDoNomeDaPeca(p.tipo, p.descricao).tipo}</span>}
                          </span>
                          <span style={{ fontSize: fonte, color: T.second, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflowWrap: "anywhere" }}>
                            {[p.evento, `${p.aImprimir} un.`, p.m2 != null ? `${p.m2.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} m²` : null].filter(Boolean).join(" · ")}
                          </span>
                          {apoioDaPeca(p) && <span style={{ fontSize: fonte, color: T.second, overflowWrap: "anywhere" }}>{apoioDaPeca(p)}</span>}
                          {isMobile && <span data-testid={`selos-peca-${p.id}`} style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 2 }}>{selos}</span>}
                        </span>
                        {!isMobile && <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>{selos}</span>}
                      </button>
                      <BotaoDaFicha id={p.id} codigo={p.displayId} isMobile={isMobile} comBorda={!!(i || (cabecalhoGeral && reservadas.length))} fundo={p.reservada ? AMBAR.bg : T.surface} />
                      </div>
                    </Fragment>
                  );
                })}
                {lista.length > visiveis && (
                  <div style={{ padding: 10, borderTop: `1px solid ${T.low}`, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, flexWrap: "wrap" }}>
                    <span style={{ fontSize: fonte, color: T.second }}>Mostrando {visiveis} de {lista.length}</span>
                    <Botao variante="secundario" tamanho="sm" onClick={() => setVisiveis((v) => v + LOTE_DO_SELETOR)} data-testid="seletor-mostrar-mais" style={{ minHeight: alvoDe(34, toque) }}>
                      Mostrar mais {Math.min(LOTE_DO_SELETOR, lista.length - visiveis)}
                    </Botao>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
