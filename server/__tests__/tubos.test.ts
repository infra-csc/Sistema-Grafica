// ─────────────────────────────────────────────────────────────────────────────
// TUBOS — embalar depois de conferir, entregar por tubo (dono, 14/09 e 21/09).
//
// As decisões do dono, e o que este arquivo pina de cada uma:
//   · a peça vai INTEIRA para um tubo — o vínculo é uma coluna na peça, e não
//     uma tabela de unidades;
//   · a conferência é só conferir com foto de CADA peça — o tubo é escolhido
//     DEPOIS, no "Embalar" da peça conferida (21/09: "o tubo só na hora de
//     embalar; tire da conferência"). Ver embalar-na-fila.test.ts;
//   · a entrega é do TUBO INTEIRO — uma foto e um recebedor para tudo, e só
//     quando todas as peças estão conferidas (a recusa diz quais faltam);
//   · o tubo é numerado por evento e tem etiqueta;
//   · o modelo com QUANTIDADE (tubo_itens, embalada_qty), as contas e a entrega
//     parcial estão em embalagem-com-quantidade.test.ts.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { fonteDasRotasDeItens } from "./fonte-das-rotas-de-itens";
import { readFileSync, existsSync } from "fs";
import path from "path";
import { PODE_IR_PARA_TUBO, podeIrParaTubo, EMBALADO, ehEmbalada, POS_CONFERENCIA, ehPosConferencia, DEPOIS_DA_ARTE } from "@shared/fluxo-peca";

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
    // `packed` está na lista só para a peça poder MUDAR de tubo (21/09).
    expect([...PODE_IR_PARA_TUBO]).toEqual(["produced", "produzido", "conferred", "conferido", "packed"]);
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


  it("numera sozinho e resolve a corrida de dois tubos no mesmo segundo", () => {
    // tubos de verdade: 1, 2, 3… sem buraco; avulsos (embalada sozinha): −1, −2, … — não consomem número
    expect(ROTAS).toContain("sql`select greatest(coalesce(max(numero), 0), 0) + 1 as proximo from tubos where event_id = ${eventId}`");
    expect(ROTAS).toContain("sql`select least(coalesce(min(numero), 0), 0) - 1 as proximo from tubos where event_id = ${eventId}`");
    expect(ROTAS).toContain('error?.code === "23505"');
  });

});

describe("a entrega do tubo inteiro", () => {
  const entrega = ROTAS.slice(ROTAS.indexOf('app.post("/api/tubos/:id/entregar"'));



  it("entrega todas numa transação só — ou todas, ou nenhuma", () => {
    expect(entrega).toContain("const feito = await db.transaction(async (tx: Ex) => {");
  });


  it("a hora da trilha é no fuso do galpão (dia/mês hora:minuto)", () => {
    expect(ROTAS).toContain('timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit"');
    const hora = new Date(Date.UTC(2026, 8, 21, 17, 32)).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).replace(",", "");
    expect(hora).toBe("21/09 14:32");
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// EMBALADO (dono, 21/09) — a etapa entre Conferido e Entregue.
// ─────────────────────────────────────────────────────────────────────────────
describe("a etapa Embalado no fluxo da peça", () => {
  it("a chave é packed, e os helpers reconhecem só ela", () => {
    expect(EMBALADO).toBe("packed");
    expect(ehEmbalada("packed")).toBe(true);
    for (const s of ["conferred", "delivered", "produced", "", null, undefined]) expect(ehEmbalada(s as any), String(s)).toBe(false);
  });

  it("pós-conferência = conferida ou embalada (e nunca entregue)", () => {
    expect([...POS_CONFERENCIA]).toEqual(["conferred", "conferido", "packed"]);
    for (const s of ["conferred", "conferido", "packed"]) expect(ehPosConferencia(s)).toBe(true);
    for (const s of ["delivered", "produced", null]) expect(ehPosConferencia(s as any)).toBe(false);
  });

  it("a ordem do fim do fluxo é produced → conferred → packed → delivered em TODA lista ordenada", async () => {
    const { PRODUCTION_STATUSES } = await import("../../client/src/lib/status");
    expect([...PRODUCTION_STATUSES]).toEqual(["inProduction", "produced", "conferred", "packed", "delivered"]);
    const { STATUS_GROUPS, GROUP_KEYS } = await import("../../client/src/lib/painel-kpis");
    const i = GROUP_KEYS.indexOf("packed" as any);
    expect(GROUP_KEYS[i - 1]).toBe("conferred");
    expect(GROUP_KEYS[i + 1]).toBe("delivered");
    expect((STATUS_GROUPS as any).packed[0]).toBe("packed");
    expect(ler("shared/schema.ts")).toContain('  "conferred",\n  // Embalado (dono, 21/09): conferida e dentro de um tubo, esperando o caminhão.\n  "packed",\n  "delivered",');
    expect(DEPOIS_DA_ARTE.has("packed")).toBe(true);
  });

  it("tem rótulo, cor com contraste AA (azul, entre o ciano e o verde) e guia", async () => {
    const { STATUS, guiaDoStatus, descricaoDoStatus, P } = await import("../../client/src/lib/status");
    expect(STATUS.packed.label).toBe("Embalado");
    expect(STATUS.packed.short).toBe("Embalado");
    expect(STATUS.packed.text).toBe(P.blue.text);
    expect(STATUS.packed.text).not.toBe(STATUS.conferred.text);
    expect(STATUS.packed.text).not.toBe(STATUS.delivered.text);
    expect(guiaDoStatus("packed")?.significado).toBe("Conferida e embalada (sozinha ou num tubo), à espera da saída do caminhão.");
    expect(guiaDoStatus("packed")?.quemAge).toBe("Gráfica");
    expect(descricaoDoStatus("packed")).toContain("Próximo passo: Entregar — a peça sozinha ou o tubo inteiro");
  });

  it("todo lugar que traduz status conhece 'packed'", () => {
    expect(ler("server/routes/shared.ts")).toContain('packed: "Embalado",');
    expect(ler("server/services/tempo-etapas.ts")).toContain('packed: "Embalado",');
    expect(ler("server/services/xlsxExport.ts")).toContain('packed: "Embalado"');
    expect(fonteDasRotasDeItens()).toContain('"Embalado": "packed",');
    expect(ler("client/src/lib/painel-rotas.ts")).toContain("packed:                  TELAS.grafica,");
    // A etapa canônica (shared/fluxo-peca) é a fonte; fases e PRODUCED_LIKE derivam dela.
    expect(ler("shared/fluxo-peca.ts")).toContain('packed:                ["packed", "embalado"],');
    expect(ler("client/src/lib/fases.ts")).toContain("statuses: STATUS_DA_ETAPA[key]");
    expect(ler("shared/prazos-contract.ts")).toContain("export const PRODUCED_LIKE: readonly string[] = STATUS_PRODUZIDAS;");
  });

  it("a fila da Gráfica (storage + delta) serve packed", () => {
    expect(ler("server/storage.ts")).toContain("'produced', 'conferred', 'packed', 'delivered')");
    expect(fonteDasRotasDeItens()).toContain('"approved", "inProduction", "produced", "conferred", "packed", "delivered",');
  });
});

describe("fechar o tubo (foto do tubo e dos itens) — não é entrega", () => {
  const fechar = ROTAS.slice(ROTAS.indexOf('app.post("/api/tubos/:id/fechar"'), ROTAS.indexOf('app.post("/api/tubos/:id/entregar"'));

  it("existe, com os papéis da entrega, e está na régua de permissões", () => {
    expect(fechar).toContain('app.post("/api/tubos/:id/fechar", requireAuth');
    expect(fechar).toContain("if (!podeMexerEmTubo(req)) return res.status(403)");
    expect(ler("shared/permissoes.ts")).toContain('rota: "/api/tubos/:id/fechar", papeis: ["admin", "grafica", "solicitacao"]');
  });

  it("aceita VÁRIAS fotos, só do nosso storage (a régua dos thumbs), no mínimo uma e no máximo 20 por vez", () => {
    expect(ROTAS).toContain('import { urlDeThumbValida } from "./thumb-url";');
    // a leitura é uma só, para embalar e para adicionar fotos
    expect(ROTAS).toContain("const cruas = Array.isArray(body?.fotos) ? body.fotos : (body?.fotoUrl ? [body.fotoUrl] : []);");
    expect(ROTAS).toContain('if (cruas.length > 20) return { fotos: [], erro: "No máximo 20 fotos por vez" };');
    expect(ROTAS).toContain("As fotos precisam ser enviadas pelo app (endereço /objects/…)");
    expect(fechar).toContain("const lidas = lerFotos(req.body);");
    expect(fechar).toContain('if (lidas.fotos.length === 0) return res.status(400).json({ error: "Tire pelo menos uma foto do tubo" });');
  });

  it("ACUMULA as fotos (21/09) em vez de substituir, sem duplicar; grava quando e quem — e NÃO mexe na entrega", () => {
    expect(fechar).toContain("const total = await acumularFotos(travado, fotos, quem.userName, agora, tx);");
    // 22/09: carimba as peças do tubo, para o delta `?since=` trazer a hora da foto
    expect(fechar).toContain("await tx.update(itemsTable).set({ updatedAt: agora } as any).where(inArray(itemsTable.id, Array.from(new Set(ids))));");
    expect(fechar).not.toContain("fotosFechamento: fotos,");
    expect(ROTAS).toContain("const todas = Array.from(new Set([...(tubo.fotosFechamento ?? []), ...novas]));");
    expect(ROTAS).toContain("await ex.update(tubos).set({ fotosFechamento: todas, fechadoEm: agora, fechadoPor: quem, conteudoAlteradoEm: null } as any)");
    expect(fechar).not.toContain("delivered");
    // só LÊ entregueEm (para recusar tubo já entregue); nunca grava
    expect(fechar).not.toContain("entregueEm: ");
  });



  it("mexer no conteúdo depois da foto marca o tubo, e a tela avisa", () => {
    expect(ROTAS).toContain("async function marcarConteudoAlterado(tubo: { id: string; fechadoEm: Date | null }, agora: Date, ex: Ex = db) {");
    expect(ROTAS).toContain("alteradoDepoisDaFoto: !!t.fechadoEm && !!t.conteudoAlteradoEm && t.conteudoAlteradoEm > t.fechadoEm,");
    expect(PAINEL).toContain("o conteúdo mudou depois da foto");
  });

});

describe("Embalado na tela", () => {
  it("a Gráfica tem o cartão entre Conferidos e Entregues, o filtro e o stat", () => {
    const iConf = GRAFICA.indexOf('testId: "stat-conferred"');
    const iPack = GRAFICA.indexOf('testId: "stat-packed"');
    const iDeliv = GRAFICA.indexOf('testId: "stat-delivered"');
    expect(iConf).toBeGreaterThan(0);
    expect(iPack).toBeGreaterThan(iConf);
    expect(iDeliv).toBeGreaterThan(iPack);
    expect(GRAFICA).toContain('{ label: "Embalados",    value: stats.embalados,  sub: "Aguardam o caminhão",  testId: "stat-packed",     filterVals: FILTRO_DOS_CARTOES.embalados },');
    expect(GRAFICA).toContain('embalados: ["packed"],');
    expect(GRAFICA).toContain('sub: "Aguardam embalagem"');
    expect(GRAFICA).toContain('{ value: "packed",               label: "Embalados" },');
    expect(GRAFICA).toContain("embalados:  conta(FILTRO_DOS_CARTOES.embalados),");
  });


  it("são TRÊS modais focados (21/09) — o comportamento está montado em tubos-tres-modais.test.ts", () => {
    for (const nome of ["EmbalarDialog", "EntregarTuboDialog", "PainelDeTubos", "TubosDialog"]) expect(PAINEL).toContain(`export function ${nome}(`);
    // as mesmas rotas de sempre, sem regra nova no cliente
    expect(PAINEL).toContain('await apiRequest("POST", `/api/tubos/${tubo.id}/fechar`, { fotos: fotosNovas })');
    expect(PAINEL).toContain('await apiRequest("POST", `/api/tubos/${t!.id}/entregar`, { photoUrl: fotos[0] ?? null, receivedBy: recebidoPor.trim(), notes: obs });');
    // o painel não tem mais o "Colocar" nem a lista de peças sem tubo
    expect(PAINEL).not.toContain("button-colocar-no-tubo");
    expect(PAINEL).not.toContain("pecas-sem-tubo");
  });

  it("a etiqueta e a ficha reconhecem a embalada como conferida", () => {
    expect(ler("client/src/pages/etiquetas-evento.tsx")).toContain('const CONFERIDA = new Set(["conferred", "conferido", "packed", "delivered", "entregue"]);');
    expect(ler("client/src/components/item-details-dialog.tsx")).toContain('if (rawStatus === "packed") {');
  });
});

describe("na Gráfica", () => {
  it("a conferência NÃO escolhe tubo (dono, 21/09) — nem a individual, nem o lote", () => {
    expect(GRAFICA).not.toContain('data-testid="seletor-tubo"');
    expect(GRAFICA).not.toContain("tuboDaConferencia");
    expect(GRAFICA).not.toContain("tuboDoLote");
    expect(GRAFICA).not.toContain("Conferida, mas não entrou no tubo");
    expect(GRAFICA).not.toContain("Conferidas, mas não entraram no tubo");
  });

  it("cada evento abre o painel de tubos, no desktop e no celular", () => {
    expect(GRAFICA).toContain("data-testid={`button-tubos-${item.eventId}`}");
    expect(GRAFICA).toContain("data-testid={`button-tubos-mobile-${item.eventId}`}");
    expect(GRAFICA).toContain("<TubosDialog evento={tubosDoEvento} onClose={() => setTubosDoEvento(null)}");
  });

  it("a linha mostra em que tubo a peça está", () => {
    expect(GRAFICA).toContain("data-testid={`chip-tubo-${item.id}`}");
  });

  it("o painel agrupa, entrega com quem recebeu e leva à etiqueta", () => {
    expect(PAINEL).toContain("const pronto = podeFormulario && !!recebidoPor.trim();");
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
    // 21/09 (2ª rodada): o desenho mora no componente compartilhado com as
    // listas do evento; a página monta as páginas e manda imprimir.
    expect(ler("client/src/components/etiqueta-lista.tsx")).toContain("TUBO {props.tubo}");
    // 22/09: embalada sozinha (tubo avulso / sem número) não imprime "TUBO N"
    expect(src).toContain("tubo={numero}");
    // 21/09: o número real vem do tubo; o que SAI pode ser editado só para a impressão
    expect(src).toContain("const numeroReal = avulso ? null : data?.tubo.numero ?? null;");
    expect(src).toContain("numeroEditado(tuboEditado, numeroReal)");
    expect(src).toContain("window.print()");
    // 21/09 (dono): o formato da etiqueta que o galpão já cola no rolo — logo
    // do book (ou prefixo do nome) e a cidade gigante no topo, uma linha por
    // peça, SEM arte e sem código.
    expect(src).toContain("logoDaCapaDoBook(bookUrl)");
    expect(src).toContain("<EtiquetaEmLista");
    expect(src).not.toContain("displayId}</");
    expect(src).not.toContain("miniatura");
  });

  it("a linha da peça é 'tipo descrição - quantidade', sem repetir o tipo", async () => {
    // A regra saiu da página: um lugar só, o mesmo das listas do evento.
    const { linhaDaLista: linhaDaEtiquetaDoTubo } = await import("../../client/src/lib/etiqueta-lista");
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



  it("a tela esconde a caixa e o 'Entregar tubo' de quem só visualiza", () => {
    expect(PAINEL).toContain('user?.role === "solicitacao" && !user?.kit && !!p.doKit');
    expect(PAINEL).toContain("const soVe = t.pecas.some(soVisualizaKit);");
    expect(PAINEL).toContain("const podeFormulario = !!t && !t.entregueEm && t.prontoParaEntregar && !soVe && comProblema.length === 0;");
    expect(ROTAS).toContain("doKit: !!p.kitRemessaId,");
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

describe("a peça não nasce com impressora nem tubo", () => {
  it("publicInsertItemSchema omite os dois — quem preenche é o gesto da Gráfica", () => {
    expect(SCHEMA).toContain("  printMachine: true,\n  tuboId: true,\n");
  });
});

describe("a entrega da embalada só exige quem recebeu; a direta continua exigindo foto (21/09)", () => {
  it("o comprovante é SEMPRE opcional no volume — a foto vem de antes (conferência e embalar)", () => {
    const entregar = ROTAS.slice(ROTAS.indexOf('app.post("/api/tubos/:id/entregar"'));
    expect(entregar).not.toContain("fotosFechamento ?? []).length === 0");
    expect(entregar).not.toContain("ainda não tem foto");
    expect(entregar).toContain("if (!recebedor) {");
    // na tela o botão depende só do nome
    expect(PAINEL).toContain("const pronto = podeFormulario && !!recebidoPor.trim();");
    expect(PAINEL).not.toContain("Tire a foto do comprovante");
  });
});

describe("EMBALADA SOZINHA — volume avulso (dono, 21/09: 'nem sempre vai ser entregar tubo')", () => {
  it("coluna aditiva tubos.avulso, no schema e na migração", () => {
    expect(SCHEMA).toContain('avulso: boolean("avulso").notNull().default(false),');
    expect(ler("scripts/migracao-aditiva-producao.sql")).toContain("ALTER TABLE tubos ADD COLUMN IF NOT EXISTS avulso boolean NOT NULL DEFAULT false;");
  });
});

describe("ENTREGAR É SÓ DO TUBO (dono, 21/09)", () => {
  const ITEMS = fonteDasRotasDeItens();
  const deliver = ITEMS.slice(ITEMS.indexOf('app.patch("/api/items/:id/deliver"'), ITEMS.indexOf('app.patch("/api/items/:id/deliver"') + 5000);


  it("a tela não tem mais lote de entrega por peça — nada chama a rota aposentada", () => {
    expect(GRAFICA).not.toContain("const handleBulkDelivery = async");
    expect(GRAFICA).not.toContain("/deliver`");
  });
});
