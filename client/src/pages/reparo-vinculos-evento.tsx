import { useMemo, useState } from "react";
import { CalendarDays, Link2, RotateCw } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { T, TOM, FS, FW, FONT } from "@/lib/theme";
import { Botao } from "@/components/ui/botao";
import { EstadoErro } from "@/components/ui/estados";
import { useConfirmar } from "@/components/ui/usar-confirmar";
import {
  CARTAO, CabecalhoDaFerramenta, CascaDaFerramenta, ChipsDeIds, EsqueletoDaFerramenta, NadaPendente,
  PainelDoEfeito, PassosDoReparo, ResultadoDoReparo, ResumoDaConfirmacao, SemPermissao, TituloDeSecao,
  ehSemPermissao, plural, useLarguraDaCasca,
} from "@/components/admin/ferramenta-de-reparo";

type Vinculo = {
  eventId: string;
  sponsorId: string;
  eventName: string;
  sponsorName: string;
  provas: string[];
};

type Previa = { vinculos: Vinculo[]; total: number };
type Resultado = { totalEncontrado: number; aplicados: number };

// Cada vínculo criado vira action "added" em "event_sponsor" na trilha.
const LOGS = "/logs-sistema?acao=added&entidade=event_sponsor";

/**
 * Reparo pontual do estoque antigo: uma marca presente em peças de um evento
 * que o evento não conhece. A aplicação só ACRESCENTA (services/
 * repararVinculosEvento.ts): o vínculo entra sem cota, e cada um ganha uma
 * linha na trilha.
 */
export default function ReparoVinculosEvento() {
  const { toast } = useToast();
  const { confirmar, dialogo } = useConfirmar();
  const isMobile = useIsMobile();
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery<Previa>({
    queryKey: ["/api/admin/reparo-vinculos-evento"],
  });
  const [resultado, setResultado] = useState<{ r: Resultado; quando: Date } | null>(null);
  const [erroAoAplicar, setErroAoAplicar] = useState<string | null>(null);

  // A prévia agrupada pelo EVENTO — é o evento que muda ("passa a listar
  // estes patrocinadores"); a lista solta repetia o nome dele a cada linha.
  const porEvento = useMemo(() => {
    const mapa = new Map<string, { eventName: string; vinculos: Vinculo[] }>();
    for (const v of data?.vinculos ?? []) {
      const g = mapa.get(v.eventId) ?? { eventName: v.eventName, vinculos: [] };
      g.vinculos.push(v);
      mapa.set(v.eventId, g);
    }
    return Array.from(mapa.entries()).map(([eventId, g]) => ({ eventId, ...g }));
  }, [data?.vinculos]);

  const aplicarMutation = useMutation({
    mutationFn: async () => {
      const resposta = await apiRequest("POST", "/api/admin/reparo-vinculos-evento", { confirm: true });
      return resposta.json() as Promise<Resultado>;
    },
    onMutate: () => setErroAoAplicar(null),
    onSuccess: async (resultado) => {
      setResultado({ r: resultado, quando: new Date() });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/admin/reparo-vinculos-evento"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/events"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/items"] }),
      ]);
      toast({
        title: "Vínculos reparados",
        description: `${plural(resultado.aplicados, "vínculo criado", "vínculos criados")} na produção.`,
        variant: "success",
      });
    },
    onError: (error: Error) => {
      setErroAoAplicar(error.message);
      toast({
        title: "Não foi possível reparar os vínculos",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const total = data?.total ?? 0;
  const temPendente = total > 0;
  const eventos = porEvento.length;
  const pecas = useMemo(() => new Set((data?.vinculos ?? []).flatMap((v) => v.provas)).size, [data?.vinculos]);

  const confirmarAplicacao = async () => {
    if (!total || aplicarMutation.isPending) return;
    // Não é perigo: a aplicação só ACRESCENTA vínculos.
    const confirmado = await confirmar({
      titulo: total === 1 ? "Criar o vínculo evento–patrocinador agora?" : `Criar os ${total} vínculos evento–patrocinador agora?`,
      descricao: (
        <ResumoDaConfirmacao
          numeros={[
            { n: total, rotulo: total === 1 ? "vínculo novo, sem cota" : "vínculos novos, sem cota" },
            { n: eventos, rotulo: eventos === 1 ? "evento passa a listar o patrocinador" : "eventos passam a listar os patrocinadores" },
          ]}
          naoMuda="A ação não remove nem altera peças, aprovações ou cotas. Cada vínculo será registrado na auditoria."
          rodape="Se precisar de cota, defina depois em Vincular Patrocinadores."
        />
      ),
      confirmar: total === 1 ? "Criar vínculo" : `Criar ${total} vínculos`,
      icone: Link2,
    });
    if (confirmado) aplicarMutation.mutate();
  };

  const semPermissao = isError && ehSemPermissao(error);

  return (
    <CascaDaFerramenta testId="tela-reparo-vinculos">
      <CabecalhoDaFerramenta
        titulo="Reparo de vínculos"
        testId="title-reparo-vinculos"
        estado={isLoading ? "Gerando a prévia…" : data ? (temPendente ? `${plural(total, "vínculo pendente", "vínculos pendentes")} em ${plural(eventos, "evento", "eventos")}` : "Nenhum vínculo pendente") : undefined}
        descricao="Patrocinadores que já aparecem nas peças de um evento, mas não estão cadastrados nele. Confira as peças que comprovam cada caso e crie os vínculos de uma vez."
        acoes={data && !semPermissao ? (
          <Botao variante="secundario" tamanho={isMobile ? "toque" : "md"} icone={RotateCw} carregando={isFetching && !isLoading} onClick={() => refetch()} disabled={aplicarMutation.isPending}>
            Atualizar prévia
          </Botao>
        ) : undefined}
      />

      {isLoading ? (
        <EsqueletoDaFerramenta rotulo="Carregando prévia dos vínculos" />
      ) : semPermissao ? (
        <SemPermissao />
      ) : isError ? (
        <EstadoErro
          titulo="Não foi possível carregar a prévia"
          detalhe={<>Nenhum vínculo foi criado. {error instanceof Error ? error.message : ""}</>}
          aoTentarDeNovo={() => refetch()}
          carregando={isFetching}
          tamanhoDoBotao={isMobile ? "toque" : "md"}
        />
      ) : (
        <>
          {resultado && !temPendente && <PassosDoReparo etapa="feito" hrefDosLogs={LOGS} />}
          {resultado && (
            <ResultadoDoReparo
              titulo="Vínculos criados"
              quando={resultado.quando}
              hrefDosLogs={LOGS}
              linhas={[
                <><strong>{plural(resultado.r.aplicados, "vínculo criado", "vínculos criados")}</strong> de {resultado.r.totalEncontrado} na prévia, sem cota.</>,
                "Se algum precisar de cota, defina em Vincular Patrocinadores.",
              ]}
              rodape={temPendente ? undefined : "O cadastro já bate com as peças ativas."}
            />
          )}

          {temPendente ? (
            <>
              <PassosDoReparo etapa="revisar" hrefDosLogs={LOGS} />
              <PainelDoEfeito
                tom="info"
                numero={total}
                rotuloDoNumero={total === 1 ? "vínculo pendente" : "vínculos pendentes"}
                detalheDoNumero={`${plural(eventos, "evento", "eventos")} · ${plural(pecas, "peça como prova", "peças como prova")}`}
                faz={[
                  <><strong>{eventos}</strong> {eventos === 1 ? "evento passa" : "eventos passam"} a listar <strong>{plural(total, "patrocinador", "patrocinadores")}</strong> que já estão nas peças</>,
                  <>Os vínculos entram <strong>sem cota</strong> — defina em Vincular Patrocinadores se precisar</>,
                  "Uma linha de auditoria por vínculo criado",
                ]}
                naoMuda={["Peças, aprovações e cotas", "Vínculos que já existem"]}
                garantia="A aplicação é somente aditiva: não remove vínculos existentes, não altera cotas e grava uma linha de auditoria por inclusão."
                rotuloDaAcao={total === 1 ? "Criar 1 vínculo" : `Criar ${total} vínculos`}
                iconeDaAcao={Link2}
                aoAplicar={confirmarAplicacao}
                aplicando={aplicarMutation.isPending}
                erro={erroAoAplicar}
              />

              <section aria-labelledby="titulo-vinculos">
                <TituloDeSecao
                  id="titulo-vinculos"
                  titulo="Vínculos que serão criados"
                  contagem={total}
                  descricao="Por evento. Ao lado de cada patrocinador, as peças do evento em que ele já aparece — é a prova de que o vínculo falta."
                />
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {porEvento.map((grupo) => (
                    <article key={grupo.eventId} className="adm-entra" style={CARTAO}>
                      <header style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 18px", borderBottom: `1px solid ${T.border}`, backgroundColor: T.bg }}>
                        <CalendarDays aria-hidden="true" style={{ width: 16, height: 16, flexShrink: 0, color: T.apoio }} />
                        <div style={{ minWidth: 0 }}>
                          <h3 style={{ margin: 0, fontSize: FS.body, fontWeight: FW.forte, color: T.text, overflowWrap: "anywhere" }}>{grupo.eventName}</h3>
                          <p style={{ margin: "1px 0 0", fontSize: FS.meta, color: T.second }}>
                            {grupo.vinculos.length === 1 ? "ganha 1 patrocinador" : `ganha ${grupo.vinculos.length} patrocinadores`}
                          </p>
                        </div>
                      </header>
                      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                        {grupo.vinculos.map((vinculo, i) => (
                          <LinhaDoVinculo key={`${vinculo.eventId}-${vinculo.sponsorId}`} vinculo={vinculo} primeira={i === 0} />
                        ))}
                      </ul>
                    </article>
                  ))}
                </div>
              </section>
            </>
          ) : !resultado ? (
            <NadaPendente
              titulo="Nenhum vínculo pendente"
              descricao="O cadastro de patrocinadores já bate com as peças ativas: toda marca que aparece numa peça está vinculada ao evento."
              hrefDosLogs={LOGS}
              rotuloDosLogs="Ver vínculos já criados"
            />
          ) : null}
        </>
      )}
      {dialogo}
    </CascaDaFerramenta>
  );
}

/** Um patrocinador a vincular e as peças que provam. Pela largura do conteúdo. */
function LinhaDoVinculo({ vinculo, primeira }: { vinculo: Vinculo; primeira: boolean }) {
  const estreito = useLarguraDaCasca() < 640;
  return (
    <li style={{ display: "grid", gridTemplateColumns: estreito ? "1fr" : "minmax(200px, 300px) 1fr", gap: estreito ? 10 : 24, alignItems: "start", padding: "14px 18px", borderTop: primeira ? undefined : `1px solid ${T.border}` }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 9, minWidth: 0 }}>
        <Link2 aria-hidden="true" style={{ width: 15, height: 15, flexShrink: 0, marginTop: 2, color: TOM.info.text }} />
        <div style={{ minWidth: 0 }}>
          <strong style={{ display: "block", fontSize: FS.read, fontWeight: FW.forte, color: T.text, overflowWrap: "anywhere" }}>{vinculo.sponsorName}</strong>
          <span style={{ display: "block", marginTop: 2, fontSize: FS.meta, color: T.second }}>
            Presente em <span style={{ fontFamily: FONT.mono, fontWeight: FW.forte, color: T.apoio }}>{vinculo.provas.length}</span> {vinculo.provas.length === 1 ? "peça" : "peças"}
          </span>
        </div>
      </div>
      <ChipsDeIds ids={vinculo.provas} limite={estreito ? 6 : 10} />
    </li>
  );
}
