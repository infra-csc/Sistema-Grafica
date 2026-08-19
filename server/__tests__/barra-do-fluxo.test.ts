// ─────────────────────────────────────────────────────────────────────────────
// O FLUXO INTEIRO NUMA BARRA.
//
// O problema que este arquivo existe para preservar a solução, contado uma vez:
//
// Com dados de produção — 2.632 peças — 1.129 delas (43%) estavam em
// "Aguardando envio". Esse era o dado mais importante da tela, e aparecia como
// mais um entre doze contadores do mesmo tamanho. Doze cards com o mesmo peso
// não têm vencedor: a tela mostrava tudo e não dizia nada.
//
// Uma barra proporcional resolve o que doze números iguais não resolvem, porque
// a informação que importa é RELATIVA — não "quantos", e sim "onde está a
// massa". 43% num segmento salta aos olhos sem ler um algarismo.
//
// Os cards continuam abaixo, como detalhe: a barra é a leitura de três
// segundos, eles são a de trinta.
//
// A regra que fica: quando a pergunta é comparativa, número absoluto responde
// devagar. E quando doze coisas têm o mesmo peso visual, nenhuma tem peso.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const painel = readFileSync(path.resolve(__dirname, "../../client/src/pages/painel-geral.tsx"), "utf8");

describe("a barra do fluxo", () => {
  it("existe e cobre as três zonas", () => {
    expect(painel).toContain('aria-label="Distribuição das peças pelo fluxo"');
    const i = painel.indexOf("const zonas = [");
    const bloco = painel.slice(i, i + 300);
    for (const z of ["ZONA_ENTRADA", "ZONA_APROVACAO", "ZONA_PRODUCAO"]) {
      expect(bloco).toContain(z);
    }
  });

  it("usa a MESMA fonte de cor dos cards e da tabela", () => {
    // Nada de paleta paralela: a cor do segmento sai de getStatusMeta, igual
    // ao ponto do card e ao selo da linha.
    const i = painel.indexOf("const segmentos = zonas.flatMap");
    expect(painel.slice(i, i + 400)).toContain("getStatusMeta(STATUS_GROUPS[k][0])");
  });

  it("cada segmento aplica o MESMO recorte que o card correspondente", () => {
    // Clicar na barra e clicar no card têm de levar ao mesmo lugar, senão a
    // tela passa a ter dois filtros que discordam.
    expect(painel).toContain("onClick={() => toggleStatusCard(seg.k)}");
    expect(painel).toContain("aria-pressed={ativo}");
  });

  it("some quando não há o que distribuir", () => {
    // Barra vazia (ou de um segmento só) não informa nada e ainda ocupa a
    // faixa mais nobre da tela.
    expect(painel).toContain("{!isLoading && stats.total > 0 && (() => {");
  });

  it("o segmento ativo se distingue sem depender de cor", () => {
    // A cor do segmento já está ocupada dizendo QUAL status ele é; o estado
    // ativo precisa de outro canal.
    expect(painel).toContain('boxShadow: ativo ? "inset 0 0 0 2px #1c1917" : "none"');
  });

  it("o gargalo é dito por extenso, não só desenhado", () => {
    // Proporção é invisível para leitor de tela. A frase nomeia a maior fila.
    expect(painel).toContain("Maior fila:");
    expect(painel).toContain("const maior = segmentos.reduce");
  });

  it("cada segmento tem rótulo acessível com número e percentual", () => {
    const i = painel.indexOf("data-testid={`fluxo-seg-");
    const bloco = painel.slice(i, i + 700);
    expect(bloco).toContain("aria-label={`${seg.meta.label}");
    expect(bloco).toContain("por cento");
  });
});

describe("o percentual nos cards", () => {
  it("o card recebe a fatia do total", () => {
    expect(painel).toContain("pct={stats.total > 0 ? ((stats.byGroup[key] ?? 0) / stats.total) * 100 : undefined}");
  });

  it("a hierarquia vem do peso, não de enfraquecer o contraste", () => {
    // A primeira tentativa usou #8c8580 para o percentual ficar subordinado —
    // 3,63:1 em 10px, reprova AA. Enfraquecer contraste para criar hierarquia
    // troca um problema de design por um de acesso.
    const i = painel.indexOf("{pct < 1 ? \"<1\" : Math.round(pct)}% do total");
    const bloco = painel.slice(i - 300, i);
    expect(bloco).toContain('"#746e69"');
    expect(bloco).toContain("fontWeight: 600");
    // Olha o CODIGO, nao o arquivo: o comentario acima do bloco cita
    // #8c8580 de proposito, para registrar POR QUE ele foi descartado.
    const estilo = painel.slice(i - 300, i);
    expect(estilo).not.toContain("#8c8580");
  });

  it("não aparece durante a carga nem em card zerado", () => {
    expect(painel).toContain("{!carregando && pct !== undefined && value > 0 && (");
  });
});
