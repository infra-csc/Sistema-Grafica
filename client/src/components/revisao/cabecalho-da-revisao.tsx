// O topo da Revisão Final: título, a frase do estado da fila, o que é a tela
// e as duas entradas (revisar em fila; o disparo à mão do aviso, só admin).
import { Eye, Mail } from "lucide-react";
import { Botao } from "@/components/ui/botao";
import { CabecalhoDaPagina } from "@/components/ui/cabecalho-da-pagina";
import { T, FS } from "@/lib/theme";
import { TI } from "./regras";

export function CabecalhoDaRevisao({
  isMobile, dedo, fraseDeResolucao, admin, avisando, aoAvisar, totalNaFila, aoComecarFila,
}: {
  isMobile: boolean;
  dedo: boolean;
  fraseDeResolucao: string;
  admin: boolean;
  avisando: boolean;
  aoAvisar: () => void;
  totalNaFila: number;
  aoComecarFila: () => void;
}) {
  // Enxuto de propósito: o título padrão das páginas, sem bloco escuro nem
  // contadores — o único contador da tela mora na barra de filtros.
  return (
    <section style={{ backgroundColor: TI.surface, padding: isMobile ? "16px 12px 0" : "20px 32px 0", borderBottom: `1px solid ${TI.border}` }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <CabecalhoDaPagina
          titulo="Revisão Final"
          subtitulo={
            <>
              {/* T.apoio e não T.second: a frase é o estado da fila, e em 13px
                  ela precisa da folga do tom de apoio. */}
              <span data-testid="frase-resolucao" style={{ display: "block", color: T.apoio, maxWidth: 620 }}>
                {fraseDeResolucao}
              </span>
              {/* O QUE É ESTA TELA, numa linha: quem chega pela primeira vez
                  não sabe o que "revisar" quer dizer, nem para onde a peça vai
                  depois do clique. Tom secundário, para não competir com a
                  frase de resolução. */}
              <span data-testid="explicacao-revisao" style={{ display: "block", margin: "2px 0 0", fontSize: FS.meta, color: T.apoio, maxWidth: 680 }}>
                Última conferência antes da Gráfica: compare o aprovado pelo patrocinador com o arquivo final da Arte.
                {" "}<strong style={{ fontWeight: 700, color: T.strong }}>Liberar</strong> manda para a fila da Gráfica;
                {" "}<strong style={{ fontWeight: 700, color: T.strong }}>Devolver</strong> volta para a Arte com o seu motivo.
              </span>
            </>
          }
          acoes={
            <>
              {/* O DISPARO À MÃO DO AVISO. Discreto de propósito: é ferramenta
                  de manutenção, não parte do trabalho de revisar. */}
              {admin && (
                <Botao
                  variante="secundario"
                  tamanho={dedo ? "toque" : "md"}
                  icone={Mail}
                  carregando={avisando}
                  onClick={aoAvisar}
                  data-testid="button-avisar-revisao"
                  title="Manda agora o resumo da fila para quem recebe o aviso das 10h, 15h e 18h. Se a fila estiver vazia, nada é enviado."
                >
                  {avisando ? "Enviando…" : "Avisar por e-mail"}
                </Botao>
              )}
              {/* A ENTRADA DA FILA: quem abre esta tela para trabalhar quer
                  começar do começo, sem mirar na primeira linha. */}
              {totalNaFila > 0 && (
                <Botao
                  variante="primario"
                  tamanho={dedo ? "toque" : "md"}
                  icone={Eye}
                  onClick={aoComecarFila}
                  data-testid="button-queue-start"
                >
                  Revisar em fila ({totalNaFila})
                </Botao>
              )}
            </>
          }
        />
      </div>
    </section>
  );
}
