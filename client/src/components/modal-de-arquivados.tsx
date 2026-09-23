// ─────────────────────────────────────────────────────────────────────────────
// A LISTA DOS ARQUIVADOS — eventos e patrocinadores.
//
// "Excluir" arquiva (server/services/arquivamento.ts): a linha fica, some das
// telas e nada é apagado. Sem esta lista, arquivar era um caminho só de ida
// para quem usa o app — a restauração existia só por API. Aqui o admin vê o
// que foi arquivado, por quem e quando, e devolve com um clique.
//
// O componente só desenha. Quem usa decide a pergunta de confirmação, a
// mutação e o que invalidar (evento traz peças junto; patrocinador, não).
// ─────────────────────────────────────────────────────────────────────────────
import { Archive, RotateCcw } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { HIDE_NATIVE_CLOSE, ModalHeader, modalSurface } from "@/components/modal-shell";
import { Botao } from "@/components/ui/botao";
import { EstadoErro, EstadoVazio, Esqueleto } from "@/components/ui/estados";
import { useIsMobile, usePonteiroGrosso } from "@/hooks/use-mobile";
import { T, TOM, FS, FW, R } from "@/lib/theme";

export interface LinhaArquivada {
  id: string;
  nome: string;
  /** O que mais ajuda a reconhecer a linha ("12 peças · evento em 10/03/2026"). */
  detalhe?: string;
  arquivadoEm: string | Date | null;
  arquivadoPor: string | null;
}

export interface ModalDeArquivadosProps {
  aberto: boolean;
  aoFechar: () => void;
  titulo: string;
  /** O que acontece ao restaurar, em uma frase — o admin decide por ela. */
  explicacao: string;
  linhas: LinhaArquivada[];
  carregando: boolean;
  erro: boolean;
  aoTentarDeNovo: () => void;
  aoRestaurar: (linha: LinhaArquivada) => void;
  /** Id da linha cujo restaurar está em voo (spinner só nela). */
  restaurandoId: string | null;
  /** Prefixo dos data-testid: `${prefixo}-lista`, `${prefixo}-restaurar-<id>`. */
  prefixo: string;
}

/** "Arquivado em 20/09/2026 às 09:00 por Ana" — sem o "por" quando não se sabe quem. */
export function quemEQuando(linha: Pick<LinhaArquivada, "arquivadoEm" | "arquivadoPor">): string {
  const data = linha.arquivadoEm ? new Date(linha.arquivadoEm) : null;
  const quando = data && !Number.isNaN(data.getTime())
    ? ` em ${format(data, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`
    : "";
  const quem = linha.arquivadoPor ? ` por ${linha.arquivadoPor}` : "";
  return `Arquivado${quando}${quem}`;
}

export function ModalDeArquivados({
  aberto, aoFechar, titulo, explicacao, linhas, carregando, erro, aoTentarDeNovo,
  aoRestaurar, restaurandoId, prefixo,
}: ModalDeArquivadosProps) {
  const isMobile = useIsMobile();
  const ponteiroGrosso = usePonteiroGrosso();
  const tamanho = isMobile || ponteiroGrosso ? "toque" : "sm";

  let corpo: React.ReactNode;
  if (carregando) corpo = <Esqueleto variante="lista" linhas={3} rotulo="Carregando os arquivados" />;
  else if (erro) corpo = <EstadoErro compacto titulo="Não foi possível carregar os arquivados" aoTentarDeNovo={aoTentarDeNovo} />;
  else if (linhas.length === 0) corpo = <EstadoVazio compacto icone={Archive} titulo="Nada arquivado" descricao="Quando algo for excluído, ele aparece aqui e pode voltar." />;
  else {
    corpo = (
      <ul data-testid={`${prefixo}-lista`} style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
        {linhas.map((linha) => (
          <li
            key={linha.id}
            data-testid={`${prefixo}-linha-${linha.id}`}
            style={{
              display: "flex", alignItems: "center", gap: 12, flexWrap: isMobile ? "wrap" : "nowrap",
              padding: "12px 14px", border: `1px solid ${T.border}`, borderRadius: R.md, backgroundColor: T.surface,
            }}
          >
            <div style={{ flex: "1 1 220px", minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: FS.body, fontWeight: FW.forte, color: T.text, overflowWrap: "anywhere" }}>{linha.nome}</p>
              <p style={{ margin: "2px 0 0", fontSize: FS.meta, color: T.second, lineHeight: 1.45 }}>
                {quemEQuando(linha)}
                {linha.detalhe ? ` · ${linha.detalhe}` : ""}
              </p>
            </div>
            <Botao
              variante="secundario"
              tamanho={tamanho}
              icone={RotateCcw}
              carregando={restaurandoId === linha.id}
              onClick={() => aoRestaurar(linha)}
              data-testid={`${prefixo}-restaurar-${linha.id}`}
              aria-label={`Restaurar ${linha.nome}`}
              style={{ flexShrink: 0, width: isMobile ? "100%" : undefined }}
            >
              Restaurar
            </Botao>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <Dialog open={aberto} onOpenChange={(o) => { if (!o) aoFechar(); }}>
      <DialogContent className={`p-0 gap-0 border-none ${HIDE_NATIVE_CLOSE}`} style={modalSurface(560)} data-testid={`${prefixo}-modal`}>
        <DialogTitle className="sr-only">{titulo}</DialogTitle>
        <DialogDescription className="sr-only">{explicacao}</DialogDescription>
        <ModalHeader
          icon={Archive}
          title={titulo}
          subtitle={carregando || erro ? undefined : `${linhas.length} ${linhas.length === 1 ? "arquivado" : "arquivados"}`}
          tint={TOM.neutro.text}
          onClose={aoFechar}
        />
        <div style={{ padding: "16px 24px 24px", overflowY: "auto", flex: "1 1 auto", minHeight: 0 }}>
          <p style={{ margin: "0 0 14px", fontSize: FS.meta, color: T.apoio, lineHeight: 1.5 }}>{explicacao}</p>
          {corpo}
        </div>
      </DialogContent>
    </Dialog>
  );
}
