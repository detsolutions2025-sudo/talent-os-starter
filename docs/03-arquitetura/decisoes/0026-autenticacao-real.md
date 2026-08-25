# ADR 0026 - Autenticacao Real (Identidade e Sessao)

## Status

Aceita.

## Contexto

As Fases 1-28 implementaram todo o dominio de negocio (Organization, User,
Membership/RBAC, Candidate, processo seletivo, IA opcional, Proposal,
Onboarding, OrganizationPerson/Employment, Desenvolvimento/Retencao,
Offboarding e, na Fase 28, AccessGrant) sobre uma unica identificacao
temporaria: `src/server/http/dev-auth.ts`, que le `x-dev-user-id` e
`x-dev-platform-admin` diretamente de headers HTTP, sem qualquer prova de
identidade. Esse mecanismo ja nasceu deliberadamente temporario e
autodesabilitado: `getActor()` recusa funcionar fora de `APP_ENV=development`
ou `APP_ENV=test` (`forbidden("temporary_auth_disabled", ...)`), confirmado
por leitura direta do codigo atual.

Isso ja foi antecipado normativamente duas vezes, antes desta ADR:

- **ADR-0003** ("Nucleo multiempresa da Fase 1"), Consequencias: "A troca
  futura para autenticacao real deve substituir apenas a resolucao do
  Actor, preservando a autorizacao central." Esta ADR fecha exatamente essa
  troca, sem reabrir nada mais.
- **SPEC-002** (User), secao 16 ("Limitacoes conhecidas"): "autenticacao
  real sera especificada separadamente"; RN-010: "Dados de autenticacao
  nunca devem ser armazenados em texto simples"; secao 3: "um e-mail
  representa uma unica conta global" -- `User.email` ja e, hoje, a chave de
  correlacao de identidade.

Uma auditoria de prontidao pos-Fase 28 (gate destrutivo de MVP/producao)
classificou a ausencia de autenticacao real como **P0 -- bloqueador
absoluto de producao**: em `APP_ENV=production`, a API inteira recusa toda
requisicao, sem substituto. Tambem nao existe hoje nenhum mecanismo de
convite, e o primeiro `User` de qualquer ambiente so pode ser criado via
`POST /api/dev/users` (endpoint dev-only). Confirmado por inspecao fisica:
nenhum dado real existe em nenhum ambiente auditado (contagens de
`users`/`organizations` = 0 em DEV Supabase).

`Membership` (SPEC-003) e a matriz de `authorize()` (SPEC-004) sao, hoje,
maduros, testados extensivamente (`tests/phase1/*`) e absolutamente
centrais para todo o resto do dominio -- inclusive `AccessGrant`
(ADR-0025/SPEC-027), que depende de `Membership` permanecer, sozinho, a
fonte de verdade de autorizacao tecnica. Nenhuma decisao desta ADR pode
comprometer isso.

## Objetivo

Decidir a arquitetura de identidade/autenticacao real do produto, sem
implementar codigo, sem criar migration, sem criar a SPEC futura ainda.

Esta decisao deve:

- responder como provar a identidade de um `User` real e produzir um
  `Actor` confiavel, sem o navegador poder "informar" quem ele e (ao
  contrario do `x-dev-user-id` hoje);
- preservar `Membership` como autoridade EXCLUSIVA de autorizacao
  organizacional, sem excecao;
- definir a fronteira exata entre identidade (quem a pessoa e) e
  autorizacao (o que a pessoa pode fazer);
- resolver convite e bootstrap do primeiro tenant sem inventar decisao de
  produto nao suportada pelas SPECs existentes;
- definir o comportamento de sessoes/tokens face a revogacao de
  `AccessGrant` (Fase 28);
- definir o destino de `dev-auth.ts`;
- deixar claro o que permanece em aberto para a SPEC futura.

## Definicao do Problema Arquitetural

**Pergunta central:** como provar a identidade de um `User` real em
producao e produzir um `Actor` confiavel para o sistema, preservando
`Membership` como autoridade exclusiva de autorizacao?

Vocabulario desta ADR, separado com precisao (nenhum destes conceitos e
sinonimo de outro):

- **User** (SPEC-002): conta interna global, canonica, identificada por
  `id` interno (`usr_...`) e `email` unico. Continua existindo e continua
  sendo a entidade que `Membership`/auditoria/todo o dominio referenciam.
- **Identidade autenticavel**: a prova de que uma pessoa e, de fato, o
  dono de um `User`. Hoje: nenhuma (header cru). Objeto desta ADR.
- **Credencial**: o que a pessoa apresenta para provar identidade (senha,
  magic link, OTP). Nunca armazenada pela aplicacao (ver secao "Senha").
- **Sessao**: o resultado de uma autenticacao bem-sucedida, com validade
  limitada no tempo, que permite requisicoes subsequentes sem repetir a
  credencial.
- **Actor** (`src/server/core/types.ts`, ja existente): `{kind:"user",
userId}` ou `{kind:"platform", userId}`. E o unico objeto que
  `authorize()`/`CoreService` consomem hoje. Esta ADR decide COMO ele e
  produzido a partir de uma sessao real -- nunca decide o que ele autoriza.
- **Membership** (SPEC-003): autorizacao tecnica dentro de uma
  `Organization`. Inalterada por esta ADR.
- **AccessGrant** (ADR-0025/SPEC-027): proveniencia/governanca sobre um
  `Membership` ja existente. Nunca autentica, nunca autoriza por si so.
- **Platform Admin** (SPEC-004): perfil interno da plataforma, NAO e Role
  de `Membership`. Precisa de identidade real tanto quanto qualquer User.

## Alternativas Avaliadas

### A. Autenticacao custom dentro da aplicacao

Senha com hashing local (Argon2id/bcrypt), emissao de sessao/JWT propria,
tokens de reset e verificacao de e-mail gerados e validados pela propria
aplicacao, envio de e-mail transacional proprio (nenhuma infraestrutura de
e-mail existe hoje -- `package.json` nao tem nenhuma dependencia de e-mail).

- Beneficio: zero dependencia de identidade em terceiro; modelo mental mais
  simples (sem schema externo `auth.*`, sem verificacao de JWT de
  terceiro); `password_hash` poderia viver direto em `users`.
- Custo: a aplicacao passa a ser responsavel, do zero, por toda a
  superficie mais sensivel de seguranca que existe -- armazenamento de
  senha, geracao/expiracao/uso-unico de token de reset e verificacao,
  protecao contra forca bruta/credential stuffing/enumeracao, rotacao de
  refresh token, MFA (quando exigido), e **ainda assim precisaria resolver
  envio de e-mail do zero** (reset e verificacao dependem disso), que hoje
  tambem nao existe. Ou seja: nao e realmente "mais simples" em escopo
  total -- desloca uma superficie de seguranca critica inteira para
  primeira-parte, sem reduzir o trabalho de e-mail que teria que existir de
  qualquer forma.
- Rejeitada: maior superficie de risco de seguranca de alto custo (senha
  mal armazenada e o tipo de falha mais caro que existe) sem reducao real
  de escopo total de trabalho.

### B. Supabase Auth (GoTrue) -- **Escolhida**

Avaliada nesta tarefa com verificacao real (nao presumida) de
documentacao/comportamento atual do Supabase Auth:

- Hashing de senha, emissao/rotacao de JWT (access token curto +
  refresh token), verificacao de e-mail, reset de senha e MFA (TOTP, ja
  habilitado por padrao em todo projeto Supabase, gratuito) sao
  responsabilidade nativa do provider -- a aplicacao nunca ve nem armazena
  credencial.
- **JWT Signing Keys assimetricas** (RSA/EC, formato JWKS): o backend pode
  buscar as chaves publicas uma vez, cachea-las, e verificar a assinatura
  do JWT **localmente**, em toda requisicao, sem chamada de rede ao
  Supabase por request -- nao introduz latencia de rede por request nem
  torna toda requisicao dependente de o provider estar no ar no momento
  exato da chamada.
- **API administrativa server-side** (`auth.admin.inviteUserByEmail`, com
  a service role key, nunca exposta ao cliente): resolve convite de forma
  nativa -- cria a identidade em estado nao confirmado e envia o e-mail de
  convite, sem a aplicacao precisar implementar geracao/validade de token
  de convite nem envio de e-mail.
- **Ambiente local/teste real**: o Supabase CLI (`supabase start`) roda
  Auth localmente e captura e-mails de auth (verificacao, reset, convite)
  via Mailpit, sem exigir provedor de e-mail real em desenvolvimento.
- **Baixo lock-in real**: Supabase Auth e construido sobre GoTrue, um
  servico open-source (Go), auto-hospedavel via Docker -- existe caminho de
  saida real, nao apenas teorico, caso o projeto precise migrar no futuro.
- Custo/limitacao real, verificada: o e-mail padrao de desenvolvimento do
  Supabase e restrito (anti-spam) -- producao exige configurar um provedor
  SMTP proprio nas configuracoes do projeto Supabase antes do primeiro
  release real. Isso e uma dependencia operacional a registrar, nao um
  motivo de rejeicao.
- Custo/limitacao real: introduz uma tabela gerenciada pelo provider
  (`auth.users`, fora do controle direto do schema da aplicacao) e um
  identificador de identidade externo (UUID do Supabase) que precisa de
  uma ponte explicita para `users.id` interno (ver secao "User/Identidade")
  -- nunca substitui `users`.
- **Escolhida.** Ver secao "Decisao Arquitetural".

### C. Provedor externo gerenciado de proposito geral (Auth0/Clerk/WorkOS/Firebase Auth)

- Beneficio: mesma cobertura de superficie de seguranca de (B) --
  password hashing, sessao, MFA, reset, verificacao, geralmente com UI
  pronta.
- Custo: adiciona um SEGUNDO vendor alem do Supabase (ja usado para
  Postgres desde a Fase 1.1, ADR-0002/0004) -- mais uma relacao contratual,
  mais um conjunto de credenciais/segredos a gerenciar, mais uma
  integracao de teste/CI a manter, sem reaproveitar nada da infraestrutura
  ja provisionada e ja auditada neste projeto. Nenhum ganho de seguranca
  ou de superficie sobre (B) que justifique o segundo vendor.
- Rejeitada: nao ha vantagem tecnica sobre (B) que compense o custo
  operacional de um segundo fornecedor de identidade.

### D. Passwordless/WebAuthn-only construido internamente

- Beneficio: elimina senha como classe de risco.
- Custo: ainda exige toda a superficie de sessao/token/revogacao da
  alternativa A, mais a complexidade adicional de WebAuthn (registro de
  credencial de dispositivo, fallback para quem nao tem hardware
  compativel) construida do zero, sem nenhuma infraestrutura hoje.
- Rejeitada por escopo desproporcional ao estagio do produto -- nao ha
  fonte normativa (SPEC/ADR) que exija passwordless nesta fase. Registrada
  como capacidade futura possivel (MFA/WebAuthn) sobre a base de (B), nao
  como alternativa concorrente hoje.

## Decisao Arquitetural

O produto adota **Supabase Auth (GoTrue)** como provedor de identidade e
credencial, com uma fronteira de responsabilidade estrita e nunca
ambigua:

- **Supabase Auth e dono de**: existencia da credencial, hashing de senha,
  emissao/rotacao/expiracao de sessao (JWT access token + refresh token),
  verificacao de e-mail, fluxo de reset de senha, MFA (TOTP), rate
  limiting das proprias rotas de autenticacao, envio de e-mail
  transacional de autenticacao (convite/reset/verificacao).
- **A aplicacao (`CoreService`/`authorize()`) e dona de, sozinha, sem
  excecao**: toda autorizacao -- `Membership`, RBAC (SPEC-004), protecao
  do ultimo owner (RN-006), `AccessGrant` (ADR-0025/SPEC-027), Platform
  Admin. Nada disso migra para o provider. `authorize()` nunca passa a
  confiar em nenhuma claim de autorizacao vinda do JWT do Supabase -- ele
  continua, exatamente como hoje, consultando `Membership` no banco da
  aplicacao a cada requisicao.

Isso cumpre literalmente a promessa de ADR-0003: a troca substitui **apenas**
a resolucao do `Actor` (a implementacao de `getActor()`), nunca a
autorizacao central.

## User / Identidade

- `users` continua sendo a entidade interna canonica -- nenhuma tabela
  substitui `users`, nenhuma FK de dominio passa a apontar para
  `auth.users` diretamente.
- Conceito de uma coluna nova, nullable, em `users`: uma referencia
  opaca ("`auth_identity_id`" ou nome equivalente a decidir na SPEC) para
  o identificador do Supabase Auth (`auth.users.id`, um UUID). Aditiva,
  nullable -- todo `User` de teste/interno sem identidade real continua
  valido.
- `email` continua sendo o campo de correlacao/exibicao em `users`
  (RN-001 de SPEC-002, ja existente), mas a AUTORIDADE sobre "este e-mail
  esta verificado e pertence a esta pessoa" passa a ser do Supabase Auth,
  nunca inferida pela aplicacao por comparacao de string.
- Modelo conceitual preparado para o futuro (nao implementado agora): um
  `User` poder ter mais de uma identidade externa (por exemplo, um SSO
  futuro) sem reescrever `users`/`memberships` -- a ponte e uma
  associacao, nunca uma fusao de tabelas.

## Actor

Fluxo normativo (conceitual, sem codigo):

```text
credencial (Supabase Auth)
  -> sessao (JWT access token, assinatura assimetrica)
  -> verificacao LOCAL da assinatura (JWKS cacheado, sem chamada de rede
     por requisicao)
  -> auth.users.id (identidade externa, do token)
  -> lookup interno: auth_identity_id -> users.id
  -> Actor { kind: "user", userId: <users.id interno> }
  -> authorize() (inalterado, consulta Membership)
```

`Actor` nunca mais e client-controlled (ao contrario do `x-dev-user-id`
hoje) -- e sempre derivado de uma assinatura criptografica verificada no
servidor, nunca de um valor que o navegador possa simplesmente declarar.

**Platform Admin** e resolvido separadamente, nunca por uma claim livre
dentro do JWT do provider: uma lista/tabela interna, do lado da
aplicacao, associa `users.id` a perfil de Platform Admin (mesmo principio
ja usado para `Membership` -- "identificador enviado pelo navegador nao
prova acesso", `AGENTS.md`). O JWT do Supabase prova apenas "esta pessoa e
o `User` X"; ser Platform Admin e sempre decidido pelo banco da
aplicacao, nunca pelo provider de identidade.

## Membership

Reafirmado sem excecao: login bem-sucedido **nunca** implica acesso a
nenhuma `Organization`. `authorize()` continua, byte a byte, a mesma
implementacao (`src/server/core/authorization.ts`) -- consulta
`Membership.status`/`role` no banco da aplicacao a cada requisicao. O
provider de identidade nunca carrega RBAC de negocio (nenhuma "claim de
role" do Supabase e usada para autorizacao) -- isso duplicaria
`Membership` como segunda fonte de verdade, exatamente o que ADR-0025 ja
rejeitou para `AccessGrant` e que esta ADR rejeita aqui pela mesma razao.

## AccessGrant

**Pergunta central desta secao:** quando `AccessGrant.revoke` desativa um
`Membership` (Fase 28), o que acontece com sessoes/tokens ja emitidos?

Resposta normativa, combinando duas camadas (alternativa "D -- combinacao"
do enunciado):

1. **Autorizacao e sempre revalidada por requisicao.** `authorize()` ja
   consulta `Membership.status` a cada chamada, sem cache (comprovado
   fisicamente ao longo de toda a Fase 28: `AccessGrant.revoke` desativa
   `Membership` e a proxima requisicao com esse `Membership` ja e negada).
   Um JWT valido prova apenas identidade (quem e o `User`), nunca
   autorizacao (o que ele pode fazer agora). Isso permanece verdade
   independentemente do provider de identidade escolhido.
2. **Sessao de vida curta.** O access token do Supabase Auth tem validade
   curta por padrao (tipicamente da ordem de 1 hora) e precisa de refresh
   periodico. Isso limita a janela de uma identidade "provada" mas cuja
   autorizacao mudou, sem exigir que a aplicacao implemente revogacao de
   token por conta propria.
3. **Revogacao explicita de sessao continua disponivel via API
   administrativa do provider** para o caso excepcional (por exemplo,
   suspeita de comprometimento de credencial) -- distinta e independente
   da revogacao de `AccessGrant`, que continua sendo, sozinha, sobre
   `Membership`.

Isto **nao exige nenhuma mudanca** em `AccessGrant`/`CoreService.
updateMembership` (Fase 28, ja fechada e imutavel em `0031`). A garantia
de que "acesso obsoleto apos revogacao nunca persiste" continua vindo
inteiramente de `authorize()` revalidar `Membership` a cada requisicao --
exatamente como ADR-0025 ja registrava como fora do escopo daquela ADR
("Sessao/token ja emitidos... um provedor de autenticacao real de
producao, quando existir, exigira revisao propria desta ADR"). Esta ADR
e essa revisao, e a resposta e: nenhuma mudanca necessaria em ADR-0025,
apenas a confirmacao de que a garantia ja existente continua suficiente.

## Sessao/Token

- Access token JWT de vida curta + refresh token, emitidos e rotacionados
  pelo Supabase Auth (o provider ja implementa deteccao de reuso de
  refresh token).
- Verificacao de assinatura sempre local (JWKS cacheado), nunca uma
  chamada sincrona ao provider por requisicao autorizada.
- Logout local: invalida a sessao do lado do cliente (descarta os
  tokens); logout global (todas as sessoes de um `User`): via API
  administrativa do provider, reservado a casos excepcionais.
- Detalhes de armazenamento no navegador (cookie `HttpOnly`/`Secure`/
  `SameSite` vs. outro mecanismo), rotacao exata e tempos de expiracao
  ficam para o plano tecnico/SPEC futura -- esta ADR fixa o principio
  (assinatura verificada localmente, vida curta, revalidacao de
  autorizacao a cada request), nao a configuracao exata.

## Senha

A aplicacao **nunca** armazena senha, em nenhum formato -- nem texto
simples, nem hash. Isso satisfaz RN-010 de SPEC-002 pela via mais forte
possivel: delegacao total, nao apenas "hash em vez de texto simples".
Protecao contra forca bruta/credential stuffing/enumeracao de conta e
responsabilidade nativa do provider nas rotas de autenticacao.

## Verificacao de e-mail

Tratada nativamente pelo Supabase Auth antes de a identidade poder ser
usada para autenticacao completa (fluxo padrao do provider). Mudanca de
e-mail (fora de escopo detalhado aqui) exigira revalidacao equivalente --
registrado como ambiguidade para a SPEC futura.

## Convite

Fluxo normativo (conceitual):

1. owner/admin de uma `Organization` aciona um endpoint interno da
   aplicacao (autorizado pela mesma matriz de SPEC-004 ja usada para
   `membership.create`) informando o e-mail da pessoa;
2. a aplicacao (servidor, nunca o cliente) chama a API administrativa do
   Supabase Auth (`inviteUserByEmail`, exige a service role key, nunca
   exposta ao navegador) -- cria a identidade em estado nao confirmado e
   envia o e-mail de convite;
3. **nenhum `Membership` e criado neste momento.** Criar `Membership`
   apenas porque um e-mail foi informado seria exatamente o que
   `AGENTS.md` ja proibe ("identificador enviado pelo navegador nao prova
   acesso") aplicado ao inverso -- um e-mail informado por outra pessoa
   tambem nao prova que o convidado aceitou;
4. quando a pessoa aceita o convite (confirma e-mail, define credencial),
   a identidade fica confirmada; **somente entao** a aplicacao cria o
   `User` interno (se ainda nao existir) associado a essa identidade e o
   `Membership` correspondente, ativo, na `Organization` que originou o
   convite.

Esta ADR **nao** cria um novo estado de `Membership` para "convite
pendente" -- `Membership` continua com apenas `active`/`inactive`
(SPEC-003 RN-003, inalterada). O estado intermediario ("convidado, ainda
nao aceitou") vive inteiramente do lado do Supabase Auth (identidade nao
confirmada), nunca como uma linha de `Membership`. Isso evita alterar
SPEC-003 e evita criar `Membership` insegura antes do aceite.

## Bootstrap do primeiro tenant

O problema hoje: o primeiro `User` de qualquer ambiente so existe via
`POST /api/dev/users` (dev-only). A correcao desta ADR e estritamente
sobre IDENTIDADE, nunca sobre quem pode criar uma `Organization`:

- SPEC-004 (secao 5, "Platform Admin") ja e explicita: apenas Platform
  Admin cria `Organization` com o primeiro owner, em operacao atomica
  (RN-005 de SPEC-003). Esta ADR **nao reabre** essa decisao -- abrir
  criacao de `Organization` por autosservico publico seria uma decisao de
  produto nova, sem base normativa aprovada, e esta ADR nao a inventa.
- O que muda: a identidade do futuro owner passa a ser real. Fluxo
  conceitual: Platform Admin convida a pessoa (mesmo mecanismo da secao
  "Convite", ou cria a identidade diretamente via API administrativa) ->
  identidade confirmada -> Platform Admin cria a `Organization` informando
  esse `User` real como `initialOwnerUserId` (mesma operacao atomica ja
  existente em `CoreService.createOrganization`, inalterada).
- Autosservico publico de criacao de `Organization` (uma pessoa se
  cadastra e cria sua propria empresa sem Platform Admin) fica
  explicitamente registrado como **capacidade de produto futura**, fora
  do escopo desta ADR, exigindo sua propria decisao caso seja desejada.

## Platform Admin

Identidade tao real quanto qualquer `User` (autenticado pelo mesmo
Supabase Auth). O atributo "e Platform Admin" e resolvido por uma
lista/tabela interna do lado da aplicacao (nunca por claim do provider,
nunca por header como `x-dev-platform-admin` hoje). MFA (TOTP) e uma
capacidade nativa e gratuita do Supabase Auth (habilitada por padrao em
todo projeto) -- **registrada aqui como requisito futuro obrigatorio para
Platform Admin**, nao implementada por esta ADR, a ser fechada na SPEC.

## Multiempresa

Identidade (`User`, via Supabase Auth) e global, exatamente como
`User` ja e hoje (SPEC-002). O contexto de `Organization` continua
determinado exclusivamente por `Membership` -- nunca inferido de nenhuma
claim do token. Uma pessoa com varias `Membership` ativas em
`Organization` distintas continua trocando de contexto exatamente como
hoje (`PATCH`/selecao de Organization atual), sem nenhuma mudanca.

## Dev/test auth

`dev-auth.ts` **nao e removido nem substituido por outro codigo dentro do
mesmo ambiente** -- continua existindo, restrito a
`APP_ENV=development`/`test`, exatamente com a mesma trava de
fail-closed ja implementada (`ADR-0003`, inalterada). A resolucao de
`Actor` passa a ter duas implementacoes possiveis por tras da mesma
interface (`getActor`): a atual (headers dev) e a nova (verificacao de
JWT do Supabase Auth) -- nunca as duas simultaneamente disponiveis no
mesmo ambiente. Qual delas roda depende exclusivamente de `APP_ENV`,
nunca de escolha do cliente/requisicao.

## APIs publicas

Rotas publicas ja normatizadas (portal de vagas -- SPEC-019, candidatura
publica -- SPEC-020, token de proposta -- SPEC-015) **nao usam
`Actor`/`Membership` hoje e continuam nao usando** -- tem seus proprios
mecanismos de token ja aprovados. Autenticacao real desta ADR nao as
toca, nao as substitui, nao adiciona autenticacao onde a decisao de
produto ja fechada foi "sem conta".

## Rate limiting

Login, signup, reset de senha, verificacao de e-mail, aceite de convite e
MFA ficam sob o rate limiting nativo do Supabase Auth nas suas proprias
rotas. O `RateLimiter` in-memory ja existente (`core/rate-limiter.ts`)
continua protegendo as rotas internas que ja o usam hoje (propostas,
avaliacoes comportamentais, pre-entrevistas, candidatura publica, IA) --
inalterado por esta ADR. Sua limitacao ja conhecida e documentada (nao
serve multiplas instancias do processo) permanece uma divida tecnica
preexistente, nao criada nem agravada por esta decisao.

## Seguranca (ameacas e controle correspondente)

| Ameaca                            | Controle arquitetural                                                                                                                              |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Credential stuffing / forca bruta | Nativo do provider nas rotas de auth                                                                                                               |
| Account enumeration               | Resposta generica de auth (padrao do provider); `users` ja nao expoe existencia de e-mail (SPEC-002 RN-009)                                        |
| Session fixation                  | Sessao sempre emitida pelo provider apos autenticacao completa, nunca reaproveitada de estado anterior                                             |
| Session theft                     | Verificacao de assinatura + vida curta do access token; refresh com deteccao de reuso                                                              |
| Refresh replay                    | Rotacao + deteccao de reuso nativa do provider                                                                                                     |
| CSRF                              | Tratado no plano tecnico (arquitetura de armazenamento de token/cookie), fora do escopo desta ADR                                                  |
| XSS / roubo de token              | Mitigado por escolha de armazenamento no plano tecnico; fora do escopo desta ADR                                                                   |
| Privilege escalation              | Impossivel via provider -- toda autorizacao vem de `Membership`/`authorize()`, nunca de claim do JWT                                               |
| Actor forjado                     | Impossivel -- `Actor` so existe apos verificacao criptografica local da assinatura                                                                 |
| Platform Admin forjado            | Impossivel -- resolvido por tabela interna, nunca por claim do provider                                                                            |
| `Membership` obsoleta apos login  | `authorize()` revalida a cada requisicao (ja existente)                                                                                            |
| `AccessGrant` revogado            | Ja garantido por `Membership.status`, sem dependencia desta ADR (ver secao "AccessGrant")                                                          |
| Cross-tenant                      | Inalterado -- continua 100% responsabilidade de `Membership`/FKs tenant-safe                                                                       |
| Invitation hijacking              | Convite so confirma identidade, nunca cria `Membership` sozinho (ver secao "Convite")                                                              |
| Password reset hijacking          | Nativo do provider (token de uso unico, expiracao)                                                                                                 |
| Email takeover                    | Verificacao de e-mail nativa do provider antes de habilitar uso completo da conta                                                                  |
| Provider comprometido             | Fora do controle da aplicacao; mitigado por MFA futura para Platform Admin e por `authorize()` nunca confiar em autorizacao vinda do provider      |
| Segredo vazado                    | Service role key do Supabase nunca exposta ao cliente, mesma disciplina ja aplicada a outras chaves de infraestrutura (`AGENTS.md`, `SECURITY.md`) |

## Auditoria

Eventos minimos conceituais (nomenclatura final na SPEC futura):

- `auth.login_succeeded`;
- `auth.login_failed`;
- `auth.logout`;
- `auth.session_revoked`;
- `auth.password_reset_requested` / `auth.password_reset_completed`;
- `auth.email_verified`;
- `auth.invitation_created` / `auth.invitation_accepted`;
- `auth.permission_denied` (quando fizer sentido, em paralelo aos eventos
  de negacao ja existentes por dominio).

Nunca registrados: senha, token, refresh token, cookie, segredo, header
de autorizacao -- mesma disciplina ja aplicada a toda auditoria do
projeto (SPEC-025 s26, SPEC-026 s26, SPEC-027 s29, aqui estendida a
autenticacao).

## Privacidade

Lista positiva: identificador de identidade externo (UUID opaco do
provider), `email` (dado ja tratado hoje por `users`), timestamps. IP/
user-agent somente se estritamente necessario para deteccao de abuso, e
nesse caso com retencao minimizada -- decisao exata de coleta/retencao
fica para a SPEC futura, registrada aqui como ambiguidade explicita
(secao "Conflitos e Ambiguidades"). Auditoria de autenticacao nunca vira
deposito de dados pessoais alem do minimo.

## Compatibilidade Retroativa

- `users`, `memberships`, `organizations`, `access_grants` e todas as
  demais tabelas de dominio permanecem exatamente como estao -- zero
  alteracao de schema por esta ADR (a unica adicao conceitual e uma
  coluna nullable de ponte em `users`, aditiva);
- RBAC (SPEC-004), protecao do ultimo owner (RN-006) e toda a logica de
  `CoreService` permanecem, byte a byte, inalteradas;
- `AccessGrant` (Fase 28, migration `0031`, ja imutavel) permanece
  inalterado -- nenhuma correcao necessaria, conforme fechado na secao
  "AccessGrant";
- Platform Admin continua com leitura administrativa funcional em todo
  dominio pos-contratacao, agora com identidade real por tras;
- APIs publicas (portal, candidatura, token de proposta) permanecem
  inalteradas;
- zero backfill inseguro (ver secao "Migracao de Usuarios Existentes").

## Migracao de Usuarios Existentes

Confirmado por inspecao fisica (auditoria pos-Fase 28): nao existe,
hoje, nenhum dado real de `User` em nenhum ambiente auditado -- apenas
dados de teste, sempre limpos ao final de cada suite. **Nao ha usuario
legado real a migrar no momento desta ADR.**

Se um dia houver `users` internos sem identidade externa associada
(cenario hipotetico futuro, nao o cenario atual), a associacao **nunca**
deve ser inferida automaticamente por similaridade de nome ou e-mail --
mesmo principio ja fixado por SPEC-025 s5.2 e reforcado por SPEC-016
v1.1 s52 para outros vinculos deste projeto. A unica associacao segura e
um fluxo explicito de primeira ativacao (a pessoa confirma posse do
e-mail atraves do proprio fluxo do provider), nunca uma migracao em
lote silenciosa.

## Falha do Provider

- **Supabase Auth indisponivel:** login e refresh novos falham
  (fail-closed, resposta segura, nunca 500 generico). Sessoes cujo access
  token ainda nao expirou continuam verificaveis **localmente** (JWKS ja
  cacheado, sem chamada de rede), entao requisicoes autorizadas em curso
  nao sao interrompidas so pela indisponibilidade momentanea do provider
  -- mas revogacao explicita de sessao pode nao propagar durante a janela
  de indisponibilidade;
- **Banco de dados da aplicacao indisponivel:** `authorize()` ja falha
  fechado hoje (excecao propagada, nunca acesso default-aberto) --
  inalterado;
- **Lookup de `Membership` falha por qualquer motivo:** acesso negado,
  nunca aberto -- mesmo principio ja aplicado em toda a plataforma.

## Responsabilidades do Provider

Password hashing; armazenamento de credencial; emissao, assinatura e
rotacao de sessao (access + refresh token); verificacao de e-mail; reset
de senha; MFA (TOTP); rate limiting das proprias rotas de autenticacao;
envio de e-mail transacional de autenticacao (convite, reset,
verificacao).

## Responsabilidades da Aplicacao

Verificacao local da assinatura do JWT (JWKS cacheado); resolucao de
`Actor`; toda autorizacao (`Membership`, RBAC, RN-006, `AccessGrant`);
allow-list interna de Platform Admin; auditoria de negocio (inclusive os
eventos de autenticacao listados acima); a ponte `users.id` <->
identidade externa; decisao de quando criar `User`/`Membership` reais
(nunca automatica so por convite enviado).

## Fora do Escopo

Esta ADR nao define:

- implementacao de codigo, migration, rotas ou testes;
- SPEC de Autenticacao (fica para tarefa propria futura);
- nome fisico final da coluna/tabela de ponte `users` <-> identidade
  externa;
- detalhes de armazenamento de token no navegador (cookie vs. outro
  mecanismo), CSRF e protecao contra XSS especificas -- plano
  tecnico/SPEC futura;
- MFA obrigatoria (registrada como requisito futuro para Platform Admin,
  nao implementada);
- SSO/login social;
- autosservico publico de criacao de `Organization` (permanece exclusivo
  de Platform Admin, SPEC-004 inalterada);
- mudanca de e-mail de um `User` ja existente (fluxo detalhado fica para
  a SPEC futura);
- coleta/retencao exata de IP/user-agent para deteccao de abuso.

## Revisao Destrutiva

1. **Primeiro usuario:** sobrevive -- Platform Admin convida/cria a
   identidade real e cria a `Organization` com esse `User` como owner
   (secao "Bootstrap"), mesma operacao atomica ja existente.
2. **Primeiro tenant:** sobrevive -- mesmo fluxo, SPEC-004 inalterada.
3. **Usuario em multiplas Organizations:** sobrevive -- identidade
   permanece global (User), contexto continua vindo de `Membership`,
   inalterado (secao "Multiempresa").
4. **Membership inactive:** sobrevive -- `authorize()` continua negando
   independentemente de a sessao/JWT ainda ser valida (secao
   "AccessGrant").
5. **AccessGrant revoked:** sobrevive -- mesma garantia, nenhuma mudanca
   necessaria em Fase 28 (secao "AccessGrant").
6. **Sessao emitida antes da revogacao:** sobrevive -- prova identidade,
   nunca autorizacao; proxima requisicao revalida `Membership` (secao
   "AccessGrant").
7. **Ultimo owner:** sobrevive -- RN-006/`CoreService` inalterados,
   autenticacao nunca decide isso.
8. **Platform Admin:** sobrevive -- identidade real + allow-list interna,
   nunca claim do provider (secao "Platform Admin").
9. **Usuario sem Membership:** sobrevive -- login bem-sucedido nunca
   implica acesso a nenhuma Organization (secao "Membership").
10. **Admin sem Employment:** sobrevive -- fora do escopo desta ADR,
    inalterado por ADR-0024/0025.
11. **Recontratacao:** sobrevive -- inalterado, esta ADR nao toca
    `Employment`/`AccessGrant`.
12. **E-mail alterado:** sobrevive parcialmente -- fluxo detalhado
    registrado como fora de escopo (secao "Fora do Escopo"), sem
    contradicao introduzida.
13. **Reset de senha:** sobrevive -- nativo do provider, token de uso
    unico e expiracao (secao "Seguranca").
14. **Token roubado:** sobrevive -- vida curta + verificacao de
    assinatura mitigam a janela de exposicao (secao "Sessao/Token").
15. **Refresh replay:** sobrevive -- deteccao de reuso nativa do
    provider (secao "Seguranca").
16. **Provider fora do ar:** sobrevive -- fail-closed para operacoes
    novas, sessoes ja verificaveis localmente continuam funcionando
    (secao "Falha do Provider").
17. **Banco de dados fora do ar:** sobrevive -- `authorize()` ja falha
    fechado hoje, inalterado.
18. **Convite expirado:** sobrevive -- expiracao e responsabilidade
    nativa do provider; nenhum `Membership` chegou a existir (secao
    "Convite").
19. **Convite reutilizado:** sobrevive -- aceitar um convite ja aceito e
    tratado pelo proprio provider (identidade ja confirmada); nenhum
    `Membership` duplicado pode surgir porque a criacao de `Membership`
    so ocorre uma vez, no aceite.
20. **Cross-tenant:** sobrevive -- inalterado, 100% responsabilidade de
    `Membership`/FKs tenant-safe (secao "Compatibilidade Retroativa").
21. **Actor forjado:** sobrevive -- impossivel sem assinatura
    criptografica valida verificada localmente (secao "Actor").
22. **`dev-auth` acidentalmente ativo em production:** sobrevive --
    trava ja existente e inalterada (`APP_ENV`), reforcada por esta ADR
    nunca introduzir um segundo caminho que a contorne (secao
    "Dev/test auth").
23. **API publica:** sobrevive -- rotas publicas inalteradas, nunca
    passam a exigir `Actor` (secao "APIs publicas").
24. **Migracao de usuario legado:** sobrevive -- nao ha usuario legado
    real hoje; principio de nao-inferencia automatica registrado para
    quando houver (secao "Migracao de Usuarios Existentes").
25. **Logout global:** sobrevive -- disponivel via API administrativa do
    provider para o caso excepcional, independente e distinto da
    revogacao de `AccessGrant` (secao "Sessao/Token").

Nenhum dos 25 cenarios exigiu enfraquecer a decisao arquitetural
principal ou reabrir `Membership`/RBAC/`AccessGrant`. Um ponto foi
fechado durante o ataque (nao estava explicito no primeiro rascunho):
o estado de `Membership` durante o intervalo entre convite enviado e
convite aceito -- resolvido explicitamente na secao "Convite" como
"nenhum `Membership` criado ainda", evitando tanto a criacao insegura por
e-mail quanto a invencao de um terceiro estado de `Membership` nao
suportado por SPEC-003.

## Conflitos e Ambiguidades

Nenhum conflito normativo encontrado com ADR-0003, ADR-0024, ADR-0025,
SPEC-002, SPEC-003, SPEC-004, SPEC-025, SPEC-026 ou SPEC-027. A decisao e
estritamente aditiva sobre a resolucao de `Actor`; nenhuma regra de
autorizacao existente e enfraquecida, alterada ou contradita. ADR-0003 e
diretamente cumprida (a troca prevista por ela e exatamente esta).

Permanece em aberto, para a SPEC futura:

- nome fisico final da coluna/tabela de ponte `users` <-> identidade
  externa do Supabase Auth;
- schema exato de eventos de auditoria de autenticacao;
- armazenamento exato de token no navegador (cookie vs. alternativa) e
  protecoes especificas de CSRF/XSS associadas;
- se MFA sera obrigatoria (nao apenas disponivel) para Platform Admin
  desde o primeiro release desta capacidade, ou introduzida depois;
- fluxo detalhado de mudanca de e-mail de um `User` existente;
- coleta/retencao exata de IP/user-agent para deteccao de abuso;
- se/quando autosservico publico de criacao de `Organization` sera
  avaliado como capacidade de produto (nao decidido, nao proibido para
  sempre -- apenas fora do escopo desta ADR).

Nenhuma dessas ambiguidades deve ser resolvida por analogia durante a
implementacao futura.

## Consequencias

Beneficios:

- fecha o bloqueador P0 identificado na auditoria pos-Fase 28 sem exigir
  que o projeto construa, do zero, a superficie de seguranca mais cara
  que existe (armazenamento de credencial);
- resolve, pela mesma decisao, tres gaps antes separados (autenticacao,
  reset/verificacao seguros, e-mail transacional de autenticacao) --
  ainda deixando e-mail transacional de NEGOCIO (fora de autenticacao)
  como gap remanescente, nao coberto por esta ADR;
- preserva 100% do investimento normativo e de codigo ja feito em
  `Membership`/RBAC/`AccessGrant` -- nenhuma linha dessas areas precisa
  mudar;
- MFA para Platform Admin fica estruturalmente barato de habilitar no
  futuro (capacidade nativa do provider escolhido, ja gratuita);
- caminho de saida real existe (GoTrue open-source, auto-hospedavel), se
  algum dia necessario.

Custos:

- introduz dependencia operacional em um segundo servico do Supabase
  (Auth, alem de Postgres) -- exige configurar SMTP proprio antes de
  producao real;
- introduz um identificador de identidade externo que precisa de ponte
  explicita com `users.id`, gerida pela aplicacao;
- exige disciplina continua para nunca deixar `authorize()` aceitar
  nenhuma forma de autorizacao vinda do provider de identidade.

## Impacto Futuro

Esta ADR devera orientar:

- uma SPEC fundacional de Autenticacao Real (login, sessao, reset,
  verificacao, convite, MFA para Platform Admin), proximo numero de SPEC
  livre a confirmar no momento de sua redacao;
- revisao de Production Hardening (CI/CD, cabecalhos de seguranca HTTP,
  observabilidade, backup/restore) como frente separada, dependente desta
  ADR apenas na medida em que ambas fecham bloqueadores P0 identificados
  na mesma auditoria;
- eventual capacidade futura de autosservico publico de `Organization`,
  se e quando for decidida por ADR/SPEC propria.

Qualquer implementacao futura deve preservar a compatibilidade conceitual
com esta decisao ou registrar nova ADR substitutiva.
