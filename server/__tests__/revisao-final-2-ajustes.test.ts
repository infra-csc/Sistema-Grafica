// Três furos apontados pela revisão final (22/09), pinados para não voltarem:
//  · o molde travado não pode ser marcado como produzido;
//  · reaproveitar anda a peça — a trava da Solicitação segura;
//  · evento só com moldes produzidos (e entregues) vira Concluído sozinho.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

const ler = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

describe("a trava da Solicitação segura também o molde e o reaproveitar", () => {
  it("rota molde-produzido recusa peça travada", () => {
    expect(ler("server/routes/molde.ts")).toContain("if (pecaTravada(atual as any)) return res.status(409).json({ error: fraseDaTrava(atual as any), code: CODIGO_PECA_TRAVADA });");
  });
  it("o botão do molde fica desabilitado com o motivo", () => {
    const b = ler("client/src/components/grafica/acoes-do-molde.tsx");
    expect(b).toContain("const bloqueado = !!selo || ocupado || travada;");
    expect(b).toContain("title={travada ? fraseDaTrava(item)");
  });
  it("mark-reuse recusa peça travada e a Gráfica não oferece Reaproveitar", () => {
    const rota = ler("server/routes/items.ts");
    const i = rota.indexOf('"/api/items/:id/mark-reuse"');
    expect(rota.slice(i, i + 2500)).toContain("if (pecaTravada(current as any)) return res.status(409)");
    expect(ler("client/src/pages/grafica.tsx")).toContain("const podeReaproveitarPeca = !emRevisao && !pecaTravada(item)");
  });
});

describe("evento com molde conclui", () => {
  it("calculateEventStatus conta o molde produzido como entregue", () => {
    expect(ler("server/routes/shared.ts")).toContain("if (DELIVERED_STATUSES.has(statusParaContagem(item as any))) delivered += 1;");
  });
  it("produzir e desfazer o molde recalculam o status do evento", () => {
    const m = ler("server/routes/molde.ts");
    expect((m.match(/if \(item\.eventId\) await updateEventStatus\(item\.eventId\);/g) ?? []).length).toBe(2);
  });
});
