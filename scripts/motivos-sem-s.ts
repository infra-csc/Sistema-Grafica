/**
 * FERRAMENTA — encontra e repara os motivos que perderam a letra "s".
 *
 * A regra de reparo mora em `shared/reparo-motivo.ts`, testada em
 * `server/__tests__/reparo-do-motivo-sem-s.test.ts` contra o texto real que
 * apareceu na tela de Correção. Aqui só há a varredura e a gravação.
 *
 *   npx tsx scripts/motivos-sem-s.ts             # LISTA. Não grava nada.
 *   npx tsx scripts/motivos-sem-s.ts --aplicar   # grava depois de você ler
 *
 * O QUE ELE NÃO TOCA, de propósito: o log de auditoria e as notificações também
 * guardam o motivo, embutido numa frase. Eles são REGISTRO DO QUE ACONTECEU —
 * reescrevê-los apagaria a prova de que o defeito existiu, e é por essa prova
 * que alguém consegue explicar depois por que um texto ficou estranho.
 */
import { eq, isNotNull, or } from "drizzle-orm";
import { db, pool } from "../server/db";
import { items } from "@shared/schema";
import {
  pareceMotivoDanificado,
  repararMotivoSemS,
  suspeitasDeSNoMeio,
} from "@shared/reparo-motivo";

const APLICAR = process.argv.includes("--aplicar");
const CAMPOS = ["rejectionReason", "observations"] as const;

async function main() {
  const linhas = await db
    .select({
      id: items.id,
      displayId: items.displayId,
      rejectionReason: items.rejectionReason,
      observations: items.observations,
      updatedAt: items.updatedAt,
    })
    .from(items)
    .where(or(isNotNull(items.rejectionReason), isNotNull(items.observations)));

  const afetadas = linhas.filter(l =>
    CAMPOS.some(c => { const v = l[c]; return !!v && pareceMotivoDanificado(v); }));

  if (afetadas.length === 0) {
    console.log("Nenhum motivo com a assinatura do defeito. Nada a fazer.");
    return;
  }

  console.log(`${afetadas.length} peça(s) com motivo que perdeu o "s".\n`);
  let gravadas = 0;

  for (const l of afetadas) {
    console.log(`── ${l.displayId ?? l.id}   (atualizada em ${l.updatedAt?.toISOString().slice(0, 10) ?? "?"})`);
    const patch: Record<string, string> = {};

    for (const campo of CAMPOS) {
      const atual = l[campo];
      if (!atual || !pareceMotivoDanificado(atual)) continue;
      const reparado = repararMotivoSemS(atual);
      console.log(`   ${campo}`);
      console.log(`     antes:  ${atual}`);
      console.log(`     depois: ${reparado}`);
      const restam = suspeitasDeSNoMeio(reparado);
      if (restam.length) {
        console.log(`     AINDA PODE FALTAR UM "s" NO MEIO: ${restam.slice(0, 6).join("  |  ")}`);
      }
      if (reparado !== atual) patch[campo] = reparado;
    }

    if (APLICAR && Object.keys(patch).length > 0) {
      await db.update(items).set(patch).where(eq(items.id, l.id));
      gravadas++;
    }
    console.log("");
  }

  console.log(APLICAR
    ? `${gravadas} peça(s) gravada(s). Log de auditoria e notificações NÃO foram tocados.`
    : "Nada foi gravado — este modo só lista. Releia o 'depois' de cada uma e rode de novo com --aplicar.");
}

main()
  .catch(e => { console.error(e); process.exitCode = 1; })
  .finally(() => pool.end());
