import { useState, type CSSProperties } from "react";
import { getApprovalMeta, getApprovalTitle, type ApprovalMeta, type ApprovalStatus } from "@/lib/status";
import { Check, Clock } from "lucide-react";

interface Sponsor {
  id: string;
  name: string;
  color?: string | null;
  /**
   * Status da aprovação deste patrocinador para a peça, quando disponível.
   *
   * Chega CRU do servidor (`enrichItemsWithEventsAndSponsors` repassa
   * `approval.status` sem traduzir), então inclui os valores que só o servidor
   * grava — `awaiting_arte` na reprovação e `new_version_pending` no reenvio.
   * O union antigo tinha só approved|rejected|pending e mentia sobre o
   * contrato: os dois estados de reprovação caíam em estilo nulo.
   *
   * `(string & {})` de propósito: um valor novo no banco não pode quebrar o
   * build de quem passa o campo cru, mas também não pode passar despercebido —
   * cai no visual "desconhecido" (cinza + valor cru no tooltip) de
   * `getApprovalMeta`, nunca na cor da marca.
   */
  approvalStatus?: ApprovalStatus | (string & {}) | null;
}

// Rótulo só para leitor de tela. O chip mostra o NOME do patrocinador; o
// estado vive na cor, na bolinha e no tooltip — nada disso chega a quem usa
// leitor de tela. Fora de fluxo (position:absolute), então não desloca nada.
const SR_ONLY: React.CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0,0,0,0)",
  whiteSpace: "nowrap",
  border: 0,
};

interface SponsorChipsProps {
  sponsors: Sponsor[];
  max?: number;
  variant?: "orange" | "gray" | "plain" | "dark" | "colored";
  size?: "xs" | "sm" | "md";
  emptyText?: string;
  /**
   * QUEM ESTÁ TRAVANDO. Na fila "Aguardando patrocinador" da Arte o dado
   * acionável é DE QUEM se espera — e a cor por estado, sozinha, deixava os
   * vinculados parecidos. Com esta prop: pendente ganha relógio e peso 700;
   * aprovado recua (peso 500, opacidade 0,6, check verde); reprovado segue
   * em vermelho. Atrás de prop para as outras telas não mudarem.
   */
  destacarPendencia?: boolean;
}

const VARIANT_STYLES = {
  orange: {
    bg: "#fff7ed", color: "#c2410c", border: "1px solid #fed7aa", borderRadius: 4,
  },
  gray: {
    bg: "#f5f5f4", color: "#57534e", border: "1px solid #e7e5e4", borderRadius: 4,
  },
  plain: {
    bg: "#f5f5f4", color: "#57534e", border: "1px solid #e7e5e4", borderRadius: 6,
  },
  dark: {
    bg: "#292524", color: "#e7e5e4", border: "1px solid #44403c", borderRadius: 4,
  },
  colored: {
    bg: "#f5f5f4", color: "#57534e", border: "1px solid #e7e5e4", borderRadius: 4,
  },
};

const SIZE_STYLES = {
  xs: { fontSize: 11, fontWeight: 600, padding: "2px 6px" },
  sm: { fontSize: 11, fontWeight: 600, padding: "2px 7px" },
  md: { fontSize: 12, fontWeight: 600, padding: "3px 8px" },
};

const OVERFLOW_STYLES = {
  orange:  { bg: "#fed7aa", color: "#92400e" },
  gray:    { bg: "#e7e5e4", color: "#746e69" },
  plain:   { bg: "#e7e5e4", color: "#746e69" },
  dark:    { bg: "#44403c", color: "#746e69" },
  colored: { bg: "#e7e5e4", color: "#746e69" },
};

/** Convert a hex color to rgba with given alpha */
function hexToRgba(hex: string, alpha: number) {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function SponsorChips({
  sponsors,
  max = 2,
  variant = "gray",
  size = "sm",
  emptyText = "—",
  destacarPendencia = false,
}: SponsorChipsProps) {
  const [showAll, setShowAll] = useState(false);

  if (!sponsors || sponsors.length === 0) {
    return (
      <span style={{ fontSize: 12, color: "#746e69", fontStyle: "italic" }}>
        {emptyText}
      </span>
    );
  }

  const chip = VARIANT_STYLES[variant];
  const sz   = SIZE_STYLES[size];
  const ovf  = OVERFLOW_STYLES[variant];

  const visible  = showAll ? sponsors : sponsors.slice(0, max);
  const hidden   = showAll ? [] : sponsors.slice(max);
  const overflow = sponsors.length - max;

  // Tooltip do container: nome + estado de cada patrocinador. Quando ninguém
  // tem registro de aprovação (lista de eventos, triagem), `getApprovalTitle`
  // devolve só o nome — o texto fica idêntico ao de antes.
  const allNames = sponsors.map(s => getApprovalTitle(s.name, s.approvalStatus)).join(" · ");

  // O "+N" escondia o sinal que este componente acabou de ganhar: com max={2}
  // no mobile do Painel, um patrocinador reprovado podia ficar atrás do
  // contador e o vermelho sumia de novo. O botão herda o pior estado escondido
  // — mas SÓ para reprovação e estado desconhecido. Tingir também o
  // "aguardando" deixaria quase todo "+N" âmbar (é o estado padrão) e o sinal
  // voltaria a virar ruído, que é o problema de origem.
  const alertRank = (m: ApprovalMeta | null) =>
    !m ? 0 : m.isRejection ? 3 : m.key === "unknown" ? 2 : 0;
  const hiddenAlert = hidden.reduce<ApprovalMeta | null>((worst, s) => {
    const m = getApprovalMeta(s.approvalStatus);
    return alertRank(m) >= 2 && alertRank(m) > alertRank(worst) ? m : worst;
  }, null);

  return (
    <div
      style={{ display: "flex", flexWrap: "wrap", gap: 3, alignItems: "center" }}
      title={allNames}
    >
      {visible.map(s => {
        const c = s.color && s.color.startsWith("#") ? s.color : null;
        const useColor = variant === "colored" && c;
        const bg     = useColor ? hexToRgba(c!, 0.10) : chip.bg;
        const color  = useColor ? c! : chip.color;
        const border = useColor ? `1px solid ${hexToRgba(c!, 0.30)}` : chip.border;
        // Sem registro de aprovação (`ap === null`), o chip é identidade da
        // MARCA — certo para as telas onde o patrocinador nem entrou no fluxo.
        // Havendo decisão, a COR do chip passa a comunicar o ESTADO: a marca
        // aqui competiria com a decisão e sempre ganhava.
        //
        // A tradução mora em lib/status.ts (getApprovalMeta) porque o servidor
        // grava `awaiting_arte` na reprovação e `new_version_pending` no
        // reenvio — nunca 'rejected'. O mapa local que existia aqui conhecia
        // só 3 valores e devolvia estilo nulo justamente nos dois estados de
        // reprovação: o chip voltava à cor da marca e quem JÁ REPROVOU ficava
        // igual — às vezes mais discreto — a quem nem tinha olhado a peça.
        const ap = getApprovalMeta(s.approvalStatus);
        // Só com `destacarPendencia`: pendente em evidência, aprovado recuado.
        const pendente = destacarPendencia && ap?.tone === "waiting";
        const aprovado = destacarPendencia && ap?.tone === "approved";
        return (
          <span
            key={s.id}
            title={getApprovalTitle(s.name, s.approvalStatus)}
            style={{
              position: "relative", // âncora do rótulo sr-only
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              backgroundColor: ap ? ap.bg : bg,
              color: ap ? ap.text : color,
              border: ap ? `1px solid ${ap.border}` : border,
              borderRadius: chip.borderRadius,
              whiteSpace: "nowrap",
              // TRUNCAR, e não ser cortado pela célula. O chip tinha `nowrap`
              // sem `ellipsis`: o que não coubesse era decepado pela borda da
              // coluna, sem reticências e sem nenhum sinal de que havia mais
              // texto. "Banco do Brasil" virava "Banco do Br" e parecia o nome
              // inteiro. Medido nos 142 patrocinadores cadastrados: 73 deles
              // (51%) pedem mais que os 68px úteis da coluna, e o pior,
              // "Shopping Bosque Grão Pará", pede 175. Alargar para caber todos
              // custaria 107px que a tabela não tem.
              // O `title` já existia — o que faltava era o aviso visual de que
              // vale a pena passar o mouse.
              maxWidth: "100%",
              overflow: "hidden",
              textOverflow: "ellipsis",
              ...sz,
              ...(pendente ? { fontWeight: 700 } : {}),
              ...(aprovado ? { fontWeight: 500, opacity: 0.6 } : {}),
            }}
          >
            {/* A MARCA TEM FORMA, e não só cor.

                Simulei deuteranopia sobre os três estados e os FUNDOS dos
                chips colapsam: #f0fdf4 (aprovado), #fef2f2 (reprovado) e
                #fff7ed (pendente) viram #f5f4f7, #fafaf2 e #fcfdf0 — quase-
                brancos indistinguíveis, com 0,014 de diferença de luminância
                entre dois deles. Sobrava esta marca de 5px carregando a
                distinção inteira, e ela era um círculo nos três casos: ou
                seja, a única pista visual era a MATIZ.

                Forma sobrevive a qualquer deficiência de cor e custa zero
                largura — o que importa aqui, porque 51% dos nomes de
                patrocinador já truncam na coluna. Três formas, três famílias:

                  ● cheia e redonda ... decidido a favor (aprovado)
                  ■ cheia e quadrada .. decidido contra (reprovado/retrabalho)
                  ○ vazada ............ ainda sem decisão (pendente)

                A marca vai de 5 para 6px porque a 5 a diferença entre redondo
                e quadrado não se lê. Um pixel é o preço da segunda pista. */}
            <span style={{
              width: 6, height: 6, flexShrink: 0, display: "inline-block",
              borderRadius: ap?.tone === "rejected" || ap?.tone === "rework" ? 1 : "50%",
              // O tom saturado (500) do estado continua sendo a cor; no
              // `awaiting_arte` a marca é ÂMBAR sobre campo vermelho —
              // reprovado, porém já em retrabalho.
              background: ap?.tone === "waiting" ? "transparent" : (ap ? ap.dot : (useColor ? c! : "transparent")),
              border: ap?.tone === "waiting" ? `1.5px solid ${ap.dot}` : undefined,
              boxSizing: "border-box" as const,
            }} />
            {s.name}
            {pendente && <Clock aria-hidden="true" style={{ width: 10, height: 10, flexShrink: 0 }} />}
            {aprovado && <Check aria-hidden="true" style={{ width: 10, height: 10, flexShrink: 0, color: "#15803d" }} />}
            {ap && <span style={SR_ONLY}>{` — ${ap.label}`}</span>}
          </span>
        );
      })}
      {!showAll && overflow > 0 && (
        <button
          type="button"
          /* preventDefault além do stopPropagation: na lista de Eventos o card
             inteiro virou uma ÂNCORA (<a href>) e este botão renderiza dentro
             dela. stopPropagation impede o handler React de subir, mas NÃO
             cancela a ação padrão do <a> — sem o preventDefault, abrir os
             patrocinadores escondidos NAVEGAVA para o evento. */
          onClick={e => { e.preventDefault(); e.stopPropagation(); setShowAll(true); }}
          title={`Ver todos: ${allNames}`}
          aria-label={hiddenAlert
            ? `Mostrar mais ${overflow} patrocinador(es) — inclui ${hiddenAlert.label}`
            : `Mostrar mais ${overflow} patrocinador(es)`}
          style={{
            display: "inline-flex", alignItems: "center",
            // Tom 200 como fundo e 700 como texto — mesma construção do
            // OVERFLOW_STYLES, então o contorno não muda e nada desloca.
            backgroundColor: hiddenAlert ? hiddenAlert.border : ovf.bg,
            color: hiddenAlert ? hiddenAlert.text : ovf.color,
            border: "none", borderRadius: chip.borderRadius,
            cursor: "pointer", whiteSpace: "nowrap",
            ...sz,
          }}
        >
          +{overflow}
        </button>
      )}
      {showAll && sponsors.length > max && (
        <button
          type="button"
          aria-label="Recolher a lista de patrocinadores"
          /* Mesmo motivo do "+N": renderiza dentro da âncora do card de evento. */
          onClick={e => { e.preventDefault(); e.stopPropagation(); setShowAll(false); }}
          style={{
            display: "inline-flex", alignItems: "center",
            backgroundColor: "transparent", color: "#746e69",
            border: "none", borderRadius: chip.borderRadius,
            cursor: "pointer", fontSize: sz.fontSize, fontWeight: 700,
            padding: sz.padding,
          }}
        >
          ↑
        </button>
      )}
    </div>
  );
}
