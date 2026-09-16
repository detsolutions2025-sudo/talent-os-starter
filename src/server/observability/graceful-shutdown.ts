// FAST TRACK CI/CD + Observabilidade (ADR-0027 secao 19, "Graceful shutdown"). Hoje inexistente
// (`app.listen` sem handler de SIGTERM/SIGINT -- achado fisico da propria ADR). Ao receber o
// sinal: para de aceitar novas conexoes (`server.close`), aguarda requisicoes em voo ate um
// timeout maximo, fecha o pool do Postgres explicitamente, e so entao encerra -- pre-requisito
// para rolling restart seguro (nenhum hosting decidido ainda usa isso na pratica, mas o contrato
// fica pronto).
import type { Server } from "node:http";
import type pg from "pg";
import { logger } from "./logger";

const DEFAULT_SHUTDOWN_TIMEOUT_MS = 10_000;

export function registerGracefulShutdown(
  server: Server,
  pool: pg.Pool,
  timeoutMs: number = DEFAULT_SHUTDOWN_TIMEOUT_MS
): void {
  let shuttingDown = false;

  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "Graceful shutdown initiated");

    const forceExit = setTimeout(() => {
      logger.warn("Graceful shutdown timed out waiting for in-flight requests -- forcing exit");
      process.exit(1);
    }, timeoutMs);
    forceExit.unref();

    server.close((closeError) => {
      if (closeError) {
        logger.error({ err: closeError }, "Error while closing HTTP server");
      }
      pool
        .end()
        .catch((poolError) => {
          logger.error({ err: poolError }, "Error while closing PostgreSQL pool");
        })
        .finally(() => {
          clearTimeout(forceExit);
          process.exit(closeError ? 1 : 0);
        });
    });
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}
