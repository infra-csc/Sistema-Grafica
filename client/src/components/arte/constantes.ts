// Constantes e regrinhas de módulo da tela da Arte — fora dos componentes
// para não serem recriadas a cada render (várias entram em deps de useMemo).
import type React from "react";
import { statusDasEtapas } from "@shared/fluxo-peca";
import { diasNaFase } from "@/lib/idade-na-fase";
import { alvo } from "@/hooks/use-mobile";
import { T, TOM, R, FS, FONT } from "@/lib/theme";
import { getStatusLabel, getStatusMeta, P } from "@/lib/status";
import type { TomDoSelo } from "@/components/ui/selo";
import type { PecaDaArte } from "./tipos";

// Quantas linhas a tabela monta por vez. O resto entra por "Carregar mais".
export const ARTE_PAGE_SIZE = 100;

// VAZIO ESTÁVEL para o `data` das queries enquanto carregam: `= []` criava um
// array novo a cada render e invalidava toda a cadeia de memos (allItems,
// baldes, facetas) em cada render do carregamento.
export const SEM_DADOS: never[] = [];

// ── A LISTA DESTA TELA VEM RECORTADA NO SERVIDOR (perf, 2ª rodada) ──────────
//
// A Arte lia ["/api/items"] — o acervo inteiro, 5 mil peças e 15 MB em
// produção — para mostrar cinco filas. Agora pede GET /api/items?status=, o
// mesmo caminho que a Revisão Final já usava: delta, formato compacto e a
// chave DENTRO do prefixo "/api/items", para que toda invalidação por prefixo
// (WebSocket, mutações desta tela) continue alcançando a lista.
//
// QUAIS STATUS. Os das quatro abas de status (TAB_STATUSES), mas escritos
// pelas ETAPAS canônicas de shared/fluxo-peca em vez de status soltos: a etapa
// carrega junto as grafias LEGADAS que ainda circulam no banco
// (`produzido`, `conferido`, `entregue`, `em_producao`, `liberado`…). O
// conjunto é, por construção, um SUPERCONJUNTO de TAB_STATUSES — nenhuma aba
// perde linha, e uma peça gravada com grafia legada que hoje cairia fora do
// balde chega à tela em vez de sumir na rede.
//
// SÃO DOIS RECORTES, e não um. Medido: as três filas de TRABALHO desta tela
// (aguardando envio, aguardando patrocinador, finalizar arte) são ~19% do
// acervo; a aba FINALIZADOS — da revisão final até a entrega — é todo o resto,
// e em produção 3.105 das 5.128 peças estão entregues. Pedir as duas coisas na
// mesma chamada faz a tela de trabalho esperar pelo arquivo morto.
//
// As duas descem em PARALELO, e é por isso que nenhuma contagem muda: as cinco
// abas continuam contando sobre a lista inteira assim que as duas chegam —
// exatamente como já acontecia enquanto o acervo único descia. O que muda é
// que as filas de trabalho PINTAM antes, sem esperar pelas entregues, e que o
// servidor monta duas respostas menores em vez de uma que trava o event loop.
//
// O QUE FICA DE FORA DAS DUAS, e é o ganho de rede: Rascunho/Solicitada
// (`requested`, `draft`) e Vinculação (`awaiting_linking`) — que são as filas
// da Solicitação e da Vinculação, nunca desenhadas aqui — e tudo que saiu do
// funil (`canceled`, `archived`). A aba Correção continua vindo da rota
// própria (/api/items/resubmission-needed), que já é recortada no banco.
export const ARTE_ETAPAS_DE_TRABALHO = [
  "awaiting_submission",     // aba "Aguardando envio"
  "awaiting_approval",       // aba "Aguardando patrocinador"
  "awaiting_finalization",   // aba "Finalizar arte"
] as const;
export const ARTE_ETAPAS_FINALIZADAS = [
  "awaiting_final_review", "ready_for_production", "approved",
  "inProduction", "produced", "conferred", "packed", "delivered",
] as const;
export const CHAVE_DAS_FILAS_DA_ARTE = ["/api/items", `?status=${statusDasEtapas(...ARTE_ETAPAS_DE_TRABALHO).join(",")}`] as const;
export const CHAVE_DOS_FINALIZADOS = ["/api/items", `?status=${statusDasEtapas(...ARTE_ETAPAS_FINALIZADAS).join(",")}`] as const;

// "Quem está travando": só os piores ficam à vista (mesma cura da régua de
// eventos logo abaixo). Em produção a faixa chegou a 40+ marcas com o mesmo
// peso visual — "design péssimo" (dono, 26/08); o olho não tinha onde pousar.
export const TRAVANDO_CHIPS_VISIBLE = 8;

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
export const PARADA_HA_MAIS_DE = 7;
export const estaParada = (item: PecaDaArte, hoje: Date) => (diasNaFase(item, hoje) ?? -1) > PARADA_HA_MAIS_DE;

/**
 * Tom de cada aba (o contador do <Abas> veste esta cor). DERIVA da cor do
 * status da fase em lib/status.ts: a aba "Finalizar arte" era ciano enquanto
 * o selo de `awaiting_creator_review` é roxo — duas cores para a mesma fase.
 * A Correção não tem status próprio (vem de outra rota) e é devolução: perigo.
 */
export const STATUS_DA_ABA: Record<string, string> = {
  "criar-aprovacoes": "awaiting_submission",
  "aguardando-patrocinador": "awaiting_sponsor_approval",
  "finalizar-layouts": "awaiting_creator_review",
  "finalizados": "approved",
};
export const TOM_DA_PALETA: Array<[{ bg: string }, TomDoSelo]> = [
  [P.purple, "roxo"], [P.amber, "alerta"], [P.sky, "ceu"], [P.blue, "info"],
  [P.teal, "turquesa"], [P.green, "sucesso"], [P.red, "perigo"], [P.cyan, "ciano"],
  [P.emerald, "esmeralda"], [P.orange, "laranja"], [P.neutral, "neutro"],
];
export function tomDaAba(tabId: string): TomDoSelo {
  if (tabId === "correcao") return "perigo";
  const meta = getStatusMeta(STATUS_DA_ABA[tabId]);
  return TOM_DA_PALETA.find(([pal]) => pal.bg === meta.bg)?.[1] ?? "neutro";
}

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
export const GUIA_DA_FASE: Record<string, string> = {
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
export function semaforoPrazo(diff: number): { bg: string; border: string; text: string } {
  if (diff < 0) return { bg: TOM.perigo.bg, border: TOM.perigo.border, text: TOM.perigo.text };
  if (diff === 0) return { bg: TOM.alerta.bg, border: TOM.alerta.border, text: TOM.alerta.text };
  if (diff <= 3) return { bg: TOM.laranja.bg, border: TOM.laranja.border, text: T.accentText };
  // Dentro do prazo = VERDE (dono, 17/09: "com base se passou ou não do
  // prazo"). Era cinza, e o marco folgado se lia como "sem informação" ao lado
  // do vermelho — agora a faixa diz de relance o que passou e o que não.
  // #166534 sobre #dcfce7 ≈ 6,5:1 (AA).
  return { bg: TOM.sucesso.bg, border: TOM.sucesso.border, text: TOM.sucesso.text };
}

/**
 * Tecla de atalho desenhada como tecla. Os atalhos desta tela (Ctrl+V para
 * colar o thumb) existiam escritos no meio de frases de rodapé, e quem não lê
 * o rodapé inteiro nunca os descobria. Contraste: #44403c sobre #fafaf9 ≈ 9,9:1.
 */
export const KBD: React.CSSProperties = {
  display: 'inline-block', minWidth: 18, padding: '0 5px', margin: '0 1px',
  borderRadius: 4, border: `1px solid ${T.bdark}`, borderBottomWidth: 2,
  background: T.bg, color: T.strong,
  fontFamily: FONT.mono, fontSize: FS.small, fontWeight: 600,
  lineHeight: '16px', textAlign: 'center',
};

/** Item do menu "⋯" — mesma altura de alvo de toque dos botões da linha. */
export function menuItemStyle(color: string, dedo = false): React.CSSProperties {
  return {
    width: '100%', display: 'flex', alignItems: 'center', gap: 9,
    minHeight: alvo(38, dedo), padding: '0 10px', borderRadius: R.sm,
    background: 'none', border: 'none', cursor: 'pointer',
    fontSize: FS.body, fontWeight: 600, color, textAlign: 'left',
    transition: 'background 0.12s',
  };
}

// Lista estática — fora do componente para não ser recriada a cada render
// (ela entrava nas deps do activeChips e o invalidava sempre).
export const months = [
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
export const ARTE_SORT_OPTIONS = [
  { value: "evento", label: "Evento", pinned: true },
  { value: "prazo", label: "Prazo da fase", pinned: true },
];

// "Mais filtros" (dono, 22/09): à vista ficam a busca, o Evento, o "Saída 10
// dias" e o Ordenar; estes nove recortes moram atrás do botão. Os `kind` são os mesmos de `activeChips`
// — é essa lista que decide o número do botão e quais chips aparecem com a
// faixa fechada. `paradas` e o patrocinador da Correção NÃO entram: os dois
// têm controle próprio fora da barra, que continua à vista.
export const FILTROS_ESCONDIDOS = new Set([
  "sponsor", "type", "material", "month", "period",
  "urgente", "atrasado", "thumb", "final",
]);
export const CHAVE_MAIS_FILTROS = "arte.maisFiltrosAberto";

/**
 * O 409 de submit-for-approval traz a chave crua do status ("Status atual:
 * awaiting_sponsor_approval"). Traduz pelo mesmo dicionário dos selos antes
 * de mostrar — o designer não fala o vocabulário do banco.
 */
export function mensagemDeErro(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e ?? "");
  return msg.replace(/[a-z]+(?:_[a-z]+)+/g, (chave) => {
    const label = getStatusLabel(chave);
    return label === chave ? chave : label;
  });
}

/**
 * O `e.message` de um erro qualquer — o `catch` recebe `unknown`. Sem mensagem
 * (um `throw` de valor que não é erro), `undefined`, como o `e.message` de antes.
 */
export function textoDoErro(e: unknown): string | undefined {
  if (e instanceof Error) return e.message;
  if (typeof e === "object" && e !== null && "message" in e) return String((e as { message: unknown }).message);
  return undefined;
}
