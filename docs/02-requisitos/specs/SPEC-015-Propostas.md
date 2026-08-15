# SPEC-015 - Propostas

**Status:** Aprovada  
**Versão:** 1.0  
**Fase:** 22  
**Responsavel de negocio:** Thiago Sousa  
**Ultima atualizacao:** 2026-08-14  
**Dependencias:** SPEC-001 - Organization, SPEC-004 - Roles & Permissions, SPEC-010 - Vagas, SPEC-011 - Candidatos, SPEC-012 - Processo Seletivo, SPEC-020 - Candidatura Publica, SPEC-021 - Pre-Entrevista Estruturada, SPEC-022 - Perfil Comportamental, SPEC-023 - Pre-Analise Assistida por IA, SPEC-024 - Dossie Inteligente do Candidato, ADR-0013, ADR-0014, ADR-0015, ADR-0020, ADR-0021, ADR-0022, ADR-0023

**Nota de revisao (v1.0 - revisao destrutiva documental):** esta revisao fecha
as ambiguidades criticas da versao 0.1 sem alterar SPEC-012, ADRs, BACKLOG,
roadmap, codigo, banco, migrations ou testes. A decisao central e que
`Proposal` e apenas o envelope de negociacao, sem estado proprio independente:
estado, conteudo, aceite, recusa, expiracao, cancelamento e supersession
pertencem sempre a `ProposalVersion`. A versao emitida e imutavel; qualquer
correcao apos emissao exige nova `ProposalVersion`, e a versao anterior passa a
`superseded` de forma atomica no momento em que a nova e emitida. A relacao com
`hired` foi precisada: esta SPEC nao torna Proposal obrigatoria para todo
`hired` ja permitido pela SPEC-012; ela define apenas que, quando o fluxo de
Propostas for usado, `hired` deve referenciar uma `ProposalVersion accepted`,
sempre por ato humano explicito de `owner`. Nenhum conflito critico permanece em
aberto apos esta revisao.

## 1. Objetivo

Definir funcionalmente o modulo de **Propostas** do Talent OS: a capacidade de
preparar, emitir, substituir, cancelar, expirar, aceitar ou recusar uma proposta
para uma `CandidateApplication` especifica, preservando historico,
versionamento, consentimento, privacidade, multiempresa, auditoria e decisao
final humana.

Esta SPEC formaliza a primeira capacidade posterior ao Dossie Inteligente
(SPEC-024) e resolve a lacuna deixada explicitamente pela SPEC-012 e pela
ADR-0014: propostas futuras pertencem a `CandidateApplication`, mas nao haviam
sido especificadas ate esta fase.

Proposta e um artefato de negociacao e confirmacao operacional entre a
Organization e o Candidate sobre uma candidatura especifica. Ela nao cria
colaborador, nao cria onboarding, nao cria contrato juridico, nao executa
assinatura eletronica, nao altera o `Candidate` principal com status de
contratacao e nao decide contratacao automaticamente.

## 2. Fora do escopo

Esta SPEC nao define nem implementa:

- codigo, banco de dados, migrations, rotas, APIs, testes ou dependencias;
- onboarding, empregado, colaborador, admissao, folha, documentos de admissao
  ou qualquer entidade de pos-contratacao;
- assinatura eletronica juridica, certificado digital, validacao de identidade
  forte ou integracao com provedor de assinatura;
- proposta como contrato trabalhista completo;
- aprovacao em multiplos niveis ou workflow juridico/financeiro;
- templates juridicos finais de proposta;
- negociacao em multiplas contrapropostas pelo Candidate;
- envio de e-mail, WhatsApp, notificacao push ou integracao externa;
- Inteligencia Artificial, chamada ao `AIGateway`, provider, modelo ou prompt;
- score, ranking, matching, recomendacao automatica ou decisao automatica;
- alteracao das regras gerais ja aprovadas da SPEC-012 fora do fluxo de
  Propostas;
- reabertura de `CandidateApplication` finalizada;
- exposicao publica de proposta fora do link seguro do proprio Candidate;
- exclusao fisica de proposta, versao ou registro de acesso.

Esses temas exigem SPEC ou revisao propria quando priorizados.

## 3. Usuarios envolvidos

- **owner:** prepara, consulta, emite, cancela, substitui, consulta historico e
  registra a decisao final `hired` apos aceite, conforme SPEC-012.
- **admin:** prepara rascunhos e consulta propostas, mas nao emite, cancela
  proposta emitida, substitui proposta emitida nem registra `hired`.
- **member:** visualiza somente existencia e status minimo de proposta quando ja
  puder visualizar a candidatura pela SPEC-012; nunca visualiza remuneracao,
  conteudo da proposta, token, historico sensivel ou aceite.
- **Candidate:** consulta apenas a proposta emitida para a sua propria
  `CandidateApplication`, aceita ou recusa por mecanismo de acesso seguro; nunca
  e `User`, nunca possui `Membership` e nunca acessa outra candidatura.
- **Platform Admin:** nao opera funcionalmente propostas; realiza apenas leitura
  administrativa minimizada, com motivo e auditoria, sem conteudo completo por
  padrao.

`Platform Admin` nao e Role de Membership e nao recebe permissoes funcionais de
`owner`, `admin` ou `member` dentro da Organization (SPEC-004, ADR-0020).

## 4. Conceitos

### 4.1 Proposal

Envelope logico da proposta associada a uma `CandidateApplication` especifica.
Pertence obrigatoriamente a uma Organization, mas seu vinculo de dominio e
sempre a candidatura.

Campos conceituais minimos:

- `id`;
- `organization_id`;
- `candidate_application_id`;
- `candidate_id`, herdado da `CandidateApplication`;
- `job_opening_id`, herdado da `CandidateApplication`;
- `job_opening_version_id`, herdado da `CandidateApplication`;
- `current_version_id`;
- autoria;
- timestamps.

`Proposal` nunca pertence diretamente ao `Candidate`, a `Job Opening`, ao
Blueprint, ao Dossie ou a IA. Esses contextos podem informar a decisao humana,
mas nao sao donos da proposta.

`Proposal` nao possui estado de negocio proprio nesta versao. Seu papel e
agrupar as versoes de uma negociacao para a mesma `CandidateApplication` e
apontar, quando existir, para a versao corrente. O estado observavel da proposta
e sempre derivado da `ProposalVersion` corrente; se uma implementacao futura
criar campo denormalizado de status no envelope, esse campo sera apenas cache de
leitura e nunca fonte de verdade.

### 4.2 Proposal Version

Versao materializada do conteudo da proposta. Toda proposta nasce como rascunho
de uma versao. A partir da emissao, a versao se torna imutavel.

Campos conceituais minimos:

- `id`;
- `organization_id`;
- `proposal_id`;
- `candidate_application_id`;
- `version_number`;
- `status`;
- `job_opening_version_id`;
- `content_snapshot`;
- `compensation_snapshot`;
- `valid_until`, quando definido pela Organization;
- `issued_at`;
- `accepted_at`;
- `declined_at`;
- `expired_at`;
- `cancelled_at`;
- `superseded_at`;
- autoria;
- timestamps.

`content_snapshot` representa o conteudo efetivamente apresentado ao Candidate.
`compensation_snapshot` representa remuneracao e beneficios sensiveis
apresentados naquela versao. A separacao conceitual existe para reforcar
minimizacao de DTO, auditoria e permissao; a forma fisica final fica para a
implementacao futura.

`ProposalVersion` e a unica dona de estado, conteudo, remuneracao ofertada,
validade, emissao, aceite, recusa, expiracao, cancelamento e supersession. Isso
evita que `Proposal` e `ProposalVersion` tenham state machines concorrentes:
`Proposal` agrupa; `ProposalVersion` representa o documento negociavel e seu
resultado.

### 4.3 Proposal Access Grant

Artefato conceitual de acesso do Candidate a uma proposta emitida, sem criar
`User` ou `Membership`.

Campos conceituais minimos:

- `id`;
- `organization_id`;
- `proposal_version_id`;
- `candidate_application_id`;
- `token_hash`;
- `status`;
- `issued_at`;
- `expires_at`, quando aplicavel;
- `revoked_at`;
- timestamps.

O token bruto nunca e armazenado, exibido em auditoria, log, tracing ou metricas.
O acesso e sempre escopado a uma unica Organization, uma unica
`CandidateApplication` e uma unica `ProposalVersion`.

O `ProposalAccessGrant` nao autoriza por si so nenhuma operacao. Ele apenas
prova posse de um acesso opaco. Toda consulta, aceite ou recusa revalida no
servidor, no momento da acao:

- Organization ativa;
- Candidate ativo;
- consentimento operacional valido;
- `CandidateApplication active`;
- `ProposalVersion issued`;
- `Proposal.current_version_id` apontando para a mesma versao;
- grant ativo, nao revogado e compativel com a versao.

Se qualquer condicao falhar, o Candidate recebe resposta segura e a proposta nao
pode ser aceita nem recusada por aquele grant.

## 5. Estados canonicos

### 5.1 Proposal Version

Estados canonicos:

- `draft`;
- `issued`;
- `accepted`;
- `declined`;
- `expired`;
- `cancelled`;
- `superseded`.

`accepted`, `declined`, `expired`, `cancelled` e `superseded` sao finais.
Estados finais nunca retornam a `draft` ou `issued`.

### 5.1.1 Transicoes permitidas

Matriz canonica:

| De | Para | Ator | Regra |
| --- | --- | --- | --- |
| inexistente | `draft` | owner/admin | Criacao de rascunho para candidatura operacionalmente valida. |
| `draft` | `issued` | owner | Emissao atomica, com congelamento de conteudo e criacao de grant. |
| `draft` | descartado operacionalmente | owner/admin | Descarte de rascunho nao emitido, preservado historicamente quando persistido. |
| `issued` | `accepted` | Candidate | Aceite valido da versao corrente. |
| `issued` | `declined` | Candidate | Recusa valida da versao corrente. |
| `issued` | `expired` | sistema/lazy check | `valid_until` vencido antes do aceite/recusa. |
| `issued` | `cancelled` | owner | Retirada da oferta pela Organization, com motivo. |
| `issued` | `superseded` | owner | Substituicao atomica por nova versao `issued`. |

Transicoes fora desta matriz sao proibidas. Em especial:

- `accepted` nunca vira `hired`; `hired` pertence a `CandidateApplication`;
- `accepted` nunca volta a `issued`;
- `declined`, `expired`, `cancelled` e `superseded` nunca voltam a `issued`;
- `superseded` nunca pode ser aceita por token antigo;
- `draft` nunca e visivel ao Candidate.

### 5.2 Necessidade dos estados

Cada estado e necessario nesta versao:

- `draft`: permite preparacao interna antes de qualquer exposicao ao Candidate;
- `issued`: identifica a unica versao atualmente aceitavel pelo Candidate;
- `accepted`: registra manifestacao positiva do Candidate sobre uma versao
  especifica e imutavel;
- `declined`: registra manifestacao negativa do Candidate sobre uma versao
  especifica;
- `expired`: retira aceitabilidade pelo vencimento de `valid_until`;
- `cancelled`: retira a oferta por decisao da Organization antes de resultado do
  Candidate;
- `superseded`: preserva historico de versao substituida por uma nova emissao.

Nenhum desses estados substitui `application_status` da
`CandidateApplication`.

### 5.3 Proposal agregada

`Proposal` nao tem state machine propria. Listagens podem exibir um "status da
proposta" derivado da `ProposalVersion` referenciada por `current_version_id`,
mas esse valor e apenas apresentacao ou denormalizacao tecnica futura, nunca uma
segunda fonte de verdade.

### 5.4 Relacao com CandidateApplication

Esta SPEC adota o **Modelo A com salvaguarda humana e sem revisao implicita da
SPEC-012**:

```text
CandidateApplication application_status = active
-> current_stage = offer
-> ProposalVersion issued
-> Candidate aceita ProposalVersion
-> ProposalVersion accepted
-> owner registra hired explicitamente, referenciando a ProposalVersion accepted
-> CandidateApplication application_status = hired
```

Decisoes:

- `hired` nao deve ocorrer como efeito automatico do aceite da proposta.
- `accepted` e pre-condicao funcional quando o fluxo de Propostas e usado para
  que o owner registre `hired`, mas o registro de `hired` continua sendo ato
  humano explicito e exclusivo de owner, conforme SPEC-012.
- `Proposal accepted` preserva a `CandidateApplication` em `application_status =
  active` ate a decisao humana final.
- `current_stage = offer` representa a etapa operacional adequada para proposta,
  sem ser estado final e sem substituir `application_status`.
- Proposta nao pode ser emitida depois de `application_status = hired`, porque
  `hired` e estado final da `CandidateApplication` na SPEC-012.
- Proposta e `hired` nao sao independentes dentro do fluxo de Propostas: uma
  proposta aceita pode fundamentar a decisao humana final, mas nao a executa
  sozinha.
- Esta SPEC nao altera a permissao geral da SPEC-012 de owner registrar `hired`
  com motivo ou referencia administrativa em fluxos onde Propostas ainda nao
  sejam usadas. Tornar Proposal obrigatoria para todo `hired` exigiria revisao
  explicita da SPEC-012, e nao e feito por esta SPEC.

Alternativas avaliadas:

- **Modelo A - hired depois de proposta aceita no fluxo de Propostas:** adotado,
  com aceite sem efeito automatico sobre `hired`.
- **Modelo B - proposta somente depois de hired:** rejeitado, pois `hired` e
  final na SPEC-012 e estados finais nao recebem novas operacoes funcionais.
- **Modelo C - proposta e hired independentes:** rejeitado, pois permitiria
  aceite de proposta em candidatura rejeitada/cancelada ou `hired` sem
  coerencia com a etapa `offer`.

## 6. Fluxo principal

### 6.1 Preparar rascunho

1. Owner ou admin acessa uma `CandidateApplication`.
2. Sistema valida Organization ativa, User ativo, Membership ativo, role,
   Candidate ativo, consentimento operacional valido e candidatura `active`.
3. Sistema valida que a candidatura pertence a mesma Organization e que nao ha
   outra proposta `issued` nao final para a mesma candidatura.
4. Usuario informa conteudo permitido da proposta.
5. Sistema cria ou atualiza `ProposalVersion` em `draft`.
6. Sistema registra auditoria minimizada.

### 6.2 Emitir proposta

1. Owner solicita emissao de uma versao `draft`.
2. Sistema revalida Organization, Membership, Candidate, consentimento e
   `CandidateApplication`.
3. Sistema valida que a candidatura continua `active`.
4. Sistema valida que a candidatura esta em `current_stage = offer` ou realiza,
   na mesma transacao, a movimentacao explicita para `offer` como parte do ato
   humano de emitir.
5. Se a emissao pular etapas operacionais relevantes, deve respeitar a regra de
   motivo da SPEC-012 para movimentacao de pipeline.
6. Sistema congela o conteudo em `ProposalVersion`, atribui `version_number`,
   marca `issued`, cria o `ProposalAccessGrant`, registra auditoria e confirma.

A mudanca para `offer` nao e automacao autonoma: e efeito da acao humana
explicita de emitir proposta.

Uma versao emitida nao pode ser editada. Erro material, correcao de remuneracao,
alteracao de data, ajuste de beneficios ou qualquer revisao de texto apos emissao
exige nova `ProposalVersion`. A versao anterior permanece historica.

### 6.3 Aceitar proposta

1. Candidate acessa a proposta por mecanismo seguro.
2. Sistema valida token, escopo, status `issued`, Organization ativa,
   Candidate ativo, consentimento operacional valido e
   `CandidateApplication active`.
3. Candidate confirma aceite.
4. Sistema marca a `ProposalVersion` como `accepted`, revoga acessos
   excedentes quando aplicavel, registra aceite e auditoria minimizada.
5. Sistema nao altera automaticamente `application_status`.
6. Owner deve registrar `hired` em acao posterior e explicita, caso decida
   concluir a candidatura como contratada.

### 6.4 Recusar proposta

1. Candidate acessa a proposta por mecanismo seguro.
2. Sistema valida as mesmas condicoes de acesso.
3. Candidate recusa.
4. Sistema marca a versao como `declined`, registra motivo opcional quando
   informado pelo Candidate, e audita de forma minimizada.
5. Sistema nao rejeita automaticamente a `CandidateApplication`.

### 6.5 Expirar proposta

Quando `valid_until` estiver vencido, a proposta `issued` nao pode mais ser
aceita. A transicao para `expired` pode ocorrer por verificacao lazy no momento
da consulta/acao ou por mecanismo tecnico futuro de agendamento; esta SPEC nao
define tecnologia fisica de scheduler.

### 6.6 Cancelar proposta

Owner pode cancelar uma proposta `issued` antes de aceite, recusa ou expiracao.
Cancelamento exige motivo, preserva historico e revoga o acesso do Candidate.

### 6.7 Substituir proposta

Owner pode substituir uma proposta `issued` ainda nao aceita/recusada/expirada,
emitindo nova versao. A versao anterior passa a `superseded`, a nova versao
passa a `issued`, e apenas a nova fica aceitavel.

Substituir nao edita a versao antiga, nao reaproveita token e nao altera
historico.

A supersession deve ocorrer em uma unica transacao:

1. bloquear a `Proposal` e a `ProposalVersion issued` corrente;
2. revalidar que a versao antiga ainda esta `issued`;
3. criar ou selecionar a nova versao `draft` que sera emitida;
4. marcar a versao antiga como `superseded`;
5. revogar todos os `ProposalAccessGrant` da versao antiga;
6. emitir a nova versao como `issued`;
7. criar novo `ProposalAccessGrant`;
8. atualizar `Proposal.current_version_id`;
9. auditar e confirmar.

Se o Candidate tentar aceitar a versao antiga durante ou depois da supersession,
a operacao deve revalidar `Proposal.current_version_id`, perceber que a versao
nao e mais corrente e recusar com resposta segura. Nunca existe "aceite tardio"
de versao antiga.

## 7. Conteudo da proposta

Conteudo conceitual minimo permitido:

- identificacao publica da Organization;
- identificacao da vaga por dados da `job_opening_version_id` congelada;
- titulo/cargo ofertado conforme a Vaga publicada ou texto operacional da
  proposta;
- modalidade/localidade/jornada quando aplicavel;
- remuneracao ofertada;
- beneficios ofertados;
- data prevista de inicio, quando definida;
- validade da proposta, quando definida;
- observacoes e condicoes operacionais;
- instrucoes ao Candidate sobre aceite/recusa.

Regras:

- proposta deve usar a `job_opening_version_id` da `CandidateApplication`, nunca
  a versao publicada corrente da Vaga se ela tiver mudado depois da candidatura;
- alteracoes futuras na Vaga, no Cargo ou no Blueprint nunca alteram proposta ja
  emitida;
- remuneracao e beneficios sao dados sensiveis e nunca aparecem para `member`,
  nem em auditoria completa;
- proposta nao deve copiar Dossie, Pre-Analise, Perfil Comportamental,
  respostas de Pre-Entrevista ou avaliacoes humanas em seu conteudo.

## 8. Regras de negocio

- RN-001: Toda proposta pertence exatamente a uma Organization.
- RN-002: Toda proposta pertence exatamente a uma `CandidateApplication`.
- RN-003: Proposta nunca pertence diretamente ao `Candidate` principal.
- RN-004: Proposta nunca pode atravessar Organizations.
- RN-005: A Organization e sempre derivada da `CandidateApplication`, nunca de
  `organization_id` enviado pelo cliente.
- RN-006: Proposta pode existir somente para `CandidateApplication` da mesma
  Organization.
- RN-007: Criar rascunho exige `CandidateApplication active`.
- RN-008: Emitir proposta exige `CandidateApplication active`.
- RN-009: Aceitar proposta exige `CandidateApplication active`.
- RN-010: Proposta nao pode ser criada, emitida, aceita, recusada ou substituida
  quando o Candidate estiver `inactive`.
- RN-011: Consentimento operacional `pending`, `revoked` ou `expired` bloqueia
  criacao, emissao, aceite e substituicao.
- RN-012: Consentimento invalido permite leitura historica autorizada e
  cancelamento administrativo por owner quando necessario.
- RN-013: Organization arquivada bloqueia toda operacao funcional de proposta.
- RN-014: Proposta emitida e imutavel.
- RN-015: Alteracao de proposta emitida exige nova versao, tornando a anterior
  `superseded`.
- RN-016: Pode existir no maximo uma `ProposalVersion issued` aceitavel por
  `CandidateApplication`.
- RN-017: Aceite da proposta nao altera automaticamente `application_status`.
- RN-018: Aceite da proposta nao cria `hired`, colaborador, onboarding ou
  contrato.
- RN-019: Somente owner registra `hired`, conforme SPEC-012.
- RN-020: No fluxo de Propostas, `hired` deve ocorrer somente depois de uma
  proposta `accepted`.
- RN-021: `hired` registrado pelo owner deve poder referenciar a proposta aceita
  que fundamentou a decisao.
- RN-022: Recusa da proposta nao altera automaticamente `application_status` para
  `rejected`.
- RN-023: Cancelamento da proposta nao cancela automaticamente a
  `CandidateApplication`.
- RN-024: Finalizar a `CandidateApplication` como `withdrawn`, `rejected` ou
  `cancelled` bloqueia aceite posterior de proposta aberta.
- RN-025: Se uma candidatura for finalizada de modo incompativel, propostas
  abertas devem deixar de ser aceitaveis; a implementacao futura deve cancelar
  ou invalidar de forma auditavel, sem reaproveitar estado silencioso.
- RN-026: `CandidateApplication hired` preserva proposta aceita e bloqueia novas
  propostas.
- RN-027: Proposta nao cria nem consome score, ranking ou recomendacao
  automatica.
- RN-028: Proposta nao chama IA.
- RN-029: Conteudo de Dossie, Pre-Analise, Perfil Comportamental,
  Pre-Entrevista e Entrevistas pode informar decisao humana, mas nao e copiado
  automaticamente para a proposta.
- RN-030: Candidate acessa apenas sua propria proposta, por escopo tecnico
  seguro.
- RN-031: Token bruto nunca e persistido, logado, auditado ou retornado apos a
  emissao.
- RN-032: Idempotencia e obrigatoria para emissao, aceite, recusa, cancelamento
  e substituicao.
- RN-033: Reuso da mesma chave de idempotencia com payload diferente deve ser
  recusado com conflito seguro.
- RN-034: Concorrencia entre aceite, recusa, cancelamento, expiracao,
  substituicao e finalizacao da candidatura deve produzir um unico vencedor.
- RN-035: Estados finais de proposta nunca retornam a estados operacionais.
- RN-036: Nao ha exclusao fisica de proposta, versao ou acesso.
- RN-037: `Proposal` nao possui estado normativo proprio; todo estado pertence a
  `ProposalVersion`.
- RN-038: `ProposalVersion issued` e imutavel em conteudo, remuneracao,
  validade e referencias contextuais.
- RN-039: Uma correcao apos emissao nunca edita a versao emitida; deve criar
  nova versao.
- RN-040: Uma versao antiga marcada como `superseded` nunca pode ser aceita,
  mesmo que o Candidate possua token antigo.
- RN-041: Aceite e recusa sempre revalidam que a `ProposalVersion` e a versao
  corrente da `Proposal`.
- RN-042: `ProposalAccessGrant` e escopo de acesso, nao permissao suficiente;
  todas as condicoes de dominio e seguranca sao revalidadas a cada acao.
- RN-043: `ProposalAccessGrant` antigo deve ser revogado quando a versao e
  cancelada, expirada ou substituida.
- RN-044: Remuneracao ofertada so pode ser visualizada integralmente por owner,
  admin autorizado e Candidate da propria proposta emitida.
- RN-045: Member nunca visualiza remuneracao, beneficios detalhados, validade,
  conteudo integral, aceite, recusa ou token.
- RN-046: Platform Admin nunca visualiza remuneracao integral por padrao, mesmo
  em leitura administrativa.
- RN-047: Manifestacao de aceite/recusa da proposta nunca e tratada como
  consentimento LGPD; consentimento operacional continua sendo pre-condicao
  separada.
- RN-048: `hired` sem Proposal continua sendo possibilidade da SPEC-012 fora do
  fluxo de Propostas; esta SPEC nao altera essa regra.
- RN-049: `hired` dentro do fluxo de Propostas deve referenciar uma
  `ProposalVersion accepted` da mesma `CandidateApplication`.
- RN-050: Referencia a `ProposalVersion accepted` de outra candidatura da mesma
  Organization e proibida e deve gerar negacao cross-candidatura.
- RN-051: Se `hired` vencer concorrencia contra aceite ainda nao confirmado, o
  aceite deve falhar porque a candidatura ja nao esta `active`.
- RN-052: Se aceite vencer concorrencia contra `hired`, o `hired` posterior
  ainda exige ato explicito de owner e referencia a versao aceita.

## 9. Permissoes

| Acao | Platform Admin | owner | admin | member | Candidate |
| --- | :---: | :---: | :---: | :---: | :---: |
| Criar rascunho | Nao | Sim | Sim | Nao | Nao |
| Editar rascunho | Nao | Sim | Sim | Nao | Nao |
| Emitir proposta | Nao | Sim | Nao | Nao | Nao |
| Substituir proposta emitida | Nao | Sim | Nao | Nao | Nao |
| Cancelar proposta emitida | Nao | Sim | Nao | Nao | Nao |
| Consultar conteudo completo interno | Nao | Sim | Sim | Nao | Nao |
| Consultar remuneracao ofertada | Nao por padrao | Sim | Sim | Nao | Somente propria proposta emitida |
| Consultar existencia/status minimo | Nao | Sim | Sim | Sim | Nao |
| Consultar propria proposta emitida | Nao | Nao | Nao | Nao | Sim |
| Aceitar proposta | Nao | Nao | Nao | Nao | Sim |
| Recusar proposta | Nao | Nao | Nao | Nao | Sim |
| Registrar `hired` | Nao | Sim | Nao | Nao | Nao |
| Leitura administrativa minimizada | Sim | Nao | Nao | Nao | Nao |

Admin pode preparar rascunho, mas a emissao e reservada a owner porque proposta
representa compromisso operacional de remuneracao e e a etapa imediatamente
anterior ao `hired`, que a SPEC-012 ja reserva exclusivamente a owner.

Admin visualiza remuneracao ofertada porque prepara rascunhos e revisa conteudo
da proposta nesta versao. Member nao visualiza remuneracao em nenhum DTO.
Platform Admin nao visualiza remuneracao integral por padrao; leitura
administrativa deve ser minimizada e justificada.

## 10. Consentimento e privacidade

Proposta usa dados pessoais e dados sensiveis de remuneracao. Portanto:

- exige consentimento operacional valido do Candidate para emissao e aceite;
- nao cria novo consentimento de privacidade por si so;
- aceite/recusa da proposta e manifestacao operacional do Candidate sobre a
  proposta, nunca consentimento LGPD generico;
- consentimento invalido apos emissao bloqueia aceite e novas propostas, mas
  preserva historico;
- o Candidate deve ver apenas a proposta emitida para sua propria candidatura;
- `member` nao ve remuneracao, beneficios detalhados ou conteudo completo;
- Platform Admin nao ve conteudo completo por padrao e precisa de motivo para
  leitura administrativa;
- auditoria nunca copia proposta completa, remuneracao completa, token, headers
  ou dados pessoais desnecessarios.

## 11. Seguranca

Toda operacao deve validar no servidor:

- User ativo, quando o ator for interno;
- Membership ativo;
- Organization ativa;
- role autorizada;
- `candidate_application_id`;
- `proposal_id`;
- `proposal_version_id`;
- `candidate_id` herdado;
- `job_opening_id` e `job_opening_version_id` herdados;
- status do Candidate;
- consentimento operacional;
- status da `CandidateApplication`;
- status da proposta;
- escopo do `ProposalAccessGrant`, quando o ator for Candidate.

Regras adicionais:

- negar por padrao;
- bloquear mass assignment de `organization_id`, status, autoria, timestamps,
  `version_number`, `accepted_at`, `declined_at` e campos internos;
- mensagens de erro para acesso cruzado devem ser genericas;
- rate limiting publico deve existir para acesso/aceite/recusa por token, sem
  valores numericos definidos nesta SPEC;
- rate limiting deve usar IP e hash do token, nunca token bruto;
- token invalido, expirado, revogado ou de outra proposta nunca deve funcionar
  como oraculo de existencia;
- toda concorrencia critica deve usar transacao, bloqueio ou controle otimista
  equivalente;
- conteudo textual da proposta deve ser tratado como dado, nunca como instrucao
  para IA futura.

## 12. Auditoria

Eventos conceituais obrigatorios:

- `proposal.draft_created`;
- `proposal.draft_updated`;
- `proposal.issued`;
- `proposal.stage_moved_to_offer`;
- `proposal.accepted`;
- `proposal.declined`;
- `proposal.expired`;
- `proposal.cancelled`;
- `proposal.superseded`;
- `proposal.access_grant_created`;
- `proposal.access_grant_revoked`;
- `proposal.permission_denied`;
- `proposal.cross_organization_access_denied`;
- `proposal.cross_candidature_reference_denied`;
- `proposal.administrative_read`;
- `proposal.audit_failure_rollback`.

Auditoria deve registrar Organization, candidatura, proposta, versao, ator,
acao, resultado, timestamps, motivo quando aplicavel e metadados seguros. Nunca
deve registrar conteudo completo, remuneracao completa, token bruto, segredo,
header ou payload sensivel completo.

Falha de auditoria critica em emissao, aceite, recusa, cancelamento,
substituicao ou registro de `hired` relacionado a proposta deve causar rollback
da operacao correspondente.

## 13. API conceitual

| Operacao | Finalidade |
| --- | --- |
| Criar rascunho | Criar primeira versao `draft` para uma candidatura ativa. |
| Atualizar rascunho | Alterar conteudo antes da emissao. |
| Consultar proposta interna | Consultar conteudo completo permitido a owner/admin. |
| Listar propostas da candidatura | Consultar historico permitido da `CandidateApplication`. |
| Emitir proposta | Congelar versao, mover para `offer` quando aplicavel e criar acesso seguro. |
| Substituir proposta | Emitir nova versao e marcar a anterior como `superseded`. |
| Cancelar proposta | Encerrar proposta emitida por decisao do owner. |
| Consultar proposta por acesso do Candidate | Retornar somente a proposta emitida escopada ao token. |
| Aceitar proposta | Registrar aceite do Candidate. |
| Recusar proposta | Registrar recusa do Candidate. |
| Leitura administrativa | Consulta minimizada por Platform Admin com motivo. |

Esta SPEC nao define URLs finais, contratos HTTP fisicos ou schema SQL.

## 14. Interface conceitual

Interface interna prevista:

- aba ou secao de Propostas dentro da `CandidateApplication`;
- criacao/edicao de rascunho;
- resumo de contexto da candidatura e da Vaga;
- campos de conteudo e remuneracao;
- acao de emitir, restrita a owner;
- historico de versoes;
- status atual;
- bloqueios claros por Candidate inativo, consentimento invalido,
  Organization arquivada ou candidatura finalizada.

Interface do Candidate:

- leitura da proposta emitida;
- acao de aceitar;
- acao de recusar;
- indicacao de indisponibilidade quando proposta expirou, foi cancelada,
  substituida, a candidatura foi finalizada de modo incompativel, o Candidate
  esta inativo, o consentimento esta invalido ou a Organization esta arquivada.

Nenhuma interface desta SPEC apresenta score, ranking, Dossie completo,
Pre-Analise, Perfil Comportamental, respostas de Pre-Entrevista ou avaliacoes
humanas ao Candidate.

## 15. Banco conceitual

Sem SQL, sem migration. Entidades conceituais minimas:

- `proposals`;
- `proposal_versions`;
- `proposal_access_grants`.

Regras conceituais:

- `organization_id` obrigatorio em todas as entidades;
- `organization_id` consistente com a `CandidateApplication`;
- `candidate_application_id` obrigatorio e imutavel;
- `candidate_id`, `job_opening_id` e `job_opening_version_id` sempre herdados
  da `CandidateApplication`;
- uma versao `issued` aceitavel por candidatura;
- versoes emitidas e finais imutaveis;
- ausencia de cascade destrutivo;
- ausencia de exclusao fisica;
- FKs ou validacoes equivalentes impedem cross-tenant e cross-candidatura;
- token persistido apenas como hash;
- `version_number` sequencial dentro da proposta;
- estados canonicos validados.

## 16. Relacao com IA, Dossie e instrumentos

Esta SPEC nao chama IA e nao cria Feature de IA.

Regras:

- nenhuma chamada ao `AIGateway`;
- nenhum `AI Execution`;
- nenhum `feature_key`;
- nenhum prompt;
- nenhum score, ranking ou recomendacao automatica;
- Dossie Inteligente, Pre-Analise, Perfil Comportamental, Pre-Entrevista e
  Entrevistas podem ser consultados internamente pelos atores autorizados em
  seus modulos proprios, mas nao sao copiados automaticamente para a proposta;
- proposta nao reinterpreta evidencias nem transforma inferencia em fato.

## 17. Onboarding, assinatura e pos-contratacao

Aceite de proposta:

- nao e assinatura eletronica juridica;
- nao cria contrato trabalhista completo;
- nao cria colaborador;
- nao cria onboarding;
- nao dispara checklist admissional;
- nao altera plano, cargo ocupado, unidade organizacional ou folha;
- nao substitui decisao humana `hired`.

Onboarding futuro pode consumir, como pre-condicao, uma
`CandidateApplication hired` e uma proposta aceita, mas essa integracao pertence
a SPEC-016/Fase 23 ou documento futuro, nao a esta SPEC.

## 18. Organization arquivada, Candidate inativo e candidatura final

- Organization arquivada bloqueia criacao, edicao, emissao, aceite, recusa,
  cancelamento funcional e substituicao; historico permanece preservado para
  leitura administrativa autorizada.
- Candidate inativo bloqueia novas propostas, emissao, aceite e recusa; nao
  apaga historico.
- `CandidateApplication withdrawn`, `rejected` ou `cancelled` bloqueia nova
  proposta e aceite de proposta aberta.
- `CandidateApplication hired` bloqueia nova proposta, preservando proposta
  aceita e historico.
- Estados finais de `CandidateApplication` nunca sao reabertos por proposta.

### 18.1 Matriz operacional

| Contexto | Criar/editar draft | Emitir | Candidate consultar | Candidate aceitar | Candidate recusar | Owner cancelar | Owner substituir | Owner registrar `hired` pelo fluxo de Propostas |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Organization `active`, Candidate `active`, Application `active` | Sim | Sim | Sim, se versao `issued` e grant valido | Sim, se versao corrente `issued` | Sim, se versao corrente `issued` | Sim, se `issued` | Sim, se `issued` | Sim, apos `accepted` |
| Organization `archived` | Nao | Nao | Nao funcionalmente | Nao | Nao | Nao funcionalmente | Nao | Nao |
| Candidate `inactive` | Nao | Nao | Historico minimo quando permitido | Nao | Nao | Sim, cancelamento administrativo por owner quando necessario | Nao | Nao |
| Application `withdrawn` | Nao | Nao | Historico minimo quando permitido | Nao | Nao | Nao funcionalmente | Nao | Nao |
| Application `rejected` | Nao | Nao | Historico minimo quando permitido | Nao | Nao | Nao funcionalmente | Nao | Nao |
| Application `cancelled` | Nao | Nao | Historico minimo quando permitido | Nao | Nao | Nao funcionalmente | Nao | Nao |
| Application `hired` | Nao | Nao | Historico minimo quando permitido | Nao | Nao | Nao | Nao | Ja finalizada |

Leitura historica minima pelo Candidate, quando permitida, nunca reabre a
proposta, nunca permite aceite/recusa tardios e nunca expõe dados fora da
`ProposalVersion` que ele ja havia recebido. A implementacao futura pode optar
por indisponibilizar completamente o acesso publico em estados bloqueados; se
permitir leitura historica, deve manter os mesmos controles de token, escopo e
minimizacao.

## 19. Concorrencia e idempotencia

Cenarios obrigatorios:

- duas emissoes simultaneas para a mesma candidatura;
- aceite concorrendo com recusa;
- aceite concorrendo com cancelamento;
- aceite concorrendo com expiracao;
- substituicao concorrendo com aceite;
- `hired` concorrendo com aceite;
- finalizacao da candidatura concorrendo com aceite;
- duplo clique/retry de emissao, aceite, recusa, cancelamento ou substituicao.

Principios:

- a primeira operacao confirmada prevalece;
- a segunda recebe conflito seguro ou retorno idempotente, conforme chave e
  fingerprint;
- nenhuma concorrencia pode produzir duas propostas `issued` aceitaveis;
- nenhuma concorrencia pode produzir dois estados finais diferentes para a mesma
  versao;
- nenhuma operacao parcial deve permanecer apos falha critica.

Regras especificas:

- **accept x decline:** primeira transicao confirmada vence; a outra recebe
  conflito seguro ou retorno idempotente quando for a mesma acao/fingerprint.
- **accept x cancel:** se aceite confirmar primeiro, cancelamento falha porque a
  versao ja esta `accepted`; se cancelamento confirmar primeiro, aceite falha
  porque a versao ja esta `cancelled`.
- **accept x expire:** se o tempo de validade ja venceu no momento da
  revalidacao transacional, expiracao prevalece; se aceite confirmou antes do
  vencimento, a versao fica `accepted`.
- **accept x supersede:** se supersession confirmar primeiro, token antigo e
  versao antiga falham por `superseded`; se aceite confirmar primeiro,
  supersession falha porque a versao ja esta `accepted`.
- **hired x accept:** se `hired` confirmar primeiro, aceite falha porque a
  `CandidateApplication` ja nao esta `active`; se aceite confirmar primeiro,
  `hired` ainda exige acao posterior explicita de owner.
- **duplo clique/retry:** mesma `Idempotency-Key` e mesmo fingerprint retornam o
  mesmo resultado; mesma chave com fingerprint diferente gera conflito seguro.

## 20. Criterios de aceite

1. CA-001: Proposta e criada somente para `CandidateApplication` da mesma
   Organization.
2. CA-002: Proposta nunca e criada diretamente para `Candidate`.
3. CA-003: Proposta nunca e criada diretamente para `Job Opening`.
4. CA-004: Organization e derivada da candidatura, nunca de `organization_id`
   enviado pelo cliente.
5. CA-005: Owner cria rascunho.
6. CA-006: Admin cria rascunho.
7. CA-007: Member nao cria rascunho.
8. CA-008: Owner emite proposta.
9. CA-009: Admin nao emite proposta.
10. CA-010: Emissao exige `CandidateApplication active`.
11. CA-011: Emissao move ou confirma `current_stage = offer` como parte de ato
    humano explicito.
12. CA-012: Emissao respeita motivo quando houver salto de etapa exigido pela
    SPEC-012.
13. CA-013: Proposta emitida fica imutavel.
14. CA-014: Alterar proposta emitida exige nova versao e marca a anterior como
    `superseded`.
15. CA-015: Apenas uma versao `issued` aceitavel existe por candidatura.
16. CA-016: Candidate acessa apenas proposta da propria candidatura.
17. CA-017: Token bruto nunca e persistido nem logado.
18. CA-018: Candidate aceita proposta `issued` valida.
19. CA-019: Aceite nao altera automaticamente `application_status`.
20. CA-020: Aceite nao cria `hired`.
21. CA-021: Owner registra `hired` explicitamente apos proposta aceita.
22. CA-022: Admin nao registra `hired`.
23. CA-023: Proposta recusada nao rejeita automaticamente a candidatura.
24. CA-024: Proposta expirada nao pode ser aceita.
25. CA-025: Proposta cancelada nao pode ser aceita.
26. CA-026: Proposta `superseded` nao pode ser aceita.
27. CA-027: CandidateApplication finalizada bloqueia nova proposta.
28. CA-028: CandidateApplication finalizada bloqueia aceite posterior de
    proposta aberta.
29. CA-029: Candidate inativo bloqueia emissao e aceite.
30. CA-030: Consentimento `pending`, `revoked` ou `expired` bloqueia emissao e
    aceite.
31. CA-031: Organization arquivada bloqueia operacoes funcionais.
32. CA-032: Member nao visualiza remuneracao nem conteudo completo.
33. CA-033: Platform Admin nao opera funcionalmente proposta.
34. CA-034: Platform Admin exige motivo e auditoria para leitura administrativa.
35. CA-035: Acesso cross-Organization e recusado com mensagem generica.
36. CA-036: Acesso cross-candidatura dentro da mesma Organization e recusado.
37. CA-037: Emissao, aceite, recusa, cancelamento e substituicao sao
    idempotentes.
38. CA-038: Reuso de chave idempotente com payload diferente gera conflito
    seguro.
39. CA-039: Concorrencia entre aceite e recusa produz um unico estado final.
40. CA-040: Concorrencia entre aceite e cancelamento produz um unico estado
    final.
41. CA-041: Concorrencia entre aceite e substituicao produz resultado
    deterministico.
42. CA-042: Auditoria critica falhando causa rollback.
43. CA-043: Auditoria nunca registra conteudo completo, remuneracao completa,
    token bruto, headers ou segredos.
44. CA-044: Nenhuma chamada ao `AIGateway`, provider, modelo ou Prompt Registry
    ocorre.
45. CA-045: Nenhum score, ranking, matching ou recomendacao automatica e criado.
46. CA-046: Nenhum colaborador, onboarding, contrato ou assinatura eletronica e
    criado.
47. CA-047: Proposta usa `job_opening_version_id` herdado da
    `CandidateApplication`.
48. CA-048: Nova versao da Vaga nao altera proposta ja emitida.
49. CA-049: Dados persistem apos recriar a aplicacao futura.
50. CA-050: Nao existe exclusao fisica de proposta, versao ou acesso.
51. CA-051: `Proposal` nao possui estado normativo proprio; estado e derivado da
    `ProposalVersion` corrente.
52. CA-052: `ProposalVersion` e a unica dona de conteudo, remuneracao,
    validade, aceite, recusa, expiracao, cancelamento e supersession.
53. CA-053: Rascunho (`draft`) nunca e visivel ao Candidate.
54. CA-054: Descarte de rascunho nao emitido nao afeta versao `issued`.
55. CA-055: Nova versao `draft` pode ser preparada enquanto a versao `issued`
    anterior permanece aceitavel, ate supersession ou cancelamento.
56. CA-056: Emitir nova versao substitutiva marca a anterior como `superseded`
    e revoga seus grants na mesma transacao.
57. CA-057: `Proposal.current_version_id` aponta para a unica versao aceitavel.
58. CA-058: Aceite revalida `Proposal.current_version_id` no momento da acao.
59. CA-059: Recusa revalida `Proposal.current_version_id` no momento da acao.
60. CA-060: Token antigo de versao `superseded` nao permite consulta funcional,
    aceite nem recusa.
61. CA-061: `ProposalAccessGrant` sozinho nao autoriza; dominio e seguranca sao
    revalidados em toda acao.
62. CA-062: `ProposalAccessGrant` e revogado em cancelamento, expiracao
    materializada ou supersession.
63. CA-063: Candidate so visualiza remuneracao da propria proposta emitida.
64. CA-064: Admin visualiza remuneracao para preparar/revisar rascunho.
65. CA-065: Platform Admin nao recebe remuneracao integral por padrao.
66. CA-066: Aceite da proposta e manifestacao operacional, nao consentimento
    LGPD.
67. CA-067: Consentimento operacional valido e pre-condicao separada para emissao
    e aceite.
68. CA-068: `hired` sem Proposal permanece possivel apenas como regra herdada da
    SPEC-012 fora do fluxo de Propostas.
69. CA-069: `hired` no fluxo de Propostas referencia `ProposalVersion accepted`
    da mesma `CandidateApplication`.
70. CA-070: Referencia a proposta aceita de outra candidatura da mesma
    Organization e recusada.
71. CA-071: `accept x decline` produz um unico estado final.
72. CA-072: `accept x cancel` produz um unico estado final.
73. CA-073: `accept x expire` produz resultado deterministico.
74. CA-074: `accept x supersede` produz resultado deterministico.
75. CA-075: `hired x accept` produz resultado deterministico sem `hired`
    automatico.
76. CA-076: Organization arquivada bloqueia tambem consulta funcional do
    Candidate, salvo leitura historica minima quando a implementacao futura a
    permitir.
77. CA-077: Candidate inativo bloqueia consulta funcional, aceite e recusa, mas
    preserva historico.
78. CA-078: Application `withdrawn`, `rejected`, `cancelled` ou `hired` bloqueia
    aceite e recusa tardios.
79. CA-079: Auditoria de supersession nunca registra conteudo integral da versao
    antiga ou nova.
80. CA-080: Falha de auditoria em supersession reverte versao antiga, nova versao,
    grants e `current_version_id`.

## 21. Testes obrigatorios

Quando esta SPEC for implementada, os testes devem comprovar, no minimo:

1. criar rascunho para `CandidateApplication active`;
2. bloquear rascunho para candidatura de outra Organization;
3. bloquear rascunho para `CandidateApplication` finalizada;
4. bloquear rascunho para Candidate inativo;
5. bloquear rascunho com consentimento invalido;
6. owner emitir proposta;
7. admin impedido de emitir proposta;
8. member impedido de criar ou emitir;
9. emissao muda/confirma `current_stage = offer`;
10. emissao com salto de etapa exige motivo quando aplicavel;
11. proposta emitida imutavel;
12. substituicao cria nova versao e marca anterior `superseded`;
13. versao `superseded` nao pode ser aceita;
14. impedir duas propostas `issued` aceitaveis para a mesma candidatura;
15. Candidate consulta proposta propria por acesso seguro;
16. Candidate impedido de consultar proposta de outra candidatura;
17. token bruto ausente de banco, logs e auditoria;
18. rate limit por IP/hash do token previsto para acesso publico;
19. aceite valido marca proposta `accepted`;
20. aceite nao altera `application_status`;
21. aceite nao cria `hired`;
22. owner registra `hired` referenciando proposta aceita;
23. admin impedido de registrar `hired`;
24. recusa valida marca proposta `declined`;
25. recusa nao altera `application_status` para `rejected`;
26. expiracao bloqueia aceite;
27. cancelamento por owner exige motivo;
28. proposta cancelada bloqueia aceite;
29. CandidateApplication `withdrawn` bloqueia aceite;
30. CandidateApplication `rejected` bloqueia aceite;
31. CandidateApplication `cancelled` bloqueia aceite;
32. CandidateApplication `hired` bloqueia nova proposta;
33. Candidate inativo bloqueia aceite;
34. consentimento `pending` bloqueia aceite;
35. consentimento `revoked` bloqueia aceite;
36. consentimento `expired` bloqueia aceite;
37. Organization arquivada bloqueia operacoes funcionais;
38. member recebe apenas DTO minimo sem remuneracao;
39. Platform Admin nao opera funcionalmente;
40. Platform Admin realiza leitura administrativa minimizada com motivo;
41. acesso cross-Organization gera erro generico;
42. acesso cross-candidatura na mesma Organization gera erro generico;
43. mass assignment de campos protegidos e bloqueado;
44. emissao idempotente nao duplica versao;
45. aceite idempotente nao duplica evento nem altera estado final;
46. recusa idempotente nao duplica evento;
47. cancelamento idempotente nao duplica evento;
48. mesma `Idempotency-Key` com payload diferente gera conflito;
49. aceite concorrendo com recusa produz um unico estado final;
50. aceite concorrendo com cancelamento produz um unico estado final;
51. aceite concorrendo com expiracao produz resultado deterministico;
52. aceite concorrendo com substituicao produz resultado deterministico;
53. finalizacao da candidatura concorrendo com aceite produz resultado
    deterministico;
54. auditoria de emissao, aceite, recusa, cancelamento e substituicao;
55. auditoria sem conteudo completo, remuneracao completa, tokens ou headers;
56. rollback quando auditoria critica falha;
57. nenhuma chamada de IA em qualquer fluxo;
58. nenhum score/ranking/matching criado;
59. nenhum Employee/Onboarding/assinatura criado;
60. nova versao da Vaga nao altera proposta emitida;
61. proposta persiste apos recriar a aplicacao;
62. nenhuma exclusao fisica de proposta, versao ou acesso.
63. `Proposal` sem estado normativo proprio;
64. estado exibido derivado da `ProposalVersion` corrente;
65. `ProposalVersion` guarda conteudo, remuneracao, validade e lifecycle;
66. Candidate nao visualiza rascunho;
67. preparar novo rascunho sem alterar versao `issued` vigente;
68. descartar rascunho sem alterar versao `issued`;
69. emitir versao substitutiva revoga grants antigos;
70. emitir versao substitutiva atualiza `current_version_id`;
71. aceitar versao antiga apos supersession e bloqueado;
72. recusar versao antiga apos supersession e bloqueado;
73. token antigo nao funciona como oraculo de existencia;
74. `ProposalAccessGrant` com token valido mas Organization arquivada bloqueia;
75. `ProposalAccessGrant` com token valido mas Candidate inativo bloqueia;
76. `ProposalAccessGrant` com token valido mas consentimento invalido bloqueia;
77. `ProposalAccessGrant` com token valido mas candidatura finalizada bloqueia;
78. grant revogado bloqueia consulta funcional;
79. grant de outra proposta/candidatura bloqueia com mensagem generica;
80. owner visualiza remuneracao;
81. admin visualiza remuneracao;
82. member nunca visualiza remuneracao;
83. Platform Admin leitura administrativa sem remuneracao integral por padrao;
84. Candidate visualiza remuneracao apenas da propria proposta emitida;
85. aceite registra manifestacao operacional separada de consentimento;
86. consentimento operacional `granted` e exigido alem da manifestacao de aceite;
87. `hired` por fluxo de Propostas exige `ProposalVersion accepted`;
88. `hired` por fluxo de Propostas recusa ProposalVersion de outra candidatura;
89. `hired` herdado da SPEC-012 fora do fluxo de Propostas nao e bloqueado por
    esta SPEC;
90. `accept x decline`: aceite vence;
91. `accept x decline`: recusa vence;
92. `accept x cancel`: aceite vence;
93. `accept x cancel`: cancelamento vence;
94. `accept x expire`: expiracao vence quando validade ja passou;
95. `accept x expire`: aceite vence quando confirmado antes da validade;
96. `accept x supersede`: supersession vence;
97. `accept x supersede`: aceite vence;
98. `hired x accept`: `hired` vence e aceite falha por candidatura final;
99. `hired x accept`: aceite vence e `hired` posterior ainda exige owner;
100. supersession com falha de auditoria reverte toda a transacao;
101. cancelamento revoga grants;
102. expiracao materializada revoga ou invalida grants;
103. auditoria de supersession sem conteudo integral;
104. auditoria de aceite sem remuneracao completa;
105. auditoria de recusa sem remuneracao completa;
106. auditoria sem token bruto em todos os eventos;
107. Organization arquivada bloqueia criacao, edicao, emissao, aceite, recusa,
     cancelamento funcional, substituicao e `hired` por fluxo de Propostas;
108. Candidate inativo preserva historico sem permitir acao funcional;
109. Application `withdrawn` bloqueia nova proposta, aceite e recusa;
110. Application `rejected` bloqueia nova proposta, aceite e recusa;
111. Application `cancelled` bloqueia nova proposta, aceite e recusa;
112. Application `hired` bloqueia nova proposta, aceite e recusa;
113. nenhuma assinatura eletronica juridica e criada;
114. nenhum contrato, Employee ou Onboarding e criado;
115. nenhum score, ranking, matching ou recomendacao e criado;
116. nenhuma chamada a IA, `AIGateway`, provider, modelo ou prompt ocorre.

## 22. Ambiguidades registradas

### 22.1 Obrigatoriedade universal de proposta antes de hired

**Decidido nesta versao:** esta SPEC nao torna Proposal obrigatoria para todo
`hired`. Ela decide que, **no fluxo de Propostas**, `hired` ocorre apos
`ProposalVersion accepted` e por ato explicito de owner. Ela nao revisa
globalmente todos os fluxos da SPEC-012 que ja permitiam `hired` sem modulo de
Propostas, porque isso exigiria revisao propria da SPEC-012.

Ponto revisitavel: se o produto decidir que todo `hired` deve exigir proposta
aceita, a SPEC-012 precisa ser revisada explicitamente antes da implementacao
dessa obrigatoriedade.

### 22.2 Mecanismo fisico de acesso do Candidate

Esta SPEC define invariantes de seguranca para acesso por token opaco, mas nao
define URL, tabela fisica final, duracao numerica, provedor de e-mail ou canal
de entrega. Isso segue o padrao das SPEC-021 e SPEC-022.

### 22.3 Assinatura juridica

Aceite de proposta e uma manifestacao operacional registrada. Nao equivale a
assinatura eletronica juridica. Uma futura assinatura exigira SPEC propria.

### 22.4 Valores numericos

Esta SPEC nao define duracao padrao de proposta, limite de tentativas, limite de
rate limit ou tamanho maximo de campos. Esses valores pertencem a especificacao
tecnica futura, salvo se uma regra de negocio exigir revisao desta SPEC.

### 22.5 Leitura historica do Candidate apos bloqueio funcional

**Decidido parcialmente nesta versao:** aceite e recusa ficam sempre bloqueados
quando Organization, Candidate ou CandidateApplication deixam de ser
operacionalmente validos. A leitura historica minima pelo Candidate pode ser
permitida ou indisponibilizada pela implementacao futura, desde que nunca permita
acao funcional, nunca exponha dado fora da propria proposta e nunca enfraqueca
isolamento, token, minimizacao e auditoria.

## 23. Conflitos encontrados

Nenhum conflito critico foi encontrado com ADR-0013, ADR-0014, ADR-0015,
ADR-0020, ADR-0021, ADR-0022, ADR-0023 ou SPEC-011 a SPEC-024.

Ponto de tensao resolvido nesta revisao:

- SPEC-012 ja permite `hired` como ato de owner e declarou propostas fora de
  escopo. Esta SPEC nao altera retroativamente essa regra geral, nem tenta
  tornar Proposal obrigatoria para todo `hired`. Ela define apenas a regra do
  fluxo de Propostas: quando a Organization usa Proposal para concluir a
  negociacao, `hired` deve referenciar uma `ProposalVersion accepted`, sem
  automatizar essa decisao.

## 24. Limitacoes conhecidas

- Nao implementa codigo, banco, migrations, rotas, APIs, testes ou dependencias.
- Nao define assinatura eletronica juridica.
- Nao define template juridico definitivo.
- Nao define canal de envio da proposta.
- Nao define notificacoes.
- Nao define valores numericos de expiracao, rate limit ou tentativas.
- Nao define workflow de aprovacao financeira/juridica.
- Nao define Onboarding.
- Nao define Employee/Collaborator.
- Nao define integracao com folha, documento admissional ou assinatura externa.
- Nao altera globalmente a SPEC-012 para tornar proposta obrigatoria em todo
  registro de `hired`.
- Nao define a politica fisica final de envio ou reenvio do link de acesso.
- Nao define mecanismo de verificacao forte de identidade do Candidate.

## 25. Definicao de concluido

Para a implementacao futura desta SPEC:

- SPEC aprovada antes do desenvolvimento;
- nenhuma regra da SPEC-012 sobre `CandidateApplication` e `hired` foi
  automatizada ou enfraquecida;
- `Proposal` permanece envelope sem estado normativo proprio;
- `ProposalVersion` permanece fonte de verdade para estado, conteudo e resultado
  da proposta;
- aceite, recusa, expiracao, cancelamento e supersession sao transacionais e
  idempotentes;
- criterios de aceite atendidos;
- testes obrigatorios implementados e passando;
- testes de seguranca, multiempresa, cross-candidatura, concorrencia e
  idempotencia passando;
- regras de consentimento e privacidade verificadas;
- remuneracao protegida em DTOs, logs e auditoria;
- rollback de auditoria critica verificado;
- migrations reproduziveis quando houver banco;
- lint passando;
- formatacao passando;
- build passando;
- documentacao atualizada;
- auditoria revisada;
- nenhuma funcionalidade de Onboarding, assinatura juridica, IA, score, ranking
  ou decisao automatica implementada antecipadamente;
- commit realizado.
