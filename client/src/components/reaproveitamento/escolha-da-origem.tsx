// ─────────────────────────────────────────────────────────────────────────────
// "DE ONDE VEM?" — a escolha da origem do reaproveitamento (dono, 16/10).
//
// Aparece em TODO lugar que marca reaproveitamento (Reaproveitar da Gráfica, a
// Revisão Final, o formulário da peça) e no botão "Origem do reaproveitamento"
// da ficha. Opcional — não trava o fluxo de sempre —, mas "Em trânsito" pede a
// observação: sem ela ninguém sabe de qual caminhão a peça vem.
//
// Um componente controlado: quem usa guarda { origem, obs } e manda junto no
// corpo (origemReaproveitamento / obsReaproveitamento). As regras de validade
// são as do servidor (shared/origem-do-reaproveitamento.ts), lidas daqui.
// ─────────────────────────────────────────────────────────────────────────────
import { Boxes, Truck } from "lucide-react";
import { FS, FW, T, TOM } from "@/lib/theme";
import {
  INSTRUCAO_EM_TRANSITO, OBS_DO_REAPROVEITAMENTO_MAX, OBS_EM_TRANSITO_MIN,
  origemDe, type OrigemDoReaproveitamento,
} from "@shared/origem-do-reaproveitamento";

export type ValorDaOrigem = { origem: OrigemDoReaproveitamento | null; obs: string };

export const ORIGEM_VAZIA: ValorDaOrigem = { origem: null, obs: "" };

/** O valor inicial a partir da peça (a origem que ela já tem). */
export const valorDaPeca = (p: { origemReaproveitamento?: string | null; obsReaproveitamento?: string | null } | null | undefined): ValorDaOrigem =>
  ({ origem: origemDe(p), obs: p?.obsReaproveitamento ?? "" });

/** "Em trânsito" sem a observação não sai — o mesmo que o servidor recusa. */
export const faltaObservacao = (v: ValorDaOrigem): boolean =>
  v.origem === "em_transito" && v.obs.replace(/\s+/g, " ").trim().length < OBS_EM_TRANSITO_MIN;

/** O pedaço do corpo da requisição — só quando há algo escolhido ou a mudar. */
export const corpoDaOrigem = (v: ValorDaOrigem) => ({
  origemReaproveitamento: v.origem,
  obsReaproveitamento: v.origem ? v.obs.trim() || null : null,
});

const OPCOES: Array<{ valor: OrigemDoReaproveitamento; rotulo: string; dica: string; Icone: typeof Boxes; tom: (typeof TOM)[keyof typeof TOM] }> = [
  { valor: "estoque", rotulo: "Estoque", dica: "sai do galpão — a Gráfica busca", Icone: Boxes, tom: TOM.alerta },
  { valor: "em_transito", rotulo: "Em trânsito", dica: "já está no caminhão de outra etapa", Icone: Truck, tom: TOM.ciano },
];

export function EscolhaDaOrigem({ valor, onChange, idBase, isMobile = false, desabilitado = false }: {
  valor: ValorDaOrigem;
  onChange: (v: ValorDaOrigem) => void;
  /** Prefixo dos ids (rótulo ↔ campo) e dos data-testid. */
  idBase: string;
  isMobile?: boolean;
  desabilitado?: boolean;
}) {
  const falta = faltaObservacao(valor);
  const idObs = `${idBase}-obs`;
  const idAjuda = `${idBase}-ajuda`;
  return (
    <fieldset className="reap-escolha" data-testid={`${idBase}-escolha`} disabled={desabilitado}>
      <legend className="reap-legenda">
        De onde vem? <span className="reap-opcional">(opcional)</span>
      </legend>
      <div role="radiogroup" aria-label="De onde vem o reaproveitamento" className="reap-opcoes"
        // Setas como num grupo de rádio (WAI-ARIA): movem o foco E marcam.
        onKeyDown={(e) => {
          const passo = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
          if (!passo) return;
          e.preventDefault();
          const atual = OPCOES.findIndex((o) => o.valor === valor.origem);
          // Sem nada marcado, → vai para a primeira e ← para a última; depois dá a volta.
          const base = atual < 0 ? (passo > 0 ? -1 : OPCOES.length) : atual;
          const proxima = OPCOES[(base + passo + OPCOES.length) % OPCOES.length];
          onChange({ ...valor, origem: proxima.valor });
          (e.currentTarget.querySelector(`[data-testid="${idBase}-origem-${proxima.valor}"]`) as HTMLElement | null)?.focus();
        }}>
        {OPCOES.map(({ valor: v, rotulo, dica, Icone, tom }) => {
          const marcada = valor.origem === v;
          return (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={marcada}
              data-testid={`${idBase}-origem-${v}`}
              className="reap-opcao"
              // Clicar na marcada desmarca: a escolha é opcional.
              onClick={() => onChange({ ...valor, origem: marcada ? null : v })}
              style={{
                minHeight: isMobile ? 52 : 48,
                borderColor: marcada ? tom.text : T.bdark,
                background: marcada ? tom.bg : T.surface,
                boxShadow: marcada ? `inset 0 0 0 1px ${tom.text}` : "none",
              }}
            >
              <span className="reap-opcao-icone" style={{ background: marcada ? T.surface : tom.bg, color: tom.text }}>
                <Icone aria-hidden="true" style={{ width: 16, height: 16 }} />
              </span>
              <span style={{ display: "flex", flexDirection: "column", minWidth: 0, textAlign: "left" }}>
                <span style={{ fontSize: FS.body, fontWeight: FW.forte, color: marcada ? tom.text : T.text, lineHeight: 1.25 }}>{rotulo}</span>
                <span style={{ fontSize: FS.small, color: T.second, lineHeight: 1.3 }}>{dica}</span>
              </span>
            </button>
          );
        })}
      </div>

      <label htmlFor={idObs} className="reap-rotulo-obs">
        Observação <span className="reap-opcional">· qual etapa/evento{valor.origem === "em_transito" ? "" : " (opcional)"}</span>
      </label>
      <input
        id={idObs}
        type="text"
        value={valor.obs}
        maxLength={OBS_DO_REAPROVEITAMENTO_MAX}
        onChange={(e) => onChange({ ...valor, obs: e.target.value })}
        placeholder="Ex.: Night Run Salvador, etapa 17/10"
        aria-describedby={idAjuda}
        aria-required={valor.origem === "em_transito" || undefined}
        aria-invalid={falta || undefined}
        data-testid={`${idBase}-obs`}
        className="grf-campo reap-campo"
        style={{
          height: isMobile ? 44 : 38,
          fontSize: isMobile ? 16 : 13,
          borderColor: falta ? TOM.alerta.dot : T.bdark,
        }}
      />
      <p id={idAjuda} role={falta ? "status" : undefined} className="reap-ajuda" data-testid={`${idBase}-ajuda`}
        style={{ color: falta ? TOM.alerta.text : T.second, fontWeight: falta ? FW.forte : FW.corpo }}>
        {valor.origem === "em_transito"
          ? (falta ? `${INSTRUCAO_EM_TRANSITO}.` : "Em trânsito não passa por conferir, embalar nem entregar — a peça já saiu daqui.")
          : valor.origem === "estoque"
            ? "A Gráfica vê \"Buscar no estoque\" e recebe o aviso. Depois de separada, a peça segue para conferir, embalar e entregar."
            : "Marque se a peça sai do estoque ou já está no caminhão de outra etapa (caminhão conjugado)."}
      </p>
    </fieldset>
  );
}

/** Uma linha de leitura: "Em trânsito · Night Run Salvador" — para resumos e confirmações. */
export function fraseCurtaDaOrigem(v: ValorDaOrigem): string {
  if (!v.origem) return "";
  const rotulo = v.origem === "em_transito" ? "Em trânsito" : "Estoque";
  const obs = v.obs.trim();
  return obs ? `${rotulo} · ${obs}` : rotulo;
}

