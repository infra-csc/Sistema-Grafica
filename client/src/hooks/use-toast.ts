import * as React from "react"

import type {
  ToastActionElement,
  ToastProps,
} from "@/components/ui/toast"

// QUANTOS AVISOS CABEM DE UMA VEZ — 3, e o de AÇÃO não é o primeiro a sair.
//
// Era 1: o aviso novo apagava o anterior. Parece limpeza, mas o anterior
// podia ser o "Desfazer" (limpar nove filtros na Gestão de Prazos) ou o
// "Abrir evento" recém-criado — e qualquer "Salvo" que chegasse um segundo
// depois tirava o único caminho de volta da tela. Três empilhados é o teto em
// que a pilha ainda se lê de relance; acima disso sai primeiro o aviso MAIS
// ANTIGO SEM AÇÃO (confirmação já lida), e só se todos tiverem ação sai o mais
// antigo deles. O aviso novo nunca é o descartado — senão um erro sumiria
// antes de aparecer.
const TOAST_LIMIT = 3
const TOAST_REMOVE_DELAY = 1000000

/**
 * Mesmo título, mesma descrição e mesma ação (pelo rótulo): é o mesmo aviso
 * repetido, não um novo. Vale também para os de ação — dois "Filtros limpos ·
 * Desfazer" iguais na pilha não dizem qual desfaz o quê; fica só o mais novo,
 * que é o que corresponde ao estado atual da tela.
 */
function mesmoAviso(a: ToasterToast, b: ToasterToast) {
  // Só compara texto puro: ReactNode montado não tem igualdade confiável.
  const texto = (v: React.ReactNode) => (typeof v === "string" ? v : v == null ? "" : null)
  const acao = (t: ToasterToast) => {
    if (!t.action) return ""
    const props = (t.action as React.ReactElement<{ altText?: string; children?: React.ReactNode }>).props
    const rotulo = props?.altText || texto(props?.children)
    return rotulo ? rotulo : null
  }
  const [ta, tb, da, db, aa, ab] = [texto(a.title), texto(b.title), texto(a.description), texto(b.description), acao(a), acao(b)]
  return (
    a.variant === b.variant &&
    ta !== null && ta !== "" && ta === tb &&
    da !== null && da === db &&
    aa !== null && aa === ab
  )
}

/** A pilha depois de chegar `novo`: sem fechados, sem repetidos, no teto. */
function empilhar(novo: ToasterToast, atuais: ToasterToast[]): ToasterToast[] {
  // Fechados (open: false) ficam na memória até o REMOVE — não podem ocupar
  // vaga, senão um aviso já dispensado empurraria para fora um "Desfazer" vivo.
  // Repetido (o mesmo erro clicado três vezes) substitui em vez de empilhar:
  // três cópias iguais seriam poluição, não informação.
  const lista = [novo, ...atuais.filter((t) => t.open !== false && !mesmoAviso(t, novo))]
  while (lista.length > TOAST_LIMIT) {
    let sai = -1
    for (let i = lista.length - 1; i >= 1; i--) {
      if (!lista[i].action) { sai = i; break }
    }
    lista.splice(sai === -1 ? lista.length - 1 : sai, 1)
  }
  return lista
}

type ToasterToast = ToastProps & {
  id: string
  title?: React.ReactNode
  description?: React.ReactNode
  action?: ToastActionElement
}

const actionTypes = {
  ADD_TOAST: "ADD_TOAST",
  UPDATE_TOAST: "UPDATE_TOAST",
  DISMISS_TOAST: "DISMISS_TOAST",
  REMOVE_TOAST: "REMOVE_TOAST",
} as const

let count = 0

function genId() {
  count = (count + 1) % Number.MAX_SAFE_INTEGER
  return count.toString()
}

type ActionType = typeof actionTypes

type Action =
  | {
      type: ActionType["ADD_TOAST"]
      toast: ToasterToast
    }
  | {
      type: ActionType["UPDATE_TOAST"]
      toast: Partial<ToasterToast>
    }
  | {
      type: ActionType["DISMISS_TOAST"]
      toastId?: ToasterToast["id"]
    }
  | {
      type: ActionType["REMOVE_TOAST"]
      toastId?: ToasterToast["id"]
    }

interface State {
  toasts: ToasterToast[]
}

const toastTimeouts = new Map<string, ReturnType<typeof setTimeout>>()

const addToRemoveQueue = (toastId: string) => {
  if (toastTimeouts.has(toastId)) {
    return
  }

  const timeout = setTimeout(() => {
    toastTimeouts.delete(toastId)
    dispatch({
      type: "REMOVE_TOAST",
      toastId: toastId,
    })
  }, TOAST_REMOVE_DELAY)

  toastTimeouts.set(toastId, timeout)
}

export const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case "ADD_TOAST":
      return {
        ...state,
        toasts: empilhar(action.toast, state.toasts),
      }

    case "UPDATE_TOAST":
      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === action.toast.id ? { ...t, ...action.toast } : t
        ),
      }

    case "DISMISS_TOAST": {
      const { toastId } = action

      // ! Side effects ! - This could be extracted into a dismissToast() action,
      // but I'll keep it here for simplicity
      if (toastId) {
        addToRemoveQueue(toastId)
      } else {
        state.toasts.forEach((toast) => {
          addToRemoveQueue(toast.id)
        })
      }

      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === toastId || toastId === undefined
            ? {
                ...t,
                open: false,
              }
            : t
        ),
      }
    }
    case "REMOVE_TOAST":
      if (action.toastId === undefined) {
        return {
          ...state,
          toasts: [],
        }
      }
      return {
        ...state,
        toasts: state.toasts.filter((t) => t.id !== action.toastId),
      }
  }
}

const listeners: Array<(state: State) => void> = []

let memoryState: State = { toasts: [] }

function dispatch(action: Action) {
  memoryState = reducer(memoryState, action)
  listeners.forEach((listener) => {
    listener(memoryState)
  })
}

type Toast = Omit<ToasterToast, "id">

function toast({ ...props }: Toast) {
  const id = genId()

  const update = (props: ToasterToast) =>
    dispatch({
      type: "UPDATE_TOAST",
      toast: { ...props, id },
    })
  const dismiss = () => dispatch({ type: "DISMISS_TOAST", toastId: id })

  dispatch({
    type: "ADD_TOAST",
    toast: {
      ...props,
      id,
      open: true,
      onOpenChange: (open) => {
        if (!open) dismiss()
      },
    },
  })

  return {
    id: id,
    dismiss,
    update,
  }
}

function useToast() {
  const [state, setState] = React.useState<State>(memoryState)

  React.useEffect(() => {
    listeners.push(setState)
    return () => {
      const index = listeners.indexOf(setState)
      if (index > -1) {
        listeners.splice(index, 1)
      }
    }
  }, [state])

  return {
    ...state,
    toast,
    dismiss: (toastId?: string) => dispatch({ type: "DISMISS_TOAST", toastId }),
  }
}

export { useToast, toast }
