// ─────────────────────────────────────────────────────────────────────────────
// O FORMULÁRIO DE PEÇA — o mesmo nos dois fluxos (Adicionar e Editar).
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from "react";
import { Plus, Check, Paperclip, X, RotateCcw, AlertTriangle } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Botao } from "@/components/ui/botao";
import { ObjectUploader } from "@/components/ObjectUploader";
import { ModalFooter } from "@/components/modal-shell";
import { AumentarQuantidadeButton } from "@/components/aumentar-quantidade-dialog";
import { calculateM2 } from "@/lib/calculateM2";
import { T, N, TOM } from "@/lib/theme";
import { rotuloDaRemessa, type RemessaDoKit } from "@shared/kit";
import { alinharTipo } from "@shared/tipo-da-peca";
import type { ItemFormData, ModeloDePeca } from "./tipos";

// Tipografia e controles do formulário de peça — a MESMA cara nos dois fluxos.
const FIELD_LABEL: React.CSSProperties = { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: T.second };
const FIELD_INPUT: React.CSSProperties = { width: "100%", backgroundColor: T.low, border: "none", borderRadius: 8, padding: "12px 16px", fontSize: 15, fontWeight: 500, color: T.text, transition: "box-shadow 0.15s" };

interface ItemFormProps {
  mode: "create" | "edit";
  formData: ItemFormData;
  setFormData: React.Dispatch<React.SetStateAction<ItemFormData>>;
  standardItems: ModeloDePeca[];
  typeOptions: string[];
  materialOptions: string[];
  finishOptions: string[];
  customMaterial: boolean;
  setCustomMaterial: (v: boolean) => void;
  customFinish: boolean;
  setCustomFinish: (v: boolean) => void;
  isMobile: boolean;
  isAdmin: boolean;
  isPending: boolean;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
  localRefPreview: string;
  setLocalRefPreview: (v: string) => void;
  getUploadUrl: () => Promise<{ method: "PUT"; url: string }>;
  /** Remessas do Kit deste evento (criar: "Peça de" Arena ou KIT). */
  remessasDoKit?: RemessaDoKit[];
  /** Usuário do Kit: a remessa é obrigatória (não cria peça da Arena). */
  kitObrigatorio?: boolean;
  /** Peça já em produção: sobe por complemento, desce até o piso físico. */
  quantityLocked?: boolean;
  /** Piso físico: já produzido+reuso / conferido / entregue — o que for maior. */
  quantityFloor?: number;
  /** Teto da edição direta: a quantidade contratada hoje. Acima disso, complemento. */
  quantityCeiling?: number;
  /** Fecha o form e abre o modal de complemento (só existe com quantityLocked). */
  onAumentarQuantidade?: () => void;
  /** admin|solicitacao: pode marcar a peça como prioritária (fura a fila da Arte). */
  podePriorizar?: boolean;
}

// Formulário de peça unificado. Antes eram DUAS implementações independentes
// da mesma entidade: o modo simples do "Adicionar Peça" (Popover+Command,
// primário #1c1917) e o "Editar Peça" (selects nativos, primário #c2410c) —
// a mesma peça tinha duas caras. A versão do EDITAR (revisada e aprovada pelo
// dono) virou a base; o `mode` controla só as diferenças de negócio:
// create = tipo/qtd/descrição/dimensões/material/acabamento; edit soma
// Reaproveitamento, Referência (Ctrl+V) e Pular Aprovação.
export function ItemForm({
  mode, formData, setFormData, standardItems, typeOptions, materialOptions,
  finishOptions, customMaterial, setCustomMaterial, customFinish,
  setCustomFinish, isMobile, isAdmin, isPending, onSubmit, onCancel,
  localRefPreview, setLocalRefPreview, getUploadUrl,
  quantityLocked = false, quantityFloor = 0, quantityCeiling = Number.MAX_SAFE_INTEGER,
  onAumentarQuantidade, podePriorizar = false,
  remessasDoKit = [], kitObrigatorio = false,
}: ItemFormProps) {
  const isEdit = mode === "edit";
  // "Digitar novo tipo" só existe no criar — no editar o tipo já é texto livre.
  const [customType, setCustomType] = useState(false);
  const focusRing = (e: React.FocusEvent<HTMLElement>) => ((e.currentTarget as HTMLElement).style.boxShadow = "0 0 0 2px rgba(249,115,22,0.25)");
  const blurRing = (e: React.FocusEvent<HTMLElement>) => ((e.currentTarget as HTMLElement).style.boxShadow = "none");

  const typeKnown = standardItems.some((s) => s.name === formData.type) || typeOptions.includes(formData.type);

  return (
    <form onSubmit={onSubmit} style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0 }}>
      <div className="scrollbar-visible" style={{ flex: 1, overflowY: "auto", padding: "28px", display: "flex", flexDirection: "column", gap: 24 }}>

        {/* KIT: a peça é da Arena ou de uma remessa do Kit (com as
            datas do Kit). O usuário do Kit só cria peça do Kit. */}
        {!isEdit && (kitObrigatorio || remessasDoKit.length > 0) && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label htmlFor="item-kit" style={FIELD_LABEL}>Peça de</label>
            <select
              id="item-kit"
              required={kitObrigatorio}
              value={formData.kitRemessaId}
              onChange={(e) => setFormData({ ...formData, kitRemessaId: e.target.value })}
              data-testid="select-item-kit"
              style={{ ...FIELD_INPUT, cursor: "pointer", color: formData.kitRemessaId ? TOM.roxo.text : FIELD_INPUT.color, fontWeight: formData.kitRemessaId ? 700 : 500 }}
            >
              {kitObrigatorio
                ? <option value="">— escolha a remessa do Kit —</option>
                : <option value="">Arena (lista do evento)</option>}
              {remessasDoKit.map((r) => <option key={r.id} value={r.id}>{rotuloDaRemessa(r)}</option>)}
            </select>
            {kitObrigatorio && remessasDoKit.length === 0 && (
              <span style={{ fontSize: 12, color: TOM.alerta.text }}>Crie a remessa do Kit neste evento (painel Kit) antes de adicionar peças.</span>
            )}
          </div>
        )}

        {/* Linha 1: Tipo (3fr) | Qtd. (1fr) | M2 Total (1fr) */}
        {/* No celular o Tipo ocupa a linha inteira e Qtd./M² dividem a de
            baixo: em 3fr/1fr/1fr numa tela de 390px o select do tipo cortava
            o nome do modelo e a Qtd. virava um campo de dois dígitos. */}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "3fr 1fr 1fr", gap: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, gridColumn: isMobile ? "1 / -1" : undefined }}>
            <label htmlFor="item-type" style={FIELD_LABEL}>Tipo de Peça</label>
            {isEdit ? (
              <input
                id="item-type"
                autoFocus
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                placeholder="Ex: Banner Lona Frontlight"
                data-testid="input-edit-type"
                style={FIELD_INPUT}
                onFocus={focusRing}
                onBlur={blurRing}
              />
            ) : customType ? (
              <>
                <input
                  id="item-type"
                  autoFocus
                  required
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                  placeholder="Digite o novo tipo..."
                  data-testid="input-type-name-edit"
                  style={FIELD_INPUT}
                  onFocus={focusRing}
                  // Tipo digitado que JÁ existe (Modelo ou tipo do evento, sem
                  // distinguir maiúscula/acento) vira a grafia existente — senão
                  // a peça cai num subgrupo à parte (relato de 25/09).
                  onBlur={(e) => {
                    blurRing(e);
                    const alinhado = alinharTipo(formData.type, { modelos: standardItems, tiposDoEvento: typeOptions });
                    if (alinhado.type !== formData.type || alinhado.standardItemId) {
                      setFormData({ ...formData, type: alinhado.type, standardItemId: alinhado.standardItemId ?? formData.standardItemId ?? "" });
                    }
                  }}
                />
                {/* Caminho de volta: sem ele, quem clicava em "+ Novo tipo..."
                    por engano ficava preso no modo texto livre. */}
                <button
                  type="button"
                  onClick={() => { setFormData({ ...formData, type: "" }); setCustomType(false); }}
                  data-testid="button-back-to-type-list"
                  style={{ alignSelf: "flex-start", background: "none", border: "none", padding: 0, fontSize: 11, fontWeight: 700, color: T.accentText, cursor: "pointer" }}
                >
                  ← escolher da lista
                </button>
              </>
            ) : (
              <select
                id="item-type"
                autoFocus
                required
                value={typeKnown ? formData.type : formData.type ? "__atual__" : ""}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "__novo__") { setFormData({ ...formData, type: "", standardItemId: "" }); setCustomType(true); return; }
                  if (v === "__atual__") return;
                  const model = standardItems.find((s) => s.name === v);
                  if (model) {
                    // Selecionar um Modelo pré-preenche dimensões/material/
                    // acabamento — e GRAVA o vínculo: é o que deixa o catálogo
                    // responder "quantas peças usam este modelo".
                    setFormData({
                      ...formData,
                      type: model.name,
                      standardItemId: model.id,
                      visualWidth: model.visualWidth ? String(model.visualWidth) : (model.area ? String(model.area) : ""),
                      visualHeight: model.visualHeight ? String(model.visualHeight) : (model.visual ? String(model.visual) : ""),
                      fileWidth: model.fileWidth ? String(model.fileWidth) : "",
                      fileHeight: model.fileHeight ? String(model.fileHeight) : "",
                      material: model.material || "",
                      finish: model.finish || "",
                      measurement: (model.visualWidth && model.visualHeight) ? `${model.visualWidth} × ${model.visualHeight}` : (model.area && model.visual ? `${model.area} × ${model.visual}` : ""),
                    });
                    return;
                  }
                  setFormData({ ...formData, type: v, standardItemId: "" });
                }}
                data-testid="select-item-type"
                style={{ ...FIELD_INPUT, cursor: "pointer" }}
              >
                <option value="">— selecione —</option>
                {formData.type && !typeKnown && <option value="__atual__">{formData.type} (atual)</option>}
                {standardItems.length > 0 && (
                  <optgroup label="Modelos">
                    {standardItems.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
                  </optgroup>
                )}
                <optgroup label="Outros Tipos">
                  {typeOptions.filter(t => !standardItems.some((s) => s.name === t)).map(t => <option key={t} value={t}>{t}</option>)}
                </optgroup>
                <option value="__novo__">+ Novo tipo...</option>
              </select>
            )}
          </div>
          {/* Qtd. depois que a peça entra em produção: SOBE pelo complemento,
              DESCE por edição normal até o piso físico. Travar o campo por
              completo (como esta tela chegou a fazer) tornava o piso do
              servidor inalcançável e quebrava a promessa "reduzir continua
              sendo editar o número" — o cliente que corta o pedido de 15 para
              12 não tinha caminho nenhum. Digitar acima do contratado não é
              erro: leva ao fluxo certo, o do complemento. */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label htmlFor="item-quantity" style={FIELD_LABEL}>Qtd.</label>
            <input
              id="item-quantity"
              type="number"
              min={quantityLocked ? quantityFloor : 1}
              max={quantityLocked ? quantityCeiling : undefined}
              required={!isEdit}
              aria-describedby={quantityLocked ? "item-quantity-hint" : undefined}
              value={formData.quantity}
              onChange={(e) => {
                const digitado = parseInt(e.target.value) || 1;
                if (!quantityLocked) {
                  setFormData({ ...formData, quantity: digitado });
                  return;
                }
                // Acima do contratado: o aumento não acontece aqui. Mantém o
                // número atual e abre o complemento — o mesmo gesto de antes,
                // desembocando no fluxo certo em vez de num 409 depois de
                // preencher o form inteiro.
                if (digitado > quantityCeiling) {
                  onAumentarQuantidade?.();
                  return;
                }
                setFormData({ ...formData, quantity: Math.max(digitado, quantityFloor) });
              }}
              title={quantityLocked
                ? `Em produção: dá para reduzir até ${quantityFloor} (impressas/conferidas/entregues — o reaproveitamento encolhe junto). Para aumentar, use o complemento.`
                : undefined}
              data-testid={isEdit ? "input-edit-quantity" : "input-quantity"}
              style={FIELD_INPUT}
              onFocus={focusRing}
              onBlur={blurRing}
            />
            {quantityLocked && (
              <>
                <p id="item-quantity-hint" style={{ margin: 0, fontSize: 10, lineHeight: 1.4, color: T.second }}>
                  Em produção: dá para <strong>reduzir</strong> até {quantityFloor}
                  {quantityFloor > 0 ? " (já produzidas/conferidas/entregues)" : ""}. Para <strong>aumentar</strong>, o pedido vira uma peça complementar.
                </p>
                {onAumentarQuantidade && (
                  <AumentarQuantidadeButton variant="link" onClick={onAumentarQuantidade} testId="button-aumentar-quantidade-form" />
                )}
              </>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label htmlFor="item-m2-total" style={FIELD_LABEL}>M2 Total</label>
            <input
              id="item-m2-total"
              readOnly
              tabIndex={-1}
              value={formData.fileWidth && formData.fileHeight
                ? calculateM2(formData.quantity, parseFloat(formData.fileWidth) || 0, parseFloat(formData.fileHeight) || 0).toFixed(2) + " m²"
                : "—"
              }
              // #c2410c: o total é TEXTO de 15px — o #f97316 dava 2,6:1 sobre #f3f4f3.
              style={{ ...FIELD_INPUT, fontWeight: 700, color: formData.fileWidth && formData.fileHeight ? T.accentText : T.second, cursor: "default" }}
            />
          </div>
        </div>

        {/* Reaproveitamento — banner topo (só na edição) */}
        {isEdit && (
          <div
            data-testid="toggle-is-reuse"
            onClick={() => setFormData({ ...formData, isReuse: !formData.isReuse })}
            style={{
              // #047857 (não #059669): o subtítulo branco precisava de mais
              // contraste sobre o fundo ativo.
              backgroundColor: formData.isReuse ? TOM.esmeralda.text : T.low,
              border: `2px solid ${formData.isReuse ? TOM.esmeralda.text : T.border}`,
              padding: "14px 18px", borderRadius: "12px",
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px",
              cursor: "pointer", transition: "all 0.15s",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <div style={{ backgroundColor: formData.isReuse ? "rgba(255,255,255,0.2)" : T.border, borderRadius: "8px", padding: "8px", flexShrink: 0 }}>
                <RotateCcw style={{ width: 18, height: 18, color: formData.isReuse ? T.surface : T.second }} />
              </div>
              <div>
                <p style={{ fontSize: "15px", fontWeight: 700, color: formData.isReuse ? T.surface : T.strong, margin: 0 }}>Reaproveitamento</p>
                <p style={{ fontSize: "12px", color: formData.isReuse ? T.surface : T.apoio, margin: 0 }}>Gráfica entrega direto — sem etapa de produção</p>
              </div>
            </div>
            <Checkbox
              checked={formData.isReuse}
              onCheckedChange={(checked) => setFormData({ ...formData, isReuse: !!checked })}
              data-testid="checkbox-is-reuse"
              style={{ width: "20px", height: "20px", accentColor: T.surface, pointerEvents: "none", flexShrink: 0 }}
            />
          </div>
        )}

        {/* Descrição */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label htmlFor="item-description" style={FIELD_LABEL}>Descrição do Item <span style={{ color: T.second, fontWeight: 400, textTransform: "none", letterSpacing: 0, fontSize: 10 }}>(opcional)</span></label>
          <input
            id="item-description"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder={isEdit ? "Ex: Banner para fachada lateral com ilhós" : "Ex: Banner Frontlit Entrada Principal"}
            data-testid={isEdit ? "input-edit-description" : "input-description"}
            style={FIELD_INPUT}
            onFocus={focusRing}
            onBlur={blurRing}
          />
        </div>

        {/* Dimensões — painel bg */}
        <div style={{ backgroundColor: "rgba(243,244,243,0.6)", padding: "24px", borderRadius: "12px" }}>
          <div style={{ ...FIELD_LABEL, marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: T.accent, display: "inline-block", flexShrink: 0 }}></span>
            Dimensões de Produção
          </div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr 1fr", gap: "12px" }}>
            {/* A bolinha LARANJA marca o par que alimenta o m² — e estava
                no par ERRADO: laranja no visual, cinza no arquivo, com o
                "M2 Total" laranja derivando do arquivo. O formulário
                ensinava a olhar para o lado que não cobra. */}
            {([
              { label: "VIS. Largura", key: "visualWidth", orange: false, testId: isEdit ? "input-edit-visual-width" : "input-visual-width" },
              { label: "VIS. Altura", key: "visualHeight", orange: false, testId: isEdit ? "input-edit-visual-height" : "input-visual-height" },
              { label: "ARQ. Largura", key: "fileWidth", orange: true, testId: isEdit ? "input-edit-file-width" : "input-file-width" },
              { label: "ARQ. Altura", key: "fileHeight", orange: true, testId: isEdit ? "input-edit-file-height" : "input-file-height" },
            ] as const).map((dim) => (
              <div key={dim.key} style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <label htmlFor={`item-${dim.key}`} style={{ fontSize: 11, fontWeight: 700, color: T.second, display: "flex", alignItems: "center", gap: "5px" }}>
                  <span style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: dim.orange ? T.accent : T.muted, display: "inline-block", flexShrink: 0 }}></span>
                  {dim.label}
                </label>
                <input
                  id={`item-${dim.key}`}
                  type="number"
                  step="0.01"
                  min="0"
                  required={!isEdit}
                  value={formData[dim.key]}
                  onChange={(e) => {
                    const v = e.target.value;
                    // Digitar o VIS espelha no ARQ enquanto o ARQ estiver
                    // vazio ou ainda for espelho do VIS antigo — a MESMA
                    // regra do Modelos, que este formulário não tinha:
                    // aqui era preciso digitar os quatro números, e quem
                    // parava nos dois primeiros criava peça sem medida de
                    // arquivo (m² zero, "sem medida" na importação). Um
                    // ARQ personalizado (sangria) nunca é sobrescrito.
                    if (dim.key === "visualWidth") {
                      const espelho = !formData.fileWidth || formData.fileWidth === formData.visualWidth;
                      setFormData({ ...formData, visualWidth: v, fileWidth: espelho ? v : formData.fileWidth });
                    } else if (dim.key === "visualHeight") {
                      const espelho = !formData.fileHeight || formData.fileHeight === formData.visualHeight;
                      setFormData({ ...formData, visualHeight: v, fileHeight: espelho ? v : formData.fileHeight });
                    } else {
                      setFormData({ ...formData, [dim.key]: v });
                    }
                  }}
                  placeholder="0.00"
                  data-testid={dim.testId}
                  style={{ width: "100%", backgroundColor: T.surface, border: "none", borderRadius: "8px", padding: "8px 12px", fontSize: "15px", fontWeight: 500, color: T.text, boxShadow: "0 1px 3px rgba(0,0,0,0.08)", transition: "box-shadow 0.15s" }}
                  onFocus={(e) => (e.currentTarget.style.boxShadow = "0 0 0 2px rgba(249,115,22,0.25)")}
                  onBlur={(e) => (e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.08)")}
                />
              </div>
            ))}
          </div>
          {/* A frase que faltava: qual par faz o quê. Sem ela, "Visual" e
              "Arquivo" eram dois pares de números iguais com nomes opacos. */}
          <p style={{ margin: "12px 0 0", fontSize: 11, lineHeight: 1.5, color: T.second }}>
            <strong style={{ color: TOM.alerta.text }}>ARQ.</strong> é o que a impressora recebe (com sangria) — o m² e a gráfica usam ele.{" "}
            <strong style={{ color: T.apoio }}>VIS.</strong> é o que se vê na peça montada. Digitar o VIS. preenche o ARQ. igual; ajuste o ARQ. só quando houver sangria.
          </p>
        </div>

        {/* Material | Acabamento */}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "16px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label htmlFor="item-material" style={FIELD_LABEL}>Material</label>
            {customMaterial ? (
              <input
                id="item-material"
                autoFocus
                value={formData.material}
                onChange={(e) => setFormData({ ...formData, material: e.target.value })}
                placeholder="Digite o novo material..."
                data-testid={isEdit ? "input-edit-material" : "select-material"}
                style={FIELD_INPUT}
              />
            ) : (
              <select
                id="item-material"
                value={materialOptions.includes(formData.material) ? formData.material : formData.material ? "__atual__" : ""}
                onChange={(e) => {
                  if (e.target.value === "__novo__") { setFormData({ ...formData, material: "" }); setCustomMaterial(true); return; }
                  if (e.target.value === "__atual__") return;
                  setFormData({ ...formData, material: e.target.value });
                }}
                data-testid={isEdit ? "input-edit-material" : "select-material"}
                style={{ ...FIELD_INPUT, cursor: "pointer" }}
              >
                <option value="">— selecione —</option>
                {formData.material && !materialOptions.includes(formData.material) && (
                  <option value="__atual__">{formData.material} (atual)</option>
                )}
                {materialOptions.map(m => <option key={m} value={m}>{m}</option>)}
                <option value="__novo__">+ Novo material...</option>
              </select>
            )}
            {/* O cadastro automático no catálogo só acontece no PATCH de edição. */}
            {isEdit && formData.material.trim() && !materialOptions.some(m => m.toLowerCase() === formData.material.trim().toLowerCase()) && (
              <span style={{ fontSize: "11px", fontWeight: 600, color: TOM.alerta.text, display: "flex", alignItems: "center", gap: "4px", marginTop: "2px" }}>
                <Plus style={{ width: 12, height: 12, flexShrink: 0 }} /> Novo material — será criado no catálogo ao salvar
              </span>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label htmlFor="item-finish" style={FIELD_LABEL}>Acabamento</label>
            {customFinish ? (
              <input
                id="item-finish"
                autoFocus
                value={formData.finish}
                onChange={(e) => setFormData({ ...formData, finish: e.target.value })}
                placeholder="Digite o novo acabamento..."
                data-testid={isEdit ? "input-edit-finish" : "select-finish"}
                style={FIELD_INPUT}
              />
            ) : (
              <select
                id="item-finish"
                value={finishOptions.includes(formData.finish) ? formData.finish : formData.finish ? "__atual__" : ""}
                onChange={(e) => {
                  if (e.target.value === "__novo__") { setFormData({ ...formData, finish: "" }); setCustomFinish(true); return; }
                  if (e.target.value === "__atual__") return;
                  setFormData({ ...formData, finish: e.target.value });
                }}
                data-testid={isEdit ? "input-edit-finish" : "select-finish"}
                style={{ ...FIELD_INPUT, cursor: "pointer" }}
              >
                <option value="">— selecione —</option>
                {formData.finish && !finishOptions.includes(formData.finish) && (
                  <option value="__atual__">{formData.finish} (atual)</option>
                )}
                {finishOptions.map(f => <option key={f} value={f}>{f}</option>)}
                <option value="__novo__">+ Novo acabamento...</option>
              </select>
            )}
            {isEdit && formData.finish.trim() && !finishOptions.some(f => f.toLowerCase() === formData.finish.trim().toLowerCase()) && (
              <span style={{ fontSize: "11px", fontWeight: 600, color: TOM.esmeralda.text, display: "flex", alignItems: "center", gap: "4px", marginTop: "2px" }}>
                <Plus style={{ width: 12, height: 12, flexShrink: 0 }} /> Novo acabamento — será criado no catálogo ao salvar
              </span>
            )}
          </div>
        </div>

        {/* Referência (opcional — só na edição, com Ctrl+V de print) */}
        {isEdit && (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <label style={FIELD_LABEL}>
              Referência <span style={{ color: T.second, fontWeight: 400, textTransform: "none", letterSpacing: 0, fontSize: "10px" }}>(opcional — cole um print com Ctrl+V ou anexe uma imagem, em alta qualidade)</span>
            </label>
            {(localRefPreview || formData.referenceUrl) ? (
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                {/* Thumbnail preview */}
                <div style={{ flexShrink: 0, width: 80, height: 80, borderRadius: 8, overflow: "hidden", border: `1px solid ${T.border}`, backgroundColor: N.n2 }}>
                  <img loading="lazy" decoding="async" 
                    src={localRefPreview || formData.referenceUrl}
                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                    alt="Referência visual"
                    onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                  />
                </div>
                {/* Ações */}
                <div style={{ display: "flex", flexDirection: "column", gap: 6, justifyContent: "center", paddingTop: 4 }}>
                  <ObjectUploader
                    onGetUploadParameters={getUploadUrl}
                    onFileSelect={(_file, previewUrl) => setLocalRefPreview(previewUrl)}
                    onComplete={({ url }) => { setFormData(f => ({ ...f, referenceUrl: url })); setLocalRefPreview(""); }}
                    buttonVariant="outline"
                  >
                    <Paperclip className="h-3 w-3 mr-1" /> Trocar imagem
                  </ObjectUploader>
                  <Botao
                    variante="fantasma"
                    tamanho="sm"
                    icone={X}
                    onClick={() => { setFormData(f => ({ ...f, referenceUrl: "" })); setLocalRefPreview(""); }}
                    data-testid="button-remove-reference"
                    style={{ alignSelf: "flex-start", color: TOM.perigo.text }}
                  >
                    Remover
                  </Botao>
                </div>
              </div>
            ) : (
              <ObjectUploader
                onGetUploadParameters={getUploadUrl}
                onFileSelect={(_file, previewUrl) => setLocalRefPreview(previewUrl)}
                onComplete={({ url }) => { setFormData(f => ({ ...f, referenceUrl: url })); setLocalRefPreview(""); }}
                buttonVariant="outline"
              >
                <Paperclip className="h-3.5 w-3.5 mr-1.5" /> Adicionar referência visual
              </ObjectUploader>
            )}
          </div>
        )}

        {/* Observações */}
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <label htmlFor="item-observations" style={FIELD_LABEL}>Observações Internas <span style={{ color: T.second, fontWeight: 400, textTransform: "none", letterSpacing: 0, fontSize: 10 }}>(opcional)</span></label>
          <textarea
            id="item-observations"
            value={formData.observations}
            onChange={(e) => setFormData({ ...formData, observations: e.target.value })}
            placeholder="Reforço, instruções especiais ou observações de produção..."
            rows={3}
            data-testid={isEdit ? "textarea-edit-observations" : "textarea-observations"}
            style={{ ...FIELD_INPUT, resize: "none", fontFamily: "inherit" }}
            onFocus={focusRing}
            onBlur={blurRing}
          />
        </div>

        {/* Peça PRIORITÁRIA — admin|solicitacao, na criação E na
            edição: fura a fila da Arte, que é avisada na hora. */}
        {podePriorizar && (
          <div style={{ backgroundColor: TOM.perigo.bg, borderLeft: `4px solid ${TOM.perigo.dot}`, padding: "14px 16px", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <AlertTriangle style={{ width: 20, height: 20, color: TOM.perigo.dot, flexShrink: 0 }} />
              {/* <label> ligado ao checkbox: o texto inteiro vira alvo de
                  clique (era só a caixa de 20px) e o leitor de tela lê o que
                  a caixa marca. */}
              <label htmlFor={isEdit ? "item-priority-edit" : "item-priority-create"} style={{ fontSize: "15px", fontWeight: 500, color: TOM.perigo.text, cursor: "pointer" }}>
                Peça prioritária
                <span style={{ display: "block", fontSize: "12px", color: TOM.perigo.text, fontWeight: 400 }}>Sobe para o topo da fila da Arte e avisa a equipe na hora</span>
              </label>
            </div>
            <Checkbox
              id={isEdit ? "item-priority-edit" : "item-priority-create"}
              checked={formData.isPriority}
              onCheckedChange={(checked) => setFormData({ ...formData, isPriority: !!checked })}
              data-testid="checkbox-item-priority"
              style={{ width: "20px", height: "20px", accentColor: TOM.perigo.dot }}
            />
          </div>
        )}

        {/* Pular Aprovação — apenas Admin, só na edição */}
        {isEdit && isAdmin && (
          <div style={{ backgroundColor: TOM.alerta.bg, borderLeft: `4px solid ${TOM.alerta.dot}`, padding: "14px 16px", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <AlertTriangle style={{ width: 20, height: 20, color: TOM.alerta.text, flexShrink: 0 }} />
              <label htmlFor="skip-approval-edit" style={{ fontSize: "15px", fontWeight: 500, color: TOM.alerta.text, cursor: "pointer" }}>Pular aprovação técnica <span style={{ fontSize: "13px", color: TOM.alerta.text }}>(Apenas Administrativo)</span></label>
            </div>
            <Checkbox
              id="skip-approval-edit"
              checked={formData.skipApproval}
              onCheckedChange={(checked) => setFormData({ ...formData, skipApproval: !!checked })}
              data-testid="checkbox-skip-approval"
              style={{ width: "20px", height: "20px", accentColor: TOM.alerta.text }}
            />
          </div>
        )}
      </div>

      {/* Rodapé — o primário é o preto da casa nos dois modos (era #c2410c
          só aqui); carregando trava o duplo clique que criava peça repetida. */}
      <ModalFooter>
        <Botao
          type="submit"
          variante="primario"
          tamanho="toque"
          larguraCheia
          carregando={isPending}
          icone={isEdit ? Check : Plus}
          data-testid={isEdit ? "button-save-edit" : "button-submit-item"}
        >
          {isEdit
            ? (isPending ? "Salvando..." : "Salvar Alterações")
            : (isPending ? "Adicionando..." : "Adicionar Peça")}
        </Botao>
        <Botao
          variante="fantasma"
          larguraCheia
          onClick={onCancel}
          data-testid={isEdit ? "button-cancel-edit" : "button-cancel-item"}
        >
          Cancelar
        </Botao>
      </ModalFooter>
    </form>
  );
}
