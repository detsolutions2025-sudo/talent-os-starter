# SPEC-016 - Onboarding

**Status:** Aprovada  
**Versao:** 1.0  
**Fase:** 23  
**Responsavel de negocio:** Thiago Sousa  
**Ultima atualizacao:** 2026-08-15  
**Dependencias:** SPEC-001 - Organization, SPEC-003 - Membership, SPEC-004 - Roles & Permissions, SPEC-010 - Vagas, SPEC-011 - Candidatos, SPEC-012 - Processo Seletivo, SPEC-015 - Propostas, SPEC-018 - Blueprint Organizacional / Implantacao Guiada, SPEC-020 - Candidatura Publica, SPEC-021 - Pre-Entrevista Estruturada, SPEC-022 - Perfil Comportamental, SPEC-023 - Pre-Analise Assistida por IA, SPEC-024 - Dossie Inteligente do Candidato, ADR-0013, ADR-0014, ADR-0015, ADR-0020, ADR-0021, ADR-0022, ADR-0023

**Nota de revisao (v1.0 - revisao destrutiva documental):** esta revisao
atacou a v0.1 como se ela estivesse errada. A principal fragilidade encontrada
era tratar `Candidate` e `CandidateApplication` como se fossem, naturalmente, o
novo sujeito pos-contratacao. A decisao final e mais estreita: Onboarding v1 e
um **checklist interno de preparacao de entrada**, criado manualmente por
owner/admin apos `hired`, tendo `CandidateApplication hired` como origem
historica e `Candidate` como referencia transitoria de identidade. Isso nao
transforma Candidate em Employee, Collaborator, User ou Membership. A ausencia
de Employee/Collaborator nao bloqueia esta v1 porque a pessoa onboardada nao
opera o sistema; responsaveis por tarefas sao sempre Memberships internos
ativos da mesma Organization. A state machine foi reduzida, cardinalidade foi
fechada, templates foram tornados opcionais, eventos funcionais foram
subordinados a auditoria, e nenhum conflito critico restou com SPEC-012 ou
SPEC-015.

## 1. Objetivo

Definir funcionalmente o modulo de **Onboarding** do Talent OS: a capacidade de
organizar, pela equipe interna da Organization, a preparacao de entrada da
pessoa contratada.

Onboarding v1 nao e admissao trabalhista completa. Nao e folha, ponto,
beneficios operacionais completos, assinatura juridica, documento admissional,
portal da pessoa contratada, desenvolvimento, retencao, desempenho, Employee ou
Collaborator.

Pergunta central desta SPEC:

**quando o Onboarding pode comecar?**

Decisao:

- Onboarding so pode ser criado apos `CandidateApplication.application_status =
  hired`.
- Quando o fluxo formal de Propostas da SPEC-015 tiver sido usado, a criacao de
  Onboarding tambem exige `ProposalVersion accepted` da mesma
  `CandidateApplication`, referenciada pelo ato de `hired`.
- Quando a Organization concluir a contratacao por fluxo administrativo sem
  Proposal, `hired` e suficiente.
- `ProposalVersion accepted` sem `hired` nunca permite criar Onboarding.
- A criacao de Onboarding nunca e automatica pelo `hired`; exige ato
  administrativo explicito de owner/admin.

## 2. Fora do escopo

Esta SPEC nao define nem implementa:

- codigo, banco de dados, migrations, rotas, APIs, testes executaveis ou
  dependencias;
- alteracao de ADRs, SPEC-012, SPEC-015, BACKLOG ou roadmap;
- criacao automatica ou manual de Employee, Collaborator ou entidade de
  colaborador;
- criacao automatica de User ou Membership para a pessoa onboardada;
- acesso funcional da pessoa onboardada ao sistema;
- token publico, portal proprio ou self-service da pessoa onboardada;
- folha de pagamento, ponto, beneficios completos, desempenho,
  desenvolvimento ou retencao;
- assinatura juridica, contrato trabalhista ou admissao trabalhista completa;
- coleta, upload, storage ou validacao de documentos admissionais;
- CPF, RG, dados bancarios, endereco completo, saude, dependentes, exames ou
  outros dados admissionais sensiveis;
- provisionamento tecnico automatico de e-mail, equipamento, sistemas ou
  acessos externos;
- notificacoes, e-mail, WhatsApp, agenda externa ou integracoes;
- Inteligencia Artificial, chamada ao `AIGateway`, provider, modelo, prompt ou
  geracao automatica de checklist por IA;
- score, ranking, avaliacao de desempenho, avaliacao de qualidade da pessoa ou
  decisao automatica;
- criacao automatica de plano de desenvolvimento, retencao ou desempenho apos
  Onboarding `completed`.

## 3. Usuarios envolvidos

- **owner:** cria Onboarding, cria/administra templates da Organization quando
  existirem, inicia, adiciona tarefas, atribui responsaveis, conclui tarefas,
  cancela, conclui Onboarding e consulta historico.
- **admin:** possui os mesmos poderes operacionais de owner nesta SPEC. Nao ha
  base normativa para restringir administracao de checklist interno apenas a
  owner.
- **member:** pode visualizar apenas tarefas atribuidas a sua Membership ou
  Onboardings em DTO restrito quando a tarefa exigir contexto; pode concluir
  somente tarefa atribuida a sua Membership e permitida para responsavel.
- **pessoa onboardada:** sujeito de negocio do Onboarding, mas sem acesso
  funcional nesta v1. Nao e User, nao recebe Membership e nao conclui tarefas
  diretamente.
- **Candidate:** referencia transitoria e historica de identidade da pessoa
  contratada dentro da Organization. Candidate nao vira colaborador.
- **Platform Admin:** nao opera funcionalmente Onboarding. Pode realizar apenas
  leitura administrativa excepcional, minimizada, com motivo e auditoria.

`Platform Admin` nao e Role de Membership e nao recebe permissoes funcionais de
`owner`, `admin` ou `member` dentro da Organization.

## 4. Decisao de dominio

### 4.1 Sujeito do Onboarding

O sujeito de negocio do Onboarding e a **pessoa contratada**.

Como ainda nao existe entidade Employee/Collaborator aprovada, a referencia
tecnica da v1 e:

- `CandidateApplication hired`, como origem historica da contratacao;
- `Candidate`, como referencia transitoria de identidade;
- `Organization`, como proprietaria de todos os dados.

Essa e uma ponte transitoria de dominio. Ela nao transforma Candidate em
Employee, Collaborator, User, Membership ou pessoa funcional interna.

### 4.2 Candidate

Candidate continua sendo identidade valida para rastrear quem foi contratado,
mas somente como referencia historica minima. Onboarding nao deve copiar o
Candidate inteiro, nao deve duplicar PII sem necessidade e nao deve gravar dados
pos-contratacao no Candidate principal.

Mudancas futuras em Candidate, como nome preferido ou contato, nao reinterpretam
automaticamente um Onboarding ja encerrado. Quando uma informacao mutavel for
necessaria para leitura historica do Onboarding, deve ser congelada de forma
minima e explicita na instancia.

### 4.3 Employee / Collaborator

A ausencia de Employee/Collaborator e **limitacao aceitavel para v1**, nao
bloqueio tecnico nem bloqueio normativo, porque v1 e checklist interno operado
por Memberships da Organization.

Regra fechada:

- e possivel executar toda a v1 sem Employee/Collaborator;
- a SPEC nao pode fingir semantica de colaborador;
- a pessoa onboardada nao recebe tarefa funcional direta;
- nenhuma entidade futura de colaborador e inventada;
- se Employee/Collaborator for criado futuramente, uma revisao devera decidir
  se Onboarding passa a referenciar a nova entidade ou preserva a origem
  historica em `CandidateApplication`.

### 4.4 CandidateApplication

`CandidateApplication` e a origem historica e aggregate root de criacao do
Onboarding v1. Ela nao volta a ser operada como processo seletivo.

Excecao explicita de dominio:

- SPEC-012 bloqueia novas operacoes de recrutamento em candidatura finalizada;
- Onboarding existe justamente depois de `hired`;
- criar e executar Onboarding apos `hired` nao e movimentar pipeline, criar nota
  de recrutamento, reabrir candidatura ou alterar decisao;
- portanto, Onboarding e uma operacao pos-contratacao vinculada
  historicamente a uma `CandidateApplication` finalizada como `hired`.

Onboarding nunca altera `application_status`, `current_stage`, `finalized_at`,
`finalized_by_user_id`, `finalization_reason`, eventos, notas ou historico da
candidatura.

### 4.5 Risco de mistura de dominios

O risco existe e foi aceito somente para v1, com salvaguardas:

- Onboarding armazena apenas dados operacionais minimos de entrada;
- notas de recrutamento, proposta, dossie, entrevista e avaliacao nao sao
  copiadas para Onboarding;
- dados admissionais sensiveis ficam fora de escopo;
- tarefas de Onboarding nao avaliam a pessoa;
- a futura criacao de Employee/Collaborator exige revisao explicita.

## 5. Relacao com `hired` e Proposal

Alternativas avaliadas:

- **A. Apos `CandidateApplication.application_status = hired`:** adotada como
  pre-condicao universal.
- **B. Apos `ProposalVersion accepted`:** rejeitada como condicao suficiente,
  porque SPEC-015 decide que aceite nao cria `hired`.
- **C. Apos ambos:** adotada apenas quando o fluxo de Propostas for usado.
- **D. Fluxo administrativo sem Proposal:** permitido, preservando SPEC-012 e
  SPEC-015.

Regras:

- RN-001: Onboarding so pode ser criado para `CandidateApplication` com
  `application_status = hired`.
- RN-002: Onboarding e recusado para candidatura `active`, `withdrawn`,
  `rejected` ou `cancelled`.
- RN-003: `ProposalVersion accepted` sem `hired` nao permite Onboarding.
- RN-004: Se o fluxo de Propostas foi usado, Onboarding exige
  `ProposalVersion accepted` da mesma `CandidateApplication`.
- RN-005: ProposalVersion de outra candidatura, ainda que da mesma
  Organization, nunca fundamenta Onboarding.
- RN-006: Fluxo sem Proposal continua permitido apos `hired`.
- RN-007: A criacao de Onboarding e sempre ato explicito de owner/admin apos
  `hired`; nunca efeito automatico do `hired` ou do aceite de proposta.
- RN-008: Se uma futura correcao excepcional de `hired` existir fora das normas
  atuais, Onboarding ja criado nao reabre a candidatura; deve ser cancelado
  administrativamente com motivo, preservando historico.

## 6. Cardinalidade

Pode existir **no maximo um Onboarding por `CandidateApplication`**.

Consequencias:

- Onboarding `completed` nao permite novo Onboarding para a mesma candidatura;
- Onboarding `cancelled` tambem nao permite novo Onboarding para a mesma
  candidatura nesta v1;
- erro de criacao deve ser tratado por cancelamento com motivo, nao por delecao
  fisica nem recriacao;
- "onboarding complementar" fica fora da v1 e exigira novo fluxo ou revisao.

## 7. Estados canonicos de Onboarding

A state machine da v0.1 foi reduzida. `pending` e `ready` nao tinham diferenca
deterministica suficiente.

Estados canonicos:

- `draft`;
- `in_progress`;
- `completed`;
- `cancelled`.

`draft` e instancia criada explicitamente por owner/admin, ainda em preparacao
interna. Transiciona para `in_progress` por acao explicita de owner/admin ou
para `cancelled` com motivo.

`in_progress` e checklist interno em execucao. Transiciona para `completed`
quando todas as tarefas obrigatorias elegiveis estiverem concluidas e
owner/admin confirmar a conclusao, ou para `cancelled` com motivo.

`completed` e `cancelled` sao finais e nao reabrem.

Transicoes fora dessa matriz sao proibidas.

## 8. Criacao, disponibilidade e inicio

- **Criacao:** ato explicito de owner/admin apos validacoes de Organization,
  Membership, Candidate, CandidateApplication, Proposal quando aplicavel e
  cardinalidade.
- **Disponibilidade:** enquanto `draft`, o checklist existe para preparacao
  interna e pode ser ajustado por owner/admin.
- **Inicio:** ato explicito de owner/admin que muda `draft` para
  `in_progress`.

Nao ha automacao silenciosa. Criacao de Onboarding + snapshot minimo + tarefas
iniciais deve ser uma unica unidade transacional.

## 9. Estados e regras de tarefas

Estados canonicos de `OnboardingTask`:

- `open`;
- `completed`;
- `cancelled`.

`in_progress` foi removido porque, nesta v1, nao ha gatilho objetivo e
observavel que o diferencie de uma tarefa aberta.

Regras:

- tarefa pode existir sem responsavel apenas em `draft`;
- para iniciar o Onboarding, toda tarefa obrigatoria deve ter responsavel por
  Membership ou regra explicita de responsabilidade por role;
- tarefa opcional nao bloqueia conclusao;
- tarefa cancelada nao conta como concluida;
- tarefa cancelada obrigatoria exige motivo e deixa de ser elegivel para
  progresso/conclusao;
- tarefa `completed` e `cancelled` nao reabre nesta v1;
- tarefa nunca armazena documento, anexo ou dado admissional sensivel.

## 10. Conclusao do Onboarding

Conclusao exige combinacao de criterio objetivo e ato humano:

1. todas as tarefas obrigatorias elegiveis estao `completed`;
2. tarefas obrigatorias canceladas possuem motivo;
3. nao ha tarefa obrigatoria aberta;
4. owner/admin confirma manualmente a conclusao.

Onboarding nunca e concluido apenas por percentual. Member nao conclui o
Onboarding.

## 11. Progresso

Progresso, se exibido, e puramente operacional.

```text
progresso = tarefas obrigatorias completed / tarefas obrigatorias elegiveis
```

Tarefas opcionais nao entram na formula. Tarefas obrigatorias canceladas com
motivo deixam de ser elegiveis. Tarefas adicionadas antes de `completed`
recalculam o percentual. Se nao houver tarefa obrigatoria elegivel, o progresso
exibido deve ser `0%` ate owner/admin concluir manualmente ou ajustar o
checklist. Progresso nunca e score da pessoa, desempenho, fit, ranking ou
avaliacao.

## 12. Templates

Template e permitido, mas opcional. V1 pode operar com tarefas criadas
manualmente.

Quando existir:

- pertence a uma unica Organization;
- nunca e global;
- Platform Admin nao cria, edita, ativa ou arquiva template funcional de uma
  Organization;
- owner/admin administram templates;
- member nao administra templates;
- template pode estar `draft`, `active` ou `archived`;
- apenas template `active` pode ser usado para criar Onboarding;
- template `archived` permanece historico e nao e apagado fisicamente.

## 13. Versionamento e snapshot

Se templates forem materializados, versoes de template devem ser imutaveis apos
ativacao.

Regras:

- Onboarding instanciado copia as tarefas do template para tarefas proprias;
- a instancia nunca referencia uma lista mutavel de tarefas do template;
- alteracao futura de template nao retroage;
- arquivamento de template nao altera Onboardings existentes;
- snapshot nao copia Candidate inteiro, Proposal inteira, Job Opening inteira
  nem Blueprint inteiro;
- snapshot guarda apenas referencias e texto minimo necessario para interpretar
  a tarefa historica.

Referencias esperadas: `candidate_application_id`, `candidate_id`,
`job_opening_id`, `job_opening_version_id`, `proposal_version_id` quando
aplicavel, `template_version_id` quando usado e `blueprint_version_id` apenas
se houver decisao humana de registrar contexto de template/plano.

## 14. Tarefas ad hoc

Owner/admin podem adicionar tarefas ad hoc em `draft` ou `in_progress`, nunca
em `completed` ou `cancelled`. Tarefa ad hoc exige autoria e motivo quando
adicionada em `in_progress`. Tarefas novas antes de `completed` alteram o
progresso operacional conforme a formula da secao 11.

## 15. Responsavel pela tarefa

Responsavel interno deve ser uma `Membership` ativa da mesma Organization, nao
apenas `User`.

Motivos:

- `Membership` preserva Organization;
- `Membership` preserva role;
- `Membership` preserva status;
- `Membership` evita atribuir tarefa a User fora do tenant.

Campos conceituais de tarefa:

- `assignee_membership_id`, opcional em `draft`;
- `responsible_role`, opcional para tarefas que devem ser resolvidas por role;
- `completed_by_membership_id`, obrigatorio quando concluida por ator interno;
- autoria e timestamps.

Pessoa onboardada sem User/Membership nao pode receber tarefa funcional na v1.
Responsavel externo fica fora de escopo.

## 16. Membership inativa ou removida

Membership inativo nao concede acesso e nao pode concluir tarefa.

Se tarefa atribuida tiver Membership depois inativada:

- a tarefa preserva o historico de atribuicao;
- a tarefa aberta fica bloqueada para conclusao pelo responsavel antigo;
- owner/admin devem reatribuir a uma Membership ativa da mesma Organization ou
  cancelar a tarefa com motivo;
- autoria historica nunca e apagada;
- tarefa ja concluida permanece concluida, mesmo que a Membership do autor seja
  inativada depois.

## 17. Pessoa onboardada sem acesso

Onboarding v1 e, explicitamente, um checklist interno de preparacao de entrada.
Ele ainda faz sentido sem self-service porque organiza atividades de RH/equipe,
como preparar agenda, responsavel interno, equipamentos em processo externo,
primeiro dia, comunicacoes internas e acompanhamentos manuais.

Tarefas "da pessoa onboardada" podem existir apenas como tarefas internas sobre
a pessoa, por exemplo: "confirmar que a pessoa recebeu orientacao inicial".
Quem conclui e uma Membership interna responsavel, nunca a pessoa sem acesso.

## 18. Acesso futuro da pessoa

Acesso futuro pode exigir User, Membership, portal proprio de pessoa
contratada, token publico/opaco ou Employee/Collaborator. Nenhum desses
mecanismos nasce automaticamente da v1.

## 19. Datas

Campos conceituais: `created_at`, `started_at`, `due_at` em tarefas,
`completed_at`, `cancelled_at` e `expected_person_start_date` opcional.

`expected_person_start_date` pode vir de informacao administrativa ou da
proposta aceita quando o fluxo de Propostas a tiver registrado, mas Onboarding
nao reler remuneracao, beneficios ou compensation snapshot para funcionar.

Nao ha prazo padrao, SLA numerico, lembrete ou deadline automatico nesta SPEC.

## 20. Cancelamento

Cenarios: criacao equivocada, contratacao desfeita, pessoa nao iniciou,
processo cancelado administrativamente ou correcao excepcional de `hired` em
fluxo futuro.

Regras:

- apenas owner/admin cancelam;
- motivo e obrigatorio;
- tarefas abertas permanecem no historico e deixam de ser operaveis;
- cancelamento nao altera Candidate, CandidateApplication, Proposal ou
  ProposalVersion;
- cancelamento nao permite novo Onboarding para a mesma CandidateApplication na
  v1;
- nao ha exclusao fisica.

## 21. Reabertura

Onboarding `completed` e `cancelled` nao reabrem. Tarefa `completed` ou
`cancelled` tambem nao reabre na v1. Trabalho adicional antes da conclusao deve
ser tarefa ad hoc. Trabalho adicional depois de `completed` exige novo processo
complementar futuro, nao alteracao do Onboarding encerrado.

## 22. Candidate inactive

SPEC-011 define Candidate `inactive` como cadastro preservado que nao aparece
em selecoes operacionais padrao e nao pode ser usado em novas candidaturas.
Esse significado nao deve ser reutilizado automaticamente como cancelamento de
pessoa ja contratada.

Regra propria da SPEC-016:

- Candidate `inactive` bloqueia **nova criacao** de Onboarding;
- Candidate que fica `inactive` depois da criacao nao cancela automaticamente o
  Onboarding;
- Onboarding existente pode continuar sendo operado por owner/admin se a
  Organization ativa, a CandidateApplication `hired` e as permissoes internas
  permanecerem validas;
- owner/admin podem cancelar se a inativacao indicar desistencia, erro ou
  impossibilidade administrativa;
- Candidate nao e reativado automaticamente;
- a inativacao posterior deve aparecer como alerta/bloqueio contextual, nao como
  regra cega de recrutamento.

## 23. Organization archived

Quando a Organization estiver `archived`:

- nao criar Onboarding;
- nao iniciar Onboarding;
- nao adicionar, atribuir, concluir ou cancelar tarefa como operacao funcional;
- nao concluir Onboarding;
- leitura historica por canais autorizados permanece possivel;
- Platform Admin continua restrito a leitura administrativa minimizada, com
  motivo e auditoria.

Cancelamento administrativo excepcional em Organization arquivada fica fora da
v1 e exigiria regra propria.

## 24. Job Opening e contexto

Onboarding nao precisa de vinculo redundante direto com Job Opening alem do que
ja vem da `CandidateApplication`. Pode armazenar `job_opening_id` e
`job_opening_version_id` herdados. Nao copiar Vaga inteira, conteudo completo,
faixa salarial, perguntas, competencias ou instrucoes internas.

## 25. Blueprint

Blueprint e opcional e contextual.

Regras:

- Blueprint nao gera tarefas automaticamente;
- IA nao gera checklist a partir de Blueprint;
- template pode ser inspirado manualmente pelo Blueprint;
- `blueprint_version_id` so deve existir se a Organization decidir registrar o
  contexto usado na criacao de template/plano;
- nova Blueprint Version nao altera Onboardings existentes.

## 26. Documentos admissionais e privacidade

Onboarding v1 usa minimizacao forte.

Nao persistir documentos admissionais, anexos, CPF/RG, dados bancarios,
endereco completo, dependentes, exames, documentos medicos, saude, remuneracao
integral, dados de folha, dados de ponto, dados discriminatorios ou
desnecessarios.

Tarefas, comentarios, evidencia textual e auditoria devem conter apenas
informacao operacional minima.

## 27. IA

Zero IA na v1: nenhuma chamada ao `AIGateway`, nenhuma geracao automatica de
checklist por IA, nenhum prompt, provider, modelo, avaliacao da pessoa, score,
classificacao ou ranking.

Uma futura Onboarding Assistant exigiria SPEC ou revisao propria e obedeceria
as ADR-0016 a ADR-0019 e ADR-0023.

## 28. Onboarding x SPEC-017

SPEC-017 - Desenvolvimento e Retencao e futura.

Onboarding `completed` nao cria automaticamente plano de desenvolvimento,
avaliacao, retencao, desempenho, trilha de carreira ou nova etapa operacional.

## 29. Modelo conceitual final

Modelo minimo v1:

- `Onboarding`;
- `OnboardingTask`;
- opcionalmente `OnboardingTemplate`;
- opcionalmente `OnboardingTemplateVersion`.

Nao criar `Assignment` separado se `assignee_membership_id` em
`OnboardingTask` resolver. Nao criar `OnboardingEvent` como entidade obrigatoria
se `audit_events` + historico de tarefas resolverem a rastreabilidade.

Se a implementacao futura decidir criar timeline funcional, ela deve justificar
valor de produto distinto de auditoria. Auditoria permanece obrigatoria.

## 30. Seguranca e permissoes

Toda operacao valida no servidor: User ativo, Membership ativa, Organization
ativa, role autorizada, `organization_id` derivado do contexto validado,
`candidate_application_id` da mesma Organization, referencias herdadas da
CandidateApplication, `proposal_version_id` da mesma CandidateApplication
quando usado, `assignee_membership_id` da mesma Organization e ativa quando
necessario, e bloqueio contra mass assignment.

| Acao | owner | admin | member | pessoa onboardada | Platform Admin |
| --- | :---: | :---: | :---: | :---: | :---: |
| Criar Onboarding | Sim | Sim | Nao | Nao | Nao |
| Consultar completo | Sim | Sim | Nao | Nao | Nao funcional |
| Consultar tarefa atribuida | Sim | Sim | Sim | Nao | Nao funcional |
| Criar/editar template | Sim | Sim | Nao | Nao | Nao |
| Iniciar Onboarding | Sim | Sim | Nao | Nao | Nao |
| Adicionar tarefa | Sim | Sim | Nao | Nao | Nao |
| Atribuir responsavel | Sim | Sim | Nao | Nao | Nao |
| Concluir tarefa propria | Sim | Sim | Sim | Nao | Nao |
| Concluir tarefa alheia | Sim | Sim | Nao | Nao | Nao |
| Cancelar Onboarding | Sim | Sim | Nao | Nao | Nao |
| Concluir Onboarding | Sim | Sim | Nao | Nao | Nao |
| Leitura administrativa | Nao | Nao | Nao | Nao | Sim, com motivo |

Member recebe DTO positivo minimo, sem proposta, remuneracao, documentos,
consentimento detalhado, notas internas de recrutamento ou historico
administrativo completo.

## 31. Concorrencia

Cenarios obrigatorios:

- create x create;
- start x cancel;
- complete task x cancel;
- complete task x reassign;
- complete onboarding x add task;
- duas conclusoes da mesma tarefa;
- template instantiation concorrente.

Regras:

- uma `CandidateApplication` pode ter no maximo um Onboarding;
- primeira operacao confirmada vence;
- segunda operacao incompativel recebe conflito seguro;
- retry exatamente igual pode retornar resultado idempotente;
- conclusao de tarefa revalida status da tarefa, status do Onboarding e
  assignee dentro da transacao;
- conclusao de Onboarding bloqueia ou revalida tarefas obrigatorias antes de
  confirmar;
- instanciacao por template ocorre em transacao unica.

## 32. Idempotencia

Idempotencia obrigatoria: criacao de Onboarding, inicio, cancelamento e
conclusao de Onboarding.

Conclusao de tarefa pode ser naturalmente idempotente por revalidacao de estado
e constraint transacional; se exposta a retry de cliente, deve aceitar chave
idempotente. Esta SPEC nao exige `Idempotency-Key` para todo PATCH interno
quando lock/constraint ja resolver o risco.

Mesma chave com fingerprint diferente gera conflito seguro.

## 33. Atomicidade

Devem ser atomicas:

- criacao de Onboarding + snapshot minimo + tarefas iniciais;
- instanciacao a partir de template;
- inicio com revalidacao de tarefas obrigatorias;
- cancelamento;
- conclusao de Onboarding;
- reatribuicao/conclusao concorrente de tarefa quando afetar permissao.

Falha de auditoria critica reverte a operacao correspondente.

## 34. Auditoria

Auditoria obrigatoria:

- `onboarding.created`;
- `onboarding.started`;
- `onboarding.task_created`;
- `onboarding.task_assigned`;
- `onboarding.task_completed`;
- `onboarding.task_cancelled`;
- `onboarding.cancelled`;
- `onboarding.completed`;
- `onboarding.permission_denied`;
- `onboarding.cross_organization_access_denied`;
- `onboarding.administrative_read`.

Auditoria nunca registra documento, dado bancario, dado de saude, dependente,
remuneracao integral, token, header, segredo ou comentario completo sensivel.

`OnboardingEvent` fisico e opcional. Se existir, nao substitui `audit_events`.

## 35. Multiempresa

Bloqueios obrigatorios:

- CandidateApplication de outra Organization;
- Candidate de outra Organization;
- ProposalVersion de outra Organization;
- ProposalVersion de outra candidatura;
- Membership responsavel de outra Organization;
- Membership inativa;
- Template de outra Organization;
- Task de outro Onboarding;
- Onboarding IDOR por ID manipulado.

Mensagens de erro para acesso cruzado devem ser genericas e nao revelar
existencia do registro.

## 36. Regras de negocio consolidadas

- RN-009: Onboarding pertence obrigatoriamente a uma Organization.
- RN-010: Onboarding pertence a uma `CandidateApplication hired`.
- RN-011: Onboarding usa Candidate apenas como referencia transitoria.
- RN-012: Onboarding nunca cria Employee/Collaborator.
- RN-013: Onboarding nunca cria User/Membership para a pessoa onboardada.
- RN-014: Onboarding nunca altera Candidate, CandidateApplication ou Proposal.
- RN-015: Criacao e sempre manual por owner/admin.
- RN-016: Existe no maximo um Onboarding por CandidateApplication.
- RN-017: Estados canonicos sao `draft`, `in_progress`, `completed`,
  `cancelled`.
- RN-018: Estados finais nao reabrem.
- RN-019: Tarefas usam estados `open`, `completed`, `cancelled`.
- RN-020: Responsavel interno e Membership ativa da mesma Organization.
- RN-021: Pessoa onboardada nao recebe tarefa funcional na v1.
- RN-022: Templates sao opcionais e pertencem a Organization.
- RN-023: Snapshot copia tarefas, nao entidades inteiras.
- RN-024: Progresso e operacional e nunca score.
- RN-025: Conclusao exige tarefas obrigatorias elegiveis concluidas e ato
  humano de owner/admin.
- RN-026: Cancelamento exige motivo.
- RN-027: Candidate inactive bloqueia nova criacao, mas nao cancela
  automaticamente Onboarding existente.
- RN-028: Organization archived bloqueia mutacoes funcionais.
- RN-029: Platform Admin nao opera funcionalmente Onboarding.
- RN-030: IA nao e usada.

## 37. Criterios de aceite

- CA-001: Onboarding e criado apenas para `CandidateApplication hired`.
- CA-002: Onboarding e recusado para candidatura `active`.
- CA-003: Onboarding e recusado para candidatura `withdrawn`.
- CA-004: Onboarding e recusado para candidatura `rejected`.
- CA-005: Onboarding e recusado para candidatura `cancelled`.
- CA-006: `ProposalVersion accepted` sem `hired` nao cria Onboarding.
- CA-007: Fluxo com Proposal exige `ProposalVersion accepted` da mesma
  candidatura.
- CA-008: Fluxo sem Proposal permite Onboarding apos `hired`.
- CA-009: Proposal de outra candidatura e recusada.
- CA-010: Criacao exige ato explicito de owner/admin.
- CA-011: Hired nao cria Onboarding automaticamente.
- CA-012: Existe no maximo um Onboarding por CandidateApplication.
- CA-013: Onboarding `cancelled` nao permite recriacao na v1.
- CA-014: Estados permitidos sao `draft`, `in_progress`, `completed`,
  `cancelled`.
- CA-015: `pending` e `ready` nao existem como estados de Onboarding.
- CA-016: Estados de tarefa sao `open`, `completed`, `cancelled`.
- CA-017: Tarefa nao usa `in_progress` na v1.
- CA-018: Conclusao exige todas as tarefas obrigatorias elegiveis concluidas.
- CA-019: Conclusao exige ato humano de owner/admin.
- CA-020: Percentual sozinho nao conclui Onboarding.
- CA-021: Progresso ignora tarefas opcionais.
- CA-022: Tarefa obrigatoria cancelada exige motivo e sai do denominador.
- CA-023: Onboarding nao cria Employee/Collaborator.
- CA-024: Onboarding nao cria User/Membership para a pessoa onboardada.
- CA-025: Pessoa onboardada nao acessa nem conclui tarefas na v1.
- CA-026: Responsavel de tarefa e Membership ativa da mesma Organization.
- CA-027: Membership inativa bloqueia conclusao de tarefa aberta atribuida.
- CA-028: Owner/admin podem reatribuir tarefa aberta.
- CA-029: Member conclui apenas tarefa atribuida a sua Membership.
- CA-030: Member nao conclui tarefa alheia.
- CA-031: Member nao cancela nem conclui Onboarding.
- CA-032: Templates sao opcionais.
- CA-033: Template pertence a uma Organization.
- CA-034: Template de outra Organization e recusado.
- CA-035: Template alterado nao retroage.
- CA-036: Tarefa de template e copiada para snapshot da instancia.
- CA-037: Tarefa ad hoc em `in_progress` exige autoria e motivo.
- CA-038: Tarefa nao e adicionada em Onboarding `completed` ou `cancelled`.
- CA-039: Candidate inactive bloqueia nova criacao.
- CA-040: Candidate inactive posterior nao cancela automaticamente Onboarding
  existente.
- CA-041: Organization archived bloqueia mutacoes funcionais.
- CA-042: Onboarding nunca altera `application_status`.
- CA-043: Onboarding nunca altera `current_stage`.
- CA-044: Onboarding nunca altera Candidate.
- CA-045: Onboarding nunca altera ProposalVersion.
- CA-046: Blueprint nao gera tarefas automaticamente.
- CA-047: Nenhum documento admissional, upload ou storage e criado.
- CA-048: Nenhum dado bancario, saude, dependente ou documento pessoal sensivel
  e persistido.
- CA-049: Nenhuma assinatura juridica e criada.
- CA-050: Nenhuma folha, ponto, beneficios completos, desempenho,
  desenvolvimento ou retencao e criada.
- CA-051: Nenhuma chamada a IA ocorre.
- CA-052: Progresso operacional nao e score de pessoa.
- CA-053: Platform Admin nao opera funcionalmente.
- CA-054: Platform Admin exige motivo para leitura administrativa.
- CA-055: Acesso cross-Organization e bloqueado com mensagem generica.
- CA-056: Acesso cross-candidatura na mesma Organization e bloqueado.
- CA-057: Duas criacoes concorrentes nao produzem dois Onboardings.
- CA-058: Start x cancel produz resultado deterministico.
- CA-059: Complete task x cancel produz resultado deterministico.
- CA-060: Complete task x reassign produz resultado deterministico.
- CA-061: Complete onboarding x add task produz resultado deterministico.
- CA-062: Duas conclusoes da mesma tarefa produzem resultado deterministico.
- CA-063: Instanciacao por template concorrente e atomica.
- CA-064: Criacao, inicio, cancelamento e conclusao sao idempotentes quando
  expostos a retry.
- CA-065: Falha de auditoria critica causa rollback.
- CA-066: Auditoria nao registra dados sensiveis completos.
- CA-067: Nenhuma exclusao fisica de Onboarding ou tarefas ocorre pelo fluxo
  normal.

## 38. Testes obrigatorios

Quando esta SPEC for implementada, os testes devem comprovar:

### Dominio e gatilhos

1. criar Onboarding para `CandidateApplication hired`;
2. bloquear criacao para candidatura `active`;
3. bloquear criacao para candidatura `withdrawn`;
4. bloquear criacao para candidatura `rejected`;
5. bloquear criacao para candidatura `cancelled`;
6. `hired` nao cria Onboarding automaticamente;
7. owner cria Onboarding explicitamente;
8. admin cria Onboarding explicitamente;
9. member nao cria Onboarding;
10. Platform Admin nao cria Onboarding.

### Proposal e fluxo sem Proposal

11. fluxo com Propostas exige `ProposalVersion accepted`;
12. `ProposalVersion accepted` sem `hired` bloqueia Onboarding;
13. ProposalVersion de outra candidatura e recusada;
14. ProposalVersion de outra Organization e recusada;
15. fluxo administrativo sem Proposal permite Onboarding apos `hired`;
16. Onboarding nunca altera ProposalVersion.

### Cardinalidade e estados

17. impedir segundo Onboarding para a mesma CandidateApplication;
18. impedir recriacao apos Onboarding `cancelled`;
19. transicionar `draft` para `in_progress`;
20. transicionar `draft` para `cancelled`;
21. transicionar `in_progress` para `completed`;
22. transicionar `in_progress` para `cancelled`;
23. bloquear reabertura de `completed`;
24. bloquear reabertura de `cancelled`;
25. garantir ausencia dos estados `pending` e `ready`.

### Tarefas e progresso

26. criar tarefa `open`;
27. concluir tarefa atribuida;
28. cancelar tarefa com motivo;
29. tarefa opcional nao bloquear conclusao;
30. tarefa obrigatoria aberta bloquear conclusao;
31. tarefa obrigatoria cancelada exigir motivo;
32. progresso considerar apenas obrigatorias elegiveis;
33. divisao por zero retorna progresso operacional seguro;
34. tarefa ad hoc em `in_progress` exige motivo;
35. bloquear tarefa nova em Onboarding `completed`;
36. bloquear tarefa nova em Onboarding `cancelled`.

### Templates e snapshot

37. criar Onboarding sem template;
38. criar Onboarding a partir de template ativo;
39. bloquear template arquivado;
40. bloquear template de outra Organization;
41. copiar tarefas como snapshot;
42. alterar template nao retroage;
43. arquivar template nao altera Onboarding existente.

### Responsaveis e permissoes

44. atribuir tarefa a Membership ativa da mesma Organization;
45. bloquear assignee Membership de outra Organization;
46. bloquear assignee Membership inativa;
47. Membership inativada depois bloqueia conclusao de tarefa aberta;
48. owner/admin reatribuem tarefa aberta;
49. member conclui tarefa propria;
50. member nao conclui tarefa alheia;
51. pessoa onboardada nao possui rota funcional;
52. zero Membership automatica para pessoa onboardada.

### Candidate, CandidateApplication e Organization

53. Candidate inactive bloqueia nova criacao;
54. Candidate inactive posterior nao cancela automaticamente Onboarding;
55. Candidate inactive posterior permite cancelamento por owner/admin quando
    aplicavel;
56. Onboarding nunca altera Candidate;
57. Onboarding nunca altera `application_status`;
58. Onboarding nunca altera `current_stage`;
59. Organization archived bloqueia criacao;
60. Organization archived bloqueia inicio;
61. Organization archived bloqueia conclusao de tarefa;
62. Organization archived bloqueia conclusao de Onboarding;
63. historico permanece consultavel por canais autorizados.

### Multiempresa

64. bloquear CandidateApplication de outra Organization;
65. bloquear Candidate de outra Organization;
66. bloquear Template de outra Organization;
67. bloquear Task de outro Onboarding;
68. bloquear Onboarding IDOR;
69. mensagem generica para acesso cruzado.

### Concorrencia, idempotencia e atomicidade

70. create x create gera apenas um Onboarding;
71. start x cancel e deterministico;
72. complete task x cancel e deterministico;
73. complete task x reassign e deterministico;
74. complete onboarding x add task e deterministico;
75. duas conclusoes da mesma tarefa geram unico resultado;
76. instanciacao por template concorrente nao cria tarefa parcial;
77. retry idempotente de criacao retorna mesmo resultado;
78. retry idempotente de inicio retorna mesmo resultado;
79. retry idempotente de cancelamento retorna mesmo resultado;
80. retry idempotente de conclusao retorna mesmo resultado;
81. mesma chave idempotente com fingerprint diferente gera conflito;
82. falha no meio da criacao reverte Onboarding e tarefas.

### Privacidade, IA e escopo negativo

83. nao persistir documentos admissionais;
84. nao criar upload/storage;
85. nao persistir CPF/RG;
86. nao persistir dados bancarios;
87. nao persistir saude, dependentes ou exames;
88. nao registrar dados sensiveis completos em auditoria;
89. nao criar Employee/Collaborator;
90. nao criar User/Membership para a pessoa onboardada;
91. nao criar folha, ponto, beneficios completos, desempenho, desenvolvimento
    ou retencao;
92. nenhuma chamada a `AIGateway`, provider, modelo ou Prompt Registry;
93. progresso nunca aparece como score de pessoa.

### Auditoria e persistencia

94. auditoria de criacao;
95. auditoria de inicio;
96. auditoria de tarefa criada;
97. auditoria de tarefa atribuida;
98. auditoria de tarefa concluida;
99. auditoria de tarefa cancelada;
100. auditoria de Onboarding cancelado;
101. auditoria de Onboarding concluido;
102. auditoria de negacao de permissao;
103. auditoria de tentativa cross-Organization;
104. Platform Admin leitura administrativa com motivo;
105. Platform Admin sem motivo recusado;
106. falha de auditoria critica causa rollback;
107. ausencia de exclusao fisica;
108. persistencia permanece apos recriar aplicacao.

## 39. Conflitos encontrados

Nenhum conflito critico ou importante restou apos a revisao.

Tensoes resolvidas:

- SPEC-012 diz que `hired` nao cria onboarding. Esta SPEC preserva: `hired`
  apenas habilita criacao manual posterior.
- SPEC-012 diz que candidatura finalizada nao recebe novas operacoes
  operacionais nesta fase. Esta SPEC declara a excecao de dominio: Onboarding e
  modulo pos-`hired`, nao operacao de recrutamento sobre a candidatura.
- SPEC-015 diz que aceite de proposta nao cria `hired`. Esta SPEC preserva:
  aceite sem `hired` nao cria Onboarding.
- SPEC-015 preserva `hired` sem Proposal fora do fluxo de Propostas. Esta SPEC
  preserva o fluxo administrativo sem Proposal.
- SPEC-011 define Candidate inactive para cadastro de candidato. Esta SPEC nao
  reutiliza cegamente essa regra como cancelamento de pessoa ja contratada.

## 40. Ambiguidades restantes

Ambiguidades nao bloqueantes:

- forma fisica final de templates/versionamento;
- existencia ou nao de timeline funcional alem de `audit_events`;
- mecanismo futuro de acesso da pessoa onboardada;
- eventual migracao futura para Employee/Collaborator;
- politica futura de Onboarding complementar apos `completed`.

Todas estao fora do escopo da v1 e nao impedem implementar checklist interno.

## 41. Limitacoes conhecidas

- Nao implementa codigo, banco, migrations, rotas, APIs, testes executaveis ou
  dependencias.
- Nao cria Employee/Collaborator.
- Nao cria acesso proprio da pessoa onboardada.
- Nao cria documentos admissionais, upload, assinatura, folha, ponto ou
  beneficios completos.
- Nao define notificacoes ou integracoes externas.
- Nao define valores numericos de prazo, limite de tarefas ou limite de
  templates.
- Nao define mecanismo fisico final de idempotencia.
- Nao define schema final de templates.
- Nao define Onboarding complementar.

## 42. Definicao de concluido

Para a implementacao futura desta SPEC:

- SPEC aprovada antes do desenvolvimento;
- nenhuma regra da SPEC-012 ou SPEC-015 automatizada;
- Onboarding criado apenas manualmente apos `hired`;
- fluxo com Proposal validando `ProposalVersion accepted`;
- fluxo sem Proposal preservado;
- no maximo um Onboarding por CandidateApplication;
- estados reduzidos implementados;
- responsavel por tarefa via Membership;
- pessoa onboardada sem acesso funcional;
- criterios de aceite atendidos;
- testes obrigatorios implementados e passando;
- testes de seguranca, multiempresa, cross-candidatura, concorrencia,
  idempotencia e atomicidade passando;
- privacidade e minimizacao revisadas;
- rollback de auditoria critica verificado;
- migrations reproduziveis quando houver banco;
- lint, formatacao e build passando quando houver implementacao;
- documentacao atualizada;
- nenhum modulo de folha, ponto, beneficios, desenvolvimento, retencao,
  assinatura, documento admissional, Employee/Collaborator ou IA implementado
  antecipadamente;
- commit realizado somente na fase de implementacao/documentacao aprovada.
