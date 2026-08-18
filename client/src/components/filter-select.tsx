/**
 * FilterSelect — O CONTROLE DE ESCOLHA DA CASA. Referência única.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * VOCABULÁRIO DE CONTROLES — qual peça serve a qual JOB
 * ═══════════════════════════════════════════════════════════════════════════
 * Escrito porque o dono do NORTE olhou a faixa da Arte e disse "não pode cada
 * um ser de um jeito": no mesmo app havia `<select>` nativo (com o menu e o
 * azul do Windows), dois dropdowns próprios quase iguais, segmentados,
 * pílulas-atalho, faixas de período e interruptores — oito desenhos para um
 * punhado de trabalhos. A tabela abaixo é a decisão. Ela NÃO inventa padrão:
 * elege, entre o que já existia, o controle mais maduro para cada job e
 * aposenta o resto. Antes de criar um nono desenho, ache aqui o job.
 *
 * ── 1. SELEÇÃO ÚNICA entre poucas opções fixas (≤ 5, lista que não cresce) ──
 *   CONTROLE: FilterSelect com `hideSearch`.
 *   POR QUÊ: um campo de busca sobre três linhas é ruído e ainda rouba o foco
 *   de abertura de quem só queria escolher com as setas. Continua sendo o
 *   mesmo gatilho da faixa — a faixa não pode ter um controle de cada feitio
 *   só porque uma dimensão tem menos opções que a outra.
 *   ATIVO: gatilho vira tint (fundo #FFF7ED, borda #FB923C, texto #c2410c,
 *   peso 600) e o rótulo passa a dizer o RECORTE, não o nome do campo.
 *   NÃO USE: segmentado. O segmentado com rótulo à esquerda ("Prazo
 *   todos|atrasados") gasta a largura de três gatilhos para caber um, não tem
 *   contagem por opção e não escala quando a terceira opção aparece.
 *
 * ── 2. SELEÇÃO ÚNICA entre muitas opções (evento, patrocinador, pessoa) ─────
 *   CONTROLE: FilterSelect, busca ligada (padrão), `count` em toda opção.
 *   POR QUÊ: é o "filtro nota 10" que o dono apontou — busca no topo,
 *   contagem por opção, "Todos" no alto. A busca usa `normalizarBusca`: com
 *   `toLowerCase()` puro, "so quero" não achava "SÓ QUERO PEDALAR SP", e menu
 *   que esconde a opção existente é indistinguível de menu que não a tem.
 *   ATIVO: idem 1, mais o × de limpar dentro do gatilho.
 *
 * ── 3. SELEÇÃO MÚLTIPLA ────────────────────────────────────────────────────
 *   CONTROLE: FilterSelect em modo múltiplo (`values`/`onValuesChange`).
 *   POR QUÊ: mesma peça, mesma faixa; o que muda é a caixa de seleção no lugar
 *   do ponto e o rodapé "N selecionados · Limpar". Um controle diferente para
 *   "pode escolher mais de um" obrigaria o operador a reaprender a faixa.
 *   ATIVO: `unitLabel` faz o gatilho dizer "3 eventos" em vez de "3
 *   selecionados"; com 2+ e sem `unitLabel`, selo numérico ao lado do texto.
 *
 * ── 4. BINÁRIO / LIGA-DESLIGA (um recorte que só existe ligado ou desligado) ─
 *   CONTROLE: pílula-atalho — botão único que acende quando ligado.
 *   POR QUÊ: é o único job em que o dropdown perde. "Próximos 10 dias" tem UM
 *   estado interessante; embrulhá-lo num menu de duas linhas cobra dois
 *   cliques para o que precisa de um. NÃO é um interruptor de formulário
 *   (switch): interruptor promete gravar uma preferência, e aqui é recorte de
 *   tela.
 *   ATIVO: fundo #FFF7ED, borda #FB923C, texto #c2410c, peso 700 E o ✓ à
 *   esquerda — o estado nunca depende só de cor.
 *
 * ── 5. FAIXA TEMPORAL (período) ────────────────────────────────────────────
 *   CONTROLE: FilterSelect com `hideSearch` e `icon={Calendar}`.
 *   POR QUÊ: a faixa de botões "Todos · Hoje · 7 · 15 · 30 dias" é o caso 1
 *   disfarçado — cinco opções mutuamente exclusivas de uma dimensão só. Como
 *   faixa, ocupa meia tela e não cabe no celular; como gatilho, ocupa um.
 *   O ícone de calendário segura a identidade do campo quando o rótulo vira
 *   "7 dias" e some a palavra "Período".
 *
 * ── 6. ORDENAÇÃO ───────────────────────────────────────────────────────────
 *   CONTROLE: FilterSelect com `kind="sort"`.
 *   POR QUÊ (e é o coração do pedido): ordenação NÃO É FILTRO — não tira nada
 *   da lista, não tem "Todos", não tem o que limpar, e sempre vale alguma.
 *   Por isso ela se distingue: paleta GRAFITE (nunca a laranja do filtro),
 *   ícone de setas ↑↓, rótulo sempre prefixado "Ordenar: …", sem × e sem a
 *   linha "Todos". Quem bate o olho na faixa vê "os laranjas recortam, o
 *   cinza reordena" sem ler uma palavra. E não pode ser `<select>` nativo:
 *   era exatamente o que abria o menu do sistema operacional, com o azul do
 *   Windows, no meio de uma faixa inteiramente desenhada pela casa.
 *
 * ── 7. BUSCA LIVRE ─────────────────────────────────────────────────────────
 *   CONTROLE: campo de texto com lupa à esquerda, altura igual à do gatilho
 *   (36px; 44px no celular), foco com anel #FB923C. Não é este componente —
 *   é o `<input>` da tela —, mas partilha a altura e o raio para que a faixa
 *   fique alinhada.
 *   POR QUÊ: busca livre não tem conjunto de opções para oferecer; embrulhá-la
 *   num menu esconderia justamente o que ela precisa expor, que é o cursor.
 *   ATIVO: × para limpar dentro do campo.
 *
 * ── 8. ATALHO DE RECORTE PRONTO ("Atrasados", "Sai em 7 dias") ─────────────
 *   CONTROLE: pílula-atalho (mesma peça do job 4), agrupada numa fileira
 *   separada dos gatilhos, acima ou abaixo deles.
 *   POR QUÊ: um atalho é uma COMBINAÇÃO de recortes com nome próprio, não uma
 *   dimensão. Se virasse opção de um menu, teria de morar dentro de um campo
 *   ao qual ele não pertence. Fica ao lado, e ao ser ligado ele acende os
 *   gatilhos que de fato mexeu — senão o operador não sabe o que foi filtrado.
 *
 * ── 9. CAMPO DE ESCOLHA EM FORMULÁRIO (não é filtro) ───────────────────────
 *   CONTROLE: FilterSelect com `kind="field"`.
 *   POR QUÊ: filtro RECORTA uma lista (pode não ter valor, tem "Todos", tem o
 *   que limpar); campo de formulário PREENCHE UM DADO (é obrigatório ou não,
 *   nunca tem "Todos", e vazio é ausência de resposta, não "tudo"). São jobs
 *   diferentes, então `kind="field"` remove a linha "Todos" e o ×, mostra um
 *   placeholder em vez do nome do campo e aceita `invalid` para o anel
 *   vermelho da validação.
 *   O CUSTO QUE PRECISOU SER PAGO: num formulário de lançamento em lote a
 *   VELOCIDADE DE DIGITAÇÃO importa mais do que num filtro, e o `<select>`
 *   nativo é rápido justamente porque dá teclado de graça. Trocá-lo por um
 *   controle mais bonito e mais lento seria uma piora real. Por isso este
 *   componente ganhou teclado de primeira classe (vale para TODOS os jobs,
 *   não só o 9): ↓/↑ andam pelas opções, Home/End vão às pontas, Enter abre
 *   e escolhe, Esc fecha, digitar filtra (ou, com `hideSearch`, faz
 *   typeahead), e `onCommit` devolve o foco para quem chamou — é o que
 *   mantém o "Enter avança para o próximo campo" da grade em lote.
 *
 * ── O QUE FOI APOSENTADO ───────────────────────────────────────────────────
 *   · `<select>` NATIVO para filtrar, ordenar ou escolher em formulário. Ele
 *     desenha o menu do sistema operacional, com fonte, cor de seleção e
 *     ordem que não são da casa, e não tem contagem, nem busca, nem grupo.
 *   · `EventFilterDropdown` — era uma segunda cópia deste menu, só para
 *     evento, sem ícone, sem selo de ativo, sem virada na borda da janela, e
 *     com a linha "Todos" ainda em #F97316 sólido com texto branco (2,90:1,
 *     reprovado). Virou casca fina sobre este componente.
 *
 * ── A REGRA QUE VALE PARA TODOS ────────────────────────────────────────────
 *   O menu oferece o que a lista tem, e a contagem de cada opção é o número
 *   de linhas que aquele clique entrega. Travada em
 *   `server/__tests__/faceta-lista-invariante.test.ts`.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Suporta seleção simples (value/onChange) e múltipla (values/onValuesChange).
 * accent="orange" (padrão) ou "violet" para contextos com tema violeta.
 *
 * ── Contrastes calculados (WCAG 2.1, texto ≤13px exige 4,5:1) ──────────────
 * Três cores de texto deste menu reprovavam AA em TODAS as ~10 telas que o
 * usam; como são defeitos (e não estilo), a correção é global:
 *   contagem  #6B7280 sobre #F3F4F6 = 4,39:1 ✗  →  #57534e = 6,93:1 ✓
 *   grupo     #9CA3AF sobre #ffffff = 2,54:1 ✗  →  #78716c = 4,80:1 ✓
 *   vazio     #9CA3AF sobre #ffffff = 2,54:1 ✗  →  #78716c = 4,80:1 ✓
 * A linha "Todos" era uma barra sólida #F97316 com texto branco de 12px —
 * 2,90:1, o pior contraste da tela justamente no item mais neutro da lista.
 * Virou tint: #c2410c sobre #FFF7ED = 4,88:1 ✓ (violeta: #5B21B6 sobre
 * #F5F3FF = 8,19:1 ✓). E o "Limpar" do rodapé usava #F97316 como cor de
 * TEXTO, o que a régua da casa proíbe: agora é C.text (#c2410c sobre branco
 * = 5,18:1 ✓).
 *
 * Paleta GRAFITE, nova, do kind="sort" (calculada pela mesma fórmula WCAG):
 *   texto     #44403c sobre #ffffff = 10,27:1 ✓
 *   ativo     #44403c sobre #f5f5f4 =  9,41:1 ✓
 *   selo      #ffffff sobre #44403c = 10,27:1 ✓
 * Placeholder do kind="field": #78716c sobre #ffffff = 4,80:1 ✓; sobre fundo
 * de campo tingido (#f0efee, a grade do lote) cairia para 4,18:1 ✗ em 13px —
 * por isso ali o placeholder é #57534e sobre #f0efee = 6,64:1 ✓.
 */
import { useMemo, useState, useRef, useEffect, useLayoutEffect } from "react";
import { Search, ChevronDown, Check, X, ArrowUpDown } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { normalizarBusca } from "@/lib/utils";

export interface FilterOption {
  value: string;
  label: string;
  count?: number;
  dotColor?: string;
  pinned?: boolean;
  group?: string;
}

interface FilterSelectProps {
  label: string;
  allLabel?: string;
  // ── Modo simples ─────────────────────────────────────────────────────
  value?: string;
  onChange?: (value: string) => void;
  // ── Modo múltiplo ────────────────────────────────────────────────────
  values?: string[];
  onValuesChange?: (values: string[]) => void;
  // ─────────────────────────────────────────────────────────────────────
  options: FilterOption[];
  searchPlaceholder?: string;
  emptyText?: string;
  hideWhenEmpty?: boolean;
  panelWidth?: number;
  testId?: string;
  fullWidth?: boolean;
  variant?: "pill" | "bare";
  triggerStyle?: React.CSSProperties;
  triggerClassName?: string;
  showAllLabelWhenEmpty?: boolean;
  disabled?: boolean;
  dropdownAlign?: "left" | "right";
  hideClear?: boolean;
  accent?: "orange" | "violet";
  // ── Aditivos (padrão = comportamento histórico, nada muda em quem não passa) ──
  /**
   * Ícone da DIMENSÃO filtrada, desenhado à esquerda do rótulo. Existe porque
   * uma faixa com quatro gatilhos cinza idênticos não diz o que cada um recorta
   * — e, quando o rótulo vira "3 ações", é o ícone que segura a identidade do
   * campo. Sem a prop, o gatilho fica exatamente como sempre foi.
   */
  icon?: React.ComponentType<{ style?: React.CSSProperties; "aria-hidden"?: boolean | "true" | "false" }>;
  /**
   * Como o estado ATIVO se anuncia. "tint" (padrão) = fundo claro + borda
   * colorida, o de sempre. "solid" = selo de fundo cheio com texto branco, para
   * faixas onde o ativo precisa se separar do inativo à distância de um relance
   * (borda mais escura sozinha não sobrevive a quatro gatilhos lado a lado).
   */
  activeAppearance?: "tint" | "solid";
  /**
   * Substantivo do que está sendo filtrado. Com ele o gatilho diz o RECORTE
   * ("3 ações", "2 pessoas") em vez do genérico "3 selecionados" — e o selo
   * numérico redundante ao lado do texto deixa de ser desenhado.
   */
  unitLabel?: { one: string; many: string };
  /**
   * Esconde a caixa de busca do menu. Para listas curtas e fixas (o filtro de
   * Período tem três opções): um campo de busca sobre três linhas é ruído, e
   * ainda rouba o foco de abertura de quem só queria escolher com as setas.
   */
  hideSearch?: boolean;
  /**
   * O JOB deste controle — ver o vocabulário no topo do arquivo.
   * "filter" (padrão) recorta uma lista: tem "Todos", tem × de limpar, acende
   * em laranja. "sort" REORDENA: não tira nada, então não tem "Todos" nem ×, e
   * usa a paleta grafite para não se confundir com filtro na mesma faixa.
   * "field" PREENCHE UM DADO de formulário: também sem "Todos" (vazio ali é
   * ausência de resposta, não "tudo"), com placeholder e estado inválido.
   */
  kind?: "filter" | "sort" | "field";
  /** Texto do gatilho vazio no kind="field". Sem isto, cai no `label`. */
  placeholder?: string;
  /** Anel vermelho de validação (kind="field"). */
  invalid?: boolean;
  /**
   * Atributos extras no <button> do gatilho. Existe para a grade de lançamento
   * em lote, cuja navegação por teclado acha o próximo campo por
   * `[data-nav-row][data-nav-field]` — sem repassar esses data-*, trocar o
   * <select> nativo pelo controle da casa QUEBRARIA o Enter que avança.
   */
  triggerProps?: React.ButtonHTMLAttributes<HTMLButtonElement> & Record<string, unknown>;
  /**
   * Chamado depois que uma escolha foi confirmada PELO TECLADO (Enter). É o
   * que devolve o comando a quem chamou — na grade em lote, mover o foco para
   * o próximo campo. Não dispara no clique de mouse: ali o operador já está
   * com a mão no ponteiro e roubar o foco atrapalha.
   */
  onCommit?: () => void;
}

export function FilterSelect({
  label,
  allLabel,
  value,
  onChange,
  values,
  onValuesChange,
  options,
  searchPlaceholder,
  emptyText = "Nada encontrado.",
  hideWhenEmpty = true,
  panelWidth,
  testId,
  fullWidth = false,
  variant = "pill",
  triggerStyle,
  triggerClassName,
  showAllLabelWhenEmpty = false,
  disabled = false,
  dropdownAlign = "left",
  hideClear = false,
  accent = "orange",
  icon: Icon,
  activeAppearance = "tint",
  unitLabel,
  hideSearch = false,
  kind = "filter",
  placeholder,
  invalid = false,
  triggerProps,
  onCommit,
}: FilterSelectProps) {
  const multiple = values !== undefined && onValuesChange !== undefined;
  // Ordenação e campo de formulário SEMPRE valem alguma coisa: não existe
  // "todas as ordens" nem "todo material". Some a linha "Todos" e o × de
  // limpar — oferecer os dois seria prometer um estado que não existe.
  const isFilterKind = kind === "filter";
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // Só a ALTURA muda no mobile (alvo de toque 44px) — componente compartilhado
  // por várias telas, qualquer outra mudança aqui vaza para todas elas.
  const isMobile = useIsMobile();

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Anel de foco. O gatilho tinha `outline: none` e NADA no lugar: quem navega
  // por Tab não enxergava onde estava. O anel só aparece quando o foco chegou
  // pelo teclado — o mousedown (que dispara antes do focus) marca a origem e
  // evita a moldura preta pegajosa depois de cada clique.
  const [focusRing, setFocusRing] = useState(false);
  const pointerRef = useRef(false);

  // ── Teclado ───────────────────────────────────────────────────────────
  // Este menu era operável só com o mouse: abria, e daí em diante quem não
  // tinha ponteiro não tinha como escolher. Isso já era um defeito de
  // acessibilidade, mas virou bloqueio de PRODUTO quando o padrão passou a
  // valer também para campo de formulário: numa grade de lançamento em lote,
  // um `<select>` nativo dá teclado de graça, e trocá-lo por um controle
  // bonito e mais lento seria uma piora real para quem digita o dia inteiro.
  // `activeIdx` é a opção sob o cursor do teclado (-1 = nenhuma ainda).
  const [activeIdx, setActiveIdx] = useState(-1);
  const listRef = useRef<HTMLDivElement>(null);
  // Buffer do typeahead: com `hideSearch` não há caixa de busca para digitar,
  // então as letras vão para cá e saltam até a opção que começa por elas —
  // é o comportamento que o `<select>` nativo tinha e que não podia sumir.
  const typeaheadRef = useRef({ buffer: "", at: 0 });

  // FECHAR zera o cursor (e não "abrir"): ao abrir, o caminho que abriu já
  // pode ter escolhido onde o cursor deve parar — digitar "l" com o menu
  // fechado abre JÁ em "Lona". Um reset no `open` apagaria esse salto logo
  // depois de ele acontecer.
  useEffect(() => { if (!open) setActiveIdx(-1); }, [open]);
  // Digitar na busca zera: o cursor apontaria para a posição de uma lista que
  // acabou de mudar embaixo dele.
  useEffect(() => { setActiveIdx(-1); }, [search]);

  // A opção sob o cursor tem de estar VISÍVEL — descer com ↓ numa lista de 40
  // eventos sem isto rola o cursor para fora do painel e a tela fica parada.
  useEffect(() => {
    if (!open || activeIdx < 0) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-opt-idx="${activeIdx}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIdx, open]);

  // Lado efetivo do painel: começa na preferência do chamador (dropdownAlign)
  // e só vira para o outro lado quando a medição real mostra que ele não cabe
  // na largura da janela — sem isso, um gatilho perto da borda direita abria
  // o painel (até 360px) parcialmente fora da tela. useLayoutEffect (não
  // useEffect) porque a correção precisa acontecer antes do navegador pintar,
  // senão o usuário vê o painel "pular" de lado no primeiro open. Medido no
  // open E a cada resize — o gatilho pode ter mudado de lugar (sidebar,
  // rotação de tela) desde a última medição.
  /**
   * ONDE O PAINEL ABRE — em coordenadas de JANELA, e o painel é `fixed`.
   *
   * Ele era `position: absolute` dentro do controle. Absoluto ESTENDE a área
   * rolável do documento: o menu do último filtro da faixa abria para fora da
   * janela, a página inteira ganhava rolagem horizontal e o conteúdo da
   * esquerda — a barra lateral, o começo da tabela — saía de vista. O painel
   * não empurrava só a si mesmo; empurrava a tela.
   *
   * E a escolha do lado tinha um buraco: quando NENHUM dos dois cabia, o
   * código voltava para o lado original, que é justamente o que transborda.
   *
   * `fixed` não participa do fluxo nem do scroll do documento, então não há
   * como empurrar nada; e a posição é GRAMPEADA na janela, com 8px de respiro,
   * de modo que o painel sempre aparece inteiro mesmo quando não cabe de
   * nenhum dos dois lados. Mesma solução que a prévia de thumb da Arte já usa.
   */
  /** Teto de largura do painel. Acima disso um menu de filtro deixa de ser um
   *  menu e vira um segundo painel competindo com a tela. */
  const TETO_PAINEL = 360;
  /** Piso de largura do painel. O rótulo da opção é `flex:1` com elipse, ou
   *  seja: ele NUNCA empurra a largura do painel — encolhe até virar
   *  reticências. Então um gatilho estreito (o Foco tem 120px) produzia um
   *  menu de 120px com "Reprovad…", "Em event…". A largura útil do menu tem
   *  de vir de um piso próprio, não da largura de quem o abriu. 220px comporta
   *  o maior rótulo do app com a caixa e a contagem; a elipse continua ali
   *  como último recurso, para nomes de patrocinador realmente longos. */
  const PISO_PAINEL = 220;
  const painelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; minWidth: number } | null>(null);
  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      /**
       * O painel NÃO tem largura fixa — ele cresce com o conteúdo, a partir de
       * um piso e até um teto. Fixá-lo na largura do gatilho cortava os rótulos
       * ("Reprovad…", "Em event…") num gatilho estreito como o do Foco.
       * Por isso o grampo mede a largura REAL do painel já renderizado, e não
       * uma largura suposta: `painelRef` existe quando este efeito roda, porque
       * efeito de layout roda depois do DOM comitado. O `max` com o piso cobre
       * a primeira passada, em que o painel ainda não recebeu o `minWidth`.
       */
      const piso = Math.max(panelWidth ?? (fullWidth ? rect.width : 280), PISO_PAINEL);
      const real = painelRef.current?.getBoundingClientRect().width ?? 0;
      const width = Math.min(Math.max(piso, real), TETO_PAINEL);
      const RESPIRO = 8;
      const preferido = dropdownAlign === "right" ? rect.right - width : rect.left;
      const maximo = window.innerWidth - width - RESPIRO;
      const left = Math.max(RESPIRO, Math.min(preferido, maximo));
      setPos({ top: rect.bottom + 6, left, minWidth: piso });
    };
    measure();
    window.addEventListener("resize", measure);
    // `true` para pegar a fase de captura: a barra de filtros é sticky dentro
    // de um scroller próprio, e um listener no window não veria esse scroll.
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, dropdownAlign, panelWidth, fullWidth]);

  // ── Paleta de cor baseada no accent ───────────────────────────────────
  // `main` (o 500 saturado: #F97316 / #7C3AED) saiu da paleta em vez de ficar
  // como opção não usada. Era ele que aparecia atrás de texto e de glifos
  // brancos, e é justamente onde não cabe: quem precisa carregar branco por
  // cima usa `text` (o 700), que passa AA. Sem a chave, ninguém reintroduz o
  // problema sem perceber. `border` e `badge` seguem sendo só moldura e selo.
  // Ordenação usa GRAFITE, não laranja. É a distinção que o vocabulário do
  // topo pede: numa faixa onde tudo acende laranja, o controle que NÃO tira
  // linha nenhuma da lista não pode acender igual aos que tiram.
  // O contorno/glifo grafite é #78716c (4,80:1 sobre branco ✓) e não o
  // #a8a29e do resto da escala: em 2,52:1 a seta ▾ não alcançava nem os 3:1
  // que a WCAG pede para objeto gráfico — e no kind="sort" ela está SEMPRE no
  // estado ativo, então seria o contraste permanente do controle.
  const C = kind === "sort" ? {
    bg50:    "#f5f5f4",
    border:  "#78716c",
    badge:   "#44403c",
    text:    "#44403c",
    focus:   "rgba(68,64,60,0.15)",
  } : accent === "violet" ? {
    bg50:    "#F5F3FF",
    border:  "#A78BFA",
    badge:   "#7C3AED",
    text:    "#5B21B6",
    focus:   "rgba(124,58,237,0.15)",
  } : {
    bg50:    "#FFF7ED",
    border:  "#FB923C",
    badge:   "#FB923C",
    text:    "#C2410C",
    focus:   "rgba(251,146,60,0.15)",
  };

  const sorted = useMemo(() => {
    const pinned = options.filter(o => o.pinned);
    const rest = options
      .filter(o => !o.pinned)
      .slice()
      .sort((a, b) => a.label.localeCompare(b.label, "pt-BR", { sensitivity: "base" }));
    return [...pinned, ...rest];
  }, [options]);

  const hasGroups = sorted.some(o => o.group);

  if (hideWhenEmpty && sorted.length === 0) return null;

  // ── Estado activo ─────────────────────────────────────────────────────
  const isActive = multiple
    ? (values!.length > 0)
    : (value !== undefined && value !== "all" && value !== "");

  // Um campo de formulário PREENCHIDO é o estado normal dele, não um recorte
  // aceso: se acendesse igual a um filtro ativo, uma grade com dez linhas
  // preenchidas ficaria toda pintada de laranja sem que nada estivesse
  // filtrado. Só filtro e ordenação vestem a pele de ativo.
  const wearsActiveSkin = isActive && kind !== "field";

  // ── Label do trigger ──────────────────────────────────────────────────
  const allLabelText = allLabel || `Todos — ${label.toLowerCase()}`;
  let triggerText: string;
  if (multiple) {
    if (values!.length === 0) {
      triggerText = allLabelText;
    } else if (values!.length === 1) {
      triggerText = sorted.find(o => o.value === values![0])?.label ?? values![0];
    } else {
      // Com unitLabel o gatilho diz o recorte de verdade ("3 ações"); sem ela,
      // o texto genérico de sempre.
      triggerText = unitLabel ? `${values!.length} ${unitLabel.many}` : `${values!.length} selecionados`;
    }
  } else if (kind === "sort") {
    // "Ordenar: Mais recentes" e não só "Mais recentes": lido isolado no meio
    // da faixa, o nome do critério parece mais um recorte. O prefixo é o que
    // diz, em uma palavra, que este controle reordena em vez de tirar linhas.
    const selected = sorted.find(o => o.value === value);
    triggerText = `Ordenar: ${selected?.label ?? sorted[0]?.label ?? label}`;
  } else if (kind === "field") {
    const selected = sorted.find(o => o.value === value);
    triggerText = selected?.label ?? placeholder ?? label;
  } else {
    const selected = sorted.find(o => o.value === value);
    const emptyText_ = showAllLabelWhenEmpty ? allLabelText : label;
    triggerText = isActive ? (selected?.label ?? label) : emptyText_;
  }

  // ── dotColor do trigger (modo simples com 1 selecionado) ──────────────
  const triggerDot = !multiple && isActive
    ? sorted.find(o => o.value === value)?.dotColor
    : undefined;

  // ── Busca ─────────────────────────────────────────────────────────────
  // SEM acento (`normalizarBusca`, lib/utils): com `toLowerCase()` puro, "acao"
  // não achava "Ação" e "so quero" não achava "SÓ QUERO PEDALAR SP". Menu que
  // esconde a opção existente é indistinguível de menu que não a tem.
  const searchTrimmed = normalizarBusca(search);
  const filteredSorted = searchTrimmed
    ? sorted.filter(o => normalizarBusca(o.label).includes(searchTrimmed))
    : sorted;

  // Os grupos saem de `filteredSorted`, não de `sorted`. Saíam de `sorted`, e o
  // efeito era: num menu AGRUPADO (o de Ação do Histórico, o de Prioridade dos
  // Eventos), digitar na busca encolhia a contagem e a lista continuava
  // mostrando as 24 opções — a busca só funcionava nos menus sem grupo.
  const groupedEntries: Array<[string, FilterOption[]]> = [];
  if (hasGroups) {
    const map = new Map<string, FilterOption[]>();
    filteredSorted.forEach(o => {
      const g = o.group || "";
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(o);
    });
    groupedEntries.push(...Array.from(map.entries()));
  }

  // ── Ordem de navegação do teclado ─────────────────────────────────────
  // A MESMA ordem em que as opções são pintadas — inclusive a linha "Todos",
  // que é a primeira quando existe. Se ↓ andasse pela ordem de `options` e a
  // tela pintasse por grupo, o cursor pularia pela lista sem sentido nenhum.
  const navOptions: FilterOption[] = hasGroups
    ? groupedEntries.flatMap(([, opts]) => opts)
    : filteredSorted;
  const showAllRow = isFilterKind && !searchTrimmed;
  const ALL_ROW = "\u0000all";
  const navValues: string[] = showAllRow
    ? [ALL_ROW, ...navOptions.map(o => o.value)]
    : navOptions.map(o => o.value);
  /** Índice de navegação de uma opção — o mesmo `data-opt-idx` do DOM. */
  const navIndexOf = (v: string) => navValues.indexOf(v);

  // ── Handlers ──────────────────────────────────────────────────────────
  const handleSelectSingle = (v: string) => {
    onChange?.(v);
    setSearch("");
    setOpen(false);
  };

  const handleToggleMultiple = (v: string) => {
    const cur = values!;
    const next = cur.includes(v) ? cur.filter(x => x !== v) : [...cur, v];
    onValuesChange!(next);
  };

  const handleClearMultiple = () => {
    onValuesChange!([]);
  };

  /** Aplica a opção do índice `i` da ordem de navegação. */
  const commitIndex = (i: number) => {
    const v = navValues[i];
    if (v === undefined) return;
    if (v === ALL_ROW) {
      if (multiple) handleClearMultiple();
      else handleSelectSingle("all");
      return;
    }
    if (multiple) {
      // Múltipla escolha: Enter marca e o menu FICA ABERTO — quem está
      // escolhendo três eventos não quer reabrir o menu duas vezes.
      handleToggleMultiple(v);
      return;
    }
    handleSelectSingle(v);
    // Escolheu pelo teclado: o foco volta ao gatilho (senão ficaria num botão
    // que acabou de ser desmontado, e o Tab seguinte recomeçaria do topo da
    // página) e `onCommit` deixa quem chamou seguir — na grade em lote, pular
    // para o próximo campo, que é o que o `<select>` nativo fazia.
    requestAnimationFrame(() => triggerRef.current?.focus());
    onCommit?.();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;

    // Esc fecha o menu e devolve o foco ao gatilho. Fica aqui, no onKeyDown do
    // container (não em document): dentro de um Dialog — o export-pdf usa este
    // componente lá —, um listener global fecharia o modal inteiro junto.
    // Parando a propagação no próprio React, o Esc de "fechar menu" nunca vira
    // Esc de "fechar modal".
    if (e.key === "Escape") {
      if (!open) return;
      e.stopPropagation();
      setOpen(false);
      setSearch("");
      triggerRef.current?.focus();
      return;
    }

    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      if (navValues.length === 0) return;
      const passo = e.key === "ArrowDown" ? 1 : -1;
      setActiveIdx(i => {
        // Sem cursor ainda: ↓ começa no primeiro, ↑ no último. Com cursor,
        // dá a volta — numa lista de seis status, chegar ao fim e travar é
        // pior do que voltar ao começo.
        if (i < 0) return passo === 1 ? 0 : navValues.length - 1;
        return (i + passo + navValues.length) % navValues.length;
      });
      return;
    }

    if (e.key === "Home" || e.key === "End") {
      if (!open) return;
      e.preventDefault();
      setActiveIdx(e.key === "Home" ? 0 : navValues.length - 1);
      return;
    }

    if (e.key === "Enter" || (e.key === " " && !open)) {
      // Espaço só ABRE. Com o menu aberto ele pertence à caixa de busca —
      // roubá-lo impediria de digitar "placa km" ali dentro.
      e.preventDefault();
      // Enter propagando para cima fecha/submete o Dialog ou o formulário que
      // contém o menu; aqui ele significa "escolhi", e para nada mais.
      e.stopPropagation();
      if (!open) { setOpen(true); return; }
      if (activeIdx >= 0) { commitIndex(activeIdx); return; }
      // Sem cursor, mas a busca deixou UMA opção de pé: Enter escolhe ela.
      // É o caminho rápido de quem digita "lona" e aperta Enter sem olhar.
      if (searchTrimmed && navOptions.length === 1) {
        commitIndex(navIndexOf(navOptions[0].value));
        return;
      }
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }

    if (e.key === "Tab" && open) {
      // Tab sai do controle: fecha para o painel não ficar pairando sobre a
      // tela enquanto o foco já está três campos adiante.
      setOpen(false);
      setSearch("");
      return;
    }

    // Teclas imprimíveis (letra, dígito) daqui para baixo.
    if (e.key.length !== 1 || e.ctrlKey || e.altKey || e.metaKey) return;

    // DIGITAR COM O MENU FECHADO ABRE E JÁ PROCURA. No `<select>` nativo,
    // parar no campo e teclar "l" salta para "Lona" sem clique nenhum; quem
    // preenche uma grade de lançamento em lote depende disso para não tirar a
    // mão do teclado. Sem esta linha a primeira letra sumiria — o operador
    // digitaria "lona" e o campo receberia "ona".
    if (!open) {
      e.preventDefault();
      setOpen(true);
      if (hideSearch) {
        typeaheadRef.current = { buffer: e.key, at: Date.now() };
        // As opções não dependem de `open`, então o salto já pode ser
        // calculado agora: o menu abre com o cursor JÁ na opção certa, e um
        // Enter em seguida a escolhe. "l" + Enter = "Lona", dois toques.
        const alvo = normalizarBusca(e.key);
        const achou = navOptions.findIndex(o => normalizarBusca(o.label).startsWith(alvo));
        if (achou >= 0) setActiveIdx(navIndexOf(navOptions[achou].value));
      } else {
        setSearch(e.key);
      }
      return;
    }

    // Typeahead — só onde não há caixa de busca (`hideSearch`). Com a caixa
    // presente, ela tem o foco e recebe as letras sozinha. Digitar "lo" salta
    // para "Lona 440g". O buffer expira em 800ms, senão a segunda palavra
    // digitada minutos depois continuaria a primeira.
    if (hideSearch) {
      const agora = Date.now();
      const t = typeaheadRef.current;
      t.buffer = agora - t.at > 800 ? e.key : t.buffer + e.key;
      t.at = agora;
      const alvo = normalizarBusca(t.buffer);
      const achou = navOptions.findIndex(o => normalizarBusca(o.label).startsWith(alvo));
      if (achou >= 0) {
        e.preventDefault();
        setActiveIdx(navIndexOf(navOptions[achou].value));
      }
    }
  };

  // ── Estilos ───────────────────────────────────────────────────────────
  // Quem monta triggerStyle com `prop: condicao ? valor : undefined` (comum
  // em objetos reaproveitados de outro lugar) mantém a CHAVE mesmo quando a
  // condição é falsa. Espalhar esse objeto direto engolia o valor calculado
  // do componente (ex.: a cor do "filtro ativo") com esse `undefined`, em vez
  // de simplesmente não tocar nele. Tirando as chaves undefined antes do
  // spread, o estilo de quem chama só sobrescreve o que ele de fato definiu —
  // complementa o base em vez de apagar pedaços dele por acidente. Não muda
  // nada para quem já passa objetos totalmente definidos (todo consumidor
  // atual): `{...base, ...limpo}` == `{...base, ...triggerStyle}` quando não
  // há `undefined` no meio.
  const cleanTriggerStyle = triggerStyle
    ? (Object.fromEntries(Object.entries(triggerStyle).filter(([, v]) => v !== undefined)) as React.CSSProperties)
    : undefined;

  // Selo cheio: só quando o chamador pede E o filtro está de fato ativo.
  // #ffffff sobre #c2410c = 5,18:1 ✓ (violeta #5B21B6 = 8,19:1 ✓) — passa AA
  // como texto normal, não só como texto grande.
  const solidActive = wearsActiveSkin && activeAppearance === "solid";

  // Campo de formulário: preenchido escreve em quase-preto (#1c1917 sobre
  // branco = 16,10:1 ✓); vazio escreve o placeholder em #78716c (4,80:1 ✓) —
  // e quem tinge o fundo do campo passa a cor mais escura por triggerStyle,
  // porque sobre #f0efee o #78716c cai para 4,18:1 ✗.
  const fieldTextColor = kind === "field" && !isActive ? "#78716c" : "#1c1917";

  const pillTrigger: React.CSSProperties = {
    display: "flex", alignItems: "center",
    gap: 6, height: isMobile ? 44 : 36,
    padding: "0 10px 0 12px",
    backgroundColor: solidActive ? C.text : open || wearsActiveSkin ? C.bg50 : "#ffffff",
    border: invalid
      ? "1.5px solid #ef4444"
      : solidActive ? `1.5px solid ${C.text}` : wearsActiveSkin || open ? `1.5px solid ${C.border}` : "1px solid #e7e5e4",
    borderRadius: 7,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.6 : 1,
    fontSize: 13, fontWeight: wearsActiveSkin ? 600 : 400,
    color: solidActive ? "#ffffff" : wearsActiveSkin ? C.text : fieldTextColor,
    transition: "background 0.15s, border 0.15s, color 0.15s",
    outline: "none", whiteSpace: "nowrap",
    ...(fullWidth ? { width: "100%", justifyContent: "space-between" } : { maxWidth: 260 }),
    ...cleanTriggerStyle,
  };

  const bareTrigger: React.CSSProperties = {
    display: "flex", alignItems: "center",
    gap: 8, padding: "12px 16px",
    border: "none", borderRadius: 8,
    backgroundColor: solidActive ? C.text : wearsActiveSkin ? C.bg50 : "#ffffff",
    color: solidActive ? "#ffffff" : wearsActiveSkin ? C.text : fieldTextColor,
    fontSize: 14, fontWeight: 600,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.6 : 1,
    outline: "none", whiteSpace: "nowrap",
    ...(fullWidth ? { width: "100%", justifyContent: "space-between" } : { maxWidth: 260 }),
    ...cleanTriggerStyle,
  };

  const resolvedTrigger = triggerClassName
    ? { display: "flex", alignItems: "center", gap: 5, ...cleanTriggerStyle }
    : variant === "bare" ? bareTrigger : pillTrigger;

  // ── Render opção ──────────────────────────────────────────────────────
  const renderOption = (opt: FilterOption) => {
    const isSel = multiple ? values!.includes(opt.value) : value === opt.value;
    const idx = navIndexOf(opt.value);
    // Opção sob o CURSOR DO TECLADO. Não é "selecionada" — é "onde as setas
    // pararam". Por isso não pode se pintar como a selecionada (o operador
    // pensaria que já escolheu): a marca é uma barra de 3px na borda esquerda
    // mais um fundo cinza claro, dois sinais que ninguém confunde com o tint
    // laranja de "esta é a que vale".
    const isCursor = idx >= 0 && idx === activeIdx;
    const bgDe = (sel: boolean, cursor: boolean) =>
      sel ? C.bg50 : cursor ? "#F3F4F6" : "transparent";
    return (
      <button
        key={opt.value}
        data-opt-idx={idx}
        // aria-pressed: o estado ativo passa a ser ANUNCIADO ("pressionado"),
        // não só pintado — quem usa leitor de tela não via diferença nenhuma
        // entre uma opção marcada e uma opção qualquer.
        aria-pressed={isSel}
        // O foco fica no gatilho (é ele que ouve as setas); `aria-current` é o
        // que conta ao leitor de tela onde o cursor do teclado parou.
        aria-current={isCursor ? "true" : undefined}
        tabIndex={-1}
        onMouseMove={() => { if (idx >= 0 && idx !== activeIdx) setActiveIdx(idx); }}
        onClick={() => {
          if (disabled) return;
          if (multiple) {
            handleToggleMultiple(opt.value);
          } else {
            handleSelectSingle(opt.value);
          }
        }}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 9,
          padding: "8px 14px", border: "none", cursor: "pointer", textAlign: "left",
          backgroundColor: bgDe(isSel, isCursor),
          boxShadow: isCursor ? `inset 3px 0 0 ${C.text}` : "none",
          transition: "background 0.1s",
        }}
        onMouseEnter={e => { if (!isSel) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#F9FAFB"; }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = bgDe(isSel, isCursor); }}
      >
        {/* Checkbox (multi) ou dot (single) */}
        {multiple ? (
          // C.text e não C.main na caixa marcada: o branco do "✓" sobre
          // #f97316 dava 2,90:1 — abaixo dos 3:1 que a WCAG pede para objeto
          // gráfico. Sobre #c2410c são 5,18:1, mesma família de cor.
          <span style={{
            width: 16, height: 16, borderRadius: 4, flexShrink: 0,
            border: isSel ? "none" : "1.5px solid #D1D5DB",
            backgroundColor: isSel ? C.text : "transparent",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {isSel && <Check style={{ width: 10, height: 10, color: "#fff" }} />}
          </span>
        ) : (
          <span style={{
            width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
            backgroundColor: opt.dotColor || (isSel ? C.text : "#D1D5DB"),
          }} />
        )}

        {/* Label */}
        <span style={{
          flex: 1, fontSize: 12, fontWeight: isSel ? 600 : 400,
          color: isSel ? C.text : "#374151",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {opt.label}
        </span>

        {/* Contagem — #57534e sobre #F3F4F6 = 6,93:1 ✓ (era #6B7280 = 4,39:1 ✗
            em 11px). Selecionada: #fff sobre #c2410c = 5,18:1 ✓. */}
        {opt.count !== undefined && (
          <span style={{
            fontSize: 11, fontWeight: 700, padding: "1px 7px", borderRadius: 99,
            backgroundColor: isSel ? C.text : "#F3F4F6",
            color: isSel ? "#fff" : "#57534e", flexShrink: 0,
          }}>
            {opt.count}
          </span>
        )}

        {/* Check mark (modo simples) */}
        {!multiple && isSel && <Check style={{ width: 12, height: 12, color: C.text, flexShrink: 0 }} />}
      </button>
    );
  };


  return (
    <div
      ref={ref}
      onKeyDown={handleKeyDown}
      style={{ position: "relative", flexShrink: fullWidth ? 0 : undefined, width: fullWidth ? "100%" : undefined }}
    >
      {/* ── Trigger ── */}
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        data-testid={testId}
        className={triggerClassName}
        title={isActive ? triggerText : label}
        // O rótulo acessível carrega a DIMENSÃO junto do recorte ("Ação: 3
        // ações"): lido isolado, "3 ações" não diz de que campo se trata. Como
        // contém o texto visível, continua valendo a regra "label in name".
        // Quando o gatilho já mostra o próprio nome do campo, não repete.
        aria-label={triggerText === label ? label : `${label}: ${triggerText}`}
        aria-expanded={open}
        aria-haspopup="listbox"
        onMouseDown={() => { pointerRef.current = true; }}
        onFocus={() => { if (!pointerRef.current) setFocusRing(true); pointerRef.current = false; }}
        onBlur={() => setFocusRing(false)}
        onClick={() => { if (!disabled) setOpen(v => !v); }}
        {...triggerProps}
        style={focusRing
          ? { ...resolvedTrigger, outline: "2px solid #1c1917", outlineOffset: 2 }
          : resolvedTrigger}
      >
        {/* Ordenação ganha o ícone de setas ↑↓ mesmo sem o chamador pedir: é
            metade do sinal de "isto reordena, não recorta" (a outra metade é a
            paleta grafite). Quem passar `icon` explicitamente manda. */}
        {(Icon || kind === "sort") && (() => {
          const Glifo = Icon ?? ArrowUpDown;
          return <Glifo aria-hidden="true" style={{ width: 13, height: 13, flexShrink: 0, opacity: isActive ? 1 : 0.75 }} />;
        })()}
        {triggerDot && (
          <span style={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: triggerDot, flexShrink: 0 }} />
        )}
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", flex: fullWidth ? 1 : undefined }}>
          {triggerText}
        </span>

        {/* O SELO DE CONTAGEM SAIU. O comentário antigo já tinha visto a
            duplicação — "3 ações ③" é a mesma informação duas vezes — mas
            suprimia o selo só no ramo com `unitLabel`. Sem ela o texto é
            "4 selecionados", que TAMBÉM carrega o número: o gatilho aparecia
            como "4 selecionados ④". Com 2+ escolhidos o texto sempre diz
            quantos são, então o selo nunca acrescenta — só ocupa largura numa
            faixa onde ela é disputada.
            (Com 1 escolhido o texto é o RÓTULO da opção e não há número
            nenhum; mas aí `values.length > 1` já era falso.) */}

        {/* Botão X — limpar. Só no job de FILTRO: em ordenação e em campo de
            formulário não existe estado "sem valor" para voltar, então o × não
            teria o que fazer — e um × que não limpa nada é pior que × nenhum. */}
        {isActive && !hideClear && isFilterKind && (
          <span
            role="button"
            // tabIndex + Enter/Espaço: o × fica dentro do <button> do trigger
            // (aninhado), então sem isto era inoperável por teclado.
            tabIndex={0}
            aria-label="Limpar filtro"
            onClick={e => {
              e.stopPropagation();
              if (multiple) handleClearMultiple();
              else onChange?.("all");
              setSearch("");
            }}
            onKeyDown={e => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault(); e.stopPropagation();
                if (multiple) handleClearMultiple();
                else onChange?.("all");
                setSearch("");
              }
            }}
            style={{ display: "flex", alignItems: "center", color: solidActive ? "#ffffff" : C.border, marginLeft: 2, cursor: "pointer", flexShrink: 0 }}
            title="Limpar filtro"
          >
            <X style={{ width: 13, height: 13 }} />
          </span>
        )}

        <ChevronDown aria-hidden="true" style={{
          width: variant === "bare" ? 14 : 13, height: variant === "bare" ? 14 : 13,
          flexShrink: 0, marginLeft: 2,
          color: solidActive ? "rgba(255,255,255,0.9)" : wearsActiveSkin ? C.border : "#78716c",
          transition: "transform 0.2s",
          transform: open ? "rotate(180deg)" : "rotate(0deg)",
        }} />
      </button>

      {/* ── Dropdown panel ── */}
      {open && (
        <div ref={painelRef} style={{
          position: "fixed",
          top: pos?.top ?? 0,
          left: pos?.left ?? 0,
          minWidth: pos?.minWidth,
          // Enquanto a primeira medição não chega, o painel fica invisível em
          // vez de aparecer no canto superior esquerdo e saltar para o lugar.
          visibility: pos ? "visible" : "hidden",
          zIndex: 9999,
          backgroundColor: "#fff", border: "1px solid #E5E7EB",
          borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.10)",
          maxWidth: TETO_PAINEL, overflow: "hidden",
        }}>
          {/* Search */}
          {!hideSearch && (
          <div style={{ padding: "10px 10px 8px" }}>
            <div style={{ position: "relative" }}>
              <Search style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", width: 13, height: 13, color: "#9CA3AF" }} />
              <input
                autoFocus
                type="text"
                placeholder={searchPlaceholder || `Buscar ${label.toLowerCase()}...`}
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{
                  width: "100%", boxSizing: "border-box",
                  paddingLeft: 30, paddingRight: 10, paddingTop: 7, paddingBottom: 7,
                  backgroundColor: "#F9FAFB", border: "1.5px solid #E5E7EB",
                  borderRadius: 6, fontSize: 12, color: "#111827", outline: "none",
                }}
                onFocus={e => { e.target.style.border = `1.5px solid ${C.border}`; e.target.style.boxShadow = `0 0 0 3px ${C.focus}`; }}
                onBlur={e => { e.target.style.border = "1.5px solid #E5E7EB"; e.target.style.boxShadow = "none"; }}
              />
            </div>
          </div>
          )}

          {/* List. Sem a caixa de busca, o menu abre com uma folga mínima no
              topo para o primeiro item não colar na borda do painel. */}
          <div ref={listRef} style={{ maxHeight: 280, overflowY: "auto", paddingTop: hideSearch ? 6 : 0, scrollbarWidth: "thin", scrollbarColor: "#E5E7EB transparent" }}>
            {/* "Todos" row — só no job de FILTRO. Ordenação e campo de
                formulário não têm "todos": não existe "toda ordem" nem "todo
                material", e oferecer a linha seria oferecer um estado que o
                controle não sabe representar. */}
            {showAllRow && (
              // "Todos" é o item MAIS NEUTRO da lista e virava a barra mais
              // pesada dela (fundo #F97316 sólido de ponta a ponta, branco de
              // 12px em 2,90:1). Agora é um tint discreto — o realce fica com
              // quem carrega informação, que são as opções escolhidas.
              <button
                data-opt-idx={0}
                tabIndex={-1}
                aria-pressed={!isActive}
                aria-current={activeIdx === 0 ? "true" : undefined}
                onMouseMove={() => { if (activeIdx !== 0) setActiveIdx(0); }}
                onClick={() => {
                  if (multiple) {
                    handleClearMultiple();
                  } else {
                    handleSelectSingle("all");
                  }
                }}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 8,
                  padding: "9px 14px", border: "none", cursor: "pointer", textAlign: "left",
                  backgroundColor: !isActive ? C.bg50 : activeIdx === 0 ? "#F3F4F6" : "transparent",
                  boxShadow: activeIdx === 0 ? `inset 3px 0 0 ${C.text}` : "none",
                  color: !isActive ? C.text : "#44403c",
                  fontWeight: 700, fontSize: 12,
                  transition: "background 0.1s",
                  borderBottom: "1px solid #F3F4F6",
                }}
                onMouseEnter={e => { if (isActive) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#F9FAFB"; }}
                onMouseLeave={e => { if (isActive) (e.currentTarget as HTMLButtonElement).style.backgroundColor = activeIdx === 0 ? "#F3F4F6" : "transparent"; }}
              >
                {multiple && (
                  <span style={{
                    width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                    border: !isActive ? "none" : "1.5px solid #D1D5DB",
                    backgroundColor: !isActive ? C.text : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {!isActive && <Check style={{ width: 10, height: 10, color: "#fff" }} />}
                  </span>
                )}
                <span style={{ flex: 1 }}>{allLabelText}</span>
                {!multiple && !isActive && <Check style={{ width: 13, height: 13, flexShrink: 0 }} />}
              </button>
            )}

            {/* Opções */}
            {filteredSorted.length === 0 ? (
              <div style={{ padding: "20px 12px", textAlign: "center", fontSize: 12, color: "#78716c" }}>
                {emptyText}
              </div>
            ) : hasGroups ? (
              groupedEntries.map(([groupName, opts]) => (
                // role="group" + aria-label: sem isso o leitor de tela lia 24
                // opções em fila, sem a fase a que cada uma pertence — que é
                // justamente o que o agrupamento visual comunica.
                <div key={groupName || "__sem__"} role="group" aria-label={groupName || undefined}>
                  {groupName && (
                    <div style={{ padding: "8px 14px 3px", fontSize: 11, fontWeight: 800, color: "#78716c", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                      {groupName}
                    </div>
                  )}
                  {opts.map(renderOption)}
                </div>
              ))
            ) : (
              filteredSorted.map(renderOption)
            )}
          </div>

          {/* Footer — modo múltiplo com seleção ativa */}
          {multiple && values!.length > 0 && (
            <div style={{ padding: "8px 12px", borderTop: "1px solid #F3F4F6", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 11, color: "#746e69" }}>
                {values!.length} {values!.length === 1 ? "selecionado" : "selecionados"}
              </span>
              <button
                onClick={handleClearMultiple}
                // C.text e não C.main: #F97316 como cor de TEXTO é proibido pela
                // régua da casa (e dava 2,90:1 sobre branco). #c2410c = 5,18:1 ✓
                style={{ fontSize: 11, fontWeight: 700, color: C.text, background: "none", border: "none", cursor: "pointer", padding: "2px 6px", textDecoration: "underline", textUnderlineOffset: 2 }}
              >
                Limpar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * ShortcutPill — o CONTROLE DOS JOBS 4 e 8 do vocabulário do topo.
 *
 * Existia como desenho e como decisão escrita, mas não como peça: cada tela
 * escrevia o seu. "Próximos 10 dias" era um `role="switch"` com trilho e
 * botãozinho na Gráfica e um botão preto de `aria-pressed` na Arte — o MESMO
 * recorte, com o mesmo nome, em duas linguagens. Pior: o `switch` promete
 * gravar uma preferência, e aqui é recorte de tela (job 4 explica).
 *
 * O ATIVO NUNCA DEPENDE SÓ DE COR: além do tint, o glifo da esquerda vira "✓".
 * Quem não distingue laranja de cinza (e quem imprime a tela) continua lendo o
 * estado. Por isso o ícone da dimensão só aparece DESLIGADO — ligado, o lugar
 * dele é do ✓, e a largura não pula porque os dois glifos medem 12px.
 *
 * Contrastes (texto ≤13px exige 4,5:1 — mesma fórmula WCAG 2.1 do resto do
 * arquivo):
 *   ligado    #c2410c sobre #fff7ed = 4,88:1 ✓
 *   desligado #57534e sobre #ffffff = 7,03:1 ✓
 * Nem #f97316 nem #a8a29e aparecem como cor de texto, nos dois estados.
 */
export function ShortcutPill({
  label,
  active,
  onClick,
  icon: Icon,
  count,
  testId,
  title,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  /** Ícone da DIMENSÃO. Só é desenhado DESLIGADO — ligado, o glifo é o ✓. */
  icon?: React.ComponentType<{ style?: React.CSSProperties; "aria-hidden"?: boolean | "true" | "false" }>;
  /** Quantas linhas este atalho entrega (a regra que vale para todos). */
  count?: number;
  testId?: string;
  title?: string;
}) {
  const isMobile = useIsMobile();
  const [focusRing, setFocusRing] = useState(false);
  const pointerRef = useRef(false);
  const base: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", gap: 6,
    height: isMobile ? 44 : 36, padding: "0 12px",
    borderRadius: 999,
    border: active ? "1.5px solid #FB923C" : "1px solid #d6d3d1",
    background: active ? "#FFF7ED" : "transparent",
    color: active ? "#c2410c" : "#57534e",
    fontSize: 12, fontWeight: active ? 700 : 600,
    cursor: "pointer", whiteSpace: "nowrap",
    transition: "background 0.15s, border 0.15s, color 0.15s",
    outline: "none",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      data-testid={testId}
      title={title}
      onMouseDown={() => { pointerRef.current = true; }}
      onFocus={() => { if (!pointerRef.current) setFocusRing(true); pointerRef.current = false; }}
      onBlur={() => setFocusRing(false)}
      style={focusRing ? { ...base, outline: "2px solid #1c1917", outlineOffset: 2 } : base}
    >
      {active
        ? <Check aria-hidden="true" style={{ width: 12, height: 12, flexShrink: 0 }} />
        : Icon && <Icon aria-hidden="true" style={{ width: 12, height: 12, flexShrink: 0 }} />}
      {label}
      {count !== undefined && (
        // #57534e sobre #e7e5e4 = 6,00:1 ✓ · #ffffff sobre #c2410c = 5,18:1 ✓
        <span style={{
          fontSize: 11, fontWeight: 700, padding: "1px 7px", borderRadius: 99, flexShrink: 0,
          backgroundColor: active ? "#c2410c" : "#e7e5e4",
          color: active ? "#ffffff" : "#57534e",
        }}>
          {count}
        </span>
      )}
    </button>
  );
}
