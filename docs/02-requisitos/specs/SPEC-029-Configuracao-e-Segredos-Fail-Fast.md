# SPEC-029 - Configuracao e Segredos: Fail-Fast de Producao Generalizado

**Status:** Aprovada
**Versao:** 1.0
**Fase:** 30
**Responsavel de negocio:** Thiago Sousa
**Dependencias:** ADR-0027 - Production Hardening / Prontidao Operacional, ADR-0026 - Autenticacao Real, SPEC-028 - Autenticacao Real (secao 37, "Configuracao e Segredos")
**Ultima atualizacao:** 2026-08-26

**Nota de revisao destrutiva (v1.0):** este documento nasce em v0.1 e e
atacado na mesma tarefa (secao 20). Nenhuma secao normativa abaixo permanece
sem que a revisao destrutiva tenha sido aplicada a ela; as correcoes ja
estao incorporadas ao texto das secoes 1 a 19.

## 1. Objetivo

Fechar a **primeira sub-frente** da ordem recomendada por ADR-0027 (secao
2, item 1): generalizar o padrao ja existente e testado
(`assertSupabaseAuthConfiguredForProduction`, Fase 29) para **todas** as
variaveis de ambiente hoje consideradas obrigatorias para o processo
funcionar corretamente em `APP_ENV=production`, garantindo um unico ponto
de validacao de configuracao no boot, fail-fast, nunca uma subida parcial.

Esta SPEC nao e "Production Hardening" em geral -- e apenas a fatia que o
proprio ADR-0027 ordenou primeiro, pelo motivo que ele mesmo registra:
*"menor custo, maior urgencia: hoje so `assertSupabaseAuthConfiguredForProduction`
(Fase 29) existe; precisa generalizar para todas as variaveis obrigatorias"*
(ADR-0027, secao 2, item 1).

## 2. Fora do Escopo

Esta SPEC nao define nem implementa:

- codigo, migration, alteracao de banco, rotas ou UI executavel (esta e uma
  tarefa documental, como toda SPEC deste projeto);
- testes executaveis (apenas o catalogo, secao 16);
- **nenhuma das outras seis sub-frentes de ADR-0027**: CI/CD (secao 3 do
  ADR), security headers/CORS/CSRF (secoes 6-8), observabilidade/logging/
  error monitoring (secoes 10-11), health/readiness (secao 12),
  backup/restore/DR (secoes 13-15), rate limiting distribuido (secao 9),
  E2E (secao 23) -- mesmo pertencendo ao mesmo guarda-chuva arquitetural,
  cada uma exige sua propria SPEC futura, na ordem ja recomendada pelo ADR;
- validacao de **formato** de variaveis de ambiente (URL bem formada, JWT
  bem formado etc.) -- apenas **presenca** (nao-vazio) e validada nesta v1
  (secao 19, ambiguidade registrada);
- qualquer secret store externo (Vault, AWS Secrets Manager, Doppler etc.)
  -- fora do escopo, `process.env` continua a unica fonte;
- alteracao de ADR-0027, ADR-0026, SPEC-028, `authorize()`, `Membership`,
  `AccessGrant`, `AuthService`, `dev-auth.ts` ou qualquer migration
  historica;
- alteracao de BACKLOG ou roadmap.

## 3. Fontes Obrigatorias e Evidencias

Lidas integralmente antes da redacao: `CONSTITUICAO_DO_PROJETO.md`,
`AGENTS.md`, ADR-0027 (integral), ADR-0026, SPEC-028 (secao 37,
"Configuracao e Segredos"), `docs/02-requisitos/requisitos-nao-funcionais.md`,
`docs/04-seguranca/constituicao-seguranca.md`, `README.md`, `.env.example`,
`package.json`, `src/server/index.ts`, `src/server/auth/config.ts`,
`src/server/postgres.ts`.

Evidencia fisica confirmada nesta tarefa (nao apenas por inspecao
documental):

- `src/server/auth/config.ts` -- `assertSupabaseAuthConfiguredForProduction`
  ja existe, ja e testado (Fase 29), e ja valida exatamente
  `VITE_SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` (via `requireVar`, que
  ja trata string vazia como ausente e ja nomeia a variavel faltante no
  erro) -- **mas so quando `APP_ENV === "production"`**.
- `src/server/postgres.ts` -- `requirePostgresDatabaseUrl` ja valida
  `SUPABASE_DATABASE_URL` de forma **incondicional** (em qualquer
  ambiente), de forma **separada** do mecanismo de auth, nunca integrada a
  um ponto unico de validacao.
- **Gap fisico confirmado:** `VITE_SUPABASE_ANON_KEY` (`src/server/index.ts`,
  linha 72) **nunca e validada por nome**. Hoje, se ausente em producao, o
  codigo so detecta a falta indiretamente: `index.ts` cria `authService`
  apenas se as 3 variaveis (`VITE_SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  && VITE_SUPABASE_ANON_KEY`) forem truthy; se `VITE_SUPABASE_ANON_KEY`
  faltar, `authService` fica `undefined`, e o erro que realmente aparece e
  o generico de `createActorProvider` (`"AuthService is required to resolve
  Actor outside development/test"`), que nunca nomeia a variavel de
  ambiente real que falta. Este e o problema concreto que esta SPEC fecha.

## 4. Definicao do Problema

**Pergunta central:** como garantir que o processo de producao nunca suba
parcialmente configurado, com uma mensagem de erro que sempre nomeia
exatamente qual variavel falta -- sem introduzir uma biblioteca de schema
validation nova, e sem duplicar/enfraquecer a validacao ja existente e
testada da Fase 29?

Quem e afetado: quem opera o deploy (hoje, a propria pessoa que aplica
migrations e sobe o processo manualmente; no futuro, o pipeline de CI/CD,
fora do escopo desta SPEC). O que significa "pronto": qualquer variavel
obrigatoria ausente em `APP_ENV=production` interrompe o boot, antes de
`app.listen()`, com uma mensagem que nomeia a variavel exata. Por que isso
e requisito de Release Candidate: e o item 8 do criterio de RC do ADR-0027
(secao 29): *"configuracao de producao validada fail-fast"*. Se nao for
implementado: o sistema pode subir parcialmente configurado (como ja ocorre
hoje com `VITE_SUPABASE_ANON_KEY`), falhando de forma tardia e com
diagnostico generico, exatamente no momento em que alguem tenta autenticar
de verdade -- o pior momento possivel para descobrir um erro de deploy.

## 5. Invariantes Fundamentais

- **INV-01:** em `APP_ENV=production`, a auséncia de qualquer variavel da
  lista fechada de obrigatorias (secao 6) impede `app.listen()` de ser
  chamado -- nunca uma subida parcial.
- **INV-02:** fora de `production` (`development`/`test`, e qualquer outro
  valor nao reconhecido -- ver secao 19), o comportamento de boot
  permanece **exatamente** o de hoje -- `dev-auth.ts` continua funcionando
  sem nenhuma dessas variaveis, byte a byte como a Fase 29 deixou.
- **INV-03:** o mecanismo desta SPEC **nunca loga o valor** de nenhuma
  variavel, apenas o **nome** da(s) variavel(is) ausente(s).
- **INV-04:** a lista de variaveis obrigatorias e codigo versionado, nunca
  configuravel por variavel de ambiente (nao pode existir um jeito de
  desabilitar a propria validacao).
- **INV-05:** este mecanismo **absorve**, nunca duplica ou remove,
  `assertSupabaseAuthConfiguredForProduction` (Fase 29) e
  `requirePostgresDatabaseUrl` (Fase 1.1) -- os testes ja existentes para
  essas duas funcoes continuam passando sem modificacao.

## 6. Escopo Normativo (o que entra na v1)

Lista fechada de variaveis obrigatorias em `APP_ENV=production`, todas ja
usadas hoje pelo codigo, nenhuma nova introduzida por esta SPEC:

| Variavel | Uso atual | Validacao atual | Validacao apos esta SPEC |
|---|---|---|---|
| `SUPABASE_DATABASE_URL` | Connection string do Postgres (`postgres.ts`) | Incondicional (falha em qualquer ambiente se ausente) | Continua incondicional; passa a fazer parte do mesmo relatorio de erro consolidado quando em producao |
| `VITE_SUPABASE_URL` | URL do projeto Supabase Auth (`auth/config.ts`) | So se `APP_ENV=production` | Preservada, absorvida pelo ponto unico |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only, API administrativa do provider (`auth/config.ts`) | So se `APP_ENV=production` | Preservada, absorvida pelo ponto unico |
| `VITE_SUPABASE_ANON_KEY` | Cliente anonimo do Supabase, usado pelo `SupabaseAdminAdapter` (`index.ts`) | **Nenhuma validacao nomeada -- gap fechado por esta SPEC** | Nova: validada por nome, mesma disciplina das demais |

Um unico ponto de validacao (`assertProductionConfig()` ou nome equivalente
a definir no plano tecnico), chamado no boot de `index.ts` **antes de
qualquer outra inicializacao** (antes de criar o pool do Postgres, antes de
criar `authService`, antes de `app.listen()`).

**Explicitamente fora da lista de obrigatorias** (nunca devem ser exigidas
em producao por este mecanismo):

- `TEST_DATABASE_URL` -- variavel exclusiva de teste, nunca usada por
  `index.ts`;
- `AI_API_KEY`/`AI_PROVIDER` -- IA e opcional por design (ADR-0016/
  ADR-0019); exigi-las tornaria um recurso opcional em bloqueador de boot,
  contrariando essas ADRs;
- `SUPABASE_JWKS_URL`/`SUPABASE_JWT_ISSUER`/`SUPABASE_JWT_AUDIENCE` -- ja
  opcionais por design (`auth/config.ts` ja deriva default a partir de
  `VITE_SUPABASE_URL` quando ausentes) -- nao viram obrigatorias por esta
  SPEC.

## 7. Requisitos Normativos

- **RN-001:** em `APP_ENV=production`, o processo nao pode chamar
  `app.listen()` se qualquer variavel da lista fechada (secao 6) estiver
  ausente ou vazia.
- **RN-002:** a mensagem de erro nomeia explicitamente **todas** as
  variaveis ausentes de uma vez (nao apenas a primeira encontrada) --
  evita descoberta em serie durante um deploy real.
- **RN-003:** string vazia (`""`) ou composta so de espacos e tratada como
  ausente -- mesmo comportamento ja usado por `requireVar`
  (`auth/config.ts`), reaproveitado, nunca reimplementado.
- **RN-004:** fora de `production`, nenhuma dessas variaveis e exigida --
  preserva `INV-02` byte a byte.
- **RN-005:** o mecanismo nunca loga o **valor** de nenhuma variavel, em
  nenhuma circunstancia, mesmo em modo de erro -- preserva `INV-03`.
- **RN-006:** a lista de variaveis obrigatorias nao pode ser alterada por
  nenhuma variavel de ambiente (por exemplo, um hipotetico
  `SKIP_CONFIG_VALIDATION`) -- preserva `INV-04`.
- **RN-007:** o ponto unico de validacao **chama** (nunca duplica a logica
  de) `assertSupabaseAuthConfiguredForProduction` e
  `requirePostgresDatabaseUrl` -- preserva `INV-05` e a compatibilidade
  com os testes ja existentes da Fase 29/1.1.
- **RN-008:** a falha de validacao usa um mecanismo que **nao pode ser
  engolido por um `try/catch` generico** ao redor do boot (por exemplo,
  lancar antes de qualquer bloco de inicializacao com tratamento de erro
  amplo, ou usar `process.exit(1)` explicito apos logar o erro) -- nunca um
  processo que "falha silenciosamente e continua no ar".
- **RN-009:** este mecanismo se aplica **apenas ao processo real**
  (`src/server/index.ts`) -- nunca ao harness de testes automatizados, que
  constroi a aplicacao via `createServer()` diretamente com
  `DevActorProvider`, sem passar por este boot.
- **RN-010:** com todas as variaveis da lista presentes e nao-vazias, o
  boot prossegue exatamente como hoje -- este mecanismo nunca introduz
  nenhuma outra condicao de falha alem da presenca das variaveis listadas.

## 8. Ambientes

- **development:** comportamento identico ao atual -- nenhuma variavel da
  lista e exigida; `dev-auth.ts` funciona normalmente.
- **test/CI:** idem development -- os testes automatizados nunca sobem
  `index.ts`, entao nunca sao afetados por este mecanismo (RN-009). Se um
  futuro pipeline de CI (fora do escopo desta SPEC) rodar o processo real
  com `APP_ENV=production` para smoke test, deve se sujeitar as mesmas
  regras de producao, sem excecao especial.
- **staging/homologacao:** exige **exatamente** as mesmas variaveis que
  producao -- consistente com ADR-0027 secao 4 ("staging deve espelhar
  producao o maximo possivel"). Nunca uma validacao "reduzida" para
  staging.
- **production:** fail-fast completo, sem excecao, conforme RN-001.

**DEV compartilhado nunca e tratado como producao:** o unico sinal que
decide o comportamento e `process.env.APP_ENV` explicito -- nunca inferido
a partir de qual banco esta conectado (o mesmo Supabase DEV usado hoje para
desenvolvimento/homologacao continua rodando sob `APP_ENV=development`, sem
ativar este mecanismo).

## 9. Seguranca

Riscos aplicaveis a esta fatia (configuracao/secrets):

- **Segredo vazado em mensagem de erro de boot:** mitigado por RN-005 --
  testavel por codigo-fonte (secao 16).
- **Segredo commitado acidentalmente:** fora do escopo desta SPEC (gate de
  CI, ADR-0027 secao 21, sub-frente futura) -- mas as proibicoes ja
  vigentes (Constituicao, SPEC-028) continuam valendo.
- **Variavel de producao lida por engano de `.env` local:** `.env` nunca e
  usado em hosting real (so localmente via `dotenv`); este mecanismo nao
  cria nem remove esse risco, apenas garante que a AUSENCIA de configuracao
  real seja detectada, nao mascarada.
- **Confusao entre "obrigatorio de producao" e "obrigatorio sempre":**
  mitigado por RN-004/INV-02 -- a lista so se aplica quando
  `APP_ENV=production`.

## 10. Falhas

**Fail-closed sempre, sem excecao:** ausencia de configuracao obrigatoria
em producao = processo nunca sobe (RN-001). Nao existe modo "fail-open"
para esta capacidade -- ao contrario do rate limiting (ADR-0027 secao 9),
onde fail-open e aceitavel para endpoints de baixo risco, aqui a analogia
nao se aplica: um processo mal configurado em producao nao deve atender
NENHUMA requisicao, nunca parcialmente.

## 11. Auditoria / Evidencia Operacional

Esta capacidade nao gera `audit_events` de negocio -- e **evidencia
operacional**, distinta de auditoria de negocio (mesma separacao ja
reforcada por ADR-0027 secao 11, "Audit log != operational log"):

- evidencia de que a capacidade funciona = o proprio processo recusando
  subir, com mensagem de erro nomeando a(s) variavel(is) ausente(s), e
  codigo de saida (`exit code`) diferente de zero;
- essa mensagem e capturavel pelo log de deploy/orquestrador de hosting
  mesmo sem nenhuma stack de observabilidade dedicada (que e sub-frente
  futura, fora do escopo aqui) -- ver risco conhecido na secao 19.

## 12. Critérios de Aceite

- **CA-001:** em `APP_ENV=production`, subir sem `SUPABASE_SERVICE_ROLE_KEY`
  falha o boot antes de `app.listen()`.
- **CA-002:** em `APP_ENV=production`, subir sem `VITE_SUPABASE_URL` falha
  o boot antes de `app.listen()`.
- **CA-003:** em `APP_ENV=production`, subir sem `VITE_SUPABASE_ANON_KEY`
  falha o boot antes de `app.listen()` (fecha o gap fisico da secao 3).
- **CA-004:** em `APP_ENV=production`, subir sem `SUPABASE_DATABASE_URL`
  falha o boot antes de `app.listen()`.
- **CA-005:** em `APP_ENV=development`, subir sem nenhuma das variaveis da
  lista funciona normalmente (dev-auth ativo).
- **CA-006:** em `APP_ENV=test`, idem CA-005.
- **CA-007:** faltando duas ou mais variaveis simultaneamente, a mensagem
  de erro nomeia todas, nao so a primeira.
- **CA-008:** a mensagem de erro nunca contem o valor de nenhuma variavel
  de ambiente, apenas nomes.
- **CA-009:** com todas as variaveis da lista presentes e nao-vazias em
  producao, o boot prossegue normalmente ate `app.listen()`.
- **CA-010:** o ponto de validacao roda antes de qualquer outra
  inicializacao de servico (pool do Postgres, `authService`,
  `actorProvider`) -- nunca depois.
- **CA-011:** uma variavel presente mas composta so de espacos em branco e
  tratada como ausente (mesmo padrao de `requireVar`).
- **CA-012:** os testes ja existentes de
  `assertSupabaseAuthConfiguredForProduction` e
  `requirePostgresDatabaseUrl` continuam passando sem nenhuma modificacao.
- **CA-013:** nenhuma variavel de ambiente consegue desabilitar a
  validacao (nao existe nenhum "escape hatch").

## 13. Testes Obrigatorios Futuros

Nao implementados nesta tarefa -- catalogo para o plano tecnico:

### Unit / config validation

- cada variavel da lista fechada testada isoladamente ausente -> falha
  nomeando exatamente ela (CA-001 a CA-004);
- todas presentes -> sucesso (CA-009);
- string vazia/so espacos tratada como ausente (CA-011);
- multiplas ausentes -> mensagem lista todas (CA-007);
- fora de producao -> nunca falha por essas variaveis (CA-005/CA-006).

### Seguranca (codigo-fonte, mesmo padrao de `audit-security-source.test.ts`)

- nenhuma chamada ao mecanismo de erro passa o **valor** de uma variavel
  de ambiente, apenas o nome (CA-008).

### Integracao / smoke

- processo real (`index.ts`) com `APP_ENV=production` e env incompleta sai
  com codigo de saida diferente de zero, sem chamar `app.listen()`
  (CA-010).

### Regressao

- suite completa de `tests/phase29/` permanece verde (CA-012).

## 14. Definition of Done (desta fatia)

- CA-001 a CA-013 implementados e comprovados por execucao real (nao apenas
  inspecao);
- `tsc --noEmit`, `eslint`, `prettier --check`, `npm run build` limpos;
- nenhuma variavel obrigatoria de producao sem passar pelo ponto unico de
  validacao;
- documentacao (`.env.example`, se necessario) atualizada para refletir
  quais variaveis sao "obrigatorias de producao" de forma centralizada.

**Isto NAO e o Release Candidate completo.** E apenas o item 8 (de 9) do
criterio de RC do ADR-0027 (secao 29): *"configuracao de producao validada
fail-fast"*. Os demais 8 itens (CI automatizado, deploy reproduzivel,
rollback testado, restore testado e evidenciado, observabilidade minima,
security headers/CORS, rate limiting adequado, staging exercitado com
Supabase Auth real) permanecem pendentes de suas proprias SPECs futuras, na
ordem recomendada por ADR-0027 secao 2.

## 15. Dependencias

- **ADR-0027** -- autoridade arquitetural desta SPEC (secoes 2 e 17).
- **Fase 29 / SPEC-028** (secao 37) -- `assertSupabaseAuthConfiguredForProduction`
  e o padrao ja testado que esta SPEC generaliza, nunca substitui.
- **Fase 1.1** -- `requirePostgresDatabaseUrl`, absorvido pelo mesmo
  mecanismo central.
- **Nenhuma dependencia em fases/sub-frentes futuras** -- e a primeira
  fatia da ordem do ADR-0027, nao depende de nenhuma das outras seis.
- **E pre-requisito logico (nao bloqueante) para as demais sub-frentes:**
  qualquer variavel de ambiente nova introduzida por CI/CD (secrets do
  GitHub Actions), observabilidade (DSN de error monitoring) ou
  backup/restore (credenciais de `pg_dump`) deveria, quando essas SPECs
  forem escritas, seguir o mesmo padrao de validacao centralizada criado
  aqui -- registrado como recomendacao, nao como bloqueio.

Nenhum ciclo de dependencia identificado.

## 16. Compatibilidade

Confirmado, secao a secao: `authorize()` (`core/authorization.ts`)
permanece sem nenhuma linha alterada; `CoreService` permanece sem nenhuma
linha alterada; `Membership`/SPEC-003 permanece sem nenhuma regra alterada;
`AccessGrant`/migration `0031` permanece imutavel; `AuthService`/
`SupabaseActorProvider`/`dev-auth.ts` (Fase 29) permanecem sem nenhuma
mudanca de comportamento -- esta SPEC apenas generaliza a VALIDACAO de
configuracao que os alimenta, nunca a logica de identidade/autorizacao em
si. Nenhuma migration historica (0001-0033) e tocada.

## 17. Fora do Escopo (reforco)

Reforcado explicitamente: as seis outras sub-frentes de ADR-0027 (CI/CD,
security headers, CORS, CSRF, observabilidade, logging, error monitoring,
health/readiness, backup, restore, disaster recovery, rate limiting
distribuido, E2E) -- cada uma exige SPEC propria futura. Tambem fora: SSO/
SAML, SCIM, login social, WebAuthn/passkeys, MFA (SPEC-028 secao 21), novas
funcionalidades de RH, billing, autosservico publico de Organization,
impersonation, advanced analytics/indicadores, autoscaling sofisticado,
multi-region ativo-ativo, zero-downtime avancado, SOC2/ISO, SIEM enterprise.

## 18. Impacto Fisico Futuro (conceitual, sem codigo nesta SPEC)

- `src/server/index.ts`: novo bloco de validacao centralizada, chamado
  antes de `createPostgresPool`/criacao de `authService`/`app.listen()`.
- Possivel novo modulo pequeno (nome a definir no plano tecnico, por
  exemplo `src/server/config-validation.ts`) ou extensao de
  `src/server/auth/config.ts` -- decisao de organizacao de arquivo fica
  para o plano tecnico, nao fixada aqui.
- `src/server/auth/config.ts`: `assertSupabaseAuthConfiguredForProduction`
  **chamada pelo** novo mecanismo, nunca removida nem duplicada (RN-007).
- `src/server/postgres.ts`: `requirePostgresDatabaseUrl` **chamada pelo**
  novo mecanismo da mesma forma.
- `.env.example`: comentario atualizado indicando de forma centralizada
  quais variaveis sao "obrigatorias de producao".
- **Zero nova dependencia externa** -- validacao manual explicita,
  nenhuma lib de schema validation (decisao ja fechada por ADR-0027
  secao 17).

## 19. Ambiguidades Restantes

Nao bloqueantes, deixadas para o plano tecnico ou aceitas como risco
conhecido:

- **Validacao de formato** (URL bem formada, JWT bem formado etc.) nao
  entra nesta v1 -- apenas presenca/nao-vazio e verificado. Se uma
  variavel estiver presente mas com valor invalido (ex. URL malformada),
  o erro so aparecera mais tarde, no ponto de uso real (comportamento
  identico ao de hoje). Registrado como melhoria futura possivel, nao
  como requisito desta v1.
- **`APP_ENV` ausente/indefinido cai no default `"development"`** (decisao
  ja tomada pela ADR-0003, Fase 1, nao revisada por esta SPEC): um deploy
  real em producao que esqueca de definir `APP_ENV=production`
  explicitamente nao ativaria este mecanismo, e o processo subiria com
  `dev-auth.ts` ativo em produção. **Este e um risco conhecido, nao
  resolvido pelo codigo desta SPEC** -- a mitigacao correta e operacional
  (garantir que todo processo de deploy real defina `APP_ENV=production`
  explicitamente), da alcada da sub-frente de CI/CD e do processo de
  release (ADR-0027 secoes 3 e 24), nao desta SPEC.
- **Visibilidade humana da falha de boot:** esta SPEC garante que o
  processo nao sobe mal configurado (protecao primaria), mas nao garante
  que um humano seja alertado ativamente -- isso depende da sub-frente de
  Observabilidade/error monitoring (ADR-0027 secoes 10-11), ainda sem
  SPEC propria. Mitigacao minima aceita nesta v1: a mensagem de erro vai
  para stderr/stdout do processo, capturavel por qualquer log basico do
  hosting/orquestrador, mesmo sem stack de observabilidade dedicada.
- Nome exato do novo modulo/funcao de validacao central: fica para o
  plano tecnico.

Nenhuma dessas ambiguidades foi resolvida por analogia, e nenhuma delas e
um conflito com o ADR-0027 (classificacao B da secao 20).

## 20. Revisao Destrutiva

20 cenarios atacados, adaptados ao dominio desta fatia (configuracao/
secrets):

| # | Cenario | Resultado |
|---|---|---|
| 1 | Falta `SUPABASE_SERVICE_ROLE_KEY` em producao | Falha o boot (CA-001) |
| 2 | Falta `VITE_SUPABASE_URL` em producao | Falha o boot (CA-002) |
| 3 | Falta `VITE_SUPABASE_ANON_KEY` em producao | Falha o boot, fechando o gap fisico da secao 3 (CA-003) |
| 4 | Falta `SUPABASE_DATABASE_URL` em producao | Falha o boot (CA-004) |
| 5 | Variavel presente mas string vazia/so espacos | Tratada como ausente (CA-011, RN-003) |
| 6 | Variavel presente mas malformada (URL invalida) | **Fora do escopo desta v1** -- registrado como ambiguidade (secao 19), nao como bug |
| 7 | `APP_ENV` nao definido, cai no default `"development"` em host real | **Risco conhecido, nao resolvido por esta SPEC** -- mitigacao operacional (secao 19) |
| 8 | Duas ou mais variaveis faltando simultaneamente | Mensagem lista todas, nao so a primeira (CA-007, RN-002) |
| 9 | Mensagem de erro vazando o valor de uma variavel | Proibido por RN-005/CA-008, testavel por codigo-fonte |
| 10 | Validacao rodando depois de alguma inicializacao parcial (ex. pool ja aberto) | Proibido -- deve rodar antes de tudo (CA-010, RN-001) |
| 11 | `TEST_DATABASE_URL` tratada como obrigatoria de producao | Nunca -- explicitamente fora da lista (secao 6) |
| 12 | `AI_API_KEY`/`AI_PROVIDER` exigidas mesmo com IA desabilitada | Nunca -- IA opcional por design (ADR-0016/0019), fora da lista (secao 6) |
| 13 | Novo desenvolvedor local sem `.env` completo | Nao afetado -- comportamento dev preservado (CA-005, RN-004) |
| 14 | Harness de teste automatizado herdando `APP_ENV=production` do ambiente | Nao afetado -- mecanismo so se aplica a `index.ts`, nunca a `createServer()` direto (RN-009) |
| 15 | Tentativa de desabilitar a validacao via env var (`SKIP_CONFIG_VALIDATION`) | Proibido -- lista nao configuravel externamente (CA-013, RN-006) |
| 16 | Variavel presente so em `.env.example` (nunca preenchida de verdade) | `.env.example` nunca e carregado em producao real -- comportamento ja correto hoje, sem mudanca |
| 17 | Erro de validacao engolido por `try/catch` generico no boot | Proibido -- mecanismo deve usar throw/`process.exit(1)` nao capturavel silenciosamente (RN-008) |
| 18 | Multiplas instancias, uma mal configurada | Cada processo valida seu proprio boot independentemente; a instancia mal configurada nunca sobe -- comportamento correto e esperado, nao e falha desta SPEC |
| 19 | Mecanismo novo quebra teste ja existente de `assertSupabaseAuthConfiguredForProduction` | Proibido -- mecanismo **absorve**, nunca duplica/substitui (CA-012, RN-007, INV-05) |
| 20 | Boot falha mas ninguem percebe (sem observabilidade ainda) | Risco conhecido aceito -- protecao primaria (processo nao sobe) e o suficiente para esta v1; alerta ativo depende de sub-frente futura (secao 19) |

Nenhuma contradicao bloqueante permanece sem correcao incorporada ao texto
final (todas as correcoes ja estao nas secoes 6 a 19 acima, nao apenas
citadas nesta tabela).

## 21. Conflitos Encontrados

Nenhum. Nenhum ponto desta SPEC exige algo contrario ao ADR-0027 --
verificado explicitamente contra as secoes 2, 17 e 29 do ADR. Os dois
riscos identificados na revisao destrutiva (cenarios 7 e 20) sao
classificados como **B -- ambiguidade da SPEC, resolvida dentro dela**
(riscos conhecidos, aceitos e documentados, mitigados operacionalmente por
sub-frentes/decisoes ja registradas em outro lugar), nunca como **C --
conflito com o ADR** nem **D -- decisao arquitetural ausente**. Nenhuma
reconciliacao do ADR-0027 e necessaria.

## 22. Verificacao contra ADR-0027

Confirmado, secao a secao: direcao global (ADR secao 1, "A refinada por D")
preservada -- nenhuma infraestrutura propria nova, nenhuma lib de schema
validation pesada (ADR secao 17, decisao explicita reaproveitada
integralmente aqui); fatiamento (ADR secao 2) respeitado -- esta SPEC cobre
exatamente e somente a sub-frente 1 da ordem recomendada; criterio de RC
(ADR secao 29, item 8) e o alvo desta SPEC, sem prometer os demais 8 itens;
compatibilidade com autenticacao (ADR secao 33) preservada -- nenhuma linha
de Supabase Auth/Membership/AccessGrant tocada; impacto em banco (ADR secao
32, "preferencia zero migration de dominio") respeitado -- nenhuma
migration criada.

## 23. Definicao de Concluido

Para esta tarefa documental:

- fontes obrigatorias lidas integralmente (secao 3);
- primeira fatia identificada a partir da ordem real do ADR-0027, nunca
  por analogia ou titulo generico (secao 1);
- gap fisico concreto documentado (`VITE_SUPABASE_ANON_KEY` sem validacao
  nomeada) e fechado normativamente (secoes 3, 6, CA-003);
- invariantes fechadas e numeradas (secao 5);
- escopo fechado sem absorver as demais seis sub-frentes do ADR-0027
  (secoes 2, 17);
- requisitos normativos verificaveis, nao apenas ferramentas (secao 7);
- criterios de aceite (secao 12) e testes obrigatorios futuros (secao 13)
  definidos;
- revisao destrutiva aplicada aos 20 cenarios exigidos, dois riscos
  conhecidos documentados, nenhuma contradicao bloqueante (secao 20);
- verificacao explicita contra ADR-0027, nenhum conflito, nenhuma
  reconciliacao necessaria (secoes 21-22);
- nenhum codigo, migration, banco ou teste executavel criado ou alterado;
- nenhuma Fase numerada formalizada;
- nenhum commit realizado.

Para implementacao futura:

- SPEC mantida aprovada antes do desenvolvimento;
- plano tecnico elaborado a partir das secoes 1 a 19;
- criterios de aceite implementados;
- testes obrigatorios implementados e passando;
- seguranca revisada (secao 9);
- documentacao dependente (BACKLOG, roadmap) atualizada;
- Fase numerada formalizada somente apos plano tecnico aprovado;
- commit realizado somente na fase apropriada.
