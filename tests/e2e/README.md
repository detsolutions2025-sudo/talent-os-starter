# E2E + Estabilização mínima

Bloco operacional (Production Hardening, guarda-chuva ADR-0027) — poucos
cenários, alto valor, nunca cobertura exaustiva. Complementa, não
substitui, a suíte de integração HTTP já existente em `tests/phase1..32`.

## O que "E2E" significa aqui

Entrada HTTP real → middleware (parsing, request ID, CORS/CSRF quando
aplicável) → autenticação/autorização quando aplicável → service/domain
real → PostgreSQL real (schema descartável) → resposta HTTP → estado
persistido verificado diretamente no banco (nunca apenas o status code).

Não é teste de browser — não há UI envolvida em nenhum dos riscos
cobertos por este bloco, e o projeto não tem Playwright/Cypress
instalado. Ver seção "Browser/Playwright" abaixo.

## Cenários cobertos (7 arquivos, 16 testes, ~2m30s no total)

| Arquivo                                | Cenário                                        | O que prova                                                                                                                                                            |
| -------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `health-readiness.test.ts`             | G                                              | `/api/health` e `/api/ready` com Postgres real disponível e indisponível                                                                                               |
| `auth-tenant-rbac.test.ts`             | A + isolamento cross-tenant (gate obrigatório) | Login real (provider fake → cookie real) → requisição autenticada → RBAC real → **credencial de uma Organization nunca lê/altera/executa ação sobre recurso de outra** |
| `recruitment-flow.test.ts`             | B                                              | Vaga → candidatura → mudança real de estágio (`applied`→`screening`→`interview`) → contratação, com trilha de auditoria                                                |
| `public-application-flow.test.ts`      | C                                              | Vaga pública → candidatura pública, sem nenhuma autenticação, DTO público sem vazamento                                                                                |
| `people-lifecycle.test.ts`             | D                                              | Candidatura contratada → Onboarding criado/iniciado/concluído, com RBAC real                                                                                           |
| `offboarding-access-invariant.test.ts` | E                                              | **Invariante crítica**: concluir um Offboarding nunca revoga Membership/AccessGrant automaticamente                                                                    |
| `rate-limiting-http.test.ts`           | F                                              | Candidatura pública repetida → 429 real → header `Retry-After` real → contador persistido no Postgres                                                                  |

## O que NÃO cobre

- Cobertura exaustiva de rotas — isso é papel da suíte de integração
  (`tests/phase1..32`), não deste bloco.
- UI/browser — nenhum risco aqui exige renderização real.
- Fluxos de IA com provider externo real — nunca chamado (ver abaixo).
- Classe "endpoints comuns autenticados" além do que os 7 cenários já
  exercitam incidentalmente.

## Fronteiras externas substituídas (test doubles)

Nenhum backdoor novo foi criado. Ambos os mecanismos abaixo já existem e
já são usados por toda a suíte de integração desde as Fases 1/29:

- **`DevActorProvider`** (`http/actor-provider.ts`): resolve o Actor a
  partir de headers `x-dev-*`. Fail-closed fora de `development`/`test`
  (`http/dev-auth.ts`) — nunca alcançável em produção. A partir do
  header, User/Membership/RBAC/tenant são 100% reais.
- **`SupabaseActorProvider` real + `FakeSupabaseAdminPortE2E`**
  (`tests/e2e/helpers.ts`, mesmo padrão de `tests/phase29/helpers.ts`):
  usado exclusivamente por `auth-tenant-rbac.test.ts`. Apenas a
  fronteira **externa** (o provider Supabase em si — nunca fala com a
  rede) é substituída; verificação de assinatura JWT, resolução de
  AuthIdentity/User/Membership e RBAC continuam reais.

Nenhum fluxo de IA/e-mail real é exercitado — nenhum teste desta bateria
consome API paga ou envia e-mail de verdade.

## Como executar

```
npx vitest run tests/e2e/
```

Requer PostgreSQL real acessível via `SUPABASE_DATABASE_URL` (ou
`TEST_DATABASE_URL`) — mesmo requisito de toda a suíte `*-postgres.test.ts`.
Cada arquivo cria seu próprio schema descartável
(`tests/helpers/postgres-test-db.ts`) e faz teardown apenas do que criou
— nunca `public`, nunca os schemas `test_phase_*` de outras sessões.

`auth-tenant-rbac.test.ts` tem `// @vitest-environment node` no topo —
`jose` (verificação JWT real) exige a Web Crypto nativa do Node,
incompatível com o polyfill do ambiente `jsdom` (default deste projeto).

## Determinismo

Nenhum `sleep` arbitrário, nenhuma dependência de relógio real
incontrolável, nenhum ID fixo, nenhuma ordem entre arquivos assumida.
`rate-limiting-http.test.ts` consolida deliberadamente duas asserções
(429 real e persistência no Postgres) em um único `it()` — a chave de
rate limit ali é por IP, e dois `it()` separados usando o mesmo
`PostgresRateLimitStore`/schema compartilhariam o mesmo contador entre
si (falso-negativo, não um bug de produção).

## Browser/Playwright

**Não necessário.** Nenhum dos 7 riscos que este bloco cobre exige
renderização de UI, interação de mouse/teclado ou comportamento
específico de navegador — todos são inteiramente resolvidos na camada
HTTP/API (autenticação, RBAC, tenant isolation, persistência, rate
limiting). Nenhuma dependência nova foi avaliada como necessária;
Playwright/Cypress não foram instalados.
