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
import type { LucideIcon } from "lucide-react";
import { X } from "lucide-react";
import { R, SHADOW } from "@/lib/theme";

/** Raio e sombra de qualquer modal do app. R.xl é o degrau de "modal". */
export const MODAL_RADIUS = R.xl;
export const MODAL_SHADOW = "0 32px 64px -16px rgba(0,0,0,0.28), 0 0 0 1px rgba(0,0,0,0.05)";

/** Estilo pronto para o `style` do DialogContent. */
export function modalSurface(maxWidth: number): React.CSSProperties {
  return {
    maxWidth,
    width: "96vw",
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
        display: "flex", alignItems: "center", gap: 14,
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
        display: "flex", flexDirection: "column", gap: 8,
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
