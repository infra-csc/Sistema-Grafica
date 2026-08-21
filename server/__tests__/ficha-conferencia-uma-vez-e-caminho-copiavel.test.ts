// ─────────────────────────────────────────────────────────────────────────────
// FICHA DA PEÇA: a foto da conferência aparece UMA vez, e o caminho da gráfica
// dá para copiar.
//
// Relato com captura (peça #1834, Fit House RJ):
//
//   · A mesma foto da conferência aparecia duas vezes na mesma ficha — na
//     faixa de comparação ("Conferido pela gráfica", ao lado da arte aprovada,
//     que é onde a conferência faz sentido) e de novo lá embaixo, em
//     "Registros da gráfica". Embaixo fica só o que não está em cima: a
//     entrega, as fotos EXTRAS da conferência (a segunda em diante, que a
//     faixa resume como "+N") e a observação.
//
//   · O arquivo final da gráfica é um caminho de rede
//     (\\10.100.1.7\TTKGrafica\PROVAS 2026\…). O navegador não abre, o botão
//     "Abrir" só existia para http, e a linha cortada em elipse não deixava
//     nem selecionar o texto. O caminho estava na tela e fora do alcance.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const ficha = readFileSync(
  path.resolve(__dirname, "../../client/src/components/item-details-dialog.tsx"),
  "utf8",
);
const semCom = ficha.replace(/\r\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n").map(l => l.replace(/^\s*\/\/.*$/, "")).join("\n");

describe("a foto da conferência mora ao lado da arte — e só lá", () => {
  it("a faixa de comparação continua mostrando a primeira foto com o +N", () => {
    expect(ficha).toContain('data-testid="link-conferencia"');
    expect(ficha).toContain("+{conferencePhotos.length - 1}");
  });

  it("embaixo, a conferência só entra com fotos EXTRAS ou observação", () => {
    expect(ficha).toContain("{(conferencePhotos.length > 1 || item.conferenceNotes) && (");
    expect(ficha).toContain('<PhotoGrid urls={conferencePhotos.slice(1)} alt="Foto da conferência" />');
    // O bloco antigo, que repetia a primeira foto.
    expect(semCom).not.toContain('<PhotoGrid urls={conferencePhotos} alt="Foto da conferência" />');
  });

  it("e o rótulo diz que são as extras, não o total", () => {
    expect(ficha).toContain("Conferência{conferencePhotos.length > 1 ? ` · mais ${conferencePhotos.length - 1}");
  });

  it("a entrega continua embaixo, inteira", () => {
    expect(ficha).toContain('<PhotoGrid urls={deliveryPhotos} alt="Foto da entrega" />');
  });
});

describe("o caminho do arquivo final dá para copiar", () => {
  it("há um botão de copiar para qualquer arquivo final", () => {
    expect(ficha).toContain('data-testid="button-copiar-caminho-final"');
    expect(ficha).toContain("navigator.clipboard.writeText(item.finalFileUrl!)");
  });

  it("'Abrir' só aparece quando o navegador consegue abrir", () => {
    // `startsWith("http")` aceitava http e nada mais; `isWebUrl` é a régua da
    // casa (http(s) ou caminho do próprio app) — a mesma dos outros painéis.
    expect(ficha).toContain("{isWebUrl(item.finalFileUrl) && (");
    expect(semCom).not.toContain('item.finalFileUrl.startsWith("http") && (');
  });

  it("o caminho completo está no title, porque a linha corta em elipse", () => {
    expect(ficha).toContain("<p title={item.finalFileUrl || undefined}");
    // Sem nome de arquivo, a linha mostra o caminho — antes mostrava o rótulo
    // genérico "Arquivo final" e o caminho não aparecia em lugar nenhum.
    expect(ficha).toContain("{item.finalFileUrl ? (item.finalFileName || item.finalFileUrl) : \"Arquivo final\"}");
  });

  it("a mensagem do toast diz ONDE colar, conforme o tipo de caminho", () => {
    expect(ficha).toContain('isWebUrl(item.finalFileUrl!) ? "Cole no navegador para abrir." : "Cole no Explorer para abrir o arquivo."');
  });
});
