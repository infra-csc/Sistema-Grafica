// A metade esquerda da faixa de DECISÃO da ficha: Liberar, Devolver e
// Reaproveitar lado a lado, a trava, para onde a peça vai, os avisos e as
// observações do item. Só props, sem hook: mora dentro do FreezeWhileClosing
// do modal e não pode redesenhar enquanto ele sai.
import { AlertCircle, Check, Lock, Recycle, RotateCcw, Unlock } from "lucide-react";
import { Botao } from "@/components/ui/botao";
import { RespostaDoEstoqueNaFicha } from "@/components/consulta-de-estoque/na-revisao";
import { SOLICITACAO_AO_ESTOQUE_ATIVA } from "@shared/consultas-de-estoque";
import { fraseDaTrava, seloDaTrava } from "@shared/trava-da-peca";
import { motivoAcaoBloqueada } from "@/lib/status";
import type { SeloPecaEventoFinalizado } from "@/lib/status";
import { T, TOM, N, FS, R } from "@/lib/theme";
import { DESLIGADO_LEGIVEL, letra } from "./estilos";
import { prontaParaLiberar, reaproveitamentoTotal } from "./regras";
import type { PecaDaRevisao } from "./tipos";

export interface FichaDecisaoProps {
  isMobile: boolean;
  dedo: boolean;
  fonteDeCampo: number;
  selectedItem: PecaDaRevisao | null;
  seloSelecionado: SeloPecaEventoFinalizado | null;
  semArquivoParaLiberar: boolean;
  liberando: boolean;
  /** O rótulo com a conta do estoque ("Confirmar e liberar · 3 + 3"), quando há proposta. */
  rotuloDaProposta: string | null;
  aoLiberar: () => void;
  aoDevolver: () => void;
  aoReaproveitar: (item: PecaDaRevisao) => void;
  reaproveitando: boolean;
  desfazendo: boolean;
  pecaDaFicha: PecaDaRevisao | null;
  fichaTravada: boolean;
  podeTravar: boolean;
  destravando: boolean;
  aoTravar: (peca: PecaDaRevisao) => void;
  aoDestravar: (peca: PecaDaRevisao) => void;
  usarMenos: number | null;
  setUsarMenos: (n: number | null) => void;
  cardObservations: string;
  setCardObservations: (v: string) => void;
  salvandoObservacao: boolean;
  aoSalvarObservacao: (itemId: string) => void;
}

/** O que os botões de decisão precisam — a ficha passa o mesmo a eles e ao rodapé. */
type PropsDosBotoes = Pick<FichaDecisaoProps,
  "isMobile" | "selectedItem" | "seloSelecionado" | "semArquivoParaLiberar" | "liberando" | "rotuloDaProposta"
  | "aoLiberar" | "aoDevolver" | "aoReaproveitar" | "reaproveitando" | "desfazendo">;

/**
 * LIBERAR, DEVOLVER e REAPROVEITAR lado a lado — a fileira do desktop, no topo
 * da faixa de decisão. No celular Liberar e Devolver moram no rodapé fixo da
 * ficha (BotoesDoRodape, no fim deste arquivo).
 */
function BotoesDaDecisao(p: PropsDosBotoes) {
  const { isMobile, seloSelecionado, semArquivoParaLiberar, liberando, rotuloDaProposta, aoLiberar, aoDevolver } = p;
  return (
    // PATCH creator-review (liberar) e PATCH return-to-arte (devolver) são
    // barradas pela guarda de evento finalizado. Ficam visíveis e
    // DESABILITADAS, com o motivo — sumi-las deixaria a ficha sem explicação
    // para a ausência. O motivo VISÍVEL mora logo abaixo (`destino-da-decisao`
    // e `aviso-ficha-evento-finalizado`); por isso estes três não levam
    // `motivo` do Botao, que embrulharia o botão num span e quebraria a
    // divisão da largura (flex: "1 1 0").
    // QUEBRA em vez de espremer (conferido ao vivo, 25/09): a 1366px a coluna
    // da decisão tem ~540px e os três na mesma linha cortavam "Liberar para
    // produção" em reticências. Liberar e Devolver ocupam ao menos o próprio
    // rótulo (base auto); se não couber, o Reaproveitar desce de linha.
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
      {/* LIBERAR é a ação principal da ficha: `primario`. Devolver é secundário. */}
      <Botao
        variante="primario"
        icone={Check}
        onClick={() => { if (!seloSelecionado) aoLiberar(); }}
        disabled={!!seloSelecionado || liberando || semArquivoParaLiberar}
        carregando={liberando}
        data-testid="button-release-modal"
        title={seloSelecionado
          ? motivoAcaoBloqueada(seloSelecionado.motivo, "liberar para produção")
          : semArquivoParaLiberar ? "Arquivo final não enviado" : ""}
        style={{ flex: "1 1 auto", minWidth: 0, height: 48, fontSize: FS.read, ...(seloSelecionado || semArquivoParaLiberar ? DESLIGADO_LEGIVEL : {}) }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
          {liberando ? "Liberando..."
            : rotuloDaProposta ? rotuloDaProposta
            : "Liberar para produção"}
        </span>
      </Botao>
      <Botao
        variante="secundario"
        icone={RotateCcw}
        onClick={() => { if (!seloSelecionado) aoDevolver(); }}
        disabled={!!seloSelecionado}
        title={seloSelecionado ? motivoAcaoBloqueada(seloSelecionado.motivo, "devolver para a Arte") : undefined}
        data-testid="button-return-toggle"
        style={{ flex: "1 1 auto", minWidth: 0, height: 48, fontSize: FS.read, ...(seloSelecionado ? DESLIGADO_LEGIVEL : {}) }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>Devolver para Arte</span>
      </Botao>
      <BotaoReaproveitar {...p} naFileira />
    </div>
  );
}

/**
 * REAPROVEITAR, aqui também: quem revisa em fila decide dentro da ficha e não
 * quer fechar, achar a linha, clicar. É o MESMO fluxo do botão da linha
 * (`aoReaproveitar`: abre total/parcial, ou desfaz a marcação) — um segundo
 * caminho para a mesma decisão faria as duas divergirem. No desktop é o
 * terceiro da fileira, mais estreito de propósito (a decisão menos
 * frequente); no celular fica no corpo, ao lado do Travar — o rodapé fixo é
 * só de Liberar e Devolver.
 */
function BotaoReaproveitar({ isMobile, selectedItem, seloSelecionado, aoReaproveitar, reaproveitando, desfazendo, naFileira }: PropsDosBotoes & { naFileira: boolean }) {
  return (
    <Botao
      variante="secundario"
      tamanho={naFileira ? undefined : "toque"}
      icone={Recycle}
      onClick={() => {
        if (seloSelecionado || !selectedItem) return;
        aoReaproveitar(selectedItem);
      }}
      disabled={!!seloSelecionado || reaproveitando}
      title={seloSelecionado
        ? motivoAcaoBloqueada(seloSelecionado.motivo, "marcar reaproveitamento")
        : selectedItem?.isReuse ? "Remover marcação de reaproveitamento" : "Reaproveitar — total ou parte das unidades, sem nova produção"}
      aria-label={selectedItem?.isReuse ? "Remover marcação de reaproveitamento" : "Reaproveitar"}
      aria-pressed={!!selectedItem?.isReuse}
      data-testid="button-reuse-modal"
      style={{
        ...(naFileira
          ? { flex: isMobile ? "1 1 100%" : "0 0 auto", height: 48, padding: "0 16px", fontSize: FS.read }
          : { flex: "1 1 0%", minWidth: 0 }),
        // Marcada, o verde do reaproveitamento (#15803d sobre #dcfce7 = 4,6:1).
        ...(selectedItem?.isReuse && !seloSelecionado
          ? { border: `1px solid ${TOM.sucesso.border}`, backgroundColor: TOM.sucesso.bg, color: TOM.sucesso.text }
          : seloSelecionado ? DESLIGADO_LEGIVEL : {}),
      }}
    >
      {selectedItem && desfazendo ? "Desfazendo…" : selectedItem?.isReuse ? "Reaproveitada · desfazer" : "Reaproveitar"}
    </Botao>
  );
}

export function FichaDecisao(p: FichaDecisaoProps & { botoesNoRodape?: boolean; empilhado?: boolean }) {
  const {
    isMobile, dedo, fonteDeCampo, selectedItem, seloSelecionado,
    pecaDaFicha, fichaTravada, podeTravar, destravando, aoTravar, aoDestravar,
    usarMenos, setUsarMenos, cardObservations, setCardObservations, salvandoObservacao, aoSalvarObservacao,
    botoesNoRodape = false, empilhado = isMobile,
  } = p;
  return (
    // NO CELULAR sem teto nem rolagem própria: o corpo da ficha já rola, e
    // uma caixa rolando dentro de outra prendia o dedo (a lista parava no
    // meio e a página não descia).
    // EMPILHADA (celular e tablet) sem base zero: numa coluna de altura
    // automática, "1 1 0" com minHeight 0 pode colapsar a caixa.
    <div style={{ flex: empilhado ? undefined : "1 1 0", minWidth: 0, minHeight: 0, maxHeight: isMobile ? undefined : "32vh", overflowY: isMobile ? undefined : "auto", display: "flex", flexDirection: "column", gap: 10 }}>
      {botoesNoRodape ? (
        // O Liberar e o Devolver estão no rodapé fixo; aqui ficam as duas
        // ações de apoio, lado a lado.
        <div style={{ display: "flex", gap: 8 }}>
          <BotaoReaproveitar {...p} naFileira={false} />
          {pecaDaFicha && !fichaTravada && podeTravar && !seloSelecionado && (
            <Botao
              variante="secundario"
              tamanho="toque"
              icone={Lock}
              onClick={() => aoTravar(pecaDaFicha)}
              data-testid="button-travar-revisao"
              title="Travar a peça: mesmo liberada, a Gráfica não consegue fazê-la andar até alguém da Solicitação destravar"
              style={{ flex: "1 1 0%", minWidth: 0, color: TOM.perigo.text }}
            >
              Travar
            </Botao>
          )}
        </div>
      ) : <BotoesDaDecisao {...p} />}
      {/* A TRAVA DA SOLICITAÇÃO, também aqui: travada, o selo com o motivo e
          o Destravar; livre, o Travar (com motivo) — as mesmas rotas e o
          mesmo texto da Gráfica. */}
      {pecaDaFicha && (fichaTravada ? (
        <div role="status" data-testid="selo-travada-revisao" title={fraseDaTrava(pecaDaFicha)} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "6px 10px", borderRadius: R.md, background: TOM.perigo.text, color: T.surface, fontSize: FS.meta, fontWeight: 700, lineHeight: 1.4 }}>
          <Lock aria-hidden="true" style={{ width: 13, height: 13, flexShrink: 0 }} />
          <span style={{ flex: "1 1 160px", minWidth: 0, overflowWrap: "anywhere" }}>{seloDaTrava(pecaDaFicha)}</span>
          {podeTravar && (
            <Botao
              variante="perigoSecundario"
              tamanho={dedo || isMobile ? "toque" : "sm"}
              icone={Unlock}
              carregando={destravando}
              onClick={() => aoDestravar(pecaDaFicha)}
              data-testid="button-destravar-revisao"
            >
              {destravando ? "Destravando…" : "Destravar"}
            </Botao>
          )}
        </div>
      ) : podeTravar && !seloSelecionado && !botoesNoRodape ? (
        <Botao
          variante="secundario"
          tamanho={dedo || isMobile ? "toque" : "sm"}
          icone={Lock}
          onClick={() => aoTravar(pecaDaFicha)}
          data-testid="button-travar-revisao"
          title="Travar a peça: mesmo liberada, a Gráfica não consegue fazê-la andar até alguém da Solicitação destravar"
          style={{ alignSelf: "flex-start", color: TOM.perigo.text }}
        >
          Travar
        </Botao>
      ) : null)}
      {/* PARA ONDE A PEÇA VAI, dito ANTES do clique: o rótulo do botão diz a
          ação, esta linha diz o destino. Sem arquivo final, o porquê do
          Liberar travado deixa de morar só no `title`, que não aparece em
          botão desabilitado nem no toque. Em evento finalizado o aviso cinza
          abaixo já explica. */}
      {SOLICITACAO_AO_ESTOQUE_ATIVA && selectedItem && (
        <RespostaDoEstoqueNaFicha item={selectedItem} usar={usarMenos} onUsar={setUsarMenos} />
      )}
      {!seloSelecionado && selectedItem && (
        <p data-testid="destino-da-decisao" style={{ margin: 0, fontSize: FS.meta, lineHeight: 1.5, color: T.apoio }}>
          {prontaParaLiberar(selectedItem) ? (
            <>
              <strong style={{ color: T.text }}>Liberar</strong>: {reaproveitamentoTotal(selectedItem)
                ? "sai da Revisão Final e vai direto para Impresso / Acabamento (reaproveitamento total, sem impressão)."
                : "sai da Revisão Final e entra na fila da Gráfica como Pronto para Produção."}{" "}
              <strong style={{ color: T.text }}>Devolver</strong>: volta para a Arte, que é avisada com o seu motivo.
            </>
          ) : (
            <>
              <strong style={{ color: TOM.alerta.text }}>Liberar fica disponível quando a Arte enviar o arquivo final.</strong>{" "}
              Dá para devolver agora, se algo já precisa mudar.
            </>
          )}
        </p>
      )}
      {seloSelecionado && (
        <p
          role="status"
          data-testid="aviso-ficha-evento-finalizado"
          style={{ margin: 0, fontSize: FS.meta, lineHeight: 1.5, color: T.strong, backgroundColor: N.n2, border: `1px solid ${T.border}`, borderRadius: R.md, padding: "8px 12px" }}
        >
          <strong style={{ color: T.text }}>{seloSelecionado.label}.</strong>{" "}
          {seloSelecionado.hint}{" "}
          Nesta peça continua liberado apenas excluir.
        </p>
      )}
      {selectedItem?.isReuse && (
        <p style={{ margin: 0, fontSize: letra(FS.small, isMobile), lineHeight: 1.5, color: TOM.sucesso.text, backgroundColor: TOM.sucesso.bg, border: `1px solid ${TOM.sucesso.border}`, borderRadius: R.md, padding: "8px 12px", display: "flex", alignItems: "center", gap: 8 }}>
          <Recycle style={{ width: 14, height: 14, flexShrink: 0 }} />
          <span>Peça de reaproveitamento — não será enviada para nova produção gráfica. Verifique o arquivo e libere normalmente.</span>
        </p>
      )}

      {/* Observações do item — campo próprio, sempre editável. Existe para
          anotar sem ter de devolver a peça. */}
      <div style={{ backgroundColor: TOM.alerta.bg, border: `1px solid ${TOM.alerta.border}`, borderRadius: R.md, padding: "10px 12px", display: "flex", gap: 8 }}>
        <AlertCircle style={{ width: 14, height: 14, color: TOM.alerta.text, flexShrink: 0, marginTop: 2 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* "Salvar observação libera a peça?" — não. A frase curta separa o
              recado da decisão, que é o que o bloco existe para permitir. */}
          <p style={{ fontSize: letra(FS.small, isMobile), fontWeight: 700, color: TOM.alerta.text, margin: "0 0 6px" }}>
            Observações do item <span style={{ fontWeight: 500 }}>· fica gravada na peça, sem liberar nem devolver</span>
          </p>
          <textarea
            placeholder="Deixe um recado sobre esta peça (cor, acabamento, posição...)"
            value={cardObservations}
            onChange={e => setCardObservations(e.target.value)}
            data-testid="textarea-item-observations"
            style={{
              width: "100%", minHeight: 48, padding: "8px 10px", borderRadius: R.sm,
              border: `1px solid ${TOM.alerta.border}`, backgroundColor: TOM.alerta.bg,
              color: TOM.alerta.text, fontSize: fonteDeCampo, resize: "vertical",
              fontFamily: "inherit", boxSizing: "border-box",
            }}
          />
          {cardObservations !== (selectedItem?.observations || "") && (
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              {/* Salvar observação é PATCH /api/items/:id, a mesma rota (e a
                  mesma guarda) da edição de quantidade. */}
              <Botao
                variante="primario"
                tamanho={dedo || isMobile ? "toque" : "sm"}
                carregando={salvandoObservacao}
                onClick={() => { if (!seloSelecionado && selectedItem) aoSalvarObservacao(selectedItem.id); }}
                disabled={!!seloSelecionado || salvandoObservacao}
                title={seloSelecionado ? motivoAcaoBloqueada(seloSelecionado.motivo, "salvar a observação") : undefined}
                motivo={seloSelecionado ? motivoAcaoBloqueada(seloSelecionado.motivo, "salvar a observação") : undefined}
                data-testid="button-save-observations"
              >
                {salvandoObservacao ? "Salvando..." : "Salvar observação"}
              </Botao>
              <Botao
                variante="fantasma"
                tamanho={dedo || isMobile ? "toque" : "sm"}
                onClick={() => setCardObservations(selectedItem?.observations || "")}
                style={{ color: TOM.alerta.text }}
              >
                Descartar
              </Botao>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * LIBERAR e DEVOLVER NO RODAPÉ FIXO DA FICHA (celular, 25/09). No corpo,
 * depois dos dois arquivos e da tira de metadados, ficavam a ~700px de rolagem
 * numa tela de 640 — a decisão que a tela existe para tomar, abaixo da dobra.
 * Rótulos curtos ("Liberar", "Devolver"): a frase do destino, no corpo, diz
 * para onde a peça vai; e o porquê do botão apagado sobe para uma linha LOGO
 * ACIMA dele (o `title` não existe no toque). O Reaproveitar fica no corpo.
 */
export function BotoesDoRodape(p: PropsDosBotoes) {
  const { selectedItem, seloSelecionado, semArquivoParaLiberar, liberando, rotuloDaProposta, aoLiberar, aoDevolver } = p;
  const liberarApagado = !!seloSelecionado || semArquivoParaLiberar;
  return (
    <>
      {(seloSelecionado || (semArquivoParaLiberar && selectedItem)) && (
        <p data-testid="motivo-no-rodape" style={{ margin: "0 0 8px", fontSize: FS.meta, lineHeight: 1.4, fontWeight: 600, color: seloSelecionado ? T.strong : TOM.alerta.text }}>
          {seloSelecionado
            ? `${seloSelecionado.label}: liberar e devolver estão bloqueados.`
            : "Liberar espera o arquivo final da Arte. Dá para devolver agora."}
        </p>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <Botao
          variante="secundario"
          tamanho="toque"
          icone={RotateCcw}
          onClick={() => { if (!seloSelecionado) aoDevolver(); }}
          disabled={!!seloSelecionado}
          data-testid="button-return-toggle"
          style={{ flex: "1 1 0%", minWidth: 0, minHeight: 48, ...(seloSelecionado ? DESLIGADO_LEGIVEL : {}) }}
        >
          Devolver
        </Botao>
        <Botao
          variante="primario"
          tamanho="toque"
          icone={Check}
          onClick={() => { if (!seloSelecionado) aoLiberar(); }}
          disabled={liberarApagado || liberando}
          carregando={liberando}
          data-testid="button-release-modal"
          style={{ flex: "1.4 1 0%", minWidth: 0, minHeight: 48, ...(liberarApagado ? DESLIGADO_LEGIVEL : {}) }}
        >
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {liberando ? "Liberando..." : rotuloDaProposta ? rotuloDaProposta : "Liberar"}
          </span>
        </Botao>
      </div>
    </>
  );
}
