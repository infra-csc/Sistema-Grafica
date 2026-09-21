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
    // tubos de verdade: 1, 2, 3… sem buraco; avulsos (embalada sozinha): −1, −2, … — não consomem número
    expect(ROTAS).toContain("sql`select greatest(coalesce(max(numero), 0), 0) + 1 as proximo from tubos where event_id = ${eventId}`");
    expect(ROTAS).toContain("sql`select least(coalesce(min(numero), 0), 0) - 1 as proximo from tubos where event_id = ${eventId}`");
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
    expect(entrega).toContain('return res.status(400).json({ error: "Informe quem recebeu — é o que registra a entrega" });');
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
    expect(entrega).toContain("details: `Entrega concluída (${conferidas}/${p.quantity}, recebido por: ${recebedor}) — ${tubo.avulso ? \"Entregue\" : `Tubo ${tubo.numero} entregue`} a ${recebedor} em ${hora}`");
    // e o próprio tubo ganha a linha "Tubo 2 entregue a Fulano em 21/09 14:32"
    expect(entrega).toContain('entityType: "tubo",');
    expect(entrega).toContain("details: `${tubo.avulso ? \"Embalagem avulsa entregue\" : `Tubo ${tubo.numero} entregue`} a ${recebedor} em ${hora}${foto ? \" (com foto)\" : \"\"}`");
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
    expect(guiaDoStatus("packed")?.significado).toBe("Conferida e embalada (sozinha ou num tubo), à espera da saída do caminhão.");
    expect(guiaDoStatus("packed")?.quemAge).toBe("Gráfica");
    expect(descricaoDoStatus("packed")).toContain("Próximo passo: Entregar — a peça sozinha ou o tubo inteiro");
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
    expect(ROTAS).toContain("? (tubo.avulso ? `Embalada (sozinha)${comFoto}${veio}` : `Embalada no Tubo ${tubo.numero}${comFoto}${veio}`)");
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
    expect(ROTAS).toContain("details: tubo.avulso ? \"Embalagem desfeita — voltou a Conferido\" : `Retirada do Tubo ${tubo.numero}${motivo ? ` (${motivo})` : \"\"}`");
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
    expect(fechar).toContain("const totalDeFotos = await acumularFotos(tubo as any, fotos, quem.userName, agora);");
    expect(fechar).not.toContain("fotosFechamento: fotos,");
    expect(ROTAS).toContain("const todas = Array.from(new Set([...(tubo.fotosFechamento ?? []), ...novas]));");
    expect(ROTAS).toContain("await db.update(tubos).set({ fotosFechamento: todas, fechadoEm: agora, fechadoPor: quem, conteudoAlteradoEm: null } as any)");
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
    expect(PAINEL).toContain("o conteúdo mudou depois da foto");
  });

  it("as colunas são ADITIVAS: schema, migração e conferência", () => {
    for (const col of ['fotosFechamento: text("fotos_fechamento").array(),', 'fechadoEm: timestamp("fechado_em"),', 'fechadoPor: text("fechado_por"),', 'conteudoAlteradoEm: timestamp("conteudo_alterado_em"),']) {
      expect(SCHEMA).toContain(col);
    }
    const SQL = ler("scripts/migracao-aditiva-producao.sql");
    for (const col of ["fotos_fechamento text[]", "fechado_em timestamp", "fechado_por text", "conteudo_alterado_em timestamp"]) {
      expect(SQL).toContain(`ALTER TABLE tubos ADD COLUMN IF NOT EXISTS ${col};`);
    }
    expect(ler("scripts/migracao-aditiva-producao.mjs")).toContain("(table_name='tubos' AND column_name IN ('fotos_fechamento','fechado_em','fechado_por','conteudo_alterado_em','avulso'))");
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
    expect(GRAFICA).toContain('sub: "Aguardam embalagem"');
    expect(GRAFICA).toContain('{ value: "packed",               label: "Embalados" },');
    expect(GRAFICA).toContain("embalados:  statsPool.filter((i: any) => i.status === 'packed').length,");
  });

  it("a linha e o cartão da peça embalada oferecem Entregar e 'Tirar do tubo', e dizem se o tubo já fechou", () => {
    expect(GRAFICA).toContain("data-testid={`button-tirar-do-tubo-${item.id}`}");
    expect(GRAFICA).toContain("data-testid={`button-tirar-do-tubo-card-${item.id}`}");
    expect(GRAFICA).toContain("const fechamentoDoTubo = useMemo(() => new Map(");
    expect(GRAFICA).toContain("return `Tubo ${numeroDoTubo.get(item.tuboId)} · ${n} ${n === 1 ? \"peça\" : \"peças\"}`;");
    // o gate de produzir/reaproveitar trata embalada como conferida
    expect(GRAFICA).not.toMatch(/!isConferred\(item\)/);
    expect(GRAFICA).toContain("isPosConferencia(item)");
    // e a lista de tubos traz o fechadoEm que o selo lê
    expect(ROTAS).toContain("entregueEm: tubos.entregueEm, fechadoEm: tubos.fechadoEm }).from(tubos);");
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
    expect(src).toContain("tubo={data?.tubo.numero ?? null}");
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
    expect(PAINEL).toContain("const soVe = t.pecas.some(soVisualizaKit);");
    expect(PAINEL).toContain("const podeFormulario = !!t && !t.entregueEm && t.prontoParaEntregar && !soVe;");
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
  it("a entrega por peça (só a parcial) continua exigindo foto, sem exceção", () => {
    const ITEMS = ler("server/routes/items.ts");
    expect(ITEMS).toContain('return res.status(400).json({ error: "photoUrl is required" });');
    expect(ITEMS).not.toContain("semComprovante");
  });
});

describe("EMBALADA SOZINHA — volume avulso (dono, 21/09: 'nem sempre vai ser entregar tubo')", () => {
  it("coluna aditiva tubos.avulso, no schema e na migração", () => {
    expect(SCHEMA).toContain('avulso: boolean("avulso").notNull().default(false),');
    expect(ler("scripts/migracao-aditiva-producao.sql")).toContain("ALTER TABLE tubos ADD COLUMN IF NOT EXISTS avulso boolean NOT NULL DEFAULT false;");
  });
  it("embalar INDIVIDUAL cria avulso (só com UMA peça); o lote cria tubo numerado", () => {
    expect(ROTAS).toContain("const avulso = req.body?.avulso === true && ids.length === 1;");
    expect(ROTAS).toContain("const tubo = await criarTubo(eventId, resolveActor(req).userName, avulso);");
    expect(PAINEL).toContain("{ itemIds: ids, fotos, ...(sozinha ? { avulso: true } : {}) }");
    expect(PAINEL).toContain("const sozinha = itens.length === 1 && !comCaixas;");
  });
  it("segunda peça num avulso: deixa de ser avulso e ganha o próximo número; avulso esvaziado some", () => {
    expect(ROTAS).toContain("await db.update(tubos).set({ avulso: false, numero } as any).where(eq(tubos.id, tubo.id));");
    expect(ROTAS).toContain("if (Number(resta) === 0) await db.delete(tubos).where(eq(tubos.id, tubo.id));");
  });
  it("vocabulário: nunca 'Tubo N' para a sozinha — servidor, tela, frase do resto do fluxo e Excel", () => {
    expect(ROTAS).toContain('const oVolume = (t: Volume) => (t.avulso ? "A embalagem" : `O Tubo ${t.numero}`);');
    expect(GRAFICA).toContain('if (ehAvulsa(item)) return "Embalada";');
    expect(GRAFICA.match(/\{ehAvulsa\(item\) \? "Entregar" : "Entregar tubo"\}/g)?.length).toBe(2);
    expect(GRAFICA.match(/\{ehAvulsa\(item\) \? "Desfazer embalagem" : "Tirar do tubo"\}/g)?.length).toBe(2);
    expect(ler("client/src/lib/detalhe-producao.ts")).toContain('if (item.tuboAvulso) return "Embalada sozinha";');
    expect(ler("server/services/tubosDaPeca.ts")).toContain("tuboAvulso: !!t.avulso,");
    expect(ler("server/services/xlsxExport.ts")).toContain('return Number(n) > 0 ? n : "";');
  });
  it("PATCH /deliver diz a frase certa para cada caso", () => {
    const ITEMS = ler("server/routes/items.ts");
    expect(ITEMS).toContain('"Esta peça está embalada — entregue pela embalagem dela (Entregar)"');
    expect(ITEMS).toContain("`Esta peça está no Tubo ${tuboDaPeca.numero} — entregue o tubo (ou tire a peça dele)`");
  });
});

describe("TODAS SÃO EMBALADAS (dono, 21/09): não existe entrega direta da conferida", () => {
  it("PATCH /deliver recusa a conferida com 409 e a frase que ensina; a PARCIAL continua passando", () => {
    const ITEMS = ler("server/routes/items.ts");
    expect(ITEMS).toContain('if (currentItem.status === "conferred" || (currentItem.status as string) === "conferido") {');
    expect(ITEMS).toContain('return res.status(409).json({ error: "Embale a peça antes de entregar (Embalar pede a foto; a entrega pede só quem recebeu)" });');
  });
  it("na tela a conferida só tem Embalar: canDeliver exclui o pós-conferência, e não há Entregar secundário", () => {
    expect(GRAFICA).toContain("const canDeliver = (item: any) => !soVisualizaKit(item) && canDeliverBase(item) && !isPosConferencia(item) && !item.tuboId;");
    expect(GRAFICA).not.toContain("podeEmbalarPeca && canDeliver(item)");
    expect(GRAFICA).not.toContain("Entregar sem tubo");
  });
});

describe("EMBALAR = TUBO + FOTO (dono, 21/09: 'o embalar tem que pedir a foto, igual é o entregar')", () => {
  const patch = ROTAS.slice(ROTAS.indexOf('app.patch("/api/tubos/:id/itens"'), ROTAS.indexOf('app.delete("/api/tubos/:id"'));
  const criar = ROTAS.slice(ROTAS.indexOf('app.post("/api/events/:eventId/tubos"'), ROTAS.indexOf('app.patch("/api/tubos/:id/itens"'));

  it("embalar sem foto → 400 'Tire a foto do tubo para embalar' — no tubo aberto e no tubo novo", () => {
    expect(ROTAS).toContain('const RECADO_FOTO_DO_EMBALAR = "Tire a foto para embalar";');
    expect(patch).toContain("if (ehUmEmbalar(pecas) && lidas.fotos.length === 0) return res.status(400).json({ error: RECADO_FOTO_DO_EMBALAR });");
    expect(criar).toContain("if (ehUmEmbalar(pecas) && lidas.fotos.length === 0) return res.status(400).json({ error: RECADO_FOTO_DO_EMBALAR });");
    // no tubo novo a recusa vem ANTES de criar — não deixa tubo vazio para trás
    expect(criar.indexOf("RECADO_FOTO_DO_EMBALAR")).toBeLessThan(criar.indexOf("await criarTubo("));
  });

  it("é embalar quando entra peça CONFERIDA — inclusive a que vem de outro tubo; a em acabamento entra sem foto; tirar não pede", () => {
    expect(ROTAS).toContain("const ehUmEmbalar = (pecas: PecaCrua[]) => pecas.some((p) => !ehEntregue(p) && ehConferidaInteira(p));");
    const remover = patch.slice(patch.indexOf("if (remover.length) {"));
    expect(remover).not.toContain("RECADO_FOTO_DO_EMBALAR");
  });

  it("as fotos do embalar acumulam no tubo e a trilha da peça diz 'Embalada no Tubo 2 · 2 fotos'", () => {
    expect(patch).toContain("await colocarNoTubo(req, tubo, pecas, adicionar, lidas.fotos.length);");
    expect(patch).toContain("await acumularFotos(tubo as any, lidas.fotos, resolveActor(req).userName, new Date());");
    expect(criar).toContain("await acumularFotos(tubo as any, lidas.fotos, resolveActor(req).userName, new Date());");
    expect(ROTAS).toContain('const comFoto = nFotos > 0 ? ` · ${nFotos} ${nFotos === 1 ? "foto" : "fotos"}` : "";');
  });

});

describe("ENTREGAR É SÓ DO TUBO (dono, 21/09)", () => {
  const ITEMS = ler("server/routes/items.ts");
  const deliver = ITEMS.slice(ITEMS.indexOf('app.patch("/api/items/:id/deliver"'), ITEMS.indexOf('app.patch("/api/items/:id/deliver"') + 5000);

  it("PATCH /deliver (e o lote, que chama a mesma rota) recusa peça em tubo aberto ou packed com 409", () => {
    expect(deliver).toContain("if (tuboDaPeca && !tuboDaPeca.entregueEm) {");
    expect(deliver).toContain(": `Esta peça está no Tubo ${tuboDaPeca.numero} — entregue o tubo (ou tire a peça dele)` });");
    expect(deliver).toContain('if (currentItem.status === "packed") {');
    // a recusa vem antes de qualquer conta de saldo
    expect(deliver.indexOf("entregue o tubo")).toBeLessThan(deliver.indexOf("const legacyReuse"));
  });

  it("o lote de entrega da tela passa pela mesma rota, peça a peça", () => {
    const handler = GRAFICA.slice(GRAFICA.indexOf("const handleBulkDelivery = async"), GRAFICA.indexOf("const handleBulkDelivery = async") + 3000);
    expect(handler).toContain("apiRequest(\"PATCH\", `/api/items/${item.id}/deliver`");
  });
});
