# Rate Limiting Distribuído

Bloco operacional (Production Hardening, guarda-chuva ADR-0027, seção 9)
— não é feature de produto, não cria nova Fase, não substitui proteção
de borda (CDN/WAF/provedor). Documenta o que existe hoje e como usá-lo;
não afirma cobertura além do que está implementado e testado.

## 1. Arquitetura escolhida

A ADR-0027 (seção 9) já havia decidido, ao comparar alternativas
(in-memory, Redis, provedor gerenciado, edge/WAF, Postgres): manter
memória local **enquanto** o deploy for um único processo, e migrar para
**Postgres** (opção "E" da tabela) no momento em que a topologia exigir
mais de uma instância simultânea — "reaproveita infraestrutura já paga,
sem novo vendor", com Upstash citado apenas como alternativa caso a
latência do Postgres se mostre insuficiente.

Esta rodada implementa exatamente essa transição: **nenhuma dependência
nova foi adicionada** (`pg` já é dependência de produção do projeto,
usada por tudo). O store distribuído reaproveita o **mesmo** pool de
conexão Postgres/Supabase que já hospeda todos os dados de negócio —
não há Redis, Upstash, Valkey nem qualquer serviço novo configurado ou
inventado.

## 2. Componentes

- `src/server/core/rate-limit-store.ts` — abstração `RateLimitStore`
  (`increment(key, windowMs)`), com duas implementações:
  - `InMemoryRateLimitStore` — fixed-window em `Map`, default de
    dev/test; **nunca** autoritativo em produção multi-instância.
  - `PostgresRateLimitStore` — fixed-window persistido na tabela
    `rate_limit_counters` (migration `0034_phase_32_rate_limit_counters.sql`),
    via `INSERT ... ON CONFLICT (key) DO UPDATE` atômico — o próprio
    lock de linha do Postgres serializa incrementos concorrentes vindos
    de instâncias/processos diferentes.
- `src/server/core/rate-limiter.ts` — `RateLimiter<Namespace>`, a mesma
  classe genérica já usada desde a Fase 11 (IA) e Fase 17 (candidatura
  pública), agora com o store injetável. `checkAndRecord()` é
  assíncrono e retorna `{allowed, retryAfterSeconds}`.
- Cada módulo de domínio continua sendo o dono da sua própria política
  (namespaces, limites, janela, chave de negócio) — o rate limiter
  nunca virou um middleware HTTP genérico central. Isso preserva o
  padrão arquitetural já estabelecido no projeto desde a Fase 11.

### Trade-off: janela fixa, não deslizante

O algoritmo anterior (100% em memória) era _sliding window log_
(lista de timestamps, filtrada a cada chamada). A versão distribuída
usa _fixed window_ (contador + expiração), mais barata em Postgres (um
único `UPDATE` por chamada, nunca uma lista crescente) e o mesmo
modelo amplamente usado em produção (ex. `express-rate-limit`). O
preço é ser um pouco mais permissiva exatamente na borda entre duas
janelas consecutivas — aceitável para uma defesa anti-abuso, nunca a
única camada. `InMemoryRateLimitStore` e `PostgresRateLimitStore`
implementam o **mesmo** algoritmo, para que o comportamento observado
em teste corresponda ao de produção.

## 3. Políticas por classe de risco

| Classe                                  | Namespace(s)                                             | Limite  | Janela | Chave                                    | Fail mode |
| --------------------------------------- | -------------------------------------------------------- | ------- | ------ | ---------------------------------------- | --------- |
| A. Autenticação/login                   | `auth.sessionBridge`                                     | 20      | 60s    | IP                                       | closed    |
| A. Autenticação/login                   | `auth.refresh`                                           | 30      | 60s    | IP                                       | closed    |
| A. Autenticação/login                   | `auth.invitationCreate`                                  | 20      | 60s    | organizationId                           | closed    |
| A. Autenticação/login                   | `auth.invitationAccept`                                  | 10      | 60s    | invitationId                             | closed    |
| A. Autenticação/login                   | `auth.bootstrap`                                         | 5       | 60s    | actor.userId                             | closed    |
| A. Autenticação/login                   | `auth.sessionRevoke`                                     | 10      | 60s    | targetUserId                             | closed    |
| B. Público de escrita                   | `publicApplications.submitByIp`                          | 5       | 60s    | IP                                       | open      |
| B. Público de escrita                   | `publicApplications.submitByJobOpening`                  | 60      | 60s    | jobOpeningId                             | open      |
| B. Público de escrita/leitura sob token | `preInterviews.publicByIp`                               | 60      | 60s    | IP                                       | open      |
| B. idem                                 | `preInterviews.publicByTokenHash`                        | 30      | 60s    | hash(token)                              | open      |
| B. idem                                 | `behavioralAssessments.publicByIp` / `publicByTokenHash` | 60 / 30 | 60s    | IP / hash(token)                         | open      |
| B. idem                                 | `proposals.publicByIp` / `publicByTokenHash`             | 60 / 30 | 60s    | IP / hash(token)                         | open      |
| C. Público de leitura                   | `jobOpenings.publicReadByIp`                             | 60      | 60s    | IP                                       | open      |
| C. Público de leitura                   | `jobOpenings.publicReadBySlug`                           | 120     | 60s    | slug                                     | open      |
| D. Autenticado de custo elevado (IA)    | `ai.executionOrgFeature`                                 | 30      | 60s    | organizationId+featureKey                | closed    |
| D. idem                                 | `ai.executionOrgFeatureProviderModel`                    | 20      | 60s    | organizationId+featureKey+provider+model | closed    |
| D. idem                                 | `ai.testConnection`                                      | 5       | 60s    | organizationId+provider+actor            | closed    |

Números preservados exatamente como já existiam antes desta Fase
(todos já tinham sido decididos e testados em Fases anteriores) — a
única mudança de política nesta rodada foi adicionar `failureMode`
explícito e os dois namespaces novos de `auth` (`sessionBridge`/
`refresh`, únicas rotas públicas de `auth` sem rate limit até aqui).

**Estes limites não são proteção universal contra DDoS.** Rate limiting
de aplicação nunca substitui proteção de CDN/WAF/provedor de borda —
complementa, não substitui.

### Classe E (endpoints comuns autenticados) — gap aceito

O roteador (`src/server/http/routes.ts`) expõe ~280 rotas. Cobrir cada
uma individualmente está fora do escopo desta rodada (risco de
regressão desproporcional, e o próprio guia desta Fase pede para não
aplicar um limiter global agressivo que prejudique navegação normal do
produto). As rotas autenticadas comuns (CRUD interno de Organization,
Job Opening, Job Profile etc.) permanecem sem rate limit dedicado —
gap registrado, não bloqueante, candidato a trabalho futuro caso um
padrão de abuso real seja observado.

## 4. Estratégia de chaves

- **Antes da autenticação** (rotas públicas): IP confiável (via `trust
proxy`, ver seção 5) + escopo do recurso (job opening, token de
  acesso via hash — nunca o token bruto).
- **Depois da autenticação**: identificador do actor (`userId`) e/ou
  `organizationId`, nunca role/organizationId informados pelo cliente
  no body.
- **Nunca usado como chave**: `X-Forwarded-For` bruto sem trust proxy,
  e-mail como chave global de bloqueio (`auth.invitationAccept` usa
  `invitationId`, não e-mail — um convite específico, não uma conta
  arbitrária, mitigando lockout de terceiros).

Toda chave lógica é hasheada (SHA-256, `namespace:chave`) antes de
tocar qualquer store — nunca persistida em claro (seção 8).

## 5. Trust proxy / IP

Revisado, não recriado: a Fase 31 (Segurança de Borda) já configura
`trust proxy` explicitamente por variável de ambiente
(`TRUST_PROXY_CONFIG`, número de hops ou lista de IPs/CIDRs — nunca
`true` genérico). Este bloco reutiliza `request.ip`, já resolvido
corretamente pelo Express a partir dessa configuração, exatamente como
todo rate limiter público já fazia desde a Fase 17. Nenhum parser de
`X-Forwarded-For` próprio foi criado.

## 6. HTTP 429 e `Retry-After`

Todo bloqueio por rate limit responde `429 Too Many Requests` com o
corpo padrão de erro da API (`{error: {code, message}}` — nunca
detalhe de contador/store/chave interna) e, agora, o header
`Retry-After` (segundos, calculado a partir da janela real do store —
nunca um valor fixo arbitrário). Ver `core/errors.ts`
(`AppError.retryAfterSeconds`) e `app.ts` (error handler global).

### Clock skew entre instâncias

A decisão crítica de janela (criar vs. incrementar vs. reiniciar, e se
a chamada é permitida) é feita **inteiramente dentro do Postgres**, via
`NOW()` do próprio servidor (`PostgresRateLimitStore.increment()`) — o
processo Node nunca compara seu próprio relógio contra a janela para
decidir bloquear/permitir; `allowed` depende exclusivamente do `count`
que o Postgres devolve na mesma instrução atômica que fez o
incremento. Isso elimina, por construção, qualquer risco de
inconsistência entre instâncias por divergência de relógio local.

O único uso de `Date.now()` do processo Node é em `secondsUntil()`
(`core/rate-limiter.ts`), que converte o `resetAt` absoluto (retornado
pelo store) num `Retry-After` relativo em segundos — puramente de
exibição do header HTTP, nunca de decisão. `Math.max(1, ...)` garante
que esse valor nunca é negativo ou zero mesmo que o relógio local
esteja adiantado em relação ao Postgres. Provado por teste dedicado
(`tests/phase32/rate-limiter-clock-skew.test.ts`).

## 7. Fail-open / fail-closed

Decisão explícita por namespace (`RateLimitConfig.failureMode`),
nunca uma regra única cega:

- **`closed`** (autenticação/sessão + IA de custo elevado): quando o
  store está indisponível, a chamada é bloqueada com o mesmo 429 de um
  limite excedido. Nunca deixar login/bootstrap/convite/execução de IA
  sem proteção alguma.
- **`open`** (endpoints públicos de candidatura/pré-entrevista/
  avaliação/proposta/leitura de vaga): quando o store está
  indisponível, a chamada é permitida — preservar disponibilidade do
  fluxo do candidato importa mais que a proteção anti-abuso
  momentaneamente ausente.

Em ambos os casos, toda indisponibilidade do store é auditada via
logger estruturado (`event: "rate_limit_store_error"`, `namespace`) —
nunca falha silenciosamente.

Como o store distribuído reaproveita o **mesmo** Postgres que hospeda
todos os dados de negócio, "store de rate limit indisponível" e "banco
de dados indisponível" tendem a ser o mesmo evento na prática — mas a
política continua explícita por namespace, e uma falha pontual da
query de rate limit (contenção, timeout) sem afetar o resto da
transação de negócio continua coberta pelo mesmo mecanismo.

## 8. Privacidade

- A chave persistida nunca é o valor bruto — sempre
  `SHA-256(namespace:chave)` (`hashRateLimitKey`,
  `core/rate-limit-store.ts`). Nenhum IP, hash de token, e-mail ou
  `organizationId`/`userId` fica legível diretamente na tabela por
  quem tiver acesso de leitura ao banco.
- Nenhum payload de requisição é armazenado.
- **TTL**: cada linha tem `expires_at`; `PostgresRateLimitStore`
  dispara, probabilisticamente (1%) a cada `increment()`, uma limpeza
  best-effort de linhas expiradas há mais de 1h — nunca bloqueia nem
  falha a checagem que a originou. Contadores expirados não permanecem
  indefinidamente.

## 9. Observabilidade

Eventos estruturados via o logger já existente (`pino`,
`src/server/observability/logger.ts`), nunca um mecanismo paralelo:

- `rate_limit_exceeded` (nível `warn`): namespace apenas — nunca a
  chave/hash (evita cardinalidade explosiva e qualquer vazamento
  indireto de identificador).
- `rate_limit_store_error` (nível `error`): namespace + erro — emitido
  sempre que o store falha, independente do `failureMode` resultante.

Nenhum segredo, token, cookie ou senha passa perto destes eventos — a
redação já configurada no logger (`REDACT_PATHS`) continua se
aplicando a qualquer log operacional deste bloco.

## 10. Configuração

Nenhuma variável de ambiente nova foi introduzida. O store distribuído
reaproveita `SUPABASE_DATABASE_URL`, já obrigatória em
`APP_ENV=production`/`staging` pelo gate central de fail-fast
(`assertProductionConfig`, `src/server/config-validation.ts`) — a
aplicação já não sobe em produção/staging sem Postgres configurado, o
que já garante, por construção, que o store distribuído está
disponível sempre que a aplicação está no ar.

`src/server/index.ts` constrói uma única instância de
`PostgresRateLimitStore(pool)` e a injeta explicitamente em cada
service que expõe um namespace de rate limit. Testes e qualquer
chamada que construa um service diretamente (sem passar por
`index.ts`) continuam usando o default in-memory, preservando
isolamento entre casos de teste do mesmo arquivo.

## 11. Comportamento multi-instância

Provado por teste de integração real (`tests/phase32/rate-limit-store-
postgres.test.ts`, caso "multi-instância"): dois objetos `RateLimiter`
completamente independentes (sem nenhuma referência compartilhada em
memória — o mesmo que dois processos Node distintos teriam), cada um
com seu próprio `PostgresRateLimitStore`, mas apontando para o mesmo
Postgres, respeitam o **mesmo** limite combinado — a 6ª chamada em
qualquer uma das duas "instâncias" é bloqueada quando o limite
combinado é 5, provando que o contador é um só, nunca um por
instância/processo.

## 12. Testes

- `tests/phase11/ai-rate-limiter.test.ts` — unitário puro (default
  in-memory), migrado para a API assíncrona.
- `tests/phase32/rate-limiter-failure-mode.test.ts` — unitário puro,
  fail-open/fail-closed com um store fake que lança, e prova de que a
  falha é sempre auditada sem vazar a chave.
- `tests/phase32/rate-limit-store-postgres.test.ts` — **integração
  real** contra Postgres (schema descartável, mesmo mecanismo de
  `tests/helpers/postgres-test-db.ts` usado por toda a suite):
  increment atômico, isolamento de chaves, expiração de janela,
  hashing (nunca valor bruto na tabela), concorrência real via
  `Promise.all` (prova de que incrementos simultâneos na mesma chave
  nunca perdem contagem), e o cenário multi-instância descrito acima.
- Regressão: toda a suite de rate limit já existente antes desta Fase
  (`tests/phase17` candidatura pública, `tests/phase18` pré-entrevista,
  `tests/phase11` AI Gateway) continua passando com a nova API
  assíncrona — nenhum desses testes precisou mudar sua asserção de
  comportamento, apenas a forma de invocar (`await`).

## 13. Limitações e responsabilidade complementar

- Rate limiting de aplicação **não substitui** proteção de CDN/WAF do
  provedor de hosting — complementa.
- Fixed window (não sliding) é ligeiramente mais permissiva na borda
  entre janelas — trade-off deliberado, documentado na seção 2.
- A classe E (endpoints comuns autenticados) não tem rate limit
  dedicado nesta rodada (seção 3).
- `PostgresRateLimitStore` acopla a proteção anti-abuso à
  disponibilidade do mesmo Postgres de negócio — aceito, porque é
  exatamente essa a dependência que a ADR-0027 já assumia como
  aceitável para o estágio atual do produto (zero dependência nova,
  reaproveita infraestrutura já paga).
