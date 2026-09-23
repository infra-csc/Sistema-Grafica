// ─────────────────────────────────────────────────────────────────────────────
// <EstadoVazio>, <EstadoErro>, <Esqueleto> — as três telas que não são a tela.
//
// API
//   <EstadoVazio icone={Inbox} titulo="Nenhum modelo" descricao="…" acao={<Botao…/>}
//                tom="sucesso"            // "tudo em dia": o ícone fala verde
//                testId="empty-modelos" />
//   <EstadoErro titulo="Não deu para carregar os modelos" detalhe={String(erro)}
//               aoTentarDeNovo={() => refetch()} carregando={isFetching}
//               tamanhoDoBotao="toque" rotuloDoBotao="Tentar de novo"
//               testId="modelos-erro" testIdDoBotao="button-retry-modelos" />
//   <Esqueleto variante="lista" | "cartoes" | "tabela" linhas={6} />
//
// VAZIO E ERRO SÃO COISAS DIFERENTES e o app os tratava igual: uma caixa cinza
// escrito "Nenhum resultado". Vazio é um fato normal — não há modelo cadastrado
// ainda — e pede o próximo passo ("Criar modelo"). Erro é uma falha, e pede
// outra coisa: dizer O QUE falhou e oferecer tentar de novo. Quem vê "Nenhum
// resultado" depois de a rede cair conclui que os dados sumiram.
//
// O ESQUELETO IMITA O QUE VEM. Três variantes porque um bloco cinza genérico no
// lugar de uma tabela faz a página inteira pular quando o dado chega. O
// esqueleto certo tem a mesma altura e o mesmo ritmo da lista real, então a
// chegada do dado é uma troca de cor, não um solavanco.
//
// `aria-busy` e `role="status"` no esqueleto: quem usa leitor de tela ouvia
// silêncio durante o carregamento e concluía que a página estava vazia.
// ─────────────────────────────────────────────────────────────────────────────
import * as React from "react";
import { AlertTriangle, Inbox, RotateCw } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { T, FS, R, FW, FONT, TOM, type NomeDeTom } from "@/lib/theme";
import { Botao, type TamanhoBotao } from "@/components/ui/botao";

export interface EstadoVazioProps {
  icone?: LucideIcon;
  titulo: string;
  descricao?: React.ReactNode;
  /** O próximo passo — um <Botao>, quando existe um. */
  acao?: React.ReactNode;
  compacto?: boolean;
  /**
   * Tom do ÍCONE. Vazio nem sempre é neutro: "nada pendente" é notícia boa, e
   * as telas pintavam o CheckCircle de verde à mão. Usa o `text` do tom
   * (≥ 4,5:1 sobre branco — ícone grande só precisaria de 3:1).
   */
  tom?: NomeDeTom;
  /** `data-testid` da caixa (pd. "estado-vazio"). */
  testId?: string;
}

export function EstadoVazio({ icone: Icone = Inbox, titulo, descricao, acao, compacto = false, tom, testId = "estado-vazio" }: EstadoVazioProps) {
  return (
    <div
      data-testid={testId}
      style={{
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        gap: 8, textAlign: "center",
        padding: compacto ? "28px 20px" : "56px 24px",
        borderRadius: R.lg,
        backgroundColor: T.surface,
        border: `1px dashed ${T.border}`,
      }}
    >
      {/* bdark (#d6d3d1) e não muted: o ícone é decoração de 40px, e neste
          tamanho o tom mais claro sumia no fundo branco. */}
      <Icone aria-hidden="true" style={{ width: compacto ? 26 : 34, height: compacto ? 26 : 34, color: tom ? TOM[tom].text : T.bdark }} />
      <p style={{ margin: 0, fontFamily: FONT.display, fontSize: FS.strong, fontWeight: FW.forte, color: T.text }}>
        {titulo}
      </p>
      {descricao && (
        <p style={{ margin: 0, maxWidth: 420, fontSize: FS.body, lineHeight: 1.5, color: T.second }}>
          {descricao}
        </p>
      )}
      {acao && <div style={{ marginTop: 6 }}>{acao}</div>}
    </div>
  );
}

export interface EstadoErroProps {
  titulo?: string;
  /** A mensagem técnica. Vai junto porque "algo deu errado" não ajuda ninguém
      a relatar o problema — nem quem atende o chamado. */
  detalhe?: React.ReactNode;
  aoTentarDeNovo?: () => void;
  compacto?: boolean;
  /**
   * A nova tentativa em curso. O botão vira spinner e trava: sem isto, a
   * pessoa clicava de novo porque nada acontecia, e as telas escondiam o
   * botão durante o refetch — o que parecia que ele tinha sumido.
   */
  carregando?: boolean;
  /** Tamanho do botão (pd. md). "toque" no celular/galpão. */
  tamanhoDoBotao?: TamanhoBotao;
  rotuloDoBotao?: string;
  /** `data-testid` da caixa (pd. "estado-erro"). */
  testId?: string;
  /** `data-testid` do botão (pd. "botao-tentar-de-novo"). */
  testIdDoBotao?: string;
}

export function EstadoErro({
  titulo = "Não foi possível carregar",
  detalhe,
  aoTentarDeNovo,
  compacto = false,
  carregando = false,
  tamanhoDoBotao = "md",
  rotuloDoBotao = "Tentar de novo",
  testId = "estado-erro",
  testIdDoBotao = "botao-tentar-de-novo",
}: EstadoErroProps) {
  return (
    <div
      // role="alert": a falha chega depois do render, e sem isto o leitor de
      // tela não anuncia que a lista virou erro.
      role="alert"
      data-testid={testId}
      style={{
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        gap: 8, textAlign: "center",
        padding: compacto ? "24px 20px" : "44px 24px",
        borderRadius: R.lg,
        backgroundColor: TOM.perigo.bg,
        border: `1px solid ${TOM.perigo.border}`,
      }}
    >
      <AlertTriangle aria-hidden="true" style={{ width: compacto ? 24 : 30, height: compacto ? 24 : 30, color: TOM.perigo.text }} />
      <p style={{ margin: 0, fontFamily: FONT.display, fontSize: FS.strong, fontWeight: FW.forte, color: TOM.perigo.text }}>
        {titulo}
      </p>
      {detalhe && (
        <p style={{ margin: 0, maxWidth: 460, fontSize: FS.meta, lineHeight: 1.5, color: T.apoio, wordBreak: "break-word" }}>
          {detalhe}
        </p>
      )}
      {aoTentarDeNovo && (
        <div style={{ marginTop: 6 }}>
          <Botao
            variante="secundario"
            tamanho={tamanhoDoBotao}
            icone={RotateCw}
            carregando={carregando}
            onClick={aoTentarDeNovo}
            data-testid={testIdDoBotao}
          >
            {rotuloDoBotao}
          </Botao>
        </div>
      )}
    </div>
  );
}

/** Um retângulo cinza que pulsa. A peça do esqueleto. */
function Barra({ largura, altura = 12, raio = R.sm }: { largura: number | string; altura?: number; raio?: number }) {
  return (
    <span
      aria-hidden="true"
      className="animate-pulse"
      style={{ display: "block", width: largura, height: altura, borderRadius: raio, backgroundColor: T.low }}
    />
  );
}

export interface EsqueletoProps {
  variante?: "lista" | "cartoes" | "tabela";
  /** Quantas linhas/cartões desenhar. O padrão cobre uma dobra de tela. */
  linhas?: number;
  rotulo?: string;
}

export function Esqueleto({ variante = "lista", linhas = 6, rotulo = "Carregando" }: EsqueletoProps) {
  const chaves = Array.from({ length: linhas }, (_, i) => i);

  return (
    <div role="status" aria-busy="true" aria-live="polite" data-testid={`esqueleto-${variante}`}>
      <span className="sr-only">{rotulo}…</span>

      {variante === "cartoes" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
          {chaves.map((i) => (
            <div key={i} style={{ padding: 16, borderRadius: R.lg, backgroundColor: T.surface, border: `1px solid ${T.border}`, display: "flex", flexDirection: "column", gap: 10 }}>
              <Barra largura="45%" altura={10} />
              <Barra largura="70%" altura={22} />
              <Barra largura="90%" altura={10} />
            </div>
          ))}
        </div>
      )}

      {variante === "lista" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {chaves.map((i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderRadius: R.lg, backgroundColor: T.surface, border: `1px solid ${T.border}` }}>
              <Barra largura={34} altura={34} raio={R.md} />
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 7, minWidth: 0 }}>
                {/* Larguras alternadas: linhas idênticas viram uma grade que o
                    olho lê como tabela vazia, não como carregamento. */}
                <Barra largura={i % 2 ? "52%" : "38%"} altura={12} />
                <Barra largura={i % 2 ? "30%" : "46%"} altura={10} />
              </div>
              <Barra largura={72} altura={20} raio={R.pill} />
            </div>
          ))}
        </div>
      )}

      {variante === "tabela" && (
        <div style={{ borderRadius: R.lg, overflow: "hidden", border: `1px solid ${T.border}`, backgroundColor: T.surface }}>
          <div style={{ display: "flex", gap: 16, padding: "12px 16px", backgroundColor: T.bg, borderBottom: `1px solid ${T.border}` }}>
            {[18, 30, 16, 14].map((l, i) => <Barra key={i} largura={`${l}%`} altura={9} />)}
          </div>
          {chaves.map((i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 16, padding: "16px", borderTop: i ? `1px solid ${T.border}` : undefined }}>
              {[18, 30, 16, 14].map((l, j) => <Barra key={j} largura={`${l}%`} altura={12} />)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
