// ─────────────────────────────────────────────────────────────────────────────
// UM AVISO, UM ENVIO — mesmo com o deploy em autoscale (dono, 01/09:
// "triplicando os emails", com o print de três "Aprovações pendentes · 372"
// às 15:00 e três "Revisão · 2 peças esperando").
//
// A causa: `deploymentTarget = "autoscale"` no .replit sobe VÁRIAS réplicas do
// processo, cada uma com o próprio relógio. A trava era ler a trilha antes de
// mandar — mas a trilha só é escrita DEPOIS do envio, então as três liam
// "ainda não mandei" no mesmo segundo e as três mandavam.
//
// A trava nova é uma reserva atômica no banco (INSERT ... ON CONFLICT DO
// NOTHING numa chave primária): exatamente uma réplica recebe a linha. Este
// arquivo pina o mecanismo e as três decisões que o cercam:
//   · a reserva vem ANTES de qualquer envio (não adianta reservar depois);
//   · o disparo MANUAL continua passando por cima (alguém pediu e está
//     esperando o e-mail na tela);
//   · falha aberta: banco fora/tabela ausente NÃO cala o aviso — duplicado é
//     detectável, silêncio não é (foi o que aconteceu em agosto).
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const ler = (rel: string) => readFileSync(path.resolve(__dirname, "../..", rel), "utf8");
const RESERVA = ler("server/services/reservaDeDisparo.ts");
const GESTAO = ler("server/services/gestaoDigest.ts");
const REVISAO = ler("server/services/revisaoDigest.ts");
const ALERTAS = ler("server/services/deadlineAlerts.ts");
const SCHEMA = ler("shared/schema.ts");
const ROUTES = ler("server/routes.ts");

describe("o mecanismo", () => {
  it("é atômico no banco — chave primária + ON CONFLICT DO NOTHING, não um flag em memória", () => {
    expect(SCHEMA).toContain('pgTable("reservas_de_disparo"');
    expect(SCHEMA).toContain('chave: text("chave").primaryKey()');
    expect(RESERVA).toContain(".onConflictDoNothing()");
    expect(RESERVA).toContain(".returning({ chave: reservasDeDisparo.chave })");
    expect(RESERVA).toContain("if (ganhou.length === 0)");
  });

  it("falha ABERTA: sem banco o aviso vai, porque silêncio não é detectável", () => {
    const catchDoReservar = RESERVA.slice(RESERVA.indexOf("export async function reservarDisparo"));
    expect(catchDoReservar.slice(0, 1200)).toContain("return true;");
    expect(RESERVA).toContain("a trava não valeu desta vez");
  });
});

describe("os dois avisos por e-mail", () => {
  it("reservam ANTES de enviar — logo depois de ler a trilha, antes do interruptor e da fila", () => {
    for (const [nome, src, canal] of [["gestão", GESTAO, "gestao"], ["revisão", REVISAO, "revisao"]] as const) {
      expect(src, nome).toContain(`const chaveDaEdicao = \`${canal}:\${dia}:\${hora}\``);
      expect(src, nome).toContain("if (!opcoes.manual && !(await reservarDisparo(chaveDaEdicao))) return { status: \"ja-enviado\" };");
      // a reserva tem de vir antes do envio de verdade
      expect(src.indexOf("reservarDisparo"), nome).toBeLessThan(src.indexOf("entregarEmail(montado)"));
    }
  });

  it("o disparo MANUAL continua passando por cima da reserva", () => {
    for (const src of [GESTAO, REVISAO]) {
      expect(src).toContain("!opcoes.manual && !(await reservarDisparo(chaveDaEdicao))");
    }
  });

  it("o desfecho fica anotado na reserva — dá para responder 'quem mandou e o que saiu'", () => {
    for (const src of [GESTAO, REVISAO]) {
      expect(src).toContain("if (!opcoes.manual) await anotarDesfecho(chaveDaEdicao, desfecho);");
    }
    expect(RESERVA).toContain("export const ID_DA_INSTANCIA");
  });
});

describe("os alertas de prazo", () => {
  it("não confiam mais só na memória do processo — cada réplica tinha a sua", () => {
    expect(ALERTAS).toContain("async function podeAlertar(chave: string)");
    expect(ALERTAS).toContain("return await reservarDisparo(`alerta:${chave}`);");
    // os dois pontos de alerta passaram a usar a porta única
    const usos = ALERTAS.match(/if \(await podeAlertar\(alertKey\)\)/g) ?? [];
    expect(usos.length).toBe(2);
    // e ninguém mais decide direto pelo Set
    expect(ALERTAS).not.toContain("if (!sentAlertKeys.has(alertKey)) {");
  });
});

describe("a manutenção", () => {
  it("a tabela não cresce para sempre — faxina de 90 dias no boot", () => {
    expect(RESERVA).toContain("interval '90 days'");
    expect(ROUTES).toContain("limparReservasAntigas();");
  });
});
