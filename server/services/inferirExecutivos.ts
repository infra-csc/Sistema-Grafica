import { db } from "../db";
import { sponsors, users, itemSponsorApprovals, auditLogs } from "@shared/schema";
import { and, eq, isNull } from "drizzle-orm";

type DatabaseLike = Pick<typeof db, "select">;

const CORTE_DE_MAIORIA = 0.5;

const chaveDoNome = (nome: string) =>
  Array.from(nome.normalize("NFD"))
    .filter((caractere) => {
      const codePoint = caractere.codePointAt(0)!;
      return codePoint < 0x0300 || codePoint > 0x036f;
    })
    .join("")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

export type UsuarioExecutivo = {
  id: string;
  name: string;
  email: string;
  role: string;
};

export type PropostaExecutivo = {
  sponsorId: string;
  sponsorName: string;
  decidingName: string;
  totalDecisions: number;
  decisionsByTop: number;
  share: number;
  user: UsuarioExecutivo;
};

export type CasoDuvidosoExecutivo = {
  sponsorId: string;
  sponsorName: string;
  decidingName: string;
  totalDecisions: number;
  decisionsByTop: number;
  reason: string;
};

export type RelatorioInferenciaExecutivos = {
  totalSponsors: number;
  alreadyAssigned: number;
  withoutExecutive: number;
  claras: PropostaExecutivo[];
  duvidosas: CasoDuvidosoExecutivo[];
  semSinal: Array<{ sponsorId: string; sponsorName: string }>;
};

type DecisaoPorPessoa = { aprovou: number; reprovou: number };

async function analisar(database: DatabaseLike): Promise<RelatorioInferenciaExecutivos> {
  const [cadastroInteiro, decisoes, usuarios] = await Promise.all([
    database.select({
      id: sponsors.id,
      name: sponsors.name,
      accountExecutiveId: sponsors.accountExecutiveId,
      arquivadoEm: sponsors.arquivadoEm,
    }).from(sponsors),
    database.select({
      sponsorId: itemSponsorApprovals.sponsorId,
      approvedBy: itemSponsorApprovals.approvedBy,
      rejectedBy: itemSponsorApprovals.rejectedBy,
    }).from(itemSponsorApprovals),
    database.select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
    }).from(users),
  ]);

  const usuariosPorNome = new Map<string, UsuarioExecutivo[]>();
  for (const usuario of usuarios) {
    const lista = usuariosPorNome.get(chaveDoNome(usuario.name)) ?? [];
    lista.push(usuario);
    usuariosPorNome.set(chaveDoNome(usuario.name), lista);
  }

  const decisoesPorSponsor = new Map<string, Map<string, DecisaoPorPessoa>>();
  const registrar = (sponsorId: string, quem: string | null, tipo: keyof DecisaoPorPessoa) => {
    if (!quem?.trim()) return;
    const porPessoa = decisoesPorSponsor.get(sponsorId) ?? new Map<string, DecisaoPorPessoa>();
    const atual = porPessoa.get(quem.trim()) ?? { aprovou: 0, reprovou: 0 };
    atual[tipo] += 1;
    porPessoa.set(quem.trim(), atual);
    decisoesPorSponsor.set(sponsorId, porPessoa);
  };

  for (const decisao of decisoes) {
    registrar(decisao.sponsorId, decisao.approvedBy, "aprovou");
    registrar(decisao.sponsorId, decisao.rejectedBy, "reprovou");
  }

  // Patrocinador arquivado não entra na proposta (não aceita escrita).
  const todosSponsors = cadastroInteiro.filter((sponsor) => !sponsor.arquivadoEm);
  const semExecutivo = todosSponsors.filter((sponsor) => !sponsor.accountExecutiveId);
  const claras: PropostaExecutivo[] = [];
  const duvidosas: CasoDuvidosoExecutivo[] = [];
  const semSinal: Array<{ sponsorId: string; sponsorName: string }> = [];

  for (const sponsor of semExecutivo) {
    const porPessoa = decisoesPorSponsor.get(sponsor.id);
    if (!porPessoa || porPessoa.size === 0) {
      semSinal.push({ sponsorId: sponsor.id, sponsorName: sponsor.name });
      continue;
    }

    const ranking = Array.from(porPessoa.entries())
      .map(([decidingName, contagem]) => ({
        decidingName,
        count: contagem.aprovou + contagem.reprovou,
      }))
      .sort((a, b) => b.count - a.count);
    const top = ranking[0];
    const totalDecisions = ranking.reduce((sum, person) => sum + person.count, 0);
    const candidates = usuariosPorNome.get(chaveDoNome(top.decidingName)) ?? [];
    const share = top.count / totalDecisions;

    let reason: string | null = null;
    if (candidates.length === 0) {
      reason = "o nome não casa com nenhum usuário do cadastro";
    } else if (candidates.length > 1) {
      reason = `o nome casa com ${candidates.length} usuários diferentes`;
    } else if (candidates[0].role !== "atendimento") {
      reason = `quem mais decide é "${candidates[0].role}", não atendimento`;
    } else if (share <= CORTE_DE_MAIORIA) {
      reason = `sem maioria — ${ranking.length} pessoas decidem por esta conta`;
    }

    if (reason) {
      duvidosas.push({
        sponsorId: sponsor.id,
        sponsorName: sponsor.name,
        decidingName: top.decidingName,
        totalDecisions,
        decisionsByTop: top.count,
        reason,
      });
    } else {
      claras.push({
        sponsorId: sponsor.id,
        sponsorName: sponsor.name,
        decidingName: top.decidingName,
        totalDecisions,
        decisionsByTop: top.count,
        share,
        user: candidates[0],
      });
    }
  }

  return {
    totalSponsors: todosSponsors.length,
    alreadyAssigned: todosSponsors.length - semExecutivo.length,
    withoutExecutive: semExecutivo.length,
    claras: claras.sort((a, b) => b.decisionsByTop - a.decisionsByTop),
    duvidosas: duvidosas.sort((a, b) => b.totalDecisions - a.totalDecisions),
    semSinal,
  };
}

export function analisarInferenciaExecutivos(): Promise<RelatorioInferenciaExecutivos> {
  return analisar(db);
}

export type ActorInferencia = {
  userId?: string | null;
  userName?: string | null;
};

export async function aplicarInferenciaExecutivos(actor: ActorInferencia) {
  return db.transaction(async (tx) => {
    const relatorio = await analisar(tx);
    const userName = actor.userName?.trim() || "Administrador";
    let aplicados = 0;

    for (const proposta of relatorio.claras) {
      const atualizada = await tx.update(sponsors)
        .set({ accountExecutiveId: proposta.user.id })
        .where(and(
          eq(sponsors.id, proposta.sponsorId),
          isNull(sponsors.accountExecutiveId),
        ))
        .returning({ id: sponsors.id });

      if (atualizada.length === 0) continue;

      await tx.insert(auditLogs).values({
        userId: actor.userId ?? null,
        userName,
        action: "updated",
        entityType: "sponsor",
        entityId: proposta.sponsorId,
        details: `Executivo de conta inferido: "${proposta.user.name}" respondeu por ${proposta.decisionsByTop} de ${proposta.totalDecisions} decisões (${Math.round(proposta.share * 100)}%) do patrocinador "${proposta.sponsorName}". Vínculo automático — corrija no cadastro se estiver errado.`,
      } as any);
      aplicados += 1;
    }

    return { relatorio, aplicados };
  });
}
