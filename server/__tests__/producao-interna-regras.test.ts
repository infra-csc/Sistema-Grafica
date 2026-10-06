// ─────────────────────────────────────────────────────────────────────────────
// PRODUÇÃO INTERNA — a REGRA PURA (shared/producao-interna.ts), a mesma que o
// botão lê para aparecer e que as rotas aplicam (dono, 02/10).
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import {
  podeEnviarDiretoParaGrafica, motivoParaNaoEnviarDireto, motivoParaNaoMarcar, recusaDaMarcaNaEscrita,
  faltamInstrucoes, lerInstrucoes, camposDoEnvioDireto, fraseDaTrilhaDoEnvioDireto,
  ENVIAVEL_DIRETO_PARA_A_GRAFICA, MARCAVEL_NA_LISTA, INSTRUCOES_MINIMO, INSTRUCOES_MAXIMO, CODIGO_COM_PATROCINADOR,
} from "@shared/producao-interna";
import { origemDaAcao, proximoStatus, podeTransicionar, ANTES_DA_ARTE } from "@shared/maquina-de-estados";
import { dividirEnvioDaLista, corpoDaProducaoInterna, CAMPOS_VAZIOS_DA_PRODUCAO_INTERNA } from "@shared/producao-interna";
import { avisoDoEnvioDaLista } from "../../client/src/components/detalhe-do-evento/regras";

const base = { status: "draft", type: "Banner", isReuse: false, deletedAt: null, travadaEm: null, sponsors: [] as unknown[] };

describe("o botão aparece só quando vale", () => {
  it("rascunho, solicitada e aguardando vinculação, sem patrocinador, para Solicitação e admin", () => {
    for (const status of ["draft", "requested", "awaiting_linking"]) {
      expect(podeEnviarDiretoParaGrafica({ ...base, status }, "solicitacao"), status).toBe(true);
      expect(podeEnviarDiretoParaGrafica({ ...base, status }, "admin"), status).toBe(true);
    }
  });

  it("some para os outros papéis", () => {
    for (const papel of ["arte", "grafica", "atendimento", "", null, undefined]) {
      expect(podeEnviarDiretoParaGrafica(base, papel as string), String(papel)).toBe(false);
    }
  });

  it("some com patrocinador, molde, reaproveitamento total, trava, exclusão e fora da etapa", () => {
    expect(podeEnviarDiretoParaGrafica({ ...base, sponsors: [{ id: "sp1" }] }, "admin")).toBe(false);
    expect(podeEnviarDiretoParaGrafica({ ...base, type: "MOLDE" }, "admin")).toBe(false);
    expect(podeEnviarDiretoParaGrafica({ ...base, isReuse: true }, "admin")).toBe(false);
    expect(podeEnviarDiretoParaGrafica({ ...base, travadaEm: new Date() }, "admin")).toBe(false);
    expect(podeEnviarDiretoParaGrafica({ ...base, deletedAt: new Date() }, "admin")).toBe(false);
    for (const status of ["awaiting_submission", "awaiting_sponsor_approval", "awaiting_final_review", "ready_for_production", "canceled"]) {
      expect(podeEnviarDiretoParaGrafica({ ...base, status }, "admin"), status).toBe(false);
    }
    expect(podeEnviarDiretoParaGrafica(null, "admin")).toBe(false);
  });

  it("o motivo diz o porquê, com o status HTTP da rota", () => {
    expect(motivoParaNaoEnviarDireto(base, { papel: "grafica" })?.http).toBe(403);
    const comSp = motivoParaNaoEnviarDireto(base, { papel: "admin", temPatrocinador: true });
    expect(comSp?.codigo).toBe(CODIGO_COM_PATROCINADOR);
    expect(comSp?.http).toBe(409);
    expect(motivoParaNaoEnviarDireto({ ...base, status: "awaiting_submission" }, { papel: "admin" })?.frase).toMatch(/Arte/);
  });
});

describe("a máquina de estados e a regra dizem o mesmo", () => {
  it("a ação avulsa parte de draft/requested/awaiting_linking — ANTES_DA_ARTE sem o 'aguardando envio'", () => {
    expect(origemDaAcao("enviar-direto-para-a-grafica")).toEqual([...ENVIAVEL_DIRETO_PARA_A_GRAFICA]);
    expect(ANTES_DA_ARTE.filter((s) => s !== "awaiting_submission")).toEqual([...ENVIAVEL_DIRETO_PARA_A_GRAFICA]);
    for (const s of ENVIAVEL_DIRETO_PARA_A_GRAFICA) expect(proximoStatus(s, "enviar-direto-para-a-grafica")).toBe("ready_for_production");
    expect(podeTransicionar("draft", "enviar-direto-para-a-grafica", "arte")).toBe(false);
  });

  it("o envio da lista leva a marcada de draft/requested para Pronto para Produção", () => {
    expect(origemDaAcao("enviar-producao-interna-da-lista")).toEqual([...MARCAVEL_NA_LISTA]);
    expect(proximoStatus("requested", "enviar-producao-interna-da-lista")).toBe("ready_for_production");
    expect(podeTransicionar("draft", "enviar-producao-interna-da-lista", "solicitacao")).toBe(true);
    expect(podeTransicionar("draft", "enviar-producao-interna-da-lista", "atendimento")).toBe(false);
  });
});

describe("instruções", () => {
  it("obrigatórias só sem arquivo, com o mínimo", () => {
    expect(faltamInstrucoes(null, false)).toBe(true);
    expect(faltamInstrucoes("x".repeat(INSTRUCOES_MINIMO - 1), false)).toBe(true);
    expect(faltamInstrucoes("x".repeat(INSTRUCOES_MINIMO), false)).toBe(false);
    expect(faltamInstrucoes(null, true)).toBe(false);
  });

  it("lerInstrucoes limpa espaços, mantém as quebras de linha e barra o texto longo demais", () => {
    expect(lerInstrucoes("  1) cortar\r\n2)   furar  ")).toEqual({ ok: true, instrucoes: "1) cortar\n2) furar" });
    expect(lerInstrucoes("   ")).toEqual({ ok: true, instrucoes: null });
    expect(lerInstrucoes(undefined)).toEqual({ ok: true, instrucoes: null });
    expect(lerInstrucoes(42).ok).toBe(false);
    expect(lerInstrucoes("x".repeat(INSTRUCOES_MAXIMO + 1)).ok).toBe(false);
  });
});

describe("a marca na escrita (criar/editar)", () => {
  it("marcar: só na lista, sem patrocinador, por Solicitação/admin", () => {
    expect(motivoParaNaoMarcar(base, { papel: "solicitacao", marcar: true })).toBeNull();
    expect(motivoParaNaoMarcar({ ...base, status: "awaiting_linking" }, { papel: "admin", marcar: true })?.codigo).toBe("ETAPA");
    expect(motivoParaNaoMarcar(base, { papel: "admin", marcar: true, temPatrocinador: true })?.codigo).toBe(CODIGO_COM_PATROCINADOR);
    expect(motivoParaNaoMarcar(base, { papel: "arte", marcar: true })?.http).toBe(403);
    // Desmarcar não pergunta patrocinador nem tipo.
    expect(motivoParaNaoMarcar({ ...base, type: "Molde" }, { papel: "admin", marcar: false })).toBeNull();
  });

  it("criar: nasce em rascunho; molde marcado é recusado; instrução normalizada", () => {
    expect(recusaDaMarcaNaEscrita(null, { producaoInterna: true, type: "Molde" }, "admin", false)).toHaveProperty("recusa");
    expect(recusaDaMarcaNaEscrita(null, { producaoInterna: true, instrucoesGrafica: "  Cortar e furar  " }, "solicitacao", false))
      .toEqual({ instrucoes: "Cortar e furar" });
    // Quem não marca não escreve instrução nova.
    const r = recusaDaMarcaNaEscrita(null, { instrucoesGrafica: "Cortar e furar" }, "grafica", false);
    expect("recusa" in r && r.recusa.status).toBe(403);
  });

  it("editar: peça já marcada não vira molde nem reaproveitamento total sem desmarcar", () => {
    const marcada = { ...base, producaoInterna: true };
    expect(recusaDaMarcaNaEscrita(marcada, { type: "Molde" }, "admin", false)).toHaveProperty("recusa");
    expect(recusaDaMarcaNaEscrita(marcada, { isReuse: true }, "admin", false)).toHaveProperty("recusa");
    expect(recusaDaMarcaNaEscrita(marcada, { type: "Banner grande" }, "admin", false)).toEqual({ instrucoes: undefined });
  });
});

describe("o que grava e o que a trilha diz", () => {
  it("os campos da liberação direta", () => {
    const agora = new Date("2026-10-02T12:00:00Z");
    const c = camposDoEnvioDireto(agora, { instrucoes: "Cortar e furar", arquivo: { url: "/objects/a.pdf", nome: "a.pdf" } });
    expect(c).toMatchObject({
      status: "ready_for_production", producaoInterna: true, skipApproval: true, approvedAt: agora, statusChangedAt: agora,
      instrucoesGrafica: "Cortar e furar", finalFileUrl: "/objects/a.pdf", finalFileName: "a.pdf", finalFileUpdatedAt: agora,
    });
    expect(c).not.toHaveProperty("creatorReviewedAt");
    // Sem instrução nova e sem arquivo: não apaga o que a peça já tem.
    const sem = camposDoEnvioDireto(agora, { instrucoes: null });
    expect(sem).not.toHaveProperty("instrucoesGrafica");
    expect(sem).not.toHaveProperty("finalFileUrl");
  });

  it("a frase da trilha", () => {
    const f = fraseDaTrilhaDoEnvioDireto("Rascunho", { instrucoes: "Cortar", temArquivo: false, daLista: true });
    expect(f).toContain("Enviada direto para a Gráfica (produção interna, sem passar pela Arte)");
    expect(f).toContain("Status alterado: Rascunho → Pronto para Produção");
    expect(f).toContain("sem arquivo");
    expect(f).toContain("Instruções: Cortar");
  });

  it("a trilha guarda o caminho de rede com as barras invertidas (05/10)", () => {
    const caminho = String.raw`\\10.100.1.7\TTKGrafica\INTERNO\Placa_wifi.pdf`;
    expect(fraseDaTrilhaDoEnvioDireto("Rascunho", { instrucoes: `Arte em ${caminho}`, temArquivo: false })).toContain(caminho);
  });
});

describe("o envio da lista, dividido (a confirmação e o rodapé leem daqui)", () => {
  it("vinculação, Gráfica e as que ficam com o motivo", () => {
    const d = dividirEnvioDaLista([
      { ...base, id: "a" },
      { ...base, id: "b", producaoInterna: true, instrucoesGrafica: "Cortar e furar nos cantos" },
      { ...base, id: "c", producaoInterna: true, finalFileUrl: "/objects/c.pdf" },
      { ...base, id: "d", producaoInterna: true },
      { ...base, id: "e", producaoInterna: true, finalFileUrl: "/x", sponsors: [{ id: "s" }] },
    ]);
    expect(d.paraVinculacao.map((p) => p.id)).toEqual(["a"]);
    expect(d.paraGrafica.map((p) => p.id)).toEqual(["b", "c"]);
    expect(d.ficamNoRascunho.map((f) => f.peca.id)).toEqual(["d", "e"]);
    expect(d.ficamNoRascunho[1].motivo).toMatch(/patrocinador/i);
  });

  it("o formulário: nunca manda finalFileUrl vazio; a marca desmarcada vai como false", () => {
    expect(corpoDaProducaoInterna(CAMPOS_VAZIOS_DA_PRODUCAO_INTERNA)).toEqual({ producaoInterna: false });
    expect(corpoDaProducaoInterna({ ...CAMPOS_VAZIOS_DA_PRODUCAO_INTERNA, producaoInterna: true })).not.toHaveProperty("finalFileUrl");
  });
});

describe("o toast do envio da lista (Detalhe do Evento)", () => {
  it("sem produção interna: a frase de sempre", () => {
    const a = avisoDoEnvioDaLista({ count: 3 });
    expect(a.titulo).toBe("Peças enviadas para a vinculação");
    expect(a.descricao).toContain("3 peças já estão na fila de Vincular Patrocinadores");
    expect(a.variante).toBe("success");
  });

  it("misto: quantas para cada lado e as que ficaram, curto", () => {
    const a = avisoDoEnvioDaLista({ count: 3, diretoParaGrafica: ["#0129", "#0130"], ficaramNoRascunho: [{ displayId: "#0131", motivo: "Vai direto para a Gráfica, mas está sem arquivo e sem instruções" }] });
    expect(a.titulo).toBe("3 de 4 peças enviadas");
    expect(a.descricao).toBe("No rascunho: #0131 (falta arquivo ou instruções). Direto para a Gráfica: #0129, #0130. Para a Vinculação: 1.");
    expect(a.variante).toBe("warning");
    expect(a.temVinculacao).toBe(false); // misto: sem o atalho (o botão estreitava o toast);
    const so = avisoDoEnvioDaLista({ count: 1, diretoParaGrafica: ["#0129"] });
    expect(so.titulo).toBe("Peça enviada direto para a Gráfica");
    expect(so.temVinculacao).toBe(false);
  });
});
