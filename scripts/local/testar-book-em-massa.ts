// Teste em massa do rascunho do book: monta, NÃO grava. Roda à parte, em processo próprio,
// e escreve uma linha JSON por evento. Com AMOSTRA=1, junta o PDF de um evento por circuito.
import { pool } from "../../server/db";
import { montarRascunho } from "../../server/services/book-automatico";
import { circuitoDoEvento, motivoDeFicarFora, secaoDaPeca } from "../../shared/book-automatico";

(async () => {
  const pular = new Set<string>(((globalThis as Record<string, unknown>).PULAR_IDS as string[]) ?? []);
  const { rows } = await pool.query(
    `select id, name from events where arquivado_em is null and status <> 'closed' and start_date >= (now() at time zone 'America/Sao_Paulo')::date order by truck_departure_date`);
  const circuitosComAmostra = new Set<string>();
  let rssMax = 0;
  for (const ev of rows) {
    if (pular.has(ev.id)) continue;
    const saida: Record<string, unknown> = { id: ev.id, evento: ev.name, circuito: circuitoDoEvento(ev.name) };
    const t0 = Date.now();
    const antes = process.memoryUsage().rss;
    try {
      const r = await montarRascunho(ev.id);
      const noBook = r.plano.flatMap((p) => p.pecas);
      const repetidas = noBook.filter((p, i) => p && noBook.indexOf(p) !== i);
      const contadas = new Set([...noBook, ...r.fora.map((f) => f.displayId)]);
      const sumiram = r.pecas.filter((p) => !contadas.has(p.displayId));
      const motivos: Record<string, number> = {};
      for (const f of r.fora) motivos[f.motivo] = (motivos[f.motivo] ?? 0) + 1;
      Object.assign(saida, {
        seg: +((Date.now() - t0) / 1000).toFixed(1), mb: +(r.bytes.length / 1048576).toFixed(1), paginas: r.paginas, pecas: r.pecas.length, noBook: noBook.length,
        fora: r.fora.length, motivos, repetidas: repetidas.length, sumiram: sumiram.map((p) => p.displayId), conferir: r.plano.filter((p) => p.conferir).length, modelo: r.modeloEvento, base: r.baseOficial, mantidas: r.plano.filter((p) => p.origem === "mantida").length, refeitas: r.plano.filter((p) => p.origem === "refeita").length, novas: r.plano.filter((p) => p.origem === "nova").length,
        maiorPagina: Math.max(0, ...r.plano.map((p) => p.pecas.length)), semTipo: r.fora.filter((f) => f.motivo.startsWith("Não reconheci")).map((f) => `${f.tipo}/${f.descricao ?? ""}`).slice(0, 12),
        rotulos: r.plano.map((p) => p.rotulo),
      });
      if (process.env.AMOSTRA === "1" && !circuitosComAmostra.has(String(saida.circuito)) && r.paginas >= 8) { circuitosComAmostra.add(String(saida.circuito)); saida.pdf = r.bytes.toString("base64"); }
    } catch (e) { saida.erro = e instanceof Error ? e.message.slice(0, 200) : String(e); saida.seg = +((Date.now() - t0) / 1000).toFixed(1); }
    const rss = process.memoryUsage().rss; rssMax = Math.max(rssMax, rss);
    saida.rssMB = Math.round(rss / 1048576); saida.subiuMB = Math.round((rss - antes) / 1048576);
    await new Promise<void>((k) => process.stdout.write(JSON.stringify(saida) + "\n", () => k()));
  }
  await new Promise<void>((k) => process.stdout.write(JSON.stringify({ FIM: true, rssMaxMB: Math.round(rssMax / 1048576) }) + "\n", () => k()));
  await pool.end();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
void motivoDeFicarFora; void secaoDaPeca;
