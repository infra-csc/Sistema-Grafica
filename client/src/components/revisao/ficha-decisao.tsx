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
import { DESLIGADO_LEGIVEL } from "./estilos";
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

export function FichaDecisao({
  isMobile, dedo, fonteDeCampo, selectedItem, seloSelecionado, semArquivoParaLiberar, liberando, rotuloDaProposta,
  aoLiberar, aoDevolver, aoReaproveitar, reaproveitando, desfazendo,
  pecaDaFicha, fichaTravada, podeTravar, destravando, aoTravar, aoDestravar,
  usarMenos, setUsarMenos, cardObservations, setCardObservations, salvandoObservacao, aoSalvarObservacao,
}: FichaDecisaoProps) {
  return (
    <div style={{ flex: isMobile ? undefined : "1 1 0", minWidth: 0, minHeight: 0, maxHeight: isMobile ? "34vh" : "32vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
      {/* PATCH creator-review (liberar) e PATCH return-to-arte (devolver) são
          barradas pela guarda de evento finalizado. Ficam visíveis e
          DESABILITADAS, com o motivo — sumi-las deixaria a ficha sem
          explicação para a ausência. O motivo VISÍVEL mora logo abaixo
          (`destino-da-decisao` e `aviso-ficha-evento-finalizado`); por isso
          estes três não levam `motivo` do Botao, que embrulharia o botão num
          span e quebraria a divisão da largura (flex: "1 1 0"). */}
      <div style={{ display: "flex", gap: 10, flexWrap: isMobile ? "wrap" : "nowrap" }}>
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
          style={{ flex: "1 1 0", minWidth: 0, height: 48, fontSize: FS.read, ...(seloSelecionado || semArquivoParaLiberar ? DESLIGADO_LEGIVEL : {}) }}
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
          style={{ flex: "1 1 0", minWidth: 0, height: 48, fontSize: FS.read, ...(seloSelecionado ? DESLIGADO_LEGIVEL : {}) }}
        >
          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>Devolver para Arte</span>
        </Botao>
        {/* REAPROVEITAR, aqui também: quem revisa em fila decide dentro da
            ficha e não quer fechar, achar a linha, clicar. É o MESMO fluxo do
            botão da linha (`aoReaproveitar`: abre total/parcial, ou desfaz a
            marcação) — um segundo caminho para a mesma decisão faria as duas
            divergirem. Terceiro e mais estreito de propósito: é a decisão
            menos frequente, e os dois primeiros não podem perder largura. */}
        <Botao
          variante="secundario"
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
            flex: isMobile ? "1 1 100%" : "0 0 auto", height: 48, padding: "0 16px", fontSize: FS.read,
            // Marcada, o verde do reaproveitamento (#15803d sobre #dcfce7 = 4,6:1).
            ...(selectedItem?.isReuse && !seloSelecionado
              ? { border: `1px solid ${TOM.sucesso.border}`, backgroundColor: TOM.sucesso.bg, color: TOM.sucesso.text }
              : seloSelecionado ? DESLIGADO_LEGIVEL : {}),
          }}
        >
          {selectedItem && desfazendo ? "Desfazendo…" : selectedItem?.isReuse ? "Reaproveitada · desfazer" : "Reaproveitar"}
        </Botao>
      </div>
      {/* A TRAVA DA SOLICITAÇÃO, também aqui: travada, o selo com o motivo e
          o Destravar; livre, o Travar (com motivo) — as mesmas rotas e o
          mesmo texto da Gráfica. */}
      {pecaDaFicha && (fichaTravada ? (
        <div role="status" data-testid="selo-travada-revisao" title={fraseDaTrava(pecaDaFicha)} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "6px 10px", borderRadius: R.md, background: TOM.perigo.text, color: T.surface, fontSize: FS.meta, fontWeight: 700, lineHeight: 1.4 }}>
          <Lock aria-hidden="true" style={{ width: 13, height: 13, flexShrink: 0 }} />
          <span style={{ flex: "1 1 160px", minWidth: 0, overflowWrap: "anywhere" }}>{seloDaTrava(pecaDaFicha)}</span>
          {podeTravar && (
            <Botao
              variante="secundario"
              tamanho={dedo ? "toque" : "sm"}
              icone={Unlock}
              carregando={destravando}
              onClick={() => aoDestravar(pecaDaFicha)}
              data-testid="button-destravar-revisao"
              style={{ border: `1px solid ${TOM.perigo.border}`, color: TOM.perigo.text }}
            >
              {destravando ? "Destravando…" : "Destravar"}
            </Botao>
          )}
        </div>
      ) : podeTravar && !seloSelecionado ? (
        <Botao
          variante="secundario"
          tamanho={dedo ? "toque" : "sm"}
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
        <p style={{ margin: 0, fontSize: FS.small, lineHeight: 1.5, color: TOM.sucesso.text, backgroundColor: TOM.sucesso.bg, border: `1px solid ${TOM.sucesso.border}`, borderRadius: R.md, padding: "8px 12px", display: "flex", alignItems: "center", gap: 8 }}>
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
          <p style={{ fontSize: FS.small, fontWeight: 700, color: TOM.alerta.text, margin: "0 0 6px" }}>
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
                tamanho={dedo ? "toque" : "sm"}
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
                tamanho={dedo ? "toque" : "sm"}
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
