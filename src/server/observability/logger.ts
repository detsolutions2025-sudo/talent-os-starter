// FAST TRACK CI/CD + Observabilidade (ADR-0027 secao 10/11). Logger estruturado minimo (JSON,
// nivel, timestamp) via `pino` -- biblioteca leve e madura, unica nova dependencia desta frente
// (justificativa: e a mesma citada como exemplo pela propria ADR-0027 secao 10; evita reinventar
// serializacao/nivel/redacao). Nunca usado para audit log de negocio (`addAuditEvent`, Fase 1) --
// log operacional e auditoria de negocio permanecem completamente separados (ADR-0027 secao 11).
import pino from "pino";

// ADR-0027 secao 11 (redacao explicita obrigatoria): qualquer campo que possa carregar
// Authorization, cookie, JWT/refresh token, password, service-role key ou connection string.
// Path-based (nao scanning de conteudo arbitrario) -- a garantia real vem de nunca passar esses
// campos a um objeto de log em primeiro lugar, verificado por
// `tests/observability/redaction-source.test.ts`, mesma disciplina ja usada por audit()/
// auditWith() na Fase 29 (`audit-security-source.test.ts`).
export const REDACT_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  'res.headers["set-cookie"]',
  "*.password",
  "*.token",
  "*.accessToken",
  "*.refreshToken",
  "*.access_token",
  "*.refresh_token",
  "*.authorization",
  "*.cookie",
  "*.serviceRoleKey",
  "*.service_role",
  "*.connectionString",
  "*.SUPABASE_DATABASE_URL",
  "*.SUPABASE_SERVICE_ROLE_KEY",
  "*.DATABASE_URL"
];

// Nivel por ambiente: `test` fica silencioso por padrao (evita ruido no output do Vitest sem
// exigir nenhuma configuracao extra por arquivo de teste) -- checa tanto `NODE_ENV` (definido
// automaticamente pelo proprio Vitest) quanto `APP_ENV` (convencao deste projeto, que alguns
// arquivos de teste tambem definem localmente como "test" para gates de configuracao). `LOG_LEVEL`
// sempre pode sobrescrever explicitamente, inclusive em test, quando um teste precisar inspecionar
// saida real.
function defaultLevel(): string {
  if (process.env.LOG_LEVEL) return process.env.LOG_LEVEL;
  const isTest = process.env.NODE_ENV === "test" || process.env.APP_ENV === "test";
  return isTest ? "silent" : "info";
}

export const logger = pino({
  level: defaultLevel(),
  redact: {
    paths: REDACT_PATHS,
    censor: "[REDACTED]"
  },
  timestamp: pino.stdTimeFunctions.isoTime
});
