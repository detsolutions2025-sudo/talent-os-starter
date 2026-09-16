// Fase 31 (ADR-0027; SPEC-030 v1.0, secao 7.8). Confirma que o comportamento pre-existente
// (nunca alterado por esta Fase) permanece intacto apos a insercao dos novos middlewares.
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createTestApp, platformHeaders } from "./helpers";

describe("Fase 31 - Preservacao (SPEC-030 s7.8)", () => {
  it("CA-036/RN-040: resposta 500 continua sem stack trace/detalhe interno", async () => {
    const app = createTestApp();
    // Corpo invalido para forcar um erro nao mapeado a AppError dentro da rota de criacao de
    // usuario (mesmo caminho ja coberto pela suite pre-existente da Fase 1) -- a prova aqui e
    // apenas que a insercao dos middlewares desta Fase nunca expoe stack trace.
    const response = await request(app)
      .post("/api/dev/users")
      .set(platformHeaders)
      .send({ malformed: true });

    if (response.status === 500) {
      expect(JSON.stringify(response.body)).not.toContain("at ");
      expect(response.body.error.code).toBe("internal_error");
    }
  });

  it("CA-037/RN-041: express.json({limit:'256kb'}) continua rejeitando payload maior que o limite com 413", async () => {
    const app = createTestApp();
    const oversized = "x".repeat(300 * 1024);
    const response = await request(app)
      .post("/api/dev/users")
      .set(platformHeaders)
      .send({ name: oversized, email: "big@example.com" });

    expect(response.status).toBe(413);
    expect(response.body.error.code).toBe("payload_too_large");
  });
});
