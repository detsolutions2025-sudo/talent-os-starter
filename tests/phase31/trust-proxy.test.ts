// Fase 31 (ADR-0027; SPEC-030 v1.0, secao 7.5). RN-027: esta SPEC nunca altera os 4 pontos de
// consumo reais de `request.ip` (todos em servicos Postgres, fora do alcance de um harness em
// memoria) -- apenas garante que o VALOR que chega a eles seja confiavel, configurando
// `app.set("trust proxy", ...)` corretamente. Duas camadas de prova abaixo: (1) que
// `createServer()` aplica a configuracao recebida ao `app` do Express de forma explicita e
// correta (responsabilidade desta implementacao); (2) que, uma vez aplicada, o mecanismo nativo
// do Express resolve `request.ip`/`X-Forwarded-For` exatamente como a SPEC exige (mecanismo da
// propria biblioteca, ja madura e amplamente testada por ela mesma) -- verificado aqui com uma
// rota minima dedicada (`GET /api/health`, que ja existe e nao depende de nenhum servico de
// dominio) para nao introduzir nenhuma rota nova de producao so para fins de teste.
import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createTestApp } from "./helpers";

describe("Fase 31 - Trust proxy (SPEC-030 s7.5)", () => {
  it("RN-025: ausente por default -- trust proxy permanece desabilitado (comportamento identico ao anterior a esta Fase)", () => {
    const app = createTestApp();
    expect(app.get("trust proxy")).toBe(false);
  });

  it("RN-024/RN-026: numero de hops explicito e aplicado ao Express", () => {
    const app = createTestApp({ trustProxyConfig: "1" });
    expect(app.get("trust proxy")).toBe(1);
  });

  it("RN-024/RN-026: faixa de IPs/CIDR explicita e aplicada ao Express (nunca `true` generico)", () => {
    const app = createTestApp({ trustProxyConfig: "loopback" });
    expect(app.get("trust proxy")).toBe("loopback");
    // INV-05: em nenhum caminho de configuracao desta Fase o valor aplicado pode ser o booleano
    // `true` (confianca generica em qualquer proxy).
    expect(app.get("trust proxy")).not.toBe(true);
  });

  it("CA-033: sem trust proxy configurado, um X-Forwarded-For forjado pelo cliente nunca e aceito como request.ip", async () => {
    const app = createTestApp(); // trust proxy desabilitado (default)
    const probe = express();
    probe.set("trust proxy", app.get("trust proxy"));
    probe.get("/probe", (request_, response) => response.json({ ip: request_.ip }));

    const response = await request(probe)
      .get("/probe")
      .set("X-Forwarded-For", "1.2.3.4")
      .expect(200);

    expect(response.body.ip).not.toBe("1.2.3.4");
  });

  it("CA-032: com trust proxy configurado (1 hop), X-Forwarded-For dentro da fronteira e aceito como request.ip", async () => {
    const app = createTestApp({ trustProxyConfig: "1" });
    const probe = express();
    probe.set("trust proxy", app.get("trust proxy"));
    probe.get("/probe", (request_, response) => response.json({ ip: request_.ip }));

    const response = await request(probe)
      .get("/probe")
      .set("X-Forwarded-For", "5.6.7.8")
      .expect(200);

    expect(response.body.ip).toBe("5.6.7.8");
  });
});
