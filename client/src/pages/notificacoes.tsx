// ─────────────────────────────────────────────────────────────────────────────
// NOTIFICAÇÕES — a central do admin (dono, 27/08: "ver o que mandou e o que
// não mandou" + "administrar quem recebe, bem amplo").
//
// Três blocos, na ordem em que o admin pergunta:
//   1. AS CHAVES — produção, canal de e-mail, remetente, GESTAO/REVISAO
//      ligadas. É a resposta de 80% dos "ninguém recebeu".
//   2. QUEM RECEBE — as três listas nomeadas, editáveis aqui (banco). Sem
//      linha no banco vale a lista padrão do código; a primeira adição COPIA
//      o padrão junto, então "adicionar alguém" nunca significa "remover
//      todo mundo". As regras (Arte por papel, executivo por vínculo) são
//      mostradas como texto — regra não se edita em lista.
//   3. O QUE SAIU — a grade dia × edição dos dois avisos automáticos, lida da
//      trilha. Célula sem registro em horário já passado = "não rodou", que é
//      exatamente o caso que não aparecia em lugar nenhum (o das 18h de 27/08).
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Send, Loader2, X, Plus, CheckCircle2, AlertTriangle, MinusCircle } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { FS, R, T, FW, FONT, TOM } from "@/lib/theme";
import { Botao } from "@/components/ui/botao";
import { EstadoErro } from "@/components/ui/estados";
import { useConfirmar } from "@/components/ui/usar-confirmar";

interface Edicao {
  aviso: "gestao" | "revisao";
  dia: string;
  hora: number;
  manual: boolean;
  status: "enviado" | "vazio" | "falhou" | "simulado" | "desligado" | "outro";
  desfecho: string;
  em: string;
}
interface Canal {
  canal: "gestao" | "revisao" | "book";
  titulo: string;
  descricao: string;
  padrao: string[];
  personalizados: { id: string; email: string; addedBy?: string | null }[];
  emUso: string[];
}
interface Retrato {
  servidorNoArDesde?: string;
  agora: { dia: string; hora: number; minuto: number };
  horarios: number[];
  chaves: {
    producao: boolean; emailsLigados: boolean; simulacao: boolean;
    remetente: string | null; gestaoLigada: boolean; revisaoLigada: boolean;
  };
  canais: Canal[];
  edicoes: Edicao[];
}

interface AchadoDeSaude {
  chave: string;
  titulo: string;
  explicacao: string;
  gravidade: "critico" | "alto" | "medio";
  quantas: number;
  amostra: string[];
}
interface RetratoDaSaude {
  achados: AchadoDeSaude[];
  verificadas: number;
  em: string;
}

const DIAS_NA_GRADE = 10;

/** Dias da grade: hoje para trás, no fuso da operação (o `dia` vem do servidor). */
function diasAteHoje(diaDeHoje: string, n: number): string[] {
  const [y, m, d] = diaDeHoje.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));
  return Array.from({ length: n }, (_, i) => {
    const dt = new Date(base);
    dt.setUTCDate(dt.getUTCDate() - i);
    return dt.toISOString().slice(0, 10);
  });
}

const rotuloDia = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;

export default function Notificacoes() {
  const { toast } = useToast();
  const { confirmar, dialogo } = useConfirmar();
  const isMobile = useIsMobile();
  const { data, isLoading, isError, refetch } = useQuery<Retrato>({ queryKey: ["/api/admin/notificacoes"] });
  // SAÚDE DOS DADOS (08/09): as contradições que nenhuma tela vê sozinha —
  // foi um par proibido (peça isenta E aguardando patrocinador) que escondeu
  // 12 peças por 11 dias. Roda ao abrir a tela; falha aqui não derruba o resto.
  const { data: saude, isLoading: saudeCarregando, isError: saudeFalhou, refetch: reconferirSaude, isFetching: saudeReconferindo } =
    useQuery<RetratoDaSaude>({ queryKey: ["/api/admin/consistencia"] });
  const [novoEmail, setNovoEmail] = useState<Record<string, string>>({});
  // A edição clicada na grade: o desfecho dela aparece abaixo da tabela.
  const [detalhe, setDetalhe] = useState<{ rotulo: string; texto: string; desfecho: string } | null>(null);

  const invalidar = () => queryClient.invalidateQueries({ queryKey: ["/api/admin/notificacoes"] });

  const adicionar = useMutation({
    mutationFn: async ({ canal, email }: { canal: string; email: string }) =>
      (await apiRequest("POST", "/api/admin/notificacoes/destinatarios", { canal, email })).json(),
    onSuccess: (_r, v) => {
      invalidar();
      setNovoEmail((p) => ({ ...p, [v.canal]: "" }));
      toast({ title: "Destinatário adicionado", description: v.email });
    },
    onError: (e: any) => toast({ title: "Não foi possível adicionar o destinatário", description: e.message, variant: "destructive" }),
  });

  const remover = useMutation({
    mutationFn: async (id: string) => (await apiRequest("DELETE", `/api/admin/notificacoes/destinatarios/${id}`)).json(),
    onSuccess: (r: any) => {
      invalidar();
      toast({ title: "Destinatário removido", description: r?.removido?.email });
    },
    onError: (e: any) => toast({ title: "Não foi possível remover o destinatário", description: e.message, variant: "destructive" }),
  });

  const disparar = useMutation({
    mutationFn: async (aviso: "gestao" | "revisao") =>
      (await apiRequest("POST", `/api/${aviso}/digest/enviar`, {})).json(),
    onSuccess: (r: any) => {
      invalidar();
      toast({
        title: r.status === "enviado" ? "Aviso enviado" : "Aviso não enviado",
        description: r.mensagem,
        variant: r.status === "enviado" || r.status === "sem-fila" ? undefined : "destructive",
      });
    },
    onError: (e: any) => toast({ title: "Falha no disparo", description: e.message, variant: "destructive" }),
  });

  // CASCA DA PÁGINA — a mesma das outras telas de administração (fundo,
  // rolagem própria, respiro e cabeçalho). Carregando e erro agora moram DENTRO
  // dela: antes os dois devolviam um parágrafo solto no canto, sem título, e a
  // tela "piscava" de um layout para outro quando o retrato chegava.
  const casca = (conteudo: React.ReactNode) => (
    <div style={{ backgroundColor: T.bg, height: "100%", overflowY: "auto", padding: isMobile ? "16px 16px 48px" : "28px 32px 64px" }}>
      <div style={{ maxWidth: 1060 }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ margin: "0 0 6px", fontFamily: FONT.display, fontSize: FS.h1, fontWeight: FW.rotulo, letterSpacing: "-0.03em", lineHeight: 1.1, color: T.text }}>
            Notificações
          </h1>
          <p style={{ margin: 0, fontSize: FS.body, color: T.second, lineHeight: 1.5, maxWidth: 640 }}>
            {/* Delimita a tela: os avisos do sino (GET /api/notifications, por
                usuário) não são configurados aqui, e quem chega procurando
                "por que fulano não viu no sino" precisa saber disso já. */}
            O que o sistema manda por e-mail, para quem, e o que saiu (ou não) em cada edição. Os avisos do sino, dentro do app, não passam por aqui.
          </p>
        </div>
        {conteudo}
      </div>
      {dialogo}
    </div>
  );

  // FALHA: antes `isLoading || !data` cobria também o erro, e a tela ficava
  // para sempre em "Carregando…" — justamente a tela aberta quando "ninguém
  // recebeu o e-mail". Agora o erro se anuncia e oferece a nova tentativa.
  if (isError && !data) {
    return casca(
      <EstadoErro
        titulo="Não foi possível carregar o retrato dos avisos"
        detalhe="Verifique a conexão e tente de novo. Nada foi alterado."
        aoTentarDeNovo={() => refetch()}
      />,
    );
  }

  if (isLoading || !data) {
    // Esqueleto na silhueta dos três blocos (chaves, três listas, grade).
    // Pulso só com motion-safe.
    return casca(
      <div role="status" aria-label="Carregando o retrato dos avisos" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div className="motion-safe:animate-pulse" style={{ height: 54, borderRadius: R.lg, background: T.surface, border: `1px solid ${T.border}` }} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(300px, 100%), 1fr))", gap: 12 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} className="motion-safe:animate-pulse" style={{ height: 150, borderRadius: R.lg, background: T.surface, border: `1px solid ${T.border}` }} />
          ))}
        </div>
        <div className="motion-safe:animate-pulse" style={{ height: 260, borderRadius: R.lg, background: T.surface, border: `1px solid ${T.border}` }} />
      </div>,
    );
  }

  const { chaves, canais, edicoes, agora, horarios } = data;
  const dias = diasAteHoje(agora.dia, DIAS_NA_GRADE);

  const edicaoDe = (aviso: string, dia: string, hora: number, manual: boolean) =>
    edicoes.find((e) => e.aviso === aviso && e.dia === dia && e.hora === hora && e.manual === manual);
  const manuaisDoDia = (dia: string) => edicoes.filter((e) => e.dia === dia && e.manual);

  const chip = (ok: boolean, rotuloOk: string, rotuloRuim: string, neutroSeFalse = false) => (
    // Quebra linha em vez de `nowrap` + altura fixa: "Acompanhamento DESLIGADO
    // (GESTAO_DIGEST_ENABLED=false)" passa de 370px e, no celular, empurrava
    // a página inteira para o lado.
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6, minHeight: 28, padding: "4px 12px", borderRadius: R.pill,
      fontSize: 12, fontWeight: FW.forte, lineHeight: 1.35, overflowWrap: "anywhere", maxWidth: "100%", boxSizing: "border-box",
      background: ok ? TOM.sucesso.bg : neutroSeFalse ? T.bg : TOM.perigo.bg,
      border: `1px solid ${ok ? TOM.sucesso.border : neutroSeFalse ? T.border : TOM.perigo.border}`,
      color: ok ? TOM.sucesso.text : neutroSeFalse ? T.apoio : TOM.perigo.text,
    }}>
      {ok ? <CheckCircle2 aria-hidden="true" style={{ width: 13, height: 13, flexShrink: 0 }} /> : <AlertTriangle aria-hidden="true" style={{ width: 13, height: 13, flexShrink: 0 }} />}
      {ok ? rotuloOk : rotuloRuim}
    </span>
  );

  const celula = (aviso: "gestao" | "revisao", dia: string, hora: number) => {
    const e = edicaoDe(aviso, dia, hora, false);
    const jaPassou = dia < agora.dia || (dia === agora.dia && hora <= agora.hora);
    // T.second (n7) e não T.muted (n6): o traço é TEXTO, e o cinza claro
    // reprova contraste em qualquer superfície do app.
    let texto = "—", bg = "transparent", cor: string = T.second, title = "Horário ainda não chegou";
    if (e) {
      if (e.status === "enviado") { texto = "Enviado"; bg = TOM.sucesso.bg; cor = TOM.sucesso.text; }
      else if (e.status === "vazio") { texto = "Fila vazia"; bg = T.bg; cor = T.second; }
      else if (e.status === "simulado") { texto = "Simulação"; bg = TOM.info.bg; cor = TOM.info.text; }
      else if (e.status === "desligado") { texto = "Desligado"; bg = TOM.perigo.bg; cor = TOM.perigo.text; }
      else { texto = "Falhou"; bg = TOM.perigo.bg; cor = TOM.perigo.text; }
      title = e.desfecho;
    } else if (jaPassou) {
      texto = "Não rodou"; bg = TOM.alerta.bg; cor = TOM.alerta.text;
      title = "Nenhum registro na trilha para esta edição — relógio parado (deploy dormindo/reiniciando), chave desligada, ou versão anterior a 27/08 (que não registrava fila vazia).";
    }
    // O DESFECHO SÓ MORAVA NO `title`: no celular não existe hover, e no
    // desktop ninguém adivinha que a célula tem mais a dizer. Célula com
    // registro (ou "Não rodou") vira botão que abre o desfecho logo abaixo da
    // grade; "—" (horário que não chegou) segue texto — não há o que contar.
    const temDetalhe = texto !== "—";
    const rotulo = `${aviso === "gestao" ? "Acompanhamento" : "Revisão"} · ${rotuloDia(dia)} ${hora}h`;
    const aberta = detalhe?.rotulo === rotulo;
    const selo = { display: "inline-block", minWidth: 74, padding: "3px 8px", borderRadius: 6, fontSize: FS.small, fontWeight: FW.forte, background: bg, color: cor } as const;
    return (
      <td key={`${aviso}-${hora}`} title={title} data-testid={`celula-${aviso}-${dia}-${hora}`}
        style={{ padding: "7px 10px", textAlign: "center", borderLeft: `1px solid ${T.border}` }}>
        {temDetalhe ? (
          <button type="button" aria-expanded={aberta} aria-controls="detalhe-da-edicao"
            aria-label={`${rotulo}: ${texto}. Ver o desfecho`}
            onClick={() => setDetalhe(aberta ? null : { rotulo, texto, desfecho: title })}
            style={{ ...selo, border: "none", cursor: "pointer", font: "inherit", fontSize: FS.small, fontWeight: FW.forte, outline: aberta ? `2px solid ${cor}` : undefined, outlineOffset: 1 }}>
            {texto}
          </button>
        ) : (
          <span style={selo}>{texto}</span>
        )}
      </td>
    );
  };

  // Títulos de seção num degrau só (15/800), em vez de dois rótulos 11px em
  // caixa alta e um h2 de 15 para o terceiro bloco.
  const tituloDeSecao: React.CSSProperties = { margin: 0, fontFamily: FONT.display, fontSize: 15, fontWeight: FW.rotulo, color: T.text };
  const toque = isMobile ? 44 : 36;

  // "CONFERIR DE NOVO" também com a conferência limpa ou com achados: depois
  // de corrigir uma peça, a única forma de ver a lista diminuir era F5.
  const botaoReconferir = (
    <Botao variante="secundario" tamanho="toque" onClick={() => reconferirSaude()}
      carregando={saudeReconferindo}
      data-testid="saude-reconferir"
      style={{ minHeight: toque, fontSize: FS.meta, flex: isMobile ? "1 1 100%" : undefined }}>
      {saudeReconferindo ? "Conferindo…" : "Conferir de novo"}
    </Botao>
  );

  return casca(
      <>
        {/* ── 1 · As chaves ── */}
        <div data-testid="chaves-dos-avisos" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", padding: "12px 14px", borderRadius: R.lg, background: T.surface, border: `1px solid ${T.border}`, marginBottom: 16 }}>
          {data.servidorNoArDesde && (
            <span title="Se esta data for ANTERIOR ao último git pull + Republicar, a produção está rodando código velho — republique." style={{ display: "inline-flex", alignItems: "center", height: 28, padding: "0 12px", borderRadius: R.pill, fontSize: 12, fontWeight: FW.forte, whiteSpace: "nowrap", background: T.bg, border: `1px solid ${T.border}`, color: T.apoio }}>
              Servidor no ar desde {new Date(data.servidorNoArDesde).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          {chip(chaves.producao, "Ambiente de produção", "Fora de produção — nada é enviado daqui", true)}
          {chip(chaves.emailsLigados, "Canal de e-mail ligado", "Canal de e-mail DESLIGADO")}
          {chip(!chaves.simulacao, "Envio real", "MODO SIMULAÇÃO — monta e não envia")}
          {chip(!!chaves.remetente, `Remetente: ${chaves.remetente ?? ""}`, "SEM remetente configurado")}
          {chip(chaves.gestaoLigada, "Acompanhamento ligado (padrão)", "Acompanhamento DESLIGADO (GESTAO_DIGEST_ENABLED=false)")}
          {chip(chaves.revisaoLigada, "Aviso da revisão ligado (padrão)", "Aviso da revisão DESLIGADO (REVISAO_DIGEST_ENABLED=false)")}
        </div>

        {/* ── 2 · Quem recebe ── */}
        <h2 style={{ ...tituloDeSecao, marginBottom: 10 }}>Quem recebe</h2>
        {/* `min(300px, 100%)`: com 300px fixos, uma coluna mais estreita que
            isso (celular de 320) passava da tela. */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(300px, 100%), 1fr))", gap: 12, marginBottom: 28 }}>
          {canais.map((c) => {
            const usandoPadrao = c.personalizados.length === 0;
            return (
              <div key={c.canal} data-testid={`canal-${c.canal}`} style={{ padding: "14px 14px 12px", borderRadius: R.lg, background: T.surface, border: `1px solid ${T.border}`, display: "flex", flexDirection: "column", gap: 8 }}>
                <div>
                  <p style={{ margin: 0, fontSize: FS.read, fontWeight: FW.rotulo, color: T.text }}>{c.titulo}</p>
                  <p style={{ margin: "3px 0 0", fontSize: FS.small, color: T.second, lineHeight: 1.45 }}>{c.descricao}</p>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {usandoPadrao
                    ? c.padrao.map((email) => (
                        <span key={email} title="Lista padrão do sistema — adicione alguém para a lista virar editável" style={{ display: "inline-flex", alignItems: "center", minHeight: 28, padding: "0 10px", borderRadius: R.pill, background: T.bg, border: `1px dashed ${T.bdark}`, color: T.apoio, fontSize: 12, fontWeight: 600, maxWidth: "100%", overflowWrap: "anywhere" }}>
                          {email}
                        </span>
                      ))
                    : c.personalizados.map((p) => (
                        <span key={p.id} style={{ display: "inline-flex", alignItems: "center", gap: 4, minHeight: 28, padding: "0 2px 0 10px", borderRadius: R.pill, background: TOM.laranja.bg, border: `1px solid ${TOM.laranja.border}`, color: T.accentText, fontSize: 12, fontWeight: 600, maxWidth: "100%", overflowWrap: "anywhere" }}>
                          {p.email}
                          {/* Alvo de 24px (44 no celular; era 17) e realce no
                              hover — o X é a única ação destrutiva da lista. */}
                          <button type="button" onClick={() => remover.mutate(p.id)} disabled={remover.isPending}
                            title={`Remover ${p.email} deste aviso`} aria-label={`Remover ${p.email}`}
                            data-testid={`remover-${p.id}`}
                            onMouseEnter={(e) => { e.currentTarget.style.background = TOM.laranja.border; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                            style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: isMobile ? 44 : 24, height: isMobile ? 44 : 24, margin: isMobile ? "-8px -8px -8px 0" : 0, flexShrink: 0, borderRadius: R.pill, border: "none", background: "transparent", color: T.accentText, cursor: remover.isPending ? "wait" : "pointer", padding: 0, transition: "background-color 0.12s ease" }}>
                            <X aria-hidden="true" style={{ width: 12, height: 12 }} />
                          </button>
                        </span>
                      ))}
                </div>
                {/* "Essa notificação vai para quem?" — o número responde antes
                    de contar chip por chip; `emUso` é a lista que o envio usa
                    de fato (a personalizada, senão a padrão). */}
                <p style={{ margin: 0, fontSize: FS.small, color: T.apoio }}>
                  {c.canal === "book"
                    ? `Até ${c.emUso.length} em cópia oculta (só quem é usuário cadastrado), além da Arte e dos executivos com cliente no evento.`
                    : `Hoje ${c.emUso.length === 1 ? "1 pessoa recebe" : `${c.emUso.length} pessoas recebem`} este aviso.`}
                </p>
                {/* A lista vazia volta à padrão (destinatariosDoCanal:
                    `emails.length > 0 ? emails : [...padrao]`) — remover o
                    último e-mail NÃO silencia o aviso, e isso precisa estar
                    escrito antes do clique no X. */}
                <p style={{ margin: 0, fontSize: FS.micro, color: T.second }}>
                  {usandoPadrao
                    ? "Lista padrão do sistema. Ao adicionar o primeiro e-mail, ela é copiada para cá e vira editável."
                    : "Lista editável — é ela que vale, no lugar da padrão. Se remover todos, volta a valer a padrão."}
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const email = (novoEmail[c.canal] ?? "").trim();
                    if (email) adicionar.mutate({ canal: c.canal, email });
                  }}
                  style={{ display: "flex", gap: 6, marginTop: "auto" }}
                >
                  <input
                    type="email"
                    value={novoEmail[c.canal] ?? ""}
                    onChange={(e) => setNovoEmail((p) => ({ ...p, [c.canal]: e.target.value }))}
                    placeholder="nome.sobrenome@nortemkt.com"
                    aria-label={`E-mail para adicionar em ${c.titulo}`}
                    data-testid={`input-destinatario-${c.canal}`}
                    style={{ flex: 1, minWidth: 0, height: toque, padding: "0 10px", borderRadius: R.md, border: `1px solid ${T.bdark}`, fontSize: 13, color: T.text, background: T.surface }}
                  />
                  {/* Desligado PARECE desligado: antes ficava igual ao ligado e
                      o clique num campo vazio não dava retorno nenhum. */}
                  {(() => {
                    const desligado = adicionar.isPending || !(novoEmail[c.canal] ?? "").trim();
                    return (
                      <button type="submit" disabled={desligado}
                        aria-busy={adicionar.isPending && adicionar.variables?.canal === c.canal}
                        data-testid={`adicionar-destinatario-${c.canal}`}
                        style={{ display: "inline-flex", alignItems: "center", gap: 6, height: toque, padding: "0 14px", borderRadius: R.md, border: "none", background: T.dark, color: T.surface, fontSize: 12, fontWeight: FW.rotulo, cursor: desligado ? "not-allowed" : "pointer", opacity: desligado ? 0.5 : 1, whiteSpace: "nowrap", transition: "opacity 0.15s ease" }}>
                        {adicionar.isPending && adicionar.variables?.canal === c.canal
                          ? <Loader2 aria-hidden="true" className="motion-safe:animate-spin" style={{ width: 13, height: 13 }} />
                          : <Plus aria-hidden="true" style={{ width: 13, height: 13 }} />}
                        Adicionar
                      </button>
                    );
                  })()}
                </form>
              </div>
            );
          })}
        </div>

        {/* ── 3 · O que saiu ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
          <h2 style={tituloDeSecao}>
            O que saiu — últimos {DIAS_NA_GRADE} dias
          </h2>
          <span style={{ flex: 1 }} />
          {(["gestao", "revisao"] as const).map((aviso) => {
            // O giro só no botão clicado: antes os DOIS giravam, e não dava
            // para saber qual aviso estava saindo.
            const esteSaindo = disparar.isPending && disparar.variables === aviso;
            const nome = aviso === "gestao" ? "o acompanhamento" : "o aviso da revisão";
            const quantos = canais.find((c) => c.canal === aviso)?.emUso.length;
            return (
              <Botao key={aviso} variante="secundario" tamanho="toque"
                // CONFIRMAÇÃO: é um e-mail real para a lista inteira, sem
                // desfazer — e o botão fica a um clique de "Adicionar". A
                // pergunta passa a ser do app: o window.confirm mostrava a URL
                // do servidor acima dela e deixava o navegador oferecer
                // "impedir que esta página crie mais diálogos". Marcar isso
                // aqui significaria disparar e-mail para a lista inteira sem
                // pergunta nenhuma.
                onClick={async () => {
                  const para = quantos ? ` para ${quantos} ${quantos === 1 ? "destinatário" : "destinatários"}` : "";
                  if (await confirmar({
                    titulo: `Mandar ${nome} agora${para}?`,
                    descricao: "O e-mail sai na hora e não pode ser recolhido.",
                    confirmar: "Mandar agora",
                    cancelar: "Não mandar",
                    icone: Send,
                  })) disparar.mutate(aviso);
                }}
                disabled={disparar.isPending && !esteSaindo}
                motivo={disparar.isPending && !esteSaindo ? "Espere o outro aviso terminar de sair." : undefined}
                carregando={esteSaindo}
                icone={Send}
                data-testid={`disparar-${aviso}`}
                style={{ minHeight: toque, fontSize: FS.meta, flex: isMobile ? "1 1 100%" : undefined }}>
                {esteSaindo ? "Enviando…" : aviso === "gestao" ? "Mandar acompanhamento agora" : "Mandar aviso da revisão agora"}
              </Botao>
            );
          })}
        </div>
        <div style={{ borderRadius: R.lg, background: T.surface, border: `1px solid ${T.border}`, overflowX: "auto" }}>
          <table data-testid="grade-de-envios" style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                <th rowSpan={2} style={{ padding: "8px 12px", fontSize: 11, fontWeight: FW.rotulo, color: T.apoio, textAlign: "left", textTransform: "uppercase", letterSpacing: "0.06em" }}>Dia</th>
                <th colSpan={horarios.length} style={{ padding: "8px 10px", fontSize: 11, fontWeight: FW.rotulo, color: T.apoio, textTransform: "uppercase", letterSpacing: "0.06em", borderLeft: `1px solid ${T.border}` }}>Acompanhamento</th>
                <th colSpan={horarios.length} style={{ padding: "8px 10px", fontSize: 11, fontWeight: FW.rotulo, color: T.apoio, textTransform: "uppercase", letterSpacing: "0.06em", borderLeft: `1px solid ${T.border}` }}>Revisão</th>
                <th rowSpan={2} style={{ padding: "8px 12px", fontSize: 11, fontWeight: FW.rotulo, color: T.apoio, textTransform: "uppercase", letterSpacing: "0.06em", borderLeft: `1px solid ${T.border}` }}>Manuais</th>
              </tr>
              <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                {(["gestao", "revisao"] as const).flatMap((aviso) =>
                  horarios.map((h) => (
                    <th key={`${aviso}-${h}`} style={{ padding: "5px 10px", fontSize: 11, fontWeight: FW.forte, color: T.second, borderLeft: `1px solid ${T.border}` }}>{h}h</th>
                  )))}
              </tr>
            </thead>
            <tbody>
              {dias.map((dia) => (
                <tr key={dia} style={{ borderBottom: `1px solid ${T.border}` }}>
                  <td style={{ padding: "7px 12px", fontFamily: FONT.mono, fontSize: 12, fontWeight: dia === agora.dia ? 800 : 500, color: dia === agora.dia ? T.text : T.apoio, whiteSpace: "nowrap" }}>
                    {rotuloDia(dia)}{dia === agora.dia ? " · hoje" : ""}
                  </td>
                  {horarios.map((h) => celula("gestao", dia, h))}
                  {horarios.map((h) => celula("revisao", dia, h))}
                  <td style={{ padding: "7px 12px", borderLeft: `1px solid ${T.border}`, whiteSpace: "nowrap" }}>
                    {manuaisDoDia(dia).length === 0
                      ? <span style={{ color: T.second, fontSize: FS.small }}>—</span>
                      : manuaisDoDia(dia).map((e, i) => (
                          <span key={i} title={e.desfecho} style={{ display: "inline-flex", alignItems: "center", gap: 4, marginRight: 4, padding: "2px 7px", borderRadius: 6, fontSize: FS.micro, fontWeight: FW.forte, background: e.status === "enviado" ? TOM.sucesso.bg : TOM.perigo.bg, color: e.status === "enviado" ? TOM.sucesso.text : TOM.perigo.text, border: `1px solid ${T.border}` }}>
                            {e.aviso === "gestao" ? "Acomp." : "Revisão"} {e.hora}h
                          </span>
                        ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* O DESFECHO da edição clicada. Região viva: quem clica pelo teclado
            ouve o texto sem precisar achar o painel. */}
        <div id="detalhe-da-edicao" aria-live="polite">
          {detalhe && (
            <div data-testid="detalhe-da-edicao" style={{ marginTop: 8, display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px", borderRadius: R.lg, background: T.surface, border: `1px solid ${T.bdark}` }}>
              <p style={{ margin: 0, flex: 1, fontSize: FS.meta, lineHeight: 1.5, color: T.strong, overflowWrap: "anywhere" }}>
                <strong style={{ color: T.text }}>{detalhe.rotulo} — {detalhe.texto}.</strong> {detalhe.desfecho}
              </p>
              <button type="button" onClick={() => setDetalhe(null)} aria-label="Fechar o desfecho"
                style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: toque, height: toque, flexShrink: 0, border: "none", borderRadius: R.md, background: "transparent", color: T.apoio, cursor: "pointer" }}>
                <X aria-hidden="true" style={{ width: 14, height: 14 }} />
              </button>
            </div>
          )}
        </div>
        {/* LEGENDA: seis palavras de status sem explicação em lugar nenhum.
            "Fila vazia" e "Simulação" em especial liam como falha. */}
        <p data-testid="legenda-da-grade" style={{ margin: "8px 0 0", fontSize: FS.small, lineHeight: 1.55, color: T.apoio }}>
          <strong>Enviado</strong>: saiu para a lista · <strong>Fila vazia</strong>: não havia o que avisar, nada enviado (normal) · <strong>Simulação</strong>: montado e não enviado · <strong>Desligado</strong>/<strong>Falhou</strong>: não saiu — o desfecho diz o motivo · <strong>Não rodou</strong>: nenhum registro. Clique numa célula para ver o desfecho.
        </p>
        <p style={{ margin: "8px 0 0", fontSize: 11, color: T.second, display: "flex", alignItems: "center", gap: 5 }}>
          <MinusCircle aria-hidden="true" style={{ width: 11, height: 11, flexShrink: 0 }} />
          "Não rodou" antes de 27/08 pode ser só a versão antiga, que não registrava edição de fila vazia — desde 27/08, toda edição deixa rastro.
        </p>

        {/* ── 4 · Saúde dos dados (08/09) ──────────────────────────────────────
            Uma peça pode dizer duas coisas opostas ao mesmo tempo — e cada tela
            acreditar em metade. Foi assim que 12 peças do Ministério ficaram 11
            dias fora da fila do Atendimento enquanto a Gestão de Prazos as
            cobrava. Aqui é o lugar que CRUZA: pergunta pelo que o produto
            afirma ser impossível, e mostra se algum caso existe. */}
        <h2 style={{ ...tituloDeSecao, margin: "28px 0 4px" }}>
          Saúde dos dados
        </h2>
        <p style={{ margin: "0 0 10px", fontSize: FS.meta, color: T.apoio }}>
          Contradições que nenhuma tela percebe sozinha, porque cada uma acredita em metade do dado.
        </p>

        {saudeCarregando && (
          <p role="status" style={{ display: "flex", alignItems: "center", gap: 8, margin: 0, padding: "12px 14px", borderRadius: R.lg, background: T.surface, border: `1px solid ${T.border}`, fontSize: 13, color: T.apoio }}>
            <Loader2 aria-hidden="true" className="motion-safe:animate-spin" style={{ width: 14, height: 14 }} />
            Conferindo…
          </p>
        )}

        {saudeFalhou && (
          <div data-testid="saude-falhou" role="alert" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "12px 14px", borderRadius: R.lg, background: TOM.perigo.bg, border: `1px solid ${TOM.perigo.border}`, fontSize: 13, color: TOM.perigo.text }}>
            <span style={{ flex: "1 1 260px" }}>
              Não foi possível conferir agora. Enquanto isso, estas verificações estão sem vigilância.
            </span>
            {/* Nova tentativa aqui mesmo: "recarregue a página (F5)" jogava fora
                a tela inteira para refazer uma consulta só. */}
            <Botao variante="secundario" tamanho="toque" onClick={() => reconferirSaude()}
              carregando={saudeReconferindo}
              style={{ minHeight: toque, fontSize: FS.meta, color: TOM.perigo.text, borderColor: TOM.perigo.border, flex: isMobile ? "1 1 100%" : undefined }}>
              {saudeReconferindo ? "Conferindo…" : "Conferir de novo"}
            </Botao>
          </div>
        )}

        {saude && saude.achados.length === 0 && (
          <div data-testid="saude-limpa" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "12px 14px", borderRadius: R.lg, background: TOM.sucesso.bg, border: `1px solid ${TOM.sucesso.border}`, fontSize: 13, color: TOM.sucesso.text }}>
            <CheckCircle2 style={{ width: 15, height: 15, flexShrink: 0 }} />
            <span style={{ flex: "1 1 220px" }}>Nenhuma contradição encontrada — {saude.verificadas} verificações.</span>
            {botaoReconferir}
          </div>
        )}

        {saude && saude.achados.length > 0 && (
          <div data-testid="saude-achados" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {/* O PRÓXIMO PASSO. A lista dizia o que está errado e parava —
                o admin ficava com números de peça na mão e nenhum caminho.
                A busca global (Ctrl+K) acha a peça pelo código. */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: FS.meta, lineHeight: 1.5, color: T.strong }}>
              <span style={{ flex: "1 1 260px" }}>
                Para corrigir: abra cada peça pela busca do topo (Ctrl+K) usando o número listado, ajuste o que está em conflito e confira de novo.
              </span>
              {botaoReconferir}
            </div>
            {saude.achados.map((a) => {
              const cor = a.gravidade === "critico"
                ? { bg: TOM.perigo.bg, borda: TOM.perigo.border, texto: TOM.perigo.text, rotulo: "Crítico" }
                : a.gravidade === "alto"
                  ? { bg: TOM.alerta.bg, borda: TOM.alerta.border, texto: TOM.alerta.text, rotulo: "Alto" }
                  : { bg: T.bg, borda: T.border, texto: T.apoio, rotulo: "Médio" };
              return (
                <div key={a.chave} data-testid={`saude-${a.chave}`} style={{ padding: "12px 14px", borderRadius: R.lg, background: cor.bg, border: `1px solid ${cor.borda}` }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: FS.micro, fontWeight: FW.rotulo, letterSpacing: "0.06em", textTransform: "uppercase", color: cor.texto }}>{cor.rotulo}</span>
                    <strong style={{ fontSize: FS.read, color: T.text }}>{a.titulo}</strong>
                    {a.quantas > 0 && (
                      <span style={{ fontSize: 12, fontWeight: FW.forte, color: cor.texto }}>
                        · {a.quantas} {a.quantas === 1 ? "peça" : "peças"}
                      </span>
                    )}
                  </div>
                  <p style={{ margin: "5px 0 0", fontSize: FS.meta, lineHeight: 1.5, color: cor.texto }}>{a.explicacao}</p>
                  {a.amostra.length > 0 && (
                    <p style={{ margin: "6px 0 0", fontSize: 12, color: T.apoio, fontFamily: "ui-monospace, monospace" }}>
                      {a.amostra.join("  ")}{a.quantas > a.amostra.length ? `  …e mais ${a.quantas - a.amostra.length}` : ""}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </>,
  );
}
