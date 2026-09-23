// Replit Object Storage ACL System
// Reference: blueprint:javascript_object_storage
import { File } from "@google-cloud/storage";
import { pecaVisivelPara } from "@shared/kit";

const ACL_POLICY_METADATA_KEY = "custom:aclPolicy";

// The type of the access group.
export enum ObjectAccessGroupType {}

// The logic user group that can access the object.
export interface ObjectAccessGroup {
  type: ObjectAccessGroupType;
  id: string;
}

export enum ObjectPermission {
  READ = "read",
  WRITE = "write",
}

export interface ObjectAclRule {
  group: ObjectAccessGroup;
  permission: ObjectPermission;
}

// The ACL policy of the object.
export interface ObjectAclPolicy {
  owner: string;
  visibility: "public" | "private";
  aclRules?: Array<ObjectAclRule>;
}

// Check if the requested permission is allowed based on the granted permission.
function isPermissionAllowed(
  requested: ObjectPermission,
  granted: ObjectPermission,
): boolean {
  // Users granted with read or write permissions can read the object.
  if (requested === ObjectPermission.READ) {
    return [ObjectPermission.READ, ObjectPermission.WRITE].includes(granted);
  }

  // Only users granted with write permissions can write the object.
  return granted === ObjectPermission.WRITE;
}

// The base class for all access groups.
abstract class BaseObjectAccessGroup implements ObjectAccessGroup {
  constructor(
    public readonly type: ObjectAccessGroupType,
    public readonly id: string,
  ) {}

  // Check if the user is a member of the group.
  public abstract hasMember(userId: string): Promise<boolean>;
}

function createObjectAccessGroup(
  group: ObjectAccessGroup,
): BaseObjectAccessGroup {
  switch (group.type) {
    default:
      throw new Error(`Unknown access group type: ${group.type}`);
  }
}

// Sets the ACL policy to the object metadata.
export async function setObjectAclPolicy(
  objectFile: File,
  aclPolicy: ObjectAclPolicy,
): Promise<void> {
  const [exists] = await objectFile.exists();
  if (!exists) {
    throw new Error(`Object not found: ${objectFile.name}`);
  }

  await objectFile.setMetadata({
    metadata: {
      [ACL_POLICY_METADATA_KEY]: JSON.stringify(aclPolicy),
    },
  });
}

// Gets the ACL policy from the object metadata.
export async function getObjectAclPolicy(
  objectFile: File,
): Promise<ObjectAclPolicy | null> {
  const [metadata] = await objectFile.getMetadata();
  const aclPolicy = metadata?.metadata?.[ACL_POLICY_METADATA_KEY];
  if (!aclPolicy) {
    return null;
  }
  return JSON.parse(aclPolicy as string);
}

// Checks if the user can access the object.
export async function canAccessObject({
  userId,
  objectFile,
  requestedPermission,
}: {
  userId?: string;
  objectFile: File;
  requestedPermission: ObjectPermission;
}): Promise<boolean> {
  // When this function is called, the acl policy is required.
  const aclPolicy = await getObjectAclPolicy(objectFile);
  if (!aclPolicy) {
    return false;
  }

  // Public objects are always accessible for read.
  if (
    aclPolicy.visibility === "public" &&
    requestedPermission === ObjectPermission.READ
  ) {
    return true;
  }

  // Access control requires the user id.
  if (!userId) {
    return false;
  }

  // The owner of the object can always access it.
  if (aclPolicy.owner === userId) {
    return true;
  }

  // Go through the ACL rules to check if the user has the required permission.
  for (const rule of aclPolicy.aclRules || []) {
    const accessGroup = createObjectAccessGroup(rule.group);
    if (
      (await accessGroup.hasMember(userId)) &&
      isPermissionAllowed(requestedPermission, rule.permission)
    ) {
      return true;
    }
  }

  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// ARQUIVO DE PEÇA × USUÁRIO DO KIT
//
// O usuário do Kit só enxerga as peças do Kit que ele criou (`pecaVisivelPara`),
// mas /objects/* servia qualquer arquivo a quem tivesse o caminho. A regra:
// arquivo ligado a peça (thumb, arquivo final, referência, book, fotos de
// conferência/produção/entrega/embalagem) ou a remessa do Kit só sai para quem
// enxerga ao menos uma das donas; arquivo sem dona conhecida (upload recém-
// feito, foto de estoque) segue a regra de sempre.
//
// Custo: só o usuário do Kit passa por aqui (para os outros perfis toda peça é
// visível — a resposta seria sempre "sim"). O caminho feliz é um Set em
// memória com os arquivos das peças DELE (uma consulta pelo índice
// criado_por_id + kit_remessa_id, a cada 60 s por usuário). Só o arquivo que
// não está nesse conjunto custa a busca pelas donas — varredura das colunas de
// URL, guardada 60 s por caminho. Tela dele pede arquivo dele: a busca cara é
// a exceção (quem tenta o caminho de outro, ou arquivo sem dona).
// ─────────────────────────────────────────────────────────────────────────────
export const MSG_ARQUIVO_FORA_DO_KIT = "Este arquivo é de uma peça que não é do seu Kit.";

const VIDA_DO_CACHE_MS = 60_000;
const TETO_DO_CACHE_DE_CAMINHOS = 5_000;

/** "/objects/x" de um valor gravado: tira a query e aceita a forma crua do bucket. */
export function caminhoDoObjeto(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().split(/[?#]/)[0];
  if (v.startsWith("/objects/") && v.length > "/objects/".length) return v;
  const m = v.match(/^https:\/\/storage\.googleapis\.com\/.*?\/\.private\/(.+)$/);
  return m ? `/objects/${m[1]}` : null;
}

type Consulta = (sql: string, params: unknown[]) => Promise<{ rows: any[] }>;
/** Dona do arquivo: a peça, ou a remessa do Kit (kitRemessaId = a própria remessa). */
type Dona = { kitRemessaId: string | null; criadoPorId: string | null };

// Colunas de `items` que guardam arquivo da peça.
const COLUNAS_DA_PECA = [
  "approval_thumb_url", "previous_approval_thumb_url", "final_file_url", "previous_final_file_url",
  "final_preview_url", "conference_photo_url", "delivery_photo_url", "reference_url", "book_url",
];

/** Os arquivos das peças do Kit do usuário (e das remessas dele). $1 = userId. */
export const SQL_ARQUIVOS_DO_KIT_DO_USUARIO = `
WITH minhas AS (
  SELECT id, ${COLUNAS_DA_PECA.join(", ")}, reference_urls
    FROM items WHERE criado_por_id = $1 AND kit_remessa_id IS NOT NULL
)
SELECT u AS url FROM minhas, unnest(ARRAY[${COLUNAS_DA_PECA.join(", ")}] || coalesce(reference_urls, '{}'::text[])) AS u
UNION SELECT thumb_url FROM item_art_versions WHERE item_id IN (SELECT id FROM minhas)
UNION SELECT decided_thumb_url FROM item_sponsor_approvals WHERE item_id IN (SELECT id FROM minhas)
UNION SELECT photo_url FROM delivery_photos WHERE item_id IN (SELECT id FROM minhas)
UNION SELECT photo_url FROM production_updates WHERE item_id IN (SELECT id FROM minhas)
UNION SELECT unnest(fotos) FROM tubo_itens WHERE item_id IN (SELECT id FROM minhas)
UNION SELECT unnest(coalesce(t.fotos_fechamento, '{}'::text[]) || ARRAY[t.foto_entrega_url])
  FROM tubos t WHERE t.id IN (SELECT tubo_id FROM tubo_itens WHERE item_id IN (SELECT id FROM minhas))
UNION SELECT arquivo FROM kit_remessas WHERE criado_por_id = $1`;

// Valor gravado = "/objects/x" (com ou sem query) ou a URL crua do bucket ("…/.private/x").
const bate = (col: string) => `(split_part(${col}, '?', 1) = $1 OR right(split_part(${col}, '?', 1), length($2)) = $2)`;
const bateNaLista = (col: string) => `EXISTS (SELECT 1 FROM unnest(${col}) AS u WHERE ${bate("u")})`;

/** As donas de um arquivo. $1 = "/objects/x", $2 = "/.private/x". */
export const SQL_DONAS_DO_ARQUIVO = `
SELECT i.kit_remessa_id, i.criado_por_id FROM items i
 WHERE ${COLUNAS_DA_PECA.map((c) => bate(`i.${c}`)).join(" OR ")} OR ${bateNaLista("i.reference_urls")}
UNION ALL SELECT i.kit_remessa_id, i.criado_por_id FROM item_art_versions v JOIN items i ON i.id = v.item_id WHERE ${bate("v.thumb_url")}
UNION ALL SELECT i.kit_remessa_id, i.criado_por_id FROM item_sponsor_approvals a JOIN items i ON i.id = a.item_id WHERE ${bate("a.decided_thumb_url")}
UNION ALL SELECT i.kit_remessa_id, i.criado_por_id FROM delivery_photos d JOIN items i ON i.id = d.item_id WHERE ${bate("d.photo_url")}
UNION ALL SELECT i.kit_remessa_id, i.criado_por_id FROM production_updates p JOIN items i ON i.id = p.item_id WHERE ${bate("p.photo_url")}
UNION ALL SELECT i.kit_remessa_id, i.criado_por_id FROM tubo_itens ti JOIN items i ON i.id = ti.item_id WHERE ${bateNaLista("ti.fotos")}
UNION ALL SELECT i.kit_remessa_id, i.criado_por_id FROM tubos t JOIN tubo_itens ti ON ti.tubo_id = t.id JOIN items i ON i.id = ti.item_id
 WHERE ${bate("t.foto_entrega_url")} OR ${bateNaLista("t.fotos_fechamento")}
UNION ALL SELECT r.id, r.criado_por_id FROM kit_remessas r WHERE ${bate("r.arquivo")}
LIMIT 200`;

export function criarAclDoKit(consultar: Consulta, agora: () => number = Date.now) {
  const doUsuario = new Map<string, { expira: number; caminhos: Set<string> }>();
  const donasPorCaminho = new Map<string, { expira: number; donas: Dona[] }>();

  async function arquivosDoUsuario(userId: string): Promise<Set<string>> {
    const guardado = doUsuario.get(userId);
    if (guardado && guardado.expira > agora()) return guardado.caminhos;
    const { rows } = await consultar(SQL_ARQUIVOS_DO_KIT_DO_USUARIO, [userId]);
    const caminhos = new Set<string>();
    for (const r of rows) {
      const c = caminhoDoObjeto(r.url);
      if (c) caminhos.add(c);
    }
    doUsuario.set(userId, { expira: agora() + VIDA_DO_CACHE_MS, caminhos });
    return caminhos;
  }

  async function donasDoArquivo(caminho: string): Promise<Dona[]> {
    const guardado = donasPorCaminho.get(caminho);
    if (guardado && guardado.expira > agora()) return guardado.donas;
    const sufixo = `/.private/${caminho.slice("/objects/".length)}`;
    const { rows } = await consultar(SQL_DONAS_DO_ARQUIVO, [caminho, sufixo]);
    const donas = rows.map((r) => ({ kitRemessaId: r.kit_remessa_id ?? null, criadoPorId: r.criado_por_id ?? null }));
    // Teto simples: o mais antigo sai primeiro (Map guarda a ordem de entrada).
    if (donasPorCaminho.size >= TETO_DO_CACHE_DE_CAMINHOS) {
      const primeiro = donasPorCaminho.keys().next().value;
      if (primeiro !== undefined) donasPorCaminho.delete(primeiro);
    }
    donasPorCaminho.set(caminho, { expira: agora() + VIDA_DO_CACHE_MS, donas });
    return donas;
  }

  return {
    /** O usuário do Kit pode ler este /objects/…? (Para os outros perfis, não chame: é sempre sim.) */
    async podeLer(userId: string, caminhoPedido: string): Promise<boolean> {
      const caminho = caminhoDoObjeto(caminhoPedido);
      if (!caminho) return true;
      if ((await arquivosDoUsuario(userId)).has(caminho)) return true;
      const donas = await donasDoArquivo(caminho);
      // Sem dona conhecida: a regra de sempre (qualquer sessão autenticada).
      if (donas.length === 0) return true;
      return donas.some((d) => pecaVisivelPara({ kit: true, userId }, d));
    },
  };
}
