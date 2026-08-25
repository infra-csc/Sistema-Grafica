// ─────────────────────────────────────────────────────────────────────────────
// REPARO: patrocinador que está NA PEÇA mas não está NO EVENTO.
//
// O caso do dono (25/08, Primavera São Paulo): o Atendimento mostra "falta
// Livelo" nas peças, e o Vincular Patrocinadores diz "Sem patrocinadores no
// evento" — porque as duas telas leem tabelas diferentes. item_sponsors tem a
// marca; event_sponsors não. Peça não deveria carregar marca que o evento não
// conhece: o caminho que criava isso pelo modal foi fechado em 25/08 (o
// Adicionar vincula ao EVENTO primeiro), mas o estoque antigo continua torto.
//
// O QUE ELE FAZ: para cada vínculo peça↔patrocinador de peça viva, garante o
// vínculo evento↔patrocinador correspondente (INSERT só do que falta).
//
// O QUE ELE NÃO FAZ: não mexe em cota (o vínculo nasce sem cota — alguém
// define depois no Vincular), não remove nada, não toca peça nem aprovação.
//
// Idempotente: depois de rodar, nada mais casa o critério.
//
//   npx tsx scripts/reparar-vinculos-de-evento.ts           (lista)
//   npx tsx scripts/reparar-vinculos-de-evento.ts --aplicar (grava)
// ─────────────────────────────────────────────────────────────────────────────
import {
  aplicarVinculosEventoPendentes,
  listarVinculosEventoPendentes,
} from "../server/services/repararVinculosEvento";

async function main() {
  const aplicar = process.argv.includes("--aplicar");
  // As guardas continuam no serviço compartilhado: `if (jaNoEvento.has(chave)) continue;`
  // e `if (!peca?.eventId) continue;` — vínculo existente e peça órfã nunca entram.
  // O vínculo continua nascendo sem cota — defina no Vincular se precisar.
  const pendencias = await listarVinculosEventoPendentes();

  if (pendencias.length === 0) {
    console.log("Nada a reparar: todo patrocinador de peça está vinculado ao seu evento.");
    return;
  }

  console.log(`${pendencias.length} vínculo(s) de evento faltando:\n`);
  for (const pendencia of pendencias) {
    console.log(
      `  · ${pendencia.eventName} ← "${pendencia.sponsorName}"` +
      ` (está em ${pendencia.provas.length} peça${pendencia.provas.length !== 1 ? "s" : ""}: ${pendencia.provas.slice(0, 5).join(", ")}${pendencia.provas.length > 5 ? "…" : ""})`
    );
  }

  if (!aplicar) {
    console.log("\nDry-run: nada gravado. Rode com --aplicar para criar os vínculos.");
    return;
  }

  const resultado = await aplicarVinculosEventoPendentes({ userName: "Script de reparo" });
  console.log(`\n${resultado.aplicados} vínculo(s) criado(s). O Vincular Patrocinadores volta a bater com as peças.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
