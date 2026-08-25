// Casca compartilhada dos modais.
//
// Antes cada modal montava o próprio cabeçalho: só a tela de vincular
// patrocinadores tinha sete, com raios 12/12/14/12/16, títulos em 14, 16, 18 e
// 20, e cinco paddings diferentes — abrir dois modais seguidos parecia usar
// dois produtos. O cabeçalho escuro com ladrilho de ícone aparecia copiado em
// cinco arquivos.
//
// São dois tipos, e a escolha é pela função e não pelo gosto:
//
//  - `work`  — modal de trabalho (escolher peças, aplicar em lote, revisar
//    antes de enviar). Cabeçalho escuro com ícone, porque a barra ancora uma
//    tela densa e separa claramente o "onde estou" do conteúdo.
//  - `confirm` — confirmação curta, uma pergunta e dois botões. Cabeçalho
//    claro: pintar de escuro um diálogo de três linhas dá peso que o conteúdo
//    não tem.
import { useRef } from "react";
import type { LucideIcon } from "lucide-react";
import { X } from "lucide-react";
import { R, SHADOW } from "@/lib/theme";

// ─────────────────────────────────────────────────────────────────────────────
// FreezeWhileClosing — o miolo do modal para de renderizar assim que ele começa
// a sair.
//
// O MECANISMO DO LAÇO (errar aqui já custou duas correções, então vai escrito).
//
// 1. Toda primitiva do Radix compõe a própria ref com a ref recebida usando
//    `useComposedRefs(forwardedRef, (node) => setNode(node))`. Aquela arrow é
//    criada de novo A CADA RENDER, e `useComposedRefs` é um `useCallback` cujas
//    dependências são as próprias refs — então a ref composta MUDA DE
//    IDENTIDADE a cada render. Para o React, ref nova = desanexar a antiga
//    (`ref(null)`) e anexar a nova (`ref(node)`) NO COMMIT.
//    Medido (server/__tests__/modal-congelado.test.ts): 5 re-renders do pai
//    custam 5 desanexos + 5 anexos por primitiva — Checkbox, gatilho de Popover
//    e gatilho de Tooltip, todos iguais. Um `<input>` nativo custa ZERO.
//
// 2. Cada um desses desanexa/anexa chama `setState` DENTRO da fase de commit
//    (`setNode(null)` e depois `setNode(node)` — é o `usePresence` do Radix que
//    aparece no topo do stack do React #185, via `safelyDetachRef` →
//    `composeRefs` → `setRef`). Isso normalmente é inofensivo: o valor volta a
//    ser o mesmo e o React desiste do re-render.
//
// 3. O que NÃO é inofensivo é fazer isso com a subárvore MORRENDO. Quando o
//    Dialog fecha, o Presence do Radix segura o conteúdo montado durante a
//    animação de saída (~200ms). Se a página re-renderizar nessa janela, cada
//    render manda mais uma rodada de desanexa/anexa para dentro de um
//    conteúdo que está sendo desmontado — e o contador de updates aninhados do
//    React (limite 50) estoura: "Maximum update depth exceeded".
//
// 4. É por isso que CANCELAR já estava curado e SALVAR não. Cancelar é UM
//    render (`setOpen(false)` e nada mais). Salvar dispara quatro ou mais
//    dentro da mesma janela de 200ms: `isPending` voltando a false, o
//    `useToast` (que assina a página inteira, não só o Toaster), o timer de
//    entrada do toast e a chegada do refetch do `invalidateQueries`.
//
// A CURA é tirar a subárvore da rota de render enquanto ela morre. Devolvendo
// o MESMO objeto de elemento que foi montado no último render aberto, o React
// compara `prevChildren === nextChildren`, desiste da subárvore inteira e não
// mexe em ref nenhuma — não importa quantas vezes a página re-renderize.
//
// Isto não é ajuste de tempo: nada foi adiado. O toast aparece na hora, a
// lista invalida na hora, a animação de saída roda igual. O que muda é que o
// conteúdo que está saindo vira inerte, que é o que ele deveria ser — ninguém
// pode interagir com um modal em fade-out.
// ─────────────────────────────────────────────────────────────────────────────
export function FreezeWhileClosing({
  open,
  children,
}: {
  open: boolean;
  children: React.ReactNode;
}) {
  const ultimoAberto = useRef<React.ReactNode>(children);
  if (open) ultimoAberto.current = children;
  return <>{open ? children : ultimoAberto.current}</>;
}

/**
 * O DialogContent base (ui/dialog.tsx) renderiza um X próprio no canto
 * superior direito. Modais que usam ModalHeader (que TEM X próprio via
 * `onClose`) ficavam com DOIS botões de fechar sobrepostos. Passe esta
 * constante no className do DialogContent para esconder o X nativo.
 * Só use junto com ModalHeader — dialogs sem ele dependem do X nativo.
 */
export const HIDE_NATIVE_CLOSE = "[&>button:last-child]:hidden";

/** Raio e sombra de qualquer modal do app. R.xl é o degrau de "modal". */
export const MODAL_RADIUS = R.xl;
export const MODAL_SHADOW = "0 32px 64px -16px rgba(0,0,0,0.28), 0 0 0 1px rgba(0,0,0,0.05)";

/**
 * Estilo pronto para o `style` do DialogContent.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * O TETO DE ALTURA MORA AQUI, e não em cada modal. Por quê, e a conta.
 *
 * Esta casca vive em ~20 DialogContent e até hoje devolvia `overflow: hidden`
 * SEM teto de altura nenhum: cada tela dependia do próprio conteúdo ser curto.
 * Quando não era, o modal crescia com o conteúdo, e como o Radix centra o
 * Content com `top: 50%` + `translateY(-50%)`, o que passava da viewport era
 * cortado METADE EM CIMA E METADE EMBAIXO AO MESMO TEMPO — sumiam o título e o
 * botão de confirmar juntos. Pior: o `overflow: hidden` daqui impedia qualquer
 * rolagem, e mesmo onde havia rolagem interna ela NUNCA ligava, porque sem teto
 * nada nunca "não coube". Medido em Chrome real no cadastro de patrocinador:
 * 1047px de modal numa janela de 445 de altura, 301px perdidos de cada lado.
 *
 * A CONTA é `100vh − 48`: a viewport inteira menos 24px de respiro em cima e
 * 24 embaixo. O desconto é simétrico porque o modal é centrado.
 *
 * NÃO se desconta cabeçalho e rodapé por número fixo. Eles são itens flex que
 * não rolam (`flexShrink: 0` em `ModalHeader` e `ModalFooter`), o navegador os
 * mede sozinho, e o corpo — com `flex: 1 1 auto; minHeight: 0` — fica com
 * exatamente o que sobrar. Um número fixo não serve para todas as telas: em 375
 * de largura o título quebra em duas linhas e o cabeçalho engorda de 93 para
 * ~130px. A Gestão de Prazos já tinha abandonado o desconto fixo por isso.
 *
 * O QUE CADA CONSUMIDOR PRECISA FAZER: o bloco do meio (o corpo) tem que ser
 * `overflowY: "auto", flex: "1 1 auto", minHeight: 0`, e todo elo entre o
 * DialogContent e ele precisa ser coluna flex com `minHeight: 0`. Sem
 * `minHeight: 0` o tamanho mínimo automático do item flex é o conteúdo dele: o
 * corpo se recusa a encolher e volta a empurrar o rodapé para fora da tela.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function modalSurface(maxWidth: number): React.CSSProperties {
  return {
    // min(): o número pedido OU a tela menos a folga — um modal de 468px não
    // pode encostar nas bordas de um aparelho de 390.
    maxWidth: `min(${maxWidth}px, calc(100vw - 16px))`,
    width: "96vw",
    // dvh: o 100vh clássico inclui a barra recolhível do navegador do celular
    // — o rodapé do modal (onde vive o Confirmar) ficava atrás dela. O vh
    // fica como fallback de navegador antigo; onde dvh existe, a linha
    // seguinte vence.
    maxHeight: "calc(100vh - 48px)",
    ...(typeof CSS !== "undefined" && CSS.supports?.("height: 100dvh")
      ? { maxHeight: "calc(100dvh - 24px)" }
      : {}),
    display: "flex",
    flexDirection: "column",
    padding: 0,
    borderRadius: MODAL_RADIUS,
    border: "none",
    backgroundColor: "#fff",
    boxShadow: MODAL_SHADOW,
    overflow: "hidden",
  };
}

interface ModalHeaderProps {
  icon?: LucideIcon;
  title: string;
  subtitle?: string;
  variant?: "work" | "confirm";
  /** Cor do ladrilho do ícone. Só vale no variante `work`. */
  tint?: string;
  onClose?: () => void;
  /** Conteúdo extra à direita (contadores, ações). */
  trailing?: React.ReactNode;
}

export function ModalHeader({
  icon: Icon,
  title,
  subtitle,
  variant = "work",
  tint = "#6d28d9",
  onClose,
  trailing,
}: ModalHeaderProps) {
  const dark = variant === "work";

  return (
    <div
      style={{
        // `flexShrink: 0`: com o teto de altura no `modalSurface`, o Content é
        // uma coluna flex — e sem isto o cabeçalho seria espremido junto com o
        // corpo numa janela baixa, em vez de o corpo rolar.
        display: "flex", alignItems: "center", gap: 14, flexShrink: 0,
        padding: dark ? "22px 28px" : "22px 24px 16px",
        background: dark
          ? "linear-gradient(135deg, #1c1917 0%, #2d2926 100%)"
          : "#fff",
        borderBottom: dark ? "1px solid rgba(255,255,255,0.06)" : "1px solid #ebe8e4",
      }}
    >
      {Icon && (
        <div
          style={{
            width: dark ? 40 : 34, height: dark ? 40 : 34,
            borderRadius: R.md, flexShrink: 0,
            backgroundColor: dark ? tint : `${tint}14`,
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: dark ? "0 0 0 1px rgba(255,255,255,0.12) inset" : "none",
          }}
        >
          <Icon style={{ width: dark ? 18 : 16, height: dark ? 18 : 16, color: dark ? "#fff" : tint }} />
        </div>
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        <h2
          style={{
            margin: 0, lineHeight: 1.25,
            fontSize: dark ? 20 : 15,
            fontWeight: 800,
            letterSpacing: "-0.03em",
            color: dark ? "#fff" : "#1c1917",
          }}
        >
          {title}
        </h2>
        {subtitle && (
          <p
            style={{
              margin: "3px 0 0", fontSize: 13, lineHeight: 1.5,
              // rgba(255,255,255,0.72) sobre o gradiente escuro passa AA; o
              // 0.6 que estava em uso ficava em 3.9:1.
              color: dark ? "rgba(255,255,255,0.72)" : "#746e69",
            }}
          >
            {subtitle}
          </p>
        )}
      </div>

      {trailing}

      {onClose && (
        <button
          onClick={onClose}
          aria-label="Fechar"
          style={{
            width: dark ? 40 : 34, height: dark ? 40 : 34, borderRadius: R.pill, flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
            backgroundColor: dark ? "rgba(255,255,255,0.08)" : "#f5f5f4",
            border: dark ? "1px solid rgba(255,255,255,0.12)" : "1px solid #ebe8e4",
            color: dark ? "rgba(255,255,255,0.7)" : "#57534e",
          }}
        >
          <X style={{ width: 16, height: 16 }} />
        </button>
      )}
    </div>
  );
}

/** Rodapé de modal: ação primária cheia, secundária discreta abaixo. */
export function ModalFooter({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        // `flexShrink: 0` pelo mesmo motivo do cabeçalho: o rodapé carrega a
        // ação primária e não pode encolher nem rolar para fora da tela.
        display: "flex", flexDirection: "column", gap: 8, flexShrink: 0,
        padding: "16px 24px",
        borderTop: "1px solid #ebe8e4",
        backgroundColor: "#fff",
      }}
    >
      {children}
    </div>
  );
}

export { SHADOW };
