// ─────────────────────────────────────────────────────────────────────────────
// DADOS DE EXEMPLO DO AMBIENTE LOCAL — semeados PELA API, como gente usando.
//
// Por que pela API e não por INSERT: a peça tem invariantes espalhadas pelo
// servidor (impressão por máquina em jsonb, volume/tubo, trilha, contadores de
// conferência e entrega). Um INSERT à mão cria estado que o app nunca criaria,
// e a tela mostra um defeito que não existe. Pela API, cada peça chega na sua
// etapa pelo mesmo caminho que em produção.
//
// O que fica no banco (os nomes terminam em "(exemplo)"):
//   · 4 patrocinadores (um "desaprovador", o Ministério);
//   · 3 eventos: um perto da saída do caminhão, um no meio, um só com rascunho;
//   · ~30 peças: rascunho, vinculação, fila da Arte, aprovação do patrocinador,
//     finalização, revisão, fila da Gráfica (uma TRAVADA pela Solicitação, uma
//     reservada a uma impressora), em impressão (uma DIVIDIDA entre duas
//     impressoras), impressas, conferidas, embaladas num tubo fechado,
//     entregues, um MOLDE e uma cancelada.
//
// Uso isolado (com o app local no ar): node scripts/local/semear.mjs http://localhost:5000
// ─────────────────────────────────────────────────────────────────────────────
import { pathToFileURL } from "url";
import { USUARIOS_LOCAIS, SENHA_LOCAL } from "./app-local.mjs";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 0/Kids[]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
  "latin1",
);

const emDias = (n, hora) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  const dia = d.toISOString().slice(0, 10);
  return hora ? `${dia}T${hora}` : dia;
};

/** Uma sessão de um perfil: login uma vez, cookie guardado. */
async function sessao(base, perfil) {
  const u = USUARIOS_LOCAIS.find((x) => x.perfil === perfil);
  const r = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: u.email, password: SENHA_LOCAL }),
  });
  if (!r.ok) throw new Error(`login de ${perfil} falhou: ${r.status} ${await r.text()}`);
  const cookie = r.headers.get("set-cookie").split(";")[0];
  const pedir = async (metodo, caminho, corpo, { cru = false, tipo } = {}) => {
    const resp = await fetch(`${base}${caminho}`, {
      method: metodo,
      headers: { cookie, ...(corpo !== undefined ? { "content-type": tipo ?? "application/json" } : {}) },
      body: corpo === undefined ? undefined : cru ? corpo : JSON.stringify(corpo),
    });
    const texto = await resp.text();
    if (!resp.ok) throw new Error(`${perfil}: ${metodo} ${caminho} → ${resp.status} ${texto.slice(0, 300)}`);
    return texto ? JSON.parse(texto) : null;
  };
  return {
    get: (c) => pedir("GET", c),
    post: (c, b = {}) => pedir("POST", c, b),
    patch: (c, b = {}) => pedir("PATCH", c, b),
    subir: async (bytes, tipo) => (await pedir("PUT", "/api/objects/upload-direct", bytes, { cru: true, tipo })).url,
  };
}

export async function semear(base) {
  const admin = await sessao(base, "admin");
  const eventos = await admin.get("/api/events");
  if (Array.isArray(eventos) && eventos.length > 0) return { jaTinha: true };

  const solic = await sessao(base, "solicitacao");
  const arte = await sessao(base, "arte");
  const grafica = await sessao(base, "grafica");
  const cont = {};
  const conta = (etapa) => { cont[etapa] = (cont[etapa] ?? 0) + 1; };

  // ── Patrocinadores ────────────────────────────────────────────────────
  const patro = {};
  for (const [chave, dados] of Object.entries({
    aurora: { name: "Banco Aurora (exemplo)", company: "Banco Aurora S.A.", quota: "MASTER", color: "#1d4ed8", contactPerson: "Marina Lopes", email: "marina@aurora.exemplo" },
    energia: { name: "Energia Viva (exemplo)", company: "Energia Viva Bebidas", quota: "GOLD", color: "#16a34a", contactPerson: "Caio Nunes" },
    ministerio: { name: "Ministério do Esporte (exemplo)", quota: "MINISTERIO", color: "#0f766e", strictApproval: true },
    radio: { name: "Rádio Litoral FM (exemplo)", quota: "MIDIA", color: "#f97316" },
  })) patro[chave] = await admin.post("/api/sponsors", dados);

  // ── Eventos ───────────────────────────────────────────────────────────
  const criarEvento = (name, inicio, saida, franchise) =>
    solic.post("/api/events", { name, startDate: emDias(inicio), truckDepartureDate: emDias(saida, "08:00"), franchise });
  const rio = await criarEvento("Night Run Rio 2026 (exemplo)", 12, 6, "Night Run");
  const estacoes = await criarEvento("Circuito Estações — Primavera (exemplo)", 30, 24, "Circuito Estações");
  const floripa = await criarEvento("Maratona de Floripa (exemplo)", 70, 62, "Maratonas");
  for (const [ev, lista] of [[rio, ["aurora", "energia", "ministerio"]], [estacoes, ["aurora", "radio"]]]) {
    for (const p of lista) await solic.post(`/api/events/${ev.id}/sponsors`, { sponsorId: patro[p].id, quota: patro[p].quota });
  }

  // ── Peças ─────────────────────────────────────────────────────────────
  const MODELOS = [
    { type: "Pórtico", description: "Pórtico de largada", quantity: 1, material: "Lona 440g", finish: "Ilhós", w: 6, h: 3 },
    { type: "2x1", description: "Painel 2x1 da arena", quantity: 8, material: "Lona 440g", finish: "Bastão", w: 2, h: 1 },
    { type: "Testeiras", description: "Testeira do palco", quantity: 2, material: "Lona front", finish: "Ilhós", w: 5, h: 0.5 },
    { type: "WindBanner", description: "Wind banner de percurso", quantity: 6, material: "Tecido", finish: "Costura", w: 0.8, h: 3 },
    { type: "Percurso", description: "Placa de quilometragem", quantity: 12, material: "PS 2mm", finish: "Refile", w: 0.6, h: 0.9 },
    { type: "Qd Fotos", description: "Quadro de fotos", quantity: 1, material: "Lona 440g", finish: "Ilhós", w: 3, h: 2 },
  ];
  let n = 0;
  async function peca(evento, extra = {}) {
    const m = MODELOS[n++ % MODELOS.length];
    const area = (m.w * m.h).toFixed(2);
    const { w, h, ...base } = m;
    return solic.post("/api/items", {
      eventId: evento.id,
      ...base,
      measurement: `${w.toFixed(2)} × ${h.toFixed(2)}`,
      fileWidth: w.toFixed(2), fileHeight: h.toFixed(2),
      area, visual: area,
      calculatedM2: (m.w * m.h * (extra.quantity ?? m.quantity)).toFixed(2),
      skipApproval: true,
      ...extra,
    });
  }
  const aArte = async (ev, pecas) => {
    await solic.post(`/api/events/${ev.id}/items/submit`, {});
    await admin.post("/api/items/send-to-arte", { itemIds: pecas.map((p) => p.id) });
  };
  const thumb = async (p) => arte.patch(`/api/items/${p.id}/submit-for-approval`, { approvalThumbUrl: await arte.subir(PNG, "image/png") });
  const final = async (p) => arte.patch(`/api/items/${p.id}/submit-final-file`, { finalFileUrl: await arte.subir(PDF, "application/pdf") });
  const liberar = (p) => solic.patch(`/api/items/${p.id}/creator-review`, { approved: true });
  const foto = () => grafica.subir(PNG, "image/png");

  // Evento Rio: a produção em andamento.
  const rioPecas = [];
  // Quantidade mínima 2 aqui: a peça dividida entre impressoras precisa de
  // unidades para dividir, e a posição dela na lista depende do modelo.
  for (let i = 0; i < 20; i++) rioPecas.push(await peca(rio, [0, 5].includes(n % MODELOS.length) ? { quantity: 4 } : {}));
  const molde = await peca(rio, { type: "Molde", description: "Molde da medalha", quantity: 1, material: "MDF", finish: "Corte", measurement: "0.30 × 0.30", fileWidth: "0.30", fileHeight: "0.30", area: "0.09", visual: "0.09", calculatedM2: "0.09" });
  const comPatrocinio = [];
  for (let i = 0; i < 3; i++) comPatrocinio.push(await peca(rio, { skipApproval: false, description: `Banner de patrocinador ${i + 1}` }));
  await solic.post(`/api/events/${rio.id}/items/submit`, {});
  conta("vinculacao"); // a primeira fica em Aguardando Vinculação
  const [, ...paraArte] = rioPecas;
  for (const p of comPatrocinio) await solic.post(`/api/items/${p.id}/sponsors`, { sponsorId: patro.aurora.id });
  await solic.post(`/api/items/${comPatrocinio[2].id}/sponsors`, { sponsorId: patro.ministerio.id });
  await admin.post("/api/items/send-to-arte", { itemIds: [...paraArte, molde, ...comPatrocinio].map((p) => p.id) });

  const [naArte1, naArte2, finaliza1, finaliza2, revisao1, revisao2, ...liberadas] = paraArte;
  conta("arte"); conta("arte");
  // Aprovação do patrocinador: thumb enviado, esperando o Atendimento.
  for (const p of comPatrocinio) { await thumb(p); conta("aprovacao"); }
  // Finalização (thumb aprovado, falta o arquivo final).
  for (const p of [finaliza1, finaliza2]) { await thumb(p); conta("finalizacao"); }
  // Revisão Final.
  for (const p of [revisao1, revisao2]) { await thumb(p); await final(p); conta("revisao"); }
  // Molde: o thumb vai direto para a Revisão; liberado, a Gráfica marca produzido.
  await thumb(molde);
  await liberar(molde);
  await grafica.patch(`/api/items/${molde.id}/molde-produzido`, {});
  conta("molde");
  // Liberadas para a Gráfica.
  for (const p of liberadas) { await thumb(p); await final(p); await liberar(p); }
  const [fila1, travada, reservada, imprimindo, dividida, impressa1, impressa2, conf1, conf2, emb1, emb2, ent1, ent2] = liberadas;
  conta("grafica");
  await solic.post(`/api/items/${travada.id}/travar`, { motivo: "Patrocinador pediu troca do logo — segurar a impressão" });
  conta("travada");
  await grafica.patch(`/api/items/${reservada.id}/maquina-prevista`, { maquina: "4" });
  conta("reservada");
  // Em impressão: parcial na Impressora 1.
  await grafica.patch(`/api/items/${imprimindo.id}/start-printing`, { printMachine: "1" });
  await grafica.patch(`/api/items/${imprimindo.id}/start-production`, { quantityProduced: Math.max(1, Math.floor(imprimindo.quantity / 2)) });
  conta("imprimindo");
  // Dividida: começa na 2 e metade vai para a 3.
  await grafica.patch(`/api/items/${dividida.id}/start-printing`, { printMachine: "2" });
  const metade = Math.max(1, Math.floor(dividida.quantity / 2));
  await grafica.patch(`/api/items/${dividida.id}/start-printing`, { printMachine: "3", quantidade: metade, deMaquina: "2" });
  conta("dividida");
  // Impressas (inteiras) → as próximas etapas.
  const imprimirTudo = async (p) => {
    await grafica.patch(`/api/items/${p.id}/start-printing`, { printMachine: "4" });
    await grafica.patch(`/api/items/${p.id}/start-production`, { quantityProduced: p.quantity });
  };
  for (const p of [impressa1, impressa2, conf1, conf2, emb1, emb2, ent1, ent2]) await imprimirTudo(p);
  conta("impressa"); conta("impressa");
  for (const p of [conf1, conf2, emb1, emb2, ent1, ent2]) {
    await grafica.post(`/api/items/${p.id}/confer`, { conferencePhotoUrl: await foto(), qty: p.quantity });
  }
  conta("conferida"); conta("conferida");
  // Embaladas num tubo FECHADO (com foto do fechamento).
  const tubo = await grafica.post(`/api/events/${rio.id}/tubos`, {
    itens: [emb1, emb2].map((p) => ({ id: p.id, quantidade: p.quantity })), fotos: [await foto()],
  });
  await grafica.post(`/api/tubos/${tubo.id}/fechar`, { fotos: [await foto()] });
  conta("embalada"); conta("embalada");
  // Entregues: outro tubo, entregue com recebedor.
  const tubo2 = await grafica.post(`/api/events/${rio.id}/tubos`, {
    itens: [ent1, ent2].map((p) => ({ id: p.id, quantidade: p.quantity })), fotos: [await foto()],
  });
  await grafica.post(`/api/tubos/${tubo2.id}/entregar`, { receivedBy: "Paulo (montagem)", photoUrl: await foto() });
  conta("entregue"); conta("entregue");
  void fila1;

  // Evento Estações: começo do trabalho — fila da Arte e uma cancelada.
  const est = [];
  for (let i = 0; i < 4; i++) est.push(await peca(estacoes));
  await aArte(estacoes, est.slice(0, 3));
  conta("arte"); conta("arte"); conta("arte");
  await solic.patch(`/api/items/${est[3].id}/cancel`, { notes: "Evento reduziu o número de painéis (exemplo)" });
  conta("cancelada");

  // Evento Floripa: só rascunho (a Solicitação ainda montando a lista).
  for (let i = 0; i < 3; i++) { await peca(floripa); conta("rascunho"); }

  const resumo = Object.entries(cont).map(([k, v]) => `${v} ${k}`).join(", ");
  return { jaTinha: false, resumo };
}

// Execução direta: node scripts/local/semear.mjs http://localhost:5000
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const base = process.argv[2] ?? "http://localhost:5000";
  semear(base).then(
    (r) => { console.log(r.jaTinha ? "O banco já tinha eventos — nada semeado." : `Semeado: ${r.resumo}`); },
    (e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); },
  );
}
