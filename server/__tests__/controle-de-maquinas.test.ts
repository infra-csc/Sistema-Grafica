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
// Os gestos que gravam no diário, o diário que não derruba o gesto, a divisão
// reescalada e a volta à Revisão RODAM em regras-producao-itens.test.ts.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi } from "vitest";
import { fonteDasRotasDeItens } from "./fonte-das-rotas-de-itens";
import { readFileSync, existsSync } from "fs";
import path from "path";

const RAIZ = path.resolve(__dirname, "../..");
const ler = (rel: string) => readFileSync(path.resolve(RAIZ, rel), "utf8");
const SCHEMA = ler("shared/schema.ts");
const ITEMS = fonteDasRotasDeItens();
const ROTAS = ler("server/routes.ts");
const APP = ler("client/src/App.tsx");
const GRAFICA = ler("client/src/pages/grafica.tsx");
// Desde a revisão adversarial de 22/09 a conta do start-printing e do
// start-production mora em funções PURAS (a rota trava a linha e as chama).
const DIVIDIDA = ler("shared/impressao-dividida.ts");
const RESERVA_SRC = ler("shared/reserva-de-impressora.ts");

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

  it("usa a máquina da parte; na peça não dividida, a da peça (a enviada só vale para a peça sem impressora)", () => {
    expect(ITEMS).toContain("maquina: plano.maquinaDoRegistro,");
    expect(DIVIDIDA).toContain("maquinaDoRegistro: partesDepois ? maquina : maquinaNaoDividida,");
    expect(DIVIDIDA).toContain("const maquinaNaoDividida = maquinaAtual ?? (printMachine && MAQUINAS_DE_IMPRESSAO.includes(printMachine) ? printMachine : null);");
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
    // Por INTERVALO de created_at (meia-noite de SP → UTC): usa o índice.
    expect(ROTA).toContain("where ${entreOsDias(dia, dia)}");
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
    expect(GRAFICA).toContain('"/grafica/maquinas"');
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
    // 1 min só com o tempo real caído; com ele de pé, 5 min (rede de segurança).
    expect(PAGINA).toContain("refetchInterval: intervaloDePolling(60_000),");
    expect(PAGINA).toContain("refetchOnWindowFocus: true,");
    expect(PAGINA).toContain('data-testid="atualizado-ha"');
    // O WebSocket derruba a chave nos gestos de impressão…
    expect(ler("client/src/hooks/use-websocket.ts")).toContain("for (const alvo of alvosDaMensagem(data)) agendarNoCoalescer(alvo);");
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
    expect(PAGINA).toContain('botaoTestId="button-mostrar-mais"');
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
    expect(PAGINA).toContain('motivoBloqueio(seloImpressas, "informar impressas", p)');
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
    expect(PAGINA).toContain("<BarraDeImpressao feitas={feitas} teto={teto}");
    expect(ler("client/src/components/grafica/modal-impressao.tsx")).toContain('role="progressbar"');
    expect(PAGINA).toContain("aria-pressed={ativo}");
    expect(PAGINA).toContain('aria-label="Escolher o dia"');
    expect(PAGINA).toContain("const LinhaDoDiario = memo(function LinhaDoDiario(");
    expect(PAGINA).toContain('import { T, TOM, FS, FW, FONT, R } from "@/lib/theme";');
    // Migração ao design system: só o vinho da trava (sem token) sobra como hex de cor.
    expect((PAGINA.replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, "").match(/"#[0-9a-fA-F]{3,6}"/g) ?? [])).toEqual(['"#7f1d1d"']);
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
    expect(ROTA).toContain("where ${entreOsDias(de, ate)}");
    expect(ROTA).toContain("periodoValido(req.query.de, req.query.ate, hoje)");
    // As únicas escritas do arquivo: as duas da reserva e as duas de tirar/trocar a peça da impressora.
    expect((ROTA.match(/app\.(post|patch|put|delete)\(/g) ?? []).length).toBe(4);
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
    // Importar xlsxExport puxa o storage inteiro; com a máquina carregada (outras suítes rodando) já passou de 40s.
  }, 120_000);
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

  it("vira realidade só no start-printing, que limpa a reserva", () => {
    const rota = ITEMS.slice(ITEMS.indexOf('app.patch("/api/items/:id/start-printing"'), ITEMS.indexOf('app.patch("/api/items/:id/start-production"'));
    // Iniciar a peça inteira limpa a reserva toda; iniciar uma parte consome só a desta impressora; a troca não mexe nela.
    expect(RESERVA_SRC).toContain("const reserva = movimento ? colunasDaReserva(reservaDaPeca(p), p.reservaPorMaquina) : colunasDaReserva(parte ? parte.reserva : null, p.reservaPorMaquina);");
    expect(RESERVA_SRC).toContain('return { ok: true, set: { status: "inProduction", printMachine: principal, impressaoPorMaquina, ...reserva }, movimento, parte, origem };');
    expect(rota).toContain("const plano = planejarInicioDaImpressao(current as any, pedido);");
    expect(rota).toContain("...plano.set,");
  });

  it("o retrato traz a fila: reservadas por impressora e a fila geral, na ordem do caminhão", () => {
    expect(ROTA).toContain("i.status in ('ready_for_production', 'pronto_para_producao', 'approved', 'liberado')");
    expect(ROTA).toContain("or (i.status in ('inProduction', 'em_producao') and i.impressao_por_maquina is not null)");
    expect(ROTA).toContain("order by e.truck_departure_date asc nulls last, i.display_id asc");
    expect(ROTA).toContain("naFila: fila.filter((p) => (p.reserva[m.codigo] ?? 0) > 0)");
    expect(ROTA).toContain(".map((p) => ({ ...p, maquinaPrevista: m.codigo, reservadas: p.reserva[m.codigo], pausadaEm: p.pausas[m.codigo] ?? null }))");
    expect(ROTA).toContain("const filaGeral = fila.filter((p) => p.semImpressora > 0);");
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
    expect(rota).toContain("const { printMachine, quantidade, deMaquina, iniciarParte: pedeParte, daReserva } = req.body ?? {};");
    expect(RESERVA_SRC).toContain("const r = moverParte(partesAtuais, origem!, printMachine, pedido.quantidade ?? null);");
    expect(rota).toContain("if (!plano.ok) throw falha(409, { error: plano.erro });");
    expect(RESERVA_SRC).toContain("const principal = partesDepoisDoGesto ? maquinaPrincipal(partesDepoisDoGesto, printMachine) ?? printMachine : printMachine;");
    expect(RESERVA_SRC).toContain("const impressaoPorMaquina = partesDepoisDoGesto ? normalizarPartes(partesDepoisDoGesto, aImprimirDaPeca(p)) : null;");
    expect(rota).toContain("quantidade: movimento?.movidas ?? 0,");
    expect(rota).toContain("`Movidas ${movimento.movidas} un. para a ${rotuloDaMaquina(printMachine)} (${movimento.ficam} ficam na ${rotuloDaMaquina(origem)})`");
  });

  it("start-production: por impressora quando dividida, nunca mais que o atribuído; o total é a soma; concluir limpa o jsonb", () => {
    const rota = ITEMS.slice(ITEMS.indexOf("export async function lancarImpressas("), ITEMS.indexOf("export async function cadastrarAtivosDaPecaProduzida("));
    // A regra saiu da rota para services/impressas-da-peca.ts; a rota só a chama.
    expect(ITEMS).toContain("const { item, plano } = await lancarImpressas(req.params.id, req.body ?? {}, motivoFechado, req);");
    expect(rota).toContain("const plano = planejarLancamentoDeImpressas(before as any, corpo, new Date());");
    expect(DIVIDIDA).toContain("const porPartes = !!lerPartes(peca.impressaoPorMaquina);");
    expect(DIVIDIDA).toContain("if (n > parte.atrib) return erro(400, `Máximo ${parte.atrib} un. na ${rotuloDaMaquina(maquina)} — é o que foi atribuído a ela`);");
    expect(DIVIDIDA).toContain("quantityProduced = totalImpressas(partesDepois);");
    expect(DIVIDIDA).toContain("? { impressaoPorMaquina: partesDepois, printMachine: maquinaPrincipal(partesDepois, maquina) ?? maquinaAtual }");
  });

  it("a Gráfica: só admin/grafica/solicitacao leem Máquinas; o selo 'Fila: Impressora N' e a divisão na linha", () => {
    const ROTA = ler("server/routes/maquinas.ts");
    expect((ROTA.match(/requireAuth, requireRole\(\.\.\.PAPEIS_QUE_VEEM\)/g) ?? []).length).toBe(3);
    expect(ler("client/src/App.tsx")).toContain("<RoleProtectedRoute component={GraficaMaquinas} allowedRoles={ROLES_GRAFICA} />");
    expect(ler("client/src/components/app-sidebar.tsx")).toMatch(/url: "\/grafica\/maquinas",\s+icon: \w+,\s+roles: \["grafica", "solicitacao", "admin"\]/);
    expect(GRAFICA).toContain("function SeloFilaDaImpressora(");
    // Em impressão com parte reservada, o selo mostra a reserva também (22/09).
    expect(GRAFICA).toContain("{(isInProd(item) || item.maquinaPrevista) && <SeloFilaDaImpressora item={item} fonte={12} />}");
    expect(GRAFICA).toContain("{(isInProd(item) ? !!fraseDaFila(item, { emImpressao: true }) : !!item.maquinaPrevista) && <div style={{ marginTop: 4 }}><SeloFilaDaImpressora item={item} fonte={10.5} /></div>}");
    expect(GRAFICA).toContain("const maquina = n.onde;");
    // O retrato entrega a parte de cada impressora e a peça aparece nos dois cartões.
    expect(ROTA).toContain("imprimeNaMaquina({ status: l.status, printMachine: l.print_machine, impressaoPorMaquina: l.impressao_por_maquina }, codigo)");
    expect(ROTA).toContain("return { ...p, maquina: codigo, parte, desde: desdeDaParte.get(`${p.id}:${codigo}`) ?? p.desde };");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9 · Revisão adversarial da peça dividida (21/09): total nunca descola da
// soma; parte esgotada não é "imprimindo"; teto que muda reescala o jsonb;
// a troca não conta como peça impressa.
// ─────────────────────────────────────────────────────────────────────────────
describe("9 · peça dividida — os cantos que a revisão achou", async () => {
  const d = await import("@shared/impressao-dividida");
  const PRODUCAO = ITEMS.slice(ITEMS.indexOf("export async function lancarImpressas("), ITEMS.indexOf("export async function cadastrarAtivosDaPecaProduzida("));

  it("reescalarPartes: encolhe a principal até a soma bater; NÃO estica quando o teto cresce; some quando sobra uma chave", () => {
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
    // 10 → 12: nenhuma parte estica — a diferença vai para a fila geral (reserva com quantidade).
    expect(d.reescalarPartes(partes, 12)).toEqual(partes);
    expect(d.reescalarPartes(null, 10)).toBeNull();
    expect(d.partesAtivas({ "1": { atrib: 3, impressas: 3 }, "2": { atrib: 2, impressas: 0 } })).toEqual({ "2": { atrib: 2, impressas: 0 } });
  });

  it("[1] dividida sem `maquina` → 409; qualquer caminho que feche a peça zera o jsonb", () => {
    expect(PRODUCAO).toContain("planejarLancamentoDeImpressas(");
    expect(DIVIDIDA).toContain("if (maquina == null || pedido.impressasNaMaquina == null) {");
    expect(DIVIDIDA).toContain('return erro(409, "Peça dividida entre impressoras: informe a impressora e quantas saíram dela");');
    expect(DIVIDIDA).toContain("...(produzida ? { impressaoPorMaquina: null, reservaPorMaquina: null, maquinaPrevista: null } : {}),");
  });

  it("[2] parte esgotada não é 'imprimindo'; lançamento com delta 0 que não conclui → 409", () => {
    expect(ler("server/routes/maquinas.ts")).toContain("imprimeNaMaquina({ status: l.status, printMachine: l.print_machine, impressaoPorMaquina: l.impressao_por_maquina }, codigo)");
    expect(DIVIDIDA).toContain("if (quantityProduced === jaProduzido && !fecha) return erro(409, `Nada mudou: já constam ${jaProduzido} un. impressas.`);");
    expect(ler("client/src/pages/grafica-maquinas.tsx")).toContain("{podeAgir && !parteEsgotada && (");
  });

  it("[4] a troca com quantidade não conta como peça impressa; no Excel a Quantidade da troca fica vazia", async () => {
    expect(ler("server/routes/maquinas.ts")).toContain('const pecasNoDia = new Set(registros.filter((r) => (r.tipo === "parcial" || r.tipo === "conclusao") && r.quantidade > 0).map((r) => r.itemId)).size;');
    expect(ler("server/services/xlsxExport.ts")).toContain('quantidade: r.tipo === "troca" || r.tipo === "inicio" || r.tipo === "pausa" ? "" : r.quantidade,');
    const r = await import("../services/relatorioDeMaquinas");
    expect(r.oQueAconteceuNoRegistro({ tipo: "troca", quantidade: 2, totalDepois: 3, aImprimir: 10, maquina: "2" })).toBe("Trocou para Impressora 2 (2 un. movidas)");
    // O resumo: uma troca de 2 un. não é unidade impressa nem peça concluída.
    const dias = r.agregarRelatorioDeMaquinas([reg("t", "p1", "2", "troca", 2, 3, "2026-09-21", "10:00")]);
    expect(dias[0].maquinas[1]).toMatchObject({ unidades: 0, pecas: 1, concluidas: 0 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10 · RESERVA COM QUANTIDADE (dono, 21/09: "além de reservar, posso
// direcionar a quantidade e para qual impressora vai"). A conta que tudo
// protege: em impressão + reservado ≤ a imprimir; o resto é "sem impressora".
// ─────────────────────────────────────────────────────────────────────────────
describe("10 · reserva com quantidade — as contas", async () => {
  const r = await import("@shared/reserva-de-impressora");
  const d = await import("@shared/impressao-dividida");
  const liberada = (extra: Record<string, unknown> = {}) => ({ status: "approved", quantity: 34, reuseQty: 0, quantityProduced: 0, printMachine: null, impressaoPorMaquina: null, maquinaPrevista: null, reservaPorMaquina: null, ...extra });
  /** A invariante, para qualquer peça: nunca passa do que há para imprimir. */
  const confere = (p: any) => {
    const soma = r.comprometidoDaPeca(p) + Object.values(r.reservaDaPeca(p)).reduce((s: number, n: any) => s + n, 0) + r.semImpressora(p);
    expect(soma).toBe(d.aImprimirDaPeca(p));
  };

  it("reservar tudo, reservar parte, e o resto fica na fila geral", () => {
    const p = liberada();
    expect(r.semImpressora(p)).toBe(34);
    const parte = r.reservar(p, "1", 20);
    expect(parte).toEqual({ ok: true, reserva: { "1": 20 }, quantidade: 20, semImpressora: 14 });
    const p2 = liberada({ reservaPorMaquina: { "1": 20 } });
    expect(r.semImpressora(p2)).toBe(14);
    expect(r.reservar(p2, "2", null)).toEqual({ ok: true, reserva: { "1": 20, "2": 14 }, quantidade: 14, semImpressora: 0 });
    expect(r.reservar(p2, "1", 4)).toMatchObject({ ok: true, reserva: { "1": 24 }, semImpressora: 10 });
    expect(r.reservar(p2, "2", 15)).toMatchObject({ ok: false, erro: "Só 14 un. estão sem impressora — não dá para reservar 15" });
    expect(r.reservar(p2, "9", 1)).toMatchObject({ ok: false });
    expect(r.reservar(p, "2", null)).toMatchObject({ ok: true, reserva: { "2": 34 }, semImpressora: 0 });
    confere(p); confere(p2); confere(liberada({ reservaPorMaquina: { "1": 20, "2": 14 } }));
  });

  it("o gesto antigo (tudo para a Impressora X, sem quantidade) segue valendo — inclusive para mover tudo", () => {
    const cheia = liberada({ reservaPorMaquina: { "2": 34 }, maquinaPrevista: "2" });
    expect(r.reservar(cheia, "3", null)).toMatchObject({ ok: true, reserva: { "3": 34 } });
    // Linha antiga, só com o atalho maquina_prevista: vale como "tudo naquela impressora".
    const antiga = liberada({ maquinaPrevista: "2" });
    expect(r.reservaDaPeca(antiga)).toEqual({ "2": 34 });
    expect(r.semImpressora(antiga)).toBe(0);
    confere(antiga);
  });

  it("mover parte entre impressoras e devolver parte à fila geral", () => {
    const p = liberada({ reservaPorMaquina: { "1": 20, "2": 14 } });
    expect(r.moverReserva(p, "1", "2", 5)).toMatchObject({ ok: true, reserva: { "1": 15, "2": 19 }, quantidade: 5 });
    expect(r.moverReserva(p, "1", "3", null)).toMatchObject({ ok: true, reserva: { "2": 14, "3": 20 } });
    expect(r.moverReserva(p, "1", "2", 21)).toMatchObject({ ok: false });
    expect(r.moverReserva(p, "4", "2", 1)).toMatchObject({ ok: false });
    expect(r.devolverReserva(p, "2", 4)).toMatchObject({ ok: true, reserva: { "1": 20, "2": 10 }, semImpressora: 4 });
    expect(r.devolverReserva(p, "2", null)).toMatchObject({ ok: true, reserva: { "1": 20 }, semImpressora: 14 });
    expect(r.devolverReserva(p, null, null)).toMatchObject({ ok: true, reserva: null, quantidade: 34, semImpressora: 34 });
  });

  it("as duas colunas saem juntas: o atalho é a impressora com mais unidades (empate = menor código)", () => {
    expect(r.colunasDaReserva({ "1": 20, "2": 14 })).toEqual({ reservaPorMaquina: { "1": 20, "2": 14 }, maquinaPrevista: "1" });
    expect(r.colunasDaReserva({ "3": 5, "2": 5 })).toEqual({ reservaPorMaquina: { "2": 5, "3": 5 }, maquinaPrevista: "2" });
    expect(r.colunasDaReserva({ "1": 0 })).toEqual({ reservaPorMaquina: null, maquinaPrevista: null });
    expect(r.colunasDaReserva(null)).toEqual({ reservaPorMaquina: null, maquinaPrevista: null });
    expect(r.resumoDaReserva({ "1": 20, "2": 14 })).toBe("Impressora 1 (New XT) (20) · Impressora 2 (14)");
  });

  it("INICIAR só a parte reservada: consome a reserva dela, as outras continuam; a peça só fecha com tudo impresso", () => {
    const p = liberada({ reservaPorMaquina: { "1": 20, "2": 14 }, maquinaPrevista: "1" });
    const a = r.iniciarParte(p, "1", { daReserva: true });
    expect(a).toEqual({ ok: true, partes: { "1": { atrib: 20, impressas: 0 } }, reserva: { "2": 14 }, quantidade: 20 });
    // A parte única com atrib < a imprimir NÃO vira null: é ela que diz que só 20 estão na máquina.
    expect(d.normalizarPartes({ "1": { atrib: 20, impressas: 0 } }, 34)).toEqual({ "1": { atrib: 20, impressas: 0 } });
    const emImpressao = { ...p, status: "inProduction", printMachine: "1", impressaoPorMaquina: { "1": { atrib: 20, impressas: 20 } }, quantityProduced: 20, reservaPorMaquina: { "2": 14 } };
    confere(emImpressao);
    expect(r.comprometidoDaPeca(emImpressao)).toBe(20);
    expect(d.totalImpressas(d.partesDaPeca(emImpressao))).toBe(20); // 20 de 34: a peça NÃO está produzida
    expect(d.partesAtivas(d.partesDaPeca(emImpressao))).toEqual({}); // a Impressora 1 já não tem nada dela
    // Iniciar a parte da Impressora 2 soma às partes; a reserva acaba.
    const b = r.iniciarParte(emImpressao, "2", { daReserva: true });
    expect(b).toEqual({ ok: true, partes: { "1": { atrib: 20, impressas: 20 }, "2": { atrib: 14, impressas: 0 } }, reserva: null, quantidade: 14 });
    expect(r.iniciarParte(emImpressao, "3", { daReserva: true })).toMatchObject({ ok: false });
    // Da fila geral: só o que está sem impressora.
    const p3 = liberada({ reservaPorMaquina: { "1": 20 } });
    expect(r.iniciarParte(p3, "4", { quantidade: null })).toMatchObject({ ok: true, partes: { "4": { atrib: 14, impressas: 0 } }, reserva: { "1": 20 }, quantidade: 14 });
    expect(r.iniciarParte(p3, "4", { quantidade: 15 })).toMatchObject({ ok: false });
    // Peça em impressão do jeito antigo (jsonb nulo): tudo já está na máquina — nada livre.
    const legado = liberada({ status: "inProduction", printMachine: "1", quantityProduced: 3 });
    expect(r.semImpressora(legado)).toBe(0);
    expect(r.iniciarParte(legado, "2", { quantidade: 1 })).toMatchObject({ ok: false });
    confere(legado);
  });

  it("REESCALAR quando o que há para imprimir muda: sai do sem-impressora, depois da reserva, depois das partes", () => {
    const p = liberada({ reservaPorMaquina: { "1": 20, "2": 10 } }); // 4 sem impressora
    expect(r.reescalarReservaEPartes(p, 32)).toEqual({ partes: null, reserva: { "1": 20, "2": 10 } });
    // 34 → 25: tira 5 da MENOR reserva.
    expect(r.reescalarReservaEPartes(p, 25)).toEqual({ partes: null, reserva: { "1": 20, "2": 5 } });
    expect(r.reescalarReservaEPartes(p, 12)).toEqual({ partes: null, reserva: { "1": 12 } });
    expect(r.reescalarReservaEPartes(p, 0)).toEqual({ partes: null, reserva: null });
    // Em impressão por partes: 20 na Impressora 1 (8 impressas) + 14 reservadas na 2.
    const em = liberada({ status: "inProduction", printMachine: "1", quantityProduced: 8, impressaoPorMaquina: { "1": { atrib: 20, impressas: 8 } }, reservaPorMaquina: { "2": 14 } });
    expect(r.reescalarReservaEPartes(em, 30)).toEqual({ partes: { "1": { atrib: 20, impressas: 8 } }, reserva: { "2": 10 } });
    expect(r.reescalarReservaEPartes(em, 20)).toEqual({ partes: { "1": { atrib: 20, impressas: 8 } }, reserva: null });
    // Abaixo do que já está na máquina: a reserva zera e a parte encolhe (vira "tudo" → null).
    expect(r.reescalarReservaEPartes(em, 15)).toEqual({ partes: null, reserva: null });
    for (const teto of [34, 30, 25, 20, 15, 8]) {
      const x = r.reescalarReservaEPartes(em, teto);
      const emImp = x.partes ? Object.values(x.partes).reduce((s: number, y: any) => s + y.atrib, 0) : Math.min(teto, 20);
      const res = Object.values(x.reserva ?? {}).reduce((s: number, n: any) => s + n, 0);
      expect(emImp + res, `teto ${teto}`).toBeLessThanOrEqual(teto);
    }
  });

  it("o dado e as rotas: coluna aditiva, fora da API pública, compacto de ida e volta; quantidade/deMaquina no PATCH; lote = tudo", async () => {
    expect(SCHEMA).toContain('reservaPorMaquina: jsonb("reserva_por_maquina")');
    expect(SCHEMA.slice(SCHEMA.indexOf("export const publicInsertItemSchema"))).toContain("reservaPorMaquina: true,");
    expect(ler("scripts/migracao-aditiva-producao.sql")).toContain("ALTER TABLE items ADD COLUMN IF NOT EXISTS reserva_por_maquina jsonb;");
    expect(ler("scripts/migracao-aditiva-producao.mjs")).toContain("'reserva_por_maquina'");
    const { compactarPecas, expandirPecas } = await import("@shared/itens-compactos");
    const peca = { id: "p1", displayId: "#0396", status: "approved", quantity: 34, maquinaPrevista: "1", reservaPorMaquina: { "1": 20, "2": 14 }, eventId: "e1", event: { id: "e1", name: "Maratona" } };
    expect(JSON.stringify(expandirPecas(compactarPecas([peca]))[0])).toBe(JSON.stringify(peca));
    const ROTA = ler("server/routes/maquinas.ts");
    expect(ROTA).toContain("const r = aplicarPedidoDeReserva(atual, req.body, pedido.maquina);");
    expect(ROTA).toContain("const r = moverReserva(item, de, maquina, quantidade);");
    expect(ROTA).toContain("const r = devolverReserva(item, de, quantidade);");
    expect(ROTA).toContain("const reserva = pedido.maquina && livre > 0 ? { [pedido.maquina]: livre } : null;");
    // Em impressão POR PARTES a peça continua reservável (o resto dela).
    expect(ROTA).toContain("&& !!lerPartes(item.impressaoPorMaquina) && livreParaReservar(item) > 0;");
    const rota = ITEMS.slice(ITEMS.indexOf('app.patch("/api/items/:id/start-printing"'), ITEMS.indexOf('app.patch("/api/items/:id/start-production"'));
    expect(rota).toContain("iniciarParte: pedeParte === true, daReserva: daReserva === true };");
    expect(RESERVA_SRC).toContain("const r = iniciarParte(p, printMachine, { daReserva: pedido.daReserva === true, quantidade: pedido.quantidade ?? null, reservaDe:");
    expect(RESERVA_SRC).toContain('const trocouDeMaquina = pedido.iniciarParte !== true && EM_IMPRESSAO.includes(p.status ?? "") && !!p.printMachine;');
    expect(GRAFICA).toContain("const frase = fraseDaFila(item, { emImpressao: isInProd(item) });");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 11 · QUANTIDADE NA ETAPA 1 (dono, 21/09: "ainda não consigo colocar a
// quantidade") e "Iniciar o resto" na Gráfica.
// ─────────────────────────────────────────────────────────────────────────────
describe("11 · iniciar PARTE de uma peça sem reserva — servidor, contas e Gráfica", async () => {
  const r = await import("@shared/reserva-de-impressora");
  const d = await import("@shared/impressao-dividida");
  const p28 = (extra: Record<string, unknown> = {}) => ({ status: "ready_for_production", quantity: 28, reuseQty: 0, quantityProduced: 0, printMachine: null, impressaoPorMaquina: null, maquinaPrevista: null, reservaPorMaquina: null, ...extra });

  it("10 de 28 sem reserva → a peça fica com {2:{atrib:10,impressas:0}} e 18 sem impressora; o resto inicia depois", () => {
    const a = r.iniciarParte(p28(), "2", { quantidade: 10 });
    expect(a).toEqual({ ok: true, partes: { "2": { atrib: 10, impressas: 0 } }, reserva: null, quantidade: 10 });
    // Parte única com teto menor que a peça fica no jsonb (é ela que diz que só 10 estão na máquina).
    expect(d.normalizarPartes({ "2": { atrib: 10, impressas: 0 } }, 28)).toEqual({ "2": { atrib: 10, impressas: 0 } });
    const em = p28({ status: "inProduction", printMachine: "2", impressaoPorMaquina: { "2": { atrib: 10, impressas: 0 } } });
    expect(r.semImpressora(em)).toBe(18);
    expect(r.comprometidoDaPeca(em) + r.semImpressora(em)).toBe(28);
    expect(r.iniciarParte(em, "3", { quantidade: 18 })).toMatchObject({ ok: true, partes: { "2": { atrib: 10, impressas: 0 }, "3": { atrib: 18, impressas: 0 } } });
    expect(r.iniciarParte(em, "3", { quantidade: 19 })).toMatchObject({ ok: false });
    // Tudo de uma vez numa peça fora de impressão = sem divisão (jsonb nulo).
    const tudo = r.iniciarParte(p28(), "2", { quantidade: 28 });
    expect(tudo.ok && d.normalizarPartes(tudo.partes, 28)).toBeNull();
  });

  it("quantidade + reserva: sai primeiro do reservado à impressora, depois do sem impressora; menos que o reservado deixa o resto reservado; a reserva pode ir para OUTRA máquina", () => {
    const p = p28({ reservaPorMaquina: { "1": 20 } });
    expect(r.disponivelParaAMaquina(p, "1")).toBe(28);
    expect(r.disponivelParaAMaquina(p, "2")).toBe(8);
    expect(r.iniciarParte(p, "1", { daReserva: true, quantidade: 25 })).toMatchObject({ ok: true, partes: { "1": { atrib: 25, impressas: 0 } }, reserva: null, quantidade: 25 });
    expect(r.iniciarParte(p, "1", { daReserva: true, quantidade: 12 })).toMatchObject({ ok: true, partes: { "1": { atrib: 12, impressas: 0 } }, reserva: { "1": 8 } });
    expect(r.iniciarParte(p, "1", { daReserva: true, quantidade: 29 })).toMatchObject({ ok: false });
    expect(r.iniciarParte(p, "2", { quantidade: 9 })).toMatchObject({ ok: false }); // as 20 da Impressora 1 não são dela
    // O operador abriu a parte da Impressora 1 e trocou para a 4 na hora.
    expect(r.iniciarParte(p, "4", { daReserva: true, quantidade: 20, reservaDe: "1" })).toMatchObject({ ok: true, partes: { "4": { atrib: 20, impressas: 0 } }, reserva: null });
    const rota = ITEMS.slice(ITEMS.indexOf('app.patch("/api/items/:id/start-printing"'), ITEMS.indexOf('app.patch("/api/items/:id/start-production"'));
    expect(rota).toContain("deMaquina: ehMaquinaValida(deMaquina) ? deMaquina : null,");
    expect(RESERVA_SRC).toContain("reservaDe: valida(pedido.deMaquina) ? pedido.deMaquina : null });");
  });

  it("Gráfica: o progresso diz 'N sem impressora' e oferece 'Iniciar o resto' (modal na etapa 1); a ficha diz 'A imprimir' antes de iniciar", () => {
    expect(GRAFICA).toContain("const resto = n.semImpressora;");
    expect(GRAFICA).toContain("data-testid={`button-iniciar-resto-${item.id}`}");
    expect(GRAFICA).toContain("const openProductionModal = (item: any, resto = false) => {");
    expect(GRAFICA).toContain("parteAIniciar={iniciandoResto ? { quantidade: semImpressora(selectedItem), daReserva: false } : null}");
    expect(GRAFICA).toContain('(isInProd(selectedItem) && !iniciandoResto ? "Na impressora" : "A imprimir")');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 12 · UMA PEÇA POR VEZ POR IMPRESSORA e a TROCA POR PRIORIDADE (dono, 21/09:
// "caso a impressora esteja imprimindo algo, não dá para colocar outra; o que
// podemos implementar é TIRAR um item e COLOCAR o outro").
// ─────────────────────────────────────────────────────────────────────────────
describe("12 · uma peça por impressora, pausar e trocar por prioridade", async () => {
  const r = await import("@shared/reserva-de-impressora");
  const d = await import("@shared/impressao-dividida");
  const AGORA = "2026-09-21T14:03:00.000Z";
  const pecaEm = (extra: Record<string, unknown> = {}) => ({ id: "a", status: "inProduction", quantity: 10, reuseQty: 0, quantityProduced: 3, printMachine: "1", impressaoPorMaquina: null, maquinaPrevista: null, reservaPorMaquina: null, ...extra });
  const conta = (p: any) => r.comprometidoDaPeca(p) + Object.values(r.reservaDaPeca(p)).reduce((s: number, n: any) => s + n, 0) + r.semImpressora(p);

  it("PAUSAR: as impressas ficam; o que faltava vira reserva da MESMA impressora, marcada; sem outra parte ativa a peça volta a liberada", () => {
    const p = pecaEm(); // 3 de 10 na Impressora 1, do jeito antigo (jsonb nulo)
    const pausa = r.pausarParte(p, "1", AGORA);
    expect(pausa).toEqual({ ok: true, partes: null, reserva: { "1": 7 }, pausas: { "1": AGORA }, voltaParaAFila: true, impressasNaMaquina: 3, restante: 7, principal: null });
    const colunas = r.colunasDaReserva({ "1": 7 }, null, { "1": AGORA });
    expect(colunas).toEqual({ reservaPorMaquina: { "1": { qtd: 7, pausadaEm: AGORA } }, maquinaPrevista: "1" });
    // Depois da pausa: liberada, 3 impressas preservadas, 7 reservadas, nada sem impressora — a conta fecha em 10.
    const depois = { ...p, status: "ready_for_production", impressaoPorMaquina: null, ...colunas };
    expect(r.lerReserva(depois.reservaPorMaquina)).toEqual({ "1": 7 });
    expect(r.lerPausas(depois.reservaPorMaquina)).toEqual({ "1": AGORA });
    expect(conta(depois)).toBe(10);
    expect(r.semImpressora(depois)).toBe(0);
    // RETOMAR: inicia a parte reservada; as 3 já impressas ficam anotadas na máquina; a marca some com a reserva.
    const volta = r.iniciarParte(depois, "1", { daReserva: true });
    expect(volta).toEqual({ ok: true, partes: { "1": { atrib: 10, impressas: 3 } }, reserva: null, quantidade: 7 });
    expect(volta.ok && d.normalizarPartes(volta.partes, 10)).toBeNull(); // tudo numa impressora = sem divisão
    expect(r.colunasDaReserva(null, depois.reservaPorMaquina)).toEqual({ reservaPorMaquina: null, maquinaPrevista: null });
    // Erros: nada por imprimir nela; peça fora de impressão.
    expect(r.pausarParte(p, "2", AGORA)).toMatchObject({ ok: false });
    expect(r.pausarParte({ ...p, status: "approved" }, "1", AGORA)).toMatchObject({ ok: false });
  });

  it("PAUSAR uma parte de peça DIVIDIDA: a outra impressora segue imprimindo e a peça continua em impressão", () => {
    const p = pecaEm({ quantityProduced: 5, impressaoPorMaquina: { "1": { atrib: 8, impressas: 5 }, "2": { atrib: 2, impressas: 0 } } });
    const pausa = r.pausarParte(p, "1", AGORA);
    expect(pausa).toMatchObject({ ok: true, partes: { "1": { atrib: 5, impressas: 5 }, "2": { atrib: 2, impressas: 0 } }, reserva: { "1": 3 }, voltaParaAFila: false, principal: "2", restante: 3 });
    const depois = { ...p, impressaoPorMaquina: (pausa as any).partes, printMachine: "2", ...r.colunasDaReserva((pausa as any).reserva, null, (pausa as any).pausas) };
    expect(conta(depois)).toBe(10);
    expect(d.totalImpressas(d.partesDaPeca(depois))).toBe(5); // nenhuma impressa se perdeu
  });

  it("a marca de pausa SOBREVIVE a mexidas na reserva de outra impressora e some quando a dela acaba", () => {
    const anterior = { "1": { qtd: 7, pausadaEm: AGORA }, "2": 4 };
    expect(r.colunasDaReserva({ "1": 7, "2": 9 }, anterior).reservaPorMaquina).toEqual({ "1": { qtd: 7, pausadaEm: AGORA }, "2": 9 });
    expect(r.colunasDaReserva({ "1": 5, "3": 2 }, anterior).reservaPorMaquina).toEqual({ "1": { qtd: 5, pausadaEm: AGORA }, "3": 2 });
    expect(r.colunasDaReserva({ "2": 4 }, anterior).reservaPorMaquina).toEqual({ "2": 4 });
    // O formato antigo (só números) continua valendo.
    expect(r.lerReserva({ "1": 7, "2": { qtd: 3 } })).toEqual({ "1": 7, "2": 3 });
    expect(r.lerPausas({ "1": 7 })).toEqual({});
  });

  it("UMA POR VEZ: quem ocupa a impressora é quem tem parte ATIVA nela; a mesma peça e a parte esgotada não contam", () => {
    const a = pecaEm({ id: "a", displayId: "#0386" });
    const b = pecaEm({ id: "b", displayId: "#0390", printMachine: "2", quantityProduced: 4, impressaoPorMaquina: { "2": { atrib: 4, impressas: 4 }, "3": { atrib: 6, impressas: 0 } } });
    const liberada = pecaEm({ id: "c", status: "approved" });
    expect(r.ocupanteDaImpressora([a, b, liberada], "1")?.id).toBe("a");
    expect(r.ocupanteDaImpressora([a, b, liberada], "1", "a")).toBeNull(); // a mesma peça pode somar parte
    expect(r.ocupanteDaImpressora([a, b, liberada], "2")).toBeNull();      // a parte da 2 já esgotou
    expect(r.ocupanteDaImpressora([a, b, liberada], "3")?.id).toBe("b");
    expect(r.ocupanteDaImpressora([a, b, liberada], "4")).toBeNull();
  });

  it("servidor: start-printing recusa a impressora ocupada (409) — inteira, parte e troca de máquina passam pelo mesmo guarda", () => {
    const rota = ITEMS.slice(ITEMS.indexOf('app.patch("/api/items/:id/start-printing"'), ITEMS.indexOf('app.patch("/api/items/:id/start-production"'));
    expect(rota).toContain("const ocupante = await quemOcupaAImpressora(printMachine, current.id, tx);");
    expect(rota).toContain('throw falha(409, { error: erroImpressoraOcupada(printMachine, ocupante), code: "PRINTER_BUSY"');
    // O guarda vem ANTES de decidir se é troca, parte ou peça inteira.
    expect(rota.indexOf("quemOcupaAImpressora(printMachine, current.id, tx)")).toBeLessThan(rota.indexOf("planejarInicioDaImpressao(current as any, pedido)"));
    const svc = ler("server/services/ocupacaoDasImpressoras.ts");
    expect(svc).toContain("já está imprimindo ${ocupante.displayId ?? \"outra peça\"} — tire ela da impressora ou escolha outra");
    expect(svc).toContain("return ocupanteDaImpressora(emImpressao as any[], maquina, excetoId);");
  });

  it("diário, resumo e Excel: 'Pausou — deu lugar à #0398', sem unidade e sem 'ainda na máquina'", async () => {
    const rel = await import("../services/relatorioDeMaquinas");
    const registros = [
      reg("i1", "p1", "1", "inicio", 0, 0, "2026-09-21", "08:00"),
      reg("x1", "p1", "1", "parcial", 3, 3, "2026-09-21", "09:00"),
      { ...reg("z1", "p1", "1", "pausa", 0, 3, "2026-09-21", "10:00"), displayId: "#0386" },
      { ...reg("i2", "p2", "1", "inicio", 0, 0, "2026-09-21", "10:00"), displayId: "#0398", em: em("2026-09-21", "10:00") + 40 },
    ];
    const lugar = rel.quemEntrouNoLugar(registros as any);
    expect(lugar.get("z1")).toBe("#0398");
    expect(rel.oQueAconteceuNoRegistro({ tipo: "pausa", quantidade: 0, totalDepois: 3, aImprimir: 10, maquina: "1", deuLugarA: "#0398" })).toBe("Pausou — deu lugar à #0398 (3 de 10 impressas)");
    expect(rel.oQueAconteceuNoRegistro({ tipo: "pausa", quantidade: 0, totalDepois: 3, aImprimir: 10, maquina: "1" })).toBe("Pausou — saiu da impressora (3 de 10 impressas)");
    expect(rel.ROTULO_DO_TIPO.pausa).toBe("Pausa");
    const m1 = rel.agregarRelatorioDeMaquinas(registros as any)[0].maquinas[0];
    // 3 unidades (só o parcial); a #0386 foi tirada → só a #0398 segue na máquina.
    expect(m1).toMatchObject({ unidades: 3, pecas: 2, concluidas: 0, aindaNaMaquina: 1 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 14 · A revisão adversarial da rodada "uma peça por impressora" (21/09).
// ─────────────────────────────────────────────────────────────────────────────
describe("14 · revisão adversarial: impressora nunca trava, corrida, limbo e rotas vizinhas", async () => {
  const r = await import("@shared/reserva-de-impressora");
  const ROTA = ler("server/routes/maquinas.ts");
  const semComentario = (s: string) => s.replace(/\/\/.*$/gm, "");
  const PRINTING = ITEMS.slice(ITEMS.indexOf('app.patch("/api/items/:id/start-printing"'), ITEMS.indexOf('app.patch("/api/items/:id/start-production"'));
  // A rota (até a próxima) + a regra que ela chama (services/impressas-da-peca.ts).
  const PRODUCTION = ITEMS.slice(ITEMS.indexOf('app.patch("/api/items/:id/start-production"'), ITEMS.indexOf('app.post("/api/items/:id/mark-reuse"'))
    + ITEMS.slice(ITEMS.indexOf("export async function lancarImpressas("), ITEMS.indexOf("export async function cadastrarAtivosDaPecaProduzida("));

  it("[GRAVE] peça de evento finalizado NÃO trava a impressora: quem SAI não tem guarda de evento; quem ENTRA tem", () => {
    const bloco = semComentario(ROTA.slice(ROTA.indexOf("const tirarEColocar = async"), ROTA.indexOf('app.post("/api/grafica/maquinas/:maquina/trocar"')));
    expect(bloco).not.toContain("motivoEventoDaPeca(sai)");
    expect(bloco).toContain("if (await motivoEventoDaPeca(entra)) throw falha(409,");
    // Na tela, o "Tirar da impressora" não é desabilitado pelo selo de evento finalizado.
    const PAGINA = ler("client/src/pages/grafica-maquinas.tsx");
    const botao = PAGINA.slice(PAGINA.indexOf("{podeAgir && onTirar && !parteEsgotada && ("), PAGINA.indexOf("Tirar da impressora\n"));
    expect(semComentario(botao)).not.toContain("selo");
    expect(botao).toContain("disabled={mexendo}");
  });

  it("[2] a pausa que devolve à fila grava printMachine null; informar impressas exige peça EM impressão (depois do guarda de evento)", () => {
    expect(ROTA).toContain("...(pausa.voltaParaAFila ? { printMachine: null } : pausa.principal ? { printMachine: pausa.principal } : {}),");
    // A guarda de status mora na conta pura, que roda sobre a linha TRAVADA —
    // depois da guarda de evento (fora da transação).
    expect(DIVIDIDA).toContain('if (!EM_IMPRESSAO_LANC.includes(peca.status ?? "")) {');
    expect(DIVIDIDA).toContain("A peça não está em impressão — inicie a impressão antes de informar as impressas");
    expect(PRODUCTION.indexOf("barraEventoFinalizado(antes, res)")).toBeLessThan(PRODUCTION.indexOf("planejarLancamentoDeImpressas("));
  });

  it("[3] CORRIDA: checagem de ocupação + gravação sob lock consultivo por impressora, em ordem fixa; o mesmo lock abre a transação de tirar/trocar", () => {
    expect(PRINTING).toContain("let travas = travasDoInicio(antes, pedido);");
    expect(RESERVA_SRC).toContain(".filter((m): m is string => typeof m === \"string\" && MAQUINAS_DE_IMPRESSAO.includes(m)))).sort();");
    expect(PRINTING).toContain("for (const m of travas) await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${chaveDoLockDaImpressora(m)}))`);");
    // lock → linha travada → checagem → gravação, tudo dentro da MESMA transação.
    const iTx = PRINTING.indexOf("await db.transaction(async (tx) => {");
    const iLock = PRINTING.indexOf("select pg_advisory_xact_lock");
    const iLinha = PRINTING.indexOf('.for("update")');
    const iCheca = PRINTING.indexOf("quemOcupaAImpressora(printMachine, current.id, tx)");
    const iGrava = PRINTING.indexOf("await tx.update(itemsTable).set({");
    const iFim = PRINTING.indexOf("return { item, movimento: plano.movimento, parte: plano.parte, origem: plano.origem, current };");
    expect(iTx).toBeGreaterThan(0);
    expect([iTx < iLock, iLock < iLinha, iLinha < iCheca, iCheca < iGrava, iGrava < iFim]).toEqual([true, true, true, true, true]);
    expect(PRINTING).toContain("não há índice único que a segure");
    const bloco = ROTA.slice(ROTA.indexOf("const resultado = await db.transaction(async (tx) => {"));
    expect(bloco.indexOf("pg_advisory_xact_lock")).toBeLessThan(bloco.indexOf("await tx.select().from(itemsTable)"));
    expect(r.chaveDoLockDaImpressora("2")).toBe("impressora:2");
  });

  it("[5] descancelar peça que estava em impressão: SEMPRE liberada, sem impressora, o que faltava no topo da fila dela, impressas preservadas", () => {
    const rota = ITEMS.slice(ITEMS.indexOf('app.patch("/api/items/:id/uncancel"'));
    expect(rota.slice(0, 6000)).toContain('const estavaImprimindo = alvo === "inProduction" || alvo === "em_producao";');
    expect(rota.slice(0, 6000)).toContain('if (estavaImprimindo) { alvo = "ready_for_production";');
    expect(rota.slice(0, 6000)).toContain("...(devolvida ? { impressaoPorMaquina: null, printMachine: null, ...colunasDaReserva(devolvida.reserva, currentItem.reservaPorMaquina, devolvida.pausas) } : {}),");
    // A conta pura: 3 de 10 na Impressora 1 (cancelada) → 7 reservadas à 1, marcadas; dividida → cada parte na sua.
    const AGORA = "2026-09-21T15:00:00.000Z";
    const cancelada = { status: "canceled", quantity: 10, reuseQty: 0, quantityProduced: 3, printMachine: "1", impressaoPorMaquina: null, maquinaPrevista: null, reservaPorMaquina: null };
    expect(r.devolverTudoAFila(cancelada, AGORA)).toEqual({ reserva: { "1": 7 }, pausas: { "1": AGORA } });
    const dividida = { ...cancelada, quantityProduced: 5, impressaoPorMaquina: { "1": { atrib: 8, impressas: 5 }, "2": { atrib: 2, impressas: 0 } } };
    expect(r.devolverTudoAFila(dividida, AGORA)).toEqual({ reserva: { "1": 3, "2": 2 }, pausas: { "1": AGORA, "2": AGORA } });
    // Depois: liberada, 5 impressas + 5 reservadas = 10 — a conta fecha.
    const depois = { ...dividida, status: "ready_for_production", impressaoPorMaquina: null, printMachine: null, reservaPorMaquina: { "1": 3, "2": 2 } };
    expect(r.comprometidoDaPeca(depois) + 5 + r.semImpressora(depois)).toBe(10);
    // Com parte ainda reservada a outra impressora, a reserva antiga continua.
    const comReserva = { ...cancelada, quantity: 34, quantityProduced: 5, impressaoPorMaquina: { "1": { atrib: 20, impressas: 5 } }, reservaPorMaquina: { "2": 14 } };
    expect(r.devolverTudoAFila(comReserva, AGORA).reserva).toEqual({ "1": 15, "2": 14 });
  });

  it("[6] LIMBO: a última parte ativa esgotou sem fechar a peça → volta a liberada, sem impressora (a saída da pausa)", () => {
    expect(DIVIDIDA).toContain("const voltouParaAFila = !produzida && !!partesDepois && Object.keys(partesAtivas(partesDepois)).length === 0;");
    expect(DIVIDIDA).toContain('const novoStatus = produzida ? "produced" : voltouParaAFila ? "ready_for_production" : "inProduction";');
    expect(DIVIDIDA).toContain("...(voltouParaAFila ? { impressaoPorMaquina: null, printMachine: null } : {}),");
    expect(DIVIDIDA).toContain("...(novoStatus !== peca.status ? { statusChangedAt: agora } : {}),");
    // E o diário ganha a "pausa": a peça saiu da impressora.
    expect(PRODUCTION).toContain('if (plano.voltouParaAFila) {');
  });

  it("a Gráfica usa a mesma barra: nenhuma com 0 impressas; na peça dividida, uma por impressora", () => {
    expect(GRAFICA).toContain("<BarraDeImpressao key={m} feitas={x.impressas} teto={x.atrib}");
    expect(GRAFICA).toContain(": <BarraDeImpressao feitas={feitas} teto={teto}");
    expect(GRAFICA).not.toContain('background: "#fed7aa", marginTop: 4, overflow: "hidden"'); // o trilho fino antigo
    const MODAL = ler("client/src/components/grafica/modal-impressao.tsx");
    expect(MODAL).toContain("if (!(feitas > 0) || !(teto > 0)) return null;");
  });

  it("[7][8][9] duplo disparo travado por ref + isPending; statusChangedAt da pausa é de propósito; o modal recebe as ocupadas", () => {
    const PAGINA = ler("client/src/pages/grafica-maquinas.tsx");
    expect(PAGINA).toContain("if (travaDaImpressoraRef.current || mexerNaImpressora.isPending) return;");
    expect(PAGINA).toContain("mexendo={mexerNaImpressora.isPending} onTirar={(peca) => mexer({");
    expect(PAGINA).toContain("ocupado={reserva.isPending || mexerNaImpressora.isPending}");
    expect(PAGINA).toContain("ocupadas={ocupadasParaOModal}");
    expect(ROTA).toContain("De propósito: voltar a \"liberada\" é mudança REAL de etapa");
    expect(GRAFICA).toContain("ocupadas={ocupacaoDasImpressoras((pecasDoServidor as any[]).filter(estaEmImpressao), selectedItem.id)}");
  });
});

describe("13 · a descrição da peça no retrato, no diário e no Excel (dono, 21/09)", () => {
  const ROTA = ler("server/routes/maquinas.ts");
  it("o retrato devolve descrição, material, medida e patrocinadores — estes numa consulta só", () => {
    expect((ROTA.match(/select i\.id, i\.display_id, i\.type, i\.description, i\.material, i\.measurement,/g) ?? []).length).toBe(2); // imprimindo + fila
    expect(ROTA).toContain("patrocinadores: patrocinadoresPorItem.get(l.id) ?? [],");
    expect((ROTA.match(/from item_sponsors isp/g) ?? []).length).toBe(1); // sem N+1
    expect((ROTA.match(/descricaoPeca: l\.description \?\? null,/g) ?? []).length).toBe(2); // diário do retrato + relatório
  });
  it("Excel 'Registros': a coluna Peça é tipo + descrição", () => {
    expect(ler("server/services/xlsxExport.ts")).toContain("peca: nomeDaPeca(r.tipoPeca, r.descricaoPeca),");
  });
});

describe("modal abre na etapa certa mesmo com servidor antigo (21/09)", () => {
  it("peça da lista 'em impressão' é tratada como inProduction e herda a máquina do cartão", () => {
    const tela = readFileSync(new URL("../../client/src/pages/grafica-maquinas.tsx", import.meta.url), "utf8");
    expect(tela).toContain('status: p.status ?? "inProduction"');
    expect(tela).toContain("p={p.maquina ? p : { ...p, maquina: m.codigo }}");
  });
});
