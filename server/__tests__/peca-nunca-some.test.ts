// ─────────────────────────────────────────────────────────────────────────────
// A PEÇA DEVOLVIDA NUNCA SOME DE TODAS AS FILAS.
//
// O defeito que este arquivo existe para impedir, contado uma vez:
//
// Havia duas portas de reprovação para o mesmo fato do mundo real — o
// patrocinador pediu mudança. A reprovação POR PATROCINADOR deixava a peça em
// `awaiting_sponsor_approval` com a linha daquele patrocinador em
// `awaiting_arte`, e esse par alimenta a aba Correção da Arte. A outra, que
// reprovava a peça INTEIRA, mandava para `awaiting_submission` — a fila
// "Aguardando envio", que na produção tinha 1.120 peças que nunca haviam sido
// enviadas. A peça de RETRABALHO afundava no meio do trabalho NOVO, e a Arte
// perdia a única distinção que decide o que fazer primeiro.
//
// A #1527 ficou semanas assim. A #3042 idem, com a trilha registrando
// "reprovado pelo patrocinador" enquanto a fila de correção mostrava 1 item.
//
// O mesmo vale para a devolução da REVISÃO: ela acontece depois de o
// patrocinador já ter aprovado, então a peça volta para `sponsor_approved`
// (a aba "Finalizar arte"), e não para o começo do fluxo.
//
// Os testes abaixo são estruturais de propósito: eles leem o CÓDIGO das rotas.
// Um teste de comportamento passaria a mentir no dia em que alguém
// reintroduzisse a rota antiga com outro nome.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const ITEMS = readFileSync(join(process.cwd(), "server/routes/items.ts"), "utf8");

/** Tira comentários de linha e de bloco — só o código executável importa. */
function semComentarios(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");
}

const CODIGO = semComentarios(ITEMS);

describe("nenhuma rota devolve peça para o começo do fluxo", () => {
  it('nenhuma escrita usa status: "awaiting_submission"', () => {
    // É a fila de quem NUNCA foi enviado. Uma peça que já andou e voltou não
    // pertence a ela: quem devolve manda para a etapa que precisa ser refeita.
    const escritas = CODIGO.match(/status:\s*"awaiting_submission"/g) ?? [];
    expect(escritas, `${escritas.length} escrita(s) mandando peça para "Aguardando envio"`).toHaveLength(0);
  });

  it("a devolução do criador manda para a finalização, com a aprovação preservada", () => {
    // Quatro rotas devolvem por decisão do criador: creator-reject,
    // bulk-creator-reject, return-to-arte e bulk-return-to-arte.
    for (const rota of ["creator-reject", "bulk-creator-reject", "return-to-arte", "bulk-return-to-arte"]) {
      expect(CODIGO, `rota ${rota} sumiu`).toContain(rota);
    }
    // E nenhuma delas pode apagar o thumb: ele já passou pelo patrocinador.
    const apagaThumb = CODIGO.match(/approvalThumbUrl:\s*null/g) ?? [];
    expect(
      apagaThumb.length,
      "alguma devolução voltou a apagar o thumb já aprovado",
    ).toBeLessThanOrEqual(1); // o único legítimo é o da correção de arte
  });
});

describe("a aba Correção pesca toda peça devolvida por patrocinador", () => {
  it("a consulta olha o rejectedBySponsor, e não só a linha do patrocinador", () => {
    // A fila responde "o que voltou e precisa ser refeito?". Exigir uma linha
    // em `awaiting_arte` era exigir saber QUAL patrocinador reprovou — dado que
    // o caminho antigo nunca gravou, e que não faz parte da pergunta.
    const rota = CODIGO.slice(
      CODIGO.indexOf('"/api/items/resubmission-needed"'),
      CODIGO.indexOf('"/api/items/approved"'),
    );
    expect(rota, "a rota da Correção não foi encontrada").not.toBe("");
    expect(rota).toContain("rejectedBySponsor");
    expect(rota).toContain('"awaiting_submission"');
  });
});

describe("reprovar é UMA porta só", () => {
  it("a rota que reprovava a peça inteira não voltou", () => {
    // Se ela voltar com este nome, o teste acusa. Se voltar com outro, o
    // primeiro teste deste arquivo (nenhuma escrita para awaiting_submission)
    // pega o efeito, que é o que realmente importa.
    expect(CODIGO).not.toContain('"/api/items/:id/sponsor-reject"');
  });

  it("a reprovação por patrocinador continua existindo", () => {
    expect(CODIGO).toContain("sponsor-approvals/:sponsorId/reject");
  });
});
