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
import { db } from "../server/db";
import { sponsors, users, itemSponsorApprovals, auditLogs } from "../shared/schema";
import { eq } from "drizzle-orm";

/** Maioria simples: abaixo disso a conta é disputada e vira decisão humana. */
const CORTE_DE_MAIORIA = 0.5;

/** Nome comparável: sem acento, sem caixa, sem espaço sobrando. */
const chaveDoNome = (n: string) =>
  // NFD separa a letra do acento; o filtro descarta o bloco de marcas
  // combinantes (U+0300 a U+036F). Escrito por code point, e não por um
  // intervalo em regex, porque um escape comido aqui faria dois nomes
  // iguais pararem de casar — em silêncio.
  Array.from(n.normalize("NFD"))
    .filter((c) => { const cp = c.codePointAt(0)!; return cp < 0x0300 || cp > 0x036f; })
    .join("")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

type Usuario = { id: string; name: string; email: string; role: string };

async function main() {
  const aplicar = process.argv.includes("--aplicar");

  const [todosSponsors, decisoes, usuarios] = await Promise.all([
    db.select().from(sponsors),
    db.select().from(itemSponsorApprovals),
    db.select({ id: users.id, name: users.name, email: users.email, role: users.role }).from(users),
  ]);

  // Nome → usuários com aquele nome. Guardamos a LISTA porque nome repetido é
  // justamente o caso que não pode ser resolvido sozinho.
  const usuariosPorNome = new Map<string, Usuario[]>();
  for (const u of usuarios) {
    const k = chaveDoNome(u.name);
    const l = usuariosPorNome.get(k) ?? [];
    l.push(u);
    usuariosPorNome.set(k, l);
  }

  // sponsorId → quem decidiu, e quantas vezes.
  const decisoesPorSponsor = new Map<string, Map<string, { aprovou: number; reprovou: number }>>();
  const registrar = (sponsorId: string, quem: string | null, tipo: "aprovou" | "reprovou") => {
    if (!quem || !quem.trim()) return;
    const porPessoa = decisoesPorSponsor.get(sponsorId) ?? new Map<string, { aprovou: number; reprovou: number }>();
    const atual = porPessoa.get(quem.trim()) ?? { aprovou: 0, reprovou: 0 };
    atual[tipo] += 1;
    porPessoa.set(quem.trim(), atual);
    decisoesPorSponsor.set(sponsorId, porPessoa);
  };
  for (const d of decisoes) {
    // Reprovar também é trabalho de conta: quem devolve a arte ao patrocinador
    // é o mesmo que fala com ele. Contam as duas.
    registrar(d.sponsorId, d.approvedBy, "aprovou");
    registrar(d.sponsorId, d.rejectedBy, "reprovou");
  }

  const semExecutivo = todosSponsors.filter((s) => !s.accountExecutiveId);
  console.log(`${todosSponsors.length} patrocinadores no cadastro · ${todosSponsors.length - semExecutivo.length} já têm executivo · ${semExecutivo.length} sem.\n`);
  if (semExecutivo.length === 0) {
    console.log("Nada a inferir.");
    return;
  }

  type Proposta = {
    sponsorId: string; sponsorNome: string;
    quem: string; total: number; dele: number; fatia: number;
    usuario: Usuario | null;
    motivoDaDuvida: string | null;
  };
  const claras: Proposta[] = [];
  const duvidosas: Proposta[] = [];
  const semSinal: string[] = [];

  for (const s of semExecutivo) {
    const porPessoa = decisoesPorSponsor.get(s.id);
    if (!porPessoa || porPessoa.size === 0) {
      semSinal.push(s.name);
      continue;
    }
    const ranking = Array.from(porPessoa.entries())
      .map(([quem, c]) => ({ quem, n: c.aprovou + c.reprovou }))
      .sort((a, b) => b.n - a.n);
    const total = ranking.reduce((acc, r) => acc + r.n, 0);
    const topo = ranking[0];
    const candidatos = usuariosPorNome.get(chaveDoNome(topo.quem)) ?? [];
    const fatia = topo.n / total;

    let motivo: string | null = null;
    if (candidatos.length === 0) motivo = "o nome não casa com nenhum usuário do cadastro";
    else if (candidatos.length > 1) motivo = `o nome casa com ${candidatos.length} usuários diferentes`;
    else if (candidatos[0].role !== "atendimento") motivo = `quem mais decide é "${candidatos[0].role}", não atendimento`;
    else if (fatia <= CORTE_DE_MAIORIA) motivo = `sem maioria — ${ranking.length} pessoas decidem por esta conta`;

    const p: Proposta = {
      sponsorId: s.id, sponsorNome: s.name,
      quem: topo.quem, total, dele: topo.n, fatia,
      usuario: candidatos.length === 1 ? candidatos[0] : null,
      motivoDaDuvida: motivo,
    };
    (motivo ? duvidosas : claras).push(p);
  }

  const pct = (f: number) => `${Math.round(f * 100)}%`;

  console.log(`── PROPOSTA CLARA (${claras.length}) — nome único, do atendimento, com maioria das decisões`);
  for (const p of claras.sort((a, b) => b.dele - a.dele)) {
    console.log(`  · ${p.sponsorNome} → ${p.usuario!.name} <${p.usuario!.email}>  (${p.dele} de ${p.total} decisões, ${pct(p.fatia)})`);
  }

  console.log(`\n── DECIDA À MÃO (${duvidosas.length}) — o script não tem certeza suficiente`);
  for (const p of duvidosas.sort((a, b) => b.total - a.total)) {
    console.log(`  · ${p.sponsorNome}: quem mais decide é "${p.quem}" (${p.dele} de ${p.total}) — ${p.motivoDaDuvida}`);
  }

  console.log(`\n── SEM SINAL (${semSinal.length}) — nunca tiveram decisão registrada`);
  if (semSinal.length > 0) {
    console.log(`  ${semSinal.slice(0, 20).join(", ")}${semSinal.length > 20 ? `, e mais ${semSinal.length - 20}` : ""}`);
  }
  console.log(`  Nestes o aviso do book não terá executivo para resolver — por decisão do dono, ninguém do atendimento é avisado por causa deles.`);

  if (!aplicar) {
    console.log(`\nDry-run: nada gravado. Confira a lista e rode com --aplicar para vincular as ${claras.length} claras.`);
    return;
  }

  for (const p of claras) {
    await db.update(sponsors).set({ accountExecutiveId: p.usuario!.id }).where(eq(sponsors.id, p.sponsorId));
    await db.insert(auditLogs).values({
      userId: null,
      userName: "Script de inferência",
      action: "updated",
      entityType: "sponsor",
      entityId: p.sponsorId,
      details: `Executivo de conta inferido: "${p.usuario!.name}" respondeu por ${p.dele} de ${p.total} decisões (${pct(p.fatia)}) do patrocinador "${p.sponsorNome}". Vínculo automático — corrija no cadastro se estiver errado.`,
    } as any);
  }
  console.log(`\n${claras.length} executivo(s) vinculado(s). As ${duvidosas.length} duvidosas e as ${semSinal.length} sem sinal continuam sem executivo, de propósito.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
