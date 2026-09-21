// ─────────────────────────────────────────────────────────────────────────────
// EM IMPRESSÃO, NA MÁQUINA N — e depois ACABAMENTO / CONFERÊNCIA (dono, 14/09).
//
// O pedido: "mudar o status em produção para em impressão e, quando iniciar a
// produção, selecionar a máquina — ainda não tenho as máquinas, então vira
// 1, 2, 3, 4". E, na sequência: "em conferência vira em acabamento / em
// conferência depois de terminar a impressão".
//
// O que motivou: a Gráfica disse que "Em Produção" não funcionava — a peça já
// ficava "Produzido". Medido em produção: 2.227 peças foram de "Pronto para
// Produção" direto para "Produzido" e só UMA passou pelo meio. O único gesto
// registrava o RESULTADO ("produzi 40") e nunca o INÍCIO ("pus na máquina").
//
// A mudança tem três partes, e este arquivo pina as três:
//   1. Um PRIMEIRO MOMENTO: PATCH /start-printing leva a peça para a máquina
//      escolhida e a deixa "Em Impressão" (serve também para trocar de máquina).
//   2. A MÁQUINA É OBRIGATÓRIA NA TELA: o modal não registra nem inicia sem ela.
//   3. OS NOMES: inProduction → "Em Impressão"; produced → "Em Acabamento /
//      Conferência". As CHAVES não mudaram — e a trilha antiga, que diz "Em
//      Produção" e "Produzido", segue reconhecida por quem a interpreta.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { MAQUINAS_DE_IMPRESSAO, ehMaquinaValida, rotuloDaMaquina } from "@shared/fluxo-peca";
import { avaliarProducao } from "../../client/src/lib/grafica-producao";

const ler = (rel: string) => readFileSync(path.resolve(__dirname, "../..", rel), "utf8");
const ITEMS = ler("server/routes/items.ts");
const SHARED = ler("server/routes/shared.ts");
const SCHEMA = ler("shared/schema.ts");
const STATUS = ler("client/src/lib/status.ts");
const GRAFICA = ler("client/src/pages/grafica.tsx");
const FICHA = ler("client/src/components/item-details-dialog.tsx");
const MODAL = ler("client/src/components/grafica/modal-impressao.tsx");

describe("as máquinas", () => {
  it("são 1, 2, 3 e 4 — o banco guarda o código, a tela lê o nome do dono (21/09)", () => {
    expect([...MAQUINAS_DE_IMPRESSAO]).toEqual(["1", "2", "3", "4"]);
    expect(MAQUINAS_DE_IMPRESSAO.map(rotuloDaMaquina)).toEqual([
      "Impressora 1 (New XT)",
      "Impressora 2",
      "Impressora 3",
      "Impressora 4 (Targa Elite)",
    ]);
  });

  it("máquina que não existe é recusada", () => {
    expect(ehMaquinaValida("2")).toBe(true);
    for (const ruim of ["5", "0", "", null, undefined, 2, "Máquina 1"]) {
      expect(ehMaquinaValida(ruim as any), String(ruim)).toBe(false);
    }
  });

  it("a peça tem onde guardar a máquina", () => {
    expect(SCHEMA).toContain('printMachine: text("print_machine"),');
  });
});

describe("o primeiro momento: iniciar a impressão", () => {
  const rota = ITEMS.slice(
    ITEMS.indexOf('app.patch("/api/items/:id/start-printing"'),
    ITEMS.indexOf('app.patch("/api/items/:id/start-production"'),
  );

  it("existe, é da Gráfica e do admin, e exige máquina válida", () => {
    expect(rota.length).toBeGreaterThan(0);
    expect(rota).toContain('req.userRole !== "grafica" && req.userRole !== "admin"');
    expect(rota).toContain("if (!ehMaquinaValida(printMachine))");
    expect(rota).toContain("Escolha a máquina em que a peça vai ser impressa");
  });

  it("leva a peça para 'Em Impressão' e guarda a máquina", () => {
    expect(rota).toContain('status: "inProduction",');
    expect(rota).toContain("printMachine,");
  });

  it("respeita as mesmas guardas de quem imprime: evento finalizado e revisão", () => {
    expect(rota).toContain("barraEventoFinalizado(current, res)");
    expect(rota).toContain("EM_REVISAO.has(current.status)");
  });

  it("não aceita peça sem nada a imprimir nem 'trocar' para a mesma máquina", () => {
    expect(rota).toContain("Nada a imprimir");
    expect(rota).toContain("A peça já está na");
  });

  it("deixa rastro na trilha — inclusive quando só troca de máquina", () => {
    expect(rota).toContain("Impressão iniciada na ${rotuloDaMaquina(printMachine)}");
    expect(rota).toContain("Impressão mudou de máquina:");
  });
});

describe("o segundo momento: registrar o que saiu", () => {
  it("o servidor aceita a máquina junto e recusa máquina inválida", () => {
    expect(ITEMS).toContain("const { expectedProduced, printMachine, maquina, impressasNaMaquina } = req.body;");
    expect(ITEMS).toContain("if (printMachine != null && !ehMaquinaValida(printMachine))");
    expect(ITEMS).toContain(": (printMachine ? { printMachine } : {})),");
  });

  it("a máquina viaja no payload do registro", () => {
    const av = avaliarProducao({ quantity: 10, quantityProduced: 0, reuseQty: 0 } as any, 10, "2");
    expect(av.ok).toBe(true);
    expect(av.payload).toMatchObject({ quantityProduced: 10, expectedProduced: 0, printMachine: "2" });
  });

  it("sem máquina, o payload continua o de antes (chamador antigo não quebra)", () => {
    const av = avaliarProducao({ quantity: 10, quantityProduced: 0, reuseQty: 0 } as any, 4);
    expect(av.payload).toEqual({ quantityProduced: 4, expectedProduced: 0 });
  });
});

describe("a tela obriga a escolha — no modal COMPARTILHADO (components/grafica/modal-impressao.tsx)", () => {
  // O modal saiu de grafica.tsx em 21/09 para servir também à aba Máquinas:
  // uma cópia só do formulário, das mutations e dos toasts.
  it("a fila e a aba Máquinas importam o mesmo modal", () => {
    expect(GRAFICA).toContain('from "@/components/grafica/modal-impressao"');
    expect(GRAFICA).toContain("useMutacoesDeImpressao({ onSucesso:");
    expect(GRAFICA).toContain("<FormularioDeImpressao");
    expect(ler("client/src/pages/grafica-maquinas.tsx")).toContain("<ModalImpressao item={itemDoModal}");
    // Nenhum resto do formulário antigo na fila.
    expect(GRAFICA).not.toContain("handleSubmitProduction");
    expect(GRAFICA).not.toContain("productionData");
  });

  it("o modal tem o seletor das quatro máquinas", () => {
    expect(MODAL).toContain('data-testid="seletor-maquina"');
    expect(MODAL).toContain("MAQUINAS_DE_IMPRESSAO.map((m) =>");
  });

  it("nem informar impressas nem iniciar funcionam sem máquina", () => {
    expect(MODAL).toContain("const pode = !!maquinaEscolhida && conta.valida && !escolhidaOcupada && !startPrintingMutation.isPending;");
    expect(MODAL).toContain('toast({ title: "Escolha a máquina"');
  });

  it("existe o botão de iniciar; a troca de máquina vive num painel próprio", () => {
    expect(MODAL).toContain('data-testid="button-iniciar-impressao"');
    expect(MODAL).toContain('data-testid="button-trocar-maquina"');
    expect(MODAL).toContain("const trocando = emImpressao && !!maquinaAtual;");
  });

  it("a fila mostra em que máquina a peça está e o progresso — o botão só diz o gesto", () => {
    expect(GRAFICA).toContain("function ProgressoImpressao(");
    expect(GRAFICA).toContain("isInProd(item) && <ProgressoImpressao item={item} fonte={10.5} duasLinhas onIniciarResto=");
    expect(GRAFICA).toContain("isInProd(item) ? rotuloAcaoImpressao(item)");
  });
});

describe("a impressão é informada AOS POUCOS (dono, 14/09)", () => {
  // "ele inicia a impressão, conforme o tempo informa quantos já finalizaram,
  // e só vai para acabamento quando finaliza todos os itens impressos."

  it("o modal abre com o que JÁ SAIU, não com o total — um toque distraído não conclui", () => {
    expect(MODAL).toContain("useState<number>(producedOf(item))");
    expect(MODAL).not.toContain("useState<number>(tetoDeProducao(item))");
  });

  it("informar o mesmo número de antes não muda nada, então o botão fica apagado e explica", () => {
    expect(MODAL).toContain('return { rotulo: "Nada mudou", pode: false');
  });

  it("o botão diz o que acontece com a DIFERENÇA; no teto, conclui", () => {
    expect(MODAL).toContain("rotulo: `Mandar ${diferenca} para acabamento (${informado} de ${teto})`");
    expect(MODAL).toContain("`Mandar as últimas ${diferenca} e concluir`");
  });

  it("o aviso depois de salvar diz para onde a peça foi", () => {
    expect(MODAL).toContain("toast({ title: `Mandada para acabamento${cod}`");
    expect(MODAL).toContain("title: `Impressas informadas${cod}`");
  });

  it("o campo diz o que se lança: quantas já saíram da máquina", () => {
    // Dono, 21/09: o campo pergunta o que saiu AGORA; o total é calculado.
    expect(MODAL).toContain("Quantas saíram agora?");
  });

  it("servidor: parcial fica Em Impressão; todas impressas vão para Impresso / Acabamento", () => {
    expect(ITEMS).toContain('? "produced"\n          : "inProduction";');
  });

  it("servidor: a conferência exige foto e só vira Conferido quando confere tudo", () => {
    expect(ITEMS).toContain("if (!conferencePhotoUrl && !current.conferencePhotoUrl)");
    // 21/09: peça que já estava no tubo fecha a conferência como Embalado.
    expect(ITEMS).toContain('...(isFull ? { status: (current.tuboId ? "packed" : "conferred") as "packed" | "conferred" } : {}),');
  });
});

describe("os nomes novos — com a trilha antiga ainda legível", () => {
  it("'Em Produção' virou 'Em Impressão' e 'Produzido' virou 'Impresso / Acabamento' (dono, 21/09)", () => {
    expect(SHARED).toContain('inProduction: "Em Impressão",');
    expect(SHARED).toContain('produced: "Impresso / Acabamento",');
    expect(STATUS).toContain('inProduction:          meta("Em Impressão"');
    expect(STATUS).toContain('produced:              meta("Impresso / Acabamento",        "Impresso"');
    // Excel, tempo por etapa e a KPI da Gráfica dizem o mesmo nome.
    expect(ler("server/services/xlsxExport.ts")).toContain('produced: "Impresso / Acabamento"');
    expect(ler("server/services/tempo-etapas.ts")).toContain('produced: "Impresso / Acabamento",');
    expect(GRAFICA).toContain('{ label: "Impresso",     value: stats.produzidos');
  });

  it("nenhum rótulo de tela ou servidor ainda diz 'Em Produção' para a peça", () => {
    expect(SHARED).not.toContain('inProduction: "Em Produção"');
    expect(STATUS).not.toContain('meta("Em Produção"');
  });

  it("o descancelar entende os nomes novos E os antigos da trilha", () => {
    for (const par of [
      '"Em Impressão": "inProduction",',
      '"Impresso / Acabamento": "produced",',
      '"Em Acabamento / Conferência": "produced",',
      '"Em Produção": "inProduction",',
      '"Produzido": "produced",',
    ]) {
      expect(ITEMS).toContain(par);
    }
  });

  it("a linha do tempo da ficha reconhece as palavras novas e as velhas", () => {
    expect(FICHA).toContain('keywords: ["em impressão", "impressão iniciada", "em produção"]');
    expect(FICHA).toContain('keywords: ["impresso / acabamento", "acabamento / conferência", "produzido"]');
  });

  it("a ficha diz em que máquina a peça está", () => {
    expect(FICHA).toContain("na ${rotuloDaMaquina(item.printMachine)}");
  });
});
