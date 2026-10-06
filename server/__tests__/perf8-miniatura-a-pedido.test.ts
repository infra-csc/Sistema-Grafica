// ─────────────────────────────────────────────────────────────────────────────
// PERF-8 (06/10) — "estou sentindo o app meio lento depois dessa última
// atualização". As listas passaram a mostrar a arte em TODA linha (Painel
// Geral, Detalhe do Evento, Gráfica) e a arte anterior a 27/08 não tem
// thumb.webp: cada falta no LRU baixava o original de MBs e chamava o sharp,
// dezenas ao mesmo tempo, e o processo inteiro ficava lento.
//
// O que fica travado aqui:
//   · a miniatura gerada a pedido é GRAVADA ao lado do original — a segunda
//     vez é um download de ~20 KB, sem o original e sem o sharp;
//   · o mesmo objeto pedido várias vezes ao mesmo tempo baixa o original UMA vez.
//
// Sem o sharp instalado os casos são PULADOS (mesma regra do perf7).
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { obterMiniatura, miniaturasDisponiveis, type ArquivoComMetadados } from "../services/miniaturas";

function bucketFalso(inicial: Record<string, Buffer>) {
  const arquivos = new Map<string, Buffer>(Object.entries(inicial));
  const contas = { downloadsDoOriginal: 0, saves: 0 };
  const bucket = {
    file(nome: string): ArquivoComMetadados {
      return {
        name: nome,
        bucket,
        async exists() { return [arquivos.has(nome)] as [boolean]; },
        async download() {
          if (!nome.endsWith("/thumb.webp")) contas.downloadsDoOriginal++;
          await new Promise((r) => setTimeout(r, 5));
          const b = arquivos.get(nome);
          if (!b) throw new Error("não existe");
          return [b] as [Buffer];
        },
        async save(dados: Buffer) { contas.saves++; arquivos.set(nome, dados); return undefined; },
        async getMetadata() {
          const b = arquivos.get(nome);
          return [{ contentType: "image/png", size: b?.length ?? 0 }] as [{ contentType: unknown; size: unknown }];
        },
      };
    },
  };
  return { bucket, arquivos, contas };
}

async function pngDeVerdade(lado = 700): Promise<Buffer> {
  const { createRequire } = (await import("node:module")) as unknown as { createRequire: (url: string) => NodeRequire };
  const require = createRequire(import.meta.url);
  const sharp = require("sharp");
  return await sharp({
    create: { width: lado, height: lado, channels: 3, background: { r: 30, g: 90, b: 200 } },
  }).png().toBuffer();
}

const seSharp = miniaturasDisponiveis() ? it : it.skip;

describe("PERF-8 · miniatura gerada a pedido", () => {
  seSharp("é gravada ao lado do original; a segunda leitura não baixa o original", async () => {
    const { bucket, arquivos, contas } = bucketFalso({ "uploads/antiga-1": await pngDeVerdade() });
    const mini = await obterMiniatura(bucket.file("uploads/antiga-1"), "/objects/uploads/antiga-1#a");
    expect(mini).toBeInstanceOf(Buffer);
    await new Promise((r) => setTimeout(r, 20)); // a gravação é em segundo plano
    expect(arquivos.has("uploads/antiga-1/thumb.webp")).toBe(true);
    expect(contas.downloadsDoOriginal).toBe(1);

    // Outra "cópia do processo" (chave de LRU diferente): sai da gravada.
    const deNovo = await obterMiniatura(bucket.file("uploads/antiga-1"), "/objects/uploads/antiga-1#b");
    expect(deNovo).toBeInstanceOf(Buffer);
    expect(contas.downloadsDoOriginal).toBe(1);
  });

  seSharp("o mesmo objeto pedido 5 vezes ao mesmo tempo baixa o original uma vez só", async () => {
    const { bucket, contas } = bucketFalso({ "uploads/antiga-2": await pngDeVerdade(500) });
    const pedidos = Array.from({ length: 5 }, () => obterMiniatura(bucket.file("uploads/antiga-2"), "/objects/uploads/antiga-2"));
    const resultados = await Promise.all(pedidos);
    expect(resultados.every((r) => r instanceof Buffer)).toBe(true);
    expect(contas.downloadsDoOriginal).toBe(1);
  });
});
