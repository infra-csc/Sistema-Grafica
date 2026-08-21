// ─────────────────────────────────────────────────────────────────────────────
// ENVIAR PARA A ARTE: o clique repetido não vira "56 erros".
//
// Relato com captura: "0 items enviados para Arte — Alguns itens tiveram
// erros: Item #4099 não está no status correto para envio, Item #4104…". A
// trilha mostrou o que a tela não mostrava: às 17:47:41 um envio de 56 peças
// tinha DADO CERTO, incluindo as três. O toast era de um segundo envio que
// repetiu peças já enviadas.
//
// Por que a tela ainda as oferecia como "Pronto": JANELA DE CORRIDA. No
// onSuccess do envio, a marca otimista "enviado" era apagada NA HORA, enquanto
// a recarga de /api/items (a tabela inteira, 3.300 linhas) ainda estava em
// voo. Por um ou dois segundos as peças recém-enviadas voltavam a aparecer
// com o status antigo — "Pronto" —, o botão reabilitava, e um segundo clique
// mandava tudo de novo. O servidor, corretamente, rejeitava uma a uma; a
// mensagem, incorretamente, chamava isso de "status incorreto".
//
// Três correções, nas três camadas:
//   · a marca otimista só cai quando a lista nova CHEGOU (invalidateQueries
//     devolve uma promessa que resolve depois do refetch);
//   · o Confirmar descarta, na hora do clique, o que já tem status além da
//     vinculação — o modal carrega uma FOTO da lista, e entre abrir e
//     confirmar outra pessoa pode ter enviado parte dela;
//   · a mensagem do servidor distingue "já foi enviado" (nada a fazer) de
//     "ainda não chegou à vinculação" (volta à Solicitação). "Status
//     incorreto" não dizia nenhum dos dois.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const ler = (rel: string) => readFileSync(path.resolve(__dirname, "../../", rel), "utf8");
const VP = ler("client/src/pages/vincular-patrocinadores.tsx");
const SV = ler("server/routes/sponsors.ts");
const semCom = (s: string) => s.replace(/\r\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n").map(l => l.replace(/^\s*\/\/.*$/, "")).join("\n");

describe("a janela de corrida está fechada", () => {
  it("a marca otimista só cai DEPOIS da lista nova chegar", () => {
    const i = VP.indexOf("const sendToArteMutation = useMutation({");
    const bloco = VP.slice(i, i + 5000);
    const esperaRecarga = bloco.indexOf('await queryClient.invalidateQueries({ queryKey: ["/api/items"] });');
    const limpaOtimista = bloco.indexOf("itemIds.forEach(id => next.delete(id));");
    expect(esperaRecarga).toBeGreaterThan(-1);
    expect(limpaOtimista).toBeGreaterThan(esperaRecarga);
    // E o onSuccess é async — sem isso o await não espera nada.
    expect(bloco).toContain("onSuccess: async (data, itemIds) => {");
  });

  it("o refetch em background que abria a janela não voltou no onSuccess", () => {
    const i = VP.indexOf("const sendToArteMutation = useMutation({");
    const j = VP.indexOf("onError: (error: Error, itemIds: string[]) => {", i);
    const onSuccess = semCom(VP.slice(i, j));
    // Só a versão com await existe dentro do onSuccess.
    expect((onSuccess.match(/invalidateQueries\(\{ queryKey: \["\/api\/items"\] \}\)/g) ?? []).length).toBe(1);
    expect(onSuccess).toContain('await queryClient.invalidateQueries({ queryKey: ["/api/items"] });');
  });
});

describe("o Confirmar descarta o que já foi enviado", () => {
  it("compara a foto do modal com o status ATUAL da lista", () => {
    expect(VP).toContain("const { items: doModal, pendingByItem } = sendConfirmModal;");
    expect(VP).toContain("const statusAtual = new Map(items.map((i: any) => [i.id, i.status]));");
    expect(VP).toContain("const jaEnviadas = doModal.filter(i => DOWNSTREAM_STATUSES.includes(statusAtual.get(i.id) ?? i.status));");
  });

  it("só o que sobrou vai para o servidor", () => {
    expect(VP).toContain("const toSync = paraEnviar.filter(item => {");
    expect(VP).toContain("const itemIds = paraEnviar.map(i => i.id);");
  });

  it("e quando não sobra nada, diz isso em vez de disparar um envio vazio", () => {
    expect(VP).toContain("if (paraEnviar.length === 0) {");
    expect(VP).toContain('description: "Por outro envio ou por outra pessoa — elas já estão na fila da Arte."');
  });
});

describe("a frase diz o que aconteceu", () => {
  it("o servidor distingue 'já foi enviado' de 'ainda não chegou'", () => {
    expect(SV).toContain("const aindaNaoChegou = ['draft', 'requested'].includes(item.status);");
    expect(SV).toContain('já foi enviado (está em "${translateStatus(item.status)}")');
    expect(SV).toContain('ainda não chegou à vinculação (está em "${translateStatus(item.status)}")');
    expect(semCom(SV)).not.toContain("não está no status correto para envio");
  });

  it("o cliente reconhece o lote inteiro de 'já enviadas' e não o chama de erro", () => {
    expect(VP).toContain("const jaEnviadas = (data.errors ?? []).filter((e: string) => e.includes('já foi enviado')).length;");
    expect(VP).toContain("if (data.sent === 0 && data.errors && data.errors.length > 0 && jaEnviadas === data.errors.length) {");
    expect(VP).toContain("Essas ${jaEnviadas} peças já tinham sido enviadas");
  });

  it("o toast destrutivo continua para erros de verdade", () => {
    expect(VP).toContain("description: `Alguns itens tiveram erros: ${data.errors.join(', ')}`,");
  });
});
