// FAST TRACK CI/CD + Observabilidade (ADR-0027 secao 19, "Process resilience"). Hoje so existe
// `pool.on("error", ...)` pontual para o Postgres -- nenhum handler global de
// `uncaughtException`/`unhandledRejection` existia (achado fisico da propria ADR). Decisao ja
// tomada pela ADR: logar o erro e encerrar o processo de forma controlada, nunca continuar
// rodando em estado corrompido; reinicio fica a cargo da restart policy do
// hosting/orquestrador, fora desta Fase.
import pino from "pino";
import { REDACT_PATHS } from "./logger";

// CORRECAO (achado fisico do primeiro run real de CI, ver tests/phase30/bootstrap-smoke.test.ts):
// um crash de processo precisa ser SEMPRE visivel, em qualquer ambiente -- nunca sujeito ao
// nivel/silenciamento do logger operacional geral (`./logger`, deliberadamente quieto em test
// para nao poluir a suite de ~700 testes). Instancia dedicada, sempre no nivel `fatal`,
// escrevendo direto em stderr (fd 2) -- a mesma convencao que o proprio Node ja usa por padrao
// para uma excecao nao tratada sem handler nenhum, que registrar um handler global aqui
// substitui integralmente (Node para de imprimir sozinho assim que existe um listener).
const fatalLogger = pino(
  { level: "fatal", redact: { paths: REDACT_PATHS, censor: "[REDACTED]" } },
  pino.destination(2)
);

export function registerProcessResilienceHandlers(): void {
  process.on("uncaughtException", (error) => {
    fatalLogger.fatal({ err: error }, "uncaughtException -- shutting down");
    process.exit(1);
  });

  process.on("unhandledRejection", (reason) => {
    fatalLogger.fatal({ err: reason }, "unhandledRejection -- shutting down");
    process.exit(1);
  });
}
