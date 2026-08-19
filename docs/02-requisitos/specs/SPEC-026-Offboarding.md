# SPEC-026 - Offboarding

**Status:** Aprovada
**Versao:** 1.0
**Fase:** 27
**Responsavel de negocio:** Thiago Sousa
**Dependencias:** ADR-0024 - Identidade e Vinculo Pos-Contratacao, SPEC-025 - OrganizationPerson e Employment, SPEC-016 - Onboarding (padrao operacional de checklist), SPEC-017 - Desenvolvimento e Retencao (padrao de aggregate root e cardinalidade "um nao final por Employment"), SPEC-003 - Membership, SPEC-004 - Roles & Permissions
**Ultima atualizacao:** 2026-08-18

**Nota de revisao destrutiva (v1.0):** este documento nasce em v0.1 e e
atacado na mesma tarefa (secao 36). Nenhuma secao normativa abaixo permanece
sem que a revisao destrutiva tenha sido aplicada a ela. As correcoes
encontradas ja estao incorporadas ao texto das secoes 1 a 35; a secao 36
registra o processo, os problemas encontrados e o motivo pelo qual cada um
foi fechado ou nao. Um unico ponto processual (Fase 27 fora do
`docs/00-visao/roadmap.md`) permanece registrado como conflito nao bloqueante
na secao 37.

## 1. Objetivo

Definir regras operacionais implementaveis para o dominio de **Offboarding**:
o encerramento operacional, humano e auditavel de um vinculo pos-contratacao,
apoiado em `Employment` como aggregate root externo, sem assumir revogacao
automatica de acesso, sem inteligencia artificial e sem invadir dominios
juridicos, trabalhistas, de folha ou de documentos.

Esta SPEC transforma em comportamento normativo: modelagem, momento de
criacao, lifecycle, tasks, relacao com `Employment`, fronteira de acesso a
`User`/`Membership`, privacidade, RBAC, idempotencia, concorrencia,
atomicidade, auditoria, multiempresa, historico, API conceitual, UI
conceitual, criterios de aceite e testes futuros.

## 2. Fora do Escopo

Esta SPEC nao define nem implementa:

- codigo, migration, alteracao de banco, rotas, servicos ou UI executavel;
- testes executaveis;
- alteracao de ADR-0024, SPEC-025, SPEC-016, SPEC-017, SPEC-003 ou SPEC-004;
- alteracao de BACKLOG ou roadmap;
- calculo trabalhista, rescisao juridica, aviso previo, verbas rescisorias;
- folha de pagamento e beneficios;
- documentos legais, admissionais ou rescisorios, upload, storage ou
  assinatura eletronica;
- revogacao automatica ou tecnica de `User` ou `Membership` nao normatizada
  por esta SPEC (secao 15 fecha o limite exato);
- provisionamento/desprovisionamento tecnico automatico de acessos externos
  (e-mail, SSO, sistemas terceiros);
- Performance Management, score ou ranking de qualquer natureza;
- sucessao, transferencia de conhecimento estruturada como processo formal
  separado;
- remuneracao, verba rescisoria, calculo de saldo, dados bancarios;
- autosservico da pessoa desligada;
- merge, split ou correcao estrutural de `OrganizationPerson`;
- criacao, ativacao, encerramento, cancelamento ou reabertura de `Employment`
  (autoridade permanece exclusiva da SPEC-025);
- alteracao de `OrganizationPerson`;
- Inteligencia Artificial de qualquer natureza (secao 20);
- template system para tasks (secao 10, justificativa explicita).

## 3. Fontes Obrigatorias e Evidencias

Lidas integralmente antes da redacao: `CONSTITUICAO_DO_PROJETO.md`, `AGENTS.md`,
ADR-0024, SPEC-025 v1.0, SPEC-016 v1.1, SPEC-017 v1.0, SPEC-003, SPEC-004,
`docs/01-produto/BACKLOG.md`, `docs/00-visao/roadmap.md`, migrations 0027
(Fase 24), 0028 (Fase 25) e 0029 (Fase 26), `src/server/employments/*` e
`src/server/onboardings/*` (evidencia do contrato fisico ja implementado).

Evidencias fisicas relevantes usadas como base normativa:

- `employments` possui `status IN ('pending','active','ended','cancelled')`,
  transicoes fisicas restritas a `pending->active`, `pending->cancelled`,
  `active->ended`, e indice parcial unico garantindo no maximo um
  `Employment` nao final por `OrganizationPerson`
  (`idx_employments_one_non_final`).
- `onboardings`/`onboarding_tasks` usam o padrao `status open/completed/
  cancelled` para tarefas, `assignee_membership_id` referenciando
  `memberships (organization_id, id)`, e trigger fisica impedindo update em
  estado final.
- `employment_idempotency_keys` e `onboarding_idempotency_keys` usam o mesmo
  padrao: `key_hash` (nunca a chave bruta), `request_fingerprint`, status
  `pending/completed/failed`, `UNIQUE (organization_id, operation, scope_id,
  key_hash)`.

Onde o codigo e a SPEC divergirem, o conflito e registrado na secao 37, nunca
normalizado silenciosamente.

## 4. Definicao do Problema

Offboarding resolve **um** problema: organizar, de forma humana, explicita e
auditavel, o processo operacional de saida de uma pessoa vinculada a uma
`Organization`, sem se confundir com dominios adjacentes.

Sete dominios sao deliberadamente separados e nunca misturados nesta SPEC:

1. **Encerramento do Employment** — pertence exclusivamente a SPEC-025
   (`active -> ended`, motivo, data efetiva). Offboarding le esse estado, mas
   nunca o cria, transiciona ou reescreve.
2. **Processo operacional de saida** — e o que esta SPEC define: um checklist
   humano (`Offboarding` + `OffboardingTask`) para organizar as atividades de
   saida (devolucao de equipamento, transferencia de conhecimento, entrevista
   de desligamento, confirmacao humana de revogacao de acesso).
3. **Acesso User/Membership** — fronteira critica, tratada isoladamente na
   secao 15. Offboarding nunca executa nem automatiza revogacao.
4. **Obrigacoes juridicas/trabalhistas** — fora de escopo total (secao 2).
5. **Folha/beneficios** — fora de escopo total (secao 2).
6. **Documentos** — fora de escopo total; nenhum upload, assinatura ou
   armazenamento de documento rescisorio (secao 2 e secao 18).
7. **Retencao historica** — Offboarding, como todo o dominio pos-contratacao,
   nunca e apagado fisicamente (secao 29); permanece consultavel mesmo apos
   recontratacao (secao 17).

Nenhuma operacao desta SPEC pode, sozinha ou combinada, produzir efeito em
mais de um desses sete dominios simultaneamente sem que a regra explicita
correspondente exista nesta SPEC.

## 5. Aggregate Root e Modelagem

`Employment` continua sendo o **aggregate root operacional externo** para o
dominio pos-contratacao, conforme ADR-0024 e SPEC-025 secao 3.2, que ja
antecipa Offboarding nominalmente como uma das capacidades futuras apoiadas
em `Employment`. Esta SPEC preserva integralmente essa autoridade: nenhuma
regra abaixo altera lifecycle, dados ou invariantes de `Employment`.

Dentro dessa moldura, `Offboarding` e um **aggregate proprio**, seguindo
exatamente o mesmo padrao ja aprovado pela SPEC-017 para `DevelopmentPlan`:
uma entidade com lifecycle, autoria e auditoria proprios, pertencente a um
`Employment`, nunca um checklist de campos soltos dentro da tabela
`employments`.

Razoes para nao transformar `Employment` em checklist:

- `Employment` e reutilizado por multiplos dominios futuros (SPEC-025 secao
  3.2); acoplar campos de offboarding a ele violaria a separacao de
  conceitos que a propria ADR-0024 exige;
- a trigger fisica `enforce_employment_update_rules` (migration 0027) ja
  imutabiliza campos de contexto de `Employment` e restringe suas transicoes
  a exatamente quatro; misturar um lifecycle de checklist ali quebraria essa
  garantia ja implementada;
- o padrao `DevelopmentPlan` (SPEC-017) ja provou que um aggregate proprio,
  pendurado em `Employment` por FK tenant-safe, e suficiente e nao exige
  nova ADR.

Modelo minimo:

- `Offboarding` — aggregate proprio, 1 por processo de saida;
- `OffboardingTask` — pertence a exatamente um `Offboarding`.

Nao criar nesta v1: `OffboardingTemplate` (secao 10.4 justifica), `Employee`/
`Collaborator`, tabela de eventos propria (auditoria cobre — secao 26).

## 6. Offboarding - Dados Minimos

| Campo | Obrigatorio | Observacao |
| --- | ---: | --- |
| `id` | Sim | Identificador interno. |
| `organization_id` | Sim | Organization proprietaria. |
| `employment_id` | Sim | `Employment` da mesma Organization. Diferente de `Onboarding.employment_id` (SPEC-016 v1.1, nullable por ser retrofit historico), aqui e `NOT NULL` desde a criacao porque `Offboarding` nasce depois de `Employment` existir e nao tem passivo historico a preservar. |
| `status` | Sim | `draft`, `in_progress`, `completed`, `cancelled`. |
| `exit_category` | Nao | Enum operacional minimizado (secao 19). Nunca texto livre. |
| `expected_last_day` | Nao | Data operacional esperada do ultimo dia, distinta de `Employment.end_date` (secao 22). |
| `created_by_user_id` | Sim | Ator que criou. |
| `started_at` / `started_by_user_id` | Nao | Transicao `draft -> in_progress`. |
| `completed_at` / `completed_by_user_id` | Nao | Transicao `in_progress -> completed`. |
| `cancelled_at` / `cancelled_by_user_id` / `cancellation_reason` | Nao | Transicao para `cancelled`; motivo obrigatorio quando presente. |
| `created_at` / `updated_at` | Sim | Timestamps tecnicos. |

`Offboarding` nunca contem: motivo textual livre de desligamento, dados
juridicos, dados bancarios, remuneracao, avaliacao de performance ou
conteudo de `Proposal`/`Dossie` (lista completa na secao 18).

## 7. OffboardingTask - Dados Minimos

Mesma forma conceitual ja aprovada para `OnboardingTask` (SPEC-016 secao 15),
reaproveitada por ser semanticamente valida (checklist humano executado por
`Membership` interna) e nao reinventada:

| Campo | Obrigatorio | Observacao |
| --- | ---: | --- |
| `id` | Sim | Identificador interno. |
| `organization_id` | Sim | Organization proprietaria. |
| `offboarding_id` | Sim | `Offboarding` pai. |
| `title` | Sim | Texto minimo operacional. |
| `description` | Nao | Texto minimizado. |
| `is_required` | Sim | Obrigatoria ou opcional. |
| `status` | Sim | `open`, `completed`, `cancelled`. |
| `assignee_membership_id` | Nao (obrigatorio para iniciar, secao 9) | Identifica **quem executa** a tarefa — nunca o alvo de uma revogacao de acesso (secao 15 fecha essa distincao). |
| `due_at` | Nao | Prazo operacional opcional. |
| `display_order` | Nao | Ordenacao operacional. |
| `creation_reason` | Nao | Obrigatorio quando tarefa ad hoc criada em `in_progress`. |
| `created_by_user_id` | Sim | Autoria. |
| `completed_at` / `completed_by_membership_id` / `completed_by_user_id` | Nao | Conclusao. |
| `cancelled_at` / `cancelled_by_user_id` / `cancellation_reason` | Nao | Cancelamento; motivo obrigatorio quando obrigatoria. |
| `created_at` / `updated_at` | Sim | Timestamps tecnicos. |

## 8. Momento de Criacao

Avaliadas quatro alternativas (item obrigatorio A a D):

- **A. Somente apos `Employment = ended`.** Rejeitada como condicao unica:
  bloquearia toda preparacao humana antes do ultimo dia (transferencia de
  conhecimento, agendamento de entrevista de desligamento), que e
  precisamente o valor operacional mais comum de um checklist de saida.
- **B. Enquanto `Employment = active`, como processo preparatorio.** Adotada
  como um dos dois momentos validos.
- **C. Criacao simultanea ao comando de encerramento.** Rejeitada: acoplaria
  transacionalmente dois aggregates distintos sem necessidade normativa, e
  contradiria a regra ja fixada pela SPEC-025 secao 14 ("encerramento...
  nao cria Offboarding automaticamente"). Simultaneidade *automatica* e, na
  pratica, uma forma de automacao indevida (secao 21).
- **D. Combinacao controlada.** Adotada, mas nao como "ambos os momentos
  livremente": a combinacao e exatamente `active` OU `ended`, nunca
  `pending` nem `cancelled`.

**Regra normativa fechada: Offboarding pode ser criado quando `Employment`
esta `active` ou `ended`. Nunca quando `pending` ou `cancelled`.**

Justificativa da inclusao de `ended`: a SPEC-025 (secao 16, preservada aqui
integralmente) estabelece que `Employment.end()` **nao** desativa `User`,
**nao** desativa `Membership` e **nao** remove acesso. Isso significa que,
estruturalmente, tarefas humanas de acompanhamento pos-encerramento (por
exemplo, confirmar que o acesso foi revogado por outro processo) so podem
existir se `Offboarding` puder continuar operavel *depois* de `ended`. Negar
esse momento tornaria impossivel documentar, na pratica, o trabalho que a
propria SPEC-025 deixou deliberadamente humano.

Exclusao de `pending`: um vinculo que nunca comecou operacionalmente nao tem
processo de saida a organizar.

Exclusao de `cancelled`: mesma razao ja usada pela SPEC-017 secao 21 para
`Employment cancelled` — o vinculo nunca chegou a existir operacionalmente,
logo nunca existiu algo do qual sair.

Consequencia estrutural (nao precisa de regra adicional): como a SPEC-025
proibe a transicao `active -> cancelled` (secao 8 da SPEC-025), uma vez que
um `Offboarding` existe (o que exige `Employment` `active` ou `ended`), o
`Employment` associado **jamais** podera se tornar `cancelled` depois. O
unico destino possivel a partir dali e `ended`. Isso elimina, por
construcao, toda uma classe de estados impossiveis sem exigir validacao
redundante.

Criacao e sempre ato explicito de owner/admin (secao 12). Nunca automatica
(secao 21).

## 9. Lifecycle de Offboarding

Estados canonicos: `draft`, `in_progress`, `completed`, `cancelled`.

Avaliada a copia automatica do lifecycle de Onboarding e rejeitada como
justificativa por si so; os mesmos quatro estados sao mantidos porque
resolvem, aqui, exatamente o mesmo problema estrutural ja resolvido pela
SPEC-016: `pending`/`ready` nao tinham diferenca deterministica observavel
(SPEC-016 secao 7) e essa mesma ausencia de gatilho objetivo se aplica a
Offboarding. Reutilizar uma solucao ja comprovada para o mesmo problema
estrutural nao e copia cega — e reuso justificado.

| Estado | Entrada | Saida | Transicoes validas | Transicoes proibidas | Final/Imutavel |
| --- | --- | --- | --- | --- | --- |
| `draft` | Criacao explicita por owner/admin (secao 8). | `in_progress` ou `cancelled`. | `draft -> in_progress`, `draft -> cancelled`. | `draft -> completed` direto. | Nao. |
| `in_progress` | Ato explicito de owner/admin a partir de `draft`. | `completed` ou `cancelled`. | `in_progress -> completed`, `in_progress -> cancelled`. | `in_progress -> draft`. | Nao. |
| `completed` | Todas as tasks obrigatorias elegiveis `completed` + confirmacao humana (secao 12). | Nenhuma. | Nenhuma. | Qualquer transicao de saida. | Sim; imutavel. |
| `cancelled` | Ato explicito de owner/admin com motivo, a partir de `draft` ou `in_progress`. | Nenhuma. | Nenhuma. | Qualquer transicao de saida. | Sim; imutavel. |

Comportamento se `Employment` ja estiver `ended` no momento da transicao:
**nenhum**, deliberadamente. Como `ended` e um dos dois estados elegiveis
para toda a operacao funcional (secao 8), nenhuma transicao de
`Offboarding` e bloqueada, acelerada ou modificada pelo fato de `Employment`
estar `ended`. Isso e uma divergencia explicita e justificada do padrao
`DevelopmentPlan` (SPEC-017 secao 20), que fecha planos nao finais quando
`Employment` termina: `DevelopmentPlan` so opera com `Employment active`
(SPEC-017 secao 4), entao `ended` sempre bloqueia; `Offboarding` foi
desenhado para operar tambem em `ended` (secao 8), entao nao ha nada para
"fechar por encerramento" — o encerramento e um estado normal de operacao,
nao uma interrupcao.

Transicoes fora desta matriz sao proibidas.

## 10. Estados e Regras de Tasks

Estados canonicos de `OffboardingTask`: `open`, `completed`, `cancelled`.
`in_progress` e omitido pelo mesmo motivo ja fixado pela SPEC-016 secao 9:
nao ha gatilho objetivo e observavel que diferencie uma tarefa "em
andamento" de uma tarefa aberta.

### 10.1 Regras gerais

- tarefa pode existir sem `assignee_membership_id` apenas em `Offboarding
  draft`;
- para transicionar `draft -> in_progress`, toda tarefa obrigatoria deve ter
  `assignee_membership_id` valido (Membership ativa da mesma Organization);
- tarefa opcional nunca bloqueia conclusao;
- tarefa cancelada nunca conta como concluida;
- tarefa obrigatoria cancelada exige motivo e sai do denominador de
  progresso (secao 11);
- tarefas `completed` e `cancelled` nao reabrem nesta v1;
- tarefa nunca armazena documento, anexo, dado bancario ou dado admissional
  sensivel (secao 18).

### 10.2 Tarefas ad hoc

Owner/admin podem adicionar tarefas em `draft` ou `in_progress`, nunca em
`completed` ou `cancelled` (freeze do parent). Tarefa ad hoc em
`in_progress` exige autoria e `creation_reason`.

### 10.3 Autoria administrativa e Membership inativa

Responsavel e sempre uma `Membership` ativa da mesma Organization — nunca
apenas `User`, pelo mesmo motivo ja fixado pela SPEC-016 secao 15
(Organization, role e status preservados). Se a `Membership` de um
`assignee` for inativada depois:

- a tarefa preserva o historico de atribuicao;
- a tarefa aberta fica bloqueada para conclusao pelo responsavel antigo;
- owner/admin devem reatribuir a uma `Membership` ativa da mesma
  Organization ou cancelar a tarefa com motivo;
- autoria historica nunca e apagada;
- tarefa ja concluida permanece concluida mesmo que a Membership do autor
  seja inativada depois.

### 10.4 Sem template system

Nao existe `OffboardingTemplate` nesta v1. Diferente de Onboarding (SPEC-016
secao 12, onde templates sao opcionais), nenhuma fonte obrigatoria desta
tarefa demonstra necessidade normativa de um catalogo reutilizavel de
templates de saida. Tasks sao sempre criadas manualmente por owner/admin.
Se uma necessidade real de template surgir, exige revisao normativa propria
com justificativa de produto, nao inferencia por analogia.

## 11. Progresso

```text
progresso = tasks obrigatorias completed / tasks obrigatorias elegiveis
```

Tasks opcionais nunca entram na formula. Tasks obrigatorias canceladas com
motivo deixam de ser elegiveis. Se nao houver task obrigatoria elegivel, o
progresso exibido e `0%` ate owner/admin concluir manualmente ou ajustar o
checklist. Progresso nunca e score, risco, avaliacao ou qualquer forma de
julgamento sobre a pessoa que esta saindo — e puramente operacional sobre o
checklist.

## 12. Conclusao do Offboarding

Conclusao exige combinacao de criterio objetivo e ato humano, mesmo padrao
ja aprovado pela SPEC-016 secao 10:

1. todas as tasks obrigatorias elegiveis estao `completed`;
2. tasks obrigatorias canceladas possuem motivo;
3. nao ha task obrigatoria aberta;
4. owner/admin confirma manualmente a conclusao.

`Offboarding` nunca e concluido apenas por percentual. Member nao conclui o
`Offboarding`. Conclusao **nunca** implica, cria ou infere qualquer mudanca
em `Employment`, `User` ou `Membership` (secao 15).

## 13. Cancelamento

Ator permitido: owner, admin. Motivo obrigatorio. Regras:

- nao executa hard delete;
- tasks abertas permanecem no historico e deixam de ser operaveis;
- cancelamento nao altera `Employment`, `OrganizationPerson`, `User` ou
  `Membership`;
- apos `cancelled`, um novo `Offboarding` **pode** ser criado para o mesmo
  `Employment` (diferente da regra de Onboarding/CandidateApplication,
  justificado na secao 14.1), desde que `Employment` continue elegivel
  (`active` ou `ended`) e nao exista outro `Offboarding` nao final para o
  mesmo `Employment`.

## 14. Relacao com Employment

### 14.1 Cardinalidade

```text
Employment 1:N Offboarding (historico)
```

Regra de v1: no maximo **um** `Offboarding` nao final (`draft` ou
`in_progress`) por `Employment`. Reuso deliberado do padrao ja aprovado para
`DevelopmentPlan` (SPEC-017 secao 6: "no maximo um DevelopmentPlan nao final
por Employment... regra da v1, nao decisao irreversivel"), preferido em
lugar da regra mais restritiva de Onboarding (que bloqueia recriacao mesmo
apos `cancelled` — SPEC-016 RN-016), porque a restricao de Onboarding esta
amarrada a uma `CandidateApplication` que e um evento de recrutamento
irrepetivel, enquanto `Offboarding` esta amarrado a um `Employment` que e um
vinculo continuo onde corrigir um processo de saida criado por engano (e
recriar o correto) e um cenario operacional legitimo.

Um novo `Offboarding` so pode ser criado para o mesmo `Employment` depois
que o anterior atingir `completed` ou `cancelled`.

### 14.2 Estados de Employment

| Estado de Employment | Permite criar novo Offboarding | Permite operar Offboarding ja existente |
| --- | --- | --- |
| `pending` | Nao | N/A (Offboarding nunca existe nesse estado por construcao, secao 8) |
| `active` | Sim | Sim, integralmente |
| `ended` | Sim | Sim, integralmente (secao 9) |
| `cancelled` | Nao | N/A (Offboarding nunca existe nesse estado, secao 8) |

### 14.3 Proibicoes estruturais

- `Offboarding` **nunca** reabre `Employment`;
- `Offboarding` **nunca** transiciona `Employment` (criacao, ativacao,
  cancelamento e encerramento continuam exclusivos da SPEC-025);
- `Offboarding` **nunca** altera `OrganizationPerson`;
- `Offboarding` **nunca** altera `Candidate`, `CandidateApplication` ou
  `Proposal`.

### 14.4 Recontratacao

Cenario obrigatorio:

```text
OrganizationPerson
  Employment 1 -> ended
  Offboarding 1 (para Employment 1)
  Employment 2 -> active (novo, criado pela SPEC-025)
```

`Offboarding 1` nunca:

- bloqueia a criacao ou ativacao de `Employment 2` (nenhuma validacao desta
  SPEC consulta `Offboarding` para permitir operacoes de `Employment`);
- altera `Employment 2`;
- tem suas tasks reaproveitadas em `Employment 2` — um eventual `Offboarding
  2` para `Employment 2`, se e quando existir, e uma instancia
  completamente nova, sem herdar tasks, template ou estado de `Offboarding
  1`;
- altera acesso associado a `Employment 2` por inferencia — nenhuma
  inferencia de acesso existe nesta SPEC em nenhum cenario (secao 15).

Estruturalmente, `Employment 1` e `Employment 2` sao linhas independentes;
`Offboarding` referencia `employment_id` diretamente, entao a independencia
e garantida por design, sem necessidade de regra de bloqueio adicional.

## 15. Fronteira de Acesso - User e Membership

Esta e a secao normativa mais critica da SPEC.

Regra herdada e reafirmada, nunca enfraquecida: `Employment.end()` **nao**
desativa `User`, **nao** desativa `Membership` e **nao** remove acesso
(SPEC-025 secao 14, CA-053 a CA-056). Nada nesta SPEC altera essa regra.

Avaliadas quatro alternativas (item obrigatorio A a D):

- **A. Offboarding NAO gerencia acesso de forma alguma.** Rejeitada como
  extremo demais: tornaria o checklist inutil para o proposito real de
  organizar a saida, que inclui necessariamente rastrear que alguem revogou
  o acesso.
- **B. Offboarding registra somente tarefas humanas de revogacao.**
  Adotada.
- **C. Offboarding cria comandos explicitos de acesso** (por exemplo, um
  botao que desativa `Membership` diretamente a partir do checklist).
  Rejeitada nesta v1: nenhuma fonte obrigatoria (ADR-0024, SPEC-025,
  SPEC-003) autoriza um mecanismo de revogacao dessa natureza. ADR-0024
  exige explicitamente que qualquer associacao entre vinculo pos-contratacao
  e acesso seja "explicita, auditavel e revogavel" e tratada como decisao
  propria — nao ha decisao propria registrada para revogacao ativada por
  Offboarding.
- **D. Exige SPEC/ADR separada para Access Lifecycle.** Parcialmente
  adotada: a v1 nao implementa C, e uma futura automacao real de revogacao
  fica explicitamente fora desta v1 e exige SPEC/ADR normativa propria antes
  de qualquer implementacao.

**Regra normativa fechada (B, com D como fronteira explicita para o
futuro):**

- `OffboardingTask` pode conter, como conteudo textual minimizado de
  `title`/`description`, itens como "confirmar revogacao de acesso ao
  sistema X" ou "desativar Membership da pessoa";
- `assignee_membership_id` em `OffboardingTask` identifica **quem executa**
  a tarefa (por exemplo, o admin de TI responsavel) — nunca o alvo de uma
  revogacao. Nao existe campo estrutural equivalente a
  `target_user_id`/`target_membership_id` nesta v1;
- concluir uma `OffboardingTask` de revogacao **nunca**, por si so, executa,
  dispara ou automatiza qualquer mutacao em `User` ou `Membership`. A
  conclusao da tarefa e apenas o registro humano de que a acao foi feita em
  outro lugar (por exemplo, na tela de administracao de Membership da
  SPEC-003), por outro ato explicito e proprio daquele dominio;
- `Offboarding completed` **nunca** desativa `User` nem `Membership`;
- `Employment ended` continua **nunca** desativando `User` nem `Membership`
  (regra ja existente, reforcada aqui);
- qualquer automacao futura que conecte `Offboarding` a uma mutacao real de
  `User`/`Membership` fica **fora do escopo desta v1** e exige uma SPEC ou
  ADR normativa propria, explicita, auditavel e revogavel, consistente com
  o texto ja existente em ADR-0024, secao "User e Membership".

Esta e a "preferencia conservadora" explicitamente pedida: nao inventar
mecanismo de revogacao que as fontes atuais nao sustentam.

## 16. Organization Archived

Quando a `Organization` estiver `archived`:

- bloquear criacao de `Offboarding`;
- bloquear inicio (`draft -> in_progress`);
- bloquear adicionar, atribuir, concluir ou cancelar task como operacao
  funcional;
- bloquear conclusao de `Offboarding`;
- bloquear cancelamento funcional de `Offboarding`;
- leitura historica por canais autorizados permanece possivel;
- Platform Admin permanece restrito a leitura administrativa minimizada, com
  motivo e auditoria (`offboarding.administrative_read`).

Nenhum comportamento diferente das fases anteriores foi assumido; esta
secao reaplica integralmente o padrao ja fixado por SPEC-025 secao 19,
SPEC-016 secao 23 e SPEC-017 secao 19.

## 17. RBAC

| Acao | owner | admin | member | Platform Admin |
| --- | :---: | :---: | :---: | :---: |
| Criar Offboarding | Sim | Sim | Nao | Nao |
| Iniciar Offboarding | Sim | Sim | Nao | Nao |
| Consultar Offboarding completo | Sim | Sim | Nao | Nao funcional |
| Consultar task atribuida | Sim | Sim | Sim | Nao funcional |
| Adicionar task | Sim | Sim | Nao | Nao |
| Atribuir/reatribuir responsavel | Sim | Sim | Nao | Nao |
| Concluir task propria (atribuida a sua Membership) | Sim | Sim | Sim | Nao |
| Concluir task alheia | Sim | Sim | Nao | Nao |
| Cancelar task | Sim | Sim | Nao | Nao |
| Concluir Offboarding | Sim | Sim | Nao | Nao |
| Cancelar Offboarding | Sim | Sim | Nao | Nao |
| Leitura administrativa | Nao | Nao | Nao | Sim, com motivo |

Fechamento explicito da fronteira de `member`: a **unica** relacao que
concede qualquer autorizacao a `member` e ser exatamente a `Membership`
referenciada em `assignee_membership_id` de uma task `open`. Nenhuma outra
relacao (ser a pessoa que esta saindo, ser gestor informal, pertencer a
mesma area) concede autorizacao nesta v1. Essa e a mesma relacao ja
normatizada e implementada para Onboarding (SPEC-016 RN-020, CA-026,
CA-029), reaproveitada aqui por resolver exatamente o mesmo problema:
Membership ativa da mesma Organization, atribuida aquela task especifica.

Nao ha base normativa nas fontes atuais para nenhuma autorizacao adicional
de `member` (por exemplo, sobre criacao de `Offboarding` ou conclusao do
processo inteiro); a v1 fica, portanto, limitada exatamente ao que a tabela
acima descreve, sem ampliar por analogia.

Platform Admin nunca opera funcionalmente. Leitura administrativa exige
motivo obrigatorio e gera auditoria.

## 18. Privacidade e Lista Positiva

Lista positiva do nucleo:

`Offboarding` pode conter:

- identificadores internos (`id`, `organization_id`, `employment_id`);
- `status`;
- `exit_category`, opcional, enum minimizado (secao 19);
- `expected_last_day`, opcional;
- autoria e timestamps;
- `cancellation_reason`, minimizado, obrigatorio somente ao cancelar.

`OffboardingTask` pode conter:

- identificadores internos;
- `title`, `description` minimizados;
- `is_required`, `status`, `due_at`, `display_order`;
- `assignee_membership_id`;
- `creation_reason`, `cancellation_reason`, minimizados;
- autoria e timestamps.

Proibido em ambas as tabelas, salvo decisao normativa explicita futura:

- CPF/RG;
- documentos pessoais, admissionais ou rescisorios;
- dados bancarios;
- dados de saude;
- dependentes;
- remuneracao ou verba rescisoria;
- motivos medicos ou diagnostico;
- notas livres irrestritas (todo campo textual tem finalidade e limite,
  mesmo padrao ja exigido pela SPEC-017 secao 16);
- conteudo juridico integral (contrato, aviso previo, termo de rescisao);
- avaliacoes de performance;
- conteudo de `Proposal`, `Dossie` ou respostas de entrevista.

## 19. Motivo de Desligamento

Avaliadas as opcoes do item obrigatorio: categoria operacional, motivo
textual, referencia externa, nenhum motivo.

**Regra fechada:** `Offboarding.exit_category` e um enum operacional
opcional e minimizado, usado apenas para roteamento/relatorio operacional,
nunca para decisao automatica (secao 21) nem para inferencia de risco
(secao 20):

- `voluntary_resignation`;
- `involuntary_termination`;
- `end_of_contract`;
- `mutual_agreement`;
- `other_minimized`.

`Offboarding` **nunca** duplica o motivo textual livre. `Employment` ja
possui `end_reason` (texto minimizado ate 1000 caracteres, obrigatorio ao
encerrar — SPEC-025 secao 6, CHECK fisico em migration 0027). Esse continua
sendo o unico deposito canonico de motivo textual do encerramento.
Duplicar esse texto em `Offboarding` criaria um segundo deposito sensivel
sem finalidade normativa distinta, violando o principio de minimizacao ja
aplicado por ADR-0024 e SPEC-025 secao 18.

Se a interface precisar exibir `Employment.end_reason` no contexto de um
`Offboarding`, a leitura e feita diretamente em `Employment`, **respeitando
integralmente a RBAC ja definida pela SPEC-025 secao 20** (owner/admin veem
o historico completo; `member` nao). `Offboarding` nunca amplia o acesso a
dados de `Employment` alem do que a SPEC-025 ja autoriza.

`cancellation_reason` (de `Offboarding` ou de uma `OffboardingTask`) e um
motivo operacional distinto — sobre por que o *checklist* foi cancelado, nao
sobre por que a pessoa saiu — e permanece minimizado (limite de tamanho,
finalidade, autoria, auditoria).

## 20. Zero IA

Proibido, sem excecao, nesta SPEC:

- flight risk;
- termination score;
- performance score;
- ranking de qualquer natureza;
- recomendacao automatica de desligamento;
- inferencia automatica de motivo de saida;
- geracao automatica de decisao;
- analise automatica de "risco da pessoa";
- zero `AIGateway`;
- zero `AI Execution`;
- zero prompt, provider ou modelo;
- zero sumarizacao automatica de tasks ou de motivo.

`Offboarding` nunca decide quem deve ser desligado. `Offboarding` nunca
avalia a pessoa que esta saindo. Textos vindos de qualquer origem
permanecem dados, nunca instrucoes (Constituicao, secao "Inteligencia
artificial no produto").

## 21. Zero Automacao Indevida

Separacao obrigatoria entre automacao tecnica segura e decisao humana.

Nunca permitido:

- `Employment` encerrado automaticamente por score, IA ou qualquer sinal
  automatico (autoridade permanece exclusiva da SPEC-025, ja fechada);
- `User` desativado automaticamente por `Offboarding`, sem regra propria
  (secao 15);
- `Membership` desativada automaticamente por `Offboarding`, sem regra
  propria (secao 15);
- geracao automatica de `Offboarding` por IA;
- **`Offboarding` criado automaticamente por `Employment.end()`.** Reforco
  explicito da regra ja fixada por SPEC-025 secao 14 ("nao cria Offboarding
  automaticamente"): esta SPEC nao cria excecao a essa regra. A criacao
  permanece sempre ato explicito de owner/admin (secao 8), mesmo quando
  `Employment` ja esta `ended` no momento da criacao;
- `Offboarding completed` desativando `User` ou `Membership` automaticamente
  (secao 15);
- `exit_category` disparando selecao automatica de tasks (nao ha template
  system, secao 10.4).

Criacao, inicio, adicao de task, atribuicao, conclusao de task, cancelamento
de task, conclusao e cancelamento de `Offboarding` sao sempre atos
explicitos e auditados.

## 22. Datas e Invariantes

- `expected_last_day` (em `Offboarding`) e operacional e distinta de
  `Employment.end_date` (data efetiva de negocio) e de
  `Employment.ended_at` (timestamp da transicao). Divergencia entre as duas
  e esperada na pratica (por exemplo, o ultimo dia esperado muda durante a
  negociacao) e nao bloqueia nenhuma operacao desta SPEC, mesmo padrao ja
  adotado pela SPEC-016 v1.1 secao 57 para `expected_person_start_date` vs
  `effective_start_date`;
- `started_at` obrigatorio em `in_progress`;
- `completed_at` e `completed_by_user_id` obrigatorios em `completed`;
- `cancelled_at`, `cancelled_by_user_id` e `cancellation_reason`
  obrigatorios em `cancelled`;
- `created_at`/`updated_at` sao timestamps tecnicos, nunca confundidos com
  datas de negocio.

## 23. Idempotencia

Operacoes mutaveis exigem `Idempotency-Key` (mesmo padrao ja aplicado por
`employment_idempotency_keys` e `onboarding_idempotency_keys`, nunca
armazenando a chave bruta — apenas `key_hash`):

- criar `Offboarding`;
- iniciar `Offboarding`;
- adicionar task;
- atribuir/reatribuir responsavel;
- concluir task;
- cancelar task;
- concluir `Offboarding`;
- cancelar `Offboarding`.

Semantica obrigatoria, identica ao padrao ja aprovado (SPEC-025 secao 21,
SPEC-016 secao 32, SPEC-017 secao 25):

- chave + fingerprint iguais em `completed` retornam o mesmo resultado;
- chave igual + fingerprint diferente retorna conflito seguro;
- operacao `pending` nunca duplica efeito;
- `failed` permite retry conforme categoria de falha;
- crash recovery deve permitir reconhecer se a operacao confirmou antes da
  falha;
- resultado idempotente nunca pula validacoes de Organization, permissao,
  status de `Employment`/`Offboarding` ou proveniencia;
- falha de auditoria critica causa rollback e nunca e registrada como
  sucesso idempotente.

## 24. Concorrencia

Resultados deterministicos obrigatorios:

- **create x create** (dois `Offboarding` para o mesmo `Employment`): a
  primeira transacao confirmada cria; a segunda recebe conflito seguro se
  ja existir um nao final, ou retorno idempotente se for retry;
- **start x cancel**: primeira transacao confirmada vence; a outra recebe
  conflito seguro;
- **complete task x reassign**: revalidar status da task e do
  `assignee_membership_id` dentro da mesma transacao antes de confirmar;
- **complete task x cancel parent**: se o `Offboarding` cancelar primeiro, a
  conclusao de task subsequente falha (parent final); se a task concluir
  primeiro, o cancelamento do `Offboarding` prossegue normalmente;
- **complete Offboarding x add required task**: conclusao revalida, na
  mesma transacao, que nao ha task obrigatoria aberta apos a adicao; se a
  adicao confirmar primeiro, a conclusao deve falhar ou revalidar antes de
  confirmar;
- **Employment.end x create Offboarding**: criacao revalida o estado atual
  de `Employment` dentro da transacao; `active` e `ended` sao ambos
  elegiveis (secao 8), entao esse cenario **nao produz conflito por si so**
  — apenas `pending`/`cancelled` concorrentes bloqueiam;
- **rehire x complete old Offboarding**: estruturalmente independentes
  (`employment_id` distintos), nenhuma trava cruzada e necessaria (secao
  14.4);
- **Membership inactive x task complete**: se a inativacao confirmar
  primeiro, a conclusao pelo responsavel antigo falha (secao 10.3); se a
  conclusao confirmar primeiro, ela permanece valida e a inativacao
  subsequente nao a desfaz;
- **Organization archive x mutation**: mutacao revalida Organization ativa
  dentro da transacao; se o arquivamento confirmar primeiro, a mutacao
  falha;
- **double complete** (mesma task ou mesmo Offboarding): retry idempotente
  identico retorna o mesmo resultado; operacao distinta recebe conflito
  seguro.

## 25. Atomicidade

Devem ser atomicamente consistentes:

- criacao de `Offboarding` + auditoria critica;
- inicio (`draft -> in_progress`) + revalidacao de tasks obrigatorias +
  auditoria;
- adicionar task + auditoria;
- atribuir/reatribuir + auditoria;
- concluir/cancelar task + auditoria;
- conclusao de `Offboarding` + revalidacao de tasks obrigatorias +
  auditoria;
- cancelamento de `Offboarding` + auditoria.

Falha de auditoria critica causa rollback da operacao correspondente — nunca
e registrada como sucesso.

## 26. Auditoria

Eventos minimos:

- `offboarding.created`;
- `offboarding.started`;
- `offboarding.task_added`;
- `offboarding.task_assigned`;
- `offboarding.task_completed`;
- `offboarding.task_cancelled`;
- `offboarding.completed`;
- `offboarding.cancelled`;
- `offboarding.administrative_read`;
- `offboarding.permission_denied`;
- `offboarding.cross_organization_access_denied`;
- `offboarding.idempotency_conflict`;
- `offboarding.concurrent_operation_conflict`.

Auditoria nunca registra PII integral, conteudo textual completo de
`title`/`description`, `exit_category` com contexto adicional identificavel
alem do necessario, motivo de origem de `Employment`, token, header ou
segredo. Apenas identificadores internos, tipo de evento, ator, Organization,
timestamp e resultado, consistente com o padrao ja aplicado por SPEC-025
secao 25 e SPEC-016 secao 34.

## 27. Multiempresa

- `organization_id` obrigatorio em `Offboarding` e `OffboardingTask`;
- `organization_id` derivado do contexto autorizado no servidor, nunca do
  cliente;
- FK tenant-safe: `(organization_id, employment_id)` referencia
  `employments (organization_id, id)`;
- `OffboardingTask.assignee_membership_id` deve pertencer a mesma
  Organization e estar ativa;
- bloquear `Employment` de outra Organization;
- bloquear `OffboardingTask` de outro `Offboarding`;
- bloquear IDOR de `Offboarding` e de `OffboardingTask` por ID manipulado;
- mensagens de erro para acesso cruzado devem ser genericas e nao revelar
  existencia do registro.

## 28. Mass Assignment

Inputs nunca podem definir diretamente:

- `organization_id`;
- `employment_id` sem validacao de acesso e tenant;
- `status`;
- timestamps;
- autores (`created_by_user_id`, `completed_by_user_id`,
  `cancelled_by_user_id`, `completed_by_membership_id`);
- metadata de auditoria ou de Platform Admin.

Toda operacao usa allow-list explicita de campos.

## 29. Historico e Imutabilidade

- sem hard delete no fluxo normal;
- `organization_id` e `employment_id` de `Offboarding` sao imutaveis apos
  criacao;
- `Offboarding completed` e `Offboarding cancelled` sao imutaveis para
  operacoes de negocio;
- `OffboardingTask completed` e `cancelled` sao imutaveis;
- lifecycle nao reabre;
- historico permanece preservado apos recontratacao (secao 14.4), mesmo
  quando um novo `Employment` e criado para a mesma `OrganizationPerson`;
- leitura historica permanece possivel conforme permissao (secao 17), mesmo
  em Organization arquivada (secao 16).

## 30. Banco de Dados Conceitual

Modelo minimo futuro:

- `offboardings`;
- `offboarding_tasks`;
- `offboarding_idempotency_keys`, se nao houver mecanismo compartilhado
  adequado.

Restricoes conceituais esperadas, seguindo exatamente o padrao ja
implementado fisicamente para `employments`/`onboarding_tasks`:

- `organization_id` obrigatorio nas tres tabelas;
- FK composta tenant-safe `(organization_id, employment_id)` referenciando
  `employments (organization_id, id)`, `NOT NULL`;
- FK composta tenant-safe `(organization_id, offboarding_id)` em
  `offboarding_tasks` referenciando `offboardings (organization_id, id)`;
- FK composta tenant-safe `(organization_id, assignee_membership_id)`
  referenciando `memberships (organization_id, id)`;
- indice parcial unico `(organization_id, employment_id) WHERE status IN
  ('draft', 'in_progress')` para impor no maximo um `Offboarding` nao final
  por `Employment` (mesmo padrao de `idx_employments_one_non_final`);
- CHECK de status em ambas as tabelas;
- CHECKs de datas (mesmo padrao de `employments_status_lifecycle_check`);
- trigger impedindo DELETE fisico (mesmo padrao de
  `prevent_employment_delete`);
- trigger impedindo UPDATE em estado final (mesmo padrao de
  `enforce_onboarding_update_rules`);
- indices por Organization, `employment_id`, status e `assignee_membership_id`;
- nenhuma coluna para score, ranking, performance rating ou IA;
- compatibilidade futura com PostgreSQL/Supabase.

## 31. API Conceitual

| Operacao | Finalidade |
| --- | --- |
| Criar Offboarding | Criar processo `draft` para Employment `active`/`ended`. |
| Iniciar Offboarding | `draft -> in_progress`. |
| Consultar Offboarding | Obter processo permitido, status e tasks. |
| Listar tasks | Listar tasks do Offboarding. |
| Adicionar task | Criar task em `draft`/`in_progress`. |
| Atribuir/reatribuir | Definir `assignee_membership_id`. |
| Concluir task | `open -> completed`. |
| Cancelar task | `open -> cancelled`, com motivo. |
| Concluir Offboarding | `in_progress -> completed`. |
| Cancelar Offboarding | `draft`/`in_progress -> cancelled`, com motivo. |
| Leitura administrativa | Platform Admin com motivo e DTO minimizado. |

Todas as operacoes validam no servidor: Organization, User, Membership,
role, status da Organization, pertencimento de todos os IDs, estado de
`Employment`, lifecycle atual, idempotencia, concorrencia e mass assignment.

Somente as operacoes acima, realmente sustentadas pelo modelo desta v1, sao
incluidas. Nenhuma operacao de acesso (revogar Membership, desativar User) e
exposta por esta API (secao 15).

## 32. UI Conceitual

Interface interna futura deve mostrar, para owner/admin:

- processo de saida, status, `exit_category`, `expected_last_day`;
- tasks, responsaveis, prazos, progresso operacional;
- historico de transicoes;
- estado do `Employment` associado (respeitando a RBAC da SPEC-025 — secao
  19 desta SPEC).

Para `member`: apenas a task atribuida a sua propria Membership, em DTO
minimo, sem contexto sensivel adicional (motivo de saida, outras tasks,
outros dados de `Employment`).

**Nao existe autosservico da pessoa desligada nesta v1.** Decisao explicita,
nao omissao: a pessoa cujo `Employment` esta sendo encerrado nunca acessa
`Offboarding` diretamente, pelo mesmo motivo ja valido para Onboarding
(SPEC-016 secao 17/18) e reforcado aqui por um risco adicional — o acesso da
pessoa que esta saindo tem perfil de risco diferente do de quem esta
entrando (secao 33). Qualquer autosservico futuro exige SPEC propria.

Nao misturar dados completos de recrutamento, proposta, folha, performance
ou documentos juridicos na mesma superficie.

## 33. Relacao com Onboarding

Onboarding (SPEC-016) e usado como referencia de padrao operacional onde
util (forma de checklist, tarefas, responsavel via Membership), mas as
diferencas sao explicitas e nao triviais:

| Aspecto | Onboarding | Offboarding |
| --- | --- | --- |
| Direcao | Entrada da pessoa na Organization. | Saida da pessoa da Organization. |
| Aggregate root de origem | `CandidateApplication hired` (Candidate como ponte transitoria); `Employment` chegou depois, como referencia opcional tardia (v1.1). | `Employment` como aggregate root desde a criacao — `employment_id` `NOT NULL` desde o inicio. |
| Momento de criacao | Somente apos `hired`. | `Employment active` ou `ended` (secao 8) — dois momentos, nao um. |
| Cardinalidade apos cancelamento | Bloqueia recriacao mesmo apos `cancelled` (RN-016). | Permite recriacao apos `completed`/`cancelled` (secao 14.1), como `DevelopmentPlan`. |
| Risco de acesso | A pessoa esta *ganhando* acesso; risco esta em conceder cedo demais. | A pessoa pode *ja ter* acesso, e o risco esta em nao revoga-lo a tempo — por isso a fronteira da secao 15 e mais conservadora, nao mais permissiva. |
| Recontratacao | Nao se aplica diretamente (Onboarding pertence a uma CandidateApplication unica). | Cenario central e obrigatorio (secao 14.4): Offboarding antigo nunca interfere no novo Employment. |
| Sensibilidade do historico | Historico de entrada. | Historico de saida — frequentemente mais sensivel (motivo de desligamento, mesmo minimizado), tratado com `exit_category` restrito em vez de texto livre (secao 19), mais restritivo que qualquer campo textual de Onboarding. |
| Templates | Opcionais (SPEC-016 secao 12). | Inexistentes nesta v1 (secao 10.4), por ausencia de necessidade normativa demonstrada. |

## 34. Criterios de Aceite

### Modelagem e aggregate root

- CA-001: `Employment` permanece aggregate root operacional externo; esta
  SPEC nao altera seu lifecycle.
- CA-002: `Offboarding` e aggregate proprio, nao um checklist de campos em
  `employments`.
- CA-003: `Offboarding` nunca transiciona, cria, ativa, encerra ou cancela
  `Employment`.
- CA-004: `Offboarding` nunca altera `OrganizationPerson`.
- CA-005: `Offboarding` nunca altera `Candidate`, `CandidateApplication` ou
  `Proposal`.

### Momento de criacao

- CA-006: Criacao permitida com `Employment active`.
- CA-007: Criacao permitida com `Employment ended`.
- CA-008: Criacao bloqueada com `Employment pending`.
- CA-009: Criacao bloqueada com `Employment cancelled`.
- CA-010: Criacao e sempre ato explicito de owner/admin.
- CA-011: `Employment.end()` nunca cria `Offboarding` automaticamente.

### Lifecycle de Offboarding

- CA-012: Estados canonicos sao `draft`, `in_progress`, `completed`,
  `cancelled`.
- CA-013: `draft -> in_progress` e transicao valida.
- CA-014: `draft -> cancelled` e transicao valida.
- CA-015: `in_progress -> completed` e transicao valida.
- CA-016: `in_progress -> cancelled` e transicao valida.
- CA-017: `draft -> completed` direto e bloqueado.
- CA-018: `completed` nao reabre.
- CA-019: `cancelled` nao reabre.
- CA-020: `Employment ended` nao bloqueia nenhuma transicao de `Offboarding`.
- CA-021: Transicoes fora da matriz sao proibidas.

### Tasks

- CA-022: Estados de task sao `open`, `completed`, `cancelled`.
- CA-023: Task sem `assignee_membership_id` e permitida apenas em
  `Offboarding draft`.
- CA-024: `draft -> in_progress` exige `assignee_membership_id` em toda task
  obrigatoria.
- CA-025: Task opcional nao bloqueia conclusao.
- CA-026: Task obrigatoria cancelada exige motivo.
- CA-027: Task `completed`/`cancelled` nao reabre.
- CA-028: Task ad hoc em `in_progress` exige autoria e `creation_reason`.
- CA-029: Task nao e adicionada em `Offboarding completed` ou `cancelled`.
- CA-030: Membership inativada bloqueia conclusao de task aberta pelo
  responsavel antigo.
- CA-031: Owner/admin podem reatribuir task aberta.
- CA-032: Nao existe `OffboardingTemplate` nesta v1.

### Progresso e conclusao

- CA-033: Progresso considera apenas tasks obrigatorias elegiveis.
- CA-034: Ausencia de task obrigatoria elegivel produz progresso `0%`.
- CA-035: Conclusao exige tasks obrigatorias elegiveis concluidas.
- CA-036: Conclusao exige ato humano de owner/admin.
- CA-037: Percentual sozinho nunca conclui `Offboarding`.
- CA-038: Progresso nunca e score, risco ou avaliacao da pessoa.

### Cancelamento e recriacao

- CA-039: Cancelamento exige motivo.
- CA-040: Cancelamento nao altera `Employment`, `OrganizationPerson`,
  `User` ou `Membership`.
- CA-041: Novo `Offboarding` pode ser criado apos o anterior `completed` ou
  `cancelled`, para o mesmo `Employment` elegivel.
- CA-042: Segundo `Offboarding` nao final para o mesmo `Employment` e
  bloqueado.

### Relacao com Employment e recontratacao

- CA-043: `Employment` 1:N `Offboarding` historico.
- CA-044: No maximo um `Offboarding` nao final por `Employment`.
- CA-045: `Offboarding` de `Employment` encerrado nunca bloqueia novo
  `Employment` da mesma `OrganizationPerson`.
- CA-046: `Offboarding` antigo nunca altera `Employment` novo.
- CA-047: Tasks de `Offboarding` antigo nunca sao reaproveitadas em
  `Employment` novo.
- CA-048: Acesso associado a `Employment` novo nunca e alterado por
  inferencia a partir de `Offboarding` antigo.

### Acesso User/Membership

- CA-049: `Offboarding` nunca executa mutacao de `User`.
- CA-050: `Offboarding` nunca executa mutacao de `Membership`.
- CA-051: Conclusao de task de revogacao nunca dispara mutacao automatica
  de acesso.
- CA-052: `Offboarding completed` nunca desativa `User`.
- CA-053: `Offboarding completed` nunca desativa `Membership`.
- CA-054: `assignee_membership_id` nunca e interpretado como alvo de
  revogacao.
- CA-055: Nao existe campo estrutural de alvo de revogacao nesta v1.
- CA-056: Automacao real de revogacao permanece fora do escopo e exige
  SPEC/ADR propria.

### Organization archived

- CA-057: Organization archived bloqueia criar Offboarding.
- CA-058: Organization archived bloqueia iniciar Offboarding.
- CA-059: Organization archived bloqueia mutacao de task.
- CA-060: Organization archived bloqueia concluir/cancelar Offboarding.
- CA-061: Leitura historica permanece possivel em Organization archived.

### RBAC

- CA-062: Owner cria/inicia/adiciona/atribui/conclui/cancela.
- CA-063: Admin cria/inicia/adiciona/atribui/conclui/cancela.
- CA-064: Member nao cria Offboarding.
- CA-065: Member nao inicia Offboarding.
- CA-066: Member conclui apenas task atribuida a sua Membership.
- CA-067: Member nao conclui task alheia.
- CA-068: Member nao cancela nem conclui Offboarding.
- CA-069: Platform Admin nao opera funcionalmente; leitura exige motivo.

### Privacidade e motivo de desligamento

- CA-070: PII fora da lista positiva e bloqueada em Offboarding e
  OffboardingTask.
- CA-071: `exit_category` e enum minimizado, nunca texto livre.
- CA-072: `Offboarding` nunca duplica `Employment.end_reason`.
- CA-073: Leitura de `Employment.end_reason` respeita a RBAC da SPEC-025.
- CA-074: `cancellation_reason` e minimizado e distinto do motivo de saida.

### IA e automacao

- CA-075: Zero AIGateway.
- CA-076: Zero AI Execution.
- CA-077: Zero score/ranking/flight risk.
- CA-078: Zero inferencia automatica de motivo.
- CA-079: Zero geracao automatica de Offboarding por IA.
- CA-080: Criacao/inicio/conclusao/cancelamento sao sempre atos explicitos.

### Idempotencia, concorrencia, atomicidade

- CA-081: Idempotency-Key exigida nas operacoes mutaveis listadas.
- CA-082: Retry idempotente identico retorna mesmo resultado.
- CA-083: Fingerprint divergente gera conflito seguro.
- CA-084: `Employment active` e `ended` concorrentes com criacao nao geram
  conflito por si so.
- CA-085: Falha de auditoria critica reverte a operacao correspondente.

### Multiempresa e mass assignment

- CA-086: Bloquear `Employment` de outra Organization.
- CA-087: Bloquear IDOR de Offboarding e OffboardingTask.
- CA-088: Bloquear mass assignment de `organization_id`, `status` e
  autoria.

### Historico

- CA-089: Sem hard delete.
- CA-090: Estados finais sao imutaveis.
- CA-091: Historico preservado apos recontratacao.

## 35. Testes Obrigatorios Futuros

### Aggregate e Employment

1. Offboarding nunca transiciona Employment.
2. Offboarding nunca altera OrganizationPerson.
3. Offboarding nunca altera Candidate/CandidateApplication/Proposal.

### Momento de criacao

4. criar Offboarding com Employment active;
5. criar Offboarding com Employment ended;
6. bloquear criacao com Employment pending;
7. bloquear criacao com Employment cancelled;
8. hired/end nunca criam Offboarding automaticamente.

### Lifecycle

9. draft -> in_progress;
10. draft -> cancelled;
11. in_progress -> completed;
12. in_progress -> cancelled;
13. bloquear draft -> completed direto;
14. bloquear reabertura de completed;
15. bloquear reabertura de cancelled;
16. Employment ended nao bloqueia nenhuma transicao de Offboarding.

### Tasks

17. criar task open;
18. task sem assignee permitida somente em draft;
19. iniciar exige assignee em toda task obrigatoria;
20. task opcional nao bloqueia conclusao;
21. task obrigatoria cancelada exige motivo;
22. bloquear reabertura de task completed;
23. bloquear reabertura de task cancelled;
24. task ad hoc em in_progress exige motivo;
25. bloquear task nova em Offboarding completed;
26. bloquear task nova em Offboarding cancelled;
27. Membership inativada bloqueia conclusao pelo responsavel antigo;
28. owner/admin reatribuem task aberta;
29. task ja concluida permanece concluida apos inativacao do autor.

### Progresso e conclusao

30. progresso considera apenas obrigatorias elegiveis;
31. divisao por zero retorna progresso operacional seguro;
32. conclusao bloqueada com task obrigatoria aberta;
33. conclusao exige confirmacao humana;
34. member nao conclui Offboarding.

### Cancelamento e recriacao

35. cancelamento exige motivo;
36. recriacao permitida apos completed;
37. recriacao permitida apos cancelled;
38. bloquear segundo Offboarding nao final para o mesmo Employment.

### Recontratacao

39. Offboarding 1 nao bloqueia criacao de Employment 2;
40. Offboarding 1 nao bloqueia ativacao de Employment 2;
41. Offboarding 1 nao altera Employment 2;
42. tasks de Offboarding 1 nao sao reaproveitadas em Offboarding 2;
43. acesso de Employment 2 nao e alterado por inferencia de Offboarding 1;
44. Offboarding 1 permanece consultavel como historico apos recontratacao.

### Acesso

45. concluir task de revogacao nao desativa User;
46. concluir task de revogacao nao desativa Membership;
47. Offboarding completed nao desativa User;
48. Offboarding completed nao desativa Membership;
49. Employment ended nao desativa User (regressao da SPEC-025);
50. Employment ended nao desativa Membership (regressao da SPEC-025);
51. nenhuma rota desta SPEC muta User ou Membership.

### Organization archived e RBAC

52. Organization archived bloqueia criar;
53. Organization archived bloqueia iniciar;
54. Organization archived bloqueia mutacao de task;
55. Organization archived bloqueia concluir/cancelar;
56. leitura historica permanece possivel;
57. owner cria/inicia/conclui/cancela;
58. admin cria/inicia/conclui/cancela;
59. member nao cria;
60. member nao inicia;
61. member conclui task propria;
62. member nao conclui task alheia;
63. member nao cancela nem conclui Offboarding;
64. Platform Admin nao opera funcionalmente;
65. Platform Admin leitura exige motivo.

### Privacidade

66. CPF/RG ausentes;
67. documentos ausentes;
68. dados bancarios ausentes;
69. saude/dependentes ausentes;
70. remuneracao ausente;
71. conteudo juridico integral ausente;
72. exit_category aceita apenas valores do enum;
73. Offboarding nunca duplica Employment.end_reason;
74. leitura de end_reason respeita RBAC da SPEC-025.

### IA e automacao

75. zero AIGateway;
76. zero AI Execution;
77. zero score/ranking;
78. zero inferencia automatica de motivo;
79. zero geracao automatica de Offboarding por IA;
80. Employment.end() nao cria Offboarding.

### Idempotencia, concorrencia, atomicidade

81. Idempotency-Key igual + fingerprint igual retorna mesmo resultado;
82. Idempotency-Key igual + fingerprint diferente gera conflito;
83. create x create concorrente produz no maximo um nao final;
84. start x cancel deterministico;
85. complete task x reassign deterministico;
86. complete task x cancel parent deterministico;
87. complete Offboarding x add required task deterministico;
88. Employment.end concorrente com create Offboarding nao gera conflito
    por si so;
89. Organization archive x mutation deterministico;
90. falha de auditoria critica reverte criacao;
91. falha de auditoria critica reverte conclusao de task;
92. falha de auditoria critica reverte conclusao de Offboarding;
93. crash recovery nao duplica Offboarding.

### Multiempresa e mass assignment

94. bloquear Employment de outra Organization;
95. bloquear IDOR de Offboarding;
96. bloquear IDOR de OffboardingTask;
97. bloquear mass assignment de organization_id;
98. bloquear mass assignment de status;
99. bloquear mass assignment de autoria;
100. erro cross-tenant e generico.

### Historico

101. nenhuma exclusao fisica ocorre;
102. Offboarding completed e imutavel;
103. Offboarding cancelled e imutavel;
104. historico permanece apos recontratacao;
105. persistencia permanece apos recriar aplicacao.

## 36. Revisao Destrutiva

Processo aplicado apos a redacao da v0.1, atacando o proprio documento nas
categorias exigidas pela tarefa.

### 36.1 Contradicoes

- **Encontrado:** a primeira redacao permitia criacao de Offboarding em
  `Employment pending`, para simetria com Onboarding (`draft` como
  preparacao antecipada). **Correcao:** removido. `pending` significa que o
  vinculo nunca comecou operacionalmente (SPEC-025 secao 7); nao ha "saida"
  de algo que nao comecou. Fechado na secao 8 como bloqueado.

### 36.2 Estados impossiveis

- **Verificado:** como `Employment` nunca transiciona `active -> cancelled`
  (regra ja fixada pela SPEC-025), e Offboarding so nasce com `Employment`
  `active` ou `ended`, a combinacao "Offboarding existente + Employment
  cancelled" e estruturalmente impossivel. Nenhuma correcao necessaria;
  documentado explicitamente na secao 8 para deixar claro que e garantia
  estrutural, nao apenas regra de validacao redundante.

### 36.3 Automacao indevida

- **Encontrado:** a primeira redacao da secao de tasks permitia um campo
  `target_membership_id` para "task de revogacao", pensando em
  rastreabilidade. **Correcao:** removido explicitamente (secao 15, CA-055)
  por ser um passo estrutural em direcao a automacao de acesso sem base
  normativa nas fontes obrigatorias. Substituido por conteudo textual
  minimizado em `title`/`description`.

### 36.4 Acoplamento com User/Membership

- **Verificado:** `assignee_membership_id` e a unica referencia a
  `Membership` em todo o dominio. Confirmado que essa referencia e apenas
  "quem executa", nunca "quem e afetado" — distincao tornada explicita na
  secao 7 e secao 15 para prevenir reinterpretacao futura.

### 36.5 PII excessiva

- **Encontrado:** rascunho inicial cogitava um campo `exit_notes` de texto
  livre em `Offboarding`, por analogia com `summary` de
  `DevelopmentCheckIn`. **Correcao:** removido. Nao ha finalidade normativa
  clara distinta de `Employment.end_reason` (ja existente) e
  `cancellation_reason` (ja minimizado). Adicionar um segundo texto livre
  criaria um deposito sensivel sem controle proprio, violando SPEC-025
  secao 18 e ADR-0024 "Privacidade e Minimizacao".

### 36.6 Conflito com Employment lifecycle

- **Verificado:** nenhuma operacao desta SPEC transiciona `Employment`.
  Confirmado por leitura cruzada de todas as secoes 8 a 22 contra a matriz
  de transicoes da SPEC-025 secao 8. Nenhuma correcao necessaria.

### 36.7 Problemas de recontratacao

- **Encontrado:** rascunho inicial nao deixava explicito se um
  `Offboarding` nao final do vinculo antigo bloquearia a *ativacao* (nao
  so a criacao) do novo `Employment`. **Correcao:** explicitado na secao
  14.4 e CA-045: nenhuma validacao desta SPEC e consultada pela SPEC-025
  para nenhuma transicao de `Employment` — a independencia e estrutural,
  nao apenas por ausencia de regra de bloqueio.

### 36.8 Cardinalidade ambigua

- **Encontrado:** avaliar se copiar a regra de Onboarding (bloquear
  recriacao para sempre apos `cancelled`) ou de DevelopmentPlan (permitir
  novo apos final) gerava ambiguidade se nao justificada. **Correcao:**
  decisao explicita pela regra de `DevelopmentPlan`, com justificativa
  registrada na secao 14.1 (Employment e vinculo continuo, nao evento
  irrepetivel como CandidateApplication).

### 36.9 Concorrencia nao deterministica

- **Encontrado:** faltava tratar explicitamente o par "Employment.end x
  create Offboarding" como cenario que **nao** gera conflito (diferente dos
  demais pares desta SPEC, que geram). **Correcao:** adicionado
  explicitamente na secao 24 para nao deixar essa assimetria implicita.

### 36.10 Idempotencia insuficiente

- **Verificado:** todas as oito operacoes mutaveis catalogadas exigem
  Idempotency-Key, mesmo padrao ja usado por SPEC-025/016/017. Nenhuma
  operacao mutavel ficou fora da lista da secao 23.

### 36.11 Autorizacao vaga

- **Encontrado:** rascunho inicial usava "responsavel autorizado" sem
  definir a relacao exata para `member`. **Correcao:** fechado na secao 17
  como exatamente "ser a Membership em `assignee_membership_id` da task",
  nenhuma outra relacao, por analogia justificada com SPEC-016 (nao por
  analogia nao justificada).

### 36.12 Regra impossivel de implementar fisicamente

- **Verificado:** o modelo fisico conceitual (secao 30) reaproveita
  exatamente os mesmos padroes ja implementados fisicamente em
  `employments`/`onboarding_tasks`/`*_idempotency_keys` (FKs compostas
  tenant-safe, indice parcial unico, triggers de imutabilidade). Nenhuma
  regra desta SPEC exige mecanismo fisico novo ou nao comprovado.

### Conclusao da revisao destrutiva

Nenhum problema encontrado permaneceu sem correcao incorporada ao texto das
secoes 1 a 35. O unico ponto que nao e uma questao de conteudo normativo
desta SPEC — a ausencia de "Fase 27" em `docs/00-visao/roadmap.md` — e
registrado na secao 37 como conflito processual, nao bloqueante para o
conteudo aqui fechado.

## 37. Conflitos Encontrados

- **Conflito processual (nao bloqueante):** o enunciado desta tarefa afirma
  como estado confirmado que "Fase 27 [esta] definida documentalmente como
  Offboarding" e que "SPEC-026" e o "proximo ID livre confirmado". A
  inspecao fisica de `docs/00-visao/roadmap.md` nao confirma essa premissa:
  o roadmap define apenas a Fase 26 (Integracao Onboarding -> Employment)
  como planejada, e lista Offboarding explicitamente entre as "demais
  capacidades pos-contratacao... [que] permanecem sem SPEC ou ADR aprovada"
  e que "exigem etapa propria de definicao de produto (ADR e/ou SPEC
  dedicada) antes de virar Fase numerada". `docs/01-produto/BACKLOG.md`
  tambem nao lista SPEC-026 nem Fase 27. Este documento nao normaliza essa
  divergencia silenciosamente: ele proprio e a "SPEC dedicada" que o
  roadmap ja antecipava como pre-requisito, mas a numeracao formal de Fase
  27 e a atualizacao de BACKLOG/roadmap continuam fora do escopo desta
  tarefa (item 30 do enunciado) e sao um passo de saneamento de
  planejamento separado, ainda pendente.
- Nenhum conflito de conteudo normativo com ADR-0024, SPEC-025, SPEC-016,
  SPEC-017, SPEC-003 ou SPEC-004 foi encontrado apos a revisao destrutiva
  (secao 36).

## 38. Ambiguidades Restantes

Nao bloqueantes para esta SPEC documental, deliberadamente nao resolvidas
por analogia:

- automacao real de revogacao de acesso (secao 15, opcao C) — exige
  SPEC/ADR propria futura;
- contractor, freelancer, estagiario, temporario e terceiros no contexto de
  offboarding — herda a mesma ambiguidade ja registrada por SPEC-025 secao
  37;
- forma final de exibicao de `Employment.end_reason` na UI de Offboarding;
- eventual necessidade futura de `OffboardingTemplate`, caso surja
  demanda de produto real;
- modelo fisico final de idempotencia (mecanismo compartilhado vs. tabela
  propria);
- saneamento formal de `BACKLOG.md`/`roadmap.md` para registrar Fase 27
  (secao 37), fora do escopo desta tarefa.

## 39. Limitacoes Conhecidas

- Esta SPEC nao implementa codigo, migration, banco ou testes executaveis.
- Nao define UI final nem API final.
- Nao define modelo fisico completo (apenas conceitual, secao 30).
- Nao define mecanismo de revogacao de acesso.
- Nao define Performance, sucessao, remuneracao, folha, beneficios,
  documentos legais ou calculo trabalhista.
- Nao altera ADR-0024, SPEC-025, SPEC-016, SPEC-017, SPEC-003, SPEC-004,
  BACKLOG ou roadmap.
- Nao formaliza a Fase 27 no planejamento oficial (secao 37).

## 40. Definicao de Concluido

Para esta tarefa documental:

- fontes obrigatorias lidas integralmente (secao 3);
- problema separado nos sete dominios exigidos (secao 4);
- aggregate root fechado sem transformar Employment em checklist (secao 5);
- momento de criacao fechado com justificativa, nao por analogia cega
  (secao 8);
- lifecycle de Offboarding e de tasks fechados (secoes 9 e 10);
- relacao com Employment, cardinalidade e recontratacao fechados (secao
  14);
- fronteira de acesso a User/Membership fechada de forma conservadora
  (secao 15);
- RBAC fechado, sem "autorizado" vago (secao 17);
- privacidade, motivo de desligamento, IA e automacao fechados (secoes 18 a
  21);
- idempotencia, concorrencia, atomicidade e auditoria definidos (secoes 23
  a 26);
- criterios de aceite (90) e testes obrigatorios futuros (105) definidos;
- revisao destrutiva aplicada e incorporada (secao 36);
- conflito processual de planejamento registrado, nao normalizado
  silenciosamente (secao 37);
- nenhum codigo, migration, banco ou teste executavel criado ou alterado;
- nenhuma alteracao de BACKLOG ou roadmap;
- nenhum commit realizado.

Para implementacao futura:

- SPEC mantida aprovada antes do desenvolvimento;
- Fase 27 formalizada em `docs/00-visao/roadmap.md` e `docs/01-produto/
  BACKLOG.md` como etapa de saneamento de planejamento separada;
- plano tecnico revisado;
- migrations reproduziveis quando houver banco;
- criterios de aceite implementados;
- testes obrigatorios implementados e passando;
- seguranca, privacidade e multiempresa revisadas;
- documentacao dependente atualizada;
- commit realizado somente na fase apropriada.
