// ─────────────────────────────────────────────────────────────────────────────
// <DetalheDoLog> — um registro da trilha, inteiro.
//
// A linha da tabela corta a descrição em duas linhas e o ID em oito
// caracteres: é o certo para varrer a lista, e o errado para investigar. O
// texto inteiro morava num `title` — que no toque não existe. Aqui cabem a
// frase completa, o ID completo (com copiar) e o próximo passo da
// investigação: "o que mais esta pessoa fez?".
// ─────────────────────────────────────────────────────────────────────────────
import * as React from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Check, Copy, ScrollText, UserRound, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { HIDE_NATIVE_CLOSE, ModalHeader, modalSurface } from "@/components/modal-shell";
import { Botao } from "@/components/ui/botao";
import { Selo } from "@/components/ui/selo";
import { useIsMobile } from "@/hooks/use-mobile";
import { T, TOM, FS, FW, R, FONT, type NomeDeTom } from "@/lib/theme";

export interface RegistroDaTrilha {
  id: string;
  userName: string;
  action: string;
  entityType: string;
  entityId: string;
  details: string | null;
  createdAt: string;
}

export function DetalheDoLog({
  log, rotuloDaAcao, tomDaAcao, rotuloDaEntidade, descricao, estadoDaCopia, aoCopiar, aoFiltrarPessoa, aoFechar,
}: {
  log: RegistroDaTrilha | null;
  rotuloDaAcao: string;
  tomDaAcao: NomeDeTom;
  rotuloDaEntidade: string;
  descricao: string;
  estadoDaCopia: "copiado" | "falhou" | null;
  aoCopiar: () => void;
  aoFiltrarPessoa: () => void;
  aoFechar: () => void;
}) {
  const isMobile = useIsMobile();
  // Guarda o último registro para a animação de saída não desenhar um vazio.
  const ultimo = React.useRef<RegistroDaTrilha | null>(null);
  if (log) ultimo.current = log;
  const l = log ?? ultimo.current;
  const quando = l ? new Date(l.createdAt) : null;

  return (
    <Dialog open={Boolean(log)} onOpenChange={(aberto) => { if (!aberto) aoFechar(); }}>
      <DialogContent className={`p-0 gap-0 border-none ${HIDE_NATIVE_CLOSE}`} style={modalSurface(560)} data-testid="detalhe-do-log">
        {l && quando && (
          <>
            <DialogTitle className="sr-only">{`${rotuloDaAcao} — ${rotuloDaEntidade}`}</DialogTitle>
            <DialogDescription className="sr-only">{descricao}</DialogDescription>
            <ModalHeader
              icon={ScrollText}
              tint={T.dark}
              title={`${rotuloDaAcao} · ${rotuloDaEntidade}`}
              subtitle={format(quando, "EEEE, dd 'de' MMMM 'de' yyyy 'às' HH:mm:ss", { locale: ptBR })}
              onClose={aoFechar}
              compacto={isMobile}
            />
            <div style={{ padding: isMobile ? "18px 16px" : "22px 28px", overflowY: "auto", flex: "1 1 auto", minHeight: 0, display: "flex", flexDirection: "column", gap: 18 }}>
              <p style={{ margin: 0, fontSize: FS.read, lineHeight: 1.6, color: T.text, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{descricao}</p>

              <dl style={{ margin: 0, display: "grid", gridTemplateColumns: isMobile ? "1fr" : "120px 1fr", gap: isMobile ? "4px" : "12px 16px", borderTop: `1px solid ${T.border}`, paddingTop: 16 }}>
                <Rotulo>Quem</Rotulo>
                <dd style={{ margin: isMobile ? "0 0 10px" : 0, fontSize: FS.body, fontWeight: FW.forte, color: T.text }}>{l.userName}</dd>
                <Rotulo>Ação</Rotulo>
                <dd style={{ margin: isMobile ? "0 0 10px" : 0 }}><Selo tom={tomDaAcao}>{rotuloDaAcao}</Selo></dd>
                <Rotulo>Entidade</Rotulo>
                <dd style={{ margin: isMobile ? "0 0 10px" : 0, fontSize: FS.body, color: T.strong }}>{rotuloDaEntidade}</dd>
                <Rotulo>ID completo</Rotulo>
                <dd style={{ margin: 0, display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <code style={{ fontFamily: FONT.mono, fontSize: FS.meta, color: T.strong, backgroundColor: T.low, border: `1px solid ${T.border}`, borderRadius: R.sm, padding: "3px 8px", overflowWrap: "anywhere", minWidth: 0 }}>{l.entityId}</code>
                  <Botao
                    variante="fantasma"
                    tamanho={isMobile ? "toque" : "sm"}
                    icone={estadoDaCopia === "copiado" ? Check : estadoDaCopia === "falhou" ? X : Copy}
                    onClick={aoCopiar}
                    style={{ flexShrink: 0, color: estadoDaCopia === "copiado" ? TOM.sucesso.text : estadoDaCopia === "falhou" ? TOM.perigo.text : undefined }}
                  >
                    {estadoDaCopia === "copiado" ? "Copiado" : estadoDaCopia === "falhou" ? "Não copiou" : "Copiar"}
                  </Botao>
                </dd>
              </dl>
              {estadoDaCopia === "falhou" && (
                <p role="alert" style={{ margin: "-8px 0 0", fontSize: FS.meta, color: TOM.perigo.text }}>Não foi possível copiar — selecione o ID e copie manualmente.</p>
              )}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, padding: isMobile ? "12px 16px calc(12px + env(safe-area-inset-bottom))" : "14px 28px", borderTop: `1px solid ${T.border}`, flexShrink: 0 }}>
              <Botao variante="secundario" tamanho={isMobile ? "toque" : "md"} icone={UserRound} onClick={aoFiltrarPessoa} larguraCheia={isMobile}>
                Ver só as ações de {l.userName.split(" ")[0]}
              </Botao>
              <Botao variante="fantasma" tamanho={isMobile ? "toque" : "md"} onClick={aoFechar} larguraCheia={isMobile}>Fechar</Botao>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Rotulo({ children }: { children: React.ReactNode }) {
  return <dt style={{ fontSize: FS.micro, fontWeight: FW.rotulo, textTransform: "uppercase", letterSpacing: "0.12em", color: T.second, paddingTop: 3 }}>{children}</dt>;
}
