/**
 * FERRAMENTA — aplica somente as correções revisadas dos motivos que perderam
 * a letra "s".
 *
 * A varredura cobre os campos de item e os motivos individuais de
 * patrocinadores exibidos na tela de Arte.
 *
 *   npx tsx scripts/motivos-sem-s.ts             # LISTA. Não grava nada.
 *   npx tsx scripts/motivos-sem-s.ts --aplicar   # grava após confirmação
 *
 * Log de auditoria e notificações não são reescritos.
 */
import { pool } from "../server/db";
import {
  aplicarReparosMotivosSemS,
  listarReparosMotivosSemS,
} from "../server/services/reparoMotivosSemS";

const APLICAR = process.argv.includes("--aplicar");

async function main() {
  const reparos = await listarReparosMotivosSemS();
  if (reparos.length === 0) {
    console.log("Nenhum texto com correção revisada pendente. Nada a fazer.");
    return;
  }

  console.log(`${reparos.length} registro(s) com correção revisada pendente.\n`);
  for (const reparo of reparos) {
    console.log(`── ${reparo.displayId ?? reparo.recordId} · ${reparo.origem} · ${reparo.campo}`);
    console.log(`   antes:  ${reparo.antes}`);
    console.log(`   depois: ${reparo.depois}\n`);
  }

  if (!APLICAR) {
    console.log("Nada foi gravado — este modo só lista. Rode de novo com --aplicar para confirmar.");
    return;
  }

  const resultado = await aplicarReparosMotivosSemS({ userName: "Sistema" });
  console.log(`${resultado.aplicados} registro(s) gravado(s); ${resultado.ignoradosPorMudanca} ignorado(s) porque o texto mudou durante a operação.`);
}

main()
  .catch(error => { console.error(error); process.exitCode = 1; })
  .finally(() => pool.end());