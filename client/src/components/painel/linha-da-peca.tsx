// ─── A linha da peça (tabela) — memoizada ───────────────────────────────────
// Props primitivas ou estáveis (o objeto `acoes` nasce uma vez na página e lê
// o estado atual por ref): um clique que não muda a lista não chega aqui.
import { memo, useState } from "react";
import { Eye, Paperclip, Trash2, FileText, RotateCcw, Loader2, MessageSquare } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { SeloKit } from "@/components/kit/selo-kit";
import { SponsorChips } from "@/components/sponsor-chips";
import { StatusPill } from "@/components/status-pill";
import { DetalheProducao } from "@/components/detalhe-producao";
import { getStatusMeta } from "@/lib/status";
import { statusDeExibicao } from "@shared/molde";
import type { SeloEventoFinalizado } from "@/lib/painel-encerrados";
import { T, TOM, FONT } from "@/lib/theme";
import { SELO_CALMO } from "./estilos";
import { LIMITE_PARADA, diasNoEstado, tomDaIdade, idadePorExtenso } from "./regras";
import type { AcoesDaLista, PecaDoPainel } from "./tipos";

export interface LinhaProps {
  item: PecaDoPainel;
  idx: number;
  selecionado: boolean;
  selo: SeloEventoFinalizado | null;
  isCompact: boolean;
  isAdmin: boolean;
  canDeleteAny: boolean;
  restaurando: boolean;
  restorePending: boolean;
  relogioIdade: number;
  acoes: AcoesDaLista;
}

export const LinhaDaPeca = memo(function LinhaDaPeca({
  item, idx, selecionado, selo, isCompact, isAdmin, canDeleteAny, restaurando, restorePending, relogioIdade, acoes,
}: LinhaProps) {
  const isDeleted = !!item.deletedAt;
  // Observação aberta: o texto é livre e longo (motivo de reprovação), cabia
  // só no `title` e o tablet não tem hover. Estado LOCAL da linha — abrir uma
  // observação não pode re-renderizar a lista inteira.
  const [obsAberta, setObsAberta] = useState(false);
  return (
    <tr
      className="pg-row"
      data-zebra={idx % 2 === 1 ? "1" : "0"}
      data-deleted={isDeleted ? "1" : "0"}
      data-selected={selecionado ? "1" : "0"}
      data-testid={`item-row-${item.id}`}
      onClick={() => !isDeleted && acoes.abrir(item)}
    >
      {/* Seleção */}
      <td style={{ padding: "10px 0 10px 12px" }}>
        {!isDeleted && (
          /* stopPropagation no LABEL, e não só no input:
             a linha inteira abre a peça no clique, e a área
             nova do alvo fica fora do input. Sem isto, mirar
             a borda do alvo marcaria a peça E abriria o
             modal — o alvo maior viraria uma armadilha. */
          <label className="pg-check" onClick={(e) => e.stopPropagation()}>
            <input
              type="checkbox"
              checked={selecionado}
              onChange={() => acoes.alternarSelecao(item.id)}
              aria-label={`Selecionar a peça ${item.displayId}`}
              data-testid={`checkbox-${item.id}`}
              style={{ width: 15, height: 15, cursor: "pointer", accentColor: T.accentText }}
            />
          </label>
        )}
      </td>

      {/* ID (+ tipo; + medidas no modo reduzido) */}
      <td style={{ padding: "10px 18px 10px 20px", overflow: "hidden" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
          <button onClick={e => { e.stopPropagation(); if (!isDeleted) acoes.abrir(item); }} disabled={isDeleted} aria-label={`Ver detalhes da peça ${item.displayId}`} data-testid={`text-display-id-${item.id}`} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: FONT.mono, fontWeight: 700, color: isDeleted ? TOM.perigo.text : T.accentText, fontSize: 13, textDecoration: isDeleted ? "line-through" : "none", textAlign: "left" }}>
            {item.displayId}
          </button>
          <SeloKit peca={item} style={{ alignSelf: "flex-start" }} />
          {/* O TIPO só existia na linha de sub-header
              com colspan, que não é sticky: com 40
              "Banner" num evento, rolar deixava a
              linha órfã do próprio tipo. */}
          {/* DUAS LINHAS em vez de reticências + `title`: no tablet não há
              hover, então o texto cortado não tinha onde aparecer inteiro. */}
          <span style={{ fontSize: 10, fontWeight: 600, color: T.second, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", overflowWrap: "anywhere", lineHeight: 1.3 }}>
            {item.type}
          </span>
          {/* O selo se repete na LINHA, e não só
              no cabeçalho do grupo: quem chega por
              busca de código, por link direto ou
              rolando uma lista longa lê a linha, e
              o cabeçalho pode estar 40 linhas
              acima. A frase começa em "Evento" —
              é a mesma da trilha da ficha (lib/
              status, marcoEventoFinalizado), para
              que ninguém entenda que foi a PEÇA
              que acabou. */}
          {/* OS SELOS DEITAM, e não empilham.

              Esta célula era uma coluna vertical com
              até OITO filhos — ID, tipo, selo do
              evento, data de exclusão, medidas,
              "Reaproveit.", "Ref. visual" e "Book" —
              cada um numa linha própria com gap 4.
              Como quase todos são condicionais, a
              altura da linha passava a depender de
              QUANTOS selos aquela peça tivesse.

              Medido em produção, 150 linhas: 55% em
              63px e o resto espalhado até 93px. E a
              coluna de ID era a única causa — as
              outras seis colunas cabem em 24px. A
              lista lia irregular porque a identidade
              da peça crescia para baixo.

              Selo é etiqueta, e etiqueta deita ao lado
              da outra. Numa fileira que quebra só
              quando precisa, quatro selos ocupam UMA
              linha em vez de quatro. */}
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 4, minWidth: 0 }}>
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
            <span style={{ fontSize: 10, color: T.second }}>
              Excluído {format(new Date(item.deletedAt), "dd/MM/yy", { locale: ptBR })}
            </span>
          )}
          {isCompact && !isDeleted && ((item.visualWidth && item.visualHeight) || (item.fileWidth && item.fileHeight)) && (
            <span style={{ fontFamily: FONT.mono, fontSize: 11, fontWeight: 700, color: T.apoio, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {item.fileWidth && item.fileHeight
                ? `ARQ ${item.fileWidth} × ${item.fileHeight}`
                : `VIS ${item.visualWidth} × ${item.visualHeight}`}
            </span>
          )}
          {!isDeleted && item.isReuse && (
            <span style={SELO_CALMO}>
              Reaproveitada
            </span>
          )}
          {!isDeleted && item.referenceUrl && (
            <a href={item.referenceUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} title="Ver referência visual do solicitante" className="pg-anexo" style={{ ...SELO_CALMO, gap: 4, textDecoration: "none" }} data-testid={`link-reference-painel-${item.id}`}>
              <Paperclip aria-hidden="true" style={{ width: 11, height: 11 }} />
              Ref. visual
            </a>
          )}
          {!isDeleted && item.bookUrl && (
            <a href={item.bookUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} title="Abrir book de aprovação (PDF) enviado pela Arte" className="pg-anexo" style={{ ...SELO_CALMO, gap: 4, textDecoration: "none" }} data-testid={`link-book-painel-${item.id}`}>
              <FileText aria-hidden="true" style={{ width: 11, height: 11 }} />
              Book
            </a>
          )}
          </div>
        </div>
      </td>

      {/* Descrição (+ patrocinador no modo reduzido) */}
      <td style={{ padding: "10px 18px", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, overflow: "hidden", minWidth: 0 }}>
          {item.description ? (
            /* A DESCRIÇÃO É O QUE IDENTIFICA A PEÇA. Em uma linha com
               reticências, duas peças do mesmo evento viravam o mesmo texto e
               o completo só existia no `title` — que no tablet não existe.
               Duas linhas resolvem sem alargar a coluna. */
            <span style={{ fontSize: 13, color: isDeleted ? T.second : T.strong, fontWeight: 500, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", overflowWrap: "anywhere", lineHeight: 1.3, flexShrink: 1, minWidth: 0, textDecoration: isDeleted ? "line-through" : "none" }}>
              {item.description}
            </span>
          ) : (
            <span style={{ color: T.second, fontSize: 13 }}>—</span>
          )}
          {!isDeleted && item.observations && (
            /* maxWidth + ellipsis + title: o selo
               mostrava a observação INTEIRA com
               nowrap e flex-shrink 0. O campo é
               texto livre e carrega motivo de
               reprovação — parágrafos. O ↩ cru
               virou ícone com rótulo. */
            /* O texto completo é o CONTEÚDO do botão, revelado ao tocar: era
               `title`, e observação carrega motivo de reprovação — o dado que
               mais se precisa ler e o único jeito de lê-lo era o mouse. */
            <button
              type="button"
              onClick={e => { e.stopPropagation(); setObsAberta(v => !v); }}
              aria-expanded={obsAberta}
              data-testid={`observacao-${item.id}`}
              style={{
                ...SELO_CALMO, flexShrink: 1, minWidth: 0,
                maxWidth: obsAberta ? "100%" : 200,
                overflow: "hidden", gap: 4, fontWeight: 500, cursor: "pointer",
                textAlign: "left", font: "inherit", fontSize: 11,
                ...(obsAberta
                  ? { whiteSpace: "normal", overflowWrap: "anywhere" }
                  : { textOverflow: "ellipsis", whiteSpace: "nowrap" }),
              }}
            >
              <MessageSquare aria-hidden="true" style={{ width: 11, height: 11, flexShrink: 0 }} />
              <span className="sr-only">Observação: </span>
              <span style={obsAberta ? undefined : { overflow: "hidden", textOverflow: "ellipsis" }}>{item.observations}</span>
            </button>
          )}
        </div>
        {isCompact && !isDeleted && (
          <div style={{ marginTop: 4, minWidth: 0, overflow: "hidden" }}>
            <SponsorChips sponsors={item.sponsors ?? []} variant="colored" size="sm" max={3} />
          </div>
        )}
      </td>

      {/* Medidas */}
      {!isCompact && (
        <td style={{ padding: "10px 18px", overflow: "hidden" }}>
          {!isDeleted && ((item.visualWidth && item.visualHeight) || (item.fileWidth && item.fileHeight)) ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {/* ARQ primeiro e escuro: é o par que a
                  impressora recebe e o m² cobra — a mesma
                  ênfase da Gráfica, para as duas telas
                  contarem a mesma história. */}
              {item.fileWidth && item.fileHeight && (
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: TOM.alerta.text, width: 30, flexShrink: 0 }}>ARQ</span>
                  <span style={{ fontFamily: FONT.mono, fontSize: 13, fontWeight: 700, color: T.strong, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {item.fileWidth} × {item.fileHeight}
                  </span>
                </div>
              )}
              {item.visualWidth && item.visualHeight && (
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: T.second, width: 30, flexShrink: 0 }}>VIS</span>
                  <span style={{ fontFamily: FONT.mono, fontSize: 13, fontWeight: 700, color: T.second, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {item.visualWidth} × {item.visualHeight}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <span style={{ color: T.second, fontSize: 13 }}>—</span>
          )}
        </td>
      )}

      {/* Patrocinador — na linha excluída a célula ganha "—" em vez
          de ficar vazia (leitura de tabela: vazio parece dado faltando). */}
      {!isCompact && (
        <td style={{ padding: "10px 18px", overflow: "hidden" }}>
          {isDeleted
            ? <span style={{ color: T.second, fontSize: 13 }}>—</span>
            : <SponsorChips sponsors={item.sponsors ?? []} variant="colored" size="sm" max={4} />}
        </td>
      )}

      {/* Status · tempo

          A pilula diz ONDE a peca esta; a linha
          abaixo diz DESDE QUANDO. Sem a segunda, a
          lista mostra 1.129 pecas em "Aguardando
          envio" sem distinguir vazao normal de
          travamento de duas semanas.

          Peca sem carimbo nao ganha linha nenhuma:
          um campo vazio diz "nao sei"; um numero
          inferido da criacao diria "sei" e mentiria.

          Padding 16 e nao 20: abre a linha extra sem
          crescer a altura da tabela. */}
      <td data-testid={`cell-idade-${item.id}`} style={{ padding: "10px 16px", overflow: "hidden" }}>
        <StatusPill status={isDeleted ? "deleted" : statusDeExibicao(item)} />
        {!isDeleted && <DetalheProducao item={item} style={{ whiteSpace: "normal" }} />}
        {(() => {
          if (isDeleted) return null;
          // `relogioIdade` e nao Date.now(): a linha e memoizada, entao o
          // "agora" chega por prop (ver o relogio de hora em PainelGeral).
          const d = diasNoEstado(item, relogioIdade);
          if (d === null) return null;
          const tom = tomDaIdade(d);
          return (
            <p
              style={{ margin: "3px 0 0", fontSize: 11, color: tom.cor, fontWeight: tom.peso, whiteSpace: "nowrap" }}
              /* O title passa a existir SEMPRE: "há 3 dias" solto
                 não diz de quê — da criação? da última edição?
                 É o tempo desde a última MUDANÇA DE STATUS. */
              title={d > LIMITE_PARADA
                ? `Parada em ${getStatusMeta(item.status).label} ${idadePorExtenso(d)} (mais de ${LIMITE_PARADA} dias sem mudar de etapa)`
                : `Em ${getStatusMeta(item.status).label} ${d === 0 ? "desde hoje" : idadePorExtenso(d)} — tempo desde a última mudança de status`}
            >
              {idadePorExtenso(d)}
            </p>
          );
        })()}
      </td>

      {/* Ação */}
      <td style={{ padding: "10px 18px", textAlign: "right" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4 }}>
          {isDeleted && (isAdmin ? (
            <button
              onClick={(e) => { e.stopPropagation(); acoes.restaurar(item.id); }}
              disabled={restorePending}
              title="Restaurar peça" aria-label="Restaurar peça"
              data-testid={`button-restore-${item.id}`}
              style={{ background: TOM.esmeralda.bg, border: `1px solid ${TOM.esmeralda.border}`, cursor: restorePending ? "not-allowed" : "pointer", borderRadius: 6, color: TOM.esmeralda.text, display: "flex", alignItems: "center", justifyContent: "center", padding: 6, opacity: restorePending ? 0.6 : 1 }}
            >
              {restaurando
                ? <Loader2 className="animate-spin" style={{ width: 14, height: 14 }} />
                : <RotateCcw style={{ width: 14, height: 14 }} />}
            </button>
          ) : (
            <button
              type="button" disabled aria-disabled="true"
              title="Só um administrador pode restaurar peças excluídas"
              aria-label="Só um administrador pode restaurar peças excluídas"
              style={{ background: "none", border: "none", padding: 4, color: T.second, display: "flex", alignItems: "center", justifyContent: "center", cursor: "not-allowed" }}
            >
              <RotateCcw style={{ width: 15, height: 15 }} />
            </button>
          ))}
          {!isDeleted && (
            <button
              onClick={(e) => { e.stopPropagation(); acoes.abrir(item); }}
              aria-label="Ver detalhes da peça" title="Ver detalhes" data-testid={`button-view-${item.id}`}
              style={{
                background: "none", border: "none", cursor: "pointer",
                padding: 4, borderRadius: 6, color: T.second,
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "color 0.15s",
              }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = T.accentText)}
              onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = T.second)}
            >
              <Eye style={{ width: 16, height: 16 }} />
            </button>
          )}
          {!isDeleted && canDeleteAny && (
            <button
              onClick={(e) => { e.stopPropagation(); acoes.excluir(item.id); }}
              data-testid={`button-delete-${item.id}`}
              title="Excluir peça" aria-label="Excluir peça"
              style={{
                background: "none", border: "none", cursor: "pointer",
                padding: 4, borderRadius: 6, color: T.second,
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "color 0.15s",
              }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = TOM.perigo.text)}
              onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = T.second)}
            >
              <Trash2 style={{ width: 15, height: 15 }} />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
});
