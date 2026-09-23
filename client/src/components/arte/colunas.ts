// As colunas da tabela da Arte e a conta de largura mínima dela.
/**
 * Colunas da lista. As larguras saíram de medir o conteúdo real renderizado, e
 * não de estimativa. Ficam aqui fora para que o colgroup e o cabeçalho usem
 * exatamente os mesmos valores — é isso que mantém as colunas alinhadas.
 *
 * As larguras foram reduzidas de propósito: a soma antiga pedia 1408px e o
 * notebook mais comum do escritório (1366, menos a sidebar de 16rem e 32px de
 * padding de cada lado) oferece ~1046. Duas mudanças pagaram a conta sem
 * apertar nenhuma célula: "Ações" saiu de 340 para 170 (exportar, ver e
 * dispensar foram para um menu "⋯" e a linha inteira ficou clicável) e
 * "Dimensões"/"Thumb-Final" voltaram ao tamanho do conteúdo real.
 * A coluna "Prazo" é nova — ver phaseDeadline em lib/arte-rules.
 *
 * SEGUNDA RODADA (o corte reportado pelo dono). Aquele aperto foi longe demais
 * e passou a cortar CABEÇALHO, que é o que nunca pode truncar: `thStyle` tem
 * overflow hidden + ellipsis, e o rótulo em 11px maiúsculo com letter-spacing
 * 0,06em mais os 24px de padding da célula pedia mais do que a coluna tinha.
 * Medido: "QTD" pede ~50px e a coluna dava 48 → virava "Q…"; "MATERIAL" pede
 * ~91 e a coluna dava 88 → truncava o cabeçalho E o material real ("Adesivo
 * transparente"); "DIMENSÕES" pede ~100 e a coluna dava exatos 100 (e o texto
 * "1000 × 2000 (sangria)" vazava, porque a célula é whiteSpace:nowrap).
 * Todas as colunas fixas agora têm folga sobre o próprio cabeçalho.
 *
 * A largura que sobrava estava toda em "Peça", a única coluna elástica: com
 * uma descrição curta ela virava um vazio de ~300px. A coluna não ficou menor
 * (ela é o lugar certo para sobra); passou a USAR o espaço, mostrando o TIPO
 * da peça além da descrição — antes `description || type` escondia o tipo
 * sempre que havia descrição, justamente na coluna chamada "Peça".
 *
 * A conta subiu de 1034/1078 para 1106/1150 (sem/com a coluna de seleção).
 * Em 1536 continua cabendo inteira; em 1366 com a sidebar aberta faltam ~60 a
 * 105px, que o scroller horizontal único da aba resolve. É a troca certa: um
 * cabeçalho truncado é um erro em toda largura, rolar 100px é um gesto.
 *
 * TERCEIRA RODADA — "Prazo" de 112 para 144. A célula deixou de empilhar data e
 * atraso em duas linhas e passou a escrever a frase inteira numa só (ver
 * components/prazo-inline). Medido no navegador, em Inter 11px: "29/07  16d
 * atrasado" pede 109,6px e o pior caso real, "15/04  120d atrasado", pede
 * 116,7px — contra 88px úteis dos 112 antigos. Em 112 a linha única só
 * existiria abreviando a data ou a palavra "atrasado", e é a palavra que
 * sustenta quem não distingue vermelho. 144 dá 120px úteis: cabe o pior caso.
 *
 * A troca é 32px de LARGURA por ~14px de ALTURA em CADA peça da fila. Numa aba
 * com 100 linhas montadas isso é mais de mil pixels de rolagem vertical contra
 * 32 de horizontal, num eixo que já tem scroller. A conta vai para 1138/1182:
 * em 1536 (e nos 1568 em que a tela foi revisada) continua inteira na janela.
 *
 * QUARTA RODADA — "Dimensões" e "M²" liam como uma coluna só. Com dados reais o
 * dono viu "1.90 (sangria) 1.71" como se fosse um valor. A causa NÃO era o
 * espaçamento: a tabela é `tableLayout: fixed` e a célula de dimensões é
 * `nowrap` SEM `overflow: hidden`, então a segunda linha simplesmente PINTAVA
 * POR CIMA da célula vizinha, encostando na área. Medido no navegador (Inter,
 * DOM real), a linha antiga "0.90 × 1.90 (sangria)" pede 108px e "10.90 ×
 * 23.15 (sangria)" pede 118 — contra os 84 ÚTEIS dos 108 antigos. Ou seja: o
 * vazamento não era um caso extremo, era o caso comum.
 *
 * Quatro mudanças, em ordem de importância:
 *  1. A célula de dimensões passou a RECORTAR (overflow hidden + reticências +
 *     valor inteiro no `title`). É a garantia estrutural: nenhum conteúdo
 *     futuro volta a invadir a coluna vizinha, em nenhuma largura.
 *  2. "Dimensões" foi de 108 para 152 — 128 úteis, exatamente o que o pior caso
 *     real pede ("SANGRIA 10.90 × 23.15", rótulo 10px + número 11px, medido no
 *     DOM). O caso comum ("SANGRIA 0.90 × 1.90") pede 112 e sobra folga; acima
 *     do pior caso entram as reticências, com o valor inteiro no `title`.
 *  3. "M²" foi de 56 para 72 (48 úteis; "252.34" em Space Grotesk 13 pede 45),
 *     alinhada à DIREITA com `tabular-nums` — medida e área são grandezas
 *     diferentes, e é o alinhamento à direita que deixa varrer a coluna de
 *     cima a baixo — e com um filete de 1px marcando a fronteira.
 *  4. Dentro da célula, a sangria deixou de ter quase o peso da medida
 *     principal: rótulo primeiro, em versalete de 10px, número em cinza AA.
 *
 * A CONTA. +60px nas duas colunas, pagos com a folga da coluna elástica: o
 * mínimo de "Peça" foi de 176 para 148. É a troca certa porque "Peça" é a única
 * coluna que QUEBRA LINHA — ela degrada com elegância, as outras truncam — e
 * porque esse mínimo só é atingido nas larguras em que a tabela já rola. O
 * total fica em 1170/1214 (sem/com a coluna de seleção): em 1536 continua
 * inteiro na janela, e em 1366 o scroller horizontal da aba resolve, como já
 * resolvia. Em 1848 (a tela do dono) sobra tudo para "Peça".
 */
export type ArteCol = { label: string; w: number | string; right?: boolean; sep?: boolean };

/**
 * O que cada cabeçalho QUER DIZER, no `title` (rodada 4). "Arte" com dois
 * ícones, "Prazo" que não é a saída do caminhão e o negrito com relógio no
 * patrocinador eram códigos que só quem já trabalhava aqui lia. Fica fora do
 * array de larguras para não mexer no orçamento de colunas.
 */
export const DICA_DA_COLUNA: Record<string, string> = {
  'Arte': 'Dois ícones: thumb de aprovação (a imagem que o patrocinador aprova) e arquivo final (o que a Gráfica imprime). Verde = já subiu; passe o mouse no thumb para ver a prévia.',
  'Prazo': 'O marco DESTA fase (não a saída do caminhão) e há quantos dias a peça está parada nela.',
  'Patroc.': 'Patrocinadores da peça. Em "Aguardando patrocinador", negrito com relógio = ainda não decidiu.',
  'Ações': 'O botão diz o próximo passo da peça; o "⋯" tem ver detalhes, prova em PDF, pular aprovação e devolver.',
};

// A LARGURA DE 'Patroc.' — a conta, e o que ela NÃO resolve.
//
// A coluna tinha 92px (68 úteis, descontados os 12+12 de padding) e 73 dos
// 142 patrocinadores cadastrados não cabem nisso. A rodada anterior já tinha
// visto o problema e alargado para 104, mas SÓ na aba Finalizados — as outras
// quatro ficaram como estavam, e é nelas que o dono viu "Banco do Br".
//
// De onde vem o espaço: 'ID' tem 116px porque em Finalizados a célula carrega
// o selo de status (ver ARTE_COLS_FINALIZADOS). Nas outras quatro abas ela
// carrega só o "#0503" — cerca de 45px de texto —, então 84 sobram de folga.
// Os 32px vão inteiros para 'Patroc.': 92 → 124, ou 100 úteis.
// O TOTAL NÃO MUDA, e isso é requisito e não coincidência: em 1568px a tabela
// mede 1246 contra 1248 disponíveis, e qualquer coluna que crescesse sem
// devolver criaria rolagem horizontal nova nessa largura.
//
// SEGUNDA RODADA (o dono viu o corte tambem em Finalizados). Sobraram 26px de
// folga REAL medida no DOM: 'Qtd' tinha 58 para mostrar "25" e 'M²' tinha 72
// para "42.75". Foram para 'Patroc.' nas duas abas — 124 → 150 na base e
// 104 → 130 em Finalizados —, e o total continua o mesmo.
//
// Em Finalizados nao ha mais de onde tirar: os 208 do ID sao pedidos por
// "Aguardando Revisao Final" (175,9), que E um status daquela aba. Entao la o
// nome longo ainda trunca — com reticencias e `title`, que e o ponto.
//
// 126 uteis cobrem a maioria, nao todos: o P95 pede 120 e o pior, 175. Por
// isso o conserto tem DUAS metades, e esta é a menor — a que importa é o chip
// passar a truncar com reticências (sponsor-chips.tsx), para que o que não
// couber se anuncie em vez de ser decepado em silêncio.
export const ARTE_COLS: ArteCol[] = [
  { label: 'ID',            w: 84 },
  // QTD DE 44 PARA 56 — o cabeçalho não cabia no próprio cabeçalho.
  //
  // O `thStyle` renderiza o rótulo em CAIXA ALTA (11px/700, letterSpacing
  // 0.06em), então a coluna precisa comportar "QTD", não "Qtd":
  //
  //   Q + T + D em 11px/700 ......... ~22,9px
  //   letterSpacing 0.06em x 3 ......  ~2,0px
  //   total .........................  ~25px
  //
  // A coluna tinha 44 e o `th` usa padding 12+12 — sobravam 20 úteis. Como o
  // `thStyle` também tem `overflow: hidden` + `textOverflow: ellipsis`, o
  // resultado era "Q…" em TODAS as abas de tabela da Arte. O dado nunca foi o
  // problema: a quantidade tem 1 a 3 dígitos e cabia folgada.
  //
  // 56 devolve 32 úteis. O orçamento aguenta: o mínimo da tabela vai de 1226
  // para 1238, ainda abaixo dos 1246 disponíveis — e o scroller próprio da
  // tabela continua sendo a rede se um dia passar.
  { label: 'Qtd',           w: 56 },
  { label: 'Peça',          w: 'auto' },
  // DIMENSÕES, M² E MATERIAL SAÍRAM COMO COLUNAS (dono, 22/09: "apenas o que
  // eles REALMENTE usam"). Os três viraram a linha secundária da coluna
  // "Peça" (renderMetaDaPeca): continuam à vista, em texto menor, e deixam de
  // custar 356px de tabela. A medição de largura que protegia "M²" contra a
  // reticência ("11....") deixa de se aplicar — o valor agora corre em texto,
  // sem coluna para cortá-lo.
  { label: 'Arte',          w: 76 },
  { label: 'Prazo',         w: 144 },
  { label: 'Patroc.',       w: 150 },
  { label: 'Ações',         w: 180, right: true },
];

/**
 * QUINTA RODADA — o selo de status pintando por cima da QUANTIDADE.
 *
 * O MESMO mecanismo das rodadas anteriores, na única aba que tem um selo de
 * status na célula de ID: `tableLayout: fixed` não alarga coluna, e o selo é
 * `whiteSpace: nowrap` (status-badge.tsx), então o que não cabe VAZA sobre a
 * vizinha. Medido no navegador, no DOM real, com Inter carregada:
 *
 *   coluna ID .................. 116px  (92 úteis, descontados os 12+12 de padding)
 *   "Pronto para Produção" ..... 153,6  → vaza 49,6px, direto sobre o "1" de Qtd
 *   "Aguardando Revisão Final" . 175,9  → vaza 71,9px, chega na coluna Peça
 *   "Em Produção" .............. 108,4  → vaza 4,4px
 *   o resto (Liberado, Produzido, Conferido, Entregue) .. 84,6 a 92,2 → cabe
 *
 * O rótulo CURTO não resolveria: o pior curto é "Em Produção" (108,4 — ele não
 * tem forma abreviada) e "Pronto Prod." pede 104,2, ambos acima dos 92 úteis.
 * Abreviar custaria a informação e ainda deixaria a sobreposição de pé.
 *
 * POR QUE UM CONJUNTO DE COLUNAS SÓ DESTA ABA. As cinco abas dividiam o mesmo
 * `ARTE_COLS`, mas têm necessidades opostas nas duas pontas da linha:
 *  · só Finalizados desenha o selo (nas outras a fase é dada pela aba), e por
 *    isso só ela precisa de uma coluna de ID grande;
 *  · só Finalizados NÃO tem botão de ação primária (`acaoPrimaria` devolve null
 *    fora de "criar-aprovações" e "finalizar-layouts"), então a coluna "Ações"
 *    dela carrega apenas o "⋯" de 36px e desperdiça 120 dos 156 úteis.
 * Uma paga a outra. Alargar ID para todas roubaria de "Peça" nas quatro abas
 * que não têm selo nenhum ali.
 *
 * A CONTA (Finalizados). ID 116 → 208: 184 úteis contra os 175,9 do pior selo,
 * 8,1px de folga — e o cabeçalho vira "ID / Status" (71,1px + 24 de padding),
 * porque uma coluna de 208px chamada só "ID" mentiria sobre o que carrega.
 * "Ações" 180 → 76: 52 úteis contra 41,5 do cabeçalho "AÇÕES" e 36 do botão
 * "⋯", que é tudo o que sobra na célula. Os 12px que sobram da troca vão para
 * "Patroc." (92 → 104), a outra coluna apertada da varredura: 80 úteis em vez
 * de 68 fazem caber "Prefeitura" (76,9) e "Bradesco" (75), que antes vazavam.
 * +92, −104 e +12: o TOTAL NÃO MUDA, fica nos mesmos 1170/1214 de antes. Isso é
 * requisito, não coincidência — em 1568 (1568 − 256 de sidebar − 64 de padding
 * = 1248 úteis) a tabela mede 1246: há 2px de sobra, e qualquer coluna que
 * crescesse sem devolver criaria rolagem horizontal NOVA nessa largura.
 */
// Finalizados mantém o total: ID vai a 208 (o selo mora lá), 'Ações' cai para
// 76 (sem botão primário, só o "⋯") e 'Patroc.' devolve 20 dos 32 que ganhou
// na base — 124 → 104 — porque ali o ID precisa de mais. +124 −104 −20 = 0:
// as duas abas somam o MESMO 1214 de sempre.
export const ARTE_COLS_FINALIZADOS: ArteCol[] = ARTE_COLS.map(c =>
  c.label === 'ID'      ? { ...c, label: 'ID / Status', w: 208 }
  : c.label === 'Ações'   ? { ...c, w: 76 }
  : c.label === 'Patroc.' ? { ...c, w: 130 }
  : c);

export const colunasDaAba = (tabId: string): ArteCol[] =>
  tabId === "finalizados" ? ARTE_COLS_FINALIZADOS : ARTE_COLS;

// Colunas fixas + um mínimo para "Peça" (largura 'auto'). Derivado, não
// hardcoded: a largura de "Ações" já mudou três vezes enquanto o número ficava
// parado, e foi isso que causou a sobreposição de colunas. Agora recebe o
// conjunto de colunas da aba pelo mesmo motivo — duas listas de largura e um
// número fixo divergiriam no primeiro ajuste.
export const ARTE_PECA_MIN_WIDTH = 148;
export const arteColsWidth = (cols: ArteCol[]) => ARTE_PECA_MIN_WIDTH
  + cols.reduce((sum, c) => sum + (typeof c.w === 'number' ? c.w : 0), 0);
// A coluna de seleção só existe em duas das quatro abas de tabela; somá-la
// sempre deixava as outras duas 44px mais largas que o necessário.
export const ARTE_CHECKBOX_WIDTH = 44;
export const tableMinWidth = (withCheckbox: boolean, cols: ArteCol[]) =>
  arteColsWidth(cols) + (withCheckbox ? ARTE_CHECKBOX_WIDTH : 0);
