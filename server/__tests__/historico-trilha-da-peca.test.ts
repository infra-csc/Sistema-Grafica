// ─────────────────────────────────────────────────────────────────────────────
// HISTÓRICO nota 10 — a trilha de uma peça, o tempo entre passos, a forma do dia.
//
// A tela responde "o que aconteceu, em ordem". A pergunta mais frequente de uma
// auditoria é sobre UMA peça — e não existia filtro de peça: sobrava a busca em
// texto livre, com os registros dela espalhados por dias e páginas.
//
//   1 · MODO TRILHA: de qualquer linha com peça, um botão abre só os registros
//       daquela peça, em ordem de FLUXO (mais antigo primeiro — ler de trás
//       para frente inverteria a história). No dado, o recorte é por itemId;
//       na URL vai o código (?peca=0041), que é o que se cola num chat.
//   2 · O TEMPO ENTRE PASSOS: numa trilha o que informa é o intervalo, não o
//       instante. "+20h", "+5d 4h" — nunca minutos crus; tom por espera.
//   3 · A FORMA DO DIA: o separador diz quantas exceções o dia teve. Varrer
//       os dias procurando o vermelho é a leitura que se quer numa auditoria.
//
// O que NÃO mudou (a lista do handoff): cor por fase, `event_closed` não é
// exceção, pills não derivam de getStatusMeta, guard de arraste na linha, a
// conta de altura do modal, replaceState + debounce, prev/next sobre safePage.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const H = readFileSync(path.resolve(__dirname, "../../client/src/pages/historico.tsx"), "utf8");
const semCom = H.replace(/\r\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n").map(l => l.replace(/^\s*\/\/.*$/, "")).join("\n");

describe("1 · a trilha de uma peça", () => {
  it("o botão existe só em linha que TEM peça, com o title pedido", () => {
    expect(H).toContain("data-testid={`button-trilha-${idx}`}");
    expect(H).toContain("title={`Ver a trilha completa de ${entry.itemDisplayId}`}");
    // Registro de evento não tem trilha de peça para seguir.
    expect(H).toContain("onTrilha={!trilha && entry.itemId && entry.itemDisplayId ? () => abrirTrilha(entry) : undefined}");
    expect(H).toContain('<Route aria-hidden="true" style={{ width: 14, height: 14 }} />');
  });

  it("filtra por itemId — não pelo código em texto — e em ordem de fluxo", () => {
    expect(H).toContain("return displayed.filter(e => e.itemId === trilhaItemId).slice().reverse();");
    // O código vindo da URL é resolvido para o itemId na primeira linha que o tenha.
    expect(H).toContain("return displayed.find(e => e.itemDisplayId === trilha.display && e.itemId)?.itemId ?? null;");
  });

  it("a faixa da trilha, com o resumo e a saída", () => {
    expect(H).toContain('data-testid="faixa-trilha"');
    expect(H).toContain('backgroundColor: "#fff7ed", borderBottom: "1px solid #fed7aa"');
    expect(H).toContain(">Trilha da peça</span>");
    expect(H).toContain('data-testid="button-sair-trilha"');
    expect(H).toContain("da criação à liberação em ${fmtDuracao(");
    expect(H).toContain("partes.push(`maior espera: ${fmtDuracao(maior)}`);");
  });

  it("o resumo da faixa de filtros diz 'trilha de #0041 · 6 de 143'", () => {
    expect(H).toContain('{"trilha de "}');
    const i = H.indexOf('{"trilha de "}');
    const bloco = H.slice(i, i + 600);
    expect(bloco).toContain("{filtered.length}");
    expect(bloco).toContain("{displayed.length}");
  });

  it("sobrevive ao F5 e viaja no link (?peca=)", () => {
    expect(H).toContain('const v = urlParams.get("peca")?.trim();');
    expect(H).toContain('if (trilha) p.set("peca", trilha.display.replace(/^#/, ""));');
    // O espelho da URL passa a depender da trilha.
    expect(H).toContain("pageSize, safePage, isLoading, trilha]);");
  });

  it("no celular o botão entra na linha da pill com 44px; a faixa empilha", () => {
    expect(H).toContain("width: isCompact ? 44 : 28, height: isCompact ? 44 : 28");
    expect(H).toContain('flexDirection: isMobile ? "column" : "row"');
  });

  it("Limpar tudo também sai da trilha", () => {
    expect(H).toContain('setPeriod("all"); setSearchFilter(""); setTrilha(null); setPage(1);');
  });
});

describe("2 · o tempo entre passos", () => {
  it("a duração é a que a pessoa lê — minutos, horas, dias com horas", () => {
    expect(H).toContain("function fmtDuracao(ms: number): string {");
    expect(H).toContain("if (min < 60) return `${Math.max(0, min)}min`;");
    expect(H).toContain("if (h < 24) return `${h}h`;");
    expect(H).toContain("return hr > 0 ? `${d}d ${hr}h` : `${d}d`;");
  });

  it("o tom: até 24h cinza, acima âmbar, acima de 48h vermelho", () => {
    expect(H).toContain('return h > 48 ? "#b91c1c" : h > 24 ? "#b45309" : "#746e69";');
  });

  it("o intervalo é o do passo ANTERIOR na ordem de fluxo; o primeiro não tem", () => {
    expect(H).toContain("for (let i = 1; i < filtered.length; i++) {");
    expect(H).toContain("m.set(filtered[i].id, filtered[i].timestamp.getTime() - filtered[i - 1].timestamp.getTime());");
  });

  it("aparece abaixo da hora, em DM Mono 10px, com o title por extenso", () => {
    expect(H).toContain("data-testid={gapTestId}");
    expect(H).toContain("title={`A peça esperou ${fmtDuracao(gapMs)} entre o passo anterior e este`}");
    expect(H).toContain("fontSize: 10, fontWeight: 700, color: tomDoIntervalo(gapMs)");
    expect(H).toContain("gapTestId={`text-gap-${idx}`}");
  });
});

describe("3 · o separador diz a forma do dia", () => {
  it("conta as exceções do dia e pinta de vermelho", () => {
    expect(H).toContain("const excecao = EXCECAO_TYPES.includes(e.type) ? 1 : 0;");
    expect(H).toContain('· {grupo.excecoes} {grupo.excecoes === 1 ? "exceção" : "exceções"}');
    expect(H).toContain('color: "#b91c1c" }}');
  });

  it("mas não no modo trilha", () => {
    expect(H).toContain("{!trilha && grupo.excecoes > 0 && (");
  });
});

describe("o que NÃO mexer continua", () => {
  it("cor por fase, e event_closed fora das exceções", () => {
    expect(H).toContain("return { ...cfg, ...PHASE_STYLE[cfg.excecao ? \"excecao\" : cfg.phase] };");
    const linha = H.split("\n").find(l => l.includes("event_closed:")) ?? "";
    expect(linha).not.toContain("excecao: true");
  });

  it("o guard de arraste e o teste de seleção na linha", () => {
    expect(H).toContain("if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 4) return;");
    expect(H).toContain('if ((window.getSelection()?.toString() ?? "").length > 0) return;');
  });

  it("replaceState com debounce de 250ms preservando o hash", () => {
    expect(H).toContain('window.history.replaceState(null, "", (qs ? `?${qs}` : window.location.pathname) + window.location.hash);');
    expect(H).toContain("}, 250);");
  });

  it("a hora com segundos e a célula de hora continua uma só", () => {
    expect((H.match(/function TimeCell\(/g) ?? []).length).toBe(1);
    expect(H).toContain('{format(ts, "HH:mm:ss", { locale: ptBR })}');
  });

  it("as pills não derivam de getStatusMeta", () => {
    expect(semCom).not.toContain("getStatusMeta");
  });
});
