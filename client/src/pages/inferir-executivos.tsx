import { useState } from "react";
import { AlertTriangle, ArrowUpRight, CircleSlash, RotateCw, UsersRound } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { T, TOM, FS, FW, R, FONT } from "@/lib/theme";
import { Botao, BotaoLink } from "@/components/ui/botao";
import { EstadoErro } from "@/components/ui/estados";
import { useConfirmar } from "@/components/ui/usar-confirmar";
import {
  CARTAO, CabecalhoDaFerramenta, CascaDaFerramenta, EsqueletoDaFerramenta, NadaPendente, PainelDoEfeito,
  PassosDoReparo, ROTULO_CAIXA_ALTA, ResultadoDoReparo, ResumoDaConfirmacao, SemPermissao, TituloDeSecao,
  ehSemPermissao, plural, useLarguraDaCasca,
} from "@/components/admin/ferramenta-de-reparo";

type Proposta = {
  sponsorId: string;
  sponsorName: string;
  decidingName: string;
  totalDecisions: number;
  decisionsByTop: number;
  share: number;
  user: { id: string; name: string; email: string; role: string };
};

type Duvidosa = {
  sponsorId: string;
  sponsorName: string;
  decidingName: string;
  totalDecisions: number;
  decisionsByTop: number;
  reason: string;
};

type Relatorio = {
  totalSponsors: number;
  alreadyAssigned: number;
  withoutExecutive: number;
  claras: Proposta[];
  duvidosas: Duvidosa[];
  semSinal: Array<{ sponsorId: string; sponsorName: string }>;
};

type ResultadoAplicacao = {
  totalPropostasClaras: number;
  aplicados: number;
  duvidosas: number;
  semSinal: number;
};

const pct = (value: number) => `${Math.round(value * 100)}%`;
const iniciais = (nome: string) => nome.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join("");
const maiuscula = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

// Cada vínculo automático vira "updated" em "sponsor" com esta frase na trilha.
const LOGS = `/logs-sistema?acao=updated&entidade=sponsor&busca=${encodeURIComponent("Executivo de conta inferido")}`;
// Onde a decisão manual acontece: o cadastro, já recortado nos sem executivo.
const CADASTRO_SEM_EXECUTIVO = "/patrocinadores?executivo=__none__";

export default function InferirExecutivos() {
  const { toast } = useToast();
  const { confirmar, dialogo } = useConfirmar();
  const isMobile = useIsMobile();
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery<Relatorio>({
    queryKey: ["/api/admin/inferir-executivos"],
  });
  const [resultado, setResultado] = useState<{ r: ResultadoAplicacao; quando: Date } | null>(null);
  const [erroAoAplicar, setErroAoAplicar] = useState<string | null>(null);

  const aplicarMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/admin/inferir-executivos", { confirm: true });
      return response.json() as Promise<ResultadoAplicacao>;
    },
    onMutate: () => setErroAoAplicar(null),
    onSuccess: async (resultado) => {
      setResultado({ r: resultado, quando: new Date() });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/admin/inferir-executivos"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/sponsors"] }),
      ]);
      toast({
        title: "Executivos vinculados",
        description: `${plural(resultado.aplicados, "patrocinador atualizado", "patrocinadores atualizados")}.`,
        variant: "success",
      });
    },
    onError: (error: Error) => {
      setErroAoAplicar(error.message);
      toast({
        title: "Não foi possível aplicar as propostas",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const claras = data?.claras ?? [];
  const duvidosas = data?.duvidosas ?? [];
  const semSinal = data?.semSinal ?? [];
  const temClaras = claras.length > 0;
  const restaManual = duvidosas.length + semSinal.length > 0;

  const confirmarAplicacao = async () => {
    const total = claras.length;
    if (!total || aplicarMutation.isPending) return;
    // Não é perigo: só preenche executivo onde está vazio — nada é apagado.
    const confirmado = await confirmar({
      titulo: total === 1 ? "Vincular o executivo do patrocinador claro agora?" : `Vincular os executivos dos ${total} patrocinadores claros agora?`,
      descricao: (
        <ResumoDaConfirmacao
          numeros={[
            { n: total, rotulo: total === 1 ? "patrocinador ganha executivo de conta" : "patrocinadores ganham executivo de conta" },
            { n: duvidosas.length + semSinal.length, rotulo: "casos duvidosos e sem sinal ficam como estão" },
          ]}
          naoMuda="Casos duvidosos e sem sinal não serão alterados. Cada atualização será registrada na auditoria."
          rodape="Executivos já cadastrados nunca são substituídos. Errou? Corrija no cadastro de Patrocinadores."
        />
      ),
      confirmar: total === 1 ? "Vincular executivo" : "Vincular executivos",
      icone: UsersRound,
    });
    if (confirmado) aplicarMutation.mutate();
  };

  const semPermissao = isError && ehSemPermissao(error);

  // Os números do cadastro — o "como está" da tela, à direita do título.
  const numeros = data && !semPermissao ? (
    <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 14 : 20, flexWrap: "wrap", width: isMobile ? "100%" : undefined }}>
      {/* No celular os três números viram uma grade de 3 colunas iguais:
          soltos, o terceiro caía sozinho na linha de baixo. */}
      <div style={isMobile ? { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, width: "100%" } : { display: "flex", alignItems: "center", gap: 20 }}>
        <Numero rotulo="Patrocinadores" valor={data.totalSponsors} />
        {!isMobile && <span aria-hidden="true" style={{ width: 1, height: 34, backgroundColor: T.border }} />}
        <Numero rotulo="Sem executivo" valor={data.withoutExecutive} cor={data.withoutExecutive > 0 ? TOM.alerta.text : undefined} />
        {!isMobile && <span aria-hidden="true" style={{ width: 1, height: 34, backgroundColor: T.border }} />}
        <Numero rotulo="Já preenchidos" valor={data.alreadyAssigned} />
      </div>
      <Botao variante="secundario" tamanho={isMobile ? "toque" : "md"} icone={RotateCw} carregando={isFetching && !isLoading} onClick={() => refetch()} disabled={aplicarMutation.isPending} larguraCheia={isMobile} style={{ marginLeft: isMobile ? 0 : 4 }}>
        Atualizar prévia
      </Botao>
    </div>
  ) : undefined;

  return (
    <CascaDaFerramenta testId="tela-inferir-executivos">
      <CabecalhoDaFerramenta
        titulo="Inferir executivos"
        testId="title-inferir-executivos"
        estado={isLoading ? "Calculando a prévia…" : data ? (temClaras ? `${plural(claras.length, "proposta clara", "propostas claras")} para aplicar` : "Nenhuma proposta clara pendente") : undefined}
        descricao="Usa o histórico de decisões de cada patrocinador para propor o executivo de conta — e só onde ele está vazio, sem sobrescrever cadastros existentes."
        acoes={numeros}
      />

      {isLoading ? (
        <EsqueletoDaFerramenta rotulo="Calculando a prévia" />
      ) : semPermissao ? (
        <SemPermissao />
      ) : isError ? (
        <EstadoErro
          titulo="Não foi possível carregar a prévia"
          detalhe={<>Nenhum cadastro foi alterado. {error instanceof Error ? error.message : ""}</>}
          aoTentarDeNovo={() => refetch()}
          carregando={isFetching}
          tamanhoDoBotao={isMobile ? "toque" : "md"}
        />
      ) : (
        <>
          {resultado && !temClaras && <PassosDoReparo etapa="feito" hrefDosLogs={LOGS} />}
          {resultado && (
            <ResultadoDoReparo
              titulo="Executivos vinculados"
              quando={resultado.quando}
              hrefDosLogs={LOGS}
              linhas={[
                <><strong>{plural(resultado.r.aplicados, "patrocinador atualizado", "patrocinadores atualizados")}</strong> de {plural(resultado.r.totalPropostasClaras, "proposta clara", "propostas claras")}.</>,
                ...(resultado.r.duvidosas + resultado.r.semSinal > 0
                  ? [<>{plural(resultado.r.duvidosas + resultado.r.semSinal, "caso ficou", "casos ficaram")} para decisão manual (abaixo).</>]
                  : []),
              ]}
            />
          )}

          {temClaras && (
            <>
              <PassosDoReparo etapa="revisar" hrefDosLogs={LOGS} />
              <PainelDoEfeito
                tom="info"
                numero={claras.length}
                rotuloDoNumero={claras.length === 1 ? "proposta clara" : "propostas claras"}
                detalheDoNumero={`${data?.withoutExecutive ?? 0} sem executivo · ${data?.alreadyAssigned ?? 0} já ${data?.alreadyAssigned === 1 ? "preenchido" : "preenchidos"}`}
                faz={[
                  <><strong>{plural(claras.length, "patrocinador ganha", "patrocinadores ganham")}</strong> executivo de conta</>,
                  "Só onde o executivo está vazio no momento da gravação",
                  "Uma linha na auditoria por patrocinador, com a evidência",
                ]}
                naoMuda={[
                  <>{plural(duvidosas.length, "caso duvidoso", "casos duvidosos")} e {semSinal.length} sem sinal histórico</>,
                  <>Executivos já cadastrados ({data?.alreadyAssigned ?? 0})</>,
                ]}
                garantia="Só entram propostas com nome único, usuário do Atendimento e mais de 50% das decisões. Executivos já cadastrados nunca são substituídos."
                rotuloDaAcao={claras.length === 1 ? "Vincular 1 executivo" : `Vincular ${claras.length} executivos`}
                iconeDaAcao={UsersRound}
                aoAplicar={confirmarAplicacao}
                aplicando={aplicarMutation.isPending}
                erro={erroAoAplicar}
              />
            </>
          )}

          {!temClaras && !resultado && (
            restaManual ? (
              <NadaPendente
                titulo="Nenhuma proposta clara pendente"
                descricao={`Nada será vinculado automaticamente. ${plural(duvidosas.length + semSinal.length, "patrocinador pede", "patrocinadores pedem")} decisão manual no cadastro — veja abaixo por quê.`}
                hrefDosLogs={CADASTRO_SEM_EXECUTIVO}
                rotuloDosLogs="Abrir patrocinadores sem executivo"
              />
            ) : (
              <NadaPendente
                titulo="Todos os patrocinadores têm executivo"
                descricao="Não há cadastro vazio para inferir. Os vínculos automáticos feitos antes ficam registrados nos Logs."
                hrefDosLogs={LOGS}
                rotuloDosLogs="Ver vínculos já feitos"
              />
            )
          )}

          {temClaras && (
            <section aria-labelledby="titulo-claras" style={{ marginBottom: 32 }}>
              <TituloDeSecao
                id="titulo-claras"
                titulo="Propostas claras"
                contagem={claras.length}
                descricao="Serão vinculadas ao aplicar. A barra mostra a fatia das decisões tomadas pela pessoa proposta; o traço marca os 50% exigidos."
              />
              <TabelaDeClaras claras={claras} />
            </section>
          )}

          {(temClaras || restaManual || resultado) && (
            <>
              <section aria-labelledby="titulo-duvidosas" style={{ marginBottom: 32 }}>
                <TituloDeSecao
                  id="titulo-duvidosas"
                  titulo="Preservados para decisão manual"
                  contagem={duvidosas.length}
                  tom={duvidosas.length ? "alerta" : undefined}
                  icone={AlertTriangle}
                  descricao="Não serão alterados. O histórico aponta alguém, mas não com segurança — defina o executivo no cadastro."
                  acao={duvidosas.length ? (
                    <BotaoLink href={CADASTRO_SEM_EXECUTIVO} variante="fantasma" tamanho={isMobile ? "toque" : "sm"} icone={ArrowUpRight}>Definir no cadastro</BotaoLink>
                  ) : undefined}
                />
                {duvidosas.length ? (
                  <ul style={{ ...CARTAO, listStyle: "none", margin: 0, padding: 0 }}>
                    {duvidosas.map((caso, i) => (
                      <li key={caso.sponsorId} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "13px 18px", borderTop: i ? `1px solid ${T.border}` : undefined }}>
                        <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: R.pill, flexShrink: 0, marginTop: 6, backgroundColor: TOM.alerta.dot }} />
                        <div style={{ minWidth: 0, flex: 1, display: "flex", flexWrap: "wrap", gap: "4px 20px", justifyContent: "space-between" }}>
                          <div style={{ minWidth: 0 }}>
                            <strong style={{ display: "block", fontSize: FS.read, fontWeight: FW.forte, color: T.text, overflowWrap: "anywhere" }}>{caso.sponsorName}</strong>
                            <span style={{ display: "block", marginTop: 2, fontSize: FS.body, color: TOM.alerta.text }}>{maiuscula(caso.reason)}.</span>
                          </div>
                          <span style={{ fontSize: FS.meta, color: T.second, alignSelf: "center" }}>
                            Quem mais decide: “{caso.decidingName}” · <span style={{ fontFamily: FONT.mono }}>{caso.decisionsByTop} de {caso.totalDecisions}</span>
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p style={{ margin: 0, fontSize: FS.body, color: T.second }}>Nenhum caso duvidoso.</p>
                )}
              </section>

              <section aria-labelledby="titulo-sem-sinal">
                <TituloDeSecao
                  id="titulo-sem-sinal"
                  titulo="Sem sinal histórico"
                  contagem={semSinal.length}
                  icone={CircleSlash}
                  descricao="Estes patrocinadores não serão atribuídos automaticamente: não há decisões registradas para inferir quem cuida da conta."
                />
                {semSinal.length ? (
                  <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {semSinal.map((s) => (
                      <li key={s.sponsorId} style={{ fontSize: FS.body, fontWeight: FW.medio, color: T.strong, backgroundColor: T.surface, border: `1px solid ${T.border}`, borderRadius: R.md, padding: "6px 12px" }}>{s.sponsorName}</li>
                    ))}
                  </ul>
                ) : (
                  <p style={{ margin: 0, fontSize: FS.body, color: T.second }}>Nenhum — todo patrocinador sem executivo tem histórico.</p>
                )}
              </section>
            </>
          )}
        </>
      )}
      {dialogo}
    </CascaDaFerramenta>
  );
}

function Numero({ rotulo, valor, cor }: { rotulo: string; valor: number; cor?: string }) {
  return (
    <div>
      <p style={{ ...ROTULO_CAIXA_ALTA, margin: "0 0 4px", color: T.second, whiteSpace: "nowrap" }}>{rotulo}</p>
      <p style={{ margin: 0, fontFamily: FONT.display, fontSize: FS.h2, fontWeight: FW.forte, lineHeight: 1, color: cor ?? T.text, fontVariantNumeric: "tabular-nums" }}>{valor}</p>
    </div>
  );
}

/** "15 de 18 decisões" com a fatia desenhada e o traço dos 50% da regra. */
function Evidencia({ de, total, fatia }: { de: number; total: number; fatia: number }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontSize: FS.body, fontWeight: FW.forte, color: T.text }}>{de} de {total} decisões</span>
        <span style={{ fontFamily: FONT.mono, fontSize: FS.meta, fontWeight: FW.forte, color: TOM.info.text }}>{pct(fatia)}</span>
      </div>
      <div role="img" aria-label={`${pct(fatia)} das decisões; o mínimo é mais de 50%`} style={{ position: "relative", height: 6, marginTop: 7, borderRadius: R.pill, backgroundColor: T.low }}>
        <span style={{ position: "absolute", inset: 0, width: pct(Math.min(1, Math.max(0, fatia))), borderRadius: R.pill, backgroundColor: TOM.info.text }} />
        <span aria-hidden="true" style={{ position: "absolute", left: "50%", top: -3, bottom: -3, width: 2, borderRadius: 1, backgroundColor: T.surface, boxShadow: `0 0 0 1px ${T.bdark}` }} />
      </div>
    </div>
  );
}

/** As propostas claras: tabela com folga, cartões empilhados no estreito. */
function TabelaDeClaras({ claras }: { claras: Proposta[] }) {
  const estreito = useLarguraDaCasca() < 720;
  return (
    <div style={{ ...CARTAO }}>
      {!estreito && (
        <div aria-hidden="true" style={{ display: "grid", gridTemplateColumns: "1.1fr 1.3fr 1fr", gap: 20, padding: "10px 18px", borderBottom: `1px solid ${T.border}`, backgroundColor: T.bg }}>
          {["Patrocinador", "Executivo proposto", "Evidência"].map((r) => <span key={r} style={{ ...ROTULO_CAIXA_ALTA, color: T.second }}>{r}</span>)}
        </div>
      )}
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {claras.map((proposta, i) => (
          <li key={proposta.sponsorId} className="adm-entra" style={{ display: "grid", gridTemplateColumns: estreito ? "1fr" : "1.1fr 1.3fr 1fr", gap: estreito ? 12 : 20, alignItems: "center", padding: "14px 18px", borderTop: i ? `1px solid ${T.border}` : undefined }}>
            <div style={{ minWidth: 0 }}>
              {estreito && <span style={{ ...ROTULO_CAIXA_ALTA, display: "block", color: T.second, marginBottom: 3 }}>Patrocinador</span>}
              <strong style={{ display: "block", fontSize: FS.read, fontWeight: FW.forte, color: T.text, overflowWrap: "anywhere" }}>{proposta.sponsorName}</strong>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
              <span aria-hidden="true" style={{ width: 30, height: 30, borderRadius: R.pill, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", backgroundColor: TOM.info.bg, border: `1px solid ${TOM.info.border}`, color: TOM.info.text, fontSize: FS.micro, fontWeight: FW.rotulo }}>
                {iniciais(proposta.user.name)}
              </span>
              <div style={{ minWidth: 0 }}>
                <strong style={{ display: "block", fontSize: FS.body, fontWeight: FW.forte, color: T.text, overflowWrap: "anywhere" }}>{proposta.user.name}</strong>
                <span style={{ display: "block", marginTop: 1, fontSize: FS.small, color: T.second, overflowWrap: "anywhere" }}>{proposta.user.email}</span>
              </div>
            </div>
            <Evidencia de={proposta.decisionsByTop} total={proposta.totalDecisions} fatia={proposta.share} />
          </li>
        ))}
      </ul>
    </div>
  );
}
