// ─────────────────────────────────────────────────────────────────────────────
// BUSCA GLOBAL (Ctrl+K) — sugestão 3 da análise de evolução, aprovada 24/08.
//
// A promessa: "#2993" citada no WhatsApp vira a peça aberta em dois segundos,
// de qualquer tela. O que este arquivo prende são as decisões que fazem a
// promessa valer — e as que impedem a paleta de virar outra coisa.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";

vi.mock("../db", () => ({ db: {} }));
vi.mock("../storage", () => ({ storage: {} }));

const { termoLiteral, BUSCA_MAX_PECAS, BUSCA_MAX_EVENTOS } = await import("../routes/busca");

const ROTA = readFileSync(new URL("../routes/busca.ts", import.meta.url), "utf8");
const PALETA = readFileSync(new URL("../../client/src/components/busca-global.tsx", import.meta.url), "utf8");
const APP = readFileSync(new URL("../../client/src/App.tsx", import.meta.url), "utf8");

describe("a rota /api/busca", () => {
  it("o recorte desce ao SQL — a paleta não baixa o banco para procurar", () => {
    expect(ROTA).toContain("ilike(items.displayId, padraoCodigo)");
    expect(ROTA).toContain("ilike(items.description, padraoTexto)");
    expect(ROTA).toContain("ilike(events.name, padraoTexto)");
    expect(ROTA).toContain(".limit(BUSCA_MAX_PECAS)");
  });

  it("código exato vem primeiro — quem digita #2993 quer A peça", () => {
    expect(ROTA).toContain("CASE WHEN lower(${items.displayId}) IN");
    // com e sem cerquilha: as duas grafias são a mesma intenção
    expect(ROTA).toContain('const semCerquilha = bruto.replace(/^#/, "");');
  });

  it("o termo é literal", () => {
    expect(termoLiteral("100%")).toBe("100\\%");
    expect(termoLiteral("a_b")).toBe("a\\_b");
    expect(termoLiteral("c\\d")).toBe("c\\\\d");
    expect(termoLiteral("2x1")).toBe("2x1");
  });

  it("menos de 2 caracteres devolve vazio sem tocar o banco", () => {
    expect(ROTA).toContain('if (bruto.length < 2) return res.json({ pecas: [], eventos: [] });');
  });

  it("peça excluída não aparece, e os limites são pequenos — é paleta, não relatório", () => {
    expect(ROTA).toContain("isNull(items.deletedAt)");
    expect(BUSCA_MAX_PECAS).toBe(15);
    expect(BUSCA_MAX_EVENTOS).toBe(5);
  });

  it("leitura para qualquer logado — o destino (Detalhe do Evento) todo papel já vê", () => {
    expect(ROTA).toContain('app.get("/api/busca", requireAuth,');
    expect(ROTA).not.toContain("requireRole");
    expect(ROTA).not.toContain("userRole");
  });
});

describe("a paleta", () => {
  it("abre por Ctrl/⌘+K e pelo botão da barra — atalho sem botão é recurso escondido", () => {
    expect(PALETA).toContain('(e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k"');
    expect(PALETA).toContain('export const ABRIR_BUSCA_EVENT = "norte:abrir-busca-global";');
    expect(APP).toContain('data-testid="button-busca-global"');
    expect(APP).toContain("<BuscaGlobal />");
  });

  it("é ir-para, não command palette: peça abre no Detalhe do Evento via ?item=", () => {
    expect(PALETA).toContain("/eventos/${linha.p.eventId}?item=${encodeURIComponent(linha.p.id)}");
    expect(PALETA).toContain("setLocation(`/eventos/${linha.ev.id}`)");
  });

  it("teclado completo, com o ativo anunciado e acompanhando a rolagem", () => {
    expect(PALETA).toContain('if (e.key === "ArrowDown")');
    expect(PALETA).toContain('if (e.key === "Enter" && linhas[ativo])');
    expect(PALETA).toContain("aria-selected={ativo === i}");
    expect(PALETA).toContain('scrollIntoView({ block: "nearest" })');
  });

  it("debounce e abort — uma consulta por pausa de digitação, nunca uma por tecla", () => {
    expect(PALETA).toContain("}, 250);");
    expect(PALETA).toContain("ctrl.abort();");
  });

  it("fechar zera o texto — paleta reaberta é pergunta nova", () => {
    expect(PALETA).toContain('setAberta(false); setTermo(""); setResultado(VAZIO); setAtivo(0);');
  });

  it("o vazio explica a si mesmo, inclusive o caso da peça excluída", () => {
    expect(PALETA).toContain("Peças excluídas não aparecem aqui.");
    expect(PALETA).toContain("com ou sem o “#”");
  });

  it("sem Radix — lista viva re-renderizada a cada tecla é o habitat do #185", () => {
    expect(PALETA).not.toContain("@radix-ui");
    expect(PALETA).not.toContain("Dialog");
  });
});
