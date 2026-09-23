// ─────────────────────────────────────────────────────────────────────────────
// ETIQUETA DO TUBO (dono, 14/09) — para colar no tubo antes do caminhão.
//
// 21/09 (dono): a etiqueta segue o formato da que o galpão já cola no rolo:
//   · cabeçalho CENTRALIZADO: o logo do book, se houver; senão, o prefixo do
//     nome do evento. Embaixo, a palavra GIGANTE (a cidade), que se lê de
//     longe na pilha;
//   · o NÚMERO DO TUBO em destaque — é o que distingue um tubo do outro do
//     mesmo evento;
//   · uma linha por peça, centralizada e compacta: "2x1 Ministério - 16"
//     (tipo + descrição + " - " + quantidade), sem arte e sem código.
// A entrega no fim é por tubo, "dos itens que estão juntos": a lista é o que o
// recebedor confere na ponta sem abrir o tubo.
//
// 21/09, 2ª rodada — o galpão parar de fazer etiqueta no Corel (1.669 peças
// saíram com a etiqueta deles em setembro, 25 com a do app). A barra ganha as
// escolhas que eles fazem à mão: com ou sem quantidade, o TAMANHO do papel
// (adesivo 10×15 em pé é o padrão — é o que eles colam), CÓPIAS (colam dos
// dois lados do tubo) e a segunda etiqueta "REAPROVEITAR". Lista que não cabe
// numa etiqueta quebra em "Tubo 2 · 1 de 2". As regras (linha, tamanhos,
// paginação, preferências) moram em lib/etiqueta-lista.ts, as mesmas das
// listas das etiquetas do evento.
//
// O PDF é o do navegador (Imprimir → salvar como PDF). Na impressão as
// etiquetas saem por um PORTAL no <body> e todo o resto some por display: com
// VÁRIAS páginas, esconder por visibilidade deixava a casca do app (altura de
// tela, rolagem própria) segurar o fluxo — a segunda etiqueta não paginava.
//
// 22/09 — MESMA LINGUAGEM das etiquetas do evento (o dono achou aquela tela
// confusa; as duas passam a falar igual): opções em SEÇÕES nomeadas (Formato ·
// Cabeçalho), o RESUMO do que vai sair colado ao botão, cada etiqueta da prévia
// com a sua legenda ("Adesivo 10×15 cm · 1 de 2") e zoom para caber no celular.
// A palavra gigante usa `cabecalhoPadrao` ("teste 3" não vira um "3" gigante).
// EMBALADA SOZINHA (sem tubo): a etiqueta dela é a INDIVIDUAL do evento — se um
// dia a rota devolver um tubo `avulso` (ou sem número), a tela não quebra: some
// o "TUBO N" e aparece o caminho para as etiquetas do evento.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { Link, useRoute } from "wouter";
import { ArrowLeft, Printer, RotateCw, Tag } from "lucide-react";
import { logoDaCapaDoBook } from "@/lib/logo-do-book";
import { alvo as alvoPeloPonteiro, useIsMobile, usePonteiroGrosso } from "@/hooks/use-mobile";
import { FS, FW, R, T, TOM } from "@/lib/theme";
import { Botao } from "@/components/ui/botao";
import { CabecalhoDaPagina } from "@/components/ui/cabecalho-da-pagina";
import { EstadoErro, Esqueleto } from "@/components/ui/estados";
import {
  COPIAS_MAX, ORDEM_DOS_TAMANHOS, TAMANHOS, cabeNoAdesivo, cabecalhoPadrao, comCopias, foiEditado, gravarPreferencias, lerPreferencias, limitarCopias,
  linhasOrdenadas, nomeDoPapel, numeroEditado, paginarLinhas, prefixoPara, regraDaPagina, rodapeDoTubo, temReaproveitamento, type LinhaDaEtiqueta, type TamanhoEtiqueta,
} from "@/lib/etiqueta-lista";
import {
  CSS_DA_ETIQUETA_EM_LISTA, CSS_DO_ZOOM, CampoNaEtiqueta, EtiquetaEmLista, EtiquetaReaproveitar, LegendaDaFolha, SecaoDeOpcoes, estiloDoCampo,
  estiloDoZoom, mmParaPx, useEscalaParaCaber,
} from "@/components/etiqueta-lista";

// `isReuse`/`reuseQty`: HOJE o GET /api/tubos/:id não devolve nenhum dos dois —
// ficam opcionais para o REAPROVEITAR ligar sozinho no dia em que a rota
// mandar; até lá vale o interruptor manual.
type Peca = { id: string; displayId: string | null; type: string; description: string | null; quantity: number; /** quanto da peça está NESTE tubo (a linha usa esta) */ quantidadeNoTubo?: number; conferida: boolean; isReuse?: boolean | null; reuseQty?: number | null };
type Resposta = {
  /** `fechadoEm`/`embaladoEm`: o "embalado dd/mm" do rodapé, quando a rota mandar. */
  tubo: { id: string; numero: number | null; avulso?: boolean | null; entregueEm: string | null; recebidoPor: string | null; fechadoEm?: string | null; embaladoEm?: string | null };
  evento: { id: string; name: string; truckDepartureDate: string | null; bookUrl?: string | null } | null;
  pecas: Peca[];
};

type Pagina = { tipo: "lista"; linhas: LinhaDaEtiqueta<Peca>[]; n: number; total: number } | { tipo: "reaproveitar" };

export default function EtiquetaTubo() {
  const [, params] = useRoute("/grafica/tubos/:id/etiqueta");
  const id = params?.id;
  const isMobile = useIsMobile();
  // Tablet do galpão (dedo, às vezes de luva) em qualquer largura: alvo de 44.
  const grosso = usePonteiroGrosso();
  const toque = isMobile || grosso;
  const { data, isLoading, isError, refetch } = useQuery<Resposta>({ queryKey: [`/api/tubos/${id}`], enabled: !!id });

  // PREFERÊNCIAS lembradas por navegador (o computador do galpão imprime
  // sempre no mesmo papel): lidas uma vez, gravadas a cada mudança.
  const [prefs, setPrefs] = useState(lerPreferencias);
  useEffect(() => { gravarPreferencias(prefs); }, [prefs]);
  const { mostrarQuantidade, tamanho, copias } = prefs;

  // REAPROVEITAR: null = "ainda não mexi" → segue o que as peças dizem. Não é
  // preferência lembrada: depende do TUBO, não do computador.
  const [reaproveitarManual, setReaproveitarManual] = useState<boolean | null>(null);
  const temReuso = useMemo(() => temReaproveitamento(data?.pecas ?? []), [data]);
  const reaproveitar = reaproveitarManual ?? temReuso;

  // O LOGO vem da capa do book do evento, como na etiqueta das peças. Sem book
  // (ou capa ilegível), o cabeçalho usa o texto de cima: o logo é enfeite,
  // não pré-requisito.
  const bookUrl = data?.evento?.bookUrl ?? null;
  const [logo, setLogo] = useState<string | null>(null);
  const [buscandoLogo, setBuscandoLogo] = useState(false);
  /** O mesmo interruptor das etiquetas do evento: ligado por padrão. */
  const [usarLogo, setUsarLogo] = useState(true);
  const logoNaEtiqueta = usarLogo ? logo : null;
  // Enquanto o logo é extraído, o Imprimir espera (como no evento): nada sai sem logo por pressa.
  const esperandoLogo = buscandoLogo && usarLogo;

  /**
   * NÚMEROS NA ETIQUETA (dono, 21/09): quantidade por peça e número do tubo,
   * SÓ para a impressão — estado local, nunca enviado ao servidor.
   */
  const [qtdEditada, setQtdEditada] = useState<Record<string, string>>({});
  const [tuboEditado, setTuboEditado] = useState<string | undefined>(undefined);
  const qtdOriginal = (p: Peca) => (Number(p.quantidadeNoTubo) > 0 ? Number(p.quantidadeNoTubo) : Number(p.quantity) || 1);
  const editarQtd = (id: string, bruto: string | undefined) => setQtdEditada((e) => {
    const n = { ...e };
    if (bruto === undefined) delete n[id]; else n[id] = bruto;
    return n;
  });
  useEffect(() => {
    let vivo = true;
    setLogo(null);
    if (!bookUrl) return;
    setBuscandoLogo(true);
    logoDaCapaDoBook(bookUrl).then((l) => { if (vivo) { setLogo(l); setBuscandoLogo(false); } });
    return () => { vivo = false; };
  }, [bookUrl]);

  // O CABEÇALHO: o padrão vem de `cabecalhoPadrao` (a mesma regra das etiquetas
  // do evento); os dois campos são editáveis — null = "não mexi".
  const [destaque, setDestaque] = useState<string | null>(null);
  const [textoDeCima, setTextoDeCima] = useState<string | null>(null);
  const nome = data?.evento?.name ?? "";
  const padrao = useMemo(() => cabecalhoPadrao(nome), [nome]);
  const gigante = (destaque ?? padrao.gigante).trim();
  const prefixo = (textoDeCima ?? (destaque === null ? padrao.prefixo : prefixoPara(nome, gigante))).trim();

  const saida = data?.evento?.truckDepartureDate
    ? new Date(data.evento.truckDepartureDate).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" })
    : null;

  // Embalada sozinha: sem tubo não há "TUBO N" para imprimir.
  const avulso = !!data && (data.tubo.avulso === true || data.tubo.numero == null || Number(data.tubo.numero) < 0);
  const numeroReal = avulso ? null : data?.tubo.numero ?? null;
  // O número que SAI na etiqueta (editável só para a impressão).
  const numero = numeroReal == null ? null : numeroEditado(tuboEditado, numeroReal);

  // AS PÁGINAS: a lista quebrada em etiquetas (+ REAPROVEITAR), o jogo inteiro
  // repetido pelas cópias. SEM subtítulo de tipo (dono, 21/09: "tirar grupo,
  // apenas nome do item"): na ordem do tipo e depois da descrição — a mesma
  // das listas do evento. A quantidade é a DESTE tubo, com a edição.
  const linhas = useMemo(() => linhasOrdenadas((data?.pecas ?? []).map((p) => {
    const noTubo = numeroEditado(qtdEditada[p.id], qtdOriginal(p));
    return { ...p, quantidadeNoTubo: noTubo, quantity: Math.max(Number(p.quantity) || 0, noTubo) };
  })), [data, qtdEditada]); // eslint-disable-line react-hooks/exhaustive-deps
  const unidades = linhas.reduce((s, l) => s + (Number(l.peca.quantidadeNoTubo) || 0), 0);
  // RODAPÉ discreto: "3 peças · 26 un. · embalado 21/09" (a data quando a rota mandar).
  const rodape = data && linhas.length > 0 ? rodapeDoTubo(linhas.length, unidades, data.tubo.fechadoEm ?? data.tubo.embaladoEm ?? null) : null;
  const jogo = useMemo<Pagina[]>(() => {
    if (!data) return [];
    const medidas = TAMANHOS[tamanho];
    const capacidade = (numero != null ? medidas.linhasComTubo : medidas.linhasSemTubo) - (rodape ? 1 : 0);
    const partes = paginarLinhas(linhas, { capacidade, letrasPorLinha: medidas.letrasPorLinha, mostrarQuantidade });
    // Tubo vazio ainda imprime a etiqueta (evento + TUBO N): dá para colar antes de encher.
    const listas: Pagina[] = (partes.length ? partes : [[]]).map((l, k, todas) => ({ tipo: "lista", linhas: l, n: k + 1, total: todas.length }));
    return reaproveitar ? [...listas, { tipo: "reaproveitar" }] : listas;
  }, [data, linhas, numero, tamanho, mostrarQuantidade, reaproveitar, rodape]);
  const paginas = useMemo(() => comCopias<Pagina>(jogo, copias), [jogo, copias]);
  const sugerirAdesivo = tamanho !== "adesivo" && cabeNoAdesivo(linhas, { comTubo: numero != null, comRodape: !!rodape, mostrarQuantidade });
  const algumaEdicao = Object.keys(qtdEditada).length > 0 || tuboEditado !== undefined;

  // O RESUMO, em linguagem de gente — o mesmo lugar e o mesmo tom do evento.
  const nListas = jogo.filter((p) => p.tipo === "lista").length;
  const papel = nomeDoPapel(tamanho);
  const resumo = data
    ? `Vai imprimir: ${paginas.length} ${paginas.length === 1 ? "etiqueta" : "etiquetas"} em ${papel}`
      + ` (${[nListas > 1 ? `lista em ${nListas} partes` : "a lista do tubo", reaproveitar ? "REAPROVEITAR" : null].filter(Boolean).join(" + ")}${copias > 1 ? `, ${copias} cópias` : ""})`
    : "";

  const { ref: refDaPrevia, escalaPara } = useEscalaParaCaber();
  const zoom = escalaPara(mmParaPx(TAMANHOS[tamanho].larguraMm));

  const folha = (destino: "tela" | "papel") => paginas.map((pg, i) => {
    const ultima = i === paginas.length - 1;
    // data-testid e legenda só na cópia da TELA: a do papel é a mesma árvore repetida.
    const tid = (s: string) => (destino === "tela" ? s : undefined);
    const etiqueta = pg.tipo === "reaproveitar" ? (
      <EtiquetaReaproveitar tamanho={tamanho} ultima={ultima} testid={tid(`etiqueta-reaproveitar-${i + 1}`)}
        rodape={[gigante || nome, numero != null ? `Tubo ${numero}` : null].filter(Boolean).join(" · ") || undefined} />
    ) : (
      <EtiquetaEmLista tamanho={tamanho} ultima={ultima} testid={tid(`etiqueta-tubo-${i + 1}`)}
        testidDaLinha={destino === "tela" ? `linha-tubo-${i + 1}` : undefined}
        logo={logoNaEtiqueta} prefixo={prefixo} gigante={gigante} saida={saida}
        tubo={numero} rodape={rodape}
        contador={pg.total > 1 ? `${numero != null ? `Tubo ${numero}` : "Lista"} · ${pg.n} de ${pg.total}` : null}
        linhas={pg.linhas} mostrarQuantidade={mostrarQuantidade} vazio="Este tubo está vazio." />
    );
    if (destino === "papel") return <div key={i}>{etiqueta}</div>;
    return (
      <div key={i}>
        <LegendaDaFolha testid={`legenda-etiqueta-${i + 1}`}>
          {papel} · {pg.tipo === "reaproveitar" ? "REAPROVEITAR" : pg.total > 1 ? `lista ${pg.n} de ${pg.total}` : "lista"} · etiqueta {i + 1} de {paginas.length}
        </LegendaDaFolha>
        <div className="etq-zoom" style={estiloDoZoom(zoom)}>{etiqueta}</div>
      </div>
    );
  });

  const alvo = alvoPeloPonteiro(34, toque);
  const campo = estiloDoCampo(toque);
  const fonteBase = isMobile ? FS.read : FS.body;
  const tamanhoDoBotao = toque ? "toque" : "sm";
  const rotuloDeCampo: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 3, fontSize: FS.meta, fontWeight: FW.medio, color: T.strong, minWidth: 0 };
  const linhaDeCaixa: React.CSSProperties = { display: "flex", alignItems: "center", gap: 9, minHeight: alvo, fontSize: fonteBase, color: T.text, cursor: "pointer" };
  const caixa: React.CSSProperties = { width: 18, height: 18, accentColor: T.accentText, flexShrink: 0, margin: 0 };
  const dica: React.CSSProperties = { margin: 0, fontSize: FS.meta, lineHeight: 1.45, color: T.apoio };
  const titulo = !data ? "Etiqueta do tubo" : numeroReal != null ? `Etiqueta do Tubo ${numeroReal}` : "Etiqueta da embalagem";
  const pronto = !!data && !esperandoLogo;
  // Por que o Imprimir está parado, ESCRITO embaixo dele (no toque não há title).
  const motivoDoImprimir = !data ? "Aguarde o tubo carregar." : esperandoLogo ? 'Extraindo o logo do book — segundos. Para imprimir sem ele, desligue "Logo do book".' : undefined;

  const blocoDeAcao = (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", justifyContent: isMobile ? "stretch" : "flex-end", flex: isMobile ? undefined : "1 1 360px", minWidth: 0 }}>
      {data && (
        <p data-testid="resumo-da-impressao" aria-live="polite" style={{ margin: 0, flex: "1 1 220px", minWidth: 0, textAlign: isMobile ? "left" : "right", fontSize: fonteBase, fontWeight: FW.forte, lineHeight: 1.35, color: T.text }}>
          {resumo}
        </p>
      )}
      {/* O embrulho segura a largura cheia no celular também quando o Botao
          vira coluna (botão + motivo). */}
      <div style={{ display: "flex", flexDirection: "column", flex: isMobile ? "1 1 100%" : undefined, minWidth: 0 }}>
        <Botao variante="primario" tamanho={toque ? "toque" : "md"} icone={Printer} larguraCheia={isMobile}
          onClick={() => { if (pronto) window.print(); }} disabled={!pronto} data-testid="imprimir-etiqueta-tubo" className="etq-foco"
          motivo={motivoDoImprimir} alinharMotivo={isMobile ? "start" : "end"}
          title={motivoDoImprimir ?? 'Abre a impressão (ou "Salvar como PDF").'}
          style={isMobile ? { minHeight: 48 } : undefined}>
          {esperandoLogo ? "Buscando o logo…" : "Imprimir etiqueta"}
        </Botao>
      </div>
    </div>
  );

  return (
    <div style={{ background: T.bg, minHeight: "100%" }}>
      {/* O `#fff` do @media print fica literal: é o papel, não a tela. */}
      <style>{`
        ${CSS_DA_ETIQUETA_EM_LISTA}
        ${CSS_DO_ZOOM}
        .etq-impressao { display: none; }
        .etq-foco:focus-visible, .etq-painel input:focus-visible, .etq-painel select:focus-visible { outline: 2px solid ${T.accentText}; outline-offset: 2px; }
        @media print {
          .etq-acao { display: none !important; }
          /* Só o portal sai: a casca inteira (e a prévia da tela) some. */
          body > *:not(.etq-impressao) { display: none !important; }
          .etq-impressao { display: block !important; }
          html, body { background: #fff !important; margin: 0 !important; padding: 0 !important; height: auto !important; overflow: visible !important; }
          ${regraDaPagina(tamanho)}
        }
      `}</style>

      <div className="etq-acao" data-testid="barra-da-etiqueta-do-tubo" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: isMobile ? "10px 12px" : "12px 18px", borderBottom: `1px solid ${T.border}`, backgroundColor: T.bg, position: "sticky", top: 0, zIndex: 5 }}>
        <Link href="/grafica" className="etq-foco" style={{ display: "inline-flex", alignItems: "center", gap: 6, minHeight: alvo, padding: "0 12px", borderRadius: R.md, border: `1px solid ${T.border}`, backgroundColor: T.surface, fontSize: FS.body, fontWeight: FW.medio, color: T.strong, textDecoration: "none" }}>
          <ArrowLeft aria-hidden="true" style={{ width: 14, height: 14 }} /> Fila da Gráfica
        </Link>
        {/* O CabecalhoDaPagina traz margem de baixo de página (20px); dentro da
            barra grudada ela só engordaria a barra — o -20 a devolve. */}
        <div style={{ minWidth: 0, flex: "1 1 200px", marginBottom: -20 }}>
          <CabecalhoDaPagina titulo={titulo} icone={Tag}
            subtitulo={data ? <span style={{ overflowWrap: "anywhere" }}>{nome || "Evento"} · {data.pecas.length} {data.pecas.length === 1 ? "peça" : "peças"}{saida ? ` · saída ${saida}` : ""}</span> : undefined} />
        </div>
        {!isMobile && blocoDeAcao}
      </div>

      {isLoading && (
        <div style={{ padding: isMobile ? 12 : 18 }}>
          <Esqueleto variante="lista" linhas={3} rotulo="Carregando o tubo" />
        </div>
      )}
      {isError && (
        <div style={{ padding: isMobile ? 12 : 18, maxWidth: 560, margin: "0 auto" }}>
          {/* O "Tentar de novo" é daqui, e não o do EstadoErro: o dele é de
              36px fixos, e no tablet do galpão o alvo é 44. */}
          <EstadoErro titulo="Não foi possível carregar o tubo." compacto />
          <div style={{ display: "flex", justifyContent: "center", marginTop: 12 }}>
            <Botao tamanho={toque ? "toque" : "md"} icone={RotateCw} className="etq-foco" onClick={() => refetch()}>Tentar de novo</Botao>
          </div>
        </div>
      )}

      {data && (
        <div style={{ display: isMobile ? "block" : "grid", gridTemplateColumns: isMobile ? undefined : "minmax(300px, 360px) minmax(0, 1fr)", alignItems: "start" }}>
          <aside className="etq-acao etq-painel" aria-label="Opções da etiqueta" data-testid="painel-de-opcoes"
            style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0, padding: isMobile ? "12px" : "14px 6px 24px 18px" }}>
            {avulso && (
              <p data-testid="aviso-embalada-sozinha" style={{ ...dica, padding: "10px 12px", border: `1px solid ${TOM.laranja.border}`, borderRadius: R.lg, backgroundColor: TOM.laranja.bg, color: TOM.laranja.text }}>
                Esta peça foi embalada sozinha, sem tubo: a etiqueta dela é a individual.{" "}
                {data.evento && <Link href={`/eventos/${data.evento.id}/etiquetas?de=grafica`} className="etq-foco" style={{ fontWeight: FW.forte, color: TOM.laranja.text }}>Abrir as etiquetas do evento</Link>}
              </p>
            )}
            <SecaoDeOpcoes titulo="Formato" testid="secao-formato">
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <label style={{ ...rotuloDeCampo, flex: "2 1 170px" }}>
                  Papel
                  <select value={tamanho} onChange={(e) => setPrefs((p) => ({ ...p, tamanho: e.target.value as TamanhoEtiqueta }))} data-testid="select-tamanho-etiqueta" className="etq-foco" style={campo}>
                    {ORDEM_DOS_TAMANHOS.map((t) => <option key={t} value={t}>{TAMANHOS[t].rotulo}</option>)}
                  </select>
                </label>
                <label style={{ ...rotuloDeCampo, flex: "1 1 80px" }} title="Quantas vezes o jogo de etiquetas sai — colam dos dois lados do tubo.">
                  Cópias
                  <select value={copias} onChange={(e) => setPrefs((p) => ({ ...p, copias: limitarCopias(e.target.value) }))} data-testid="select-copias-etiqueta" className="etq-foco" style={campo}>
                    {Array.from({ length: COPIAS_MAX }, (_, k) => k + 1).map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
              </div>
              {sugerirAdesivo && (
                <p data-testid="sugestao-adesivo" style={{ ...dica, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  A lista é curta e cabe inteira num adesivo 10×15.
                  <Botao tamanho={tamanhoDoBotao} className="etq-foco" data-testid="usar-adesivo" onClick={() => setPrefs((p) => ({ ...p, tamanho: "adesivo" }))}>Usar adesivo</Botao>
                </p>
              )}
              <label style={linhaDeCaixa} title='Ligado: "2x1 Ministério - 16". Desligado: só "2x1 Ministério".'>
                <input type="checkbox" checked={mostrarQuantidade} onChange={(e) => setPrefs((p) => ({ ...p, mostrarQuantidade: e.target.checked }))} data-testid="check-mostrar-quantidade" style={caixa} />
                Mostrar quantidade na linha
              </label>
              <label style={linhaDeCaixa} title="Sai uma etiqueta extra, do mesmo tamanho, com REAPROVEITAR em pé — para tubo com material de reuso.">
                <input type="checkbox" checked={reaproveitar} onChange={(e) => setReaproveitarManual(e.target.checked)} data-testid="check-reaproveitar" style={caixa} />
                Imprimir etiqueta REAPROVEITAR
              </label>
              {temReuso && reaproveitarManual === null && <p style={dica}>Ligado sozinho: há peça de reaproveitamento neste tubo.</p>}
              {(logo || buscandoLogo) && (
                <label style={linhaDeCaixa}>
                  <input type="checkbox" checked={usarLogo} onChange={(e) => setUsarLogo(e.target.checked)} data-testid="check-usar-logo" style={caixa} />
                  Logo do book no cabeçalho
                  {buscandoLogo && <span role="status" style={{ fontSize: FS.meta, color: T.apoio }}>· extraindo…</span>}
                </label>
              )}
            </SecaoDeOpcoes>

            {/* NÚMEROS NA ETIQUETA (dono, 21/09): editar o que SAI impresso —
                a quantidade de cada peça e o número do tubo. Nada vai ao servidor. */}
            {(numeroReal != null || data.pecas.length > 0) && (
              <SecaoDeOpcoes titulo="Números na etiqueta" testid="secao-numeros"
                ajuda="Só muda o que sai impresso — a peça não é alterada (nem status, nem quantidade).">
                {numeroReal != null && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", fontSize: FS.meta, fontWeight: FW.medio, color: T.strong }}>
                    <span>Número do tubo</span>
                    <CampoNaEtiqueta rotulo="Número do tubo na etiqueta" original={numeroReal} bruto={tuboEditado} aoMudar={setTuboEditado}
                      mobile={toque} editado={foiEditado(tuboEditado, numeroReal)} testid="tubo-na-etiqueta" />
                  </div>
                )}
                {data.pecas.length > 0 && (
                  <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 4, maxHeight: isMobile ? undefined : 260, overflowY: "auto" }}>
                    {data.pecas.map((p) => {
                      const original = qtdOriginal(p);
                      const editado = foiEditado(qtdEditada[p.id], original);
                      return (
                        <li key={p.id} style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", fontSize: FS.meta, fontWeight: FW.medio, color: T.strong }}>
                          <CampoNaEtiqueta rotulo={`Quantidade na etiqueta de ${p.description || p.type}`} original={original} bruto={qtdEditada[p.id]}
                            aoMudar={(v) => editarQtd(p.id, v)} mobile={toque} editado={editado} testid={`qtd-na-etiqueta-${p.id}`} />
                          <span style={{ flex: "1 1 120px", minWidth: 0, overflowWrap: "anywhere" }}>{p.description || p.type}</span>
                          {/* Fantasma e sublinhado: ação de apoio numa lista densa,
                              no laranja do campo editado a que ela se refere. */}
                          {editado && (
                            <Botao variante="fantasma" tamanho={tamanhoDoBotao} className="etq-foco" data-testid={`voltar-original-${p.id}`} onClick={() => editarQtd(p.id, undefined)}
                              style={{ padding: "0 4px", color: T.accentText, textDecoration: "underline" }}>
                              voltar ao original ({original})
                            </Botao>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
                {algumaEdicao && (
                  <Botao tamanho={tamanhoDoBotao} className="etq-foco" data-testid="restaurar-numeros" onClick={() => { setQtdEditada({}); setTuboEditado(undefined); }} style={{ alignSelf: "flex-start" }}>
                    Voltar todos ao original
                  </Botao>
                )}
              </SecaoDeOpcoes>
            )}

            <SecaoDeOpcoes titulo="Cabeçalho da etiqueta" testid="secao-cabecalho"
              ajuda={logoNaEtiqueta ? "O logo do book ocupa o lugar do texto de cima." : esperandoLogo ? "Extraindo o logo do book… o Imprimir espera por ele." : undefined}>
              <label style={rotuloDeCampo}>
                Texto de cima (pequeno)
                <input type="text" value={textoDeCima ?? prefixo} onChange={(e) => setTextoDeCima(e.target.value)} disabled={!!logoNaEtiqueta} data-testid="input-texto-de-cima" className="etq-foco" style={{ ...campo, opacity: logoNaEtiqueta ? 0.6 : 1 }} />
              </label>
              <label style={rotuloDeCampo}>
                Palavra gigante (lê-se de longe)
                <input type="text" value={destaque ?? padrao.gigante} onChange={(e) => setDestaque(e.target.value)} data-testid="input-destaque-tubo" className="etq-foco" style={campo} />
              </label>
              {(destaque !== null || textoDeCima !== null) && (
                <Botao tamanho={tamanhoDoBotao} className="etq-foco" data-testid="restaurar-cabecalho" onClick={() => { setDestaque(null); setTextoDeCima(null); }} style={{ alignSelf: "flex-start" }}>
                  Voltar ao nome do evento
                </Botao>
              )}
            </SecaoDeOpcoes>
          </aside>

          {/* A PRÉVIA: a etiqueta no tamanho real (mm), com zoom para caber — a
              página nunca ganha rolagem lateral, nem com A4 num celular. */}
          <div ref={refDaPrevia} className="folha-do-tubo" data-testid="folha-do-tubo" style={{ padding: isMobile ? "8px 12px 150px" : "18px 18px 48px", minWidth: 0, overflow: "hidden" }}>
            {folha("tela")}
          </div>
        </div>
      )}
      {data && typeof document !== "undefined" && createPortal(<div className="etq-impressao" aria-hidden="true">{folha("papel")}</div>, document.body)}

      {isMobile && data && (
        <div className="etq-acao" data-testid="rodape-de-acao" style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 6, backgroundColor: T.bg, borderTop: `1px solid ${T.border}`, padding: "10px 12px", paddingBottom: "calc(10px + env(safe-area-inset-bottom, 0px))" }}>
          {blocoDeAcao}
        </div>
      )}
    </div>
  );
}
