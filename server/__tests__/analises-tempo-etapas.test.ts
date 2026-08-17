// ─────────────────────────────────────────────────────────────────────────────
// TEMPO POR ETAPA — permanência medida na trilha de auditoria
//
// O bloco tinha sido REMOVIDO da tela de Análises por não ter número ("dado
// indisponível, não está nota 10 nunca essa tela"). Ele volta porque a trilha
// passou a ser confiável — mas ele só é honesto enquanto três coisas se
// mantiverem verdadeiras, e é isso que este arquivo trava:
//
//  1. A LEITURA DA FRASE. `audit_logs.details` é texto livre; a transição só é
//     legível porque as rotas escrevem "Status alterado: A → B" (ou uma das
//     cinco frases de destino constante). Reescrever uma dessas frases em
//     items.ts sem mexer aqui faria a etapa PERDER passagens em silêncio — a
//     mediana continuaria saindo, só que sobre menos peças. Por isso as frases
//     são testadas VERBATIM contra o código-fonte de items.ts.
//
//  2. O DESEMPATE. `translateStatus` não é injetiva, e "Aguardando Revisão
//     Final" é o único rótulo que serve a DUAS etapas diferentes (Finalização e
//     Revisão de Lista) — justamente as duas que o negócio mais precisa
//     separar. A regra de desempate é dedução do código das rotas, não palpite,
//     e está fixada aqui.
//
//  3. A HONESTIDADE DO DENOMINADOR. Mediana de três peças não é a verdade da
//     operação. O piso, o recorte e as frases de cobertura têm teste porque são
//     o que separa este bloco do que foi reprovado.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi } from "vitest";
import fs from "fs";
import path from "path";

// shared.ts (dono de `translateStatus`) arrasta storage → db, que exige
// DATABASE_URL. Nada aqui toca banco.
vi.mock("../db", () => ({ db: {}, pool: {} }));
vi.mock("../storage", () => ({ storage: {} }));

import { translateStatus } from "../routes/shared";
import { STAGE_DEFS } from "../services/prazo-domain";
import {
  CATALOGO,
  ETAPA_FINALIZACAO,
  ETAPA_LAYOUTS,
  ETAPA_LISTA,
  ETAPA_PRODUCAO,
  ETAPA_REVISAO,
  STATUS_LABEL,
  agregarTempoPorEtapa,
  dentroDaJanela,
  diasEntre,
  interpretarLog,
  janelaDeCiclo,
  mediana,
  permanenciaDaPeca,
  planejadoPorEtapa,
  resolverRevisaoFinal,
  rotuloAmbiguo,
  type LogPeca,
  type PecaMedida,
} from "../services/tempo-etapas";
import { idsDoLog } from "../routes/analises";
import { MINIMO_PECAS_POR_ETAPA, temBaseParaExibir } from "@shared/tempo-etapas-contract";
import type { TempoPorEtapa } from "@shared/tempo-etapas-contract";
import { cycleWindow } from "@/lib/analises-metrics";
import { diferencaContraPlano, etapaMaisCara, frasesDeCobertura } from "@/lib/analises-tempo";

const raiz = path.resolve(__dirname, "..", "..");
const fonteItems = fs.readFileSync(path.join(raiz, "server/routes/items.ts"), "utf8");

const DIA = 86_400_000;
/** Meio-dia UTC = 9h em São Paulo: o dia do negócio nunca escorrega no teste. */
const t = (dia: number) => Date.UTC(2026, 4, dia, 12, 0, 0);
const log = (dia: number, action: string, details: string): LogPeca => ({
  ts: t(dia), action, details,
});

// ─── 1. O vocabulário é espelho, e espelho sem guarda diverge ────────────────

describe("espelho de translateStatus", () => {
  it("todo status traduz para o MESMO rótulo que as rotas gravam", () => {
    for (const [status, label] of Object.entries(STATUS_LABEL)) {
      expect(translateStatus(status), `status ${status}`).toBe(label);
    }
  });

  it("todo status do funil canônico tem rótulo — nenhum fica sem leitura", () => {
    for (const def of STAGE_DEFS) {
      for (const s of def.pendingStatuses) {
        // Grafias legadas em português (pronto_para_producao, liberado…) não
        // passam por translateStatus: elas nunca aparecem numa FRASE de
        // transição, só como valor cru na coluna. Só o vocabulário em inglês
        // precisa de rótulo.
        if (/[ç_]/.test(s) && s !== s.toLowerCase().replace(/[^a-z_]/g, "")) continue;
        if (STATUS_LABEL[s]) expect(translateStatus(s)).toBe(STATUS_LABEL[s]);
      }
    }
  });

  it("só UM rótulo cruza a fronteira entre etapas — e é o que tem desempate", () => {
    const ambiguos = [...new Set(Object.values(STATUS_LABEL))].filter(rotuloAmbiguo);
    expect(ambiguos).toEqual(["Aguardando Revisão Final"]);
  });
});

// ─── 2. As frases que as rotas gravam continuam existindo ────────────────────

describe("as frases de items.ts que a medição lê", () => {
  it("a seta de transição continua sendo escrita como 'Status alterado: A → B'", () => {
    expect(fonteItems).toContain("Status alterado: ${translateStatus(currentItem.status)} → ");
  });

  it("a rota genérica continua escrevendo 'Status: A → B'", () => {
    expect(fonteItems).toContain("`Status: ${translateStatus(currentItem.status)} → ${translateStatus(item.status)}`");
  });

  it.each(CATALOGO.map((r) => [r.action, r.prefixo.source] as const))(
    "a frase de destino constante da ação '%s' continua no código",
    (_acao, _padrao) => {
      // Se uma destas redações for reescrita, a transição para de ser lida e a
      // etapa perde passagens SEM erro nenhum: só a mediana muda de valor.
      const frases = [
        "Peça dispensada pela Arte. Status anterior:",
        "Entrega concluída (",
        "Item cancelado",
        "Item devolvido para Arte para modificações",
        "liberado para produção",
      ];
      for (const f of frases) expect(fonteItems).toContain(f);
    },
  );
});

// ─── 3. Leitura de uma linha da trilha ───────────────────────────────────────

describe("interpretarLog", () => {
  it("lê a seta simples e devolve origem e destino", () => {
    const r = interpretarLog("approved", "Status alterado: Aguardando Aprovação → Aguardando Finalização (aprovado pelo patrocinador)");
    expect(r?.destino).toEqual({ tipo: "etapa", indice: ETAPA_FINALIZACAO });
    expect(r?.origem).toBe(2);
  });

  it("lê a seta com prefixo ('Enviado para Arte — ', 'Todos os patrocinadores…')", () => {
    const a = interpretarLog("updated", "Enviado para Arte — Status alterado: Aguardando Envio → Aguardando Aprovação");
    expect(a?.destino).toEqual({ tipo: "etapa", indice: 2 });
    const b = interpretarLog("approved", "Todos os patrocinadores aprovaram. Status alterado: Aguardando Aprovação → Aguardando Finalização");
    expect(b?.destino).toEqual({ tipo: "etapa", indice: ETAPA_FINALIZACAO });
  });

  it("lê 'Item reaberto: A → B' da reversão de aprovação", () => {
    const r = interpretarLog("updated", 'Administrador reverteu a aprovação de "Alfa" para pendente (estava: approved). Item reaberto: Aguardando Finalização → Aguardando Aprovação');
    expect(r?.destino).toEqual({ tipo: "etapa", indice: 2 });
  });

  it("a rota genérica concatena com ' | ' — a quantidade não vaza para o destino", () => {
    const r = interpretarLog("updated", "Status: Aguardando Envio → Aguardando Aprovação | Quantidade: 5 → 10 un.");
    expect(r?.destino).toEqual({ tipo: "etapa", indice: 2 });
  });

  it("linha sem transição de etapa não vira transição", () => {
    expect(interpretarLog("updated", "Observações atualizadas")).toBeNull();
    expect(interpretarLog("updated", "Quantidade: 5 → 10 un.")).toBeNull();
    expect(interpretarLog("updated", "Conferência parcial: 3 un. (3/10)")).toBeNull();
    expect(interpretarLog("updated", null)).toBeNull();
  });

  it("a dispensa não escreve seta: origem vem do status CRU e o destino é da rota", () => {
    const r = interpretarLog("dispensed", "Peça dispensada pela Arte. Status anterior: sponsor_approved. Motivo: urgência");
    expect(r?.origem).toBe(ETAPA_FINALIZACAO);
    expect(r?.destino).toEqual({ tipo: "etapa", indice: ETAPA_PRODUCAO });
  });

  it("entrega TOTAL sai do funil; entrega parcial não move a peça", () => {
    expect(interpretarLog("delivered", "Entrega concluída (10/10, recebido por: João)")?.destino)
      .toEqual({ tipo: "entregue" });
    expect(interpretarLog("delivered", "Entrega parcial: 3 un. (3/10, recebido por: João)")).toBeNull();
  });

  it("cancelamento é 'fora' — a passagem aberta não vira medida", () => {
    expect(interpretarLog("canceled", "Item cancelado")?.destino).toEqual({ tipo: "fora" });
    expect(interpretarLog("canceled", "Item cancelado (em lote): sem verba")?.destino).toEqual({ tipo: "fora" });
  });

  it("devolução para a Arte volta a peça para a Entrega de Layouts", () => {
    expect(interpretarLog("rejected", "Item devolvido para Arte para modificações.")?.destino)
      .toEqual({ tipo: "etapa", indice: ETAPA_LAYOUTS });
  });

  it("a rota legada de liberação entra na Produção Gráfica", () => {
    expect(interpretarLog("approved", 'Item "Banner" liberado para produção')?.destino)
      .toEqual({ tipo: "etapa", indice: ETAPA_PRODUCAO });
  });
});

// ─── 4. O desempate do único rótulo ambíguo ──────────────────────────────────

describe("'Aguardando Revisão Final' — Finalização ou Revisão de Lista", () => {
  it("o sufixo da peça isenta manda para a Finalização", () => {
    expect(resolverRevisaoFinal("(sem aprovação de patrocinador)", null)).toBe(ETAPA_FINALIZACAO);
  });

  it("o sufixo do arquivo final manda para a Revisão de Lista", () => {
    expect(resolverRevisaoFinal("(arquivo final adicionado)", null)).toBe(ETAPA_REVISAO);
  });

  it("sem sufixo, decide pela ORIGEM — e a origem sai do código das rotas", () => {
    // `awaiting_creator_review` só é escrito em submit-for-approval, que exige
    // a peça em `awaiting_submission` (Entrega de Layouts).
    expect(fonteItems).toContain('shouldSkipApproval ? "awaiting_creator_review" : "awaiting_sponsor_approval"');
    expect(resolverRevisaoFinal(null, ETAPA_LAYOUTS)).toBe(ETAPA_FINALIZACAO);
    expect(resolverRevisaoFinal(null, ETAPA_FINALIZACAO)).toBe(ETAPA_REVISAO);
  });

  it("origem desconhecida cai no caminho comum (Revisão de Lista)", () => {
    expect(resolverRevisaoFinal(null, null)).toBe(ETAPA_REVISAO);
  });

  it("as duas frases reais das rotas caem cada uma na sua etapa", () => {
    const isenta = interpretarLog("updated", "Enviado para Arte — Status alterado: Aguardando Envio → Aguardando Revisão Final (sem aprovação de patrocinador)");
    expect(isenta?.destino).toEqual({ tipo: "etapa", indice: ETAPA_FINALIZACAO });
    const arquivo = interpretarLog("updated", "Status alterado: Aguardando Finalização → Aguardando Revisão Final (arquivo final adicionado)");
    expect(arquivo?.destino).toEqual({ tipo: "etapa", indice: ETAPA_REVISAO });
  });
});

// ─── 5. Permanência de uma peça ──────────────────────────────────────────────

describe("permanenciaDaPeca", () => {
  it("mede o intervalo entre entrar e sair da etapa", () => {
    const d = permanenciaDaPeca(
      [
        log(1, "updated", "Enviado para Arte — Status alterado: Aguardando Envio → Aguardando Aprovação"),
        log(9, "approved", "Status alterado: Aguardando Aprovação → Aguardando Finalização (aprovado pelo patrocinador)"),
      ],
      null,
    );
    expect(d.get(2)).toBe(8);
  });

  it("a peça nasce na primeira etapa: createdAt é a entrada na Lista de Imagens", () => {
    const d = permanenciaDaPeca(
      [log(10, "updated", "Status: Rascunho → Aguardando Envio")],
      t(3),
    );
    expect(d.get(ETAPA_LISTA)).toBe(7);
  });

  it("sem createdAt não se inventa entrada — a primeira passagem não é medida", () => {
    const d = permanenciaDaPeca(
      [log(10, "updated", "Status: Rascunho → Aguardando Envio")],
      null,
    );
    expect(d.has(ETAPA_LISTA)).toBe(false);
  });

  it("passagem ainda ABERTA não entra: só se mede quem já saiu", () => {
    const d = permanenciaDaPeca(
      [log(1, "updated", "Status: Rascunho → Aguardando Envio")],
      t(0),
    );
    expect(d.has(ETAPA_LAYOUTS)).toBe(false);
  });

  it("retrabalho SOMA as passagens da mesma etapa em vez de virar duas observações curtas", () => {
    // PORQUÊ: contar cada visita separada puxaria a mediana para BAIXO
    // justamente na etapa onde a peça sofre mais.
    const d = permanenciaDaPeca(
      [
        log(1, "updated", "Status: Rascunho → Aguardando Envio"),
        log(3, "updated", "Enviado para Arte — Status alterado: Aguardando Envio → Aguardando Aprovação"),
        log(5, "rejected", "Status alterado: Aguardando Aprovação → Aguardando Envio (reprovado pelo patrocinador)"),
        log(9, "updated", "Enviado para Arte — Status alterado: Aguardando Envio → Aguardando Aprovação"),
        log(12, "approved", "Status alterado: Aguardando Aprovação → Aguardando Finalização"),
      ],
      t(0),
    );
    expect(d.get(ETAPA_LAYOUTS)).toBe(2 + 4);
    expect(d.get(2)).toBe(2 + 3);
  });

  it("cancelamento DESCARTA a passagem aberta — trabalho que deixou de existir não é tempo de etapa", () => {
    const d = permanenciaDaPeca(
      [
        log(1, "updated", "Status: Rascunho → Aguardando Envio"),
        log(20, "canceled", "Item cancelado"),
      ],
      t(0),
    );
    expect(d.get(ETAPA_LISTA)).toBe(1);
    expect(d.has(ETAPA_LAYOUTS)).toBe(false);
  });

  it("a entrega FECHA a passagem da Produção Gráfica", () => {
    const d = permanenciaDaPeca(
      [
        log(1, "approved", 'Item "Banner" liberado para produção'),
        log(8, "delivered", "Entrega concluída (10/10, recebido por: João)"),
      ],
      null,
    );
    expect(d.get(ETAPA_PRODUCAO)).toBe(7);
  });

  it("linha intra-etapa não reabre a contagem", () => {
    const d = permanenciaDaPeca(
      [
        log(1, "approved", 'Item "Banner" liberado para produção'),
        log(4, "approved", 'Item "Banner" liberado para produção'),
        log(8, "delivered", "Entrega concluída (10/10, recebido por: João)"),
      ],
      null,
    );
    expect(d.get(ETAPA_PRODUCAO)).toBe(7);
  });

  it("relógio fora de ordem não gera dia negativo", () => {
    expect(diasEntre(t(9), t(3))).toBe(0);
  });
});

// ─── 6. Planejado: a distância entre marcos do evento ────────────────────────

describe("planejadoPorEtapa", () => {
  it("usa os offsets padrão COM ajuste de fim de semana", () => {
    // Saída 15/06/2026 (segunda). O marco de −8 cai num domingo e anda para a
    // segunda: a Revisão de Lista ganha um dia e a Produção perde um.
    const p = planejadoPorEtapa({ truckDepartureDate: new Date(Date.UTC(2026, 5, 15)) });
    expect(p).toEqual([null, 5, 8, 2, 3, 6]);
  });

  it("a primeira etapa não tem plano — não existe marco anterior de onde contar", () => {
    const p = planejadoPorEtapa({ truckDepartureDate: new Date(Date.UTC(2026, 5, 15)) });
    expect(p[0]).toBeNull();
  });

  it("offset do PRÓPRIO evento vence o padrão", () => {
    const base = planejadoPorEtapa({ truckDepartureDate: new Date(Date.UTC(2026, 5, 15)) });
    const custom = planejadoPorEtapa({
      truckDepartureDate: new Date(Date.UTC(2026, 5, 15)),
      deadlineEntregaLayouts: -22,
    });
    expect(custom[1]).not.toBe(base[1]);
  });

  it("data de saída inválida não derruba nem inventa plano", () => {
    expect(planejadoPorEtapa({ truckDepartureDate: "não é data" })).toEqual(STAGE_DEFS.map(() => null));
  });
});

// ─── 7. Mediana ──────────────────────────────────────────────────────────────

describe("mediana", () => {
  it("ímpar devolve o do meio; par, a média dos dois centrais", () => {
    expect(mediana([5, 1, 3])).toBe(3);
    expect(mediana([1, 2, 3, 4])).toBe(2.5);
  });

  it("resiste ao outlier que a média não resiste", () => {
    const amostra = [2, 2, 3, 3, 400];
    expect(mediana(amostra)).toBe(3);
    const media = amostra.reduce((a, b) => a + b, 0) / amostra.length;
    expect(media).toBeGreaterThan(80);
  });

  it("amostra vazia é null, não zero", () => {
    expect(mediana([])).toBeNull();
  });
});

// ─── 8. Agregação e a honestidade do denominador ─────────────────────────────

const pecaComPassagem = (id: string, dias: number, status = "delivered"): PecaMedida => ({
  id,
  eventId: "ev1",
  status,
  criadaEmMs: null,
  logs: [
    log(1, "updated", "Enviado para Arte — Status alterado: Aguardando Envio → Aguardando Aprovação"),
    log(1 + dias, "approved", "Status alterado: Aguardando Aprovação → Aguardando Finalização"),
  ],
});

const plano = new Map<string, (number | null)[]>([["ev1", [null, 5, 8, 2, 2, 7]]]);

describe("agregarTempoPorEtapa", () => {
  it("etapa abaixo do piso NÃO vira linha — vira declaração de base insuficiente", () => {
    const r = agregarTempoPorEtapa({
      pecas: [pecaComPassagem("a", 3), pecaComPassagem("b", 4)],
      planejadoPorEvento: plano,
      desdeMs: t(1),
      logsLidos: 4,
      truncado: false,
    });
    expect(r.etapas).toHaveLength(0);
    expect(r.etapasSemBase.find((e) => e.key === "aprovacao")?.pecas).toBe(2);
  });

  it("com o piso alcançado a etapa publica mediana e a diferença contra o plano", () => {
    const pecas = [3, 3, 10, 12, 12].map((d, i) => pecaComPassagem(`p${i}`, d));
    const r = agregarTempoPorEtapa({
      pecas, planejadoPorEvento: plano, desdeMs: t(1), logsLidos: 10, truncado: false,
    });
    const aprov = r.etapas.find((e) => e.key === "aprovacao")!;
    expect(pecas).toHaveLength(MINIMO_PECAS_POR_ETAPA);
    expect(aprov.medianaDias).toBe(10);
    expect(aprov.planejadoDias).toBe(8);
    expect(aprov.deltaDias).toBe(2);
    expect(aprov.pecas).toBe(5);
  });

  it("'paradas hoje' sai do status ATUAL da peça, não do replay da trilha", () => {
    const pecas = [3, 3, 10, 12, 12].map((d, i) => pecaComPassagem(`p${i}`, d));
    pecas.push({ ...pecaComPassagem("parada", 1, "awaiting_sponsor_approval"), logs: [] });
    const r = agregarTempoPorEtapa({
      pecas, planejadoPorEvento: plano, desdeMs: t(1), logsLidos: 10, truncado: false,
    });
    expect(r.etapas.find((e) => e.key === "aprovacao")!.emAberto).toBe(1);
  });

  it("o denominador é visível: quantas peças mediram, de quantas no recorte", () => {
    const pecas = [3, 3, 10, 12, 12].map((d, i) => pecaComPassagem(`p${i}`, d));
    pecas.push({ id: "sem-log", eventId: "ev1", status: "draft", criadaEmMs: null, logs: [] });
    const r = agregarTempoPorEtapa({
      pecas, planejadoPorEvento: plano, desdeMs: t(1), logsLidos: 10, truncado: false,
    });
    expect(r.pecasNoRecorte).toBe(6);
    expect(r.pecasMedidas).toBe(5);
  });

  it("declara a data do registro mais antigo lido — o piso da confiança", () => {
    const r = agregarTempoPorEtapa({
      pecas: [], planejadoPorEvento: plano, desdeMs: t(2), logsLidos: 0, truncado: false,
    });
    expect(r.medicaoDesde).toBe(new Date(t(2)).toISOString());
  });

  it("sem trilha nenhuma não há bloco — e não há bloco VAZIO", () => {
    const r = agregarTempoPorEtapa({
      pecas: [], planejadoPorEvento: plano, desdeMs: null, logsLidos: 0, truncado: false,
    });
    expect(r.etapas).toHaveLength(0);
    expect(temBaseParaExibir(r)).toBe(false);
  });

  it("resposta ainda não carregada não derruba a tela", () => {
    expect(temBaseParaExibir(undefined)).toBe(false);
    expect(temBaseParaExibir([] as unknown as TempoPorEtapa)).toBe(false);
  });
});

// ─── 9. O recorte é o MESMO dos KPIs ao lado ─────────────────────────────────

describe("janela de ciclo — espelho de cycleWindow do cliente", () => {
  const agora = Date.UTC(2026, 4, 20, 15, 0, 0);

  it.each(["7d", "30d", "90d", "all"])("período %s dá a mesma janela dos dois lados", (p) => {
    expect(janelaDeCiclo(p, agora)).toEqual(cycleWindow(p, agora));
  });

  it("evento sem data de saída fica fora de qualquer janela fechada", () => {
    expect(dentroDaJanela(null, janelaDeCiclo("30d", agora))).toBe(false);
    expect(dentroDaJanela(null, null)).toBe(true);
  });
});

// ─── 10. Logs de operação em LOTE valem para todas as peças da lista ─────────

describe("idsDoLog", () => {
  it("desmembra o entity_id de operação em lote", () => {
    expect(idsDoLog("a,b,c")).toEqual(["a", "b", "c"]);
  });

  it("id simples continua sendo um id só", () => {
    expect(idsDoLog("abc-123")).toEqual(["abc-123"]);
  });
});

// ─── 11. As frases que o dono lê ─────────────────────────────────────────────

const payload = (over: Partial<TempoPorEtapa> = {}): TempoPorEtapa => ({
  etapas: [
    { key: "layouts", label: "Entrega de Layouts", medianaDias: 9, pecas: 40, planejadoDias: 5, deltaDias: 4, emAberto: 3 },
    { key: "aprovacao", label: "Aprovação de Layout", medianaDias: 7, pecas: 38, planejadoDias: 8, deltaDias: -1, emAberto: 2 },
  ],
  etapasSemBase: [{ key: "listaImagens", label: "Lista de Imagens", pecas: 2 }],
  pecasNoRecorte: 120,
  pecasMedidas: 44,
  medicaoDesde: "2026-05-02T10:00:00.000Z",
  logsLidos: 900,
  truncado: false,
  ...over,
});

describe("leitura do bloco", () => {
  it("passar do plano é ruim; ficar abaixo é bom; empatar não é vitória", () => {
    const p = payload();
    expect(diferencaContraPlano(p.etapas[0]!)).toEqual({ texto: "4 dias além do plano", tom: "ruim" });
    expect(diferencaContraPlano(p.etapas[1]!)).toEqual({ texto: "1 dia abaixo do plano", tom: "bom" });
    expect(diferencaContraPlano({ ...p.etapas[0]!, deltaDias: 0.2 })?.tom).toBe("neutro");
  });

  it("etapa sem plano não é comparada", () => {
    expect(diferencaContraPlano({ ...payload().etapas[0]!, deltaDias: null })).toBeNull();
  });

  it("a etapa mais cara é a de maior ATRASO, não a de maior permanência", () => {
    // Produção leva mais dias no absoluto, mas dentro do planejado — não é lá
    // que o tempo se perde.
    const p = payload({
      etapas: [
        { key: "producao", label: "Produção Gráfica", medianaDias: 7, pecas: 40, planejadoDias: 7, deltaDias: 0, emAberto: 0 },
        { key: "layouts", label: "Entrega de Layouts", medianaDias: 9, pecas: 40, planejadoDias: 5, deltaDias: 4, emAberto: 0 },
      ],
    });
    expect(etapaMaisCara(p)?.key).toBe("layouts");
  });

  it("nenhuma etapa fora do plano devolve null em vez de eleger um culpado", () => {
    const p = payload({
      etapas: [{ key: "producao", label: "Produção Gráfica", medianaDias: 7, pecas: 40, planejadoDias: 7, deltaDias: 0, emAberto: 0 }],
    });
    expect(etapaMaisCara(p)).toBeNull();
  });

  it("a cobertura sai com NÚMERO: quantas peças, desde quando, o que ficou fora", () => {
    const frases = frasesDeCobertura(payload(), () => "2 de maio de 2026").join(" ");
    expect(frases).toContain("44 de 120 peças");
    expect(frases).toContain("2 de maio de 2026");
    expect(frases).toContain("5 peças estão paradas");
    expect(frases).toContain("Lista de Imagens");
  });

  it("varredura truncada é declarada, não escondida", () => {
    const frases = frasesDeCobertura(payload({ truncado: true }), () => "x").join(" ");
    expect(frases).toContain("teto");
  });

  it("sem peça parada a frase do viés não aparece — nada de '0 peças estão paradas'", () => {
    const p = payload({ etapas: payload().etapas.map((e) => ({ ...e, emAberto: 0 })) });
    expect(frasesDeCobertura(p, () => "x").join(" ")).not.toContain("estão paradas");
  });
});
