// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTES DA VINCULAÇÃO — os status que a tela mostra, a chave da lista
// recortada no servidor e os rótulos de cada situação.
// ─────────────────────────────────────────────────────────────────────────────
import type { CSSProperties } from "react";
import { statusDasEtapas } from "@shared/fluxo-peca";
import { PRODUCTION_STATUSES } from "@/lib/status";
import { T } from "@/lib/theme";
import type { UIStatus } from "./tipos";

// VAZIO ESTÁVEL para o `data` das queries enquanto carregam: `= []` cria um
// array novo a cada render e invalida a cadeia de memos (visibleItems, mapas,
// facetas) durante todo o carregamento. `never[]` cabe em qualquer lista.
export const VAZIO: never[] = [];

// Status iniciais em que o item ainda está na fase de vinculação de
// patrocinadores (pode ser enviado para a Arte).
export const LINKING_STATUSES = ['requested', 'awaiting_linking'];

// Status que esta tela exibe. Nomes que o backend realmente grava (sem
// 'released'/'in_production', que eram fantasmas e nunca casavam). No topo do
// módulo porque DUAS contas leem a lista: a que monta `visibleItems` e a que
// conta quantas peças o evento encerrado tirou de vista — se divergissem, o
// aviso prometeria um número que a lista não teria mostrado.
export const VINCULACAO_VISIBLE_STATUSES: string[] = [
  'awaiting_linking',
  'awaiting_submission',
  'awaiting_sponsor_approval',
  'sponsor_approved',
  'awaiting_finalization',
  'awaiting_final_review',
  'awaiting_creator_review',
  'ready_for_production',
  'pronto_para_producao',
  // Lista canônica (lib/status): inProduction, produced, conferred, packed,
  // delivered. Escritas à mão, faltavam Conferido e Embalado — a peça SUMIA
  // desta tela ao ser conferida e o selo caía em "Pendente".
  ...PRODUCTION_STATUSES,
];

// ── A LISTA DESTA TELA VEM RECORTADA NO SERVIDOR ─────────────────────────────
//
// A Vinculação lia ["/api/items"] — o acervo inteiro, 5 mil peças e 15 MB em
// produção — e a primeira linha de `visibleItems` jogava fora tudo que não
// estivesse em VINCULACAO_VISIBLE_STATUSES. Agora o recorte acontece no
// servidor: GET /api/items?status= (delta e formato compacto, com a chave
// dentro do prefixo "/api/items" para as invalidações continuarem alcançando).
//
// As ETAPAS canônicas de shared/fluxo-peca, e não os status escritos à mão
// acima: a etapa traz junto as grafias legadas que ainda circulam no banco —
// foi exatamente uma lista escrita à mão, sem `conferred`/`packed`, que fez a
// peça SUMIR desta tela ao ser conferida. O conjunto é um superconjunto de
// VINCULACAO_VISIBLE_STATUSES; o filtro do cliente continua valendo e nenhuma
// linha muda.
//
// Ficam de fora Rascunho/Solicitada (`requested`, `draft` — a fila da
// Solicitação, que esta tela já escondia), `approved`/`liberado` (que
// VINCULACAO_VISIBLE_STATUSES nunca listou) e o que saiu do funil.
export const VINCULACAO_ETAPAS = [
  "awaiting_linking", "awaiting_submission", "awaiting_approval",
  "awaiting_finalization", "awaiting_final_review", "ready_for_production",
  "inProduction", "produced", "conferred", "packed", "delivered",
] as const;
export const CHAVE_DA_VINCULACAO = ["/api/items", `?status=${statusDasEtapas(...VINCULACAO_ETAPAS).join(",")}`] as const;

// Status "a jusante": o item já saiu da vinculação (foi para a Arte, aprovação
// ou produção). Precisa cobrir TODAS as convenções de status de ITEM realmente
// gravadas pelo backend — inclui camelCase (inProduction), português
// (pronto_para_producao) e nomes legados. Um nome faltando aqui fazia o item
// cair errado em "Pendente" (badge) e até sumir da tela (filtro de visibilidade).
export const DOWNSTREAM_STATUSES: string[] = [
  'awaiting_submission',       // enviado para Arte (thumb)
  'awaiting_sponsor_approval', // em aprovação pelo patrocinador
  'sponsor_approved',
  'approved',
  'awaiting_finalization',     // legado — Arte adicionando arquivo final
  'awaiting_final_review',     // criador revisando arquivo final
  'awaiting_creator_review',   // legado
  'ready_for_production',
  'pronto_para_producao',
  // Lista canônica (lib/status): inProduction, produced, conferred, packed,
  // delivered. Escritas à mão, faltavam Conferido e Embalado — a peça SUMIA
  // desta tela ao ser conferida e o selo caía em "Pendente".
  ...PRODUCTION_STATUSES,
];

// Rótulos exibidos para cada status UI — os cartões, filtros e badges devem
// usar SEMPRE este mapa (antes o badge da linha imprimia a chave crua
// "RASCUNHO" e o config dizia "Preparado": quatro grafias para o mesmo estado).
export const UI_STATUS_LABEL: Record<string, string> = {
  PENDENTE: 'Pendente',
  RASCUNHO: 'Rascunho',
  PRONTO: 'Pronto',
  ENVIADO: 'Enviado',
};

// O QUE CADA SITUAÇÃO QUER DIZER — uma frase por estado, lida pelos chips da
// barra e pelo selo da linha. Sem ela, "Pronto" não dizia pronto para quê, e
// "Rascunho" não dizia que o vínculo ainda não existe no servidor.
export const UI_STATUS_SIGNIFICADO: Record<UIStatus, string> = {
  PENDENTE: 'sem patrocinador marcado — falta vincular',
  RASCUNHO: 'marcado mas não salvo — clique em Salvar',
  PRONTO: 'vínculo salvo — falta enviar para a Arte',
  ENVIADO: 'já na Arte — vínculo travado, só dá para acrescentar',
};

// Renderização incremental (padrão da casa, como arte.tsx/painel-geral):
// tabelas grandes rendem só as primeiras 50 linhas + "Mostrar todos".
export const ITEM_RENDER_CAP = 50;

// Reutilizado nos sorts de lista: um Collator criado uma vez é bem mais rápido
// que chamar localeCompare a cada comparação.
export const COLLATOR_PTBR = new Intl.Collator('pt-BR');

// ── Cabeçalho de coluna. #7a6154 e não o #746e69 de antes: sobre o #fafaf9
//    do thead, 4,4:1 não passa a régua da casa; este dá 5,5.
export const THC: CSSProperties = {
  padding: '9px 12px', textAlign: 'left',
  fontSize: 11, fontWeight: 700, color: T.apoio,
  textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap',
};
