# ADR 0027 - Production Hardening / Prontidao Operacional

## Status

Aceita.

## Contexto

A Fase 29 (ADR-0026; SPEC-028 v1.0) fechou o unico bloqueador P0 absoluto
identificado pela auditoria de prontidao pos-Fase 28 (gate destrutivo de
MVP/producao): a ausencia de autenticacao real. Essa mesma auditoria, e a
propria ADR-0026 em sua secao "Impacto Futuro", ja citavam nominalmente uma
segunda frente, deliberadamente deixada fora do escopo de SPEC-028 (secao 2,
"Fora do Escopo": *"Production Hardening geral (CI/CD, cabecalhos HTTP
genericos, CORS completo, observabilidade, backup/restore) -- frente
separada, fora do escopo desta SPEC"*) e do roadmap (nota de saneamento da
Fase 29: *"Production Hardening [...] continua candidato natural a uma fase
posterior, nao formalizada por este saneamento"*).

Com a Fase 29 implementada, testada e com sua migration aplicada em DEV
(commit `1611d60`), o produto agora tem login real, sessao real e usuarios
reais possiveis a qualquer momento -- o que muda o perfil de risco: superficie
de ataque que antes so existia em teoria (`dev-auth.ts`, restrito a
`development`/`test`) agora e alcancavel por qualquer pessoa com uma conta
real, caso o sistema seja exposto. Esta ADR decide a arquitetura de
prontidao operacional necessaria antes de um release candidate real,
verificada por inspecao fisica direta do repositorio (nao apenas por
inferencia documental):

- **CI/CD**: `.github/` nao existe. Nenhum pipeline automatizado roda
  `tsc`/`lint`/`build`/testes/`npm audit` hoje -- tudo depende de execucao
  manual disciplinada em cada tarefa.
- **Security headers**: nenhuma referencia a CSP/HSTS/X-Frame-Options/
  `helmet` em `src/server/app.ts` ou `index.ts`.
- **CORS**: nenhuma configuracao de CORS existe.
- **Observabilidade**: nenhuma biblioteca de logging estruturado, metricas,
  tracing ou error monitoring (`pino`/`winston`/`sentry`/`opentelemetry`) no
  `package.json`. O error handler global (`app.ts`, ultimo middleware) capta
  qualquer excecao nao tratada e responde 500 generico, mas **nunca loga o
  erro em nenhum lugar** -- uma falha inesperada em producao hoje seria
  invisivel.
- **Rate limiting**: `core/rate-limiter.ts` e in-memory, single-process; o
  proprio comentario do arquivo ja declara: *"Nao e adequado para producao
  com mais de um processo/instancia [...] Um armazenamento compartilhado
  (Redis) e uma dependencia externa fora de escopo aqui."*
- **Backup/restore**: nenhum script, runbook ou teste de restore no
  repositorio. `schema_migrations` (`src/server/migrations.ts`) tem apenas
  `id`/`name`/`applied_at` -- **sem checksum** do conteudo aplicado, e sem
  advisory lock contra duas execucoes simultaneas do script de migracao.
- **Resiliencia de processo**: nenhum `process.on("uncaughtException"
  /"unhandledRejection")`, nenhum handler de `SIGTERM`/graceful shutdown em
  `index.ts`. Existe apenas um handler pontual (`postgres.ts`,
  `pool.on("error", ...)`) que evita crash por erro de conexao idle do
  Postgres -- via `console.error` simples, nao estruturado.
- **Testes em CI**: os testes `*-postgres.test.ts` usam `TEST_DATABASE_URL`
  quando definida, senao caem no mesmo `SUPABASE_DATABASE_URL` de DEV
  compartilhado (`tests/helpers/postgres-test-db.ts`) -- confirmado que isso
  ja deixou 69 schemas `test_phase_*` orfaos acumulados nesse banco.
- **Staging**: nao existe fisicamente um ambiente `production`-like real;
  `dev-auth.ts` (secao 22, SPEC-028) nunca foi exercitado contra um Supabase
  Auth de projeto real fora de `development`/`test` (o proprio codigo de
  `jwt.ts` registra: verificacao de `email_verified` "a ser confirmado contra
  um projeto Supabase real na primeira integracao ao vivo, nao exercitada
  nesta tarefa").

`authorize()` (`core/authorization.ts`), `CoreService`, `Membership`
(SPEC-003) e `AccessGrant` (SPEC-027) permanecem, hoje, exatamente como
estavam ao final da Fase 28/29 -- maduros e nao tocados por esta auditoria.
Nenhuma decisao desta ADR pode reabri-los.

## Objetivo

Decidir a arquitetura de prontidao operacional do produto para um primeiro
release candidate/piloto de producao, sem implementar codigo, sem criar
migration, sem criar a SPEC/Fase futura ainda.

## Definicao do Problema Arquitetural

**Pergunta central:** quais garantias operacionais minimas o sistema precisa
possuir antes de ser considerado apto a um release candidate/piloto de
producao, e quais decisoes arquiteturais sustentam essas garantias?

Separado em sete frentes, nunca misturadas com funcionalidade nova de RH:

- **A. Seguranca de borda** -- security headers, CORS, CSRF/cookies, TLS,
  trusted proxy.
- **B. Entrega/deploy** -- CI/CD, estrategia de deploy, migrations em
  producao, environments, branch protection, release process.
- **C. Observabilidade** -- logs, metricas, tracing, error monitoring,
  health/readiness.
- **D. Disponibilidade** -- rate limiting, resiliencia de banco/processo/IA,
  graceful shutdown, performance minima.
- **E. Recovery** -- backup, restore, RPO/RTO, disaster recovery.
- **F. Controle de abuso** -- rate limiting anti-abuso, payload limits
  (ja existente), protecao contra IP forjado.
- **G. Operacao** -- secrets, config validation, dependency security,
  incident response minimo, privacidade/compliance operacional, custos.

## 1. Alternativas Arquiteturais Globais

| # | Abordagem | Segurança | Custo | Complexidade | Vendor lock-in | Capacidade de operar | Escala | Tempo para RC |
|---|---|---|---|---|---|---|---|---|
| A | Hardening minimo in-app + servicos gerenciados (GitHub Actions, Supabase backup gerenciado, Sentry-equivalente gerenciado, `helmet`/`cors`) | Alta para o estagio atual | Baixo | Baixa | Baixo (servicos trocaveis) | Alta (equipe pequena consegue operar) | Suficiente para piloto | Curto |
| B | Infraestrutura propria mais completa (Redis/observabilidade/CI self-hosted) | Alta, mas exige operacao propria constante | Alto | Alta | Baixo | Baixa sem equipe de infra dedicada | Alta, desnecessaria hoje | Longo |
| C | Edge/platform-centric (mover deploy para edge/CDN com WAF/rate-limit nativos) | Alta na borda | Medio-Alto (reescrita) | Alta (exige redesenhar deploy) | Alto | Media | Alta | Longo (nao e so hardening, e re-arquitetura) |
| D | Variante de A: hosting Node gerenciado tradicional + servicos gerenciados pontuais, decisao de hosting registrada separadamente | Alta | Baixo-Medio | Baixa-Media | Baixo | Alta | Suficiente para piloto | Curto |

**Direcao escolhida: A, refinada por D.** Justificativa: o produto tem hoje
zero linhas de dado de negocio em qualquer ambiente (confirmado fisicamente
na Fase 29 e nas verificacoes desta investigacao); B e desproporcional
("Constituicao" -- codigo item 6: "Alteracoes devem ser pequenas e faceis de
revisar"; nenhuma norma exige escala que nao existe). C exigiria redesenhar
a propria estrategia de deploy (hoje um processo Node/Express + build Vite
separado) -- isso e re-arquitetura, nao hardening, e este documento nao tem
mandato para isso (secao 6 desta tarefa: "nao escolher plataforma
especifica sem necessidade"). A mesma logica que justificou Supabase Auth na
ADR-0026 ("capacidade nativa e gratuita [...] baixo custo tecnico") se aplica
aqui: preferir servicos gerenciados maduros a reinventar operacao propria.

## 2. Decisao sobre Fatiamento (gate critico)

**Opcao escolhida: B -- esta ADR define o guarda-chuva arquitetural e
recomenda multiplas SPECs/fases subsequentes, nunca uma unica SPEC/Fase
monolitica.**

As frentes tem ritmos de decisao, vendors e times tecnicos incompativeis
entre si: CI/CD e essencialmente configuracao sem codigo de dominio;
observabilidade exige escolha de vendor externo; backup/restore depende do
plano Supabase efetivamente contratado (fora do controle do codigo); rate
limiting distribuido so se torna urgente quando houver decisao de deploy
multi-instancia. Tratar tudo como uma fase unica violaria o mesmo principio
que motivou fatiar Onboarding/Employment/Offboarding/AccessGrant em fases
separadas ao longo deste projeto, e o padrao de `docs/06-engenharia/
desenvolvimento-com-ia.md` ("uma tarefa deve caber em uma revisao humana
simples").

**Ordem recomendada das sub-frentes** (sem numerar Fase/SPEC -- essa
formalizacao fica para decisao humana futura, fora desta ADR):

1. **Configuracao/secrets (fail-fast de producao generalizado)** -- menor
   custo, maior urgencia: hoje so `assertSupabaseAuthConfiguredForProduction`
   (Fase 29) existe; precisa generalizar para todas as variaveis obrigatorias.
2. **Seguranca de borda** (security headers + CORS + revisao de
   cookies/CSRF) -- baixo custo tecnico, amplifica diretamente a protecao que
   a Fase 29 acabou de introduzir (cookies HttpOnly, sessao real).
3. **CI/CD minimo** (GitHub Actions) -- institucionaliza gates ja seguidos
   manualmente em toda fase anterior; teria evitado, por exemplo, a saida de
   teste truncada por contencao de log observada durante o proprio
   fechamento fisico da Fase 29.
4. **Observabilidade minima** (logging estruturado + error monitoring) --
   hoje zero; o error handler global nao loga nada, risco operacional real
   e imediato de falhas silenciosas.
5. **Backup/restore + DR minimo** -- depende de decisao externa (plano
   Supabase), mas o teste de restore é o gate mais frequentemente esquecido
   e deve ser verificado o quanto antes, independente da ordem de codigo.
6. **Rate limiting distribuido** -- so urgente quando a decisao de deploy
   (fora desta ADR) exigir mais de uma instancia simultanea.
7. **E2E minimo** -- valor incremental menor dado o volume ja grande de
   testes de integracao reais contra Postgres existentes; nao bloqueante de
   RC.

## 3. CI/CD

**Provider: GitHub Actions**, justificado exclusivamente pela hospedagem
atual do repositorio (`github.com/detsolutions2025-sudo/talent-os-starter`)
-- nenhuma decisao de vendor nova.

- **Gatilhos:** `pull_request` contra `main` e `push` em `main`.
- **Checks obrigatorios (merge gate):** `tsc --noEmit`, `eslint .`,
  `prettier --check .`, `vite build`, `npm audit --omit=dev`, suite de
  testes (ver secao 15 sobre divisao de pipelines).
- **Migrations:** fresh install (`0001`..`N`) validado em banco efemero de
  CI a cada PR que toque `db/migrations/` -- nunca contra o Supabase DEV
  compartilhado (secao 15).
- **Protecao de branch:** `main` exige PR + CI verde + revisao humana
  (secao 19) -- decisao conceitual aqui, configuracao real e implementacao
  futura.
- **Artifact generation:** build do frontend (`dist/`) como artifact
  opcional; nao obrigatorio enquanto a estrategia de deploy nao for decidida.
- **Deploy gates:** nenhum deploy roda sem os checks acima verdes.
- **Seguranca do proprio pipeline:** Actions de terceiros devem ser fixadas
  por hash de commit (nunca por tag mutavel), e os secrets do GitHub Actions
  devem ter o menor escopo/permissao necessarios (correcao incorporada pela
  revisao destrutiva, item 25).

## 4. Estrategia de Deploy

O que existe hoje: **nada operado** -- nenhum historico de deploy real.

- **Backend:** processo Node unico (Express), sem clustering hoje.
  Multi-instancia fica condicionada a necessidade real (gatilho da secao 8).
- **Frontend:** build estatico via Vite (`vite build`); hoje servido
  separadamente em desenvolvimento (`vite --host 127.0.0.1 --port 5173` +
  API em `tsx watch` na porta 3001). Arquitetura de deploy real (mesmo
  processo servindo estatico + API, vs. CDN separado) fica para decisao de
  hosting, **fora desta ADR**.
- **Environment separation:** `development` (local, dev-auth),
  `CI/test` (efemero, secao 15), `staging/homologacao` (hoje inexistente
  como ambiente fisico separado -- "DEV" cumpre esse papel de forma
  improvisada), `production` (nunca operado).
- **Staging e obrigatorio antes de production** -- decisao desta ADR. Motivo
  direto: a Fase 29 nunca foi exercitada contra um Supabase Auth de projeto
  real fora de dev/test (achado fisico citado no Contexto). Staging deve
  espelhar producao o maximo possivel -- mesmas variaveis reais (Supabase
  Auth real, nao dev-auth), mudando apenas dominio e dados (correcao
  incorporada pela revisao destrutiva, item 27).
- **Migration timing:** migrations aplicadas **antes** do deploy do codigo
  que depende delas -- nunca simultaneo, nunca depois (mesmo processo ja
  seguido manualmente nesta sessao para a migration 0033).
- **Rollback:** codigo e reversivel (deploy anterior); migrations sao
  **forward-only** (confirmado fisicamente -- `migrations.ts` nao tem DOWN),
  entao toda migration futura deve continuar aditiva o suficiente para nao
  quebrar o deploy anterior em caso de rollback de codigo -- disciplina ja
  seguida nas 33 migrations existentes, a manter como regra explicita.
- **Health gate:** deploy so e considerado bem-sucedido apos `/api/ready`
  (secao 9) responder OK pos-deploy.
- **Deploy ordering:** migrations -> deploy do backend -> verificacao de
  saude -> deploy do frontend.
- **Deploys devem ser serializados** -- nunca dois deploys simultaneos para
  o mesmo ambiente (correcao incorporada pela revisao destrutiva, item 22).
- **Hosting especifico: nao decidido nesta ADR.** Registrado como decisao
  separada, condicionada ao plano tecnico de cada sub-frente.

## 5. Migrations em Producao

Confirmado fisicamente: `schema_migrations` tem apenas `id`/`name`/
`applied_at`; cada migration roda em sua propria transacao (BEGIN/COMMIT/
ROLLBACK), forward-only, idempotente por `id`.

**Avaliacao explicita da ausencia de checksum:** hoje, se o conteudo de uma
migration ja aplicada for editado depois (proibido por disciplina de
processo -- "0032/0033 sao imutaveis" -- mas nunca impedido fisicamente), o
script de migracao nao teria como detectar a divergencia, pois so compara o
`id`. **Decisao: sim, isso precisa de hardening.** Adicionar uma coluna
`checksum` (SHA-256 do conteudo do arquivo) em `schema_migrations`,
verificada no boot do script de migracao, falhando explicitamente se uma
migration ja aplicada tiver hash diferente do arquivo atual -- transforma a
disciplina hoje seguida manualmente numa garantia fisica.

- **Lock contra duas migrations simultaneas:** hoje inexistente (nenhum
  `pg_advisory_lock`). Decisao: adicionar advisory lock do Postgres ao redor
  do laco de aplicacao.
- **Backup antes de mudanca destrutiva:** nenhuma migration ate hoje foi
  destrutiva (todas aditivas); a Constituicao (Banco de dados, item 5) ja
  exige revisao humana para mudancas destrutivas. Reforcado: qualquer
  migration destrutiva futura exige confirmacao humana explicita + backup
  verificado antes de aplicar, nunca automatizado.
- **Rollback operacional:** sempre rollback de codigo (reverter deploy),
  nunca rollback de schema (nao ha DOWN) -- mantido como decisao explicita.

## 6. Security Headers

**Baseline minima:** Content-Security-Policy (restritiva, ajustada as
origens reais do frontend/Supabase), HSTS (condicionado a `isProductionEnv`,
nunca em desenvolvimento -- ver secao 12), X-Content-Type-Options: nosniff,
frame-ancestors/X-Frame-Options: DENY (a aplicacao nao roda em iframe),
Referrer-Policy: strict-origin-when-cross-origin, Permissions-Policy
restritiva (nega camera/microfone/geolocalizacao -- nenhum usado pelo
produto).

**Estrategia escolhida: `helmet`** (biblioteca madura) -- mesma disciplina
de "reaproveitar bibliotecas maduras em vez de reinventar" ja usada para
`jose` (JWT, Fase 29). Se o hosting futuro terminar headers via proxy/edge,
o plano tecnico avalia sobreposicao para nao duplicar/conflitar -- decisao
de "app vs proxy" condicionada a hosting (fora desta ADR), mas `helmet`
garante a baseline independentemente de onde a app rodar.

## 7. CORS

- **Origem permitida:** allowlist explicita por ambiente -- em producao,
  apenas o(s) dominio(s) reais do frontend (a definir no plano tecnico); em
  development/test, `http://127.0.0.1:5173` (ja usado hoje).
- **Credentials:** `true` -- necessario porque a Fase 29 usa cookies
  HttpOnly de sessao (`/api/auth/session`). **Proibido explicitamente:**
  `Access-Control-Allow-Origin: *` combinado com credentials.
- **Methods:** apenas os verbos realmente usados (GET, POST, PATCH -- a API
  nao usa PUT/DELETE em nenhuma rota existente).
- **Headers:** `Content-Type`, `Idempotency-Key` (ja usado desde a Fase 17).
- **Preflight:** tratado pela lib de CORS escolhida no plano tecnico, com
  cache de preflight razoavel.
- **Development:** liberal apenas para o host local conhecido, nunca `*`.

## 8. CSRF e Cookies

Revisao do contrato ja existente e testado (Fase 29, `CA-006`): `HttpOnly`
sempre, `Secure` em producao, `SameSite=Lax`, `Path=/api`.

**Nao reabre o mecanismo de sessao** (fora do escopo, autenticacao ja
fechada pela Fase 29). `SameSite=Lax` ja mitiga a maior parte de CSRF em
requisicoes cross-site simples, mas nao cobre 100% dos casos de navegacao de
topo. Decisao: complementar com **validacao de `Origin`/`Referer`** no
servidor para toda rota mutavel autenticada -- mesma disciplina defensiva ja
usada pela SPEC-028 (verificacao de e-mail do token vs. convite). Um CSRF
token dedicado (double-submit) e avaliado como **desnecessario** para o
modelo de ameaca atual (API consumida por SPA propria, nao por formularios
HTML de terceiros) -- decisao, nao ambiguidade.

## 9. Rate Limiting

| Opcao | Consistencia | Custo | Operacao | Falha | Latencia | Multi-instancia | Limpeza | Protecao login/auth/public |
|---|---|---|---|---|---|---|---|---|
| A. In-memory single-process (atual) | Perfeita dentro do processo | Zero | Nenhuma | Perde estado no restart | Minima | **Quebra** (cada instancia com janela propria) | Automatica (memoria) | OK apenas com 1 processo |
| B. Redis | Forte entre instancias | Baixo-Medio | Servico extra a manter | Depende de disponibilidade do Redis | Baixa | OK | Requer TTL/expiracao | OK |
| C. Provider gerenciado (ex. Upstash) | Forte | Baixo-Medio | Minima (gerenciado) | Depende do provider | Baixa | OK | Gerenciado | OK |
| D. Edge/WAF | Forte na borda | Depende do hosting | Minima | Depende do provider | Muito baixa | OK | Gerenciado | OK, mas exige decisao de hosting/edge |
| E. Postgres | Forte (mesma infra ja paga) | Zero adicional | Zero (reaproveita) | Acoplada a disponibilidade do banco (ja critica para tudo) | Media (mais que Redis) | OK em baixo volume | Manual (job de limpeza) | OK |

**Decisao:** manter **A** como gate minimo de MVP **enquanto** o deploy
continuar sendo um unico processo (decisao de deploy ainda nao tomada) --
nao trocar por Redis prematuramente sem necessidade real de multi-instancia
(evita over-engineering desproporcional ao estagio atual). **Gatilho
explicito de migracao:** no momento em que a decisao de deploy exigir mais
de uma instancia simultanea, a opcao **E (Postgres)** e a transicao padrao
de baixo custo (reaproveita infraestrutura ja paga, sem novo vendor), com
**C** como alternativa se a latencia de Postgres se mostrar insuficiente
para os endpoints mais sensiveis (login, bootstrap, convite, candidatura
publica).

**Fallback em indisponibilidade do armazenamento de rate limit:**
**fail-open com auditoria** para endpoints publicos de baixo risco;
**fail-closed** para endpoints sensiveis de autenticacao (login, bootstrap,
convite) -- nunca deixar login sem protecao alguma e sem visibilidade.

## 10. Observabilidade

- **Logs:** structured logging minimo (JSON, nivel, timestamp, correlation
  ID) via biblioteca leve madura (ex. `pino`) -- hoje so `console.log`/
  `console.error` pontuais e nao estruturados.
- **Metricas:** adiado -- nao critico para o primeiro RC dado o volume atual
  (zero producao real); proxima iteracao, nao bloqueante.
- **Tracing:** **fora do MVP de hardening** -- full OpenTelemetry e
  excessivo para um processo unico sem microsservicos. Decisao explicita de
  nao obrigar.
- **Error monitoring:** ver secao 11.
- **Uptime:** monitoramento externo simples (ping periodico em
  `/api/health`) por ferramenta gerenciada de baixo custo, nao operacao
  propria.

## 11. Logging e Error Monitoring

- **Formato:** JSON estruturado; niveis `error`/`warn`/`info`/`debug`;
  correlation/request ID gerado por requisicao, propagado nos logs e
  devolvido em header de resposta.
- **Logging deve ser non-blocking/best-effort** -- uma falha ao escrever um
  log nunca pode derrubar ou atrasar a resposta de uma requisicao (correcao
  incorporada pela revisao destrutiva, item 11).
- **Redacao proibida explicitamente:** Authorization, JWT, refresh token,
  cookie, password, service-role key, connection string/senha de banco, PII
  desnecessaria -- mesma disciplina ja comprovada fisicamente pela Fase 29
  (`audit-security-source.test.ts`); Production Hardening deve **estender**
  essa mesma garantia (hoje testada so para `src/server/auth/*`) para
  qualquer logger operacional novo, com teste de codigo-fonte equivalente.
- **Retencao conceitual:** alinhada ao plano do provedor de logs escolhido;
  nenhuma retencao indefinida.
- **Audit log != operational log:** reforcado -- `addAuditEvent` (auditoria
  de negocio, permanente, madura desde a Fase 1) permanece completamente
  separado de qualquer log operacional novo (tecnico, retencao curta).
- **Error monitoring:** decisao de usar **ferramenta externa gerenciada**
  (ex. Sentry ou equivalente) -- nao construir mecanismo proprio, mesma
  disciplina de reuso de bibliotecas maduras. Avaliada como alternativa; o
  plano tecnico decide o produto exato.
- **O que precisa ser capturado:** respostas 5xx do error handler global
  (hoje **nao loga nada** -- achado fisico direto), `uncaughtException`/
  `unhandledRejection` do processo (hoje inexistente), crash do processo,
  falha do provider de autenticacao, falha de migration.

## 12. Health / Readiness

Hoje: um unico `/api/health` que sempre responde `{status:"ok"}` sem checar
nenhuma dependencia -- achado fisico direto.

**Decisao: separar em duas rotas.**

- **Liveness** (`/api/health`, comportamento atual preservado): processo
  esta de pe, sem checar dependencias -- usado para decidir "reiniciar o
  processo".
- **Readiness** (`/api/ready`, nova): verifica se a aplicacao pode atender
  trafego de verdade -- no minimo, conexao com o banco (`SELECT 1`); usada
  para decidir "enviar trafego para esta instancia".

**O que a readiness deve considerar:** banco de dados, **sim** (dependencia
critica de toda requisicao de negocio). Auth provider (Supabase Auth) e AI
provider, **nao** -- por design (ADR-0016/ADR-0019: IA e opcional; o Auth
provider ja falha por requisicao de forma isolada via cache de JWKS) --
evita exatamente o risco de "tornar provider opcional causa de downtime
global sem necessidade". Cache/rate limiter: nao critico para readiness
(fallback ja tratado por endpoint, secao 9).

## 13. Backup

Autoridade: o banco e Supabase-gerenciado -- backup primario e
responsabilidade do plano contratado, **nao do codigo da aplicacao**.

- **Nao assumir** que o plano atual inclui PITR (Point-in-Time Recovery) --
  registrado como **dependencia operacional a verificar explicitamente**
  antes do primeiro RC, nao uma decisao de codigo.
- **Backup logico adicional:** recomendado como segunda camada de baixo
  custo (`pg_dump` periodico independente do backup gerenciado), protegendo
  contra falha do proprio backup gerenciado ou erro de configuracao de
  plano. Frequencia/retencao a definir no plano tecnico.
- **Encryption/acesso:** dados em repouso ja criptografados pelo provider
  gerenciado subjacente; acesso a backups segue o mesmo principio de menor
  privilegio ja exigido pela Constituicao.

## 14. Restore (gate critico)

**"Backup sem restore testado nao e estrategia"** -- adotado como principio
desta ADR.

- **Restore periodico:** sim, em ambiente isolado (nunca sobrescrever
  DEV/producao), frequencia minima trimestral apos o primeiro RC (ajustavel
  no plano tecnico).
- **RPO/RTO:** esta ADR **nao fixa numeros arbitrarios** sem dado real de
  negocio (zero usuarios reais ainda). Decisao: RPO/RTO devem ser definidos
  explicitamente no plano tecnico da SPEC de Backup/Restore; ate la, o
  padrao gerenciado do provider (tipicamente diario + WAL continuo, a
  confirmar) e o piso minimo aceitavel.
- **Evidencia do ultimo teste de restore:** deve ser registrada (documento/
  runbook, data, resultado). **Decisao explicita:** "restore test" e
  requisito da futura SPEC de Production Hardening / Backup-Restore, nunca
  opcional.
- **Reconciliacao de schema pos-restore:** o processo de restore deve
  documentar/verificar qual foi a ultima migration aplicada no momento do
  backup, para reconciliar corretamente o schema apos restaurar (correcao
  incorporada pela revisao destrutiva, item 29).

## 15. Disaster Recovery (minimo, nao enterprise)

- **DB indisponivel:** ja parcialmente tratado (`pool.on("error")`);
  Production Hardening garante erro claro ao cliente (5xx) + registro no
  error monitoring, nunca crash do processo.
- **Regiao indisponivel:** **fora de escopo** -- multi-region e enterprise,
  desproporcional ao estagio atual (secao 17).
- **Deploy ruim:** mitigado por CI gates + rollback de codigo.
- **Migration ruim:** mitigada por forward-only + checksum (secao 5) +
  revisao humana obrigatoria para destrutivas.
- **Auth provider indisponivel:** ja tratado pelo desenho da Fase 29 --
  sessoes ja emitidas continuam validas (verificacao local via JWKS
  cacheado); so novos logins/convites falham durante a indisponibilidade --
  comportamento aceitavel, nao exige novo codigo.
- **Segredo comprometido:** processo de rotacao de credenciais deve existir
  como runbook operacional (documento, nao codigo) -- registrada a
  necessidade, nao escrito aqui.

## 16. Secrets

Armazenamento atual: variaveis de ambiente (`.env` local, nunca commitado)
-- ja confirmado fisicamente correto pela Fase 29.

- **Ambientes:** development/test usam `.env` local; producao usa o
  mecanismo de secrets do hosting escolhido (a decidir) -- nunca arquivo
  commitado.
- **Rotacao:** nao existe hoje nenhum processo. Registrado como gap a
  fechar no plano tecnico (runbook de rotacao para
  `SUPABASE_SERVICE_ROLE_KEY` e chaves JWT), sem implementar agora.
- **Server-only vs. frontend-safe:** convencao ja estabelecida e testada
  pela Fase 29 (prefixo `VITE_`) -- apenas reforcada e generalizada aqui.
- **CI secrets:** GitHub Actions Secrets, nunca em arquivo de workflow em
  texto plano.
- **Proibicoes reforcadas:** repo, logs, frontend bundle, artifacts, test
  snapshots -- todas ja demonstradas corretas hoje (nenhuma ocorrencia
  encontrada nesta investigacao); mantidas como gate de CI.

## 17. Configuration Validation

Ja existe um padrao real e testado: `assertSupabaseAuthConfiguredForProduction()`
(Fase 29) falha o boot se `APP_ENV=production` e faltar config de auth.

**Decisao: generalizar esse mesmo padrao** para todas as variaveis
obrigatorias de producao (`DATABASE_URL`/`SUPABASE_DATABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
e quaisquer novas introduzidas pelo hardening) em um unico ponto de
validacao no boot (`index.ts`), fail-fast, nunca subida parcial. **Nao**
introduzir uma lib de schema validation pesada -- a validacao manual
explicita ja comprovadamente testavel (Fase 29) e proporcional.

## 18. TLS e Trusted Proxy

- **TLS:** responsabilidade do **hosting provider/reverse proxy**, nunca da
  aplicacao Node diretamente.
- **HSTS** so tem efeito real com HTTPS terminado corretamente -- o header
  (secao 6) deve ser condicionado a `isProductionEnv`, nunca enviado em
  desenvolvimento (mesmo padrao ja usado para o cookie `Secure` na Fase 29).
- **Trusted proxy:** hoje nenhuma configuracao de `trust proxy` existe no
  Express. Se o hosting futuro estiver atras de proxy/load balancer,
  `req.ip`/`X-Forwarded-For` nao sao confiaveis por padrao -- o rate
  limiter (que usa IP como chave em rotas publicas) ficaria vulneravel a
  spoofing ou colapsaria todos os clientes numa unica chave. **Decisao:**
  `trust proxy` deve ser configurado explicitamente de acordo com a
  topologia real do hosting (nunca `true` generico/permissivo) -- exigencia
  fixada aqui, condicionada a escolha de hosting fora desta ADR.

## 19. Performance Minima, Graceful Shutdown e Resiliencia de Processo

- **Timeout de request:** hoje inexistente -- adicionar timeout de servidor
  HTTP para nunca deixar requisicao pendurada indefinidamente.
- **DB pool:** ja existe (`pg.Pool`); revisar/parametrizar tamanho e
  timeouts explicitamente por ambiente no plano tecnico.
- **Provider timeout:** JWKS remoto ja tem cache (Fase 29); Supabase Admin
  API (convite/bootstrap) nao tem timeout explicito hoje -- adicionar.
- **Payload limits:** **ja existe** (`express.json({limit:"256kb"})`,
  Fase 17) -- nenhuma acao nova, apenas reafirmado como ja cumprido.
- **Compression:** avaliar `compression` middleware -- baixa prioridade, nao
  bloqueante de RC.
- **Graceful shutdown:** hoje **inexistente** (`app.listen` sem handler de
  `SIGTERM`/`SIGINT` -- achado fisico direto). Decisao: implementar (plano
  tecnico) um handler que, ao receber `SIGTERM`: para de aceitar novas
  conexoes, aguarda requisicoes em voo ate um timeout maximo, fecha o pool
  do Postgres explicitamente, garante flush de log em buffer, e so entao
  encerra -- pre-requisito para rolling restart seguro.
- **Process resilience:** hoje so existe `pool.on("error", ...)` pontual.
  Decisao: adicionar handlers globais de `uncaughtException`/
  `unhandledRejection` que **logam o erro (error monitoring) e encerram o
  processo de forma controlada** -- nunca continuar rodando em estado
  corrompido. Reinicio fica a cargo de uma restart policy do
  hosting/orquestrador, fora desta ADR.

## 20. Resiliencia de Banco e de IA

- **Banco:** pool simples, sem parametros explicitos hoje; conflitos
  transitorios (`40P01`/`40001`/`55P03`) ja sao tratados e traduzidos para
  respostas HTTP seguras em varios dominios (Fases 28/29,
  `isPostgresConcurrentConflict`). Decisao: **preservar exatamente** esse
  padrao, generalizando-o como pratica obrigatoria para qualquer transacao
  nova; parametrizar pool size/timeouts explicitamente por ambiente no
  plano tecnico.
- **IA:** ja opcional por design (ADR-0016/ADR-0019) -- nenhum fluxo humano
  depende dela; essa e a principal defesa arquitetural existente. Decisao:
  **nao redesenhar `AIGateway`**; apenas garantir timeout/retry do provider
  de IA no mesmo padrao ja dado ao Supabase Admin API. Circuit breaker:
  avaliado como **desnecessario** no volume/criticidade atual.

## 21. Dependency Security e CI Gates

- `npm audit --omit=dev` ja faz parte do processo manual de toda fase
  anterior (sempre "0 vulnerabilidades"), mas nunca automatizado. Decisao:
  vira **gate obrigatorio de CI**.
- **Dependabot** (nativo do GitHub, zero custo/operacao) para patch/minor
  automatico via PR; major continua manual/revisado -- nunca merge
  automatico de breaking change.
- Lockfile (`package-lock.json`) ja versionado -- mantido obrigatorio.
- **CI gates minimos para merge/deploy:** `tsc --noEmit`, `eslint .`,
  `prettier --check .`, `vite build`, `npm audit --omit=dev`, suite de
  testes, fresh install de migrations em todo PR que toque `db/migrations/`.

## 22. Test Database em CI

Confirmado fisicamente: testes Postgres-dependentes caem no mesmo
`SUPABASE_DATABASE_URL` de DEV quando `TEST_DATABASE_URL` nao esta definida
-- ja acumulou 69 schemas `test_phase_*` orfaos.

**Decisao: CI deve usar um PostgreSQL efemero em container** (ex. servico
`postgres` nativo do GitHub Actions, descartado ao fim de cada run) via
`TEST_DATABASE_URL`, **nunca** o Supabase DEV compartilhado. Justificativa:
evita o vazamento ja observado, evita contencao entre execucoes paralelas,
remove dependencia de rede externa do pipeline. Execucao local contra
Supabase DEV continua permitida (fallback ja existente), mas deixa de ser a
pratica de CI.

## 23. E2E

Ausencia de E2E navegador->API->DB ja identificada pela auditoria que
originou a Fase 29 (nenhuma lib Playwright/Cypress no `package.json`).

**Decisao: entra em Production Hardening, como gate de baixa prioridade**
(nao bloqueante do primeiro RC) -- dado o volume ja grande de testes de
integracao reais contra Postgres existentes (centenas de testes
`*-postgres.test.ts` em 29 fases). Framework recomendado: **Playwright**
(suporte multi-browser maduro, boa integracao com GitHub Actions) -- escolha
final e conjunto minimo de jornadas ficam para o plano tecnico da SPEC
correspondente.

## 24. Release Process

Conceitual, sem burocracia excessiva: (1) release candidate = `main` com
todos os CI gates verdes; (2) approval = revisao humana (ja exigida pela
Constituicao); (3) deploy = ordering da secao 4; (4) smoke = checar
`/api/health` e `/api/ready` pos-deploy; (5) rollback = reverter para o
deploy anterior se smoke falhar; (6) migration check = confirmar
`schema_migrations` bate com o esperado antes de liberar trafego; (7)
version/tag = tag Git por release; (8) changelog = registrado no commit +
BACKLOG/roadmap, mesmo padrao ja usado em todas as fases.

## 25. Environments e Branch Protection

Ambientes: `development` (local), `CI/test` (efemero), `staging/homologacao`
(a criar fisicamente), `production` (nunca operado). **Staging obrigatorio
antes de production** (secao 4).

**Branch protection (decisao conceitual, nao configurada nesta tarefa):**
`main` deve exigir PR, CI verde e ao menos uma revisao antes de merge --
decorre diretamente da Constituicao ("Alteracoes devem ser pequenas e
faceis de revisar") e do processo ja seguido manualmente em toda fase;
branch protection so torna essa disciplina fisicamente inescapavel.

## 26. Incident Response Minimo

Nao corporativo: **detectar** (error monitoring + uptime), **classificar**
(severidade simples: critico/degradado/menor), **conter** (rollback),
**restaurar** (rollback de deploy ou restore de backup), **comunicar**
(nenhum canal formal exigido ainda no estagio atual), **registrar**
(post-mortem simples em markdown, mesmo estilo documental ja usado no
projeto). Runbook minimo deve existir **antes** do primeiro RC, nao depois
do primeiro incidente (correcao incorporada pela revisao destrutiva,
item 30).

## 27. Privacidade / Compliance Operacional

Relacionado apenas ao necessario: log minimization (secao 11), backup
retention alinhada ao plano do provider (secao 13), access control (ja
coberto pela Constituicao/RBAC existente), audit retention (auditoria de
negocio ja existe e e permanente, mantida como esta), secrets (secao 16).
**Nao reabre LGPD funcional.**

## 28. Custos Operacionais

Direcao A/D favorece custo marginal baixo, proporcional ao estagio atual:
GitHub Actions (incluso no plano do repositorio), Dependabot (gratuito),
ferramenta de error monitoring gerenciada (planos gratuitos/baixo custo
para volume inicial), backup gerenciado Supabase (a verificar se ja incluso
no plano contratado), rate limit via Postgres (zero custo de vendor
adicional). Evita explicitamente a alternativa B (infraestrutura propria)
por ser desproporcional a um produto com zero linhas de negocio em producao
ate o momento.

## 29. Criterio de Release Candidate

RC so existe quando:

1. CI gates verdes (secao 3/21), rodando de forma automatizada;
2. deploy reproduzivel (processo documentado, nao manual ad-hoc);
3. rollback de deploy conhecido e testado ao menos uma vez;
4. **restore de backup testado e evidenciado** (secao 14 -- gate critico,
   nao pode faltar);
5. observabilidade minima operando (logs estruturados + error monitoring +
   uptime, secoes 10/11);
6. security headers + CORS configurados e verificados (secoes 6/7);
7. rate limiting adequado a topologia de deploy escolhida (secao 9);
8. configuracao de producao validada fail-fast (secao 17);
9. staging exercitado com Supabase Auth real antes do primeiro RC
   (secoes 4/25).

## 30. Fora do Escopo

Declarado explicitamente fora: SSO/SAML, SCIM, login social,
WebAuthn/passkeys, MFA (tratada por SPEC-028 secao 21, nao por esta ADR),
novas funcionalidades de RH, billing, autosservico publico de Organization,
impersonation, advanced analytics/indicadores, autoscaling sofisticado,
multi-region ativo-ativo, zero-downtime avancado, SOC2/ISO, SIEM enterprise.
Este documento nao transforma um MVP/piloto em projeto enterprise.

## 31. Impacto no Codigo (conceitual, nenhuma linha alterada por esta ADR)

Areas futuras possiveis, sem implementar agora: `app.ts` (helmet, CORS,
rota de readiness, hooks de graceful shutdown), `index.ts` (validacao de
config generalizada, trusted proxy, handlers de resiliencia de processo),
`core/rate-limiter.ts` (possivel backend Postgres/Redis futuro, mesma
interface publica preservada), novo modulo de logger estruturado,
`.github/workflows/*.yml` (novo), scripts de restore/backup logico (novo),
documentos operacionais/runbooks novos, `package.json` (novas
devDependencies: `helmet`, `cors`, `pino` ou equivalente, `playwright` --
cada uma justificada individualmente no plano tecnico, nenhuma instalada
por esta ADR).

## 32. Impacto em Banco

**Preferencia: zero migration de dominio.** Unica excecao identificada: se
o checksum/advisory lock de `schema_migrations` (secao 5) ou um rate
limiting via Postgres (secao 9, se escolhido no futuro) exigirem
coluna/tabela tecnica nova -- isso e aditivo e de infraestrutura, nunca de
dominio de negocio, mas ainda assim uma migration real (`0034+`), a ser
criada apenas no plano tecnico correspondente, **nunca por esta ADR**.

## 33. Impacto em Autenticacao

Confirmado: nenhuma decisao desta ADR reabre Supabase Auth, User/
AuthIdentity, Membership, Actor ou AccessGrant. Production Hardening atua
exclusivamente na borda/operacao (headers, CORS, CI, observabilidade,
backup, rate limit, resiliencia de processo) -- nunca no modelo de
identidade/autorizacao ja fechado pelas Fases 28/29.

## 34. Revisao Destrutiva

Atacados os 30 cenarios exigidos; correcoes ja incorporadas ao texto das
secoes acima (marcadas inline) resumidas aqui:

| # | Cenario | Resultado |
|---|---|---|
| 1 | CI indisponivel | Deploys pausam ate CI voltar -- atraso, nao falha de producao. Sem contradicao. |
| 2 | Deploy quebrado | Rollback de codigo (secao 4). |
| 3 | Migration falha | Transacao propria por migration com ROLLBACK ja existente + checksum futuro detecta divergencia. |
| 4 | Rollback necessario | Forward-only + rollback de codigo (secao 4). |
| 5 | Banco indisponivel | Readiness reporta indisponivel; erro claro ao cliente, sem crash (secoes 12/20). |
| 6 | Restore nunca testado | E exatamente o gate critico fixado (secao 14/29). |
| 7 | Backup invalido | Mitigado por restore periodico testado -- so um backup restauravel de verdade e valido. |
| 8 | Rate limiter fora | Fallback fail-open/fail-closed por sensibilidade do endpoint (secao 9). |
| 9 | Redis fora (se escolhido) | Mesmo fallback da secao 9; decisao de nao adotar Redis agora reduz esse risco no curto prazo. |
| 10 | Observability provider fora | Nenhuma decisao faz a aplicacao depender do provider para responder requisicoes -- e um side-channel. |
| 11 | Logger falha | **Correcao incorporada:** logging deve ser non-blocking/best-effort (secao 11). |
| 12 | Auth provider fora | Ja tratado (secao 15) -- sessoes ja emitidas continuam validas via JWKS cacheado. |
| 13 | AI provider fora | Ja tratado -- IA opcional por design (secao 20). |
| 14 | Request malicioso | Payload limit + rate limit + headers + CORS combinados. |
| 15 | CORS errado | Allowlist explicita, nunca `*` com credentials (secao 7). |
| 16 | CSRF | SameSite + validacao de Origin/Referer (secao 8). |
| 17 | Secret vazado | Runbook de rotacao precisa existir (secao 16, gap registrado a fechar). |
| 18 | Token em log | Redacao proibida explicitamente, testavel (secao 11). |
| 19 | X-Forwarded-For forjado | Trusted proxy explicito, nunca confianca generica (secao 18). |
| 20 | Multiplas instancias | Gatilho que decide troca de rate limiter (secao 9), exige trusted proxy correto e graceful shutdown -- ja antecipado. |
| 21 | Process crash | Handlers globais de uncaught/unhandled + restart policy do hosting (secao 19). |
| 22 | Deploy simultaneo | **Correcao incorporada:** deploys devem ser serializados, nunca concorrentes para o mesmo ambiente (secao 4). |
| 23 | Migration simultanea | Advisory lock (secao 5). |
| 24 | CI usando DB compartilhado | Evitado pela decisao da secao 22 (Postgres efemero em container). |
| 25 | Pipeline comprometido | **Correcao incorporada:** Actions de terceiros pinadas por hash de commit, secrets com escopo minimo (secao 3). |
| 26 | Package vulneravel | npm audit + Dependabot (secao 21). |
| 27 | Staging divergente | **Correcao incorporada:** staging deve espelhar producao (mesmas configs reais, so dados diferentes) (secao 4). |
| 28 | Backup contendo PII | Esperado; controle de acesso a backup por menor privilegio ja exigido (secao 13). |
| 29 | Restore com schema errado | **Correcao incorporada:** restore deve reconciliar contra a ultima migration aplicada no momento do backup (secao 14). |
| 30 | Incidente sem runbook | **Correcao incorporada:** runbook minimo exigido antes do primeiro RC, nao depois do primeiro incidente (secao 26). |

Nenhuma contradicao bloqueante permanece sem correcao incorporada ao texto
final. A ADR e promovida a **Aceita**.

## Consequencias

Beneficios:

- fecha a segunda metade do achado P0 da auditoria pos-Fase 28 (a primeira
  foi a Fase 29);
- prontidao operacional minima antes de qualquer usuario real tocar o
  sistema, sem transformar o MVP num projeto enterprise;
- todas as decisoes sao proporcionais ao estagio atual (zero dados de
  negocio em qualquer ambiente) e reversiveis/trocaveis (servicos
  gerenciados, nao infraestrutura propria).

Custos:

- introduz varios servicos gerenciados novos (CI, error monitoring, uptime,
  eventualmente Redis/Postgres-rate-limit) -- cada um exige configuracao e,
  em alguns casos, custo recorrente pequeno;
- exige disciplina continua para nunca deixar produção subir com
  configuracao parcial (fail-fast generalizado) e para nunca pular o teste
  de restore.

## Impacto Futuro

Esta ADR devera orientar, na ordem recomendada pela secao 2, no minimo tres
SPECs/frentes tecnicas separadas (numeros a confirmar no momento de cada
redacao): configuracao/secrets e seguranca de borda; CI/CD e observabilidade;
backup/restore e disaster recovery minimo. Rate limiting distribuido e E2E
ficam condicionados a gatilhos proprios (necessidade real de multi-instancia;
prioridade apos as demais frentes fecharem). Qualquer implementacao futura
deve preservar a compatibilidade conceitual com esta decisao ou registrar
nova ADR substitutiva. Esta ADR nao formaliza nenhuma Fase numerada nem
cria SPEC-029 -- essa formalizacao e decisao humana futura.
