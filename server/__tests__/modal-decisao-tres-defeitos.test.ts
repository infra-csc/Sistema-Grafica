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
  it("cada botão divide a largura e pode encolher", () => {
    // As duas ações usam a MESMA receita — a versão anterior tinha uma perna
    // em cada botão e o par colidia no meio.
    expect((REV.match(/flex: "1 1 210px", minWidth: 0, overflow: "hidden"/g) ?? []).length).toBe(2);
  });

  it("o rótulo corta em elipse em vez de invadir o vizinho", () => {
    // `nowrap` no rótulo, DENTRO de um botão com overflow hidden. `nowrap` no
    // botão sem o hidden era exatamente a receita do defeito.
    expect(
      (REV.match(/<span style=\{\{ display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" \}\}>/g) ?? []).length,
    ).toBe(2);
  });

  it("abaixo de ~430px os botões empilham em largura total", () => {
    // Elipse em ação primária é a segunda pior saída; numa faixa estreita os
    // dois rótulos longos empilham (wrap + base de 210px cada).
    expect(REV).toContain('<div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>');
  });

  it("a receita quebrada não voltou", () => {
    expect(semCom(REV)).not.toContain('minWidth: 0, whiteSpace: "nowrap",');
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
    expect(REV).toContain("selectedItem?.finalFileUrl && isWebUrl(selectedItem.finalFileUrl) && (");
    expect(REV).toContain("const caminhoDeRede = !!url && !isWebUrl(url);");
  });
});

describe("4 · a tira de metadados não é cortada pela borda", () => {
  it("uma linha só, com os cartões encolhendo", () => {
    expect(REV).toContain('flexWrap: "nowrap", gap: isMobile ? 8 : 10');
    // Cada cartão pode encolher; o valor corta em elipse com o texto completo
    // no title — cortar EM SILÊNCIO é o único desfecho proibido.
    expect(REV).toContain('flex: "1 1 0", minWidth: isMobile ? 72 : 0');
    expect(REV).toContain('title={String(value)}');
  });

  it("no celular a tira rola em vez de esconder", () => {
    expect(REV).toContain('overflowX: isMobile ? "auto" : "hidden"');
  });
});
