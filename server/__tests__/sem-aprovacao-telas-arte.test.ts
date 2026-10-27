// ─────────────────────────────────────────────────────────────────────────────
// PEÇAS SEM APROVAÇÃO NAS TELAS (Pedro/dono, 26/10) — Arte, Vinculação,
// Revisão Final e Gráfica.
//
//   · Arte: a peça com "Sem patrocínio" ou "Arte do cliente" em Layout é
//     medida pelo prazo de Layout AJUSTADO (Layout do evento + N dias
//     corridos, N = configuração) — a coluna, o filtro "atrasadas" e a ordem
//     por prazo. O Kit continua medido pela Aprovação. A arte do cliente
//     ainda não recebida troca o envio por thumb pelo "Arte recebida".
//   · Vinculação: o rótulo da marca é "Sem patrocínio"; "Arte do cliente"
//     também deixa a peça seguir para a Arte sem patrocinador.
//   · Revisão Final e Gráfica: o selo da marca na linha.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { isAtrasadaNaFase, filtrarAtrasadasDaFase, prazoDaPecaNaFase } from "../../client/src/lib/arte-rules";
import { acaoPrimaria } from "../../client/src/components/arte/celulas-da-peca";
import { getItemUIStatus } from "../../client/src/components/vinculacao/regras";
import { resolverFaixa } from "../../client/src/components/ficha-da-peca/regras-da-faixa";

const RAIZ = path.resolve(__dirname, "../..");
const ler = (rel: string) => readFileSync(path.join(RAIZ, rel), "utf8");

// Saída do caminhão: terça, 01/12/2026. Entrega de Layouts (−20) = quarta
// 11/11; Aprovação (−12) = quinta 19/11; Finalização (−10) = sábado 21/11 →
// sexta 20/11. "Hoje" = domingo 15/11.
const EVENTO = { truckDepartureDate: "2026-12-01T12:00:00.000Z", deadlineEntregaLayouts: -20, deadlineAprovacaoLayout: -12, deadlineFinalizacao: -10 };
const HOJE = new Date(2026, 10, 15);
const dia = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const peca = (over: Record<string, unknown> = {}) => ({
  id: "p1", displayId: "#1", eventId: "e1", status: "awaiting_submission",
  skipApproval: false, arteDoCliente: false, arteRecebidaEm: null, kitRemessaId: null,
  approvalThumbUrl: null, type: "Pórtico", event: EVENTO, ...over,
});

describe("Arte: o prazo da peça sem aprovação em Layout é o AJUSTADO", () => {
  it("a peça comum segue o Layout do evento (11/11) e está atrasada", () => {
    const p = prazoDaPecaNaFase(peca(), "criar-aprovacoes", HOJE, 7)!;
    expect(dia(p.date)).toBe("2026-11-11");
    expect(p.ajustado).toBe(false);
    expect(isAtrasadaNaFase(peca(), "criar-aprovacoes", HOJE, 7)).toBe(true);
  });

  it("“Sem patrocínio” e “Arte do cliente” ganham os N dias da Aprovação (11/11 → 18/11) e não estão atrasadas", () => {
    for (const marca of [{ skipApproval: true }, { arteDoCliente: true }, { skipApproval: true, arteDoCliente: true }]) {
      const p = prazoDaPecaNaFase(peca(marca), "criar-aprovacoes", HOJE, 7)!;
      expect(dia(p.date)).toBe("2026-11-18");
      expect(p.ajustado).toBe(true);
      expect(dia(p.normal!)).toBe("2026-11-11");
      expect(p.diff).toBe(3);
      expect(isAtrasadaNaFase(peca(marca), "criar-aprovacoes", HOJE, 7)).toBe(false);
    }
  });

  it("N vem da configuração — nunca um 7 fixo — e o resultado segue a regra de fim de semana do Layout", () => {
    expect(dia(prazoDaPecaNaFase(peca({ skipApproval: true }), "criar-aprovacoes", HOJE, 5)!.date)).toBe("2026-11-16");
    // 11/11 + 4 = domingo 15/11 → segunda 16/11.
    expect(dia(prazoDaPecaNaFase(peca({ skipApproval: true }), "criar-aprovacoes", HOJE, 4)!.date)).toBe("2026-11-16");
    // Com N = 3 o prazo ajustado (14/11, sábado → sexta 13/11) já passou.
    expect(isAtrasadaNaFase(peca({ skipApproval: true }), "criar-aprovacoes", HOJE, 3)).toBe(true);
  });

  it("Kit (26/10: cobrado da Entrega de Layouts): com marca, o mesmo Layout ajustado das outras", () => {
    const p = prazoDaPecaNaFase(peca({ skipApproval: true, kitRemessaId: "k1" }), "criar-aprovacoes", HOJE, 7)!;
    expect(dia(p.date)).toBe("2026-11-18");
    expect(p.ajustado).toBe(true);
  });

  it("depois do Layout nada muda: na Finalização vale o marco da Finalização", () => {
    const p = prazoDaPecaNaFase(peca({ skipApproval: true, status: "awaiting_creator_review" }), "finalizar-layouts", HOJE, 7)!;
    expect(dia(p.date)).toBe("2026-11-20");
    expect(p.ajustado).toBe(false);
  });

  it("o filtro “atrasadas” usa a mesma régua", () => {
    const lista = [peca({ id: "a" }), peca({ id: "b", skipApproval: true }), peca({ id: "c", arteDoCliente: true })];
    expect(filtrarAtrasadasDaFase(lista, "criar-aprovacoes", HOJE, 7).map((p) => p.id)).toEqual(["a"]);
  });

  it("as telas passam a configuração (useDiasDaAprovacao), não o padrão", () => {
    const fila = ler("client/src/components/arte/use-fila-da-arte.ts");
    expect(fila).toContain("const diasDaAprovacao = useDiasDaAprovacao();");
    expect(fila).toContain("filtrarAtrasadasDaFase(itemsByTabBase[tab], tab, hoje, diasDaAprovacao)");
    expect(ler("client/src/components/arte/celulas-da-peca.tsx")).toContain("prazoDaPecaNaFase(item, tabId, hoje, diasDaAprovacao)");
    expect(ler("client/src/components/arte/fila-agrupada.tsx")).toContain("isAtrasadaNaFase(i, tabId, hoje, diasDaAprovacao)");
  });
});

describe("Arte: a ação da linha da arte do cliente", () => {
  it("aguardando o arquivo: “Arte recebida”, sem envio por thumb", () => {
    const a = acaoPrimaria(peca({ arteDoCliente: true, approvalThumbUrl: "/objects/t.png" }) as never, "criar-aprovacoes", true)!;
    expect(a.label).toBe("Arte recebida");
    expect(a.arteRecebida).toBe(true);
    expect(a.aguardaArte).toBe(true);
    expect(a.canSendDirect).toBe(false);
  });

  it("arquivo já recebido: “Enviar direto”, pelo mesmo diálogo (vai para a Finalização)", () => {
    const a = acaoPrimaria(peca({ arteDoCliente: true, arteRecebidaEm: "2026-11-10" }) as never, "criar-aprovacoes", true)!;
    expect(a.label).toBe("Enviar direto");
    expect(a.arteRecebida).toBe(true);
    expect(a.aguardaArte).toBe(false);
  });

  it("“Sem patrocínio” sozinho segue abrindo a ficha para o thumb", () => {
    const a = acaoPrimaria(peca({ skipApproval: true }) as never, "criar-aprovacoes", true)!;
    expect(a.label).toBe("Enviar direto");
    expect(a.arteRecebida).toBe(false);
  });

  it("a ficha troca o bloco do thumb pelo “Arte recebida” e o lote não envia a peça que espera", () => {
    const painel = ler("client/src/components/arte/painel-thumb-aprovacao.tsx");
    expect(painel).toContain('data-testid="painel-arte-do-cliente"');
    // revisão 27/10: o nome canônico da ação ("Arte recebida").
    expect(painel).toContain("Peça com arte do cliente: quando o arquivo chegar, registre “Arte recebida”");
    expect(painel).toContain("pulaAprovacao(selectedItem) ? 'Enviar direto para a finalização (arquivo final)'");
    expect(ler("client/src/pages/arte.tsx")).toContain("!aguardandoArteDoCliente(itemPorId.get(id))");
    expect(ler("client/src/components/arte/use-lote-de-thumbs.ts")).toContain("!aguardandoArteDoCliente(alvo)");
    expect(ler("client/src/components/arte/celulas-da-peca.tsx")).toContain("<SelosSemAprovacao peca={item}");
  });
});

describe("Vinculação: “Sem patrocínio” e “Arte do cliente”", () => {
  const base = { id: "p1", displayId: "#1", eventId: "e1", type: "Pórtico", description: null, status: "awaiting_linking", skipApproval: false, isReuse: false, quantity: 1, calculatedM2: "0", referenceUrl: null, kitRemessaId: null, arteDoCliente: false, arteRecebidaEm: null, arteRecebidaPor: null };
  it("a arte do cliente sem patrocinador fica PRONTA para a Arte, como a sem patrocínio", () => {
    expect(getItemUIStatus(base, [])).toBe("PENDENTE");
    expect(getItemUIStatus({ ...base, skipApproval: true }, [])).toBe("PRONTO");
    expect(getItemUIStatus({ ...base, arteDoCliente: true }, [])).toBe("PRONTO");
  });

  it("o rótulo da marca é “Sem patrocínio”; o que fala de patrocinadores não muda", () => {
    const linha = ler("client/src/components/vinculacao/linha-da-peca.tsx");
    expect(linha).toContain(">Sem patrocínio</Selo>");
    expect(linha).not.toMatch(/>\s*Sem patrocinador\s*</);
    expect(linha).toContain("Sem patrocinadores no evento");
    const lote = ler("client/src/components/vinculacao/modal-aplicar-em-lote.tsx");
    expect(lote).toContain(">Sem patrocínio</span>");
    expect(lote).toContain("Marcar ${selectedItemIds.size} sem patrocínio");
    expect(ler("client/src/components/vinculacao/cabecalho-da-vinculacao.tsx")).toContain(">Sem patrocínio</strong>");
    expect(ler("client/src/components/vinculacao/modal-confirmar-envio.tsx")).toContain("Sem patrocinadores vinculados");
  });

  it("o lote das marcas (Arte do cliente incluída) é só de admin e Solicitação, num evento só", () => {
    const pagina = ler("client/src/pages/vincular-patrocinadores.tsx");
    expect(pagina).toContain("PAPEIS_QUE_MARCAM.includes(user?.role ?? \"\")");
    expect(pagina).toContain("<MarcarSemAprovacaoDialog");
    expect(pagina).toContain("As marcas vão em peças de um evento só");
    expect(ler("client/src/components/vinculacao/barra-de-lote.tsx")).toContain('data-testid="button-marcas-sem-aprovacao"');
  });
});

describe("Revisão Final e Gráfica: o selo da marca", () => {
  it("Revisão: linha, cartão e ficha", () => {
    for (const f of ["linha-da-peca.tsx", "cartao-da-peca.tsx", "modal-de-decisao.tsx"]) {
      expect(ler(`client/src/components/revisao/${f}`)).toContain("<SelosSemAprovacao peca={");
    }
  });
  it("Gráfica: só “Arte cliente” (o “Sem patrocínio” não muda nada para quem imprime)", () => {
    for (const f of ["linha-da-tabela.tsx", "cartao-da-peca.tsx"]) {
      expect(ler(`client/src/components/grafica/fila/${f}`)).toContain("peca={item.arteDoCliente ? { ...item, skipApproval: false } : null}");
    }
  });
});

describe("Ficha da peça: o subestado e as marcas (RF06/RF07/RF12, revisão 27/10)", () => {
  const base = { id: "p1", displayId: "#1", status: "awaiting_submission", sponsors: [] as { id: string }[] };
  const faixa = (item: Record<string, unknown>, rawStatus = String(item.status)) =>
    resolverFaixa({ item: item as never, rawStatus, approvalsList: [], eventosPercurso: [] });

  it("arte do cliente sem o arquivo: “Layout — Aguardando arte do cliente” e quem age é o cliente", () => {
    const f = faixa({ ...base, arteDoCliente: true });
    expect(f.bloqueio.frase.startsWith("Layout — Aguardando arte do cliente")).toBe(true);
    expect(f.vezDeQuem).toContain("Arte recebida");
    // Na vinculação também (o subestado vale em todo o Layout).
    expect(faixa({ ...base, status: "awaiting_linking", arteDoCliente: true }).bloqueio.frase.startsWith("Layout — Aguardando arte do cliente")).toBe(true);
  });

  it("sem patrocínio não diz “enviar para aprovação”; na Finalização não diz “Aprovada”", () => {
    expect(faixa({ ...base, skipApproval: true }).bloqueio.frase).toContain("sem Aprovação");
    expect(faixa({ ...base, skipApproval: true }).bloqueio.frase).not.toContain("aprovação");
    expect(faixa({ ...base, status: "awaiting_creator_review", skipApproval: true }).bloqueio.frase).toBe("Sem aprovação — falta finalizar a arte");
    // A peça comum continua como sempre.
    expect(faixa(base).bloqueio.frase).toContain("Aguardando a Arte enviar para aprovação");
  });

  it("o cabeçalho da ficha mostra os selos e o prazo normal × ajustado", () => {
    const CAB = ler("client/src/components/ficha-da-peca/cabecalho.tsx");
    expect(CAB).toContain("<SelosSemAprovacao peca={item} />");
    expect(CAB).toContain("<PrazoDeLayoutAjustado peca={item} evento={item.event}");
  });
});
