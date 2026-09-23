// ─────────────────────────────────────────────────────────────────────────────
// <CabecalhoDaPagina> — a primeira linha de toda tela.
//
// API
//   <CabecalhoDaPagina
//     titulo="Modelos"
//     subtitulo="12 modelos, 3 com peças pendentes"   // o ESTADO, não a repetição do título
//     frescor={<CarimboDeFrescor />}                   // opcional, ReactNode
//     acoes={<Botao variante="primario">Novo</Botao>}  // opcional
//     icone={Layers} corDoIcone={T.accentText}         // opcional
//     testId="title-modelos"                           // data-testid do <h1>
//     semMargem | margemInferior={8}                   // pd. 20px abaixo
//   />
//
// POR QUE ELE EXISTE. Cada tela montava o próprio topo: título em 20, 22, 24 e
// 26 conforme o arquivo, subtítulo ora acima ora abaixo, ações ora coladas no
// título ora na linha de baixo. Abrir duas telas seguidas parecia trocar de
// produto — e o olho perde meio segundo em cada troca procurando onde está o
// nome da tela.
//
// A ORDEM É FIXA e é a ordem da leitura: ONDE ESTOU (título), COMO ESTÁ
// (subtítulo + frescor), O QUE POSSO FAZER (ações, à direita). O subtítulo
// carrega o estado porque repetir o título em outras palavras — "Gerencie seus
// modelos" embaixo de "Modelos" — é uma linha que ninguém lê duas vezes.
//
// No celular a fileira quebra: as ações caem para baixo em largura cheia, em
// vez de espremer o título em duas letras por linha.
// ─────────────────────────────────────────────────────────────────────────────
import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { T, FS, R, FONT, FW } from "@/lib/theme";

export interface CabecalhoDaPaginaProps {
  titulo: string;
  subtitulo?: React.ReactNode;
  frescor?: React.ReactNode;
  acoes?: React.ReactNode;
  icone?: LucideIcon;
  /** id do <h1>, para o `aria-labelledby` de quem envolve a tela. */
  id?: string;
  /**
   * `data-testid` do <h1>. As telas tinham testes presos a
   * `title-<tela>` e envolviam o cabeçalho numa <div> só para carregá-lo.
   */
  testId?: string;
  /** Tira a margem de baixo — quando o que vem embaixo já dá o respiro. */
  semMargem?: boolean;
  /** Margem de baixo em px (pd. 20). `semMargem` vence. */
  margemInferior?: number;
  /** Cor do ícone (pd. T.apoio). Decorativo: não precisa de 4,5:1. */
  corDoIcone?: string;
}

export function CabecalhoDaPagina({
  titulo, subtitulo, frescor, acoes, icone: Icone, id, testId, semMargem = false, margemInferior = 20, corDoIcone,
}: CabecalhoDaPaginaProps) {
  return (
    <header
      data-testid="cabecalho-da-pagina"
      style={{
        display: "flex", flexWrap: "wrap", alignItems: "flex-start",
        justifyContent: "space-between", gap: 12,
        marginBottom: semMargem ? 0 : margemInferior,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: "1 1 260px" }}>
        {Icone && (
          <div
            aria-hidden="true"
            style={{
              width: 38, height: 38, borderRadius: R.lg, flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              backgroundColor: T.low, border: `1px solid ${T.border}`, color: corDoIcone ?? T.apoio,
            }}
          >
            <Icone style={{ width: 18, height: 18 }} />
          </div>
        )}
        <div style={{ minWidth: 0 }}>
          <h1
            id={id}
            data-testid={testId}
            style={{
              margin: 0, fontFamily: FONT.display, fontSize: FS.h1, fontWeight: FW.rotulo,
              letterSpacing: "-0.03em", lineHeight: 1.15, color: T.text,
            }}
          >
            {titulo}
          </h1>
          {(subtitulo || frescor) && (
            <div
              style={{
                display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10,
                margin: "4px 0 0", fontSize: FS.body, lineHeight: 1.45, color: T.second,
              }}
            >
              {subtitulo && <span>{subtitulo}</span>}
              {frescor}
            </div>
          )}
        </div>
      </div>

      {acoes && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {acoes}
        </div>
      )}
    </header>
  );
}
