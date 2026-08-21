import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { StatusBadge } from "@/components/status-badge";
import { faseDaArte } from "@/components/prazos/tokens";
import { getStatusLabel, getStatusMeta, FINAL_STATUSES, PRODUCTION_STATUSES, motivoEventoFinalizado, todayBusinessMs } from "@/lib/status";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, ArrowLeft, Calendar, Truck, AlertCircle, List, Package, Package2, Pencil, Trash2, Check, Building2, Loader2, User, History, Lock, Unlock, Paperclip, ExternalLink, X, RotateCcw, Recycle, Upload, Copy, ChevronDown, CheckCircle2, AlertTriangle, FileSpreadsheet, Search } from "lucide-react";
import { Fragment, useState, useEffect, useMemo, useRef } from "react";
import type { Sponsor, Item, Event as EventRecord } from "@shared/schema";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { BulkItemEntry } from "@/components/bulk-item-entry";
import { ObjectUploader } from "@/components/ObjectUploader";
import { useAuth } from "@/contexts/auth-context";
import { parseDateLocal } from "@/lib/utils";
import { calculateM2 } from "@/lib/calculateM2";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ItemDetailsDialog } from "@/components/item-details-dialog";
import { ImportXlsxDialog, ImportPreviewRow } from "@/components/import-xlsx-dialog";
import { CloneItemsDialog } from "@/components/clone-items-dialog";
import { useEventImport, useEventClone } from "@/hooks/use-event-import";
import { useEventReference } from "@/hooks/use-event-reference";
import { useEventItemFlags } from "@/hooks/use-event-item-flags";
import { useIsMobile } from "@/hooks/use-mobile";
import { ModalHeader, ModalFooter, modalSurface, HIDE_NATIVE_CLOSE, FreezeWhileClosing } from "@/components/modal-shell";
import { reductionFloorOf } from "@/lib/saldo";
import {
  AumentarQuantidadeDialog,
  AumentarQuantidadeButton,
  ComplementoDaFicha,
  temBlocoDeComplemento,
  podeAumentarQuantidade,
  podeMexerNaQuantidade,
  entrouEmProducao,
  parseApiError,
} from "@/components/aumentar-quantidade-dialog";
import { compareDisplayId } from "@/lib/displayId";

const itemTypes = ["2x1", "Arena", "Halter", "Palco", "Painel Rosto", "Percurso", "Pórtico", "Prismas", "Qd Fotos", "Rolo", "Stand", "Testeiras", "WindBanner"];
const materials = ["Adesivo", "Lona", "Madeira", "Sanett", "Tecido", "Tecido Pet"];
const finishes = ["Dupla Face", "Ilhós", "Impressão UV", "Impresso", "Recorte", "Refile"];

// Estado limpo do formulário de peça — antes o mesmo objeto de 14 campos era
// repetido em 3 lugares (useState inicial, reset pós-criação e fechamento),
// e qualquer campo novo tinha de ser adicionado três vezes.
const EMPTY_ITEM_FORM = {
  type: "",
  description: "",
  quantity: 1,
  visualWidth: "",
  visualHeight: "",
  fileWidth: "",
  fileHeight: "",
  material: "",
  finish: "",
  measurement: "",
  observations: "",
  skipApproval: false,
  isReuse: false,
  referenceUrl: "",
};

type ItemFormData = typeof EMPTY_ITEM_FORM;

// Tipografia e controles do formulário de peça — a MESMA cara nos dois fluxos.
const FIELD_LABEL: React.CSSProperties = { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#746e69" };
const FIELD_INPUT: React.CSSProperties = { width: "100%", backgroundColor: "#f3f4f3", border: "none", borderRadius: 8, padding: "12px 16px", fontSize: 15, fontWeight: 500, color: "#1a1c1c", transition: "box-shadow 0.15s" };

interface ItemFormProps {
  mode: "create" | "edit";
  formData: ItemFormData;
  setFormData: React.Dispatch<React.SetStateAction<ItemFormData>>;
  standardItems: any[];
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
  /** Peça já em produção: sobe por complemento, desce até o piso físico. */
  quantityLocked?: boolean;
  /** Piso físico: já produzido+reuso / conferido / entregue — o que for maior. */
  quantityFloor?: number;
  /** Teto da edição direta: a quantidade contratada hoje. Acima disso, complemento. */
  quantityCeiling?: number;
  /** Fecha o form e abre o modal de complemento (só existe com quantityLocked). */
  onAumentarQuantidade?: () => void;
}

// Formulário de peça unificado. Antes eram DUAS implementações independentes
// da mesma entidade: o modo simples do "Adicionar Peça" (Popover+Command,
// primário #1c1917) e o "Editar Peça" (selects nativos, primário #c2410c) —
// a mesma peça tinha duas caras. A versão do EDITAR (revisada e aprovada pelo
// dono) virou a base; o `mode` controla só as diferenças de negócio:
// create = tipo/qtd/descrição/dimensões/material/acabamento; edit soma
// Reaproveitamento, Referência (Ctrl+V) e Pular Aprovação.
function ItemForm({
  mode, formData, setFormData, standardItems, typeOptions, materialOptions,
  finishOptions, customMaterial, setCustomMaterial, customFinish,
  setCustomFinish, isMobile, isAdmin, isPending, onSubmit, onCancel,
  localRefPreview, setLocalRefPreview, getUploadUrl,
  quantityLocked = false, quantityFloor = 0, quantityCeiling = Number.MAX_SAFE_INTEGER,
  onAumentarQuantidade,
}: ItemFormProps) {
  const isEdit = mode === "edit";
  // "Digitar novo tipo" só existe no criar — no editar o tipo já é texto livre.
  const [customType, setCustomType] = useState(false);
  const focusRing = (e: React.FocusEvent<HTMLElement>) => ((e.currentTarget as HTMLElement).style.boxShadow = "0 0 0 2px rgba(249,115,22,0.25)");
  const blurRing = (e: React.FocusEvent<HTMLElement>) => ((e.currentTarget as HTMLElement).style.boxShadow = "none");

  const typeKnown = standardItems.some((s: any) => s.name === formData.type) || typeOptions.includes(formData.type);

  return (
    <form onSubmit={onSubmit} style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0 }}>
      <div className="scrollbar-visible" style={{ flex: 1, overflowY: "auto", padding: "28px", display: "flex", flexDirection: "column", gap: 24 }}>

        {/* Linha 1: Tipo (3fr) | Qtd. (1fr) | M2 Total (1fr) */}
        <div style={{ display: "grid", gridTemplateColumns: "3fr 1fr 1fr", gap: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
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
                  onBlur={blurRing}
                />
                {/* Caminho de volta: sem ele, quem clicava em "+ Novo tipo..."
                    por engano ficava preso no modo texto livre. */}
                <button
                  type="button"
                  onClick={() => { setFormData({ ...formData, type: "" }); setCustomType(false); }}
                  data-testid="button-back-to-type-list"
                  style={{ alignSelf: "flex-start", background: "none", border: "none", padding: 0, fontSize: 11, fontWeight: 700, color: "#c2410c", cursor: "pointer" }}
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
                  if (v === "__novo__") { setFormData({ ...formData, type: "" }); setCustomType(true); return; }
                  if (v === "__atual__") return;
                  const model = standardItems.find((s: any) => s.name === v);
                  if (model) {
                    // Selecionar um Modelo pré-preenche dimensões/material/
                    // acabamento — mesmo comportamento do Popover antigo.
                    setFormData({
                      ...formData,
                      type: model.name,
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
                  setFormData({ ...formData, type: v });
                }}
                data-testid="select-item-type"
                style={{ ...FIELD_INPUT, cursor: "pointer" }}
              >
                <option value="">— selecione —</option>
                {formData.type && !typeKnown && <option value="__atual__">{formData.type} (atual)</option>}
                {standardItems.length > 0 && (
                  <optgroup label="Modelos">
                    {standardItems.map((s: any) => <option key={s.id} value={s.name}>{s.name}</option>)}
                  </optgroup>
                )}
                <optgroup label="Outros Tipos">
                  {typeOptions.filter(t => !standardItems.some((s: any) => s.name === t)).map(t => <option key={t} value={t}>{t}</option>)}
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
                ? `Em produção: dá para reduzir até ${quantityFloor} (já produzidas/conferidas/entregues). Para aumentar, use o complemento.`
                : undefined}
              data-testid={isEdit ? "input-edit-quantity" : "input-quantity"}
              style={FIELD_INPUT}
              onFocus={focusRing}
              onBlur={blurRing}
            />
            {quantityLocked && (
              <>
                <p id="item-quantity-hint" style={{ margin: 0, fontSize: 10, lineHeight: 1.4, color: "#746e69" }}>
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
              style={{ ...FIELD_INPUT, fontWeight: 700, color: formData.fileWidth && formData.fileHeight ? "#f97316" : "#746e69", cursor: "default" }}
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
              backgroundColor: formData.isReuse ? "#047857" : "#f3f4f3",
              border: `2px solid ${formData.isReuse ? "#047857" : "#e5e7eb"}`,
              padding: "14px 18px", borderRadius: "12px",
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px",
              cursor: "pointer", transition: "all 0.15s",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <div style={{ backgroundColor: formData.isReuse ? "rgba(255,255,255,0.2)" : "#e5e7eb", borderRadius: "8px", padding: "8px", flexShrink: 0 }}>
                <RotateCcw style={{ width: 18, height: 18, color: formData.isReuse ? "#ffffff" : "#6b7280" }} />
              </div>
              <div>
                <p style={{ fontSize: "15px", fontWeight: 700, color: formData.isReuse ? "#ffffff" : "#374151", margin: 0 }}>Reaproveitamento</p>
                <p style={{ fontSize: "12px", color: formData.isReuse ? "#ffffff" : "#9ca3af", margin: 0 }}>Gráfica entrega direto — sem etapa de produção</p>
              </div>
            </div>
            <Checkbox
              checked={formData.isReuse}
              onCheckedChange={(checked) => setFormData({ ...formData, isReuse: !!checked })}
              data-testid="checkbox-is-reuse"
              style={{ width: "20px", height: "20px", accentColor: "#ffffff", pointerEvents: "none", flexShrink: 0 }}
            />
          </div>
        )}

        {/* Descrição */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label htmlFor="item-description" style={FIELD_LABEL}>Descrição do Item <span style={{ color: "#746e69", fontWeight: 400, textTransform: "none", letterSpacing: 0, fontSize: 10 }}>(opcional)</span></label>
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
            <span style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: "#f97316", display: "inline-block", flexShrink: 0 }}></span>
            Dimensões de Produção
          </div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr 1fr", gap: "12px" }}>
            {[
              { label: "Visual Larg.", key: "visualWidth", orange: true, testId: isEdit ? "input-edit-visual-width" : "input-visual-width" },
              { label: "Visual Alt.", key: "visualHeight", orange: true, testId: isEdit ? "input-edit-visual-height" : "input-visual-height" },
              { label: "Arquivo Larg.", key: "fileWidth", orange: false, testId: isEdit ? "input-edit-file-width" : "input-file-width" },
              { label: "Arquivo Alt.", key: "fileHeight", orange: false, testId: isEdit ? "input-edit-file-height" : "input-file-height" },
            ].map((dim) => (
              <div key={dim.key} style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <label htmlFor={`item-${dim.key}`} style={{ fontSize: 11, fontWeight: 700, color: "#746e69", display: "flex", alignItems: "center", gap: "5px" }}>
                  <span style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: dim.orange ? "#f97316" : "#a8a29e", display: "inline-block", flexShrink: 0 }}></span>
                  {dim.label}
                </label>
                <input
                  id={`item-${dim.key}`}
                  type="number"
                  step="0.01"
                  min="0"
                  required={!isEdit}
                  value={(formData as any)[dim.key]}
                  onChange={(e) => setFormData({ ...formData, [dim.key]: e.target.value })}
                  placeholder="0.00"
                  data-testid={dim.testId}
                  style={{ width: "100%", backgroundColor: "#ffffff", border: "none", borderRadius: "8px", padding: "8px 12px", fontSize: "15px", fontWeight: 500, color: "#1a1c1c", boxShadow: "0 1px 3px rgba(0,0,0,0.08)", transition: "box-shadow 0.15s" }}
                  onFocus={(e) => (e.currentTarget.style.boxShadow = "0 0 0 2px rgba(249,115,22,0.25)")}
                  onBlur={(e) => (e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.08)")}
                />
              </div>
            ))}
          </div>
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
              <span style={{ fontSize: "11px", fontWeight: 600, color: "#b45309", display: "flex", alignItems: "center", gap: "4px", marginTop: "2px" }}>
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
              <span style={{ fontSize: "11px", fontWeight: 600, color: "#065f46", display: "flex", alignItems: "center", gap: "4px", marginTop: "2px" }}>
                <Plus style={{ width: 12, height: 12, flexShrink: 0 }} /> Novo acabamento — será criado no catálogo ao salvar
              </span>
            )}
          </div>
        </div>

        {/* Referência (opcional — só na edição, com Ctrl+V de print) */}
        {isEdit && (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <label style={FIELD_LABEL}>
              Referência <span style={{ color: "#746e69", fontWeight: 400, textTransform: "none", letterSpacing: 0, fontSize: "10px" }}>(opcional — cole um print com Ctrl+V ou anexe uma imagem, em alta qualidade)</span>
            </label>
            {(localRefPreview || formData.referenceUrl) ? (
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                {/* Thumbnail preview */}
                <div style={{ flexShrink: 0, width: 80, height: 80, borderRadius: 8, overflow: "hidden", border: "1px solid #e7e5e4", backgroundColor: "#f5f5f4" }}>
                  <img
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
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-destructive justify-start px-2"
                    onClick={() => { setFormData(f => ({ ...f, referenceUrl: "" })); setLocalRefPreview(""); }}
                    data-testid="button-remove-reference"
                  >
                    <X className="h-3 w-3 mr-1" /> Remover
                  </Button>
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
          <label htmlFor="item-observations" style={FIELD_LABEL}>Observações Internas <span style={{ color: "#746e69", fontWeight: 400, textTransform: "none", letterSpacing: 0, fontSize: 10 }}>(opcional)</span></label>
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

        {/* Pular Aprovação — apenas Admin, só na edição */}
        {isEdit && isAdmin && (
          <div style={{ backgroundColor: "#fffbeb", borderLeft: "4px solid #fbbf24", padding: "14px 16px", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <AlertTriangle style={{ width: 20, height: 20, color: "#d97706", flexShrink: 0 }} />
              <p style={{ fontSize: "15px", fontWeight: 500, color: "#92400e" }}>Pular aprovação técnica <span style={{ fontSize: "13px", color: "#b45309" }}>(Apenas Administrativo)</span></p>
            </div>
            <Checkbox
              id="skip-approval-edit"
              checked={formData.skipApproval}
              onCheckedChange={(checked) => setFormData({ ...formData, skipApproval: !!checked })}
              data-testid="checkbox-skip-approval"
              style={{ width: "20px", height: "20px", accentColor: "#d97706" }}
            />
          </div>
        )}
      </div>

      {/* Rodapé — primário ÚNICO #c2410c nos dois modos */}
      <ModalFooter>
        <button
          type="submit"
          disabled={isPending}
          data-testid={isEdit ? "button-save-edit" : "button-submit-item"}
          style={{ width: "100%", height: 44, borderRadius: 8, border: "none", backgroundColor: "#c2410c", color: "#fff", fontSize: 13, fontWeight: 800, cursor: isPending ? "wait" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: isPending ? 0.7 : 1, transition: "background-color 0.15s" }}
          onMouseEnter={(e) => { if (!isPending) e.currentTarget.style.backgroundColor = "#9a3412"; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "#c2410c"; }}
        >
          {isEdit ? <Check style={{ width: 15, height: 15 }} /> : <Plus style={{ width: 15, height: 15 }} />}
          {isEdit
            ? (isPending ? "Salvando..." : "Salvar Alterações")
            : (isPending ? "Adicionando..." : "Adicionar Peça")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          data-testid={isEdit ? "button-cancel-edit" : "button-cancel-item"}
          style={{ width: "100%", height: 36, borderRadius: 8, border: "none", background: "none", fontSize: 13, fontWeight: 600, color: "#746e69", cursor: "pointer" }}
        >
          Cancelar
        </button>
      </ModalFooter>
    </form>
  );
}

export default function EventDetail() {
  const { hasPermission, user } = useAuth();
  const [, params] = useRoute("/eventos/:id");
  const eventId = params?.id;
  const [open, setOpen] = useState(false);
  const [localRefPreview, setLocalRefPreview] = useState<string>("");
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [bulkMode, setBulkMode] = useState(true);
  const [editingItem, setEditingItem] = useState<any>(null);
  // Controle do grid de adição em lote: tick avisa o grid que salvou (para ele
  // soltar as linhas gravadas) e o ref guarda quantas linhas ficaram incompletas.
  const [bulkSavedTick, setBulkSavedTick] = useState(0);
  const bulkLeftoverRef = useRef(0);
  // Objeto inteiro (não só o id): o diálogo de confirmação escreve QUAL peça
  // vai ser excluída — com só o id, a mensagem era genérica.
  const [deletingItem, setDeletingItem] = useState<any | null>(null);
  const [selectedItemForDetails, setSelectedItemForDetails] = useState<any | null>(null);
  // Complemento (aumento de quantidade pós-produção): a peça-mãe em foco e,
  // quando o pedido veio de uma edição barrada pelo servidor, a diferença já
  // calculada por ele (409 USE_COMPLEMENT → suggestedComplement).
  const [complementItem, setComplementItem] = useState<any | null>(null);
  const [complementSugestao, setComplementSugestao] = useState<number | null>(null);
  const abrirComplemento = (item: any, sugestao?: number | null) => {
    setComplementSugestao(sugestao ?? null);
    setComplementItem(item);
  };
  const [itemSearch, setItemSearch] = useState("");
  const [showAllItems, setShowAllItems] = useState(false);
  const [showAllDrafts, setShowAllDrafts] = useState(false);
  // Filtro por status via chips do cabeçalho — compõe com a busca textual.
  const [statusFilter, setStatusFilter] = useState<string[]>([]);

  // Deep-link ?item=<id>: usado pelo clique na notificação — navega até este
  // evento e abre direto o dialog da peça. O parâmetro é consumido uma única
  // vez (replaceState) para não reabrir o dialog a cada re-render/refresh.
  const pendingDeepLinkItem = useRef<string | null>(
    new URLSearchParams(window.location.search).get("item"),
  );
  // Edição de Material/Acabamento: o <datalist> nativo filtra pelas letras já
  // digitadas — na edição, o campo vem preenchido e o dropdown mostrava SÓ o
  // valor atual, escondendo as demais opções. Trocado por <select> com todas
  // as opções + modo "digitar novo" (flags abaixo) para manter a criação no
  // catálogo ao salvar.
  const [customMaterial, setCustomMaterial] = useState(false);
  const [customFinish, setCustomFinish] = useState(false);
  const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false);
  const isMobile = useIsMobile();
  const { toast } = useToast();

  const [formData, setFormData] = useState({ ...EMPTY_ITEM_FORM });

  // Tipagem leve: os payloads vêm enriquecidos (displayId, sponsors, deadlines)
  // além das colunas do schema — a interseção mantém autocomplete sem brigar
  // com os campos extras.
  const { data: event, isLoading: loadingEvent, isError: eventError, refetch: refetchEvent } = useQuery<EventRecord & Record<string, any>>({
    queryKey: ["/api/events", eventId],
    enabled: !!eventId,
    placeholderData: (previousData: any) => previousData,
    refetchOnWindowFocus: false,
  });

  const { data: rawItems = [], isLoading: loadingItems, isFetching, isError: itemsError, refetch: refetchItems } = useQuery<(Item & Record<string, any>)[]>({
    queryKey: ["/api/items", eventId],
    enabled: !!eventId,
    placeholderData: (previousData) => previousData,
    refetchOnWindowFocus: false,
  });

  // Ordenar itens por displayId (grupo é tratado pelo groupMap; dentro de cada tipo, ordem pelo id)
  // Consome o deep-link ?item= assim que a query resolve (ver pendingDeepLinkItem).
  // Consumir também com lista VAZIA: antes o ?item= ficava preso na URL de um
  // evento sem peças e reabria o dialog num refresh futuro.
  useEffect(() => {
    if (!pendingDeepLinkItem.current || loadingItems) return;
    const target = rawItems.find((i: any) => i.id === pendingDeepLinkItem.current);
    pendingDeepLinkItem.current = null;
    window.history.replaceState(null, "", window.location.pathname);
    if (target) setSelectedItemForDetails(target);
  }, [rawItems, loadingItems]);

  // Ordenação por displayId ciente de COMPLEMENTO: "#0062-C1" com o
  // replace(/\D/g,'') de antes virava 621 e a peça-filha aparecia centenas de
  // linhas longe da mãe — exatamente a duplicidade confusa que o modelo de
  // complemento existe para evitar. Base primeiro, sufixo -C depois:
  // #0062 < #0062-C1 < #0062-C2 < #0063.
  // Fonte única em lib/displayId.ts — o mesmo comparador da Gráfica, do Painel
  // Geral, da Arte e do Vincular (e espelho de server/storage.ts).
  const items = useMemo(
    () => [...rawItems].sort((a, b) => compareDisplayId(a.displayId, b.displayId)),
    [rawItems],
  );

  // Rascunhos vivem SÓ no card "Peças em Rascunho"; a listagem principal fica
  // com o restante. Antes o mesmo item aparecia nos dois lugares ao mesmo tempo.
  const draftItems = useMemo(
    () => items.filter(i => i.status === 'draft' || i.status === 'requested'),
    [items],
  );
  const mainItems = useMemo(
    () => items.filter(i => i.status !== 'draft' && i.status !== 'requested'),
    [items],
  );

  // Chips de status do cabeçalho: contagem por status presente + m² total.
  // Derivados de mainItems (não de items): o filtro por chip roda sobre
  // mainItems — chips de rascunho/solicitado filtravam o nada (lista vazia).
  // Os rascunhos já têm o card próprio logo abaixo.
  const statusChips = useMemo(() => {
    const counts = new Map<string, number>();
    mainItems.forEach(i => counts.set(i.status, (counts.get(i.status) || 0) + 1));
    return Array.from(counts.entries());
  }, [mainItems]);
  const totalM2 = useMemo(
    () => items.reduce((acc, i) => acc + (parseFloat(String(i.calculatedM2 ?? '0')) || 0), 0),
    [items],
  );
  // Quantas das peças listadas são complemento (aumento pós-produção). O m²
  // total não precisa de tratamento: as duas linhas somam sozinhas.
  const complementCount = useMemo(
    () => items.filter((i: any) => !!i.parentItemId).length,
    [items],
  );

  const { data: standardItems = [] } = useQuery<any[]>({
    queryKey: ["/api/standard-items"],
    placeholderData: (previousData: any) => previousData,
    refetchOnWindowFocus: false,
  });

  const { data: catalogOptions = [] } = useQuery<{ kind: string; value: string }[]>({
    queryKey: ["/api/catalog-options"],
  });

  const createCatalogOptionMutation = useMutation({
    mutationFn: async ({ kind, value }: { kind: string; value: string }) =>
      await apiRequest("POST", "/api/catalog-options", { kind, value }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/catalog-options"] }),
  });

  // Buscar patrocinadores vinculados ao evento
  const { data: eventSponsors = [] } = useQuery<any[]>({
    queryKey: ["/api/events", eventId, "sponsors"],
    enabled: !!eventId,
    placeholderData: (previousData: any) => previousData,
    refetchOnWindowFocus: false,
  });

  // Buscar todos os patrocinadores para obter os detalhes
  const { data: allSponsors = [] } = useQuery<Sponsor[]>({
    queryKey: ["/api/sponsors"],
    placeholderData: (previousData: any) => previousData,
    refetchOnWindowFocus: false,
  });

  // Filtrar apenas os patrocinadores vinculados ao evento
  const sponsors = allSponsors.filter(sponsor => 
    eventSponsors.some(es => es.sponsorId === sponsor.id)
  );

  // Cotas configuradas para este evento (usadas na sugestão de patrocinador na importação)
  const { data: eventQuotaRules = [] } = useQuery<any[]>({
    queryKey: ["/api/events", eventId, "quota-rules"],
    queryFn: () => fetch(`/api/events/${eventId}/quota-rules`).then(r => r.json()),
    enabled: !!eventId,
  });

  // Lista enriquecida: eventSponsors + nome do patrocinador (para sugestão na importação)
  const eventSponsorsList = eventSponsors.map((es: any) => ({
    sponsorId: es.sponsorId,
    quota: es.quota,
    name: allSponsors.find((s: any) => s.id === es.sponsorId)?.name ?? '',
  })).filter(es => es.name);

  // Estado e mutations de importação de Excel (extraído para @/hooks/use-event-import)
  const {
    importDialogOpen,
    setImportDialogOpen,
    importFile,
    setImportFile,
    importPreview,
    setImportPreview,
    importPreviewItems,
    setImportPreviewItems,
    importFileName,
    importSearch,
    setImportSearch,
    previewXlsxMutation,
    confirmImportMutation,
  } = useEventImport({ eventId, eventSponsorsList, eventQuotaRules });

  // Estado e mutation de clonagem de itens entre eventos (extraído para @/hooks/use-event-import)
  const {
    cloneDialogOpen,
    setCloneDialogOpen,
    cloneSourceId,
    setCloneSourceId,
    cloneItemsMutation,
  } = useEventClone({ eventId });

  // Buscar todos os eventos (para seletor de clone) — só quando o dialog de
  // clonagem abre; antes a lista inteira era baixada em toda visita à página.
  const { data: allEvents = [], isLoading: loadingAllEvents } = useQuery<any[]>({
    queryKey: ["/api/events"],
    enabled: cloneDialogOpen,
    placeholderData: (previousData: any) => previousData,
    refetchOnWindowFocus: false,
  });

  // Buscar audit logs para histórico
  // Audit log SÓ da peça aberta no modal, sob demanda — antes baixava a tabela
  // inteira de auditoria no load da página (mesmo passivo já removido do
  // Painel Geral; o modal filtra por entityId internamente).
  const { data: auditLogs = [] } = useQuery<any[]>({
    queryKey: ["/api/audit-logs", "item", selectedItemForDetails?.id],
    queryFn: () =>
      fetch(`/api/audit-logs?entityType=item&entityId=${selectedItemForDetails!.id}`, { credentials: "include" })
        .then(r => r.json()),
    enabled: !!selectedItemForDetails?.id,
    placeholderData: (previousData: any) => previousData,
    refetchOnWindowFocus: false,
  });

  // Helper para formatar data/hora
  const formatDateTime = (date: string | Date) => {
    return format(new Date(date), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
  };

  // Helper para filtrar logs de um item específico
  const getItemLogs = (itemId: string) => {
    return auditLogs
      .filter((log: any) => log.entityType === 'item' && log.entityId === itemId)
      .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  };

  // ── Evento FINALIZADO: encerrado à mão OU já realizado ────────────────────
  // Esta tela mostra as peças do evento finalizado DE PROPÓSITO (registro não
  // perde o passado) — e era exatamente por isso que a ação continuava
  // acontecendo aqui depois de o servidor passar a recusá-la. Um botão que só
  // existe para devolver 409 é pior do que um botão desabilitado: gasta o
  // clique, some com o trabalho digitado e não explica nada.
  //
  // O CRITÉRIO é o mesmo do servidor (server/routes/items.ts): desabilita o
  // que faz o trabalho ANDAR (adicionar, importar, clonar, editar, enviar,
  // marcar reaproveitamento, mexer na referência); mantém o que ARRUMA A CASA
  // (excluir peça) e o que só lê (exportar).
  //
  // Fica ANTES de canUploadReference/canEditLists porque os dois já dependem
  // dele — em JS, `const` não sobe.
  const motivoEventoFim = useMemo(
    () => motivoEventoFinalizado(event ?? null, todayBusinessMs()),
    [event],
  );
  const eventoFinalizado = motivoEventoFim !== null;
  /** A frase do botão travado — a mesma distinção das duas origens. */
  const avisoEventoFim = motivoEventoFim === "encerrado"
    ? "Evento encerrado — reabra o evento para mexer nas peças dele."
    : "Este evento já aconteceu — não é possível mexer nas peças dele.";

  // Solicitação ou admin podem adicionar referência
  // Anexar/trocar/remover referência visual é PATCH /api/items/:id — a mesma
  // rota que o servidor passou a recusar em evento finalizado. Sem `&&
  // !eventoFinalizado` o clipe continuaria convidando a subir um arquivo que
  // seria descartado no 409 depois do upload inteiro.
  const canUploadReference = (hasPermission("admin") || user?.role === "solicitacao") && !eventoFinalizado;

  // Quem cria a lista (solicitação, admin ou criador do evento) sempre pode
  // editar uma peça, mesmo depois que ela entra em produção/entrega.
  const canEditLists = hasPermission("admin") || user?.role === "solicitacao" || !!(event && user && event.createdBy === user.id);
  // Mexer na QUANTIDADE de peça já produzida (complemento e redução até o piso)
  // é mais restrito que editar a lista: só solicitacao e admin, espelhando
  // podeMudarQuantidade em server/routes/items.ts. Quem criou o evento com
  // outro papel continua editando a lista, mas não mexe em contrato de peça
  // que já virou material físico.
  const podeMexerQtd = podeMexerNaQuantidade(user?.role);

  // ── Encerramento manual do evento ─────────────────────────────────────────
  // `manuallyClosed` vem de enrichEvent; o fallback lê a coluna crua ("closed")
  // para o caso do Express antigo respondendo sem o campo novo.
  const isEventClosed = !!event && (event.manuallyClosed === true || event.status === 'closed');
  // Mesmo gate do servidor (POST /api/events/:id/close|reopen): encerrar tira
  // trabalho da vista de outras equipes, então é decisão de admin — a mesma
  // classe da exclusão, não a da edição.
  const canCloseEvent = user?.role === 'admin';

  // Quem encerrou e quando: a resposta mora no audit log (o encerramento não
  // tem coluna própria, de propósito — ver server/routes/shared.ts). Consulta
  // com ESCOPO e só quando o evento está encerrado; sem isto o banner diria
  // "encerrado" sem dizer por quem, que é metade da segurança da ação.
  const { data: eventAuditLogs = [] } = useQuery<any[]>({
    queryKey: ["/api/audit-logs", "event", eventId],
    queryFn: () =>
      fetch(`/api/audit-logs?entityType=event&entityId=${eventId}`, { credentials: "include" })
        .then(r => r.json()),
    enabled: !!eventId && isEventClosed,
    placeholderData: (previousData: any) => previousData,
    refetchOnWindowFocus: false,
  });
  const closureLog = useMemo(
    () => (Array.isArray(eventAuditLogs) ? eventAuditLogs : [])
      .filter((l: any) => typeof l?.details === 'string' && l.details.includes('ENCERRADO manualmente'))
      .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0],
    [eventAuditLogs],
  );

  // Peças que ficaram para trás — o número que a confirmação precisa dizer.
  const openWork = useMemo(() => {
    const OUT = new Set(['canceled', 'deleted', 'archived']);
    const DONE = new Set(['delivered', 'entregue']);
    const PROD = new Set(['inProduction', 'em_producao']);
    let ativas = 0, entregues = 0, emProducao = 0;
    for (const it of items) {
      if (OUT.has(it.status)) continue;
      ativas += 1;
      if (DONE.has(it.status)) entregues += 1;
      else if (PROD.has(it.status)) emProducao += 1;
    }
    return { ativas, entregues, emProducao, abertas: ativas - entregues };
  }, [items]);

  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [reopenDialogOpen, setReopenDialogOpen] = useState(false);

  const closeEventMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/events/${eventId}/close`);
      return await res.json() as { openCount?: number };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/events", eventId] });
      queryClient.invalidateQueries({ queryKey: ["/api/prazos"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs", "event", eventId] });
      // As filas de trabalho leem `item.event.status` do payload de PEÇAS —
      // sem estas três, a aba de Arte/Gráfica já aberta continuaria mostrando
      // o evento encerrado (essas chaves rodam com staleTime Infinity).
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items/approved"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items/resubmission-needed"] });
      setCloseDialogOpen(false);
      const abertas = data?.openCount ?? 0;
      toast({
        title: "Evento encerrado",
        description: abertas > 0
          ? `${abertas} ${abertas === 1 ? 'peça continua' : 'peças continuam'} na lista, sem ser ${abertas === 1 ? 'cobrada' : 'cobradas'} na Gestão de Prazos. Você pode reabrir a qualquer momento.`
          : "Saiu da Gestão de Prazos e das filas de trabalho. Você pode reabrir a qualquer momento.",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao encerrar evento", description: error.message, variant: "destructive" });
    },
  });

  const reopenEventMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/events/${eventId}/reopen`);
      return await res.json() as { openCount?: number };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/events", eventId] });
      queryClient.invalidateQueries({ queryKey: ["/api/prazos"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs", "event", eventId] });
      // Mesmas três do encerrar: é o que devolve as peças às filas na hora.
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items/approved"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items/resubmission-needed"] });
      setReopenDialogOpen(false);
      toast({
        title: "Evento reaberto",
        description: "Voltou para a Gestão de Prazos e para as filas de trabalho.",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao reabrir evento", description: error.message, variant: "destructive" });
    },
  });

  const getUploadUrl = async () => {
    const response = await apiRequest("POST", "/api/objects/upload", {});
    const data = await response.json();
    return { method: "PUT" as const, url: data.uploadURL };
  };

  // Ctrl+V: colar um print direto na referência ao editar a peça. Envia o
  // arquivo original, sem compressão, mantendo a qualidade da imagem.
  useEffect(() => {
    if (!editDialogOpen) return;
    const handler = async (e: ClipboardEvent) => {
      const imgItem = Array.from(e.clipboardData?.items || []).find(i => i.type.startsWith("image/"));
      if (!imgItem) return;
      const file = imgItem.getAsFile();
      if (!file) return;
      e.preventDefault();
      const reader = new FileReader();
      reader.onload = ev => setLocalRefPreview(ev.target?.result as string);
      reader.readAsDataURL(file);
      try {
        // Upload via servidor: o PUT direto no storage.googleapis.com é
        // bloqueado em redes corporativas ("Failed to fetch").
        const put = await fetch("/api/objects/upload-direct", { method: "PUT", body: file, headers: { "Content-Type": file.type || "application/octet-stream" } });
        if (!put.ok) throw new Error("upload falhou");
        const { url: objectUrl } = await put.json() as { url: string };
        setFormData(f => ({ ...f, referenceUrl: objectUrl }));
        setLocalRefPreview("");
        toast({ title: "Print anexado", description: "Imagem colada como referência em alta qualidade." });
      } catch {
        setLocalRefPreview("");
        toast({ title: "Erro ao colar imagem", description: "Não foi possível anexar o print.", variant: "destructive" });
      }
    };
    window.addEventListener("paste", handler);
    return () => window.removeEventListener("paste", handler);
  }, [editDialogOpen]);

  const { updateReferenceUrlMutation, removeReferenceUrlMutation } = useEventReference({ eventId });

  const createItemMutation = useMutation({
    mutationFn: async (data: any) => {
      const fileWidth = parseFloat(data.fileWidth);
      const fileHeight = parseFloat(data.fileHeight);
      
      const calculatedM2 = calculateM2(
        data.quantity,
        fileWidth,
        fileHeight
      ).toFixed(2);
      
      const itemData: any = {
        ...data,
        eventId,
        area: parseFloat(data.visualWidth),
        visual: parseFloat(data.visualHeight),
        calculatedM2,
        measurement: data.measurement || `${fileWidth} × ${fileHeight}`,
        skipApproval: data.skipApproval || false,
        isReuse: data.isReuse || false,
      };

      // Criar item
      const response = await apiRequest("POST", "/api/items", itemData);
      const createdItem = await response.json();
      
      return createdItem;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items", eventId] });
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      setOpen(false);
      setFormData({ ...EMPTY_ITEM_FORM });
      toast({
        title: "Peça adicionada",
        description: "A peça foi adicionada ao evento",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao adicionar peça",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const createBulkItemsMutation = useMutation({
    mutationFn: async (items: any[]) => {
      const response = await apiRequest("POST", "/api/items/bulk", { items });
      return await response.json();
    },
    onMutate: async (newItems: any[]) => {
      // Cancelar queries pendentes para evitar sobrescrever nosso optimistic update
      await queryClient.cancelQueries({ queryKey: ["/api/items", eventId] });
      
      // Snapshot dos dados atuais (para rollback em caso de erro)
      const previousItems = queryClient.getQueryData(["/api/items", eventId]);
      
      // Optimistically update: adicionar os novos itens IMEDIATAMENTE no cache
      queryClient.setQueryData(["/api/items", eventId], (old: any[] = []) => {
        const itemsWithIds = newItems.map(item => ({
          ...item,
          id: `temp-${Math.random()}`, // ID temporário
          status: 'draft',
        }));
        return [...old, ...itemsWithIds];
      });
      
      // Retornar contexto para possível rollback
      return { previousItems };
    },
    onSuccess: (data: any) => {
      const quantidade = Array.isArray(data) ? data.length : 0;
      
      toast({
        title: "✅ Peças salvas com sucesso!",
        description: `${quantidade} ${quantidade === 1 ? 'peça adicionada' : 'peças adicionadas'}`,
      });
      
      // Atualizar com dados reais do servidor (substitui os temporários)
      queryClient.invalidateQueries({ queryKey: ["/api/items", eventId] });
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });

      // Sinaliza ao grid para remover as linhas já gravadas (evita salvá-las
      // de novo). As incompletas continuam lá.
      setBulkSavedTick(t => t + 1);

      // Fecha só quando não sobrou nada para terminar — assim o salvamento dá
      // a sensação clara de concluído sem descartar linhas pela metade.
      if (bulkLeftoverRef.current === 0) {
        setOpen(false);
        setBulkMode(false);
      } else {
        toast({
          title: "Peças salvas",
          description: `${bulkLeftoverRef.current} linha${bulkLeftoverRef.current !== 1 ? 's' : ''} incompleta${bulkLeftoverRef.current !== 1 ? 's' : ''} continua${bulkLeftoverRef.current !== 1 ? 'm' : ''} aberta${bulkLeftoverRef.current !== 1 ? 's' : ''} para você terminar.`,
        });
      }
    },
    onError: (error: any, newItems: any, context: any) => {
      // Se der erro, reverter para dados anteriores
      if (context?.previousItems) {
        queryClient.setQueryData(["/api/items", eventId], context.previousItems);
      }
      
      toast({
        title: "Erro ao adicionar peças",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateItemMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      // Campo decimal vazio não pode virar "" (Postgres: invalid input syntax
      // for type numeric). Coage vazio/invalido para null; mantém como string.
      const toNumStr = (v: any): string | null => {
        const s = String(v ?? "").trim().replace(",", ".");
        if (s === "") return null;
        const n = parseFloat(s);
        return isNaN(n) ? null : s;
      };
      const toNum = (v: any): number | null => {
        const s = String(v ?? "").trim().replace(",", ".");
        if (s === "") return null;
        const n = parseFloat(s);
        return isNaN(n) ? null : n;
      };

      const fw = toNum(data.fileWidth);
      const fh = toNum(data.fileHeight);
      const calculatedM2 = (fw !== null && fh !== null)
        ? calculateM2(data.quantity, fw, fh).toFixed(2)
        : null;

      const itemData: any = {
        ...data,
        visualWidth: toNumStr(data.visualWidth),
        visualHeight: toNumStr(data.visualHeight),
        fileWidth: toNumStr(data.fileWidth),
        fileHeight: toNumStr(data.fileHeight),
        area: toNum(data.visualWidth),   // Manter area para compatibilidade com backend
        visual: toNum(data.visualHeight), // Manter visual para compatibilidade com backend
        calculatedM2,
      };

      // area/visual/calculatedM2 são colunas obrigatórias (notNull): se ficaram
      // sem valor, omitir do update parcial em vez de enviar null.
      if (itemData.area === null) delete itemData.area;
      if (itemData.visual === null) delete itemData.visual;
      if (itemData.calculatedM2 === null) delete itemData.calculatedM2;

      return await apiRequest("PATCH", `/api/items/${id}`, itemData);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/items", eventId] });

      // Se o usuário digitou um material/acabamento que ainda não existe,
      // cadastra no catálogo (Modelos) para reutilizar depois.
      const mat = (variables?.data?.material || "").trim();
      const fin = (variables?.data?.finish || "").trim();
      const has = (kind: string, v: string) =>
        catalogOptions.some(o => o.kind === kind && o.value.toLowerCase() === v.toLowerCase()) ||
        (standardItems as any[]).some(s => (kind === "material" ? s.material : s.finish)?.toLowerCase() === v.toLowerCase());
      const criados: string[] = [];
      if (mat && !materials.some(m => m.toLowerCase() === mat.toLowerCase()) && !has("material", mat)) {
        createCatalogOptionMutation.mutate({ kind: "material", value: mat });
        criados.push(`material "${mat}"`);
      }
      if (fin && !finishes.some(f => f.toLowerCase() === fin.toLowerCase()) && !has("finish", fin)) {
        createCatalogOptionMutation.mutate({ kind: "finish", value: fin });
        criados.push(`acabamento "${fin}"`);
      }

      setEditingItem(null);
      setOpen(false);
      setEditDialogOpen(false);
      setBulkMode(false);
      toast({
        title: "Peça atualizada",
        description: criados.length
          ? `Peça salva. Novo ${criados.join(" e ")} cadastrado no catálogo.`
          : "A peça foi atualizada com sucesso",
      });
    },
    onError: (error: Error, variables) => {
      // Rede de segurança do modelo de complemento. O servidor recusa aumentar
      // a quantidade de peça em produção (409 USE_COMPLEMENT) e recusa reduzir
      // abaixo do que já existe fisicamente (409 QUANTITY_FLOOR). Sem tradução,
      // os dois chegavam ao usuário como JSON cru num toast vermelho.
      const { message, code, data } = parseApiError(error);

      if (code === "USE_COMPLEMENT") {
        handleCloseEditDialog();
        toast({
          title: "Peça já em produção",
          description: 'A quantidade não sobe por aqui: o aumento vira uma peça complementar, e o pedido é feito na tela da Gráfica.',
        });
        return;
      }

      if (code === "QUANTITY_FLOOR") {
        toast({
          title: "Redução não permitida",
          description: `Já há ${data?.minimum ?? "?"} un. produzidas/conferidas/entregues. Mínimo: ${data?.minimum ?? "?"}.`,
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Erro ao atualizar peça",
        description: message,
        variant: "destructive",
      });
    },
  });

  const deleteItemMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/items/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items", eventId] });
      // Fechar aqui (e não no onClick) permite que o botão mostre "Excluindo…"
      // enquanto a requisição roda.
      setDeletingItem(null);
      toast({
        title: "Peça excluída",
        description: "A peça foi excluída com sucesso",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao excluir peça",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const submitDraftsMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/events/${eventId}/items/submit`);
      return await response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/items", eventId] });
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      toast({
        title: "Peças enviadas com sucesso",
        description: `${data.count} ${data.count === 1 ? 'peça foi enviada' : 'peças foram enviadas'} para vinculação de patrocinadores`,
      });
    },
    onError: (error: any) => {
      const message = error.message || "Erro desconhecido";
      
      if (message.includes("Nenhum item em rascunho")) {
        toast({
          title: "Nenhuma peça para enviar",
          description: "Não há peças em rascunho neste evento",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Erro ao enviar peças",
          description: message,
          variant: "destructive",
        });
      }
    },
  });


  const { updateItemSkipApprovalMutation, updateItemIsReuseMutation } = useEventItemFlags({ eventId });

  // (Removido) O dialog "Gerenciar Itens do Patrocinador" e suas mutations —
  // código morto sem gatilho — já foram apagados, junto com o useEffect que
  // disparava GET /api/items/:id/sponsors por item só para alimentá-lo.

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingItem) {
      updateItemMutation.mutate({ id: editingItem.id, data: formData });
    } else {
      createItemMutation.mutate(formData);
    }
  };

  // Apenas nomes do vocabulário canônico (lib/status.ts): os antigos
  // 'em_producao'/'produzido'/'entregue'/'liberado' não existem no banco e
  // faziam o gate nunca disparar. 'approved' e 'conferred' entram no bloqueio
  // de edição — antes dava para editar peça liberada/conferida mas não
  // excluí-la, um gate incoerente.
  const BLOCKED_EDIT_STATUSES = ["ready_for_production", "pronto_para_producao", "approved", "inProduction", "produced", "conferred", "delivered"];

  /**
   * POR QUE devolve a FRASE e não um booleano: agora há DUAS razões para o
   * cadeado, e elas pedem explicações opostas. "Já liberado para a gráfica" é
   * sobre a peça e depende do papel; "evento finalizado" é sobre o evento e
   * vale para todo mundo, inclusive admin. Um `title` genérico manda a pessoa
   * procurar a permissão errada.
   *
   * O evento finalizado vem PRIMEIRO porque é o mais forte: nem quem edita a
   * lista escapa dele, e é o que o servidor recusa com 409.
   */
  const motivoEdicaoBloqueada = (status: string): string | null => {
    if (eventoFinalizado) return avisoEventoFim;
    if (BLOCKED_EDIT_STATUSES.includes(status) && !canEditLists) {
      return "Edição bloqueada — item já liberado para gráfica";
    }
    return null;
  };
  const isEditBlocked = (status: string) => motivoEdicaoBloqueada(status) !== null;

  // Exclusão: solicitação tem o MESMO alcance do admin (decisão do dono).
  // Antes, solicitação só excluía antes de a peça chegar na Arte — e
  // "awaiting_submission" estava na lista de bloqueio, ou seja, nem o próprio
  // rascunho recém-criado ela conseguia apagar. A exclusão aqui é SOFT
  // (deletedAt), fica no log de auditoria e é restaurável em Peças Excluídas,
  // então o risco é reversível; a trava que continua valendo para todos é a
  // de integridade (mãe com complemento vivo, barrada no servidor).
  const canDeleteAny = hasPermission("admin") || user?.role === "solicitacao";
  const canDeleteItem = (_status: string) => canDeleteAny;

  const handleEditItem = (item: any) => {
    if (isEditBlocked(item.status)) return;
    setLocalRefPreview("");
    // Volta os selects de Material/Acabamento ao modo lista a cada abertura.
    setCustomMaterial(false);
    setCustomFinish(false);
    setEditingItem(item);
    setFormData({
      type: item.type || "",
      description: item.description || "",
      quantity: item.quantity || 1,
      visualWidth: item.visualWidth || item.area || "",
      visualHeight: item.visualHeight || item.visual || "",
      fileWidth: item.fileWidth || "",
      fileHeight: item.fileHeight || "",
      material: item.material || "",
      finish: item.finish || "",
      measurement: item.measurement || "",
      observations: item.observations || "",
      skipApproval: item.skipApproval || false,
      isReuse: item.isReuse || false,
      referenceUrl: item.referenceUrl || "",
    });
    setEditDialogOpen(true);
  };

  const handleDeleteItem = (item: any) => {
    setDeletingItem(item);
  };

  const handleCloseDialog = () => {
    setLocalRefPreview("");
    setEditingItem(null);
    setBulkMode(true);
    setFormData({ ...EMPTY_ITEM_FORM });
    setOpen(false);
  };

  // Fechamento único do modal de edição (X, Cancelar e ESC/clique-fora):
  // antes o onOpenChange cru deixava editingItem/localRefPreview para trás.
  const handleCloseEditDialog = () => {
    setEditDialogOpen(false);
    setEditingItem(null);
    setLocalRefPreview("");
  };

  // ── Derivações memoizadas (antes recalculavam a cada render) ─────────────
  // Mapa tipo → grupo pai (a partir dos standardItems). Resolve tolerante a
  // maiúscula/acento/espaço, casando o type tanto com o NOME do modelo quanto
  // com um NOME DE GRUPO do catálogo — assim itens importados da planilha
  // (ex.: type "Rolo") caem no grupo "ROLO".
  const normKey = (s: string) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
  const groupOf = useMemo(() => {
    const groupByName: Record<string, string> = {};
    const groupByGroup: Record<string, string> = {};
    (standardItems as any[]).forEach((s: any) => {
      if (s.group) {
        groupByName[normKey(s.name)] = s.group;
        groupByGroup[normKey(s.group)] = s.group;
      }
    });
    return (type: string): string => {
      const k = normKey(type);
      return groupByName[k] || groupByGroup[k] || "";
    };
  }, [standardItems]);

  // Materiais e acabamentos: padrão + catálogo cadastrado + os usados nos Modelos,
  // para que um material/acabamento criado em "Modelos" apareça na edição de itens.
  const { materialOptions, finishOptions } = useMemo(() => {
    const catMats = catalogOptions.filter(o => o.kind === "material").map(o => o.value);
    const catFinishes = catalogOptions.filter(o => o.kind === "finish").map(o => o.value);
    return {
      materialOptions: Array.from(new Set([...materials, ...catMats, ...((standardItems as any[]).map(s => s.material).filter(Boolean) as string[])])).sort((a, b) => a.localeCompare(b, "pt-BR")),
      finishOptions: Array.from(new Set([...finishes, ...catFinishes, ...((standardItems as any[]).map(s => s.finish).filter(Boolean) as string[])])).sort((a, b) => a.localeCompare(b, "pt-BR")),
    };
  }, [catalogOptions, standardItems]);

  // Busca local: num evento com centenas de peças, achar a "#0281" era
  // rolagem cega. Casa com ID, tipo, descrição e rótulo de status; compõe com
  // o filtro por chips de status do cabeçalho.
  const itemSearchLower = itemSearch.trim().toLowerCase();
  const searchedItems = useMemo(() => {
    let base = mainItems;
    if (statusFilter.length > 0) base = base.filter(item => statusFilter.includes(item.status));
    if (itemSearchLower) {
      base = base.filter((item: any) =>
        (item.displayId || "").toLowerCase().includes(itemSearchLower) ||
        (item.type || "").toLowerCase().includes(itemSearchLower) ||
        (item.description || "").toLowerCase().includes(itemSearchLower) ||
        getStatusLabel(item.status).toLowerCase().includes(itemSearchLower));
    }
    return base;
  }, [mainItems, statusFilter, itemSearchLower]);

  // Renderização incremental (mesmo padrão do Painel Geral): até 50 linhas;
  // o restante entra sob demanda — mantém o DOM leve em eventos grandes.
  const ITEM_CAP = 50;
  const visibleEventItems = showAllItems || searchedItems.length <= ITEM_CAP
    ? searchedItems
    : searchedItems.slice(0, ITEM_CAP);
  const hiddenItemCount = searchedItems.length - visibleEventItems.length;

  // Agrupar itens: Grupo Pai → Tipo → [itens]
  const { groupMap, sortedGroups } = useMemo(() => {
    const map: Record<string, Record<string, typeof visibleEventItems>> = {};
    visibleEventItems.forEach(item => {
      const g = groupOf(item.type) || '';
      if (!map[g]) map[g] = {};
      if (!map[g][item.type]) map[g][item.type] = [];
      map[g][item.type].push(item);
    });
    const groups = Object.keys(map).sort((a, b) => {
      if (a === '') return 1; if (b === '') return -1;
      return a.localeCompare(b, 'pt-BR');
    });
    return { groupMap: map, sortedGroups: groups };
  }, [visibleEventItems, groupOf]);

  if (loadingEvent || loadingItems) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Card>
          <CardHeader>
            <div className="space-y-3">
              <div className="h-8 w-64 bg-muted animate-pulse rounded"></div>
              <div className="h-4 w-96 bg-muted animate-pulse rounded"></div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-center py-12">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
                  <p className="text-sm text-muted-foreground">Carregando evento...</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <div className="h-6 w-48 bg-muted animate-pulse rounded"></div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex gap-4 p-4 border rounded-lg">
                  <div className="h-4 w-4 bg-muted animate-pulse rounded"></div>
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-32 bg-muted animate-pulse rounded"></div>
                    <div className="h-3 w-48 bg-muted animate-pulse rounded"></div>
                  </div>
                  <div className="h-8 w-20 bg-muted animate-pulse rounded"></div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              {eventError ? (
                <>
                  <p className="text-red-700 font-semibold mb-1">Não foi possível carregar o evento</p>
                  <p className="text-muted-foreground text-sm mb-4">Verifique sua conexão e tente novamente.</p>
                  <button onClick={() => refetchEvent()} className="rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800">
                    Tentar novamente
                  </button>
                </>
              ) : (
                <p className="text-muted-foreground">Evento não encontrado</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div style={{ padding: isMobile ? '12px 12px' : '28px 40px', height: '100%', overflowY: 'auto', maxWidth: '1400px', margin: '0 auto', backgroundColor: '#F7F6F3' }}>
      {/* Breadcrumb */}
      <Link href="/eventos">
        <a
          data-testid="button-back"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '13px', fontWeight: '500', color: '#6F6A63', marginBottom: '22px', textDecoration: 'none', transition: 'color 0.15s', letterSpacing: '0.02em' }}
          onMouseEnter={e => (e.currentTarget.style.color = '#D97A1E')}
          onMouseLeave={e => (e.currentTarget.style.color = '#6F6A63')}
        >
          <ArrowLeft className="h-3 w-3" />
          Voltar para eventos
        </a>
      </Link>

      {/* Evento ENCERRADO: a faixa é a primeira coisa depois do breadcrumb.
          Quem abre este evento precisa saber, antes de qualquer número, que
          nada aqui está sendo cobrado — e por decisão de quem. */}
      {isEventClosed && (
        <div
          data-testid="banner-event-closed"
          style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 18px', marginBottom: 22, backgroundColor: '#f5f5f4', border: '1px solid #d6d3d1', borderLeft: '4px solid #78716c', borderRadius: 10 }}
        >
          <Lock className="h-4 w-4" style={{ color: '#57534e', flexShrink: 0, marginTop: 2 }} />
          <div>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#292524' }}>
              Evento encerrado
              {closureLog?.userName ? ` por ${closureLog.userName}` : ''}
              {closureLog?.createdAt ? ` em ${formatDateTime(closureLog.createdAt)}` : ''}
            </p>
            <p style={{ margin: '4px 0 0 0', fontSize: 13, color: '#57534e', lineHeight: 1.6 }}>
              {openWork.abertas > 0
                ? `${openWork.abertas} ${openWork.abertas === 1 ? 'peça continua' : 'peças continuam'} em aberto${openWork.emProducao > 0 ? ` (${openWork.emProducao} em produção)` : ''} e ${openWork.abertas === 1 ? 'segue listada' : 'seguem listadas'} abaixo — mas o evento não é mais cobrado na Gestão de Prazos nem aparece nas filas de trabalho.`
                : 'Não é mais cobrado na Gestão de Prazos nem aparece nas filas de trabalho.'}
              {canCloseEvent ? ' Use "Reabrir Evento" para voltar atrás.' : ''}
            </p>
          </div>
        </div>
      )}

      {/* Evento JÁ REALIZADO: a outra origem da finalização, e a que ninguém
          percebe — não há decisão de gente para exibir, só a data que passou.
          Sem esta faixa, os botões travados logo abaixo pareceriam bug. Aqui
          NÃO se oferece "reabrir": a data não volta. */}
      {motivoEventoFim === 'realizado' && (
        <div
          data-testid="banner-event-realizado"
          style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 18px', marginBottom: 22, backgroundColor: '#f5f5f4', border: '1px solid #d6d3d1', borderLeft: '4px solid #78716c', borderRadius: 10 }}
        >
          <Calendar className="h-4 w-4" style={{ color: '#57534e', flexShrink: 0, marginTop: 2 }} />
          <div>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#292524' }}>
              Evento já realizado
            </p>
            <p style={{ margin: '4px 0 0 0', fontSize: 13, color: '#57534e', lineHeight: 1.6 }}>
              A data do evento já passou, então a lista fica aqui como registro: as peças não
              avançam mais no fluxo e não aparecem nas filas de trabalho. Conferir e registrar
              entrega continuam liberados — é o que fecha a conta do que já saiu.
            </p>
          </div>
        </div>
      )}

      {/* Header principal */}
      <div style={{ marginBottom: '40px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px', gap: '24px', flexWrap: 'wrap' }}>
          <div>
            <p style={{ color: '#6F6A63', fontSize: '11px', fontWeight: '500', letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 8px 0' }}>
              Criado em {new Date(event.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <h1
                data-testid="title-event-name"
                style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 26, fontWeight: 800, letterSpacing: '-0.04em', textTransform: 'uppercase', color: '#1F1D1A', lineHeight: 1.05, margin: 0 }}
              >
                {event.name}
              </h1>
              {/* Status do evento ao lado do nome — paridade com o card da
                  lista (lá o badge existe; aqui o status ficava invisível). */}
              <StatusBadge status={event.status} />
            </div>
            {/* Chips de status: "onde está minha lista" num relance — total,
                m² e um chip clicável por status presente (filtra a listagem). */}
            {items.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
                {/* "(N complemento)" é o custo declarado do modelo: cada aumento
                    pós-produção é uma peça a mais na contagem. Dizer quantas
                    são complemento evita a pergunta "por que 43 se a lista tinha
                    42?" — o número está certo, e agora explica a si mesmo. */}
                <span style={{ fontSize: 12, fontWeight: 700, color: '#6F6A63', backgroundColor: '#ffffff', border: '1px solid #E7E3DC', borderRadius: 999, padding: '4px 12px', whiteSpace: 'nowrap' }}>
                  {items.length} {items.length === 1 ? 'peça' : 'peças'}
                  {complementCount > 0 && ` (${complementCount} ${complementCount === 1 ? 'complemento' : 'complementos'})`}
                  {' · '}{totalM2.toFixed(2)} m²
                </span>
                {statusChips.map(([status, count]) => {
                  const m = getStatusMeta(status);
                  const active = statusFilter.includes(status);
                  return (
                    <button
                      key={status}
                      type="button"
                      aria-pressed={active}
                      title={active ? `Remover filtro "${m.label}"` : `Filtrar por "${m.label}"`}
                      onClick={() => setStatusFilter(f => active ? f.filter(s => s !== status) : [...f, status])}
                      data-testid={`chip-status-${status}`}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        fontSize: 12, fontWeight: 700, color: m.text,
                        backgroundColor: m.bg, border: `1px solid ${active ? m.text : m.border}`,
                        boxShadow: active ? `inset 0 0 0 1px ${m.text}` : 'none',
                        borderRadius: 999, padding: '4px 12px', cursor: 'pointer',
                        whiteSpace: 'nowrap', transition: 'border-color 0.15s, box-shadow 0.15s',
                      }}
                    >
                      <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: m.dot, flexShrink: 0 }} />
                      {m.label} · {count}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div className="flex gap-2 flex-wrap items-center">
            {/* Importar Excel — só quem edita a lista */}
            {canEditLists && (
            <button
              onClick={() => setImportDialogOpen(true)}
              data-testid="button-import-xlsx"
              disabled={eventoFinalizado}
              title={eventoFinalizado ? avisoEventoFim : undefined}
              style={{ backgroundColor: '#ffffff', color: eventoFinalizado ? '#a8a29e' : '#1a1c1c', padding: '11px 18px', borderRadius: '8px', fontWeight: '700', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '7px', border: '1.5px solid #e7e5e4', cursor: eventoFinalizado ? 'not-allowed' : 'pointer', transition: 'background-color 0.15s, border-color 0.15s', letterSpacing: '0.01em', whiteSpace: 'nowrap', flexShrink: 0, fontFamily: "'Space Grotesk', sans-serif" }}
              onMouseEnter={e => { if (eventoFinalizado) return; e.currentTarget.style.backgroundColor = '#f5f5f4'; e.currentTarget.style.borderColor = '#d4d0cc'; }}
              onMouseLeave={e => { if (eventoFinalizado) return; e.currentTarget.style.backgroundColor = '#ffffff'; e.currentTarget.style.borderColor = '#e7e5e4'; }}
            >
              <Upload className="h-4 w-4" style={{ color: eventoFinalizado ? '#d6d3d1' : '#22c55e' }} />
              Importar Excel
            </button>
            )}

            {/* Clonar Evento — só quem edita a lista */}
            {canEditLists && (
            <button
              onClick={() => setCloneDialogOpen(true)}
              data-testid="button-clone-event"
              disabled={eventoFinalizado}
              title={eventoFinalizado ? avisoEventoFim : undefined}
              style={{ backgroundColor: '#ffffff', color: eventoFinalizado ? '#a8a29e' : '#1a1c1c', padding: '11px 18px', borderRadius: '8px', fontWeight: '700', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '7px', border: '1.5px solid #e7e5e4', cursor: eventoFinalizado ? 'not-allowed' : 'pointer', transition: 'background-color 0.15s, border-color 0.15s', letterSpacing: '0.01em', whiteSpace: 'nowrap', flexShrink: 0, fontFamily: "'Space Grotesk', sans-serif" }}
              onMouseEnter={e => { if (eventoFinalizado) return; e.currentTarget.style.backgroundColor = '#f5f5f4'; e.currentTarget.style.borderColor = '#d4d0cc'; }}
              onMouseLeave={e => { if (eventoFinalizado) return; e.currentTarget.style.backgroundColor = '#ffffff'; e.currentTarget.style.borderColor = '#e7e5e4'; }}
            >
              <Copy className="h-4 w-4" style={{ color: eventoFinalizado ? '#d6d3d1' : '#6366f1' }} />
              Clonar Evento
            </button>
            )}

            {/* Encerrar / Reabrir — só admin (mesmo gate do servidor). Fica
                junto das demais ações de evento; o rótulo troca conforme o
                estado, porque é a mesma decisão nas duas direções. */}
            {canCloseEvent && (
              <button
                onClick={() => (isEventClosed ? setReopenDialogOpen(true) : setCloseDialogOpen(true))}
                data-testid={isEventClosed ? "button-reopen-event" : "button-close-event"}
                style={{ backgroundColor: '#ffffff', color: '#1a1c1c', padding: '11px 18px', borderRadius: '8px', fontWeight: '700', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '7px', border: '1.5px solid #e7e5e4', cursor: 'pointer', transition: 'background-color 0.15s, border-color 0.15s', letterSpacing: '0.01em', whiteSpace: 'nowrap', flexShrink: 0, fontFamily: "'Space Grotesk', sans-serif" }}
                onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#f5f5f4'; e.currentTarget.style.borderColor = '#d4d0cc'; }}
                onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#ffffff'; e.currentTarget.style.borderColor = '#e7e5e4'; }}
              >
                {isEventClosed
                  ? <Unlock className="h-4 w-4" style={{ color: '#15803d' }} />
                  : <Lock className="h-4 w-4" style={{ color: '#78716c' }} />}
                {isEventClosed ? 'Reabrir Evento' : 'Encerrar Evento'}
              </button>
            )}

            {/* Exportar Excel — leitura, disponível para todos os perfis */}
            <button
              onClick={() => {
                // Feedback imediato: o download demora alguns segundos e nada
                // sinaliza que algo começou.
                toast({ title: "Gerando Excel...", description: "O download começa em instantes." });
                // Âncora com download: não abre aba, não passa pelo bloqueador
                // de popup. (window.open com 'noopener' retorna null POR
                // ESPECIFICAÇÃO mesmo quando funciona — a guarda antiga
                // toastava "bloqueado" em todo download bem-sucedido.)
                const a = document.createElement('a');
                a.href = `/api/events/${eventId}/export-items`;
                a.download = '';
                document.body.appendChild(a);
                a.click();
                a.remove();
              }}
              data-testid="button-export-xlsx"
              style={{ backgroundColor: '#ffffff', color: '#1a1c1c', padding: '11px 18px', borderRadius: '8px', fontWeight: '700', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '7px', border: '1.5px solid #e7e5e4', cursor: 'pointer', transition: 'background-color 0.15s, border-color 0.15s', letterSpacing: '0.01em', whiteSpace: 'nowrap', flexShrink: 0, fontFamily: "'Space Grotesk', sans-serif" }}
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#f5f5f4'; e.currentTarget.style.borderColor = '#d4d0cc'; }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#ffffff'; e.currentTarget.style.borderColor = '#e7e5e4'; }}
            >
              <FileSpreadsheet className="h-4 w-4" style={{ color: '#16a34a' }} />
              Exportar Excel
            </button>

            {canEditLists && (
            <button
              onClick={() => {
                setEditingItem(null);
                setBulkMode(true);
                // O form simples compartilha os selects com sentinela do
                // editar — volta Material/Acabamento ao modo lista.
                setCustomMaterial(false);
                setCustomFinish(false);
                setOpen(true);
              }}
              data-testid="button-add-item"
              disabled={eventoFinalizado}
              title={eventoFinalizado ? avisoEventoFim : undefined}
              style={{ backgroundColor: eventoFinalizado ? '#e7e5e4' : '#b45309', color: eventoFinalizado ? '#a8a29e' : '#ffffff', padding: '11px 24px', borderRadius: '8px', fontWeight: '700', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '7px', border: 'none', cursor: eventoFinalizado ? 'not-allowed' : 'pointer', transition: 'background-color 0.18s, box-shadow 0.18s, transform 0.1s', letterSpacing: '0.03em', whiteSpace: 'nowrap', flexShrink: 0, boxShadow: eventoFinalizado ? 'none' : '0 1px 3px rgba(217,122,30,0.25)', fontFamily: "'Space Grotesk', sans-serif" }}
              onMouseEnter={e => { if (eventoFinalizado) return; e.currentTarget.style.backgroundColor = '#9a3412'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(217,122,30,0.35)'; }}
              onMouseLeave={e => { if (eventoFinalizado) return; e.currentTarget.style.backgroundColor = '#b45309'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(217,122,30,0.25)'; }}
              onMouseDown={e => { if (eventoFinalizado) return; e.currentTarget.style.transform = 'scale(0.97)'; }}
              onMouseUp={e => { if (eventoFinalizado) return; e.currentTarget.style.transform = 'scale(1)'; }}
            >
              <Plus className="h-4 w-4" />
              Adicionar Peça
            </button>
            )}

            {/* A explicação fica ao lado dos botões travados: sem ela, três
                botões cinzas em sequência lêem como bug de permissão. */}
            {canEditLists && eventoFinalizado && (
              <span data-testid="aviso-evento-finalizado" style={{ fontSize: 12, color: '#746e69', alignSelf: 'center', maxWidth: 260, lineHeight: 1.4 }}>
                {avisoEventoFim}
              </span>
            )}

            {/* Perfil sem edição: em vez de esconder tudo em silêncio, diz o porquê. */}
            {!canEditLists && (
              <span style={{ fontSize: 12, color: '#746e69', alignSelf: 'center' }}>
                Somente leitura — seu perfil não edita a lista deste evento
              </span>
            )}

            <Dialog open={open} onOpenChange={(isOpen) => {
              if (!isOpen) {
                handleCloseDialog();
              } else {
                setOpen(true);
              }
            }}>
              <DialogContent
                className={`${bulkMode && !editingItem ? "max-w-[95vw] h-[90vh] p-0 gap-0 flex flex-col" : "p-0 gap-0"} ${HIDE_NATIVE_CLOSE}`}
                style={bulkMode && !editingItem
                  ? { display: 'flex', flexDirection: 'column', overflow: 'hidden' }
                  : { maxWidth: isMobile ? '95vw' : '800px', width: '100%', padding: 0, backgroundColor: '#ffffff', borderRadius: '16px', overflow: 'hidden', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
                // Bloquear ESC/clique-fora SÓ no modo lote (onde há grade com
                // linhas não salvas). No modo simples o fechamento acidental
                // não custa nada e o bloqueio só irritava.
                onInteractOutside={(e) => { if (bulkMode && !editingItem) e.preventDefault(); }}
                onEscapeKeyDown={(e) => { if (bulkMode && !editingItem) e.preventDefault(); }}
              >
                {/* POR QUE congelar aqui: os três onSuccess que fecham este
                    modal (criar peça, criar em lote, atualizar) invalidam duas
                    chaves de /api/items, fecham, toastam e ainda mexem no que
                    o modal está exibindo — `setFormData(EMPTY_ITEM_FORM)` e
                    `setBulkMode(false)`. Esse último é o pior: trocar bulkMode
                    no mesmo commit do fechamento faz a subárvore em
                    desmontagem passar do modo LOTE para o modo SIMPLES no meio
                    do fade, o que remonta a árvore inteira dentro do Presence.
                    Mecanismo por extenso em components/modal-shell.tsx. */}
                <FreezeWhileClosing open={open}>
                <DialogTitle className="sr-only">{bulkMode && !editingItem ? "Entrada Rápida" : "Adicionar Peça"}</DialogTitle>
                <DialogDescription className="sr-only">
                  {bulkMode && !editingItem ? "Modo lote — entrada rápida de peças" : "Nova peça de produção"}
                </DialogDescription>
                {/* Header no padrão ModalHeader. O X do modo lote é a única
                    saída além de salvar: confirma antes de descartar as linhas
                    não salvas (window.confirm — exceção aprovada ao padrão de
                    dialogs para não inflar o arquivo com mais um AlertDialog). */}
                <ModalHeader
                  icon={bulkMode && !editingItem ? List : Plus}
                  tint="#c2410c"
                  title={bulkMode && !editingItem ? "Entrada Rápida" : "Adicionar Peça"}
                  subtitle={bulkMode && !editingItem ? "Modo Lote — entrada rápida de peças" : (event.name || "Nova peça de produção")}
                  onClose={bulkMode && !editingItem
                    ? () => { if (window.confirm("Descartar linhas não salvas?")) handleCloseDialog(); }
                    : handleCloseDialog}
                  trailing={!editingItem ? (
                    <button
                      onClick={() => setBulkMode(!bulkMode)}
                      data-testid="button-toggle-mode"
                      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', backgroundColor: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.85)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', cursor: 'pointer', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0, transition: 'background-color 0.15s' }}
                      onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.16)')}
                      onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)')}
                    >
                      {bulkMode ? <Plus className="h-3.5 w-3.5" /> : <List className="h-3.5 w-3.5" />}
                      {bulkMode ? "Modo Simples" : "Entrada Rápida"}
                    </button>
                  ) : undefined}
                />

                {bulkMode && !editingItem ? (
                  <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, minWidth: 0, overflow: 'hidden' }}>
                  <BulkItemEntry
                    eventId={eventId!}
                    standardItems={standardItems}
                    sponsors={sponsors}
                    existingItems={items}
                    savedTick={bulkSavedTick}
                    onSubmit={(items, leftoverCount) => {
                      bulkLeftoverRef.current = leftoverCount;
                      createBulkItemsMutation.mutate(items);
                    }}
                    onCancel={handleCloseDialog}
                    isPending={createBulkItemsMutation.isPending}
                  />
                  </div>
                ) : (
                  <ItemForm
                    mode="create"
                    formData={formData}
                    setFormData={setFormData}
                    standardItems={standardItems}
                    typeOptions={itemTypes}
                    materialOptions={materialOptions}
                    finishOptions={finishOptions}
                    customMaterial={customMaterial}
                    setCustomMaterial={setCustomMaterial}
                    customFinish={customFinish}
                    setCustomFinish={setCustomFinish}
                    isMobile={isMobile}
                    isAdmin={user?.role === 'admin'}
                    isPending={createItemMutation.isPending || updateItemMutation.isPending}
                    onSubmit={handleSubmit}
                    onCancel={handleCloseDialog}
                    localRefPreview={localRefPreview}
                    setLocalRefPreview={setLocalRefPreview}
                    getUploadUrl={getUploadUrl}
                  />
                )}
                </FreezeWhileClosing>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* ── Agenda Operacional ───────────────────────────────── */}
        {(() => {
          const TI = {
            card: '#FFFFFF', border: '#E7E3DC',
            // label era #9D978F — reprovava contraste em textos ≤13px.
            title: '#1F1D1A', secondary: '#6F6A63', label: '#6F6A63',
            dark: '#2E2A26', accent: '#D97A1E',
            line: '#D8D4CE', attention: '#C97B4B',
          };

          const today = new Date(); today.setHours(0, 0, 0, 0);
          const departure = new Date(event.truckDepartureDate);
          const depDay = new Date(departure); depDay.setHours(0, 0, 0, 0);
          const countdownDays = Math.ceil((depDay.getTime() - today.getTime()) / 86400000);
          const depLabel = departure.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
          const depTime = departure.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
          // String(): o schema tipa startDate como Date, mas o JSON da API
          // entrega string — em runtime é identidade.
          const startLabel = parseDateLocal(String(event.startDate)).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

          const adjustWeekend = (date: Date, skip: boolean): { date: Date; adjusted: 'fri' | 'mon' | null } => {
            if (skip) return { date, adjusted: null };
            const dow = date.getDay();
            if (dow === 6) { const d = new Date(date); d.setDate(d.getDate() - 1); return { date: d, adjusted: 'fri' }; }
            if (dow === 0) { const d = new Date(date); d.setDate(d.getDate() + 1); return { date: d, adjusted: 'mon' }; }
            return { date, adjusted: null };
          };

          const rawDeadlines = [
            { label: 'Lista de Imagens',    days: event.deadlineListaImagens    ?? -25, allDays: false },
            { label: 'Entrega de Layouts',  days: event.deadlineEntregaLayouts  ?? -20, allDays: false },
            { label: 'Aprovação de Layout', days: event.deadlineAprovacaoLayout ?? -12, allDays: false },
            { label: 'Revisão de Lista',    days: event.deadlineRevisaoLista    ?? -8,  allDays: false },
            { label: 'Produção Gráfica',    days: event.deadlineProducaoGrafica ?? -1,  allDays: true  },
          ];

          const milestones = rawDeadlines.map(({ label, days, allDays }) => {
            const raw = new Date(departure); raw.setDate(raw.getDate() + days);
            const { date, adjusted } = adjustWeekend(raw, allDays);
            const isPast = date < today;
            const isOverdue = isPast && countdownDays > 0;
            return { label, date, adjusted, isPast, isOverdue };
          });

          const nextIndex = milestones.findIndex(m => !m.isPast);
          const progressFrac = nextIndex === -1 ? 1 : nextIndex === 0 ? 0 : nextIndex / (milestones.length - 1);

          // Evento encerrado (concluído ou já iniciado) é HISTÓRIA: a saída no
          // passado não é "atraso" — o caminhão já foi. Mostrar "Atrasado 90d"
          // em vermelho num evento finalizado é alarme falso que ensina o
          // usuário a ignorar o vermelho de verdade.
          const isHistorical = event.status === 'completed' || isEventClosed
            || parseDateLocal(String(event.startDate)) < today;
          // Guarda de sanidade: ano 0206 no banco (typo de 2026) virava
          // "Atrasado 664730d". Dado absurdo pede correção, não contagem.
          const depYear = depDay.getFullYear();
          const depInvalid = depYear < 2000 || depYear > 2100;
          const countdownColor = depInvalid
            ? '#B84040'
            : isHistorical
            ? TI.secondary
            : countdownDays < 0 ? '#B84040' : countdownDays <= 3 ? TI.attention : TI.secondary;
          const countdownText = depInvalid
            ? 'Data de saída inválida — corrija o evento'
            : countdownDays < 0
            ? (isHistorical ? `Saiu há ${Math.abs(countdownDays)}d` : `Atrasado ${Math.abs(countdownDays)}d`)
            : countdownDays === 0 ? 'Hoje'
            : `Faltam ${countdownDays} dia${countdownDays !== 1 ? 's' : ''}`;

          const cardHover = (el: HTMLDivElement, on: boolean) => {
            el.style.boxShadow = on ? '0 6px 20px rgba(0,0,0,0.08)' : '0 1px 4px rgba(0,0,0,0.05)';
          };

          return (
            <div style={{ marginTop: '8px' }}>

              {/* Section divider */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '18px' }}>
                <span style={{ fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.16em', color: TI.label, fontFamily: "'Space Grotesk', sans-serif", whiteSpace: 'nowrap' }}>
                  Agenda Operacional
                </span>
                <div style={{ flex: 1, height: '1px', backgroundColor: TI.border }} />
              </div>

              {/* ── Cards de logística ── */}
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '16px', alignItems: 'stretch' }}>

                {/* Card: SAÍDA DO CAMINHÃO */}
                <div
                  style={{ flex: '0 0 auto', minWidth: '210px', backgroundColor: TI.card, border: `1px solid ${TI.border}`, borderRadius: '12px', padding: '20px 24px', display: 'flex', alignItems: 'center', gap: '18px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)', transition: 'box-shadow 0.2s' }}
                  onMouseEnter={e => cardHover(e.currentTarget, true)}
                  onMouseLeave={e => cardHover(e.currentTarget, false)}
                >
                  <div style={{ width: '50px', height: '50px', borderRadius: '12px', backgroundColor: '#FEF3E7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Truck size={22} color={TI.accent} />
                  </div>
                  <div>
                    <div style={{ fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.14em', color: TI.label, marginBottom: '7px', fontFamily: "'Space Grotesk', sans-serif" }}>
                      Saída do Caminhão
                    </div>
                    <div style={{ fontSize: '22px', fontWeight: '800', color: TI.title, fontFamily: "'Manrope', sans-serif", lineHeight: 1.1, letterSpacing: '-0.03em' }}>
                      {depLabel}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                      <span style={{ fontSize: '13px', fontWeight: '500', color: TI.secondary, fontFamily: "'Plus Jakarta Sans', sans-serif", letterSpacing: '0.01em' }}>{depTime}</span>
                      <span style={{ width: '3px', height: '3px', borderRadius: '50%', backgroundColor: TI.line, display: 'inline-block', flexShrink: 0 }} />
                      <span style={{ fontSize: '13px', fontWeight: '600', color: countdownColor, letterSpacing: '0.01em' }}>
                        {countdownText}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Card: INÍCIO DA MONTAGEM */}
                <div
                  style={{ flex: '0 0 auto', minWidth: '210px', backgroundColor: TI.card, border: `1px solid ${TI.border}`, borderRadius: '12px', padding: '20px 24px', display: 'flex', alignItems: 'center', gap: '18px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)', transition: 'box-shadow 0.2s' }}
                  onMouseEnter={e => cardHover(e.currentTarget, true)}
                  onMouseLeave={e => cardHover(e.currentTarget, false)}
                >
                  <div style={{ width: '50px', height: '50px', borderRadius: '12px', backgroundColor: '#EEF2F7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Calendar size={22} color="#7A93AC" />
                  </div>
                  <div>
                    <div style={{ fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.14em', color: TI.label, marginBottom: '7px', fontFamily: "'Space Grotesk', sans-serif" }}>
                      Dia do Evento
                    </div>
                    <div style={{ fontSize: '22px', fontWeight: '800', color: TI.title, fontFamily: "'Manrope', sans-serif", lineHeight: 1.1, letterSpacing: '-0.03em' }}>
                      {startLabel}
                    </div>
                    <div style={{ marginTop: '6px' }}>
                      <span style={{ fontSize: '13px', fontWeight: '500', color: TI.secondary, fontFamily: "'Plus Jakarta Sans', sans-serif", letterSpacing: '0.01em' }}>Início do evento</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Timeline de Prazos ── */}
              <div style={{ backgroundColor: TI.card, border: `1px solid ${TI.border}`, borderRadius: '12px', padding: '22px 28px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
                <div style={{ overflowX: 'auto', paddingBottom: '4px' }}>
                  <div style={{ position: 'relative', display: 'flex', minWidth: '480px' }}>

                    {/* Track base */}
                    <div style={{
                      position: 'absolute', top: '18px',
                      left: `calc(100% / ${milestones.length} / 2)`,
                      right: `calc(100% / ${milestones.length} / 2)`,
                      height: '1.5px', backgroundColor: TI.line, zIndex: 0,
                    }} />
                    {/* Progress fill */}
                    {progressFrac > 0 && (
                      <div style={{
                        position: 'absolute', top: '18px',
                        left: `calc(100% / ${milestones.length} / 2)`,
                        width: `calc(${progressFrac} * (100% - 100% / ${milestones.length}))`,
                        height: '1.5px', backgroundColor: '#C3B5A2', zIndex: 1,
                      }} />
                    )}

                    {milestones.map(({ label, date, adjusted, isPast, isOverdue }, i) => {
                      const isNext = i === nextIndex;
                      const dateStr = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

                      let dotBg: string, dotBorder: string, dotSize: number;
                      let labelCol: string, dateCol: string, labelW: number;
                      let glowColor = '';

                      if (isNext) {
                        dotBg = TI.accent; dotBorder = TI.accent; dotSize = 22;
                        labelCol = TI.dark; dateCol = TI.accent; labelW = 700;
                        glowColor = 'rgba(217,122,30,0.18)';
                      } else if (isOverdue) {
                        dotBg = '#FDF0E8'; dotBorder = TI.attention; dotSize = 14;
                        labelCol = TI.attention; dateCol = TI.attention; labelW = 600;
                      } else if (isPast) {
                        // Evento encerrado: prazos passados viram "cumpridos"
                        // (verde suave) em vez de cinza apagado — a agenda de um
                        // evento finalizado conta história, não pendência.
                        if (isHistorical) {
                          dotBg = '#d1fae5'; dotBorder = '#10b981'; dotSize = 12;
                          labelCol = '#6b7f75'; dateCol = '#0f766e'; labelW = 500;
                        } else {
                          dotBg = '#D8D4CE'; dotBorder = '#D8D4CE'; dotSize = 10;
                          labelCol = '#B8B2A8'; dateCol = '#B8B2A8'; labelW = 500;
                        }
                      } else {
                        dotBg = TI.card; dotBorder = TI.line; dotSize = 12;
                        labelCol = TI.secondary; dateCol = TI.secondary; labelW = 500;
                      }

                      return (
                        <div
                          key={label}
                          title={adjusted === 'fri' ? `${label} — movido de sáb para sex` : adjusted === 'mon' ? `${label} — movido de dom para seg` : label}
                          style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', zIndex: 2 }}
                        >
                          {/* Dot — 40px container so all centers align on track */}
                          <div style={{ width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', marginBottom: '10px' }}>
                            {glowColor && (
                              <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', backgroundColor: glowColor, filter: 'blur(6px)' }} />
                            )}
                            <div style={{
                              width: `${dotSize}px`, height: `${dotSize}px`, borderRadius: '50%',
                              backgroundColor: dotBg,
                              border: dotSize <= 10 ? 'none' : `2px solid ${dotBorder}`,
                              boxShadow: isNext ? `0 0 0 5px rgba(217,122,30,0.12)` : 'none',
                              position: 'relative', zIndex: 1,
                            }} />
                          </div>

                          {/* Label */}
                          <span style={{
                            fontSize: '10px', fontWeight: labelW, textTransform: 'uppercase',
                            letterSpacing: '0.07em', color: labelCol,
                            textAlign: 'center', lineHeight: 1.45,
                            fontFamily: "'Space Grotesk', sans-serif",
                            maxWidth: '88px', display: 'block',
                          }}>
                            {label}
                          </span>

                          {/* Date */}
                          <span style={{
                            fontSize: '11px', fontWeight: isNext ? 700 : 500,
                            color: dateCol, fontFamily: "'DM Mono', monospace",
                            marginTop: '5px', display: 'block', letterSpacing: '0.03em',
                          }}>
                            {dateStr}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

            </div>
          );
        })()}
      </div>

      {/* Card de Peças em Rascunho — visual Titanium (antes era Card shadcn
          tracejado + Badge, destoando do resto da página). Os rascunhos vivem
          SÓ aqui; a listagem principal exclui draft/requested. */}
      {draftItems.length > 0 && (
        <>
        <div style={{ backgroundColor: '#fff', border: '1px solid #e7e5e4', borderLeft: '3px solid #b45309', borderRadius: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.05)', marginBottom: 32 }} data-testid="card-draft-items">
          <div style={{ padding: '20px 24px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <Package style={{ width: 16, height: 16, color: '#b45309', flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 800, color: '#1F1D1A', fontFamily: "'Space Grotesk', sans-serif", textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Peças em Rascunho
              </span>
              <span style={{ backgroundColor: '#fffbeb', color: '#b45309', border: '1px solid #fde68a', borderRadius: 999, padding: '2px 10px', fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap' }}>
                {draftItems.length} {draftItems.length === 1 ? 'item' : 'itens'}
              </span>
            </div>
            <p style={{ fontSize: 13, color: '#6F6A63', margin: '8px 0 0' }}>
              Revise os itens abaixo e envie todos para Arte quando estiver pronto
            </p>
          </div>
          <div style={{ padding: '16px 24px 24px' }}>
            <div className="space-y-4 mb-4">
              {(() => {
                // Cap de 50 (padrão da casa): centenas de rascunhos travavam o DOM.
                const DRAFT_CAP = 50;
                const visibleDrafts = showAllDrafts || draftItems.length <= DRAFT_CAP
                  ? draftItems
                  : draftItems.slice(0, DRAFT_CAP);
                // Grupo Pai → Tipo → itens
                const draftGroupMap: Record<string, Record<string, typeof draftItems>> = {};
                visibleDrafts.forEach(item => {
                  const g = groupOf(item.type) || '';
                  if (!draftGroupMap[g]) draftGroupMap[g] = {};
                  if (!draftGroupMap[g][item.type]) draftGroupMap[g][item.type] = [];
                  draftGroupMap[g][item.type].push(item);
                });
                const draftSortedGroups = Object.keys(draftGroupMap).sort((a, b) => {
                  if (a === '') return 1; if (b === '') return -1;
                  return a.localeCompare(b, 'pt-BR');
                });
                return draftSortedGroups.map(groupName => {
                  const typeMap = draftGroupMap[groupName];
                  const sortedTypes = Object.keys(typeMap).sort((a, b) => a.localeCompare(b, 'pt-BR'));
                  return (
                    <div key={groupName || '__sem_grupo__'}>
                      {/* Cabeçalho Grupo Pai */}
                      {groupName && (
                        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#746e69', marginBottom: 6, paddingLeft: 2 }}>
                          {groupName}
                        </div>
                      )}
                      <div className="space-y-3">
                        {sortedTypes.map(typeName => {
                          const typeItems = typeMap[typeName];
                          return (
                            <div key={typeName}>
                              {/* Sub-cabeçalho Tipo */}
                              <div style={{ fontSize: 11, fontWeight: 600, color: '#746e69', marginBottom: 4, paddingLeft: 2 }}>
                                {typeName}
                              </div>
                              <div className="space-y-2">
                                {typeItems.map(item => (
                                  <div key={item.id} className="flex items-center justify-between p-3 border rounded-lg bg-card hover-elevate" data-testid={`draft-item-${item.id}`}>
                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                      <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                                        <Package className="h-4 w-4 text-muted-foreground" />
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                          {item.description && <span className="text-sm text-muted-foreground truncate">— {item.description}</span>}
                                        </div>
                                        <div className="text-xs text-muted-foreground">
                                          {item.quantity} {item.quantity === 1 ? 'unidade' : 'unidades'} • {item.material} • {item.finish} • {parseFloat(item.calculatedM2 || '0').toFixed(2)}m²
                                        </div>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                                      {/* Referência visual */}
                                      {item.referenceUrl && (
                                        <a href={item.referenceUrl} target="_blank" rel="noopener noreferrer" title="Abrir referência visual" data-testid={`link-reference-${item.id}`}>
                                          <img src={item.referenceUrl} className="h-8 w-8 rounded object-cover border border-border" alt="Referência visual" onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                                        </a>
                                      )}
                                      {/* Upload referência — solicitation/admin, em qualquer status
                                          até um status FINAL (não só 'entregue', que nem existe no
                                          vocabulário canônico). Alvos ≥44px no mobile. */}
                                      {canUploadReference && !(FINAL_STATUSES as readonly string[]).includes(item.status) && (
                                        <ObjectUploader
                                          onGetUploadParameters={getUploadUrl}
                                          onComplete={({ url }) => updateReferenceUrlMutation.mutate({ itemId: item.id, referenceUrl: url })}
                                          buttonVariant="ghost"
                                          buttonClassName={isMobile ? "px-3 h-11 text-xs gap-1" : "px-2 h-7 text-xs gap-1"}
                                        >
                                          <Paperclip className="h-3 w-3" />
                                          <span>{item.referenceUrl ? 'Trocar ref.' : 'Ref. visual'}</span>
                                        </ObjectUploader>
                                      )}
                                      {canUploadReference && item.referenceUrl && !(FINAL_STATUSES as readonly string[]).includes(item.status) && (
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="icon"
                                          className={`${isMobile ? "h-11 w-11" : "h-7 w-7"} text-muted-foreground`}
                                          title="Remover referência"
                                          data-testid={`button-remove-reference-${item.id}`}
                                          onClick={() => removeReferenceUrlMutation.mutate(item.id)}
                                        >
                                          <X className="h-3 w-3" />
                                        </Button>
                                      )}
                                      {/* canEditLists (não canManageEvent): mesmo gate da tabela
                                          principal — o papel "solicitação" edita rascunhos. */}
                                      {canEditLists && (
                                        <>
                                          {isEditBlocked(item.status) ? (
                                            <button
                                              type="button"
                                              disabled
                                              aria-disabled="true"
                                              className="p-1.5 rounded-md"
                                              title={motivoEdicaoBloqueada(item.status) ?? undefined}
                                              style={{ color: "#a8a29e", cursor: "not-allowed", background: "none", border: "none" }}
                                            >
                                              <Lock className="h-3.5 w-3.5" />
                                            </button>
                                          ) : (
                                            <Button variant="ghost" size="icon" className={isMobile ? "h-11 w-11" : "h-7 w-7"} onClick={() => handleEditItem(item)} data-testid={`button-edit-draft-${item.id}`}>
                                              <Pencil className="h-3.5 w-3.5" />
                                            </Button>
                                          )}
                                          {canDeleteAny && (
                                            <Button variant="ghost" size="icon" className={`${isMobile ? "h-11 w-11" : "h-7 w-7"} hover:bg-destructive/10`} onClick={() => setDeletingItem(item)} data-testid={`button-delete-draft-${item.id}`}>
                                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                            </Button>
                                          )}
                                        </>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
            {/* Cap de 50 — padrão da casa, igual à listagem principal. */}
            {!showAllDrafts && draftItems.length > 50 && (
              <button
                onClick={() => setShowAllDrafts(true)}
                data-testid="button-show-all-drafts"
                style={{ width: '100%', padding: 13, background: '#ffffff', border: '1px solid #e7e5e4', borderRadius: 10, color: '#1c1917', fontWeight: 700, fontSize: 13, cursor: 'pointer', marginBottom: 16 }}
              >
                Mostrar todos os {draftItems.length} rascunhos (+{draftItems.length - 50})
              </button>
            )}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: 16, backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10 }}>
              <div className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5" style={{ color: '#b45309' }} />
                <div>
                  <p className="text-sm font-semibold">Pronto para enviar?</p>
                  <p className="text-xs text-muted-foreground">
                    {/* draft + requested: o endpoint de envio abrange os dois —
                        contar só 'draft' subestimava a contagem. */}
                    {draftItems.length} {draftItems.length === 1 ? 'item será enviado' : 'itens serão enviados'} para vinculação de patrocinadores
                  </p>
                </div>
              </div>
              <Button
                onClick={() => setSubmitConfirmOpen(true)}
                // Gate: enviar rascunhos para a Arte é ação de admin ou do
                // papel "solicitação" — mesmo critério do title abaixo.
                // Evento finalizado também trava: enviar rascunho é EMPURRAR
                // trabalho para a fila de vinculação, que já não mostra estas
                // peças. (O endpoint vive em server/routes/events.ts e ainda
                // aceita a chamada — este gate é o que segura hoje.)
                disabled={submitDraftsMutation.isPending || eventoFinalizado || !(hasPermission("admin") || user?.role === "solicitacao")}
                title={eventoFinalizado
                  ? avisoEventoFim
                  : !(hasPermission("admin") || user?.role === "solicitacao") ? "Apenas Solicitação ou administradores podem enviar" : undefined}
                size="lg"
                data-testid="button-submit-drafts"
              >
                {submitDraftsMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    Enviar Todos os Itens
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* ── Modal de confirmação de envio com lista de itens ── */}
        <Dialog open={submitConfirmOpen} onOpenChange={setSubmitConfirmOpen}>
          <DialogContent className={HIDE_NATIVE_CLOSE} style={modalSurface(560)}>
            <DialogTitle className="sr-only">Confirmar envio para vinculação</DialogTitle>
            <DialogDescription className="sr-only">
              Revise os itens antes de enviá-los para a vinculação de patrocinadores
            </DialogDescription>
            <ModalHeader
              variant="confirm"
              icon={Check}
              tint="#c2410c"
              title="Confirmar envio para vinculação"
              subtitle={`${draftItems.length} ${draftItems.length === 1 ? 'item será enviado' : 'itens serão enviados'} para a fila de vinculação.`}
              onClose={() => setSubmitConfirmOpen(false)}
            />

            {/* Lista de itens — ALTURA: cabeçalho 93 + lista de até 340 + bloco
                de aviso e botões ~120 = 553px. Numa janela de 445 sobram 397, e
                o Radix cortava 78px em cima e 78 embaixo ao mesmo tempo; os 340
                limitavam a lista, nunca o modal. `flex: 0 1 auto` + `minHeight:
                0` deixa a lista encolher abaixo dos 340 sob o teto do
                `modalSurface`, e a rolagem que já existia passa a ligar. */}
            <div style={{ maxHeight: 340, overflowY: 'auto', padding: '16px 28px', flex: '0 1 auto', minHeight: 0 }}>
              {(() => {
                // draftItems do escopo do componente: draft + requested — a
                // mesma população que o servidor envia.
                const byType: Record<string, typeof draftItems> = {};
                draftItems.forEach(item => {
                  const k = item.type || 'Sem tipo';
                  if (!byType[k]) byType[k] = [];
                  byType[k].push(item);
                });
                return Object.entries(byType).sort(([a],[b]) => a.localeCompare(b,'pt-BR')).map(([typeName, typeItems]) => (
                  <div key={typeName} style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#746e69', marginBottom: 6 }}>
                      {typeName} · {typeItems.length} {typeItems.length === 1 ? 'item' : 'itens'}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {typeItems.map(item => (
                        <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', backgroundColor: '#fafaf9', border: '1px solid #e7e5e4', borderRadius: 8 }}>
                          {/* displayId já vem com "#" do backend — prefixar de
                              novo mostrava "##0281". */}
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#c2410c', fontFamily: 'monospace', flexShrink: 0 }}>
                            {item.displayId ?? '—'}
                          </span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#1c1917', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {item.type}{item.description ? ` — ${item.description}` : ''}
                            </div>
                            <div style={{ fontSize: 11, color: '#746e69', marginTop: 1 }}>
                              {item.quantity} {item.quantity === 1 ? 'un.' : 'un.'} · {item.visualWidth && item.visualHeight ? `${item.visualWidth}×${item.visualHeight}m` : item.material}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ));
              })()}
            </div>

            {/* Aviso + botões */}
            <div style={{ padding: '14px 28px 24px', borderTop: '1px solid #e7e5e4', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, backgroundColor: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, padding: '10px 12px', marginBottom: 16 }}>
                <AlertCircle style={{ width: 14, height: 14, color: '#f97316', flexShrink: 0, marginTop: 1 }} />
                <p style={{ fontSize: 13, color: '#92400e', margin: 0, lineHeight: 1.5 }}>
                  Após o envio, os itens irão para a fila de <strong>Vincular Patrocinadores</strong>. Esta ação não pode ser desfeita.
                </p>
              </div>
              <DialogFooter style={{ gap: 8, flexDirection: 'row', justifyContent: 'flex-end' }}>
                <Button variant="outline" onClick={() => setSubmitConfirmOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  onClick={() => {
                    setSubmitConfirmOpen(false);
                    submitDraftsMutation.mutate();
                  }}
                  data-testid="button-confirm-submit-drafts"
                  disabled={submitDraftsMutation.isPending}
                >
                  {submitDraftsMutation.isPending ? (
                    <><Loader2 style={{ width: 14, height: 14, marginRight: 6 }} className="animate-spin" /> Enviando...</>
                  ) : (
                    <><Check style={{ width: 14, height: 14, marginRight: 6 }} /> Confirmar envio</>
                  )}
                </Button>
              </DialogFooter>
            </div>
          </DialogContent>
        </Dialog>
        </>
      )}

      {/* Indicador de atualização — fora do bloco da lista: também aparece
          quando o evento está vazio ou só tem rascunhos. */}
      {isFetching && !loadingItems && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#746e69', fontSize: '13px', marginBottom: '16px' }}>
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>Atualizando...</span>
        </div>
      )}

      {/* Falha em /api/items: sem este bloco, o erro virava um falso
          "Nenhum item adicionado" (mesmo padrão do erro de evento acima).
          Lista vazia: rascunhos moram no card acima; a listagem só reclama de
          vazio quando não há NADA. Empty-state neutro (Package, não alerta);
          o CTA respeita canEditLists. */}
      {itemsError ? (
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <AlertCircle className="h-12 w-12 mx-auto mb-4" style={{ color: '#b91c1c' }} />
          <p className="text-red-700 font-semibold mb-1">Não foi possível carregar as peças</p>
          <p className="text-muted-foreground text-sm mb-4">Verifique sua conexão e tente novamente.</p>
          <button onClick={() => refetchItems()} className="rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800">
            Tentar novamente
          </button>
        </div>
      ) : mainItems.length === 0 ? (
        draftItems.length > 0 ? null : (
          <div style={{ textAlign: 'center', padding: '64px 0' }}>
            <Package className="h-12 w-12 mx-auto mb-4" style={{ color: '#a8a29e' }} />
            <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1c1917', marginBottom: '8px' }}>Nenhum item adicionado</h3>
            <p style={{ color: '#746e69', marginBottom: '16px', fontSize: '15px' }}>Adicione itens ao evento para começar</p>
            {canEditLists ? (
              <button
                onClick={() => {
                  setEditingItem(null);
                  setBulkMode(true);
                  // Mesmo reset do botão do header: os selects com sentinela
                  // voltam ao modo lista.
                  setCustomMaterial(false);
                  setCustomFinish(false);
                  setOpen(true);
                }}
                style={{ backgroundColor: '#1c1917', color: '#fff', padding: '10px 20px', borderRadius: '6px', fontWeight: '700', fontSize: '15px', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
              >
                <Plus className="h-4 w-4" />
                Adicionar Primeiro Item
              </button>
            ) : (
              <p style={{ fontSize: 12, color: '#746e69', margin: 0 }}>
                Somente leitura — seu perfil não edita a lista deste evento
              </p>
            )}
          </div>
        )
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '48px' }}>
          {/* Busca local de peças — evita rolagem cega em eventos grandes. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: '-24px' }}>
            <div style={{ position: 'relative', width: isMobile ? '100%' : 280 }}>
              <Search style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', width: 13, height: 13, color: '#a8a29e', pointerEvents: 'none' }} />
              <input
                type="text"
                aria-label="Buscar peça por ID, tipo ou status"
                placeholder="Buscar peça (ID, tipo, status)..."
                value={itemSearch}
                onChange={e => setItemSearch(e.target.value)}
                data-testid="input-search-event-items"
                style={{ width: '100%', height: 34, paddingLeft: 32, paddingRight: 12, border: '1px solid #e7e5e4', borderRadius: 999, backgroundColor: '#ffffff', fontSize: 13, color: '#1c1917', fontFamily: 'inherit' }}
              />
            </div>
            {(itemSearchLower || statusFilter.length > 0) && (
              <span style={{ fontSize: 12, fontWeight: 700, color: '#746e69' }}>
                {searchedItems.length} de {mainItems.length} peças
                <button onClick={() => { setItemSearch(""); setStatusFilter([]); }} style={{ marginLeft: 10, background: 'none', border: 'none', padding: 0, fontSize: 12, fontWeight: 700, color: '#c2410c', cursor: 'pointer' }}>× Limpar</button>
              </span>
            )}
          </div>

          {searchedItems.length === 0 && (
            <div style={{ backgroundColor: '#ffffff', border: '1px solid #e7e5e4', borderRadius: 12, padding: '40px 24px', textAlign: 'center' }}>
              <p style={{ color: '#1c1917', fontSize: 14, fontWeight: 700, margin: '0 0 4px' }}>
                {statusFilter.length > 0 ? 'Nenhuma peça corresponde aos filtros' : 'Nenhuma peça corresponde à busca'}
              </p>
              <p style={{ color: '#746e69', fontSize: 13, margin: 0 }}>
                {statusFilter.length > 0 ? 'Tente outro termo, ou limpe a busca ou o filtro de status.' : 'Tente outro termo ou limpe a busca.'}
              </p>
            </div>
          )}

          {sortedGroups.map(group => (
            <Fragment key={group || '__nogroup'}>
              {/* ── Grupo Pai header ── */}
              {group && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px', marginTop: '8px' }}>
                  <span style={{
                    backgroundColor: '#dbeafe', color: '#1d4ed8',
                    fontSize: '11px', fontWeight: '900', letterSpacing: '0.12em',
                    textTransform: 'uppercase', padding: '4px 14px', borderRadius: '999px',
                    fontFamily: "'Space Grotesk', sans-serif", whiteSpace: 'nowrap',
                  }}>
                    {group}
                  </span>
                  <div style={{ flex: 1, height: '1px', backgroundColor: '#bfdbfe' }} />
                </div>
              )}

              {Object.entries(groupMap[group]).map(([type, typeItems]) => (
              <section key={type} style={{ marginBottom: group ? '32px' : '48px' }}>
                {/* Cabeçalho do tipo */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
                  <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: group ? '16px' : '22px', fontWeight: '700', letterSpacing: '-0.03em', color: '#1a1c1c', margin: 0, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                    {type}
                  </h2>
                  <div style={{ flex: 1, height: '2px', backgroundColor: '#f0efee' }} />
                  <span style={{ backgroundColor: '#f3f4f3', color: '#746e69', fontSize: '10px', fontWeight: '700', padding: '4px 12px', borderRadius: '999px', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>
                    {typeItems.length} {typeItems.length === 1 ? 'ITEM' : 'ITENS'}
                  </span>
                </div>

                {/* Tabela do grupo */}
                <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', overflow: 'hidden' }}>
                  {isMobile ? (
                    <div style={{ padding: '8px' }}>
                      {typeItems.map(item => (
                        /* Card com onClick e sem foco: no celular o toque
                           resolve, mas com teclado externo (ou leitor de tela)
                           não havia como abrir a peça. O ID vira o alvo
                           focável — é o rótulo natural do card.
                           #f97316 sobre branco dá 2.80:1; o laranja de ação
                           escuro passa e mantém a identidade. */
                        <div key={item.id} onClick={() => setSelectedItemForDetails(item)}
                          style={{ backgroundColor: '#fff', border: '1px solid #e7e5e4', borderRadius: 8, padding: '12px 12px', marginBottom: 8, cursor: 'pointer' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                            <button
                              onClick={e => { e.stopPropagation(); setSelectedItemForDetails(item); }}
                              aria-label={`Ver detalhes da peça ${item.displayId}`}
                              style={{ fontFamily: 'monospace', fontWeight: 700, color: '#c2410c', fontSize: 13, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                            >
                              {item.displayId}
                            </button>
                            <StatusBadge status={item.status} />
                          </div>
                          {item.parentItemId && (
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, backgroundColor: '#fff7ed', border: '1px solid #fed7aa', color: '#c2410c', borderRadius: 6, padding: '2px 7px', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
                              <Plus style={{ width: 9, height: 9 }} /> Compl. de {item.parent?.displayId ?? 'peça original'}
                            </div>
                          )}
                          <div style={{ fontWeight: 700, fontSize: 13, color: '#1c1917', marginBottom: 2 }}>{item.type}</div>
                          {item.description && <div style={{ fontSize: 13, color: '#746e69', marginBottom: 4 }}>{item.description}</div>}
                          {item.parentItemId && item.complementReason && (
                            <div style={{ fontSize: 11, color: '#7c2d12', marginBottom: 4, lineHeight: 1.4 }}>
                              {item.complementRequestedBy ? <strong>{item.complementRequestedBy}: </strong> : null}{item.complementReason}
                            </div>
                          )}
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 11, color: '#746e69' }}>
                            {item.quantity && <span>{item.quantity}×</span>}
                            {item.visualWidth && item.visualHeight && <span>{item.visualWidth}×{item.visualHeight}m</span>}
                            {item.material && <span>{item.material}</span>}
                          </div>
                          {canEditLists && (
                            <div style={{ display: 'flex', gap: 6, marginTop: 8 }} onClick={e => e.stopPropagation()}>
                              {/* handleEditItem (não setEditingItem cru): hidrata o
                                  formData — sem isso, salvar apagava a peça. */}
                              {/* `disabled` real, e não só o early-return de
                                  handleEditItem: no celular um botão que
                                  aceita o toque e não abre nada lê como app
                                  travado. O title carrega o motivo. */}
                              <button onClick={() => handleEditItem(item)}
                                disabled={isEditBlocked(item.status)}
                                title={motivoEdicaoBloqueada(item.status) ?? undefined}
                                style={{ flex: 1, minHeight: 44, borderRadius: 6, border: '1px solid #e7e5e4', background: '#fafaf9', fontSize: 13, fontWeight: 700, color: isEditBlocked(item.status) ? '#a8a29e' : '#746e69', cursor: isEditBlocked(item.status) ? 'not-allowed' : 'pointer' }}>
                                Editar
                              </button>
                              {/* Aumentar quantidade NÃO mora aqui: o gatilho
                                  é exclusivo da tela da Gráfica (decisão do dono). */}
                              {/* Mesmos gates do desktop: sem eles, no celular um
                                  não-admin abria exclusão de peça já em produção. */}
                              {canDeleteAny && canDeleteItem(item.status) && (
                                <button onClick={() => setDeletingItem(item)}
                                  aria-label="Excluir peça" title="Excluir peça"
                                  style={{ minHeight: 44, width: 44, borderRadius: 6, border: '1px solid #fecaca', background: '#fff', color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <Trash2 style={{ width: 14, height: 14 }} />
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                  // Rolagem horizontal própria por seção, mas com table-layout
                  // fixed e as MESMAS larguras de coluna em todas as seções —
                  // assim as colunas alinham visualmente entre os tipos, como
                  // se fosse uma tabela só. Material/Acabamento viraram a 2ª
                  // linha da Descrição (11→9 colunas), o que baixou o minWidth
                  // de 1120 para 840.
                  <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', minWidth: 840, borderCollapse: 'collapse', textAlign: 'left', tableLayout: 'fixed' }}>
                    <thead>
                      <tr>
                        {([
                          ['ID', 76],
                          ['Referência', 96],
                          ['Descrição', undefined],
                          ['Qtd', 52],
                          ['Dimensões (V / A)', 168],
                          ['M²', 64],
                          ['Patrocinador', 130],
                          ['Status', 150],
                          ['Ações', 110],
                        ] as const).map(([col, width]) => (
                          <th
                            key={col}
                            style={{
                              padding: '14px 14px',
                              fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.08em',
                              // #a8a29e em 11px reprova AA (2,5:1 sobre #f9f9f8).
                              color: '#746e69', whiteSpace: 'nowrap',
                              textAlign: col === 'Ações' ? 'right' : 'left',
                              width,
                              backgroundColor: '#fafaf9',
                            }}>
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {typeItems.map(item => (
                        <tr
                          key={item.id}
                          className="group"
                          style={{ borderTop: '1px solid #f5f5f4', cursor: 'pointer', transition: 'background-color 0.1s' }}
                          onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f9f9f8')}
                          onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                          onClick={() => setSelectedItemForDetails(item)}
                          data-testid={`row-item-${item.id}`}
                        >
                          {/* ID */}
                          {/* A linha abre o detalhe no clique, mas <tr> não
                              recebe foco: sem mouse não havia como abrir peça
                              nenhuma. O ID é o alvo focável.
                              displayId já vem com a cerquilha do backend
                              ("#2341"); prefixar de novo mostrava "##2341". */}
                          {/* Complemento recua 12px e ganha um conector em L: como
                              a ordenação já o cola na mãe, o recuo é o que faz a
                              relação ser lida sem legenda. */}
                          <td style={{ padding: '14px 14px', paddingLeft: item.parentItemId ? 26 : undefined }}>
                            {item.parentItemId && (
                              <span aria-hidden style={{ display: 'inline-block', width: 9, height: 7, marginRight: 5, marginBottom: 2, borderLeft: '1px solid #fdba74', borderBottom: '1px solid #fdba74', borderBottomLeftRadius: 3, verticalAlign: 'middle' }} />
                            )}
                            <button
                              onClick={e => { e.stopPropagation(); setSelectedItemForDetails(item); }}
                              aria-label={`Ver detalhes da peça ${item.displayId}`}
                              style={{ fontWeight: 700, color: '#c2410c', fontSize: '13px', fontFamily: 'monospace', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                              data-testid={`text-display-id-${item.id}`}
                            >
                              {item.displayId}
                            </button>
                          </td>
                          {/* Ref. */}
                          <td style={{ padding: '14px 14px' }} onClick={e => e.stopPropagation()}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              {item.referenceUrl && (
                                <a href={item.referenceUrl} target="_blank" rel="noopener noreferrer" title="Ver referência" data-testid={`link-reference-table-${item.id}`}>
                                  <img src={item.referenceUrl} style={{ height: 32, width: 32, objectFit: 'cover', borderRadius: 6, border: '1px solid #e7e5e4' }} alt="Referência visual" onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                                </a>
                              )}
                              {canUploadReference && !(FINAL_STATUSES as readonly string[]).includes(item.status) && (
                                <ObjectUploader
                                  onGetUploadParameters={getUploadUrl}
                                  onComplete={({ url }) => updateReferenceUrlMutation.mutate({ itemId: item.id, referenceUrl: url })}
                                  buttonVariant="ghost"
                                  buttonClassName="h-7 w-7 p-0"
                                >
                                  {/* O `title` estava no ícone lucide, que não
                                      aceita a prop e a descartava: a dica nunca
                                      apareceu. Num <span> ela funciona, e o
                                      aria-label nomeia o controle para quem usa
                                      leitor de tela. #f97316 sobre branco dá
                                      2.80:1 — o laranja escuro passa. */}
                                  <span
                                    title={item.referenceUrl ? "Substituir referência" : "Adicionar referência"}
                                    aria-label={item.referenceUrl ? "Substituir referência" : "Adicionar referência"}
                                    style={{ display: 'inline-flex' }}
                                  >
                                    <Paperclip style={{ width: 13, height: 13, color: item.referenceUrl ? '#c2410c' : '#746e69' }} />
                                  </span>
                                </ObjectUploader>
                              )}
                              {canUploadReference && item.referenceUrl && !(FINAL_STATUSES as readonly string[]).includes(item.status) && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-muted-foreground"
                                  title="Remover referência"
                                  data-testid={`button-remove-reference-table-${item.id}`}
                                  onClick={() => removeReferenceUrlMutation.mutate(item.id)}
                                >
                                  <X style={{ width: 11, height: 11 }} />
                                </Button>
                              )}
                              {(!canUploadReference || (FINAL_STATUSES as readonly string[]).includes(item.status)) && !item.referenceUrl && (
                                <span style={{ color: '#746e69', fontSize: 13 }}>—</span>
                              )}
                            </div>
                          </td>
                          {/* Descrição — Material/Acabamento entram aqui como
                              2ª linha, em vez de duas colunas próprias. O gate
                              do badge usa PRODUCTION_STATUSES canônico (os
                              nomes antigos não existem e nunca escondiam nada). */}
                          <td style={{ padding: '14px 14px' }}>
                            {/* Parentesco do complemento. Aqui é badge OUTLINE e
                                sem tingir a linha: nesta tela ninguém precisa de
                                alarme (o alarme é da fila da Gráfica), só de
                                entender por que #0062-C1 existe. O motivo vai no
                                title — a linha da tabela não tem espaço para ele
                                e a ficha mostra por extenso. */}
                            {item.parentItemId && (
                              <div
                                title={item.complementReason ? `Motivo: ${item.complementReason}` : undefined}
                                data-testid={`badge-complemento-${item.id}`}
                                style={{ display: "inline-flex", alignItems: "center", gap: 4, backgroundColor: "#fff7ed", border: "1px solid #fed7aa", color: "#c2410c", borderRadius: 6, padding: "2px 7px", fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}
                              >
                                <Plus style={{ width: 9, height: 9 }} /> Compl. de {item.parent?.displayId ?? "peça original"}
                              </div>
                            )}
                            {!item.parentItemId && item.complements?.length > 0 && (
                              <div
                                title={`Complementos: ${item.complements.map((c: any) => `${c.displayId} (+${c.quantity})`).join(", ")}`}
                                data-testid={`badge-tem-complemento-${item.id}`}
                                style={{ display: "inline-flex", alignItems: "center", gap: 4, backgroundColor: "#ffffff", border: "1px solid #fed7aa", color: "#c2410c", borderRadius: 6, padding: "2px 7px", fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}
                              >
                                Tem complemento (+{item.complements.reduce((a: number, c: any) => a + (Number(c.quantity) || 0), 0)})
                              </div>
                            )}
                            {item.isReuse && !(PRODUCTION_STATUSES as readonly string[]).includes(item.status) && (
                              <div style={{ display: "inline-flex", alignItems: "center", gap: 4, backgroundColor: "#047857", color: "#ffffff", borderRadius: 6, padding: "2px 7px", fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
                                <Recycle style={{ width: 9, height: 9 }} /> Reaproveit.
                              </div>
                            )}
                            {item.description ? (
                              <div style={{ fontWeight: '500', color: '#1a1c1c', fontSize: '13px' }}>{item.description}</div>
                            ) : (
                              <div style={{ color: '#746e69', fontSize: '13px' }}>—</div>
                            )}
                            {(item.material || item.finish) && (
                              <div style={{ fontSize: '11px', color: '#746e69', marginTop: 2 }}>
                                {[item.material, item.finish].filter(Boolean).join(' · ')}
                              </div>
                            )}
                          </td>
                          {/* Qtd — sem padStart: "05" parecia código, não quantidade. */}
                          <td style={{ padding: '14px 14px', fontSize: '13px', color: '#1a1c1c' }}>
                            {item.quantity}
                          </td>
                          {/* Dimensões */}
                          <td style={{ padding: '14px 14px', fontSize: '13px', color: '#746e69', fontStyle: 'italic' }}>
                            {(item.visualWidth && item.visualHeight) ? (
                              <>
                                {item.visualWidth} × {item.visualHeight}m
                                {(item.fileWidth && item.fileHeight) ? ` / ${item.fileWidth} × ${item.fileHeight}m` : ''}
                              </>
                            ) : '—'}
                          </td>
                          {/* M² */}
                          <td style={{ padding: '14px 14px', fontSize: '13px', fontWeight: '800', color: '#1a1c1c' }}>
                            {parseFloat(item.calculatedM2 || '0').toFixed(2)}
                          </td>
                          {/* Patrocinador */}
                          {/* Antes era "—" hardcoded: o vínculo existia no dado
                              (enrich do /api/items/:eventId) e nunca aparecia. */}
                          <td style={{ padding: '14px 14px', fontSize: '13px', color: '#1a1c1c' }}>
                            {(item.sponsors && item.sponsors.length > 0)
                              ? item.sponsors.map((s: any) => s.name).join(", ")
                              : <span style={{ color: '#746e69' }}>—</span>}
                          </td>
                          {/* Status — rótulo curto: com tableLayout fixed o
                              rótulo completo ("Aguardando Vinculação") vazava
                              por baixo dos ícones de Ações.

                              E o selo virou ATALHO para a Arte (regra do dono):
                              quem lê "Aguardando Envio" aqui está a um clique de
                              onde a peça se resolve, em vez de abrir a Arte e
                              refazer o filtro à mão.

                              `faseDaArte` deriva de TAB_STATUSES (lib/arte-rules),
                              que é A definição do que cada aba da Arte atende —
                              não um segundo mapa escrito aqui. Quando ela devolve
                              `null` a Arte não trata aquele status (peça entregue,
                              cancelada, em produção) e o selo continua sendo só um
                              selo: link que abre a tela errada é pior que nenhum.

                              Os três parâmetros são os que a Arte já lê: a ABA, o
                              EVENTO e a BUSCA pelo código da peça — o recorte mais
                              estreito que ela sabe aplicar. */}
                          <td style={{ padding: '14px 14px' }}>
                            {(() => {
                              const fase = faseDaArte(item.status);
                              if (!fase) return <StatusBadge status={item.status} short />;
                              const alvo = `/arte?fase=${fase}&evento=${item.eventId}&busca=${String(item.displayId ?? "").replace("#", "")}`;
                              return (
                                <Link
                                  href={alvo}
                                  title={`Abrir esta peça na Arte, já na aba e no evento dela`}
                                  data-testid={`link-arte-${item.id}`}
                                  style={{ textDecoration: "none", display: "inline-block", borderRadius: 999 }}
                                >
                                  <StatusBadge status={item.status} short />
                                </Link>
                              );
                            })()}
                          </td>
                          {/* Ações — sempre visíveis (hover esconderia; no toque
                              não há hover), mas SÓ para quem edita a lista: o
                              mesmo gate canEditLists do mobile. Antes o desktop
                              não tinha gate nenhum. */}
                          <td style={{ padding: '14px 14px', width: 110 }}>
                            {canEditLists && (
                            <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end', alignItems: 'center' }}>
                              {/* Aumentar quantidade — só depois que a peça entrou
                                  em produção, e nunca num complemento (o segundo
                                  aumento se pede na mãe). Antes deste botão, o
                                  único gesto disponível era editar o número, que o
                                  servidor agora recusa com 409. */}
                              {/* Toggle reaproveitamento — disponível enquanto não estiver em produção/entregue */}
                              {!isEditBlocked(item.status) && (
                                <button
                                  title={item.isReuse ? "Reaproveitamento ativo — clique para desativar" : "Marcar como reaproveitamento"}
                                  aria-label={item.isReuse ? "Desativar reaproveitamento" : "Marcar como reaproveitamento"}
                                  aria-pressed={item.isReuse}
                                  disabled={updateItemIsReuseMutation.isPending}
                                  onClick={e => {
                                    e.stopPropagation();
                                    updateItemIsReuseMutation.mutate(
                                      { itemId: item.id, isReuse: !item.isReuse },
                                      {
                                        onSuccess: () => toast({
                                          title: "Peça atualizada",
                                          description: item.isReuse ? "Marca de reaproveitamento removida" : "Peça marcada como reaproveitamento",
                                        }),
                                      },
                                    );
                                  }}
                                  data-testid={`button-reuse-item-${item.id}`}
                                  style={{ background: item.isReuse ? '#d1fae5' : 'none', border: item.isReuse ? '1px solid #6ee7b7' : 'none', borderRadius: '6px', padding: '6px', cursor: updateItemIsReuseMutation.isPending ? 'wait' : 'pointer', opacity: updateItemIsReuseMutation.isPending ? 0.5 : 1, color: item.isReuse ? '#065f46' : '#78716c', transition: 'all 0.15s', display: 'flex', alignItems: 'center' }}
                                  onMouseEnter={e => { if (!item.isReuse) { e.currentTarget.style.color = '#065f46'; e.currentTarget.style.backgroundColor = '#d1fae5'; } }}
                                  onMouseLeave={e => { if (!item.isReuse) { e.currentTarget.style.color = '#746e69'; e.currentTarget.style.backgroundColor = 'transparent'; } }}
                                >
                                  <Recycle className="h-4 w-4" />
                                </button>
                              )}
                              {isEditBlocked(item.status) ? (
                                <button
                                  type="button"
                                  disabled
                                  aria-disabled="true"
                                  title={motivoEdicaoBloqueada(item.status) ?? undefined}
                                  style={{ color: '#a8a29e', padding: '6px', cursor: 'not-allowed', background: 'none', border: 'none' }}
                                  data-testid={`button-edit-item-${item.id}`}
                                >
                                  <Lock className="h-4 w-4" />
                                </button>
                              ) : (
                                <button
                                  style={{ color: '#746e69', background: 'none', border: 'none', cursor: 'pointer', padding: '6px', borderRadius: '6px', transition: 'color 0.15s, background-color 0.15s' }}
                                  onMouseEnter={e => { e.currentTarget.style.color = '#1a1c1c'; e.currentTarget.style.backgroundColor = '#f0efee'; }}
                                  onMouseLeave={e => { e.currentTarget.style.color = '#746e69'; e.currentTarget.style.backgroundColor = 'transparent'; }}
                                  onClick={e => { e.stopPropagation(); handleEditItem(item); }}
                                  data-testid={`button-edit-item-${item.id}`}
                                  title="Editar peça" aria-label="Editar peça"
                                >
                                  <Pencil className="h-4 w-4" />
                                </button>
                              )}
                              {canDeleteAny && (
                                canDeleteItem(item.status) ? (
                                  <button
                                    style={{ color: '#746e69', background: 'none', border: 'none', cursor: 'pointer', padding: '6px', borderRadius: '6px', transition: 'color 0.15s, background-color 0.15s' }}
                                    onMouseEnter={e => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.backgroundColor = '#fef2f2'; }}
                                    onMouseLeave={e => { e.currentTarget.style.color = '#746e69'; e.currentTarget.style.backgroundColor = 'transparent'; }}
                                    onClick={e => { e.stopPropagation(); handleDeleteItem(item); }}
                                    data-testid={`button-delete-item-${item.id}`}
                                    title="Excluir peça" aria-label="Excluir peça"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    disabled
                                    aria-disabled="true"
                                    style={{ color: '#a8a29e', padding: '6px', cursor: 'not-allowed', background: 'none', border: 'none' }}
                                    title="Exclusão bloqueada — peça já está em Arte ou produção"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                )
                              )}
                            </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                  )}
                </div>
              </section>
            ))}
            </Fragment>
          ))}
          {hiddenItemCount > 0 && (
            <button
              onClick={() => setShowAllItems(true)}
              data-testid="button-show-all-event-items"
              style={{ width: '100%', padding: 13, background: '#ffffff', border: '1px solid #e7e5e4', borderRadius: 10, color: '#1c1917', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
            >
              Mostrar todas as {searchedItems.length} peças (+{hiddenItemCount})
            </button>
          )}
        </div>
      )}

      {/* Dialog de Detalhes do Item — a ficha vira editável (o componente já
          suporta onEditSave) apenas para quem pode editar a lista. Só os
          campos que o modo de edição da ficha toca vão no PATCH. */}
      <ItemDetailsDialog
        item={selectedItemForDetails}
        auditLogs={auditLogs}
        open={!!selectedItemForDetails}
        onOpenChange={(open) => !open && setSelectedItemForDetails(null)}
        customActions={temBlocoDeComplemento(selectedItemForDetails, false, false) ? (
          <ComplementoDaFicha
            item={selectedItemForDetails}
            canEditLists={false}
            onAbrirPeca={(id) => {
              const alvo = items.find((i: any) => i.id === id);
              if (alvo) setSelectedItemForDetails(alvo);
            }}
          />
        ) : undefined}
        onEditSave={canEditLists && !eventoFinalizado ? (edited: any) => updateItemMutation.mutate({
          id: edited.id,
          data: {
            type: edited.type,
            material: edited.material,
            finish: edited.finish,
            description: edited.description,
            quantity: edited.quantity,
            visualWidth: edited.visualWidth,
            visualHeight: edited.visualHeight,
            fileWidth: edited.fileWidth,
            fileHeight: edited.fileHeight,
            measurement: edited.measurement,
            observations: edited.observations,
          },
        }) : undefined}
      />

      {/* Aumento de quantidade pós-produção. Monta o modal uma vez para toda a
          tela: ele é aberto pela ficha da peça, pela linha da tabela, pelo card
          do celular, pelo campo Qtd. travado do form de edição e pelo 409
          USE_COMPLEMENT — cinco gestos, um único fluxo. */}
      <AumentarQuantidadeDialog
        item={complementItem}
        event={event}
        open={!!complementItem}
        sugestao={complementSugestao}
        onOpenChange={(o) => { if (!o) { setComplementItem(null); setComplementSugestao(null); } }}
        onCreated={(child) => {
          // Abre a ficha da peça-filha recém-criada: sem isto o usuário fica
          // olhando para a lista tentando adivinhar o que mudou.
          if (child?.id) setSelectedItemForDetails(child);
        }}
      />

      {/* ── ENCERRAR EVENTO ──
          A confirmação diz o NÚMERO real ("12 peças pendentes, sendo 3 em
          produção") e o que a ação FAZ e NÃO FAZ. Nenhuma peça muda de status:
          é por isso que reabrir devolve o evento exatamente como estava. */}
      <AlertDialog open={closeDialogOpen} onOpenChange={(o) => { if (!o && !closeEventMutation.isPending) setCloseDialogOpen(false); }}>
        <AlertDialogContent style={{ width: "96vw", maxWidth: 460, backgroundColor: "#ffffff", borderRadius: "16px", padding: "32px", border: "none", boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }}>
          <AlertDialogHeader style={{ padding: 0, marginBottom: "20px" }}>
            <AlertDialogTitle style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "18px", fontWeight: 900, letterSpacing: "-0.03em", color: "#1a1c1c" }}>
              Encerrar evento
            </AlertDialogTitle>
            <AlertDialogDescription style={{ fontSize: "15px", color: "#746e69", lineHeight: 1.6, marginTop: "6px" }}>
              <span style={{ display: "block", fontWeight: 700, color: "#1a1c1c", marginBottom: 8 }}>
                {event.name}
              </span>
              {openWork.abertas > 0 ? (
                <span style={{ display: 'block', marginBottom: 8 }}>
                  Este evento tem <strong style={{ color: '#1a1c1c' }}>{openWork.abertas} {openWork.abertas === 1 ? 'peça pendente' : 'peças pendentes'}</strong>
                  {openWork.emProducao > 0 ? `, sendo ${openWork.emProducao} em produção` : ''}
                  . Elas não são canceladas nem entregues — continuam nesta lista, mas param de ser cobradas na Gestão de Prazos e saem das filas de trabalho.
                </span>
              ) : (
                <span style={{ display: 'block', marginBottom: 8 }}>
                  {openWork.ativas > 0
                    ? `Todas as ${openWork.ativas} peças já estão entregues.`
                    : 'Este evento não tem nenhuma peça.'}
                </span>
              )}
              <span style={{ display: 'block' }}>
                O evento segue visível no histórico e na consulta. A ação fica registrada com seu nome e horário, e pode ser desfeita em "Reabrir Evento".
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter style={{ padding: 0, display: "flex", flexDirection: "row", justifyContent: "flex-end", gap: "10px" }}>
            <AlertDialogCancel
              disabled={closeEventMutation.isPending}
              style={{ padding: "10px 20px", backgroundColor: "#ffffff", border: "1.5px solid #e7e5e4", borderRadius: "8px", fontSize: "13px", fontWeight: 700, color: "#57534e", cursor: "pointer" }}
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              // preventDefault: o AlertDialogAction fecha o diálogo no clique;
              // sem isto o toast com a contagem real se perde.
              onClick={(e) => { e.preventDefault(); closeEventMutation.mutate(); }}
              disabled={closeEventMutation.isPending}
              data-testid="button-confirm-close-event"
              style={{ padding: "10px 20px", backgroundColor: "#57534e", border: "none", borderRadius: "8px", fontSize: "13px", fontWeight: 700, color: "#ffffff", cursor: closeEventMutation.isPending ? "wait" : "pointer", opacity: closeEventMutation.isPending ? 0.5 : 1, display: "flex", alignItems: "center", gap: 7 }}
            >
              <Lock className="h-4 w-4" />
              {closeEventMutation.isPending ? "Encerrando..." : "Encerrar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── REABRIR EVENTO ── */}
      <AlertDialog open={reopenDialogOpen} onOpenChange={(o) => { if (!o && !reopenEventMutation.isPending) setReopenDialogOpen(false); }}>
        <AlertDialogContent style={{ width: "96vw", maxWidth: 440, backgroundColor: "#ffffff", borderRadius: "16px", padding: "32px", border: "none", boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }}>
          <AlertDialogHeader style={{ padding: 0, marginBottom: "20px" }}>
            <AlertDialogTitle style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "18px", fontWeight: 900, letterSpacing: "-0.03em", color: "#1a1c1c" }}>
              Reabrir evento
            </AlertDialogTitle>
            <AlertDialogDescription style={{ fontSize: "15px", color: "#746e69", lineHeight: 1.6, marginTop: "6px" }}>
              <span style={{ display: "block", fontWeight: 700, color: "#1a1c1c", marginBottom: 8 }}>
                {event.name}
              </span>
              Volta para a Gestão de Prazos e para as filas de trabalho
              {openWork.abertas > 0
                ? ` com ${openWork.abertas} ${openWork.abertas === 1 ? 'peça em aberto' : 'peças em aberto'}${openWork.emProducao > 0 ? ` (${openWork.emProducao} em produção)` : ''}`
                : ''}
              . Os prazos passam a ser cobrados de novo. A reabertura fica registrada com seu nome e horário.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter style={{ padding: 0, display: "flex", flexDirection: "row", justifyContent: "flex-end", gap: "10px" }}>
            <AlertDialogCancel
              disabled={reopenEventMutation.isPending}
              style={{ padding: "10px 20px", backgroundColor: "#ffffff", border: "1.5px solid #e7e5e4", borderRadius: "8px", fontSize: "13px", fontWeight: 700, color: "#57534e", cursor: "pointer" }}
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); reopenEventMutation.mutate(); }}
              disabled={reopenEventMutation.isPending}
              data-testid="button-confirm-reopen-event"
              style={{ padding: "10px 20px", backgroundColor: "#15803d", border: "none", borderRadius: "8px", fontSize: "13px", fontWeight: 700, color: "#ffffff", cursor: reopenEventMutation.isPending ? "wait" : "pointer", opacity: reopenEventMutation.isPending ? 0.5 : 1, display: "flex", alignItems: "center", gap: 7 }}
            >
              <Unlock className="h-4 w-4" />
              {reopenEventMutation.isPending ? "Reabrindo..." : "Reabrir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deletingItem} onOpenChange={(o) => { if (!o) setDeletingItem(null); }}>
        <AlertDialogContent style={{ width: "96vw", maxWidth: 400, backgroundColor: "#ffffff", borderRadius: "16px", padding: "32px", border: "none", boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }}>
          <AlertDialogHeader style={{ padding: 0, marginBottom: "24px" }}>
            <AlertDialogTitle style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "18px", fontWeight: 900, letterSpacing: "-0.03em", color: "#1a1c1c" }}>
              Confirmar Exclusão
            </AlertDialogTitle>
            <AlertDialogDescription style={{ fontSize: "15px", color: "#746e69", lineHeight: 1.6, marginTop: "6px" }}>
              {deletingItem && (
                <span style={{ display: "block", fontWeight: 700, color: "#1a1c1c", marginBottom: 6 }}>
                  Excluir a peça {deletingItem.displayId ?? ""} — {deletingItem.type ?? "sem tipo"}?
                  {deletingItem.description ? ` (${deletingItem.description})` : ""}
                </span>
              )}
              A peça será removida da lista, mas permanece no histórico de auditoria para rastreabilidade.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter style={{ padding: 0, display: "flex", flexDirection: "row", justifyContent: "flex-end", gap: "10px" }}>
            <AlertDialogCancel
              style={{ padding: "9px 20px", backgroundColor: "transparent", border: "none", borderRadius: "8px", fontSize: "15px", fontWeight: 600, color: "#746e69", cursor: "pointer" }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#f3f4f3")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              // preventDefault: o AlertDialogAction fecha o diálogo no clique;
              // sem impedir, o "Excluindo…" nunca chegava a aparecer. O
              // fechamento acontece no onSuccess da mutation.
              onClick={(e) => {
                e.preventDefault();
                if (deletingItem && !deleteItemMutation.isPending) deleteItemMutation.mutate(deletingItem.id);
              }}
              disabled={deleteItemMutation.isPending}
              data-testid="button-confirm-delete-item"
              style={{ padding: "9px 20px", backgroundColor: "#b91c1c", border: "none", borderRadius: "8px", fontSize: "15px", fontWeight: 700, color: "#ffffff", cursor: deleteItemMutation.isPending ? "wait" : "pointer", opacity: deleteItemMutation.isPending ? 0.7 : 1, transition: "background-color 0.15s" }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#dc2626")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#b91c1c")}
            >
              {deleteItemMutation.isPending ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog separado para editar item */}
      <Dialog open={editDialogOpen} onOpenChange={(o) => { if (!o) handleCloseEditDialog(); }}>
        <DialogContent className={HIDE_NATIVE_CLOSE} style={{ maxWidth: isMobile ? "95vw" : "800px", width: "100%", padding: "0", backgroundColor: "#ffffff", borderRadius: "16px", overflow: "hidden", maxHeight: "90vh", display: "flex", flexDirection: "column" }}>
          {/* POR QUE congelar aqui: o onSuccess de atualizar peça invalida
              /api/items, fecha este diálogo e faz `setEditingItem(null)` no
              mesmo commit — e é `editingItem` que escreve o título
              ("PEC-123 — Backdrop") e o subtítulo do cabeçalho. Sem congelar,
              o cabeçalho cai para "Editar Peça" genérico durante o fade, e os
              renders da invalidação ainda batem na subárvore em desmontagem. */}
          <FreezeWhileClosing open={editDialogOpen}>
          <DialogTitle className="sr-only">Editar Peça</DialogTitle>
          <DialogDescription className="sr-only">Atualize as informações da peça</DialogDescription>
          <ModalHeader
            icon={Pencil}
            tint="#c2410c"
            title={editingItem ? `${editingItem.displayId} — ${editingItem.type}` : "Editar Peça"}
            subtitle={editingItem?.description || "Atualize as informações da peça"}
            onClose={handleCloseEditDialog}
          />
          <ItemForm
            mode="edit"
            formData={formData}
            setFormData={setFormData}
            standardItems={standardItems}
            typeOptions={itemTypes}
            materialOptions={materialOptions}
            finishOptions={finishOptions}
            customMaterial={customMaterial}
            setCustomMaterial={setCustomMaterial}
            customFinish={customFinish}
            setCustomFinish={setCustomFinish}
            isMobile={isMobile}
            isAdmin={user?.role === 'admin'}
            isPending={updateItemMutation.isPending}
            onSubmit={(e) => {
              e.preventDefault();
              if (editingItem) {
                updateItemMutation.mutate({ id: editingItem.id, data: formData });
              }
            }}
            onCancel={handleCloseEditDialog}
            localRefPreview={localRefPreview}
            setLocalRefPreview={setLocalRefPreview}
            getUploadUrl={getUploadUrl}
            quantityLocked={entrouEmProducao(editingItem)}
            quantityFloor={reductionFloorOf(editingItem ?? {})}
            quantityCeiling={Number(editingItem?.quantity) || 1}
          />
          </FreezeWhileClosing>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Importar Excel (split-panel) ───────────────────────────── */}
      <ImportXlsxDialog
        open={importDialogOpen}
        onOpenChangeClose={() => {
          setImportDialogOpen(false);
          setImportFile(null);
          setImportPreview(null);
          setImportPreviewItems(null);
        }}
        importFile={importFile}
        setImportFile={setImportFile}
        setImportPreview={setImportPreview}
        importPreviewItems={importPreviewItems}
        setImportPreviewItems={setImportPreviewItems}
        importFileName={importFileName}
        importSearch={importSearch}
        setImportSearch={setImportSearch}
        eventSponsorsList={eventSponsorsList}
        previewXlsxPending={previewXlsxMutation.isPending}
        onPreview={(file) => previewXlsxMutation.mutate({ file })}
        confirmImportPending={confirmImportMutation.isPending}
        onConfirmImport={(items, fileName) => confirmImportMutation.mutate({ items, fileName })}
        // As peças que o evento JÁ tem — sem elas o diálogo não teria contra
        // o que medir a repetição, e reimportar a mesma planilha duplicava o
        // evento inteiro em silêncio.
        itensDoEvento={items}
      />
      {/* ── Dialog: Clonar Evento ──────────────────────────────────────────── */}
      <CloneItemsDialog
        open={cloneDialogOpen}
        onOpenChange={setCloneDialogOpen}
        eventId={eventId}
        eventName={event?.name}
        allEvents={allEvents}
        eventsLoading={loadingAllEvents}
        cloneSourceId={cloneSourceId}
        setCloneSourceId={setCloneSourceId}
        isCloning={cloneItemsMutation.isPending}
        onConfirmClone={() => { if (cloneSourceId) cloneItemsMutation.mutate({ sourceEventId: cloneSourceId }); }}
      />

    </div>
  );
}
