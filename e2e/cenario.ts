// ─────────────────────────────────────────────────────────────────────────────
// O CENÁRIO — montar, pela API, o estado de onde cada fluxo COMEÇA.
//
// A regra que este arquivo carrega: o fluxo testa a SUA etapa pela tela; as
// etapas anteriores ele monta pela API. Levar a peça do zero até a Gráfica
// clicando em cinco telas faria o teste da Gráfica falhar quando a Arte
// mudasse de layout — e o relatório apontaria para o lugar errado.
//
// Tudo que se cria aqui nasce com o nome carimbado ("… E2E 20260922…"), para
// quem for limpar o banco de teste depois saber o que é de teste.
// ─────────────────────────────────────────────────────────────────────────────
import { expect, type APIRequestContext } from "@playwright/test";
import { nomeDoTeste, PDF_MINIMO, PNG_MINIMO } from "./apoio";

export interface Evento { id: string; name: string }
export interface Peca { id: string; eventId: string; displayId: string }

const emDias = (n: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

async function json<T>(r: { ok(): boolean; text(): Promise<string>; json(): Promise<any> }): Promise<T> {
  expect(r.ok(), await r.text()).toBe(true);
  return (await r.json()) as T;
}

/**
 * Um evento novo, com a saída do caminhão bem à frente: prazo apertado muda a
 * cor de meia tela e deixaria os testes dependentes do dia em que rodam.
 */
export async function criarEvento(api: APIRequestContext, prefixo = "COPA"): Promise<Evento> {
  return json<Evento>(
    await api.post("/api/events", {
      data: {
        name: nomeDoTeste(prefixo),
        startDate: emDias(60),
        truckDepartureDate: `${emDias(50)}T08:00`,
        franchise: "E2E",
      },
    }),
  );
}

/** Uma peça em rascunho no evento. `skipApproval` evita depender de patrocinador. */
export async function criarPeca(api: APIRequestContext, evento: Evento, over: Record<string, unknown> = {}): Promise<Peca> {
  const peca = await json<Peca>(
    await api.post("/api/items", {
      data: {
        eventId: evento.id,
        type: "Pórtico",
        description: "Pórtico de largada (E2E)",
        quantity: 2,
        material: "Lona 440g",
        finish: "Ilhós",
        measurement: "3.00 × 1.00",
        fileWidth: "3.00",
        fileHeight: "1.00",
        area: "3.00",
        visual: "3.00",
        calculatedM2: "6.00",
        skipApproval: true,
        ...over,
      },
    }),
  );
  return { ...peca, eventId: evento.id };
}

/** Sobe um arquivo pelo proxy de mesma origem e devolve a URL gravada. */
export async function subir(api: APIRequestContext, conteudo: Buffer, contentType: string): Promise<string> {
  const r = await api.put("/api/objects/upload-direct", { headers: { "content-type": contentType }, data: conteudo });
  return (await json<{ url: string }>(r)).url;
}

/**
 * Leva a peça até a fila da Arte (Aguardando Envio) — os dois degraus que a
 * Solicitação e a Vinculação dão:
 *   1. `/items/submit` promove TODO rascunho do evento (não aceita lista) para
 *      Aguardando Vinculação;
 *   2. `/items/send-to-arte` tira dali e põe em Aguardando Envio. A peça nasce
 *      com `skipApproval`, que é o que dispensa patrocinador neste passo.
 */
export async function atéAArte(api: APIRequestContext, evento: Evento, peca: Peca): Promise<void> {
  await json(await api.post(`/api/events/${evento.id}/items/submit`, { data: {} }));
  await json(await api.post("/api/items/send-to-arte", { data: { itemIds: [peca.id] } }));
}

/**
 * Leva a peça até a Revisão Final. Com `skipApproval`, o envio para aprovação
 * já cai na finalização da Arte; o arquivo final fecha em Aguardando Revisão.
 */
export async function atéARevisao(api: APIRequestContext, evento: Evento, peca: Peca): Promise<void> {
  await atéAArte(api, evento, peca);
  const thumb = await subir(api, PNG_MINIMO, "image/png");
  await json(await api.patch(`/api/items/${peca.id}/submit-for-approval`, { data: { approvalThumbUrl: thumb } }));
  const final = await subir(api, PDF_MINIMO, "application/pdf");
  await json(await api.patch(`/api/items/${peca.id}/submit-final-file`, { data: { finalFileUrl: final } }));
}

/** Leva a peça até a fila da Gráfica (Pronto para Produção). */
export async function atéAGrafica(api: APIRequestContext, evento: Evento, peca: Peca): Promise<void> {
  await atéARevisao(api, evento, peca);
  await json(await api.patch(`/api/items/${peca.id}/creator-review`, { data: { approved: true } }));
}

/**
 * Deixa o evento sem rastro no fim do fluxo. Falha aqui NÃO derruba o teste:
 * o que importa é o que o fluxo afirmou; sobra de evento no banco de teste é
 * sujeira, não defeito.
 */
export async function limpar(api: APIRequestContext, evento: Evento | undefined): Promise<void> {
  if (!evento) return;
  await api.delete(`/api/events/${evento.id}`).catch(() => undefined);
}
