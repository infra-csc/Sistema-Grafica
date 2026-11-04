#!/usr/bin/env node
// O CONFERIDOR: roda num computador que enxerga a pasta da rede (\\10.100.1.7).
// O servidor não alcança essa pasta. Aqui geramos uma imagem reduzida do arquivo
// final e mandamos para o servidor comparar com o thumb aprovado.
//
// Só LÊ os arquivos da rede. Nunca grava nem apaga nada na pasta.
//
//   Uma passada e encerra:  node conferidor.mjs --uma-vez
//   Sempre ligado:          node conferidor.mjs
//
// Instalação: LEIA-ME.txt. Precisa de duas variáveis (ou do arquivo .conferidor.env nesta pasta):
//   CONFERIDOR_URL=https://grafica.appsnorte.com
//   CONFERENCIA_TOKEN=<o mesmo token configurado no servidor>
import fs from "fs";
import path from "path";
import { fork } from "child_process";
import { fileURLToPath } from "url";

const ARQ = path.join(path.dirname(fileURLToPath(import.meta.url)), ".conferidor.env");
if (fs.existsSync(ARQ)) {
  for (const l of fs.readFileSync(ARQ, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z_]+)\s*=\s*(.+?)\s*$/.exec(l);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
const BASE = (process.env.CONFERIDOR_URL ?? "").replace(/\/+$/, "");
const TOKEN = process.env.CONFERENCIA_TOKEN ?? "";
if (!BASE || TOKEN.length < 32) {
  console.error("Falta configurar CONFERIDOR_URL e CONFERENCIA_TOKEN (veja o cabeçalho deste arquivo).");
  process.exit(1);
}
const UMA_VEZ = process.argv.includes("--uma-vez");
const SIMULTANEOS = Math.max(1, Number(process.env.CONFERIDOR_SIMULTANEOS) || 4);
const TEMPO_MS = 300_000, DESCANSO_MS = 5 * 60_000, TROCAR_APOS = 40;
const IMAGEM = path.join(path.dirname(fileURLToPath(import.meta.url)), "conferidor-imagem.mjs");

const api = (rota, init = {}) => fetch(BASE + rota, { ...init, headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json", ...(init.headers ?? {}) } });
const espera = (ms) => new Promise((ok) => setTimeout(ok, ms));

// Um processo por vaga. Quem estoura o tempo é encerrado e a vaga abre outro.
function novoGerador() {
  const filho = fork(IMAGEM, { stdio: ["ignore", "ignore", "ignore", "ipc"] });
  const pronto = new Promise((ok) => { const f = (m) => { if (m?.pronto) { filho.off("message", f); ok(); } }; filho.on("message", f); });
  return { filho, pronto, feitos: 0 };
}
async function gerar(vaga, job) {
  if (!vaga.g || vaga.g.feitos >= TROCAR_APOS) { vaga.g?.filho.kill(); vaga.g = novoGerador(); }
  const g = vaga.g; g.feitos++;
  await g.pronto;
  return new Promise((ok) => {
    const fim = (r) => { clearTimeout(t); g.filho.off("message", aoReceber); g.filho.off("exit", aoSair); ok(r); };
    const aoReceber = (m) => { if (m?.id === job.id) fim(m); };
    const aoSair = () => { vaga.g = null; fim({ naoDeu: "O arquivo fechou sozinho ao abrir (pesado demais)." }); };
    const t = setTimeout(() => { g.filho.off("exit", aoSair); g.filho.kill(); vaga.g = null; fim({ naoDeu: "O arquivo demorou demais para abrir." }); }, TEMPO_MS);
    g.filho.on("message", aoReceber); g.filho.on("exit", aoSair);
    g.filho.send(job);
  });
}

async function conferir(vaga, p) {
  const rt = await api(`/api/conferidor/${p.id}/thumb`);
  if (!rt.ok) throw new Error(`thumb ${rt.status}`);
  const thumb = Buffer.from(await rt.arrayBuffer()).toString("base64");
  const { final, pagina, extras, naoDeu, adiar } = await gerar(vaga, { id: p.id, arquivo: p.arquivo, thumb });
  if (adiar) throw new Error(`ficou para a próxima passada (${adiar})`);
  const corpo = naoDeu ? { naoDeu } : { final, pagina, extras };
  const r = await api(`/api/conferidor/${p.id}`, { method: "POST", body: JSON.stringify({ arquivo: p.arquivo, ...corpo }) });
  if (!r.ok) throw new Error(`comparar ${r.status}`);
  return (await r.json()).veredito;
}

async function umaPassada() {
  const conta = { confere: 0, vale_olhar: 0, nao_deu: 0, falhas: 0 };
  const vistas = new Set();
  const vagas = Array.from({ length: SIMULTANEOS }, () => ({ g: null }));
  try {
    for (;;) {
      const r = await api("/api/conferidor/pendentes?limite=100");
      if (!r.ok) { console.error("Servidor respondeu", r.status, (await r.text()).slice(0, 120)); return conta; }
      const fila = (await r.json()).filter((p) => !vistas.has(p.id));
      if (fila.length === 0) return conta;
      // Peças do mesmo arquivo em sequência: o .ai já aberto é aproveitado.
      fila.sort((a, b) => a.arquivo.localeCompare(b.arquivo));
      await Promise.all(vagas.map(async (vaga) => {
        for (let p = fila.shift(); p; p = fila.shift()) {
          vistas.add(p.id);
          try { const v = await conferir(vaga, p); conta[v] = (conta[v] ?? 0) + 1; console.log(new Date().toLocaleTimeString("pt-BR"), p.displayId, v); }
          catch (e) { conta.falhas++; console.error(p.displayId, "falhou:", e.message); }
        }
      }));
    }
  } finally {
    for (const v of vagas) v.g?.filho.kill();
  }
}

do {
  const c = await umaPassada().catch((e) => { console.error("Passada interrompida:", e.message); return null; });
  if (c) console.log("Passada concluída:", JSON.stringify(c));
  if (!UMA_VEZ) await espera(DESCANSO_MS);
} while (!UMA_VEZ);
process.exitCode = 0;
