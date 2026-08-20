# SPEC-027 - Ciclo de Vida de Acesso Pos-Contratacao (AccessGrant)

**Status:** Aprovada
**Versao:** 1.0
**Fase:** 28
**Responsavel de negocio:** Thiago Sousa
**Dependencias:** ADR-0024 - Identidade e Vinculo Pos-Contratacao, ADR-0025 - Ciclo de Vida de Acesso Pos-Contratacao, SPEC-003 - Membership, SPEC-004 - Roles & Permissions, SPEC-025 - OrganizationPerson e Employment, SPEC-026 - Offboarding
**Ultima atualizacao:** 2026-08-20

**Nota de revisao destrutiva (v1.0):** este documento nasce em v0.1 e e
atacado na mesma tarefa (secao 43). Nenhuma secao normativa abaixo permanece
sem que a revisao destrutiva tenha sido aplicada a ela; as correcoes ja
estao incorporadas ao texto das secoes 1 a 42.

**Nota de reconciliacao pos-implementacao (2026-08-20, permanece v1.0):**
o gate de concorrencia real da Fase 28 (testes reais contra PostgreSQL,
nao apenas inspecao de codigo) invalidou dois pressupostos tecnicos sobre
mecanismo de lock (nunca uma regra de negocio, RBAC, lifecycle ou fonte de
verdade). Corrigido nas secoes 13, 26, 27, 44 e 45 -- ver secao 44 para o
resumo. Versao mantida em 1.0 por nao haver, neste repositorio, precedente
de bump de versao para correcao de pressuposto tecnico invalidado por
teste (distinto de mudanca de escopo/capacidade, que exigiria nova
versao).

## 1. Objetivo

Transformar ADR-0025 em comportamento normativo implementavel: definir
`AccessGrant`, a entidade de proveniencia e governanca que liga um
`Membership` existente a uma `OrganizationPerson` e, opcionalmente, a um
`Employment`, sem nunca substituir `Membership` como fonte de verdade de
autorizacao tecnica.

Esta SPEC fecha: modelo conceitual, cardinalidade, elegibilidade,
proveniencia, lifecycle, concessao, revogacao atomica, semantica sobre
`Membership`, protecao do ultimo owner, recontratacao, fronteira com
`Employment.end()` e `Offboarding`, RBAC, Organization archived,
idempotencia, concorrencia, atomicidade, auditoria, multiempresa, mass
assignment, privacidade, zero IA, historico/no-delete, compatibilidade
retroativa, API conceitual, UI conceitual, criterios de aceite e testes
obrigatorios futuros.

## 2. Fora do Escopo

Esta SPEC nao define nem implementa:

- codigo, migration, alteracao de banco, rotas, servicos ou UI executavel;
- testes executaveis;
- plano tecnico de implementacao;
- formalizacao de Fase numerada;
- alteracao de ADR-0024, ADR-0025, SPEC-003, SPEC-004, SPEC-025 ou SPEC-026;
- alteracao de BACKLOG ou roadmap;
- autenticacao, gestao de senha, sessao, token, SSO ou SCIM;
- provisionamento tecnico externo (e-mail, sistemas de terceiros);
- automacao de `Offboarding` chamando este dominio automaticamente;
- criacao automatica de `User`, `Membership`, `OrganizationPerson` ou
  `Employment`;
- autosservico da pessoa vinculada;
- contractor, freelancer, terceiros;
- multiplos vinculos ativos simultaneos;
- Inteligencia Artificial, score, ranking, risco de acesso calculado,
  sugestao automatica de revogacao ou decisao automatizada.

## 3. Fontes Obrigatorias e Evidencias

Lidas integralmente antes da redacao: `CONSTITUICAO_DO_PROJETO.md`,
`AGENTS.md`, ADR-0024, ADR-0025, SPEC-003, SPEC-004, SPEC-016, SPEC-017,
SPEC-025, SPEC-026, migration 0002 (`users`/`memberships`), migration 0027
(Employment), migration 0030 (Offboarding), `src/server/core/service.ts`
(`CoreService.updateMembership`), `src/server/core/authorization.ts`
(`authorize()`), `src/server/employments/*`, `src/server/offboardings/*`,
`tests/phase1/*`, `tests/phase24/*`, `tests/phase27/*`.

Evidencias fisicas relevantes usadas como base normativa:

- `memberships` possui `UNIQUE (organization_id, user_id)` -- um `User`
  tem, no maximo, um `Membership` por `Organization` (migration 0002);
- `authorize()` nunca consulta `Employment`, `OrganizationPerson` ou
  qualquer entidade pos-contratacao -- `Membership.status` +
  `Membership.role` sao suficientes e permanecem suficientes;
- `CoreService.updateMembership` ja implementa RBAC, protecao do ultimo
  owner ativo (RN-006, SPEC-003) e auditoria (`membership.activated`,
  `membership.deactivated`, `membership.role_changed`,
  `membership.last_owner_change_denied`) -- mecanismo maduro e testado
  (`tests/phase1/*`) que esta SPEC reaproveita por delegacao, nunca
  duplica;
- `enforce_employment_update_rules` (migration 0027) e
  `enforce_offboarding_insert_rules`/`enforce_offboarding_update_rules`
  (migration 0030) confirmam o padrao fisico ja consolidado de indice
  parcial unico + trigger de imutabilidade que esta SPEC reaproveita.

## 4. Definicao do Problema

**O que significa uma pessoa "ter acesso" a Organization?** Tecnicamente,
`Membership.status = 'active'` mais `Membership.role` autorizado. Isso
**continua** sendo verdade apos esta SPEC -- `Membership` permanece, sozinho,
suficiente para a pergunta de autorizacao.

O problema que esta SPEC resolve e outro: **por que esta `Membership` esta
associada operacionalmente a esta pessoa e, opcionalmente, a este
`Employment`?** Hoje essa pergunta nao tem resposta consultavel. Esta SPEC
cria `AccessGrant` para respondê-la, e permite governar explicitamente:
concessao, proveniencia, revogacao, historico e recontratacao.

`AccessGrant` **nao resolve autenticacao** e **nao substitui `Membership`**.
Nunca e uma segunda porta de autorizacao.

## 5. Modelo Conceitual

`AccessGrant` e um aggregate proprio, seguindo o mesmo padrao ja aprovado
para `DevelopmentPlan` (SPEC-017) e `Offboarding` (SPEC-026): entidade com
lifecycle, autoria e auditoria proprios, referenciando entidades ja
existentes por FK tenant-safe, nunca fundida com nenhuma delas.

```text
Organization 1:N AccessGrant
OrganizationPerson 1:N AccessGrant (historico)
Membership 1:N AccessGrant (historico)
Employment 0:N AccessGrant (proveniencia opcional)
```

## 6. AccessGrant - Dados Minimos

| Campo | Obrigatorio | Observacao |
| --- | ---: | --- |
| `id` | Sim | Identificador interno. |
| `organization_id` | Sim | Organization proprietaria. |
| `organization_person_id` | Sim | Pessoa da mesma Organization. |
| `membership_id` | Sim | Membership da mesma Organization sendo governado. |
| `employment_id` | Nao | Proveniencia opcional; quando presente, deve pertencer a mesma `OrganizationPerson`. |
| `provenance_type` | Sim | `employment` ou `administrative` -- mesmo padrao de `Employment.origin_type` (SPEC-025 s6). |
| `grant_reason` | Condicional | Obrigatorio quando `provenance_type = administrative`; minimizado, ate 1000 caracteres. Ausente quando `provenance_type = employment`. |
| `status` | Sim | `active` ou `revoked`. |
| `created_by_user_id` | Sim | Ator que concedeu. |
| `created_at` | Sim | Timestamp tecnico de criacao. |
| `revoked_at` | Nao | Timestamp da revogacao. |
| `revoked_by_user_id` | Nao | Ator que revogou. |
| `revocation_reason_category` | Condicional | Obrigatorio ao revogar; enum fechado minimizado (secao 12.1). |
| `updated_at` | Sim | Timestamp tecnico de atualizacao, convencao ja usada em toda tabela do dominio pos-contratacao. |

Nenhum outro campo. Sem texto livre irrestrito, sem `version` (concorrencia
e resolvida por lock + indice parcial, mesmo padrao ja usado em todo o
dominio, nao por versionamento otimista).

## 7. Cardinalidade de AccessGrant Active

**Fechado sem ambiguidade:** no maximo **um** `AccessGrant` `active` por
`Membership`, a qualquer momento.

Nao pode existir mais de um `AccessGrant active` para a mesma `Membership`,
mesmo quando:

- a proveniencia (`employment_id`) e diferente;
- houve recontratacao;
- a `Membership` foi reutilizada entre vinculos.

Justificativa: um `Membership` sempre tem exatamente uma resposta valida
para "qual e a proveniencia atualmente registrada", nunca duas
concorrentes. Para registrar nova proveniencia enquanto uma ja existe
`active`, a anterior deve ser revogada primeiro -- dois atos explicitos e
auditados, nunca uma substituicao implicita. Mesmo principio ja usado por
`idx_employments_one_non_final` (SPEC-025) e `idx_offboardings_one_non_final`
(SPEC-026).

Nao ha restricao sobre quantos `AccessGrant` **historicos** (`revoked`)
uma `Membership` pode acumular ao longo do tempo.

## 8. Elegibilidade para Concessao

**Membership:** deve pertencer a mesma `Organization`; deve estar `active`
no momento da concessao (nao ha sentido em registrar proveniencia de um
acesso que nao esta em vigor). Qualquer `role` (`owner`, `admin`, `member`)
e elegivel -- `AccessGrant` e ortogonal a `role`.

**OrganizationPerson:** deve pertencer a mesma `Organization`. Nao possui
estado proprio relevante (SPEC-025: "nao recebe lifecycle artificial") --
nenhuma checagem adicional de estado e exigida.

**Employment (quando informado):** deve pertencer a mesma
`OrganizationPerson` e a mesma `Organization`. Estados elegiveis: `active`
e `ended` -- mesma regra ja fechada por SPEC-026 s8 para Offboarding, pelo
mesmo motivo: `pending` nao chegou a ser operacional (SPEC-017 s4: "pending
permite somente leitura administrativa de contexto"), `cancelled` nunca
existiu operacionalmente. Nao reaberta por analogia frouxa -- reaproveitada
por resolver exatamente o mesmo problema estrutural ja resolvido para
Offboarding.

| Estado de Employment | Elegivel como proveniencia |
| --- | --- |
| `pending` | Nao |
| `active` | Sim |
| `ended` | Sim |
| `cancelled` | Nao |

## 9. Proveniencia

Quando `employment_id` esta presente (`provenance_type = employment`):

- `Organization` de `Employment` deve coincidir com a de `AccessGrant`;
- `Employment.organization_person_id` deve ser exatamente a
  `organization_person_id` de `AccessGrant`;
- estado elegivel conforme secao 8;
- nunca inferido por e-mail, nome, `Candidate` ou similaridade de dados --
  sempre `employment_id` explicito informado pelo ator, mesmo principio ja
  fixado por SPEC-025 s5.2 e reforcado por SPEC-016 v1.1 s44.1;
- imutavel apos a criacao do `AccessGrant` (mesma regra de proveniencia
  imutavel ja aplicada a `Employment` e `Offboarding`).

Quando `employment_id` esta ausente (`provenance_type = administrative`):

- `grant_reason` e obrigatorio, minimizado, ate 1000 caracteres -- mesma
  forma de `Employment.origin_reason`;
- valido para qualquer `Membership`/`OrganizationPerson` coerente com a
  Organization, sem exigir nenhum `Employment` existir. Cobre, por exemplo,
  documentar formalmente um acesso ja concedido antes desta SPEC existir,
  ou justificar administrativamente um acesso que nao decorre diretamente
  de um vinculo laboral especifico.

## 10. Nunca Cria Entidades Relacionadas

`AccessGrant` nunca cria, automaticamente ou como efeito colateral:

- `User`;
- `Membership`;
- `OrganizationPerson`;
- `Employment`.

Todas devem existir previamente, criadas pelos fluxos ja aprovados
(SPEC-002, SPEC-003, SPEC-025). Criar `AccessGrant` para uma combinacao
onde qualquer uma dessas entidades nao existe e recusado com erro,
nunca corrigido silenciosamente criando a entidade ausente.

## 11. Lifecycle

Dois estados: `active` -> `revoked`.

`active` e o estado de criacao -- `AccessGrant` registra uma decisao ja
tomada por owner/admin, nunca um workflow de etapas; por isso nao existe
`pending`. `revoked` e final e imutavel; nunca reabre.

Avaliado e rejeitado um terceiro estado `cancelled` distinto de `revoked`:
diferente de `Employment` (`cancelled` = nunca operacional, versus `ended`
= foi operacional e parou), `AccessGrant` nao tem um "momento de inicio
operacional" separado da criacao -- esta ativo desde que criado. Uma
concessao criada por engano tem exatamente o mesmo tratamento de qualquer
outra revogacao: `revoke` com `revocation_reason_category =
administrative_correction` (secao 12.1). Um terceiro estado nao agregaria
distincao real, apenas complexidade -- rejeitado por nao ter justificativa
normativa.

Transicoes fora de `active -> revoked` sao proibidas.

## 12. Concessao (Grant)

Ator: exclusivamente owner ou admin.

Pre-condicoes: `Organization` ativa; `User` ativo; `Membership` ativa da
mesma Organization com `role` autorizada; elegibilidade da secao 8;
proveniencia coerente da secao 9; nenhum `AccessGrant active` ja existente
para a mesma `Membership` (secao 7); `Idempotency-Key`.

Regras:

- cria sempre em `active`;
- nunca cria `User`/`Membership`/`OrganizationPerson`/`Employment` (secao
  10);
- idempotente: mesma chave + mesmo fingerprint retorna o mesmo `AccessGrant`
  ja criado; mesma chave + fingerprint diferente gera conflito seguro;
  tentativa concorrente de segunda concessao ativa para a mesma
  `Membership` (chave diferente) gera conflito seguro pelo indice parcial
  unico (secao 7).

### 12.1 Categorias de Revogacao (antecipadas aqui por serem parte do
mesmo enum fechado usado pela concessao administrativa)

`revocation_reason_category`: enum fechado, minimizado, nunca texto livre:

- `employment_ended`;
- `role_change`;
- `security_concern`;
- `administrative_correction`;
- `other_minimized`.

## 13. Revogacao (Revoke) - Operacao Critica

Esta e a operacao central desta SPEC. Sequencia normativa, executada dentro
de **uma unica transacao**:

1. localizar e travar o `AccessGrant` (deve existir, pertencer a mesma
   Organization, estar `active`);
2. consultar o `Membership` referenciado (deve existir, pertencer a mesma
   Organization). Esta consulta e uma leitura de decisao (para escolher
   entre os passos 3 e 4 abaixo, evitando uma chamada redundante), **nunca
   a autoridade de lock ou de mutacao sobre `Membership`** -- essa
   autoridade e exclusiva de `CoreService.updateMembership` (SPEC-003).
   Este dominio nunca adquire lock proprio sobre `Membership` antes de
   delegar;
3. se, nessa leitura, `Membership.status = 'active'`: delegar a
   `CoreService.updateMembership(membershipId, { status: 'inactive' })` --
   **nunca reimplementar** a logica de RBAC, protecao do ultimo owner,
   disciplina de lock ou auditoria de `Membership`, sempre reaproveitar o
   mecanismo canonico ja existente (SPEC-003) por inteiro. `CoreService` e
   quem trava e rele `Membership` sob sua propria disciplina canonica de
   lock antes de persistir qualquer campo -- nenhuma mutacao de
   `Membership` originada por este dominio pode se basear num snapshot
   lido antes desse lock (autoridade normativa sobre essa invariante:
   SPEC-003; ver tambem secao 27);
4. se, nessa leitura, `Membership.status` ja for `'inactive'`: **nao
   chamar** `CoreService.updateMembership` -- nao ha mutacao a fazer, e
   chamar mesmo assim produziria um evento `membership.deactivated`
   redundante e espurio na trilha de auditoria de `Membership`, que
   pertence a outro dominio. Se a leitura do passo 2 estiver desatualizada
   no instante em que `CoreService` de fato travaria (corrida rara com uma
   terceira operacao concorrente), o pior caso e uma chamada redundante ao
   Core sobre uma `Membership` ja `inactive` -- nunca um estado corrompido,
   apenas um evento de auditoria adicional e legitimo de outro dominio;
5. somente apos o passo 3 ou 4 ter sucesso, marcar `AccessGrant` como
   `revoked`, com `revoked_at`, `revoked_by_user_id` e
   `revocation_reason_category`;
6. emitir auditoria de `AccessGrant` (`access_grant.revoked`).

Falha em qualquer passo -- incluindo `CoreService` recusar a mutacao de
`Membership` (por exemplo, ultimo owner ativo, secao 14) -- reverte a
transacao inteira: `AccessGrant` permanece `active`, nenhuma mutacao
parcial de `Membership` sobrevive.

`revoke` exige `Idempotency-Key`, mesmo padrao de idempotencia da secao 20.
Retry com a mesma chave e mesmo `AccessGrant` ja `revoked` retorna o mesmo
resultado.

## 14. Ultimo Owner

Se o `Membership` alvo for o ultimo owner ativo da Organization,
`CoreService.updateMembership` **ja recusa** a mutacao (RN-006, SPEC-003,
mecanismo existente e testado, `tests/phase1/*`). Esta SPEC nunca
reimplementa essa regra e nunca cria bypass.

Quando isso ocorre durante um `revoke`:

- `AccessGrant` permanece `active` -- nenhuma revogacao parcial;
- `CoreService` ja audita sua propria negacao
  (`membership.last_owner_change_denied`), preservada inalterada;
- `AccessGrant` audita adicionalmente `access_grant.conflict`, com motivo
  `last_owner_protected`, para que o historico deste dominio tambem
  registre que a tentativa de revogacao falhou e por que;
- resposta de erro segura (conflito), nunca 500 generico.

## 15. Self-revoke

Nenhuma regra nova e criada. Um ator pode revogar seu proprio
`AccessGrant`/`Membership` se as regras ja existentes do Core permitirem --
a unica restricao aplicavel continua sendo a protecao do ultimo owner
(secao 14). Nenhuma excecao silenciosa e criada para autorrevogacao.

## 16. Reativacao

`AccessGrant revoked` nunca reabre.

Se o acesso for restaurado:

1. `Membership` e reativada exclusivamente pelo mecanismo canonico ja
   existente (`CoreService.updateMembership(membershipId, { status:
   'active' })`, SPEC-003) -- fora do escopo funcional desta SPEC, que nao
   cria endpoint proprio de reativacao de `Membership`;
2. um **novo** `AccessGrant active` **pode** ser criado, se a Organization
   quiser reafirmar formalmente a proveniencia -- **nunca obrigatorio**.
   Reativar `Membership` e criar novo `AccessGrant` sao atos independentes
   e desacoplados; nenhum dos dois implica o outro automaticamente.

Nenhum historico e reescrito. O `AccessGrant` antigo permanece `revoked`
para sempre.

## 17. Recontratacao

Cenario obrigatorio:

```text
OrganizationPerson A
  Employment 1 -> active
  Membership X -> active
  AccessGrant 1 (membership_id=X, employment_id=1) -> active

Employment 1 -> ended
Employment 2 -> active (novo, criado pela SPEC-025)
```

- `Employment.end()` **nunca** revoga `AccessGrant` nem `Membership`
  automaticamente (preserva SPEC-025 s14/s16 integralmente).
- `AccessGrant 1` **nao muda automaticamente** -- permanece `active`,
  como proveniencia agora desatualizada (referencia um `Employment` que
  ja terminou), o que **nao e um estado invalido** (secao 21).
- `Offboarding`, se existir para `Employment 1`, **nunca** revoga
  `AccessGrant` automaticamente (preserva SPEC-026 integralmente, secao
  18).
- Se houver revogacao humana explicita, `AccessGrant 1` vira `revoked`
  (secao 13).
- `Employment 2` **nunca** reabre `AccessGrant 1`.
- Nova concessao formal sob o novo vinculo cria `AccessGrant 2`
  (`membership_id=X`, `employment_id=2`) -- exige que `AccessGrant 1`
  esteja `revoked` primeiro, pela regra da secao 7 (no maximo um `active`
  por `Membership`).
- `Membership X` pode ser reutilizada entre `Employment 1` e `Employment 2`
  livremente, se as regras do Core (SPEC-003) permitirem -- esta SPEC nao
  impoe nenhuma restricao adicional sobre reuso de `Membership`.

## 18. Employment Ended

`Employment.end()` (SPEC-025), isoladamente, **nao produz nenhum efeito**
sobre `AccessGrant`. Nenhuma trigger, nenhum evento, nenhuma mutacao
automatica -- preserva integralmente ADR-0025 e SPEC-025 s14/s16.

Um `AccessGrant active` que referencia um `Employment` agora `ended`
continua sendo um registro valido: a proveniencia historica de por que o
acesso foi concedido nao deixa de ser verdadeira so porque o vinculo
terminou depois. Encerrar o vinculo e decidir sobre o acesso continuam
sendo dois atos distintos, cada um exigindo sua propria decisao humana.

## 19. Offboarding

Preserva SPEC-026 integralmente:

- `Offboarding` **nunca** cria `AccessGrant`;
- `Offboarding` **nunca** revoga `AccessGrant`;
- `Offboarding` **nunca** altera `Membership`, direta ou indiretamente,
  por si so;
- concluir ou cancelar um `Offboarding` **nao** aciona nenhuma operacao
  deste dominio.

Uma `OffboardingTask` pode continuar contendo, como hoje, apenas texto
minimizado do tipo "revisar acesso" -- isso nao muda com esta SPEC.

Uma integracao aditiva **futura**, totalmente opcional, poderia permitir
que uma `OffboardingTask` referencie um `access_grant_id` para contexto de
navegacao. Essa integracao **nao e definida nem normatizada por esta
SPEC** -- exigiria revisao propria e aditiva de SPEC-026, no mesmo espirito
ja usado pela integracao Onboarding->Employment (SPEC-016 v1.1). Registrada
aqui apenas como possibilidade futura, nao como decisao.

## 20. Membership Administrativa (sem Employment)

Regra normativa explicita: `Membership` de owner, admin, recruiter ou
qualquer outro papel puramente administrativo, sem nenhum vinculo laboral,
**continua valida integralmente sem nunca precisar de `AccessGrant`**.

- Ausencia de `AccessGrant` **nunca** invalida, restringe ou degrada a
  autorizacao de um `Membership`;
- `AccessGrant` **nunca** se torna requisito universal de autorizacao, em
  nenhuma circunstancia, presente ou futura, sem uma nova ADR que altere
  esta decisao;
- todo `Membership` administrativo criado antes ou depois desta SPEC
  permanece, para sempre, plenamente valido sem `AccessGrant`.

## 21. Fonte de Verdade

Fechado sem ambiguidade, para nunca criar duas fontes de verdade
contraditorias:

- **Autorizacao tecnica** (pode agir, com qual `role`):
  exclusivamente `Membership`. `authorize()` nunca consulta `AccessGrant`
  e esta SPEC nunca exige que consulte.
- **Proveniencia e governanca** (por que o acesso existe, desde quando,
  sob qual vinculo, quem decidiu): exclusivamente `AccessGrant`.

Consequencias explicitas:

- `AccessGrant active` + `Membership inactive`: **nao concede acesso**.
  `Membership.status` decide sozinho; um `AccessGrant active` orfao de
  autorizacao real e apenas um registro de proveniencia desatualizado, o
  mesmo tratamento dado a proveniencia referenciando `Employment ended`.
- `AccessGrant revoked` + `Membership active`: **nao e um estado
  invalido** por si so. A operacao normal de `revoke` (secao 13) e
  atomica exatamente para nunca **produzir** esse estado como resultado
  de si mesma. Mas o estado pode surgir legitimamente por um caminho
  totalmente separado: `Membership` reativada depois, por ato
  administrativo direto de SPEC-003, sem que um novo `AccessGrant` tenha
  sido criado (secao 16, criacao de novo `AccessGrant` e opcional). Isso
  e equivalente, em tudo, a um `Membership` administrativo sem nenhum
  `AccessGrant` -- nao e um erro, e apenas ausencia de proveniencia
  registrada no momento.
- Divergencias produzidas por alteracao manual direta do banco **ficam
  fora do escopo de deteccao/reconciliacao desta SPEC** -- a Constituicao
  do projeto ja proibe alteracao manual do banco como processo oficial
  ("Banco de dados", item 2); esta SPEC nao cria um mecanismo de
  auditoria de integridade para compensar violacoes desse principio.

## 22. RBAC

| Acao | owner | admin | member | Platform Admin |
| --- | :---: | :---: | :---: | :---: |
| Conceder AccessGrant | Sim | Sim | Nao | Nao |
| Revogar AccessGrant | Sim | Sim | Nao | Nao |
| Consultar AccessGrant | Sim | Sim | Nao | Nao funcional |
| Leitura administrativa | Nao | Nao | Nao | Sim, com motivo |

`member` nao possui nenhum acesso a este dominio nesta v1 -- nem para
conceder, nem para revogar, nem para consultar o proprio `AccessGrant`.
Avaliada e rejeitada, por falta de necessidade normativa demonstrada em
qualquer fonte obrigatoria, uma leitura de autotransparencia ("por que eu
tenho acesso") para `member` -- isso seria uma forma de autosservico, ja
excluido explicitamente da v1 (secao 2). Fechamento conservador, no mesmo
padrao ja usado por SPEC-025 s20 para `OrganizationPerson`/`Employment`.

Nenhuma regra nova de `Membership` e criada por esta matriz -- revogar
delega integralmente a RBAC ja existente de SPEC-004 via
`CoreService.updateMembership` (secao 13).

## 23. Platform Admin

Nunca concede, nunca revoga. Leitura administrativa minimizada, com motivo
obrigatorio e auditoria (`access_grant.administrative_read`), mesmo padrao
de todo o dominio pos-contratacao. Zero mutacao funcional -- preferencia
conservadora, sem excecao de recuperacao emergencial (nenhuma fonte
normativa exige uma).

## 24. Organization Archived

- bloquear concessao de `AccessGrant`;
- bloquear revogacao de `AccessGrant`;
- leitura historica permanece possivel;
- Platform Admin permanece restrito a leitura administrativa minimizada,
  com motivo e auditoria.

Nenhuma excecao de "revogacao emergencial" em Organization arquivada e
criada: uma Organization arquivada ja bloqueia, por SPEC-003 RN-012/RN-013,
que qualquer `Membership` seja usado como contexto atual ou execute
operacoes normais -- o arquivamento em si ja produz o efeito pratico de
impedir uso do acesso, tornando uma excecao de revogacao emergencial
desnecessaria. Nao inventada por falta de base normativa.

## 25. Idempotencia

Duas operacoes mutaveis exigem `Idempotency-Key`: **conceder** e
**revogar**.

Semantica obrigatoria, identica ao padrao ja aprovado em SPEC-025 s21,
SPEC-016 s32 e SPEC-026 s23:

- chave + fingerprint iguais em estado `completed` retornam o mesmo
  resultado;
- chave igual + fingerprint diferente retorna conflito seguro;
- operacao em `pending` nunca duplica efeito;
- `failed` permite retry conforme categoria de falha;
- `key_hash` armazenado como hash SHA-256; a chave bruta **nunca** e
  persistida;
- resultado idempotente nunca pula validacoes de Organization, permissao,
  status ou proveniencia;
- falha de auditoria critica causa rollback e nunca e registrada como
  sucesso idempotente.

## 26. Concorrencia

Resultados deterministicos obrigatorios:

- **grant x grant** (mesma `Membership`): indice parcial unico (secao 7)
  garante que apenas um `AccessGrant active` sobrevive; a segunda
  transacao recebe conflito seguro, nunca duplica;
- **grant x revoke**: se `revoke` confirmar primeiro, o `AccessGrant`
  antigo deixa de estar `active` e um `grant` concorrente pode suceder
  normalmente; se `grant` confirmar primeiro enquanto o antigo ainda esta
  `active`, o indice parcial unico impede a segunda linha ativa e o
  `revoke` que viria depois opera normalmente sobre o `AccessGrant`
  original;
- **revoke x revoke** (mesmo `AccessGrant`): lock na linha; primeira
  transacao confirmada vence; retry com a mesma chave e mesmo resultado e
  idempotente; tentativa distinta apos ja `revoked` recebe conflito
  seguro;
- **grant x Membership deactivate** (via SPEC-003 diretamente): `grant`
  revalida `Membership.status = active` dentro da propria transacao; se a
  desativacao confirmar primeiro, `grant` falha por elegibilidade;
- **revoke x Membership deactivate** (via SPEC-003 diretamente, ator
  diferente): a disciplina canonica de lock de `CoreService`
  (`lockMembershipsByOrganization`, SPEC-003) -- nunca um lock proprio
  deste dominio sobre `Membership` (secao 13, passo 2) -- serializa as
  duas tentativas; a que confirmar primeiro prevalece. Se `revoke` for a
  que confirma depois, ele encontra `Membership` ja `inactive` na leitura
  do passo 2 e segue o caminho da secao 13, passo 4 (sem chamada
  redundante); se a leitura do passo 2 estiver desatualizada por corrida
  residual, a chamada redundante ao Core e inofensiva (nao corrompe
  estado, apenas produz um evento adicional legitimo de outro dominio --
  ver secao 13, passo 4);
- **revoke x Membership role change** (SPEC-003): ortogonal, sem
  conflito -- `AccessGrant` nunca depende de `role`;
- **grant x Employment.end()**: nunca gera conflito por si so -- `active`
  e `ended` sao igualmente elegiveis (secao 8), mesmo padrao ja
  estabelecido para `Offboarding` (SPEC-026 s24);
- **revoke x Employment.end()**: ortogonal, `revoke` nunca consulta nem
  muda `Employment`;
- **recontratacao/novo grant x revoke do AccessGrant antigo**:
  estruturalmente independentes (linhas distintas, `employment_id`
  distintos), nenhuma trava cruzada necessaria;
- **Organization archive x grant**: `grant` revalida Organization ativa
  como primeira instrucao dentro da transacao (leitura, sem lock proprio
  sobre `organizations` -- nenhum dominio pos-contratacao deste projeto
  trava a linha de `organizations`). Dois resultados sao igualmente
  legitimos, decididos pela ordem efetiva de confirmacao, nao por uma
  serializacao garantida: (A) se `grant` ja tiver confirmado antes do
  arquivamento, a concessao permanece valida como registro historico; (B)
  se o arquivamento confirmar antes da revalidacao de `grant` observa-lo,
  `grant` falha (`403`, Organization archived). Esta SPEC nao promete
  serializacao entre as duas operacoes que o sistema hoje nao oferece --
  risco arquitetural cross-domain registrado explicitamente na secao 44;
- **Organization archive x revoke**: mesma logica e mesma ausencia de
  lock proprio sobre `organizations`. Sem estado parcial em nenhum dos
  dois resultados: se `revoke` confirmar (200), `AccessGrant` fica
  `revoked` e `Membership` fica `inactive` juntos (atomicidade da secao
  28, inalterada); se o arquivamento confirmar antes da revalidacao,
  `revoke` falha (Organization archived bloqueia
  ambas as mutacoes, secao 24).

## 27. Disciplina de Lock (conceitual)

**Nota de reconciliacao (registrada apos o gate de concorrencia real da
Fase 28):** a versao original desta secao cristalizava uma ordem fisica
especifica ("travar a linha de `Membership` antes da linha de
`AccessGrant`") como se fosse a regra estavel. Testes reais de
concorrencia contra PostgreSQL (dois pares: `grant` x `Employment.end()`
e `revoke` x uma chamada direta e independente de
`CoreService.updateMembership`) demonstraram que essa ordem especifica
produzia deadlocks genuinos (`40P01`) quando este dominio adquiria um
lock proprio sobre `Membership` ANTES de `CoreService.updateMembership`
tambem travar (organization-wide) essa mesma linha na mesma transacao. A
implementacao corrigida passou a nunca adquirir lock proprio sobre
`Membership` -- corrigido nesta secao e na secao 13. O erro nao estava na
INTENCAO da regra original (evitar deadlock com `CoreService`), estava em
fixar uma ordem fisica especifica como se fosse garantidamente livre de
deadlock sem tê-la confrontado com concorrência real.

Esta secao agora fixa apenas invariantes normativas, nunca uma ordem SQL
especifica -- a ordem fisica exata pertence ao plano tecnico/implementacao
e pode evoluir sem exigir nova revisao normativa desta SPEC, desde que
continue satisfazendo as invariantes abaixo:

- toda operacao concorrente deste dominio deve produzir um resultado
  deterministico via locks (nunca por sorte de timing) -- ver secao 26
  para o catalogo completo de pares e resultados esperados;
- `AccessGrant.revoke` deve permanecer atomico com a mutacao delegada de
  `Membership`: nunca existe `AccessGrant revoked` com a mutacao de
  `Membership` pendente ou ausente quando devida, nem o inverso (secao
  28, inalterada);
- `CoreService` (SPEC-003) continua sendo a autoridade EXCLUSIVA de lock
  e mutacao sobre `Membership` -- este dominio nunca adquire lock proprio
  sobre `Membership` antes ou em paralelo a essa autoridade, e nunca
  contorna ou precede a disciplina de lock que `CoreService` ja usa
  internamente (`lockMembershipsByOrganization`);
- `AccessGrant` nunca implementa regra propria de protecao do ultimo
  owner -- essa regra (RN-006) e, e permanece, exclusiva de `CoreService`
  (secao 14, inalterada);
- nenhuma operacao deste dominio, nem a delegacao que ele aciona em
  `CoreService`, pode persistir um campo de `Membership` derivado de um
  snapshot lido ANTES do lock transacional canonico ser adquirido --
  o estado de `Membership` usado para qualquer update deve ser relido sob
  a disciplina de lock canonica do Core antes de ser persistido (essa
  invariante pertence, em sua integra, a autoridade de SPEC-003 sobre
  `Membership`; registrada aqui apenas como consequencia direta, nao
  duplicada);
- travar a linha do proprio `AccessGrant` (quando aplicavel) e sempre
  seguro e nunca precisa coordenacao com `CoreService`, porque nenhum
  outro dominio deste projeto trava linhas de `access_grants`.

Detalhe tecnico atual (nao contrato de dominio eterno): na implementacao
vigente, `AccessGrant.revoke` trava sua propria linha primeiro e consulta
(sem lock proprio) o `Membership` referenciado antes de delegar a
`CoreService.updateMembership`, que e quem efetivamente trava e rele
`Membership`. Esse detalhe fisico pode mudar em revisoes futuras de
implementacao sem exigir nova revisao desta SPEC, desde que as invariantes
acima continuem satisfeitas.

## 28. Atomicidade

Devem ser atomicamente consistentes:

- concessao de `AccessGrant` + auditoria;
- revogacao de `AccessGrant` + mutacao delegada de `Membership` (quando
  aplicavel) + auditoria de ambos os dominios.

Falha em qualquer parte -- incluindo recusa de `CoreService` (ultimo
owner) ou falha de auditoria critica -- reverte a operacao inteira. Nunca
existe `AccessGrant revoked` com a mutacao de `Membership` pendente ou
ausente quando ela era devida, nem o inverso.

Eventos de negacao/conflito que precisam sobreviver ao rollback (por
exemplo, `access_grant.conflict` por ultimo owner, ou
`access_grant.idempotency_conflict`) sao auditados **fora** da transacao
abortada, usando a conexao nao-transacional, nunca a instancia
`scoped(tx)` que esta prestes a sofrer `ROLLBACK` -- mesmo padrao ja
comprovado e documentado em `employments/service.ts` e
`offboardings/service.ts`.

## 29. Auditoria

Eventos minimos:

- `access_grant.created`;
- `access_grant.revoked`;
- `access_grant.permission_denied`;
- `access_grant.cross_organization_access_denied`;
- `access_grant.administrative_read`;
- `access_grant.conflict` (cobre conflito de idempotencia, conflito de
  concorrencia e negacao por protecao do ultimo owner durante `revoke`,
  de forma uniforme).

Eventos ja existentes de `Membership` (`membership.deactivated`,
`membership.activated`, `membership.last_owner_change_denied`) continuam
sendo emitidos por `CoreService`, sem duplicacao por este dominio.

Auditoria nunca registra PII, `grant_reason` ou `revocation_reason_category`
com contexto adicional identificavel alem do necessario, token, header ou
segredo -- apenas identificadores internos, tipo de evento, ator,
Organization, timestamp e resultado.

## 30. Multiempresa

- `organization_id` obrigatorio em `AccessGrant`, derivado do contexto
  autorizado no servidor, nunca do payload;
- FKs tenant-safe: `(organization_id, organization_person_id)`,
  `(organization_id, membership_id)`, `(organization_id, employment_id)`
  quando presente;
- bloquear `OrganizationPerson` de outra Organization;
- bloquear `Membership` de outra Organization;
- bloquear `Employment` de outra Organization;
- bloquear IDOR de `AccessGrant` por ID manipulado;
- mensagens de erro cross-tenant genericas, sem revelar existencia do
  registro.

## 31. Mass Assignment

Inputs nunca podem definir diretamente:

- `organization_id`;
- `status`;
- `created_by_user_id`, `revoked_by_user_id`;
- `revoked_at`, `created_at`, `updated_at`;
- metadata de auditoria;
- campos internos de idempotencia (`key_hash`, `request_fingerprint`).

Toda operacao usa allow-list explicita.

## 32. Privacidade

Lista positiva: identificadores internos, `provenance_type`, `grant_reason`
minimizado (so quando administrativo), `revocation_reason_category`
(enum fechado), status, timestamps, autoria.

Proibido, sem excecao normativa futura explicita: senha; token; sessao;
qualquer dado de autenticacao; e-mail; telefone; documentos pessoais;
salario; dados de saude; notas livres irrestritas; motivo sensivel de
desligamento (isso pertence a `Employment.end_reason`, nunca duplicado
aqui). `AccessGrant` nunca armazena nenhum dado de credencial ou sessao --
apenas a decisao de proveniencia.

## 33. Zero IA

Proibido, sem excecao:

- access risk score;
- insider risk score;
- flight risk;
- ranking de pessoas por risco de acesso;
- recomendacao automatica de revogacao;
- decisao automatizada de concessao ou revogacao;
- qualquer chamada a `AIGateway`, `AI Execution`, provider ou modelo.

Concessao e revogacao sao, sempre e apenas, atos humanos explicitos.

## 34. Historico e No-Delete

- sem hard delete no fluxo normal;
- `AccessGrant revoked` e imutavel para operacoes de negocio;
- proveniencia (`employment_id`, `organization_person_id`,
  `membership_id`, `provenance_type`) e imutavel apos a criacao;
- recontratacao nunca reescreve um `AccessGrant` existente -- sempre cria
  uma nova linha;
- mudancas futuras em `Employment` ou `OrganizationPerson` nunca retroagem
  sobre um `AccessGrant` ja criado.

## 35. Compatibilidade Retroativa

- todos os `User`, `Membership`, `OrganizationPerson` e `Employment` ja
  existentes continuam validos sem nenhum `AccessGrant`;
- **zero backfill inferido automaticamente**: nenhuma migration ou rotina
  administrativa deve tentar adivinhar qual `Membership` pertence a qual
  `Employment`/`OrganizationPerson` por nome, e-mail ou qualquer
  heuristica -- mesmo principio ja aplicado por SPEC-025 s5.2 e SPEC-016
  v1.1 s52;
- `AccessGrant` nunca e criado automaticamente para `Membership`
  existentes;
- ausencia de `AccessGrant` nunca invalida `Membership` historica ou
  administrativa (reforco da secao 20).

## 36. Banco de Dados Conceitual

Modelo minimo futuro:

- `access_grants`;
- `access_grant_idempotency_keys`, se nao houver mecanismo compartilhado
  adequado.

Restricoes conceituais esperadas, seguindo o padrao ja fisicamente
comprovado em `employments`/`offboardings`:

- `organization_id` obrigatorio;
- FKs compostas tenant-safe para `organizations`, `organization_people`,
  `memberships` e, opcionalmente, `employments`;
- indice parcial unico `(organization_id, membership_id) WHERE status =
  'active'` (secao 7);
- CHECK de `status`;
- CHECK de `provenance_type` com exclusividade mutua entre `employment_id`
  presente/`grant_reason` ausente e `employment_id` ausente/`grant_reason`
  presente, mesmo padrao do CHECK `employments_origin_type_payload_check`
  (migration 0027);
- CHECK de `revocation_reason_category` exigido apenas quando
  `status = 'revoked'`;
- trigger impedindo DELETE fisico;
- trigger impedindo transicao fora de `active -> revoked` e impedindo
  mutacao de campos de proveniencia apos criacao;
- **zero alteracao de dominio/comportamento** em `users`, `memberships`,
  `organization_people`, `employments` ou `offboardings`. O unico "toque"
  funcional em `Membership` acontece na camada de aplicacao, nunca no
  schema. Excecao unica, esclarecida em ADR-0025 (2026-08-20): e permitida
  uma constraint auxiliar puramente estrutural e aditiva sobre uma chave ja
  existente de `memberships` -- por exemplo `UNIQUE (organization_id, id)`
  -- exclusivamente quando estritamente necessaria para a FK composta
  tenant-safe desta SPEC, sem alterar dado, lifecycle, RBAC ou
  comportamento funcional de `Membership`.

Nomes fisicos finais, tipos exatos de coluna e indices de apoio adicionais
ficam para o plano tecnico.

## 37. API Conceitual

| Operacao | Finalidade |
| --- | --- |
| Conceder AccessGrant | Criar `active` para uma Membership elegivel. |
| Revogar AccessGrant | `active -> revoked` + delegacao atomica a Membership. |
| Consultar AccessGrant | Obter registro permitido. |
| Listar por Organization | Listagem administrativa (owner/admin). |
| Listar por OrganizationPerson | Historico de proveniencia da pessoa. |
| Listar por Membership | Historico de proveniencia do Membership. |
| Listar por Employment | Quando aplicavel, AccessGrant que referenciam aquele vinculo. |
| Leitura administrativa | Platform Admin, com motivo, DTO minimizado. |

Nenhuma outra operacao e exposta. Especificamente **nao existe** endpoint
de reativacao de `Membership` proprio deste dominio (reaproveita
SPEC-003) nem qualquer endpoint de revogacao de sessao/token (fora do
escopo, secao 2).

## 38. UI Conceitual

Interface administrativa minima futura deve mostrar, para owner/admin:

- pessoa (`OrganizationPerson`);
- `Membership`/`role` associado;
- `Employment` de proveniencia, quando existir;
- status do `AccessGrant`;
- timestamps minimos (concedido em, revogado em).

Nao deve mostrar: score, risco, PII alem do minimo necessario. Sem
autosservico da pessoa vinculada nesta v1 (decisao explicita, nao
omissao).

## 39. Relacao com Futuras Capacidades

Registrado sem implementar: autosservico da pessoa vinculada; integracao
aditiva opcional com `Offboarding` (secao 19); integracao com provedor de
autenticacao real e invalidacao de sessao/token; contractor/freelancer;
multiplos vinculos ativos simultaneos. Nenhuma dessas capacidades e
resolvida por analogia nesta SPEC.

## 40. Criterios de Aceite

### Modelo e cardinalidade

- CA-001: `AccessGrant` nunca substitui `Membership` como fonte de
  autorizacao.
- CA-002: No maximo um `AccessGrant active` por `Membership`.
- CA-003: `Employment 0:N AccessGrant`.
- CA-004: `OrganizationPerson 1:N AccessGrant` historico.
- CA-005: Proveniencia (`employment_id`, `organization_person_id`,
  `membership_id`) e imutavel apos criacao.

### Elegibilidade

- CA-006: Concessao exige `Membership active`.
- CA-007: Concessao com `employment_id` exige Employment `active` ou
  `ended`.
- CA-008: Concessao com `employment_id` em Employment `pending` e
  bloqueada.
- CA-009: Concessao com `employment_id` em Employment `cancelled` e
  bloqueada.
- CA-010: Concessao administrativa exige `grant_reason`.

### RBAC

- CA-011: Owner concede.
- CA-012: Admin concede.
- CA-013: Member nao concede.
- CA-014: Owner revoga.
- CA-015: Admin revoga.
- CA-016: Member nao revoga.
- CA-017: Member nao consulta AccessGrant.
- CA-018: Platform Admin nao concede nem revoga.
- CA-019: Platform Admin leitura administrativa exige motivo.

### Multiempresa

- CA-020: Bloquear Membership de outra Organization.
- CA-021: Bloquear OrganizationPerson de outra Organization.
- CA-022: Bloquear Employment de outra Organization.
- CA-023: Bloquear IDOR de AccessGrant.
- CA-024: Erro cross-tenant e generico.

### Lifecycle

- CA-025: Criacao sempre em `active`.
- CA-026: `active -> revoked` e a unica transicao valida.
- CA-027: `revoked` nunca reabre.
- CA-028: Nao existe estado `pending` nem `cancelled`.

### Revogacao atomica e ultimo owner

- CA-029: Revogar delega a `CoreService.updateMembership`, nunca
  reimplementa a logica.
- CA-030: Revogar Membership do ultimo owner ativo e recusado; AccessGrant
  permanece active.
- CA-031: Falha de qualquer etapa da revogacao reverte a operacao inteira.
- CA-032: Revogar AccessGrant cujo Membership ja esta inactive nao gera
  chamada redundante a CoreService.

### Reativacao e recontratacao

- CA-033: AccessGrant revoked nao reabre.
- CA-034: Reativacao de Membership usa exclusivamente o mecanismo
  canonico de SPEC-003.
- CA-035: Novo AccessGrant apos reativacao e opcional, nunca obrigatorio.
- CA-036: Employment.end() nao altera AccessGrant automaticamente.
- CA-037: Novo Employment (recontratacao) nao reabre AccessGrant antigo.
- CA-038: Nova concessao formal exige AccessGrant anterior revogado
  primeiro.

### Offboarding

- CA-039: Offboarding nunca cria AccessGrant.
- CA-040: Offboarding nunca revoga AccessGrant.
- CA-041: Offboarding nunca altera Membership.

### Membership administrativa e fonte de verdade

- CA-042: Membership administrativo sem Employment permanece valido sem
  AccessGrant.
- CA-043: Ausencia de AccessGrant nunca invalida Membership.
- CA-044: AccessGrant active com Membership inactive nao concede acesso.
- CA-045: AccessGrant revoked com Membership active nao e estado invalido
  por si so.

### Organization archived

- CA-046: Organization archived bloqueia concessao.
- CA-047: Organization archived bloqueia revogacao.
- CA-048: Leitura historica permanece possivel em Organization archived.

### Idempotencia e concorrencia

- CA-049: Concessao exige Idempotency-Key.
- CA-050: Revogacao exige Idempotency-Key.
- CA-051: Retry idempotente identico retorna mesmo resultado.
- CA-052: Fingerprint divergente gera conflito seguro.
- CA-053: grant x grant concorrente produz no maximo um active.
- CA-054: Employment.end() concorrente com concessao nao gera conflito
  por si so.
- CA-055: Organization archive concorrente com concessao/revogacao e
  deterministico.

### Auditoria e atomicidade

- CA-056: Falha de auditoria critica reverte a operacao.
- CA-057: Eventos de conflito sobrevivem fora da transacao abortada.
- CA-058: Auditoria nunca registra PII, token, sessao ou segredo.

### Privacidade e IA

- CA-059: Nenhum dado de credencial/sessao e armazenado.
- CA-060: Nenhum dado de saude, salario ou documento pessoal e
  armazenado.
- CA-061: Zero IA, score, ranking ou decisao automatizada.

### Historico

- CA-062: Sem hard delete.
- CA-063: Zero backfill inferido automaticamente.
- CA-064: Historico preservado apos recontratacao.

## 41. Testes Obrigatorios Futuros

Quando implementada, a funcionalidade deve possuir testes PostgreSQL
destrutivos para:

### Modelo e cardinalidade

1. criar AccessGrant com proveniencia de Employment;
2. criar AccessGrant administrativo sem Employment;
3. bloquear segundo AccessGrant active para a mesma Membership;
4. permitir novo AccessGrant apos o anterior ser revoked;
5. bloquear Employment pending como proveniencia;
6. bloquear Employment cancelled como proveniencia;
7. FK composta tenant-safe para Membership;
8. FK composta tenant-safe para OrganizationPerson;
9. FK composta tenant-safe para Employment;
10. indice parcial unico de cardinalidade confirmado fisicamente.

### Lifecycle e revogacao atomica

11. transicao active -> revoked;
12. bloquear qualquer transicao alem de active -> revoked;
13. bloquear reabertura de AccessGrant revoked;
14. revogacao delega a CoreService.updateMembership;
15. revogacao do ultimo owner e recusada; AccessGrant permanece active;
16. falha de CoreService durante revogacao reverte a transacao inteira;
17. revogar AccessGrant com Membership ja inactive nao duplica evento de
    Membership.

### Recontratacao

18. Employment.end() nao altera AccessGrant;
19. novo Employment nao reabre AccessGrant antigo;
20. nova concessao apos recontratacao exige revogacao previa;
21. Membership reutilizada entre vinculos preserva historico de ambos os
    AccessGrant.

### Offboarding

22. Offboarding completed nao cria AccessGrant;
23. Offboarding completed nao revoga AccessGrant;
24. Offboarding cancelled nao altera AccessGrant.

### RBAC

25. owner concede e revoga;
26. admin concede e revoga;
27. member nao concede;
28. member nao revoga;
29. member nao consulta;
30. Platform Admin nao concede nem revoga;
31. Platform Admin leitura administrativa exige motivo.

### Organization archived

32. bloquear concessao em Organization archived;
33. bloquear revogacao em Organization archived;
34. permitir leitura historica em Organization archived.

### Multiempresa e IDOR

35. bloquear Membership de outra Organization;
36. bloquear OrganizationPerson de outra Organization;
37. bloquear Employment de outra Organization;
38. bloquear IDOR de AccessGrant;
39. mensagem de erro cross-tenant generica.

### Idempotencia e concorrencia

40. retry idempotente de concessao;
41. retry idempotente de revogacao;
42. fingerprint divergente gera conflito;
43. grant x grant concorrente produz um unico active;
44. grant x Employment.end() concorrente nao gera conflito por si so;
45. revoke x Membership deactivate direta concorrente e deterministico;
46. Organization archive concorrente com grant/revoke e deterministico.

### Auditoria, privacidade e no-delete

47. auditoria de concessao;
48. auditoria de revogacao;
49. auditoria de conflito por ultimo owner;
50. falha de auditoria critica reverte concessao;
51. falha de auditoria critica reverte revogacao;
52. nenhuma exclusao fisica ocorre;
53. nenhum dado de sessao/token e persistido;
54. zero IA/score/ranking.

## 42. Fora do Escopo (reforco)

Reforcado explicitamente: autenticacao, senha, sessao, token, SSO, SCIM,
provisionamento externo, automacao de Offboarding chamando este dominio,
criacao automatica de entidades relacionadas, autosservico, IA, score,
ranking, contractor/freelancer, multiplos vinculos ativos simultaneos.

## 43. Revisao Destrutiva

Processo aplicado apos a redacao da v0.1, atacando o proprio documento nos
20 cenarios exigidos.

1. **Membership administrativa sem Employment:** sobrevive -- secao 20
   fecha isso como regra normativa explicita; zero AccessGrant necessario.
2. **Employment sem User:** sobrevive -- `AccessGrant` exige `Membership`
   existente; se nao ha `User`/`Membership`, simplesmente nao ha
   `AccessGrant` a criar. Nenhuma regra forca a existencia de um.
3. **OrganizationPerson sem User:** mesmo caso do item 2.
4. **Ultimo owner:** sobrevive -- secao 14, protecao herdada de RN-006,
   nunca bypassavel.
5. **Self-revoke:** sobrevive -- secao 15, nenhuma excecao criada alem da
   protecao ja herdada.
6. **Membership ja inactive:** sobrevive -- secao 13 passo 4 fecha o
   comportamento explicitamente, evitando evento redundante.
7. **Rehire:** sobrevive -- secao 17, cenario obrigatorio fechado ponto a
   ponto.
8. **Employment ended:** sobrevive -- secao 18, proveniencia desatualizada
   nunca e estado invalido.
9. **Offboarding completed:** sobrevive -- secao 19, zero interacao
   automatica preservada.
10. **Organization archived:** sobrevive -- secao 24, sem excecao de
    emergencia por falta de base normativa.
11. **Cross-tenant:** sobrevive -- secao 30, FKs tenant-safe em toda
    referencia.
12. **IDOR:** sobrevive -- secao 30/CA-023.
13. **Mass assignment:** sobrevive -- secao 31, allow-list explicita.
14. **grant x grant:** sobrevive -- secao 26, indice parcial unico
    resolve deterministicamente.
15. **grant x revoke:** sobrevive -- secao 26, resultado deterministico
    catalogado.
16. **revoke x revoke:** sobrevive -- secao 26, idempotencia + lock
    resolvem.
17. **Falha de auditoria:** sobrevive -- secao 28, rollback obrigatorio
    incluindo a mutacao delegada de Membership.
18. **Replay de idempotencia:** sobrevive -- secao 25, semantica identica
    ao padrao ja aprovado em tres SPECs anteriores.
19. **Historico pre-SPEC sem AccessGrant:** sobrevive -- secao 35,
    compatibilidade retroativa total, zero backfill, zero obrigatoriedade.
20. **Platform Admin:** sobrevive -- secao 23, zero mutacao funcional,
    leitura minimizada com motivo.

**Encontrado durante o ataque e corrigido antes desta versao:** o rascunho
inicial nao definia o que acontece quando `revoke` e chamado sobre um
`AccessGrant` cujo `Membership` ja esta `inactive` por outro caminho --
sem essa definicao, a implementacao futura poderia, por default ingenuo,
chamar `CoreService.updateMembership` de qualquer forma, gerando um evento
`membership.deactivated` espurio e potencialmente confuso na trilha de
auditoria de outro dominio. Corrigido explicitamente na secao 13, passo 4,
e coberto por CA-032/teste 17.

Nenhum outro problema normativo sobreviveu a revisao sem correcao
incorporada ao texto das secoes 1 a 42.

## 44. Conflitos Encontrados

Nenhum conflito normativo com ADR-0024, ADR-0025, SPEC-003, SPEC-004,
SPEC-025 ou SPEC-026. Todas as regras desta SPEC sao aditivas ou delegam
explicitamente a mecanismos ja existentes, nunca os reimplementam ou
contradizem.

**Nota de reconciliacao (2026-08-20, apos gate de concorrencia real da
Fase 28):** dois pressupostos tecnicos do texto original (nao decisoes de
produto) foram invalidados por teste real contra PostgreSQL e corrigidos
nas secoes 13 e 27 -- ver essas secoes para o texto reconciliado. Nenhuma
regra de negocio, RBAC, lifecycle ou fonte de verdade mudou; apenas a
descricao do mecanismo de lock. Registrado tambem como risco arquitetural
cross-domain, nao resolvido nesta reconciliacao (fora do escopo de uma
correcao documental): **mutacao funcional (`grant`/`revoke`) x
`Organization.archive` nao possui hoje nenhum lock global sobre a linha de
`organizations`** -- nenhum dominio pos-contratacao deste projeto trava
essa linha. O resultado permanece deterministico pela ordem efetiva de
commit (secao 26), nunca corrompido, mas nao e serializado por lock. Uma
solucao estrutural (se algum dia necessaria) exigiria revisao propria,
possivelmente cross-domain, tocando `CoreService`/`Organization` -- fora
do escopo desta SPEC e desta tarefa de reconciliacao.

## 45. Ambiguidades Restantes

Nao bloqueantes, deixadas para o plano tecnico ou para revisao normativa
futura especifica:

- nomes fisicos finais de tabela/colunas;
- mecanismo fisico exato de idempotencia (tabela propria vs.
  compartilhada);
- ordem fisica exata de lock (`FOR UPDATE` vs `FOR SHARE`, granularidade)
  -- fixada como implementacao atual, nunca contrato eterno (secao 27);
- ausencia de lock global sobre `Organization` durante mutacao funcional
  concorrente com `archive` -- risco arquitetural cross-domain registrado
  na secao 44, nao resolvido por esta SPEC;
- se e quando `OffboardingTask` podera referenciar `access_grant_id`
  (aditivo, opcional, decisao de SPEC-026 futura);
- integracao com autosservico, quando essa capacidade for definida;
- integracao com provedor de autenticacao real e invalidacao de
  sessao/token.

Nenhuma dessas ambiguidades foi resolvida por analogia.

## 46. Limitacoes Conhecidas

- Nao implementa codigo, migration, banco ou testes executaveis.
- Nao define UI final nem API final.
- Nao define modelo fisico completo (apenas conceitual, secao 36).
- Nao formaliza Fase numerada.
- Nao define autosservico, integracao com Offboarding, ou integracao com
  autenticacao real.

## 47. Definicao de Concluido

Para esta tarefa documental:

- fontes obrigatorias lidas integralmente (secao 3);
- problema arquitetural fechado sem redefinir autorizacao (secao 4);
- modelo conceitual, cardinalidade e elegibilidade fechados (secoes 5 a
  8);
- lifecycle minimo fechado e justificado (secao 11);
- concessao e revogacao atomica definidas ponto a ponto, com delegacao
  explicita a CoreService (secoes 12 a 14);
- recontratacao, Employment ended e Offboarding fechados sem automacao
  indevida (secoes 17 a 19);
- fonte de verdade fechada sem ambiguidade (secao 21);
- RBAC, Organization archived, idempotencia, concorrencia, atomicidade,
  auditoria, multiempresa, privacidade e zero IA definidos;
- criterios de aceite (64) e testes obrigatorios futuros (54) definidos;
- revisao destrutiva aplicada aos 20 cenarios exigidos, um problema
  encontrado e corrigido;
- nenhum conflito normativo restante;
- nenhum codigo, migration, banco ou teste executavel criado ou alterado;
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
