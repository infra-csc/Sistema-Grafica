// ─────────────────────────────────────────────────────────────────────────────
// O BLOCO DE PERMISSÕES DA TELA DE USUÁRIOS DIZ A VERDADE.
//
// O formulário oferecia cinco perfis num menu e nada explicava o que cada um
// concede. O bloco novo explica — e por isso passa a poder MENTIR, o que o
// menu mudo não podia. Um bloco que promete poder errado é pior que bloco
// nenhum: quem administra decide "posso dar este perfil para ela?" lendo dali.
//
// Este arquivo amarra cada afirmação da tela à guarda real do servidor
// (`requireRole`, `requireAdmin`, `req.userRole`). Se uma rota mudar de papel
// e a linha da tela ficar, o teste quebra aqui — que é o único lugar onde o
// desencontro aparece antes de virar acesso concedido por engano.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";

const TELA = readFileSync(new URL("../../client/src/pages/usuarios.tsx", import.meta.url), "utf8");

/** Todo o servidor num string só — as guardas moram em arquivos diferentes. */
const SERVIDOR = (() => {
  const dir = new URL("../routes/", import.meta.url);
  return readdirSync(dir)
    .filter((f) => f.endsWith(".ts"))
    .map((f) => readFileSync(new URL(f, dir), "utf8"))
    .join("\n");
})();

/**
 * O corpo de uma rota de escrita, do `app.<verbo>("<rota>"` até a próxima.
 * Sem recortar, um `userRole !== "arte"` de 300 linhas abaixo passaria por
 * guarda desta rota e o teste aprovaria uma permissão que não existe.
 */
function corpoDaRota(rota: string): string {
  const i = SERVIDOR.search(new RegExp(`app\\.(post|patch|put|delete)\\("${rota.replace(/[:/]/g, (c) => "\\" + c)}"`));
  expect(i, `rota não encontrada no servidor: ${rota}`).toBeGreaterThan(-1);
  const j = SERVIDOR.search(new RegExp(`app\\.(get|post|patch|put|delete)\\("`, "g"));
  const resto = SERVIDOR.slice(i + 20);
  const k = resto.search(/app\.(get|post|patch|put|delete)\("/);
  void j;
  return SERVIDOR.slice(i, k > 0 ? i + 20 + k : i + 4000);
}

/** O papel passa nessa rota? */
function aceita(rota: string, papel: string): boolean {
  const corpo = corpoDaRota(rota);
  if (new RegExp(`requireRole\\([^)]*["']${papel}["']`).test(corpo)) return true;
  if (/requireAdmin/.test(corpo)) return papel === "admin";
  const negados = [...corpo.matchAll(/userRole !== ["'](\w+)["']/g)].map((m) => m[1]);
  if (negados.length > 0) return negados.includes(papel);
  const aceitos = [...corpo.matchAll(/userRole === ["'](\w+)["']/g)].map((m) => m[1]);
  if (aceitos.length > 0) return aceitos.includes(papel);
  return false;
}

describe("cada ✓ da tela existe no servidor", () => {
  const PODE: [string, string, string][] = [
    ["admin", "/api/users/:id", "gerenciar usuários"],
    ["solicitacao", "/api/events", "criar eventos"],
    ["solicitacao", "/api/items/:id/creator-review", "revisar peças"],
    ["solicitacao", "/api/items/:id/edit", "editar peças"],
    ["solicitacao", "/api/items/:id/cancel", "cancelar peças"],
    ["arte", "/api/items/:id/submit-for-approval", "enviar para aprovação"],
    ["arte", "/api/items/:id/submit-final-file", "anexar arquivo final"],
    ["arte", "/api/items/:id/update-thumb", "anexar a arte"],
    ["arte", "/api/events/:eventId/book", "publicar o book"],
    ["grafica", "/api/items/:id/start-production", "iniciar produção"],
    ["grafica", "/api/items/:id/return-to-review", "devolver para revisão"],
    ["grafica", "/api/items/:itemId/photos", "anexar fotos"],
    ["atendimento", "/api/items/:id/sponsor-approvals/:sponsorId/approve", "aprovar pelo patrocinador"],
    ["atendimento", "/api/items/:id/sponsor-approvals/:sponsorId/revert", "revogar decisão"],
    ["atendimento", "/api/quota-rules/global", "ajustar cotas"],
  ];

  for (const [papel, rota, oQue] of PODE) {
    it(`${papel} pode ${oQue} (${rota})`, () => {
      expect(aceita(rota, papel)).toBe(true);
    });
  }
});

describe("cada × da tela também existe no servidor", () => {
  const NAO_PODE: [string, string, string][] = [
    // "Não decide aprovação de patrocinador" — dito para solicitação e arte
    ["solicitacao", "/api/items/:id/sponsor-approvals/:sponsorId/approve", "decidir aprovação de patrocinador"],
    ["arte", "/api/items/:id/sponsor-approvals/:sponsorId/approve", "decidir aprovação de patrocinador"],
    ["grafica", "/api/items/:id/sponsor-approvals/:sponsorId/approve", "decidir aprovação de patrocinador"],
    // "Não cria nem exclui eventos" — dito para arte e atendimento
    ["arte", "/api/events", "criar eventos"],
    ["atendimento", "/api/events", "criar eventos"],
    ["grafica", "/api/events", "criar eventos"],
    ["solicitacao", "/api/events/:id", "excluir eventos"],
    // "Não anexa arte e arquivo final" — dito para solicitação, gráfica e atendimento
    ["solicitacao", "/api/items/:id/submit-final-file", "anexar arquivo final"],
    ["grafica", "/api/items/:id/submit-final-file", "anexar arquivo final"],
    ["atendimento", "/api/items/:id/submit-final-file", "anexar arquivo final"],
    ["grafica", "/api/items/:id/submit-for-approval", "enviar para aprovação"],
    // "Não inicia produção" — dito para atendimento
    ["atendimento", "/api/items/:id/start-production", "iniciar produção"],
    // só admin mexe em usuário
    ["solicitacao", "/api/users/:id", "gerenciar usuários"],
    ["arte", "/api/users/:id", "gerenciar usuários"],
  ];

  for (const [papel, rota, oQue] of NAO_PODE) {
    it(`${papel} NÃO pode ${oQue} (${rota})`, () => {
      expect(aceita(rota, papel)).toBe(false);
    });
  }
});

describe("o bloco na tela", () => {
  it("existe para os cinco perfis, com quatro linhas cada", () => {
    for (const papel of ["admin", "solicitacao", "arte", "grafica", "atendimento"]) {
      const i = TELA.indexOf(`  ${papel}: [`);
      expect(i, `perfil sem permissões declaradas: ${papel}`).toBeGreaterThan(-1);
      const bloco = TELA.slice(i, TELA.indexOf("  ],", i));
      expect(bloco.match(/\{ pode:/g)?.length, `${papel} deveria ter 4 linhas`).toBe(4);
    }
  });

  it("só o Admin não tem linha de 'não faz' — ele não tem restrição", () => {
    const bloco = (papel: string) => TELA.slice(TELA.indexOf(`  ${papel}: [`), TELA.indexOf("  ],", TELA.indexOf(`  ${papel}: [`)));
    expect(bloco("admin")).not.toContain("pode: false");
    for (const papel of ["solicitacao", "arte", "grafica", "atendimento"]) {
      expect(bloco(papel).match(/pode: false/g)?.length).toBe(2);
    }
  });

  it("o Admin ganha o tratamento vermelho e a frase do poder sem restrição", () => {
    expect(TELA).toContain('const ehAdmin = field.value === "admin";');
    expect(TELA).toContain('backgroundColor: ehAdmin ? "#fef2f2" : "#fafaf9"');
    expect(TELA).toContain("Perfil sem restrição: pode excluir dados e conceder acesso a outras pessoas.");
  });

  it("o ✓ e o × chegam ao leitor de tela como palavra, não só como cor", () => {
    expect(TELA).toContain('{l.pode ? "Pode: " : "Não pode: "}');
  });

  it('e tem o testid pedido', () => {
    expect(TELA).toContain('data-testid="bloco-permissoes"');
  });
});

describe("o que NÃO podia mudar continua de pé", () => {
  it("o card de Nível de Segurança segue fora", () => {
    // A expressão AINDA aparece no arquivo — no comentário que explica por que
    // o card saiu, e esse comentário é o que impede alguém de "reconstituir a
    // funcionalidade que faltava". O que não pode voltar é o card renderizado.
    const ocorrencias = TELA.match(/Nível de Segurança/g)?.length ?? 0;
    expect(ocorrencias).toBe(1);
    expect(TELA).toContain('O card "Nível de Segurança" foi REMOVIDO');
  });

  it("os dois FreezeWhileClosing continuam", () => {
    expect(TELA.match(/<FreezeWhileClosing/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("a lixeira continua ausente na própria linha", () => {
    expect(TELA).toContain("me?.id !== user.id");
  });

  it("o campo Perfil continua sendo o FilterSelect da casa", () => {
    expect(TELA).toContain('kind="field"');
    expect(TELA).toContain('testId="select-role"');
  });
});
