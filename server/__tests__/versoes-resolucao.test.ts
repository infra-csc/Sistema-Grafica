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

describe("2 · a faixa do achado", () => {
  it("só aparece quando há o que dizer", () => {
    expect(PAGE).toContain("if (!divergente && !ambigua) return null;");
    expect(PAGE).toContain("data-testid={`faixa-resolucao-${p.id}`}");
  });

  it("o texto sai dos DADOS: nome, versão e data", () => {
    expect(PAGE).toContain("${divergente.nome} aprovou ${vDele}, e a peça está na ${vAgora}");
    expect(PAGE).toContain("Não dá para afirmar qual versão ${ambigua!.nome} decidiu");
    expect(PAGE).toContain("Dá para parar a produção enquanto ainda há tempo.");
    expect(PAGE).toContain("Confira o registro de entrega antes de decidir o que fazer.");
  });

  it("A TELA NÃO EXECUTA: os botões de ação saíram (decisão do dono, 24/08)", () => {
    // Ela nasceu com "Voltar para a vN" e "Pedir aprovação da vN". O dono
    // cortou os dois: esta tela AUDITA. Quem troca a arte é a Arte; quem
    // reabre aprovação é o Atendimento — nas telas onde essas ações têm
    // contexto, permissão e histórico. Painel que também executa é painel em
    // que ninguém confia para só olhar.
    expect(PAGE).not.toContain("Pedir aprovação");
    expect(PAGE).not.toContain("Voltar para a");
    expect(PAGE).not.toContain("/update-thumb");
    expect(PAGE).not.toContain("/revert");
    expect(PAGE).not.toContain("button-resolucao-");
  });

  it("o que fica é o caminho para onde a coisa se resolve", () => {
    expect(PAGE).toContain("data-testid={`link-abrir-peca-${p.id}`}");
    expect(PAGE).toContain("onde a Arte troca a arte e o Atendimento reabre a aprovação");
  });

  it("prazo não mora nesta tela", () => {
    // Cobrar decisão parada é do Atendimento e da Gestão de Prazos: duas
    // telas cobrando a mesma pendência com contas próprias é como um número
    // passa a discordar do outro.
    expect(PAGE).not.toContain("Parada há");
    expect(PAGE).not.toContain("selo-parada-");
    expect(PAGE).not.toContain("diasPendente");
  });

  it("contraste do texto miúdo nas faixas", () => {
    // #7f1d1d sobre #fef2f2 = 8,9:1 · #78350f sobre #fffbeb = 9,4:1
    expect(PAGE).toContain('texto: "#7f1d1d"');
    expect(PAGE).toContain('texto: "#78350f"');
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
      "data-testid={`selo-divergente-${p.id}`}", "data-testid={`selo-status-${p.id}`}",
      'data-testid="img-comparador"', 'data-testid="button-comparador-anterior"',
      "data-testid={`button-reenviar-aviso-${eventId}`}", 'data-testid="skeleton-versoes"',
    ]) {
      expect(PAGE).toContain(t);
    }
  });
});
