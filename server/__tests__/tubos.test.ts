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
//   · o tubo é numerado por evento e tem etiqueta.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
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

  it("tubo entregue não se mexe; apagar tubo com peças devolve-as a Conferido (21/09)", () => {
    expect(ROTAS).toContain("já foi entregue — não dá para mexer no que tem dentro");
    expect(ROTAS).not.toContain("tire as peças antes de apagar");
    expect(ROTAS).toContain("await tirarDoTubo(req, tubo, abertas.map((p) => p.id), `Tubo ${tubo.numero} apagado`);");
    expect(ROTAS).toContain("res.json({ ok: true, devolvidas: abertas.length });");
    expect(ROTAS).toContain("peça(s) voltaram a Conferido");
  });
});

describe("a entrega do tubo inteiro", () => {
  const entrega = ROTAS.slice(ROTAS.indexOf('app.post("/api/tubos/:id/entregar"'));

  it("exige QUEM RECEBEU (21/09) — a foto do comprovante passou a ser opcional", () => {
    // O material já foi fotografado ao FECHAR o tubo; o que registra a
    // entrega é o nome e a hora. 400 com frase de gente, não "receivedBy is required".
    expect(entrega).toContain('if (!recebedor) {');
    expect(entrega).toContain('return res.status(400).json({ error: "Informe quem recebeu o tubo — é o que registra a entrega" });');
    expect(entrega).not.toContain("A foto da entrega é obrigatória");
    expect(entrega).toContain('const foto = typeof photoUrl === "string" && photoUrl.trim() ? urlDeThumbValida(photoUrl) : null;');
    expect(entrega).toContain('A foto precisa ser enviada pelo app (endereço /objects/…)');
    // e o recebedor obrigatório é SÓ do tubo: a entrega por peça continua como era
    const ITEMS = ler("server/routes/items.ts");
    const porPeca = ITEMS.slice(ITEMS.indexOf('app.patch("/api/items/:id/deliver"'), ITEMS.indexOf('app.patch("/api/items/:id/deliver"') + 4000);
    expect(porPeca).toContain('return res.status(400).json({ error: "photoUrl is required" });');
    expect(porPeca).not.toContain("Informe quem recebeu");
  });

  it("só entrega quando todas as peças estão conferidas, e diz quais faltam", () => {
    expect(entrega).toContain("só é entregue inteiro, e ainda falta conferir:");
  });

  it("entrega todas numa transação só — ou todas, ou nenhuma", () => {
    expect(entrega).toContain("await db.transaction(async (tx) => {");
  });

  it("cada peça ganha o comprovante (quando há foto) e a trilha diz de qual tubo saiu, a quem e a que horas", () => {
    expect(entrega).toContain("...(foto ? { deliveryPhotoUrl: foto } : {}),");
    expect(entrega).toContain("details: `Entrega concluída (${conferidas}/${p.quantity}, recebido por: ${recebedor}) — Tubo ${tubo.numero} entregue a ${recebedor} em ${hora}`");
    // e o próprio tubo ganha a linha "Tubo 2 entregue a Fulano em 21/09 14:32"
    expect(entrega).toContain('entityType: "tubo",');
    expect(entrega).toContain("details: `Tubo ${tubo.numero} entregue a ${recebedor} em ${hora}${foto ? \" (com foto)\" : \"\"}`");
    // autor com nome E id — a mesma forma das rotas de entrega por peça
    expect(entrega).toContain("const quem = resolveActor(req);");
    expect(entrega).toContain("...quem,");
  });

  it("a hora da trilha é no fuso do galpão (dia/mês hora:minuto)", () => {
    expect(ROTAS).toContain('timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit"');
    const hora = new Date(Date.UTC(2026, 8, 21, 17, 32)).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).replace(",", "");
    expect(hora).toBe("21/09 14:32");
  });

  it("sai de conferred OU de packed — e carimba statusChangedAt ao virar delivered", () => {
    expect(entrega).toContain('...(conferidas >= p.quantity ? { status: "delivered", deliveredAt: agora, statusChangedAt: agora } : {}),');
    expect(ROTAS).toContain("(p.conferredQty ?? 0) >= p.quantity || ehPosConferencia(p.status);");
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
    expect((STATUS_GROUPS as any).packed).toEqual(["packed"]);
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
    expect(guiaDoStatus("packed")?.significado).toBe("Conferida e embalada no tubo, à espera da saída do caminhão.");
    expect(guiaDoStatus("packed")?.quemAge).toBe("Gráfica");
    expect(descricaoDoStatus("packed")).toContain("Próximo passo: Entregar o tubo");
  });

  it("todo lugar que traduz status conhece 'packed'", () => {
    expect(ler("server/routes/shared.ts")).toContain('packed: "Embalado",');
    expect(ler("server/services/tempo-etapas.ts")).toContain('packed: "Embalado",');
    expect(ler("server/services/xlsxExport.ts")).toContain('packed: "Embalado"');
    expect(ler("server/routes/items.ts")).toContain('"Embalado": "packed",');
    expect(ler("client/src/lib/painel-rotas.ts")).toContain("packed:                  TELAS.grafica,");
    expect(ler("client/src/lib/fases.ts")).toContain('packed:       ["packed"],');
    expect(ler("shared/prazos-contract.ts")).toContain('export const PRODUCED_LIKE = ["produced", "conferred", "packed", "produzido"] as const;');
  });

  it("a fila da Gráfica (storage + delta) serve packed", () => {
    expect(ler("server/storage.ts")).toContain("'produced', 'conferred', 'packed', 'delivered')");
    expect(ler("server/routes/items.ts")).toContain('"approved", "inProduction", "produced", "conferred", "packed", "delivered",');
  });
});

describe("as transições conferred ⇄ packed moram nas rotas de tubos", () => {
  it("colocar no tubo embala a CONFERIDA (a em acabamento espera a conferência) e carimba statusChangedAt", () => {
    expect(ROTAS).toContain('.set({ status: EMBALADO, statusChangedAt: agora, updatedAt: agora } as any)');
    expect(ROTAS).toContain('.where(and(inArray(itemsTable.id, ids), inArray(itemsTable.status, ["conferred", "conferido"])))');
    expect(ROTAS).toContain("const embaladas = new Set(await embalar(ids, agora));");
    expect(ROTAS).toContain("? `Embalada no Tubo ${tubo.numero}${veio}`");
    expect(ROTAS).toContain(": `Peça colocada no Tubo ${tubo.numero}${veio} — ainda falta conferir`");
  });

  it("a conferência de peça que JÁ está no tubo fecha como packed", () => {
    const ITEMS = ler("server/routes/items.ts");
    expect(ITEMS).toContain('...(isFull ? { status: (current.tuboId ? "packed" : "conferred") as "packed" | "conferred" } : {}),');
    expect(ITEMS).toContain('+ (isFull && current.tuboId ? " — já estava no tubo: Embalada" : "")');
  });

  it("tirar do tubo devolve a conferred, com trilha 'Retirada do Tubo N'", () => {
    expect(ROTAS).toContain('.set({ status: "conferred", statusChangedAt: agora, updatedAt: agora } as any)');
    expect(ROTAS).toContain(".where(and(inArray(itemsTable.id, ids), eq(itemsTable.status, EMBALADO)))");
    expect(ROTAS).toContain("details: `Retirada do Tubo ${tubo.numero}${motivo ? ` (${motivo})` : \"\"}`");
    const patch = ROTAS.slice(ROTAS.indexOf('app.patch("/api/tubos/:id/itens"'), ROTAS.indexOf('app.delete("/api/tubos/:id"'));
    expect(patch).toContain("await tirarDoTubo(req, tubo, dentro.map((d) => d.id));");
  });

  it("nada de status novo para peça parcialmente conferida — só isFull muda o status", () => {
    const ITEMS = ler("server/routes/items.ts");
    const confer = ITEMS.slice(ITEMS.indexOf('app.post("/api/items/:id/confer"'), ITEMS.indexOf('app.post("/api/items/:id/confer"') + 6000);
    expect(confer).toContain('// Status só vira "conferred" quando conferiu tudo; parcial continua "produced".');
    expect(confer.match(/status: \(current\.tuboId/g)?.length).toBe(1);
  });
});

describe("fechar o tubo (foto do tubo e dos itens) — não é entrega", () => {
  const fechar = ROTAS.slice(ROTAS.indexOf('app.post("/api/tubos/:id/fechar"'), ROTAS.indexOf('app.post("/api/tubos/:id/entregar"'));

  it("existe, com os papéis da entrega, e está na régua de permissões", () => {
    expect(fechar).toContain('app.post("/api/tubos/:id/fechar", requireAuth');
    expect(fechar).toContain("if (!podeMexerEmTubo(req)) return res.status(403)");
    expect(ler("shared/permissoes.ts")).toContain('rota: "/api/tubos/:id/fechar", papeis: ["admin", "grafica", "solicitacao"]');
  });

  it("aceita VÁRIAS fotos, só do nosso storage (a régua dos thumbs), no mínimo uma e no máximo 20", () => {
    expect(ROTAS).toContain('import { urlDeThumbValida } from "./thumb-url";');
    expect(fechar).toContain("const cruas = Array.isArray(req.body?.fotos) ? req.body.fotos : (req.body?.fotoUrl ? [req.body.fotoUrl] : []);");
    expect(fechar).toContain('if (cruas.length === 0) return res.status(400).json({ error: "Tire pelo menos uma foto do tubo fechado" });');
    expect(fechar).toContain('if (cruas.length > 20) return res.status(400).json({ error: "No máximo 20 fotos por tubo" });');
    expect(fechar).toContain("const fotos = Array.from(new Set(cruas.map(urlDeThumbValida)));");
    expect(fechar).toContain("As fotos precisam ser enviadas pelo app (endereço /objects/…)");
  });

  it("grava as fotos, quando e quem — e NÃO mexe na entrega nem leva a delivered", () => {
    expect(fechar).toContain("fotosFechamento: fotos,");
    expect(fechar).toContain("fechadoEm: agora,");
    expect(fechar).toContain("fechadoPor: quem.userName,");
    expect(fechar).toContain("conteudoAlteradoEm: null,");
    expect(fechar).not.toContain("delivered");
    // só LÊ entregueEm (para recusar tubo já entregue); nunca grava
    expect(fechar).not.toContain("entregueEm: ");
  });

  it("as peças viram/continuam packed e a trilha diz 'Embalada no Tubo N · 3 fotos'", () => {
    expect(fechar).toContain("await embalar(dentro.filter((p) => !ehEntregue(p)).map((p) => p.id), agora);");
    expect(fechar).toContain("details: !ehEntregue(p) && ehConferidaInteira(p)");
    expect(fechar).toContain("? `Embalada no Tubo ${tubo.numero} · ${n} ${n === 1 ? \"foto\" : \"fotos\"}`");
    expect(fechar).toContain(": `Fotografada no Tubo ${tubo.numero} · ${n}");
    expect(fechar).toContain("`Tubo ${tubo.numero} fechado com ${n} ${n === 1 ? \"foto\" : \"fotos\"} em ${quandoBR(agora)}`");
  });

  it("tubo vazio ou já entregue não fecha", () => {
    expect(fechar).toContain("está vazio — ponha as peças antes de fechar");
    expect(fechar).toContain("já foi entregue");
  });

  it("mexer no conteúdo depois da foto marca o tubo, e a tela avisa", () => {
    expect(ROTAS).toContain("async function marcarConteudoAlterado(tubo: { id: string; fechadoEm: Date | null }, agora: Date) {");
    expect(ROTAS).toContain("alteradoDepoisDaFoto: !!t.fechadoEm && !!t.conteudoAlteradoEm && t.conteudoAlteradoEm > t.fechadoEm,");
    expect(PAINEL).toContain("tubo alterado depois da foto");
  });

  it("as colunas são ADITIVAS: schema, migração e conferência", () => {
    for (const col of ['fotosFechamento: text("fotos_fechamento").array(),', 'fechadoEm: timestamp("fechado_em"),', 'fechadoPor: text("fechado_por"),', 'conteudoAlteradoEm: timestamp("conteudo_alterado_em"),']) {
      expect(SCHEMA).toContain(col);
    }
    const SQL = ler("scripts/migracao-aditiva-producao.sql");
    for (const col of ["fotos_fechamento text[]", "fechado_em timestamp", "fechado_por text", "conteudo_alterado_em timestamp"]) {
      expect(SQL).toContain(`ALTER TABLE tubos ADD COLUMN IF NOT EXISTS ${col};`);
    }
    expect(ler("scripts/migracao-aditiva-producao.mjs")).toContain("(table_name='tubos' AND column_name IN ('fotos_fechamento','fechado_em','fechado_por','conteudo_alterado_em'))");
    // e NENHUM script mexe no status do que já está no banco (dono: "não muda nada em produção")
    expect(existsSync(path.resolve(RAIZ, "scripts/backfill-status-em-tubo.mjs"))).toBe(false);
    expect(SQL).not.toMatch(/update\s+items/i);
    const trecho = SQL.slice(SQL.lastIndexOf("\n", SQL.indexOf("21/09 · Etapa")) + 1);
    const comandos = trecho.split("\n").filter((l) => l.trim() && !l.trim().startsWith("--"));
    for (const c of comandos) expect(c).toMatch(/^ALTER TABLE tubos ADD COLUMN IF NOT EXISTS /);
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
    expect(GRAFICA).toContain('{ label: "Embalados",    value: stats.embalados,  sub: "Aguardam o caminhão",  testId: "stat-packed",     filterVals: ["packed"] },');
    expect(GRAFICA).toContain('sub: "Aguardam tubo ou entrega"');
    expect(GRAFICA).toContain('{ value: "packed",               label: "Embalados" },');
    expect(GRAFICA).toContain("embalados:  statsPool.filter((i: any) => i.status === 'packed').length,");
  });

  it("a linha e o cartão da peça embalada oferecem Entregar e 'Tirar do tubo', e dizem se o tubo já fechou", () => {
    expect(GRAFICA).toContain("data-testid={`button-tirar-do-tubo-${item.id}`}");
    expect(GRAFICA).toContain("data-testid={`button-tirar-do-tubo-card-${item.id}`}");
    expect(GRAFICA).toContain("const fechamentoDoTubo = useMemo(() => new Map(");
    expect(GRAFICA).toContain("return `Tubo ${numeroDoTubo.get(item.tuboId)}${fechado ? ` · fechado ${fechado}` : \"\"}`;");
    // o gate de produzir/reaproveitar trata embalada como conferida
    expect(GRAFICA).not.toMatch(/!isConferred\(item\)/);
    expect(GRAFICA).toContain("isPosConferencia(item)");
    // e a lista de tubos traz o fechadoEm que o selo lê
    expect(ROTAS).toContain("entregueEm: tubos.entregueEm, fechadoEm: tubos.fechadoEm }).from(tubos);");
  });

  it("o modal tem os dois passos, nessa ordem: fechar (fotos) e entregar (quem recebeu)", () => {
    const iFechar = PAINEL.indexOf("data-testid={`fechar-tubo-${t.numero}`}");
    const iEntregar = PAINEL.indexOf("data-testid={`entregar-tubo-${t.numero}`}");
    expect(iFechar).toBeGreaterThan(0);
    expect(iEntregar).toBeGreaterThan(iFechar);
    expect(PAINEL).toContain("Fechar tubo (foto do tubo)");
    expect(PAINEL).toContain("Entregar tubo (quem recebeu)");
    expect(PAINEL).toContain('await apiRequest("POST", `/api/tubos/${tubo.id}/fechar`, { fotos: fotosFechamento });');
    expect(PAINEL).toContain("disabled={fechar.isPending || fotosFechamento.length === 0}");
    // entregar: recebedor obrigatório, foto opcional, e entregar sem fechar é permitido (só sugere)
    expect(PAINEL).toContain("disabled={entregar.isPending || !recebidoPor.trim()}");
    expect(PAINEL).not.toContain("fotos.length === 0}");
    expect(PAINEL).toContain("Este tubo ainda não foi fechado com foto. Dá para entregar assim mesmo");
    // apagar tubo com peças pede confirmação e diz que elas voltam a Conferido
    expect(PAINEL).toContain("data-testid={`confirmar-apagar-tubo-${t.numero}`}");
    expect(PAINEL).toContain("`Apagar e devolver ${t.pecas.length} a Conferido`");
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
    expect(PAINEL).toContain('data-testid="button-colocar-no-tubo"');
    expect(PAINEL).toContain("disabled={!t.prontoParaEntregar}");
    expect(PAINEL).toContain("disabled={entregar.isPending || !recebidoPor.trim()}");
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

describe("o servidor nunca recebeu tubo pela conferência", () => {
  it("POST /confer não lê tuboId do corpo — só o tubo em que a peça JÁ está", () => {
    const ITEMS = ler("server/routes/items.ts");
    const confer = ITEMS.slice(ITEMS.indexOf('app.post("/api/items/:id/confer"'), ITEMS.indexOf('app.post("/api/items/:id/confer"') + 6000);
    expect(confer).not.toContain("req.body.tuboId");
    expect(confer).not.toMatch(/tuboId\s*[,}]\s*=\s*req\.body/);
    expect(confer).toContain("current.tuboId");
  });
});

describe("a peça não nasce com impressora nem tubo", () => {
  it("publicInsertItemSchema omite os dois — quem preenche é o gesto da Gráfica", () => {
    expect(SCHEMA).toContain("  printMachine: true,\n  tuboId: true,\n});");
  });
});
