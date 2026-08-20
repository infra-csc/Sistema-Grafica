// ─────────────────────────────────────────────────────────────────────────────
// PAINEL GERAL: STATUS É POSIÇÃO; FALTAVA DURAÇÃO.
//
// O painel respondia ONDE as peças estão e nunca DESDE QUANDO. 1.129 peças em
// "Aguardando envio" pode ser vazão normal ou travamento de duas semanas — e é
// essa, inteira, a pergunta de quem procura gargalo.
//
// A DECISÃO QUE ESTE ARQUIVO GUARDA, e que é fácil desfazer sem perceber:
// peça sem registro de mudança de status NÃO GANHA IDADE NA TELA. A tentação é
// usar `createdAt` — "melhor um número do que nenhum". Seria pior: uma peça
// criada há oito meses que entrou em aprovação ontem apareceria como "parada há
// 240 dias", e quem procura gargalo agiria sobre um número inventado. Um campo
// vazio diz "não sei"; um número errado diz "sei" e mente.
//
// Por que uma coluna nova (`items.status_changed_at`) e não os dados que já
// existiam:
//   · `updatedAt` muda em QUALQUER edição (observação, quantidade, thumb) —
//     mede a última vez que alguém TOCOU na peça, não a última vez que ela ANDOU.
//   · o audit_log registra as transições, mas em texto livre ("Status alterado:
//     X → Y") com `action` variado, e este painel deixou de baixar a tabela
//     inteira de propósito (o comentário registra: em 1 ano, megabytes por
//     visita).
//   · os carimbos por etapa (sponsorApprovedAt, approvedAt, producedAt…) só
//     existem da metade do fluxo para frente. Não há carimbo para
//     awaiting_linking, awaiting_submission nem awaiting_approval — que é
//     exatamente onde está a maior fila.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const raiz = (p: string) => readFileSync(path.resolve(__dirname, "../../", p), "utf8");
const tela = raiz("client/src/pages/painel-geral.tsx");
const schema = raiz("shared/schema.ts");
const storage = raiz("server/storage.ts");

const codigo = tela
  .replace(/\r\n/g, "\n")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .map(l => l.replace(/^\s*\/\/.*$/, ""))
  .join("\n");

function contraste(a: string, b: string): number {
  const lum = (h: string) => {
    const c = [1, 3, 5]
      .map(i => parseInt(h.slice(i, i + 2), 16) / 255)
      .map(v => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

describe("a fonte do tempo no estado", () => {
  it("é uma coluna própria, não `updatedAt`", () => {
    expect(schema).toContain('statusChangedAt: timestamp("status_changed_at")');
  });

  it("o servidor carimba num lugar só, e sem ler antes de escrever", () => {
    // `updateItem` é o funil por onde todas as ~30 rotas de mudança de status
    // passam: uma rota nova nasce carimbando de graça.
    //
    // A comparação vai no SQL (`IS DISTINCT FROM`) e não num SELECT antes do
    // UPDATE: ler-para-decidir abriria uma janela entre a leitura e a escrita
    // em que outra requisição muda o status — e o carimbo sairia errado
    // justamente nas peças mais movimentadas, que são as que interessam.
    expect(storage).toContain("IS DISTINCT FROM");
    expect(storage).toContain("updateData.statusChangedAt = sql`CASE WHEN");
  });

  it("e a rota otimista carimba porque o WHERE já provou a transição", () => {
    const i = storage.indexOf("async updateItemWithStatusCheck");
    const bloco = storage.slice(i, i + 900);
    expect(bloco).toContain("statusChangedAt: new Date()");
  });
});

describe("nada de idade inventada", () => {
  it("sem carimbo, `diasNoEstado` devolve null", () => {
    const i = tela.indexOf("function diasNoEstado");
    const bloco = tela.slice(i, i + 400);
    expect(bloco).toContain("if (!bruto) return null;");
    expect(bloco).toContain("if (!Number.isFinite(t)) return null;");
    // O que ele NÃO faz: cair para createdAt.
    expect(bloco).not.toContain("createdAt");
  });

  it("a linha da peça não desenha nada quando é null", () => {
    expect(tela).toContain("if (d === null) return null;");
  });

  it("a frase da maior fila cala quando não há nenhuma carimbada", () => {
    expect(tela).toContain("{mediaDaMaior !== null && (() => {");
    expect(tela).toContain("return idades.length ? Math.round(idades.reduce((t, d) => t + d, 0) / idades.length) : null;");
  });

  it("e o backfill deixa NULL onde não há fonte", () => {
    const script = raiz("scripts/backfill-status-changed-at.ts");
    expect(script).toContain("IS NOT NULL");
    expect(script).toContain("status_changed_at IS NULL");
    // Idempotente: só toca linha ainda sem carimbo.
    expect(script).not.toContain("created_at");
  });
});

describe("a escala de tom", () => {
  it("até o limite é fluxo, e fica discreto", () => {
    // Pintar de vermelho tudo que tem três dias transformaria o alerta em papel
    // de parede e a tela em ruído.
    expect(tela).toContain("const LIMITE_PARADA = 7;");
    const i = tela.indexOf("function tomDaIdade");
    const bloco = tela.slice(i, i + 300);
    expect(bloco).toContain('if (dias > 14) return { cor: "#b91c1c", peso: 700 };');
    expect(bloco).toContain('if (dias > LIMITE_PARADA) return { cor: "#b45309", peso: 700 };');
    expect(bloco).toContain('return { cor: "#746e69", peso: 500 };');
  });

  it("o peso sobe junto com a cor — cor sozinha não é sinal", () => {
    // Para quem não distingue as cores, o peso é o que resta.
    expect(tela).toContain("fontWeight: tom.peso");
  });

  it.each([
    ["#746e69", "#ffffff", "idade em fluxo sobre branco"],
    ["#746e69", "#fcfcfb", "idade em fluxo sobre a zebra"],
    ["#b45309", "#ffffff", "parada acima de 7 dias"],
    ["#b45309", "#fcfcfb", "parada acima de 7 dias, na zebra"],
    ["#b91c1c", "#ffffff", "parada acima de 14 dias"],
    ["#b91c1c", "#fcfcfb", "parada acima de 14 dias, na zebra"],
    ["#7a6154", "#fafaf9", "rótulo da marca de zona"],
    ["#57534e", "#fafaf9", "contagem da marca de zona"],
  ])("%s sobre %s — %s", (frente, fundo) => {
    expect(contraste(frente, fundo)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("os três lugares onde o tempo aparece", () => {
  it("na frase da maior fila", () => {
    expect(tela).toContain('data-testid="texto-idade-maior-fila"');
    expect(tela).toContain("· parada {idadePorExtenso(mediaDaMaior)} em média");
  });

  it("na linha da peça, e a coluna mudou de nome", () => {
    expect(tela).toContain("data-testid={`cell-idade-${item.id}`}");
    expect(tela).toContain('Status · tempo{seta("status")}');
    expect(tela).toContain("Parada em ${getStatusMeta(item.status).label}");
  });

  it("e a ordenação dessa coluna ordena por TEMPO, não por etapa", () => {
    // Ordenar por etapa só reagrupa o que os cards já agrupam.
    const i = tela.indexOf('if (sortBy === "status")');
    const bloco = tela.slice(i, i + 700);
    expect(bloco).toContain("const ia = diasNoEstado(a, Date.now()), ib = diasNoEstado(b, Date.now());");
    // Sem carimbo vai para o fim: não é "a mais nova", é desconhecida.
    expect(bloco).toContain("if (ia === null) return 1;");
    expect(bloco).toContain("if (ib === null) return -1;");
  });

  it("no cabeçalho do evento, e sem encolher", () => {
    expect(tela).toContain("data-testid={`chip-paradas-${eventKey}`}");
    // Mesma regra do chip de prazo: dado acionável não pode ser clipado em
    // silêncio quando a largura aperta.
    const i = tela.indexOf("data-testid={`chip-paradas-");
    expect(tela.slice(i, i + 700)).toContain("flexShrink: 0");
    // Só acima do limite — abaixo dele a peça está em fluxo.
    expect(tela).toContain("x.d !== null && x.d > LIMITE_PARADA");
  });
});

describe("as zonas da barra do fluxo", () => {
  it("o vão não mexe nas larguras — a soma continua 100%", () => {
    expect(tela).toContain('borderRight: fechaZona ? "2px solid #fafaf9" : "none"');
    expect(tela).toContain("const fechaZona = i < segmentos.length - 1 && segmentos[i + 1].zona !== seg.zona;");
  });

  it("cada marca tem a largura da soma da sua zona, com elipse", () => {
    expect(tela).toContain("data-testid={`zona-tick-${z.nome}`}");
    expect(tela).toContain('borderLeft: "1px solid #ddd8d1", paddingLeft: 7, overflow: "hidden"');
    // Zona estreita não pode empurrar as outras.
    expect(tela).toContain('textOverflow: "ellipsis"');
  });

  it("no celular as marcas somem — três rótulos não cabem em 390px", () => {
    expect(tela).toContain("{!useCards && (");
  });

  it("a zona e a idade entram no title do segmento", () => {
    const i = tela.indexOf("data-testid={`fluxo-seg-");
    const bloco = tela.slice(i, i + 900);
    expect(bloco).toContain("${seg.zona} · ${seg.meta.label}");
    expect(bloco).toContain("parada ${idadePorExtenso(idadeDoSegmento(seg.k)!)} em média");
  });

  it("e o rótulo usa uma receita de caixa-alta que já existia", () => {
    // A casa tem duas receitas (10/800/0.08em e 10/900/0.12em) e um teste que
    // conta quantas existem. A primeira versão desta marca inventou uma
    // terceira (0.06em) e foi pega por ele.
    const i = tela.indexOf("data-testid={`zona-tick-");
    expect(tela.slice(i, i + 600)).toContain('letterSpacing: "0.08em"');
  });
});

describe("a seleção diz do que é feita", () => {
  it("mostra a composição por status", () => {
    // "12 selecionadas" não diz se são doze aguardando aprovação ou onze
    // entregues e uma reprovada — e a ação que faz sentido depende disso.
    expect(tela).toContain('data-testid="text-selecao-composicao"');
    expect(tela).toContain("const porStatus = new Map<string, number>();");
  });

  it("e corta em três situações, dizendo que há mais", () => {
    expect(tela).toContain("const visiveis = partes.slice(0, 3);");
    expect(tela).toContain("resto > 0 ? ` · +${resto}` : \"\"");
  });

  it("não ganhou botões sem rota", () => {
    // Decisão do dono (20/08): não existe rota de cobrança — patrocinador não
    // tem login e não há disparo de e-mail. Botão que não tem para onde ir é
    // pior que botão nenhum.
    expect(codigo).not.toContain("Cobrar aprovação");
    expect(codigo).not.toContain("button-bulk-cobrar");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// O QUE NÃO PODE TER SIDO MEXIDO
// ═════════════════════════════════════════════════════════════════════════════
describe("as decisões estruturais continuam de pé", () => {
  it("o `flexShrink: 0` da raiz", () => {
    // Sem ele a barra de filtros sticky perde alcance e sai da tela. O
    // comentário registra a medição (caixa em 609,6px contra conteúdo de 1224).
    expect(tela).toContain("flexShrink: 0");
  });

  it("as cadeias de sticky", () => {
    expect(tela).toContain("EVENT_HEADER_H");
    expect(tela).toContain("topOffset");
    // `overflow: clip` no cartão e `visible` na tabela são pré-requisitos.
    expect(tela).toContain("clip");
  });

  it("as duas leituras da mesma coisa — a barra e os cards", () => {
    expect(tela).toContain('data-testid={`fluxo-seg-${seg.k}`}');
    // O testid do card Total e montado por template junto com os demais.
    expect(tela).toContain("data-testid={dark ? \"stat-total\" : `stat-card-${filterKey}`}");
    expect(tela).toContain("getStatusMeta");
  });

  it("o chip de ocultas com UM algarismo só", () => {
    // O dono reprovou duas contagens diferentes na mesma frase.
    expect(tela).toContain('data-testid="chip-atencao-ocultas"');
  });

  it("hover e zebra por classe, não por mutação de style", () => {
    expect(tela).toContain("PG_CSS");
  });

  it("os tetos de renderização", () => {
    expect(tela).toContain("GROUP_CAP");
    expect(tela).toContain("ROW_CAP");
    expect(tela).toContain("button-show-all-");
  });

  it("o contraste calculado do grupo pai não foi trocado", () => {
    // #746e69 sobre #f5f5f4 dá 4,61 — passa. #78716c ali reprova, e é o
    // substituto "natural" que alguém tentaria.
    expect(contraste("#746e69", "#f5f5f4")).toBeGreaterThanOrEqual(4.5);
    expect(contraste("#78716c", "#f5f5f4")).toBeLessThan(4.5);
    expect(contraste("#44403c", "#f5f5f4")).toBeGreaterThanOrEqual(4.5);
    expect(contraste("#57534e", "#fafaf9")).toBeGreaterThanOrEqual(4.5);
  });
});
