# ADR 0025 - Ciclo de Vida de Acesso Pos-Contratacao

## Status

Aceita.

## Contexto

A Fase 27 (SPEC-026 - Offboarding) fechou o processo operacional de saida
preservando, deliberadamente, a fronteira ja fixada por ADR-0024: nem
`Employment.end()` nem `Offboarding` desativam `User` ou `Membership`.
SPEC-025 s16 e SPEC-026 s15 registram essa fronteira de forma identica:
"qualquer associacao futura entre pessoa pos-contratacao e acesso pertence a
dominio separado, com decisao propria, auditoria propria e fluxo revogavel".

O planejamento pos-Fase 27 (`docs/00-visao/roadmap.md`) reconciliou todas as
capacidades pos-contratacao pendentes e concluiu `DEFINICAO DE PRODUTO
NECESSARIA`, apontando **Ciclo de Vida de Acesso** como o candidato de maior
convergencia documental: e citado nominalmente por ADR-0024 ("User e
Membership"), SPEC-025 s16, SPEC-017 s14 e SPEC-026 s15, sempre com a mesma
exigencia -- "explicita, auditavel e revogavel", nunca inferida
automaticamente.

Hoje o sistema possui quatro entidades que participam do problema, cada uma
com uma responsabilidade ja fechada e nao sobreposta:

- `OrganizationPerson` -- identidade humana pos-contratacao, intra-Organization
  (SPEC-025).
- `Employment` -- vinculo laboral/operacional concreto, historico, aggregate
  root pos-contratacao (SPEC-025).
- `User` -- identidade autenticavel, global, sem lifecycle por Organization
  (SPEC-002).
- `Membership` -- autorizacao de um `User` numa `Organization` especifica,
  com `role` e `status` (SPEC-003/004).

Nenhuma delas referencia estruturalmente as outras fora do que ja existe:
`Membership` referencia `User` + `Organization`; `Employment` referencia
`OrganizationPerson` + `Organization`. Nao existe, hoje, nenhuma relacao
fisica ou conceitual entre "vinculo laboral" e "conta com acesso". Essa
ausencia e o problema que esta ADR fecha.

Confirmado por inspecao fisica (`db/migrations/0002_phase_1_core.sql`):
`memberships` tem `UNIQUE (organization_id, user_id)` -- um `User` possui, no
maximo, um `Membership` por `Organization`. Confirmado por
`src/server/core/service.ts`: `CoreService.updateMembership` ja implementa
RBAC, protecao do ultimo owner ativo (`RN-006`, SPEC-003) e auditoria
(`membership.activated`, `membership.deactivated`, `membership.role_changed`,
`membership.last_owner_change_denied`) -- mecanismo maduro, testado
(`tests/phase1/*`), que esta ADR nao deve duplicar.

## Objetivo

Definir a decisao arquitetural para o dominio de **Ciclo de Vida de Acesso
Pos-Contratacao**, sem implementar tabelas, migrations, codigo, rotas ou
testes nesta ADR.

Esta decisao deve:

- responder o que significa uma pessoa "ter acesso" a Organization e se
  `Membership` continua sendo suficiente para essa resposta;
- decidir se e necessaria uma entidade nova para associar vinculo laboral e
  acesso, e qual;
- preservar `Employment != Membership`, sem exigir equivalencia 1:1;
- definir concessao, revogacao e reativacao como atos explicitos;
- definir a fronteira exata com `Offboarding` (que continua sem revogar
  nada por si so);
- preservar recontratacao, multiempresa, auditoria e seguranca;
- deixar claro o que permanece em aberto para a SPEC futura.

## Definicao do Problema Arquitetural

**O que significa uma pessoa "ter acesso" a Organization hoje?**
Tecnicamente, `Membership.status = 'active'` mais `Membership.role`
autorizado e suficiente -- `authorize()` (`src/server/core/authorization.ts`)
nunca consulta `Employment` ou `OrganizationPerson`. Nesse sentido restrito,
**sim, `Membership` continua sendo a fonte de verdade de autorizacao**, e
esta ADR nao muda isso.

O problema real nao e que `Membership` falhe como mecanismo de autorizacao.
O problema e que **nao existe hoje nenhuma forma de provar, consultar ou
governar a relacao entre um `Membership` concreto e o vinculo laboral que o
justifica**. Quando um `Employment` termina, ninguem -- nem owner, nem
admin, nem uma futura rotina de auditoria de acesso -- consegue perguntar ao
sistema "quais `Membership` ativos pertencem a pessoas cujo vinculo ja
terminou?" de forma confiavel, porque a relacao simplesmente nao existe como
dado.

Esse e um problema de **proveniencia e governanca de revogacao**, nao de
redesenho de autorizacao. A solucao correta e uma camada adicional de
rastreabilidade e processo humano sobre `Membership`, nunca uma segunda
fonte de verdade concorrente.

## Alternativas Avaliadas

### A. `Employment` -> `Membership` direta (FK)

Uma referencia direta, em qualquer sentido, entre `Employment` e
`Membership`.

- Beneficio: um unico salto de consulta.
- Custo: forca uma cardinalidade rigida (uma FK so aponta para um valor por
  vez) exatamente no caso que mais precisa de historico -- recontratacao.
  Se `Employment 1` aponta para `Membership X` e termina, e `Employment 2`
  comeca para a mesma `OrganizationPerson`, a FK nao tem como representar
  "o `Membership X` continuou sendo usado sob o novo vinculo" sem
  sobrescrever ou duplicar a coluna, o que ja e, na pratica, reinventar uma
  tabela de associacao de forma pior.
- Acesso administrativo sem vinculo laboral: nao resolvido -- `Employment`
  nao existe para esse caso, entao a FK simplesmente nunca e usada, mas
  tambem nao ajuda a governar esses `Membership`.
- Rejeitada: inverte a direcao de dependencia que ADR-0024 ja fixou
  (`Employment` nao deve saber de mecanismos de acesso) e nao sobrevive a
  recontratacao sem gambiarra.

### B. `OrganizationPerson` -> `Membership` direta (FK)

Mesma ideia, um nivel acima (por pessoa, nao por vinculo).

- Beneficio: sobrevive melhor a recontratacao do que a alternativa A, pois
  `OrganizationPerson` e estavel entre vinculos.
- Custo: ainda e uma FK unica -- nao guarda **qual** `Employment`
  especificamente justificou a concessao, enfraquecendo a auditabilidade
  exigida ("por que este acesso existe, e desde quando, sob qual vinculo").
  Tambem nao ajuda o caso administrativo (owner/admin sem
  `OrganizationPerson`).
- Rejeitada: resolve cardinalidade melhor que A, mas ainda perde
  proveniencia granular e nao tem lifecycle proprio para representar
  revogacao como evento, nao como ausencia.

### C. Entidade explicita (`AccessGrant`)

Um aggregate proprio, com lifecycle e auditoria proprios, referenciando
`Membership` e `OrganizationPerson` (e opcionalmente `Employment` como
proveniencia), seguindo exatamente o mesmo padrao ja aprovado duas vezes
neste projeto: `DevelopmentPlan` (SPEC-017) e `Offboarding` (SPEC-026), ambos
"pendurados" em `Employment` sem fundir-se com ele.

- Beneficio: cada concessao e uma linha imutavel e historica. Recontratacao
  produz uma nova linha, nunca reescreve a anterior. Acesso administrativo
  sem vinculo laboral nunca precisa de uma linha (o `Membership` continua
  suficiente sozinho). Revogacao e um evento de primeira classe, auditavel,
  reversivel apenas por nova concessao (nunca por reabertura).
- Custo: mais uma tabela; exige RBAC, auditoria e idempotencia proprios --
  mas isso e exatamente o padrao ja maduro e testado em todo o dominio
  pos-contratacao, nao um custo novo de arquitetura.
- **Escolhida.** Ver secao "Decisao Arquitetural" abaixo.

### D. `Membership` recebe `employment_id`/`organization_person_id`

Colunas nullable adicionadas diretamente em `memberships`.

- Beneficio: fisicamente simples.
- Custo: acopla a tabela `memberships` -- usada por **todo** o sistema desde
  a Fase 1, antes de qualquer conceito pos-contratacao existir -- a um
  dominio especifico. Repete exatamente o acoplamento que ADR-0024 already
  rejeitou explicitamente para `Employment` ("nao deve ser deduzida
  automaticamente da existencia do vinculo"). Uma coluna unica tambem nao
  guarda historico -- recontratacao exigiria sobrescrever silenciosamente
  qual `Employment` "e" o dono do `Membership`, apagando a justificativa
  anterior.
- Rejeitada: viola a separacao de conceitos de ADR-0024 e nao resolve
  recontratacao.

### E. Tabela de associacao pura, sem lifecycle proprio

Uma tabela N:N simples entre `Membership` e `Employment`/`OrganizationPerson`,
sem `status`.

- Beneficio: menor numero de colunas possivel.
- Custo: sem `status`, "revogar" so pode significar apagar a linha -- e a
  Constituicao e todas as SPECs pos-contratacao ja tratadas exigem
  uniformemente ausencia de hard delete de historico de negocio
  (`CONSTITUICAO_DO_PROJETO.md`, "Banco de dados", item 5: "Mudancas
  destrutivas exigem revisao humana"; padrao repetido em SPEC-025 s24,
  SPEC-016, SPEC-017, SPEC-026 s29). Perder a linha tambem perde `quem`
  revogou e `quando`, a nao ser que a auditoria vire a unica fonte dessa
  informacao critica de seguranca -- fragil demais para o proposito central
  desta ADR.
- Rejeitada: essencialmente a alternativa C sem lifecycle, pior exatamente
  no requisito mais importante (revogacao auditavel e nao destrutiva).

### F. Nenhuma entidade nova -- apenas convencao de auditoria

Nao criar nada estruturado; confiar em metadata de `audit_events` (por
exemplo, registrar `employmentId` no metadata de `membership.created`) como
unica trilha.

- Beneficio: zero mudanca de schema.
- Custo: nao e uma relacao consultavel nem confiavel -- nao ha como
  perguntar "quais Memberships ativos pertencem a Employments `ended`" sem
  varrer texto de auditoria. Nao atende ao texto explicito de ADR-0024
  ("associacao... deve ser explicita, auditavel e revogavel"): uma linha de
  log nao e uma associacao revogavel, e apenas um rastro.
- Rejeitada: e essencialmente a baseline "nao fazer nada", util para provar
  que a lacuna e real, mas insuficiente como solucao.

## Decisao Arquitetural

O ciclo de vida de acesso pos-contratacao sera modelado por uma entidade
conceitual nova: **`AccessGrant`**.

`AccessGrant` **nao substitui, nao estende e nao compete com `Membership`**.
`Membership` continua sendo, sozinha, a fonte de verdade de autorizacao
tecnica (pode este `User` agir nesta `Organization`, com qual `role`).
`AccessGrant` e uma camada de **proveniencia e governanca** sobre um
`Membership` ja existente, respondendo "por que este acesso existe e ainda
se justifica", nunca "este acesso e valido agora" -- essa segunda pergunta
continua sendo respondida exclusivamente por `Membership.status`.

### Cardinalidade e referencias

```text
OrganizationPerson 1:N AccessGrant (historico)
Membership 1:N AccessGrant (historico)
Employment 0:N AccessGrant (proveniencia opcional)
```

- `AccessGrant.organization_person_id`: obrigatorio. `AccessGrant` so existe
  para `Membership` que corresponde a uma identidade pos-contratacao real.
  `Membership` puramente administrativo (owner/admin/recruiter sem nenhum
  vinculo laboral) **nunca precisa de `AccessGrant`** -- continua
  funcionando exatamente como hoje, sem nenhuma mudanca.
- `AccessGrant.membership_id`: obrigatorio. O registro tecnico de acesso que
  esta sendo governado.
- `AccessGrant.employment_id`: **opcional**. Quando presente, e proveniencia
  historica -- qual vinculo especifico justificou esta concessao especifica,
  seguindo o mesmo principio ja usado por `Employment.origin_*` (SPEC-025
  s10) e por `Offboarding` (SPEC-026 s6): referencia historica, imutavel
  apos criacao, nunca dependencia operacional eterna. Quando ausente, a
  concessao e justificada apenas por decisao administrativa explicita, com
  motivo minimizado obrigatorio -- mesmo padrao `origin_type`
  `recruitment`/`administrative` ja aprovado para `Employment`.

### Lifecycle

Dois estados, deliberadamente minimos:

- `active`;
- `revoked`.

`active` e o estado de criacao (a concessao ja nasce efetivada -- nao existe
`pending`, porque `AccessGrant` registra uma decisao ja tomada por owner/
admin, nao um workflow de etapas como `Offboarding`). `revoked` e final e
imutavel; nao reabre. Uma nova concessao para o mesmo `Membership` exige um
novo `AccessGrant`, nunca a reabertura do anterior -- mesmo principio ja
aplicado a `Employment`, `Onboarding`, `DevelopmentPlan` e `Offboarding` em
todo o projeto.

Nao existe `expired`/`cancelled` nesta v1: nenhuma fonte normativa exige
expiracao automatica por tempo, e criar uma agora seria inventar escopo.

### Concessao (`active`)

- Ator: exclusivamente owner/admin, mesma matriz ja usada por
  `Employment`/`Offboarding`.
- Pre-condicoes: `Membership` referenciado deve existir e estar `active`;
  `OrganizationPerson` deve pertencer a mesma `Organization`; se
  `employment_id` for informado, deve pertencer a mesma `OrganizationPerson`
  e a mesma `Organization` (nao precisa estar `active` -- pode documentar um
  vinculo ja `ended`, por exemplo ao formalizar retroativamente uma
  concessao antiga).
- Nunca cria `User` nem `Membership` automaticamente -- ambos devem existir
  previamente, criados pelos fluxos ja aprovados de SPEC-002/003.
- Idempotente e auditado, mesmo padrao das 8 operacoes de `Offboarding`.

### Revogacao

Esta e a decisao central desta ADR: **revogar um `AccessGrant` e a unica
operacao pos-contratacao autorizada a mutar `Membership`.**

Isso nao contradiz ADR-0024/SPEC-025/SPEC-026 -- ao contrario, e exatamente
o "dominio separado, com decisao propria, auditoria propria e fluxo
revogavel" que essas tres fontes exigiram e deliberadamente nao
implementaram. `Employment.end()` e `Offboarding` continuam,
inalterados, sem tocar `Membership`. Somente um comando explicito dentro do
dominio de Access Lifecycle, chamado deliberadamente por owner/admin, pode
revogar.

Fisicamente, revogar um `AccessGrant`:

1. marca o `AccessGrant` como `revoked` (imutavel dai em diante);
2. **delega** a `CoreService.updateMembership` (SPEC-003) para desativar o
   `Membership` correspondente, na mesma unidade transacional.

"Delega" e literal: o novo dominio **reutiliza** a implementacao existente
de `CoreService.updateMembership`, nunca duplica sua logica. Isso significa
herdar automaticamente, sem reescrever:

- protecao do ultimo owner ativo (RN-006, ja implementada e testada);
- auditoria propria de `Membership` (`membership.deactivated`,
  `membership.role_changed`);
- validacao de RBAC ja existente.

`AccessGrant.revoked` sem a mutacao correspondente de `Membership` nunca e
um estado valido -- as duas mudancas sao atomicas (secao "Atomicidade e
Concorrencia").

Revogar **nao exige** que `Employment` esteja `ended`. Owner/admin pode
revogar acesso a qualquer momento, por qualquer motivo administrativo
minimizado -- a decisao de negocio continua sendo humana, nunca inferida.

### Reativacao

`AccessGrant revoked` nao reabre. Reativar acesso e sempre:

1. reativar o `Membership` correspondente via `CoreService.updateMembership`
   (mecanismo ja existente, inalterado, ja auditado como
   `membership.activated`);
2. opcionalmente, criar um **novo** `AccessGrant active`, se a Organization
   quiser reafirmar formalmente a justificativa do acesso reativado.

Nenhum historico e reescrito. O `AccessGrant` antigo permanece `revoked`
para sempre, como registro do que aconteceu.

## Cenario Obrigatorio: Recontratacao

```text
OrganizationPerson A
  Employment 1 -> active
  Membership X -> active
  AccessGrant 1 (membership_id=X, employment_id=1) -> active

Employment 1 -> ended
Employment 2 -> active (novo, criado pela SPEC-025)
```

- `Membership X` continua `active` -- nada muda automaticamente.
- `AccessGrant 1` permanece `active` e historico -- ele nao se torna
  invalido nem exige acao so porque `Employment 1` terminou; e apenas
  informacao desatualizada ate uma decisao humana.
- Nenhuma nova associacao e obrigatoria. Owner/admin **pode**, se quiser
  reafirmar formalmente a justificativa sob o novo vinculo, criar
  `AccessGrant 2 (membership_id=X, employment_id=2)` -- uma decisao
  independente, nunca inferida por `Employment 2` ter sido criado.
- `Offboarding` (de `Employment 1`, se existir) pode conter, como hoje,
  apenas uma task textual humana ("revisar acesso"); nunca aciona
  `AccessGrant`/`Membership` diretamente. Uma integracao aditiva **futura**,
  totalmente opcional, poderia permitir que uma `OffboardingTask` referencie
  um `access_grant_id` para contexto de navegacao -- essa integracao **nao**
  e criada por esta ADR e exigiria revisao propria de SPEC-026, exatamente
  como a integracao Onboarding->Employment exigiu revisao propria de
  SPEC-016.
- Quem executa a revogacao de `AccessGrant 1`/desativacao de `Membership X`,
  se a Organization decidir que o acesso nao deve continuar: owner/admin,
  via comando explicito do dominio Access Lifecycle -- nunca automatico,
  nunca como efeito colateral de `Employment 2` ser criado.

## Admin sem Employment / Pessoa sem User

- **Admin sem Employment** (owner, admin, recruiter puramente
  administrativos): nunca precisam de `OrganizationPerson` nem de
  `AccessGrant`. `Membership` sozinho continua sendo 100% suficiente, sem
  nenhuma mudanca de comportamento, custo ou obrigacao introduzida por esta
  ADR.
- **Pessoa sem User** (a maioria dos `OrganizationPerson`/`Employment` hoje,
  ja que SPEC-025 explicitamente permite pessoa sem acesso ao sistema):
  simplesmente nunca tem `AccessGrant`, porque nao ha `Membership` para
  associar. Nao e um estado invalido, e o caso mais comum.

## Multiplos Vinculos e Papeis

- `Membership` unico por `(organization_id, user_id)` -- restricao fisica ja
  existente (migration 0002) e **fora do escopo desta ADR alterar**. Uma
  pessoa nao pode ter duas `Membership` na mesma `Organization` hoje; esta
  ADR nao muda isso.
- Uma pessoa pode acumular papel administrativo (`Membership`) e vinculo
  laboral (`Employment`) simultaneamente -- seu unico `Membership` pode,
  nesse caso, ter um ou mais `AccessGrant` associando-o a sua
  `OrganizationPerson`/`Employment`. Nenhum conflito estrutural.
- SPEC-025 s11 mantem a v1 com no maximo um `Employment` nao final por
  `OrganizationPerson`. Esta ADR nao depende de multiplos `Employment`
  ativos simultaneos para funcionar, e nao impede essa evolucao futura: o
  modelo (`Employment 0:N AccessGrant`) ja comporta multiplos `Employment`
  contribuindo proveniencia para o mesmo `Membership` ao longo do tempo, sem
  necessidade de redesenho.

## Multiempresa

- `AccessGrant.organization_id` obrigatorio, redundante com
  `Membership.organization_id` e `OrganizationPerson.organization_id` (mesma
  tecnica de FK composta tenant-safe usada em `Employment`/`Offboarding`).
- `OrganizationPerson`, `Membership` e `Employment` referenciados devem
  pertencer, todos, a mesma `Organization` -- validado no servidor, nunca
  confiado do payload.
- `User` continua podendo autenticar em multiplas `Organization` via
  `Membership` separados -- inalterado. `AccessGrant` nunca cria nem infere
  identidade cross-tenant; e sempre uma linha por `Organization`.
- `Employment` nunca cruza `Organization` -- ja garantido por SPEC-025 e
  preservado aqui.

## Fonte de Verdade

Fechado explicitamente para nao criar duas fontes de verdade contraditorias:

- **Autorizacao tecnica** (pode agir, com qual role): `Membership`,
  exclusivamente, sem excecao. `authorize()` nunca consulta `AccessGrant`.
- **Proveniencia e governanca** (por que este acesso existe, desde quando,
  sob qual vinculo, quem decidiu): `AccessGrant`, exclusivamente.

Um `AccessGrant active` referenciando um `Membership` que se tornou
`inactive` por qualquer outro motivo (por exemplo, uma desativacao manual
feita fora do fluxo de revogacao) **nao e um estado invalido** -- e apenas
um registro de proveniencia desatualizado, exatamente como um `AccessGrant`
referenciando um `Employment` ja `ended`. `AccessGrant` nunca reativa nem
desativa `Membership` por si so fora do comando explicito de revogacao
desta ADR.

## RBAC

| Acao | owner | admin | member | Platform Admin |
| --- | :---: | :---: | :---: | :---: |
| Criar AccessGrant | Sim | Sim | Nao | Nao |
| Revogar AccessGrant (+ desativar Membership) | Sim | Sim | Nao | Nao |
| Consultar AccessGrant | Sim | Sim | Nao | Nao funcional |
| Leitura administrativa | Nao | Nao | Nao | Sim, com motivo |

Nenhuma regra nova de `Membership` e criada; revogar/reativar `Membership`
continua sujeito integralmente a RN-006 (ultimo owner) e a matriz de
SPEC-004, herdadas por delegacao a `CoreService`, nunca reimplementadas.
Owner nao pode revogar o ultimo owner ativo -- protecao ja existente,
automaticamente herdada. Auto-revogacao nao e proibida especificamente por
esta ADR alem do que a regra do ultimo owner ja proibiria -- nenhuma regra
nova e inventada aqui.

## Platform Admin

Nunca cria, revoga ou reativa `AccessGrant` nem `Membership`. Leitura
administrativa minimizada, com motivo obrigatorio e auditoria
(`access_grant.administrative_read`), mesmo padrao de todo o dominio
pos-contratacao. Zero mutacao funcional -- preferencia conservadora,
consistente com a postura ja adotada por SPEC-025/026 para Platform Admin.

## Auditoria

Eventos conceituais minimos:

- `access_grant.created`;
- `access_grant.revoked`;
- `access_grant.permission_denied`;
- `access_grant.cross_organization_access_denied`;
- `access_grant.administrative_read`.

A revogacao tambem produz, pela delegacao, os eventos ja existentes de
`Membership` (`membership.deactivated`) -- nao ha evento duplicado, apenas
dois dominios auditando a mesma transacao pelo que cada um sabe.

Auditoria nunca registra e-mail, nome, telefone, motivo de origem de
`Employment`, nem qualquer PII alem de identificadores internos -- mesmo
padrao ja aplicado a `Offboarding` (SPEC-026 s26).

## Privacidade

Lista positiva: identificadores internos, `origin_type`/motivo minimizado
(quando administrativo), status, timestamps, autoria.

Proibido, sem excecao normativa futura explicita: e-mail, telefone,
documentos, salario, dados de saude, notas livres irrestritas, dados de
autenticacao (senha, token, segredo, header de sessao). `AccessGrant` nunca
armazena token nem qualquer dado de sessao -- apenas a decisao de que o
`Membership` existe e por que.

## Zero IA

Proibido, sem excecao: risco de acesso calculado por IA; sugestao automatica
de revogacao; decisao automatizada de concessao ou revogacao; score;
ranking; qualquer inferencia sobre "probabilidade de a pessoa ainda precisar
de acesso". Concessao e revogacao sao, sempre, atos humanos explicitos.

## Seguranca

- **Privilege escalation:** `AccessGrant` nunca albelece nem altera `role`.
  Mudanca de role continua exclusiva de `CoreService.updateMembership` sob
  SPEC-004.
- **Acesso obsoleto apos Employment ended:** este e o problema que esta ADR
  ataca -- mitigado por tornar a revogacao uma acao de primeiro nivel,
  facil de descobrir e auditavel; **nao eliminado automaticamente**, porque
  isso continua sendo, deliberadamente, decisao humana.
- **Cross-tenant:** FKs tenant-safe obrigatorias nas tres referencias.
- **Revogacao errada durante recontratacao:** um `AccessGrant` revogado por
  engano nao pode ser reaberto -- mas um novo `AccessGrant` mais a
  reativacao do `Membership` corrigem o erro sem reescrever historico.
- **Desativacao do ultimo owner:** impossivel via este dominio, herdado de
  RN-006.
- **Platform Admin:** zero mutacao.
- **IDOR:** validacao de pertencimento tenant-safe em toda operacao.
- **Mass assignment:** allow-list obrigatoria, mesmo padrao de todo o
  dominio pos-contratacao.
- **Corrida grant/revoke:** transacional. Esclarecimento registrado em
  2026-08-20, apos gate de concorrencia real da Fase 28 (SPEC-027 s13/s27):
  `AccessGrant` nunca adquire lock proprio sobre `Membership` -- a
  disciplina de lock sobre `Membership` e autoridade exclusiva de
  `CoreService.updateMembership` (SPEC-003), delegada por inteiro, nunca
  duplicada. A formulacao original desta ADR ("lock na linha de
  `Membership`... antes de confirmar qualquer mutacao") sugeria um lock
  proprio deste dominio; testes reais mostraram que essa duplicacao de
  lock produzia deadlock genuino contra chamadas concorrentes e
  independentes ao mesmo `CoreService.updateMembership`. Corrigido aqui
  apenas o pressuposto tecnico -- a decisao arquitetural (transacional,
  atomico, sem segunda fonte de verdade) permanece integralmente valida.
- **Sessao/token ja emitidos:** **fora do escopo desta ADR.** O mecanismo de
  autenticacao atual do projeto (`x-dev-user-id`, temporario, restrito a
  `APP_ENV` de desenvolvimento/teste -- `src/server/http/dev-auth.ts`) nao
  possui conceito de sessao nem token; `authorize()` revalida
  `Membership.status` em **toda** requisicao, entao a proxima chamada apos
  a desativacao ja e recusada, sem necessidade de invalidacao de sessao.
  Um provedor de autenticacao real de producao, quando existir, exigira
  revisao propria desta ADR para tratar invalidacao de sessao/token -- nao
  inventado aqui.
- **Falha de auditoria:** rollback da operacao inteira, mesmo padrao ja
  comprovado em todo o dominio pos-contratacao.

## Atomicidade e Concorrencia

Criacao de `AccessGrant` + auditoria: atomica. Revogacao de `AccessGrant` +
desativacao de `Membership` (via `CoreService`) + auditoria de ambos os
dominios: **uma unica unidade transacional** -- nunca um `AccessGrant
revoked` com `Membership` ainda `active`, nem o inverso.

Pares de concorrencia a resolver de forma deterministica na SPEC futura
(catalogados aqui, nao implementados):

- criar x criar (dois `AccessGrant` para o mesmo `Membership`+`Employment`);
- revogar x revogar (mesmo `AccessGrant`);
- revogar x reativar `Membership` por fluxo separado de SPEC-003;
- `Employment.end()` concorrente com criacao de `AccessGrant` (nao deve
  bloquear -- `employment_id` e proveniencia opcional, elegivel em qualquer
  estado de `Employment`, incluindo `ended`);
- recontratacao x revogacao do `AccessGrant` antigo (independentes,
  referenciam `Employment` diferentes).

## Compatibilidade Retroativa

- Todos os `User`, `Membership`, `OrganizationPerson` e `Employment` ja
  existentes permanecem validos sem nenhum `AccessGrant`. Nenhuma
  obrigatoriedade retroativa e criada.
- **Zero backfill inferido automaticamente.** Nenhuma migration ou rotina
  administrativa deve tentar adivinhar qual `Membership` pertence a qual
  `Employment` por nome, e-mail ou qualquer heuristica -- mesmo principio ja
  aplicado por SPEC-025 s5.2 (evidencia sugestiva nunca gera associacao
  automatica) e reforcado por SPEC-016 v1.1 s52 para o vinculo
  Onboarding->Employment.
- `Membership` administrativos existentes (owner/admin sem vinculo laboral)
  permanecem validos para sempre sem nunca precisarem de `AccessGrant`.
- Toda associacao futura e sempre um ato explicito de owner/admin.

## Impacto Fisico Futuro (conceitual, sem SQL nesta ADR)

- Uma tabela nova aditiva (`access_grants` ou nome equivalente a decidir na
  SPEC), com FKs tenant-safe para `organizations`, `organization_people`,
  `memberships` e, opcionalmente, `employments`.
- **Zero alteracao de dominio/comportamento** em `users`, `memberships`,
  `organization_people`, `employments`, `offboardings` ou qualquer tabela
  existente: nenhuma mudanca de lifecycle, autorizacao, RBAC, cardinalidade
  funcional ou semantica de `Membership` (ou de qualquer outra tabela ja
  existente) e permitida por esta ADR. O unico "toque" funcional em
  `Membership` acontece na camada de aplicacao (o novo servico chamando
  `CoreService.updateMembership`), nunca no schema.
- **Esclarecimento necessario, registrado em 2026-08-20, apos o plano
  tecnico da Fase 28 confrontar esta ADR com o schema fisico real:** o item
  acima nao proibe uma constraint auxiliar puramente estrutural, aditiva,
  sobre uma chave ja existente, quando estritamente necessaria para garantir
  integridade referencial tenant-safe do novo dominio -- desde que ela nunca
  altere dado, comportamento ou contrato funcional de nenhuma tabela
  existente. Caso concreto identificado: `memberships` tem `id TEXT PRIMARY
  KEY` mas nao tem `UNIQUE (organization_id, id)`, o que impede fisicamente
  a FK composta tenant-safe `(organization_id, membership_id)` que o mesmo
  padrao ja usado por `employments`/`offboardings` exige. Fica autorizado,
  exclusivamente para esse fim, `ALTER TABLE memberships ADD CONSTRAINT
  memberships_organization_id_id_key UNIQUE (organization_id, id)`. Como
  `id` ja e `PRIMARY KEY`, essa constraint nao restringe nenhum estado hoje
  valido -- apenas formaliza em banco a combinacao (tenant, id) ja implicita,
  sem migrar dado, sem alterar `role`/`status`/lifecycle de `Membership`,
  sem tocar `User`, sem mudar `Membership` como fonte de verdade exclusiva de
  autorizacao tecnica, e sem tornar `AccessGrant` requisito de nada. Nenhuma
  outra excecao alem desta e criada por este esclarecimento; qualquer outra
  alteracao futura em `memberships` continua proibida pelo item acima, sem
  excecao adicional implicita.
- Nomes fisicos finais de tabela/colunas, exact CHECKs, indices e mecanismo
  de idempotencia ficam para a SPEC futura.

## Impacto Futuro nas SPECs (registrado, nao alterado por esta ADR)

- **SPEC-003 (Membership):** ganha um consumidor adicional de
  `CoreService.updateMembership` (o futuro modulo de Access Lifecycle); RN-006
  continua sendo a unica autoridade sobre o ultimo owner. Nenhuma regra de
  SPEC-003 muda.
- **SPEC-004 (RBAC):** a matriz de permissoes precisara, na SPEC futura, de
  linhas novas para conceder/revogar `AccessGrant`; a matriz atual permanece
  intacta.
- **SPEC-025 (Employment):** nenhuma mudanca. `Employment` continua sem
  nenhuma referencia a `Membership`/`AccessGrant` -- a leitura e sempre
  unidirecional (Access Lifecycle le Employment, nunca o contrario).
- **SPEC-026 (Offboarding):** nenhuma mudanca automatica. Uma revisao
  aditiva futura **poderia** permitir que uma `OffboardingTask` referencie
  um `access_grant_id` opcional para contexto -- essa integracao nao existe
  ainda e exige revisao propria de SPEC-026, no mesmo espirito de SPEC-016
  v1.1.
- **Autosservico futuro (SPEC-017 s14):** permanece bloqueado por outras
  decisoes de produto (fora do escopo desta ADR), mas deixa de estar
  bloqueado *estruturalmente* -- agora existe uma forma explicita de provar
  que um `Membership` pertence a uma `OrganizationPerson`.

## Fora do Escopo

Esta ADR nao define:

- schema fisico, migrations, APIs, telas ou testes;
- nomes fisicos finais de tabelas/colunas;
- mecanismo de sessao/token e sua invalidacao (depende de provedor de
  autenticacao real, ainda nao implementado);
- integracao automatica com `Offboarding` (permanece manual/aditiva futura);
- expiracao automatica de acesso por tempo;
- multiplos `Membership` por `(organization_id, user_id)`;
- contractor/freelancer/terceiros;
- autosservico da pessoa vinculada;
- qualquer forma de IA, score ou ranking.

## Revisao Destrutiva

- **Admin sem Employment:** sobrevive -- zero `AccessGrant`, zero mudanca de
  comportamento.
- **Pessoa sem User:** sobrevive -- `AccessGrant` simplesmente nunca existe
  para ela.
- **Recontratacao:** sobrevive -- historico preservado, nova concessao
  sempre explicita, nunca inferida.
- **Employment ended:** sobrevive -- `AccessGrant` vira proveniencia
  desatualizada, nunca invalida nem aciona nada automaticamente.
- **Multiplas Organizations:** sobrevive -- FKs tenant-safe em toda
  referencia, nenhuma identidade global criada.
- **Ultimo owner:** sobrevive -- protecao herdada de RN-006, nunca
  bypassavel por este dominio.
- **Membership inactive:** sobrevive -- criacao de `AccessGrant` exige
  `Membership active`; um `AccessGrant active` sobre um `Membership` que se
  tornou `inactive` por outro caminho e proveniencia desatualizada, nao
  estado invalido.
- **Membership reutilizado entre vinculos:** sobrevive -- multiplos
  `AccessGrant` historicos podem referenciar o mesmo `Membership_id` ao
  longo do tempo, cada um com seu proprio `employment_id`.
- **Cross-tenant:** sobrevive -- validacao tenant-safe obrigatoria em toda
  referencia.
- **Privilege escalation:** sobrevive -- `AccessGrant` nunca toca `role`.
- **Access link orfao:** nao pode ocorrer -- nenhuma das entidades
  referenciadas (`Membership`, `OrganizationPerson`, `Employment`) permite
  hard delete no fluxo normal do projeto.
- **Concorrencia:** catalogada; resolucao deterministica exigida na SPEC
  futura, seguindo os mesmos padroes ja comprovados (lock, idempotencia,
  conflito seguro).
- **Falha de auditoria:** rollback obrigatorio da transacao completa
  (criacao ou revogacao), incluindo a mutacao delegada de `Membership`.
- **Compatibilidade retroativa:** sobrevive -- puramente aditiva, zero
  backfill, zero obrigatoriedade sobre dados existentes.

Nenhum dos ataques acima invalidou a decisao. A ADR fecha a arquitetura
(qual entidade, quais relacoes, qual lifecycle, qual fonte de verdade, qual
fronteira com `Membership` existente) sem fixar detalhes fisicos que
pertencem a uma SPEC futura -- mesmo nivel de abstracao ja usado por
ADR-0024, que tambem nao definiu schema e ainda assim foi aceita e serviu de
base solida para SPEC-025.

## Conflitos e Ambiguidades

Nenhum conflito normativo encontrado com ADR-0024, SPEC-003, SPEC-004,
SPEC-025, SPEC-016, SPEC-017 ou SPEC-026. Esta ADR e estritamente aditiva:
nenhuma regra existente e enfraquecida, alterada ou contradita.

Permanece em aberto, para a SPEC futura:

- nomes fisicos finais de tabela/colunas;
- mecanismo exato de idempotencia (chave propria ou compartilhada);
- se `origin_type` administrativo exige motivo com tamanho/finalidade
  especificos, seguindo o padrao de `Employment.origin_reason`;
- se e quando `OffboardingTask` podera referenciar `access_grant_id`
  (aditivo, opcional, decisao de SPEC-026 futura);
- integracao com autosservico, quando essa capacidade for definida;
- integracao com provedor de autenticacao real e invalidacao de
  sessao/token, quando esse provedor existir.

Nenhuma dessas ambiguidades deve ser resolvida por analogia durante a
implementacao futura.

## Consequencias

Beneficios:

- fecha o unico dominio pos-contratacao que faltava para tornar a fronteira
  de acesso de ADR-0024 realmente operavel, nao apenas declarada;
- resolve o gap de seguranca real e ja em producao desde a Fase 27 (acesso
  nunca revogado apos saida) sem inventar automacao perigosa;
- reaproveita 100% da logica de `Membership` ja madura e testada, sem
  duplicacao;
- preserva `Employment != Membership` e todas as invariantes ja aprovadas;
- desbloqueia estruturalmente (nao normativamente) o autosservico futuro.

Custos:

- uma entidade nova, um servico novo, um conjunto novo de RBAC/auditoria/
  idempotencia a implementar na SPEC futura;
- exige disciplina para nunca deixar `Employment`/`Offboarding` importarem
  este novo dominio (a leitura e sempre unidirecional).

## Impacto Futuro

Esta ADR devera orientar:

- uma SPEC fundacional para `AccessGrant` (proximo ID de SPEC livre:
  SPEC-027);
- revisao aditiva futura, opcional, de SPEC-026 para referencia de contexto
  em `OffboardingTask`;
- futura definicao de autosservico da pessoa vinculada;
- futura integracao com provedor de autenticacao real.

Qualquer implementacao futura deve preservar a compatibilidade conceitual
com esta decisao ou registrar nova ADR substitutiva.
