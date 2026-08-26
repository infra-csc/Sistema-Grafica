// ─────────────────────────────────────────────────────────────────────────────
// INFERIR O EXECUTIVO DE CONTA de quem decide pelo patrocinador.
//
// Pedido do dono (25/08): o aviso do book vai passar a ir para os executivos
// dos patrocinadores DAQUELE evento, em vez do atendimento inteiro. Só que a
// coluna `sponsors.account_executive_id` está preenchida numa minoria das
// contas — ligar o roteamento assim deixaria o aviso mudo. A ideia dele: "pegar
// o log de quem aprovou esses patrocinadores e meio que vincular".
//
// O SINAL: `item_sponsor_approvals` guarda quem decidiu cada aprovação
// (approved_by / rejected_by). Quem decide sempre pela mesma conta é, na
// prática, o executivo dela.
//
// POR QUE ESTE SCRIPT PROPÕE E NÃO VINCULA SOZINHO — e por que ele só aplica
// o que é inequívoco:
//   · `approved_by` guarda o NOME digitado, não o id. Nome repete, muda com
//     casamento, vem com grafia diferente. Casar por nome é heurística.
//   · quem clicou pode ter sido quem estava na mesa naquele dia (um admin
//     cobrindo férias), não o dono da conta.
// Vincular 100 contas por adivinhação sem revisão humana é o erro que só
// aparece meses depois, quando o aviso não chega para ninguém.
//
// O QUE ELE APLICA com --aplicar: só os casos CLAROS — o nome casou com
// exatamente UM usuário, esse usuário é do atendimento, e ele responde por
// mais da metade das decisões da conta. Todo o resto é listado como "decida à
// mão", com os números na frente para você julgar.
//
// O QUE ELE NUNCA FAZ: sobrescrever executivo já definido (quem tem, tem —
// isso é decisão de gente), tocar em peça, aprovação ou evento.
//
// Idempotente: depois de aplicar, os resolvidos saem do escopo.
//
//   npx tsx scripts/inferir-executivos.ts           (lista a proposta)
//   npx tsx scripts/inferir-executivos.ts --aplicar (grava só os claros)
// ─────────────────────────────────────────────────────────────────────────────
import {
  analisarInferenciaExecutivos,
  aplicarInferenciaExecutivos,
} from "../server/services/inferirExecutivos";

async function main() {
  const aplicar = process.argv.includes("--aplicar");
  const relatorio = await analisarInferenciaExecutivos();
  console.log(`${relatorio.totalSponsors} patrocinadores no cadastro · ${relatorio.alreadyAssigned} já têm executivo · ${relatorio.withoutExecutive} sem.\n`);
  if (relatorio.withoutExecutive === 0) {
    console.log("Nada a inferir.");
    return;
  }

  const pct = (f: number) => `${Math.round(f * 100)}%`;
  console.log(`── PROPOSTA CLARA (${relatorio.claras.length}) — nome único, do atendimento, com maioria das decisões`);
  for (const p of relatorio.claras) {
    console.log(`  · ${p.sponsorName} → ${p.user.name} <${p.user.email}>  (${p.decisionsByTop} de ${p.totalDecisions} decisões, ${pct(p.share)})`);
  }

  console.log(`\n── DECIDA À MÃO (${relatorio.duvidosas.length}) — o script não tem certeza suficiente`);
  for (const p of relatorio.duvidosas) {
    console.log(`  · ${p.sponsorName}: quem mais decide é "${p.decidingName}" (${p.decisionsByTop} de ${p.totalDecisions}) — ${p.reason}`);
  }

  console.log(`\n── SEM SINAL (${relatorio.semSinal.length}) — nunca tiveram decisão registrada`);
  if (relatorio.semSinal.length > 0) {
    const nomes = relatorio.semSinal.map((sponsor) => sponsor.sponsorName);
    console.log(`  ${nomes.slice(0, 20).join(", ")}${nomes.length > 20 ? `, e mais ${nomes.length - 20}` : ""}`);
  }
  console.log(`  Nestes o aviso do book não terá executivo para resolver — por decisão do dono, ninguém do atendimento é avisado por causa deles.`);

  if (!aplicar) {
    console.log(`\nDry-run: nada gravado. Confira a lista e rode com --aplicar para vincular as ${relatorio.claras.length} claras.`);
    return;
  }

  const resultado = await aplicarInferenciaExecutivos({ userName: "Script de inferência" });
  console.log(`\n${resultado.aplicados} executivo(s) vinculado(s). As ${resultado.relatorio.duvidosas.length} duvidosas e as ${resultado.relatorio.semSinal.length} sem sinal continuam sem executivo, de propósito.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
