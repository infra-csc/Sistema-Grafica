// ─────────────────────────────────────────────────────────────────────────────
// COPIAR UM TEXTO DA TELA (dono, 30/10: "botão de copiar na Gráfica, copiar a
// descrição da peça"). Um ícone pequeno ao lado do texto: o clique copia, vira
// um ✓ por um instante e o leitor de tela ouve "Copiado". Dentro de linha
// clicável ele NÃO abre a peça (stopPropagation).
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { R, T, TOM } from "@/lib/theme";

/** O navegador só libera a área de transferência em https/localhost; o resto cai no jeito antigo. */
async function copiarTexto(texto: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(texto);
      return true;
    }
  } catch { /* cai no jeito antigo */ }
  try {
    const campo = document.createElement("textarea");
    campo.value = texto;
    campo.setAttribute("readonly", "");
    campo.style.position = "fixed";
    campo.style.opacity = "0";
    document.body.appendChild(campo);
    campo.select();
    const ok = document.execCommand("copy");
    campo.remove();
    return ok;
  } catch {
    return false;
  }
}

export function BotaoCopiar({ texto, rotulo, tamanho = 24, testId }: {
  texto: string;
  /** O que está sendo copiado, para o title e o leitor de tela: "a descrição da peça #0012". */
  rotulo: string;
  /** Lado do alvo em px (o ícone é fixo). No dedo, passe 44. */
  tamanho?: number;
  testId?: string;
}) {
  const { toast } = useToast();
  const [copiou, setCopiou] = useState(false);
  const relogio = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (relogio.current) clearTimeout(relogio.current); }, []);
  const Icone = copiou ? Check : Copy;
  return (
    <button
      type="button"
      data-testid={testId}
      title={copiou ? "Copiado" : `Copiar ${rotulo}`}
      aria-label={copiou ? "Copiado" : `Copiar ${rotulo}`}
      onClick={async (e) => {
        e.stopPropagation();
        e.preventDefault();
        if (await copiarTexto(texto)) {
          setCopiou(true);
          if (relogio.current) clearTimeout(relogio.current);
          relogio.current = setTimeout(() => setCopiou(false), 1500);
        } else {
          toast({ title: "Não foi possível copiar", description: "O navegador bloqueou a área de transferência.", variant: "destructive" });
        }
      }}
      className="ds-botao"
      style={{
        width: tamanho, height: tamanho, flexShrink: 0, padding: 0,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        border: "none", borderRadius: R.sm, background: "transparent", cursor: "pointer",
        color: copiou ? TOM.sucesso.text : T.apoio,
      }}
    >
      <Icone aria-hidden="true" style={{ width: 13, height: 13 }} />
    </button>
  );
}
