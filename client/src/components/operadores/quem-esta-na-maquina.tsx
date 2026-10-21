// ─────────────────────────────────────────────────────────────────────────────
// "QUEM ESTÁ NA MÁQUINA?" — a escolha do operador no login compartilhado
// (dono, 21/10: "para quando um sair para o almoço ou troca de turno o outro
// assumir fazendo o login dele").
//
// Tela cheia POR CIMA do app (a tela de trás continua montada: fila, filtros
// e rolagem estão lá quando o próximo entrar). Cartões grandes — é usada de
// pé, no tablet ou no celular da gráfica —, toque no nome → teclado numérico
// do PIN; no primeiro acesso, "Crie seu PIN" com confirmação. O teclado físico
// também vale (números, Backspace, Enter, Esc).
//
// Quem decide tudo é o servidor (server/routes/operadores.ts): PIN errado,
// bloqueio e primeiro acesso chegam como resposta; esta tela só mostra.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ArrowLeft, Delete, KeyRound, Lock, LogOut, Check, ArrowRight } from "lucide-react";
import { ESCURO, FONT, FS, FW, R, T } from "@/lib/theme";
import { Botao } from "@/components/ui/botao";
import { userInitials } from "@/lib/utils";
import { useLogout } from "@/hooks/use-logout";
import { useToast } from "@/hooks/use-toast";
import { useAcoesDoOperador, useEstadoDoOperador } from "@/hooks/use-operador";
import { PIN_MAX, PIN_MIN, TENTATIVAS_DE_PIN, problemaNoPin, type EstadoDosOperadores, type OperadorParaEscolher } from "@shared/operadores";

const HORA = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });
const bloqueadoAte = (op: OperadorParaEscolher, agora = Date.now()) =>
  op.bloqueadoAte && new Date(op.bloqueadoAte).getTime() > agora ? new Date(op.bloqueadoAte) : null;

type Etapa = "pin" | "criar" | "confirmar";

export function QuemEstaNaMaquina({ estado, modoTroca, onVoltar }: {
  estado: EstadoDosOperadores;
  /** Aberta pelo "Trocar": quem está continua até o próximo entrar, e dá para voltar. */
  modoTroca: boolean;
  onVoltar: () => void;
}) {
  const { toast } = useToast();
  const logout = useLogout();
  const { entrar, criarPin } = useAcoesDoOperador();
  const { refetch } = useEstadoDoOperador();
  const [escolhidoId, setEscolhidoId] = useState<string | null>(null);
  const [etapa, setEtapa] = useState<Etapa>("pin");
  const [digitos, setDigitos] = useState("");
  const [primeiro, setPrimeiro] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [tremer, setTremer] = useState(0);
  const tituloRef = useRef<HTMLHeadingElement>(null);

  const escolhido = estado.operadores.find((o) => o.id === escolhidoId) ?? null;
  const bloqueio = escolhido ? bloqueadoAte(escolhido) : null;
  const enviando = entrar.isPending || criarPin.isPending;
  const atual = estado.atual;

  // O operador escolhido saiu da lista (o admin desativou): volta à escolha.
  useEffect(() => { if (escolhidoId && !escolhido) setEscolhidoId(null); }, [escolhidoId, escolhido]);
  // O foco acompanha a etapa: leitor de tela ouve o que mudou.
  useEffect(() => { tituloRef.current?.focus(); }, [escolhidoId, etapa]);

  const escolher = (op: OperadorParaEscolher) => {
    setEscolhidoId(op.id);
    setEtapa(op.temPin ? "pin" : "criar");
    setDigitos(""); setPrimeiro(""); setErro(null);
  };
  const voltarParaEscolha = () => { setEscolhidoId(null); setDigitos(""); setPrimeiro(""); setErro(null); };

  const falhou = useCallback((mensagem: string) => {
    setErro(mensagem);
    setDigitos("");
    setTremer((n) => n + 1);
    // PIN errado pode ter virado bloqueio: o cartão precisa saber.
    void refetch();
  }, [refetch]);

  const concluir = useCallback((nome: string) => {
    toast({ variant: "success", title: `${nome} assumiu a máquina`, description: "Tudo o que você fizer agora fica com o seu nome no histórico." });
  }, [toast]);

  const confirmar = useCallback(() => {
    if (!escolhido || enviando || bloqueio) return;
    if (etapa === "pin") {
      if (digitos.length < PIN_MIN) return;
      entrar.mutate({ operadorId: escolhido.id, pin: digitos }, {
        onSuccess: () => concluir(escolhido.nome),
        onError: (e: Error) => falhou(e.message),
      });
      return;
    }
    if (etapa === "criar") {
      const problema = problemaNoPin(digitos);
      if (problema) { falhou(problema); return; }
      setPrimeiro(digitos); setDigitos(""); setErro(null); setEtapa("confirmar");
      return;
    }
    if (digitos !== primeiro) {
      setPrimeiro(""); setEtapa("criar");
      falhou("Os dois PINs não são iguais. Crie de novo.");
      return;
    }
    criarPin.mutate({ operadorId: escolhido.id, pin: primeiro, confirmacao: digitos }, {
      onSuccess: () => concluir(escolhido.nome),
      onError: (e: Error) => { setPrimeiro(""); setEtapa("criar"); falhou(e.message); },
    });
  }, [escolhido, enviando, bloqueio, etapa, digitos, primeiro, entrar, criarPin, concluir, falhou]);

  const teclar = useCallback((d: string) => {
    if (enviando || bloqueio) return;
    setErro(null);
    setDigitos((v) => (v.length >= PIN_MAX ? v : v + d));
  }, [enviando, bloqueio]);
  const apagar = useCallback(() => { setErro(null); setDigitos((v) => v.slice(0, -1)); }, []);

  // Teclado físico: números, Backspace, Enter; Esc volta um passo.
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (!escolhido) return;
      if (/^\d$/.test(e.key)) { e.preventDefault(); teclar(e.key); }
      else if (e.key === "Backspace") { e.preventDefault(); apagar(); }
      else if (e.key === "Enter") { e.preventDefault(); confirmar(); }
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [escolhido, teclar, apagar, confirmar]);

  const aoEsc = (e: KeyboardEvent) => {
    e.preventDefault();
    if (escolhido) voltarParaEscolha();
    else if (modoTroca) onVoltar();
  };

  const tituloDoPin = etapa === "pin" ? `Olá, ${escolhido?.nome ?? ""}` : etapa === "criar" ? `Primeiro acesso, ${escolhido?.nome ?? ""}` : "Confirme o seu PIN";
  const instrucao = etapa === "pin"
    ? "Digite o seu PIN."
    : etapa === "criar"
    ? `Crie um PIN de ${PIN_MIN} a ${PIN_MAX} números. Só você vai saber — não use 1234 nem números repetidos.`
    : "Digite o mesmo PIN mais uma vez.";
  const rotuloDoOk = etapa === "pin" ? "Entrar" : etapa === "criar" ? "Continuar" : "Criar PIN e entrar";
  const podeConfirmar = digitos.length >= PIN_MIN && !enviando && !bloqueio;

  return (
    <DialogPrimitive.Root open modal>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content
          data-testid="quem-esta-na-maquina"
          className="ds-sobre-escuro qm-tela"
          onEscapeKeyDown={aoEsc}
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          onOpenAutoFocus={(e) => { e.preventDefault(); tituloRef.current?.focus(); }}
          style={{
            position: "fixed", inset: 0, zIndex: 70,
            background: ESCURO.gradiente, color: ESCURO.texto,
            display: "flex", flexDirection: "column",
            overflowY: "auto", outline: "none",
          }}
        >
          {/* Faixa de cima: de que login se trata e a saída. */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "14px 16px", borderBottom: `1px solid ${ESCURO.divisor}`, flexWrap: "wrap" }}>
            <div style={{ minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: FS.micro, fontWeight: FW.rotulo, letterSpacing: "0.16em", textTransform: "uppercase", color: ESCURO.apoio }}>Login compartilhado</p>
              <p data-testid="qm-login" style={{ margin: "2px 0 0", fontSize: FS.strong, fontWeight: FW.forte, color: ESCURO.texto, overflowWrap: "anywhere" }}>{estado.login}</p>
            </div>
            {modoTroca && atual ? (
              <Botao variante="claroFantasma" tamanho="toque" icone={ArrowLeft} onClick={onVoltar} data-testid="qm-voltar">
                Continuar como {atual.nome}
              </Botao>
            ) : (
              <Botao variante="claroFantasma" tamanho="toque" icone={LogOut} carregando={logout.isPending} onClick={() => logout.mutate()} data-testid="qm-sair-do-login">
                Sair do login
              </Botao>
            )}
          </div>

          <div style={{ flex: "1 0 auto", display: "flex", alignItems: "center", justifyContent: "center", padding: "28px 16px 40px" }}>
            {!escolhido ? (
              <section style={{ width: "100%", maxWidth: 760, textAlign: "center" }}>
                <DialogPrimitive.Title asChild>
                  <h1 ref={tituloRef} tabIndex={-1} style={{ margin: 0, fontFamily: FONT.display, fontSize: 30, fontWeight: FW.forte, letterSpacing: "-0.02em", lineHeight: 1.15, outline: "none" }}>
                    Quem está na máquina?
                  </h1>
                </DialogPrimitive.Title>
                <DialogPrimitive.Description style={{ margin: "10px auto 0", maxWidth: 480, fontSize: FS.lead, lineHeight: 1.5, color: ESCURO.apoio }}>
                  {modoTroca && atual
                    ? `${atual.nome} continua até o próximo entrar. Toque no seu nome e digite o seu PIN.`
                    : "Toque no seu nome e digite o seu PIN. Tudo o que você fizer fica com o seu nome no histórico."}
                </DialogPrimitive.Description>
                <ul data-testid="qm-cartoes" style={{ listStyle: "none", margin: "28px 0 0", padding: 0, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 14 }}>
                  {estado.operadores.map((op) => {
                    const ate = bloqueadoAte(op);
                    const naMaquina = atual?.id === op.id;
                    const sub = ate ? `PIN bloqueado até ${HORA.format(ate)}` : naMaquina ? "Na máquina agora" : op.temPin ? "Toque para entrar" : "Primeiro acesso: crie seu PIN";
                    return (
                      <li key={op.id}>
                        <button
                          type="button"
                          className="qm-cartao"
                          data-testid={`qm-operador-${op.id}`}
                          onClick={() => escolher(op)}
                          aria-label={`${op.nome} — ${sub}`}
                          style={{
                            width: "100%", minHeight: 156, padding: "20px 14px 18px",
                            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10,
                            backgroundColor: ESCURO.realce, color: ESCURO.texto,
                            border: `1px solid ${naMaquina ? ESCURO.foco : ESCURO.borda}`, borderRadius: R.xl,
                            cursor: "pointer", fontFamily: FONT.corpo,
                          }}
                        >
                          <AvatarGrande nome={op.nome} destaque={naMaquina} />
                          <span style={{ fontSize: 20, fontWeight: FW.forte, lineHeight: 1.2, overflowWrap: "anywhere" }}>{op.nome}</span>
                          <span style={{ display: "block", fontSize: FS.body, fontWeight: FW.medio, lineHeight: 1.35, color: ate || naMaquina ? ESCURO.foco : ESCURO.apoio }}>
                            {ate ? <Lock aria-hidden="true" style={{ width: 13, height: 13, display: "inline", verticalAlign: "-2px", marginRight: 5 }} /> : !op.temPin ? <KeyRound aria-hidden="true" style={{ width: 13, height: 13, display: "inline", verticalAlign: "-2px", marginRight: 5 }} /> : null}
                            {sub}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : (
              <section style={{ width: "100%", maxWidth: 360, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
                <div style={{ alignSelf: "stretch", display: "flex", marginBottom: 8 }}>
                  <Botao variante="claroFantasma" tamanho="toque" icone={ArrowLeft} onClick={voltarParaEscolha} data-testid="qm-trocar-nome">
                    Não sou {escolhido.nome}
                  </Botao>
                </div>
                <AvatarGrande nome={escolhido.nome} />
                <DialogPrimitive.Title asChild>
                  <h1 ref={tituloRef} tabIndex={-1} style={{ margin: "14px 0 0", fontFamily: FONT.display, fontSize: 26, fontWeight: FW.forte, letterSpacing: "-0.02em", lineHeight: 1.2, outline: "none" }}>
                    {bloqueio ? `PIN de ${escolhido.nome} bloqueado` : tituloDoPin}
                  </h1>
                </DialogPrimitive.Title>
                <DialogPrimitive.Description style={{ margin: "8px 0 0", fontSize: FS.read, lineHeight: 1.5, color: ESCURO.apoio, minHeight: 21 }}>
                  {bloqueio
                    ? `Foram ${TENTATIVAS_DE_PIN} tentativas erradas. Tente de novo às ${HORA.format(bloqueio)} ou peça ao administrador para redefinir o PIN.`
                    : instrucao}
                </DialogPrimitive.Description>

                {bloqueio ? (
                  <div style={{ marginTop: 28, width: "100%" }}>
                    <Lock aria-hidden="true" style={{ width: 40, height: 40, color: ESCURO.foco, margin: "0 auto 20px", display: "block" }} />
                    <Botao variante="claro" tamanho="toque" larguraCheia onClick={voltarParaEscolha}>Escolher outro nome</Botao>
                  </div>
                ) : (
                  <>
                    <Pontos quantos={digitos.length} tremer={tremer} />
                    <p role="alert" data-testid="qm-erro" style={{ margin: "4px 0 0", minHeight: 40, fontSize: FS.read, fontWeight: FW.medio, lineHeight: 1.4, color: ESCURO.foco }}>
                      {erro ?? ""}
                    </p>
                    <Teclado
                      aoTeclar={teclar}
                      aoApagar={apagar}
                      aoConfirmar={confirmar}
                      podeConfirmar={podeConfirmar}
                      enviando={enviando}
                      rotuloDoOk={rotuloDoOk}
                      iconeDoOk={etapa === "criar" ? ArrowRight : Check}
                    />
                  </>
                )}
              </section>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function AvatarGrande({ nome, destaque = false }: { nome: string; destaque?: boolean }) {
  return (
    <span aria-hidden="true" style={{
      width: 60, height: 60, borderRadius: "50%", flexShrink: 0,
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      backgroundColor: destaque ? ESCURO.foco : ESCURO.realceForte,
      color: destaque ? T.text : ESCURO.foco,
      fontFamily: FONT.display, fontSize: 24, fontWeight: FW.forte, letterSpacing: "-0.02em",
    }}>
      {userInitials(nome)}
    </span>
  );
}

/** Os pontos do PIN: os digitados cheios; vazios até o mínimo (4), sem revelar o tamanho do PIN de ninguém. */
function Pontos({ quantos, tremer }: { quantos: number; tremer: number }) {
  const total = Math.max(PIN_MIN, quantos);
  return (
    <div key={tremer} className={tremer > 0 ? "qm-tremer" : undefined} data-testid="qm-pontos" aria-label={`${quantos} ${quantos === 1 ? "número digitado" : "números digitados"}`} role="img"
      style={{ display: "flex", gap: 14, justifyContent: "center", marginTop: 26, height: 18 }}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} style={{
          width: 16, height: 16, borderRadius: "50%",
          backgroundColor: i < quantos ? ESCURO.texto : "transparent",
          border: `2px solid ${i < quantos ? ESCURO.texto : ESCURO.apoio}`,
          transition: "background-color 120ms ease",
        }} />
      ))}
    </div>
  );
}

function Teclado({ aoTeclar, aoApagar, aoConfirmar, podeConfirmar, enviando, rotuloDoOk, iconeDoOk: IconeDoOk }: {
  aoTeclar: (d: string) => void; aoApagar: () => void; aoConfirmar: () => void;
  podeConfirmar: boolean; enviando: boolean; rotuloDoOk: string; iconeDoOk: typeof Check;
}) {
  const tecla: CSSProperties = {
    width: "100%", height: 64, borderRadius: R.lg,
    backgroundColor: ESCURO.realce, color: ESCURO.texto, border: `1px solid ${ESCURO.borda}`,
    fontFamily: FONT.display, fontSize: 26, fontWeight: FW.medio,
    cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center",
  };
  return (
    <div style={{ width: "100%" }}>
      <div role="group" aria-label="Teclado do PIN" data-testid="qm-teclado"
        style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, width: "100%", marginTop: 4 }}>
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button key={d} type="button" className="qm-tecla" style={tecla} onClick={() => aoTeclar(d)} data-testid={`qm-tecla-${d}`}>{d}</button>
        ))}
        <span aria-hidden="true" />
        <button type="button" className="qm-tecla" style={tecla} onClick={() => aoTeclar("0")} data-testid="qm-tecla-0">0</button>
        <button type="button" className="qm-tecla" style={{ ...tecla, backgroundColor: "transparent" }} onClick={aoApagar} aria-label="Apagar o último número" data-testid="qm-apagar">
          <Delete aria-hidden="true" style={{ width: 24, height: 24 }} />
        </button>
      </div>
      <div style={{ marginTop: 14 }}>
        <Botao variante="claro" tamanho="toque" larguraCheia icone={IconeDoOk} tamanhoDoIcone={18} carregando={enviando} disabled={!podeConfirmar} onClick={aoConfirmar} data-testid="qm-confirmar" style={{ minHeight: 56, fontSize: FS.lead }}>
          {rotuloDoOk}
        </Botao>
      </div>
    </div>
  );
}
