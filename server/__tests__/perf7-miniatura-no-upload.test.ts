// ─────────────────────────────────────────────────────────────────────────────
// PERF-7 — A MINIATURA NASCE NO UPLOAD.
//
// O desenho de 27/08 gerava a miniatura A PEDIDO: cada falta no LRU (300
// entradas, na memória de CADA cópia do processo) baixava o ORIGINAL de até
// 25 MB do bucket e chamava o sharp. Numa lista com dezenas de thumbs, num
// reinício do processo ou numa segunda cópia do app, isso é dezenas de
// downloads de MBs para desenhar caixas de 80px.
//
// Agora a miniatura é gravada ao lado do original (`<caminho>/thumb.webp`) no
// momento do upload, e servir vira um download de dezenas de KB. O que este
// arquivo prende:
//
//   · onde a miniatura mora (o caminho é contrato: a rota de leitura procura
//     exatamente ali);
//   · que gravar acontece UMA vez e produz um webp muito menor que o original;
//   · que ler a gravada NÃO baixa o original nem chama o sharp — que é o
//     ponto inteiro da mudança;
//   · que nada disso pode derrubar um upload: bucket recusando a gravação,
//     tipo não-raster e original acima do teto devolvem `false` em silêncio, e
//     a geração a pedido segue de plano B.
//
// Sem o sharp instalado (o ambiente local desta base não instala pacote) os
// casos que dependem do resize são PULADOS — o resto continua valendo.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi } from "vitest";
import {
  caminhoDaMiniatura, NOME_DA_MINIATURA, gravarMiniaturaDoUpload, lerMiniaturaGravada,
  miniaturasDisponiveis, tipoMiniaturavel, TETO_ORIGINAL_BYTES, type ArquivoDoBucket,
} from "../services/miniaturas";

/** Um bucket de mentira que conta o que foi baixado e gravado. */
function bucketFalso(inicial: Record<string, Buffer> = {}) {
  const arquivos = new Map<string, Buffer>(Object.entries(inicial));
  const contas = { downloads: 0, saves: 0, exists: 0 };
  const recusas = new Set<string>();
  const bucket = {
    file(nome: string): ArquivoDoBucket {
      return {
        name: nome,
        bucket,
        async exists() { contas.exists++; return [arquivos.has(nome)] as [boolean]; },
        async download() {
          contas.downloads++;
          const b = arquivos.get(nome);
          if (!b) throw new Error("não existe");
          return [b] as [Buffer];
        },
        async save(dados: Buffer) {
          contas.saves++;
          if (recusas.has(nome)) throw new Error("bucket recusou a gravação");
          arquivos.set(nome, dados);
          return undefined;
        },
      };
    },
  };
  return { bucket, arquivos, contas, recusas };
}

/** Um PNG de verdade (o sharp precisa de bytes que ele saiba ler). */
async function pngDeVerdade(lado = 900): Promise<Buffer> {
  // `import("module")` tipado sem o createRequire nesta versão de @types/node:
  // a leitura pelo `default` é a mesma função e compila.
  const { createRequire } = (await import("module")).default;
  const require = createRequire(import.meta.url);
  const sharp = require("sharp");
  return await sharp({
    create: { width: lado, height: lado, channels: 3, background: { r: 200, g: 80, b: 20 } },
  }).png().toBuffer();
}

const seSharp = miniaturasDisponiveis() ? it : it.skip;

describe("PERF-7 · onde a miniatura mora", () => {
  it("é irmã do original, com nome fixo — é isso que a rota de leitura procura", () => {
    expect(NOME_DA_MINIATURA).toBe("thumb.webp");
    expect(caminhoDaMiniatura("dir/uploads/abc-123")).toBe("dir/uploads/abc-123/thumb.webp");
  });

  it("só imagem raster vira miniatura; PDF, SVG e vídeo seguem originais", () => {
    expect(tipoMiniaturavel("image/jpeg")).toBe(true);
    expect(tipoMiniaturavel("image/png")).toBe(true);
    expect(tipoMiniaturavel("application/pdf")).toBe(false);
    expect(tipoMiniaturavel("image/svg+xml")).toBe(false);
    expect(tipoMiniaturavel("video/mp4")).toBe(false);
  });
});

describe("PERF-7 · gravar no upload", () => {
  seSharp("grava um webp bem menor, no caminho combinado", async () => {
    const original = await pngDeVerdade();
    const { bucket, arquivos, contas } = bucketFalso({ "uploads/x1": original });
    const alvo = bucket.file("uploads/x1");

    expect(await gravarMiniaturaDoUpload(alvo, original, "image/png")).toBe(true);
    const mini = arquivos.get("uploads/x1/thumb.webp");
    expect(mini).toBeInstanceOf(Buffer);
    // WEBP na assinatura: "RIFF" + 4 bytes + "WEBP".
    expect(mini!.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(mini!.subarray(8, 12).toString("ascii")).toBe("WEBP");
    process.stderr.write(
      `[perf7] miniatura: original ${(original.length / 1024).toFixed(1)} KB → thumb.webp `
      + `${(mini!.length / 1024).toFixed(1)} KB · −${(100 - (mini!.length / original.length) * 100).toFixed(0)}%\n`,
    );
    expect(mini!.length).toBeLessThan(original.length / 4);
    // Gravou o original UMA vez e não baixou nada: os bytes já estavam na mão.
    expect(contas.saves).toBe(1);
    expect(contas.downloads).toBe(0);
  });

  seSharp("bucket que recusa a gravação não derruba o upload", async () => {
    const original = await pngDeVerdade(400);
    const { bucket, recusas } = bucketFalso();
    recusas.add("uploads/x2/thumb.webp");
    const espiao = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await gravarMiniaturaDoUpload(bucket.file("uploads/x2"), original, "image/png")).toBe(false);
    } finally {
      espiao.mockRestore();
    }
  });

  it("tipo não-raster e original acima do teto não geram nada", async () => {
    const { bucket, contas } = bucketFalso();
    expect(await gravarMiniaturaDoUpload(bucket.file("uploads/x3"), Buffer.from("%PDF-1.4"), "application/pdf")).toBe(false);
    const gigante = Buffer.alloc(TETO_ORIGINAL_BYTES + 1);
    expect(await gravarMiniaturaDoUpload(bucket.file("uploads/x4"), gigante, "image/png")).toBe(false);
    expect(contas.saves).toBe(0);
  });

  seSharp("bytes que não são imagem não viram miniatura (e não lançam)", async () => {
    const { bucket, contas } = bucketFalso();
    expect(await gravarMiniaturaDoUpload(bucket.file("uploads/x5"), Buffer.from("isto não é imagem"), "image/png")).toBe(false);
    expect(contas.saves).toBe(0);
  });
});

describe("PERF-7 · servir a gravada", () => {
  it("lê a miniatura SEM baixar o original — é o ganho inteiro", async () => {
    const original = Buffer.alloc(8 * 1024 * 1024, 7);
    const mini = Buffer.from("RIFF0000WEBPconteudo");
    const { bucket, contas } = bucketFalso({ "uploads/y1": original, "uploads/y1/thumb.webp": mini });

    const lida = await lerMiniaturaGravada(bucket.file("uploads/y1"));
    expect(lida).toEqual(mini);
    // UM download, o da miniatura. O original de 8 MB ficou onde estava.
    expect(contas.downloads).toBe(1);
  });

  it("sem miniatura gravada devolve null (e o chamador cai na geração a pedido)", async () => {
    const { bucket, contas } = bucketFalso({ "uploads/y2": Buffer.alloc(1024) });
    expect(await lerMiniaturaGravada(bucket.file("uploads/y2"))).toBeNull();
    expect(contas.downloads).toBe(0);
  });

  it("bucket que estoura na leitura devolve null, nunca erro na tela", async () => {
    const quebrado = {
      name: "uploads/y3",
      bucket: { file: () => quebrado },
      async exists(): Promise<[boolean]> { throw new Error("bucket fora do ar"); },
      async download(): Promise<[Buffer]> { throw new Error("nunca chega aqui"); },
      async save() { return undefined; },
    } as ArquivoDoBucket;
    expect(await lerMiniaturaGravada(quebrado)).toBeNull();
  });
});
