import { cloneElement, isValidElement, useEffect, useState } from "react"
import { useToast } from "@/hooks/use-toast"
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react"
import { R, T } from "@/lib/theme"

// A AÇÃO DE VOLTA — 36px, e não os 32 do shadcn.
//
// A régua da casa é 36 no ponteiro. Um toast vive 4,2 segundos: o alvo da
// única ação de recuperação da tela é justamente onde não cabe economizar
// pixel. O botão de fechar ao lado também subiu de 24 pelo mesmo motivo.
//
// `T.border` vem de `lib/theme` e não do `TI` da Gestão de Prazos: é a mesma
// cor (#e8e8e7), mas este componente é global e não pode depender dos tokens
// de uma tela.
const ESTILO_ACAO: React.CSSProperties = {
  height: 36, padding: "0 12px", borderRadius: R.md,
  border: `1px solid ${T.border}`, backgroundColor: "#ffffff",
  fontSize: 12, fontWeight: 700, color: "#1c1917",
  cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
}

type ToastItem = {
  id: string
  title?: React.ReactNode
  description?: React.ReactNode
  variant?: "default" | "destructive"
  open?: boolean
  /**
   * O botão de recuperação: "Desfazer", "Abrir evento", "Mostrar".
   *
   * O tipo existia no hook (`action?: ToastActionElement`) e TRÊS telas o
   * preenchem — mas este componente, que é o único Toaster montado no app,
   * nunca leu o campo. As três ações eram descartadas em silêncio.
   */
  action?: React.ReactNode
}

function NorteToast({ toast, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
  const [visible, setVisible] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const isError = toast.variant === "destructive"

  useEffect(() => {
    const show = setTimeout(() => setVisible(true), 10)
    const hide = setTimeout(() => dismiss(), 4200)
    return () => { clearTimeout(show); clearTimeout(hide) }
  }, [])

  function dismiss() {
    setLeaving(true)
    setTimeout(onDismiss, 320)
  }

  // O elemento chega como <ToastAction>, que é `ToastPrimitives.Action` do
  // Radix. Testei fora de um `Toast.Root`: ele NÃO quebra — vira um <button>
  // comum e o onClick continua funcionando. O que ele traz de errado é a
  // roupa do shadcn (h-8, text-sm, rounded-md), então clonamos aplicando
  // `style`, que vence classe utilitária sem precisar de !important.
  const acao = isValidElement<{ style?: React.CSSProperties }>(toast.action) ? toast.action : null

  const accent = isError ? "#dc2626" : "#16a34a"
  const iconBg  = isError ? "#fef2f2" : "#f0fdf4"
  const Icon    = isError ? AlertCircle : CheckCircle2

  return (
    <div
      onClick={dismiss}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        width: 360,
        maxWidth: "calc(100vw - 32px)",
        backgroundColor: "#ffffff",
        borderRadius: 14,
        padding: "14px 16px",
        boxShadow: "0 4px 24px rgba(0,0,0,0.10), 0 1px 4px rgba(0,0,0,0.06)",
        border: "1px solid #f0efec",
        cursor: "pointer",
        position: "relative",
        overflow: "hidden",
        transition: "opacity 0.28s ease, transform 0.28s cubic-bezier(0.34,1.2,0.64,1)",
        opacity: visible && !leaving ? 1 : 0,
        transform: visible && !leaving ? "translateY(0) scale(1)" : "translateY(16px) scale(0.97)",
      }}
    >
      {/* Left accent bar */}
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, borderRadius: "14px 0 0 14px", backgroundColor: accent }} />

      {/* Icon */}
      <div style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: iconBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginLeft: 4 }}>
        <Icon style={{ width: 18, height: 18, color: accent }} />
      </div>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0, paddingTop: 1 }}>
        {toast.title && (
          <div style={{ fontSize: 13, fontWeight: 700, color: "#1c1917", lineHeight: 1.3, marginBottom: toast.description ? 3 : 0 }}>
            {toast.title}
          </div>
        )}
        {toast.description && (
          <div style={{ fontSize: 12, color: "#746e69", lineHeight: 1.45, maxHeight: 80, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical" }}>
            {toast.description}
          </div>
        )}
      </div>

      {/* Ação — antes do fechar, porque é o caminho de VOLTA e o fechar é o
          caminho de saída. O card inteiro tem `onClick={dismiss}`, então sem
          o `stopPropagation` o clique na ação fecharia o toast pelo caminho
          do card. Depois de agir, fechamos de propósito: a oferta foi aceita.

          O wrapper cola no botão (sem padding próprio) para que clicar "ao
          lado" não conte como aceitar a ação. */}
      {acao && (
        <div
          onClick={e => { e.stopPropagation(); dismiss() }}
          style={{ display: "flex", alignItems: "center", alignSelf: "center", flexShrink: 0 }}
        >
          {cloneElement(acao, { style: ESTILO_ACAO })}
        </div>
      )}

      {/* Close */}
      <button
        aria-label="Fechar aviso"
        onClick={e => { e.stopPropagation(); dismiss() }}
        // 36x36: eram 24, que passa no mínimo AA da WCAG 2.5.8 mas fica
        // abaixo da régua de 36 que o resto do app segue. O glifo continua
        // com 13px — cresceu o ALVO, não o desenho.
        style={{ width: 36, height: 36, borderRadius: 8, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#746e69", flexShrink: 0, marginTop: -4, marginRight: -6 }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#f5f4f0"; (e.currentTarget as HTMLButtonElement).style.color = "#57534e" }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"; (e.currentTarget as HTMLButtonElement).style.color = "#746e69" }}
      >
        <X style={{ width: 13, height: 13 }} />
      </button>

      {/* Progress bar */}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 2, backgroundColor: "#f0efec" }}>
        <div style={{
          height: "100%",
          backgroundColor: accent,
          width: visible && !leaving ? "0%" : "100%",
          transition: visible && !leaving ? "width 4.2s linear" : "none",
          opacity: 0.5,
        }} />
      </div>
    </div>
  )
}

export function Toaster() {
  const { toasts, dismiss } = useToast()
  const [items, setItems] = useState<ToastItem[]>([])

  useEffect(() => {
    const open = toasts.filter(t => t.open !== false)
    // Normalize variant: the hook type allows null but ToastItem only allows undefined.
    setItems(open.map(t => ({ ...t, variant: t.variant ?? undefined })))
  }, [toasts])

  if (items.length === 0) return null

  return (
    <div style={{
      position: "fixed",
      bottom: 20,
      right: 20,
      zIndex: 99999,
      display: "flex",
      flexDirection: "column",
      gap: 10,
      alignItems: "flex-end",
      pointerEvents: "none",
    }}>
      {items.map(toast => (
        <div key={toast.id} style={{ pointerEvents: "auto" }}>
          <NorteToast toast={toast} onDismiss={() => dismiss(toast.id)} />
        </div>
      ))}
    </div>
  )
}
