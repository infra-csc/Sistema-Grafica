// ─────────────────────────────────────────────────────────────────────────────
// TEMPO REAL ENTRE CÓPIAS, RECORTE DO SINAL, TAREFAS EM UMA CÓPIA SÓ.
//
// O deploy é autoscale (várias cópias do servidor). O que este arquivo prende,
// por COMPORTAMENTO:
//   · o WebSocket leva só o SINAL (tipo + ids) — nunca a peça, o evento, o
//     comentário; o usuário do Kit nem os textos de aviso;
//   · o que chega do canal de outra cópia vai aos sockets daqui e derruba os
//     caches daqui; o eco da própria cópia é ignorado;
//   · "sessões encerradas" fecha os sockets daquele usuário (aqui e lá);
//   · a tarefa agendada roda em UMA cópia (trava + janela) e falha aberta.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";
import { WebSocket } from "ws";
import { recortarParaSinal, sinalParaKit, type MensagemWS } from "@shared/ws-mensagens";
import {
  wsClients, publicarMensagem, receberDoCanal, entregarAosSockets, textoDoEnvelope, urlDiretaDoBanco,
  iniciarTempoReal, ID_DESTA_COPIA, LIMITE_DO_NOTIFY, type SocketDoApp,
} from "../tempo-real";
import { eventsCacheGeneration, notifCacheGeneration, registrarCache, invalidarCacheNoCluster } from "../cache";
import { avisarSessoesEncerradas } from "../sessoes-encerradas";
import { rodarComTrava } from "../services/lideranca";

function socketFalso(dono: { userId?: string; userKit?: boolean } = {}) {
  const enviados: any[] = [];
  const s: any = {
    readyState: WebSocket.OPEN,
    userId: dono.userId,
    userKit: dono.userKit,
    fechado: null as null | number,
    send: (t: string) => enviados.push(JSON.parse(t)),
    close: (codigo: number) => { s.fechado = codigo; s.readyState = WebSocket.CLOSED; },
  };
  wsClients.add(s as SocketDoApp);
  return { s, enviados };
}

const PECA = {
  id: "p1", eventId: "e1", type: "Backdrop", description: "segredo do cliente", finalFileUrl: "/objects/x.pdf",
  kitRemessaId: "r1", criadoPorId: "u-kit", quantity: 3,
};

beforeEach(() => wsClients.clear());

describe("o sinal: só tipo, ids e os textos de aviso", () => {
  it("item_updated com a peça inteira vira {type, id, eventId, itemId, tipoDaPeca}", () => {
    const sinal = recortarParaSinal({ type: "item_updated", item: PECA });
    expect(sinal).toEqual({ type: "item_updated", id: "p1", eventId: "e1", itemId: "p1", tipoDaPeca: "Backdrop" });
    expect(JSON.stringify(sinal)).not.toContain("segredo");
  });

  it("lote vai como contagem — nunca a lista de ids ou de peças", () => {
    const ids = Array.from({ length: 500 }, (_, n) => `id-${n}`);
    expect(recortarParaSinal({ type: "items_bulk_updated", itemIds: ids, eventId: "e1" })).toEqual({ type: "items_bulk_updated", eventId: "e1", count: 500 });
    expect(recortarParaSinal({ type: "items_bulk_created", items: [PECA, PECA], eventId: "e1" })).toEqual({ type: "items_bulk_created", eventId: "e1", count: 2 });
  });

  it("aviso de prazo leva o nome do evento e as horas; comentário leva a peça", () => {
    expect(recortarParaSinal({ type: "deadline_alert", event: { id: "e1", name: "Arena X", truckDepartureDate: new Date() }, hoursRemaining: 12 }))
      .toEqual({ type: "deadline_alert", id: "e1", eventId: "e1", nome: "Arena X", hoursRemaining: 12 });
    expect(recortarParaSinal({ type: "new_comment", comment: { id: "c1", itemId: "p1", content: "texto" } }))
      .toEqual({ type: "new_comment", id: "c1", itemId: "p1" });
  });

  it("notificação sai sem o texto dela (o sino busca pela API, com o recorte do perfil)", () => {
    const sinal = recortarParaSinal({ type: "notification_created", notification: { id: "n1", eventId: "e1", message: "ALERTA: Faltam 12h" } });
    expect(sinal).toEqual({ type: "notification_created", id: "n1", eventId: "e1" });
  });

  it("o sinal do Kit perde os textos de aviso e mantém os ids", () => {
    const sinal = recortarParaSinal({ type: "item_approved", item: PECA });
    expect(sinalParaKit(sinal)).toEqual({ type: "item_approved", id: "p1", eventId: "e1", itemId: "p1" });
  });
});

describe("entrega aos sockets desta cópia", () => {
  it("broadcast entrega o sinal, derruba o cache de eventos e não o de notificações", () => {
    const { enviados } = socketFalso({ userId: "u1" });
    const ev = eventsCacheGeneration();
    const notif = notifCacheGeneration();
    publicarMensagem({ type: "production_started", item: PECA });
    expect(enviados).toEqual([{ type: "production_started", id: "p1", eventId: "e1", itemId: "p1", tipoDaPeca: "Backdrop" }]);
    expect(eventsCacheGeneration()).toBe(ev + 1);
    expect(notifCacheGeneration()).toBe(notif);
  });

  it("o usuário do Kit recebe o mesmo sinal sem os textos", () => {
    const comum = socketFalso({ userId: "u1" });
    const kit = socketFalso({ userId: "u-kit", userKit: true });
    entregarAosSockets({ type: "event_created", id: "e9", eventId: "e9", nome: "Evento de outro cliente" });
    expect(comum.enviados[0].nome).toBe("Evento de outro cliente");
    expect(kit.enviados[0]).toEqual({ type: "event_created", id: "e9", eventId: "e9" });
  });

  it("socket que não está aberto não recebe", () => {
    const { s, enviados } = socketFalso();
    s.readyState = WebSocket.CLOSING;
    entregarAosSockets({ type: "item_created", id: "p1" });
    expect(enviados).toEqual([]);
  });
});

describe("o canal entre cópias", () => {
  it("sinal de OUTRA cópia: vai aos sockets daqui e derruba o cache daqui", () => {
    const { enviados } = socketFalso();
    const ev = eventsCacheGeneration();
    receberDoCanal(JSON.stringify({ o: "outra-copia", k: "ws", s: { type: "item_deleted", id: "p1", eventId: "e1" } }));
    expect(enviados).toEqual([{ type: "item_deleted", id: "p1", eventId: "e1" }]);
    expect(eventsCacheGeneration()).toBe(ev + 1);
  });

  it("notificação de outra cópia derruba o cache de notificações, não o de eventos", () => {
    const ev = eventsCacheGeneration();
    const notif = notifCacheGeneration();
    receberDoCanal(JSON.stringify({ o: "outra-copia", k: "ws", s: { type: "notification_read" } }));
    expect(notifCacheGeneration()).toBe(notif + 1);
    expect(eventsCacheGeneration()).toBe(ev);
  });

  it("o eco da PRÓPRIA cópia é ignorado (ela já entregou na hora)", () => {
    const { enviados } = socketFalso();
    receberDoCanal(JSON.stringify({ o: ID_DESTA_COPIA, k: "ws", s: { type: "item_updated", id: "p1" } }));
    expect(enviados).toEqual([]);
  });

  it("lixo no canal não derruba nada", () => {
    expect(() => receberDoCanal("{não é json")).not.toThrow();
    expect(() => receberDoCanal("null")).not.toThrow();
  });

  it("invalidação de cache de outro módulo viaja pelo canal", () => {
    const limpar = vi.fn();
    registrarCache("teste-modulo", limpar);
    receberDoCanal(JSON.stringify({ o: "outra-copia", k: "cache", c: "teste-modulo" }));
    expect(limpar).toHaveBeenCalledTimes(1);
    invalidarCacheNoCluster("teste-modulo"); // aqui limpa na hora (e publica)
    expect(limpar).toHaveBeenCalledTimes(2);
  });

  it("payload acima do limite do NOTIFY vai só com o tipo", () => {
    const grande = { o: "x", k: "ws" as const, s: { type: "item_updated" as const, message: "a".repeat(200), id: "p".repeat(200) } };
    expect(Buffer.byteLength(textoDoEnvelope(grande))).toBeLessThanOrEqual(LIMITE_DO_NOTIFY);
    const enorme: any = { o: "x", k: "ws", s: { type: "item_updated", lixo: "b".repeat(LIMITE_DO_NOTIFY) } };
    expect(JSON.parse(textoDoEnvelope(enorme))).toEqual({ o: "x", k: "ws", s: { type: "item_updated" } });
  });

  it("o LISTEN vai ao endereço direto do Neon (o -pooler não entrega NOTIFY)", () => {
    expect(urlDiretaDoBanco("postgresql://u:p@ep-abc-123-pooler.us-east-2.aws.neon.tech/db?sslmode=require"))
      .toBe("postgresql://u:p@ep-abc-123.us-east-2.aws.neon.tech/db?sslmode=require");
    expect(urlDiretaDoBanco("postgresql://u:p@localhost:5432/db")).toBe("postgresql://u:p@localhost:5432/db");
  });
});

describe("sessões encerradas derrubam os sockets", () => {
  it("só os do usuário, aqui e vindo de outra cópia", () => {
    iniciarTempoReal(); // em teste: só local, sem banco
    const alvo = socketFalso({ userId: "u-demitido" });
    const outro = socketFalso({ userId: "u-fica" });
    avisarSessoesEncerradas("u-demitido");
    expect(alvo.s.fechado).toBe(4001);
    expect(outro.s.fechado).toBeNull();
    expect(wsClients.has(alvo.s)).toBe(false);

    const deLa = socketFalso({ userId: "u-fica" });
    receberDoCanal(JSON.stringify({ o: "outra-copia", k: "encerradas", u: "u-fica" }));
    expect(deLa.s.fechado).toBe(4001);
    expect(outro.s.fechado).toBe(4001);
  });
});

describe("tarefa agendada em UMA cópia", () => {
  const bancoFalso = (trava: boolean | Error) => ({
    transaction: async (cb: any) => {
      if (trava instanceof Error) throw trava;
      await cb({ execute: async () => ({ rows: [{ ok: trava }] }) });
    },
  });
  const reservas = () => {
    const tomadas = new Set<string>();
    return {
      tomadas,
      reservar: async (c: string) => { if (tomadas.has(c)) return false; tomadas.add(c); return true; },
      desfazer: async (c: string) => { tomadas.delete(c); },
    };
  };

  it("outra cópia rodando agora (trava ocupada): não roda", async () => {
    const fn = vi.fn(async () => {});
    expect(await rodarComTrava(bancoFalso(false), "t", fn, {}, reservas())).toBe("outra-copia-rodando");
    expect(fn).not.toHaveBeenCalled();
  });

  it("três cópias na mesma janela: só a primeira roda", async () => {
    const r = reservas();
    const fn = vi.fn(async () => {});
    const resultados = [];
    for (let n = 0; n < 3; n++) resultados.push(await rodarComTrava(bancoFalso(true), "fecho", fn, { janelaMs: 3_600_000 }, r));
    expect(resultados).toEqual(["rodou", "janela-ja-feita", "janela-ja-feita"]);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("a tarefa falhou: a janela é devolvida e a próxima tentativa roda", async () => {
    const r = reservas();
    const falha = vi.fn(async () => { throw new Error("banco caiu no meio"); });
    await expect(rodarComTrava(bancoFalso(true), "fecho", falha, { janelaMs: 3_600_000 }, r)).rejects.toThrow("banco caiu no meio");
    expect(r.tomadas.size).toBe(0);
    const ok = vi.fn(async () => {});
    expect(await rodarComTrava(bancoFalso(true), "fecho", ok, { janelaMs: 3_600_000 }, r)).toBe("rodou");
    expect(ok).toHaveBeenCalledTimes(1);
  });

  it("sem a trava (banco fora): FALHA ABERTA — roda mesmo assim", async () => {
    const fn = vi.fn(async () => {});
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await rodarComTrava(bancoFalso(new Error("conexão recusada")), "t", fn, {}, reservas())).toBe("rodou");
    expect(fn).toHaveBeenCalledTimes(1);
    aviso.mockRestore();
  });
});

describe("contrato: toda mensagem que o servidor manda está no contrato", () => {
  it("todo broadcast({ type: … }) do servidor é um tipo de MensagemWS com sinal", async () => {
    const { readFileSync, readdirSync } = await import("fs");
    const path = await import("path");
    const raiz = path.resolve(__dirname, "..");
    const arquivos: string[] = [];
    const andar = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.name === "__tests__") continue;
        const p = path.join(dir, e.name);
        if (e.isDirectory()) andar(p); else if (p.endsWith(".ts")) arquivos.push(p);
      }
    };
    andar(raiz);
    const tipos = new Set<string>();
    for (const a of arquivos) {
      const fonte = readFileSync(a, "utf8");
      for (const m of fonte.matchAll(/broadcast\(\s*\{\s*type:\s*["']([a-z_]+)["']/g)) tipos.add(m[1]);
    }
    expect(tipos.size).toBeGreaterThan(40);
    // Cada tipo produz um sinal com o próprio tipo (o recorte não inventa nada).
    for (const t of Array.from(tipos)) {
      expect(recortarParaSinal({ type: t } as MensagemWS).type).toBe(t);
    }
    const { CHAVES_POR_MENSAGEM } = await import("../../client/src/lib/tempo-real-grafica");
    for (const t of Array.from(tipos)) expect(Object.keys(CHAVES_POR_MENSAGEM), t).toContain(t);
  });
});
