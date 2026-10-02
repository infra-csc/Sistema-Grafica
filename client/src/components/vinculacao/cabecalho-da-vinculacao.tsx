// ─────────────────────────────────────────────────────────────────────────────
// CABEÇALHO DA PÁGINA. O eyebrow diz ONDE esta etapa fica no caminho da peça;
// o subtítulo é a frase de resolução — o que falta fazer HOJE, não a
// descrição da tela. As duas ações do topo: auto-vincular e enviar à Arte.
// Embaixo, os três passos da tela, na ordem em que se fazem.
// ─────────────────────────────────────────────────────────────────────────────
import { Send, Zap } from "lucide-react";
import { Botao } from "@/components/ui/botao";
import { CabecalhoDaPagina } from "@/components/ui/cabecalho-da-pagina";
import { T, FS, FW, FONT } from "@/lib/theme";
import type { ContagemPorEstado } from "./tipos";

type Props = {
  fraseDeResolucao: string;
  contextStatusCounts: ContagemPorEstado;
  eventFilter: string[];
  abrirAutoVinculo: (eventId: string) => void;
  abrirEnvioDasProntas: () => void;
  enviando: boolean;
  isMobile?: boolean;
  /** Caixa estreita (a lista virou cartões): os três passos empilham. */
  estreito?: boolean;
};

export function CabecalhoDaVinculacao({
  fraseDeResolucao, contextStatusCounts, eventFilter, abrirAutoVinculo, abrirEnvioDasProntas, enviando, isMobile = false, estreito = false,
}: Props) {
  // Os passos em três colunas pedem largura: em caixa estreita (tablet com a
  // barra lateral aberta) cada coluna ficava com ~150px e o terceiro passo
  // quebrava em cinco linhas.
  const empilhar = isMobile || estreito;
  // O MOTIVO FICA À VISTA. Estava só no `title` (num <span> em volta,
  // porque botão desabilitado não dispara hover) — e no toque não há hover
  // nenhum. O `title` continua para o mouse.
  const motivoEnvio = contextStatusCounts.PRONTO === 0
    ? contextStatusCounts.RASCUNHO > 0
      ? `Há ${contextStatusCounts.RASCUNHO} ${contextStatusCounts.RASCUNHO === 1 ? 'rascunho' : 'rascunhos'} — salve-${contextStatusCounts.RASCUNHO === 1 ? 'o' : 'os'} para deixar as peças prontas`
      // Curto de propósito: o motivo fica embaixo do botão e define a largura
      // dele — a frase longa esticava o primário desabilitado por 470px.
      : 'Nada pronto ainda — vincule e salve primeiro'
    : undefined;

  const autoVincular = (
    // Secundário: só a ação principal ("Enviar para Arte") é cheia. O motivo
    // curto à vista; a explicação inteira fica no `title`. O motivo longo
    // ("…ou use o do cabeçalho de cada evento") esticava o botão desabilitado
    // até a largura da frase — uma caixa vazia de 350px no topo da tela.
    <Botao
      key="auto"
      variante="secundario"
      tamanho="toque"
      icone={Zap}
      data-testid="button-auto-vincular"
      disabled={eventFilter.length !== 1}
      motivo="Filtre um evento — ou use o de cada grupo"
      alinharMotivo={isMobile ? "start" : "end"}
      larguraCheia={isMobile}
      title={eventFilter.length !== 1 ? 'Filtre um evento para usar daqui — ou use o "Auto-vincular por cota" no cabeçalho de cada evento na lista' : 'Vincular patrocinadores automaticamente pela cota'}
      onClick={() => { if (eventFilter.length === 1) abrirAutoVinculo(eventFilter[0]); }}
    >
      Auto-vincular por cota
    </Botao>
  );
  const enviar = (
    <Botao
      key="enviar"
      variante="primario"
      tamanho="toque"
      icone={Send}
      onClick={abrirEnvioDasProntas}
      disabled={contextStatusCounts.PRONTO === 0 || enviando}
      carregando={enviando}
      motivo={motivoEnvio}
      alinharMotivo={isMobile ? "start" : "end"}
      larguraCheia={isMobile}
      title={motivoEnvio}
      data-testid="button-finalizar-lote"
    >
      {/* A CONTAGEM ENTRA NO RÓTULO: "Enviar 2 para Arte" é a frase
          inteira — e some quando não há nada a enviar, porque aí o
          que importa é o motivo, logo abaixo. */}
      {contextStatusCounts.PRONTO > 0 ? `Enviar ${contextStatusCounts.PRONTO} para Arte` : 'Enviar para Arte'}
    </Botao>
  );

  return (
    <>
      <div style={{ marginBottom: 8, fontSize: FS.micro, fontWeight: FW.rotulo, letterSpacing: '0.14em', textTransform: 'uppercase', color: T.accentText }}>
        Antes da Arte
      </div>
      <CabecalhoDaPagina
        titulo="Vincular Patrocinadores"
        subtitulo={<span data-testid="frase-resolucao" style={{ color: T.apoio, fontSize: FS.read, fontWeight: FW.corpo, maxWidth: 560 }}>{fraseDeResolucao}</span>}
        margemInferior={isMobile ? 14 : 16}
        acoes={isMobile ? undefined : (
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            {autoVincular}{enviar}
          </div>
        )}
      />
      {/* No celular as ações saem do cabeçalho e ocupam a largura toda, com a
          PRINCIPAL primeiro: era o auto-vincular desabilitado que abria a
          coluna, e o "Enviar" vinha embaixo dele como se fosse secundário. */}
      {isMobile && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
          {enviar}{autoVincular}
        </div>
      )}
      {/* O QUE É E PARA ONDE VAI, em três passos. A frase acima diz o que
          falta hoje; quem chega pela primeira vez precisava também saber o
          que "vincular" faz, que o rascunho só vale salvo e para onde a peça
          segue depois do envio. Era um parágrafo de três linhas — o mesmo
          conteúdo, agora na ordem em que se faz, lido de relance. */}
      <ol data-testid="explicacao-vincular" aria-label="Como funciona" style={{
        listStyle: 'none', margin: '0 0 20px', padding: 0, maxWidth: 920,
        display: 'grid', gridTemplateColumns: empilhar ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: empilhar ? 6 : 20,
      }}>
        {([
          ['Marque', <>quem aprova a arte de cada peça — ou <strong style={{ color: T.strong, fontWeight: FW.medio }}>Sem patrocinador</strong></>],
          ['Salve', <>marcar sem salvar é rascunho</>],
          ['Envie para a Arte', <>ela faz o layout e os patrocinadores aprovam; a peça fica aqui como Enviado</>],
        ] as const).map(([verbo, detalhe], i) => (
          // Trilho fino em cima de cada passo (o primeiro em laranja — é por
          // onde se começa): lê como sequência sem precisar de seta.
          <li key={verbo} style={{ display: 'flex', gap: 8, minWidth: 0, paddingTop: empilhar ? 0 : 8, borderTop: empilhar ? 'none' : `2px solid ${i === 0 ? T.accent : T.border}` }}>
            <span aria-hidden="true" style={{ fontFamily: FONT.mono, fontSize: FS.meta, fontWeight: FW.forte, color: T.accentText, flexShrink: 0, lineHeight: 1.5 }}>{i + 1}</span>
            <span style={{ fontSize: FS.meta, lineHeight: 1.5, color: T.apoio }}>
              <strong style={{ color: T.text, fontWeight: FW.forte }}>{verbo}</strong> {detalhe}
            </span>
          </li>
        ))}
      </ol>
    </>
  );
}
