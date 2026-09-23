// ─────────────────────────────────────────────────────────────────────────────
// BUSCAR NO ESTOQUE E RESERVAR + TRIAGEM PELA GRÁFICA (dono, 14/09).
//
// As decisões do dono, e o que este arquivo pina de cada uma:
//   · parecida = mesmo tipo + mesma medida; patrocinador igual vem primeiro,
//     peça sem patrocinador é genérica, patrocinador diferente não aparece;
//   · peça em uso noutro evento que volta antes da saída do caminhão pode ser
//     reservada, com aviso;
//   · triagem e local no galpão são da Gráfica; o acúmulo de 4.287 peças
//     esperando triagem fica como está (nada é migrado);
//   · "No galpão" deixa de significar "livre": reservada e separada para o
//     evento de origem não são oferecidas.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { fonteDaTela } from "./fonte-da-tela";
import {
  normalizarTipo,
  mesmaMedida,
  relacaoDePatrocinio,
  classificarDisponibilidade,
  fimDoEvento,
  reservaEstaAtiva,
  compararLotes,
  podeReservar,
  type EntradaDeDisponibilidade,
} from "@shared/estoque";

const RAIZ = path.resolve(__dirname, "../..");
const ler = (rel: string) => readFileSync(path.resolve(RAIZ, rel), "utf8");

describe("o que é peça parecida", () => {
  it("o tipo ignora caixa, acento, espaços e plural simples", () => {
    expect(normalizarTipo("PLACAS KM")).toBe(normalizarTipo("Placa km"));
    expect(normalizarTipo("STANDS")).toBe(normalizarTipo("stand"));
    expect(normalizarTipo("2x1  padrão")).toBe("2x1 padrao");
    expect(normalizarTipo("ROLO")).not.toBe(normalizarTipo("2x1"));
  });

  it("a medida casa com 1 cm de folga, sem girar a peça, e sem medida não casa", () => {
    expect(mesmaMedida({ largura: "2.00", altura: "1.00" }, { largura: 2, altura: 1 })).toBe(true);
    expect(mesmaMedida({ largura: "2.00", altura: "1.00" }, { largura: "2.01", altura: "1" })).toBe(true);
    expect(mesmaMedida({ largura: 2, altura: 1 }, { largura: 1, altura: 2 })).toBe(false);
    expect(mesmaMedida({ largura: 2, altura: 1 }, { largura: 2.05, altura: 1 })).toBe(false);
    expect(mesmaMedida({ largura: null, altura: 1 }, { largura: null, altura: 1 })).toBe(false);
  });

  it("patrocinador: igual, genérica, a conferir e diferente", () => {
    expect(relacaoDePatrocinio(["a", "b"], ["b", "a"])).toBe("identica");
    expect(relacaoDePatrocinio(["a"], [])).toBe("generica");
    expect(relacaoDePatrocinio([], [])).toBe("generica");
    // a peça nova ainda não tem patrocinador vinculado: não descarta ninguém
    expect(relacaoDePatrocinio([], ["a"])).toBe("a_definir");
    expect(relacaoDePatrocinio(["a"], ["a", "b"])).toBe("diferente");
  });
});

describe("quando o evento acaba e a reserva deixa de valer", () => {
  it("o evento acaba à meia-noite do dia seguinte — a régua do cron da triagem", () => {
    expect(fimDoEvento("2026-09-20T13:00:00Z")?.toISOString()).toBe("2026-09-21T00:00:00.000Z");
    expect(fimDoEvento(null)).toBeNull();
  });

  it("a reserva vale enquanto o evento reservado não acabou", () => {
    const agora = new Date("2026-09-14T15:00:00Z");
    expect(reservaEstaAtiva("2026-09-13T10:00:00Z", agora)).toBe(false);
    expect(reservaEstaAtiva("2026-09-14T10:00:00Z", agora)).toBe(true);
  });
});

describe("dá para usar? — onde a peça está e se chega a tempo", () => {
  const agora = new Date("2026-09-14T15:00:00Z");
  const base = (mudanca: Partial<EntradaDeDisponibilidade> = {}): EntradaDeDisponibilidade => ({
    situacao: "NO_GALPAO",
    condicao: "PERFEITO",
    origem: { eventId: "ev-antigo", inicio: "2026-08-20T00:00:00Z" },
    reserva: null,
    destino: { itemId: "nova", eventId: "ev-novo", saida: "2026-10-01T08:00:00Z", inicio: "2026-10-03T00:00:00Z" },
    agora,
    ...mudanca,
  });

  it("no galpão, de evento que já passou e sem reserva: livre", () => {
    expect(classificarDisponibilidade(base()).disponibilidade).toBe("disponivel");
  });

  it("no galpão, mas impressa para evento que ainda vai acontecer: separada", () => {
    const r = classificarDisponibilidade(base({ origem: { eventId: "ev-sabado", inicio: "2026-09-19T00:00:00Z" } }));
    expect(r.disponibilidade).toBe("indisponivel");
    expect(r.motivo).toContain("Separada para o evento de origem");
  });

  it("em uso e volta antes da saída do caminhão: reservável, com aviso da triagem", () => {
    const r = classificarDisponibilidade(base({ situacao: "EM_USO", origem: { eventId: "ev-20", inicio: "2026-09-20T00:00:00Z" } }));
    expect(r.disponibilidade).toBe("chega_a_tempo");
    expect(r.aviso).toContain("triagem");
    expect(podeReservar(r.disponibilidade)).toBe(true);
  });

  it("em uso e só volta depois da saída: não dá", () => {
    const r = classificarDisponibilidade(base({ situacao: "EM_USO", origem: { eventId: "ev-02", inicio: "2026-10-02T00:00:00Z" } }));
    expect(r.disponibilidade).toBe("indisponivel");
    expect(r.motivo).toContain("só volta");
  });

  it("voltou e falta triagem: reservável, com aviso", () => {
    const r = classificarDisponibilidade(base({ situacao: "AGUARDANDO_TRIAGEM" }));
    expect(r.disponibilidade).toBe("falta_triagem");
    expect(podeReservar(r.disponibilidade)).toBe(true);
  });

  it("manutenção, sucata, descartada e reservada para outro evento: não dá, e diz por quê", () => {
    expect(classificarDisponibilidade(base({ situacao: "EM_MANUTENCAO" })).motivo).toBe("Em manutenção");
    expect(classificarDisponibilidade(base({ condicao: "SUCATA" })).motivo).toBe("Sucata");
    expect(classificarDisponibilidade(base({ situacao: "DESCARTADO" })).motivo).toBe("Descartada");
    const outra = classificarDisponibilidade(base({ reserva: { itemId: "outra", eventId: "ev-x", eventName: "Maratona X" } }));
    expect(outra.motivo).toBe("Reservada para Maratona X");
  });

  it("reservada para esta mesma peça é reconhecida como tal", () => {
    const r = classificarDisponibilidade(base({ reserva: { itemId: "nova", eventId: "ev-novo", eventName: "Novo" } }));
    expect(r.reservadaAqui).toBe(true);
  });

  it("peça do mesmo evento não é 'estoque' para ele, e caminhão que já saiu não reserva", () => {
    expect(classificarDisponibilidade(base({ origem: { eventId: "ev-novo", inicio: "2026-08-01T00:00:00Z" } })).disponibilidade).toBe("indisponivel");
    const saiu = classificarDisponibilidade(base({ destino: { itemId: "nova", eventId: "ev-novo", saida: "2026-09-10T08:00:00Z", inicio: "2026-09-12T00:00:00Z" } }));
    expect(saiu.motivo).toContain("já saiu");
  });

  it("ordem: livre antes de volta-a-tempo antes de falta-triagem; mesmo patrocinador antes de genérica", () => {
    const l = (disponibilidade: any, relacao: any, condicao = "PERFEITO", quantidade = 1) => ({ disponibilidade, relacao, condicao, quantidade });
    const lista = [l("falta_triagem", "identica"), l("disponivel", "generica"), l("chega_a_tempo", "identica"), l("disponivel", "identica")];
    expect(lista.sort(compararLotes).map((x) => `${x.disponibilidade}/${x.relacao}`)).toEqual([
      "disponivel/identica", "disponivel/generica", "chega_a_tempo/identica", "falta_triagem/identica",
    ]);
  });
});

describe("o servidor da reserva", () => {
  const ROTAS = ler("server/routes/estoque-reservas.ts");
  const SERVIDOR = ler("server/routes.ts");
  const SCHEMA = ler("shared/schema.ts");

  it("as rotas existem e estão registradas", () => {
    for (const rota of [
      'app.get("/api/events/:eventId/estoque-resumo", requireAuth',
      'app.get("/api/items/:id/estoque-semelhantes", requireAuth',
      'app.post("/api/items/:id/reservas", requireReservaDeEstoque',
      'app.delete("/api/items/:id/reservas/:reservaId", requireReservaDeEstoque',
      'app.get("/api/estoque/reservas-ativas", requireAuth',
    ]) expect(ROTAS).toContain(rota);
    expect(SERVIDOR).toContain("registerEstoqueReservasRoutes(app);");
  });

  it("reservar e liberar são só do admin (15/09: Estoque é só do admin)", () => {
    expect(ROTAS).toContain('const requireReservaDeEstoque = requireRole("admin");');
  });

  it("trava as peças e confere tudo de novo no servidor — nunca confia na tela", () => {
    expect(ROTAS).toContain('.for("update");');
    expect(ROTAS).toContain("dá para reservar mais");
    expect(ROTAS).toContain("Não deu para reservar —");
    expect(ROTAS).toContain("if (!podeReservar(s.disponibilidade))");
  });

  it("não reserva depois que o caminhão saiu, nem desfaz a reserva que já virou uso", () => {
    expect(ROTAS).toContain("O caminhão deste evento já saiu");
    expect(ROTAS).toContain("a reserva virou uso e não pode ser desfeita");
  });

  it("a reserva guarda a peça de destino e quem reservou", () => {
    expect(SCHEMA).toContain('itemId: varchar("item_id").references(() => items.id, { onDelete: "set null" }),');
    expect(SCHEMA).toContain('reservadoPor: text("reservado_por"),');
    expect(SCHEMA).toContain('index("IDX_event_inventory_allocations_item_id").on(table.itemId),');
  });
});

describe("o ciclo do evento respeita a reserva", () => {
  const STORAGE = ler("server/storage.ts");

  it("peça reservada para outro evento não é despachada nem mandada à triagem pelo evento de origem", () => {
    expect(STORAGE).toContain("private async foraDeReservaDeOutroEvento(eventId: string) {");
    expect(STORAGE.split("...foraDeOutraReserva,").length - 1).toBe(2);
  });
});

describe("a triagem é da Gráfica e exige o local", () => {
  const INVENTARIO = ler("server/routes/inventory.ts");
  const TELA = ler("client/src/pages/triagem-retorno.tsx");
  const MODAL = ler("client/src/components/triagem-modal.tsx");

  it("só o admin escreve (15/09); excluir e saída/retorno à mão seguem do admin", () => {
    expect(INVENTARIO).toContain('const requireInventoryWrite = requireRole("admin");');
    expect(INVENTARIO).toContain('const requireInventoryAdmin = requireRole("admin");');
    expect(INVENTARIO).toContain('app.delete("/api/inventory/:id", requireInventoryAdmin');
    expect(INVENTARIO).toContain('app.post("/api/events/:id/dispatch-inventory", requireInventoryAdmin');
  });

  // 21/09 — o dono decidiu que o sistema NÃO guarda onde a peça fica no galpão:
  // a exigência de 14/09 caiu (a tela não pede mais o campo; exigir travaria
  // toda triagem para o Galpão). O campo segue aceito, só não é obrigatório.
  it("voltar ao galpão NÃO exige mais o local — nas duas rotas de triagem", () => {
    expect(INVENTARIO).not.toContain("SEM_LOCAL");
    expect(INVENTARIO).toContain("location: z.string().max(120).nullish(),");
  });

  it("manutenção é situação própria, fora do estoque disponível", () => {
    expect(INVENTARIO).toContain('s === "EM_MANUTENCAO" ? "EM_MANUTENCAO"');
    expect(TELA).toContain('r === "MANUTENCAO" ? "EM_MANUTENCAO"');
  });

  it("lote dividido continua dizendo de que peça saiu", () => {
    expect(INVENTARIO).toContain("displayId: `${asset.displayId}-L${ultimoLote}`,");
  });

  it("a tela NÃO pede local (linha, lote, modal, mapa) e sobe as reservadas", () => {
    for (const fonte of [TELA, MODAL]) {
      expect(fonte).not.toContain("input-location");
      expect(fonte).not.toContain("input-bulk-location");
      expect(fonte).not.toContain("input-triage-modal-location");
      expect(fonte).not.toContain("mapa-galpao");
    }
    expect(TELA).toContain("data-testid={`chip-reservada-${asset.id}`}");
  });
});

describe("as telas", () => {
  const APP = ler("client/src/App.tsx");
  const MENU = ler("client/src/components/app-sidebar.tsx");
  // A página + os pedaços em components/detalhe-do-evento/.
  const EVENTO = fonteDaTela("detalhe-do-evento");
  const ESTOQUE = ler("client/src/pages/estoque.tsx");
  const DIALOGO = ler("client/src/components/estoque-semelhantes-dialog.tsx");

  it("Triagem e Estoque são só do admin (15/09)", () => {
    expect(APP).toContain('const ROLES_TRIAGEM = ["admin"];');
    expect(APP).toContain("<RoleProtectedRoute component={TriagemRetorno} allowedRoles={ROLES_TRIAGEM} />");
    expect(APP).toContain('const ROLES_ESTOQUE = ["admin"];');
    expect(APP).toContain("<RoleProtectedRoute component={Estoque} allowedRoles={ROLES_ESTOQUE} />");
    expect(MENU).toContain('url: "/estoque",          icon: Archive,    roles: ["admin"] }');
    expect(MENU).toContain('url: "/triagem-retorno", icon: ScanSearch, roles: ["admin"] }');
  });

  it("a peça do evento mostra o selo do estoque e abre a busca, no desktop e no celular", () => {
    expect(EVENTO).toContain("data-testid={`badge-estoque-${item.id}`}");
    // O selo virou componente: nas DUAS montagens (cartão do celular e linha da tabela).
    expect(EVENTO.split("<SeloDoEstoque item={item} est={estoqueResumo[item.id]} onAbrir={setEstoqueDaPeca} />").length - 1).toBe(2);
    expect(EVENTO).toContain("<EstoqueSemelhantesDialog");
  });

  it("a busca mostra as reservadas, os três grupos reserváveis e o que não dá, com motivo", () => {
    expect(DIALOGO).toContain('const GRUPOS: Disponibilidade[] = ["disponivel", "chega_a_tempo", "falta_triagem"];');
    expect(DIALOGO).toContain('data-testid="button-ver-indisponiveis"');
    expect(DIALOGO).toContain("data-testid={`button-liberar-${r.reservaId}`}");
  });

  it("o Estoque diz quando 'No galpão' não é livre, e esconde o que o papel não pode", () => {
    expect(ESTOQUE).toContain("data-testid={`chip-reservada-${asset.id}`}");
    expect(ESTOQUE).toContain("data-testid={`chip-separada-${asset.id}`}");
    expect(ESTOQUE).toContain('const podeExcluir = user?.role === "admin";');
    expect(ESTOQUE).toContain('const MANUAL_STATUSES: TrackingStatus[] = ["NO_GALPAO", "EM_MANUTENCAO", "DESCARTADO"];');
  });
});
