// Book de aprovação do evento e o aviso por e-mail de quem o recebe.
import type { Express } from "express";
import { storage } from "../../storage";
import { requireAuth, broadcast, createAuditLog } from "../shared";
import type { QuemAge } from "./comum";
import { notifyBookSaved, descreverEnvio, type BookEmailResult } from "../../services/bookEmailNotification";
import { destinatariosDoCanal } from "../../services/destinatarios";
// A tela de Versões guarda o quadro calculado por 30 s. Toda escrita que mude
// versão, decisão ou book derruba esse cache na hora — senão o Atendimento
// revoga uma aprovação e continua vendo o quadro velho numa tela cujo trabalho
// é justamente conferir o que está valendo agora.
import { invalidarCacheDeVersoes } from "../versoes";
import { motivoEventoFechado, erroEventoFechado } from "../eventoFinalizado";
import { responderFalha } from "../../erros";

// ─────────────────────────────────────────────────────────────────────────────
// QUEM RECEBE O AVISO DO BOOK.
//
// Antes: uma variável de ambiente com um endereço, igual para os 38 eventos —
// a mesma pessoa recebia tudo e repassava na mão. Agora o aviso vai para quem
// cuida DAQUELE evento: os executivos de conta dos patrocinadores vinculados.
// O endereço global continua configurado e entra como cópia fixa (é o serviço
// que junta os dois). Endereço faltando não é erro: o evento pode não ter
// executivo definido, e aí resta a cópia global.
// ─────────────────────────────────────────────────────────────────────────────
export async function destinatariosDoEvento(eventId: string): Promise<string[]> {
  // Três consultas, não N+1: um evento com 24 patrocinadores fazia 24 idas ao
  // banco pelos sponsors e mais uma por executivo, dentro do caminho que já
  // segura a publicação do book.
  const [vinculos, todosSponsors, todosUsuarios] = await Promise.all([
    storage.getEventSponsors(eventId),
    storage.getAllSponsors(),
    storage.getAllUsers(),
  ]);
  const executivoDoSponsor = new Map(todosSponsors.map((s) => [s.id, s.accountExecutiveId]));
  const emailDoUsuario = new Map(todosUsuarios.map((u) => [u.id, u.email]));

  const emails = new Set<string>();
  for (const v of vinculos) {
    const execId = executivoDoSponsor.get(v.sponsorId);
    if (!execId) continue; // patrocinador sem executivo: ninguém entra por ele
    const email = emailDoUsuario.get(execId);
    if (email) emails.add(email);
  }
  return Array.from(emails);
}

// ─────────────────────────────────────────────────────────────────────────────
// QUEM RECEBE O AVISO DO BOOK — decisão do dono, revista em 25/08.
//
// A REGRA DE HOJE: a ARTE inteira, mais os EXECUTIVOS DE CONTA dos
// patrocinadores daquele evento. Do Atendimento, só quem tem cliente na prova.
// Duas pessoas nomeadas acompanham em cópia oculta.
//
// Por que mudou (palavras do dono, 25/08): "se eu não tenho cliente vinculado
// na prova, não preciso receber a notificação". O Atendimento inteiro recebia
// todos os books de todos os eventos — e aviso que não é para mim ensina a
// ignorar o sino, o que faz o aviso que ERA para mim passar batido junto.
//
// Por que a Arte continua inteira: ela PUBLICA o book e precisa da confirmação
// de que ele saiu, com a contagem de peças, para conferir se saiu o que devia.
// Não é recado, é o retorno da própria ação.
//
// Por que ninguém entra por ser admin, mesmo o dono tendo dito "arte, admin e
// atendimento vinculado": as contas de admin incluem conta de sistema e gente
// que não acompanha a produção no dia a dia. Quem de admin acompanha de fato
// está em DESTINATARIOS_NOMEADOS — que é a lista de admins, escrita por nome
// em vez de por papel. Solicitação continua fora (decisão de 24/08).
//
// PATROCINADOR SEM EXECUTIVO não coloca ninguém do Atendimento no aviso —
// decisão do dono, em vez de cair no time inteiro. Para o cadastro não deixar
// o aviso mudo, existe `scripts/inferir-executivos.ts`, que propõe o vínculo a
// partir de quem historicamente decide por aquela conta.
//
// PARA MUDAR QUEM RECEBE, é aqui: acrescentar um endereço em
// DESTINATARIOS_NOMEADOS, um papel inteiro em PAPEIS_QUE_RECEBEM, ou desligar
// o roteamento por executivo no interruptor abaixo (que devolve o
// comportamento antigo se PAPEIS_QUE_RECEBEM voltar a ter "atendimento").
// ─────────────────────────────────────────────────────────────────────────────
export const USAR_EXECUTIVOS_DO_EVENTO = true;

/**
 * Papéis que recebem de frente. "atendimento" SAIU em 25/08: quem é do
 * atendimento passa a entrar por ser executivo de conta de um patrocinador do
 * evento, não por ser do papel. Solicitação ficou de fora em 24/08. A lista
 * existe justamente para essas escolhas serem explícitas e reversíveis numa
 * palavra, em vez de virarem um `if` escondido.
 */
export const PAPEIS_QUE_RECEBEM = ["arte"];

/**
 * Quem acompanha, por nome, independentemente do papel. Vai em cópia oculta.
 *
 * Quem está aqui recebe TODO book, de todo evento. São os admins que de fato
 * acompanham a produção (Pedro e Yan) e a Agatha — por papel entrariam também
 * conta de sistema e admin que não olha book, daí a escolha por nome.
 *
 * KAKAU E ANA NÃO ENTRAM AQUI (decisão do dono, 25/08). Elas são gestão, mas
 * no book valem a mesma regra de todo mundo: recebem só quando são a executiva
 * responsável por um patrocinador DAQUELE evento — pelo vínculo, não pelo
 * cargo. Quem dá a elas a visão ampla é o aviso de ACOMPANHAMENTO
 * (services/gestaoDigest.ts), que lista as aprovações paradas de todos os
 * eventos. São dois avisos com mecânicas opostas, de propósito: o book é
 * filtrado por quem responde pela conta; o acompanhamento não é filtrado.
 */
export const DESTINATARIOS_NOMEADOS = [
  "pedro@nortemkt.com",
  "yan.araujo@nortemkt.com",
  "agatha.nadolsky@nortemkt.com",
];

async function porFiltro(teste: (u: { email: string; role: string }) => boolean): Promise<string[]> {
  const usuarios = await storage.getAllUsers();
  return usuarios.filter((u) => !!u.email && teste(u as any)).map((u) => u.email);
}

/** O time que trabalha com o book. */
export const destinatariosPorPapel = () => porFiltro((u) => PAPEIS_QUE_RECEBEM.includes(u.role));

/** Quem acompanha de longe — lista administrável (tela Notificações); a
 *  constante acima é o padrão. Mantém o filtro por usuário cadastrado: a
 *  cópia oculta do book só vai a e-mail que existe no sistema. */
export const destinatariosNomeados = async () => {
  const lista = await destinatariosDoCanal("book", DESTINATARIOS_NOMEADOS);
  return porFiltro((u) => lista.includes(u.email.trim().toLowerCase()));
};

/**
 * Monta e dispara o aviso do book, e devolve a descrição do que aconteceu.
 * Uma falha aqui NUNCA desfaz o book — mas, ao contrário da primeira versão,
 * também não some: quem chama grava na trilha e conta para a tela.
 */
export async function avisarBookPorEmail(
  req: QuemAge,
  eventId: string,
  bookUrl: string,
  count: number,
  comentario?: string | null,
): Promise<BookEmailResult> {
  try {
    const evento = await storage.getEvent(eventId);
    const [porEvento, porPapel, nomeados, doEvento, books] = await Promise.all([
      USAR_EXECUTIVOS_DO_EVENTO ? destinatariosDoEvento(eventId) : Promise.resolve([]),
      destinatariosPorPapel(),
      destinatariosNomeados(),
      storage.getItemsByEvent(eventId),
      storage.getAllEventBooks(),
    ]);
    // NO "PARA" quem trabalha com o book — a Arte (que o publicou) e os
    // executivos com cliente neste evento; em CÓPIA OCULTA quem acompanha.
    //
    // A rede de segurança vale para o time INTEIRO vazio (papel renomeado,
    // cadastro apagado): aí quem acompanha sobe para o "Para", e o aviso nunca
    // sai sem destinatário. Ela NÃO cobre "evento sem executivo resolvido" —
    // esse caso é a regra nova funcionando: a Arte segue no "Para" e ninguém
    // do Atendimento entra, que foi a decisão do dono.
    const time = Array.from(new Set([...porEvento, ...porPapel]));
    const principais = time.length > 0 ? time : nomeados;
    const copias = time.length > 0 ? nomeados : [];
    return await notifyBookSaved({
      eventId,
      eventName: evento?.name ?? "Evento sem nome",
      itemCount: count,
      totalDoEvento: doEvento.length,
      bookUrl,
      publicadoPor: req.userName ?? null,
      saidaDoCaminhao: evento?.truckDepartureDate ? new Date(evento.truckDepartureDate).toISOString() : null,
      publicacao: books.filter((b) => b.eventId === eventId).length || 1,
      comentario: comentario ?? null,
      destinatariosPrincipais: principais,
      destinatariosDeCopia: copias,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "erro desconhecido";
    console.error("[book-email] falha ao preparar o aviso", { eventId, reason });
    return { status: "failed", reason };
  }
}

/** POST /api/events/:eventId/book e /book/notify. */
export function registrarBook(app: Express): void {
  // Update production (Gráfica module)
  // Vincula um PDF de book (layout pronto) às peças selecionadas de um evento.
  // Usado pela Arte para enviar o book aos patrocinadores enquanto a exportação
  // automática não está 100%. Aceita { bookUrl, itemIds }.
  app.post("/api/events/:eventId/book", requireAuth, async (req, res) => {
    try {
      // Gate de papel: era a ÚNICA rota da Arte sem — e como ela limpa o
      // bookUrl do evento antes de gravar, qualquer sessão podia APAGAR o
      // book inteiro. Mesmos papéis das 6 rotas irmãs.
      if (req.userRole !== "arte" && req.userRole !== "admin") {
        return res.status(403).json({ error: "Sem permissão para gerenciar books" });
      }
      const { bookUrl, itemIds, comentario } = req.body ?? {};
      if (!Array.isArray(itemIds) || itemIds.length === 0) {
        return res.status(400).json({ error: "Selecione ao menos uma peça" });
      }
      if (bookUrl !== null && (typeof bookUrl !== "string" || !bookUrl.trim())) {
        return res.status(400).json({ error: "bookUrl inválido" });
      }

      // ANDA (caso duvidoso, barrado): o book é o material que a Arte manda aos
      // patrocinadores para aprovarem — vincular um é abrir rodada de
      // aprovação. E a rota LIMPA o bookUrl de todas as peças do evento antes
      // de gravar, então em evento finalizado ela também apagaria o book
      // arquivado. Na dúvida entre "arquivo" e "trabalho", barra.
      const event = await storage.getEvent(req.params.eventId);
      const fechadoBook = motivoEventoFechado(event);
      if (fechadoBook) {
        return res.status(409).json({
          error: erroEventoFechado(fechadoBook), code: "EVENT_FINALIZED", reason: fechadoBook,
        });
      }
      // ── O QUE MUDOU (pedido do dono, 25/08) ─────────────────────────────
      // Primeira publicação: comentário OPCIONAL. Republicação: OBRIGATÓRIO —
      // quem recebe o e-mail do book novo precisa saber o que mudou sem
      // folhear as páginas comparando. A checagem vem ANTES de qualquer
      // escrita: recusar depois de limpar os bookUrl deixaria o evento sem
      // book nenhum. (E depois da guarda de evento fechado — lá o 409 manda.)
      const textoDoComentario = typeof comentario === "string" ? comentario.trim() : "";
      if (bookUrl) {
        const publicacoesAnteriores = (await storage.getAllEventBooks())
          .filter((b) => b.eventId === req.params.eventId).length;
        if (publicacoesAnteriores > 0 && textoDoComentario.length < 5) {
          return res.status(400).json({
            error: "Republicação exige o comentário do que mudou (mínimo 5 caracteres) — é ele que sai no e-mail de quem recebe o book.",
            code: "COMENTARIO_OBRIGATORIO",
          });
        }
      }
      // Limpa o bookUrl antigo de TODOS os itens do evento antes de setar o novo.
      // Isso garante que itens não selecionados não fiquem com URL obsoleta,
      // evitando que a exportação abra a versão antiga do book.
      await storage.clearEventBookUrl(req.params.eventId);
      const count = await storage.setItemsBookUrl(itemIds, bookUrl || null);
      if (bookUrl) {
        await storage.createEventBook({ eventId: req.params.eventId, bookUrl, itemCount: count, createdBy: req.userName ?? null, comment: textoDoComentario || null });
        invalidarCacheDeVersoes();
        // items.book_url guarda apenas a versão atual; event_books preserva
        // cada publicação anterior para consulta e download futuros.
      }
      // Uma falha de auditoria não deve fazer a tela afirmar que o book não
      // foi salvo — a gravação acima já aconteceu. O erro continua visível nos
      // logs para correção, mas não desfaz nem bloqueia o fluxo principal.
      try {
        await createAuditLog(
          req,
          'updated',
          'event',
          req.params.eventId,
          bookUrl ? `Book de aprovação vinculado a ${count} peça(s)` : `Book removido de ${count} peça(s)`
        );
      } catch (error) {
        console.error("[book] falha ao registrar auditoria", {
          eventId: req.params.eventId,
          reason: error instanceof Error ? error.message : "erro desconhecido",
        });
      }
      // O AVISO vem depois de o book estar salvo E auditado: um efeito externo
      // nunca deve acontecer antes de existir registro interno dele. E o
      // resultado não some — vai para a trilha e para a resposta, para a tela
      // poder dizer "avisado" ou "não avisado, por isto".
      let aviso: BookEmailResult | null = null;
      if (bookUrl) {
        aviso = await avisarBookPorEmail(req, req.params.eventId, bookUrl, count, textoDoComentario || null);
        try {
          await createAuditLog(req, 'updated', 'event', req.params.eventId, descreverEnvio(aviso));
        } catch (error) {
          console.error("[book-email] falha ao registrar o aviso na trilha", {
            eventId: req.params.eventId,
            reason: error instanceof Error ? error.message : "erro desconhecido",
          });
        }
      }
      broadcast({ type: "items_book_updated", eventId: req.params.eventId, count });
      res.json({ updated: count, aviso });
    } catch (error) {
      responderFalha(res, error, "POST /api/events/:eventId/book");
    }
  });

  // REENVIAR o aviso do book atual. Nasceu da revisão de 24/08: com o envio
  // agora registrado, "não chegou" deixou de ser um mistério — e reenviar
  // deixou de exigir republicar o book inteiro.
  //
  // SÓ ADMIN (decisão do dono, 24/08). Começou aberta a Arte e Atendimento —
  // quem publica o book e quem descobre que o e-mail não chegou. O dono
  // preferiu que todo disparo que SAI DO SISTEMA passe por ele: um reenvio
  // manda e-mail de verdade para as 26 pessoas da lista, e não tem desfazer.
  // Quem precisar reenviar pede a um admin; o registro na trilha diz quem
  // mandou e quando.
  app.post("/api/events/:eventId/book/notify", requireAuth, async (req, res) => {
    try {
      if (req.userRole !== "admin") {
        return res.status(403).json({ error: "Apenas administradores podem reenviar o aviso do book" });
      }
      const event = await storage.getEvent(req.params.eventId);
      if (!event) return res.status(404).json({ error: "Evento não encontrado" });

      const doEvento = await storage.getItemsByEvent(req.params.eventId);
      const comBook = doEvento.filter((i) => i.bookUrl);
      const bookUrl = comBook[0]?.bookUrl ?? null;
      if (!bookUrl) {
        return res.status(409).json({ error: "Este evento não tem book publicado para avisar." });
      }

      // O reenvio repete o comentário da ÚLTIMA publicação — é dele que o e-mail fala.
      const livros = (await storage.getAllEventBooks()).filter((b) => b.eventId === req.params.eventId)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      const aviso = await avisarBookPorEmail(req, req.params.eventId, bookUrl, comBook.length, livros[0]?.comment ?? null);
      // A tela de Versões mostra o último aviso lido da trilha — sem isto o
      // reenvio apareceria lá só depois do TTL do cache.
      invalidarCacheDeVersoes();
      try {
        await createAuditLog(req, 'updated', 'event', req.params.eventId, `Reenvio manual. ${descreverEnvio(aviso)}`);
      } catch (error) {
        console.error("[book-email] falha ao registrar o reenvio na trilha", {
          eventId: req.params.eventId,
          reason: error instanceof Error ? error.message : "erro desconhecido",
        });
      }
      res.json({ aviso, mensagem: descreverEnvio(aviso) });
    } catch (error) {
      responderFalha(res, error, "POST /api/events/:eventId/book/notify");
    }
  });
}
