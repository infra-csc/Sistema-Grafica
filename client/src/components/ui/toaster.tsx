import { cloneElement, isValidElement, useEffect, useRef, useState } from "react"
import { useToast } from "@/hooks/use-toast"
import { CheckCircle2, AlertCircle, AlertTriangle, X } from "lucide-react"
import { R, T, TOM } from "@/lib/theme"

// A AÇÃO DE VOLTA — 36px, e não os 32 do shadcn.
//
// A régua da casa é 36 no ponteiro. Um toast vive poucos segundos: o alvo da
// única ação de recuperação da tela é justamente onde não cabe economizar
// pixel. O botão de fechar ao lado também subiu de 24 pelo mesmo motivo.
//
// `T.border` vem de `lib/theme` e não do `TI` da Gestão de Prazos: é a mesma
// cor, mas este componente é global e não pode depender dos tokens de uma tela.
const ESTILO_ACAO: React.CSSProperties = {
  height: 36, padding: "0 12px", borderRadius: R.md,
  border: `1px solid ${T.border}`, backgroundColor: "#ffffff",
  fontSize: 12, fontWeight: 700, color: "#1c1917",
  cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
}

// QUANTO TEMPO O AVISO FICA.
//
// Eram 4,2s para tudo. Sucesso cabe nisso — é confirmação, o olho só precisa
// passar. ERRO não: ele costuma trazer a instrução do servidor ("recarregue a
// página", "a peça já foi conferida por Fulano"), duas linhas que a pessoa
// ainda estava lendo quando o toast sumia. E toast com AÇÃO ("Desfazer") é
// uma oferta: cortá-la cedo é tirar o caminho de volta.
const DURACAO_OK = 4200
const DURACAO_ERRO = 8000
const DURACAO_COM_ACAO = 7000

export type VarianteDeAviso = "default" | "success" | "warning" | "destructive"

// ─── OS QUATRO TONS DO AVISO ────────────────────────────────────────────────
// `default` e `success` são o mesmo desenho de propósito: `default` era o
// visual de "deu certo" desde sempre (check verde), e ~250 chamadas contam com
// isso. `success` é o nome novo para a mesma coisa, para que quem escreve o
// código diga o que quer dizer em vez de contar com o padrão.
//
// `warning` é o degrau que faltava: a ação não aconteceu, mas nada quebrou.
// Antes ele era escrito como `destructive` — e um "selecione ao menos uma
// peça" em vermelho-erro, cem vezes por dia, ensina o olho a descartar o
// vermelho. Quando o erro de verdade chega, ele já não é notícia.
//
// Cores da paleta P de status.ts, via TOM: o tom ESCURO no ícone e na barra
// (é o que carrega significado sobre fundo claro) e o tom claro no ladrilho.
const TONS: Record<VarianteDeAviso, { accent: string; iconBg: string; Icon: typeof CheckCircle2; testid: string; urgente: boolean }> = {
  default:     { accent: TOM.sucesso.text, iconBg: TOM.sucesso.bg, Icon: CheckCircle2,  testid: "toast",       urgente: false },
  success:     { accent: TOM.sucesso.text, iconBg: TOM.sucesso.bg, Icon: CheckCircle2,  testid: "toast",       urgente: false },
  warning:     { accent: TOM.alerta.text,  iconBg: TOM.alerta.bg,  Icon: AlertTriangle, testid: "toast-aviso", urgente: false },
  destructive: { accent: TOM.perigo.text,  iconBg: TOM.perigo.bg,  Icon: AlertCircle,   testid: "toast-erro",  urgente: true  },
}

type ToastItem = {
  id: string
  title?: React.ReactNode
  description?: React.ReactNode
  variant?: VarianteDeAviso
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

/** O texto legível de um ReactNode (string, número, fragmentos, elementos). */
function textoDe(no: React.ReactNode): string {
  if (no == null || typeof no === "boolean") return ""
  if (typeof no === "string" || typeof no === "number") return String(no)
  if (Array.isArray(no)) return no.map(textoDe).join("")
  if (isValidElement<{ children?: React.ReactNode }>(no)) return textoDe(no.props.children)
  return ""
}

/** A frase que o leitor de tela ouve: título, descrição e, se houver, a saída (F8). */
function fraseDoAviso(t: ToastItem): string {
  const partes = [textoDe(t.title), textoDe(t.description)].map(s => s.trim()).filter(Boolean)
  if (isValidElement<{ altText?: string; children?: React.ReactNode }>(t.action)) {
    const rotulo = t.action.props.altText || textoDe(t.action.props.children)
    if (rotulo) partes.push(`Ação disponível: ${rotulo}. F8 leva até o aviso.`)
  }
  return partes.map(p => (/[.!?…:]$/.test(p) ? p : `${p}.`)).join(" ")
}

function NorteToast({ toast, onDismiss, devolverFoco }: { toast: ToastItem; onDismiss: () => void; devolverFoco: () => void }) {
  const cartao = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const tom = TONS[toast.variant ?? "default"] ?? TONS.default
  const isError = toast.variant === "destructive"
  const acao = isValidElement<{ style?: React.CSSProperties }>(toast.action) ? toast.action : null
  // Aviso fica tanto quanto erro: ele também traz a INSTRUÇÃO ("escolha ao
  // menos uma peça"), e é a instrução que a pessoa ainda estava lendo quando o
  // cartão de 4,2s sumia.
  const duracao = isError || toast.variant === "warning" ? DURACAO_ERRO : acao ? DURACAO_COM_ACAO : DURACAO_OK

  // PAUSA SOB O PONTEIRO/FOCO. O relógio vive em refs (não em estado) de
  // propósito: este Toaster é montado junto dos testes de "modal congelado",
  // que contam renders — pausar não pode custar um render por hover.
  const restante = useRef(duracao)
  const inicio = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const barra = useRef<HTMLDivElement>(null)

  function armar() {
    if (timer.current) clearTimeout(timer.current)
    inicio.current = Date.now()
    timer.current = setTimeout(() => dismiss(), restante.current)
    if (barra.current) barra.current.style.animationPlayState = "running"
  }
  function pausar() {
    if (!timer.current) return
    clearTimeout(timer.current)
    timer.current = null
    restante.current = Math.max(600, restante.current - (Date.now() - inicio.current))
    if (barra.current) barra.current.style.animationPlayState = "paused"
  }

  useEffect(() => {
    const show = setTimeout(() => setVisible(true), 10)
    armar()
    return () => { clearTimeout(show); if (timer.current) clearTimeout(timer.current) }
  }, [])

  function dismiss() {
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
    // Quem chegou pelo teclado (F8) e acionou "Desfazer" ou fechou não pode
    // ficar com o foco no <body> quando o cartão sumir: volta para onde estava.
    if (cartao.current?.contains(document.activeElement)) devolverFoco()
    setLeaving(true)
    setTimeout(onDismiss, 320)
  }

  // O elemento chega como <ToastAction>, que é `ToastPrimitives.Action` do
  // Radix. Testei fora de um `Toast.Root`: ele NÃO quebra — vira um <button>
  // comum e o onClick continua funcionando. O que ele traz de errado é a
  // roupa do shadcn (h-8, text-sm, rounded-md), então clonamos aplicando
  // `style`, que vence classe utilitária sem precisar de !important.

  // O acento também pinta o ÍCONE, que é o sinal de "deu certo/deu errado":
  // por isso ele é o tom ESCURO da paleta (#15803d, #b45309, #b91c1c) e não o
  // saturado — #16a34a e #dc2626 ficavam abaixo de 4,5:1 no ladrilho claro.
  const { accent, iconBg, Icon } = tom

  return (
    <div
      ref={cartao}
      // O ANÚNCIO não mora mais aqui, e sim nas regiões vivas fixas do
      // <Toaster> (ver o `anuncio` lá embaixo). Um role="status" que já NASCE com
      // o texto é justamente o caso que os leitores de tela costumam ignorar —
      // a região precisa existir antes do conteúdo mudar. Com a pilha de três,
      // manter o role aqui também faria cada aviso ser lido duas vezes.
      data-testid={tom.testid}
      onClick={dismiss}
      onMouseEnter={pausar}
      onMouseLeave={armar}
      onFocusCapture={pausar}
      onBlurCapture={armar}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        width: 360,
        maxWidth: "calc(100vw - 32px)",
        boxSizing: "border-box",
        backgroundColor: "#ffffff",
        borderRadius: 12,
        padding: "14px 16px",
        // Uma sombra só, e mais curta: o toast flutua, mas não precisa de
        // halo duplo para parecer que flutua.
        boxShadow: "0 8px 24px rgba(28,25,23,0.12)",
        border: "1px solid #e7e5e4",
        cursor: "pointer",
        position: "relative",
        overflow: "hidden",
        transition: "opacity 0.24s ease, transform 0.24s cubic-bezier(0.2,0.8,0.2,1)",
        opacity: visible && !leaving ? 1 : 0,
        transform: visible && !leaving ? "translateY(0)" : "translateY(12px)",
      }}
    >
      {/* Left accent bar */}
      <div aria-hidden="true" style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, backgroundColor: accent }} />

      {/* Icon */}
      <div aria-hidden="true" style={{ width: 32, height: 32, borderRadius: 9, backgroundColor: iconBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginLeft: 2 }}>
        <Icon style={{ width: 17, height: 17, color: accent }} />
      </div>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0, paddingTop: 1 }}>
        {toast.title && (
          <div style={{ fontSize: 13, fontWeight: 700, color: "#1c1917", lineHeight: 1.3, marginBottom: toast.description ? 3 : 0 }}>
            {toast.title}
          </div>
        )}
        {toast.description && (
          // #57534e (e não #746e69): a descrição do erro é a instrução, não
          // um metadado — merece o tom de leitura.
          <div style={{ fontSize: 12, color: "#57534e", lineHeight: 1.45, maxHeight: 88, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 5, WebkitBoxOrient: "vertical" }}>
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
          data-acao-do-aviso=""
          onClick={e => { e.stopPropagation(); dismiss() }}
          style={{ display: "flex", alignItems: "center", alignSelf: "center", flexShrink: 0 }}
        >
          {cloneElement(acao, { style: ESTILO_ACAO })}
        </div>
      )}

      {/* Close */}
      <button
        type="button"
        aria-label="Fechar aviso"
        onClick={e => { e.stopPropagation(); dismiss() }}
        // 36x36: eram 24, que passa no mínimo AA da WCAG 2.5.8 mas fica
        // abaixo da régua de 36 que o resto do app segue. O glifo continua
        // com 13px — cresceu o ALVO, não o desenho.
        style={{ width: 36, height: 36, borderRadius: 8, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#746e69", flexShrink: 0, marginTop: -4, marginRight: -6 }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#f5f4f0"; (e.currentTarget as HTMLButtonElement).style.color = "#57534e" }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"; (e.currentTarget as HTMLButtonElement).style.color = "#746e69" }}
      >
        <X aria-hidden="true" style={{ width: 13, height: 13 }} />
      </button>

      {/* Barra de tempo — ANIMAÇÃO (não transição) para poder pausar junto
          com o relógio via animation-play-state, sem render. Com
          prefers-reduced-motion a regra global zera a duração: a barra some
          de uma vez, e o toast continua respeitando o tempo. */}
      <div aria-hidden="true" style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 2, backgroundColor: "#f0efec" }}>
        <div
          ref={barra}
          style={{
            height: "100%",
            width: "100%",
            transformOrigin: "left center",
            backgroundColor: accent,
            opacity: 0.45,
            animation: `norte-toast-tempo ${duracao}ms linear forwards`,
          }}
        />
      </div>
    </div>
  )
}

export function Toaster() {
  const { toasts, dismiss } = useToast()
  const [items, setItems] = useState<ToastItem[]>([])
  const [anuncio, setAnuncio] = useState<{ id: string; texto: string; urgente: boolean } | null>(null)
  const anunciado = useRef<string | null>(null)
  const regiao = useRef<HTMLDivElement>(null)
  const focoAnterior = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const open = toasts.filter(t => t.open !== false)
    // Normalize variant: the hook type allows null but ToastItem only allows undefined.
    const normalizados = open.map(t => ({ ...t, variant: t.variant ?? undefined }))
    setItems(normalizados)
    // Só o aviso NOVO é anunciado (o topo da pilha); fechar um não reanuncia
    // os que ficaram.
    const novo = normalizados[0]
    if (novo && novo.id !== anunciado.current) {
      anunciado.current = novo.id
      // Só ERRO interrompe a leitura (aria-live assertive). Aviso e sucesso
      // esperam a vez: interromper o leitor de tela a cada "selecione uma
      // peça" é o equivalente sonoro de pintar tudo de vermelho.
      setAnuncio({ id: novo.id, texto: fraseDoAviso(novo), urgente: (TONS[novo.variant ?? "default"] ?? TONS.default).urgente })
    }
  }, [toasts])

  // F8 LEVA ATÉ O AVISO — o atalho que o Toaster do Radix tinha e que se
  // perdeu quando o da casa o substituiu. Sem ele, quem usa teclado ouvia
  // "Desfazer disponível" e não tinha como chegar lá: o cartão fica no fim do
  // DOM, depois da página inteira. Foca a ação do aviso mais novo (ou o
  // fechar), o que também PAUSA o relógio dele.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "F8" || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return
      // A AÇÃO primeiro, mesmo que um aviso sem ação tenha chegado depois:
      // é ela que precisa de caminho pelo teclado. Sem ação, o fechar.
      const alvo = regiao.current?.querySelector<HTMLElement>("[data-acao-do-aviso] button, [data-acao-do-aviso] a")
        ?? regiao.current?.querySelector<HTMLElement>("button[aria-label='Fechar aviso']")
      if (!alvo) return
      e.preventDefault()
      if (!regiao.current?.contains(document.activeElement)) {
        focoAnterior.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      }
      alvo.focus()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const devolverFoco = () => {
    const destino = focoAnterior.current
    focoAnterior.current = null
    if (destino && document.contains(destino)) destino.focus()
  }

  // Regiões vivas FIXAS, montadas desde o início: é a condição para o leitor
  // de tela anunciar o que entra nelas. Erro interrompe (assertive); o resto
  // espera a vez (polite). A `key` troca o nó a cada aviso, então o mesmo
  // texto repetido também é lido.
  return (
    <>
      <div className="sr-only" aria-live="polite" aria-atomic="true" data-testid="anuncio-dos-avisos">
        {anuncio && !anuncio.urgente && <p key={anuncio.id}>{anuncio.texto}</p>}
      </div>
      <div className="sr-only" aria-live="assertive" aria-atomic="true">
        {anuncio && anuncio.urgente && <p key={anuncio.id}>{anuncio.texto}</p>}
      </div>
      {items.length > 0 && (
        <div
          ref={regiao}
          // Região nomeada: quem navega por landmarks encontra os avisos.
          role="region"
          aria-label="Avisos (F8)"
          style={{
            position: "fixed",
            // 16 e não 20: a 390px o cartão (360, limitado a 100vw − 32)
            // encostava a 12px da borda esquerda. E a área segura do iPhone
            // não pode esconder a ação embaixo da barra de gestos.
            bottom: "calc(16px + env(safe-area-inset-bottom, 0px))",
            right: 16,
            zIndex: 99999,
            display: "flex",
            // PILHA DE ATÉ TRÊS (ver TOAST_LIMIT). O mais novo entra EM CIMA
            // e os de baixo não se mexem: quem já levava o ponteiro até o
            // "Desfazer" não vê o alvo fugir quando chega outro aviso.
            flexDirection: "column",
            gap: 8,
            alignItems: "flex-end",
            pointerEvents: "none",
          }}
        >
          {items.map(toast => (
            <div key={toast.id} style={{ pointerEvents: "auto" }}>
              <NorteToast toast={toast} onDismiss={() => dismiss(toast.id)} devolverFoco={devolverFoco} />
            </div>
          ))}
        </div>
      )}
    </>
  )
}
