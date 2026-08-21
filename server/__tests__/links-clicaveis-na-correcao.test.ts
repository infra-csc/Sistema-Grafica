// ─────────────────────────────────────────────────────────────────────────────
// LINKS CLICÁVEIS NO MOTIVO DA CORREÇÃO.
//
// Pedido do dono (21/08/2026): "deixar link do comentário clicável — da
// correção". O patrocinador manda o link da referência dentro do motivo de
// reprovação; a Arte tinha de selecionar, copiar e colar.
//
// Fixa: (1) o fatiador — o que vira link e o que NÃO vira; (2) os três
// lugares em que o motivo aparece usam o componente (fila de Correção e
// modal do motivo na Arte; painel do patrocinador no Atendimento); (3) o
// link não propaga o clique, porque mora dentro de cartões clicáveis.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { fatiarLinks } from "../../client/src/components/texto-com-links";

const ler = (rel: string) => readFileSync(path.resolve(__dirname, "../../", rel), "utf8");
const COMP = ler("client/src/components/texto-com-links.tsx");
const ARTE = ler("client/src/pages/arte.tsx");
const ATEND = ler("client/src/pages/atendimento.tsx");

describe("1 · o fatiador", () => {
  it("http(s) e www viram link; www ganha https://", () => {
    expect(fatiarLinks("veja https://drive.google.com/x e www.marca.com.br/logo")).toEqual([
      { texto: "veja " },
      { url: "https://drive.google.com/x", href: "https://drive.google.com/x" },
      { texto: " e " },
      { url: "www.marca.com.br/logo", href: "https://www.marca.com.br/logo" },
    ]);
  });

  it("pontuação de fim de frase fica fora do link", () => {
    expect(fatiarLinks("Use o logo novo (https://x.com/logo.png).")).toEqual([
      { texto: "Use o logo novo (" },
      { url: "https://x.com/logo.png", href: "https://x.com/logo.png" },
      { texto: ")." },
    ]);
  });

  it("texto sem URL volta inteiro; 'algo.com' solto NÃO vira link", () => {
    expect(fatiarLinks("Trocar a cor do fundo")).toEqual([{ texto: "Trocar a cor do fundo" }]);
    expect(fatiarLinks("mandei por email para joao@marca.com ontem")).toEqual([{ texto: "mandei por email para joao@marca.com ontem" }]);
  });

  it("aspas e < > encerram a URL — nada de engolir o resto da frase", () => {
    const f = fatiarLinks('ref: "https://a.b/c" <https://d.e/f>');
    expect(f.filter((x) => "url" in x).map((x: any) => x.url)).toEqual(["https://a.b/c", "https://d.e/f"]);
  });
});

describe("2 · os três lugares usam o componente", () => {
  it("Arte: fila de Correção e modal do motivo", () => {
    expect(ARTE).toContain('import { TextoComLinks } from "@/components/texto-com-links";');
    expect((ARTE.match(/<TextoComLinks texto=\{approval\.rejectionReason\} \/>/g) ?? []).length).toBe(2);
    // e nenhum motivo ficou como texto cru
    expect(ARTE).not.toContain('"{approval.rejectionReason}"');
    expect(ARTE).not.toContain("`\"${approval.rejectionReason}`\"");
  });

  it("Atendimento: o motivo registrado no painel do patrocinador", () => {
    expect(ATEND).toContain('import { TextoComLinks } from "@/components/texto-com-links";');
    expect(ATEND).toContain('"<TextoComLinks texto={approval.rejectionReason} />"');
    expect(ATEND).not.toContain('"{approval.rejectionReason}"');
  });
});

describe("3 · o link se comporta dentro de um cartão clicável", () => {
  it("aba nova, sem opener, sem propagar o clique, com contraste", () => {
    expect(COMP).toContain('target="_blank" rel="noopener noreferrer"');
    expect(COMP).toContain("onClick={(e) => e.stopPropagation()}");
    expect(COMP).toContain('color: "#c2410c"');
    expect(COMP).toContain('data-testid="link-no-texto"');
    // URL longa não estoura o cartão
    expect(COMP).toContain('wordBreak: "break-all"');
  });
});
