// ─────────────────────────────────────────────────────────────────────────────
// AS REGRAS DA FILA DA GRÁFICA — o que é função pura, fora do componente.
//
// Os gates por papel (`gatesDaGrafica`), os limites da renderização por lotes,
// os status de cada cartão de etapa e os pequenos cálculos que a linha, o
// cartão do celular e os modais repetem. Nada aqui lê estado de tela.
// ─────────────────────────────────────────────────────────────────────────────
import { splitDisplayId } from "@/lib/displayId";
import { rotuloDaMaquina, EM_REVISAO } from "@shared/fluxo-peca";
import { aEmbalar, statusEmbalavel, CONFERIR_E_EMBALAR } from "@shared/embalagem";
import { podeTravar } from "@shared/trava-da-peca";
import { tetoDeProducao } from "@/lib/grafica-producao";
import { progressoDaImpressao, rotuloCurtoDaAcao } from "@/components/grafica/modal-impressao";
import { podeMexerNaQuantidade } from "@/components/aumentar-quantidade-dialog";
import {
  isDelivered, isPacked, isProduced,
  qtyOf, producedOf, conferredOf, deliveredOf, reusedOf, reusedTotalOf,
  remainingConfer, remainingReuse,
  canConfer as canConferBase,
  isComplement,
} from "@/lib/saldo";
import type { PecaDaFila } from "@/components/grafica/tipos";

/** displayId da peça-mãe. Usa o enrich do servidor e, se faltar, deriva do id. */
export const parentDisplayIdOf = (item: PecaDaFila) =>
  item?.parent?.displayId || splitDisplayId(item?.displayId).base;

/**
 * O destaque FORTE (fundo, faixa, selo sólido e linha de motivo) vale enquanto
 * o complemento não foi entregue. Entre produzir e entregar ainda há
 * conferência e a carga do caminhão, e o complemento é justamente o lote que
 * corre risco de perder a janela logística. Depois de entregue sobra só a
 * identidade permanente ("complemento de #0062") — o alarme some sozinho, sem
 * ninguém precisar confirmar nada.
 */
export const complementOpen = (item: PecaDaFila) => isComplement(item) && !isDelivered(item);
/** Espelha o gate do servidor no DELETE /api/items/:id/complement. */
export const complementUntouched = (item: PecaDaFila) =>
  producedOf(item) === 0 && reusedOf(item) === 0 && conferredOf(item) === 0 && deliveredOf(item) === 0;

// Rótulo da ação principal da peça que JÁ está na máquina. Curto de propósito:
// a impressora e o progresso moram na linha de status logo acima
// (ProgressoImpressao); o botão só diz o gesto — "Impressas" enquanto falta,
// "Mandar p/ acabamento" quando todas saíram. A frase inteira fica no `title`
// (tituloAcaoImpressao). Peça antiga, que entrou "Em Impressão" antes de
// existir a escolha, não tem máquina — aí o título só diz a ação.
/**
 * O rótulo do Conferir: quando dá para conferir MENOS que a peça inteira — parte
 * ainda na máquina (conferência parcial) ou parte já conferida —, o botão diz
 * QUANTO ("Conferir 6"). Antes só contava a parte já conferida: a peça com 6
 * de 12 impressas oferecia "Conferir" e o modal abria com 6.
 */
export const rotuloDoConferir = (item: PecaDaFila) =>
  remainingConfer(item) < qtyOf(item) ? `Conferir ${remainingConfer(item)}` : "Conferir";

export const rotuloAcaoImpressao = (item: PecaDaFila) => rotuloCurtoDaAcao(producedOf(item), tetoDeProducao(item));
export const tituloAcaoImpressao = (item: PecaDaFila) =>
  producedOf(item) >= tetoDeProducao(item) && tetoDeProducao(item) > 0
    ? `Todas as ${tetoDeProducao(item)} saíram da ${rotuloDaMaquina(item.printMachine)} — mandar a peça para o acabamento`
    : `Em impressão na ${rotuloDaMaquina(item.printMachine)} — informar quantas já saíram (${progressoDaImpressao(producedOf(item), tetoDeProducao(item))})`;

/** "13/08 14:22" — timestamp real (fuso local), diferente da Saída, que é UTC. */
export const fmtDataHora = (v?: string | Date | null) => {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
};

/** Mensagem legível de um erro da API (apiRequest devolve o corpo cru). */
export const apiErrorMessage = (error: unknown) => {
  const raw = String((error as { message?: unknown } | null | undefined)?.message ?? "");
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.error) return String(parsed.error);
  } catch { /* não era JSON — usa o texto como veio */ }
  return raw || "Erro inesperado";
};

/** Motivo legível da primeira recusa de um lote (allSettled) — ou null. */
export const motivoDaPrimeiraFalha = (resultados: PromiseSettledResult<unknown>[]): string | null => {
  const r = resultados.find((x): x is PromiseRejectedResult => x.status === "rejected");
  if (!r) return null;
  const txt = apiErrorMessage(r.reason).trim().replace(/[.\s]+$/, "");
  return txt || null;
};

// Renderização incremental: cada evento desenha até ROW_CAP linhas e o resto
// entra sob demanda — o mesmo teto do Painel Geral, da Arte e do Vincular. A
// fila inclui as entregues de todo o histórico; sem o teto, cada entrada na rota
// pintava milhares de linhas concluídas (com miniatura e handlers de hover) em
// máquinas modestas de galpão.
export const ROW_CAP = 50;
// …e o teto por evento não bastava: com dezenas de eventos pequenos cada bloco
// cabia inteiro e a soma passava de 4 mil linhas (55 mil elementos DOM medidos
// em produção, aba congelada por 45 s). A fila inteira agora entra no DOM em
// lotes deste tamanho, conforme a rolagem se aproxima do fim do que já está
// desenhado. Contadores, seleção "Todas", exportação e fila do celular seguem
// lendo o recorte INTEIRO — o lote só decide o que vai para a tela.
export const LINHAS_POR_LOTE = 60;

/**
 * Os status de cada cartão da fila — a MESMA lista conta o número e vira o
 * filtro do clique (casaStatus junta as grafias legadas e os três status da
 * revisão sob a chave canônica).
 */
export const FILTRO_DOS_CARTOES: Record<"revisao" | "liberados" | "emProducao" | "produzidos" | "conferidos" | "embalados" | "entregues", string[]> = {
  revisao: ["awaiting_final_review"],
  liberados: ["ready_for_production", "approved"],
  emProducao: ["inProduction"],
  produzidos: ["produced"],
  conferidos: ["conferred"],
  embalados: ["packed"],
  entregues: ["delivered"],
};

/**
 * ANTES DE PRODUZIR — a janela em que a peça ainda pode voltar.
 *
 * Espelha `STATUS_ANTES_DE_PRODUZIR` em server/routes/items.ts. A partir do
 * momento em que a produção começa existe material físico, `quantityProduced`
 * contado e ativos de inventário criados: devolver para uma fila que assume
 * que nada foi feito exigiria um estorno que não existe.
 */
export const STATUS_ANTES_DE_PRODUZIR = ["ready_for_production", "pronto_para_producao", "approved", "liberado"];
export const podeDevolverParaRevisao = (item: PecaDaFila): boolean =>
  STATUS_ANTES_DE_PRODUZIR.includes(item?.status);

/** A mesma régua das outras devoluções do app (`lerMotivoDevolucao`). */
export const MOTIVO_MIN_DEVOLUCAO = 10;

/** Quem está vendo a fila — só o que os gates leem. */
export type UsuarioDaGrafica = { role?: string | null; kit?: boolean | null } | null | undefined;
export type GatesDaGrafica = ReturnType<typeof gatesDaGrafica>;

/**
 * OS GATES DA FILA POR PAPEL — o espelho de cada rota no servidor. Uma fonte
 * para a linha da tabela, o cartão do celular, o lote e os modais.
 */
export function gatesDaGrafica(user: UsuarioDaGrafica) {
  const isAdmin = user?.role === "admin";
  // DOIS gates, porque o servidor tem dois — e por muito tempo um só fazia o
  // papel dos dois aqui.
  //
  // PRODUZIR é de quem tem a impressora: grafica|admin, espelho de
  // `start-production`. Ampliar este gate faria a Solicitação ver um convite
  // que o servidor recusa com 403 depois do clique.
  const canProduce = ["grafica", "admin"].includes(user?.role ?? "");
  // CONFERIR e ENTREGAR são as duas etapas finais, e têm os mesmos donos:
  // grafica|solicitacao|admin. A conferência estava presa em `canProduce` só
  // porque as duas nasceram juntas — e o efeito era a Solicitação ver a peça
  // do acervo parada sem nenhum caminho adiante, porque a entrega sai do
  // conferido.
  const podeConferir = ["grafica", "solicitacao", "admin"].includes(user?.role ?? "");
  // KIT: a Solicitação da Arena VÊ a peça do Kit na Gráfica, mas só como
  // visualizadora — conferir e entregar a peça do Kit não é dela (o servidor
  // também barra). O usuário do Kit só recebe as peças dele.
  const soVisualizaKit = (item: PecaDaFila) => user?.role === "solicitacao" && !user?.kit && !!item?.kitRemessaId;
  const canConfer = (item: PecaDaFila) => !soVisualizaKit(item) && canConferBase(item);
  // ENTREGA POR PEÇA APOSENTADA: o caminho é Conferido → Embalado → Entregue,
  // e quem entrega é o VOLUME ("Entregar tubo" / aba Tubos).
  // EMBALAR: a ÚNICA ação da peça CONFERIDA. Mesmos papéis das rotas de tubos,
  // e sem exigir evento aberto: conferir/embalar/entregar passam no finalizado.
  // Com QUANTIDADE: embala quem tem unidade conferida ainda não embalada — a
  // conferida inteira, a PARCIAL (7 de 10 conferidas) e a que já foi em parte.
  // O STATUS manda: aEmbalar() já devolve 0 para cancelada, arquivada, em
  // aprovação ou em revisão (statusEmbalavel, em shared/embalagem.ts) — nem o
  // reaproveitamento antigo embala antes da produção.
  const podeEmbalar = (item: PecaDaFila) =>
    !EM_REVISAO.has(item.status) && !soVisualizaKit(item) && !isDelivered(item) && !isPacked(item) && !!item.eventId && aEmbalar(item) > 0;
  // CONFERIR E EMBALAR: só quando esta conferência zera o que falta conferir e
  // a peça poderá ser embalada logo depois (status embalável, ou a conferência
  // fecha a peça inteira) — senão a embalagem seria recusada.
  const oferecerEmbalarJunto = (item: PecaDaFila, qtd: number) =>
    CONFERIR_E_EMBALAR && !!item?.eventId && !soVisualizaKit(item) && qtd > 0
    && qtd >= remainingConfer(item)
    && (statusEmbalavel(item.status) || conferredOf(item) + qtd >= qtyOf(item));
  // "Embalar" quando é tudo; "Embalar 3" quando é só o que falta (ou a parte conferida).
  const rotuloEmbalar = (item: PecaDaFila) => (aEmbalar(item) < qtyOf(item) ? `Embalar ${aEmbalar(item)}` : "Embalar");
  // MEXER NA QUANTIDADE (criar complemento e cancelar complemento) é outro
  // papel: admin | solicitacao, espelho de `podeMudarQuantidade` no servidor.
  // `canProduce` (grafica|admin) NÃO participa deste gate em ponto nenhum — a
  // Gráfica produz o que pedem, não muda o pedido.
  const podeMexerQtd = podeMexerNaQuantidade(user?.role);
  // TETO do Reaproveitar: no fluxo normal, o que resta sem produzir nem
  // reaproveitar; após Produzido (só admin|solicitacao, espelho do mark-reuse
  // no servidor) a ação CONVERTE produzidas em reaproveitadas, então o teto é
  // o que ainda não está marcado como reuso.
  const tetoReaproveitar = (item: PecaDaFila) =>
    isProduced(item) ? Math.max(0, qtyOf(item) - reusedTotalOf(item)) : remainingReuse(item);
  // TRAVAR / DESTRAVAR: Solicitação e admin. A Solicitação sem Kit não trava
  // peça do Kit (o mesmo recorte de sempre).
  const podeMexerNaTrava = (item: PecaDaFila) => podeTravar(user?.role) && !soVisualizaKit(item);
  return {
    isAdmin, canProduce, podeConferir, soVisualizaKit, canConfer, podeEmbalar,
    oferecerEmbalarJunto, rotuloEmbalar, podeMexerQtd, tetoReaproveitar, podeMexerNaTrava,
  };
}
