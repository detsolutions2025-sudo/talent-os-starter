# SPEC-017 - Desenvolvimento e Retencao

**Status:** Aprovada  
**Versao:** 1.0  
**Fase:** 25  
**Responsavel de negocio:** Thiago Sousa  
**Dependencias conceituais:** SPEC-025 - OrganizationPerson e Employment, ADR-0024 - Identidade e Vinculo Pos-Contratacao, SPEC-003 - Membership, SPEC-004 - Roles & Permissions, SPEC-011 - Candidatos, SPEC-012 - Processo Seletivo, SPEC-015 - Propostas, SPEC-016 - Onboarding, SPEC-018 - Blueprint Organizacional / Implantacao Guiada, ADR-0020, ADR-0023  
**Ultima atualizacao:** 2026-08-16

**Nota de revisao destrutiva (v1.0):** esta versao substitui o rascunho v0.1 e
fecha as decisoes normativas da Fase 25 contra ADR-0024 e SPEC-025. Employment
e o aggregate root operacional unico de Desenvolvimento e Retencao. Candidate,
CandidateApplication, Proposal, Onboarding, User, Membership e
OrganizationPerson nao substituem Employment.

## 1. Objetivo

Definir a capacidade minima de Desenvolvimento e Retencao v1 do Talent OS,
limitada a registros humanos, explicitos, auditaveis e vinculados a
`Employment`.

Esta SPEC nao cria HRIS completo. Ela define:

- plano de desenvolvimento;
- objetivos de desenvolvimento;
- check-ins de acompanhamento;
- preocupacoes de retencao registradas por pessoa autorizada;
- acoes de retencao humanas e explicitas.

## 2. Fora do Escopo

Estao fora da v1:

- Performance Management formal;
- avaliacao 360;
- rating de performance;
- promocao;
- sucessao;
- remuneracao;
- beneficios;
- folha;
- ponto;
- treinamento/LMS completo;
- PDI com IA;
- pesquisas complexas;
- people analytics avancado;
- offboarding;
- encerramento juridico ou trabalhista;
- criacao, ativacao, encerramento, cancelamento ou reabertura de Employment;
- criacao automatica de User, Membership, Candidate, CandidateApplication,
  Proposal ou Onboarding.

## 3. Sujeito do Dominio

`Employment` e o aggregate root operacional obrigatorio para todos os registros
funcionais desta SPEC.

Regras:

- toda entidade funcional da SPEC-017 pertence a um `Employment`;
- `OrganizationPerson` agrupa a identidade humana dentro da Organization, mas
  nao recebe estado operacional de desenvolvimento ou retencao;
- `Candidate` e somente provenance historica;
- `CandidateApplication` e somente provenance historica;
- `Proposal` e somente provenance historica;
- `Onboarding` e somente contexto historico ou operacional opcional;
- `User` e `Membership` sao somente acesso, autorizacao e autoria;
- nenhuma entidade funcional pertence diretamente apenas a Candidate,
  CandidateApplication, Proposal, Onboarding, User ou Membership.

Se `Employment` nao existir, qualquer operacao funcional da SPEC-017 deve ser
bloqueada.

## 4. Estados de Employment e Elegibilidade

A SPEC-017 respeita os estados definidos pela SPEC-025 e nunca transiciona
Employment.

| Estado de Employment | Leitura | Mutacao funcional | Regra |
| --- | --- | --- | --- |
| `pending` | Administrativa de contexto | Bloqueada, salvo preparacao explicita futura fora da v1 | Nao registra desenvolvimento/retencao normal. |
| `active` | Permitida conforme RBAC | Permitida conforme RBAC | Unico estado com operacoes funcionais normais. |
| `ended` | Historica | Bloqueada | Preserva historico; nao aceita novo plano, goal, check-in, concern ou action. |
| `cancelled` | Historica minima | Bloqueada | Vinculo nunca chegou a active; nao ha atividade funcional. |

A v1 nao permite preparacao funcional em `pending`. A leitura de contexto em
`pending` serve apenas para operacao administrativa autorizada.

## 5. Modelo Conceitual Final

Entidades mantidas na v1:

- `DevelopmentPlan`;
- `DevelopmentGoal`;
- `DevelopmentCheckIn`;
- `RetentionConcern`;
- `RetentionAction`.

Entidades removidas ou explicitamente fora da v1:

- `DevelopmentAction`, porque o objetivo e o check-in cobrem a operacao minima;
- entidade de LMS, curso, trilha, certificado ou conteudo;
- entidade de Performance;
- entidade de score/ranking;
- entidade de autosservico da pessoa;
- entidade de offboarding.

## 6. DevelopmentPlan

`DevelopmentPlan` representa um plano humano de desenvolvimento para um
Employment ativo.

Pertence a:

- `Organization`;
- `Employment`.

Campos conceituais minimos:

- `organization_id`;
- `employment_id`;
- `title`;
- `purpose`;
- `status`;
- `created_by_membership_id`;
- `activated_by_membership_id`;
- `completed_by_membership_id`;
- `cancelled_by_membership_id`;
- `created_at`;
- `activated_at`;
- `completed_at`;
- `cancelled_at`;
- `cancel_reason`.

Status:

- `draft`;
- `active`;
- `completed`;
- `cancelled`;
- `closed_due_to_employment_end`.

State machine:

- `draft -> active`;
- `draft -> cancelled`;
- `active -> completed`;
- `active -> cancelled`;
- `active -> closed_due_to_employment_end`;
- `draft -> closed_due_to_employment_end`.

Estados finais nao reabrem.

Cardinalidade v1:

- `Employment 1:N DevelopmentPlan`;
- no maximo um `DevelopmentPlan` nao final (`draft` ou `active`) por
  Employment;
- essa restricao e regra da v1 e nao uma decisao irreversivel para sempre.

Ativacao:

- somente owner/admin;
- exige Employment `active`;
- exige Organization ativa;
- exige auditoria critica.

Conclusao:

- somente owner/admin;
- exige todos os goals nao cancelados em estado final;
- nao gera score.

Cancelamento:

- somente owner/admin;
- exige motivo minimizado;
- preserva historico.

## 7. DevelopmentGoal

`DevelopmentGoal` representa um objetivo de desenvolvimento dentro de um plano.

Pertence a:

- `Organization`;
- `Employment`;
- `DevelopmentPlan`.

Campos conceituais minimos:

- `organization_id`;
- `employment_id`;
- `development_plan_id`;
- `title`;
- `description`;
- `due_date`;
- `status`;
- `created_by_membership_id`;
- `completed_by_membership_id`;
- `cancelled_by_membership_id`;
- `created_at`;
- `completed_at`;
- `cancelled_at`;
- `cancel_reason`.

Status:

- `open`;
- `completed`;
- `cancelled`.

State machine:

- `open -> completed`;
- `open -> cancelled`.

Estados finais nao reabrem.

Regras:

- goal so pode ser criado em plano `draft` ou `active`;
- goal novo exige Employment `active`;
- goal nao e KPI corporativo;
- goal nao e meta comercial;
- goal nao recebe nota, rating, score ou ranking;
- goal pode ter prazo opcional;
- texto deve ser minimizado e relacionado ao desenvolvimento.

## 8. DevelopmentCheckIn

`DevelopmentCheckIn` representa um acompanhamento humano e explicito sobre um
plano de desenvolvimento.

Pertence a:

- `Organization`;
- `Employment`;
- `DevelopmentPlan`.

Campos conceituais minimos:

- `organization_id`;
- `employment_id`;
- `development_plan_id`;
- `summary`;
- `submitted_by_membership_id`;
- `submitted_at`;
- `visibility`.

State machine:

- `submitted` e estado unico/final.

Regras:

- somente pode ser criado quando Employment esta `active`;
- somente pode ser criado para plano `active`;
- nao pode ser editado apos submissao;
- correcao futura exige novo check-in ou evento de auditoria especifico;
- `summary` deve ter finalidade, limite de tamanho, autoria e visibilidade;
- nao pode conter diagnostico psicologico, dado de saude, dado familiar,
  investigacao disciplinar ou nota secreta irrestrita.

## 9. Definicao Normativa de Retencao

Retencao v1 significa acoes humanas e registros operacionais explicitos
destinados a acompanhar condicoes de permanencia e tratar questoes levantadas
por pessoas ou atores autorizados.

Retencao v1 nao e predicao, score, vigilancia ou classificacao automatica.

Sao proibidos:

- flight risk score;
- retention score;
- probability of leaving;
- ranking de pessoas;
- classificacao automatica high/medium/low risk;
- previsao de desligamento;
- inferencia psicologica;
- vigilancia;
- scraping de comportamento;
- inferencia por absenteismo;
- recomendacao automatica de retencao;
- recomendacao automatica de demissao;
- recomendacao automatica de promocao.

## 10. RetentionConcern

`RetentionConcern` representa uma preocupacao de retencao explicitamente
registrada por ator humano autorizado.

Pertence a:

- `Organization`;
- `Employment`.

Campos conceituais minimos:

- `organization_id`;
- `employment_id`;
- `source`;
- `category`;
- `description`;
- `status`;
- `visibility`;
- `created_by_membership_id`;
- `resolved_by_membership_id`;
- `cancelled_by_membership_id`;
- `created_at`;
- `resolved_at`;
- `cancelled_at`;
- `resolution_summary`;
- `cancel_reason`.

Sources permitidas:

- `person_explicit_statement`;
- `human_observation`;
- `development_check_in`;
- `administrative_decision`.

Sources proibidas:

- comportamento inferido automaticamente;
- dados de saude;
- dados familiares;
- dados de navegacao;
- uso do sistema;
- e-mail ou mensagens privadas;
- dados nao declarados;
- IA.

Categorias v1:

- `career_growth`;
- `work_context`;
- `management_attention`;
- `role_fit`;
- `other_minimized`.

Status:

- `open`;
- `resolved`;
- `cancelled`.

State machine:

- `open -> resolved`;
- `open -> cancelled`.

Estados finais nao reabrem.

Regras:

- nunca e gerado automaticamente;
- nunca usa palavra `risk` como score;
- descricao deve ser minimizada;
- visibilidade deve ser explicita;
- resolucao deve registrar somente resumo operacional necessario.

## 11. RetentionAction

`RetentionAction` representa uma acao humana explicita associada a retencao.

Pertence a:

- `Organization`;
- `Employment`;
- opcionalmente `RetentionConcern`.

Campos conceituais minimos:

- `organization_id`;
- `employment_id`;
- `retention_concern_id`;
- `action_type`;
- `description`;
- `status`;
- `created_by_membership_id`;
- `completed_by_membership_id`;
- `cancelled_by_membership_id`;
- `created_at`;
- `completed_at`;
- `cancelled_at`;
- `cancel_reason`.

Tipos v1:

- `conversation`;
- `follow_up`;
- `role_context_review`;
- `development_alignment`;
- `administrative_support`;
- `other_minimized`.

Status:

- `open`;
- `completed`;
- `cancelled`.

State machine:

- `open -> completed`;
- `open -> cancelled`.

Estados finais nao reabrem.

Regras:

- pode existir sem `RetentionConcern` quando a acao humana e suficiente;
- nao cria promocao, aumento, desligamento, investigacao ou decisao automatica;
- nao altera Employment;
- nao altera OrganizationPerson;
- nao altera Candidate, CandidateApplication, Proposal ou Onboarding.

## 12. Performance

Performance Management formal esta fora da SPEC-017 v1.

Feedback em check-in deve ser acompanhamento de desenvolvimento, nao avaliacao
formal de performance.

Sao proibidos nesta SPEC:

- `performance_score`;
- `overall_rating`;
- `promotion_score`;
- `potential_score`;
- nine-box;
- forced ranking;
- ranking comparativo de pessoas.

Se Performance formal for necessaria futuramente, deve haver nova SPEC.

## 13. Blueprint e Competencias

Competencias podem ser contexto opcional somente quando houver referencia
versionada e estavel do Blueprint ou Catalogo de Competencias.

Regras:

- nao usar Blueprint ativo atual retroativamente;
- nao recalcular historico quando Blueprint mudar;
- nao criar score agregado de competencias;
- nao alterar Employment com competencia;
- nao copiar dados amplos do Blueprint para DevelopmentPlan ou Goal;
- se a competencia referenciada nao tiver versao estavel, manter apenas texto
  minimizado no objetivo.

## 14. Autosservico da Pessoa

A v1 nao possui autosservico da propria pessoa do Employment.

Regras:

- a pessoa do Employment nao recebe User automatico;
- a pessoa do Employment nao recebe Membership automatico;
- nao ha portal proprio nesta SPEC;
- nao ha token publico;
- operacoes funcionais sao internas e executadas por owner/admin/member
  autorizado;
- acesso proprio futuro exige SPEC propria ou extensao normativa explicita.

## 15. RBAC

Toda operacao exige User ativo, Membership ativa na Organization atual e role
autorizada.

| Operacao | Owner | Admin | Member | Pessoa do Employment | Platform Admin |
| --- | --- | --- | --- | --- | --- |
| Criar plano | Sim | Sim | Nao | Nao | Nao |
| Editar plano draft | Sim | Sim | Nao | Nao | Nao |
| Ativar plano | Sim | Sim | Nao | Nao | Nao |
| Completar plano | Sim | Sim | Nao | Nao | Nao |
| Cancelar plano | Sim | Sim | Nao | Nao | Nao |
| Criar goal | Sim | Sim | Somente se explicitamente autorizado no plano | Nao | Nao |
| Completar goal | Sim | Sim | Somente se explicitamente autorizado no plano | Nao | Nao |
| Cancelar goal | Sim | Sim | Somente se explicitamente autorizado no plano | Nao | Nao |
| Criar check-in | Sim | Sim | Somente se explicitamente autorizado no plano | Nao | Nao |
| Criar concern | Sim | Sim | Nao | Nao | Nao |
| Resolver/cancelar concern | Sim | Sim | Nao | Nao | Nao |
| Criar retention action | Sim | Sim | Nao | Nao | Nao |
| Completar/cancelar retention action | Sim | Sim | Nao | Nao | Nao |
| Leitura historica autorizada | Sim | Sim | Somente escopo atribuido | Nao | Admin-read minimizado |

Platform Admin:

- nao possui permissao funcional;
- pode realizar leitura administrativa minimizada;
- exige motivo obrigatorio;
- exige auditoria;
- nao cria, altera, conclui, cancela ou resolve registros funcionais.

## 16. Privacidade e Lista Positiva

Dados permitidos:

- identificadores internos de Organization, Employment e registros da propria
  SPEC;
- titulo e finalidade de plano;
- titulo e descricao minimizada de goal;
- resumo minimizado de check-in;
- categoria e descricao minimizada de concern;
- descricao minimizada de action;
- status, datas, autoria, visibilidade e auditoria.

Dados proibidos:

- dados medicos;
- diagnostico;
- saude mental;
- religiao;
- raca ou etnia, salvo dominio proprio e base legal futura;
- orientacao sexual;
- gravidez;
- dependentes;
- familia;
- dados bancarios;
- documentos pessoais;
- remuneracao;
- conteudo disciplinar;
- conteudo de investigacao;
- inferencia psicologica;
- notas secretas irrestritas.

Nao criar campo `notes` generico. Todo texto livre deve ter finalidade, limite
de tamanho, autor, timestamps, protecao e regra de visibilidade.

## 17. IA

A v1 tem zero IA.

Sao proibidos:

- AIGateway;
- provider;
- model;
- prompt;
- AI Execution;
- `ai_execution`;
- sumarizacao automatica;
- recommendation;
- retention prediction;
- ranking;
- scoring;
- recomendacao automatica de carreira;
- recomendacao automatica de retencao;
- recomendacao automatica de demissao;
- recomendacao automatica de promocao.

## 18. Automacao

Nenhum evento gera automaticamente:

- DevelopmentPlan;
- DevelopmentGoal;
- DevelopmentCheckIn;
- RetentionConcern;
- RetentionAction;
- promocao;
- desligamento;
- mudanca de Employment;
- mudanca de OrganizationPerson.

Toda criacao, conclusao, cancelamento ou resolucao e ato explicito de ator
humano autorizado.

## 19. Organization Archived

Quando Organization estiver arquivada:

- leitura historica autorizada pode ocorrer conforme RBAC;
- nenhuma nova mutacao funcional e permitida;
- planos, goals, check-ins, concerns e actions nao mudam;
- Platform Admin permanece restrito a leitura administrativa minimizada com
  motivo e auditoria;
- nao ha excecao de escrita.

## 20. Employment Ended Durante Plano

Cenario:

- Employment `active`;
- existe DevelopmentPlan `draft` ou `active`;
- Employment passa a `ended` por regra da SPEC-025.

Semantica obrigatoria:

- DevelopmentPlan nao continua funcionalmente;
- nenhuma nova acao, goal, check-in, concern ou action e permitida;
- historico permanece;
- planos nao finais devem ser materializados como
  `closed_due_to_employment_end`;
- goals `open` permanecem historicos sem nova mutacao funcional;
- concerns `open` e actions `open` permanecem historicos sem nova mutacao
  funcional, salvo reconciliacao sistemica atomica futura expressamente
  definida para fechamento tecnico;
- a reconciliacao nao reabre Employment e nao altera OrganizationPerson.

A v1 escolhe materializar o fechamento do plano para evitar subestado implicito.

## 21. Employment Cancelled

Employment `cancelled` nunca chegou a `active`.

Regras:

- nao deve ter plano funcional normal;
- nao deve ter goal funcional;
- nao deve ter check-in funcional;
- nao deve ter concern ou action funcional;
- se algum registro preparatorio existir por erro ou legado, ele deve ser
  tratado como historico administrativo e nao como atividade funcional;
- novas mutacoes ficam bloqueadas.

## 22. Candidate, CandidateApplication e Proposal

Nenhum deles e input funcional normal da Fase 25.

Regras:

- nao reler candidatura, Proposal ou Dossie para decidir desenvolvimento ou
  retencao;
- se exibidos, sao apenas contexto autorizado;
- nunca alterar Candidate;
- nunca alterar CandidateApplication;
- nunca alterar Proposal;
- Candidate nao recebe plano;
- CandidateApplication nao recebe plano;
- Proposal nao recebe concern ou action;
- dados sensiveis de Proposal, especialmente compensacao, nao sao usados por
  Retencao.

## 23. Onboarding

Onboarding pode ser contexto historico autorizado.

Onboarding `completed` nao:

- cria DevelopmentPlan;
- cria DevelopmentGoal;
- cria DevelopmentCheckIn;
- cria RetentionConcern;
- cria RetentionAction;
- ativa Employment;
- altera Employment.

SPEC-017 nao altera Onboarding.

## 24. Non-Retroactivity e Snapshots

Alteracoes futuras nao reescrevem registros historicos.

Regras:

- nao snapshotar Employment inteiro;
- nao snapshotar OrganizationPerson inteiro;
- referencias a Blueprint ou competencia devem usar versao concreta quando
  disponivel;
- mudancas futuras em Blueprint, cargo, competencia ou estrutura nao alteram
  planos, goals, check-ins, concerns ou actions ja registrados;
- auditoria preserva quem fez, quando fez e em qual Organization.

## 25. Idempotencia

Exigem Idempotency-Key:

- criar DevelopmentPlan;
- ativar DevelopmentPlan;
- completar DevelopmentPlan;
- cancelar DevelopmentPlan;
- criar DevelopmentGoal;
- completar DevelopmentGoal;
- cancelar DevelopmentGoal;
- criar DevelopmentCheckIn;
- criar RetentionConcern;
- resolver RetentionConcern;
- cancelar RetentionConcern;
- criar RetentionAction;
- completar RetentionAction;
- cancelar RetentionAction.

Nao exigem Idempotency-Key:

- leitura;
- listagem;
- validacao previa sem mutacao.

Onde exigida, a idempotencia deve registrar:

- fingerprint sem PII;
- status `pending`, `completed` ou `failed`;
- replay deterministico;
- conflito quando payload divergir;
- recuperacao apos crash;
- expiracao coerente com o padrao do projeto.

## 26. Concorrencia

Resultados deterministicos obrigatorios:

- create plan x create plan: apenas um plano nao final por Employment;
- activate x cancel: uma transicao vence; a outra recebe conflito;
- complete plan x add goal: revalidar status do plano na mesma transacao;
- complete goal x cancel goal: uma transicao vence; a outra recebe conflito;
- Employment ended x mutation: fim do Employment bloqueia mutacao funcional;
- Organization archived x mutation: arquivamento bloqueia mutacao funcional;
- double completion: replay idempotente ou conflito conforme fingerprint;
- retention resolve x cancel: uma transicao vence; a outra recebe conflito;
- cross-tenant assignment: operacao negada.

## 27. Atomicidade

Devem ser atomicas:

- create plan + initial goals + audit;
- activate plan + audit;
- complete plan + revalidacao de goals + audit;
- cancel plan + audit;
- create goal + audit;
- complete/cancel goal + audit;
- create check-in + audit;
- create/resolve/cancel concern + audit;
- create/complete/cancel action + audit;
- reconciliacao de Employment ended sobre planos nao finais, quando executada.

Falha critica de auditoria reverte a operacao correspondente.

## 28. Auditoria

Eventos obrigatorios:

- `development_plan.created`;
- `development_plan.activated`;
- `development_plan.completed`;
- `development_plan.cancelled`;
- `development_plan.closed_due_to_employment_end`;
- `development_goal.created`;
- `development_goal.completed`;
- `development_goal.cancelled`;
- `development_checkin.created`;
- `retention_concern.created`;
- `retention_concern.resolved`;
- `retention_concern.cancelled`;
- `retention_action.created`;
- `retention_action.completed`;
- `retention_action.cancelled`;
- `development_retention.permission_denied`;
- `development_retention.cross_tenant_access_denied`;
- `development_retention.admin_read`;
- `development_retention.mass_assignment_denied`.

Auditoria nunca registra conteudo integral sensivel. Deve conter identificadores
internos, tipo de evento, ator, Organization, timestamp, resultado e motivo
minimizado quando aplicavel.

## 29. Multiempresa

Todas as entidades possuem `organization_id` obrigatorio.

Regras:

- `organization_id` e derivado do contexto autorizado, nunca confiado do cliente;
- Employment deve pertencer a mesma Organization;
- DevelopmentPlan deve pertencer a mesma Organization do Employment;
- DevelopmentGoal deve pertencer ao mesmo DevelopmentPlan e Employment;
- DevelopmentCheckIn deve pertencer ao mesmo DevelopmentPlan e Employment;
- RetentionConcern deve pertencer ao mesmo Employment;
- RetentionAction deve pertencer ao mesmo Employment e, quando houver concern,
  ao mesmo RetentionConcern;
- bloquear Employment de outra Organization;
- bloquear Plan de outro tenant;
- bloquear Goal de outro Plan;
- bloquear OrganizationPerson externa;
- bloquear referencias cruzadas e IDOR.

## 30. Mass Assignment

Inputs nunca podem definir diretamente:

- `organization_id`;
- `employment_id` sem validacao de acesso e tenant;
- `status`;
- timestamps;
- autores;
- `resolved_by_membership_id`;
- `completed_by_membership_id`;
- `cancelled_by_membership_id`;
- metadata de auditoria;
- metadata de Platform Admin.

Toda operacao deve usar allow-list explicita de campos.

## 31. Banco de Dados Conceitual

Modelo conceitual:

- `development_plans`;
- `development_goals`;
- `development_checkins`;
- `retention_concerns`;
- `retention_actions`;
- `development_retention_idempotency_keys`, se nao houver mecanismo compartilhado
  adequado.

Regras fisicas futuras:

- FKs tenant-safe;
- UNIQUE parcial ou equivalente para no maximo um plano nao final por Employment;
- CHECKs para status fechados;
- indices por `organization_id`, `employment_id`, status e datas relevantes;
- nenhuma coluna para score, ranking, performance rating ou IA.

## 32. Criterios de Aceite

1. Employment e o aggregate root obrigatorio.
2. OrganizationPerson nao recebe estado operacional de desenvolvimento/retencao.
3. Candidate e somente provenance historica.
4. CandidateApplication e somente provenance historica.
5. Proposal e somente provenance historica.
6. Onboarding e somente contexto historico opcional.
7. User/Membership sao somente acesso, autorizacao e autoria.
8. Operacoes funcionais sem Employment sao bloqueadas.
9. Employment `pending` permite somente leitura administrativa de contexto.
10. Employment `active` e o unico estado com mutacoes funcionais normais.
11. Employment `ended` permite leitura historica e bloqueia nova mutacao.
12. Employment `cancelled` permite leitura historica minima e bloqueia mutacao.
13. SPEC-017 nao ativa, encerra, cancela ou reabre Employment.
14. V1 inclui DevelopmentPlan.
15. V1 inclui DevelopmentGoal.
16. V1 inclui DevelopmentCheckIn.
17. V1 inclui RetentionConcern.
18. V1 inclui RetentionAction.
19. V1 exclui DevelopmentAction/LMS.
20. Performance Management formal esta fora da v1.
21. Retencao nao e score de risco.
22. Flight risk score e proibido.
23. Retention score e proibido.
24. Ranking de pessoas e proibido.
25. Predicao de desligamento e proibida.
26. Inferencia psicologica e proibida.
27. Zero IA na v1.
28. Zero automacao criadora de registros funcionais.
29. Autosservico da pessoa esta fora da v1.
30. RBAC exige Membership ativa.
31. Platform Admin nao possui mutacao funcional.
32. Lista positiva de dados e respeitada.
33. Campos textuais possuem finalidade, limite, autoria e visibilidade.
34. Dados sensiveis proibidos nao sao armazenados.
35. Organization archived bloqueia mutacoes.
36. Employment ended fecha planos nao finais como `closed_due_to_employment_end`.
37. Estados finais nao reabrem.
38. No maximo um DevelopmentPlan nao final por Employment na v1.
39. Cardinalidades sao tenant-safe.
40. Referencias a Blueprint/competencias sao versionadas quando usadas.
41. Registros historicos nao sao reescritos por mudancas futuras.
42. Operacoes criticas usam Idempotency-Key.
43. Concorrencia produz resultado deterministico.
44. Mutacoes compostas sao atomicas.
45. Falha critica de auditoria causa rollback.
46. Eventos de auditoria obrigatorios sao emitidos.
47. Auditoria nao armazena conteudo integral sensivel.
48. Cross-tenant e IDOR sao bloqueados.
49. Mass assignment e bloqueado por allow-list.
50. Candidate/Application/Proposal nao sao alterados pela SPEC-017.
51. Onboarding completed nao gera registros de desenvolvimento/retencao.
52. SPEC-025 permanece autoridade para Employment.

Quantidade: 52 criterios de aceite.

## 33. Testes Obrigatorios Futuros

1. Bloquear create plan sem Employment.
2. Bloquear create plan para Employment de outra Organization.
3. Permitir leitura administrativa em Employment pending.
4. Bloquear mutacao funcional em Employment pending.
5. Permitir create plan em Employment active.
6. Bloquear mutacao em Employment ended.
7. Bloquear mutacao em Employment cancelled.
8. Bloquear SPEC-017 tentando ativar Employment.
9. Bloquear SPEC-017 tentando encerrar Employment.
10. Bloquear SPEC-017 tentando cancelar Employment.
11. Criar DevelopmentPlan draft.
12. Ativar DevelopmentPlan.
13. Completar DevelopmentPlan com goals finais.
14. Bloquear completar DevelopmentPlan com goal open.
15. Cancelar DevelopmentPlan.
16. Impedir reabertura de DevelopmentPlan final.
17. Impedir segundo DevelopmentPlan nao final no mesmo Employment.
18. Criar DevelopmentGoal.
19. Completar DevelopmentGoal.
20. Cancelar DevelopmentGoal.
21. Impedir reabertura de DevelopmentGoal final.
22. Criar DevelopmentCheckIn.
23. Impedir edicao de DevelopmentCheckIn submetido.
24. Bloquear check-in com dado proibido detectavel por validacao basica.
25. Criar RetentionConcern com source permitida.
26. Bloquear RetentionConcern gerada por IA.
27. Resolver RetentionConcern.
28. Cancelar RetentionConcern.
29. Impedir reabertura de RetentionConcern final.
30. Criar RetentionAction sem concern.
31. Criar RetentionAction com concern do mesmo tenant.
32. Bloquear RetentionAction com concern de outro tenant.
33. Completar RetentionAction.
34. Cancelar RetentionAction.
35. Impedir reabertura de RetentionAction final.
36. Bloquear flight risk score.
37. Bloquear retention score.
38. Bloquear performance_score.
39. Bloquear ranking de pessoas.
40. Bloquear AI Execution.
41. Bloquear recomendacao automatica de retencao.
42. Bloquear recomendacao automatica de demissao.
43. Bloquear recomendacao automatica de promocao.
44. Bloquear automacao por Onboarding completed.
45. Bloquear automacao por CandidateApplication hired.
46. Bloquear criacao automatica de Membership.
47. Bloquear criacao automatica de User.
48. Bloquear mutacao de Candidate.
49. Bloquear mutacao de CandidateApplication.
50. Bloquear mutacao de Proposal.
51. Bloquear mutacao de Onboarding.
52. Bloquear owner/admin ausente.
53. Permitir owner.
54. Permitir admin.
55. Bloquear member sem autorizacao explicita.
56. Permitir member explicitamente autorizado em goal/check-in.
57. Bloquear Platform Admin em mutacao funcional.
58. Exigir motivo em admin-read de Platform Admin.
59. Bloquear Organization archived em mutacao.
60. Permitir leitura historica em Organization archived conforme RBAC.
61. Fechar DevelopmentPlan nao final quando Employment vira ended.
62. Bloquear goal novo apos Employment ended.
63. Bloquear check-in novo apos Employment ended.
64. Bloquear concern novo apos Employment ended.
65. Bloquear action nova apos Employment ended.
66. Testar idempotencia de create plan.
67. Testar conflito de idempotencia com payload divergente.
68. Testar replay idempotente.
69. Testar create plan x create plan concorrente.
70. Testar activate x cancel concorrente.
71. Testar complete plan x add goal concorrente.
72. Testar complete goal x cancel goal concorrente.
73. Testar retention resolve x cancel concorrente.
74. Testar rollback por falha critica de auditoria.
75. Testar mass assignment de organization_id.
76. Testar mass assignment de status.
77. Testar mass assignment de autoria.
78. Testar IDOR por employment_id.
79. Testar IDOR por plan_id.
80. Testar IDOR por concern_id.
81. Testar non-retroactivity de Blueprint versionado.
82. Testar que dados proibidos nao aparecem em auditoria integral.
83. Testar leitura historica apos Employment ended.
84. Testar Employment cancelled sem registros funcionais normais.

Quantidade: 84 testes obrigatorios futuros.

## 34. Ambiguidades Resolvidas

- Autosservico: fora da v1.
- Numero de planos ativos: no maximo um plano nao final por Employment.
- RetentionConcern: mantida, porque registra preocupacao humana explicita com
  lifecycle proprio.
- RetentionAction: mantida, podendo existir com ou sem concern.
- Check-ins: mantidos como registro imutavel de acompanhamento.
- Blueprint/competencias: somente contexto versionado opcional.
- Employment ending behavior: plano nao final vira
  `closed_due_to_employment_end`.

## 35. Conflitos

Nao ha conflito normativo restante conhecido com ADR-0024 ou SPEC-025.

Qualquer implementacao futura que use Candidate, CandidateApplication,
Proposal, Onboarding, User, Membership ou OrganizationPerson como aggregate root
operacional de Desenvolvimento e Retencao deve ser recusada.

## 36. Limitacoes Conhecidas

- A v1 nao implementa autosservico da pessoa.
- A v1 nao implementa Performance formal.
- A v1 nao implementa LMS.
- A v1 nao implementa score, ranking ou IA.
- A v1 nao define schema fisico, migrations, endpoints ou UI final.
- A matriz de permissoes de member autorizado deve ser detalhada na
  implementacao respeitando SPEC-004.

## 37. Definicao de Concluido

A Fase 25 so pode ser considerada implementada quando:

- os criterios de aceite desta SPEC forem atendidos;
- os testes obrigatorios aplicaveis forem implementados;
- multiempresa, RBAC, privacidade, idempotencia, concorrencia, atomicidade e
  auditoria forem verificados;
- nenhuma migracao ou codigo contrariar ADR-0024 ou SPEC-025;
- zero IA, zero score, zero ranking e zero automacao proibida forem comprovados.
