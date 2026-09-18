// Fase 32 (ADR-0027 secao 9 "Rate Limiting"). Abstracao de armazenamento usada por
// `core/rate-limiter.ts`: o `RateLimiter` nunca fala com Postgres/memoria diretamente, apenas
// com esta interface -- troca de backend (o que a ADR-0027 chama de "gatilho explicito de
// migracao para producao multi-instancia") nunca exige tocar a logica de politica/namespace, so a
// escolha de qual `RateLimitStore` e injetado (ver `index.ts`).
import { createHash } from "node:crypto";
import type pg from "pg";

export type RateLimitIncrementResult = {
  count: number;
  resetAt: number; // epoch ms em que a janela atual expira
};

export interface RateLimitStore {
  // Incrementa o contador da janela atual para `key` (ja com o namespace embutido -- ver
  // `hashRateLimitKey`), OU inicia uma nova janela de `windowMs` quando a anterior ja expirou.
  // Deve ser atomico sob concorrencia real (multiplas instancias incrementando a MESMA key ao
  // mesmo tempo nunca podem produzir uma contagem menor que o numero real de chamadas).
  increment(key: string, windowMs: number): Promise<RateLimitIncrementResult>;

  // Exclusivo de testes unitarios (ver `InMemoryRateLimitStore.reset()`) -- nunca chamado em
  // producao. Opcional: `PostgresRateLimitStore` nao implementa (nao existe "resetar" seguro em
  // uma tabela compartilhada de producao).
  reset?(): void;
}

// SHA-256 do namespace+chave logica (IP, hash de token, organizationId:userId, etc.) -- nunca o
// valor bruto persistido em nenhum store (RN de minimizacao de exposicao, ver
// docs/operacao/rate-limiting.md secao "Privacidade"). Determinístico: a mesma chave logica
// sempre produz o mesmo hash, preservando a contagem correta entre chamadas.
export function hashRateLimitKey(namespace: string, rawKey: string): string {
  return createHash("sha256").update(`${namespace}:${rawKey}`).digest("hex");
}

// Store padrao (nunca autoritativo em producao multi-instancia -- ver ADR-0027 s9 e o
// comentario de topo de `core/rate-limiter.ts`): fixed-window em memoria do PROPRIO processo.
// Permitido apenas como: (a) default de teste/desenvolvimento single-process, (b) fallback local
// nao autoritativo quando explicitamente documentado. Nunca instanciado por `index.ts` em
// producao/staging -- ver `PostgresRateLimitStore` abaixo.
export class InMemoryRateLimitStore implements RateLimitStore {
  private readonly counters = new Map<string, { count: number; resetAt: number }>();

  async increment(key: string, windowMs: number): Promise<RateLimitIncrementResult> {
    const now = Date.now();
    const existing = this.counters.get(key);
    if (!existing || existing.resetAt <= now) {
      const resetAt = now + windowMs;
      this.counters.set(key, { count: 1, resetAt });
      return { count: 1, resetAt };
    }
    existing.count += 1;
    return { count: existing.count, resetAt: existing.resetAt };
  }

  // Usado exclusivamente por testes unitarios (`RateLimiter.reset()`) -- nunca chamado em
  // producao.
  reset(): void {
    this.counters.clear();
  }
}

// Limpeza fisica de contadores expirados: disparada probabilisticamente (nunca em toda chamada,
// para nao pagar o custo de um DELETE extra por requisicao) e sempre best-effort -- uma falha
// aqui nunca derruba nem atrasa a checagem de rate limit que a originou (capturada e descartada
// silenciosamente, o proprio incremento ja teve sucesso antes desta chamada).
const CLEANUP_PROBABILITY = 0.01;
const CLEANUP_GRACE_MS = 60 * 60 * 1000; // mantem 1h de contadores expirados para depuracao

// Store autoritativo de producao (ADR-0027 s9, opcao "E -- Postgres"): reaproveita o MESMO pool
// de conexao ja usado pelo resto da aplicacao -- nenhum servico/vendor novo. Consistencia forte
// entre instancias: o UPSERT abaixo e uma unica instrucao atomica, serializada pelo proprio lock
// de linha do Postgres na chave (`key` e PRIMARY KEY) -- nunca uma leitura seguida de escrita
// separada, que seria vulneravel a race entre duas instancias incrementando a mesma key ao
// mesmo tempo.
export class PostgresRateLimitStore implements RateLimitStore {
  constructor(private readonly pool: pg.Pool) {}

  async increment(key: string, windowMs: number): Promise<RateLimitIncrementResult> {
    const result = await this.pool.query<{ count: number; expires_at: Date }>(
      `INSERT INTO rate_limit_counters (key, window_start, count, expires_at)
       VALUES ($1, NOW(), 1, NOW() + ($2 * INTERVAL '1 millisecond'))
       ON CONFLICT (key) DO UPDATE SET
         count = CASE
           WHEN rate_limit_counters.expires_at <= NOW() THEN 1
           ELSE rate_limit_counters.count + 1
         END,
         window_start = CASE
           WHEN rate_limit_counters.expires_at <= NOW() THEN NOW()
           ELSE rate_limit_counters.window_start
         END,
         expires_at = CASE
           WHEN rate_limit_counters.expires_at <= NOW() THEN NOW() + ($2 * INTERVAL '1 millisecond')
           ELSE rate_limit_counters.expires_at
         END
       RETURNING count, expires_at`,
      [key, windowMs]
    );
    const row = result.rows[0];

    if (Math.random() < CLEANUP_PROBABILITY) {
      // Fire-and-forget: nunca aguardado, nunca propaga falha ao chamador (ver comentario acima).
      void this.cleanupExpired().catch(() => {});
    }

    return { count: Number(row.count), resetAt: row.expires_at.getTime() };
  }

  private async cleanupExpired(): Promise<void> {
    await this.pool.query(
      `DELETE FROM rate_limit_counters WHERE expires_at < NOW() - ($1 * INTERVAL '1 millisecond')`,
      [CLEANUP_GRACE_MS]
    );
  }
}
