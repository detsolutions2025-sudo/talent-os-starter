// FAST TRACK CI/CD + Observabilidade (ADR-0027 secao 11, achado fisico: "respostas 5xx do error
// handler global hoje nao logam nada"). Prova direta do contrato de logging do error handler,
// sem precisar forcar uma excecao atraves de uma rota real de negocio.
import { describe, expect, it, vi } from "vitest";
import { createApiErrorHandler } from "../../src/server/app";
import { AppError } from "../../src/server/core/errors";
import { logger } from "../../src/server/observability/logger";

function fakeResponse() {
  const response = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      response.statusCode = code;
      return response;
    },
    json(payload: unknown) {
      response.body = payload;
      return response;
    }
  };
  return response;
}

describe("Observabilidade - createApiErrorHandler (ADR-0027 s11)", () => {
  it("erro generico (nao-AppError) e logado via logger.error e responde 500 sem stack trace", () => {
    const spy = vi.spyOn(logger, "error").mockImplementation(() => logger);
    const handler = createApiErrorHandler();
    const response = fakeResponse();
    const error = new Error("boom, something exploded deep inside a service");

    handler(error, { id: "req-1" } as never, response as never, (() => {}) as never);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(response.statusCode).toBe(500);
    expect(response.body).toEqual({
      error: { code: "internal_error", message: "Internal error." }
    });
    expect(JSON.stringify(response.body)).not.toContain("boom");
    expect(JSON.stringify(response.body)).not.toContain("at ");

    spy.mockRestore();
  });

  it("AppError com statusCode 5xx e logado (achado fisico da ADR-0027 s11)", () => {
    const spy = vi.spyOn(logger, "error").mockImplementation(() => logger);
    const handler = createApiErrorHandler();
    const response = fakeResponse();
    const error = new AppError(502, "upstream_failure", "Upstream provider failed.");

    handler(error, { id: "req-2" } as never, response as never, (() => {}) as never);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(response.statusCode).toBe(502);

    spy.mockRestore();
  });

  it("AppError com statusCode 4xx NUNCA e logado como erro (nao e falha operacional)", () => {
    const spy = vi.spyOn(logger, "error").mockImplementation(() => logger);
    const handler = createApiErrorHandler();
    const response = fakeResponse();
    const error = new AppError(404, "not_found", "Resource not found.");

    handler(error, { id: "req-3" } as never, response as never, (() => {}) as never);

    expect(spy).not.toHaveBeenCalled();
    expect(response.statusCode).toBe(404);

    spy.mockRestore();
  });

  it("payload muito grande (413) NUNCA e logado como erro -- e uma rejeicao esperada do cliente", () => {
    const spy = vi.spyOn(logger, "error").mockImplementation(() => logger);
    const handler = createApiErrorHandler();
    const response = fakeResponse();
    const error = { type: "entity.too.large" };

    handler(error, { id: "req-4" } as never, response as never, (() => {}) as never);

    expect(spy).not.toHaveBeenCalled();
    expect(response.statusCode).toBe(413);

    spy.mockRestore();
  });
});
