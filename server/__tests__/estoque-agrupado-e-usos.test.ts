// ─────────────────────────────────────────────────────────────────────────────
// ESTOQUE AGRUPADO POR QUANTIDADE + ONDE JÁ FOI USADO (dono, 21/09) — o puro.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { agruparAcervo, fraseDaCondicao, fraseDaSituacao } from "../../client/src/lib/agrupar-acervo";
import { chaveDoGrupo } from "../../client/src/components/triagem/grupos-da-triagem";
import { eventosDeUso, usosDoAtivo } from "../../shared/estoque";

const ler = (rel: string) => readFileSync(path.resolve(__dirname, "../..", rel), "utf8");

const un = (n: number, extra: any = {}) => ({
  id: `a${n}`, displayId: `#EST-0396-${n}`, name: "2×1 Nubank", quantity: 1, condition: "PERFEITO", trackingStatus: "NO_GALPAO",
  originalItemId: "item-0396", sponsorIds: [], approvalThumbUrl: null, ...extra,
});

describe("agrupar o acervo", () => {
  const ativos = [
    ...Array.from({ length: 30 }, (_, i) => un(i + 1, i < 2 ? { condition: "AVARIA_LEVE" } : {})),
    ...Array.from({ length: 4 }, (_, i) => un(31 + i, { trackingStatus: "EM_USO" })),
    un(99, { originalItemId: null, name: "Grade", quantity: 12, trackingStatus: "EM_MANUTENCAO", displayId: "#EST-M-1" }),
  ];
  const grupos = agruparAcervo(ativos, () => "ev1", (a) => ["a1", "a2", "a3", "a4"].includes(a.id));

  it("usa o MESMO critério da Triagem (um módulo só decide o que é igual)", () => {
    expect(grupos[0].chave).toBe(chaveDoGrupo({ eventId: "ev1", originalItemId: "item-0396", name: "x", sponsorIds: [] } as any));
    expect(ler("client/src/lib/agrupar-acervo.ts")).toContain('import { chaveDoGrupo } from "@/components/triagem/grupos-da-triagem";');
  });

  it("conta UNIDADES por situação e por condição, e as separadas que estão no galpão", () => {
    expect(grupos.length).toBe(2);
    expect(grupos[0]).toMatchObject({ unidades: 34, porSituacao: { NO_GALPAO: 30, EM_USO: 4 }, porCondicao: { PERFEITO: 32, AVARIA_LEVE: 2 }, separadas: 4 });
    expect(grupos[1]).toMatchObject({ unidades: 12, porSituacao: { EM_MANUTENCAO: 12 } });
    // Ordem natural do código dentro do grupo.
    expect(grupos[0].ativos.slice(0, 3).map((a) => a.displayId)).toEqual(["#EST-0396-1", "#EST-0396-2", "#EST-0396-3"]);
  });

  it("as frases da linha", () => {
    expect(fraseDaSituacao(grupos[0])).toBe("30 no galpão (4 separadas) · 4 em uso");
    expect(fraseDaSituacao(grupos[1])).toBe("12 em manutenção");
    expect(fraseDaCondicao(grupos[0])).toBe("32 perfeito · 2 avaria leve");
    expect(fraseDaCondicao(grupos[1])).toBe("Todas em perfeito estado");
    expect(fraseDaSituacao({ porSituacao: { NO_GALPAO: 1 }, separadas: 1 })).toBe("1 no galpão (1 separada)");
  });
});

describe("onde já foi usado", () => {
  const agora = new Date("2026-09-21T12:00:00Z");
  const origem = { id: "ev-o", name: "Primavera RJ", startDate: "2026-08-10T00:00:00Z", itemDisplayId: "#0396" };
  const aloc = (id: string, eventId: string, eventName: string, inicio: string, item: string | null = "#0777") =>
    ({ id, assetId: "a1", eventId, eventName, inicio, itemId: item ? "it" : null, itemDisplayId: item, em: inicio });

  it("origem + reservas, do mais recente ao mais antigo; futuro = separada, passado = usada", () => {
    const usos = usosDoAtivo(origem, [aloc("1", "ev-f", "teste 3", "2026-12-01T00:00:00Z"), aloc("2", "ev-p", "Meia de Floripa", "2026-06-01T00:00:00Z", null)], agora);
    expect(usos.map((u) => [u.eventName, u.situacao, u.itemDisplayId])).toEqual([
      ["teste 3", "separada", "#0777"], ["Primavera RJ", "origem", "#0396"], ["Meia de Floripa", "usada", null],
    ]);
    expect(usosDoAtivo(null, [], agora)).toEqual([]);
  });

  it("no GRUPO: eventos sem repetir, com quantas unidades estiveram em cada", () => {
    const u1 = usosDoAtivo(origem, [aloc("1", "ev-f", "teste 3", "2026-12-01T00:00:00Z")], agora);
    const u2 = usosDoAtivo(origem, [], agora);
    expect(eventosDeUso([u1, u2, []]).map((e) => [e.eventName, e.unidades, e.situacao])).toEqual([["teste 3", 1, "separada"], ["Primavera RJ", 2, "origem"]]);
  });

  it("a rota é de LEITURA, só do admin, recortada (itens=/ativos=) e numa consulta só (sem N+1)", () => {
    const rota = ler("server/routes/estoque-reservas.ts");
    const trecho = rota.slice(rota.indexOf('app.get("/api/estoque/usos"'), rota.indexOf('app.get("/api/estoque/reservas-ativas"'));
    expect(trecho).toContain('app.get("/api/estoque/usos", requireRole("admin")');
    expect(trecho).toContain("return res.status(400)");
    expect(trecho.match(/await db/g)?.length).toBe(1);
    expect(trecho).toContain(".leftJoin(itemsTable");
    expect(trecho).not.toMatch(/\.(insert|update|delete)\(/);
  });
});

describe("sem localização no galpão (dono, 21/09)", () => {
  it("Estoque, detalhe, formulário e Triagem não mostram nem pedem o local; nada chama o mapa do galpão", () => {
    for (const rel of ["client/src/pages/estoque.tsx", "client/src/components/estoque/detalhe-do-ativo.tsx", "client/src/pages/triagem-retorno.tsx", "client/src/components/triagem/quadro-da-triagem.tsx", "client/src/components/triagem-modal.tsx"]) {
      const fonte = ler(rel);
      expect(fonte, rel).not.toContain("mapa-galpao");
      expect(fonte, rel).not.toMatch(/asset\.location|u\.location|a\.location/);
      expect(fonte, rel).not.toMatch(/>Localização<|"Localização"|Sem local|Galpão Central/);
    }
  });
  it("o banco e o servidor seguem aceitando o campo (nenhum dado muda)", () => {
    expect(ler("shared/schema.ts")).toMatch(/location: text\("location"\)/);
    expect(ler("server/routes/inventory.ts")).toContain("location: z.string().max(120).nullish(),");
  });
});
