// ─────────────────────────────────────────────────────────────────────────────
// VERSÕES APROVADAS — qual versão da arte cada patrocinador aprovou, de qual
// peça, e os books de cada evento com história baixável.
//
// Pedido do dono (21/08/2026). A pergunta desta tela é de auditoria comercial:
// "o que o Bradesco aprovou, e é isso que está indo para a gráfica?". Ela
// responde por peça — as versões em ordem, e em cada patrocinador QUAL delas
// ele decidiu — e por evento, os books publicados, cada um baixável.
//
// O que é REGISTRO e o que é INFERÊNCIA ficam separados na tela: uma decisão
// anterior às tabelas novas recebe a versão vigente na data, com o selo
// "inferido pela data". Inferência apresentada como registro é exatamente o
// erro que esta tela existe para evitar.
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo, useState, useDeferredValue } from "react";
import { useQuery } from "@tanstack/react-query";
import { GitBranch, Search, X, Download, FileText, Check, Clock, AlertTriangle, ExternalLink } from "lucide-react";
import { Link } from "wouter";
import { FilterSelect } from "@/components/filter-select";
import { useIsMobile } from "@/hooks/use-mobile";
import { T, FS, R, SHADOW } from "@/lib/theme";
import { getApprovalMeta } from "@/lib/status";
import { isWebUrl } from "@/components/file-preview";

type Versao = { thumbUrl: string; em: string; origem: "envio" | "reenvio" | "troca" | "trilha" | "atual"; por: string | null; inferida: boolean };
type Decisao = { sponsorId: string; nome: string; cor: string | null; status: string; decididoEm: string | null; por: string | null; motivo: string | null; thumbUrl: string | null; versao: number | null; inferido: boolean };
type Peca = {
  id: string; displayId: string; type: string; description: string | null; status: string;
  eventId: string; eventName: string; truckDepartureDate: string | null;
  approvalThumbUrl: string | null; bookUrl: string | null;
  versoes: Versao[]; decisoes: Decisao[];
};
type BookDoEvento = { eventId: string; eventName: string; truckDepartureDate: string | null; books: { bookUrl: string; em: string; por: string | null; itemCount: number; inferido: boolean }[] };
type Payload = { itens: Peca[]; books: BookDoEvento[] };

const ORIGEM_LABEL: Record<Versao["origem"], string> = {
  envio: "enviada para aprovação",
  reenvio: "reenviada após correção",
  troca: "trocada pela Arte",
  trilha: "reconstruída da trilha",
  atual: "thumb atual da peça",
};

const fmtData = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }) + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
};

const PAGE = 40;

export default function Versoes() {
  const isMobile = useIsMobile();
  const { data, isLoading, isError, refetch } = useQuery<Payload>({ queryKey: ["/api/versoes"] });
  const [busca, setBusca] = useState("");
  const buscaLenta = useDeferredValue(busca.trim().toLowerCase());
  const [eventoFiltro, setEventoFiltro] = useState<string[]>([]);
  const [patrocinadorFiltro, setPatrocinadorFiltro] = useState<string[]>([]);
  const [aba, setAba] = useState<"pecas" | "books">("pecas");
  const [visiveis, setVisiveis] = useState(PAGE);

  const itens = data?.itens ?? [];
  const books = data?.books ?? [];

  // ── facetas: cada uma conta o pool SEM a própria dimensão ──
  const casaBusca = (p: Peca) => !buscaLenta || `${p.displayId} ${p.type} ${p.description ?? ""} ${p.eventName}`.toLowerCase().includes(buscaLenta);
  const casaEvento = (p: Peca) => eventoFiltro.length === 0 || eventoFiltro.includes(p.eventId);
  const casaPatrocinador = (p: Peca) => patrocinadorFiltro.length === 0 || p.decisoes.some(d => patrocinadorFiltro.includes(d.sponsorId));

  const opcoesEvento = useMemo(() => {
    const m = new Map<string, { label: string; count: number }>();
    itens.filter(p => casaBusca(p) && casaPatrocinador(p)).forEach(p => {
      const e = m.get(p.eventId) ?? { label: p.eventName, count: 0 };
      e.count += 1; m.set(p.eventId, e);
    });
    return Array.from(m.entries()).map(([value, v]) => ({ value, label: v.label, count: v.count })).sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itens, buscaLenta, patrocinadorFiltro]);
  const opcoesPatrocinador = useMemo(() => {
    const m = new Map<string, { label: string; count: number }>();
    itens.filter(p => casaBusca(p) && casaEvento(p)).forEach(p => {
      for (const d of p.decisoes) {
        const e = m.get(d.sponsorId) ?? { label: d.nome, count: 0 };
        e.count += 1; m.set(d.sponsorId, e);
      }
    });
    return Array.from(m.entries()).map(([value, v]) => ({ value, label: v.label, count: v.count })).sort((a, b) => b.count - a.count);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itens, buscaLenta, eventoFiltro]);

  const filtradas = useMemo(
    () => itens.filter(p => casaBusca(p) && casaEvento(p) && casaPatrocinador(p))
      .sort((a, b) => (b.truckDepartureDate ?? "").localeCompare(a.truckDepartureDate ?? "") || a.eventName.localeCompare(b.eventName, "pt-BR") || a.displayId.localeCompare(b.displayId)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [itens, buscaLenta, eventoFiltro, patrocinadorFiltro],
  );
  const booksFiltrados = useMemo(
    () => books.filter(b => (eventoFiltro.length === 0 || eventoFiltro.includes(b.eventId)) && (!buscaLenta || b.eventName.toLowerCase().includes(buscaLenta)))
      .sort((a, b) => (b.truckDepartureDate ?? "").localeCompare(a.truckDepartureDate ?? "")),
    [books, eventoFiltro, buscaLenta],
  );

  // Um bloco por evento, na ordem da lista.
  const blocos = useMemo(() => {
    const out: { eventId: string; eventName: string; pecas: Peca[] }[] = [];
    for (const p of filtradas.slice(0, visiveis)) {
      const u = out[out.length - 1];
      if (u && u.eventId === p.eventId) u.pecas.push(p);
      else out.push({ eventId: p.eventId, eventName: p.eventName, pecas: [p] });
    }
    return out;
  }, [filtradas, visiveis]);

  const filtrosAtivos = (busca ? 1 : 0) + (eventoFiltro.length ? 1 : 0) + (patrocinadorFiltro.length ? 1 : 0);
  const limpar = () => { setBusca(""); setEventoFiltro([]); setPatrocinadorFiltro([]); setVisiveis(PAGE); };
  const alturaControle = isMobile ? 44 : 36;

  // ── Contadores do cabeçalho: inferidas vs registradas ──
  const totais = useMemo(() => {
    let decisoes = 0, inferidas = 0, semVersao = 0;
    for (const p of filtradas) for (const d of p.decisoes) {
      if (!d.decididoEm) continue;
      decisoes += 1;
      if (d.inferido) inferidas += 1;
      if (d.thumbUrl === null) semVersao += 1;
    }
    return { decisoes, inferidas, semVersao };
  }, [filtradas]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", backgroundColor: T.bg }}>
      {/* ── Cabeçalho ── */}
      <div style={{ flexShrink: 0, backgroundColor: "#ffffff", borderBottom: `1px solid ${T.border}`, padding: isMobile ? "14px 16px 0" : "20px 32px 0" }}>
        <div style={{ maxWidth: 1600, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
            <div style={{ width: 40, height: 40, borderRadius: R.lg, backgroundColor: T.accent, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <GitBranch style={{ width: 20, height: 20, color: "#ffffff" }} />
            </div>
            <div>
              <h1 data-testid="title-versoes" style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700, fontSize: FS.h1, letterSpacing: "-0.03em", color: T.text, margin: 0 }}>
                Versões aprovadas
              </h1>
              <p style={{ fontSize: FS.small, color: T.second, margin: 0 }}>
                Qual versão da arte cada patrocinador aprovou, por peça — e os books de cada evento, baixáveis
              </p>
            </div>
          </div>

          {/* A FRASE DE CONFIANÇA: quanto do que a tela mostra é registro e quanto é inferência. */}
          {!isLoading && totais.decisoes > 0 && (
            <p data-testid="text-confianca-versoes" style={{ fontSize: FS.body, color: "#57534e", margin: "10px 0 0", lineHeight: 1.5 }}>
              {totais.decisoes} {totais.decisoes === 1 ? "decisão" : "decisões"} de patrocinador no recorte
              {totais.inferidas > 0 && <> · <strong style={{ color: "#9a3412" }}>{totais.inferidas}</strong> com a versão <strong style={{ color: "#9a3412" }}>inferida pela data</strong> (anteriores ao registro)</>}
              {totais.inferidas === 0 && <> · todas com a versão registrada</>}
              {totais.semVersao > 0 && <> · {totais.semVersao} sem nenhuma versão localizável</>}
            </p>
          )}

          {/* Abas */}
          <div role="tablist" aria-label="Ver" style={{ display: "inline-flex", backgroundColor: T.low, borderRadius: R.md, padding: 3, gap: 2, margin: "14px 0" }}>
            {([["pecas", `Peças (${filtradas.length})`], ["books", `Books (${booksFiltrados.reduce((s, b) => s + b.books.length, 0)})`]] as const).map(([valor, rotulo]) => {
              const ativo = aba === valor;
              return (
                <button key={valor} type="button" role="tab" aria-selected={ativo} data-testid={`tab-versoes-${valor}`}
                  onClick={() => setAba(valor)}
                  style={{ height: isMobile ? 38 : 30, padding: "0 14px", borderRadius: R.sm, border: "none", fontSize: FS.body, fontWeight: 700, color: ativo ? T.text : "#57534e", backgroundColor: ativo ? "#ffffff" : "transparent", boxShadow: ativo ? SHADOW.sm : "none", cursor: "pointer", fontFamily: "inherit" }}>
                  {rotulo}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Filtros ── */}
      <div style={{ flexShrink: 0, backgroundColor: "#ffffff", borderBottom: `1px solid ${T.border}`, padding: isMobile ? "10px 16px" : "10px 32px" }}>
        <div style={{ maxWidth: 1600, margin: "0 auto", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <FilterSelect label="Evento" allLabel="Todos os eventos" values={eventoFiltro} onValuesChange={v => { setEventoFiltro(v); setVisiveis(PAGE); }} options={opcoesEvento} searchPlaceholder="Buscar evento..." emptyText="Nenhum evento" testId="filter-versoes-evento" />
          <FilterSelect label="Patrocinador" allLabel="Todos os patrocinadores" values={patrocinadorFiltro} onValuesChange={v => { setPatrocinadorFiltro(v); setVisiveis(PAGE); }} options={opcoesPatrocinador} searchPlaceholder="Buscar patrocinador..." emptyText="Nenhum patrocinador" testId="filter-versoes-patrocinador" />
          <div style={{ position: "relative", width: isMobile ? "100%" : 300, marginLeft: isMobile ? 0 : "auto" }}>
            <Search style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", width: 13, height: 13, color: T.muted, pointerEvents: "none" }} />
            <input value={busca} onChange={e => { setBusca(e.target.value); setVisiveis(PAGE); }} placeholder="Peça, tipo ou evento…" aria-label="Buscar" data-testid="input-busca-versoes"
              style={{ width: "100%", height: alturaControle, paddingLeft: 32, paddingRight: 12, border: `1px solid ${T.border}`, borderRadius: R.pill, backgroundColor: "#ffffff", fontSize: FS.body, color: T.text, fontFamily: "inherit" }} />
          </div>
          {filtrosAtivos > 0 && (
            <button type="button" onClick={limpar} data-testid="button-limpar-versoes"
              style={{ height: alturaControle, padding: "0 12px", borderRadius: R.md, border: `1px solid #fecaca`, backgroundColor: "#fef2f2", color: "#b91c1c", fontSize: FS.small, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5 }}>
              <X style={{ width: 12, height: 12 }} /> Limpar ({filtrosAtivos})
            </button>
          )}
        </div>
      </div>

      {/* ── Corpo ── */}
      <div style={{ flex: "1 1 auto", minHeight: 0, overflowY: "auto", padding: isMobile ? 12 : "20px 32px" }}>
        <div style={{ maxWidth: 1600, margin: "0 auto" }}>
          {isLoading ? (
            <p data-testid="skeleton-versoes" style={{ color: T.second, fontSize: FS.body }}>Carregando as versões…</p>
          ) : isError ? (
            <div role="alert" style={{ padding: "60px 24px", textAlign: "center" }}>
              <h3 style={{ color: "#b91c1c", fontSize: FS.strong, fontWeight: 700, margin: "0 0 6px" }}>Não foi possível carregar as versões</h3>
              <button onClick={() => refetch()} data-testid="button-retry-versoes" style={{ fontSize: FS.body, fontWeight: 700, color: "#fff", background: T.dark, border: "none", borderRadius: R.md, padding: "9px 20px", cursor: "pointer" }}>Tentar novamente</button>
            </div>
          ) : aba === "books" ? (
            /* ── BOOKS POR EVENTO ── */
            booksFiltrados.length === 0 ? (
              <p style={{ color: T.second, fontSize: FS.body }}>Nenhum book publicado no recorte.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {booksFiltrados.map(ev => (
                  <section key={ev.eventId} data-testid={`books-evento-${ev.eventId}`} style={{ backgroundColor: "#ffffff", border: `1px solid ${T.border}`, borderRadius: R.lg, boxShadow: SHADOW.sm, overflow: "hidden" }}>
                    <div style={{ padding: "12px 18px", borderBottom: `1px solid ${T.low}`, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <Link href={`/eventos/${ev.eventId}`} style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: FS.strong, fontWeight: 700, color: T.text, textDecoration: "none" }}>{ev.eventName}</Link>
                      <span style={{ fontSize: FS.small, color: T.second }}>{ev.books.length} {ev.books.length === 1 ? "book" : "books"}</span>
                    </div>
                    <div>
                      {ev.books.map((b, i) => (
                        <div key={`${b.bookUrl}-${i}`} data-testid={`book-${ev.eventId}-${i}`} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 18px", borderBottom: i < ev.books.length - 1 ? `1px solid ${T.low}` : "none", flexWrap: "wrap" }}>
                        <span aria-hidden="true" style={{ width: 30, height: 30, borderRadius: R.md, backgroundColor: "#faf5ff", color: "#7e22ce", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><FileText style={{ width: 15, height: 15 }} /></span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ margin: 0, fontSize: FS.body, fontWeight: 700, color: T.text }}>
                            {i === 0 && !b.inferido ? "Book atual" : i === 0 ? "Book atual" : `Book anterior`}
                            <span style={{ fontWeight: 500, color: T.second }}> · {b.itemCount} {b.itemCount === 1 ? "peça" : "peças"}</span>
                          </p>
                          <p style={{ margin: "2px 0 0", fontSize: FS.small, color: T.second }}>
                            {b.em ? `publicado em ${fmtData(b.em)}${b.por ? ` por ${b.por}` : ""}` : "publicado antes do registro de books — data não gravada"}
                          </p>
                        </div>
                        {isWebUrl(b.bookUrl) ? (
                          <a href={b.bookUrl} download target="_blank" rel="noopener noreferrer" data-testid={`link-baixar-book-${ev.eventId}-${i}`}
                            style={{ display: "inline-flex", alignItems: "center", gap: 6, height: alturaControle, padding: "0 14px", borderRadius: R.md, border: `1px solid ${T.border}`, backgroundColor: "#ffffff", color: T.text, fontSize: FS.small, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", textDecoration: "none", whiteSpace: "nowrap" }}>
                            <Download style={{ width: 13, height: 13 }} /> Baixar
                          </a>
                        ) : (
                          <span title={b.bookUrl} style={{ fontSize: FS.small, color: T.second }}>arquivo fora do app</span>
                        )}
                      </div>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )
          ) : filtradas.length === 0 ? (
            <div style={{ padding: "60px 24px", textAlign: "center" }}>
              <p style={{ color: T.text, fontSize: FS.strong, fontWeight: 700, margin: "0 0 4px" }}>Nenhuma peça com aprovação no recorte</p>
              {filtrosAtivos > 0 && <button onClick={limpar} style={{ marginTop: 12, fontSize: FS.body, fontWeight: 700, color: "#fff", background: T.dark, border: "none", borderRadius: R.md, padding: "9px 20px", cursor: "pointer" }}>Limpar filtros</button>}
            </div>
          ) : (
            /* ── PEÇAS, por evento ── */
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              {blocos.map(bloco => (
                <section key={bloco.eventId}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                    <Link href={`/eventos/${bloco.eventId}`} style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: FS.strong, fontWeight: 700, color: T.text, textDecoration: "none", textTransform: "uppercase", letterSpacing: "-0.01em" }}>{bloco.eventName}</Link>
                    <div style={{ flex: 1, height: 1, backgroundColor: T.border }} />
                    <span style={{ fontSize: FS.micro, fontWeight: 700, color: T.second, textTransform: "uppercase", letterSpacing: "0.08em" }}>{bloco.pecas.length} {bloco.pecas.length === 1 ? "peça" : "peças"}</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {bloco.pecas.map(p => <CartaoDaPeca key={p.id} p={p} isMobile={isMobile} />)}
                  </div>
                </section>
              ))}
              {filtradas.length > visiveis && (
                <button type="button" onClick={() => setVisiveis(v => v + PAGE)} data-testid="button-mais-versoes"
                  style={{ width: "100%", padding: 13, background: "#ffffff", border: `1px solid ${T.border}`, borderRadius: R.lg, color: T.text, fontWeight: 700, fontSize: FS.body, cursor: "pointer" }}>
                  Mostrar mais ({filtradas.length - visiveis} restantes)
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Um cartão por peça: a régua de versões em cima, a decisão de cada patrocinador embaixo. */
function CartaoDaPeca({ p, isMobile }: { p: Peca; isMobile: boolean }) {
  return (
    <article data-testid={`versoes-peca-${p.id}`} style={{ backgroundColor: "#ffffff", border: `1px solid ${T.border}`, borderRadius: R.lg, boxShadow: SHADOW.sm, padding: isMobile ? 12 : "14px 18px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <Link href={`/eventos/${p.eventId}?item=${p.id}`} style={{ fontFamily: "'DM Mono', monospace", fontSize: FS.body, fontWeight: 700, color: T.accentText, textDecoration: "none" }}>{p.displayId}</Link>
        <span style={{ fontSize: FS.body, fontWeight: 700, color: T.text }}>{p.type}</span>
        {p.description && <span style={{ fontSize: FS.body, color: "#57534e", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.description}</span>}
      </div>

      {/* A RÉGUA DE VERSÕES: v1, v2, v3… com thumb, data e origem. */}
      <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4, marginBottom: 10 }}>
        {p.versoes.length === 0 && <span style={{ fontSize: FS.small, color: T.second }}>Nenhuma versão de arte localizada para esta peça.</span>}
        {p.versoes.map((v, i) => {
          const atual = v.thumbUrl === p.approvalThumbUrl;
          return (
            <div key={`${v.thumbUrl}-${i}`} data-testid={`versao-${p.id}-${i + 1}`} title={`v${i + 1} · ${ORIGEM_LABEL[v.origem]} · ${fmtData(v.em)}${v.por ? ` · ${v.por}` : ""}${v.inferida ? " · reconstruída, não gravada como versão" : ""}`}
              style={{ flexShrink: 0, width: 132, border: `1px solid ${atual ? "#fed7aa" : T.border}`, borderRadius: R.md, overflow: "hidden", backgroundColor: atual ? "#fff7ed" : "#fafaf9" }}>
              <a href={isWebUrl(v.thumbUrl) ? v.thumbUrl : undefined} target="_blank" rel="noopener noreferrer" style={{ display: "block", height: 84, backgroundColor: "#ffffff" }}>
                {isWebUrl(v.thumbUrl)
                  ? <img src={v.thumbUrl} alt={`Versão ${i + 1}`} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                  : <span style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", fontSize: FS.micro, color: T.second }}>sem prévia</span>}
              </a>
              <div style={{ padding: "6px 8px" }}>
                <p style={{ margin: 0, fontSize: FS.small, fontWeight: 800, color: atual ? "#9a3412" : T.text, display: "flex", alignItems: "center", gap: 5 }}>
                  v{i + 1}{atual && <span style={{ fontSize: FS.micro, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>· atual</span>}
                  {v.inferida && <AlertTriangle aria-hidden="true" style={{ width: 10, height: 10, color: "#b45309", marginLeft: "auto" }} />}
                </p>
                <p style={{ margin: "2px 0 0", fontSize: FS.micro, color: T.second, fontFamily: "'DM Mono', monospace" }}>{fmtData(v.em)}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* A DECISÃO DE CADA PATROCINADOR — e qual versão ele decidiu. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {p.decisoes.length === 0 && <span style={{ fontSize: FS.small, color: T.second }}>Sem patrocinador em aprovação.</span>}
        {p.decisoes.map(d => {
          const meta = getApprovalMeta(d.status);
          const tone = meta?.tone;
          const Icone = tone === "approved" ? Check : tone === "waiting" ? Clock : AlertTriangle;
          const frase = tone === "approved"
            ? `aprovou ${d.versao ? `a v${d.versao}` : "uma versão"}`
            : tone === "waiting"
              ? "aguardando"
              : `reprovou ${d.versao ? `a v${d.versao}` : "uma versão"}`;
          return (
            <div key={d.sponsorId} data-testid={`decisao-${p.id}-${d.sponsorId}`} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "6px 10px", borderRadius: R.md, backgroundColor: meta?.bg ?? T.low, border: `1px solid ${meta?.border ?? T.border}` }}>
              <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: d.cor ?? T.muted, flexShrink: 0 }} />
              <span style={{ fontSize: FS.body, fontWeight: 700, color: T.text }}>{d.nome}</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: FS.small, fontWeight: 700, color: meta?.text ?? "#57534e" }}>
                <Icone aria-hidden="true" style={{ width: 11, height: 11 }} /> {frase}
              </span>
              {d.decididoEm && <span style={{ fontSize: FS.small, color: T.second, fontFamily: "'DM Mono', monospace" }}>{fmtData(d.decididoEm)}</span>}
              {d.por && <span style={{ fontSize: FS.small, color: T.second }}>por {d.por}</span>}
              {d.inferido && (
                /* #92400e sobre #fffbeb = 6,6:1 */
                <span title="Decisão anterior ao registro da versão: a versão mostrada é a que estava vigente na data da decisão" style={{ fontSize: FS.micro, fontWeight: 700, color: "#92400e", backgroundColor: "#fffbeb", border: "1px solid #fde68a", borderRadius: R.sm, padding: "1px 7px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  inferido pela data
                </span>
              )}
              {d.thumbUrl && d.thumbUrl !== p.approvalThumbUrl && tone === "approved" && (
                <span title="O thumb atual da peça é outro: o que este patrocinador aprovou não é o que está na peça agora" style={{ fontSize: FS.micro, fontWeight: 700, color: "#b91c1c", backgroundColor: "#fef2f2", border: "1px solid #fecaca", borderRadius: R.sm, padding: "1px 7px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  aprovou outra versão
                </span>
              )}
              {d.motivo && <span style={{ fontSize: FS.small, color: "#57534e", fontStyle: "italic", width: "100%" }}>"{d.motivo}"</span>}
              {d.thumbUrl && isWebUrl(d.thumbUrl) && (
                <a href={d.thumbUrl} target="_blank" rel="noopener noreferrer" title="Abrir a versão decidida" style={{ marginLeft: "auto", display: "inline-flex", color: T.second }}><ExternalLink style={{ width: 13, height: 13 }} /></a>
              )}
            </div>
          );
        })}
      </div>
    </article>
  );
}
