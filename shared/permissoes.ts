// ─────────────────────────────────────────────────────────────────────────────
// A RÉGUA DE PAPÉIS, DECLARADA (frente 4 do diagnóstico de 24/08).
//
// Antes disto, a autorização do app era 74 rotas de escrita com a guarda
// escrita à mão — requireRole em 6, aliases em ~30 e variações de
// `req.userRole !== "arte" && ...` no resto — espalhadas por milhares de
// linhas. Para responder "o que o perfil Arte pode fazer?" era preciso um
// script varrendo o servidor; se a resposta exige um script, ninguém a sabe
// de cabeça, e uma permissão errada não avisa que está errada.
//
// Esta tabela é a resposta num lugar só. O que a mantém VERDADEIRA não é
// disciplina: é o teste de conformidade (server/__tests__/permissoes-
// declaradas.test.ts), que varre as rotas com server/permissoes-scan.ts e
// quebra se o código e a tabela divergirem — em qualquer direção. Mudou uma
// guarda? O teste aponta a linha daqui que tem de mudar junto, e o diff da
// tabela vira o registro legível da decisão.
//
// QUEM DEVE LER DAQUI: telas que precisam saber o que um papel pode (o bloco
// "o que este perfil concede" do cadastro de usuários), futuras guardas
// novas (declare aqui, cheque com `podePapel`), e qualquer auditoria.
//
// O QUE ELA NÃO DIZ: regras além de papel. Algumas rotas somam condições
// ("criador do evento também pode", status da peça, evento finalizado) — a
// tabela registra o RECORTE POR PAPEL; a rota continua dona do resto.
//
// Rota de escrita SEM linha aqui = qualquer usuário logado (requireAuth).
// ─────────────────────────────────────────────────────────────────────────────

export type Papel = "admin" | "solicitacao" | "arte" | "grafica" | "atendimento";

export interface RegraDeRota {
  metodo: "POST" | "PATCH" | "PUT" | "DELETE";
  rota: string;
  papeis: Papel[];
}

/** As 74 rotas de escrita com papel declarado, em ordem alfabética. */
export const REGUA_DE_PAPEIS: RegraDeRota[] = [
  { metodo: "POST", rota: "/api/admin/reparo-motivos-sem-s", papeis: ["admin"] },
  { metodo: "DELETE", rota: "/api/allocations/:id", papeis: ["admin"] },
  { metodo: "POST", rota: "/api/auth/register", papeis: ["admin"] },
  { metodo: "DELETE", rota: "/api/catalog-options", papeis: ["admin", "solicitacao"] },
  { metodo: "DELETE", rota: "/api/comments/:id", papeis: ["admin"] },
  { metodo: "POST", rota: "/api/events", papeis: ["admin", "solicitacao"] },
  { metodo: "POST", rota: "/api/events/:eventId/book", papeis: ["admin", "arte"] },
  { metodo: "POST", rota: "/api/events/:eventId/book/notify", papeis: ["admin"] },
  { metodo: "DELETE", rota: "/api/events/:eventId/sponsors/:sponsorId", papeis: ["admin", "arte", "atendimento", "solicitacao"] },
  { metodo: "PATCH", rota: "/api/events/:eventId/sponsors/:sponsorId", papeis: ["admin", "arte", "atendimento", "solicitacao"] },
  { metodo: "DELETE", rota: "/api/events/:id", papeis: ["admin"] },
  { metodo: "POST", rota: "/api/events/:id/allocations", papeis: ["admin"] },
  { metodo: "POST", rota: "/api/events/:id/auto-link-sponsors", papeis: ["admin", "arte", "atendimento", "solicitacao"] },
  { metodo: "POST", rota: "/api/events/:id/close", papeis: ["admin"] },
  { metodo: "POST", rota: "/api/events/:id/dispatch-inventory", papeis: ["admin"] },
  { metodo: "POST", rota: "/api/events/:id/items/submit", papeis: ["admin", "solicitacao"] },
  { metodo: "POST", rota: "/api/events/:id/reopen", papeis: ["admin"] },
  { metodo: "POST", rota: "/api/events/:id/return-inventory", papeis: ["admin"] },
  { metodo: "POST", rota: "/api/events/:id/sponsors", papeis: ["admin", "arte", "atendimento", "solicitacao"] },
  { metodo: "POST", rota: "/api/inventory", papeis: ["admin"] },
  { metodo: "DELETE", rota: "/api/inventory/:id", papeis: ["admin"] },
  { metodo: "PATCH", rota: "/api/inventory/:id", papeis: ["admin"] },
  { metodo: "PATCH", rota: "/api/inventory/:id/triage", papeis: ["admin"] },
  { metodo: "POST", rota: "/api/inventory/:id/triage-split", papeis: ["admin"] },
  { metodo: "PATCH", rota: "/api/items/:id/approve", papeis: ["admin", "solicitacao"] },
  { metodo: "PATCH", rota: "/api/items/:id/arte-reject", papeis: ["admin", "arte"] },
  { metodo: "PATCH", rota: "/api/items/:id/cancel", papeis: ["admin", "arte", "solicitacao"] },
  { metodo: "DELETE", rota: "/api/items/:id/complement", papeis: ["admin", "solicitacao"] },
  { metodo: "POST", rota: "/api/items/:id/complement", papeis: ["admin", "solicitacao"] },
  { metodo: "POST", rota: "/api/items/:id/correct-reuse", papeis: ["admin", "grafica", "solicitacao"] },
  { metodo: "PATCH", rota: "/api/items/:id/creator-reject", papeis: ["admin", "arte", "solicitacao"] },
  { metodo: "PATCH", rota: "/api/items/:id/creator-review", papeis: ["admin", "arte", "solicitacao"] },
  { metodo: "PATCH", rota: "/api/items/:id/dispense", papeis: ["admin", "arte"] },
  { metodo: "PATCH", rota: "/api/items/:id/edit", papeis: ["admin", "arte", "solicitacao"] },
  { metodo: "POST", rota: "/api/items/:id/mark-reuse", papeis: ["admin", "grafica", "solicitacao"] },
  { metodo: "POST", rota: "/api/items/:id/restore", papeis: ["admin"] },
  { metodo: "PATCH", rota: "/api/items/:id/return-to-arte", papeis: ["admin", "arte", "solicitacao"] },
  { metodo: "POST", rota: "/api/items/:id/return-to-creation", papeis: ["admin", "arte", "atendimento", "solicitacao"] },
  { metodo: "PATCH", rota: "/api/items/:id/return-to-review", papeis: ["admin", "grafica"] },
  { metodo: "POST", rota: "/api/items/:id/sponsor-approvals/:sponsorId/approve", papeis: ["admin", "atendimento"] },
  { metodo: "POST", rota: "/api/items/:id/sponsor-approvals/:sponsorId/reject", papeis: ["admin", "atendimento"] },
  { metodo: "POST", rota: "/api/items/:id/sponsor-approvals/:sponsorId/revert", papeis: ["admin", "atendimento"] },
  { metodo: "POST", rota: "/api/items/:id/sponsor-approvals/resubmit", papeis: ["admin", "arte"] },
  { metodo: "PATCH", rota: "/api/items/:id/sponsor-approve", papeis: ["admin", "atendimento"] },
  { metodo: "POST", rota: "/api/items/:id/sponsors", papeis: ["admin", "arte", "atendimento", "solicitacao"] },
  { metodo: "POST", rota: "/api/items/:id/sponsors/sync", papeis: ["admin", "arte", "atendimento", "solicitacao"] },
  { metodo: "PATCH", rota: "/api/items/:id/start-production", papeis: ["admin", "grafica"] },
  { metodo: "PATCH", rota: "/api/items/:id/submit-final-file", papeis: ["admin", "arte"] },
  { metodo: "PATCH", rota: "/api/items/:id/submit-for-approval", papeis: ["admin", "arte"] },
  { metodo: "PATCH", rota: "/api/items/:id/update-final-file", papeis: ["admin", "arte"] },
  { metodo: "PATCH", rota: "/api/items/:id/update-thumb", papeis: ["admin", "arte"] },
  { metodo: "POST", rota: "/api/items/:itemId/photos", papeis: ["admin", "grafica", "solicitacao"] },
  { metodo: "DELETE", rota: "/api/items/:itemId/sponsors/:sponsorId", papeis: ["admin", "arte", "atendimento", "solicitacao"] },
  { metodo: "PATCH", rota: "/api/items/bulk-cancel", papeis: ["admin", "arte", "solicitacao"] },
  { metodo: "PATCH", rota: "/api/items/bulk-creator-reject", papeis: ["admin", "arte", "solicitacao"] },
  { metodo: "PATCH", rota: "/api/items/bulk-return-to-arte", papeis: ["admin", "arte", "solicitacao"] },
  { metodo: "POST", rota: "/api/items/send-to-arte", papeis: ["admin", "arte", "atendimento", "solicitacao"] },
  { metodo: "PATCH", rota: "/api/notifications/read-all", papeis: ["admin"] },
  { metodo: "DELETE", rota: "/api/photos/:id", papeis: ["admin", "grafica"] },
  { metodo: "POST", rota: "/api/prazos/cobrancas", papeis: ["admin"] },
  { metodo: "PUT", rota: "/api/quota-rules/global", papeis: ["admin", "atendimento"] },
  { metodo: "POST", rota: "/api/revisao/digest/enviar", papeis: ["admin"] },
  { metodo: "DELETE", rota: "/api/sponsors/:id", papeis: ["admin"] },
  { metodo: "POST", rota: "/api/standard-items", papeis: ["admin", "solicitacao"] },
  { metodo: "DELETE", rota: "/api/standard-items/:id", papeis: ["admin", "solicitacao"] },
  { metodo: "PATCH", rota: "/api/standard-items/:id", papeis: ["admin", "solicitacao"] },
  { metodo: "DELETE", rota: "/api/standard-items/clear-finish", papeis: ["admin", "solicitacao"] },
  { metodo: "DELETE", rota: "/api/standard-items/clear-group", papeis: ["admin", "solicitacao"] },
  { metodo: "DELETE", rota: "/api/standard-items/clear-material", papeis: ["admin", "solicitacao"] },
  { metodo: "PATCH", rota: "/api/standard-items/rename-finish", papeis: ["admin", "solicitacao"] },
  { metodo: "PATCH", rota: "/api/standard-items/rename-group", papeis: ["admin", "solicitacao"] },
  { metodo: "PATCH", rota: "/api/standard-items/rename-material", papeis: ["admin", "solicitacao"] },
  { metodo: "DELETE", rota: "/api/users/:id", papeis: ["admin"] },
  { metodo: "PATCH", rota: "/api/users/:id", papeis: ["admin"] },
];

/** O papel passa nesta rota? Rota fora da tabela = qualquer logado. */
export function podePapel(metodo: string, rota: string, papel: string): boolean {
  const regra = REGUA_DE_PAPEIS.find((r) => r.metodo === metodo.toUpperCase() && r.rota === rota);
  return !regra || regra.papeis.includes(papel as Papel);
}
