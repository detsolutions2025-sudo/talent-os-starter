# SPEC-016 - Onboarding

**Status:** Aprovada  
**Versao:** 1.1  
**Fase:** 23  
**Responsavel de negocio:** Thiago Sousa  
**Ultima atualizacao:** 2026-08-18  
**Dependencias:** SPEC-001 - Organization, SPEC-003 - Membership, SPEC-004 - Roles & Permissions, SPEC-010 - Vagas, SPEC-011 - Candidatos, SPEC-012 - Processo Seletivo, SPEC-015 - Propostas, SPEC-018 - Blueprint Organizacional / Implantacao Guiada, SPEC-020 - Candidatura Publica, SPEC-021 - Pre-Entrevista Estruturada, SPEC-022 - Perfil Comportamental, SPEC-023 - Pre-Analise Assistida por IA, SPEC-024 - Dossie Inteligente do Candidato, SPEC-025 - OrganizationPerson e Employment, ADR-0013, ADR-0014, ADR-0015, ADR-0020, ADR-0021, ADR-0022, ADR-0023, ADR-0024 - Identidade e Vinculo Pos-Contratacao

**Nota de revisao (v1.1 - integracao aditiva com Employment, Fase 26):** esta
revisao altera exclusivamente a integracao com `Employment`, formalizando o
que ADR-0024 e SPEC-025 v1.0 (secao 33, "Impacto Futuro na SPEC-016") ja
determinavam textualmente. Nenhuma decisao da v1.0 abaixo foi removida,
enfraquecida ou reinterpretada: o sujeito de criacao do Onboarding continua
sendo `CandidateApplication hired`; a cardinalidade de 1 Onboarding por
`CandidateApplication` continua valendo; os estados canonicos, RBAC,
auditoria, privacidade e regras de negocio RN-001 a RN-030 e criterios de
aceite CA-001 a CA-067 permanecem integralmente em vigor. A v1.1 apenas
adiciona uma referencia opcional, tardia, explicita e imutavel a
`Employment`, detalhada nas secoes 43 a 57. Esta revisao nao implementa
codigo, migration ou banco; a implementacao pertence a Fase 26, tecnicamente
distinta da Fase 23 historica desta SPEC. Ver secao 43 para a justificativa
completa de nao renumerar a Fase de origem.

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

---

# Adendo v1.1 - Integracao com Employment

As secoes 43 a 57 sao aditivas. Nenhuma delas altera, remove ou reinterpreta
qualquer regra das secoes 1 a 42. Onde houver aparente sobreposicao, a secao
1 a 42 permanece a fonte de verdade para tudo que nao for a associacao com
`Employment`.

## 43. Contexto e Objetivo da Integracao

A Fase 24 (SPEC-025 v1.0) criou `OrganizationPerson` e `Employment` como o
vinculo pos-contratacao canonico do Talent OS, formalizado por ADR-0024.
`Employment` nasceu depois de Onboarding (Fase 23) e, por isso, os
Onboardings existentes nao possuem nenhuma referencia tecnica a ele. ADR-0024
("Onboarding") e SPEC-025 v1.0 secao 33 ("Impacto Futuro na SPEC-016") ja
descreviam esse caminho: adicionar `employment_id` nullable a Onboarding, de
forma aditiva, preservando todo o historico existente.

Esta revisao formaliza exatamente esse caminho, sem inventar decisao de
produto nova. Confirmado por inspecao fisica das migrations 0025 e 0026
(Fase 23): nenhuma delas possui `employment_id`; a lacuna e real, nao apenas
documental.

**Formalizacao central desta v1.1:** `Employment` e o vinculo pos-contratacao
canonico da pessoa dentro da Organization (ADR-0024; SPEC-025 secao 3.2).
Onboarding v1.1 reconhece esse fato sem substituir `Candidate` e
`CandidateApplication` como origem historica e aggregate root de criacao do
Onboarding (secoes 4.4, 5 e RN-001 a RN-010, inalteradas). `Employment` e
tratado nesta SPEC exclusivamente como referencia opcional tardia, nunca como
novo sujeito de criacao, novo gatilho de estado, ou substituto de
`CandidateApplication hired`.

**Fase de implementacao:** a implementacao tecnica desta integracao pertence
a **Fase 26** do roadmap (`docs/00-visao/roadmap.md`, secao "Planejamento
pos-Fase 25"). O campo `Fase: 23` no cabecalho desta SPEC identifica a
origem historica do documento (quando o Onboarding em si foi especificado e
implementado), nao a fase em que a integracao com Employment sera
implementada. Nenhuma fase ja executada e renumerada retroativamente,
consistente com a nota ja registrada em `docs/01-produto/BACKLOG.md`
("Fases ja executadas nao devem ser renumeradas retroativamente").

## 44. Associacao e Coerencia de Proveniencia

`Onboarding.employment_id` e um campo opcional, nullable, que referencia um
`Employment` da mesma Organization.

Regras gerais:

- a associacao nunca e automatica; e sempre um ato explicito de owner/admin
  (secao 48);
- a associacao e tenant-safe: `Employment` referenciado deve pertencer a
  mesma `organization_id` do Onboarding; associacao cross-Organization e
  proibida, mesmo que o `Employment` exista e esteja em estado elegivel
  (secao 45);
- a associacao exige coerencia de proveniencia entre `Onboarding` e
  `Employment`. Um `Employment` que nao satisfaz a coerencia abaixo e
  **Employment incompativel** e a associacao deve ser recusada, mesmo dentro
  da mesma Organization.

### 44.1 Regra de Coerencia de Proveniencia

A associacao e permitida somente quando pelo menos uma das duas condicoes
abaixo for satisfeita:

- **(a) Mesma linhagem de recrutamento:** `Employment.origin_type =
  'recruitment'` e `Employment.origin_candidate_application_id =
  Onboarding.candidate_application_id`; ou
- **(b) Mesma pessoa de origem, vinculo administrativo:**
  `Employment.organization_person_id` referencia uma `OrganizationPerson`
  cujo `origin_candidate_id = Onboarding.candidate_id` (mesma pessoa,
  mesmo quando o `Employment` foi criado pelo fluxo administrativo da
  SPEC-025, sem `CandidateApplication` propria).

Se nenhuma das duas condicoes for satisfeita, a associacao e recusada como
**Employment incompativel** (CA-070). Isso inclui, deliberadamente, o caso em
que a `OrganizationPerson` do `Employment` nao possui `origin_candidate_id`
algum: como todo Onboarding exige `CandidateApplication hired` (RN-001), nao
existe base de coerencia possivel para vincula-lo a uma pessoa sem nenhuma
linhagem de Candidate, e a associacao deve ser recusada nesse caso.

Esta regra nao deduz nem infere a associacao; ela apenas valida uma
associacao ja informada explicitamente por owner/admin (secao 47). Consistente
com SPEC-025 secao 5.2: e-mail, nome, telefone ou similaridade nunca
fundamentam a validacao de coerencia desta secao.

## 45. Estados Elegiveis

### 45.1 Estados de Employment elegiveis para nova associacao

| Estado de Employment | Elegivel para nova associacao | Motivo |
| --- | --- | --- |
| `pending` | Sim | Onboarding tipicamente prepara a entrada antes do inicio efetivo; `pending` e o estado natural de um vinculo aprovado ainda nao iniciado (SPEC-025 secao 7). |
| `active` | Sim | Onboarding pode continuar em execucao apos o inicio efetivo do vinculo. |
| `ended` | Nao | Vinculo ja encerrado; associar retroativamente nao tem valor operacional e arrisca representar um vinculo finalizado como se ainda estivesse em preparacao. |
| `cancelled` | Nao | Vinculo nunca chegou a existir operacionalmente (SPEC-025 secao 15); nunca deve fundamentar Onboarding. |

Uma associacao ja existente **nao e desfeita** se o `Employment` associado
transicionar posteriormente para `ended` (progressao natural de lifecycle).
A restricao desta tabela vale apenas para o momento da **nova** associacao,
nao para o historico ja registrado (secao 47, imutabilidade).

### 45.2 Estados de Onboarding que permitem associacao

| Estado de Onboarding | Permite operacao de associacao | Motivo |
| --- | --- | --- |
| `draft` | Sim | Ainda em preparacao interna; nenhuma regra da secao 7 restringe edicoes nesse estado. |
| `in_progress` | Sim | Checklist em execucao; a associacao nao interfere em tarefas nem em progresso. |
| `completed` | Nao | Estado final; a trigger fisica ja existente `enforce_onboarding_update_rules` (migration 0025/0026) bloqueia qualquer UPDATE quando `status IN ('completed', 'cancelled')`, incluindo `employment_id`. |
| `cancelled` | Nao | Mesmo motivo acima. |

## 46. Cardinalidade

- Um `Employment` pode estar vinculado a **no maximo um** Onboarding
  (`0..1`). Cada `Employment` representa um unico periodo de vinculo
  (SPEC-025 secao 3.2); faz sentido, no maximo, um checklist de entrada para
  aquele periodo.
- Um Onboarding pode estar vinculado a **no maximo um** `Employment`
  (`0..1`), pela propria natureza de coluna unica `employment_id`.
- A relacao e, portanto, **opcional 1:1** entre Onboarding e Employment,
  nunca 1:N em nenhuma direcao.
- Um Onboarding **nao pode trocar** de Employment depois de associado (secao
  47, imutabilidade).
- **Recontratacao:** cada novo ciclo de contratacao que passar pelo
  recrutamento produz uma nova `CandidateApplication` e, portanto, um novo
  Onboarding (RN-016 ja impede reaproveitar um Onboarding `completed` ou
  `cancelled` para a mesma candidatura). O novo Onboarding pode, de forma
  independente, ser associado ao novo `Employment` criado para essa
  recontratacao (SPEC-025 secao 8, "recontratacao cria novo Employment").
  Associacoes anteriores permanecem historicas e nunca sao reescritas
  (secao 52).
- **Employment ended/cancelled:** ja coberto pela secao 45 — nao elegivel
  para nova associacao; associacao preexistente permanece historica quando o
  Employment associado se torna `ended` depois.
- **Onboarding completed/cancelled:** ja coberto pela secao 45.2 e pela
  imutabilidade fisica existente — nenhuma associacao nova, alteracao ou
  remocao e possivel apos a finalizacao.

## 47. Momento da Associacao e Imutabilidade

### 47.1 Quando `employment_id` pode ser definido

Avaliadas tres alternativas:

- **A. Somente na criacao do Onboarding:** rejeitada. Forcaria o operador a
  ja conhecer o `Employment` no exato momento em que cria o checklist,
  logo apos `hired` — mas a criacao de `Employment` e um ato independente e
  posterior, por decisao explicita de owner/admin (SPEC-025 secao 9), que
  pode nem ainda ter ocorrido. Acoplar os dois momentos violaria a
  independencia de tempo que a propria SPEC-025 exige entre os dois
  processos.
- **B. Somente por operacao explicita posterior:** adotada. Uma operacao
  dedicada ("vincular Employment"), distinta da criacao, mantem o fluxo de
  criacao do Onboarding (secao 8) inalterado e reduz a superficie de mudanca
  desta revisao ao minimo necessario.
- **C. Em ambos os momentos:** rejeitada por adicionar dois caminhos de
  codigo para o mesmo efeito, sem beneficio normativo adicional, e por
  criar ambiguidade sobre qual caminho e canonico em caso de payload
  divergente.

**Regra normativa unica adotada: alternativa B.** `employment_id` nunca e
aceito no payload de criacao do Onboarding (secao 8 permanece inalterada).
A associacao ocorre exclusivamente por uma operacao explicita e dedicada,
disponivel enquanto o Onboarding estiver em `draft` ou `in_progress` (secao
45.2).

### 47.2 Imutabilidade

- `employment_id` nasce sempre `NULL` na criacao do Onboarding (reforca a
  secao 47.1);
- pode ser definido **exatamente uma vez**, de `NULL` para um valor
  concreto (semantica de escrita unica / write-once);
- uma vez definido, **nunca pode ser removido** (nunca volta a `NULL`);
- uma vez definido, **nunca pode ser substituido** por outro `Employment`
  (nenhuma troca de vinculo em v1.1);
- apos o Onboarding atingir `completed` ou `cancelled`, `employment_id`
  torna-se imutavel pela mesma regra fisica ja existente que imutabiliza
  todo o registro nesses estados (secao 45.2);
- uma correcao de vinculo definido incorretamente fica **fora do escopo da
  v1.1** e exige revisao normativa propria futura (mesmo padrao ja usado
  pela secao 41, "Limitacoes conhecidas", para outras correcoes
  administrativas).

## 48. RBAC do Vinculo

| Acao | owner | admin | member | pessoa onboardada | Platform Admin |
| --- | :---: | :---: | :---: | :---: | :---: |
| Vincular Employment a Onboarding | Sim | Sim | Nao | Nao | Nao |
| Consultar `employment_id` vinculado | Sim | Sim | Nao por padrao | Nao | Nao funcional |
| Leitura administrativa do vinculo | Nao | Nao | Nao | Nao | Sim, com motivo |

Regras adicionais, consistentes com as secoes 3 e 30:

- a operacao de vinculo segue exatamente a mesma matriz ja aplicada a
  "Adicionar tarefa" e "Atribuir responsavel" (secao 30): apenas owner e
  admin;
- member nunca vincula, mesmo quando autorizado a concluir tarefa propria;
- Platform Admin nunca vincula funcionalmente; leitura administrativa do
  vinculo segue a mesma regra ja definida na secao 30 (motivo obrigatorio,
  auditoria, nunca substitui a decisao de owner/admin);
- Organization `archived` bloqueia a operacao de vinculo como mutacao
  funcional, consistente com a secao 23; leitura historica do vinculo ja
  existente permanece possivel pelos canais ja autorizados.

## 49. Auditoria do Vinculo

Eventos obrigatorios, adicionais aos ja listados na secao 34:

- `onboarding.employment_linked` — vinculo bem-sucedido; registra
  `organization_id`, `onboarding_id`, `employment_id`, ator (`user_id`
  e/ou `membership_id`), timestamp;
- `onboarding.employment_link_denied_cross_organization` — tentativa de
  vincular `Employment` de outra Organization;
- `onboarding.employment_link_denied_incompatible` — tentativa de vincular
  `Employment` que falha a regra de coerencia de proveniencia (secao 44.1);
- `onboarding.employment_link_conflict` — tentativa de redefinir ou
  substituir um `employment_id` ja definido, ou conflito de concorrencia
  (secao 50).

Leitura administrativa do vinculo por Platform Admin reaproveita o evento ja
existente `onboarding.administrative_read` (secao 34); nenhum evento novo e
necessario para esse caso.

Auditoria nunca registra: nome, e-mail ou qualquer PII da pessoa; conteudo
do `Employment` alem do seu identificador interno; motivo de origem do
`Employment` (`origin_reason`). Apenas identificadores internos, tipo de
evento, ator, Organization, timestamp e resultado, consistente com a secao
34.

## 50. Idempotencia e Concorrencia do Vinculo

A operacao de vinculo exige `Idempotency-Key`, seguindo o mesmo padrao ja
exigido pela secao 32 para criacao, inicio, cancelamento e conclusao de
Onboarding.

Cenarios obrigatorios:

- **link x link (mesmo Employment):** primeira operacao confirmada grava
  `employment_id`; retry com a mesma `Idempotency-Key` e mesmo
  `employment_id` retorna o mesmo resultado (idempotente);
- **link x link (Employment diferente):** a segunda tentativa, com
  `employment_id` diferente da ja gravada, e sempre recusada como conflito
  seguro (write-once, secao 47.2) — independente de chave de idempotencia;
- **link x start:** operacoes independentes; `start` (secao 8) nao depende
  do vinculo. A operacao de vinculo deve revalidar, na mesma transacao, que
  o Onboarding ainda esta em `draft` ou `in_progress` antes de confirmar;
- **link x cancel:** se o cancelamento confirmar primeiro, a operacao de
  vinculo subsequente falha (Onboarding final, secao 45.2); se o vinculo
  confirmar primeiro, o cancelamento prossegue normalmente e o vinculo
  permanece como historico (secao 46);
- **link x Employment activate/end/cancel:** a operacao de vinculo deve
  revalidar o estado atual do `Employment` dentro da mesma transacao
  (bloqueio transacional equivalente a `SELECT ... FOR UPDATE`, consistente
  com ADR-0020 "Isolamento Multiempresa" e SPEC-025 secao 22) antes de
  confirmar. Se o `Employment` transicionar para `ended` ou `cancelled`
  entre a leitura e a escrita, o vinculo deve falhar com conflito, nunca
  persistir associacao a um `Employment` que se tornou inelegivel durante a
  propria operacao;
- **retries com mesma Idempotency-Key:** mesma chave + mesmo fingerprint em
  estado `completed` retornam o mesmo resultado; mesma chave + fingerprint
  divergente gera conflito seguro, nunca duplica nem sobrescreve efeito
  (mesmo padrao da secao 32);
- **lock order:** para evitar deadlock entre modulos, a operacao de vinculo
  sempre adquire o bloqueio da linha de `onboardings` antes da linha de
  `employments`, nessa ordem fixa.

## 51. Integridade Fisica Futura (conceitual, sem SQL nesta tarefa)

Para avaliacao na Fase 26 (nenhum SQL e criado por esta revisao):

- `employment_id TEXT NULL` em `onboardings`;
- FK composta tenant-safe: `(organization_id, employment_id) REFERENCES
  employments (organization_id, id)`, nullable;
- indice parcial `UNIQUE (organization_id, employment_id) WHERE
  employment_id IS NOT NULL`, para impor a cardinalidade `0..1` do lado do
  Employment (secao 46);
- indice de apoio `(organization_id, employment_id) WHERE employment_id IS
  NOT NULL` para consulta reversa (Employment -> Onboarding), se distinto do
  indice de unicidade acima;
- extensao da trigger fisica ja existente `enforce_onboarding_update_rules`
  (migrations 0025/0026) para bloquear:
  - `employment_id` sendo definido fora da transicao `NULL -> valor`;
  - qualquer tentativa de alterar um `employment_id` ja nao-nulo;
  - a imutabilidade em `completed`/`cancelled` ja e coberta pela regra
    geral existente (`onboarding_final_immutable`), sem necessidade de
    logica nova para esse caso.

## 52. Compatibilidade Retroativa

- todo Onboarding historico com `employment_id NULL` continua
  integralmente valido; nenhuma obrigatoriedade retroativa e criada;
- a migration futura da Fase 26 deve ser estritamente aditiva
  (`ADD COLUMN ... NULL`, sem reescrever linhas existentes);
- `employment_id` nasce `NULL` para todo Onboarding, historico ou novo;
- **zero backfill inferido automaticamente**: nenhuma migration ou rotina
  administrativa pode preencher `employment_id` adivinhando por
  `Candidate`, e-mail, nome ou `Membership` — apenas a operacao explicita da
  secao 47 grava o campo;
- consistente com SPEC-025 secao 5.2 (evidencias sugestivas nunca fazem
  merge automatico), aplicada aqui por decisao explicita desta SPEC, nunca
  por analogia implicita;
- nenhuma provenance historica e reescrita: `candidate_application_id` e
  `candidate_id` do Onboarding permanecem exatamente como estao hoje,
  nunca substituidos ou complementados retroativamente pelo `employment_id`.

## 53. Impacto sobre Outras Entidades

- **Candidate:** nenhum impacto. Continua referencia transitoria do
  Onboarding (secao 4.2), inalterada.
- **CandidateApplication:** nenhum impacto. Continua origem historica e
  aggregate root de criacao do Onboarding (secao 4.4, RN-001 a RN-010),
  inalterada. Onboarding continua nunca alterando `application_status` ou
  `current_stage` (CA-042, CA-043).
- **ProposalVersion:** nenhum impacto.
- **OrganizationPerson:** nenhuma alteracao de schema ou regra propria;
  usada somente como leitura, para a checagem de coerencia de proveniencia
  da secao 44.1.
- **Employment:** nenhuma alteracao de schema, lifecycle ou regra propria
  em `employments`; recebe apenas uma referencia opcional externa vinda de
  `onboardings`. Confirma-se explicitamente (secao 54, zero automacao):
  criacao ou ativacao de `Employment` nunca cria, inicia ou conclui
  Onboarding.
- **User / Membership:** nenhum impacto; nenhuma associacao nova a acesso e
  criada por esta revisao.
- **Development/Retention (SPEC-017):** nenhum impacto direto. SPEC-017 ja
  usa `Employment` como aggregate root proprio e independente; esta secao
  nao cria, autoriza nem antecipa qualquer leitura cruzada entre Onboarding
  e SPEC-017. Qualquer uso futuro de contexto de Onboarding por SPEC-017
  exigiria revisao normativa propria daquela SPEC, nao desta.

## 54. Zero Automacao (reforco explicito desta v1.1)

Reforcando o pedido de nao automacao implicita:

- `hired` **nao** cria `Employment` (ja regido por SPEC-025 secao 27; esta
  SPEC nao cria excecao);
- `ProposalVersion accepted` **nao** cria `Employment` (idem);
- criacao de Onboarding **nao** cria `Employment`;
- inicio (`start`) de Onboarding **nao** cria nem ativa `Employment`;
- conclusao de Onboarding **nao** cria nem ativa `Employment` (reforca a
  secao 28, ja vigente desde a v1.0);
- criacao ou ativacao de `Employment` **nao** cria, inicia ou conclui
  Onboarding.

Toda associacao entre as duas entidades e, sempre e somente, o ato explicito
descrito na secao 47.

## 55. Criterios de Aceite da v1.1

- CA-068: `employment_id` e opcional e nasce `NULL` em todo Onboarding.
- CA-069: Onboardings historicos com `employment_id NULL` permanecem
  validos.
- CA-070: associacao a `Employment` incompativel (secao 44.1) e recusada.
- CA-071: associacao a `Employment` de outra Organization e recusada.
- CA-072: associacao a `Employment` `ended` e recusada.
- CA-073: associacao a `Employment` `cancelled` e recusada.
- CA-074: associacao a `Employment` `pending` e permitida.
- CA-075: associacao a `Employment` `active` e permitida.
- CA-076: `employment_id` nao pode ser informado na criacao do Onboarding.
- CA-077: associacao e permitida em Onboarding `draft`.
- CA-078: associacao e permitida em Onboarding `in_progress`.
- CA-079: associacao e recusada em Onboarding `completed`.
- CA-080: associacao e recusada em Onboarding `cancelled`.
- CA-081: `employment_id` definido nao pode ser removido.
- CA-082: `employment_id` definido nao pode ser substituido por outro
  Employment.
- CA-083: um Employment esta vinculado a no maximo um Onboarding.
- CA-084: `hired` nao cria Employment.
- CA-085: `ProposalVersion accepted` nao cria Employment.
- CA-086: criacao de Onboarding nao cria Employment.
- CA-087: inicio de Onboarding nao cria nem ativa Employment.
- CA-088: conclusao de Onboarding nao cria nem ativa Employment.
- CA-089: criacao/ativacao de Employment nao cria, inicia ou conclui
  Onboarding.
- CA-090: apenas owner/admin vinculam Employment a Onboarding.
- CA-091: member nao vincula Employment a Onboarding.
- CA-092: Platform Admin nao vincula funcionalmente; leitura administrativa
  exige motivo.
- CA-093: Organization archived bloqueia a operacao de vinculo.
- CA-094: vinculo bem-sucedido gera auditoria
  `onboarding.employment_linked`.
- CA-095: tentativa cross-Organization gera auditoria
  `onboarding.employment_link_denied_cross_organization`.
- CA-096: tentativa de Employment incompativel gera auditoria
  `onboarding.employment_link_denied_incompatible`.
- CA-097: conflito de vinculo gera auditoria
  `onboarding.employment_link_conflict`.
- CA-098: auditoria do vinculo nao registra PII.
- CA-099: operacao de vinculo exige Idempotency-Key.
- CA-100: retry idempotente do vinculo retorna o mesmo resultado.
- CA-101: mesma chave com fingerprint divergente gera conflito seguro.
- CA-102: link x cancel produz resultado deterministico.
- CA-103: link x Employment end/cancel concorrente produz resultado
  deterministico, nunca persiste vinculo a Employment inelegivel.
- CA-104: nenhuma migration de backfill infere `employment_id`
  automaticamente por Candidate, e-mail, nome ou Membership.
- CA-105: `candidate_application_id` e `candidate_id` historicos do
  Onboarding nunca sao reescritos por esta integracao.

## 56. Testes Obrigatorios Futuros da v1.1 (Fase 26)

Quando esta integracao for implementada, os testes devem comprovar:

### Historico e compatibilidade

1. Onboarding historico com `employment_id NULL` permanece valido e
   consultavel;
2. migration aditiva nao altera nenhuma linha existente;
3. nenhum backfill automatico ocorre para Onboardings pre-existentes.

### Vinculo valido

4. vincular Employment `pending` da mesma Organization;
5. vincular Employment `active` da mesma Organization;
6. vinculo bem-sucedido preserva `candidate_application_id` e
   `candidate_id` inalterados.

### Cross-tenant e incompatibilidade

7. bloquear vinculo a Employment de outra Organization;
8. bloquear vinculo a Employment `ended`;
9. bloquear vinculo a Employment `cancelled`;
10. bloquear vinculo quando `origin_candidate_application_id` do Employment
    diverge de `candidate_application_id` do Onboarding e a
    `OrganizationPerson` nao possui o mesmo `origin_candidate_id`;
11. permitir vinculo administrativo quando `OrganizationPerson.origin_candidate_id`
    coincide com `Onboarding.candidate_id`, mesmo sem
    `CandidateApplication` propria no Employment;
12. bloquear vinculo quando a OrganizationPerson do Employment nao possui
    nenhum `origin_candidate_id`.

### Cardinalidade

13. um Employment vinculado a um segundo Onboarding e recusado;
14. um Onboarding vinculado a um segundo Employment (troca) e recusado.

### Lifecycle e imutabilidade

15. bloquear definicao de `employment_id` no payload de criacao do
    Onboarding;
16. permitir vinculo em Onboarding `draft`;
17. permitir vinculo em Onboarding `in_progress`;
18. bloquear vinculo em Onboarding `completed`;
19. bloquear vinculo em Onboarding `cancelled`;
20. bloquear remocao de `employment_id` ja definido;
21. bloquear substituicao de `employment_id` ja definido.

### RBAC

22. owner vincula Employment;
23. admin vincula Employment;
24. member nao vincula Employment;
25. Platform Admin nao vincula funcionalmente;
26. Platform Admin le vinculo com motivo;
27. Platform Admin sem motivo e recusado;
28. Organization archived bloqueia vinculo.

### Idempotencia e concorrencia

29. retry idempotente do vinculo retorna mesmo resultado;
30. mesma chave com fingerprint divergente gera conflito;
31. duas tentativas de vinculo concorrentes com o mesmo Employment nao
    duplicam efeito;
32. tentativa de vinculo com Employment diferente apos vinculo ja
    confirmado e recusada;
33. link x start concorrente e deterministico;
34. link x cancel concorrente e deterministico;
35. link x Employment activate concorrente e deterministico;
36. link x Employment end concorrente nunca persiste vinculo a Employment
    que terminou durante a operacao;
37. link x Employment cancel concorrente nunca persiste vinculo a Employment
    cancelado durante a operacao.

### No-delete e imutabilidade geral

38. nenhuma exclusao fisica de Onboarding ou Employment ocorre por esta
    integracao;
39. vinculo persiste como historico apos Employment associado se tornar
    `ended`.

### Zero automacao

40. `hired` nao cria Employment;
41. `ProposalVersion accepted` nao cria Employment;
42. criacao de Onboarding nao cria Employment;
43. inicio de Onboarding nao cria nem ativa Employment;
44. conclusao de Onboarding nao cria nem ativa Employment;
45. criacao de Employment nao cria Onboarding;
46. ativacao de Employment nao inicia nem conclui Onboarding.

### Privacidade e auditoria

47. auditoria de vinculo bem-sucedido nao contem PII;
48. auditoria de tentativa cross-Organization nao revela existencia do
    registro de outra Organization;
49. auditoria de Employment incompativel nao expoe dados do Employment
    alem do identificador.

### Regressao

50. regressao completa de Phase23 (Onboarding v1.0) permanece verde;
51. regressao completa de Phase24 (Employment v1.0) permanece verde;
52. regressao completa de Phase25 (Desenvolvimento e Retencao) permanece
    verde, confirmando que a integracao nao afeta o aggregate root que
    SPEC-017 ja usa.

## 57. Revisao Destrutiva do Delta v1.0 -> v1.1

Verificacao explicita de contradicoes com ADR-0024, SPEC-025 e o
comportamento fisico ja implementado na Fase 23:

- **ADR-0024, secao "Onboarding":** exige integracao aditiva, explicita, sem
  invalidar historicos existentes. Atendido integralmente pelas secoes 43,
  47 e 52.
- **ADR-0024, secao "User e Membership":** exige que associacoes futuras de
  `Employment` com acesso sejam "explicita, auditavel e revogavel". Esta
  ADR trata association a `User`/`Membership` (acesso ao sistema), nao a
  associacao Onboarding-Employment desta SPEC. A v1.1 adota explicita e
  auditavel (secoes 47 e 49), mas **nao** revogavel (imutavel apos definida,
  secao 47.2). Isso nao contradiz a ADR: revogabilidade foi exigida por
  ADR-0024 especificamente para concessao de acesso, que e uma decisao de
  seguranca de maior risco; a referencia historica desta SPEC nao concede
  acesso a ninguem, e uma regra mais restritiva (imutavel) e um subconjunto
  seguro de "auditavel", nunca um enfraquecimento.
- **SPEC-025, secao 33 ("Impacto Futuro na SPEC-016"):** todos os cinco
  pontos listados sao atendidos: `employment_id` nullable (secao 51);
  onboardings existentes preservados (secao 52); `candidate_application_id`
  e `candidate_id` historicos mantidos (secao 52); associacao explicita e
  auditada (secoes 47 e 49); Onboarding nunca cria nem ativa Employment
  automaticamente (secao 54).
- **SPEC-025, secao 17 ("Onboarding"):** "Onboarding futuro pode referenciar
  Employment explicitamente, sem apagar `candidate_application_id` e
  `candidate_id` historicos" — atendido pela secao 52.
- **Comportamento fisico ja implementado na Fase 23 (migrations 0025 e
  0026):** a trigger `enforce_onboarding_update_rules` ja bloqueia qualquer
  `UPDATE` em Onboarding `completed`/`cancelled`. A imutabilidade de
  `employment_id` apos finalizacao (secao 45.2) e coberta de graca por essa
  regra ja existente, sem necessidade de logica nova para esse caso — apenas
  o caso "trocar um `employment_id` ja definido enquanto ainda `draft`/
  `in_progress`" exige extensao futura da trigger (secao 51), que e aditiva
  e nao contradiz nenhuma regra fisica ja aplicada.
- **SPEC-012 e SPEC-015:** nenhuma regra dessas SPECs e tocada; a
  integracao nao acessa nem altera `CandidateApplication` ou `Proposal`.
- **SPEC-017:** nenhuma regra e tocada; SPEC-017 continua usando `Employment`
  como aggregate root proprio e independente (secao 53).

**Conclusao da revisao destrutiva: nenhum conflito bloqueante foi
encontrado.**

### Conflitos restantes

Nenhum.

### Ambiguidades restantes (nao bloqueantes, fora do escopo da v1.1)

- correcao de um `employment_id` definido incorretamente (secao 47.2) fica
  para revisao normativa futura;
- coerencia entre `Onboarding.expected_person_start_date` e
  `Employment.effective_start_date` nao e normativamente exigida nesta
  revisao; divergencias entre as duas datas sao esperadas na pratica (por
  exemplo, mudanca de data apos a proposta) e nao bloqueiam a associacao;
- leitura futura de contexto de Onboarding por SPEC-017 (Desenvolvimento e
  Retencao) nao e definida aqui e exigiria revisao propria daquela SPEC;
- forma fisica final de indice de consulta reversa (Employment ->
  Onboarding), alem da unicidade parcial ja definida na secao 51, fica para
  o plano tecnico da Fase 26.

## 58. Definicao de Concluido da Integracao (v1.1)

Para esta tarefa documental (revisao da SPEC-016):

- SPEC-016 v1.0 lida integralmente antes da revisao;
- SPEC-025 v1.0 e ADR-0024 lidas integralmente antes da revisao;
- migrations 0025, 0026 e 0027 inspecionadas fisicamente;
- implementacao atual de onboardings e employments inspecionada;
- nenhuma decisao valida da SPEC-016 v1.0 foi alterada, enfraquecida ou
  removida;
- `Employment` formalizado como vinculo pos-contratacao canonico, sem
  substituir `Candidate`/`CandidateApplication` como provenance do
  Onboarding;
- associacao definida: nullable, explicita, tenant-safe, coerente por
  proveniencia, write-once, sem automacao implicita;
- cardinalidade definida: `0..1` em ambas as direcoes;
- estados elegiveis de Employment e de Onboarding definidos e justificados;
- RBAC, auditoria, idempotencia e concorrencia do vinculo definidos;
- integridade fisica futura avaliada conceitualmente, sem SQL criado nesta
  tarefa;
- compatibilidade retroativa garantida, com zero backfill inferido;
- impacto sobre Candidate, CandidateApplication, ProposalVersion,
  OrganizationPerson, Employment, User, Membership e SPEC-017 revisado;
- criterios de aceite (CA-068 a CA-105) e testes obrigatorios futuros
  (1 a 52 desta secao) definidos;
- revisao destrutiva do delta v1.0 -> v1.1 concluida sem conflito
  bloqueante;
- nenhum codigo, migration, banco ou teste executavel foi criado ou
  alterado por esta revisao;
- nenhum commit foi realizado por esta revisao.

Para a implementacao futura (Fase 26):

- este adendo mantido aprovado antes do desenvolvimento;
- plano tecnico da Fase 26 elaborado a partir das secoes 43 a 57;
- migration aditiva reproduzivel quando implementada;
- criterios de aceite CA-068 a CA-105 implementados;
- testes obrigatorios 1 a 52 desta secao implementados e passando;
- regressao completa de Phase23, Phase24 e Phase25 verde;
- seguranca, privacidade, multiempresa, idempotencia e concorrencia
  revisadas;
- documentacao dependente atualizada;
- commit realizado somente na fase de implementacao aprovada.
