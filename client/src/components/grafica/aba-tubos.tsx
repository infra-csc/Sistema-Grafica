// ─────────────────────────────────────────────────────────────────────────────
// A ABA "TUBOS" DA GRÁFICA (dono, 21/09: "devia ter uma aba de tubos para eles
// saberem quais tubos têm o quê e administrar" — e, logo depois: "põe na mesma
// da Gráfica, uma abinha separada, não precisa ser uma página").
//
// Não é rota nem item de menu: a Gráfica mostra `Fila | Tubos` e, em
// `?aba=tubos`, monta SÓ este painel (a fila pesada não renderiza, e a consulta
// detalhada dos tubos — GET /api/tubos?detalhe=1 — só roda aqui).
//
// TRÊS SEGMENTOS, na ordem em que o galpão pensa:
//   · ABERTOS — o que está embalado e ainda vai sair, agrupado por evento e
//     ordenado pela SAÍDA DO CAMINHÃO (o que sai antes aparece antes);
//   · EMBALADAS SOZINHAS — a peça que foi sem tubo (nunca "Tubo N");
//   · ENTREGUES — com quem recebeu e quando; a busca acha pelo recebedor.
// Filtro por evento e busca (código, descrição, tipo, evento, nº do tubo,
// recebedor) moram na URL — recarregar ou mandar o link mantém o recorte.
//
// AS AÇÕES não são reimplementadas aqui: cada cartão abre os MESMOS modais da
// fila (o do tubo, o de entrega), pelo TubosDialog. Um lugar só para a regra.
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { CheckCircle2, Package, Search, Tag, Truck, X } from "lucide-react";
import { TubosDialog } from "@/components/tubos-dialog";
import { linhaDaLista, semAcento as tirarAcento } from "@/lib/etiqueta-lista";
import { useDensidadeDoConteudo, usePonteiroGrosso, alvo as alvoDe } from "@/hooks/use-mobile";
import { intervaloDePolling } from "@/hooks/use-websocket";
import { Abas } from "@/components/ui/abas";
import { Botao } from "@/components/ui/botao";
import { EstadoVazio, EstadoErro, Esqueleto } from "@/components/ui/estados";
import { T, TOM, FS, FW, FONT, R } from "@/lib/theme";

type PecaDoTubo = { id: string; displayId: string | null; type: string; description: string | null; quantity: number; quantidadeNoTubo?: number };
export type TuboDaAba = {
  id: string; numero: number; avulso: boolean;
  evento: { id: string; name: string; truckDepartureDate: string | null };
  criadoEm: string | null;
  fotosFechamento: string[]; fechadoEm: string | null; fechadoPor: string | null;
  entregueEm: string | null; recebidoPor: string | null; entreguePor: string | null; fotoEntregaUrl: string | null;
  pecas: PecaDoTubo[]; unidades: number; podeAgir: boolean;
};
type Segmento = "abertos" | "sozinhas" | "entregues";
const SEGMENTOS: Array<{ id: Segmento; rotulo: string }> = [
  { id: "abertos", rotulo: "Abertos" }, { id: "sozinhas", rotulo: "Embaladas sozinhas" }, { id: "entregues", rotulo: "Entregues" },
];
const LOTE = 30;
// Os papéis de cor da aba, em tokens (antes, dez hex locais).
const COR = { texto: T.text, sec: T.apoio, borda: T.border, fundo: T.bg, laranja: T.accentText, verde: TOM.sucesso.text, azul: TOM.info.text, ambar: TOM.alerta.text };
const SEM_TUBOS: TuboDaAba[] = [];

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
// (a mesma de lib/etiqueta-lista — uma regra só para tirar acento)
const semAcento = (v: unknown) => tirarAcento(String(v ?? ""));
const dia = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" }) : null);
const quando = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");
/** Dias até a saída do caminhão (negativo = já saiu). null sem data. */
export const diasAteASaida = (iso: string | null, agora = new Date()): number | null => {
  if (!iso) return null;
  const d = new Date(iso);
  return Math.round((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(agora.getFullYear(), agora.getMonth(), agora.getDate())) / 86_400_000);
};

/** Lê e escreve um parâmetro da URL sem recarregar — os filtros da FILA (outros parâmetros) não se perdem. */
function useParametro(nome: string, padrao = ""): [string, (v: string) => void] {
  const ler = () => new URLSearchParams(window.location.search).get(nome) ?? padrao;
  const [valor, setValor] = useState(ler);
  const mudar = (v: string) => {
    const u = new URL(window.location.href);
    if (!v || v === padrao) u.searchParams.delete(nome); else u.searchParams.set(nome, v);
    window.history.replaceState(null, "", u.pathname + u.search);
    setValor(v);
  };
  return [valor, mudar];
}

/** A busca da aba: código, tipo, descrição, evento, nº do tubo ("tubo 2" ou "2") e recebedor. */
export function tuboCasa(t: TuboDaAba, busca: string): boolean {
  const q = semAcento(busca).trim();
  if (!q) return true;
  // "tubo 2" é o NÚMERO do tubo, exato — senão o "2" casaria com "2x1" e "#0002".
  const porNumero = q.match(/^tubo *([0-9]+)$/);
  if (porNumero) return !t.avulso && t.numero === Number(porNumero[1]);
  const alvo = semAcento([
    t.avulso ? "sozinha embalada" : `tubo ${t.numero}`, t.evento.name, t.recebidoPor, t.fechadoPor,
    ...t.pecas.flatMap((p) => [p.displayId, p.type, p.description]),
  ].join(" "));
  return q.split(/\s+/).every((palavra) => alvo.includes(palavra));
}

export function AbaTubos({ sugestaoRecebedor, onEntregou, onAbrirPeca }: {
  sugestaoRecebedor?: string;
  onEntregou?: (recebedor: string) => void;
  onAbrirPeca?: (itemId: string) => void;
}) {
  // Grade × coluna única pela ÁREA ÚTIL (a sidebar aberta come 256px que a
  // janela não conta); o alvo pelo PONTEIRO — o tablet do galpão é dedo.
  const { ref: refDaAba, cards, isMobile } = useDensidadeDoConteudo<HTMLElement>(0);
  const grosso = usePonteiroGrosso();
  const toque = grosso || isMobile;
  const alvo = alvoDe(36, toque);
  const { data = SEM_TUBOS, isLoading, isError, refetch, isFetching } = useQuery<TuboDaAba[]>({ queryKey: ["/api/tubos", "?detalhe=1"], refetchInterval: intervaloDePolling(60_000) });
  const [seg, setSeg] = useParametro("seg", "abertos");
  const [eventoId, setEventoId] = useParametro("tuboEvento");
  const [busca, setBusca] = useParametro("tuboBusca");
  const [mostrando, setMostrando] = useState(LOTE);
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const [modal, setModal] = useState<{ evento: { id: string; name: string }; verTubo?: string; entregarTubo?: string } | null>(null);
  const segmento: Segmento = (SEGMENTOS.find((x) => x.id === seg)?.id ?? "abertos");

  const doSegmento = (t: TuboDaAba, qual: Segmento) =>
    qual === "entregues" ? !!t.entregueEm : !t.entregueEm && t.pecas.length > 0 && (qual === "sozinhas" ? t.avulso : !t.avulso);
  const contagem = useMemo(() => Object.fromEntries(SEGMENTOS.map((x) => [x.id, data.filter((t) => doSegmento(t, x.id)).length])) as Record<Segmento, number>, [data]);
  const eventos = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of data) m.set(t.evento.id, t.evento.name);
    return Array.from(m, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [data]);

  const lista = useMemo(() => {
    const filtrada = data.filter((t) => doSegmento(t, segmento) && (!eventoId || t.evento.id === eventoId) && tuboCasa(t, busca));
    return filtrada.sort((a, b) => segmento === "entregues"
      ? String(b.entregueEm).localeCompare(String(a.entregueEm))
      // Abertos: o caminhão que sai antes vem antes; sem data vai para o fim.
      : String(a.evento.truckDepartureDate ?? "9999").localeCompare(String(b.evento.truckDepartureDate ?? "9999")) || a.evento.name.localeCompare(b.evento.name, "pt-BR") || a.numero - b.numero);
  }, [data, segmento, eventoId, busca]);

  // O RESUMO fala do que ainda vai SAIR (abertos + sozinhas), não do recorte.
  const resumo = useMemo(() => {
    const porSair = data.filter((t) => !t.entregueEm && t.pecas.length > 0);
    const tubos = porSair.filter((t) => !t.avulso).length;
    const sozinhas = porSair.length - tubos;
    const unidades = porSair.reduce((u, t) => u + t.unidades, 0);
    const urgentes = new Set(porSair.filter((t) => { const d = diasAteASaida(t.evento.truckDepartureDate); return d !== null && d <= 2; }).map((t) => t.evento.id)).size;
    return { tubos, sozinhas, unidades, urgentes };
  }, [data]);

  const irPara = (s: Segmento) => { setSeg(s); setMostrando(LOTE); };
  // O "Etiqueta" é um LINK (rota própria), então não vira <Botao>: pega a
  // mesma classe de hover/foco e o desenho do secundário.
  const estiloDoLink: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, minHeight: alvo, padding: "0 12px",
    borderRadius: R.md, fontFamily: FONT.corpo, fontSize: toque ? FS.strong : FS.meta, fontWeight: FW.forte, textDecoration: "none",
    border: `1px solid ${COR.borda}`, background: T.surface, color: T.strong,
  };
  const tamanhoDoBotao = toque ? "toque" : "sm";
  const campo: React.CSSProperties = { height: toque ? 44 : 38, boxSizing: "border-box", borderRadius: R.md, border: `1px solid ${COR.borda}`, background: T.surface, color: COR.texto, fontSize: isMobile ? FS.lead : FS.body, padding: "0 10px" };

  // aria-label e não aria-labelledby: o <Abas> da Gráfica não dá id às abas.
  return (
    <section ref={refDaAba} id="painel-tubos" role="tabpanel" aria-label="Tubos" data-testid="aba-tubos" style={{ display: "flex", flexDirection: "column", gap: 14, padding: isMobile ? "12px 12px 24px" : "16px 0 32px" }}>
      <p data-testid="tubos-resumo" aria-live="polite" style={{ margin: 0, fontSize: isMobile ? FS.read : FS.body, color: COR.sec }}>
        {isLoading ? "Carregando os tubos…" : (
          <>
            <strong style={{ color: COR.texto }}>{plural(resumo.tubos, "tubo aberto", "tubos abertos")}</strong>
            {resumo.sozinhas > 0 ? ` · ${plural(resumo.sozinhas, "embalada sozinha", "embaladas sozinhas")}` : ""} · {resumo.unidades} un.
            {resumo.urgentes > 0 ? <strong style={{ color: COR.ambar }}> · {plural(resumo.urgentes, "evento sai", "eventos saem")} em até 2 dias</strong> : null}
            {isFetching ? <span style={{ color: COR.sec }}> · atualizando…</span> : null}
          </>
        )}
      </p>

      {/* Segmentos: o MESMO <Abas> da Gráfica e de Máquinas (setas, roving
          tabindex e alvo de 44px moram lá). O wrapper guarda o testid antigo
          e a rolagem lateral do trilho no celular. */}
      <div data-testid="tubos-segmentos" style={{ overflowX: "auto", scrollbarWidth: "none", maxWidth: "100%" }}>
        <Abas
          itens={SEGMENTOS.map((x) => ({ id: x.id, rotulo: x.rotulo, contador: contagem[x.id] ?? 0 }))}
          ativo={segmento}
          aoTrocar={(id) => irPara(id as Segmento)}
          rotuloDaLista="Quais tubos"
          prefixoDeTestId="tubos-seg"
        />
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <label style={{ position: "relative", flex: "2 1 220px", minWidth: 0 }}>
          <span className="sr-only">Buscar nos tubos</span>
          <Search aria-hidden="true" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", width: 14, height: 14, color: COR.sec }} />
          <input value={busca} onChange={(e) => { setBusca(e.target.value); setMostrando(LOTE); }} data-testid="tubos-busca" type="search"
            placeholder={segmento === "entregues" ? "Código, descrição, evento, nº do tubo ou quem recebeu" : "Código, descrição, evento ou nº do tubo"}
            style={{ ...campo, width: "100%", paddingLeft: 30 }} />
        </label>
        <label style={{ flex: "1 1 180px", minWidth: 0 }}>
          <span className="sr-only">Filtrar por evento</span>
          <select value={eventoId} onChange={(e) => { setEventoId(e.target.value); setMostrando(LOTE); }} data-testid="tubos-evento" style={{ ...campo, width: "100%" }}>
            <option value="">Todos os eventos</option>
            {eventos.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </label>
        {(busca || eventoId) && (
          <Botao variante="fantasma" tamanho={tamanhoDoBotao} icone={X} onClick={() => { setBusca(""); setEventoId(""); }} data-testid="tubos-limpar">
            Limpar
          </Botao>
        )}
      </div>

      {isError && (
        <EstadoErro compacto titulo="Não foi possível carregar os tubos." aoTentarDeNovo={() => refetch()} />
      )}

      {isLoading && <Esqueleto variante="cartoes" linhas={4} rotulo="Carregando os tubos" />}

      {!isLoading && !isError && lista.length === 0 && (
        <div data-testid="tubos-vazio">
          <EstadoVazio
            compacto
            icone={Package}
            titulo={busca || eventoId ? "Nada com esse filtro. Limpe a busca ou troque o evento."
              : segmento === "abertos" ? "Nenhum tubo aberto. Embale peças conferidas na Gráfica."
              : segmento === "sozinhas" ? "Nenhuma peça embalada sozinha esperando a entrega."
              : "Nenhum tubo entregue ainda."}
          />
        </div>
      )}

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: cards ? "minmax(0, 1fr)" : "repeat(auto-fill, minmax(340px, 1fr))" }}>
        {lista.slice(0, mostrando).map((t) => {
          const d = diasAteASaida(t.evento.truckDepartureDate);
          const aberto = expandidos.has(t.id);
          const visiveis = aberto ? t.pecas : t.pecas.slice(0, 4);
          const nome = t.avulso ? `Embalagem de ${t.pecas[0]?.displayId ?? "peça"}` : `Tubo ${t.numero}`;
          return (
            <article key={t.id} data-testid={`cartao-tubo-${t.id}`} aria-label={`${nome} · ${t.evento.name}`}
              style={{ display: "flex", flexDirection: "column", minWidth: 0, border: `1px solid ${COR.borda}`, borderRadius: R.lg, background: T.surface, overflow: "hidden" }}>
              <header style={{ padding: "10px 12px", background: COR.fundo, borderBottom: `1px solid ${COR.borda}`, display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                  <strong style={{ fontFamily: FONT.display, fontSize: FS.lead, color: COR.texto }}>{nome}</strong>
                  <span style={{ fontSize: FS.meta, color: COR.sec }}>{plural(t.pecas.length, "peça", "peças")} · {t.unidades} un. · {t.fotosFechamento.length ? plural(t.fotosFechamento.length, "foto", "fotos") : "sem foto"}</span>
                </span>
                <span style={{ fontSize: FS.body, color: COR.sec, overflowWrap: "anywhere" }}>
                  {t.evento.name}
                  {t.entregueEm
                    ? <strong style={{ color: COR.verde }}> · entregue{t.recebidoPor ? ` a ${t.recebidoPor}` : ""} em {quando(t.entregueEm)}</strong>
                    : d !== null ? <strong style={{ color: d <= 2 ? COR.ambar : COR.sec }}> · caminhão {dia(t.evento.truckDepartureDate)}{d < 0 ? " (já saiu)" : d === 0 ? " (hoje)" : d === 1 ? " (amanhã)" : ` (em ${d} dias)`}</strong> : null}
                </span>
              </header>

              {t.fotosFechamento.length > 0 && (
                <div style={{ display: "flex", gap: 6, padding: "8px 12px 0", flexWrap: "wrap" }}>
                  {t.fotosFechamento.slice(0, 5).map((url, i) => (
                    <a key={url} href={url} target="_blank" rel="noreferrer" aria-label={`Foto ${i + 1} de ${nome} — abrir`} style={{ width: 44, height: 44, borderRadius: R.sm, overflow: "hidden", border: `1px solid ${COR.borda}`, display: "block" }}>
                      <img src={url} alt="" loading="lazy" decoding="async" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    </a>
                  ))}
                </div>
              )}

              <ul style={{ margin: 0, padding: "8px 12px", listStyle: "none", display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
                {visiveis.map((p) => (
                  <li key={p.id} style={{ display: "flex", gap: 8, fontSize: FS.body, color: COR.texto }}>
                    <span style={{ fontFamily: FONT.mono, fontWeight: FW.forte, color: COR.laranja, flexShrink: 0 }}>{p.displayId ?? "—"}</span>
                    <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>{linhaDaLista(p)}</span>
                  </li>
                ))}
                {t.pecas.length > 4 && (
                  <li>
                    {/* Link de texto dentro da lista: fica <button>, com o alvo pelo ponteiro. */}
                    <button type="button" aria-expanded={aberto} data-testid={`ver-tudo-${t.id}`}
                      onClick={() => setExpandidos((s) => { const n = new Set(s); if (n.has(t.id)) n.delete(t.id); else n.add(t.id); return n; })}
                      style={{ minHeight: alvo, padding: 0, border: "none", background: "none", color: COR.azul, fontSize: FS.body, fontWeight: FW.forte, cursor: "pointer" }}>
                      {aberto ? "Ver menos" : `Ver tudo (${t.pecas.length})`}
                    </button>
                  </li>
                )}
              </ul>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", padding: "10px 12px", borderTop: `1px solid ${COR.borda}` }}>
                {t.podeAgir && (
                  <Botao variante="primario" tamanho={tamanhoDoBotao} icone={Truck} onClick={() => setModal({ evento: t.evento, entregarTubo: t.id })} data-testid={`aba-entregar-${t.id}`}>
                    {t.avulso ? "Entregar" : "Entregar tubo"}
                  </Botao>
                )}
                <Botao variante="secundario" tamanho={tamanhoDoBotao} icone={t.entregueEm ? CheckCircle2 : Package} onClick={() => setModal({ evento: t.evento, verTubo: t.id })} data-testid={`aba-abrir-${t.id}`}>
                  {t.entregueEm ? "Ver o registro" : "Abrir · fotos e peças"}
                </Botao>
                {!t.avulso && (
                  <Link href={`/grafica/tubos/${t.id}/etiqueta`} data-testid={`aba-etiqueta-${t.id}`} className="ds-botao" style={estiloDoLink}>
                    <Tag aria-hidden="true" style={{ width: 14, height: 14 }} /> Etiqueta
                  </Link>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {lista.length > mostrando && (
        <Botao variante="secundario" tamanho={tamanhoDoBotao} onClick={() => setMostrando((n) => n + LOTE)} data-testid="tubos-mostrar-mais" style={{ alignSelf: "center", padding: "0 20px" }}>
          Mostrar mais ({lista.length - mostrando} de {lista.length})
        </Botao>
      )}

      <TubosDialog evento={modal ? { id: modal.evento.id, name: modal.evento.name } : null} onClose={() => setModal(null)}
        verTubo={modal?.verTubo} tuboInicial={modal?.entregarTubo}
        onAbrirPeca={onAbrirPeca ? (id) => { setModal(null); onAbrirPeca(id); } : undefined}
        sugestaoRecebedor={sugestaoRecebedor} onEntregou={onEntregou} />
    </section>
  );
}
