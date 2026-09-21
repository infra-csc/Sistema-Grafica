// ─────────────────────────────────────────────────────────────────────────────
// TUBOS — agrupar na conferência, entregar por tubo (dono, 14/09).
//
// As decisões do dono, e o que este arquivo pina de cada uma:
//   · a peça vai INTEIRA para um tubo — o vínculo é uma coluna na peça, e não
//     uma tabela de unidades;
//   · a conferência continua com foto de CADA peça — o tubo só é escolhido
//     junto, e falhar no tubo não desfaz a conferência;
//   · a entrega é do TUBO INTEIRO — uma foto e um recebedor para tudo, e só
//     quando todas as peças estão conferidas (a recusa diz quais faltam);
//   · o tubo é numerado por evento e tem etiqueta.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import path from "path";
import { PODE_IR_PARA_TUBO, podeIrParaTubo } from "@shared/fluxo-peca";

const RAIZ = path.resolve(__dirname, "../..");
const ler = (rel: string) => readFileSync(path.resolve(RAIZ, rel), "utf8");
const SCHEMA = ler("shared/schema.ts");
const ROTAS = ler("server/routes/tubos.ts");
const SERVIDOR = ler("server/routes.ts");
const APP = ler("client/src/App.tsx");
const GRAFICA = ler("client/src/pages/grafica.tsx");
const PAINEL = ler("client/src/components/tubos-dialog.tsx");

describe("quando uma peça pode ir para um tubo", () => {
  it("depois que saiu da impressão: em acabamento / conferência ou já conferida", () => {
    expect([...PODE_IR_PARA_TUBO]).toEqual(["produced", "produzido", "conferred", "conferido"]);
    for (const status of ["produced", "conferred"]) expect(podeIrParaTubo(status)).toBe(true);
  });

  it("não antes de imprimir, nem depois de entregue", () => {
    for (const status of ["ready_for_production", "inProduction", "delivered", "awaiting_final_review", "", null, undefined]) {
      expect(podeIrParaTubo(status as any), String(status)).toBe(false);
    }
  });
});

describe("o modelo", () => {
  it("tubo numerado por evento, sem número repetido no mesmo evento", () => {
    expect(SCHEMA).toContain('export const tubos = pgTable("tubos", {');
    expect(SCHEMA).toContain('numero: integer("numero").notNull(),');
    expect(SCHEMA).toContain('uniqueIndex("UQ_tubos_evento_numero").on(table.eventId, table.numero),');
  });

  it("a peça aponta para UM tubo — inteira, sem dividir unidades", () => {
    expect(SCHEMA).toContain('tuboId: varchar("tubo_id").references((): any => tubos.id, { onDelete: "set null" }),');
  });

  it("a entrega do tubo guarda foto, recebedor, quando e quem registrou", () => {
    for (const campo of ['entregueEm: timestamp("entregue_em"),', 'recebidoPor: text("recebido_por"),', 'fotoEntregaUrl: text("foto_entrega_url"),', 'entreguePor: text("entregue_por"),']) {
      expect(SCHEMA).toContain(campo);
    }
  });
});

describe("as rotas", () => {
  it("existem e estão registradas", () => {
    for (const rota of [
      'app.get("/api/events/:eventId/tubos", requireAuth',
      'app.get("/api/tubos", requireAuth',
      'app.get("/api/tubos/:id", requireAuth',
      'app.post("/api/events/:eventId/tubos", requireAuth',
      'app.patch("/api/tubos/:id/itens", requireAuth',
      'app.delete("/api/tubos/:id", requireAuth',
      'app.post("/api/tubos/:id/entregar", requireAuth',
    ]) {
      expect(ROTAS).toContain(rota);
    }
    expect(SERVIDOR).toContain("registerTubosRoutes(app);");
  });

  it("são dos mesmos papéis de conferir e entregar", () => {
    // Predicado puro (21/09): a forma que o leitor da régua entende — as
    // rotas de escrita dos tubos passam a constar em shared/permissoes.ts.
    expect(ROTAS).toContain('return req.userRole === "grafica" || req.userRole === "solicitacao" || req.userRole === "admin";');
    for (const rota of ["/api/events/:eventId/tubos", "/api/tubos/:id/itens", "/api/tubos/:id", "/api/tubos/:id/entregar"]) {
      expect(ler("shared/permissoes.ts"), rota).toContain(`rota: "${rota}", papeis: ["admin", "grafica", "solicitacao"]`);
    }
  });

  it("colocar recusa peça que não pode ir — e diz o motivo de cada uma", () => {
    expect(ROTAS).toContain("é de outro evento");
    expect(ROTAS).toContain("está num tubo já entregue");
    expect(ROTAS).toContain("já foi entregue");
    expect(ROTAS).toContain("ainda não terminou a impressão");
  });

  it("numera sozinho e resolve a corrida de dois tubos no mesmo segundo", () => {
    expect(ROTAS).toContain("select coalesce(max(numero), 0) + 1 as proximo from tubos where event_id = ${eventId}");
    expect(ROTAS).toContain('error?.code === "23505"');
  });

  it("tubo entregue não se mexe, e só tubo vazio pode ser apagado", () => {
    expect(ROTAS).toContain("já foi entregue — não dá para mexer no que tem dentro");
    expect(ROTAS).toContain("tire as peças antes de apagar");
  });
});

describe("a entrega do tubo inteiro", () => {
  const entrega = ROTAS.slice(ROTAS.indexOf('app.post("/api/tubos/:id/entregar"'));

  it("exige a foto — é o comprovante, como na entrega por peça", () => {
    expect(entrega).toContain("A foto da entrega é obrigatória — ela é o comprovante");
  });

  it("só entrega quando todas as peças estão conferidas, e diz quais faltam", () => {
    expect(entrega).toContain("só é entregue inteiro, e ainda falta conferir:");
  });

  it("entrega todas numa transação só — ou todas, ou nenhuma", () => {
    expect(entrega).toContain("await db.transaction(async (tx) => {");
  });

  it("cada peça ganha o comprovante e a trilha diz de qual tubo saiu", () => {
    expect(entrega).toContain("deliveryPhotoUrl: photoUrl,");
    expect(entrega).toContain("details: `Entrega concluída (${conferidas}/${p.quantity}");
    expect(entrega).toContain("— Tubo ${tubo.numero}`");
    // autor com nome E id — a mesma forma das rotas de entrega por peça
    expect(entrega).toContain("const quem = resolveActor(req);");
    expect(entrega).toContain("...quem,");
  });

  it("não apaga um recebedor com vazio", () => {
    expect(entrega).toContain("...(recebedor ? { receivedBy: recebedor } : {}),");
  });
});

describe("na Gráfica", () => {
  it("a conferência escolhe o tubo, começando pelo tubo atual da peça", () => {
    expect(GRAFICA).toContain('data-testid="seletor-tubo"');
    expect(GRAFICA).toContain('setTuboDaConferencia(item.tuboId ?? "");');
  });

  it("falhar no tubo não desfaz a conferência — só avisa", () => {
    expect(GRAFICA).toContain("Conferida, mas não entrou no tubo");
  });

  it("cada evento abre o painel de tubos, no desktop e no celular", () => {
    expect(GRAFICA).toContain("data-testid={`button-tubos-${item.eventId}`}");
    expect(GRAFICA).toContain("data-testid={`button-tubos-mobile-${item.eventId}`}");
    expect(GRAFICA).toContain("<TubosDialog evento={tubosDoEvento} onClose={() => setTubosDoEvento(null)} />");
  });

  it("a linha mostra em que tubo a peça está", () => {
    expect(GRAFICA).toContain("data-testid={`chip-tubo-${item.id}`}");
  });

  it("o painel agrupa, entrega com foto e leva à etiqueta", () => {
    expect(PAINEL).toContain('data-testid="button-colocar-no-tubo"');
    expect(PAINEL).toContain("disabled={!t.prontoParaEntregar}");
    expect(PAINEL).toContain("disabled={entregar.isPending || fotos.length === 0}");
    expect(PAINEL).toContain("href={`/grafica/tubos/${t.id}/etiqueta`}");
  });
});

describe("a etiqueta do tubo", () => {
  const PAGINA = "client/src/pages/etiqueta-tubo.tsx";

  it("existe e está no app", () => {
    expect(existsSync(path.resolve(RAIZ, PAGINA))).toBe(true);
    expect(APP).toContain('<Route path="/grafica/tubos/:id/etiqueta">');
  });

  it("imprime o evento e o número do tubo em destaque, e a lista do que está dentro", () => {
    const src = ler(PAGINA);
    expect(src).toContain("TUBO {data.tubo.numero}");
    expect(src).toContain("window.print()");
    // 21/09 (dono): o formato da etiqueta que o galpão já cola no rolo — logo
    // do book (ou prefixo do nome) e a cidade gigante no topo, uma linha por
    // peça, SEM arte e sem código.
    expect(src).toContain("logoDaCapaDoBook(bookUrl)");
    expect(src).toContain("{linhaDaEtiquetaDoTubo(p)}");
    expect(src).not.toContain("displayId}</");
    expect(src).not.toContain("miniatura");
  });

  it("a linha da peça é 'tipo descrição - quantidade', sem repetir o tipo", async () => {
    const { linhaDaEtiquetaDoTubo } = await import("../../client/src/pages/etiqueta-tubo");
    expect(linhaDaEtiquetaDoTubo({ type: "2x1", description: "Ministério", quantity: 16 })).toBe("2x1 Ministério - 16");
    expect(linhaDaEtiquetaDoTubo({ type: "2x1", description: "2x1 Logo Santander", quantity: 3 })).toBe("2x1 Logo Santander - 3");
    expect(linhaDaEtiquetaDoTubo({ type: "Pórtico", description: "", quantity: 1 })).toBe("Pórtico - 1");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// REVISÃO ADVERSARIAL (21/09) — os furos achados no port.
// ─────────────────────────────────────────────────────────────────────────────
describe("a trava 'Solicitação sem Kit só visualiza' alcança os tubos", () => {
  it("a trava global não enxerga adicionar/remover nem a entrega, então o tubo repete a regra", () => {
    // A global (server/routes.ts) só lê /api/items/:id e itemIds.
    const GLOBAL = ler("server/routes.ts");
    expect(GLOBAL).toContain("Array.isArray(req.body?.itemIds)");
    expect(GLOBAL).not.toContain("req.body?.adicionar");
    // E o arquivo dos tubos repete a MESMA mensagem.
    expect(ROTAS).toContain('const soVisualizaKit = (req: any): boolean => req.userRole === "solicitacao" && req.userKit !== true;');
    expect(ROTAS).toContain("Peça do Kit: a Solicitação da Arena só visualiza. Quem age nela é o usuário do Kit.");
  });

  it("mexer no conteúdo do tubo confere as duas listas ANTES de gravar", () => {
    const rota = ROTAS.slice(ROTAS.indexOf('app.patch("/api/tubos/:id/itens"'), ROTAS.indexOf('app.delete("/api/tubos/:id"'));
    expect(rota).toContain("inArray(itemsTable.id, [...adicionar, ...remover])");
    expect(rota).toContain("if (barraPecaDoKit(req, res, mexidas)) return;");
    // a trava vem antes de qualquer escrita
    expect(rota.indexOf("barraPecaDoKit")).toBeLessThan(rota.indexOf("colocarNoTubo(req"));
  });

  it("entregar o tubo é entregar tudo que está dentro — inclusive o que é do Kit", () => {
    const rota = ROTAS.slice(ROTAS.indexOf('app.post("/api/tubos/:id/entregar"'));
    expect(rota).toContain("if (barraPecaDoKit(req, res, dentro)) return;");
  });

  it("a tela esconde a caixa e o 'Entregar tubo' de quem só visualiza", () => {
    expect(PAINEL).toContain('user?.role === "solicitacao" && !user?.kit && !!p.doKit');
    expect(PAINEL).toContain("!t.pecas.some(soVisualizaKit) && (");
    expect(ROTAS).toContain("doKit: !!p.kitRemessaId,");
  });

  it("tubo com peça que o usuário não vê nunca vem 'pronto para entregar'", () => {
    const rota = ROTAS.slice(ROTAS.indexOf('app.get("/api/events/:eventId/tubos"'), ROTAS.indexOf('app.get("/api/tubos"'));
    expect(rota).toContain("const totalNoTubo = new Map<string, number>();");
    expect(rota).toContain("(totalNoTubo.get(t.id) ?? 0) === dentro.length");
    expect(rota).toContain("!(soVisualizaKit(req) && dentro.some((p) => p.kitRemessaId))");
  });
});

describe("a entrega do tubo fecha o evento como a entrega da peça", () => {
  it("avisa a Solicitação quando o evento conclui", () => {
    const rota = ROTAS.slice(ROTAS.indexOf('app.post("/api/tubos/:id/entregar"'));
    expect(rota).toContain('type: "eventCompleted"');
    expect(rota).toContain('broadcast({ type: "notification_created", notification })');
    expect(rota).toContain('antes?.status !== "completed" && depois?.status === "completed"');
  });
});

describe("o tubo do lote não vaza de um lote para o outro", () => {
  it("é zerado ao sair do lote e ao abrir o dialog", () => {
    expect(GRAFICA).toContain('setBulkReceivedBy("");\n    // O tubo escolhido é DAQUELE lote');
    expect(GRAFICA).toContain('setBulkConferMode(true); setBulkSelectedIds(new Set()); setTuboDoLote("");');
    expect(GRAFICA).toContain('(setTuboDoLote(""), setBulkConferOpen(true))');
  });

  it("só usa tubo aberto que seja DO evento das peças", () => {
    expect(GRAFICA).toContain("const tuboEhDoEvento =");
    expect(GRAFICA).toContain("eventoUnicoDoLote === eventoId");
    expect(GRAFICA).toContain('const usarTuboAberto = tuboDoLote !== "novo" && porEvento.size === 1 && tuboEhDoEvento;');
  });
});

describe("a peça não nasce com impressora nem tubo", () => {
  it("publicInsertItemSchema omite os dois — quem preenche é o gesto da Gráfica", () => {
    expect(SCHEMA).toContain("  printMachine: true,\n  tuboId: true,\n});");
  });
});
