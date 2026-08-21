// ─────────────────────────────────────────────────────────────────────────────
// DETALHE DO EVENTO nota 10 — a timeline diz o que está atrás de cada marco,
// o cabeçalho diz onde o evento está, e a lista se lê por etapa.
//
// Três mudanças, e o fio que as une: a tela que DETÉM as peças não tinha
// nenhuma leitura do que a própria lista contém. A timeline era calendário
// (seis datas e nada sobre as peças); o cabeçalho não tinha progresso (era
// somar os chips de cabeça); e achar "o que travou" numa lista agrupada por
// tipo exigia varrer todas as seções.
//
// E uma descoberta no caminho: a timeline tinha CINCO marcos escritos à mão —
// faltava a Finalização (−10). A lista "não mexer" do handoff dizia seis; os
// seis agora vêm da fonte única (@shared/prazo-dates), como nas outras telas.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const ler = (rel: string) => readFileSync(path.resolve(__dirname, "../../", rel), "utf8");
const ED = ler("client/src/pages/event-detail.tsx");
const EV = ler("client/src/pages/eventos.tsx");
const FASES = ler("client/src/lib/fases.ts");
const semCom = (s: string) => s.replace(/\r\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n").map(l => l.replace(/^\s*\/\/.*$/, "")).join("\n");

describe("Mudança 1 · a timeline diz quantas peças estão atrás de cada marco", () => {
  it("a régua status → etapa cumprida tem os pontos de ancoragem do handoff", () => {
    // aguardando envio 0, aguardando aprovação 2, aguardando revisão 3,
    // pronto para produção 4, em produção 5, entregue 6.
    expect(ED).toContain("awaiting_linking: 0, awaiting_submission: 0,");
    expect(ED).toContain("awaiting_approval: 2, awaiting_sponsor_approval: 2,");
    expect(ED).toContain("awaiting_creator_review: 3, awaiting_final_review: 3,");
    expect(ED).toContain("ready_for_production: 4,");
    expect(ED).toContain("inProduction: 5, em_producao: 5, produced: 5, produzido: 5, conferred: 5,");
    expect(ED).toContain("delivered: 6, entregue: 6,");
    // Atrás do marco i: etapa < i + 1.
    expect(ED).toContain("const estaAtrasDoMarco = (status: string, i: number) => etapaCumprida(status) < i + 1;");
  });

  it("os seis marcos vêm da fonte única, numa função pura lida por cabeçalho e timeline", () => {
    expect(ED).toContain("function calcularMarcos(event: any, today: Date)");
    expect(ED).toContain("const marcos = MARCOS_DO_EVENTO.map((m) => {");
    // sábado→sexta, domingo→segunda, e `todosOsDias` só onde a fonte diz.
    expect(ED).toContain("const { date, adjusted } = adjustWeekend(raw, m.todosOsDias);");
    expect(ED).toContain("const milestones = marcosDoEvento?.marcos ?? [];");
    // A lista de cinco, escrita à mão, saiu.
    expect(semCom(ED)).not.toContain("const rawDeadlines = [");
  });

  it("a pílula por marco, só quando há peça atrás, nos três tons", () => {
    expect(ED).toContain("data-testid={`chip-atras-${marcoKey}`}");
    expect(ED).toContain("{atras > 0 && (");
    expect(ED).toContain("? { color: '#b91c1c', bg: '#fef2f2', border: '#fecaca' }");
    expect(ED).toContain("? { color: '#9a3412', bg: '#fff7ed', border: '#fed7aa' }");
    expect(ED).toContain(": { color: '#57534e', bg: '#f5f5f4', border: '#e7e5e4' };");
  });

  it("clicar no marco filtra a lista por esse gargalo", () => {
    expect(ED).toContain("data-testid={`marco-${marcoKey}`}");
    expect(ED).toContain("aria-pressed={clicavel ? selecionado : undefined}");
    expect(ED).toContain("backgroundColor: selecionado ? '#fff7ed' : 'transparent',");
    expect(ED).toContain("onClick={clicavel ? () => setMarcoFiltro(selecionado ? null : i) : undefined}");
    // Marco sem pendência não é clicável.
    expect(ED).toContain("const clicavel = atras > 0 && !isHistorical;");
    expect(ED).toContain("cursor: clicavel ? 'pointer' : 'default',");
    // E a lista obedece.
    expect(ED).toContain("if (marcoFiltro !== null) base = base.filter(item => estaAtrasDoMarco(item.status, marcoFiltro));");
  });

  it("o title diz o número por extenso e que dá para clicar", () => {
    expect(ED).toContain("return `${base} — nenhuma peça atrás deste marco`;");
    expect(ED).toContain("'peça ainda não passou', 'peças ainda não passaram'");
    expect(ED).toContain("'Clique para ver só essas'");
  });
});

describe("Mudança 2 · frase de resolução e barra de fases no cabeçalho", () => {
  it("a frase existe, com as três formas e concordância", () => {
    expect(ED).toContain('data-testid="text-resolucao"');
    expect(ED).toContain("'marco já venceu', 'marcos já venceram'");
    expect(ED).toContain("'peça atrás', 'peças atrás'");
    expect(ED).toContain("return `Todas as ${t} ${plural(t, 'peça entregue', 'peças entregues')}.`;");
    expect(ED).toContain("' O caminhão sai hoje.'");
  });

  it("a barra usa a MESMA contagem do cartão de Eventos — lib/fases, não um derivado local", () => {
    expect(FASES).toContain("export const PHASES = PRODUCTION_STATUSES.map((key) => ({");
    expect(FASES).toContain("export function contarPorFase(");
    expect(ED).toContain('import { PHASES, contarPorFase } from "@/lib/fases";');
    expect(EV).toContain('import { PHASES, contarPorFaseDoEvento as contarPorFase } from "@/lib/fases";');
    // Nenhuma das duas telas redefine a lista de fases.
    expect(semCom(ED)).not.toContain("PHASE_ALIASES");
    expect(semCom(EV)).not.toContain("const PHASE_ALIASES");
    expect(ED).toContain('data-testid="bar-fases"');
    expect(ED).toContain("{entregues}/{mainItems.length}");
  });
});

describe("Mudança 3 · agrupar por tipo ou por status", () => {
  it("o segmented Tipo | Status, com a regra escrita ao lado", () => {
    expect(ED).toContain('role="radiogroup" aria-label="Agrupar a lista por"');
    expect(ED).toContain("data-testid={`toggle-agrupar-${valor}`}");
    expect(ED).toContain("boxShadow: ativo ? '0 1px 3px rgba(0,0,0,0.10)' : 'none'");
    expect(ED).toContain("'por grupo pai e tipo de peça, como a produção lê'");
    expect(ED).toContain("'pela etapa em que cada peça está — para achar o que travou'");
  });

  it("no modo Status as seções são os status na ordem do fluxo, sem grupo pai", () => {
    expect(ED).toContain("const ORDEM_DO_FLUXO = new Map(Object.keys(STATUS).map((k, i) => [k, i]));");
    expect(ED).toContain("const secoesPorStatus = useMemo(() => {");
    expect(ED).toContain("data-testid={`secao-status-${status}`}");
    expect(ED).toContain("const m = getStatusMeta(status);");
  });

  it("a linha é a MESMA nos dois modos — uma função, duas chamadas", () => {
    expect(ED).toContain("const renderTabelaDeItens = (typeItems: typeof visibleEventItems) => (");
    expect(ED).toContain("{renderTabelaDeItens(lista)}");
    expect(ED).toContain("{renderTabelaDeItens(typeItems)}");
    expect((ED.match(/<table style=\{\{ width: '100%', minWidth: 960/g) ?? []).length).toBe(1);
  });

  it("'Limpar filtros (N de M)' cobre busca, chips e marco; a escolha vai na URL", () => {
    expect(ED).toContain("Limpar filtros ({searchedItems.length} de {mainItems.length})");
    expect(ED).toContain("onClick={() => { setItemSearch(\"\"); setStatusFilter([]); setMarcoFiltro(null); }}");
    expect(ED).toContain("if (agrupar === 'status') p.set('agrupar', 'status'); else p.delete('agrupar');");
    expect(ED).toContain("if (marcoFiltro !== null) p.set('marco', String(marcoFiltro)); else p.delete('marco');");
    // O consumo do ?item= não apaga mais os outros parâmetros.
    expect(ED).toContain("const p = new URLSearchParams(window.location.search); p.delete('item');");
  });
});

describe("restrições", () => {
  it("a tabela tem 9 colunas em porcentagens somando 100, Status com 19%", () => {
    const i = ED.indexOf("['ID', '7%'],");
    const bloco = ED.slice(i, i + 400);
    const pcts = [...bloco.matchAll(/'(\d+)%'\]/g)].map(m => Number(m[1]));
    expect(pcts).toHaveLength(9);
    expect(pcts.reduce((a, b) => a + b, 0)).toBe(100);
    expect(bloco).toContain("['Status', '19%']");
    // Nenhuma coluna `auto` ao lado das outras — com fixed ela vira zero.
    expect(bloco).not.toContain("undefined]");
  });

  it("nenhum m² sai das medidas visuais", () => {
    // calculateM2 só recebe as medidas de ARQUIVO.
    for (const m of ED.matchAll(/calculateM2\(([^)]*)\)/g)) {
      expect(m[1]).not.toContain("visualWidth");
      expect(m[1]).not.toContain("visualHeight");
    }
  });

  it("o que NÃO mexer continua", () => {
    expect(ED).toContain("i.status === 'draft' || i.status === 'requested'");
    expect(ED).toContain("Confirmar envio para vinculação");
    expect(ED).toContain("const isHistorical = event.status === 'completed' || isEventClosed");
    expect(ED).toContain('data-testid="card-draft-items"');
  });
});
