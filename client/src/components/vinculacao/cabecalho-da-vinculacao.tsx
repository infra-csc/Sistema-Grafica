// ─────────────────────────────────────────────────────────────────────────────
// CABEÇALHO DA PÁGINA. O eyebrow diz ONDE esta etapa fica no caminho da peça;
// o subtítulo é a frase de resolução — o que falta fazer HOJE, não a
// descrição da tela. As duas ações do topo: auto-vincular e enviar à Arte.
// ─────────────────────────────────────────────────────────────────────────────
import { Send, Zap } from "lucide-react";
import { Botao } from "@/components/ui/botao";
import { CabecalhoDaPagina } from "@/components/ui/cabecalho-da-pagina";
import { T, FS, FW } from "@/lib/theme";
import type { ContagemPorEstado } from "./tipos";

type Props = {
  fraseDeResolucao: string;
  contextStatusCounts: ContagemPorEstado;
  eventFilter: string[];
  abrirAutoVinculo: (eventId: string) => void;
  abrirEnvioDasProntas: () => void;
  enviando: boolean;
};

export function CabecalhoDaVinculacao({
  fraseDeResolucao, contextStatusCounts, eventFilter, abrirAutoVinculo, abrirEnvioDasProntas, enviando,
}: Props) {
  return (
    <>
      <div style={{ marginBottom: 10, fontSize: FS.micro, fontWeight: FW.rotulo, letterSpacing: '0.14em', textTransform: 'uppercase', color: T.accentText }}>
        Antes da Arte
      </div>
      <CabecalhoDaPagina
        titulo="Vincular Patrocinadores"
        subtitulo={<span data-testid="frase-resolucao" style={{ color: T.apoio, fontSize: FS.read, fontWeight: FW.corpo, maxWidth: 560 }}>{fraseDeResolucao}</span>}
        acoes={(() => {
          // O MOTIVO FICA À VISTA. Estava só no `title` (num <span> em volta,
          // porque botão desabilitado não dispara hover) — e no toque não há
          // hover nenhum. O `title` continua para o mouse.
          const motivoEnvio = contextStatusCounts.PRONTO === 0
            ? contextStatusCounts.RASCUNHO > 0
              ? `Há ${contextStatusCounts.RASCUNHO} ${contextStatusCounts.RASCUNHO === 1 ? 'rascunho' : 'rascunhos'} — salve-${contextStatusCounts.RASCUNHO === 1 ? 'o' : 'os'} para deixar as peças prontas`
              : 'Nenhuma peça está pronta para envio. Vincule e salve patrocinadores primeiro.'
            : undefined;
          return (
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              {/* Secundário: só a ação principal ("Enviar para Arte") é cheia. */}
              <Botao
                variante="secundario"
                tamanho="toque"
                icone={Zap}
                data-testid="button-auto-vincular"
                disabled={eventFilter.length !== 1}
                motivo="Filtre um evento — ou use o do cabeçalho de cada evento"
                alinharMotivo="end"
                title={eventFilter.length !== 1 ? 'Filtre um evento para usar daqui — ou use o "Auto-vincular por cota" no cabeçalho de cada evento na lista' : 'Vincular patrocinadores automaticamente pela cota'}
                onClick={() => { if (eventFilter.length === 1) abrirAutoVinculo(eventFilter[0]); }}
              >
                Auto-vincular por cota
              </Botao>
              <Botao
                variante="primario"
                tamanho="toque"
                icone={Send}
                onClick={abrirEnvioDasProntas}
                disabled={contextStatusCounts.PRONTO === 0 || enviando}
                carregando={enviando}
                motivo={motivoEnvio}
                alinharMotivo="end"
                title={motivoEnvio}
                data-testid="button-finalizar-lote"
              >
                {/* A CONTAGEM ENTRA NO RÓTULO: "Enviar 2 para Arte" é a frase
                    inteira — e some quando não há nada a enviar, porque aí o
                    que importa é o motivo, logo abaixo. */}
                {contextStatusCounts.PRONTO > 0 ? `Enviar ${contextStatusCounts.PRONTO} para Arte` : 'Enviar para Arte'}
              </Botao>
            </div>
          );
        })()}
      />
      {/* O QUE É E PARA ONDE VAI, numa linha secundária. A frase acima diz o
          que falta hoje; quem chega pela primeira vez precisava também saber o
          que "vincular" faz, que o rascunho só vale salvo e para onde a peça
          segue depois do envio. */}
      <p data-testid="explicacao-vincular" style={{ color: T.apoio, fontSize: FS.meta, lineHeight: 1.5, margin: '-8px 0 18px', maxWidth: 640 }}>
        Marque quem aprova a arte de cada peça (ou <strong style={{ color: T.strong }}>Sem patrocinador</strong>) e <strong style={{ color: T.strong }}>salve</strong> — marcar sem salvar é rascunho.
        {' '}Depois, <strong style={{ color: T.strong }}>Enviar para Arte</strong>: a Arte faz o layout e os patrocinadores vinculados aprovam; a peça continua aqui como Enviado.
      </p>
    </>
  );
}
