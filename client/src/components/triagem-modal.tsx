// ─────────────────────────────────────────────────────────────────────────────
// TRIAGEM — A FICHA DE UMA PEÇA (redesenhada em 06/10).
//
// O modal antigo era outro produto dentro do app: barra lateral escura com o
// logotipo "NORTE", uma "Rastreabilidade" que inventava precisão (a data do
// EVENTO aparecia como "Saída do estoque · 13:30"), uma moldura laranja com
// etiqueta flutuante "CLASSIFICAÇÃO OBRIGATÓRIA", e as especificações num
// cartão preto em mono de 10px. Agora é a casca da casa (modal-shell), clara,
// na mesma linguagem do Detalhe do ativo do Estoque:
//   1. cabeçalho — qual peça (nome, código, quantidade, evento);
//   2. à direita, o que se decide: condição, destino e observação;
//   3. à esquerda, a arte e o percurso da peça até aqui (sem horário inventado);
//   4. especificações da peça de origem;
//   5. rodapé fixo: quem está triando, Fechar e Salvar e fechar.
// No celular a decisão vem PRIMEIRO; arte e percurso depois.
//
// Nada do que se grava mudou: as mesmas props, o mesmo onSaveAndClose.
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { CheckCircle2, ClipboardCheck, ExternalLink, Package2, Save, Trash2, Warehouse, Wrench } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useIsMobile } from "@/hooks/use-mobile";
import { HIDE_NATIVE_CLOSE, ModalFooter, ModalHeader, modalSurface } from "@/components/modal-shell";
import { CONDITIONS, CONDITION_META, type Condition, type EnrichedAsset } from "@/lib/inventory-meta";
import type { OrigemDoAtivo } from "@shared/api";
import { T, N, TOM, FS, FW, R, FONT } from "@/lib/theme";
import { Botao } from "@/components/ui/botao";
import { Selo } from "@/components/ui/selo";

// ─── Types ────────────────────────────────────────────────────────────────────
type TriagemResult = "NO_GALPAO" | "MANUTENCAO" | "DESCARTADO";

interface SplitLine { qty: number; condition: Condition | null; result: TriagemResult; }
interface TriagemEntry { splits: SplitLine[]; notes: string; selected: boolean; mode: "all" | "split"; }

interface TriagemModalProps {
  asset: EnrichedAsset | null;
  /** A peça de origem (GET /api/inventory/:id/origem). */
  linkedItem?: OrigemDoAtivo | null;
  entry: TriagemEntry | null;
  open: boolean;
  isSaving: boolean;
  isSaved: boolean;
  /** Quem está triando (o rodapé mostra o nome). */
  user: { name?: string | null; username?: string | null } | null;
  onOpenChange: (open: boolean) => void;
  onUpdateCondition: (c: Condition) => void;
  onUpdateResult: (r: TriagemResult) => void;
  onUpdateNotes: (notes: string) => void;
  /** Devolve `false` quando a gravação NÃO aconteceu (validação ou erro) —
   *  aí o modal fica aberto, com o toast explicando o que falta. */
  onSaveAndClose: () => Promise<boolean | void>;
}

const RESULT_META: Record<TriagemResult, {
  label: string; subLabel: string; tom: { bg: string; text: string; border: string }; Icon: React.ElementType;
}> = {
  NO_GALPAO:  { label: "Galpão",     subLabel: "Volta ao estoque e pode ser reaproveitada.",  tom: TOM.info,   Icon: Warehouse },
  MANUTENCAO: { label: "Manutenção", subLabel: "Fica fora do estoque até o reparo terminar.", tom: TOM.alerta, Icon: Wrench },
  DESCARTADO: { label: "Descartar",  subLabel: "Sai do inventário como sucata — pede confirmação ao salvar.", tom: TOM.perigo, Icon: Trash2 },
};

const ROTULO: React.CSSProperties = {
  display: "block", fontFamily: FONT.corpo, fontWeight: FW.medio, fontSize: FS.meta, color: T.apoio, marginBottom: 8,
};
const CARTAO: React.CSSProperties = { background: T.surface, border: `1px solid ${T.border}`, borderRadius: R.lg, padding: 16 };
const TITULO: React.CSSProperties = { margin: "0 0 12px", fontSize: FS.body, fontWeight: FW.forte, color: T.text, fontFamily: FONT.display };

const data = (d: string | Date | null | undefined, comAno = true) =>
  d ? format(new Date(d), comAno ? "dd MMM yyyy" : "dd MMM", { locale: ptBR }) : null;

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 0", borderBottom: `1px solid ${N.n3}`, fontSize: FS.body }}>
      <dt style={{ color: T.second, flexShrink: 0 }}>{rotulo}</dt>
      <dd style={{ margin: 0, color: T.text, fontWeight: FW.medio, textAlign: "right", overflowWrap: "anywhere" }}>{children}</dd>
    </div>
  );
}

export function TriagemModal({
  asset, linkedItem, entry, open, isSaving, isSaved, user,
  onOpenChange, onUpdateCondition, onUpdateResult, onUpdateNotes, onSaveAndClose,
}: TriagemModalProps) {
  // Hooks SEMPRE antes do guard — chamá-los depois de um return condicional
  // viola as regras de hooks quando asset/entry alternam entre null e valor.
  const isMobile = useIsMobile();
  const [thumbImgFailed, setThumbImgFailed] = useState(false);

  if (!asset || !entry) return null;

  // `?? "PERFEITO"` cobre null/undefined — daqui em diante nunca é null.
  const condition: Condition = entry.splits[0]?.condition ?? "PERFEITO";
  const result    = entry.splits[0]?.result    ?? "NO_GALPAO";
  const notes     = entry.notes;
  const qty       = asset.quantity ?? 1;
  const destino   = RESULT_META[result];

  const thumbUrl = asset.approvalThumbUrl;
  const isImg    = !!thumbUrl && (/\.(png|jpg|jpeg|gif|webp)/i.test(thumbUrl) || thumbUrl.startsWith("/objects/"));
  const dataDoEvento = data(asset.eventDate);
  const patrocinadores = (asset.sponsors ?? []).map(s => s.name);

  // Fechava SEMPRE — inclusive quando o salvar recusava por validação: o toast
  // aparecia com o modal já sumindo e a pessoa perdia o que precisava ajustar.
  async function handleSave() {
    const ok = await onSaveAndClose();
    if (ok !== false) onOpenChange(false);
  }

  // Botão de escolha (condição/destino): ícone + rótulo; marcado ganha a tinta
  // da opção e o anel da borda. É rádio de verdade para o leitor de tela.
  const opcao = (ativa: boolean, cores: { bg: string; text: string; border: string }): React.CSSProperties => ({
    flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6,
    minHeight: 64, padding: "10px 6px", borderRadius: R.md, cursor: isSaved ? "default" : "pointer",
    border: `1px solid ${ativa ? cores.text : T.border}`,
    boxShadow: ativa ? `0 0 0 1px ${cores.text} inset` : "none",
    background: ativa ? cores.bg : T.surface,
    color: ativa ? cores.text : T.apoio,
    fontFamily: FONT.corpo, fontSize: FS.body, fontWeight: ativa ? FW.forte : FW.medio,
  });

  const decisao = (
    <section aria-label="O que fazer com a peça" style={{ ...CARTAO, padding: isMobile ? 14 : 20, display: "flex", flexDirection: "column", gap: 18 }}>
      <div role="radiogroup" aria-labelledby="triagem-rotulo-condicao">
        <span id="triagem-rotulo-condicao" style={ROTULO}>Condição da peça</span>
        <div style={{ display: "flex", gap: 8 }}>
          {CONDITIONS.map(c => {
            const m = CONDITION_META[c];
            const ativa = condition === c;
            return (
              <button key={c} type="button" role="radio" aria-checked={ativa} disabled={isSaved}
                data-testid={`triagem-modal-condicao-${c}`}
                className="ds-botao tri-opcao"
                onClick={() => onUpdateCondition(c)}
                style={opcao(ativa, { bg: m.activeBg, text: m.color, border: m.border })}>
                <m.Icon size={18} aria-hidden="true" />
                {m.label}
              </button>
            );
          })}
        </div>
        {/* Escolher a condição TROCA o destino logo abaixo (a sugestão do
            onUpdateCondition). Sem esta frase, parecia erro. */}
        <p style={{ margin: "8px 0 0", fontSize: FS.meta, color: T.second, lineHeight: 1.45 }}>
          A condição já sugere o destino abaixo — troque se precisar.
        </p>
      </div>

      <div role="radiogroup" aria-labelledby="triagem-rotulo-destino">
        <span id="triagem-rotulo-destino" style={ROTULO}>Destino</span>
        <div style={{ display: "flex", gap: 8 }}>
          {(["NO_GALPAO", "MANUTENCAO", "DESCARTADO"] as TriagemResult[]).map(r => {
            const m = RESULT_META[r];
            const ativa = result === r;
            return (
              <button key={r} type="button" role="radio" aria-checked={ativa} disabled={isSaved}
                data-testid={`triagem-modal-destino-${r}`}
                className="ds-botao tri-opcao"
                onClick={() => onUpdateResult(r)} title={m.subLabel}
                style={opcao(ativa, m.tom)}>
                <m.Icon size={18} aria-hidden="true" />
                {m.label}
              </button>
            );
          })}
        </div>
        {/* O que o destino escolhido FAZ — antes só no title (hover), que não
            existe no toque. */}
        <p role="status" style={{ margin: "8px 0 0", fontSize: FS.meta, lineHeight: 1.45, color: result === "DESCARTADO" ? TOM.perigo.text : T.second, fontWeight: result === "DESCARTADO" ? FW.medio : FW.corpo }}>
          {destino.subLabel}
        </p>
      </div>

      <div>
        <label htmlFor="triagem-observacao" style={ROTULO}>
          Observação <span style={{ fontWeight: FW.corpo, color: T.second }}>(opcional)</span>
        </label>
        <textarea
          id="triagem-observacao"
          data-testid="triagem-modal-observacao"
          className="tri-campo"
          value={notes}
          disabled={isSaved}
          onChange={e => onUpdateNotes(e.target.value)}
          placeholder="Ex.: riscos na base, precisa de polimento…"
          style={{
            width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: R.md,
            border: `1px solid ${T.bdark}`, background: T.surface, fontFamily: FONT.corpo,
            fontSize: isMobile ? FS.lead : FS.body, color: T.text, resize: "vertical", minHeight: 76, lineHeight: 1.5,
          }}
        />
      </div>
    </section>
  );

  // O caminho da peça até aqui, sem horário inventado: produção, evento,
  // triagem (agora) e o destino que está marcado.
  const passos: { titulo: string; detalhe: string; estado: "feito" | "agora" | "depois"; cor?: string }[] = [
    { titulo: linkedItem?.type ? `Produção · ${linkedItem.type}` : "Produção", detalhe: asset.autoAdded ? "Cadastrada pela Gráfica" : "Cadastro manual", estado: "feito" },
    { titulo: asset.eventName || "Sem evento", detalhe: dataDoEvento ? `Evento em ${dataDoEvento}` : "Data não registrada", estado: "feito" },
    { titulo: "Triagem", detalhe: isSaved ? "Salva" : "Agora", estado: isSaved ? "feito" : "agora" },
    { titulo: `Destino: ${destino.label}`, detalhe: isSaved ? "Gravado" : "Marcado — grava ao salvar", estado: isSaved ? "feito" : "depois", cor: destino.tom.text },
  ];
  const percurso = (
    <section aria-label="Percurso da peça" style={CARTAO}>
      <h3 style={TITULO}>Percurso da peça</h3>
      <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column" }}>
        {passos.map((p, i) => (
          <li key={i} style={{ position: "relative", display: "flex", gap: 10, paddingBottom: i < passos.length - 1 ? 14 : 0 }}>
            {i < passos.length - 1 && <span aria-hidden="true" style={{ position: "absolute", left: 6, top: 16, bottom: 0, width: 2, background: p.estado === "feito" ? T.accent : T.border }} />}
            <span aria-hidden="true" style={{
              width: 14, height: 14, borderRadius: "50%", flexShrink: 0, marginTop: 2, boxSizing: "border-box",
              background: p.estado === "feito" ? T.accent : T.surface,
              border: `2px solid ${p.estado === "depois" ? T.bdark : T.accent}`,
              boxShadow: p.estado === "agora" ? `0 0 0 4px ${TOM.laranja.bg}` : "none",
            }} />
            <span style={{ minWidth: 0 }}>
              <span style={{ display: "block", fontSize: FS.body, fontWeight: p.estado === "agora" ? FW.forte : FW.medio, color: p.cor ?? T.text, overflowWrap: "anywhere" }}>{p.titulo}</span>
              <span style={{ display: "block", fontSize: FS.meta, color: T.second }}>{p.detalhe}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );

  const arte = (
    <section aria-label="Arte aprovada" style={{ ...CARTAO, padding: 0, overflow: "hidden" }}>
      <div style={{ aspectRatio: isMobile ? "16 / 9" : "4 / 3", background: N.n2, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {isImg && !thumbImgFailed ? (
          <img src={thumbUrl!} alt={`Arte aprovada de ${asset.name}`} loading="lazy" decoding="async"
            style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
            onError={() => setThumbImgFailed(true)} />
        ) : (
          <span style={{ textAlign: "center", color: T.second, fontSize: FS.meta }}>
            <Package2 size={28} color={T.muted} aria-hidden="true" style={{ display: "block", margin: "0 auto 4px" }} />
            Sem arte aprovada
          </span>
        )}
      </div>
      {isImg && !thumbImgFailed && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "8px 12px", borderTop: `1px solid ${T.border}` }}>
          <span style={{ fontSize: FS.meta, color: T.second, whiteSpace: "nowrap" }}>Arte aprovada</span>
          <a href={thumbUrl!} target="_blank" rel="noopener noreferrer" className="tri-link"
            style={{ display: "inline-flex", alignItems: "center", gap: 4, minHeight: isMobile ? 44 : 28, fontSize: FS.meta, fontWeight: FW.forte, color: T.accentText, whiteSpace: "nowrap" }}>
            Abrir original <ExternalLink size={12} aria-hidden="true" />
          </a>
        </div>
      )}
    </section>
  );

  const especificacoes = (
    <section aria-label="Especificações" style={CARTAO}>
      <h3 style={TITULO}>Especificações</h3>
      <dl style={{ margin: 0, display: "grid", gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : "repeat(2, minmax(0, 1fr))", columnGap: 24 }}>
        <Linha rotulo="Tipo">{linkedItem?.type || "—"}</Linha>
        <Linha rotulo="Material">{linkedItem?.material || "—"}</Linha>
        <Linha rotulo="Acabamento">{linkedItem?.finish || "—"}</Linha>
        <Linha rotulo="Medida">{linkedItem?.measurement || "—"}</Linha>
        <Linha rotulo="Dimensões">{linkedItem?.visualWidth && linkedItem?.visualHeight ? `${linkedItem.visualWidth} × ${linkedItem.visualHeight} m` : "—"}</Linha>
        <Linha rotulo="M² total">{linkedItem?.calculatedM2 ? `${linkedItem.calculatedM2} m²` : "—"}</Linha>
        <Linha rotulo="Este registro">{qty} un.</Linha>
        <Linha rotulo="Peça de origem">{linkedItem?.quantity ? `${linkedItem.quantity} un.` : "—"}</Linha>
      </dl>
      <p style={{ margin: "10px 0 0", fontSize: FS.body, color: T.apoio, lineHeight: 1.5 }}>
        <span style={{ color: T.second }}>Patrocinadores: </span>
        <strong style={{ color: T.text, fontWeight: FW.medio }}>{patrocinadores.length ? patrocinadores.join(" · ") : "nenhum"}</strong>
      </p>
    </section>
  );

  const subtitulo = `${asset.displayId} · ${qty === 1 ? "1 unidade" : `${qty} unidades`} · ${asset.eventName || "sem evento"}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="triagem-modal" className={`gap-0 ${HIDE_NATIVE_CLOSE}`} style={modalSurface(920)}>
        <DialogTitle className="sr-only">{`Triagem de ${asset.displayId} — ${asset.name}`}</DialogTitle>
        <DialogDescription className="sr-only">
          Classifique a condição e o destino da peça que voltou do evento.
        </DialogDescription>
        <ModalHeader icon={ClipboardCheck} tint={T.accentText} title={asset.name} subtitle={subtitulo}
          compacto={isMobile} onClose={() => onOpenChange(false)} testIdDoFechar="button-triage-modal-close"
          selo={isSaved ? <Selo tom="sucesso" icone={CheckCircle2}>Triada</Selo> : undefined} />

        <div style={{ flex: "1 1 auto", minHeight: 0, overflowY: "auto", background: T.bg, padding: isMobile ? 14 : 24 }}>
          {isMobile ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {decisao}
              {arte}
              {percurso}
              {especificacoes}
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "260px minmax(0, 1fr)", gap: 16, alignItems: "start" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {arte}
                {percurso}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
                {decisao}
                {especificacoes}
              </div>
            </div>
          )}
        </div>

        <ModalFooter style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, padding: isMobile ? "12px 14px calc(12px + env(safe-area-inset-bottom, 0px))" : "14px 24px" }}>
          {!isMobile && user && (
            <span style={{ fontSize: FS.meta, color: T.second }}>
              Triando como <strong style={{ color: T.strong, fontWeight: FW.medio }}>{user.name || user.username}</strong>
            </span>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto", flex: isMobile ? "1 1 100%" : undefined }}>
            {isSaved && (
              <span role="status" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: FS.body, fontWeight: FW.forte, color: TOM.sucesso.text, marginRight: 4 }}>
                <CheckCircle2 size={15} aria-hidden="true" /> Triagem salva
              </span>
            )}
            <Botao variante="secundario" tamanho="toque" onClick={() => onOpenChange(false)} style={{ flex: isMobile ? 1 : undefined }}>
              Fechar
            </Botao>
            {/* A ação do modal. Salvo, ele trava — e o "Triagem salva" ao lado
                é o motivo, visível. */}
            <Botao
              variante={result === "DESCARTADO" ? "perigo" : "primario"}
              tamanho="toque"
              icone={result === "DESCARTADO" ? Trash2 : Save}
              onClick={handleSave}
              disabled={isSaved}
              carregando={isSaving}
              data-testid="button-triage-modal-save"
              style={{ flex: isMobile ? 2 : undefined, padding: "0 20px" }}
            >
              {isSaving ? "Salvando…" : isSaved ? "Salvo" : result === "DESCARTADO" ? "Descartar…" : "Salvar e fechar"}
            </Botao>
          </div>
        </ModalFooter>
      </DialogContent>
    </Dialog>
  );
}
