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
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const ler = (rel: string) => readFileSync(path.resolve(__dirname, "../..", rel), "utf8");
const STORAGE = ler("server/storage.ts");
const SPONSORS = ler("server/routes/sponsors.ts");
const ITEMS = ler("server/routes/items.ts");
const CONSISTENCIA = ler("server/services/consistencia.ts");
const ATENDIMENTO = ler("client/src/pages/atendimento.tsx");
const NOTIFICACOES = ler("client/src/pages/notificacoes.tsx");

describe("camada 1 — o estado não pode ser escrito", () => {
  it("updateItem zera a isenção sempre que a peça fica aguardando o patrocinador", () => {
    expect(STORAGE).toContain("updateData.skipApproval = sql`CASE WHEN ${statusAlvo} IN ('awaiting_sponsor_approval', 'awaiting_approval') THEN false ELSE ${isencaoAlvo} END`");
  });

  it("vale mesmo quando só UM dos dois campos vem no update — o outro é lido da coluna", () => {
    // Sem isto, marcar isenção numa peça que JÁ estava aguardando passava
    // batido: `data.status` seria undefined e a guarda não rodaria.
    expect(STORAGE).toContain("if (data.status !== undefined || data.skipApproval !== undefined) {");
    expect(STORAGE).toContain("const statusAlvo = data.status !== undefined ? sql`${data.status}` : sql`${items.status}`;");
    expect(STORAGE).toContain("const isencaoAlvo = data.skipApproval !== undefined ? sql`${data.skipApproval}` : sql`${items.skipApproval}`;");
  });

  it("a invariante fica no FUNIL (updateItem), não espalhada nas rotas", () => {
    const funil = STORAGE.slice(STORAGE.indexOf("async updateItem(id: string"), STORAGE.indexOf("async updateItemWithStatusCheck"));
    expect(funil).toContain("updateData.skipApproval = sql`CASE WHEN");
  });

  it("a origem do incidente segue tapada: acrescentar patrocinador limpa a isenção", () => {
    expect(SPONSORS).toContain("skipApproval: false,");
  });
});

describe("camada 2 — o que escapar fica visível", () => {
  it("a saúde dos dados pergunta exatamente pelo par proibido", () => {
    expect(CONSISTENCIA).toContain("chave: \"isenta_aguardando\"");
    expect(CONSISTENCIA).toContain("status in ('awaiting_sponsor_approval','awaiting_approval') and skip_approval = true");
  });

  it("cobre as outras contradições que nenhuma tela vê sozinha", () => {
    for (const chave of [
      "aguardando_sem_patrocinador",   // espera decisão de quem não existe
      "passou_com_pendencia",          // avançou sem todos decidirem
      "conferido_sem_lastro",          // unidade conferida que ninguém produziu
      "evento_inexistente",            // peça órfã, fora de toda fila
      "numero_duplicado",              // duas peças com a mesma etiqueta
    ]) {
      expect(CONSISTENCIA).toContain(`chave: "${chave}"`);
    }
  });

  it("uma verificação que quebra vira achado — nunca um 'está tudo certo' falso", () => {
    expect(CONSISTENCIA).toContain("não conseguiu rodar");
    expect(CONSISTENCIA).toContain("este risco está sem vigilância");
  });

  it("cada achado explica o efeito em português de quem opera, não de quem programou", () => {
    expect(CONSISTENCIA).toContain("O Atendimento acredita na isenção e não mostra a peça");
    expect(CONSISTENCIA).toContain("podem sair no caminhão sem existir");
  });

  it("a rota é só do admin — a lista nomeia peças de todos os eventos", () => {
    expect(ITEMS).toContain('app.get("/api/admin/consistencia", requireAuth');
    expect(ITEMS).toContain("Apenas administradores podem ver a saude dos dados");
  });
});

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
