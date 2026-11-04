// CONFERÊNCIA DE ARQUIVOS (Pedro/dono, 04/11): as peças em que o arquivo final
// parece diferente do thumb aprovado. É um aviso para alguém olhar: não trava a peça.
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, FileSearch, TriangleAlert } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile, usePonteiroGrosso } from "@/hooks/use-mobile";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { FS, FW, R, T, TOM } from "@/lib/theme";
import { Abas } from "@/components/ui/abas";
import { Botao } from "@/components/ui/botao";
import { CabecalhoDaPagina } from "@/components/ui/cabecalho-da-pagina";
import { EstadoErro, EstadoVazio } from "@/components/ui/estados";
import { EsqueletoDeFila } from "@/components/esqueleto-de-fila";
import { BotaoCopiar } from "@/components/botao-copiar";
import { Selo } from "@/components/ui/selo";
import { useConfirmar } from "@/components/ui/usar-confirmar";

type Linha = {
  id: string; itemId: string; veredito: "vale_olhar" | "nao_deu"; motivo: string | null; pagina: string | null;
  thumb: string; arquivo: string; previewUrl: string | null; resolvidaEm: string | null; resolvidaPor: string | null;
  displayId: string | null; tipo: string; descricao: string | null; status: string; quantidade: number;
  eventId: string; evento: string; saida: string | null;
};
type Resposta = { linhas: Linha[]; conferem: number; pendentes: number };
type Aba = "olhar" | "nao_deu" | "vistas";
const CHAVE = ["/api/conferencia-do-arquivo"];

const dataBR = (d: string | null) => (d ? new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" }) : "sem data");
const caminhoLimpo = (u: string) => u.trim().replace(/^"+|"+$/g, "");

function Imagem({ rotulo, url, vazio }: { rotulo: string; url: string | null; vazio: string }) {
  return (
    <figure style={{ margin: 0, flex: "1 1 240px", minWidth: 0 }}>
      <figcaption style={{ fontSize: FS.small, fontWeight: FW.forte, color: T.apoio, marginBottom: 6 }}>{rotulo}</figcaption>
      <div style={{ height: 220, borderRadius: R.md, border: `1px solid ${T.border}`, backgroundColor: T.low, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
        {url
          ? <img src={url} alt={rotulo} loading="lazy" decoding="async" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
          : <span style={{ fontSize: FS.meta, color: T.second, padding: 12, textAlign: "center" }}>{vazio}</span>}
      </div>
    </figure>
  );
}

export default function ConferenciaArquivos() {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const dedo = usePonteiroGrosso() || isMobile;
  const [aba, setAba] = useState<Aba>("olhar");
  const { confirmar, dialogo } = useConfirmar();
  const { data, isLoading, isError, refetch } = useQuery<Resposta>({ queryKey: CHAVE, staleTime: 30_000 });

  const grupos = useMemo(() => {
    const l = data?.linhas ?? [];
    return {
      olhar: l.filter((x) => x.veredito === "vale_olhar" && !x.resolvidaEm),
      nao_deu: l.filter((x) => x.veredito === "nao_deu" && !x.resolvidaEm),
      vistas: l.filter((x) => !!x.resolvidaEm),
    };
  }, [data]);
  const lista = grupos[aba];

  const resolver = useMutation({
    mutationFn: async (id: string) => (await apiRequest("POST", `/api/conferencia-do-arquivo/${id}/resolver`, {})).json(),
    onSuccess: () => { toast({ title: "Marcado como visto", variant: "success" }); void queryClient.invalidateQueries({ queryKey: CHAVE }); },
    onError: (e: Error) => toast({ title: "Não foi possível marcar", description: e.message, variant: "destructive" }),
  });
  const pedirResolver = async (l: Linha) => {
    const ok = await confirmar({
      titulo: `Marcar ${l.displayId ?? "a peça"} como vista?`,
      descricao: l.veredito === "vale_olhar" ? "Use quando o arquivo estiver certo: o aviso sai da lista e fica registrado no histórico da peça." : "O aviso sai da lista e fica registrado no histórico da peça.",
      confirmar: "Marcar como vista",
      cancelar: "Agora não",
    });
    if (ok) resolver.mutate(l.id);
  };

  return (
    <div data-testid="pagina-conferencia-arquivos" className="container mx-auto p-4 max-w-6xl 2xl:max-w-[1440px]" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {dialogo}
      <CabecalhoDaPagina
        titulo="Conferência de arquivos"
        subtitulo="Peças em que o arquivo final parece diferente do thumb. É um aviso para olhar: nenhuma peça fica travada."
      />
      {data && (
        <p data-testid="resumo-conferencia" style={{ margin: 0, fontSize: FS.meta, color: T.second }}>
          {data.conferem} {data.conferem === 1 ? "peça confere" : "peças conferem"}
          {data.pendentes > 0 ? ` · ${data.pendentes} ainda na fila para conferir` : " · nada na fila"}
          {" · só peças ainda não impressas, de eventos por vir"}
        </p>
      )}
      <Abas
        rotuloDaLista="Situação da conferência"
        prefixoDeTestId="aba-conferencia"
        ativo={aba}
        aoTrocar={(id) => setAba(id as Aba)}
        itens={[
          { id: "olhar", rotulo: "Vale olhar", contador: grupos.olhar.length || undefined, tom: "alerta" },
          { id: "nao_deu", rotulo: "Não deu para conferir", contador: grupos.nao_deu.length || undefined },
          { id: "vistas", rotulo: "Vistas", contador: grupos.vistas.length || undefined },
        ]}
      />
      {isLoading ? <EsqueletoDeFila linhas={4} />
        : isError ? <EstadoErro titulo="Não foi possível carregar a conferência" detalhe="Verifique sua conexão e tente novamente." aoTentarDeNovo={() => { void refetch(); }} />
        : lista.length === 0 ? (
          <EstadoVazio
            icone={FileSearch}
            testId="vazio-conferencia"
            titulo={aba === "olhar" ? "Nenhuma peça para olhar" : aba === "nao_deu" ? "Nenhum arquivo ficou de fora" : "Nada marcado como visto ainda"}
            descricao={aba === "olhar" ? "Quando um arquivo parecer diferente do thumb, ele aparece aqui." : aba === "nao_deu" ? "Aparecem aqui os arquivos que não foram encontrados ou não abriram." : "As peças marcadas como vistas ficam aqui."}
          />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }} data-testid="lista-conferencia">
            {lista.map((l) => (
              <article key={l.id} data-testid={`conferencia-${l.displayId ?? l.id}`} style={{ backgroundColor: T.surface, border: `1px solid ${T.border}`, borderRadius: R.lg, padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
                <header style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "4px 10px" }}>
                  <Link href={`/eventos/${l.eventId}?item=${encodeURIComponent(l.itemId)}`} style={{ fontWeight: FW.forte, fontSize: FS.read, color: T.accentText }}>{l.displayId ?? "Peça"}</Link>
                  <strong style={{ fontSize: FS.read, color: T.text }}>{l.tipo}</strong>
                  {l.descricao && <span style={{ fontSize: FS.body, color: T.apoio, overflowWrap: "anywhere" }}>{l.descricao}</span>}
                  <span style={{ fontSize: FS.meta, color: T.second, flexBasis: "100%", overflowWrap: "anywhere" }}>
                    {l.evento} · caminhão {dataBR(l.saida)} · {l.quantidade} un.
                    {l.pagina ? ` · prancheta ${l.pagina}` : ""}
                  </span>
                </header>
                {l.motivo && (
                  <p style={{ margin: 0, display: "flex", gap: 8, alignItems: "flex-start", padding: "8px 10px", borderRadius: R.md, backgroundColor: TOM.alerta.bg, border: `1px solid ${TOM.alerta.border}`, color: TOM.alerta.text, fontSize: FS.body }}>
                    <TriangleAlert aria-hidden="true" style={{ width: 15, height: 15, flexShrink: 0, marginTop: 2 }} />
                    <span>{l.motivo}</span>
                  </p>
                )}
                {l.veredito === "vale_olhar" && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                    <Imagem rotulo="Thumb" url={l.thumb} vazio="Sem thumb" />
                    <Imagem rotulo="Arquivo final" url={l.previewUrl} vazio="Sem imagem do arquivo" />
                  </div>
                )}
                <footer style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                  <code style={{ flex: "1 1 240px", minWidth: 0, fontSize: FS.small, color: T.second, overflowWrap: "anywhere" }}>{caminhoLimpo(l.arquivo)}</code>
                  <BotaoCopiar texto={caminhoLimpo(l.arquivo)} rotulo={`o caminho do arquivo de ${l.displayId ?? "a peça"}`} />
                  {l.resolvidaEm
                    ? <Selo tom="sucesso" ponto>Vista por {l.resolvidaPor ?? "alguém"} em {dataBR(l.resolvidaEm)}</Selo>
                    : <Botao variante="secundario" tamanho={dedo ? "toque" : "md"} icone={Check} onClick={() => { void pedirResolver(l); }} disabled={resolver.isPending} data-testid={`resolver-${l.displayId ?? l.id}`}>Marcar como vista</Botao>}
                </footer>
              </article>
            ))}
          </div>
        )}
    </div>
  );
}
