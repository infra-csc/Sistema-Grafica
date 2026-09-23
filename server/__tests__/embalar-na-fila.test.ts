// ─────────────────────────────────────────────────────────────────────────────
// EMBALAR NA FILA DA GRÁFICA (dono, 21/09): "não aparece para embalar" — a
// peça conferida só mostrava "Entregar". E, no mesmo dia: "o tubo só na hora
// de embalar; tire da conferência".
//
// O que este arquivo pina:
//   · a peça CONFERIDA tem "Embalar" como ação principal (linha e cartão), e
//     "Entregar" continua acessível como secundária (peça grande sem tubo);
//   · "Embalar" abre o painel de tubos do evento JÁ com a peça marcada, focado
//     em escolher o tubo — um toque no tubo aberto (PATCH adicionar) ou em
//     "Novo tubo" (POST) embala, com toast "#0381 embalada no Tubo 2";
//   · a EMBALADA tem "Entregar tubo" (abre o painel naquele tubo) e o "Tirar
//     do tubo" fica pendente só na linha clicada;
//   · "Embalar em lote": marcar várias conferidas de UM evento e escolher o
//     tubo uma vez só;
//   · paridade tabela × cartão, 44px no celular, e a linha memoizada lê o que
//     precisa para redesenhar.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { fonteDaGrafica, fonteDe } from "./fonte-da-grafica";
import { gatesDaGrafica } from "../../client/src/components/grafica/fila/regras";

const RAIZ = path.resolve(__dirname, "../..");
const ler = (rel: string) => readFileSync(path.resolve(RAIZ, rel), "utf8");
const GRAFICA = fonteDaGrafica();
const PAINEL = ler("client/src/components/tubos-dialog.tsx");

// Os dois layouts da fila: a tabela (desktop) e os cartões (celular/tablet),
// cada um com o arquivo das suas ações.
const FILA = "client/src/components/grafica/fila";
const CARTOES = fonteDe(`${FILA}/cartao-da-peca.tsx`) + fonteDe(`${FILA}/acoes-do-cartao.tsx`);
const TABELA = fonteDe(`${FILA}/linha-da-tabela.tsx`) + fonteDe(`${FILA}/acoes-da-linha.tsx`);

// Peça conferida de um evento, pronta para embalar (o resto por cima).
const conferida = (extra: Record<string, unknown> = {}) => ({
  id: "p1", eventId: "ev1", type: "Banner", status: "conferred", quantity: 10, conferredQty: 10, embaladaQty: 0, deliveredQty: 0, ...extra,
}) as never;

describe("o gate de embalar", () => {
  it("é quem tem unidade CONFERIDA ainda não embalada (a inteira, a parcial e a dividida) — e nada de evento aberto", () => {
    // O gate é função pura (fila/regras.ts): prova-se pelo comportamento.
    const { podeEmbalar } = gatesDaGrafica({ role: "grafica" });
    expect(podeEmbalar(conferida())).toBe(true);                                        // a inteira
    expect(podeEmbalar(conferida({ status: "produced", conferredQty: 7 }))).toBe(true); // a parcial (7 de 10)
    expect(podeEmbalar(conferida({ embaladaQty: 3 }))).toBe(true);                      // a que já foi em parte
    expect(podeEmbalar(conferida({ embaladaQty: 10 }))).toBe(false);                    // nada a embalar
    expect(podeEmbalar(conferida({ status: "packed" }))).toBe(false);
    expect(podeEmbalar(conferida({ status: "delivered", deliveredQty: 10 }))).toBe(false);
    expect(podeEmbalar(conferida({ status: "awaiting_final_review" }))).toBe(false);    // em revisão só se vê
    expect(podeEmbalar(conferida({ eventId: null }))).toBe(false);                      // o tubo é de um evento
    // Evento finalizado NÃO barra: conferir, embalar e entregar passam no finalizado.
    expect(podeEmbalar(conferida({ event: { status: "closed", startDate: "2020-01-01" } }))).toBe(true);
    // A Solicitação da Arena só VÊ a peça do Kit.
    expect(gatesDaGrafica({ role: "solicitacao", kit: false }).podeEmbalar(conferida({ kitRemessaId: "k1" }))).toBe(false);
    // helpers de saldo, não uma comparação de string solta
    expect(fonteDe(`${FILA}/regras.ts`)).toMatch(/import \{[^}]*\bisPacked\b[^}]*\} from "@\/lib\/saldo"/);
  });

  it("abre o painel de tubos do evento da peça já com ela marcada", () => {
    expect(GRAFICA).toContain('setTubosDoEvento({ id: String(primeira.eventId), name: primeira.event?.name ?? "Evento", embalar: itens.map((i) => i.id), ...(lote ? { lote: true } : {}) });');
    // O "Embalar em lote" marca a flag, e o painel a recebe (22/09: o lote não entra no atalho de peça sozinha).
    expect(GRAFICA).toContain("itensIniciais={tubosDoEvento?.embalar} emLote={tubosDoEvento?.lote} tuboInicial={tubosDoEvento?.entregarTubo ?? undefined}");
  });
});

describe("a peça conferida na fila", () => {
  it("tabela: Embalar é a ÚNICA ação da conferida (azul do Embalado) — sem Entregar, nem no ⋯", () => {
    expect(TABELA).toContain("data-testid={`button-embalar-${item.id}`}");
    expect(TABELA).toContain("{!bulkOn && podeEmbalarPeca && (");
    // Azul do Embalado (TOM.info.text = #1d4ed8, 6,3:1 com branco) pela tinta da ação.
    expect(TABELA).toMatch(/data-testid=\{`button-embalar-\$\{item\.id\}`\}[\s\S]{0,120}style=\{corDaAcao\(TOM\.info\.text\)\}/);
    // a entrega por peça saiu da tela (quem entrega é o volume): nem principal, nem no "⋯"
    expect(TABELA).not.toContain("canDeliver(item)");
    expect(TABELA).not.toContain("button-deliver-");
  });

  it("cartão: mesma coisa, com 48px de alvo e Entregar de contorno", () => {
    expect(CARTOES).toContain("data-testid={`button-embalar-card-${item.id}`}");
    expect(CARTOES).toContain("onClick={e => { e.stopPropagation(); abrirEmbalar([item]); }}");
    expect(CARTOES).toContain("style={{ ...corDaAcao(TOM.info.text), order: 0, flex: '2 1 150px', minHeight: 48, padding: '0 12px' }}");
    // a entrega por peça saiu do cartão também — a embalada sai pelo "Entregar tubo"
    expect(CARTOES).not.toContain("button-entregar-card-");
    expect(CARTOES).toContain("data-testid={`button-entregar-tubo-card-${item.id}`}");
  });

  it("paridade: o gate da linha e do cartão é o MESMO helper", () => {
    expect(TABELA).toContain("const podeEmbalarPeca = podeEmbalar(item);");
    expect(CARTOES).toContain("const podeEmbalarPeca = podeEmbalar(item);");
  });

  it("a linha memoizada redesenha pelo modo de lote e só a peça clicada fica pendente ao tirar do tubo", () => {
    expect(GRAFICA).toContain("user, bulkOn, bulkConferMode, bulkPackMode, compacto,");
    expect(GRAFICA).toContain("tirarDoTuboMutation.isPending && tirarDoTuboMutation.variables?.itemId === item.id,\n    tubaveisPorEvento");
    expect(GRAFICA).not.toMatch(/\n    tirarDoTuboMutation\.isPending,\n/);
    // Tabela e cartão: SÓ o botão da peça clicada fica ocupado (o Botao desabilita e mostra o spinner).
    expect(GRAFICA.match(/carregando=\{tirarDoTuboMutation\.isPending && tirarDoTuboMutation\.variables\?\.itemId === item\.id\}/g)?.length).toBe(2);
  });
});

describe("a peça embalada", () => {
  it("tem 'Entregar tubo' na tabela e no cartão, que abre o painel naquele tubo", () => {
    expect(TABELA).toContain("data-testid={`button-entregar-tubo-${item.id}`}");
    expect(CARTOES).toContain("data-testid={`button-entregar-tubo-card-${item.id}`}");
    // os dois botões abrem a ENTREGA; o selo abre o MODAL DO TUBO (o que vai junto)
    expect(GRAFICA.split("entregarTubo: item.tuboId })").length - 1).toBe(2);
    expect(GRAFICA).toContain("verTubo: item.tuboId });");
    // a porta escolhe o modal: Embalar, Entregar tubo ou o painel
    expect(PAINEL).toContain('const direto = itensIniciais?.length ? "embalar" : tuboInicial ? "entregar" : verTubo ? "ver" : null;');
  });

  it("ENTREGAR É SÓ DO TUBO: a embalada não tem Entregar individual nem entra no lote de entrega", () => {
    // a entrega por peça está aposentada: nada entrega fora do volume — e o
    // código dela (gate, lote de entrega, fila de entrega do galpão) saiu
    expect(GRAFICA).not.toContain("canDeliver");
    expect(GRAFICA).not.toContain("deliverableInFilter");
    // na tabela, Entregar tubo é a sólida
    expect(TABELA).toContain('title="Entregar o tubo inteiro — a peça embalada só sai com o tubo"');
  });

  it("o selo lista os volumes com a quantidade ('Tubo 1 (7) · Tubo 2 (3)'), o title lista o conteúdo do tubo e o toque abre o tubo", () => {
    expect(GRAFICA).toContain("return falta + seloDosVolumes(volumes);");
    expect(GRAFICA).toContain("linhaDaLista({ ...x, quantity: l.quantidade })");
    expect(GRAFICA.match(/title=\{tituloDoTubo\(item\)\}/g)?.length).toBe(2);
    expect(GRAFICA.match(/abrirTuboDaPeca\(item\); \}\}/g)?.length).toBe(2);
    // a linha memoizada redesenha quando o conteúdo do tubo muda
    expect(GRAFICA).toContain("item.tuboId ? conteudoDoTubo.get(item.tuboId)?.lista ?? null : null,");
  });

  it("continua com 'Tirar do tubo' (sem foto) e o selo do tubo", () => {
    expect(TABELA).toContain("data-testid={`button-tirar-do-tubo-${item.id}`}");
    expect(CARTOES).toContain("data-testid={`button-tirar-do-tubo-card-${item.id}`}");
    expect(TABELA).toContain("data-testid={`chip-tubo-${item.id}`}");
    expect(CARTOES).toContain("data-testid={`chip-tubo-card-${item.id}`}");
  });
});

// O modal Embalar (tubo + foto + rodapé), o Entregar tubo e o painel são
// MONTADOS em tubos-tres-modais.test.ts — aqui ficam só a fila e o lote.

describe("Embalar em lote", () => {
  it("é um terceiro modo da barra, com as conferidas sem tubo como elegíveis", () => {
    expect(GRAFICA).toContain("const [bulkPackMode, setBulkPackMode] = useState(false);");
    expect(GRAFICA).toContain("const bulkOn = bulkConferMode || bulkPackMode;");
    expect(GRAFICA).toContain("const bulkEligibleList = bulkConferMode ? conferableInFilter : bulkPackMode ? packableInFilter : [];");
    expect(GRAFICA).toContain('data-testid="button-bulk-pack"');
    expect(TABELA).toContain("bulkPackMode ? podeEmbalarPeca : false");
    expect(CARTOES).toContain("bulkPackMode ? podeEmbalarPeca : false");
  });

  it("o Continuar vira 'Escolher o tubo', exige um evento só e abre o painel com as marcadas", () => {
    expect(GRAFICA).toContain('{bulkPackMode ? "Escolher o tubo" : "Continuar para a foto"}');
    expect(GRAFICA).toContain('toast({ title: "Marque peças de um evento só"');
    expect(GRAFICA).toContain("abrirEmbalar(bulkSelectedItems, true);");
    // embalou: sai do modo; Escape não sai do lote com o painel aberto
    expect(GRAFICA).toContain("onEmbalou={() => { if (bulkPackMode) sairDoLote(); }}");
    expect(GRAFICA).toContain("if (bulkConferOpen || tubosDoEvento || viewDetailsItem || selectedItem) return;");
    expect(GRAFICA).toContain("setBulkConferMode(false);\n    setBulkPackMode(false);");
  });
});
