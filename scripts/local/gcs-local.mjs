// ─────────────────────────────────────────────────────────────────────────────
// UM "OBJECT STORAGE" DE MENTIRA — só para o ambiente local.
//
// No Replit, os uploads vão para um bucket do Google Cloud Storage, com
// credencial entregue pelo "sidecar" do Replit (127.0.0.1:1106), que não
// existe fora dele. A biblioteca @google-cloud/storage aceita um emulador pela
// variável STORAGE_EMULATOR_HOST — e, com ela, não pede credencial nenhuma.
// Este arquivo é esse emulador, com o MÍNIMO que o servidor usa
// (server/objectStorage.ts, objectAcl.ts, services/miniaturas.ts):
//
//   · gravar     — file.save(buf, { resumable: false })  → upload multipart
//   · ler        — exists / getMetadata / download / createReadStream (com faixa)
//   · metadados  — setMetadata (a política de acesso do objeto mora ali)
//   · apagar     — delete
//
// O que NÃO há: URL assinada (o caminho legado POST /api/objects/upload falha
// no local — as telas usam o /upload-direct, que funciona) nem listagem.
//
// Os objetos ficam na memória, ou numa pasta (modo persistente do dev-local).
// ─────────────────────────────────────────────────────────────────────────────
import http from "http";
import { createHash } from "crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join } from "path";

// CRC32C (Castagnoli) — o hash que a biblioteca confere depois de cada upload.
const TABELA_CRC32C = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0x82f63b78 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32c(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = TABELA_CRC32C[(c ^ b) & 0xff] ^ (c >>> 8);
  const saida = Buffer.alloc(4);
  saida.writeUInt32BE((c ^ 0xffffffff) >>> 0);
  return saida.toString("base64");
}

export async function subirGcsLocal({ porta = 0, host = "127.0.0.1", pasta } = {}) {
  const objetos = new Map(); // "bucket/nome" → { dados, recurso }
  let geracao = Date.now();

  const arquivoDe = (chave) => join(pasta, Buffer.from(chave).toString("base64url"));
  const guardar = (chave, obj) => {
    objetos.set(chave, obj);
    if (pasta) {
      writeFileSync(`${arquivoDe(chave)}.json`, JSON.stringify(obj.recurso));
      writeFileSync(`${arquivoDe(chave)}.bin`, obj.dados);
    }
  };
  const achar = (chave) => {
    if (objetos.has(chave)) return objetos.get(chave);
    if (pasta && existsSync(`${arquivoDe(chave)}.json`)) {
      const obj = { recurso: JSON.parse(readFileSync(`${arquivoDe(chave)}.json`, "utf8")), dados: readFileSync(`${arquivoDe(chave)}.bin`) };
      objetos.set(chave, obj);
      return obj;
    }
    return null;
  };
  const apagar = (chave) => {
    objetos.delete(chave);
    if (pasta) for (const ext of [".json", ".bin"]) rmSync(`${arquivoDe(chave)}${ext}`, { force: true });
  };
  if (pasta) mkdirSync(pasta, { recursive: true });

  const json = (res, status, corpo) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(corpo));
  };
  const naoAchou = (res) => json(res, 404, { error: { code: 404, message: "No such object (gcs-local)" } });

  function recursoNovo(bucket, nome, dados, contentType, metadata) {
    const agora = new Date().toISOString();
    geracao += 1;
    return {
      kind: "storage#object",
      id: `${bucket}/${nome}/${geracao}`,
      name: nome,
      bucket,
      generation: String(geracao),
      metageneration: "1",
      contentType: contentType || "application/octet-stream",
      size: String(dados.length),
      md5Hash: createHash("md5").update(dados).digest("base64"),
      crc32c: crc32c(dados),
      metadata: metadata ?? undefined,
      timeCreated: agora,
      updated: agora,
    };
  }

  /** multipart/related: 1ª parte = JSON do objeto, 2ª parte = os bytes. */
  function lerMultipart(corpo, contentType) {
    const m = /boundary="?([^";]+)"?/i.exec(contentType ?? "");
    if (!m) return null;
    const limite = Buffer.from(`--${m[1]}`);
    const partes = [];
    let i = corpo.indexOf(limite);
    while (i !== -1) {
      const inicio = i + limite.length;
      if (corpo.subarray(inicio, inicio + 2).toString() === "--") break;
      const fim = corpo.indexOf(limite, inicio);
      if (fim === -1) break;
      let parte = corpo.subarray(inicio, fim);
      if (parte.subarray(0, 2).toString() === "\r\n") parte = parte.subarray(2);
      if (parte.subarray(-2).toString() === "\r\n") parte = parte.subarray(0, -2);
      const sep = parte.indexOf("\r\n\r\n");
      partes.push({ cabecalho: parte.subarray(0, sep).toString(), dados: parte.subarray(sep + 4) });
      i = fim;
    }
    if (partes.length < 2) return null;
    const meta = JSON.parse(partes[0].dados.toString("utf8"));
    const tipo = /content-type:\s*([^\r\n]+)/i.exec(partes[1].cabecalho)?.[1]?.trim();
    return { meta, dados: Buffer.from(partes[1].dados), tipo };
  }

  const servidor = http.createServer((req, res) => {
    const pedacos = [];
    req.on("data", (d) => pedacos.push(d));
    req.on("end", () => {
      try {
        const corpo = Buffer.concat(pedacos);
        const url = new URL(req.url, "http://gcs-local");
        const caminho = url.pathname;

        // Upload: POST /upload/storage/v1/b/<bucket>/o?uploadType=multipart
        const up = /^\/upload\/storage\/v1\/b\/([^/]+)\/o\/?$/.exec(caminho);
        if (up && req.method === "POST") {
          const bucket = decodeURIComponent(up[1]);
          let nome = url.searchParams.get("name");
          let dados = corpo;
          let tipo = req.headers["content-type"];
          let metadata;
          if (url.searchParams.get("uploadType") === "multipart") {
            const mp = lerMultipart(corpo, req.headers["content-type"]);
            if (!mp) return json(res, 400, { error: { code: 400, message: "multipart ilegível (gcs-local)" } });
            nome = mp.meta.name ?? nome;
            tipo = mp.meta.contentType ?? mp.tipo;
            metadata = mp.meta.metadata;
            dados = mp.dados;
          } else if (url.searchParams.get("uploadType") === "resumable") {
            return json(res, 501, { error: { code: 501, message: "upload resumível não existe no gcs-local" } });
          }
          if (!nome) return json(res, 400, { error: { code: 400, message: "sem nome (gcs-local)" } });
          const recurso = recursoNovo(bucket, nome, dados, tipo, metadata);
          guardar(`${bucket}/${nome}`, { dados, recurso });
          return json(res, 200, recurso);
        }

        // Objeto: [/storage/v1|/download/storage/v1]/b/<bucket>/o/<nome>
        const ob = /^(?:\/storage\/v1|\/download\/storage\/v1)?\/b\/([^/]+)\/o\/(.+)$/.exec(caminho);
        if (!ob) return json(res, 404, { error: { code: 404, message: `rota desconhecida no gcs-local: ${req.method} ${caminho}` } });
        const bucket = decodeURIComponent(ob[1]);
        const nome = decodeURIComponent(ob[2]);
        const chave = `${bucket}/${nome}`;
        const obj = achar(chave);

        if (req.method === "DELETE") {
          if (!obj) return naoAchou(res);
          apagar(chave);
          res.writeHead(204).end();
          return;
        }
        if (!obj) return naoAchou(res);

        if (req.method === "PATCH" || req.method === "PUT") {
          const pedido = corpo.length ? JSON.parse(corpo.toString("utf8")) : {};
          const r = { ...obj.recurso };
          if (pedido.metadata !== undefined) {
            if (pedido.metadata === null) delete r.metadata;
            else {
              const m = { ...(r.metadata ?? {}) };
              for (const [k, v] of Object.entries(pedido.metadata)) {
                if (v === null) delete m[k]; else m[k] = v;
              }
              r.metadata = m;
            }
          }
          for (const campo of ["contentType", "cacheControl", "contentDisposition"]) {
            if (pedido[campo] !== undefined) r[campo] = pedido[campo];
          }
          r.metageneration = String(Number(r.metageneration) + 1);
          r.updated = new Date().toISOString();
          guardar(chave, { dados: obj.dados, recurso: r });
          return json(res, 200, r);
        }

        if (req.method === "GET" && url.searchParams.get("alt") === "media") {
          const total = obj.dados.length;
          const faixa = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range ?? ""));
          const base = {
            "content-type": obj.recurso.contentType,
            "x-goog-hash": `crc32c=${obj.recurso.crc32c},md5=${obj.recurso.md5Hash}`,
            "x-goog-stored-content-encoding": "identity",
            "accept-ranges": "bytes",
          };
          if (faixa && total > 0) {
            const inicio = faixa[1] === "" ? Math.max(0, total - Number(faixa[2])) : Number(faixa[1]);
            const fim = faixa[1] === "" || faixa[2] === "" ? total - 1 : Math.min(Number(faixa[2]), total - 1);
            const pedaco = obj.dados.subarray(inicio, fim + 1);
            res.writeHead(206, {
              ...base,
              "x-goog-stored-content-encoding": "none", // faixa não se valida por hash
              "content-range": `bytes ${inicio}-${fim}/${total}`,
              "content-length": String(pedaco.length),
            });
            return res.end(pedaco);
          }
          res.writeHead(200, { ...base, "content-length": String(total) });
          return res.end(obj.dados);
        }
        if (req.method === "GET") return json(res, 200, obj.recurso);
        return json(res, 405, { error: { code: 405, message: `${req.method} não existe no gcs-local` } });
      } catch (erro) {
        json(res, 500, { error: { code: 500, message: `gcs-local: ${erro instanceof Error ? erro.message : erro}` } });
      }
    });
  });

  await new Promise((ok, falha) => { servidor.once("error", falha); servidor.listen(porta, host, ok); });
  const endereco = `http://${host}:${servidor.address().port}`;
  return {
    /** Valor de STORAGE_EMULATOR_HOST para o servidor. */
    endereco,
    quantos: () => objetos.size,
    parar: () => new Promise((ok) => { servidor.closeAllConnections?.(); servidor.close(() => ok()); }),
  };
}
