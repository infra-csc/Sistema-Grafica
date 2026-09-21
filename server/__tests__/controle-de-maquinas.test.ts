// ─────────────────────────────────────────────────────────────────────────────
// CONTROLE DE IMPRESSÃO POR MÁQUINA (dono, 14/09).
//
// "A Gráfica ter uma aba onde faz o controle de impressão por máquinas: ver
// quais máquinas estão imprimindo o quê, qual o histórico do que foi impresso
// naquela máquina naquele dia e tudo mais."
//
// O que este arquivo pina:
//   1. O DIÁRIO existe: registros_de_impressao, uma linha por gesto, com a
//      máquina daquele momento — não a última máquina da peça, que perderia a
//      divisão quando a peça troca de máquina no meio.
//   2. OS GESTOS GRAVAM: iniciar, trocar, lançar parcial e concluir.
//   3. O DIÁRIO NUNCA DERRUBA O GESTO: falha ao gravar vai para o log.
//   4. A LEITURA responde as duas perguntas da tela, no fuso da operação.
//   5. A TELA existe, está no app e a Gráfica chega nela pelo cabeçalho.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi } from "vitest";
import { readFileSync, existsSync } from "fs";
import path from "path";

const RAIZ = path.resolve(__dirname, "../..");
const ler = (rel: string) => readFileSync(path.resolve(RAIZ, rel), "utf8");
const SCHEMA = ler("shared/schema.ts");
const ITEMS = ler("server/routes/items.ts");
const ROTAS = ler("server/routes.ts");
const APP = ler("client/src/App.tsx");
const GRAFICA = ler("client/src/pages/grafica.tsx");

describe("1 · o diário das máquinas", () => {
  it("é uma tabela própria, um gesto por linha", () => {
    expect(SCHEMA).toContain('export const registrosDeImpressao = pgTable("registros_de_impressao", {');
    expect(SCHEMA).toContain('maquina: text("maquina").notNull(),');
    expect(SCHEMA).toContain('tipo: text("tipo").notNull(), // "inicio" | "troca" | "parcial" | "conclusao"');
    expect(SCHEMA).toContain('quantidade: integer("quantidade").notNull().default(0),');
    expect(SCHEMA).toContain('totalDepois: integer("total_depois"),');
  });

  it("apaga junto com a peça e tem índice para a consulta do dia por máquina", () => {
    expect(SCHEMA).toContain('itemId: varchar("item_id").notNull().references(() => items.id, { onDelete: "cascade" }),');
    expect(SCHEMA).toContain('index("IDX_registros_impressao_maquina_data").on(table.maquina, table.createdAt),');
  });
});

describe("2 · os gestos gravam no diário", () => {
  it("iniciar e trocar de máquina", () => {
    const rota = ITEMS.slice(
      ITEMS.indexOf('app.patch("/api/items/:id/start-printing"'),
      ITEMS.indexOf('app.patch("/api/items/:id/start-production"'),
    );
    expect(rota).toContain("await registrarImpressao(req, {");
    expect(rota).toContain(`tipo: movimento ? "troca" : "inicio",`);
  });

  it("lançar parcial e concluir — com o que saiu NESTE lançamento, não o total", () => {
    expect(ITEMS).toContain('tipo: item.status === "produced" ? "conclusao" : "parcial",');
    expect(ITEMS).toContain("quantidade: quantityProduced - jaProduzido,");
    expect(ITEMS).toContain("totalDepois: quantityProduced,");
  });

  it("usa a máquina enviada agora ou, na falta, a que a peça já tinha", () => {
    expect(ITEMS).toContain("maquina: (partesDepois ? maquina : null) || printMachine || before.printMachine,");
  });
});

describe("3 · o diário nunca derruba o gesto", () => {
  const ajudante = ITEMS.slice(
    ITEMS.indexOf("async function registrarImpressao("),
    ITEMS.indexOf("// ─── MOTIVO das devoluções"),
  );

  it("falha ao gravar vai para o log e o gesto segue", () => {
    expect(ajudante).toContain("try {");
    expect(ajudante).toContain('console.error("[maquinas] falha ao gravar o registro de impressão"');
  });

  it("sem máquina não há o que anotar", () => {
    expect(ajudante).toContain("if (!dado.maquina) return;");
  });
});

describe("4 · a leitura", () => {
  const ROTA = ler("server/routes/maquinas.ts");

  it("existe e está registrada no servidor", () => {
    expect(ROTA).toContain('app.get("/api/grafica/maquinas", requireAuth');
    expect(ROTAS).toContain("registerMaquinasRoutes(app);");
  });

  it("é dos mesmos papéis que veem a fila da Gráfica", () => {
    expect(ROTA).toContain('const PAPEIS_QUE_VEEM = ["grafica", "solicitacao", "admin"];');
    expect(ROTA).toContain("O controle de máquinas é da Gráfica, da Solicitação e do admin");
  });

  it("'agora' lê as peças em impressão; as sem máquina não somem", () => {
    expect(ROTA).toContain("where i.deleted_at is null and i.status in ('inProduction', 'em_producao')");
    expect(ROTA).toContain("const semMaquina = emImpressao");
  });

  it("o dia é o de São Paulo, convertido no banco — não no fuso do processo", () => {
    expect(ROTA).toContain('const FUSO = "America/Sao_Paulo";');
    expect(ROTA).toContain("where ((r.created_at at time zone 'UTC') at time zone ${FUSO})::date = ${dia}::date");
  });

  it("dia inválido ou no futuro volta para hoje", () => {
    expect(ROTA).toContain("const dia = DIA_VALIDO.test(pedido) && pedido <= hoje ? pedido : hoje;");
  });

  it("o total do dia soma só o que saiu da máquina — início e troca não imprimem nada", () => {
    expect(ROTA).toContain('(soma, r) => soma + (r.tipo === "parcial" || r.tipo === "conclusao" ? r.quantidade : 0),');
  });
});

describe("5 · a tela", () => {
  const PAGINA_REL = "client/src/pages/grafica-maquinas.tsx";
  const PAGINA = ler(PAGINA_REL);

  it("existe e está no app, com os papéis da Gráfica", () => {
    expect(existsSync(path.resolve(RAIZ, PAGINA_REL))).toBe(true);
    expect(APP).toContain('const GraficaMaquinas = lazyPage(() => import("@/pages/grafica-maquinas"));');
    expect(APP).toContain('<Route path="/grafica/maquinas">');
    expect(APP).toContain("<RoleProtectedRoute component={GraficaMaquinas} allowedRoles={ROLES_GRAFICA} />");
  });

  it("a Gráfica chega nela pelo cabeçalho, e dela volta para a fila — já filtrada", () => {
    expect(GRAFICA).toContain('href="/grafica/maquinas"');
    expect(GRAFICA).toContain('data-testid="link-maquinas"');
    expect(PAGINA).toContain('data-testid="link-voltar-fila"');
    expect(PAGINA).toContain('const GRAFICA_EM_IMPRESSAO = "/grafica?status=inProduction";');
    expect(PAGINA).toContain('const GRAFICA_LIBERADOS = "/grafica?status=ready_for_production,approved";');
  });

  it("responde as duas perguntas: agora e o dia", () => {
    expect(PAGINA).toContain('data-testid={`maquina-agora-${m.codigo}`}');
    expect(PAGINA).toContain('data-testid="diario-tabela"');
    expect(PAGINA).toContain('data-testid="diario-cartoes"');
    expect(PAGINA).toContain('"Livre"');
  });

  it("navega entre dias sem deixar ir para o futuro; dia e impressora vivem na URL", () => {
    expect(PAGINA).toContain('data-testid="dia-anterior"');
    expect(PAGINA).toContain("disabled={ehHoje}");
    expect(PAGINA).toContain("max={hoje}");
    expect(PAGINA).toContain('const diaEscolhido = params.get("dia");');
    expect(PAGINA).toContain('const maquinaFiltro = params.get("maquina") ?? "";');
    expect(PAGINA).toContain("navegar(`/grafica/maquinas${qs ? `?${qs}` : \"\"}`, { replace: true });");
  });

  it("avisa das peças em impressão sem máquina e de quando o histórico começa", () => {
    expect(PAGINA).toContain('data-testid="sem-maquina"');
    expect(PAGINA).toContain("O histórico por máquina começa em 14/09/2026");
    expect(PAGINA).toContain('const INICIO_DO_DIARIO = "2026-09-14";');
  });

  it("atualiza sozinha — é painel de parede do galpão (polling + WebSocket + 'atualizado há')", () => {
    expect(PAGINA).toContain("refetchInterval: 60_000,");
    expect(PAGINA).toContain("refetchOnWindowFocus: true,");
    expect(PAGINA).toContain('data-testid="atualizado-ha"');
    // O WebSocket derruba a chave nos gestos de impressão…
    expect(ler("client/src/hooks/use-websocket.ts")).toContain("invalidateCoalesced('/api/grafica/maquinas');");
    // …e a chave é [rota, "?dia=…"] para o prefixo alcançar qualquer dia aberto.
    expect(PAGINA).toContain('["/api/grafica/maquinas", `?dia=${diaEscolhido}`]');
    expect(ler("client/src/lib/queryClient.ts")).toContain('typeof queryKey[0] === "string" && queryKey[0].startsWith("/api/")');
  });

  it("todos os estados: carregando (silhueta), lento, erro com 'tentar novamente', vazio útil, 'mostrar mais'", () => {
    expect(PAGINA).toContain('data-testid="maquinas-carregando"');
    expect(PAGINA).toContain('data-testid="maquinas-lento"');
    expect(PAGINA).toContain('data-testid="maquinas-erro"');
    expect(PAGINA).toContain('data-testid="maquinas-erro-suave"');
    expect(PAGINA).toContain('data-testid="diario-vazio"');
    expect(PAGINA).toContain("Ao iniciar uma impressão na Gráfica, ela aparece aqui.");
    expect(PAGINA).toContain('data-testid="button-mostrar-mais"');
    expect(PAGINA).toContain("const LOTE = 60;");
  });

  it("age daqui (dono, 21/09): o cartão e a linha do diário abrem o MESMO modal da fila — só para quem pode", () => {
    expect(PAGINA).toContain('from "@/components/grafica/modal-impressao"');
    expect(PAGINA).toContain('const podeAgir = user?.role === "grafica" || user?.role === "admin";');
    expect(PAGINA).toContain("data-testid={`button-impressas-${p.id}`}");
    // A linha do diário NÃO repete a ação (dono, 21/09): ela é da peça, no cartão.
    expect(PAGINA).not.toContain("button-impressas-linha-");
    expect(PAGINA).toContain("data-testid={`link-escolher-peca-${m.codigo}`}");
    // Evento finalizado: o botão explica antes, com a mesma frase do 409.
    expect(PAGINA).toContain('motivoAcaoBloqueada(selo.motivo, "informar impressas")');
    // A leitura entrega ao modal o que ele precisa.
    expect(ler("server/routes/maquinas.ts")).toContain("i.approval_thumb_url,");
    expect(ler("server/routes/maquinas.ts")).toContain("ordem: ordemPorId.get(l.id) ?? 0,");
  });

  it("vocabulário do dono (21/09): nunca 'Registrar'; o diário fala de impressas e acabamento", () => {
    expect(PAGINA).not.toMatch(/Registrar/);
    expect(PAGINA).toContain('return "Iniciou a impressão";');
    expect(PAGINA).toContain("return `Trocou para ${rotuloMaquina}`;");
    expect(PAGINA).toContain("return `Mandou ${r.quantidade} para acabamento${total}`;");
    expect(PAGINA).toContain("return `Concluiu: ${r.totalDepois ?? r.aImprimir} de ${r.aImprimir} impressas`;");
  });

  it("acessibilidade e performance: aria nos controles, linha do diário memoizada, cores por token", () => {
    expect(PAGINA).toContain('role="progressbar"');
    expect(PAGINA).toContain("aria-pressed={ativo}");
    expect(PAGINA).toContain('aria-label="Escolher o dia"');
    expect(PAGINA).toContain("const LinhaDoDiario = memo(function LinhaDoDiario(");
    expect(PAGINA).toContain('import { T, FS, R } from "@/lib/theme";');
    // Cores proibidas como texto (régua da casa) e o cinza aposentado.
    expect(PAGINA).not.toContain("#78716c");
    expect(PAGINA).not.toMatch(/color: "#f97316"|color: "#a8a29e"/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6 · O RELATÓRIO (dono, 21/09: "não tem relatório diário, não tem relatório
// para exportar"). A conta é pura e roda aqui sem banco; a planilha é lida de
// volta com o próprio ExcelJS para provar as duas abas.
// ─────────────────────────────────────────────────────────────────────────────
process.env.DATABASE_URL ??= "postgresql://teste:teste@localhost:5432/teste";

const em = (dia: string, hora: string) => Date.parse(`${dia}T${hora}:00-03:00`);
const reg = (id: string, itemId: string, maquina: string, tipo: any, quantidade: number, totalDepois: number | null, dia: string, hora: string, quem = "Ana") => ({
  id, itemId, displayId: `#${itemId}`, tipoPeca: "Backdrop", evento: "Maratona SP", maquina, tipo, quantidade, totalDepois, aImprimir: 10, dia, hora, em: em(dia, hora), quem,
});

describe("6 · o relatório — a conta pura", async () => {
  const r = await import("../services/relatorioDeMaquinas");

  it("por dia × impressora: unidades, peças, concluídas, ainda na máquina, primeira/última, tempo ativo, quem", () => {
    const dias = r.agregarRelatorioDeMaquinas([
      reg("a", "p1", "1", "inicio", 0, 0, "2026-09-21", "08:00"),
      reg("b", "p1", "1", "parcial", 3, 3, "2026-09-21", "09:30", "Bia"),
      reg("c", "p2", "1", "inicio", 0, 0, "2026-09-21", "10:00"),
      reg("d", "p2", "1", "conclusao", 10, 10, "2026-09-21", "11:20"),
      reg("e", "p3", "2", "inicio", 0, 0, "2026-09-21", "07:00"),
      reg("f", "p3", "2", "parcial", -1, 4, "2026-09-21", "07:45"), // correção entra com sinal
      reg("g", "p3", "3", "troca", 0, 4, "2026-09-21", "08:10"),    // saiu da 2, foi para a 3
      reg("h", "p9", "4", "conclusao", 5, 10, "2026-09-20", "16:00"),
    ]);
    expect(dias.map((d) => d.dia)).toEqual(["2026-09-21", "2026-09-20"]); // mais recente primeiro
    const hoje = dias[0];
    expect(hoje.maquinas.map((m) => m.maquina)).toEqual(["1", "2", "3", "4"]); // sempre as quatro
    const m1 = hoje.maquinas[0];
    expect(m1).toMatchObject({ unidades: 13, pecas: 2, concluidas: 1, aindaNaMaquina: 1, primeira: "08:00", ultima: "11:20", minutosAtivos: 200 });
    expect(m1.quem).toEqual(["Ana", "Bia"]);
    // A 2 perdeu a peça para a 3: não está "ainda na máquina" na 2, e sim na 3.
    expect(hoje.maquinas[1]).toMatchObject({ unidades: -1, pecas: 1, concluidas: 0, aindaNaMaquina: 0 });
    expect(hoje.maquinas[2]).toMatchObject({ unidades: 0, pecas: 1, aindaNaMaquina: 1, primeira: "08:10", ultima: "08:10", minutosAtivos: 0 });
    expect(hoje.maquinas[3]).toMatchObject({ unidades: 0, pecas: 0, primeira: null, ultima: null });
    expect(hoje.total).toEqual({ unidades: 12, pecas: 4, concluidas: 1, aindaNaMaquina: 2, minutosAtivos: 245 });
    expect(dias[1].total.unidades).toBe(5);
    expect(r.agregarRelatorioDeMaquinas([])).toEqual([]);
  });

  it("o período: sem nada é hoje; fim não passa de hoje; início não passa do fim; teto de um ano", () => {
    expect(r.periodoValido(undefined, undefined, "2026-09-21")).toEqual({ de: "2026-09-21", ate: "2026-09-21" });
    expect(r.periodoValido("2026-09-15", "2026-09-21", "2026-09-21")).toEqual({ de: "2026-09-15", ate: "2026-09-21" });
    expect(r.periodoValido("2026-09-15", "2026-12-01", "2026-09-21")).toEqual({ de: "2026-09-15", ate: "2026-09-21" });
    expect(r.periodoValido("2026-09-25", "2026-09-21", "2026-09-21")).toEqual({ de: "2026-09-21", ate: "2026-09-21" });
    expect(r.periodoValido("lixo", "2026-09-21", "2026-09-21")).toEqual({ de: "2026-09-21", ate: "2026-09-21" });
    expect(r.periodoValido("2020-01-01", "2026-09-21", "2026-09-21").de).toBe("2025-09-21");
  });

  it("frases: duração curta, o que aconteceu (a mesma da tela) e o nome do arquivo", () => {
    expect(r.duracaoCurta(0)).toBe("—");
    expect(r.duracaoCurta(45)).toBe("45 min");
    expect(r.duracaoCurta(80)).toBe("1h 20min");
    expect(r.duracaoCurta(120)).toBe("2h");
    expect(r.oQueAconteceuNoRegistro({ tipo: "troca", quantidade: 0, totalDepois: 3, aImprimir: 10, maquina: "2" })).toBe("Trocou para Impressora 2");
    expect(r.oQueAconteceuNoRegistro({ tipo: "parcial", quantidade: 3, totalDepois: 4, aImprimir: 10, maquina: "2" })).toBe("Mandou 3 para acabamento (4 de 10)");
    expect(r.nomeDoArquivoDoRelatorio("2026-09-21", "2026-09-21")).toBe("maquinas-2026-09-21.xlsx");
    expect(r.nomeDoArquivoDoRelatorio("2026-09-15", "2026-09-21")).toBe("maquinas-2026-09-15-a-2026-09-21.xlsx");
  });
});

describe("6 · o relatório — a rota e o Excel", () => {
  const ROTA = ler("server/routes/maquinas.ts");

  it("duas rotas de LEITURA, com os mesmos papéis e o mesmo filtro do Kit do retrato", () => {
    expect(ROTA).toContain('app.get("/api/grafica/maquinas/relatorio", requireAuth');
    expect(ROTA).toContain('app.get("/api/grafica/maquinas/relatorio.xlsx", requireAuth');
    expect((ROTA.match(/if \(!podeVer\(req, res\)\) return;/g) ?? []).length).toBe(3);
    expect(ROTA).toContain(".filter(filtroDoKit(req));");
    expect(ROTA).toContain("between ${de}::date and ${ate}::date");
    expect(ROTA).toContain("periodoValido(req.query.de, req.query.ate, hoje)");
    // As únicas escritas do arquivo são as da reserva (abaixo).
    expect((ROTA.match(/app\.(post|patch|put|delete)\(/g) ?? []).length).toBe(2);
  });

  it("a planilha sai com as abas Resumo e Registros, cabeçalhos em pt-BR e o total do dia", async () => {
    // O exceljs de verdade puxa o jszip ao carregar, e o pnpm não o expõe
    // neste ambiente (a mesma nota do teste de importação). O fake abaixo
    // guarda o que o gerador escreve — que é o que se quer conferir.
    vi.doMock("exceljs", () => {
      class Cell { value: any = null; font: any; fill: any; alignment: any; border: any; numFmt: any; }
      class Row {
        cells = new Map<number, Cell>();
        height = 0;
        constructor(private ws: Sheet) {}
        getCell(i: number) { let c = this.cells.get(i); if (!c) { c = new Cell(); this.cells.set(i, c); } return c; }
        eachCell(_o: any, fn: (c: Cell, i: number) => void) { const n = Math.max(this.ws.columns.length, ...this.cells.keys()); for (let i = 1; i <= n; i++) fn(this.getCell(i), i); }
        get values() { const v: any[] = [undefined]; const n = Math.max(...this.cells.keys(), 0); for (let i = 1; i <= n; i++) v.push(this.cells.get(i)?.value); return v; }
      }
      class Sheet {
        columns: { key: string }[] = [];
        rows: Row[] = [];
        views: any; autoFilter: any;
        constructor(public name: string) {}
        getRow(n: number) { while (this.rows.length < n) this.rows.push(new Row(this)); return this.rows[n - 1]; }
        getCell(ref: string) { const col = ref.charCodeAt(0) - 64; const row = Number(ref.slice(1)); return this.getRow(row).getCell(col); }
        mergeCells() {}
        addRow(obj: Record<string, any>) { const r = this.getRow(this.rows.length + 1); this.columns.forEach((c, i) => { if (obj[c.key] !== undefined) r.getCell(i + 1).value = obj[c.key]; }); return r; }
      }
      class Workbook {
        creator = ""; created: any; worksheets: Sheet[] = [];
        addWorksheet(name: string) { const s = new Sheet(name); this.worksheets.push(s); return s; }
        getWorksheet(name: string) { return this.worksheets.find((w) => w.name === name); }
      }
      return { default: { Workbook } };
    });
    const { montarPlanilhaDeMaquinas } = await import("../services/xlsxExport");
    const { agregarRelatorioDeMaquinas } = await import("../services/relatorioDeMaquinas");
    const registros = [
      reg("a", "p1", "1", "inicio", 0, 0, "2026-09-21", "08:00"),
      reg("b", "p1", "1", "parcial", 3, 3, "2026-09-21", "09:30", "Bia"),
      reg("c", "p2", "2", "conclusao", 10, 10, "2026-09-21", "11:20"),
    ];
    // O workbook é conferido em memória: serializar puxa o jszip, que o pnpm
    // não expõe ao exceljs neste ambiente (a mesma nota do teste de importação).
    const lido = montarPlanilhaDeMaquinas({ de: "2026-09-21", ate: "2026-09-21", resumo: agregarRelatorioDeMaquinas(registros), registros });
    expect(lido.worksheets.map((w) => w.name)).toEqual(["Resumo", "Registros"]);

    const resumo = lido.getWorksheet("Resumo")!;
    const texto = (ws: { getRow: (n: number) => { values: unknown } }, linha: number) => (ws.getRow(linha).values as any[]).slice(1).map((v) => (v == null ? "" : String(v)));
    expect(texto(resumo, 3)).toEqual(["Dia", "Impressora", "Unidades impressas", "Peças", "Concluídas", "Ainda na máquina", "Primeira atividade", "Última atividade", "Tempo ativo", "Quem"]);
    expect(texto(resumo, 4)).toEqual(["21/09/2026", "Impressora 1 (New XT)", "3", "1", "0", "1", "08:00", "09:30", "1h 30min", "Ana, Bia"]);
    expect(texto(resumo, 8).slice(0, 5)).toEqual(["21/09/2026", "TOTAL DO DIA", "13", "2", "1"]);

    const regs = lido.getWorksheet("Registros")!;
    expect(texto(regs, 3)).toEqual(["Data", "Hora", "Impressora", "Código", "Peça", "Tipo", "Evento", "O que aconteceu", "Quantidade", "Total depois", "Quem"]);
    expect(texto(regs, 5)).toEqual(["21/09/2026", "09:30", "Impressora 1 (New XT)", "#p1", "Backdrop", "Impressas", "Maratona SP", "Mandou 3 para acabamento (3 de 10)", "3", "3", "Bia"]);
    expect(texto(regs, 6)[7]).toBe("Concluiu: 10 de 10 impressas");
    // Importar xlsxExport puxa o storage inteiro; na suíte cheia passa de 5s.
  }, 30_000);
});

// ─────────────────────────────────────────────────────────────────────────────
// 7 · A RESERVA de impressora (dono, 21/09: "deixar na fila alguns itens
// (geral) ou já setar em alguma impressora" — e "o reservar é só um controle
// na Máquinas, não muda nada de status").
// ─────────────────────────────────────────────────────────────────────────────
describe("7 · a reserva de impressora — só um controle, nunca uma etapa", () => {
  const ROTA = ler("server/routes/maquinas.ts");
  const PERMISSOES = ler("shared/permissoes.ts");

  it("o dado: items.maquina_prevista, aditivo, fora do que a API pública aceita criar", () => {
    expect(SCHEMA).toContain('maquinaPrevista: text("maquina_prevista"),');
    expect(SCHEMA.slice(SCHEMA.indexOf("export const publicInsertItemSchema"))).toContain("maquinaPrevista: true,");
    expect(ler("scripts/migracao-aditiva-producao.sql")).toContain("ALTER TABLE items ADD COLUMN IF NOT EXISTS maquina_prevista text;");
    expect(ler("scripts/migracao-aditiva-producao.mjs")).toContain("'maquina_prevista'");
  });

  it("a rota (unitária e em lote): grafica/admin, só peças liberadas, evento vivo", () => {
    expect(ROTA).toContain('app.patch("/api/items/:id/maquina-prevista", requireAuth');
    expect(ROTA).toContain('app.patch("/api/items/bulk-maquina-prevista", requireAuth');
    expect(ROTA).toContain('const PODE_RESERVAR = ["ready_for_production", "pronto_para_producao", "approved", "liberado"];');
    expect(ROTA).toContain("const motivo = await motivoEventoDaPeca(item);");
    expect(PERMISSOES).toContain('{ metodo: "PATCH", rota: "/api/items/:id/maquina-prevista", papeis: ["admin", "grafica"] },');
    expect(PERMISSOES).toContain('{ metodo: "PATCH", rota: "/api/items/bulk-maquina-prevista", papeis: ["admin", "grafica"] },');
  });

  it("NUNCA muda status, statusChangedAt, printMachine, productionStartedAt nem grava no diário", () => {
    // Só código: os comentários explicam justamente o que NÃO se faz.
    const reserva = ROTA.slice(ROTA.indexOf("// ─── RESERVA de impressora"), ROTA.indexOf("// ── O relatório")).replace(/\/\/.*$/gm, "");
    // As duas gravações escrevem SÓ a reserva (o storage carimba updatedAt).
    expect((reserva.match(/storage\.updateItem\([^,]+, \{ maquinaPrevista: pedido\.maquina \} as any\)/g) ?? []).length).toBe(2);
    expect(reserva).not.toMatch(/status:|statusChangedAt|printMachine|productionStartedAt|registrarImpressao|registros_de_impressao/);
    // A trilha é informativa, sem etapa.
    expect(reserva).toContain('maquina ? `Reservada para a ${rotuloDaMaquina(maquina)}` : "Devolvida à fila geral"');
    expect(reserva).toContain('broadcast({ type: "item_updated", item });');
  });

  it("vira realidade só no start-printing, que limpa a reserva", () => {
    const rota = ITEMS.slice(ITEMS.indexOf('app.patch("/api/items/:id/start-printing"'), ITEMS.indexOf('app.patch("/api/items/:id/start-production"'));
    expect(rota).toContain("maquinaPrevista: null,");
  });

  it("o retrato traz a fila: reservadas por impressora e a fila geral, na ordem do caminhão", () => {
    expect(ROTA).toContain("where i.deleted_at is null and i.status in ('ready_for_production', 'pronto_para_producao', 'approved', 'liberado')");
    expect(ROTA).toContain("order by e.truck_departure_date asc nulls last, i.display_id asc");
    expect(ROTA).toContain("naFila: fila.filter((p) => p.maquinaPrevista === m.codigo)");
    expect(ROTA).toContain("res.json({ dia, hoje, maquinas: maquinasComFila, semMaquina, filaGeral });");
  });

  it("o formato compacto leva a reserva de ida e volta", async () => {
    const { compactarPecas, expandirPecas } = await import("@shared/itens-compactos");
    const peca = { id: "p1", displayId: "#0001", status: "approved", quantity: 3, printMachine: null, maquinaPrevista: "2", tuboId: null, eventId: "e1", event: { id: "e1", name: "Maratona" } };
    const volta = expandirPecas(compactarPecas([peca]));
    expect(JSON.stringify(volta[0])).toBe(JSON.stringify(peca));
    expect(volta[0].maquinaPrevista).toBe("2");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8 · PEÇA DIVIDIDA entre impressoras (dono, 21/09: "ao mover, poder
// selecionar tudo ou quantidades"), só os papéis da Gráfica na leitura, e o
// selo "Fila: Impressora N" na Gráfica.
// ─────────────────────────────────────────────────────────────────────────────
describe("8 · a impressão dividida — a conta pura", async () => {
  const d = await import("@shared/impressao-dividida");

  it("mover tudo, mover parte, limites e a origem que some", () => {
    const partes = { "1": { atrib: 10, impressas: 5 } };
    const parcial = d.moverParte(partes, "1", "2", 2);
    expect(parcial).toEqual({ ok: true, partes: { "1": { atrib: 8, impressas: 5 }, "2": { atrib: 2, impressas: 0 } }, movidas: 2, ficam: 3 });
    const tudo = d.moverParte(partes, "1", "2", null);
    expect(tudo).toEqual({ ok: true, partes: { "1": { atrib: 5, impressas: 5 }, "2": { atrib: 5, impressas: 0 } }, movidas: 5, ficam: 0 });
    // Origem sem nada impresso nem atribuído desaparece.
    expect(d.moverParte({ "1": { atrib: 4, impressas: 0 } }, "1", "3", null)).toMatchObject({ ok: true, partes: { "3": { atrib: 4, impressas: 0 } } });
    expect(d.moverParte(partes, "1", "2", 6)).toMatchObject({ ok: false, erro: "Só há 5 un. por imprimir na Impressora 1 (New XT) — não dá para mover 6" });
    expect(d.moverParte(partes, "1", "2", 0)).toMatchObject({ ok: false });
    expect(d.moverParte(partes, "1", "1", 1)).toMatchObject({ ok: false });
    expect(d.moverParte({ "1": { atrib: 5, impressas: 5 } }, "1", "2", null)).toMatchObject({ ok: false });
  });

  it("principal = a que mais tem por imprimir; total = soma das impressas; jsonb nulo quando não há divisão", () => {
    const partes = { "1": { atrib: 8, impressas: 5 }, "2": { atrib: 2, impressas: 0 } };
    expect(d.maquinaPrincipal(partes, "2")).toBe("1");
    expect(d.maquinaPrincipal({ "1": { atrib: 5, impressas: 5 }, "2": { atrib: 5, impressas: 0 } }, "2")).toBe("2");
    expect(d.totalImpressas(partes)).toBe(5);
    expect(d.normalizarPartes({ "2": { atrib: 10, impressas: 0 } }, 10)).toBeNull();
    expect(d.normalizarPartes(partes, 10)).toEqual(partes);
    expect(d.estaDividida({ printMachine: "1", impressaoPorMaquina: partes })).toBe(true);
    expect(d.estaDividida({ printMachine: "1", impressaoPorMaquina: null })).toBe(false);
    expect(d.partesDaPeca({ printMachine: "1", quantity: 10, reuseQty: 2, quantityProduced: 3 })).toEqual({ "1": { atrib: 8, impressas: 3 } });
    expect(d.lerPartes({ "9": { atrib: 1 }, "1": { atrib: "3", impressas: 7 } })).toEqual({ "1": { atrib: 3, impressas: 3 } });
    expect(d.resumoDaDivisao(partes)).toBe("Impressora 1 (New XT) · 5 de 8 un. / Impressora 2 · 0 de 2 un.");
  });

  it("o dado: items.impressao_por_maquina jsonb, aditivo, fora da API pública, e o compacto leva de ida e volta", async () => {
    expect(SCHEMA).toContain('impressaoPorMaquina: jsonb("impressao_por_maquina")');
    expect(SCHEMA.slice(SCHEMA.indexOf("export const publicInsertItemSchema"))).toContain("impressaoPorMaquina: true,");
    expect(ler("scripts/migracao-aditiva-producao.sql")).toContain("ALTER TABLE items ADD COLUMN IF NOT EXISTS impressao_por_maquina jsonb;");
    expect(ler("scripts/migracao-aditiva-producao.mjs")).toContain("'impressao_por_maquina'");
    const { compactarPecas, expandirPecas } = await import("@shared/itens-compactos");
    const peca = { id: "p1", displayId: "#0001", status: "inProduction", quantity: 10, printMachine: "1", impressaoPorMaquina: { "1": { atrib: 8, impressas: 5 }, "2": { atrib: 2, impressas: 0 } }, eventId: "e1", event: { id: "e1", name: "Maratona" } };
    const volta = expandirPecas(compactarPecas([peca]));
    expect(JSON.stringify(volta[0])).toBe(JSON.stringify(peca));
  });

  it("start-printing: `quantidade` move parte, grava a troca com a quantidade e a trilha diz quantas ficam", () => {
    const rota = ITEMS.slice(ITEMS.indexOf('app.patch("/api/items/:id/start-printing"'), ITEMS.indexOf('app.patch("/api/items/:id/start-production"'));
    expect(rota).toContain("const { printMachine, quantidade, deMaquina } = req.body ?? {};");
    expect(rota).toContain("const r = moverParte(partesAtuais, origem!, printMachine, quantidade == null ? null : Number(quantidade));");
    expect(rota).toContain("if (!r.ok) return res.status(409).json({ error: r.erro });");
    expect(rota).toContain("printMachine: principal,");
    expect(rota).toContain("impressaoPorMaquina: partesNovas,");
    expect(rota).toContain("quantidade: movimento?.movidas ?? 0,");
    expect(rota).toContain("`Movidas ${movimento.movidas} un. para a ${rotuloDaMaquina(printMachine)} (${movimento.ficam} ficam na ${rotuloDaMaquina(origem)})`");
  });

  it("start-production: por impressora quando dividida, nunca mais que o atribuído; o total é a soma; concluir limpa o jsonb", () => {
    const rota = ITEMS.slice(ITEMS.indexOf('app.patch("/api/items/:id/start-production"'), ITEMS.indexOf("Auto-add to inventory when fully produced"));
    expect(rota).toContain("if (estaDividida(before)) {");
    expect(rota).toContain("if (n > parte.atrib) return res.status(400).json({ error: `Máximo ${parte.atrib} un. na ${rotuloDaMaquina(maquina)} — é o que foi atribuído a ela` });");
    expect(rota).toContain("quantityProduced = totalImpressas(partesDepois);");
    expect(rota).toContain('{ impressaoPorMaquina: newProdStatus === "produced" ? null : partesDepois, printMachine: maquinaPrincipal(partesDepois, maquina) ?? before.printMachine }');
  });

  it("a Gráfica: só admin/grafica/solicitacao leem Máquinas; o selo 'Fila: Impressora N' e a divisão na linha", () => {
    const ROTA = ler("server/routes/maquinas.ts");
    expect((ROTA.match(/requireAuth, requireRole\(\.\.\.PAPEIS_QUE_VEEM\)/g) ?? []).length).toBe(3);
    expect(ler("client/src/App.tsx")).toContain("<RoleProtectedRoute component={GraficaMaquinas} allowedRoles={ROLES_GRAFICA} />");
    expect(ler("client/src/components/app-sidebar.tsx")).toMatch(/url: "\/grafica\/maquinas",\s+icon: \w+,\s+roles: \["grafica", "solicitacao", "admin"\]/);
    expect(GRAFICA).toContain("function SeloFilaDaImpressora(");
    expect(GRAFICA).toContain("{!isInProd(item) && item.maquinaPrevista && <SeloFilaDaImpressora maquina={item.maquinaPrevista} fonte={12} />}");
    expect(GRAFICA).toContain("{!isInProd(item) && item.maquinaPrevista && <div style={{ marginTop: 4 }}><SeloFilaDaImpressora maquina={item.maquinaPrevista} fonte={10.5} /></div>}");
    expect(GRAFICA).toContain("const maquina = dividida ? resumoDaDivisao(partesDaPeca(item)) : item.printMachine ? rotuloDaMaquina(item.printMachine) : null;");
    // O retrato entrega a parte de cada impressora e a peça aparece nos dois cartões.
    expect(ROTA).toContain("return partes ? !!partesAtivas(partes)[codigo] : l.print_machine === codigo;");
    expect(ROTA).toContain("return { ...p, maquina: codigo, parte };");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9 · Revisão adversarial da peça dividida (21/09): total nunca descola da
// soma; parte esgotada não é "imprimindo"; teto que muda reescala o jsonb;
// a troca não conta como peça impressa.
// ─────────────────────────────────────────────────────────────────────────────
describe("9 · peça dividida — os cantos que a revisão achou", async () => {
  const d = await import("@shared/impressao-dividida");
  const PRODUCAO = ITEMS.slice(ITEMS.indexOf('app.patch("/api/items/:id/start-production"'), ITEMS.indexOf("Auto-add to inventory when fully produced"));

  it("reescalarPartes: encolhe a principal até a soma bater; estica quando o teto cresce; some quando sobra uma chave", () => {
    const partes = { "1": { atrib: 8, impressas: 5 }, "2": { atrib: 2, impressas: 0 } };
    // 10 → 7: tira 3 da principal (a "1", com 3 por imprimir).
    expect(d.reescalarPartes(partes, 7)).toEqual({ "1": { atrib: 5, impressas: 5 }, "2": { atrib: 2, impressas: 0 } });
    // 10 → 6: a "1" esgota o restante e a "2" perde 1.
    expect(d.reescalarPartes(partes, 6)).toEqual({ "1": { atrib: 5, impressas: 5 }, "2": { atrib: 1, impressas: 0 } });
    // 10 → 5: a "2" zera e some; sobra uma chave com tudo → sem divisão (null).
    expect(d.reescalarPartes(partes, 5)).toBeNull();
    // 10 → 3: o teto ficou abaixo das impressas — as impressas encolhem junto.
    expect(d.reescalarPartes(partes, 3)).toBeNull();
    expect(d.reescalarPartes({ "1": { atrib: 8, impressas: 5 }, "2": { atrib: 2, impressas: 2 } }, 4)).toEqual({ "1": { atrib: 2, impressas: 2 }, "2": { atrib: 2, impressas: 2 } });
    // 10 → 12: a principal recebe o que cresceu.
    expect(d.reescalarPartes(partes, 12)).toEqual({ "1": { atrib: 10, impressas: 5 }, "2": { atrib: 2, impressas: 0 } });
    expect(d.reescalarPartes(null, 10)).toBeNull();
    expect(d.partesAtivas({ "1": { atrib: 3, impressas: 3 }, "2": { atrib: 2, impressas: 0 } })).toEqual({ "2": { atrib: 2, impressas: 0 } });
  });

  it("[1] dividida sem `maquina` → 409; qualquer caminho que feche a peça zera o jsonb", () => {
    expect(PRODUCAO).toContain("if (maquina == null || impressasNaMaquina == null) {");
    expect(PRODUCAO).toContain('return res.status(409).json({ error: "Peça dividida entre impressoras: informe a impressora e quantas saíram dela" });');
    expect(PRODUCAO).toContain('...(newProdStatus === "produced" ? { impressaoPorMaquina: null } : {}),');
  });

  it("[2] parte esgotada não é 'imprimindo'; lançamento com delta 0 que não conclui → 409", () => {
    expect(ler("server/routes/maquinas.ts")).toContain("return partes ? !!partesAtivas(partes)[codigo] : l.print_machine === codigo;");
    expect(PRODUCAO).toContain("if (quantityProduced === jaConsta && !fecha) {");
    expect(PRODUCAO).toContain("return res.status(409).json({ error: `Nada mudou: já constam ${jaConsta} un. impressas.` });");
    expect(ler("client/src/pages/grafica-maquinas.tsx")).toContain("{podeAgir && !parteEsgotada && (");
  });

  it("[3] editar quantidade, reaproveitar e corrigir reaproveitamento reescalam (ou apagam) a divisão", () => {
    const patch = ITEMS.slice(ITEMS.indexOf('app.patch("/api/items/:id", requireAuth'), ITEMS.indexOf("storage.updateItem(req.params.id, updatePayload)"));
    expect(patch).toContain("updatePayload.impressaoPorMaquina = promoveuParaProduzido ? null : reescalarPartes(lerPartes(currentItem.impressaoPorMaquina), nova - reusoNovo);");
    const reuso = ITEMS.slice(ITEMS.indexOf('app.post("/api/items/:id/mark-reuse"'), ITEMS.indexOf('app.post("/api/items/:id/correct-reuse"'));
    expect(reuso).toContain("{ impressaoPorMaquina: isReady ? null : reescalarPartes(lerPartes(current.impressaoPorMaquina), current.quantity - newReuse) }");
    expect((reuso.match(/impressaoPorMaquina: null,/g) ?? []).length).toBe(1); // reaproveitar tudo → produzida
    const correcao = ITEMS.slice(ITEMS.indexOf('app.post("/api/items/:id/correct-reuse"'));
    expect(correcao.slice(0, 6000)).toContain("impressaoPorMaquina: null,");
  });

  it("[4] a troca com quantidade não conta como peça impressa; no Excel a Quantidade da troca fica vazia", async () => {
    expect(ler("server/routes/maquinas.ts")).toContain('const pecasNoDia = new Set(registros.filter((r) => (r.tipo === "parcial" || r.tipo === "conclusao") && r.quantidade > 0).map((r) => r.itemId)).size;');
    expect(ler("server/services/xlsxExport.ts")).toContain('quantidade: r.tipo === "troca" || r.tipo === "inicio" ? "" : r.quantidade,');
    const r = await import("../services/relatorioDeMaquinas");
    expect(r.oQueAconteceuNoRegistro({ tipo: "troca", quantidade: 2, totalDepois: 3, aImprimir: 10, maquina: "2" })).toBe("Trocou para Impressora 2 (2 un. movidas)");
    // O resumo: uma troca de 2 un. não é unidade impressa nem peça concluída.
    const dias = r.agregarRelatorioDeMaquinas([reg("t", "p1", "2", "troca", 2, 3, "2026-09-21", "10:00")]);
    expect(dias[0].maquinas[1]).toMatchObject({ unidades: 0, pecas: 1, concluidas: 0 });
  });
});

describe("modal abre na etapa certa mesmo com servidor antigo (21/09)", () => {
  it("peça da lista 'em impressão' é tratada como inProduction e herda a máquina do cartão", () => {
    const tela = readFileSync(new URL("../../client/src/pages/grafica-maquinas.tsx", import.meta.url), "utf8");
    expect(tela).toContain('status: p.status ?? "inProduction"');
    expect(tela).toContain("p={p.maquina ? p : { ...p, maquina: m.codigo }}");
  });
});
