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
import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { entrar, nomeDoTeste, PDF_MINIMO, PNG_MINIMO } from "./apoio";

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

export const MODELO_E2E = "Pórtico E2E";

/**
 * O "Tipo" do formulário de lote lista os MODELOS cadastrados (tela Modelos);
 * num banco novo não há nenhum, e a linha não tem tipo para escolher. Cria o
 * modelo de teste uma vez (quem cria: Solicitação ou admin).
 */
export async function garantirModelo(api: APIRequestContext): Promise<string> {
  const lista = await json<{ name: string }[]>(await api.get("/api/standard-items"));
  if (!lista.some((m) => m.name === MODELO_E2E)) {
    await json(await api.post("/api/standard-items", {
      data: {
        name: MODELO_E2E, type: MODELO_E2E, material: "Lona", finish: "Ilhós",
        visualWidth: "3.00", visualHeight: "1.00", fileWidth: "3.00", fileHeight: "1.00",
      },
    }));
  }
  return MODELO_E2E;
}

/** Uma peça em rascunho no evento. `skipApproval` evita depender de patrocinador. */
export function dadosDaPeca(evento: Evento, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
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
  };
}

export async function criarPeca(api: APIRequestContext, evento: Evento, over: Record<string, unknown> = {}): Promise<Peca> {
  const peca = await json<Peca>(await api.post("/api/items", { data: dadosDaPeca(evento, over) }));
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
 *
 * Excluir evento é SÓ do admin — e no fim do teste a página costuma estar com
 * outro perfil (a Gráfica, a Arte). Por isso entra como admin antes: sem isso
 * a exclusão levava 403 calada, os eventos de teste se acumulavam e a peça que
 * ficou "em impressão" segurava a impressora para os testes seguintes.
 */
export async function limpar(page: Page, evento: Evento | undefined): Promise<void> {
  if (!evento) return;
  await entrar(page, "admin").catch(() => undefined);
  await page.request.delete(`/api/events/${evento.id}`).catch(() => undefined);
}

/**
 * Inicia a impressão na primeira impressora LIVRE e diz qual foi. A regra do
 * galpão é uma peça por impressora (409 PRINTER_BUSY): num banco de teste com
 * outras peças em produção — o Replit de dev, os exemplos do dev-local — a
 * Impressora 1 pode estar ocupada, e isso não é defeito do fluxo testado.
 */
export async function iniciarNumaImpressoraLivre(api: APIRequestContext, peca: Peca): Promise<string> {
  let ultima = "";
  for (const maquina of ["1", "2", "3", "4"]) {
    const r = await api.patch(`/api/items/${peca.id}/start-printing`, { data: { printMachine: maquina } });
    if (r.ok()) return maquina;
    ultima = await r.text();
    if (!ultima.includes("PRINTER_BUSY")) break;
  }
  throw new Error(`não deu para iniciar a impressão: ${ultima}`);
}
