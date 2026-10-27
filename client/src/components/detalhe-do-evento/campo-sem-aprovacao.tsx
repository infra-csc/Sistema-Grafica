// ─────────────────────────────────────────────────────────────────────────────
// AS MARCAS "SEM PATROCÍNIO" E "ARTE DO CLIENTE" NO FORMULÁRIO DA PEÇA
// (Pedro/dono, 26/10 — RF01: visíveis na criação e na edição, marcação sempre
// manual). Quem marca: admin e Solicitação. Fora do Layout (depois que a Arte
// enviou o layout) só o admin muda — RN07; a caixa aparece travada com o porquê.
// O efeito no prazo vai escrito ao lado: "Layout 10/11 → 17/11 (+7d)".
// ─────────────────────────────────────────────────────────────────────────────
import { useRef } from "react";
import { CalendarClock, Info, Lock } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { PrazoDeLayoutAjustado } from "@/components/selo-sem-aprovacao";
import { useDiasDaAprovacao } from "@/hooks/use-configuracoes";
import { FS, FW, R, T, TOM } from "@/lib/theme";
import { FRASE_MARCA_TRAVADA, marcasEditaveis, recusaAoMarcar, ROTULO_ARTE_DO_CLIENTE, ROTULO_SEM_PATROCINIO } from "@shared/prazo-sem-aprovacao";

type EventoDosPrazos = { truckDepartureDate?: Date | string | null; deadlineEntregaLayouts?: number | null } | null | undefined;

export function CampoSemAprovacao({ valor, onChange, statusDaPeca, papel, evento, temPatrocinador = false, idBase }: {
  valor: { skipApproval: boolean; arteDoCliente: boolean };
  onChange: (v: Partial<{ skipApproval: boolean; arteDoCliente: boolean }>) => void;
  /** Na criação, indefinido (a peça nasce em rascunho — Layout). */
  statusDaPeca?: string;
  papel: string | null | undefined;
  evento?: EventoDosPrazos;
  /** Edição: a peça tem patrocinador vinculado (a marca e o vínculo não convivem). */
  temPatrocinador?: boolean;
  idBase: string;
}) {
  const dias = useDiasDaAprovacao();
  const status = statusDaPeca ?? "draft";
  const editavel = marcasEditaveis(status, papel);
  const algum = valor.skipApproval || valor.arteDoCliente;
  // LIGAR uma marca pode esbarrar em mais coisa que desligar (patrocinador
  // vinculado, peça já na Aprovação) — a MESMA régua do servidor.
  const recusaAoLigar = recusaAoMarcar({ status, temPatrocinador }, papel, true);
  // Desmarcar a peça que JÁ estava marcada e não tem patrocinador: ela segue
  // sem Aprovação até alguém vincular um — dito antes de salvar.
  const inicial = useRef(valor);
  const tinhaMarca = inicial.current.skipApproval || inicial.current.arteDoCliente;
  const desmarcouSemPatrocinador = !!statusDaPeca && tinhaMarca && !algum && !temPatrocinador;
  const caixa = (id: string, rotulo: string, ajuda: string, marcado: boolean, mudar: (v: boolean) => void, testid: string) => (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
      <Checkbox
        id={id}
        checked={marcado}
        disabled={!editavel || (!marcado && !!recusaAoLigar)}
        onCheckedChange={(c) => mudar(!!c)}
        data-testid={testid}
        style={{ width: 20, height: 20, marginTop: 1, accentColor: TOM.alerta.text }}
      />
      <label htmlFor={id} style={{ cursor: editavel ? "pointer" : "not-allowed", minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 15, fontWeight: FW.medio, color: T.text }}>{rotulo}</span>
        <span style={{ display: "block", fontSize: FS.meta, color: T.second, lineHeight: 1.45 }}>{ajuda}</span>
      </label>
    </div>
  );
  return (
    <fieldset
      data-testid="campo-sem-aprovacao"
      style={{ margin: 0, border: `1px solid ${TOM.alerta.border}`, borderLeft: `4px solid ${TOM.alerta.dot}`, background: TOM.alerta.bg, borderRadius: R.md, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12 }}
    >
      <legend style={{ padding: "0 6px", marginLeft: -6, display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: TOM.alerta.text }}>
        <CalendarClock aria-hidden="true" style={{ width: 13, height: 13 }} />
        Peça sem aprovação
      </legend>
      {caixa(`${idBase}-sem-patrocinio`, ROTULO_SEM_PATROCINIO, "Não passa pela Aprovação do patrocinador.", valor.skipApproval, (v) => onChange({ skipApproval: v }), "checkbox-sem-patrocinio")}
      {caixa(`${idBase}-arte-do-cliente`, ROTULO_ARTE_DO_CLIENTE, "A arte vem pronta do cliente: a peça espera o arquivo em Layout e, quando ele chega (“Arte recebida”), vai direto para a Finalização, onde a medida é conferida.", valor.arteDoCliente, (v) => onChange({ arteDoCliente: v }), "checkbox-arte-do-cliente")}
      <p style={{ margin: 0, fontSize: FS.meta, color: T.second, lineHeight: 1.45 }}>
        {algum
            ? <>Prazo de Layout ajustado: <PrazoDeLayoutAjustado peca={{ ...valor, status: statusDaPeca ?? "draft" }} evento={evento} rotulo={false} /> — a Finalização e o prazo final não mudam.</>
            : `Com “Sem patrocínio” ou “Arte do cliente”, o prazo de Layout ganha a duração da Aprovação (${dias} ${dias === 1 ? "dia corrido" : "dias corridos"}); com as duas, os dias contam uma vez só.`}
      </p>
      {!editavel ? (
        <p role="note" style={{ margin: 0, display: "flex", alignItems: "center", gap: 6, fontSize: FS.meta, color: TOM.alerta.text }}>
          <Lock aria-hidden="true" style={{ width: 12, height: 12, flexShrink: 0 }} />
          {FRASE_MARCA_TRAVADA}
        </p>
      ) : recusaAoLigar && !algum ? (
        <p role="note" data-testid="marca-recusada" style={{ margin: 0, display: "flex", alignItems: "flex-start", gap: 6, fontSize: FS.meta, color: TOM.alerta.text, lineHeight: 1.45 }}>
          <Lock aria-hidden="true" style={{ width: 12, height: 12, flexShrink: 0, marginTop: 2 }} />
          {recusaAoLigar}
        </p>
      ) : null}
      {desmarcouSemPatrocinador && (
        <p role="note" data-testid="desmarcou-sem-patrocinador" style={{ margin: 0, display: "flex", alignItems: "flex-start", gap: 6, fontSize: FS.meta, color: T.second, lineHeight: 1.45 }}>
          <Info aria-hidden="true" style={{ width: 12, height: 12, flexShrink: 0, marginTop: 2 }} />
          Sem patrocinador vinculado, a peça continua sem Aprovação. Para ela passar pela Aprovação, acrescente o patrocinador (Vincular Patrocinadores › Acrescentar).
        </p>
      )}
    </fieldset>
  );
}
