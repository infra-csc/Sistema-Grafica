// Pill de status compartilhado — cores/rótulos vêm de lib/status.ts (fonte
// única). Substitui as cópias locais que existiam no Painel Geral e na Gráfica:
// mesma peça aparecia com pill diferente por tela.
//
// A FORMA agora vem do <Selo> (components/ui/selo.tsx) e a COR de status.ts.
// A divisão é essa e ela importa: quem sabe o raio, a altura e o peso da marca
// é o design system; quem sabe o que "Aguard. Finalização" significa e em que
// cor isso se lê é o mapa de status. Antes este arquivo redigitava os dois —
// e era assim que uma pílula ficava com 999 de raio numa tela e 99 noutra.
//
// - size "md" (padrão): 11px com bolinha — o formato do Painel Geral.
// - size "sm": 10px uppercase compacto — para tabelas densas (Gráfica).
//
// Carrega o significado do status do mesmo jeito que o StatusBadge (ver o
// comentário lá): `title` com a frase inteira, "vez de quem" para o leitor de
// tela e o balão ao tocar quando o pill não está dentro de uma linha clicável.
import { getStatusMeta, descricaoDoStatus } from "@/lib/status";
import { useBalaoDeStatus } from "@/components/ui/balao-de-status";
import { Selo } from "@/components/ui/selo";

interface StatusPillProps {
  status: string;
  size?: "sm" | "md";
  showDot?: boolean;
}

export function StatusPill({ status, size = "md", showDot = true }: StatusPillProps) {
  const cfg = getStatusMeta(status);
  const { guia, handlers, describedBy, balao } = useBalaoDeStatus(status);
  // A pílula só mostra o rótulo CURTO; o title devolve o nome inteiro do
  // status (e o que ele significa) a quem precisa confirmar ("Aguard." de quê?).
  return (
    <Selo
      cores={cfg}
      tamanho={size}
      ponto={showDot}
      title={descricaoDoStatus(status) ?? cfg.label}
      aria-describedby={describedBy}
      {...handlers}
    >
      {/* O rótulo curto fica para os olhos; o leitor de tela ouve o nome
          inteiro — "Pronto Prod." não é palavra que se pronuncie. */}
      <span aria-hidden="true">{cfg.short}</span>
      <span className="sr-only">{cfg.label}{guia ? ` (${guia.vez})` : ""}</span>
      {balao}
    </Selo>
  );
}
