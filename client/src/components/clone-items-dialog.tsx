import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Copy, Loader2, Search } from "lucide-react";
import { FilterSelect } from "@/components/filter-select";
import { getStatusLabel } from "@/lib/status";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";

interface CloneItemsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: string | undefined;
  eventName: string | undefined;
  allEvents: any[];
  /** A lista de eventos só é buscada quando o dialog abre — sem esta flag o
   *  select parecia vazio ("— Escolha um evento —") enquanto carregava. */
  eventsLoading?: boolean;
  cloneSourceId: string;
  setCloneSourceId: (id: string) => void;
  isCloning: boolean;
  /** As peças ESCOLHIDAS — a seleção é do dialog, o POST é de quem o abriu. */
  onConfirmClone: (itemIds: string[]) => void;
}

// Extracted from event-detail.tsx: "Clonar Peças de Outro Evento" dialog.
// Pure presentational split — no business logic changed, only relocated.
export function CloneItemsDialog({
  open,
  onOpenChange,
  eventId,
  eventName,
  allEvents,
  eventsLoading = false,
  cloneSourceId,
  setCloneSourceId,
  isCloning,
  onConfirmClone,
}: CloneItemsDialogProps) {
  // ── A SELEÇÃO (dono, 01/09: "poder selecionar os itens que vão ser
  // clonados"). Escolhido o evento de origem, as peças dele aparecem em
  // lista com checkbox — TODAS marcadas de saída, porque o caso comum segue
  // sendo "quero o evento inteiro" e desmarcar as exceções é mais rápido do
  // que marcar dezenas. A busca recorta a lista; marcar/desmarcar todas age
  // só sobre o recorte visível, senão "desmarcar todas" com uma busca ativa
  // apagaria seleção que o operador nem estava vendo.
  const { data: pecasDaOrigem = [], isLoading: pecasCarregando } = useQuery<any[]>({
    queryKey: ["/api/items", cloneSourceId],
    enabled: open && !!cloneSourceId,
  });
  const [escolhidas, setEscolhidas] = useState<Set<string>>(new Set());
  const [busca, setBusca] = useState("");

  // Trocou a origem (ou os dados chegaram): recomeça com tudo marcado.
  useEffect(() => {
    setEscolhidas(new Set(pecasDaOrigem.map((i: any) => i.id)));
    setBusca("");
  }, [cloneSourceId, pecasDaOrigem]);

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return pecasDaOrigem;
    return pecasDaOrigem.filter((i: any) =>
      `${i.displayId ?? ""} ${i.type ?? ""} ${i.description ?? ""}`.toLowerCase().includes(q),
    );
  }, [pecasDaOrigem, busca]);

  const visiveisMarcadas = visiveis.filter((i: any) => escolhidas.has(i.id)).length;
  const alternarTodas = () => {
    setEscolhidas((atual) => {
      const prox = new Set(atual);
      if (visiveisMarcadas === visiveis.length) visiveis.forEach((i: any) => prox.delete(i.id));
      else visiveis.forEach((i: any) => prox.add(i.id));
      return prox;
    });
  };
  const alternarUma = (id: string) => {
    setEscolhidas((atual) => {
      const prox = new Set(atual);
      if (prox.has(id)) prox.delete(id); else prox.add(id);
      return prox;
    });
  };

  // A ordem escrita aqui é a que vale — do evento mais recente para o mais
  // antigo, que é a ordem em que alguém procura o que clonar. `pinned` em
  // todas porque o FilterSelect reordena alfabeticamente quem não está fixado.
  const cloneSourceOptions = allEvents
    .filter((e: any) => e.id !== eventId)
    .slice()
    .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .map((e: any) => ({
      value: e.id,
      label: `${e.name}${e.startDate ? ` (${new Date(e.startDate).toLocaleDateString('pt-BR')})` : ''}`,
      pinned: true,
    }));

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { onOpenChange(false); setCloneSourceId(""); } }}>
      <DialogContent
        // ALTURA: cabeçalho 90 + corpo ~200 (rótulo, o select e a tarja "O que
        // será copiado", que só aparece depois da escolha) + rodapé 80 = ~370px,
        // contra 397 disponíveis numa janela de 445 — este modal NÃO cortava,
        // mas por 27px, e a lista de eventos do select não muda essa conta.
        // O teto de `100vh − 48` (viewport menos 24 de respiro em cima e 24
        // embaixo, simétrico porque o Radix centra) entra com a coluna flex
        // porque o `overflow: hidden` daqui recortaria em silêncio numa janela
        // menor: sem scrollport não há como alcançar o que passou.
        style={{ maxWidth: 520, padding: 0, gap: 0, borderRadius: 12, overflow: 'hidden', maxHeight: 'calc(100vh - 48px)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '24px 28px 20px', borderBottom: '1px solid #f0efed', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <Copy style={{ width: 18, height: 18, color: '#6366f1' }} />
            <DialogTitle style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 18, fontWeight: 800, letterSpacing: '-0.03em', color: '#1a1c1c', margin: 0 }}>
              Clonar Peças de Outro Evento
            </DialogTitle>
          </div>
          <DialogDescription style={{ fontSize: 13, color: '#746e69', margin: 0, paddingLeft: 28 }}>
            Copia as peças que você escolher de um evento anterior para este evento
          </DialogDescription>
        </div>

        <div style={{ padding: '24px 28px', overflowY: 'auto', flex: '1 1 auto', minHeight: 0 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#746e69', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 8 }}>
            Selecionar evento de origem
          </label>
          {/* kind="field" — escolher o evento de ORIGEM preenche um dado da
              operação, não recorta uma lista (vocabulário em
              components/filter-select.tsx). Era `<select>` NATIVO com
              `appearance:none` e um chevron desenhado por fora: o disfarce
              cobria o gatilho, mas o menu aberto continuava sendo o do sistema
              operacional — e dentro de um Dialog, onde o Esc do menu nativo
              fechava o modal inteiro junto. Aqui o Esc fecha só o menu.
              A busca fica LIGADA: a lista de eventos é longa e o operador sabe
              o nome do que quer copiar. */}
          <div style={{ position: 'relative' }}>
            <FilterSelect
              kind="field" fullWidth hideWhenEmpty={false}
              label="Evento de origem"
              placeholder={eventsLoading ? 'Carregando eventos…' : '— Escolha um evento —'}
              disabled={eventsLoading}
              value={cloneSourceId}
              onChange={setCloneSourceId}
              options={cloneSourceOptions}
              searchPlaceholder="Buscar evento..."
              emptyText="Nenhum evento encontrado"
              panelWidth={320}
              testId="select-clone-source"
              triggerStyle={{
                width: '100%', padding: '10px 12px 10px 14px', height: 'auto', borderRadius: 8,
                border: '1.5px solid #e7e5e4',
                fontSize: 15, fontFamily: "'Space Grotesk', sans-serif",
                backgroundColor: '#ffffff', cursor: eventsLoading ? 'wait' : 'pointer',
              }}
            />
            {eventsLoading && (
              <Loader2 className="animate-spin" style={{ position: 'absolute', right: 34, top: '50%', transform: 'translateY(-50%)', width: 15, height: 15, color: '#746e69', pointerEvents: 'none' }} />
            )}
          </div>

          {cloneSourceId && pecasCarregando && (
            <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: '#746e69' }}>
              <Loader2 className="animate-spin" style={{ width: 14, height: 14 }} /> Carregando as peças do evento…
            </div>
          )}

          {cloneSourceId && !pecasCarregando && pecasDaOrigem.length === 0 && (
            <div style={{ marginTop: 16, fontSize: 12.5, color: '#746e69', background: '#fafaf9', border: '1px solid #e7e5e4', borderRadius: 8, padding: '12px 14px' }}>
              Este evento não tem peças para clonar.
            </div>
          )}

          {cloneSourceId && !pecasCarregando && pecasDaOrigem.length > 0 && (
            <div style={{ marginTop: 16 }} data-testid="lista-pecas-clone">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#746e69', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Escolher as peças · {escolhidas.size} de {pecasDaOrigem.length}
                </span>
                <button
                  type="button"
                  onClick={alternarTodas}
                  data-testid="button-alternar-todas"
                  style={{ border: 'none', background: 'transparent', fontSize: 12, fontWeight: 700, color: '#4f46e5', cursor: 'pointer', padding: 0 }}
                >
                  {visiveisMarcadas === visiveis.length ? "Desmarcar todas" : "Marcar todas"}
                </button>
              </div>

              {pecasDaOrigem.length > 8 && (
                <div style={{ position: 'relative', marginBottom: 8 }}>
                  <Search style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 13, height: 13, color: '#a8a29e' }} />
                  <input
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    placeholder="Buscar peça…"
                    data-testid="input-busca-pecas-clone"
                    style={{ width: '100%', padding: '7px 10px 7px 30px', borderRadius: 8, border: '1.5px solid #e7e5e4', fontSize: 13, outline: 'none' }}
                  />
                </div>
              )}

              <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid #e7e5e4', borderRadius: 8 }}>
                {visiveis.length === 0 && (
                  <div style={{ padding: '14px 12px', fontSize: 12.5, color: '#746e69' }}>Nenhuma peça bate com a busca.</div>
                )}
                {visiveis.map((i: any) => (
                  <label
                    key={i.id}
                    data-testid={`linha-peca-clone-${i.id}`}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderBottom: '1px solid #f5f4f2', cursor: 'pointer', backgroundColor: escolhidas.has(i.id) ? '#ffffff' : '#fafaf9' }}
                  >
                    <input
                      type="checkbox"
                      checked={escolhidas.has(i.id)}
                      onChange={() => alternarUma(i.id)}
                      style={{ width: 15, height: 15, accentColor: '#4f46e5', flexShrink: 0, cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: 13, color: escolhidas.has(i.id) ? '#1a1c1c' : '#a8a29e', lineHeight: 1.4, minWidth: 0 }}>
                      {i.displayId != null && <strong style={{ fontVariantNumeric: 'tabular-nums' }}>#{i.displayId}</strong>}{i.displayId != null ? " " : ""}{i.type}
                      {i.description ? <span style={{ color: escolhidas.has(i.id) ? '#746e69' : '#c4beb8' }}> · {i.description}</span> : null}
                      <span style={{ color: escolhidas.has(i.id) ? '#746e69' : '#c4beb8', whiteSpace: 'nowrap' }}> · {i.quantity} un.</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {cloneSourceId && !pecasCarregando && pecasDaOrigem.length > 0 && (
            <div style={{ marginTop: 12, backgroundColor: '#f0f0ff', border: '1px solid #c7d2fe', borderRadius: 8, padding: '12px 14px', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <Copy style={{ width: 14, height: 14, color: '#6366f1', flexShrink: 0, marginTop: 1 }} />
              <div>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#3730a3', margin: '0 0 2px' }}>O que será copiado</p>
                <p style={{ fontSize: 11, color: '#4338ca', margin: 0, lineHeight: 1.5 }}>
                  {escolhidas.size === pecasDaOrigem.length
                    ? <>Todas as <strong>{pecasDaOrigem.length}</strong> peças do evento serão adicionadas a <strong>{eventName}</strong>.</>
                    : <>As <strong>{escolhidas.size}</strong> peças selecionadas (de {pecasDaOrigem.length}) serão adicionadas a <strong>{eventName}</strong>.</>}<br />
                  Status: <strong>{getStatusLabel("requested")}</strong> · Patrocinadores e aprovações <strong>não</strong> serão copiados.
                </p>
              </div>
            </div>
          )}
        </div>

        <div style={{ flexShrink: 0, padding: '16px 28px 24px', borderTop: '1px solid #f0efed', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <Button variant="outline" onClick={() => { onOpenChange(false); setCloneSourceId(""); }}>
            Cancelar
          </Button>
          <Button
            onClick={() => onConfirmClone(Array.from(escolhidas))}
            disabled={!cloneSourceId || isCloning || pecasCarregando || escolhidas.size === 0}
            data-testid="button-confirm-clone"
            style={{ backgroundColor: '#4f46e5', color: '#ffffff' }}
          >
            {isCloning ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Clonando...</>
            ) : (
              <><Copy className="h-4 w-4 mr-2" /> {escolhidas.size > 0 ? `Clonar ${escolhidas.size} ${escolhidas.size === 1 ? "Peça" : "Peças"}` : "Clonar Peças"}</>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
