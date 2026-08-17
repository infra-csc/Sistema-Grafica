"use client"

import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"

const Dialog = DialogPrimitive.Root

const DialogTrigger = DialogPrimitive.Trigger

const DialogPortal = DialogPrimitive.Portal

const DialogClose = DialogPrimitive.Close

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

// ─────────────────────────────────────────────────────────────────────────────
// A REDE DE SEGURANÇA DE ALTURA (`max-h-[calc(100vh-48px)] overflow-y-auto`).
//
// O Radix centra o Content com `top: 50%` + `translateY(-50%)`. Um Content sem
// teto de altura cresce com o conteúdo, e o que passa da viewport é cortado
// METADE EM CIMA E METADE EMBAIXO ao mesmo tempo — some o título junto com o
// botão de confirmar, e não há como rolar até eles. Foi o defeito que custou o
// cadastro de patrocinador (1047px de modal numa janela de 445: 301px perdidos
// de cada lado).
//
// A CONTA é a mesma da casa: `100vh − 48` = viewport menos 24px de respiro em
// cima e 24 embaixo, simétrico porque o modal é centrado.
//
// POR QUE ISTO NÃO ATROPELA NINGUÉM — as duas objeções, respondidas:
//
//  (a) "quem tem `overflow: hidden` inline continua recortando, porque inline
//      vence classe". Verdade, e é justamente o que torna esta rede inofensiva:
//      todo modal desenhado da casa traz `maxHeight` E `overflow` INLINE (via
//      `modalSurface` ou escritos à mão), então para eles esta classe não existe
//      — nem o teto nem o overflow. A rede só alcança um DialogContent que não
//      declara nem teto nem overflow, isto é, exatamente aquele que hoje não
//      tem proteção alguma. Quem declara pela className também vence: o `cn`
//      usa tailwind-merge, e `max-h-[92vh]` e `overflow-hidden` do consumidor
//      apagam os desta base (conferido).
//
//  (b) "sem coluna flex, cabeçalho e rodapé passariam a rolar junto". Verdade —
//      e é o certo AQUI. O layout base é um `grid` com `p-6`: `DialogHeader` e
//      `DialogFooter` são blocos no fluxo normal, não itens presos às bordas.
//      Rolar o diálogo inteiro é o comportamento correto desse layout; quem
//      quer cabeçalho e rodapé parados usa `modalSurface`, que traz o teto, a
//      coluna flex e o corpo como scrollport único. O X nativo (`absolute`)
//      rola junto nesse caso — Esc e clique no overlay continuam fechando, e
//      nenhum modal do app depende desta rede: todos têm teto próprio.
// ─────────────────────────────────────────────────────────────────────────────
const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg max-h-[calc(100vh-48px)] overflow-y-auto",
        className
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
        <X className="h-4 w-4" />
        <span className="sr-only">Fechar</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
))
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-1.5 text-center sm:text-left",
      className
    )}
    {...props}
  />
)
DialogHeader.displayName = "DialogHeader"

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
      className
    )}
    {...props}
  />
)
DialogFooter.displayName = "DialogFooter"

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "text-lg font-semibold leading-none tracking-tight",
      className
    )}
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}
