// ─────────────────────────────────────────────────────────────────────────────
// CONTRATOS DA API — o tipo de cada resposta, de ponta a ponta.
//
// POR QUE EXISTE: o cliente declarava as respostas à mão, tela por tela
// (`useQuery<any[]>` em ~50 lugares), e cada tela tinha a SUA versão de "uma
// peça". Aqui mora a forma que o servidor realmente devolve, escrita a partir
// das rotas (o arquivo de cada domínio cita a função do servidor que monta a
// resposta). Mudou a rota? Muda o contrato aqui — e o tsc aponta toda tela que
// lia o campo antigo.
//
// COMO USAR (cliente):
//
//   1. Com o helper tipado (client/src/lib/api-tipada.ts) — a rota escolhe o tipo:
//
//        const { data: eventos = [] } = useApi("/api/events");
//        //            ^? EventoDaLista[]
//        const { data: fila } = useApi("/api/items", { sufixo: "?status=awaiting_final_review" });
//
//      A chave da query continua a MESMA de sempre (["/api/events"],
//      ["/api/items", "?status=…"]): invalidação por prefixo, WebSocket e
//      delta-sync seguem funcionando sem ninguém saber do helper.
//
//   2. Ou direto no useQuery, com o tipo exportado:
//
//        import type { PecaEnriquecida } from "@shared/api";
//        useQuery<PecaEnriquecida[]>({ queryKey: ["/api/items/approved"] });
//
//   3. Escrita: `apiRequest<TResposta, TCorpo>` (client/src/lib/queryClient.ts)
//      tipa o corpo e o `res.json()`:
//
//        const res = await apiRequest<UsuarioSemSenha, CorpoDoLogin>("POST", "/api/auth/login", { email, password });
//        const usuario = await res.json();   // UsuarioSemSenha
//
// O QUE O CACHE GUARDA (e não o que passa pelo cabo): as listas de peças vêm
// compactadas e por delta, e a lista de eventos vem com as peças resumidas —
// `lib/queryClient.ts` decodifica tudo ANTES do cache. `Rotas` descreve o que
// o `useQuery` recebe; os formatos de cabo estão em shared/itens-compactos.ts,
// shared/eventos-resumo.ts e `DeltaDePecas`.
//
// DATAS: pelo cabo toda data é texto ISO — os tipos usam `Json<T>` (json.ts)
// sobre as linhas do Drizzle, nunca `Date`.
// ─────────────────────────────────────────────────────────────────────────────
import type { PrazosPayload } from "../prazos-contract";
import type { PatrocinadorJson, PecaEnriquecida, PecaParaCorrecao, DadosDeAprovacaoEmLote } from "./itens";
import type { EventoDaLista, UsoDosPatrocinadores } from "./eventos";
import type { TuboResumo } from "./tubos";
import type { RetratoDasMaquinas } from "./maquinas";
import type { AtivoDoAcervo, AtivoNaTriagem } from "./estoque";
import type { RegistroDeAuditoriaJson } from "./auditoria";
import type { NotificacaoJson } from "./notificacoes";
import type { UsuarioBasico, UsuarioDaLista, UsuarioDaSessao } from "./usuarios";
import type { ModeloComUso } from "./modelos";

export type { Json } from "./json";
export * from "./itens";
export * from "./eventos";
export * from "./tubos";
export * from "./maquinas";
export * from "./estoque";
export * from "./auditoria";
export * from "./notificacoes";
export * from "./usuarios";
export * from "./corpos";
export * from "./modelos";
export * from "./planilha";
export type { PrazosPayload } from "../prazos-contract";

/**
 * GET mais usados → o que o `useQuery` recebe com a chave `[rota]` (ou
 * `[rota, "?…"]` nos recortes que não mudam a forma).
 *
 * Rotas com MAIS DE UMA forma pedem o tipo explícito no useQuery:
 *   · /api/items?campos=trilha   → PecaDaTrilha[]
 *   · /api/tubos?detalhe=1       → TuboDaAba[]
 *   · /api/audit-logs?paged=1    → PaginaDeAuditoria
 *   · /api/audit-logs?withTotal=1 → PaginaDeAuditoriaComTotal
 */
export interface Rotas {
  "/api/items": PecaEnriquecida[];
  "/api/items/approved": PecaEnriquecida[];
  "/api/items/pending": PecaEnriquecida[];
  "/api/items/deleted": PecaEnriquecida[];
  "/api/items/resubmission-needed": PecaParaCorrecao[];
  "/api/items/batch-approval-data": DadosDeAprovacaoEmLote;
  "/api/events": EventoDaLista[];
  "/api/sponsors": PatrocinadorJson[];
  "/api/sponsors/usage": UsoDosPatrocinadores;
  "/api/tubos": TuboResumo[];
  "/api/grafica/maquinas": RetratoDasMaquinas;
  "/api/prazos": PrazosPayload;
  "/api/inventory": AtivoDoAcervo[];
  "/api/inventory/awaiting-triage": AtivoNaTriagem[];
  "/api/audit-logs": RegistroDeAuditoriaJson[];
  "/api/notifications": NotificacaoJson[];
  "/api/auth/me": UsuarioDaSessao;
  "/api/users": UsuarioDaLista[];
  "/api/users/basic": UsuarioBasico[];
  "/api/standard-items": ModeloComUso[];
}

/** Uma rota GET com contrato. */
export type RotaGet = keyof Rotas;
/** A resposta (como o cache a guarda) de uma rota GET. */
export type RespostaDe<R extends RotaGet> = Rotas[R];
