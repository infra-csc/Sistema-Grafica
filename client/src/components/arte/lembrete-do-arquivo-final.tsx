import { AlertTriangle } from "lucide-react";
import { TOM, FS, FW } from "@/lib/theme";

/**
 * O QUE CONFERIR ANTES DE MANDAR O ARQUIVO FINAL (dono, 24/09).
 *
 * O arquivo final é o que a Gráfica imprime: um erro de medida, de cor ou de
 * resolução só aparece quando a lona já saiu da máquina. O dono pediu um
 * lembrete VISÍVEL, em vermelho, em todo lugar em que a Arte envia ou TROCA o
 * arquivo final — um componente só, para os lugares não divergirem.
 *
 * É LEMBRETE, NÃO CHECKLIST: nada aqui é clicável nem trava o envio (pedido do
 * dono). Por isso é uma lista (`<ul>`) dentro de uma nota (`role="note"`), sem
 * caixa de marcar — caixinha que não bloqueia nada ensinaria a ignorar caixas.
 *
 * Cor: o tom de PERIGO do design system (fundo 50, borda 200, texto 700),
 * AA sobre o próprio fundo. O ícone é decorativo (aria-hidden); o texto já diz
 * tudo. Fonte ≥ 12px em toda largura — no celular a lista quebra linha, nunca
 * corta.
 */
export const ITENS_DO_LEMBRETE_DO_ARQUIVO_FINAL = [
  "Medida do arquivo (inclusive área visual)",
  "Se o arquivo está em CMYK",
  "Resolução do arquivo e dos logos",
  "Layout confere com o thumb/book aprovado",
] as const;

export function LembreteDoArquivoFinal({ testId = "lembrete-arquivo-final" }: { testId?: string }) {
  return (
    <div
      role="note"
      aria-labelledby={`${testId}-titulo`}
      data-testid={testId}
      style={{
        display: "flex", alignItems: "flex-start", gap: 10,
        padding: "10px 12px", borderRadius: 10,
        background: TOM.perigo.bg, border: `1px solid ${TOM.perigo.border}`,
        color: TOM.perigo.text,
      }}
    >
      <AlertTriangle aria-hidden="true" style={{ width: 18, height: 18, flexShrink: 0, marginTop: 1, color: TOM.perigo.text }} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <p id={`${testId}-titulo`} style={{ margin: 0, fontSize: FS.body, fontWeight: FW.rotulo, color: TOM.perigo.text, lineHeight: 1.4 }}>
          Lembre-se de conferir:
        </p>
        <ul style={{ margin: "4px 0 0", paddingLeft: 18, display: "flex", flexDirection: "column", gap: 1, listStyle: "disc" }}>
          {ITENS_DO_LEMBRETE_DO_ARQUIVO_FINAL.map((item) => (
            <li key={item} style={{ fontSize: FS.meta, fontWeight: FW.medio, color: TOM.perigo.text, lineHeight: 1.4, overflowWrap: "anywhere" }}>
              {item}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
