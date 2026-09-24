// As células da peça na fila da Arte — as mesmas na linha da tabela e no
// cartão do celular: ação primária, menu "⋯", prazo, selos, anexos e medidas.
import { Fragment } from "react";
import { AlertTriangle, Eye, FastForward, FileText, FileUp, ImageUp, MoreHorizontal, Paperclip, Printer, RotateCcw } from "lucide-react";
import { regraDaTrocaDeArquivoFinal, regraDaTrocaDeThumb } from "@shared/troca-de-material";
import { StatusBadge } from "@/components/status-badge";
import { SeloKit } from "@/components/kit/selo-kit";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Botao } from "@/components/ui/botao";
import { Selo } from "@/components/ui/selo";
import { PrazoInline } from "@/components/prazo-inline";
import { alvo } from "@/hooks/use-mobile";
import { diasNaFase, tomDaIdade } from "@/lib/idade-na-fase";
import { P } from "@/lib/status";
import { T, TOM, N, R, FS } from "@/lib/theme";
import { DISPENSAVEIS_STATUSES, formatQuantity, phaseDeadline } from "@/lib/arte-rules";
import { naoDevolvivel } from "@shared/fluxo-peca";
import { ehMolde, statusDeExibicao } from "@shared/molde";
import { prazoDoMolde } from "@shared/prazo-molde";
import { hrefSeguro } from "@shared/url-segura";
import { fsToque, menuItemStyle } from "./constantes";
import type { AcoesDaLinha, PecaDaArte } from "./tipos";

/**
 * Ação primária da linha, por fase. `null` quando a fase não tem ação (ou
 * quando o papel está em modo consulta).
 */
export const acaoPrimaria = (item: PecaDaArte, tabId: string, podeEditar: boolean) => {
  if (!podeEditar) return null;
  if (tabId !== "criar-aprovacoes" && tabId !== "finalizar-layouts") return null;
  // Molde não é "sem aprovação → finalização": ele envia direto para a Revisão Final.
  const isSkip = tabId === "criar-aprovacoes" && item.skipApproval && !ehMolde(item);
  return {
    // TINTA, uma cor só.
    //
    // Eram três, por aba: azul em Finalizar, roxo em Enviar direto, laranja
    // em Enviar. A cor não distinguia uma LINHA da outra — dentro de uma aba
    // todas as linhas tinham a mesma —, então ela não carregava informação
    // nenhuma; o que ela fazia era gastar três cores de destaque em botões
    // que se repetem em toda linha da tabela. O laranja é a cor de ATENÇÃO
    // desta tela (o prazo, o selo, a aba ativa) e usá-lo assim anulava o
    // sinal. Qual é a ação continua escrito no rótulo, que é onde se lê.
    bg: T.text,
    // Rótulos curtos, porque a fase já está escrita na aba ativa logo acima.
    // "Enviar aprovação" pedia ~176px numa coluna de 170: com o flexWrap da
    // célula, o botão QUEBRAVA para a linha de cima do menu "⋯" e a linha da
    // tabela crescia ~40px por causa disso. O que a etiqueta perdeu está no
    // `title` de cada botão, que já existia.
    //
    // RODADA 4 — o MESMO rótulo "Enviar" fazia duas coisas: com rascunho
    // salvo, enviava na hora; sem thumb, só abria o modal. Quem clicava
    // numa peça sem thumb achava que tinha enviado. Sem thumb o botão diz o
    // passo que falta ("Subir thumb"); "Enviar" fica só para o clique que
    // envia de fato.
    label: tabId === "finalizar-layouts" ? "Finalizar"
      : isSkip ? "Enviar direto"
      : item.approvalThumbUrl ? "Enviar" : "Subir thumb",
    // Um clique para enviar: se a peça já tem thumb salvo (rascunho), o botão
    // dispara o envio direto, sem abrir o modal e SEM confirmação — a ação é
    // reversível pela aba Correção e o toast dá o feedback; window.confirm só
    // acrescentaria atrito. O olho no menu "⋯" continua abrindo os detalhes.
    canSendDirect: tabId === "criar-aprovacoes" && !isSkip && !!item.approvalThumbUrl,
    isSkip,
  };
};

/** Menu "⋯": ver detalhes, exportar prova e dispensar. */
export function MenuDeAcoes({ item, podeEditar, dedo, acoes }: {
  item: PecaDaArte;
  podeEditar: boolean;
  dedo: boolean;
  acoes: AcoesDaLinha;
}) {
  const podeDispensar = podeEditar && DISPENSAVEIS_STATUSES.includes(item.status) && !ehMolde(item);
  const podeDevolver = podeEditar && !naoDevolvivel(item.status);
  // TROCAR DEPOIS DE ENVIADO (dono, 24/09): a peça que já saiu da mesa da
  // Arte — com o Atendimento, na Finalização, nos Finalizados — não tinha
  // nenhum caminho visível para "trocar o thumb" ou "trocar o arquivo final"
  // na LINHA; a troca morava escondida no fim da ficha. Os dois entram no "⋯"
  // quando a REGRA deixa (shared/troca-de-material — a mesma do servidor) e
  // abrem a ficha, onde a troca mora (motivo, aviso e envio). Em "Aguardando
  // envio" o gesto é o envio, não a troca.
  const trocaDoThumb = podeEditar && item.status !== "awaiting_submission" ? regraDaTrocaDeThumb(item) : null;
  const trocaDoFinal = podeEditar && item.finalFileUrl ? regraDaTrocaDeArquivoFinal(item) : null;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          onClick={e => e.stopPropagation()}
          aria-label={`Mais ações para ${item.displayId}`}
          data-testid={`button-row-menu-${item.id}`}
          style={{ width: alvo(36, dedo), minWidth: alvo(36, dedo), height: alvo(36, dedo), flexShrink: 0, borderRadius: R.md, display: 'flex', alignItems: 'center', justifyContent: 'center', background: T.surface, border: `1px solid ${T.border}`, cursor: 'pointer', color: T.apoio }}
        >
          <MoreHorizontal style={{ width: 15, height: 15 }} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="p-1" style={{ width: 224 }} onClick={e => e.stopPropagation()}>
        <button
          onClick={() => acoes.verDetalhes(item)}
          data-testid={`button-view-${item.id}`}
          style={menuItemStyle(T.strong, dedo)}
          onMouseEnter={e => { e.currentTarget.style.background = N.n2; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
        >
          <Eye style={{ width: 14, height: 14, flexShrink: 0 }} /> Ver detalhes
        </button>
        <button
          onClick={() => acoes.exportarProva(item)}
          data-testid={`button-export-item-pdf-${item.id}`}
          style={menuItemStyle(T.strong, dedo)}
          onMouseEnter={e => { e.currentTarget.style.background = N.n2; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
        >
          <Printer style={{ width: 14, height: 14, flexShrink: 0 }} /> Exportar prova em PDF
        </button>
        {trocaDoThumb?.pode && (
          <button
            onClick={() => acoes.verDetalhes(item)}
            data-testid={`button-trocar-thumb-${item.id}`}
            title={trocaDoThumb.exigeMotivo ? "Abre a peça para trocar o thumb — pede o motivo da troca" : "Abre a peça para trocar o thumb"}
            style={menuItemStyle(T.strong, dedo)}
            onMouseEnter={e => { e.currentTarget.style.background = N.n2; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
          >
            <ImageUp style={{ width: 14, height: 14, flexShrink: 0 }} /> Trocar thumb
          </button>
        )}
        {trocaDoFinal?.pode && (
          <button
            onClick={() => acoes.verDetalhes(item)}
            data-testid={`button-trocar-final-${item.id}`}
            title={trocaDoFinal.voltaParaRevisao ? "Abre a peça para trocar o arquivo final — a troca devolve a peça para a Revisão Final" : "Abre a peça para trocar o arquivo final"}
            style={menuItemStyle(T.strong, dedo)}
            onMouseEnter={e => { e.currentTarget.style.background = N.n2; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
          >
            <FileUp style={{ width: 14, height: 14, flexShrink: 0 }} /> Trocar arquivo final
          </button>
        )}
        {podeDispensar && (
          <>
            <div style={{ height: 1, background: N.n3, margin: '4px 0' }} />
            {/* Sai da fileira e vem para cá, marcada: a ação leva a peça
                direto para produção, pulando patrocinador E revisão final.
                O NOME (dono, 09/09): era "Dispensar peça", com o ícone de
                proibido — e "dispensar" leu-se como "a peça não vai
                existir", que é o oposto do que acontece: ela vai ser
                impressa, e antes de todo mundo. O ícone virou avanço, não
                bloqueio.
                O RÓTULO é escolha do dono, reafirmada em 09/09: "Direto
                para finalização". Fica registrado o que a ação FAZ, para
                quem vier depois não se perder: desde 09/09 o servidor
                grava DESTINO_DA_DISPENSA (routes/items.ts) — a peça PARA
                na finalização da Arte, sobe o arquivo final e a Revisão
                ainda confere; o que se pula é só a aprovação do
                Atendimento. (Até 09/09 era `ready_for_production`, direto
                para a Gráfica — este comentário dizia isso e ficou velho.)
                O corpo do diálogo diz o efeito real, que é onde o engano
                custaria caro.
                AZUL, e não o âmbar de "Devolver ao solicitante" (dono,
                09/09: os dois estavam com a mesma cor): avançar e voltar
                atrás não podem parecer a mesma coisa.
                A rota segue /dispense — nome interno não muda. */}
            <button
              onClick={() => acoes.dispensar(item)}
              data-testid={`button-dispense-${item.id}`}
              style={menuItemStyle(P.blue.text, dedo)}
              onMouseEnter={e => { e.currentTarget.style.background = P.blue.bg; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
            >
              <FastForward style={{ width: 14, height: 14, flexShrink: 0 }} /> Direto para finalização
            </button>
          </>
        )}
        {podeDevolver && (
          <>
            {!podeDispensar && <div style={{ height: 1, background: N.n3, margin: '4px 0' }} />}
            {/* Vizinha de "dispensar" e o oposto dela: dispensar empurra a
                peça para produção, devolver a manda para o começo. As duas
                tiram a peça da fila da Arte, e por isso moram juntas. */}
            <button
              onClick={() => acoes.devolver(item)}
              data-testid={`button-devolver-${item.id}`}
              style={menuItemStyle(TOM.alerta.text, dedo)}
              onMouseEnter={e => { e.currentTarget.style.background = TOM.alerta.bg; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
            >
              <RotateCcw style={{ width: 14, height: 14, flexShrink: 0 }} /> Devolver ao solicitante
            </button>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** Botão primário da linha, com trava e spinner APENAS na peça em curso. */
export function BotaoPrimario({ item, tabId, largura, podeEditar, dedo, enviando, algumEnviando, acoes }: {
  item: PecaDaArte;
  tabId: string;
  largura?: string;
  podeEditar: boolean;
  dedo: boolean;
  /** Esta peça é a do envio em curso. */
  enviando: boolean;
  /** Há um envio direto em curso (de qualquer peça). */
  algumEnviando: boolean;
  acoes: AcoesDaLinha;
}) {
  const acao = acaoPrimaria(item, tabId, podeEditar);
  if (!acao) return null;
  // O estado da mutação é único e compartilhado: enquanto um envio corria,
  // TODAS as linhas com envio direto ficavam travadas. E o objeto de estilo
  // era fixo — mesma cor, mesmo cursor, sem opacidade e sem spinner, com o
  // estilo inline vencendo o `:disabled` nativo.
  const travado = enviando || (acao.canSendDirect && algumEnviando);
  return (
    <Botao
      variante="primario"
      tamanho={dedo ? "toque" : "sm"}
      carregando={enviando}
      onClick={e => {
        e.stopPropagation();
        if (acao.canSendDirect) {
          acoes.enviarDireto(item);
          return;
        }
        acoes.verDetalhes(item);
      }}
      disabled={travado}
      data-testid={`button-action-${item.id}`}
      title={acao.isSkip
        ? "Sem aprovação de patrocinador — abre a peça para enviar direto à finalização (arquivo final)"
        : acao.canSendDirect
          ? (ehMolde(item) ? "Molde: envia AGORA o thumb salvo direto para a Revisão Final, sem abrir a peça" : "Envia AGORA o thumb salvo para a aprovação do patrocinador, sem abrir a peça")
          : tabId === "finalizar-layouts"
            ? "Abre a peça para colar o caminho do arquivo final"
            : "Abre a peça para subir o thumb de aprovação"}
      // minWidth 0 + flexShrink: numa coluna estreita o botão encolhe com
      // reticências em vez de empurrar o menu "⋯" para outra linha. A mesma
      // altura do "⋯" ao lado (36 no mouse, 44 no dedo).
      style={{ width: largura, minWidth: 0, flexShrink: 1, minHeight: alvo(36, dedo), overflow: 'hidden', textOverflow: 'ellipsis' }}
    >
      {enviando ? "Enviando…" : acao.label}
    </Botao>
  );
}

/**
 * Célula de prazo — o marco da FASE (`phaseDeadline`), em uma linha de texto.
 *
 * PORQUÊ NÃO É MAIS UM SELO PREENCHIDO. Era uma caixa de fundo sólido com duas
 * linhas dentro, e numa fila de 30 peças atrasadas isso são 30 retângulos
 * vermelhos: o prazo, que é dado de APOIO para escolher a ordem do trabalho,
 * pesava mais que o botão de ação primária da mesma linha. O desenho, a régua
 * de cor e os contrastes moram em components/prazo-inline — a caixa some, a
 * cor passa a ocupar só a área das letras e a magnitude do atraso vira peso
 * tipográfico, que é a única coisa que muda de linha para linha.
 *
 * A REGRA DE DATA NÃO MUDOU: continua `phaseDeadline` (lib/arte-rules), a
 * mesma da faixa de diagnóstico, do filtro "Prazo: atrasados" e da Gestão de
 * Prazos, com o marco da Finalização (−10) e o ajuste de fim de semana.
 */
/** `emLinha`: prazo e idade na MESMA linha (cartão do celular — uma linha a menos por peça). */
export function PrazoDaPeca({ item, tabId, hoje, dedo = false, emLinha = false }: { item: PecaDaArte; tabId: string; hoje: Date; dedo?: boolean; emLinha?: boolean }) {
  // PRAZO DO MOLDE (22/09): no molde de evento com prazo do molde, é ele
  // que a coluna mostra; sem ele (ou peça comum), o marco da fase de sempre.
  const p = prazoDoMolde(item, item.event, hoje) ?? phaseDeadline(item.event, tabId, hoje);
  // A IDADE NA FASE, abaixo da data. O prazo diz o marco (futuro); isto diz
  // há quanto tempo a peça está parada onde está — numa fila que espera
  // terceiros, é a pergunta. Sem `statusChangedAt`, sem idade (ver
  // diasNaFase). Mesma família tipográfica do prazo: texto, não selo.
  const dias = diasNaFase(item, hoje);
  const tom = dias !== null ? tomDaIdade(dias) : null;
  return (
    <div style={emLinha ? { display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 10, rowGap: 1 } : { display: 'flex', flexDirection: 'column', gap: 1 }}>
      <PrazoInline
        diff={p?.diff ?? null}
        date={p?.date ?? null}
        label={p?.label}
        testId={`cell-prazo-${item.id}`}
        fonte={fsToque(11, dedo)}
      />
      {dias !== null && tom && (
        <span
          data-testid={`cell-idade-${item.id}`}
          title={`Há ${dias} ${dias === 1 ? 'dia' : 'dias'} nesta fase (desde ${new Date(item.statusChangedAt ?? item.status_changed_at ?? "").toLocaleDateString('pt-BR')})`}
          style={{ fontFamily: "'DM Mono', monospace", fontSize: fsToque(11, dedo), fontWeight: tom.peso, color: tom.cor, whiteSpace: 'nowrap' }}
        >
          {/* "há 0d na fase" não dizia nada a quem lê: a peça do dia diz que
              chegou hoje. */}
          {dias === 0 ? 'entrou hoje na fase' : <>há {dias}d na fase</>}
        </span>
      )}
    </div>
  );
}

/**
 * Anexos da peça (referência, book, fora do book) — em TEXTO, não em selo.
 *
 * MENOS É MAIS (dono, 22/09: "a tela está bem poluída"). Eram três caixinhas
 * coloridas (azul, roxo, âmbar) ao lado do nome, somadas aos selos do ID: a
 * linha chegava a cinco cores ao mesmo tempo e o olho não achava o botão.
 * Viraram links discretos na linha secundária; só "Fora do book" guarda uma
 * cor, porque é o único que pede ação.
 */
export function TagsDaPeca({ item, eventoTemBook, dedo = false }: {
  item: PecaDaArte;
  /** O evento da peça já tem book publicado (ver `eventosComBook`). */
  eventoTemBook: boolean;
  /** Toque: nada abaixo de 12px. */
  dedo?: boolean;
}) {
  const link: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: fsToque(11.5, dedo), fontWeight: 600, color: T.strong, textDecoration: 'underline', textDecorationColor: T.bdark, textUnderlineOffset: 2 };
  const tem = item.referenceUrl || item.bookUrl || eventoTemBook;
  if (!tem) return null;
  return (
    <span style={{ display: 'inline-flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
      {item.referenceUrl && (
        <a href={hrefSeguro(item.referenceUrl)} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} title="Ver referência visual do solicitante" style={link} data-testid={`link-reference-arte-${item.id}`}>
          <Paperclip aria-hidden="true" style={{ width: 10, height: 10 }} />
          Ref. visual
        </a>
      )}
      {item.bookUrl ? (
        <a href={hrefSeguro(item.bookUrl)} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} title="Abrir book de aprovação (PDF) para enviar ao patrocinador" style={link} data-testid={`link-book-arte-${item.id}`}>
          <FileText aria-hidden="true" style={{ width: 10, height: 10 }} />
          Book
        </a>
      ) : eventoTemBook && !ehMolde(item) && (
        // Molde não vai para o book (não passa por aprovação de patrocinador):
        // "Fora do book" nele seria um alarme sem ação possível.
        // Salvar o book limpa o bookUrl de TODAS as peças do evento e regrava só
        // as marcadas — é fácil deixar peça de fora sem perceber. #92400e sobre
        // branco = 7,1:1 ✓.
        <span title="O evento já tem book publicado, mas esta peça ficou de fora dele" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: fsToque(11.5, dedo), fontWeight: 700, color: TOM.alerta.text }} data-testid={`tag-fora-do-book-${item.id}`}>
          <AlertTriangle aria-hidden="true" style={{ width: 10, height: 10 }} />
          Fora do book
        </span>
      )}
    </span>
  );
}

/**
 * OS SELOS DA PEÇA — um componente só, para a linha e para o card.
 *
 * REGRA (dono, 22/09): no máximo UM selo colorido de estado por linha. Eram
 * até cinco lado a lado (KIT, status, Reprovada, Rascunho, PRIORITÁRIA) e
 * nenhum se destacava. Agora os estados entram numa lista em ORDEM DE
 * GRAVIDADE; o primeiro veste cor, os demais viram texto cinza na mesma
 * linha — a informação continua, o grito não.
 *   · Reprovada — voltou do patrocinador, é retrabalho;
 *   · PRIORITÁRIA — a Solicitação pediu para sair na frente (dono, 27/08);
 *   · Rascunho — thumb salvo, ainda não enviado.
 * O selo KIT fica sempre (dono, 14/09: "em todas as etapas tem que ser
 * sinalizado que a peça é do Kit") e é neutro em peso. Em Finalizados o
 * selo de status É o estado da linha.
 *
 * SELO NOVO entra NA LISTA `estados`, na posição da gravidade dele — não
 * como mais um <span> solto na célula.
 */
export function SelosDaPeca({ item, tabId, dedo = false }: { item: PecaDaArte; tabId: string; dedo?: boolean }) {
  type Estado = { chave: string; rotulo: string; titulo: string; testId: string; cor: { bg: string; borda: string; texto: string } };
  const estados = ([
    tabId === "criar-aprovacoes" && item.rejectedBySponsor && {
      chave: 'reprovada', rotulo: 'Reprovada', testId: `badge-rejected-sponsor-${item.id}`,
      titulo: 'Reprovada pelo patrocinador — voltou para a Arte refazer',
      cor: { bg: TOM.perigo.bg, borda: TOM.perigo.border, texto: TOM.perigo.text },
    },
    item.isPriority && {
      chave: 'prioritaria', rotulo: 'PRIORITÁRIA', testId: `tag-prioritaria-${item.id}`,
      titulo: 'Peça prioritária — marcada pela Solicitação para sair na frente',
      cor: { bg: P.pink.bg, borda: P.pink.border, texto: P.pink.text },
    },
    tabId === "criar-aprovacoes" && item.approvalThumbUrl && !item.rejectedBySponsor && {
      chave: 'rascunho', rotulo: 'Rascunho', testId: `badge-thumb-draft-${item.id}`,
      titulo: 'Thumb salvo como rascunho, ainda não enviado para aprovação',
      cor: { bg: TOM.roxo.bg, borda: TOM.roxo.border, texto: TOM.roxo.text },
    },
  ].filter(Boolean) as Estado[]);
  return (
    <>
      {tabId === "finalizados" && <StatusBadge status={statusDeExibicao(item)} className={dedo ? "!text-[12px]" : undefined} />}
      <SeloKit peca={item} style={dedo ? { fontSize: 12 } : undefined} />
      {estados.map((e, i) => i === 0 && tabId !== "finalizados" ? (
        <Selo key={e.chave} title={e.titulo} data-testid={e.testId} forma="retangulo"
          cores={{ bg: e.cor.bg, text: e.cor.texto, border: e.cor.borda }}
          style={dedo ? { padding: '1px 6px', fontSize: 12 } : { padding: '1px 6px' }}>
          {e.rotulo}
        </Selo>
      ) : (
        // #57534e sobre branco = 7,0:1 ✓ — texto, não selo.
        <span key={e.chave} title={e.titulo} data-testid={e.testId}
          style={{ fontSize: fsToque(FS.small, dedo), fontWeight: 600, color: T.apoio, whiteSpace: 'nowrap' }}>
          {e.rotulo}
        </span>
      ))}
    </>
  );
}

/**
 * MEDIDA, ÁREA E MATERIAL numa linha de texto secundário, dentro da coluna
 * "Peça". Eram três colunas próprias (Dimensões, M², Material — 356px da
 * tabela) para dados que a Arte consulta, mas não usa para decidir o gesto
 * da linha (subir thumb, enviar arquivo final, reenviar correção — medido na
 * trilha de 30 dias, 22/09). Ficam à vista, menores; o detalhe completo mora
 * na ficha da peça. A ordem de leitura continua a de antes: a medida, o
 * ARQ. (o que a impressora recebe), a área e o material.
 */
export function MetaDaPeca({ item, comQtd = false, dedo = false }: { item: PecaDaArte; comQtd?: boolean; dedo?: boolean }) {
  const partes: React.ReactNode[] = [];
  if (comQtd) partes.push(<span key="q">Qtd {formatQuantity(item.quantity)}</span>);
  if (item.visualWidth && item.visualHeight) {
    partes.push(<span key="v" title={`${item.visualWidth} × ${item.visualHeight}`} style={{ fontWeight: 700, color: T.strong, fontVariantNumeric: 'tabular-nums' }}>{item.visualWidth} × {item.visualHeight}</span>);
  }
  if (item.fileWidth && item.fileHeight) {
    partes.push(
      <span key="a" title={`ARQ. (com sangria): ${item.fileWidth} × ${item.fileHeight} — é o que a impressora recebe`} style={{ fontVariantNumeric: 'tabular-nums' }}>
        <span style={{ fontSize: fsToque(10, dedo), fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>arq.</span>
        {' '}{item.fileWidth} × {item.fileHeight}
      </span>,
    );
  }
  if (item.calculatedM2) partes.push(<span key="m" style={{ fontVariantNumeric: 'tabular-nums' }}>{item.calculatedM2} m²</span>);
  if (item.material) partes.push(<span key="mat" title={item.material} style={{ textTransform: 'uppercase', letterSpacing: '0.03em' }}>{item.material}</span>);
  if (item.finish) partes.push(<span key="f" title={item.finish}>{item.finish}</span>);
  if (partes.length === 0) return null;
  return (
    <span data-testid={`meta-peca-${item.id}`} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 6, rowGap: 1, fontSize: fsToque(11.5, dedo), color: T.apoio, minWidth: 0 }}>
      {partes.map((p, i) => (
        <Fragment key={i}>
          {i > 0 && <span aria-hidden="true" style={{ color: T.second }}>·</span>}
          {p}
        </Fragment>
      ))}
    </span>
  );
}
