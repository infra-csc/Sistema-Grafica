// Disparo manual dos avisos por e-mail e a tela de Notificações do admin.
import type { Express } from "express";
import { storage } from "../../storage";
import { requireAuth, createAuditLog } from "../shared";
import { getBookEmailConfig } from "../../services/bookEmailNotification";
import { enviarAvisoDaRevisao, DESTINATARIOS_DA_REVISAO, agoraNoFuso, ehProducao } from "../../services/revisaoDigest";
import {
  enviarAvisoDaGestao,
  historicoDeEnvios,
  HORARIOS_DA_GESTAO,
  DESTINATARIOS_DA_GESTAO,
} from "../../services/gestaoDigest";
import { CANAIS_DE_AVISO, type CanalDeAviso } from "../../services/destinatarios";
import { verificarConsistencia } from "../../services/consistencia";
import { DESTINATARIOS_NOMEADOS } from "./book";
import { responderFalha } from "../../erros";

/** digests e a tela de Notificações do admin. */
export function registrarAvisos(app: Express): void {
  // DISPARAR O AVISO DA FILA DE REVISÃO AGORA.
  //
  // O aviso é automático às 10h, 15h e 18h; esta porta existe porque ele SAI
  // do sistema e ninguém deveria precisar esperar três horas para saber se o
  // canal está de pé — o conector de e-mail só autentica dentro do ambiente
  // publicado, então testar de fora não é possível.
  //
  // Só admin, pela mesma régua do reenvio do book: um clique manda e-mail de
  // verdade. E ignora a memória da trilha de propósito, senão o segundo teste
  // do dia responderia "já enviado" sem mandar nada.
  app.post("/api/revisao/digest/enviar", requireAuth, async (req, res) => {
    try {
      if (req.userRole !== "admin") {
        return res.status(403).json({ error: "Apenas administradores podem disparar o aviso da fila de revisão" });
      }
      const r = await enviarAvisoDaRevisao(new Date(), process.env, { manual: true });
      const mensagem =
        r.status === "enviado" ? `Aviso enviado — ${r.resumo?.total} na fila, ${r.resumo?.novos} novas.`
        : r.status === "sem-fila" ? "Nada na fila de revisão agora — o aviso não é enviado quando não há o que revisar."
        : r.status === "simulado" ? "Modo de simulação ligado: o e-mail foi montado e não enviado."
        : `Aviso NÃO enviado: ${r.motivo ?? r.status}`;
      res.json({ ...r, mensagem });
    } catch (error) {
      responderFalha(res, error, "POST /api/revisao/digest/enviar");
    }
  });

  // DISPARAR O AVISO DA GESTÃO AGORA (25/08).
  //
  // Mesma razão da porta da Revisão, logo acima: o aviso SAI do sistema e o
  // conector de e-mail só autentica no ambiente publicado — sem este botão, a
  // única forma de descobrir que o canal caiu seria ninguém receber nada e
  // ninguém estranhar. Só admin, pela mesma régua: um clique manda e-mail de
  // verdade para outras três pessoas.
  app.post("/api/gestao/digest/enviar", requireAuth, async (req, res) => {
    try {
      if (req.userRole !== "admin") {
        return res.status(403).json({ error: "Apenas administradores podem disparar o aviso da gestão" });
      }
      const r = await enviarAvisoDaGestao(new Date(), process.env, { manual: true });
      const mensagem =
        r.status === "enviado" ? `Aviso enviado — ${r.resumo?.totalPendentes} aprovações pendentes em ${r.resumo?.eventos.length} evento(s).`
        : r.status === "sem-fila" ? "Nenhuma aprovação pendente agora — o aviso não é enviado quando não há o que acompanhar."
        : r.status === "simulado" ? "Modo de simulação ligado: o e-mail foi montado e não enviado."
        : `Aviso NÃO enviado: ${r.motivo ?? r.status}`;
      res.json({ ...r, mensagem });
    } catch (error) {
      responderFalha(res, error, "POST /api/gestao/digest/enviar");
    }
  });

  // ── TELA NOTIFICAÇÕES (dono, 27/08: "ver o que mandou e o que não mandou,
  // e administrar quem recebe") ──────────────────────────────────────────────
  // Três rotas de admin: o RETRATO (chaves, listas e histórico de edições),
  // adicionar e remover destinatário. As listas do banco SUBSTITUEM as padrão
  // do código quando têm ao menos uma linha (ver services/destinatarios.ts).

  // Carimbado UMA vez, na subida do processo.
  const INICIO_DO_PROCESSO = new Date().toISOString();

  const CANAL_META: Record<CanalDeAviso, { titulo: string; descricao: string; padrao: readonly string[] }> = {
    gestao: {
      titulo: "Acompanhamento da gestão",
      descricao: "Resumo das aprovações pendentes por evento e patrocinador, 3× por dia (10h, 15h, 18h). Fila vazia não vira e-mail.",
      padrao: DESTINATARIOS_DA_GESTAO,
    },
    revisao: {
      titulo: "Fila de revisão",
      descricao: "Resumo da fila de revisão, 3× por dia (10h, 15h, 18h). Fila vazia não vira e-mail.",
      padrao: DESTINATARIOS_DA_REVISAO,
    },
    book: {
      titulo: "Book publicado (cópia de acompanhamento)",
      descricao: "Cópia oculta de TODO book publicado. Só e-mail de usuário cadastrado entra; o 'Para' segue sendo a Arte e os executivos com cliente no evento — isso é regra, não lista.",
      padrao: DESTINATARIOS_NOMEADOS,
    },
  };

  // ── SAUDE DOS DADOS (08/09) ────────────────────────────────────────────────
  // As contradicoes que nenhuma tela sozinha ve — porque cada tela acredita em
  // metade do dado. Ler e barato (contagens), mas e SO ADMIN: a lista nomeia
  // pecas de todos os eventos e nao e trabalho de operacao.
  app.get("/api/admin/consistencia", requireAuth, async (req, res) => {
    if (req.userRole !== "admin") {
      return res.status(403).json({ error: "Apenas administradores podem ver a saude dos dados" });
    }
    try {
      res.json(await verificarConsistencia());
    } catch (error) {
      responderFalha(res, error, "GET /api/admin/consistencia");
    }
  });
  app.get("/api/admin/notificacoes", requireAuth, async (req, res) => {
    try {
      if (req.userRole !== "admin") {
        return res.status(403).json({ error: "Apenas administradores" });
      }
      const config = getBookEmailConfig(process.env);
      // Desde quando este PROCESSO roda (28-31/08: três rodadas de diagnóstico
      // termnaram em 'será que republicou?'). Data anterior ao último push =
      // produção rodando código velho — a discussão acaba aqui.
      const canais = await Promise.all(CANAIS_DE_AVISO.map(async (canal) => {
        const personalizados = await storage.getEmailDestinatarios(canal).catch(() => []);
        return {
          canal,
          ...CANAL_META[canal],
          personalizados,
          emUso: personalizados.length > 0 ? personalizados.map((p) => p.email) : [...CANAL_META[canal].padrao],
        };
      }));
      res.json({
        servidorNoArDesde: INICIO_DO_PROCESSO,
        agora: agoraNoFuso(new Date()),
        horarios: HORARIOS_DA_GESTAO,
        chaves: {
          producao: ehProducao(),
          emailsLigados: config.enabled,
          simulacao: config.dryRun,
          remetente: config.from ?? null,
          // Ligado POR PADRÃO em produção (28/08) — só =false desliga.
          gestaoLigada: process.env.GESTAO_DIGEST_ENABLED?.trim().toLowerCase() !== "false",
          revisaoLigada: process.env.REVISAO_DIGEST_ENABLED?.trim().toLowerCase() !== "false",
        },
        canais,
        edicoes: await historicoDeEnvios(),
      });
    } catch (error) {
      responderFalha(res, error, "GET /api/admin/notificacoes");
    }
  });

  app.post("/api/admin/notificacoes/destinatarios", requireAuth, async (req, res) => {
    try {
      if (req.userRole !== "admin") {
        return res.status(403).json({ error: "Apenas administradores" });
      }
      const { canal, email } = req.body ?? {};
      if (!CANAIS_DE_AVISO.includes(canal)) {
        return res.status(400).json({ error: "Canal inválido" });
      }
      const limpo = String(email ?? "").trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(limpo)) {
        return res.status(400).json({ error: "E-mail inválido" });
      }
      // A PRIMEIRA linha personalizada SUBSTITUI a lista padrão inteira — quem
      // adiciona um nome precisa saber que os padrão saem de cena. A tela
      // avisa; a rota copia o padrão junto na primeira personalização, para
      // "adicionar a Lívia" não significar "remover todo mundo".
      const jaTem = await storage.getEmailDestinatarios(canal);
      if (jaTem.length === 0) {
        for (const padrao of CANAL_META[canal as CanalDeAviso].padrao) {
          await storage.addEmailDestinatario({ canal, email: padrao, addedBy: "padrão do sistema" });
        }
      }
      const criado = await storage.addEmailDestinatario({ canal, email: limpo, addedBy: req.userName ?? null });
      await createAuditLog(req, "added", "gestao", canal,
        `Destinatário "${limpo}" adicionado ao aviso "${CANAL_META[canal as CanalDeAviso].titulo}"`);
      res.status(201).json(criado);
    } catch (error) {
      responderFalha(res, error, "POST /api/admin/notificacoes/destinatarios");
    }
  });

  app.delete("/api/admin/notificacoes/destinatarios/:id", requireAuth, async (req, res) => {
    try {
      if (req.userRole !== "admin") {
        return res.status(403).json({ error: "Apenas administradores" });
      }
      const removido = await storage.removeEmailDestinatario(req.params.id);
      if (!removido) return res.status(404).json({ error: "Destinatário não encontrado" });
      await createAuditLog(req, "deleted", "gestao", removido.canal,
        `Destinatário "${removido.email}" removido do aviso "${CANAL_META[removido.canal as CanalDeAviso]?.titulo ?? removido.canal}"`);
      res.json({ ok: true, removido });
    } catch (error) {
      responderFalha(res, error, "DELETE /api/admin/notificacoes/destinatarios/:id");
    }
  });
}
