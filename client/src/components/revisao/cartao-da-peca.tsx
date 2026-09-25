// O CARTÃO de uma peça — a lista em cartões vale abaixo de 820px de área útil
// (celular e notebook estreito). Memoizado: com dezenas de peças, digitar na
// busca ou marcar uma linha não redesenha os cartões que não mudaram. Por isso
// as ações chegam como funções estáveis (useCallback na página) e tudo o que
// muda por peça chega já resolvido (selo, estoque, falha, desfazendo).
import { memo } from "react";
import { Check, ChevronRight, Clock, Recycle, Trash2 } from "lucide-react";
import { SeloKit } from "@/components/kit/selo-kit";
import { SeloPrazoMolde } from "@/components/prazo-do-molde";
import { SeloDoEstoqueNaLinha } from "@/components/consulta-de-estoque/na-revisao";
import type { EstoqueDaLinha } from "@/components/consulta-de-estoque/na-revisao";
import { Botao } from "@/components/ui/botao";
import { Selo } from "@/components/ui/selo";
import { ehMolde } from "@shared/molde";
import { motivoAcaoBloqueada } from "@/lib/status";
import type { SeloPecaEventoFinalizado } from "@/lib/status";
import { T, TOM, N, FS, R, FONT } from "@/lib/theme";
import { FalhaNaLinha, SeloTravaNaLinha } from "./selos-da-linha";
import { medidaDaPeca } from "./regras";
import type { PecaDaRevisao } from "./tipos";
import { DESLIGADO_LEGIVEL } from "./estilos";

/** O Selo comum escreve em 11px; no cartão (a lista do celular) o piso é 12. */
const LETRA_DO_SELO = { fontSize: FS.meta } as const;

export interface CartaoDaPecaProps {
  item: PecaDaRevisao;
  selecionada: boolean;
  selo: SeloPecaEventoFinalizado | null;
  estoque: EstoqueDaLinha | undefined;
  falha: string | undefined;
  desfazendo: boolean;
  dedo: boolean;
  admin: boolean;
  /** O relógio da página, ao minuto — ver LinhaDaPecaProps.agora. */
  agora: number;
  aoAbrir: (item: PecaDaRevisao) => void;
  aoMarcar: (id: string) => void;
  aoReaproveitar: (item: PecaDaRevisao) => void;
  aoExcluir: (id: string) => void;
}

export const CartaoDaPeca = memo(function CartaoDaPeca({
  item, selecionada, selo, estoque, falha, desfazendo, dedo, admin, agora, aoAbrir, aoMarcar, aoReaproveitar, aoExcluir,
}: CartaoDaPecaProps) {
  // O checkbox fica FORA do alvo role="button" (checkbox aninhado em botão é
  // estrutura inválida para leitor de tela); o corpo do cartão segue abrindo
  // o modal por toque, Enter e Espaço.
  return (
    <div style={{position:"relative",backgroundColor:T.surface,border:`1px solid ${T.border}`,borderRadius:R.md,marginBottom:8}}>
      {/* ALVO de 44, CAIXA de 20. Este checkbox é a única porta para as ações
          em lote no celular: quem cresce é o <label>, transparente, que
          encaminha o toque para o input — não a caixa. */}
      <label
        style={{position:"absolute",top:0,right:0,width:44,height:44,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",zIndex:1}}
      >
        <input
          type="checkbox"
          checked={selecionada}
          onChange={()=>aoMarcar(item.id)}
          aria-label={`Selecionar ${item.displayId}`}
          style={{accentColor:T.accent,width:20,height:20,cursor:"pointer"}}
        />
      </label>
      <div
        role="button"
        tabIndex={0}
        aria-label={`Revisar peça ${item.displayId}`}
        // Mesmo testid do botão da tabela: é a mesma ação, e só um dos dois
        // layouts existe por vez (a escolha depende da largura medida).
        data-testid={`button-review-${item.id}`}
        onKeyDown={e => { if (e.target !== e.currentTarget) return; if (e.key === "Enter" || e.key === " ") { e.preventDefault(); aoAbrir(item); } }}
        onClick={() => aoAbrir(item)}
        style={{padding:"12px",cursor:"pointer",display:"flex",flexDirection:"column",gap:6}}>
        <div style={{display:"flex",justifyContent:"flex-start",alignItems:"center",gap:6,flexWrap:"wrap",paddingRight:44}}>
          <span style={{fontFamily:FONT.mono,fontWeight:700,color:T.accentText,fontSize:FS.body}}>{item.displayId}</span>
          <SeloKit peca={item} />
          <SeloDoEstoqueNaLinha linha={estoque} />
          {/* EVENTO FINALIZADO — a peça continua na fila, então tem de se
              declarar. Aqui quase nada funciona: só excluir. */}
          {selo && (
            <Selo
              data-testid={`badge-evento-finalizado-mobile-${item.id}`}
              title={selo.hint}
              cores={selo}
              ponto
              tamanho="sm"
              forma="retangulo"
            >
              {selo.label}
            </Selo>
          )}
          <SeloTravaNaLinha item={item} onde="cartao" agora={agora} />
        </div>
        <div style={{minWidth:0}}>
          <span style={{fontSize:FS.strong,fontWeight:700,color:T.text,overflowWrap:"anywhere"}}>{item.type}</span>
          {item.description && <p style={{fontSize:FS.body,color:T.apoio,margin:"2px 0 0",overflowWrap:"anywhere"}}>{item.description}</p>}
          {/* A MEDIDA, como na coluna "Qtd · Dim · m²" da tabela. Era só um
              "2×" de 10px cinza à direita — ilegível no celular e sem a
              dimensão, que é o que se confere contra o arquivo. */}
          <p data-testid={`medida-cartao-${item.id}`} style={{fontFamily:FONT.mono,fontSize:FS.meta,color:T.apoio,margin:"4px 0 0"}}>{medidaDaPeca(item)}</p>
        </div>
        {/* O ARQUIVO FINAL também no cartão: na tabela ele tem coluna própria
            (decide se a peça é revisável); aqui só se descobriria abrindo a
            ficha. Letra de 12 (o Selo comum tem 11). */}
        <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
          {ehMolde(item) ? (
            <>
              <Selo data-testid={`chip-arquivo-mobile-${item.id}`} title="Molde não tem arquivo final — libera só com o thumb" cores={{ bg: N.n2, border: T.bdark, text: T.strong }} style={LETRA_DO_SELO}>
                Molde · sem arquivo final
              </Selo>
              {/* Prazo do molde: só o fluxo do molde o lê. */}
              <SeloPrazoMolde item={item} hoje={new Date(agora)} />
            </>
          ) : item.finalFileUrl ? (
            <Selo data-testid={`chip-arquivo-mobile-${item.id}`} tom="sucesso" icone={Check} style={LETRA_DO_SELO}>
              Arquivo recebido
            </Selo>
          ) : (
            <Selo data-testid={`chip-arquivo-mobile-${item.id}`} tom="laranja" icone={Clock} style={LETRA_DO_SELO}>
              Aguardando arquivo
            </Selo>
          )}
          {item.sponsors?.map((s)=><Selo key={s.id} forma="retangulo" cores={{ bg: N.n2, border: N.n2, text: T.apoio }} style={LETRA_DO_SELO}>{s.name}</Selo>)}
        </div>
        <FalhaNaLinha itemId={item.id} falha={falha} />
      </div>
      {/* AS AÇÕES DO CARTÃO, numa linha previsível (o padrão da Gráfica):
          REVISAR é a principal e vem primeiro, cheia — antes o cartão não
          tinha botão nenhum dizendo o que fazer (só o toque no corpo, que
          ninguém adivinha), e as duas ações à vista eram as secundárias.
          Reaproveitar divide a linha; Excluir (só admin) é o ícone no fim.
          Ficam FORA do alvo role="button" da revisão (interativo aninhado
          em botão é estrutura inválida) e com os mesmos testids da tabela:
          os dois layouts nunca coexistem. Excluir: mesmo gate de papel da
          tabela (o DELETE trava "solicitacao" nesse status). Reaproveitar,
          em evento finalizado, fica visível e travado, com o motivo escrito
          no selo de evento finalizado acima. */}
      <div style={{display:"flex",alignItems:"stretch",gap:8,padding:"0 12px 12px"}}>
        <Botao
          variante="primario"
          tamanho="toque"
          onClick={() => aoAbrir(item)}
          data-testid={`button-revisar-cartao-${item.id}`}
          aria-label={`Revisar a peça ${item.displayId}`}
          style={{ flex: "1 1 0%", minWidth: 0 }}
        >
          Revisar
          <ChevronRight aria-hidden="true" style={{ width: 16, height: 16, marginLeft: 2 }} />
        </Botao>
        <Botao
          variante="secundario"
          tamanho="toque"
          icone={Recycle}
          onClick={() => {
            if (selo) return;
            aoReaproveitar(item);
          }}
          disabled={!!selo || desfazendo}
          data-testid={`button-reuse-${item.id}`}
          aria-pressed={!!item.isReuse}
          title={selo ? motivoAcaoBloqueada(selo.motivo, "marcar reaproveitamento") : undefined}
          // O verde é a identidade do reaproveitamento na tela. Em evento
          // finalizado, o cinza legível das decisões da ficha.
          style={{ flex: "1 1 0%", minWidth: 0, whiteSpace: "normal", lineHeight: 1.15, textAlign: "center",
            ...(selo ? DESLIGADO_LEGIVEL : item.isReuse
              ? { color: TOM.sucesso.text, backgroundColor: TOM.sucesso.bg, border: `1px solid ${TOM.sucesso.border}` }
              : { color: TOM.sucesso.text, border: `1px solid ${TOM.sucesso.border}` }) }}
        >
          {desfazendo ? "Desfazendo…" : item.isReuse ? "Reaproveitada · desfazer" : "Reaproveitar"}
        </Botao>
        {admin && (
          <Botao
            variante="perigoSecundario"
            tamanho="toque"
            icone={Trash2}
            tamanhoDoIcone={16}
            onClick={() => aoExcluir(item.id)}
            data-testid={`button-delete-${item.id}`}
            title="Excluir peça"
            aria-label={`Excluir a peça ${item.displayId}`}
            style={{ flex: "0 0 44px", width: 44, padding: 0 }}
          />
        )}
      </div>
    </div>
  );
});
