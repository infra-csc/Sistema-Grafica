// ─── O cartão da peça (celular e conteúdo estreito) — memoizado ─────────────
import { memo, type CSSProperties } from "react";
import { Eye, Trash2, RotateCcw, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { SeloKit } from "@/components/kit/selo-kit";
import { SponsorChips } from "@/components/sponsor-chips";
import { StatusPill } from "@/components/status-pill";
import { DetalheProducao } from "@/components/detalhe-producao";
import { statusDeExibicao } from "@shared/molde";
import { FS, R, T, TOM, FONT } from "@/lib/theme";
import { MiniaturaDaPeca } from "./miniatura-da-peca";
import { diasNoEstado, idadePorExtenso, tomDaIdade } from "./regras";
import { SELO_CALMO } from "./estilos";
import type { LinhaProps } from "./linha-da-peca";

export const CartaoDaPeca = memo(function CartaoDaPeca({
  item, selo, isAdmin, canDeleteAny, restaurando, restorePending, acoes, relogioIdade,
}: Omit<LinhaProps, "selecionado" | "isCompact" | "relogioIdade"> & { relogioIdade?: number }) {
  const isDeleted = !!item.deletedAt;
  // O mesmo "desde quando" da tabela: no celular a pílula sozinha não
  // distinguia vazão normal de peça parada há duas semanas.
  const dias = !isDeleted && relogioIdade !== undefined ? diasNoEstado(item, relogioIdade) : null;
  const tomIdade = dias !== null ? tomDaIdade(dias) : null;
  return (
    <div
      data-testid={`item-row-${item.id}`}
      onClick={() => !isDeleted && acoes.abrir(item)}
      className="pnl-cartao"
      data-deleted={isDeleted ? "1" : "0"}
      style={{
        border: `1px solid ${isDeleted ? TOM.perigo.border : T.border}`,
        borderRadius: R.lg,
        padding: 12,
        marginBottom: 8,
        // Sem zebra: cartão já é unidade separada; a zebra só fazia metade
        // deles parecer "selecionada".
        backgroundColor: isDeleted ? TOM.perigo.bg : T.surface,
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        cursor: "pointer",
        overflow: "hidden",
        opacity: isDeleted ? 0.75 : 1,
      }}
    >
      <MiniaturaDaPeca url={item.approvalThumbUrl} tamanho={56} apagada={isDeleted} />
      {/* Card content */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 5 }}>
        {/* Row 1: ID + type */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <button onClick={e => { e.stopPropagation(); if (!isDeleted) acoes.abrir(item); }} disabled={isDeleted} aria-label={`Ver detalhes da peça ${item.displayId}`} data-testid={`text-display-id-${item.id}`} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: FONT.mono, fontWeight: 700, color: isDeleted ? TOM.perigo.text : T.accentText, fontSize: 13, flexShrink: 0, textDecoration: isDeleted ? "line-through" : "none" }}>
            {item.displayId}
          </button>
          <SeloKit peca={item} style={{ flexShrink: 0 }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: isDeleted ? T.second : T.strong, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0, textDecoration: isDeleted ? "line-through" : "none" }}>{item.type}</span>
          {item.isReuse && !isDeleted && (
            <span style={{ ...SELO_CALMO, flexShrink: 0 }}>
              Reaproveitada
            </span>
          )}
        </div>
        {/* Row 2: description — allow up to 2 lines on mobile */}
        {item.description && (
          <span style={{ fontSize: 13, color: isDeleted ? T.second : T.strong, fontWeight: 500, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" } as CSSProperties}>
            {item.description}
          </span>
        )}
        {/* Row 3: status pill */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <StatusPill status={isDeleted ? "deleted" : statusDeExibicao(item)} />
          {/* Mesmo selo da linha do desktop, ao
              lado do status: no card o status é
              a informação que a pessoa lê, e é
              justamente ele que engana sozinho
              ("Em Produção" num evento que
              acabou). */}
          {selo && !isDeleted && (
            <span
              title={selo.hintPeca}
              data-testid={`selo-peca-${item.id}`}
              style={{ ...SELO_CALMO, color: selo.text, backgroundColor: selo.bg, border: `1px solid ${selo.border}` }}
            >
              {selo.labelPeca}
            </span>
          )}
          {isDeleted && item.deletedAt && (
            <span style={{ fontSize: FS.small, color: T.second }}>
              Excluída {format(new Date(item.deletedAt), "dd/MM/yyyy", { locale: ptBR })}
            </span>
          )}
          {dias !== null && tomIdade && (
            <span style={{ fontSize: FS.small, color: tomIdade.cor, fontWeight: tomIdade.peso, whiteSpace: "nowrap" }}>
              {idadePorExtenso(dias)}
            </span>
          )}
        </div>
        {!isDeleted && <DetalheProducao item={item} style={{ marginTop: 0 }} />}
        {/* Row 4: sponsors */}
        {!isDeleted && item.sponsors && item.sponsors.length > 0 && (
          <div style={{ minWidth: 0, overflow: "hidden" }}>
            <SponsorChips sponsors={item.sponsors} variant="colored" size="sm" max={2} />
          </div>
        )}
      </div>
      {/* Action buttons — compact on mobile */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
        {isDeleted && (isAdmin ? (
          <button
            onClick={(e) => { e.stopPropagation(); acoes.restaurar(item.id); }}
            disabled={restorePending}
            title="Restaurar peça" aria-label="Restaurar peça"
            data-testid={`button-restore-${item.id}`}
            style={{ background: TOM.esmeralda.bg, border: `1px solid ${TOM.esmeralda.border}`, cursor: restorePending ? "not-allowed" : "pointer", borderRadius: 6, color: TOM.esmeralda.text, display: "flex", alignItems: "center", justifyContent: "center", height: 44, width: 44, opacity: restorePending ? 0.6 : 1 }}
          >
            {restaurando
              ? <Loader2 className="animate-spin" style={{ width: 15, height: 15 }} />
              : <RotateCcw style={{ width: 15, height: 15 }} />}
          </button>
        ) : (
          // solicitacao ENXERGA a lixeira (o servidor libera o GET)
          // mas não pode restaurar: sem este botão a pessoa achava a
          // peça que apagou por engano e não descobria nem que existe
          // caminho de volta, nem a quem pedir.
          <button
            type="button" disabled aria-disabled="true"
            title="Só um administrador pode restaurar peças excluídas"
            aria-label="Só um administrador pode restaurar peças excluídas"
            style={{ background: "none", border: `1px solid ${T.border}`, borderRadius: 6, color: T.second, display: "flex", alignItems: "center", justifyContent: "center", height: 44, width: 44, cursor: "not-allowed" }}
          >
            <RotateCcw style={{ width: 15, height: 15 }} />
          </button>
        ))}
        {!isDeleted && (
          <button
            onClick={(e) => { e.stopPropagation(); acoes.abrir(item); }}
            aria-label="Ver detalhes da peça" title="Ver detalhes" data-testid={`button-view-${item.id}`}
            style={{
              background: T.surface, border: `1px solid ${T.border}`, cursor: "pointer",
              borderRadius: R.md, color: T.apoio,
              display: "flex", alignItems: "center", justifyContent: "center",
              height: 44, width: 44,
            }}
          >
            <Eye style={{ width: 15, height: 15 }} />
          </button>
        )}
        {!isDeleted && canDeleteAny && (
          <button
            onClick={(e) => { e.stopPropagation(); acoes.excluir(item.id); }}
            data-testid={`button-delete-${item.id}`}
            title="Excluir peça" aria-label="Excluir peça"
            style={{
              background: T.surface, border: `1px solid ${T.border}`, cursor: "pointer",
              borderRadius: R.md, color: T.apoio,
              display: "flex", alignItems: "center", justifyContent: "center",
              height: 44, width: 44,
            }}
          >
            <Trash2 style={{ width: 14, height: 14 }} />
          </button>
        )}
      </div>
    </div>
  );
});
