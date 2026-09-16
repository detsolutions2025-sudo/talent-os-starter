# Roadmap inicial

## Fase 0 — Preparação

Objetivo: criar a base do projeto sem funcionalidades de negócio.

Entregas:

- estrutura inicial;
- ambiente local;
- banco de desenvolvimento;
- padrão de código;
- testes;
- verificação automática;
- documentação de execução;
- primeira decisão de arquitetura.

Critério de conclusão:

- o projeto abre;
- o projeto executa;
- existe uma tela inicial;
- existe um teste funcionando;
- existe instrução simples de instalação;
- nenhum segredo está no código.

## Fase 1 — Empresas e usuários

- cadastro de empresa;
- convite de usuário;
- papéis;
- troca de empresa;
- testes de acesso.

## Fase 2 — DNA Organizacional ✅

- missão;
- visão;
- valores;
- cultura;
- competências;
- versão do DNA.

## Fase 3 — Cargos

- biblioteca de cargos;
- responsabilidades;
- competências;
- perfil de referência.

## Fase 4 — Vagas e candidatos

- vaga;
- página pública;
- candidatura;
- currículo;
- questionário.

## Fase 5 — Processo seletivo

- etapas;
- movimentações;
- entrevistas;
- pareceres.

## Fase 6 — IA

- análise estruturada;
- evidências;
- pontos fortes;
- riscos;
- perguntas sugeridas;
- registro do modelo.

## Fase 7 — Relatórios e indicadores

- funil;
- tempo por etapa;
- relatório do candidato;
- auditoria.

## Planejamento detalhado pós-Fase 21

A sequência detalhada oficial é controlada pelo `docs/01-produto/BACKLOG.md`.
Depois da Fase 21 — Dossiê Inteligente do Candidato —, as próximas
capacidades planejadas são:

- Fase 22 — Propostas;
- Fase 23 — Onboarding;
- Fase 24 — OrganizationPerson e Employment;
- Fase 25 — Desenvolvimento e Retenção.

A fundação de OrganizationPerson e Employment foi inserida para resolver a
lacuna pós-contratação identificada durante a especificação de Desenvolvimento
e Retenção, preservando Employment como aggregate root antes da evolução desse
domínio.

As antigas posições de planejamento Fase 12, Fase 13 e Fase 14 não foram
executadas nessa ordem e não devem ser preenchidas retroativamente.

## Planejamento pós-Fase 25 (saneamento em 2026-08-18)

Após a conclusão da Fase 24 (SPEC-025 — OrganizationPerson e Employment) e da
Fase 25 (SPEC-017 — Desenvolvimento e Retenção), o planejamento foi
reconciliado contra `CONSTITUICAO_DO_PROJETO.md`, `AGENTS.md`, todas as SPECs
e ADRs existentes, o `git log` e o estado físico das migrations.

- **Fase 26 — Integração Onboarding → Employment.** Único candidato com
  suporte documental suficiente para ser definido sem inventar decisão de
  produto nova: o caminho já está determinado por ADR-0024 (seção
  "Onboarding") e por SPEC-025 v1.0, seção 33 ("Impacto Futuro na SPEC-016"),
  que descrevem explicitamente uma revisão aditiva de SPEC-016 adicionando
  `employment_id` nullable a Onboarding, preservando onboardings existentes e
  sem criar ou ativar `Employment` automaticamente. Confirmado por inspeção
  física: as migrations 0025/0026 (Fase 23 — Onboarding) não possuem
  `employment_id`; a lacuna é real, não apenas documental.
  Pré-requisito antes de qualquer código: revisão aditiva formal de
  `docs/02-requisitos/specs/SPEC-016-Onboarding.md` (v1.1), seguida do
  processo obrigatório da Constituição (especificação → revisão → plano →
  desenvolvimento → testes → revisão de segurança → documentação → aprovação
  → commit). Este documento não cria essa revisão; apenas reconhece o alvo.

- **Demais capacidades pós-contratação levantadas na reconciliação**
  (Performance, cargo/função pós-contratação, múltiplos vínculos ativos
  simultâneos, contractor/freelancer, autosserviço do colaborador,
  LMS/desenvolvimento ampliado, remuneração, sucessão, analytics/indicadores)
  permanecem sem SPEC ou ADR aprovada. SPEC-017 v1.0 (seção 2) e SPEC-025 v1.0
  (seção 37) as listam explicitamente como fora do escopo atual ou como
  ambiguidade não resolvida, e determinam que nenhuma delas seja resolvida
  por analogia durante implementação. Qualquer uma delas exige etapa própria
  de definição de produto (ADR e/ou SPEC dedicada) antes de virar Fase
  numerada. Offboarding, que também estava nesta lista, foi removido dela
  pelo saneamento abaixo.

## Planejamento pós-Fase 26 (saneamento em 2026-08-19) — Fase 27, Offboarding

A etapa própria de definição de produto exigida pela nota acima foi cumprida
para Offboarding: `docs/02-requisitos/specs/SPEC-026-Offboarding.md` (v1.0,
Status: Aprovada) foi redigida e passou por revisão destrutiva na mesma
tarefa que a criou, fechando aggregate root, momento de criação, lifecycle,
cardinalidade com `Employment`, fronteira de acesso a `User`/`Membership`,
RBAC, privacidade, idempotência, concorrência, atomicidade, auditoria,
multiempresa e histórico, sem alterar ADR-0024, SPEC-025, SPEC-016, SPEC-003
ou SPEC-004.

- **Fase 27 — Offboarding.** Apoiada em `Employment` como aggregate root
  operacional externo (SPEC-025 permanece autoridade exclusiva do seu
  lifecycle); `Offboarding` é aggregate próprio, seguindo o padrão já
  aprovado para `DevelopmentPlan` (SPEC-017). Não gerencia revogação
  automática de acesso: `Employment.end()` continua sem desativar `User` ou
  `Membership` (SPEC-025 seção 14), e a SPEC-026 apenas registra tarefas
  humanas de revogação, nunca as executa. Automação real de acesso fica
  explicitamente fora da v1 e exigirá SPEC/ADR própria futura (SPEC-026
  seção 15).
  Pré-requisito antes de qualquer código: nenhum adicional — a SPEC-026 já
  está aprovada. O processo obrigatório da Constituição (especificação →
  revisão → plano → desenvolvimento → testes → revisão de segurança →
  documentação → aprovação → commit) segue valendo a partir do plano
  técnico, que ainda não foi elaborado por este saneamento.
  Este saneamento formaliza apenas o registro em planejamento (este arquivo
  e `docs/01-produto/BACKLOG.md`); não implementa código, migration, banco
  ou testes executáveis, e não realiza commit.

## Planejamento pós-Fase 27 (saneamento em 2026-08-20) — Fase 28, AccessGrant

A etapa própria de definição de produto, exigida desde o saneamento pós-Fase
25 para qualquer capacidade pós-contratação sem SPEC ou ADR aprovada, foi
cumprida para o Ciclo de Vida de Acesso: `docs/03-arquitetura/decisoes/
0025-ciclo-de-vida-de-acesso-pos-contratacao.md` (Status: Aceita) e
`docs/02-requisitos/specs/SPEC-027-Ciclo-de-Vida-de-Acesso.md` (v1.0,
Status: Aprovada) foram redigidas e passaram por revisão destrutiva nas
próprias tarefas que as criaram, sem alterar ADR-0024, SPEC-003, SPEC-004,
SPEC-025 ou SPEC-026.

- **Fase 28 — Ciclo de Vida de Acesso Pós-Contratação (`AccessGrant`).**
  `AccessGrant` é uma camada de proveniência e governança sobre um
  `Membership` já existente — nunca uma segunda fonte de verdade de
  autorização. Pontos fechados por ADR-0025/SPEC-027 e registrados aqui
  sucintamente:
  - `Membership` continua sendo, sozinho, a fonte de verdade de autorização
    técnica; `authorize()` nunca consulta `AccessGrant`;
  - `AccessGrant` é proveniência/governança — responde "por que este acesso
    existe e sob qual vínculo", nunca "este acesso é válido agora";
  - `OrganizationPerson` + `Membership` são as relações centrais de
    `AccessGrant` (1:N históricos cada); `Membership` puramente
    administrativo (owner/admin/recruiter sem vínculo laboral) nunca precisa
    de `AccessGrant`;
  - `Employment` é proveniência opcional (`0:N AccessGrant`), imutável após
    a criação do `AccessGrant`, elegível em qualquer estado (`active` ou
    `ended`);
  - revogação funcional de acesso é a única operação deste domínio
    autorizada a mutar `Membership`, e delega integralmente a
    `CoreService.updateMembership` (SPEC-003) — herda RN-006 (proteção do
    último owner), auditoria e RBAC já existentes, nunca reimplementados;
  - zero automação por `Employment.end()` — preserva SPEC-025 §14/§16
    integralmente, sem revogar nada automaticamente;
  - zero automação por `Offboarding` — preserva SPEC-026 integralmente:
    nunca cria, revoga ou altera `AccessGrant`/`Membership`; uma integração
    aditiva opcional de contexto (`OffboardingTask` → `access_grant_id`)
    permanece registrada como possibilidade futura, não decidida aqui;
  - zero Inteligência Artificial: concessão e revogação são sempre atos
    humanos explícitos, sem score, ranking ou sugestão automatizada.
    Pré-requisito antes de qualquer código: nenhum adicional — ADR-0025 e
    SPEC-027 já estão, respectivamente, Aceita e Aprovada. O processo
    obrigatório da Constituição (especificação → revisão → plano →
    desenvolvimento → testes → revisão de segurança → documentação → aprovação
    → commit) segue valendo a partir do plano técnico, que ainda não foi
    elaborado por este saneamento.
    Este saneamento formaliza apenas o registro em planejamento (este arquivo
    e `docs/01-produto/BACKLOG.md`) e o metadado `Fase` do cabeçalho de
    SPEC-027; não implementa código, migration, banco ou testes executáveis, e
    não realiza commit.

## Planejamento pós-Fase 28 (saneamento em 2026-08-20) — Fase 29, Autenticação Real

Concluída e implementada a Fase 28 (`AccessGrant`, commit `b0f067a`), uma
auditoria de prontidão de MVP/produção identificou que o único mecanismo de
identificação existente no projeto (`src/server/http/dev-auth.ts`, headers
`x-dev-user-id`/`x-dev-platform-admin`) é deliberadamente restrito a
`APP_ENV=development`/`test` desde a Fase 1 (ADR-0003) e nunca foi substituído
por autenticação real — classificado como bloqueador de produção. A etapa
própria de definição de arquitetura e produto foi cumprida em resposta:
`docs/03-arquitetura/decisoes/0026-autenticacao-real.md` (Status: Aceita) e
`docs/02-requisitos/specs/SPEC-028-Autenticacao-Real.md` (v1.0, Status:
Aprovada) foram redigidas e passaram por revisão destrutiva nas próprias
tarefas que as criaram, sem alterar ADR-0003, ADR-0025, SPEC-002, SPEC-003,
SPEC-004 ou SPEC-027.

- **Fase 29 — Autenticação Real.** Pontos fechados por ADR-0026/SPEC-028 e
  registrados aqui sucintamente:
  - **Supabase Auth (GoTrue)** é o provider de identidade escolhido —
    avaliado contra autenticação custom e provedores externos concorrentes,
    não escolhido apenas por já ser o mesmo fornecedor do PostgreSQL atual;
  - `users` permanece a entidade interna canônica; a nova identidade externa
    é uma associação aditiva (`auth_identities`, tabela própria, 1:1 nesta
    Fase), nunca uma substituição de `User`;
  - `Membership` continua sendo, sozinha, a fonte de verdade de autorização
    organizacional — login bem-sucedido nunca concede acesso a nenhuma
    Organization por si só; `authorize()` permanece sem nenhuma linha
    alterada;
  - o JWT emitido pelo provider identifica o `User` (via verificação local
    de assinatura, JWKS), nunca carrega Role/autorização organizacional —
    nenhuma Role de negócio passa a residir no provider;
  - `dev-auth.ts` é preservado, nunca removido, restrito exatamente como
    hoje a `development`/`test` — a resolução de `Actor` passa a ter duas
    implementações possíveis pela mesma interface, nunca simultâneas no
    mesmo ambiente;
  - convite e bootstrap do primeiro tenant tornam-se reais (via API
    administrativa do provider), eliminando a dependência funcional de
    `POST /api/dev/users` em produção; criação de Organization continua
    exclusiva de Platform Admin (SPEC-004, inalterada);
  - **sem signup público nesta Fase** — apenas por convite ou bootstrap;
  - sessão válida + `AccessGrant` revogado (Fase 28) continua resultando em
    acesso negado na próxima operação protegida, garantido inteiramente pela
    revalidação de `Membership` já existente em `authorize()` — zero mudança
    exigida em `AccessGrant`/migration `0031`, que permanece imutável;
  - duas tabelas conceituais previstas para o plano técnico futuro:
    `auth_identities` (ponte User ↔ identidade externa) e `invitations`
    (convite/bootstrap, sem criar `Membership` antes do aceite).
    Pré-requisito antes de qualquer código: nenhum adicional — ADR-0026 e
    SPEC-028 já estão, respectivamente, Aceita e Aprovada. O processo
    obrigatório da Constituição (especificação → revisão → plano →
    desenvolvimento → testes → revisão de segurança → documentação → aprovação
    → commit) segue valendo a partir do plano técnico, que ainda não foi
    elaborado por este saneamento. Production Hardening (CI/CD, cabeçalhos de
    segurança HTTP, observabilidade, backup/restore) continua candidato
    natural a uma fase posterior, não formalizada por este saneamento.
    Este saneamento formaliza apenas o registro em planejamento (este arquivo
    e `docs/01-produto/BACKLOG.md`); não implementa código, migration, banco
    ou testes executáveis, e não realiza commit.

## Fechamento da Fase 29 (2026-08-25) — Autenticação Real concluída

O plano técnico referido pela nota acima foi elaborado e executado: a Fase
29 (Autenticação Real) está implementada, testada e commitada (`1611d60`),
sem alterar o conteúdo normativo de ADR-0026 ou SPEC-028. Migration final
da fase: `0033_phase_29_bootstrap_invitation.sql`, aditiva sobre
`0032_phase_29_authentication.sql` (identidade/sessão), ambas já aplicadas
em DEV (Supabase) e verificadas fisicamente antes e depois da aplicação.
Todos os pontos fechados por ADR-0026/SPEC-028 listados na seção anterior
permanecem verdadeiros no código entregue: Supabase Auth como provider,
`users` como entidade interna canônica, `Membership`/`authorize()` sem
nenhuma linha alterada, JWT sem Role/tenant de negócio, `dev-auth.ts`
preservado e restrito a `development`/`test`, convite e bootstrap do
primeiro tenant reais, sem signup público.

**Production Hardening (CI/CD, cabeçalhos de segurança HTTP, CORS,
observabilidade, backup/restore) permanece exatamente o que já era:
candidato a trabalho posterior, citado por ADR-0026 ("Impacto Futuro") e
por SPEC-028 (seção 2, "Fora do Escopo"). Este fechamento não o formaliza
como Fase 30** — nenhum ADR ou SPEC dedicados existem ainda para essa
frente; a numeração de fase seguinte permanece em aberto até que esse
pré-requisito normativo seja cumprido, no mesmo padrão já usado por todas
as fases anteriores deste roadmap.

## Planejamento pós-Fase 29 (saneamento em 2026-08-27) — Fase 30, Configuração e Segredos / Fail-Fast de Produção

O pré-requisito normativo registrado pela nota de fechamento da Fase 29
acima foi cumprido: `docs/03-arquitetura/decisoes/0027-production-hardening.md`
(ADR-0027 — Production Hardening / Prontidão Operacional, Status: Aceita)
define o guarda-chuva arquitetural completo de prontidão operacional,
separado em sete frentes (segurança de borda, entrega/deploy, observabilidade,
disponibilidade, recovery, controle de abuso, operação), e decide
explicitamente pelo fatiamento em múltiplas SPECs/fases subsequentes, nunca
uma fase única monolítica (ADR-0027, seção 2). A ordem recomendada elege
configuração/secrets como primeira sub-frente, pelo motivo que a própria ADR
registra: menor custo, maior urgência — hoje só
`assertSupabaseAuthConfiguredForProduction` (Fase 29) existe, e precisa ser
generalizado para todas as variáveis obrigatórias de produção.

- **Fase 30 — Configuração e Segredos / Fail-Fast de Produção.** Especificada
  em `docs/02-requisitos/specs/SPEC-029-Configuracao-e-Segredos-Fail-Fast.md`
  (v1.0, Status: Aprovada), que passou por revisão destrutiva na própria
  tarefa que a criou, sem alterar ADR-0027, ADR-0026 ou SPEC-028. Pontos
  fechados por essa SPEC, registrados aqui sucintamente:
  - objetivo: impedir que o processo de produção suba parcialmente
    configurado — generaliza o mecanismo de fail-fast já existente e
    testado desde a Fase 29 (`assertSupabaseAuthConfiguredForProduction`)
    para um único ponto de validação no boot, cobrindo todas as variáveis
    hoje obrigatórias em `APP_ENV=production`: `SUPABASE_DATABASE_URL`,
    `VITE_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` e
    `VITE_SUPABASE_ANON_KEY` (esta última hoje sem validação nomeada — gap
    físico fechado normativamente por esta SPEC);
  - `development`/`test` permanecem exatamente como hoje — nenhuma dessas
    variáveis passa a ser exigida fora de produção; `dev-auth.ts` continua
    funcionando sem alteração;
  - `staging`/homologação segue exatamente a mesma exigência de produção,
    nunca uma validação reduzida — consistente com ADR-0027 (seção 4);
  - **zero migration prevista** — mecanismo é puramente de validação de
    configuração em `process.env`, sem nova tabela ou coluna de domínio;
  - este mecanismo absorve, nunca duplica ou substitui, o padrão já
    existente e testado da Fase 29 e de `requirePostgresDatabaseUrl`
    (Fase 1.1);
  - esta Fase **não é o Production Hardening completo** — é apenas a
    primeira das sete sub-frentes ordenadas pela ADR-0027 (seção 2); as
    demais seis (segurança de borda, CI/CD, observabilidade, backup/
    restore, rate limiting distribuído, E2E) permanecem candidatas a fases
    futuras, sem número atribuído, cada uma exigindo sua própria SPEC
    dedicada antes de virar fase numerada — o ADR-0027 continua sendo o
    guarda-chuva arquitetural de todas elas.
    Pré-requisito antes de qualquer código: nenhum adicional — ADR-0027 e
    SPEC-029 já estão, respectivamente, Aceita e Aprovada. O processo
    obrigatório da Constituição (especificação → revisão → plano →
    desenvolvimento → testes → revisão de segurança → documentação →
    aprovação → commit) segue valendo a partir do plano técnico, que ainda
    não foi elaborado por este saneamento.
    Este saneamento formaliza apenas o registro em planejamento (este
    arquivo e `docs/01-produto/BACKLOG.md`) e o metadado `Fase` do
    cabeçalho de SPEC-029 (de "a formalizar" para "30"); não implementa
    código, migration, banco ou testes executáveis, e não realiza commit.

## Fechamento da Fase 30 (2026-08-31) — Configuração e Segredos / Fail-Fast de Produção concluída

A Fase 30 (Configuração e Segredos / Fail-Fast de Produção) foi implementada
e testada, reaproveitando integralmente ADR-0027/SPEC-029 sem alterar seu
conteúdo normativo. **Zero migration** — mecanismo puramente de validação de
`process.env` no boot, sem nova tabela ou coluna de domínio; a migration mais
recente do projeto permanece `0033_phase_29_bootstrap_invitation.sql`, sem
nenhuma alteração de schema.

Entregue: `src/server/config-validation.ts` (novo módulo, exporta
`assertProductionConfig()` — ponto único de validação de presença das quatro
variáveis obrigatórias em `APP_ENV=production`/`APP_ENV=staging`
[`SUPABASE_DATABASE_URL`, `VITE_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`VITE_SUPABASE_ANON_KEY`], e `requireConfigValue()` — primitiva genérica de
presença, reutilizada por `auth/config.ts` sem alterar nenhum contrato,
mensagem ou comportamento público seu). `src/server/index.ts` passou a
chamar `assertProductionConfig()` antes de qualquer inicialização
significativa (antes do pool do Postgres, antes de `authService`, antes de
`app.listen()`), preservando `requirePostgresDatabaseUrl` (Fase 1.1) e
`assertSupabaseAuthConfiguredForProduction` (Fase 29) exatamente como
defesa em profundidade na mesma posição relativa de sempre — nenhuma lógica
de formato/derivação foi duplicada.

Testes/gates executados e verdes: suíte dedicada `tests/phase30/`
(`config-validation.test.ts`, `bootstrap-smoke.test.ts` — spawn do
entrypoint real provando que configuração inválida nunca alcança
`app.listen()` nem cria pool —, `auth-postgres-validators-regression.test.ts`
— prova de ausência de regressão nos validators absorvidos), regressão de
`tests/postgres.test.ts` e `tests/phase29/` (85 testes, sem alteração),
`tsc --noEmit`, `eslint`, `prettier --check`, `npm run build` e
`npm audit --omit=dev` (zero vulnerabilidades) limpos. Nenhuma dependência
nova (`package.json`/`package-lock.json` sem diff).

Esta é a **primeira fatia** do ADR-0027 concluída. **Production Hardening
geral permanece incompleto** — as demais seis sub-frentes ordenadas pela
ADR-0027 (seção 2) seguem candidatas a fases futuras, sem número atribuído,
cada uma exigindo sua própria SPEC dedicada antes de virar fase numerada,
mesmo padrão de gate já exigido para todas as capacidades anteriores deste
roadmap. A próxima sub-frente recomendada pela ordem da ADR-0027 é
**Segurança de Borda** (security headers, CORS, CSRF adicional) — citada
aqui apenas como próximo candidato, sem formalizar número de fase nesta
tarefa.

Convenção observada e preservada: o cabeçalho `**Status:**` do próprio
documento SPEC-029 permanece `Aprovada` (não `Concluída`) mesmo após esta
implementação — mesmo padrão já em vigor para SPEC-028 (Fase 29, também
implementada e commitada, cujo cabeçalho também permanece `Aprovada`). A
reconciliação de status "implementada" fica restrita à tabela de
`docs/01-produto/BACKLOG.md`, como já praticado na fecho da Fase 29.

## Planejamento pós-Fase 30 (saneamento em 2026-08-31) — Fase 31, Segurança de Borda

O pré-requisito normativo registrado pela nota de fechamento da Fase 30
acima foi cumprido: a segunda sub-frente da ordem recomendada por
ADR-0027 (seção 2) — segurança de borda — foi especificada em
`docs/02-requisitos/specs/SPEC-030-Seguranca-de-Borda.md` (v1.0, Status:
Aprovada), que passou por revisão destrutiva de 50 cenários na própria
tarefa que a criou, sem alterar ADR-0027, ADR-0026, SPEC-028 ou SPEC-029.
A ordem recomendada elege segurança de borda como segunda sub-frente pelo
motivo que a própria ADR registra: baixo custo técnico, amplifica
diretamente a proteção que a Fase 29 acabou de introduzir (cookies
HttpOnly, sessão real).

- **Fase 31 — Segurança de Borda.** Especificada em
  `docs/02-requisitos/specs/SPEC-030-Seguranca-de-Borda.md` (v1.0, Status:
  Aprovada). Pontos fechados por essa SPEC, registrados aqui
  sucintamente:
  - objetivo: fechar a superfície de risco HTTP/borda que a Fase 29 abriu
    (sessão real, cookies HttpOnly) — security headers (nosniff,
    proteção de framing, Referrer-Policy, Permissions-Policy), CSP, HSTS,
    CORS, CSRF por validação de Origin/Referer, preservação integral dos
    cookies já testados, fronteira de confiança de proxy (`trust proxy`)
    e `Cache-Control: no-store` para respostas autenticadas sensíveis;
  - cookies HttpOnly/SameSite=Lax/host-only da Fase 29 são preservados
    integralmente, sem nenhuma linha alterada em `http/cookies.ts` além,
    possivelmente, de como `secure` é calculado;
  - **topologia de produção (mesma origem vs. origens distintas) segue
    sendo decisão de hosting ainda não tomada** (ADR-0027, seção 4) — a
    SPEC-030 não escolhe arbitrariamente entre elas, define invariantes
    seguros para os dois modos conceituais possíveis, tratando a origem
    real como pré-condição de configuração explícita, nunca como
    wildcard nem como decisão escondida;
  - a política de métodos HTTP permitidos por CORS deve cobrir os métodos
    efetivamente usados pela API (hoje isso inclui GET, POST, PATCH, PUT
    e DELETE) — nunca uma lista menor por conveniência;
  - **sequenciamento crítico:** a validação de Origin/Referer para
    mutações autenticadas por cookie deve entrar em produção antes ou no
    mesmo deploy que qualquer habilitação de CORS credenciado, nunca
    depois (SPEC-030, INV-03) — a ausência de CORS hoje bloqueia
    acidentalmente requisições cross-origin com corpo JSON; habilitar
    CORS remove essa barreira acidental para a origem permitida;
  - a fronteira de confiança de proxy (`trust proxy`) faz parte desta
    fase — `request.ip` já é consumido hoje por rate limiting e hash de
    auditoria em capacidades existentes (candidatura pública,
    pré-entrevista, avaliação comportamental, propostas); a configuração
    exata depende da topologia real de hosting, e `trust proxy = true`
    genérico nunca é uma solução aceitável;
  - **zero migration prevista** — mecanismo é puramente de configuração/
    middleware HTTP, sem nova tabela ou coluna de domínio;
  - esta Fase **não é o Production Hardening completo** — é apenas a
    segunda das sete sub-frentes ordenadas pela ADR-0027 (seção 2); as
    demais cinco (CI/CD, observabilidade, backup/restore, rate limiting
    distribuído, E2E) permanecem candidatas a fases futuras, sem número
    atribuído, cada uma exigindo sua própria SPEC dedicada antes de virar
    fase numerada — o ADR-0027 continua sendo o guarda-chuva
    arquitetural de todas elas. A próxima sub-frente recomendada após
    esta é **CI/CD mínimo** (GitHub Actions), citada aqui apenas como
    próximo candidato, sem número de fase.
    Pré-requisito antes de qualquer código: nenhum adicional — ADR-0027
    e SPEC-030 já estão, respectivamente, Aceita e Aprovada. O processo
    obrigatório da Constituição (especificação → revisão → plano →
    desenvolvimento → testes → revisão de segurança → documentação →
    aprovação → commit) segue valendo a partir do plano técnico, que
    ainda não foi elaborado por este saneamento.
    Este saneamento formaliza apenas o registro em planejamento (este
    arquivo e `docs/01-produto/BACKLOG.md`) e o metadado `Fase` do
    cabeçalho de SPEC-030 (de "a formalizar" para "31"); não implementa
    código, migration, banco ou testes executáveis, e não realiza commit.

## Fechamento da Fase 31 (2026-09-16) — Segurança de Borda concluída

A Fase 31 (Segurança de Borda) foi implementada e testada, reaproveitando
integralmente ADR-0027/SPEC-030 sem alterar seu conteúdo normativo. **Zero
migration** — mecanismo puramente de middleware HTTP, sem nova tabela ou
coluna de domínio; a migration mais recente do projeto permanece
`0033_phase_29_bootstrap_invitation.sql`, sem nenhuma alteração de schema.

Entregue: `src/server/http/trusted-origins.ts` (fonte única de origens
confiáveis, compartilhada por CORS e CSRF), `src/server/http/cors.ts`
(delegate por requisição, sem wildcard, credentials computado por origem
aprovada), `src/server/http/csrf.ts` (validação de Origin com fallback para
Referer em toda mutação cookie-autenticada, rotas `/public/` isentas por
RN-017), `src/server/http/security-headers.ts` (Helmet configurado
explicitamente — CSP, HSTS, Permissions-Policy, X-Frame-Options — nunca com
defaults aceitos às cegas). `src/server/app.ts` monta os três middlewares
desta Fase antes de `express.json()`, usando `isProductionOrStagingEnv`
(deliberadamente separado do contrato de cookie `Secure` da Fase 29) para
que staging receba a mesma baseline de headers de produção. `src/server/
index.ts` integra `TRUSTED_FRONTEND_ORIGINS` ao gate central de fail-fast
da Fase 30 (`assertProductionConfig`), nunca um segundo mecanismo paralelo.

Testes/gates executados e verdes: suíte dedicada `tests/phase31/` (7
arquivos, 50 testes — config central integrado ao gate da Fase 30, CORS,
CSRF, security headers/CSP/HSTS/Permissions-Policy, Cache-Control, trust
proxy/X-Forwarded-For), regressão isolada de `tests/phase29/` (85),
`tests/phase30/` (49), candidatura pública/Fase 17 (44), pré-entrevista/
Fase 18 (63), avaliação comportamental/Fase 19 (47) e Core/Membership
(`tests/phase1` + `tests/tenant.test.ts`, 34) — nenhuma quebra causada pela
proteção CSRF cookie-based nos fluxos públicos/token-based; `tsc --noEmit`,
`eslint` e `npm run build` limpos.

**Residual explícito, não fechado por esta Fase:** o Express não serve o
HTML do SPA (sem `express.static`/`sendFile` em nenhum ponto do backend) —
a CSP implementada aqui protege exclusivamente respostas de `/api`; a
política de segurança do documento HTML do frontend continuará dependendo
inteiramente do hosting/edge que efetivamente o servir em staging/produção,
decisão de topologia ainda em aberto (ADR-0027, seção 4).

Demais residuais conhecidos, não bloqueantes: 3 vulnerabilidades moderadas
pré-existentes na cadeia `express`/`body-parser`/`qs` (`npm audit
--omit=dev`, correção de patch disponível, sem relação com esta Fase);
limitação conhecida do harness Vitest em execuções monolíticas/combinadas
longas (já documentada em `vitest.config.ts`), contornada nesta revalidação
via execução isolada por suíte; schemas `test_phase_*` residuais
acumulados no banco DEV, não removidos por decisão explícita de escopo;
contrato de cookie `Secure` (Fase 29) permanece restrito a
`APP_ENV=production`, fora do escopo normativo desta Fase.

Convenção observada e preservada: o cabeçalho `**Status:**` do próprio
documento SPEC-030 permanece `Aprovada` (não `Concluída`) mesmo após esta
implementação — mesmo padrão já em vigor para SPEC-028 e SPEC-029. A
reconciliação de status "implementada" fica restrita à tabela de
`docs/01-produto/BACKLOG.md`.

**Production Hardening geral permanece incompleto** — esta é apenas a
segunda das sete sub-frentes ordenadas pela ADR-0027 (seção 2); as demais
cinco (CI/CD, observabilidade, backup/restore, rate limiting distribuído,
E2E) seguem candidatas a fases futuras, sem número atribuído, cada uma
exigindo sua própria SPEC dedicada antes de virar fase numerada, mesmo
padrão de gate já exigido para todas as capacidades anteriores deste
roadmap. A próxima sub-frente recomendada pela ordem da ADR-0027 é
**CI/CD mínimo** (GitHub Actions), citada aqui apenas como próximo
candidato, sem formalizar número de fase nesta tarefa.

## FAST TRACK — CI/CD mínimo + Observabilidade mínima (2026-09-16)

Implementadas diretamente a partir das decisões ja tomadas pela ADR-0027
(secoes 3, 10-12, 19, 21-22), sem SPEC dedicada nem numero de fase --
bloco fast-track, revisao humana ainda pendente antes de qualquer
fechamento formal. Entregue: `.github/workflows/ci.yml` (GitHub Actions --
typecheck, lint, format, fresh-install de migrations contra um Postgres
efemero de CI, testes, build, `npm audit --omit=dev`; Actions de terceiros
pinadas por hash de commit; `concurrency` para nunca rodar dois workflows
simultaneos do mesmo ref) e `.github/dependabot.yml`; modulo
`src/server/observability/*` (logger estruturado via `pino`, com
correlation/request ID e redacao explicita de segredos; handlers globais
de `uncaughtException`/`unhandledRejection`; graceful shutdown em
SIGTERM/SIGINT); `GET /api/ready` (readiness separada de liveness,
verificando apenas Postgres, nunca expondo detalhe interno). CD/deploy
permanece **deliberadamente nao implementado** -- nenhum hosting de
producao foi decidido (ADR-0027 secao 4); CI verde e o objetivo desta
rodada.

**Production Hardening geral continua incompleto** -- restam
Backup/Restore + DR, Rate limiting distribuido e E2E, cada uma ainda
candidata a SPEC propria futura, sem numero de fase atribuido.
