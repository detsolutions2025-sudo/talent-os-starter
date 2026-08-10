// In-memory, fixed-window rate limiter -- generic, shared component.
//
// Originalmente introduzido na Fase 11 (SPEC-014 "Rate Limit de Execucao" / "Test
// Connection") dentro do modulo `ai/`. Extraido para `core/` na Fase 17 (Plano Tecnico,
// item 36 -- SPEC-020 v1.1: "rate limiting publico e independente de IA") porque a
// candidatura publica tambem precisa de protecao por escopo (IP, Vaga) e essa protecao nunca
// deve depender, conceitualmente ou na implementacao, de nenhum modulo de IA estar habilitado,
// disponivel ou sequer existir.
//
// `src/server/ai/rate-limiter.ts` reexporta esta classe (mantendo sua propria configuracao
// `DEFAULT_RATE_LIMITS`), entao nenhum import existente do modulo de IA precisou mudar.
//
// Assim como na Fase 11, isto e permitido apenas porque o runtime atual e um unico processo
// Node (sem clustering, sem multiplas instancias de API). Nao e adequado para producao com
// mais de um processo/instancia compartilhando os mesmos limites: cada instancia aplicaria sua
// propria janela independente. Um armazenamento compartilhado (por exemplo, Redis) e uma
// dependencia externa fora de escopo aqui.
export type RateLimitConfig = {
  limit: number;
  windowMs: number;
};

export class RateLimiter<Namespace extends string = string> {
  private readonly hits = new Map<string, number[]>();

  constructor(private readonly configs: Record<Namespace, RateLimitConfig>) {}

  // Retorna true (e registra o hit) quando a chamada e permitida; retorna false (sem
  // registrar) quando o limite esta atualmente excedido.
  checkAndRecord(namespace: Namespace, key: string): boolean {
    const config = this.configs[namespace];
    const fullKey = `${namespace}:${key}`;
    const now = Date.now();
    const windowStart = now - config.windowMs;
    const recent = (this.hits.get(fullKey) ?? []).filter((timestamp) => timestamp > windowStart);

    if (recent.length >= config.limit) {
      this.hits.set(fullKey, recent);
      return false;
    }

    recent.push(now);
    this.hits.set(fullKey, recent);
    return true;
  }

  reset() {
    this.hits.clear();
  }
}
