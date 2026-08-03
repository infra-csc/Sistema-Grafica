import { useEffect, useState } from "react"
import { useToast } from "@/hooks/use-toast"
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react"

type ToastItem = {
  id: string
  title?: React.ReactNode
  description?: React.ReactNode
  variant?: "default" | "destructive"
  open?: boolean
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
          <div style={{ fontSize: 12, color: "#78716c", lineHeight: 1.45, maxHeight: 80, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical" }}>
            {toast.description}
          </div>
        )}
      </div>

      {/* Close */}
      <button
        onClick={e => { e.stopPropagation(); dismiss() }}
        style={{ width: 24, height: 24, borderRadius: 6, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#a8a29e", flexShrink: 0, marginTop: 1 }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#f5f4f0"; (e.currentTarget as HTMLButtonElement).style.color = "#57534e" }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"; (e.currentTarget as HTMLButtonElement).style.color = "#a8a29e" }}
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
    setItems(open)
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
