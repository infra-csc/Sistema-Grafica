import { EstadoErro } from "@/components/ui/estados";
import { mensagemDeErro } from "./constantes";

/**
 * Estado de ERRO das listas.
 *
 * PORQUÊ ISTO EXISTE. Nenhuma das cinco queries lia `isError`: todas caíam
 * para [] em qualquer falha, e a renderização só distinguia `isLoading`. Com
 * /api/items em 500, a tela desenhava um ✓ verde de 48px e afirmava "Tudo
 * liberado!" — não é ausência de informação, é a afirmação do contrário, com
 * a cor e o ícone do sucesso. E não havia saída: o queryClient usa
 * retry:false, refetchOnWindowFocus:false e staleTime:Infinity, então o erro
 * é permanente até um F5 manual. Numa fila cujo prazo é a saída do caminhão,
 * acreditar que a fila zerou é a pior mentira possível.
 */
/**
 * O erro de carga vira uma CAIXA.
 *
 * Era um bloco de texto centrado solto na página, sem contorno: parecia um
 * estado vazio, não uma falha — e a diferença entre "não há nada" e "não
 * consegui buscar" é a diferença entre seguir o dia e recarregar.
 *
 * Vale para as CINCO abas do Arte, que compartilham este render — agora
 * pela <EstadoErro> do design system (vermelho: é falha, não vazio).
 */
export function ErroDeCarga({ titulo, erro, tentarDeNovo, testId }: {
  titulo: string;
  erro: unknown;
  tentarDeNovo: () => void;
  testId: string;
}) {
  return (
    <div data-testid={testId} style={{ maxWidth: 460, margin: '24px auto' }}>
      <EstadoErro
        titulo={titulo}
        detalhe={erro instanceof Error && erro.message ? mensagemDeErro(erro) : 'Verifique sua conexão e tente novamente.'}
        aoTentarDeNovo={tentarDeNovo}
      />
    </div>
  );
}
