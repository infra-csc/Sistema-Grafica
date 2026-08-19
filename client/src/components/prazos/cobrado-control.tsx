// "Marcar como cobrado" — o VERBO da tela.
//
// PORQUÊ ESTE ARQUIVO MUDOU DE PESO. A tese da Gestão de Prazos é cobrar, e a
// cobrança era o menor elemento clicável da página: uma pílula de 11px, borda
// cinza, alvo de ~23px, ancorada no canto superior direito do drill — enquanto
// o único preenchimento sólido da tela era um selo de risco PROJETADO.
// Hierarquia visual é promessa: o mais sólido tem que ser o mais urgente.
//
// E o registro deixou de ser um post-it. Ele agora carrega o que foi
// combinado (data prometida + nota), quantas vezes o alvo já foi cobrado, e
// se as peças ANDARAM depois da cobrança — `houveMovimento`, calculado no
// servidor. A frase "cobrado há 5d — segue parado" era afirmada só olhando o
// relógio da cobrança; é uma afirmação factual sobre a equipe exibida com nome
// e sobrenome de quem cobrou, e quando é falsa ou gera cobrança injusta ou
// ensina o diretor a ignorar o campo — que mata o recurso.
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Megaphone, ChevronDown } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/contexts/auth-context";
import type { CobrancaEntry } from "@shared/prazos-contract";
import { addDaysStr, apiErrorMessage, diasTexto, fmtDiaSemana, R, TI } from "./tokens";

/** Horizonte máximo de uma promessa — espelha o servidor (PROMESSA_MAX_DIAS). */
const PROMESSA_MAX_DIAS = 180;
const NOTA_MAX = 280;

/**
 * Linha de status da cobrança, reaproveitada pelo card do quadro.
 *
 * A ordem é deliberada: quem cobrou e quando → quantas vezes → o que foi
 * prometido → se andou. O rótulo mais forte que esta tela pode ter é
 * "promessa vencida há 2d": muda a conversa de "está atrasado" para "você me
 * disse quinta".
 */
export function CobrancaLinha({ cobranca, fontSize = 11 }: { cobranca: CobrancaEntry; fontSize?: number }) {
  const restantes = cobranca.promessaDiasRestantes;
  const promessaVencida = restantes != null && restantes < 0;
  const parado = cobranca.houveMovimento === false;
  // Vermelho reservado ao que é afirmação forte: promessa quebrada ou
  // imobilidade confirmada. "cobrado há 5d" sozinho é fato neutro.
  const tomBase = promessaVencida || (parado && cobranca.daysAgo >= 3) ? TI.red : TI.label;

  return (
    <span style={{ display: "block", fontSize, fontWeight: 600, color: tomBase, lineHeight: 1.5 }}>
      <span title={`Registrada em ${new Date(cobranca.createdAt).toLocaleString("pt-BR")}`}>
        {/* Por extenso: esta linha mora no card do quadro, dois blocos abaixo
            de "Faltam 3 dias" e "pior peça parada há 9 dias". Uma abreviação
            solta no meio de três frases por extenso lê como outro dado. */}
        cobrado {cobranca.daysAgo === 0 ? "hoje" : `há ${diasTexto(cobranca.daysAgo)}`} por {cobranca.userName}
      </span>
      {cobranca.total > 1 && <span> · {cobranca.total}ª cobrança</span>}
      {restantes != null && (
        promessaVencida ? (
          <span style={{ color: TI.red, fontWeight: 800 }}>
            {" · "}promessa vencida há {diasTexto(-restantes)}
          </span>
        ) : restantes === 0 ? (
          <span style={{ color: TI.amber, fontWeight: 700 }}>{" · "}prometido para hoje</span>
        ) : (
          <span style={{ color: TI.secondary }}>
            {" · "}prometido {cobranca.promessaData ? fmtDiaSemana(cobranca.promessaData) : ""}
          </span>
        )
      )}
      {cobranca.houveMovimento === true && (
        <span style={{ color: TI.secondary }}>{" · "}houve movimento depois</span>
      )}
      {parado && (
        <span style={{ color: TI.red, fontWeight: 700 }}>{" · "}nada se moveu desde então</span>
      )}
    </span>
  );
}

/**
 * O MESMO status da CobrancaLinha, em texto corrido — para o `aria-label` do
 * card do quadro, que SUBSTITUI todo o conteúdo interno para o leitor de tela.
 * Sem isto, "promessa vencida há 2d" — o rótulo mais forte da tela — era
 * inaudível exatamente na visão padrão. Deriva das mesmas condições da linha
 * visual para as duas nunca contarem histórias diferentes.
 */
export function cobrancaResumo(cobranca: CobrancaEntry): string {
  const partes = [
    `cobrado ${cobranca.daysAgo === 0 ? "hoje" : `há ${diasTexto(cobranca.daysAgo)}`} por ${cobranca.userName}`,
  ];
  if (cobranca.total > 1) partes.push(`${cobranca.total}ª cobrança`);
  const restantes = cobranca.promessaDiasRestantes;
  if (restantes != null) {
    if (restantes < 0) partes.push(`promessa vencida há ${diasTexto(-restantes)}`);
    else if (restantes === 0) partes.push("prometido para hoje");
    else if (cobranca.promessaData) partes.push(`prometido ${fmtDiaSemana(cobranca.promessaData)}`);
  }
  if (cobranca.houveMovimento === true) partes.push("houve movimento depois");
  if (cobranca.houveMovimento === false) partes.push("nada se moveu desde então");
  return partes.join(", ");
}

interface CobradoControlProps {
  targetType: "event" | "sponsor";
  targetId: string;
  cobranca?: CobrancaEntry;
  /** Dia do NEGÓCIO ("YYYY-MM-DD") vindo do payload — limita a promessa. */
  today?: string;
  /** `primary` = ação principal (sólida). `secondary` = contorno. */
  variant?: "primary" | "secondary";
  /** Campos opcionais "prometido para" e nota (rodapé do modal). */
  showForm?: boolean;
  /** Disclosure com as últimas cobranças (rodapé do modal). */
  showHistorico?: boolean;
  /** `bloco` empilha (rodapé); `inline` mantém tudo na mesma linha. */
  layout?: "bloco" | "inline";
}

export function CobradoControl({
  targetType, targetId, cobranca, today,
  variant = "secondary", showForm = false, showHistorico = false, layout = "inline",
}: CobradoControlProps) {
  const { toast } = useToast();
  // "So visualizar" (decisao do dono, 17/08): a Gestao de Prazos passou a
  // aparecer para todos, e quem nao e admin le tudo e nao registra nada. A
  // trava mora AQUI, e nao em cada chamada, porque um call site novo nasceria
  // sem ela — e o servidor devolveria 403 num botao que a tela ofereceu.
  // Espelha o POST /api/prazos/cobrancas, que segue requireRole("admin").
  const { user } = useAuth();
  const podeCobrar = user?.role === "admin";
  const isMobile = useIsMobile();
  const [formAberto, setFormAberto] = useState(false);
  const [histAberto, setHistAberto] = useState(false);
  const [promessa, setPromessa] = useState("");
  const [nota, setNota] = useState("");
  // Estado otimista pós-registro: guarda o `createdAt` que a prop `cobranca`
  // tinha NO MOMENTO do sucesso ("primeira" quando o alvo nunca fora cobrado).
  // Enquanto o refetch não troca esse createdAt, a linha de status mostra
  // "cobrado agora por você" — antes havia um vão de segundos entre o toast e
  // o dado real em que a tela seguia dizendo "cobrado há 5 dias".
  const [otimistaDesde, setOtimistaDesde] = useState<string | null>(null);
  const mostraOtimista = otimistaDesde !== null
    && (cobranca?.createdAt ?? "primeira") === otimistaDesde;

  const minDia = today;
  const maxDia = today ? addDaysStr(today, PROMESSA_MAX_DIAS) : undefined;
  // Gate no cliente espelhando o do servidor: a data fora da janela é typo de
  // digitação, e um typo aqui envenenaria o rótulo "promessa vencida" para
  // sempre naquele alvo. O servidor continua validando — este é o aviso, não
  // a defesa.
  const promessaForaDaJanela = !!promessa && !!minDia && !!maxDia && (promessa < minDia || promessa > maxDia);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/prazos/cobrancas", {
        targetType,
        targetId,
        promisedFor: promessa || undefined,
        note: nota.trim() || undefined,
      });
      return await res.json();
    },
    onSuccess: () => {
      setOtimistaDesde(cobranca?.createdAt ?? "primeira");
      queryClient.invalidateQueries({ queryKey: ["/api/prazos"] });
      toast({
        title: "Cobrança registrada",
        description: promessa
          ? `Ficou marcado quem cobrou, quando e o prazo prometido (${fmtDiaSemana(promessa)}).`
          : "Ficou marcado quem cobrou e quando.",
      });
      setPromessa(""); setNota(""); setFormAberto(false);
    },
    onError: (e: unknown) => {
      // Sem o tradutor, o corpo JSON da rota — inclusive a instrução do
      // db:push, escrita com cuidado pelo servidor — caía no toast dentro de
      // chaves e aspas, e a tela inteira parecia quebrada num único toast.
      toast({
        title: "Não foi possível registrar a cobrança",
        description: apiErrorMessage(e),
        variant: "destructive",
      });
    },
  });

  const alturaAcao = isMobile ? 44 : 36;
  const primario = variant === "primary";
  const desabilitado = mutation.isPending || promessaForaDaJanela;

  const botao = (
    <button
      type="button"
      onClick={() => mutation.mutate()}
      disabled={desabilitado}
      data-testid={`button-cobrar-${targetType}-${targetId}`}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7,
        padding: "0 16px", height: alturaAcao, borderRadius: R.md,
        border: primario ? "none" : `1px solid ${TI.border}`,
        backgroundColor: primario ? TI.ink : TI.card,
        color: primario ? "#ffffff" : TI.title,
        fontSize: 13, fontWeight: 700,
        cursor: desabilitado ? "default" : "pointer",
        opacity: desabilitado ? 0.6 : 1,
        whiteSpace: "nowrap",
      }}
    >
      <Megaphone aria-hidden="true" style={{ width: 15, height: 15 }} />
      {mutation.isPending ? "Registrando..." : cobranca ? "Cobrar de novo" : "Marcar como cobrado"}
    </button>
  );

  const rotuloCampo: React.CSSProperties = {
    display: "block", fontSize: 11, fontWeight: 700, color: TI.label,
    textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4,
    fontFamily: "'Plus Jakarta Sans', sans-serif",
  };
  const campo: React.CSSProperties = {
    width: "100%", padding: "8px 10px", borderRadius: R.md,
    border: `1px solid ${TI.border}`, backgroundColor: TI.card,
    fontSize: 13, color: TI.title, outlineOffset: 2,
  };

  return (
    <div style={{
      display: "flex",
      flexDirection: layout === "bloco" ? "column" : "row",
      alignItems: layout === "bloco" ? "stretch" : "center",
      gap: 10,
      flexWrap: layout === "bloco" ? "nowrap" : "wrap",
      minWidth: 0,
    }}>
      {/* A versão OTIMISTA cobre o vão entre o POST e o refetch: só o fato
          certo ("cobrado agora por você"), sem inventar promessa nem
          movimento. Vale também para a PRIMEIRA cobrança do alvo, quando nem
          havia linha de status para atualizar. */}
      {mostraOtimista ? (
        <div style={{ minWidth: 0, flex: layout === "inline" ? "1 1 200px" : undefined }}>
          <span style={{ display: "block", fontSize: 12, fontWeight: 600, color: TI.label, lineHeight: 1.5 }}>
            cobrado agora por você
          </span>
        </div>
      ) : cobranca ? (
        <div style={{ minWidth: 0, flex: layout === "inline" ? "1 1 200px" : undefined }}>
          <CobrancaLinha cobranca={cobranca} fontSize={12} />
          {cobranca.nota && (
            <span style={{ display: "block", fontSize: 12, color: TI.secondary, fontStyle: "italic", marginTop: 2 }}>
              “{cobranca.nota}”
            </span>
          )}
          {showHistorico && cobranca.total > 1 && (
            <>
              <button
                type="button"
                onClick={() => setHistAberto((v) => !v)}
                aria-expanded={histAberto}
                aria-controls={histAberto ? `hist-${targetType}-${targetId}` : undefined}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 5, marginTop: 4,
                  background: "none", border: "none", padding: "4px 0",
                  fontSize: 12, fontWeight: 600, color: TI.secondary, cursor: "pointer",
                }}
              >
                <ChevronDown aria-hidden="true" style={{
                  width: 13, height: 13,
                  transform: histAberto ? "rotate(180deg)" : "none",
                  transition: "transform 0.15s ease",
                }} />
                {histAberto ? "Esconder o histórico" : `Ver as ${Math.min(cobranca.total, 5)} últimas cobranças`}
              </button>
              {histAberto && (
                // Teto de 5 vindo do servidor: a régua da pressão ("3 cobranças
                // em 12 dias"), não o log completo — que o audit log já é.
                <ul id={`hist-${targetType}-${targetId}`} style={{ margin: "2px 0 0", padding: "0 0 0 18px", listStyle: "disc" }}>
                  {cobranca.historico.map((h, i) => (
                    <li key={`${h.createdAt}-${i}`} style={{ fontSize: 12, color: TI.secondary, lineHeight: 1.6 }}>
                      {new Date(h.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                      {" · "}{h.userName}
                      {" · "}{h.daysAgo === 0 ? "hoje" : `há ${diasTexto(h.daysAgo)}`}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      ) : null}

      {showForm && podeCobrar && (
        <div>
          <button
            type="button"
            onClick={() => {
              // Recolher DESCARTA o rascunho. O rótulo do estado aberto é
              // "Registrar sem combinar prazo": manter a data/nota digitadas
              // depois dele faria a mutation enviar exatamente o que o
              // diretor achou que tinha jogado fora — e gravaria uma promessa
              // em nome do responsável sem ninguém ter combinado nada.
              if (formAberto) { setPromessa(""); setNota(""); }
              setFormAberto((v) => !v);
            }}
            aria-expanded={formAberto}
            aria-controls={formAberto ? `combinado-${targetType}-${targetId}` : undefined}
            /* ALVO DE 36px: com padding 4px o botao dava 26 de altura, abaixo
               do minimo de ponteiro da casa. minHeight em vez de mais padding
               para o traco nao mudar de lugar — o fundo e transparente, entao
               o que cresce e so a area de clique. */
            style={{
              display: "inline-flex", alignItems: "center", gap: 5, minHeight: 36,
              background: "none", border: "none", padding: "0",
              fontSize: 12, fontWeight: 600, color: TI.secondary, cursor: "pointer",
            }}
          >
            <ChevronDown aria-hidden="true" style={{
              width: 13, height: 13,
              transform: formAberto ? "rotate(180deg)" : "none",
              transition: "transform 0.15s ease",
            }} />
            {formAberto ? "Registrar sem combinar prazo" : "Combinar um prazo (opcional)"}
          </button>
          {formAberto && (
            <div id={`combinado-${targetType}-${targetId}`} style={{ display: "grid", gap: 10, marginTop: 8 }}>
              <div>
                <label htmlFor={`promessa-${targetId}`} style={rotuloCampo}>Prometido para</label>
                <input
                  id={`promessa-${targetId}`}
                  type="date"
                  value={promessa}
                  min={minDia}
                  max={maxDia}
                  onChange={(e) => setPromessa(e.target.value)}
                  data-testid={`input-promessa-${targetType}-${targetId}`}
                  style={{ ...campo, height: alturaAcao }}
                />
              </div>
              <div>
                <label htmlFor={`nota-${targetId}`} style={rotuloCampo}>O que ficou combinado</label>
                <textarea
                  id={`nota-${targetId}`}
                  value={nota}
                  maxLength={NOTA_MAX}
                  rows={2}
                  onChange={(e) => setNota(e.target.value)}
                  placeholder="Ex.: Arte reenvia os 8 layouts até quinta."
                  data-testid={`input-nota-${targetType}-${targetId}`}
                  style={{ ...campo, resize: "vertical" }}
                />
                <span style={{ display: "block", fontSize: 11, color: TI.label, marginTop: 2, textAlign: "right" }}>
                  {nota.length}/{NOTA_MAX}
                </span>
              </div>
            </div>
          )}
          {/* FORA do `formAberto` de propósito: este aviso é a CAUSA do botão
              desabilitado. Escondê-lo junto com o form deixava um botão morto
              sem explicação nenhuma na tela. (Com o recolher limpando o
              rascunho o caso ficou raro — a linha continua como rede.) */}
          {promessaForaDaJanela && (
            <span role="alert" style={{ display: "block", fontSize: 12, fontWeight: 600, color: TI.red, marginTop: 4 }}>
              A promessa precisa cair entre hoje e os próximos {PROMESSA_MAX_DIAS} dias.
            </span>
          )}
        </div>
      )}

      {podeCobrar && (
        <div style={{ display: "flex", justifyContent: layout === "bloco" ? "flex-end" : "flex-start" }}>
          {botao}
        </div>
      )}
    </div>
  );
}
