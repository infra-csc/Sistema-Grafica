// A FAIXA DE RESOLUÇÃO e os PATROCINADORES — conta pura, sem React.
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { estaDividida } from "@shared/impressao-dividida";
import { rotuloDaMaquina } from "@shared/fluxo-peca";
import { ehMolde, moldePodeSerProduzido, moldeConcluido, statusDeExibicao } from "@shared/molde";
import { detalheDaProducao, rotuloDoTubo } from "@/lib/detalhe-producao";
import { getApprovalMeta, getStatusLabel, guiaDoStatus, proximoPassoDaAprovacao } from "@/lib/status";
import { DIA_MS, type NomeDoTom } from "./estilos";
import { dataDoValor, haQuantoTempo } from "./formatos";
import type { AprovacaoDaFicha, EventoDoPercurso, ItemDaFicha } from "./tipos";

export function resolverFaixa({ item, rawStatus, approvalsList, eventosPercurso }: {
  item: ItemDaFicha;
  rawStatus: string;
  approvalsList: AprovacaoDaFicha[];
  eventosPercurso: EventoDoPercurso[];
}) {
  // ═══════════════════════════════════════════════════════════════════════════
  // PATROCINADORES, EM ORDEM DE URGÊNCIA.
  //
  // A ordem era a do banco. Numa peça com cinco marcas, a única que trava tudo
  // podia estar na quarta linha, abaixo de quatro aprovações que não pedem nada
  // de ninguém. Pendente primeiro, reprovado depois, aprovado por último: a
  // lista passa a ser lida de cima para baixo como fila de trabalho.
  // ═══════════════════════════════════════════════════════════════════════════
  const linhasPatrocinador = (item.sponsors ?? []).map((s) => {
    const approval = approvalsList.find((a) => a.sponsorId === s.id);
    // O chip tinha TRÊS ramos para os CINCO estados do vocabulário. Os dois que
    // sobravam — `awaiting_arte` e `new_version_pending` — caíam no "senão" e
    // apareciam como AGUARDANDO, que se lê "esperando o patrocinador". Nos dois
    // a bola está com a CASA: o patrocinador já respondeu.
    const meta = getApprovalMeta(
      approval?.status
        ?? (approval?.approved === true ? "approved"
          : approval?.approved === false ? "rejected" : "pending"),
    ) ?? getApprovalMeta("pending")!;
    return { sponsor: s, approval, meta };
  });

  const PESO_DO_TOM: Record<string, number> = { waiting: 0, rejected: 1, rework: 1, unknown: 2, approved: 3 };
  const patrocinadoresOrdenados = [...linhasPatrocinador]
    .sort((a, b) => (PESO_DO_TOM[a.meta.tone] ?? 2) - (PESO_DO_TOM[b.meta.tone] ?? 2));

  const pendentes  = linhasPatrocinador.filter(l => l.meta.tone === "waiting");
  const reprovados = linhasPatrocinador.filter(l => l.meta.isRejection);
  const aprovados  = linhasPatrocinador.filter(l => l.meta.tone === "approved");

  // ═══════════════════════════════════════════════════════════════════════════
  // A FAIXA DE RESOLUÇÃO.
  //
  // A pergunta que traz alguém a esta ficha é "onde está esta peça e o que
  // falta". A resposta não estava em lugar nenhum: era preciso ler a lista de
  // patrocinadores, cruzar com o histórico e calcular de cabeça há quanto tempo
  // aquilo não anda. Aqui ela vira uma frase, no alto, sem rolar.
  //
  // Tudo sai do que a ficha JÁ tem: status, aprovações com data e observação, e
  // a data do último registro. Nenhuma coluna nova no banco.
  // ═══════════════════════════════════════════════════════════════════════════
  const ultimoMovimentoMs = eventosPercurso.length
    ? eventosPercurso[0].ts
    : (item.updatedAt ? dataDoValor(item.updatedAt).getTime() : NaN);
  const diasParado = Number.isFinite(ultimoMovimentoMs)
    ? Math.max(0, Math.floor((Date.now() - ultimoMovimentoMs) / DIA_MS))
    : null;
  const desdeQuando = diasParado === null ? "" : ` ${haQuantoTempo(diasParado)}`;

  const nomes = (lista: typeof linhasPatrocinador) => lista.map(l => l.sponsor?.name).filter(Boolean).join(", ");

  // Quantidades da gráfica: ausente conta como zero nas comparações.
  const conferidas = item.conferredQty ?? 0;
  const entregues = item.deliveredQty ?? 0;

  const bloqueio: { tom: NomeDoTom; frase: string; detalhe: string | null } = (() => {
    // 1. Alguém reprovou. É o estado mais grave e o único que traz texto escrito
    //    por uma pessoa — o pedido de ajuste é a informação mais útil da tela.
    if (reprovados.length > 0) {
      const primeiro = reprovados[0];
      const quando = primeiro.approval?.rejectedAt
        ? ` em ${format(dataDoValor(primeiro.approval.rejectedAt), "dd/MM 'às' HH:mm", { locale: ptBR })}`
        : "";
      const motivo = primeiro.approval?.rejectionReason
        ? ` — "${String(primeiro.approval.rejectionReason).trim()}"`
        : "";
      return {
        tom: "reprovado",
        frase: reprovados.length === 1
          ? `Reprovada por ${primeiro.sponsor?.name ?? "um patrocinador"}${desdeQuando}`
          : `Reprovada por ${reprovados.length} patrocinadores${desdeQuando}`,
        detalhe: `${primeiro.sponsor?.name ?? "Patrocinador"} reprovou${quando}${motivo}`
          + (aprovados.length ? ` · ${aprovados.length} de ${linhasPatrocinador.length} já aprovaram` : ""),
      };
    }
    // 2. A bola está com o patrocinador.
    if (["awaiting_approval", "awaiting_sponsor_approval"].includes(rawStatus) || pendentes.length > 0) {
      return {
        tom: "espera",
        frase: pendentes.length === 1
          ? `Parada em aprovação${desdeQuando} — falta ${pendentes[0].sponsor?.name ?? "um patrocinador"}`
          : pendentes.length > 1
            ? `Parada em aprovação${desdeQuando} — faltam ${pendentes.length} patrocinadores`
            : `Parada em aprovação${desdeQuando}`,
        detalhe: aprovados.length
          ? `${aprovados.length} de ${linhasPatrocinador.length} já aprovaram: ${nomes(aprovados)}`
          : (pendentes.length > 1 ? `Aguardando: ${nomes(pendentes)}` : "Nenhum patrocinador respondeu até agora"),
      };
    }
    if (rawStatus === "awaiting_linking") {
      return { tom: "espera", frase: `Sem patrocinador vinculado${desdeQuando}`, detalhe: "A peça só entra em aprovação depois de vincular as marcas que aparecem nela." };
    }
    if (rawStatus === "awaiting_submission" && ehMolde(item)) {
      return { tom: "espera", frase: `Molde aguardando a Arte enviar o thumb${desdeQuando}`, detalhe: "O thumb vai direto para a Revisão Final — sem patrocinador nem arquivo final." };
    }
    if (rawStatus === "awaiting_submission") {
      return { tom: "espera", frase: `Aguardando a Arte enviar para aprovação${desdeQuando}`, detalhe: "A arte precisa subir o layout para os patrocinadores decidirem." };
    }
    if (["awaiting_finalization", "sponsor_approved", "awaiting_creator_review"].includes(rawStatus)) {
      return {
        tom: "ok",
        frase: linhasPatrocinador.length
          ? `Aprovada por todos os ${linhasPatrocinador.length} patrocinadores — falta finalizar a arte`
          : "Aprovada — falta finalizar a arte",
        detalhe: `A Arte precisa subir o arquivo final${desdeQuando ? ` · sem movimento${desdeQuando}` : ""}`,
      };
    }
    if (["awaiting_final_review", "awaiting_review"].includes(rawStatus) && ehMolde(item)) {
      return { tom: "espera", frase: `Molde aguardando a revisão final${desdeQuando}`, detalhe: "Revisa-se o thumb — molde não tem arquivo final. Liberado, a Gráfica só marca como produzido." };
    }
    if (["awaiting_final_review", "awaiting_review"].includes(rawStatus)) {
      return { tom: "espera", frase: `Aguardando a revisão final${desdeQuando}`, detalhe: "O arquivo final está pronto e espera a conferência da Solicitação antes de ir para a gráfica." };
    }
    // MOLDE (22/09): liberado espera só o "produzido" da Gráfica.
    if (moldePodeSerProduzido(item)) return { tom: "ok", frase: "Molde liberado — a Gráfica marca como produzido", detalhe: "Sem impressora, conferência ou entrega: o fluxo do molde termina no Produzido." };
    if (["ready_for_production", "pronto_para_producao", "approved", "liberado"].includes(rawStatus)) {
      // Reserva de impressora (aba Máquinas): "Fila: Impressora 2" entra na faixa.
      return { tom: "ok", frase: "Liberada para produção", detalhe: [`A gráfica pode imprimir${desdeQuando ? ` · liberada${desdeQuando}` : ""}`, detalheDaProducao(item)].filter(Boolean).join(" · ") };
    }
    if (["inproduction", "inProduction", "em_producao"].includes(rawStatus)) {
      // Peça DIVIDIDA entre impressoras: a frase não escolhe uma máquina — o
      // detalhe lista cada parte ("Impressora 1 · 5 de 8 · Impressora 2 · 0 de 2").
      const dividida = estaDividida(item);
      return { tom: "espera", frase: `Em impressão${!dividida && item.printMachine ? ` na ${rotuloDaMaquina(item.printMachine)}` : dividida ? " em mais de uma impressora" : ""}${desdeQuando}`, detalhe: detalheDaProducao(item) };
    }
    // MOLDE (22/09): produzido é o fim do fluxo dele.
    if (moldeConcluido(item)) return { tom: "ok", frase: "Molde produzido — fluxo concluído", detalhe: "O molde termina no Produzido: sem conferência, embalagem ou entrega." };
    if (["produced", "produzido"].includes(rawStatus)) {
      return { tom: "espera", frase: `Em acabamento / conferência${desdeQuando}`, detalhe: conferidas > 0 ? `${item.conferredQty} de ${item.quantity} já conferidas` : null };
    }
    if (["conferred", "conferido"].includes(rawStatus)) {
      return { tom: "espera", frase: `Conferida — falta embalar ou entregar${desdeQuando}`, detalhe: entregues > 0 ? `${item.deliveredQty} de ${item.quantity} já entregues` : null };
    }
    if (rawStatus === "packed") {
      // O número do tubo chega na peça (enrich do servidor) — "Tubo 2 · fechado 14:32".
      return { tom: "espera", frase: `${item.tuboAvulso ? "Embalada sozinha" : `Embalada${rotuloDoTubo(item) && rotuloDoTubo(item) !== "Em tubo" ? ` no ${rotuloDoTubo(item)}` : " no tubo"}`} — aguarda o caminhão${desdeQuando}`, detalhe: item.tuboFechadoEm ? detalheDaProducao(item) : entregues > 0 ? `${item.deliveredQty} de ${item.quantity} já entregues` : null };
    }
    if (["delivered", "entregue"].includes(rawStatus)) {
      return { tom: "ok", frase: "Entregue — nada pendente", detalhe: detalheDaProducao(item) };
    }
    // Estado fora do fluxo (rascunho, cancelada, ou um status que esta versão
    // não conhece): dizer o rótulo do status é mais honesto que inventar uma
    // frase de bloqueio.
    return { tom: "neutro", frase: getStatusLabel(rawStatus) || "Sem etapa definida", detalhe: diasParado === null ? null : `Sem movimento ${haQuantoTempo(diasParado)}` };
  })();

  // DE QUEM É A VEZ, E ONDE. A frase da faixa diz o que trava; faltava dizer a
  // quem cabe destravar e em que tela — quem abre a ficha pela primeira vez
  // lia "Aguardando a Arte enviar para aprovação" e não sabia se era com ele.
  // Continua sendo DADO, não ação (ver "ESTA FICHA NÃO AGE" na ficha): nenhum
  // botão, só o endereço de onde a ação mora. Fonte: lib/status (STATUS_GUIA).
  const vezDeQuem: string | null = (() => {
    if (bloqueio.tom === "reprovado") return proximoPassoDaAprovacao("awaiting_arte");
    const g = guiaDoStatus(statusDeExibicao(item));
    if (!g?.quemAge) return null;
    return `Quem age agora: ${g.quemAge}${g.onde ? ` — ${g.onde}` : ""}.`;
  })();

  return { linhasPatrocinador, patrocinadoresOrdenados, aprovados, bloqueio, vezDeQuem };
}

export type LinhaDePatrocinador = ReturnType<typeof resolverFaixa>["linhasPatrocinador"][number];
