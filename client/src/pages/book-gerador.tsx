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
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { ArrowLeft, ArrowDown, ArrowUp, BookOpen, CheckCircle2, Copy, Download, ExternalLink, Eye, ImageOff, Loader2, MessageSquareText, Send } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { FONT, FS, FW, N, R, SHADOW, T, TOM, TOM_FORTE } from "@/lib/theme";
import { Botao, BotaoLink } from "@/components/ui/botao";
import { CabecalhoDaPagina } from "@/components/ui/cabecalho-da-pagina";
import { EstadoErro, EstadoVazio, Esqueleto } from "@/components/ui/estados";
import { useConfirmar } from "@/components/ui/usar-confirmar";
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
  const { data: itens = [], isLoading, isError, refetch, isFetching } = useQuery<any[]>({ queryKey: ["/api/items", eventId], enabled: !!eventId });
  const isMobile = useIsMobile();
  const { confirmar, dialogo } = useConfirmar();
  // A LARGURA ÚTIL da tela (sem o menu lateral) decide o layout: duas colunas
  // (montagem | prévia) só quando cabem de verdade. Pela largura da janela, o
  // tablet com o menu aberto caía nas duas colunas e a prévia vazava de lado.
  const [conteudo, setConteudo] = useState<HTMLDivElement | null>(null);
  const [larguraUtil, setLarguraUtil] = useState(0);
  useEffect(() => {
    if (!conteudo) return;
    const medir = () => setLarguraUtil(conteudo.clientWidth);
    medir();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(medir);
    ro.observe(conteudo);
    return () => ro.disconnect();
  }, [conteudo]);

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
  // O BOOK ATUAL QUE NÃO ABRE não tem o que herdar. O aviso da herança diz
  // "o gerado sai sem herança" — e era mentira: a herança seguia ligada, o
  // motor tentava abrir o mesmo PDF e a geração inteira caía num erro. Agora a
  // tela cumpre o que o aviso promete (capa gerada + grades), e a prévia mostra
  // o que vai sair de fato.
  const [herancaFalhou, setHerancaFalhou] = useState(false);
  const [miniaturasHerdadas, setMiniaturasHerdadas] = useState<Record<number, string>>({});
  const heranca: HerancaDoBook | null = bookAtualUrl && !herancaFalhou
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
        // Arte que falhou é AVISO (o PDF saiu, faltando algo), não falha geral.
        variant: falhas.length ? "warning" : undefined,
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
        // Nada aconteceu e nada quebrou: aviso, não erro (régua dos toasts).
        variant: "warning",
      });
      return;
    }
    // PUBLICAR NÃO SE DESFAZ: o PDF entra no evento (substituindo o atual, se
    // houver) e a equipe recebe o e-mail na hora. Uma pergunta antes — com a
    // mesma conta de páginas do botão, para não haver surpresa.
    const ok = await confirmar({
      titulo: bookAtualUrl ? "Substituir o book publicado?" : "Publicar o book?",
      descricao: bookAtualUrl
        ? `O book novo (${nPaginasFinal} ${nPaginasFinal === 1 ? "página" : "páginas"}) SUBSTITUI o atual do evento, e a equipe recebe o aviso por e-mail com o que mudou.`
        : `O book (${nPaginasFinal} ${nPaginasFinal === 1 ? "página" : "páginas"}, ${totalPecas} ${totalPecas === 1 ? "arte" : "artes"}) é publicado no evento, e a equipe recebe o aviso por e-mail.`,
      confirmar: bookAtualUrl ? "Substituir e avisar" : "Publicar e avisar",
      cancelar: "Revisar mais",
      icone: Send,
    });
    if (!ok) return;
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
        variant: aviso?.status === "failed" ? "destructive" : falhas.length ? "warning" : undefined,
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
      <div className="book-pagina" style={{ backgroundColor: T.bg, minHeight: "100%", padding: isMobile ? "16px 12px" : "24px" }}>
        <div style={{ maxWidth: 1320, margin: "0 auto" }}>
          <Esqueleto variante="cartoes" linhas={isMobile ? 3 : 6} rotulo="Carregando as peças do book" />
        </div>
      </div>
    );
  }

  // Falha de carga ANTES da montagem: sem este ramo a lista vinha vazia e a
  // tela dizia "Nenhuma peça com arte neste evento" — um "não há o que fazer"
  // mentiroso, quando o que houve foi a busca não voltar.
  if (isError) {
    return (
      <div className="book-pagina" style={{ backgroundColor: T.bg, minHeight: "100%", padding: isMobile ? "24px 12px" : "48px 24px" }}>
        <div style={{ maxWidth: 520, margin: "0 auto", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          <div style={{ width: "100%" }}>
            <EstadoErro titulo="Não foi possível carregar as peças do evento" testId="book-erro"
              detalhe="Nada foi gerado nem publicado. Verifique a conexão e tente de novo."
              aoTentarDeNovo={() => { void refetch(); }} carregando={isFetching} rotuloDoBotao="Tentar novamente"
              tamanhoDoBotao={isMobile ? "toque" : "md"} testIdDoBotao="button-recarregar-book" />
          </div>
          <BotaoLink href={`/eventos/${eventId}`} variante="fantasma" tamanho={isMobile ? "toque" : "md"} icone={ArrowLeft}>Voltar ao evento</BotaoLink>
        </div>
      </div>
    );
  }

  // Escala da prévia: a página do book (A4 deitada) vira um cartão que divide
  // a coluna da prévia em quantas couberem com ~270 px (teto de 340) — duas no
  // notebook, três no monitor largo, uma no celular.
  const duasColunas = !isMobile && (larguraUtil === 0 || larguraUtil >= 940);
  const larguraDaPrevia = larguraUtil === 0 ? 640 : duasColunas ? larguraUtil - 400 - 24 : larguraUtil;
  const colunasDaPrevia = Math.max(1, Math.floor((larguraDaPrevia + 16) / (270 + 16)));
  const LARG_PREVIA = Math.max(240, Math.min(340, Math.floor((larguraDaPrevia - 16 * (colunasDaPrevia - 1)) / colunasDaPrevia)));
  const ESC = LARG_PREVIA / BOOK.LARGURA;
  const miolo = mioloDoBook();
  const herdadas = (heranca?.paginas ?? []).filter((n) => n !== 1);
  const tamanhoDoControle = isMobile ? "toque" : "md";

  /** A moldura de uma página da prévia + a legenda embaixo ("pág. 3 · Pórtico · 4 artes"). */
  const paginaDaPrevia = (chave: string, legenda: React.ReactNode, conteudo: React.ReactNode, opcoes: { destaque?: boolean; testid?: string } = {}) => (
    <figure key={chave} className="book-folha" data-testid={opcoes.testid} style={{ margin: 0, width: LARG_PREVIA, display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ position: "relative", width: LARG_PREVIA, height: BOOK.ALTURA * ESC, borderRadius: R.sm, overflow: "hidden", backgroundColor: T.surface,
        border: opcoes.destaque ? `2px solid ${T.accentText}` : `1px solid ${T.border}`, boxShadow: SHADOW.sm, boxSizing: "border-box" }}>
        {conteudo}
      </div>
      <figcaption style={{ display: "flex", alignItems: "baseline", gap: 6, minWidth: 0, fontSize: FS.meta, color: T.second, lineHeight: 1.35 }}>
        {legenda}
      </figcaption>
    </figure>
  );

  return (
    <div className="book-pagina" style={{ backgroundColor: T.bg, minHeight: "100%", padding: isMobile ? "12px 12px 48px" : "18px 24px 64px" }}>
      {dialogo}
      <div ref={setConteudo} style={{ maxWidth: 1320, margin: "0 auto" }}>

        {/* ── Cabeçalho ──
            O TÍTULO NO PADRÃO DA CASA (CabecalhoDaPagina). O evento e o tamanho
            do book ficam na linha de apoio, que é onde se confere "é o evento
            certo, com quantas páginas?"; as duas ações moram à direita, a
            principal por último. */}
        <BotaoLink href={`/eventos/${eventId}`} data-testid="link-voltar-evento" variante="fantasma" tamanho={isMobile ? "toque" : "sm"} icone={ArrowLeft}
          style={{ marginLeft: isMobile ? -8 : -10, marginBottom: 6 }}>
          Voltar ao evento
        </BotaoLink>
        <CabecalhoDaPagina titulo="Gerar book" icone={BookOpen} corDoIcone={T.accentText} margemInferior={16}
          subtitulo={
            <span data-testid="book-resumo">
              <strong style={{ fontWeight: FW.medio, color: T.strong }}>{event?.name ?? "Evento"}</strong>
              {totalPecas > 0 && ` · ${totalPecas} ${totalPecas === 1 ? "arte" : "artes"} em ${nPaginasFinal} ${nPaginasFinal === 1 ? "página" : "páginas"}`}
              {bookAtualUrl ? " · já tem book publicado" : ""}
            </span>
          }
          acoes={
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", width: isMobile ? "100%" : undefined }}>
              <Botao
                onClick={baixarPdf}
                disabled={baixando || publicando || totalPecas === 0}
                carregando={baixando}
                data-testid="button-baixar-book"
                icone={Download}
                tamanho={isMobile ? "toque" : "md"}
                variante="secundarioForte"
                title={totalPecas === 0 ? "Nenhum grupo com arte incluído — marque ao menos um grupo" : "Gera o PDF e salva na sua máquina — nada é publicado"}
                style={{ flex: isMobile ? "1 1 0%" : undefined, minHeight: isMobile ? 44 : 40 }}
              >
                {baixando ? "Gerando…" : "Baixar PDF"}
              </Botao>
              {/* O progresso NÃO mora no rótulo: "Desenhando páginas… (12/40)"
                  fazia o botão mudar de largura a cada arte. Ele vive na barra
                  logo abaixo, com a proporção desenhada. */}
              <Botao
                variante="primario"
                onClick={gerarEPublicar}
                disabled={!podePublicar || publicando || totalPecas === 0}
                carregando={publicando}
                data-testid="button-gerar-book"
                icone={Send}
                tamanho={isMobile ? "toque" : "md"}
                title={!podePublicar ? "Publicar book é da Arte e do admin — os demais podem montar e conferir a prévia." : totalPecas === 0 ? "Nenhum grupo com arte incluído — marque ao menos um grupo" : bookAtualUrl ? "Gera o PDF, SUBSTITUI o book atual do evento e avisa a equipe por e-mail" : "Gera o PDF, publica o book no evento e avisa a equipe por e-mail"}
                style={{ flex: isMobile ? "1 1 0%" : undefined, minHeight: isMobile ? 44 : 40, padding: "0 18px", fontSize: FS.read }}
              >
                {publicando ? "Publicando…" : `Gerar e publicar (${nPaginasFinal} pág.)`}
              </Botao>
            </div>
          } />

        {/* ── Avisos, do mais urgente ao informativo ── */}
        <div className="book-avisos" style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
          {/* PROGRESSO À VISTA. A geração leva minutos (cada arte é baixada e
              desenhada). `role="progressbar"` dá o número ao leitor de tela. */}
          {progresso && (
            <div data-testid="book-progresso" className="book-entra" style={{ padding: "12px 16px", borderRadius: R.lg, backgroundColor: T.surface, border: `1px solid ${T.border}`, boxShadow: SHADOW.sm }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, marginBottom: 8, fontSize: FS.body }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontWeight: FW.medio, color: T.text, minWidth: 0 }}>
                  <Loader2 aria-hidden="true" className="animate-spin" style={{ width: 14, height: 14, color: T.accentText, flexShrink: 0 }} />
                  {progresso.etapa}
                </span>
                <span style={{ color: T.apoio, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", fontSize: FS.meta, fontWeight: FW.medio }}>{progresso.feito} de {progresso.total}</span>
              </div>
              <div
                role="progressbar"
                aria-label={baixando ? "Gerando o PDF" : "Gerando e publicando o book"}
                aria-valuemin={0}
                aria-valuemax={progresso.total}
                aria-valuenow={progresso.feito}
                style={{ height: 6, borderRadius: R.pill, backgroundColor: N.n3, overflow: "hidden" }}
              >
                <div className="book-barra" style={{ height: "100%", width: `${progresso.total > 0 ? Math.round((progresso.feito / progresso.total) * 100) : 0}%`, backgroundColor: T.accentText, borderRadius: R.pill }} />
              </div>
              <p style={{ margin: "8px 0 0", fontSize: FS.meta, color: T.second }}>
                {baixando ? "Nada é publicado — o PDF vai para a sua máquina." : "Não feche esta aba: o book só é publicado no fim."}
              </p>
            </div>
          )}

          {/* Progresso anunciado: um botão desabilitado não é relido pelo
              leitor de tela — a geração parecia travada para quem não vê. */}
          <span role="status" aria-live="polite" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" }}>
            {progresso ? `${progresso.etapa} ${progresso.feito} de ${progresso.total}` : ""}
          </span>

          {resultado && (
            <div role="status" data-testid="book-publicado" className="book-entra" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "12px 16px", borderRadius: R.lg, backgroundColor: TOM.sucesso.bg, border: `1px solid ${TOM.sucesso.border}` }}>
              <CheckCircle2 aria-hidden="true" style={{ width: 18, height: 18, color: TOM.sucesso.text, flexShrink: 0 }} />
              <p style={{ margin: 0, flex: "1 1 260px", minWidth: 0, fontSize: FS.body, lineHeight: 1.5, color: TOM_FORTE.sucesso.text }}>
                <b style={{ fontWeight: FW.forte }}>Book publicado.</b>
                {/* O que aconteceu com o aviso, com as palavras do servidor — e
                    em vermelho escuro quando falhou: aí alguém avisa na mão. */}
                {resultado.aviso?.status === "sent" && <>{" "}Aviso por e-mail enviado para {(resultado.aviso.para ?? []).join(", ")}.</>}
                {resultado.aviso?.status === "failed" && <span style={{ color: TOM_FORTE.perigo.text, fontWeight: FW.medio }}>{" "}O aviso por e-mail NÃO saiu ({resultado.aviso.reason ?? "motivo desconhecido"}) — avise a equipe por outro caminho.</span>}
                {resultado.falhas > 0 && <>{" "}{resultado.falhas} {resultado.falhas === 1 ? "arte falhou e ficou" : "artes falharam e ficaram"} fora.</>}
              </p>
              <BotaoLink href={resultado.url} externo target="_blank" rel="noopener noreferrer" tamanho={isMobile ? "toque" : "sm"} icone={ExternalLink} tom="sucesso" data-testid="book-abrir-pdf">
                Abrir o PDF
              </BotaoLink>
            </div>
          )}

          {/* POR QUE NÃO DÁ PARA PUBLICAR, escrito — o botão cinza explicava só
              no `title`, e no celular em lugar nenhum. */}
          {!podePublicar ? (
            <p data-testid="book-modo-consulta" style={{ display: "flex", alignItems: "flex-start", gap: 10, margin: 0, padding: "10px 14px", borderRadius: R.lg, backgroundColor: T.surface, border: `1px solid ${T.border}`, color: T.strong, fontSize: FS.body, lineHeight: 1.5 }}>
              <Eye aria-hidden="true" style={{ width: 16, height: 16, marginTop: 2, color: T.apoio, flexShrink: 0 }} />
              <span><b style={{ fontWeight: FW.forte }}>Modo consulta.</b> Publicar o book é da Arte e do admin — você pode montar a prévia e baixar o PDF para conferir.</span>
            </p>
          ) : bookAtualUrl && !comentarioDoBookValido(true, comentario) && totalPecas > 0 ? (
            <p data-testid="book-falta-comentario" style={{ display: "flex", alignItems: "flex-start", gap: 10, margin: 0, padding: "10px 14px", borderRadius: R.lg, backgroundColor: TOM.laranja.bg, border: `1px solid ${TOM.laranja.border}`, color: TOM_FORTE.laranja.text, fontSize: FS.body, lineHeight: 1.5 }}>
              <MessageSquareText aria-hidden="true" style={{ width: 16, height: 16, marginTop: 2, flexShrink: 0 }} />
              <span>Este evento já tem book: para publicar, escreva em <b style={{ fontWeight: FW.forte }}>“O que mudou nesta versão”</b> o que mudou — é o que sai no e-mail.</span>
            </p>
          ) : null}

          {semArte.length > 0 && (
            <p data-testid="book-sem-arte" style={{ display: "flex", alignItems: "flex-start", gap: 10, margin: 0, padding: "10px 14px", borderRadius: R.lg, backgroundColor: TOM.alerta.bg, border: `1px solid ${TOM.alerta.border}`, color: TOM_FORTE.alerta.text, fontSize: FS.body, lineHeight: 1.5 }}>
              <ImageOff aria-hidden="true" style={{ width: 16, height: 16, marginTop: 2, flexShrink: 0 }} />
              <span>
                <b style={{ fontWeight: FW.forte }}>{semArte.length} peça{semArte.length !== 1 ? "s" : ""} sem arte fica{semArte.length !== 1 ? "m" : ""} fora do book:</b>{" "}
                <span style={{ fontFamily: FONT.mono, fontSize: FS.meta }}>{semArte.slice(0, 8).map((i: any) => i.displayId).join(", ")}{semArte.length > 8 ? ` +${semArte.length - 8}` : ""}</span>.
                {" "}O exemplar manual nunca mostra moldura vazia.
              </span>
            </p>
          )}
        </div>

        {/* Duas colunas só quando cabem (ver duasColunas): no celular e no tablet
            com o menu aberto, montagem em cima e prévia embaixo. */}
        <div style={{ display: "grid", gridTemplateColumns: duasColunas ? "400px minmax(0, 1fr)" : "minmax(0, 1fr)", gap: isMobile ? 16 : 24, alignItems: "start" }}>

          {/* ── Montagem: grupos, herança e o "o que mudou" ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
            <section className="book-secao" aria-labelledby="book-titulo-grupos" style={{ padding: "14px 14px 12px", borderRadius: R.lg, backgroundColor: T.surface, border: `1px solid ${T.border}` }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
                <h2 id="book-titulo-grupos" style={{ margin: 0, fontFamily: FONT.display, fontSize: FS.strong, fontWeight: FW.forte, color: T.text }}>Grupos</h2>
                {grupos.length > 0 && <span style={{ fontSize: FS.meta, color: T.second, fontVariantNumeric: "tabular-nums" }}>{incluidos.length} de {grupos.length} no book</span>}
              </div>
              <p style={{ margin: "0 0 10px", fontSize: FS.meta, lineHeight: 1.45, color: T.apoio }}>
                Cada grupo vira uma página, na ordem abaixo. O rótulo sai no rodapé da página.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {grupos.map((g, idx) => (
                  // Excluído, o grupo perde a COR de fundo, não a legibilidade: é
                  // lendo o rótulo que se decide incluí-lo de volta.
                  <div key={g.key} data-testid={`grupo-book-${g.key}`} className="book-grupo" data-incluido={g.incluido ? "sim" : "nao"}
                    style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 6px 4px 2px", borderRadius: R.md, backgroundColor: g.incluido ? T.surface : N.n2, border: `1px ${g.incluido ? "solid" : "dashed"} ${g.incluido ? T.border : T.bdark}` }}>
                    {/* A caixinha ganha uma área de toque de 36px (44 no celular). */}
                    <label style={{ display: "flex", alignItems: "center", justifyContent: "center", width: isMobile ? 44 : 36, height: isMobile ? 44 : 36, flexShrink: 0, cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={g.incluido}
                        onChange={() => setExcluidos((prev) => { const n = new Set(prev); if (n.has(g.key)) n.delete(g.key); else n.add(g.key); return n; })}
                        aria-label={`Incluir o grupo ${g.key}`}
                        style={{ width: 16, height: 16, accentColor: T.accentText, flexShrink: 0, cursor: "pointer" }}
                      />
                    </label>
                    <input
                      value={g.rotulo}
                      onChange={(e) => setRotulos((prev) => ({ ...prev, [g.key]: e.target.value }))}
                      aria-label={`Rótulo do grupo ${g.key}`}
                      data-testid={`rotulo-grupo-${g.key}`}
                      className="book-campo"
                      style={{ flex: 1, minWidth: 0, height: isMobile ? 44 : 32, borderRadius: R.sm, border: `1px solid ${g.incluido ? T.border : "transparent"}`, padding: "0 8px", fontSize: isMobile ? FS.lead : FS.body, fontWeight: FW.medio, fontFamily: "inherit", color: g.incluido ? T.text : T.apoio, backgroundColor: g.incluido ? T.bg : "transparent", textDecoration: g.incluido ? "none" : "line-through", boxSizing: "border-box" }}
                    />
                    <span style={{ fontSize: FS.small, fontWeight: FW.medio, color: g.incluido ? T.second : T.apoio, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums", minWidth: 44, textAlign: "right" }}>
                      {g.incluido ? `${g.itens.length} arte${g.itens.length !== 1 ? "s" : ""}` : "fora"}
                    </span>
                    <Botao variante="fantasma" tamanho={isMobile ? "toque" : "sm"} icone={ArrowUp} onClick={() => mover(g.key, -1)} disabled={idx === 0}
                      aria-label={`Subir o grupo ${g.rotulo.trim() || g.key}`} title="Subir" style={{ width: isMobile ? 44 : 30, padding: 0 }} />
                    <Botao variante="fantasma" tamanho={isMobile ? "toque" : "sm"} icone={ArrowDown} onClick={() => mover(g.key, 1)} disabled={idx === grupos.length - 1}
                      aria-label={`Descer o grupo ${g.rotulo.trim() || g.key}`} title="Descer" style={{ width: isMobile ? 44 : 30, padding: 0 }} />
                  </div>
                ))}
              </div>
              {grupos.length === 0 && (
                <EstadoVazio compacto icone={BookOpen} testId="book-vazio" titulo="Nenhuma peça com arte neste evento"
                  descricao="O book nasce das artes enviadas pela Arte. Quando os thumbs subirem, os grupos aparecem aqui."
                  acao={<BotaoLink href={`/eventos/${eventId}`} icone={ArrowLeft} tamanho={tamanhoDoControle}>Voltar ao evento</BotaoLink>} />
              )}
              {grupos.length > 0 && incluidos.length === 0 && (
                <p data-testid="book-nenhum-grupo" role="status" style={{ margin: "10px 0 0", fontSize: FS.meta, color: TOM.alerta.text, fontWeight: FW.medio }}>
                  Nenhum grupo marcado — marque ao menos um para gerar o book.
                </p>
              )}
            </section>

            {bookAtualUrl && (
              <section className="book-secao" aria-labelledby="book-titulo-heranca" style={{ padding: "14px", borderRadius: R.lg, backgroundColor: T.surface, border: `1px solid ${T.border}`, minWidth: 0 }}>
                <h2 id="book-titulo-heranca" style={{ margin: "0 0 6px", fontFamily: FONT.display, fontSize: FS.strong, fontWeight: FW.forte, color: T.text }}>Herdar do book atual</h2>
                <BookHeranca
                  bookUrl={bookAtualUrl}
                  capa={capaHerdada}
                  onCapaChange={setCapaHerdada}
                  paginas={paginasHerdadas}
                  onTogglePagina={(n) => setPaginasHerdadas((prev) => { const s2 = new Set(prev); if (s2.has(n)) s2.delete(n); else s2.add(n); return s2; })}
                  onErro={(e) => setHerancaFalhou(!!e)}
                  onMiniaturas={setMiniaturasHerdadas}
                />
              </section>
            )}

            {podePublicar && (
              <section className="book-secao" style={{ padding: "14px", borderRadius: R.lg, backgroundColor: T.surface, border: `1px solid ${T.border}` }}>
                <ComentarioDoBook
                  republicacao={!!bookAtualUrl}
                  valor={comentario}
                  aoMudar={setComentario}
                  patrocinadores={patrocinadoresDoBook}
                  titulo="secao"
                />
              </section>
            )}
          </div>

          {/* ── Prévia: as MESMAS células do PDF, em miniatura ── */}
          <section aria-labelledby="book-titulo-previa" style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
              <h2 id="book-titulo-previa" style={{ margin: 0, fontFamily: FONT.display, fontSize: FS.strong, fontWeight: FW.forte, color: T.text }}>
                Prévia <span style={{ fontFamily: FONT.corpo, fontSize: FS.body, fontWeight: FW.medio, color: T.second }}>· {nPaginasFinal} {nPaginasFinal === 1 ? "página" : "páginas"}</span>
              </h2>
              {heranca && (heranca.capa || herdadas.length > 0) && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: FS.meta, color: T.apoio }}>
                  <span aria-hidden="true" style={{ width: 12, height: 9, borderRadius: 2, border: `2px solid ${T.accentText}` }} /> copiada do book atual
                </span>
              )}
            </div>
            <div data-testid="previa-book" style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, ${LARG_PREVIA}px)`, gap: isMobile ? 16 : "18px 16px", justifyContent: colunasDaPrevia === 1 ? "center" : "start" }}>
              {/* capa — herdada (logo de verdade) ou gerada (nome no fundo claro) */}
              {paginaDaPrevia("capa",
                <><b style={{ fontWeight: FW.forte, color: T.strong }}>Capa</b><span>{heranca?.capa ? "· herdada do book atual" : "· gerada com o nome do evento"}</span></>,
                heranca?.capa && miniaturasHerdadas[1]
                  ? <img src={miniaturasHerdadas[1]} alt="Capa do book atual" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                  : (
                    <div style={{ position: "absolute", inset: 0, backgroundColor: BOOK.CAPA_FUNDO, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 14px", textAlign: "center" }}>
                      <span style={{ fontFamily: FONT.display, fontWeight: FW.rotulo, fontSize: Math.round((15 * LARG_PREVIA) / 288), lineHeight: 1.15, color: BOOK.CAPA_TEXTO }}>
                        {heranca?.capa ? "Capa do book atual" : event?.name ?? ""}
                      </span>
                    </div>
                  ),
                { destaque: !!heranca?.capa, testid: "previa-capa" })}
              {herdadas.map((n, k) => paginaDaPrevia(`h-${n}`,
                <><b style={{ fontWeight: FW.forte, color: T.strong }}>pág. {k + 2}</b><span>· pág. {n} do book atual</span></>,
                miniaturasHerdadas[n]
                  ? <img src={miniaturasHerdadas[n]} alt={`Página ${n} do book atual`} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                  : (
                    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, backgroundColor: T.bg }}>
                      <Copy aria-hidden="true" style={{ width: 18, height: 18, color: T.accentText }} />
                      <span style={{ fontFamily: FONT.display, fontWeight: FW.rotulo, fontSize: FS.body, color: T.text }}>pág. {n}</span>
                      <span style={{ fontSize: FS.micro, fontWeight: FW.forte, color: T.accentText }}>copiada do original</span>
                    </div>
                  ),
                { destaque: true, testid: `previa-herdada-${n}` }))}
              {paginas.map((p, pi) => {
                const celulas = celulasDaPagina(p.itens.length);
                return paginaDaPrevia(`p-${pi}`,
                  <><b style={{ fontWeight: FW.forte, color: T.strong, whiteSpace: "nowrap" }}>pág. {pi + 2 + herdadas.length}</b><span style={{ overflowWrap: "anywhere" }}>· {p.rotulo} · {p.itens.length} {p.itens.length === 1 ? "arte" : "artes"}</span></>,
                  <>
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
                    {/* rodapé da prévia, nas mesmas coordenadas da spec. A
                        assinatura tem a largura do espaço até a barra: em fonte
                        de tela ela passava por cima do rótulo ("…(eWindBanner").
                        Só a PRÉVIA — o PDF mede o texto no pdf-lib. */}
                    <span style={{ position: "absolute", left: BOOK.ASSINATURA_X * ESC, bottom: (BOOK.RODAPE_BASELINE_DO_FUNDO - 4) * ESC, maxWidth: (BOOK.BARRA_X - BOOK.ASSINATURA_X - 6) * ESC, overflow: "hidden", fontSize: 6, color: T.second, whiteSpace: "nowrap" }}>{event?.name ?? ""}</span>
                    <span aria-hidden="true" style={{ position: "absolute", left: BOOK.BARRA_X * ESC, bottom: (BOOK.RODAPE_BASELINE_DO_FUNDO - 6) * ESC, fontSize: 9, color: T.muted }}>╱</span>
                    <span style={{ position: "absolute", left: BOOK.RODAPE_ROTULO_X * ESC, bottom: (BOOK.RODAPE_BASELINE_DO_FUNDO - 4) * ESC, maxWidth: (BOOK.LARGURA - BOOK.RODAPE_ROTULO_X - BOOK.ASSINATURA_X) * ESC, overflow: "hidden", fontSize: 7.5, fontWeight: FW.medio, color: T.text, whiteSpace: "nowrap" }}>{p.rotulo}</span>
                    {/* a linha do miolo, sutil, para ver a régua na prévia */}
                    <span aria-hidden="true" style={{ position: "absolute", left: miolo.x * ESC, top: miolo.y * ESC, width: miolo.w * ESC, height: miolo.h * ESC, border: `1px dashed ${N.n3}`, pointerEvents: "none" }} />
                  </>);
              })}
            </div>
            {paginas.length === 0 && grupos.length > 0 && (
              <p style={{ margin: "12px 0 0", fontSize: FS.meta, color: T.second }}>Sem grupos marcados, o book seria só a capa — marque ao menos um grupo.</p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
