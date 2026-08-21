// ─────────────────────────────────────────────────────────────────────────────
// VERSÕES APROVADAS — qual versão cada patrocinador aprovou, de qual peça, e
// os books de cada evento com história baixável.
//
// Pedido do dono (21/08/2026). O diagnóstico que motivou a tela, em produção:
//   · 2.209 aprovações sem registro de QUAL thumb foi aprovado;
//   · 192 trocas de thumb vivendo só no texto da trilha de auditoria;
//   · 32 books, um por evento — só o ATUAL (a rota apaga o anterior).
//
// O desenho tem três partes, e este arquivo fixa as três:
//   1. GRAVAR daqui em diante — item_art_versions (envio/reenvio/troca),
//      event_books (cada publicação) e decided_thumb_url (na decisão).
//   2. RECONSTRUIR o legado — da trilha ("Anterior: X → Novo: Y") e do estado
//      atual — e dizer que é inferência, nunca passar por registro.
//   3. A TELA — régua de versões por peça, decisão por patrocinador com a
//      versão decidida, books baixáveis, facetas consistentes.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const ler = (rel: string) => readFileSync(path.resolve(__dirname, "../../", rel), "utf8");
const SCHEMA = ler("shared/schema.ts");
const STORAGE = ler("server/storage.ts");
const ITEMS = ler("server/routes/items.ts");
const ROTA = ler("server/routes/versoes.ts");
const ROUTES = ler("server/routes.ts");
const PAGE = ler("client/src/pages/versoes.tsx");
const APP = ler("client/src/App.tsx");
const SIDEBAR = ler("client/src/components/app-sidebar.tsx");

describe("1 · o que passa a ser GRAVADO", () => {
  it("duas tabelas novas e uma coluna nova, todas aditivas", () => {
    expect(SCHEMA).toContain('export const itemArtVersions = pgTable("item_art_versions", {');
    expect(SCHEMA).toContain('export const eventBooks = pgTable("event_books", {');
    expect(SCHEMA).toContain('decidedThumbUrl: text("decided_thumb_url"),');
    // cascade: apagar a peça/evento leva a história junto, sem órfão.
    expect(SCHEMA).toContain('itemId: varchar("item_id").notNull().references(() => items.id, { onDelete: "cascade" }),');
    expect(SCHEMA).toContain('eventId: varchar("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),');
    expect(SCHEMA).toContain("export type ItemArtVersion = ");
    expect(SCHEMA).toContain("export type EventBook = ");
  });

  it("o storage expõe os quatro métodos", () => {
    for (const m of ["createItemArtVersion(", "getAllItemArtVersions(", "createEventBook(", "getAllEventBooks("]) {
      expect(STORAGE).toContain(`  ${m}`);
      expect(STORAGE).toContain(`async ${m}`);
    }
  });

  it("as três portas de entrada de uma versão gravam: envio, reenvio e troca", () => {
    expect(ITEMS).toContain('origem: "envio"');
    expect(ITEMS).toContain('origem: "reenvio"');
    expect(ITEMS).toContain('origem: "troca"');
    // o envio só grava quando há thumb — peça sem thumb não tem versão.
    const i = ITEMS.indexOf('origem: "envio"');
    expect(ITEMS.slice(i - 400, i)).toContain("if (approvalThumbUrl) {");
  });

  it("aprovar e reprovar gravam O QUE foi decidido — nos quatro ramos (update/create × approve/reject)", () => {
    const n = (ITEMS.match(/decidedThumbUrl: currentItem\.approvalThumbUrl \?\? null,/g) ?? []).length;
    expect(n).toBe(4);
  });

  it("publicar o book grava a história — depois de limpar o atual, nunca antes", () => {
    const limpa = ITEMS.indexOf("await storage.clearEventBookUrl(req.params.eventId);");
    const grava = ITEMS.indexOf("await storage.createEventBook({ eventId: req.params.eventId, bookUrl, itemCount: count");
    expect(limpa).toBeGreaterThan(-1);
    expect(grava).toBeGreaterThan(limpa);
    // e só quando há um book de verdade (a rota aceita bookUrl vazio para limpar).
    expect(ITEMS.slice(grava - 120, grava)).toContain("if (bookUrl) {");
  });
});

describe("2 · o legado é RECONSTRUÍDO e rotulado", () => {
  it("a rota existe, é autenticada e está registrada", () => {
    expect(ROTA).toContain('app.get("/api/versoes", requireAuth,');
    expect(ROUTES).toContain('import { registerVersoesRoutes } from "./routes/versoes";');
    expect(ROUTES).toContain("  registerVersoesRoutes(app);");
  });

  it("lê a trilha com o MESMO formato que a rota de troca escreve", () => {
    // O regex da leitura precisa casar com o template da escrita — senão o
    // legado some em silêncio.
    expect(ITEMS).toContain("`Thumb de aprovação atualizado por ${req.userName}. Anterior: ${prevUrl} → Novo: ${approvalThumbUrl}`");
    const re = /Thumb de aprovação atualizado por (.+?)\. Anterior: (\S+) → Novo: (\S+)/;
    expect(ROTA).toContain("const RE_TROCA = /Thumb de aprovação atualizado por (.+?)\\. Anterior: (\\S+) → Novo: (\\S+)/;");
    const m = re.exec("Thumb de aprovação atualizado por Ana Paula. Anterior: /objects/uploads/a.png → Novo: /objects/uploads/b.png");
    expect(m?.[1]).toBe("Ana Paula");
    expect(m?.[2]).toBe("/objects/uploads/a.png");
    expect(m?.[3]).toBe("/objects/uploads/b.png");
  });

  it("versão reconstruída e decisão inferida carregam a bandeira — e a inferência é pela data", () => {
    expect(ROTA).toContain('origem: "trilha", por: null, inferida: true');
    expect(ROTA).toContain('origem: "atual", por: null, inferida: true');
    expect(ROTA).toContain("inferido: !gravado && thumbUrl !== null,");
    expect(ROTA).toContain("const thumbUrl = gravado ?? (decididoEm ? vigenteEm(decididoEm) : null);");
    // a versão gravada vence a inferida: nunca inferir o que foi registrado.
    expect(ROTA.indexOf("for (const v of versoesGravadas)")).toBeLessThan(ROTA.indexOf("for (const log of logsDeTroca)"));
  });

  it("o book atual entra como história quando não há registro, sem data inventada", () => {
    expect(ROTA).toContain('l.unshift({ bookUrl: cur.bookUrl, em: "", por: null, itemCount: cur.n, inferido: true });');
    expect(PAGE).toContain("publicado antes do registro de books — data não gravada");
  });

  it("peças apagadas ficam fora", () => {
    expect(ROTA).toContain("if ((item as any).deletedAt) continue;");
  });
});

describe("3 · a tela", () => {
  it("rota, título e item de menu — sem restrição de papel", () => {
    expect(APP).toContain('import Versoes from "@/pages/versoes";');
    expect(APP).toContain('"/versoes": "Versões aprovadas",');
    expect(APP).toContain('<Route path="/versoes">');
    const linha = SIDEBAR.split("\n").find(l => l.includes('url: "/versoes"')) ?? "";
    expect(linha).toContain('title: "Versões aprovadas"');
    expect(linha).not.toContain("roles:");
  });

  it("a frase de confiança separa registro de inferência", () => {
    expect(PAGE).toContain('data-testid="text-confianca-versoes"');
    expect(PAGE).toContain("inferida pela data");
    expect(PAGE).toContain("todas com a versão registrada");
    // E o selo na decisão, com contraste (#92400e sobre #fffbeb = 6,6:1).
    expect(PAGE).toContain("inferido pela data");
    expect(PAGE).toContain('color: "#92400e", backgroundColor: "#fffbeb"');
  });

  it("a decisão diz QUAL versão — e avisa quando a aprovada não é a atual", () => {
    expect(PAGE).toContain("? `aprovou ${d.versao ? `a v${d.versao}` : \"uma versão\"}`");
    expect(PAGE).toContain("aprovou outra versão");
    expect(PAGE).toContain('d.thumbUrl !== p.approvalThumbUrl && tone === "approved"');
  });

  it("a régua de versões marca a atual e reconstruídas", () => {
    expect(PAGE).toContain("data-testid={`versao-${p.id}-${i + 1}`}");
    expect(PAGE).toContain("const atual = v.thumbUrl === p.approvalThumbUrl;");
    expect(PAGE).toContain("reconstruída, não gravada como versão");
  });

  it("books baixáveis — download só para arquivo do app, nunca link cego", () => {
    expect(PAGE).toContain("data-testid={`link-baixar-book-${ev.eventId}-${i}`}");
    expect(PAGE).toContain('<a href={b.bookUrl} download target="_blank" rel="noopener noreferrer"');
    expect(PAGE).toContain("isWebUrl(b.bookUrl) ?");
    expect(PAGE).toContain("arquivo fora do app");
  });

  it("facetas: cada filtro conta o pool SEM a própria dimensão", () => {
    expect(PAGE).toContain("itens.filter(p => casaBusca(p) && casaPatrocinador(p)).forEach(p => {"); // opções de evento
    expect(PAGE).toContain("itens.filter(p => casaBusca(p) && casaEvento(p)).forEach(p => {");       // opções de patrocinador
    expect(PAGE).toContain('testId="filter-versoes-evento"');
    expect(PAGE).toContain('testId="filter-versoes-patrocinador"');
  });

  it("paginação e limpar", () => {
    expect(PAGE).toContain("const PAGE = 40;");
    expect(PAGE).toContain('data-testid="button-mais-versoes"');
    expect(PAGE).toContain('data-testid="button-limpar-versoes"');
    // mudar filtro volta ao início da lista.
    expect(PAGE).toContain("setEventoFiltro(v); setVisiveis(PAGE);");
  });

  it("tons e ícones vêm de status.ts, não inventados na tela", () => {
    expect(PAGE).toContain('import { getApprovalMeta } from "@/lib/status";');
    expect(PAGE).toContain("const meta = getApprovalMeta(d.status);");
  });
});
