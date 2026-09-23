import type { CSSProperties } from "react";
import { Check } from "lucide-react";
import { FS, FW, R, SHADOW, T, N, TOM, FONT } from "@/lib/theme";
import { fmtN } from "./regras";

// ─── Status card ────────────────────────────────────────────────────────────
// Fora do componente da página de propósito: definido inline, era recriado a
// cada render e os 13 cards remontavam (perdendo até a transição CSS) a cada
// tecla digitada na busca. Recebe tudo por props.
//
// O CARD É RESUMO, NÃO ALARME. Cada card tinha ponto colorido,
// borda esquerda na cor do status e número pintado quando ativo — treze cores
// competindo com as duas que de fato pedem ação (reprovada, caminhão
// atrasado), que moram na faixa de atenção acima. Agora o card é neutro: o
// que diferencia um do outro é o NOME, escrito por extenso em caixa normal
// (o rótulo em 10px caixa-alta era o texto mais difícil de ler da tela, e é
// justamente o que diz o que o número conta).
//
// Estado FILTRADO usa a mesma gramática das visões salvas da barra de filtros
// (borda #c2410c, fundo #fff7ed): na tela inteira, "este recorte está ligado"
// tem uma aparência só.
//
// `dark` é o card Total. O nome ficou (o data-testid e os testes dependem
// dele), mas o card preto com selo "BASELINE" saiu: era o elemento mais
// pesado da primeira dobra, falava jargão e estava SEMPRE "ativo" — o estado
// padrão da tela pintado como destaque. Agora ele é o card de fundo cinza que
// fecha a conta e só chama atenção quando há um filtro de status para desfazer.
export function StatusCard({
  label, value, filterKey, sub, subActionLabel, onSubAction,
  isActive, onToggle, dark, title, carregando, pct, cor,
}: {
  label: string; value: number;
  /** Cor da etapa (getStatusMeta().dot) — a mesma da barra e dos selos. */
  cor?: string;
  filterKey: string; sub?: string; subActionLabel?: string; onSubAction?: () => void;
  isActive: boolean; onToggle: () => void; dark?: boolean; title?: string;
  /** Enquanto os dados nao chegaram, o card nao sabe o numero — e nao deve chutar zero. */
  carregando?: boolean;
  /** Fatia do total. O absoluto responde "quantas peças"; o percentual
   *  responde "quanto isso pesa", que é a pergunta de quem procura gargalo. */
  pct?: number;
}) {
  // Cards zerados são informação de baixo valor no escaneamento ("onde está
  // o gargalo?") — ficam esmaecidos (CSS, .pg-card[data-zero]), mas continuam
  // clicáveis/filtráveis e voltam ao tom cheio no hover E no foco de teclado.
  const isZero = value === 0 && !isActive && !dark && !carregando;
  const plural = value === 1 ? "peça" : "peças";
  const valorTexto = fmtN(value);
  // O Total só tem o que dizer quando há filtro de status para desfazer.
  const badgeTexto = dark ? (isActive ? null : "Ver todas") : (isActive ? "Filtrando" : null);
  // Os cartões são o filtro por status desta tela, e por isso são um
  // <button aria-pressed> DE VERDADE — a gramática do <CartaoKpi> do design
  // system. Não é o próprio CartaoKpi por três motivos medidos: ele só pinta
  // com os tons de TOM (fúcsia e rosa, de "Revisão final" e "Impresso", não
  // existem lá — a cor da etapa é pedido do dono), não aceita aria-label (o
  // "carregando" dito ao leitor de tela) e não tem lugar para a ação
  // secundária do rodapé, que dentro de um <button> seria botão aninhado.
  //
  // A ação do rodapé ("inclui 7 rascunhos") mora FORA do botão do cartão,
  // posicionada por cima do lugar que o texto ocupa lá dentro: botão dentro
  // de botão é HTML inválido e o clique cairia nos dois.
  const subComAcao = Boolean(sub && onSubAction);
  const estiloDoSub: CSSProperties = {
    fontSize: FS.small, fontWeight: FW.medio, lineHeight: 1.2, color: T.second,
  };
  return (
    <div style={{ position: "relative", display: "grid" }}>
    <button
      type="button"
      aria-pressed={isActive}
      /* Sem isto o leitor de tela anunciava "Filtrar por X, 0 peças" durante
         a carga — o mesmo zero falso, dito em voz alta. */
      aria-label={carregando
        ? `${dark ? "Mostrar todas as peças" : `Filtrar por ${label}`}, carregando`
        : `${dark ? "Mostrar todas as peças" : `Filtrar por ${label}`}, ${value} ${plural}`}
      title={title}
      onClick={onToggle}
      data-testid={dark ? "stat-total" : `stat-card-${filterKey}`}
      className="pg-card"
      data-zero={isZero ? "1" : "0"}
      style={{
        position: "relative", overflow: "hidden",
        font: "inherit", textAlign: "left", width: "100%",
        // #f5f5f4 no Total: separa "a conta inteira" das parcelas sem cor nova.
        background: isActive && !dark ? TOM.laranja.bg : dark ? N.n2 : T.surface,
        border: `1px solid ${isActive && !dark ? T.accentText : T.border}`,
        borderRadius: R.lg,
        padding: "11px 12px 10px 13px", minHeight: 84,
        display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 6,
        cursor: "pointer",
        boxShadow: isActive && !dark ? `0 0 0 1px ${T.accentText}` : SHADOW.sm,
      }}
    >
      {/* COR DA ETAPA (pedido do dono: "aqui tem que ter cor"). Faixa à esquerda
          com a mesma cor do pedaço da barra e do selo da linha: quem olha o
          card reconhece a etapa sem ler o nome. Decorativa — o nome continua
          escrito ao lado. */}
      {cor && <span aria-hidden="true" style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, backgroundColor: cor }} />}
      <span style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 6 }}>
        {/* Rótulo de CONTEÚDO em caixa normal, 12px. Quebra em duas linhas
            se precisar ("Aguardando Revisão Final" no celular) em vez de
            abreviar para "Ag. Revisão" — abreviação é mais um código a
            decorar. #57534e sobre #ffffff = 7,63:1; sobre #f5f5f4 = 6,99:1. */}
        <span style={{ margin: 0, fontSize: FS.meta, fontWeight: FW.medio, color: T.apoio, lineHeight: 1.3, minWidth: 0, display: "flex", alignItems: "baseline", gap: 6 }}>
          {cor && <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: cor, flexShrink: 0, transform: "translateY(-1px)" }} />}
          {label}
        </span>
        {badgeTexto && (
          /* #c2410c sobre #fff7ed = 4,88:1 AA nos 11px peso 700. */
          <span style={{ display: "inline-flex", alignItems: "center", gap: 2, flexShrink: 0, fontSize: FS.small, fontWeight: FW.forte, color: T.accentText, lineHeight: 1.3, whiteSpace: "nowrap" }}>
            {!dark && <Check aria-hidden="true" style={{ width: 11, height: 11 }} />}
            {badgeTexto}
          </span>
        )}
      </span>
      {/* Só <span> aqui dentro: o cartão é um <button>, e <p>/<div> não são
          conteúdo permitido de botão. */}
      <span style={{ display: "block" }}>
        <span style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
          {/* ZERO É UMA AFIRMAÇÃO, e durante a carga a tela não tem como
              fazê-la. Com 3.187 peças a caminho, os cards exibiam "0" e o
              TOTAL anunciava "0 TOTAL" com selo BASELINE enquanto o skeleton
              rodava logo abaixo — a manchete da tela dizia que não havia nada.
              Um travessão diz a verdade: ainda não sei. */}
          <span style={{ display: "block", fontFamily: FONT.display, fontSize: 24, fontWeight: FW.forte, color: T.text, lineHeight: 1, margin: 0, letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums" }}>{carregando ? "—" : valorTexto}</span>
          {/* A HIERARQUIA VEM DO PESO, NÃO DO CONTRASTE.
              A primeira tentativa usou um cinza mais claro (#8c8580) para o
              percentual ficar subordinado — e ele dá 3,63:1 em 10px, reprova
              AA. Enfraquecer contraste para criar hierarquia é trocar um
              problema de design por um de acesso.
              Mesmo cinza de apoio (5,03:1), subordinado por tamanho e peso.
              "do total" saiu da frase: repetido em treze cards era a mesma
              ressalva dita treze vezes ao lado de um número que já a implica. */}
          {!carregando && pct !== undefined && value > 0 && (
            <span style={{ fontSize: FS.small, fontWeight: FW.medio, color: T.second, lineHeight: 1 }}>
              {pct < 1 ? "<1" : Math.round(pct)}%
            </span>
          )}
        </span>
        {/* Com ação, o texto aqui dentro só reserva o lugar (invisível e fora
            da árvore de acessibilidade): quem aparece e recebe o clique é o
            botão irmão, por cima. Assim o cartão não muda de altura. */}
        {sub && (
          subComAcao ? (
            <span aria-hidden="true" style={{ ...estiloDoSub, display: "inline-block", visibility: "hidden", padding: "3px 0", marginTop: 2 }}>{sub}</span>
          ) : (
            <span style={{ ...estiloDoSub, display: "block", margin: "4px 0 0" }}>{sub}</span>
          )
        )}
      </span>
    </button>
    {subComAcao && (
      /* O subtexto era um beco sem saída: dizia "inclui 7 rascunhos" e não
         havia como ver os 7. Irmão do cartão, não filho: o clique aqui não
         alterna o filtro do cartão. */
      <button
        type="button"
        onClick={onSubAction}
        title={subActionLabel}
        style={{
          ...estiloDoSub,
          /* 11px com 3px de padding em cima e embaixo: o alvo passa a ~20px
             sem deslocar nada, porque o fundo é transparente. */
          position: "absolute", left: 13, bottom: 10,
          background: "none", border: "none", padding: "3px 0", cursor: "pointer",
          textDecoration: "underline", textUnderlineOffset: 2, textAlign: "left",
        }}
      >
        {sub}
      </button>
    )}
    </div>
  );
}
