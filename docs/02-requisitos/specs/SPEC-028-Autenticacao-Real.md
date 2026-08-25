# SPEC-028 - Autenticacao Real

**Status:** Aprovada
**Versao:** 1.0
**Fase:** 29
**Responsavel de negocio:** Thiago Sousa
**Dependencias:** ADR-0026 - Autenticacao Real, ADR-0003 - Nucleo Multiempresa da Fase 1, ADR-0025 - Ciclo de Vida de Acesso Pos-Contratacao, SPEC-002 - User, SPEC-003 - Membership, SPEC-004 - Roles & Permissions, SPEC-027 - Ciclo de Vida de Acesso Pos-Contratacao / AccessGrant
**Ultima atualizacao:** 2026-08-20

**Nota de revisao destrutiva (v1.0):** este documento nasce em v0.1 e e
atacado na mesma tarefa (secao 43). Nenhuma secao normativa abaixo
permanece sem que a revisao destrutiva tenha sido aplicada a ela; as
correcoes ja estao incorporadas ao texto das secoes 1 a 42.

## 1. Objetivo

Transformar ADR-0026 em comportamento normativo implementavel: definir
como um ser humano prova sua identidade real ao sistema (Supabase Auth,
ja decidido e aceito por ADR-0026) e como essa identidade autenticada e
transformada em um `Actor` confiavel para `authorize()`, sem nunca tocar
`Membership` como fonte exclusiva de autorizacao organizacional.

Esta SPEC fecha: modelo conceitual de identidade, login, sessao/JWT,
resolucao de `Actor`, fronteira com `Membership`/`AccessGrant`, convite,
bootstrap do primeiro tenant, signup, senha/reset/verificacao de e-mail,
Platform Admin, isolamento dev/test, rotas publicas, API conceitual,
RBAC das operacoes de autenticacao, idempotencia, atomicidade
provider-banco, concorrencia, rate limiting, auditoria, privacidade,
seguranca, multiempresa, lifecycle/no-delete, migracao de usuarios
existentes, comportamento de falha, configuracao/segredos, criterios de
aceite e testes obrigatorios futuros.

## 2. Fora do Escopo

Esta SPEC nao define nem implementa:

- codigo, migration, alteracao de banco, rotas ou UI executavel;
- testes executaveis;
- plano tecnico de implementacao;
- SSO/SAML, SCIM, login social;
- WebAuthn/passkeys;
- MFA obrigatoria para todos os perfis (apenas registrada como requisito
  futuro para Platform Admin, secao 21);
- autosservico publico de criacao de `Organization` (permanece exclusivo
  de Platform Admin, SPEC-004 inalterada, conforme ADR-0026);
- impersonation;
- billing;
- Production Hardening geral (CI/CD, cabecalhos HTTP genericos, CORS
  completo, observabilidade, backup/restore) -- frente separada, fora do
  escopo desta SPEC;
- notificar um `User` ja confirmado sobre convite para uma NOVA
  Organization por e-mail transacional de negocio (distinto do e-mail de
  autenticacao do provider) -- exige capacidade de e-mail transacional de
  negocio ainda inexistente no projeto, registrada como gap conhecido,
  nao resolvida aqui (secao 15);
- alteracao de ADR-0003, ADR-0025, SPEC-002, SPEC-003, SPEC-004 ou
  SPEC-027;
- alteracao de BACKLOG ou roadmap.

## 3. Fontes Obrigatorias e Evidencias

Lidas integralmente antes da redacao: `CONSTITUICAO_DO_PROJETO.md`,
`AGENTS.md`, ADR-0026, ADR-0003, ADR-0025, SPEC-002, SPEC-003, SPEC-004,
SPEC-027, `docs/02-requisitos/requisitos-nao-funcionais.md`,
`docs/04-seguranca/constituicao-seguranca.md`,
`docs/03-arquitetura/multi-tenancy.md`, `.env.example`, `package.json`,
`src/server/http/dev-auth.ts`, `src/server/core/*`, `src/server/app.ts`,
`src/server/index.ts`, `src/server/http/routes.ts`, migration 0002
(`users`/`memberships`), migration 0031 (`access_grants`).

Evidencias fisicas relevantes usadas como base normativa:

- `getActor()` (`dev-auth.ts`) e hoje o UNICO mecanismo de identificacao,
  autodesabilitado fora de `APP_ENV=development`/`test`
  (`forbidden("temporary_auth_disabled", ...)`);
- `Actor` (`core/types.ts`) ja e `{kind:"user",userId} |
{kind:"platform",userId}` -- tipo preservado sem alteracao;
- `authorize()` (`core/authorization.ts`) consulta `Membership` a cada
  chamada, sem cache -- confirmado por leitura direta, base da garantia
  da secao 14;
- `package.json` nao possui nenhuma dependencia de autenticacao (hashing,
  JWT, sessao) nem de e-mail -- confirma que nada disso existe hoje;
- nenhum dado real de `User`/`Organization` existe em nenhum ambiente
  auditado (contagens = 0 em DEV Supabase, confirmado na auditoria
  pos-Fase 28) -- base da secao 35.

## 4. Definicao do Problema

**Pergunta central:** como um ser humano prova sua identidade para o
sistema em producao, e como essa identidade autenticada e transformada
em um `Actor` confiavel?

Vocabulario desta SPEC, sem equivalencia indevida entre os termos (nenhum
destes conceitos substitui outro):

- **Auth Identity:** o registro de identidade mantido pelo Supabase Auth
  (`auth.users`), identificado por um `external_id` opaco (UUID). Prova
  apenas que uma pessoa controla uma credencial -- nunca autoriza nada
  por si so.
- **User** (SPEC-002): a entidade interna canonica, global, que todo o
  dominio ja referencia (`Membership`, auditoria, `OrganizationPerson`
  quando aplicavel). Continua existindo exatamente como hoje.
- **Sessao:** o par access token + refresh token emitido apos
  autenticacao bem-sucedida, com validade limitada no tempo.
- **Actor:** o objeto que `authorize()`/`CoreService` consomem. Esta
  SPEC define como ele e produzido a partir de uma sessao valida -- nunca
  o que ele autoriza.
- **Membership** (SPEC-003): autorizacao tecnica dentro de uma
  `Organization`. Fonte exclusiva de autorizacao organizacional, sem
  excecao, inalterada por esta SPEC.
- **AccessGrant** (ADR-0025/SPEC-027): proveniencia/governanca sobre um
  `Membership` ja existente. NUNCA e mecanismo de autenticacao e nunca
  participa desta SPEC como fonte de identidade ou de sessao.
- **Platform Admin** (SPEC-004): perfil interno da plataforma, nao e
  Role de `Membership`. Precisa de Auth Identity/User como qualquer
  pessoa, mas o atributo "e Platform Admin" nunca vem do provider (secao
  21).

Proibicao explicita: nenhuma implementacao futura pode inferir
autorizacao organizacional a partir de uma Auth Identity ou de uma claim
de sessao. A unica ponte permitida entre "quem a pessoa e" e "o que ela
pode fazer" e o par `User.id` -> `Membership` consultado no banco da
aplicacao, a cada requisicao.

## 5. Invariantes Fundamentais

Fechadas sem excecao, sobre qualquer implementacao futura:

- INV-01: autenticacao bem-sucedida identifica um `User`, nunca concede
  autorizacao.
- INV-02: autenticacao nunca concede acesso organizacional por si so.
- INV-03: `Membership` continua fonte exclusiva de autorizacao
  organizacional.
- INV-04: `Actor` nunca pode ser escolhido ou informado pelo cliente
  (fim do `x-dev-user-id` fora de dev/test).
- INV-05: `organization_id`/contexto de Organization nunca pode ser
  confiado a partir de claim client-controlled (nem do JWT, nem do
  payload) -- deve continuar sendo resolvido/validado no servidor a cada
  operacao, exatamente como hoje.
- INV-06: nenhuma Role de negocio (`owner`/`admin`/`member`) fica no
  provider como fonte canonica -- `Membership.role` continua sendo a
  unica fonte.
- INV-07: `AccessGrant` nunca entra na autenticacao -- nunca autentica,
  nunca emite sessao, nunca e consultado por `getActor()`.
- INV-08: sessao valida + `Membership inactive` = acesso negado na
  proxima operacao protegida.
- INV-09: ausencia de prova de identidade valida = fail-closed, sempre
  (nunca acesso default-aberto).
- INV-10: Platform Admin nunca e determinado por claim arbitraria do
  JWT -- sempre por allow-list interna, resolvida no servidor.

## 6. Modelo Conceitual: Auth Identity <-> User

**Decisao desta SPEC:** tabela propria de identidade
(`auth_identities`, nome fisico final a confirmar no plano tecnico),
nao uma coluna solta em `users`.

Justificativa: ADR-0026 ja registrou que um `User` podera, no futuro,
possuir mais de uma identidade externa (por exemplo, um SSO
corporativo) sem reescrever `users`/`memberships`. Uma coluna nullable
direta em `users` resolveria a Fase 29 isoladamente, mas exigiria uma
migracao estrutural (mover a coluna para uma tabela propria) no dia em
que essa segunda identidade existir -- o mesmo tipo de retrabalho que
este projeto ja evita sistematicamente preferindo tabela propria
aditiva a coluna acumulada em entidade nucleo (mesmo padrao ja aplicado
a `organization_people`, `employments`, `access_grants`, nunca colunas
soltas em `users`/`memberships`). Uma tabela propria, com cardinalidade
1:1 IMPOSTA nesta Fase (nao 1:N), entrega exatamente o mesmo
comportamento da Fase 29 hoje, sem fechar a porta para 1:N depois.

Modelo conceitual minimo:

| Campo         | Obrigatorio | Observacao                                                                                                       |
| ------------- | ----------: | ---------------------------------------------------------------------------------------------------------------- |
| `id`          |         Sim | Identificador interno.                                                                                           |
| `user_id`     |         Sim | `User` interno associado. UNIQUE nesta Fase (1:1).                                                               |
| `provider`    |         Sim | Enum fechado; unico valor aceito nesta Fase: `supabase`. Preparado para futuro provider adicional sem redesenho. |
| `external_id` |         Sim | Identificador opaco do provider (`auth.users.id`). UNIQUE por `provider`.                                        |
| `created_at`  |         Sim | Momento da vinculacao (primeira confirmacao).                                                                    |
| `updated_at`  |         Sim | Tecnico.                                                                                                         |

Cardinalidade: `User 1:1 AuthIdentity` nesta Fase (restricao explicita
de escopo, nao contrato eterno -- relaxar para `1:N` no futuro e
aditivo, nunca destrutivo). `AuthIdentity` nunca duplica `email` -- a
autoridade sobre o e-mail continua sendo `users.email` (SPEC-002),
apenas a AUTORIDADE sobre "este e-mail esta verificado" passa a ser do
provider no momento da vinculacao.

Multiplas identidades futuras (SSO, por exemplo) ficam explicitamente
fora do escopo desta Fase -- a tabela propria e a decisao que evita
bloquear essa evolucao, sem implementa-la agora.

## 7. Email

- `users.email` continua sendo o campo de correlacao/exibicao (SPEC-002
  RN-001/RN-002, inalteradas: unico na plataforma, normalizado em
  minusculas sem espacos).
- A autoridade sobre "este e-mail foi verificado por esta pessoa" passa a
  ser do Supabase Auth no momento da confirmacao (convite aceito ou
  verificacao de e-mail pos-signup, quando aplicavel).
- **Convite para e-mail ja associado a um `User` com Auth Identity
  confirmada:** nao cria uma segunda identidade -- tratado como "usuario
  ja existe" (secao 15), nunca como erro exposto ao convidante (RN-009 de
  SPEC-002: nao revelar existencia de conta em resposta publica).
- **Convite para e-mail associado a um `User` interno SEM Auth Identity
  ainda** (por exemplo, um `User` de teste/legado): a vinculacao ocorre
  no aceite, sobre o `User` ja existente -- NUNCA cria um segundo `User`
  para o mesmo e-mail (RN-001 de SPEC-002, unicidade de e-mail,
  preservada sem excecao).
- **Mudanca de e-mail de um `User` ja confirmado:** fluxo detalhado
  fica fora do escopo desta SPEC (registrado tambem em ADR-0026);
  principio minimo fixado aqui: a mudanca de e-mail nunca pode ocorrer
  sem reverificacao pelo provider, e nunca altera `AuthIdentity.
external_id` nem `AuthIdentity.user_id`.
- Nunca associar conta automaticamente apenas por coincidencia de
  e-mail sem um evento de confirmacao explicito do provider -- mesmo
  principio ja fixado por SPEC-025 s5.2 e reforcado por SPEC-016 v1.1
  s52 para outros vinculos deste projeto, aplicado aqui a identidade.

## 8. Login

**Entrada:** credencial apresentada diretamente ao Supabase Auth
(nunca a aplicacao le ou processa a credencial -- o frontend fala com o
provider, nunca envia senha para a API da aplicacao).

**Saida (para a aplicacao):** um access token + refresh token validos,
apresentados nas chamadas subsequentes a API da aplicacao.

Fluxo conceitual do lado da aplicacao (apos o provider ja ter
autenticado):

1. requisicao chega com sessao (cookie, secao 9);
2. assinatura verificada localmente (JWKS cacheado, secao 11);
3. `external_id` extraido do token;
4. `AuthIdentity` localizada por `(provider, external_id)`;
5. se nao existir `AuthIdentity` para esse `external_id`: acesso negado
   (fail-closed) -- uma sessao valida do provider sem vinculo local nunca
   produz um `Actor` (cenario possivel apenas por erro operacional, nunca
   deve ocorrer em fluxo normal, ja que toda `AuthIdentity` so passa a
   existir apos convite/bootstrap aceitos, secao 15/16);
6. `User` resolvido via `AuthIdentity.user_id`;
7. se `User.status != 'active'` (SPEC-002): acesso negado, auditado
   (`user.inactive_access_denied`, evento ja existente, inalterado);
8. `Actor{kind:"user", userId: User.id}` produzido.

**Login pode ser bem-sucedido (Actor produzido) mesmo sem nenhum
`Membership` ativo.** Isso e esperado e seguro: o `Actor` prova apenas
identidade; nenhuma `Organization` se torna acessivel so por isso
(INV-02). A rota `GET /api/me`-equivalente (secao 24) deve funcionar
para um `Actor` sem nenhum `Membership`, retornando uma lista vazia de
`Organizations` acessiveis, nunca um erro.

Erros a tratar (do lado da aplicacao, apos o provider ja ter decidido
sucesso/falha da credencial): token ausente, token malformado, token
expirado, assinatura invalida, `AuthIdentity` inexistente, `User`
inativo -- todos com resposta segura e generica (nunca detalhar qual das
causas ocorreu, para nao ajudar enumeracao), auditados como
`auth.login_failed` apenas quando a falha ocorre no PROVIDER (o provider
audita/rate-limita as proprias tentativas de credencial; a aplicacao
audita as falhas de resolucao de `Actor` que ocorrem do lado dela).

## 9. Sessao

Decisao explicita (ADR-0026 deixou em aberto; fechada aqui para nao
impedir implementacao segura):

- **Mecanismo de armazenamento no navegador: cookie `HttpOnly` +
  `Secure` + `SameSite=Lax`**, definido pelo servidor da aplicacao (nao
  pelo provider diretamente, para manter o controle de emissao dentro da
  fronteira que a aplicacao ja audita). Token NUNCA acessivel a
  JavaScript do frontend -- elimina a classe inteira de roubo de token
  via XSS no armazenamento (o risco residual de XSS passa a ser
  execucao de acao em nome do usuario dentro da sessao ja existente, nao
  exfiltracao do token para reuso fora do navegador).
- Access token: vida curta (ordem de 1 hora, valor exato de configuracao
  do provider, nao fixado aqui). Refresh token: vida mais longa, com
  rotacao a cada uso e deteccao de reuso (capacidade nativa do provider,
  reaproveitada, nunca reimplementada).
- **Renovacao:** transparente, acionada pela aplicacao quando o access
  token esta perto de expirar ou ja expirou mas o refresh ainda e valido.
- **Logout:** limpa os cookies do lado do servidor (resposta que
  expira o cookie) -- nao exige chamada ao provider para invalidar
  localmente, mas DEVE tambem notificar o provider para invalidar o
  refresh token (evita que o refresh token ainda funcione se
  capturado antes do logout).
- **Logout global:** via API administrativa do provider, invalida TODAS
  as sessoes daquele `AuthIdentity` -- reservado a casos excepcionais
  (suspeita de comprometimento), acionavel apenas por Platform Admin ou
  pelo proprio usuario sobre a propria conta (secao 25).
- **Sessao expirada:** access e refresh ambos expirados -> tratado como
  ausencia de sessao (INV-09, fail-closed) -> requer novo login.
- **Refresh invalido/reutilizado:** o provider ja detecta reuso de
  refresh token rotacionado e invalida a cadeia inteira -- a aplicacao
  trata isso exatamente como sessao expirada (forca novo login), nunca
  tenta contornar.

Token (access, refresh, ou qualquer parte deles) **nunca** e registrado
em auditoria (secao 30) nem em log de aplicacao.

## 10. CSRF/XSS

Cookies `HttpOnly` foram escolhidos (secao 9) -- define a politica CSRF
correspondente:

- **Controle primario:** `SameSite=Lax` no cookie de sessao -- bloqueia
  o cookie de ser enviado em navegacoes cross-site do tipo POST/PATCH/
  DELETE originadas de outro site (o cenario classico de CSRF), enquanto
  ainda permite navegacao GET normal de mesmo-site (frontend e API sob o
  mesmo dominio registravel, mesmo que em portas diferentes em
  desenvolvimento -- `SameSite` compara `eTLD+1`, nao a origem completa).
- **Controle secundario:** toda rota mutante da aplicacao ja exige
  `Content-Type: application/json` (`express.json()`, existente,
  inalterado) -- um formulario HTML cross-site classico nao consegue
  produzir esse `Content-Type` sem JavaScript, e JavaScript cross-site
  que tentasse fazer `fetch` com credentials para a API ja esbarraria em
  CORS (Production Hardening, fora do escopo desta SPEC, mas esta SPEC
  **exige** que, quando CORS for configurado, nunca combine
  `Access-Control-Allow-Origin: *` com `credentials: true` -- combinacao
  que anularia toda a protecao acima).
- XSS continua sendo uma superficie de risco geral do frontend (nao
  exclusiva de autenticacao) -- fora do escopo completo desta SPEC, mas
  o desenho de sessao acima (cookie `HttpOnly`) garante que mesmo um XSS
  bem-sucedido nao consegue exfiltrar o token para reuso fora do
  navegador da vitima.

## 11. JWT / JWKS

- Assinatura sempre validada **localmente** pela aplicacao -- nunca
  aceito por decodificacao simples sem verificacao de assinatura.
- Chaves publicas obtidas via JWKS do Supabase Auth, cacheadas em
  memoria pelo processo da API, com `kid` do token usado para selecionar
  a chave correta a cada verificacao.
- `issuer` e `audience` do token DEVEM ser validados contra o projeto
  Supabase configurado -- um token assinado para outro projeto/ambiente
  nunca e aceito, mesmo que a assinatura seja tecnicamente valida por
  outra chave conhecida.
- `expiration` sempre respeitado -- token expirado e tratado como
  ausencia de sessao (INV-09).
- **Key rotation:** cache de JWKS deve ter TTL e revalidar quando um
  `kid` desconhecido aparece (nunca travar permanentemente na primeira
  chave obtida) -- sem isso, uma rotacao de chave do provider derrubaria
  a validacao de tokens legitimos.
- **Provider indisponivel com chave ja cacheada:** verificacao
  prossegue normalmente (local, sem dependencia de rede) -- login/refresh
  NOVOS continuam indisponiveis (dependem do provider), mas requisicoes
  autenticadas em andamento com token ja emitido nao sao interrompidas
  so pela indisponibilidade momentanea (mesma garantia ja registrada em
  ADR-0026).
- **Provider indisponivel sem nenhuma chave valida cacheada** (cenario
  raro: primeira inicializacao do processo coincidindo com
  indisponibilidade): fail-closed -- nenhuma sessao pode ser validada,
  erro seguro, nunca aceitar token nao verificavel "por otimismo".

## 12. Actor

Algoritmo conceitual (formalizando a secao 8, agora como contrato):

```text
request
  -> extrair token da sessao (cookie, secao 9)
  -> validar assinatura localmente (JWKS, secao 11)
  -> validar issuer/audience/expiration
  -> obter external_id (Auth Identity) do token
  -> resolver AuthIdentity por (provider, external_id)
       -> se ausente: fail-closed, sem Actor
  -> resolver User por AuthIdentity.user_id
       -> se ausente ou inativo: fail-closed, sem Actor
  -> Actor { kind: "user", userId: User.id }
```

`Actor` contem apenas o minimo necessario (`kind`, `userId`) -- **nunca**
carrega `role`, `organizationId`, nem qualquer dado de autorizacao. Isso
e identico ao tipo `Actor` ja existente (`core/types.ts`), preservado
sem alteracao de forma.

Comportamentos definidos:

- **Auth Identity sem `User`:** nao pode ocorrer em fluxo normal (todo
  `AuthIdentity` so e criado durante o aceite de convite/bootstrap, que
  ja cria o `User` na mesma operacao, secao 15/16/27) -- se ocorrer por
  inconsistencia operacional, fail-closed.
- **`User` nao existe** (`AuthIdentity` orfa por delecao manual do banco,
  proibida por convencao do projeto -- `CONSTITUICAO_DO_PROJETO.md`,
  "Banco de dados", item 2): fail-closed.
- **`User` em multiplas `Organizations`:** `Actor` e o mesmo,
  independente de quantos `Membership` existem -- a escolha de contexto
  de `Organization` acontece depois, na camada de autorizacao (secao
  13), nunca na resolucao de `Actor`.
- **Requisicao nao informa `Organization`:** operacoes que exigem
  contexto organizacional continuam exigindo-o explicitamente na rota
  (padrao ja existente, `organizationId` no path), nunca inferido do
  `Actor`.
- **`Membership` nao existe para a `Organization` informada:** negado
  por `authorize()` (inalterado), nunca pela resolucao de `Actor`.

Plataform Admin: mesmo algoritmo de resolucao de `Actor`, ate o passo
"`User` resolvido" -- o atributo adicional "e Platform Admin" e
resolvido depois, separadamente (secao 21), nunca dentro deste
algoritmo de identidade.

## 13. Fronteira de Autorizacao (Authorization Boundary)

Reafirmado sem excecao: **`Actor` autentica. `Membership` autoriza.**
`authorize()` (`core/authorization.ts`) continua sendo o unico ponto de
decisao de autorizacao organizacional, e continua consultando
`Membership` no **estado atual do banco**, nunca de um snapshot
embutido no token -- exatamente como ja funciona hoje, sem nenhuma
alteracao de comportamento.

Nenhuma Role organizacional (`owner`/`admin`/`member`) e, em nenhuma
circunstancia, lida de uma claim do JWT. Se o Supabase Auth algum dia
oferecer "custom claims", esta SPEC proibe usa-las como fonte de
autorizacao de negocio -- usa-las duplicaria `Membership` como segunda
fonte de verdade, o mesmo erro que ADR-0025 ja rejeitou para
`AccessGrant` (alternativas A/B/D daquela ADR).

## 14. AccessGrant

Formalizacao do caso critico ja antecipado por ADR-0026:

```text
sessao valida (Actor resolvido com sucesso)
  +
AccessGrant revogado (ADR-0025/SPEC-027)
  +
Membership inactive
  =
proxima operacao protegida: NEGADA
```

Isso e garantido inteiramente por `authorize()` revalidar
`Membership.status` a cada requisicao (INV-08) -- **nao exige nenhuma
revogacao de JWT como condicao para a revogacao de acesso
organizacional ser efetiva.** Um `Actor` valido apenas prova identidade;
a proxima chamada que tentar usar aquele `Membership` ja revogado e
negada normalmente, sem nenhuma mudanca em `AccessGrant.revoke`
(migration `0031`, ja imutavel, permanece intocada).

Revogacao administrativa de sessao (logout global, secao 9) e uma
**defesa adicional, independente e opcional**, util quando existe
suspeita de comprometimento de credencial (cenario diferente de
revogacao de `AccessGrant`, que trata de governanca de acesso
organizacional, nao de seguranca de credencial). As duas revogacoes
nunca sao a mesma operacao e nunca dependem uma da outra.

## 15. Convite

Modelo conceitual minimo (fisico final para o plano tecnico): tabela
propria de convite (`invitations`, nome a confirmar), com:

| Campo                                   | Obrigatorio | Observacao                                                                                                                                 |
| --------------------------------------- | ----------: | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`                                    |         Sim | Identificador interno.                                                                                                                     |
| `organization_id`                       | Condicional | `NULL` apenas no caso de bootstrap do primeiro tenant (secao 16); obrigatorio em convite normal.                                           |
| `email`                                 |         Sim | Normalizado (mesma regra de SPEC-002).                                                                                                     |
| `role`                                  |         Sim | Role pretendida (`owner` apenas no caso de bootstrap; `admin`/`member` em convite normal). Imutavel apos criacao.                          |
| `status`                                |         Sim | `pending`, `accepted`, `expired`, `cancelled`.                                                                                             |
| `created_by_user_id`                    |         Sim | Ator que criou o convite.                                                                                                                  |
| `resolved_user_id`                      |         Nao | Preenchido no momento da criacao SE o e-mail ja pertence a um `User` existente (secao 7); usado para nao criar `User` duplicado no aceite. |
| `expires_at`                            |         Sim | Prazo de validade.                                                                                                                         |
| `accepted_at` / `accepted_by_user_id`   |         Nao | Preenchidos no aceite.                                                                                                                     |
| `cancelled_at` / `cancelled_by_user_id` |         Nao | Preenchidos em cancelamento explicito.                                                                                                     |
| `created_at` / `updated_at`             |         Sim | Tecnicos.                                                                                                                                  |

Fluxo normativo:

1. owner/admin (RBAC, secao 25) cria convite para um e-mail + role numa
   `Organization`;
2. aplicacao verifica se `email` ja pertence a um `User` com
   `AuthIdentity` confirmada:
   - **se sim:** este fluxo de convite-por-e-mail **nao se aplica** --
     a chamada ao provider (`inviteUserByEmail`) retornaria erro para
     e-mail ja confirmado (comportamento documentado do provider,
     verificado nesta tarefa). Anexar uma `Organization` adicional a um
     `User` ja confirmado usa o mecanismo ja existente
     (`POST /organizations/:id/memberships`, operado por quem ja
     conhece o `userId`) -- notificar esse usuario por e-mail sobre o
     novo convite fica fora do escopo desta SPEC (secao 2, gap de e-mail
     transacional de negocio);
   - **se o e-mail pertence a um `User` interno SEM `AuthIdentity`
     ainda** (por exemplo, `User` de teste/legado): `resolved_user_id`
     e preenchido com esse `User`; o convite prossegue normalmente, mas
     o aceite vincula a `AuthIdentity` nova a esse `User` ja existente,
     nunca cria um segundo;
   - **se o e-mail nao pertence a nenhum `User`:** `resolved_user_id`
     fica nulo; o aceite criara um `User` novo;
3. aplicacao grava o convite localmente, `status='pending'` (passo
   durave1, ver secao 27 -- ocorre ANTES da chamada ao provider);
4. aplicacao chama a API administrativa do provider
   (`inviteUserByEmail`), que cria a `AuthIdentity` nao confirmada e
   envia o e-mail;
5. convidado clica no link, confirma e-mail, define credencial (fluxo
   inteiramente do provider);
6. aplicacao recebe a confirmacao (redirecionamento/callback,
   detalhamento tecnico fora do escopo desta SPEC) e materializa:
   `User` (novo ou `resolved_user_id` existente) + `AuthIdentity` +
   `Membership` (`active`, `role` do convite), tudo numa unica
   transacao local, marcando o convite `accepted`;
7. `Membership` **so passa a existir neste passo 6, nunca antes.**

Regras adicionais:

- **Um convite `pending` por `(organization_id, email)`:** no maximo um
  -- mesmo padrao ja usado em todo o dominio pos-contratacao (indice
  parcial unico sobre estado nao-final, como `idx_employments_
one_non_final`/`idx_offboardings_one_non_final`/`idx_access_grants_
one_active_per_membership`). Uma segunda tentativa de convite para o
  mesmo par enquanto o primeiro ainda esta `pending` e recusada com
  conflito seguro.
- **Convite expirado:** `status` transiciona para `expired`
  (automaticamente na proxima leitura relevante, ou por rotina futura --
  mecanismo exato fica para o plano tecnico); aceite de convite expirado
  e recusado.
- **Convite reutilizado (replay):** aceite so e valido enquanto
  `status='pending'`; segunda tentativa de aceite sobre o mesmo convite
  ja `accepted` e idempotente (retorna o mesmo resultado, nunca cria
  `Membership` duplicado) -- mesmo padrao de idempotencia ja usado em
  todo o projeto.
- **Convite cross-tenant:** o `organization_id` do convite e sempre
  derivado do contexto autorizado do criador no servidor, nunca do
  payload -- mesma disciplina ja aplicada a toda criacao tenant-safe do
  projeto.
- **Alterar role antes do aceite:** proibido -- `role` e imutavel apos
  criacao do convite (mesmo principio de proveniencia imutavel ja usado
  por `Employment`/`AccessGrant`). Para mudar, cancelar o convite
  existente e criar um novo.
- **Organization archived antes do aceite:** o aceite (passo 6) DEVE
  revalidar `Organization.status='active'` dentro da propria transacao
  antes de criar o `Membership` -- mesmo padrao ja fechado por
  AccessGrant (Fase 28, `requireActiveOrganization`). Se arquivada, o
  aceite falha com erro seguro; o convite pode ser cancelado
  manualmente depois.
- **Convite duplicado (mesmo e-mail, organizacoes diferentes,
  simultaneamente):** permitido -- convites sao por `(organization_id,
email)`, nao apenas por `email`; uma pessoa pode ser convidada para
  mais de uma `Organization` ao mesmo tempo, cada convite independente.

## 16. Bootstrap do Primeiro Tenant

ADR-0026 ja fechou que criacao de `Organization` continua exclusiva de
Platform Admin (SPEC-004, inalterada). Esta secao fecha o fluxo real,
eliminando a dependencia de `/api/dev/users`:

1. Platform Admin (autenticado pelo mesmo provider, identificado por
   allow-list interna, secao 21) informa: dados da `Organization` +
   e-mail do futuro owner;
2. mesma verificacao da secao 15 (passo 2): se o e-mail ja pertence a
   um `User` confirmado, `resolved_user_id` e preenchido e o convite de
   bootstrap prossegue sem chamar `inviteUserByEmail`;
3. se o e-mail nao pertence a ninguem: aplicacao grava um convite de
   bootstrap (mesma tabela conceitual da secao 15, `organization_id`
   NULO, com um campo adicional conceitual para os dados da
   `Organization` pendente -- fisico exato fica para o plano tecnico) e
   chama `inviteUserByEmail`;
4. convidado aceita (mesmo fluxo da secao 15, passos 4-5);
5. no aceite de um convite de bootstrap: a aplicacao invoca a MESMA
   operacao atomica ja existente (`CoreService.createOrganization`,
   inalterada) -- `Organization` + primeiro `Membership` `owner` sao
   criados juntos, na mesma transacao ja testada
   (`tests/phase1/*`), agora com o `User` real (novo ou
   `resolved_user_id`) como `initialOwnerUserId`;
6. se o e-mail ja pertencia a um `User` confirmado (passo 2), o
   Platform Admin pode pular direto para `createOrganization` sem
   nenhum convite, ja que a identidade ja esta provada -- esse caminho
   continua identico ao fluxo ja existente hoje, apenas com um `User`
   real em vez de um `User` de teste.

Isso elimina completamente a dependencia funcional de
`POST /api/dev/users` para operacao em producao -- esse endpoint
permanece existindo apenas como utilitario de development/test (secao
22).

## 17. Signup

**Decisao explicita: nao existe signup publico nesta Fase.** Nenhuma
rota permite que uma pessoa crie sua propria conta sem estar respondendo
a um convite (normal ou de bootstrap, secoes 15/16) previamente criado
por alguem ja autorizado (owner/admin de uma `Organization`, ou Platform
Admin). Justificativa: o modelo de produto e B2B/multiempresa
controlado (SPEC-004: apenas Platform Admin cria `Organization`); um
`User` sem nenhum `Membership` nao tem nenhuma acao util a realizar
(INV-02); permitir criacao de conta livre so aumentaria superficie de
abuso (contas orfas, enumeracao, spam de convite) sem nenhum beneficio
de produto hoje. Autosservico publico de `Organization` permanece
capacidade futura explicitamente registrada (ADR-0026, secao 2 desta
SPEC), nao decidida aqui.

## 18. Senha

A aplicacao nunca recebe, processa ou persiste senha -- nem em texto
simples, nem como hash proprio. Delegacao total ao Supabase Auth
(decisao ja fechada em ADR-0026, reafirmada aqui). Politica de
complexidade de senha, se configurada, e responsabilidade do provider
(configuracao de projeto, fora do escopo desta SPEC). Nao revelar
existencia de conta em nenhuma resposta de login/reset (RN-009 de
SPEC-002, reforcada). Rate limiting de tentativas de credencial e
responsabilidade nativa do provider (secao 29).

## 19. Password Reset

Lifecycle: `requested` -> provider emite link/token de uso unico com
expiracao -> pessoa acessa o link -> nova senha definida -> `completed`.
A aplicacao nunca gera nem valida o token de reset -- delega
integralmente ao provider. Comportamento apos reset bem-sucedido:
**todas as sessoes/refresh tokens anteriores daquele `AuthIdentity`
devem ser invalidadas** (mesmo padrao ja nativo do provider para troca
de credencial) -- um reset de senha bem-sucedido e, por definicao, um
evento de possivel comprometimento anterior, entao sessoes antigas nao
devem sobreviver a ele. Protecao contra enumeration: resposta de
"solicitar reset" e sempre a mesma, independente de o e-mail existir ou
nao (delegado ao comportamento padrao do provider, reforcado como
requisito aqui). Protecao contra replay: token de reset e de uso unico
(nativo do provider).

## 20. Verificacao de E-mail

Obrigatoria antes de uma `AuthIdentity` poder autenticar por completo
(fluxo padrao do provider) -- sem e-mail verificado, nenhum `Actor`
valido e produzido a partir dessa identidade (INV-09 aplicado aqui).
Reenvio de verificacao: operacao do provider, sujeita ao mesmo rate
limiting das demais rotas de autenticacao (secao 29). Link expirado:
tratado como falha segura, pessoa deve solicitar novo envio. Replay de
link ja usado: idempotente do lado do provider (confirmar identidade ja
confirmada nao e erro, apenas nao-operacao). Mudanca posterior de
e-mail: fora do escopo detalhado desta SPEC (secao 7).

## 21. Platform Admin

Allow-list interna, do lado da aplicacao -- uma tabela/lista propria
(fisico exato para o plano tecnico) correlacionada por `users.id`,
**nunca** por claim do JWT do provider, nunca por header
client-controlled (fim de `x-dev-platform-admin` fora de dev/test,
secao 22). Autenticacao de um Platform Admin passa pelo MESMO fluxo de
`Actor` das secoes 8/12 -- a unica diferenca e o atributo adicional,
resolvido depois, exclusivamente pela allow-list. Somente quem ja e
Platform Admin (ou um processo operacional documentado fora desta SPEC,
por exemplo uma migracao de dados administrativa autorizada
manualmente) pode adicionar outro Platform Admin -- esta SPEC nao
define a interface exata dessa administracao (fora do escopo, fica para
o plano tecnico ou para uma revisao futura se necessario). Leituras
administrativas ja existentes em todo o dominio pos-contratacao (motivo
obrigatorio + auditoria) permanecem exatamente como estao, inalteradas.

**MFA para Platform Admin: registrada como requisito FUTURO
obrigatorio, nao implementado por esta SPEC.** Justificativa do adiamento:
Platform Admin ja e, hoje, o perfil de maior privilegio do sistema
(zero mutacao de negocio, mas leitura administrativa cross-tenant); TOTP
e uma capacidade nativa e gratuita do provider escolhido (ADR-0026), o
que torna a adicao futura de baixo custo tecnico quando priorizada --
mas exigir MFA agora ampliaria o escopo desta SPEC sem uma fonte
normativa que ja o demande hoje. Registrado aqui explicitamente para
nao ser esquecido, nao para ser adiado indefinidamente sem revisao.

## 22. Dev/Test Auth

`dev-auth.ts` **permanece existindo**, sem nenhuma remocao, restrito
exatamente como hoje a `APP_ENV=development`/`test`
(`ADR-0003`, inalterada). A resolucao de `Actor` passa a ter duas
implementacoes possiveis por tras da mesma interface (`getActor`):

- **development/test:** `dev-auth.ts` (headers `x-dev-user-id`/
  `x-dev-platform-admin`) permanece o mecanismo usado pelos testes
  automatizados (`tests/phase1/*` e todos os demais) -- nenhuma
  suite de teste existente precisa mudar por causa desta SPEC.
- **qualquer outro `APP_ENV`:** somente o mecanismo desta SPEC
  (verificacao de JWT do Supabase Auth) esta disponivel. `dev-auth.ts`
  continua tecnicamente presente no codigo, mas sua trava de
  `appEnv !== "development" && appEnv !== "test"` (ja existente,
  reforcada, nunca enfraquecida) garante que ele nunca responde fora
  desses ambientes.

Nunca as duas implementacoes coexistem simultaneamente disponiveis no
mesmo processo em execucao -- a escolha e determinada exclusivamente por
`APP_ENV` no momento da inicializacao/requisicao, nunca por qualquer
dado vindo do cliente. Headers `x-dev-user-id`/`x-dev-platform-admin`
**devem ser ignorados/rejeitados** (nunca lidos) fora de
`development`/`test`, exatamente como o codigo atual ja garante.

## 23. Rotas Publicas

Continuam anonimas, sem nenhuma mudanca introduzida por esta SPEC:

- portal publico de vagas (SPEC-019);
- candidatura publica (SPEC-020);
- token de proposta (SPEC-015);
- `GET /api/health` (mesmo estatico de hoje -- mudanca para validar
  dependencias reais fica para Production Hardening, fora do escopo);
- callbacks/redirecionamentos necessarios do fluxo do provider
  (confirmacao de e-mail, aceite de convite, reset de senha) -- estes
  SAO publicos por definicao (a pessoa ainda nao tem sessao no momento
  em que os acessa), mas nunca expoem nem aceitam nada alem do que o
  fluxo do provider exige.

Nenhuma rota publica existente se torna privada por efeito colateral
desta SPEC.

## 24. API Conceitual

| Operacao                                | Finalidade                                   | Quem chama o provider                                                    |
| --------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------ |
| Login                                   | Autenticar credencial, obter sessao          | Frontend chama o provider diretamente; API da aplicacao nunca ve a senha |
| Logout                                  | Encerrar sessao local (+ notificar provider) | Aplicacao                                                                |
| Refresh                                 | Renovar access token                         | Frontend/provider (transparente)                                         |
| Consultar sessao atual (`me`)           | Retornar `User` + `Organizations` acessiveis | Aplicacao                                                                |
| Criar convite                           | Convidar e-mail para uma Organization/role   | Aplicacao (chama `inviteUserByEmail` quando aplicavel)                   |
| Listar convites                         | Consultar convites de uma Organization       | Aplicacao                                                                |
| Cancelar convite                        | Encerrar convite pendente                    | Aplicacao                                                                |
| Aceitar convite                         | Materializar User/AuthIdentity/Membership    | Aplicacao (apos confirmacao do provider)                                 |
| Bootstrap de Organization               | Criar Organization + convite de owner        | Aplicacao (Platform Admin)                                               |
| Solicitar reset de senha                | Iniciar fluxo de reset                       | Frontend chama o provider diretamente                                    |
| Reenviar verificacao de e-mail          | Reenviar confirmacao                         | Frontend chama o provider diretamente                                    |
| Revogar sessao (propria ou de terceiro) | Logout global                                | Aplicacao (chama API administrativa do provider)                         |

Fronteira explicita: operacoes que sao puramente do dominio do provider
(login com senha, definir nova senha apos reset, reenvio de
verificacao) sao chamadas **diretamente pelo frontend ao provider**,
nunca proxied pela API da aplicacao -- a aplicacao nunca precisa ver a
senha em nenhum momento. Operacoes que precisam de estado local
(convite, Membership, Organization, allow-list de Platform Admin,
revogacao administrativa) passam pela API da aplicacao. Nenhum endpoint
de "criar senha"/"validar senha" e definido do lado da aplicacao.

## 25. RBAC das Operacoes de Autenticacao

| Acao                                                        | owner | admin | member |                Platform Admin                |
| ----------------------------------------------------------- | :---: | :---: | :----: | :------------------------------------------: |
| Criar convite (role `member`)                               |  Sim  |  Sim  |  Nao   |                     Nao                      |
| Criar convite (role `admin`)                                |  Sim  |  Nao  |  Nao   |                     Nao                      |
| Criar convite (role `owner`)                                |  Nao  |  Nao  |  Nao   | Nao (bootstrap e caminho separado, secao 16) |
| Listar/cancelar convites da propria Organization            |  Sim  |  Sim  |  Nao   |                     Nao                      |
| Revogar a propria sessao (logout/logout global de si mesmo) |  Sim  |  Sim  |  Sim   |                     Sim                      |
| Revogar sessao de terceiro                                  |  Nao  |  Nao  |  Nao   |         Sim, com motivo e auditoria          |
| Bootstrap de Organization                                   |  Nao  |  Nao  |  Nao   |                     Sim                      |
| Administrar allow-list de Platform Admin                    |  Nao  |  Nao  |  Nao   |     Fora do escopo desta SPEC (secao 21)     |

Regras herdadas, nunca reimplementadas: a matriz de convite espelha
exatamente a matriz ja existente de SPEC-004 para
`membership.create`/`membership.manage_owner` -- admin nunca cria
convite de owner ou de outro admin, mesma restricao ja aplicada a
`CoreService.createMembership` hoje ("Admin can only add members").
`AccessGrant` **nunca** e usado como mecanismo de RBAC destas
operacoes -- a matriz acima e inteiramente nova (autenticacao), nunca
delegada a `AccessGrant`.

## 26. Idempotencia

Analisada operacao por operacao:

- **Criar convite:** exige `Idempotency-Key` da aplicacao, mesmo padrao
  ja maduro em todo o dominio pos-contratacao -- protege contra duplo
  clique/retry client-side gerando dois convites/dois e-mails para o
  mesmo par `(organization_id, email)`. A garantia do PROVIDER (nao
  criar duas `AuthIdentity` para o mesmo e-mail) e uma camada adicional,
  nao substitui a chave de idempotencia da aplicacao, porque a escrita
  LOCAL (linha de convite) precisa da mesma protecao antes mesmo de
  chamar o provider.
- **Aceitar convite:** idempotente por natureza (secao 15) -- reentrada
  sobre um convite ja `accepted` retorna o mesmo `User`/`Membership`,
  nunca duplica. Nao depende de `Idempotency-Key` explicita porque a
  chave natural (`external_id` do provider + `invitation.id`) ja e
  suficiente para detectar reentrada -- decisao explicita de nao exigir
  uma chave adicional aqui, ja que o proprio fluxo de confirmacao do
  provider e naturalmente de unica ocorrencia por identidade.
- **Materializacao de `User`/`AuthIdentity`/`Membership` no aceite:**
  deve ser seguramente reentrante -- se `AuthIdentity` para aquele
  `external_id` ja existir, tratar como ja materializado e retornar o
  resultado existente, nunca tentar criar de novo (ver secao 27, ponto
  critico de atomicidade).
- **Bootstrap:** mesma chave de idempotencia da criacao de convite,
  mais a atomicidade ja existente e testada de
  `CoreService.createOrganization` (inalterada) para a etapa final.
- Nao respondido apenas com "o provider cuida" em nenhum dos pontos
  acima -- cada um foi analisado considerando a escrita LOCAL que
  tambem ocorre.

## 27. Atomicidade Provider <-> Banco (ponto critico)

**Nao existe transacao ACID unica entre uma chamada HTTP ao Supabase
Auth e uma escrita no PostgreSQL da aplicacao.** Esta secao define o
comportamento normativo para cada combinacao de sucesso/falha, com uma
regra de ORDEM que minimiza o pior caso:

**Regra de ordem obrigatoria: a escrita LOCAL que, se ficar orfa, e
inofensiva, sempre ocorre ANTES da chamada externa ao provider que, se
ficar orfa, seria perigosa ou confusa.**

- **Criar convite -- DB grava primeiro, provider depois:**
  1. aplicacao grava o convite localmente (`status='pending'`),
     comprometido (`COMMIT`) antes de qualquer chamada externa;
  2. aplicacao chama `inviteUserByEmail`.
  - Se o passo 2 falhar (rede, provider indisponivel): o convite local
    existe, mas nenhum e-mail foi enviado -- **inofensivo**: o convite
    fica `pending` sem nunca ser aceito, expira normalmente (secao 15),
    ou o owner/admin pode acionar reenvio (nova chamada ao passo 2 sobre
    o mesmo convite, seguramente reentrante -- o provider ja trata
    reenvio de convite para e-mail nao confirmado sem erro).
  - Se o passo 1 falhasse (nunca deveria, mas hipoteticamente) antes do
    passo 2: a aplicacao simplesmente nao chama o passo 2 -- nenhuma
    chamada externa ocorre sem o registro local correspondente.
- **Aceitar convite -- provider confirma primeiro (fora do controle da
  aplicacao, e o proprio usuario que aciona), materializacao local
  depois:**
  1. provider confirma a identidade (evento que a aplicacao recebe via
     callback/redirecionamento -- momento em que a aplicacao entra em
     acao);
  2. aplicacao materializa `User`/`AuthIdentity`/`Membership` localmente,
     numa unica transacao.
  - Se o passo 2 falhar (erro de banco, timeout): a `AuthIdentity` ja
    esta confirmada do lado do provider, mas nenhum vinculo local
    existe ainda -- **recuperavel, nunca perdido**: a proxima tentativa
    de login (ou um retry automatico do proprio fluxo de aceite)
    encontra a identidade ja confirmada no provider e RETENTA o passo 2
    (idempotente, secao 26) ate ter sucesso. Enquanto o passo 2 nao
    concluir, a pessoa tem uma identidade confirmada mas nenhum `Actor`
    resolvivel (fail-closed, INV-09) -- nunca um estado inseguro, apenas
    um estado "ainda nao completou o aceite do lado da aplicacao".
- **Bootstrap:** mesma logica de "aceitar convite" para a materializacao
  de identidade, seguida da chamada, ja atomica e ja testada, de
  `CoreService.createOrganization` -- se esta ultima falhar, toda a
  transacao de criacao de Organization reverte (garantia ja existente,
  inalterada); a identidade/`User` ja materializados permanecem validos
  e a operacao pode ser retentada.
- **Convite duplicado por corrida real** (duas chamadas concorrentes de
  criacao de convite para o mesmo par): resolvido pelo indice parcial
  unico local (secao 15) -- a segunda escrita local falha antes de
  qualquer chamada ao provider ocorrer, entao nunca ha dois e-mails de
  convite para o mesmo par por corrida.
- **`User` criado sem `Membership`** (aceite materializa `User`+
  `AuthIdentity` mas falha antes de criar `Membership`): tratado dentro
  da MESMA transacao local do passo 2 acima -- `User`, `AuthIdentity` e
  `Membership` sao criados atomicamente juntos ou nenhum e criado
  (rollback), nunca um estado parcial onde `User` existe mas
  `Membership` nao (ao contrario do "Auth Identity confirmada mas
  materializacao local pendente", que E um estado transitorio aceitavel
  e recuperavel, descrito acima).
- **`AuthIdentity` criada sem `User`:** nunca pode ocorrer como
  resultado desta SPEC -- `AuthIdentity` so e escrita localmente dentro
  da mesma transacao que cria/associa o `User` (mesmo ponto acima).

## 28. Concorrencia

Resultados deterministicos catalogados:

- **invite x invite** (mesmo par `organization_id`+`email`): indice
  parcial unico local garante que apenas um `pending` sobrevive; a
  segunda tentativa recebe conflito seguro, nunca duplica nem envia
  dois e-mails.
- **invite x `User` existente sendo criado simultaneamente** (corrida
  entre um convite sendo processado e outro fluxo criando um `User`
  com o mesmo e-mail): resolvido pela unicidade de `email` ja existente
  em `users` (SPEC-002 RN-001) -- quem confirmar por ultimo encontra o
  `User` ja existente e reaproveita, nunca duplica.
- **accept x accept** (mesmo convite, duas confirmacoes quase
  simultaneas -- cenario improvavel dado que a confirmacao e do
  provider, mas coberto): a materializacao local (secao 27) e
  idempotente por natureza (chave: `external_id`/`invitation.id`) --
  a segunda execucao encontra o trabalho ja feito e retorna o mesmo
  resultado, nunca cria `Membership` duplicado.
- **accept x Organization archive:** revalidacao de `Organization.
status='active'` dentro da mesma transacao da materializacao (secao 15) -- se o arquivamento confirmar antes, o aceite falha com erro
  seguro (mesma janela residual ja documentada e aceita para
  `AccessGrant` na Fase 28: nenhum lock global sobre `organizations`
  existe hoje em nenhum dominio deste projeto).
- **accept x Membership creation por outro caminho** (por exemplo,
  owner adiciona a pessoa manualmente via `POST /memberships` enquanto
  o convite tambem esta sendo aceito): a restricao ja existente de
  `Membership` unico por `(organization_id, user_id)` (migration 0002,
  inalterada) resolve deterministicamente -- quem confirmar por
  ultimo recebe conflito seguro (23505 traduzido), nunca dois
  `Membership` para o mesmo par.
- **login x Membership deactivate:** ortogonal -- login apenas resolve
  `Actor`; a proxima operacao que depende de `Membership` revalida seu
  estado atual, independente de quando o login ocorreu (INV-08).
- **refresh x logout:** se logout ocorrer primeiro, o refresh token
  associado ja foi invalidado do lado do provider -- a tentativa de
  refresh subsequente falha, tratada como sessao expirada (secao 9).
- **reset x reset** (dois pedidos de reset simultaneos): responsabilidade
  nativa do provider -- token de uso unico garante que apenas um reset
  efetivamente altera a senha; o outro token, se usado depois, e
  invalido (ja consumido ou superado pelo mais recente, comportamento
  padrao do provider).
- **reset x login:** se um login bem-sucedido ocorrer com a senha
  antiga enquanto um reset esta pendente (nao concluido), nada muda
  ainda -- o reset so tem efeito quando efetivamente completado (secao
  19); nenhuma ambiguidade.
- **email change x invite:** fora do escopo detalhado (secao 7); fluxo
  de mudanca de e-mail nao definido por esta SPEC, entao esta
  combinacao fica registrada como ambiguidade futura (secao 46), nao
  resolvida por analogia agora.
- **Platform Admin revoke (de outro Platform Admin) x requisicao em
  voo:** revogacao de Platform Admin (fora do escopo exato desta SPEC,
  secao 21) nunca invalida requisicoes ja em processamento no momento
  exato da revogacao -- a proxima requisicao apos a mudanca na
  allow-list e que reflete o novo estado, mesmo principio ja aceito
  para mudanca de `role` de `Membership` (RN-013 de SPEC-004: "mudanca
  de Role produz efeito nas proximas requisicoes").

## 29. Rate Limiting

- **Login, reset de senha, reenvio de verificacao, MFA (quando
  existir):** rate limiting nativo do Supabase Auth nas proprias
  rotas -- nao reimplementado pela aplicacao.
- **Criar convite, aceitar convite, bootstrap, revogar sessao de
  terceiro:** protegidos pelo `RateLimiter` in-memory ja existente
  (`core/rate-limiter.ts`), mesmo padrao ja usado para propostas,
  avaliacoes comportamentais, pre-entrevistas e candidatura publica --
  nenhuma nova implementacao de rate limiting criada por esta SPEC,
  apenas reaproveitamento.
- **Refresh:** delegado ao comportamento do provider (rotacao +
  deteccao de reuso ja limita abuso por natureza).
- Limitacao ja conhecida e registrada (nao criada nem agravada por esta
  SPEC): o `RateLimiter` in-memory nao serve multiplas instancias do
  processo -- continua sendo divida tecnica preexistente, fora do
  escopo resolver aqui.

## 30. Auditoria

Catalogo definitivo de eventos desta SPEC (substitui a lista preliminar
de ADR-0026, corrigindo a contagem e fechando o payload positivo de
cada um):

| Evento                                  | Payload positivo minimo                                                                                    |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `auth.login_succeeded`                  | `userId`, `authIdentityId`                                                                                 |
| `auth.login_failed`                     | motivo minimizado (nunca detalha qual credencial falhou)                                                   |
| `auth.logout`                           | `userId`                                                                                                   |
| `auth.session_revoked`                  | `userId` alvo, `revokedByUserId`, motivo (quando Platform Admin ou o proprio usuario aciona logout global) |
| `auth.password_reset_requested`         | `userId` (se resolvido) -- nunca confirma existencia da conta na resposta                                  |
| `auth.password_reset_completed`         | `userId`                                                                                                   |
| `auth.email_verified`                   | `userId`, `authIdentityId`                                                                                 |
| `auth.invitation_created`               | `invitationId`, `organizationId`, `role`, `createdByUserId`                                                |
| `auth.invitation_cancelled`             | `invitationId`, `cancelledByUserId`                                                                        |
| `auth.invitation_accepted`              | `invitationId`, `userId`, `membershipId`                                                                   |
| `auth.invitation_expired`               | `invitationId`                                                                                             |
| `auth.bootstrap_organization_requested` | `invitationId` conceitual, `createdByUserId` (Platform Admin)                                              |
| `auth.permission_denied`                | acao tentada, ator (quando aplicavel, em paralelo aos eventos de negacao ja existentes por dominio)        |

Proibido registrar, sem excecao, em qualquer evento acima ou em
qualquer log de aplicacao: senha, hash de senha, JWT (access ou
refresh), cookie, header `Authorization`, token de reset, token de
verificacao, service-role key.

## 31. Privacidade

Lista positiva: `userId`/`authIdentityId` (identificadores internos,
`external_id` tratado como opaco, nunca exposto fora do necessario),
`email` (ja e dado tratado hoje por `users`, sem mudanca de tratamento),
timestamps. IP e user-agent **nao sao persistidos por padrao** -- nao ha
necessidade de dominio demonstrada nesta SPEC que justifique coleta-los;
se uma necessidade futura de deteccao de abuso exigir, sera uma revisao
propria, com sua propria justificativa de retencao minimizada (nao
decidido aqui, registrado como ambiguidade, secao 46). Auditoria de
autenticacao nunca vira deposito de dados pessoais alem do minimo
listado.

## 32. Seguranca (Threat Model)

| Ameaca                    | Controle arquitetural                                                                                                                                                        |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Brute force               | Nativo do provider nas rotas de credencial                                                                                                                                   |
| Credential stuffing       | Nativo do provider + resposta generica de falha                                                                                                                              |
| Account enumeration       | Resposta identica de login/reset independente de existencia de conta (RN-009 SPEC-002, reforcada); convite nunca confirma/nega existencia de `User` ao convidante (secao 15) |
| Session fixation          | Sessao sempre emitida pelo provider apos autenticacao completa, nunca reaproveitada de estado pre-existente                                                                  |
| Session theft             | Cookie `HttpOnly`+`Secure` (nunca acessivel a JS), vida curta do access token                                                                                                |
| Refresh replay            | Rotacao + deteccao de reuso nativa do provider (secao 9)                                                                                                                     |
| CSRF                      | `SameSite=Lax` + `Content-Type: application/json` obrigatorio (secao 10)                                                                                                     |
| XSS (roubo de token)      | Cookie `HttpOnly` elimina exfiltracao do token via XSS de armazenamento (secao 10)                                                                                           |
| JWT forgery               | Verificacao de assinatura local via JWKS, `issuer`/`audience` validados (secao 11)                                                                                           |
| Actor forjado             | Impossivel sem assinatura criptografica valida (secao 12)                                                                                                                    |
| Platform Admin forjado    | Impossivel -- allow-list interna, nunca claim do provider (secao 21)                                                                                                         |
| Membership obsoleta       | `authorize()` revalida a cada requisicao, sem cache (INV-08)                                                                                                                 |
| AccessGrant revogado      | Ja garantido por `Membership.status`, sem dependencia desta SPEC (secao 14)                                                                                                  |
| Cross-tenant              | Inalterado -- 100% responsabilidade de `Membership`/FKs tenant-safe                                                                                                          |
| Invitation hijacking      | `Membership` so criada no aceite; convite nunca concede acesso por si so (secao 15)                                                                                          |
| Invitation replay         | Aceite idempotente, `status` transiciona uma unica vez para `accepted` (secao 15/26)                                                                                         |
| Reset hijacking           | Token de uso unico e expiracao, nativos do provider (secao 19)                                                                                                               |
| Email takeover            | Verificacao de e-mail obrigatoria antes de habilitar autenticacao completa (secao 20)                                                                                        |
| Service-role leakage      | Chave nunca exposta ao frontend, nunca logada, nunca auditada (secao 37)                                                                                                     |
| Provider compromise       | Fora do controle direto da aplicacao; mitigado por `authorize()` nunca confiar em autorizacao vinda do provider e por MFA futura para Platform Admin (secao 21)              |
| JWKS/key rotation failure | Cache com TTL e revalidacao ao encontrar `kid` desconhecido (secao 11)                                                                                                       |

## 33. Multiempresa

Provado explicitamente: um `User` autenticado pode possuir `N`
`Membership` em `Organizations` distintas (SPEC-002 RN-003, inalterada).
`Actor` e o mesmo objeto independente de quantos `Membership` existem
(secao 12) -- nenhuma "Organization da sessao" e fixada no token ou em
qualquer estado do lado da autenticacao. Toda operacao organizacional
continua recebendo/resolvendo o contexto de `Organization`
explicitamente na rota e validando `Membership` correspondente no
servidor, exatamente como hoje -- esta SPEC nao adiciona nenhum atalho
que inferisse contexto do token.

## 34. No-delete / Lifecycle

Distincao explicita entre duas categorias de dado, com regras
diferentes:

- **Dados de negocio desta SPEC** (`invitations`, a ponte
  `auth_identities`): seguem o mesmo principio de no-delete ja usado em
  todo o dominio pos-contratacao -- nenhum DELETE fisico no fluxo
  normal; `invitation` cancelada/expirada permanece como registro
  historico (`status` muda, linha nunca desaparece); `auth_identities`
  nunca e apagada pelo fluxo normal enquanto o `User` associado existir.
- **Dados de autenticacao do provider** (credencial, sessao, token):
  **nao** seguem o principio de no-delete de agregados de negocio --
  revogacao de sessao (logout, logout global, reset de senha) e uma
  operacao normal e esperada de invalidar/apagar esses artefatos do
  lado do provider, exatamente como qualquer sistema de autenticacao
  real exige. O principio "mudancas destrutivas exigem revisao humana"
  (`CONSTITUICAO_DO_PROJETO.md`) aplica-se a dados de NEGOCIO, nunca a
  credenciais/sessoes, que sao dados operacionais de seguranca com
  ciclo de vida proprio e mais curto por natureza.

## 35. Migracao de Usuarios Existentes

Confirmado por inspecao fisica (ADR-0026, reafirmado aqui): **nao existe
hoje nenhum `User` real em nenhum ambiente auditado.** Nao ha usuario
legado a migrar no momento desta SPEC.

Regra para o hipotetico futuro em que `users` internos sem
`AuthIdentity` associada existam (por exemplo, dados de um piloto
anterior a esta SPEC):

- **nunca** associacao automatica por coincidencia de nome;
- **nunca** associacao automatica silenciosa por coincidencia de
  e-mail sem um evento de confirmacao explicito;
- associacao segura exige um fluxo de "primeira ativacao" -- a pessoa
  precisa provar, atraves do proprio fluxo do provider (confirmar
  posse do e-mail), controle sobre a identidade antes de qualquer
  vinculo com o `User` interno existente;
- **conflito bloqueia**, nunca escolhe silenciosamente um dos lados --
  se dois `User` internos tiverem o mesmo e-mail (nao deveria ocorrer,
  RN-001 de SPEC-002 ja proibe, mas hipoteticamente), a migracao para
  aquele e-mail e recusada ate resolucao manual;
- zero backfill inferido -- mesmo principio ja fixado por SPEC-025 s5.2
  e SPEC-016 v1.1 s52, aplicado aqui a identidade.

## 36. Comportamento de Falha

| Falha                                                    | Comportamento                                                                                                                                                                                             |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Supabase Auth indisponivel                               | Login/refresh/reset/verificacao NOVOS falham (fail-closed, erro seguro); sessoes com JWT ja emitido e nao expirado continuam verificaveis localmente                                                      |
| JWKS indisponivel (sem cache valido)                     | Fail-closed total -- nenhuma sessao verificavel                                                                                                                                                           |
| Banco de dados da aplicacao indisponivel                 | `authorize()` ja falha fechado hoje -- inalterado; resolucao de `Actor` tambem falha fechada (nao ha `AuthIdentity`/`User` a consultar)                                                                   |
| Envio de e-mail (convite/reset/verificacao) indisponivel | Convite/reset permanecem `pending`/solicitados sem confirmacao possivel ate o servico normalizar -- nunca tratado como sucesso silencioso                                                                 |
| Refresh indisponivel (provider fora do ar)               | Sessao expira normalmente quando o access token expirar -- login completo exigido depois                                                                                                                  |
| Insercao de auditoria falha                              | Mesma disciplina ja usada em todo o dominio pos-contratacao: operacao que dependia daquele registro de auditoria critica reverte (rollback), nunca e registrada como sucesso sem auditoria correspondente |
| Lookup de `Membership` falha por qualquer motivo         | Acesso negado, nunca aberto -- mesmo principio ja aplicado em toda a plataforma                                                                                                                           |

## 37. Configuracao e Segredos

Catalogo conceitual (nenhum valor real nesta SPEC):

- URL do projeto Supabase;
- chave publica/anon (se necessaria do lado do frontend para falar
  diretamente com o provider -- nunca concede privilegio administrativo);
- **service-role key: somente servidor, nunca frontend, nunca log,
  nunca auditoria, nunca resposta HTTP** -- mesma disciplina ja fixada
  em `AGENTS.md`/`SECURITY.md` para qualquer segredo de infraestrutura;
- `issuer`/`audience` esperados para validacao de JWT;
- endpoint JWKS;
- URLs de redirecionamento (confirmacao de e-mail, aceite de convite,
  reset de senha) -- devem apontar exclusivamente para dominios
  controlados pela aplicacao, nunca aceitar redirecionamento arbitrario
  (mitigacao de open redirect, reforcada aqui como requisito).

Nenhum segredo real e inserido nesta SPEC, em nenhuma hipotese --
mesma regra ja vigente para toda a documentacao do projeto.

## 38. Criterios de Aceite

### Identidade e login

- CA-001: login bem-sucedido produz `Actor` valido sem exigir
  `Membership` existente.
- CA-002: token com assinatura invalida nunca produz `Actor`.
- CA-003: token expirado nunca produz `Actor`.
- CA-004: `AuthIdentity` sem `User` correspondente nunca produz `Actor`.
- CA-005: `User` inativo nunca produz `Actor` utilizavel.

### Sessao

- CA-006: cookie de sessao e `HttpOnly`+`Secure`+`SameSite=Lax`.
- CA-007: refresh token rotaciona a cada uso.
- CA-008: reuso de refresh token ja rotacionado invalida a cadeia.
- CA-009: logout invalida a sessao local e o refresh do provider.
- CA-010: logout global invalida todas as sessoes daquele `AuthIdentity`.

### Membership/AccessGrant

- CA-011: sessao valida + `Membership inactive` = acesso negado na
  proxima operacao protegida.
- CA-012: sessao valida + `AccessGrant` revogado (`Membership`
  desativado por delegacao, Fase 28) = acesso negado na proxima
  operacao protegida, sem nenhuma mudanca em `AccessGrant`.
- CA-013: nenhuma Role organizacional e lida de claim do JWT.
- CA-014: `authorize()` continua consultando `Membership` no estado
  atual do banco, nunca de snapshot do token.

### Convite

- CA-015: convite nao cria `Membership` antes do aceite.
- CA-016: aceite de convite `pending` valido cria `User` (ou reaproveita
  existente)+`AuthIdentity`+`Membership` atomicamente.
- CA-017: segundo convite `pending` para o mesmo par
  `(organization_id,email)` e recusado com conflito seguro.
- CA-018: convite expirado nao pode ser aceito.
- CA-019: convite ja aceito, aceito de novo, e idempotente.
- CA-020: convite cross-tenant e bloqueado (organization_id sempre do
  contexto do servidor).
- CA-021: aceite sobre `Organization` arquivada e recusado.
- CA-022: `role` do convite e imutavel apos criacao.
- CA-023: convite para e-mail com `AuthIdentity` ja confirmada nao
  chama a API de convite do provider.

### Bootstrap

- CA-024: apenas Platform Admin aciona bootstrap de `Organization`.
- CA-025: bootstrap cria `Organization`+primeiro owner atomicamente
  (mesma operacao ja existente e testada).
- CA-026: `/api/dev/users` nunca e exigido para bootstrap em producao.

### Platform Admin

- CA-027: atributo Platform Admin nunca vem de claim do JWT.
- CA-028: `x-dev-platform-admin` e ignorado fora de dev/test.

### Dev/test auth

- CA-029: `x-dev-user-id` nunca autentica fora de `development`/`test`.
- CA-030: `APP_ENV=production` nunca aceita headers dev, em nenhuma
  circunstancia.

### Multiempresa

- CA-031: um `User` com `N` `Membership` mantem um unico `Actor`,
  contexto de Organization sempre explicito por requisicao.

### Seguranca

- CA-032: token nunca aparece em resposta de erro, log ou auditoria.
- CA-033: senha nunca e recebida, processada ou armazenada pela
  aplicacao.
- CA-034: resposta de login/reset nunca revela existencia de conta.
- CA-035: CORS, quando configurado, nunca combina origem `*` com
  credentials.

### Auditoria e privacidade

- CA-036: todos os eventos da secao 30 sao emitidos nos pontos
  corretos.
- CA-037: nenhum evento de auditoria contem senha, token, cookie ou
  service-role key.
- CA-038: IP/user-agent nao sao persistidos por padrao.

### Falhas e concorrencia

- CA-039: provider indisponivel nao interrompe requisicoes com sessao
  ja valida e chave JWKS cacheada.
- CA-040: banco indisponivel nunca resulta em acesso aberto.
- CA-041: convite duplicado por corrida real produz exatamente um
  `pending` sobrevivente.
- CA-042: aceite concorrente do mesmo convite produz exatamente um
  `Membership`.

### Compatibilidade

- CA-043: `Membership`/RBAC/RN-006/`AccessGrant` permanecem
  byte a byte inalterados apos a implementacao desta SPEC.
- CA-044: rotas publicas existentes continuam anonimas.

## 39. Testes Obrigatorios Futuros

Quando implementada, a funcionalidade deve possuir testes destrutivos
para (nao implementados por esta SPEC):

1. login produz `Actor` sem `Membership`;
2. `x-dev-user-id` nunca autentica com `APP_ENV=production` -- prova de
   isolamento dev/prod;
3. JWT valido + `Membership inactive` nunca autoriza;
4. JWT valido + `AccessGrant` revogado nunca autoriza (integracao com
   Fase 28);
5. token com assinatura adulterada e rejeitado;
6. token expirado e rejeitado;
7. token com `issuer`/`audience` de outro projeto e rejeitado;
8. rotacao de chave JWKS nao derruba verificacao de tokens legitimos;
9. convite nao cria `Membership` antes do aceite;
10. segundo convite `pending` para o mesmo par e recusado;
11. convite expirado nao pode ser aceito;
12. aceite duplicado e idempotente;
13. convite cross-tenant e bloqueado;
14. aceite sobre `Organization` arquivada e recusado;
15. convite para e-mail com conta ja confirmada nao chama a API do
    provider de convite;
16. bootstrap cria `Organization` e primeiro owner atomicamente;
17. bootstrap exclusivo de Platform Admin;
18. Platform Admin nunca resolvido por claim do JWT;
19. revogacao de sessao de terceiro exige motivo e gera auditoria;
20. reset de senha invalida sessoes anteriores;
21. reenvio de verificacao respeita rate limiting;
22. resposta de login/reset nao revela existencia de conta (teste de
    enumeracao);
23. nenhum evento de auditoria contem senha/token/cookie/service-role
    key (teste de codigo-fonte, mesmo padrao ja usado em
    `tests/phase27/offboarding-destructive-postgres.test.ts` para a
    fronteira P-01);
24. concorrencia real: dois convites simultaneos para o mesmo par
    produzem exatamente um `pending`;
25. concorrencia real: dois aceites simultaneos do mesmo convite
    produzem exatamente um `Membership`;
26. provider indisponivel com JWKS cacheado nao interrompe requisicao
    autenticada em curso;
27. banco indisponivel resulta em negacao, nunca acesso aberto;
28. teste de adapter contra Supabase local (Supabase CLI), quando o
    plano tecnico decidir a ferramenta exata;
29. isolamento dev/prod verificado tambem por teste de integracao
    HTTP completo (nao apenas unitario).

## 40. Fora do Escopo (reforco)

Reforcado explicitamente: SSO/SAML, SCIM, login social, WebAuthn/
passkeys, MFA obrigatoria geral, autosservico publico de `Organization`,
impersonation, billing, Production Hardening geral (CI/CD, CORS
completo, observabilidade, backup/restore), notificacao por e-mail de
negocio para usuario ja confirmado convidado a nova Organization.

## 41. Compatibilidade

Confirmado, secao a secao: `authorize()` (`core/authorization.ts`)
permanece sem nenhuma linha alterada; `CoreService` permanece sem
nenhuma linha alterada; `Membership`/SPEC-003 permanece sem nenhuma
regra alterada; RN-006 (ultimo owner) permanece exclusiva de
`CoreService`, nunca duplicada; `AccessGrant`/migration `0031`
permanece imutavel, sem nenhuma mudanca exigida; APIs publicas
(SPEC-015/019/020) permanecem exatamente como estao. Toda a
implementacao futura desta SPEC e aditiva: tabelas novas
(`auth_identities`, `invitations`), zero alteracao de schema em
`users`/`memberships`/`organizations`/`access_grants`.

## 42. Impacto Fisico Futuro (conceitual, sem SQL nesta SPEC)

- Tabela nova `auth_identities` (nome final a confirmar): FK para
  `users`, UNIQUE em `user_id` (restricao de Fase 29) e UNIQUE em
  `(provider, external_id)`.
- Tabela nova `invitations` (nome final a confirmar): FK opcional para
  `organizations` (nulo apenas no caso de bootstrap), indice parcial
  unico sobre `(organization_id, email) WHERE status = 'pending'`,
  trigger de no-delete e de imutabilidade de campos de proveniencia
  (`organization_id`, `email`, `role`, `created_by_user_id`,
  `created_at`), mesmo padrao ja fisicamente comprovado em
  `employments`/`offboardings`/`access_grants`.
- Zero alteracao de schema em `users`, `memberships`, `organizations`,
  `access_grants` ou qualquer tabela existente.
- Nomes fisicos finais, tipos exatos de coluna, mecanismo exato de
  idempotencia e indices de apoio adicionais ficam para o plano
  tecnico.

## 43. Revisao Destrutiva

1. **Login valido sem Membership:** sobrevive -- secao 8, `Actor`
   produzido, nenhuma `Organization` acessivel (INV-02).
2. **Membership inactive:** sobrevive -- secao 14/CA-011, `authorize()`
   revalida a cada request.
3. **AccessGrant revoked:** sobrevive -- secao 14/CA-012, garantia
   herdada de `Membership.status`, zero mudanca em Fase 28.
4. **JWT roubado:** sobrevive -- cookie `HttpOnly` elimina exfiltracao
   via XSS de armazenamento; vida curta limita janela de uso mesmo se
   roubado por outro vetor (secao 9/10).
5. **Refresh roubado:** sobrevive -- rotacao + deteccao de reuso nativa
   do provider invalida a cadeia inteira (secao 9).
6. **JWT expirado:** sobrevive -- tratado como ausencia de sessao
   (INV-09).
7. **Key rotation:** sobrevive -- cache de JWKS com TTL e revalidacao
   por `kid` desconhecido (secao 11).
8. **Provider offline:** sobrevive -- fail-closed para operacoes novas,
   sessoes com JWKS cacheado continuam verificaveis (secao 36).
9. **DB offline:** sobrevive -- `authorize()` ja falha fechado hoje,
   resolucao de `Actor` tambem (secao 36).
10. **Email offline:** sobrevive -- convite/reset permanecem pendentes,
    nunca tratados como sucesso silencioso (secao 36).
11. **Convite duplicado:** sobrevive -- indice parcial unico local
    (secao 15/28).
12. **Convite expirado:** sobrevive -- aceite recusado (secao 15).
13. **Convite replay:** sobrevive -- aceite idempotente, `status`
    transiciona uma unica vez (secao 15/26).
14. **Accept concorrente:** sobrevive -- materializacao idempotente
    por natureza (secao 27/28).
15. **Organization archived durante aceite:** sobrevive -- revalidacao
    dentro da transacao de aceite, mesmo padrao de Fase 28 (secao 15).
16. **User existente:** sobrevive -- `resolved_user_id` evita
    duplicacao (secao 7/15).
17. **Email ja usado:** sobrevive -- unicidade de `users.email`
    (SPEC-002 RN-001) preservada, nunca duplicada (secao 7).
18. **Mudanca de email:** sobrevive parcialmente -- fluxo detalhado
    fora do escopo, sem contradicao introduzida (secao 7, registrado
    como ambiguidade).
19. **Reset concorrente:** sobrevive -- token de uso unico do provider
    resolve deterministicamente (secao 28).
20. **Logout x refresh:** sobrevive -- refresh apos logout falha,
    tratado como sessao expirada (secao 28).
21. **Ultimo owner:** sobrevive -- RN-006/`CoreService` inalterados,
    autenticacao nunca decide isso (secao 41).
22. **Multiempresa:** sobrevive -- `Actor` unico, contexto sempre
    explicito por `Membership` (secao 33).
23. **Forged organization_id:** sobrevive -- nunca confiado do payload
    ou do token, sempre resolvido/validado no servidor (INV-05).
24. **Forged Actor:** sobrevive -- impossivel sem assinatura
    criptografica valida (secao 12/32).
25. **Forged Platform Admin:** sobrevive -- allow-list interna, nunca
    claim do provider (secao 21/32).
26. **x-dev-user-id em production:** sobrevive -- trava ja existente
    de ADR-0003, reforcada, nunca contornada por esta SPEC (secao 22).
27. **x-dev-platform-admin em production:** sobrevive -- mesma trava
    (secao 22).
28. **service-role vazada ao frontend:** prevenida por design -- nunca
    enviada ao frontend em nenhum fluxo desta SPEC (secao 24/37); se
    vazada por erro operacional, e um incidente de configuracao fora
    do controle desta SPEC, nao um cenario que a arquitetura normaliza.
29. **Audit failure:** sobrevive -- rollback obrigatorio da operacao
    que dependia daquele registro critico (secao 36).
30. **Provider succeeds / DB fails:** sobrevive -- estado recuperavel
    e idempotente, nunca perdido (secao 27, cenario central desta
    SPEC).
31. **DB succeeds / provider fails:** sobrevive -- convite local
    inofensivo sem e-mail enviado, reenvio seguro (secao 27).
32. **API publica:** sobrevive -- rotas publicas inalteradas (secao
    23).
33. **Proposal token:** sobrevive -- mecanismo proprio de SPEC-015,
    nao tocado por esta SPEC (secao 23).
34. **Usuario legado:** sobrevive -- nao ha usuario legado real hoje;
    principio de nao-inferencia automatica registrado para quando
    houver (secao 35).
35. **Primeiro tenant:** sobrevive -- fluxo de bootstrap fechado sem
    reabrir SPEC-004 (secao 16).

Nenhum dos 35 cenarios exigiu enfraquecer a decisao da ADR-0026 ou
reabrir `Membership`/RBAC/`AccessGrant`. Um ponto foi fechado durante o
proprio ataque desta revisao: o cenario 15 (Organization archived
durante aceite) nao estava explicito na primeira redacao da secao 15 --
corrigido explicitamente incorporando a revalidacao transacional, no
mesmo padrao ja comprovado em Fase 28.

## 44. Verificacao contra ADR-0026

Confirmado, item a item, que esta SPEC nao alterou silenciosamente
nenhuma decisao da ADR:

- Supabase Auth: mantido como unico provider desta Fase (secao 6);
- `User` canonico interno: mantido, nenhuma tabela o substitui (secao
  6);
- `Membership` como autorizacao: mantido sem excecao (secao 13);
- `Actor` derivado de identidade verificada, nunca client-controlled:
  mantido (secao 12);
- Platform Admin interno, nunca claim do provider: mantido (secao 21);
- `dev-auth` somente dev/test: mantido (secao 22);
- APIs publicas preservadas: mantido (secao 23).

Nenhuma decisao da ADR-0026 se mostrou inviavel durante a redacao ou a
revisao destrutiva desta SPEC -- nenhuma reconciliacao de ADR e
necessaria.

## 45. Conflitos Encontrados

Nenhum conflito normativo com ADR-0003, ADR-0025, ADR-0026, SPEC-002,
SPEC-003, SPEC-004 ou SPEC-027. Todas as regras desta SPEC sao aditivas
ou delegam explicitamente a mecanismos ja existentes (provider de
identidade, `CoreService`, `authorize()`, `RateLimiter`), nunca os
reimplementam ou contradizem.

## 46. Ambiguidades Restantes

Nao bloqueantes, deixadas para o plano tecnico ou para revisao
normativa futura especifica:

- nomes fisicos finais de `auth_identities`/`invitations`
  (tabelas/colunas);
- mecanismo fisico exato de expiracao automatica de convite (rotina vs.
  verificacao preguicosa na leitura);
- interface exata de administracao da allow-list de Platform Admin;
- se/quando MFA se torna obrigatoria (nao apenas disponivel) para
  Platform Admin;
- fluxo detalhado de mudanca de e-mail de um `User` existente;
- combinacao `email change x invite` (secao 28);
- coleta/retencao de IP/user-agent, se uma necessidade futura de
  deteccao de abuso surgir;
- se/quando autosservico publico de criacao de `Organization` sera
  avaliado (nao decidido, nao proibido para sempre).

Nenhuma dessas ambiguidades foi resolvida por analogia.

## 47. Definicao de Concluido

Para esta tarefa documental:

- fontes obrigatorias lidas integralmente (secao 3);
- problema arquitetural fechado sem redefinir autorizacao (secao 4);
- invariantes fundamentais fechadas e numeradas (secao 5);
- modelo conceitual de identidade, convite e bootstrap fechados sem
  inventar decisao de produto nao suportada (secoes 6, 15, 16, 17);
- fronteira de autorizacao reafirmada sem ambiguidade (secao 13);
- integracao com `AccessGrant`/Fase 28 fechada sem exigir nenhuma
  mudanca naquele dominio (secao 14);
- atomicidade provider-banco fechada ponto a ponto, com regra de ordem
  explicita (secao 27);
- RBAC, idempotencia, concorrencia, rate limiting, auditoria,
  privacidade e seguranca definidos;
- criterios de aceite (44) e testes obrigatorios futuros (29)
  definidos;
- revisao destrutiva aplicada aos 35 cenarios exigidos, um problema
  encontrado e corrigido;
- verificacao explicita contra ADR-0026, nenhuma reconciliacao
  necessaria;
- nenhum conflito normativo restante;
- nenhum codigo, migration, banco ou teste executavel criado ou
  alterado;
- nenhum commit realizado.

Para implementacao futura:

- SPEC mantida aprovada antes do desenvolvimento;
- plano tecnico elaborado a partir das secoes 1 a 42;
- migrations reproduziveis quando houver banco;
- criterios de aceite implementados;
- testes obrigatorios implementados e passando;
- seguranca, privacidade e multiempresa revisadas;
- documentacao dependente (BACKLOG, roadmap) atualizada;
- Fase numerada formalizada somente apos plano tecnico aprovado;
- commit realizado somente na fase apropriada.
