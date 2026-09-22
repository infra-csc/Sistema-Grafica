// ─────────────────────────────────────────────────────────────────────────────
// O MODAL DE IMPRESSÃO — compartilhado pela fila da Gráfica e pela aba Máquinas.
//
// POR QUE EXISTE (dono, 21/09). Duas coisas:
//
//   1. "A tela Máquinas está interligada com a da Gráfica: com base no que está
//      lá eles fazem a manutenção e ajustam." Ou seja, quem olha o cartão da
//      impressora precisa INFORMAR as impressas, MANDAR PARA O ACABAMENTO e TROCAR de máquina
//      sem voltar à fila. São os MESMOS endpoints do modal da Gráfica
//      (`/start-printing` e `/start-production`), as mesmas permissões, os
//      mesmos toasts — então o modal mora aqui, e as duas telas o importam.
//      Duplicar o formulário seria criar a segunda cópia que sempre atrasa.
//
//   2. "Qual a diferença entre Registrar e Iniciar a impressão?" — o rodapé
//      antigo mostrava [Cancelar] [Iniciar impressão] [Registrar 1 de 10] ao
//      mesmo tempo, e a pergunta é a prova de que era ambíguo. A regra agora:
//        · Peça AINDA NÃO em impressão: só a escolha da impressora e UM botão
//          primário, "Iniciar impressão na Impressora X". O campo de
//          quantidade nem aparece — não há o que registrar antes de começar.
//        · Peça EM impressão: o cabeçalho diz "Em impressão na Impressora X ·
//          desde HH:MM", um link discreto "Trocar de máquina", o campo de
//          quantidade e UM botão primário que diz o que vai acontecer com a
//          DIFERENÇA: "Mandar 3 para acabamento (4 de 10)"; no teto, "Mandar
//          as últimas 6 e concluir"; sem mudança, desabilitado ("Nada mudou").
//      Os endpoints e o que cada um grava não mudaram — só a ordem dos passos.
//
// VOCABULÁRIO (dono, 21/09): nunca "Registrar" nestes fluxos. Unidade impressa
// é unidade que vai para o acabamento — o botão fala de "impressas" e de
// "mandar para acabamento", e a etapa seguinte chama-se "Impresso / Acabamento".
//
// O que cada gesto grava (a regra continua em items.ts, aqui só a leitura):
//   · Iniciar / trocar → PATCH /start-printing { printMachine }: a peça vai
//     para "Em Impressão" na máquina escolhida (registro "inicio" ou "troca").
//   · Informar impressas / mandar para acabamento → PATCH /start-production { quantityProduced,
//     expectedProduced, printMachine }: o TOTAL já impresso; ao chegar ao teto a
//     peça vai para Impresso / Acabamento (registro "parcial" ou "conclusao").
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2, Play, Printer, Calendar, ArrowLeftRight } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { HIDE_NATIVE_CLOSE, ModalHeader, modalSurface } from "@/components/modal-shell";
import { useAcompanharAreaVisivel } from "@/components/grafica/area-visivel";
import { apiRequest } from "@/lib/queryClient";
import { invalidarGraficaEMaquinas } from "@/lib/tempo-real-grafica";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { avaliarProducao, tetoDeProducao, ehConflitoDeProducao } from "@/lib/grafica-producao";
import { isInProd, producedOf, qtyOf, reusedTotalOf, remainingProduce, type SaldoItem } from "@/lib/saldo";
import { MAQUINAS_DE_IMPRESSAO, rotuloDaMaquina } from "@shared/fluxo-peca";
import { partesDaPeca, estaDividida, lerPartes, resumoDaDivisao } from "@shared/impressao-dividida";
import { disponivelParaAMaquina, livreParaReservar, reservaDaPeca, semImpressora } from "@shared/reserva-de-impressora";
import { progressoDaImpressao, perguntaDaTroca, type OcupanteDaImpressora } from "@shared/progresso-da-impressao";
import { T, FS, R } from "@/lib/theme";

/** O mínimo que o formulário precisa saber da peça. A fila passa o item inteiro. */
export type PecaParaImprimir = SaldoItem & {
  id: string;
  displayId?: string | null;
  type?: string | null;
  description?: string | null;
  status?: string | null;
  printMachine?: string | null;
  productionStartedAt?: string | Date | null;
  approvalThumbUrl?: string | null;
  event?: { name?: string | null } | null;
};

/** Mensagem legível de um erro da API (apiRequest devolve o corpo cru). */
export function mensagemDeErroDaApi(error: any): string {
  const raw = String(error?.message ?? "");
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.error) return String(parsed.error);
  } catch { /* não era JSON — usa o texto como veio */ }
  return raw || "Erro inesperado";
}

/** "HH:MM" de quando a peça entrou na máquina; null sem data. */
export function horaDeInicio(desde: string | Date | null | undefined): string | null {
  if (!desde) return null;
  const d = new Date(desde);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

// ─── As frases (puras — fonte única em shared/progresso-da-impressao.ts) ─────
// A linha da Gráfica, o cartão de Máquinas, este modal e a frase curta do resto
// do fluxo (lib/detalhe-producao) leem as MESMAS funções. Reexportadas aqui
// para quem já importava do modal.
export { progressoDaImpressao, rotuloCurtoDaAcao } from "@shared/progresso-da-impressao";

/**
 * O botão primário do modal diz o que acontece com a DIFERENÇA entre o total
 * informado e o que já tinha saído (dono, 21/09: "se está 1 das 10, só dá para
 * mandar 1 de 10 para acabamento"). Pura: a mesma frase vale para o teste.
 */
export function fraseDoBotaoDeImpressas(informado: number, jaSairam: number, teto: number): { rotulo: string; pode: boolean; aviso: string } {
  if (!Number.isFinite(informado) || informado <= 0) {
    return { rotulo: "Informe quantas saíram", pode: false, aviso: "" };
  }
  if (informado > teto) {
    return { rotulo: `Máximo ${teto}`, pode: false, aviso: `A peça tem ${teto} un. para imprimir — não dá para informar ${informado}.` };
  }
  const diferenca = informado - jaSairam;
  // Dado legado: o total já foi atingido mas a peça continua "Em Impressão"
  // (lançado antes de a conclusão mover a etapa). Mesmo endpoint e payload;
  // só falta mandá-la para o acabamento.
  if (diferenca === 0 && informado >= teto && teto > 0) {
    return { rotulo: "Mandar para acabamento", pode: true, aviso: `Todas as ${teto} já constam impressas — só falta mandar a peça para Impresso / Acabamento.` };
  }
  if (diferenca === 0) {
    return { rotulo: "Nada mudou", pode: false, aviso: `Já constam ${jaSairam} de ${teto} impressas — mude o número para salvar.` };
  }
  if (diferenca < 0) {
    return { rotulo: `Corrigir para ${informado} de ${teto}`, pode: true, aviso: `Reduz o que consta como impresso de ${jaSairam} para ${informado} — a tela vai pedir confirmação.` };
  }
  if (informado >= teto) {
    return {
      rotulo: jaSairam === 0 ? `Mandar todas as ${teto} e concluir` : `Mandar as últimas ${diferenca} e concluir`,
      pode: true,
      aviso: `Com ${teto} de ${teto}, a peça vai para Impresso / Acabamento.`,
    };
  }
  return { rotulo: `Mandar ${diferenca} para acabamento (${informado} de ${teto})`, pode: true, aviso: "" };
}

/**
 * A CONTA DA ETAPA 1 (pura): quantas unidades vão para `maquina`.
 *   · disponível = reservado a ESTA impressora + o que está sem impressora
 *     (o reservado a outras não entra);
 *   · padrão = a parte pedida (`parte`), ou o reservado a ela, ou tudo;
 *   · `inteira` = a peça ainda fora de impressão indo TODA para a máquina —
 *     é o payload de sempre; qualquer outra coisa é `iniciarParte`.
 */
export function contaDoInicio(
  item: PecaParaImprimir, maquina: string, digitado: number | "" | null,
  parte: { quantidade: number; daReserva: boolean } | null | undefined, maquinaDaParte: string | null | undefined,
): { disponivel: number; reservadas: number; origem: string; padrao: number; n: number; valida: boolean; inteira: boolean; linha: string } {
  const peca = item as any;
  // De QUAL reserva saem as unidades: a da impressora escolhida — ou, quando o
  // modal abriu para iniciar a parte reservada a uma impressora e o operador
  // trocou de máquina na hora, a reserva daquela (ela vai para a nova).
  const origem = parte?.daReserva && maquinaDaParte && (reservaDaPeca(peca)[maquinaDaParte] ?? 0) > 0 ? maquinaDaParte : maquina;
  const reservadas = origem ? reservaDaPeca(peca)[origem] ?? 0 : 0;
  const disponivel = disponivelParaAMaquina(peca, origem || null);
  const livre = livreParaReservar(peca);
  const daParte = parte ? parte.quantidade : 0;
  const padrao = Math.min(disponivel, daParte || reservadas || disponivel);
  const n = digitado === null ? padrao : digitado === "" ? 0 : digitado;
  const valida = Number.isInteger(n) && n >= 1 && n <= disponivel;
  const inteira = valida && !isInProd(item) && n === livre;
  const sobram = Math.max(0, livre - n);
  const linha = !maquina ? ""
    : !valida ? `Informe de 1 a ${disponivel} — é o que pode ir para a ${rotuloDaMaquina(maquina)} agora.`
    : sobram === 0 ? `${n === 1 ? "A única unidade vai" : `Todas as ${n} vão`} para a ${rotuloDaMaquina(maquina)}`
    : `${n} ${n === 1 ? "vai" : "vão"} para a ${rotuloDaMaquina(maquina)} · ${sobram} ${sobram === 1 ? "continua liberada" : "continuam liberadas"}${livre - disponivel > 0 ? ` (${livre - disponivel} já reservadas a outra impressora)` : " (sem impressora)"}`;
  return { disponivel, reservadas, origem, padrao, n, valida, inteira, linha };
}

/**
 * A BARRA de progresso da impressão — a mesma na Gráfica (tabela e cartão do
 * celular) e nos cartões de Máquinas. Dono (21/09), com 0 impressas: "esse
 * traço embaixo está estranho, parece que está cortando algo" — era o trilho
 * vazio, fino e da largura da coluna, colado na borda da linha. Então:
 *   · com 0 impressas NÃO há barra (o texto "nenhuma saiu ainda" já diz tudo);
 *   · quando há, PARECE barra: 6px, cantos redondos, trilho neutro, no máximo
 *     160px, com respiro em cima e embaixo.
 */
export function BarraDeImpressao({ feitas, teto, rotulo, testId }: { feitas: number; teto: number; rotulo: string; testId?: string }) {
  if (!(feitas > 0) || !(teto > 0)) return null;
  const pct = Math.min(100, Math.round((feitas / teto) * 100));
  return (
    <div role="progressbar" aria-valuemin={0} aria-valuemax={teto} aria-valuenow={Math.min(feitas, teto)} aria-label={rotulo} data-testid={testId} style={{ height: 6, maxWidth: 160, borderRadius: 999, background: "#e7e5e4", marginTop: 6, marginBottom: 4, overflow: "hidden" }}>
      <div style={{ width: `${pct}%`, height: "100%", background: "#c2410c", borderRadius: 999, transition: "width 0.2s" }} />
    </div>
  );
}

// ─── As mutations ─────────────────────────────────────────────────────────────
// Invalidam a fila (`/api/items/approved`), o acervo, o retrato e o resumo de
// Máquinas — as MESMAS chaves de toda mutação das duas telas
// (lib/tempo-real-grafica.ts): quem registra numa tela vê a outra certa ao
// voltar, sem depender do socket.
const invalidarTudo = () => invalidarGraficaEMaquinas();

export function useMutacoesDeImpressao({ onSucesso }: { onSucesso?: () => void } = {}) {
  const { toast } = useToast();

  const startProductionMutation = useMutation({
    mutationFn: async ({ itemId, data }: { itemId: string; data: any; displayId?: string | null }) =>
      await apiRequest("PATCH", `/api/items/${itemId}/start-production`, data),
    onSuccess: async (res: any, vars) => {
      invalidarTudo();
      onSucesso?.();
      // O toast diz PARA ONDE a peça foi: parcial continua na máquina;
      // completa vai para Acabamento / Conferência. O código da peça fica no
      // título (qual peça o toque atingiu).
      const item = await res?.json?.().catch(() => null);
      const qtd = vars?.data?.quantityProduced;
      const cod = vars.displayId ? ` · ${vars.displayId}` : "";
      if (item?.status === "produced") {
        toast({ title: `Mandada para acabamento${cod}`, description: "Todas as unidades saíram da impressora — a peça está em Impresso / Acabamento." });
      } else {
        toast({ title: `Impressas informadas${cod}`, description: item ? `${qtd} de ${item.quantity} já foram para o acabamento — o restante segue na impressora.` : "A peça segue em impressão." });
      }
    },
    onError: (error: Error) => {
      // O 409 do lock otimista não é "erro do sistema": é outra pessoa tendo
      // lançado produção na mesma peça. As listas recarregam para o operador
      // ver o número novo antes de tentar de novo.
      const conflito = ehConflitoDeProducao(String(error?.message ?? ""));
      if (conflito) invalidarTudo();
      toast({
        title: conflito ? "Alguém informou impressas antes de você" : "Não foi possível salvar as impressas",
        description: mensagemDeErroDaApi(error),
        variant: "destructive",
      });
    },
  });

  // PRIMEIRO MOMENTO (14/09): a peça entra na máquina e fica "Em Impressão".
  // Serve também para TROCAR de máquina no meio da impressão.
  // `quantidade` + `deMaquina` (dono, 21/09): mover só parte do que resta —
  // a peça fica dividida entre impressoras. Sem `quantidade`, move tudo.
  const startPrintingMutation = useMutation({
    mutationFn: async ({ itemId, printMachine, quantidade, deMaquina, iniciarParte, daReserva }: { itemId: string; printMachine: string; displayId?: string | null; trocando?: boolean; quantidade?: number | null; deMaquina?: string | null; ficam?: number; iniciarParte?: boolean; daReserva?: boolean }) =>
      await apiRequest("PATCH", `/api/items/${itemId}/start-printing`, { printMachine, ...(quantidade != null ? { quantidade } : {}), ...(deMaquina ? { deMaquina } : {}), ...(iniciarParte ? { iniciarParte: true, ...(daReserva ? { daReserva: true } : {}) } : {}) }),
    onSuccess: (_r, vars) => {
      invalidarTudo();
      onSucesso?.();
      const cod = vars.displayId ? ` · ${vars.displayId}` : "";
      toast(vars.trocando
        ? (vars.quantidade != null && (vars.ficam ?? 0) > 0
          ? { title: `${vars.quantidade} un. para a ${rotuloDaMaquina(vars.printMachine)}${cod}`, description: `${vars.ficam} ficam na ${rotuloDaMaquina(vars.deMaquina)}. Informe as impressas de cada impressora no cartão dela.` }
          : { title: `Movida para a ${rotuloDaMaquina(vars.printMachine)}${cod}`, description: "O que já saiu fica anotado na máquina anterior." })
        : { title: `Em impressão na ${rotuloDaMaquina(vars.printMachine)}${cod}`, description: "Conforme as unidades saírem, informe quantas já foram impressas." });
    },
    // A causa mais comum do 409 aqui é a outra tela: a impressora foi ocupada
    // (ou a peça mexida) em Máquinas enquanto este modal estava aberto. As
    // listas recarregam para o operador ver o estado real antes de tentar de novo.
    onError: (error: Error, vars) => {
      invalidarTudo();
      toast({
        title: vars.trocando ? "Não foi possível trocar de máquina" : "Não foi possível iniciar a impressão",
        description: mensagemDeErroDaApi(error),
        variant: "destructive",
      });
    },
  });

  const mexerNaImpressoraMutation = useMexerNaImpressora({ onSucesso });
  const reservarMutation = useReservarImpressora({ onSucesso });

  return { startProductionMutation, startPrintingMutation, mexerNaImpressoraMutation, reservarMutation };
}

// ─── Tirar da impressora / trocar por prioridade (as DUAS telas) ─────────────
// Os gestos moravam só no cartão de Máquinas; a Gráfica não tinha como tirar
// uma peça da impressora nem imprimir outra no lugar sem trocar de tela.
// Agora o modal das duas telas os oferece, pela MESMA mutation (e o cartão de
// Máquinas também a usa): mesmo endpoint, mesmos toasts, mesmas chaves.
export type PedidoDeMexer = { maquina: string; sai: OcupanteDaImpressora; entra?: { id: string; displayId?: string | null } | null; quantidade?: number | null; /** De qual RESERVA saem as unidades da que entra (o modal abriu da fila de outra impressora). */ reservaDe?: string | null };
export function useMexerNaImpressora({ onSucesso }: { onSucesso?: () => void } = {}) {
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (v: PedidoDeMexer) =>
      v.entra
        ? await apiRequest("POST", `/api/grafica/maquinas/${v.maquina}/trocar`, { tirarItemId: v.sai.id, colocarItemId: v.entra.id, ...(v.quantidade != null ? { quantidade: v.quantidade } : {}), ...(v.reservaDe ? { reservaDe: v.reservaDe } : {}) })
        : await apiRequest("POST", `/api/grafica/maquinas/${v.maquina}/pausar`, { itemId: v.sai.id }),
    onSuccess: (_r, v) => {
      invalidarTudo();
      onSucesso?.();
      toast(v.entra
        ? { title: `${v.entra.displayId ?? "Peça"} em impressão na ${rotuloDaMaquina(v.maquina)}`, description: `A ${v.sai.displayId ?? "peça anterior"} voltou para o topo da fila desta impressora — o que já saiu dela ficou anotado.` }
        : { title: `${v.sai.displayId ?? "Peça"} tirada da ${rotuloDaMaquina(v.maquina)}`, description: "A impressora ficou livre; a peça está no topo da fila dela com o que falta." });
    },
    onError: (error: Error) => {
      invalidarTudo();
      toast({ title: "Não foi possível mexer na impressora", description: mensagemDeErroDaApi(error), variant: "destructive" });
    },
  });
}

// ─── Reservar impressora (as DUAS telas) ─────────────────────────────────────
// Só um controle: PATCH maquina-prevista não muda status nem diário. Unitário:
// { maquina, quantidade?, deMaquina? } — reservar parte, mover parte entre
// impressoras ou devolver parte. O lote (vários ids) é sempre "tudo".
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
export type PedidoDeReserva = { itemIds: string[]; maquina: string | null; quantidade?: number | null; deMaquina?: string | null };
export function useReservarImpressora({ onSucesso }: { onSucesso?: () => void } = {}) {
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ itemIds, maquina, quantidade, deMaquina }: PedidoDeReserva) => {
      const res = itemIds.length === 1
        ? await apiRequest("PATCH", `/api/items/${itemIds[0]}/maquina-prevista`, { maquina, ...(quantidade != null ? { quantidade } : {}), ...(deMaquina ? { deMaquina } : {}) })
        : await apiRequest("PATCH", "/api/items/bulk-maquina-prevista", { itemIds, maquina });
      return itemIds.length === 1 ? { atualizadas: 1, erros: [] as { displayId: string | null; erro: string }[] } : await res.json();
    },
    onSuccess: (r: any, vars) => {
      invalidarTudo();
      onSucesso?.();
      const n = Number(r?.atualizadas ?? 0);
      const erros: { displayId: string | null; erro: string }[] = r?.erros ?? [];
      toast({
        title: vars.quantidade != null
          ? (vars.maquina ? `${vars.quantidade} un. ${vars.deMaquina ? "movidas" : "reservadas"} para a ${rotuloDaMaquina(vars.maquina)}` : `${vars.quantidade} un. devolvidas à fila geral`)
          : vars.maquina ? `${plural(n, "peça reservada", "peças reservadas")} para a ${rotuloDaMaquina(vars.maquina)}` : `${plural(n, "peça devolvida", "peças devolvidas")} à fila geral`,
        description: erros.length ? `${erros.length} não ${erros.length === 1 ? "entrou" : "entraram"}: ${erros.map((e) => e.displayId ?? "peça").join(", ")} — ${erros[0].erro}` : "Nada muda na etapa da peça — ela aparece na fila da impressora em Máquinas e com o selo \"Fila\" na Gráfica.",
        variant: erros.length && n === 0 ? "destructive" : undefined,
      });
    },
    onError: (error: Error, vars) => {
      invalidarTudo();
      toast({ title: vars.maquina ? "Não foi possível reservar" : "Não foi possível devolver à fila", description: mensagemDeErroDaApi(error), variant: "destructive" });
    },
  });
}

// ─── O cabeçalho ──────────────────────────────────────────────────────────────
/** Título e subtítulo do ModalHeader — os dois lugares dizem a mesma coisa. */
export function cabecalhoDoModalDeImpressao(item: PecaParaImprimir | null | undefined, abrirNaTroca = false): { title: string; subtitle: string } {
  if (!item) return { title: "Imprimir peça", subtitle: "" };
  if (isInProd(item)) {
    const hora = horaDeInicio(item.productionStartedAt);
    if (abrirNaTroca && item.printMachine) {
      return {
        title: `Trocar de máquina — ${rotuloDaMaquina(item.printMachine)}`,
        subtitle: `${hora ? `Desde ${hora} · ` : ""}escolha para onde a peça vai; o que já saiu fica anotado na atual`,
      };
    }
    return {
      title: `Em impressão na ${rotuloDaMaquina(item.printMachine)}`,
      subtitle: `${hora ? `Desde ${hora} · ` : ""}informe quantas já saíram — vai para o acabamento quando todas saírem`,
    };
  }
  return {
    title: producedOf(item) > 0 ? "Continuar impressão" : "Imprimir peça",
    subtitle: "Escolha a impressora e inicie a impressão",
  };
}

// ─── Estilos ──────────────────────────────────────────────────────────────────
/** Rótulo em caixa alta de campo/seletor; no celular sobe para 12px (letra ≥ 12 no galpão). */
const rotulo = (fsMin: (n: number) => number): React.CSSProperties => ({
  display: "block", fontSize: fsMin(FS.micro), fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: T.second, marginBottom: 8,
});
const GROTESK = "'Space Grotesk', sans-serif";

/** O rodapé grudado do modal: o mesmo da fila (era `modalActionsStyle` lá). */
export function rodapeDoModal(padModal: number): React.CSSProperties {
  return {
    display: "flex", flexWrap: "wrap", gap: 10,
    position: "sticky", bottom: -padModal,
    backgroundColor: "#ffffff",
    marginTop: -4, marginLeft: -padModal, marginRight: -padModal, marginBottom: -padModal,
    paddingTop: 12, paddingLeft: padModal, paddingRight: padModal,
    paddingBottom: "calc(12px + env(safe-area-inset-bottom))",
    borderTop: "1px solid #f1f0ef",
    boxShadow: "0 -8px 12px -8px rgba(28,25,23,0.18)",
  };
}

// ─── O formulário ─────────────────────────────────────────────────────────────
interface FormularioProps {
  item: PecaParaImprimir;
  /** Fecha o modal (Cancelar / depois de gravar). */
  onFechar: () => void;
  /** Recuo do corpo do modal, para o rodapé grudado alinhar (16 no celular, 24 no desktop). */
  padModal: number;
  mutacoes: ReturnType<typeof useMutacoesDeImpressao>;
  /**
   * Abre já no painel "Trocar de máquina" (dono, 21/09: "não consigo trocar de
   * máquina um item" — o cartão da aba Máquinas tem a ação direta). Só faz
   * sentido com a peça em impressão; fora disso é ignorado.
   */
  abrirNaTroca?: boolean;
  /**
   * Impressora já marcada ao abrir (peça RESERVADA na aba Máquinas, 21/09):
   * o operador só confirma "Iniciar impressão na Impressora 2" — e pode
   * trocar antes. Só vale para peça ainda fora da máquina.
   */
  maquinaInicial?: string | null;
  /**
   * Peça DIVIDIDA entre impressoras: de qual cartão o modal foi aberto. As
   * impressas e a troca passam a valer para a parte DESSA impressora.
   */
  maquinaEmQuestao?: string | null;
  /**
   * Iniciar SÓ UMA PARTE da peça (reserva com quantidade, 21/09): a reservada
   * a `maquinaInicial` (`daReserva`) ou `quantidade` do que está sem
   * impressora. O modal fica na etapa "iniciar" mesmo com a peça já em
   * impressão em outra máquina.
   */
  parteAIniciar?: { quantidade: number; daReserva: boolean } | null;
  /**
   * UMA PEÇA POR VEZ (21/09): impressoras ocupadas por OUTRA peça → código dela
   * ({ "1": "#0123" }). Ficam desabilitadas no seletor, com "com #0123". Pode vir
   * incompleto (a Gráfica só conhece o que carregou): o 409 do servidor é a autoridade.
   */
  ocupadas?: Ocupadas;
}

/**
 * Impressora → quem a ocupa. As duas telas mandam o OCUPANTE inteiro (de
 * `ocupacaoDasImpressoras`, shared/progresso-da-impressao.ts — a mesma régua do
 * servidor); com ele o modal oferece "Imprimir esta no lugar". Só o código
 * (formato antigo) continua valendo: a impressora fica apenas bloqueada.
 */
export type Ocupadas = Record<string, string | null | OcupanteDaImpressora>;
const codigoDoOcupante = (v: string | null | OcupanteDaImpressora | undefined): string | null =>
  v && typeof v === "object" ? v.displayId : v ?? null;
const ocupanteCompleto = (v: string | null | OcupanteDaImpressora | undefined): OcupanteDaImpressora | null =>
  v && typeof v === "object" ? v : null;

/**
 * Quanto saiu AGORA vira o TOTAL que o servidor grava (dono, 21/09: "se tem
 * 5 na impressora, como imprimo 10?" — ele digitava o de agora num campo que
 * pedia o acumulado). Pura: `agora` vazio/0 → nada a salvar.
 */
export function totalAPartirDoAgora(jaSairam: number, agora: number | "", teto: number): { total: number; pode: boolean; aviso: string; linha: string } {
  const naImpressora = Math.max(0, teto - jaSairam);
  const n = agora === "" ? 0 : agora;
  if (!Number.isFinite(n) || n <= 0) {
    return { total: jaSairam, pode: false, aviso: "", linha: `${jaSairam} já ${jaSairam === 1 ? "saiu" : "saíram"} · ${naImpressora} na impressora` };
  }
  if (n > naImpressora) {
    return { total: jaSairam + n, pode: false, aviso: `Só há ${naImpressora} na impressora — não dá para informar ${n} agora.`, linha: `${jaSairam} já saíram + ${n} agora = ${jaSairam + n} de ${teto}` };
  }
  const total = jaSairam + n;
  return { total, pode: true, aviso: "", linha: `${jaSairam} já ${jaSairam === 1 ? "saiu" : "saíram"} + ${n} agora = ${total} de ${teto} · ${total >= teto ? "nenhuma fica na impressora" : `${teto - total} ${teto - total === 1 ? "fica" : "ficam"} na impressora`}` };
}

/**
 * O formulário em si. Monte com `key={item.id}`: o estado (máquina escolhida,
 * quantidade) nasce da peça e NÃO é sincronizado por efeito — trocar a peça
 * troca a chave, e o React remonta limpo.
 */
export function FormularioDeImpressao({ item, onFechar, padModal, mutacoes, abrirNaTroca = false, maquinaInicial = null, maquinaEmQuestao = null, parteAIniciar = null, ocupadas }: FormularioProps) {
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const fsMin = (n: number) => (isMobile ? Math.max(12, n) : n);
  const { startProductionMutation, startPrintingMutation, mexerNaImpressoraMutation, reservarMutation } = mutacoes;
  // Uma impressora está "ocupada por OUTRA peça" — exceto a impressora onde
  // esta peça já tem parte por imprimir (somar parte onde ela já imprime pode).
  const ocupadaPorOutra = (m: string): boolean => {
    const minha = partesDaPeca(item)[m];
    return !!ocupadas && m in ocupadas && !(minha && minha.atrib > minha.impressas);
  };
  // "Tirar da impressora" pede confirmação leve, aqui mesmo.
  const [confirmandoTirar, setConfirmandoTirar] = useState(false);
  const emImpressao = isInProd(item) && !parteAIniciar;
  // Peça dividida: a "máquina atual" é a do cartão que abriu o modal, e os
  // números (já saíram / teto) são os da parte dela.
  const partes = partesDaPeca(item);
  // "Por partes" = tem jsonb — inclusive UMA parte só, quando apenas a parte
  // reservada a uma impressora foi iniciada (o teto dela é menor que a peça).
  const dividida = estaDividida(item) || !!lerPartes((item as any).impressaoPorMaquina);
  const maquinaAtual = (dividida && maquinaEmQuestao && partes[maquinaEmQuestao] ? maquinaEmQuestao : item.printMachine) ?? "";
  const parte = maquinaAtual ? partes[maquinaAtual] : undefined;

  // Peça em impressão SEM máquina anotada (iniciada antes do controle por
  // máquina): o painel de impressora já nasce aberto e o gesto é "Confirmar
  // impressora" — o servidor grava "inicio", não "troca".
  const semMaquinaAnotada = emImpressao && !maquinaAtual;
  // Quem veio pelo "Trocar de máquina" do cartão também nasce no painel.
  const nasceTrocando = semMaquinaAnotada || (emImpressao && abrirNaTroca);
  // Antes de iniciar, começa vazia (obriga a escolha). Em impressão, é a da
  // peça — e só muda dentro do painel "Trocar de máquina" (que nasce vazio,
  // para a atual, desabilitada, não ficar marcada).
  const [maquinaEscolhida, setMaquinaEscolhida] = useState<string>(
    emImpressao ? (nasceTrocando ? "" : maquinaAtual) : (maquinaInicial && MAQUINAS_DE_IMPRESSAO.includes(maquinaInicial) ? maquinaInicial : ""),
  );
  const [trocando, setTrocando] = useState(nasceTrocando);
  // Pré-preenche com o que JÁ SAIU da máquina, não com o total (dono, 14/09):
  // a impressão é registrada aos poucos, e com o TOTAL pré-preenchido um toque
  // distraído concluía uma peça com 10 de 40 impressas. "Tudo" continua a um toque.
  // O campo pergunta quantas saíram AGORA (nasce vazio); o total é calculado.
  // "Corrigir o total já informado" abre o modo antigo, absoluto.
  const [agora, setAgora] = useState<number | "">("");
  const [modoTotal, setModoTotal] = useState(false);
  const [quantidadeTotal, setQuantidadeTotal] = useState<number>(producedOf(item));
  // ETAPA 1 — quantas vão para a impressora escolhida (dono, 21/09: "ainda não
  // consigo colocar a quantidade"). null = ainda no padrão (reservado a ela,
  // ou tudo o que está livre); o resto da peça continua liberado.
  const [qtdIniciar, setQtdIniciar] = useState<number | "" | null>(null);
  // Mover: tudo o que resta (padrão) ou uma quantidade.
  const [moverTudo, setMoverTudo] = useState(true);
  const [qtdMover, setQtdMover] = useState<number | "">("");
  // Enter SEGURADO no teclado numérico dispara vários submits antes de o React
  // redesenhar o botão desabilitado. A trava por ref vale na hora.
  const envioRef = useRef(false);

  // Dividida: os números da parte desta impressora; senão, os da peça.
  const teto = dividida && parte ? parte.atrib : tetoDeProducao(item);
  const jaSairam = dividida && parte ? parte.impressas : producedOf(item);
  const restanteAqui = Math.max(0, teto - jaSairam);
  const alvo = isMobile ? 48 : 44;
  // A peça do modal é trocada pela da fila nova (depois de um 409, ou do
  // lançamento de um colega): o TOTAL absoluto do modo "corrigir" nasce de novo
  // do número novo — senão ele gravaria por cima do que o colega lançou.
  const jaSairamRef = useRef(jaSairam);
  useEffect(() => {
    if (jaSairamRef.current === jaSairam) return;
    jaSairamRef.current = jaSairam;
    setQuantidadeTotal(jaSairam);
  }, [jaSairam]);

  const iniciarOuTrocar = () => {
    if (!maquinaEscolhida || startPrintingMutation.isPending) return;
    const trocando = emImpressao && !!maquinaAtual;
    if (!emImpressao) {
      const c = contaDoInicio(item, maquinaEscolhida, qtdIniciar, parteAIniciar, maquinaInicial);
      if (!c.valida) return;
      // Tudo o que a peça tem livre, numa peça ainda fora de impressão = o gesto
      // de sempre. Qualquer outra coisa é UMA PARTE (o resto segue liberado).
      startPrintingMutation.mutate(c.inteira
        ? { itemId: item.id, printMachine: maquinaEscolhida, displayId: item.displayId, trocando: false }
        : { itemId: item.id, printMachine: maquinaEscolhida, displayId: item.displayId, trocando: false, iniciarParte: true, daReserva: c.reservadas > 0, quantidade: c.n, ...(c.reservadas > 0 && c.origem !== maquinaEscolhida ? { deMaquina: c.origem } : {}) });
      return;
    }
    const n = !trocando || moverTudo ? null : (qtdMover === "" ? 0 : qtdMover);
    if (trocando && !moverTudo && (!n || n <= 0 || n > restanteAqui)) return;
    startPrintingMutation.mutate({
      itemId: item.id, printMachine: maquinaEscolhida, displayId: item.displayId, trocando,
      ...(trocando && n != null ? { quantidade: n, deMaquina: maquinaAtual, ficam: restanteAqui - n } : {}),
      ...(trocando && dividida && n == null ? { deMaquina: maquinaAtual } : {}),
    });
  };

  const salvarImpressas = (e: React.FormEvent) => {
    e.preventDefault();
    if (envioRef.current || startProductionMutation.isPending) return;
    if (!maquinaAtual) {
      toast({ title: "Escolha a máquina", description: "Diga em qual máquina a peça foi impressa antes de informar as impressas.", variant: "destructive" });
      return;
    }
    const total = modoTotal ? quantidadeTotal : totalAPartirDoAgora(jaSairam, agora, teto).total;
    let payload: any;
    if (dividida && parte) {
      // Por impressora: o servidor recalcula o total da peça como a soma das partes.
      if (!Number.isInteger(total) || total <= 0 || total > teto) {
        toast({ title: "Quantidade inválida", description: `Informe entre 1 e ${teto} un. para a ${rotuloDaMaquina(maquinaAtual)}.`, variant: "destructive" });
        return;
      }
      if (total < jaSairam && !window.confirm(`Reduz o que consta impresso na ${rotuloDaMaquina(maquinaAtual)} de ${jaSairam} para ${total} un. Confirmar?`)) return;
      // `expectedNaMaquina`: o lock otimista da PARTE — quem lança na outra
      // impressora da mesma peça não vira conflito (o servidor soma sobre a
      // linha travada); quem lançou NESTA parte, sim.
      payload = { quantityProduced: producedOf(item) - jaSairam + total, expectedProduced: producedOf(item), expectedNaMaquina: jaSairam, printMachine: maquinaAtual, maquina: maquinaAtual, impressasNaMaquina: total };
    } else {
      // O servidor grava o TOTAL produzido (contrato ABSOLUTO). `avaliarProducao`
      // valida o teto, monta o lock otimista e diz quando a gravação REDUZ o
      // registro — caso em que a pergunta cita os dois números.
      const av = avaliarProducao(item, total, maquinaAtual);
      if (!av.ok || !av.payload) {
        toast({ title: "Quantidade inválida", description: av.erro, variant: "destructive" });
        return;
      }
      if (av.precisaConfirmar && !window.confirm(av.confirmacao)) return;
      payload = av.payload;
    }
    envioRef.current = true;
    startProductionMutation.mutate(
      { itemId: item.id, data: payload, displayId: item.displayId },
      { onSettled: () => { envioRef.current = false; } },
    );
  };

  const seletorDeMaquina = (excluir: string | null) => (
    <div role="radiogroup" aria-label="Impressora" data-testid="seletor-maquina">
      <span style={rotulo(fsMin)}>{excluir ? "Mover para" : "Impressora"}</span>
      {/* Botões grandes e não um select: tela de galpão, muitas vezes no
          celular — quatro alvos de toque resolvem com um dedo. No celular
          vira 2×2 para "Impressora 4 (Targa Elite)" caber. */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : `repeat(${MAQUINAS_DE_IMPRESSAO.length}, 1fr)`, gap: 8 }}>
        {MAQUINAS_DE_IMPRESSAO.map((m) => {
          const ativa = maquinaEscolhida === m;
          const ehAtual = m === excluir;
          // Ocupada por OUTRA peça — exceto a impressora onde esta peça já está
          // (somar parte onde ela já imprime é permitido).
          const ocupadaPor = ocupadaPorOutra(m) ? codigoDoOcupante(ocupadas![m]) ?? "outra peça" : null;
          // TROCA POR PRIORIDADE (21/09): antes de iniciar, a impressora
          // ocupada pode ser escolhida quando se sabe QUEM está nela — surge
          // "Imprimir esta no lugar". Na troca de máquina (peça já em
          // impressão) continua bloqueada.
          const trocavel = !excluir && !!ocupadaPor && !!ocupanteCompleto(ocupadas![m]);
          return (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={ativa}
              disabled={ehAtual || (!!ocupadaPor && !trocavel)}
              data-ocupada={ocupadaPor || undefined}
              title={ehAtual ? "A peça já está nesta impressora" : ocupadaPor ? (trocavel ? `Ocupada: está com ${ocupadaPor} — escolha para imprimir esta no lugar` : `Ocupada: está com ${ocupadaPor} — uma peça por vez por impressora`) : undefined}
              onClick={() => setMaquinaEscolhida(m)}
              data-testid={`maquina-${m}`}
              style={{ minHeight: 48, padding: "6px 8px", borderRadius: R.md, cursor: ehAtual || (ocupadaPor && !trocavel) ? "not-allowed" : "pointer", fontFamily: GROTESK, fontSize: 13, fontWeight: 800, lineHeight: 1.2, backgroundColor: ativa ? T.text : "#f4f3f0", color: ativa ? "#ffffff" : T.text, border: ativa ? `2px solid ${T.text}` : "2px solid transparent", opacity: ehAtual || (ocupadaPor && !trocavel) ? 0.45 : ocupadaPor && !ativa ? 0.75 : 1, transition: "background-color 0.12s" }}
            >
              {rotuloDaMaquina(m)}
              {ocupadaPor && <span style={{ display: "block", fontSize: 12, fontWeight: 700 }}>com {ocupadaPor}</span>}
            </button>
          );
        })}
      </div>
      {!maquinaEscolhida && (
        <div role="status" style={{ fontSize: fsMin(12), color: "#b45309", marginTop: 6 }}>Escolha a impressora para continuar.</div>
      )}
    </div>
  );

  const botaoCancelar = (
    <button
      type="button"
      onClick={onFechar}
      style={{ flex: 1, minHeight: alvo, padding: "0 12px", backgroundColor: "transparent", border: `1px solid ${T.border}`, color: "#57534e", fontWeight: 700, fontSize: 14, cursor: "pointer", borderRadius: R.md, transition: "background-color 0.15s" }}
      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#f4f3f0")}
      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
    >
      Cancelar
    </button>
  );

  // ── PEÇA AINDA NÃO EM IMPRESSÃO: só a máquina e UM botão. ──────────────────
  if (!emImpressao) {
    const conta = contaDoInicio(item, maquinaEscolhida, qtdIniciar, parteAIniciar, maquinaInicial);
    const escolhidaOcupada = !!maquinaEscolhida && ocupadaPorOutra(maquinaEscolhida);
    const quemSai = escolhidaOcupada ? ocupanteCompleto(ocupadas![maquinaEscolhida]) : null;
    const pode = !!maquinaEscolhida && conta.valida && !escolhidaOcupada && !startPrintingMutation.isPending;
    const podeTrocarNoLugar = !!quemSai && conta.valida && !mexerNaImpressoraMutation.isPending;
    // SÓ RESERVAR (21/09): o gesto da fila de Máquinas, também daqui. Reserva
    // o que está SEM impressora; a peça continua liberada (nada muda de etapa).
    const sem = semImpressora(item as any);
    const podeReservar = !!maquinaEscolhida && !parteAIniciar?.daReserva && sem > 0 && conta.valida && conta.n <= sem && !reservarMutation.isPending;
    const codigoDestaPeca = [item.displayId, item.type ? `(${item.type})` : null].filter(Boolean).join(" ") || null;
    return (
      <div data-testid="form-impressao" data-etapa="iniciar" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {seletorDeMaquina(null)}
        {!!maquinaEscolhida && conta.disponivel > 0 && (
          <div data-testid="quantas-vao">
            <label htmlFor="input-quantidade-iniciar" style={rotulo(fsMin)}>Quantas vão para esta impressora?</label>
            <div style={{ display: "flex", gap: 10 }}>
              <input
                id="input-quantidade-iniciar"
                type="number"
                inputMode="numeric"
                pattern="[0-9]*"
                enterKeyHint="done"
                min={1}
                max={conta.disponivel}
                value={qtdIniciar === null ? conta.padrao : qtdIniciar}
                onChange={(e) => setQtdIniciar(e.target.value === "" ? "" : Math.max(0, parseInt(e.target.value) || 0))}
                aria-describedby="linha-quantas-vao"
                aria-invalid={!conta.valida || undefined}
                data-testid="input-quantidade-iniciar"
                style={{ flex: 1, minWidth: 0, minHeight: alvo, boxSizing: "border-box", textAlign: "center", fontFamily: GROTESK, fontSize: isMobile ? 18 : 20, fontWeight: 700, color: T.text, backgroundColor: "#f4f3f0", border: "none", borderRadius: R.md, padding: "0 12px" }}
              />
              <button
                type="button"
                onClick={() => setQtdIniciar(conta.disponivel)}
                data-testid="button-iniciar-tudo"
                title={`Todas as ${conta.disponivel} que podem ir para esta impressora`}
                style={{ backgroundColor: "#e7e5e4", border: "none", borderRadius: R.md, padding: "0 20px", minHeight: alvo, fontWeight: 700, fontSize: 14, color: "#44403c", cursor: "pointer", whiteSpace: "nowrap" }}
              >
                Tudo
              </button>
            </div>
            <div id="linha-quantas-vao" role="status" data-testid="linha-quantas-vao" style={{ fontSize: fsMin(12), fontWeight: 700, color: conta.valida ? T.text : "#b45309", marginTop: 8, fontVariantNumeric: "tabular-nums", lineHeight: 1.4 }}>
              {conta.linha}
            </div>
          </div>
        )}
        <p style={{ margin: 0, fontSize: fsMin(12), color: T.second, lineHeight: 1.45 }}>
          {jaSairam > 0
            ? `Já saíram ${jaSairam} de ${teto}. Ao iniciar, a peça volta para "Em Impressão" e você informa o restante conforme sair.`
            : parteAIniciar
              ? `Só as unidades acima entram em impressão agora; o resto da peça continua reservado ou na fila geral.`
              : `Ao iniciar, a peça fica "Em Impressão". Faltam ${remainingProduce(item)} un. — você informa quantas saíram conforme a máquina terminar.`}
        </p>
        {quemSai && (
          <div role="alertdialog" aria-label="Imprimir esta no lugar" data-testid="troca-no-modal" style={{ display: "flex", flexDirection: "column", gap: 8, padding: "10px 12px", borderRadius: R.md, background: "#fffbeb", border: "1px solid #fde68a", color: "#92400e", fontSize: fsMin(12), lineHeight: 1.45 }}>
            <span style={{ fontWeight: 700 }}>{perguntaDaTroca(quemSai, codigoDestaPeca, maquinaEscolhida)}</span>
            <button
              type="button"
              disabled={!podeTrocarNoLugar}
              onClick={() => { if (podeTrocarNoLugar) mexerNaImpressoraMutation.mutate({ maquina: maquinaEscolhida, sai: quemSai, entra: { id: item.id, displayId: item.displayId }, quantidade: conta.n, ...(conta.reservadas > 0 && conta.origem !== maquinaEscolhida ? { reservaDe: conta.origem } : {}) }); }}
              data-testid="button-imprimir-no-lugar"
              style={{ minHeight: alvo, padding: "0 12px", borderRadius: R.md, border: "none", background: T.text, color: "#fff", fontFamily: GROTESK, fontWeight: 700, fontSize: 14, cursor: podeTrocarNoLugar ? "pointer" : "not-allowed", opacity: podeTrocarNoLugar ? 1 : 0.55 }}
            >
              {mexerNaImpressoraMutation.isPending ? "Trocando…" : `Imprimir esta no lugar (${conta.n} un.)`}
            </button>
          </div>
        )}
        {!!maquinaEscolhida && sem > 0 && !parteAIniciar?.daReserva && (
          <button
            type="button"
            disabled={!podeReservar}
            onClick={() => { if (podeReservar) reservarMutation.mutate({ itemIds: [item.id], maquina: maquinaEscolhida, quantidade: conta.n }); }}
            data-testid="button-so-reservar"
            title={conta.n > sem ? `Só ${sem} un. estão sem impressora — dá para reservar até ${sem}` : `Deixa ${conta.n} un. na fila da ${rotuloDaMaquina(maquinaEscolhida)}, sem iniciar — a peça continua liberada`}
            style={{ alignSelf: "flex-start", minHeight: isMobile ? 44 : 34, padding: "0 12px", borderRadius: R.md, border: `1px solid ${T.border}`, background: "#ffffff", color: T.text, fontSize: fsMin(12), fontWeight: 700, cursor: podeReservar ? "pointer" : "not-allowed", opacity: podeReservar ? 1 : 0.55 }}
          >
            {reservarMutation.isPending ? "Reservando…" : conta.n <= sem ? `Só reservar ${conta.n} un. para a ${rotuloDaMaquina(maquinaEscolhida)}` : `Só reservar (até ${sem} un. sem impressora)`}
          </button>
        )}
        <div data-testid="rodape-iniciar" style={rodapeDoModal(padModal)}>
          {!isMobile && botaoCancelar}
          <button
            type="button"
            onClick={iniciarOuTrocar}
            disabled={!pode}
            data-testid="button-iniciar-impressao"
            aria-busy={startPrintingMutation.isPending || undefined}
            // Celular: "Iniciar 20 un. na Impressora 4 (Targa Elite)" não cabe
            // em 2/3 de 358px sem quebrar em três linhas — o primário ocupa a
            // linha inteira, EM CIMA (no DOM também), e o Cancelar vai embaixo.
            // Esta etapa não abre teclado, então os dois andares não apertam.
            style={{ flex: isMobile ? "1 1 100%" : 2, minHeight: alvo, padding: "0 12px", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: T.text, border: "none", color: "#ffffff", fontFamily: GROTESK, fontWeight: 700, fontSize: 14, borderRadius: R.md, cursor: pode ? "pointer" : "not-allowed", opacity: pode ? 1 : 0.55, transition: "background-color 0.15s" }}
            onMouseEnter={(e) => { if (pode) e.currentTarget.style.backgroundColor = "#000000"; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = T.text; }}
          >
            {startPrintingMutation.isPending && <Loader2 aria-hidden="true" className="animate-spin" style={{ width: 14, height: 14 }} />}
            {startPrintingMutation.isPending ? "Iniciando…"
              : !maquinaEscolhida ? "Iniciar impressão"
              : !conta.valida ? `De 1 a ${conta.disponivel}`
              : conta.inteira ? `Iniciar tudo (${conta.n}) na ${rotuloDaMaquina(maquinaEscolhida)}`
              : `Iniciar ${conta.n} un. na ${rotuloDaMaquina(maquinaEscolhida)}`}
          </button>
          {isMobile && botaoCancelar}
        </div>
      </div>
    );
  }

  // ── PEÇA EM IMPRESSÃO: quantidade + UM botão; a troca fica num painel. ─────
  const hora = horaDeInicio(item.productionStartedAt);
  const doAgora = totalAPartirDoAgora(jaSairam, agora, teto);
  // No modo "agora", a frase do botão é a de sempre sobre o total calculado;
  // sem número, o botão diz o que falta ("Informe quantas saíram").
  const frase = modoTotal
    ? fraseDoBotaoDeImpressas(quantidadeTotal, jaSairam, teto)
    : (agora === "" || agora <= 0)
      ? (jaSairam >= teto && teto > 0 ? fraseDoBotaoDeImpressas(teto, jaSairam, teto) : { rotulo: "Informe quantas saíram", pode: false, aviso: "" })
      : doAgora.pode ? fraseDoBotaoDeImpressas(doAgora.total, jaSairam, teto) : { rotulo: `Máximo ${restanteAqui} agora`, pode: false, aviso: doAgora.aviso };
  const podeSalvar = frase.pode && !!maquinaAtual && !startProductionMutation.isPending;
  const qtdMoverValida = moverTudo || (qtdMover !== "" && qtdMover > 0 && qtdMover <= restanteAqui);
  const podeTrocar = !!maquinaEscolhida && maquinaEscolhida !== maquinaAtual && !startPrintingMutation.isPending && qtdMoverValida && !ocupadaPorOutra(maquinaEscolhida);
  // TIRAR DA IMPRESSORA (o gesto do cartão de Máquinas, agora no modal das
  // duas telas): o que já saiu fica anotado e o resto volta para o TOPO da
  // fila desta impressora. Sem o bloqueio de evento finalizado — recuar nunca
  // é barrado (o servidor também não barra quem SAI).
  const podeTirar = !!maquinaAtual && restanteAqui > 0 && !mexerNaImpressoraMutation.isPending;
  const tirar = () => { if (podeTirar) mexerNaImpressoraMutation.mutate({ maquina: maquinaAtual, sai: { id: item.id, displayId: item.displayId ?? null, impressas: jaSairam, teto } }); };
  const naImpressora = restanteAqui;
  const movidas = moverTudo ? restanteAqui : (qtdMover === "" ? 0 : qtdMover);
  // "Manter na Impressora 1 (New XT)" ao lado de "Mover 5 para a Impressora 4
  // (Targa Elite)" não cabe em 326px: no celular o Mover ocupa a linha de cima
  // e o Manter a de baixo (ordem do DOM = ordem na tela).
  const botaoManter = maquinaAtual ? (
    <button
      type="button"
      onClick={() => { setTrocando(false); setMaquinaEscolhida(maquinaAtual); }}
      data-testid="button-manter-maquina"
      style={{ flex: isMobile ? "1 1 100%" : 1, minHeight: alvo, padding: "0 12px", backgroundColor: "transparent", border: `1px solid ${T.border}`, color: "#57534e", fontWeight: 700, fontSize: 13, cursor: "pointer", borderRadius: R.md }}
    >
      Manter na {rotuloDaMaquina(maquinaAtual)}
    </button>
  ) : null;

  return (
    <form onSubmit={salvarImpressas} data-testid="form-impressao" data-etapa="impressas" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Onde a peça está, com hora — e o link discreto para trocar. */}
      <div data-testid="onde-esta" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", padding: "10px 12px", borderRadius: R.md, background: "#fff7ed", border: "1px solid #fed7aa" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0, flex: "1 1 200px", fontSize: fsMin(13), color: "#9a3412", fontWeight: 700 }}>
          <Printer aria-hidden="true" style={{ width: 14, height: 14, flexShrink: 0 }} />
          {/* Quebra linha, nunca corta: "Em impressão na Impressora 4 (Targa
              Elite) · desde 10:12" não cabe em 390px numa linha só. */}
          <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>
            {maquinaAtual ? `Em impressão na ${rotuloDaMaquina(maquinaAtual)}` : "Em impressão — impressora não anotada"}{hora ? ` · desde ${hora}` : ""}
            <span data-testid="progresso-no-modal" style={{ display: "block", fontSize: fsMin(11), fontWeight: 600, color: "#9a3412", opacity: 0.9, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>
              {dividida
                ? `${jaSairam} de ${teto} nesta impressora · peça ${producedOf(item)} de ${tetoDeProducao(item)} no total`
                : progressoDaImpressao(jaSairam, teto)}
            </span>
            {dividida && (
              <span data-testid="divisao-no-modal" style={{ display: "block", fontSize: fsMin(11), fontWeight: 600, color: "#9a3412", opacity: 0.8, marginTop: 2 }}>
                Dividida: {resumoDaDivisao(partes)}
              </span>
            )}
          </span>
        </span>
        {/* Botão contornado, não link sublinhado: o dono não o achava no
            meio da faixa laranja (21/09). Some só enquanto o painel está aberto. */}
        {!trocando && !confirmandoTirar && !!maquinaAtual && restanteAqui > 0 && (
          <button
            type="button"
            onClick={() => setConfirmandoTirar(true)}
            disabled={!podeTirar}
            data-testid="button-tirar-da-impressora"
            title={`Tirar da ${rotuloDaMaquina(maquinaAtual)}: o que já saiu fica anotado e o resto volta para o topo da fila dela — a impressora fica livre`}
            style={{ minHeight: isMobile ? 44 : 34, padding: "0 12px", display: "inline-flex", alignItems: "center", justifyContent: "center", border: "1px solid #d6d3d1", background: "#ffffff", color: T.text, fontSize: fsMin(12), fontWeight: 700, cursor: podeTirar ? "pointer" : "not-allowed", borderRadius: R.md, whiteSpace: "nowrap", flexShrink: 0, ...(isMobile ? { flex: "1 1 100%" } : {}) }}
          >
            Tirar da impressora
          </button>
        )}
        {confirmandoTirar && !!maquinaAtual && (
          <div role="alertdialog" aria-label="Tirar da impressora" data-testid="confirmar-tirar" style={{ flex: "1 1 100%", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: fsMin(12), color: "#92400e", fontWeight: 700 }}>
            <span style={{ flex: "1 1 220px" }}>Tirar {item.displayId ?? "a peça"} da {rotuloDaMaquina(maquinaAtual)}? {jaSairam} de {teto} ficam anotadas; {restanteAqui} {restanteAqui === 1 ? "volta" : "voltam"} para o topo da fila dela.</span>
            <button type="button" onClick={tirar} disabled={!podeTirar} data-testid="button-confirmar-tirar" style={{ minHeight: isMobile ? 44 : 32, padding: "0 12px", borderRadius: R.md, border: "none", background: T.text, color: "#fff", fontWeight: 700, cursor: "pointer" }}>{mexerNaImpressoraMutation.isPending ? "Tirando…" : "Tirar"}</button>
            <button type="button" onClick={() => setConfirmandoTirar(false)} style={{ minHeight: isMobile ? 44 : 32, padding: "0 10px", borderRadius: R.md, border: `1px solid ${T.border}`, background: "#fff", color: "#57534e", fontWeight: 700, cursor: "pointer" }}>Cancelar</button>
          </div>
        )}
        {!trocando && !!maquinaAtual && (
          <button
            type="button"
            onClick={() => { setTrocando(true); setMaquinaEscolhida(""); }}
            data-testid="button-trocar-maquina"
            title="Mover esta peça para outra impressora"
            // Celular: largura total, na linha de baixo da faixa — um alvo
            // inteiro para o dedo, sem disputar a linha com o texto.
            style={{ minHeight: isMobile ? 44 : 34, padding: "0 12px", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, border: "1.5px solid #9a3412", background: "#ffffff", color: "#9a3412", fontFamily: GROTESK, fontSize: fsMin(12), fontWeight: 700, cursor: "pointer", borderRadius: R.md, whiteSpace: "nowrap", flexShrink: 0, ...(isMobile ? { flex: "1 1 100%" } : {}) }}
          >
            <ArrowLeftRight aria-hidden="true" style={{ width: 13, height: 13 }} />
            Trocar de máquina
          </button>
        )}
      </div>

      {trocando && (
        <div data-testid="painel-troca" style={{ display: "flex", flexDirection: "column", gap: 12, padding: 12, borderRadius: R.lg, border: `1px solid ${T.border}`, background: T.bg }}>
          {seletorDeMaquina(maquinaAtual || null)}
          {/* Tudo ou uma quantidade (dono, 21/09): a peça pode ficar dividida. */}
          {!!maquinaAtual && !!maquinaEscolhida && restanteAqui > 1 && (
            <div role="radiogroup" aria-label="Quanto mover" data-testid="quanto-mover" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <span style={rotulo(fsMin)}>Quanto vai para a {rotuloDaMaquina(maquinaEscolhida)}</span>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <button type="button" role="radio" aria-checked={moverTudo} onClick={() => setMoverTudo(true)} data-testid="mover-tudo" style={{ minHeight: alvo, padding: "0 14px", borderRadius: R.md, fontFamily: GROTESK, fontSize: 13, fontWeight: 800, backgroundColor: moverTudo ? T.text : "#f4f3f0", color: moverTudo ? "#fff" : T.text, border: `2px solid ${moverTudo ? T.text : "transparent"}`, cursor: "pointer" }}>
                  Tudo ({restanteAqui})
                </button>
                <button type="button" role="radio" aria-checked={!moverTudo} onClick={() => setMoverTudo(false)} data-testid="mover-quantidade" style={{ minHeight: alvo, padding: "0 14px", borderRadius: R.md, fontFamily: GROTESK, fontSize: 13, fontWeight: 800, backgroundColor: !moverTudo ? T.text : "#f4f3f0", color: !moverTudo ? "#fff" : T.text, border: `2px solid ${!moverTudo ? T.text : "transparent"}`, cursor: "pointer" }}>
                  Quantidade
                </button>
                {!moverTudo && (
                  <input
                    type="number"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    min={1}
                    max={restanteAqui}
                    value={qtdMover}
                    onChange={(e) => setQtdMover(e.target.value === "" ? "" : Math.max(0, parseInt(e.target.value) || 0))}
                    aria-label={`Quantas unidades vão para a ${rotuloDaMaquina(maquinaEscolhida)}`}
                    placeholder="0"
                    data-testid="input-quantidade-mover"
                    style={{ width: 96, minHeight: alvo, boxSizing: "border-box", textAlign: "center", fontFamily: GROTESK, fontSize: isMobile ? 16 : 18, fontWeight: 700, color: T.text, backgroundColor: "#f4f3f0", border: "none", borderRadius: R.md, padding: "0 10px" }}
                  />
                )}
              </div>
              <p role="status" data-testid="texto-mover" style={{ margin: 0, fontSize: fsMin(12), color: qtdMoverValida ? T.second : "#b45309", lineHeight: 1.45 }}>
                {qtdMoverValida
                  ? `${movidas} ${movidas === 1 ? "vai" : "vão"} para a ${rotuloDaMaquina(maquinaEscolhida)}; ${restanteAqui - movidas} ${restanteAqui - movidas === 1 ? "fica" : "ficam"} na ${rotuloDaMaquina(maquinaAtual)}.`
                  : `Informe de 1 a ${restanteAqui} — é o que ainda está por imprimir na ${rotuloDaMaquina(maquinaAtual)}.`}
              </p>
            </div>
          )}
          <p style={{ margin: 0, fontSize: fsMin(12), color: T.second, lineHeight: 1.45 }}>
            {maquinaAtual
              ? `O que já saiu (${jaSairam} de ${teto}) fica anotado na ${rotuloDaMaquina(maquinaAtual)}; o que for movido passa a contar na nova.`
              : "Esta peça entrou em impressão antes do controle por máquina. Diga em qual impressora ela está para poder informar as impressas."}
          </p>
          <div data-testid="acoes-da-troca" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {!isMobile && botaoManter}
            <button
              type="button"
              onClick={iniciarOuTrocar}
              disabled={!podeTrocar}
              data-testid="button-iniciar-impressao"
              aria-busy={startPrintingMutation.isPending || undefined}
              style={{ flex: isMobile ? "1 1 100%" : 2, minHeight: alvo, padding: "0 12px", backgroundColor: "#ffffff", border: `1.5px solid ${T.text}`, color: T.text, fontFamily: GROTESK, fontWeight: 700, fontSize: 13, borderRadius: R.md, cursor: podeTrocar ? "pointer" : "not-allowed", opacity: podeTrocar ? 1 : 0.55 }}
            >
              {startPrintingMutation.isPending ? (maquinaAtual ? "Movendo…" : "Confirmando…")
                : !maquinaAtual ? (maquinaEscolhida ? `Confirmar ${rotuloDaMaquina(maquinaEscolhida)}` : "Confirmar impressora")
                : !maquinaEscolhida ? "Mover"
                : moverTudo || restanteAqui <= 1 ? `Mover tudo para a ${rotuloDaMaquina(maquinaEscolhida)}`
                : `Mover ${movidas || "…"} para a ${rotuloDaMaquina(maquinaEscolhida)}`}
            </button>
            {isMobile && botaoManter}
          </div>
        </div>
      )}

      <div>
        {/* O campo pergunta o que saiu AGORA (dono, 21/09: "se tem 5 na
            impressora, como imprimo 10?"); o total é calculado e mostrado
            na linha viva. "Corrigir o total" abre o modo absoluto antigo. */}
        <label htmlFor="input-quantity-produced" style={rotulo(fsMin)}>{modoTotal ? "Total já impresso (corrigir)" : "Quantas saíram agora?"}</label>
        <div style={{ fontSize: fsMin(11), color: T.second, marginBottom: 10, lineHeight: 1.4 }} id="dica-quantidade-produzida">
          {modoTotal
            ? `Aqui você corrige o TOTAL que consta impresso (hoje ${jaSairam} de ${teto}). Para informar o que saiu agora, volte ao modo normal.`
            : naImpressora > 0
              ? `${naImpressora} ${naImpressora === 1 ? "está" : "estão"} na ${dividida ? rotuloDaMaquina(maquinaAtual) : "impressora"}. ${dividida ? "A peça vai para Impresso / Acabamento quando todas as partes saírem." : `A peça vai para Impresso / Acabamento quando chegar a ${teto}.`}`
              : "Todas já constam impressas — só falta mandar a peça para o acabamento."}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <input
            id="input-quantity-produced"
            type="number"
            inputMode="numeric"
            pattern="[0-9]*"
            enterKeyHint="done"
            min={modoTotal ? 1 : 0}
            max={modoTotal ? teto : naImpressora}
            value={modoTotal ? quantidadeTotal : agora}
            placeholder="0"
            onChange={(e) => {
              const v = e.target.value;
              if (modoTotal) setQuantidadeTotal(parseInt(v) || 0);
              else setAgora(v === "" ? "" : Math.max(0, parseInt(v) || 0));
            }}
            aria-describedby="dica-quantidade-produzida"
            data-testid="input-quantity-produced"
            style={{ flex: 1, minWidth: 0, minHeight: 56, boxSizing: "border-box", textAlign: "center", fontFamily: GROTESK, fontSize: 26, fontWeight: 700, color: T.text, backgroundColor: "#f4f3f0", border: "none", borderRadius: R.md, padding: "16px 12px" }}
          />
          <button
            type="button"
            onClick={() => { if (modoTotal) setQuantidadeTotal(teto); else setAgora(naImpressora); }}
            title={modoTotal ? `Total ${teto}` : `Todas as ${naImpressora} que estão na impressora`}
            data-testid="button-set-total"
            style={{ backgroundColor: "#e7e5e4", border: "none", borderRadius: R.md, padding: "0 20px", minHeight: 44, fontWeight: 700, fontSize: 14, color: "#44403c", cursor: "pointer", whiteSpace: "nowrap", transition: "background-color 0.15s" }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#d6d3d1")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#e7e5e4")}
          >
            Tudo
          </button>
        </div>
        {/* A linha viva faz a conta na frente do operador. */}
        {!modoTotal && !!maquinaAtual && (
          <div role="status" data-testid="linha-da-conta" style={{ fontSize: fsMin(12), fontWeight: 700, color: T.text, marginTop: 8, fontVariantNumeric: "tabular-nums" }}>
            {doAgora.linha}
          </div>
        )}
        {/* A explicação do botão desabilitado mora aqui, ao lado do campo —
            e não só na opacidade do botão. */}
        {!maquinaAtual ? (
          <div role="status" data-testid="aviso-quantidade" style={{ fontSize: fsMin(11), color: "#b45309", marginTop: 6 }}>
            Escolha a impressora antes de informar as impressas.
          </div>
        ) : frase.aviso && (
          <div role="status" data-testid="aviso-quantidade" style={{ fontSize: fsMin(11), color: frase.pode ? T.second : "#b45309", marginTop: 6 }}>
            {frase.aviso}
          </div>
        )}
        {!!maquinaAtual && jaSairam > 0 && (
          <button
            type="button"
            onClick={() => { setModoTotal((m) => !m); setQuantidadeTotal(jaSairam); setAgora(""); }}
            data-testid="button-corrigir-total"
            style={{ marginTop: 8, minHeight: isMobile ? 44 : 32, padding: "0 4px", border: "none", background: "transparent", color: T.accentText, fontSize: fsMin(12), fontWeight: 700, cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 3, borderRadius: R.sm }}
          >
            {modoTotal ? "Voltar a informar o que saiu agora" : "Corrigir o total já informado"}
          </button>
        )}
      </div>

      <div style={rodapeDoModal(padModal)}>
        {botaoCancelar}
        <button
          type="submit"
          disabled={!podeSalvar}
          data-testid="button-confirm-production"
          aria-busy={startProductionMutation.isPending || undefined}
          style={{ flex: 2, minHeight: alvo, padding: "0 12px", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: T.text, border: "none", color: "#ffffff", fontFamily: GROTESK, fontWeight: 700, fontSize: 14, cursor: podeSalvar ? "pointer" : "not-allowed", borderRadius: R.md, opacity: podeSalvar ? 1 : 0.6, transition: "background-color 0.15s" }}
          onMouseEnter={(e) => { if (podeSalvar) e.currentTarget.style.backgroundColor = "#000000"; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = T.text; }}
        >
          {startProductionMutation.isPending && <Loader2 aria-hidden="true" className="animate-spin" style={{ width: 14, height: 14 }} />}
          {startProductionMutation.isPending ? "Salvando…" : frase.rotulo}
        </button>
      </div>
    </form>
  );
}

// ─── O modal inteiro (aba Máquinas) ──────────────────────────────────────────
// A fila da Gráfica tem o próprio Dialog (compartilhado com conferir e
// entregar) e monta só o `FormularioDeImpressao` dentro dele. A aba Máquinas
// não tem esse Dialog, então recebe o modal completo daqui: mesma casca
// (`modal-shell`), mesmo cabeçalho, mesma ficha resumida da peça.
interface ModalProps {
  item: PecaParaImprimir | null;
  onFechar: () => void;
  /** Abre direto no painel de troca de impressora (ação "Trocar de máquina" do cartão). */
  abrirNaTroca?: boolean;
  /** Impressora já marcada (peça reservada na aba Máquinas). */
  maquinaInicial?: string | null;
  /** Peça dividida: de qual cartão o modal foi aberto. */
  maquinaEmQuestao?: string | null;
  /** Iniciar só uma parte da peça (ver FormularioProps). */
  parteAIniciar?: { quantidade: number; daReserva: boolean } | null;
  /** Impressoras ocupadas por outra peça → código dela (ver FormularioProps). */
  ocupadas?: Ocupadas;
}

export function ModalImpressao({ item, onFechar, abrirNaTroca = false, maquinaInicial = null, maquinaEmQuestao = null, parteAIniciar = null, ocupadas }: ModalProps) {
  const isMobile = useIsMobile();
  const padModal = isMobile ? 16 : 24;
  const mutacoes = useMutacoesDeImpressao({ onSucesso: onFechar });
  // Iniciando uma parte, o cabeçalho é o de "imprimir", mesmo com a peça já em impressão noutra máquina.
  const cab = parteAIniciar ? { title: "Imprimir parte da peça", subtitle: `${parteAIniciar.quantidade} un. — confirme a impressora e inicie` } : cabecalhoDoModalDeImpressao(item, abrirNaTroca);
  const fsMin = (n: number) => (isMobile ? Math.max(12, n) : n);
  // O teclado numérico de "Quantas saíram agora?" não pode esconder o botão
  // primário: o modal recentra e encolhe para a área visível (o mesmo gancho
  // dos modais da fila da Gráfica — ver area-visivel.ts).
  const superficieRef = useRef<HTMLDivElement>(null);
  useAcompanharAreaVisivel(superficieRef, "centro", isMobile && !!item);

  return (
    <Dialog open={!!item} onOpenChange={(open) => { if (!open) onFechar(); }}>
      <DialogContent ref={superficieRef} className={HIDE_NATIVE_CLOSE} style={modalSurface(468)} data-testid="modal-impressao">
        <DialogTitle className="sr-only">{cab.title}</DialogTitle>
        <DialogDescription className="sr-only">{cab.subtitle || "Informe a impressão desta peça"}</DialogDescription>
        <ModalHeader icon={Play} tint={T.text} title={cab.title} subtitle={cab.subtitle} onClose={onFechar} />
        {item && (
          <div style={{ padding: padModal, display: "flex", flexDirection: "column", gap: isMobile ? 16 : 20, overflowY: "auto", flex: "1 1 auto", minHeight: 0 }}>
            {/* Ficha resumida: qual peça o toque atingiu. */}
            <div style={{ backgroundColor: "#f4f3f0", borderRadius: R.lg, padding: 14, display: "flex", gap: 12, alignItems: "flex-start" }}>
              {item.approvalThumbUrl ? (
                <img
                  src={item.approvalThumbUrl}
                  alt=""
                  decoding="async"
                  style={{ width: 56, height: 56, objectFit: "cover", borderRadius: R.md, background: "#fff", border: `1px solid ${T.border}`, flexShrink: 0 }}
                  onError={(e) => { e.currentTarget.style.display = "none"; }}
                />
              ) : (
                <div aria-hidden="true" style={{ width: 40, height: 40, borderRadius: R.md, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Printer style={{ width: 18, height: 18, color: T.accentText }} />
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: GROTESK, fontWeight: 700, fontSize: isMobile ? 16 : 13, color: T.accentText }}>{item.displayId ?? "—"}</div>
                <div style={{ fontSize: FS.strong, fontWeight: 700, color: T.text }}>{item.type}</div>
                {item.description && item.description !== item.type && (
                  <div title={item.description} style={{ fontSize: FS.body, color: T.second, marginTop: 1, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflowWrap: "anywhere" }}>{item.description}</div>
                )}
                {item.event?.name && (
                  <div style={{ fontSize: FS.body, color: T.second, marginTop: 4, display: "flex", alignItems: "center", gap: 5 }}>
                    <Calendar aria-hidden="true" style={{ width: 11, height: 11, flexShrink: 0 }} />
                    {/* Nome do evento em até duas linhas (não corta em 390px). */}
                    <span style={{ minWidth: 0, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflowWrap: "anywhere" }}>{item.event.name}</span>
                  </div>
                )}
                <div style={{ fontSize: fsMin(11), color: "#57534e", marginTop: 6, fontVariantNumeric: "tabular-nums" }}>
                  {producedOf(item)} já impressa{producedOf(item) !== 1 ? "s" : ""} de {qtyOf(item)}
                  {reusedTotalOf(item) > 0 && ` · ${reusedTotalOf(item)} reaproveitada${reusedTotalOf(item) !== 1 ? "s" : ""}`}
                </div>
              </div>
            </div>
            <FormularioDeImpressao key={`${item.id}:${abrirNaTroca ? "troca" : "impressas"}:${maquinaInicial ?? ""}:${maquinaEmQuestao ?? ""}`} item={item} onFechar={onFechar} padModal={padModal} mutacoes={mutacoes} abrirNaTroca={abrirNaTroca} maquinaInicial={maquinaInicial} maquinaEmQuestao={maquinaEmQuestao} parteAIniciar={parteAIniciar} ocupadas={ocupadas} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
