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

const RAIZ = path.resolve(__dirname, "../..");
const ler = (rel: string) => readFileSync(path.resolve(RAIZ, rel), "utf8");
const GRAFICA = ler("client/src/pages/grafica.tsx");
const PAINEL = ler("client/src/components/tubos-dialog.tsx");

// Os dois layouts da fila: a tabela (desktop) e os cartões (celular/tablet).
const iCartoes = GRAFICA.indexOf("/* ── Cards: celular E tablet");
const iTabela = GRAFICA.indexOf('<table style={{ width: "100%", borderCollapse: "collapse" }}>', iCartoes);
const iBarra = GRAFICA.indexOf("{/* ── Barra flutuante dos modos em lote");
const CARTOES = GRAFICA.slice(iCartoes, iTabela);
const TABELA = GRAFICA.slice(iTabela, iBarra);

describe("o gate de embalar", () => {
  it("é a conferida (status conferred) sem tubo, de quem pode entregar — e nada de evento aberto", () => {
    expect(GRAFICA).toContain("const podeEmbalar = (item: any) =>\n    !EM_REVISAO.has(item.status) && canDeliver(item) && isConferred(item) && !item.tuboId && !!item.eventId;");
    // helpers de saldo, não uma comparação de string solta
    expect(GRAFICA).toContain("isDelivered, isPacked, isConferred, isPosConferencia, isProduced, isInProd,");
  });

  it("abre o painel de tubos do evento da peça já com ela marcada", () => {
    expect(GRAFICA).toContain('setTubosDoEvento({ id: String(primeira.eventId), name: primeira.event?.name ?? "Evento", embalar: itens.map((i) => i.id) });');
    expect(GRAFICA).toContain("itensIniciais={tubosDoEvento?.embalar} tuboInicial={tubosDoEvento?.entregarTubo}");
  });
});

describe("a peça conferida na fila", () => {
  it("tabela: Embalar é a principal (azul do Embalado) e Entregar vira secundária", () => {
    expect(TABELA).toContain("data-testid={`button-embalar-${item.id}`}");
    expect(TABELA).toContain("{!bulkOn && podeEmbalarPeca && (");
    expect(TABELA).toContain('backgroundColor: "#1d4ed8", color: "#ffffff",');
    // a principal Entregar só existe quando NÃO há Embalar…
    expect(TABELA).toContain("{!bulkOn && !emRevisao && canDeliver(item) && !podeEmbalarPeca && (");
    // …e a secundária mora no invólucro do menu "⋯" (na cheia é `display: contents`, fica ao lado)
    expect(TABELA).toContain("{!bulkOn && !emRevisao && podeEmbalarPeca && canDeliver(item) && (");
    expect(TABELA).toContain("|| (podeEmbalarPeca && canDeliver(item)));");
    expect(TABELA.match(/data-testid=\{`button-deliver-\$\{item\.id\}`\}/g)?.length).toBe(2);
  });

  it("cartão: mesma coisa, com 48px de alvo e Entregar de contorno", () => {
    expect(CARTOES).toContain("data-testid={`button-embalar-card-${item.id}`}");
    expect(CARTOES).toContain("onClick={e => { e.stopPropagation(); abrirEmbalar([item]); }}");
    expect(CARTOES).toContain("background: '#1d4ed8', border: 'none', color: '#fff', fontSize: 14, fontWeight: 800");
    // Entregar continua no cartão; de contorno quando há Embalar
    expect(CARTOES).toContain("data-testid={`button-entregar-card-${item.id}`}");
    expect(CARTOES).toContain("style={podeEmbalarPeca\n                                ? { order: 0, flex: '1 1 130px', minHeight: 48");
  });

  it("paridade: o gate da linha e do cartão é o MESMO helper", () => {
    expect(TABELA).toContain("const podeEmbalarPeca = podeEmbalar(item);");
    expect(CARTOES).toContain("const podeEmbalarPeca = podeEmbalar(item);");
  });

  it("a linha memoizada redesenha pelo modo de lote e só a peça clicada fica pendente ao tirar do tubo", () => {
    expect(GRAFICA).toContain("user, bulkOn, bulkDeliveryMode, bulkConferMode, bulkPackMode, compacto,");
    expect(GRAFICA).toContain("tirarDoTuboMutation.isPending && tirarDoTuboMutation.variables?.itemId === item.id,\n    tubaveisPorEvento");
    expect(GRAFICA).not.toMatch(/\n    tirarDoTuboMutation\.isPending,\n/);
    expect(GRAFICA.match(/disabled=\{tirarDoTuboMutation\.isPending && tirarDoTuboMutation\.variables\?\.itemId === item\.id\}/g)?.length).toBe(2);
  });
});

describe("a peça embalada", () => {
  it("tem 'Entregar tubo' na tabela e no cartão, que abre o painel naquele tubo", () => {
    expect(TABELA).toContain("data-testid={`button-entregar-tubo-${item.id}`}");
    expect(CARTOES).toContain("data-testid={`button-entregar-tubo-card-${item.id}`}");
    expect(GRAFICA.match(/entregarTubo: item\.tuboId \}\)/g)?.length).toBe(2);
    // o painel abre o formulário do tubo quando ele pode ser entregue
    expect(PAINEL).toContain("if (t && !t.entregueEm && t.prontoParaEntregar) { setEntregando(t.id); setFechando(null); }");
  });

  it("continua com Entregar (individual), 'Tirar do tubo' e o selo 'Tubo N'", () => {
    expect(TABELA).toContain("data-testid={`button-tirar-do-tubo-${item.id}`}");
    expect(CARTOES).toContain("data-testid={`button-tirar-do-tubo-card-${item.id}`}");
    expect(TABELA).toContain("data-testid={`chip-tubo-${item.id}`}");
    expect(CARTOES).toContain("data-testid={`chip-tubo-card-${item.id}`}");
  });
});

describe("o painel de tubos aberto pelo Embalar", () => {
  it("recebe as peças iniciais e mostra a escolha rápida do tubo, com 44px no celular", () => {
    expect(PAINEL).toContain("itensIniciais?: string[];");
    expect(PAINEL).toContain("const pecasParaEmbalar = (data?.semTubo ?? []).filter((p) => itensIniciais?.includes(p.id) && !soVisualizaKit(p));");
    expect(PAINEL).toContain('data-testid="embalar-atalho"');
    expect(PAINEL).toContain("minHeight: isMobile ? 44 : 36");
  });

  it("lista os tubos abertos (número · peças · fechado HH:MM/aberto) e 'Novo tubo'", () => {
    expect(PAINEL).toContain("{abertos.map((t) => (\n                        <button key={t.id} type=\"button\" onClick={() => embalar.mutate(t.id)}");
    expect(PAINEL).toContain("data-testid={`embalar-no-tubo-${t.numero}`}");
    expect(PAINEL).toContain("Tubo {t.numero} · {t.pecas.length} {t.pecas.length === 1 ? \"peça\" : \"peças\"} · {t.fechadoEm ? `fechado ${horaDe(t.fechadoEm)}` : \"aberto\"}");
    expect(PAINEL).toContain('data-testid="embalar-em-tubo-novo"');
    expect(PAINEL).toContain('onClick={() => embalar.mutate("novo")}');
  });

  it("um toque = PATCH adicionar no tubo aberto, ou POST tubo novo; toast '#0381 embalada no Tubo 2'; fecha o painel", () => {
    expect(PAINEL).toContain('? await apiRequest("POST", `/api/events/${evento!.id}/tubos`, { itemIds: ids })');
    expect(PAINEL).toContain(': await apiRequest("PATCH", `/api/tubos/${destinoEscolhido}/itens`, { adicionar: ids });');
    expect(PAINEL).toContain("toast({ title: `${nome} embalada${quantas === 1 ? \"\" : \"s\"} no Tubo ${numero}` });");
    expect(PAINEL).toContain("atualizar();\n      onEmbalou?.();\n      onClose();");
  });

  it("a abertura é reiniciada quando muda a peça, não só o evento", () => {
    expect(PAINEL).toContain("const chaveDaAbertura = evento ? `${evento.id}|${(itensIniciais ?? []).join(\",\")}|${tuboInicial ?? \"\"}` : null;");
  });

  it("se a peça já está num tubo (outro aparelho embalou antes), diz onde", () => {
    expect(PAINEL).toContain('data-testid="embalar-ja-no-tubo"');
  });
});

describe("Embalar em lote", () => {
  it("é um terceiro modo da barra, com as conferidas sem tubo como elegíveis", () => {
    expect(GRAFICA).toContain("const [bulkPackMode, setBulkPackMode] = useState(false);");
    expect(GRAFICA).toContain("const bulkOn = bulkDeliveryMode || bulkConferMode || bulkPackMode;");
    expect(GRAFICA).toContain("const bulkEligibleList = bulkConferMode ? conferableInFilter : bulkPackMode ? packableInFilter : deliverableInFilter;");
    expect(GRAFICA).toContain('data-testid="button-bulk-pack"');
    expect(TABELA).toContain("bulkPackMode ? podeEmbalarPeca : false");
    expect(CARTOES).toContain("bulkPackMode ? podeEmbalarPeca : false");
  });

  it("o Continuar vira 'Escolher o tubo', exige um evento só e abre o painel com as marcadas", () => {
    expect(GRAFICA).toContain('{bulkPackMode ? "Escolher o tubo" : "Continuar para a foto"}');
    expect(GRAFICA).toContain('toast({ title: "Marque peças de um evento só"');
    expect(GRAFICA).toContain("abrirEmbalar(bulkSelectedItems);");
    // embalou: sai do modo; Escape não sai do lote com o painel aberto
    expect(GRAFICA).toContain("onEmbalou={() => { if (bulkPackMode) sairDoLote(); }}");
    expect(GRAFICA).toContain("if (bulkDeliveryOpen || bulkConferOpen || tubosDoEvento || viewDetailsItem || selectedItem) return;");
    expect(GRAFICA).toContain("setBulkConferMode(false);\n    setBulkPackMode(false);");
  });
});
