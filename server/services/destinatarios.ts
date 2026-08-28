// ─────────────────────────────────────────────────────────────────────────────
// DESTINATÁRIOS ADMINISTRÁVEIS (dono, 27/08 — tela Notificações).
//
// As três listas nomeadas (acompanhamento da gestão, aviso da revisão e a
// cópia do book) nasceram como constantes no código — e cada "adiciona a
// Lívia" virava deploy. Agora o admin edita pela tela; a constante vira a
// LISTA PADRÃO, que vale enquanto o canal não tiver nenhuma linha no banco.
//
// A REGRA DO FALLBACK, por extenso:
//   · canal SEM linha nenhuma → lista padrão do código (tabela vazia, ou
//     ainda sem migração, não desliga aviso nenhum);
//   · canal COM linhas → SÓ as linhas do banco (elas substituem, não somam —
//     senão não haveria como REMOVER alguém da lista padrão pela tela).
//   · erro de banco (migração pendente, Neon frio) → lista padrão; o aviso
//     das 18h não pode morrer porque a tabela nova ainda não existe.
//
// O que NÃO passa por aqui, de propósito: os destinatários por REGRA — a Arte
// por papel e os executivos por vínculo no evento (book). Regra se lê no
// código; lista com nomes se administra na tela.
// ─────────────────────────────────────────────────────────────────────────────
import { storage } from "../storage";

export type CanalDeAviso = "gestao" | "revisao" | "book";

export const CANAIS_DE_AVISO: readonly CanalDeAviso[] = ["gestao", "revisao", "book"];

export async function destinatariosDoCanal(
  canal: CanalDeAviso,
  padrao: readonly string[],
): Promise<string[]> {
  try {
    const linhas = await storage.getEmailDestinatarios(canal);
    const emails = linhas.map((l) => l.email.trim().toLowerCase()).filter(Boolean);
    return emails.length > 0 ? emails : [...padrao];
  } catch {
    return [...padrao];
  }
}
