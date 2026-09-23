// ─────────────────────────────────────────────────────────────────────────────
// UMA LINHA DE TABELA POR PEÇA — e, no celular, a MESMA linha vira cartão.
//
// Numa tela cujo trabalho é varrer dezenas de peças, a altura da linha é o
// custo de tudo: ID, tipo e descrição numa célula, Qtd · m² noutra, os chips
// de patrocinador e a ação do estado — cinco colunas, uma linha de altura.
//
// NO CELULAR A LINHA VIRA CARTÃO SEM DUPLICAR A ÁRVORE. Cinco colunas não
// cabem em 390px, e o caminho fácil seria uma segunda árvore de JSX para o
// celular — exatamente como as ações divergem: não por decisão, mas porque
// ninguém copia o botão novo para o outro lado. `display: grid` na <tr> e
// `display: block` nas <td> empilham as mesmas células.
//
// `chips` é o escopo do agrupamento: todos os patrocinadores do evento, ou só
// aquele por quem se agrupou.
// ─────────────────────────────────────────────────────────────────────────────
import { memo } from "react";
import type { CSSProperties } from "react";
import { AlertTriangle, CheckCircle2, EyeOff, Info, Lock, Paperclip, Recycle, Save, Send } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Botao } from "@/components/ui/botao";
import { Selo } from "@/components/ui/selo";
import { alvo } from "@/hooks/use-mobile";
import { TOM, T, N, R, FS, FW, FONT, darkenToContrast } from "@/lib/theme";
import { UI_STATUS_LABEL, UI_STATUS_SIGNIFICADO } from "./constantes";
import { hexToRgba, safeRefUrl } from "./regras";
import type { ItemChanges, PatrocinadorDaVinculacao, PecaDaVinculacao, UIStatus } from "./tipos";

/**
 * As ações da linha. Ficam FORA da comparação do memo (ver `mesmaLinha`): a
 * linha que não redesenhou guarda as do último render em que desenhou. É
 * seguro porque todas só leem as entradas DESTA peça — que estão nas props
 * comparadas — e gravam com setState funcional. Quem acrescentar uma ação que
 * leia outro estado da tela precisa pôr esse estado nas props.
 */
export type AcoesDaLinha = {
  setSelectedItemForDetails: (item: PecaDaVinculacao) => void;
  setPreviewRefUrl: (url: string | null) => void;
  toggleItemSelection: (itemId: string) => void;
  toggleItemSkipApproval: (item: PecaDaVinculacao) => void;
  aplicarVinculo: (item: PecaDaVinculacao, novos: string[], skip: boolean) => void;
  descartarRascunho: (item: PecaDaVinculacao) => void;
  salvarLinha: (item: PecaDaVinculacao) => void;
  openSendModalForItem: (item: PecaDaVinculacao) => void;
};

export type PropsDaLinha = {
  item: PecaDaVinculacao;
  chips: PatrocinadorDaVinculacao[];
  eventSponsors: PatrocinadorDaVinculacao[];
  /** As entradas DESTA peça nos três mapas — não os mapas, senão toda linha redesenharia a cada clique. */
  vinculosDaPeca: string[] | undefined;
  rascunho: ItemChanges | undefined;
  originais: string[] | undefined;
  falha: string | undefined;
  estado: UIStatus;
  selecionada: boolean;
  editavel: boolean;
  podeAcrescentar: boolean;
  /** Esta linha está gravando AGORA — o "Salvar" dela diz "Salvando…". */
  salvandoEsta: boolean;
  /** Algum salvamento em curso: as outras linhas só travam. */
  salvando: boolean;
  enviando: boolean;
  emCartoes: boolean;
  dedo: boolean;
  acoes: AcoesDaLinha;
};

function LinhaDaPecaSemMemo(props: PropsDaLinha) {
  const {
    item, chips, eventSponsors, vinculosDaPeca, rascunho, falha, estado, selecionada, editavel,
    podeAcrescentar, salvandoEsta, salvando, enviando, emCartoes, dedo, acoes,
  } = props;
  const {
    setSelectedItemForDetails, setPreviewRefUrl, toggleItemSelection, toggleItemSkipApproval,
    aplicarVinculo, descartarRascunho, salvarLinha, openSendModalForItem,
  } = acoes;
  const vinculados = vinculosDaPeca || [];
  const semPatrocinador = rascunho?.skipApproval ?? (item.skipApproval || false);
  // Peça JÁ ENVIADA é selecionável — não para reescrever o vínculo (isso
  // continua travado), mas para ACRESCENTAR um patrocinador que apareceu
  // depois do envio. A barra de lote separa as duas coisas e diz em quantas
  // peças cada uma age. E só para quem tem a ação: marcar peça enviada sem
  // poder acrescentar seria uma caixa que não leva a botão nenhum.
  const podeSelecionar = estado === 'PENDENTE' || estado === 'RASCUNHO' || (estado === 'ENVIADO' && podeAcrescentar);

  // Alvo dos controles dentro da linha. 44 no toque (dedo, em qualquer
  // largura); no mouse a linha é densa de propósito. O alvo real é a LINHA
  // INTEIRA, que abre a peça no clique; estes controles são o refinamento.
  const tamanhoNaLinha = dedo ? "toque" as const : "sm" as const;

  // A COR DE ESTADO VAI NA BORDA, não no fundo. O fundo colorido da linha
  // inteira competia com os chips, que também são coloridos — e chip de
  // marca sobre fundo tingido perde justamente a cor que o identifica.
  const corDaBorda = selecionada ? T.accentText : estado === 'RASCUNHO' ? T.accent : 'transparent';

  // No cartão do celular, cada célula vira bloco (ver o topo do arquivo).
  const celula: CSSProperties = emCartoes ? { display: 'block', width: '100%' } : {};

  return (
    <tr
      data-testid={`item-row-${item.id}`}
      onClick={() => setSelectedItemForDetails(item)}
      style={{
        ...(emCartoes ? {
          display: 'grid', gridTemplateColumns: '46px 1fr',
          border: `1px solid ${selecionada ? TOM.laranja.border : T.border}`,
          borderLeft: `3px solid ${corDaBorda === 'transparent' ? T.border : corDaBorda}`,
          borderRadius: 12, marginBottom: 10, padding: '10px 12px 10px 0',
        } : { borderBottom: `1px solid ${N.n3}` }),
        backgroundColor: selecionada ? TOM.laranja.bg : T.surface,
        // 0.55 + grayscale derrubava a linha inteira abaixo de AA, e o hover
        // (que restaurava) não existe no teclado.
        opacity: estado === 'ENVIADO' ? 0.8 : 1,
        cursor: 'pointer',
        transition: 'background-color 0.12s',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = selecionada ? TOM.laranja.bg : T.bg; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = selecionada ? TOM.laranja.bg : T.surface; }}
    >
      {/* ── Seleção ── */}
      <td onClick={e => e.stopPropagation()} style={emCartoes
        ? { display: 'flex', alignItems: 'flex-start', justifyContent: 'center', gridRow: '1 / span 4', paddingTop: 2 }
        : { width: 46, textAlign: 'center', padding: '8px 0', borderLeft: `3px solid ${corDaBorda}` }}>
        <Checkbox
          checked={selecionada}
          onCheckedChange={() => podeSelecionar && toggleItemSelection(item.id)}
          disabled={!podeSelecionar}
          title={estado === 'PRONTO' ? 'Peça pronta para envio — ajuste os patrocinadores direto nos chips da linha' : estado === 'ENVIADO' ? 'Peça já enviada à Arte' : undefined}
          aria-label={`Selecionar ${item.displayId}`}
          data-testid={`checkbox-item-${item.id}`}
        />
      </td>

      {/* ── Peça ── */}
      <td style={emCartoes ? { ...celula, paddingBottom: 6 } : { padding: '8px 12px', minWidth: 200 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          {/* A linha inteira abre o detalhe no clique, mas <tr> não recebe
              foco: por teclado não havia como abrir peça nenhuma. O ID vira o
              alvo focável — é o rótulo natural da linha. */}
          <button
            type="button"
            onClick={e => { e.stopPropagation(); setSelectedItemForDetails(item); }}
            aria-label={`Ver detalhes da peça ${item.displayId}`}
            data-testid={`text-display-id-${item.id}`}
            style={{ fontFamily: FONT.mono, fontSize: FS.small, fontWeight: FW.forte, color: T.second, background: 'none', border: 'none', padding: 0, cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap' }}
          >
            {item.displayId}
          </button>
          <span style={{ fontSize: FS.body, fontWeight: FW.forte, color: T.text, whiteSpace: 'nowrap', flexShrink: 0 }}>{item.type}</span>
          {item.description && (
            // flexShrink alto: quando falta largura, é a descrição que cede.
            // Em DUAS linhas, e não reticência com o resto no `title`: no
            // toque não há hover, e a descrição é o que distingue duas
            // peças do mesmo tipo.
            <span title={item.description} style={{ fontSize: FS.meta, lineHeight: 1.35, color: T.apoio, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', flexShrink: 999, minWidth: 0 }}>
              {item.description}
            </span>
          )}
          {/* MARCADORES COMO ÍCONE. Eram pílulas com texto ("Ref. visual"),
              do mesmo tamanho da descrição e disputando com ela a leitura —
              sendo que o que elas dizem é binário: tem ou não tem. */}
          {safeRefUrl(item.referenceUrl) && (
            <button
              type="button"
              onClick={e => { e.stopPropagation(); setPreviewRefUrl(safeRefUrl(item.referenceUrl)); }}
              title="Ver a referência visual do solicitante"
              aria-label={`Ver a referência visual de ${item.displayId}`}
              data-testid={`link-reference-vincular-${item.id}`}
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: alvo(22, dedo), height: alvo(22, dedo), borderRadius: R.sm, border: 'none', background: 'none', color: TOM.info.text, cursor: 'pointer', flexShrink: 0, padding: 0 }}
            >
              <Paperclip style={{ width: 13, height: 13 }} />
            </button>
          )}
          {item.isReuse && (
            <span title="Reaproveitamento" aria-label="Reaproveitamento" style={{ display: 'inline-flex', color: TOM.esmeralda.text, flexShrink: 0 }}>
              <Recycle aria-hidden="true" style={{ width: 13, height: 13 }} />
            </span>
          )}
        </div>
        {falha && (
          <div role="alert" data-testid={`falha-linha-${item.id}`} style={{ display: 'flex', alignItems: 'flex-start', gap: 5, marginTop: 4, fontSize: FS.meta, lineHeight: 1.4, color: TOM.perigo.text }}>
            <AlertTriangle aria-hidden="true" style={{ width: 12, height: 12, flexShrink: 0, marginTop: 2 }} />
            <span>{falha}</span>
          </div>
        )}
      </td>

      {/* ── Qtd · m² ──
          Eram dois valores empilhados em 11px, o segundo com letterSpacing
          negativo. Numa célula só e em DM Mono, os números de linhas
          vizinhas se alinham e dá para comparar de relance. */}
      <td style={emCartoes ? { ...celula, paddingBottom: 8 } : { padding: '8px 12px', whiteSpace: 'nowrap' }}>
        <span style={{ fontFamily: FONT.mono, fontSize: FS.meta, color: T.apoio }}>
          {item.quantity ?? 0} un
          {item.calculatedM2 != null && !isNaN(parseFloat(item.calculatedM2))
            ? ` · ${parseFloat(item.calculatedM2).toFixed(2)} m²`
            : ''}
        </span>
      </td>

      {/* ── Patrocinadores / Vínculo ── */}
      <td onClick={e => e.stopPropagation()} style={emCartoes ? { ...celula, paddingBottom: 10 } : { padding: '8px 12px', minWidth: 0 }}>
        {/* A marca "sem patrocinador" (skipApproval) NUNCA esconde vínculo
            existente (caso Mandala, 27/08): peça isenta COM patrocinador é
            estado impossível que o Acrescentar normaliza no servidor — mas
            enquanto o dado velho existir, mentir "Sem patrocinador" por cima
            do Ministério vinculado é pior que mostrar os dois. */}
        {semPatrocinador && vinculados.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Selo tom="alerta" icone={EyeOff}>Sem patrocinador</Selo>
            {editavel && (
              <Botao
                variante="secundario"
                tamanho={tamanhoNaLinha}
                onClick={() => toggleItemSkipApproval(item)}
                data-testid={`btn-undo-skip-${item.id}`}
              >
                Desfazer
              </Botao>
            )}
          </div>
        ) : eventSponsors.length === 0 ? (
          <span style={{ fontSize: FS.meta, color: T.apoio, fontStyle: 'italic' }}>Sem patrocinadores no evento</span>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center' }}>
            {/* ENVIADA SEM NENHUMA MARCA.

                Sem esta linha a celula fica VAZIA — e vazio se le como
                "ainda nao mexeram nisso", quando o que houve foi o oposto: a
                peca ja saiu, e saiu sem patrocinador nenhum. E cobranca que
                nao vai acontecer, e o unico lugar onde isso aparece. */}
            {estado === 'ENVIADO' && vinculados.length === 0 && (
              <Selo
                tom="alerta"
                data-testid={`sem-vinculo-enviada-${item.id}`}
                title="Esta peça foi enviada à Arte sem nenhum patrocinador vinculado — não vai passar por aprovação."
              >
                Enviada sem patrocinador
              </Selo>
            )}
            {/* TODOS — o atalho do caso comum. */}
            {chips.length > 1 && editavel && estado !== 'ENVIADO' && (() => {
              const idsDoEscopo = chips.map((sp) => sp.id);
              const todosMarcados = idsDoEscopo.every((id: string) => vinculados.includes(id));
              return (
                <button
                  type="button"
                  onClick={() => aplicarVinculo(
                    item,
                    todosMarcados
                      ? vinculados.filter((id: string) => !idsDoEscopo.includes(id))
                      : Array.from(new Set([...vinculados, ...idsDoEscopo])),
                    false,
                  )}
                  aria-pressed={todosMarcados}
                  title={todosMarcados ? 'Desvincular todos deste escopo' : 'Vincular todos os patrocinadores do evento'}
                  data-testid={`btn-select-all-${item.id}`}
                  style={{
                    // MESMA CASCA dos chips de marca ao lado: 26px, raio
                    // 999, ponto de 7px, fundo branco quando desligado. O
                    // que o distingue é o peso do rótulo e o ponto neutro —
                    // ele não é uma marca, é o atalho para todas elas.
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    height: alvo(26, dedo), padding: '0 10px', borderRadius: 999,
                    border: `1px solid ${todosMarcados ? T.text : T.border}`,
                    backgroundColor: todosMarcados ? T.text : T.surface,
                    color: todosMarcados ? T.surface : T.strong,
                    cursor: 'pointer', font: 'inherit', fontSize: FS.meta, fontWeight: FW.forte, whiteSpace: 'nowrap',
                  }}
                >
                  <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: todosMarcados ? T.surface : T.second, flexShrink: 0 }} />
                  Todos
                </button>
              );
            })()}
            {chips.map(sp => {
              const marcado = vinculados.includes(sp.id);
              // PEÇA ENVIADA mostra só o que ficou vinculado, em cinza e sem
              // clique: o vínculo está travado no servidor, e um chip que
              // parece clicável e não faz nada é pior que a ausência dele.
              if (estado === 'ENVIADO') {
                if (!marcado) return null;
                return (
                  <Selo
                    key={sp.id}
                    ponto
                    cores={{ bg: N.n3, text: T.apoio, border: N.n3, dot: T.muted }}
                    title="Peça já enviada — vínculo travado"
                    data-testid={`chip-sponsor-${item.id}-${sp.id}`}
                  >
                    {sp.name}
                  </Selo>
                );
              }
              const marca = sp.color || TOM.info.dot;
              // A cor da marca em texto de 12px precisa de 4,5:1 sobre o
              // fundo de 10% dela mesma. `darkenToContrast` escurece só o
              // necessário — a marca continua reconhecível, que é o que faz
              // a tabela legível de longe.
              const corDoTexto = darkenToContrast(marca, T.surface, 4.5);
              return (
                <button
                  key={sp.id}
                  type="button"
                  role="checkbox"
                  aria-checked={marcado}
                  aria-label={`${marcado ? 'Desvincular' : 'Vincular'} ${sp.name} ${marcado ? 'de' : 'a'} ${item.displayId}`}
                  title={marcado ? `Clique para desvincular ${sp.name}` : `Clique para vincular ${sp.name}`}
                  disabled={!editavel}
                  onClick={() => {
                    if (!editavel) return;
                    aplicarVinculo(item, marcado ? vinculados.filter(id => id !== sp.id) : [...vinculados, sp.id], false);
                  }}
                  onKeyDown={e => {
                    if (e.key !== 'Enter' && e.key !== ' ') return;
                    e.preventDefault();
                    if (!editavel) return;
                    aplicarVinculo(item, marcado ? vinculados.filter(id => id !== sp.id) : [...vinculados, sp.id], false);
                  }}
                  data-testid={`checkbox-sponsor-${item.id}-${sp.id}`}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    height: alvo(26, dedo), padding: '0 10px', borderRadius: 999,
                    backgroundColor: marcado ? hexToRgba(marca, 0.1) : T.surface,
                    color: marcado ? corDoTexto : T.apoio,
                    border: `1px solid ${marcado ? hexToRgba(marca, 0.45) : T.border}`,
                    cursor: editavel ? 'pointer' : 'not-allowed',
                    font: 'inherit', fontSize: FS.meta, fontWeight: FW.medio,
                    whiteSpace: 'nowrap', transition: 'background 0.12s, border-color 0.12s',
                  }}
                >
                  <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: marcado ? marca : T.bdark, flexShrink: 0 }} />
                  {sp.name}
                </button>
              );
            })}
            {/* SEM PATROCINADOR — um chip na própria linha, não um item
                escondido no "…". Era a terceira opção de um menu de três,
                e é a decisão mais comum depois de vincular: a peça que
                entra sem marca. Pedido do dono: "está difícil de fazer".
                Mesma casca dos chips ao lado (26px, raio 999), mas borda
                TRACEJADA quando desligado — não é uma marca, é a ausência
                declarada de todas. #92400e sobre #fffbeb = 6,6:1. */}
            {editavel && estado !== 'ENVIADO' && (
              <button
                type="button"
                onClick={() => toggleItemSkipApproval(item)}
                aria-pressed={semPatrocinador}
                title={semPatrocinador ? 'Desmarcar "sem patrocinador" — a peça volta a exigir vínculo' : 'Marcar sem patrocinador — a peça segue sem aprovação de marca'}
                data-testid={`btn-skip-sponsor-${item.id}`}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  height: alvo(26, dedo), padding: '0 10px', borderRadius: 999,
                  border: semPatrocinador ? `1px solid ${TOM.alerta.border}` : `1px dashed ${T.bdark}`,
                  backgroundColor: semPatrocinador ? TOM.alerta.bg : T.surface,
                  color: semPatrocinador ? TOM.alerta.text : T.apoio,
                  cursor: 'pointer', font: 'inherit', fontSize: FS.meta, fontWeight: FW.forte, whiteSpace: 'nowrap',
                }}
              >
                <EyeOff aria-hidden="true" style={{ width: 12, height: 12, flexShrink: 0 }} />
                Sem patrocinador
              </button>
            )}
          </div>
        )}
      </td>

      {/* ── Status e a ação daquele estado ── */}
      <td onClick={e => e.stopPropagation()} style={emCartoes ? celula : { padding: '8px 16px 8px 12px', whiteSpace: 'nowrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: emCartoes ? 'flex-start' : 'flex-end', gap: 6, flexWrap: 'wrap' }}>
          <Selo
            data-testid={`badge-status-${item.id}`}
            title={`${UI_STATUS_LABEL[estado] ?? estado}: ${UI_STATUS_SIGNIFICADO[estado as UIStatus] ?? ''}`}
            icone={estado === 'RASCUNHO' ? Save : estado === 'PRONTO' ? CheckCircle2 : estado === 'ENVIADO' ? Lock : Info}
            cores={estado === 'RASCUNHO' ? TOM.laranja
              : estado === 'PRONTO' ? TOM.sucesso
              : estado === 'ENVIADO' ? { bg: T.text, text: T.surface, border: T.text }
              : { bg: N.n3, text: T.strong, border: N.n3 }}
          >
            {UI_STATUS_LABEL[estado] ?? estado}
          </Selo>

          {/* A AÇÃO DO ESTADO, COM RÓTULO. Eram ícones de 13px sem texto, com
              o significado só no `title`: um disquete e um avião de papel
              lado a lado, e a diferença entre salvar e ENVIAR — que tira a
              peça da tela — ficava por conta de quem adivinhasse. */}
          {estado === 'RASCUNHO' && editavel && (
            <Botao
              variante="fantasma"
              tamanho={tamanhoNaLinha}
              onClick={() => descartarRascunho(item)}
              title="Descartar as alterações e voltar ao que está salvo"
              data-testid={`button-discard-item-${item.id}`}
            >
              Descartar
            </Botao>
          )}
          {estado === 'RASCUNHO' && editavel && (
            <Botao
              variante="secundario"
              tamanho={tamanhoNaLinha}
              icone={Save}
              onClick={() => salvarLinha(item)}
              // Só a linha que grava AGORA gira; as outras só travam.
              disabled={salvando}
              carregando={salvandoEsta}
              data-testid={`button-save-item-${item.id}`}
            >
              {salvandoEsta ? 'Salvando…' : 'Salvar'}
            </Botao>
          )}
          {estado === 'PRONTO' && editavel && (
            <Botao
              variante="secundario"
              tamanho={tamanhoNaLinha}
              icone={Send}
              onClick={() => openSendModalForItem(item)}
              disabled={enviando}
              data-testid={`button-send-item-${item.id}`}
            >
              Enviar
            </Botao>
          )}

          {/* O menu "…" desta linha SAIU. Tinha três entradas: "Sem
              patrocinador" subiu para a linha como chip; "Marcar
              reaproveitamento" continua no Detalhe do Evento e na Revisão,
              onde a decisão pertence; e "Devolver para Criação" foi retirada
              por decisão do dono — era a única tela com essa ação, e a rota
              POST /api/items/:id/return-to-creation continua no servidor
              para o dia em que ela ganhar outra casa (o Detalhe do Evento é
              a natural: quem monta a lista é quem desfaz a vinculação). */}
        </div>
      </td>
    </tr>
  );
}

const mesmaLista = (a: PatrocinadorDaVinculacao[], b: PatrocinadorDaVinculacao[]) =>
  a.length === b.length && a.every((v, i) => Object.is(v, b[i]));

/** Tudo o que a linha lê para desenhar e para agir; `acoes` fica de fora. */
const CAMPOS_COMPARADOS = [
  "item", "vinculosDaPeca", "rascunho", "originais", "falha", "estado", "selecionada", "editavel",
  "podeAcrescentar", "salvandoEsta", "salvando", "enviando", "emCartoes", "dedo",
] as const;

function mesmaLinha(antes: PropsDaLinha, depois: PropsDaLinha): boolean {
  return CAMPOS_COMPARADOS.every((k) => Object.is(antes[k], depois[k]))
    && mesmaLista(antes.chips, depois.chips)
    && mesmaLista(antes.eventSponsors, depois.eventSponsors);
}

/**
 * LINHA MEMOIZADA. Marcar UM chip re-renderizava as ~300 linhas visíveis (50
 * por grupo), cada uma com Checkbox do Radix e até oito chips: o clique
 * custava o render da tabela inteira. A linha só desenha de novo quando muda
 * algo que ELA lê — a peça, o rascunho e o salvo DESTA peça, estado, seleção,
 * travas das mutações e o escopo de chips (comparado item a item, porque a
 * lista de chips é montada de novo a cada render do grupo).
 */
export const LinhaDaPeca = memo(LinhaDaPecaSemMemo, mesmaLinha);
