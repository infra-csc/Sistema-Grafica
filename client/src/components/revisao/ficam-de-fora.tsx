// "FICAM DE FORA" — o bloco das confirmações em lote que separa o que VAI do
// que NÃO VAI. Antes as duas coisas eram parágrafos cinza iguais, um embaixo
// do outro: quem confirmava 12 peças lia "12 saem…" e só depois, no mesmo tom,
// "3 ficam de fora". Agora o que fica tem caixa própria, com título.
import type { ReactNode } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { T, N, FS, R } from "@/lib/theme";
import { letra } from "./estilos";

export function FicamDeFora({ children }: { children: ReactNode }) {
  const celular = useIsMobile();
  return (
    <span
      data-testid="bloco-ficam-de-fora"
      style={{
        display: "flex", flexDirection: "column", gap: 6, marginTop: 12,
        padding: "10px 12px", borderRadius: R.md,
        backgroundColor: N.n2, border: `1px solid ${T.border}`,
        fontSize: FS.meta, lineHeight: 1.5, color: T.strong,
      }}
    >
      <span style={{ fontSize: letra(FS.micro, celular), fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: T.apoio }}>
        Ficam de fora
      </span>
      {children}
    </span>
  );
}

/** Uma linha do bloco: o `marginTop` dos avisos antigos sai — o gap cuida. */
export const LINHA_DE_FORA = { display: "block", margin: 0 } as const;
