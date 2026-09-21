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
import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2, Play, Printer, Calendar, ArrowLeftRight } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { HIDE_NATIVE_CLOSE, ModalHeader, modalSurface } from "@/components/modal-shell";
import { useAcompanharAreaVisivel } from "@/components/grafica/area-visivel";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { avaliarProducao, tetoDeProducao, ehConflitoDeProducao } from "@/lib/grafica-producao";
import { isInProd, producedOf, qtyOf, reusedTotalOf, remainingProduce, type SaldoItem } from "@/lib/saldo";
import { MAQUINAS_DE_IMPRESSAO, rotuloDaMaquina } from "@shared/fluxo-peca";
import { partesDaPeca, estaDividida, resumoDaDivisao } from "@shared/impressao-dividida";
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

// ─── As frases (puras — a linha, o cartão, a aba Máquinas e o modal leem daqui) ─
/**
 * "3 de 10 impressas · 7 na impressora" — quantas já foram para o acabamento e
 * quantas ainda estão na máquina. Com zero: "nenhuma saiu ainda · 10 na impressora".
 */
export function progressoDaImpressao(impressas: number, teto: number): string {
  const naImpressora = Math.max(0, teto - impressas);
  const inicio = impressas <= 0 ? "nenhuma saiu ainda" : `${impressas} de ${teto} impressa${impressas === 1 ? "" : "s"}`;
  return `${inicio} · ${naImpressora} na impressora`;
}

/**
 * O rótulo curto do botão da linha/cartão: "Impressas" enquanto falta,
 * "Mandar p/ acabamento" quando o que falta é zero (a peça só espera o gesto).
 */
export function rotuloCurtoDaAcao(impressas: number, teto: number): string {
  return impressas >= teto && teto > 0 ? "Mandar p/ acabamento" : "Impressas";
}

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

// ─── As mutations ─────────────────────────────────────────────────────────────
// Invalidam a fila (`/api/items/approved`), o acervo e a aba Máquinas — quem
// registra numa tela vê a outra atualizada ao voltar, sem depender do socket.
const CHAVES_A_INVALIDAR = ["/api/items/approved", "/api/items", "/api/grafica/maquinas"];
const invalidarTudo = () => { for (const k of CHAVES_A_INVALIDAR) queryClient.invalidateQueries({ queryKey: [k] }); };

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
    mutationFn: async ({ itemId, printMachine, quantidade, deMaquina }: { itemId: string; printMachine: string; displayId?: string | null; trocando?: boolean; quantidade?: number | null; deMaquina?: string | null; ficam?: number }) =>
      await apiRequest("PATCH", `/api/items/${itemId}/start-printing`, { printMachine, ...(quantidade != null ? { quantidade } : {}), ...(deMaquina ? { deMaquina } : {}) }),
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
    onError: (error: Error, vars) => toast({
      title: vars.trocando ? "Não foi possível trocar de máquina" : "Não foi possível iniciar a impressão",
      description: mensagemDeErroDaApi(error),
      variant: "destructive",
    }),
  });

  return { startProductionMutation, startPrintingMutation };
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
}

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
export function FormularioDeImpressao({ item, onFechar, padModal, mutacoes, abrirNaTroca = false, maquinaInicial = null, maquinaEmQuestao = null }: FormularioProps) {
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const fsMin = (n: number) => (isMobile ? Math.max(12, n) : n);
  const { startProductionMutation, startPrintingMutation } = mutacoes;
  const emImpressao = isInProd(item);
  // Peça dividida: a "máquina atual" é a do cartão que abriu o modal, e os
  // números (já saíram / teto) são os da parte dela.
  const partes = partesDaPeca(item);
  const dividida = estaDividida(item);
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

  const iniciarOuTrocar = () => {
    if (!maquinaEscolhida || startPrintingMutation.isPending) return;
    const trocando = emImpressao && !!maquinaAtual;
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
      payload = { quantityProduced: producedOf(item) - jaSairam + total, expectedProduced: producedOf(item), printMachine: maquinaAtual, maquina: maquinaAtual, impressasNaMaquina: total };
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
          return (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={ativa}
              disabled={ehAtual}
              title={ehAtual ? "A peça já está nesta impressora" : undefined}
              onClick={() => setMaquinaEscolhida(m)}
              data-testid={`maquina-${m}`}
              style={{ minHeight: 48, padding: "6px 8px", borderRadius: R.md, cursor: ehAtual ? "not-allowed" : "pointer", fontFamily: GROTESK, fontSize: 13, fontWeight: 800, lineHeight: 1.2, backgroundColor: ativa ? T.text : "#f4f3f0", color: ativa ? "#ffffff" : T.text, border: ativa ? `2px solid ${T.text}` : "2px solid transparent", opacity: ehAtual ? 0.45 : 1, transition: "background-color 0.12s" }}
            >
              {rotuloDaMaquina(m)}
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
    const pode = !!maquinaEscolhida && !startPrintingMutation.isPending;
    return (
      <div data-testid="form-impressao" data-etapa="iniciar" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {seletorDeMaquina(null)}
        <p style={{ margin: 0, fontSize: fsMin(12), color: T.second, lineHeight: 1.45 }}>
          {jaSairam > 0
            ? `Já saíram ${jaSairam} de ${teto}. Ao iniciar, a peça volta para "Em Impressão" e você informa o restante conforme sair.`
            : `Ao iniciar, a peça fica "Em Impressão". Faltam ${remainingProduce(item)} un. — você informa quantas saíram conforme a máquina terminar.`}
        </p>
        <div style={rodapeDoModal(padModal)}>
          {botaoCancelar}
          <button
            type="button"
            onClick={iniciarOuTrocar}
            disabled={!pode}
            data-testid="button-iniciar-impressao"
            aria-busy={startPrintingMutation.isPending || undefined}
            style={{ flex: 2, minHeight: alvo, padding: "0 12px", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: T.text, border: "none", color: "#ffffff", fontFamily: GROTESK, fontWeight: 700, fontSize: 14, borderRadius: R.md, cursor: pode ? "pointer" : "not-allowed", opacity: pode ? 1 : 0.55, transition: "background-color 0.15s" }}
            onMouseEnter={(e) => { if (pode) e.currentTarget.style.backgroundColor = "#000000"; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = T.text; }}
          >
            {startPrintingMutation.isPending && <Loader2 aria-hidden="true" className="animate-spin" style={{ width: 14, height: 14 }} />}
            {startPrintingMutation.isPending ? "Iniciando…" : maquinaEscolhida ? `Iniciar impressão na ${rotuloDaMaquina(maquinaEscolhida)}` : "Iniciar impressão"}
          </button>
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
  const podeTrocar = !!maquinaEscolhida && maquinaEscolhida !== maquinaAtual && !startPrintingMutation.isPending && qtdMoverValida;
  const naImpressora = restanteAqui;
  const movidas = moverTudo ? restanteAqui : (qtdMover === "" ? 0 : qtdMover);

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
          <div style={{ display: "flex", gap: 10 }}>
            {!!maquinaAtual && <button
              type="button"
              onClick={() => { setTrocando(false); setMaquinaEscolhida(maquinaAtual); }}
              style={{ flex: 1, minHeight: alvo, padding: "0 12px", backgroundColor: "transparent", border: `1px solid ${T.border}`, color: "#57534e", fontWeight: 700, fontSize: 13, cursor: "pointer", borderRadius: R.md }}
            >
              Manter na {rotuloDaMaquina(maquinaAtual)}
            </button>}
            <button
              type="button"
              onClick={iniciarOuTrocar}
              disabled={!podeTrocar}
              data-testid="button-iniciar-impressao"
              aria-busy={startPrintingMutation.isPending || undefined}
              style={{ flex: 2, minHeight: alvo, padding: "0 12px", backgroundColor: "#ffffff", border: `1.5px solid ${T.text}`, color: T.text, fontFamily: GROTESK, fontWeight: 700, fontSize: 13, borderRadius: R.md, cursor: podeTrocar ? "pointer" : "not-allowed", opacity: podeTrocar ? 1 : 0.55 }}
            >
              {startPrintingMutation.isPending ? (maquinaAtual ? "Movendo…" : "Confirmando…")
                : !maquinaAtual ? (maquinaEscolhida ? `Confirmar ${rotuloDaMaquina(maquinaEscolhida)}` : "Confirmar impressora")
                : !maquinaEscolhida ? "Mover"
                : moverTudo || restanteAqui <= 1 ? `Mover tudo para a ${rotuloDaMaquina(maquinaEscolhida)}`
                : `Mover ${movidas || "…"} para a ${rotuloDaMaquina(maquinaEscolhida)}`}
            </button>
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
}

export function ModalImpressao({ item, onFechar, abrirNaTroca = false, maquinaInicial = null, maquinaEmQuestao = null }: ModalProps) {
  const isMobile = useIsMobile();
  const padModal = isMobile ? 16 : 24;
  const mutacoes = useMutacoesDeImpressao({ onSucesso: onFechar });
  const cab = cabecalhoDoModalDeImpressao(item, abrirNaTroca);
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
            <FormularioDeImpressao key={`${item.id}:${abrirNaTroca ? "troca" : "impressas"}:${maquinaInicial ?? ""}:${maquinaEmQuestao ?? ""}`} item={item} onFechar={onFechar} padModal={padModal} mutacoes={mutacoes} abrirNaTroca={abrirNaTroca} maquinaInicial={maquinaInicial} maquinaEmQuestao={maquinaEmQuestao} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
