// Drill-down de um evento: quais peças estão travadas, em que etapa, há
// quanto tempo e — na Aprovação — com QUEM está a bola.
//
// NENHUMA ROLAGEM HORIZONTAL AQUI. Este bloco é montado dentro do modal do
// evento, que já rola na vertical; a tabela tinha `overflow-x: auto` com
// `min-width` de 560px e, quando a coluna "Aprovação com quem" não cabia, o
// diretor precisava rolar de lado DENTRO de um bloco que rolava para baixo —
// duas rolagens aninhadas para ler uma linha, e o que ficava escondido era
// justamente o nome de quem ele precisava cobrar.
//
// O conserto tem duas metades e as duas importam:
//  1. `table-layout: fixed` com largura declarada por coluna. Em layout
//     automático quem decide a largura é o CONTEÚDO — um nome comprido bastava
//     para a tabela passar do container. Fixo, ela nunca passa de 100%; o que
//     não cabe vira reticência com `title`.
//  2. A coluna de aprovação resume ("Crystal (3d), TMC (3d) +3") em vez de
//     escrever tudo — ver `resumoAprovacoes` em tokens.ts.
//
// Abaixo de `DRILL_TABELA_MIN` a tabela vira CARTÃO: no celular cinco colunas
// não cabem por mais fixas que sejam, e perder colunas é melhor que rolar.
import { Fragment, useMemo, useState } from "react";
import { Link } from "wouter";
import { ChevronDown } from "lucide-react";
import { useElementSize, useIsMobile } from "@/hooks/use-mobile";
import { getStatusLabel, getStatusShort } from "@/lib/status";
import type { CobrancaEntry, PrazoEvent, PrazoPendingItem } from "@shared/prazos-contract";
import { CobradoControl } from "./cobrado-control";
import {
  DRILL_TABELA_MIN, DRILL_TH, dayColor, diasTexto, fmtDayMonth, pecasTexto, R,
  resumoAprovacoes, STAGE_SECTOR, STAGE_STYLE, TI,
  urlPecaNoEvento, urlSetorDaPeca, urlSetorDoEvento,
} from "./tokens";

const ROW_CAP = 15;

// Larguras das colunas de tamanho PREVISÍVEL, em px. As duas de tamanho
// imprevisível (descrição e aprovação) dividem o que sobra: a descrição leva
// 30% da tabela e a aprovação fica com o resto, que é a maior fatia — é a
// coluna que a tela existe para mostrar.
const COL_PECA = 108;
const COL_QTD = 54;
const COL_ESPERA = 128;

/** Texto visível da peça: tipo e descrição na mesma frase. */
function textoPeca(it: PrazoPendingItem): string {
  return it.description ? `${it.type} — ${it.description}` : it.type;
}

/** "Kiss FM (16d), Crystal (3d) +3" — a versão pintada do resumo. */
function Aprovacoes({ it }: { it: PrazoPendingItem }) {
  if (!it.sponsors || it.sponsors.length === 0) {
    return (
      <span style={{ color: TI.label }} title="Aprovações ainda não inicializadas para esta peça">
        —
      </span>
    );
  }
  const ap = resumoAprovacoes(it.sponsors);
  return (
    <>
      {/* O visual é resumo e cor; a lista COMPLETA é falada pelo `sr-only`
          abaixo. Marcar este trecho como decorativo evita que o leitor de tela
          anuncie "mais 3" sem dizer mais 3 o quê.

          `overflowWrap: anywhere` é o cinto de segurança da coluna: nome de
          patrocinador é texto livre, e um único token mais largo que a coluna
          (um "@RadioMetropolitanaFM" sem espaço) transbordaria a célula e
          traria a rolagem lateral de volta pela porta dos fundos. */}
      <span
        aria-hidden="true"
        title={ap.titulo}
        style={{ display: "block", lineHeight: 1.45, overflowWrap: "anywhere" }}
      >
        {ap.visiveis.map((s, i) => (
          <Fragment key={`${it.id}-${s.name}-${i}`}>
            {/* A vírgula é ponto de quebra: era exatamente a falta de um ponto
                de quebra entre dois nomes que fazia a célula inteira virar um
                bloco inquebrável e empurrar a tabela para fora do container. */}
            {i > 0 && ", "}
            {s.holder === "sponsor" ? (
              <>
                <strong style={{ color: s.days >= 7 ? TI.red : TI.title }}>{s.name}</strong>
                {/* Espaço RÍGIDO antes do parêntese: o nome pode quebrar entre
                    as próprias palavras, mas "(16d)" nunca desgruda da última
                    delas — o número solto numa linha só perde o dono. */}
                <span style={{ color: dayColor(s.days), whiteSpace: "nowrap" }}>
                  {" "}({s.days === 0 ? "hoje" : `${s.days}d`})
                </span>
              </>
            ) : (
              // `title` PRÓPRIO: sobrepõe o da célula neste trecho e é a única
              // explicação de por que a bola voltou. É a diferença entre "o
              // patrocinador está demorando" e "a Arte precisa refazer".
              <span
                style={{ color: TI.label }}
                title={`${s.name} devolveu — a Arte precisa reenviar antes de nova aprovação`}
              >
                {s.name} — com a Arte
              </span>
            )}
          </Fragment>
        ))}
        {ap.restantes > 0 && (
          <span style={{ whiteSpace: "nowrap", color: TI.secondary, fontWeight: 700 }}>
            {" "}+{ap.restantes}
          </span>
        )}
      </span>
      <span className="sr-only">{ap.titulo}</span>
    </>
  );
}

/** Uma peça travada, no formato de cartão (container estreito). */
function PecaCartao({ eventId, it, isAprovacao }: {
  eventId: string;
  it: PrazoPendingItem;
  isAprovacao: boolean;
}) {
  return (
    <li style={{
      border: `1px solid ${TI.border}`, borderRadius: R.md, backgroundColor: TI.card,
      padding: "8px 10px", listStyle: "none",
    }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
        <Link
          href={urlPecaNoEvento(eventId, it.id)}
          title={`Abrir ${it.displayId} no evento`}
          /* Alvo de 36px: era 20 de altura. Aqui há espaço no card, então
             vale o mínimo de ponteiro da casa inteiro. */
          style={{ display: "inline-flex", alignItems: "center", minHeight: 36, fontSize: 12, fontWeight: 700, color: TI.accentText, textDecoration: "none" }}
        >
          {it.displayId}
        </Link>
        <span style={{
          fontSize: 12, fontWeight: 700, whiteSpace: "nowrap",
          color: dayColor(it.waitingDays),
        }}>
          {it.waitingDays === 0 ? "sem movimento hoje" : `${it.waitingDays}d sem movimento`}
        </span>
      </div>
      <span style={{ display: "block", fontSize: 10, color: TI.label, marginTop: 1 }}>
        {getStatusLabel(it.status)} · Qtd {it.quantity}
      </span>
      {/* Sem reticência no cartão: aqui a descrição pode ocupar duas linhas,
          que é mais barato que esconder texto numa tela onde não há mouse
          para revelar o `title`. */}
      <span style={{
        display: "block", fontSize: 12, color: TI.strong, marginTop: 3,
        lineHeight: 1.45, overflowWrap: "anywhere",
      }}>
        {textoPeca(it)}
      </span>
      {isAprovacao && (
        <span style={{ display: "block", fontSize: 12, marginTop: 4 }}>
          <span style={{ color: TI.label }}>Aprovação com: </span>
          <Aprovacoes it={it} />
        </span>
      )}
    </li>
  );
}

export function EventDrilldown({ ev, cobranca, today, showCobranca = true }: {
  ev: PrazoEvent;
  cobranca?: CobrancaEntry;
  today?: string;
  /** O modal desliga: lá a cobrança tem bloco próprio no fim do scrollport. */
  showCobranca?: boolean;
}) {
  const isMobile = useIsMobile();
  // Etapas RECOLHIDAS, por chave. Nasce vazio: o padrão continua sendo ver
  // tudo — quem abre o drill quer o diagnóstico inteiro. O recolher serve
  // para o caso oposto, o evento com peça parada em quatro etapas, em que
  // achar a que interessa custava rolagem. Vive no componente e não na URL
  // de propósito: é arrumação de leitura, não recorte compartilhável.
  const [recolhidas, setRecolhidas] = useState<Set<string>>(new Set());
  const alternarEtapa = (chave: string) =>
    setRecolhidas((antes) => {
      const proximo = new Set(antes);
      if (proximo.has(chave)) proximo.delete(chave);
      else proximo.add(chave);
      return proximo;
    });
  // Mede o CONTAINER, não a janela: o mesmo drill é montado no modal, na linha
  // da tabela desktop e no card do celular, e `window.innerWidth` responde
  // "desktop" mesmo quando sobram 300px úteis. Antes da primeira medição a
  // largura é 0 — aí o palpite é a janela, para o primeiro paint não nascer
  // com o layout errado no celular.
  const { ref: caixaRef, width: larguraDrill } = useElementSize<HTMLDivElement>();
  const emCartoes = larguraDrill > 0 ? larguraDrill < DRILL_TABELA_MIN : isMobile;

  // Agrupa as peças pendentes por etapa; só etapas com peça travada NELA.
  //
  // `stageIndex` (onde a peça ESTÁ), NUNCA `marcoIndex` (que prazo a mede). O
  // contrato tem os dois desde que peça isenta de aprovação passou a ser
  // cobrada pelo marco da Aprovação mesmo estando numa etapa anterior — e a
  // tentação de "unificar" nesse campo é justamente o que quebraria este
  // bloco. Aqui o agrupamento responde DE QUEM É A BOLA: é ele que escolhe o
  // link "Resolver em {setor} →", e mandar o diretor cobrar o Atendimento por
  // uma peça que está na mesa da Arte é o erro que a tela existe para evitar.
  // O marco continua mandando onde deve: `stages[].pendingCount` conta por
  // ele, então a peça isenta aparece no grupo da etapa em que está E na linha
  // "as N peças acima também travam Aprovação de Layout" logo abaixo.
  const { groups, seguintes } = useMemo(() => {
    const byStage = new Map<number, PrazoPendingItem[]>();
    for (const it of ev.pendingItems) {
      const arr = byStage.get(it.stageIndex);
      if (arr) arr.push(it); else byStage.set(it.stageIndex, [it]);
    }
    const grupos = ev.stages
      .map((stage, i) => ({ stage, items: byStage.get(i) ?? [] }))
      .filter((g) => g.items.length > 0);

    // As etapas SEGUINTES sumiam por completo. O gate é a pendência
    // ACUMULADA: as mesmas peças que travam a Lista também travam a Revisão
    // logo adiante — só que sem peça própria a etapa não virava grupo e o
    // diretor cobrava a etapa vencida para ser surpreendido pela seguinte 48h
    // depois. Aqui elas voltam como uma linha cada, sem inflar a tabela.
    const adiante = ev.stages
      .map((stage, i) => ({ stage, i }))
      .filter(({ stage, i }) =>
        stage.state !== "done" && stage.pendingCount > 0 && (byStage.get(i)?.length ?? 0) === 0);

    return { groups: grupos, seguintes: adiante };
  }, [ev]);

  const blocoCobranca = showCobranca ? (
    // ANTES dos early returns de propósito: o evento sem nenhuma peça — o pior
    // caso do negócio — era justamente o ÚNICO em que não dava para registrar
    // cobrança. O diretor lia "Nenhuma peça cadastrada", ligava para o
    // responsável, cobrava de verdade, e não tinha onde marcar.
    <div className="gp-no-print" style={{ display: "flex", justifyContent: "flex-end" }}>
      <CobradoControl targetType="event" targetId={ev.id} cobranca={cobranca} today={today} />
    </div>
  ) : null;

  if (ev.categoria === "semPecas" || ev.totalItems === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "4px 0 8px" }}>
        {blocoCobranca}
        <p style={{ margin: 0, fontSize: 13, color: TI.secondary }}>
          Nenhuma peça cadastrada ainda —{" "}
          <Link href={`/eventos/${ev.id}`} style={{ color: TI.accentText, fontWeight: 600 }}>
            cadastre as peças no evento
          </Link>{" "}
          para o funil começar a contar.
        </p>
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "4px 0 8px" }}>
        {blocoCobranca}
        <p style={{ margin: 0, fontSize: 13, color: TI.secondary }}>
          Nenhuma peça pendente — todas entregues ou fora do funil.
        </p>
      </div>
    );
  }

  return (
    <div ref={caixaRef} style={{ display: "flex", flexDirection: "column", gap: 14, padding: "4px 0 8px" }}>
      {blocoCobranca}
      {groups.map(({ stage, items }) => {
        const sector = STAGE_SECTOR[stage.key];
        const st = STAGE_STYLE[stage.state];
        const recolhida = recolhidas.has(stage.key);
        // Pior primeiro: a lista é de cobrança, quem espera há mais tempo abre.
        const sorted = [...items].sort((a, b) => b.waitingDays - a.waitingDays);
        const shown = sorted.slice(0, ROW_CAP);
        const hidden = sorted.length - shown.length;
        // O grão do link segue o grão do grupo. Grupo com VÁRIAS peças é um
        // recorte de evento + etapa (e é isso que a URL carrega); grupo com
        // UMA peça tem nome e sobrenome, então o link abre a peça — havia
        // informação para ser específico, e antes ela era jogada fora.
        const sectorUrl = sorted.length === 1
          ? urlSetorDaPeca(stage.key, {
              eventId: ev.id,
              itemId: sorted[0].id,
              displayId: sorted[0].displayId,
              status: sorted[0].status,
              atrasada: stage.state === "overdue",
            })
          : urlSetorDoEvento(stage.key, ev.id, { atrasada: stage.state === "overdue" });
        const isAprovacao = stage.key === "aprovacao";
        return (
          <div key={stage.key}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
              {/* O gatilho cobre a seta, a bolinha, o nome e a contagem — o
                  alvo é a frase inteira, não uma setinha de 13px. O link
                  "Resolver em" fica FORA dele: botão dentro de botão não
                  existe, e aquele link leva para outra tela em vez de
                  recolher nada. */}
              <button
                type="button"
                onClick={() => alternarEtapa(stage.key)}
                aria-expanded={!recolhida}
                aria-controls={`drill-${ev.id}-${stage.key}`}
                data-testid={`toggle-etapa-${stage.key}`}
                title={recolhida ? "Mostrar as peças desta etapa" : "Recolher esta etapa"}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 8,
                  background: "none", border: "none", padding: 0, margin: 0,
                  cursor: "pointer", textAlign: "left", font: "inherit",
                  /* O DESKTOP TAMBÉM PRECISA DE ALVO.
                     Era `isMobile ? 44 : undefined` — o dedo foi atendido e o
                     ponteiro esquecido, o que deixava 18px de altura num botão
                     de 320px de largura. Alvo raso e comprido é o que faz
                     errar o clique sem entender por quê. */
                  minHeight: isMobile ? 44 : 36,
                }}
              >
                <ChevronDown
                  aria-hidden="true"
                  style={{
                    width: 13, height: 13, color: TI.secondary, flexShrink: 0,
                    transform: recolhida ? "rotate(-90deg)" : "none",
                    transition: "transform 0.15s",
                  }}
                />
                <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: R.pill, backgroundColor: st.dot, flexShrink: 0 }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: TI.title }}>
                  {stage.label}
                </span>
                <span style={{ fontSize: 12, color: stage.state === "overdue" ? TI.red : TI.secondary, fontWeight: stage.state === "overdue" ? 700 : 500 }}>
                {/* "peças" por extenso ao lado de "5d" abreviado era a mesma
                    unidade escrita de duas formas na mesma linha. */}
                {pecasTexto(items.length)}
                {ev.invalidDate
                  ? " · sem data confiável"
                  : stage.state === "overdue" ? ` · vencida há ${diasTexto(Math.abs(stage.diffDays))}`
                  : stage.state === "warning" ? (stage.diffDays === 0 ? " · vence hoje" : ` · vence em ${diasTexto(stage.diffDays)}`)
                  : ` · vence em ${fmtDayMonth(stage.deadline)}`}
                </span>
              </button>
              {/* Links de navegação recuados para peso 600 e cor secundária: a
                  cobrança é a ação primária, e antes seis caminhos disputavam
                  o mesmo laranja no mesmo peso. */}
              <Link
                href={sectorUrl}
                title={sorted.length === 1
                  ? `${sector?.sector ?? stage.label} — já no recorte da peça ${sorted[0].displayId}`
                  : `${sector?.sector ?? stage.label} — já no recorte das peças deste evento nesta etapa`}
                style={{ fontSize: 12, fontWeight: 600, color: TI.secondary, textDecoration: "none" }}
                data-testid={`link-setor-${ev.id}-${stage.key}`}
              >
                Resolver em {sector?.sector ?? stage.label} →
              </Link>
            </div>

            {/* `hidden` e não desmontar: recolher e reabrir não pode recomeçar
                a leitura do zero nem perder a rolagem de quem estava no meio. */}
            <div id={`drill-${ev.id}-${stage.key}`} hidden={recolhida}>
            {emCartoes ? (
              <ul style={{ display: "flex", flexDirection: "column", gap: 6, margin: 0, padding: 0 }}>
                {shown.map((it) => (
                  <PecaCartao key={it.id} eventId={ev.id} it={it} isAprovacao={isAprovacao} />
                ))}
              </ul>
            ) : (
              <div style={{ border: `1px solid ${TI.border}`, borderRadius: R.md, backgroundColor: TI.card, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
                  <colgroup>
                    <col style={{ width: COL_PECA }} />
                    {/* Descrição em % e aprovação sem largura: a aprovação leva
                        TODA a sobra. Era a coluna cortada, e é a que responde
                        "para quem eu ligo agora". */}
                    <col style={isAprovacao ? { width: "30%" } : undefined} />
                    <col style={{ width: COL_QTD }} />
                    <col style={{ width: COL_ESPERA }} />
                    {isAprovacao && <col />}
                  </colgroup>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${TI.border}` }}>
                      <th scope="col" style={DRILL_TH}>Peça</th>
                      <th scope="col" style={{ ...DRILL_TH, textAlign: "left" }}>Descrição</th>
                      <th scope="col" style={DRILL_TH}>Qtd</th>
                      <th scope="col" style={DRILL_TH} title="Dias desde a última alteração da peça — qualquer edição atualiza este relógio">
                        Sem movimento
                      </th>
                      {isAprovacao && <th scope="col" style={{ ...DRILL_TH, textAlign: "left" }}>Aprovação com quem</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((it) => (
                      <tr key={it.id} style={{ borderBottom: `1px solid ${TI.track}` }}>
                        {/* Reticência nas DUAS linhas desta célula: a coluna tem
                            largura fixa, e num layout fixo o que não cabe não
                            alarga a coluna — invade a vizinha. */}
                        <td style={{ padding: "6px 10px" }}>
                          <Link
                            href={urlPecaNoEvento(ev.id, it.id)}
                            title={`Abrir ${it.displayId} no evento`}
                            /* 24px, e não os 36 do resto — e a diferença é
                               deliberada.

                               São 72 destes numa tela, um por peça. Levar cada
                               um a 36 somaria ~18px por linha e mais de 1.300px
                               de rolagem numa tabela cuja densidade é o ponto:
                               ela existe para caber muita peça na mesma tela.

                               24×24 é o piso da WCAG 2.5.8 em nível AA, e a
                               largura aqui é folgada (88px medidos), então o
                               alvo real é bem maior que o mínimo em área. O
                               `flex` faz o link preencher a altura da célula em
                               vez de flutuar no meio dela.

                               Subir a tabela inteira para 36 é possível, mas é
                               decisão de densidade e não conserto de alvo. */
                            style={{
                              display: "flex", alignItems: "center", minHeight: 24,
                              fontSize: 12, fontWeight: 700,
                              color: TI.accentText, textDecoration: "none",
                              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                            }}
                          >
                            {it.displayId}
                          </Link>
                          <span
                            title={getStatusLabel(it.status)}
                            style={{
                              display: "block", fontSize: 10, color: TI.label,
                              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                            }}
                          >
                            {/* Forma curta: mesma coluna estreita, mesmo corte de
                                "Aguardando Vin…". O `title` acima tem a inteira. */}
                            {getStatusShort(it.status)}
                          </span>
                        </td>
                        <td style={{ padding: "6px 10px", fontSize: 12, color: TI.strong }}>
                          {/* O `title` repete a frase INTEIRA (tipo + descrição),
                              não só a descrição: era o texto visível que ficava
                              cortado, então é ele que a dica precisa devolver. */}
                          <span
                            title={textoPeca(it)}
                            style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                          >
                            {textoPeca(it)}
                          </span>
                        </td>
                        <td style={{ padding: "6px 10px", fontSize: 12, color: TI.strong, textAlign: "center" }}>
                          {it.quantity}
                        </td>
                        <td style={{
                          padding: "6px 10px", textAlign: "center", whiteSpace: "nowrap",
                          fontSize: 12, fontWeight: 700,
                          color: dayColor(it.waitingDays),
                        }}>
                          {it.waitingDays === 0 ? "hoje" : `${it.waitingDays}d`}
                        </td>
                        {isAprovacao && (
                          <td style={{ padding: "6px 10px", fontSize: 12, color: TI.strong }}>
                            <Aprovacoes it={it} />
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {hidden > 0 && (
              <Link
                href={`/eventos/${ev.id}`}
                style={{ display: "inline-block", marginTop: 6, fontSize: 11, fontWeight: 600, color: TI.secondary, textDecoration: "none" }}
              >
                +{hidden} peça{hidden !== 1 ? "s" : ""} nesta etapa — ver todas no evento →
              </Link>
            )}
            </div>
          </div>
        );
      })}

      {seguintes.length > 0 && (
        <div style={{
          borderTop: `1px solid ${TI.border}`, paddingTop: 10,
          display: "flex", flexDirection: "column", gap: 4,
        }}>
          {seguintes.map(({ stage }) => (
            <span key={stage.key} style={{ fontSize: 12, color: stage.state === "overdue" ? TI.red : TI.secondary }}>
              {/* Artigo e verbo flexionados juntos: "As 1 peça acima também
                  travam" era concordância quebrada bem na frase que explica o
                  efeito dominó. */}
              {stage.pendingCount === 1 ? "A " : "As "}
              {pecasTexto(stage.pendingCount)} acima também{" "}
              {stage.pendingCount === 1 ? "trava" : "travam"} <strong style={{ fontWeight: 700 }}>{stage.label}</strong>
              {ev.invalidDate
                ? " (sem data confiável)"
                : stage.state === "overdue"
                ? ` (venceu há ${diasTexto(Math.abs(stage.diffDays))})`
                : ` (vence em ${fmtDayMonth(stage.deadline)})`}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
