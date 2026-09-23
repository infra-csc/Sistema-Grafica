// ─────────────────────────────────────────────────────────────────────────────
// ETIQUETAS DO EVENTO — para colar no material depois da conferência.
//
// OBJETIVO: imprimir o que identifica o material no galpão, sem Corel. Quem
// usa é a Gráfica — no computador do galpão (ao lado da impressora) e no
// celular (para adiantar a seleção no meio das pilhas).
//
// O QUE SAI DAQUI, em dois formatos:
//  · ETIQUETA INDIVIDUAL (dono, 24/08, modelo do Circuito Vale): A4, DUAS por
//    folha com linha de corte no meio; nome do evento gigante (lê-se de longe
//    na pilha), a arte, o código + tipo, a descrição e a quantidade.
//  · LISTA (dono, 21/09 — é o adesivo que o galpão fazia no Corel): em pé, o
//    evento no topo e uma linha por peça ("2x1 Ministério - 16"), sem arte e
//    sem código. Decide-se POR TIPO o que vai em lista (2x1 é o padrão).
// O PDF é o do navegador (Imprimir → salvar como PDF).
//
// 22/09 — A TELA FOI REORGANIZADA. O dono abriu e achou "confusa": eram TRÊS
// faixas de chips parecidos com papéis diferentes (filtro por tipo × tipos em
// lista × seleção de peças), interruptores soltos na barra, e o evento
// "teste 3" virava "TESTE" + um "3" gigante. Agora há UMA leitura:
//   1 · O QUE IMPRIMIR   — as peças, com busca; o que está marcado é o que sai.
//                          O filtro por tipo só ESTREITA A VISTA (antes ele
//                          também mudava o que imprimia, e ninguém via isso).
//   2 · COMO SAI         — uma linha por tipo: Individual | Lista.
//   3 · FORMATO          — papel da lista, quantidade, cópias, orientação das
//                          individuais, uma por unidade, logo do book.
//   4 · CABEÇALHO        — texto de cima e PALAVRA GIGANTE, editáveis.
// E, colado ao botão, o RESUMO em linguagem de gente ("Vai imprimir: 2 listas
// em Adesivo 10×15 cm (34 peças) e 5 etiquetas individuais em A4 …"). No
// celular o painel vira a seção "Opções" e o resumo + Imprimir ficam no rodapé.
//
// DECISÕES QUE CONTINUAM VALENDO:
//  · Abre nas peças CONFERIDAS — a etiqueta nasce da conferência. Um
//    interruptor inclui as demais, para quem quiser adiantar a rotulagem.
//  · Uma peça por etiqueta individual como PADRÃO; "Uma por unidade" (25/08)
//    vai além: 6 lonas em 6 rolos = 6 etiquetas numeradas "n de 6".
//  · Ordem por código (compareDisplayId), a mesma das outras telas.
//  · A impressão FICA REGISTRADA (25/08): ao imprimir, as peças QUE SAÍRAM
//    ganham labelPrintedAt no servidor (+ linha na trilha). A próxima visita
//    abre com as já impressas desmarcadas. O registro informa, não bloqueia.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useRef, useState } from "react";
import { miniatura } from "@/lib/miniatura";
import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { Printer, ArrowLeft, Tags, SlidersHorizontal, Search, RotateCw, SearchX } from "lucide-react";
import { compareDisplayId } from "@/lib/displayId";
import { ehBookCompleto } from "@shared/fluxo-peca";
import { ehMolde } from "@shared/molde";
import { logoDaCapaDoBook } from "@/lib/logo-do-book";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { alvo as alvoPeloPonteiro, useIsMobile, usePonteiroGrosso } from "@/hooks/use-mobile";
import { FONT, FS, FW, N, R, SHADOW, T, TOM } from "@/lib/theme";
import { Botao } from "@/components/ui/botao";
import { CabecalhoDaPagina } from "@/components/ui/cabecalho-da-pagina";
import { EstadoErro, EstadoVazio, Esqueleto } from "@/components/ui/estados";
import { Selo } from "@/components/ui/selo";
import {
  COPIAS_MAX, ORDEM_DOS_TAMANHOS, SEM_EDICOES, TAMANHOS, cabeNoAdesivo, cabecalhoPadrao, chaveDoTubo, comCopias, comEdicoes, ehDoisPorUm,
  etiquetasIndividuais, foiEditado, gravarPreferencias, infoDoVolume, lerPreferencias, lerRecorteDeTubo, limitarCopias, linhasOrdenadas,
  paginarLinhas, parteNoRecorte, partesDaPeca, pecaNaLinha, prefixoPara, regraDaPagina, nomeDoPapel, resumoDaImpressao, rodapeDoTubo, semAcento,
  type EdicoesDaEtiqueta, type LinhaDaEtiqueta, type ParteDaPeca, type RecorteDeTubo, type TamanhoEtiqueta,
} from "@/lib/etiqueta-lista";
import {
  CSS_DA_ETIQUETA_EM_LISTA, CSS_DO_ZOOM, CampoNaEtiqueta, EtiquetaEmLista, LegendaDaFolha, SecaoDeOpcoes, Segmento, estiloDoCampo, estiloDoZoom,
  mmParaPx, useEscalaParaCaber,
} from "@/components/etiqueta-lista";

/** Conferida = já passou pela conferência (inclui as entregues e as grafias legadas). */
// `packed` (Embalado, 21/09): embalada é conferida — a etiqueta vale igual.
const CONFERIDA = new Set(["conferred", "conferido", "packed", "delivered", "entregue"]);
const jaConferida = (i: any) => CONFERIDA.has(i.status) || (i.conferredQty ?? 0) > 0;

const tipoDe = (p: any) => String(p?.type ?? "").trim();
const slug = (t: string) => t.toLowerCase().replace(/\s+/g, "-");

const dataBR = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" }) : null;

// labelPrintedAt é um INSTANTE (quando o botão foi clicado), não uma data de
// calendário como truckDepartureDate — por isso sem timeZone: "UTC": quem
// imprimiu 23h em São Paulo não pode ler "impressa amanhã" no selo.
const dataImpressao = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
const dataImpressaoExtenso = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** O sufixo estável de uma parte (testid): "tubo2", "embalada", "fora". */
const sufixoDaParte = (pt: ParteDaPeca<unknown>) => (pt.numero != null ? `tubo${pt.numero}` : pt.avulso ? "embalada" : "fora");

/** Uma folha de LISTA da prévia: a lista geral ou a de um tubo. */
type FolhaDeLista = {
  linhas: LinhaDaEtiqueta<any>[]; n: number; total: number;
  /** Tubo: o número REAL (testid) e o que sai na etiqueta (editável). */
  numeroReal: number | null; tubo: number | null; rodape: string | null;
};

/** A folha individual na tela, em px: A4 deitado e em pé (mesma proporção). */
const FOLHA_PAISAGEM_PX = 1050;
const FOLHA_RETRATO_PX = 707;

export default function EtiquetasEvento() {
  const [, params] = useRoute("/eventos/:id/etiquetas");
  const eventId = params?.id;
  const isMobile = useIsMobile();
  // Tablet do galpão (dedo, às vezes de luva) em qualquer largura: alvo de 44.
  const grosso = usePonteiroGrosso();
  const toque = isMobile || grosso;
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

  /** A VISTA da lista de peças: tipo + busca. Só estreitam o que se VÊ — o
   *  que imprime é o que está marcado. "Só as visíveis" faz a ponte ("só as
   *  lonas": filtra Lona → Só as visíveis). */
  const [filtroTipo, setFiltroTipo] = useState<string | null>(null);
  const [busca, setBusca] = useState("");

  /** UMA POR UNIDADE (25/08): 6 lonas em 6 rolos = 6 volumes, e etiqueta
   *  existe para identificar VOLUME. Desligado por padrão. */
  const [porUnidade, setPorUnidade] = useState(false);

  /** COMO SAI: os TIPOS que vão em lista. null = "não mexi" → os 2x1 (o padrão
   *  de sempre). Não é preferência lembrada: os tipos mudam de evento a evento. */
  const [tiposEmLista, setTiposEmLista] = useState<Set<string> | null>(null);
  /** Papel da lista, "mostrar quantidade" e cópias: lembrados por navegador, os
   *  mesmos da etiqueta do tubo (o galpão imprime sempre no mesmo papel). */
  const [prefs, setPrefs] = useState(lerPreferencias);
  useEffect(() => { gravarPreferencias(prefs); }, [prefs]);
  const { mostrarQuantidade, tamanho, copias } = prefs;
  /**
   * O QUE SAI nesta impressão. A lista pode ter papel diferente da etiqueta
   * individual (adesivo × A4): a impressora de adesivo não recebe A4 no mesmo
   * trabalho, então dá para mandar "só as listas" para uma e "só as etiquetas"
   * para a outra — e o registro de impressão acompanha o que saiu de fato.
   */
  const [oQueSai, setOQueSai] = useState<"tudo" | "etiquetas" | "listas">("tudo");

  /**
   * ORIENTAÇÃO das individuais: paisagem (folha deitada, tiras empilhadas) ou
   * retrato — a folha EM PÉ com o conteúdo deitado, que se lê virando a página.
   * O retrato é o template original do dono (circuito vale.pdf).
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
   * O CABEÇALHO. No modelo do dono o nome tem dois níveis: a marca pequena
   * ('Circuito Corrida Vale 2026') e a CIDADE enorme ('ITABIRA'). O padrão vem
   * de `cabecalhoPadrao` (que não deixa "teste 3" virar um "3" gigante) e os
   * DOIS campos são editáveis: null = "não mexi", segue o padrão.
   */
  const [destaque, setDestaque] = useState<string | null>(null);
  const [textoDeCima, setTextoDeCima] = useState<string | null>(null);

  /** No celular o painel de opções abre e fecha; no desktop está sempre à vista. */
  const [opcoesAbertas, setOpcoesAbertas] = useState(false);

  /**
   * O TUBO (dono, 21/09: "aparecer informação de tubo na etiqueta").
   *  · RECORTE "Tubo" em O que imprimir (todos · só as dos tubos · Tubo N · sem
   *    tubo), na URL (?tubo=2) — dá para mandar o link "etiquetas do tubo 2".
   *    Ao contrário da busca, ESTE recorte muda o que sai: é uma escolha de
   *    impressão, escrita no resumo.
   *  · LISTA POR TUBO em Como sai: null = "não mexi" → ligada quando o evento
   *    tem tubo (é o padrão para as peças embaladas em tubo).
   */
  const [recorteTubo, setRecorteTuboCru] = useState<RecorteDeTubo>(() => lerRecorteDeTubo(new URLSearchParams(window.location.search).get("tubo")));
  const setRecorteTubo = (r: RecorteDeTubo) => {
    setRecorteTuboCru(r);
    try {
      const u = new URL(window.location.href);
      if (r === "todos") u.searchParams.delete("tubo"); else u.searchParams.set("tubo", r);
      window.history.replaceState(window.history.state, "", `${u.pathname}${u.search}${u.hash}`);
    } catch { /* sem URL: o recorte vale só nesta visita */ }
  };
  const [porTuboEscolha, setPorTuboEscolha] = useState<boolean | null>(null);

  /**
   * NÚMEROS NA ETIQUETA (dono, 21/09: "opção de editar números na etiqueta —
   * não afeta nada de status"). Quantidade por parte e número por tubo, SÓ
   * para a impressão: estado local desta tela, nunca enviado ao servidor.
   */
  const [edicoes, setEdicoes] = useState<EdicoesDaEtiqueta>(SEM_EDICOES);
  const editarQuantidade = (chave: string, bruto: string | undefined) => setEdicoes((e) => {
    const quantidades = { ...e.quantidades };
    if (bruto === undefined) delete quantidades[chave]; else quantidades[chave] = bruto;
    return { ...e, quantidades };
  });
  const editarTubo = (chave: string, bruto: string | undefined) => setEdicoes((e) => {
    const tubos = { ...e.tubos };
    if (bruto === undefined) delete tubos[chave]; else tubos[chave] = bruto;
    return { ...e, tubos };
  });

  const { data: event, isError: eventoFalhou } = useQuery<any>({ queryKey: ["/api/events", eventId], enabled: !!eventId });
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

  const poolBase = useMemo(() => {
    // BOOK COMPLETO fica de fora: é o trâmite do Atendimento, não uma peça (ver shared/fluxo-peca).
    const vivas = (itens as any[]).filter((i) => !i.deletedAt && i.status !== "canceled" && i.status !== "archived" && !ehBookCompleto(i) && !ehMolde(i)); // molde não tem etiqueta (22/09)
    const base = incluirTodas ? vivas : vivas.filter(jaConferida);
    return [...base].sort((a, b) => compareDisplayId(a.displayId, b.displayId));
  }, [itens, incluirTodas]);

  // AS PARTES de cada peça (uma por volume + o resto fora de volume), já com
  // os números editados para a impressão.
  const partesPorPeca = useMemo(
    () => new Map<string, ParteDaPeca<any>[]>(poolBase.map((p) => [p.id, comEdicoes(partesDaPeca(p), edicoes)])),
    [poolBase, edicoes],
  );
  const partesDe = (p: any) => partesPorPeca.get(p.id) ?? [];
  // Os tubos do evento (pelo número REAL) e se há o que esteja fora deles.
  const tubosNoPool = useMemo(() => {
    const porNumero = new Map<number, { numero: number; tuboId: string | null; pecas: number }>();
    for (const partes of Array.from(partesPorPeca.values())) for (const pt of partes) {
      if (pt.numero == null) continue;
      const t = porNumero.get(pt.numero) ?? { numero: pt.numero, tuboId: pt.tuboId, pecas: 0 };
      t.pecas += 1;
      porNumero.set(pt.numero, t);
    }
    return Array.from(porNumero.values()).sort((a, b) => a.numero - b.numero);
  }, [partesPorPeca]);
  const haForaDeTubo = useMemo(() => Array.from(partesPorPeca.values()).some((ps) => ps.some((pt) => pt.numero == null)), [partesPorPeca]);
  // Recorte que aponta para o nada (tubo que não está no pool) cai para "todos".
  const recorteValido: RecorteDeTubo =
    recorteTubo === "todos" ? "todos"
      : recorteTubo === "tubos" ? (tubosNoPool.length > 0 ? "tubos" : "todos")
        : recorteTubo === "sem" ? (haForaDeTubo && tubosNoPool.length > 0 ? "sem" : "todos")
          : tubosNoPool.some((t) => t.numero === Number(recorteTubo)) ? recorteTubo : "todos";
  const noRecorte = (p: any) => partesDe(p).filter((pt) => parteNoRecorte(pt, recorteValido));
  const pool = useMemo(
    () => (recorteValido === "todos" ? poolBase : poolBase.filter((p) => (partesPorPeca.get(p.id) ?? []).some((pt) => parteNoRecorte(pt, recorteValido)))),
    [poolBase, partesPorPeca, recorteValido],
  );
  const porTubo = tubosNoPool.length > 0 && (porTuboEscolha ?? true);

  // O "embalado dd/mm" do rodapé da lista de tubo: o retrato dos tubos do
  // evento (o mesmo cache do painel de tubos). Só com tubo; falha = sem data.
  const temTubos = tubosNoPool.length > 0;
  const { data: retratoDosTubos } = useQuery<any>({ queryKey: [`/api/events/${eventId}/tubos`], enabled: !!eventId && temTubos, retry: false });
  const embaladoPorTubo = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const t of Array.isArray(retratoDosTubos?.tubos) ? retratoDosTubos.tubos : []) if (t?.id) m.set(t.id, t.fechadoEm ?? null);
    return m;
  }, [retratoDosTubos]);

  // Tipos do pool, com contagem — servem à vista (filtro) e ao "Como sai".
  const tiposNoPool = useMemo(() => {
    const conta = new Map<string, number>();
    for (const p of pool) { const t = tipoDe(p); if (t) conta.set(t, (conta.get(t) ?? 0) + 1); }
    return Array.from(conta.entries()).sort((a, b) => a[0].localeCompare(b[0], "pt-BR"));
  }, [pool]);
  // Se o tipo filtrado sumiu do pool (ex.: desligou "incluir todas"), o filtro
  // cai para "todos" sozinho — um filtro apontando para o nada esconderia tudo.
  const filtroValido = filtroTipo && tiposNoPool.some(([t]) => t === filtroTipo) ? filtroTipo : null;
  const visiveis = useMemo(() => {
    const q = semAcento(busca.trim());
    return pool.filter((p) =>
      (!filtroValido || tipoDe(p) === filtroValido) &&
      (!q || semAcento(`${p.description ?? ""} ${p.type ?? ""} ${p.displayId ?? ""}`).includes(q)));
  }, [pool, filtroValido, busca]);
  const vistaEstreita = visiveis.length !== pool.length;

  // O QUE IMPRIME: as MARCADAS do pool inteiro — a vista não interfere.
  const pecas = useMemo(() => pool.filter((p) => !desmarcadas.has(p.id)), [pool, desmarcadas]);

  const tiposEscolhidos = useMemo(
    () => tiposEmLista ?? new Set(tiposNoPool.map(([t]) => t).filter((t) => ehDoisPorUm({ type: t }))),
    [tiposEmLista, tiposNoPool],
  );
  // A unidade do que sai é a PARTE (peça × volume): uma peça dividida em dois
  // tubos pode ir para duas listas de tubo, ou virar duas etiquetas. Com a
  // lista por tubo ligada, a parte em tubo vai para a lista DO TUBO (qualquer
  // que seja o tipo); o resto segue a regra do tipo, como sempre.
  const partesMarcadas = useMemo(() => pecas.flatMap((p) => noRecorte(p)), [pecas, partesPorPeca, recorteValido]); // eslint-disable-line react-hooks/exhaustive-deps
  const destinoDa = (pt: ParteDaPeca<any>) => (porTubo && pt.numero != null ? "tubo" : tiposEscolhidos.has(tipoDe(pt.peca)) ? "lista" : "individual");
  const todasDeTubo = useMemo(() => partesMarcadas.filter((pt) => destinoDa(pt) === "tubo"), [partesMarcadas, porTubo, tiposEscolhidos]); // eslint-disable-line react-hooks/exhaustive-deps
  const todasAsDaLista = useMemo(() => partesMarcadas.filter((pt) => destinoDa(pt) === "lista"), [partesMarcadas, porTubo, tiposEscolhidos]); // eslint-disable-line react-hooks/exhaustive-deps
  const todasAsIndividuais = useMemo(() => partesMarcadas.filter((pt) => destinoDa(pt) === "individual"), [partesMarcadas, porTubo, tiposEscolhidos]); // eslint-disable-line react-hooks/exhaustive-deps
  const temLista = todasDeTubo.length + todasAsDaLista.length > 0;
  // "O que sai" só faz sentido com os DOIS na mesa; sem um deles, vale "tudo"
  // (senão um "só listas" esquecido esconderia as etiquetas da próxima seleção).
  const haOsDois = temLista && todasAsIndividuais.length > 0;
  const saiValido = haOsDois ? oQueSai : "tudo";
  const partesDeTubo = useMemo(() => (saiValido === "etiquetas" ? [] : todasDeTubo), [saiValido, todasDeTubo]);
  const partesDaLista = useMemo(() => (saiValido === "etiquetas" ? [] : todasAsDaLista), [saiValido, todasAsDaLista]);
  const partesIndividuais = useMemo(() => (saiValido === "listas" ? [] : todasAsIndividuais), [saiValido, todasAsIndividuais]);

  /** Junta as partes da mesma peça numa linha só ("2x1 BB - 10", ou "- 7 (7 de 10)"). */
  const emLinhas = (partes: ParteDaPeca<any>[]) => {
    const porPeca = new Map<string, ParteDaPeca<any>[]>();
    for (const pt of partes) porPeca.set(pt.peca.id, [...(porPeca.get(pt.peca.id) ?? []), pt]);
    return linhasOrdenadas(Array.from(porPeca.values()).map(pecaNaLinha));
  };
  const linhasDaLista = useMemo(() => emLinhas(partesDaLista), [partesDaLista]); // eslint-disable-line react-hooks/exhaustive-deps
  // UMA LISTA POR TUBO: cabeçalho "TUBO N" e rodapé "N peças · M un. ·
  // embalado dd/mm", como a etiqueta do tubo.
  const listasDosTubos = useMemo(() => {
    const porNumero = new Map<number, ParteDaPeca<any>[]>();
    for (const pt of partesDeTubo) porNumero.set(pt.numero!, [...(porNumero.get(pt.numero!) ?? []), pt]);
    return Array.from(porNumero.entries()).sort((a, b) => a[0] - b[0]).map(([numeroReal, partes]) => {
      const linhas = emLinhas(partes);
      const unidades = partes.reduce((s, pt) => s + pt.quantidade, 0);
      return {
        numeroReal, tubo: partes[0].numeroNaEtiqueta ?? numeroReal, linhas,
        rodape: rodapeDoTubo(linhas.length, unidades, partes[0].tuboId ? embaladoPorTubo.get(partes[0].tuboId) : null),
      };
    });
  }, [partesDeTubo, embaladoPorTubo]); // eslint-disable-line react-hooks/exhaustive-deps
  const { paginasDaLista, jogoDeListas } = useMemo(() => {
    const m = TAMANHOS[tamanho];
    const jogo: FolhaDeLista[] = [];
    for (const t of listasDosTubos) {
      const pags = paginarLinhas(t.linhas, { capacidade: m.linhasComTubo - 1, letrasPorLinha: m.letrasPorLinha, mostrarQuantidade });
      pags.forEach((linhas, k) => jogo.push({ linhas, n: k + 1, total: pags.length, numeroReal: t.numeroReal, tubo: t.tubo, rodape: t.rodape }));
    }
    const gerais = paginarLinhas(linhasDaLista, { capacidade: m.linhasSemTubo, letrasPorLinha: m.letrasPorLinha, mostrarQuantidade });
    gerais.forEach((linhas, k) => jogo.push({ linhas, n: k + 1, total: gerais.length, numeroReal: null, tubo: null, rodape: null }));
    // Cópias: o jogo inteiro repetido (1,2,1,2) — colam dos dois lados do volume.
    return { paginasDaLista: comCopias(jogo, copias), jogoDeListas: jogo.length };
  }, [listasDosTubos, linhasDaLista, tamanho, mostrarQuantidade, copias]);
  const sugerirAdesivo = tamanho !== "adesivo" && jogoDeListas > 0
    && (linhasDaLista.length === 0 || cabeNoAdesivo(linhasDaLista, { comTubo: false, mostrarQuantidade }))
    && listasDosTubos.every((t) => cabeNoAdesivo(t.linhas, { comTubo: true, comRodape: true, mostrarQuantidade }));

  /** As ETIQUETAS individuais: uma por parte (peça dividida em dois tubos =
   *  duas etiquetas), ou uma por UNIDADE ("3 de 6") com o interruptor ligado —
   *  cada unidade com o tubo da sua faixa. Peça de 1 unidade não numera. */
  const etiquetas = useMemo(() => etiquetasIndividuais(partesIndividuais, porUnidade), [partesIndividuais, porUnidade]);
  // Cada lista é uma folha INTEIRA do tamanho escolhido: as duas contas somam.
  const folhasIndividuais = Math.ceil(etiquetas.length / 2);
  const folhas = folhasIndividuais + paginasDaLista.length;
  const paginasDeTubo = paginasDaLista.filter((pg) => pg.numeroReal != null).length;
  const resumo = resumoDaImpressao({
    etiquetas: etiquetas.length, folhasIndividuais, listas: paginasDaLista.length - paginasDeTubo, pecasEmLista: linhasDaLista.length, tamanho,
    listasDeTubo: paginasDeTubo, tubos: listasDosTubos.map((t) => t.tubo), pecasEmTubos: listasDosTubos.reduce((s, t) => s + t.linhas.length, 0),
  });

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
  const padrao = useMemo(() => cabecalhoPadrao(nome), [nome]);
  const gigante = (destaque ?? padrao.gigante).trim();
  // Texto de cima: o que a pessoa digitou; senão, o nome SEM a gigante.
  const prefixo = (textoDeCima ?? (destaque === null ? padrao.prefixo : prefixoPara(nome, gigante))).trim();
  const cabecalhoEditado = destaque !== null || textoDeCima !== null;

  const { ref: refDaPrevia, escalaPara } = useEscalaParaCaber();

  // POR QUE NÃO DÁ PARA IMPRIMIR — dito na tela, não só no title do botão.
  const esperandoLogo = buscandoLogo && usarLogo;
  const motivoParado = esperandoLogo
    ? 'Extraindo o logo do book — segundos. Para imprimir sem ele, desligue "Logo do book" em Formato.'
    : folhas === 0
      ? (pool.length === 0 ? "Não há peças para etiquetar." : "Marque ao menos uma peça em “O que imprimir”.")
      : null;

  // REGISTRO DA IMPRESSÃO (25/08): ao disparar o print, as peças da folha
  // ganham a data no servidor (labelPrintedAt + linha na trilha). Sem await
  // antes do window.print() — a impressão não espera a rede, e se o registro
  // falhar a folha sai do mesmo jeito: o registro informa, não bloqueia.
  const imprimir = () => {
    if (motivoParado) return;
    // Todas as que SAÍRAM — em lista, lista de tubo ou individuais; o que "O
    // que sai" deixou de fora desta vez não ganha o selo de impressa. Só os
    // ids: os números editados para a etiqueta NUNCA vão ao servidor.
    const ids = Array.from(new Set<string>([...partesIndividuais, ...partesDaLista, ...partesDeTubo].map((pt) => pt.peca.id)));
    if (ids.length > 0) {
      apiRequest("POST", "/api/items/labels-printed", { itemIds: ids })
        .then(() => queryClient.invalidateQueries({ queryKey: ["/api/items", eventId] }))
        .catch(() => { /* sem registro desta vez; a folha já saiu */ });
    }
    window.print();
  };

  // ATALHO "Imprimir etiquetas de todos os tubos": recorte nos tubos, uma lista
  // por tubo, todas marcadas — e imprime depois que a tela redesenhar com isso.
  // O logo é o MESMO do evento (uma extração só), e o atalho espera por ele.
  const [imprimirAoRedesenhar, setImprimirAoRedesenhar] = useState(false);
  const imprimirTodosOsTubos = () => {
    setRecorteTubo("tubos"); setPorTuboEscolha(true); setOQueSai("tudo"); setDesmarcadas(new Set());
    setImprimirAoRedesenhar(true);
  };
  useEffect(() => {
    if (!imprimirAoRedesenhar) return;
    setImprimirAoRedesenhar(false);
    imprimir();
  }, [imprimirAoRedesenhar]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading) {
    return (
      <div style={{ padding: isMobile ? 12 : 24 }}>
        <Esqueleto variante="lista" linhas={4} rotulo="Montando as etiquetas" />
      </div>
    );
  }

  // Falha de rede NÃO pode virar "evento sem peças" — mentiria justamente
  // para quem está com a impressora esperando.
  if (itensFalharam || eventoFalhou) {
    return (
      <div style={{ padding: isMobile ? 12 : 24, maxWidth: 560, margin: "0 auto" }}>
        {/* O role="alert" vem do próprio EstadoErro. O "Tentar de novo" é
            daqui: o do EstadoErro tem 36px fixos, e no tablet o alvo é 44. */}
        <div data-testid="etiquetas-erro">
          <EstadoErro titulo="Não foi possível carregar as peças do evento." compacto />
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", marginTop: 12 }}>
          <Botao tamanho="toque" icone={RotateCw} className="etq-foco" onClick={() => refetch()}>
            Tentar de novo
          </Botao>
          <Link href={voltarHref} className="etq-foco" style={{ display: "inline-flex", alignItems: "center", gap: 6, minHeight: 44, padding: "0 12px", borderRadius: R.md, color: T.strong, fontSize: FS.body, fontWeight: FW.medio, textDecoration: "none" }}>
            <ArrowLeft aria-hidden="true" style={{ width: 14, height: 14 }} /> {veioDaGrafica ? "Voltar à Gráfica" : "Voltar ao evento"}
          </Link>
        </div>
      </div>
    );
  }

  const alvo = alvoPeloPonteiro(34, toque);
  const campo = estiloDoCampo(toque);
  const fonteBase = isMobile ? FS.read : FS.body;
  const tamanhoDoBotao = toque ? "toque" : "sm";
  const linhaDeCaixa: React.CSSProperties = { display: "flex", alignItems: "center", gap: 9, minHeight: alvo, fontSize: fonteBase, color: T.text, cursor: "pointer" };
  const caixa: React.CSSProperties = { width: 18, height: 18, accentColor: T.accentText, flexShrink: 0, margin: 0 };
  const dica: React.CSSProperties = { margin: 0, fontSize: FS.meta, lineHeight: 1.45, color: T.apoio };
  const rotuloDeCampo: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 3, fontSize: FS.meta, fontWeight: FW.medio, color: T.strong };
  // Subtítulo dentro de uma seção ("Listas", "Etiquetas individuais").
  const subtituloDeSecao: React.CSSProperties = { margin: 0, fontSize: FS.meta, fontWeight: FW.forte, color: T.strong };
  const alternar = (id: string) => setDesmarcadas((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const marcarTipo = (t: string, emLista: boolean) => { const novo = new Set(tiposEscolhidos); if (emLista) novo.add(t); else novo.delete(t); setTiposEmLista(novo); };
  const marcadasVisiveis = visiveis.filter((p) => !desmarcadas.has(p.id)).length;

  // ── O BLOCO DE AÇÃO: resumo + "o que sai" + Imprimir. No desktop mora na
  // barra de cima; no celular, no rodapé fixo (o polegar alcança). ──
  const blocoDeAcao = (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", justifyContent: isMobile ? "stretch" : "flex-end", flex: isMobile ? undefined : "1 1 420px", minWidth: 0 }}>
      <div style={{ flex: "1 1 240px", minWidth: 0, textAlign: isMobile ? "left" : "right" }}>
        <p data-testid="resumo-da-impressao" aria-live="polite" style={{ margin: 0, fontSize: fonteBase, fontWeight: FW.forte, lineHeight: 1.35, color: T.text }}>
          {resumo.texto}
        </p>
        {motivoParado ? (
          <p data-testid="motivo-parado" role="status" style={dica}>{motivoParado}</p>
        ) : resumo.impressoesSeparadas && saiValido === "tudo" ? (
          <p data-testid="aviso-papeis-diferentes" style={dica}>
            Lista e etiqueta usam papéis diferentes: escolha “Só listas”, imprima no adesivo, e depois “Só etiquetas” na A4.
          </p>
        ) : null}
      </div>
      {haOsDois && (
        <Segmento rotulo="O que sai nesta impressão" testid="o-que-sai" alvo={alvo} valor={saiValido} aoMudar={setOQueSai} esticar={isMobile}
          opcoes={[["tudo", "Tudo"], ["etiquetas", "Só etiquetas"], ["listas", "Só listas"]] as const} />
      )}
      {/* O motivo de o botão estar parado já está ESCRITO logo acima
          (motivo-parado) — por isso sem `motivo` aqui, para não dizer duas vezes. */}
      <Botao variante="primario" tamanho={toque ? "toque" : "md"} icone={Printer} onClick={imprimir} data-testid="button-imprimir-etiquetas" className="etq-foco"
        disabled={!!motivoParado}
        // O clique também REGISTRA a impressão (o selo "impressa dd/mm" das
        // peças) — dizer isso evita a dúvida de por que o selo apareceu.
        title={motivoParado ?? 'Abre a impressão (ou "Salvar como PDF") e marca as peças que saíram como impressas hoje.'}
        // No rodapé do celular: largura cheia e 48px (a ação da tela, no polegar).
        style={isMobile ? { minHeight: 48, flex: "1 1 100%" } : undefined}>
        {esperandoLogo ? "Buscando o logo…" : "Imprimir / PDF"}
      </Botao>
    </div>
  );

  // ── O PAINEL DE OPÇÕES: as quatro seções, na ordem em que se decide. ──
  const painel = (
    <div id="etq-painel" data-testid="painel-de-opcoes" style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
      <SecaoDeOpcoes titulo="1 · O que imprimir" testid="secao-o-que-imprimir">
        <p data-testid="contagem-marcadas" aria-live="polite" style={{ margin: 0, fontSize: fonteBase, fontWeight: FW.forte, color: T.text }}>
          {pecas.length} de {pool.length} {pool.length === 1 ? "peça marcada" : "peças marcadas"}
          {vistaEstreita && <span style={{ fontWeight: FW.medio, color: T.apoio }}> · mostrando {visiveis.length}</span>}
        </p>
        <label style={linhaDeCaixa}>
          <input type="checkbox" checked={incluirTodas} onChange={(e) => setIncluirTodas(e.target.checked)} data-testid="check-incluir-todas" style={caixa} />
          Incluir as não conferidas
        </label>
        {/* TUBO: recorte de impressão (na URL) + o atalho de todos os tubos. */}
        {tubosNoPool.length > 0 && (
          <div data-testid="recorte-de-tubo" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
            <label style={{ ...rotuloDeCampo, flex: "1 1 150px", minWidth: 0 }}>
              Tubo
              <select value={recorteValido} onChange={(e) => setRecorteTubo(e.target.value as RecorteDeTubo)} data-testid="select-tubo" className="etq-foco" style={campo}>
                <option value="todos">Todos</option>
                <option value="tubos">Só as dos tubos</option>
                {tubosNoPool.map((t) => <option key={t.numero} value={String(t.numero)}>Tubo {t.numero} ({t.pecas} {t.pecas === 1 ? "peça" : "peças"})</option>)}
                {haForaDeTubo && <option value="sem">Sem tubo</option>}
              </select>
            </label>
            {/* Secundário com borda escura: é um atalho de impressão (a ação
                principal da tela mora no bloco do Imprimir), mas não se perde
                entre os botões leves do painel. */}
            <div style={{ display: "flex", flexDirection: "column", flex: "1 1 180px", minWidth: 0 }}>
              <Botao tamanho={tamanhoDoBotao} icone={Printer} larguraCheia className="etq-foco" data-testid="imprimir-todos-os-tubos" onClick={imprimirTodosOsTubos} disabled={esperandoLogo}
                motivo={esperandoLogo ? "Extraindo o logo do book — segundos." : undefined}
                title={esperandoLogo ? "Extraindo o logo do book — segundos." : "Marca as peças dos tubos, faz uma lista por tubo e abre a impressão."}
                style={{ border: `1px solid ${T.text}`, color: T.text, whiteSpace: "normal" }}>
                {esperandoLogo ? "Buscando o logo…" : "Imprimir etiquetas de todos os tubos"}
              </Botao>
            </div>
          </div>
        )}
        {pool.length > 0 && (
          <>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <label style={{ position: "relative", flex: "1 1 160px", minWidth: 0, display: "block" }}>
                <span className="sr-only">Buscar peça por descrição, tipo ou código</span>
                <Search aria-hidden="true" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", width: 14, height: 14, color: T.second }} />
                <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar peça…" data-testid="busca-peca"
                  className="etq-foco" style={{ ...campo, width: "100%", paddingLeft: 30 }} />
              </label>
              {tiposNoPool.length > 1 && (
                <select value={filtroValido ?? ""} onChange={(e) => setFiltroTipo(e.target.value || null)} data-testid="select-filtro-tipo"
                  aria-label="Mostrar só um tipo de peça" className="etq-foco" style={{ ...campo, flex: "1 1 140px" }}>
                  <option value="">Todos os tipos</option>
                  {tiposNoPool.map(([t, n]) => <option key={t} value={t}>{t} ({n})</option>)}
                </select>
              )}
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <Botao tamanho={tamanhoDoBotao} data-testid="selecao-todas" className="etq-foco" onClick={() => setDesmarcadas(new Set())}>Todas</Botao>
              <Botao tamanho={tamanhoDoBotao} data-testid="selecao-nenhuma" className="etq-foco" onClick={() => setDesmarcadas(new Set(pool.map((p) => p.id)))}>Nenhuma</Botao>
              {vistaEstreita && visiveis.length > 0 && (
                <Botao tamanho={tamanhoDoBotao} data-testid="selecao-so-visiveis" className="etq-foco" title="Marca as peças que a busca/filtro está mostrando e desmarca todas as outras."
                  onClick={() => { const ver = new Set(visiveis.map((p) => p.id)); setDesmarcadas(new Set(pool.filter((p) => !ver.has(p.id)).map((p) => p.id))); }}>
                  Só as {visiveis.length} visíveis
                </Botao>
              )}
              {/* Refaz a seleção de abertura a qualquer momento: só o que ainda não
                  saiu na impressora. Aparece apenas quando há impressa E pendente. */}
              {impressasNoPool > 0 && faltamNoPool > 0 && (
                // Na tinta laranja: é o atalho que a segunda visita procura.
                <Botao tamanho={tamanhoDoBotao} data-testid="selecao-so-novas" className="etq-foco"
                  onClick={() => setDesmarcadas(new Set(pool.filter((p) => p.labelPrintedAt).map((p) => p.id)))}
                  style={{ border: `1px solid ${TOM.laranja.border}`, backgroundColor: TOM.laranja.bg, color: TOM.laranja.text }}>
                  Só as {faltamNoPool} que faltam
                </Botao>
              )}
            </div>
            {/* Escolhe-se pela DESCRIÇÃO (é ela que manda na etiqueta); o código
                fica pequeno. Lista com rolagem própria: 200 peças não empurram
                o resto do painel para fora da tela. */}
            <ul data-testid="lista-de-pecas" aria-label="Peças do evento" style={{ listStyle: "none", margin: 0, padding: 0, maxHeight: isMobile ? 300 : 280, overflowY: "auto", border: `1px solid ${T.border}`, borderRadius: R.md }}>
              {visiveis.length === 0 && (
                <li data-testid="busca-sem-resultado" style={{ padding: 8 }}>
                  <EstadoVazio compacto icone={SearchX} titulo="Nenhuma peça com esse filtro"
                    acao={<Botao tamanho={tamanhoDoBotao} className="etq-foco" onClick={() => { setBusca(""); setFiltroTipo(null); }}>Limpar a busca</Botao>} />
                </li>
              )}
              {visiveis.map((p, i) => {
                const marcada = !desmarcadas.has(p.id);
                const partes = noRecorte(p);
                const volumes = partesDe(p).filter((pt) => pt.numero != null || pt.avulso);
                return (
                  <li key={p.id} style={{ borderTop: i > 0 ? `1px solid ${N.n3}` : "none", contentVisibility: "auto", containIntrinsicSize: "auto 48px" } as React.CSSProperties}>
                    <label style={{ display: "flex", alignItems: "center", gap: 10, minHeight: Math.max(alvo, 44), padding: "5px 10px", cursor: "pointer", backgroundColor: marcada ? TOM.laranja.bg : T.surface }}
                      title={p.labelPrintedAt ? `Etiqueta impressa em ${dataImpressaoExtenso(p.labelPrintedAt)}` : undefined}>
                      <input type="checkbox" checked={marcada} onChange={() => alternar(p.id)} data-testid={`selecao-peca-${p.id}`} style={caixa} />
                      <span style={{ minWidth: 0, flex: 1 }}>
                        <span style={{ display: "block", fontSize: fonteBase, fontWeight: FW.medio, color: T.text, overflowWrap: "anywhere", lineHeight: 1.25 }}>
                          {p.description || p.type}
                        </span>
                        <span style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", fontSize: FS.meta, fontWeight: FW.forte, color: T.apoio }}>
                          <span style={{ fontFamily: FONT.mono }}>{p.displayId}</span>
                          <span style={{ fontWeight: FW.medio }}>{p.type} · {tiposEscolhidos.has(tipoDe(p)) ? "lista" : "individual"}</span>
                          {volumes.length > 0 && (
                            <span data-testid={`volumes-${p.id}`} style={{ fontWeight: FW.forte, color: T.strong }}>
                              {volumes.map((pt) => (pt.numero != null ? `Tubo ${pt.numero} (${pt.original})` : "embalada")).join(" · ")}
                            </span>
                          )}
                          {p.labelPrintedAt && (
                            <Selo tom="neutro" forma="retangulo" data-testid={`selo-impressa-${p.id}`} style={{ padding: "1px 6px" }}>
                              impressa {dataImpressao(p.labelPrintedAt)}
                            </Selo>
                          )}
                        </span>
                      </span>
                    </label>
                    {/* NÚMEROS NA ETIQUETA: um campo por parte (peça × volume), com
                        o número do tubo quando há tubo. Só a impressão muda. */}
                    {marcada && partes.length > 0 && (
                      <div data-testid={`numeros-${p.id}`} style={{ display: "flex", flexDirection: "column", gap: 4, padding: "0 10px 8px 38px", backgroundColor: TOM.laranja.bg }}>
                        {partes.map((pt) => {
                          const sufixo = sufixoDaParte(pt);
                          const brutoQtd = edicoes.quantidades[pt.chave];
                          const brutoTubo = pt.numero != null ? edicoes.tubos[chaveDoTubo(pt)] : undefined;
                          const qtdEditada = foiEditado(brutoQtd, pt.original);
                          const tuboEditado = pt.numero != null && foiEditado(brutoTubo, pt.numero);
                          return (
                            <div key={pt.chave} style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", fontSize: FS.meta, fontWeight: FW.medio, color: T.apoio }}>
                              {pt.numero != null ? (
                                <>
                                  <span>Tubo</span>
                                  <CampoNaEtiqueta rotulo={`Número do tubo na etiqueta (vale para todo o Tubo ${pt.numero})`} original={pt.numero} bruto={brutoTubo}
                                    aoMudar={(v) => editarTubo(chaveDoTubo(pt), v)} mobile={toque} editado={tuboEditado} testid={`tubo-na-etiqueta-${p.id}-${sufixo}`} />
                                </>
                              ) : pt.avulso ? <span>Embalada ·</span> : partes.length > 1 || volumes.length > 0 ? <span>Fora de tubo ·</span> : null}
                              <CampoNaEtiqueta rotulo={`Quantidade na etiqueta de ${p.description || p.type}${pt.numero != null ? ` no Tubo ${pt.numero}` : ""}`} original={pt.original} bruto={brutoQtd}
                                aoMudar={(v) => editarQuantidade(pt.chave, v)} mobile={toque} editado={qtdEditada} testid={`qtd-na-etiqueta-${p.id}-${sufixo}`} />
                              <span>un. na etiqueta</span>
                              {(qtdEditada || tuboEditado) && (
                                <Botao variante="fantasma" tamanho={tamanhoDoBotao} className="etq-foco" data-testid={`voltar-original-${p.id}-${sufixo}`}
                                  onClick={() => { editarQuantidade(pt.chave, undefined); if (pt.numero != null) editarTubo(chaveDoTubo(pt), undefined); }}
                                  style={{ padding: "0 4px", color: T.accentText, textDecoration: "underline", whiteSpace: "normal" }}>
                                  voltar ao original ({pt.numero != null && tuboEditado ? `Tubo ${pt.numero}, ` : ""}{pt.original})
                                </Botao>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            {pecas.length > 0 && (
              <p data-testid="aviso-numeros-so-impressao" style={{ ...dica, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span>
                  <strong style={{ color: T.strong }}>Números “na etiqueta”:</strong> só muda o que sai impresso — a peça não é alterada (nem status, nem quantidade).
                </span>
                {(Object.keys(edicoes.quantidades).length > 0 || Object.keys(edicoes.tubos).length > 0) && (
                  <Botao tamanho={tamanhoDoBotao} className="etq-foco" data-testid="restaurar-numeros" onClick={() => setEdicoes(SEM_EDICOES)}>
                    Voltar todos ao original
                  </Botao>
                )}
              </p>
            )}
            {vistaEstreita && marcadasVisiveis !== pecas.length && (
              <p data-testid="aviso-marcadas-fora-da-vista" style={dica}>
                {pecas.length - marcadasVisiveis} {pecas.length - marcadasVisiveis === 1 ? "peça marcada está" : "peças marcadas estão"} fora da busca — e também {pecas.length - marcadasVisiveis === 1 ? "sai" : "saem"} na impressão.
              </p>
            )}
          </>
        )}
      </SecaoDeOpcoes>

      {tiposNoPool.length > 0 && (
        <SecaoDeOpcoes titulo="2 · Como sai" testid="secao-como-sai"
          ajuda="Individual: uma etiqueta grande por peça, com a arte. Lista: várias peças num adesivo, uma linha cada — como o galpão cola no tubo.">
          {tubosNoPool.length > 0 && (
            <div data-testid="como-sai-tubos" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap", paddingBottom: 8, borderBottom: `1px solid ${N.n3}` }}>
              <span style={{ fontSize: fonteBase, fontWeight: FW.forte, color: T.text, flex: "1 1 120px", minWidth: 0 }}>
                Peças em tubo <span style={{ display: "block", fontSize: FS.meta, fontWeight: FW.medio, color: T.apoio }}>{porTubo ? "Uma lista por tubo, com “TUBO N”. As demais seguem o tipo." : "Seguem o tipo, com o tubo escrito na etiqueta."}</span>
              </span>
              <Segmento rotulo="Como saem as peças embaladas em tubo" testid="por-tubo" alvo={alvo} valor={porTubo ? "tubo" : "tipo"}
                aoMudar={(v) => setPorTuboEscolha(v === "tubo")} opcoes={[["tubo", "Lista por tubo"], ["tipo", "Pelo tipo"]] as const} />
            </div>
          )}
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
            {tiposNoPool.map(([t, n]) => (
              <li key={t} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: fonteBase, fontWeight: FW.forte, color: T.text, overflowWrap: "anywhere", minWidth: 0, flex: "1 1 120px" }}>
                  {t} <span style={{ fontWeight: FW.medio, color: T.apoio }}>· {n} {n === 1 ? "peça" : "peças"}</span>
                </span>
                <Segmento rotulo={`Como sai o tipo ${t}`} testid={`como-sai-${slug(t)}`} alvo={alvo} valor={tiposEscolhidos.has(t) ? "lista" : "individual"}
                  aoMudar={(v) => marcarTipo(t, v === "lista")} opcoes={[["individual", "Individual"], ["lista", "Lista"]] as const} />
              </li>
            ))}
          </ul>
          {tiposNoPool.length > 1 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <Botao tamanho={tamanhoDoBotao} className="etq-foco" data-testid="como-sai-tudo-lista" onClick={() => setTiposEmLista(new Set(tiposNoPool.map(([t]) => t)))}>Tudo em lista</Botao>
              <Botao tamanho={tamanhoDoBotao} className="etq-foco" data-testid="como-sai-tudo-individual" onClick={() => setTiposEmLista(new Set())}>Tudo individual</Botao>
              {tiposEmLista !== null && (
                <Botao tamanho={tamanhoDoBotao} className="etq-foco" data-testid="como-sai-padrao" title="Volta ao padrão: só o 2x1 em lista." onClick={() => setTiposEmLista(null)}>Padrão</Botao>
              )}
            </div>
          )}
        </SecaoDeOpcoes>
      )}

      <SecaoDeOpcoes titulo="3 · Formato" testid="secao-formato">
        {temLista && (
          <div data-testid="formato-da-lista" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <p style={subtituloDeSecao}>Listas</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <label style={{ ...rotuloDeCampo, flex: "2 1 170px", minWidth: 0 }}>
                Papel da lista
                <select value={tamanho} onChange={(e) => setPrefs((p) => ({ ...p, tamanho: e.target.value as TamanhoEtiqueta }))} data-testid="select-tamanho-lista" className="etq-foco" style={campo}>
                  {ORDEM_DOS_TAMANHOS.map((t) => <option key={t} value={t}>{TAMANHOS[t].rotulo}</option>)}
                </select>
              </label>
              <label title="Quantas vezes cada lista sai — colam dos dois lados do volume." style={{ ...rotuloDeCampo, flex: "1 1 80px", minWidth: 0 }}>
                Cópias
                <select value={copias} onChange={(e) => setPrefs((p) => ({ ...p, copias: limitarCopias(e.target.value) }))} data-testid="select-copias-lista" className="etq-foco" style={campo}>
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
          </div>
        )}
        {todasAsIndividuais.length > 0 && (
          <div data-testid="formato-das-individuais" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <p style={subtituloDeSecao}>Etiquetas individuais · A4, duas por folha</p>
            {/* Orientação só existe para a individual — a lista é sempre em pé. */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: FS.meta, fontWeight: FW.medio, color: T.strong }}>
              Folha
              <Segmento rotulo="Orientação da folha das etiquetas individuais" testid="orientacao" alvo={alvo} valor={orientacao} aoMudar={setOrientacao}
                opcoes={[["paisagem", "Deitada"], ["retrato", "Em pé"]] as const} />
            </div>
            <label style={linhaDeCaixa} title="Peça de 6 unidades vira 6 etiquetas numeradas — uma para cada volume.">
              <input type="checkbox" checked={porUnidade} onChange={(e) => setPorUnidade(e.target.checked)} data-testid="check-por-unidade" style={caixa} />
              Uma etiqueta por unidade (“3 de 6”)
            </label>
          </div>
        )}
        {(logo || buscandoLogo) && (
          <label style={linhaDeCaixa}>
            <input type="checkbox" checked={usarLogo} onChange={(e) => setUsarLogo(e.target.checked)} data-testid="check-usar-logo" style={caixa} />
            Logo do book no cabeçalho
            {buscandoLogo && <span role="status" style={{ fontSize: FS.meta, color: T.apoio }}>· extraindo…</span>}
          </label>
        )}
        {pecas.length === 0 && <p style={dica}>As opções de papel aparecem quando houver peça marcada.</p>}
      </SecaoDeOpcoes>

      <SecaoDeOpcoes titulo="4 · Cabeçalho da etiqueta" testid="secao-cabecalho"
        ajuda={logo && usarLogo ? "O logo do book ocupa o lugar do texto de cima." : undefined}>
        <label style={rotuloDeCampo}>
          Texto de cima (pequeno)
          <input type="text" value={textoDeCima ?? prefixo} onChange={(e) => setTextoDeCima(e.target.value)} data-testid="input-texto-de-cima"
            disabled={!!(logo && usarLogo)} className="etq-foco" style={{ ...campo, opacity: logo && usarLogo ? 0.6 : 1 }} />
        </label>
        <label style={rotuloDeCampo}>
          Palavra gigante (lê-se de longe)
          <input type="text" value={destaque ?? padrao.gigante} onChange={(e) => setDestaque(e.target.value)} data-testid="input-destaque" className="etq-foco" style={campo} />
        </label>
        {cabecalhoEditado && (
          <Botao tamanho={tamanhoDoBotao} className="etq-foco" data-testid="restaurar-cabecalho" onClick={() => { setDestaque(null); setTextoDeCima(null); }} style={{ alignSelf: "flex-start" }}>
            Voltar ao nome do evento
          </Botao>
        )}
      </SecaoDeOpcoes>
    </div>
  );

  const larguraDaLista = mmParaPx(TAMANHOS[tamanho].larguraMm);
  const zoomIndividual = escalaPara(orientacao === "retrato" ? FOLHA_RETRATO_PX : FOLHA_PAISAGEM_PX);
  const zoomLista = escalaPara(larguraDaLista);

  return (
    <div style={{ backgroundColor: T.bg, minHeight: "100%" }}>
      {/* Aqui dentro, o que vai para o PAPEL (fundo da folha, @media print)
          fica em hex literal; o que é só de tela usa token. */}
      <style>{`
        ${CSS_DA_ETIQUETA_EM_LISTA}
        ${CSS_DO_ZOOM}
        /* A ETIQUETA É MEIA FOLHA, SEMPRE. A altura vinha do conteúdo
           (minHeight solto) — a linha de corte caía onde o texto mandasse, e
           a guilhotina corta no MEIO do papel. Folha com proporção de A4 nas
           duas orientações; cada etiqueta ocupa 50% cravados; folha ímpar
           deixa a metade de baixo vazia, e o corte continua certo. */
        .etq-folha { display: flex; flex-direction: column; background: #fff; }
        .etq-etiqueta { height: 50%; flex: none; overflow: hidden; box-sizing: border-box; }
        .etq-foco:focus-visible, .etq-painel input:focus-visible, .etq-painel select:focus-visible { outline: 2px solid ${T.accentText}; outline-offset: 2px; }
        .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
        @media print {
          .etq-acao { display: none !important; }
          .etq-corpo, .etq-previa { display: block !important; padding: 0 !important; margin: 0 !important; overflow: visible !important; }
          @page { size: A4 ${orientacao === "retrato" ? "portrait" : "landscape"}; margin: 8mm; }
          /* A LISTA tem papel próprio (adesivo 10×15 / meia A4 / A4 em pé):
             página NOMEADA, para conviver com as etiquetas A4 no mesmo PDF.
             Com "só as listas", a página padrão também vira a da lista — a
             impressora de adesivo não depende do suporte a página nomeada. */
          ${regraDaPagina(tamanho, "etqlista")}
          ${saiValido === "listas" ? regraDaPagina(tamanho) : ""}
          .etq-lista { page: etqlista; }
          body { background: #fff !important; }
          /* A quebra é do BLOCO (legenda + folha): a folha mora dentro do
             embrulho do zoom, onde seria sempre "última filha" e nunca quebraria. */
          .etq-bloco { break-after: page; page-break-after: always; }
          .etq-bloco:last-child { break-after: auto; page-break-after: auto; }
          .etq-moldura-paisagem { width: 281mm !important; height: 194mm !important; max-width: none !important; }
          .etq-moldura-paisagem > .etq-folha { width: 100% !important; height: 100% !important; border: none !important; border-radius: 0 !important; }
          /* RETRATO: a folha fica em pé e o conteúdo (deitado, como o template
             original do dono) gira 90° para caber — lê-se virando a página. */
          .etq-moldura-retrato { width: 194mm !important; height: 281mm !important; }
          .etq-moldura-retrato > .etq-folha { width: 281mm !important; height: 194mm !important; left: 194mm !important; border: none !important; border-radius: 0 !important; }
        }
        @media screen {
          .etq-folha { border: 1px solid ${T.bdark}; border-radius: ${R.lg}px; box-shadow: ${SHADOW.md}; }
          .etq-quebra { margin: 0 auto 22px; }
          /* "Uma por unidade" multiplica folhas (32 un. = 16 folhas): na TELA
             só o que está visível renderiza; a impressão ignora esta regra. */
          .etq-quebra { content-visibility: auto; contain-intrinsic-size: auto 540px; }
        }
        .etq-moldura-retrato { position: relative; width: ${FOLHA_RETRATO_PX}px; height: 1000px; }
        .etq-moldura-retrato > .etq-folha { position: absolute; top: 0; left: ${FOLHA_RETRATO_PX}px; width: 1000px; height: ${FOLHA_RETRATO_PX}px; transform: rotate(90deg); transform-origin: top left; }
        .etq-moldura-paisagem { width: ${FOLHA_PAISAGEM_PX}px; aspect-ratio: 297 / 210; }
        .etq-moldura-paisagem > .etq-folha { width: 100%; height: 100%; }
      `}</style>

      <div className="etq-acao" data-testid="barra-das-etiquetas" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: isMobile ? "10px 12px" : "12px 18px", borderBottom: `1px solid ${T.border}`, position: "sticky", top: 0, backgroundColor: T.bg, zIndex: 5 }}>
        <Link href={voltarHref} data-testid="link-voltar-evento" className="etq-foco" style={{ display: "inline-flex", alignItems: "center", gap: 6, minHeight: alvo, padding: "0 12px", borderRadius: R.md, border: `1px solid ${T.border}`, color: T.strong, fontSize: FS.body, fontWeight: FW.medio, textDecoration: "none", backgroundColor: T.surface }}>
          <ArrowLeft aria-hidden="true" style={{ width: 14, height: 14 }} /> {veioDaGrafica ? "Voltar à Gráfica" : "Voltar ao evento"}
        </Link>
        {/* O CabecalhoDaPagina traz margem de baixo de página (20px); dentro da
            barra grudada ela só engordaria a barra — o -20 a devolve. */}
        <div style={{ minWidth: 0, flex: "1 1 200px", marginBottom: -20 }}>
          <CabecalhoDaPagina titulo="Etiquetas do evento" icone={Tags}
            subtitulo={
              <span data-testid="nome-do-evento" style={{ overflowWrap: "anywhere" }}>
                {nome || "Evento"}{event?.truckDepartureDate ? ` · saída ${dataBR(event.truckDepartureDate)}` : ""}
              </span>
            } />
        </div>
        {isMobile ? (
          <Botao variante={opcoesAbertas ? "primario" : "secundario"} tamanho="toque" icone={SlidersHorizontal} className="etq-foco" data-testid="abrir-opcoes"
            aria-expanded={opcoesAbertas} aria-controls="etq-painel-movel" onClick={() => setOpcoesAbertas((v) => !v)}>
            {opcoesAbertas ? "Ver a prévia" : "Opções"}
          </Botao>
        ) : blocoDeAcao}
      </div>

      <div className="etq-corpo" style={{ display: isMobile ? "block" : "grid", gridTemplateColumns: isMobile ? undefined : "minmax(320px, 380px) minmax(0, 1fr)", alignItems: "start", gap: 0 }}>
        {(!isMobile || opcoesAbertas) && (
          <aside className="etq-acao etq-painel" id={isMobile ? "etq-painel-movel" : undefined} aria-label="Opções das etiquetas"
            style={isMobile
              ? { padding: "12px 12px 120px" }
              : { padding: "14px 6px 24px 18px", position: "sticky", top: 78, maxHeight: "calc(100vh - 150px)", overflowY: "auto" }}>
            {painel}
          </aside>
        )}

        {/* ── Folhas: a PRÉVIA. No celular, com as opções abertas, ela sai da
            frente (display none só na tela — o papel continua inteiro). ── */}
        <div ref={refDaPrevia} className="etq-previa" data-testid="previa-das-etiquetas"
          style={{ padding: isMobile ? "14px 12px 150px" : "18px 18px 48px", minWidth: 0, overflow: "hidden", display: isMobile && opcoesAbertas ? "none" : "block" }}>
          {folhas === 0 && (
            <div className="etq-acao" data-testid="etiquetas-vazio" style={{ maxWidth: 520, margin: "24px auto" }}>
              <EstadoVazio compacto icone={Tags}
                titulo={pool.length > 0 ? "Nenhuma peça marcada" : incluirTodas ? "Este evento não tem peças para etiquetar" : "Nenhuma peça conferida ainda"}
                descricao={pool.length > 0
                  ? "Marque em “O que imprimir” as peças que entram nesta impressão."
                  : incluirTodas
                    ? "Quando o evento tiver peças, elas aparecem aqui."
                    : <>A etiqueta nasce da conferência. {conferidas === 0 && "Assim que a Gráfica conferir, as peças aparecem aqui. "}Para adiantar a rotulagem, inclua as não conferidas.</>}
                acao={pool.length > 0 ? (
                  <Botao tamanho="toque" className="etq-foco" data-testid="vazio-marcar-todas" onClick={() => setDesmarcadas(new Set())}>Marcar todas as {pool.length}</Botao>
                ) : !incluirTodas ? (
                  <Botao tamanho="toque" className="etq-foco" data-testid="vazio-incluir-todas" onClick={() => setIncluirTodas(true)}>Incluir as não conferidas</Botao>
                ) : undefined} />
            </div>
          )}

          {Array.from({ length: folhasIndividuais }, (_, f) => etiquetas.slice(f * 2, f * 2 + 2)).map((dupla, f) => (
            <div key={f} className="etq-bloco">
              <LegendaDaFolha testid={`legenda-folha-${f + 1}`}>
                A4 {orientacao === "retrato" ? "em pé" : "deitada"} · folha {f + 1} de {folhasIndividuais} · {dupla.length === 2 ? "2 etiquetas" : "1 etiqueta"}
              </LegendaDaFolha>
              <div className="etq-zoom" style={estiloDoZoom(zoomIndividual)}>
                <div className={`etq-quebra ${orientacao === "retrato" ? "etq-moldura-retrato" : "etq-moldura-paisagem"}`}>
                  <div className="etq-folha" style={{ display: "flex", flexDirection: "column" }}>
                    {dupla.map((e, i) => {
                      const p = e.parte.peca;
                      const volume = infoDoVolume(e.parte);
                      const testid = e.n > 0 ? `etiqueta-${p.id}-${e.n}` : partesDe(p).length > 1 ? `etiqueta-${p.id}-${sufixoDaParte(e.parte)}` : `etiqueta-${p.id}`;
                      return (
                      <div key={`${e.parte.chave}-${e.n}`} data-testid={testid} className="etq-etiqueta" style={{
                        display: "flex", alignItems: "stretch", gap: 18, padding: "22px 26px",
                        // PAPEL: a linha de corte e o cinza do "Saída" ficam em hex
                        // literal — não há token com o mesmo valor, e trocar mudaria
                        // o que sai na impressora.
                        borderBottom: i === 0 ? "2px dashed #d6d3d1" : "none",
                      }}>
                        {/* O NOME DO EVENTO — o que se lê de longe na pilha */}
                        <div style={{ flex: "1.2 1 0", minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "#78716c" }}>
                            {event?.truckDepartureDate ? `Saída ${dataBR(event.truckDepartureDate)}` : " "}
                          </p>
                          {/* Dois níveis, como no modelo: a marca (o LOGO do book,
                              quando existe; senão o texto de cima) e a palavra
                              GIGANTE — é ela que se lê de longe. */}
                          {/* SEM loading="lazy" nas duas imagens da etiqueta: o
                              window.print() sai no mesmo clique, e imagem preguiçosa
                              numa folha fora da vista (16 folhas no "uma por
                              unidade") pode ir em BRANCO para o papel. */}
                          {logo && usarLogo && (
                            <img decoding="async" src={logo} alt="Logo do evento" data-testid="logo-etiqueta"
                              style={{ maxHeight: 92, maxWidth: "60%", objectFit: "contain", alignSelf: "flex-start", margin: "4px 0 6px" }} />
                          )}
                          {/* Sem palavra gigante (campo apagado), o nome sai UMA vez,
                              no tamanho médio — nunca duplicado. */}
                          {!(logo && usarLogo) && gigante && prefixo && (
                            <p style={{ margin: "4px 0 0", fontFamily: FONT.display, fontWeight: 800, fontSize: "clamp(16px, 2vw, 24px)", textTransform: "uppercase", letterSpacing: "0.01em", color: T.text, lineHeight: 1.1 }}>
                              {prefixo}
                            </p>
                          )}
                          <p style={{
                            margin: "2px 0 0", fontFamily: FONT.display,
                            fontWeight: 900, textTransform: "uppercase", letterSpacing: "-0.02em",
                            color: T.text, lineHeight: 0.95,
                            // Gigante de várias palavras (nome inteiro, cidade composta) desce
                            // um degrau: 104px em três palavras estourava a meia folha.
                            fontSize: gigante && gigante.length <= 12 ? "clamp(56px, 8vw, 104px)" : "clamp(34px, 5.2vw, 64px)",
                            overflowWrap: "anywhere",
                          }}>
                            {gigante || prefixo || nome}
                          </p>
                        </div>

                        {/* A PEÇA: arte + código + descrição + quantidade */}
                        <div style={{ flex: "1 1 0", minWidth: 0, display: "flex", gap: 16, alignItems: "center" }}>
                          {(p.approvalThumbUrl || p.finalPreviewUrl) && (
                            <img decoding="async" src={miniatura(p.approvalThumbUrl || p.finalPreviewUrl)} alt=""
                              style={{ width: 150, height: 150, objectFit: "contain", borderRadius: 10, border: `1px solid ${T.border}`, backgroundColor: T.bg, flexShrink: 0 }} />
                          )}
                          <div style={{ minWidth: 0, flex: 1 }}>
                            {/* A DESCRIÇÃO manda (pedido do dono, 25/08): é ela que
                                identifica o material na pilha — "Testeira Vale Local"
                                diz mais que #2219. */}
                            <p style={{ margin: 0, fontFamily: FONT.display, fontSize: 30, fontWeight: 900, letterSpacing: "-0.01em", lineHeight: 1.12, color: T.text, overflowWrap: "anywhere" }}>
                              {p.description || p.type}
                            </p>
                            <p style={{ margin: "6px 0 0", fontSize: 16, lineHeight: 1.3 }}>
                              <span style={{ color: T.strong, textTransform: "uppercase", fontWeight: 700 }}>{p.type}</span>
                              {" "}<span style={{ color: T.accentText, fontWeight: 700 }}>{p.displayId}</span>
                            </p>
                          </div>
                          <div style={{ alignSelf: "flex-start", textAlign: "right", flexShrink: 0 }}>
                            {/* O VOLUME (21/09): "TUBO 2" em destaque, colado à
                                quantidade; "EMBALADA" se foi sozinha; nada se não
                                foi embalada. O número do tubo pode ter sido
                                editado para a impressão. */}
                            {volume.selo && (
                              <p data-testid="tubo-na-etiqueta" style={{ margin: "0 0 6px", display: "inline-block", padding: "3px 10px", borderRadius: 6, backgroundColor: T.text, color: "#ffffff", fontFamily: FONT.display, fontSize: volume.selo.startsWith("TUBO") ? 30 : 22, fontWeight: 900, lineHeight: 1.1, whiteSpace: "nowrap" }}>
                                {volume.selo}
                              </p>
                            )}
                            <p data-testid="quantidade-na-etiqueta" style={{ margin: 0, fontFamily: FONT.display, fontSize: 30, fontWeight: 900, color: T.text, whiteSpace: "nowrap" }}>
                              {e.n > 0 ? e.total : e.parte.quantidade} un.
                            </p>
                            {e.n === 0 && volume.detalhe && (
                              <p data-testid="detalhe-do-volume" style={{ margin: "2px 0 0", fontSize: 15, fontWeight: 700, color: T.strong, whiteSpace: "nowrap" }}>
                                {volume.detalhe}
                              </p>
                            )}
                            {/* "Uma por unidade": cada volume sabe qual ele é no lote. */}
                            {e.n > 0 && (
                              <p style={{ margin: "2px 0 0", fontFamily: FONT.display, fontSize: 18, fontWeight: 900, color: T.accentText, whiteSpace: "nowrap" }}>
                                {e.n} de {e.total}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          ))}

          {/* ── LISTAS: a etiqueta em lista do galpão (em pé, no papel escolhido),
              a mesma peça da etiqueta do tubo. Tem página própria na impressão
              (.etq-lista) e não gira com o "Em pé" das individuais. ── */}
          {paginasDaLista.map((pg, k) => {
            const copia = Math.floor(k / Math.max(1, jogoDeListas)) + 1;
            const doTubo = pg.numeroReal != null;
            const id = doTubo ? `tubo-${pg.numeroReal}-${pg.n}` : String(pg.n);
            return (
              <div key={`lista-${k}`} className="etq-lista">
                <LegendaDaFolha testid={doTubo ? `legenda-lista-tubo-${pg.numeroReal}-${pg.n}${copia > 1 ? `-copia${copia}` : ""}` : `legenda-lista-${k + 1}`}>
                  {nomeDoPapel(tamanho)}{doTubo ? ` · Tubo ${pg.tubo}` : ""} · lista {pg.n} de {pg.total}{copias > 1 ? ` · cópia ${copia} de ${copias}` : ""}
                </LegendaDaFolha>
                <div className="etq-zoom" style={estiloDoZoom(zoomLista)}>
                  <EtiquetaEmLista tamanho={tamanho} testid={copia === 1 ? `lista-${id}` : `lista-${id}-copia${copia}`}
                    testidDaLinha={copia === 1 ? (doTubo ? `tubo-linha-${pg.numeroReal}` : "lista-linha") : undefined}
                    ultima={k === paginasDaLista.length - 1}
                    // O MESMO logo do book do evento (uma extração só), com o interruptor.
                    logo={usarLogo ? logo : null} prefixo={prefixo} gigante={gigante}
                    saida={dataBR(event?.truckDepartureDate)}
                    tubo={doTubo ? pg.tubo : null}
                    rodape={pg.rodape}
                    // "1 de 2": quem pega a segunda etiqueta sabe que existe outra.
                    contador={pg.total > 1 ? `${doTubo ? `Tubo ${pg.tubo}` : "Lista"} · ${pg.n} de ${pg.total}` : null}
                    linhas={pg.linhas} mostrarQuantidade={mostrarQuantidade} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {isMobile && (
        <div className="etq-acao" data-testid="rodape-de-acao" style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 6, backgroundColor: T.bg, borderTop: `1px solid ${T.border}`, padding: "10px 12px", paddingBottom: "calc(10px + env(safe-area-inset-bottom, 0px))" }}>
          {blocoDeAcao}
        </div>
      )}
    </div>
  );
}
