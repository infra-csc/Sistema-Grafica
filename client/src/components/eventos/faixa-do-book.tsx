import { FileSearch, KeyRound, AlertTriangle } from "lucide-react";
import { canceladasEmAberto, faltandoEmAberto, nEventos, nPecas, type AuditoriaDoBookVista } from "@shared/auditoria-do-book";
import { T, FS, R, TOM, FW } from "@/lib/theme";
import { alvo } from "@/hooks/use-mobile";

const ddmm = (iso: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
};

// ── BOOK × LISTA (dono, 19/10) ─────────────────────────────────────
// Irmã da faixa de solicitações: a cada book publicado a IA confere o
// PDF contra a lista, e quem monta a lista (Solicitação) e o admin veem
// aqui, antes de qualquer filtro, quantas peças desenhadas no book não
// estão cadastradas — por evento, as de maior certeza primeiro. Clicar
// no evento abre o painel com cada achado. Some quando não há nenhum.
export function FaixaDoBook({ auditorias, foco, setFoco, onAbrir, dedo, celular = false }: {
  auditorias: AuditoriaDoBookVista[];
  foco: string;
  setFoco: (v: string) => void;
  onAbrir: (eventId: string) => void;
  dedo: boolean;
  /** Celular: rótulos curtos e linhas que quebram. */
  celular?: boolean;
}) {
  const comAchados = auditorias
    .map((a) => {
      const abertos = faltandoEmAberto(a);
      const canceladas = canceladasEmAberto(a).length;
      return { a, n: abertos.length + canceladas, canceladas, alta: abertos.filter((f) => f.confianca === "alta").length };
    })
    .filter((x) => x.n > 0)
    // Primeiro o que é mais certo: faltando com confiança alta e cancelada no
    // app (a IA casou com uma peça que existe e foi cancelada).
    .sort((x, y) => (y.alta + y.canceladas) - (x.alta + x.canceladas) || y.n - x.n || x.a.eventName.localeCompare(y.a.eventName, "pt-BR"));
  if (comAchados.length === 0) return null;
  const pecas = comAchados.reduce((s, x) => s + x.n, 0);
  const eventos = comAchados.length;
  const ativo = foco === "book";
  const canceladas = comAchados.reduce((s, x) => s + x.canceladas, 0);

  return (
    <div
      data-testid="faixa-book"
      role="status"
      style={{ position: 'relative', overflow: 'hidden', marginTop: 12, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', padding: '12px 16px 12px 18px', backgroundColor: TOM.alerta.bg, border: `1px solid ${TOM.alerta.border}`, borderRadius: R.lg }}
    >
      <span aria-hidden="true" style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: TOM.alerta.dot }} />
      <FileSearch aria-hidden="true" style={{ width: 18, height: 18, color: TOM.alerta.text, flexShrink: 0, alignSelf: 'flex-start', marginTop: 1 }} />
      <div style={{ flex: '1 1 260px', minWidth: 0 }}>
        <div data-testid="faixa-book-titulo" style={{ fontSize: FS.body + 1, fontWeight: 800, color: TOM.alerta.text }}>
          {/* Canceladas contam junto (dono, 19/10: "peças a revisar"): também não vão ser produzidas. */}
          {canceladas === 0
            ? (pecas === 1 ? '1 peça desenhada no book não está na lista' : `${pecas} peças desenhadas nos books não estão na lista`)
            : (pecas === 1 ? '1 peça do book para revisar na lista' : `${pecas} peças dos books para revisar na lista`)}
          <span style={{ fontWeight: FW.medio }}> · {eventos === 1 ? 'em 1 evento' : `em ${eventos} eventos`}</span>
        </div>
        <ul style={{ listStyle: 'none', margin: '6px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: celular ? 0 : 2 }}>
          {comAchados.slice(0, 3).map(({ a, n, alta, canceladas: c }) => (
            <li key={a.id} style={{ fontSize: FS.body, color: TOM.alerta.text, minWidth: 0, lineHeight: 1.45, overflow: celular ? undefined : 'hidden', textOverflow: celular ? undefined : 'ellipsis', whiteSpace: celular ? 'normal' : 'nowrap' }}>
              {/* Botão com cara de link: abre o PAINEL (não navega). */}
              <button
                type="button"
                onClick={() => onAbrir(a.eventId)}
                data-testid={`abrir-book-${a.eventId}`}
                aria-label={`Ver as ${nPecas(n)} do book de ${a.eventName} que não estão na lista`}
                style={{ border: 'none', background: 'none', padding: celular ? '6px 0' : 0, minHeight: celular ? 32 : undefined, font: 'inherit', fontWeight: 800, color: TOM.alerta.text, textDecoration: 'underline', textUnderlineOffset: 2, cursor: 'pointer', textAlign: 'left' }}
              >
                {a.eventName || 'Evento'}
              </button>
              {' · '}{nPecas(n)}
              {c > 0 && <> ({c === n ? (c === 1 ? 'cancelada no app' : 'todas canceladas no app') : `${c} ${c === 1 ? 'cancelada' : 'canceladas'} no app`})</>}
              {c === 0 && alta > 0 && alta < n && <> ({alta} com certeza alta)</>}
              {a.bookPublicadoEm && <> · book de {ddmm(a.bookPublicadoEm)}</>}
            </li>
          ))}
        </ul>
        {eventos > 3 && <span style={{ display: 'block', marginTop: 4, fontSize: FS.small, color: TOM.alerta.text }}>e mais {nEventos(eventos - 3)}</span>}
      </div>
      <button
        type="button"
        data-testid="button-filtrar-book"
        onClick={() => setFoco(ativo ? '' : 'book')}
        aria-pressed={ativo}
        className="evl-mais"
        style={{ height: alvo(34, dedo), padding: '0 14px', borderRadius: R.md, border: `1px solid ${TOM.alerta.border}`, backgroundColor: ativo ? TOM.alerta.text : T.surface, color: ativo ? T.surface : TOM.alerta.text, fontFamily: 'inherit', fontSize: FS.body, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
      >
        {celular
          ? (ativo ? 'Mostrar todos' : 'Só com peça fora da lista')
          : (ativo ? 'Mostrar todos os eventos' : 'Ver só eventos com peça fora da lista')}
      </button>
    </div>
  );
}

/**
 * O recado DISCRETO do admin: a auditoria está desligada (falta a chave) ou
 * alguma deu erro. A Solicitação nunca vê isto — para ela, sem auditoria é
 * sem faixa.
 */
export function AvisoDoBookParaAdmin({ semChave, auditorias, onAbrir, dedo }: {
  semChave: boolean;
  auditorias: AuditoriaDoBookVista[];
  onAbrir: (eventId: string) => void;
  dedo: boolean;
}) {
  const comErro = auditorias.filter((a) => a.status === "erro");
  const paradas = auditorias.filter((a) => a.status === "sem_chave").length;
  if (!semChave && comErro.length === 0) return null;
  return (
    <div data-testid="aviso-book-admin" style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 2, fontSize: FS.small, color: T.apoio }}>
      {semChave && (
        <p style={{ margin: 0, display: 'flex', alignItems: 'flex-start', gap: 6 }}>
          <KeyRound aria-hidden="true" style={{ width: 13, height: 13, flexShrink: 0, marginTop: 1 }} />
          <span>
            Auditoria do book com IA desligada: falta o Secret <code>ANTHROPIC_API_KEY</code> no servidor
            {paradas > 0 ? ` (${paradas === 1 ? "1 book esperando" : `${paradas} books esperando`} — rodam sozinhos quando a chave entrar e o app reiniciar)` : ""}.
          </span>
        </p>
      )}
      {comErro.length > 0 && (
        <p style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <AlertTriangle aria-hidden="true" style={{ width: 13, height: 13, flexShrink: 0, color: TOM.perigo.text }} />
          <span>Auditoria do book com erro:</span>
          {comErro.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => onAbrir(a.eventId)}
              data-testid={`abrir-book-erro-${a.eventId}`}
              style={{ border: 'none', background: 'none', padding: dedo ? '8px 2px' : 0, font: 'inherit', fontWeight: FW.forte, color: T.strong, textDecoration: 'underline', textUnderlineOffset: 2, cursor: 'pointer' }}
            >
              {a.eventName || 'Evento'}
            </button>
          ))}
        </p>
      )}
    </div>
  );
}
