// ─────────────────────────────────────────────────────────────────────────────
// "OPERADORES DESTE LOGIN" — Administração → Usuários (dono, 21/10).
//
// No login compartilhado da Gráfica, o admin cadastra quem opera (Gilmar,
// Elias, Harisson), renomeia, desativa e REDEFINE o PIN — que só limpa: quem
// cria o PIN é o próprio operador, no próximo acesso. O admin nunca vê nem
// digita o PIN de ninguém (nem existe campo para isso aqui).
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { KeyRound, Pencil, Plus, Power, RotateCcw, ScrollText, UsersRound, X, Check, Lock } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { HIDE_NATIVE_CLOSE, ModalFooter, ModalHeader, modalSurface } from "@/components/modal-shell";
import { Botao } from "@/components/ui/botao";
import { Selo } from "@/components/ui/selo";
import { EstadoErro, EstadoVazio, Esqueleto } from "@/components/ui/estados";
import { useConfirmar } from "@/components/ui/usar-confirmar";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile, usePonteiroGrosso } from "@/hooks/use-mobile";
import { userInitials } from "@/lib/utils";
import { FONT, FS, FW, N, R, T, TOM } from "@/lib/theme";
import { NOME_DO_OPERADOR_MAX, problemaNoNomeDoOperador, type OperadorDoAdmin } from "@shared/operadores";

const HORA = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });

const campo: React.CSSProperties = {
  width: "100%", minHeight: 44, padding: "10px 14px",
  backgroundColor: N.n3, border: "none", borderRadius: R.md, fontSize: FS.body, color: T.text,
};

export function OperadoresDoLogin({ login, aberto, onFechar }: {
  login: { id: string; name: string; email: string } | null;
  aberto: boolean;
  onFechar: () => void;
}) {
  const isMobile = useIsMobile();
  // Alvo pelo PONTEIRO: 44 no dedo (tablet do galpão), 36 no mouse.
  const tamanhoDaAcao = usePonteiroGrosso() || isMobile ? "toque" : "md";
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { confirmar, dialogo } = useConfirmar();
  const [novo, setNovo] = useState("");
  const [erroNovo, setErroNovo] = useState<string | null>(null);
  const [editando, setEditando] = useState<{ id: string; nome: string } | null>(null);
  const chave = ["/api/users", login?.id ?? "", "operadores"];

  const lista = useQuery<OperadorDoAdmin[]>({
    queryKey: chave,
    queryFn: async () => (await apiRequest<OperadorDoAdmin[]>("GET", `/api/users/${login!.id}/operadores`)).json(),
    enabled: aberto && !!login,
    staleTime: 0,
  });
  const atualizar = () => {
    void queryClient.invalidateQueries({ queryKey: chave });
    void queryClient.invalidateQueries({ queryKey: ["/api/users"], exact: true });
  };

  const adicionar = useMutation({
    mutationFn: async (nome: string) => (await apiRequest<OperadorDoAdmin>("POST", `/api/users/${login!.id}/operadores`, { nome })).json(),
    onSuccess: (op) => {
      setNovo(""); setErroNovo(null); atualizar();
      toast({ variant: "success", title: `${op.nome} adicionado`, description: "No primeiro acesso, ele toca no próprio nome e cria o PIN." });
    },
    onError: (e: Error) => setErroNovo(e.message),
  });
  const alterar = useMutation({
    mutationFn: async (v: { id: string; nome?: string; ativo?: boolean }) =>
      (await apiRequest<OperadorDoAdmin>("PATCH", `/api/operadores/${v.id}`, { nome: v.nome, ativo: v.ativo })).json(),
    onSuccess: () => { setEditando(null); atualizar(); },
    onError: (e: Error) => toast({ variant: "destructive", title: "Não foi possível salvar", description: e.message }),
  });
  const redefinir = useMutation({
    mutationFn: async (id: string) => (await apiRequest<OperadorDoAdmin>("POST", `/api/operadores/${id}/redefinir-pin`)).json(),
    onSuccess: (op) => { atualizar(); toast({ variant: "success", title: `PIN de ${op.nome} redefinido`, description: `${op.nome} cria um PIN novo no próximo acesso.` }); },
    onError: (e: Error) => toast({ variant: "destructive", title: "Não foi possível redefinir o PIN", description: e.message }),
  });

  const enviarNovo = () => {
    const problema = problemaNoNomeDoOperador(novo);
    if (problema) { setErroNovo(problema); return; }
    adicionar.mutate(novo);
  };

  const pedirRedefinir = async (op: OperadorDoAdmin) => {
    const ok = await confirmar({
      titulo: `Redefinir o PIN de ${op.nome}?`,
      descricao: `O PIN atual deixa de valer${op.naMaquina ? ` e ${op.nome} sai da máquina agora` : ""}. No próximo acesso, ${op.nome} toca no próprio nome e cria um PIN novo. Você não vê nem define o PIN.`,
      confirmar: "Redefinir PIN",
      cancelar: "Manter",
      icone: KeyRound,
    });
    if (ok) redefinir.mutate(op.id);
  };
  const pedirAtivo = async (op: OperadorDoAdmin) => {
    if (op.ativo) {
      const ok = await confirmar({
        titulo: `Desativar ${op.nome}?`,
        descricao: `${op.nome} some da tela "Quem está na máquina?"${op.naMaquina ? " e sai da máquina agora" : ""}. O histórico com o nome dele continua. Dá para reativar depois.`,
        confirmar: "Desativar",
        cancelar: "Manter ativo",
        perigo: true,
        icone: Power,
      });
      if (!ok) return;
    }
    alterar.mutate({ id: op.id, ativo: !op.ativo });
  };

  const ativos = (lista.data ?? []).filter((o) => o.ativo).length;
  const salvarNome = () => {
    if (!editando) return;
    const problema = problemaNoNomeDoOperador(editando.nome);
    if (problema) { toast({ variant: "warning", title: problema }); return; }
    alterar.mutate({ id: editando.id, nome: editando.nome });
  };

  return (
    <Dialog open={aberto} onOpenChange={(o) => { if (!o) { setEditando(null); setErroNovo(null); onFechar(); } }}>
      <DialogContent className={`p-0 gap-0 border-none ${HIDE_NATIVE_CLOSE}`} style={modalSurface(600)} data-testid="modal-operadores"
        onOpenAutoFocus={(e) => { e.preventDefault(); document.getElementById("operador-novo-nome")?.focus(); }}>
        <DialogTitle className="sr-only">Operadores deste login</DialogTitle>
        <DialogDescription className="sr-only">Quem usa este login compartilhado e se identifica com o próprio PIN</DialogDescription>
        <div style={{ display: "flex", flexDirection: "column", flex: "1 1 auto", minHeight: 0 }}>
          <ModalHeader
            icon={UsersRound}
            tint={T.accentText}
            title="Operadores deste login"
            subtitle={login ? `${login.name} · ${login.email}` : undefined}
            onClose={onFechar}
            compacto={isMobile}
          />
          <div style={{ padding: isMobile ? "16px 16px 20px" : "20px 28px 24px", overflowY: "auto", flex: "1 1 auto", minHeight: 0, display: "flex", flexDirection: "column", gap: 18 }}>
            <p style={{ margin: 0, fontSize: FS.body, lineHeight: 1.55, color: T.apoio }}>
              Quem usa este login toca no próprio nome e digita o <strong style={{ color: T.text }}>próprio PIN</strong> ao começar, e troca no almoço ou no fim do turno. O histórico grava <strong style={{ color: T.text }}>“{login?.name ?? "Login"} (Nome)”</strong>. Você não vê nem define o PIN: no primeiro acesso, cada um cria o seu.
            </p>

            {/* ── Adicionar ── */}
            <form onSubmit={(e) => { e.preventDefault(); enviarNovo(); }} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label htmlFor="operador-novo-nome" style={{ fontSize: FS.micro, fontWeight: FW.rotulo, color: T.second, textTransform: "uppercase", letterSpacing: "0.16em" }}>Adicionar operador</label>
              <div style={{ display: "flex", gap: 8, flexWrap: isMobile ? "wrap" : "nowrap" }}>
                <input id="operador-novo-nome" data-testid="input-operador-novo" value={novo} maxLength={NOME_DO_OPERADOR_MAX} autoComplete="off"
                  placeholder="Nome, como ele é chamado (ex.: Gilmar)" className="usu-campo"
                  aria-invalid={!!erroNovo} aria-describedby={erroNovo ? "operador-novo-erro" : undefined}
                  onChange={(e) => { setNovo(e.target.value); setErroNovo(null); }}
                  style={{ ...campo, fontSize: isMobile ? FS.lead : FS.body, flex: "1 1 220px" }} />
                <Botao type="submit" variante="primario" tamanho="toque" icone={Plus} carregando={adicionar.isPending} larguraCheia={isMobile} data-testid="button-operador-adicionar">
                  Adicionar
                </Botao>
              </div>
              {erroNovo && <p id="operador-novo-erro" role="alert" style={{ margin: 0, fontSize: FS.meta, color: TOM.perigo.text }}>{erroNovo}</p>}
            </form>

            {/* ── A lista ── */}
            <section aria-labelledby="operadores-lista-titulo">
              <h3 id="operadores-lista-titulo" style={{ margin: "0 0 8px", fontSize: FS.read, fontWeight: FW.forte, fontFamily: FONT.display, color: T.text, letterSpacing: "-0.01em" }}>
                {lista.data ? `${ativos} ${ativos === 1 ? "operador ativo" : "operadores ativos"}` : "Operadores"}
              </h3>
              {lista.isLoading ? (
                <Esqueleto variante="lista" linhas={3} rotulo="Carregando operadores" />
              ) : lista.isError ? (
                <EstadoErro compacto titulo="Não foi possível carregar os operadores" aoTentarDeNovo={() => lista.refetch()} carregando={lista.isFetching} />
              ) : (lista.data ?? []).length === 0 ? (
                <EstadoVazio compacto icone={UsersRound} titulo="Nenhum operador ainda"
                  descricao="Sem operadores, este login funciona como um login comum: tudo fica com o nome do login no histórico." />
              ) : (
                <ul data-testid="lista-operadores" style={{ listStyle: "none", margin: 0, padding: 0, border: `1px solid ${T.border}`, borderRadius: R.lg, overflow: "hidden" }}>
                  {(lista.data ?? []).map((op, i) => {
                    const bloqueado = op.bloqueadoAte && new Date(op.bloqueadoAte).getTime() > Date.now() ? new Date(op.bloqueadoAte) : null;
                    const emEdicao = editando?.id === op.id;
                    return (
                      <li key={op.id} data-testid={`operador-${op.id}`} style={{ display: "flex", alignItems: isMobile ? "flex-start" : "center", flexDirection: isMobile ? "column" : "row", gap: isMobile ? 10 : 12, padding: "12px 14px", borderTop: i === 0 ? "none" : `1px solid ${N.n3}`, backgroundColor: op.ativo ? T.surface : T.low }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: 1, width: isMobile ? "100%" : undefined }}>
                          <span aria-hidden="true" style={{ width: 36, height: 36, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: op.ativo ? TOM.laranja.bg : N.n3, color: op.ativo ? TOM.laranja.text : T.second, fontSize: FS.small, fontWeight: FW.rotulo }}>
                            {userInitials(op.nome)}
                          </span>
                          {emEdicao ? (
                            <form onSubmit={(e) => { e.preventDefault(); salvarNome(); }} style={{ display: "flex", gap: 6, flex: 1, minWidth: 0 }}>
                              <label htmlFor={`operador-nome-${op.id}`} className="sr-only">Novo nome de {op.nome}</label>
                              <input id={`operador-nome-${op.id}`} autoFocus value={editando.nome} maxLength={NOME_DO_OPERADOR_MAX} className="usu-campo" data-testid={`input-operador-nome-${op.id}`}
                                onChange={(e) => setEditando({ id: op.id, nome: e.target.value })}
                                onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); setEditando(null); } }}
                                style={{ ...campo, minHeight: 40, fontSize: isMobile ? FS.lead : FS.body, flex: 1, minWidth: 0 }} />
                              <Botao type="submit" variante="primario" tamanho="toque" icone={Check} carregando={alterar.isPending} aria-label="Salvar o nome" data-testid={`button-operador-salvar-${op.id}`} />
                              <Botao type="button" variante="secundario" tamanho="toque" icone={X} onClick={() => setEditando(null)} aria-label="Cancelar" />
                            </form>
                          ) : (
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div style={{ fontSize: FS.read, fontWeight: FW.forte, color: op.ativo ? T.text : T.second, overflowWrap: "anywhere" }}>{op.nome}</div>
                              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                                {!op.ativo ? (
                                  <Selo tamanho="sm" tom="neutro">Desativado</Selo>
                                ) : (
                                  <>
                                    {op.naMaquina && <Selo tamanho="sm" tom="laranja" ponto data-testid={`selo-na-maquina-${op.id}`}>Na máquina agora</Selo>}
                                    {bloqueado ? (
                                      <Selo tamanho="sm" tom="perigo" icone={Lock}>PIN bloqueado até {HORA.format(bloqueado)}</Selo>
                                    ) : op.temPin ? (
                                      <Selo tamanho="sm" tom="sucesso">PIN criado</Selo>
                                    ) : (
                                      <Selo tamanho="sm" tom="alerta">Sem PIN — cria no próximo acesso</Selo>
                                    )}
                                  </>
                                )}
                              </div>
                            </div>
                          )}
                          {!emEdicao && isMobile && (
                            <Botao variante="fantasma" tamanho={tamanhoDaAcao} icone={Pencil} onClick={() => setEditando({ id: op.id, nome: op.nome })} aria-label={`Renomear ${op.nome}`} title="Renomear" data-testid={`button-operador-renomear-${op.id}`} style={{ flexShrink: 0 }} />
                          )}
                        </div>
                        {!emEdicao && (
                          <div style={isMobile
                            ? { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8, width: "100%" }
                            : { display: "flex", gap: 6, flexShrink: 0 }}>
                            {!isMobile && (
                              <Botao variante="fantasma" tamanho={tamanhoDaAcao} icone={Pencil} onClick={() => setEditando({ id: op.id, nome: op.nome })} aria-label={`Renomear ${op.nome}`} title="Renomear" data-testid={`button-operador-renomear-${op.id}`} />
                            )}
                            {op.ativo && (op.temPin || bloqueado) && (
                              <Botao variante="secundario" tamanho={tamanhoDaAcao} larguraCheia={isMobile} icone={KeyRound} onClick={() => void pedirRedefinir(op)} carregando={redefinir.isPending && redefinir.variables === op.id} data-testid={`button-operador-redefinir-${op.id}`}>
                                Redefinir PIN
                              </Botao>
                            )}
                            {op.ativo ? (
                              <Botao variante="perigoSecundario" tamanho={tamanhoDaAcao} larguraCheia={isMobile} icone={Power} onClick={() => void pedirAtivo(op)} data-testid={`button-operador-desativar-${op.id}`}>
                                Desativar
                              </Botao>
                            ) : (
                              <Botao variante="secundario" tamanho={tamanhoDaAcao} larguraCheia={isMobile} icone={RotateCcw} onClick={() => void pedirAtivo(op)} data-testid={`button-operador-reativar-${op.id}`}>
                                Reativar
                              </Botao>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
          <ModalFooter fundo={T.bg} style={{ flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "stretch" : "center", justifyContent: "space-between" }}>
            <Botao variante="secundario" tamanho="toque" icone={ScrollText} larguraCheia={isMobile}
              onClick={() => { onFechar(); navigate(`/logs-sistema?busca=${encodeURIComponent(login?.name ?? "")}`); }}>
              Ver os turnos nos Logs
            </Botao>
            <Botao variante="primario" tamanho="toque" larguraCheia={isMobile} onClick={onFechar} data-testid="button-operadores-fechar">Concluir</Botao>
          </ModalFooter>
        </div>
        {dialogo}
      </DialogContent>
    </Dialog>
  );
}
