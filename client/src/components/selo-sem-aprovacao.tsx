// ─────────────────────────────────────────────────────────────────────────────
// PEÇAS SEM APROVAÇÃO — os SELOS e o "prazo normal × ajustado" (Pedro/dono,
// 26/10; RF06, RF07, RF12). Um componente só, para as telas não inventarem
// cada uma o seu (o mesmo padrão do selo de produção interna):
//
//   · "Sem patrocínio" — a marca `skipApproval` (âmbar, o mesmo da Vinculação);
//   · "Arte cliente"   — a marca `arteDoCliente` (turquesa — a cor da Finalização, para onde ela vai); enquanto o arquivo do
//     cliente não chega, o selo vira "Aguardando arte do cliente" (o subestado
//     do Layout — RN06/RF07);
//   · "Layout 10/11 → 17/11" — o prazo de Layout normal × ajustado, calculado
//     na hora (nada é gravado: o prazo deriva da saída do caminhão).
//
// Não renderiza nada na peça sem marca — pode ser posto em qualquer linha sem
// `if` em volta. A regra (o que é "aguardando", o prazo ajustado) é a de
// @shared/prazo-sem-aprovacao; aqui só se desenha.
// ─────────────────────────────────────────────────────────────────────────────
import type { CSSProperties } from "react";
import { EyeOff, FileInput, Hourglass, CalendarClock, Clock } from "lucide-react";
import { Selo } from "@/components/ui/selo";
import { FS, FW, T, TOM, type NomeDeTom } from "@/lib/theme";
import {
  SELO_ARTE_DO_CLIENTE, SELO_SEM_PATROCINIO, ROTULO_AGUARDANDO_ARTE, ROTULO_ATRASO_DO_CLIENTE,
  aguardandoArteDoCliente, arteDoCliente as arteDoClienteDaRegra, prazoDeLayoutDoEvento, prazosDeLayoutDaPeca, semPatrocinio, type MarcasDaPeca,
} from "@shared/prazo-sem-aprovacao";
import { useDiasDaAprovacao } from "@/hooks/use-configuracoes";

/**
 * A peça como as telas a têm: o Item inteiro (skipApproval, arteDoCliente,
 * arteRecebidaEm, status) OU a linha pronta de um painel, que já traz
 * `semPatrocinio` e `aguardandoArteDoCliente` calculados no servidor.
 */
type PecaComMarcas = MarcasDaPeca & {
  id?: string;
  arteRecebidaPor?: string | null;
  semPatrocinio?: boolean | null;
  aguardandoArteDoCliente?: boolean | null;
  /** Produção interna (02/10) grava a mesma marca, mas tem selo próprio. */
  producaoInterna?: boolean | null;
};

const br = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const brAno = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

/** Os selos das marcas da peça ("Sem patrocínio", "Arte cliente" ou "Aguardando arte do cliente"). */
export function SelosSemAprovacao({ peca, tamanho = "sm", style, semAguardando = false }: {
  peca: PecaComMarcas | null | undefined;
  tamanho?: "sm" | "md";
  style?: CSSProperties;
  /** Não troca "Arte cliente" por "Aguardando arte do cliente" (quando a tela já diz o subestado). */
  semAguardando?: boolean;
}) {
  if (!peca) return null;
  // A REGRA ÚNICA (@shared/prazo-sem-aprovacao): produção interna e molde
  // gravam skipApproval por dentro e não são "peça sem aprovação" — sem selo.
  // A linha pronta de um painel já traz `semPatrocinio` calculado no servidor.
  const sem = peca.skipApproval !== undefined ? semPatrocinio(peca) : !!peca.semPatrocinio;
  const arte = arteDoClienteDaRegra(peca);
  if (!sem && !arte) return null;
  const aguarda = !semAguardando && (peca.aguardandoArteDoCliente ?? aguardandoArteDoCliente(peca));
  const recebida = arte && peca.arteRecebidaEm ? String(peca.arteRecebidaEm).slice(0, 10) : null;
  return (
    <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap", alignItems: "center", ...style }}>
      {sem && (
        <Selo
          forma="retangulo"
          tamanho={tamanho}
          icone={EyeOff}
          cores={TOM.alerta}
          title="Sem patrocínio — a peça não passa pela Aprovação; o prazo de Layout é o ajustado (Layout + dias da Aprovação)."
          data-testid={peca.id ? `selo-sem-patrocinio-${peca.id}` : "selo-sem-patrocinio"}
          style={{ padding: "1px 7px" }}
        >
          {SELO_SEM_PATROCINIO}
        </Selo>
      )}
      {arte && (
        <Selo
          forma="retangulo"
          tamanho={tamanho}
          icone={aguarda ? Hourglass : FileInput}
          cores={TOM.turquesa}
          title={aguarda
            ? "Layout — Aguardando arte do cliente: a peça espera o arquivo do cliente. Quando chegar, registre “Arte recebida” — ela vai direto para a Finalização, onde a medida é conferida."
            : recebida
              ? `Arte do cliente recebida em ${brAno(recebida)}${peca.arteRecebidaPor ? ` (${peca.arteRecebidaPor})` : ""} — a peça não passa pela Aprovação.`
              : "Arte do cliente — a peça não passa pela Aprovação; o prazo de Layout é o ajustado."}
          data-testid={peca.id ? `selo-arte-do-cliente-${peca.id}` : "selo-arte-do-cliente"}
          style={{ padding: "1px 7px" }}
        >
          {aguarda ? ROTULO_AGUARDANDO_ARTE : SELO_ARTE_DO_CLIENTE}
        </Selo>
      )}
    </span>
  );
}

/**
 * RF12 — "Layout 10/11 → 17/11 (ajustado, +7)". Recebe o evento (para o prazo
 * de Layout) e lê a configuração. Nada na peça sem marca ou do Kit.
 */
export function PrazoDeLayoutAjustado({ peca, evento, style, rotulo = true }: {
  peca: PecaComMarcas | null | undefined;
  evento: { truckDepartureDate?: Date | string | null; deadlineEntregaLayouts?: number | null } | null | undefined;
  style?: CSSProperties;
  rotulo?: boolean;
}) {
  const dias = useDiasDaAprovacao();
  if (!peca) return null;
  const prazos = prazosDeLayoutDaPeca(peca, prazoDeLayoutDoEvento(evento), dias);
  if (!prazos) return null;
  return (
    <span
      data-testid={peca.id ? `prazo-ajustado-${peca.id}` : "prazo-ajustado"}
      title={`Prazo de Layout normal ${brAno(prazos.normal)} × ajustado ${brAno(prazos.ajustado)}: a peça sem aprovação ganha a duração da Aprovação (${dias} ${dias === 1 ? "dia corrido" : "dias corridos"}). A Finalização e o prazo final não mudam.`}
      style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: FS.meta, color: T.second, whiteSpace: "nowrap", ...style }}
    >
      {/* Revisão 27/10: o desenho é aria-hidden e o leitor de tela ouve a
          frase inteira — antes lia "Layout 10/11 17/11" e só o tachado dizia
          qual era a antiga. O tachado e o "(+7d)" saíram do T.muted (n6, que
          não é cor de texto) para o T.second (5,03:1). */}
      <span aria-hidden="true" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        <CalendarClock style={{ width: 12, height: 12, color: T.second, flexShrink: 0 }} />
        {rotulo && <span>Layout</span>}
        <span style={{ textDecoration: "line-through", color: T.second }}>{br(prazos.normal)}</span>
        <span>→</span>
        <span style={{ fontWeight: FW.forte, color: T.text }}>{br(prazos.ajustado)}</span>
        <span style={{ color: T.second }}>(+{dias}d)</span>
      </span>
      <span className="sr-only">{fraseDoPrazoAjustado(prazos.normal, prazos.ajustado, dias)}</span>
    </span>
  );
}

/**
 * A frase falada do prazo de Layout normal × ajustado — a mesma aqui e na
 * Gestão de Prazos (`PrazoDeLayoutDaPeca`).
 */
export function fraseDoPrazoAjustado(normal: string, ajustado: string, dias: number): string {
  return `Prazo de Layout: normal ${br(normal)}, ajustado para ${br(ajustado)}`
    + (dias > 0 ? ` (mais ${dias} ${dias === 1 ? "dia" : "dias"})` : "");
}

// ─── Atraso do cliente (RN09) ────────────────────────────────────────────────

/**
 * A COR DO "ATRASO DO CLIENTE" — uma só no app inteiro (revisão 27/10: eram
 * quatro — laranja na Gestão, turquesa na Arte, céu nas Análises e o laranja
 * de link na lista de atrasadas).
 *
 * Céu, porque é o único tom livre que se separa dos vizinhos:
 *   · do VERMELHO do atraso interno, também para quem não distingue
 *     vermelho de laranja (o laranja ficava colado nele);
 *   · do TURQUESA de "Arte do cliente" / "Aguardando arte do cliente";
 *   · do ÂMBAR de "Sem patrocínio" e do laranja dos links da Gestão.
 * Frio de propósito: conta no atraso, mas não é da casa.
 * Contraste do texto (#0369a1): 5,57:1 sobre o fundo do selo (#f0f9ff),
 * 5,93:1 sobre branco, 5,44:1 sobre n2 — passa AA em todos.
 */
export const TOM_DO_ATRASO_DO_CLIENTE = "ceu" as const satisfies NomeDeTom;
export const COR_DO_ATRASO_DO_CLIENTE = TOM[TOM_DO_ATRASO_DO_CLIENTE];

/** A dica do selo — a mesma onde houver o selo. */
export const DICA_DO_SELO_ATRASO_DO_CLIENTE =
  "Atraso do cliente: a arte do cliente não chegou até o fim do prazo de Layout ajustado — conta no atraso, mas a responsabilidade é do cliente, não interna.";

/** O selo "Atraso do cliente" — o mesmo desenho em toda tela que o mostra. */
export function SeloAtrasoDoCliente({ testId, title = DICA_DO_SELO_ATRASO_DO_CLIENTE, tamanho = "sm", style }: {
  testId?: string;
  title?: string;
  tamanho?: "sm" | "md";
  style?: CSSProperties;
}) {
  return (
    <Selo
      forma="retangulo"
      tamanho={tamanho}
      icone={Clock}
      tom={TOM_DO_ATRASO_DO_CLIENTE}
      title={title}
      data-testid={testId}
      style={{ padding: "1px 7px", whiteSpace: "nowrap", ...style }}
    >
      {ROTULO_ATRASO_DO_CLIENTE}
    </Selo>
  );
}
