// ─────────────────────────────────────────────────────────────────────────────
// FORMATO COMPACTO DAS LISTAS DE PEÇAS (auditoria de performance, 17/09).
//
// Medido em produção: GET /api/items devolvia 5.128 peças em 15,1 MB de JSON.
// Cada peça embutia o `event` INTEIRO (2,8 MB para só 68 eventos distintos),
// os patrocinadores INTEIROS (1,85 MB para só 159) e repetia os ~75 nomes de
// coluna (≈6 MB de chaves). O servidor passava segundos montando e
// serializando isso — com o event loop parado, qualquer chamada pequena de
// outra aba esperava 7–8 s — e o navegador fazia JSON.parse de 15 MB.
//
// O formato compacto manda a MESMA informação sem as repetições:
//   · `formas`: cada lista distinta de chaves (em ordem) uma vez só; cada peça
//     vira [índiceDaForma, ...valores] — a peça reconstruída tem as mesmas
//     chaves, na MESMA ORDEM, e as ausentes continuam ausentes;
//   · `event` vira a CHAVE do evento num dicionário (`eventos`); a peça do Kit
//     aponta para `eventosDoKit`, onde o evento já vem com as datas da remessa
//     calculadas pelo servidor (eventoComDatasDoKit) — o cliente não recalcula
//     regra nenhuma, só troca a referência pelo objeto;
//   · cada patrocinador vira [sponsorId, approvalStatus] e o objeto do
//     patrocinador vai uma vez em `patrocinadores`.
//
// É OPT-IN (`?formato=compacto`): sem o parâmetro as rotas respondem
// exatamente como sempre. E é CONSERVADOR: qualquer evento ou patrocinador
// que não bata campo a campo com o dicionário vai EMBUTIDO, como no formato
// antigo — nunca se troca um objeto por outro "parecido". O teste
// itens-compactos.test.ts prova que decodificar(codificar(x)) serializa
// byte a byte igual a x.
// ─────────────────────────────────────────────────────────────────────────────

/** Valor do parâmetro `?formato=` que liga o formato compacto. */
export const FORMATO_COMPACTO = "compacto";

const MARCA_PECAS = "pecas-compactas";
const MARCA_APROVACOES = "aprovacoes-compactas";

type Obj = Record<string, any>;

export interface PecasCompactas {
  formato: typeof MARCA_PECAS;
  v: 1;
  /** Eventos referenciados pelas peças (no delta: todos, como sempre foi). */
  eventos: Obj[];
  /** `${eventId}#kit-${kitRemessaId}` → evento com as datas da remessa. */
  eventosDoKit: Record<string, Obj>;
  /** Patrocinadores referenciados (no delta: todos, como sempre foi). */
  patrocinadores: Obj[];
  formas: string[][];
  pecas: any[][];
  [extra: string]: unknown;
}

export interface AprovacoesCompactas {
  formato: typeof MARCA_APROVACOES;
  v: 1;
  patrocinadores: Obj[];
  sponsorsByItem: Record<string, Array<string | Obj>>;
  formas: string[][];
  approvalsByItem: Record<string, any[][]>;
}

export const ehPecasCompactas = (x: unknown): x is PecasCompactas =>
  !!x && typeof x === "object" && (x as Obj).formato === MARCA_PECAS;

export const ehAprovacoesCompactas = (x: unknown): x is AprovacoesCompactas =>
  !!x && typeof x === "object" && (x as Obj).formato === MARCA_APROVACOES;

// ─── comparação ──────────────────────────────────────────────────────────────

/** Dois valores serializam igual? `===`, e Date pelo instante (o servidor
 *  pode ter duas instâncias da mesma data). Objeto aninhado diferente por
 *  referência conta como DIFERENTE — aí o valor vai embutido, nunca trocado. */
const mesmoValor = (a: unknown, b: unknown): boolean =>
  a === b || (a instanceof Date && b instanceof Date && a.getTime() === b.getTime());

/** As `n` primeiras chaves de `obj` são as chaves de `base`, na mesma ordem e
 *  com os mesmos valores? (Chave com valor undefined não serializa — ignorada
 *  dos dois lados, como faz o JSON.) */
function mesmosCampos(base: Obj, chavesBase: string[], obj: Obj, chavesObj: string[], n: number): boolean {
  if (chavesBase.length !== n) return false;
  for (let k = 0; k < n; k++) {
    const chave = chavesBase[k];
    if (chave !== chavesObj[k] || !mesmoValor(base[chave], obj[chave])) return false;
  }
  return true;
}

function chavesSerializaveis(o: Obj): string[] {
  const chaves = Object.keys(o);
  for (let k = 0; k < chaves.length; k++) {
    if (o[chaves[k]] === undefined) return chaves.filter((c) => o[c] !== undefined);
  }
  return chaves;
}

/**
 * Um objeto-modelo com as chaves da forma, na ordem. Decodificar faz
 * `{...modelo}` e só PREENCHE as chaves: criar um objeto vazio e ir
 * acrescentando ~75 chaves por peça fazia o V8 trocar a "forma interna" do
 * objeto a cada chave — medido, a decodificação ficava mais lenta que o
 * JSON.parse do formato antigo. A cópia do modelo já nasce com a forma final.
 */
function modeloDaForma(forma: string[]): Obj {
  const modelo: Obj = {};
  for (const chave of forma) modelo[chave] = null;
  return modelo;
}

/** Formas (listas de chaves) indexadas: a mesma sequência de chaves ganha o
 *  mesmo índice. A comparação com a forma anterior evita montar a assinatura
 *  em texto para a maioria das peças, que têm todas a mesma forma. */
function criarFormas() {
  const formas: string[][] = [];
  const porAssinatura = new Map<string, number>();
  let ultima = -1;
  return {
    formas,
    indice(chaves: string[]): number {
      if (ultima >= 0) {
        const f = formas[ultima];
        if (f.length === chaves.length && f.every((c, i) => c === chaves[i])) return ultima;
      }
      const assinatura = chaves.join(",");
      let idx = porAssinatura.get(assinatura);
      if (idx === undefined) {
        idx = formas.length;
        formas.push(chaves);
        porAssinatura.set(assinatura, idx);
      }
      ultima = idx;
      return idx;
    },
  };
}

// ─── peças ───────────────────────────────────────────────────────────────────

/**
 * Codifica uma lista de peças JÁ ENRIQUECIDAS (a saída de
 * enrichItemsWithEventsAndSponsors). `base` fixa os dicionários — o delta já
 * manda todos os eventos e patrocinadores, e as peças apontam para eles em vez
 * de repetir; evento/patrocinador fora da base vai embutido.
 */
export function compactarPecas(
  itens: Obj[],
  base?: { eventos?: Obj[]; patrocinadores?: Obj[] },
): PecasCompactas {
  const eventos: Obj[] = base?.eventos ? base.eventos.slice() : [];
  const patrocinadores: Obj[] = base?.patrocinadores ? base.patrocinadores.slice() : [];
  const baseDeEventosFixa = !!base?.eventos;
  const baseDePatrocinadoresFixa = !!base?.patrocinadores;

  const evPorId = new Map<string, { obj: Obj; chaves: string[] }>();
  for (const e of eventos) if (e && typeof e.id === "string") evPorId.set(e.id, { obj: e, chaves: chavesSerializaveis(e) });
  const spPorId = new Map<string, { obj: Obj; chaves: string[] }>();
  for (const s of patrocinadores) if (s && typeof s.id === "string") spPorId.set(s.id, { obj: s, chaves: chavesSerializaveis(s) });
  const eventosDoKit: Record<string, Obj> = {};
  const kitPorChave = new Map<string, { obj: Obj; chaves: string[] }>();

  // Memória por REFERÊNCIA: o enriquecimento reaproveita o mesmo objeto de
  // evento (e de patrocinador+status) entre peças — a comparação campo a campo
  // roda uma vez por objeto, não uma vez por peça.
  const memoEvento = new Map<Obj, string | null>();
  const memoPatrocinador = new Map<Obj, [string, unknown] | null>();

  const refDoEvento = (ev: unknown, kitRemessaId: unknown): string | null => {
    if (!ev || typeof ev !== "object" || Array.isArray(ev) || typeof (ev as Obj).id !== "string") return null;
    const evento = ev as Obj;
    const doKit = evento.datasDoKit === true && typeof kitRemessaId === "string" && kitRemessaId !== "";
    const chave = doKit ? `${evento.id}#kit-${kitRemessaId}` : evento.id;
    const lembrada = memoEvento.get(evento);
    if (lembrada !== undefined && (lembrada === null || lembrada === chave)) return lembrada;

    const chaves = chavesSerializaveis(evento);
    let ref: string | null = null;
    if (doKit) {
      const noDic = kitPorChave.get(chave);
      if (!noDic) {
        kitPorChave.set(chave, { obj: evento, chaves });
        eventosDoKit[chave] = evento;
        ref = chave;
      } else if (mesmosCampos(noDic.obj, noDic.chaves, evento, chaves, chaves.length)) {
        ref = chave;
      }
    } else {
      const noDic = evPorId.get(chave);
      if (!noDic) {
        if (!baseDeEventosFixa) {
          evPorId.set(chave, { obj: evento, chaves });
          eventos.push(evento);
          ref = chave;
        }
      } else if (mesmosCampos(noDic.obj, noDic.chaves, evento, chaves, chaves.length)) {
        ref = chave;
      }
    }
    memoEvento.set(evento, ref);
    return ref;
  };

  const refDoPatrocinador = (s: unknown): [string, unknown] | null => {
    if (!s || typeof s !== "object" || Array.isArray(s) || typeof (s as Obj).id !== "string") return null;
    const entrada = s as Obj;
    const lembrada = memoPatrocinador.get(entrada);
    if (lembrada !== undefined) return lembrada;

    let ref: [string, unknown] | null = null;
    const chaves = chavesSerializaveis(entrada);
    // A entrada é {...patrocinador, approvalStatus}: approvalStatus é a ÚLTIMA
    // chave. Qualquer outra forma vai embutida.
    if (chaves[chaves.length - 1] === "approvalStatus") {
      let noDic = spPorId.get(entrada.id);
      if (!noDic && !baseDePatrocinadoresFixa) {
        const obj: Obj = {};
        for (let k = 0; k < chaves.length - 1; k++) obj[chaves[k]] = entrada[chaves[k]];
        noDic = { obj, chaves: chaves.slice(0, -1) };
        spPorId.set(entrada.id, noDic);
        patrocinadores.push(obj);
      }
      if (noDic && mesmosCampos(noDic.obj, noDic.chaves, entrada, chaves, chaves.length - 1)) {
        ref = [entrada.id, entrada.approvalStatus];
      }
    }
    memoPatrocinador.set(entrada, ref);
    return ref;
  };

  const { formas, indice } = criarFormas();
  const pecas: any[][] = new Array(itens.length);
  for (let p = 0; p < itens.length; p++) {
    const item = itens[p];
    const chaves = chavesSerializaveis(item);
    const linha: any[] = new Array(chaves.length + 1);
    linha[0] = indice(chaves);
    for (let k = 0; k < chaves.length; k++) {
      const chave = chaves[k];
      const valor = item[chave];
      if (chave === "event") {
        const ref = refDoEvento(valor, item.kitRemessaId);
        linha[k + 1] = ref ?? valor;
      } else if (chave === "sponsors" && Array.isArray(valor)) {
        const lista = new Array(valor.length);
        for (let s = 0; s < valor.length; s++) lista[s] = refDoPatrocinador(valor[s]) ?? valor[s];
        linha[k + 1] = lista;
      } else {
        linha[k + 1] = valor;
      }
    }
    pecas[p] = linha;
  }

  return { formato: MARCA_PECAS, v: 1, eventos, eventosDoKit, patrocinadores, formas, pecas };
}

/**
 * O inverso de compactarPecas, sobre o JSON já parseado. O MESMO objeto de
 * evento (e de patrocinador com o mesmo status) é compartilhado entre as
 * peças: nenhuma tela muta `item.event`/`item.sponsors` (conferido em
 * 17/09 — as telas espalham `{...i}` antes de mudar), e compartilhar poupa
 * dezenas de milhares de objetos repetidos na memória da aba.
 */
export function expandirPecas(c: PecasCompactas): Obj[] {
  const evPorId = new Map<string, Obj>();
  for (const e of c.eventos ?? []) if (e && typeof e.id === "string") evPorId.set(e.id, e);
  const doKit = c.eventosDoKit ?? {};
  const spPorId = new Map<string, Obj>();
  for (const s of c.patrocinadores ?? []) if (s && typeof s.id === "string") spPorId.set(s.id, s);
  const entradas = new Map<string, Obj>();

  const formas = c.formas ?? [];
  const posEvento = formas.map((f) => f.indexOf("event"));
  const posSponsors = formas.map((f) => f.indexOf("sponsors"));
  const modelos = formas.map(modeloDaForma);

  const linhas = c.pecas ?? [];
  const saida: Obj[] = new Array(linhas.length);
  for (let p = 0; p < linhas.length; p++) {
    const linha = linhas[p];
    const fi = linha[0] as number;
    const forma = formas[fi];
    const iEv = posEvento[fi];
    const iSp = posSponsors[fi];
    const obj: Obj = { ...modelos[fi] };
    for (let k = 0; k < forma.length; k++) {
      let valor = linha[k + 1];
      if (k === iEv && typeof valor === "string") {
        valor = Object.prototype.hasOwnProperty.call(doKit, valor) ? doKit[valor] : evPorId.get(valor);
      } else if (k === iSp && Array.isArray(valor)) {
        const lista = new Array(valor.length);
        for (let s = 0; s < valor.length; s++) {
          const ref = valor[s];
          if (!Array.isArray(ref)) { lista[s] = ref; continue; }
          const [id, status] = ref as [string, unknown];
          const chave = `${id} ${JSON.stringify(status)}`;
          let entrada = entradas.get(chave);
          if (!entrada) {
            entrada = { ...spPorId.get(id), approvalStatus: status };
            entradas.set(chave, entrada);
          }
          lista[s] = entrada;
        }
        valor = lista;
      }
      obj[forma[k]] = valor;
    }
    saida[p] = obj;
  }
  return saida;
}

/**
 * Devolve a resposta de uma rota de peças no formato de SEMPRE, venha ela
 * compacta ou não: array cheio, ou o delta `{ delta, agora, itens, removidas,
 * eventos, patrocinadores }`. Resposta que não é compacta (servidor antigo
 * durante o deploy, rota sem suporte) passa intacta.
 */
export function expandirResposta(corpo: unknown): unknown {
  if (!ehPecasCompactas(corpo)) return corpo;
  const itens = expandirPecas(corpo);
  if (corpo.delta !== true) return itens;
  return {
    delta: true,
    agora: corpo.agora,
    itens,
    removidas: corpo.removidas,
    eventos: corpo.eventos,
    patrocinadores: corpo.patrocinadores,
  };
}

// ─── dados de aprovação em lote (Atendimento) ────────────────────────────────

/**
 * GET /api/items/batch-approval-data: `sponsorsByItem` repetia o patrocinador
 * inteiro por vínculo e `approvalsByItem` o repetia de novo em cada aprovação
 * (5,8 MB medidos). Compacto: patrocinador vira id, aprovação vira linha.
 */
export function compactarAprovacoes(dados: {
  sponsorsByItem: Record<string, Obj[]>;
  approvalsByItem: Record<string, Obj[]>;
}): AprovacoesCompactas {
  const patrocinadores: Obj[] = [];
  const spPorId = new Map<string, { obj: Obj; chaves: string[] }>();
  const memo = new Map<Obj, string | null>();
  const refDo = (s: unknown): string | null => {
    if (!s || typeof s !== "object" || Array.isArray(s) || typeof (s as Obj).id !== "string") return null;
    const sp = s as Obj;
    const lembrada = memo.get(sp);
    if (lembrada !== undefined) return lembrada;
    const chaves = chavesSerializaveis(sp);
    let noDic = spPorId.get(sp.id);
    let ref: string | null = null;
    if (!noDic) {
      noDic = { obj: sp, chaves };
      spPorId.set(sp.id, noDic);
      patrocinadores.push(sp);
      ref = sp.id;
    } else if (mesmosCampos(noDic.obj, noDic.chaves, sp, chaves, chaves.length)) {
      ref = sp.id;
    }
    memo.set(sp, ref);
    return ref;
  };

  const sponsorsByItem: Record<string, Array<string | Obj>> = {};
  for (const itemId of Object.keys(dados.sponsorsByItem ?? {})) {
    sponsorsByItem[itemId] = dados.sponsorsByItem[itemId].map((s) => refDo(s) ?? s);
  }

  const { formas, indice } = criarFormas();
  const approvalsByItem: Record<string, any[][]> = {};
  for (const itemId of Object.keys(dados.approvalsByItem ?? {})) {
    approvalsByItem[itemId] = dados.approvalsByItem[itemId].map((a) => {
      const chaves = chavesSerializaveis(a);
      const linha: any[] = new Array(chaves.length + 1);
      linha[0] = indice(chaves);
      for (let k = 0; k < chaves.length; k++) {
        const valor = a[chaves[k]];
        // `sponsor` é objeto (referência) ou null; texto nunca — então o id em
        // texto é inequívoco na volta.
        linha[k + 1] = chaves[k] === "sponsor" ? (refDo(valor) ?? valor) : valor;
      }
      return linha;
    });
  }
  return { formato: MARCA_APROVACOES, v: 1, patrocinadores, sponsorsByItem, formas, approvalsByItem };
}

export function expandirAprovacoes(c: AprovacoesCompactas): {
  sponsorsByItem: Record<string, Obj[]>;
  approvalsByItem: Record<string, Obj[]>;
} {
  const spPorId = new Map<string, Obj>();
  for (const s of c.patrocinadores ?? []) if (s && typeof s.id === "string") spPorId.set(s.id, s);
  const resolver = (v: unknown) => (typeof v === "string" ? spPorId.get(v) : v);

  const sponsorsByItem: Record<string, Obj[]> = {};
  for (const itemId of Object.keys(c.sponsorsByItem ?? {})) {
    sponsorsByItem[itemId] = c.sponsorsByItem[itemId].map(resolver) as Obj[];
  }
  const formas = c.formas ?? [];
  const posSponsor = formas.map((f) => f.indexOf("sponsor"));
  const modelos = formas.map(modeloDaForma);
  const approvalsByItem: Record<string, Obj[]> = {};
  for (const itemId of Object.keys(c.approvalsByItem ?? {})) {
    approvalsByItem[itemId] = c.approvalsByItem[itemId].map((linha) => {
      const fi = linha[0] as number;
      const forma = formas[fi];
      const obj: Obj = { ...modelos[fi] };
      for (let k = 0; k < forma.length; k++) {
        obj[forma[k]] = k === posSponsor[fi] ? resolver(linha[k + 1]) : linha[k + 1];
      }
      return obj;
    });
  }
  return { sponsorsByItem, approvalsByItem };
}
