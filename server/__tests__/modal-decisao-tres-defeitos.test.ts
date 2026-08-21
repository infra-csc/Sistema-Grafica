// ─────────────────────────────────────────────────────────────────────────────
// TRÊS DEFEITOS DO MODAL DE DECISÃO, vistos numa única captura de tela em uso
// real (peça #0381) — mais um quarto que a mesma captura entregou de graça.
//
// O que os une: os três são casos de conteúdo que TRANSBORDA o quadro que o
// layout reservou — texto de botão invadindo o vizinho, resposta de erro
// renderizada como documento, segunda linha de metadados cortada pela borda.
// Nenhum aparece em janela larga com dados bons; todos aparecem em produção.
//
// 1 · "PRODUÇÃOD EVOLVER PARA ARTE": os dois botões de decisão impressos um
//     sobre o outro. A receita tinha `nowrap` no botão sem `overflow: hidden` —
//     `min-width: 0` deixava o BOTÃO encolher, mas o texto que não coube
//     continuava sendo pintado por cima do vizinho.
//
// 2 · `{"error":"Não autenticado"}` dentro da moldura de pré-visualização, com
//     barra de rolagem e a caixa do visualizador do navegador em volta.
//     `isPdf(url)` decide por padrão de URL; a URL passou no teste, o servidor
//     respondeu 401, e o iframe renderizou o corpo do erro como documento — o
//     iframe, ao contrário da <img>, renderiza QUALQUER resposta.
//
// 3 · "Abrir em nova aba" para endereço não navegável: já estava gateado por
//     `isWebUrl` nos dois painéis quando a captura chegou (o caso da captura,
//     `https://www.lteste`, É navegável como endereço — o lixo é o dado). O
//     que restava era o fallback de erro da <img>, que oferecia "Abrir arquivo
//     externo" sem o mesmo gate.
//
// 4 · A tira de metadados quebrava em duas linhas e a segunda era cortada:
//     "QUANTIDADE · EDITAR" pela metade. Com `flex-wrap: wrap`, a segunda
//     linha nascia FORA da altura que a coluna reservou.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const ler = (rel: string) => readFileSync(path.resolve(__dirname, "../../", rel), "utf8");
const REV = ler("client/src/pages/solicitacao.tsx");
const FP = ler("client/src/components/file-preview.tsx");

/** Sem comentários — para as afirmações de ausência. */
const semCom = (s: string) =>
  s.replace(/\r\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n").map(l => l.replace(/^\s*\/\/.*$/, "")).join("\n");

describe("1 · os botões de decisão nunca se sobrepõem", () => {
  // Este describe tem TRÊS gerações, e vale a genealogia:
  //   1ª — `nowrap` no botão curou a quebra em duas linhas e criou a
  //        sobreposição (nada cortava o excesso);
  //   2ª — overflow hidden + elipse + wrap curou por CONTENÇÃO, dentro da
  //        coluna estreita que era a causa real;
  //   3ª — a reestruturação em faixas horizontais tirou a causa: os botões
  //        vivem numa faixa de LARGURA CHEIA, em caixa normal ("Liberar
  //        para produção" mede ~40% menos que o mesmo rótulo em maiúsculas
  //        com letterSpacing), fora de qualquer caixa escura.
  it("cada botão divide a largura e pode encolher", () => {
    expect((REV.match(/flex: "1 1 0", minWidth: 0, height: 48,/g) ?? []).length).toBe(2);
  });

  it("caixa normal e nowrap — o rótulo cabe em vez de ser contido", () => {
    const i = REV.indexOf('data-testid="button-release-modal"');
    const bloco = REV.slice(i, i + 3400);
    expect(bloco).toContain("Liberar para produção");
    expect(bloco).toContain("Devolver para Arte");
    // Nenhum dos dois é uppercase — a régua de largura que produzia a
    // colisão não existe mais.
    expect(bloco).not.toContain('textTransform: "uppercase"');
    // A elipse continua, de cinto de segurança, no span do rótulo.
    expect((bloco.match(/overflow: "hidden", textOverflow: "ellipsis"/g) ?? []).length).toBe(2);
  });

  it("lado a lado numa faixa clara — sem caixa escura em volta", () => {
    const i = REV.indexOf("4 · DECISÃO");
    expect(i).toBeGreaterThan(-1);
    const faixa = REV.slice(i, i + 1200);
    expect(faixa).toContain('backgroundColor: "#fafaf9"');
    expect(semCom(faixa)).not.toContain('backgroundColor: "#1c1917"');
  });

  it("a receita quebrada não voltou", () => {
    expect(semCom(REV)).not.toContain('flex: "1 1 0", minWidth: 0, whiteSpace: "nowrap",');
  });
});

describe("2 · erro de API nunca vira documento no painel", () => {
  it("a URL com cara de PDF é sondada antes de montar o iframe", () => {
    expect(FP).toContain("function usePdfSonda(");
    expect(FP).toContain("<PdfComSonda url={url}");
    // O iframe cru sobrevive num único lugar: dentro do componente com sonda.
    expect((semCom(FP).match(/<iframe /g) ?? []).length).toBe(1);
  });

  it("quem decide é o content-type, não o nome do arquivo", () => {
    // 'relatorio.pdf.png' e caminho com 'pdf%2F' mentem; o content-type é o
    // que o navegador vai de fato renderizar.
    expect(FP).toContain('r.headers.get("content-type")');
    expect(FP).toContain('if (/image\\//i.test(tipo)) setEstado("imagem");');
  });

  it("sessão expirada vira frase em português com ação, não JSON", () => {
    expect(FP).toContain('if (r.status === 401) { setEstado("sessao-expirada"); return; }');
    expect(FP).toContain('titulo="Sua sessão expirou" detalhe="Recarregue a página para ver os arquivos."');
  });

  it("a sonda só corre para URL do próprio app", () => {
    // Arquivo externo (Drive etc.) não deixa ler status por CORS — nesses o
    // iframe continua direto, como sempre foi. Sondar quebraria o que funciona.
    expect(FP).toContain('const local = url.startsWith("/");');
    expect(FP).toContain('if (!local) { setEstado("pdf"); return; }');
  });
});

describe("3 · nenhum caminho oferece link que o navegador não abre", () => {
  it("o fallback de erro da <img> ganhou o mesmo gate dos painéis", () => {
    // Era o último "Abrir" sem gate: a moldura de erro oferecia o linkUrl cru.
    expect(FP).toContain("{linkUrl && isWebUrl(linkUrl) && (");
    const cru = semCom(FP);
    expect(cru).not.toContain("{linkUrl && (");
  });

  it("os dois painéis do modal continuam gateados", () => {
    // Com a reestruturação, o "ampliar" mudou de lugar (do cabeçalho da
    // coluna para o cabeçalho de cada pane) mas manteve o gate: só quando
    // a URL é navegável.
    expect(REV).toContain("{url && isWebUrl(url) && (");
    expect(REV).toContain("const caminhoDeRede = !!url && !isWebUrl(url);");
  });
});

describe("4 · a tira de metadados não é cortada pela borda", () => {
  it("uma linha só, com os blocos encolhendo", () => {
    // Os cartões viraram blocos separados por filetes, numa faixa própria
    // de largura cheia com flexShrink: 0 — a segunda linha que nascia fora
    // da altura reservada não tem mais onde nascer.
    expect(REV).toContain('flex: "1 1 0", minWidth: isMobile ? 76 : 0');
    expect(REV).toContain('title={String(value)}');
    expect(REV).toContain('borderLeft: i === 0 ? "none" : "1px solid #e7e5e4"');
  });

  it("no celular a tira rola em vez de esconder", () => {
    expect(REV).toContain('overflowX: isMobile ? "auto" : "hidden"');
  });
});
