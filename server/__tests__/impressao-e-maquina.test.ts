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

describe("as máquinas", () => {
  it("são 1, 2, 3 e 4 por enquanto — o banco guarda o código, a tela lê o rótulo", () => {
    expect([...MAQUINAS_DE_IMPRESSAO]).toEqual(["1", "2", "3", "4"]);
    expect(rotuloDaMaquina("3")).toBe("Máquina 3");
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
    expect(ITEMS).toContain("const { quantityProduced, expectedProduced, printMachine } = req.body;");
    expect(ITEMS).toContain("if (printMachine != null && !ehMaquinaValida(printMachine))");
    expect(ITEMS).toContain("...(printMachine ? { printMachine } : {}),");
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

describe("a tela obriga a escolha", () => {
  it("o modal tem o seletor das quatro máquinas", () => {
    expect(GRAFICA).toContain('data-testid="seletor-maquina"');
    expect(GRAFICA).toContain("MAQUINAS_DE_IMPRESSAO.map((m) =>");
  });

  it("nem registrar nem iniciar funcionam sem máquina", () => {
    expect(GRAFICA).toContain("productionData.quantityProduced === 0 || !maquinaEscolhida}");
    expect(GRAFICA).toContain("disabled={startPrintingMutation.isPending || !maquinaEscolhida}");
    expect(GRAFICA).toContain('toast({ title: "Escolha a máquina"');
  });

  it("existe o botão de iniciar, que vira 'Trocar máquina' com a peça já na máquina", () => {
    expect(GRAFICA).toContain('data-testid="button-iniciar-impressao"');
    expect(GRAFICA).toContain('"Trocar máquina" : "Iniciar impressão"');
  });

  it("a fila mostra em que máquina a peça está", () => {
    expect(GRAFICA).toContain('`Máq. ${item.printMachine ?? "?"} · Registrar`');
  });
});

describe("os nomes novos — com a trilha antiga ainda legível", () => {
  it("'Em Produção' virou 'Em Impressão' e 'Produzido' virou 'Em Acabamento / Conferência'", () => {
    expect(SHARED).toContain('inProduction: "Em Impressão",');
    expect(SHARED).toContain('produced: "Em Acabamento / Conferência",');
    expect(STATUS).toContain('inProduction:          meta("Em Impressão"');
    expect(STATUS).toContain('produced:              meta("Em Acabamento / Conferência", "Acabamento"');
  });

  it("nenhum rótulo de tela ou servidor ainda diz 'Em Produção' para a peça", () => {
    expect(SHARED).not.toContain('inProduction: "Em Produção"');
    expect(STATUS).not.toContain('meta("Em Produção"');
  });

  it("o descancelar entende os nomes novos E os antigos da trilha", () => {
    for (const par of [
      '"Em Impressão": "inProduction",',
      '"Em Acabamento / Conferência": "produced",',
      '"Em Produção": "inProduction",',
      '"Produzido": "produced",',
    ]) {
      expect(ITEMS).toContain(par);
    }
  });

  it("a linha do tempo da ficha reconhece as palavras novas e as velhas", () => {
    expect(FICHA).toContain('keywords: ["em impressão", "impressão iniciada", "em produção"]');
    expect(FICHA).toContain('keywords: ["acabamento / conferência", "produzido"]');
  });

  it("a ficha diz em que máquina a peça está", () => {
    expect(FICHA).toContain("na Máquina ${item.printMachine}");
  });
});
