// ─────────────────────────────────────────────────────────────────────────────
// O PDF DO BOOK — lido do MESMO armazenamento que serve /objects/uploads/<id>
// (server/objectStorage.ts). Link de fora do sistema (Drive, site) não é
// baixado: o servidor buscar URL arbitrária digitada por alguém é porta para
// abuso, e o book publicado pela tela sempre sobe para o armazenamento.
// ─────────────────────────────────────────────────────────────────────────────
import { PDFDocument } from "pdf-lib";
import { ErroDaIA } from "./ia";

/** Bytes do book. Lança ErroDaIA com motivo legível quando não dá. */
export async function lerPdfDoBook(bookUrl: string): Promise<Buffer> {
  // Import tardio: o módulo do armazenamento cria o cliente do bucket ao ser
  // carregado — os testes e as rotas que não leem arquivo não pagam por isso.
  const { ObjectStorageService, ObjectNotFoundError } = await import("../../objectStorage");
  const servico = new ObjectStorageService();
  const caminho = servico.normalizeObjectEntityPath(bookUrl.split(/[?#]/)[0]);
  if (!caminho.startsWith("/objects/")) {
    throw new ErroDaIA("O book não está no armazenamento do sistema (é um link externo) — a auditoria só lê PDF publicado pela tela.");
  }
  try {
    const arquivo = await servico.getObjectEntityFile(caminho);
    const [bytes] = await arquivo.download();
    return bytes;
  } catch (erro) {
    if (erro instanceof ObjectNotFoundError) throw new ErroDaIA("O arquivo do book não foi encontrado no armazenamento.");
    throw new ErroDaIA(`Não foi possível ler o book do armazenamento: ${erro instanceof Error ? erro.message : String(erro)}`, true);
  }
}

/** Quantas páginas o PDF tem. Lança ErroDaIA se não for PDF legível. */
export async function contarPaginas(bytes: Buffer): Promise<number> {
  if (bytes.subarray(0, 1024).indexOf("%PDF") < 0) throw new ErroDaIA("O arquivo do book não é um PDF.");
  try {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false, throwOnInvalidObject: false });
    return doc.getPageCount();
  } catch (erro) {
    throw new ErroDaIA(`O PDF do book não pôde ser lido: ${erro instanceof Error ? erro.message : String(erro)}`);
  }
}
