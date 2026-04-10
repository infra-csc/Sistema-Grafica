import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Event, Item, InventoryAsset } from "@shared/schema";
import {
  ScanSearch, CheckCircle2, AlertTriangle, XCircle,
  ChevronRight, Archive, X, Tag,
} from "lucide-react";

// ── Helpers ───────────────────────────────────────────────────────────────────
const CONDITION_META: Record<string, { label: string; color: string; bg: string; Icon: React.ElementType }> = {
  PERFEITO:    { label: "Perfeito",    color: "#16a34a", bg: "#f0fdf4", Icon: CheckCircle2 },
  AVARIA_LEVE: { label: "Avaria Leve", color: "#d97706", bg: "#fffbeb", Icon: AlertTriangle },
  SUCATA:      { label: "Sucata",      color: "#dc2626", bg: "#fef2f2", Icon: XCircle },
};

type Condition = "PERFEITO" | "AVARIA_LEVE" | "SUCATA";

interface TriagemEntry {
  item: Item;
  condition: Condition;
  location: string;
  franchiseTags: string[];
  notes: string;
  tagInput: string;
  sendToStock: boolean;
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function TriagemRetorno() {
  const { toast } = useToast();
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [entries, setEntries] = useState<Record<string, TriagemEntry>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Load completed events with delivered items
  const { data: events = [], isLoading: eventsLoading } = useQuery<Event[]>({
    queryKey: ["/api/events"],
  });

  const completedEvents = events.filter(e => e.status === "completed" || e.status === "created");

  // Load items for selected event
  const { data: allItems = [], isLoading: itemsLoading } = useQuery<Item[]>({
    queryKey: ["/api/items"],
    enabled: !!selectedEventId,
  });

  const eventItems = allItems.filter(
    i => i.eventId === selectedEventId && i.status === "entregue"
  );

  const { data: inventoryAssets = [] } = useQuery<InventoryAsset[]>({
    queryKey: ["/api/inventory"],
  });

  // Initialize entries when event or items change
  function initEntries(items: Item[]) {
    const init: Record<string, TriagemEntry> = {};
    for (const item of items) {
      if (!entries[item.id]) {
        init[item.id] = {
          item,
          condition: "PERFEITO",
          location: "",
          franchiseTags: [],
          notes: "",
          tagInput: "",
          sendToStock: true,
        };
      } else {
        init[item.id] = entries[item.id];
      }
    }
    setEntries(init);
  }

  function handleSelectEvent(eventId: string) {
    setSelectedEventId(eventId);
    setSaved(false);
  }

  // Called after items loaded
  const prevEventId = useState<string | null>(null);

  function updateEntry(itemId: string, patch: Partial<TriagemEntry>) {
    setEntries(prev => ({ ...prev, [itemId]: { ...prev[itemId], ...patch } }));
  }

  function addTag(itemId: string) {
    const entry = entries[itemId];
    if (!entry) return;
    const t = entry.tagInput.trim();
    if (t && !entry.franchiseTags.includes(t)) {
      updateEntry(itemId, { franchiseTags: [...entry.franchiseTags, t], tagInput: "" });
    } else {
      updateEntry(itemId, { tagInput: "" });
    }
  }

  function removeTag(itemId: string, tag: string) {
    const entry = entries[itemId];
    if (!entry) return;
    updateEntry(itemId, { franchiseTags: entry.franchiseTags.filter(t => t !== tag) });
  }

  // Mark a newly initialized event's items
  const [initializedFor, setInitializedFor] = useState<string | null>(null);
  if (selectedEventId && selectedEventId !== initializedFor && eventItems.length > 0) {
    setInitializedFor(selectedEventId);
    initEntries(eventItems);
  }

  async function handleSave() {
    const toSend = eventItems.filter(item => entries[item.id]?.sendToStock);
    if (toSend.length === 0) {
      toast({ title: "Selecione ao menos uma peça para enviar ao estoque", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      for (const item of toSend) {
        const entry = entries[item.id];
        await apiRequest("POST", "/api/inventory", {
          name: item.name,
          originalItemId: item.id,
          condition: entry.condition,
          location: entry.location,
          franchiseTags: entry.franchiseTags,
          notes: entry.notes,
          available: true,
        });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      setSaved(true);
      toast({ title: `${toSend.length} ${toSend.length === 1 ? "peça adicionada" : "peças adicionadas"} ao acervo.` });
    } catch {
      toast({ title: "Erro ao processar triagem", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  const selectedEvent = events.find(e => e.id === selectedEventId);
  const markedCount = Object.values(entries).filter(e => e.sendToStock).length;

  const inputStyle: React.CSSProperties = {
    border: "1.5px solid #e8e8e7",
    borderRadius: 7,
    padding: "7px 10px",
    fontSize: 13,
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    color: "#1c1917",
    backgroundColor: "#fff",
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
  };

  return (
    <div style={{ display: "flex", height: "100%", fontFamily: "'Plus Jakarta Sans', sans-serif", backgroundColor: "#fafaf9" }}>

      {/* ── Left column: event list ─────────────────────────────────────────── */}
      <div style={{
        width: 280,
        flexShrink: 0,
        borderRight: "1px solid #e8e8e7",
        backgroundColor: "#fff",
        display: "flex",
        flexDirection: "column",
        overflowY: "auto",
      }}>
        <div style={{ padding: "20px 16px 12px", borderBottom: "1px solid #f3f4f3" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <ScanSearch style={{ width: 18, height: 18, color: "#f97316" }} />
            <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 15, fontWeight: 700, color: "#1c1917", margin: 0 }}>
              Triagem de Retorno
            </h2>
          </div>
          <p style={{ fontSize: 12, color: "#a8a29e", margin: 0 }}>
            Selecione um evento para triar os itens retornados.
          </p>
        </div>

        {eventsLoading ? (
          <div style={{ padding: 24, textAlign: "center", color: "#a8a29e", fontSize: 13 }}>Carregando…</div>
        ) : completedEvents.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", color: "#a8a29e", fontSize: 13 }}>
            Nenhum evento com itens entregues.
          </div>
        ) : (
          <div style={{ padding: "8px 8px" }}>
            {completedEvents.map(event => {
              const delivered = allItems.filter(i => i.eventId === event.id && i.status === "entregue");
              const isSelected = event.id === selectedEventId;
              return (
                <button
                  key={event.id}
                  onClick={() => handleSelectEvent(event.id)}
                  data-testid={`button-event-${event.id}`}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: isSelected ? "2px solid #f97316" : "2px solid transparent",
                    backgroundColor: isSelected ? "#fff7ed" : "transparent",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 2,
                    transition: "all 0.15s",
                  }}
                  onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#fafaf9"; }}
                  onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"; }}
                >
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: "#1c1917", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {event.name}
                    </p>
                    <p style={{ fontSize: 11, color: "#a8a29e", margin: "2px 0 0" }}>
                      {delivered.length} {delivered.length === 1 ? "item entregue" : "itens entregues"}
                    </p>
                  </div>
                  <ChevronRight style={{ width: 15, height: 15, color: isSelected ? "#f97316" : "#d6d3d1", flexShrink: 0 }} />
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Right column: triagem form ──────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
        {!selectedEventId ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
            <ScanSearch style={{ width: 48, height: 48, color: "#d6d3d1" }} />
            <p style={{ fontSize: 15, fontWeight: 600, color: "#78716c", margin: 0 }}>Selecione um evento à esquerda</p>
            <p style={{ fontSize: 13, color: "#a8a29e", margin: 0 }}>
              Os itens entregues aparecerão aqui para triagem.
            </p>
          </div>
        ) : (
          <div style={{ padding: "24px 28px" }}>
            {/* Event header */}
            <div style={{
              display: "flex", alignItems: "flex-start", justifyContent: "space-between",
              marginBottom: 20, gap: 12, flexWrap: "wrap",
            }}>
              <div>
                <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 18, fontWeight: 700, color: "#1c1917", margin: 0, letterSpacing: "-0.02em" }}>
                  {selectedEvent?.name}
                </h2>
                <p style={{ fontSize: 13, color: "#78716c", margin: "4px 0 0" }}>
                  {eventItems.length} {eventItems.length === 1 ? "item entregue" : "itens entregues"} · {markedCount} selecionado{markedCount !== 1 ? "s" : ""} para o acervo
                </p>
              </div>
              {saved ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 16px", backgroundColor: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8 }}>
                  <CheckCircle2 style={{ width: 16, height: 16, color: "#16a34a" }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#16a34a", fontFamily: "'Space Grotesk', sans-serif" }}>
                    Triagem concluída
                  </span>
                </div>
              ) : (
                <button
                  onClick={handleSave}
                  disabled={saving || markedCount === 0}
                  data-testid="button-save-triage"
                  style={{
                    padding: "9px 22px",
                    backgroundColor: saving || markedCount === 0 ? "#fed7aa" : "#f97316",
                    color: "white",
                    border: "none",
                    borderRadius: 8,
                    cursor: saving || markedCount === 0 ? "not-allowed" : "pointer",
                    fontSize: 13.5,
                    fontWeight: 600,
                    fontFamily: "'Space Grotesk', sans-serif",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <Archive style={{ width: 15, height: 15 }} />
                  {saving ? "Enviando…" : "Enviar ao Acervo"}
                </button>
              )}
            </div>

            {/* Items loading */}
            {itemsLoading ? (
              <div style={{ padding: 40, textAlign: "center", color: "#a8a29e", fontSize: 14 }}>Carregando itens…</div>
            ) : eventItems.length === 0 ? (
              <div style={{
                padding: 48, textAlign: "center",
                background: "#fff", border: "1px solid #e8e8e7", borderRadius: 12,
              }}>
                <Archive style={{ width: 40, height: 40, color: "#d6d3d1", margin: "0 auto 12px", display: "block" }} />
                <p style={{ fontWeight: 600, color: "#78716c", fontSize: 14, margin: "0 0 4px" }}>Nenhum item entregue</p>
                <p style={{ color: "#a8a29e", fontSize: 13, margin: 0 }}>
                  Somente itens com status "Entregue" aparecem aqui.
                </p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {eventItems.map(item => {
                  const entry = entries[item.id];
                  if (!entry) return null;
                  const isInStock = inventoryAssets.some(a => a.originalItemId === item.id);
                  return (
                    <TriagemCard
                      key={item.id}
                      entry={entry}
                      isInStock={isInStock}
                      onUpdate={patch => updateEntry(item.id, patch)}
                      onAddTag={() => addTag(item.id)}
                      onRemoveTag={tag => removeTag(item.id, tag)}
                      inputStyle={inputStyle}
                    />
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Triagem Card ──────────────────────────────────────────────────────────────
function TriagemCard({
  entry,
  isInStock,
  onUpdate,
  onAddTag,
  onRemoveTag,
  inputStyle,
}: {
  entry: TriagemEntry;
  isInStock: boolean;
  onUpdate: (patch: Partial<TriagemEntry>) => void;
  onAddTag: () => void;
  onRemoveTag: (tag: string) => void;
  inputStyle: React.CSSProperties;
}) {
  const CONDITIONS: Condition[] = ["PERFEITO", "AVARIA_LEVE", "SUCATA"];

  return (
    <div style={{
      background: "#fff",
      border: `2px solid ${entry.sendToStock ? "#fed7aa" : "#e8e8e7"}`,
      borderRadius: 12,
      overflow: "hidden",
      transition: "border-color 0.15s",
    }}>
      {/* Card header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "13px 16px",
        borderBottom: "1px solid #f3f4f3",
        backgroundColor: entry.sendToStock ? "#fffbf5" : "#fafaf9",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          {/* Checkbox */}
          <button
            onClick={() => onUpdate({ sendToStock: !entry.sendToStock })}
            data-testid={`button-select-item-${entry.item.id}`}
            disabled={isInStock}
            style={{
              width: 20, height: 20,
              borderRadius: 5,
              border: `2px solid ${entry.sendToStock ? "#f97316" : "#d6d3d1"}`,
              backgroundColor: entry.sendToStock ? "#f97316" : "#fff",
              cursor: isInStock ? "default" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
              transition: "all 0.15s",
              opacity: isInStock ? 0.4 : 1,
            }}
          >
            {entry.sendToStock && <span style={{ color: "white", fontSize: 11, lineHeight: 1 }}>✓</span>}
          </button>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 13.5, fontWeight: 600, color: "#1c1917", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {entry.item.name}
            </p>
            <p style={{ fontSize: 11.5, color: "#a8a29e", margin: "1px 0 0", fontFamily: "'DM Mono', monospace" }}>
              {entry.item.displayId}
            </p>
          </div>
        </div>
        {isInStock && (
          <span style={{
            fontSize: 11,
            fontWeight: 700,
            color: "#16a34a",
            backgroundColor: "#f0fdf4",
            border: "1px solid #bbf7d0",
            borderRadius: 20,
            padding: "2px 10px",
            fontFamily: "'Space Grotesk', sans-serif",
            whiteSpace: "nowrap",
          }}>
            Já no acervo
          </span>
        )}
      </div>

      {/* Card body (only when selected) */}
      {entry.sendToStock && !isInStock && (
        <div style={{ padding: "14px 16px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>

          {/* Condição */}
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#78716c", letterSpacing: "0.05em", textTransform: "uppercase", display: "block", marginBottom: 6, fontFamily: "'Space Grotesk', sans-serif" }}>
              Condição após retorno
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              {CONDITIONS.map(c => {
                const meta = CONDITION_META[c];
                const active = entry.condition === c;
                return (
                  <button
                    key={c}
                    onClick={() => onUpdate({ condition: c })}
                    data-testid={`button-cond-${entry.item.id}-${c}`}
                    style={{
                      flex: 1,
                      padding: "7px 4px",
                      borderRadius: 8,
                      border: `2px solid ${active ? meta.color : "#e8e8e7"}`,
                      backgroundColor: active ? meta.bg : "#fafaf9",
                      cursor: "pointer",
                      display: "flex", flexDirection: "column",
                      alignItems: "center", gap: 4,
                    }}
                  >
                    <meta.Icon style={{ width: 15, height: 15, color: active ? meta.color : "#a8a29e" }} />
                    <span style={{ fontSize: 10.5, fontWeight: 600, color: active ? meta.color : "#78716c", fontFamily: "'Space Grotesk', sans-serif" }}>
                      {meta.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Localização */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#78716c", letterSpacing: "0.05em", textTransform: "uppercase", display: "block", marginBottom: 5, fontFamily: "'Space Grotesk', sans-serif" }}>
              Localização no galpão
            </label>
            <input
              style={inputStyle}
              placeholder="Ex: Galpão A — Prateleira 3"
              value={entry.location}
              onChange={e => onUpdate({ location: e.target.value })}
              data-testid={`input-location-${entry.item.id}`}
            />
          </div>

          {/* Franquias */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#78716c", letterSpacing: "0.05em", textTransform: "uppercase", display: "block", marginBottom: 5, fontFamily: "'Space Grotesk', sans-serif" }}>
              Tags de Franquia
            </label>
            <div style={{ display: "flex", gap: 6 }}>
              <input
                style={{ ...inputStyle, flex: 1 }}
                placeholder="Ex: fla…"
                value={entry.tagInput}
                onChange={e => onUpdate({ tagInput: e.target.value })}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); onAddTag(); } }}
                data-testid={`input-tag-${entry.item.id}`}
              />
              <button
                onClick={onAddTag}
                data-testid={`button-addtag-${entry.item.id}`}
                style={{
                  padding: "7px 10px", backgroundColor: "#f97316", color: "white",
                  border: "none", borderRadius: 7, cursor: "pointer", fontSize: 12, fontWeight: 600,
                  fontFamily: "'Space Grotesk', sans-serif", whiteSpace: "nowrap",
                }}
              >
                +
              </button>
            </div>
            {entry.franchiseTags.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                {entry.franchiseTags.map(t => (
                  <span key={t} style={{
                    display: "inline-flex", alignItems: "center", gap: 3,
                    padding: "2px 8px",
                    backgroundColor: "#fff7ed",
                    border: "1px solid #fed7aa",
                    borderRadius: 20,
                    fontSize: 10.5,
                    color: "#c2410c",
                    fontWeight: 600,
                  }}>
                    {t}
                    <button onClick={() => onRemoveTag(t)} style={{ background: "none", border: "none", cursor: "pointer", color: "#c2410c", padding: 0, lineHeight: 1 }}>
                      <X style={{ width: 8, height: 8 }} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Observações */}
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#78716c", letterSpacing: "0.05em", textTransform: "uppercase", display: "block", marginBottom: 5, fontFamily: "'Space Grotesk', sans-serif" }}>
              Observações
            </label>
            <textarea
              style={{ ...inputStyle, resize: "vertical", minHeight: 56 } as React.CSSProperties}
              placeholder="Estado da peça, avarias, observações de retorno…"
              value={entry.notes}
              onChange={e => onUpdate({ notes: e.target.value })}
              data-testid={`input-notes-${entry.item.id}`}
            />
          </div>
        </div>
      )}
    </div>
  );
}
