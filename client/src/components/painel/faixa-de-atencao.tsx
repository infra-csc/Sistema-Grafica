// ─── Precisa de atenção ─────────────────────────────────────────────────────
// Os 13 estados têm o mesmo peso visual, mas a operação não é simétrica:
// reprovação de patrocinador e caminhão que já saiu com peça pendente
// valem mais que as outras dez juntas.
//
// A FAIXA RESPONDE SEMPRE. Ela só aparecia quando havia alerta — e o silêncio
// era ambíguo: "não há nada" e "ainda não carregou" tinham a mesma cara, e a
// pergunta do primeiro minuto de todo perfil ("o que precisa de mim agora?")
// ficava sem resposta explícita justamente no dia bom. Agora são três estados:
//   · carregando → uma silhueta do tamanho do chip (sem layout shift,
//     e sem afirmar "nada" antes de saber);
//   · sem alerta → uma frase calma com o recorte a que ela se refere;
//   · com alerta → os chips, num cartão, antes de qualquer número.
import type { CSSProperties, Dispatch, SetStateAction } from "react";
import { Link } from "wouter";
import { AlertTriangle, ArrowUpRight, CheckCircle2, Truck, XCircle } from "lucide-react";
import type { ChipOcultas } from "@/lib/painel-encerrados";
import { FS, FW, R, T, N, TOM, FONT } from "@/lib/theme";
import { fmtN } from "./regras";

export function FaixaDeAtencao({
  isLoading, isError, atencao, chipOcultasDados, hasActiveFilters, useCards,
  focoFilter, toggleFoco, levarALista, mostrarFinalizados, setMostrarFinalizados,
}: {
  isLoading: boolean;
  isError: boolean;
  atencao: { reprovadas: number; atrasadas: number };
  chipOcultasDados: ChipOcultas | null;
  hasActiveFilters: boolean;
  useCards: boolean;
  focoFilter: string[];
  toggleFoco: (key: string) => void;
  /** Leva a tela até a lista (só no layout de cards) — ver a página. */
  levarALista: () => void;
  mostrarFinalizados: boolean;
  setMostrarFinalizados: Dispatch<SetStateAction<boolean>>;
}) {
  if (isLoading) {
    return <div aria-hidden="true" className="animate-pulse" style={{ width: useCards ? "100%" : 320, height: 38, borderRadius: R.pill, backgroundColor: N.n3 }} />;
  }
  if (!(!isError || atencao.reprovadas > 0 || atencao.atrasadas > 0 || chipOcultasDados)) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
    {!isError && atencao.reprovadas === 0 && atencao.atrasadas === 0 && (
      <p data-testid="texto-atencao-em-dia" style={{ display: "flex", alignItems: "flex-start", gap: 8, margin: 0, fontSize: FS.body, lineHeight: 1.45, color: T.apoio }}>
        {/* Verde só aqui, e só no ícone: é o único "está tudo certo" da
            tela. #15803d sobre #fafaf9 = 4,80:1. */}
        <CheckCircle2 aria-hidden="true" style={{ width: 16, height: 16, color: TOM.sucesso.text, flexShrink: 0, marginTop: 1 }} />
        <span>
          <strong style={{ color: T.text, fontWeight: FW.forte }}>Nada pede atenção agora.</strong>
          {" "}Nenhuma peça reprovada pelo patrocinador nem em evento com caminhão atrasado
          {/* Os números desta faixa seguem o recorte; com filtro ligado, a
              frase não pode soar como verdade do sistema inteiro. */}
          {hasActiveFilters ? " neste recorte." : "."}
        </span>
      </p>
    )}
    {(atencao.reprovadas > 0 || atencao.atrasadas > 0 || chipOcultasDados) && (() => {
      /* O RÓTULO DIZ O QUE A FAIXA REALMENTE CARREGA.

         Ele era fixo em "Precisa de atenção", mas a faixa aparece por três
         motivos e um deles NÃO é alerta: peça oculta porque o evento já foi
         encerrado ou realizado é informação de recorte, não pendência. E
         esse é o caso mais COMUM — em produção são 147 peças ocultas com
         zero reprovadas e zero atrasadas, ou seja, na maior parte do tempo
         a faixa anunciava urgência e entregava uma nota de rodapé.

         Rótulo que promete o que não cumpre custa caro duas vezes: gasta a
         atenção de quem lê agora e ensina a ignorar a faixa da próxima vez
         — inclusive quando ela estiver certa. */
      const temAlerta = atencao.reprovadas > 0 || atencao.atrasadas > 0;
      const rotulo = temAlerta ? "Precisa de atenção" : "Fora da lista";
      // No celular cada chip ocupa a linha inteira e pode quebrar o texto:
      // "147 peças ocultas · evento encerrado ou já realizado · mostrar" não
      // cabe em 366px, e com altura fixa o texto vazava do chip.
      const chipBase: CSSProperties = {
        display: "flex", alignItems: "center", gap: 8, minHeight: 38, padding: "7px 14px",
        borderRadius: useCards ? 10 : 999, cursor: "pointer", fontSize: 13, fontWeight: 600, lineHeight: 1.3,
        textAlign: "left", width: useCards ? "100%" : undefined,
      };
      return (
      <section aria-label={rotulo} style={{
          display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center",
          // O cartão só existe quando há ALERTA: é o que faz a faixa ser a
          // primeira coisa lida sem precisar de cor extra. "Fora da lista"
          // sozinho continua sendo uma nota de rodapé, sem moldura.
          ...(temAlerta ? { backgroundColor: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: useCards ? 12 : "10px 12px 10px 16px", boxShadow: "0 1px 3px rgba(28,25,23,0.05)" } : null),
        }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, marginRight: 6, fontSize: 13, fontWeight: 700, color: temAlerta ? T.text : T.apoio, width: useCards ? "100%" : undefined }}>
          {temAlerta && <AlertTriangle aria-hidden="true" style={{ width: 15, height: 15, color: TOM.perigo.text, flexShrink: 0 }} />}
          {rotulo}</span>
        {atencao.reprovadas > 0 && (
          <button
            onClick={() => { if (!focoFilter.includes("reprovadas")) levarALista(); toggleFoco("reprovadas"); }}
            aria-pressed={focoFilter.includes("reprovadas")}
            data-testid="chip-atencao-reprovadas"
            className="pg-chip"
            /* #b91c1c sobre #fef2f2 = 5,91:1 AA; marcado, branco sobre o vermelho = 6,47:1. */
            style={{ ...chipBase, backgroundColor: focoFilter.includes("reprovadas") ? TOM.perigo.text : TOM.perigo.bg, color: focoFilter.includes("reprovadas") ? T.surface : TOM.perigo.text, border: `1px solid ${focoFilter.includes("reprovadas") ? TOM.perigo.text : TOM.perigo.border}` }}
          >
            <XCircle aria-hidden="true" style={{ width: 15, height: 15, flexShrink: 0 }} />
            <span>
              <span style={{ fontFamily: FONT.display, fontWeight: 800 }}>{fmtN(atencao.reprovadas)}</span>
              {" "}{atencao.reprovadas === 1 ? "peça reprovada pelo patrocinador" : "peças reprovadas pelo patrocinador"}
            </span>
          </button>
        )}
        {atencao.atrasadas > 0 && (
          <button
            onClick={() => { if (!focoFilter.includes("atrasadas")) levarALista(); toggleFoco("atrasadas"); }}
            aria-pressed={focoFilter.includes("atrasadas")}
            data-testid="chip-atencao-atrasadas"
            className="pg-chip"
            /* #b45309 sobre #fffbeb = 4,84:1 AA nos 13px. */
            style={{ ...chipBase, backgroundColor: focoFilter.includes("atrasadas") ? TOM.alerta.text : TOM.alerta.bg, color: focoFilter.includes("atrasadas") ? T.surface : TOM.alerta.text, border: `1px solid ${focoFilter.includes("atrasadas") ? TOM.alerta.text : TOM.alerta.border}` }}
          >
            <Truck aria-hidden="true" style={{ width: 15, height: 15, flexShrink: 0 }} />
            <span>
              <span style={{ fontFamily: FONT.display, fontWeight: 800 }}>{fmtN(atencao.atrasadas)}</span>
              {" "}{atencao.atrasadas === 1 ? "peça em evento com caminhão atrasado" : "peças em evento com caminhão atrasado"}
            </span>
          </button>
        )}
        {/* "QUEM PRECISA AGIR NESTE ATRASO?" O chip responde quantas peças,
            e o Painel não sabe dizer de quem é a vez — quem sabe é a Gestão
            de Prazos, que cruza cada etapa vencida com o setor que a
            destrava. O link já chega no recorte "Só com atraso" (?atrasados=1,
            parâmetro que aquela tela lê), sem a pessoa remontar o filtro. */}
        {atencao.atrasadas > 0 && (
          <Link
            href="/prazos?atrasados=1"
            data-testid="link-atrasados-quem-age"
            style={{ display: "inline-flex", alignItems: "center", gap: 4, minHeight: 38, fontSize: 13, fontWeight: 700, color: T.accentText, textDecoration: "underline", textUnderlineOffset: 2, whiteSpace: "nowrap" }}
          >
            Quem precisa agir <ArrowUpRight aria-hidden="true" style={{ width: 13, height: 13 }} />
          </Link>
        )}
        {/* ── Peças de evento fora de jogo ────────────────────────────────
            Mora AQUI, e não entre os cards de status, por dois motivos: os
            cards são etapas do fluxo, e isto não é etapa nenhuma; e esta
            faixa é o lugar onde os recortes transversais já vivem — foi dela
            que saiu a contagem de "atrasadas" que antes misturava evento
            vivo com evento morto.

            Aparece SEMPRE que houver algo oculto, inclusive com a lista
            cheia: esconder em silêncio seria pior que o problema que a
            ocultação resolve. Cinza, não âmbar nem vermelho — não é
            urgência, é registro; o alarme aqui ao lado tem de continuar
            sendo o mais forte da faixa.

            UM ALGARISMO SÓ, e é o total — o mesmo que o contador de
            resultados exibe. A primeira versão mostrava o passivo aqui e o
            total dentro do verbo ("315 em aberto … mostrar as 469
            ocultas"), e o dono reprovou de imediato: "aparece dois números
            diferentes". O passivo continua na frase do `title`, por extenso
            e com a relação dita. O porquê inteiro está em lib/
            painel-encerrados.ts. */}
        {chipOcultasDados && (
          <button
            onClick={() => setMostrarFinalizados(v => !v)}
            aria-pressed={mostrarFinalizados}
            title={chipOcultasDados.title}
            aria-label={chipOcultasDados.srLabel}
            data-testid="chip-atencao-ocultas"
            className="pg-chip"
            /* Contrastes: #44403c sobre #f5f5f4 = 9,42:1; no estado marcado,
               #ffffff sobre #57534e = 7,63:1. Ambos AA com folga em 13px. */
            style={{ ...chipBase, backgroundColor: mostrarFinalizados ? T.apoio : N.n2, color: mostrarFinalizados ? T.surface : T.strong, border: `1px solid ${mostrarFinalizados ? T.apoio : T.border}` }}
          >
            <span>
              <span style={{ fontFamily: FONT.display, fontWeight: 800 }}>{fmtN(chipOcultasDados.total)}</span>
              {" "}{chipOcultasDados.texto}
              {/* Separador só de ritmo — o nome acessível do botão vem inteiro
                  do aria-label, então esta pontuação não é lida duas vezes. */}
              <span aria-hidden="true" style={{ opacity: 0.55 }}> · </span>
              <span style={{ textDecoration: "underline", textUnderlineOffset: 2, fontWeight: 700 }}>{chipOcultasDados.acao}</span>
            </span>
          </button>
        )}
      </section>
      );
    })()}
    </div>
  );
}
