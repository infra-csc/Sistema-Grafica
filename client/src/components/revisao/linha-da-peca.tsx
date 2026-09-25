// A LINHA de uma peça na tabela da Revisão Final (com o subtítulo de grupo e
// de tipo que a precede, quando muda). Memoizada: com dezenas de linhas,
// digitar na busca ou marcar outra peça não redesenha as que não mudaram. Por
// isso as ações chegam como funções estáveis (useCallback na página) e tudo o
// que muda por peça chega já resolvido (selo, estoque, falha, desfazendo).
import { Fragment, memo } from "react";
import { Check, Clock, Paperclip, Recycle, Trash2 } from "lucide-react";
import { SeloKit } from "@/components/kit/selo-kit";
import { SeloPrazoMolde } from "@/components/prazo-do-molde";
import { SeloDoEstoqueNaLinha } from "@/components/consulta-de-estoque/na-revisao";
import type { EstoqueDaLinha } from "@/components/consulta-de-estoque/na-revisao";
import { Botao } from "@/components/ui/botao";
import { Selo } from "@/components/ui/selo";
import { alvo } from "@/hooks/use-mobile";
import { ehMolde } from "@shared/molde";
import { hrefSeguro } from "@shared/url-segura";
import { motivoAcaoBloqueada } from "@/lib/status";
import type { SeloPecaEventoFinalizado } from "@/lib/status";
import { T, TOM, N, FS, R, FONT } from "@/lib/theme";
import { TI, medidaDaPeca } from "./regras";
import { DESLIGADO_LEGIVEL } from "./estilos";
import { FalhaNaLinha, SeloTravaNaLinha } from "./selos-da-linha";
import type { PecaDaRevisao } from "./tipos";

export interface LinhaDaPecaProps {
  item: PecaDaRevisao;
  selecionada: boolean;
  selo: SeloPecaEventoFinalizado | null;
  ultima: boolean;
  /** Subtítulo do tipo antes da linha (o tipo mudou em relação à anterior). */
  mostraTipo: boolean;
  /** Subtítulo do grupo do item padrão antes da linha ("" = nenhum). */
  grupo: string;
  compacto: boolean;
  colunasDeDados: number;
  estoque: EstoqueDaLinha | undefined;
  falha: string | undefined;
  desfazendo: boolean;
  dedo: boolean;
  admin: boolean;
  /**
   * O relógio da página, ao minuto (useRelogioDoMinuto). Os selos que dependem
   * da HORA (a idade da trava, o dia do prazo do molde) leem daqui — lendo
   * Date.now() dentro da linha memoizada, congelavam no último desenho.
   */
  agora: number;
  aoAbrir: (item: PecaDaRevisao) => void;
  aoMarcar: (id: string) => void;
  aoReaproveitar: (item: PecaDaRevisao) => void;
  aoExcluir: (id: string) => void;
}

export const LinhaDaPeca = memo(function LinhaDaPeca({
  item, selecionada: isSelected, selo, ultima: isLast, mostraTipo, grupo, compacto, colunasDeDados,
  estoque, falha, desfazendo, dedo, admin, agora, aoAbrir, aoMarcar, aoReaproveitar, aoExcluir,
}: LinhaDaPecaProps) {
  return (
    <Fragment>
      {grupo !== '' && (
        <tr style={{ backgroundColor: TOM.info.border }}>
          <td colSpan={colunasDeDados + 1} style={{ padding: '5px 16px' }}>
            <span style={{ fontSize: FS.micro, fontWeight: 800, color: TOM.info.text, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{grupo}</span>
          </td>
        </tr>
      )}
      {mostraTipo && (
        <tr style={{ backgroundColor: N.n3 }}>
          <td colSpan={colunasDeDados + 1} style={{ padding: '5px 16px' }}>
            <span style={{ fontSize: FS.micro, fontWeight: 700, color: T.apoio, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{item.type}</span>
          </td>
        </tr>
      )}
    <tr
      key={`row-${item.id}`}
      data-testid={`row-item-${item.id}`}
      style={{
        borderBottom: isLast ? "none" : `1px solid ${N.n3}`,
        backgroundColor: isSelected ? TOM.laranja.bg : T.surface,
        transition: "background-color 0.1s",
        cursor: "pointer",
      }}
      onClick={() => aoAbrir(item)}
      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.backgroundColor = T.bg; }}
      onMouseLeave={e => { e.currentTarget.style.backgroundColor = isSelected ? TOM.laranja.bg : T.surface; }}
    >
      {/* Checkbox. `stopPropagation` no <td>: a linha inteira abre o modal,
          e marcar para o lote não é pedir a ficha. */}
      <td onClick={e => e.stopPropagation()} style={{ padding: "14px 24px", textAlign: "center" }}>
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => aoMarcar(item.id)}
          aria-label={`Selecionar ${item.displayId}`}
          data-testid={`checkbox-item-${item.id}`}
          style={{ accentColor: T.accent, width: 20, height: 20, cursor: "pointer" }}
        />
      </td>

      {/* ── Peça: ID · Tipo · Descrição ──
          Identificam a MESMA peça: juntas, lêem-se como uma frase — e a
          largura que sobra vai para a coluna do arquivo final. */}
      <td style={{ padding: "12px 16px", minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "4px 8px", minWidth: 0 }}>
          <span
            data-testid={`text-display-id-${item.id}`}
            style={{ fontFamily: FONT.mono, fontSize: FS.meta, fontWeight: 700, color: T.accentText, flexShrink: 0, whiteSpace: "nowrap" }}
          >
            {item.displayId}
          </span>
          <SeloKit peca={item} style={{ flexShrink: 0 }} />
          <span style={{ fontSize: FS.body, fontWeight: 700, color: TI.text, minWidth: 0, overflowWrap: "anywhere" }}>
            {item.type}
          </span>
          {item.description && (
            // flexShrink alto: falta largura, a descrição é que cede. Cede em
            // DUAS LINHAS, não em reticências — cortada numa, o texto só
            // existia no `title`, que o toque não mostra.
            <span title={item.description} style={{ fontSize: FS.meta, color: T.apoio, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", overflowWrap: "anywhere", flexShrink: 999, minWidth: 0 }}>
              {item.description}
            </span>
          )}

          {/* MARCADORES COMO ÍCONE: o que dizem é binário, e pílulas com texto
              disputavam a leitura com a descrição. */}
          {item.referenceUrl && (
            <a
              href={hrefSeguro(item.referenceUrl)} target="_blank" rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              title="Ver a referência visual do solicitante"
              aria-label={`Referência visual de ${item.displayId}`}
              data-testid={`link-reference-solicitacao-${item.id}`}
              // Alvo de 24 no mouse e 44 no toque — era o ícone de 13px cru.
              style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: alvo(24, dedo), minHeight: alvo(24, dedo), margin: dedo ? 0 : "-4px -2px", borderRadius: R.sm, color: TOM.info.text, flexShrink: 0 }}
            >
              <Paperclip aria-hidden="true" style={{ width: 14, height: 14 }} />
            </a>
          )}
          {item.isReuse && (
            <span title="Reaproveitamento" aria-label="Reaproveitamento" style={{ display: "inline-flex", color: TOM.sucesso.text, flexShrink: 0 }}>
              <Recycle aria-hidden="true" style={{ width: 13, height: 13 }} />
            </span>
          )}
          <SeloDoEstoqueNaLinha linha={estoque} />
          {/* EVENTO FINALIZADO — sem este selo, a linha mostra "Revisar" e
              dois botões apagados sem dizer por quê. */}
          {selo && (
            <Selo
              data-testid={`badge-evento-finalizado-${item.id}`}
              title={selo.hint}
              cores={selo}
              ponto
              tamanho="sm"
              style={{ flexShrink: 0 }}
            >
              {selo.label}
            </Selo>
          )}
          <SeloTravaNaLinha item={item} onde="tabela" agora={agora} />
          {/* COMPACTO: a medida desce para uma segunda linha aqui dentro, em
              vez de ocupar coluna própria. */}
          {compacto && (
            <span data-testid={`medida-fundida-${item.id}`} style={{ flexBasis: "100%", fontFamily: FONT.mono, fontSize: FS.meta, color: T.apoio }}>
              {medidaDaPeca(item)}
            </span>
          )}
          <FalhaNaLinha itemId={item.id} falha={falha} />
        </div>
      </td>

      {/* ── Qtd · Dim · m² ──
          A mesma medida contada de três jeitos, numa coluna. Em DM Mono os
          números de linhas vizinhas se alinham e dá para comparar de relance. */}
      {!compacto && (
        <td style={{ padding: "12px 16px", whiteSpace: "nowrap" }}>
          <span style={{ fontFamily: FONT.mono, fontSize: FS.meta, color: T.apoio }}>
            {medidaDaPeca(item)}
          </span>
        </td>
      )}

      {/* ── Arquivo final ──
          A informação que decide se a peça é revisável, à vista na fila em vez
          de escondida atrás de um clique. O "de quem depende" (a Arte) vai no
          title: a coluna tem 140px e "Aguardando Arte" não cabe. */}
      <td data-testid={`cell-final-file-${item.id}`} style={{ padding: "12px 16px", whiteSpace: "nowrap" }}>
        {ehMolde(item) ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
            <Selo title="Molde não tem arquivo final — libera só com o thumb" cores={{ bg: N.n2, border: T.bdark, text: T.strong }}>
              Não se aplica
            </Selo>
            {/* Prazo do molde: só o fluxo do molde o lê. */}
            <SeloPrazoMolde item={item} hoje={new Date(agora)} />
          </div>
        ) : item.finalFileUrl ? (
          <Selo tom="sucesso" icone={Check}>Recebido</Selo>
        ) : (
          <Selo tom="laranja" icone={Clock} title="A Arte ainda não enviou o arquivo final — dá para abrir e devolver, mas liberar só depois do arquivo.">Aguardando</Selo>
        )}
      </td>

      {/* Ação */}
      <td onClick={e => e.stopPropagation()} style={{ padding: "12px 16px", textAlign: "right" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
          {/* Caixa normal: maiúsculas espaçadas repetidas em cada linha
              gritavam mais que a peça. E secundário FORTE, não primário
              (25/09): uma coluna de 30 botões pretos iguais competia com a
              peça e com o "Revisar em fila" do topo — a principal da tela. A
              linha inteira já abre a ficha; o botão é a porta explícita. */}
          <Botao
            variante="secundarioForte"
            tamanho={dedo ? "toque" : "sm"}
            onClick={() => aoAbrir(item)}
            data-testid={`button-review-${item.id}`}
          >
            Revisar
          </Botao>
          {/* Reaproveitamento passa por PATCH /api/items/:id (isReuse) e por
              creator-review: as duas rotas são barradas em evento finalizado.
              <Botao> (e não <button> com onMouseEnter trocando a cor): o
              hover e o foco por teclado vêm da classe da casa. O verde é a
              identidade do reaproveitamento; em evento finalizado, o cinza
              legível das decisões da ficha. */}
          <Botao
            variante="fantasma"
            tamanho={dedo ? "toque" : "sm"}
            icone={Recycle}
            tamanhoDoIcone={15}
            onClick={() => {
              if (selo) return;
              // Marcada: desfazer pede confirmação. Não marcada: escolher total ou parcial.
              aoReaproveitar(item);
            }}
            disabled={!!selo || desfazendo}
            data-testid={`button-reuse-${item.id}`}
            aria-label={`Reaproveitamento de ${item.displayId}`}
            aria-pressed={!!item.isReuse}
            title={selo
              ? motivoAcaoBloqueada(selo.motivo, "marcar reaproveitamento")
              : item.isReuse ? "Remover marcação de reaproveitamento" : "Marcar para reaproveitamento"}
            style={{
              width: alvo(32, dedo), padding: 0, flexShrink: 0,
              ...(selo ? DESLIGADO_LEGIVEL
                : item.isReuse ? { color: TOM.sucesso.text, backgroundColor: TOM.sucesso.bg, border: `1px solid ${TOM.sucesso.border}` }
                : { color: TOM.sucesso.text }),
            }}
          />
          {/* Toda peça desta tela está em awaiting_final_review — status
              TRAVADO para "solicitacao" no DELETE do servidor. Mostrar a
              lixeira para esse perfil só rendia um 403. */}
          {admin && (
            <Botao
              variante="fantasma"
              tamanho={dedo ? "toque" : "sm"}
              icone={Trash2}
              tamanhoDoIcone={15}
              onClick={() => aoExcluir(item.id)}
              data-testid={`button-delete-${item.id}`}
              title="Excluir peça"
              aria-label={`Excluir a peça ${item.displayId}`}
              style={{ width: alvo(32, dedo), padding: 0, flexShrink: 0, color: TOM.perigo.text }}
            />
          )}
        </div>
      </td>
    </tr>
    </Fragment>
  );
});
