// Rate limiter generico, compartilhado -- namespace-scoped, com store de armazenamento
// injetavel (Fase 32, ADR-0027 secao 9).
//
// Originalmente introduzido na Fase 11 (SPEC-014 "Rate Limit de Execucao" / "Test Connection")
// dentro do modulo `ai/`. Extraido para `core/` na Fase 17 (Plano Tecnico, item 36 -- SPEC-020
// v1.1: "rate limiting publico e independente de IA") porque a candidatura publica tambem
// precisa de protecao por escopo (IP, Vaga) e essa protecao nunca deve depender, conceitualmente
// ou na implementacao, de nenhum modulo de IA estar habilitado, disponivel ou sequer existir.
//
// `src/server/ai/rate-limiter.ts` reexporta esta classe (mantendo sua propria configuracao
// `DEFAULT_RATE_LIMITS`), entao nenhum import existente do modulo de IA precisou mudar.
//
// Fase 32 (ADR-0027 secao 9, "Rate Limiting Distribuido"): ate aqui, o contador vivia
// exclusivamente na memoria deste processo (`Map`) -- correto apenas com uma unica instancia do
// processo Node rodando por vez. Esta classe agora delega o armazenamento a um `RateLimitStore`
// injetavel (`core/rate-limit-store.ts`): `InMemoryRateLimitStore` (default -- preserva, sem
// nenhuma mudanca de comportamento, todo teste/call site existente que constroi
// `new RateLimiter(configs)` sem um segundo argumento) ou `PostgresRateLimitStore` (autoritativo
// multi-instancia, injetado explicitamente por `index.ts` em cada `createPostgresXService(pool)`
// -- nunca escolhido implicitamente). A politica (namespace, limite, janela, modo de falha) e a
// chave de negocio permanecem exatamente onde cada service ja as definia; apenas o "onde o
// contador mora" mudou.
import { logger } from "../observability/logger";
import type { RateLimitStore } from "./rate-limit-store";
import { hashRateLimitKey, InMemoryRateLimitStore } from "./rate-limit-store";

// "closed": indisponibilidade do store bloqueia a chamada (usa a mesma resposta 429 de um limite
// realmente excedido) -- para superficies onde nunca deixar sem protecao alguma e mais importante
// que disponibilidade (ADR-0027 s9: "fail-closed para endpoints sensiveis de autenticacao (login,
// bootstrap, convite)", estendido aqui tambem a execucao de IA de custo elevado).
// "open": indisponibilidade do store permite a chamada, com o erro sempre auditado
// (`rate_limit_store_error`) -- para superficies publicas de baixo risco de seguranca onde
// preservar disponibilidade importa mais que a protecao anti-abuso momentaneamente ausente
// (ADR-0027 s9: "fail-open com auditoria para endpoints publicos de baixo risco").
export type RateLimitFailureMode = "open" | "closed";

export type RateLimitConfig = {
  limit: number;
  windowMs: number;
  failureMode: RateLimitFailureMode;
};

export type RateLimitCheckResult = {
  allowed: boolean;
  // Segundos ate a janela atual expirar -- sempre >= 1, usado para o header HTTP `Retry-After`
  // (ver `core/errors.ts`/`app.ts`). Presente tambem quando `allowed` e true (chamador ignora).
  retryAfterSeconds: number;
};

export class RateLimiter<Namespace extends string = string> {
  constructor(
    private readonly configs: Record<Namespace, RateLimitConfig>,
    private readonly store: RateLimitStore = new InMemoryRateLimitStore()
  ) {}

  // Retorna `{allowed: true, ...}` (e registra o hit) quando a chamada e permitida;
  // `{allowed: false, ...}` quando o limite esta atualmente excedido -- nunca lanca por conta
  // propria (o chamador decide o erro exato a lancar, mesmo padrao ja usado por todo call site
  // existente).
  async checkAndRecord(namespace: Namespace, key: string): Promise<RateLimitCheckResult> {
    const config = this.configs[namespace];
    const storageKey = hashRateLimitKey(namespace, key);

    try {
      const { count, resetAt } = await this.store.increment(storageKey, config.windowMs);
      const allowed = count <= config.limit;
      const retryAfterSeconds = secondsUntil(resetAt);

      if (!allowed) {
        // Nunca loga a chave/hash (evita cardinalidade explosiva e qualquer vazamento indireto
        // de identificador) -- apenas o namespace, suficiente para operar/alertar.
        logger.warn({ event: "rate_limit_exceeded", namespace }, "Rate limit exceeded");
      }

      return { allowed, retryAfterSeconds };
    } catch (error) {
      // Nunca falha silenciosamente (RN explicita desta Fase): toda indisponibilidade do store
      // e auditada, com o comportamento resultante decidido pela politica declarada do
      // namespace (`failureMode`), nunca por uma regra unica cega.
      logger.error(
        { event: "rate_limit_store_error", namespace, err: error },
        "Rate limit store error"
      );
      return {
        allowed: config.failureMode === "open",
        retryAfterSeconds: Math.max(1, Math.ceil(config.windowMs / 1000))
      };
    }
  }

  // Exclusivo de testes unitarios contra o `InMemoryRateLimitStore` default -- nunca chamado em
  // producao. No-op silencioso quando o store injetado nao suporta reset (ex.
  // `PostgresRateLimitStore`, onde "resetar" significaria apagar linhas de producao).
  reset(): void {
    this.store.reset?.();
  }
}

function secondsUntil(resetAtEpochMs: number): number {
  return Math.max(1, Math.ceil((resetAtEpochMs - Date.now()) / 1000));
}
