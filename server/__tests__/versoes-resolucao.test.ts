// ─────────────────────────────────────────────────────────────────────────────
// VERSÕES APROVADAS — as três mudanças de 24/08 (segunda rodada).
//
// A tela já sabia DETECTAR. Faltavam três coisas para ela servir para decidir:
//
//  1. A GRAVIDADE. O tipo `Peca` já trazia `status` e a tela não o mostrava em
//     lugar nenhum — e é ele que separa aviso de estrago: o mesmo desencontro
//     de versão é conserto barato numa peça em aprovação e é arte impressa
//     errada numa peça que já foi para a gráfica. O subtítulo promete dizer "se
//     é ela que está indo para a gráfica"; sem o status, essa metade da
//     pergunta ficava sem resposta.
//  2. A RESOLUÇÃO. A tela detectava bem e resolvia nada: quem descobria a
//     divergência precisava sair, abrir o evento e refazer o pedido na mão.
//  3. O LADO A LADO. Alternar com ←/→ resolve o caso grosseiro; não resolve o
//     típico — um logo que mudou de tamanho entre duas artes quase idênticas.
//
// O que este arquivo NÃO deixa mudar: a tela continua abrindo pela exceção, e
// a separação entre registro e inferência continua de pé. São as duas decisões
// que sustentam a tela.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const ler = (rel: string) => readFileSync(path.resolve(__dirname, "../../", rel), "utf8");
const PAGE = ler("client/src/pages/versoes.tsx");

describe("1 · a gravidade vem do status da peça", () => {
  it("os quatro degraus existem, e o de baixo é o padrão de quem não reconhece", () => {
    expect(PAGE).toContain('type Gravidade = "aprovacao" | "liberada" | "producao" | "impressa";');
    expect(PAGE).toContain('const gravidadeDe = (status: string): Gravidade => GRAVIDADE[status] ?? "aprovacao";');
    // os status que a peça de fato tem no app estão mapeados
    for (const s of ["awaiting_sponsor_approval", "sponsor_approved", "ready_for_production", "inProduction", "produced", "delivered"]) {
      expect(PAGE).toContain(`${s}:`);
    }
  });

  it("o selo de status diz a CONSEQUÊNCIA, não só o estado", () => {
    expect(PAGE).toContain("data-testid={`selo-status-${p.id}`}");
    expect(PAGE).toContain("A peça já foi para a gráfica — divergência aqui é arte impressa errada.");
    expect(PAGE).toContain("A peça ainda está em aprovação — divergência aqui é conserto barato.");
    // ponto de 6px na cor do estado, como o resto da tela faz
    expect(PAGE).toContain('style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: gv.cor, flexShrink: 0 }}');
  });

  it("depois da gráfica o selo de divergência ENDURECE — dois problemas, dois nomes", () => {
    expect(PAGE).toContain("const impressaErrada = p.divergente && jaFoiParaGrafica(p.status);");
    expect(PAGE).toContain("produzida na versão errada");
    // vermelho sólido, e a borda do cartão sobe de tom
    expect(PAGE).toContain('color: "#ffffff", backgroundColor: "#b91c1c"');
    expect(PAGE).toContain('impressaErrada ? "#fca5a5" : p.divergente ? "#fecaca" : T.border');
    // e o nome ameno continua existindo para o caso ainda corrigível
    expect(PAGE).toContain("aprovou outra versão");
  });
});

describe("2 · a faixa de resolução", () => {
  it("só aparece quando há o que resolver", () => {
    expect(PAGE).toContain("if (!divergente && !ambigua && !parada) return null;");
    expect(PAGE).toContain("data-testid={`faixa-resolucao-${p.id}`}");
  });

  it("o texto sai dos DADOS: nome, versão, data e dias parados", () => {
    expect(PAGE).toContain("${divergente.nome} aprovou a ${vDele}, e a peça está na ${vAgora}");
    expect(PAGE).toContain("Parada há ${p.diasPendente} dias esperando ${parada.nome}");
    expect(PAGE).toContain("Não dá para afirmar qual versão ${ambigua!.nome} decidiu");
    expect(PAGE).toContain("Dá para parar a produção enquanto ainda há tempo.");
    expect(PAGE).toContain("Confira o registro de entrega antes de decidir o que fazer.");
  });

  it("as ações reaproveitam mutações existentes — nenhuma rota nova", () => {
    expect(PAGE).toContain("`/api/items/${p.id}/update-thumb`");
    expect(PAGE).toContain("`/api/items/${p.id}/sponsor-approvals/${sponsorId}/revert`");
    expect(PAGE).not.toMatch(/api\/(cobranca|lembrete|notificar-patrocinador)/);
  });

  it("o botão segue a MESMA régua de papel do servidor, em vez de existir para dar 409", () => {
    expect(PAGE).toContain('const podeTrocarArte = papel === "arte" || papel === "admin";');
    expect(PAGE).toContain('|| (papel === "atendimento" && (p.status === "awaiting_sponsor_approval" || p.status === "sponsor_approved"));');
    expect(PAGE).toContain("if (podeRevogar) {");
  });

  it("voltar para a versão aprovada PERGUNTA antes — descarta a arte atual", () => {
    expect(PAGE).toContain("data-testid={`confirma-voltar-${p.id}`}");
    expect(PAGE).toContain("data-testid={`button-resolucao-confirmar-${p.id}`}");
    expect(PAGE).toContain("data-testid={`button-resolucao-cancelar-${p.id}`}");
    expect(PAGE).toContain("será substituída pela que {divergente.nome} aprovou");
  });

  it("NÃO existe botão de cobrar patrocinador — decisão do dono de 21/08", () => {
    // O app não fala com o patrocinador; quem fala é o Atendimento, fora do
    // sistema. A pendência leva ao lugar onde a resposta é registrada.
    // "diasParaCobrar" é campo do contrato do servidor; o que não pode existir
    // é um botão de cobrança dirigido ao patrocinador.
    expect(PAGE).not.toMatch(/rotulo: `Cobrar/);
    expect(PAGE).not.toContain("button-resolucao-cobrar");
    expect(PAGE).toContain("testId: `button-resolucao-atendimento-${p.id}`");
    expect(PAGE).toContain("Quando a resposta chegar, é o Atendimento que a registra.");
  });

  it("a versão indeterminada manda para a trilha, que tem a ordem exata dos registros", () => {
    expect(PAGE).toContain("testId: `button-resolucao-trilha-${p.id}`");
    expect(PAGE).toContain("data-testid={a.testId}");
    // o Histórico casa por displayId, não por id — o `?peca=` vai sem o "#".
    expect(PAGE).toContain("`/historico?peca=${encodeURIComponent(p.displayId.replace(/^#/, \"\"))}`");
  });

  it("contraste do texto miúdo nas faixas", () => {
    // #7f1d1d sobre #fef2f2 = 8,9:1 · #78350f sobre #fffbeb = 9,4:1
    expect(PAGE).toContain('texto: "#7f1d1d"');
    expect(PAGE).toContain('texto: "#78350f"');
  });

  it("alvo de 44px no celular", () => {
    expect(PAGE).toContain("const alturaAcao = isMobile ? 44 : 32;");
  });
});

describe("3 · lado a lado no comparador", () => {
  it("o segmented existe e some no celular, onde os painéis empilhariam", () => {
    expect(PAGE).toContain('data-testid="segmented-modo-comparador"');
    expect(PAGE).toContain("{!isMobile && total > 1 && (");
    expect(PAGE).toContain("const ladoALado = modo === \"lado\" && !isMobile && total > 1;");
  });

  it("a direita é sempre a arte que está na peça HOJE — que é a pergunta da tela", () => {
    expect(PAGE).toContain("const iDireita = iAtual >= 0 ? iAtual : total - 1;");
    expect(PAGE).toContain('data-testid={`painel-lado-${lado}`}');
  });

  it("quando o foco JÁ é a atual, a esquerda mostra a anterior", () => {
    // comparar a atual com ela mesma não diz nada.
    expect(PAGE).toContain("const iEsquerda = modo === \"lado\" && indice === iAtual && total > 1");
    expect(PAGE).toContain("? (indice - 1 + total) % total");
  });

  it("cada painel diz quem aprovou aquela versão", () => {
    expect(PAGE).toContain("const quemAprovou = (indiceDaVersao: number) => {");
    expect(PAGE).toContain('return "Nenhuma aprovação nesta versão";');
    expect(PAGE).toContain("aprovou esta");
  });

  it("as setas continuam funcionando e movem o painel da esquerda", () => {
    expect(PAGE).toContain('if (e.key === "ArrowLeft")');
    expect(PAGE).toContain('if (e.key === "ArrowRight")');
    expect(PAGE).toContain("const ativo = i === (ladoALado ? iEsquerda : indice);");
  });
});

describe("o que NÃO podia mudar continua de pé", () => {
  it("a tela abre pela exceção", () => {
    expect(PAGE).toContain('return f === "todas" || f === "sem-patrocinador" ? f : "atencao";');
    expect(PAGE).toContain("Nada precisa de atenção neste recorte");
  });

  it("registro e inferência continuam separados, e o comparador congela ao sair", () => {
    expect(PAGE).toContain('data-testid="text-confianca-versoes"');
    expect(PAGE).toContain("inferida pela data");
    expect(PAGE).toContain("versão indeterminada");
    expect(PAGE).toContain("<FreezeWhileClosing open={aberto}>");
  });

  it("a régua só cresce quando há o que comparar", () => {
    expect(PAGE).toContain("const varias = p.versoes.length > 1;");
    expect(PAGE).toContain("data-testid={`versao-unica-${p.id}`}");
  });

  it("os testids que outras telas e testes conhecem continuam lá", () => {
    for (const t of [
      'data-testid="title-versoes"', 'data-testid="resumo-versoes"', 'testId="resumo-divergentes"',
      'data-testid="input-busca-versoes"', 'data-testid="link-exportar-versoes"',
      "data-testid={`selo-divergente-${p.id}`}", "testId={`selo-parada-${p.id}`}",
      'data-testid="img-comparador"', 'data-testid="button-comparador-anterior"',
      "data-testid={`button-reenviar-aviso-${eventId}`}", 'data-testid="skeleton-versoes"',
    ]) {
      expect(PAGE).toContain(t);
    }
  });
});
