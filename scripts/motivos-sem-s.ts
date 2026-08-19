/**
 * FERRAMENTA — revisa e repara TODOS os motivos que perderam a letra "s".
 *
 * A regra do reparo mora em `shared/reparo-motivo.ts`, provada em
 * `server/__tests__/reparo-do-motivo-sem-s.test.ts` contra o texto real que
 * apareceu na tela de Correção: o teste aplica o defeito ao original e exige o
 * original de volta.
 *
 *   npx tsx scripts/motivos-sem-s.ts             # LISTA tudo. Não grava nada.
 *   npx tsx scripts/motivos-sem-s.ts --aplicar   # grava, depois de você ler
 *
 * DE ONDE VEM O VOCABULÁRIO. Dos motivos ÍNTEGROS do próprio banco — os que
 * foram escritos fora da janela do defeito. Se "substituir" aparece inteiro em
 * outro motivo, "ub tituir" deixa de ser chute. Nenhum dicionário de fora: o
 * vocabulário certo para esta base é o que esta base já escreveu.
 *
 * O QUE ELE NÃO TOCA, de propósito: o log de auditoria e as notificações também
 * guardam o motivo, embutido numa frase. São REGISTRO DO QUE ACONTECEU —
 * reescrevê-los apagaria a prova de que o defeito existiu, e é por essa prova
 * que alguém consegue explicar depois por que um texto ficou estranho.
 */
import { eq, isNotNull, or } from "drizzle-orm";
import { db, pool } from "../server/db";
import { items } from "@shared/schema";
import {
  montarLexico,
  pareceMotivoDanificado,
  repararMotivoSemS,
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

  const textoDe = (l: typeof linhas[number]) =>
    CAMPOS.map(c => l[c]).filter((v): v is string => !!v);

  const danificada = (l: typeof linhas[number]) =>
    textoDe(l).some(pareceMotivoDanificado);

  const afetadas = linhas.filter(danificada);
  const integros = linhas.filter(l => !danificada(l)).flatMap(textoDe);

  console.log(`Vocabulário montado com ${integros.length} motivo(s) íntegro(s) do banco.`);

  if (afetadas.length === 0) {
    console.log("Nenhum motivo com a assinatura do defeito. Nada a fazer.");
    return;
  }

  const lex = montarLexico(integros);
  console.log(`${afetadas.length} peça(s) com motivo que perdeu o "s".\n`);
  let gravadas = 0;

  for (const l of afetadas) {
    console.log(`── ${l.displayId ?? l.id}   (atualizada em ${l.updatedAt?.toISOString().slice(0, 10) ?? "?"})`);
    const patch: Record<string, string> = {};

    for (const campo of CAMPOS) {
      const atual = l[campo];
      if (!atual || !pareceMotivoDanificado(atual)) continue;
      const reparado = repararMotivoSemS(atual, lex);
      console.log(`   ${campo}`);
      console.log(`     antes:  ${atual}`);
      console.log(`     depois: ${reparado}`);
      if (reparado === atual) console.log("     (o vocabulário não fechou nada aqui — precisa de gente)");
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
    : "Nada foi gravado — este modo só lista. Leia o 'depois' de cada uma e rode de novo com --aplicar.");
}

main()
  .catch(e => { console.error(e); process.exitCode = 1; })
  .finally(() => pool.end());
