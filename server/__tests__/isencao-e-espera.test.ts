// ─────────────────────────────────────────────────────────────────────────────
// A ISENÇÃO E A ESPERA NÃO COEXISTEM — e a saúde dos dados vigia o resto.
//
// O INCIDENTE (08/09). Doze peças do Ministério, do Primavera RJ, ficaram
// ONZE DIAS invisíveis na fila do Atendimento. Elas diziam duas coisas
// opostas ao mesmo tempo: `skipApproval = true` ("não precisa de aprovação")
// e `status = awaiting_sponsor_approval` ("esperando o patrocinador decidir").
// O Atendimento filtra por `!item.skipApproval` e sumia com elas; a Gestão de
// Prazos lê o status e as cobrava. Nenhuma das duas telas errava — o DADO é
// que se contradizia, e nenhuma delas tinha como perceber isso sozinha.
//
// Como chegaram lá: importadas sem patrocinador (isentas, correto), enviadas
// pulando a aprovação (correto), e então o Ministério foi acrescentado —
// reabrindo a peça para aprovação sem limpar a isenção. O commit ae4dc415
// (27/08) fez sponsors.ts limpar; as doze foram vinculadas horas antes.
//
// A defesa tem DUAS camadas, e este arquivo pina as duas:
//   1. O estado deixa de ser ESCRIVÍVEL — a invariante mora em
//      storage.updateItem, o funil por onde toda escrita de peça passa;
//   2. O que escapar fica VISÍVEL — verificarConsistencia() pergunta, entre
//      outras coisas, se esse par proibido existe, e a rota só-admin mostra.
// ─────────────────────────────────────────────────────────────────────────────
//
// As camadas 1 e 2 (updateItem, verificarConsistencia e a rota só-admin)
// rodam de verdade em regras-patrocinio-isencao-e-saude; "acrescentar limpa a
// isenção", em regras-patrocinio-vinculos. Aqui ficam as telas.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const ler = (rel: string) => readFileSync(path.resolve(__dirname, "../..", rel), "utf8");
const ATENDIMENTO = ler("client/src/pages/atendimento.tsx");
const NOTIFICACOES = ler("client/src/pages/notificacoes.tsx");

describe("camada 3 — o admin VÊ (rota sem tela não protege ninguém)", () => {
  it("a central do admin consome a saúde dos dados e mostra os achados", () => {
    expect(NOTIFICACOES).toContain('queryKey: ["/api/admin/consistencia"]');
    expect(NOTIFICACOES).toContain("Saúde dos dados");
    expect(NOTIFICACOES).toContain('data-testid="saude-achados"');
  });

  it("distingue os três desfechos: limpo, com achados e falhou", () => {
    // "Não consegui conferir" não pode se parecer com "está tudo certo" — é
    // o mesmo erro que fez a fila do Atendimento dizer "nada pendente".
    expect(NOTIFICACOES).toContain('data-testid="saude-limpa"');
    expect(NOTIFICACOES).toContain('data-testid="saude-falhou"');
    expect(NOTIFICACOES).toContain("estas verificações estão sem vigilância");
  });

  it("mostra os números das peças, para o admin ir olhar uma", () => {
    expect(NOTIFICACOES).toContain("a.amostra.join");
  });
});

describe("a tela que sofreu o sintoma", () => {
  it("o Atendimento segue filtrando por isenção — agora com a invariante atrás", () => {
    // O filtro continua correto: peça isenta não é trabalho do Atendimento.
    // O que mudou é que o par proibido não nasce mais.
    expect(ATENDIMENTO).toContain("item.status === 'awaiting_sponsor_approval' && !item.skipApproval");
  });
});
