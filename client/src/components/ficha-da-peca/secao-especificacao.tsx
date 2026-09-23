// ESPECIFICAÇÃO da peça: a grade de dados, a edição rápida e os recados.
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Edit, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parseDateLocal } from "@/lib/utils";
import { T, TOM, FONT } from "@/lib/theme";
import { CARTAO, TITULO_SECAO } from "./estilos";
import type { CampoEditavel, ItemDaFicha } from "./tipos";

const CAMPOS_EDITAVEIS: { label: string; field: CampoEditavel }[] = [
  { label: "Tipo",       field: "type" },
  { label: "Material",   field: "material" },
  { label: "Acabamento", field: "finish" },
];

export function SecaoEspecificacao({
  item, editedItem, isMobile, editMode, podeEditar, createdBy, rawStatus,
  onEditar, onCancelarEdicao, handleEditChange, handleSave,
}: {
  item: ItemDaFicha;
  editedItem: ItemDaFicha | null;
  isMobile: boolean;
  editMode: boolean;
  /** A tela hospedeira deixou editar (passou `onEditSave`). */
  podeEditar: boolean;
  createdBy: string | null;
  rawStatus: string;
  onEditar: () => void;
  onCancelarEdicao: () => void;
  handleEditChange: (field: CampoEditavel, value: string) => void;
  handleSave: () => void;
}) {
  // ── Especificações: a grade sem linha dupla ───────────────────────────────
  //
  // A grade é feita com `gap: 1px` sobre um fundo — as bordas são as FRESTAS
  // entre as células, então não existe borda dupla por construção (era o risco
  // do desenho com borderRight/borderBottom em cada célula). O que sobra é a
  // última linha incompleta: com 5 dados em 3 colunas, a sexta vaga mostraria a
  // cor do fundo como um retângulo tingido. Células vazias brancas fecham a
  // grade.
  const colunasEspec = isMobile ? 2 : 3;
  const dadosEspec = [
    { label: "Tipo",       value: item.type },
    { label: "Material",   value: item.material },
    { label: "Acabamento", value: item.finish },
    { label: "Quantidade", value: item.quantity ? `${item.quantity} un.` : null },
    { label: "M²",         value: item.calculatedM2 ? `${item.calculatedM2} m²` : null },
    // "Medida" (o texto) saiu da ficha: desde que o servidor a deriva das
    // dimensões de arquivo, ela era a MESMA linha que "Arquivo" com outro
    // nome — e quando divergia (peça #2472), era a linha errada. Três nomes
    // para dois pares é exatamente a confusão que esta ficha não deve criar.
    { label: "Arquivo (ARQ.)", value: item.fileWidth && item.fileHeight ? `${item.fileWidth} × ${item.fileHeight}` : (item.measurement || null) },
    { label: "Visual (VIS.)",  value: item.visualWidth && item.visualHeight ? `${item.visualWidth} × ${item.visualHeight}` : null },
  ].filter(x => x.value);
  const vagasVazias = (colunasEspec - (dadosEspec.length % colunasEspec)) % colunasEspec;

  return (
    <section>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
        <h3 style={TITULO_SECAO}>Especificação</h3>
        {!editMode && podeEditar && (
          <button
            onClick={onEditar}
            data-testid="button-editar-especificacao"
            style={{
              background: "none", border: "none", cursor: "pointer", padding: 0,
              display: "flex", alignItems: "center", gap: 5,
              font: "inherit", fontSize: 11, fontWeight: 700, color: T.accentText,
              textTransform: "uppercase", letterSpacing: "0.06em",
            }}
          >
            <Edit aria-hidden="true" style={{ width: 11, height: 11 }} /> Editar
          </button>
        )}
      </div>

      <div style={{ ...CARTAO, overflow: "hidden" }}>
        {editMode ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 16 }}>
            {CAMPOS_EDITAVEIS.map(({ label, field }) => (
              <div key={field}>
                <label htmlFor={`detail-edit-${field}`} style={{ fontSize: 11, color: T.apoio, display: "block", marginBottom: 4 }}>{label}</label>
                <Input id={`detail-edit-${field}`} value={editedItem?.[field] || ""} onChange={(e) => handleEditChange(field, e.target.value)} className="h-9 text-sm" />
              </div>
            ))}
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <Button size="sm" variant="outline" onClick={onCancelarEdicao}>Cancelar</Button>
              <Button size="sm" onClick={handleSave}><Save className="h-3 w-3 mr-1" />Salvar</Button>
            </div>
          </div>
        ) : (
          <>
            {/* Grade por FRESTA (gap 1px sobre o fundo): não existe
                borda dupla nas beiradas porque não existe borda nas
                células. As vagas vazias fecham a última linha. */}
            <div style={{
              display: "grid",
              gridTemplateColumns: `repeat(${colunasEspec}, minmax(0,1fr))`,
              gap: 1, backgroundColor: T.border,
            }}>
              {dadosEspec.map(({ label, value }) => (
                <div key={label} style={{ backgroundColor: T.surface, padding: "11px 14px", minWidth: 0 }}>
                  <p style={{ fontSize: 10, fontWeight: 700, color: T.second, textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 3px" }}>{label}</p>
                  <p title={String(value)} style={{ fontFamily: FONT.display, fontWeight: 700, fontSize: 15, color: T.text, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</p>
                </div>
              ))}
              {Array.from({ length: vagasVazias }).map((_, i) => (
                <div key={`vaga-${i}`} aria-hidden="true" style={{ backgroundColor: T.surface }} />
              ))}
            </div>
            {/* A data que importa — a saída do caminhão — já está no
                cabeçalho. Aqui fica o contexto, numa linha só, onde
                antes havia dois blocos de 32px de respiro. A data do
                evento chega do JSON como texto (parseDateLocal só lê
                texto). */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 16px", padding: "10px 14px", borderTop: `1px solid ${T.border}`, fontSize: 12, color: T.apoio }}>
              <span>
                Evento em{" "}
                <strong style={{ color: T.text, fontWeight: 700 }}>
                  {item.event?.startDate ? format(parseDateLocal(item.event.startDate as string), "dd/MM/yyyy", { locale: ptBR }) : "—"}
                </strong>
              </span>
              {item.printShop && <span>Gráfica: <strong style={{ color: T.text, fontWeight: 700 }}>{item.printShop}</strong></span>}
              {createdBy && <span>Solicitada por <strong style={{ color: T.text, fontWeight: 700 }}>{createdBy}</strong></span>}
            </div>
          </>
        )}
      </div>

      {rawStatus === "canceled" && item.motivoCancelamento && (
        <div data-testid="text-motivo-cancelamento" style={{ ...CARTAO, marginTop: 10, padding: "12px 14px", borderColor: TOM.perigo.border, backgroundColor: TOM.perigo.bg }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: TOM.perigo.text, textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 4px" }}>Motivo do cancelamento</p>
          <p style={{ fontSize: 13, color: TOM.perigo.text, lineHeight: 1.55, margin: 0 }}>{item.motivoCancelamento}</p>
        </div>
      )}
      {item.observations && (
        <div style={{ ...CARTAO, marginTop: 10, padding: "12px 14px" }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: T.second, textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 4px" }}>Recado para a Gráfica</p>
          <p style={{ fontSize: 13, color: T.apoio, fontStyle: "italic", lineHeight: 1.55, margin: 0 }}>"{item.observations}"</p>
        </div>
      )}
    </section>
  );
}
