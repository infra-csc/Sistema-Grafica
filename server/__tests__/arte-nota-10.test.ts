// ─────────────────────────────────────────────────────────────────────────────
// ARTE nota 10 — idade na fase, quem está travando, e o reenvio derivado.
//
// Três das quatro mudanças do handoff. A quarta ("Cobrar" na aba que não tem
// ação) tinha um gate — confirmar o que "cobrar" dispara; se não houver rota,
// parar e perguntar — e o gate falhou: não existe rota de cobrança ao
// patrocinador (ele não é usuário; o Atendimento registra por ele), e a única
// "cobrança" do sistema é o registro gerencial da Gestão de Prazos, admin-only,
// sem notificação a ninguém. Perguntado ao dono (21/08/2026), com as opções
// na mesa — notificar o Atendimento, registrar na Gestão de Prazos, os dois —,
// a decisão foi DEIXAR SEM "COBRAR": a faixa "Quem está travando" mostra o
// problema e filtra por marca, e isso basta. O teste abaixo guarda a decisão
// para ninguém "completar" o handoff por reflexo.
//
// 1 · IDADE NA FASE: abaixo da data do prazo, "há Nd na fase" — de
//     `statusChangedAt`, nunca da criação (uma peça criada há oito meses que
//     entrou na fase ontem apareceria como "há 240d"). Chip "paradas há mais de
//     7d" na faixa de diagnóstico, com a contagem igual ao que o clique entrega.
// 2 · QUEM ESTÁ TRAVANDO: estado por marca no chip (atrás de prop, só nesta
//     aba) e uma faixa com um chip por patrocinador pendente — nome, peças e a
//     espera mais antiga. Clicar filtra por ele.
// 4 · REENVIO DERIVADO: o painel do modal de correção é de LEITURA — "vai
//     receber" / "mantém aprovação" — e o servidor recusa qualquer conjunto
//     diferente do derivado. Desmarcar quem reprovou era um erro sem volta.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const ler = (rel: string) => readFileSync(path.resolve(__dirname, "../../", rel), "utf8");
const ARTE = ler("client/src/pages/arte.tsx");
const CHIPS = ler("client/src/components/sponsor-chips.tsx");
const ROTAS = ler("server/routes/items.ts");
const semCom = (s: string) => s.replace(/\r\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n").map(l => l.replace(/^\s*\/\/.*$/, "")).join("\n");

describe("1 · idade na fase", () => {
  it("deriva de statusChangedAt, e sem registro não exibe nada", () => {
    expect(ARTE).toContain("function diasNaFase(item: any, hoje: Date): number | null {");
    expect(ARTE).toContain("const bruto = item?.statusChangedAt ?? item?.status_changed_at;");
    expect(ARTE).toContain("if (!bruto) return null;");
    const i = ARTE.indexOf("function diasNaFase");
    expect(ARTE.slice(i, i + 400)).not.toContain("createdAt");
  });

  it("a escala de tom: cinza até 7, âmbar de 7 a 13, vermelho de 14 em diante", () => {
    expect(ARTE).toContain('if (dias >= 14) return { cor: "#b91c1c", peso: 700 };');
    expect(ARTE).toContain('if (dias >= 7) return { cor: "#b45309", peso: 700 };');
    expect(ARTE).toContain('return { cor: "#78716c", peso: 600 };');
  });

  it("aparece abaixo da data, em DM Mono 11, com o title por extenso — e o prazo continua texto", () => {
    expect(ARTE).toContain("data-testid={`cell-idade-${item.id}`}");
    expect(ARTE).toContain("há {dias}d na fase");
    expect(ARTE).toContain("fontFamily: \"'DM Mono', monospace\", fontSize: 11, fontWeight: tom.peso, color: tom.cor");
    expect(ARTE).toContain("title={`Há ${dias} ${dias === 1 ? 'dia' : 'dias'} nesta fase");
    // O PrazoInline segue intocado — o prazo é texto, não selo.
    expect(ARTE).toContain("testId={`cell-prazo-${item.id}`}");
  });

  it("o chip de paradas filtra, e conta a camada SEM o próprio recorte", () => {
    expect(ARTE).toContain('data-testid="chip-paradas"');
    expect(ARTE).toContain("onClick={() => setParadasFilter(v => !v)}");
    expect(ARTE).toContain("aria-pressed={paradasFilter}");
    expect(ARTE).toContain('<Hourglass style={{ width: 12, height: 12, flexShrink: 0 }} />');
    // Invariante das facetas: o número do chip é o de linhas que o clique entrega.
    expect(ARTE).toContain("() => (itemsByTabSemParadas[activeTab] ?? []).filter((i: any) => estaParada(i, hoje)).length,");
    expect(ARTE).toContain("const paradas = tabId === activeTab ? paradasNaAba : items.filter(i => estaParada(i, hoje)).length;");
    // E a lista obedece, em cima do recorte de atrasadas.
    expect(ARTE).toContain("for (const tab in itemsByTabSemParadas) out[tab] = itemsByTabSemParadas[tab].filter((i: any) => estaParada(i, hoje));");
  });

  it("o recorte viaja na URL sem tocar em arte-rules (só leitura)", () => {
    expect(ARTE).toContain('if (paradasFilter) p.set("paradas", "1");');
    expect(ARTE).toContain('new URLSearchParams(window.location.search).get("paradas") === "1"');
    expect(ler("client/src/lib/arte-rules.ts")).not.toContain("paradas");
  });
});

describe("2 · quem está travando", () => {
  it("o chip ganha estado por marca atrás de uma prop — as outras telas não mudam", () => {
    expect(CHIPS).toContain("destacarPendencia?: boolean;");
    expect(CHIPS).toContain('const pendente = destacarPendencia && ap?.tone === "waiting";');
    expect(CHIPS).toContain('const aprovado = destacarPendencia && ap?.tone === "approved";');
    expect(CHIPS).toContain("...(pendente ? { fontWeight: 700 } : {}),");
    expect(CHIPS).toContain("...(aprovado ? { fontWeight: 500, opacity: 0.6 } : {}),");
    expect(CHIPS).toContain('{pendente && <Clock aria-hidden="true"');
    expect(CHIPS).toContain('{aprovado && <Check aria-hidden="true" style={{ width: 10, height: 10, flexShrink: 0, color: "#15803d" }} />}');
    // Só a Arte liga a prop, e só na aba que espera patrocinador.
    expect((ARTE.match(/destacarPendencia=\{tabId === "aguardando-patrocinador"\}/g) ?? []).length).toBe(2);
    for (const tela of ["eventos", "painel-geral", "triagem-modal"]) {
      const f = tela === "triagem-modal" ? "client/src/components/triagem-modal.tsx" : `client/src/pages/${tela}.tsx`;
      try { expect(ler(f)).not.toContain("destacarPendencia"); } catch (e) { if ((e as any).code !== "ENOENT") throw e; }
    }
  });

  it("a faixa 'Quem está travando' existe só nessa aba, e clicar filtra pelo sponsorFilter", () => {
    expect(ARTE).toContain('const travando = tabId === "aguardando-patrocinador" ? (() => {');
    expect(ARTE).toContain('if (getApprovalMeta(s.approvalStatus)?.tone !== "waiting") continue;');
    expect(ARTE).toContain('data-testid="faixa-travando"');
    expect(ARTE).toContain("data-testid={`chip-travando-${t.id}`}");
    expect(ARTE).toContain("onClick={() => setSponsorFilter(ligado ? [] : [t.id])}");
    // A espera mais antiga, no tom da escala da mudança 1.
    expect(ARTE).toContain("e.espera = Math.max(e.espera, diasNaFase(i, hoje) ?? 0);");
    expect(ARTE).toContain("const tom = tomDaIdade(t.espera);");
  });
});

describe("4 · o reenvio da correção é derivado, não escolhido", () => {
  it("as caixas de seleção saíram; o painel é de leitura", () => {
    const cru = semCom(ARTE);
    expect(cru).not.toContain("correcaoSelectedSponsorIds");
    expect(cru).not.toContain("checkbox-correcao-sponsor-");
    expect(ARTE).toContain('data-testid="painel-reenvio"');
    expect(ARTE).toContain("Para quem vai o reenvio — automático");
    expect(ARTE).toContain("{recebe ? 'vai receber' : 'mantém aprovação'}");
    expect(ARTE).toContain("Vai para {correcaoDestinatarios.length} de {correcaoAprovacoes.length}");
  });

  it("o conjunto é derivado no cliente: quem ainda não aprovou", () => {
    expect(ARTE).toContain("const correcaoDestinatarios: string[] = correcaoAprovacoes.filter((a: any) => a.status !== 'approved').map((a: any) => a.sponsorId);");
    expect(ARTE).toContain("resubmitMutation.mutate({ itemId: correcaoItem.id, newThumbUrl: correcaoThumbUrl, sponsorIds: correcaoDestinatarios });");
    // A fila da Correção passa a levar TODAS as aprovações da peça.
    expect(ROTAS).toContain("aprovacoes: comPatrocinador(todasPorItem.get(item.id) ?? []),");
  });

  it("e o servidor não aceita subconjunto diferente", () => {
    expect(ROTAS).toContain('const sponsorIds = aprovacoes.filter((a) => a.status !== "approved").map((a) => a.sponsorId);');
    expect(ROTAS).toContain('error: "O reenvio vai sempre para quem ainda não aprovou — o servidor não aceita outro conjunto.",');
    expect(ROTAS).toContain("esperado: sponsorIds,");
    // O 400 "Selecione pelo menos um patrocinador" morreu com a escolha.
    expect(semCom(ROTAS)).not.toContain("Selecione pelo menos um patrocinador");
  });
});

describe("o que NÃO mexer continua", () => {
  it("o orçamento de colunas e o prazo em texto", () => {
    expect(ARTE).toContain("const ARTE_COLS: ArteCol[] = [");
    expect(ARTE).toContain("const ARTE_COLS_FINALIZADOS: ArteCol[] = ARTE_COLS.map(c =>");
    expect(ARTE).toContain("<PrazoInline");
  });

  it("acaoPrimaria continua devolvendo null fora de Criar/Finalizar — 'Cobrar' ficou para decisão", () => {
    expect(ARTE).toContain('if (tabId !== "criar-aprovacoes" && tabId !== "finalizar-layouts") return null;');
    expect(semCom(ARTE)).not.toContain("Cobrar ${");
  });

  it("a âncora de hoje, o gate podeEditar e a paginação", () => {
    expect(ARTE).toContain("setInterval(() => setAgora(Date.now()), 600_000)");
    expect(ARTE).toContain("if (!podeEditar) return null;");
    expect(ARTE).toContain("ARTE_PAGE_SIZE");
  });
});
