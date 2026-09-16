# SPEC-030 - Seguranca de Borda

**Status:** Aprovada
**Versao:** 1.0
**Fase:** 31
**Responsavel de negocio:** Thiago Sousa
**Dependencias:** ADR-0027 - Production Hardening / Prontidao Operacional, ADR-0026 - Autenticacao Real, SPEC-028 - Autenticacao Real (secao 9, "Sessao"), SPEC-029 - Configuracao e Segredos / Fail-Fast de Producao (Fase 30, ja implementada)
**Ultima atualizacao:** 2026-08-31

**Nota de revisao destrutiva (v1.0):** este documento nasce em v0.1 e e
atacado na mesma tarefa (secao 21). Nenhuma secao normativa abaixo permanece
sem que a revisao destrutiva tenha sido aplicada a ela; as correcoes ja
estao incorporadas ao texto das secoes 1 a 20.

## 1. Objetivo

Fechar a **segunda sub-frente** da ordem recomendada por ADR-0027 (secao 2,
item 2): normatizar security headers, CSP, CORS, CSRF por validacao de
Origin/Referer, a fronteira de confianca de proxy (`trust proxy`) e
`Cache-Control` para respostas sensiveis -- amplificando diretamente a
protecao que a Fase 29 (cookies HttpOnly de sessao) e a Fase 30 (fail-fast
de configuracao de producao) ja introduziram, sem reabrir nenhuma delas.

Esta SPEC nao e "Production Hardening" em geral -- e apenas a fatia que o
proprio ADR-0027 ordenou em segundo lugar, pelo motivo que ele mesmo
registra: _"baixo custo tecnico, amplifica diretamente a protecao que a
Fase 29 acabou de introduzir (cookies HttpOnly, sessao real)"_ (ADR-0027,
secao 2, item 2).

## 2. Fora do Escopo

Esta SPEC nao define nem implementa:

- codigo, migration, alteracao de banco, rotas ou UI executavel (esta e uma
  tarefa documental, como toda SPEC deste projeto);
- testes executaveis (apenas o catalogo, secao 13);
- instalacao de nenhuma dependencia (`helmet`, `cors` ou qualquer outra) --
  apenas previstas conceitualmente (secao 15);
- **nenhuma das outras cinco sub-frentes restantes de ADR-0027**: CI/CD
  (secao 3 do ADR), observabilidade/logging/error monitoring (secoes 10-11),
  backup/restore/DR (secoes 13-15), rate limiting distribuido (secao 9),
  E2E (secao 23) -- cada uma exige sua propria SPEC futura, na ordem ja
  recomendada pelo ADR;
- rate limiting em si (algoritmo, armazenamento, Redis) -- permanece
  exatamente `core/rate-limiter.ts` como esta; esta SPEC toca **somente** a
  fronteira de confianca do proxy que alimenta a chave (`request.ip`) que o
  rate limiter ja consome hoje, nunca o algoritmo/armazenamento em si;
- upload de arquivos/curriculo -- feature inexistente no produto hoje
  (verificado fisicamente, secao 3); quando existir, exige revisao propria;
- MFA (SPEC-028 secao 21), SSO/SAML, SCIM, login social, WebAuthn/passkeys,
  billing, autosservico publico de Organization, impersonation, advanced
  analytics, autoscaling, multi-region, SOC2/ISO, SIEM enterprise;
- nenhuma regra de negocio de nenhum dominio (Membership, AccessGrant,
  Employment, Offboarding, candidatos, vagas, entrevistas, propostas,
  onboarding, desenvolvimento/retencao) -- Seguranca de Borda e transversal
  HTTP, nunca dominio;
- escolha final de hosting/topologia de producao -- **fora do controle desta
  SPEC** (ADR-0027 secao 4: "Hosting especifico: nao decidido nesta ADR");
  esta SPEC define os invariantes seguros para os modos conceituais
  possiveis (secao 6), nunca escolhe um hosting especifico;
- alteracao de ADR-0027, ADR-0026, SPEC-028, SPEC-029, `authorize()`,
  `Membership`, `AccessGrant`, `AuthService`, `dev-auth.ts`, cookies de
  sessao (`http/cookies.ts`) ou qualquer migration historica;
- alteracao de BACKLOG ou roadmap.

## 3. Fontes Obrigatorias e Evidencias

Lidas integralmente antes da redacao: `CONSTITUICAO_DO_PROJETO.md`,
`AGENTS.md`, ADR-0027 (integral), ADR-0026, SPEC-028 (secao 9, "Sessao"),
SPEC-029 (integral, para preservar a fronteira com a Fase 30 ja
implementada), `docs/04-seguranca/constituicao-seguranca.md`,
`src/server/app.ts`, `src/server/http/routes.ts`,
`src/server/http/cookies.ts`, `src/server/http/actor-provider.ts`,
`src/server/core/rate-limiter.ts`, `src/client/apiClient.ts`,
`src/client/supabaseClient.ts`, `src/client/LoginScreen.tsx`,
`src/client/AcceptInvitePage.tsx`, `vite.config.ts`, `index.html`,
`package.json`.

Evidencia fisica confirmada nesta tarefa (nao apenas por inspecao
documental, revalidada no momento da redacao):

- **Autenticacao Membership/Platform Admin = cookie-only.**
  `SupabaseActorProvider.resolve()` (`http/actor-provider.ts:29-40`) le
  exclusivamente `readSessionCookies()`; nunca um header `Authorization`.
- **Cookies:** `sb_at`/`sb_rt`, `HttpOnly`, `SameSite=Lax`, `Path=/api`,
  host-only (sem `Domain`), `Secure` condicionado a `isProductionEnv`
  (`http/cookies.ts`) -- ja testado (SPEC-028 secao 9, `CA-006`).
- **Frontend forca `credentials:"include"` globalmente:**
  `apiClient.ts:installCredentialedFetch()` faz monkey-patch de
  `window.fetch` uma vez no boot (`main.tsx`), aplicando a ~150 call-sites
  de uma vez.
- **Browser fala diretamente com Supabase Auth:** `supabaseClient.ts` usa
  `@supabase/supabase-js` com `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`
  (frontend-safe por design, Fase 29); `persistSession:false`.
- **CORS: zero configuracao existe** -- nenhum pacote `cors`, nenhum header
  `Access-Control-*` emitido por nenhum caminho de codigo.
- **Security middleware: zero existe** -- nenhuma referencia a `helmet`,
  CSP, HSTS, `X-Frame-Options` em `app.ts`/`index.ts`/`routes.ts`.
- **`trust proxy`: zero configuracao existe** -- nenhuma ocorrencia em todo
  `src/`.
- **`request.ip` ja e usado hoje, sem `trust proxy`,** como chave de rate
  limiting **e** de hash de auditoria, em 4 dominios publicos:
  `behavioral-assessments/service.ts:1516`,
  `public-applications/service.ts:287`, `pre-interviews/service.ts:903`,
  `proposals/service.ts:506,544,850` (todas via `request.ip` passado a
  partir de `routes.ts`, 12 ocorrencias diretas ali).
- **PUT e DELETE reais existem hoje** -- 9 rotas confirmadas
  (`grep -c "router\.put(\|router\.delete("` em `routes.ts` = 9), incluindo
  configuracoes de pre-entrevista/avaliacao comportamental e provedores de
  IA. Isso diverge da premissa fisica registrada por ADR-0027 secao 7
  (_"a API nao usa PUT/DELETE em nenhuma rota existente"_) -- tratado na
  secao 20 desta SPEC, nunca escondido.
- **`express.json({limit:"256kb"})`** e o unico body parser ativo
  (`app.ts:73`); sem `urlencoded`, sem multipart -- nenhum upload existe.
- **`Cache-Control: no-store`** ja existe, mas **restrito** as rotas
  publicas token-based (pre-entrevista/avaliacao/proposta -- 11 ocorrencias
  em `routes.ts`); a maioria das rotas Membership/Platform Admin (a
  totalidade das demais rotas autenticadas por cookie) nao define nenhum
  `Cache-Control`.
- **Topologia de producao ainda nao concretamente definida:**
  `vite.config.ts` nao tem `server.proxy`; frontend (`:5173`) e API
  (`:3001`) rodam em portas/origens distintas em desenvolvimento sem
  mecanismo de unificacao configurado; Express nunca serve `dist/`
  (`express.static` inexistente em todo `src/server`); `APP_URL`
  (`.env.example`) nunca e lido em nenhum lugar do codigo.

## 4. Definicao do Problema

**Pergunta central:** como fechar a superficie de risco HTTP/borda que a
Fase 29 abriu (sessao real, cookies HttpOnly, usuarios reais possiveis a
qualquer momento) -- security headers ausentes, CORS ausente, CSRF sem
segunda camada, fronteira de proxy indefinida, cache de dados sensiveis nao
controlado -- sem depender de uma decisao de hosting que ainda nao foi
tomada, e sem reabrir nenhuma regra de autenticacao/autorizacao ja fechada?

Quem e afetado: qualquer usuario real (Membership ou Platform Admin) cuja
sessao passa a existir de verdade desde a Fase 29; qualquer candidato que
usa um link publico token-based; qualquer operador que decidir a topologia
de hosting no futuro. O que significa "pronto": a aplicacao aplica a
mesma baseline de headers em producao/staging, nunca depende de wildcard
como substituto de decisao de origem, nunca confia cegamente em
`X-Forwarded-For`, e a validacao de Origin/Referer entra em producao **no
mesmo deploy ou antes** de qualquer CORS credenciado, nunca depois. Por que
isso e requisito de Release Candidate: e o item 6 do criterio de RC do
ADR-0027 (secao 29): _"security headers + CORS configurados e
verificados"_. Se nao for implementado: a sessao real introduzida pela
Fase 29 fica sem a segunda camada de defesa que a propria Fase 29 ja
antecipava (SameSite=Lax mitiga a maior parte, mas nao cobre 100% dos
casos), e a aplicacao fica sem nenhuma baseline de headers contra clickjacking/
MIME sniffing/vazamento de referrer, exatamente no momento em que sessoes
reais passam a existir.

## 5. Invariantes Fundamentais

- **INV-01:** nenhuma decisao desta SPEC reabre `authorize()`
  (`core/authorization.ts`), `Membership`, `AccessGrant`, `AuthService`,
  `SupabaseActorProvider`, `dev-auth.ts` ou qualquer contrato de cookie ja
  testado pela Fase 29 -- Seguranca de Borda atua exclusivamente na camada
  HTTP/transporte, nunca no modelo de identidade/autorizacao.
- **INV-02:** CORS habilitado com credenciais nunca coexiste com
  `Access-Control-Allow-Origin: *` -- combinacao fisicamente impossivel de
  configurar corretamente, sem excecao.
- **INV-03:** a validacao de Origin/Referer para mutacoes cookie-
  autenticadas (secao 7.4) precisa estar ativa e comprovada por teste
  **antes ou no mesmo deploy** em que qualquer CORS credenciado for
  habilitado para uma origem que nao seja a propria aplicacao -- nunca
  depois (motivo: a ausencia de CORS hoje bloqueia acidentalmente qualquer
  fetch cross-origin com corpo JSON via preflight; habilitar CORS remove
  essa barreira acidental para a origem permitida).
- **INV-04:** nenhuma politica desta SPEC (headers, CSP, CORS, trust proxy)
  e ativada por default apenas porque uma biblioteca (`helmet` ou outra) a
  habilita por padrao -- toda politica e configurada conscientemente
  (ADR-0027 secao 6/14, mesma disciplina ja aplicada a `helmet` la).
- **INV-05:** `trust proxy` nunca e configurado como `true` generico -- a
  fronteira de proxies confiaveis e sempre explicita, condicionada a
  topologia real de hosting no momento da implementacao.
- **INV-06:** os metodos HTTP anunciados por CORS (quando habilitado)
  refletem sempre o inventario real de verbos usados pela API, revisado no
  momento da implementacao -- nunca uma lista desatualizada ou copiada por
  conveniencia (fecha a divergencia da secao 20).

## 6. Escopo Normativo -- Topologia e Modos de Operacao

A topologia fisica de producao (mesma origem vs. origens distintas) **nao
esta concretamente definida** hoje (secao 3). Esta SPEC nao escolhe
arbitrariamente entre elas -- define os invariantes seguros para os dois
modos conceituais abaixo, de forma que a implementacao futura consiga
operar em qualquer um deles **trocando apenas configuracao, nunca regra de
negocio**:

- **Modo A -- same-origin:** frontend e API apresentados ao navegador sob
  origem compativel (por exemplo, reverse proxy unificando ambos, ou
  Express servindo o build estatico). CORS credenciado pode ficar
  **desabilitado** -- nenhuma requisicao da propria aplicacao e
  cross-origin. A validacao de Origin/Referer (secao 7.4) continua ativa
  como defesa em profundidade para mutacoes cookie-autenticadas, mesmo sem
  CORS.
- **Modo B -- cross-origin autorizado:** frontend e API em origens
  distintas (por exemplo, frontend em CDN/hosting estatico separado da
  API). CORS exige allowlist explicita (secao 7.2), `credentials:true`
  apenas para a(s) origem(ns) exata(s) configurada(s), preflight tratado
  explicitamente (secao 7.6), e a validacao de Origin/Referer (secao 7.4)
  **obrigatoriamente ativa antes ou junto** (INV-03).

A configuracao que decide entre os dois modos (lista de origens permitidas,
vazia ou nao) e tratada na secao 11, nunca fixada nesta SPEC como um valor
hardcoded.

**Matriz de classes de rota** (usada por toda a secao 7):

| Classe                                 | Exemplo                                                                                                                   | Autenticacao                                                                         | CORS aplica?                      | CSRF (Origin/Referer) aplica?                                                                      | `Cache-Control`                          |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| A -- Liveness                          | `GET /api/health`                                                                                                         | nenhuma                                                                              | Sim, se CORS habilitado (leitura) | Nao                                                                                                | Comportamento atual preservado           |
| B -- Portal publico (leitura)          | `GET /public/job-openings/:slug`                                                                                          | nenhuma                                                                              | Sim, se CORS habilitado           | Nao                                                                                                | A definir pela implementacao (cacheavel) |
| C -- Publica sem cookie (escrita)      | `POST /public/job-openings/:slug/applications`                                                                            | nenhuma                                                                              | Sim, se CORS habilitado           | Nao (sem cookie, sem sessao a proteger)                                                            | `no-store` recomendado                   |
| D -- Publica token-based               | `PUT /public/pre-interviews/responses/:id`, `POST /public/behavioral-assessments/submit`, `POST /public/proposals/accept` | `Authorization: <Scheme> <token>` dedicado, nunca cookie                             | Sim, se CORS habilitado           | Nao (sem cookie, token nao e enviado automaticamente pelo browser)                                 | `no-store` (ja existe, preservado)       |
| E -- Membership cookie-autenticada     | `GET/POST/PATCH/PUT/DELETE /organizations/:id/...`                                                                        | cookie de sessao (`sb_at`)                                                           | Sim, se CORS habilitado           | **Sim**, em toda mutacao                                                                           | `no-store` (novo, secao 7.7)             |
| F -- Platform Admin cookie-autenticada | `POST /platform/organizations/bootstrap`, `POST /platform/sessions/:userId/revoke`                                        | cookie de sessao + Platform Admin                                                    | Sim, se CORS habilitado           | **Sim**, em toda mutacao                                                                           | `no-store`                               |
| G -- Bootstrap de sessao/convite       | `POST /auth/session`, `POST /auth/refresh`, `POST /auth/logout`, `POST /auth/invitations/:id/accept`                      | publica por definicao (SPEC-028 secao 9/23) ou cookie de refresh, nunca Actor previo | Sim, se CORS habilitado           | **Sim**, exceto onde a propria natureza do endpoint tornaria a checagem circular (ver secao 7.4.1) | `no-store`                               |

## 7. Requisitos Normativos

### 7.1 Security Headers (baseline, todas as respostas de `/api`)

- **RN-001:** toda resposta de `/api`, em `staging`/`production`, contem
  `X-Content-Type-Options: nosniff`.
- **RN-002:** toda resposta de `/api`, em `staging`/`production`, contem
  protecao de framing: `Content-Security-Policy: frame-ancestors 'none'`
  **e** `X-Frame-Options: DENY` como compatibilidade (nenhum caso legitimo
  de embedding em iframe foi encontrado nesta investigacao -- secao 3).
- **RN-003:** toda resposta de `/api`, em `staging`/`production`, contem
  `Referrer-Policy: strict-origin-when-cross-origin`.
- **RN-004:** toda resposta de `/api`, em `staging`/`production`, contem
  `Permissions-Policy` negando no minimo `camera=()`, `microphone=()`,
  `geolocation=()` -- nenhum desses recursos e usado pelo produto hoje
  (confirmado fisicamente, secao 3). A lista pode crescer no plano tecnico
  se o inventario mudar; nunca diminui sem nova evidencia fisica.
- **RN-005:** nenhum destes headers (RN-001 a RN-004) e enviado em
  `development` de forma que quebre o servidor de desenvolvimento Vite/HMR
  -- mesmo padrao ja usado para o cookie `Secure` (`isProductionEnv`).
- **RN-006:** em `test`, o harness de testes automatizados nunca sobe
  `index.ts` real (mesma garantia ja estabelecida por SPEC-029 RN-009) --
  estes headers nunca sao exercitados fora de uma instancia real do
  processo.

### 7.2 HSTS

- **RN-007:** `Strict-Transport-Security` e enviado somente quando
  `isProductionEnv` for verdadeiro -- nunca em `development`, nunca em
  `test`.
- **RN-008:** o valor de `max-age` e conservador e reversivel (referencia:
  180 dias) **sem** `includeSubDomains` **sem** `preload` nesta v1 --
  decisao explicita, nao ambigua, justificada pela ausencia de topologia de
  subdominios conhecida (secao 3/6). Ampliar exige evidencia fisica futura
  de topologia que o justifique, registrada no plano tecnico correspondente.
- **RN-009:** HSTS nunca depende de `req.secure` como unica fonte de
  verdade -- depende exclusivamente de `isProductionEnv` (mesmo padrao de
  RN-007), independente de a topologia de proxy estar ou nao configurada
  (secao 7.5).

### 7.3 CSP

- **RN-010:** a CSP de `production`/`staging` e enviada somente quando
  `isProductionEnv` for verdadeiro -- nunca em `development` (Vite injeta
  script/style inline para HMR; aplicar CSP de producao cegamente quebraria
  o servidor de desenvolvimento).
- **RN-011:** `script-src` e `style-src` da CSP de producao sao `'self'`,
  sem `'unsafe-inline'`/`'unsafe-eval'` -- consistente com o build de
  producao do Vite, que nao emite nenhum script/estilo inline (confirmado
  fisicamente, secao 3).
- **RN-012:** `connect-src` da CSP de producao inclui `'self'` **e** a
  origem real do projeto Supabase configurado, derivada de
  `VITE_SUPABASE_URL` no momento do build/boot -- nunca um `project-ref`
  fixo/ficticio hardcoded no codigo ou nesta SPEC.
- **RN-013:** `frame-ancestors` da CSP e `'none'` (RN-002).
- **RN-014:** `object-src` e `'none'`; `base-uri` e `'self'`; `form-action`
  e `'self'` -- nenhum uso de plugin/embed/form HTML nativo apontando para
  terceiros foi encontrado (secao 3).
- **RN-015:** `img-src` e `font-src` sao `'self'` -- nenhuma imagem/fonte
  externa foi encontrada nesta investigacao; se uma necessidade real surgir
  no futuro, exige atualizacao consciente desta politica, nunca
  `'unsafe-inline'`/wildcard por conveniencia.

### 7.4 CSRF -- Validacao de Origin/Referer

- **RN-016:** toda mutacao (`POST`/`PUT`/`PATCH`/`DELETE`) das classes E e
  F (Membership e Platform Admin cookie-autenticadas, secao 6) valida
  `Origin` -- ou, na ausencia de `Origin`, `Referer` -- contra a origem
  configurada (secao 11) antes de processar qualquer efeito colateral.
- **RN-017:** esta validacao **nunca** se aplica as classes A, B, C e D da
  matriz (secao 6) -- rotas sem cookie de sessao nao tem CSRF a proteger.
- **RN-018:** `Origin` presente e hostil (fora da origem configurada) =
  requisicao rejeitada, sem nenhum efeito colateral.
- **RN-019:** `Origin: null` e tratado como hostil -- nunca entra
  automaticamente na configuracao permitida.
- **RN-020:** na ausencia de `Origin`, a validacao extrai apenas o
  componente de origem de `Referer` e aplica a mesma regra de RN-018.
- **RN-021:** ausencia simultanea de `Origin` e `Referer` em mutacao das
  classes E/F = requisicao rejeitada por padrao (**fail-closed**) --
  decisao explicita: a API atual e consumida por uma SPA propria com
  autenticacao cookie-only para essas classes; nenhum cliente legitimo
  identificado nesta investigacao precisa operar sem nenhum dos dois
  headers. Uma excecao futura exige evidencia fisica de um cliente
  legitimo real, registrada no plano tecnico correspondente -- nunca
  assumida por esta SPEC.
- **RN-022 (INV-03):** a implementacao de RN-016 a RN-021 precisa estar
  ativa e comprovada por teste **antes ou no mesmo deploy** em que qualquer
  CORS credenciado (Modo B, secao 6) for habilitado para uma origem
  externa -- nunca depois.

#### 7.4.1 Excecao estrutural das rotas de bootstrap de sessao (classe G)

- **RN-023:** `POST /auth/session` (verifica um token recebido do
  provider, ainda sem cookie previo) e `POST /auth/invitations/:id/accept`
  (le o cookie de sessao ja emitido, mas ainda nao pertence a uma
  Organization) continuam validando `Origin`/`Referer` pela mesma regra de
  RN-016 -- nao ha razao fisica para exceptua-las: ambas ja recebem
  requisicoes exclusivamente da propria SPA (`LoginScreen.tsx`,
  `AcceptInvitePage.tsx`, ambas usando `fetch` relativo/mesma origem).
  Nenhuma excecao estrutural e criada por esta SPEC para a classe G.

### 7.5 Trust Proxy e `request.ip`

- **RN-024 (INV-05):** `trust proxy` do Express e configurado
  explicitamente de acordo com a topologia real de hosting no momento da
  implementacao -- nunca `true` generico/permissivo, nunca deixado
  implicitamente desabilitado se a topologia real envolver um proxy/load
  balancer entre o cliente e o processo Node.
- **RN-025:** quando a topologia nao envolver proxy (conexao direta),
  `trust proxy` permanece desabilitado (default do Express) e
  `request.ip` continua refletindo o socket remoto real -- comportamento
  atual preservado nesse modo.
- **RN-026:** quando a topologia envolver proxy, `trust proxy` e
  configurado com o numero de hops ou a faixa de IPs confiavel exata dessa
  topologia -- `request.ip`/`X-Forwarded-For` so sao confiados dentro dessa
  fronteira; um cliente conectando diretamente (fora da fronteira
  confiavel) nunca consegue fazer o valor que ele mesmo envia em
  `X-Forwarded-For` ser aceito como seu proprio IP.
- **RN-027:** os 4 pontos de consumo de `request.ip` ja existentes hoje
  (rate limiting e hash de auditoria em `behavioral-assessments`,
  `public-applications`, `pre-interviews`, `proposals`, todos alimentados a
  partir de `routes.ts`) continuam recebendo o mesmo valor de `request.ip`
  -- esta SPEC nao altera nenhuma linha desses 4 modulos nem o algoritmo do
  `RateLimiter`, apenas garante que o valor que chega a eles seja confiavel
  de acordo com RN-024 a RN-026.

### 7.6 CORS

- **RN-028 (INV-06):** quando CORS estiver habilitado (Modo B, secao 6),
  `Access-Control-Allow-Methods` reflete o inventario real de verbos
  usados pela API no momento da implementacao -- **no minimo** `GET`,
  `POST`, `PATCH`, `PUT`, `DELETE` (confirmado fisicamente, secao 3);
  revisado a cada mudanca real de inventario, nunca copiado de premissa
  desatualizada (fecha a divergencia da secao 20).
- **RN-029:** `Access-Control-Allow-Headers` reflete os headers realmente
  enviados pelo frontend: `Content-Type`, `Idempotency-Key`,
  `Authorization` (usado pelas rotas token-based da classe D) -- nunca um
  wildcard.
- **RN-030 (INV-02):** a aplicacao nunca responde
  `Access-Control-Allow-Origin: *` combinado com
  `Access-Control-Allow-Credentials: true` -- fisicamente impossivel de
  configurar corretamente em qualquer ambiente.
- **RN-031:** a origem de uma requisicao e comparada por **igualdade
  exata** contra a lista explicita configurada (secao 11) -- nunca por
  prefixo, sufixo, substring ou regex permissiva.
- **RN-032:** `Access-Control-Allow-Credentials: true` so e enviado quando
  a origem da requisicao corresponde exatamente a uma entrada da lista
  configurada.
- **RN-033:** a aplicacao opera corretamente com a lista de origens CORS
  vazia/desabilitada (Modo A, same-origin, secao 6) sem exigir nenhuma
  mudanca de regra de negocio -- habilitar/desabilitar CORS e puramente
  configuracao (secao 11).
- **RN-034:** requisicoes `OPTIONS` (preflight) nunca exigem
  `actorProvider.resolve()`, nunca criam sessao, nunca alteram estado,
  nunca geram evento de auditoria de negocio -- independente de a origem
  ser ou nao autorizada.
- **RN-035:** uma origem nao autorizada que envia `OPTIONS` nunca recebe
  `Access-Control-Allow-Origin` correspondente a ela (ausente ou
  incorreto) -- o preflight falha de forma que o browser bloqueia a
  requisicao real subsequente.

### 7.7 `Cache-Control`

- **RN-036:** toda resposta das classes E e F (Membership e Platform Admin
  cookie-autenticadas) contem `Cache-Control: no-store`, aplicado por
  classe/router -- nunca repetido chamada por chamada como hoje ocorre
  apenas nas rotas publicas token-based.
- **RN-037:** os `Cache-Control: no-store` ja existentes nas rotas publicas
  token-based (classe D) sao preservados sem alteracao.
- **RN-038:** `GET /api/health` (classe A) mantem seu comportamento de
  cache atual -- nao e uma resposta sensivel, nao exige `no-store`.
- **RN-039:** assets estaticos versionados do build do frontend (servidos
  fora do Express, decisao de hosting fora desta SPEC) nunca recebem
  `no-store` por forca desta SPEC -- cache agressivo neles e aceitavel e
  decisao de hosting.

### 7.8 Preservacao (nenhuma mudanca de comportamento)

- **RN-040:** o error handler global continua sem expor stack
  trace/detalhe interno em nenhuma resposta, em nenhum ambiente --
  comportamento ja correto (`app.ts`), preservado sem alteracao.
- **RN-041:** `express.json({limit:"256kb"})` e preservado sem alteracao --
  nenhum aumento/reducao de limite sem evidencia fisica nova.
- **RN-042:** os cookies de sessao (`sb_at`/`sb_rt`) preservam exatamente
  `HttpOnly`, `SameSite=Lax`, host-only (sem `Domain`), `Path=/api`,
  `Max-Age` ja existente -- nenhuma linha de `http/cookies.ts` e alterada
  por esta SPEC alem, possivelmente, de como `secure` e calculado (RN-043),
  nunca do contrato publico das funcoes.
- **RN-043:** `secure` dos cookies permanece `true` sempre que
  `isProductionEnv` for verdadeiro, incluindo um ambiente `staging` quando
  este existir fisicamente com TLS -- nunca `false` fora de
  `development` local sobre HTTP puro (`127.0.0.1`).
- **RN-044:** nenhuma linha de `auth/service.ts`, `auth/config.ts`,
  `http/actor-provider.ts`, `core/authorization.ts`, `Membership` ou
  `AccessGrant` e alterada por esta SPEC.

### 7.9 Configuracao (fail-fast, reaproveitando a Fase 30)

- **RN-045:** quando a topologia real de producao/staging exigir CORS
  habilitado (Modo B) ou `trust proxy` configurado, a(s) origem(ns)
  permitida(s) e/ou a topologia de proxy confiavel sao **configuracao
  obrigatoria fail-fast** -- o processo real (`index.ts`) nao sobe
  parcialmente configurado nesse cenario, seguindo exatamente o mesmo
  principio ja estabelecido por SPEC-029/Fase 30 (ponto unico de validacao
  no boot). Esta SPEC **reaproveita** esse mecanismo ja existente
  (`assertProductionConfig`), nunca introduz um segundo mecanismo paralelo
  de validacao de configuracao.
- **RN-046:** quando a topologia real for same-origin (Modo A) e nem CORS
  nem `trust proxy` forem exigidos, a ausencia dessa configuracao **nao**
  impede o boot -- fail-fast se aplica somente ao que a topologia realmente
  exige, nunca a um valor obrigatorio universal artificial.
- **RN-047:** esta SPEC nao cria nenhuma migration -- nenhuma
  tabela/coluna nova, nenhuma alteracao de schema (SPEC-030 e puramente
  configuracao/middleware HTTP).

## 8. Ambientes

- **development:** RN-005/RN-007/RN-010 garantem que nenhum header de
  producao (CSP/HSTS) e enviado de forma que quebre o Vite dev
  server/HMR. Cookies permanecem `secure:false` (comportamento ja
  existente, preservado). CORS/trust proxy nao se aplicam (topologia de
  dev nao usa proxy real).
- **test/CI:** identico a hoje -- o harness de testes automatizados nunca
  sobe `index.ts` real (RN-006, mesma garantia de SPEC-029 RN-009), entao
  nunca e afetado por nenhum header/CORS/CSRF desta SPEC diretamente;
  testes de integracao futuros que exercitem esses mecanismos o fazem via
  spawn do entrypoint real ou via Supertest sobre `createServer()`
  diretamente, nunca inferindo comportamento por analogia.
- **staging/homologacao:** quando existir fisicamente (pre-requisito de RC,
  ADR-0027 secao 4/25), aplica **exatamente** a mesma politica de
  production -- mesmos headers, mesma CSP, mesmo CORS/trust proxy conforme
  sua topologia real, `secure:true` nos cookies. Nunca uma politica
  "relaxada so porque e staging" (mesmo principio ja usado por SPEC-029
  para o gate de configuracao).
- **production:** baseline completa de headers (RN-001 a RN-004), HSTS
  (RN-007 a RN-009), CSP (RN-010 a RN-015), CORS conforme Modo A ou B
  (secao 6), CSRF por Origin/Referer sempre ativo nas classes E/F
  (RN-016 a RN-023), trust proxy conforme topologia real (RN-024 a
  RN-027), `Cache-Control: no-store` nas classes E/F/G (RN-036).

## 9. Seguranca

Riscos aplicaveis a esta fatia (borda HTTP):

- **CSRF via formulario HTML tradicional cross-site:** mitigado por
  `SameSite=Lax` (ja existente, Fase 29) **mais** validacao de
  Origin/Referer (RN-016 a RN-023) como segunda camada -- cobre o caso que
  `SameSite=Lax` sozinho nao cobre.
- **CORS mal configurado remover protecao acidental:** mitigado por
  INV-03/RN-022 -- Origin/Referer entra antes ou junto de qualquer CORS
  credenciado, nunca depois.
- **`request.ip` colapsado/spoofado atras de proxy:** mitigado por
  RN-024 a RN-027 -- fronteira de confianca explicita, nunca `true`
  generico.
- **Vazamento de dado pessoal via cache intermediario/browser:** mitigado
  por RN-036 -- `no-store` nas classes E/F.
- **Clickjacking:** mitigado por RN-002 (`frame-ancestors 'none'` +
  `X-Frame-Options: DENY`).
- **MIME sniffing:** mitigado por RN-001 (`nosniff`).
- **Vazamento de path/query via `Referer` cross-origin:** mitigado por
  RN-003 (`strict-origin-when-cross-origin`) -- ja reforcado pelo fato de
  que os unicos tokens reais de acesso (pre-entrevista, avaliacao
  comportamental) trafegam por fragmento de URL (nunca enviado em
  `Referer`), confirmado fisicamente (secao 3/20).
- **CSP mal configurada quebrar login:** mitigado por RN-012
  (`connect-src` inclui explicitamente o dominio Supabase real).

## 10. Falhas

**Fail-closed para CSRF (RN-021), fail-closed para CORS nao configurado
(ausencia de origem = sem `Access-Control-Allow-Origin`, RN-035), fail-fast
para configuracao de topologia quando exigida (RN-045).** Nao existe modo
"fail-open" nesta subfrente -- ao contrario do rate limiting (ADR-0027
secao 9, fora do escopo aqui), onde fail-open e aceitavel para endpoints
publicos de baixo risco, headers/CORS/CSRF sao sempre aplicados de forma
determinista: uma requisicao que nao pode ser validada como legitima nunca
e tratada como legitima por omissao.

## 11. Configuracao Necessaria (conceitual, nomes finais no plano tecnico)

Sem inventar nomes de variavel de ambiente nesta tarefa (fica para o plano
tecnico, mesma disciplina de SPEC-029 secao 18):

- **Origem(ns) de frontend permitida(s)** para CORS (Modo B) -- lista
  explicita por ambiente; vazia/ausente = Modo A (same-origin, CORS
  credenciado desabilitado). Reaproveita o ponto unico de validacao
  fail-fast ja existente (`assertProductionConfig`, SPEC-029) quando a
  topologia exigir essa configuracao (RN-045).
- **Topologia/fronteira de `trust proxy`** -- numero de hops ou faixa de
  IPs confiavel, definida apenas quando a topologia real envolver
  proxy/load balancer (RN-024 a RN-026).
- **Origem canonica do Supabase Auth para `connect-src`** -- ja derivavel
  de `VITE_SUPABASE_URL`, existente desde a Fase 29; nenhuma variavel nova
  necessaria para isso especificamente.
- **Indicacao explicita do modo (Modo A/B, secao 6)** -- pode ser inferida
  diretamente da presenca/ausencia da lista de origens CORS (primeiro
  item acima), sem necessidade de uma variavel dedicada adicional; decisao
  final de nomenclatura no plano tecnico.

## 12. Rotas Publicas (matriz de aplicabilidade)

Ja detalhado na tabela da secao 6. Reforcado: nenhuma rota publica das
classes A/B/C/D se torna privada, nenhuma rota Membership/Platform Admin
(E/F) se torna publica -- esta SPEC nunca altera autorizacao, apenas a
camada de transporte ao redor dela.

## 13. Testes Obrigatorios Futuros

Nao implementados nesta tarefa -- catalogo para o plano tecnico:

### Headers / CSP / HSTS

- presenca e valor exato de cada header (RN-001 a RN-015) em
  `production`/`staging` (Supertest);
- ausencia de CSP/HSTS em `development` (nao quebra Vite);
- CSP permite conexao ao Supabase configurado (RN-012);
- CSP bloqueia script inline nao autorizado.

### CORS

- origem permitida recebe `Access-Control-Allow-Origin` exata;
- origem hostil nunca recebe autorizacao;
- `null`/prefixo/sufixo semelhante nunca autorizados (RN-031);
- wildcard+credentials impossivel de configurar (teste negativo/estrutural,
  RN-030);
- preflight `OPTIONS` de origem permitida nao exige Actor (RN-034);
- preflight `OPTIONS` de origem hostil nao recebe autorizacao (RN-035);
- metodos anunciados incluem PUT/DELETE reais (RN-028).

### CSRF (Origin/Referer)

- mutacao classe E/F com Origin valido -> processada;
- mutacao classe E/F com Origin hostil -> rejeitada, sem efeito colateral;
- mutacao classe E/F com `Origin: null` -> rejeitada;
- mutacao classe E/F sem Origin, com Referer valido -> processada
  (fallback);
- mutacao classe E/F sem Origin e sem Referer -> rejeitada (RN-021);
- classes A/B/C/D nunca exigem Origin/Referer (RN-017);
- `/auth/session`, `/auth/refresh`, `/auth/logout`,
  `/auth/invitations/:id/accept`, `/platform/organizations/bootstrap`
  continuam funcionando com Origin valido da propria SPA.

### Trust Proxy

- sem `trust proxy`, `request.ip` reflete o socket direto;
- com `trust proxy` configurado, `X-Forwarded-For` dentro da fronteira e
  aceito;
- `X-Forwarded-For` forjado por cliente fora da fronteira nunca e aceito.

### Cache-Control

- classes E/F retornam `no-store`;
- classes D mantem `no-store` ja existente;
- `/api/health` (classe A) nao regressiona.

### Regressao

- suite completa de `tests/phase29/` (Autenticacao Real) permanece verde,
  sem nenhuma modificacao de arquivo de teste (CA-038);
- suite completa de `tests/phase30/` (Fail-Fast de Configuracao) permanece
  verde, sem nenhuma modificacao de arquivo de teste (CA-039);
- 500 continua sem stack trace (RN-040); `express.json` continua limitando
  em 256kb (RN-041).

**Fora do escopo dos testes futuros desta SPEC:** E2E de browser real --
todo o catalogo acima e alcancavel via Supertest/spawn do entrypoint real,
mesmo padrao ja usado por `tests/phase30/bootstrap-smoke.test.ts`. E2E
minimo continua sub-frente propria e futura do ADR-0027 (secao 23),
independente desta SPEC.

## 14. Definition of Done (desta fatia)

- RN-001 a RN-047 implementados e comprovados por execucao real (nao
  apenas inspecao);
- CA-001 a CA-040 (secao 15... nota: ver secao 16) comprovados;
- `tsc --noEmit`, `eslint`, `prettier --check`, `npm run build` limpos;
- `tests/phase29/` e `tests/phase30/` verdes, sem nenhuma modificacao de
  arquivo de teste existente;
- nenhuma migration criada;
- nenhuma regra de negocio de nenhum dominio alterada.

**Isto NAO e o Release Candidate completo.** E apenas o item 6 (de 9) do
criterio de RC do ADR-0027 (secao 29): _"security headers + CORS
configurados e verificados"_. Os demais 8 itens (CI automatizado, deploy
reproduzivel, rollback testado, restore testado e evidenciado,
observabilidade minima, rate limiting adequado, configuracao fail-fast --
ja fechado pela Fase 30 --, staging exercitado com Supabase Auth real)
permanecem pendentes de suas proprias SPECs futuras (exceto o item ja
fechado), na ordem recomendada por ADR-0027 secao 2.

## 15. Criterios de Aceite

- **CA-001:** em producao, resposta de rota `/api` contem
  `X-Content-Type-Options: nosniff`, `Referrer-Policy:
strict-origin-when-cross-origin`, `Permissions-Policy` negando
  camera/microfone/geolocalizacao, e protecao de framing (`frame-ancestors
'none'` + `X-Frame-Options: DENY`).
- **CA-002:** em staging (quando existir fisicamente com TLS), os mesmos
  headers de CA-001 estao presentes, identicos a producao.
- **CA-003:** em development, nenhum desses headers quebra o Vite dev
  server/HMR (CSP e HSTS ausentes).
- **CA-004:** a CSP de producao permite conexao ao dominio Supabase
  configurado (`connect-src`) -- login funciona.
- **CA-005:** a CSP de producao bloqueia um script inline nao autorizado.
- **CA-006:** uma tentativa de embedding em iframe de qualquer origem e
  bloqueada.
- **CA-007:** `X-Content-Type-Options: nosniff` presente em toda resposta
  de `/api`.
- **CA-008:** `Referrer-Policy: strict-origin-when-cross-origin` presente
  em toda resposta de `/api`.
- **CA-009:** `Permissions-Policy` nega camera/microfone/geolocalizacao.
- **CA-010:** HSTS presente em producao/staging com TLS.
- **CA-011:** HSTS ausente em development.
- **CA-012:** modo same-origin (Modo A) funciona sem CORS habilitado, sem
  exigir mudanca de regra de negocio.
- **CA-013:** requisicao de origem presente na allowlist de CORS recebe
  `Access-Control-Allow-Origin` correspondente exatamente a ela.
- **CA-014:** requisicao de origem hostil nunca recebe
  `Access-Control-Allow-Origin` correspondente.
- **CA-015:** e fisicamente impossivel a aplicacao responder
  `Access-Control-Allow-Origin: *` junto de
  `Access-Control-Allow-Credentials: true`.
- **CA-016:** preflight `OPTIONS` de origem permitida recebe resposta com
  headers CORS corretos, sem exigir Actor.
- **CA-017:** preflight `OPTIONS` de origem hostil nao recebe autorizacao
  CORS.
- **CA-018:** uma rota que usa PUT no inventario real continua funcionando
  quando CORS estiver habilitado para uma origem autorizada.
- **CA-019:** uma rota que usa DELETE no inventario real continua
  funcionando pela mesma razao.
- **CA-020:** POST mutavel cookie-autenticado (classe E/F) com Origin
  valido e processado normalmente.
- **CA-021:** POST mutavel cookie-autenticado com Origin hostil e
  rejeitado antes de qualquer efeito colateral.
- **CA-022:** PATCH mutavel cookie-autenticado com Origin hostil e
  rejeitado pela mesma regra.
- **CA-023:** PUT mutavel cookie-autenticado com Origin hostil e rejeitado
  pela mesma regra.
- **CA-024:** DELETE mutavel cookie-autenticado com Origin hostil e
  rejeitado pela mesma regra.
- **CA-025:** mutacao cookie-autenticada com `Origin: null` e rejeitada.
- **CA-026:** mutacao cookie-autenticada sem Origin, mas com Referer
  valido, e processada normalmente (fallback funciona).
- **CA-027:** mutacao cookie-autenticada sem Origin e sem Referer e
  rejeitada (fail-closed).
- **CA-028:** rota publica sem cookie (classe C) continua funcionando sem
  exigir Origin/Referer.
- **CA-029:** rota publica token-based (classe D) continua funcionando
  sem exigir Origin/Referer.
- **CA-030:** `/auth/session`, `/auth/refresh`,
  `/auth/invitations/:id/accept` continuam funcionando exatamente como
  hoje.
- **CA-031:** `/platform/organizations/bootstrap` continua funcionando
  exatamente como hoje.
- **CA-032:** com `trust proxy` configurado corretamente, `request.ip`
  usado por rate limiting/auditoria reflete o IP real do cliente, nao o do
  proxy.
- **CA-033:** um `X-Forwarded-For` forjado por cliente fora da fronteira
  confiavel nunca e aceito como `request.ip`.
- **CA-034:** resposta de rota Membership/Platform Admin (classe E/F)
  contem `Cache-Control: no-store`.
- **CA-035:** asset estatico servido fora do Express nao e afetado por
  CA-034.
- **CA-036:** resposta 500 continua sem stack trace/detalhe interno, em
  qualquer ambiente.
- **CA-037:** `express.json({limit:"256kb"})` continua rejeitando payload
  maior que o limite com 413, comportamento inalterado.
- **CA-038:** a suite `tests/phase29/` continua 100% verde, sem nenhuma
  modificacao de arquivo de teste.
- **CA-039:** a suite `tests/phase30/` continua 100% verde, sem nenhuma
  modificacao de arquivo de teste.
- **CA-040:** nenhuma migration nova existe apos a implementacao desta
  SPEC.

## 16. Dependencias

- **ADR-0027** -- autoridade arquitetural desta SPEC (secoes 2, 6, 7, 8,
  18, 29).
- **Fase 29 / SPEC-028** (secao 9, "Sessao") -- cookies HttpOnly/
  SameSite=Lax ja testados, absorvidos e nunca duplicados por esta SPEC.
- **Fase 30 / SPEC-029** -- ponto unico de validacao fail-fast de
  configuracao (`assertProductionConfig`), reaproveitado quando a
  topologia exigir CORS/trust proxy configurados (RN-045), nunca
  duplicado.
- **Nenhuma dependencia em sub-frentes futuras** -- e a segunda fatia da
  ordem do ADR-0027, nao depende de CI/CD, observabilidade, backup/
  restore, rate limiting distribuido ou E2E.
- **E pre-requisito logico (nao bloqueante) para as demais sub-frentes:**
  CI/CD (secao 3 do ADR) devera rodar os mesmos gates (`tsc`/`lint`/
  `prettier`/`build`/`npm audit`/testes) que ja cobrem esta SPEC; rate
  limiting distribuido (secao 9 do ADR), quando ativado, herdara a mesma
  fronteira de `trust proxy` definida aqui, sem redefini-la.

Nenhum ciclo de dependencia identificado.

## 17. Compatibilidade

Confirmado, secao a secao: `authorize()` (`core/authorization.ts`)
permanece sem nenhuma linha alterada; `CoreService` permanece sem nenhuma
linha alterada; `Membership`/SPEC-003 permanece sem nenhuma regra
alterada; `AccessGrant`/migration `0031` permanece imutavel; `AuthService`/
`SupabaseActorProvider`/`dev-auth.ts` (Fase 29) permanecem sem nenhuma
mudanca de comportamento -- esta SPEC apenas adiciona uma camada de
transporte ao redor deles (headers, CORS, validacao de Origin/Referer),
nunca altera a logica de identidade/autorizacao em si. `core/rate-
limiter.ts` permanece sem nenhuma linha alterada -- apenas o valor que
alimenta sua chave (`request.ip`) passa a ser confiavel por configuracao
explicita de proxy (RN-024 a RN-027), nunca o algoritmo. Nenhuma migration
historica (0001-0033) e tocada.

## 18. Fora do Escopo (reforco)

Reforcado explicitamente: as cinco outras sub-frentes restantes de
ADR-0027 (CI/CD, observabilidade/logging/error monitoring, backup/
restore/disaster recovery, rate limiting distribuido, E2E) -- cada uma
exige SPEC propria futura. Tambem fora: upload de curriculo (feature
inexistente hoje), SSO/SAML, SCIM, login social, WebAuthn/passkeys, MFA
(SPEC-028 secao 21), novas funcionalidades de RH, billing, autosservico
publico de Organization, impersonation, advanced analytics/indicadores,
autoscaling sofisticado, multi-region ativo-ativo, zero-downtime avancado,
SOC2/ISO, SIEM enterprise.

## 19. Impacto Fisico Futuro (conceitual, sem codigo nesta SPEC)

- `src/server/app.ts`: novo middleware de security headers/CSP (biblioteca
  a definir no plano tecnico, ver secao 20), aplicado antes das rotas,
  condicionado a `isProductionEnv` onde este documento exigir (RN-005,
  RN-007, RN-010).
- Possivel novo middleware de CORS (biblioteca a definir, secao 20),
  montado antes de `createApiRouter`, configurado pela lista de origens da
  secao 11.
- Possivel novo middleware pequeno de validacao de Origin/Referer para as
  classes E/F (nome de arquivo a definir no plano tecnico -- por exemplo
  `src/server/http/csrf.ts` -- nao fixado aqui).
- `src/server/index.ts`: `app.set("trust proxy", ...)` condicionado a
  topologia real (RN-024), e possivel extensao do `assertProductionConfig`
  ja existente (SPEC-029) para cobrir a configuracao de origens CORS/
  proxy quando exigida (RN-045) -- reaproveitando o mecanismo, nunca
  duplicando.
- `src/server/http/routes.ts`: aplicacao de `Cache-Control: no-store` por
  classe/router (RN-036) -- preferencialmente um middleware montado no
  router das classes E/F, nunca centenas de chamadas manuais adicionais.
- `.env.example`: comentario indicando as novas variaveis de configuracao
  conceituais da secao 11 (nomes finais no plano tecnico).
- **Dependencias previstas** (nunca instaladas por esta SPEC): `helmet`
  (ja escolhido pelo ADR-0027 secao 6, para headers/CSP) e, **somente se**
  a topologia real exigir Modo B (cross-origin), o pacote `cors` -- se o
  Modo A (same-origin) prevalecer, `cors` pode nunca ser necessario. A
  validacao de Origin/Referer (CSRF) e implementavel com codigo manual
  simples (comparacao de string), sem exigir nenhuma biblioteca dedicada
  de CSRF (double-submit ja avaliado como desnecessario pelo ADR-0027
  secao 8).

## 20. Divergencia Factual do ADR-0027 e Reconciliacao

**Achado:** ADR-0027 secao 7 registra, como evidencia fisica de apoio a
politica de CORS: _"Methods: apenas os verbos realmente usados (GET, POST,
PATCH -- a API nao usa PUT/DELETE em nenhuma rota existente)"_.

**Divergencia confirmada nesta tarefa:** o codigo atual **possui 9 rotas
reais usando PUT ou DELETE** (`grep -c "router\.put(\|router\.delete("` em
`src/server/http/routes.ts` = 9), incluindo configuracoes de pre-entrevista
(`PUT /organizations/:organizationId/job-openings/:jobOpeningId/pre-
interview-settings`), configuracoes de instrumento comportamental,
respostas publicas token-based (`PUT /public/pre-interviews/responses/
:questionPublicId`, `PUT /public/behavioral-assessments/responses/
:itemPublicId`) e administracao de provedores de IA (`PUT`/`DELETE` em
`/organizations/:organizationId/ai/*` e `/platform/organizations/
:organizationId/ai/providers/:provider/platform-managed`).

**Classificacao:** esta e uma **reconciliacao factual da implementacao com
a intencao arquitetural do ADR, nao uma nova decisao arquitetural.** A
_decisao_ do ADR (secao 7) e o _principio_ -- "os metodos permitidos
devem ser exatamente os metodos realmente usados pela API, nunca uma lista
generica por conveniencia" -- permanece intacta e e exatamente o que esta
SPEC normatiza em RN-028/INV-06. Apenas o _dado fisico_ citado como
evidencia (a lista literal GET/POST/PATCH) estava desatualizado no momento
em que o ADR foi escrito. Nenhuma decisao arquitetural muda: o ADR nunca
decidiu "proibir PUT/DELETE" como politica -- decidiu "restringir aos
metodos realmente usados", e PUT/DELETE **sao** realmente usados.

**Tratamento normativo (nao editar o ADR nesta tarefa):**

- a politica CORS desta SPEC deriva os metodos permitidos do inventario
  real da API, nunca de uma lista fixa (RN-028);
- no baseline atual, isso inclui `GET`, `POST`, `PATCH`, `PUT`, `DELETE`;
- metodos nao utilizados nao sao liberados apenas por conveniencia/
  simetria;
- uma mudanca futura do conjunto de metodos exige atualizacao consciente
  desta politica no momento da implementacao ou de uma revisao posterior,
  nunca uma lista estatica presumida correta para sempre.

**Esta divergencia nao muda nenhuma decisao arquitetural do ADR-0027 --
nao e classificada como conflito (D) nem como decisao arquitetural
ausente (C).** Nenhuma reconciliacao do texto do ADR e necessaria; a
correcao factual fica registrada nesta SPEC e sera aplicada diretamente na
implementacao futura.

## 21. Ambiguidades Restantes

Nao bloqueantes, deixadas para o plano tecnico ou aceitas como risco
conhecido:

- **Modo A vs. Modo B (same-origin vs. cross-origin) nao e escolhido por
  esta SPEC** -- e uma pre-condicao de configuracao (secao 6/11),
  dependente de uma decisao de hosting ainda nao tomada (ADR-0027 secao
  4). Registrado como decisao operacional necessaria antes da
  implementacao real de CORS especificamente; headers/CSP/CSRF/trust
  proxy/`no-store` sao implementaveis independentemente dessa decisao.
- **Nome exato dos modulos/middlewares novos** (secao 19) e das variaveis
  de configuracao (secao 11): fica para o plano tecnico, mesma disciplina
  de SPEC-029 secao 18/19.
- **Exececao a RN-021** (mutacao classe E/F sem Origin e sem Referer):
  nenhuma foi encontrada fisicamente nesta investigacao; se um cliente
  legitimo real precisar dessa excecao no futuro, exige evidencia fisica
  registrada no plano tecnico correspondente -- nao resolvida por analogia
  aqui.
- **Comportamento empirico atual do Express para `OPTIONS`** em rotas
  registradas via `router.get()`/`router.post()` separados (nao via
  `router.route().get().post()` encadeado) nao foi verificado em runtime
  nesta investigacao documental -- a SPEC define o comportamento
  **desejado** (RN-034/RN-035), nao afirma o comportamento atual; o plano
  tecnico deve confirmar empiricamente antes de decidir se e necessario um
  handler `OPTIONS` explicito ou se o comportamento default do Express ja
  e suficiente.
- **`staging` fisicamente inexistente hoje:** esta SPEC normatiza que,
  quando existir, deve espelhar producao (secao 8) -- a criacao fisica do
  ambiente em si e decisao operacional/de hosting, fora do codigo desta
  SPEC (mesmo achado ja registrado por ADR-0027 secao 4/25).

Nenhuma dessas ambiguidades foi resolvida por analogia, e nenhuma delas e
um conflito com o ADR-0027 (classificacao B da secao 22).

## 22. Revisao Destrutiva

50 cenarios atacados:

| #   | Cenario                                                                      | Risco                                          | RN/CA que resolve                                                      | Ambiguidade restante                                                   | Conflito com ADR                        |
| --- | ---------------------------------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------- |
| 1   | Production same-origin (Modo A)                                              | Baixo                                          | RN-033/CA-012                                                          | Depende de hosting (secao 21)                                          | Nao                                     |
| 2   | Production cross-origin (Modo B)                                             | Medio se mal configurado                       | RN-028 a RN-035                                                        | Depende de hosting (secao 21)                                          | Nao                                     |
| 3   | Staging same-origin                                                          | Baixo                                          | Secao 8 (espelha producao)                                             | Staging nao existe fisicamente ainda                                   | Nao                                     |
| 4   | Staging cross-origin                                                         | Medio se mal configurado                       | Idem                                                                   | Idem                                                                   | Nao                                     |
| 5   | Dev com Vite HMR                                                             | Alto se CSP/HSTS aplicados cegamente           | RN-005/RN-007/RN-010/CA-003                                            | Nenhuma                                                                | Nao                                     |
| 6   | Supabase Auth (connect-src)                                                  | Alto se bloqueado (login quebra)               | RN-012/CA-004                                                          | Nenhuma                                                                | Nao                                     |
| 7   | Origin exata permitida                                                       | Baixo                                          | RN-031/CA-013                                                          | Nenhuma                                                                | Nao                                     |
| 8   | Origin com prefixo semelhante (`evil-app.com` vs `app.com`)                  | Alto se comparacao for permissiva              | RN-031 (igualdade exata)                                               | Nenhuma                                                                | Nao                                     |
| 9   | Origin com sufixo malicioso (`app.com.evil.com`)                             | Alto se comparacao for por substring           | RN-031                                                                 | Nenhuma                                                                | Nao                                     |
| 10  | `Origin: null`                                                               | Medio                                          | RN-019/RN-020/CA-025                                                   | Nenhuma                                                                | Nao                                     |
| 11  | Origin ausente                                                               | Baixo isolado                                  | RN-020 (fallback Referer)                                              | Nenhuma                                                                | Nao                                     |
| 12  | Referer valido                                                               | Baixo                                          | RN-020/CA-026                                                          | Nenhuma                                                                | Nao                                     |
| 13  | Referer hostil                                                               | Medio                                          | RN-020 (mesma regra de RN-018)                                         | Nenhuma                                                                | Nao                                     |
| 14  | Origin e Referer ambos ausentes                                              | Medio                                          | RN-021/CA-027 (fail-closed)                                            | Excecao futura exige evidencia (secao 21)                              | Nao                                     |
| 15  | Preflight valido (origem permitida)                                          | Baixo                                          | RN-034/CA-016                                                          | Comportamento Express atual nao verificado empiricamente (secao 21)    | Nao                                     |
| 16  | Preflight hostil                                                             | Baixo (ja bloqueado hoje por ausencia de CORS) | RN-035/CA-017                                                          | Nenhuma                                                                | Nao                                     |
| 17  | OPTIONS com Actor ausente                                                    | Baixo                                          | RN-034 (nunca exige Actor)                                             | Nenhuma                                                                | Nao                                     |
| 18  | Wildcard + credentials                                                       | Critico se acontecesse                         | RN-030/INV-02/CA-015                                                   | Nenhuma                                                                | Nao                                     |
| 19  | POST cookie-autenticado (classe E/F)                                         | Medio sem 2a camada                            | RN-016 a RN-018/CA-020/CA-021                                          | Nenhuma                                                                | Nao                                     |
| 20  | PUT cookie-autenticado                                                       | Medio                                          | RN-016/CA-023                                                          | Nenhuma                                                                | Nao (corrige premissa do ADR, secao 20) |
| 21  | PATCH cookie-autenticado                                                     | Medio                                          | RN-016/CA-022                                                          | Nenhuma                                                                | Nao                                     |
| 22  | DELETE cookie-autenticado                                                    | Medio                                          | RN-016/CA-024                                                          | Nenhuma                                                                | Nao (corrige premissa do ADR, secao 20) |
| 23  | Candidatura publica (classe C)                                               | Baixo (sem sessao a proteger)                  | RN-017/CA-028                                                          | Nenhuma                                                                | Nao                                     |
| 24  | Pre-interview token (classe D)                                               | Baixo (sem cookie)                             | RN-017/CA-029                                                          | Nenhuma                                                                | Nao                                     |
| 25  | Behavioral token (classe D)                                                  | Baixo                                          | RN-017/CA-029                                                          | Nenhuma                                                                | Nao                                     |
| 26  | Proposal token (classe D)                                                    | Baixo                                          | RN-017/CA-029                                                          | Nenhuma                                                                | Nao                                     |
| 27  | Login (`/auth/session`)                                                      | Baixo (Origin da propria SPA)                  | RN-023/CA-030                                                          | Nenhuma                                                                | Nao                                     |
| 28  | Logout                                                                       | Baixo                                          | RN-023 (mesma regra classe G)/CA-030                                   | Nenhuma                                                                | Nao                                     |
| 29  | Refresh                                                                      | Baixo                                          | Idem                                                                   | Nenhuma                                                                | Nao                                     |
| 30  | Invitation accept                                                            | Baixo                                          | RN-023/CA-030                                                          | Nenhuma                                                                | Nao                                     |
| 31  | Bootstrap de Organization                                                    | Baixo                                          | RN-016 (classe F)/CA-031                                               | Nenhuma                                                                | Nao                                     |
| 32  | CSP bloqueia Supabase                                                        | Alto se ocorrer (login quebra)                 | RN-012/CA-004                                                          | Nenhuma                                                                | Nao                                     |
| 33  | CSP permite inline nao intencional                                           | Medio                                          | RN-011/CA-005                                                          | Nenhuma                                                                | Nao                                     |
| 34  | Iframe hostil embedando a app                                                | Medio (clickjacking)                           | RN-002/CA-006                                                          | Nenhuma                                                                | Nao                                     |
| 35  | HSTS em localhost                                                            | Baixo se enviado por engano                    | RN-007 (so `isProductionEnv`)/CA-011                                   | Nenhuma                                                                | Nao                                     |
| 36  | HSTS atras de proxy sem TLS terminado corretamente                           | Medio                                          | RN-009 (nao depende de `req.secure`)                                   | Depende de topologia final (secao 21)                                  | Nao                                     |
| 37  | XFF de proxy confiavel                                                       | Baixo                                          | RN-026/CA-032                                                          | Nenhuma                                                                | Nao                                     |
| 38  | XFF forjado por cliente hostil                                               | Alto se aceito                                 | RN-026/CA-033                                                          | Nenhuma                                                                | Nao                                     |
| 39  | `request.ip` usado hoje sem trust proxy                                      | Alto (ja confirmado ativo, secao 3)            | RN-024 a RN-027                                                        | Nenhuma -- resolvido nesta SPEC                                        | Nao                                     |
| 40  | `no-store` em dado pessoal (dossie, candidato)                               | Medio (cache indevido)                         | RN-036/CA-034                                                          | Nenhuma                                                                | Nao                                     |
| 41  | `/api/health`                                                                | Baixo (nao sensivel)                           | RN-038                                                                 | Nenhuma                                                                | Nao                                     |
| 42  | Static assets                                                                | Baixo                                          | RN-039/CA-035                                                          | Depende de decisao de hosting (fora do Express)                        | Nao                                     |
| 43  | Resposta 500                                                                 | Baixo (ja nao vaza)                            | RN-040/CA-036                                                          | Nenhuma                                                                | Nao                                     |
| 44  | Payload > 256kb                                                              | Baixo (ja limitado)                            | RN-041/CA-037                                                          | Nenhuma                                                                | Nao                                     |
| 45  | Helmet aplica default inesperado (ex. HSTS sempre-on)                        | Medio se nao configurado conscientemente       | INV-04                                                                 | Nenhuma                                                                | Nao                                     |
| 46  | Header duplicado pelo edge/proxy e pela app                                  | Baixo/medio, condicionado a hosting            | Secao 19 ("plano tecnico avalia sobreposicao", ja previsto por ADR s6) | Depende de hosting final                                               | Nao                                     |
| 47  | Staging inexistente fisicamente hoje                                         | Medio (RC bloqueado sem staging real)          | Secao 8/21                                                             | Criacao fisica e decisao operacional, fora desta SPEC                  | Nao                                     |
| 48  | Configuracao de origem/proxy ausente quando exigida                          | Alto se subir parcialmente configurado         | RN-045/RN-046 (fail-fast reaproveitando Fase 30)                       | Nenhuma                                                                | Nao                                     |
| 49  | Metodo HTTP novo introduzido no futuro (ex. novo endpoint com `PATCH`/`PUT`) | Baixo se politica for revisada                 | RN-028 (deriva do inventario real, revisado a cada mudanca)            | Requer disciplina de revisao continua, nao automatizavel por esta SPEC | Nao                                     |
| 50  | Nenhuma migration                                                            | N/A                                            | RN-047/CA-040                                                          | Nenhuma                                                                | Nao                                     |

Nenhuma contradicao bloqueante permanece sem correcao incorporada ao texto
final (todas as correcoes ja estao nas secoes 6 a 21 acima, nao apenas
citadas nesta tabela).

## 23. Conflitos Encontrados

Nenhum conflito real (classificacao D) com o ADR-0027. A unica divergencia
fisica encontrada -- premissa desatualizada sobre PUT/DELETE (secao 20) --
e uma reconciliacao factual dentro do mesmo principio ja decidido pelo ADR
(secao 7), nunca uma mudanca de decisao arquitetural. A topologia de
hosting nao decidida (secao 4 do ADR) nao e um conflito -- e uma
pre-condicao explicitamente reconhecida pelo proprio ADR como fora de seu
escopo, tratada aqui como configuracao (secao 6/11/21), nunca escondida
nem resolvida por suposicao. Nenhuma reconciliacao do texto do ADR-0027 e
necessaria.

## 24. Verificacao contra ADR-0027

Confirmado, secao a secao: direcao global (ADR secao 1, "A refinada por
D") preservada -- `helmet` como baseline de headers (secao 6 do ADR),
nenhuma infraestrutura propria nova; fatiamento (ADR secao 2) respeitado
-- esta SPEC cobre exatamente e somente a segunda sub-frente da ordem
recomendada; CORS (ADR secao 7) preservado integralmente -- allowlist
explicita, credentials nunca com wildcard, metodos reais (corrigidos pela
reconciliacao da secao 20); CSRF/cookies (ADR secao 8) preservado
integralmente -- SameSite=Lax existente + Origin/Referer como
complemento, double-submit token confirmado desnecessario; trust proxy
(ADR secao 18) preservado integralmente -- nunca `true` generico,
condicionado a topologia real; criterio de RC (ADR secao 29, item 6) e o
alvo desta SPEC, sem prometer os demais 8 itens; compatibilidade com
autenticacao (ADR secao 33) preservada -- nenhuma linha de Supabase Auth/
Membership/AccessGrant tocada; impacto em banco (ADR secao 32,
"preferencia zero migration de dominio") respeitado -- nenhuma migration
criada.

## 25. Definicao de Concluido

Para esta tarefa documental:

- fontes obrigatorias lidas integralmente (secao 3), achados centrais
  revalidados fisicamente no momento da redacao (secao 3);
- segunda fatia identificada a partir da ordem real do ADR-0027, nunca por
  analogia ou titulo generico (secao 1);
- divergencia factual do ADR (PUT/DELETE) documentada e reconciliada sem
  editar o ADR (secao 20);
- topologia de hosting ainda indefinida transformada em pre-condicao de
  configuracao segura para os dois modos possiveis, nunca escondida nem
  escolhida arbitrariamente (secao 6/11);
- invariantes fechadas e numeradas (secao 5);
- escopo fechado sem absorver as cinco outras sub-frentes restantes do
  ADR-0027 (secoes 2, 18);
- requisitos normativos verificaveis, nao vagos, cobrindo headers, CSP,
  HSTS, CORS, CSRF, cookies, trust proxy, Cache-Control, OPTIONS,
  ambientes, configuracao fail-fast e preservacao de auth/body-limit/
  error-leakage (secao 7);
- sequenciamento critico CORS x CSRF normatizado como invariante (INV-03/
  RN-022), nunca deixado implicito;
- criterios de aceite (secao 15) e testes obrigatorios futuros (secao 13)
  definidos;
- revisao destrutiva aplicada aos 50 cenarios exigidos, nenhuma
  contradicao bloqueante (secao 22);
- verificacao explicita contra ADR-0027, nenhum conflito, nenhuma
  reconciliacao do ADR necessaria (secoes 23-24);
- nenhum codigo, migration, banco ou teste executavel criado ou alterado;
- nenhuma dependencia instalada;
- nenhuma Fase numerada formalizada;
- nenhum commit realizado.

Para implementacao futura:

- SPEC mantida aprovada antes do desenvolvimento;
- plano tecnico elaborado a partir das secoes 1 a 21, incluindo a decisao
  operacional de topologia (Modo A ou B) antes de implementar CORS
  especificamente;
- criterios de aceite implementados;
- testes obrigatorios implementados e passando;
- seguranca revisada (secao 9);
- documentacao dependente (BACKLOG, roadmap) atualizada;
- Fase numerada formalizada somente apos plano tecnico aprovado;
- commit realizado somente na fase apropriada.
