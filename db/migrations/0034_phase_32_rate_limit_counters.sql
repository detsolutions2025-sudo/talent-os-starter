-- Fase 32 (ADR-0027 secao 9 "Rate Limiting"). Store distribuido para o RateLimiter generico
-- (src/server/core/rate-limiter.ts): contador de janela fixa, compartilhado entre TODAS as
-- instancias do processo Node via esta tabela -- reaproveita o MESMO Postgres ja usado por todo
-- o resto da aplicacao. Nenhum vendor/servico novo: a propria ADR-0027 (secao 9, tabela de
-- alternativas) ja escolhe a opcao "E -- Postgres" como a transicao padrao de baixo custo no
-- momento em que a decisao de deploy exigir mais de uma instancia simultanea ("reaproveita
-- infraestrutura ja paga, sem novo vendor"), com Upstash citado apenas como alternativa se a
-- latencia do Postgres se mostrar insuficiente -- nao avaliado como necessario aqui.
--
-- `key` e SEMPRE um hash SHA-256 hex de `${namespace}:${chaveLogica}` (nunca o IP, o hash de
-- token, o e-mail ou qualquer identificador bruto em claro) -- minimizacao de exposicao
-- (core/rate-limit-store.ts, funcao `hashRateLimitKey`): nenhuma PII diretamente legivel nesta
-- tabela por quem tiver acesso de leitura ao banco.
--
-- Janela FIXA (nao deslizante): `window_start`/`expires_at` marcam o inicio/fim da janela atual
-- de um dado contador. O `INSERT ... ON CONFLICT (key) DO UPDATE` usado por
-- `PostgresRateLimitStore.increment()` e uma unica instrucao atomica que incrementa `count` OU
-- reinicia a janela quando `expires_at` ja passou -- nunca uma leitura seguida de uma escrita
-- separada. O proprio lock de linha do Postgres (unicidade de `key`) serializa incrementos
-- concorrentes vindos de instancias/processos diferentes -- a mesma garantia de exatidao que a
-- versao anterior em memoria So tinha DENTRO de um unico processo, agora estendida a N processos
-- pelo banco compartilhado.
--
-- Trade-off deliberado frente ao algoritmo anterior (sliding window log, em
-- `core/rate-limiter.ts` pre-Fase 32): janela fixa e mais barata (um UPDATE por chamada, nunca
-- uma lista de timestamps crescente) e e o mesmo modelo amplamente usado em producao (ex.
-- `express-rate-limit`); o preco e ser um pouco mais permissiva exatamente na borda entre duas
-- janelas consecutivas. Aceitavel para uma defesa anti-abuso (nunca a unica camada -- ver
-- `docs/operacao/rate-limiting.md`), e identico entre `InMemoryRateLimitStore` (dev/test) e
-- `PostgresRateLimitStore` (producao) -- os dois implementam o MESMO algoritmo, apenas com
-- armazenamento diferente, para que o comportamento observado em teste corresponda ao de
-- producao.
CREATE TABLE rate_limit_counters (
  key TEXT PRIMARY KEY,
  window_start TIMESTAMPTZ NOT NULL,
  count INTEGER NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);

-- Usado exclusivamente pela limpeza best-effort de contadores expirados
-- (`PostgresRateLimitStore`, disparada probabilisticamente a cada `increment()`, nunca bloqueia
-- nem falha a checagem de rate limit em si) -- garante que um contador expirado nao permaneca
-- indefinidamente na tabela (TTL logico ja imposto por `expires_at`; este indice so torna a
-- limpeza fisica barata).
CREATE INDEX idx_rate_limit_counters_expires_at ON rate_limit_counters (expires_at);

COMMENT ON TABLE rate_limit_counters IS 'Fase 32 (ADR-0027 s9): contador de rate limit de janela fixa, store distribuido compartilhado entre instancias. key = SHA-256(namespace:chave), nunca o valor bruto.';
