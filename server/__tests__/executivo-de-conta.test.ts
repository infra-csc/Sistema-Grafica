// ─────────────────────────────────────────────────────────────────────────────
// EXECUTIVO DE CONTA — a base do roteamento por executivo (25/08).
//
// O aviso do book vai para os executivos dos patrocinadores DAQUELE evento, em
// vez do atendimento inteiro (chave ligada em 25/08). O bloqueio nunca foi de
// código: a coluna `account_executive_id` está preenchida numa minoria das
// contas, e patrocinador sem executivo não coloca ninguém do atendimento no
// aviso — por decisão do dono, em vez de cair no time inteiro.
//
// O script de inferência é o que enche esse cadastro — e o que este arquivo
// guarda é a DISCIPLINA dele: propor, não adivinhar. Um script que vincula 100
// contas por heurística sem revisão humana erra em silêncio, e o erro só
// aparece meses depois, quando o aviso não chega para ninguém.
// ─────────────────────────────────────────────────────────────────────────────
//
// O sinal no banco, quem recebe o aviso, o preview, a inferência, o script e
// a rota só-admin rodam de verdade em regras-patrocinio-executivos. Aqui fica
// a tela.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const ler = (rel: string) => readFileSync(path.resolve(__dirname, "../..", rel), "utf8");
const TELA = ler("client/src/pages/inferir-executivos.tsx");

describe("a aplicação pela produção é explícita e protegida", () => {
  it("a tela separa claros, duvidosos e sem sinal antes de aplicar", () => {
    expect(TELA).toContain("Propostas claras");
    expect(TELA).toContain("Preservados para decisão manual");
    expect(TELA).toContain("Sem sinal histórico");
    // A confirmação antes de aplicar continua — agora no diálogo do app
    // (useConfirmar), não na caixa do sistema que trava a thread.
    expect(TELA).toContain("await confirmar({");
    expect(TELA).not.toContain("window.confirm(");
  });
});
