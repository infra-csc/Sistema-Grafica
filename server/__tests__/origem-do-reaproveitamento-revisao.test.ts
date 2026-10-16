// ─────────────────────────────────────────────────────────────────────────────
// DE ONDE VEM O REAPROVEITAMENTO — a REVISÃO ADVERSARIAL (16/10).
//
// Cada caso aqui falhava antes da correção:
//   · a peça a meio da impressão: marcar "em trânsito" depois de o galpão
//     conferir reaproveitadas do estoque passava (a recusa comparava com o
//     físico, que conta unidades que nem saíram da impressora);
//   · a redução de quantidade que deixa a peça 100% em trânsito a promovia a
//     Produzido — e ela nunca fechava (nada a conferir, nada a embalar);
//   · a redução que zera o reaproveitamento deixava a origem órfã;
//   · desmarcar "em trânsito" num evento encerrado devolvia a peça ao galpão
//     (trabalho num evento que já acabou); evento arquivado nem isso;
//   · fechar como Entregue (tudo em trânsito) na liberação, no Reaproveitar,
//     na correção e na troca de origem não recalculava o evento nem avisava
//     "Evento concluído" quando era a última pendência;
//   · a troca de origem decidia com a peça lida FORA da trava: uma conferência
//     no meio fazia a recusa olhar um número velho.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";
import { txDeMentira } from "./tx-de-mentira";
import { recusaDaTrocaDeOrigem, noGalpaoDe, corpoComOrigemLida } from "@shared/origem-do-reaproveitamento";
import { violacoesDaConta } from "@shared/embalagem";
import { quantidadeEntregueParaChecklist, quantidadeACaminhoParaChecklist } from "@shared/integracao-checklist";
import { partesDaPeca, temReaproveitamento } from "../../client/src/lib/etiqueta-lista";
import { readFileSync } from "fs";
import path from "path";

const RAIZ = path.resolve(__dirname, "..", "..");
const fonte = (rel: string) => readFileSync(path.join(RAIZ, rel), "utf8");

const H = vi.hoisted(() => ({
  storage: {} as Record<string, any>,
  db: {} as Record<string, any>,
  mundo: { itens: {} as Record<string, any> },
  trilha: [] as string[],
  avisos: [] as any[],
  evento: {} as Record<string, any>,
  /** O recálculo do evento conclui o evento (a peça fechada era a última pendência). */
  fecharEvento: false,
}));

vi.mock("../db", () => ({ db: H.db, pool: {} }));
vi.mock("../storage", async () => {
  const real = await vi.importActual<any>("../storage");
  return { ...real, storage: H.storage };
});
vi.mock("../routes/shared", async () => {
  const real = await vi.importActual<any>("../routes/shared");
  return {
    ...real,
    requireAuth: (_req: any, _res: any, next: any) => next(),
    requireRole: () => (_req: any, _res: any, next: any) => next(),
    broadcast: () => {},
    createAuditLog: async (_req: any, _a: string, _t: string, _id: string, detalhe: string) => { H.trilha.push(detalhe); },
    createAuditLogsEmLote: async () => {},
    updateEventStatus: async () => { if (H.fecharEvento) H.evento.status = "completed"; },
  };
});
vi.mock("../routes/pedidos-de-peca", async () => {
  const real = await vi.importActual<any>("../routes/pedidos-de-peca");
  return { ...real, aoExcluirPeca: async () => {} };
});
vi.mock("../routes/estoque-reservas", async () => {
  const real = await vi.importActual<any>("../routes/estoque-reservas");
  return { ...real, liberarReservasDasPecas: async () => {} };
});
vi.mock("../services/inventoryLifecycle", () => ({ runInventoryCron: vi.fn() }));
vi.mock("../services/ocupacaoDasImpressoras", () => ({ quemOcupaAImpressora: async () => null, erroImpressoraOcupada: () => "ocupada" }));
vi.mock("../services/xlsxImport", () => ({ handlePreviewXlsx: vi.fn(), handleConfirmImport: vi.fn() }));
vi.mock("../services/xlsxExport", () => ({ handleExportItemsXlsx: vi.fn(), handleExportSelectedItemsXlsx: vi.fn(), responderRelatorioMaquinasXlsx: vi.fn() }));
vi.mock("../services/consultaDeEstoqueNaLiberacao", () => ({
  respostaDoEstoqueParaLiberar: vi.fn(async () => null),
  marcarRespostaAplicada: vi.fn(async () => {}),
}));

const { registerItemRoutes } = await import("../routes/items");

type Handler = (req: any, res: any, next: any) => any;
const rotas = new Map<string, Handler[]>();
const app: any = {};
for (const verbo of ["get", "post", "patch", "put", "delete"]) {
  app[verbo] = (caminho: string, ...hs: Handler[]) => {
    const chave = `${verbo.toUpperCase()} ${caminho}`;
    if (!rotas.has(chave)) rotas.set(chave, hs);
    return app;
  };
}
registerItemRoutes(app);

async function chamar(chave: string, body: any, userRole: string, id = "p1") {
  const hs = rotas.get(chave);
  if (!hs) throw new Error(`Rota não registrada: ${chave}`);
  const req: any = { params: { id }, body, query: {}, headers: {}, userRole, userId: "u1", userName: "Maria", session: {} };
  const res: any = { _status: 200, _body: undefined, _pronto: false };
  res.status = (c: number) => { res._status = c; return res; };
  res.json = (b: any) => { res._body = b; res._pronto = true; return res; };
  res.set = () => res; res.setHeader = () => res; res.send = res.json;
  for (const h of hs) {
    let seguiu = false;
    await h(req, res, () => { seguiu = true; });
    if (res._pronto || !seguiu) break;
  }
  return { status: res._status, body: res._body };
}

const OBS = "Night Run Salvador, etapa 17/10";
const ORIGEM = "PATCH /api/items/:id/origem-reaproveitamento";
const peca = (over: Record<string, unknown> = {}) => ({
  id: "p1", displayId: "#6033", eventId: "ev-1", type: "Placa 2x1", description: "Largada", quantity: 10,
  quantityProduced: 0, reuseQty: 0, isReuse: false, conferredQty: 0, embaladaQty: 0, deliveredQty: 0,
  status: "ready_for_production", deletedAt: null, parentItemId: null, travadaEm: null, travadaPor: null, travadaMotivo: null,
  printMachine: null, impressaoPorMaquina: null, reservaPorMaquina: null, maquinaPrevista: null, skipApproval: false,
  finalFileUrl: "/objects/uploads/final.pdf", conferencePhotoUrl: null, conferredAt: null, kitRemessaId: null,
  origemReaproveitamento: null, obsReaproveitamento: null, producaoInterna: false, instrucoesGrafica: null,
  fileWidth: "2.00", fileHeight: "1.00", area: "2", visual: "1", calculatedM2: "20.00", material: "Lona", finish: "Ilhós",
  measurement: "2.00 × 1.00", observations: "", createdAt: new Date("2026-09-01"),
  ...over,
});
const p1 = () => H.mundo.itens.p1;
const EVENTO_VIVO = { id: "ev-1", name: "COPA NORTE", status: "created", startDate: "2099-01-10", truckDepartureDate: new Date("2099-01-01T00:00:00Z") };

beforeEach(() => {
  H.mundo.itens = {};
  H.trilha.length = 0;
  H.avisos.length = 0;
  H.evento = { ...EVENTO_VIVO };
  H.fecharEvento = false;
  const s = H.storage;
  for (const k of Object.keys(s)) delete s[k];
  Object.assign(s, {
    getItem: vi.fn(async (id: string) => (H.mundo.itens[id] ? { ...H.mundo.itens[id] } : undefined)),
    updateItem: vi.fn(async (id: string, dados: any) => (H.mundo.itens[id] ? (H.mundo.itens[id] = { ...H.mundo.itens[id], ...dados }) : undefined)),
    getEvent: vi.fn(async () => ({ ...H.evento })),
    getItemSponsors: vi.fn(async () => []),
    getLiveComplements: vi.fn(async () => []),
    createNotification: vi.fn(async (n: any) => { H.avisos.push(n); return { id: `n${H.avisos.length}`, ...n }; }),
  });
  H.db.transaction = vi.fn(async (fn: any) => fn(txDeMentira(H.mundo)));
  H.db.execute = vi.fn(async () => ({ rows: [] }));
  H.db.insert = vi.fn(() => ({ values: async () => [] }));
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("em trânsito com a peça a meio da impressão (conferência parcial)", () => {
  // 10 un.: 4 reaproveitadas do ESTOQUE, 3 impressas, 5 conferidas (3 impressas
  // + 2 reaproveitadas que estão no galpão). O físico depois da troca seria 6,
  // mas no galpão só EXISTEM as 3 impressas — as 2 reaproveitadas conferidas
  // não podem estar no caminhão.
  const meioDaImpressao = { status: "inProduction", quantity: 10, quantityProduced: 3, reuseQty: 4, conferredQty: 5, origemReaproveitamento: "estoque" };

  it("a regra pura recusa (e o caso legítimo — só as impressas conferidas — passa)", () => {
    expect(recusaDaTrocaDeOrigem(meioDaImpressao, "em_transito")).toMatch(/5 un\. já foram conferidas.*só 3 un\. foram impressas.*Use "Estoque"/);
    expect(recusaDaTrocaDeOrigem({ ...meioDaImpressao, conferredQty: 3 }, "em_transito")).toBeNull();
    // A conta que a troca deixaria quebrada, se passasse:
    expect(violacoesDaConta({ ...meioDaImpressao, origemReaproveitamento: "em_transito" })).not.toEqual([]);
    expect(noGalpaoDe({ ...meioDaImpressao, origemReaproveitamento: "em_transito" })).toBe(3);
    expect(noGalpaoDe(meioDaImpressao)).toBe(7);
  });

  it("PATCH da origem: 409, nada muda", async () => {
    H.mundo.itens.p1 = peca({ ...meioDaImpressao, printMachine: "1" });
    const r = await chamar(ORIGEM, { origemReaproveitamento: "em_transito", obsReaproveitamento: OBS }, "solicitacao");
    expect(r.status, JSON.stringify(r.body)).toBe(409);
    expect(p1()).toMatchObject({ origemReaproveitamento: "estoque", status: "inProduction" });
  });

  it("Reaproveitar mais unidades EM TRÂNSITO depois de conferir as do estoque: 409, nada muda", async () => {
    // 4 do estoque já conferidas antes de imprimir; somar 2 em trânsito faria
    // as 4 conferidas passarem a "estar no caminhão".
    H.mundo.itens.p1 = peca({ status: "approved", reuseQty: 4, conferredQty: 4, origemReaproveitamento: "estoque" });
    const r = await chamar("POST /api/items/:id/mark-reuse", { qty: 2, origemReaproveitamento: "em_transito", obsReaproveitamento: OBS }, "grafica");
    expect(r.status, JSON.stringify(r.body)).toBe(409);
    expect(r.body.error).toMatch(/Use "Estoque"/);
    expect(p1()).toMatchObject({ reuseQty: 4, origemReaproveitamento: "estoque", status: "approved" });
  });
});

describe("a edição da quantidade e a peça em trânsito", () => {
  it("reduzir até sobrar só o que vem em trânsito FECHA a peça (antes: Produzida para sempre, nada a conferir)", async () => {
    H.mundo.itens.p1 = peca({ status: "inProduction", printMachine: "1", reuseQty: 4, origemReaproveitamento: "em_transito", obsReaproveitamento: OBS });
    const r = await chamar("PATCH /api/items/:id", { quantity: 4 }, "solicitacao");
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(p1()).toMatchObject({ quantity: 4, reuseQty: 4, isReuse: true, status: "delivered" });
    expect(p1().deliveredAt).toBeInstanceOf(Date);
    expect(H.trilha.at(-1)).toContain("não passa pela Gráfica");
  });

  it("com impressas, a redução segue promovendo a Produzido (as impressas conferem)", async () => {
    H.mundo.itens.p1 = peca({ status: "inProduction", printMachine: "1", quantityProduced: 3, reuseQty: 4, origemReaproveitamento: "em_transito", obsReaproveitamento: OBS });
    const r = await chamar("PATCH /api/items/:id", { quantity: 7 }, "solicitacao");
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(p1()).toMatchObject({ quantity: 7, status: "produced" });
  });

  it("reduzir até zerar o reaproveitamento apaga a origem junto (não fica 'Em trânsito — 0 un.')", async () => {
    H.mundo.itens.p1 = peca({ status: "produced", quantityProduced: 6, reuseQty: 4, origemReaproveitamento: "em_transito", obsReaproveitamento: OBS });
    const r = await chamar("PATCH /api/items/:id", { quantity: 6 }, "solicitacao");
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(p1()).toMatchObject({ quantity: 6, reuseQty: 0, origemReaproveitamento: null, obsReaproveitamento: null });
  });
});

describe("a troca de origem num evento que já acabou", () => {
  const fechadaEmTransito = () => peca({ status: "delivered", reuseQty: 10, isReuse: true, origemReaproveitamento: "em_transito", obsReaproveitamento: OBS, deliveredAt: new Date() });

  it("evento encerrado: devolver ao galpão (trabalho novo) é recusado", async () => {
    H.evento = { ...EVENTO_VIVO, manuallyClosed: true, status: "closed" };
    H.mundo.itens.p1 = fechadaEmTransito();
    const r = await chamar(ORIGEM, { origemReaproveitamento: "estoque" }, "solicitacao");
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("EVENT_FINALIZED");
    expect(p1()).toMatchObject({ status: "delivered", origemReaproveitamento: "em_transito" });
  });

  it("evento encerrado: fechar a conta (em trânsito → Entregue) e corrigir a observação seguem valendo", async () => {
    H.evento = { ...EVENTO_VIVO, manuallyClosed: true, status: "closed" };
    H.mundo.itens.p1 = peca({ status: "produced", reuseQty: 10, isReuse: true });
    expect((await chamar(ORIGEM, { origemReaproveitamento: "em_transito", obsReaproveitamento: OBS }, "solicitacao")).status).toBe(200);
    expect(p1().status).toBe("delivered");
    expect((await chamar(ORIGEM, { origemReaproveitamento: "em_transito", obsReaproveitamento: "Night Run Recife" }, "solicitacao")).status).toBe(200);
    expect(p1()).toMatchObject({ status: "delivered", obsReaproveitamento: "Night Run Recife" });
  });

  it("evento arquivado: nada muda (como a conferência)", async () => {
    H.evento = { ...EVENTO_VIVO, arquivadoEm: new Date("2026-10-01") };
    H.mundo.itens.p1 = peca({ status: "produced", reuseQty: 10, isReuse: true });
    const r = await chamar(ORIGEM, { origemReaproveitamento: "em_transito", obsReaproveitamento: OBS }, "admin");
    expect(r.status).toBe(409);
    expect(p1()).toMatchObject({ status: "produced", origemReaproveitamento: null });
  });
});

describe("concorrência: a troca decide com a peça TRAVADA", () => {
  it("a conferência que entrou no meio é vista — a recusa usa o número de agora, não o lido antes", async () => {
    // No banco (dentro da trava): 9 conferidas. A leitura de fora (cache,
    // corrida) ainda vê 0. Decidir pela leitura de fora deixaria marcar
    // em trânsito com 9 conferidas e só 6 impressas.
    H.mundo.itens.p1 = peca({ status: "produced", quantityProduced: 6, reuseQty: 4, conferredQty: 9, origemReaproveitamento: "estoque" });
    H.storage.getItem = vi.fn(async () => ({ ...H.mundo.itens.p1, conferredQty: 0 }));
    const r = await chamar(ORIGEM, { origemReaproveitamento: "em_transito", obsReaproveitamento: OBS }, "grafica");
    expect(r.status, JSON.stringify(r.body)).toBe(409);
    expect(p1()).toMatchObject({ origemReaproveitamento: "estoque", status: "produced", conferredQty: 9 });
  });
});

describe("a última pendência do evento fecha em trânsito: o evento conclui e avisa", () => {
  const avisosDeConcluido = () => H.avisos.filter((a) => a.type === "eventCompleted");

  it("liberada na Revisão com tudo em trânsito", async () => {
    H.fecharEvento = true;
    H.mundo.itens.p1 = peca({ status: "awaiting_final_review" });
    const r = await chamar("PATCH /api/items/:id/creator-review", { reuseQty: 10, origemReaproveitamento: "em_transito", obsReaproveitamento: OBS }, "solicitacao");
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(p1().status).toBe("delivered");
    expect(H.evento.status).toBe("completed");
    expect(avisosDeConcluido()).toHaveLength(1);
    expect(avisosDeConcluido()[0]).toMatchObject({ targetRoles: ["solicitacao"], eventId: "ev-1" });
  });

  it("Reaproveitar tudo em trânsito na Gráfica", async () => {
    H.fecharEvento = true;
    H.mundo.itens.p1 = peca();
    expect((await chamar("POST /api/items/:id/mark-reuse", { origemReaproveitamento: "em_transito", obsReaproveitamento: OBS }, "grafica")).status).toBe(200);
    expect(avisosDeConcluido()).toHaveLength(1);
  });

  it("correção para o total com a origem em trânsito", async () => {
    H.fecharEvento = true;
    H.mundo.itens.p1 = peca({ status: "produced", quantityProduced: 7, reuseQty: 3, origemReaproveitamento: "em_transito", obsReaproveitamento: OBS });
    expect((await chamar("POST /api/items/:id/correct-reuse", { correctedReuseQty: 10 }, "admin")).status).toBe(200);
    expect(avisosDeConcluido()).toHaveLength(1);
  });

  it("troca de origem que fecha a peça", async () => {
    H.fecharEvento = true;
    H.mundo.itens.p1 = peca({ status: "produced", reuseQty: 10, isReuse: true });
    expect((await chamar(ORIGEM, { origemReaproveitamento: "em_transito", obsReaproveitamento: OBS }, "grafica")).status).toBe(200);
    expect(avisosDeConcluido()).toHaveLength(1);
  });

  it("redução de quantidade que deixa só o que vem em trânsito", async () => {
    H.fecharEvento = true;
    H.mundo.itens.p1 = peca({ status: "inProduction", printMachine: "1", reuseQty: 4, origemReaproveitamento: "em_transito", obsReaproveitamento: OBS });
    expect((await chamar("PATCH /api/items/:id", { quantity: 4 }, "solicitacao")).status).toBe(200);
    expect(avisosDeConcluido()).toHaveLength(1);
  });
});

describe("o formulário (PATCH da peça) com a peça já na fila da Gráfica", () => {
  it("marcar o total em trânsito numa peça liberada fecha como Entregue (antes: ficava na fila sem nada a imprimir)", async () => {
    H.mundo.itens.p1 = peca({ status: "approved", reservaPorMaquina: null });
    const r = await chamar("PATCH /api/items/:id", { isReuse: true, reuseQty: 10, origemReaproveitamento: "em_transito", obsReaproveitamento: OBS }, "solicitacao");
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(p1()).toMatchObject({ status: "delivered", reuseQty: 10, origemReaproveitamento: "em_transito" });
    expect(H.trilha.at(-1)).toContain("não passa pela Gráfica");
  });

  it("marcar em trânsito pelo formulário depois de conferir as do estoque: 409 (a mesma recusa da ficha)", async () => {
    H.mundo.itens.p1 = peca({ status: "approved", reuseQty: 4, conferredQty: 4, origemReaproveitamento: "estoque" });
    const r = await chamar("PATCH /api/items/:id", { origemReaproveitamento: "em_transito", obsReaproveitamento: OBS }, "solicitacao");
    expect(r.status, JSON.stringify(r.body)).toBe(409);
    expect(p1().origemReaproveitamento).toBe("estoque");
  });
});

describe("as leituras que contavam a quantidade cheia", () => {
  const parcialEntregue = { type: "Placa", status: "delivered", quantity: 10, deliveredQty: 6, reuseQty: 4, isReuse: false,
    origemReaproveitamento: "em_transito", deletedAt: null, kitRemessaId: null };

  it("Checklist de Arena: a peça fechada com parte em trânsito vai inteira (antes: 6 entregues e 4 'a caminho' para sempre)", () => {
    expect(quantidadeEntregueParaChecklist(parcialEntregue)).toBe(10);
    expect(quantidadeACaminhoParaChecklist(parcialEntregue)).toBe(0);
    // a 100% em trânsito já ia inteira (0 entregues + status Entregue): as duas agora dizem o mesmo
    const todaEmTransito = { ...parcialEntregue, deliveredQty: 0, reuseQty: 10, isReuse: true };
    expect(quantidadeEntregueParaChecklist(todaEmTransito)).toBe(10);
    // sem trânsito, a entrega parcial antiga continua parcial
    expect(quantidadeEntregueParaChecklist({ ...parcialEntregue, origemReaproveitamento: "estoque" })).toBe(6);
    // e a SQL espelho conhece a mesma regra
    expect(fonte("server/services/checklist-entregues.ts")).toMatch(/origemReaproveitamento\} = 'em_transito' then \$\{items\.quantity\}/);
  });

  it("Etiquetas: só o FÍSICO ganha etiqueta (antes: uma parte 'fora de volume' com as 4 do caminhão)", () => {
    const partes = partesDaPeca({ id: "p1", type: "Placa", quantity: 10, reuseQty: 4, isReuse: false, origemReaproveitamento: "em_transito",
      tuboVolumes: [{ tuboId: "t1", numero: 1, avulso: false, quantidade: 6 }] });
    expect(partes.map((p) => [p.numero, p.quantidade])).toEqual([[1, 6]]);
    // a página de etiquetas e o contador da Gráfica deixam de fora a 100% em trânsito
    expect(fonte("client/src/pages/etiquetas-evento.tsx")).toMatch(/const jaConferida = \(i: PecaDoEvento\) => !todaEmTransito\(i\)/);
    expect(fonte("client/src/components/grafica/hooks/use-fila-da-grafica.ts")).toMatch(/if \(todaEmTransito\(i\)\) continue;/);
  });

  it("Verificação de consistência: 'entregue incompleta' desconta as unidades em trânsito (antes: toda peça em trânsito era achado)", () => {
    const src = fonte("server/services/consistencia.ts");
    const ini = src.indexOf('chave: "entregue_incompleta"');
    const bloco = src.slice(ini, src.indexOf("];", ini));
    expect(bloco).toMatch(/quantity - \(case when origem_reaproveitamento = 'em_transito'/);
  });

  it("Volumes: a tela do tubo recebe a quantidade FÍSICA (6, e não '6 de 10')", () => {
    expect(fonte("server/routes/tubos.ts")).toMatch(/quantity: emTransitoDe\(p\) > 0 \? quantidadeFisicaDe\(p\) : p\.quantity/);
    expect(fonte("client/src/components/grafica/hooks/use-tubos-da-fila.ts")).toMatch(/embaladaDe\(item\) < quantidadeFisica\(item\)/);
  });

  it("Etiqueta do tubo: a peça com as reaproveitadas EM TRÂNSITO não liga o 'REAPROVEITAR' (no tubo só vão as impressas)", () => {
    expect(temReaproveitamento([{ isReuse: false, reuseQty: 4, origemReaproveitamento: "em_transito" }])).toBe(false);
    expect(temReaproveitamento([{ isReuse: false, reuseQty: 4, origemReaproveitamento: "estoque" }])).toBe(true);
    expect(temReaproveitamento([{ isReuse: false, reuseQty: 4 }])).toBe(true);
    expect(fonte("server/routes/tubos.ts")).toContain("origemReaproveitamento: p.origemReaproveitamento ?? null,");
  });

  it("Ficha: a 100% em trânsito não acusa 'Entregue sem comprovante'; o 'de N' é o físico", () => {
    const src = fonte("client/src/components/ficha-da-peca/secao-registros-grafica.tsx");
    expect(src).toMatch(/!entregueComFotoDaEmbalagem && !todaEmTransito\(item\)/);
    expect(src).toMatch(/const quantidade = quantidadeFisicaDe\(item\)/);
  });
});

describe("as telas (o que o cliente manda e mostra)", () => {
  it("Revisão, reaproveitar PARTE: desmarcar a origem no diálogo limpa a que a peça já tinha (antes: ficava a do formulário)", () => {
    const src = fonte("client/src/components/revisao/use-acoes-da-revisao.tsx");
    const ini = src.indexOf("const partialReuseMutation");
    const parcial = src.slice(ini, src.indexOf("onSuccess", ini));
    expect(parcial).toMatch(/mandaOrigem = !!origem && \(!!origem\.origem \|\| !!atual\?\.origemReaproveitamento\)/);
  });

  it("Ficha: salvar a origem atualiza a peça mostrada e o percurso", () => {
    expect(fonte("client/src/components/item-details-dialog.tsx")).toMatch(/aoSalvar=\{\(salvo\) => setSalvoPelaOrigem/);
    expect(fonte("client/src/components/reaproveitamento/dialogo-origem.tsx")).toMatch(/startsWith\("\/api\/audit-logs"\)/);
  });

  it("Formulário: a escolha da origem só aparece para quem pode marcá-la (Arte/Atendimento levavam 403 na edição inteira)", () => {
    expect(fonte("client/src/components/detalhe-do-evento/formulario-da-peca.tsx")).toMatch(/isEdit && formData\.isReuse && podePriorizar && \(/);
  });

  it("Gráfica: a recusa do Reaproveitar não fecha o diálogo (a etapa digitada não se perde)", () => {
    const src = fonte("client/src/components/grafica/hooks/use-edicao-na-linha.ts");
    const ini = src.indexOf("const markReuseMutation");
    const erro = src.slice(src.indexOf("onError", ini), src.indexOf("const correctReuseMutation"));
    expect(erro).not.toMatch(/setReuseConfirmItemId\(null\)/);
  });
});

describe("concorrência no Reaproveitar e na correção: grava só se a conta não mudou", () => {
  // A leitura de fora (storage.getItem) é a de ANTES; o banco (dentro da
  // trava) já tem a mudança de outra pessoa.
  const leituraVelha = (velha: Record<string, unknown>) => {
    H.storage.getItem = vi.fn(async () => ({ ...H.mundo.itens.p1, ...velha }));
  };

  it("ajuste pós-Produzido com uma conferência no meio: 409, nada sobrescrito", async () => {
    H.mundo.itens.p1 = peca({ status: "produced", quantityProduced: 10, conferredQty: 3 });
    leituraVelha({ conferredQty: 0 });
    const r = await chamar("POST /api/items/:id/mark-reuse", { reuseTotal: 4 }, "solicitacao");
    expect(r.status, JSON.stringify(r.body)).toBe(409);
    expect(r.body.error).toMatch(/A peça mudou/);
    expect(p1()).toMatchObject({ quantityProduced: 10, reuseQty: 0, conferredQty: 3 });
  });

  it("dois Reaproveitar ao mesmo tempo: o segundo não apaga o primeiro (antes: gravava 6 por cima de 4 + 6)", async () => {
    H.mundo.itens.p1 = peca({ status: "approved", reuseQty: 4 });
    leituraVelha({ reuseQty: 0 });
    const r = await chamar("POST /api/items/:id/mark-reuse", { qty: 6 }, "grafica");
    expect(r.status, JSON.stringify(r.body)).toBe(409);
    expect(p1().reuseQty).toBe(4);
  });

  it("correção do reaproveitamento com uma conferência no meio: 409, a peça não volta para a fila", async () => {
    H.mundo.itens.p1 = peca({ status: "produced", quantityProduced: 7, reuseQty: 3, conferredQty: 2 });
    leituraVelha({ conferredQty: 0 });
    const r = await chamar("POST /api/items/:id/correct-reuse", { correctedReuseQty: 0 }, "grafica");
    expect(r.status, JSON.stringify(r.body)).toBe(409);
    expect(p1()).toMatchObject({ status: "produced", reuseQty: 3, conferredQty: 2 });
  });

  it("sem corrida, segue gravando (e carimba a mudança de status)", async () => {
    H.mundo.itens.p1 = peca({ status: "approved" });
    const r = await chamar("POST /api/items/:id/mark-reuse", { qty: 10, origemReaproveitamento: "estoque" }, "grafica");
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(p1()).toMatchObject({ status: "produced", reuseQty: 10 });
    expect(p1().statusChangedAt).toBeInstanceOf(Date);
  });
});

describe("formulário aberto há muito tempo não apaga a origem marcada por outra tela", () => {
  // Outra tela marcou "em trânsito" DEPOIS de o formulário abrir (que leu sem origem).
  const marcadaPorOutraTela = () => peca({ status: "draft", isReuse: true, reuseQty: 10, origemReaproveitamento: "em_transito", obsReaproveitamento: OBS });

  it("o corpo do formulário só leva a origem quando ela MUDOU em relação ao que leu — e leva o que leu", () => {
    const lida = { origemReaproveitamento: null, obsReaproveitamento: null };
    // não mexeu: a origem nem vai
    expect(corpoComOrigemLida({ description: "Nova", origemReaproveitamento: "", obsReaproveitamento: "" }, lida)).toEqual({ description: "Nova" });
    // mexeu: vai junto com o que leu
    expect(corpoComOrigemLida({ origemReaproveitamento: "estoque", obsReaproveitamento: "" }, lida))
      .toEqual({ origemReaproveitamento: "estoque", obsReaproveitamento: "", origemLida: null, obsLida: null });
    // espaços a mais na observação não contam como mudança
    expect(corpoComOrigemLida({ origemReaproveitamento: "em_transito", obsReaproveitamento: `  ${OBS} ` }, { origemReaproveitamento: "em_transito", obsReaproveitamento: OBS }))
      .toEqual({});
    // e o salvar do formulário passa por ele
    expect(fonte("client/src/components/detalhe-do-evento/use-detalhe-do-evento-acoes.tsx")).toContain("origemLida !== undefined ? corpoComOrigemLida(itemData, origemLida) : itemData");
    expect(fonte("client/src/pages/event-detail.tsx")).toContain("origemLida: editingItem });");
    expect(fonte("client/src/components/detalhe-do-evento/editar-peca-dialog.tsx")).toContain("origemLida: editingItem });");
  });

  it("PATCH que manda de volta a origem que leu (sem mexer) não sobrescreve a marcada por outra tela", async () => {
    H.mundo.itens.p1 = marcadaPorOutraTela();
    const r = await chamar("PATCH /api/items/:id", { description: "Nova", origemReaproveitamento: "", obsReaproveitamento: "", origemLida: "", obsLida: "" }, "solicitacao");
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(p1()).toMatchObject({ description: "Nova", origemReaproveitamento: "em_transito", obsReaproveitamento: OBS });
  });

  it("PATCH que MUDA a origem a partir de uma leitura velha: 409 com a origem de agora, nada gravado", async () => {
    H.mundo.itens.p1 = marcadaPorOutraTela();
    const r = await chamar("PATCH /api/items/:id", { origemReaproveitamento: "estoque", obsReaproveitamento: "", origemLida: "", obsLida: "" }, "solicitacao");
    expect(r.status, JSON.stringify(r.body)).toBe(409);
    expect(r.body.error).toMatch(/outra tela/);
    expect(p1().origemReaproveitamento).toBe("em_transito");
  });

  it("leitura em dia: a troca vale normalmente", async () => {
    H.mundo.itens.p1 = marcadaPorOutraTela();
    const r = await chamar("PATCH /api/items/:id", { origemReaproveitamento: "estoque", obsReaproveitamento: "Galpão B", origemLida: "em_transito", obsLida: OBS }, "solicitacao");
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(p1()).toMatchObject({ origemReaproveitamento: "estoque", obsReaproveitamento: "Galpão B" });
  });
});
