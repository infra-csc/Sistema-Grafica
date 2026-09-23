import { useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, FilePenLine, ShieldCheck, Wand2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { T, TOM, FS, FW, R } from "@/lib/theme";
import { Botao } from "@/components/ui/botao";
import { CabecalhoDaPagina } from "@/components/ui/cabecalho-da-pagina";
import { EstadoErro, Esqueleto } from "@/components/ui/estados";
import { useConfirmar } from "@/components/ui/usar-confirmar";

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

/** "1 registro" / "3 registros" — o "registro(s)" lia como formulário de repartição. */
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

function nomeDaOrigem(reparo: Reparo) {
  if (reparo.origem === "aprovacao_patrocinador") return "Motivo de patrocinador";
  return reparo.campo === "observations" ? "Observações da peça" : "Motivo da peça";
}

// Rótulo em caixa-alta dos blocos "como está / como ficará".
const rotuloCaixaAlta = {
  fontSize: FS.micro, fontWeight: FW.rotulo, textTransform: "uppercase", letterSpacing: "0.09em",
} as const;

export default function ReparoMotivos() {
  const { toast } = useToast();
  const { confirmar, dialogo } = useConfirmar();
  // Só para o respiro da casca e o botão em largura cheia — coisa de celular.
  const isMobile = useIsMobile();
  const { data, isLoading, isError, refetch } = useQuery<Previa>({
    queryKey: ["/api/admin/reparo-motivos-sem-s"],
  });

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

  const aplicarMutation = useMutation({
    mutationFn: async () => {
      const resposta = await apiRequest("POST", "/api/admin/reparo-motivos-sem-s", { confirm: true });
      return resposta.json() as Promise<Resultado>;
    },
    onSuccess: async (resultado) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/reparo-motivos-sem-s"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      // O servidor já devolvia quantos ficaram de fora por terem sido editados
      // no meio do caminho — e o toast escondia. É exatamente a garantia que o
      // aviso azul promete; o resultado precisa confirmá-la.
      const preservados = resultado.ignoradosPorMudanca ?? 0;
      toast({
        title: "Textos corrigidos",
        description: `${plural(resultado.aplicados, "registro atualizado", "registros atualizados")}.`
          + (preservados > 0 ? ` ${plural(preservados, "foi preservado", "foram preservados")} porque mudou durante a aplicação.` : ""),
        variant: "success",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Não foi possível aplicar as correções", description: error.message, variant: "destructive" });
    },
  });

  const confirmarAplicacao = async () => {
    const total = data?.total ?? 0;
    if (!total || aplicarMutation.isPending) return;
    // Não é perigo: corrige texto, não apaga nada.
    const confirmado = await confirmar({
      titulo: `Aplicar as ${total} correções revisadas agora?`,
      descricao: "Os textos serão atualizados nos itens e nas aprovações de patrocinadores. Logs e notificações existentes não serão modificados.",
      confirmar: "Aplicar correções",
      icone: Wand2,
    });
    if (confirmado) aplicarMutation.mutate();
  };

  const temPendente = !!data?.total;

  // <div>, não <main>: o SidebarInset do App já É o <main> da página — um
  // segundo landmark "principal" aninhado confundia a navegação por regiões
  // do leitor de tela. Casca, respiro e cabeçalho iguais aos das outras telas
  // de administração (Usuários, Logs, Notificações).
  //
  // PARA QUE SERVE E O QUE ACONTECE AO APLICAR — quem abre esta tela pela
  // primeira vez vê "Correção de textos" no menu sem saber se é rotina ou
  // conserto pontual. É conserto de UM bug: nada aqui é trabalho recorrente, e
  // aplicar grava uma linha "Texto corrigido" por registro na trilha
  // (services/reparoMotivosSemS.ts), o que responde "quem mexeu no motivo?".
  return (
    <div style={{ backgroundColor: T.bg, height: "100%", overflowY: "auto", padding: isMobile ? "16px 16px 48px" : "28px 32px 64px" }}>
      <div style={{ maxWidth: 1180 }}>
      <CabecalhoDaPagina
        titulo="Correção de textos"
        subtitulo={data ? (temPendente ? `${plural(data.total, "registro pronto", "registros prontos")} para correção` : "Nenhuma correção pendente") : undefined}
      />
      <div style={{ margin: "-8px 0 24px" }}>
        <p style={{ margin: 0, color: T.second, maxWidth: 640, fontSize: FS.body, lineHeight: 1.5 }}>
          Prévia das mensagens afetadas pelo erro que substituiu a letra “s” por espaços. Só correções revisadas são listadas.
        </p>
        <p style={{ margin: "6px 0 0", color: T.apoio, maxWidth: 680, fontSize: FS.meta, lineHeight: 1.5 }}>
          É um conserto pontual, não uma rotina: confira “como está” e “como ficará” abaixo e aplique uma vez. Cada texto corrigido fica registrado nos Logs do Sistema com o seu nome.
        </p>
      </div>

      {isLoading ? (
        <Esqueleto variante="lista" linhas={3} rotulo="Carregando prévia das correções" />
      ) : isError ? (
        <EstadoErro
          titulo="Não foi possível carregar a prévia"
          detalhe="Nenhum texto foi alterado. Verifique a conexão e tente de novo."
          aoTentarDeNovo={() => refetch()}
        />
      ) : (
        <>
          <section aria-live="polite" style={{ display: "flex", gap: 14, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", padding: "16px 20px", border: `1px solid ${temPendente ? TOM.laranja.border : TOM.sucesso.border}`, borderRadius: R.lg, background: temPendente ? TOM.laranja.bg : TOM.sucesso.bg, marginBottom: 16 }}>
            <div style={{ display: "flex", gap: 11, alignItems: "center" }}>
              {temPendente ? <FilePenLine aria-hidden="true" color={TOM.laranja.text} size={22} style={{ flexShrink: 0 }} /> : <CheckCircle2 aria-hidden="true" color={TOM.sucesso.text} size={22} style={{ flexShrink: 0 }} />}
              <div>
                <strong style={{ display: "block", color: temPendente ? TOM.laranja.text : TOM.sucesso.text, fontSize: FS.strong }}>
                  {temPendente ? `${plural(data!.total, "registro pronto", "registros prontos")} para correção` : "Nenhuma correção pendente"}
                </strong>
                <span style={{ color: T.second, fontSize: FS.meta }}>
                  {temPendente ? `${plural(grupos.length, "texto distinto revisado", "textos distintos revisados")}, agrupados abaixo.` : "As mensagens revisadas já foram atualizadas."}
                </span>
              </div>
            </div>
            {temPendente && (
              // Primário ESCURO, como o de toda tela de administração: aplicar
              // corrige texto, não apaga nada — o vermelho cheio anterior dizia
              // "destrutivo". A confirmação antes de gravar continua.
              <Botao
                variante="primario"
                tamanho={isMobile ? "toque" : "md"}
                icone={Wand2}
                onClick={confirmarAplicacao}
                carregando={aplicarMutation.isPending}
                larguraCheia={isMobile}
              >
                {aplicarMutation.isPending ? "Aplicando…" : `Aplicar ${data!.total} correções`}
              </Botao>
            )}
          </section>

          <section style={{ display: "flex", gap: 8, alignItems: "center", padding: "11px 14px", background: T.surface, border: `1px solid ${T.border}`, borderRadius: R.md, color: T.apoio, fontSize: FS.meta, lineHeight: 1.45, marginBottom: 18 }}>
            <ShieldCheck aria-hidden="true" size={17} style={{ flexShrink: 0, color: TOM.info.text }} />
            A aplicação compara o texto original antes de gravar. Se alguém o editar durante este processo, ele é preservado e fica de fora da atualização.
          </section>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {grupos.map(({ exemplo, displayIds }) => (
              <article key={`${exemplo.origem}-${exemplo.antes}`} style={{ border: `1px solid ${T.border}`, borderRadius: R.lg, overflow: "hidden", background: T.surface }}>
                <div style={{ padding: "12px 16px", background: T.bg, borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <div>
                    <span style={{ ...rotuloCaixaAlta, color: TOM.laranja.text, letterSpacing: "0.08em" }}>{nomeDaOrigem(exemplo)}</span>
                    <strong style={{ display: "block", marginTop: 2, color: T.text, fontSize: FS.body }}>{plural(displayIds.length, "registro", "registros")}</strong>
                  </div>
                  <span style={{ color: T.second, fontSize: FS.small, maxWidth: "100%", overflowWrap: "anywhere" }}>{displayIds.join(", ")}</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(280px, 100%), 1fr))", gap: 1, background: T.border }}>
                  <div style={{ padding: 15, background: TOM.perigo.bg }}>
                    <span style={{ ...rotuloCaixaAlta, color: TOM.perigo.text }}>Como está</span>
                    <p style={{ margin: "8px 0 0", whiteSpace: "pre-wrap", fontSize: FS.meta, color: T.strong, lineHeight: 1.55 }}>{exemplo.antes}</p>
                  </div>
                  <div style={{ padding: 15, background: TOM.sucesso.bg }}>
                    <span style={{ ...rotuloCaixaAlta, color: TOM.sucesso.text }}>Como ficará</span>
                    <p style={{ margin: "8px 0 0", whiteSpace: "pre-wrap", fontSize: FS.meta, color: T.strong, lineHeight: 1.55 }}>{exemplo.depois}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
      </div>
      {dialogo}
    </div>
  );
}
