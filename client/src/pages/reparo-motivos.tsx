import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { FileText, MessageSquareText, RotateCw, Wand2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { T, TOM, FS, FW } from "@/lib/theme";
import { Botao } from "@/components/ui/botao";
import { EstadoErro } from "@/components/ui/estados";
import { useConfirmar } from "@/components/ui/usar-confirmar";
import {
  CARTAO, CabecalhoDaFerramenta, CascaDaFerramenta, ChipsDeIds, EsqueletoDaFerramenta, NadaPendente,
  PainelDoEfeito, PassosDoReparo, ROTULO_CAIXA_ALTA, ResultadoDoReparo, ResumoDaConfirmacao, SemPermissao,
  TituloDeSecao, ehSemPermissao, plural,
} from "@/components/admin/ferramenta-de-reparo";
import { TextoComDiferenca, letrasQueVoltam } from "@/components/admin/diferenca-de-texto";

type Reparo = {
  recordId: string;
  displayId: string | null;
  origem: "item" | "aprovacao_patrocinador";
  campo: "rejectionReason" | "observations";
  antes: string;
  depois: string;
};

type Previa = { reparos: Reparo[]; total: number };
type Resultado = { totalEncontrado: number; aplicados: number; ignoradosPorMudanca: number };

function nomeDaOrigem(reparo: Reparo) {
  if (reparo.origem === "aprovacao_patrocinador") return "Motivo de patrocinador";
  return reparo.campo === "observations" ? "Observações da peça" : "Motivo da peça";
}

// Onde a trilha guarda cada correção: action "corrected_text".
const LOGS = "/logs-sistema?acao=corrected_text";

// PARA QUE SERVE E O QUE ACONTECE AO APLICAR — quem abre esta tela pela
// primeira vez vê "Correção de textos" no menu sem saber se é rotina ou
// conserto pontual. É conserto de UM bug: nada aqui é trabalho recorrente, e
// aplicar grava uma linha "Texto corrigido" por registro na trilha
// (services/reparoMotivosSemS.ts), o que responde "quem mexeu no motivo?".
export default function ReparoMotivos() {
  const { toast } = useToast();
  const { confirmar, dialogo } = useConfirmar();
  const isMobile = useIsMobile();
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery<Previa>({
    queryKey: ["/api/admin/reparo-motivos-sem-s"],
  });
  // O que a última aplicação fez — fica na tela depois que o toast some.
  const [resultado, setResultado] = useState<{ r: Resultado; quando: Date } | null>(null);
  const [erroAoAplicar, setErroAoAplicar] = useState<string | null>(null);

  const grupos = useMemo(() => {
    const mapa = new Map<string, { exemplo: Reparo; displayIds: string[] }>();
    for (const reparo of data?.reparos ?? []) {
      const chave = `${reparo.origem}|${reparo.campo}|${reparo.antes}|${reparo.depois}`;
      const grupo = mapa.get(chave) ?? { exemplo: reparo, displayIds: [] };
      grupo.displayIds.push(reparo.displayId ?? reparo.recordId);
      mapa.set(chave, grupo);
    }
    return Array.from(mapa.values());
  }, [data?.reparos]);

  // Onde cada correção cai — o "Ao aplicar" diz em que lugar o texto muda.
  const porLugar = useMemo(() => {
    const conta = { motivo: 0, observacoes: 0, patrocinador: 0 };
    for (const r of data?.reparos ?? []) {
      if (r.origem === "aprovacao_patrocinador") conta.patrocinador++;
      else if (r.campo === "observations") conta.observacoes++;
      else conta.motivo++;
    }
    return conta;
  }, [data?.reparos]);

  const aplicarMutation = useMutation({
    mutationFn: async () => {
      const resposta = await apiRequest("POST", "/api/admin/reparo-motivos-sem-s", { confirm: true });
      return resposta.json() as Promise<Resultado>;
    },
    onMutate: () => setErroAoAplicar(null),
    onSuccess: async (resultado) => {
      setResultado({ r: resultado, quando: new Date() });
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/reparo-motivos-sem-s"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      // O servidor já devolvia quantos ficaram de fora por terem sido editados
      // no meio do caminho — e o toast escondia. É exatamente a garantia que o
      // aviso promete; o resultado precisa confirmá-la.
      const preservados = resultado.ignoradosPorMudanca ?? 0;
      toast({
        title: "Textos corrigidos",
        description: `${plural(resultado.aplicados, "registro atualizado", "registros atualizados")}.`
          + (preservados > 0 ? ` ${plural(preservados, "foi preservado", "foram preservados")} porque mudou durante a aplicação.` : ""),
        variant: "success",
      });
    },
    onError: (error: Error) => {
      setErroAoAplicar(error.message);
      toast({ title: "Não foi possível aplicar as correções", description: error.message, variant: "destructive" });
    },
  });

  const total = data?.total ?? 0;
  const temPendente = total > 0;

  const linhasDoEfeito = [
    porLugar.motivo > 0 && { n: porLugar.motivo, rotulo: porLugar.motivo === 1 ? "motivo de devolução de peça" : "motivos de devolução de peças" },
    porLugar.observacoes > 0 && { n: porLugar.observacoes, rotulo: porLugar.observacoes === 1 ? "observação de peça" : "observações de peças" },
    porLugar.patrocinador > 0 && { n: porLugar.patrocinador, rotulo: porLugar.patrocinador === 1 ? "motivo de reprovação do patrocinador" : "motivos de reprovação do patrocinador" },
  ].filter(Boolean) as Array<{ n: number; rotulo: string }>;

  const confirmarAplicacao = async () => {
    if (!total || aplicarMutation.isPending) return;
    // Não é perigo: corrige texto, não apaga nada.
    const confirmado = await confirmar({
      titulo: `Aplicar ${total === 1 ? "a correção revisada" : `as ${total} correções revisadas`} agora?`,
      descricao: (
        <ResumoDaConfirmacao
          numeros={linhasDoEfeito}
          naoMuda="Os textos serão atualizados nos itens e nas aprovações de patrocinadores. Logs e notificações existentes não serão modificados."
          rodape="Texto editado por alguém antes da gravação é preservado. Cada correção fica nos Logs do Sistema com o seu nome."
        />
      ),
      confirmar: total === 1 ? "Aplicar correção" : `Aplicar ${total} correções`,
      icone: Wand2,
    });
    if (confirmado) aplicarMutation.mutate();
  };

  const semPermissao = isError && ehSemPermissao(error);

  return (
    <CascaDaFerramenta testId="tela-reparo-motivos">
      <CabecalhoDaFerramenta
        titulo="Correção de textos"
        testId="title-reparo-motivos"
        estado={isLoading ? "Gerando a prévia…" : data ? (temPendente ? `${plural(total, "registro pronto", "registros prontos")} para correção` : "Nenhuma correção pendente") : undefined}
        descricao={<>Mensagens gravadas entre 17 e 19/08 perderam a letra “s”, trocada por espaços. Esta prévia lista só as correções já revisadas por uma pessoa — texto fora dessa lista fica intacto.</>}
        acoes={data && !semPermissao ? (
          <Botao variante="secundario" tamanho={isMobile ? "toque" : "md"} icone={RotateCw} carregando={isFetching && !isLoading} onClick={() => refetch()} disabled={aplicarMutation.isPending}>
            Atualizar prévia
          </Botao>
        ) : undefined}
      />

      {isLoading ? (
        <EsqueletoDaFerramenta rotulo="Carregando prévia das correções" />
      ) : semPermissao ? (
        <SemPermissao />
      ) : isError ? (
        <EstadoErro
          titulo="Não foi possível carregar a prévia"
          detalhe={<>Nenhum texto foi alterado. {error instanceof Error ? error.message : ""}</>}
          aoTentarDeNovo={() => refetch()}
          carregando={isFetching}
          tamanhoDoBotao={isMobile ? "toque" : "md"}
        />
      ) : (
        <>
          {resultado && !temPendente && <PassosDoReparo etapa="feito" hrefDosLogs={LOGS} />}
          {resultado && (
            <ResultadoDoReparo
              titulo="Correções aplicadas"
              quando={resultado.quando}
              hrefDosLogs={LOGS}
              linhas={[
                <><strong>{plural(resultado.r.aplicados, "registro corrigido", "registros corrigidos")}</strong> de {resultado.r.totalEncontrado} na prévia.</>,
                ...(resultado.r.ignoradosPorMudanca > 0
                  ? [<>{plural(resultado.r.ignoradosPorMudanca, "registro foi preservado", "registros foram preservados")} porque {resultado.r.ignoradosPorMudanca === 1 ? "mudou" : "mudaram"} durante a aplicação.</>]
                  : []),
              ]}
              rodape={temPendente ? undefined : "Nada mais pendente."}
            />
          )}

          {temPendente ? (
            <>
              <PassosDoReparo etapa="revisar" hrefDosLogs={LOGS} />
              <PainelDoEfeito
                numero={total}
                rotuloDoNumero={total === 1 ? "registro pronto para correção" : "registros prontos para correção"}
                detalheDoNumero={plural(grupos.length, "texto distinto", "textos distintos")}
                faz={[
                  ...linhasDoEfeito.map((l) => <><strong>{l.n}</strong> {l.rotulo} {l.n === 1 ? "volta" : "voltam"} com o “s”</>),
                  <>Uma linha <strong>Texto corrigido</strong> por registro nos Logs, com o seu nome</>,
                ]}
                naoMuda={[
                  "Logs e notificações já enviados",
                  "Texto editado por alguém durante a aplicação",
                  "Mensagens fora da lista revisada",
                ]}
                garantia="A aplicação compara o texto original antes de gravar. Se alguém o editar durante este processo, ele é preservado e fica de fora da atualização."
                rotuloDaAcao={total === 1 ? "Aplicar 1 correção" : `Aplicar ${total} correções`}
                iconeDaAcao={Wand2}
                aoAplicar={confirmarAplicacao}
                aplicando={aplicarMutation.isPending}
                erro={erroAoAplicar}
              />

              <section aria-labelledby="titulo-textos">
                <TituloDeSecao
                  id="titulo-textos"
                  titulo="Textos que serão corrigidos"
                  contagem={grupos.length}
                  descricao={<>Registros com o mesmo texto vêm juntos. Em <Marca tipo="sai">vermelho</Marca>, o espaço que sai; em <Marca tipo="volta">verde</Marca>, a letra que volta.</>}
                />
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {grupos.map(({ exemplo, displayIds }) => (
                    <CartaoDeCorrecao key={`${exemplo.origem}-${exemplo.campo}-${exemplo.antes}`} exemplo={exemplo} displayIds={displayIds} />
                  ))}
                </div>
              </section>
            </>
          ) : !resultado ? (
            <NadaPendente
              titulo="Nenhuma correção pendente"
              descricao="As mensagens revisadas já foram atualizadas. Se um texto novo aparecer com o defeito, ele entra nesta prévia depois de revisado."
              hrefDosLogs={LOGS}
              rotuloDosLogs="Ver correções feitas"
            />
          ) : null}
        </>
      )}
      {dialogo}
    </CascaDaFerramenta>
  );
}

function Marca({ tipo, children }: { tipo: "sai" | "volta"; children: React.ReactNode }) {
  return <mark className={tipo === "sai" ? "adm-sai" : "adm-volta"} style={{ padding: "0 3px", whiteSpace: "normal", color: tipo === "sai" ? TOM.perigo.text : undefined, fontWeight: FW.forte }}>{children}</mark>;
}

function CartaoDeCorrecao({ exemplo, displayIds }: { exemplo: Reparo; displayIds: string[] }) {
  const letras = letrasQueVoltam(exemplo.antes, exemplo.depois);
  const Icone = exemplo.origem === "aprovacao_patrocinador" ? MessageSquareText : FileText;
  const texto: React.CSSProperties = { margin: "8px 0 0", whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: FS.read, lineHeight: 1.65, color: T.strong };
  return (
    <article className="adm-entra" style={CARTAO}>
      <header style={{ display: "flex", flexWrap: "wrap", gap: "10px 18px", alignItems: "center", justifyContent: "space-between", padding: "13px 18px", borderBottom: `1px solid ${T.border}`, backgroundColor: T.bg }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <Icone aria-hidden="true" style={{ width: 16, height: 16, flexShrink: 0, color: T.apoio }} />
          <div style={{ minWidth: 0 }}>
            <h3 style={{ margin: 0, fontSize: FS.body, fontWeight: FW.forte, color: T.text }}>{nomeDaOrigem(exemplo)}</h3>
            <p style={{ margin: "1px 0 0", fontSize: FS.meta, color: T.second }}>
              {plural(displayIds.length, "registro", "registros")}
              {letras ? ` · ${plural(letras, "letra devolvida", "letras devolvidas")}` : ""}
            </p>
          </div>
        </div>
        <ChipsDeIds ids={displayIds} nome={{ um: "registro", varios: "registros" }} />
      </header>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(300px, 100%), 1fr))", gap: 1, backgroundColor: T.border }}>
        <div style={{ padding: "14px 18px 16px", backgroundColor: T.surface }}>
          <span style={{ ...ROTULO_CAIXA_ALTA, display: "flex", alignItems: "center", gap: 7, color: TOM.perigo.text }}>
            <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: 99, backgroundColor: TOM.perigo.dot }} />Como está
          </span>
          <p style={texto}><TextoComDiferenca antes={exemplo.antes} depois={exemplo.depois} lado="antes" /></p>
        </div>
        <div style={{ padding: "14px 18px 16px", backgroundColor: T.surface }}>
          <span style={{ ...ROTULO_CAIXA_ALTA, display: "flex", alignItems: "center", gap: 7, color: TOM.sucesso.text }}>
            <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: 99, backgroundColor: TOM.sucesso.dot }} />Como ficará
          </span>
          <p style={texto}><TextoComDiferenca antes={exemplo.antes} depois={exemplo.depois} lado="depois" /></p>
        </div>
      </div>
    </article>
  );
}
