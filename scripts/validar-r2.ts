// Apenas arquivos sintéticos em um prefixo exclusivo; não envia e-mail.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createR2Storage } from "../server/r2Storage";
import { setObjectAclPolicy, canAccessObject, ObjectPermission } from "../server/objectAcl";

const client = createR2Storage();
const file = client.bucket(process.env.R2_BUCKET!).file(`.private/validacao-migracao/${randomUUID()}`);
let created = false;
try {
  const bytes = Buffer.from("validacao-sintetica-grafica");
  await file.save(bytes, { contentType: "application/octet-stream" });
  created = true;
  await setObjectAclPolicy(file, { owner: "validacao", visibility: "private" });
  assert.equal(await canAccessObject({ userId: "validacao", objectFile: file, requestedPermission: ObjectPermission.READ }), true);
  assert.equal(await canAccessObject({ userId: "outra-pessoa", objectFile: file, requestedPermission: ObjectPermission.READ }), false);
  const [download] = await file.download();
  assert.deepEqual(download, bytes);
  const chunks: Buffer[] = [];
  for await (const chunk of file.createReadStream({ start: 0, end: 8 })) chunks.push(chunk);
  assert.deepEqual(Buffer.concat(chunks), bytes.subarray(0, 9));
  console.log("R2_OK: gravação, leitura, ACL e faixa de bytes validadas.");
} finally {
  if (created) {
    await file.delete();
    console.log("Arquivo sintético de validação removido.");
  }
}
