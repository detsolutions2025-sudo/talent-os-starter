// FAST TRACK CI/CD + Observabilidade (ADR-0027 secao 19, "Process resilience"). Hoje so existe
// `pool.on("error", ...)` pontual para o Postgres -- nenhum handler global de
// `uncaughtException`/`unhandledRejection` existia (achado fisico da propria ADR). Decisao ja
// tomada pela ADR: logar o erro e encerrar o processo de forma controlada, nunca continuar
// rodando em estado corrompido; reinicio fica a cargo da restart policy do
// hosting/orquestrador, fora desta Fase.
import { logger } from "./logger";

export function registerProcessResilienceHandlers(): void {
  process.on("uncaughtException", (error) => {
    logger.fatal({ err: error }, "uncaughtException -- shutting down");
    process.exit(1);
  });

  process.on("unhandledRejection", (reason) => {
    logger.fatal({ err: reason }, "unhandledRejection -- shutting down");
    process.exit(1);
  });
}
