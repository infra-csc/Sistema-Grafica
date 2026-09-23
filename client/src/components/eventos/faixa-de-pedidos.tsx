import { Link } from "wouter";
import { Inbox } from "lucide-react";
import { idadeDoPedido, patrocinadoresDaLinha, quantidadeDoPedido, rotuloDaLinha } from "@shared/pedidos-de-peca";
import { T, FS, R, TOM } from "@/lib/theme";
import { alvo } from "@/hooks/use-mobile";
import type { LinhaAberta } from "./use-eventos-dados";

// ── PEDIDOS DO ATENDIMENTO (dono, 14/09) ──────────────────────────
// "Só dentro do evento vai ser ruim para quem cria a peça." Quem
// monta a lista (Solicitação) e o admin veem aqui, antes de qualquer
// filtro, quantos pedidos esperam e quais são os mais antigos — com
// link direto para o painel de pedidos do evento. Some quando não há
// nenhum.
export function FaixaDePedidos({ linhasAbertas, foco, setFoco, dedo }: {
  linhasAbertas: LinhaAberta[];
  foco: string;
  setFoco: (v: string) => void;
  dedo: boolean;
}) {
  if (linhasAbertas.length === 0) return null;
  const agora = new Date();
  const maisAntigos = [...linhasAbertas].sort((a, b) => new Date(a.pedido.createdAt).getTime() - new Date(b.pedido.createdAt).getTime());
  const n = linhasAbertas.length;
  return (
    <div
      data-testid="faixa-pedidos-atendimento"
      role="status"
      style={{ marginTop: 14, display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap', padding: '12px 16px', backgroundColor: TOM.alerta.bg, border: `1px solid ${TOM.alerta.border}`, borderLeft: `4px solid ${TOM.alerta.text}`, borderRadius: R.lg }}
    >
      <Inbox aria-hidden="true" style={{ width: 18, height: 18, color: TOM.alerta.text, flexShrink: 0, marginTop: 2 }} />
      <div style={{ flex: '1 1 320px', minWidth: 0 }}>
        <div style={{ fontSize: FS.body + 1, fontWeight: 800, color: TOM.alerta.text }}>
          {n} {n === 1 ? 'peça solicitada pelo Atendimento esperando a lista' : 'peças solicitadas pelo Atendimento esperando a lista'}
        </div>
        <ul style={{ listStyle: 'none', margin: '6px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {maisAntigos.slice(0, 3).map(({ pedido: p, linha: l }) => {
            const idade = idadeDoPedido(p.createdAt, agora);
            return (
              <li key={l.id} style={{ fontSize: FS.body, color: TOM.alerta.text, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                <Link
                  href={`/eventos/${l.eventId}?pedidos=1`}
                  data-testid={`link-pedido-evento-${l.id}`}
                  style={{ fontWeight: 800, color: TOM.alerta.text, textDecoration: 'underline', textUnderlineOffset: 2 }}
                >
                  {l.eventName ?? 'Evento'}
                </Link>
                {' · '}{rotuloDaLinha(l)} · {patrocinadoresDaLinha(l)} · {quantidadeDoPedido(l.quantidade)} ·{' '}
                <span style={{ fontWeight: idade.nivel === 'normal' ? 600 : 800, color: idade.nivel === 'parado' ? TOM.perigo.text : TOM.alerta.text }}>{idade.texto}</span>
              </li>
            );
          })}
        </ul>
        {n > 3 && <span style={{ display: 'block', marginTop: 4, fontSize: FS.small, color: TOM.alerta.text }}>e mais {n - 3}</span>}
      </div>
      <button
        type="button"
        data-testid="button-filtrar-pedidos"
        onClick={() => setFoco(foco === 'pedidos' ? '' : 'pedidos')}
        style={{ height: alvo(34, dedo), padding: '0 14px', borderRadius: R.md, border: `1px solid ${TOM.alerta.border}`, backgroundColor: foco === 'pedidos' ? TOM.alerta.text : T.surface, color: foco === 'pedidos' ? T.surface : TOM.alerta.text, fontSize: FS.body, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' }}
      >
        {foco === 'pedidos' ? 'Mostrar todos os eventos' : 'Ver só eventos com solicitação'}
      </button>
      <Link
        href="/pedidos-de-peca"
        data-testid="link-caixa-pedidos"
        style={{ display: 'inline-flex', alignItems: 'center', height: alvo(34, dedo), padding: '0 14px', borderRadius: R.md, border: `1px solid ${TOM.alerta.border}`, backgroundColor: T.surface, color: TOM.alerta.text, fontSize: FS.body, fontWeight: 800, textDecoration: 'none', whiteSpace: 'nowrap' }}
      >
        Abrir as solicitações de peças
      </Link>
    </div>
  );
}
