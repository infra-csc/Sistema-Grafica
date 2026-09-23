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
    <div role="status" aria-label="Carregando evento" data-testid="skeleton-evento" style={{ padding: isMobile ? '12px 12px' : '28px 40px', height: '100%', overflowY: 'auto', maxWidth: '1400px', margin: '0 auto', backgroundColor: N.n2 }}>
      <div className="motion-safe:animate-pulse" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={bloco(130, 12, { marginBottom: 12 })} />
        <div style={bloco(110, 10)} />
        <div style={bloco(isMobile ? '85%' : 420, 26)} />
        <div style={bloco(isMobile ? '70%' : 300, 12)} />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[120, 150, 110, 130].map((w, i) => <div key={i} style={bloco(w, 26, { borderRadius: 999 })} />)}
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 20 }}>
          {[0, 1].map((i) => <div key={i} style={{ ...cartao, width: 230, maxWidth: '100%', height: 92 }} />)}
        </div>
        <div style={{ ...cartao, height: 128 }} />
        <div style={{ ...cartao, padding: 16, display: 'flex', flexDirection: 'column', gap: 14, marginTop: 16 }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
              <div style={bloco(54, 12)} />
              <div style={bloco(32, 32)} />
              <div style={bloco(`${38 - i * 4}%`, 12)} />
              <div style={bloco(70, 20, { marginLeft: 'auto', borderRadius: 999 })} />
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
export function EventoIndisponivel({ eventError, refetchEvent }: { eventError: boolean; refetchEvent: () => void }) {
  return (
    <div style={{ padding: 24 }}>
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
