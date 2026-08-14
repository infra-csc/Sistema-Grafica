// ─────────────────────────────────────────────────────────────────────────────
// QUANTO DA TRILHA É RECONSTRUÇÃO — medido, antes e depois.
//
// O dono viu 4.287 de 4.755 linhas do Histórico sem autor e disse que isso não
// pode acontecer de forma alguma. A investigação do commit 1aa3b54 provou que
// aquelas linhas nunca foram registros: com o teto de 500 registros da rota, a
// tela recebia os 500 logs mais recentes do sistema INTEIRO e sintetizava o
// resto da lista a partir de carimbos de data das tabelas de eventos e peças.
// Carimbo é data, não é gente — não havia autor a consultar.
//
// Este arquivo mede o efeito de tirar o teto, no MOTOR DE VERDADE
// (client/src/lib/timeline.ts), sobre o MESMO conjunto de dados:
//
//   ANTES  → buildTimeline com os 500 logs mais recentes (o teto)
//   DEPOIS → buildTimeline com a trilha inteira (o cursor da rota)
//
// Não há banco nos testes desta casa, então o conjunto é sintético — mas com a
// forma medida em produção: ~1.100 peças, dezenas de eventos, uma minoria
// LEGADA (peças anteriores à trilha, que nunca geraram log nenhum). É essa
// minoria que sobra como "reconstruído" no fim, e é isso que a categoria
// sempre deveria ter significado.
//
// Os números que este arquivo afirma são os que vão para o relatório. Se um dia
// o motor voltar a inventar linhas sem autor tendo log disponível, a conta
// muda e o teste fica vermelho.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { buildTimeline, type TimelineEvent } from "@/lib/timeline";

const EVENTOS = 40;
const ITENS = 1112;
/** Peças anteriores à trilha: existem na tabela e não têm log nenhum. */
const LEGADAS = 90;
/** O teto que existia na rota — a janela que a tela recebia. */
const TETO_ANTIGO = 500;

const T0 = Date.UTC(2026, 0, 1, 12, 0, 0);
const iso = (passo: number) => new Date(T0 + passo * 60_000).toISOString();

interface Conjunto {
  events: any[];
  items: any[];
  logs: any[];
}

/**
 * Ciclo de vida completo de uma peça, como as rotas gravam hoje: criação,
 * liberação para produção, lançamento de produção e entrega. As frases de
 * `details` são as de server/routes/items.ts — é por elas que o motor
 * reconhece o tipo da linha.
 */
function montarConjunto(): Conjunto {
  const events: any[] = [];
  const items: any[] = [];
  const logs: any[] = [];
  let passo = 0;

  for (let e = 0; e < EVENTOS; e++) {
    const id = `evt-${e}`;
    events.push({ id, name: `Evento ${e}`, createdAt: iso(passo) });
    logs.push({
      id: `log-ev-${e}`, userName: "Marina Alves", userId: "u-marina",
      action: "created", entityType: "event", entityId: id,
      details: `Evento "Evento ${e}" criado`, createdAt: iso(passo),
    });
    passo += 1;
  }

  for (let i = 0; i < ITENS; i++) {
    const id = `item-${i}`;
    const eventId = `evt-${i % EVENTOS}`;
    const nascimento = passo;
    items.push({
      id, eventId,
      displayId: `ITEM-${String(i).padStart(4, "0")}`,
      type: "Banner 2x1",
      quantity: 10,
      status: "delivered",
      createdAt: iso(nascimento),
      updatedAt: iso(nascimento + 3),
      creatorReviewedAt: iso(nascimento + 1),
      productionStartedAt: iso(nascimento + 2),
      quantityProduced: 10,
      deliveredAt: iso(nascimento + 3),
      receivedBy: "Portaria",
    });
    passo += 4;

    if (i < LEGADAS) continue; // peça legada: nenhuma linha de auditoria

    const autor = { userName: "Ana Souza", userId: "u-ana" };
    logs.push({
      id: `log-${id}-c`, ...autor, action: "created", entityType: "item", entityId: id,
      details: `Peça "Banner 2x1" adicionada`, createdAt: iso(nascimento),
    });
    logs.push({
      id: `log-${id}-a`, ...autor, action: "approved", entityType: "item", entityId: id,
      details: "Item liberado para produção pelo criador", createdAt: iso(nascimento + 1),
    });
    logs.push({
      id: `log-${id}-p`, ...autor, action: "production", entityType: "item", entityId: id,
      details: "Produção: 10/10 un. (Em Produção → Produzido)", createdAt: iso(nascimento + 2),
    });
    logs.push({
      id: `log-${id}-d`, ...autor, action: "delivered", entityType: "item", entityId: id,
      details: "Peça entregue (10 un.)", createdAt: iso(nascimento + 3),
    });
  }

  // A rota entrega sempre do mais novo para o mais antigo.
  logs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return { events, items, logs };
}

const conjunto = montarConjunto();

function medir(logs: any[]) {
  const linhas = buildTimeline(conjunto.events, conjunto.items, logs);
  const contar = (fonte: TimelineEvent["authorSource"]) =>
    linhas.filter(l => l.authorSource === fonte).length;
  return {
    total: linhas.length,
    reconstruido: contar("derived"),
    semRegistro: contar("unrecorded"),
    comAutor: contar("log") + contar("system"),
    linhas,
  };
}

const antes = medir(conjunto.logs.slice(0, TETO_ANTIGO));
const depois = medir(conjunto.logs);

describe("o conjunto de medição reproduz a forma de produção", () => {
  it("tem o volume da tela do dono: ~1.100 peças, dezenas de eventos", () => {
    expect(conjunto.items).toHaveLength(ITENS);
    expect(conjunto.events).toHaveLength(EVENTOS);
    expect(conjunto.logs.length).toBe(EVENTOS + (ITENS - LEGADAS) * 4);
  });

  it("a trilha inteira é MUITO maior que o teto de 500 — é esse o problema", () => {
    expect(conjunto.logs.length).toBeGreaterThan(TETO_ANTIGO * 8);
  });
});

describe("ANTES — com o teto de 500, a tela é quase toda reconstrução", () => {
  it("a janela de 500 logs cobre só as peças mais recentes", () => {
    expect(antes.total).toBe(4_613);
    expect(antes.reconstruido).toBe(3_988);
    expect(antes.comAutor).toBe(625);
  });

  it("é a proporção que o dono viu: mais de 85% da lista sem autor possível", () => {
    expect(antes.reconstruido / antes.total).toBeGreaterThan(0.85);
  });
});

describe("DEPOIS — com a trilha inteira, reconstrução vira exceção", () => {
  it("sobram apenas as peças legadas, que nunca geraram log", () => {
    expect(depois.total).toBe(5_510);
    expect(depois.reconstruido).toBe(LEGADAS * 4);
    expect(depois.comAutor).toBe(5_150);
  });

  it("cai de mais de 85% para menos de 7% da lista", () => {
    expect(depois.reconstruido / depois.total).toBeLessThan(0.07);
  });

  it("a queda é de mais de dez vezes em número absoluto de linhas sem autor", () => {
    expect(antes.reconstruido / depois.reconstruido).toBeGreaterThan(10);
  });
});

describe("a reconstrução não morre — encolhe para o que ela é de fato", () => {
  it("toda linha reconstruída que sobrou pertence a uma peça sem log nenhum", () => {
    const legadas = new Set(
      conjunto.items.slice(0, LEGADAS).map((i: any) => i.id),
    );
    const forasteiras = depois.linhas
      .filter(l => l.authorSource === "derived")
      .filter(l => !l.itemId || !legadas.has(l.itemId));
    expect(forasteiras).toHaveLength(0);
  });

  it("nenhuma linha reconstruída carrega autor — carimbo é data, não é gente", () => {
    const comNome = depois.linhas.filter(l => l.authorSource === "derived" && l.userName);
    expect(comNome).toHaveLength(0);
  });

  it("nenhum registro chega sem autor: 'Sistema' é o pior caso, nunca vazio", () => {
    expect(antes.semRegistro).toBe(0);
    expect(depois.semRegistro).toBe(0);
  });

  it("completar a trilha só ACRESCENTA linhas — nada do que já se via some", () => {
    const antesIds = new Set(antes.linhas.map(l => l.id));
    const depoisIds = new Set(depois.linhas.map(l => l.id));
    // As linhas sintéticas de liberação/produção são a única exceção legítima:
    // quando o log aparece, a linha reconstruída dá lugar à registrada, com o
    // mesmo fato e agora com autor.
    const sumiram = [...antesIds].filter(id => !depoisIds.has(id));
    const sinteticasSubstituidas = sumiram.filter(
      id => id.startsWith("item-approved-") || id.startsWith("production-item-"),
    );
    expect(sumiram.length).toBe(sinteticasSubstituidas.length);
    expect(depois.total).toBeGreaterThan(antes.total);
  });
});

describe("ordem da concatenação — o que o cliente entrega ao motor", () => {
  it("primeira página + páginas seguintes dá o mesmo resultado que a trilha inteira", () => {
    // É exatamente o que historico.tsx monta: os 500 da primeira página, e
    // depois as páginas anteriores concatenadas na ordem em que chegam.
    const primeira = conjunto.logs.slice(0, TETO_ANTIGO);
    const seguintes = conjunto.logs.slice(TETO_ANTIGO);
    const concatenado = medir(primeira.concat(seguintes));
    expect(concatenado.total).toBe(depois.total);
    expect(concatenado.reconstruido).toBe(depois.reconstruido);
  });

  it("registro repetido entre páginas não duplica linha na tela", () => {
    // A janela dos 500 anda para frente enquanto o cliente caminha para trás:
    // uma linha pode voltar na página seguinte. historico.tsx deduplica por id
    // antes de montar; aqui se prova que ele PRECISA fazer isso.
    const comRepetido = conjunto.logs.concat(conjunto.logs.slice(0, 10));
    expect(medir(comRepetido).total).toBeGreaterThan(depois.total);
  });
});
