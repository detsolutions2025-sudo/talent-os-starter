# SPEC-012 - Processo Seletivo

**Status:** Aprovada  
**Versão:** 1.0  
**Fase:** 9  
**Responsavel de negocio:** Thiago Sousa  
**Dependencias:** SPEC-010 - Vagas, SPEC-011 - Candidatos, ADR-0014 - Processo seletivo versionado  
**Ultima atualizacao:** 2026-08-06

## 1. Objetivo

Especificar o modulo de Processo Seletivo do Talent OS.

O Processo Seletivo e representado pela entidade `CandidateApplication`, que
conecta uma Organization, um Candidate, uma Job Opening e uma versao publicada
especifica da Job Opening.

Esta SPEC define:

- criacao de candidatura;
- vinculo imutavel com Candidate;
- vinculo imutavel com Job Opening;
- vinculo imutavel com Job Opening Version publicada;
- apenas uma candidatura ativa por Candidate + Job Opening;
- estados canonicos da candidatura;
- separacao entre `application_status` e `current_stage`;
- pipeline minimo pertencente a candidatura;
- historico imutavel de movimentacoes;
- notas internas da candidatura;
- permissoes;
- auditoria;
- seguranca multiempresa;
- modelo conceitual de banco;
- criterios de aceite e testes obrigatorios.

## 2. Fora do Escopo

- Implementar codigo, banco, migrations, rotas, testes ou dependencias.
- Implementar pipeline detalhado.
- Definir etapas canonicas de pipeline.
- Implementar candidatura publica.
- Implementar entrevistas.
- Implementar respostas de questionarios.
- Implementar avaliacoes.
- Implementar IA.
- Implementar matching.
- Implementar ranking.
- Implementar score.
- Implementar propostas.
- Implementar onboarding.
- Implementar contratacao.
- Copiar snapshots de Cargo, Competencias, Perguntas, Vaga ou Candidate para a
  candidatura.
- Excluir fisicamente candidaturas ou eventos.

## 3. Usuarios Envolvidos

- **owner:** cria, consulta, movimenta, cancela, retira, rejeita e marca
  contratacao em candidaturas da Organization ativa, quando permitido.
- **admin:** cria, consulta, movimenta, cancela, retira, rejeita e marca
  contratacao em candidaturas da Organization ativa, quando permitido.
- **member:** visualiza somente candidaturas `active` em DTO restrito, sem
  permissao para operar, movimentar, consultar candidaturas finalizadas ou
  consultar timeline e historico administrativo.
- **Platform Admin:** consulta administrativamente com motivo e auditoria, sem
  operar funcionalmente candidaturas.

`Platform Admin` nao e Role de Membership e nao recebe permissoes funcionais de
`owner`, `admin` ou `member` dentro da Organization.

Nesta fase, `member` pode visualizar somente candidaturas `active` e recebe DTO
estritamente limitado pela lista positiva definida nesta SPEC.

## 4. Conceitos

### 4.1 CandidateApplication

Entidade principal da candidatura.

Representa a participacao de um Candidate em uma Job Opening, preservando a
versao publicada especifica da Vaga usada no momento da criacao.

Campos conceituais:

- `id`;
- `organization_id`;
- `candidate_id`;
- `job_opening_id`;
- `job_opening_version_id`;
- `application_status`;
- `current_stage`;
- `source`;
- `applied_at`;
- `finalized_at`, opcional;
- `finalized_by_user_id`, opcional;
- `finalization_reason`, opcional;
- autoria;
- timestamps.

`CandidateApplication` nao e o Candidate e nao e a Job Opening. Ela conecta
ambas.

Depois de criada, a candidatura nunca pode trocar:

- `organization_id`;
- `candidate_id`;
- `job_opening_id`;
- `job_opening_version_id`.

Deve existir apenas uma `CandidateApplication` ativa para o mesmo par
Candidate + Job Opening dentro da mesma Organization. Essa regra deve ser
protegida conceitualmente contra concorrencia, com validacao transacional e
restricao de persistencia quando a funcionalidade for implementada.

`application_status` e `current_stage` sao conceitos diferentes:

- `application_status` controla o ciclo de vida da candidatura;
- `current_stage` controla a etapa atual do pipeline.

### 4.2 CandidateApplicationEvent

Evento imutavel da candidatura.

Cada evento pertence a uma `CandidateApplication` e registra mudancas relevantes
de estado, etapa, cancelamento, retirada, rejeicao, contratacao e leituras
administrativas quando aplicavel.

Campos conceituais minimos:

- `event_type`;
- `stage_before`;
- `stage_after`;
- `status_before`;
- `status_after`;
- actor;
- motivo;
- `created_at`.

### 4.3 CandidateApplicationNote

Nota interna da candidatura.

Notas de processo seletivo pertencem a `CandidateApplication`, nunca ao
Candidate principal. Elas devem ficar em entidade propria, conceitualmente
`candidate_application_notes`, com autoria, timestamps e Organization.

### 4.4 Candidate

Candidate continua sendo apenas cadastro da pessoa candidata dentro de uma
Organization.

Candidate nunca deve possuir:

- etapa;
- score;
- ranking;
- recomendacao;
- decisao;
- status de candidatura;
- historico de pipeline.

### 4.5 Job Opening

Job Opening continua sendo a Vaga.

Job Opening nunca deve possuir:

- candidatos diretamente;
- etapa de candidato;
- score;
- ranking;
- recomendacao individual;
- decisao individual de processo seletivo.

### 4.6 Job Opening Version

Job Opening Version e o snapshot publicado do conteudo da Vaga.

`CandidateApplication` deve referenciar uma versao `published` especifica. Nunca
deve referenciar draft.

Republicacoes futuras da Vaga nao alteram candidaturas existentes.

### 4.7 Competencias

Competencias usadas pelo processo seletivo devem ser referenciadas somente por:

- `competency_catalog_items.id`.

Nao copiar competencia por nome, texto ou codigo para a candidatura.

### 4.8 Perguntas

Perguntas usadas pelo processo seletivo devem ser referenciadas somente por:

- `question_catalog_items.id`.

Nao copiar pergunta por texto, titulo ou codigo para a candidatura.

### 4.9 IA Futura

IA nao sera implementada nesta SPEC.

Futuras avaliacoes por IA nao pertencem ao Candidate e nao pertencem a Job
Opening. Elas deverao pertencer a `CandidateApplication` ou a entidades filhas
vinculadas diretamente a ela.

### 4.10 Entrevistas Futuras

Entrevistas nao serao implementadas nesta SPEC.

Entrevistas futuras deverao pertencer a `CandidateApplication`.

### 4.11 Propostas Futuras

Propostas nao serao implementadas nesta SPEC.

Propostas futuras deverao pertencer a `CandidateApplication`.

## 5. Estados Canonicos

Estados canonicos de `application_status`:

- `active`
- `withdrawn`
- `rejected`
- `hired`
- `cancelled`

Esses estados representam apenas o ciclo de vida da candidatura. Eles nao
representam pipeline.

Estados de Candidate nao podem ser reutilizados como estados de candidatura.
Estados de Job Opening nao podem ser reutilizados como estados de candidatura.

`active` e o unico estado nao final.

Estados finais:

- `withdrawn`;
- `rejected`;
- `hired`;
- `cancelled`.

Estados finais nunca retornam para `active`.

Uma candidatura em estado final nao recebe novas movimentacoes operacionais nesta
fase, exceto leitura historica e administrativa autorizada.

Regras de finalizacao:

- `withdrawn` representa retirada do candidato, pode ser registrado por owner e
  admin, exige motivo e e estado final.
- `rejected` representa decisao negativa da empresa, pode ser registrado por
  owner e admin, exige motivo e e estado final.
- `hired` representa aprovacao final, somente owner pode registrar nesta fase,
  exige motivo ou referencia administrativa, nao cria contratacao, colaborador
  ou onboarding e e estado final.
- `cancelled` representa encerramento administrativo da candidatura, pode ser
  registrado por owner e admin, exige motivo e e estado final.

Toda finalizacao deve preencher:

- `finalized_at`;
- `finalized_by_user_id`;
- `finalization_reason`.

Nao existe exclusao fisica.

Etapas canonicas minimas de `current_stage`:

- `applied`
- `screening`
- `interview`
- `assessment`
- `offer`
- `completed`

Essas etapas sao o pipeline minimo desta fase. Elas nao implementam entrevistas,
IA, avaliacoes ou propostas.

`completed` e apenas uma etapa operacional. Chegar a `completed` nao finaliza
automaticamente a candidatura. O `application_status` continua `active` ate
ocorrer uma acao explicita de finalizacao. Candidatura finalizada nao pode mudar
de etapa, e a etapa existente permanece preservada no historico.

## 6. Fluxos Principais

### 6.1 Criar Candidatura

1. Owner ou admin acessa uma Organization ativa.
2. Seleciona um Candidate ativo da mesma Organization.
3. Seleciona uma Job Opening da mesma Organization.
4. Sistema identifica a Job Opening Version `published` vigente.
5. Sistema valida que a Job Opening esta aberta para receber candidatura.
6. Sistema valida que a Job Opening Version e publicada.
7. Sistema valida consentimento operacional atual do Candidate.
8. Sistema valida que nao existe outra `CandidateApplication` `active` para o
   mesmo Candidate + Job Opening.
9. Sistema bloqueia a criacao concorrente do mesmo par Candidate + Job Opening.
10. Sistema cria `CandidateApplication` com `application_status` `active`,
    `current_stage` `applied` e `applied_at`.
11. Sistema registra evento inicial em `candidate_application_events`.
12. Sistema registra auditoria sem copiar dados pessoais completos.

### 6.2 Consultar Candidaturas

1. Usuario autorizado solicita candidaturas da Organization atual.
2. Sistema valida User ativo, Membership ativo, Organization ativa e role.
3. Sistema valida escopo da Organization em todos os IDs.
4. Sistema retorna apenas candidaturas da Organization atual.
5. Member recebe somente leitura restrita para candidaturas `active`.
6. Platform Admin usa leitura administrativa auditada com motivo.

### 6.3 Movimentar Pipeline

1. Owner ou admin seleciona uma candidatura ativa da Organization atual.
2. Sistema valida candidatura, Candidate, Job Opening e Job Opening Version.
3. Sistema valida Organization comum entre todos os registros.
4. Sistema valida se a movimentacao e avanco, retorno ou salto.
5. Sistema exige motivo obrigatorio para salto.
6. Sistema executa a movimentacao em transacao.
7. Sistema registra etapa anterior e etapa nova.
8. Sistema grava evento imutavel.
9. Sistema registra auditoria.

Nao existe alteracao silenciosa de etapa.

### 6.4 Retirar Candidatura

1. Owner ou admin registra retirada operacional do candidato.
2. Sistema valida Organization ativa, role e candidatura ativa.
3. Sistema altera `application_status` para `withdrawn`.
4. Sistema registra evento historico.
5. Sistema registra auditoria.

### 6.5 Rejeitar Candidatura

1. Owner ou admin registra rejeicao.
2. Sistema valida Organization ativa, role e candidatura ativa.
3. Sistema altera `application_status` para `rejected`.
4. Sistema registra evento historico.
5. Sistema registra auditoria.

### 6.6 Marcar Contratacao

1. Owner ou admin registra contratacao da candidatura.
2. Sistema valida Organization ativa, role e candidatura ativa.
3. Sistema altera `application_status` para `hired`.
4. Sistema registra evento historico.
5. Sistema registra auditoria.

Esta SPEC nao implementa modulo de contratacao, onboarding ou colaborador.

### 6.7 Cancelar Candidatura

1. Owner ou admin cancela uma candidatura criada por engano ou inviabilizada.
2. Sistema valida Organization ativa, role e candidatura.
3. Sistema altera `application_status` para `cancelled`.
4. Sistema registra motivo quando informado.
5. Sistema registra evento historico.
6. Sistema registra auditoria.

### 6.8 Leitura Administrativa

1. Platform Admin informa motivo administrativo.
2. Sistema valida que o ator e Platform Admin.
3. Sistema consulta dados minimizados.
4. Sistema registra auditoria.

Platform Admin nao opera funcionalmente candidaturas.

### 6.9 Consentimento Invalido Apos a Criacao

Quando o consentimento operacional do Candidate estiver `pending`, `revoked` ou
`expired` apos a criacao da candidatura, a candidatura permanece preservada, mas
novas acoes operacionais ficam bloqueadas.

Operacoes bloqueadas:

- avanco de etapa;
- retorno de etapa;
- salto de etapa;
- marcacao como `hired`;
- criacao de notas operacionais;
- qualquer nova avaliacao ou uso operacional futuro dos dados.

Operacoes permitidas:

- marcar como `withdrawn`;
- marcar como `cancelled`;
- marcar como `rejected`, quando necessario para encerramento administrativo;
- consultar historico minimo por owner/admin;
- leitura administrativa auditada pelo Platform Admin;
- registrar evento necessario para preservar o encerramento e a obrigacao legal.

Regras adicionais:

- consentimento invalido nao apaga a candidatura;
- nao remove eventos;
- nao remove notas existentes;
- nao altera automaticamente o estado;
- nao altera automaticamente a etapa;
- toda tentativa de operacao bloqueada deve gerar resposta segura;
- negacoes relevantes devem gerar auditoria;
- o evento de encerramento deve registrar motivo;
- `hired` nunca e permitido com consentimento operacional invalido.

## 7. Pipeline

O pipeline pertence a `CandidateApplication`.

Pipeline nao pertence:

- ao Candidate;
- a Job Opening;
- a Job Opening Version.

Cada movimentacao de pipeline deve gerar evento em
`candidate_application_events`.

Etapas minimas:

- `applied`;
- `screening`;
- `interview`;
- `assessment`;
- `offer`;
- `completed`.

Uma movimentacao deve registrar minimamente:

- etapa anterior;
- etapa nova;
- usuario responsavel;
- data;
- motivo opcional.

Regras de movimentacao:

- avanco para etapa posterior e permitido por owner/admin;
- retorno para etapa anterior e permitido por owner/admin;
- salto que pula uma ou mais etapas e permitido somente por owner/admin com
  motivo obrigatorio;
- toda movimentacao deve ocorrer em transacao;
- toda movimentacao deve gerar evento obrigatorio;
- candidatura em estado final nao pode ser movimentada;
- consentimento `pending`, `revoked` ou `expired` impede novas acoes
  operacionais, exceto encerramentos administrativos previstos nesta SPEC.

`completed` e etapa operacional, nao estado final. Ela nao dispara `hired`,
`rejected`, `withdrawn` ou `cancelled` automaticamente.

Nao existe alteracao silenciosa. Toda mudanca gera evento e auditoria.

As etapas `interview`, `assessment` e `offer` nao implementam entrevistas,
avaliacoes, IA ou propostas. Elas sao apenas marcadores de pipeline minimo.

Esta SPEC nao define SLA, automacoes, detalhes de entrevista, criterios de
avaliacao, ranking, score ou matching.

### 7.1 Concorrencia de Pipeline

Movimentacoes devem bloquear a `CandidateApplication` durante a transacao.

A etapa e o estado devem ser revalidados dentro da transacao antes da gravacao.

Duas movimentacoes simultaneas nao podem sobrescrever eventos. Duas
finalizacoes simultaneas nao podem produzir estados finais diferentes.

A primeira operacao confirmada prevalece. A segunda operacao incompativel deve
receber conflito seguro.

## 8. Regras de Negocio

- RN-001: `CandidateApplication` pertence obrigatoriamente a uma Organization.
- RN-002: `CandidateApplication` conecta Candidate, Job Opening e Job Opening
  Version.
- RN-003: Candidate, Job Opening e Job Opening Version devem pertencer a mesma
  Organization da candidatura.
- RN-004: `CandidateApplication` nunca pode mudar de Organization.
- RN-005: `CandidateApplication` nunca pode mudar de Candidate.
- RN-006: `CandidateApplication` nunca pode mudar de Job Opening.
- RN-007: `CandidateApplication` nunca pode mudar de Job Opening Version.
- RN-008: Job Opening Version deve estar `published` no momento da criacao da
  candidatura.
- RN-009: Job Opening Version `draft` e recusada.
- RN-010: Republicacoes futuras da Vaga nao alteram candidaturas existentes.
- RN-011: Deve existir apenas uma `CandidateApplication` `active` por Candidate
  - Job Opening dentro da mesma Organization.
- RN-012: A unicidade ativa por Candidate + Job Opening deve ser protegida
  contra concorrencia.
- RN-013: `application_status` e `current_stage` sao campos e conceitos
  distintos.
- RN-014: `active` e o unico `application_status` nao final.
- RN-015: `withdrawn`, `rejected`, `hired` e `cancelled` sao finais.
- RN-016: Estados finais nunca retornam para `active`.
- RN-017: Toda finalizacao exige motivo e preenche `finalized_at`,
  `finalized_by_user_id` e `finalization_reason`.
- RN-018: `withdrawn` representa retirada do candidato e pode ser registrado por
  owner/admin.
- RN-019: `rejected` representa decisao negativa da empresa e pode ser
  registrado por owner/admin.
- RN-020: `hired` representa aprovacao final e somente owner pode registrar
  nesta fase.
- RN-021: `hired` nao cria contratacao, colaborador ou onboarding.
- RN-022: `cancelled` representa encerramento administrativo e pode ser
  registrado por owner/admin.
- RN-023: Candidate deve estar `active` no momento da criacao.
- RN-024: Candidate `inactive` nao pode receber nova candidatura.
- RN-025: Candidate inativado apos a criacao preserva candidaturas existentes.
- RN-026: Consentimento operacional do Candidate deve permitir novo uso.
- RN-027: Consentimento `pending`, `revoked` ou `expired` bloqueia nova
  candidatura.
- RN-028: Consentimento `pending`, `revoked` ou `expired` apos a criacao bloqueia
  avanco, retorno, salto, `hired`, criacao de notas operacionais e novo uso
  operacional futuro dos dados.
- RN-029: Consentimento `pending`, `revoked` ou `expired` apos a criacao permite
  somente `withdrawn`, `cancelled`, `rejected` administrativo com motivo,
  historico minimo por owner/admin, leitura administrativa auditada e evento
  necessario para preservacao legal.
- RN-030: Consentimento invalido apos a criacao nao apaga candidatura, nao remove
  eventos, nao remove notas existentes, nao altera automaticamente estado e nao
  altera automaticamente etapa.
- RN-031: `hired` nunca e permitido com consentimento operacional invalido.
- RN-032: Job Opening deve aceitar candidatura no momento da criacao.
- RN-033: Job Opening `closed` e recusada para nova candidatura.
- RN-034: Job Opening `cancelled` e recusada para nova candidatura.
- RN-035: Fechar a Vaga impede novas candidaturas, mas nao altera
  automaticamente candidaturas existentes.
- RN-036: Job Opening sem versao publicada e recusada.
- RN-037: Candidate nao recebe etapa, score, ranking, recomendacao ou decisao.
- RN-038: Job Opening nao recebe candidatos diretamente nem etapa de candidato.
- RN-039: Estados de candidatura sao independentes dos estados de Candidate e
  Job Opening.
- RN-040: Pipeline pertence a CandidateApplication.
- RN-041: Pipeline minimo usa `applied`, `screening`, `interview`,
  `assessment`, `offer` e `completed`.
- RN-042: As etapas minimas nao implementam entrevistas, avaliacoes, IA ou
  propostas.
- RN-043: `completed` e apenas etapa operacional e nao finaliza automaticamente a
  candidatura.
- RN-044: `application_status` permanece `active` em `completed` ate acao
  explicita de finalizacao.
- RN-045: Candidatura finalizada nao muda de etapa.
- RN-046: Avanco de etapa e permitido por owner/admin.
- RN-047: Retorno de etapa e permitido por owner/admin.
- RN-048: Salto de etapa exige owner/admin e motivo obrigatorio.
- RN-049: Toda movimentacao de pipeline ocorre em transacao.
- RN-050: Movimentacoes devem bloquear a `CandidateApplication` e revalidar
  etapa e estado dentro da transacao.
- RN-051: Toda movimentacao de pipeline gera evento imutavel.
- RN-052: Historico nunca e apagado.
- RN-053: Notas internas do processo seletivo pertencem a
  `CandidateApplication`, nunca ao Candidate.
- RN-054: Nao existe exclusao fisica de candidaturas, eventos ou notas.
- RN-055: Competencias sao referenciadas somente por
  `competency_catalog_items.id`.
- RN-056: Perguntas sao referenciadas somente por `question_catalog_items.id`.
- RN-057: Nao copiar Cargo, Competencias, Perguntas, Vaga ou Candidate para a
  candidatura.
- RN-058: IDs internos sao a unica referencia tecnica entre modulos.
- RN-059: Textos, nomes, codigos, e-mails e slugs publicos nao sao referencia de
  dominio para relacionamentos.
- RN-060: Platform Admin nao opera funcionalmente candidaturas.
- RN-061: Platform Admin consulta administrativamente somente com motivo e
  auditoria.
- RN-062: Member possui somente leitura restrita de candidaturas `active`.
- RN-063: Member nao cria, movimenta, finaliza, cancela, retira, rejeita,
  contrata ou registra notas.
- RN-064: Organization arquivada bloqueia operacoes normais.
- RN-065: Acesso cruzado entre Organizations deve ser recusado sem vazar
  existencia dos registros.
- RN-066: Auditoria nao deve registrar dados pessoais completos.
- RN-067: Falha de auditoria critica deve causar rollback.
- RN-068: Movimentacoes concorrentes nao podem sobrescrever historico nem gerar
  estado final incoerente.
- RN-069: Duas finalizacoes simultaneas nao podem produzir estados finais
  diferentes; a primeira confirmada prevalece e a segunda recebe conflito seguro.
- RN-070: IA futura pertence a CandidateApplication ou entidades filhas.
- RN-071: Entrevistas futuras pertencem a CandidateApplication.
- RN-072: Propostas futuras pertencem a CandidateApplication.
- RN-073: Esta SPEC nao implementa contratacao, onboarding ou colaborador.

## 9. Dados Necessarios

### 9.1 CandidateApplication

| Campo                    | Obrigatorio | Observacao                                   |
| ------------------------ | ----------: | -------------------------------------------- |
| `id`                     |         Sim | Identificador interno gerado pelo sistema.   |
| `organization_id`        |         Sim | Organization proprietaria da candidatura.    |
| `candidate_id`           |         Sim | Candidate ativo da mesma Organization.       |
| `job_opening_id`         |         Sim | Job Opening da mesma Organization.           |
| `job_opening_version_id` |         Sim | Versao publicada especifica da Job Opening.  |
| `status`                 |         Sim | Estado canonico da candidatura.              |
| `current_stage`          |         Sim | Etapa atual do pipeline minimo.              |
| `source`                 |         Sim | Origem da candidatura.                       |
| `applied_at`             |         Sim | Data/hora da candidatura.                    |
| `finalized_at`           |         Nao | Data/hora de entrada em estado final.        |
| `finalized_by_user_id`   |         Nao | Usuario responsavel pela finalizacao.        |
| `finalization_reason`    |         Nao | Motivo da finalizacao, quando houver.        |
| `created_by_user_id`     |         Sim | Usuario responsavel pela criacao.            |
| `updated_by_user_id`     |         Nao | Usuario responsavel pela ultima atualizacao. |
| `created_at`             |         Sim | Data/hora de criacao.                        |
| `updated_at`             |         Sim | Data/hora da ultima atualizacao.             |

Nesta SPEC, o campo `status` materializa o conceito `application_status`.

### 9.2 CandidateApplicationEvent

| Campo                      | Obrigatorio | Observacao                                  |
| -------------------------- | ----------: | ------------------------------------------- |
| `id`                       |         Sim | Identificador interno gerado pelo sistema.  |
| `organization_id`          |         Sim | Organization proprietaria do evento.        |
| `candidate_application_id` |         Sim | Candidatura vinculada.                      |
| `event_type`               |         Sim | Tipo canonico do evento.                    |
| `stage_before`             |         Nao | Etapa anterior quando houver movimentacao.  |
| `stage_after`              |         Nao | Nova etapa quando houver movimentacao.      |
| `status_before`            |         Nao | Estado anterior quando houver mudanca.      |
| `status_after`             |         Nao | Novo estado quando houver mudanca.          |
| actor                      |         Sim | Usuario ou ator administrativo responsavel. |
| motivo                     |         Nao | Motivo opcional ou obrigatorio para salto.  |
| `created_by_user_id`       |         Sim | Usuario responsavel pelo evento.            |
| `created_at`               |         Sim | Data/hora do evento.                        |

### 9.3 CandidateApplicationNote

| Campo                      | Obrigatorio | Observacao                                   |
| -------------------------- | ----------: | -------------------------------------------- |
| `id`                       |         Sim | Identificador interno gerado pelo sistema.   |
| `organization_id`          |         Sim | Organization proprietaria da nota.           |
| `candidate_application_id` |         Sim | Candidatura vinculada.                       |
| `content`                  |         Sim | Conteudo da nota interna.                    |
| `created_by_user_id`       |         Sim | Usuario responsavel pela criacao.            |
| `updated_by_user_id`       |         Nao | Usuario responsavel pela ultima atualizacao. |
| `created_at`               |         Sim | Data/hora de criacao.                        |
| `updated_at`               |         Sim | Data/hora da ultima atualizacao.             |

### 9.4 Tipos de Evento Iniciais

- `application.created`;
- `application.stage_moved`;
- `application.withdrawn`;
- `application.rejected`;
- `application.hired`;
- `application.cancelled`;
- `application.administrative_read`;

Eventos de acesso negado podem ser registrados na auditoria global sem criar
evento de dominio quando a candidatura nao puder ser revelada com seguranca.

## 10. Historico

Toda mudanca relevante de candidatura deve preservar historico imutavel.

Toda movimentacao de etapa registra:

- etapa anterior;
- etapa nova;
- usuario;
- data;
- motivo opcional.

Salto de etapa deve registrar motivo obrigatorio.

Toda mudanca de estado registra:

- estado anterior;
- estado novo;
- usuario;
- data;
- motivo opcional.

Nenhum historico e apagado. Correcao de erro deve gerar novo evento compensatorio
ou evento de cancelamento, nunca sobrescrever o evento original.

Historico pertence a Organization da candidatura e deve respeitar o mesmo
isolamento multiempresa.

Eventos de `candidate_application_events` sao imutaveis. Alteracoes de texto em
notas internas pertencem a `candidate_application_notes` e devem preservar
autoria, timestamps e auditoria, sem transformar nota em historico de pipeline.

## 11. Versionamento

`CandidateApplication` referencia:

- Candidate;
- Job Opening;
- Job Opening Version publicada.

Nunca referencia draft.

A Job Opening Version registrada na candidatura e imutavel. Nova publicacao da
Vaga cria novo snapshot para novas candidaturas, mas nao altera candidaturas
existentes.

A candidatura nao copia Cargo, Competencias, Perguntas ou Candidate. O contexto
versionado fica preservado pela Job Opening Version publicada referenciada.

Se uma competencia ou pergunta vinculada a versao publicada for inativada no
catalogo depois, a candidatura existente continua preservada historicamente por
meio da versao publicada da Vaga.

## 12. Permissoes

Todas as acoes funcionais exigem User ativo, Membership ativo, Organization ativa
e role autorizada.

| Acao                                       | Platform Admin | owner | admin | member |
| ------------------------------------------ | :------------: | :---: | :---: | :----: |
| Criar candidatura                          |      Nao       |  Sim  |  Sim  |  Nao   |
| Listar candidaturas                        |      Nao       |  Sim  |  Sim  | Restr. |
| Consultar candidatura                      |      Nao       |  Sim  |  Sim  | Restr. |
| Movimentar pipeline                        |      Nao       |  Sim  |  Sim  |  Nao   |
| Retirar candidatura                        |      Nao       |  Sim  |  Sim  |  Nao   |
| Rejeitar candidatura                       |      Nao       |  Sim  |  Sim  |  Nao   |
| Marcar contratacao da candidatura          |      Nao       |  Sim  |  Nao  |  Nao   |
| Cancelar candidatura                       |      Nao       |  Sim  |  Sim  |  Nao   |
| Registrar nota interna                     |      Nao       |  Sim  |  Sim  |  Nao   |
| Consultar nota interna                     |      Nao       |  Sim  |  Sim  |  Nao   |
| Consultar historico                        |      Nao       |  Sim  |  Sim  |  Nao   |
| Leitura administrativa auditada com motivo |      Sim       |  Nao  |  Nao  |  Nao   |
| Operar funcionalmente candidatura          |      Nao       |  Sim  |  Sim  |  Nao   |

Owner pode criar, listar, consultar, movimentar pipeline, retirar, rejeitar,
marcar contratacao, cancelar, registrar notas internas e consultar historico da
Organization ativa.

Admin pode criar, listar, consultar, movimentar pipeline, retirar, rejeitar,
cancelar, registrar notas internas e consultar historico da Organization ativa.
Admin nao marca `hired` nesta fase.

Member pode visualizar somente candidaturas `active`.

O DTO de member deve conter exclusivamente:

- `id` da CandidateApplication;
- `application_status`;
- `current_stage`;
- `applied_at`;
- `candidate.id`;
- `candidate.full_name`;
- `candidate.preferred_name`;
- `job_opening.id`;
- `job_opening.title` interno;
- `job_opening_version.id`;
- `job_opening_version.public_title`;
- `job_opening_version.version_number`.

Member nao pode visualizar:

- e-mail;
- telefones;
- localizacao detalhada;
- salario pretendido;
- consentimento;
- observacoes do Candidate;
- notas da candidatura;
- historico de eventos;
- motivos de finalizacao;
- auditoria;
- autoria interna;
- dados completos da Vaga;
- faixa salarial da Vaga;
- instrucoes internas;
- qualquer campo fora da lista positiva.

Member nao cria, altera, movimenta, cancela, retira, rejeita, marca contratacao,
registra notas, consulta candidaturas finalizadas ou consulta timeline ou
historico administrativo.

Platform Admin nao opera funcionalmente e nao recebe permissao de Membership.
Platform Admin consulta administrativamente somente com motivo, auditoria e DTO
minimizado.

## 13. Organization Arquivada

Quando a Organization estiver `archived`:

- owner, admin e member nao criam candidaturas;
- owner, admin e member nao movimentam pipeline;
- owner, admin e member nao alteram estado de candidatura;
- owner, admin e member nao consultam operacionalmente;
- dados e historico permanecem preservados;
- Platform Admin consulta somente administrativamente, com motivo e auditoria.

Nenhuma candidatura nova pode ser criada para Organization arquivada.

## 14. API Conceitual

| Operacao                        | Finalidade                                          |
| ------------------------------- | --------------------------------------------------- |
| Criar candidatura               | Criar CandidateApplication para Candidate e Vaga.   |
| Listar candidaturas             | Listar candidaturas permitidas da Organization.     |
| Consultar candidatura           | Obter candidatura permitida.                        |
| Movimentar etapa                | Registrar mudanca de etapa no historico.            |
| Retirar candidatura             | Alterar estado para `withdrawn`.                    |
| Rejeitar candidatura            | Alterar estado para `rejected`.                     |
| Marcar contratacao              | Alterar estado para `hired`.                        |
| Cancelar candidatura            | Alterar estado para `cancelled`.                    |
| Registrar nota interna          | Criar nota interna vinculada a candidatura.         |
| Listar notas internas           | Consultar notas internas permitidas.                |
| Consultar historico             | Consultar eventos permitidos da candidatura.        |
| Leitura administrativa auditada | Consulta excepcional por Platform Admin com motivo. |

Todas as operacoes devem validar no servidor:

- `organizationId`;
- `candidateApplicationId`;
- `candidateId`;
- `jobOpeningId`;
- `jobOpeningVersionId`;
- User ativo;
- Membership ativo;
- Organization ativa;
- role autorizada;
- Organization comum entre todos os registros.

## 15. Interface

Interface minima prevista:

- listagem de candidaturas;
- criacao de candidatura a partir de Candidate e Job Opening;
- exibicao do Candidate vinculado;
- exibicao da Vaga vinculada;
- exibicao da Job Opening Version vinculada;
- status da candidatura;
- etapa atual;
- origem da candidatura;
- data de candidatura;
- movimentacao de etapa;
- notas internas para owner/admin;
- retirada;
- rejeicao;
- contratacao da candidatura;
- cancelamento;
- historico;
- mensagens claras de permissao.

Nao implementar:

- pipeline detalhado;
- entrevistas;
- IA;
- avaliacoes;
- propostas;
- onboarding;
- contratacao real;
- ranking;
- score.

A interface pode ocultar ou desabilitar acoes nao permitidas, mas o servidor
continua sendo a autoridade final.

## 16. Banco Conceitual

Quando implementada, a funcionalidade deve prever minimamente:

- `candidate_applications`;
- `candidate_application_events`.
- `candidate_application_notes`.

Esta SPEC nao define SQL.

### 16.1 `candidate_applications`

Campos minimos:

- `id`;
- `organization_id`;
- `candidate_id`;
- `job_opening_id`;
- `job_opening_version_id`;
- `status`;
- `current_stage`;
- `source`;
- `applied_at`;
- `finalized_at`;
- `finalized_by_user_id`;
- `finalization_reason`;
- `created_by_user_id`;
- `updated_by_user_id`;
- `created_at`;
- `updated_at`;

Restricoes esperadas:

- `organization_id` obrigatorio;
- Candidate da mesma Organization;
- Job Opening da mesma Organization;
- Job Opening Version da mesma Organization;
- Job Opening Version pertencente a Job Opening informada;
- Job Opening Version `published`;
- bloqueio de mudanca de `organization_id`;
- bloqueio de mudanca de `candidate_id`;
- bloqueio de mudanca de `job_opening_id`;
- bloqueio de mudanca de `job_opening_version_id`;
- status limitado aos valores canonicos;
- `current_stage` limitado as etapas minimas canonicas;
- apenas uma candidatura `active` por Candidate + Job Opening na mesma
  Organization;
- protecao contra criacao concorrente de candidatura ativa duplicada;
- ausencia de cascade destrutivo;
- indices para Organization, Candidate, Job Opening, Job Opening Version e
  status.

### 16.2 `candidate_application_events`

Campos minimos:

- `id`;
- `organization_id`;
- `candidate_application_id`;
- `event_type`;
- `stage_before`;
- `stage_after`;
- `status_before`;
- `status_after`;
- actor;
- motivo;
- `created_by_user_id`;
- `created_at`.

Restricoes esperadas:

- `organization_id` obrigatorio;
- evento pertence a candidatura da mesma Organization;
- tipo de evento canonico;
- evento imutavel;
- ausencia de cascade destrutivo;
- indices para Organization, candidatura, tipo e data.

### 16.3 `candidate_application_notes`

Campos minimos:

- `id`;
- `organization_id`;
- `candidate_application_id`;
- `content`;
- `created_by_user_id`;
- `updated_by_user_id`;
- `created_at`;
- `updated_at`.

Restricoes esperadas:

- `organization_id` obrigatorio;
- nota pertence a candidatura da mesma Organization;
- acesso restrito a owner/admin;
- member nao visualiza;
- Platform Admin nao cria nem altera;
- auditoria nao registra conteudo completo;
- ausencia de cascade destrutivo;
- ausencia de exclusao fisica.

### 16.4 Integridade

Garantir:

- FKs validas;
- ausencia de FK com cascade destrutivo;
- Organization comum entre Candidate, Job Opening, Job Opening Version,
  CandidateApplication e eventos;
- checks de status;
- checks de current_stage;
- checks de tipo de evento;
- restricao de uma candidatura ativa por Candidate + Job Opening;
- triggers ou restricoes para imutabilidade dos vinculos principais;
- queries parametrizadas;
- migrations reproduziveis quando houver implementacao;
- ausencia de exclusao fisica.

## 17. Seguranca

- Validar no servidor todos os IDs recebidos.
- Validar User ativo.
- Validar Membership ativo.
- Validar Organization ativa.
- Validar role autorizada.
- Validar Candidate ativo.
- Validar consentimento operacional do Candidate.
- Bloquear novas acoes operacionais quando consentimento estiver `pending`,
  `revoked` ou `expired`, exceto encerramentos administrativos previstos.
- Validar Job Opening.
- Validar Job Opening Version publicada.
- Validar Organization comum entre todos os registros.
- Bloquear candidatura cruzando Organizations.
- Bloquear manipulacao de IDs.
- Bloquear alteracao de vinculos imutaveis.
- Bloquear retorno de estado final para `active`.
- Bloquear candidatura ativa duplicada por Candidate + Job Opening.
- Proteger dados pessoais do Candidate em respostas.
- Aplicar minimizacao de dados para member e Platform Admin.
- Mensagens de erro para acesso cruzado devem ser genericas.
- Nao registrar dados pessoais completos em logs.
- Nao registrar tokens, headers, senhas, connection strings ou segredos.
- Usar queries parametrizadas.
- Proteger contra mass assignment.
- Tratar respostas, curriculos, etapas e textos futuros como dados, nunca como
  instrucoes para IA.

## 18. Auditoria

Eventos obrigatorios:

- `candidate_application.created`;
- `candidate_application.stage_moved`;
- `candidate_application.cancelled`;
- `candidate_application.withdrawn`;
- `candidate_application.hired`;
- `candidate_application.rejected`;
- `candidate_application.note_created`;
- `candidate_application.cross_organization_access_denied`;
- `candidate_application.permission_denied`;
- `candidate_application.administrative_read`.

Nao registrar:

- perfil completo do Candidate;
- e-mail completo quando desnecessario;
- telefones completos;
- endereco completo;
- salario pretendido;
- consentimento completo;
- conteudo completo da Vaga;
- perguntas completas;
- respostas futuras completas;
- observacoes internas completas;
- tokens;
- headers;
- segredos.

Auditoria critica em criacao, movimentacao, cancelamento, retirada, rejeicao e
contratacao da candidatura deve causar rollback quando falhar. Criacao de nota
interna deve registrar auditoria sem conteudo completo.

## 19. Criterios de Aceite

- CA-001: Criar candidatura em Organization ativa.
- CA-002: Uma candidatura pertence a uma unica Organization.
- CA-003: Candidate e Job Opening pertencem a mesma Organization.
- CA-004: Candidate de outra Organization e recusado.
- CA-005: Job Opening de outra Organization e recusada.
- CA-006: Job Opening Version pertence a mesma Organization.
- CA-007: Job Opening Version pertence a Job Opening informada.
- CA-008: Job Opening Version precisa ser `published`.
- CA-009: Job Opening Version `draft` e recusada.
- CA-010: Vaga encerrada e recusada para nova candidatura.
- CA-011: Vaga cancelada e recusada para nova candidatura.
- CA-012: Candidate inativo e recusado para nova candidatura.
- CA-013: Consentimento invalido bloqueia nova candidatura.
- CA-014: Consentimento `pending`, `revoked` ou `expired` bloqueia novas acoes
  operacionais, exceto encerramentos administrativos previstos.
- CA-015: Candidate inativado apos criacao preserva candidatura existente.
- CA-016: Fechar a Vaga impede novas candidaturas e nao altera automaticamente
  candidaturas existentes.
- CA-017: Apenas uma candidatura `active` existe por Candidate + Job Opening.
- CA-018: Criacao concorrente de candidatura duplicada e bloqueada.
- CA-019: `application_status` e `current_stage` sao campos distintos.
- CA-020: `active` e o unico estado nao final.
- CA-021: Estados finais nunca retornam para `active`.
- CA-022: Toda finalizacao preenche `finalized_at`.
- CA-023: Toda finalizacao preenche `finalized_by_user_id`.
- CA-024: Toda finalizacao preenche `finalization_reason`.
- CA-025: `hired` somente pode ser registrado por owner.
- CA-026: `hired` nao cria contratacao, colaborador ou onboarding.
- CA-027: CandidateApplication nunca muda `candidate_id`.
- CA-028: CandidateApplication nunca muda `job_opening_id`.
- CA-029: CandidateApplication nunca muda `job_opening_version_id`.
- CA-030: CandidateApplication nunca muda `organization_id`.
- CA-031: Republicacao futura da Vaga nao altera candidatura existente.
- CA-032: Candidate nao recebe etapa, score, ranking, recomendacao ou decisao.
- CA-033: Job Opening nao recebe candidatos nem etapa de candidato.
- CA-034: Pipeline pertence a CandidateApplication.
- CA-035: Pipeline minimo inicia em `applied`.
- CA-036: Pipeline permite avanco por owner/admin.
- CA-037: Pipeline permite retorno por owner/admin.
- CA-038: Salto de etapa exige motivo obrigatorio.
- CA-039: Movimentacao de pipeline ocorre em transacao.
- CA-040: Pipeline gera eventos.
- CA-041: Historico e imutavel.
- CA-042: Historico registra etapa anterior, etapa nova, usuario, data e motivo
  opcional.
- CA-043: Historico de salto registra motivo obrigatorio.
- CA-044: Nenhuma movimentacao e apagada.
- CA-045: `candidate_application_events` registra `event_type`, `stage_before`,
  `stage_after`, `status_before`, `status_after`, actor, motivo e `created_at`.
- CA-046: Notas pertencem a `CandidateApplication`.
- CA-047: Notas nao pertencem ao Candidate.
- CA-048: Member nao visualiza notas.
- CA-049: Platform Admin nao cria nem altera notas.
- CA-050: Competencias sao referenciadas por `competency_catalog_items.id`.
- CA-051: Perguntas sao referenciadas por `question_catalog_items.id`.
- CA-052: Platform Admin nao opera funcionalmente.
- CA-053: Platform Admin consulta administrativamente com motivo.
- CA-054: Member visualiza somente candidaturas `active`.
- CA-055: DTO do member contem somente `id`, `application_status`,
  `current_stage`, `applied_at`, `candidate.id`, `candidate.full_name`,
  `candidate.preferred_name`, `job_opening.id`, `job_opening.title`,
  `job_opening_version.id`, `job_opening_version.public_title` e
  `job_opening_version.version_number`.
- CA-056: DTO do member nao inclui e-mail, telefones, localizacao detalhada,
  salario pretendido, consentimento, observacoes do Candidate, notas da
  candidatura, historico de eventos, motivos de finalizacao, auditoria, autoria
  interna, dados completos da Vaga, faixa salarial da Vaga, instrucoes internas,
  score, ranking ou recomendacao.
- CA-057: Member nao movimenta, cancela, retira, rejeita ou contrata
  candidatura.
- CA-058: Member nao consulta candidaturas finalizadas.
- CA-059: Member nao consulta timeline ou historico administrativo.
- CA-060: Organization arquivada bloqueia operacoes normais.
- CA-061: Acesso cruzado e recusado sem revelar existencia.
- CA-062: Auditoria registra criacao.
- CA-063: Auditoria registra movimentacao.
- CA-064: Auditoria registra cancelamento.
- CA-065: Auditoria registra retirada.
- CA-066: Auditoria registra contratacao.
- CA-067: Auditoria registra rejeicao.
- CA-068: Auditoria registra acessos negados.
- CA-069: Auditoria registra leitura administrativa.
- CA-070: Auditoria nao registra dados pessoais completos.
- CA-071: Falha de auditoria critica causa rollback.
- CA-072: Movimentacoes concorrentes nao sobrescrevem historico.
- CA-073: Persistencia permanece apos recriar aplicacao.
- CA-074: Nao existe exclusao fisica de candidaturas.
- CA-075: Nao existe exclusao fisica de eventos.
- CA-076: Nao existe exclusao fisica de notas.
- CA-077: Nenhum modulo futuro e criado antecipadamente.

## 20. Testes Obrigatorios

Quando implementada, a funcionalidade deve possuir testes para:

1. criar candidatura;
2. candidatura pertencer a uma unica Organization;
3. Candidate e Job Opening da mesma Organization;
4. Candidate de outra Organization;
5. Job Opening de outra Organization;
6. Job Opening Version de outra Organization;
7. Job Opening Version de outra Job Opening;
8. versao `draft` recusada;
9. ausencia de versao publicada;
10. vaga encerrada;
11. vaga cancelada;
12. Candidate inativo;
13. consentimento `pending`;
14. consentimento `revoked`;
15. consentimento `expired`;
16. consentimento expirado por data;
17. consentimento revogado impedir movimentacao operacional comum;
18. consentimento revogado permitir encerramento administrativo previsto;
19. candidatura duplicada ativa recusada;
20. candidatura duplicada apos estado final conforme regra da fase;
21. criacao concorrente do mesmo Candidate + Job Opening;
22. criacao registrar evento inicial;
23. criacao registrar auditoria;
24. CandidateApplication nunca mudar Candidate;
25. CandidateApplication nunca mudar Job Opening;
26. CandidateApplication nunca mudar Job Opening Version;
27. CandidateApplication nunca mudar Organization;
28. mass assignment de vinculos imutaveis;
29. republicacao futura da Vaga nao alterar candidatura existente;
30. fechamento da Vaga nao alterar candidatura existente;
31. `application_status` separado de `current_stage`;
32. `active` unico estado nao final;
33. estado final nao retornar para `active`;
34. pipeline iniciar em `applied`;
35. movimentar etapa por avanco;
36. movimentar etapa por retorno;
37. salto de etapa sem motivo recusado;
38. salto de etapa com motivo aceito para owner/admin;
39. movimentacao registrar etapa anterior;
40. movimentacao registrar etapa nova;
41. movimentacao registrar usuario;
42. movimentacao registrar data;
43. movimentacao registrar motivo opcional;
44. movimentacao registrar motivo obrigatorio em salto;
45. movimentacoes concorrentes;
46. evento conter `event_type`;
47. evento conter `stage_before` e `stage_after`;
48. evento conter `status_before` e `status_after`;
49. evento conter actor;
50. evento conter motivo;
51. evento conter `created_at`;
52. evento ser imutavel;
53. criar nota interna;
54. nota pertencer a candidatura;
55. nota nao aparecer em Candidate;
56. member nao visualizar notas;
57. Platform Admin nao criar nota;
58. auditoria de nota sem conteudo completo;
59. cancelamento;
60. retirada;
61. rejeicao;
62. contratacao da candidatura;
63. estado final bloquear nova movimentacao operacional;
64. historico preservado;
65. tentativa de apagar historico recusada;
66. ausencia de exclusao fisica de candidatura;
67. ausencia de exclusao fisica de eventos;
68. ausencia de exclusao fisica de notas;
69. Platform Admin tentando criar;
70. Platform Admin tentando movimentar;
71. Platform Admin tentando cancelar;
72. Platform Admin tentando retirar;
73. Platform Admin tentando rejeitar;
74. Platform Admin tentando contratar;
75. Platform Admin tentando criar nota;
76. Platform Admin consultar administrativamente com motivo;
77. Platform Admin sem motivo ser recusado;
78. member nao operar;
79. member somente leitura restrita para candidaturas `active`;
80. DTO do member sem notas;
81. DTO do member sem historico administrativo;
82. DTO do member sem dados pessoais sensiveis;
83. DTO do member sem score, ranking ou recomendacao;
84. User sem Membership;
85. Membership inativo;
86. User inativo;
87. Organization arquivada;
88. acesso cruzado;
89. manipulacao de IDs;
90. auditoria sem dados pessoais completos;
91. rollback por auditoria em criacao;
92. rollback por auditoria em movimentacao;
93. rollback por auditoria em cancelamento;
94. rollback por auditoria em retirada;
95. rollback por auditoria em rejeicao;
96. rollback por auditoria em contratacao;
97. rollback por auditoria em nota;
98. persistencia apos recriar aplicacao;
99. nenhuma tabela, rota ou servico de IA criado;
100. nenhuma tabela, rota ou servico de entrevista criado;
101. nenhuma tabela, rota ou servico de proposta criado;
102. nenhum ranking ou score criado.

Testes adicionais obrigatorios para consentimento invalido apos criacao:

- avanco bloqueado com consentimento `pending`;
- avanco bloqueado com consentimento `revoked`;
- avanco bloqueado com consentimento `expired`;
- retorno bloqueado com consentimento invalido;
- salto bloqueado com consentimento invalido;
- marcacao como `hired` bloqueada com consentimento invalido;
- nota operacional bloqueada com consentimento invalido;
- retirada permitida com consentimento invalido e motivo;
- cancelamento permitido com consentimento invalido e motivo;
- rejeicao administrativa permitida com consentimento invalido e motivo;
- historico preservado apos consentimento invalido;
- candidatura, eventos e notas existentes nao apagados.

Testes adicionais obrigatorios para DTO de member:

- member lista somente candidaturas `active`;
- member nao consulta candidaturas finalizadas;
- DTO do member contem exatamente a lista positiva permitida;
- DTO do member nao contem e-mail;
- DTO do member nao contem telefones;
- DTO do member nao contem localizacao detalhada;
- DTO do member nao contem salario pretendido;
- DTO do member nao contem consentimento;
- DTO do member nao contem observacoes do Candidate;
- DTO do member nao contem notas da candidatura;
- DTO do member nao contem historico de eventos;
- DTO do member nao contem motivos de finalizacao;
- DTO do member nao contem auditoria;
- DTO do member nao contem autoria interna;
- DTO do member nao contem dados completos da Vaga;
- DTO do member nao contem faixa salarial da Vaga;
- DTO do member nao contem instrucoes internas;
- member nao consulta timeline ou historico administrativo.

Testes adicionais obrigatorios para finalizacao:

- `withdrawn` exige motivo;
- `withdrawn` preenche `finalized_at`, `finalized_by_user_id` e
  `finalization_reason`;
- `rejected` exige motivo;
- `rejected` preenche `finalized_at`, `finalized_by_user_id` e
  `finalization_reason`;
- `cancelled` exige motivo;
- `cancelled` preenche `finalized_at`, `finalized_by_user_id` e
  `finalization_reason`;
- `hired` exige motivo ou referencia administrativa;
- `hired` e permitido somente para owner;
- admin nao marca `hired`;
- `hired` nao cria contratacao, colaborador ou onboarding;
- candidatura em `completed` permanece `active` ate finalizacao explicita;
- candidatura finalizada nao muda de etapa.

Testes adicionais obrigatorios de concorrencia:

- duas mudancas de etapa simultaneas;
- mudanca de etapa concorrendo com rejeicao;
- contratacao concorrendo com cancelamento;
- criacao concorrente da mesma candidatura ativa;
- segunda operacao concorrente incompativel recebe conflito seguro.

## 21. Limitacoes

- Esta SPEC nao implementa codigo.
- Esta SPEC nao cria banco, migrations, rotas, testes ou dependencias.
- Pipeline detalhado nao e definido.
- Apenas o pipeline minimo e definido.
- Nao ha candidatura publica.
- Nao ha entrevistas.
- Nao ha respostas de questionarios.
- Nao ha avaliacoes.
- Nao ha IA.
- Nao ha matching.
- Nao ha ranking.
- Nao ha score.
- Nao ha propostas.
- Nao ha onboarding.
- Nao ha contratacao.
- Nao ha colaborador criado a partir da candidatura.
- Nao ha exclusao fisica.
- Member fica restrito ao DTO positivo definido nesta SPEC.

## 22. Definicao de Concluido

Para a implementacao futura desta SPEC:

- SPEC aprovada antes do desenvolvimento;
- ADR-0014 aceita ou ajustada;
- criterios de aceite atendidos;
- testes obrigatorios implementados e passando;
- testes de seguranca passando;
- testes de acesso cruzado passando;
- testes de concorrencia e transacao passando;
- rollback de auditoria critica verificado;
- regras de seguranca verificadas;
- migrations reproduziveis quando houver banco;
- lint passando;
- formatacao passando;
- build passando;
- documentacao atualizada;
- auditoria revisada;
- nenhuma funcionalidade futura implementada antecipadamente;
- commit realizado.
