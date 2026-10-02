// ─────────────────────────────────────────────────────────────────────────────
// A OPERAÇÃO DA ANÁLISES (GET /api/analises/operacao) — a regra pura de
// server/services/analises-operacao.ts, sem banco, e a guarda de admin da rota.
//
// Por que estes casos: a tela é do gestor e cada número dela vira decisão.
// Mediana errada, motivo partido em três grafias, ação do galpão contada como
// "outras", trabalho das 22h caindo no dia seguinte e peça cancelada contando
// como espera do patrocinador são exatamente os erros que não aparecem a olho.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const H = vi.hoisted(() => {
  const base: Record<string, any> = {};
  const storage = new Proxy(base, {
    get: (t, k: string) => (k in t ? t[k] : (t[k] = vi.fn(async () => []))),
  });
  // O banco responde vazio a toda consulta: a rota precisa montar a resposta
  // inteira (com séries contínuas e zeros) mesmo sem nenhuma linha.
  const db = { execute: vi.fn(async () => ({ rows: [] })), select: vi.fn(), insert: vi.fn() };
  return { base, storage, db };
});

vi.mock("../db", () => ({ db: H.db, pool: {} }));
vi.mock("../storage", async () => {
  const real = await vi.importActual<any>("../storage");
  return { ...real, storage: H.storage };
});

import { capturarRotas } from "./rotas-de-mentira";
import { registerAnaliseRoutes, limparMemoAnalises } from "../routes/analises";
import {
  agregarDecisoes,
  agregarEspera,
  agregarMaquinas,
  agregarPessoas,
  chaveDoNome,
  inicioDaEspera,
  agregarReuso,
  agruparMotivos,
  diaNoFuso,
  diasDaJanela,
  extrairMotivo,
  lerJanela,
  mediana,
  medianaAteDecidir,
  naturezaDaAcao,
  normalizarMotivo,
  somarPorDia,
  STATUS_ESPERANDO_PATROCINADOR,
  TETO_DA_TRILHA,
  type LinhaDaTrilha,
} from "../services/analises-operacao";
import type { OperacaoDaAnalise } from "@shared/analises-operacao-contract";
import { STATUS_DA_ETAPA } from "@shared/fluxo-peca";

const DIA = 86_400_000;
const AGORA = Date.parse("2026-10-02T15:00:00Z");

describe("mediana", () => {
  it("ímpar, par, vazia e com lixo", () => {
    expect(mediana([5, 1, 3])).toBe(3);
    expect(mediana([4, 1, 3, 2])).toBe(2.5);
    expect(mediana([])).toBeNull();
    expect(mediana([NaN, 2, Infinity])).toBe(2);
  });
});

describe("motivos de reprovação", () => {
  it("extrai o texto depois do primeiro 'Motivo:'", () => {
    expect(extrairMotivo('Patrocinador "Acme" reprovou o item. Item aguarda nova versão da Arte. Motivo: Logo errado')).toBe("Logo errado");
    expect(extrairMotivo('Patrocinador "Acme" reprovou o item. Item aguarda nova versão da Arte')).toBeNull();
    expect(extrairMotivo(null)).toBeNull();
  });

  it("caixa, acento, espaço e pontuação final não partem o motivo", () => {
    expect(normalizarMotivo("  logo   errado. ")).toEqual({ chave: "logo errado", rotulo: "Logo errado" });
    expect(normalizarMotivo("Cor não confere!")!.chave).toBe(normalizarMotivo("cor nao confere")!.chave);
    expect(normalizarMotivo("   ")).toBeNull();
    expect(normalizarMotivo("...")).toBeNull();
  });

  it("agrupa, ordena pelo mais frequente e usa a grafia mais comum", () => {
    const r = agruparMotivos(["Logo errado", "logo errado.", "Logo errado", "Cor não confere", "cor nao confere!", null, ""]);
    expect(r).toEqual([
      { motivo: "Logo errado", vezes: 3 },
      { motivo: "Cor não confere", vezes: 2 },
    ]);
    expect(agruparMotivos(["a", "b", "c"], 2)).toHaveLength(2);
  });
});

describe("natureza das ações da trilha (as frases que as rotas gravam hoje)", () => {
  const n = (action: string, details: string | null, entityType = "item") => naturezaDaAcao({ action, entityType, details });

  it("aprovação do patrocinador × liberação da Revisão Final (as duas gravam 'approved')", () => {
    expect(n("approved", 'Patrocinador "Acme" aprovou o item')).toBe("aprovar");
    expect(n("approved", "Todos os patrocinadores aprovaram. Status alterado: A → B")).toBe("aprovar");
    expect(n("approved", "Status alterado: Aguardando Revisão Final → Pronto para Produção (liberado para produção)")).toBe("liberar");
    expect(n("rejected", 'Patrocinador "Acme" reprovou o item. Motivo: x')).toBe("reprovar");
  });

  it("o galpão grava 'updated' e diz o que foi na frase", () => {
    expect(n("updated", "Conferência concluída (10/10)")).toBe("conferir");
    expect(n("updated", "Conferência parcial: 3 un. (3/10)")).toBe("conferir");
    expect(n("updated", "Embalada no Tubo 4 — 3 de 10 un.")).toBe("embalar");
    expect(n("updated", "Embalada (sozinha)")).toBe("embalar");
    expect(n("updated", "Retirada do Tubo 2 — 3 un.")).toBe("embalar");
    expect(n("updated", "Thumb de aprovação atualizado por Ana. Anterior: a → Novo: b")).toBe("trocar arte");
    expect(n("updated", "Status alterado: Liberado → Aguardando Revisão Final (arquivo final adicionado)")).toBe("enviar arte");
    expect(n("updated", "Observação editada")).toBe("editar peça");
    expect(n("production", "Iniciou a impressão")).toBe("imprimir");
    expect(n("produced", null)).toBe("imprimir");
    expect(n("delivered", "Entrega concluída (10/10, recebido por: João)")).toBe("entregar");
  });

  it("não conta resumo, efeito de outra ação nem o que não é trabalho", () => {
    expect(n("delivered", "Tubo 3 entregue a João", "tubo")).toBeNull();
    expect(n("created", "Tubo 3 criado", "tubo")).toBeNull();
    expect(n("cadastrado", null, "inventory_asset")).toBeNull();
    expect(n("created", '12 itens importados via Excel ("lista.xlsx")', "event")).toBeNull();
    expect(n("updated", "Aprovação revogada de Ministério (patrocinador desaprovador): nova versão da arte")).toBeNull();
    expect(n("updated", "Destravada na liberação da Revisão Final (Sofia)")).toBeNull();
    expect(n("updated", "Status alterado: Aguardando Finalização → Aguardando Aprovação — Ministério precisa aprovar a nova versão")).toBeNull();
    expect(n("updated", "Passou a ver o sistema como grafica", "user")).toBeNull();
    expect(n("password_changed", "Senha alterada", "user")).toBeNull();
  });

  it("'approved' sem patrocinador só vem da Revisão Final; 'rejected' sem patrocinador é devolução", () => {
    expect(n("approved", "Status alterado: Aguardando Revisão Final → Impresso / Acabamento (reaproveitamento — não precisa produzir)")).toBe("liberar");
    expect(n("approved", 'Com a saída de "Acme", não resta aprovação a esperar. Status alterado: A → B')).toBeNull(); // efeito de desvincular
    expect(n("rejected", "Item devolvido para Arte para modificações (layout).")).toBe("devolver");
    expect(n("rejected", "Gráfica devolveu a peça para a Revisão antes de produzir. Motivo: x")).toBe("devolver");
    expect(n("rejected", "Status alterado: Aguardando Envio → Rascunho (devolvida pela Arte ao solicitante). Motivo: x")).toBe("devolver");
  });

  it("as naturezas do começo do fluxo: evento, lista, peça, patrocinador", () => {
    expect(n("created", 'Evento "Night Run" criado', "event")).toBe("evento");
    expect(n("updated", 'Evento "Night Run" atualizado — Nome: A → B', "event")).toBe("evento");
    expect(n("created", 'Item "Pórtico" criado - Qtd: 1, 18.00m²')).toBe("criar peça");
    expect(n("created", '3 itens clonados do evento "X"')).toBe("criar peça");
    expect(n("created", "20 itens: Status alterado de Rascunho → Aguardando Vinculação (enviados para vinculação)")).toBe("enviar lista");
    expect(n("updated", "5 itens enviados para Arte")).toBe("enviar lista");
    expect(n("added", 'Patrocinador "Acme" vinculado ao evento "X"', "event_sponsor")).toBe("vincular patrocinador");
    expect(n("added", 'Patrocinador "Acme" vinculado ao item Pórtico', "item_sponsor")).toBe("vincular patrocinador");
    expect(n("removed", 'Patrocinador "Acme" desvinculado da peça #12')).toBe("vincular patrocinador");
    expect(n("updated", "Quantidade: 2 → 4 un.")).toBe("editar peça");
    expect(n("created", "Solicitação do Atendimento com 2 peças: …", "pedido_de_peca")).toBe("pedido de peça");
  });

  it("Arte: o envio do thumb (frase antiga 'Enviado para Arte — …') é enviar arte; a substituição é trocar arte", () => {
    expect(n("updated", "Enviado para Arte — Status alterado: Aguardando Envio → Aguardando Revisão Final (sem aprovação de patrocinador)")).toBe("enviar arte");
    expect(n("updated", "Molde: thumb enviado direto para a Revisão Final (sem aprovação de patrocinador nem arquivo final) — Status alterado: A → B")).toBe("enviar arte");
    expect(n("dispensed", "Peça dispensada pela Arte. Status anterior: x.")).toBe("enviar arte");
    expect(n("updated", "Book de aprovação vinculado a 4 peça(s)", "event")).toBe("enviar arte");
    expect(n("updated", "Arquivo final substituído por Artur. Anterior: a → Novo: b")).toBe("trocar arte");
    expect(n("updated", "Thumb trocado (Liberado). Motivo: cor")).toBe("trocar arte");
  });

  it("galpão, estoque, trava, cancelamento e cadastros", () => {
    expect(n("label_printed", 'Etiqueta da peça "#12" impressa')).toBe("etiquetas");
    expect(n("updated", "Travada pela Solicitação: segurar (Sofia)")).toBe("travar");
    expect(n("updated", "Destravada (Sofia)")).toBe("travar");
    expect(n("updated", "Pedido ao estoque: 2 de 4 un. para reaproveitar")).toBe("estoque");
    expect(n("updated", "Reaproveitamento total pela Gráfica: 4/4 un.")).toBe("estoque");
    expect(n("triagem", "{}", "inventory_asset")).toBe("estoque");
    expect(n("canceled", "Item cancelado — motivo")).toBe("cancelar");
    expect(n("updated", "Item descancelado — voltou para Rascunho (palpite)")).toBe("cancelar");
    expect(n("created", 'Patrocinador "Acme" criado', "sponsor")).toBe("cadastros");
    expect(n("created", 'Usuário "Ana" criado com perfil "arte"', "user")).toBe("cadastros");
    expect(n("cobranca_registrada", "Registro na Gestão de Prazos", "event")).toBe("prazos");
    expect(n("updated", "Resumo enviado à mão", "gestao")).toBe("outras");
  });

  it("agrupa por usuário (o VER COMO do admin é a mesma pessoa) e deixa o Sistema de fora", () => {
    const l = (o: Partial<LinhaDaTrilha>): LinhaDaTrilha => ({
      userId: "u-ana", userName: "Ana", action: "updated", entityType: "item", details: "Conferência concluída (1/1)", ...o,
    });
    const usuarios = [
      { id: "u-ana", name: "Ana Lima", role: "grafica" },
      { id: "u-bia", name: "Bia", role: "atendimento" },
    ];
    const r = agregarPessoas([
      l({}),
      l({ userName: "Ana (como Gráfica)", details: "Embalada no Tubo 1" }),
      l({ action: "delivered", entityType: "tubo", details: "Tubo 1 entregue" }), // resumo do volume: não conta
      l({ userId: "u-bia", userName: "Bia", action: "approved", details: 'Patrocinador "X" aprovou o item' }),
      l({ userId: null, userName: "Sistema" }),
    ], usuarios, new Set(["Sistema"]));
    expect(r).toEqual([
      { nome: "Ana Lima", papel: "grafica", total: 2, porAcao: { conferir: 1, embalar: 1 } },
      { nome: "Bia", papel: "atendimento", total: 1, porAcao: { aprovar: 1 } },
    ]);
  });

  it("linha SEM user_id casa pelo nome com o cadastro (sem caixa nem acento); só fica sem cadastro quem não casa", () => {
    expect(chaveDoNome("  SOFIA  Solicitação (local) ")).toBe("sofia solicitacao (local)");
    expect(chaveDoNome("Ana Lima (como Gráfica)")).toBe("ana lima");
    const usuarios = [
      { id: "u-sofia", name: "Sofia Solicitação (local)", role: "solicitacao" },
      { id: "u-jo1", name: "Jo", role: "arte" },
      { id: "u-jo2", name: "JÓ", role: "grafica" }, // homônimos: não dá para escolher um
    ];
    const l = (o: Partial<LinhaDaTrilha>): LinhaDaTrilha => ({
      userId: null, userName: "x", action: "created", entityType: "item", details: 'Item "2x1" criado - Qtd: 1, 2m²', ...o,
    });
    const r = agregarPessoas([
      l({ userId: "u-sofia", userName: "Sofia Solicitação (local)" }),
      l({ userName: "sofia solicitacao (local)", entityType: "event", details: 'Evento "X" criado' }), // rota que não grava o id
      l({ userName: "Sofia Solicitação (local)", details: "4 itens: Status alterado de Rascunho → Aguardando Vinculação" }),
      l({ userName: "Jo" }),
      l({ userName: "Visitante antigo" }),
    ], usuarios, new Set(["Sistema"]));
    expect(r).toEqual([
      { nome: "Sofia Solicitação (local)", papel: "solicitacao", total: 3, porAcao: { evento: 1, "criar peça": 1, "enviar lista": 1 } },
      { nome: "Jo", papel: null, total: 1, porAcao: { "criar peça": 1 } },
      { nome: "Visitante antigo", papel: null, total: 1, porAcao: { "criar peça": 1 } },
    ]);
  });
});

describe("série por dia no fuso de Brasília", () => {
  it("a virada da meia-noite UTC (21h em Brasília) não muda o dia", () => {
    expect(diaNoFuso(Date.parse("2026-10-02T02:30:00Z"))).toBe("2026-10-01"); // 23h30 de 01/10 em Brasília
    expect(diaNoFuso(Date.parse("2026-10-02T03:00:00Z"))).toBe("2026-10-02"); // meia-noite de 02/10
  });

  it("baldes de hora caem no dia de Brasília; a série é contínua, com zero nos dias vazios", () => {
    const de = Date.parse("2026-09-30T03:00:00Z"); // 30/09 00h BRT
    const ate = Date.parse("2026-10-03T03:00:00Z"); // 03/10 00h BRT (exclusivo)
    const serie = somarPorDia(
      [
        { horaMs: Date.parse("2026-10-01T00:00:00Z"), unidades: 5, m2: 1 }, // 21h de 30/09
        { horaMs: Date.parse("2026-10-01T02:00:00Z"), unidades: 2, m2: 0.5 }, // 23h de 30/09
        { horaMs: Date.parse("2026-10-01T03:00:00Z"), unidades: 7, m2: 2 }, // 00h de 01/10
        { horaMs: Date.parse("2026-09-29T12:00:00Z"), unidades: 99, m2: 99 }, // fora da janela
      ],
      ["unidades", "m2"] as const,
      de,
      ate,
    );
    expect(serie).toEqual([
      { dia: "2026-09-30", unidades: 7, m2: 1.5 },
      { dia: "2026-10-01", unidades: 7, m2: 2 },
      { dia: "2026-10-02", unidades: 0, m2: 0 },
    ]);
  });

  it("diasDaJanela atravessa a virada do mês", () => {
    expect(diasDaJanela(Date.parse("2026-09-29T03:00:00Z"), Date.parse("2026-10-02T03:00:00Z"))).toEqual(["2026-09-29", "2026-09-30", "2026-10-01"]);
  });
});

describe("janela (de/ate/evento/patrocinador)", () => {
  it("sem nada: os últimos 30 dias até agora, sem filtros", () => {
    const r = lerJanela({}, AGORA);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.janela.ateMs).toBe(AGORA);
    expect(r.janela.ateMs - r.janela.deMs).toBe(30 * DIA);
    expect(r.janela.evento).toBeNull();
    expect(r.janela.patrocinador).toBeNull();
  });

  it("dia sem hora é dia de Brasília e o `ate` inclui o dia inteiro", () => {
    const r = lerJanela({ de: "2026-09-01", ate: "2026-09-30", evento: "ev-1", patrocinador: "all" }, AGORA);
    expect(r.ok && r.janela.de).toBe("2026-09-01T03:00:00.000Z");
    expect(r.ok && r.janela.ate).toBe("2026-10-01T03:00:00.000Z");
    expect(r.ok && r.janela.evento).toBe("ev-1");
    expect(r.ok && r.janela.patrocinador).toBeNull();
  });

  it("entrada torta vira frase em pt-BR, nunca consulta", () => {
    const erro = (q: Record<string, unknown>) => { const r = lerJanela(q, AGORA); return r.ok ? null : r.erro; };
    expect(erro({ de: "ontem" })).toMatch(/Data inicial inválida/);
    expect(erro({ ate: "2026-02-30" })).toMatch(/Data final inválida/); // 30/02 não existe (Date.parse rolaria para março)
    expect(erro({ de: "2026-10-01", ate: "2026-09-01" })).toMatch(/anterior à final/);
    expect(erro({ de: "2024-01-01", ate: "2026-01-01" })).toMatch(/longo demais/);
    expect(erro({ evento: "x'; drop table items;--" })).toMatch(/Evento inválido/);
    expect(erro({ patrocinador: ["a", "b"] })).toMatch(/Patrocinador inválido/);
  });
});

describe("Aprovação: fora do funil e BOOK COMPLETO não contam", () => {
  it("a etapa que espera o patrocinador é a canônica (STATUS_DA_ETAPA), não uma cópia", () => {
    expect(STATUS_ESPERANDO_PATROCINADOR).toEqual(STATUS_DA_ETAPA.awaiting_approval);
  });

  it("espera por patrocinador: só peça na etapa de aprovação; maior espera primeiro, mediana e mais antiga em dias", () => {
    const linha = (sponsorId: string, dias: number, status = "awaiting_sponsor_approval", type = "Pórtico") =>
      // A linha foi tocada há pouco (updatedAt de ontem): o relógio é o da PEÇA.
      ({ sponsorId, nome: sponsorId.toUpperCase(), status, type, pecaNaEtapaDesdeMs: AGORA - dias * DIA, linhaDesdeMs: AGORA - DIA / 2 });
    const r = agregarEspera([
      linha("acme", 2),
      linha("acme", 10),
      linha("acme", 4),
      linha("beta", 1, "awaiting_approval"), // o nome novo da mesma etapa também conta
      linha("acme", 40, "canceled"), // cancelada: não é espera de ninguém
      linha("beta", 50, "deleted"),
      linha("beta", 60, "awaiting_sponsor_approval", "BOOK COMPLETO"),
      // A linha nasce pending no VÍNCULO: com a peça fora da etapa de
      // aprovação, a bola não está com o patrocinador.
      linha("acme", 90, "draft"),
      linha("acme", 80, "awaiting_linking"),
      linha("beta", 70, "awaiting_submission"),
      linha("beta", 65, "sponsor_approved"),
      linha("acme", 55, "awaiting_final_review"),
      linha("beta", 45, "ready_for_production"),
    ], AGORA);
    expect(r.pendentesAgora).toBe(4);
    expect(r.esperaPorPatrocinador).toEqual([
      { sponsorId: "acme", nome: "ACME", pecasPendentes: 3, diasMaisAntiga: 10, diasMediana: 4 },
      { sponsorId: "beta", nome: "BETA", pecasPendentes: 1, diasMaisAntiga: 1, diasMediana: 1 },
    ]);
  });

  it("o relógio da espera é o da peça (status_changed_at); o updatedAt da linha só sem carimbo", () => {
    expect(inicioDaEspera({ pecaNaEtapaDesdeMs: AGORA - 14 * DIA, linhaDesdeMs: AGORA - 1000 })).toBe(AGORA - 14 * DIA);
    expect(inicioDaEspera({ pecaNaEtapaDesdeMs: null, linhaDesdeMs: AGORA - 3 * DIA })).toBe(AGORA - 3 * DIA);
    // O cartão "14+ dias" e o ranking contam a mesma coisa.
    const r = agregarEspera([
      { sponsorId: "acme", nome: "Acme", status: "awaiting_sponsor_approval", type: "Pórtico", pecaNaEtapaDesdeMs: AGORA - 15 * DIA, linhaDesdeMs: AGORA - 3600_000 },
      { sponsorId: "acme", nome: "Acme", status: "awaiting_sponsor_approval", type: "Pórtico", pecaNaEtapaDesdeMs: null, linhaDesdeMs: AGORA - 2 * DIA },
    ], AGORA);
    expect(r.esperaPorPatrocinador[0]).toMatchObject({ diasMaisAntiga: 15, pecasPendentes: 2, diasMediana: 8.5 });
  });

  it("decisões da trilha e motivos; peça cancelada fica fora", () => {
    const r = agregarDecisoes([
      { action: "approved", details: 'Patrocinador "Acme" aprovou o item', status: "approved", type: "Pórtico" },
      { action: "rejected", details: 'Patrocinador "Acme" reprovou o item. Item aguarda nova versão da Arte. Motivo: Logo errado', status: "awaiting_approval", type: "Pórtico" },
      { action: "rejected", details: 'Patrocinador "Beta" reprovou o item. Item aguarda nova versão da Arte. Motivo: logo errado.', status: "awaiting_approval", type: "Pórtico" },
      { action: "rejected", details: 'Patrocinador "Beta" reprovou o item. Motivo: Cor', status: "canceled", type: "Pórtico" },
    ]);
    expect(r.decididasNoPeriodo).toEqual({ aprovadas: 1, reprovadas: 2 });
    expect(r.motivosDeReprovacao).toEqual([{ motivo: "Logo errado", vezes: 2 }]);
  });

  it("mediana até decidir, em dias com uma casa", () => {
    // Linha nascida no vínculo há 60 dias; a arte foi enviada `dias` antes da decisão.
    const l = (dias: number, status = "approved") =>
      ({ criadaMs: AGORA - 60 * DIA, versaoMs: AGORA - dias * DIA, decididaMs: AGORA, status, type: "Pórtico" });
    expect(medianaAteDecidir([l(1), l(2), l(6), l(30, "canceled")])).toBe(2);
    expect(medianaAteDecidir([])).toBeNull();
    // A linha renovada depois da última versão: conta do nascimento dela.
    expect(medianaAteDecidir([{ criadaMs: AGORA - DIA, versaoMs: AGORA - 10 * DIA, decididaMs: AGORA, status: "approved", type: "Pórtico" }])).toBe(1);
  });

  it("decisão sem versão de arte registrada SAI da amostra (o nascimento no vínculo inflaria a mediana)", () => {
    const comVersao = { criadaMs: AGORA - 90 * DIA, versaoMs: AGORA - 3 * DIA, decididaMs: AGORA, status: "approved", type: "Pórtico" };
    const semVersao = { criadaMs: AGORA - 90 * DIA, versaoMs: null, decididaMs: AGORA, status: "approved", type: "Pórtico" };
    expect(medianaAteDecidir([comVersao, semVersao, semVersao])).toBe(3);
    expect(medianaAteDecidir([semVersao])).toBeNull();
  });
});

describe("Gráfica e Estoque", () => {
  it("máquinas: as quatro sempre aparecem; m² = unidades × m² por unidade; peças distintas", () => {
    const r = agregarMaquinas([
      { maquina: "1", itemId: "a", unidades: 4, registros: 2, calculatedM2: "20.00", quantity: 10 }, // 2 m²/un
      { maquina: "1", itemId: "b", unidades: 1, registros: 1, calculatedM2: "3", quantity: 1 },
      { maquina: "9", itemId: "c", unidades: 1, registros: 1, calculatedM2: "1", quantity: 0 }, // quantidade 0: m² 0, nunca NaN
    ]);
    expect(r.map((m) => m.codigo)).toEqual(["1", "2", "3", "4", "9"]);
    expect(r[0]).toMatchObject({ codigo: "1", unidades: 5, m2: 11, registros: 3, pecas: 2 });
    expect(r[0].maquina).toContain("Impressora 1");
    expect(r[1]).toMatchObject({ unidades: 0, m2: 0, pecas: 0 });
    expect(r[4]).toMatchObject({ m2: 0 });
  });

  it("reaproveitado × impresso: parcial divide, total vai inteiro, fora do funil sai", () => {
    const r = agregarReuso([
      { status: "delivered", type: "Pórtico", quantity: 10, reuseQty: 4, isReuse: false, calculatedM2: "20" }, // 2 m²/un
      { status: "delivered", type: "Placa", quantity: 3, reuseQty: 0, isReuse: true, calculatedM2: "3" },
      { status: "delivered", type: "Placa", quantity: 2, reuseQty: 0, isReuse: false, calculatedM2: "2" },
      { status: "canceled", type: "Placa", quantity: 50, reuseQty: 0, isReuse: false, calculatedM2: "50" },
    ]);
    expect(r.reaproveitadas).toEqual({ pecas: 2, unidades: 7, m2: 11 });
    expect(r.impressas).toEqual({ pecas: 2, unidades: 8, m2: 14 });
  });
});

describe("a rota GET /api/analises/operacao", () => {
  const { chamar } = capturarRotas((app) => registerAnaliseRoutes(app));
  beforeEach(() => {
    limparMemoAnalises();
    H.db.execute.mockClear();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it("só admin: sem sessão 401, outro papel 403 — e nenhuma consulta roda", async () => {
    expect((await chamar("GET /api/analises/operacao", {})).status).toBe(401);
    for (const papel of ["solicitacao", "arte", "grafica", "atendimento"]) {
      const r = await chamar("GET /api/analises/operacao", { sessao: { userId: "u1", userRole: papel, userName: "X" } });
      expect(r.status, papel).toBe(403);
    }
    expect(H.db.execute).not.toHaveBeenCalled();
  });

  it("o tempo por etapa também virou só admin", async () => {
    const r = await chamar("GET /api/analises/tempo-por-etapa", { sessao: { userId: "u1", userRole: "grafica", userName: "X" } });
    expect(r.status).toBe(403);
  });

  it("data torta é 400 com a frase", async () => {
    const r = await chamar("GET /api/analises/operacao", { sessao: { userId: "u1", userRole: "admin", userName: "Maria" }, query: { de: "amanhã" } });
    expect(r.status).toBe(400);
    expect((r.body as { error: string }).error).toMatch(/Data inicial inválida/);
    expect(H.db.execute).not.toHaveBeenCalled();
  });

  it("admin recebe o contrato inteiro mesmo com o banco vazio, e a segunda chamada vem do memo", async () => {
    const admin = { userId: "u1", userRole: "admin", userName: "Maria" };
    const query = { de: "2026-09-01", ate: "2026-09-03", evento: "all" };
    const r = await chamar("GET /api/analises/operacao", { sessao: admin, query });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const b = r.body as OperacaoDaAnalise;
    expect(b.janela).toEqual({ de: "2026-09-01T03:00:00.000Z", ate: "2026-09-04T03:00:00.000Z", evento: null, patrocinador: null });
    expect(b.aprovacao).toEqual({ pendentesAgora: 0, esperaPorPatrocinador: [], decididasNoPeriodo: { aprovadas: 0, reprovadas: 0 }, motivosDeReprovacao: [], diasAteDecidirMediana: null });
    expect(b.grafica.porMaquina).toHaveLength(4);
    expect(b.grafica.porDia.map((d) => d.dia)).toEqual(["2026-09-01", "2026-09-02", "2026-09-03"]);
    expect(b.grafica.embaladasPorDia).toHaveLength(3);
    expect(b.pessoas.cobertura).toEqual({ linhasLidas: 0, truncado: false, teto: TETO_DA_TRILHA, soAcoesEmPecas: false });
    expect(b.estoque.pedidosDePeca).toEqual({ abertos: 0, atendidosNoPeriodo: 0, recusadosNoPeriodo: 0 });
    expect(b.arte).toEqual({ versoesNoPeriodo: {}, pecasComMaisVersoes: [] });

    const consultas = H.db.execute.mock.calls.length;
    expect(consultas).toBeGreaterThan(0);
    const de_novo = await chamar("GET /api/analises/operacao", { sessao: admin, query });
    expect(de_novo.body).toEqual(r.body);
    expect(H.db.execute.mock.calls.length).toBe(consultas);
  });

  it("falha do banco vira 500 com frase, não um stack", async () => {
    H.db.execute.mockRejectedValueOnce(new Error("conexão caiu"));
    const r = await chamar("GET /api/analises/operacao", { sessao: { userId: "u1", userRole: "admin", userName: "Maria" } });
    expect(r.status).toBe(500);
    expect((r.body as { error: string }).error).toMatch(/Não foi possível/);
  });
});
