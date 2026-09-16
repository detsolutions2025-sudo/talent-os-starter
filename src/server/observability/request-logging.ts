// FAST TRACK CI/CD + Observabilidade (ADR-0027 secao 10/11). Correlation/request ID gerado por
// requisicao (nunca aceito de um header de entrada nao confiavel -- um cliente nao deve poder
// forcar um ID arbitrario nos logs do servidor), propagado em `request.log`/`request.id` (via
// `pino-http`) e devolvido em `X-Request-Id` na resposta, para correlacionar um erro relatado
// pelo cliente com a linha de log correspondente no servidor.
import { randomUUID } from "node:crypto";
import pinoHttp from "pino-http";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { logger } from "./logger";

export function createRequestLoggingMiddleware(): RequestHandler {
  // Nao loga corpo de requisicao/resposta (evita vazar payload de negocio/PII) -- apenas
  // metadados de metodo, rota, status e duracao, via os serializers padrao do pino-http.
  return pinoHttp({
    logger,
    genReqId: () => randomUUID()
  }) as unknown as RequestHandler;
}

export function attachRequestIdHeader(request: Request, response: Response, next: NextFunction) {
  if (request.id) {
    response.setHeader("X-Request-Id", String(request.id));
  }
  next();
}
