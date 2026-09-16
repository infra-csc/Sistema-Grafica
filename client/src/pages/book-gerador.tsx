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
import { ArrowLeft, ArrowDown, ArrowUp, BookOpen, Check, Download, Loader2, RefreshCw } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { FS } from "@/lib/theme";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { compareDisplayId } from "@/lib/displayId";
import { groupKeyOf, convertGCSUrlToLocalPath } from "@/lib/artePdfExport";
import { ehBookCompleto } from "@shared/fluxo-peca";
import { BOOK, celulasDaPagina, mioloDoBook, paginarGrupos } from "@/lib/book-spec";
import { gerarBookPdf, subirBookPdf, type HerancaDoBook, type ProgressoDoBook } from "@/lib/book-gerador";
import { ComentarioDoBook, comentarioDoBookValido } from "@/components/comentario-do-book";
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

  const { data: event } = useQuery<any>({ queryKey: ["/api/events", eventId], enabled: !!eventId });
  const { data: itens = [], isLoading, isError, refetch } = useQuery<any[]>({ queryKey: ["/api/items", eventId], enabled: !!eventId });
  const isMobile = useIsMobile();

  // Ajustes do usuário por grupo — a base deriva dos dados; isto guarda só o
  // que a pessoa mudou (rótulo, exclusão, ordem), então peça nova não some.
  const [rotulos, setRotulos] = useState<Record<string, string>>({});
  const [excluidos, setExcluidos] = useState<Set<string>>(new Set());
  const [ordem, setOrdem] = useState<string[]>([]);
  const [progresso, setProgresso] = useState<ProgressoDoBook | null>(null);
  const [publicando, setPublicando] = useState(false);
  const [resultado, setResultado] = useState<{ url: string; falhas: number; aviso?: { status?: string; para?: string[]; reason?: string } | null } | null>(null);

  // ── Herança do book atual (o template de verdade — decisão do dono, 25/08) ──
  const [capaHerdada, setCapaHerdada] = useState(true);
  const [paginasHerdadas, setPaginasHerdadas] = useState<Set<number>>(new Set());
  const bookAtualUrl = useMemo(() => {
    // O book vive por peça (bookUrl); o primeiro não-nulo é o book do evento.
    const comBook = (itens as any[]).find((i) => i.bookUrl && !i.deletedAt);
    return comBook?.bookUrl ?? null;
  }, [itens]);

  // "O que mudou": obrigatório quando já existe book (republicação) — mesma
  // régua do servidor (COMENTARIO_OBRIGATORIO). Ver comentario-do-book.tsx.
  const [comentario, setComentario] = useState("");
  const patrocinadoresDoBook = useMemo(() => {
    const nomes = new Set<string>();
    for (const i of itens as any[]) {
      if (i.deletedAt) continue;
      for (const s of i.sponsors ?? []) if (s?.name) nomes.add(s.name);
    }
    return Array.from(nomes).sort((a, b) => a.localeCompare(b, "pt-BR"));
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
        // A MESMA conta do botão "Gerar e publicar (N pág.)": `paginas + 1`
        // ignorava as páginas herdadas do book atual, e o toast dizia um
        // número diferente do que a tela tinha prometido um segundo antes.
        description: `${nPaginasFinal} ${nPaginasFinal === 1 ? "página" : "páginas"}. Nada foi publicado` + (falhas.length ? ` — ${falhas.length} ${falhas.length === 1 ? "arte falhou e ficou" : "artes falharam e ficaram"} fora.` : "."),
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
    // A recusa vem ANTES de gerar o PDF: republicar sem dizer o que mudou é
    // 400 no servidor — não vale a pena renderizar páginas para ouvir não.
    if (bookAtualUrl && !comentarioDoBookValido(true, comentario)) {
      toast({
        title: "Falta o comentário do que mudou",
        description: "Este evento já tem book publicado. Escreva o que mudou nesta versão — é o que sai no e-mail de quem recebe.",
        variant: "destructive",
      });
      return;
    }
    setPublicando(true);
    setResultado(null);
    try {
      const { bytes, falhas } = await gerarBookPdf(event?.name ?? "Evento", paginas, setProgresso, heranca);
      setProgresso({ etapa: "Enviando o PDF…", feito: totalPecas, total: totalPecas });
      const bookUrl = await subirBookPdf(bytes);
      const itemIds = incluidos.flatMap((g) => g.itens.map((i) => i.id));
      const resposta = await apiRequest("POST", `/api/events/${eventId}/book`, { bookUrl, itemIds, comentario: comentario.trim() || undefined });
      // O DESFECHO DO AVISO (rodada 4). A tela dizia que "o aviso por e-mail
      // continua sendo o botão do admin" — mas o POST /book já dispara o aviso
      // e devolve o resultado (avisarBookPorEmail), o mesmo que o modal da Arte
      // lê. Quem publicava saía achando que ninguém tinha sido avisado. A
      // leitura é tolerante: sem corpo legível, não se afirma nada.
      const corpo = await resposta.json().catch(() => null) as { aviso?: { status?: string; para?: string[]; reason?: string } | null } | null;
      const aviso = corpo?.aviso ?? null;
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items", eventId] });
      setResultado({ url: bookUrl, falhas: falhas.length, aviso });
      const fraseAviso = aviso?.status === "sent"
        ? ` Aviso por e-mail enviado para ${(aviso.para ?? []).join(", ")}.`
        : aviso?.status === "failed"
          ? ` O aviso por e-mail NÃO saiu (${aviso.reason ?? "motivo desconhecido"}) — avise a equipe por outro caminho.`
          : "";
      toast({
        title: aviso?.status === "failed" ? "Book publicado — mas o aviso NÃO saiu" : "Book gerado e publicado",
        description: `${nPaginasFinal} ${nPaginasFinal === 1 ? "página" : "páginas"}, ${totalPecas - falhas.length} ${totalPecas - falhas.length === 1 ? "arte" : "artes"}.` +
          (falhas.length ? ` ${falhas.length} arte${falhas.length !== 1 ? "s" : ""} falharam e ficaram fora.` : "") + fraseAviso,
        variant: falhas.length || aviso?.status === "failed" ? "destructive" : undefined,
      });
    } catch (e: any) {
      toast({ title: "Não foi possível gerar o book", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setPublicando(false);
      setProgresso(null);
    }
  };

  if (isLoading) {
    return (
      <p role="status" style={{ padding: 40, margin: 0, fontSize: 14, color: "#78716c", display: "flex", alignItems: "center", gap: 8 }}>
        <Loader2 className="animate-spin" aria-hidden="true" style={{ width: 16, height: 16 }} /> Carregando as peças…
      </p>
    );
  }

  // Falha de carga ANTES da montagem: sem este ramo a lista vinha vazia e a
  // tela dizia "Nenhuma peça com arte neste evento" — um "não há o que fazer"
  // mentiroso, quando o que houve foi a busca não voltar.
  if (isError) {
    return (
      <div role="alert" style={{ maxWidth: 460, margin: "40px auto", padding: "28px 24px", textAlign: "center", backgroundColor: "#fff", border: "1px solid #e7e5e4", borderRadius: 12 }}>
        <p style={{ margin: "0 0 6px", fontSize: 15, fontWeight: 700, color: "#1c1917" }}>Não foi possível carregar as peças do evento</p>
        <p style={{ margin: "0 0 16px", fontSize: 13, color: "#78716c", lineHeight: 1.5 }}>Nada foi gerado nem publicado. Verifique a conexão e tente de novo.</p>
        <button type="button" onClick={() => { void refetch(); }} data-testid="button-recarregar-book"
          style={{ display: "inline-flex", alignItems: "center", gap: 7, height: 38, padding: "0 16px", borderRadius: 9, border: "none", backgroundColor: "#1c1917", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          <RefreshCw aria-hidden="true" style={{ width: 14, height: 14 }} /> Tentar novamente
        </button>
      </div>
    );
  }

  // Escala da prévia: cada página vira um cartão de ~340 px de largura.
  const ESC = 340 / BOOK.LARGURA;
  const miolo = mioloDoBook();

  return (
    <div style={{ backgroundColor: "#fafaf9", minHeight: "100%", padding: "18px 18px 64px" }}>
      <div style={{ maxWidth: 1060, margin: "0 auto" }}>

        {/* ── Barra ──
            O TÍTULO NO PADRÃO DA CASA (Space Grotesk 26/700, sem ícone
            colorido), como as outras telas desde a 2ª rodada. Era 20/800 com
            um livro laranja e o nome do evento colado depois de um travessão —
            num evento de nome longo, o título quebrava no meio do nome. O
            evento e o tamanho do book descem para a linha de apoio, que é onde
            se confere "é o evento certo, com quantas páginas?". */}
        <Link href={`/eventos/${eventId}`} data-testid="link-voltar-evento" style={{ display: "inline-flex", alignItems: "center", gap: 6, minHeight: isMobile ? 44 : 32, padding: "0 10px 0 6px", marginBottom: 8, borderRadius: 8, color: "#57534e", fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
          <ArrowLeft aria-hidden="true" style={{ width: 14, height: 14 }} /> Voltar ao evento
        </Link>
        <div style={{ display: "flex", alignItems: isMobile ? "stretch" : "flex-end", flexDirection: isMobile ? "column" : "row", gap: isMobile ? 12 : 16, marginBottom: 16 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ margin: 0, fontFamily: "'Space Grotesk', sans-serif", fontSize: FS.h1, fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1.1, color: "#1c1917" }}>
              Gerar book
            </h1>
            <p data-testid="book-resumo" style={{ margin: "4px 0 0", fontSize: 13, color: "#746e69", lineHeight: 1.5 }}>
              {event?.name ?? "Evento"}
              {totalPecas > 0 && ` · ${totalPecas} ${totalPecas === 1 ? "arte" : "artes"} em ${nPaginasFinal} ${nPaginasFinal === 1 ? "página" : "páginas"}`}
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={baixarPdf}
            disabled={baixando || publicando || totalPecas === 0}
            data-testid="button-baixar-book"
            title={totalPecas === 0 ? "Nenhum grupo com arte incluído — marque ao menos um grupo" : "Gera o PDF e salva na sua máquina — nada é publicado"}
            style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, height: isMobile ? 44 : 40, padding: "0 16px",
              borderRadius: 9, border: "1px solid #d6d3d1",
              backgroundColor: "#ffffff", color: baixando || totalPecas === 0 ? "#78716c" : "#1c1917",
              opacity: totalPecas === 0 ? 0.7 : 1,
              flex: isMobile ? "1 1 auto" : undefined,
              fontSize: 13, fontWeight: 700, cursor: baixando || publicando || totalPecas === 0 ? "not-allowed" : "pointer",
            }}
          >
            {baixando ? <Loader2 aria-hidden="true" className="animate-spin" style={{ width: 14, height: 14 }} /> : <Download aria-hidden="true" style={{ width: 14, height: 14 }} />}
            {baixando ? "Gerando…" : "Baixar PDF"}
          </button>
          <button
            type="button"
            onClick={gerarEPublicar}
            disabled={!podePublicar || publicando || totalPecas === 0}
            data-testid="button-gerar-book"
            title={!podePublicar ? "Publicar book é da Arte e do admin — os demais podem montar e conferir a prévia." : totalPecas === 0 ? "Nenhum grupo com arte incluído — marque ao menos um grupo" : bookAtualUrl ? "Gera o PDF, SUBSTITUI o book atual do evento e avisa a equipe por e-mail" : "Gera o PDF, publica o book no evento e avisa a equipe por e-mail"}
            style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, height: isMobile ? 44 : 40, padding: "0 18px",
              borderRadius: 9, border: "none",
              backgroundColor: !podePublicar || publicando || totalPecas === 0 ? "#e7e5e4" : "#1c1917",
              color: !podePublicar || publicando || totalPecas === 0 ? "#57534e" : "#fff",
              flex: isMobile ? "1 1 auto" : undefined,
              fontSize: 14, fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif",
              cursor: !podePublicar || publicando || totalPecas === 0 ? "not-allowed" : "pointer",
            }}
          >
            {/* O progresso saiu do rótulo: "Desenhando páginas… (12/40)" fazia
                o botão mudar de largura a cada arte e empurrar o vizinho. Ele
                vive agora na barra logo abaixo, com a proporção desenhada. */}
            {publicando ? <Loader2 aria-hidden="true" className="animate-spin" style={{ width: 15, height: 15 }} /> : <Check aria-hidden="true" style={{ width: 15, height: 15 }} />}
            {publicando ? "Publicando…" : `Gerar e publicar (${nPaginasFinal} pág.)`}
          </button>
          </div>
        </div>

        {/* POR QUE NÃO DÁ PARA PUBLICAR, escrito (rodada 4). O botão cinza
            explicava só no `title` — no celular, em lugar nenhum. E republicar
            sem o "o que mudou" parecia liberado e respondia com um toast de
            erro depois do clique. */}
        {!podePublicar ? (
          <p data-testid="book-modo-consulta" style={{ margin: "0 0 14px", padding: "10px 14px", borderRadius: 8, backgroundColor: "#f5f5f4", border: "1px solid #e7e5e4", color: "#44403c", fontSize: 13, lineHeight: 1.5 }}>
            <b style={{ fontWeight: 700 }}>Modo consulta.</b> Publicar o book é da Arte e do admin — você pode montar a prévia e baixar o PDF para conferir.
          </p>
        ) : bookAtualUrl && !comentarioDoBookValido(true, comentario) && totalPecas > 0 ? (
          <p data-testid="book-falta-comentario" style={{ margin: "0 0 14px", fontSize: 13, color: "#57534e", lineHeight: 1.5 }}>
            Este evento já tem book: para publicar, escreva abaixo o que mudou nesta versão — é o que sai no e-mail.
          </p>
        ) : null}

        {/* PROGRESSO À VISTA. A geração leva minutos (cada arte é baixada e
            desenhada) e o único sinal era um "12/40" dentro do botão — que
            muda de tamanho e some de vista ao rolar a prévia. A barra fica no
            topo, com a etapa por extenso e a proporção. `role="progressbar"`
            dá o número ao leitor de tela sem depender do anúncio abaixo. */}
        {progresso && (
          <div data-testid="book-progresso" style={{ marginBottom: 14, padding: "10px 14px", borderRadius: 10, backgroundColor: "#fff", border: "1px solid #e7e5e4" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 6, fontSize: 13 }}>
              <span style={{ fontWeight: 600, color: "#1c1917" }}>{progresso.etapa}</span>
              <span style={{ color: "#57534e", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{progresso.feito} de {progresso.total}</span>
            </div>
            <div
              role="progressbar"
              aria-label={baixando ? "Gerando o PDF" : "Gerando e publicando o book"}
              aria-valuemin={0}
              aria-valuemax={progresso.total}
              aria-valuenow={progresso.feito}
              style={{ height: 6, borderRadius: 999, backgroundColor: "#f0efee", overflow: "hidden" }}
            >
              <div style={{ height: "100%", width: `${progresso.total > 0 ? Math.round((progresso.feito / progresso.total) * 100) : 0}%`, backgroundColor: "#1c1917", borderRadius: 999, transition: "width 0.2s" }} />
            </div>
          </div>
        )}

        {/* Progresso anunciado: o rótulo do botão muda a cada arte, mas um
            botão desabilitado não é relido pelo leitor de tela — a geração
            leva minutos e parecia travada para quem não vê a tela. */}
        <span role="status" aria-live="polite" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" }}>
          {progresso ? `${progresso.etapa} ${progresso.feito} de ${progresso.total}` : ""}
        </span>

        {resultado && (
          <p role="status" data-testid="book-publicado" style={{ margin: "0 0 14px", padding: "10px 14px", borderRadius: 8, backgroundColor: "#f0fdf4", border: "1px solid #bbf7d0", color: "#15803d", fontSize: 13.5, fontWeight: 600 }}>
            Book publicado.{" "}
            <a href={resultado.url} target="_blank" rel="noopener noreferrer" style={{ color: "#15803d" }}>Abrir o PDF</a>
            {/* O que aconteceu com o aviso, com as palavras do servidor — e
                em vermelho escuro quando falhou, porque aí alguém precisa
                avisar na mão. */}
            {resultado.aviso?.status === "sent" && <>{" · "}aviso por e-mail enviado para {(resultado.aviso.para ?? []).join(", ")}.</>}
            {resultado.aviso?.status === "failed" && <span style={{ color: "#991b1b" }}>{" · "}o aviso por e-mail NÃO saiu ({resultado.aviso.reason ?? "motivo desconhecido"}) — avise a equipe por outro caminho.</span>}
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

        {podePublicar && (
          <div style={{ marginBottom: 16, padding: "12px 14px", borderRadius: 10, backgroundColor: "#fff", border: "1px solid #e7e5e4" }}>
            <ComentarioDoBook
              republicacao={!!bookAtualUrl}
              valor={comentario}
              aoMudar={setComentario}
              patrocinadores={patrocinadoresDoBook}
            />
          </div>
        )}

        {/* Uma coluna no celular: `minmax(280px, 380px) 1fr` num viewport de
            375px empurrava a prévia para fora da tela, com rolagem lateral. */}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : "minmax(280px, 380px) 1fr", gap: 16, alignItems: "start" }}>

          {/* ── Montagem: grupos com rótulo, ordem e inclusão ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <p style={{ margin: 0, fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", color: "#78716c" }}>
              Grupos · ordem e rótulo
            </p>
            {grupos.map((g, idx) => (
              // Excluído, o grupo perde a COR de fundo, não a legibilidade: a
              // opacidade de 55% derrubava o rótulo e a contagem abaixo de AA —
              // e é lendo o rótulo que se decide incluí-lo de volta.
              <div key={g.key} data-testid={`grupo-book-${g.key}`} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px 6px 4px", borderRadius: 10, backgroundColor: g.incluido ? "#fff" : "#f5f5f4", border: `1px ${g.incluido ? "solid" : "dashed"} ${g.incluido ? "#e7e5e4" : "#d6d3d1"}` }}>
                {/* A caixinha de 16px ganha uma área de toque de 36px (44 no
                    celular) — era o menor alvo da tela e o que mais se usa. */}
                <label style={{ display: "flex", alignItems: "center", justifyContent: "center", width: isMobile ? 44 : 36, height: isMobile ? 44 : 36, flexShrink: 0, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={g.incluido}
                    onChange={() => setExcluidos((prev) => { const n = new Set(prev); if (n.has(g.key)) n.delete(g.key); else n.add(g.key); return n; })}
                    aria-label={`Incluir o grupo ${g.key}`}
                    style={{ width: 16, height: 16, accentColor: "#c2410c", flexShrink: 0, cursor: "pointer" }}
                  />
                </label>
                <input
                  value={g.rotulo}
                  onChange={(e) => setRotulos((prev) => ({ ...prev, [g.key]: e.target.value }))}
                  aria-label={`Rótulo do grupo ${g.key}`}
                  data-testid={`rotulo-grupo-${g.key}`}
                  style={{ flex: 1, minWidth: 0, height: isMobile ? 40 : 32, borderRadius: 7, border: "1px solid #e7e5e4", padding: "0 8px", fontSize: 13, fontWeight: 600, color: g.incluido ? "#1c1917" : "#57534e", backgroundColor: g.incluido ? "#fafaf9" : "#ffffff", textDecoration: g.incluido ? "none" : "line-through" }}
                />
                <span style={{ fontSize: 11.5, color: "#746e69", whiteSpace: "nowrap" }}>{g.incluido ? `${g.itens.length} arte${g.itens.length !== 1 ? "s" : ""}` : "fora"}</span>
                <button type="button" onClick={() => mover(g.key, -1)} disabled={idx === 0} aria-label={`Subir o grupo ${g.rotulo.trim() || g.key}`} style={{ width: isMobile ? 40 : 28, height: isMobile ? 40 : 28, borderRadius: 6, border: "1px solid #e7e5e4", background: "#fff", cursor: idx === 0 ? "not-allowed" : "pointer", color: idx === 0 ? "#d6d3d1" : "#44403c", display: "flex", alignItems: "center", justifyContent: "center" }}><ArrowUp style={{ width: 13, height: 13 }} /></button>
                <button type="button" onClick={() => mover(g.key, 1)} disabled={idx === grupos.length - 1} aria-label={`Descer o grupo ${g.rotulo.trim() || g.key}`} style={{ width: isMobile ? 40 : 28, height: isMobile ? 40 : 28, borderRadius: 6, border: "1px solid #e7e5e4", background: "#fff", cursor: idx === grupos.length - 1 ? "not-allowed" : "pointer", color: idx === grupos.length - 1 ? "#d6d3d1" : "#44403c", display: "flex", alignItems: "center", justifyContent: "center" }}><ArrowDown style={{ width: 13, height: 13 }} /></button>
              </div>
            ))}
            {/* Vazio com a régua da casa (ícone, título, frase) e a saída: era
                uma frase solta onde a lista de grupos deveria estar, fácil de
                confundir com legenda. */}
            {grupos.length === 0 && (
              <div data-testid="book-vazio" style={{ padding: "28px 20px", textAlign: "center", borderRadius: 12, backgroundColor: "#fff", border: "1px solid #e7e5e4" }}>
                <BookOpen aria-hidden="true" style={{ width: 28, height: 28, color: "#746e69", margin: "0 auto 10px" }} />
                <p style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 700, color: "#1c1917" }}>Nenhuma peça com arte neste evento</p>
                <p style={{ margin: "0 0 14px", fontSize: 13, color: "#57534e", lineHeight: 1.5 }}>O book nasce das artes enviadas pela Arte. Quando os thumbs subirem, os grupos aparecem aqui.</p>
                <Link href={`/eventos/${eventId}`} style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 40, padding: "0 16px", borderRadius: 9, border: "1px solid #e7e5e4", color: "#1c1917", fontSize: 13, fontWeight: 700, textDecoration: "none", backgroundColor: "#fff" }}>
                  <ArrowLeft aria-hidden="true" style={{ width: 14, height: 14 }} /> Voltar ao evento
                </Link>
              </div>
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
                  {/* Assinatura da prévia em #78716c (a regra da casa proíbe
                      #a8a29e como texto); a barra é traço, pode ficar clara. */}
                  <span style={{ position: "absolute", left: BOOK.ASSINATURA_X * ESC, bottom: (BOOK.RODAPE_BASELINE_DO_FUNDO - 4) * ESC, fontSize: 6, color: "#78716c", whiteSpace: "nowrap" }}>{event?.name ?? ""}</span>
                  <span aria-hidden="true" style={{ position: "absolute", left: BOOK.BARRA_X * ESC, bottom: (BOOK.RODAPE_BASELINE_DO_FUNDO - 6) * ESC, fontSize: 9, color: "#a8a29e" }}>╱</span>
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
