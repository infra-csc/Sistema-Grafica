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
import { describe, it, expect } from "vitest";
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
    expect(rota).toContain('tipo: trocouDeMaquina ? "troca" : "inicio",');
  });

  it("lançar parcial e concluir — com o que saiu NESTE lançamento, não o total", () => {
    expect(ITEMS).toContain('tipo: item.status === "produced" ? "conclusao" : "parcial",');
    expect(ITEMS).toContain("quantidade: quantityProduced - jaProduzido,");
    expect(ITEMS).toContain("totalDepois: quantityProduced,");
  });

  it("usa a máquina enviada agora ou, na falta, a que a peça já tinha", () => {
    expect(ITEMS).toContain("maquina: printMachine || before.printMachine,");
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

describe("modal abre na etapa certa mesmo com servidor antigo (21/09)", () => {
  it("peça da lista 'em impressão' é tratada como inProduction e herda a máquina do cartão", () => {
    const tela = readFileSync(new URL("../../client/src/pages/grafica-maquinas.tsx", import.meta.url), "utf8");
    expect(tela).toContain('status: p.status ?? "inProduction"');
    expect(tela).toContain("p={p.maquina ? p : { ...p, maquina: m.codigo }}");
  });
});
