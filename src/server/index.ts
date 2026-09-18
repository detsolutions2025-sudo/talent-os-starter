import { buildApp } from "./bootstrap";
import { logger } from "./observability/logger";
import { registerGracefulShutdown } from "./observability/graceful-shutdown";

// Entrypoint tradicional (processo Node de longa duracao, `npm run dev:api` local ou qualquer
// hosting baseado em processo persistente): toda a montagem do app (config validation, pool,
// servicos, `createServer()`) vive em `bootstrap.ts` -- ver esse arquivo para o contrato completo
// e a garantia de ordem coberta por `tests/phase30/bootstrap-smoke.test.ts`. Este arquivo
// preserva, byte a byte, o comportamento observavel de antes desta extracao (Wave de
// Hospedagem/Vercel): mesma ordem de boot, mesma mensagem de log, mesmo `app.listen()` seguido
// de `registerGracefulShutdown()`.
//
// A Serverless Function do Vercel (`api/index.ts`) usa a MESMA `buildApp()`, mas nunca chama
// `listen()`/`registerGracefulShutdown()` -- a plataforma gerencia o ciclo de vida do processo.
const port = Number(process.env.PORT ?? 3001);
const { app, pool } = buildApp();

const server = app.listen(port, () => {
  logger.info({ port }, "Talent OS API listening");
});

// FAST TRACK CI/CD + Observabilidade (ADR-0027 secao 19). Pre-requisito para rolling restart
// seguro: para de aceitar novas conexoes, aguarda requisicoes em voo, fecha o pool do Postgres
// explicitamente, e so entao encerra.
registerGracefulShutdown(server, pool);
