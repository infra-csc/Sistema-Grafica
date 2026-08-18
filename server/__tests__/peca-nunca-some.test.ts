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
  it('"awaiting_submission" só é escrito por uma ESCOLHA explícita de destino', () => {
    // A invariante mudou de forma em 17/08, e é importante entender por quê.
    //
    // Antes: nenhuma rota podia mandar peça para "Aguardando envio" — a fila de
    // quem NUNCA foi enviado. Era simples e pegava o defeito original.
    //
    // Depois o dono pediu que QUEM DEVOLVE decida: se a arte inteira está
    // errada, a peça volta mesmo para o começo; se só o arquivo final falhou,
    // volta para a Finalização. Os dois destinos são legítimos.
    //
    // O que continua proibido é o SISTEMA escolher em silêncio. Por isso a
    // única escrita permitida vive em `camposDoDestino`, alimentada por uma
    // opção que a pessoa marcou na tela. Qualquer outra rota que volte a
    // gravar esse status direto derruba este teste.
    const escritas = CODIGO.match(/status:\s*"awaiting_submission"/g) ?? [];
    expect(
      escritas.length,
      "só `camposDoDestino` pode escrever awaiting_submission — apareceu escrita nova",
    ).toBe(1);

    const helper = CODIGO.slice(
      CODIGO.indexOf("function camposDoDestino"),
      CODIGO.indexOf("function textoDoDestino"),
    );
    expect(helper, "a escrita saiu de camposDoDestino").toContain('"awaiting_submission"');
  });

  it("o destino padrão é o menos destrutivo", () => {
    // Sem escolha explícita a peça vai para a Finalização: preservar a
    // aprovação do patrocinador não custa nada se a arte for refeita depois,
    // mas jogar fora uma aprovação que valia obriga a pedir tudo de novo.
    const leitor = CODIGO.slice(
      CODIGO.indexOf("function lerDestinoDevolucao"),
      CODIGO.indexOf("function camposDoDestino"),
    );
    expect(leitor).toContain('=== "arte" ? "arte" : "finalizacao"');
  });

  it("a devolução do criador manda para a finalização, com a aprovação preservada", () => {
    // Quatro rotas devolvem por decisão do criador: creator-reject,
    // bulk-creator-reject, return-to-arte e bulk-return-to-arte.
    for (const rota of ["creator-reject", "bulk-creator-reject", "return-to-arte", "bulk-return-to-arte"]) {
      expect(CODIGO, `rota ${rota} sumiu`).toContain(rota);
    }
    // O thumb só é apagado no destino "arte" — lá a arte inteira será refeita,
    // então manter o "aprovado" de uma versão que não existe mais seria
    // carimbar um sim que ninguém deu. No destino "finalizacao" ele fica.
    const helper = CODIGO.slice(
      CODIGO.indexOf("function camposDoDestino"),
      CODIGO.indexOf("function textoDoDestino"),
    );
    const antesDoReturnFinal = helper.slice(0, helper.lastIndexOf("return {"));
    expect(antesDoReturnFinal, "o ramo `arte` deve limpar o thumb").toContain("approvalThumbUrl: null");
    expect(
      helper.slice(helper.lastIndexOf("return {")),
      "o ramo `finalizacao` NÃO pode apagar o thumb aprovado",
    ).not.toContain("approvalThumbUrl");
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
