// ─────────────────────────────────────────────────────────────────────────────
// VINCULAR: a lista chega ordenada por tipo — senão o agrupador mente.
//
// Relato com captura (Blue Night SP): "TOTENS 6" com UMA linha embaixo, depois
// "QUADROS 4X3 6" com uma linha, depois "2X1 6", "PRISMA 6"… Cada contagem
// certa, a lista misturada.
//
// A tabela abre um cabeçalho de tipo sempre que o tipo MUDA em relação à linha
// anterior (`abreTipo`). Isso só agrupa se a lista chegar ORDENADA por tipo.
// A ordenação existia (grupo pai → tipo → ID) e caiu quando as duas árvores de
// JSX viraram uma: a lista passou a chegar em ordem de ID, os tipos
// intercalados — e um "abre ao mudar" sobre uma lista intercalada repete o
// cabeçalho a cada linha.
//
// O padrão que isto guarda: um agrupador por "mudou em relação ao anterior"
// é uma PROMESSA sobre a ordem da entrada. Quem garante a ordem tem de estar
// ao lado de quem a consome, ou o próximo refactor separa os dois de novo.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const VP = readFileSync(
  path.resolve(__dirname, "../../client/src/pages/vincular-patrocinadores.tsx"),
  "utf8",
);

describe("a ordem de leitura da produção", () => {
  it("existe uma função só: grupo pai → tipo → ID", () => {
    expect(VP).toContain("const ordenarParaLeitura = (lista: any[]) => [...lista].sort((a, b) => {");
    const i = VP.indexOf("const ordenarParaLeitura");
    const corpo = VP.slice(i, i + 500);
    expect(corpo).toContain("const ga = typeToGroup[a.type] || '', gb = typeToGroup[b.type] || '';");
    expect(corpo).toContain("if (ga !== gb) return COLLATOR_PTBR.compare(ga, gb);");
    expect(corpo).toContain("if (a.type !== b.type) return COLLATOR_PTBR.compare(a.type || '', b.type || '');");
    // compareDisplayId, não replace(/\D/g,''): "#0062-C1" virava 621.
    expect(corpo).toContain("return compareDisplayId(a.displayId, b.displayId);");
  });

  it("é aplicada nos DOIS agrupamentos — por evento e por patrocinador", () => {
    expect((VP.match(/ordenarParaLeitura\(filterItems\(eventItems as any\[\], event\.name\)\)/g) ?? []).length).toBe(2);
  });

  it("e o agrupador por 'mudou em relação ao anterior' continua — agora com a garantia ao lado", () => {
    expect(VP).toContain("const abreTipo = !anterior || anterior.type !== item.type;");
    const i = VP.indexOf("const abreTipo = !anterior");
    expect(VP.slice(i - 400, i)).toContain("ordenarParaLeitura");
  });

  it("o memo que monta a lista depende do mapa de grupos", () => {
    // Sem typeToGroup nas dependências, a ordenação por grupo pai usaria o
    // mapa de uma renderização antiga — e a lista piscaria fora de ordem até
    // o próximo filtro.
    expect(VP).toContain("eventSponsorMap, sponsors, typeToGroup]);");
  });
});
