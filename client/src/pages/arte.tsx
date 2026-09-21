import { useQuery, useMutation } from "@tanstack/react-query";
import { StatusBadge } from "@/components/status-badge";
import { SeloKit } from "@/components/kit/selo-kit";
import { TextoComLinks } from "@/components/texto-com-links";
import { SponsorChips } from "@/components/sponsor-chips";
import { ComentarioDoBook, comentarioDoBookValido } from "@/components/comentario-do-book";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, AlertCircle, AlertTriangle, Eye, Calendar, Truck, Check, ChevronsUpDown, Search, Upload, FileImage, Clock, Package, Send, FolderOpen, FileText, FileCheck, RotateCcw, X, ArrowRight, Paperclip, Ban, FastForward, Printer, ChevronDown, CheckSquare, Palette, ExternalLink, RefreshCw, MoreHorizontal, Lock, WifiOff, Zap, Hourglass, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { usePecaDoLink } from "@/hooks/use-peca-do-link";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn, parseDateLocal, toUTCDisplayDate, runInBatches, fileNameFromPath } from "@/lib/utils";
import { compareDisplayId } from "@/lib/displayId";
import { miniatura } from "@/lib/miniatura";
import { diasNaFase, tomDaIdade } from "@/lib/idade-na-fase";
import { EsqueletoDeFila } from "@/components/esqueleto-de-fila";
import { DEPOIS_DA_ARTE, naoDevolvivel } from "@shared/fluxo-peca";
// Motor de PDF compartilhado (mesmo da tela de Atendimento) — a Arte não tem
// mais motor próprio; qualquer ajuste de layout do book vale para as duas telas.
import { exportMixedToPDF, convertGCSUrlToLocalPath } from "@/lib/artePdfExport";
import { HIDE_NATIVE_CLOSE, modalSurface, ModalHeader, ModalFooter, FreezeWhileClosing } from "@/components/modal-shell";
import {
  getStatusLabel,
  isEventoFinalizado,
  motivoEventoFinalizado,
  avisoPecasOcultas,
  getApprovalMeta,
  P,
  type EventoFinalizadoMotivo,
} from "@/lib/status";
import { ehBookCompleto } from "@shared/fluxo-peca";
// Raio e paleta vêm de fonte, não do dedo: `R` tem cinco degraus e a Arte
// chegou a usar dezenove; `P` é a mesma paleta que os selos de status já
// consomem, e reescrever o hex dela numa tela cria uma cópia que não
// acompanha a origem.
import { R, FS } from "@/lib/theme";
import { spDayMs } from "@shared/prazo-dates";
import { useAuth } from "@/contexts/auth-context";
// Regras puras (recortes de status, predicado de filtro, prazo por fase,
// vínculo do multi-upload) — testadas em server/__tests__/arte-rules.test.ts.
import {
  FINALIZADOS_STATUSES,
  TAB_STATUSES,
  ARTE_POOL_STATUSES,
  DISPENSAVEIS_STATUSES,
  EMPTY_ARTE_FILTERS,
  countActiveFilters,
  dentroDaJanelaFinalizados,
  filtersKey,
  filtrarAtrasadasDaFase,
  compareEventUrgency,
  formatQuantity,
  isAtrasadaNaFase,
  isUrgente,
  makeDateBounds,
  matchFileToItem,
  matchesArteFilters,
  parseArteFilters,
  phaseDeadline,
  serializeArteFilters,
  PERIOD_FILTERS,
  PHASE_DEADLINE,
  ARTE_MARCOS_FAIXA,
  type ArteFilters,
  type TriState,
  type PeriodFilter,
  type ArteSortMode,
} from "@/lib/arte-rules";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Fragment, useState, useMemo, useEffect, useRef, useCallback, useDeferredValue } from "react";
import { FileUploader } from "@/components/FileUploader";
import { FilterSelect, ShortcutPill } from "@/components/filter-select";
import { EventFilterDropdown } from "@/components/event-filter-dropdown";
import { ExportPdfDialog } from "@/components/export-pdf-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { ItemDetailsDialog } from "@/components/item-details-dialog";
import { PrazoInline } from "@/components/prazo-inline";
import { Link } from "wouter";
import { useIsMobile } from "@/hooks/use-mobile";
import { SoQuandoMudar } from "@/components/arte/so-quando-mudar";
import { BuscarArteDialog, type ArteEncontrada } from "@/components/buscar-arte-dialog";

// Quantas linhas a tabela monta por vez. O resto entra por "Carregar mais".
const ARTE_PAGE_SIZE = 100;

// VAZIO ESTÁVEL para o `data` das queries enquanto carregam: `= []` criava um
// array novo a cada render e invalidava toda a cadeia de memos (allItems,
// baldes, facetas) em cada render do carregamento.
const SEM_DADOS: any[] = [];

// Quantos eventos aparecem no resumo antes do "mais N". Oito costuma caber em
// uma linha em telas de trabalho; o resto entra por expansão.
const EVENT_CHIPS_VISIBLE = 8;
// "Quem está travando": só os piores ficam à vista (mesma cura da régua de
// eventos logo abaixo). Em produção a faixa chegou a 40+ marcas com o mesmo
// peso visual — "design péssimo" (dono, 26/08); o olho não tinha onde pousar.
const TRAVANDO_CHIPS_VISIBLE = 8;

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
type ArteCol = { label: string; w: number | string; right?: boolean; sep?: boolean };

/**
 * O que cada cabeçalho QUER DIZER, no `title` (rodada 4). "Arte" com dois
 * ícones, "Prazo" que não é a saída do caminhão e o negrito com relógio no
 * patrocinador eram códigos que só quem já trabalhava aqui lia. Fica fora do
 * array de larguras para não mexer no orçamento de colunas.
 */
const DICA_DA_COLUNA: Record<string, string> = {
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
/**
 * IDADE NA FASE — há quanto tempo a peça está parada onde está.
 *
 * Deriva de `statusChangedAt` (a última mudança de status, gravada pelo
 * servidor a cada transição). Peça SEM esse registro não exibe idade:
 * inferir da criação daria um número plausível e errado — uma peça criada há
 * oito meses que entrou na fase ontem apareceria como "há 240d", e quem
 * procura gargalo agiria sobre isso.
 */
// (UX 27/08) diasNaFase/tomDaIdade viraram fonte única em lib/idade-na-fase —
// a MESMA régua agora aparece na Gráfica e no Atendimento.
const PARADA_HA_MAIS_DE = 7;
const estaParada = (item: any, hoje: Date) => (diasNaFase(item, hoje) ?? -1) > PARADA_HA_MAIS_DE;

const ARTE_COLS: ArteCol[] = [
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
  { label: 'Dimensões',     w: 152 },
  // M² VOLTOU PARA 72. Eu tinha apertado de 72 para 60 numa passada de
  // orçamento de colunas, contra a medição que uma rodada ANTERIOR já tinha
  // feito e registrado logo acima. 60 deixa 36 úteis (descontados os 12+12 de
  // padding) e o maior valor real da base pede exatamente 36 — "86.40",
  // "44.46", "40.09", medidos em Space Grotesk 600 13px sobre os 3.187 itens
  // de produção. Empate não cabe: a elipse dispara e a metragem virava
  // "11...." em TODAS as abas da Arte, porque Finalizados não sobrescreve
  // esta coluna. 72 devolve 48 úteis, os mesmos que a rodada anterior tinha
  // dimensionado para "252.34" (45px).
  //
  // Não precisa tirar de ninguém: `arteColsWidth` é DERIVADO da soma das
  // fixas mais o mínimo de "Peça". O mínimo da tabela foi de 1214 para 1226
  // nesta rodada, e para 1238 quando a coluna Qtd subiu para 56 (ver acima) —
  // ainda abaixo dos 1246 disponíveis.
  { label: 'M²',            w: 72, right: true, sep: true },
  { label: 'Material',      w: 132 },
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
const ARTE_COLS_FINALIZADOS: ArteCol[] = ARTE_COLS.map(c =>
  c.label === 'ID'      ? { ...c, label: 'ID / Status', w: 208 }
  : c.label === 'Ações'   ? { ...c, w: 76 }
  : c.label === 'Patroc.' ? { ...c, w: 130 }
  : c);

const colunasDaAba = (tabId: string): ArteCol[] =>
  tabId === "finalizados" ? ARTE_COLS_FINALIZADOS : ARTE_COLS;

// Colunas fixas + um mínimo para "Peça" (largura 'auto'). Derivado, não
// hardcoded: a largura de "Ações" já mudou três vezes enquanto o número ficava
// parado, e foi isso que causou a sobreposição de colunas. Agora recebe o
// conjunto de colunas da aba pelo mesmo motivo — duas listas de largura e um
// número fixo divergiriam no primeiro ajuste.
const ARTE_PECA_MIN_WIDTH = 148;
const arteColsWidth = (cols: ArteCol[]) => ARTE_PECA_MIN_WIDTH
  + cols.reduce((sum, c) => sum + (typeof c.w === 'number' ? c.w : 0), 0);
// A coluna de seleção só existe em duas das quatro abas de tabela; somá-la
// sempre deixava as outras duas 44px mais largas que o necessário.
const ARTE_CHECKBOX_WIDTH = 44;
const tableMinWidth = (withCheckbox: boolean, cols: ArteCol[]) =>
  arteColsWidth(cols) + (withCheckbox ? ARTE_CHECKBOX_WIDTH : 0);

/**
 * Cor de cada fase. Um par por aba: `dot` (tom 500, saturado) só entra em
 * fundo/borda/selo, `text` é sempre o tom 700 — o mesmo critério do
 * StatusBadge em lib/status.ts.
 *
 * Antes o mapa tinha QUATRO chaves para CINCO abas: "Aguardando Patrocinador"
 * caía no fallback e ficava com a cor idêntica à primeira aba e sem ícone
 * nenhum. E a cor saturada era usada COMO texto — as cinco abas reprovavam AA
 * (a primeira usava #f97316, proibido como texto pela regra da casa).
 * Contrastes recalculados sobre branco: #c2410c 5,1:1 · #b45309 5,0:1 ·
 * #b91c1c 6,5:1 · #0e7490 5,4:1 · #15803d 5,0:1 — todos passam em 13px.
 */
const TAB_THEME: Record<string, { dot: string; text: string; tint: string }> = {
  "criar-aprovacoes":        { dot: '#f97316', text: '#c2410c', tint: '#fff7ed' },
  "aguardando-patrocinador": { dot: '#f59e0b', text: '#b45309', tint: '#fffbeb' },
  "correcao":                { dot: '#ef4444', text: '#b91c1c', tint: '#fef2f2' },
  "finalizar-layouts":       { dot: '#06b6d4', text: '#0e7490', tint: '#ecfeff' },
  "finalizados":             { dot: '#22c55e', text: '#15803d', tint: '#f0fdf4' },
};

/**
 * O QUE SE FAZ EM CADA FASE, em uma frase (rodada 4, primeiro uso).
 *
 * As abas diziam ONDE a peça está e nunca o que a Arte faz com ela ali. Quem
 * chegava via "Aguardando patrocinador" com vinte peças e nenhum botão não
 * sabia se era defeito, espera ou tarefa; e "thumb" × "arquivo final" só se
 * aprendia errando. A frase mora no topo da lista (área rolável, custa uma
 * linha) e no `title` da aba. O texto descreve o fluxo que JÁ existe — não
 * promete nada que o servidor não faça.
 */
const GUIA_DA_FASE: Record<string, string> = {
  "criar-aprovacoes": "Suba o thumb (a imagem que o patrocinador aprova) e envie para aprovação. Peças do Kit ficam sempre no topo.",
  "aguardando-patrocinador": "Nada a fazer aqui: o Atendimento registra a decisão de cada patrocinador. Se alguém reprovar, a peça volta na aba Correção.",
  "correcao": "O patrocinador reprovou: leia o motivo, refaça a arte e envie a nova versão — ela volta para quem ainda não aprovou e para os patrocinadores com aprovação estrita, que reaprovam toda versão nova.",
  "finalizar-layouts": "Arte aprovada: cole o caminho do arquivo final (o que a Gráfica imprime) e envie para a revisão de quem pediu a peça.",
  "finalizados": "Consulta: peças já com arquivo final. Dá para trocar o arquivo final ou o thumb sem reabrir a aprovação.",
};

/**
 * Semáforo de prazo. Fundo sólido claro com texto escuro — o dado mais urgente
 * é o que mais precisa ser lido, e em tom claro sobre translúcido ele ficava em
 * 1,34:1 (medido no navegador). Todos os pares abaixo passam AA em 11px.
 *
 * ESCOPO: só os chips de marco da FAIXA DO EVENTO (a barra escura no topo de
 * cada bloco), onde três marcos aparecem UMA vez por evento e o preenchimento é
 * o que os separa do fundo #1c1917. A célula da coluna "Prazo" NÃO usa mais
 * isto: lá o mesmo selo se repetia peça por peça e virava um bloco de cor por
 * linha — ver components/prazo-inline. Preenchimento é para o que aparece uma
 * vez; texto é para o que aparece trinta.
 */
function semaforoPrazo(diff: number): { bg: string; border: string; text: string } {
  if (diff < 0) return { bg: '#fee2e2', border: '#fca5a5', text: '#991b1b' };
  if (diff === 0) return { bg: '#fef3c7', border: '#fcd34d', text: '#92400e' };
  if (diff <= 3) return { bg: '#ffedd5', border: '#fdba74', text: '#9a3412' };
  // Dentro do prazo = VERDE (dono, 17/09: "com base se passou ou não do
  // prazo"). Era cinza, e o marco folgado se lia como "sem informação" ao lado
  // do vermelho — agora a faixa diz de relance o que passou e o que não.
  // #166534 sobre #dcfce7 ≈ 6,5:1 (AA).
  return { bg: '#dcfce7', border: '#86efac', text: '#166534' };
}

/**
 * Cor do chip de evento pelo VOLUME de peças (dono, 17/09: "com base na
 * quantidade"). Quatro degraus relativos ao maior evento da lista: quem tem
 * mais trabalho aparece no laranja mais forte, o evento pequeno fica claro. O
 * número continua escrito — a cor só acelera o ranking. Texto 700–900 sobre
 * fundo 50–100 (AA em todos os degraus); o selo do número inverte no degrau
 * mais alto para o maior evento saltar.
 */
function corPorVolume(count: number, maior: number): { bg: string; border: string; text: string; seloBg: string; seloText: string } {
  const r = maior > 0 ? count / maior : 0;
  if (r >= 0.75) return { bg: '#ffedd5', border: '#fb923c', text: '#9a3412', seloBg: '#c2410c', seloText: '#ffffff' };
  if (r >= 0.5) return { bg: '#fff7ed', border: '#fdba74', text: '#9a3412', seloBg: '#fed7aa', seloText: '#7c2d12' };
  if (r >= 0.25) return { bg: '#fffbeb', border: '#fcd34d', text: '#92400e', seloBg: '#fef3c7', seloText: '#78350f' };
  return { bg: '#ffffff', border: '#e7e5e4', text: '#1c1917', seloBg: '#f5f5f4', seloText: '#44403c' };
}

/**
 * Tecla de atalho desenhada como tecla. Os atalhos desta tela (Ctrl+V para
 * colar o thumb) existiam escritos no meio de frases de rodapé, e quem não lê
 * o rodapé inteiro nunca os descobria. Contraste: #44403c sobre #fafaf9 ≈ 9,9:1.
 */
const KBD: React.CSSProperties = {
  display: 'inline-block', minWidth: 18, padding: '0 5px', margin: '0 1px',
  borderRadius: 4, border: '1px solid #d6d3d1', borderBottomWidth: 2,
  background: '#fafaf9', color: '#44403c',
  fontFamily: '"DM Mono", ui-monospace, monospace', fontSize: 10.5, fontWeight: 600,
  lineHeight: '16px', textAlign: 'center',
};

/** Item do menu "⋯" — mesma altura de alvo de toque dos botões da linha. */
function menuItemStyle(color: string): React.CSSProperties {
  return {
    width: '100%', display: 'flex', alignItems: 'center', gap: 9,
    minHeight: 38, padding: '0 10px', borderRadius: 6,
    background: 'none', border: 'none', cursor: 'pointer',
    fontSize: 13, fontWeight: 600, color, textAlign: 'left',
    transition: 'background 0.12s',
  };
}

/**
 * Ícone de thumb com prévia ao passar o mouse OU ao focar por teclado.
 * A coluna mostrava só um ícone verde ou cinza: conferir se a arte anexada é a
 * certa exigia abrir o modal peça por peça — justamente o único risco do envio
 * de um clique, que é mandar o thumb errado.
 */
function ThumbPreview({ url, label }: { url?: string | null; label: string }) {
  // `position: fixed` calculado a partir do retângulo da âncora, e não
  // `position: absolute` dentro da linha.
  //
  // PORQUÊ. A prévia é filha da <td>, e a aba inteira vive dentro de UM
  // contêiner de rolagem horizontal. Um contêiner com overflow-x diferente de
  // `visible` RECORTA também na vertical (a regra do CSS é que o eixo restante
  // computa para `auto`), então a prévia, que abre para cima, era cortada pela
  // borda de cima do scroller em toda linha do começo do bloco — aparecia só a
  // metade de baixo. Coordenada de viewport não é recortada por ancestral
  // nenhum, e ainda vira para baixo quando não há espaço em cima.
  const [caixa, setCaixa] = useState<{ left: number; top: number; acima: boolean } | null>(null);
  const ancoraRef = useRef<HTMLAnchorElement>(null);
  const abrir = () => {
    const r = ancoraRef.current?.getBoundingClientRect();
    if (!r) return;
    const LARGURA = 248;
    const ALTURA = 208;
    const acima = r.top > ALTURA + 12;
    setCaixa({
      left: Math.min(Math.max(8, r.left + r.width / 2 - LARGURA / 2), window.innerWidth - LARGURA - 8),
      top: acima ? r.top - ALTURA - 6 : r.bottom + 6,
      acima,
    });
  };
  const aberto = caixa !== null;
  if (!url) {
    return (
      <span title="Sem thumb" style={{ width: 26, height: 26, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f4', color: '#78716c', flexShrink: 0 }}>
        <FileImage style={{ width: 13, height: 13 }} />
      </span>
    );
  }
  // PDF não vira <img>: o mesmo teste que o card de correção já usava.
  const isImage = /\.(png|jpg|jpeg|gif|webp)/i.test(url) || url.startsWith('/objects/');
  return (
    <span style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
      <a
        ref={ancoraRef}
        href={url} target="_blank" rel="noopener noreferrer"
        title={`Ver ${label}`}
        onMouseEnter={abrir}
        onMouseLeave={() => setCaixa(null)}
        onFocus={abrir}
        onBlur={() => setCaixa(null)}
        style={{ width: 26, height: 26, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0' }}
      >
        <FileImage style={{ width: 13, height: 13 }} />
      </a>
      {aberto && isImage && caixa && (
        <span
          role="presentation"
          style={{
            position: 'fixed', left: caixa.left, top: caixa.top,
            zIndex: 60, padding: 4, borderRadius: 8, background: '#ffffff',
            border: '1px solid #e7e5e4', boxShadow: '0 12px 32px rgba(0,0,0,0.18)',
            pointerEvents: 'none',
          }}
        >
          <img loading="lazy" decoding="async" src={miniatura(url)} alt="" style={{ display: 'block', width: 240, maxHeight: 200, objectFit: 'contain', borderRadius: 6 }} />
        </span>
      )}
    </span>
  );
}

// Lista estática — fora do componente para não ser recriada a cada render
// (ela entrava nas deps do activeChips e o invalidava sempre).
const months = [
  { value: "all", label: "Todos os meses" },
  { value: "1", label: "Janeiro" }, { value: "2", label: "Fevereiro" },
  { value: "3", label: "Março" }, { value: "4", label: "Abril" },
  { value: "5", label: "Maio" }, { value: "6", label: "Junho" },
  { value: "7", label: "Julho" }, { value: "8", label: "Agosto" },
  { value: "9", label: "Setembro" }, { value: "10", label: "Outubro" },
  { value: "11", label: "Novembro" }, { value: "12", label: "Dezembro" },
];

// Critérios de ordenação. Fora do componente pela mesma razão de `months`, e
// `pinned` porque a ordem aqui é DELIBERADA: "Evento" é o padrão e vem
// primeiro. Alfabética poria "Prazo da fase" antes.
const ARTE_SORT_OPTIONS = [
  { value: "evento", label: "Evento", pinned: true },
  { value: "prazo", label: "Prazo da fase", pinned: true },
];

/**
 * "Buscar arte já feita" — o gêmeo do botão de subir arquivo, ao lado dele.
 *
 * Fica ONDE HOJE SE SOBE a thumb ou o arquivo, porque é ali que nasce a
 * pergunta do dono: "essa arte eu já fiz, não dá para achar?". Dois tamanhos:
 * `cheio` para a zona de upload vazia (o outro caminho tem o mesmo peso do
 * "Escolher arquivo") e `discreto` para as linhas de troca, onde o gesto
 * principal já existe.
 */
function BotaoBuscarArte({ onClick, variante = "cheio", testId }: {
  onClick: () => void;
  variante?: "cheio" | "discreto";
  testId: string;
}) {
  const cheio = variante === "cheio";
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      title="Reaproveitar uma arte já enviada no app, sem subir o arquivo de novo"
      style={cheio
        ? {
            // 44px de alvo: o modal da Arte também abre no celular.
            minHeight: 44, padding: '0 16px', borderRadius: 8, cursor: 'pointer',
            border: '1px solid #d6d3d1', background: '#ffffff', color: '#1c1917',
            fontSize: 13, fontWeight: 600,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
            transition: 'background 0.12s',
          }
        : {
            minHeight: 44, padding: '0 10px', borderRadius: 8, cursor: 'pointer',
            border: 'none', background: 'transparent', color: '#44403c',
            fontSize: 12, fontWeight: 700, textDecoration: 'underline', textUnderlineOffset: 2,
            display: 'inline-flex', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
          }}
      onMouseEnter={(e) => { if (cheio) e.currentTarget.style.background = '#fafaf9'; }}
      onMouseLeave={(e) => { if (cheio) e.currentTarget.style.background = '#ffffff'; }}
    >
      <Sparkles aria-hidden="true" style={{ width: 14, height: 14 }} />
      Buscar arte já feita
    </button>
  );
}

/**
 * Miniatura da nova versão na Correção. Antes testava a EXTENSÃO na URL para
 * decidir entre imagem e ícone de arquivo — e o upload devolve
 * `/objects/uploads/<uuid>`, sem extensão: toda imagem subida (ou
 * reaproveitada pelo "Buscar arte já feita") aparecia como PDF. Agora tenta a
 * miniatura sempre e só cai no ícone quando o navegador não consegue pintar
 * (PDF de verdade). `key={url}` no uso zera o `falhou` a cada arquivo novo.
 */
function MiniaturaDaCorrecao({ url }: { url: string }) {
  const [falhou, setFalhou] = useState(false);
  return (
    <div style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: '#15803d', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
      {falhou
        ? <FileText style={{ width: 15, height: 15, color: '#fff' }} />
        : <img loading="lazy" decoding="async" src={miniatura(url)} alt="" onError={() => setFalhou(true)} style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 8 }} />}
    </div>
  );
}

/** O que GET /api/artes/sugestao-final devolve (ou null). */
interface SugestaoDeArquivoFinal {
  finalFileUrl: string;
  finalFileName: string | null;
  displayId: string | null;
  tipo: string;
  descricao: string | null;
  evento: string | null;
  quando: string | null;
}

export default function Arte() {
  const { toast } = useToast();
  const { user } = useAuth();
  // Gate de papel. A rota admite `atendimento` (App.tsx: ROLES_ARTE), mas as
  // sete rotas de escrita da Arte no servidor só aceitam `arte`/`admin`. Sem
  // este espelho, o papel descobria o que não pode fazer ação por ação — e o
  // multi-upload chegava a subir 40 imagens para o bucket antes de tomar 40
  // respostas 403. Mesmo padrão de atendimento.tsx (canDecide) e grafica.tsx
  // (canProduce), as duas telas irmãs que já admitem um segundo papel.
  const podeEditar = ["arte", "admin"].includes(user?.role ?? "");

  // ── Estado inicial vindo da URL ──────────────────────────────────────────
  // O recorte "evento X + sem thumb + saída 10 dias" era remontado do zero todo
  // dia e não dava para mandar para um colega. Dez telas do app já sincronizam
  // com URLSearchParams; esta passa a ser a décima primeira.
  const urlInicial = useMemo(() => parseArteFilters(window.location.search), []);

  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [eventFilter, setEventFilter] = useState<string[]>(urlInicial.filters.eventIds);
  // Persiste a aba ativa para não voltar ao padrão ao abrir uma peça e retornar.
  // A URL vence o sessionStorage: link compartilhado tem de abrir na fase certa.
  const [activeTab, setActiveTab] = useState<string>(
    () => urlInicial.tab || sessionStorage.getItem("arte:activeTab") || "criar-aprovacoes",
  );
  useEffect(() => { sessionStorage.setItem("arte:activeTab", activeTab); }, [activeTab]);

  // A aba ativa é persistida: quem voltar numa janela estreita precisa
  // ENXERGAR onde está, e não só poder rolar até lá.
  useEffect(() => {
    const alvo = tablistRef.current?.querySelector('[aria-selected="true"]');
    alvo?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [activeTab]);

  // Quem rola nesta tela é a área de conteúdo (o <main> do app é overflow:hidden),
  // por isso o scroll precisa ser feito nela e não na window.
  const contentRef = useRef<HTMLDivElement>(null);
  const tablistRef = useRef<HTMLDivElement>(null);

  // Paginação da tabela — ver comentário em renderGroupedTable.
  const [visibleCount, setVisibleCount] = useState(ARTE_PAGE_SIZE);
  const [showAllEvents, setShowAllEvents] = useState(false);
  const [showAllTravando, setShowAllTravando] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());

  // Trocar de aba troca a lista inteira; manter o scroll onde estava deixava o
  // usuário no meio da tabela nova. Sempre volta ao topo da listagem.
  const changeTab = useCallback((tabId: string) => {
    setActiveTab(tabId);
    setVisibleCount(ARTE_PAGE_SIZE);
    // A seleção sobrevivia à troca de aba e alimentava a exportação sem
    // aparecer em lugar nenhum: em "Correção" o botão de seleção nem é
    // renderizado, mas o cabeçalho continuava dizendo "Exportar N sel.".
    setSelectedItemIds(new Set());
    requestAnimationFrame(() => {
      contentRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    });
  }, []);
  const [finalFileUrl, setFinalFileUrl] = useState<string>("");
  const [finalFileName, setFinalFileName] = useState<string>("");
  // true quando a Arte trocou o caminho nesta sessão (evita "atualizar" sem mudar).
  const [finalDirty, setFinalDirty] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string[]>(urlInicial.filters.types);
  const [materialFilter, setMaterialFilter] = useState<string[]>(urlInicial.filters.materials);
  const [next10DaysFilter, setNext10DaysFilter] = useState(urlInicial.filters.next10Days);
  const [monthFilter, setMonthFilter] = useState<string[]>(urlInicial.filters.months);
  const [approvalThumbUrl, setApprovalThumbUrl] = useState<string>("");
  const [approvalThumbPreview, setApprovalThumbPreview] = useState<string>("");
  const [savedApprovalThumbUrl, setSavedApprovalThumbUrl] = useState<string>("");
  const [thumbJustSaved, setThumbJustSaved] = useState(false);
  const [searchFilter, setSearchFilter] = useState<string>(urlInicial.filters.search);
  // Adia o valor usado na filtragem: o input segue responsivo, mas a tabela
  // (grande) não re-renderiza a cada tecla — evita engasgo com muitas peças.
  const deferredSearch = useDeferredValue(searchFilter);
  // Ordenação dos blocos: por evento (A→Z) ou pela urgência do marco da fase.
  // A regra de negócio inteira gira em torno da saída do caminhão e a lista só
  // sabia ordenar por nome de evento.
  // Vem da URL como o resto do recorte: quem manda "a fila por prazo" para um
  // colega está mandando a ORDEM junto — sem isto o link abria em A→Z e a
  // primeira linha do print não era a primeira linha da tela do outro.
  const [sortMode, setSortMode] = useState<ArteSortMode>(urlInicial.sort);
  // A aba Finalizados acumula todo o histórico e nunca para de crescer.
  const [finalizadosTudo, setFinalizadosTudo] = useState(false);

  const [showBulkDialog, setShowBulkDialog] = useState(false);
  const [sharedPdfUrl, setSharedPdfUrl] = useState<string>("");

  const [correcaoItem, setCorrecaoItem] = useState<any>(null);
  const [correcaoThumbUrl, setCorrecaoThumbUrl] = useState<string>("");
  const [correcaoFileName, setCorrecaoFileName] = useState<string>("");
  const [correcaoSponsorFilter, setCorrecaoSponsorFilter] = useState<string>("all");
  const [sponsorFilter, setSponsorFilter] = useState<string[]>(urlInicial.filters.sponsorIds);
  // Tri-estado no lugar dos pares "sem/com": ligados juntos, os dois booleanos
  // descartavam TUDO por construção e a lista esvaziava com o vazio genérico
  // de "2 filtros ativos". Um controle, três valores, nenhum estado impossível.
  const [thumbFilter, setThumbFilter] = useState<TriState>(urlInicial.filters.thumb);
  const [finalFilter, setFinalFilter] = useState<TriState>(urlInicial.filters.final);
  const [urgenteFilter, setUrgenteFilter] = useState(urlInicial.filters.urgente);
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>(urlInicial.filters.period);
  // Só o que passou do marco da FASE — ver isAtrasadaNaFase em lib/arte-rules.
  const [atrasadoFilter, setAtrasadoFilter] = useState(urlInicial.filters.atrasado);
  // "Paradas há mais de 7d nesta fase" — recorte local desta tela. Fica fora
  // de ArteFilters porque lib/arte-rules é só leitura; a URL ganha o
  // parâmetro aqui mesmo, ao lado dos outros.
  const [paradasFilter, setParadasFilter] = useState<boolean>(() => new URLSearchParams(window.location.search).get("paradas") === "1");

  // Âncora de "hoje" ESTÁVEL. `makeDateBounds()` era chamada dentro de quatro
  // memos e de novo em cada passada de renderGroupedTable: a memoização era
  // decorativa (marco novo a cada render) e, numa aba aberta durante a virada
  // do dia, duas partes da mesma tela podiam responder dias diferentes. Um
  // estado com tique de 10 min dá o mesmo padrão da Gráfica (`agora`): a data
  // só muda quando o relógio muda, e aí a tela inteira muda junto.
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setAgora(Date.now()), 600_000);
    return () => clearInterval(id);
  }, []);
  const dateBounds = useMemo(() => makeDateBounds(new Date(agora)), [agora]);
  const hoje = dateBounds.today;

  const isMobile = useIsMobile();
  // FILTROS RECOLHIDOS NO CELULAR. O cabeçalho é fixo (`flexShrink: 0`) e,
  // aberto por inteiro em 390px, as duas faixas de filtro (sete gatilhos e
  // quatro segmentados de 44px) somavam mais de uma tela: a lista ficava com
  // uma fresta de rolagem. A busca e a fase continuam sempre à vista; o resto
  // abre num toque, e o recorte ativo segue escrito nos chips.
  const [filtrosAbertosMobile, setFiltrosAbertosMobile] = useState(false);
  const [dispenseItem, setDispenseItem] = useState<any>(null);
  const [dispenseReason, setDispenseReason] = useState<string>("");
  // Devolver ao solicitante: a peça volta para RASCUNHO e quem a criou decide
  // se continua ou descarta (regra do dono). É o oposto de "dispensar", que
  // empurra a peça para frente — esta a manda para o começo do fluxo.
  const [devolverItem, setDevolverItem] = useState<any>(null);
  const [devolverMotivo, setDevolverMotivo] = useState<string>("");
  /** Mesma régua do servidor (lerMotivoDevolucao, routes/items.ts). */
  const MOTIVO_MIN = 10;
  const motivoCurto = (t: string) => t.trim().replace(/\s+/g, " ").length < MOTIVO_MIN;
  // Devolver vale de QUALQUER estado (decisão do dono, 24/08) — menos do
  // próprio rascunho. As regras moram em shared/fluxo-peca.ts: o servidor
  // decide com as MESMAS listas que este diálogo usa para avisar.
  // Trava só a linha em curso: o estado da mutação é compartilhado, então
  // enquanto um envio direto corria TODAS as linhas ficavam desabilitadas.
  const [sendingId, setSendingId] = useState<string | null>(null);

  const { data: pecasDoServidor = SEM_DADOS, isLoading, isError, error, refetch } = useQuery<any[]>({
    queryKey: ["/api/items"],
  });

  const {
    data: correcaoDoServidor = SEM_DADOS,
    isLoading: correcaoLoading,
    isError: correcaoIsError,
    error: correcaoError,
    refetch: refetchCorrecao,
  } = useQuery<any[]>({
    queryKey: ["/api/items/resubmission-needed"],
  });

  // ── Evento FINALIZADO sai das filas ───────────────────────────────────────
  // Duas origens, um gate só (`motivoEventoFinalizado`, @shared/prazo-dates):
  //   · "encerrado" → um admin clicou em Encerrar evento. A confirmação promete,
  //     em voz alta, que o evento "sai da Gestão de Prazos e das filas".
  //   · "realizado" → a DATA DO EVENTO (events.startDate — não a saída do
  //     caminhão, que é sempre anterior) já passou. Regra do dono: não se
  //     trabalha mais em evento que já aconteceu. Durante o DIA do evento a
  //     peça ainda aparece; ela sai depois da virada do dia em São Paulo.
  //     Evento SEM data de início nunca some por esta regra.
  //
  // O recorte é do CLIENTE e não de /api/items: o Detalhe do Evento e o Painel
  // Geral leem a MESMA chave e a lista de peças precisa continuar aparecendo lá
  // — a Arte é tela de AÇÃO, aqueles são registro.
  //
  // `item.event` vem CRU do storage (nunca passa por enrichEvent), então o
  // status chega como "closed" e a data como `startDate` — as duas colunas que
  // o predicado lê.
  const hojeBusinessMs = useMemo(() => spDayMs(new Date(agora)), [agora]);
  const allItems = useMemo(
    // BOOK COMPLETO fica de fora: é o trâmite do Atendimento, não uma peça
    // (ver shared/fluxo-peca). A CORREÇÃO não passa por aqui (vem de
    // /api/items/resubmission-needed): reprovada, a peça-book continua com
    // porta de reenvio da v2.
    () => (pecasDoServidor as any[]).filter((i: any) => !isEventoFinalizado(i.event, hojeBusinessMs) && !ehBookCompleto(i)),
    [pecasDoServidor, hojeBusinessMs],
  );
  // AUDITORIA 27/08: mapa id→peça para os pontos que buscavam com
  // allItems.find dentro de map/filter — seleção de 200 peças sobre ~1.000
  // itens eram 200.000 comparações por render do painel de lote.
  const itemPorId = useMemo(() => {
    const m = new Map<string, any>();
    for (const i of allItems as any[]) m.set(i.id, i);
    return m;
  }, [allItems]);
  const correcaoItems = useMemo(
    () => (correcaoDoServidor as any[]).filter((i: any) => !isEventoFinalizado(i.event, hojeBusinessMs)),
    [correcaoDoServidor, hojeBusinessMs],
  );

  // Quantas peças o recorte acima tirou das abas, POR MOTIVO. Esconder sem
  // dizer que escondeu faria "Nenhuma peça aguardando envio" ler como "nada a
  // fazer" quando, na verdade, um admin encerrou o evento ou ele já aconteceu —
  // e as duas frases são diferentes (só a primeira tem volta). Conta só o que
  // APARECERIA (as abas têm statuses próprios) e deduplica: a peça em correção
  // também está em /api/items.
  const pecasOcultas = useMemo(() => {
    const statusDasAbas = new Set(Object.values(TAB_STATUSES).flat());
    const vistos = new Map<string, EventoFinalizadoMotivo>();
    for (const item of pecasDoServidor as any[]) {
      const motivo = motivoEventoFinalizado(item.event, hojeBusinessMs);
      if (!motivo) continue;
      if (!statusDasAbas.has(item.status)) continue;
      vistos.set(item.id, motivo);
    }
    for (const item of correcaoDoServidor as any[]) {
      const motivo = motivoEventoFinalizado(item.event, hojeBusinessMs);
      if (motivo) vistos.set(item.id, motivo);
    }
    let encerrado = 0, realizado = 0;
    vistos.forEach((m) => { if (m === "encerrado") encerrado++; else realizado++; });
    return { encerrado, realizado };
  }, [pecasDoServidor, correcaoDoServidor, hojeBusinessMs]);
  // Uma frase só, montada pela fonte única (lib/status) — as cinco filas
  // contam a mesma história com as mesmas palavras.
  const avisoOcultas = useMemo(
    () => avisoPecasOcultas(pecasOcultas, "destas abas"),
    [pecasOcultas],
  );

  const { data: events = SEM_DADOS } = useQuery<any[]>({
    queryKey: ["/api/events"],
  });

  /**
   * A peça aberta no modal é DERIVADA da lista viva, não uma cópia congelada
   * guardada no clique. Com a cópia, trocar o thumb não repintava a miniatura,
   * o bloco "versão anterior guardada" nunca aparecia, e se outra pessoa
   * movesse a peça os blocos de ação continuavam desenhados pelo status velho
   * (o envio devolvia 409 com a chave em inglês no toast).
   */
  const selectedItem = useMemo(() => {
    if (!selectedItemId) return null;
    // Mesma precedência do `[...allItems, ...correcaoItems].find` de antes (a
    // lista principal primeiro), sem copiar 5 mil peças num array novo a cada
    // atualização da lista só para achar uma.
    return itemPorId.get(selectedItemId)
      ?? (correcaoItems as any[]).find((i: any) => i.id === selectedItemId)
      ?? null;
  }, [selectedItemId, itemPorId, correcaoItems]);

  /**
   * O 409 de submit-for-approval traz a chave crua do status ("Status atual:
   * awaiting_sponsor_approval"). Traduz pelo mesmo dicionário dos selos antes
   * de mostrar — o designer não fala o vocabulário do banco.
   */
  const mensagemDeErro = useCallback((e: unknown): string => {
    const msg = e instanceof Error ? e.message : String(e ?? "");
    return msg.replace(/[a-z]+(?:_[a-z]+)+/g, (chave) => {
      const label = getStatusLabel(chave);
      return label === chave ? chave : label;
    });
  }, []);

  // Histórico DA PEÇA aberta, com escopo no servidor. A versão anterior
  // baixava a listagem GLOBAL, que tem teto de 500 registros — com o volume
  // atual, os logs das peças mais antigas saíam da janela e a ficha mostrava
  // só "Criado", como se a peça não tivesse história ("itens sem histórico",
  // bug reportado pelo dono com print). O escopo devolve a trilha inteira da
  // peça, e barata.
  const { data: auditLogs = [] } = useQuery<any[]>({
    queryKey: ["/api/audit-logs", "item", selectedItem?.id],
    queryFn: () =>
      fetch(`/api/audit-logs?entityType=item&entityId=${selectedItem!.id}`, { credentials: "include" })
        .then(r => r.ok ? r.json() : Promise.reject(new Error(`Falha ao carregar o histórico (HTTP ${r.status})`))),
    select: d => (Array.isArray(d) ? d : []),
    enabled: !!selectedItem?.id,
    placeholderData: [],
  });
  const { data: standardItems = SEM_DADOS } = useQuery<any[]>({ queryKey: ['/api/standard-items'] });
  // Resolve o grupo pai (do catálogo de Modelos) para um item, tolerante a
  // maiúscula/acento/espaço. Casa o type do item tanto com o NOME de um modelo
  // (name → group) quanto diretamente com um NOME DE GRUPO do catálogo — assim
  // itens importados da planilha (ex.: type "Rolo") caem no grupo "ROLO".
  const normKey = (s: string) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
  const groupMaps = useMemo(() => {
    const byName: Record<string, string> = {};
    const byGroup: Record<string, string> = {};
    (standardItems as any[]).forEach((s: any) => {
      if (s.group) {
        byName[normKey(s.name)] = s.group;
        byGroup[normKey(s.group)] = s.group; // recupera a grafia canônica do grupo
      }
    });
    return { byName, byGroup };
  }, [standardItems]);
  // Cache por TIPO: a ordenação da fila chama groupOf duas vezes por
  // comparação, e `normKey` faz normalize("NFD") + três regex. Com 3 mil peças
  // em Finalizados eram ~70 mil normalizações por ordenação; os tipos distintos
  // são poucas dezenas. O cache nasce de novo quando o catálogo muda.
  const grupoPorTipo = useMemo(() => new Map<string, string>(), [groupMaps]);
  const groupOf = (type: string): string => {
    const guardado = grupoPorTipo.get(type);
    if (guardado !== undefined) return guardado;
    const k = normKey(type);
    const grupo = groupMaps.byName[k] || groupMaps.byGroup[k] || "";
    grupoPorTipo.set(type, grupo);
    return grupo;
  };

  const submitForApprovalMutation = useMutation({
    mutationFn: async ({ itemId, approvalThumbUrl }: { itemId: string; approvalThumbUrl: string }) => {
      return await apiRequest("PATCH", `/api/items/${itemId}/submit-for-approval`, { approvalThumbUrl });
    },
    onSuccess: (_res, variables) => {
      // Esta tela lê ["/api/items"] e ["/api/items/resubmission-needed"] — sem
      // invalidá-las, a peça continuava na tabela com o status velho até o
      // WebSocket chegar (ou pra sempre, se ele não estivesse conectado).
      // "/api/items/pending" é para outras telas (ex.: Atendimento).
      // O rótulo sai ANTES da invalidação: depois dela a peça já pode ter
      // saído da lista local.
      const peca = itemPorId.get(variables.itemId);
      const id = peca?.displayId;
      // PRÓXIMA PEÇA AUTOMÁTICA (rodada 4) — só quando o envio saiu do MODAL.
      // Depois de enviar, o modal fechava e o designer voltava à lista para
      // caçar a peça seguinte: abrir, subir, enviar, FECHAR, achar, abrir. A
      // próxima é a da MESMA fila, na ordem da tela (Kit no topo); sem próxima,
      // fecha como antes. O envio de um clique pela linha não abre nada.
      const vinhaDoModal = selectedItemId === variables.itemId;
      const proxima = vinhaDoModal ? proximaDaFila(variables.itemId, "criar-aprovacoes") : null;
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items/resubmission-needed"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items/pending"] });
      if (proxima) {
        handleViewDetails(proxima);
      } else {
        setSelectedItemId(null);
        setApprovalThumbUrl("");
        setApprovalThumbPreview("");
      }
      const seguindo = proxima ? ` Abrindo a próxima: ${proxima.displayId}.` : "";
      // Peça SEM aprovação de patrocinador (skipApproval) não vai para
      // "Aguardando patrocinador" — o servidor (submit-for-approval) a manda
      // para awaiting_creator_review, que é a aba Finalizar arte desta mesma
      // tela: a Arte ainda sobe o arquivo final antes da Revisão Final. Dizer
      // "revisão final" prometia pular um passo que não é pulado. O toast, o
      // `title` da linha e o rótulo do botão dizem o mesmo destino.
      if (peca?.skipApproval) {
        toast({
          title: id ? `${id} enviada` : "Peça enviada",
          description: `Sem aprovação de patrocinador — foi direto para a finalização: falta subir o arquivo final (aba Finalizar arte).${seguindo}`,
        });
        return;
      }
      // Diz QUAL peça e PARA ONDE ela foi. "A peça foi enviada" repetia o
      // título, e no envio de um clique pela linha a pessoa não via qual
      // linha tinha sumido da fila.
      toast({
        title: id ? `${id} enviada para aprovação` : "Peça enviada para aprovação",
        description: `Saiu desta fila e agora está em Aguardando patrocinador.${seguindo}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao enviar peça",
        description: mensagemDeErro(error),
        variant: "destructive",
      });
    },
    onSettled: () => setSendingId(null),
  });

  // Salva o thumb no item SEM mudar o status (rascunho). O item continua na aba
  // "Mandar para Aprovação" (filtrada por status awaiting_submission) — só grava
  // o approvalThumbUrl para enviar depois.
  const saveThumbDraftMutation = useMutation({
    // apiRequest devolve a Response crua — sem o .json() o callback recebia um
    // objeto sem `id` e a atualização otimista nunca rodava.
    mutationFn: async ({ itemId, approvalThumbUrl }: { itemId: string; approvalThumbUrl: string }) => {
      const res = await apiRequest("PATCH", `/api/items/${itemId}`, { approvalThumbUrl });
      return await res.json();
    },
    onSuccess: (_updated: any, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/items/pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      setSavedApprovalThumbUrl(variables.approvalThumbUrl);
      setThumbJustSaved(true);
      setTimeout(() => setThumbJustSaved(false), 2500);
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao salvar thumb", description: mensagemDeErro(error), variant: "destructive" });
    },
  });

  const submitBulkForApprovalMutation = useMutation({
    mutationFn: async ({ itemIds, pdfUrl }: { itemIds: string[]; pdfUrl: string }) => {
      // Em lotes com concorrência limitada — evita esgotar o pool do banco
      // ao enviar muitos itens (ex: 50) de uma vez.
      await runInBatches(itemIds, itemId =>
        apiRequest("PATCH", `/api/items/${itemId}/submit-for-approval`, { approvalThumbUrl: pdfUrl })
      );
    },
    onSuccess: (_, variables) => {
      // Mesmas chaves do envio individual — a tabela da Arte lê "/api/items".
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items/resubmission-needed"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items/pending"] });
      setShowBulkDialog(false);
      setSelectedItemIds(new Set());
      setSharedPdfUrl("");
      const n = variables.itemIds.length;
      toast({
        title: `${n} ${n === 1 ? "peça enviada" : "peças enviadas"} para aprovação`,
        description: `Com o mesmo PDF — ${n === 1 ? "ela saiu" : "elas saíram"} desta fila e ${n === 1 ? "está" : "estão"} em Aguardando patrocinador.`,
      });
    },
    onError: (error: Error) => {
      // O lote roda em batches: um erro no meio deixa parte dos itens já
      // enviada. Sem invalidar aqui, a tabela ficava stale até o WebSocket.
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items/resubmission-needed"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items/pending"] });
      toast({
        title: "Erro ao enviar peças",
        description: mensagemDeErro(error),
        variant: "destructive",
      });
    },
  });

  const resetFinalFileState = () => {
    setFinalFileUrl(""); setFinalFileName(""); setFinalDirty(false);
  };

  const submitFinalFileMutation = useMutation({
    mutationFn: async ({ itemId, finalFileUrl, finalPreviewUrl, finalFileName, isUpdate }: { itemId: string; finalFileUrl: string; finalPreviewUrl?: string; finalFileName?: string; isUpdate?: boolean }) => {
      return isUpdate
        ? await apiRequest("PATCH", `/api/items/${itemId}/update-final-file`, { finalFileUrl, finalPreviewUrl, finalFileName })
        : await apiRequest("PATCH", `/api/items/${itemId}/submit-final-file`, { finalFileUrl, finalPreviewUrl, finalFileName });
    },
    onSuccess: (_res, variables) => {
      const id = itemPorId.get(variables.itemId)?.displayId;
      // Mesma próxima peça automática do envio do thumb, na fila de Finalizar
      // arte. Atualizar um arquivo que já existia (Finalizados) é conferência
      // pontual, não fila — ali o modal fecha como sempre.
      const proxima = !variables.isUpdate && selectedItemId === variables.itemId
        ? proximaDaFila(variables.itemId, "finalizar-layouts")
        : null;
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      if (proxima) {
        handleViewDetails(proxima);
      } else {
        setSelectedItemId(null);
        resetFinalFileState(); // limpa url, nome e a flag de "sujo" de uma vez
      }
      // Atualizar e enviar pela primeira vez são fatos diferentes: só o envio
      // tira a peça de "Finalizar arte". O toast antigo dizia o mesmo nos dois.
      toast(variables.isUpdate
        ? { title: id ? `Arquivo final de ${id} atualizado` : "Arquivo final atualizado", description: "O caminho anterior ficou guardado no histórico da peça." }
        : { title: id ? `Arquivo final de ${id} enviado` : "Arquivo final enviado", description: `Segue para a revisão de quem solicitou a peça.${proxima ? ` Abrindo a próxima: ${proxima.displayId}.` : ""}` });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao enviar arquivo final",
        description: mensagemDeErro(error),
        variant: "destructive",
      });
    },
  });

  // Troca do thumb já aprovado (Finalizar Arte / Finalizados). Não reabre a
  // aprovação — o thumb anterior fica guardado no item e no histórico.
  const updateThumbMutation = useMutation({
    // Mesmo defeito do rascunho: apiRequest devolve Response crua, então
    // `updated.id` era sempre undefined e a miniatura, o nome do arquivo e o
    // bloco "versão anterior guardada" continuavam mostrando o thumb velho.
    // Com selectedItem derivado da lista, a invalidação abaixo já repinta o
    // modal — o .json() fica porque a mutação devolve a peça atualizada.
    // `origem`: de qual peça a arte veio, quando o thumb foi REAPROVEITADO em
    // vez de subido (Buscar arte já feita). Só muda o texto do toast — a
    // gravação é a mesma para os dois caminhos.
    mutationFn: async ({ itemId, approvalThumbUrl }: { itemId: string; approvalThumbUrl: string; origem?: string }) => {
      const res = await apiRequest("PATCH", `/api/items/${itemId}/update-thumb`, { approvalThumbUrl });
      return await res.json();
    },
    onSuccess: (_dados, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items/approved"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"], refetchType: "none" });
      toast(variables.origem
        ? { title: `Arte de ${variables.origem} aplicada`, description: "O thumb anterior ficou guardado no histórico da peça." }
        : { title: "Thumb atualizado", description: "O thumb anterior ficou guardado no histórico da peça." });
    },
    onError: (error: Error) =>
      toast({ title: "Erro ao atualizar thumb", description: mensagemDeErro(error), variant: "destructive" }),
  });

  const resubmitMutation = useMutation({
    // O CONJUNTO NÃO VIAJA MAIS (24/08, caso real: Primavera Salvador).
    //
    // O servidor deriva sozinho quem recebe o reenvio — quem ainda não
    // aprovou — e recusa qualquer conjunto diferente. A tela mandava o
    // conjunto que ELA conhecia, calculado do payload da fila; bastava a
    // realidade mudar entre a carga e o clique (a marca nova vinculada
    // depois da recusa, por exemplo) para o 409 "o servidor não aceita
    // outro conjunto" travar a peça sem saída. Mandar a resposta junto com
    // a pergunta só dava chance de a resposta estar velha.
    mutationFn: async ({ itemId, newThumbUrl }: { itemId: string; newThumbUrl: string }) => {
      return await apiRequest("POST", `/api/items/${itemId}/sponsor-approvals/resubmit`, { newThumbUrl });
    },
    onSuccess: (_res, variables) => {
      const id = correcaoItem?.id === variables.itemId ? correcaoItem?.displayId : itemPorId.get(variables.itemId)?.displayId;
      queryClient.invalidateQueries({ queryKey: ["/api/items/resubmission-needed"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      setCorrecaoItem(null);
      setCorrecaoThumbUrl("");
      setCorrecaoFileName("");
      toast({
        title: id ? `Nova arte de ${id} enviada` : "Nova arte enviada",
        // Quanto ainda falta na fila (rodada 4): "e agora?" depois do envio
        // era voltar à lista e contar os cards.
        description: `O Atendimento foi avisado para decidir a nova versão.${restamNaCorrecao(variables.itemId)}`,
      });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao enviar", description: mensagemDeErro(error), variant: "destructive" });
    },
  });

  /**
   * RE-ENVIO DA PEÇA DEVOLVIDA INTEIRA.
   *
   * `sponsor-approvals/resubmit` exige `awaiting_sponsor_approval` e devolve
   * 409 em qualquer outro status. A peça devolvida inteira está em
   * `awaiting_submission` — então, mesmo com o botão liberado, aquele caminho
   * respondia erro. Quem serve este status é `submit-for-approval`, que aceita
   * `awaiting_submission`, devolve as aprovações reprovadas para `pending` e
   * reabre a peça para todos os patrocinadores dela. É o gesto certo: foi a
   * peça inteira que voltou, não a linha de um patrocinador.
   *
   * Mutação própria, e não a `submitForApprovalMutation`: aquela limpa o
   * estado do modal de ENVIO (selectedItemId/approvalThumbUrl); esta precisa
   * limpar o do modal de CORREÇÃO, senão ele fica aberto com dado velho.
   */
  const reenvioInteiroMutation = useMutation({
    mutationFn: async ({ itemId, approvalThumbUrl }: { itemId: string; approvalThumbUrl: string }) => {
      return await apiRequest("PATCH", `/api/items/${itemId}/submit-for-approval`, { approvalThumbUrl });
    },
    onSuccess: (_res, variables) => {
      const id = correcaoItem?.id === variables.itemId ? correcaoItem?.displayId : itemPorId.get(variables.itemId)?.displayId;
      queryClient.invalidateQueries({ queryKey: ["/api/items/resubmission-needed"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items/pending"] });
      setCorrecaoItem(null);
      setCorrecaoThumbUrl("");
      setCorrecaoFileName("");
      toast({
        title: id ? `Nova arte de ${id} enviada` : "Nova arte enviada",
        description: `A peça voltou para a aprovação dos patrocinadores.${restamNaCorrecao(variables.itemId)}`,
      });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao enviar", description: mensagemDeErro(error), variant: "destructive" });
    },
  });

  /** " Faltam N na Correção." sem a peça que acabou de sair — a fila inteira,
   *  não o recorte filtrado, para o número não mudar conforme o filtro. */
  const restamNaCorrecao = (saiu: string): string => {
    const n = (correcaoItems as any[]).filter((i: any) => i.id !== saiu).length;
    return n === 0 ? " A fila da Correção zerou." : ` ${n === 1 ? "Falta 1 peça" : `Faltam ${n} peças`} na Correção.`;
  };

  const dispenseMutation = useMutation({
    mutationFn: async ({ itemId, reason }: { itemId: string; reason: string }) => {
      return await apiRequest("PATCH", `/api/items/${itemId}/dispense`, { reason });
    },
    onSuccess: () => {
      // A rota de dispensa NÃO emite broadcast nem notificação (ver o relatório
      // de revisão, A4): a Gráfica só enxerga a peça no próximo carregamento.
      // Enquanto o servidor não alinhar com as rotas irmãs, invalidamos também
      // as chaves que a fila de produção lê, para pelo menos esta sessão ficar
      // consistente.
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items/approved"] });
      setDispenseItem(null);
      setDispenseReason("");
      toast({ title: "Direto para a finalização", description: "A peça pulou a aprovação do Atendimento — agora é subir o arquivo final." });
    },
    onError: (error: Error) => {
      toast({ title: "Não foi possível liberar", description: mensagemDeErro(error), variant: "destructive" });
    },
  });

  const devolverMutation = useMutation({
    mutationFn: async ({ itemId, motivo }: { itemId: string; motivo: string }) =>
      await apiRequest("PATCH", `/api/items/${itemId}/arte-reject`, { rejectionReason: motivo }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items/approved"] });
      setDevolverItem(null);
      setDevolverMotivo("");
      toast({ title: "Peça devolvida", description: "Voltou para rascunho — quem a criou decide se continua ou descarta." });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao devolver", description: mensagemDeErro(error), variant: "destructive" });
    },
  });

  const getUploadUrl = async () => {
    const response = await apiRequest("POST", "/api/objects/upload", {});
    const data = await response.json();
    return { method: "PUT" as const, url: data.uploadURL };
  };

  const [isPasteUploading, setIsPasteUploading] = useState(false);

  const uploadFileDirect = useCallback(async (
    file: File,
    onComplete: (localPath: string) => void,
    // Quem pintou uma prévia otimista antes de o arquivo subir precisa
    // desfazê-la quando ele NÃO sobe — ver `desfazerEnvioDoThumb`.
    onFail?: () => void,
  ) => {
    setIsPasteUploading(true);
    try {
      // Upload via servidor: o PUT direto no storage.googleapis.com é
      // bloqueado em redes corporativas ("Failed to fetch").
      const res = await fetch("/api/objects/upload-direct", {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || "image/png" },
      });
      if (!res.ok) throw new Error("Falha no upload");
      const { url: objectUrl } = await res.json() as { url: string };
      const localPath = convertGCSUrlToLocalPath(objectUrl);
      onComplete(localPath);
      // Esta função serve o COLAR e também o ARRASTAR (Aprovação e Correção):
      // "Imagem colada! Upload via Ctrl+V" aparecia para quem tinha arrastado
      // um arquivo. O nome do arquivo é o que confirma que subiu o certo.
      toast({ title: "Arquivo carregado", description: file.name && file.name !== "image.png" ? file.name : "Imagem colada da área de transferência." });
    } catch (e: any) {
      toast({ title: "Não foi possível subir a imagem", description: e.message, variant: "destructive" });
      onFail?.();
    } finally {
      setIsPasteUploading(false);
    }
  }, [toast]);

  // ── Envio do thumb de aprovação: prévia otimista com volta ──
  // A miniatura aparece no instante da escolha (leitura local em data: URL) e
  // troca a zona vazia pelo bloco da miniatura. Se o envio FALHA ou é
  // cancelado, sem desfazer isso a tela ficava presa: prévia local, nenhuma
  // URL, "Subindo o thumb…" girando para sempre e a zona vazia — com o
  // "Escolher arquivo" — desmontada, sem caminho para tentar de novo.
  // Por isso o "subindo" é um ESTADO EXPLÍCITO (e não "há prévia mas não há
  // URL"), e a falha devolve a prévia ao último thumb que de fato subiu.
  // Refs porque o colar roda num handler de `paste` registrado por efeito: o
  // valor lido ali tem de ser o de agora, não o do render que o registrou.
  const [thumbEnviando, setThumbEnviando] = useState(false);
  const thumbEnviandoRef = useRef(false);
  const approvalThumbUrlRef = useRef("");
  approvalThumbUrlRef.current = approvalThumbUrl;
  const iniciarEnvioDoThumb = (file: File) => {
    thumbEnviandoRef.current = true;
    setThumbEnviando(true);
    const reader = new FileReader();
    // Só pinta se o envio ainda está no ar: a leitura local pode terminar
    // DEPOIS de uma falha rápida (e religaria a prévia órfã) ou depois do
    // sucesso (e trocaria a URL real pelo data:).
    reader.onload = (ev) => { if (thumbEnviandoRef.current) setApprovalThumbPreview(ev.target?.result as string); };
    reader.readAsDataURL(file);
  };
  const concluirEnvioDoThumb = (localPath: string) => {
    thumbEnviandoRef.current = false;
    setThumbEnviando(false);
    setApprovalThumbUrl(localPath);
    setApprovalThumbPreview(localPath);
  };
  const desfazerEnvioDoThumb = () => {
    thumbEnviandoRef.current = false;
    setThumbEnviando(false);
    // Vazio quando ainda não havia thumb: a zona vazia volta, com o botão.
    setApprovalThumbPreview(approvalThumbUrlRef.current);
  };

  // Ctrl+V: colar thumb no modal de aprovação (selectedItem). Só quando a peça
  // aceita thumb — a zona de upload do modal aparece apenas em
  // awaiting_submission; sem esta guarda, colar com uma peça de outra fase
  // aberta subia um arquivo que nenhuma UI mostrava.
  useEffect(() => {
    if (!selectedItem || selectedItem.status !== 'awaiting_submission') return;
    const handler = (e: ClipboardEvent) => {
      if (isPasteUploading) return; // evita upload duplo antes do primeiro terminar
      const items = Array.from(e.clipboardData?.items || []);
      const imageItem = items.find(i => i.type.startsWith("image/"));
      if (!imageItem) return;
      const file = imageItem.getAsFile();
      if (!file) return;
      e.preventDefault();
      iniciarEnvioDoThumb(file);
      uploadFileDirect(file, (localPath) => {
        concluirEnvioDoThumb(localPath);
        // Colou, subiu: o próximo gesto é enviar (ver focarEnvioParaAprovacao).
        // Chamado dentro do handler, e não listado nas deps: a função é
        // declarada mais abaixo no componente e é estável (useCallback []).
        focarEnvioParaAprovacao();
      }, desfazerEnvioDoThumb);
    };
    window.addEventListener("paste", handler);
    return () => window.removeEventListener("paste", handler);
  }, [selectedItem, uploadFileDirect, isPasteUploading]);

  // Ctrl+V: colar thumb no modal de correção (correcaoItem)
  useEffect(() => {
    if (!correcaoItem) return;
    const handler = (e: ClipboardEvent) => {
      if (isPasteUploading) return; // mesma guarda do modal de aprovação
      const items = Array.from(e.clipboardData?.items || []);
      const imageItem = items.find(i => i.type.startsWith("image/"));
      if (!imageItem) return;
      const file = imageItem.getAsFile();
      if (!file) return;
      e.preventDefault();
      uploadFileDirect(file, (localPath) => {
        setCorrecaoThumbUrl(localPath);
        setCorrecaoFileName(file.name || "Imagem colada");
      });
    };
    window.addEventListener("paste", handler);
    return () => window.removeEventListener("paste", handler);
  }, [correcaoItem, uploadFileDirect, isPasteUploading]);

  const [isDragOver, setIsDragOver] = useState(false);
  const [isDragOverBulk, setIsDragOverBulk] = useState(false);
  const [isDragOverCorrecao, setIsDragOverCorrecao] = useState(false);
  const [isDragOverBook, setIsDragOverBook] = useState(false);
  const [showBulkThumbModal, setShowBulkThumbModal] = useState(false);
  // `ambiguous`: o nome do arquivo tinha mais de um número candidato (ou um que
  // parece ano). O vínculo foi feito, mas pede conferência — ver
  // matchFileToItem em lib/arte-rules.
  type BulkThumbEntry = { id: string; file: File; preview: string; matchedItemId: string | null; ambiguous?: boolean; status: 'pending' | 'uploading' | 'done' | 'error'; errorMsg?: string };
  const [bulkThumbEntries, setBulkThumbEntries] = useState<BulkThumbEntry[]>([]);
  const [bulkThumbRunning, setBulkThumbRunning] = useState(false);
  // Progresso global do lote: 60 imagens uma a uma levam minutos e o único
  // sinal era o estado de cada card, que some da vista ao rolar a lista.
  const [bulkThumbProgress, setBulkThumbProgress] = useState({ feitos: 0, total: 0 });
  const [bulkThumbEventFilter, setBulkThumbEventFilter] = useState<string>("all");
  const [bulkThumbLinkOpenMap, setBulkThumbLinkOpenMap] = useState<Record<string, boolean>>({});
  const [showExportModal, setShowExportModal] = useState(false);
  // Book pronto (PDF) subido pela Arte: escolhe o evento e as peças cobertas.
  const [showBookModal, setShowBookModal] = useState(false);
  const [bookEventId, setBookEventId] = useState<string>("");
  const [bookFileUrl, setBookFileUrl] = useState<string>("");
  const [bookFileName, setBookFileName] = useState<string>("");
  const [bookUploading, setBookUploading] = useState(false);
  const [bookSelectedIds, setBookSelectedIds] = useState<Set<string>>(new Set());

  // ── Pool de itens para exportação ────────────────────────────────────────
  const arteItemsPool = useMemo(() =>
    [...allItems.filter((i: any) => ARTE_POOL_STATUSES.includes(i.status)), ...correcaoItems],
    [allItems, correcaoItems]
  );

  // Itens marcados na tabela, deduplicados (uma peça em correção também pode
  // estar em allItems). Alimenta o ExportPdfDialog quando há seleção.
  const selectedItems = useMemo(() => {
    if (selectedItemIds.size === 0) return [] as any[];
    const seen = new Set<string>();
    return [...allItems, ...correcaoItems].filter((i: any) => {
      if (!selectedItemIds.has(i.id) || seen.has(i.id)) return false;
      seen.add(i.id);
      return true;
    });
  }, [allItems, correcaoItems, selectedItemIds]);

  // "Exportar N sel." abre o MESMO modal de exportação, com a seleção como
  // pool — antes disparava a impressão direto, pulando as opções (agrupar,
  // capa, ordem) que o botão sem seleção oferecia.
  const handleClickExportButton = () => {
    setShowExportModal(true);
  };

  // O modal de exportação fica montado o tempo todo e recalcula oito facetas
  // sobre `items` sempre que a identidade do array muda — isto é, a cada
  // atualização de /api/items, com o modal FECHADO. Fechado, ele recebe o
  // último array que mostrou (mesma identidade, zero recálculo, e a animação
  // de saída continua com o conteúdo de antes); aberto, recebe o vivo.
  const itensDaExportacao = selectedItems.length > 0 ? selectedItems : arteItemsPool;
  const itensDaExportacaoRef = useRef<any[]>([]);
  if (showExportModal) itensDaExportacaoRef.current = itensDaExportacao;
  const itensDaExportacaoCongelados = showExportModal ? itensDaExportacao : itensDaExportacaoRef.current;

  const handleExportItemPDF = (item: any) => {
    void exportMixedToPDF([item], new Set(), `Prova — ${item.displayId || item.type}`);
  };

  // ── Book pronto (PDF) enviado pela Arte para os patrocinadores ─────────────
  const bookEventPieces = useMemo(() => {
    const seen = new Set<string>();
    return arteItemsPool
      .filter((i: any) => {
        if (i.eventId !== bookEventId) return false;
        if (seen.has(i.id)) return false;
        seen.add(i.id);
        return true;
      })
      .sort((a: any, b: any) => String(a.displayId || "").localeCompare(String(b.displayId || ""), "pt-BR", { numeric: true }));
  }, [arteItemsPool, bookEventId]);
  // URL do book já existente para o evento selecionado (primeiro encontrado), se houver.
  const existingBookUrl = useMemo(
    () => bookEventPieces.find((i: any) => i.bookUrl)?.bookUrl ?? null,
    [bookEventPieces],
  );
  const bookEventOptions = useMemo(() => {
    const map = new Map<string, { value: string; label: string; count: number }>();
    arteItemsPool.forEach((i: any) => {
      if (!i.eventId) return;
      const cur = map.get(i.eventId);
      if (cur) cur.count++;
      else map.set(i.eventId, { value: i.eventId, label: i.event?.name || "Sem evento", count: 1 });
    });
    return Array.from(map.values());
  }, [arteItemsPool]);

  const openBookModal = () => {
    const ev = eventFilter.length > 0 ? eventFilter[0] : (bookEventOptions[0]?.value || "");
    setBookEventId(ev);
    setBookFileUrl(""); setBookFileName("");
    setBookComentario("");
    setShowBookModal(true);
  };

  // "O que mudou" (dono, 25/08): opcional na primeira publicação, obrigatório
  // na republicação (existingBookUrl) — mesma régua do servidor. Os chips de
  // patrocinador são atalho de escrita (ver comentario-do-book.tsx).
  const [bookComentario, setBookComentario] = useState("");
  const bookPatrocinadores = useMemo(() => {
    const nomes = new Set<string>();
    for (const i of bookEventPieces as any[]) for (const s of (i.sponsors ?? [])) if (s?.name) nomes.add(s.name);
    return Array.from(nomes).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [bookEventPieces]);
  const bookComentarioFalta = !!existingBookUrl && !comentarioDoBookValido(true, bookComentario);

  // Ao abrir ou trocar o evento, pré-marca todas as peças daquele evento.
  // O ref distingue "abriu/trocou de evento" (pré-marca tudo) de "a lista
  // mudou por baixo" (ex.: WebSocket): neste caso a seleção do usuário é
  // preservada — só sai o que deixou de existir no evento.
  const bookPremarkedEventRef = useRef<string | null>(null);
  useEffect(() => {
    if (!showBookModal) { bookPremarkedEventRef.current = null; return; }
    const eventPieceIds = new Set<string>(arteItemsPool.filter((i: any) => i.eventId === bookEventId).map((i: any) => i.id));
    if (bookPremarkedEventRef.current !== bookEventId) {
      bookPremarkedEventRef.current = bookEventId;
      setBookSelectedIds(eventPieceIds);
      // trocou de evento: o "o que mudou" era do outro book — não pode vazar
      setBookComentario("");
    } else {
      setBookSelectedIds(prev => new Set(Array.from(prev).filter(id => eventPieceIds.has(id))));
    }
  }, [bookEventId, showBookModal, arteItemsPool]);

  const handleBookFile = async (file?: File | null) => {
    if (!file) return;
    if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") {
      toast({ title: "Envie um PDF", description: "O book precisa ser um arquivo .pdf", variant: "destructive" });
      return;
    }
    setBookUploading(true);
    try {
      const url = await uploadFileRaw(file);
      setBookFileUrl(url);
      setBookFileName(file.name);
      toast({ title: "Book anexado", description: file.name });
    } catch (e: any) {
      toast({ title: "Erro no upload", description: e.message, variant: "destructive" });
    } finally {
      setBookUploading(false);
    }
  };

  const saveBookMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/events/${bookEventId}/book`, {
        bookUrl: bookFileUrl,
        itemIds: Array.from(bookSelectedIds),
        comentario: bookComentario.trim() || undefined,
      });
      return await res.json() as { updated: number; aviso: { status: string; para?: string[]; reason?: string } | null };
    },
    // O AVISO POR E-MAIL DEIXA DE SER INVISÍVEL. Antes ele saía sozinho, sem
    // await e sem registro: se o provedor recusasse, a tela dizia "Book salvo"
    // do mesmo jeito e a Arte ia embora achando que tinha avisado. Agora o
    // servidor devolve o desfecho e o toast conta — inclusive quando falhou,
    // porque aí alguém precisa avisar na mão.
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      setShowBookModal(false);
      const a = data?.aviso;
      // Plural de verdade: "1 peça(s) vinculada(s)" obriga a ler a regra da
      // flexão em vez do número.
      const quantas = `${bookSelectedIds.size} ${bookSelectedIds.size === 1 ? "peça vinculada" : "peças vinculadas"} ao book.`;
      if (a?.status === "sent") {
        toast({ title: "Book salvo e avisado", description: `${quantas} Aviso enviado para ${(a.para ?? []).join(", ")}.` });
      } else if (a?.status === "failed") {
        toast({
          title: "Book salvo — mas o aviso NÃO saiu",
          description: `${quantas} Motivo: ${a.reason ?? "desconhecido"}. Avise a equipe por outro caminho.`,
          variant: "destructive",
        });
      } else {
        toast({ title: "Book salvo", description: quantas });
      }
    },
    onError: (e: any) => toast({ title: "Erro ao salvar book", description: e.message, variant: "destructive" }),
  });

  // Upload sem alterar isPasteUploading (usado no bulk). Via servidor: o PUT
  // direto no storage.googleapis.com é bloqueado em redes corporativas.
  const uploadFileRaw = useCallback(async (file: File): Promise<string> => {
    const res = await fetch("/api/objects/upload-direct", { method: "PUT", body: file, headers: { "Content-Type": file.type || "image/jpeg" } });
    if (!res.ok) throw new Error("Falha no upload do arquivo");
    const { url } = await res.json() as { url: string };
    return convertGCSUrlToLocalPath(url);
  }, []);

  // Peças que podem receber thumb no multi-upload: aguardando envio OU em
  // correção, deduplicadas e respeitando o filtro de evento do modal.
  // Calculado uma vez — antes era refeito dentro do .map de cada card E o
  // auto-match usava um pool diferente (sem correção e ignorando o filtro).
  // Pool SEM o filtro de evento — alimenta o seletor de evento do modal com
  // contagem real (o seletor listava todos os eventos do sistema, e o usuário
  // só descobria que o evento não tinha peça depois de escolhê-lo).
  const bulkThumbBasePool = useMemo(() => {
    const seen = new Set<string>();
    // Conjunto, e não `correcaoItems.some` por peça: eram ~5 mil varreduras da
    // fila de correção a cada atualização da lista.
    const emCorrecao = new Set<string>((correcaoItems as any[]).map((c: any) => c.id));
    return [...allItems, ...correcaoItems].filter((i: any) => {
      if (seen.has(i.id)) return false;
      seen.add(i.id);
      return i.status === 'awaiting_submission' || emCorrecao.has(i.id);
    });
  }, [allItems, correcaoItems]);

  const bulkPendingPool = useMemo(
    () => bulkThumbEventFilter === "all"
      ? bulkThumbBasePool
      : bulkThumbBasePool.filter((i: any) => i.eventId === bulkThumbEventFilter),
    [bulkThumbBasePool, bulkThumbEventFilter],
  );

  // Mesma disciplina do bookEventOptions: só eventos que têm peça pronta para
  // receber thumb, com a contagem ao lado do nome.
  const bulkThumbEventOptions = useMemo(() => {
    const map = new Map<string, { value: string; label: string; count: number }>();
    bulkThumbBasePool.forEach((i: any) => {
      if (!i.eventId) return;
      const cur = map.get(i.eventId);
      if (cur) cur.count++;
      else map.set(i.eventId, { value: i.eventId, label: i.event?.name || "Sem evento", count: 1 });
    });
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  }, [bulkThumbBasePool]);

  const handleBulkThumbFilesAdded = useCallback((files: FileList | File[]) => {
    // Aceita por MIME OU por extensão (alguns navegadores devolvem type vazio).
    const isImage = (f: File) =>
      f.type.startsWith("image/") || /\.(jpe?g|png|gif|webp|svg|bmp|tiff?)$/i.test(f.name);
    const arr = Array.from(files).filter(isImage);
    if (!arr.length) return;
    // Peça já casada (em card anterior ou nesta leva) sai do pool — dois
    // arquivos com o mesmo número não podem apontar para a mesma peça.
    const taken = new Set(
      bulkThumbEntries.filter(e => e.matchedItemId).map(e => e.matchedItemId as string)
    );
    const newEntries: BulkThumbEntry[] = arr.map(file => {
      const { item: matched, ambiguous } = matchFileToItem(file.name, bulkPendingPool as any[], taken);
      if (matched) taken.add(matched.id);
      return {
        id: `${file.name}-${Date.now()}-${Math.random()}`,
        file,
        preview: URL.createObjectURL(file),
        matchedItemId: matched?.id ?? null,
        ambiguous: !!matched && ambiguous,
        status: 'pending' as const,
      };
    });
    setBulkThumbEntries(prev => [...prev, ...newEntries]);
    setShowBulkThumbModal(true);
  }, [bulkPendingPool, bulkThumbEntries]);

  // Núcleo do upload em lote de thumbs. Se send=true, envia para aprovação
  // (/submit-for-approval, muda status). Se send=false, só salva o thumb no
  // item (PATCH /api/items/:id, mantém status awaiting_submission = rascunho).
  // PRÓXIMO PASSO (21/09), deliberadamente FORA desta rodada: sugerir aqui,
  // por peça, uma arte já feita ("Buscar arte já feita" individual existe no
  // modal da peça). Ficou de fora porque o lote casa ARQUIVO × peça pelo nome
  // do arquivo (matchFileToItem) e a sugestão automática casaria peça × arte
  // sem arquivo nenhum — dois vínculos diferentes na mesma tela, cada um com
  // seu jeito de errar. Fazer só com o desenho de conferência em pé.
  const runBulkThumb = useCallback(async (send: boolean) => {
    if (!podeEditar) return; // gate de papel: nem sobe arquivo para tomar 403 depois
    const toProcess = bulkThumbEntries.filter(e => e.matchedItemId && e.status === 'pending');
    if (!toProcess.length) return;
    setBulkThumbRunning(true);
    setBulkThumbProgress({ feitos: 0, total: toProcess.length });
    let enviados = 0, salvos = 0, reenviados = 0, falhas = 0;

    const processar = async (entry: BulkThumbEntry) => {
      setBulkThumbEntries(prev => prev.map(e => e.id === entry.id ? { ...e, status: 'uploading' } : e));
      try {
        const localPath = await uploadFileRaw(entry.file);
        // "Enviar para aprovação" só vale para peças aguardando envio. Para as
        // demais (ex.: em correção) o thumb é apenas salvo — antes a tela tentava
        // enviar mesmo assim e o servidor recusava com erro de status.
        const alvo = [...allItems, ...correcaoItems].find((i: any) => i.id === entry.matchedItemId);
        const podeEnviar = send && alvo?.status === 'awaiting_submission';
        // Peça em correção usa o fluxo formal de reenvio: o PATCH genérico
        // trocava a arte em avaliação sem resetar as aprovações recusadas
        // nem notificar o Atendimento.
        const emCorrecao = (correcaoItems as any[]).find((c: any) => c.id === entry.matchedItemId);
        if (podeEnviar) {
          await apiRequest("PATCH", `/api/items/${entry.matchedItemId}/submit-for-approval`, { approvalThumbUrl: localPath });
          enviados++;
        } else if (emCorrecao) {
          // Sem conjunto — o servidor deriva (ver resubmitMutation). Este
          // caminho mandava SÓ as linhas recusadas (awaitingArteApprovals):
          // com qualquer outro patrocinador ainda pendente na peça, o
          // conjunto nunca batia e o reenvio em lote falhava sempre.
          await apiRequest("POST", `/api/items/${entry.matchedItemId}/sponsor-approvals/resubmit`, {
            newThumbUrl: localPath,
          });
          reenviados++;
        } else {
          await apiRequest("PATCH", `/api/items/${entry.matchedItemId}`, { approvalThumbUrl: localPath });
          salvos++;
        }
        setBulkThumbEntries(prev => prev.map(e => e.id === entry.id ? { ...e, status: 'done' } : e));
      } catch (err: any) {
        falhas++;
        setBulkThumbEntries(prev => prev.map(e => e.id === entry.id ? { ...e, status: 'error', errorMsg: mensagemDeErro(err) } : e));
      } finally {
        setBulkThumbProgress(p => ({ ...p, feitos: p.feitos + 1 }));
      }
    };

    // Concorrência 3 (e não os 5 do envio de PDF): cada imagem sobe pelo proxy
    // do servidor, que tem limite de 50MB por requisição — subir demais em
    // paralelo troca minutos de espera por falhas de memória. O try/catch mora
    // DENTRO da tarefa, então nenhum erro derruba o lote inteiro.
    await runInBatches(toProcess, processar, 3);

    setBulkThumbRunning(false);
    queryClient.invalidateQueries({ queryKey: ["/api/items"] });
    queryClient.invalidateQueries({ queryKey: ["/api/items/pending"] });
    queryClient.invalidateQueries({ queryKey: ["/api/items/resubmission-needed"] });
    const p = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
    const partes = [
      enviados ? p(enviados, "enviado para aprovação", "enviados para aprovação") : "",
      reenviados ? p(reenviados, "reenviado da Correção", "reenviados da Correção") : "",
      salvos ? p(salvos, "thumb salvo como rascunho", "thumbs salvos como rascunho") : "",
    ].filter(Boolean).join(" · ");
    // As FALHAS entram no toast. Ele dizia "concluído" mesmo com cards em
    // erro lá embaixo da lista, fora da vista — e quem fechava o modal
    // confiando no aviso perdia as imagens que não subiram.
    toast(falhas > 0
      ? { title: `${p(falhas, "imagem não subiu", "imagens não subiram")}`, description: `${partes ? `${partes}. ` : ""}As que falharam ficam na lista com o motivo; para reenviar, remova e adicione a imagem de novo.`, variant: "destructive" }
      : { title: "Envio em lote concluído", description: partes || "Nada a processar" });
  }, [bulkThumbEntries, uploadFileRaw, allItems, correcaoItems, podeEditar, mensagemDeErro, toast]);

  const handleBulkThumbUpload = useCallback(() => runBulkThumb(true), [runBulkThumb]);
  const handleBulkThumbSaveDraft = useCallback(() => runBulkThumb(false), [runBulkThumb]);

  // Trabalho que se perde ao fechar: arquivos ainda não processados.
  const bulkThumbPendentes = bulkThumbEntries.filter(e => e.status === 'pending').length;

  // Fecha o multi-upload liberando os object URLs dos previews — cada
  // URL.createObjectURL segura o blob na memória até o revoke.
  const closeBulkThumbModal = useCallback((forcar = false) => {
    if (bulkThumbRunning) {
      // Fechar no meio do lote deixaria uploads órfãos — avisa em vez de
      // ignorar o clique em silêncio.
      toast({ title: "Aguarde o envio terminar", description: "O envio em lote ainda está em andamento." });
      return;
    }
    // 40 imagens vinculadas e conferidas sumiam com um clique no overlay. A
    // proteção já existia para o envio em andamento e tinha ficado pela metade.
    const pendentes = bulkThumbEntries.filter(e => e.status === 'pending').length;
    if (!forcar && pendentes > 0
      && !window.confirm(`${pendentes} ${pendentes === 1 ? 'imagem ainda não foi enviada' : 'imagens ainda não foram enviadas'}. Fechar e descartar?`)) {
      return;
    }
    setBulkThumbEntries(prev => {
      prev.forEach(e => URL.revokeObjectURL(e.preview));
      return [];
    });
    setShowBulkThumbModal(false);
    setBulkThumbEventFilter("all");
    // O mapa de popovers abertos crescia uma chave por card e nunca era zerado.
    setBulkThumbLinkOpenMap({});
    setBulkThumbProgress({ feitos: 0, total: 0 });
  }, [bulkThumbRunning, bulkThumbEntries, toast]);

  // Sair da tela por navegação com o modal aberto segurava os blobs dos
  // previews até o refresh — os revokes existiam no fechar, no remover e no
  // limpar concluídos, mas não no desmonte.
  const bulkThumbEntriesRef = useRef(bulkThumbEntries);
  bulkThumbEntriesRef.current = bulkThumbEntries;
  useEffect(() => () => {
    bulkThumbEntriesRef.current.forEach(e => URL.revokeObjectURL(e.preview));
  }, []);

  // Fechar a Correção descartava um arquivo JÁ ENVIADO ao storage sem avisar.
  const fecharCorrecaoModal = useCallback((forcar = false) => {
    if (!forcar && correcaoThumbUrl
      && !window.confirm("A nova versão foi carregada, mas ainda NÃO foi enviada aos patrocinadores. Fechar e descartar?")) {
      return;
    }
    setCorrecaoItem(null);
    setCorrecaoThumbUrl("");
    setCorrecaoFileName("");
  }, [correcaoThumbUrl]);

  const uniqueSponsors = useMemo(() => {
    const map = new Map<string, any>();
    allItems.forEach((item: any) => (item.sponsors ?? []).forEach((s: any) => { if (!map.has(s.id)) map.set(s.id, s); }));
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [allItems]);

  // Eventos que JÁ têm book publicado. Quem está nesta lista e não tem bookUrl
  // ficou de fora do book — ver o selo "Fora do book" na coluna Peça.
  const eventosComBook = useMemo(
    () => new Set<string>(allItems.filter((i: any) => i.bookUrl && i.eventId).map((i: any) => i.eventId)),
    [allItems],
  );

  // Itens da fase/aba atual, sem aplicar os filtros de dropdown. É a base das
  // opções de filtro: assim cada filtro lista só o que existe naquela fase, e
  // escolher um filtro não esvazia as opções dos outros.
  const tabPoolItems = useMemo(() => {
    if (activeTab === "correcao") return correcaoItems as any[];
    const allowed = TAB_STATUSES[activeTab]; // mesma fonte única das abas
    return allowed ? allItems.filter((i: any) => allowed.includes(i.status)) : allItems;
  }, [allItems, correcaoItems, activeTab]);

  // Filtros facetados: as opções de cada filtro são calculadas aplicando os
  // OUTROS filtros ativos. Assim escolher um evento reduz os patrocinadores,
  // tipos e materiais àquele evento (e as contagens acompanham a página), sem
  // que um filtro esvazie a si mesmo.
  const facetPool = (exclude: 'event' | 'sponsor' | 'type' | 'material') =>
    tabPoolItems.filter((i: any) => {
      if (exclude !== 'event' && eventFilter.length > 0 && !eventFilter.includes(i.eventId)) return false;
      if (exclude !== 'sponsor' && sponsorFilter.length > 0 && !(i.sponsors ?? []).some((s: any) => sponsorFilter.includes(s.id))) return false;
      if (exclude !== 'type' && typeFilter.length > 0 && !typeFilter.includes(i.type)) return false;
      if (exclude !== 'material' && materialFilter.length > 0 && !materialFilter.includes(i.material)) return false;
      return true;
    });

  const facetDeps = [tabPoolItems, eventFilter, sponsorFilter, typeFilter, materialFilter];

  const eventFilterOptions = useMemo(() => {
    const C: Record<string, string> = { urgent: '#ef4444', urgente: '#ef4444', alta: '#f97316', media: '#eab308', baixa: '#3b82f6' };
    const map = new Map<string, { value: string; label: string; count: number; dotColor?: string }>();
    facetPool('event').forEach((i: any) => {
      if (!i.eventId) return;
      const cur = map.get(i.eventId);
      if (cur) cur.count++;
      else map.set(i.eventId, { value: i.eventId, label: i.event?.name || 'Sem evento', count: 1, dotColor: C[i.event?.priority] });
    });
    return Array.from(map.values());
  }, facetDeps);

  const sponsorFilterOptions = useMemo(() => {
    const map = new Map<string, { value: string; label: string; count: number }>();
    facetPool('sponsor').forEach((i: any) => (i.sponsors ?? []).forEach((s: any) => {
      const cur = map.get(s.id);
      if (cur) cur.count++;
      else map.set(s.id, { value: s.id, label: s.name, count: 1 });
    }));
    return Array.from(map.values());
  }, facetDeps);

  const countBy = (key: 'type' | 'material') => {
    const map = new Map<string, { value: string; label: string; count: number }>();
    facetPool(key).forEach((i: any) => {
      const v = i[key];
      if (!v) return;
      const cur = map.get(v);
      if (cur) cur.count++;
      else map.set(v, { value: v, label: v, count: 1 });
    });
    return Array.from(map.values());
  };
  const typeFilterOptions = useMemo(() => countBy('type'), facetDeps);
  const materialFilterOptions = useMemo(() => countBy('material'), facetDeps);

  /**
   * Objeto ÚNICO de filtros. As três listas da tela (abas de status, contagem
   * da Correção e a própria lista da Correção) leem daqui e passam pelo mesmo
   * `matchesArteFilters` — antes eram três implementações e duas ignoravam
   * metade dos filtros que os chips diziam estar ligados.
   */
  const filters = useMemo<ArteFilters>(() => ({
    search: deferredSearch.toLowerCase(),
    eventIds: eventFilter,
    sponsorIds: sponsorFilter,
    types: typeFilter,
    materials: materialFilter,
    months: monthFilter,
    next10Days: next10DaysFilter,
    urgente: urgenteFilter,
    thumb: thumbFilter,
    final: finalFilter,
    period: periodFilter,
    atrasado: atrasadoFilter,
  }), [deferredSearch, eventFilter, sponsorFilter, typeFilter, materialFilter, monthFilter,
    next10DaysFilter, urgenteFilter, thumbFilter, finalFilter, periodFilter, atrasadoFilter]);

  const activeFilterCount = useMemo(
    // O filtro local de patrocinador da aba Correção não aparecia nem nos chips
    // nem nesta conta, e combinado com o global produzia interseções que
    // nenhum dos dois controles refletia.
    () => countActiveFilters(filters) + (correcaoSponsorFilter !== "all" ? 1 : 0) + (paradasFilter ? 1 : 0),
    [filters, correcaoSponsorFilter, paradasFilter],
  );

  const clearAllFilters = useCallback(() => {
    setSearchFilter("");
    setEventFilter([]);
    setSponsorFilter([]);
    setMonthFilter([]);
    setNext10DaysFilter(false);
    setTypeFilter([]);
    setMaterialFilter([]);
    setThumbFilter("todos");
    setFinalFilter("todos");
    setUrgenteFilter(false);
    setPeriodFilter("Todos");
    setAtrasadoFilter(false);
    setParadasFilter(false);
    setCorrecaoSponsorFilter("all");
  }, []);

  // Filtros na URL, com debounce de 300ms (a regra da casa pede ≥200): sem ele,
  // cada tecla da busca escrevia um replaceState — o padrão que já derrubou a
  // árvore React no Safari em outra tela.
  useEffect(() => {
    const timer = setTimeout(() => {
      const p = new URLSearchParams(serializeArteFilters(filters, activeTab, sortMode));
      if (paradasFilter) p.set("paradas", "1");
      const qs = p.toString();
      window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
    }, 300);
    return () => clearTimeout(timer);
  }, [filters, activeTab, sortMode, paradasFilter]);

  // Aplica os filtros uma única vez e separa por aba. As contagens saem do
  // .length de cada balde; só a aba aberta paga o custo da ordenação.
  //
  // "Base" = tudo MENOS o recorte de atrasadas: o marco depende da fase, que só
  // existe depois do balde. É desta base que sai a contagem exibida no próprio
  // controle "Prazo" — número que precisa continuar valendo depois de clicado.
  const itemsByTabBase = useMemo(() => {
    const buckets: Record<string, any[]> = {
      "criar-aprovacoes": [], "aguardando-patrocinador": [],
      "finalizar-layouts": [], "finalizados": [],
    };
    for (const item of allItems) {
      if (!matchesArteFilters(item, filters, dateBounds)) continue;
      for (const tab in buckets) {
        if (TAB_STATUSES[tab].includes(item.status)) { buckets[tab].push(item); break; }
      }
    }
    // Recorte temporal padrão da aba Finalizados: ela acumula produzido,
    // conferido e entregue e nunca para de crescer. 90 dias por saída do
    // caminhão mantém a aba útil como conferência recente; "ver tudo" está a
    // um clique no cabeçalho da aba.
    if (!finalizadosTudo) {
      buckets["finalizados"] = buckets["finalizados"].filter(i => dentroDaJanelaFinalizados(i, hoje));
    }
    return buckets;
  }, [allItems, filters, finalizadosTudo, dateBounds, hoje]);

  const itemsByTabSemParadas = useMemo(() => {
    if (!filters.atrasado) return itemsByTabBase;
    const out: Record<string, any[]> = {};
    for (const tab in itemsByTabBase) out[tab] = filtrarAtrasadasDaFase(itemsByTabBase[tab], tab, hoje);
    return out;
  }, [itemsByTabBase, filters.atrasado, hoje]);
  // O recorte "paradas" entra por último, e a contagem do chip que o liga sai
  // da camada ANTERIOR — é o que faz o número do chip ser exatamente o de
  // linhas que o clique entrega (invariante das facetas).
  const itemsByTab = useMemo(() => {
    if (!paradasFilter) return itemsByTabSemParadas;
    const out: Record<string, any[]> = {};
    for (const tab in itemsByTabSemParadas) out[tab] = itemsByTabSemParadas[tab].filter((i: any) => estaParada(i, hoje));
    return out;
  }, [itemsByTabSemParadas, paradasFilter, hoje]);
  const paradasNaAba = useMemo(
    () => (itemsByTabSemParadas[activeTab] ?? []).filter((i: any) => estaParada(i, hoje)).length,
    [itemsByTabSemParadas, activeTab, hoje],
  );
  // Mesma invariante para "urgentes": o número do atalho tem de ser o de
  // linhas que o clique entrega, e não o do conjunto já recortado.
  const urgentesNaAba = useMemo(
    () => (itemsByTabBase[activeTab] ?? []).filter((i: any) => isUrgente(i.event?.priority)).length,
    [itemsByTabBase, activeTab],
  );

  // Quantas peças a janela de 90 dias está escondendo (para o rótulo do "ver tudo").
  const finalizadosForaDaJanela = useMemo(() => {
    // Com "só atrasadas" ligado a aba Finalizados fica vazia por definição (o
    // marco dela é a própria saída); anunciar "N peças mais antigas fora do
    // recorte" ali seria contar o que nenhum clique traz de volta.
    if (finalizadosTudo || filters.atrasado) return 0;
    let n = 0;
    for (const item of allItems) {
      if (!TAB_STATUSES["finalizados"].includes(item.status)) continue;
      if (!matchesArteFilters(item, filters, dateBounds)) continue;
      if (!dentroDaJanelaFinalizados(item, hoje)) n++;
    }
    return n;
  }, [allItems, filters, finalizadosTudo, dateBounds, hoje]);

  // Qualquer mudança de recorte recomeça a paginação. A dependência é uma CHAVE
  // do recorte, não a identidade do objeto de baldes: `itemsByTab` é um objeto
  // novo a cada `item_updated` do WebSocket, e quem tinha clicado "Carregar
  // mais" três vezes perdia a posição sem ter feito nada.
  const recorteKey = filtersKey(filters, activeTab) + (finalizadosTudo ? "~tudo" : "") + (paradasFilter ? "~paradas" : "");
  useEffect(() => { setVisibleCount(ARTE_PAGE_SIZE); }, [recorteKey]);

  // Re-sincroniza o preview do thumb caso a query de items refaça o estado
  // após salvar rascunho (dupla invalidação: onSuccess + WebSocket item_updated).
  useEffect(() => {
    if (selectedItem?.approvalThumbUrl && !approvalThumbPreview) {
      setApprovalThumbUrl(selectedItem.approvalThumbUrl);
      setApprovalThumbPreview(selectedItem.approvalThumbUrl);
    }
    if (selectedItem?.approvalThumbUrl && !savedApprovalThumbUrl) {
      setSavedApprovalThumbUrl(selectedItem.approvalThumbUrl);
    }
    // approvalThumbPreview nas deps: o efeito lê o valor; o guard acima já
    // impede loop (só grava quando o preview está vazio).
  }, [selectedItem?.approvalThumbUrl, savedApprovalThumbUrl, approvalThumbPreview]);

  const filteredItems = useMemo(() => {
    const list = itemsByTab[activeTab] ?? [];
    // Um Collator reutilizado é bem mais rápido que localeCompare por comparação.
    const cmp = new Intl.Collator('pt-BR');
    return [...list].sort((a, b) => {
      // PEÇA PRIORITÁRIA fura a fila (dono, 27/08): vem antes de qualquer
      // régua — inclusive do prazo. É a peça que a Solicitação marcou para a
      // Arte atacar primeiro.
      // KIT SEMPRE EM CIMA (dono, 15/09): as peças do Kit antes das da Arena.
      const kit = Number(!!b.kitRemessaId) - Number(!!a.kitRemessaId);
      if (kit !== 0) return kit;
      const prio = Number(!!b.isPriority) - Number(!!a.isPriority);
      if (prio !== 0) return prio;
      // Ordenar por PRAZO reordena os blocos inteiros (a lista é agrupada por
      // evento): o evento com o marco da fase mais próximo sobe para o topo.
      // É o que transforma "lista organizada por evento" em "fila de trabalho".
      if (sortMode === "prazo") {
        const u = compareEventUrgency(a.event, b.event, activeTab, hoje);
        if (u !== 0) return u;
      }
      const eA = a.event?.name || '', eB = b.event?.name || '';
      if (eA !== eB) return cmp.compare(eA, eB);
      // Cada remessa do Kit junta, num bloco só.
      const rA = a.kitRemessaId || '', rB = b.kitRemessaId || '';
      if (rA !== rB) return cmp.compare(rA, rB);
      const gA = groupOf(a.type) || '', gB = groupOf(b.type) || '';
      if (gA !== gB) return cmp.compare(gA, gB);
      // compareDisplayId, não replace(/\D/g,''): o complemento "#0062-C1"
      // virava 621 e caía a centenas de linhas da peça de que ele nasceu.
      return compareDisplayId(a.displayId, b.displayId);
    });
  }, [itemsByTab, activeTab, groupMaps, sortMode, hoje]);

  const pendingCount = itemsByTab["criar-aprovacoes"].length;
  const aguardandoCount = itemsByTab["aguardando-patrocinador"].length;
  const needsFinalFileCount = itemsByTab["finalizar-layouts"].length;
  const finalizadosCount = itemsByTab["finalizados"].length;
  // Mesmo predicado das outras abas: antes esta contagem só conhecia evento,
  // tipo, material, patrocinador e busca — ligar "Saída 10 dias" acendia o chip
  // e devolvia a lista inteira.
  const correcaoBase = useMemo(
    () => (correcaoItems as any[]).filter(item => matchesArteFilters(item, filters, dateBounds)),
    [correcaoItems, filters, dateBounds],
  );
  const correcaoFiltrados = useMemo(
    () => (filters.atrasado ? filtrarAtrasadasDaFase(correcaoBase, "correcao", hoje) : correcaoBase),
    [correcaoBase, filters.atrasado, hoje],
  );
  const correcaoCount = correcaoFiltrados.length;

  // Quantas peças da ABA ATIVA estão atrasadas contra o marco da própria fase.
  // Sai da base (sem o recorte de atraso aplicado) para que o número no
  // controle seja o mesmo antes e depois de ligá-lo. Uma passada por aba, com
  // a âncora estável de "hoje" — nada disso é recalculado por linha da tabela.
  const atrasadasNaAba = useMemo(() => {
    const base = activeTab === "correcao" ? correcaoBase : (itemsByTabBase[activeTab] ?? []);
    return filtrarAtrasadasDaFase(base, activeTab, hoje).length;
  }, [itemsByTabBase, correcaoBase, activeTab, hoje]);

  // ── OPÇÕES DOS RECORTES DE UMA DIMENSÃO SÓ ────────────────────────────────
  // Período, mês, prazo, prioridade, thumb e arquivo final eram faixa de botões
  // e segmentados MUDOS: nenhum dizia quantas peças cada opção entrega. "Hoje"
  // num dia sem saída nenhuma era indistinguível de "Hoje" com quarenta, e "sem
  // arquivo final" só revelava o tamanho do problema depois de clicado.
  //
  // `poolSemDimensao` é o mesmo desenho do `facetPool` de evento/tipo/material,
  // estendido ao que mora FORA de `matchesArteFilters`: o balde da aba, a
  // janela de 90 dias dos Finalizados e o recorte de atrasadas. Com isso a
  // contagem de cada opção é, por construção, o número de linhas que aquele
  // clique entrega — a regra travada em faceta-lista-invariante.
  //
  // `filtrarAtrasadasDaFase` é item a item, então comuta com os demais e pode
  // ser aplicado antes de contar.
  // BASE COMUM das sete contagens abaixo. Cada opção chamava matchesArteFilters
  // sobre o balde inteiro da aba (3 mil peças em Finalizados) — nove passadas
  // a cada tecla da busca. O predicado é um E de dimensões independentes, e
  // valor neutro não restringe nada: filtrar UMA vez com as dimensões de
  // uma-só-opção neutras e depois aplicar o filtro completo sobre essa base dá
  // exatamente o mesmo conjunto — só que as nove passadas correm sobre o que
  // já sobrou da busca/evento/tipo.
  const baseDasDimensoes = useMemo(() => {
    const neutro: ArteFilters = { ...filters, period: "Todos", months: [], urgente: false, thumb: "todos", final: "todos", next10Days: false };
    return tabPoolItems.filter((i: any) => matchesArteFilters(i, neutro, dateBounds));
  }, [filters, tabPoolItems, dateBounds]);

  const poolSemDimensao = useCallback((patch: Partial<ArteFilters>): any[] => {
    const f = { ...filters, ...patch };
    let lista = baseDasDimensoes.filter((i: any) => matchesArteFilters(i, f, dateBounds));
    if (activeTab === "finalizados" && !finalizadosTudo) {
      lista = lista.filter((i: any) => dentroDaJanelaFinalizados(i, hoje));
    }
    if (f.atrasado) lista = filtrarAtrasadasDaFase(lista, activeTab, hoje);
    if (paradasFilter) lista = lista.filter((i: any) => estaParada(i, hoje));
    return lista;
  }, [filters, baseDasDimensoes, dateBounds, activeTab, finalizadosTudo, hoje, paradasFilter]);

  // Uma passada POR JANELA, e não um agrupamento único: as janelas são
  // cumulativas e se contêm ("7 dias" inclui "Hoje"), então não existe balde
  // que sirva para todas. Mesmo desenho do Período dos Registros.
  // `pinned` segura a ordem cronológica de PERIOD_FILTERS — o FilterSelect
  // ordena alfabeticamente e sem isto sairia "15 dias, 30 dias, 7 dias, Hoje".
  const periodFilterOptions = useMemo(
    () => PERIOD_FILTERS.filter(p => p !== "Todos").map(p => ({
      value: p as string,
      label: p as string,
      count: poolSemDimensao({ period: p }).length,
      pinned: true,
    })),
    [poolSemDimensao],
  );

  // Mês da SAÍDA DO CAMINHÃO. `?mes=` existia na URL e no chip desde sempre e
  // não tinha gatilho nenhum na tela: só entrava por link e só saía pelo X do
  // chip. Aqui o menu é uma passada só — os meses são baldes exclusivos — e
  // mês sem peça nenhuma não é oferecido (a não ser que já esteja escolhido,
  // senão o próprio recorte ativo sumiria da lista).
  const monthFilterOptions = useMemo(() => {
    const contagem = new Map<string, number>();
    poolSemDimensao({ months: [] }).forEach((i: any) => {
      const dep = i.event?.truckDepartureDate;
      if (!dep) return;
      const m = (toUTCDisplayDate(dep).getMonth() + 1).toString();
      contagem.set(m, (contagem.get(m) ?? 0) + 1);
    });
    return months
      .filter(m => m.value !== "all")
      .map(m => ({ value: m.value, label: m.label, count: contagem.get(m.value) ?? 0, pinned: true }))
      .filter(o => o.count > 0 || monthFilter.includes(o.value));
  }, [poolSemDimensao, monthFilter]);

  // Prazo tem UMA opção só ("Só atrasadas") porque o estado neutro é a linha
  // "Todos" que o próprio menu desenha — oferecer "todas" duas vezes seria
  // duas maneiras de dizer a mesma coisa no mesmo painel.
  const prazoFilterOptions = useMemo(
    () => [{ value: "atrasados", label: "Só atrasadas", count: atrasadasNaAba }],
    [atrasadasNaAba],
  );
  const prazoBloqueado = activeTab === "finalizados" && !atrasadoFilter;

  const prioridadeFilterOptions = useMemo(
    () => [{
      value: "urgentes",
      label: "Só urgentes",
      count: poolSemDimensao({ urgente: true }).length,
    }],
    [poolSemDimensao],
  );

  // Thumb e arquivo final: um pool só por dimensão, dois recortes contados dele.
  const thumbFilterOptions = useMemo(() => {
    const pool = poolSemDimensao({ thumb: "todos" });
    const com = pool.filter((i: any) => !!i.approvalThumbUrl).length;
    return [
      { value: "com", label: "Só com thumb", count: com },
      { value: "sem", label: "Só sem thumb", count: pool.length - com },
    ];
  }, [poolSemDimensao]);

  const finalFilterOptions = useMemo(() => {
    const pool = poolSemDimensao({ final: "todos" });
    const com = pool.filter((i: any) => !!i.finalFileUrl).length;
    return [
      { value: "com", label: "Só com arquivo final", count: com },
      { value: "sem", label: "Só sem arquivo final", count: pool.length - com },
    ];
  }, [poolSemDimensao]);

  // O atalho também diz quantas peças entrega antes de ser clicado — ele é um
  // recorte como os outros, só que com nome próprio (job 8 do vocabulário).
  const saida10Count = useMemo(
    () => poolSemDimensao({ next10Days: true }).length,
    [poolSemDimensao],
  );

  const handleViewDetails = (item: any) => {
    setSelectedItemId(item.id);
    setApprovalThumbUrl(item.approvalThumbUrl || "");
    setApprovalThumbPreview(item.approvalThumbUrl || "");
    setSavedApprovalThumbUrl(item.approvalThumbUrl || "");
    setThumbJustSaved(false);
    setFinalFileUrl(item.finalFileUrl || "");
    setFinalFileName(item.finalFileName || fileNameFromPath(item.finalFileUrl) || (item.finalFileUrl ? "arquivo enviado" : ""));
    setFinalDirty(false);
  };

  // Deep link `?item=` (sino e "Resolver em Arte →" da Gestão de Prazos): abre
  // a ficha JÁ na fase em que a peça está. A fase sai de onde a própria tela
  // a coloca — Correção quando veio de /resubmission-needed (é lá que a ação
  // de reenvio mora), senão o balde de TAB_STATUSES. Peça sem fase aqui (já
  // na Revisão Final, na Gráfica…) não está nesta fila: o hook avisa.
  usePecaDoLink<{ peca: any; aba: string }>({
    pronto: !isLoading && !correcaoLoading && !isError && !correcaoIsError,
    localizar: (id) => {
      const emCorrecao = (correcaoItems as any[]).find((i: any) => i.id === id);
      if (emCorrecao) return { peca: emCorrecao, aba: "correcao" };
      const peca = itemPorId.get(id);
      if (!peca) return null;
      const aba = Object.keys(TAB_STATUSES).find((t) => TAB_STATUSES[t].includes(peca.status));
      return aba ? { peca, aba } : null;
    },
    abrir: ({ peca, aba }) => {
      if (aba !== activeTab) changeTab(aba);
      handleViewDetails(peca);
    },
    codigoDe: (id) => (pecasDoServidor as any[]).find((i: any) => i.id === id)?.displayId,
  });

  /**
   * A peça SEGUINTE da fila aberta, na ordem em que a tela a mostra (Kit e
   * prioritárias no topo, depois evento e grupo) — a mesma lista, os mesmos
   * filtros. Só vale quando a aba ativa É a fila da ação: um envio feito com
   * outra aba aberta não tem "próxima" que a pessoa esteja vendo.
   */
  const proximaDaFila = (itemId: string, fila: string): any | null => {
    if (activeTab !== fila) return null;
    const i = filteredItems.findIndex((x: any) => x.id === itemId);
    if (i < 0) return null;
    return filteredItems.slice(i + 1).find((x: any) => x.id !== itemId) ?? null;
  };

  /**
   * Leva o foco ao "Enviar para aprovação" quando o thumb acaba de subir.
   * O upload troca a zona vazia pelo bloco com a miniatura (outro nó), então o
   * foco — que estava no botão de escolher arquivo — caía no <body>, e quem
   * usa teclado precisava voltar tabulando desde o topo do modal. Dois quadros:
   * um para o React montar o bloco novo, outro para o botão existir no DOM.
   *
   * SÓ PUXA O FOCO DE QUEM NÃO ESTÁ USANDO. O upload leva segundos, e nesse
   * meio-tempo a pessoa pode ter ido digitar noutro campo do modal: roubar o
   * foco dali para "Enviar" fazia o próximo Enter mandar a peça para aprovação
   * sem querer. Move só se o foco caiu no <body> (o botão de escolher sumiu),
   * no PRÓPRIO contêiner do diálogo (o FocusScope do Radix devolve para lá o
   * foco de um nó removido — é o mesmo "caiu", um nível acima) ou ainda está
   * dentro da zona do thumb.
   */
  const zonaDoThumbRef = useRef<HTMLElement | null>(null);
  const focarEnvioParaAprovacao = useCallback(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const ativo = document.activeElement;
      const livre = !ativo || ativo === document.body
        || ativo.matches('[role="dialog"], [role="alertdialog"]')
        || !!zonaDoThumbRef.current?.contains(ativo);
      if (!livre) return;
      (document.querySelector('[data-testid="button-submit-approval-header"]') as HTMLButtonElement | null)?.focus();
    }));
  }, []);

  // Última barreira do gate de papel: a UI já esconde as ações, mas um handler
  // exposto não pode contar só com isso.
  const bloqueadoPorPapel = () => {
    if (podeEditar) return false;
    // Tom NEUTRO, não vermelho: é aviso de permissão, não falha. O vermelho
    // dizia "algo quebrou" a quem só está consultando a fila — e a faixa
    // "Modo consulta" do topo já é cinza pelo mesmo motivo.
    toast({ title: "Modo consulta", description: "Só a equipe de Arte pode alterar peças nesta tela." });
    return true;
  };

  const handleSubmitForApproval = () => {
    if (bloqueadoPorPapel()) return;
    if (!selectedItem || !approvalThumbUrl) {
      // Título que diz O QUE falta: "Erro" sozinho soa como falha do sistema,
      // quando é só um passo que ainda não foi dado.
      toast({ title: "Falta o thumb de aprovação", description: "Suba o thumb (arraste, escolha ou cole com Ctrl+V) antes de enviar para aprovação.", variant: "destructive" });
      return;
    }
    submitForApprovalMutation.mutate({ itemId: selectedItem.id, approvalThumbUrl });
  };

  // Salva o thumb sem enviar para aprovação (rascunho).
  const handleSaveThumbDraft = () => {
    if (bloqueadoPorPapel()) return;
    if (!selectedItem || !approvalThumbUrl) {
      toast({ title: "Falta o thumb", description: "Suba o thumb antes de salvar o rascunho.", variant: "destructive" });
      return;
    }
    saveThumbDraftMutation.mutate({ itemId: selectedItem.id, approvalThumbUrl });
  };

  // Envia (ou atualiza) o caminho do arquivo final.
  const handleSubmitFinalFile = () => {
    if (bloqueadoPorPapel()) return;
    if (!selectedItem || !finalFileUrl) {
      toast({ title: "Falta o arquivo final", description: "Informe o caminho do arquivo final antes de enviar.", variant: "destructive" });
      return;
    }
    const isUpdate = !!selectedItem.finalFileUrl; // já tinha arquivo → é atualização
    submitFinalFileMutation.mutate({ itemId: selectedItem.id, finalFileUrl, finalPreviewUrl: "", finalFileName: fileNameFromPath(finalFileUrl) || "", isUpdate });
  };

  // ── BUSCAR ARTE JÁ FEITA (dono, 21/09) ───────────────────────────────────
  //
  // "Para ele não precisar colocar o arquivo ou a thumb novamente e só
  // referenciar." O modal (components/buscar-arte-dialog.tsx) só ACHA a arte;
  // aplicar é encher o MESMO campo que o upload encheria. Daí em diante o
  // caminho é o de sempre — submit-for-approval, update-thumb,
  // sponsor-approvals/resubmit, submit-final-file — com os mesmos efeitos, a
  // mesma trilha e a mesma versão de arte. Nenhuma regra de negócio muda:
  // reaproveitar troca a ORIGEM da URL, não o fluxo de aprovação.
  //
  // `destino` em vez de guardar a função de aplicar no estado: função em
  // useState precisa de `setX(() => fn)` e some no primeiro esquecimento —
  // com o destino declarado, o que fazer com a arte fica num lugar só, aqui.
  // ── SUGESTÃO DO ARQUIVO FINAL (dono, 21/09) ──────────────────────────────
  // "Caso eu tenha buscado a arte já feita, na hora da finalização aparece uma
  // sugestão do arquivo final da última peça — apenas sugestão." O servidor
  // acha a peça de onde a arte veio pela MESMA URL de thumb (sem coluna nova)
  // e devolve o caminho dela, ou null. Aqui nada é gravado: "Usar este
  // caminho" só enche o campo; quem grava é o envio de sempre.
  //
  // A consulta só roda na etapa de Finalização e com o campo VAZIO — é
  // quando a sugestão serve; depois de carregada ela fica (vira a linha
  // menor enquanto a pessoa digita). "Ignorar" vale para a sessão, por peça.
  const naFinalizacao = !!selectedItem && podeEditar
    && ["sponsor_approved", "awaiting_creator_review"].includes(selectedItem.status);
  const [sugestoesIgnoradas, setSugestoesIgnoradas] = useState<Set<string>>(() => new Set());
  const chaveDaSugestaoFinal = selectedItem ? `/api/artes/sugestao-final?item=${encodeURIComponent(selectedItem.id)}` : "";
  const { data: sugestaoFinal = null } = useQuery<SugestaoDeArquivoFinal | null>({
    queryKey: [chaveDaSugestaoFinal],
    enabled: naFinalizacao && finalFileUrl.trim() === "" && !sugestoesIgnoradas.has(selectedItem!.id),
    staleTime: 60_000,
  });
  const sugestaoVisivel = naFinalizacao && sugestaoFinal?.finalFileUrl
    && !sugestoesIgnoradas.has(selectedItem!.id)
    && sugestaoFinal.finalFileUrl !== finalFileUrl
    ? sugestaoFinal : null;
  const usarSugestaoFinal = () => {
    if (!sugestaoVisivel) return;
    setFinalFileUrl(sugestaoVisivel.finalFileUrl);
    setFinalFileName(sugestaoVisivel.finalFileName || fileNameFromPath(sugestaoVisivel.finalFileUrl) || "");
    // Marca como editado para o botão de envio destravar — e NÃO envia.
    setFinalDirty(true);
  };
  const ignorarSugestaoFinal = () => {
    if (!selectedItem) return;
    setSugestoesIgnoradas((s) => new Set(s).add(selectedItem.id));
  };

  type DestinoDaArte = "thumb-aprovacao" | "thumb-troca" | "thumb-correcao" | "arquivo-final";
  const [buscaDeArte, setBuscaDeArte] = useState<{ itemId: string; displayId?: string | null; destino: DestinoDaArte } | null>(null);

  const aplicarArteEncontrada = (arte: ArteEncontrada) => {
    if (!buscaDeArte) return;
    const de = `${arte.displayId ?? "peça"}${arte.eventName ? ` (${arte.eventName})` : ""}`;
    const imagem = arte.thumbUrl ?? arte.previewUrl;

    if (buscaDeArte.destino === "arquivo-final") {
      if (!arte.arquivoFinalUrl) {
        toast({ title: "Esta arte não tem arquivo final", description: "Escolha outra ou informe o caminho à mão.", variant: "destructive" });
        return;
      }
      setFinalFileUrl(arte.arquivoFinalUrl);
      setFinalFileName(arte.arquivoFinalNome || fileNameFromPath(arte.arquivoFinalUrl) || "");
      // `finalDirty`: sem isto o botão "Atualizar arquivo" continua travado —
      // ele só libera quando o campo MUDA em relação ao que está gravado.
      setFinalDirty(true);
      setBuscaDeArte(null);
      toast({ title: `Arquivo final de ${de} aplicado`, description: "Confira o caminho e envie — a peça segue o fluxo normal." });
      return;
    }

    if (!imagem) {
      toast({ title: "Esta arte não tem imagem", description: "Escolha outra arte da lista.", variant: "destructive" });
      return;
    }

    if (buscaDeArte.destino === "thumb-troca") {
      // Última barreira do gate de papel, como em todo handler que GRAVA: os
      // outros destinos só enchem um campo, este manda para o servidor.
      if (bloqueadoPorPapel()) return;
      // A arte escolhida já é a atual: não há o que gravar (o servidor
      // responderia 409 "igual ao atual" — em vermelho, para um clique que não
      // errou nada). Aviso neutro e o modal fecha.
      if (itemPorId.get(buscaDeArte.itemId)?.approvalThumbUrl === imagem) {
        setBuscaDeArte(null);
        toast({ title: "Essa já é a arte atual desta peça" });
        return;
      }
      // A troca do thumb já aprovado grava NA HORA, pela mutação de sempre
      // (update-thumb): mesma revogação de aprovação estrita, mesma versão de
      // arte, mesma trilha.
      updateThumbMutation.mutate({ itemId: buscaDeArte.itemId, approvalThumbUrl: imagem, origem: de });
      setBuscaDeArte(null);
      return;
    }

    if (buscaDeArte.destino === "thumb-correcao") {
      setCorrecaoThumbUrl(imagem);
      setCorrecaoFileName(imagem.split("/").pop() || "Arte reaproveitada");
    } else {
      // Mesmo par de setters do upload: a miniatura aparece e o "Enviar para
      // aprovação" destrava, porque `approvalThumbUrl` é o que ele exige.
      concluirEnvioDoThumb(imagem);
      focarEnvioParaAprovacao();
    }
    setBuscaDeArte(null);
    toast({ title: `Arte de ${de} aplicada`, description: "Confira a miniatura e envie — a peça segue o fluxo normal de aprovação." });
  };

  const toggleItemSelection = (itemId: string) => {
    const s = new Set(selectedItemIds);
    if (s.has(itemId)) s.delete(itemId); else s.add(itemId);
    setSelectedItemIds(s);
  };

  const handleBulkSubmit = () => {
    if (bloqueadoPorPapel()) return;
    if (!sharedPdfUrl) {
      toast({ title: "Falta o PDF compartilhado", description: "Suba o PDF que vale para as peças selecionadas antes de enviar o lote.", variant: "destructive" });
      return;
    }
    // A seleção persiste entre abas: só peças aguardando envio aceitam
    // submit-for-approval — as demais devolveriam 409 no meio do lote.
    const ids = Array.from(selectedItemIds);
    const elegiveis = ids.filter(id => itemPorId.get(id)?.status === 'awaiting_submission');
    const foraDoLote = ids.length - elegiveis.length;
    if (elegiveis.length === 0) {
      toast({ title: "Nenhuma peça elegível", description: "Só peças aguardando envio podem receber o PDF compartilhado.", variant: "destructive" });
      return;
    }
    if (foraDoLote > 0) {
      toast({ title: `${foraDoLote} ${foraDoLote === 1 ? 'peça ficou fora' : 'peças ficaram fora'} do lote`, description: `Só ${elegiveis.length === 1 ? 'a peça aguardando envio segue' : `as ${elegiveis.length} peças aguardando envio seguem`} para aprovação.` });
    }
    submitBulkForApprovalMutation.mutate({ itemIds: elegiveis, pdfUrl: sharedPdfUrl });
  };

  // ─── ACTIVE CHIPS ──────────────────────────────────────────────────────────
  // Cada chip carrega o próprio filtro ({kind, id}) e é removido por
  // identidade, não por parsing do rótulo — o X do chip de Evento, por
  // exemplo, dependia de um window.__evList que nunca existiu e não fazia nada.
  type ActiveChip = { kind: string; id?: string; label: string };
  const activeChips = useMemo<ActiveChip[]>(() => {
    const chips: ActiveChip[] = [];
    eventFilter.forEach(id => {
      const ev = (events as any[]).find((e: any) => e.id === id);
      chips.push({ kind: 'event', id, label: `Evento: ${ev?.name || 'Selecionado'}` });
    });
    sponsorFilter.forEach(id => {
      const sp = (uniqueSponsors as any[]).find((s: any) => s.id === id);
      chips.push({ kind: 'sponsor', id, label: `Patrocinador: ${sp?.name || 'Selecionado'}` });
    });
    typeFilter.forEach(t => chips.push({ kind: 'type', id: t, label: `Tipo: ${t}` }));
    materialFilter.forEach(m => chips.push({ kind: 'material', id: m, label: `Material: ${m}` }));
    monthFilter.forEach(v => {
      const m = months.find(x => x.value === v);
      chips.push({ kind: 'month', id: v, label: `Mês: ${m?.label || v}` });
    });
    if (next10DaysFilter) chips.push({ kind: 'next10', label: "Próximos 10 dias" });
    if (periodFilter !== "Todos") chips.push({ kind: 'period', label: `Período: ${periodFilter}` });
    if (urgenteFilter) chips.push({ kind: 'urgente', label: "Urgente" });
    if (atrasadoFilter) chips.push({ kind: 'atrasado', label: "Só atrasadas" });
    if (paradasFilter) chips.push({ kind: 'paradas', label: `Paradas há mais de ${PARADA_HA_MAIS_DE}d` });
    if (thumbFilter !== "todos") chips.push({ kind: 'thumb', label: thumbFilter === "sem" ? "Sem thumb" : "Com thumb" });
    if (finalFilter !== "todos") chips.push({ kind: 'final', label: finalFilter === "sem" ? "Sem arquivo final" : "Com arquivo final" });
    if (searchFilter) chips.push({ kind: 'search', label: `Busca: "${searchFilter}"` });
    // O filtro local da aba Correção existia sem aparecer em lugar nenhum.
    if (correcaoSponsorFilter !== "all") {
      const nome = (correcaoItems as any[])
        .flatMap((i: any) => i.awaitingArteApprovals || [])
        .find((a: any) => a.sponsorId === correcaoSponsorFilter)?.sponsor?.name;
      chips.push({ kind: 'correcaoSponsor', label: `Correção · ${nome || 'patrocinador'}` });
    }
    return chips;
  }, [eventFilter, sponsorFilter, typeFilter, materialFilter, monthFilter, next10DaysFilter, periodFilter, urgenteFilter, atrasadoFilter, paradasFilter, thumbFilter, finalFilter, searchFilter, correcaoSponsorFilter, correcaoItems, events, uniqueSponsors]);

  const removeChipFilter = (chip: ActiveChip) => {
    switch (chip.kind) {
      case 'event': setEventFilter(prev => prev.filter(v => v !== chip.id)); break;
      case 'sponsor': setSponsorFilter(prev => prev.filter(v => v !== chip.id)); break;
      case 'type': setTypeFilter(prev => prev.filter(v => v !== chip.id)); break;
      case 'material': setMaterialFilter(prev => prev.filter(v => v !== chip.id)); break;
      case 'month': setMonthFilter(prev => prev.filter(v => v !== chip.id)); break;
      case 'next10': setNext10DaysFilter(false); break;
      case 'period': setPeriodFilter("Todos"); break;
      case 'urgente': setUrgenteFilter(false); break;
      case 'atrasado': setAtrasadoFilter(false); break;
      case 'paradas': setParadasFilter(false); break;
      case 'thumb': setThumbFilter("todos"); break;
      case 'final': setFinalFilter("todos"); break;
      case 'search': setSearchFilter(""); break;
      case 'correcaoSponsor': setCorrecaoSponsorFilter("all"); break;
    }
  };

  // ─── RENDER ────────────────────────────────────────────────────────────────
  // "Aguardando envio" e não "Mandar para Aprovação"/"Pendentes": a mesma fase
  // tinha quatro nomes na tela (aba, stat card, selo e empty state), e um deles
  // ("Liberado") é o rótulo de OUTRO status.
  const tabs = [
    { id: "criar-aprovacoes", label: "Aguardando envio", count: pendingCount, Icon: Send, testId: "tab-criar-aprovacoes" },
    { id: "aguardando-patrocinador", label: "Aguardando patrocinador", count: aguardandoCount, Icon: Clock, testId: "tab-aguardando-patrocinador" },
    { id: "correcao", label: "Correção", count: correcaoCount, Icon: RotateCcw, testId: "tab-correcao" },
    { id: "finalizar-layouts", label: "Finalizar arte", count: needsFinalFileCount, Icon: FileCheck, testId: "tab-finalizar-layouts" },
    { id: "finalizados", label: "Finalizados", count: finalizadosCount, Icon: CheckCircle, testId: "tab-finalizados" },
  ];

  // As MESMAS cinco abas, para o seletor de fase do celular. `pinned` mantém a
  // ordem do fluxo (aguardando envio → finalizados), que é a ordem em que a
  // peça anda; alfabética começaria por "Aguardando patrocinador" e terminaria
  // em "Finalizar arte", uma sequência que não existe no trabalho de ninguém.
  const faseFilterOptions = tabs.map(tab => ({
    value: tab.id, label: tab.label, count: tab.count, pinned: true,
  }));
  const faseAtualCount = tabs.find(t => t.id === activeTab)?.count ?? 0;

  // OS CINCO STAT CARDS SAÍRAM DAQUI — e este é o conserto do "conteúdo
  // cortado" reportado pelo dono.
  //
  // Eles eram uma cópia palavra por palavra e número por número das cinco abas
  // desenhadas 40px abaixo ("Aguardando envio 1" no card, "Aguardando envio 1"
  // na aba), com o mesmo clique e o mesmo destino. Cobravam ~113px de cards
  // mais ~28px da legenda "Contagens de toda a fila da Arte" — 141px de altura
  // FIXA, porque o cabeçalho é flexShrink:0 e a listagem é o `flex:1` que sobra.
  //
  // Num notebook de 1536×674, `main` tem 610px: o cabeçalho ficava com ~358 e a
  // área rolável com ~252, menos 48 de padding = ~204px úteis. Cabiam três
  // linhas de tabela, e TUDO — o aviso da janela de 90 dias, os chips de
  // evento, a faixa do evento — vivia permanentemente pela metade nas duas
  // bordas daquela fresta. Não havia um `overflow:hidden` culpado: o recorte
  // era a própria altura que o cabeçalho não devolvia.
  //
  // Sem os cards a listagem passa de ~252 para ~393px (+56%). A contagem por
  // fase continua inteira nas abas, e o que os cards NÃO diziam (atrasadas
  // contra o marco da fase, peças de evento urgente) virou a faixa de
  // diagnóstico dentro da área rolável — ver renderGroupedTable.
  //
  // No celular a perda seria a "segunda porta de entrada" para as fases, mas
  // ela já não depende dos cards: a fileira de abas virou um seletor de fase
  // que lista as cinco com a contagem de cada uma.

  // ─── LINHA DA TABELA E CARD DO MOBILE ──────────────────────────────────────

  /**
   * Ação primária da linha, por fase. `null` quando a fase não tem ação (ou
   * quando o papel está em modo consulta).
   */
  const acaoPrimaria = (item: any, tabId: string) => {
    if (!podeEditar) return null;
    if (tabId !== "criar-aprovacoes" && tabId !== "finalizar-layouts") return null;
    const isSkip = tabId === "criar-aprovacoes" && item.skipApproval;
    return {
      // TINTA, uma cor só.
      //
      // Eram três, por aba: azul em Finalizar, roxo em Enviar direto, laranja
      // em Enviar. A cor não distinguia uma LINHA da outra — dentro de uma aba
      // todas as linhas tinham a mesma —, então ela não carregava informação
      // nenhuma; o que ela fazia era gastar três cores de destaque em botões
      // que se repetem em toda linha da tabela. O laranja é a cor de ATENÇÃO
      // desta tela (o prazo, o selo, a aba ativa) e usá-lo assim anulava o
      // sinal. Qual é a ação continua escrito no rótulo, que é onde se lê.
      bg: '#1c1917',
      // Rótulos curtos, porque a fase já está escrita na aba ativa logo acima.
      // "Enviar aprovação" pedia ~176px numa coluna de 170: com o flexWrap da
      // célula, o botão QUEBRAVA para a linha de cima do menu "⋯" e a linha da
      // tabela crescia ~40px por causa disso. O que a etiqueta perdeu está no
      // `title` de cada botão, que já existia.
      //
      // RODADA 4 — o MESMO rótulo "Enviar" fazia duas coisas: com rascunho
      // salvo, enviava na hora; sem thumb, só abria o modal. Quem clicava
      // numa peça sem thumb achava que tinha enviado. Sem thumb o botão diz o
      // passo que falta ("Subir thumb"); "Enviar" fica só para o clique que
      // envia de fato.
      label: tabId === "finalizar-layouts" ? "Finalizar"
        : isSkip ? "Enviar direto"
        : item.approvalThumbUrl ? "Enviar" : "Subir thumb",
      // Um clique para enviar: se a peça já tem thumb salvo (rascunho), o botão
      // dispara o envio direto, sem abrir o modal e SEM confirmação — a ação é
      // reversível pela aba Correção e o toast dá o feedback; window.confirm só
      // acrescentaria atrito. O olho no menu "⋯" continua abrindo os detalhes.
      canSendDirect: tabId === "criar-aprovacoes" && !isSkip && !!item.approvalThumbUrl,
      isSkip,
    };
  };

  /**
   * O CONJUNTO DO REENVIO, derivado — corpo e rodapé leem daqui. `aprovacoes`
   * vem da fila da Correção (todas as linhas de patrocinador da peça); nas
   * respostas antigas sem esse campo, cai para as reprovadas.
   */
  const correcaoAprovacoes: any[] = correcaoItem?.aprovacoes ?? correcaoItem?.awaitingArteApprovals ?? [];
  const correcaoDestinatarios: string[] = correcaoAprovacoes.filter((a: any) => a.status !== 'approved').map((a: any) => a.sponsorId);

  /** Menu "⋯": ver detalhes, exportar prova e dispensar. */
  const renderMenuAcoes = (item: any) => {
    const podeDispensar = podeEditar && DISPENSAVEIS_STATUSES.includes(item.status);
    const podeDevolver = podeEditar && !naoDevolvivel(item.status);
    return (
      <Popover>
        <PopoverTrigger asChild>
          <button
            onClick={e => e.stopPropagation()}
            aria-label={`Mais ações para ${item.displayId}`}
            data-testid={`button-row-menu-${item.id}`}
            style={{ width: isMobile ? 44 : 36, minWidth: isMobile ? 44 : 36, height: isMobile ? 44 : 36, flexShrink: 0, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#ffffff', border: '1px solid #e7e5e4', cursor: 'pointer', color: '#57534e' }}
          >
            <MoreHorizontal style={{ width: 15, height: 15 }} />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="p-1" style={{ width: 224 }} onClick={e => e.stopPropagation()}>
          <button
            onClick={() => handleViewDetails(item)}
            data-testid={`button-view-${item.id}`}
            style={menuItemStyle('#44403c')}
            onMouseEnter={e => { e.currentTarget.style.background = '#f5f5f4'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
          >
            <Eye style={{ width: 14, height: 14, flexShrink: 0 }} /> Ver detalhes
          </button>
          <button
            onClick={() => handleExportItemPDF(item)}
            data-testid={`button-export-item-pdf-${item.id}`}
            style={menuItemStyle('#44403c')}
            onMouseEnter={e => { e.currentTarget.style.background = '#f5f5f4'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
          >
            <Printer style={{ width: 14, height: 14, flexShrink: 0 }} /> Exportar prova em PDF
          </button>
          {podeDispensar && (
            <>
              <div style={{ height: 1, background: '#f0efee', margin: '4px 0' }} />
              {/* Sai da fileira e vem para cá, marcada: a ação leva a peça
                  direto para produção, pulando patrocinador E revisão final.
                  O NOME (dono, 09/09): era "Dispensar peça", com o ícone de
                  proibido — e "dispensar" leu-se como "a peça não vai
                  existir", que é o oposto do que acontece: ela vai ser
                  impressa, e antes de todo mundo. O ícone virou avanço, não
                  bloqueio.
                  O RÓTULO é escolha do dono, reafirmada em 09/09: "Direto
                  para finalização". Fica registrado o que a ação FAZ, para
                  quem vier depois não se perder: desde 09/09 o servidor
                  grava DESTINO_DA_DISPENSA (routes/items.ts) — a peça PARA
                  na finalização da Arte, sobe o arquivo final e a Revisão
                  ainda confere; o que se pula é só a aprovação do
                  Atendimento. (Até 09/09 era `ready_for_production`, direto
                  para a Gráfica — este comentário dizia isso e ficou velho.)
                  O corpo do diálogo diz o efeito real, que é onde o engano
                  custaria caro.
                  AZUL, e não o âmbar de "Devolver ao solicitante" (dono,
                  09/09: os dois estavam com a mesma cor): avançar e voltar
                  atrás não podem parecer a mesma coisa.
                  A rota segue /dispense — nome interno não muda. */}
              <button
                onClick={() => { setDispenseItem(item); setDispenseReason(""); }}
                data-testid={`button-dispense-${item.id}`}
                style={menuItemStyle(P.blue.text)}
                onMouseEnter={e => { e.currentTarget.style.background = P.blue.bg; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
              >
                <FastForward style={{ width: 14, height: 14, flexShrink: 0 }} /> Direto para finalização
              </button>
            </>
          )}
          {podeDevolver && (
            <>
              {!podeDispensar && <div style={{ height: 1, background: '#f0efee', margin: '4px 0' }} />}
              {/* Vizinha de "dispensar" e o oposto dela: dispensar empurra a
                  peça para produção, devolver a manda para o começo. As duas
                  tiram a peça da fila da Arte, e por isso moram juntas. */}
              <button
                onClick={() => { setDevolverItem(item); setDevolverMotivo(""); }}
                data-testid={`button-devolver-${item.id}`}
                style={menuItemStyle('#b45309')}
                onMouseEnter={e => { e.currentTarget.style.background = '#fffbeb'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
              >
                <RotateCcw style={{ width: 14, height: 14, flexShrink: 0 }} /> Devolver ao solicitante
              </button>
            </>
          )}
        </PopoverContent>
      </Popover>
    );
  };

  /** Botão primário da linha, com trava e spinner APENAS na peça em curso. */
  const renderBotaoPrimario = (item: any, tabId: string, largura?: string) => {
    const acao = acaoPrimaria(item, tabId);
    if (!acao) return null;
    // O estado da mutação é único e compartilhado: enquanto um envio corria,
    // TODAS as linhas com envio direto ficavam travadas. E o objeto de estilo
    // era fixo — mesma cor, mesmo cursor, sem opacidade e sem spinner, com o
    // estilo inline vencendo o `:disabled` nativo.
    const enviando = sendingId === item.id;
    const travado = enviando || (acao.canSendDirect && !!sendingId);
    return (
      <button
        onClick={e => {
          e.stopPropagation();
          if (acao.canSendDirect) {
            setSendingId(item.id);
            submitForApprovalMutation.mutate({ itemId: item.id, approvalThumbUrl: item.approvalThumbUrl });
            return;
          }
          handleViewDetails(item);
        }}
        disabled={travado}
        data-testid={`button-action-${item.id}`}
        title={acao.isSkip
          ? "Sem aprovação de patrocinador — abre a peça para enviar direto à finalização (arquivo final)"
          : acao.canSendDirect
            ? "Envia AGORA o thumb salvo para a aprovação do patrocinador, sem abrir a peça"
            : tabId === "finalizar-layouts"
              ? "Abre a peça para colar o caminho do arquivo final"
              : "Abre a peça para subir o thumb de aprovação"}
        style={{
          // minWidth 0 + flexShrink: numa coluna estreita o botão encolhe com
          // reticências em vez de empurrar o menu "⋯" para outra linha.
          width: largura, minWidth: 0, flexShrink: 1,
          height: isMobile ? 44 : 36, padding: '0 11px', borderRadius: 9,
          // Travado: cinza da casa com rótulo #57534e (6:1). Era #d6d3d1 com
          // letra BRANCA a 85% — ~1,4:1 —, e é nesse estado que o botão diz
          // "Enviando…", a única confirmação de que o clique pegou.
          backgroundColor: travado ? '#e7e5e4' : acao.bg,
          color: travado ? '#57534e' : '#ffffff', border: 'none',
          cursor: travado ? 'not-allowed' : 'pointer',
          fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          overflow: 'hidden', textOverflow: 'ellipsis',
          transition: 'filter 0.15s',
        }}
        onMouseEnter={e => { if (!travado) e.currentTarget.style.filter = 'brightness(1.08)'; }}
        onMouseLeave={e => { e.currentTarget.style.filter = 'brightness(1)'; }}
      >
        {enviando
          ? <><span style={{ width: 12, height: 12, borderRadius: '50%', border: '2px solid #d6d3d1', borderTopColor: '#57534e', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />Enviando…</>
          : acao.label}
      </button>
    );
  };

  /**
   * Célula de prazo — o marco da FASE (`phaseDeadline`), em uma linha de texto.
   *
   * PORQUÊ NÃO É MAIS UM SELO PREENCHIDO. Era uma caixa de fundo sólido com duas
   * linhas dentro, e numa fila de 30 peças atrasadas isso são 30 retângulos
   * vermelhos: o prazo, que é dado de APOIO para escolher a ordem do trabalho,
   * pesava mais que o botão de ação primária da mesma linha. O desenho, a régua
   * de cor e os contrastes moram em components/prazo-inline — a caixa some, a
   * cor passa a ocupar só a área das letras e a magnitude do atraso vira peso
   * tipográfico, que é a única coisa que muda de linha para linha.
   *
   * A REGRA DE DATA NÃO MUDOU: continua `phaseDeadline` (lib/arte-rules), a
   * mesma da faixa de diagnóstico, do filtro "Prazo: atrasados" e da Gestão de
   * Prazos, com o marco da Finalização (−10) e o ajuste de fim de semana.
   */
  const renderPrazo = (item: any, tabId: string, hoje: Date) => {
    const p = phaseDeadline(item.event, tabId, hoje);
    // A IDADE NA FASE, abaixo da data. O prazo diz o marco (futuro); isto diz
    // há quanto tempo a peça está parada onde está — numa fila que espera
    // terceiros, é a pergunta. Sem `statusChangedAt`, sem idade (ver
    // diasNaFase). Mesma família tipográfica do prazo: texto, não selo.
    const dias = diasNaFase(item, hoje);
    const tom = dias !== null ? tomDaIdade(dias) : null;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <PrazoInline
          diff={p?.diff ?? null}
          date={p?.date ?? null}
          label={p?.label}
          testId={`cell-prazo-${item.id}`}
        />
        {dias !== null && tom && (
          <span
            data-testid={`cell-idade-${item.id}`}
            title={`Há ${dias} ${dias === 1 ? 'dia' : 'dias'} nesta fase (desde ${new Date(item.statusChangedAt ?? item.status_changed_at).toLocaleDateString('pt-BR')})`}
            style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: tom.peso, color: tom.cor, whiteSpace: 'nowrap' }}
          >
            há {dias}d na fase
          </span>
        )}
      </div>
    );
  };

  /** Tags de arquivo da coluna "Peça" (referência, book, fora do book). */
  const renderTagsDaPeca = (item: any) => (
    <>
      {/* PRIORITÁRIA (dono, 27/08): a peça que a Solicitação marcou para a
          Arte atacar primeiro — ela também FURA a ordenação da fila. */}
      {item.isPriority && (
        <span title="Peça prioritária — marcada pela Solicitação para sair na frente" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 800, color: '#be123c', backgroundColor: '#fff1f2', border: '1px solid #fecdd3', borderRadius: 6, padding: '2px 7px', letterSpacing: '0.03em' }} data-testid={`tag-prioritaria-${item.id}`}>
          <AlertTriangle style={{ width: 9, height: 9 }} />
          PRIORITÁRIA
        </span>
      )}
      {item.referenceUrl && (
        <a href={item.referenceUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} title="Ver referência visual do solicitante" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 600, color: '#2563eb', textDecoration: 'none', backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, padding: '2px 7px' }} data-testid={`link-reference-arte-${item.id}`}>
          <Paperclip style={{ width: 9, height: 9 }} />
          Ref. visual
        </a>
      )}
      {item.bookUrl ? (
        <a href={item.bookUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} title="Abrir book de aprovação (PDF) para enviar ao patrocinador" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 600, color: '#6d28d9', textDecoration: 'none', backgroundColor: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 6, padding: '2px 7px' }} data-testid={`link-book-arte-${item.id}`}>
          <FileText style={{ width: 9, height: 9 }} />
          Book
        </a>
      ) : eventosComBook.has(item.eventId) && (
        // Salvar o book limpa o bookUrl de TODAS as peças do evento e regrava só
        // as marcadas — é fácil deixar peça de fora sem perceber, e isso só
        // aparecia dentro do modal de exportação.
        <span title="O evento já tem book publicado, mas esta peça ficou de fora dele" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 600, color: '#92400e', backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: '2px 7px' }} data-testid={`tag-fora-do-book-${item.id}`}>
          <AlertTriangle style={{ width: 9, height: 9 }} />
          Fora do book
        </span>
      )}
    </>
  );

  /**
   * Selos de estado da fila "Aguardando envio": reprovada pelo patrocinador ou
   * thumb salvo como rascunho. Função única para a LINHA e o CARD do celular —
   * o card não mostrava nenhum dos dois, e no celular uma peça que voltou
   * reprovada era idêntica a uma que nunca saiu.
   *
   * Caixa baixa e sem a abreviação em versalete ("REPROV.", "RASCUNHO"): na
   * coluna de 84px o versalete de 11px pedia mais largura do que havia e era
   * cortado; e dois selos gritando em maiúsculas competiam com o botão da
   * linha. O sentido completo fica no `title`.
   */
  const renderSelosDaFila = (item: any, tabId: string) => (
    <>
      {tabId === "criar-aprovacoes" && item.rejectedBySponsor && (
        <span title="Reprovada pelo patrocinador — voltou para a Arte refazer" style={{ fontSize: 11, fontWeight: 700, color: '#b91c1c', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '1px 5px', whiteSpace: 'nowrap' }} data-testid={`badge-rejected-sponsor-${item.id}`}>
          Reprovada
        </span>
      )}
      {/* Thumb salvo mas ainda NÃO enviado para aprovação (rascunho) */}
      {tabId === "criar-aprovacoes" && item.approvalThumbUrl && !item.rejectedBySponsor && (
        <span title="Thumb salvo como rascunho, ainda não enviado para aprovação" style={{ fontSize: 11, fontWeight: 700, color: '#6d28d9', backgroundColor: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 6, padding: '1px 5px', whiteSpace: 'nowrap' }} data-testid={`badge-thumb-draft-${item.id}`}>
          Rascunho
        </span>
      )}
    </>
  );

  const renderRow = (item: any, tabId: string, comSelecao: boolean, hoje: Date) => (
    <tr
      key={item.id}
      data-testid={`row-pending-item-${item.id}`}
      // A linha inteira abre os detalhes no desktop, como o card equivalente já
      // fazia no mobile — o mesmo conteúdo tinha dois modelos de interação.
      onClick={() => handleViewDetails(item)}
      style={{ borderBottom: '1px solid #f5f5f4', transition: 'background 0.15s', cursor: 'pointer' }}
      onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = '#fafaf9'}
      onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = '#ffffff'}
    >
      {comSelecao && (
        <td style={{ padding: '9px 12px' }} onClick={e => e.stopPropagation()}>
          <Checkbox
            checked={selectedItemIds.has(item.id)}
            aria-label={`Selecionar a peça ${item.displayId}${item.type ? ` — ${item.type}` : ''}`}
            onCheckedChange={() => toggleItemSelection(item.id)}
            data-testid={`checkbox-item-${item.id}`}
          />
        </td>
      )}
      {/* ID (em Finalizados, "ID / Status" — ver ARTE_COLS_FINALIZADOS).
          `overflow: hidden` é a GARANTIA ESTRUTURAL, a largura é o ajuste: o
          selo é `whiteSpace: nowrap` (status-badge.tsx) e numa tabela
          `tableLayout: fixed` o que não cabe PINTA POR CIMA da célula vizinha —
          era assim que "Pronto para Produção" (153,6px) aparecia por baixo do
          número da quantidade. Com a coluna em 208px o recorte nunca chega a
          agir com a fonte real (184 úteis contra 175,9 do pior selo); ele existe
          para que um rótulo novo, ou um fallback de fonte mais largo, sejam
          cortados dentro da própria coluna em vez de invadirem Qtd de novo.
          alignItems flex-start: num flex column o padrão é stretch, e o selo
          seria esticado na largura inteira da célula. */}
      <td style={{ padding: '9px 12px', overflow: 'hidden' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-start' }}>
          <span style={{ fontFamily: '"DM Mono", monospace', fontSize: 12, color: '#57534e', fontWeight: 600 }} data-testid={`text-display-id-${item.id}`}>
            {item.displayId}
          </span>
          <SeloKit peca={item} />
          {tabId === "finalizados" && <StatusBadge status={item.status} />}
          {renderSelosDaFila(item, tabId)}
        </div>
      </td>
      {/* Qtd — formatQuantity: `String(q || '—').padStart(2,'0')` transformava
          peça sem quantidade em "0—", e uma peça só em "01". */}
      <td style={{ padding: '9px 12px', fontWeight: 700, color: item.quantity ? '#1c1917' : '#57534e', fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>
        {formatQuantity(item.quantity)}
      </td>
      {/* Peça */}
      <td style={{ padding: '9px 12px' }}>
        {/* alignItems flex-start: num flex column o padrão é stretch, e as tags
            eram esticadas na largura inteira da célula, parecendo campo vazio. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-start', minWidth: 0 }}>
          {/* Tipo E descrição. `description || type` escondia o tipo da peça
              sempre que havia descrição — na coluna chamada "Peça" — e deixava
              a única coluna elástica com um vazio de ~300px quando a descrição
              era curta. O tipo é o nome da peça; a descrição é o detalhe. */}
          <span style={{ fontWeight: 700, color: '#1c1917', fontSize: 13, wordBreak: 'break-word' }}>{item.type || item.description}</span>
          {item.type && item.description && (
            <span style={{ fontSize: 12, color: '#57534e', wordBreak: 'break-word' }}>{item.description}</span>
          )}
          {item.observations && (
            <span style={{ fontSize: 11, color: '#b45309', display: 'flex', alignItems: 'center', gap: 3 }}>
              <AlertCircle style={{ width: 10, height: 10, flexShrink: 0 }} />{item.observations}
            </span>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>{renderTagsDaPeca(item)}</div>
        </div>
      </td>
      {/* Dimensões — MEDIDA (a coluna seguinte é ÁREA; ver ARTE_COLS).
          `overflow: hidden` é o que impede a linha da sangria, que é `nowrap`
          numa tabela `tableLayout: fixed`, de pintar por cima da célula de M² e
          fazer "1.90 (sangria)" e "1.71" lerem como um valor só. O `title`
          devolve o valor inteiro quando as reticências entram. */}
      <td style={{ padding: '9px 12px', whiteSpace: 'nowrap', overflow: 'hidden' }}>
        {item.visualWidth && item.visualHeight ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
            <span
              title={`${item.visualWidth} × ${item.visualHeight}`}
              style={{ fontSize: 12, fontWeight: 700, color: '#1c1917', fontVariantNumeric: 'tabular-nums', overflow: 'hidden', textOverflow: 'ellipsis' }}
            >
              {item.visualWidth} × {item.visualHeight}
            </span>
            {/* A sangria vinha com quase o mesmo peso da medida principal (11px
                contra 12px, cor escura), e a palavra "(sangria)" só aparecia no
                FIM — o olho lia dois números irmãos. Agora o rótulo vem antes,
                em versalete claro, e o número vai em cinza AA: fica óbvio quem
                é o principal antes de ler qualquer dígito. */}
            {item.fileWidth && item.fileHeight && (
              <span
                title={`ARQ. (com sangria): ${item.fileWidth} × ${item.fileHeight} — é o que a impressora recebe`}
                style={{ fontSize: 11, fontWeight: 400, color: '#746e69', fontVariantNumeric: 'tabular-nums', overflow: 'hidden', textOverflow: 'ellipsis' }}
              >
                <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>arq.</span>
                {' '}{item.fileWidth} × {item.fileHeight}
              </span>
            )}
          </div>
        ) : (
          <span style={{ color: '#57534e', fontSize: 12 }}>—</span>
        )}
      </td>
      {/* m² — ÁREA. Alinhada à direita com `tabular-nums` (é o que permite
          comparar a coluna de cima a baixo) e separada da medida por um filete:
          são grandezas diferentes e precisam ser lidas como duas colunas. */}
      <td
        title={item.calculatedM2 ? `${item.calculatedM2} m²` : undefined}
        style={{ padding: '9px 12px', textAlign: 'right', borderLeft: '1px solid #f0efed', fontFamily: '"Space Grotesk", sans-serif', fontWeight: 600, fontSize: 13, color: '#1c1917', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
      >
        {item.calculatedM2 || '—'}
      </td>
      {/* Material */}
      <td style={{ padding: '9px 12px' }}>
        {item.material ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
            {/* Materiais do catálogo são curtos ("SANETT", "LONA"), mas o campo
                aceita texto livre — "Adesivo transparente" já vazava para a
                coluna vizinha. Trunca; o nome completo fica no hover. */}
            <span title={item.material} style={{
              display: 'block', maxWidth: '100%', padding: '2px 8px',
              backgroundColor: '#f5f5f4', color: '#57534e', borderRadius: 6,
              fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', boxSizing: 'border-box',
            }}>
              {item.material}
            </span>
            {item.finish && (
              <span title={item.finish} style={{ fontSize: 11, color: '#57534e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{item.finish}</span>
            )}
          </div>
        ) : <span style={{ color: '#57534e', fontSize: 12 }}>—</span>}
      </td>
      {/* Arte — thumb / arquivo final */}
      <td style={{ padding: '9px 12px' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <ThumbPreview url={item.approvalThumbUrl} label={`thumb de ${item.displayId}`} />
          {item.finalFileUrl ? (
            <a href={item.finalFileUrl} target="_blank" rel="noopener noreferrer" title="Ver arquivo final" style={{ width: 26, height: 26, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', flexShrink: 0 }}>
              <FileText style={{ width: 13, height: 13 }} />
            </a>
          ) : (
            <span title="Sem arquivo final" style={{ width: 26, height: 26, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f4', color: '#78716c', flexShrink: 0 }}>
              <FileText style={{ width: 13, height: 13 }} />
            </span>
          )}
        </div>
      </td>
      {/* Prazo */}
      <td style={{ padding: '9px 12px' }}>{renderPrazo(item, tabId, hoje)}</td>
      {/* Patrocinadores — a segunda colisão da varredura, mesmo mecanismo do
          selo: o chip é `whiteSpace: nowrap` (sponsor-chips.tsx) e não cabia na
          coluna. Medido: "Prefeitura Municipal" pede 131,6px contra 68 úteis e
          vazava 52 — e isso NÃO é hipótese, é colisão de hoje nas abas que têm
          botão de ação primária: o chip pintava 21,9px POR CIMA do "Enviar
          direto". `overflow: hidden` mantém o excesso dentro da coluna; o nome
          inteiro continua no `title` do contêiner, que já lista todos. As
          reticências DENTRO do chip dependem de sponsor-chips.tsx, componente
          compartilhado com outras telas — fica para quem for dono dele. */}
      <td style={{ padding: '9px 12px', overflow: 'hidden' }}>
        {/* Na fila que espera patrocinador, o chip diz DE QUEM se espera. */}
        <SponsorChips sponsors={item.sponsors ?? []} variant="orange" size="sm" destacarPendencia={tabId === "aguardando-patrocinador"} />
      </td>
      {/* Ações */}
      {/* flexWrap: 'nowrap' — com 'wrap', a ação primária que não coubesse na
          largura da coluna ia para a linha DE CIMA do menu "⋯", desalinhada do
          resto da linha e somando ~40px de altura em cada peça da fila. Agora o
          botão encolhe (minWidth 0 + reticências) e os dois ficam sempre lado a
          lado, na altura da linha. */}
      <td style={{ padding: '9px 12px', textAlign: 'right' }}>
        <div style={{ display: 'flex', flexWrap: 'nowrap', justifyContent: 'flex-end', alignItems: 'center', gap: 6 }}>
          {renderBotaoPrimario(item, tabId)}
          {renderMenuAcoes(item)}
        </div>
      </td>
    </tr>
  );

  const renderMobileCard = (item: any, tabId: string, hoje: Date) => (
    <div key={item.id}
      role="button"
      tabIndex={0}
      data-testid={`card-arte-${item.id}`}
      style={{ backgroundColor: '#fff', border: '1px solid #e7e5e4', borderRadius: 8, padding: 12, cursor: 'pointer' }}
      onClick={() => handleViewDetails(item)}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleViewDetails(item); } }}>
      {/* O cabeçalho do card fala a MESMA língua da linha da tabela: ID em
          cinza (o laranja no código de toda peça gastava a cor de atenção num
          dado que não pede atenção), selo de status só em Finalizados — nas
          outras fases o seletor de fase logo acima já diz onde a peça está, e
          o selo repetia isso em cada card —, e os selos de reprovada/rascunho
          que a linha tinha e o card não. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
        <span style={{ fontFamily: '"DM Mono", monospace', fontWeight: 600, color: '#57534e', fontSize: 12 }}>{item.displayId}</span>
        <SeloKit peca={item} />
        {renderSelosDaFila(item, tabId)}
        {tabId === "finalizados" && <span style={{ marginLeft: 'auto' }}><StatusBadge status={item.status} /></span>}
      </div>
      <div style={{ fontWeight: 700, fontSize: 13, color: '#1c1917' }}>{item.type}</div>
      {item.description && <div style={{ fontSize: 12, color: '#57534e', marginTop: 2 }}>{item.description}</div>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
        {renderPrazo(item, tabId, hoje)}
        <span style={{ fontSize: 11, fontWeight: 600, color: '#57534e' }}>Qtd {formatQuantity(item.quantity)}</span>
        {renderTagsDaPeca(item)}
      </div>
      {/* Mesmo teste isImage do card de correção: thumb em PDF virava um <img>
          quebrado aqui. */}
      {item.approvalThumbUrl && (/\.(png|jpg|jpeg|gif|webp)/i.test(item.approvalThumbUrl) || item.approvalThumbUrl.startsWith('/objects/')) && (
        <div style={{ marginTop: 6 }}>
          <img loading="lazy" decoding="async" src={miniatura(item.approvalThumbUrl)} alt="" style={{ maxWidth: 80, maxHeight: 60, borderRadius: 6, objectFit: 'cover' }} />
        </div>
      )}
      <SponsorChips sponsors={item.sponsors ?? []} variant="colored" size="sm" max={3} destacarPendencia={tabId === "aguardando-patrocinador"} />
      {/* O card não oferecia NENHUMA ação: enviar e finalizar ainda davam pelo
          modal, mas dispensar e exportar prova simplesmente não existiam no
          celular. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }} onClick={e => e.stopPropagation()}>
        {renderBotaoPrimario(item, tabId, '100%')}
        {renderMenuAcoes(item)}
      </div>
    </div>
  );

  const renderGroupedTable = (items: any[], tabId: string) => {
    // A coluna de seleção só existe nestas duas abas — nas outras a tabela não
    // deve pagar os 44px dela.
    const comSelecao = tabId === "criar-aprovacoes" || tabId === "finalizados";
    // Um conjunto de colunas por aba: só Finalizados desenha o selo de status
    // na célula de ID e só ela fica sem botão de ação primária. As outras
    // quatro continuam com ARTE_COLS, letra por letra (ver ARTE_COLS_FINALIZADOS).
    const cols = colunasDaAba(tabId);
    const minW = tableMinWidth(comSelecao, cols);
    const totalColunas = cols.length + (comSelecao ? 1 : 0);

    if (items.length === 0) {
      const porFiltro = activeFilterCount > 0;
      // Vazio POR CAUSA do recorte de atrasadas tem texto próprio: "nenhuma
      // peça aguardando envio" leria como "nada a fazer" quando a fila inteira
      // continua ali, só que dentro do prazo. O atalho desliga só este recorte
      // e mantém os demais — sair de "atrasadas" não deveria custar o filtro
      // de evento que a pessoa montou antes.
      const soAtrasadas = atrasadoFilter;
      const marco = PHASE_DEADLINE[tabId]?.label ?? "prazo da fase";
      const outrosFiltros = activeFilterCount - 1;
      return (
        <div style={{ textAlign: 'center', padding: '48px 0' }} data-testid="empty-arte">
          {/* ÍCONE DE 28, título 15/700, frase 13 — a régua dos vazios das
              outras telas. Eram QUATRO tamanhos diferentes (40, 44, 48) num
              mesmo bloco, e o vazio ficava desenhado com mais peso visual que
              qualquer linha da tabela cheia. */}
          {soAtrasadas
            ? <CheckCircle aria-hidden="true" style={{ width: 28, height: 28, color: '#15803d', margin: '0 auto 12px' }} />
            : porFiltro
            ? <Search aria-hidden="true" style={{ width: 28, height: 28, color: '#746e69', margin: '0 auto 12px' }} />
            : tabId === "criar-aprovacoes" ? <CheckCircle aria-hidden="true" style={{ width: 28, height: 28, color: '#15803d', margin: '0 auto 12px' }} />
            : tabId === "finalizar-layouts" ? <Upload aria-hidden="true" style={{ width: 28, height: 28, color: '#15803d', margin: '0 auto 12px' }} />
            : <Eye aria-hidden="true" style={{ width: 28, height: 28, color: '#15803d', margin: '0 auto 12px' }} />}
          <p style={{ fontSize: 15, fontWeight: 700, color: '#1a1c1c', marginBottom: 6 }}>
            {soAtrasadas
              ? tabId === "finalizados"
                ? "Finalizados não tem atraso a mostrar"
                : "Nada atrasado nesta fase"
              : porFiltro
              ? "Nenhuma peça neste recorte"
              : tabId === "criar-aprovacoes" ? "Nenhuma peça aguardando envio"
              : tabId === "aguardando-patrocinador" ? "Nenhuma peça aguardando patrocinador"
              : tabId === "finalizar-layouts" ? "Nenhuma peça aguardando arquivo final"
              : "Nenhuma peça finalizada"}
          </p>
          <p style={{ fontSize: 13, color: '#746e69', lineHeight: 1.55, maxWidth: 460, margin: '0 auto' }} data-testid="empty-arte-motivo">
            {soAtrasadas
              ? tabId === "finalizados"
                ? "O marco desta fase é a própria saída do caminhão, que numa peça já pronta passou por definição — a lista está vazia pelo filtro, não porque falte trabalho."
                : `A lista está vazia pelo FILTRO "Prazo: atrasados"${outrosFiltros > 0 ? ` (e mais ${outrosFiltros} ${outrosFiltros === 1 ? 'filtro' : 'filtros'})` : ''} — as peças desta fase estão todas dentro do marco de ${marco}.`
              : porFiltro
              ? `${activeFilterCount} ${activeFilterCount === 1 ? 'filtro ativo' : 'filtros ativos'} estão escondendo o resto da fila`
              : tabId === "criar-aprovacoes" ? "Todo thumb desta fase já foi enviado"
              : tabId === "aguardando-patrocinador" ? "Nenhuma peça em aprovação pelo patrocinador"
              : tabId === "finalizar-layouts" ? "Nenhuma peça aprovada aguardando arquivo final"
              : "Nenhuma peça finalizada ainda"}
          </p>
          {/* O texto mandava limpar os filtros mas o botão só existia lá em cima,
              na linha de chips do cabeçalho fixo. */}
          {porFiltro && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
              {soAtrasadas && (
                <button
                  onClick={() => setAtrasadoFilter(false)}
                  data-testid="button-clear-atrasado-empty"
                  style={{ height: 36, padding: '0 16px', borderRadius: 8, border: 'none', background: '#1c1917', color: '#ffffff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
                >
                  Mostrar todos os prazos
                </button>
              )}
              <button
                onClick={clearAllFilters}
                data-testid="button-clear-filters-empty"
                style={{ height: 36, padding: '0 16px', borderRadius: 8, border: '1px solid #e7e5e4', background: '#ffffff', color: '#1c1917', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
              >
                Limpar {activeFilterCount === 1 ? 'o filtro' : `os ${activeFilterCount} filtros`}
              </button>
            </div>
          )}
          {/* E AGORA? (rodada 4). Fila zerada sem filtro respondia "nada
              aqui" e parava — a pessoa tinha de varrer as outras abas para
              descobrir se havia trabalho em outro lugar. O atalho leva à
              próxima fase COM peças em que a Arte age, na ordem do fluxo. */}
          {!porFiltro && (() => {
            const destino = tabs.find(t => t.id !== tabId && t.count > 0 && ['correcao', 'criar-aprovacoes', 'finalizar-layouts'].includes(t.id));
            if (!destino) return null;
            return (
              <button
                onClick={() => changeTab(destino.id)}
                data-testid="button-empty-proxima-fase"
                style={{ marginTop: 14, height: 36, padding: '0 16px', borderRadius: 8, border: 'none', background: '#1c1917', color: '#ffffff', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                Ir para {destino.label} ({destino.count})
                <ArrowRight aria-hidden="true" style={{ width: 14, height: 14 }} />
              </button>
            );
          })()}
        </div>
      );
    }

    // Resumo por evento: quantos itens desta aba cada evento tem, para saber
    // rapidamente onde estão sem precisar rolar a lista toda.
    const eventSummary: { id: string | null; name: string; count: number }[] = [];
    const evSumMap = new Map<string, { id: string | null; name: string; count: number }>();
    // Contadores de "o que falta" por evento — os dados já estavam aqui, só não
    // eram compostos. Aparecem na faixa do evento, onde o olho já está.
    const evProgresso = new Map<string, { semThumb: number; semFinal: number }>();
    items.forEach(item => {
      const name = item.event?.name || 'Sem Evento';
      const id = item.eventId || null;
      const key = id || name;
      const cur = evSumMap.get(key);
      if (cur) cur.count++;
      else { const rec = { id, name, count: 1 }; evSumMap.set(key, rec); eventSummary.push(rec); }
      const p = evProgresso.get(key) ?? { semThumb: 0, semFinal: 0 };
      if (!item.approvalThumbUrl) p.semThumb++;
      if (!item.finalFileUrl) p.semFinal++;
      evProgresso.set(key, p);
    });
    eventSummary.sort((a, b) => b.count - a.count);

    // Diagnóstico da fase — o que as abas NÃO dizem.
    //
    // PORQUÊ ESTA FAIXA EXISTE (e onde ela mora). Os cinco stat cards do
    // cabeçalho repetiam rótulo por rótulo e número por número as cinco abas
    // 40px abaixo, e cobravam ~140px de altura fixa por isso. O que faltava era
    // o oposto: dentro da fase escolhida, o que está ATRASADO contra o marco da
    // fase e o que é de evento urgente. Fica na área rolável, junto da tabela
    // que descreve, e não no cabeçalho fixo — assim custa zero de primeira
    // dobra quando não há nada a dizer.
    //
    // A regra de atraso é UMA (`isAtrasadaNaFase`), compartilhada com o filtro
    // "Prazo: atrasados" e com a coluna Prazo — a exceção de Finalizados mora
    // lá dentro, não em cada chamador.
    const atrasadas = items.filter(i => isAtrasadaNaFase(i, tabId, hoje)).length;
    const urgentes = items.filter(i => isUrgente(i.event?.priority)).length;
    // Paradas há mais de 7d: a contagem vem da camada SEM o próprio recorte
    // (paradasNaAba), para o número do chip ser o de linhas que o clique
    // entrega — ligado ou desligado.
    const paradas = tabId === activeTab ? paradasNaAba : items.filter(i => estaParada(i, hoje)).length;

    // QUEM ESTÁ TRAVANDO — só na fila que espera patrocinador. Um chip por
    // marca com aprovação pendente: nome, quantas peças e a espera mais antiga
    // (a idade na fase da peça mais parada que a espera — a aprovação não
    // traz carimbo próprio no payload, e a peça entrou na fase quando foi
    // enviada a todos). Clicar filtra por ele — o `sponsorFilter` já existe.
    const travando = tabId === "aguardando-patrocinador" ? (() => {
      const m = new Map<string, { id: string; nome: string; pecas: number; espera: number }>();
      for (const i of items) {
        for (const s of (i.sponsors ?? [])) {
          if (getApprovalMeta(s.approvalStatus)?.tone !== "waiting") continue;
          const e = m.get(s.id) ?? { id: s.id, nome: s.name, pecas: 0, espera: 0 };
          e.pecas += 1;
          e.espera = Math.max(e.espera, diasNaFase(i, hoje) ?? 0);
          m.set(s.id, e);
        }
      }
      return Array.from(m.values()).sort((a, b) => b.espera - a.espera || b.pecas - a.pecas);
    })() : [];

    // Só as primeiras linhas entram no DOM. Com quase mil peças numa aba, montar
    // a tabela inteira era o que travava a troca de aba e a digitação na busca.
    const shownItems = items.slice(0, visibleCount);

    // Um bloco por EVENTO (não mais por evento × tipo), com um <tbody> por grupo
    // do catálogo. Antes cada par (evento, tipo) montava uma <table> própria com
    // o cabeçalho de 9 colunas inteiro: um evento com 6 tipos reimprimia
    // "ID · QTD · PEÇA · …" seis vezes, e para leitor de tela cada uma era
    // anunciada como uma tabela nova.
    type Bloco = { key: string; chave: string; eventName: string; eventKey: string; eventObj: any; grupos: { nome: string; items: any[] }[] };
    const blocos: Bloco[] = [];
    shownItems.forEach(item => {
      // KIT (14/09): as peças de uma remessa do Kit formam bloco próprio —
      // o cabeçalho mostra as datas e os marcos do Kit, não os da Arena.
      const eventName = (item.event?.name || 'Sem Evento') + (item.kitRemessaId ? ' · KIT' : '');
      const eventKey = item.eventId || eventName;
      const chave = item.kitRemessaId ? `${eventKey}#kit-${item.kitRemessaId}` : eventKey;
      const grupoNome = groupOf(item.type) || '';
      let bloco = blocos[blocos.length - 1];
      if (!bloco || bloco.chave !== chave) {
        bloco = { key: `${chave}-${blocos.length}`, chave, eventName, eventKey, eventObj: item.event, grupos: [] };
        blocos.push(bloco);
      }
      let grupo = bloco.grupos[bloco.grupos.length - 1];
      if (!grupo || grupo.nome !== grupoNome) {
        grupo = { nome: grupoNome, items: [] };
        bloco.grupos.push(grupo);
      }
      grupo.items.push(item);
    });

    // `sep` desenha o mesmo filete de 1px que a célula de M² usa: sem ele no
    // cabeçalho, "M²" ficava alinhado à direita mas a fronteira entre as duas
    // colunas só existia meia tabela abaixo.
    const thStyle = (col: { right?: boolean; sep?: boolean }): React.CSSProperties => ({
      padding: '10px 12px', fontSize: 11, fontWeight: 700, color: '#57534e',
      textTransform: 'uppercase', letterSpacing: '0.06em',
      textAlign: col.right ? 'right' : 'left',
      borderLeft: col.sep ? '1px solid #f0efed' : undefined,
      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
    });

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* A FAIXA DE ATENÇÃO — terceira forma (dono, 09/09: "está péssimo").
            O que estava errado não era a cor: era a faixa dizer três coisas com
            três aparências diferentes e UM comportamento só no meio delas.
            "Paradas" era botão e filtrava; "passaram do marco" e "urgentes"
            eram texto morto — mesma pílula, mesmo peso, e o clique só
            funcionava num dos três. Pior: os dois mudos repetiam, com outro
            desenho, recortes que a barra "Mostrar" logo acima já oferece
            (Prazo: atrasados · Prioridade: urgentes).
            Agora os três são ATALHOS para os filtros que já existem, com a
            mesma anatomia — ponto de cor, número, rótulo curto — e o mesmo
            estado ligado/desligado. A cor saiu do fundo e virou só o ponto: o
            fundo colorido em três tons quentes fazia os três gritarem juntos,
            e o olho não tinha onde pousar primeiro. A ordem é a gravidade:
            passou do marco (o prazo já venceu) antes de parada (está devagar)
            antes de urgente (o evento é que corre). */}
        {(atrasadas > 0 || urgentes > 0 || paradas > 0) && (
          <div data-testid="faixa-diagnostico" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '7px 10px', borderRadius: 10, background: '#fafaf9', border: '1px solid #e7e5e4' }}>
            <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.09em', textTransform: 'uppercase', color: '#78716c', paddingLeft: 2, flexShrink: 0 }}>
              Atenção
            </span>
            {([
              atrasadas > 0 && {
                chave: 'atrasadas' as const,
                testid: 'chip-atrasadas',
                ponto: '#dc2626',
                n: tabId === activeTab ? atrasadasNaAba : atrasadas,
                rotulo: 'passaram do marco',
                ligado: atrasadoFilter,
                alternar: () => setAtrasadoFilter(!atrasadoFilter),
                titulo: atrasadoFilter
                  ? 'Mostrar de novo todas as peças desta fase'
                  : 'Ver só as peças que já passaram do marco desta fase',
              },
              paradas > 0 && {
                chave: 'paradas' as const,
                testid: 'chip-paradas',
                ponto: '#ea580c',
                n: paradas,
                rotulo: `sem andar há ${PARADA_HA_MAIS_DE}d+`,
                ligado: paradasFilter,
                alternar: () => setParadasFilter(v => !v),
                titulo: paradasFilter
                  ? 'Mostrar de novo todas as peças desta fase'
                  : `Ver só as peças paradas há mais de ${PARADA_HA_MAIS_DE} dias nesta fase`,
              },
              urgentes > 0 && {
                chave: 'urgentes' as const,
                testid: 'chip-urgentes',
                ponto: '#d97706',
                n: tabId === activeTab ? urgentesNaAba : urgentes,
                rotulo: 'de eventos urgentes',
                ligado: urgenteFilter,
                alternar: () => setUrgenteFilter(!urgenteFilter),
                titulo: urgenteFilter
                  ? 'Mostrar de novo as peças de todos os eventos'
                  : 'Ver só as peças de eventos urgentes',
              },
            ].filter(Boolean) as Array<{ chave: string; testid: string; ponto: string; n: number; rotulo: string; ligado: boolean; alternar: () => void; titulo: string }>)
              .map(({ chave, testid, ponto, n, rotulo, ligado, alternar, titulo }) => (
                <button
                  key={chave}
                  type="button"
                  onClick={alternar}
                  aria-pressed={ligado}
                  data-testid={testid}
                  title={titulo}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 7,
                    padding: '4px 11px', borderRadius: 999, cursor: 'pointer', font: 'inherit',
                    background: ligado ? '#1c1917' : '#ffffff',
                    border: `1px solid ${ligado ? '#1c1917' : '#e7e5e4'}`,
                    transition: 'background 0.12s, border-color 0.12s',
                  }}
                >
                  {/* O ponto carrega a gravidade. Ligado, ele vira branco: o
                      fundo escuro já é o sinal, e dois sinais competindo no
                      mesmo chip é o que deixava a faixa confusa. */}
                  <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 999, background: ligado ? '#ffffff' : ponto, flexShrink: 0 }} />
                  <span style={{ fontSize: 12.5, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: ligado ? '#ffffff' : '#1c1917' }}>{n}</span>
                  <span style={{ fontSize: 12, fontWeight: 500, color: ligado ? '#e7e5e4' : '#57534e' }}>{rotulo}</span>
                </button>
              ))}
          </div>
        )}

        {/* QUEM ESTÁ TRAVANDO, segunda forma (dono, 26/08: "design péssimo").
            A primeira versão despejava TODAS as marcas como chips iguais —
            40+ em produção, uma parede sem hierarquia. Três curas:
            · só as TRAVANDO_CHIPS_VISIBLE piores ficam à vista (a ordenação já
              é espera ↓, peças ↓); o resto atrás de "+ N outras";
            · o CHIP inteiro veste a cor da gravidade (a régua de tomDaIdade:
              ≥14d gargalo vermelho, 7–13d atenção âmbar, <7d rotina neutra) —
              antes só o "+Nd" mudava de cor e o olho não tinha onde pousar;
            · o cabeçalho resume a conta ("N marcas seguram M aprovações") —
              o tamanho do problema sem contar chip por chip. */}
        {travando.length > 0 && (() => {
          // O chip LIGADO nunca se esconde atrás do "+ N outras": é ele que
          // carrega o caminho de volta ("mostrar todas as peças de novo").
          const visiveis = showAllTravando ? travando : (() => {
            const corte = travando.slice(0, TRAVANDO_CHIPS_VISIBLE);
            const ligadoFora = sponsorFilter.length === 1 && !corte.some(t => t.id === sponsorFilter[0])
              ? travando.find(t => t.id === sponsorFilter[0])
              : undefined;
            return ligadoFora ? [...corte, ligadoFora] : corte;
          })();
          const ocultas = travando.length - visiveis.length;
          const pendencias = travando.reduce((s, t) => s + t.pecas, 0);
          // TERCEIRA forma (dono, 27/08: "urgentemente, está péssimo"): as
          // pílulas em fila tinham todas o mesmo peso — seis nomes brancos
          // idênticos não respondem "quem é o pior". Virou RANKING com barra:
          // a barra é proporcional ao nº de aprovações seguradas (o pior
          // salta aos olhos antes de qualquer leitura), a cor é a idade da
          // espera, e o clique continua filtrando.
          const pele = (espera: number, ligado: boolean) => {
            if (ligado) return { bg: '#1c1917', borda: '#1c1917', texto: '#ffffff', barra: '#fb923c', trilho: 'rgba(255,255,255,0.16)', sub: 'rgba(255,255,255,0.65)' };
            if (espera >= 14) return { bg: '#fef2f2', borda: '#fecaca', texto: '#991b1b', barra: '#dc2626', trilho: '#fee2e2', sub: '#b91c1c' };
            if (espera >= 7) return { bg: '#fffbeb', borda: '#fde68a', texto: '#92400e', barra: '#f59e0b', trilho: '#fef3c7', sub: '#b45309' };
            return { bg: '#ffffff', borda: '#e7e5e4', texto: '#44403c', barra: '#a8a29e', trilho: '#f0efed', sub: '#78716c' };
          };
          const teto = Math.max(1, ...travando.map(t => t.pecas));
          return (
            <div data-testid="faixa-travando" style={{ borderRadius: 12, background: '#ffffff', border: '1px solid #e7e5e4', overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', padding: '10px 14px', background: '#fafaf9', borderBottom: '1px solid #f0efed' }}>
                <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#57534e', whiteSpace: 'nowrap' }}>Quem está travando</span>
                <span data-testid="travando-resumo" style={{ fontSize: 12, color: '#78716c' }}>
                  {travando.length} {travando.length === 1 ? 'marca segura' : 'marcas seguram'} {pendencias} {pendencias === 1 ? 'aprovação' : 'aprovações'}
                  {travando[0].espera > 0 ? ` — a mais antiga espera há ${travando[0].espera}d` : ''}
                </span>
                <span style={{ flex: 1 }} />
                {(ocultas > 0 || showAllTravando) && (
                  <button
                    type="button"
                    onClick={() => setShowAllTravando(v => !v)}
                    data-testid="button-travando-todas"
                    style={{ border: 'none', background: 'transparent', padding: 0, color: '#c2410c', fontSize: 12, fontWeight: 700, cursor: 'pointer', font: 'inherit', whiteSpace: 'nowrap', textDecoration: 'underline', textUnderlineOffset: 3, textDecorationColor: '#fdba74' }}
                  >
                    {showAllTravando ? 'Mostrar menos' : `Ver as ${ocultas} outra${ocultas !== 1 ? 's' : ''}`}
                  </button>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(300px, 1fr))', columnGap: 18, padding: '4px 14px 8px' }}>
                {visiveis.map(t => {
                  const ligado = sponsorFilter.length === 1 && sponsorFilter[0] === t.id;
                  const p = pele(t.espera, ligado);
                  const rank = travando.findIndex(x => x.id === t.id) + 1;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setSponsorFilter(ligado ? [] : [t.id])}
                      aria-pressed={ligado}
                      data-testid={`chip-travando-${t.id}`}
                      title={ligado
                        ? 'Mostrar todas as peças de novo'
                        : `Ver só as ${t.pecas} ${t.pecas === 1 ? 'peça que espera' : 'peças que esperam'} ${t.nome}${t.espera > 0 ? ` — a mais antiga há ${t.espera}d` : ' — chegou hoje'}`}
                      style={{
                        display: 'block', width: '100%', textAlign: 'left', font: 'inherit', cursor: 'pointer',
                        padding: '8px 10px', margin: '4px 0', borderRadius: 9,
                        border: `1px solid ${ligado ? '#1c1917' : 'transparent'}`,
                        background: ligado ? '#1c1917' : 'transparent',
                        transition: 'background 0.1s',
                      }}
                      onMouseEnter={e => { if (!ligado) e.currentTarget.style.background = '#fafaf9'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = ligado ? '#1c1917' : 'transparent'; }}
                    >
                      <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 5 }}>
                        <span aria-hidden style={{ fontFamily: "'DM Mono', monospace", fontSize: 10.5, fontWeight: 700, color: ligado ? 'rgba(255,255,255,0.72)' : '#78716c', minWidth: 16 }}>{rank}º</span>
                        <span style={{ fontSize: 12.5, fontWeight: 700, color: ligado ? '#ffffff' : '#1c1917', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, flex: 1 }}>{t.nome}</span>
                        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12.5, fontWeight: 800, color: ligado ? '#ffffff' : p.texto, whiteSpace: 'nowrap' }}>{t.pecas}</span>
                        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 700, color: ligado ? 'rgba(255,255,255,0.8)' : p.sub, whiteSpace: 'nowrap', minWidth: 38, textAlign: 'right' }}>
                          {t.espera > 0 ? `+${t.espera}d` : 'hoje'}
                        </span>
                      </span>
                      {/* A barra: proporcional ao nº de aprovações que a marca
                          segura, na cor da idade da espera — o pior caso é o
                          maior E o mais vermelho, sem ler número nenhum. */}
                      <span aria-hidden style={{ display: 'block', height: 5, borderRadius: 999, background: p.trilho, overflow: 'hidden' }}>
                        <span style={{ display: 'block', height: '100%', width: `${Math.max(8, Math.round((t.pecas / teto) * 100))}%`, borderRadius: 999, background: p.barra }} />
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Recorte padrão da aba Finalizados — ver dentroDaJanelaFinalizados. */}
        {tabId === "finalizados" && (finalizadosForaDaJanela > 0 || finalizadosTudo) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '9px 14px', borderRadius: 10, background: '#fafaf9', border: '1px solid #e7e5e4' }}>
            <Clock style={{ width: 13, height: 13, color: '#57534e', flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: '#44403c' }}>
              {finalizadosTudo
                ? 'Mostrando todo o histórico de peças finalizadas.'
                : `Mostrando os últimos 90 dias por saída do caminhão — ${finalizadosForaDaJanela} peça(s) mais antiga(s) estão fora deste recorte.`}
            </span>
            <button
              onClick={() => setFinalizadosTudo(v => !v)}
              data-testid="button-finalizados-janela"
              // 30px era o menor alvo da faixa, e este botão troca o RECORTE
              // inteiro da aba — mostra ou esconde tudo o que passou de 90 dias.
              style={{ marginLeft: 'auto', height: isMobile ? 44 : 36, padding: '0 14px', borderRadius: 9, border: '1px solid #e7e5e4', background: '#ffffff', color: '#1c1917', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
            >
              {finalizadosTudo ? 'Voltar aos 90 dias' : 'Ver tudo'}
            </button>
          </div>
        )}

        {/* Resumo por evento — chips clicáveis para filtrar/pular */}
        {eventFilter.length === 0 && eventSummary.length > 1 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', padding: '12px 14px', backgroundColor: '#fafaf9', border: '1px solid #e7e5e4', borderRadius: 12 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#57534e', textTransform: 'uppercase', letterSpacing: '0.06em', marginRight: 2 }}>
              {eventSummary.length} eventos
            </span>
            {/* Só os maiores ficam à vista. Com os 19 eventos abertos, três
                linhas de chips idênticos disputavam a atenção e o olho não tinha
                onde pousar — "Rio S21K · 95" pesava o mesmo que um evento de uma
                peça só. Os pequenos continuam a um clique. */}
            {(() => {
              // O maior volume da lista inteira (não só dos chips visíveis):
              // abrir "mais N eventos" não pode recolorir os que já estavam à vista.
              const maiorVolume = eventSummary.reduce((mx, e) => Math.max(mx, e.count), 0);
              return (showAllEvents ? eventSummary : eventSummary.slice(0, EVENT_CHIPS_VISIBLE)).map(ev => {
                const c = corPorVolume(ev.count, maiorVolume);
                return (
                  <button
                    key={ev.id || ev.name}
                    onClick={() => { if (ev.id) setEventFilter([ev.id]); }}
                    title={ev.id ? `Filtrar por ${ev.name} — ${ev.count} ${ev.count === 1 ? 'peça' : 'peças'}` : ev.name}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: isMobile ? 36 : 28, padding: '0 6px 0 11px', borderRadius: 999, border: `1px solid ${c.border}`, backgroundColor: c.bg, color: c.text, fontSize: 12, fontWeight: 600, cursor: ev.id ? 'pointer' : 'default', whiteSpace: 'nowrap' }}
                  >
                    {ev.name}
                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 20, height: 18, padding: '0 6px', borderRadius: 999, backgroundColor: c.seloBg, color: c.seloText, fontSize: 11, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                      {ev.count}
                    </span>
                  </button>
                );
              });
            })()}
            {eventSummary.length > EVENT_CHIPS_VISIBLE && (
              <button
                onClick={() => setShowAllEvents(v => !v)}
                data-testid="button-toggle-events"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 11px', borderRadius: 999, border: '1px dashed #d6d3d1', background: 'none', color: '#57534e', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                {showAllEvents
                  ? 'Mostrar menos'
                  : `mais ${eventSummary.length - EVENT_CHIPS_VISIBLE} evento${eventSummary.length - EVENT_CHIPS_VISIBLE !== 1 ? 's' : ''}`}
                <ChevronDown style={{ width: 12, height: 12, transform: showAllEvents ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s' }} />
              </button>
            )}
          </div>
        )}

        {/* UM contêiner de rolagem horizontal para a aba inteira. Antes cada
            bloco tinha o próprio overflowX: rolar o primeiro não movia o
            segundo, e todo o alinhamento do colgroup se perdia na horizontal.
            (Sticky no <thead> continua fora: quem rolaria seria este contêiner,
            e position:sticky não atravessa o contexto de rolagem do pai — o
            cabeçalho por evento, e não mais por tipo, já resolve a repetição.) */}
        {/* SEM className="scrollbar-visible" aqui. Aquela utilitária declara
            `overflow: auto` (o atalho dos DOIS eixos, index.css), e o style
            inline só sobrescrevia overflow-x — sobrava um `overflow-y: auto`
            que ninguém pediu. Duas consequências, e a segunda é o corte que o
            dono viu: (1) no celular o `overflowX: 'visible'` era letra morta,
            porque com um dos eixos em `auto` o outro nunca fica `visible`;
            (2) contêiner de rolagem RECORTA, então a prévia do thumb — que
            abre para cima — era cortada pela borda superior deste bloco em
            toda linha do começo da tabela. A prévia virou position:fixed (ver
            ThumbPreview) e aqui ficou só o eixo que precisa rolar. */}
        <div style={{
          overflowX: isMobile ? 'visible' : 'auto',
          scrollbarWidth: 'thin', scrollbarColor: '#d6d3d1 #f5f5f4',
        }}>
          <div style={{ minWidth: isMobile ? undefined : minW, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {blocos.map(bloco => {
              const prazo = phaseDeadline(bloco.eventObj, tabId, hoje);
              const prog = evProgresso.get(bloco.eventKey);
              const evTotal = evSumMap.get(bloco.eventKey)?.count ?? 0;
              // Só o que FALTA. "1 sem thumb · 0 com thumb" gastava metade da
              // frase afirmando que zero peças estão prontas; e quando tudo já
              // está resolvido a frase virava "0 sem thumb · 5 com thumb", que
              // é ruído puro numa faixa de evento. Nada a fazer, nada escrito.
              const faltamArquivo = tabId === "finalizar-layouts" || tabId === "finalizados";
              const quantosFaltam = faltamArquivo ? (prog?.semFinal ?? 0) : (prog?.semThumb ?? 0);
              const faltando = quantosFaltam > 0
                ? `${quantosFaltam} de ${evTotal} ${faltamArquivo ? 'sem arquivo final' : 'sem thumb'}`
                : null;
              return (
                <div key={bloco.key} style={{ borderRadius: 12, overflow: 'hidden', backgroundColor: '#ffffff', border: '1px solid #e7e5e4' }}>
                  {/* ── Faixa do evento ──

                      CLARA. Ela já foi laranja, e o problema real daquela
                      versão era contraste: a data e a saída em branco 0,85
                      davam ~2,5:1. A resposta na época foi escurecer o fundo
                      até o branco passar — o que resolveu o contraste e criou
                      outro problema: uma barra quase preta acima de cada bloco
                      da lista, mais pesada que qualquer dado dentro dela.

                      Texto escuro sobre fundo claro resolve os dois de uma vez,
                      e devolve o destaque para os três chips de marco — que
                      eram exatamente o que a faixa escura estava sufocando. */}
                  <div style={{
                    padding: '12px 18px',
                    backgroundColor: '#fdfcfb',
                    borderBottom: '1px solid #f1efec',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                      {/* A ESTRELA LARANJA CHEIA SAIU, e a caixa alta do nome
                          também. Uma estrela preenchida na cor de atenção antes
                          de CADA bloco não distinguia evento nenhum — todos a
                          tinham —, e o nome em versalete gritava mais alto que o
                          prazo ao lado, que é o dado que decide a ordem. */}
                      <span title={bloco.eventName} style={{ color: '#1a1c1c', fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700, fontSize: 15, letterSpacing: '-0.02em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {bloco.eventName}
                      </span>
                      {/* Quanto daquele evento já está resolvido NESTA fase. */}
                      {faltando && (
                        <span style={{ fontSize: 11, fontWeight: 600, color: '#746e69', whiteSpace: 'nowrap' }}>
                          {faltando}
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 14, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      {!isMobile && bloco.eventObj?.startDate && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#57534e', fontSize: 11, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                          <Calendar style={{ width: 12, height: 12 }} />
                          {parseDateLocal(bloco.eventObj.startDate).toLocaleDateString('pt-BR')}
                        </span>
                      )}
                      {!isMobile && bloco.eventObj?.truckDepartureDate && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#57534e', fontSize: 11, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                          <Truck style={{ width: 12, height: 12 }} />
                          {/* Bloco do Kit: a data que manda é a entrega do material (15/09). */}
                          {bloco.eventObj.datasDoKit
                            ? <>Entrega do material: {new Date(bloco.eventObj.truckDepartureDate).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</>
                            : <>Saída: {toUTCDisplayDate(bloco.eventObj.truckDepartureDate).toLocaleDateString('pt-BR')} às {toUTCDisplayDate(bloco.eventObj.truckDepartureDate).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</>}
                        </span>
                      )}
                      {/* Chips de prazo: fundo sólido claro com texto escuro —
                          o dado mais urgente é o mais legível, e o atrasado
                          salta da faixa.

                          Os marcos saem de `phaseDeadline` (ARTE_MARCOS_FAIXA),
                          não de uma conta local: esta faixa repetia a aritmética
                          à mão e ficou de fora quando o marco da Finalização
                          entrou — o chip "Marco desta fase" simplesmente não
                          acendia em Finalizar arte, e as datas passariam a
                          divergir da coluna Prazo ao lado no ajuste de fim de
                          semana. Uma conta só, três chips. */}
                      {bloco.eventObj?.truckDepartureDate && ARTE_MARCOS_FAIXA.map(fase => {
                        const m = phaseDeadline(bloco.eventObj, fase, hoje);
                        if (!m) return null;
                        const ds = m.date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
                        const s = semaforoPrazo(m.diff);
                        const daFase = prazo?.label === m.label;
                        return (
                          <span key={fase} title={daFase ? 'Marco desta fase' : undefined}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, backgroundColor: s.bg, border: `1px solid ${daFase ? s.text : s.border}`, borderRadius: 999, padding: '3px 9px', fontSize: 11, fontWeight: 700, color: s.text, letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
                            {m.label} · {ds}{m.diff >= 0 && m.diff <= 14 && <span style={{ opacity: 0.72, fontWeight: 500 }}> ({m.diff}d)</span>}
                          </span>
                        );
                      })}
                      {/* "peças", não "ITENS": a tela inteira fala em peça, e o
                          contador era a única palavra em versalete da faixa. */}
                      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, color: '#57534e', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                        {evTotal} {evTotal === 1 ? 'peça' : 'peças'}
                      </span>
                    </div>
                  </div>

                  {isMobile ? (
                    <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {bloco.grupos.map((grupo, gi) => (
                        <Fragment key={gi}>
                          {grupo.nome && (
                            <div style={{ padding: '6px 2px 2px', borderBottom: '1px solid #f1efec' }}>
                              <span style={{ fontSize: 10, fontWeight: 800, color: '#746e69', textTransform: 'uppercase', letterSpacing: '0.12em' }}>{grupo.nome}</span>
                            </div>
                          )}
                          {grupo.items.map((item: any) => renderMobileCard(item, tabId, hoje))}
                        </Fragment>
                      ))}
                    </div>
                  ) : (
                    <table style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse', textAlign: 'left' }}>
                      <colgroup>
                        {comSelecao && <col style={{ width: ARTE_CHECKBOX_WIDTH }} />}
                        {cols.map((c, i) => <col key={i} style={{ width: c.w }} />)}
                      </colgroup>
                      <thead>
                        <tr style={{ backgroundColor: '#fafaf9', borderBottom: '1px solid #e7e5e4', boxShadow: '0 1px 0 #e7e5e4' }}>
                          {comSelecao && <th style={{ padding: '10px 12px' }}><span className="sr-only">Selecionar</span></th>}
                          {cols.map((col, ci) => <th key={ci} style={thStyle(col)}><span title={DICA_DA_COLUNA[col.label]} style={{ cursor: DICA_DA_COLUNA[col.label] ? 'help' : undefined }}>{col.label}</span></th>)}
                        </tr>
                      </thead>
                      {bloco.grupos.map((grupo, gi) => {
                        // Peças do grupo que podem entrar na seleção em lote.
                        const selecionaveis = tabId === "finalizados"
                          ? grupo.items
                          : grupo.items.filter((i: any) => i.status === 'awaiting_submission');
                        const marcadas = selecionaveis.filter((i: any) => selectedItemIds.has(i.id)).length;
                        // 3 de 5 marcadas devolvia o checkbox DESMARCADO, dizendo
                        // "nada selecionado aqui" num controle que alimenta ações
                        // em lote. O Radix suporta o estado indeterminado.
                        const estadoGrupo: boolean | "indeterminate" =
                          selecionaveis.length > 0 && marcadas === selecionaveis.length ? true
                          : marcadas > 0 ? "indeterminate" : false;
                        return (
                          <tbody key={gi}>
                            {/* O chip do grupo era suprimido no PRIMEIRO bloco de
                                cada evento (`!showEventHeader`), justamente o
                                maior: o usuário via o conjunto principal sem
                                saber a que grupo pertencia. Agora aparece sempre
                                que o grupo existir. */}
                            {grupo.nome && (
                              <tr>
                                {/* O AZUL SAIU. Era a única cor fria da tela,
                                    numa faixa cheia, para nomear um grupo — e
                                    disputava atenção com o dado das linhas logo
                                    abaixo. Um rótulo entre dois hairlines separa
                                    igual e não pinta nada. */}
                                <td colSpan={totalColunas} style={{ padding: '7px 12px', background: '#fdfcfb', borderTop: '1px solid #f1efec', borderBottom: '1px solid #f1efec' }}>
                                  <span style={{ display: 'inline-block', fontSize: 10, fontWeight: 800, color: '#746e69', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
                                    {grupo.nome}
                                  </span>
                                </td>
                              </tr>
                            )}
                            {/* Com UMA peça selecionável o controle de grupo não
                                se justifica: gastava uma linha inteira da
                                tabela para oferecer o mesmo que o checkbox da
                                própria linha, e ainda escrevia "Selecionar as 1
                                peças deste grupo". A partir de duas ele volta,
                                e aí o plural está sempre correto. */}
                            {comSelecao && selecionaveis.length > 1 && (
                              <tr>
                                <td style={{ padding: '4px 12px', borderBottom: '1px solid #f5f5f4' }}>
                                  <Checkbox
                                    checked={estadoGrupo}
                                    aria-label={`Selecionar as ${selecionaveis.length} peças de ${grupo.nome || bloco.eventName}`}
                                    onCheckedChange={() => {
                                      const s = new Set(selectedItemIds);
                                      if (marcadas === selecionaveis.length) selecionaveis.forEach((i: any) => s.delete(i.id));
                                      else selecionaveis.forEach((i: any) => s.add(i.id));
                                      setSelectedItemIds(s);
                                    }}
                                    data-testid={`checkbox-group-${bloco.key}-${gi}`}
                                  />
                                </td>
                                <td colSpan={totalColunas - 1} style={{ padding: '4px 12px', borderBottom: '1px solid #f5f5f4', fontSize: 11, color: '#57534e' }}>
                                  {marcadas > 0 ? `${marcadas} de ${selecionaveis.length} selecionadas` : `Selecionar as ${selecionaveis.length} peças deste grupo`}
                                </td>
                              </tr>
                            )}
                            {grupo.items.map((item: any) => renderRow(item, tabId, comSelecao, hoje))}
                          </tbody>
                        );
                      })}
                    </table>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {items.length > shownItems.length && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '8px 0 4px' }}>
            <button
              onClick={() => setVisibleCount(v => v + ARTE_PAGE_SIZE)}
              data-testid="button-load-more-arte"
              style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid #e7e5e4', backgroundColor: '#ffffff', fontSize: 12, fontWeight: 700, color: '#1c1917', cursor: 'pointer' }}
            >
              Carregar mais ({items.length - shownItems.length} restantes)
            </button>
            <span style={{ fontSize: 11, color: '#57534e' }}>
              Exibindo {shownItems.length} de {items.length} peças
            </span>
          </div>
        )}
      </div>
    );
  };

  /**
   * Estado de ERRO das listas.
   *
   * PORQUÊ ISTO EXISTE. Nenhuma das cinco queries lia `isError`: todas caíam
   * para [] em qualquer falha, e a renderização só distinguia `isLoading`. Com
   * /api/items em 500, a tela desenhava um ✓ verde de 48px e afirmava "Tudo
   * liberado!" — não é ausência de informação, é a afirmação do contrário, com
   * a cor e o ícone do sucesso. E não havia saída: o queryClient usa
   * retry:false, refetchOnWindowFocus:false e staleTime:Infinity, então o erro
   * é permanente até um F5 manual. Numa fila cujo prazo é a saída do caminhão,
   * acreditar que a fila zerou é a pior mentira possível.
   */
  /**
   * O erro de carga vira uma CAIXA.
   *
   * Era um bloco de texto centrado solto na página, sem contorno: parecia um
   * estado vazio, não uma falha — e a diferença entre "não há nada" e "não
   * consegui buscar" é a diferença entre seguir o dia e recarregar.
   *
   * Vale para as CINCO abas do Arte, que compartilham este render. O ícone
   * encolhe de 56 para 40 pela mesma régua dos vazios da tela.
   */
  const renderErroDeCarga = (titulo: string, erro: unknown, tentarDeNovo: () => void, testId: string) => (
    <div style={{ textAlign: 'center', padding: '32px 24px', margin: '24px auto', maxWidth: 460, background: '#ffffff', border: '1px solid #e7e5e4', borderRadius: 12 }} data-testid={testId}>
      <div style={{ width: 40, height: 40, borderRadius: 12, background: '#fffbeb', border: '1px solid #fde68a', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
        <WifiOff aria-hidden="true" style={{ width: 18, height: 18, color: '#b45309' }} />
      </div>
      <p style={{ fontSize: 15, fontWeight: 700, color: '#1a1c1c', margin: '0 0 6px', fontFamily: '"Space Grotesk", sans-serif' }}>{titulo}</p>
      <p style={{ fontSize: 13, color: '#746e69', lineHeight: 1.55, margin: '0 0 16px' }}>
        {erro instanceof Error && erro.message ? mensagemDeErro(erro) : 'Verifique sua conexão e tente novamente.'}
      </p>
      <button
        onClick={tentarDeNovo}
        data-testid={`${testId}-retry`}
        style={{ height: 36, padding: '0 16px', borderRadius: 9, background: '#1c1917', color: '#fff', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7 }}
      >
        <RefreshCw style={{ width: 14, height: 14 }} /> Tentar novamente
      </button>
    </div>
  );

  const renderCorrecaoTab = () => {
    if (correcaoLoading) {
      return (
        // Um spinner sozinho não diz o que está carregando — e esta aba demora
        // mais que as outras, porque a fila de correção é uma rota própria.
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '48px 0' }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', border: '3px solid #e7e5e4', borderTopColor: '#f97316', animation: 'spin 0.8s linear infinite' }} />
          <p style={{ margin: 0, fontSize: 13, color: '#57534e' }}>Carregando a fila de correção…</p>
        </div>
      );
    }
    // Falha da rota de correção também não pode virar "sem correção pendente".
    if (correcaoIsError) {
      return renderErroDeCarga(
        "Não foi possível carregar a fila de correção",
        correcaoError,
        () => { void refetchCorrecao(); },
        "erro-correcao",
      );
    }
    if (correcaoItems.length === 0) {
      return (
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <CheckCircle aria-hidden="true" style={{ width: 28, height: 28, color: '#15803d', margin: '0 auto 12px' }} />
          <p style={{ fontSize: 15, fontWeight: 700, color: '#1a1c1c', marginBottom: 6 }}>Sem correção pendente</p>
          <p style={{ fontSize: 13, color: '#57534e' }}>Nenhuma peça aguarda nova versão de arte</p>
        </div>
      );
    }

    // MESMO predicado das outras abas (correcaoFiltrados): esta lista só
    // conhecia evento, tipo, material, patrocinador e busca, então ligar
    // "Saída 10 dias" acendia o chip e devolvia a lista inteira — pior que não
    // ter o filtro, porque o chip afirmava que ele estava ativo.
    const baseItems = correcaoFiltrados;

    if (baseItems.length === 0) {
      return (
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <Search aria-hidden="true" style={{ width: 28, height: 28, color: '#746e69', margin: '0 auto 12px' }} />
          <p style={{ fontSize: 15, fontWeight: 700, color: '#1a1c1c', marginBottom: 6 }}>Nenhuma correção neste recorte</p>
          <p style={{ fontSize: 13, color: '#746e69', lineHeight: 1.55 }}>Há {correcaoItems.length} {correcaoItems.length === 1 ? 'peça aguardando correção' : 'peças aguardando correção'} fora dos filtros atuais</p>
          {activeFilterCount > 0 && (
            <button
              onClick={clearAllFilters}
              data-testid="button-clear-filters-correcao"
              style={{ marginTop: 14, height: 36, padding: '0 16px', borderRadius: 8, border: '1px solid #e7e5e4', background: '#ffffff', color: '#1c1917', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
            >
              Limpar {activeFilterCount === 1 ? 'o filtro' : `os ${activeFilterCount} filtros`}
            </button>
          )}
        </div>
      );
    }

    const correcaoSponsors: { id: string; name: string; color: string }[] = [];
    const seenSponsorIds = new Set<string>();
    baseItems.forEach((item: any) => {
      (item.awaitingArteApprovals || []).forEach((a: any) => {
        if (a.sponsor && !seenSponsorIds.has(a.sponsorId)) {
          seenSponsorIds.add(a.sponsorId);
          correcaoSponsors.push({ id: a.sponsorId, name: a.sponsor.name, color: a.sponsor.color });
        }
      });
    });

    const filteredCorrecaoItems = correcaoSponsorFilter === "all"
      ? baseItems
      : baseItems.filter((item: any) => (item.awaitingArteApprovals || []).some((a: any) => a.sponsorId === correcaoSponsorFilter));

    return (
      <div>
        {/* MODO CONSULTA — por que não há botão.

            Sem papel de edição o "Enviar nova arte" simplesmente não é
            renderizado (`podeEditar`), e a fila fica parecendo uma lista de
            problemas sem saída. A faixa diz que a ausência é permissão, não
            defeito. */}
        {!podeEditar && (
          <div style={{ border: '1px solid #e7e5e4', background: '#ffffff', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 12, color: '#57534e', lineHeight: 1.5 }}>
            <strong style={{ color: '#1c1917' }}>Modo consulta.</strong>{' '}
            Você acompanha a fila e abre as versões enviadas, mas não envia arte nova.
          </div>
        )}
        {/* Section header */}
        <div style={{ marginBottom: 20 }}>
          {/* O ÍCONE VIRA MARCADOR. Um triângulo de alerta de 20px no título
              de uma aba que INTEIRA é sobre peças recusadas não distingue nada
              — todo card abaixo dele é um alerta. O quadradinho dá a cor do
              estado sem gritar, e o total da fila sobe para a mesma linha. */}
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 10 }}>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: 9, fontFamily: '"Space Grotesk", sans-serif', fontSize: 17, fontWeight: 700, color: '#1c1917', letterSpacing: '-0.03em', margin: 0 }}>
              <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: '#ba1a1a', display: 'inline-block' }} />
              Aguardando correções
            </h2>
            <p style={{ margin: 0, fontSize: 12, color: '#57534e', fontVariantNumeric: 'tabular-nums' }}>
              {filteredCorrecaoItems.length} {filteredCorrecaoItems.length === 1 ? 'peça na fila' : 'peças na fila'}
            </p>
          </div>

          {/* Sponsor filter pills */}
          {correcaoSponsors.length > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#57534e', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Filtrar</span>
              {[{ id: "all", name: "Todos", color: "#746e69" }, ...correcaoSponsors].map(sp => {
                const isActive = correcaoSponsorFilter === sp.id;
                return (
                  <button
                    key={sp.id}
                    onClick={() => setCorrecaoSponsorFilter(sp.id)}
                    data-testid={`filter-correcao-sponsor-${sp.id}`}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      // 36 como todo controle da casa. E hairline no ativo: o
                      // 1,5px empurrava a pílula meio pixel e desalinhava a
                      // linha inteira quando uma delas era selecionada.
                      height: 36, padding: '0 13px', borderRadius: 999,
                      border: isActive ? '1px solid #ba1a1a' : '1px solid #e7e5e4',
                      backgroundColor: isActive ? '#fef2f2' : '#ffffff',
                      color: isActive ? '#ba1a1a' : '#746e69',
                      fontSize: 12, fontWeight: isActive ? 700 : 500,
                      cursor: 'pointer', transition: 'all 0.15s',
                    }}
                  >
                    {sp.id !== "all" && <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: sp.color, flexShrink: 0 }} />}
                    {sp.name}
                    {/* A contagem vive no controle: o recorte diz QUANTOS são
                        antes de ser clicado, como as abas e os dropdowns. */}
                    {/* #746e69 e não #a8a29e: é número que se lê (quantas
                        correções cada marca pediu), e #a8a29e não passa AA. */}
                    <span style={{ fontSize: 11, fontWeight: 700, color: isActive ? '#991b1b' : '#746e69', fontVariantNumeric: 'tabular-nums' }}>
                      {sp.id === 'all'
                        ? baseItems.length
                        : baseItems.filter((i: any) => (i.awaitingArteApprovals || []).some((a: any) => a.sponsorId === sp.id)).length}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Correction cards */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(460px, 1fr))', gap: 16 }}>
          {filteredCorrecaoItems.map((item: any) => {
            const approvalsToShow = correcaoSponsorFilter === "all"
              ? item.awaitingArteApprovals
              : item.awaitingArteApprovals.filter((a: any) => a.sponsorId === correcaoSponsorFilter);
            const isImage = item.approvalThumbUrl && (/\.(png|jpg|jpeg|gif|webp)/i.test(item.approvalThumbUrl) || item.approvalThumbUrl.startsWith('/objects/'));
            const groupLabel = groupOf(item.type);
            return (
              <div
                key={item.id}
                data-testid={`card-correcao-${item.id}`}
                style={{
                  backgroundColor: '#ffffff',
                  // Borda neutra e SEM sombra: a sombra era vermelha e dupla
                  // (16px difusos + um anel de 1px), e numa grade de cards
                  // todos vermelhos ela não distinguia nenhum deles.
                  border: '1px solid #e7e5e4',
                  borderRadius: 12,
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                {/* ── Cabeçalho: faixa branca com hairline ──

                    Era uma faixa quase preta com gradiente diagonal MAIS um
                    brilho radial vermelho por cima — dois gradientes empilhados
                    para hospedar quatro pedaços de texto. Todo o conteúdo vinha
                    em branco ou vermelho translúcido: `rgba(252,165,165,0.6)`
                    no grupo e `rgba(255,255,255,0.2)` no chevron, que é como se
                    apaga texto sem admitir que ele ficou ilegível. */}
                {/* O selo "RECUSADO" em versalete vermelho saiu do começo da
                    faixa: TODO card desta aba é uma recusa (o título da aba já
                    diz), então ele não distinguia um card do outro — só
                    empurrava o nome da peça para a direita. Quem recusou e o
                    motivo continuam no corpo, que é o que se vem ler. */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '12px 16px', borderBottom: '1px solid #f0eeeb', flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* QUEM ENCOLHE PRIMEIRO — a ordem estava invertida.

                        O GRUPO era o único com `flexShrink: 0`, ou seja, o único
                        protegido; o TIPO e a descrição encolhiam juntos. Numa
                        linha apertada o resultado era

                          "PLACAS DIVERSAS › P… — Cheque Premiação R…"

                        com o nome da peça reduzido a uma letra enquanto o rótulo
                        do grupo aparecia inteiro. O tipo é o que a pessoa
                        procura; o grupo é contexto e a descrição é detalhe.

                        A ordem vira peso de encolhimento: descrição cede
                        primeiro (999), grupo cede depois (1) e dentro de um
                        teto, tipo não cede (0). Todos mantêm o `title`. */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
                      {groupLabel && <span title={groupLabel} style={{ fontSize: 11, color: '#78716c', fontWeight: 600, flexShrink: 1, minWidth: 0, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{groupLabel}</span>}
                      {groupLabel && <span aria-hidden="true" style={{ fontSize: 11, color: '#d1ccc8', flexShrink: 0 }}>›</span>}
                      <span title={item.type} style={{ fontSize: 13, fontWeight: 700, color: '#1c1917', letterSpacing: '-0.02em', flexShrink: 0, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: '"Space Grotesk", sans-serif' }}>{item.type}</span>
                      {item.description && item.description !== item.type && (
                        <span title={item.description} style={{ fontSize: 12, color: '#57534e', flexShrink: 999, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>— {item.description}</span>
                      )}
                    </div>
                  </div>
                  <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, fontWeight: 800, color: '#57534e', background: '#faf9f7', border: '1px solid #e7e5e4', borderRadius: 5, padding: '3px 7px', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{item.displayId}</span>
                  <SeloKit peca={item} style={{ flexShrink: 0 }} />
                </div>

                {/* ── Contexto: de qual evento é a peça, e quando ela sai ──

                    O card dizia o que foi recusado e por quem, e não dizia de
                    qual evento é nem quando sai — que é justamente o que decide
                    a ORDEM do trabalho numa fila de correções. O prazo vem do
                    mesmo `phaseDeadline` da coluna Prazo e do filtro
                    "atrasados"; nada de conta nova. */}
                {(() => {
                  const pr = phaseDeadline(item.event, "correcao", hoje);
                  const saida = item.event?.truckDepartureDate ? toUTCDisplayDate(item.event.truckDepartureDate) : null;
                  const urgente = pr != null && pr.diff <= 3;
                  if (!item.event?.name && !saida && !pr) return null;
                  return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderBottom: '1px solid #f0eeeb', background: '#fcfbfa' }}>
                      {item.event?.name && (
                        <span title={item.event.name} style={{ fontSize: 11, fontWeight: 600, color: '#57534e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.event.name}</span>
                      )}
                      {item.event?.name && saida && <span aria-hidden="true" style={{ width: 1, height: 11, background: '#e7e5e4', flexShrink: 0 }} />}
                      {saida && (
                        <span style={{ fontSize: 11, fontWeight: 600, color: '#57534e', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                          {String(saida.getDate()).padStart(2, '0')}/{String(saida.getMonth() + 1).padStart(2, '0')}
                        </span>
                      )}
                      <span style={{ flex: 1 }} />
                      {pr && (
                        <span style={{
                          fontSize: 11, fontWeight: 700, flexShrink: 0, whiteSpace: 'nowrap',
                          fontVariantNumeric: 'tabular-nums',
                          color: urgente ? '#b45309' : '#78716c',
                          background: urgente ? '#fffbeb' : 'transparent',
                          border: urgente ? '1px solid #fde68a' : '1px solid transparent',
                          borderRadius: 999, padding: '2px 8px',
                        }}>
                          {pr.diff < 0
                            ? `${Math.abs(pr.diff)}d atrasado`
                            : pr.diff === 0 ? 'vence hoje' : `${pr.diff}d`}
                        </span>
                      )}
                    </div>
                  );
                })()}

                {/* ── Body ── */}
                {/* `flex: 1` no corpo (e nos blocos de motivo abaixo): sem ele,
                    cards de alturas diferentes na mesma linha da grade ficavam
                    com uma faixa branca antes do rodapé, e os rodapés não se
                    alinhavam. A sobra passa a ser absorvida pelo conteúdo. */}
                <div style={{ flex: 1, padding: '16px 18px', display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 12 : 14 }}>
                  {/* Thumb */}
                  <div style={{ width: isMobile ? '100%' : 80, height: isMobile ? 120 : 80, borderRadius: 8, backgroundColor: '#fef2f2', border: '1px solid #fecaca', flexShrink: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {isImage ? (
                      <img loading="lazy" decoding="async" src={miniatura(item.approvalThumbUrl)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : item.approvalThumbUrl ? (
                      <a href={item.approvalThumbUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, textDecoration: 'none', color: '#ba1a1a' }}>
                        <FileText style={{ width: 22, height: 22 }} />
                        <span style={{ fontSize: 11, fontWeight: 600 }}>PDF</span>
                      </a>
                    ) : (
                      <FileImage style={{ width: 22, height: 22, color: '#fca5a5' }} />
                    )}
                  </div>

                  {/* Rejection reasons */}
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {/* Peça devolvida SEM patrocinador identificado: veio pelo
                        antigo "Reprovar Ativo" (removido em 17/08), que baixava
                        a peça inteira sem marcar quem pediu a mudança. Sem este
                        bloco o cartão apareceria mudo — na fila de correção e
                        sem uma linha dizendo por quê.
                        Diz o que se sabe e para onde ir buscar o resto, em vez
                        de inventar um patrocinador para preencher a coluna. */}
                    {approvalsToShow.length === 0 && (
                      <div
                        data-testid={`correcao-sem-patrocinador-${item.id}`}
                        style={{ flex: 1, borderRadius: 12, border: '1px solid #f0dede', background: '#fff8f8', padding: '10px 12px' }}
                      >
                        {/* #991b1b sobre #fff1f1 = 8,1:1 ✓ · #7f1d1d = 10,3:1 ✓ */}
                        <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#991b1b' }}>
                          Reprovada por um patrocinador
                        </p>
                        <p style={{ margin: '3px 0 0', fontSize: 11, color: '#7f1d1d', lineHeight: 1.45 }}>
                          O registro desta devolução não guardou qual patrocinador pediu a mudança nem o motivo — ela veio pelo caminho antigo, que não perguntava. Quem devolveu e quando está no Histórico da peça.
                        </p>
                        <Link
                          href={`/historico?busca=${item.displayId?.replace('#','')}`}
                          style={{ display: 'inline-block', marginTop: 6, fontSize: 11, fontWeight: 700, color: '#991b1b', textDecoration: 'underline', textUnderlineOffset: 2 }}
                        >
                          Ver no Histórico →
                        </Link>
                      </div>
                    )}
                    {approvalsToShow.map((approval: any) => (
                      <div key={approval.id} style={{ flex: 1, borderRadius: 12, overflow: 'hidden', border: '1px solid #f0dede' }}>
                        {/* Sponsor bar */}
                        <div style={{ background: '#fff8f8', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 6, borderBottom: approval.rejectionReason ? '1px solid #f7e6e6' : 'none' }}>
                          {approval.sponsor?.color && <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: approval.sponsor.color, flexShrink: 0 }} />}
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#991b1b', flex: 1 }}>{approval.sponsor?.name || 'Patrocinador'}</span>
                          {/* Log: quem + quando */}
                          {(approval.rejectedBy || approval.rejectedAt) && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 3, minWidth: 0 }}>
                              {approval.rejectedBy && (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, minWidth: 0, fontSize: 11, fontWeight: 600, color: '#57534e', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={approval.rejectedBy}>
                                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
                                  {/* Nome INTEIRO. O `split(' ')[0]` cortava no
                                      primeiro nome — numa empresa com dois
                                      "Felipe" isso não identifica ninguém, e a
                                      reticência já resolvia o espaço. */}
                                  {approval.rejectedBy}
                                </span>
                              )}
                              {approval.rejectedBy && approval.rejectedAt && <span style={{ color: '#d1ccc8', fontSize: 11 }}>·</span>}
                              {approval.rejectedAt && (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 11, fontWeight: 600, color: '#57534e', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                                  <Clock style={{ width: 9, height: 9, flexShrink: 0 }} />
                                  {(() => { const d = new Date(approval.rejectedAt); return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; })()}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        {/* Reason */}
                        {approval.rejectionReason && (
                          <div style={{ background: '#ffffff', padding: '8px 12px' }}>
                            {/* Sem itálico: as aspas já marcam a citação, e
                                itálico em 12px pesa a leitura do texto que a
                                pessoa veio ler. */}
                            <p style={{ fontSize: 12, color: '#44403c', margin: 0, lineHeight: 1.5 }}>"<TextoComLinks texto={approval.rejectionReason} />"</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* ── Footer ── */}
                <div style={{ padding: '12px 18px', borderTop: '1px solid #f0eeeb', display: 'flex', alignItems: 'center', gap: 10, background: '#fcfbfa', flexWrap: 'wrap' }}>
                  {podeEditar && <button
                    onClick={() => {
                      setCorrecaoItem(item);
                      setCorrecaoThumbUrl("");
                      setCorrecaoFileName("");
                    }}
                    data-testid={`button-open-correcao-${item.id}`}
                    style={{
                      flex: 1, minWidth: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                      // Chapado, sem sombra e sem `transform` no clique: eram
                      // três efeitos (gradiente, sombra colorida, escala) num
                      // botão que se repete em cada card da grade.
                      // TINTA, não vermelho: é a mesma regra dos botões da linha
                      // ("Enviar", "Finalizar") e do CTA do próprio modal que
                      // este botão abre. Vermelho é a cor do PROBLEMA (a recusa);
                      // a ação que resolve não veste a cor do problema.
                      background: '#1c1917',
                      color: '#ffffff', border: 'none',
                      borderRadius: 8, minHeight: 44, height: 44, padding: '0 18px',
                      fontWeight: 700, fontSize: 13, cursor: 'pointer',
                      transition: 'background-color 0.15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#44403c'; }}
                    onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#1c1917'; }}
                  >
                    <Send style={{ width: 13, height: 13 }} />
                    Enviar nova arte
                  </button>}
                  {item.approvalThumbUrl && (
                    <a
                      href={item.approvalThumbUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        fontSize: 12, fontWeight: 700, color: '#44403c',
                        textDecoration: 'none', transition: 'color 0.15s',
                        padding: '0 14px', minHeight: 44, height: 44, borderRadius: 8,
                        border: '1px solid #e7e5e4', background: '#ffffff',
                        whiteSpace: 'nowrap',
                      }}
                      // O mouseleave devolvia OUTRA cor e OUTRA borda que as do
                      // estado inicial: depois do primeiro hover o botão ficava
                      // diferente dos vizinhos que ninguém tinha tocado.
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#c7c3be'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#e7e5e4'; }}
                    >
                      <Eye aria-hidden="true" style={{ width: 12, height: 12 }} />
                      Ver versão
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // (O antigo statCardTabMap saiu: cada stat card já carrega o próprio `tabId`,
  // e era exatamente a chave que faltava nele — "finalizar-layouts" — que
  // deixava a fase sem nenhuma porta de entrada.)

  return (
    /* ALTURA: era `height: 100%` + `overflow: hidden`, e mesmo medindo
       exatamente a altura da casca (610 = 610, sem exceder um pixel) o <main>
       continuava com scrollHeight de 10479 — ou seja, a casca rolava TAMBEM.
       Dois scrollers verticais sobre a mesma lista: o da casca e o do
       #painel-arte. Dava para rolar um sem o outro, e o resultado era a lista
       parada no meio de uma linha com a tela em branco embaixo — o "as vezes
       corta" do dono, que dependia de qual dos dois o mouse pegava.
       `position: absolute; inset: 0` prende a tela na casca em vez de pedir
       que ela caiba: medido depois, main.scrollHeight = clientHeight = 610 e
       so o painel rola. (Testei antes tirar o `sticky` do cabecalho, suspeito
       obvio: nao era — o scrollHeight nao se mexeu.) */
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* ── STICKY HEADER ─────────────────────────────────────────────────── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 40,
        background: '#ffffff',
        borderBottom: '1px solid #e7e5e4',
        flexShrink: 0,
      }}>
        <div style={{ padding: isMobile ? '12px 12px 0' : '20px 32px 0', maxWidth: 1600, margin: '0 auto' }}>

          {/* ── Identity + actions ── */}
          {/* NO CELULAR a identidade e as ações EMPILHAM. Lado a lado, o bloco
              de ações tinha `flexShrink: 0` com quatro botões numa linha só —
              em 390px ele passava da largura, e como a tela é `overflow:
              hidden` o excesso era CORTADO, não rolável: "Envio de thumbs em
              lote" e "PDF compartilhado" simplesmente não existiam. */}
          <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'flex-start', justifyContent: 'space-between', gap: isMobile ? 10 : 16, marginBottom: isMobile ? 12 : 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
              {/* LADRILHO CHAPADO, 40px.

                  Era um quadrado de 48 com gradiente laranja, anel de 1px e
                  uma sombra colorida de 24px — o objeto mais saturado da tela
                  inteira, para dizer o nome do módulo em que a pessoa acabou de
                  clicar. O laranja nesta tela é a cor de ATENÇÃO (o selo "em
                  andamento", o prazo, a aba ativa); gastá-lo na decoração do
                  cabeçalho enfraquece todos os outros usos. */}
              <div style={{ width: 40, height: 40, borderRadius: 11, backgroundColor: '#1c1917', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Palette aria-hidden="true" style={{ width: 19, height: 19, color: '#fb923c' }} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  {/* 26/700/-0.03em: a mesma escala da Gestão de Prazos e do
                      Atendimento. Em -0.05em as letras do título se tocavam. */}
                  <h1 style={{ fontSize: FS.h1, fontWeight: 700, color: '#1a1c1c', letterSpacing: '-0.03em', margin: 0, fontFamily: "'Space Grotesk', sans-serif", lineHeight: 1.1 }}>
                    Arte
                  </h1>
                  {(pendingCount + correcaoCount + needsFinalFileCount) > 0 ? (
                    // "em andamento" não dizia DE QUEM (rodada 4): a soma é das
                    // três fases em que a peça espera a Arte — o `title` conta.
                    <span
                      title="Soma de Aguardando envio, Correção e Finalizar arte — as fases em que a peça depende da Arte"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 999, backgroundColor: '#fff7ed', border: '1px solid #fed7aa', fontSize: 11, fontWeight: 700, color: '#c2410c' }}
                    >
                      <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#f97316', display: 'inline-block' }} />
                      {pendingCount + correcaoCount + needsFinalFileCount} esperando a Arte
                    </span>
                  ) : (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 999, backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', fontSize: 11, fontWeight: 700, color: '#15803d' }}>
                      Tudo em dia
                    </span>
                  )}
                </div>
                <p style={{ fontSize: 13, color: '#746e69', margin: 0, marginTop: 4, lineHeight: 1.5 }}>
                  {/* O fluxo em ordem, com verbo (rodada 4): a lista de
                      substantivos dizia os assuntos, não o trabalho. */}
                  Suba o thumb, envie para aprovação, corrija o que voltar e finalize o arquivo
                </p>
              </div>
            </div>
            {/* flexWrap: no mobile os botões quebram linha em vez de estourar a
                largura do header. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: isMobile ? 1 : 0, flexWrap: 'wrap', justifyContent: isMobile ? 'flex-start' : 'flex-end' }}>
              {/* O divisor vertical que abria esta fileira saiu: ele separava
                  os botões de NADA — à esquerda dele não havia controle. */}
              {/* COR NOS BOTÕES DO TOPO (dono, 17/09: "seria bom cor também").
                  Cada ação ganha um tom próprio — fundo 50, borda 200, texto e
                  ícone 700 (AA sobre o fundo claro) — para a pessoa achar a
                  ação pela cor sem ler a fileira inteira.
                  Exportar é LEITURA — continua disponível em modo consulta. */}
              <button
                onClick={handleClickExportButton}
                data-testid="button-export-pdf"
                style={{ display: 'flex', alignItems: 'center', gap: 6, height: isMobile ? 44 : 36, padding: '0 14px', borderRadius: 8, border: '1px solid #bfdbfe', background: '#eff6ff', color: '#1d4ed8', fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'border-color 0.12s', whiteSpace: 'nowrap' }}
              >
                <Printer style={{ width: 12, height: 12, color: '#1d4ed8' }} />
                {selectedItemIds.size > 0 ? `Exportar ${selectedItemIds.size} selecionadas` : 'Exportar PDF'}
              </button>
              {podeEditar && (
                <button
                  onClick={openBookModal}
                  data-testid="button-upload-book"
                  title="Subir o PDF do book (layout pronto) e escolher as peças"
                  style={{ display: 'flex', alignItems: 'center', gap: 6, height: isMobile ? 44 : 36, padding: '0 14px', borderRadius: 8, border: '1px solid #e9d5ff', background: '#faf5ff', color: '#6b21a8', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', transition: 'border-color 0.12s' }}
                >
                  <FileText aria-hidden="true" style={{ width: 12, height: 12, color: '#6b21a8' }} />
                  Subir book
                </button>
              )}
              {podeEditar && activeTab === "criar-aprovacoes" && (
                <label
                  data-testid="button-open-bulk-thumb"
                  style={{ height: isMobile ? 44 : 36, padding: '0 14px', borderRadius: 8, border: '1px solid #a5f3fc', background: '#ecfeff', color: '#0e7490', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', transition: 'border-color 0.12s' }}
                >
                  <FileImage aria-hidden="true" style={{ width: 12, height: 12, color: '#0e7490' }} />
                  Envio de thumbs em lote
                  {/* sr-only e não display:none — um input display:none não entra
                      na ordem de foco, e nem <label> nem <div> são focáveis por
                      si: o Tab pulava direto por cima desta ação. */}
                  <input type="file" accept="image/*" multiple className="sr-only" onChange={e => { if (e.target.files) handleBulkThumbFilesAdded(e.target.files); e.target.value = ''; }} />
                </label>
              )}
              {podeEditar && activeTab === "criar-aprovacoes" && (
                <button
                  onClick={() => setShowBulkDialog(true)}
                  disabled={selectedItemIds.size === 0}
                  data-testid="button-open-bulk-upload"
                  // Botão desabilitado sem dizer por quê deixa o usuário achando
                  // que está quebrado; o título explica a condição que o libera.
                  title={selectedItemIds.size > 0
                    ? `Usar UM PDF como thumb das ${selectedItemIds.size === 1 ? 'peça selecionada' : `${selectedItemIds.size} peças selecionadas`} e enviar para aprovação`
                    : 'Marque as peças na tabela (caixinhas à esquerda) para enviar todas com um mesmo PDF'}
                  // Laranja só quando há peças marcadas; bloqueado fica neutro,
                  // para a cor não prometer uma ação que ainda não dá para fazer.
                  style={{ display: 'flex', alignItems: 'center', gap: 6, height: isMobile ? 44 : 36, padding: '0 14px', borderRadius: 8, border: `1px solid ${selectedItemIds.size > 0 ? '#fed7aa' : '#e7e5e4'}`, background: selectedItemIds.size > 0 ? '#fff7ed' : '#ffffff', color: selectedItemIds.size > 0 ? '#c2410c' : '#78716c', fontSize: 13, fontWeight: 600, cursor: selectedItemIds.size > 0 ? 'pointer' : 'not-allowed', transition: 'border-color 0.12s', opacity: selectedItemIds.size > 0 ? 1 : 0.75, whiteSpace: 'nowrap' }}
                >
                  <Upload aria-hidden="true" style={{ width: 12, height: 12, color: selectedItemIds.size > 0 ? '#c2410c' : '#78716c' }} />
                  {selectedItemIds.size > 0 ? `PDF compartilhado (${selectedItemIds.size})` : 'PDF compartilhado'}
                </button>
              )}
            </div>
          </div>

          {/* ── Modo consulta ──
              O papel `atendimento` entra nesta rota (App.tsx) mas as sete rotas
              de escrita da Arte só aceitam `arte`/`admin`. Dizer isso de uma vez
              é melhor que deixar descobrir ação por ação — e o comportamento
              parcialmente permitido (salvar rascunho funciona, enviar devolve
              403) era o pior dos dois mundos. */}
          {!podeEditar && (
            <div data-testid="banner-modo-consulta" style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 14px', marginBottom: 14, borderRadius: 10, background: '#f5f5f4', border: '1px solid #e7e5e4' }}>
              <Lock style={{ width: 14, height: 14, color: '#57534e', flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: '#44403c' }}>
                <b style={{ fontWeight: 700 }}>Modo consulta.</b> Você vê a fila da Arte e pode exportar PDFs, mas enviar, corrigir, finalizar e pular a aprovação é da equipe de Arte.
              </span>
            </div>
          )}

          {/* ── Filter Row 1: search + dropdowns + period ── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            <div style={{ position: 'relative', flex: '1 1 180px', minWidth: 160 }}>
              <Search style={{ width: 14, height: 14, color: '#57534e', position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
              <input
                type="text"
                value={searchFilter}
                onChange={e => setSearchFilter(e.target.value)}
                placeholder="Buscar por ID, peça, descrição ou evento..."
                aria-label="Buscar por ID, peça, descrição ou evento"
                data-testid="input-search-filter"
                style={{ width: '100%', height: isMobile ? 44 : 36, paddingLeft: 30, paddingRight: 10, borderRadius: 8, border: searchFilter ? '1px solid #f97316' : '1px solid #e7e5e4', backgroundColor: '#ffffff', color: '#1c1917', fontSize: 13, boxSizing: 'border-box' }}
              />
            </div>

            {isMobile && (() => {
              // Conta o que está ESCONDIDO atrás do botão — a busca fica à vista.
              const n = activeChips.filter(c => c.kind !== 'search').length;
              return (
                <button
                  type="button"
                  onClick={() => setFiltrosAbertosMobile(v => !v)}
                  aria-expanded={filtrosAbertosMobile}
                  aria-controls="arte-filtros-mobile"
                  data-testid="button-toggle-filtros-mobile"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 44, padding: '0 14px', borderRadius: 8, border: `1px solid ${n > 0 ? '#fdba74' : '#e7e5e4'}`, background: n > 0 ? '#fff7ed' : '#ffffff', color: n > 0 ? '#9a3412' : '#44403c', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
                >
                  Filtros{n > 0 ? ` · ${n}` : ''}
                  <ChevronDown aria-hidden="true" style={{ width: 14, height: 14, transform: filtrosAbertosMobile ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s' }} />
                </button>
              );
            })()}

            {(!isMobile || filtrosAbertosMobile) && (<>
            <EventFilterDropdown
              values={eventFilter}
              onValuesChange={setEventFilter}
              options={eventFilterOptions}
            />

            <FilterSelect
              label="Patrocinador" allLabel="Todos os patrocinadores"
              values={sponsorFilter} onValuesChange={setSponsorFilter}
              options={sponsorFilterOptions}
              searchPlaceholder="Buscar patrocinador..." emptyText="Nenhum patrocinador encontrado."
              testId="select-sponsor-filter"
            />

            <FilterSelect
              label="Tipo de Peça" allLabel="Todos os tipos"
              values={typeFilter} onValuesChange={setTypeFilter}
              options={typeFilterOptions}
              searchPlaceholder="Buscar tipo..." emptyText="Nenhum tipo encontrado."
              testId="select-type-filter"
            />

            <FilterSelect
              label="Material" allLabel="Todos os materiais"
              values={materialFilter} onValuesChange={setMaterialFilter}
              options={materialFilterOptions}
              searchPlaceholder="Buscar material..." emptyText="Nenhum material encontrado."
              testId="select-material-filter"
            />

            {/* Mês da saída — `?mes=` era o único recorte da tela SEM controle:
                chegava por link, aparecia no chip "Mês: Agosto" e não tinha
                onde ser escolhido nem reescolhido. A Gráfica já oferece a mesma
                dimensão sobre a mesma data; tirá-la daqui quebraria a paridade
                entre as duas telas e apagaria em silêncio os links já
                compartilhados que carregam `?mes=`. */}
            <FilterSelect
              hideSearch hideWhenEmpty={false}
              label="Mês" allLabel="Todos os meses"
              values={monthFilter} onValuesChange={setMonthFilter}
              options={monthFilterOptions}
              emptyText="Nenhuma saída de caminhão nesta fila."
              unitLabel={{ one: "mês", many: "meses" }}
              panelWidth={210}
              testId="select-month-filter"
            />

            {/* Período — job 5 do vocabulário (components/filter-select.tsx).
                Eram cinco botões de uma dimensão só, mutuamente exclusivos,
                gastando a largura de três gatilhos ao lado dos menus que fazem
                a mesma pergunta. Como faixa não tinha contagem nenhuma; como
                gatilho, cada janela diz quantas peças entrega. Mesmo desenho do
                Período dos Registros. */}
            <FilterSelect
              hideSearch hideWhenEmpty={false} showAllLabelWhenEmpty
              label="Período" allLabel="Todos os períodos"
              icon={Calendar}
              value={periodFilter === "Todos" ? "all" : periodFilter}
              onChange={v => setPeriodFilter(v === "all" ? "Todos" : (v as PeriodFilter))}
              options={periodFilterOptions}
              panelWidth={190}
              testId="select-period-filter"
            />

            <ShortcutPill
              label="Saída 10 dias"
              icon={Truck}
              count={saida10Count}
              active={next10DaysFilter}
              onClick={() => setNext10DaysFilter(!next10DaysFilter)}
              testId="button-next-10-days-filter"
              title="Só peças de evento cujo caminhão sai nos próximos 10 dias"
            />
            </>)}
          </div>

          {/* ── Filter Row 2 ── */}
          {/* UM idioma para filtro, OUTRO para ordenação.
              A faixa falava QUATRO: chip ligado/desligado, segmentado de dois
              estados, segmentado de três estados e um <select> NATIVO — que
              abria o menu do Windows, com a fonte e o azul do sistema, no meio
              de uma faixa inteiramente desenhada pela casa. Quatro formas para
              duas funções, e a única diferença que importa (filtrar × ordenar)
              era a que não aparecia.
              Agora os quatro recortes são o mesmo gatilho do job 1 do
              vocabulário (components/filter-select.tsx) — o segmentado com
              rótulo à esquerda gastava a largura de três gatilhos para caber
              um, não tinha contagem por opção e não escalava quando a terceira
              opção aparecia. E a ordenação é o job 6: mesma peça, paleta
              GRAFITE, prefixo "Ordenar:" e sem × — quem bate o olho lê "os
              laranjas recortam, o cinza reordena" sem ler uma palavra. */}
          {(!isMobile || filtrosAbertosMobile) && (
          <div id="arte-filtros-mobile" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap', borderTop: '1px solid #f0efee', paddingTop: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#57534e', textTransform: 'uppercase', letterSpacing: '0.06em', marginRight: 2 }}>Mostrar:</span>

            {/* SEGMENTADOS, e nao menus: decisao do dono (17/08) depois de ver
                os quatro como FilterSelect. O resto do vocabulario continua
                valendo na tela — ORDENAR POR, a faixa de periodo e o seletor
                de fase do celular seguem padronizados; sao ESTES quatro que
                ficam segmentados, porque aqui a opcao visivel sem abrir menu
                vale mais que a uniformidade.
                Por isso nao ha contagem por opcao: um segmentado mostra os
                estados, nao quantas linhas cada um entrega. */}
            {/* Prazo — o recorte que o dono pediu. "Atrasada" é medida contra o
                marco da FASE (Entrega de Layouts −20 / Aprovação de Layout −12 /
                Finalização −10, os mesmos do funil da Gestão de Prazos),
                nunca contra a saída do caminhão: a saída é o prazo mais folgado
                do fluxo e por ela quase nada apareceria. Mesma `phaseDeadline`
                da coluna Prazo — o filtro entrega o conjunto dos selos "Nd
                atrasado" que já estão na tela. Ver lib/arte-rules.
                Em Finalizados o marco É a saída, que numa peça pronta já passou
                por definição: lá o recorte não existe em vez de mentir. */}
            <div role="group" aria-label="Prazo da fase" data-testid="segment-atrasado"
              style={{ display: 'flex', alignItems: 'center', gap: 2, height: isMobile ? 44 : 36, padding: '0 3px', borderRadius: 9, background: '#f5f5f4', border: '1px solid #e7e5e4', boxSizing: 'border-box', flexShrink: 0 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#57534e', padding: '0 6px 0 8px' }}>Prazo</span>
              {([
                { on: false, label: 'todos' },
                { on: true, label: 'atrasados' },
              ] as { on: boolean; label: string }[]).map(({ on, label }) => {
                const bloqueado = on && activeTab === "finalizados";
                const ativo = atrasadoFilter === on;
                return (
                  <button key={label} onClick={() => { if (!bloqueado) setAtrasadoFilter(on); }}
                    aria-pressed={ativo} disabled={bloqueado}
                    data-testid={`button-atrasado-${on ? 'sim' : 'nao'}`}
                    title={bloqueado
                      ? "Em Finalizados o marco é a própria saída do caminhão, que numa peça pronta já passou — não há atraso a apontar"
                      : on ? "Só peças que já passaram do marco desta fase" : undefined}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 5, alignSelf: 'stretch', margin: '3px 0', padding: '0 10px', borderRadius: 6, border: 'none', cursor: bloqueado ? 'not-allowed' : 'pointer', opacity: bloqueado ? 0.5 : 1, fontSize: 11, fontWeight: ativo ? 700 : 600, background: ativo ? '#ffffff' : '#fafaf9', color: ativo ? '#1c1917' : '#57534e', boxShadow: ativo ? 'inset 0 -2px 0 #1c1917' : 'none', transition: 'all 0.12s' }}>
                    {label}
                    {on && !bloqueado && (
                      // A contagem vive no controle: o recorte diz QUANTOS são
                      // antes de ser clicado, como as abas e os dropdowns fazem.
                      <span data-testid="badge-atrasadas-count"
                        // Contrastes (texto ≤13px exige 4,5:1):
                        // #991b1b sobre #fef2f2 = 7,60:1 ✓ · #57534e sobre
                        // #e7e5e4 = 6,00:1 ✓
                        style={{ padding: '0 6px', borderRadius: 999, fontSize: 11, fontWeight: 700, lineHeight: '16px', background: atrasadasNaAba > 0 ? '#fef2f2' : '#e7e5e4', color: atrasadasNaAba > 0 ? '#991b1b' : '#57534e' }}>
                        {atrasadasNaAba}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div role="group" aria-label="Prioridade" data-testid="segment-urgente"
              style={{ display: 'flex', alignItems: 'center', gap: 2, height: isMobile ? 44 : 36, padding: '0 3px', borderRadius: 9, background: '#f5f5f4', border: '1px solid #e7e5e4', boxSizing: 'border-box', flexShrink: 0 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#57534e', padding: '0 6px 0 8px' }}>Prioridade</span>
              {([
                { on: false, label: 'todas' },
                { on: true, label: 'urgentes' },
              ] as { on: boolean; label: string }[]).map(({ on, label }) => (
                <button key={label} onClick={() => setUrgenteFilter(on)} aria-pressed={urgenteFilter === on}
                  data-testid={`button-urgente-${on ? 'sim' : 'nao'}`}
                  style={{ alignSelf: 'stretch', margin: '3px 0', padding: '0 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: urgenteFilter === on ? 700 : 600, background: urgenteFilter === on ? '#ffffff' : '#fafaf9', color: urgenteFilter === on ? '#1c1917' : '#57534e', boxShadow: urgenteFilter === on ? 'inset 0 -2px 0 #1c1917' : 'none', transition: 'all 0.12s' }}>
                  {label}
                </button>
              ))}
            </div>

            {/* "Sem thumb" e "Com thumb" eram dois booleanos independentes:
                ligados juntos descartavam TUDO por construção e a lista ficava
                vazia com o texto genérico de "2 filtros ativos". */}
            {([
              { rotulo: 'Thumb', value: thumbFilter, set: setThumbFilter, testId: 'segment-thumb' },
              { rotulo: 'Arquivo final', value: finalFilter, set: setFinalFilter, testId: 'segment-final' },
            ] as { rotulo: string; value: TriState; set: (v: TriState) => void; testId: string }[]).map(({ rotulo, value, set, testId }) => (
              <div key={testId} role="group" aria-label={rotulo} data-testid={testId}
                style={{ display: 'flex', alignItems: 'center', gap: 2, height: isMobile ? 44 : 36, padding: '0 3px', borderRadius: 9, background: '#f5f5f4', border: '1px solid #e7e5e4', boxSizing: 'border-box', flexShrink: 0 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#57534e', padding: '0 6px 0 8px' }}>{rotulo}</span>
                {([
                  { v: 'todos', label: 'todos' },
                  { v: 'com', label: 'com' },
                  { v: 'sem', label: 'sem' },
                ] as { v: TriState; label: string }[]).map(({ v, label }) => (
                  <button key={v} onClick={() => set(v)} aria-pressed={value === v}
                    style={{ alignSelf: 'stretch', margin: '3px 0', padding: '0 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: value === v ? 700 : 600, background: value === v ? '#ffffff' : '#fafaf9', color: value === v ? '#1c1917' : '#57534e', boxShadow: value === v ? 'inset 0 -2px 0 #1c1917' : 'none', transition: 'all 0.12s' }}>
                    {label}
                  </button>
                ))}
              </div>
            ))}

            {/* Ordenação — a regra de negócio inteira é ancorada na saída do
                caminhão e a lista só sabia ordenar por nome de evento. */}
            {/* No celular a faixa já quebra em várias linhas: o divisor
                vertical ficaria sozinho no começo de uma delas, separando
                nada de nada. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: isMobile ? undefined : 'auto' }}>
              {!isMobile && <span aria-hidden="true" style={{ width: 1, height: 20, background: '#e7e5e4' }} />}
              <FilterSelect
                kind="sort" hideSearch hideWhenEmpty={false}
                label="Ordenar"
                value={sortMode}
                onChange={v => setSortMode(v as ArteSortMode)}
                options={ARTE_SORT_OPTIONS}
                panelWidth={190}
                dropdownAlign="right"
                testId="select-ordenar"
              />
            </div>
          </div>
          )}

          {/* ── Active chips ── */}
          {activeChips.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#57534e', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Ativos:</span>
              {activeChips.map(chip => (
                <span key={`${chip.kind}-${chip.id ?? ''}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 2, padding: '0 2px 0 9px', minHeight: 24, borderRadius: 999, background: '#fff7ed', border: '1px solid #fed7aa', fontSize: 11, fontWeight: 600, color: '#c2410c' }}>
                  {chip.label}
                  {/* O × era um ícone de 9px SEM área de toque: o alvo real
                      tinha 9×9px. 22px de caixa (dentro do chip de 24) passa
                      o mínimo de 24 do WCAG 2.5.8 somado à borda, sem engordar
                      a linha de chips. */}
                  <button onClick={() => removeChipFilter(chip)} aria-label={`Remover filtro ${chip.label}`} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#c2410c', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: 999, padding: 0 }}>
                    <X aria-hidden="true" style={{ width: 10, height: 10 }} />
                  </button>
                </span>
              ))}
              <button onClick={clearAllFilters} data-testid="button-clear-filters" style={{ fontSize: 11, fontWeight: 600, color: '#57534e', background: 'none', border: '1px solid #e7e5e4', borderRadius: 999, cursor: 'pointer', padding: '0 10px', minHeight: 24 }}>
                Limpar tudo
              </button>
              {/* A legenda solta "Contagens de toda a fila da Arte" morreu com
                  os stat cards. O aviso só importa quando há recorte ativo — e
                  aí ele mora aqui, na linha que mostra o recorte. */}
              <span style={{ fontSize: 11, color: '#57534e' }}>
                as contagens das abas seguem este recorte
              </span>
            </div>
          )}

          {/* ── Fases + seleção ── */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            {isMobile ? (
              // No celular as cinco abas somam ~900px e o contêiner raiz da tela
              // é overflow:hidden — o excesso era CLIPADO, não rolável, e três
              // fases (entre elas "Finalizar arte", que nem stat card tinha)
              // simplesmente deixavam de existir. Cinco abas com contador nunca
              // vão caber em 375px; um seletor cabe sempre e é alcançável por
              // teclado e leitor de tela sem truque nenhum.
              // `kind="field"` e não filtro: a fase não RECORTA a lista, ela
              // ESCOLHE qual lista está aberta — é o mesmo que as abas fazem no
              // desktop. Por isso não tem "Todos" (não existe "todas as fases"
              // nesta tela) nem × de limpar. A contagem saiu de dentro do
              // rótulo — "Aguardando envio (12)" era texto colado, que o leitor
              // de tela lia junto e que nenhum outro menu da casa escreve
              // assim — e virou a `count` da opção, como em todos os demais.
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, paddingBottom: 8 }}>
                {/* A contagem da fase ABERTA sobe para a legenda. Ela morava
                    dentro do rótulo da opção ("Aguardando envio (12)") e, com a
                    contagem virando `count` do menu, só apareceria com o menu
                    aberto — no celular esta é a única porta para as fases, e o
                    tamanho da fila aberta é o número que o operador olha antes
                    de qualquer outro. */}
                <span style={{ fontSize: 11, fontWeight: 700, color: '#57534e', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Fase · {faseAtualCount} {faseAtualCount === 1 ? 'peça' : 'peças'}
                </span>
                <FilterSelect
                  kind="field" hideSearch hideWhenEmpty={false} fullWidth
                  label="Fase"
                  value={activeTab}
                  onChange={changeTab}
                  options={faseFilterOptions}
                  testId="select-fase-mobile"
                />
              </div>
            ) : (
              <div
                ref={tablistRef}
                role="tablist"
                aria-label="Fases da Arte"
                // overflowX + scrollbarWidth: em telas estreitas de desktop a
                // barra rola em vez de ser cortada.
                onKeyDown={e => {
                  // Navegação por setas com roving tabindex — contrato ARIA de
                  // tablist que faltava por inteiro.
                  if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
                  e.preventDefault();
                  const i = tabs.findIndex(t => t.id === activeTab);
                  const prox = e.key === 'ArrowRight'
                    ? (i + 1) % tabs.length
                    : (i - 1 + tabs.length) % tabs.length;
                  changeTab(tabs[prox].id);
                  (tablistRef.current?.querySelectorAll('[role="tab"]')[prox] as HTMLElement | undefined)?.focus();
                }}
                style={{ display: 'flex', alignItems: 'flex-end', overflowX: 'auto', scrollbarWidth: 'none', maxWidth: '100%' }}
              >
                {tabs.map(tab => {
                  const isActive = activeTab === tab.id;
                  // Cor saturada só na borda e no selo; o texto usa o tom 700.
                  const { dot, text } = TAB_THEME[tab.id];
                  const TabIcon = tab.Icon;
                  return (
                    <button
                      key={tab.id}
                      id={`aba-${tab.id}`}
                      title={GUIA_DA_FASE[tab.id]}
                      role="tab"
                      aria-selected={isActive}
                      aria-controls="painel-arte"
                      tabIndex={isActive ? 0 : -1}
                      onClick={() => changeTab(tab.id)}
                      data-testid={tab.testId}
                      style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 16px', border: 'none', cursor: 'pointer', borderBottom: isActive ? `2px solid ${dot}` : '2px solid transparent', marginBottom: -1, background: 'transparent', color: isActive ? text : '#57534e', fontWeight: isActive ? 700 : 500, fontSize: 13, whiteSpace: 'nowrap', borderRadius: '6px 6px 0 0', transition: 'all 0.14s', flexShrink: 0 }}
                      onMouseEnter={e => { if (!isActive) e.currentTarget.style.color = '#1c1917'; }}
                      onMouseLeave={e => { if (!isActive) e.currentTarget.style.color = '#57534e'; }}
                    >
                      <TabIcon style={{ width: 13, height: 13, flexShrink: 0 }} />
                      {tab.label}
                      {/* PILULA CLARA, nao bloco solido.

                          O contador da aba ativa era o proprio `dot` chapado
                          com texto branco: um bloco saturado dentro de um botao
                          que ja e marcado pela regua de baixo — dois sinais para
                          o mesmo fato, e o mais forte deles no elemento menos
                          importante do par. */}
                      {tab.count > 0 && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 18, height: 18, borderRadius: 999, fontSize: 11, fontWeight: 700, padding: '0 5px', fontVariantNumeric: 'tabular-nums', backgroundColor: isActive ? '#fff7ed' : '#f5f5f4', border: isActive ? '1px solid #fed7aa' : '1px solid #e7e5e4', color: isActive ? '#c2410c' : '#57534e' }}>
                          {tab.count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              {/* A seleção sobrevivia a filtro e a aba, e o único jeito de zerar
                  5 peças marcadas em outra aba era selecionar as 300 da aba
                  atual e clicar de novo. Agora é um chip próprio, sempre
                  visível e sempre limpável em um clique — inclusive nas abas
                  onde não existe checkbox. */}
              {selectedItemIds.size > 0 && (
                <span
                  data-testid="chip-selecao"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: isMobile ? 44 : 36, padding: '0 6px 0 12px', borderRadius: 999, background: '#1c1917', color: '#ffffff', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}
                >
                  {selectedItemIds.size} {selectedItemIds.size === 1 ? 'selecionada' : 'selecionadas'}
                  <button
                    onClick={() => setSelectedItemIds(new Set())}
                    aria-label="Limpar seleção"
                    data-testid="button-clear-selection"
                    style={{ width: 24, height: 24, borderRadius: '50%', background: 'rgba(255,255,255,0.16)', border: 'none', cursor: 'pointer', color: '#ffffff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <X style={{ width: 11, height: 11 }} />
                  </button>
                </span>
              )}
              {podeEditar && (activeTab === "criar-aprovacoes" || activeTab === "finalizados") && filteredItems.length > 0 && (
                <button
                  onClick={() => {
                    if (selectedItemIds.size === filteredItems.length) setSelectedItemIds(new Set());
                    else setSelectedItemIds(new Set(filteredItems.map((i: any) => i.id)));
                  }}
                  data-testid="button-select-all"
                  style={{ display: 'flex', alignItems: 'center', gap: 6, height: isMobile ? 44 : 36, padding: '0 13px', borderRadius: 9, border: '1px solid #e7e5e4', background: '#ffffff', color: '#44403c', fontSize: 13, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
                >
                  {selectedItemIds.size === filteredItems.length
                    ? <><X style={{ width: 11, height: 11 }} /> Desmarcar tudo</>
                    : <><CheckSquare style={{ width: 11, height: 11 }} /> Selecionar tudo</>
                  }
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── 4. SCROLLABLE CONTENT AREA ────────────────────────────────────── */}
      <div
        ref={contentRef}
        id="painel-arte"
        role="tabpanel"
        aria-labelledby={isMobile ? undefined : `aba-${activeTab}`}
        style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '12px 12px' : '24px 32px', maxWidth: 1600, margin: '0 auto', width: '100%' }}
      >
      {/* Peça de evento finalizado — encerrado à mão OU já realizado — não entra
          nas abas (ver `allItems` acima). Sem este aviso a tela mentiria pelo
          silêncio: "Nenhuma peça aguardando envio" leria como "nada a fazer"
          para um designer cujo trabalho saiu de pauta. Fica visível com a lista
          cheia também — quem procura uma peça específica precisa saber por que
          sumiu. A frase (e a distinção entre os dois motivos) vem de
          `avisoPecasOcultas`, a mesma das outras filas. */}
      {/* O QUE SE FAZ NESTA FASE — ver GUIA_DA_FASE. Uma linha cinza, na
          área que rola: não rouba altura do cabeçalho fixo (a conta dos stat
          cards que saíram, acima) e some da vista assim que a pessoa desce
          para trabalhar. */}
      {!isLoading && !isError && GUIA_DA_FASE[activeTab] && (
        <p data-testid="guia-da-fase" style={{ margin: '0 0 14px', fontSize: 12.5, color: '#57534e', lineHeight: 1.5 }}>
          {GUIA_DA_FASE[activeTab]}
        </p>
      )}
      {!isLoading && !isError && avisoOcultas && (
        <div
          role="status"
          data-testid="aviso-eventos-encerrados"
          style={{ background: '#f5f5f4', border: '1px solid #e7e5e4', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#44403c', lineHeight: 1.5 }}
        >
          <strong>{avisoOcultas.destaque}</strong>{' '}{avisoOcultas.texto}
        </div>
      )}
      {isLoading ? (
        /* Silhueta em vez de spinner (UX 27/08) — mesma razão da Gráfica. */
        <EsqueletoDeFila linhas={8} />
      ) : isError ? (
        // Terceiro ramo ANTES do conteúdo: enquanto houver erro, o empty state
        // de sucesso nunca é renderizado.
        renderErroDeCarga(
          "Não foi possível carregar a fila da Arte",
          error,
          () => { void refetch(); },
          "erro-arte",
        )
      ) : (
        // FRONTEIRA DE RENDER da fila (ver SoQuandoMudar): o motivo digitado
        // nos modais, o arrastar de arquivo, os toasts e o progresso do lote
        // vivem neste mesmo componente. Sem ela cada tecla refazia as cem
        // linhas (Popover, Checkbox, chips, prazo) e o resumo por evento, que
        // varre a aba INTEIRA. `deps` = tudo o que as duas listas leem; os
        // handlers de fora dela só chamam setters, que são estáveis.
        <SoQuandoMudar
          deps={[
            activeTab, filteredItems, hoje, isMobile, podeEditar, sendingId, selectedItemIds,
            eventosComBook, groupMaps, visibleCount, activeFilterCount, atrasadoFilter,
            pendingCount, aguardandoCount, correcaoCount, needsFinalFileCount, finalizadosCount,
            paradasNaAba, atrasadasNaAba, urgentesNaAba, paradasFilter, urgenteFilter,
            showAllTravando, sponsorFilter, finalizadosForaDaJanela, finalizadosTudo,
            eventFilter, showAllEvents,
            correcaoLoading, correcaoIsError, correcaoError, correcaoItems, correcaoFiltrados,
            correcaoSponsorFilter,
          ]}
          render={() => (activeTab === "correcao"
            ? renderCorrecaoTab()
            : renderGroupedTable(filteredItems, activeTab))}
        />
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* MODAL 0 — DISPENSAR PEÇA                                           */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <Dialog open={!!dispenseItem} onOpenChange={(open) => { if (!open) { setDispenseItem(null); setDispenseReason(""); } }}>
        {/* HIDE_NATIVE_CLOSE: este modal tem X próprio; sem a classe ficavam dois. */}
        <DialogContent className={cn("p-0 gap-0", HIDE_NATIVE_CLOSE)} style={modalSurface(420)}>
          {/* POR QUE congelar aqui: o onSuccess da dispensa invalida /api/items
              e /api/items/approved, fecha, esvazia `dispenseReason` e toasta no
              mesmo commit — e tanto o cabeçalho quanto o campo de motivo vêm de
              `dispenseItem`/`dispenseReason`, que acabaram de ser zerados. Sem
              congelar o modal se apaga durante o fade. */}
          <FreezeWhileClosing open={!!dispenseItem}>
          <DialogTitle className="sr-only">Direto para finalização</DialogTitle>
          <DialogDescription className="sr-only">Mandar a peça direto para a finalização da arte, sem a aprovação do Atendimento</DialogDescription>
          {/* ModalHeader compartilhado: o X feito à mão aqui tinha 20px, abaixo
              do alvo mínimo de toque, num diálogo que libera peça para produção.
              A casca dá 34px, o mesmo tamanho dos outros modais da tela. */}
          {/* Tinta do ícone em âmbar, a mesma da tarja do corpo (dono, 09/09):
              o ladrilho vermelho contradizia o "não é bloqueio" do diálogo. */}
          <ModalHeader
            icon={FastForward}
            variant="confirm"
            tint={P.amber.text}
            title="Direto para finalização"
            subtitle="A peça pula a aprovação do Atendimento e vai para a finalização"
            onClose={() => { setDispenseItem(null); setDispenseReason(""); }}
          />
          {/* ALTURA: cabeçalho 81 + este corpo 246 (tarja vermelha 75, rótulo 15,
              textarea 72 e as margens) + rodapé 120 = 447px. Numa janela de 445
              sobram 397 depois do respiro de 24+24, então cortava 25px em cima e
              25 embaixo AO MESMO TEMPO — sumiam o título e o botão de dispensar
              juntos, e não havia rolagem alguma para alcançá-los.
              `flex: 1 1 auto` + `minHeight: 0` faz este corpo receber o que
              sobrar do teto do `modalSurface`, e só ele rola. */}
          <div style={{ padding: '18px 24px 24px', overflowY: 'auto', flex: '1 1 auto', minHeight: 0 }}>
            {dispenseItem && (
              // ÂMBAR, não vermelho (dono, 09/09): o vermelho de "proibido"
              // dizia que a peça ia ser barrada, quando ela vai ser IMPRESSA
              // na frente de todo mundo. Continua marcada — é irreversível e
              // pula duas conferências —, mas com a cor de atenção que o
              // diálogo vizinho (devolver ao solicitante) já usa.
              <div style={{ backgroundColor: P.amber.bg, border: `1px solid ${P.amber.border}`, borderRadius: R.md, padding: '12px 14px', marginBottom: 16, display: 'flex', gap: 10 }}>
                <FastForward style={{ width: 16, height: 16, color: P.amber.text, flexShrink: 0, marginTop: 2 }} />
                <div>
                  <p style={{ fontSize: 12, fontWeight: 700, color: '#78350f', margin: '0 0 2px' }}>{dispenseItem.displayId} — {dispenseItem.type}</p>
                  <p style={{ fontSize: 11, color: P.amber.text, margin: 0 }}>A peça vai direto para a <strong>finalização da arte</strong>, sem passar pela aprovação do Atendimento. Você ainda sobe o arquivo final, e a Revisão confere antes da Gráfica.</p>
                </div>
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
              <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#57534e' }}>Motivo (opcional)</label>
              <textarea
                value={dispenseReason}
                onChange={e => setDispenseReason(e.target.value)}
                placeholder="Ex: patrocinador já aprovou por fora; peça sem marca..."
                data-testid="textarea-dispense-reason"
                style={{ width: '100%', backgroundColor: '#fafaf9', border: '1px solid #e7e5e4', borderRadius: 8, padding: '10px 12px', fontSize: 12, resize: 'none', height: 72, fontFamily: 'inherit', color: '#1c1917', boxSizing: 'border-box' }}
              />
            </div>
          </div>
          {/* Rodapé da casca: Cancelar à esquerda, primário à direita — a mesma
              ordem dos outros quatro modais desta tela. */}
          <ModalFooter>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
              {/* Raio 9 não existe em `R` (6/8/12/16/999) — era valor sem fonte. */}
              {/* 40px, a altura dos dois botões do diálogo vizinho (devolver):
                  dois diálogos irmãos, uma régua de rodapé. */}
              <button onClick={() => { setDispenseItem(null); setDispenseReason(""); }} style={{ height: 40, padding: '0 16px', borderRadius: R.md, backgroundColor: '#ffffff', border: '1px solid #e7e5e4', color: '#57534e', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                Cancelar
              </button>
              <button
                onClick={() => dispenseItem && dispenseMutation.mutate({ itemId: dispenseItem.id, reason: dispenseReason })}
                disabled={dispenseMutation.isPending}
                data-testid="button-confirm-dispense"
                // CONTORNO, não vermelho cheio.
                //
                // O próprio subtítulo do modal diz "Ação irreversível": um botão
                // vermelho preenchido é o objeto mais chamativo do diálogo e
                // convida ao clique reflexo justamente onde não há volta. O
                // contorno mantém o vermelho como AVISO e obriga a ler antes.
                // Mesmo tratamento de "Reprovar" no Atendimento.
                style={{ height: 40, padding: '0 16px', borderRadius: R.md, backgroundColor: '#ffffff', border: `1.5px solid ${P.amber.text}`, color: P.amber.text, fontSize: 13, fontWeight: 700, cursor: dispenseMutation.isPending ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: dispenseMutation.isPending ? 0.7 : 1 }}
              >
                {dispenseMutation.isPending ? (
                  <>
                    {/* O SPINNER ERA BRANCO SOBRE BOTÃO BRANCO.

                        Ele nasceu junto com o botão vermelho CHEIO, onde branco
                        era a única cor legível. Quando o botão virou contorno —
                        para não convidar ao clique reflexo numa ação
                        irreversível — o fundo virou #ffffff e o spinner ficou
                        invisível, justamente durante a dispensa, que é quando a
                        pessoa precisa saber que o clique pegou. */}
                    <div style={{ width: 14, height: 14, borderRadius: R.pill, border: `2px solid ${P.amber.border}`, borderTopColor: P.amber.text, animation: 'spin 0.8s linear infinite' }} />
                    Liberando…
                  </>
                ) : (
                  <><FastForward style={{ width: 14, height: 14 }} />Mandar para finalização</>
                )}
              </button>
            </div>
          </ModalFooter>
          </FreezeWhileClosing>
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* MODAL — DEVOLVER AO SOLICITANTE                                     */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <Dialog open={!!devolverItem} onOpenChange={(open) => { if (!open) { setDevolverItem(null); setDevolverMotivo(""); } }}>
        <DialogContent className={cn("p-0 gap-0", HIDE_NATIVE_CLOSE)} style={modalSurface(440)}>
          {/* Congela pelo mesmo motivo da dispensa: o onSuccess zera
              `devolverItem` e `devolverMotivo` no mesmo commit em que fecha. */}
          <FreezeWhileClosing open={!!devolverItem}>
          <DialogTitle className="sr-only">Devolver peça ao solicitante</DialogTitle>
          <DialogDescription className="sr-only">A peça volta para rascunho com um motivo</DialogDescription>
          <ModalHeader
            icon={RotateCcw}
            variant="confirm"
            tint="#b45309"
            title="Devolver ao solicitante"
            subtitle="A peça volta para rascunho — quem a criou decide se continua ou descarta"
            onClose={() => { setDevolverItem(null); setDevolverMotivo(""); }}
          />
          <div style={{ padding: '18px 24px 24px', overflowY: 'auto', flex: '1 1 auto', minHeight: 0 }}>
            {/* `#fffbeb`, `#fde68a` e `#b45309` ERAM P.amber.bg, .border e .text
                copiados à mão — a mesma cor, sem o vínculo com a origem. Os tons
                800/900 do texto abaixo continuam literais porque a paleta guarda
                UM tom por família, e a hierarquia entre título e corpo da tarja
                precisa de dois. */}
            {devolverItem && (
              <div style={{ backgroundColor: P.amber.bg, border: `1px solid ${P.amber.border}`, borderRadius: R.md, padding: '12px 14px', marginBottom: 16, display: 'flex', gap: 10 }}>
                <RotateCcw style={{ width: 16, height: 16, color: P.amber.text, flexShrink: 0, marginTop: 2 }} />
                <div>
                  {/* #78350f sobre #fffbeb = 9,7:1 ✓ · #92400e = 6,5:1 ✓ */}
                  <p style={{ fontSize: 12, fontWeight: 700, color: '#78350f', margin: '0 0 2px' }}>{devolverItem.displayId} — {devolverItem.type}</p>
                  <p style={{ fontSize: 11, color: '#92400e', margin: 0 }}>
                    {DEPOIS_DA_ARTE.has(devolverItem.status)
                      ? `Atenção: esta peça está em "${getStatusLabel(devolverItem.status)}" — ela já saiu da mesa da Arte. Devolver tira a linha da fila de quem está com ela agora, e o que já foi produzido continua produzido. O thumb e o arquivo final ficam guardados.`
                      : "Ela sai da fila da Arte e reaparece como rascunho no evento. O thumb e o arquivo final que você já subiu ficam guardados."}
                  </p>
                </div>
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
              <label htmlFor="motivo-devolucao-arte" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#57534e' }}>
                Motivo <span style={{ color: P.red.text }}>*</span>
              </label>
              <textarea
                id="motivo-devolucao-arte"
                autoFocus
                value={devolverMotivo}
                onChange={e => setDevolverMotivo(e.target.value)}
                placeholder="Ex: a medida não fecha com o layout enviado — confirmar largura antes de refazer."
                data-testid="textarea-devolver-motivo"
                style={{ width: '100%', backgroundColor: '#fafaf9', border: `1px solid ${motivoCurto(devolverMotivo) ? '#e7e5e4' : '#16a34a'}`, borderRadius: R.md, padding: '10px 12px', fontSize: 12, resize: 'none', height: 84, fontFamily: 'inherit', color: '#1c1917', boxSizing: 'border-box' }}
              />
              {/* #b45309 sobre #fafaf9 = 4,79:1 ✓ nos 11px */}
              {motivoCurto(devolverMotivo) && (
                <p style={{ margin: 0, fontSize: 11, color: P.amber.text }}>
                  Faltam {Math.max(0, MOTIVO_MIN - devolverMotivo.trim().replace(/\s+/g, " ").length)} caracteres — sem motivo, quem recebe a peça de volta não sabe o que fazer com ela.
                </p>
              )}
            </div>
          </div>
          <ModalFooter>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
              {/* CANCELAR PRECISA PARECER BOTÃO.

                  Ele estava `transparent` + `border: none` ao lado de um
                  primário sólido: sem fundo e sem contorno, lia como legenda,
                  não como a saída do diálogo — e a saída é o caminho que a
                  pessoa procura quando abriu por engano. O contorno é o mesmo
                  do Cancelar da dispensa, para os dois diálogos vizinhos não
                  ensinarem duas gramáticas.

                  Os 40px ficam: são a altura dos dois botões deste rodapé, e
                  acima do mínimo da casa. */}
              <button onClick={() => { setDevolverItem(null); setDevolverMotivo(""); }} style={{ height: 40, padding: '0 16px', borderRadius: R.md, backgroundColor: '#ffffff', border: '1px solid #e7e5e4', color: '#57534e', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                Cancelar
              </button>
              <button
                onClick={() => devolverItem && devolverMutation.mutate({ itemId: devolverItem.id, motivo: devolverMotivo })}
                disabled={devolverMutation.isPending || motivoCurto(devolverMotivo)}
                title={motivoCurto(devolverMotivo) ? `Explique em pelo menos ${MOTIVO_MIN} caracteres.` : undefined}
                data-testid="button-confirm-devolver"
                // O RÓTULO DESABILITADO REPROVAVA AA: #78716c sobre #e7e5e4
                // mede 3,82:1, e 13px exige 4,5. E este é o estado em que o
                // botão passa a MAIOR PARTE do tempo — ele só libera depois do
                // motivo mínimo, então o texto ilegível era a leitura normal,
                // não a exceção. #57534e mede 6,08:1 e é o mesmo cinza que a
                // casca usa para desabilitado.
                style={{ height: 40, padding: '0 18px', borderRadius: R.md, backgroundColor: motivoCurto(devolverMotivo) ? '#e7e5e4' : P.amber.text, border: 'none', color: motivoCurto(devolverMotivo) ? '#57534e' : '#ffffff', fontSize: 13, fontWeight: 700, cursor: devolverMutation.isPending || motivoCurto(devolverMotivo) ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: devolverMutation.isPending ? 0.7 : 1 }}
              >
                {devolverMutation.isPending
                  ? <><div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', animation: 'spin 0.8s linear infinite' }} />Devolvendo…</>
                  : <><RotateCcw style={{ width: 14, height: 14 }} />Devolver ao solicitante</>}
              </button>
            </div>
          </ModalFooter>
          </FreezeWhileClosing>
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* MODAL 1 — CORREÇÃO: Enviar Nova Arte                               */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <Dialog open={!!correcaoItem} onOpenChange={(open) => { if (!open) fecharCorrecaoModal(); }}>
        {/* overflowY vence o overflow:hidden do modalSurface — este modal rola. */}
        <DialogContent
          // `max-h-[90vh]` saiu: o teto de altura mora no `modalSurface`
          // (100vh − 48, simétrico porque o Radix centra o Content). Dois tetos
          // no mesmo elemento é uma conta que ninguém revisa junto — e o daqui
          // era mais frouxo, então prometia 10vh de respiro que a casca já
          // tinha decidido que eram 48px.
          className={cn("p-0 gap-0", HIDE_NATIVE_CLOSE)}
          style={{ ...modalSurface(472), overflowY: 'auto' }}
          // Com uma nova arte JÁ ENVIADA ao storage, um clique no overlay
          // (o Radix fecha por padrão) descartava o arquivo sem perguntar.
          onInteractOutside={e => { if (correcaoThumbUrl) e.preventDefault(); }}
        >
          {/* POR QUE congelar aqui: o onSuccess do re-envio invalida duas
              chaves, fecha e apaga de uma vez `correcaoItem`, `correcaoThumbUrl`,
              `correcaoFileName` e a seleção de patrocinadores — que são
              exatamente a miniatura, o nome do arquivo e a lista de checkboxes
              que o modal está exibindo. Sem congelar, o modal fica vazio
              durante toda a animação de saída. */}
          <FreezeWhileClosing open={!!correcaoItem}>
          <DialogTitle className="sr-only">Enviar nova arte</DialogTitle>
          <DialogDescription className="sr-only">Reenvio de arte para patrocinadores</DialogDescription>

          {/* ── Cabeçalho claro ──

              Eram DOIS gradientes empilhados (um diagonal quase preto e um
              brilho radial vermelho por cima), com todo o texto em branco
              translúcido: 0,55 na linha da peça, 0,72 no evento. É como se
              apaga texto sem admitir que ele ficou ilegível — num modal cuja
              função é a pessoa LER o que o patrocinador recusou. */}
          {/* CASCA DA CASA (ModalHeader `confirm`), no lugar do cabeçalho feito
              à mão. Ele tinha um terceiro desenho de "fechar" (quadrado de 36
              com borda, posicionado por `absolute`), título em caixa de título
              ("Enviar Nova Arte") e um sobretítulo vermelho em versalete —
              "AÇÃO NECESSÁRIA" — que só repetia, gritando, o que o botão que
              abriu o modal já tinha dito. A peça e o evento continuam na linha
              de apoio, que é onde se confere "é a peça certa?". */}
          <ModalHeader
            variant="confirm"
            icon={RotateCcw}
            tint="#b91c1c"
            title="Enviar nova arte"
            subtitle={correcaoItem
              ? [
                  [correcaoItem.displayId, correcaoItem.type, correcaoItem.description !== correcaoItem.type ? correcaoItem.description : null].filter(Boolean).join(' · '),
                  correcaoItem.event?.name,
                ].filter(Boolean).join(' — ')
              : undefined}
            onClose={() => fecharCorrecaoModal()}
          />

          {/* ── Body ──
              `flexShrink: 0` nos três blocos: aqui quem rola é o PRÓPRIO
              DialogContent (`overflowY: 'auto'` inline, logo acima), e agora ele
              também é coluna flex por causa do `modalSurface`. Sem travar o
              encolhimento, uma janela baixa espremeria cabeçalho, corpo e rodapé
              em vez de rolar. */}
          <div style={{ padding: '20px 24px 0', flexShrink: 0 }}>
            {correcaoItem && (
              <>
                {/* Rejection cards */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
                  {correcaoItem.awaitingArteApprovals.map((approval: any) => (
                    <div key={approval.id} style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid #f0dede' }}>
                      {/* Sponsor bar */}
                      <div style={{ backgroundColor: '#fff8f8', padding: '7px 14px', display: 'flex', alignItems: 'center', gap: 7, borderBottom: '1px solid #f7e6e6' }}>
                        {approval.sponsor?.color && <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: approval.sponsor.color, flexShrink: 0 }} />}
                        {/* Nome em caixa normal e "recusou" como verbo: eram DUAS
                            peças em versalete vermelho na mesma faixa (a marca e
                            um selo "RECUSADO"), e o painel logo abaixo já diz
                            "reprovou" em caixa baixa — mesma notícia, duas vozes. */}
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#991b1b', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{approval.sponsor?.name || 'Patrocinador'}</span>
                        <span style={{ fontSize: 11, fontWeight: 600, color: '#991b1b', whiteSpace: 'nowrap' }}>recusou</span>
                      </div>
                      {/* Reason */}
                      {/* Corpo BRANCO e sem itálico: é o texto que a pessoa
                          abriu o modal para ler, e estava em vermelho escuro
                          inclinado sobre rosa. As aspas já marcam a citação. */}
                      <div style={{ backgroundColor: '#ffffff', padding: '10px 14px 8px' }}>
                        <p style={{ fontSize: 12, color: '#44403c', margin: 0, lineHeight: 1.55 }}>
                          {approval.rejectionReason ? <>"<TextoComLinks texto={approval.rejectionReason} />"</> : <span style={{ color: '#78716c' }}>Sem motivo informado.</span>}
                        </p>
                        {(approval.rejectedBy || approval.rejectedAt) && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 6 }}>
                            {approval.rejectedBy && (
                              // Sem o chip rosa em volta do nome: quem recusou
                              // não é um status, é um crédito de linha.
                              <span style={{ fontSize: 11, fontWeight: 600, color: '#57534e' }}>
                                {approval.rejectedBy}
                              </span>
                            )}
                            {approval.rejectedAt && (
                              <span style={{ fontSize: 11, color: '#57534e', fontVariantNumeric: 'tabular-nums' }}>
                                {new Date(approval.rejectedAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Upload zone */}
                <div style={{ marginBottom: 18 }}>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#57534e', marginBottom: 8 }}>
                    Nova versão
                  </label>
                  {correcaoThumbUrl ? (
                    /* Uploaded state — compact pill row */
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, backgroundColor: '#f0fdf4', border: '1px solid #86efac' }}>
                      {/* Ladrilho chapado: o gradiente verde era o ultimo desta
                          area, e num aviso de sucesso de 32px ele nao le como
                          gradiente — le como ruido. */}
                      <MiniaturaDaCorrecao key={correcaoThumbUrl} url={correcaoThumbUrl} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {/* "Arquivo enviado" lia como "já foi para o
                            patrocinador" (rodada 4) — e a pessoa fechava o
                            modal sem clicar no botão de baixo. Subiu para o
                            servidor; ninguém recebeu ainda. */}
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#15803d' }}>Nova versão carregada — falta enviar</div>
                        {correcaoFileName && (
                          <div style={{ fontSize: 11, color: '#15803d', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={correcaoFileName}>{correcaoFileName}</div>
                        )}
                      </div>
                      <button
                        onClick={() => { setCorrecaoThumbUrl(""); setCorrecaoFileName(""); }}
                        data-testid="button-remove-correcao-thumb"
                        style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#dcfce7', border: '1px solid #86efac', borderRadius: 8, color: '#166534', fontSize: 11, fontWeight: 600, height: 36, padding: '0 12px', cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap' }}
                      >
                        <X style={{ width: 11, height: 11 }} /> Trocar
                      </button>
                    </div>
                  ) : (
                    /* Empty state. A zona dizia "Arraste ou" mas nunca teve
                       handler de drag — só o link e o Ctrl+V funcionavam. */
                    <div style={{
                      height: 130, border: (isPasteUploading || isDragOverCorrecao) ? '1.5px dashed #ba1a1a' : '1.5px dashed #e2e0dd', borderRadius: 10,
                      backgroundColor: (isPasteUploading || isDragOverCorrecao) ? '#fff5f5' : '#fafaf9', display: 'flex', flexDirection: 'column',
                      alignItems: 'center', justifyContent: 'center', gap: 2, transition: 'all 0.15s', cursor: 'default'
                    }}
                      onMouseEnter={e => { if (!isPasteUploading && !isDragOverCorrecao) { (e.currentTarget as HTMLElement).style.backgroundColor = '#f5f5f4'; (e.currentTarget as HTMLElement).style.borderColor = '#c7c3be'; } }}
                      onMouseLeave={e => { if (!isPasteUploading && !isDragOverCorrecao) { (e.currentTarget as HTMLElement).style.backgroundColor = '#fafaf9'; (e.currentTarget as HTMLElement).style.borderColor = '#e2e0dd'; } }}
                      onDragOver={e => { e.preventDefault(); setIsDragOverCorrecao(true); }}
                      onDragEnter={e => { e.preventDefault(); setIsDragOverCorrecao(true); }}
                      // Só apaga o destaque quando o arrasto SAI da zona: o dragleave
                      // também dispara ao passar sobre o ícone e o texto de dentro,
                      // e a borda piscava enquanto a pessoa mirava o arquivo.
                      onDragLeave={e => { e.preventDefault(); if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setIsDragOverCorrecao(false); }}
                      onDrop={e => {
                        e.preventDefault();
                        setIsDragOverCorrecao(false);
                        if (isPasteUploading) return;
                        const file = e.dataTransfer.files[0];
                        if (!file) return;
                        const ok = file.type.startsWith('image/') || file.type === 'application/pdf';
                        if (!ok) {
                          toast({ title: "Arquivo inválido", description: "Aceito: PDF, PNG, SVG ou outras imagens", variant: "destructive" });
                          return;
                        }
                        setCorrecaoFileName(file.name);
                        uploadFileDirect(file, (localPath) => setCorrecaoThumbUrl(localPath));
                      }}
                    >
                      {/* Hairline no lugar da sombra: uma sombra difusa dentro
                          de uma caixa tracejada dá dois contornos concorrentes
                          para o mesmo objeto. */}
                      <div style={{ width: 40, height: 40, borderRadius: '50%', backgroundColor: '#fff', border: '1px solid #ebe8e3', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 6 }}>
                        {isPasteUploading
                          ? <div style={{ width: 18, height: 18, borderRadius: '50%', border: '2.5px solid #fecaca', borderTopColor: '#dc2626', animation: 'spin 0.8s linear infinite' }} />
                          : <Upload style={{ width: 18, height: 18, color: '#dc2626' }} />
                        }
                      </div>
                      <p style={{ fontSize: 12, fontWeight: 600, color: '#44403c', margin: 0 }}>
                        {isPasteUploading ? 'Enviando...' : 'Arraste ou'}
                      </p>
                      {!isPasteUploading && (
                        <FileUploader
                          onGetUploadParameters={getUploadUrl}
                          onFileSelect={(file) => { setCorrecaoFileName(file.name); }}
                          onComplete={(result) => { setCorrecaoThumbUrl(convertGCSUrlToLocalPath(result.url)); }}
                          accept="image/*,application/pdf"
                          data-testid="uploader-correcao-thumb"
                          buttonVariant="ghost"
                          buttonClassName="h-auto py-0 px-0 text-[12px] font-semibold underline decoration-2 underline-offset-2 text-red-700 hover:bg-transparent"
                        >
                          escolha um arquivo
                        </FileUploader>
                      )}
                      {/* O atalho que JÁ existe, desenhado como tecla: escrito no
                          meio da frase ele passava por texto de rodapé. */}
                      <p style={{ fontSize: 11, color: '#57534e', margin: '3px 0 0' }}>
                        {isPasteUploading ? 'Aguarde…' : <>PDF, PNG, SVG · ou cole com <kbd style={KBD}>Ctrl</kbd>+<kbd style={KBD}>V</kbd></>}
                      </p>
                      {!isPasteUploading && correcaoItem && (
                        <BotaoBuscarArte
                          variante="discreto"
                          testId="button-buscar-arte-correcao"
                          onClick={() => setBuscaDeArte({ itemId: correcaoItem.id, displayId: correcaoItem.displayId, destino: "thumb-correcao" })}
                        />
                      )}
                    </div>
                  )}
                </div>

                {/* ── PARA QUEM VAI O REENVIO — AUTOMÁTICO ──
                    Regra do dono: o reenvio vai SEMPRE para quem ainda não
                    aprovou — quem reprovou e quem está aguardando. Quem já
                    aprovou mantém a aprovação e não recebe de novo. Isto era
                    uma lista de caixas de seleção, e permitia um erro sem
                    volta: desmarcar quem reprovou publicava a arte corrigida
                    sem que a marca que a recusou voltasse a ver. Agora é
                    painel de LEITURA: a tela mostra a conta, e o servidor
                    (sponsor-approvals/resubmit) recusa qualquer outro conjunto. */}
                <div style={{ marginBottom: 20 }} data-testid="painel-reenvio">
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#57534e', marginBottom: 8 }}>
                    Para quem vai o reenvio — automático
                  </label>
                  {correcaoAprovacoes.length === 0 && (
                    <p style={{ fontSize: 12, color: '#57534e', margin: '0 0 4px', lineHeight: 1.45 }}>
                      Nenhum patrocinador reprovou individualmente — esta peça foi devolvida inteira.
                      O re-envio manda a arte nova para a aprovação de <strong>todos</strong> os patrocinadores dela.
                    </p>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {correcaoAprovacoes.map((a: any) => {
                      const est = getApprovalMeta(a.status);
                      const recebe = a.status !== 'approved';
                      const estadoTexto = est?.tone === 'approved' ? 'já aprovou' : est?.tone === 'waiting' ? 'aguardando' : 'reprovou';
                      return (
                        <div
                          key={a.sponsorId}
                          data-testid={`linha-reenvio-${a.sponsorId}`}
                          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: R.md, minHeight: 44, backgroundColor: recebe ? '#fafaf9' : '#ffffff', border: `1px solid ${recebe ? '#e7e5e4' : '#f0efee'}`, opacity: recebe ? 1 : 0.7 }}
                        >
                          {a.sponsor?.color && (
                            <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: a.sponsor.color, flexShrink: 0 }} />
                          )}
                          <span style={{ fontSize: 13, fontWeight: recebe ? 700 : 500, color: '#1c1917', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.sponsor?.name || 'Patrocinador'}</span>
                          <span style={{ fontSize: 11, fontWeight: 700, color: est?.text ?? '#57534e', background: est?.bg ?? '#f5f5f4', border: `1px solid ${est?.border ?? '#e7e5e4'}`, borderRadius: R.sm, padding: '2px 8px', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
                            {estadoTexto}
                          </span>
                          {/* #9a3412 sobre #fff7ed 6,1:1; #15803d sobre #f0fdf4 4,9:1. */}
                          <span style={{ fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', color: recebe ? '#9a3412' : '#15803d', background: recebe ? '#fff7ed' : '#f0fdf4', border: `1px solid ${recebe ? '#fed7aa' : '#bbf7d0'}`, borderRadius: R.sm, padding: '2px 8px' }}>
                            {recebe ? 'vai receber' : 'mantém aprovação'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  {correcaoAprovacoes.length > 0 && (
                    <p data-testid="text-reenvio-total" style={{ margin: '10px 0 0', fontSize: 12, fontWeight: 700, color: '#44403c' }}>
                      Vai para {correcaoDestinatarios.length} de {correcaoAprovacoes.length} {correcaoAprovacoes.length === 1 ? 'patrocinador' : 'patrocinadores'}
                    </p>
                  )}
                </div>
              </>
            )}
          </div>

          {/* ── Footer ── */}
          {(() => {
          /**
           * DUAS DEVOLUÇÕES DIFERENTES, DOIS CAMINHOS DE VOLTA.
           *
           * A peça chega à Correção de dois jeitos, e eles não têm o mesmo
           * gesto de saída:
           *
           * 1. UM PATROCINADOR reprovou a linha dele. A peça segue em
           *    `awaiting_sponsor_approval` e o re-envio é por patrocinador —
           *    escolhe-se quem revê. Rota: sponsor-approvals/resubmit.
           *
           * 2. A PEÇA INTEIRA voltou (status `awaiting_submission`). Aquela
           *    rota recusa este status com 409, então o caminho é
           *    submit-for-approval, que o aceita, devolve as aprovações
           *    reprovadas para `pending` e reabre a peça para todos os
           *    patrocinadores dela.
           *
           * O botão exigia patrocinador selecionado nos DOIS casos. No caso 2
           * podia não haver nenhum para selecionar — e aí ele nascia
           * desabilitado e nunca saía disso: subia-se a arte nova e o modal
           * virava um beco sem saída. Eram 3 peças em produção nesse estado.
           */
          // SEM PEÇA, SEM RODAPÉ — e esta guarda não é defensiva por gosto.
          // O corpo do modal já vive dentro de `{correcaoItem && (...)}`, mas
          // este rodapé ficou FORA dela, e o FreezeWhileClosing mantém a
          // subárvore renderizada mesmo com o modal fechado. Resultado: com
          // `correcaoItem` nulo — que é o estado normal ao abrir a tela — ler
          // `.status` derrubava a Arte INTEIRA no boundary de render, não só o
          // modal. Devolver null aqui é o mesmo que o corpo já faz.
          if (!correcaoItem) return null;
          const devolvidaInteira = correcaoItem.status === "awaiting_submission";
          const enviando = resubmitMutation.isPending || reenvioInteiroMutation.isPending;
          // O painel de destinatários é LEITURA e pode estar velho (a fila é
          // cache; vínculos mudam em outra tela). Quem decide se há alguém
          // para receber é o SERVIDOR — se não houver, ele responde 409 com a
          // frase certa ("todos já aprovaram") e o toast a mostra. Travar o
          // botão pelo cálculo local deixava a peça sem saída justamente
          // quando o dado local estava errado.
          const travado = !correcaoThumbUrl || enviando;
          return (
          <div style={{ padding: '16px 24px 24px', borderTop: '1px solid #f0eeec', flexShrink: 0 }}>
            <button
              disabled={travado}
              onClick={() => {
                if (!correcaoItem) return;
                if (devolvidaInteira) {
                  reenvioInteiroMutation.mutate({ itemId: correcaoItem.id, approvalThumbUrl: correcaoThumbUrl });
                  return;
                }
                resubmitMutation.mutate({ itemId: correcaoItem.id, newThumbUrl: correcaoThumbUrl });
              }}
              data-testid="button-submit-correcao"
              style={{
                width: '100%', height: 48, borderRadius: 10, border: 'none',
                // Vermelho é a cor do problema (a recusa), não da solução.
                // TINTA, e não o laranja #ea580c de antes: branco sobre #ea580c
                // mede 3,6:1 e reprovava AA em 15px; e os outros primários da
                // tela (Enviar, Finalizar, Enviar para aprovação) já são tinta.
                // Desabilitado em cinza padrão, legível.
                background: travado ? '#e7e5e4' : '#1c1917',
                color: travado ? '#57534e' : '#ffffff',
                fontWeight: 700, fontSize: 15,
                fontFamily: '"Space Grotesk", sans-serif', letterSpacing: '-0.02em',
                cursor: travado ? 'not-allowed' : 'pointer',
                transition: 'background-color 0.15s',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
              }}
              onMouseEnter={e => { if (!travado) e.currentTarget.style.backgroundColor = '#44403c'; }}
              onMouseLeave={e => { if (!travado) e.currentTarget.style.backgroundColor = '#1c1917'; }}
            >
              {/* O rótulo diz a QUEM vai: "Confirmar Re-envio" não dizia o quê
                  nem para quem, e a conta já está feita no painel acima. */}
              {enviando ? (
                <><div style={{ width: 15, height: 15, borderRadius: '50%', border: '2px solid #d6d3d1', borderTopColor: '#57534e', animation: 'spin 0.8s linear infinite' }} />Enviando…</>
              ) : (
                <><Send aria-hidden="true" style={{ width: 15, height: 15 }} />{devolvidaInteira
                  ? 'Enviar nova arte a todos os patrocinadores'
                  : correcaoDestinatarios.length === 0
                  ? 'Enviar nova arte'
                  : `Enviar nova arte a ${correcaoDestinatarios.length} ${correcaoDestinatarios.length === 1 ? 'patrocinador' : 'patrocinadores'}`}</>
              )}
            </button>
            {/* O BOTÃO TRAVADO PASSA A DIZER O QUE FALTA.

                Ele ficava cinza e mudo, e as duas razões possíveis estão em
                lugares diferentes da tela — a zona de upload em cima e a lista
                de patrocinadores embaixo. Quem não vê a que falta fica
                clicando num botão que não responde. */}
            {travado && !enviando && (
              <p style={{ margin: '8px 0 0', fontSize: 11, color: '#78716c', textAlign: 'center' }}>
                {!correcaoThumbUrl ? 'Suba a nova versão para liberar o envio.' : 'Nenhum patrocinador pendente para receber o reenvio — todos já aprovaram.'}
              </p>
            )}
          </div>
          );
          })()}
          </FreezeWhileClosing>
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* MODAL 2 — ITEM DETAILS DIALOG                                      */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <ItemDetailsDialog
        item={selectedItem}
        auditLogs={selectedItem ? auditLogs.filter((log: any) => log.entityType === 'item' && log.entityId === selectedItem.id) : []}
        open={!!selectedItem}
        onOpenChange={(open) => !open && setSelectedItemId(null)}
        topActions={selectedItem && podeEditar && (['sponsor_approved', 'awaiting_creator_review'].includes(selectedItem.status) || (selectedItem.finalFileUrl && FINALIZADOS_STATUSES.includes(selectedItem.status))) ? (
          <section style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Section header */}
            {/* Título em caixa normal e o selo virou texto de apoio. O selo
                dizia "CORREÇÃO" na substituição do arquivo final — a mesma
                palavra da aba Correção, que é OUTRA coisa (arte recusada pelo
                patrocinador). Quem lia achava que a peça tinha voltado. */}
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <h3 style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700, fontSize: 18, letterSpacing: '-0.02em', color: '#1c1917', margin: 0 }}>
                {['sponsor_approved', 'awaiting_creator_review'].includes(selectedItem.status) ? 'Finalização de layout' : 'Substituir arquivo final'}
              </h3>
              <span style={{ fontSize: 12, color: '#746e69', fontWeight: 600 }}>
                {['sponsor_approved', 'awaiting_creator_review'].includes(selectedItem.status) ? 'arte aprovada — falta o arquivo final' : 'a peça já tem arquivo final'}
              </span>
            </div>

            {/* Superfície branca com hairline, sem o "vidro" verde com blur e
                borda de 2px: verde nesta tela é o ESTADO aprovado, e o bloco
                inteiro vestido dele competia com o botão de enviar. */}
            <div style={{
              background: '#ffffff',
              border: '1px solid #e7e5e4', borderRadius: 12, padding: isMobile ? 16 : 20,
              display: 'flex', flexDirection: 'column', gap: 16
            }}>
              {/* Thumb aprovado preview */}
              {selectedItem.approvalThumbUrl && (() => {
                const url = selectedItem.approvalThumbUrl.toLowerCase();
                const isImage = /\.(png|jpg|jpeg|gif|webp)$/i.test(url) || selectedItem.approvalThumbUrl.startsWith('/objects/');
                const isPdf = !isImage;
                return (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, background: '#fafaf9', borderRadius: 8, border: '1px solid #f0efee', flexWrap: 'wrap' }}>
                    <div style={{ width: 40, height: 40, borderRadius: 6, backgroundColor: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {isPdf
                        ? <FileText style={{ width: 20, height: 20, color: '#ef4444' }} />
                        : <img loading="lazy" decoding="async" src={selectedItem.approvalThumbUrl} alt="Thumb" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 6 }} />
                      }
                    </div>
                    <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                      {/* "Thumb aprovado" é o que o bloco É; o nome do arquivo
                          (um hash, em versalete) vai para o `title`. */}
                      <p title={selectedItem.approvalThumbUrl.split('/').pop() || undefined} style={{ fontSize: 13, fontWeight: 700, color: '#1c1917', margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        Thumb aprovado
                      </p>
                      <a href={selectedItem.approvalThumbUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: '#44403c', textDecoration: 'underline', textUnderlineOffset: 2 }}>
                        Abrir em nova aba
                      </a>
                      {/* "Trocar thumb" aqui sobe NA HORA, sem confirmação — e
                          a dúvida que segurava o clique era "isso reabre a
                          aprovação?". Não reabre (update-thumb); diz antes. */}
                      <p style={{ margin: '2px 0 0', fontSize: 11, color: '#57534e', lineHeight: 1.4 }}>
                        Trocar não reabre a aprovação — o anterior fica no histórico.
                      </p>
                    </div>

                    {/* Trocar o thumb sem reabrir a aprovação */}
                    <FileUploader
                      onGetUploadParameters={getUploadUrl}
                      onComplete={(result) => updateThumbMutation.mutate({
                        itemId: selectedItem.id,
                        approvalThumbUrl: convertGCSUrlToLocalPath(result.url),
                      })}
                      accept="image/*,application/pdf"
                      data-testid="uploader-update-thumb"
                      buttonVariant="ghost"
                      buttonClassName="h-9 px-3 text-[12px] font-semibold text-stone-800 bg-white border border-stone-300 rounded-lg hover:bg-stone-50 shrink-0"
                    >
                      {updateThumbMutation.isPending ? 'Enviando…' : 'Trocar thumb'}
                    </FileUploader>
                    {/* Aqui a troca grava na hora (update-thumb), e
                        reaproveitar segue a MESMA mutação — ver
                        aplicarArteEncontrada. */}
                    <BotaoBuscarArte
                      variante="discreto"
                      testId="button-buscar-arte-troca-aprovada"
                      onClick={() => setBuscaDeArte({ itemId: selectedItem.id, displayId: selectedItem.displayId, destino: "thumb-troca" })}
                    />
                  </div>
                );
              })()}

              {/* Thumb anterior — gravado quando a Arte troca o thumb aprovado */}
              {selectedItem.previousApprovalThumbUrl && (
                <div style={{ backgroundColor: '#fffbeb', border: '1px solid #fbbf24', borderRadius: 8, padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#92400e' }}>Thumb substituído — a versão anterior ficou guardada</span>
                  <a href={selectedItem.previousApprovalThumbUrl} target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: 11, fontFamily: "'DM Mono', monospace", color: '#57534e', wordBreak: 'break-all', textDecoration: 'underline' }}>
                    {selectedItem.previousApprovalThumbUrl.split('/').pop() || selectedItem.previousApprovalThumbUrl}
                  </a>
                </div>
              )}

              {/* Arquivo anterior — exibido quando Arte substitui o arquivo enviado */}
              {selectedItem.previousFinalFileUrl && (
                <div style={{ backgroundColor: '#fffbeb', border: '1px solid #fbbf24', borderRadius: 8, padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#92400e' }}>Arquivo final substituído — o anterior ficou gravado</span>
                  <span style={{ fontSize: 11, fontFamily: "'DM Mono', monospace", color: '#57534e', wordBreak: 'break-all' }}>
                    {selectedItem.previousFinalFileName || selectedItem.previousFinalFileUrl}
                  </span>
                </div>
              )}

              {/* Caminho do arquivo final (rede) */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {/* htmlFor: o rótulo era um <label> solto (sem vínculo com o
                    campo) em verde a 60% — o leitor de tela anunciava "campo de
                    edição" sem nome, e o texto não passava AA. */}
                <label htmlFor="finalFilePath" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#57534e', paddingLeft: 2 }}>
                  Caminho do arquivo final
                </label>
                <div style={{ position: 'relative' }}>
                  <FolderOpen aria-hidden="true" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: '#57534e' }} />
                  <Input
                    id="finalFilePath"
                    placeholder="Cole o caminho do ARQUIVO (com nome e extensão)…"
                    value={finalFileUrl}
                    onChange={(e) => { setFinalFileUrl(e.target.value); setFinalDirty(true); }}
                    data-testid="input-final-file-path"
                    style={{ paddingLeft: 36, paddingRight: 16, height: 44, background: '#ffffff', border: 'none', boxShadow: '0 0 0 1px #d6d3d1', borderRadius: 8, fontSize: 13, fontWeight: 500 }}
                  />
                </div>
                {/* O arquivo final da mesma arte já está no app — copiar o
                    caminho à mão da outra peça era o que se fazia. */}
                <BotaoBuscarArte
                  variante="discreto"
                  testId="button-buscar-arte-final"
                  onClick={() => setBuscaDeArte({ itemId: selectedItem.id, displayId: selectedItem.displayId, destino: "arquivo-final" })}
                />
                {sugestaoVisivel && (
                  finalFileUrl.trim() === "" ? (
                    <div data-testid="sugestao-arquivo-final" style={{ display: "flex", flexDirection: "column", gap: 8, padding: "10px 12px", borderRadius: 8, background: "#fafaf9", border: "1px solid #e7e5e4" }}>
                      <p style={{ margin: 0, fontSize: 12, color: "#44403c", lineHeight: 1.5 }}>
                        <b style={{ fontWeight: 700, color: "#1c1917" }}>Sugestão</b> — arquivo final da {sugestaoVisivel.displayId ?? "peça de origem"}{sugestaoVisivel.evento ? ` (${sugestaoVisivel.evento})` : ""}:
                      </p>
                      <p style={{ margin: 0, fontSize: 12, fontFamily: "'DM Mono', monospace", color: "#1c1917", wordBreak: "break-all" }}>{sugestaoVisivel.finalFileUrl}</p>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button type="button" onClick={usarSugestaoFinal} data-testid="button-usar-sugestao-final"
                          style={{ minHeight: 44, padding: "0 14px", borderRadius: 8, border: "1px solid #d6d3d1", background: "#ffffff", color: "#1c1917", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                          Usar este caminho
                        </button>
                        <button type="button" onClick={ignorarSugestaoFinal} data-testid="button-ignorar-sugestao-final"
                          style={{ minHeight: 44, padding: "0 12px", borderRadius: 8, border: "none", background: "transparent", color: "#57534e", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                          Ignorar
                        </button>
                      </div>
                      <p style={{ margin: 0, fontSize: 11, color: "#746e69", lineHeight: 1.45 }}>
                        É só sugestão — nada é enviado até você clicar em enviar. Confira se o arquivo serve para esta peça (medida e evento).
                      </p>
                    </div>
                  ) : (
                    <p data-testid="sugestao-arquivo-final-linha" style={{ margin: 0, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", fontSize: 11.5, color: "#57534e", paddingLeft: 2 }}>
                      <span style={{ minWidth: 0, wordBreak: "break-all" }}>Sugestão: {sugestaoVisivel.finalFileUrl}</span>
                      <button type="button" onClick={usarSugestaoFinal} data-testid="button-usar-sugestao-final-linha"
                        style={{ minHeight: 44, padding: "0 8px", border: "none", background: "transparent", color: "#1c1917", fontSize: 12, fontWeight: 700, textDecoration: "underline", textUnderlineOffset: 2, cursor: "pointer" }}>
                        Usar
                      </button>
                    </p>
                  )
                )}
                {finalFileUrl.trim() && (
                  fileNameFromPath(finalFileUrl)
                    ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600, color: '#15803d', paddingLeft: 4 }}>
                        <FileCheck style={{ width: 13, height: 13, flexShrink: 0 }} />
                        Arquivo: <span style={{ fontFamily: "'DM Mono', monospace" }}>{fileNameFromPath(finalFileUrl)}</span>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 11, fontWeight: 600, color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: '7px 10px' }}>
                        <AlertTriangle style={{ width: 13, height: 13, flexShrink: 0, marginTop: 1 }} />
                        <span>Isto parece uma <b>pasta</b>. Cole o caminho do <b>arquivo específico</b> (com nome e extensão, ex.: …\Rolo_Ministerio.tif) para a gráfica não pegar o arquivo errado.</span>
                      </div>
                    )
                )}
              </div>

              {/* CTA button */}
              <button
                onClick={handleSubmitFinalFile}
                disabled={submitFinalFileMutation.isPending || !finalFileUrl || (!!selectedItem.finalFileUrl && !finalDirty)}
                data-testid="button-submit-final"
                style={{
                  width: '100%', minHeight: 44, padding: '0 16px', borderRadius: 9, border: 'none',
                  // TINTA, como os outros primários da Arte. E o desabilitado
                  // deixa de ser pêssego com letra BRANCA (#fcd9b7 × branco ≈
                  // 1,5:1 — o rótulo sumia justamente no estado em que o botão
                  // passa a maior parte do tempo) e passa ao cinza da casa.
                  // Sem versalete espaçado a 0,15em em peso 900: gritava mais
                  // que o título do modal.
                  backgroundColor: (submitFinalFileMutation.isPending || !finalFileUrl || (!!selectedItem.finalFileUrl && !finalDirty)) ? '#e7e5e4' : '#1c1917',
                  color: (submitFinalFileMutation.isPending || !finalFileUrl || (!!selectedItem.finalFileUrl && !finalDirty)) ? '#57534e' : '#ffffff',
                  fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700,
                  fontSize: 14,
                  cursor: (submitFinalFileMutation.isPending || !finalFileUrl || (!!selectedItem.finalFileUrl && !finalDirty)) ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  transition: 'background-color 0.15s'
                }}
                title={!finalFileUrl ? 'Cole o caminho do arquivo final para liberar' : (!!selectedItem.finalFileUrl && !finalDirty) ? 'Troque o caminho para atualizar o arquivo' : undefined}
                onMouseEnter={e => { if (submitFinalFileMutation.isPending || !finalFileUrl || (!!selectedItem.finalFileUrl && !finalDirty)) return; e.currentTarget.style.backgroundColor = '#44403c'; }}
                onMouseLeave={e => { if (submitFinalFileMutation.isPending || !finalFileUrl || (!!selectedItem.finalFileUrl && !finalDirty)) return; e.currentTarget.style.backgroundColor = '#1c1917'; }}
              >
                {/* O CTA diz o resultado (rodada 4): "Enviar para revisão"
                    não dizia O QUÊ nem de quem é a revisão. */}
                {submitFinalFileMutation.isPending ? 'Enviando…' : (selectedItem.finalFileUrl ? 'Atualizar arquivo final' : 'Enviar arquivo final para revisão')}
                {!submitFinalFileMutation.isPending && <ArrowRight aria-hidden="true" style={{ width: 16, height: 16 }} />}
              </button>
              {/* POR QUE ESTÁ BLOQUEADO, à vista. A razão morava só no `title`
                  (hover, e nunca no celular); o botão cinza parecia quebrado. */}
              {!submitFinalFileMutation.isPending && (!finalFileUrl || (!!selectedItem.finalFileUrl && !finalDirty)) ? (
                <p data-testid="final-bloqueado-motivo" style={{ margin: '-8px 0 0', fontSize: 11.5, color: '#57534e', textAlign: 'center' }}>
                  {!finalFileUrl
                    ? 'Cole o caminho do arquivo acima para liberar o envio.'
                    : 'Troque o caminho acima para atualizar o arquivo final.'}
                </p>
              ) : !selectedItem.finalFileUrl && !submitFinalFileMutation.isPending ? (
                <p style={{ margin: '-8px 0 0', fontSize: 11.5, color: '#57534e', textAlign: 'center' }}>
                  Quem pediu a peça confere o arquivo; depois ela vai para a Gráfica.
                </p>
              ) : null}
            </div>
          </section>
        ) : null}
        customActions={selectedItem && !podeEditar && ['awaiting_submission', 'sponsor_approved', 'awaiting_creator_review'].includes(selectedItem.status) ? (
          // MODO CONSULTA DENTRO DA PEÇA (rodada 4). A faixa cinza do topo
          // explica a lista, mas quem abria uma peça que espera a Arte via o
          // modal sem nenhum bloco de ação e não sabia se faltava permissão ou
          // se a tela tinha falhado. Só nas fases em que a Arte age.
          <p data-testid="modal-modo-consulta" style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0, padding: '10px 14px', borderRadius: 10, background: '#f5f5f4', border: '1px solid #e7e5e4', fontSize: 12.5, color: '#44403c', lineHeight: 1.5 }}>
            <Lock aria-hidden="true" style={{ width: 14, height: 14, color: '#57534e', flexShrink: 0 }} />
            <span><b style={{ fontWeight: 700 }}>Modo consulta.</b> Subir o thumb e o arquivo final desta peça é da equipe de Arte.</span>
          </p>
        ) : selectedItem && podeEditar && (
          <div>
            {selectedItem.status === 'awaiting_submission' && (
              <section ref={zonaDoThumbRef} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Section header */}
                {/* Título em caixa normal e "obrigatório" como texto de apoio,
                    não selo vermelho em versalete: era o elemento mais alarmante
                    do modal para dizer uma regra que o botão travado e o toast
                    já explicam. Vermelho fica para o que deu errado. */}
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <h3 style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700, fontSize: 18, letterSpacing: '-0.02em', color: '#1c1917', margin: 0 }}>
                    Thumb de aprovação
                  </h3>
                  {/* O que É o thumb, e não só que é obrigatório (rodada 4):
                      "thumb × arquivo final" era a dúvida número um de quem
                      chega — e a regra do obrigatório o botão já ensina. */}
                  <span style={{ fontSize: 12, color: '#746e69', fontWeight: 600 }}>
                    a imagem que o patrocinador vai aprovar
                  </span>
                </div>

                {approvalThumbPreview && approvalThumbPreview.trim() !== "" ? (
                  /* State A2: thumb uploaded */
                  <div style={{ background: '#ffffff', border: '1px solid #e7e5e4', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {/* Superfície BRANCA com hairline, no lugar do "vidro" lilás
                        com blur: o desfoque não tinha nada atrás para desfocar
                        (o fundo do modal é liso) e o lilás fazia o bloco de
                        decisão parecer um aviso. */}
                    <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                      <div style={{ width: 96, height: 64, borderRadius: 8, overflow: 'hidden', border: '1px solid #e7e5e4', flexShrink: 0, backgroundColor: '#f5f5f4' }}>
                        <img loading="lazy" decoding="async" 
                          src={approvalThumbPreview}
                          alt="Preview do Thumb"
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', flex: 1, gap: 4, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                          {/* Estado em texto + ícone, sem selo verde em versalete.
                              O nome do arquivo em #57534e, e não no roxo a 60%:
                              é o que se confere ("subi o certo?") e o roxo
                              translúcido não passava AA. Enquanto o preview é
                              um data: URL (upload em curso), não há nome útil. */}
                          {/* A miniatura aparece NO INSTANTE da escolha (leitura
                              local), antes de o arquivo terminar de subir. O
                              "Carregado" verde mentia nesse intervalo, e o
                              "Enviar" clicado ali respondia "Falta o thumb".
                              O giro depende de um envio EM CURSO (thumbEnviando),
                              não de "falta a URL": falha e cancelamento desfazem
                              a prévia em vez de deixar o indicador girando. */}
                          {(thumbEnviando || isPasteUploading) ? (
                            <span role="status" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: '#57534e', flexShrink: 0 }}>
                              <span aria-hidden="true" style={{ width: 11, height: 11, borderRadius: '50%', border: '2px solid #e7e5e4', borderTopColor: '#57534e', animation: 'spin 0.8s linear infinite' }} />
                              Subindo o thumb…
                            </span>
                          ) : approvalThumbUrl ? (
                            <>
                              <CheckCircle aria-hidden="true" style={{ width: 13, height: 13, color: '#15803d', flexShrink: 0 }} />
                              <span style={{ fontSize: 12, fontWeight: 600, color: '#15803d', flexShrink: 0 }}>Thumb carregado</span>
                            </>
                          ) : null}
                          {!approvalThumbPreview.startsWith('data:') && (
                            <span title={approvalThumbPreview.split('/').pop() || undefined} style={{ fontSize: 11, color: '#57534e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                              {approvalThumbPreview.split('/').pop()}
                            </span>
                          )}
                        </div>
                        <FileUploader
                          onGetUploadParameters={getUploadUrl}
                          onComplete={(result) => {
                            concluirEnvioDoThumb(convertGCSUrlToLocalPath(result.url));
                            toast({ title: "Thumb trocado", description: "Confira a miniatura e envie para aprovação." });
                            focarEnvioParaAprovacao();
                          }}
                          onError={(error) => { desfazerEnvioDoThumb(); toast({ title: "Erro no upload", description: `${error.message} — o thumb anterior continua valendo.`, variant: "destructive" }); }}
                          onCancel={desfazerEnvioDoThumb}
                          onFileSelect={iniciarEnvioDoThumb}
                          disabled={thumbEnviando || isPasteUploading}
                          accept="image/*"
                          buttonVariant="ghost"
                          buttonClassName="h-auto p-0 self-start text-[12px] font-semibold text-stone-700 underline underline-offset-2 hover:text-stone-900 hover:bg-transparent"
                        >
                          Trocar thumb
                        </FileUploader>
                        <BotaoBuscarArte
                          variante="discreto"
                          testId="button-buscar-arte-trocar"
                          onClick={() => setBuscaDeArte({ itemId: selectedItem.id, displayId: selectedItem.displayId, destino: "thumb-aprovacao" })}
                        />
                      </div>
                    </div>

                    {/* A AÇÃO PRINCIPAL VEM PRIMEIRO, E EM TINTA.

                        Eram dois botões de largura inteira empilhados com
                        "Salvar thumb (sem enviar)" EM CIMA e o envio embaixo,
                        num roxo com sombra colorida — o olho chegava primeiro no
                        secundário. Agora enviar é o botão cheio, em tinta, como
                        o "Enviar" da linha da tabela (é a mesma ação), e o
                        rascunho fica logo abaixo, com contorno. O foco vem para
                        cá quando o upload termina: Enter envia. */}
                    <button
                      onClick={handleSubmitForApproval}
                      disabled={submitForApprovalMutation.isPending || isPasteUploading || thumbEnviando || !approvalThumbUrl}
                      data-testid="button-submit-approval-header"
                      style={{
                        width: '100%', minHeight: 44, padding: '0 16px', borderRadius: 9, border: 'none',
                        backgroundColor: (submitForApprovalMutation.isPending || isPasteUploading || thumbEnviando || !approvalThumbUrl) ? '#e7e5e4' : '#1c1917',
                        color: (submitForApprovalMutation.isPending || isPasteUploading || thumbEnviando || !approvalThumbUrl) ? '#57534e' : '#ffffff',
                        fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700,
                        fontSize: 14,
                        cursor: (submitForApprovalMutation.isPending || isPasteUploading || thumbEnviando || !approvalThumbUrl) ? 'not-allowed' : 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                        transition: 'background-color 0.15s',
                      }}
                      onMouseEnter={e => { if (submitForApprovalMutation.isPending || isPasteUploading || thumbEnviando || !approvalThumbUrl) return; e.currentTarget.style.backgroundColor = '#44403c'; }}
                      onMouseLeave={e => { if (submitForApprovalMutation.isPending || isPasteUploading || thumbEnviando || !approvalThumbUrl) return; e.currentTarget.style.backgroundColor = '#1c1917'; }}
                    >
                      {submitForApprovalMutation.isPending
                        ? <><span aria-hidden="true" style={{ width: 13, height: 13, borderRadius: '50%', border: '2px solid #d6d3d1', borderTopColor: '#57534e', animation: 'spin 0.8s linear infinite' }} />Enviando…</>
                        : <><Send aria-hidden="true" style={{ width: 14, height: 14 }} />{selectedItem.skipApproval ? 'Enviar direto para a finalização (arquivo final)' : 'Enviar para aprovação do patrocinador'}</>}
                    </button>
                    {/* "ENVIOU PARA QUEM?" respondido antes do clique (rodada
                        4). Os nomes já vêm na peça; peça sem aprovação de
                        patrocinador diz isso em vez de listar marcas que não
                        vão decidir nada. */}
                    {(() => {
                      if (selectedItem.skipApproval) {
                        return (
                          <p style={{ margin: '-4px 0 0', fontSize: 12, color: '#57534e', textAlign: 'center', lineHeight: 1.45 }}>
                            Esta peça não passa por aprovação de patrocinador.
                          </p>
                        );
                      }
                      const nomes: string[] = (selectedItem.sponsors ?? []).map((s: any) => s?.name).filter(Boolean);
                      if (nomes.length === 0) return null;
                      const lista = nomes.length <= 3 ? nomes.join(', ') : `${nomes.slice(0, 3).join(', ')} e mais ${nomes.length - 3}`;
                      return (
                        <p data-testid="thumb-vai-para" style={{ margin: '-4px 0 0', fontSize: 12, color: '#57534e', textAlign: 'center', lineHeight: 1.45 }}>
                          Vai para a aprovação de <strong style={{ color: '#1c1917', fontWeight: 600 }}>{lista}</strong>
                        </p>
                      );
                    })()}

                    {/* Rascunho: secundário de verdade. Salvo, vira uma LINHA de
                        confirmação — era uma caixa verde do tamanho do botão
                        principal, que parecia ser a próxima ação. */}
                    {savedApprovalThumbUrl && savedApprovalThumbUrl === approvalThumbUrl ? (
                      <p
                        data-testid="thumb-saved-confirmation"
                        role="status"
                        style={{
                          margin: 0, minHeight: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                          color: '#15803d', fontSize: 13, fontWeight: 600, textAlign: 'center',
                          animation: thumbJustSaved ? 'thumb-saved-pop 0.25s ease' : 'none',
                        }}
                      >
                        <CheckCircle aria-hidden="true" style={{ width: 14, height: 14, flexShrink: 0 }} />
                        Salvo como rascunho — dá para enviar depois pela linha da peça
                      </p>
                    ) : (
                      <button
                        onClick={handleSaveThumbDraft}
                        disabled={saveThumbDraftMutation.isPending || submitForApprovalMutation.isPending}
                        data-testid="button-save-thumb-draft"
                        style={{
                          width: '100%', minHeight: 40, padding: '0 16px', borderRadius: 9,
                          border: '1px solid #e7e5e4', background: '#ffffff',
                          color: '#44403c', fontWeight: 600, fontSize: 13,
                          cursor: (saveThumbDraftMutation.isPending || submitForApprovalMutation.isPending) ? 'not-allowed' : 'pointer',
                          opacity: (saveThumbDraftMutation.isPending || submitForApprovalMutation.isPending) ? 0.6 : 1,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                          transition: 'background 0.15s'
                        }}
                        onMouseEnter={e => { if (saveThumbDraftMutation.isPending || submitForApprovalMutation.isPending) return; e.currentTarget.style.background = '#fafaf9'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = '#ffffff'; }}
                      >
                        <FileImage aria-hidden="true" style={{ width: 14, height: 14 }} />
                        {saveThumbDraftMutation.isPending ? 'Salvando…' : 'Salvar como rascunho, sem enviar'}
                      </button>
                    )}
                  </div>
                ) : (
                  /* State A1: empty upload zone */
                  <div style={{
                    background: (isPasteUploading || isDragOver) ? '#f5f5f4' : '#fafaf9',
                    border: (isPasteUploading || isDragOver) ? '1.5px dashed #57534e' : '1.5px dashed #d6d3d1', borderRadius: 12, padding: isMobile ? '20px 16px' : '24px 32px',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    textAlign: 'center', gap: 10, transition: 'background 0.15s, border-color 0.15s'
                  }}
                    onMouseEnter={e => { if (!isPasteUploading && !isDragOver) (e.currentTarget as HTMLElement).style.background = '#f5f5f4'; }}
                    onMouseLeave={e => { if (!isPasteUploading && !isDragOver) (e.currentTarget as HTMLElement).style.background = '#fafaf9'; }}
                    onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
                    onDragEnter={e => { e.preventDefault(); setIsDragOver(true); }}
                    // Mesmo cuidado da zona da Correção: ignora o dragleave dos filhos.
                    onDragLeave={e => { e.preventDefault(); if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setIsDragOver(false); }}
                    onDrop={e => {
                      e.preventDefault();
                      setIsDragOver(false);
                      const file = e.dataTransfer.files[0];
                      if (!file || !file.type.startsWith('image/')) {
                        toast({ title: "Arquivo inválido", description: "Apenas imagens são aceitas", variant: "destructive" });
                        return;
                      }
                      iniciarEnvioDoThumb(file);
                      uploadFileDirect(file, (localPath) => {
                        concluirEnvioDoThumb(localPath);
                        focarEnvioParaAprovacao();
                      }, desfazerEnvioDoThumb);
                    }}
                  >
                    {/* ZONA NEUTRA. Era lilás com desfoque, ícone roxo, título
                        roxo-escuro e botão roxo: quatro tons de uma cor que, no
                        resto da tela, só marca "rascunho". A zona de upload
                        segue a mesma pele da zona da Correção — tracejado claro
                        que escurece ao arrastar. */}
                    <div style={{ width: 44, height: 44, borderRadius: '50%', backgroundColor: '#ffffff', border: '1px solid #e7e5e4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {isPasteUploading
                        ? <div style={{ width: 20, height: 20, borderRadius: '50%', border: '2.5px solid #e7e5e4', borderTopColor: '#1c1917', animation: 'spin 0.8s linear infinite' }} />
                        : <Upload aria-hidden="true" style={{ width: 20, height: 20, color: '#44403c' }} />
                      }
                    </div>
                    <div>
                      <p style={{ fontSize: 14, fontWeight: 700, color: '#1c1917', margin: '0 0 4px' }}>
                        {isPasteUploading ? 'Subindo a imagem…' : 'Suba o thumb para enviar'}
                      </p>
                      <p style={{ fontSize: 12, color: '#57534e', margin: 0 }}>
                        {isPasteUploading ? 'Aguarde o upload concluir' : <>Arraste aqui, escolha o arquivo ou cole com <kbd style={KBD}>Ctrl</kbd>+<kbd style={KBD}>V</kbd></>}
                      </p>
                    </div>
                    {!isPasteUploading && (
                      <FileUploader
                        onGetUploadParameters={getUploadUrl}
                        onComplete={(result) => {
                          concluirEnvioDoThumb(convertGCSUrlToLocalPath(result.url));
                          toast({ title: "Thumb carregado", description: "Confira a miniatura e envie para aprovação." });
                          focarEnvioParaAprovacao();
                        }}
                        onError={(error) => { desfazerEnvioDoThumb(); toast({ title: "Erro no upload", description: `${error.message} — o thumb não subiu; escolha o arquivo de novo.`, variant: "destructive" }); }}
                        onCancel={desfazerEnvioDoThumb}
                        onFileSelect={iniciarEnvioDoThumb}
                        accept="image/*"
                        buttonVariant="ghost"
                        buttonClassName="mt-1 h-10 text-[13px] font-semibold bg-white text-stone-900 border border-stone-300 px-5 rounded-lg hover:bg-stone-50 hover:text-stone-900"
                      >
                        Escolher arquivo
                      </FileUploader>
                    )}
                    {/* O SEGUNDO CAMINHO, ao lado do primeiro (dono, 21/09):
                        a arte deste patrocinador já existe no app, num evento
                        do mesmo circuito. Reaproveitar é só não subir o
                        arquivo de novo — daqui para a frente é o envio de
                        sempre. */}
                    {!isPasteUploading && (
                      <BotaoBuscarArte
                        testId="button-buscar-arte-aprovacao"
                        onClick={() => setBuscaDeArte({ itemId: selectedItem.id, displayId: selectedItem.displayId, destino: "thumb-aprovacao" })}
                      />
                    )}
                    {/* A linha "ou Ctrl+V para colar direto" saiu: repetia, em
                        roxo, o atalho que a frase logo acima já ensina. */}
                  </div>
                )}
              </section>
            )}
          </div>
        )}
      />

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* MODAL 3 — BULK PDF UPLOAD                                          */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <Dialog open={showBulkDialog} onOpenChange={(open) => { if (!open) { setShowBulkDialog(false); setSharedPdfUrl(""); } }}>
        <DialogContent className={cn("p-0 gap-0", HIDE_NATIVE_CLOSE)} style={modalSurface(600)}>
          {/* POR QUE congelar aqui: o onSuccess do envio em lote invalida TRÊS
              chaves de /api/items, fecha o modal, esvazia `selectedItemIds` e
              `sharedPdfUrl` e toasta — tudo no mesmo commit. Os dois estados
              esvaziados são exatamente o que o modal mostra: a lista de itens
              e o PDF anexado. Sem congelar, o modal vira "Itens Selecionados
              (00)" sem PDF durante toda a animação de saída, enquanto os
              renders da invalidação batem na subárvore em desmontagem — o laço
              do React #185. Mecanismo por extenso em
              components/modal-shell.tsx. */}
          <FreezeWhileClosing open={showBulkDialog}>
          <DialogTitle className="sr-only">PDF compartilhado</DialogTitle>
          <DialogDescription className="sr-only">Vincular um PDF a múltiplas peças</DialogDescription>

          <ModalHeader
            icon={Upload}
            tint="#2563eb"
            title="PDF compartilhado"
            subtitle="Um PDF vira o thumb de todas as peças selecionadas, e elas vão juntas para a aprovação do patrocinador"
            onClose={() => { setShowBulkDialog(false); setSharedPdfUrl(""); }}
          />
          {/* ALTURA: cabeçalho 93 + este corpo ~380 (a lista de itens já tem teto
              próprio de 280 e o painel do PDF fica ao lado) + rodapé 120 = 593px.
              Em 445 de altura cortava 98px de cada lado, com o "Enviar lote"
              fora da tela. `flex: 1 1 auto` + `minHeight: 0` entrega a este
              corpo o que sobrar do teto do `modalSurface`; a lista de 280 segue
              rolando por conta própria dentro dele. */}
          <div style={{ padding: '24px 32px', overflowY: 'auto', flex: '1 1 auto', minHeight: 0 }}>

            {/* 2 colunas no desktop; 1 no mobile para não espremer as listas */}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? 20 : 32 }}>
              {/* Left: items list */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Rótulo cinza como os dos outros modais (era marrom-laranja
                    #9d4300, uma sexta cor de rótulo na tela) e sem o zero à
                    esquerda: "(05)" é notação de painel de máquina, não conta. */}
                <h3 style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#57534e', margin: 0 }}>
                  {selectedItemIds.size} {selectedItemIds.size === 1 ? 'peça selecionada' : 'peças selecionadas'}
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 280, overflowY: 'auto' }}>
                  {Array.from(selectedItemIds).map((itemId, idx) => {
                    const item = itemPorId.get(itemId);
                    if (!item) return null;
                    const isFirst = idx === 0;
                    return (
                      <div key={itemId} style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                        // Sem o filete laranja na PRIMEIRA linha: ele destacava
                        // uma peça que não tem nada de diferente das outras.
                        backgroundColor: '#fafaf9', border: '1px solid #f0efee', borderRadius: 8,
                      }}>
                        <div style={{ width: 40, height: 40, backgroundColor: '#d6d3d1', borderRadius: 6, flexShrink: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {item.approvalThumbUrl ? (
                            <img loading="lazy" decoding="async" src={miniatura(item.approvalThumbUrl)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <FileImage style={{ width: 16, height: 16, color: '#57534e' }} />
                          )}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <p style={{ fontSize: 12, fontWeight: 700, color: '#1c1917', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {item.displayId} · {item.type}
                          </p>
                          <p style={{ fontSize: 11, color: '#57534e', margin: 0 }}>
                            {item.event?.name || 'Sem evento'}{item.sponsors?.[0]?.name ? ` • ${item.sponsors[0].name}` : ''}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Right: upload zone */}
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <h3 style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#57534e', margin: '0 0 16px' }}>
                  PDF compartilhado
                </h3>
                <div style={{
                  flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  backgroundColor: '#fafaf9', borderRadius: 12, border: '1.5px dashed #d6d3d1',
                  padding: 24, textAlign: 'center', transition: 'border-color 0.15s', minHeight: isMobile ? 160 : 200
                }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#a8a29e'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#d6d3d1'; }}
                >
                  {sharedPdfUrl ? (
                    <>
                      <div style={{ width: 48, height: 48, backgroundColor: '#ffffff', border: '1px solid #e7e5e4', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                        <CheckCircle aria-hidden="true" style={{ width: 22, height: 22, color: '#15803d' }} />
                      </div>
                      <p style={{ fontSize: 13, fontWeight: 700, color: '#1c1917', margin: '0 0 4px' }}>PDF carregado</p>
                      <a href={sharedPdfUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: '#44403c', textDecoration: 'underline', textUnderlineOffset: 2, display: 'block', marginBottom: 12 }}>
                        Conferir o PDF
                      </a>
                      {/* Botões em caixa normal e 36px: eram pílulas de 32px em
                          versalete de 10px com espaçamento largo — o menor texto
                          do modal justamente na única ação da coluna. */}
                      <FileUploader
                        onGetUploadParameters={getUploadUrl}
                        onComplete={(result) => { setSharedPdfUrl(convertGCSUrlToLocalPath(result.url)); toast({ title: "PDF trocado", description: "O novo PDF vale para todas as peças selecionadas." }); }}
                        onError={(error) => { toast({ title: "Erro no upload", description: error.message, variant: "destructive" }); }}
                        accept=".pdf,application/pdf"
                        buttonVariant="ghost"
                        buttonClassName="h-9 text-[13px] font-semibold bg-white text-stone-900 border border-stone-300 rounded-lg px-4 hover:bg-stone-50 hover:text-stone-900"
                      >
                        Trocar PDF
                      </FileUploader>
                    </>
                  ) : (
                    <>
                      <div style={{ width: 48, height: 48, backgroundColor: '#ffffff', border: '1px solid #e7e5e4', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                        <FileText aria-hidden="true" style={{ width: 22, height: 22, color: '#44403c' }} />
                      </div>
                      <p style={{ fontSize: 13, fontWeight: 700, color: '#1c1917', margin: '0 0 4px' }}>Suba o PDF</p>
                      <p style={{ fontSize: 12, color: '#57534e', margin: '0 0 14px', padding: '0 8px' }}>Ele vale para todas as peças {isMobile ? 'acima' : 'à esquerda'}.</p>
                      <FileUploader
                        onGetUploadParameters={getUploadUrl}
                        onComplete={(result) => { setSharedPdfUrl(convertGCSUrlToLocalPath(result.url)); toast({ title: "PDF carregado", description: "Confira as peças e envie o lote." }); }}
                        onError={(error) => { toast({ title: "Erro no upload", description: error.message, variant: "destructive" }); }}
                        accept=".pdf,application/pdf"
                        buttonVariant="ghost"
                        buttonClassName="h-10 text-[13px] font-semibold bg-stone-900 text-white rounded-lg px-4 hover:bg-stone-700 hover:text-white"
                      >
                        Escolher PDF
                      </FileUploader>
                    </>
                  )}
                </div>
              </div>
            </div>

          </div>
          <ModalFooter>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', alignItems: 'center' }}>
              {/* QUEM FICA DE FORA, ANTES do clique (rodada 4). A seleção
                  atravessa abas, e só "aguardando envio" aceita o PDF; o aviso
                  existia só como toast DEPOIS de enviar. */}
              {(() => {
                const fora = Array.from(selectedItemIds).filter(id => itemPorId.get(id)?.status !== 'awaiting_submission').length;
                if (fora === 0) return null;
                return (
                  <span data-testid="aviso-fora-do-lote" style={{ marginRight: 'auto', fontSize: 12, color: '#92400e', lineHeight: 1.4 }}>
                    {fora} {fora === 1 ? 'selecionada não está' : 'selecionadas não estão'} aguardando envio e {fora === 1 ? 'fica' : 'ficam'} fora
                  </span>
                );
              })()}
              {/* Cancelar com contorno, como nos modais de dispensa e devolução:
                  transparente e sem borda ele lia como legenda, não como saída. */}
              <button
                onClick={() => { setShowBulkDialog(false); setSharedPdfUrl(""); }}
                style={{ height: 40, padding: '0 16px', borderRadius: 8, border: '1px solid #e7e5e4', background: '#ffffff', color: '#57534e', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
              >
                Cancelar
              </button>
              <button
                disabled={submitBulkForApprovalMutation.isPending || !sharedPdfUrl}
                onClick={handleBulkSubmit}
                data-testid="button-submit-bulk-pdf"
                title={!sharedPdfUrl ? 'Suba o PDF para liberar o envio' : undefined}
                style={{
                  height: 40, padding: '0 20px', borderRadius: 8, border: 'none',
                  // Tinta, como os demais primários da Arte (era #c2410c).
                  backgroundColor: (submitBulkForApprovalMutation.isPending || !sharedPdfUrl) ? '#e7e5e4' : '#1c1917',
                  color: (submitBulkForApprovalMutation.isPending || !sharedPdfUrl) ? '#57534e' : '#ffffff',
                  fontWeight: 700, fontSize: 13,
                  cursor: (submitBulkForApprovalMutation.isPending || !sharedPdfUrl) ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  transition: 'background-color 0.15s',
                }}
              >
                {/* Spinner em cinza: durante o envio o fundo é o cinza do
                    desabilitado, e o spinner branco de antes sumia nele. O
                    rótulo diz QUANTAS vão — as mesmas que o envio aceita
                    (só aguardando envio; ver handleBulkSubmit). */}
                {submitBulkForApprovalMutation.isPending ? (
                  <><div aria-hidden="true" style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid #d6d3d1', borderTopColor: '#57534e', animation: 'spin 0.8s linear infinite' }} />Enviando…</>
                ) : (() => {
                  const n = Array.from(selectedItemIds).filter(id => itemPorId.get(id)?.status === 'awaiting_submission').length;
                  return <><Send aria-hidden="true" style={{ width: 14, height: 14 }} />{n > 0 ? `Enviar ${n} para aprovação` : 'Enviar lote'}</>;
                })()}
              </button>
            </div>
          </ModalFooter>
          </FreezeWhileClosing>
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* MODAL — EXPORT PDF (componente compartilhado)                       */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* Com peças selecionadas, o modal recebe só a seleção como pool. */}
      <ExportPdfDialog open={showExportModal} onOpenChange={setShowExportModal} items={itensDaExportacaoCongelados} title="Arte" />

      {/* BUSCAR ARTE JÁ FEITA — um modal só para os quatro pontos de envio
          (thumb de aprovação, troca do thumb aprovado, correção e arquivo
          final). Quem abriu diz o DESTINO; aplicar é aplicarArteEncontrada. */}
      <BuscarArteDialog
        item={buscaDeArte ? { id: buscaDeArte.itemId, displayId: buscaDeArte.displayId } : null}
        querArquivoFinal={buscaDeArte?.destino === "arquivo-final"}
        onUsar={aplicarArteEncontrada}
        onClose={() => setBuscaDeArte(null)}
      />

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* MODAL — SUBIR BOOK (PDF) e escolher as peças cobertas               */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <Dialog open={showBookModal} onOpenChange={setShowBookModal}>
        <DialogContent className={cn("p-0 gap-0", HIDE_NATIVE_CLOSE)} style={modalSurface(600)}>
          <DialogTitle className="sr-only">Subir book de aprovação</DialogTitle>
          <DialogDescription className="sr-only">Envie o PDF do book e selecione as peças que ele cobre</DialogDescription>

          {/* Cabeçalho da casca compartilhada — mesma altura, mesmo tamanho de
              título e mesmo botão de fechar dos outros modais da tela. */}
          <ModalHeader
            icon={FileText}
            tint="#ea580c"
            title={existingBookUrl ? 'Atualizar book (PDF)' : 'Subir book (PDF)'}
            // "serão enviadas aos patrocinadores" prometia um destino que o
            // servidor não tem (rodada 4): salvar publica o book no evento e o
            // aviso por e-mail vai para a EQUIPE (avisarBookPorEmail) — o toast
            // diz para quem saiu.
            subtitle={existingBookUrl
              ? 'Substitua o PDF atual e confirme as peças cobertas — ao salvar, a equipe é avisada por e-mail.'
              : 'Envie o layout pronto e marque as peças que ele cobre — ao salvar, a equipe é avisada por e-mail.'}
            onClose={() => setShowBookModal(false)}
          />

          {/* ── Body ── */}
          {/* ALTURA: o `maxHeight: '62vh'` daqui era um desconto CHUTADO — 62% da
              viewport para o corpo, sem relação com o que cabeçalho e rodapé
              realmente ocupam. Media 93 + 62vh + 120: em 445 de altura dava
              489px de modal contra 397 disponíveis, e o Radix cortava 46px de
              cada lado. É o mesmo erro estrutural que a Gestão de Prazos
              abandonou: nenhum número fixo acerta 1080 e 445 ao mesmo tempo.
              Agora o teto é do DialogContent (`100vh − 48`, via `modalSurface`) e
              este corpo fica com o que sobrar depois do cabeçalho e do rodapé
              MEDIDOS pelo navegador — `flex: 1 1 auto` + `minHeight: 0`. */}
          <div style={{ padding: '22px 28px', display: 'flex', flexDirection: 'column', gap: 22, overflowY: 'auto', flex: '1 1 auto', minHeight: 0, backgroundColor: '#fafaf9' }}>

            {/* Evento */}
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#57534e', display: 'block', marginBottom: 6 }}>Evento</label>
              <FilterSelect
                fullWidth hideWhenEmpty={false} showAllLabelWhenEmpty
                label="Evento" allLabel="Selecione um evento"
                value={bookEventId || "all"} onChange={v => setBookEventId(v === "all" ? "" : v)}
                options={bookEventOptions}
                searchPlaceholder="Buscar evento..." emptyText="Nenhum evento com peças na Arte."
              />
            </div>

            {/* Book atual — só aparece quando já existe um book para o evento */}
            {existingBookUrl && !bookFileUrl && (
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#57534e', display: 'block', marginBottom: 6 }}>Book atual</label>
                {/* Neutro e chapado: o book atual é CONTEXTO (o que existe hoje),
                    não alerta — o ladrilho em gradiente laranja com sombra era o
                    objeto mais saturado do modal, acima do próprio upload. */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 12, border: '1px solid #e7e5e4', background: '#ffffff', flexWrap: 'wrap' }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: '#f5f5f4', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <FileText aria-hidden="true" style={{ width: 14, height: 14, color: '#44403c' }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: '#1c1917', margin: 0 }}>Este evento já tem book</p>
                    <p style={{ fontSize: 12, color: '#57534e', margin: '1px 0 0' }}>O PDF que você subir abaixo substitui o atual</p>
                  </div>
                  <a
                    href={existingBookUrl} target="_blank" rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, minHeight: 32, fontSize: 12, fontWeight: 600, color: '#1c1917', textDecoration: 'none', background: '#fff', border: '1px solid #d6d3d1', borderRadius: 8, padding: '0 10px', flexShrink: 0, whiteSpace: 'nowrap' }}
                  >
                    <ExternalLink aria-hidden="true" style={{ width: 12, height: 12 }} /> Ver book atual
                  </a>
                </div>
              </div>
            )}

            {/* Upload do PDF */}
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#57534e', display: 'block', marginBottom: 6 }}>
                {existingBookUrl ? 'Novo PDF (substituição)' : 'Arquivo do book'}
              </label>
              {/* Drag & drop real: a zona dizia "Arrastar ou clicar" mas só o
                  clique funcionava — mesmo padrão dos outros dropzones da tela. */}
              <label style={{
                display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px', borderRadius: 12,
                border: `1.5px dashed ${isDragOverBook ? '#57534e' : bookFileUrl ? '#86efac' : '#d6d3d1'}`,
                background: isDragOverBook ? '#f5f5f4' : '#ffffff',
                cursor: 'pointer', transition: 'all 0.15s',
              }}
                onMouseEnter={e => { if (!bookFileUrl && !isDragOverBook) { (e.currentTarget as HTMLLabelElement).style.borderColor = '#a8a29e'; (e.currentTarget as HTMLLabelElement).style.background = '#fafaf9'; } }}
                onMouseLeave={e => { if (!bookFileUrl && !isDragOverBook) { (e.currentTarget as HTMLLabelElement).style.borderColor = '#d6d3d1'; (e.currentTarget as HTMLLabelElement).style.background = '#ffffff'; } }}
                onDragOver={e => { e.preventDefault(); setIsDragOverBook(true); }}
                onDragEnter={e => { e.preventDefault(); setIsDragOverBook(true); }}
                // Ignora o dragleave dos filhos (ícone, textos) — o destaque piscava.
                onDragLeave={e => { e.preventDefault(); if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setIsDragOverBook(false); }}
                onDrop={e => {
                  e.preventDefault();
                  setIsDragOverBook(false);
                  if (bookUploading) return;
                  void handleBookFile(e.dataTransfer.files?.[0]); // valida .pdf lá dentro
                }}
              >
                {/* Ladrilho chapado: dois gradientes laranja com sombra colorida
                    para um ícone de 18px. Carregado, o sinal é o VERDE do
                    "pronto" (o mesmo das outras zonas de upload), não laranja. */}
                <div style={{ width: 40, height: 40, borderRadius: 12, background: bookFileUrl ? '#f0fdf4' : '#ffffff', border: `1px solid ${bookFileUrl ? '#bbf7d0' : '#e7e5e4'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.15s' }}>
                  {bookUploading
                    ? <div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid #e7e5e4', borderTopColor: '#1c1917', animation: 'spin 0.8s linear infinite' }} />
                    : bookFileUrl
                      ? <CheckCircle aria-hidden="true" style={{ width: 18, height: 18, color: '#15803d' }} />
                      : existingBookUrl
                        ? <RefreshCw aria-hidden="true" style={{ width: 16, height: 16, color: '#44403c' }} />
                        : <Upload aria-hidden="true" style={{ width: 18, height: 18, color: '#44403c' }} />
                  }
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: '#1c1917', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {bookUploading ? 'Enviando arquivo…' : bookFileName || (existingBookUrl ? 'Escolher o novo PDF…' : 'Arraste o PDF aqui ou clique para escolher')}
                  </p>
                  {!bookFileUrl && !bookUploading && (
                    <p style={{ fontSize: 12, color: '#57534e', margin: '2px 0 0' }}>Só arquivos .pdf, de qualquer tamanho</p>
                  )}
                  {bookFileUrl && (
                    <p style={{ fontSize: 12, color: '#15803d', margin: '2px 0 0', fontWeight: 600 }}>Carregado — marque as peças e salve</p>
                  )}
                </div>
                {bookFileUrl && <span aria-hidden="true" style={{ fontSize: 12, fontWeight: 600, color: '#1c1917', flexShrink: 0, padding: '5px 10px', border: '1px solid #d6d3d1', borderRadius: 8, background: '#fff' }}>Trocar</span>}
                <input type="file" accept="application/pdf,.pdf" className="sr-only"
                  onChange={e => { handleBookFile(e.target.files?.[0]); e.target.value = ''; }} />
              </label>
            </div>

            {/* Peças do evento */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#57534e' }}>Peças no book</span>
                  {bookEventPieces.length > 0 && (
                    <span style={{ fontSize: 11, fontWeight: 800, color: '#1c1917', fontFamily: '"Space Grotesk", sans-serif' }}>
                      {bookSelectedIds.size}<span style={{ fontWeight: 500, color: '#57534e' }}> / {bookEventPieces.length}</span>
                    </span>
                  )}
                </div>
                {bookEventPieces.length > 0 && (
                  <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                    {/* minHeight 32: com padding de 3px os dois atalhos tinham
                        ~20px de alvo, abaixo do mínimo de 24. */}
                    <button type="button" onClick={() => setBookSelectedIds(new Set(bookEventPieces.map((i: any) => i.id)))}
                      style={{ background: 'none', border: 'none', minHeight: 32, padding: '0 8px', fontSize: 12, fontWeight: 700, color: '#c2410c', cursor: 'pointer', borderRadius: 6, transition: 'color 0.1s', textDecoration: 'underline', textDecorationColor: 'transparent', textUnderlineOffset: '2px' }}
                      onMouseEnter={e => { e.currentTarget.style.textDecorationColor = '#c2410c'; }}
                      onMouseLeave={e => { e.currentTarget.style.textDecorationColor = 'transparent'; }}
                    >Todas</button>
                    <span style={{ color: '#d4d4d0', userSelect: 'none' }}>·</span>
                    <button type="button" onClick={() => setBookSelectedIds(new Set())}
                      style={{ background: 'none', border: 'none', minHeight: 32, padding: '0 8px', fontSize: 12, fontWeight: 700, color: '#57534e', cursor: 'pointer', borderRadius: 6, transition: 'color 0.1s', textDecoration: 'underline', textDecorationColor: 'transparent', textUnderlineOffset: '2px' }}
                      onMouseEnter={e => { e.currentTarget.style.textDecorationColor = '#a8a29e'; }}
                      onMouseLeave={e => { e.currentTarget.style.textDecorationColor = 'transparent'; }}
                    >Nenhuma</button>
                  </div>
                )}
              </div>
              <div style={{ border: '1px solid #ebe8e3', borderRadius: 12, maxHeight: 240, overflowY: 'auto', backgroundColor: '#ffffff' }}>
                {bookEventPieces.length === 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '28px 20px', gap: 8 }}>
                    <FileText style={{ width: 26, height: 26, color: '#d4d4d0' }} />
                    <p style={{ fontSize: 12, color: '#57534e', margin: 0, textAlign: 'center' }}>Selecione um evento para ver as peças disponíveis.</p>
                  </div>
                ) : bookEventPieces.map((item: any, idx: number) => {
                  const on = bookSelectedIds.has(item.id);
                  const isLast = idx === bookEventPieces.length - 1;
                  const toggleBookPiece = () => setBookSelectedIds(prev => { const n = new Set(prev); if (n.has(item.id)) n.delete(item.id); else n.add(item.id); return n; });
                  return (
                    <div key={item.id}
                      // Mesmo padrão de checkbox acessível do export-pdf-dialog.
                      role="checkbox"
                      aria-checked={on}
                      aria-label={`${item.displayId} — ${item.type}`}
                      tabIndex={0}
                      onClick={toggleBookPiece}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleBookPiece(); } }}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderBottom: isLast ? 'none' : '1px solid #f5f4f2', cursor: 'pointer', background: on ? '#fff7ed' : '#ffffff', transition: 'background 0.1s' }}
                      onMouseEnter={e => { if (!on) e.currentTarget.style.background = '#fafaf9'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = on ? '#fff7ed' : '#ffffff'; }}
                    >
                      <div style={{ width: 16, height: 16, borderRadius: 6, flexShrink: 0, border: `2px solid ${on ? '#f97316' : '#d4d4d0'}`, background: on ? '#f97316' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.12s' }}>
                        {on && <Check style={{ width: 9, height: 9, color: '#fff' }} />}
                      </div>
                      <span style={{ fontFamily: '"Space Grotesk", monospace', fontSize: 11, fontWeight: 700, color: on ? '#c2410c' : '#746e69', background: on ? '#fed7aa' : '#f0efee', padding: '2px 7px', borderRadius: 6, flexShrink: 0, letterSpacing: '0.01em', transition: 'all 0.12s' }}>{item.displayId}</span>
                      <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, overflow: 'hidden' }}>
                          {groupOf(item.type) && (
                            <span style={{ fontSize: 11, fontWeight: 600, color: on ? '#c2410c' : '#78716c', background: on ? '#fff7ed' : '#f5f4f2', border: `1px solid ${on ? '#fed7aa' : '#ebe8e3'}`, borderRadius: 6, padding: '2px 7px', whiteSpace: 'nowrap', flexShrink: 0, letterSpacing: '0.02em', transition: 'all 0.12s' }}>{groupOf(item.type)}</span>
                          )}
                          <span style={{ fontSize: 12, fontWeight: 600, color: on ? '#1c1917' : '#57534e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', transition: 'color 0.1s' }}>{item.type}</span>
                        </div>
                        {item.description && item.description !== item.type && (
                          <span style={{ fontSize: 11, color: '#57534e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.description}</span>
                        )}
                      </span>
                      {item.bookUrl && (
                        <span title="Esta peça já está no book atual" style={{ marginLeft: 'auto', flexShrink: 0, fontSize: 11, fontWeight: 600, color: '#57534e', background: '#f5f5f4', border: '1px solid #e7e5e4', borderRadius: 6, padding: '2px 8px', whiteSpace: 'nowrap' }}>no book atual</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* O que mudou — obrigatório quando o evento já tem book */}
            <ComentarioDoBook
              republicacao={!!existingBookUrl}
              valor={bookComentario}
              aoMudar={setBookComentario}
              patrocinadores={bookPatrocinadores}
            />
          </div>

          <ModalFooter>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap' }}>
            {/* O QUE FALTA para salvar, escrito (rodada 4) — a mesma conta do
                `title` do botão, que só aparecia no hover. */}
            {!saveBookMutation.isPending && (!bookFileUrl || bookSelectedIds.size === 0 || bookComentarioFalta) && (
              <span data-testid="book-falta" style={{ marginRight: 'auto', fontSize: 12, color: '#57534e', lineHeight: 1.4 }}>
                {!bookFileUrl ? 'Falta o PDF do book.' : bookSelectedIds.size === 0 ? 'Marque ao menos uma peça.' : 'Escreva o que mudou nesta versão.'}
              </span>
            )}
            {/* Cancelar com contorno: mesma gramática dos outros rodapés da Arte. */}
            <button onClick={() => setShowBookModal(false)}
              style={{ height: 40, padding: '0 16px', borderRadius: 8, background: '#ffffff', border: '1px solid #e7e5e4', color: '#57534e', fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'color 0.12s' }}
              onMouseEnter={e => { e.currentTarget.style.color = '#1c1917'; }}
              onMouseLeave={e => { e.currentTarget.style.color = '#57534e'; }}
            >Cancelar</button>
            {/* Filled — Salvar book */}
            <button
              onClick={() => saveBookMutation.mutate()}
              disabled={!bookFileUrl || bookSelectedIds.size === 0 || bookComentarioFalta || saveBookMutation.isPending}
              title={!bookFileUrl ? 'Adicione o arquivo PDF antes de salvar' : bookSelectedIds.size === 0 ? 'Selecione ao menos uma peça' : bookComentarioFalta ? 'Este evento já tem book — escreva o que mudou nesta versão' : undefined}
              style={{
                // Tinta chapada, 40px — a altura do Cancelar ao lado (eram 38 e
                // 40 no mesmo rodapé) e sem gradiente/sombra, como os outros
                // primários da tela.
                height: 40, padding: '0 20px', borderRadius: 8, border: 'none',
                background: (!bookFileUrl || bookSelectedIds.size === 0 || bookComentarioFalta || saveBookMutation.isPending) ? '#e7e5e4' : '#1c1917',
                color: (!bookFileUrl || bookSelectedIds.size === 0 || bookComentarioFalta || saveBookMutation.isPending) ? '#57534e' : '#fff',
                fontSize: 13, fontWeight: 700, cursor: (!bookFileUrl || bookSelectedIds.size === 0 || bookComentarioFalta) ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', gap: 7, transition: 'filter 0.12s',
              }}
              onMouseEnter={e => { if (bookFileUrl && bookSelectedIds.size > 0 && !bookComentarioFalta) e.currentTarget.style.filter = 'brightness(1.15)'; }}
              onMouseLeave={e => { e.currentTarget.style.filter = 'brightness(1)'; }}
            >
              {saveBookMutation.isPending
                ? <><div aria-hidden="true" style={{ width: 13, height: 13, borderRadius: '50%', border: '2px solid #d6d3d1', borderTopColor: '#57534e', animation: 'spin 0.8s linear infinite' }} />Salvando…</>
                : existingBookUrl
                  ? <><RefreshCw style={{ width: 13, height: 13 }} />{`Atualizar book — ${bookSelectedIds.size} peça${bookSelectedIds.size !== 1 ? 's' : ''}`}</>
                  : <><FileText style={{ width: 13, height: 13 }} />{`Salvar book — ${bookSelectedIds.size} peça${bookSelectedIds.size !== 1 ? 's' : ''}`}</>
              }
            </button>
            </div>
          </ModalFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* MODAL 5 — ENVIO DE THUMBS EM LOTE                                  */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <Dialog open={showBulkThumbModal} onOpenChange={(open) => { if (!open) closeBulkThumbModal(); }}>
        <DialogContent
          className={cn("p-0 gap-0", HIDE_NATIVE_CLOSE)}
          // O teto e a coluna flex vêm do `modalSurface` (a conta está lá). A
          // única coisa sobrescrita é a UNIDADE no celular: o corpo daqui tinha
          // um teto de 85dvh porque a barra de endereço do Chrome come ~60px que
          // o `vh` finge que existem — sem o `dvh` o rodapé com "Enviar thumbs"
          // ficaria atrás dela. O desconto de 48 (24 em cima, 24 embaixo) é o
          // mesmo da casa.
          style={{ ...modalSurface(980), maxHeight: isMobile ? "calc(100dvh - 48px)" : "calc(100vh - 48px)" }}
          // 40 imagens vinculadas e conferidas sumiam com um clique no overlay.
          onInteractOutside={e => { if (bulkThumbRunning || bulkThumbPendentes > 0) e.preventDefault(); }}
        >
          <DialogTitle className="sr-only">Envio de thumbs em lote</DialogTitle>
          <DialogDescription className="sr-only">Envio em lote de miniaturas de aprovação</DialogDescription>

          <ModalHeader
            icon={Upload}
            tint="#ea580c"
            title="Envio de thumbs em lote"
            subtitle="O vínculo é automático pelo número no nome do arquivo — ex.: 0277_aplique.jpg"
            onClose={() => closeBulkThumbModal()}
          />

          {/* ── Body — 2 colunas no desktop; empilhado e rolável no mobile ──
              ALTURA: cabeçalho 93 + corpo de altura FIXA 520 no desktop = 613px,
              sem teto nenhum acima disso. Numa janela de 445 o Radix cortava
              108px em cima e 108 embaixo ao mesmo tempo — sumiam o título e a
              barra com "Enviar thumbs" juntos.
              Os 520 continuam sendo a altura DESEJADA do desenho de duas
              colunas; `flex: 0 1 auto` + `minHeight: 0` é o que deixa este bloco
              encolher abaixo deles quando o teto do `modalSurface` (100vh − 48)
              aperta. As colunas internas já rolam sozinhas. */}
          <div style={{
            display: 'flex',
            flexDirection: isMobile ? 'column' : 'row',
            height: isMobile ? undefined : 520,
            flex: isMobile ? '1 1 auto' : '0 1 auto',
            minHeight: 0,
            overflow: isMobile ? 'auto' : 'visible',
          }}>

            {/* ══════════════════════════════════════
                Left panel — upload + controles
            ══════════════════════════════════════ */}
            <div style={{ width: isMobile ? '100%' : 264, flexShrink: 0, borderRight: isMobile ? 'none' : '1px solid #ebe8e3', borderBottom: isMobile ? '1px solid #ebe8e3' : 'none', display: 'flex', flexDirection: 'column', backgroundColor: '#fafaf9' }}>

              {/* ── Drop zone ── */}
              <div style={{ padding: '18px 18px 14px' }}>
                <input id="bulk-thumb-input" type="file" accept="image/*" multiple className="sr-only"
                  onChange={e => { if (e.target.files) handleBulkThumbFilesAdded(e.target.files); e.target.value = ''; }} />
                {/* role/tabIndex/onKeyDown: um <div onClick> não é focável e o
                    input que ele dispara estava em display:none — a zona de
                    maior alavancagem do modal era exclusiva de mouse. O padrão
                    acessível já existia nos cards do book e nos stat cards. */}
                <div
                  role="button"
                  tabIndex={0}
                  aria-label="Adicionar imagens para envio em lote"
                  data-testid="dropzone-bulk-thumb"
                  style={{
                    padding: '20px 12px 18px', borderRadius: 12,
                    background: isDragOverBulk ? 'linear-gradient(135deg,#f0fdf4,#dcfce7)' : '#ffffff',
                    border: isDragOverBulk ? '2px dashed #16a34a' : '2px dashed #d4d4d0',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, cursor: 'pointer',
                    transition: 'all 0.15s',
                    boxShadow: isDragOverBulk ? '0 0 0 4px rgba(22,163,74,0.08)' : 'none',
                  }}
                  onDragOver={e => { e.preventDefault(); setIsDragOverBulk(true); }}
                  onDragEnter={e => { e.preventDefault(); setIsDragOverBulk(true); }}
                  // Ignora o dragleave dos filhos — o verde piscava ao mirar o texto.
                  onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setIsDragOverBulk(false); }}
                  onDrop={e => { e.preventDefault(); setIsDragOverBulk(false); if (e.dataTransfer.files.length) handleBulkThumbFilesAdded(e.dataTransfer.files); }}
                  onClick={() => { const inp = document.getElementById('bulk-thumb-input') as HTMLInputElement; inp?.click(); }}
                  onKeyDown={e => {
                    if (e.key !== 'Enter' && e.key !== ' ') return;
                    e.preventDefault();
                    (document.getElementById('bulk-thumb-input') as HTMLInputElement | null)?.click();
                  }}
                >
                  {/* Chapado e neutro, como as outras zonas de upload da tela:
                      o gradiente laranja com sombra colorida só ganhava do
                      conteúdo. Ao arrastar, o verde continua dizendo "solte". */}
                  <div style={{
                    width: 44, height: 44, borderRadius: 10,
                    background: isDragOverBulk ? '#15803d' : '#1c1917',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'background-color 0.15s',
                  }}>
                    <Upload aria-hidden="true" style={{ width: 20, height: 20, color: '#fff' }} />
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: isDragOverBulk ? '#15803d' : '#1c1917', margin: '0 0 2px' }}>
                      {isDragOverBulk ? 'Solte aqui' : 'Arrastar ou clicar'}
                    </p>
                    <p style={{ fontSize: 11, color: '#57534e', margin: 0, letterSpacing: '0.03em' }}>JPG · PNG · WEBP · SVG</p>
                  </div>
                </div>
              </div>

              {/* ── Divider ── */}
              <div style={{ margin: '0 18px', borderTop: '1px solid #ebe8e3' }} />

              {/* ── Event filter ── */}
              <div style={{ padding: '14px 18px 0' }}>
                <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#57534e', margin: '0 0 6px' }}>Evento</p>
                <div style={{ width: '100%' }}>
                  <EventFilterDropdown
                    value={bulkThumbEventFilter}
                    onChange={setBulkThumbEventFilter}
                    allLabel="Todos os eventos"
                    options={bulkThumbEventOptions}
                  />
                </div>
              </div>

              {/* ── Resumo — só aparece quando há arquivos com count > 0 ── */}
              {bulkThumbEntries.length > 0 && (() => {
                const rows = [
                  { label: 'Vinculados',  count: bulkThumbEntries.filter(e => e.matchedItemId && e.status === 'pending').length,  dot: '#16a34a', color: '#15803d', bg: '#f0fdf4', border: '#bbf7d0' },
                  { label: 'Sem vínculo', count: bulkThumbEntries.filter(e => !e.matchedItemId && e.status === 'pending').length, dot: '#f59e0b', color: '#92400e', bg: '#fffbeb', border: '#fde68a' },
                  { label: 'Concluídos',  count: bulkThumbEntries.filter(e => e.status === 'done').length,                        dot: '#7c3aed', color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' },
                  { label: 'Erro',        count: bulkThumbEntries.filter(e => e.status === 'error').length,                       dot: '#dc2626', color: '#b91c1c', bg: '#fef2f2', border: '#fecaca' },
                ].filter(s => s.count > 0);
                if (rows.length === 0) return null;
                return (
                  <div style={{ padding: '14px 18px 0' }}>
                    <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#57534e', margin: '0 0 8px' }}>Resumo</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {rows.map(s => (
                        <div key={s.label} style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '6px 10px', borderRadius: 6,
                          backgroundColor: s.bg, border: `1px solid ${s.border}`,
                          transition: 'all 0.15s',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                            <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: s.dot, flexShrink: 0 }} />
                            <span style={{ fontSize: 11, fontWeight: 600, color: s.color }}>{s.label}</span>
                          </div>
                          <span style={{ fontSize: 14, fontWeight: 800, color: s.color, fontFamily: '"Space Grotesk", sans-serif', lineHeight: 1 }}>{s.count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Spacer */}
              <div style={{ flex: 1 }} />
            </div>

            {/* ══════════════════════════════════════
                Right panel — lista de arquivos
            ══════════════════════════════════════ */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', backgroundColor: '#f7f6f5' }}>
              {bulkThumbEntries.length === 0 ? (
                /* ── Empty state ── */
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
                  {/* Ladrilho neutro: o gradiente laranja com sombra a 40% de
                      opacidade era um objeto "apagado" de propósito, e parecia
                      um botão desabilitado. */}
                  <div style={{ width: 56, height: 56, borderRadius: 14, background: '#ffffff', border: '1px solid #e7e5e4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Upload aria-hidden="true" style={{ width: 24, height: 24, color: '#746e69' }} />
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <p style={{ fontSize: 15, fontWeight: 700, color: '#57534e', margin: '0 0 6px' }}>Nenhuma imagem adicionada</p>
                    <p style={{ fontSize: 12, color: '#57534e', margin: 0, maxWidth: 240, lineHeight: 1.6 }}>
                      Arraste para a área {isMobile ? 'acima' : 'ao lado'} ou toque nela para escolher
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                    {['JPG', 'PNG', 'WEBP', 'SVG'].map(f => (
                      <span key={f} style={{ padding: '3px 10px', borderRadius: 999, backgroundColor: '#ebe8e3', fontSize: 11, fontWeight: 700, color: '#57534e', letterSpacing: '0.06em' }}>{f}</span>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  {/* ── Panel header ── */}
                  <div style={{ padding: '11px 18px', borderBottom: '1px solid #ebe8e3', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, backgroundColor: '#ffffff' }}>
                    {/* As quatro pílulas coloridas de contagem saíram daqui: o
                        "Resumo" do painel ao lado mostra os MESMOS quatro números,
                        com as mesmas cores — duas faixas de selos dizendo a mesma
                        coisa a 200px uma da outra. */}
                    <span style={{ fontSize: 13, fontWeight: 800, color: '#1c1917', fontFamily: '"Space Grotesk", sans-serif' }}>
                      {bulkThumbEntries.length} {bulkThumbEntries.length === 1 ? 'arquivo' : 'arquivos'}
                    </span>
                    <span style={{ fontSize: 12, color: '#57534e', fontWeight: 600 }}>Confira o vínculo de cada imagem</span>
                  </div>

                  {/* ── Lista de cards (horizontal) ── */}
                  <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {bulkThumbEntries.map(entry => {
                      // Pool calculado uma vez fora do .map — ver bulkPendingPool.
                      const pendingPool = bulkPendingPool;
                      const matchedItem = entry.matchedItemId ? itemPorId.get(entry.matchedItemId) : undefined;
                      const isLinked = !!entry.matchedItemId;

                      const cardBorderColor = entry.status === 'done' ? '#bbf7d0'
                        : entry.status === 'error' ? '#fecaca'
                        : entry.status === 'uploading' ? '#ddd6fe'
                        : isLinked ? (entry.ambiguous ? '#fcd34d' : '#bfdbfe') : '#fcd34d';
                      const cardAccentBg = entry.status === 'done' ? '#f0fdf4'
                        : entry.status === 'error' ? '#fef2f2'
                        : entry.status === 'uploading' ? '#faf5ff'
                        : isLinked ? (entry.ambiguous ? '#fffbeb' : '#eff6ff') : '#fffbeb';

                      return (
                        <div key={entry.id} data-testid={`bulk-thumb-card-${entry.id}`} style={{
                          display: 'flex', alignItems: 'stretch', gap: 0,
                          // flexShrink 0 + minHeight: a lista é uma coluna flex de altura
                          // fixa, e o cartão tem overflow hidden — com 20+ arquivos o
                          // navegador ESPREMIA todos em tirinhas em vez de rolar (dono, 21/09).
                          flexShrink: 0, minHeight: 80,
                          borderRadius: 12, border: `1.5px solid ${cardBorderColor}`,
                          backgroundColor: '#ffffff',
                          overflow: 'hidden', position: 'relative',
                          boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                          transition: 'box-shadow 0.12s',
                        }}>
                          {/* ── Thumbnail quadrado ── */}
                          <div style={{ position: 'relative', width: 80, flexShrink: 0, backgroundColor: '#f3f4f3' }}>
                            <img loading="lazy" decoding="async" src={entry.preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', minHeight: 80 }} />
                            {/* Status pill */}
                            <div style={{ position: 'absolute', bottom: 4, left: 0, right: 0, display: 'flex', justifyContent: 'center' }}>
                              {entry.status === 'done' && (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 6px', borderRadius: 999, backgroundColor: '#15803d', color: '#ffffff', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }}>
                                  <CheckCircle style={{ width: 8, height: 8 }} /> OK
                                </span>
                              )}
                              {entry.status === 'uploading' && (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 6px', borderRadius: 999, backgroundColor: '#7c3aed', color: '#ffffff', fontSize: 10, fontWeight: 700, boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }}>
                                  <div style={{ width: 7, height: 7, borderRadius: '50%', border: '1.5px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', animation: 'spin 0.8s linear infinite' }} />
                                </span>
                              )}
                              {entry.status === 'error' && (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 6px', borderRadius: 999, backgroundColor: '#dc2626', color: '#ffffff', fontSize: 10, fontWeight: 700, boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }}>
                                  Erro
                                </span>
                              )}
                              {entry.status === 'pending' && (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 6px', borderRadius: 999, backgroundColor: isLinked ? '#1d4ed8' : '#d97706', color: '#ffffff', fontSize: 10, fontWeight: 700, boxShadow: '0 1px 4px rgba(0,0,0,0.2)', whiteSpace: 'nowrap' }}>
                                  {isLinked ? '✓' : '?'}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* ── Card info ── */}
                          <div style={{ flex: 1, padding: '10px 12px', borderLeft: `3px solid ${cardBorderColor}`, backgroundColor: cardAccentBg, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minWidth: 0 }}>
                            {/* Top row: filename + remove */}
                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6, marginBottom: 6 }}>
                              <div style={{ minWidth: 0 }}>
                                <p style={{ fontSize: 12, fontWeight: 700, color: '#1c1917', margin: '0 0 1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={entry.file.name}>
                                  {entry.file.name}
                                </p>
                                <p style={{ fontSize: 11, color: '#57534e', margin: 0 }}>
                                  {(entry.file.size / 1024).toFixed(0)} KB
                                </p>
                              </div>
                              {(entry.status === 'pending' || entry.status === 'error') && (
                                <button
                                  onClick={() => setBulkThumbEntries(prev => prev.filter(e => {
                                    if (e.id !== entry.id) return true;
                                    URL.revokeObjectURL(e.preview); // libera o blob do preview
                                    return false;
                                  }))}
                                  aria-label={`Remover ${entry.file.name}`}
                                  style={{ flexShrink: 0, width: 32, height: 32, borderRadius: '50%', backgroundColor: '#f5f5f4', border: '1px solid #e7e5e4', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.12s' }}
                                  onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#fef2f2'; e.currentTarget.style.borderColor = '#fecaca'; }}
                                  onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#f5f5f4'; e.currentTarget.style.borderColor = '#e7e5e4'; }}
                                >
                                  <X style={{ width: 13, height: 13, color: '#57534e' }} />
                                </button>
                              )}
                            </div>

                            {/* ── State-specific content ── */}
                            {entry.status === 'done' ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 8px', borderRadius: 6, backgroundColor: '#dcfce7', border: '1px solid #bbf7d0' }}>
                                <CheckCircle style={{ width: 11, height: 11, color: '#16a34a', flexShrink: 0 }} />
                                <p style={{ fontSize: 11, fontWeight: 700, color: '#15803d', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {matchedItem?.displayId} · {matchedItem?.type?.slice(0, 28)}
                                </p>
                              </div>
                            ) : entry.status === 'uploading' ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', borderRadius: 6, backgroundColor: '#f5f3ff', border: '1px solid #ddd6fe' }}>
                                <div style={{ width: 11, height: 11, borderRadius: '50%', border: '2px solid #ddd6fe', borderTopColor: '#7c3aed', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
                                <span style={{ fontSize: 11, color: '#7c3aed', fontWeight: 600 }}>Enviando...</span>
                              </div>
                            ) : entry.status === 'error' ? (
                              <div style={{ padding: '5px 8px', borderRadius: 6, backgroundColor: '#fef2f2', border: '1px solid #fecaca' }}>
                                <p style={{ fontSize: 11, fontWeight: 700, color: '#dc2626', margin: '0 0 1px' }}>Falha no envio</p>
                                <p style={{ fontSize: 11, color: '#b91c1c', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.errorMsg}</p>
                              </div>
                            ) : isLinked && matchedItem ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <div style={{ flex: 1, padding: '5px 8px', borderRadius: 6, backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', minWidth: 0 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                    <span style={{ fontSize: 11, fontWeight: 800, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: '0.04em', flexShrink: 0 }}>{matchedItem.displayId}</span>
                                    <span style={{ fontSize: 11, fontWeight: 700, color: '#1e3a5f', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{matchedItem.type}</span>
                                  </div>
                                  {matchedItem.event?.name && (
                                    <p style={{ fontSize: 11, color: '#1d4ed8', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{matchedItem.event.name}</p>
                                  )}
                                  {/* Peça da CORREÇÃO não tem rascunho: os dois
                                      botões do rodapé a reenviam (ver o title de
                                      "Salvar como rascunho"). Dito no card,
                                      antes do clique (rodada 4). */}
                                  {(correcaoItems as any[]).some((c: any) => c.id === matchedItem.id) && (
                                    <p data-testid={`aviso-correcao-no-lote-${entry.id}`} style={{ fontSize: 11, fontWeight: 700, color: '#991b1b', margin: '3px 0 0' }}>
                                      Na Correção — vai como nova versão
                                    </p>
                                  )}
                                  {/* O nome do arquivo tinha mais de um número
                                      candidato (ou um que parece ano): o vínculo
                                      foi feito pelo último, que é a convenção,
                                      mas concentra a atenção onde ela vale. */}
                                  {entry.ambiguous && (
                                    <p data-testid={`aviso-vinculo-duvidoso-${entry.id}`} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: '#92400e', margin: '3px 0 0' }}>
                                      <AlertTriangle style={{ width: 10, height: 10, flexShrink: 0 }} />
                                      Confira este vínculo
                                    </p>
                                  )}
                                </div>
                                <button
                                  onClick={() => setBulkThumbEntries(prev => prev.map(en => en.id === entry.id ? { ...en, matchedItemId: null, ambiguous: false } : en))}
                                  title="Trocar vínculo"
                                  aria-label={`Trocar a peça vinculada a ${entry.file.name}`}
                                  // 32px de alvo: com padding de 4px o botão tinha ~22.
                                  style={{ flexShrink: 0, minHeight: 32, background: '#ffffff', border: '1px solid #bfdbfe', borderRadius: 6, padding: '0 10px', cursor: 'pointer', color: '#1d4ed8', fontSize: 12, fontWeight: 700, transition: 'all 0.12s' }}
                                  onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#eff6ff'; }}
                                  onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#ffffff'; }}
                                >Trocar</button>
                              </div>
                            ) : (
                              /* ── Sem vínculo: combobox pesquisável com grupos ── */
                              <div>
                                {(() => {
                                  const linked = entry.matchedItemId ? itemPorId.get(entry.matchedItemId) : undefined;
                                  const isOpen = !!bulkThumbLinkOpenMap[entry.id];
                                  // Agrupar por grupo/tipo
                                  const grouped = pendingPool.reduce((acc: Record<string, any[]>, item: any) => {
                                    const g = groupOf(item.type) || item.type;
                                    if (!acc[g]) acc[g] = [];
                                    acc[g].push(item);
                                    return acc;
                                  }, {});
                                  const groupKeys = Object.keys(grouped).sort();
                                  return (
                                    <Popover
                                      open={isOpen}
                                      onOpenChange={open => setBulkThumbLinkOpenMap(prev => ({ ...prev, [entry.id]: open }))}
                                    >
                                      <PopoverTrigger asChild>
                                        <button style={{
                                          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4,
                                          height: 32, borderRadius: 6,
                                          border: `1px solid ${isLinked ? '#93c5fd' : '#e7e5e4'}`,
                                          backgroundColor: '#ffffff', fontSize: 11, fontWeight: 600,
                                          color: linked ? '#1c1917' : '#746e69', padding: '0 8px', cursor: 'pointer',
                                        }}>
                                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {linked
                                              ? `${linked.displayId} · ${linked.type}`
                                              : 'Selecionar peça...'}
                                          </span>
                                          <ChevronsUpDown style={{ width: 10, height: 10, color: '#57534e', flexShrink: 0 }} />
                                        </button>
                                      </PopoverTrigger>
                                      <PopoverContent className="p-0" style={{ width: isMobile ? '90vw' : 320 }} align="start">
                                        <Command>
                                          <CommandInput placeholder="Buscar por ID, tipo ou descrição..." />
                                          <CommandList style={{ maxHeight: 280 }}>
                                            <CommandEmpty>Nenhuma peça encontrada.</CommandEmpty>
                                            {pendingPool.length === 0 && (
                                              <div style={{ padding: '9px 16px', fontSize: 11, color: '#b45309', fontWeight: 600, lineHeight: 1.5 }}>
                                                Nenhuma peça pronta para receber thumb
                                                {bulkThumbEventFilter !== "all" ? " neste evento" : ""}.
                                                <span style={{ display: 'block', fontWeight: 500, color: '#57534e', marginTop: 4 }}>
                                                  Só aparecem peças aguardando envio ou em correção. Se a peça é nova,
                                                  ela precisa passar antes por <b>Vincular Patrocinadores</b>.
                                                  {bulkThumbEventFilter !== "all" && " Você também pode trocar o filtro de evento para 'Todos'."}
                                                </span>
                                              </div>
                                            )}
                                            {entry.matchedItemId && (
                                              <CommandGroup heading="Selecionado">
                                                <CommandItem
                                                  value="clear"
                                                  onSelect={() => {
                                                    setBulkThumbEntries(prev => prev.map(en => en.id === entry.id ? { ...en, matchedItemId: null, ambiguous: false } : en));
                                                    setBulkThumbLinkOpenMap(prev => ({ ...prev, [entry.id]: false }));
                                                  }}
                                                >
                                                  <X style={{ width: 10, height: 10, marginRight: 6, flexShrink: 0, color: '#dc2626' }} />
                                                  <span style={{ color: '#dc2626', fontSize: 11 }}>Remover vínculo</span>
                                                </CommandItem>
                                              </CommandGroup>
                                            )}
                                            {groupKeys.map(groupKey => (
                                              <CommandGroup key={groupKey} heading={groupKey}>
                                                {grouped[groupKey].map((item: any) => {
                                                  const evtName = (events as any[]).find(e => e.id === item.eventId)?.name || '';
                                                  const searchVal = `${item.displayId} ${item.type} ${item.description || ''} ${evtName}`;
                                                  return (
                                                    <CommandItem
                                                      key={item.id}
                                                      value={searchVal}
                                                      className="data-[selected=true]:bg-stone-100 data-[selected=true]:text-stone-900"
                                                      onSelect={() => {
                                                        setBulkThumbEntries(prev => prev.map(en => en.id === entry.id ? { ...en, matchedItemId: item.id, ambiguous: false } : en));
                                                        setBulkThumbLinkOpenMap(prev => ({ ...prev, [entry.id]: false }));
                                                      }}
                                                    >
                                                      <Check style={{ width: 10, height: 10, color: '#16a34a', opacity: entry.matchedItemId === item.id ? 1 : 0, marginRight: 4, flexShrink: 0 }} />
                                                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden', minWidth: 0 }}>
                                                        {/* displayId — destaque */}
                                                        <span style={{ fontSize: 11, fontWeight: 800, color: '#1c1917', fontFamily: '"Space Grotesk", sans-serif', flexShrink: 0 }}>{item.displayId}</span>
                                                        {/* descrição ou evento — o tipo já aparece no cabeçalho do grupo */}
                                                        {(item.description || evtName) && (
                                                          <span style={{ fontSize: 11, color: '#57534e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                            {item.description ? item.description.slice(0, 48) : evtName}
                                                          </span>
                                                        )}
                                                      </div>
                                                    </CommandItem>
                                                  );
                                                })}
                                              </CommandGroup>
                                            ))}
                                          </CommandList>
                                        </Command>
                                      </PopoverContent>
                                    </Popover>
                                  );
                                })()}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* ── Rodapé unificado — ocupa toda a largura do modal ── */}
          {(() => {
            const readyCount = bulkThumbEntries.filter(e => e.matchedItemId && e.status === 'pending').length;
            const doneCount  = bulkThumbEntries.filter(e => e.status === 'done').length;
            const isDisabled = bulkThumbRunning || readyCount === 0;
            const pctLote = bulkThumbProgress.total > 0
              ? Math.round((bulkThumbProgress.feitos / bulkThumbProgress.total) * 100)
              : 0;
            return (
              <div style={{
                borderTop: '1px solid #ebe8e3', padding: isMobile ? '12px 16px' : '12px 24px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                // Quebra no celular: a fileira da direita (Cancelar + dois botões
                // com a contagem no rótulo) pedia ~480px e, sem quebra, o
                // "Enviar N thumbs" saía pela borda do modal em 390px.
                flexWrap: isMobile ? 'wrap' : 'nowrap',
                backgroundColor: '#ffffff', borderRadius: '0 0 16px 16px', flexShrink: 0,
                position: 'relative',
              }}>
                {/* Progresso GLOBAL do lote. 60 imagens de alguns MB levam
                    minutos e o único sinal era o estado de cada card, que sai da
                    vista assim que a lista rola. */}
                {bulkThumbRunning && bulkThumbProgress.total > 0 && (
                  <div
                    role="progressbar"
                    aria-valuenow={bulkThumbProgress.feitos}
                    aria-valuemin={0}
                    aria-valuemax={bulkThumbProgress.total}
                    aria-label="Progresso do envio em lote"
                    data-testid="progress-bulk-thumb"
                    style={{ position: 'absolute', top: 0, left: 0, right: 0, display: 'flex', flexDirection: 'column' }}
                  >
                    <div style={{ height: 4, background: '#e7e5e4' }}>
                      <div style={{ height: '100%', width: `${pctLote}%`, background: '#15803d', transition: 'width 0.2s' }} />
                    </div>
                  </div>
                )}
                {/* Esquerda: progresso ou limpar concluídos */}
                <div>
                  {bulkThumbRunning && bulkThumbProgress.total > 0 && (
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#15803d' }}>
                      Enviando {bulkThumbProgress.feitos} de {bulkThumbProgress.total} ({pctLote}%)
                    </span>
                  )}
                  {doneCount > 0 && (
                    <button
                      onClick={() => setBulkThumbEntries(prev => prev.filter(e => {
                        if (e.status !== 'done') return true;
                        URL.revokeObjectURL(e.preview);
                        return false;
                      }))}
                      style={{ height: 36, padding: '0 14px', borderRadius: 6, background: 'none', border: '1px solid #e7e5e4', color: '#57534e', cursor: 'pointer', fontSize: 12, fontWeight: 600, transition: 'background 0.12s' }}
                      onMouseEnter={e => { e.currentTarget.style.background = '#f5f5f4'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
                    >Limpar {doneCount} enviado{doneCount !== 1 ? 's' : ''}</button>
                  )}
                </div>

                {/* Direita: Cancelar → Salvar rascunho → Enviar */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: isMobile ? 'wrap' : 'nowrap', justifyContent: 'flex-end', width: isMobile ? '100%' : undefined }}>
                  {/* Cancelar com contorno, como nos outros rodapés da Arte. */}
                  <button
                    onClick={() => closeBulkThumbModal()}
                    aria-disabled={bulkThumbRunning}
                    style={{ height: isMobile ? 44 : 40, padding: '0 16px', borderRadius: 8, background: '#ffffff', border: '1px solid #e7e5e4', color: '#57534e', cursor: bulkThumbRunning ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600, transition: 'color 0.12s', opacity: bulkThumbRunning ? 0.5 : 1 }}
                    onMouseEnter={e => { e.currentTarget.style.color = '#1c1917'; }}
                    onMouseLeave={e => { e.currentTarget.style.color = '#57534e'; }}
                  >
                    {/* Com tudo processado não há o que cancelar (rodada 4):
                        "Cancelar" ao lado de cards "OK" fazia perguntar se
                        fechar desfazia o envio. Não desfaz. */}
                    {bulkThumbEntries.length > 0 && bulkThumbPendentes === 0 && !bulkThumbRunning ? 'Fechar' : 'Cancelar'}
                  </button>

                  {/* Contorno NEUTRO — Salvar como rascunho (secundário). Era
                      roxo, e disputava com o primário ao lado. */}
                  <button
                    onClick={handleBulkThumbSaveDraft}
                    disabled={isDisabled}
                    data-testid="button-bulk-thumb-save-draft"
                    // O title prometia "sem enviar" para TODAS as imagens, mas
                    // peça da Correção não tem rascunho: runBulkThumb a manda
                    // pelo reenvio nos dois botões. O texto passa a dizer o
                    // que acontece de fato (rodada 4) — a regra não mudou.
                    title="Peça aguardando envio: só salva o thumb, sem enviar — ela continua na fila como rascunho. Peça da Correção não tem rascunho: a imagem vai como nova versão para quem ainda não aprovou."
                    style={{
                      height: isMobile ? 44 : 40, padding: '0 16px', borderRadius: 8,
                      backgroundColor: '#ffffff',
                      border: '1px solid #d6d3d1',
                      color: isDisabled ? '#746e69' : '#44403c',
                      opacity: isDisabled ? 0.7 : 1,
                      fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      flex: isMobile ? '1 1 auto' : undefined,
                      cursor: isDisabled ? 'not-allowed' : 'pointer', transition: 'all 0.15s',
                    }}
                    onMouseEnter={e => { if (!isDisabled) e.currentTarget.style.backgroundColor = '#fafaf9'; }}
                    onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#ffffff'; }}
                  >
                    <FileImage aria-hidden="true" style={{ width: 13, height: 13 }} />
                    {/* Sem nada vinculado o botão dizia "Salvar 0 thumbs": o zero
                        não informa, só ocupa espaço. O rótulo limpo já basta,
                        porque o botão está desabilitado de qualquer forma. */}
                    {readyCount > 0
                      ? `Salvar ${readyCount} ${readyCount === 1 ? 'thumb' : 'thumbs'} como rascunho`
                      : 'Salvar como rascunho'}
                  </button>

                  {/* Filled primary — Enviar */}
                  <button
                    onClick={handleBulkThumbUpload}
                    disabled={isDisabled}
                    data-testid="button-bulk-thumb-confirm"
                    // "Enviar N thumbs" não dizia PARA ONDE (rodada 4). O
                    // rótulo diz o destino; o title, o caso da Correção, que
                    // vai pelo reenvio e não por um envio novo.
                    title="Sobe cada imagem e manda a peça para a aprovação do patrocinador. Peça que está na Correção recebe a imagem como nova versão e volta para quem ainda não aprovou."
                    style={{
                      height: isMobile ? 44 : 40, padding: '0 20px', borderRadius: 8,
                      // TINTA, como os outros primários da Arte: verde nesta
                      // tela é o ESTADO "enviado" dos cards logo acima, e o
                      // botão que ainda vai enviar vestia a cor do resultado.
                      background: isDisabled ? '#e7e5e4' : '#1c1917',
                      border: 'none',
                      color: isDisabled ? '#57534e' : '#ffffff',
                      fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                      flex: isMobile ? '1 1 auto' : undefined,
                      cursor: isDisabled ? 'not-allowed' : 'pointer',
                      transition: 'background-color 0.15s',
                    }}
                    onMouseEnter={e => { if (!isDisabled) e.currentTarget.style.backgroundColor = '#44403c'; }}
                    onMouseLeave={e => { if (!isDisabled) e.currentTarget.style.backgroundColor = '#1c1917'; }}
                  >
                    {bulkThumbRunning
                      ? <><div aria-hidden="true" style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid #d6d3d1', borderTopColor: '#57534e', animation: 'spin 0.8s linear infinite' }} />Enviando…</>
                      : <><Send aria-hidden="true" style={{ width: 14, height: 14 }} />{readyCount > 0 ? `Enviar ${readyCount} para aprovação` : 'Enviar para aprovação'}</>
                    }
                  </button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      </div>
    </div>
  );
}
