import { Sparkles } from "lucide-react";
import { Botao } from "@/components/ui/botao";
import { T, FS } from "@/lib/theme";

/**
 * "Buscar arte já feita" — o gêmeo do botão de subir arquivo, ao lado dele.
 *
 * Fica ONDE HOJE SE SOBE a thumb ou o arquivo, porque é ali que nasce a
 * pergunta do dono: "essa arte eu já fiz, não dá para achar?". Dois tamanhos:
 * `cheio` para a zona de upload vazia (o outro caminho tem o mesmo peso do
 * "Escolher arquivo") e `discreto` para as linhas de troca, onde o gesto
 * principal já existe.
 */
export function BotaoBuscarArte({ onClick, variante = "cheio", testId }: {
  onClick: () => void;
  variante?: "cheio" | "discreto";
  testId: string;
}) {
  const cheio = variante === "cheio";
  // 44px de alvo nos dois: o modal da Arte também abre no celular.
  return (
    <Botao
      variante={cheio ? "secundario" : "fantasma"}
      tamanho="toque"
      icone={Sparkles}
      onClick={onClick}
      data-testid={testId}
      title="Reaproveitar uma arte já enviada no app, sem subir o arquivo de novo"
      style={cheio
        ? { fontSize: FS.body, fontWeight: 600 }
        : { padding: '0 10px', fontSize: FS.meta, color: T.strong, textDecoration: 'underline', textUnderlineOffset: 2, alignSelf: 'flex-start' }}
    >
      Buscar arte já feita
    </Botao>
  );
}
