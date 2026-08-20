// ─────────────────────────────────────────────────────────────────────────────
// A FICHA DA PEÇA: PALETA DO APP, E LEGÍVEL.
//
// ── O defeito original, contado uma vez ──
//
// O modal da peça — aberto por CINCO telas — trazia uma paleta estrangeira: 60
// cores distintas, mais que o Painel Geral inteiro (49), com acentos de outro
// sistema (#006398 e #ff5449 são tokens clássicos do Material 3).
//
// Duas eram quase-clones do que o app já tinha, a 6 unidades de distância —
// indistinguíveis lado a lado:
//
//   laranja de ação ... modal #fd761a  vs  app #f97316
//   quase-preto ....... modal #1a1c1c  vs  app #1c1917
//
// E o laranja não era só redundante: #fd761a dá 2,70 sobre branco. A régua da
// casa já proíbe o #f97316 como cor de texto por esse motivo exato, e o modal
// usava um clone dele — inclusive na saída do caminhão, o dado que manda na
// operação (o Painel Geral inteiro é ordenado por ele). O dado mais importante
// era o menos legível da tela.
//
// A regra que fica: componente compartilhado não tem paleta própria. Quando
// tem, ele carrega o desvio para todas as telas que o abrem.
//
// ── O que mudou na revisão da ficha ──
//
// A saída do caminhão SUBIU para o cabeçalho escuro e passou a ser #fdba74 —
// laranja claro sobre fundo escuro, 8,55. O #c2410c continua sendo o laranja
// de ação da ficha, agora sobre fundo claro.
//
// O chip "Reprov. Patrocinador" (#ff5449) SAIU do cabeçalho: a reprovação
// deixou de ser um selo no topo e virou a frase da faixa de resolução, com o
// motivo escrito por extenso. Este arquivo deixou de exigir aquele hexadecimal
// e passou a exigir o que ele protegia: que a reprovação continue anunciada, e
// numa cor medida contra o fundo em que ela de fato aparece.
//
// A lição que sobreviveu inteira: minha primeira medição reprovou os chips do
// cabeçalho porque comparei contra branco — fundo errado. Cor só se julga
// junto do que está atrás dela. Por isso as tabelas abaixo trazem sempre o par.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const modal = readFileSync(path.resolve(__dirname, "../../client/src/components/item-details-dialog.tsx"), "utf8");

/**
 * O arquivo SEM os comentários.
 *
 * Toda asserção de AUSÊNCIA se faz aqui. Já aconteceu quatro vezes de um
 * teste destes reprovar por causa do próprio comentário que explicava o
 * defeito: o código estava certo, e a frase "era `max-h-[90vh]`" escrita logo
 * acima dele derrubava o teste. Presença continua sendo medida no arquivo
 * inteiro — comentário que documenta uma cor não a torna usada, mas também
 * não atrapalha quem procura por ela.
 */
const codigo = modal
  .replace(/\r\n/g, "\n")   // `.` não casa \r em JS — sem isto, nenhum // é removido
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .map(l => l.replace(/^\s*\/\/.*$/, ""))
  .join("\n");

function luminancia(hex: string): number {
  const h = hex.replace("#", "");
  const c = [0, 2, 4]
    .map(i => parseInt(h.slice(i, i + 2), 16) / 255)
    .map(v => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

function contraste(a: string, b: string): number {
  const [x, y] = [luminancia(a), luminancia(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** Branco com alfa, achatado contra o fundo — é assim que a tela o exibe. */
function brancoComAlfa(alfa: number, fundo: string): string {
  const h = fundo.replace("#", "");
  const canais = [0, 2, 4].map(i => Math.round(255 * alfa + parseInt(h.slice(i, i + 2), 16) * (1 - alfa)));
  return "#" + canais.map(n => n.toString(16).padStart(2, "0")).join("");
}

describe("o modal não tem paleta própria", () => {
  it("o laranja estrangeiro sumiu", () => {
    expect(codigo).not.toContain("#fd761a");
  });

  it("o quase-preto estrangeiro sumiu do texto", () => {
    expect(codigo).not.toContain('color: "#1a1c1c"');
  });

  it("o laranja que ficou passa AA sobre branco", () => {
    expect(modal).toContain('#c2410c');
    expect(contraste("#c2410c", "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });

  it("nenhum laranja de baixo contraste voltou como cor de texto", () => {
    // #f97316 dá 2,80 sobre branco — a régua da casa o proíbe como texto, e
    // era dele que o clone #fd761a tinha nascido. (Como COR DE PONTO na trilha
    // do percurso ele continua valendo: ali é elemento gráfico, régua de 3:1.)
    expect(codigo).not.toContain('color: "#f97316"');
  });
});

describe("a saída do caminhão é legível", () => {
  it("o dado que ordena o app subiu para o cabeçalho e passa lá", () => {
    const i = modal.indexOf("Saída do caminhão");
    expect(i).toBeGreaterThan(-1);
    // #fdba74 sobre o extremo CLARO do gradiente do cabeçalho (#2d2926) — o
    // pior dos dois lados para uma cor clara.
    expect(contraste("#fdba74", "#2d2926")).toBeGreaterThanOrEqual(4.5);
  });
});

describe("todo texto pequeno da ficha passa em 4,5:1", () => {
  // A régua da casa: 13px ou menos exige 4,5:1 contra o fundo REAL. Cada par
  // aqui é uma decisão de cor que a ficha toma; o teste existe para que
  // nenhuma delas volte a ser tomada no olho.
  const pares: [string, string, string][] = [
    // ── título de seção ──
    // #8c7164 dá 4,31 sobre #fafaf9 e foi por isso que saiu da ficha inteira.
    ["#7a6154", "#f9f9f8", "título de seção sobre o fundo do miolo"],
    ["#7a6154", "#ffffff", "rótulo da grade de especificações"],
    // ── corpo ──
    ["#57534e", "#ffffff", "detalhe de 12px dentro dos cartões"],
    ["#1c1917", "#ffffff", "nome do patrocinador"],
    // ── faixa de resolução, nos três tons ──
    ["#9a3412", "#fff7ed", "frase da faixa em espera"],
    ["#7c2d12", "#fff7ed", "detalhe da faixa em espera"],
    ["#b91c1c", "#fef2f2", "frase da faixa reprovada"],
    ["#991b1b", "#fef2f2", "motivo da reprovação, entre aspas"],
    ["#15803d", "#f0fdf4", "frase da faixa aprovada"],
    ["#166534", "#f0fdf4", "detalhe da faixa aprovada"],
    ["#44403c", "#fafaf9", "frase da faixa neutra"],
    // ── rodapé ──
    // #78716c sobre o antigo #f5f4f1 do rodapé dava 4,36 — por isso o rodapé
    // ficou branco.
    ["#78716c", "#ffffff", "linha 'Atualizado' no rodapé"],
    ["#78716c", "#ffffff", "data e autor no percurso"],
    // ── botões ──
    ["#ffffff", "#c2410c", "texto do primário da faixa"],
    ["#ffffff", "#1c1917", "texto do primário do rodapé"],
  ];

  it.each(pares)("%s sobre %s — %s", (frente, fundo) => {
    expect(contraste(frente, fundo)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("o texto sobre o cabeçalho escuro", () => {
  // O gradiente vai de #1c1917 a #2d2926; o extremo CLARO é o pior caso para
  // uma cor clara, então é contra ele que se mede.
  const FUNDO = "#2d2926";

  it("nenhum branco translúcido abaixo de 0.55 sobrou em texto", () => {
    // 0.35 dá 3,11 — reprova. Era o alfa dos rótulos da trilha de etapas.
    expect(contraste(brancoComAlfa(0.35, FUNDO), FUNDO)).toBeLessThan(4.5);
    expect(contraste(brancoComAlfa(0.55, FUNDO), FUNDO)).toBeGreaterThanOrEqual(4.5);

    // Varre os alfas brancos que o arquivo realmente usa em `color:`.
    const usados = Array.from(modal.matchAll(/color:\s*"rgba\(255,255,255,([\d.]+)\)"/g))
      .map(m => Number(m[1]));
    expect(usados.length).toBeGreaterThan(0);
    for (const alfa of usados) {
      expect(contraste(brancoComAlfa(alfa, FUNDO), FUNDO)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("os chips claros continuam claros — não foram 'consertados' para fundo escuro", () => {
    // A pílula de reaproveitamento é o chip que sobrou no cabeçalho.
    expect(modal).toContain('color: "#4ade80"');
    expect(contraste("#4ade80", FUNDO)).toBeGreaterThanOrEqual(4.5);
    // E o alerta de prazo apertado.
    expect(contraste("#fca5a5", FUNDO)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("a estrutura que mantém cabeçalho, faixa e rodapé à vista", () => {
  it("o modal é coluna flex e o teto saiu do utilitário do Tailwind", () => {
    // Era `max-h-[90vh] overflow-y-auto` no DialogContent: o modal INTEIRO era
    // o scroller, e rolar levava embora o cabeçalho, o status e o prazo.
    expect(codigo).not.toContain("max-h-[90vh]");
    expect(modal).toContain('maxHeight: isMobile ? "calc(100dvh - 24px)" : "calc(100vh - 48px)"');
  });

  it("só o miolo rola", () => {
    expect(modal).toContain('flex: "1 1 auto", minHeight: 0, overflowY: "auto"');
  });

  it("cabeçalho, faixa e rodapé não encolhem", () => {
    // Sem isto o rodapé some antes do fim da lista quando o miolo cresce.
    // Medido POR BLOCO: `flexShrink: 0` aparece 22 vezes no arquivo, quase
    // todas em ladrilhos e ícones — contar o total não provaria nada sobre o
    // esqueleto.
    const blocoApos = (marca: string, tamanho: number) => {
      const i = modal.indexOf(marca);
      expect(i, `não achei ${marca}`).toBeGreaterThan(-1);
      return modal.slice(i, i + tamanho);
    };
    expect(blocoApos("<header", 260)).toContain("flexShrink: 0");
    expect(blocoApos('data-testid="banner-blocker"', 260)).toContain("flexShrink: 0");
    expect(blocoApos("<footer", 260)).toContain("flexShrink: 0");
  });
});

describe("a faixa de resolução responde 'o que falta' sem rolar", () => {
  it("existe e tem o testid que a identifica", () => {
    expect(modal).toContain('data-testid="banner-blocker"');
  });

  it("a ficha CONTA, não age — não há atalho de ação nela", () => {
    // Decisão do dono (20/08): só os dados. A ficha abre em cinco telas, cada
    // uma com o seu conjunto de permissões; um botão que resolve na Arte é um
    // botão que dá 403 na Gráfica. A faixa diz o que falta e quem age; quem
    // age vai à tela onde a ação vive.
    //
    // O que continua clicável é leitura ou correção do próprio dado: abrir
    // arquivo, ampliar foto, editar a especificação, reverter aprovação lançada
    // por engano (admin), fechar.
    for (const atalho of ["Cobrar aprovação", "Ver quem falta", "Ver o motivo", "mailto:"]) {
      expect(codigo, `\"${atalho}\" voltou para a ficha`).not.toContain(atalho);
    }
  });

  it("a frase nomeia quem falta e há quanto tempo", () => {
    expect(modal).toContain("falta ${pendentes[0].sponsor?.name");
    expect(modal).toContain("faltam ${pendentes.length} patrocinadores");
    expect(modal).toContain("haQuantoTempo");
  });

  it("o estado é anunciado em TEXTO, e a trilha de etapas fica decorativa", () => {
    // A trilha desenha o mesmo estado; anunciar seis etapas antes da frase que
    // resolve seria ler o índice antes do capítulo.
    expect(modal).toContain('aria-hidden="true" style={{ display: "flex", gap: 6');
    expect(modal).toContain("<DialogDescription className=\"sr-only\">");
  });
});

describe("o percurso é uma lista só", () => {
  it("as duas trilhas viraram uma", () => {
    // Rastreabilidade Temporal e Histórico mostravam os MESMOS eventos, em dois
    // formatos, um embaixo do outro.
    expect(codigo).not.toContain("Rastreabilidade Temporal");
    expect(modal).toContain('data-testid="section-percurso"');
    expect(modal).toContain('data-testid="button-percurso-expand"');
  });

  it("carimbo do item que já tem log não entra duas vezes", () => {
    expect(modal).toContain("JANELA_MESMO_EVENTO_MS");
    expect(modal).toContain("if (jaTemLog) continue;");
  });
});

describe("patrocinadores em ordem de urgência", () => {
  it("pendente primeiro, reprovado depois, aprovado por último", () => {
    const i = modal.indexOf("PESO_DO_TOM");
    expect(i).toBeGreaterThan(-1);
    const bloco = modal.slice(i, i + 200);
    // A ordem é o que o peso codifica: waiting(0) < rejected/rework(1) < approved(3).
    expect(bloco).toContain("waiting: 0");
    expect(bloco).toContain("approved: 3");
  });
});

describe("a grade de especificações não tem linha dupla", () => {
  it("as bordas são as frestas da grade, não bordas das células", () => {
    // Com borderRight/borderBottom em cada célula, a última coluna e a última
    // linha encostam na borda do cartão e desenham 2px. Aqui a separação é o
    // `gap` sobre um fundo: não existe borda para duplicar.
    const i = modal.indexOf("gridTemplateColumns: `repeat(${colunasEspec}");
    expect(i).toBeGreaterThan(-1);
    const bloco = modal.slice(i, i + 160);
    expect(bloco).toContain("gap: 1");
    expect(bloco).toContain('backgroundColor: "#ebe8e4"');
    expect(bloco).not.toContain("borderRight");
  });

  it("a última linha incompleta é fechada com vagas brancas", () => {
    // Sem elas, 5 dados em 3 colunas deixariam a sexta vaga mostrando a cor do
    // fundo da grade como um retângulo tingido.
    expect(modal).toContain("vagasVazias");
  });
});

describe("referência e arte enviada ficam lado a lado", () => {
  it("a comparação cabe numa grade que conta os panes", () => {
    // Três momentos da mesma peça, na ordem em que acontecem: o que foi
    // PEDIDO (referência), o que foi FEITO (arte) e o que SAIU DA IMPRESSORA
    // (conferência). O terceiro só existe quando há foto, então na maior parte
    // do fluxo a faixa continua com dois.
    expect(modal).toContain('panes >= 3 ? "1fr 1fr 1fr" : panes === 2 ? "1fr 1fr" : "1fr"');
    expect(modal).toContain('data-testid="link-referencia"');
  });

  it("e a comparação arte × conferência não se perdeu na troca", () => {
    // Ela existia aqui ANTES da revisão ("Arte aprovada" × "Conferido pela
    // Gráfica") e saiu junto quando a faixa virou referência × arte — sem que
    // ninguém decidisse abrir mão dela. As duas cabem.
    expect(modal).toContain('data-testid="link-conferencia"');
    expect(modal).toContain("Conferido pela gráfica");
  });
});
