import { FileSearch } from "lucide-react";
import { TOM } from "@/lib/theme";

/**
 * Selo da auditoria do book (dono, 19/10) — cartão e linha, ao lado do selo de
 * solicitações. Conta as peças desenhadas no book que não estão na lista (ou
 * estão canceladas no app) e ninguém marcou ainda. Não é botão: mora dentro do
 * link do cartão (âncora não contém botão); o painel abre pela faixa no topo.
 */
export function SeloDoBook({ n, eventId }: { n: number; eventId: string }) {
  if (n <= 0) return null;
  const frase = `${n} ${n === 1 ? "peça desenhada no book não está" : "peças desenhadas no book não estão"} na lista ativa (sem cadastro ou cancelada)`;
  return (
    <span
      data-testid={`selo-book-${eventId}`}
      title={`${frase} — veja na faixa "Book" no topo da tela`}
      aria-label={frase}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 800, color: TOM.alerta.text, backgroundColor: TOM.alerta.bg, border: `1px solid ${TOM.alerta.border}`, borderRadius: 999, padding: '2px 8px', whiteSpace: 'nowrap', flexShrink: 0 }}
    >
      <FileSearch style={{ width: 11, height: 11 }} aria-hidden="true" />
      {n} fora da lista
    </span>
  );
}
