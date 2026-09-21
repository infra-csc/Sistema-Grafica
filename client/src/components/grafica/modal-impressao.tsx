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
import { Loader2, Play, Printer, Calendar } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { HIDE_NATIVE_CLOSE, ModalHeader, modalSurface } from "@/components/modal-shell";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { avaliarProducao, tetoDeProducao, ehConflitoDeProducao } from "@/lib/grafica-producao";
import { isInProd, producedOf, qtyOf, reusedTotalOf, remainingProduce, type SaldoItem } from "@/lib/saldo";
import { MAQUINAS_DE_IMPRESSAO, rotuloDaMaquina } from "@shared/fluxo-peca";
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
  const startPrintingMutation = useMutation({
    mutationFn: async ({ itemId, printMachine }: { itemId: string; printMachine: string; displayId?: string | null; trocando?: boolean }) =>
      await apiRequest("PATCH", `/api/items/${itemId}/start-printing`, { printMachine }),
    onSuccess: (_r, vars) => {
      invalidarTudo();
      onSucesso?.();
      const cod = vars.displayId ? ` · ${vars.displayId}` : "";
      toast(vars.trocando
        ? { title: `Movida para a ${rotuloDaMaquina(vars.printMachine)}${cod}`, description: "O que já saiu fica anotado na máquina anterior." }
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
export function cabecalhoDoModalDeImpressao(item: PecaParaImprimir | null | undefined): { title: string; subtitle: string } {
  if (!item) return { title: "Imprimir peça", subtitle: "" };
  if (isInProd(item)) {
    const hora = horaDeInicio(item.productionStartedAt);
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
}

/**
 * O formulário em si. Monte com `key={item.id}`: o estado (máquina escolhida,
 * quantidade) nasce da peça e NÃO é sincronizado por efeito — trocar a peça
 * troca a chave, e o React remonta limpo.
 */
export function FormularioDeImpressao({ item, onFechar, padModal, mutacoes }: FormularioProps) {
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const fsMin = (n: number) => (isMobile ? Math.max(12, n) : n);
  const { startProductionMutation, startPrintingMutation } = mutacoes;
  const emImpressao = isInProd(item);
  const maquinaAtual = item.printMachine ?? "";

  // Antes de iniciar, começa vazia (obriga a escolha). Em impressão, é a da
  // peça — e só muda dentro do painel "Trocar de máquina".
  const [maquinaEscolhida, setMaquinaEscolhida] = useState<string>(emImpressao ? maquinaAtual : "");
  const [trocando, setTrocando] = useState(false);
  // Pré-preenche com o que JÁ SAIU da máquina, não com o total (dono, 14/09):
  // a impressão é registrada aos poucos, e com o TOTAL pré-preenchido um toque
  // distraído concluía uma peça com 10 de 40 impressas. "Tudo" continua a um toque.
  const [quantidade, setQuantidade] = useState<number>(producedOf(item));
  // Enter SEGURADO no teclado numérico dispara vários submits antes de o React
  // redesenhar o botão desabilitado. A trava por ref vale na hora.
  const envioRef = useRef(false);

  const teto = tetoDeProducao(item);
  const jaSairam = producedOf(item);
  const alvo = isMobile ? 48 : 44;

  const iniciarOuTrocar = () => {
    if (!maquinaEscolhida || startPrintingMutation.isPending) return;
    startPrintingMutation.mutate({ itemId: item.id, printMachine: maquinaEscolhida, displayId: item.displayId, trocando: emImpressao });
  };

  const salvarImpressas = (e: React.FormEvent) => {
    e.preventDefault();
    if (envioRef.current || startProductionMutation.isPending) return;
    if (!maquinaAtual) {
      toast({ title: "Escolha a máquina", description: "Diga em qual máquina a peça foi impressa antes de informar as impressas.", variant: "destructive" });
      return;
    }
    // O campo grava o TOTAL produzido (contrato ABSOLUTO do servidor).
    // `avaliarProducao` valida o teto, monta o lock otimista e diz quando a
    // gravação REDUZ o registro — caso em que a pergunta cita os dois números.
    const av = avaliarProducao(item, quantidade, maquinaAtual);
    if (!av.ok || !av.payload) {
      toast({ title: "Quantidade inválida", description: av.erro, variant: "destructive" });
      return;
    }
    if (av.precisaConfirmar && !window.confirm(av.confirmacao)) return;
    envioRef.current = true;
    startProductionMutation.mutate(
      { itemId: item.id, data: av.payload, displayId: item.displayId },
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
  const frase = fraseDoBotaoDeImpressas(quantidade, jaSairam, teto);
  const podeSalvar = frase.pode && !startProductionMutation.isPending;
  const podeTrocar = !!maquinaEscolhida && maquinaEscolhida !== maquinaAtual && !startPrintingMutation.isPending;
  const naImpressora = Math.max(0, teto - jaSairam);

  return (
    <form onSubmit={salvarImpressas} data-testid="form-impressao" data-etapa="impressas" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Onde a peça está, com hora — e o link discreto para trocar. */}
      <div data-testid="onde-esta" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", padding: "10px 12px", borderRadius: R.md, background: "#fff7ed", border: "1px solid #fed7aa" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0, fontSize: fsMin(13), color: "#9a3412", fontWeight: 700 }}>
          <Printer aria-hidden="true" style={{ width: 14, height: 14, flexShrink: 0 }} />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
            Em impressão na {rotuloDaMaquina(maquinaAtual)}{hora ? ` · desde ${hora}` : ""}
            <span style={{ display: "block", fontSize: fsMin(11), fontWeight: 600, color: "#9a3412", opacity: 0.9, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>
              {progressoDaImpressao(jaSairam, teto)}
            </span>
          </span>
        </span>
        {!trocando && (
          <button
            type="button"
            onClick={() => { setTrocando(true); setMaquinaEscolhida(""); }}
            data-testid="button-trocar-maquina"
            style={{ minHeight: isMobile ? 44 : 32, padding: "0 8px", border: "none", background: "transparent", color: T.accentText, fontSize: fsMin(12), fontWeight: 700, cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 3, borderRadius: R.sm }}
          >
            Trocar de máquina
          </button>
        )}
      </div>

      {trocando && (
        <div data-testid="painel-troca" style={{ display: "flex", flexDirection: "column", gap: 12, padding: 12, borderRadius: R.lg, border: `1px solid ${T.border}`, background: T.bg }}>
          {seletorDeMaquina(maquinaAtual)}
          <p style={{ margin: 0, fontSize: fsMin(12), color: T.second, lineHeight: 1.45 }}>
            O que já saiu ({jaSairam} de {teto}) fica anotado na {rotuloDaMaquina(maquinaAtual)}; o restante passa a contar na nova.
          </p>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              type="button"
              onClick={() => { setTrocando(false); setMaquinaEscolhida(maquinaAtual); }}
              style={{ flex: 1, minHeight: alvo, padding: "0 12px", backgroundColor: "transparent", border: `1px solid ${T.border}`, color: "#57534e", fontWeight: 700, fontSize: 13, cursor: "pointer", borderRadius: R.md }}
            >
              Manter na {rotuloDaMaquina(maquinaAtual)}
            </button>
            <button
              type="button"
              onClick={iniciarOuTrocar}
              disabled={!podeTrocar}
              data-testid="button-iniciar-impressao"
              aria-busy={startPrintingMutation.isPending || undefined}
              style={{ flex: 2, minHeight: alvo, padding: "0 12px", backgroundColor: "#ffffff", border: `1.5px solid ${T.text}`, color: T.text, fontFamily: GROTESK, fontWeight: 700, fontSize: 13, borderRadius: R.md, cursor: podeTrocar ? "pointer" : "not-allowed", opacity: podeTrocar ? 1 : 0.55 }}
            >
              {startPrintingMutation.isPending ? "Movendo…" : maquinaEscolhida ? `Mover para a ${rotuloDaMaquina(maquinaEscolhida)}` : "Mover"}
            </button>
          </div>
        </div>
      )}

      <div>
        {/* O campo é ABSOLUTO (o TOTAL até agora) ao lado de vizinhos
            incrementais: o rótulo diz o contrato e a dica repete a conta
            com o número real. */}
        <label htmlFor="input-quantity-produced" style={rotulo(fsMin)}>Quantas já saíram da máquina</label>
        <div style={{ fontSize: fsMin(11), color: T.second, marginBottom: 10, lineHeight: 1.4 }} id="dica-quantidade-produzida">
          {jaSairam > 0
            ? `Já saíram ${jaSairam} de ${teto} e ${naImpressora} ainda ${naImpressora === 1 ? "está" : "estão"} na impressora. Informe o TOTAL até agora (as que já estavam + as novas), não só as de hoje. A peça vai para Impresso / Acabamento quando chegar a ${teto}.`
            : `Informe quantas unidades já terminaram de imprimir. A peça vai para Impresso / Acabamento quando chegar a ${teto}.`}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <input
            id="input-quantity-produced"
            type="number"
            inputMode="numeric"
            pattern="[0-9]*"
            enterKeyHint="done"
            min={1}
            max={teto}
            value={quantidade}
            onChange={(e) => setQuantidade(parseInt(e.target.value) || 0)}
            required
            aria-required="true"
            aria-describedby="dica-quantidade-produzida"
            data-testid="input-quantity-produced"
            style={{ flex: 1, minWidth: 0, minHeight: 56, boxSizing: "border-box", textAlign: "center", fontFamily: GROTESK, fontSize: 26, fontWeight: 700, color: T.text, backgroundColor: "#f4f3f0", border: "none", borderRadius: R.md, padding: "16px 12px" }}
          />
          <button
            type="button"
            onClick={() => setQuantidade(teto)}
            data-testid="button-set-total"
            style={{ backgroundColor: "#e7e5e4", border: "none", borderRadius: R.md, padding: "0 20px", minHeight: 44, fontWeight: 700, fontSize: 14, color: "#44403c", cursor: "pointer", whiteSpace: "nowrap", transition: "background-color 0.15s" }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#d6d3d1")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#e7e5e4")}
          >
            Tudo
          </button>
        </div>
        {/* A explicação do botão desabilitado mora aqui, ao lado do campo —
            e não só na opacidade do botão. */}
        {frase.aviso && (
          <div role="status" data-testid="aviso-quantidade" style={{ fontSize: fsMin(11), color: frase.pode ? T.second : "#b45309", marginTop: 6 }}>
            {frase.aviso}
          </div>
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
}

export function ModalImpressao({ item, onFechar }: ModalProps) {
  const isMobile = useIsMobile();
  const padModal = isMobile ? 16 : 24;
  const mutacoes = useMutacoesDeImpressao({ onSucesso: onFechar });
  const cab = cabecalhoDoModalDeImpressao(item);
  const fsMin = (n: number) => (isMobile ? Math.max(12, n) : n);

  return (
    <Dialog open={!!item} onOpenChange={(open) => { if (!open) onFechar(); }}>
      <DialogContent className={HIDE_NATIVE_CLOSE} style={modalSurface(468)} data-testid="modal-impressao">
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
                  <div style={{ fontSize: FS.body, color: T.second, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.description}</div>
                )}
                {item.event?.name && (
                  <div style={{ fontSize: FS.body, color: T.second, marginTop: 4, display: "flex", alignItems: "center", gap: 5 }}>
                    <Calendar aria-hidden="true" style={{ width: 11, height: 11, flexShrink: 0 }} />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.event.name}</span>
                  </div>
                )}
                <div style={{ fontSize: fsMin(11), color: "#57534e", marginTop: 6, fontVariantNumeric: "tabular-nums" }}>
                  {producedOf(item)} já impressa{producedOf(item) !== 1 ? "s" : ""} de {qtyOf(item)}
                  {reusedTotalOf(item) > 0 && ` · ${reusedTotalOf(item)} reaproveitada${reusedTotalOf(item) !== 1 ? "s" : ""}`}
                </div>
              </div>
            </div>
            <FormularioDeImpressao key={item.id} item={item} onFechar={onFechar} padModal={padModal} mutacoes={mutacoes} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
