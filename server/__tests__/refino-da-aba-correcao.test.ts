// ─────────────────────────────────────────────────────────────────────────────
// O REFINO DA ABA CORREÇÃO (Módulo Arte).
//
// Diff de estilo — o tipo de mudança que nenhum teste de comportamento percebe
// sendo desfeita. O que este arquivo guarda:
//
//   1. OS TESTIDS. Este refino tinha uma regra explícita: nada de regra, rota,
//      mutation, `disabled` ou `data-testid` muda. Um refino visual que quebra
//      um seletor quebra tudo o que se apoia nele.
//
//   2. OS GRADIENTES ESCUROS. Eram dois por card (um diagonal quase preto e um
//      brilho radial vermelho por cima) mais o cabeçalho do modal, com todo o
//      texto em branco translúcido — 0,55 na linha da peça, 0,2 no chevron. É
//      como se apaga texto sem admitir que ele ficou ilegível, numa tela cuja
//      função é a pessoa LER o que o patrocinador recusou.
//
//   3. O CONTEXTO DO CARD. O card dizia o que foi recusado e por quem, e não
//      dizia de qual evento é nem quando a peça sai — que é o que decide a
//      ordem do trabalho numa fila de correções. O prazo tem de vir do mesmo
//      `phaseDeadline` das outras abas; conta nova aqui seria um terceiro
//      número de prazo na mesma tela.
//
//   4. O BOTÃO TRAVADO MUDO. Ele ficava cinza sem dizer o que falta, e as duas
//      razões possíveis moram em pontos distantes do modal (a zona de upload em
//      cima, a lista de patrocinadores embaixo).
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { fonteDaArte, lerDaRaiz } from "./fonte-das-telas-da-arte";

// A tela da Arte foi dividida (página + components/arte/): a aba mora em
// aba-correcao.tsx e cartao-da-correcao.tsx, o modal em dialogo-correcao.tsx.
const arte = fonteDaArte();

/** Tira comentários antes de afirmar sobre o CÓDIGO. */
const codigo = arte
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^[ \t]*\/\/.*$/gm, "");

describe("1. os seletores da Correção continuam os mesmos", () => {
  const TESTIDS = [
    "card-correcao-", "button-open-correcao-", "filter-correcao-sponsor-",
    // `checkbox-correcao-sponsor-` saiu: o reenvio é derivado, não escolhido
    // (painel-reenvio / linha-reenvio-). Ver arte-nota-10.test.ts.
    "button-submit-correcao", "painel-reenvio", "linha-reenvio-",
    "button-remove-correcao-thumb", "uploader-correcao-thumb",
    "button-clear-filters-correcao", "correcao-sem-patrocinador-",
  ];
  for (const t of TESTIDS) {
    it(`${t} continua existindo`, () => {
      expect(arte).toContain(t);
    });
  }
});

describe("2. nenhum gradiente escuro sobrou na Correção", () => {
  it("o card e o modal não têm mais faixa preta", () => {
    expect(codigo).not.toContain("#1c0a0a");
    expect(codigo).not.toContain("#2d1010");
  });

  it("nem o brilho radial vermelho por cima dela", () => {
    expect(codigo).not.toContain("radial-gradient(ellipse at 90% 50%");
    expect(codigo).not.toContain("radial-gradient(ellipse at 80% 20%");
  });

  it("e o texto do cabeçalho do card deixou de ser branco translúcido", () => {
    expect(codigo).not.toContain("rgba(252,165,165,0.6)");
    expect(codigo).not.toContain("rgba(252,165,165,0.75)");
    expect(codigo).not.toContain("rgba(252,165,165,0.8)");
  });
});

describe("3. o card diz de qual evento é e quando sai", () => {
  it("usa o phaseDeadline das outras abas, não uma conta nova", () => {
    expect(arte).toContain('phaseDeadline(item.event, "correcao", hoje)');
  });

  it("e mostra a data de saída do evento", () => {
    expect(arte).toContain("item.event?.truckDepartureDate ? toUTCDisplayDate(item.event.truckDepartureDate)");
  });
});

describe("4. o que estava mudo passou a falar", () => {
  it("o botão travado diz o que falta", () => {
    expect(arte).toContain("Suba a nova versão para liberar o envio.");
    expect(arte).toContain("Nenhum patrocinador pendente para receber o reenvio — todos já aprovaram.");
  });

  it("o carregando diz o que carrega", () => {
    expect(arte).toContain("Carregando a fila de correção…");
  });

  it("e o modo consulta explica o botão ausente", () => {
    expect(arte).toContain("Modo consulta.");
  });
});

describe("5. o motivo da recusa ficou legível", () => {
  it("sem itálico — as aspas já marcam a citação", () => {
    // Os dois corpos de motivo (card e modal) eram itálico em 12px sobre rosa.
    expect(codigo).not.toContain("fontStyle: 'italic'");
    expect(codigo).not.toContain("fontStyle: approval.rejectionReason ? 'italic' : 'normal'");
  });

  it("e o nome de quem recusou não é mais cortado no primeiro nome", () => {
    expect(codigo).not.toContain("approval.rejectedBy.split(' ')[0]");
  });
});

describe("6. os alvos da aba", () => {
  it("as pílulas de patrocinador têm 36px", () => {
    // 36 no mouse, 44 no dedo (alvo()).
    expect(arte).toContain("height: alvo(36, dedo), padding: '0 13px', borderRadius: 999");
  });

  it("e o card não tem mais sombra vermelha dupla", () => {
    expect(codigo).not.toContain("rgba(186,26,26,0.07)");
  });
});

describe("7. o que a segunda passada fechou", () => {
  it("nenhum segmentado ficou com botão de 22px dentro de trilho de 36", () => {
    // Na passada anterior eu subi os TRÊS trilhos e corrigi só DOIS dos três
    // estilos de botão — o de "Prioridade" ficou descolado dentro do próprio
    // trilho. Erro de contagem, não de desenho.
    expect(codigo).not.toContain("height: 22, padding: '0 10px', borderRadius: 999");
  });

  it("o erro de carga é uma caixa, não um vazio", () => {
    // Sem contorno, "não consegui buscar" lia como "não há nada" — e a
    // diferença entre as duas é a diferença entre seguir o dia e recarregar.
    // Agora é a <EstadoErro> do design system (caixa com contorno, role=alert).
    const erro = lerDaRaiz("client/src/components/arte/erro-de-carga.tsx");
    expect(erro).toContain("export function ErroDeCarga(");
    expect(erro).toContain("<div data-testid={testId}");
    expect(erro).toContain("<EstadoErro");
    expect(erro).toContain("aoTentarDeNovo={tentarDeNovo}");
  });

  it("e o círculo do upload troca sombra por hairline", () => {
    // Escopo: a MESMA sombra e usada por outro modal fora deste handoff, entao
    // a asserção é sobre o círculo, não sobre o valor solto no arquivo.
    expect(arte).toContain("borderRadius: '50%', backgroundColor: T.surface, border: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 6");
  });
});

describe("8. quem encolhe primeiro no cabeçalho do card", () => {
  // A ordem estava invertida: o GRUPO era o único protegido (`flexShrink: 0`) e
  // o TIPO encolhia junto com a descrição. Numa linha apertada dava
  // "PLACAS DIVERSAS › P… — Cheque Premiação R…" — o nome da peça reduzido a
  // uma letra enquanto o rótulo do grupo aparecia inteiro.
  //
  // Migração para o design system (23/09): tipo e descrição deixaram de
  // truncar numa linha só — quebram em até DUAS linhas (o texto inteiro no
  // `title` não existe para quem toca). O grupo, rótulo curto, fica numa
  // linha própria acima e é o único que ainda pode ganhar reticência.
  const cartao = lerDaRaiz("client/src/components/arte/cartao-da-correcao.tsx");
  const cab = cartao.slice(cartao.indexOf('<span title={item.type}'), cartao.indexOf('<SeloKit peca={item} style={{ flexShrink: 0 }} />'));
  const duasLinhas = "display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical'";

  it("o tipo da peça não vira reticência numa linha só", () => {
    const tipo = cab.slice(0, cab.indexOf("{item.type}</span>"));
    expect(tipo).toContain(duasLinhas);
    expect(tipo).not.toContain("whiteSpace: 'nowrap'");
  });

  it("a descrição também quebra em duas linhas", () => {
    const desc = cab.slice(cab.indexOf('<span title={item.description}'), cab.indexOf("{item.description}</span>"));
    expect(desc).toContain(duasLinhas);
    expect(desc).not.toContain("whiteSpace: 'nowrap'");
  });

  it("e o grupo deixou de ser o único protegido", () => {
    expect(codigo).not.toContain("fontWeight: 600, flexShrink: 0 }}>{groupLabel}");
  });

  it("os três mantêm o title, porque os três podem truncar", () => {
    expect(arte).toContain("<span title={groupLabel}");
    expect(arte).toContain("<span title={item.type}");
    expect(arte).toContain("<span title={item.description}");
  });
});
