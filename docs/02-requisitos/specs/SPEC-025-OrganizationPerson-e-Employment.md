# SPEC-025 - OrganizationPerson e Employment

**Status:** Aprovada  
**Versao:** 1.0  
**Fase:** 24  
**Responsavel de negocio:** Thiago Sousa  
**Dependencias:** ADR-0024 - Identidade e Vinculo Pos-Contratacao, ADR-0020 - Organization como unidade autonoma, ADR-0023 - Jornada Inteligente do Candidato, SPEC-003 - Membership, SPEC-011 - Candidatos, SPEC-012 - Processo Seletivo, SPEC-015 - Propostas, SPEC-016 - Onboarding  
**Ultima atualizacao:** 2026-08-16

**Nota de revisao (v1.0):** esta versao incorpora a revisao destrutiva da
antiga v0.2, agora reconciliada com o planejamento oficial: a SPEC-025 foi
formalizada como Fase 24, antes da SPEC-017. A ADR-0024 permanece a autoridade
arquitetural central desta decisao.

## 1. Objetivo

Definir regras operacionais implementaveis para as entidades fundacionais do
dominio pos-contratacao:

- `OrganizationPerson`;
- `Employment`.

Esta SPEC transforma a ADR-0024 em comportamento normativo: identidade,
cardinalidade, criacao, reuso, deduplicacao, lifecycle, proveniencia, datas,
privacidade, multiempresa, permissoes, idempotencia, concorrencia, atomicidade,
historico, auditoria, API conceitual, UI conceitual, banco conceitual,
criterios de aceite e testes futuros.

Esta SPEC desbloqueia conceitualmente a revisao futura da SPEC-017, mas nao
altera nem aprova a SPEC-017.

## 2. Fora do Escopo

Esta SPEC nao define nem implementa:

- codigo;
- migration;
- alteracao de banco;
- rotas, servicos ou UI executavel;
- testes executaveis;
- alteracao da ADR-0024;
- alteracao da SPEC-016;
- alteracao da SPEC-017;
- alteracao de BACKLOG ou roadmap;
- folha de pagamento;
- beneficios;
- ponto;
- documentos admissionais;
- contrato juridico;
- assinatura eletronica;
- CPF, RG, dados bancarios, saude, dependentes ou documentos pessoais;
- remuneracao detalhada;
- performance review;
- offboarding juridico;
- portal proprio da pessoa contratada;
- acesso automatico por User ou Membership;
- cargo, posicao permanente, area, gestor ou centro de custo;
- merge/split de identidade;
- score, ranking, inferencia, decisao automatica ou IA.

## 3. Conceitos e Cardinalidade

### 3.1 OrganizationPerson

`OrganizationPerson` representa a identidade humana pos-contratacao dentro de
uma unica `Organization`.

Cardinalidade:

```text
Organization 1:N OrganizationPerson
OrganizationPerson 1:N Employment
```

`OrganizationPerson` nao e:

- `Candidate`;
- `User`;
- `Membership`;
- `Employment`;
- `Person` global;
- cargo, contrato ou vinculo ativo.

Regras:

- pertence exatamente a uma `Organization`;
- nao muda de `Organization`;
- nao existe identidade global cross-tenant;
- nao concede acesso ao sistema;
- nao recebe lifecycle artificial para refletir `Employment`;
- pode existir sem `Employment` ativo;
- pode agrupar multiplos `Employment` historicos da mesma pessoa dentro da
  mesma Organization;
- pode ser reutilizada em recontratacao dentro da mesma Organization;
- pessoas em Organizations distintas jamais sao fundidas automaticamente.

### 3.2 Employment

`Employment` representa um vinculo concreto e historico entre uma
`OrganizationPerson` e a mesma `Organization`.

`Employment` e o aggregate root operacional para capacidades
pos-contratacao, incluindo futuramente:

- Desenvolvimento;
- Retencao;
- Performance;
- Offboarding;
- outros modulos vinculados ao vinculo.

`Employment` nao e:

- conta autenticavel;
- permissao de acesso;
- cadastro de candidato;
- candidatura;
- proposta;
- onboarding;
- contrato juridico;
- folha;
- cargo permanente.

`OrganizationPerson` agrupa a identidade intra-Organization. `Employment`
continua sendo o sujeito operacional correto para planos, objetivos, acoes,
sinais, historicos e processos pos-contratacao.

## 4. OrganizationPerson - Dados Minimos

Campos conceituais minimos:

| Campo | Obrigatorio | Observacao |
| --- | ---: | --- |
| `id` | Sim | Identificador interno. |
| `organization_id` | Sim | Organization proprietaria. |
| `display_name` | Sim | Nome minimo exibivel. Pode ser preenchido a partir de fonte administrativa ou origem historica. |
| `preferred_name` | Nao | Nome preferido/social quando necessario para uso operacional. |
| `primary_email` | Nao | Evidencia de contato, nunca identidade forte. |
| `origin_candidate_id` | Nao | Proveniencia opcional e imutavel quando a pessoa vier do recrutamento. |
| `created_by_user_id` | Sim | Owner/admin que criou ou confirmou a criacao. |
| `updated_by_user_id` | Nao | Ultima atualizacao administrativa permitida. |
| `created_at` | Sim | Timestamp tecnico de criacao. |
| `updated_at` | Sim | Timestamp tecnico de atualizacao. |

`legal_name` fica fora do nucleo v1, salvo revisao futura que justifique a
finalidade. A v1 evita transformar `OrganizationPerson` em perfil geral de RH.

Questionamento de minimizacao: nome e e-mail so devem ser materializados quando
forem necessarios para operacao interna. Quando a identificacao puder ser
resolvida por referencia historica autorizada sem perda de usabilidade, a
implementacao futura deve preferir nao duplicar PII.

## 5. Criacao e Reuso de OrganizationPerson

Criacao e reuso devem ser explicitos, deterministas, transacionais e auditados.

### 5.1 Evidencias fortes

Sao evidencias fortes para reutilizar `OrganizationPerson`:

- referencia explicita a `organization_person_id` existente da mesma
  Organization, selecionada por owner/admin;
- `origin_candidate_id` ja vinculado a uma `OrganizationPerson` existente da
  mesma Organization;
- operacao idempotente repetida com mesma chave/fingerprint e mesma origem.

### 5.2 Evidencias sugestivas

Sao apenas evidencias sugestivas:

- e-mail normalizado;
- nome;
- telefone;
- similaridade de dados;
- Candidate com dados parecidos;
- mais de uma candidatura `hired` com aparencia de mesma pessoa.

Evidencia sugestiva nunca executa merge automatico. O sistema pode alertar
owner/admin e exigir escolha explicita.

### 5.3 Quando criar nova OrganizationPerson

Criar nova `OrganizationPerson` quando:

- owner/admin escolher criacao nova explicitamente;
- nao houver `OrganizationPerson` vinculada ao `origin_candidate_id`;
- houver apenas evidencias sugestivas e nenhuma referencia forte;
- o fluxo administrativo nao possuir Candidate de origem;
- houver ambiguidade que nao possa ser resolvida com seguranca pelo ator
  autorizado.

### 5.4 Quando reutilizar OrganizationPerson existente

Reutilizar `OrganizationPerson` existente quando:

- owner/admin informar explicitamente `organization_person_id` da mesma
  Organization;
- o Candidate de origem ja estiver associado a exatamente uma
  `OrganizationPerson` da mesma Organization;
- retry idempotente da mesma operacao retornar recurso ja criado.

### 5.5 Candidate como provenance

Na v1, dentro da mesma Organization, deve existir no maximo uma
`OrganizationPerson` com determinado `origin_candidate_id` nao nulo.

Essa regra nao transforma Candidate em colaborador. Ela apenas impede duplicar a
identidade pos-contratacao quando a proveniencia forte e o mesmo Candidate.

### 5.6 Concorrencia de criacao

Em `create x create` para mesma origem forte:

- a primeira transacao confirmada cria ou reutiliza a `OrganizationPerson`;
- a segunda deve retornar o mesmo recurso quando for retry idempotente, ou
  conflito seguro quando for operacao distinta;
- nunca podem surgir duas `OrganizationPerson` com o mesmo
  `origin_candidate_id` dentro da mesma Organization.

Duas candidaturas `hired` da mesma pessoa chegando simultaneamente nao geram
merge por nome/e-mail. Se compartilharem o mesmo `Candidate`, aplicam a regra
de `origin_candidate_id`. Se forem Candidates distintos, o sistema deve exigir
decisao explicita de owner/admin para reutilizar uma pessoa existente.

Merge, split e correcao estrutural de identidade ficam fora da v1.

## 6. Employment - Dados Minimos

Campos conceituais minimos:

| Campo | Obrigatorio | Observacao |
| --- | ---: | --- |
| `id` | Sim | Identificador interno. |
| `organization_id` | Sim | Organization proprietaria. |
| `organization_person_id` | Sim | Pessoa da mesma Organization. |
| `status` | Sim | `pending`, `active`, `ended`, `cancelled`. |
| `origin_type` | Sim | `recruitment` ou `administrative`. |
| `origin_reason` | Sim | Motivo/origem administrativa ou descricao minimizada da origem. |
| `origin_candidate_id` | Nao | Exigido quando houver origem por recrutamento. |
| `origin_candidate_application_id` | Nao | Exigido no fluxo de recrutamento; deve estar `hired`. |
| `origin_proposal_version_id` | Nao | Opcional; exige `accepted` e mesma candidatura. |
| `origin_job_opening_id` | Nao | Proveniencia historica. |
| `origin_job_opening_version_id` | Nao | Proveniencia historica. |
| `decision_at` | Nao | Momento da decisao/origem; pode vir do `hired` ou de ato administrativo. |
| `effective_start_date` | Sim | Data prevista ou efetiva de inicio do vinculo. |
| `started_at` | Nao | Timestamp da transicao para `active`. |
| `end_date` | Nao | Data efetiva informada para fim do vinculo. |
| `ended_at` | Nao | Timestamp da transicao para `ended`. |
| `end_reason` | Nao | Obrigatorio ao encerrar. |
| `cancelled_at` | Nao | Timestamp da transicao para `cancelled`. |
| `cancellation_reason` | Nao | Obrigatorio ao cancelar. |
| `created_by_user_id` | Sim | Ator que criou. |
| `activated_by_user_id` | Nao | Ator que ativou. |
| `ended_by_user_id` | Nao | Ator que encerrou. |
| `cancelled_by_user_id` | Nao | Ator que cancelou. |
| `created_at` | Sim | Timestamp tecnico de criacao. |
| `updated_at` | Sim | Timestamp tecnico de atualizacao. |

`decision_at` e `created_at` nao sao equivalentes. `decision_at` descreve a
origem de negocio; `created_at` descreve persistencia tecnica.

## 7. Semantica de Pending

`pending` representa um vinculo pos-contratacao aprovado/criado explicitamente,
mas ainda nao iniciado operacionalmente.

`pending` pode existir:

- apos `CandidateApplication hired`, no fluxo de recrutamento;
- sem `CandidateApplication`, no fluxo administrativo;
- antes do primeiro dia de trabalho/prestacao;
- com `effective_start_date` futura.

`pending` nao pode existir como estado generico sem origem. Todo `pending`
exige:

- `OrganizationPerson` valida;
- `origin_type`;
- `origin_reason`;
- `effective_start_date`;
- autoria;
- auditoria.

`pending -> active` ocorre somente por acao explicita de owner/admin. Data,
cron, job, `effective_start_date`, `ProposalVersion accepted`, `hired` ou
`Onboarding completed` nunca ativam automaticamente o vinculo.

Ativacao antes de `effective_start_date` e permitida somente por owner/admin
com justificativa explicita, registrada em auditoria. A SPEC nao define regra
trabalhista; define apenas rastreabilidade.

## 8. Lifecycle de Employment

Estados canonicos:

- `pending`;
- `active`;
- `ended`;
- `cancelled`.

Transicoes permitidas:

| De | Para | Ator | Regra |
| --- | --- | --- | --- |
| inexistente | `pending` | owner/admin | Criacao explicita por recrutamento ou fluxo administrativo. |
| `pending` | `active` | owner/admin | Ativacao explicita, com `started_at`. |
| `pending` | `cancelled` | owner/admin | Cancelamento antes de ativacao, com motivo. |
| `active` | `ended` | owner/admin | Encerramento, com motivo e data efetiva. |

Transicoes proibidas:

- `pending -> ended`;
- `active -> pending`;
- `active -> cancelled`;
- `ended -> pending`;
- `ended -> active`;
- `ended -> cancelled`;
- `cancelled -> pending`;
- `cancelled -> active`;
- `cancelled -> ended`;
- qualquer reabertura de estado final.

`ended` e `cancelled` sao finais. Recontratacao cria novo `Employment`.

## 9. Criacao de Employment

Criacao sempre produz `Employment pending`. Nao existe criacao direta em
`active`, `ended` ou `cancelled` nesta v1.

Owner e admin podem criar `Employment`. Nao ha base normativa atual para tornar
a criacao owner-only, porque SPEC-016 permite owner/admin operar onboarding e a
ADR-0024 nao restringe esse ato a owner. Uma revisao futura pode restringir se
o produto exigir.

### 9.1 Fluxo A - origem em recrutamento

Pre-condicoes:

- `CandidateApplication.application_status = hired`;
- `CandidateApplication` pertence a mesma Organization;
- `Candidate` pertence a mesma Organization;
- `OrganizationPerson` e criada/reutilizada conforme as regras desta SPEC;
- `origin_candidate_id` e `origin_candidate_application_id` sao preenchidos;
- `effective_start_date` e informada;
- `origin_reason` e registrada.

Se `origin_proposal_version_id` for informado:

- deve pertencer a mesma Organization;
- deve pertencer a mesma `CandidateApplication`;
- deve estar `accepted`;
- Proposal accepted sozinha nao basta: a candidatura precisa estar `hired`.

Onboarding nao e pre-condicao universal para criar `Employment`. Onboarding
ausente ou historico nao bloqueia criacao por recrutamento.

### 9.2 Fluxo B - criacao administrativa sem recrutamento

Pre-condicoes:

- owner/admin informa ou cria `OrganizationPerson`;
- `origin_type = administrative`;
- nao inventar Candidate, CandidateApplication ou Proposal;
- `origin_reason` e obrigatorio;
- `effective_start_date` e obrigatoria;
- auditoria critica e obrigatoria.

Esse fluxo cobre pessoas contratadas fora do modulo de recrutamento,
historicos anteriores ou entradas administrativas legitimas.

## 10. Proveniencia

Proveniencia e referencia historica, nao dependencia operacional eterna.

Referencias opcionais:

- `Candidate`;
- `CandidateApplication`;
- `ProposalVersion`;
- `JobOpening`;
- `JobOpeningVersion`;
- futuramente, `Onboarding`.

Integridade obrigatoria quando coexistirem:

- todas as referencias pertencem a mesma Organization;
- `origin_candidate_application_id` aponta para o mesmo `origin_candidate_id`;
- `origin_proposal_version_id` aponta para a mesma `CandidateApplication`;
- `origin_job_opening_id` e `origin_job_opening_version_id` devem ser coerentes
  com a `CandidateApplication` quando houver origem de recrutamento;
- `ProposalVersion` deve estar `accepted` quando referenciada;
- `CandidateApplication` deve estar `hired` no momento da criacao por
  recrutamento;
- referencias de proveniencia tornam-se imutaveis apos a criacao;
- estados futuros das entidades de recrutamento nao alteram `Employment`;
- nenhum snapshot amplo de Candidate, Proposal, Dossie, entrevista ou vaga deve
  ser copiado.

## 11. Multiplos Employments na v1

A ADR-0024 nao bloqueia multiplos vinculos futuros. A v1, porem, adota regra
operacional conservadora:

- uma `OrganizationPerson` pode ter historico N de `Employment`;
- uma `OrganizationPerson` pode ter no maximo um `Employment` nao final
  (`pending` ou `active`) por vez;
- recontratacao so pode criar novo `Employment` quando o anterior estiver
  `ended` ou `cancelled`;
- `pending` concorrente com `active` para a mesma pessoa e proibido;
- `active` simultaneo fica fora da v1.

Essa e uma regra de v1, nao uma limitacao arquitetural permanente. Se o produto
precisar de vinculos simultaneos no futuro, nova SPEC/ADR deve definir
semantica de vinculo, funcao, datas, conflitos e UI antes de remover a
restricao.

## 12. Datas e Invariantes

Semantica:

- `decision_at`: momento de decisao/origem historica; pode refletir o `hired`
  ou ato administrativo.
- `effective_start_date`: data prevista ou efetiva de inicio; obrigatoria em
  `pending` e `active`.
- `started_at`: timestamp da transicao `pending -> active`; obrigatorio em
  `active`.
- `end_date`: data efetiva informada para encerramento do vinculo; obrigatoria
  em `ended`.
- `ended_at`: timestamp da transicao `active -> ended`; obrigatorio em
  `ended`.
- `cancelled_at`: timestamp da transicao `pending -> cancelled`; obrigatorio em
  `cancelled`.
- `created_at` e `updated_at`: timestamps tecnicos de persistencia.

Invariantes:

- `pending` exige `effective_start_date` e nao possui `started_at`;
- `active` exige `started_at` e nao possui `ended_at` nem `cancelled_at`;
- `ended` exige `started_at`, `end_date`, `ended_at` e `end_reason`;
- `cancelled` exige `cancelled_at` e `cancellation_reason`;
- `end_date` nao pode preceder `effective_start_date`;
- `ended_at` nao pode preceder `started_at`;
- `cancelled` nao usa `end_date` nem `ended_at`;
- datas de negocio e timestamps de transicao nao devem ser duplicados sem
  semantica distinta.

## 13. Ativacao

Ativar e transicionar `pending -> active`.

Ator permitido:

- owner;
- admin.

Pre-condicoes:

- Organization ativa;
- User ativo;
- Membership ativa;
- role autorizada;
- `Employment pending`;
- `OrganizationPerson` da mesma Organization;
- nenhum outro `Employment pending` ou `active` para a mesma
  `OrganizationPerson`;
- auditoria critica disponivel.

Regras:

- preenchimento de `started_at`;
- preenchimento de `activated_by_user_id`;
- idempotencia por chave/fingerprint quando exposto a retry;
- `activate x cancel`: primeira transacao confirmada prevalece;
- `activate x activate`: retry identico retorna mesmo resultado; operacao
  distinta recebe conflito seguro;
- Organization archived bloqueia ativacao;
- vinculo finalizado bloqueia ativacao;
- ativacao antes de `effective_start_date` exige justificativa auditada;
- nenhum cron/job ativa Employment automaticamente.

## 14. Encerramento

Encerrar e transicionar `active -> ended`.

Ator permitido:

- owner;
- admin.

Pre-condicoes:

- Organization ativa;
- User ativo;
- Membership ativa;
- role autorizada;
- `Employment active`;
- `end_date` informada;
- `end_reason` obrigatorio;
- auditoria critica disponivel.

Regras:

- preenche `end_date`, `ended_at`, `ended_by_user_id` e `end_reason`;
- preserva historico;
- nao executa hard delete;
- nao altera Candidate;
- nao altera CandidateApplication;
- nao altera Proposal/ProposalVersion;
- nao altera Onboarding;
- nao cria Offboarding automaticamente;
- nao desativa User;
- nao desativa Membership;
- nao remove acesso;
- bloqueia novas operacoes pos-contratacao que exijam vinculo ativo.

## 15. Cancelamento

Cancelar e transicionar `pending -> cancelled`.

Ator permitido:

- owner;
- admin.

Pre-condicoes:

- Organization ativa;
- User ativo;
- Membership ativa;
- role autorizada;
- `Employment pending`;
- `cancellation_reason` obrigatorio;
- auditoria critica disponivel.

Regras:

- preenche `cancelled_at`, `cancelled_by_user_id` e `cancellation_reason`;
- nao executa hard delete;
- nao permite ativacao posterior;
- nao altera Candidate, CandidateApplication, Proposal, Onboarding, User ou
  Membership;
- novo vinculo futuro exige novo `Employment`;
- `cancelled` nao representa desligamento de vinculo que ja esteve ativo.

## 16. User e Membership

Separacao obrigatoria:

- `Employment` nao exige `User`;
- `Employment` nao exige `Membership`;
- criar `Employment` nao cria `User`;
- criar `Employment` nao cria `Membership`;
- ativar `Employment` nao cria acesso;
- encerrar `Employment` nao desativa `User`;
- encerrar `Employment` nao desativa `Membership`;
- cancelar `Employment` nao remove acesso;
- Membership inactive nao encerra `Employment`;
- User inactive/disabled nao encerra `Employment`.

Qualquer associacao futura entre pessoa pos-contratacao e acesso pertence a
dominio separado, com decisao propria, auditoria propria e fluxo revogavel.

## 17. Onboarding

Preservacao da SPEC-016:

- Onboarding existente continua valido sem `employment_id`;
- esta SPEC nao altera Onboarding nesta revisao;
- associacao futura deve ser aditiva e nullable, ou equivalente;
- `Onboarding completed` nao cria `Employment`;
- `Onboarding completed` nao ativa `Employment`;
- `Employment ended` nao reescreve Onboarding;
- Candidate inactive posterior nao invalida `Employment` ja criado;
- Onboarding futuro pode referenciar `Employment` explicitamente, sem apagar
  `candidate_application_id` e `candidate_id` historicos.

Integracao futura com Onboarding nao e requisito da implementacao inicial da
SPEC-025.

## 18. Privacidade e PII

Lista positiva do nucleo:

`OrganizationPerson` pode conter:

- `display_name`;
- `preferred_name`, opcional;
- `primary_email`, opcional;
- `origin_candidate_id`, opcional;
- autoria e timestamps.

`Employment` pode conter:

- identificadores internos;
- status;
- origem minimizada;
- datas de ciclo de vida;
- motivos de criacao/encerramento/cancelamento minimizados;
- autoria e timestamps.

Proibido na v1:

- CPF/RG;
- documentos;
- endereco completo;
- dados bancarios;
- saude;
- dependentes;
- remuneracao;
- beneficios detalhados;
- avaliacoes;
- performance;
- retention notes;
- notas livres irrestritas;
- conteudo de Proposal;
- compensation snapshot;
- conteudo do Dossie;
- respostas de entrevistas;
- documentos admissionais.

Essas tabelas nao podem virar perfil generico de RH. Dados sensiveis futuros
devem pertencer a dominios especificos, com finalidade, permissao, retencao,
DTOs e auditoria proprios.

## 19. Organization Archived

Quando a Organization estiver `archived`:

- bloquear criacao de `OrganizationPerson`;
- bloquear criacao de `Employment`;
- bloquear ativacao;
- bloquear cancelamento funcional;
- bloquear encerramento funcional comum;
- preservar leitura historica autorizada quando houver canal permitido pela
  governanca da Organization;
- Platform Admin permanece restrito a leitura administrativa minimizada, com
  motivo e auditoria.

Mutacoes excepcionais em Organization arquivada nao existem nesta SPEC. Se um
dia forem necessarias, exigem regra normativa propria.

## 20. RBAC

Matriz conceitual:

| Acao | owner | admin | member | pessoa vinculada | Platform Admin |
| --- | :---: | :---: | :---: | :---: | :---: |
| Criar OrganizationPerson | Sim | Sim | Nao | Nao | Nao |
| Reutilizar OrganizationPerson | Sim | Sim | Nao | Nao | Nao |
| Consultar OrganizationPerson completo | Sim | Sim | Nao | Nao | Nao funcional |
| Consultar lista minima | Sim | Sim | Nao por padrao | Nao | Nao funcional |
| Criar Employment | Sim | Sim | Nao | Nao | Nao |
| Ativar Employment | Sim | Sim | Nao | Nao | Nao |
| Cancelar Employment pending | Sim | Sim | Nao | Nao | Nao |
| Encerrar Employment active | Sim | Sim | Nao | Nao | Nao |
| Consultar historico completo | Sim | Sim | Nao por padrao | Nao | Nao funcional |
| Leitura administrativa minimizada | Nao | Nao | Nao | Nao | Sim, com motivo |

Member nao recebe permissao implicita. Qualquer participacao futura de member
deve ser definida positivamente por modulo consumidor.

## 21. Idempotencia

Operacoes mutaveis expostas via API devem aceitar `Idempotency-Key` ou mecanismo
equivalente:

- criar/reutilizar `OrganizationPerson`;
- criar `Employment`;
- ativar `Employment`;
- cancelar `Employment`;
- encerrar `Employment`.

Semantica obrigatoria:

- chave + fingerprint iguais em estado `completed` retornam o mesmo resultado;
- chave igual + fingerprint diferente retorna conflito seguro;
- operacao em estado `pending` pode aguardar, retornar processamento em curso
  ou conflito seguro, mas nunca duplicar efeito;
- estado `failed` permite retry conforme categoria de falha;
- crash recovery deve permitir reconhecer se a operacao confirmou antes da
  falha;
- resultado idempotente nunca pula validacoes de Organization, permissao,
  status ou proveniencia;
- falha de auditoria critica causa rollback e nao pode ser registrada como
  sucesso idempotente.

Esta SPEC nao obriga tabela fisica de idempotencia, mas a semantica deve ser
implementavel e testavel.

## 22. Concorrencia

Resultados determinicos obrigatorios:

- `OrganizationPerson create x create` para mesma origem forte: um registro ou
  retorno idempotente; nunca duplicidade.
- `Employment create x create` para mesma `OrganizationPerson`: no maximo um
  `Employment` nao final; segunda operacao conflitante recebe conflito seguro.
- duas candidaturas `hired` com mesmo Candidate tentando criar pessoa/vinculo:
  reutilizam a mesma `OrganizationPerson`, mas ainda respeitam no maximo um
  `Employment` nao final.
- duas candidaturas `hired` com Candidates diferentes e dados parecidos: nao ha
  merge automatico; exige escolha explicita.
- `activate x cancel`: primeira transacao confirmada vence; segunda recebe
  conflito seguro ou retorno idempotente se for mesma acao.
- `activate x activate`: um unico `started_at`; retry identico retorna mesmo
  resultado.
- `end x end`: um unico encerramento; retry identico retorna mesmo resultado;
  operacao distinta recebe conflito seguro.
- `end x operacao futura`: se `ended` confirmar primeiro, a operacao futura que
  exigir ativo falha; se operacao futura confirmar primeiro, encerramento
  revalida estado antes de concluir.
- `Organization archive x mutation`: mutacao revalida Organization ativa dentro
  da transacao; se arquivamento confirmar primeiro, mutacao falha.
- `rehire x end`: novo Employment so pode ser criado depois que encerramento do
  anterior confirmar.

A implementacao futura deve usar controle transacional adequado, sem a SPEC
prescrever ordem fisica de locks.

## 23. Atomicidade

Devem ser atomicamente consistentes:

- criacao/reuso de `OrganizationPerson`;
- criacao de `Employment`;
- gravacao de proveniencia;
- verificacao de no maximo um `Employment` nao final;
- auditoria critica.

Nao pode existir:

- `Employment` sem `OrganizationPerson`;
- `Employment` parcial sem proveniencia/origem minima;
- `Employment` criado sem auditoria critica;
- `OrganizationPerson` duplicada por falha entre validacao e gravacao;
- transicao de estado sem evento auditavel.

Falha de auditoria critica causa rollback.

## 24. Historico e Imutabilidade

Regras:

- sem hard delete no fluxo normal;
- `organization_id` e imutavel;
- `organization_person_id` de `Employment` e imutavel;
- proveniencia de `OrganizationPerson` e imutavel na v1;
- proveniencia de `Employment` e imutavel;
- `Employment ended` e `Employment cancelled` sao imutaveis para operacoes de
  negocio;
- lifecycle nao reabre;
- recontratacao cria nova linha de `Employment`;
- leitura historica permanece preservada conforme permissao;
- mudancas futuras em Candidate, CandidateApplication, Proposal, JobOpening,
  Onboarding, User ou Membership nao retroagem em `Employment`.

Correcoes administrativas estritas sobre metadados historicos ficam fora desta
v1 e exigem regra propria.

## 25. Auditoria

Eventos minimos:

- `organization_person.created`;
- `organization_person.reused`;
- `employment.created`;
- `employment.activated`;
- `employment.cancelled`;
- `employment.ended`;
- `employment.permission_denied`;
- `employment.cross_organization_access_denied`;
- `employment.administrative_read`;
- `employment.idempotency_conflict`;
- `employment.concurrent_operation_conflict`.

Eventos de acesso, como `employment.access_linked` e
`employment.access_unlinked`, ficam para dominio futuro de associacao de acesso
e nao fazem parte da v1.

Auditoria nunca registra PII integral, salario, conteudo de proposta,
compensation snapshot, documento, dado bancario, dado de saude, dependente,
token, header, segredo, Dossie completo ou nota livre sensivel.

## 26. Zero IA

Esta SPEC exige:

- zero `AIGateway`;
- zero `AI Execution`;
- zero prompt;
- zero provider;
- zero modelo;
- zero score;
- zero ranking;
- zero inferencia;
- zero decisao automatizada;
- zero deduplicacao por IA.

Textos vindos de Candidate, recrutamento, proposta ou onboarding continuam
sendo dados, nunca instrucoes.

## 27. Zero Automacao Indevida

`Employment` nao pode ser criado automaticamente por:

- `hired`;
- `ProposalVersion accepted`;
- `Onboarding completed`;
- criacao de Candidate;
- criacao de User;
- criacao de Membership;
- ativacao de Membership;
- data de calendario.

`Employment` tambem nao pode ser ativado automaticamente por:

- `effective_start_date`;
- cron/job;
- Onboarding completed;
- Proposal accepted;
- User/Membership ativo.

Criacao, ativacao, cancelamento e encerramento sao atos explicitos e auditados.

## 28. Cargo, Funcao e Estrutura

`JobOpening` e `JobOpeningVersion` sao proveniencia historica de recrutamento.
Nao sao posicao permanente.

Esta SPEC nao cria:

- Position;
- Role funcional;
- Department;
- Area;
- gestor;
- senioridade;
- centro de custo;
- historico de transferencias.

Mudanca de cargo, area ou gestor nao cria automaticamente novo `Employment`.
Dominio de estrutura funcional futura deve decidir isso.

## 29. Banco de Dados Conceitual

Modelo minimo futuro:

- `organization_people`;
- `employments`.

Nao criar nesta v1:

- `person` global;
- `employment_events`, salvo justificativa futura distinta de `audit_events`;
- tabela de associacao com acesso;
- tabelas de cargo/funcao;
- tabelas de salario, beneficios, documentos, performance ou retencao.

Restricoes conceituais esperadas:

- `organization_id` obrigatorio nas duas tabelas;
- integridade entre `employments.organization_person_id` e mesma Organization;
- unicidade de `organization_people(organization_id, origin_candidate_id)` onde
  `origin_candidate_id` nao for nulo;
- no maximo um `Employment` nao final (`pending` ou `active`) por
  `OrganizationPerson` na v1;
- CHECK de status;
- CHECKs de datas;
- imutabilidade de Organization, pessoa e proveniencia;
- ausencia de cascade destrutivo;
- indices por Organization, pessoa, status e origens historicas;
- compatibilidade futura com PostgreSQL/Supabase.

## 30. API Conceitual

| Operacao | Finalidade |
| --- | --- |
| Criar OrganizationPerson | Criar identidade minima intra-Organization. |
| Reutilizar OrganizationPerson | Selecionar pessoa existente por referencia forte/explicita. |
| Criar Employment | Criar vinculo `pending` por recrutamento ou fluxo administrativo. |
| Consultar OrganizationPerson | Obter pessoa permitida e resumo de vinculos. |
| Listar OrganizationPeople | Listar pessoas da Organization com DTO minimizado. |
| Consultar Employment | Obter vinculo permitido, status, datas e proveniencia. |
| Listar Employments | Listar vinculos por pessoa/status/origem. |
| Ativar Employment | `pending -> active`. |
| Cancelar Employment | `pending -> cancelled`. |
| Encerrar Employment | `active -> ended`. |
| Historico | Consultar eventos e vinculos da pessoa. |
| Leitura administrativa | Platform Admin com motivo e DTO minimizado. |

Todas as operacoes validam no servidor: Organization, User, Membership, role,
status da Organization, pertencimento de todos os IDs, lifecycle atual,
idempotencia, concorrencia e mass assignment.

## 31. UI Conceitual

Interface interna futura deve mostrar:

- pessoa minima;
- vinculos;
- status do vinculo;
- datas relevantes;
- origem historica;
- historico de transicoes;
- alertas de possivel duplicidade sem merge automatico.

Nao misturar dados completos de recrutamento, proposta, onboarding, acesso,
folha, performance ou retencao na mesma superficie. A UI pode navegar para
origens autorizadas, mas deve preservar fronteiras de dominio.

## 32. Impacto Futuro na SPEC-017

Revisao futura da SPEC-017 devera:

- trocar "Vinculo de Pessoa na Organization" por `Employment`;
- declarar `Employment` como aggregate root de Desenvolvimento e Retencao;
- impedir plano, objetivo, sinal ou acao diretamente em Candidate,
  CandidateApplication, User ou Membership;
- usar `OrganizationPerson` apenas para agrupar historico da pessoa;
- exigir `Employment active` para novas operacoes operacionais;
- definir comportamento historico para `Employment ended`;
- preservar zero IA, zero ranking e zero decisao automatica enquanto a SPEC-017
  assim determinar;
- revisar permissao de member/manager sem ampliar acesso implicitamente.

Esta tarefa nao altera a SPEC-017.

## 33. Impacto Futuro na SPEC-016

Revisao futura aditiva da SPEC-016 podera:

- adicionar `employment_id` nullable a Onboarding ou associacao equivalente;
- preservar onboardings existentes sem `employment_id`;
- manter `candidate_application_id` e `candidate_id` historicos;
- permitir associacao explicita e auditada quando `Employment` existir;
- impedir que Onboarding crie ou ative `Employment` automaticamente.

Essa integracao nao e requisito da implementacao inicial desta SPEC.

## 34. Criterios de Aceite

- CA-001: `OrganizationPerson` pertence exatamente a uma Organization.
- CA-002: Nao existe Person global cross-tenant.
- CA-003: `OrganizationPerson` nao e Candidate.
- CA-004: `OrganizationPerson` nao e User.
- CA-005: `OrganizationPerson` nao e Membership.
- CA-006: `OrganizationPerson` nao e Employment.
- CA-007: `OrganizationPerson` nao possui lifecycle artificial de vinculo.
- CA-008: `OrganizationPerson` pode ser reutilizada em recontratacao.
- CA-009: Pessoas de Organizations distintas nunca sao fundidas.
- CA-010: Organization 1:N OrganizationPerson.
- CA-011: OrganizationPerson 1:N Employment historico.
- CA-012: No maximo uma OrganizationPerson por Candidate de origem na mesma Organization.
- CA-013: `Employment` e aggregate root pos-contratacao.
- CA-014: Desenvolvimento e Retencao futuros usam `Employment`.
- CA-015: Criacao de OrganizationPerson e explicita.
- CA-016: Reuso de OrganizationPerson e explicito ou por evidencia forte.
- CA-017: E-mail nao e identidade forte.
- CA-018: Nome nao e identidade forte.
- CA-019: Telefone nao e identidade forte.
- CA-020: Evidencias sugestivas nao fazem merge automatico.
- CA-021: Ambiguidade cria nova pessoa ou exige decisao explicita.
- CA-022: Merge manual fica fora da v1.
- CA-023: `Employment` nasce sempre `pending`.
- CA-024: `pending` exige origem, motivo, data efetiva, autoria e auditoria.
- CA-025: `pending` pode existir apos `hired`.
- CA-026: `pending` pode existir sem CandidateApplication no fluxo administrativo.
- CA-027: `pending` pode ter `effective_start_date` futura.
- CA-028: `pending -> active` exige ato humano explicito.
- CA-029: Data nao ativa Employment automaticamente.
- CA-030: Onboarding completed nao ativa Employment.
- CA-031: `pending -> cancelled` exige motivo.
- CA-032: `active -> ended` exige motivo e data efetiva.
- CA-033: Todas as transicoes fora da matriz sao proibidas.
- CA-034: `ended` nao reabre.
- CA-035: `cancelled` nao reabre.
- CA-036: Recontratacao cria novo Employment.
- CA-037: Fluxo de recrutamento exige CandidateApplication `hired`.
- CA-038: ProposalVersion informada precisa ser `accepted` da mesma candidatura.
- CA-039: Proposal accepted sem hired nao cria Employment.
- CA-040: Fluxo administrativo nao inventa Candidate/Application/Proposal.
- CA-041: Fluxo administrativo exige `origin_reason`.
- CA-042: Proveniencia e referencia historica, nao dependencia operacional eterna.
- CA-043: Proveniencia e imutavel apos criacao.
- CA-044: Referencias de proveniencia pertencem a mesma Organization.
- CA-045: Referencias de proveniencia sao coerentes entre si.
- CA-046: Nenhum snapshot amplo de recrutamento e copiado.
- CA-047: V1 permite no maximo um Employment nao final por OrganizationPerson.
- CA-048: Rehire so ocorre apos anterior `ended` ou `cancelled`.
- CA-049: Multiplos active simultaneos ficam fora da v1.
- CA-050: Semantica de datas e invariantes sao preservadas.
- CA-051: Ativacao antes da data prevista exige justificativa auditada.
- CA-052: Encerramento nao altera Candidate.
- CA-053: Encerramento nao altera User.
- CA-054: Encerramento nao altera Membership.
- CA-055: Membership inactive nao encerra Employment.
- CA-056: User inactive nao encerra Employment.
- CA-057: Onboarding existente continua valido sem `employment_id`.
- CA-058: Employment ended nao reescreve Onboarding.
- CA-059: Candidate inactive posterior nao invalida Employment criado.
- CA-060: PII fora da lista positiva e bloqueada.
- CA-061: Organization archived bloqueia mutacoes funcionais.
- CA-062: RBAC segue matriz positiva.
- CA-063: Platform Admin nao opera funcionalmente.
- CA-064: Idempotencia cobre operacoes mutaveis.
- CA-065: Concorrencia produz resultado deterministico.
- CA-066: Criacao/reuso + Employment + proveniencia + auditoria sao atomicos.
- CA-067: Falha de auditoria critica causa rollback.
- CA-068: Sem hard delete.
- CA-069: Historico permanece preservado.
- CA-070: Auditoria minima e registrada sem PII integral.
- CA-071: Zero AIGateway.
- CA-072: Zero AI Execution.
- CA-073: Zero score/ranking/inferencia.
- CA-074: Zero deduplicacao por IA.
- CA-075: Hired nao cria Employment automaticamente.
- CA-076: Proposal accepted nao cria Employment automaticamente.
- CA-077: Onboarding completed nao cria Employment automaticamente.
- CA-078: Criacao de Candidate/User/Membership nao cria Employment.

## 35. Testes Obrigatorios Futuros

Quando implementada, a funcionalidade deve possuir testes para:

### Identidade e tenancy

1. criar `OrganizationPerson` em Organization ativa;
2. bloquear `OrganizationPerson` em Organization arquivada;
3. bloquear `OrganizationPerson` cross-tenant;
4. bloquear `Employment` cross-tenant;
5. bloquear `Employment` com `OrganizationPerson` de outra Organization;
6. mesmo e-mail em Organizations distintas nao gera merge global;
7. Candidate de outra Organization e recusado;
8. CandidateApplication de outra Organization e recusada;
9. ProposalVersion de outra Organization e recusada;
10. erro cross-tenant e generico.

### Criacao, reuso e deduplicacao

11. criar OrganizationPerson administrativa sem Candidate;
12. criar OrganizationPerson com `origin_candidate_id`;
13. impedir duas OrganizationPeople com mesmo Candidate de origem no tenant;
14. reutilizar por `organization_person_id` explicito;
15. reutilizar por Candidate de origem ja vinculado;
16. nome igual sem merge automatico;
17. e-mail igual sem merge automatico quando ambiguo;
18. telefone igual sem merge automatico;
19. duplicate create idempotente retorna mesmo recurso;
20. concurrent duplicate create nao duplica pessoa;
21. duas candidaturas hired do mesmo Candidate reutilizam pessoa;
22. duas candidaturas hired de Candidates distintos nao fazem merge automatico;
23. merge manual indisponivel na v1.

### Criacao de Employment

24. criar Employment `pending` por recrutamento;
25. criar Employment `pending` administrativo sem Candidate;
26. CandidateApplication nao `hired` bloqueia fluxo de recrutamento;
27. CandidateApplication `active` bloqueia;
28. CandidateApplication `withdrawn` bloqueia;
29. CandidateApplication `rejected` bloqueia;
30. CandidateApplication `cancelled` bloqueia;
31. ProposalVersion accepted sem hired bloqueia;
32. ProposalVersion de outra candidatura bloqueia;
33. ProposalVersion nao accepted bloqueia;
34. fluxo administrativo exige `origin_reason`;
35. fluxo administrativo nao cria Candidate;
36. fluxo administrativo nao cria CandidateApplication;
37. fluxo administrativo nao cria Proposal.

### Lifecycle

38. `pending -> active`;
39. `pending -> cancelled`;
40. `active -> ended`;
41. bloquear `pending -> ended`;
42. bloquear `active -> pending`;
43. bloquear `active -> cancelled`;
44. bloquear `ended -> pending`;
45. bloquear `ended -> active`;
46. bloquear `ended -> cancelled`;
47. bloquear `cancelled -> pending`;
48. bloquear `cancelled -> active`;
49. bloquear `cancelled -> ended`;
50. bloquear reabertura de ended;
51. bloquear reabertura de cancelled.

### Pending, datas e ativacao

52. pending exige `effective_start_date`;
53. pending aceita `effective_start_date` futura;
54. active exige `started_at`;
55. ended exige `end_date`, `ended_at` e `end_reason`;
56. cancelled exige `cancelled_at` e `cancellation_reason`;
57. `end_date` anterior a `effective_start_date` e recusada;
58. ativacao por data nao ocorre;
59. cron/job nao ativa Employment;
60. ativacao antes da data prevista exige justificativa;
61. activate x cancel deterministico;
62. activate x activate idempotente.

### Multiplos vinculos e rehire

63. segundo `Employment pending` para mesma pessoa e bloqueado;
64. segundo `Employment active` para mesma pessoa e bloqueado;
65. `pending` quando ja existe `active` e bloqueado;
66. rehire cria novo Employment apos anterior `ended`;
67. rehire cria novo Employment apos anterior `cancelled`;
68. rehire x encerramento concorrente e deterministico;
69. Employment anterior permanece historico.

### User, Membership e Onboarding

70. criar Employment nao cria User;
71. criar Employment nao cria Membership;
72. ativar Employment nao cria Membership;
73. encerrar Employment nao desativa User;
74. encerrar Employment nao desativa Membership;
75. Membership inactive nao encerra Employment;
76. User inactive nao encerra Employment;
77. Onboarding completed nao cria Employment;
78. Onboarding completed nao ativa Employment;
79. Employment ended nao altera Onboarding;
80. Candidate inactive posterior nao invalida Employment.

### Organization archived e RBAC

81. Organization archived bloqueia criar pessoa;
82. Organization archived bloqueia criar Employment;
83. Organization archived bloqueia ativar;
84. Organization archived bloqueia cancelar funcionalmente;
85. Organization archived bloqueia encerrar funcionalmente;
86. owner cria/ativa/cancela/encerra;
87. admin cria/ativa/cancela/encerra;
88. member nao cria;
89. member nao ativa;
90. member nao cancela;
91. member nao encerra;
92. Platform Admin nao opera funcionalmente;
93. Platform Admin leitura administrativa exige motivo.

### Idempotencia, concorrencia e atomicidade

94. Idempotency-Key igual + fingerprint igual retorna mesmo resultado;
95. Idempotency-Key igual + fingerprint diferente gera conflito;
96. operacao pending nao duplica efeito;
97. operacao failed permite retry conforme categoria;
98. crash recovery nao duplica Employment;
99. Employment create x create produz um nao final;
100. Organization archive x mutation e deterministico;
101. falha na criacao reverte pessoa/vinculo quando atomico;
102. falha de auditoria critica reverte criacao;
103. falha de auditoria critica reverte ativacao;
104. falha de auditoria critica reverte cancelamento;
105. falha de auditoria critica reverte encerramento;
106. no hard delete.

### Mass assignment, IDOR, privacidade e IA

107. bloquear mass assignment de `organization_id`;
108. bloquear mass assignment de status;
109. bloquear mass assignment de autoria;
110. bloquear mass assignment de proveniencia;
111. bloquear IDOR de OrganizationPerson;
112. bloquear IDOR de Employment;
113. CPF/RG ausentes;
114. documentos ausentes;
115. dados bancarios ausentes;
116. saude/dependentes ausentes;
117. remuneracao ausente;
118. conteudo de Proposal ausente;
119. conteudo do Dossie ausente;
120. auditoria sem PII integral;
121. zero AIGateway;
122. zero `ai_executions`;
123. zero score/ranking;
124. zero inferencia;
125. zero deduplicacao por IA;
126. `hired` nao cria Employment;
127. Proposal accepted nao cria Employment;
128. Onboarding completed nao cria Employment.

## 36. Conflitos Encontrados

Nenhum conflito critico ou importante de dominio permanece apos esta revisao.

Tensoes resolvidas:

- SPEC-012 define `hired` como decisao positiva, nao contratacao. Esta SPEC
  preserva essa fronteira.
- SPEC-015 define Proposal accepted como manifestacao operacional. Esta SPEC
  trata Proposal apenas como proveniencia opcional.
- SPEC-016 usa Candidate/CandidateApplication como ponte transitoria. Esta SPEC
  preserva a v1 e registra apenas integracao futura aditiva.
- SPEC-017 estava bloqueada por falta de sujeito pos-contratacao. Esta SPEC
  define o sujeito como `Employment`.
- ADR-0024 permite multiplos vinculos como possibilidade arquitetural futura.
  Esta SPEC restringe a v1 a no maximo um nao final por pessoa, sem bloquear
  revisao futura.

Conflitos processuais restantes:

- nenhum conflito processual permanece apos a formalizacao da SPEC-025 como
  Fase 24 no planejamento oficial.

## 37. Ambiguidades Restantes

Ambiguidades nao bloqueantes para esta SPEC documental:

- contractor, freelancer, estagiario, temporario e terceiros;
- cargo, funcao, area, gestor e estrutura funcional;
- acesso proprio da pessoa vinculada;
- offboarding;
- merge/split/correcao estrutural de identidade;
- associacao futura com User/Membership;
- multiplos `Employment active` simultaneos em fase futura;
- leitura historica por owner/admin em Organization archived conforme futura
  governanca operacional;
- modelo fisico final de idempotencia.

Nenhuma dessas ambiguidades deve ser resolvida por analogia durante
implementacao.

## 38. Limitacoes Conhecidas

- Esta SPEC esta aprovada como v1.0.
- A Fase 24 foi formalizada no planejamento oficial.
- Nao altera backlog, roadmap, ADR-0024, SPEC-016 ou SPEC-017.
- Nao implementa codigo.
- Nao cria migration.
- Nao altera banco.
- Nao cria testes executaveis.
- Nao define UI final.
- Nao define API final.
- Nao define modelo fisico completo.
- Nao define acesso proprio da pessoa vinculada.
- Nao define offboarding, performance, folha, beneficios, documentos ou cargo.

## 39. Definicao de Concluido

Para esta tarefa documental:

- fontes obrigatorias lidas;
- fase reconciliada com o planejamento oficial;
- revisao destrutiva aplicada somente neste arquivo;
- `OrganizationPerson` definido com cardinalidade e reuso;
- `Employment` definido como aggregate root;
- lifecycle e `pending` fechados;
- fluxos de recrutamento e administrativo fechados;
- proveniencia, datas, RBAC, privacidade, multiempresa, idempotencia,
  concorrencia, atomicidade e auditoria definidos;
- criterios de aceite e testes futuros ampliados;
- nenhum codigo, migration, banco ou teste executavel alterado;
- nenhum commit realizado.

Para implementacao futura:

- SPEC mantida aprovada antes do desenvolvimento;
- plano tecnico revisado;
- migrations reproduziveis quando houver banco;
- criterios de aceite implementados;
- testes obrigatorios implementados e passando;
- seguranca, privacidade e multiempresa revisadas;
- documentacao dependente atualizada;
- commit realizado somente na fase apropriada.
