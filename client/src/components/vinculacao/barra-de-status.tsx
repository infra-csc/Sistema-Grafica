// ─────────────────────────────────────────────────────────────────────────────
// BARRA DE STATUS — o mapa e o recorte, na mesma linha.
//
// Três números que ninguém podia CLICAR custavam a altura de duas linhas da
// tabela; agora o número é o próprio filtro. A barra segmentada fica: ela
// responde "quanto falta no total", que nenhum chip responde sozinho.
// ─────────────────────────────────────────────────────────────────────────────
import { Save } from "lucide-react";
import { Botao } from "@/components/ui/botao";
import { alvo } from "@/hooks/use-mobile";
import { TOM, T, R, FS, FW, FONT } from "@/lib/theme";
import { UI_STATUS_SIGNIFICADO } from "./constantes";
import type { ContagemPorEstado } from "./tipos";

type Props = {
  contagemPorEstado: ContagemPorEstado;
  totalDoContexto: number;
  statusFilter: string[];
  alternarStatus: (estado: string) => void;
  contextStatusCounts: ContagemPorEstado;
  salvarRascunhosVisiveis: () => void;
  salvando: boolean;
  dedo: boolean;
};

export function BarraDeStatus({
  contagemPorEstado, totalDoContexto, statusFilter, alternarStatus, contextStatusCounts,
  salvarRascunhosVisiveis, salvando, dedo,
}: Props) {
  return (
    <div style={{
      borderTop: `1px solid ${T.border}`, borderBottom: `1px solid ${T.border}`,
      padding: '12px 0 14px', marginBottom: 20,
      display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
    }}>
      {/* Proporção + total */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <div aria-hidden="true" style={{ width: 132, height: 8, backgroundColor: T.border, borderRadius: 999, overflow: 'hidden', display: 'flex' }}>
          {([
            ['PENDENTE', T.second],
            ['RASCUNHO', T.accentText],
            ['PRONTO',   TOM.sucesso.text],
            ['ENVIADO',  T.text],
          ] as const)
            .map(([k, cor]) => ({ k, cor, pct: (contagemPorEstado[k] / (totalDoContexto || 1)) * 100 }))
            .filter(seg => seg.pct > 0)
            .map(seg => (
              <div key={seg.k} style={{ width: `${seg.pct}%`, height: '100%', backgroundColor: seg.cor, transition: 'width 0.4s ease' }} />
            ))}
        </div>
        <span style={{ fontFamily: FONT.mono, fontSize: FS.meta, color: T.apoio, whiteSpace: 'nowrap' }}>
          {contagemPorEstado.ENVIADO}/{totalDoContexto} enviadas
        </span>
      </div>

      {/* Os quatro estados, clicáveis */}
      <div role="group" aria-label="Filtrar por situação" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {/* O SIGNIFICADO de cada situação vai junto do chip (title e nome
            acessível): "Pronto" para quê? "Rascunho" de quem? A ordem dos
            chips já é a do caminho da peça. */}
        {([
          ['PENDENTE', 'Pendente', T.second],
          ['RASCUNHO', 'Rascunho', T.accentText],
          ['PRONTO',   'Pronto',   TOM.sucesso.text],
          ['ENVIADO',  'Enviado',  T.text],
        ] as const).map(([estado, rotulo, cor]) => {
          const significado = UI_STATUS_SIGNIFICADO[estado];
          const n = contagemPorEstado[estado];
          const marcado = statusFilter.includes(estado);
          // Situação sem nenhuma peça sai da linha — o clique nela devolveria
          // lista vazia sem dizer por quê. Fica se estiver marcada, senão o
          // chip sumiria com o próprio filtro ligado e não haveria como
          // desligá-lo.
          if (n === 0 && !marcado) return null;
          return (
            <button
              key={estado}
              type="button"
              onClick={() => alternarStatus(estado)}
              aria-pressed={marcado}
              title={`${rotulo}: ${significado}. ${marcado ? 'Clique para remover o filtro.' : 'Clique para ver só estas.'}`}
              aria-label={`${rotulo}, ${n} ${n === 1 ? 'peça' : 'peças'}: ${significado}`}
              data-testid={`chip-status-${estado.toLowerCase()}`}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                height: alvo(32, dedo), padding: '0 12px', borderRadius: R.pill,
                border: marcado ? `1px solid ${T.text}` : `1px solid ${T.border}`,
                backgroundColor: marcado ? T.text : T.surface,
                color: marcado ? T.surface : T.strong,
                cursor: 'pointer', font: 'inherit', fontSize: FS.body, fontWeight: FW.medio,
                whiteSpace: 'nowrap', transition: 'background 0.15s, color 0.15s',
              }}
            >
              <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: marcado ? T.surface : cor, flexShrink: 0 }} />
              {rotulo}
              <span style={{ fontFamily: FONT.mono, fontWeight: FW.forte, opacity: marcado ? 1 : 0.75 }}>{n}</span>
            </button>
          );
        })}
      </div>

      {/* Salvar rascunhos — a única ação que a barra carrega, e só quando há
          o que salvar NA LISTA VISÍVEL. */}
      {contextStatusCounts.RASCUNHO > 0 && (
        <Botao
          variante="secundario"
          tamanho={dedo ? "toque" : "sm"}
          icone={Save}
          // Age só sobre o que está à vista — ver salvarRascunhosVisiveis.
          onClick={salvarRascunhosVisiveis}
          carregando={salvando}
          data-testid="button-save-all-drafts"
          style={{ marginLeft: 'auto' }}
        >
          {salvando
            ? 'Salvando...'
            : `Salvar ${contextStatusCounts.RASCUNHO} rascunho${contextStatusCounts.RASCUNHO !== 1 ? 's' : ''}`}
        </Botao>
      )}
    </div>
  );
}
