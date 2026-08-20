// ─────────────────────────────────────────────────────────────────────────────
// VINCULAR PATROCINADORES: UMA TABELA, UMA SELEÇÃO, UM CONJUNTO DE AÇÕES.
//
// O defeito que este arquivo existe para impedir, contado uma vez:
//
// A tela tinha duas ABAS — "Por Item" e "Por Patrocinador" — e, por baixo,
// DUAS ÁRVORES DE JSX quase completas (≈660 e ≈500 linhas) sobre a mesma
// informação. Não eram duas vistas do mesmo trabalho: cada uma oferecia o que
// a outra não tinha.
//
//   Por Patrocinador ..... Vincular / Desvincular / Enviar
//   Por Item ............. Salvar, descartar, devolver para Criação
//
// E cada uma tinha a SUA PRÓPRIA SELEÇÃO EM LOTE: `selectedItemIds` de um
// lado, `sponsorBulkSelected` (chaveada por `itemId::sponsorId`) do outro, com
// duas barras flutuantes diferentes. Marcar peças numa aba e trocar de aba
// perdia a marcação sem aviso.
//
// Trocar de aba não deveria mudar o que dá para FAZER. O que a pessoa quer ao
// clicar em "Por Patrocinador" é AGRUPAR — ver as mesmas peças em outra ordem.
//
// A regra que fica: quando duas telas mostram a mesma coisa e diferem só no
// agrupamento, elas são uma tela com um controle de agrupamento. Duas árvores
// é como as ações divergem — não por decisão, mas porque ninguém copiou o
// botão novo para o outro lado.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const tela = readFileSync(
  path.resolve(__dirname, "../../client/src/pages/vincular-patrocinadores.tsx"),
  "utf8",
);

/**
 * A tela sem os comentários. Toda asserção de AUSÊNCIA se faz aqui: já
 * aconteceu de um teste destes reprovar por causa do próprio comentário que
 * explicava o defeito — o código certo, e a frase "era `sponsorBulkSelected`"
 * logo acima derrubando o teste.
 *
 * `.` não casa \r em JavaScript e o arquivo é CRLF: sem normalizar o fim de
 * linha primeiro, a regex que apaga comentário de linha não casa nada — ela
 * termina numa âncora de fim de linha, e o \r fica na frente dela.
 */
const codigo = tela
  .replace(/\r\n/g, "\n")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .map(l => l.replace(/^\s*\/\/.*$/, ""))
  .join("\n");

function contraste(a: string, b: string): number {
  const lum = (h: string) => {
    const c = [1, 3, 5]
      .map(i => parseInt(h.slice(i, i + 2), 16) / 255)
      .map(v => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

describe("as duas árvores viraram uma", () => {
  it("não há mais abas de visão", () => {
    expect(codigo).not.toContain('viewMode');
    expect(codigo).not.toContain('"por-item"');
    expect(codigo).not.toContain('role="tablist"');
  });

  it("o agrupamento é um radiogroup", () => {
    expect(tela).toContain('data-testid="segmented-group-by"');
    expect(tela).toContain('role="radiogroup"');
    // O testid é montado por template (`group-by-${valor}`), então um grep
    // literal não o encontra — mas o DOM o recebe. Provamos a fonte dos dois
    // valores em vez da string final.
    expect(tela).toContain("data-testid={`group-by-${valor}`}");
    expect(tela).toContain("['evento',       'Evento',       Calendar]");
    expect(tela).toContain("['patrocinador', 'Patrocinador', Building2]");
  });

  it("a segunda seleção em lote sumiu", () => {
    // Era `sponsorBulkSelected`, chaveada por `itemId::sponsorId`, com barra
    // flutuante própria. Marcar peças numa aba e trocar de aba perdia tudo.
    for (const morto of [
      "sponsorBulkSelected",
      "selectedSponsorItemIds",
      "openSendModalForBulk",
      "sponsorGroupedData",
      "groupSelectedBySponsor",
    ]) {
      expect(codigo, `\`${morto}\` voltou`).not.toContain(morto);
    }
  });

  it("a linha é uma função só — é o que garante o mesmo conjunto de ações", () => {
    // CRITÉRIO 1: trocar Evento ↔ Patrocinador não muda o que dá para fazer
    // por linha. A prova estrutural é esta: existe UMA função que desenha a
    // linha, e os dois agrupamentos chamam ela.
    expect(tela).toContain("const renderLinhaDaPeca = (item: any, chips: any[], eventSponsors: any[])");
    expect(tela).toContain("renderLinhaDaPeca(item, chipsDoEscopo, eventSponsors)");
    // O agrupamento muda só o ESCOPO DOS CHIPS.
    expect(tela).toContain("const chipsDoEscopo = sponsor ? [sponsor] : eventSponsors;");
  });

  it("e o cabeçalho da coluna acompanha o escopo", () => {
    expect(tela).toContain("{sponsor ? 'Vínculo' : 'Patrocinadores'}");
  });
});

describe("os chips de status são facetas de verdade", () => {
  // CRITÉRIO 2: a contagem de cada chip é o número de linhas que o clique
  // entrega. O jeito de garantir isso não é conferir o número — é conferir de
  // que POOL ele sai.
  it("a contagem sai do pool SEM a dimensão status", () => {
    const i = tela.indexOf("const contagemPorEstado");
    expect(i).toBeGreaterThan(-1);
    const bloco = tela.slice(i, i + 420);
    expect(bloco).toContain('poolSemDimensao("status")');
    // Se saísse de fullyFilteredItems, clicar em "Pendente" zeraria os outros
    // três chips: a contagem passaria a ser do recorte, não do que ele entrega.
    expect(bloco).not.toContain("fullyFilteredItems");
  });

  it("cada chip existe e o clique alterna o filtro", () => {
    // Mesmo caso do agrupamento: o testid vem de template.
    expect(tela).toContain("data-testid={`chip-status-${estado.toLowerCase()}`}");
    for (const estado of ["PENDENTE", "RASCUNHO", "PRONTO", "ENVIADO"]) {
      expect(tela, `o estado ${estado} sumiu da barra`).toContain(`['${estado}',`);
    }
    expect(tela).toContain("const alternarStatus = (estado: string)");
    expect(tela).toContain("aria-pressed={marcado}");
  });

  it("situação sem nenhuma peça não vira um chip que devolve lista vazia", () => {
    expect(tela).toContain("if (n === 0 && !marcado) return null;");
  });

  it("o menu de Status saiu — dois lugares para o mesmo recorte divergiriam", () => {
    expect(codigo).not.toContain("select-status-filter");
    expect(codigo).not.toContain("statusFilterOptions");
  });
});

describe("a linha da peça cabe numa linha", () => {
  it("são cinco colunas, não seis", () => {
    // ID e Peça eram colunas separadas; "Detalhes" empilhava Qtd e m².
    // `<thead` sem o `>`: a tag carrega um style (ela some no celular).
    const i = tela.indexOf("<thead");
    expect(i).toBeGreaterThan(-1);
    const cabecalho = tela.slice(i, tela.indexOf("</thead>", i));
    // `/<th/` casaria também o próprio `<thead>` — o espaço é o que separa a
    // tag da coluna da tag do cabeçalho.
    const ths = cabecalho.match(/<th /g) ?? [];
    expect(ths.length).toBe(5);
    expect(cabecalho).toContain(">Peça<");
    expect(cabecalho).toContain(">Qtd · m²<");
    expect(cabecalho).not.toContain(">Detalhes<");
    expect(cabecalho).not.toContain("Vínculos Ativos");
  });

  it("a ação de cada estado tem RÓTULO, não só ícone", () => {
    // CRITÉRIO 3. Eram um disquete e um avião de papel de 13px, com o
    // significado só no `title` — e a diferença entre salvar e ENVIAR (que
    // tira a peça da tela) ficava por conta de quem adivinhasse.
    const salvar = tela.indexOf('data-testid={`button-save-item-${item.id}`}');
    expect(salvar).toBeGreaterThan(-1);
    expect(tela.slice(salvar, salvar + 500)).toContain("Salvar");
    const enviar = tela.indexOf('data-testid={`button-send-item-${item.id}`}');
    expect(enviar).toBeGreaterThan(-1);
    expect(tela.slice(enviar, enviar + 500)).toContain("Enviar");
  });

  it("a regra vale para TODA ação da linha, inclusive as que voltarem depois", () => {
    // Esta asserção nasceu de um escorregão: "Descartar alterações" foi
    // devolvido à linha depois da revisão e voltou como um `X` de 13px sem
    // texto — exatamente o defeito que a revisão tinha acabado de tirar dali.
    //
    // Devolver uma capacidade com o desenho velho é meio caminho: a capacidade
    // volta e a inconsistência volta junto. A lista abaixo é o contrato — quem
    // acrescentar uma ação na linha acrescenta o rótulo dela aqui.
    const acoesDaLinha: [string, string][] = [
      ["button-save-item-", "Salvar"],
      ["button-discard-item-", "Descartar"],
      ["button-send-item-", "Enviar"],
    ];
    for (const [testid, rotulo] of acoesDaLinha) {
      const i = tela.indexOf(testid);
      expect(i, `${testid} sumiu da linha`).toBeGreaterThan(-1);
      expect(
        tela.slice(i, i + 700),
        `a ação ${testid} perdeu o rótulo "${rotulo}" — ícone sem texto na linha só vale para o menu`,
      ).toContain(rotulo);
    }
  });

  it("e o chip Todos usa a casca dos chips de marca, não a da árvore antiga", () => {
    // Ele voltou com fundo #f5f4f1 e sem ponto — o visual que tinha na aba
    // removida. Ao lado dos chips redesenhados ele se lia como outro sistema.
    const i = tela.indexOf("data-testid={`btn-select-all-${item.id}`}");
    expect(i).toBeGreaterThan(-1);
    // Janela larga: entre o testid e o ponto cabe o style inteiro mais o
    // comentário que explica a casca.
    const bloco = tela.slice(i, i + 1600);
    expect(bloco).toContain("borderRadius: 999");
    expect(bloco).toContain("width: 7, height: 7");
    expect(bloco).not.toContain("#f5f4f1");
  });

  it("as ações secundárias saíram dos links sublinhados para um menu", () => {
    // "sem pat." APAGA os patrocinadores da peça, e era um link de 11px em
    // cinza, indistinguível de texto morto.
    expect(codigo).not.toContain("sem pat.");
    expect(codigo).not.toContain("reaprov.");
    expect(tela).toContain("menu-row-actions-");
    expect(tela).toContain("Marcar sem patrocinador");
    expect(tela).toContain("Devolver para Criação");
    // Esc fecha e devolve o foco ao gatilho — sem isso o foco cai no <body> e
    // o teclado recomeça do topo da tabela.
    expect(tela).toContain("if (e.key !== 'Escape') return;");
    expect(tela).toContain('[data-testid="menu-row-actions-${item.id}"]');
  });

  it("a cor de estado vai na borda, não no fundo da linha", () => {
    // Fundo colorido competia com os chips, que também são coloridos — e chip
    // de marca sobre fundo tingido perde a cor que o identifica.
    expect(tela).toContain("const corDaBorda = selecionada");
    expect(tela).toContain("borderLeft: `3px solid ${corDaBorda}`");
  });

  it("peça enviada mostra só o que ficou vinculado, sem clique", () => {
    expect(tela).toContain("Peça já enviada — vínculo travado");
  });
});

describe("cor de marca em texto de 12px", () => {
  it("passa por darkenToContrast em vez de ir crua para a tela", () => {
    // A cor da marca é o que faz a tabela legível de longe — uniformizar tudo
    // para laranja resolveria o contraste e destruiria a leitura. Escurecer só
    // o necessário mantém as duas coisas.
    expect(tela).toContain("darkenToContrast(marca, '#ffffff', 4.5)");
  });

  it("e o caso que motivou a regra de fato reprovava", () => {
    // #0891b2 (cyan-600) sobre branco dá 3,3 — falha em 12px.
    expect(contraste("#0891b2", "#ffffff")).toBeLessThan(4.5);
    expect(contraste("#0e7490", "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });
});

describe("nenhum texto pequeno abaixo de 4,5:1", () => {
  // CRITÉRIO 7. Cada par é uma decisão de cor que a tela toma.
  const pares: [string, string, string][] = [
    // #746e69 sobre #fafaf9 dava 4,4 — era a cor dos cabeçalhos de coluna.
    ["#7a6154", "#fafaf9", "cabeçalho de coluna sobre o thead"],
    // #746e69 na descrição da peça sobre branco: 4,43.
    ["#57534e", "#ffffff", "descrição da peça e detalhe de 12px"],
    ["#78716c", "#ffffff", "displayId e data/hora em DM Mono"],
    ["#44403c", "#ffffff", "chip de status desmarcado"],
    ["#9a3412", "#fff7ed", "botão Salvar da linha"],
    ["#166534", "#f0fdf4", "botão Enviar da linha"],
    ["#92400e", "#fffbeb", "selo Sem patrocinador"],
    ["#ffffff", "#1c1917", "chip de status marcado"],
    ["#1c1917", "#ffffff", "tipo da peça"],
    // Sobre o gradiente do cabeçalho de grupo, medido no extremo CLARO
    // (#2d2926), que é o pior caso para uma cor clara. #a8a29e é decorativo
    // sobre branco (2,5) e passa aqui — cor só se julga junto do que está
    // atrás dela.
    ["#a8a29e", "#2d2926", "meta do cabeçalho de grupo"],
    ["#4ade80", "#2d2926", "grupo 100% vinculado"],
    ["#fdba74", "#2d2926", "ladrilho e barra do cabeçalho de grupo"],
  ];

  it.each(pares)("%s sobre %s — %s", (frente, fundo) => {
    expect(contraste(frente, fundo)).toBeGreaterThanOrEqual(4.5);
  });

  it("as cores que de fato reprovam continuam fora", () => {
    expect(contraste("#8c7164", "#fafaf9")).toBeLessThan(4.5);
    expect(contraste("#a8a29e", "#ffffff")).toBeLessThan(4.5);
  });

  it("MEDIÇÃO: o #746e69 não reprovava — a troca foi por legibilidade, não por AA", () => {
    // Fica registrado porque o contrário foi afirmado ao pedir esta revisão:
    // "#746e69 em descrição de peça (4,4:1)". Medido, ele dá 5,03 sobre branco
    // e 4,81 sobre #fafaf9 — passa nos dois. A descrição foi para #57534e
    // assim mesmo (7,63), que é o tom que o resto do app usa em texto
    // secundário, mas ninguém precisa correr atrás disto como se fosse defeito
    // de acessibilidade.
    expect(contraste("#746e69", "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(contraste("#746e69", "#fafaf9")).toBeGreaterThanOrEqual(4.5);
  });
});

describe("a frase de resolução", () => {
  it("substitui os três cartões de contagem", () => {
    expect(tela).toContain('data-testid="frase-resolucao"');
    expect(codigo).not.toContain("Progresso de Envio");
    expect(codigo).not.toContain("Associe patrocinadores a cada item");
  });

  it("concorda singular e plural nas quatro variantes", () => {
    const i = tela.indexOf("const fraseDeResolucao");
    const bloco = tela.slice(i, i + 1200);
    expect(bloco).toContain('n === 1 ? "peça" : "peças"');
    expect(bloco).toContain('pend === 1 ? "não tem" : "não têm"');
    expect(bloco).toContain('rasc === 1 ? "rascunho espera" : "rascunhos esperam"');
    expect(bloco).toContain('pron === 1 ? "pronta" : "prontas"');
    expect(bloco).toContain("Tudo enviado à Arte. Nada pendente nesta tela.");
  });
});

describe("o botão de envio comunica o impedimento", () => {
  it("a contagem entrou no rótulo", () => {
    expect(tela).toContain("`Enviar ${contextStatusCounts.PRONTO} para Arte`");
  });

  it("e a contagem dele sai do que vai de fato sair", () => {
    // Esta é a contagem que NÃO deve virar faceta: o botão AGE sobre as peças
    // filtradas, então tem de contar `fullyFilteredItems`.
    const i = tela.indexOf("const prontoItems = fullyFilteredItems.filter");
    expect(i).toBeGreaterThan(-1);
  });
});
