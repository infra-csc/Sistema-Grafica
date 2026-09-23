// ─────────────────────────────────────────────────────────────────────────────
// A LINHA DA TABELA (desktop e notebook): os cabeçalhos de grupo, evento e
// tipo quando mudam, a linha da peça e as linhas extras (motivo do aumento,
// observação, "Mostrar todas"). A coluna de Ações mora em acoes-da-linha.tsx.
// É memoizada pela LinhaMemo da lista: tudo o que ela lê vem de `ctx` e está
// no inventário `depsDaLinha` da página.
// ─────────────────────────────────────────────────────────────────────────────
import { Fragment } from "react";
import { Link } from "wouter";
import { AlertCircle, AlertTriangle, Calendar, Camera, Package, PlusCircle, RotateCcw, Tag, Truck } from "lucide-react";
import { Botao } from "@/components/ui/botao";
import { Selo } from "@/components/ui/selo";
import { StatusPill } from "@/components/status-pill";
import { SeloKit } from "@/components/kit/selo-kit";
import { AvisoDoEstoqueNaPeca } from "@/components/consulta-de-estoque/aviso-na-grafica";
import { miniatura } from "@/lib/miniatura";
import { convertGCSUrlToLocalPath } from "@/lib/artePdfExport";
import { parseDateLocal } from "@/lib/utils";
import { diasNaFase, tomDaIdade } from "@/lib/idade-na-fase";
import { splitDisplayId } from "@/lib/displayId";
import { motivoAcaoBloqueada } from "@/lib/status";
import { FONT, FS, FW, N, R, T, TOM } from "@/lib/theme";
import { alvo as alvoDeToque } from "@/hooks/use-mobile";
import { statusDeExibicao } from "@shared/molde";
import { EM_REVISAO } from "@shared/fluxo-peca";
import { fraseDaFila } from "@shared/progresso-da-impressao";
import { isInProd, qtyOf, reusedOf, reusedTotalOf, isComplement, complementsQtyOf, contractedTotalOf } from "@/lib/saldo";
import { podeAumentarQuantidade } from "@/components/aumentar-quantidade-dialog";
import type { PecaDaFila } from "@/components/grafica/tipos";
import type { ContextoDaLinha, CorteDoEvento } from "./contexto-da-linha";
import { CO, corTintada, rowBg } from "./aparencia";
import { complementOpen, fmtDataHora, parentDisplayIdOf } from "./regras";
import { ProgressoImpressao } from "./progresso-impressao";
import { DeadlineChip, SeloFilaDaImpressora, m2DaLinha } from "./selos";
import { AcoesDaLinha } from "./acoes-da-linha";

export function LinhaDaTabela({ ctx, item, prev, showEvHeader, showTypeHeader, corte }: {
  ctx: ContextoDaLinha;
  item: PecaDaFila;
  /** A linha de cima: os cabeçalhos de grupo, evento e tipo nascem da comparação com ela. */
  prev: PecaDaFila | null;
  showEvHeader: boolean;
  showTypeHeader: boolean;
  corte: CorteDoEvento | undefined;
}) {
  const {
    canProduce, canConfer, podeEmbalar, soVisualizaKit, podeMexerQtd,
    bulkOn, bulkConferMode, bulkPackMode, bulkSelectedIds, toggleBulkItem,
    novoComplementoId, seloDoItem, etiquetaveisPorEvento, tubaveisPorEvento, typeToGroup, expandirGrupo,
    setTubosDoEvento, seloDoTubo, tituloDoTubo, abrirTuboDaPeca, fechamentoDoTubo,
    setViewDetailsItem, abrirComplemento, openProductionModal, travaDaLinha,
    compacto, nColunas, tamLinha, ponteiroGrosso,
  } = ctx;
  // Mesmo padrão do mobile: elegível conforme o modo de lote
  // ativo — antes só a entrega em lote tinha checkbox na tabela.
  const isSelected = bulkSelectedIds.has(item.id);
  const emRevisao = EM_REVISAO.has(item.status);
  const podeEmbalarPeca = podeEmbalar(item);
  const bulkEligible = !emRevisao && (bulkConferMode ? canConfer(item) : bulkPackMode ? podeEmbalarPeca : false);
  // ── Complemento ──
  // ehComplemento: esta linha nasceu de um aumento de quantidade.
  // coAberto: o realce FORTE ainda vale (não foi entregue).
  // complQty: soma dos complementos vivos → esta linha é a MÃE.
  const ehComplemento = isComplement(item);
  const coAberto = complementOpen(item);
  const maeDisplayId = ehComplemento ? parentDisplayIdOf(item) : "";
  const complQty = complementsQtyOf(item);
  const { base: idBase, suffix: idSuffix } = splitDisplayId(item.displayId);
  // Recém-criada nesta sessão: realce de 5 s (fundo + faixa 4px).
  const isNovo = item.id === novoComplementoId;
  // O gatilho de AUMENTAR. Some em qualquer modo de lote: o
  // complemento exige quantidade e justificativa POR PEÇA.
  const mostraAumentar = !bulkOn && !emRevisao && !soVisualizaKit(item) && podeAumentarQuantidade(item, podeMexerQtd);
  // Evento finalizado: selo na linha e botões barrados
  // desabilitados (ver `seloDoItem` em useFilaDaGrafica).
  const selo = seloDoItem(item);
  // NOTEBOOK COM A BARRA LATERAL (1.366 − 16rem ≈ 1.010px de conteúdo): na
  // compacta cada célula respira 10px, não 16 — seis colunas × 12px é a folga
  // que faltava para a tabela caber em vez de descer para os cartões.
  const padCelula = compacto ? "13px 10px" : "13px 16px";

  return (
    <Fragment>
      {/* Cabeçalho de Evento */}
      {(() => {
        const groupName = typeToGroup[item.type] || '';
        const prevGroupName = prev ? (typeToGroup[prev.type] || '') : '';
        const showGroupHeader = !showEvHeader && groupName !== '' && groupName !== prevGroupName;
        // Grupo em NEUTRO: era azul (#dbeafe/#1d4ed8) — a única
        // faixa azul da tela, sem significado nenhum de status.
        return showGroupHeader ? (
          <tr style={{ backgroundColor: T.surface, borderTop: `1px solid ${T.border}` }}>
            <td colSpan={nColunas} style={{ padding: '7px 16px 5px' }}>
              <span style={{ fontSize: FS.small, fontWeight: FW.rotulo, color: T.apoio }}>{groupName}</span>
            </td>
          </tr>
        ) : null;
      })()}
      {showEvHeader && (
        <tr style={{ backgroundColor: T.dark }}>
          <td colSpan={nColunas} style={{ padding: "10px 16px" }}>
            {/* flexWrap: com a caixa estreita as datas, o prazo e
                as etiquetas descem para uma segunda linha em vez
                de sair pela direita cortados. */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "6px 12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <Package style={{ width: 16, height: 16, color: T.accent }} />
                <span style={{ fontSize: FS.read, fontWeight: FW.rotulo, color: T.surface, fontFamily: FONT.display }}>
                  {item.event?.name || "Sem Evento"}
                </span>
              </div>
              {item.event && (
                <div style={{ display: "flex", alignItems: "center", gap: "6px 16px", flexWrap: "wrap", minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "rgba(255,255,255,0.72)" }}>
                    <Calendar style={{ width: 12, height: 12 }} />
                    Início: <strong style={{ color: "rgba(255,255,255,0.85)" }}>{parseDateLocal(item.event.startDate).toLocaleDateString("pt-BR")}</strong>
                  </div>
                  <span style={{ color: "rgba(255,255,255,0.72)", fontSize: FS.small }}>|</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "rgba(255,255,255,0.72)" }}>
                    <Truck style={{ width: 12, height: 12 }} />
                    Saída: <strong style={{ color: "rgba(255,255,255,0.85)" }}>
                      {new Date(item.event.truckDepartureDate).toLocaleDateString("pt-BR", { timeZone: 'UTC' })} às {new Date(item.event.truckDepartureDate).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: 'UTC' })}
                    </strong>
                  </div>
                  <DeadlineChip event={item.event} />
                  {(etiquetaveisPorEvento.get(String(item.eventId)) ?? 0) > 0 && (
                    <Link
                      href={`/eventos/${item.eventId}/etiquetas?de=grafica`}
                      data-testid={`link-etiquetas-${item.eventId}`}
                      title="Imprimir as etiquetas das peças já conferidas deste evento"
                      style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 999, background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)", color: T.surface, fontSize: FS.small, fontWeight: FW.rotulo, textDecoration: "none", whiteSpace: "nowrap" }}
                    >
                      <Tag style={{ width: 11, height: 11 }} />
                      Etiquetas ({etiquetaveisPorEvento.get(String(item.eventId))})
                    </Link>
                  )}
                  {(tubaveisPorEvento.get(String(item.eventId)) ?? 0) > 0 && (
                    <button
                      type="button"
                      className="ds-botao"
                      onClick={(e) => { e.stopPropagation(); setTubosDoEvento({ id: String(item.eventId), name: item.event?.name ?? "Evento" }); }}
                      data-testid={`button-tubos-${item.eventId}`}
                      title="Agrupar as peças em tubos e entregar por tubo"
                      style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 999, background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)", color: T.surface, fontSize: FS.small, fontWeight: FW.rotulo, whiteSpace: "nowrap", cursor: "pointer" }}
                    >
                      <Package style={{ width: 11, height: 11 }} />
                      Tubos
                    </button>
                  )}
                </div>
              )}
            </div>
          </td>
        </tr>
      )}

      {/* Cabeçalho de Tipo */}
      {showTypeHeader && (
        <tr style={{ backgroundColor: N.n2 }}>
          <td colSpan={nColunas} style={{ padding: "6px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 3, height: 14, backgroundColor: T.accent, borderRadius: 999, flexShrink: 0 }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: T.text }}>{item.type}</span>
            </div>
          </td>
        </tr>
      )}

      {/* Linha do item */}
      <tr
        // Fundo em UMA função (rowBg) usada nas três mãos: antes
        // style, onMouseEnter e onMouseLeave decidiam a cor cada
        // um por conta própria e o hover apagava qualquer realce
        // que não estivesse repetido nos três.
        style={{ borderBottom: `1px solid ${coAberto ? CO.border : item.isReuse ? TOM.sucesso.border : N.n2}`, cursor: "pointer", transition: "background-color 0.1s", backgroundColor: rowBg(item, isSelected, false, isNovo) || undefined }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = rowBg(item, isSelected, true, isNovo); }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = rowBg(item, bulkSelectedIds.has(item.id), false, isNovo); }}
        onClick={bulkOn && bulkEligible ? () => toggleBulkItem(item.id) : () => setViewDetailsItem(item)}
        data-item-row={item.id}
        data-testid={`row-item-${item.id}`}
      >
        {/* ID — a linha abre o detalhe no clique, mas <tr> não
            recebe foco: sem mouse não havia como abrir peça
            nenhuma. O ID vira o alvo focável, o rótulo natural da
            linha (#047857 sobre branco passa AA e continua
            sinalizando reaproveitamento).
            A FAIXA LATERAL do complemento mora aqui, como
            boxShadow inset da primeira célula: com
            border-collapse a <tr> não renderiza borda esquerda de
            forma confiável. Ela some quando o lote é entregue; o
            conector em L (o traço que amarra o filho à mãe logo
            acima) fica para sempre. */}
        <td style={{ padding: padCelula, boxShadow: isNovo ? `inset 4px 0 0 ${CO.stripe}` : coAberto ? `inset 3px 0 0 ${CO.stripe}` : undefined }}>
          {ehComplemento && (
            <span aria-hidden="true" style={{ display: "inline-block", width: 10, height: 8, marginRight: 6, marginBottom: 2, borderLeft: `1px solid ${CO.connector}`, borderBottom: `1px solid ${CO.connector}`, borderBottomLeftRadius: 3, verticalAlign: "middle" }} />
          )}
          <button
            onClick={e => { e.stopPropagation(); setViewDetailsItem(item); }}
            aria-label={ehComplemento
              ? `Ver detalhes da peça ${item.displayId}, complemento de ${maeDisplayId}`
              : `Ver detalhes da peça ${item.displayId}`}
            style={{ fontSize: 13, fontFamily: FONT.mono, color: item.isReuse ? TOM.esmeralda.text : T.accentText, fontWeight: 700, letterSpacing: "0.04em", background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
            data-testid={`text-display-id-${item.id}`}
          >
            {idBase}{idSuffix && <span style={{ color: CO.suffix }}>{idSuffix}</span>}
          </button>
          {/* Kit (14/09): a peça do Kit se declara na fila, com a entrega. */}
          <SeloKit peca={item} style={{ display: "flex", width: "fit-content", marginTop: 4 }} />
          <AvisoDoEstoqueNaPeca peca={item} style={{ marginTop: 4 }} />
          {seloDoTubo(item) && (
            <button type="button" data-testid={`chip-tubo-${item.id}`} title={tituloDoTubo(item)}
              aria-label={`${seloDoTubo(item)} — ver o que está no tubo`}
              onClick={e => { if (bulkOn) return; e.stopPropagation(); abrirTuboDaPeca(item); }}
              /* LINHA PRÓPRIA, abaixo do código (dono, 21/09: "muito grudado no número
                 do item") — como o selo KIT; quebra sem cortar quando a peça
                 está em mais de um tubo. */
              style={{ display: "flex", width: "fit-content", maxWidth: "100%", flexWrap: "wrap", alignItems: "center", gap: 3, marginTop: 6, padding: "2px 7px", borderRadius: R.pill, fontSize: FS.small, fontWeight: FW.rotulo, lineHeight: 1.35, textAlign: "left", color: T.accentText, background: TOM.laranja.bg, border: `1px solid ${TOM.laranja.border}`, whiteSpace: "normal", cursor: "pointer", fontFamily: "inherit" }}>
              {fechamentoDoTubo.has(item.tuboId) && <Camera aria-hidden="true" style={{ width: 10, height: 10 }} />}
              {seloDoTubo(item)}
            </button>
          )}
        </td>
        {/* Descrição — com a arte ao lado: a Gráfica identifica a
            peça pelo desenho, não pelo texto, e antes era preciso
            abrir o detalhe de cada uma para saber o que era. */}
        {/* O TETO DE LARGURA MORA NA DIV, não na <td>. `max-width`
            numa célula de tabela automática é ignorado pelo
            Chrome: a descrição em `nowrap` (com reticências só
            visuais) fazia a coluna Peça medir a frase INTEIRA —
            era esta coluna que empurrava a tabela para fora da
            caixa com a barra lateral aberta. Numa div o teto vale
            e limita também a largura mínima que ela pede. */}
        <td style={{ padding: padCelula }}>
          <div data-testid={`celula-peca-${item.id}`} style={{ display: "flex", alignItems: "flex-start", gap: 10, maxWidth: compacto ? 260 : 320, minWidth: 160 }}>
            {item.approvalThumbUrl && (
              <a
                href={convertGCSUrlToLocalPath(item.approvalThumbUrl)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                title="Abrir a arte aprovada"
                data-testid={`thumb-art-${item.id}`}
                style={{ display: "block", width: 44, height: 44, borderRadius: 6, overflow: "hidden", border: `1px solid ${T.border}`, backgroundColor: T.surface, flexShrink: 0 }}
              >
                <img src={convertGCSUrlToLocalPath(item.approvalThumbUrl)} alt="Arte"
                  loading="lazy" decoding="async"
                  style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
                  onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
              </a>
            )}
            <div style={{ minWidth: 0, flex: 1 }}>
          {/* SELO DO COMPLEMENTO — o sinal mais forte da tela, no
              topo da pilha de badges. Sólido (não outline) porque
              significa TRABALHO NOVO na fila: o número que está na
              linha já é exatamente o que falta imprimir, sem
              conta nenhuma. Depois da entrega vira outline: a
              identidade permanece, o alarme não. */}
          {ehComplemento && (
            <Selo
              forma="retangulo"
              icone={PlusCircle}
              cores={coAberto ? { bg: CO.solidBg, text: CO.solidText, border: CO.solidBg } : TOM.laranja}
              data-testid={`badge-complemento-${item.id}`}
              title={item.complementReason ? `Motivo: ${item.complementReason}` : `Complemento de ${maeDisplayId}`}
              style={{ padding: "2px 8px", marginBottom: 5, marginRight: 5 }}
            >
              {coAberto
                ? `+${qtyOf(item)} un. — complemento de ${maeDisplayId}`
                : `Complemento de ${maeDisplayId}`}
            </Selo>
          )}
          {/* MÃE — selo espelho, sempre outline: ela não tem
              trabalho pendente (nada nela mudou), mas sem isto o
              operador não entende por que uma peça entregue
              ganhou uma linha nova logo abaixo. */}
          {complQty > 0 && (
            <Selo
              forma="retangulo"
              tom="laranja"
              icone={PlusCircle}
              data-testid={`badge-tem-complemento-${item.id}`}
              title={`Contratado total: ${contractedTotalOf(item)} un. (${qtyOf(item)} + ${complQty}) · ${(item.complements ?? []).map((c) => `${c.displayId} (+${c.quantity})`).join(", ")}`}
              style={{ padding: "2px 8px", marginBottom: 5, marginRight: 5 }}
            >
              Tem complemento (+{complQty})
            </Selo>
          )}
          {/* EVENTO FINALIZADO — a peça voltou para a fila (ver
              `items`), então ela tem de se declarar. Sem este
              selo o operador vê "Produzir" apagado e conclui que
              o sistema quebrou; com ele, sabe que o evento acabou
              e que só restam conferência e entrega. */}
          {selo && (
            <Selo
              forma="retangulo"
              ponto
              cores={selo}
              data-testid={`badge-evento-finalizado-${item.id}`}
              title={selo.hint}
              style={{ padding: "2px 8px", marginBottom: 5, marginRight: 5 }}
            >
              {selo.label}
            </Selo>
          )}
          {/* PRIORITÁRIA (dono, 27/08: "na Gráfica também") — o
              mesmo selo da Arte e da lista do evento; aqui ela
              também sobe para o topo do bloco do seu evento. */}
          {item.isPriority && (
            <Selo
              forma="retangulo"
              tom="perigo"
              icone={AlertTriangle}
              data-testid={`selo-prioritaria-${item.id}`}
              title="Peça prioritária — marcada pela Solicitação para sair na frente"
              style={{ padding: "2px 8px", marginBottom: 5, marginRight: 5 }}
            >
              Prioritária
            </Selo>
          )}
          {/* A cor verde da linha sozinha não diz o que é: o rótulo
              precisa aparecer sempre que houver reaproveitamento,
              inclusive nas peças marcadas antes de reuseQty existir. */}
          {(item.isReuse || reusedOf(item) > 0) && (
            /* Tint claro com texto TOM.esmeralda.text (5,4:1): era
               branco sobre o verde saturado, 2,54:1, justo no
               rótulo que decide se a peça vai para a impressora. */
            <Selo forma="retangulo" tom="esmeralda" icone={RotateCcw}
              title={item.isReuse ? "Peça inteira reaproveitada" : `${reusedOf(item)} de ${qtyOf(item)} un. reaproveitadas`}
              style={{ padding: "2px 8px", marginBottom: 5 }}>
              {item.isReuse ? "Reaproveitamento" : `Reaproveitamento ${reusedOf(item)}/${qtyOf(item)}`}
            </Selo>
          )}
          {item.description ? (
            <div style={{ fontSize: 13, color: item.isReuse ? TOM.esmeralda.text : T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: item.isReuse ? 600 : 400 }}>{item.description}</div>
          ) : (
            <div style={{ fontSize: 13, color: T.second }}>—</div>
          )}
          {/* A observação em itálico que morava aqui saiu: a linha
              âmbar logo abaixo da peça já mostra o texto INTEIRO.
              Eram duas cópias da mesma frase, uma cortada. */}
          {/* Compacta: Material e acabamento descem para cá — são
              o que a impressora pede, então não podem sumir. */}
          {/* `material || finish`: peça só com acabamento perdia
              o acabamento inteiro, porque a linha dependia do
              material. Junta só o que existe, sem "·" órfão. */}
          {compacto && (item.material || item.finish) && (
            <div style={{ fontSize: 11, color: T.second, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {[item.material, item.finish].filter(Boolean).join(" · ")}
            </div>
          )}
          {item.referenceUrl && (
            <a href={item.referenceUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} title="Ver referência do solicitante" style={{ display: "inline-flex", alignItems: "center", gap: 3, marginTop: 3, fontSize: 10, fontWeight: 700, color: T.accentText, textDecoration: "none", backgroundColor: TOM.laranja.bg, border: `1px solid ${TOM.laranja.border}`, borderRadius: 6, padding: "1px 5px" }} data-testid={`link-reference-grafica-${item.id}`}>
              <img loading="lazy" decoding="async" src={miniatura(item.referenceUrl)} style={{ width: 12, height: 12, objectFit: "cover", borderRadius: 999 }} alt="" onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
              REF
            </a>
          )}
          {/* Arquivo final foi substituído pela Arte após envio inicial */}
          {item.previousFinalFileUrl && (
            <Selo
              forma="retangulo"
              tom="alerta"
              icone={AlertTriangle}
              title={`Anterior: ${item.previousFinalFileUrl}`}
              data-testid={`badge-arquivo-atualizado-${item.id}`}
              style={{ marginTop: 4, padding: "2px 7px" }}
            >
              Arquivo atualizado
            </Selo>
          )}
            </div>
          </div>
        </td>
        {/* Qtd — na MÃE ganha o chip "+N": era a única coluna
            numérica sem tratamento, e é onde a pergunta "afinal,
            quantas foram contratadas?" nasce. A quantidade da mãe
            NÃO muda (o complemento é linha própria); o chip mostra
            o que veio depois e o tooltip soma os dois.

            É TAMBÉM onde nasce o gatilho de AUMENTAR: a ação é
            sobre este número, e foi exatamente na coluna de Ações
            (espremida entre três ícones) que ela se perdeu no
            Detalhe do Evento. A célula vira uma pilha:
            número → chip +N → botão. Nada de hover-reveal: o
            botão é persistente em 100% das linhas elegíveis.
            Padding 12px em vez de 16 para o botão caber; número à
            DIREITA com algarismos tabulares (coluna numérica). */}
        <td style={{ padding: compacto ? "13px 8px" : "13px 12px", textAlign: "right", whiteSpace: "nowrap", fontSize: 14, fontWeight: 700, color: T.text, fontVariantNumeric: "tabular-nums" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
            <div>{item.quantity}</div>
            {/* PRODUZIDAS e REAPROVEITADAS — eram duas colunas
                inteiras (PROD, REAPROV.), "—" em quase todas as
                linhas. Agora só aparecem quando existem, pequenas,
                logo abaixo do número de que são parte. Mesmas
                contas e mesmas cores de antes. */}
            {(item.quantityProduced ?? 0) > 0 && (
              <div title={`${item.quantityProduced} de ${qtyOf(item)} un. produzidas`} style={{ fontSize: 11, fontWeight: 600, color: T.accentText, marginTop: 1 }}>
                prod. {item.quantityProduced}
              </div>
            )}
            {reusedTotalOf(item) > 0 && (
              <div title={item.isReuse ? "Peça inteira reaproveitada" : `${reusedTotalOf(item)} de ${qtyOf(item)} un. reaproveitadas`} style={{ fontSize: 11, fontWeight: 600, color: TOM.esmeralda.text, marginTop: 1 }}>
                reap. {reusedTotalOf(item)}{reusedTotalOf(item) < qtyOf(item) && <span style={{ color: T.second, fontWeight: 400 }}>/{qtyOf(item)}</span>}
              </div>
            )}
            {complQty > 0 && (
              <div
                data-testid={`chip-qtd-complemento-${item.id}`}
                title={`Contratado total: ${contractedTotalOf(item)} un. — complementos: ${(item.complements ?? []).map((c) => `${c.displayId} (+${c.quantity})`).join(", ")}`}
                style={{ marginTop: 2, display: "inline-block", padding: "0 5px", borderRadius: R.sm, backgroundColor: CO.hoverBg, border: `1px solid ${CO.border}`, color: CO.text, fontSize: FS.small, fontWeight: FW.rotulo }}
              >
                +{complQty}
              </div>
            )}
            {mostraAumentar && (
              // Só o ícone (decisão do dono): o title e o aria-label
              // carregam o significado.
              <Botao
                tamanho={tamLinha}
                icone={PlusCircle}
                onClick={e => { e.stopPropagation(); if (!selo) abrirComplemento(item); }}
                disabled={!!selo}
                aria-label={`Aumentar a quantidade de ${item.displayId} — cria uma peça complementar`}
                title={selo
                  ? motivoAcaoBloqueada(selo.motivo, "aumentar a quantidade")
                  : `Aumentar quantidade — cria uma peça complementar ligada a ${item.displayId}`}
                data-testid={`button-aumentar-quantidade-${item.id}`}
                style={{ ...corTintada(TOM.laranja), marginTop: 6, width: alvoDeToque(32, ponteiroGrosso), padding: 0 }}
              />
            )}
          </div>
        </td>
        {/* ── MEDIDAS: o ARQ vem primeiro e escuro ──

            Esta coluna mostrava o VISUAL em cima, escuro, e o
            arquivo embaixo, apagado — nesta tela, que é a que
            IMPRIME, e o que a impressora recebe é o ARQ (com
            sangria; é dele que sai o m² cobrado). A peça #2472
            teve o arquivo corrigido e a gráfica seguiu lendo a
            linha escura de cima, que era o outro par.

            E havia um buraco: o ARQ só aparecia SE o visual
            existisse — peça só com medida de arquivo mostrava
            "—" na tela de produção. Cada par agora se mostra
            por si. */}
        <td style={{ padding: padCelula }}>
          {(item.fileWidth && item.fileHeight) || (item.visualWidth && item.visualHeight) ? (
            <div>
              {item.fileWidth && item.fileHeight && (
                <div style={{ fontSize: 11, color: T.text, fontFamily: "monospace", whiteSpace: "nowrap" }}>
                  <span style={{ fontSize: FS.micro, fontWeight: FW.rotulo, letterSpacing: "0.06em", color: TOM.alerta.text }}>ARQ</span> {item.fileWidth}×{item.fileHeight}
                </div>
              )}
              {item.visualWidth && item.visualHeight && (
                <div style={{ fontSize: 11, color: T.second, fontFamily: "monospace", whiteSpace: "nowrap" }}>
                  <span style={{ fontSize: FS.micro, fontWeight: FW.rotulo, letterSpacing: "0.06em" }}>VIS</span> {item.visualWidth}×{item.visualHeight}
                </div>
              )}
            </div>
          ) : (
            <span style={{ fontSize: 13, color: T.second }}>—</span>
          )}
          {/* Compacta: o m² a produzir desce para baixo das medidas
              (é conta delas), com a mesma regra da coluna cheia. */}
          {compacto && Number(item.calculatedM2) > 0 && (
            <div style={{ marginTop: 3, fontSize: 12, fontWeight: 700, color: T.text, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
              {m2DaLinha(item)} <span style={{ fontSize: FS.small, fontWeight: FW.medio, color: T.second }}>m²</span>
            </div>
          )}
        </td>
        {!compacto && (
          <>
            {/* m² a produzir — o reaproveitado não vai para a
                impressora. À direita e com algarismos tabulares:
                é coluna para somar de olho, casa decimal embaixo
                de casa decimal. */}
            <td style={{ padding: "13px 16px", textAlign: "right", fontSize: 13, fontWeight: 700, color: T.text, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
              {m2DaLinha(item)}
            </td>
            {/* Material — secundário: 12px e acabamento apagado. */}
            <td style={{ padding: "13px 16px" }}>
              <div style={{ fontSize: 12, color: T.text }}>{item.material}</div>
              {item.finish && <div style={{ fontSize: 11, color: T.second, marginTop: 2 }}>{item.finish}</div>}
            </td>
          </>
        )}
        {/* Status + IDADE NA FASE (UX 27/08): a mesma régua
            7/14 dias da Arte — a Gráfica via a MESMA peça sem
            saber há quanto tempo ela estava parada ali. */}
        {/* nowrap na célula: a pílula nunca quebra ao meio e a
            coluna reserva a largura dela inteira. "há Nd" já é
            uma linha própria (div) logo abaixo. Na COMPACTA a célula
            quebra linha (o selo da fila, o Travar e o progresso descem
            um embaixo do outro) — é a coluna que mais pedia largura. */}
        <td data-testid={`celula-status-${item.id}`} style={{ padding: padCelula, whiteSpace: compacto ? "normal" : "nowrap" }}>
          <StatusPill status={statusDeExibicao(item)} size="sm" showDot={false} />
          {(() => {
            const d = diasNaFase(item, new Date());
            if (d === null || d < 1) return null;
            const tom = tomDaIdade(d);
            return <div title={`Está neste status há ${d} dia(s)`} style={{ marginTop: 3, fontSize: FS.small, fontFamily: FONT.mono, fontWeight: tom.peso, color: tom.cor }}>há {d}d</div>;
          })()}
          {/* Em impressão: impressora + "3 de 10 impressas · 7 na
              impressora" + barra (dono, 21/09). Duas linhas para a
              coluna Status não alargar. */}
          {isInProd(item) && <ProgressoImpressao item={item} fonte={10.5} duasLinhas onIniciarResto={canProduce && !seloDoItem(item) ? () => openProductionModal(item, true) : undefined} />}
          {travaDaLinha(item, 10.5, 28)}
          {(isInProd(item) ? !!fraseDaFila(item, { emImpressao: true }) : !!item.maquinaPrevista) && <div style={{ marginTop: 4 }}><SeloFilaDaImpressora item={item} fonte={10.5} /></div>}
        </td>
        <AcoesDaLinha ctx={ctx} item={item} selo={selo} emRevisao={emRevisao} isSelected={isSelected} bulkEligible={bulkEligible} ehComplemento={ehComplemento} podeEmbalarPeca={podeEmbalarPeca} />
      </tr>

      {/* MOTIVO DO AUMENTO — linha de largura total logo abaixo do
          complemento, no mesmo molde da de observações (as duas
          coexistem). SEM truncar: a observação corta com
          reticências porque é acessório; aqui a justificativa é a
          informação principal, e é o "isso fica nos logs" do
          pedido resolvido sem abrir ficha nenhuma. Some junto com
          o resto do realce quando o lote é entregue. */}
      {coAberto && item.complementReason && (
        <tr style={{ backgroundColor: CO.bg, borderBottom: `1px solid ${CO.border}` }}>
          <td colSpan={nColunas} style={{ padding: "5px 16px 7px 34px" }}>
            <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
              <PlusCircle style={{ width: 12, height: 12, color: CO.text, marginTop: 1, flexShrink: 0 }} />
              <span style={{ fontSize: FS.meta, color: CO.textStrong, lineHeight: 1.4 }} data-testid={`text-motivo-complemento-${item.id}`}>
                <strong>
                  Aumento pedido{item.complementRequestedBy ? ` por ${item.complementRequestedBy}` : ""}
                </strong>
                {item.complementRequestedAt ? ` (${fmtDataHora(item.complementRequestedAt)})` : ""}: {item.complementReason}
              </span>
            </div>
          </td>
        </tr>
      )}

      {/* Linha de observação */}
      {item.observations && (
        <tr style={{ backgroundColor: TOM.alerta.bg, borderBottom: `1px solid ${TOM.alerta.border}` }}>
          <td colSpan={nColunas} style={{ padding: "8px 16px" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <AlertCircle style={{ width: 14, height: 14, color: TOM.alerta.text, marginTop: 1, flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: TOM.alerta.text }}>
                <strong>Observações:</strong> {item.observations}
              </span>
            </div>
          </td>
        </tr>
      )}

      {/* Renderização incremental: fim do teto deste evento. */}
      {corte && (
        <tr style={{ backgroundColor: T.bg, borderBottom: `1px solid ${T.border}` }}>
          <td colSpan={nColunas} style={{ padding: "8px 16px", textAlign: "center" }}>
            <Botao
              variante="fantasma"
              tamanho={tamLinha === "toque" ? "toque" : "md"}
              onClick={e => { e.stopPropagation(); expandirGrupo(corte.chave); }}
              data-testid={`button-mostrar-todas-${corte.chave}`}
              style={{ border: `1px dashed ${T.border}`, color: T.text }}
            >
              Mostrar todas as {corte.total} peças deste evento (+{corte.ocultas})
            </Botao>
          </td>
        </tr>
      )}
    </Fragment>
  );
}
