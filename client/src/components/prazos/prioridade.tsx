// Prioridade fora da cor.
//
// PORQUÊ ESTE ARQUIVO. A prioridade é FILTRO OFICIAL desta tela e existia
// apenas como uma bolinha de 8px cujo `title` morava no MESMO elemento marcado
// `aria-hidden="true"` — o atributo nunca entrava na árvore de acessibilidade.
// O defeito é invisível para quem revisa com mouse (o tooltip aparece) e total
// para quem usa leitor de tela ou não distingue as matizes. No card mobile não
// havia nem `title`.
//
// Duas peças, e a divisão é deliberada:
//
// • `PrioridadePonto` — marcador quieto ao lado do nome. Continua decorativo
//   (aria-hidden), mas agora vem acompanhado de um `sr-only` de verdade.
// • `PrioridadeChip` — "urgente" e "alta" GRADUAM para chip de texto na linha
//   de selos. São as duas que mudam a decisão de quem lê a tela; "média" e
//   "baixa" são contexto e, viradas chip, só competiriam com o gate vermelho
//   do card — que é o dano consumado e tem que continuar sendo o mais forte.
//
// As duas devolvem `null` quando não é o caso delas, então cada superfície
// renderiza AS DUAS nos seus lugares naturais e nunca aparecem juntas.
//
// Cores: `lib/status.ts` (fonte única). O `text` de lá já é o tom escuro que
// passa AA sobre o `bg` claro do mesmo par — o chip não inventa contraste.
import { getPriorityMeta } from "@/lib/status";
import { R } from "./tokens";

/** Prioridades que viram chip de texto. Contexto fica como ponto. */
const DESTAQUE = new Set(["urgente", "alta"]);

/**
 * Vai sair chip? Quem monta uma FILEIRA de selos precisa saber antes de
 * renderizar o contêiner — senão sobra um flex vazio com margem, que empurra
 * a linha da tabela por nada.
 */
export function temChipDePrioridade(priority?: string | null): boolean {
  return !!getPriorityMeta(priority) && DESTAQUE.has(priority ?? "");
}

export function PrioridadePonto({ priority, style }: {
  priority?: string | null;
  /** Margens/alinhamento variam por superfície (linha flex, `<p>` inline). */
  style?: React.CSSProperties;
}) {
  const prio = getPriorityMeta(priority);
  if (!prio || DESTAQUE.has(priority ?? "")) return null;
  return (
    <>
      <span
        aria-hidden="true"
        style={{
          display: "inline-block", width: 8, height: 8, borderRadius: R.pill,
          backgroundColor: prio.dot, flexShrink: 0, ...style,
        }}
      />
      <span className="sr-only">Prioridade: {prio.label}</span>
    </>
  );
}

export function PrioridadeChip({ priority }: { priority?: string | null }) {
  const prio = getPriorityMeta(priority);
  if (!prio || !DESTAQUE.has(priority ?? "")) return null;
  return (
    <span
      data-testid={`selo-prioridade-${priority}`}
      style={{
        display: "inline-block", padding: "2px 8px", borderRadius: R.sm,
        backgroundColor: prio.bg, border: `1px solid ${prio.border}`, color: prio.text,
        fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em",
        whiteSpace: "nowrap",
      }}
    >
      {/* "URGENTE" sozinho não diz de QUE atributo se fala quando lido em
          sequência com "não iniciado" e "risco" na mesma linha de selos. */}
      <span className="sr-only">Prioridade: </span>{prio.label}
    </span>
  );
}
