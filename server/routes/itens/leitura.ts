// Leituras de peças: a lista (com delta e recorte), a lixeira e as filas das telas.
import type { Express } from "express";
import { storage, cabeNaJanelaDeEntregues } from "../../storage";
import { ITEM_STATUSES, type Item } from "@shared/schema";
import { eventoComDatasDoKit, pecaVisivelPara } from "@shared/kit";
import { remessasPorIds } from "../../services/kitRemessas";
import { resumosDeTuboPorIds, comTubo } from "../../services/tubosDaPeca";
import {
  FORMATO_COMPACTO,
  CAMPOS_DA_TRILHA,
  compactarPecas,
  compactarAprovacoes,
  projetarNaTrilha,
} from "@shared/itens-compactos";
import { ehBookCompleto, STATUS_CONHECIDOS as STATUS_DA_REGUA } from "@shared/fluxo-peca";
import { requireAuth } from "../shared";
import { COMPLEMENT_ALLOWED_STATUSES, quemVe } from "./comum";

// Enriquece uma lista de itens com { event, sponsors } fazendo apenas 4 queries
// totais (eventos, patrocinadores, vínculos item↔patrocinador e aprovações em
// bloco), em vez de 1 getEvent + 1 getItemSponsors + N getSponsor POR item
// (N+1). Cada sponsor recebe approvalStatus: "approved"|"rejected"|"pending"|null
// para que SponsorChips possa colorir os chips sem requests adicionais.
async function enrichItemsWithEventsAndSponsors(
  list: any[],
  // PERFORMANCE (17/09): quem JÁ carregou eventos e patrocinadores (o delta
  // devolve os dois inteiros) passa aqui — antes o delta buscava
  // getAllSponsors duas vezes por request (aqui e na rota), e os eventos também.
  //
  // `ordemDoAcervo` (17/09): o recorte por status de GET /api/items é pequeno,
  // mas precisa sair IGUAL à mesma peça na lista inteira — e as leituras por id
  // (getItemSponsorsByItemIds) não têm ORDER BY: os chips de patrocinador
  // poderiam trocar de ordem na tela. Com a opção, os vínculos e aprovações vêm
  // das leituras do acervo, na ordem de sempre.
  carregados?: { eventos?: any[]; patrocinadores?: any[]; ordemDoAcervo?: boolean },
): Promise<any[]> {
  if (list.length === 0) return [];
  // AUDITORIA 27/08: para listas pequenas (o detalhe de UM evento, as filas
  // recortadas), buscar por id em vez de carregar as tabelas INTEIRAS — abrir
  // um evento de 20 peças puxava todos os vínculos e aprovações do sistema.
  // Acima do corte, o acervo inteiro está em jogo e o getAll* é o caminho
  // mais barato (mesma régua de getComplementsByParentIds).
  const escopado = list.length <= 500 && !carregados?.ordemDoAcervo;
  const itemIds = escopado ? list.map((i) => i.id) : [];
  const eventIds = escopado && !carregados?.eventos ? Array.from(new Set(list.map((i) => i.eventId).filter(Boolean))) : [];
  const [allEvents, allSponsors, allItemSponsors, allApprovals] = await Promise.all([
    carregados?.eventos ?? (escopado ? storage.getEventsByIds(eventIds) : storage.getAllEvents()),
    carregados?.patrocinadores ?? storage.getAllSponsors(),
    escopado ? storage.getItemSponsorsByItemIds(itemIds) : storage.getAllItemSponsors(),
    escopado ? storage.getItemSponsorApprovalsByItemIds(itemIds) : storage.getAllItemSponsorApprovals(),
  ]);
  const eventById = new Map<string, any>(allEvents.map((e: any) => [e.id, e]));
  const sponsorById = new Map<string, any>(allSponsors.map((s: any) => [s.id, s]));
  // itemId → sponsorId → status. PERFORMANCE (17/09): a chave em texto
  // `${itemId}__${sponsorId}` alocava uma string de ~75 caracteres por
  // aprovação DO SISTEMA INTEIRO a cada request, só para servir de índice.
  const approvalStatus = new Map<string, Map<string, string>>();
  for (const a of allApprovals) {
    let porPatrocinador = approvalStatus.get(a.itemId);
    if (!porPatrocinador) approvalStatus.set(a.itemId, (porPatrocinador = new Map()));
    porPatrocinador.set(a.sponsorId, a.status);
  }
  // O patrocinador com o mesmo status é o MESMO objeto em todas as peças
  // (PERFORMANCE, 17/09): eram dezenas de milhares de cópias idênticas por
  // request para só 159 patrocinadores × poucos status. Ninguém muta a lista
  // antes do res.json, e o formato compacto reconhece a referência repetida.
  const entradaPorStatus = new Map<any, Map<string | null, any>>();
  const sponsorsByItem = new Map<string, any[]>();
  for (const is of allItemSponsors) {
    const sponsor = sponsorById.get(is.sponsorId);
    if (!sponsor) continue;
    const status = approvalStatus.get(is.itemId)?.get(is.sponsorId) ?? null;
    let porStatus = entradaPorStatus.get(sponsor);
    if (!porStatus) entradaPorStatus.set(sponsor, (porStatus = new Map()));
    let enrichedSponsor = porStatus.get(status);
    if (!enrichedSponsor) {
      enrichedSponsor = {
        ...sponsor,
        approvalStatus: status,
      };
      porStatus.set(status, enrichedSponsor);
    }
    const arr = sponsorsByItem.get(is.itemId);
    if (arr) arr.push(enrichedSponsor);
    else sponsorsByItem.set(is.itemId, [enrichedSponsor]);
  }
  // A remessa do Kit (datas do Kit) vai junto: é o que o selo "KIT · entrega"
  // mostra em todas as etapas.
  // O TUBO vai junto (21/09): número e carimbos, para Atendimento/Solicitação
  // lerem "Tubo 2" sem acesso a /api/tubos (403 para eles, e continua assim).
  // Um select em lote, só com os ids presentes — ver services/tubosDaPeca.
  const [remessaPorId, tuboPorId] = await Promise.all([
    remessasPorIds(list.map((i) => i.kitRemessaId).filter(Boolean)),
    resumosDeTuboPorIds(list.map((i) => i.tuboId)),
  ]);
  const withEventsAndSponsors = list.map((item) => ({
    ...comTubo(item, tuboPorId),
    kitRemessa: item.kitRemessaId ? remessaPorId.get(item.kitRemessaId) ?? null : null,
    // Peça do Kit: o evento vem com as datas da remessa (dono, 14/09: "tem
    // que ser pela data deles") — Arte, Gráfica e Painel cobram por elas.
    event: eventoComDatasDoKit(eventById.get(item.eventId), item.kitRemessaId ? remessaPorId.get(item.kitRemessaId) : null),
    sponsors: sponsorsByItem.get(item.id) ?? [],
  }));

  return await enrichItemsWithComplements(withEventsAndSponsors);
}

/**
 * `?formato=compacto` (PERFORMANCE, 17/09 — ver shared/itens-compactos.ts):
 * evento e patrocinador vão uma vez num dicionário e os nomes de coluna uma
 * vez por forma; o cliente reconstrói as peças idênticas. Sem o parâmetro a
 * resposta é a de sempre, byte a byte — consumidor antigo segue funcionando.
 */
const querCompacto = (req: any): boolean => req.query?.formato === FORMATO_COMPACTO;

/**
 * `?campos=trilha` (PERFORMANCE, 2ª rodada — ver shared/itens-compactos.ts):
 * a peça vai com as onze colunas que o Histórico lê, SEM enriquecimento
 * nenhum. É a única projeção; qualquer outro valor de `?campos=` é ignorado e
 * a resposta sai como sempre.
 */
const querTrilha = (req: any): boolean => req.query?.campos === CAMPOS_DA_TRILHA;

/**
 * O TETO DE SEGURANÇA — com aviso, nunca com `slice` (um corte silencioso
 * aqui já fez peças "sumirem" do Painel quando o banco passou de 1.000).
 *
 * Quem pede a lista SEM recorte leva o acervo inteiro, e é esse pedido que
 * trava o event loop para todas as outras abas enquanto o JSON é montado. As
 * telas de fila (Arte, Atendimento, Vinculação, Revisão) já pedem recortadas;
 * o aviso existe para que a próxima tela que voltar a pedir tudo apareça no
 * log com nome e tamanho, em vez de ser descoberta de novo por medição.
 *
 * Uma linha a cada TETO_AVISO_MS por caminho: o aviso não pode virar ele
 * mesmo um custo por request.
 */
const TETO_DO_ACERVO = 2000;
const TETO_AVISO_MS = 5 * 60 * 1000;
const ultimoAviso = new Map<string, number>();
function avisarAcervoInteiro(req: any, quantas: number, trilha: boolean): void {
  if (quantas <= TETO_DO_ACERVO) return;
  const caminho = `${req.headers?.referer ?? "?"}|${trilha ? "trilha" : "cheio"}`;
  const agora = Date.now();
  if (agora - (ultimoAviso.get(caminho) ?? 0) < TETO_AVISO_MS) return;
  ultimoAviso.set(caminho, agora);
  console.warn(
    `[items] GET /api/items SEM recorte devolveu ${quantas} peças (teto de aviso: ${TETO_DO_ACERVO})`
    + `${trilha ? " na projeção da trilha" : ""} — origem "${req.headers?.referer ?? "desconhecida"}",`
    + ` papel "${req.userRole ?? "?"}". Use ?status= / ?eventId= para pedir só a etapa da tela.`,
  );
}

/** Âncora do próximo delta: tirada ANTES da leitura, com 60s de sobreposição —
 *  uma transação commitando "agora" não pode cair no vão entre dois deltas.
 *  2s (até 17/09) não bastava: o updated_at é o now() do INÍCIO da transação,
 *  e uma escrita em lote que confirma segundos depois ficava com carimbo
 *  anterior ao `since` e nunca chegava às abas abertas (a Gráfica fica aberta
 *  o dia todo, e agora vive só de delta). Duplicata é inofensiva: o merge é
 *  por id, a peça idêntica ao cache é pulada (mantém o objeto) e a removida
 *  que já saiu não muda nada — o custo são algumas peças a mais por delta. */
const SOBREPOSICAO_DO_DELTA_MS = 60 * 1000;
const agoraDoDelta = () => new Date(Date.now() - SOBREPOSICAO_DO_DELTA_MS).toISOString();

/**
 * Os status da fila da Gráfica — os MESMOS de storage.getApprovedItems (o
 * SQL de lá lista estes dez). O delta de /api/items/approved decide com eles
 * se a peça que mudou continua na fila ou sai; o teste
 * itens-compactos.test.ts prende a paridade com o storage.
 */
const STATUS_DA_FILA_DA_GRAFICA: ReadonlySet<string> = new Set([
  "awaiting_final_review", "awaiting_review", "in_review", "ready_for_production", "pronto_para_producao",
  "approved", "inProduction", "produced", "conferred", "packed", "delivered",
]);

/**
 * DELTA × COMPLEMENTO (17/09). A mãe carrega `complements[]` e
 * `contractedTotal`, derivados dos FILHOS — e criar, produzir, entregar ou
 * cancelar um complemento nunca toca a linha da mãe (regra do complemento:
 * nenhum UPDATE na mãe). Sem isto o delta trazia o filho e deixava a mãe com
 * o resumo velho no cache até o próximo full fetch — na Gráfica, que agora
 * também vive de delta, a linha mostraria o total contratado errado. As mães
 * dos filhos que mudaram entram no delta, re-enriquecidas, se ainda cabem na
 * lista (`entra`).
 */
async function maesDosComplementosMudados(mudadas: any[], entra: (mae: any) => boolean): Promise<any[]> {
  const noDelta = new Set(mudadas.map((i) => i.id));
  const ids = Array.from(new Set(
    mudadas.map((i) => i.parentItemId as string | null).filter((pid): pid is string => !!pid && !noDelta.has(pid)),
  ));
  if (ids.length === 0) return [];
  return (await storage.getItemsByIds(ids)).filter(entra);
}

/** `since` válido e recente (<24h), ou null → full fetch. Velho demais, o
 *  delta seria a lista inteira com overhead a mais. */
function lerSince(req: any): Date | null {
  const sinceCru = typeof req.query?.since === "string" ? new Date(req.query.since) : null;
  return sinceCru && !isNaN(sinceCru.getTime()) && Date.now() - sinceCru.getTime() < 24 * 60 * 60 * 1000
    ? sinceCru
    : null;
}

/**
 * Os status que existem — o canônico de shared/schema, as grafias legadas em
 * português que ainda circulam no banco e os da fila da Gráfica. É contra esta
 * lista que `?status=` é validado: um status digitado errado responderia uma
 * lista VAZIA com cara de "não há nada aqui", que é pior que um erro.
 *
 * `STATUS_DA_REGUA` (shared/fluxo-peca) entra porque é a régua que as TELAS
 * usam para montar o recorte: elas pedem "os status da etapa X", com as
 * grafias legadas em português juntas. Sem ele, a Arte pedindo a aba
 * Finalizados (que inclui `produzido`, `conferido`, `entregue`) levava 400 —
 * um erro sobre um status que o banco realmente grava.
 */
const STATUS_CONHECIDOS: ReadonlySet<string> = new Set<string>([
  ...ITEM_STATUSES,
  ...Array.from(STATUS_DA_FILA_DA_GRAFICA),
  ...COMPLEMENT_ALLOWED_STATUSES,
  ...STATUS_DA_REGUA,
  "liberado",
]);

/** O que `?status=`/`?ids=`/`?eventId=` pedem, já validado. `null` = sem recorte. */
type RecorteDePecas = {
  status: ReadonlySet<string> | null;
  ids: ReadonlySet<string> | null;
  eventos: ReadonlySet<string> | null;
};

/**
 * RECORTE OPCIONAL de GET /api/items (PERFORMANCE, 17/09).
 *
 * A Revisão Final baixava as 5 mil peças (15 MB) para mostrar as ~8 em
 * "Aguardando Revisão Final". Com `?status=a,b` (lista separada por vírgula) a
 * rota devolve só as peças nesses status; com `?ids=x,y`, só essas peças (a
 * Revisão usa para dizer o código de uma peça do link que já saiu da fila);
 * com `?eventId=e1,e2`, só as peças desses eventos. Os três juntos são E. Sem
 * nenhum deles, a rota responde como sempre.
 *
 * `?eventId=` (perf, 2ª rodada) existe porque as filas de trabalho — Arte,
 * Atendimento, Vinculação — já jogam fora, no cliente, toda peça de evento
 * FINALIZADO (encerrado à mão ou com a data do evento passada). Era o acervo
 * inteiro descendo pela rede para ser descartado na primeira linha do
 * `useMemo`. O cliente sabe quais eventos estão em jogo (`/api/events`), então
 * pede só esses.
 *
 * O recorte é aplicado ANTES do enriquecimento e DEPOIS de pecaVisivelPara —
 * a regra do Kit continua sendo a mesma para a lista recortada.
 */
function lerRecorte(req: any): { ok: true; recorte: RecorteDePecas | null } | { ok: false; erro: string } {
  const lista = (v: unknown): string[] | null => {
    if (v === undefined) return null;
    const bruto = Array.isArray(v) ? v.join(",") : String(v);
    return bruto.split(",").map((x) => x.trim()).filter(Boolean);
  };
  const status = lista(req.query?.status);
  const ids = lista(req.query?.ids);
  const eventos = lista(req.query?.eventId);
  if (status === null && ids === null && eventos === null) return { ok: true, recorte: null };
  if (status !== null) {
    if (status.length === 0) return { ok: false, erro: "Informe ao menos um status em ?status=." };
    const desconhecidos = status.filter((st) => !STATUS_CONHECIDOS.has(st));
    if (desconhecidos.length > 0) return { ok: false, erro: `Status desconhecido: ${desconhecidos.join(", ")}` };
  }
  if (ids !== null) {
    if (ids.length === 0 || ids.length > 200) return { ok: false, erro: "Informe de 1 a 200 ids em ?ids=." };
    if (ids.some((id) => !/^[A-Za-z0-9_-]{1,64}$/.test(id))) return { ok: false, erro: "Id de peça inválido em ?ids=." };
  }
  // O teto é o número de eventos que cabem numa fila de trabalho com folga —
  // e existe para que `?eventId=` não vire um jeito de montar uma query de
  // milhares de termos no banco.
  if (eventos !== null) {
    if (eventos.length === 0 || eventos.length > 500) return { ok: false, erro: "Informe de 1 a 500 ids em ?eventId=." };
    if (eventos.some((id) => !/^[A-Za-z0-9_-]{1,64}$/.test(id))) return { ok: false, erro: "Id de evento inválido em ?eventId=." };
  }
  return {
    ok: true,
    recorte: {
      status: status ? new Set(status) : null,
      ids: ids ? new Set(ids) : null,
      eventos: eventos ? new Set(eventos) : null,
    },
  };
}

const casaRecorte = (recorte: RecorteDePecas | null, i: { id: string; status: string; eventId?: string | null }): boolean =>
  !recorte || (
    (!recorte.status || recorte.status.has(i.status))
    && (!recorte.ids || recorte.ids.has(i.id))
    && (!recorte.eventos || (!!i.eventId && recorte.eventos.has(i.eventId)))
  );

/** As peças vivas do recorte, na ordem da lista inteira (created_at DESC). */
async function pecasDoRecorte(recorte: RecorteDePecas): Promise<Item[]> {
  // Status E evento no mesmo WHERE: recortar um dos dois no banco e o outro em
  // JavaScript traria de volta justamente o que o recorte evita.
  if (recorte.status && recorte.eventos) {
    return (await storage.getItemsByStatusesAndEvents(Array.from(recorte.status), Array.from(recorte.eventos)))
      .filter((i) => casaRecorte(recorte, i));
  }
  if (recorte.status) return (await storage.getItemsByStatuses(Array.from(recorte.status))).filter((i) => casaRecorte(recorte, i));
  if (recorte.eventos) return (await storage.getItemsByEvents(Array.from(recorte.eventos))).filter((i) => casaRecorte(recorte, i));
  // Só ids: getItemsByIds não filtra excluída nem ordena — as duas coisas que
  // getAllItems faz, feitas aqui (sort estável, como o ORDER BY do banco).
  const porId = await storage.getItemsByIds(Array.from(recorte.ids ?? []));
  return porId
    .filter((i) => !i.deletedAt)
    .sort((a, b) => new Date(b.createdAt as any).getTime() - new Date(a.createdAt as any).getTime());
}

// Aviso de migração pendente: uma linha por processo, não uma por request.
let avisouMigracaoComplemento = false;

/**
 * Anexa o parentesco de complemento à lista já enriquecida:
 *  - na MÃE: `complements: [...]` e `contractedTotal` (quantidade + Σ dos
 *    complementos vivos). Derivado a cada leitura, nunca gravado — contador
 *    denormalizado sempre acaba divergindo da realidade.
 *  - no FILHO: `parent: { id, displayId, quantity, status }`, para a linha
 *    poder dizer "COMPLEMENTO DE #0062" sem uma segunda requisição.
 *
 * Uma query extra por request (WHERE parent_item_id = ANY(...)), sobre índice.
 *
 * Degrada em silêncio se a migração ainda não rodou: as três rotas de leitura
 * continuam respondendo o que sempre responderam, só sem o bloco de
 * complemento. (Isso NÃO substitui o `npm run db:push` — o SELECT do Drizzle
 * lista as colunas explicitamente, então a leitura estoura antes de chegar
 * aqui. O try/catch é a rede para o caso de a query nova falhar sozinha.)
 */
async function enrichItemsWithComplements(list: any[]): Promise<any[]> {
  try {
    const ids = list.map((i) => i.id);
    const complements = await storage.getComplementsByParentIds(ids);
    if (complements.length === 0) {
      // Ainda assim precisa resolver o `parent` dos filhos cuja mãe não está
      // nesta lista (ex.: recorte por status que não trouxe a mãe).
      return await attachParents(list);
    }

    const byParent = new Map<string, any[]>();
    for (const c of complements) {
      if (!c.parentItemId) continue;
      const arr = byParent.get(c.parentItemId);
      if (arr) arr.push(c);
      else byParent.set(c.parentItemId, [c]);
    }

    const comMaes = list.map((item) => {
      const filhos = byParent.get(item.id);
      if (!filhos || filhos.length === 0) return item;
      const soma = filhos.reduce((acc: number, c: any) => acc + (Number(c.quantity) || 0), 0);
      return {
        ...item,
        complements: filhos,
        contractedTotal: (Number(item.quantity) || 0) + soma,
      };
    });

    return await attachParents(comMaes);
  } catch (error: any) {
    if (error?.code === "42703") {
      if (!avisouMigracaoComplemento) {
        avisouMigracaoComplemento = true;
        console.error("[COMPLEMENTOS] Migração pendente — rode npm run db:push. Listagens seguem sem o bloco de complemento.");
      }
      return list;
    }
    throw error;
  }
}

/** Resolve `parent` nos itens que são complementos, com no máximo 1 query extra. */
async function attachParents(list: any[]): Promise<any[]> {
  const filhos = list.filter((i) => i.parentItemId);
  if (filhos.length === 0) return list;

  // PERFORMANCE (17/09): o índice guarda só as MÃES procuradas. Antes era um
  // Map do acervo inteiro, depois COPIADO para outro Map (milhares de pares
  // [id, peça] alocados por request) só para somar as mães vindas de fora.
  const procuradas = new Set<string>(filhos.map((f) => f.parentItemId));
  const maePorId = new Map<string, any>();
  for (const i of list) if (procuradas.has(i.id)) maePorId.set(i.id, i);
  const faltando = Array.from(procuradas).filter((pid) => !maePorId.has(pid));
  const extras = faltando.length ? await storage.getItemsByIds(faltando as string[]) : [];
  for (const m of extras) maePorId.set(m.id, m);

  return list.map((item) => {
    if (!item.parentItemId) return item;
    const mae = maePorId.get(item.parentItemId);
    if (!mae) return item;
    return {
      ...item,
      parent: { id: mae.id, displayId: mae.displayId, quantity: mae.quantity, status: mae.status },
    };
  });
}

/** GET /api/items, GET /api/items/deleted. */
export function registrarListaEExcluidas(app: Express): void {
  // ============ ITEMS ============

  // Get all items with event data and sponsors.
  // Sem cap: um slice silencioso aqui fez peças "sumirem" do Painel quando o
  // banco passou de 1000. Se o payload virar problema, a saída é paginação
  // real (cursor) — nunca truncar sem avisar o cliente.
  app.get("/api/items", requireAuth, async (req, res) => {
    try {
      // ── DELTA-SYNC (auditoria 27/08) ─────────────────────────────────────
      // Com ?since=<ISO>, a resposta traz SÓ o que mudou desde então:
      //   { delta: true, agora, itens (mudadas, enriquecidas),
      //     removidas (ids apagados), eventos, patrocinadores }
      // `eventos` e `patrocinadores` vêm inteiros (dezenas de linhas) porque
      // estão EMBUTIDOS em cada peça do cache do cliente — um evento renomeado
      // ou encerrado precisa se refletir nas peças que NÃO mudaram. Toda
      // escrita de vínculo/aprovação carimba updated_at da peça (touchItem no
      // storage), então mudança de patrocinador também entra no delta.
      // `since` velho demais (>24h) cai no full fetch (lerSince).
      //
      // `?formato=compacto` (17/09) vale para os dois: o delta compacto leva
      // as mesmas chaves, com `itens` codificadas contra os `eventos` e
      // `patrocinadores` que ele já traz inteiros (nada vai duas vezes).
      //
      // `?status=`/`?ids=` (17/09, ver lerRecorte) recortam os dois caminhos.
      // No delta, a peça que mudou e SAIU do recorte (a Revisão liberou, outra
      // aba devolveu) vem em `removidas` — é assim que ela some da tela
      // recortada sem F5, do mesmo jeito que some a peça excluída.
      const leitura = lerRecorte(req);
      if (!leitura.ok) return res.status(400).json({ error: leitura.erro });
      const recorte = leitura.recorte;
      const since = lerSince(req);
      const compacto = querCompacto(req);
      const trilha = querTrilha(req);
      const agora = agoraDoDelta();
      const usuario = quemVe(req);
      if (since) {
        const mudadas = await storage.getItemsChangedSince(since);
        // Usuário do Kit: o que ele não enxerga sai do cache dele como removido.
        const cabe = (i: any) => !i.deletedAt && pecaVisivelPara(usuario, i) && casaRecorte(recorte, i);
        const visivel = mudadas.map(cabe);
        // Projeção da trilha: o delta anda pelo mesmo caminho, só que sem
        // enriquecimento nenhum — inclusive sem as mães dos complementos, que
        // existem para re-costurar `complements`/`contractedTotal`, campos que
        // a projeção não tem.
        if (trilha) {
          const itens = mudadas.filter((_i, n) => visivel[n]).map(projetarNaTrilha);
          const removidas = mudadas.filter((_i, n) => !visivel[n]).map((i) => i.id);
          // `eventos` continua indo: é por ele que o cliente derruba a peça
          // cujo evento foi excluído em cascata (ver aplicarDelta).
          const eventos = await storage.getAllEvents();
          if (compacto) return res.json({ delta: true, agora, removidas, ...compactarPecas(itens, { eventos, patrocinadores: [] }) });
          return res.json({ delta: true, agora, itens, removidas, eventos, patrocinadores: [] });
        }
        const vivas = [
          ...mudadas.filter((_i, n) => visivel[n]),
          ...(await maesDosComplementosMudados(mudadas, cabe)),
        ];
        // Eventos e patrocinadores UMA vez: vão na resposta e servem ao
        // enriquecimento (antes eram buscados de novo lá dentro).
        const [eventos, patrocinadores] = await Promise.all([
          storage.getAllEvents(),
          storage.getAllSponsors(),
        ]);
        const itens = await enrichItemsWithEventsAndSponsors(vivas, { eventos, patrocinadores });
        const resposta = {
          delta: true,
          agora,
          itens,
          removidas: mudadas.filter((_i, n) => !visivel[n]).map((i) => i.id),
          eventos,
          patrocinadores,
        };
        if (compacto) {
          return res.json({ delta: true, agora, removidas: resposta.removidas, ...compactarPecas(itens, { eventos, patrocinadores }) });
        }
        return res.json(resposta);
      }

      if (recorte) {
        const doRecorte = (await pecasDoRecorte(recorte)).filter((i) => pecaVisivelPara(usuario, i));
        if (trilha) {
          const itens = doRecorte.map(projetarNaTrilha);
          return res.json(compacto ? { agora, ...compactarPecas(itens) } : itens);
        }
        const itens = await enrichItemsWithEventsAndSponsors(doRecorte, { ordemDoAcervo: true });
        return res.json(compacto ? { agora, ...compactarPecas(itens) } : itens);
      }

      const allItems = (await storage.getAllItems()).filter((i) => pecaVisivelPara(quemVe(req), i));
      avisarAcervoInteiro(req, allItems.length, trilha);
      if (trilha) {
        const itens = allItems.map(projetarNaTrilha);
        return res.json(compacto ? { agora, ...compactarPecas(itens) } : itens);
      }
      const itemsWithEventsAndSponsors = await enrichItemsWithEventsAndSponsors(allItems);
      res.json(compacto ? { agora, ...compactarPecas(itemsWithEventsAndSponsors) } : itemsWithEventsAndSponsors);
    } catch (error: any) {
      console.error("[items] erro ao listar as peças:", error); res.status(500).json({ error: "Não foi possível carregar as peças agora. Tente de novo em instantes." });
    }
  });

  // Get deleted (soft-deleted) items — admin e solicitacao only
  app.get("/api/items/deleted", requireAuth, async (req, res) => {
    try {
      if (req.userRole !== "admin" && req.userRole !== "solicitacao") {
        return res.status(403).json({ error: "Sem permissão para ver peças excluídas" });
      }
      const deletedItems = (await storage.getDeletedItems()).filter((i) => pecaVisivelPara(quemVe(req), i));
      const enriched = await enrichItemsWithEventsAndSponsors(deletedItems);
      res.json(querCompacto(req) ? compactarPecas(enriched) : enriched);
    } catch (error: any) {
      console.error("[items] erro ao listar as peças excluídas:", error); res.status(500).json({ error: "Não foi possível carregar as peças excluídas agora. Tente de novo em instantes." });
    }
  });
}

/** GET pending, resubmission-needed, approved, batch-approval-data e :eventId (este por último). */
export function registrarFilasEPorEvento(app: Express): void {
  // Get pending items with event and sponsors (for Arte module) - MUST come BEFORE /:eventId route
  app.get("/api/items/pending", requireAuth, async (req, res) => {
    try {
      const pendingItems = (await storage.getPendingItems()).filter((i) => pecaVisivelPara(quemVe(req), i));
      const itemsWithEventsAndSponsors = await enrichItemsWithEventsAndSponsors(pendingItems);
      res.json(querCompacto(req) ? compactarPecas(itemsWithEventsAndSponsors) : itemsWithEventsAndSponsors);
    } catch (error: any) {
      console.error("[items] erro ao listar as peças pendentes:", error); res.status(500).json({ error: "Não foi possível carregar as peças pendentes agora. Tente de novo em instantes." });
    }
  });

  // Get items that have at least one awaiting_arte sponsor approval (for Arte correção) - MUST come BEFORE /:eventId
  app.get("/api/items/resubmission-needed", requireAuth, async (req, res) => {
    try {
      if (req.userRole !== "arte" && req.userRole !== "admin") {
        return res.status(403).json({ error: "Acesso não autorizado" });
      }

      // Batch: poucas queries totais em vez de N+1 por item. As candidatas
      // saem filtradas do BANCO (getItemsParaCorrecao) e as aprovações só
      // delas — antes eram o acervo e a tabela de aprovações inteiros.
      const [allItems, allEvents, allSponsors] = await Promise.all([
        storage.getItemsParaCorrecao(),
        storage.getAllEvents(),
        storage.getAllSponsors(),
      ]);
      const allItemSponsorApprovals = await storage.getItemSponsorApprovalsByItemIds(allItems.map((i) => i.id));

      // A fila da Correção responde UMA pergunta: "o que voltou e precisa ser
      // refeito?". Ela tinha DOIS pré-requisitos para responder — a peça em
      // `awaiting_sponsor_approval` E uma linha de patrocinador em
      // `awaiting_arte` —, e o segundo era mecânica de UM dos caminhos de
      // reprovação, não parte da pergunta.
      //
      // Consequência: peça reprovada pelo caminho que devolvia a peça INTEIRA
      // (o antigo "Reprovar Ativo", removido em 17/08) caía em
      // `awaiting_submission` sem marcar patrocinador nenhum, e sumia da
      // Correção — ia para o meio das 1.120 que nunca tinham sido enviadas.
      // A #3042 é o caso: a trilha registra "Kakau Faria · reprovado pelo
      // patrocinador", e mesmo assim ela não estava aqui.
      //
      // `rejectedBySponsor` é a marca canônica de "isto voltou de um
      // patrocinador" e não depende de saber QUAL deles — que é uma informação
      // que aquele caminho nunca gravou. A peça sai daqui sozinha quando a
      // Arte reenvia: o status muda para `awaiting_sponsor_approval` e ela
      // deixa de casar (a flag continua ligada de propósito até a aprovação —
      // ver o comentário em /submit-for-approval —, então é o STATUS que a
      // tira da fila, não a flag).
      const awaitingItems = allItems.filter(i => i.status === "awaiting_sponsor_approval");
      const devolvidasSemDono = allItems.filter(
        i => i.status === "awaiting_submission" && i.rejectedBySponsor === true,
      );
      const eventById = new Map(allEvents.map(e => [e.id, e]));
      const sponsorById = new Map(allSponsors.map(s => [s.id, s]));

      const approvalsByItem = new Map<string, any[]>();
      // TODAS as aprovações da peça, por item — o painel de reenvio precisa
      // de quem já aprovou tanto quanto de quem reprovou: é a diferença
      // entre "vai receber" e "mantém aprovação".
      const todasPorItem = new Map<string, any[]>();
      for (const a of allItemSponsorApprovals) {
        const t = todasPorItem.get(a.itemId);
        if (t) t.push(a); else todasPorItem.set(a.itemId, [a]);
        if (a.status !== "awaiting_arte") continue;
        const list = approvalsByItem.get(a.itemId);
        if (list) list.push(a);
        else approvalsByItem.set(a.itemId, [a]);
      }
      const comPatrocinador = (lista: any[]) => lista.map((a: any) => ({ ...a, sponsor: sponsorById.get(a.sponsorId) || null }));

      const result = [];
      for (const item of awaitingItems) {
        const awaitingArte = approvalsByItem.get(item.id);
        if (!awaitingArte || awaitingArte.length === 0) continue;

        result.push({
          ...item,
          event: eventById.get(item.eventId) || null,
          awaitingArteApprovals: comPatrocinador(awaitingArte),
          aprovacoes: comPatrocinador(todasPorItem.get(item.id) ?? []),
        });
      }

      // A DEVOLVIDA LEVA AS APROVAÇÕES QUE ELA TEM — e não um array vazio.
      //
      // Aqui havia `awaitingArteApprovals: []` fixo, com um comentário meu
      // afirmando que "vazio é a resposta honesta, nunca houve linha de
      // patrocinador". Estava errado: uma peça pode ter sido devolvida INTEIRA
      // (status awaiting_submission, rejectedBySponsor) e AINDA ASSIM ter um
      // patrocinador em awaiting_arte. A #3027 tinha — Atlas Schindler, com
      // motivo escrito. O `[]` jogava esse dado fora.
      //
      // E o estrago não era cosmético: o seletor do modal de correção é
      // alimentado por esta lista, e sem linha nenhuma para marcar o botão
      // "Confirmar Re-envio" nunca saía de desabilitado. A pessoa subia a arte
      // nova e ficava sem saída.
      for (const item of devolvidasSemDono) {
        const awaitingArte = approvalsByItem.get(item.id) ?? [];
        result.push({
          ...item,
          event: eventById.get(item.eventId) || null,
          awaitingArteApprovals: comPatrocinador(awaitingArte),
          aprovacoes: comPatrocinador(todasPorItem.get(item.id) ?? []),
        });
      }

      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get approved items with event and sponsors (for Gráfica module) - MUST come BEFORE /:eventId route
  app.get("/api/items/approved", requireAuth, async (req, res) => {
    try {
      // DELTA-SYNC também aqui (PERFORMANCE, 17/09). A Gráfica fica aberta o
      // dia inteiro, revalida em foco, a cada 5 min e a cada conferência de
      // outra pessoa — e cada revalidação re-baixava 13,8 MB. Mesmo contrato
      // de GET /api/items?since=: a peça que mudou e ainda é da fila vem em
      // `itens`; a que mudou e saiu (status, exclusão, Kit, book) vem em
      // `removidas`. Sem `since`, a resposta de sempre.
      const since = lerSince(req);
      const compacto = querCompacto(req);
      const agora = agoraDoDelta();
      const usuario = quemVe(req);
      if (since) {
        const agoraMs = Date.now();
        const [mudadas, sairamDaJanela] = await Promise.all([
          storage.getItemsChangedSince(since),
          storage.getIdsQueSairamDaJanelaDeEntregues(since),
        ]);
        // Entregue antiga (fora de DIAS_DE_ENTREGUES_NA_FILA) não é da fila —
        // a mesma régua de storage.getApprovedItems.
        const cabeNaFila = (i: any) =>
          !i.deletedAt && STATUS_DA_FILA_DA_GRAFICA.has(i.status) && cabeNaJanelaDeEntregues(i, agoraMs)
          && pecaVisivelPara(usuario, i) && !ehBookCompleto(i);
        const naFila = mudadas.map(cabeNaFila);
        const [eventos, patrocinadores, maes] = await Promise.all([
          storage.getAllEvents(),
          storage.getAllSponsors(),
          maesDosComplementosMudados(mudadas, cabeNaFila),
        ]);
        const itens = await enrichItemsWithEventsAndSponsors(
          [...mudadas.filter((_i, n) => naFila[n]), ...maes],
          { eventos, patrocinadores },
        );
        // A entregue que o RELÓGIO tirou da janela não mudou de linha: sem
        // esta soma ela ficaria no cache da Gráfica até a próxima carga cheia.
        const removidas = Array.from(new Set([...mudadas.filter((_i, n) => !naFila[n]).map((i) => i.id), ...sairamDaJanela]));
        if (compacto) {
          return res.json({ delta: true, agora, removidas, ...compactarPecas(itens, { eventos, patrocinadores }) });
        }
        return res.json({ delta: true, agora, itens, removidas, eventos, patrocinadores });
      }

      const approvedItems = (await storage.getApprovedItems()).filter((i) => pecaVisivelPara(quemVe(req), i));
      const itemsWithEventsAndSponsors = await enrichItemsWithEventsAndSponsors(approvedItems);
      // BOOK COMPLETO fica de fora da fila da Gráfica: é o trâmite do
      // Atendimento, não uma peça imprimível (ver shared/fluxo-peca).
      const fila = itemsWithEventsAndSponsors.filter((i: any) => !ehBookCompleto(i));
      res.json(compacto ? { agora, ...compactarPecas(fila) } : fila);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get items by event with sponsors - MUST come AFTER specific routes like /pending and /approved
  // Batch: retorna sponsors + approvals de todos os itens aguardando aprovação
  // em 3 queries totais, evitando o N*2 de chamadas individuais da página de atendimento.
  // DEVE ficar ANTES de /:eventId — senão Express captura "batch-approval-data" como eventId.
  app.get("/api/items/batch-approval-data", requireAuth, async (req, res) => {
    try {
      // Devolve TODOS os vínculos e aprovações do sistema — restrito aos
      // papéis que veem a tela de Atendimento (era aberto a qualquer sessão).
      if (!["atendimento", "arte", "admin"].includes(req.userRole ?? "")) {
        return res.status(403).json({ error: "Acesso não autorizado" });
      }
      // Só das peças vivas, filtrado no banco (a tela cruza por id com a
      // lista de peças, que não traz excluídas).
      const [allSponsors, { vinculos: allItemSponsors, aprovacoes: allApprovals }] = await Promise.all([
        storage.getAllSponsors(),
        storage.getVinculosEAprovacoesDasPecasVivas(),
      ]);

      const sponsorById = new Map(allSponsors.map(s => [s.id, s]));

      // agrupa vínculos por item
      const sponsorsByItem: Record<string, any[]> = {};
      for (const is of allItemSponsors) {
        const sponsor = sponsorById.get(is.sponsorId);
        if (!sponsor) continue;
        (sponsorsByItem[is.itemId] ??= []).push(sponsor);
      }

      // agrupa approvals por item, enriquecendo com sponsor
      const approvalsByItem: Record<string, any[]> = {};
      for (const a of allApprovals) {
        const enriched = { ...a, sponsor: sponsorById.get(a.sponsorId) || null };
        (approvalsByItem[a.itemId] ??= []).push(enriched);
      }

      // `?formato=compacto` (17/09): o patrocinador ia inteiro em cada vínculo
      // e de novo em cada aprovação (5,8 MB medidos) — compacto, vai uma vez.
      res.json(querCompacto(req)
        ? compactarAprovacoes({ sponsorsByItem, approvalsByItem })
        : { sponsorsByItem, approvalsByItem });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/items/:eventId", requireAuth, async (req, res) => {
    try {
      const items = (await storage.getItemsByEvent(req.params.eventId)).filter((i) => pecaVisivelPara(quemVe(req), i));
      const itemsWithSponsors = await enrichItemsWithEventsAndSponsors(items);
      res.json(itemsWithSponsors);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
}
