// ─────────────────────────────────────────────────────────────────────────────
// OS ESTADOS DA TELA ANTES DO EVENTO — carregando, falhou e não existe.
// ─────────────────────────────────────────────────────────────────────────────
import { Link } from "wouter";
import { ArrowLeft, AlertCircle } from "lucide-react";
import { EstadoErro, EstadoVazio } from "@/components/ui/estados";
import { T, N, FS, FW, R } from "@/lib/theme";

/**
 * SKELETON COM A SILHUETA DA PÁGINA — breadcrumb, nome, chips, os dois
 * cartões da agenda, a timeline e as linhas da tabela — no lugar de dois
 * cards genéricos com um spinner no meio. Quando o evento chega, cada
 * bloco é trocado pelo seu conteúdo no MESMO lugar: nada salta, e a
 * espera parece menor porque a página já "está ali".
 * `motion-safe:`: com movimento reduzido, os blocos ficam parados.
 */
export function EsqueletoDoEvento({ isMobile }: { isMobile: boolean }) {
  const bloco = (w: number | string, h: number, extra?: React.CSSProperties): React.CSSProperties =>
    ({ width: w, maxWidth: '100%', height: h, borderRadius: 6, backgroundColor: T.border, ...extra });
  const cartao: React.CSSProperties = { backgroundColor: T.surface, border: `1px solid ${T.border}`, borderRadius: 12 };
  return (
    <div role="status" aria-label="Carregando evento" data-testid="skeleton-evento" style={{ padding: isMobile ? '12px 12px' : '28px 40px', height: '100%', overflowY: 'auto', width: '100%', maxWidth: '1400px', margin: '0 auto' }}>
      <div className="motion-safe:animate-pulse" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* breadcrumb */}
        <div style={bloco(130, 12, { marginBottom: isMobile ? 6 : 12 })} />
        {/* contexto, nome e ações na mesma linha */}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: '1 1 300px' }}>
            <div style={bloco(160, 10)} />
            <div style={bloco(isMobile ? '85%' : 420, 28)} />
            <div style={bloco(isMobile ? '70%' : 360, 12)} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {(isMobile ? [220, 80] : [80, 130, 140]).map((w, i) => <div key={i} style={bloco(w, 36, { borderRadius: R.md })} />)}
          </div>
        </div>
        {/* o resumo: progresso, total e chips */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', paddingTop: 18, marginTop: 10, borderTop: `1px solid ${T.border}` }}>
          <div style={bloco(132, 8, { borderRadius: 999 })} />
          <div style={bloco(70, 12)} />
          <div style={bloco(120, 12)} />
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[150, 130, 170, 120].map((w, i) => <div key={i} style={bloco(w, 32, { borderRadius: 999 })} />)}
        </div>
        {/* a agenda: datas à esquerda, marcos à direita */}
        <div style={bloco(150, 10, { marginTop: 22 })} />
        <div style={{ ...cartao, height: isMobile ? 230 : 210, display: 'flex', flexDirection: isMobile ? 'column' : 'row', overflow: 'hidden' }}>
          <div style={{ flex: isMobile ? '0 0 76px' : '0 0 248px', backgroundColor: N.n1, borderRight: isMobile ? undefined : `1px solid ${T.border}`, borderBottom: isMobile ? `1px solid ${T.border}` : undefined }} />
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-around', padding: 20 }}>
            {[0, 1, 2, 3, 4, 5].slice(0, isMobile ? 3 : 6).map((i) => <div key={i} style={bloco(14, 14, { borderRadius: 999 })} />)}
          </div>
        </div>
        {/* a lista: um painel, cabeçalho de colunas e linhas */}
        <div style={{ ...cartao, display: 'flex', flexDirection: 'column', marginTop: 28, overflow: 'hidden' }}>
          <div style={{ height: 40, borderBottom: `1px solid ${T.border}` }} />
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} style={{ display: 'flex', gap: 14, alignItems: 'center', padding: '14px 16px', borderTop: i ? `1px solid ${T.border}` : undefined }}>
              <div style={bloco(48, 12)} />
              <div style={bloco(32, 32)} />
              <div style={bloco(`${38 - i * 4}%`, 12)} />
              <div style={bloco(84, 22, { marginLeft: 'auto', borderRadius: 999 })} />
            </div>
          ))}
        </div>
      </div>
      <span className="sr-only">Carregando evento…</span>
    </div>
  );
}

/**
 * Falha de rede e evento inexistente NÃO são a mesma notícia: a primeira
 * pede "tentar de novo"; a segunda, o caminho de volta para a lista.
 */
export function EventoIndisponivel({ eventError, refetchEvent, isMobile = false }: { eventError: boolean; refetchEvent: () => void; isMobile?: boolean }) {
  // O MESMO contêiner da página (padding, largura máxima) e o caminho de
  // volta no topo: o aviso não fica colado na barra nem órfão de navegação.
  return (
    <div style={{ padding: isMobile ? '12px 12px' : '28px 40px', width: '100%', maxWidth: '1400px', margin: '0 auto' }}>
      <nav aria-label="Navegação" style={{ marginBottom: isMobile ? 14 : 20 }}>
        <Link href="/eventos" className="evd-voltar" data-testid="button-back">
          <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" />
          Voltar para eventos
        </Link>
      </nav>
      {eventError ? (
        <EstadoErro
          titulo="Não foi possível carregar o evento"
          detalhe="Verifique sua conexão e tente novamente."
          aoTentarDeNovo={() => refetchEvent()}
        />
      ) : (
        <EstadoVazio
          icone={AlertCircle}
          titulo="Evento não encontrado"
          descricao="Ele pode ter sido excluído, ou o link está incompleto."
          acao={
            // Link de volta: excluído ou link errado, o próximo passo é a lista.
            <Link href="/eventos" data-testid="link-evento-nao-encontrado" className="ds-botao" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, minHeight: 36, padding: '0 14px', borderRadius: R.md, backgroundColor: T.dark, color: T.surface, fontSize: FS.body, fontWeight: FW.forte, textDecoration: 'none' }}>
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Ver todos os eventos
            </Link>
          }
        />
      )}
    </div>
  );
}
