// ─────────────────────────────────────────────────────────────────────────────
// GERAR BOOK — monta o book do evento no padrão do exemplar manual e o
// publica pelo fluxo que já existe (upload + POST /book).
//
// A tela resolve as três lacunas da análise sem travar ninguém (decisão do
// dono, 25/08: "não é prioridade, resolva da melhor forma"):
//  · ORDEM dos grupos: setas ↑↓, partindo da ordem da fila (compareDisplayId).
//  · RÓTULO do grupo: editável, partindo do nome do grupo (groupKeyOf).
//  · LOGO do evento: sem cadastro, a capa leva o nome do evento no fundo
//    claro do exemplar e o rodapé assina com o nome em texto.
//
// A PRÉVIA desenha as páginas com as MESMAS células do PDF (book-spec): o
// que se vê é o que o pdf-lib vai desenhar, porque os dois leem a mesma
// régua. Peça sem arte fica fora e é LISTADA — o exemplar nunca mostra
// placeholder, e esconder sem dizer seria mentir sobre o conteúdo.
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute, Link, useLocation } from "wouter";
import { ArrowLeft, ArrowDown, ArrowUp, BookOpen, Check, Download, Loader2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { compareDisplayId } from "@/lib/displayId";
import { groupKeyOf, convertGCSUrlToLocalPath } from "@/lib/artePdfExport";
import { ehBookCompleto } from "@shared/fluxo-peca";
import { BOOK, celulasDaPagina, mioloDoBook, paginarGrupos } from "@/lib/book-spec";
import { gerarBookPdf, subirBookPdf, type HerancaDoBook, type ProgressoDoBook } from "@/lib/book-gerador";
import { BookHeranca } from "@/components/book-heranca";

interface GrupoMontado { key: string; rotulo: string; incluido: boolean; itens: any[] }

const temArteImagem = (i: any) => !!i.approvalThumbUrl && !/\.pdf$/i.test(i.approvalThumbUrl);

export default function BookGerador() {
  const [, params] = useRoute("/eventos/:id/gerar-book");
  const eventId = params?.id;
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const podePublicar = user?.role === "arte" || user?.role === "admin";

  const { data: event } = useQuery<any>({ queryKey: [`/api/events/${eventId}`], enabled: !!eventId });
  const { data: itens = [], isLoading } = useQuery<any[]>({ queryKey: ["/api/items", eventId], enabled: !!eventId });

  // Ajustes do usuário por grupo — a base deriva dos dados; isto guarda só o
  // que a pessoa mudou (rótulo, exclusão, ordem), então peça nova não some.
  const [rotulos, setRotulos] = useState<Record<string, string>>({});
  const [excluidos, setExcluidos] = useState<Set<string>>(new Set());
  const [ordem, setOrdem] = useState<string[]>([]);
  const [progresso, setProgresso] = useState<ProgressoDoBook | null>(null);
  const [publicando, setPublicando] = useState(false);
  const [resultado, setResultado] = useState<{ url: string; falhas: number } | null>(null);

  // ── Herança do book atual (o template de verdade — decisão do dono, 25/08) ──
  const [capaHerdada, setCapaHerdada] = useState(true);
  const [paginasHerdadas, setPaginasHerdadas] = useState<Set<number>>(new Set());
  const bookAtualUrl = useMemo(() => {
    // O book vive por peça (bookUrl); o primeiro não-nulo é o book do evento.
    const comBook = (itens as any[]).find((i) => i.bookUrl && !i.deletedAt);
    return comBook?.bookUrl ?? null;
  }, [itens]);
  const heranca: HerancaDoBook | null = bookAtualUrl
    ? { url: bookAtualUrl, capa: capaHerdada, paginas: Array.from(paginasHerdadas).sort((a, b) => a - b) }
    : null;
  const { grupos, semArte } = useMemo(() => {
    const vivas = (itens as any[]).filter(
      (i) => !i.deletedAt && i.status !== "canceled" && i.status !== "archived" && !ehBookCompleto(i),
    );
    const comArte = vivas.filter(temArteImagem).sort((a, b) => compareDisplayId(a.displayId, b.displayId));
    const mapa = new Map<string, any[]>();
    for (const i of comArte) {
      const k = groupKeyOf(i);
      const arr = mapa.get(k);
      if (arr) arr.push(i); else mapa.set(k, [i]);
    }
    const base = Array.from(mapa.entries()).map(([key, its]) => ({ key, itens: its }));
    // A ordem escolhida vale; grupo novo entra no fim, na ordem da fila.
    const pos = new Map(ordem.map((k, i) => [k, i]));
    base.sort((a, b) => (pos.get(a.key) ?? 999 + base.indexOf(a)) - (pos.get(b.key) ?? 999 + base.indexOf(b)));
    return {
      grupos: base.map<GrupoMontado>((g) => ({
        key: g.key,
        rotulo: rotulos[g.key] ?? g.key,
        incluido: !excluidos.has(g.key),
        itens: g.itens,
      })),
      semArte: vivas.filter((i) => !temArteImagem(i)),
    };
  }, [itens, rotulos, excluidos, ordem]);

  const mover = (key: string, delta: number) => {
    const keys = grupos.map((g) => g.key);
    const i = keys.indexOf(key);
    const j = i + delta;
    if (j < 0 || j >= keys.length) return;
    [keys[i], keys[j]] = [keys[j], keys[i]];
    setOrdem(keys);
  };

  const incluidos = grupos.filter((g) => g.incluido);
  const paginas = useMemo(
    () => paginarGrupos(incluidos.map((g) => ({ rotulo: g.rotulo.trim() || g.key, itens: g.itens }))),
    [incluidos],
  );
  const totalPecas = incluidos.reduce((s, g) => s + g.itens.length, 0);
  const nPaginasFinal = paginas.length + 1 + (heranca ? heranca.paginas.filter((n) => n !== 1).length : 0);

  /**
   * BAIXAR SEM PUBLICAR (pedido do dono, 25/08): gerar é ensaio — o PDF vai
   * para a máquina de quem gerou, para conferir e comparar com o manual.
   * Publicar continua sendo o gesto separado, de arte/admin.
   */
  const [baixando, setBaixando] = useState(false);
  const baixarPdf = async () => {
    if (baixando || publicando || totalPecas === 0) return;
    setBaixando(true);
    try {
      const { bytes, falhas } = await gerarBookPdf(event?.name ?? "Evento", paginas, setProgresso, heranca);
      const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `book-${(event?.name ?? "evento").trim().replace(/\s+/g, "-").toLowerCase()}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
      toast({
        title: "Book baixado",
        description: `${paginas.length + 1} páginas. Nada foi publicado` + (falhas.length ? ` — ${falhas.length} arte(s) falharam e ficaram fora.` : "."),
        variant: falhas.length ? "destructive" : undefined,
      });
    } catch (e: any) {
      toast({ title: "Não foi possível gerar o PDF", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setBaixando(false);
      setProgresso(null);
    }
  };

  const gerarEPublicar = async () => {
    if (!eventId || publicando || totalPecas === 0) return;
    setPublicando(true);
    setResultado(null);
    try {
      const { bytes, falhas } = await gerarBookPdf(event?.name ?? "Evento", paginas, setProgresso, heranca);
      setProgresso({ etapa: "Enviando o PDF…", feito: totalPecas, total: totalPecas });
      const bookUrl = await subirBookPdf(bytes);
      const itemIds = incluidos.flatMap((g) => g.itens.map((i) => i.id));
      await apiRequest("POST", `/api/events/${eventId}/book`, { bookUrl, itemIds });
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items", eventId] });
      setResultado({ url: bookUrl, falhas: falhas.length });
      toast({
        title: "Book gerado e publicado",
        description: `${paginas.length + 1} páginas, ${totalPecas - falhas.length} artes.` +
          (falhas.length ? ` ${falhas.length} arte${falhas.length !== 1 ? "s" : ""} falharam e ficaram fora.` : ""),
        variant: falhas.length ? "destructive" : undefined,
      });
    } catch (e: any) {
      toast({ title: "Não foi possível gerar o book", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setPublicando(false);
      setProgresso(null);
    }
  };

  if (isLoading) return <p style={{ padding: 40, fontSize: 14, color: "#78716c" }}>Carregando as peças…</p>;

  // Escala da prévia: cada página vira um cartão de ~340 px de largura.
  const ESC = 340 / BOOK.LARGURA;
  const miolo = mioloDoBook();

  return (
    <div style={{ backgroundColor: "#fafaf9", minHeight: "100%", padding: "18px 18px 64px" }}>
      <div style={{ maxWidth: 1060, margin: "0 auto" }}>

        {/* ── Barra ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
          <Link href={`/eventos/${eventId}`} data-testid="link-voltar-evento" style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 38, padding: "0 12px", borderRadius: 8, border: "1px solid #e7e5e4", color: "#44403c", fontSize: 13, fontWeight: 600, textDecoration: "none", backgroundColor: "#fff" }}>
            <ArrowLeft style={{ width: 14, height: 14 }} /> Voltar
          </Link>
          <h1 style={{ margin: 0, fontFamily: "'Space Grotesk', sans-serif", fontSize: 20, fontWeight: 800, color: "#1c1917", display: "inline-flex", alignItems: "center", gap: 8 }}>
            <BookOpen style={{ width: 18, height: 18, color: "#c2410c" }} />
            Gerar book — {event?.name ?? ""}
          </h1>
          <span style={{ flex: 1 }} />
          <button
            type="button"
            onClick={baixarPdf}
            disabled={baixando || publicando || totalPecas === 0}
            data-testid="button-baixar-book"
            title="Gera o PDF e salva na sua máquina — nada é publicado"
            style={{
              display: "inline-flex", alignItems: "center", gap: 7, height: 42, padding: "0 16px",
              borderRadius: 10, border: "1px solid #d6d3d1",
              backgroundColor: "#ffffff", color: baixando ? "#78716c" : "#1c1917",
              fontSize: 13.5, fontWeight: 700, cursor: baixando || publicando || totalPecas === 0 ? "not-allowed" : "pointer",
            }}
          >
            {baixando ? <Loader2 className="animate-spin" style={{ width: 14, height: 14 }} /> : <Download style={{ width: 14, height: 14 }} />}
            {baixando ? (progresso ? `${progresso.feito}/${progresso.total}` : "Gerando…") : "Baixar PDF"}
          </button>
          <button
            type="button"
            onClick={gerarEPublicar}
            disabled={!podePublicar || publicando || totalPecas === 0}
            data-testid="button-gerar-book"
            title={!podePublicar ? "Publicar book é da Arte e do admin — os demais podem montar e conferir a prévia." : undefined}
            style={{
              display: "inline-flex", alignItems: "center", gap: 8, height: 42, padding: "0 18px",
              borderRadius: 10, border: "none",
              backgroundColor: !podePublicar || publicando || totalPecas === 0 ? "#e7e5e4" : "#1c1917",
              color: !podePublicar || publicando || totalPecas === 0 ? "#57534e" : "#fff",
              fontSize: 14, fontWeight: 800, fontFamily: "'Space Grotesk', sans-serif",
              cursor: !podePublicar || publicando || totalPecas === 0 ? "not-allowed" : "pointer",
            }}
          >
            {publicando ? <Loader2 className="animate-spin" style={{ width: 15, height: 15 }} /> : <Check style={{ width: 15, height: 15 }} />}
            {publicando
              ? (progresso ? `${progresso.etapa} (${progresso.feito}/${progresso.total})` : "Gerando…")
              : `Gerar e publicar (${nPaginasFinal} pág.)`}
          </button>
        </div>

        {resultado && (
          <p data-testid="book-publicado" style={{ margin: "0 0 14px", padding: "10px 14px", borderRadius: 8, backgroundColor: "#f0fdf4", border: "1px solid #bbf7d0", color: "#15803d", fontSize: 13.5, fontWeight: 600 }}>
            Book publicado.{" "}
            <a href={resultado.url} target="_blank" rel="noreferrer" style={{ color: "#15803d" }}>Abrir o PDF</a>
            {" · "}o aviso por e-mail continua sendo o botão do admin, como no book manual.
          </p>
        )}

        {semArte.length > 0 && (
          <p data-testid="book-sem-arte" style={{ margin: "0 0 14px", padding: "10px 14px", borderRadius: 8, backgroundColor: "#fffbeb", border: "1px solid #fde68a", color: "#92400e", fontSize: 13 }}>
            {semArte.length} peça{semArte.length !== 1 ? "s" : ""} sem arte fica{semArte.length !== 1 ? "m" : ""} fora do book:{" "}
            {semArte.slice(0, 8).map((i: any) => i.displayId).join(", ")}{semArte.length > 8 ? ` +${semArte.length - 8}` : ""}.
            {" "}O exemplar manual nunca mostra moldura vazia.
          </p>
        )}

        {bookAtualUrl && (
          <div style={{ marginBottom: 16, padding: "12px 14px", borderRadius: 10, backgroundColor: "#fff", border: "1px solid #e7e5e4" }}>
            <p style={{ margin: "0 0 8px", fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", color: "#78716c" }}>
              Herdar do book atual
            </p>
            <BookHeranca
              bookUrl={bookAtualUrl}
              capa={capaHerdada}
              onCapaChange={setCapaHerdada}
              paginas={paginasHerdadas}
              onTogglePagina={(n) => setPaginasHerdadas((prev) => { const s2 = new Set(prev); if (s2.has(n)) s2.delete(n); else s2.add(n); return s2; })}
            />
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 380px) 1fr", gap: 16, alignItems: "start" }}>

          {/* ── Montagem: grupos com rótulo, ordem e inclusão ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <p style={{ margin: 0, fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", color: "#78716c" }}>
              Grupos · ordem e rótulo
            </p>
            {grupos.map((g, idx) => (
              <div key={g.key} data-testid={`grupo-book-${g.key}`} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 10, backgroundColor: "#fff", border: "1px solid #e7e5e4", opacity: g.incluido ? 1 : 0.55 }}>
                <input
                  type="checkbox"
                  checked={g.incluido}
                  onChange={() => setExcluidos((prev) => { const n = new Set(prev); if (n.has(g.key)) n.delete(g.key); else n.add(g.key); return n; })}
                  aria-label={`Incluir o grupo ${g.key}`}
                  style={{ width: 16, height: 16, accentColor: "#c2410c", flexShrink: 0 }}
                />
                <input
                  value={g.rotulo}
                  onChange={(e) => setRotulos((prev) => ({ ...prev, [g.key]: e.target.value }))}
                  aria-label={`Rótulo do grupo ${g.key}`}
                  data-testid={`rotulo-grupo-${g.key}`}
                  style={{ flex: 1, minWidth: 0, height: 32, borderRadius: 7, border: "1px solid #e7e5e4", padding: "0 8px", fontSize: 13, fontWeight: 600, color: "#1c1917", backgroundColor: "#fafaf9" }}
                />
                <span style={{ fontSize: 11.5, color: "#78716c", whiteSpace: "nowrap" }}>{g.itens.length} arte{g.itens.length !== 1 ? "s" : ""}</span>
                <button type="button" onClick={() => mover(g.key, -1)} disabled={idx === 0} aria-label="Subir grupo" style={{ width: 28, height: 28, borderRadius: 6, border: "1px solid #e7e5e4", background: "#fff", cursor: idx === 0 ? "not-allowed" : "pointer", color: idx === 0 ? "#d6d3d1" : "#44403c", display: "flex", alignItems: "center", justifyContent: "center" }}><ArrowUp style={{ width: 13, height: 13 }} /></button>
                <button type="button" onClick={() => mover(g.key, 1)} disabled={idx === grupos.length - 1} aria-label="Descer grupo" style={{ width: 28, height: 28, borderRadius: 6, border: "1px solid #e7e5e4", background: "#fff", cursor: idx === grupos.length - 1 ? "not-allowed" : "pointer", color: idx === grupos.length - 1 ? "#d6d3d1" : "#44403c", display: "flex", alignItems: "center", justifyContent: "center" }}><ArrowDown style={{ width: 13, height: 13 }} /></button>
              </div>
            ))}
            {grupos.length === 0 && (
              <p style={{ margin: 0, fontSize: 13, color: "#57534e" }}>Nenhuma peça com arte neste evento — o book nasce das artes enviadas pela Arte.</p>
            )}
          </div>

          {/* ── Prévia: as MESMAS células do PDF, em miniatura ── */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignContent: "flex-start" }} data-testid="previa-book">
            {/* capa — herdada (logo de verdade) ou gerada (nome no fundo claro) */}
            <div style={{ width: BOOK.LARGURA * ESC, height: BOOK.ALTURA * ESC, borderRadius: 6, border: heranca?.capa ? "2px solid #c2410c" : "1px solid #e7e5e4", backgroundColor: BOOK.CAPA_FUNDO, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, overflow: "hidden" }}>
              <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 800, fontSize: 15, color: BOOK.CAPA_TEXTO, textAlign: "center", padding: "0 12px" }}>{event?.name ?? ""}</span>
              {heranca?.capa && <span style={{ fontSize: 10, fontWeight: 700, color: "#c2410c" }}>capa herdada do book atual</span>}
            </div>
            {(heranca?.paginas ?? []).filter((n) => n !== 1).map((n) => (
              <div key={`h-${n}`} style={{ width: BOOK.LARGURA * ESC, height: BOOK.ALTURA * ESC, borderRadius: 6, border: "2px solid #c2410c", backgroundColor: "#faf9f8", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4 }} data-testid={`previa-herdada-${n}`}>
                <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 800, fontSize: 14, color: "#1c1917" }}>pág. {n}</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: "#c2410c" }}>copiada do book atual</span>
              </div>
            ))}
            {paginas.map((p, pi) => {
              const celulas = celulasDaPagina(p.itens.length);
              return (
                <div key={pi} style={{ position: "relative", width: BOOK.LARGURA * ESC, height: BOOK.ALTURA * ESC, borderRadius: 6, border: "1px solid #e7e5e4", backgroundColor: "#fff", overflow: "hidden" }}>
                  {p.itens.map((it, i) => {
                    const c = celulas[i];
                    return (
                      <img
                        key={it.id}
                        src={convertGCSUrlToLocalPath(it.approvalThumbUrl)}
                        alt={it.displayId}
                        loading="lazy"
                        style={{
                          position: "absolute",
                          left: c.x * ESC, top: c.y * ESC, width: c.w * ESC, height: c.h * ESC,
                          objectFit: "contain",
                        }}
                      />
                    );
                  })}
                  {/* rodapé da prévia, nas mesmas coordenadas da spec */}
                  <span style={{ position: "absolute", left: BOOK.ASSINATURA_X * ESC, bottom: (BOOK.RODAPE_BASELINE_DO_FUNDO - 4) * ESC, fontSize: 6, color: "#a8a29e", whiteSpace: "nowrap" }}>{event?.name ?? ""}</span>
                  <span style={{ position: "absolute", left: BOOK.BARRA_X * ESC, bottom: (BOOK.RODAPE_BASELINE_DO_FUNDO - 6) * ESC, fontSize: 9, color: "#a8a29e" }}>╱</span>
                  <span style={{ position: "absolute", left: BOOK.RODAPE_ROTULO_X * ESC, bottom: (BOOK.RODAPE_BASELINE_DO_FUNDO - 4) * ESC, fontSize: 7.5, fontWeight: 600, color: "#1c1917", whiteSpace: "nowrap" }}>{p.rotulo}</span>
                  {/* a linha do miolo, sutil, para ver a régua na prévia */}
                  <span aria-hidden="true" style={{ position: "absolute", left: miolo.x * ESC, top: miolo.y * ESC, width: miolo.w * ESC, height: miolo.h * ESC, border: "1px dashed rgba(0,0,0,0.05)", pointerEvents: "none" }} />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
