// ─────────────────────────────────────────────────────────────────────────────
// ETIQUETAS DO EVENTO — para colar no material depois da conferência.
//
// Pedido do dono (24/08), com o modelo em PDF do Circuito Vale como régua:
// A4 deitado, DUAS etiquetas por folha com linha de corte no meio; cada uma
// leva o nome do evento em letras gigantes (é o que se lê de longe na pilha
// do galpão), a arte da peça, o código laranja + tipo, a descrição e a
// quantidade. O PDF é o do navegador (Imprimir → salvar como PDF), como no
// Relatório: para folha de texto e imagem, o print nativo é a melhor
// tipografia por zero código.
//
// DECISÕES:
//  · Abre nas peças CONFERIDAS — a etiqueta existe para o material que passou
//    pela conferência. Um interruptor (fora da impressão) inclui as demais,
//    para quem quiser adiantar a rotulagem.
//  · Uma peça por etiqueta como PADRÃO — etiqueta é do ITEM físico; agrupar
//    duas numa faria alguém recortar no meio. O interruptor "Uma por unidade"
//    (25/08) vai além: 6 lonas em 6 rolos = 6 etiquetas numeradas "n de 6".
//  · Ordem por código (compareDisplayId), a mesma das outras telas: a pilha
//    impressa sai na ordem da fila.
//  · A impressão FICA REGISTRADA (25/08): ao imprimir, as peças da folha
//    ganham labelPrintedAt no servidor (+ linha na trilha). A próxima visita
//    abre com as já impressas desmarcadas — quem volta depois de uma
//    conferência nova imprime só o que falta, sem etiqueta duplicada no
//    galpão. O registro informa, não bloqueia: remarcar é um clique.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { Printer, ArrowLeft, Tags, Check } from "lucide-react";
import { compareDisplayId } from "@/lib/displayId";
import { ehBookCompleto } from "@shared/fluxo-peca";
import { logoDaCapaDoBook } from "@/lib/logo-do-book";
import { apiRequest, queryClient } from "@/lib/queryClient";

/** Conferida = já passou pela conferência (inclui as entregues e as grafias legadas). */
const CONFERIDA = new Set(["conferred", "conferido", "delivered", "entregue"]);
const jaConferida = (i: any) => CONFERIDA.has(i.status) || (i.conferredQty ?? 0) > 0;

const dataBR = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" }) : null;

// labelPrintedAt é um INSTANTE (quando o botão foi clicado), não uma data de
// calendário como truckDepartureDate — por isso sem timeZone: "UTC": quem
// imprimiu 23h em São Paulo não pode ler "impressa amanhã" no selo.
const dataImpressao = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
const dataImpressaoExtenso = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

export default function EtiquetasEvento() {
  const [, params] = useRoute("/eventos/:id/etiquetas");
  const eventId = params?.id;
  // Quem chegou pela Gráfica volta para a Gráfica (pedido do dono, 25/08):
  // os atalhos de lá carregam ?de=grafica, e o Voltar respeita a origem.
  const veioDaGrafica = new URLSearchParams(window.location.search).get("de") === "grafica";
  const voltarHref = veioDaGrafica ? "/grafica" : `/eventos/${eventId}`;
  const [incluirTodas, setIncluirTodas] = useState(false);

  /**
   * SELEÇÃO (pedido do dono, 25/08): nem toda conferida precisa de etiqueta
   * naquela impressão. O conjunto guarda as DESMARCADAS — vazio = todas, e
   * peça recém-conferida entra marcada sozinha.
   */
  const [desmarcadas, setDesmarcadas] = useState<Set<string>>(new Set());

  /** Filtro por TIPO na faixa de seleção (25/08): "só as lonas" é o pedido
   *  comum, e sem isso exigia desmarcar as outras uma a uma. */
  const [filtroTipo, setFiltroTipo] = useState<string | null>(null);

  /** UMA POR UNIDADE (25/08): 6 lonas em 6 rolos = 6 volumes, e etiqueta
   *  existe para identificar VOLUME. Desligado por padrão. */
  const [porUnidade, setPorUnidade] = useState(false);

  /**
   * ORIENTAÇÃO: paisagem (folha deitada, tiras empilhadas) ou retrato — a
   * folha EM PÉ com o conteúdo deitado, que se lê virando a página. O retrato
   * é exatamente o template original do dono (circuito vale.pdf): A4 em pé,
   * corte vertical no meio, cada metade uma tira deitada.
   */
  const [orientacao, setOrientacao] = useState<"paisagem" | "retrato">("paisagem");

  /**
   * O LOGO DA PROVA, tirado do book (pedido do dono, 25/08): a capa do book
   * subido é o logo num fundo liso — rasterizada e recortada, vira a marca
   * da etiqueta, no lugar da linha de texto. Sem book (ou capa ilegível), a
   * etiqueta segue como era: o logo é enfeite, não pré-requisito.
   */
  const [logo, setLogo] = useState<string | null>(null);
  const [buscandoLogo, setBuscandoLogo] = useState(false);
  const [usarLogo, setUsarLogo] = useState(true);

  /**
   * A PALAVRA GIGANTE da etiqueta. No modelo do dono o nome tem dois níveis:
   * a marca do evento pequena ('Circuito Corrida Vale 2026') e a CIDADE
   * enorme ('ITABIRA') — é ela que se lê de longe. O padrão é a última
   * palavra do nome, e o campo é editável antes de imprimir porque nenhuma
   * regra automática acerta 'São Paulo' (duas palavras) sem errar outra.
   */
  const [destaque, setDestaque] = useState<string | null>(null);

  const { data: event, isError: eventoFalhou } = useQuery<any>({ queryKey: [`/api/events/${eventId}`], enabled: !!eventId });
  const { data: itens = [], isLoading, isError: itensFalharam, refetch } = useQuery<any[]>({
    queryKey: ["/api/items", eventId],
    enabled: !!eventId,
  });

  // A tela ABRE com as já impressas desmarcadas (uma vez, quando as peças
  // chegam): a segunda visita imprime só o que falta. O flag impede que o
  // refetch pós-impressão desmarque o que a pessoa acabou de escolher.
  const selecaoSemeada = useRef(false);
  useEffect(() => {
    if (selecaoSemeada.current || (itens as any[]).length === 0) return;
    selecaoSemeada.current = true;
    const impressas = (itens as any[]).filter((i) => i.labelPrintedAt).map((i) => i.id);
    if (impressas.length > 0) setDesmarcadas(new Set(impressas));
  }, [itens]);

  const pool = useMemo(() => {
    // BOOK COMPLETO fica de fora: é o trâmite do Atendimento, não uma peça (ver shared/fluxo-peca).
    const vivas = (itens as any[]).filter((i) => !i.deletedAt && i.status !== "canceled" && i.status !== "archived" && !ehBookCompleto(i));
    const base = incluirTodas ? vivas : vivas.filter(jaConferida);
    return [...base].sort((a, b) => compareDisplayId(a.displayId, b.displayId));
  }, [itens, incluirTodas]);

  const tipos = useMemo(
    () => Array.from(new Set(pool.map((p) => String(p.type ?? "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, "pt-BR")),
    [pool],
  );
  // Se o tipo filtrado sumiu do pool (ex.: desligou "incluir todas"), o filtro
  // cai para "todos" sozinho — um filtro apontando para o nada esconderia tudo.
  const filtroValido = filtroTipo && tipos.includes(filtroTipo) ? filtroTipo : null;
  const poolFiltrado = useMemo(
    () => (filtroValido ? pool.filter((p) => String(p.type ?? "").trim() === filtroValido) : pool),
    [pool, filtroValido],
  );

  const pecas = useMemo(() => poolFiltrado.filter((p) => !desmarcadas.has(p.id)), [poolFiltrado, desmarcadas]);

  /** As ETIQUETAS da folha: uma por peça, ou uma por UNIDADE ("3 de 6") com o
   *  interruptor ligado. Peça de 1 unidade não ganha numeração. */
  const etiquetas = useMemo(() => {
    if (!porUnidade) return pecas.map((p) => ({ p, n: 0, total: 0 }));
    return pecas.flatMap((p) => {
      const q = Math.max(1, Math.floor(Number(p.quantity ?? 1)) || 1);
      if (q === 1) return [{ p, n: 0, total: 0 }];
      return Array.from({ length: q }, (_, k) => ({ p, n: k + 1, total: q }));
    });
  }, [pecas, porUnidade]);
  const folhas = Math.ceil(etiquetas.length / 2);

  const impressasNoPool = useMemo(() => pool.filter((p) => p.labelPrintedAt).length, [pool]);
  const faltamNoPool = pool.length - impressasNoPool;

  const bookUrl = useMemo(() => (itens as any[]).find((i) => i.bookUrl && !i.deletedAt)?.bookUrl ?? null, [itens]);
  useEffect(() => {
    let vivo = true;
    setLogo(null);
    if (!bookUrl) return;
    setBuscandoLogo(true);
    logoDaCapaDoBook(bookUrl).then((l) => { if (vivo) { setLogo(l); setBuscandoLogo(false); } });
    return () => { vivo = false; };
  }, [bookUrl]);

  const conferidas = useMemo(() => (itens as any[]).filter((i) => !i.deletedAt && jaConferida(i)).length, [itens]);

  const nome: string = event?.name ?? "";
  const palavraFinal = nome.trim().split(/\s+/).slice(-1)[0] ?? "";
  const gigante = (destaque ?? palavraFinal).trim();
  // O prefixo é o nome SEM a parte gigante (comparado sem caixa); se o
  // destaque digitado não estiver no nome, o nome inteiro vira prefixo.
  const idx = gigante ? nome.toLowerCase().lastIndexOf(gigante.toLowerCase()) : -1;
  const prefixo = idx >= 0 ? (nome.slice(0, idx) + nome.slice(idx + gigante.length)).replace(/\s+/g, " ").trim() : nome;

  // REGISTRO DA IMPRESSÃO (25/08): ao disparar o print, as peças da folha
  // ganham a data no servidor (labelPrintedAt + linha na trilha). Sem await
  // antes do window.print() — a impressão não espera a rede, e se o registro
  // falhar a folha sai do mesmo jeito: o registro informa, não bloqueia.
  const imprimir = () => {
    const ids = Array.from(new Set<string>(pecas.map((p) => p.id)));
    if (ids.length > 0) {
      apiRequest("POST", "/api/items/labels-printed", { itemIds: ids })
        .then(() => queryClient.invalidateQueries({ queryKey: ["/api/items", eventId] }))
        .catch(() => { /* sem registro desta vez; a folha já saiu */ });
    }
    window.print();
  };

  if (isLoading) return <p style={{ padding: 40, fontSize: 14, color: "#78716c" }}>Montando as etiquetas…</p>;

  // Falha de rede NÃO pode virar "evento sem peças" — mentiria justamente
  // para quem está com a impressora esperando.
  if (itensFalharam || eventoFalhou) {
    return (
      <div style={{ padding: 40 }}>
        <p data-testid="etiquetas-erro" style={{ margin: 0, fontSize: 14, color: "#b91c1c", fontWeight: 600 }}>
          Não foi possível carregar as peças do evento.
        </p>
        <button type="button" onClick={() => refetch()} style={{ marginTop: 12, height: 40, padding: "0 16px", borderRadius: 8, border: "1px solid #e7e5e4", background: "#fff", cursor: "pointer", font: "inherit", fontSize: 13, fontWeight: 600, color: "#44403c" }}>
          Tentar de novo
        </button>
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: "#ffffff", minHeight: "100%" }}>
      <style>{`
        /* A ETIQUETA É MEIA FOLHA, SEMPRE. A altura vinha do conteúdo
           (minHeight solto) — a linha de corte caía onde o texto mandasse, e
           a guilhotina corta no MEIO do papel. Folha com proporção de A4 nas
           duas orientações; cada etiqueta ocupa 50% cravados; folha ímpar
           deixa a metade de baixo vazia, e o corte continua certo. */
        .etq-folha { display: flex; flex-direction: column; }
        .etq-etiqueta { height: 50%; flex: none; overflow: hidden; box-sizing: border-box; }
        @media print {
          .etq-acao { display: none !important; }
          @page { size: A4 ${orientacao === "retrato" ? "portrait" : "landscape"}; margin: 8mm; }
          body { background: #fff !important; }
          .etq-quebra { page-break-after: always; }
          .etq-quebra:last-child { page-break-after: auto; }
          .etq-moldura-paisagem { width: 281mm !important; height: 194mm !important; max-width: none !important; }
          .etq-moldura-paisagem > .etq-folha { width: 100% !important; height: 100% !important; border: none !important; border-radius: 0 !important; }
          /* RETRATO: a folha fica em pé e o conteúdo (deitado, como o template
             original do dono) gira 90° para caber — lê-se virando a página. */
          .etq-moldura-retrato { width: 194mm !important; height: 281mm !important; }
          .etq-moldura-retrato > .etq-folha { width: 281mm !important; height: 194mm !important; left: 194mm !important; border: none !important; border-radius: 0 !important; }
        }
        @media screen {
          .etq-folha { border: 1px solid #e7e5e4; border-radius: 10px; }
          .etq-quebra { margin: 0 auto 18px; }
          /* "Uma por unidade" multiplica folhas (32 un. = 16 folhas): na TELA
             só o que está visível renderiza; a impressão ignora esta regra. */
          .etq-quebra { content-visibility: auto; contain-intrinsic-size: auto 540px; }
          /* Alvo de dedo na tela que o galpão usa por celular. */
          @media (pointer: coarse) {
            .etq-acao button, .etq-acao input[type="checkbox"] + span { min-height: 40px; }
            .etq-chip { min-height: 38px; }
            .etq-alvo { min-height: 40px; }
          }
        }
        .etq-moldura-retrato { position: relative; width: 707px; height: 1000px; }
        .etq-moldura-retrato > .etq-folha { position: absolute; top: 0; left: 707px; width: 1000px; height: 707px; transform: rotate(90deg); transform-origin: top left; }
        .etq-moldura-paisagem { width: min(1050px, 100%); aspect-ratio: 297 / 210; }
        .etq-moldura-paisagem > .etq-folha { width: 100%; height: 100%; }
      `}</style>

      {/* ── Barra (não imprime) ── */}
      <div className="etq-acao" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "14px 18px", borderBottom: "1px solid #e7e5e4", position: "sticky", top: 0, backgroundColor: "#fafaf9", zIndex: 5 }}>
        <Link href={voltarHref} data-testid="link-voltar-evento" style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 38, padding: "0 12px", borderRadius: 8, border: "1px solid #e7e5e4", color: "#44403c", fontSize: 13, fontWeight: 600, textDecoration: "none", backgroundColor: "#fff" }}>
          <ArrowLeft style={{ width: 14, height: 14 }} /> {veioDaGrafica ? "Voltar à Gráfica" : "Voltar ao evento"}
        </Link>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: "#1c1917", display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Tags style={{ width: 15, height: 15, color: "#c2410c" }} />
          {/* A conta é de ETIQUETAS — é a folha que vai para a impressora. Com
              "uma por unidade" as contas divergem, então as duas aparecem. */}
          {etiquetas.length} etiqueta{etiquetas.length !== 1 ? "s" : ""} · {folhas} folha{folhas !== 1 ? "s" : ""}
          {porUnidade && <> · {pecas.length} peça{pecas.length !== 1 ? "s" : ""}</>}
        </span>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13, color: "#44403c", cursor: "pointer", marginLeft: 6 }}>
          <input type="checkbox" checked={incluirTodas} onChange={(e) => setIncluirTodas(e.target.checked)} data-testid="check-incluir-todas" style={{ width: 16, height: 16, accentColor: "#c2410c" }} />
          Incluir as não conferidas
        </label>
        <label title="Peça de 6 unidades vira 6 etiquetas numeradas — uma para cada volume." style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13, color: "#44403c", cursor: "pointer" }}>
          <input type="checkbox" checked={porUnidade} onChange={(e) => setPorUnidade(e.target.checked)} data-testid="check-por-unidade" style={{ width: 16, height: 16, accentColor: "#c2410c" }} />
          Uma por unidade
        </label>
        {(logo || buscandoLogo) && (
          <label style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13, color: "#44403c", cursor: "pointer" }}>
            <input type="checkbox" checked={usarLogo} onChange={(e) => setUsarLogo(e.target.checked)} data-testid="check-usar-logo" style={{ width: 16, height: 16, accentColor: "#c2410c" }} />
            Logo do book
          </label>
        )}
        {/* Orientação da folha — o retrato é o template original do dono. */}
        <div role="group" aria-label="Orientação da folha" style={{ display: "inline-flex", borderRadius: 8, border: "1px solid #d6d3d1", overflow: "hidden" }}>
          {([["paisagem", "Deitada"], ["retrato", "Em pé"]] as const).map(([v, rotulo]) => (
            <button
              key={v}
              type="button"
              onClick={() => setOrientacao(v)}
              aria-pressed={orientacao === v}
              data-testid={`orientacao-${v}`}
              style={{
                height: 34, padding: "0 12px", border: "none", fontSize: 12.5, fontWeight: 700,
                backgroundColor: orientacao === v ? "#1c1917" : "#fff",
                color: orientacao === v ? "#fff" : "#57534e", cursor: "pointer",
              }}
            >
              {rotulo}
            </button>
          ))}
        </div>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13, color: "#44403c", marginLeft: 6 }}>
          Palavra gigante
          <input value={destaque ?? palavraFinal} onChange={(e) => setDestaque(e.target.value)} data-testid="input-destaque"
            style={{ height: 34, width: 140, borderRadius: 8, border: "1px solid #d6d3d1", padding: "0 10px", fontSize: 13, fontFamily: "inherit", color: "#1c1917", backgroundColor: "#fff" }} />
        </label>
        <span style={{ flex: 1 }} />
        {/* Enquanto o logo está sendo extraído do book, imprimir sairia SEM
            ele sem ninguém perceber (o dono pegou esse vão em produção). São
            segundos — o botão espera; quem não quer logo desmarca e imprime. */}
        <button type="button" onClick={imprimir} data-testid="button-imprimir-etiquetas"
          disabled={buscandoLogo && usarLogo}
          title={buscandoLogo && usarLogo ? 'Extraindo o logo do book — segundos. Para imprimir sem logo, desmarque "Logo do book".' : undefined}
          style={{ display: "inline-flex", alignItems: "center", gap: 7, height: 38, padding: "0 16px", borderRadius: 8, border: "none", backgroundColor: buscandoLogo && usarLogo ? "#e7e5e4" : "#1c1917", color: buscandoLogo && usarLogo ? "#57534e" : "#fff", cursor: buscandoLogo && usarLogo ? "wait" : "pointer", font: "inherit", fontSize: 13, fontWeight: 700 }}>
          <Printer style={{ width: 14, height: 14 }} /> {buscandoLogo && usarLogo ? "Buscando o logo…" : "Imprimir / PDF"}
        </button>
      </div>

      {/* ── Seleção: quais peças ganham etiqueta NESTA impressão. Escolhe-se
          pela DESCRIÇÃO (é ela que manda na etiqueta); o código fica pequeno.
          A fração conta sobre o pool FILTRADO por tipo; "nenhuma" desmarca
          TUDO, não só o que o filtro mostra — senão prometeria mais que faz. ── */}
      {pool.length > 0 && (
        <div className="etq-acao" style={{ padding: "10px 18px", borderBottom: "1px solid #f0efee", display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", maxHeight: 180, overflowY: "auto" }}>
          <span style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "#78716c", marginRight: 4 }}>
            Imprimir ({pecas.length}/{poolFiltrado.length})
          </span>
          <button type="button" data-testid="selecao-todas" className="etq-alvo" onClick={() => setDesmarcadas(new Set())}
            style={{ height: 28, padding: "0 10px", borderRadius: 999, border: "1px solid #d6d3d1", background: "#fff", fontSize: 11, fontWeight: 700, color: "#44403c", cursor: "pointer" }}>
            todas
          </button>
          <button type="button" data-testid="selecao-nenhuma" className="etq-alvo" onClick={() => setDesmarcadas(new Set(pool.map((p) => p.id)))}
            style={{ height: 28, padding: "0 10px", borderRadius: 999, border: "1px solid #d6d3d1", background: "#fff", fontSize: 11, fontWeight: 700, color: "#44403c", cursor: "pointer" }}>
            nenhuma
          </button>
          {/* Refaz a seleção de abertura a qualquer momento: só o que ainda não
              saiu na impressora. Aparece apenas quando há impressa E pendente. */}
          {impressasNoPool > 0 && faltamNoPool > 0 && (
            <button type="button" data-testid="selecao-so-novas" className="etq-alvo"
              onClick={() => setDesmarcadas(new Set(pool.filter((p) => p.labelPrintedAt).map((p) => p.id)))}
              style={{ height: 28, padding: "0 10px", borderRadius: 999, border: "1px solid #fdba74", background: "#fff7ed", fontSize: 11, fontWeight: 700, color: "#9a3412", cursor: "pointer" }}>
              Só as {faltamNoPool} que faltam
            </button>
          )}
          {tipos.length > 1 && (
            <span role="group" aria-label="Filtrar por tipo" style={{ display: "inline-flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
              {[null, ...tipos].map((t) => {
                const ativo = filtroValido === t;
                return (
                  <button key={t ?? "__todos"} type="button" className="etq-alvo"
                    onClick={() => setFiltroTipo(t)}
                    aria-pressed={ativo}
                    data-testid={t === null ? "filtro-tipo-todos" : `filtro-tipo-${t.toLowerCase().replace(/\s+/g, "-")}`}
                    style={{
                      height: 28, padding: "0 10px", borderRadius: 999, fontSize: 11, fontWeight: 700, cursor: "pointer",
                      border: `1px solid ${ativo ? "#1c1917" : "#d6d3d1"}`,
                      backgroundColor: ativo ? "#1c1917" : "#fff",
                      color: ativo ? "#fff" : "#44403c",
                    }}>
                    {t ?? "Todos os tipos"}
                  </button>
                );
              })}
            </span>
          )}
          {poolFiltrado.map((p) => {
            const marcada = !desmarcadas.has(p.id);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setDesmarcadas((prev) => { const n = new Set(prev); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })}
                aria-pressed={marcada}
                className="etq-chip"
                data-testid={`selecao-peca-${p.id}`}
                title={`${p.type}${p.description ? " — " + p.description : ""}${p.labelPrintedAt ? " · etiqueta impressa em " + dataImpressaoExtenso(p.labelPrintedAt) : ""}`}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 7, minHeight: 34, maxWidth: 260,
                  padding: "4px 10px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", textAlign: "left",
                  border: `1px solid ${marcada ? "#c2410c" : "#e7e5e4"}`,
                  backgroundColor: marcada ? "#fff7ed" : "#fff",
                  color: "#1c1917",
                }}
              >
                <span aria-hidden="true" style={{
                  width: 16, height: 16, flexShrink: 0, borderRadius: 4,
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  border: `1.5px solid ${marcada ? "#c2410c" : "#a8a29e"}`,
                  backgroundColor: marcada ? "#c2410c" : "#fff",
                }}>
                  {marcada && <Check style={{ width: 11, height: 11, color: "#fff", strokeWidth: 3.5 }} />}
                </span>
                <span style={{ minWidth: 0, overflow: "hidden" }}>
                  <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {p.description || p.type}
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10.5, fontWeight: 700 }}>
                    {/* #78716c sobre #fff = 4,6:1 — o cinza claro anterior media 2,3:1. */}
                    <span style={{ color: marcada ? "#c2410c" : "#78716c" }}>{p.displayId}</span>
                    {p.labelPrintedAt && (
                      <span data-testid={`selo-impressa-${p.id}`} title={`Etiqueta impressa em ${dataImpressaoExtenso(p.labelPrintedAt)}`}
                        style={{ backgroundColor: "#f3f4f3", color: "#57534e", borderRadius: 4, padding: "1px 5px", fontWeight: 700 }}>
                        impressa {dataImpressao(p.labelPrintedAt)}
                      </span>
                    )}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {etiquetas.length === 0 && (
        <p data-testid="etiquetas-vazio" style={{ margin: 0, padding: "36px 24px", fontSize: 14, color: "#57534e", maxWidth: 560 }}>
          {pool.length > 0
            ? "Nenhuma peça selecionada — marque na faixa acima quais entram nesta impressão."
            : incluirTodas
              ? "Este evento não tem peças para etiquetar."
              : <>Nenhuma peça conferida ainda — a etiqueta nasce da conferência. {conferidas === 0 && "Assim que a Gráfica conferir, elas aparecem aqui."} Se quiser adiantar, marque “Incluir as não conferidas”.</>}
        </p>
      )}

      {/* ── Folhas: 2 etiquetas por página, linha de corte no meio. A MESMA
          tira nas duas orientações — no retrato a folha inteira gira 90°,
          como no template original (corte vertical, leitura de lado). ── */}
      {/* overflow-x próprio: a folha em pé (707px) rola AQUI no celular — a
          página nunca ganha rolagem lateral (régua da casa). */}
      <div style={{ padding: "18px 12px 48px", overflowX: "auto" }}>
        {Array.from({ length: folhas }, (_, f) => etiquetas.slice(f * 2, f * 2 + 2)).map((dupla, f) => (
          <div key={f} className={`etq-quebra ${orientacao === "retrato" ? "etq-moldura-retrato" : "etq-moldura-paisagem"}`} style={orientacao === "retrato" ? { margin: "0 auto 18px" } : undefined}>
          <div className="etq-folha" style={{ display: "flex", flexDirection: "column" }}>
            {dupla.map((e, i) => (
              <div key={`${e.p.id}-${e.n}`} data-testid={e.n > 0 ? `etiqueta-${e.p.id}-${e.n}` : `etiqueta-${e.p.id}`} className="etq-etiqueta" style={{
                display: "flex", alignItems: "stretch", gap: 18, padding: "22px 26px",
                borderBottom: i === 0 ? "2px dashed #d6d3d1" : "none",
              }}>
                {/* O NOME DO EVENTO — o que se lê de longe na pilha */}
                <div style={{ flex: "1.2 1 0", minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "#78716c" }}>
                    {event?.truckDepartureDate ? `Saída ${dataBR(event.truckDepartureDate)}` : " "}
                  </p>
                  {/* Dois níveis, como no modelo: a marca (o LOGO do book,
                      quando existe; senão o resto do nome em texto) e a
                      palavra de destaque GIGANTE — é ela que se lê de longe. */}
                  {logo && usarLogo && (
                    <img loading="lazy" decoding="async" src={logo} alt="Logo do evento" data-testid="logo-etiqueta"
                      style={{ maxHeight: 92, maxWidth: "60%", objectFit: "contain", alignSelf: "flex-start", margin: "4px 0 6px" }} />
                  )}
                  {/* Sem palavra gigante (campo apagado), o nome sai UMA vez,
                      no tamanho médio — antes ele saía duplicado: inteiro como
                      "marca" e inteiro de novo como destaque. */}
                  {!(logo && usarLogo) && gigante && prefixo && (
                    <p style={{ margin: "4px 0 0", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 800, fontSize: "clamp(16px, 2vw, 24px)", textTransform: "uppercase", letterSpacing: "0.01em", color: "#1c1917", lineHeight: 1.1 }}>
                      {prefixo}
                    </p>
                  )}
                  <p style={{
                    margin: "2px 0 0", fontFamily: "'Space Grotesk', sans-serif",
                    fontWeight: 900, textTransform: "uppercase", letterSpacing: "-0.02em",
                    color: "#1c1917", lineHeight: 0.95,
                    fontSize: gigante && prefixo ? "clamp(56px, 8vw, 104px)" : "clamp(34px, 5.2vw, 64px)",
                    overflowWrap: "anywhere",
                  }}>
                    {gigante || nome}
                  </p>
                </div>

                {/* A PEÇA: arte + código + descrição + quantidade */}
                <div style={{ flex: "1 1 0", minWidth: 0, display: "flex", gap: 16, alignItems: "center" }}>
                  {(e.p.approvalThumbUrl || e.p.finalPreviewUrl) && (
                    <img loading="lazy" decoding="async" src={e.p.approvalThumbUrl || e.p.finalPreviewUrl} alt=""
                      style={{ width: 150, height: 150, objectFit: "contain", borderRadius: 10, border: "1px solid #e7e5e4", backgroundColor: "#fafaf9", flexShrink: 0 }} />
                  )}
                  <div style={{ minWidth: 0, flex: 1 }}>
                    {/* A DESCRIÇÃO manda (pedido do dono, 25/08): é ela que
                        identifica o material na pilha — "Testeira Vale Local"
                        diz mais que #2219. O número fica pequeno, para quem
                        precisar conferir no sistema. */}
                    <p style={{ margin: 0, fontFamily: "'Space Grotesk', sans-serif", fontSize: 30, fontWeight: 900, letterSpacing: "-0.01em", lineHeight: 1.12, color: "#1c1917", overflowWrap: "anywhere" }}>
                      {e.p.description || e.p.type}
                    </p>
                    <p style={{ margin: "6px 0 0", fontSize: 16, lineHeight: 1.3 }}>
                      <span style={{ color: "#44403c", textTransform: "uppercase", fontWeight: 700 }}>{e.p.type}</span>
                      {" "}<span style={{ color: "#c2410c", fontWeight: 700 }}>{e.p.displayId}</span>
                    </p>
                  </div>
                  <div style={{ alignSelf: "flex-start", textAlign: "right", flexShrink: 0 }}>
                    <p style={{ margin: 0, fontFamily: "'Space Grotesk', sans-serif", fontSize: 30, fontWeight: 900, color: "#1c1917", whiteSpace: "nowrap" }}>
                      {e.p.quantity ?? 1} un.
                    </p>
                    {/* "Uma por unidade": cada volume sabe qual ele é no lote. */}
                    {e.n > 0 && (
                      <p style={{ margin: "2px 0 0", fontFamily: "'Space Grotesk', sans-serif", fontSize: 18, fontWeight: 900, color: "#c2410c", whiteSpace: "nowrap" }}>
                        {e.n} de {e.total}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
          </div>
        ))}
      </div>
    </div>
  );
}
