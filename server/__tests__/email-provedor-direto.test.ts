import { afterEach, describe, expect, it, vi } from "vitest";
import { entregarEmail } from "../services/bookEmailNotification";

const message = { from: "sistema@example.com", to: ["teste@example.com"], subject: "Teste", text: "Mensagem", html: "<p>Mensagem</p>" };
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("entrega direta ao provedor de e-mail", () => {
  it("sem chave falha antes de fazer qualquer requisição", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const request = vi.fn();
    vi.stubGlobal("fetch", request);
    await expect(entregarEmail(message)).rejects.toThrow("RESEND_API_KEY");
    expect(request).not.toHaveBeenCalled();
  });

  it("envia a mensagem diretamente, com autenticação e limite de tempo", async () => {
    vi.stubEnv("RESEND_API_KEY", "chave-apenas-do-teste");
    const request = vi.fn().mockResolvedValue(new Response('{"id":"teste"}', { status: 200 }));
    vi.stubGlobal("fetch", request);
    await entregarEmail(message);
    expect(request).toHaveBeenCalledWith("https://api.resend.com/emails", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ Authorization: "Bearer chave-apenas-do-teste" }),
      body: JSON.stringify(message),
      signal: expect.any(AbortSignal),
    }));
  });

  it("propaga falha do provedor sem tratá-la como envio concluído", async () => {
    vi.stubEnv("RESEND_API_KEY", "chave-apenas-do-teste");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{"message":"domínio não verificado"}', { status: 403 })));
    await expect(entregarEmail(message)).rejects.toThrow("HTTP 403: domínio não verificado");
  });
});
