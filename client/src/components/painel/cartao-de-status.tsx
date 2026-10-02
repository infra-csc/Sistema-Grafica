import { Check, X } from "lucide-react";
import { FS, FW, R, H, T, TOM, FONT } from "@/lib/theme";
import { fmtN } from "./regras";

// ─── A etapa do fluxo — uma LINHA do razão, não um cartão ───────────────────
// Fora do componente da página de propósito: definido inline, era recriado a
// cada render e as 13 etapas remontavam (perdendo até a transição CSS) a cada
// tecla digitada na busca. Recebe tudo por props.
//
// REDESIGN 02/10 — DE TREZE CARTÕES A UM RAZÃO. Os cartões de 196px em três
// faixas gastavam ~370px de altura no desktop (e ~700 no celular) para dizer
// treze números — e cada faixa terminava num lugar diferente, deixando buracos
// à direita. Agora cada etapa é uma linha de 34px dentro da coluna da sua
// zona: ponto na cor da etapa (a mesma da barra e do selo da linha), o nome
// por extenso, o número alinhado à direita em algarismos tabulares e o
// percentual. Lê-se como um extrato, de cima para baixo, e a soma bate com o
// cabeçalho.
//
// Continua sendo o filtro por status desta tela: <button aria-pressed> de
// verdade. Estado FILTRADO usa a gramática das visões salvas (borda #c2410c,
// fundo #fff7ed): na tela inteira, "este recorte está ligado" tem uma
// aparência só.
//
// `dark` é o Total. O nome ficou (o data-testid e os testes dependem dele),
// mas ele agora é a MANCHETE do painel do fluxo — "55 peças" em display — e
// só vira ação visível ("Ver todas") quando há um filtro de status a desfazer.
export function StatusCard({
  label, value, filterKey, sub, subActionLabel, onSubAction,
  isActive, onToggle, dark, title, carregando, pct, cor, dedo, compacto,
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
  /** Ponteiro grosso (dedo): a linha sobe para 44px. */
  dedo?: boolean;
  /** Celular (grade de duas colunas): sem a coluna de percentual, que lá
   *  espremia o nome em três linhas — o percentual da ZONA fica no cabeçalho. */
  compacto?: boolean;
}) {
  // Etapas zeradas são informação de baixo valor no escaneamento ("onde está
  // o gargalo?") — ficam esmaecidas (CSS, .pg-card[data-zero]), mas continuam
  // clicáveis/filtráveis e voltam ao tom cheio no hover E no foco de teclado.
  const isZero = value === 0 && !isActive && !dark && !carregando;
  const plural = value === 1 ? "peça" : "peças";
  const valorTexto = fmtN(value);
  // A ação do rodapé ("inclui 7 rascunhos") mora FORA do botão: botão dentro
  // de botão é HTML inválido e o clique cairia nos dois.
  const subComAcao = Boolean(sub && onSubAction);

  if (dark) {
    // ── O TOTAL — manchete do painel ──────────────────────────────────────
    return (
      <div style={{ display: "flex", alignItems: "baseline", flexWrap: "wrap", columnGap: 10, rowGap: 2, minWidth: 0 }}>
        <button
          type="button"
          aria-pressed={isActive}
          aria-label={carregando ? "Mostrar todas as peças, carregando" : `Mostrar todas as peças, ${value} ${plural}`}
          title={isActive ? undefined : "Tirar o filtro de status e ver todas as peças"}
          onClick={onToggle}
          data-testid={dark ? "stat-total" : `stat-card-${filterKey}`}
          className="pg-card pnl-total"
          data-zero="0"
          style={{
            font: "inherit", background: "none", border: "none", padding: 0, margin: 0,
            display: "inline-flex", alignItems: "baseline", gap: 7, cursor: isActive ? "default" : "pointer",
            color: T.text, textAlign: "left",
          }}
        >
          <span style={{ fontFamily: FONT.display, fontSize: FS.h1, fontWeight: FW.forte, letterSpacing: "-0.03em", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
            {carregando ? "—" : valorTexto}
          </span>
          <span style={{ fontSize: FS.read, fontWeight: FW.medio, color: T.apoio }}>
            {carregando ? "peças" : plural}
          </span>
          {!isActive && !carregando && (
            /* #c2410c sobre #fff7ed = 4,88:1 AA nos 11px peso 700. */
            <span className="pnl-ver-todas" style={{ display: "inline-flex", alignItems: "center", gap: 4, alignSelf: "center", marginLeft: 2, padding: "2px 8px 2px 6px", borderRadius: R.pill, border: `1px solid ${TOM.laranja.border}`, backgroundColor: TOM.laranja.bg, fontSize: FS.small, fontWeight: FW.forte, color: T.accentText, whiteSpace: "nowrap" }}>
              <X aria-hidden="true" style={{ width: 11, height: 11 }} />
              Ver todas
            </span>
          )}
        </button>
        {sub && (subComAcao ? (
          <button
            type="button"
            onClick={onSubAction}
            title={subActionLabel}
            className="pnl-sublink"
            style={{ font: "inherit", fontSize: FS.meta, fontWeight: FW.medio, color: T.second, background: "none", border: "none", padding: 0, minHeight: dedo ? 44 : 36, display: "inline-flex", alignItems: "center", cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 2, textDecorationColor: T.bdark }}
          >
            {sub}
          </button>
        ) : (
          <span style={{ fontSize: FS.meta, fontWeight: FW.medio, color: T.second }}>{sub}</span>
        ))}
      </div>
    );
  }

  // ── UMA ETAPA — linha do razão ────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
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
        className="pg-card pnl-etapa"
        data-zero={isZero ? "1" : "0"}
        style={{
          font: "inherit", textAlign: "left", width: "100%", cursor: "pointer",
          display: "grid", gridTemplateColumns: compacto ? "8px minmax(0, 1fr) auto" : "10px minmax(0, 1fr) auto 34px", alignItems: "center", columnGap: compacto ? 7 : 8,
          minHeight: dedo ? H.toque : 36, padding: compacto ? "0 8px" : "0 8px 0 10px", borderRadius: R.md,
          background: isActive ? TOM.laranja.bg : "transparent",
          border: `1px solid ${isActive ? T.accentText : "transparent"}`,
          color: T.text,
        }}
      >
        {/* COR DA ETAPA (pedido do dono: "aqui tem que ter cor") — o mesmo
            ponto da barra e do selo da linha. Decorativo: o nome está ao lado. */}
        <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: cor ?? T.bdark, justifySelf: "center" }} />
        {/* Rótulo de CONTEÚDO em caixa normal: quebra em duas linhas se
            precisar em vez de abreviar — abreviação é mais um código a
            decorar. #44403c sobre #ffffff = 10,27:1. */}
        <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, fontSize: compacto ? FS.meta : FS.body, fontWeight: isActive ? FW.forte : FW.corpo, color: isActive ? T.accentText : T.strong, lineHeight: 1.25, padding: "5px 0" }}>
          <span style={{ minWidth: 0 }}>{label}</span>
          {isActive && <Check aria-hidden="true" style={{ width: 13, height: 13, flexShrink: 0 }} />}
        </span>
        {/* ZERO É UMA AFIRMAÇÃO, e durante a carga a tela não tem como
            fazê-la. Um travessão diz a verdade: ainda não sei. */}
        <span style={{ fontFamily: FONT.display, fontSize: FS.strong, fontWeight: FW.forte, color: T.text, lineHeight: 1, letterSpacing: "-0.01em", fontVariantNumeric: "tabular-nums", textAlign: "right" }}>
          {carregando ? "—" : valorTexto}
        </span>
        <span style={{ textAlign: "right", lineHeight: 1, display: compacto ? "none" : undefined }}>
          {/* A HIERARQUIA VEM DO PESO, NÃO DO CONTRASTE.
              A primeira tentativa usou um cinza mais claro (#8c8580) para o
              percentual ficar subordinado — e ele dá 3,63:1 em 10px, reprova
              AA. Mesmo cinza de apoio (5,03:1), subordinado por tamanho e peso. */}
          {!carregando && pct !== undefined && value > 0 && (
            <span style={{ fontSize: FS.small, fontWeight: FW.medio, color: T.second, fontVariantNumeric: "tabular-nums" }}>
              {pct < 1 ? "<1" : Math.round(pct)}%
            </span>
          )}
        </span>
      </button>
      {sub && (subComAcao ? (
        /* O subtexto era um beco sem saída: dizia "inclui 7 rascunhos" e não
           havia como ver os 7. Irmão da linha, não filho: o clique aqui não
           alterna o filtro da etapa. */
        <button
          type="button"
          onClick={onSubAction}
          title={subActionLabel}
          className="pnl-sublink"
          style={{ alignSelf: "flex-start", font: "inherit", fontSize: FS.small, fontWeight: FW.medio, color: T.second, background: "none", border: "none", padding: 0, marginLeft: 28, minHeight: dedo ? 44 : 36, display: "inline-flex", alignItems: "center", cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 2, textDecorationColor: T.bdark }}
        >
          {sub}
        </button>
      ) : (
        <span style={{ fontSize: FS.small, fontWeight: FW.medio, color: T.second, margin: "0 0 4px 28px" }}>{sub}</span>
      ))}
    </div>
  );
}
