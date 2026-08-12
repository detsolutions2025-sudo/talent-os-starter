# SPEC-022 - Perfil Comportamental

**Status:** Aprovada
**Versão:** 1.0
**Fase:** 19
**Responsável de negócio:** Thiago Sousa
**Última atualização:** 2026-08-10
**Dependências:** SPEC-009 - Banco de Perguntas, SPEC-011 - Candidatos (v1.2), SPEC-012 - Processo Seletivo (v1.1), SPEC-018 - Blueprint Organizacional / Implantação Guiada, SPEC-021 - Pré-Entrevista Estruturada, ADR-0013, ADR-0014, ADR-0015, ADR-0016, ADR-0017, ADR-0020, ADR-0021, ADR-0022, ADR-0023

**Nota de revisão (v1.0 — revisão destrutiva):** esta revisão fecha as
lacunas e ambiguidades que a versão 0.1 (Rascunho) deste documento havia
deixado abertas ou implícitas: formaliza atomicidade do envio final
(submissão + cálculo + persistência do resultado + `completed` como uma
única transação, com reversão completa em caso de falha de cálculo,
seção 15.1); esclarece que `draft` é sempre transitório e nunca uma
pausa funcional persistida (seção 7.1); define que uma nova tentativa
sempre resolve a versão do instrumento vigente no momento da
reabertura, nunca a versão herdada (seção 17); completa a proveniência
de importação externa com `completed_at_external` e
`imported_by_user_id`, além de `applied_at_external`/`imported_at` já
previstos (seção 28); declara `purpose = "behavioral_assessment"` como
valor canônico de consentimento e exige rastreabilidade do
`candidate_consents.id` usado em cada aplicação (seção 20); introduz
`candidate_result_visibility` e `raw_response_owner_visibility` como
propriedades do instrumento — nunca decisão de frontend — para
visibilidade de resultado e de respostas brutas (seção 4.5, seção
25.1, seção 25.3); formaliza que uma versão `archived` continua
interpretando histórico já existente (seção 4.5); proíbe
explicitamente conversão arbitrária de texto em número, normalização
entre instrumentos e qualquer agregação de dimensões em nota única
(seção 13); distingue interpretação metodológica, humana e futura
inferência assistida por IA, proibindo que nota humana seja gravada
como resultado do instrumento (seção 14.1); separa formalmente a
timeline de domínio da auditoria geral (seção 29.1); e confirma que
instrumentos globais permanecem operáveis por outras Organizations
quando uma Organization específica é arquivada (seção 31). Nenhuma
regra de negócio já registrada na versão 0.1 foi removida; esta revisão
apenas formaliza o que estava implícito e resolve as ambiguidades
identificadas. Nenhum conflito crítico foi encontrado com ADR-0013,
ADR-0014, ADR-0015, ADR-0020 a ADR-0023 ou com SPEC-009, SPEC-010,
SPEC-011, SPEC-012, SPEC-013, SPEC-014, SPEC-018, SPEC-019, SPEC-020 ou
SPEC-021.

## 1. Objetivo

Definir funcionalmente o **Perfil Comportamental**: uma informação
estruturada de apoio ao processo seletivo, produzida pela aplicação de um
**Instrumento Comportamental** formal a uma `CandidateApplication`
específica — nunca ao `Candidate` principal, nunca de forma obrigatória, e
nunca como substituto de avaliação humana.

Esta SPEC formaliza o que a ADR-0023 (seção "Perfil Comportamental")
antecipou e deixou deliberadamente em aberto: "Perfil Comportamental é um
conceito independente da Pré-Entrevista: nem toda Pré-Entrevista gera
automaticamente um Perfil Comportamental; produzi-lo depende de
metodologia e instrumento próprios, definidos por SPEC futura." Esta SPEC
é essa SPEC futura.

**O Perfil Comportamental funciona integralmente sem Inteligência
Artificial.** Nenhuma etapa desta SPEC depende de IA, chama `AIGateway` ou
é bloqueada pela ausência, indisponibilidade ou desabilitação de IA
(ADR-0016; BACKLOG.md, "Observações — IA opcional (SPEC-018 a SPEC-024)":
"nenhuma SPEC futura pode tornar um fluxo humano de recrutamento e
seleção obrigatoriamente dependente de IA").

Esta SPEC **reutiliza integralmente** `Candidate` (SPEC-011) e
`CandidateApplication` (SPEC-012) já aprovados, e reaproveita, sempre que
adequado, o mesmo padrão arquitetural já validado e aprovado pela
SPEC-021 (Configuração × Instância × Tentativa; snapshot de contexto;
token opaco de acesso público; expiração lazy; state machine física) —
nunca copiando cegamente onde o domínio é genuinamente diferente (seção
5, seção 6, seção 7).

## 2. Fora do Escopo

Esta SPEC não define nem implementa:

- Inteligência Artificial, em qualquer forma (chamada a `AIGateway`,
  provider, modelo, Prompt Registry, inferência comportamental por IA);
- Pré-Análise Assistida por IA (SPEC-023);
- Dossiê Inteligente do Candidato (SPEC-024);
- score, ranking, matching, "fit" ou qualquer métrica de aprovação
  automática de contratação (distinto de score metodológico interno do
  instrumento — seção 13);
- decisão de contratação, eliminação automática ou qualquer efeito de RH
  decorrente diretamente do Perfil Comportamental;
- alteração do enum de `current_stage` já definido pela SPEC-012/ADR-0014
  (`applied`, `screening`, `interview`, `assessment`, `offer`,
  `completed`);
- alteração automática de `application_status`, finalização, `rejected`
  ou `hired` da `CandidateApplication`;
- geração automática de Perfil Comportamental a partir de respostas da
  Pré-Entrevista (SPEC-021) — ver seção 22;
- `Interview` (Entrevista humana, SPEC-013) — conceito distinto;
- Banco de Perguntas (já definido integralmente pela SPEC-009) — esta
  SPEC define a fronteira explícita de por que não o reutiliza para itens
  de instrumento (seção 6), sem redefinir nenhuma regra já aprovada por
  ela;
- **qualquer metodologia DISC específica**: algoritmo, fórmula,
  questionário proprietário, licenciamento, cálculo ou interpretação
  (seção 5) — DISC é citado apenas como exemplo de instrumento possível,
  nunca implementado, calculado ou reproduzido por esta SPEC;
- diagnóstico clínico, diagnóstico psicológico ou qualquer uso médico
  (seção 37 da tarefa que originou este documento; ver seção 14);
- afirmação de validade científica de qualquer metodologia — esta SPEC é
  arquitetura funcional de produto, não validação científica de
  instrumento (mesmo princípio);
- reaproveitamento cross-Organization de instrumento, resposta ou
  resultado privado de uma Organization;
- compartilhamento público de resultado;
- redefinição de qualquer regra já aprovada pela SPEC-009, SPEC-010,
  SPEC-011, SPEC-012, SPEC-013, SPEC-014, SPEC-018, SPEC-019, SPEC-020 ou
  SPEC-021;
- mecanismo técnico físico de acesso do Candidate sem autenticação como
  `User` (token, link opaco) — apenas seus invariantes de segurança são
  registrados (seção 26), reutilizando os já validados pela SPEC-021,
  seção 25.1;
- mecanismo técnico de execução assíncrona (fila, worker, scheduler);
- tempo máximo/mínimo de resposta, quantidade máxima de tentativas ou
  valor numérico de `expires_at` — ficam para especificação técnica
  futura, mesmo princípio da SPEC-021, seção 33;
- validação técnica/criptográfica de autenticidade de resultado importado
  de instrumento externo — apenas validação estrutural de servidor é
  exigida (seção 28);
- implementar código, banco, migrations, rotas, APIs, testes ou
  dependências;
- excluir fisicamente qualquer dado.

Esses assuntos pertencem à SPEC-023 (Pré-Análise Assistida por IA),
SPEC-024 (Dossiê Inteligente do Candidato), a uma SPEC própria de DISC
(caso a plataforma decida, no futuro, licenciar e implementar esse
instrumento especificamente), ou às SPECs já aprovadas que esta SPEC
apenas referencia.

## 3. Usuários Envolvidos

- **owner:** configura o Instrumento Comportamental disponível para uma
  vaga (quando aplicável), cria a aplicação do instrumento para uma
  `CandidateApplication` específica, consulta resultados, cancela,
  autoriza reabertura, consulta histórico. Administra Instrumentos
  Comportamentais próprios da Organization (seção 4.4).
- **admin:** possui, nesta versão, exatamente os mesmos poderes
  operacionais de `owner` sobre esta SPEC (mesma decisão já adotada pela
  SPEC-021, seção 24.1, avaliada e mantida aqui sem justificativa nova
  para diferenciar — seção 25.1).
- **member:** visualiza somente que uma aplicação de instrumento existe e
  seu status, para candidaturas `active` que já pode visualizar
  (SPEC-012, seção 12) — nunca o conteúdo de respostas nem valores de
  dimensão do resultado. Esta SPEC aplica minimização **mais rigorosa**
  que a SPEC-021 (seção 25.2), por se tratar de informação
  comportamental potencialmente sensível.
- **Candidate:** a mesma pessoa candidata já definida pela SPEC-011,
  identificada por sua `CandidateApplication`. Responde ao instrumento
  quando a aplicação for do tipo `internal_application` (seção 10), sem
  autenticação como `User` nem `Membership`, mesmo princípio de
  identidade já estabelecido pela SPEC-020 e reafirmado pela SPEC-021.
- **Platform Admin (SuperAdmin):** administra o catálogo de Instrumentos
  Comportamentais **globais** da plataforma (mesmo papel que já exerce
  sobre `global_questions`, SPEC-009); consulta administrativamente
  aplicações de instrumento com motivo e auditoria, sem operar
  funcionalmente e sem receber respostas brutas ou valores de dimensão
  por padrão (seção 27).

`Platform Admin` não é Role de Membership e não recebe permissões
funcionais de `owner`, `admin` ou `member` dentro da Organization
(ADR-0003, ADR-0020).

### 3.1 Owner e Admin — avaliação explícita de diferenciação

A tarefa que originou este documento pede explicitamente que se avalie
se `admin` deve possuir os mesmos poderes de `owner` nesta v1, ou se há
diferença justificada. Esta avaliação foi feita: não existe, nesta
versão, nenhuma ação sobre o Perfil Comportamental com risco ou impacto
equivalente ao que já justifica exclusividade de `owner` em outras SPECs
(por exemplo, `hired` na SPEC-012, ou publicação na SPEC-005/SPEC-008/
SPEC-010/ADR-0022). A aplicação de um instrumento comportamental é
operacionalmente análoga à criação de uma Pré-Entrevista (SPEC-021,
seção 24.1), onde a mesma pergunta já foi feita e respondida com a mesma
conclusão. Uma revisão futura pode reservar exclusividade a `owner`, caso
uma necessidade de negócio específica surja — esta versão não antecipa
essa restrição sem necessidade real.

## 4. Conceitos

### 4.1 Perfil Comportamental

O conceito funcional amplo desta SPEC: o **resultado estruturado**
produzido pela aplicação de um Instrumento Comportamental formal a uma
`CandidateApplication`. Representado, na prática, pela entidade
`BehavioralAssessmentResult` (seção 4.10) associada a uma aplicação
concreta (`BehavioralAssessment`, seção 4.7).

O Perfil Comportamental:

- pertence exclusivamente à `CandidateApplication` — nunca ao `Candidate`
  principal (ADR-0023, seção "Perfil Comportamental": "vinculada a
  `CandidateApplication`, nunca ao `Candidate` principal");
- é informação de apoio, nunca decisão;
- não é obrigatório para nenhuma `CandidateApplication`;
- não é derivado automaticamente de nenhuma Pré-Entrevista (seção 22);
- não altera `current_stage`, `application_status`, finalização,
  `rejected`, `hired`, score de contratação ou ranking (seção 8).

### 4.2 Instrumento Comportamental — camadas conceituais

Esta SPEC formaliza quatro camadas conceituais distintas, que nunca
devem ser confundidas entre si (mesmo princípio de separação de
conceitos já usado pela SPEC-021, seção 4.1, para Configuração ×
Instância × Tentativa):

- **A. Definição do instrumento** (`BehavioralInstrument` +
  `BehavioralInstrumentVersion` + `BehavioralInstrumentItem`, seções
  4.4-4.6): o que o instrumento **é** — nome, metodologia, dimensões,
  itens, regras de aplicação. Corrente por natureza da definição lógica,
  mas **formalmente versionado** (diferente do Banco de Perguntas, que
  não possui versionamento formal — ADR-0022, seção "Componentes ainda
  não versionados"; seção 6 explica por quê).
- **B. Aplicação do instrumento** (`BehavioralAssessment`, seção 4.7): a
  execução concreta do instrumento para uma `CandidateApplication`
  específica, com o contexto necessário congelado no momento da criação
  — mesmo princípio de snapshot da SPEC-021, seção 4.3.1.
- **C. Respostas** (`BehavioralAssessmentResponse`, seção 4.9): o que o
  Candidate (ou, no caso de instrumento externo, o processo de
  importação) registra durante a aplicação.
- **D. Resultado estruturado** (`BehavioralAssessmentResult` +
  `BehavioralAssessmentResultDimension`, seção 4.10): a saída
  interpretável, derivada das respostas segundo a metodologia da versão
  do instrumento usada.

A cadeia é sempre unidirecional e nunca invertida:
`Definição (A)` → `Aplicação (B)` → `Respostas (C)` → `Resultado (D)`.
Uma alteração na Definição (A) nunca reinterpreta retroativamente uma
Aplicação (B), suas Respostas (C) ou seu Resultado (D) já existentes
(seção 16).

### 4.3 Instrumento próprio/interno × Instrumento externo

Esta SPEC formaliza dois cenários distintos, com fronteira clara (seção
28 detalha o cenário externo):

- **Instrumento próprio/interno** (`origin_type = internal_application`,
  seção 4.7): o instrumento é aplicado diretamente pela plataforma — o
  Candidate responde a itens próprios do instrumento (`C`, seção 4.9), e
  o sistema calcula o resultado (`D`) de forma determinística, segundo a
  metodologia da versão usada (seção 15). Só é viável quando o conteúdo
  e a metodologia do instrumento puderem legalmente ser aplicados
  diretamente pela plataforma (definição própria da Organization ou
  instrumento global licenciado pela plataforma, seção 4.4).
- **Instrumento externo** (`origin_type = external_import`, seção 4.7):
  o resultado é produzido por um fornecedor ou metodologia externa, fora
  desta plataforma. A plataforma nunca aplica o instrumento nem
  reproduz seu conteúdo proprietário; ela apenas registra referência,
  proveniência e o resultado permitido a armazenar (seção 28). Não
  existem itens, respostas nem cálculo internos para este cenário — só
  existe `BehavioralAssessment` + `BehavioralAssessmentResult`.

Ambos os cenários produzem o **mesmo tipo de resultado estruturado**
(`BehavioralAssessmentResult`) e seguem exatamente as mesmas regras de
não retroatividade, privacidade, permissões e proibição de decisão
automática (seções 16, 17, 25, 8). A única diferença estrutural está em
`origin_type` e nos campos de proveniência associados.

### 4.4 `BehavioralInstrument`

A definição lógica do instrumento — o "o quê", nunca o conteúdo
versionado em si (esse fica em `BehavioralInstrumentVersion`, seção
4.5). Mesmo padrão híbrido global/próprio já validado pela SPEC-009 para
perguntas (`global_questions` × `organization_questions`), reaproveitado
aqui porque o mesmo problema de propriedade se repete: um instrumento
pode ser mantido pela plataforma (DocFounder, ADR-0020) e disponibilizado
a várias Organizations, ou pode ser próprio de uma única Organization,
desde que seu conteúdo e metodologia possam legalmente ser utilizados por
ela (seção 5 da tarefa que originou este documento).

Campos conceituais mínimos:

- `id`;
- `organization_id`, nulo quando o instrumento é global (mantido pela
  plataforma) — mesmo padrão de `global_questions` (SPEC-009, seção
  19.1: "ausência de `organization_id`");
- `name`;
- `description`;
- `methodology` (identificador textual da metodologia/tipo — por
  exemplo, um valor livre ou canônico futuro; esta SPEC não fecha a
  lista de metodologias suportadas nem inclui `DISC` como valor
  pré-configurado, seção 5);
- `status` (`active`, `inactive` — mesmo vocabulário de `global_questions`/
  `organization_questions`, SPEC-009, seção 7);
- autoria;
- timestamps.

Diferente de `global_questions`/`organization_questions`, um
`BehavioralInstrument` **não é usado diretamente** por nenhuma aplicação
— toda aplicação referencia sempre uma `BehavioralInstrumentVersion`
específica e imutável (seção 4.5), nunca o instrumento lógico
diretamente. Isso existe porque, diferente de uma pergunta isolada, um
instrumento comportamental precisa de versionamento formal (seção 4.2,
seção 16).

Habilitação por Organization de um instrumento **global**: reutiliza o
mesmo padrão conceitual de duas camadas já formalizado pela ADR-0017
para AI Feature Policies (`feature_available_on_platform` +
`organization_feature_enabled`) — mais adequado aqui do que o padrão de
adoção individual da SPEC-009 (`organization_adopted_questions`), porque
um Instrumento Comportamental é um recurso de catálogo (análogo a uma
Feature) e não um item de conteúdo individual reutilizável em massa
(análogo a uma Pergunta). Esta SPEC registra a necessidade conceitual
(um instrumento global só pode ser usado por uma Organization que o
habilitou explicitamente), sem definir o nome físico exato do mecanismo.

### 4.5 `BehavioralInstrumentVersion`

O manifesto imutável de uma versão específica do instrumento — mesmo
princípio de manifesto de contexto já formalizado pela ADR-0022 para
Blueprint Version, e o mesmo vocabulário de estados (`draft`, `active`,
`archived`, seção 4.2 — nunca confundido com o estado operacional
`active`/`inactive` de `BehavioralInstrument` nem com o `published` de
DNA/Cargo/Vaga, mesma distinção já feita pela SPEC-018, seção 4.3, para
Blueprint Version).

Campos conceituais mínimos:

- `id`;
- `behavioral_instrument_id`;
- `organization_id` (herdado do instrumento — nulo para instrumento
  global, salvo quando uma Organization publica sua própria versão de um
  instrumento próprio);
- `version_number`;
- `status` (`draft`, `active`, `archived`);
- `instructions` (texto de instrução de aplicação);
- dimensões avaliadas (lista estruturada — código, nome, descrição de
  cada dimensão que o instrumento mede);
- regras de aplicação (tempo, formato, obrigatoriedade de itens —
  conceitual, sem valores numéricos fechados por esta SPEC);
- `candidate_result_visibility` (`none`, `summary` ou `full` — política
  de visibilidade do resultado ao próprio Candidate, seção 25.3;
  **default `none`** quando não declarado);
- `raw_response_owner_visibility` (`visible` ou `restricted` — política
  de visibilidade das respostas brutas a owner/admin da Organization,
  seção 25.1; **default `visible`** quando não declarado — só é
  `restricted` quando a licença/metodologia do instrumento exigir);
- metadata segura quando necessária (por exemplo, referência a
  licenciamento, nunca segredo ou credencial);
- `published_at`, opcional;
- `archived_at`, opcional;
- autoria;
- timestamps.

Somente uma `BehavioralInstrumentVersion` `active` por
`BehavioralInstrument` a qualquer momento — mesmo invariante já usado
pela SPEC-018/ADR-0022 para Blueprint Version ("uma versão ativa por
Organization").

Uma vez `active`, o manifesto da versão (dimensões, itens vinculados,
metodologia de cálculo, políticas de visibilidade) é imutável. Uma
correção nunca edita uma versão `active` — gera uma nova versão
(`draft` → `active`), mesmo princípio de "nunca sobrescrever" já usado
pela SPEC-005 (DNA), SPEC-008 (Cargo), SPEC-010 (Vaga) e ADR-0022
(Blueprint).

**Arquivamento nunca apaga histórico (revisão destrutiva, seção 8):**
`archived` significa apenas que a versão deixa de aceitar **novas**
aplicações — ela nunca perde a capacidade de interpretar as aplicações
já concluídas que a referenciam (`behavioral_instrument_version_id`,
seção 4.7, seção 4.8). Uma `BehavioralAssessment` já `completed` que
referencia uma versão hoje `archived` permanece integralmente
interpretável (dimensões, itens, metodologia de cálculo continuam
consultáveis para fins de auditoria e histórico), exatamente como uma
`Interview Question`/`PreInterviewQuestion` preservada permanece
interpretável mesmo depois que a pergunta de origem é inativada
(SPEC-013; SPEC-021, seção 9.4). Resumo de transições e uso permitido
por estado da versão:

| Estado     | Pode ser editada | Pode ser aplicada (nova aplicação) |       Pode ser arquivada        | Interpreta histórico já existente |
| ---------- | :--------------: | :--------------------------------: | :-----------------------------: | :-------------------------------: |
| `draft`    |       Sim        |                Não                 | Não (precisa publicar primeiro) |  Não aplicável (nunca foi usada)  |
| `active`   |       Não        |                Sim                 |               Sim               |                Sim                |
| `archived` |       Não        |                Não                 |        — (já arquivada)         |                Sim                |

### 4.6 `BehavioralInstrumentItem`

Um item (pergunta/estímulo) pertencente a uma `BehavioralInstrumentVersion`
específica — nunca reutilizável entre instrumentos nem entre versões
(fronteira explicada na seção 6). Existe **apenas** para instrumentos com
`origin_type = internal_application` (seção 4.3); instrumentos externos
não possuem itens nesta plataforma.

Campos conceituais mínimos:

- `id`;
- `behavioral_instrument_version_id`;
- `organization_id`;
- `item_text`;
- `item_type` (mesmo espírito de tipos canônicos já usado pela SPEC-009 —
  esta SPEC não força o mesmo enum, porque um item de instrumento
  psicométrico tipicamente segue um formato fixo definido pela própria
  metodologia, por exemplo escolha forçada entre afirmações; a lista
  exata de tipos fica para quando um instrumento concreto for
  especificado);
- mapeamento para dimensão(ões) avaliada(s) (`dimension_code` ou lista,
  conforme a metodologia);
- opções, quando aplicável;
- peso/valor por opção, quando a metodologia do instrumento definir
  (distinto de score de contratação — seção 13);
- ordem;
- obrigatoriedade;
- timestamps.

### 4.7 `BehavioralAssessment`

A aplicação concreta do instrumento a uma `CandidateApplication`
específica — o "B" da seção 4.2. Equivalente, em papel arquitetural, à
`PreInterview` da SPEC-021 (seção 4.3), mas para este domínio.

Campos conceituais mínimos:

- `id`;
- `organization_id`;
- `candidate_application_id`;
- `behavioral_instrument_version_id` (congelado no momento da criação —
  seção 16);
- `origin_type` (`internal_application` ou `external_import`, seção
  4.3);
- `attempt_number` (seção 17);
- `previous_attempt_id`, opcional;
- `status` (seção 7);
- `job_opening_id` e `job_opening_version_id`, herdados da
  `CandidateApplication` (mesmo princípio da SPEC-021, seção 4.3.1);
- `blueprint_version_id`, opcional (mesmo princípio da SPEC-021, seção
  19, e da ADR-0022, seção "Dossiê e Pré-Entrevista futuros": "Pré-Entrevista
  pode registrar a versão do Blueprint usada" — aplicado aqui, por
  extensão direta, ao Perfil Comportamental);
- `available_at`, opcional (somente `internal_application` — nunca
  preenchido para `external_import`, seção 7.2);
- `started_at`, opcional (somente `internal_application` — nunca
  preenchido para `external_import`, seção 7.2);
- `completed_at`, opcional;
- `cancelled_at`, `cancelled_by_user_id`, `cancellation_reason`,
  opcionais;
- `expired_at`, `expires_at`, opcionais (somente `internal_application`
  — seção 7);
- proveniência externa (seção 28), somente quando `origin_type =
external_import`;
- autoria de criação (mesmo padrão `system`/`created_by_user_id` já
  formalizado pela SPEC-021, seção 8.4);
- timestamps.

**Regra explícita (revisão destrutiva):** para `origin_type =
external_import`, `available_at` e `started_at` **nunca** são
preenchidos — uma aplicação externa nunca finge ter sido disponibilizada
ou iniciada dentro da plataforma. O único momento interno que ela
registra é `completed_at` (igual ao momento de importação) — os
momentos externos (quando o instrumento foi de fato aplicado e
concluído fora da plataforma) pertencem exclusivamente à proveniência
(seção 28), nunca aos campos operacionais desta lista.

Pertence exclusivamente à `CandidateApplication`. Ela:

- nunca pertence ao `Candidate` principal (seção 4.1);
- nunca pertence à Job Opening nem à Job Opening Version — apenas
  herdadas por referência, nunca fonte de verdade divergente;
- nunca pertence ao Blueprint Organizacional — o Blueprint apenas
  contextualiza (ADR-0021, seção "Relacionamento com o Processo
  Seletivo": "o Blueprint nunca altera automaticamente decisões
  humanas");
- nunca pertence diretamente à Organization — o vínculo é sempre
  derivado da `CandidateApplication`.

### 4.8 Snapshot de contexto

Ao criar a aplicação, o sistema congela, no mínimo, as mesmas categorias
de referência já exigidas pela SPEC-021 (seção 4.3.1), adaptadas a este
domínio:

- `candidate_application_id` — vínculo estrutural permanente;
- `behavioral_instrument_version_id` — nunca reavaliado depois da
  criação, mesmo que uma nova versão do instrumento seja publicada
  (seção 16);
- `job_opening_id`/`job_opening_version_id` — herdados, imutáveis;
- `blueprint_version_id`, quando aplicável;
- para `internal_application`: o conjunto de itens vigente na
  `BehavioralInstrumentVersion` usada — como a versão em si já é
  imutável (seção 4.5), a aplicação referencia a versão diretamente, sem
  precisar de um segundo snapshot por item (diferença deliberada frente
  à SPEC-021, que precisa de snapshot por pergunta porque o Banco de
  Perguntas **não** é formalmente versionado — ver seção 6 para a
  explicação completa desta diferença).

### 4.9 `BehavioralAssessmentResponse`

A resposta do Candidate a um `BehavioralInstrumentItem`, durante uma
aplicação `internal_application`. Nunca existe para aplicações
`external_import` (seção 4.3).

Campos conceituais mínimos:

- `id`;
- `organization_id`;
- `behavioral_assessment_id`;
- `behavioral_instrument_item_id`;
- resposta estruturada;
- `submitted` (distingue rascunho de resposta final, mesmo padrão da
  SPEC-021, seção 4.5, seção 11);
- timestamps.

### 4.10 `BehavioralAssessmentResult` e `BehavioralAssessmentResultDimension`

O resultado estruturado — o "D" da seção 4.2, o Perfil Comportamental em
si (seção 4.1). Separado explicitamente em duas entidades para não
misturar o resultado do cálculo com sua interpretação textual (seção
12).

`BehavioralAssessmentResult` (um por aplicação concluída):

- `id`;
- `organization_id`;
- `behavioral_assessment_id`;
- `behavioral_instrument_version_id` (redundante com o da aplicação, por
  rastreabilidade direta do método usado);
- `calculation_method_version` (identifica a lógica de cálculo usada —
  seção 15, seção 16);
- `origin` (`calculated` para `internal_application`, `imported` para
  `external_import`);
- `calculated_at`/`imported_at`;
- timestamps.

`BehavioralAssessmentResultDimension` (um por dimensão avaliada):

- `id`;
- `organization_id`;
- `behavioral_assessment_result_id`;
- `dimension_code`;
- `value` (o valor/score metodológico daquela dimensão, segundo a
  metodologia do instrumento — seção 13);
- `interpretation_text`, opcional (texto descritivo, sempre em
  linguagem não determinística, seção 14).

### 4.11 `BehavioralAssessmentEvent`

Registro imutável da linha do tempo de uma aplicação. Ver seção 29.

### 4.12 `JobOpeningBehavioralAssessmentSettings`

Conceito equivalente a `JobOpeningPreInterviewSettings` (SPEC-021, seção
4.2), com uma diferença deliberada: como um instrumento formal já possui
seus próprios itens fixos, formalmente versionados (seção 4.5, seção
4.6), esta configuração **não precisa** de uma tabela filha de seleção
de itens (diferente de `JobOpeningPreInterviewQuestionSetting`) — a
Organization escolhe **qual instrumento/versão** usar para a vaga,
nunca recompõe os itens do instrumento (recompor itens de um instrumento
formal invalidaria sua metodologia, seção 6).

Campos conceituais mínimos:

- `id`;
- `organization_id`;
- `job_opening_id`;
- `enabled`;
- `behavioral_instrument_version_id`, condicional (obrigatório quando
  `enabled = true`);
- autoria de última alteração;
- timestamps.

Esta configuração é corrente, nunca histórico — mesmo princípio da
SPEC-021, seção 4.2.1: nunca reinterpreta retroativamente uma
`BehavioralAssessment` já criada.

**Esta configuração define apenas a preferência da vaga; ela nunca cria
automaticamente uma aplicação.** A criação de uma `BehavioralAssessment`
é sempre um ato administrativo explícito de owner/admin (seção 9) —
diferença deliberada frente à SPEC-021, cuja criação de instância é
automática após a candidatura pública. A justificativa está na seção 9.

## 5. Distinção Perfil Comportamental × DISC

Esta distinção é obrigatória e fica formalizada sem ambiguidade:

- **Perfil Comportamental** é o conceito funcional amplo desta SPEC
  (seção 4.1): o resultado estruturado de **qualquer** instrumento formal
  aplicado a uma `CandidateApplication`, através da arquitetura genérica
  definida nas seções 4.2 a 4.10.
- **DISC** é citado nesta SPEC exclusivamente como **exemplo de um
  possível instrumento**, já conhecido no mercado de recrutamento e
  seleção (ADR-0023, seção "DISC": "DISC é citado nesta ADR apenas como
  um possível instrumento de Perfil Comportamental"). DISC **nunca** é
  tratado, nesta SPEC, como sinônimo automático de Perfil Comportamental.

Esta SPEC **não define, não adota e não implementa**:

- nenhum algoritmo DISC;
- nenhum questionário DISC proprietário;
- nenhuma fórmula de cálculo DISC;
- nenhuma licença de conteúdo DISC de terceiro;
- nenhuma interpretação DISC específica.

Caso a plataforma decida, no futuro, suportar DISC como um dos
instrumentos disponíveis, isso exigirá uma SPEC própria que defina, no
mínimo (mesma lista já exigida pela ADR-0023, seção "DISC"):
instrumento, metodologia, licenciamento quando aplicável, forma de
aplicação, cálculo, interpretação, limitações e apresentação dos
resultados. Essa SPEC futura seria representada, dentro da arquitetura
genérica já definida aqui, como **mais um** `BehavioralInstrument`
(seção 4.4) — provavelmente do tipo `external_import` (seção 4.3, dado o
licenciamento tipicamente proprietário de instrumentos DISC comerciais),
mas potencialmente `internal_application` se a plataforma algum dia
licenciar e implementar seu próprio questionário. Esta SPEC não decide
qual dos dois modos DISC usaria — registra apenas que a arquitetura
genérica já suporta ambos, sem bloquear essa decisão futura.

O repositório não possui, hoje, nenhuma decisão suficiente para
implementar DISC. Por isso, DISC é registrado aqui como **instrumento
futuro/pluggable**, sem bloquear a arquitetura genérica de Perfil
Comportamental definida por este documento.

## 6. Relação com o Banco de Perguntas (SPEC-009) — fronteira explícita

Esta SPEC **não reutiliza** `question_catalog_items` (SPEC-009) para
itens de Instrumento Comportamental. Esta decisão foi avaliada
explicitamente, e a fronteira fica registrada:

- SPEC-009 (RN-029, RN-030) proíbe explicitamente que uma pergunta do
  Banco de Perguntas possua peso, pontuação, obrigatoriedade contextual,
  resposta correta ou critério de aprovação — "qualquer campo de peso ou
  pontuação enviado nesta fase deve ser recusado." Um item de instrumento
  comportamental formal **precisa**, por definição metodológica, de
  mapeamento a dimensão e, frequentemente, de peso/valor por opção
  (seção 4.6) — o oposto exato do que SPEC-009 proíbe;
- SPEC-009 (ADR-0022, seção "Componentes ainda não versionados") não
  possui versionamento formal — "o catálogo representa o estado atual da
  competência/pergunta." Um instrumento comportamental formal **precisa**
  de versionamento formal e imutabilidade após publicação (seção 4.5),
  porque uma mudança em um item pode invalidar a validade metodológica
  de resultados já calculados;
- perguntas de entrevista/recrutamento (SPEC-009) são itens de conteúdo
  livre, reutilizáveis em qualquer contexto (vaga, entrevista,
  pré-entrevista); itens de um instrumento psicométrico formal são
  **inseparáveis** de sua metodologia e de sua versão específica — um
  item fora do contexto do instrumento que o originou não tem
  interpretação válida;
- licenciamento: um item do Banco de Perguntas nunca carrega restrição
  de uso proprietário; um item de instrumento comportamental formal
  frequentemente carrega (seção 5).

Por essas razões, esta SPEC define `BehavioralInstrumentItem` (seção
4.6) como uma entidade **própria do Instrumento Comportamental**, restrita
a uma única `BehavioralInstrumentVersion`, nunca reutilizável fora dela
e nunca reutilizável por outro módulo (`Interview`, `Pré-Entrevista`
continuam usando exclusivamente `question_catalog_items.id`, sem
alteração nenhuma nesta SPEC).

Isso **não cria** um "segundo Banco de Perguntas genérico": diferente de
`question_catalog_items`, que é um catálogo amplo e reutilizável de
perguntas soltas, `BehavioralInstrumentItem` é sempre um item **cativo**
de uma única versão de um único instrumento, sem existência própria fora
desse contexto e sem pretensão de reutilização por qualquer outro
módulo da plataforma.

**Não compartilhamento entre instrumentos (revisão destrutiva, seção
12):** se o mesmo texto/estímulo precisar existir em dois instrumentos
diferentes (ou em duas versões do mesmo instrumento), esta SPEC **nunca
assume compartilhamento automático de item** — cada
`BehavioralInstrumentItem` é criado de forma independente em cada
`BehavioralInstrumentVersion` que o usa, mesmo que o texto exibido seja
idêntico. Isso é deliberado: o significado metodológico de um item
(mapeamento de dimensão, peso, interpretação) é sempre relativo à
versão específica que o contém, nunca uma propriedade do texto em si —
duas versões que compartilhassem fisicamente a mesma linha de item
correriam o risco de uma alteração pretendida para uma versão vazar
silenciosamente para a outra, quebrando a imutabilidade exigida pela
seção 4.5.

## 7. Estados Canônicos

Esta seção avalia explicitamente os estados canônicos da SPEC-021 e usa
somente os que fazem sentido para este domínio, com adaptações
justificadas.

Estados de `BehavioralAssessment`:

- `draft`;
- `available`;
- `in_progress`;
- `completed`;
- `cancelled`;
- `expired`.

Estes seis nomes coincidem com os da SPEC-021 porque o problema
estrutural que resolvem — "instância em preparação → liberada → em
execução → concluída/cancelada/expirada" — é genuinamente o mesmo. A
diferença real está em **como e quando** eles se aplicam, dependendo de
`origin_type` (seção 4.3):

### 7.1 Para `origin_type = internal_application`

A máquina de estados é **idêntica** à da SPEC-021 (seção 5, seção 5.7):
`draft` → `available` → `in_progress` → `completed`/`cancelled`/
`expired`, com a mesma matriz de transições permitidas/proibidas, o
mesmo critério determinístico de início (primeiro entre ação explícita
de iniciar ou primeiro salvamento de resposta), e a mesma imutabilidade
total após estado final. Não há necessidade de reinventar essa parte —
o problema é idêntico ao já resolvido pela SPEC-021.

**`draft` é sempre transitório e nunca observável (revisão destrutiva,
seção 25).** A SPEC-021 já resolveu, para a Pré-Entrevista, a
ambiguidade original de "o que `draft` realmente significa" (SPEC-021,
seção 5.1): lá, `draft` tem um papel real quando owner/admin criam
manualmente uma instância e ainda precisam ajustar seu conjunto de
perguntas antes de liberá-la. Aqui, esse papel **não existe**: os itens
de uma aplicação são inteiramente definidos pela
`BehavioralInstrumentVersion` já publicada e imutável (seção 4.5), e
`JobOpeningBehavioralAssessmentSettings` nunca recompõe itens por vaga
(seção 4.12) — não há nada para owner/admin ajustarem entre a criação e
a liberação. Por isso, **toda** criação de `BehavioralAssessment`
`internal_application` (sempre um ato administrativo explícito, seção
9.1) transiciona `draft` → `available` atomicamente, na mesma operação
de criação, exatamente como a SPEC-021 já define para seu próprio
caminho automático (SPEC-020) — nunca como uma pausa funcional
persistida, e esta SPEC **não cria** nenhum editor paralelo de aplicação
que permita a owner/admin permanecer em `draft` de propósito. `draft`
permanece na matriz de estados apenas pela mesma razão estrutural que a
SPEC-021 já formalizou (etapa de preparação interna antes de qualquer
evento observável), nunca como um estado que a implementação deva expor
como uma ação de "salvar rascunho da configuração" separada de "criar".

### 7.2 Para `origin_type = external_import`

Diferença deliberada: **não existe fase de resposta dentro da
plataforma.** O resultado já existe externamente no momento em que a
aplicação é registrada. Por isso:

- uma aplicação `external_import` é criada **diretamente em `completed`**
  — a própria operação de importação é, ao mesmo tempo, a criação e a
  conclusão (seção 28);
- os estados `draft`, `available`, `in_progress` e `expired` **nunca**
  se aplicam a uma aplicação `external_import` — não existe "aguardando
  início" nem "prazo de resposta" para algo que já foi respondido fora
  da plataforma;
- `cancelled` continua se aplicando (por exemplo, uma importação
  registrada por engano) — mas, como toda entrada em `completed` já é
  imediata, o cancelamento de uma aplicação `external_import` só é
  possível **antes** da conclusão da própria operação de importação
  (uma operação atômica, seção 9.2) — na prática, depois de criada, uma
  aplicação `external_import` já nasce em `completed` e seu único
  caminho de "correção" é a reabertura (seção 17), nunca um
  cancelamento de algo que nunca existiu como não-final.

### 7.3 Resumo de transições permitidas (`internal_application`)

| De \ Para   | draft | available | in_progress | completed | cancelled | expired |
| ----------- | :---: | :-------: | :---------: | :-------: | :-------: | :-----: |
| draft       |   —   |    Sim    |     Não     |    Não    |    Sim    |   Não   |
| available   |  Não  |     —     |     Sim     |    Não    |    Sim    |   Sim   |
| in_progress |  Não  |    Não    |      —      |    Sim    |    Sim    |   Sim   |
| completed   |  Não  |    Não    |     Não     |     —     |    Não    |   Não   |
| cancelled   |  Não  |    Não    |     Não     |    Não    |     —     |   Não   |
| expired     |  Não  |    Não    |     Não     |    Não    |    Não    |    —    |

`completed`, `cancelled` e `expired` são estados finais e nunca retornam
a um estado operacional, em nenhum dos dois `origin_type` — mesmo
princípio já aplicado por toda SPEC anterior desta jornada.

Para cada estado (quando aplicável ao `origin_type`), aplicam-se
significado, ator e transições exatamente como já definido pela SPEC-021
(seções 5.1 a 5.6), substituindo apenas "Pré-Entrevista"/"pergunta" por
"aplicação do instrumento"/"item", sem nenhuma outra alteração de
substância.

## 8. Relação com `current_stage` e efeito sobre a `CandidateApplication`

Fica confirmado, para a versão 0.1 desta SPEC: o Perfil Comportamental
**não** cria nenhum valor novo no enum `CandidateApplication.current_stage`
(SPEC-012/ADR-0014). A SPEC-012 não é alterada por esta SPEC.

O Perfil Comportamental nunca altera automaticamente, na
`CandidateApplication` associada:

- `application_status`;
- `current_stage`;
- finalização (`finalized_at`, `finalized_by_user_id`,
  `finalization_reason`);
- `rejected`;
- `hired`;
- score de contratação;
- ranking.

A conclusão de uma aplicação (transição para `completed`, seção 7)
**apenas** conclui aquela aplicação — ela nunca dispara, por si só,
nenhuma movimentação de pipeline, nenhuma finalização e nenhuma decisão
sobre a `CandidateApplication`. Mesmo princípio já aplicado pela SPEC-021
(seção 7) e pela ADR-0015 à `Interview` ("a entrevista não movimenta
automaticamente a CandidateApplication").

## 9. Fluxo Principal

```text
CandidateApplication existente (SPEC-012)
↓
owner/admin decide aplicar um Instrumento Comportamental (decisão
explícita — nunca automática, ver justificativa abaixo)
↓
Sistema valida CandidateApplication ativa, Candidate ativo, consentimento
específico deste propósito concedido (seção 20), ausência de aplicação
não finalizada, Organization ativa
↓
Sistema resolve o instrumento/versão a usar (da Configuração da Vaga,
seção 4.12, ou escolhido manualmente por owner/admin)
↓
[internal_application]                    [external_import]
↓                                          ↓
Sistema cria aplicação                     Sistema registra aplicação já
(draft → available)                        completed, com resultado e
↓                                          proveniência (seção 28)
Candidato acessa e inicia                  ↓
(in_progress)                              aguarda análise humana
↓
Candidato responde
↓
Candidato envia (submissão final idempotente, seção 18)
↓
Sistema calcula resultado (seção 15)
↓
status completed
↓
aguarda análise humana (owner/admin, SPEC-012)
```

Nenhuma etapa deste fluxo envolve IA, pontuação de contratação, triagem
automática ou decisão (seção 25).

### 9.1 Por que a criação nunca é automática (diferença deliberada frente à SPEC-021)

A SPEC-021 cria a Pré-Entrevista automaticamente, como consequência
direta e imediata da Candidatura Pública (SPEC-020), porque a
Pré-Entrevista é, na prática, tratada como o próximo passo natural e
esperado imediatamente após a candidatura. O Perfil Comportamental é
estruturalmente diferente: a tarefa que originou este documento exige
explicitamente que ele "não seja obrigatório para toda candidatura" nem
"obrigatório para toda Pré-Entrevista" (seção 2 da tarefa), e a ADR-0023
não o posiciona em nenhum ponto fixo da jornada — ele "pode" ser
produzido, "a partir das respostas coletadas na Pré-Entrevista, **ou de
instrumento próprio futuro**" (ADR-0023, seção "Perfil Comportamental"),
sem amarrar a um gatilho temporal específico.

Por isso, esta SPEC decide, deliberadamente, que a criação de uma
`BehavioralAssessment` é **sempre um ato administrativo explícito** de
owner/admin (mesmo padrão do fluxo interno `createInternal` já usado
pela SPEC-021, seção 8.1, nunca do fluxo automático
`createIfConfigured`). `JobOpeningBehavioralAssessmentSettings` (seção
4.12) apenas prepara qual instrumento/versão será usado quando essa
decisão administrativa ocorrer — ela nunca dispara a aplicação sozinha.

Uma futura revisão desta SPEC pode introduzir um gatilho automático (por
exemplo, condicionado à conclusão da Pré-Entrevista, se a Organization
configurar essa preferência explicitamente), mas essa é uma decisão de
produto que exige revisão própria e explícita desta SPEC — nunca uma
inferência silenciosa desta versão 0.1.

### 9.2 Atomicidade da importação externa

Para `origin_type = external_import`, a operação de importação — criar a
`BehavioralAssessment` já `completed`, seu `BehavioralAssessmentResult` e
suas `BehavioralAssessmentResultDimension` — deve ser atômica em relação
a si mesma: falha em qualquer etapa não deve deixar uma aplicação
parcialmente registrada, sem resultado ou com resultado incompleto —
mesmo princípio de atomicidade interna já exigido pela SPEC-021 (seção
8.3) para sua própria criação.

## 10. Aplicação do instrumento — `internal_application`

Quando `origin_type = internal_application`, a execução segue exatamente
os mesmos princípios de execução e resposta já validados pela SPEC-021
(seção 10), adaptados a este domínio:

- resposta em rascunho pode ser criada/atualizada livremente enquanto a
  aplicação estiver `in_progress`;
- resposta em rascunho pode ser corrigida pelo próprio Candidate quantas
  vezes necessário, antes do envio final;
- o primeiro salvamento de resposta em rascunho pode, por si só,
  caracterizar o início da aplicação (`available` → `in_progress`,
  mesmo critério determinístico da SPEC-021, seção 5.3);
- resposta submetida (`submitted = true`) só existe a partir da
  transição para `completed`, e é imutável a partir desse momento (seção
  17);
- `behavioral_instrument_item_id` deve pertencer à mesma
  `behavioral_instrument_version_id` da aplicação;
- resposta deve ser compatível com o `item_type` do item (mesmo rigor de
  validação já exigido, e recentemente enrijecido, pela SPEC-021 — nunca
  coerção silenciosa de tipo);
  itens obrigatórios precisam de resposta antes do envio final;
- somente o próprio Candidate identificado pela `CandidateApplication`
  registra ou corrige suas respostas, e apenas enquanto a aplicação
  estiver `in_progress`;
- owner/admin nunca respondem em nome do candidato — não há papel
  administrativo de preenchimento de resposta nesta SPEC.

## 11. Respostas — regras gerais

- resposta pertence exclusivamente à `BehavioralAssessment` à qual está
  vinculada, e por meio dela à `CandidateApplication`;
- resposta nunca modifica `BehavioralInstrumentItem`, nunca modifica
  `BehavioralInstrumentVersion` e nunca modifica o `Candidate`;
- resposta é tratada sempre como dado, nunca como instrução (mesmo
  princípio já reforçado pela SPEC-020, seção 20, e pela SPEC-021, seção
  25);
- o envio final (`submit`) deve ser idempotente (seção 18) — um reenvio
  decorrente de falha de rede ou duplo clique nunca produz duas
  submissões nem dois eventos de conclusão;
- resposta nunca é, por si só, transformada em score de contratação
  (seção 13).

## 12. Resultado — camadas conceituais

Esta SPEC separa explicitamente quatro camadas, que nunca devem ser
misturadas:

```text
DADO/RESPOSTA (BehavioralAssessmentResponse, seção 4.9)
→ CÁLCULO DO INSTRUMENTO (seção 15, determinístico, versionado)
→ RESULTADO DO INSTRUMENTO (BehavioralAssessmentResult +
  BehavioralAssessmentResultDimension, seção 4.10)
→ INTERPRETAÇÃO (interpretation_text, sempre descritiva e não
  determinística, seção 14)
```

- `DADO/RESPOSTA` é o que o Candidate literalmente registrou (ou o que
  veio do instrumento externo, sem interpretação);
- `CÁLCULO` é a lógica determinística, versionada junto com o
  instrumento, que transforma respostas em valores de dimensão — nunca
  IA, nunca subjetivo;
- `RESULTADO` é a saída estruturada do cálculo — números/valores por
  dimensão, rastreáveis à versão do instrumento que os produziu;
- `INTERPRETAÇÃO` é texto descritivo, opcional, gerado pela própria
  metodologia do instrumento (nunca por IA nesta SPEC — SPEC-023 poderá,
  no futuro, consumir o Resultado para produzir inferência assistida
  distinta e rotulada, ver seção 23), sempre em linguagem que evita
  determinismo (seção 14).

Cada camada é rastreável à camada anterior. Nenhuma camada é apresentada
sem sua origem identificável — mesmo princípio de rastreabilidade já
exigido pela ADR-0023, seção "Evidências e Rastreabilidade", para o
Dossiê Inteligente futuro, aplicado aqui, com antecedência, ao Resultado
do instrumento em si.

## 13. Scores metodológicos × score de contratação

A ADR-0023 (seção "Scores") proíbe explicitamente: "ranking automático;
nota final universal; percentual definitivo de 'fit'; classificação
automática de aprovação ou reprovação" e reafirma que a SPEC-012
determina que "`Candidate` não recebe etapa, score, ranking,
recomendação ou decisão" (RN-037).

Isso **não impede** que um instrumento formal possua valores internos
próprios, definidos por sua metodologia. Fica formalizada a distinção
explícita exigida pela tarefa que originou este documento:

- **Score interno/metodológico do instrumento**
  (`BehavioralAssessmentResultDimension.value`, seção 4.10): um valor
  produzido pela metodologia formal do instrumento para **uma dimensão
  específica** que ele mede (por exemplo, "intensidade da dimensão X
  segundo o instrumento Y"). **Permitido**, desde que faça parte formal
  do instrumento e de sua versão (seção 4.5, seção 15).
- **Score de contratação/ranking/fit** — qualquer valor único, agregado
  entre dimensões ou entre instrumentos, que pretenda representar
  "quão bom" ou "quão adequado" um candidato é para a vaga ou para a
  Organization. **Proibido**, nesta SPEC e em qualquer SPEC atual da
  plataforma (ADR-0023).

Regra explícita e vinculante: **esta SPEC nunca soma, pondera ou
combina valores de dimensões diferentes em uma "nota final do
candidato".** Cada `BehavioralAssessmentResultDimension` permanece
sempre um valor isolado, específico daquela dimensão, nunca agregado a
nenhuma outra dimensão, nenhum outro instrumento e nenhuma outra fonte
da candidatura.

Fica também explicitamente proibido (revisão destrutiva, seção 32),
como aplicação direta do princípio acima:

- converter texto de resposta em valor numérico de forma arbitrária,
  fora da regra de cálculo formalmente definida pela versão do
  instrumento (seção 15);
- normalizar resultados de instrumentos **diferentes** para uma escala
  comum, com o objetivo de compará-los entre si;
- calcular média, soma ou qualquer estatística agregada entre dimensões
  de um mesmo resultado;
- apresentar qualquer valor como "nota comportamental", "fit cultural"
  ou "score comportamental" do candidato;
- usar o resultado, isolado ou combinado com qualquer outra fonte, para
  produzir ranking entre candidatos.

Nenhum critério de aceite (seção 36) nem teste obrigatório (seção 37)
desta SPEC pode ser satisfeito por uma implementação que viole qualquer
um dos itens acima, mesmo que o valor agregado nunca seja exibido
diretamente ao usuário final — a mera existência de um cálculo desse
tipo já viola esta seção.

## 14. Interpretação

Toda apresentação de resultado (`interpretation_text`, seção 4.10) deve
usar linguagem descritiva e não determinística, seguindo exatamente o
mesmo princípio já formalizado pela ADR-0023 (seção "Aderência").

Proibido:

- "candidato ideal";
- "inadequado";
- "não serve";
- "deve ser contratado";
- "deve ser rejeitado";
- qualquer afirmação de diagnóstico clínico ou psicológico;
- qualquer afirmação de validade científica não documentada pelo
  repositório para a metodologia usada;
- qualquer afirmação de que o instrumento "prediz" desempenho, sucesso,
  adequação ou contratação.

Preferido:

- "tendência observada segundo o instrumento [nome]";
- "dimensão [X]: [valor/faixa]";
- "resultado indicado pelo instrumento";
- "característica indicada pelo instrumento, sujeita a validação
  humana";
- "informação de apoio à análise humana".

Este princípio é uma aplicação direta, para este domínio específico, do
que a ADR-0023 já formaliza para toda a jornada do candidato.

### 14.1 Três origens de interpretação nunca confundidas (revisão destrutiva, seção 33)

Fica formalizada a distinção explícita entre três origens de
interpretação, que esta SPEC nunca mistura:

- **interpretação metodológica determinística**
  (`BehavioralAssessmentResultDimension.interpretation_text`, seção
  4.10): produzida pela própria metodologia formal do instrumento, como
  parte do cálculo (seção 15) — a única que esta SPEC persiste como
  "resultado do instrumento";
- **interpretação humana**: uma leitura, nota ou opinião que owner/admin
  registre sobre o resultado, ao analisá-lo. Esta SPEC **nunca** grava
  interpretação humana em `BehavioralAssessmentResultDimension` nem em
  nenhum campo de `BehavioralAssessmentResult` — uma nota humana sobre
  um resultado pertence a uma estrutura já existente e própria para
  esse fim (`candidate_application_notes`, SPEC-012, seção 4.3), nunca
  ao resultado estruturado do instrumento, para que as duas origens
  nunca sejam confundidas por quem consultar o dado depois;
- **futura interpretação assistida por IA** (SPEC-023, ainda não
  especificada): esta SPEC não produz nem persiste nenhuma inferência
  de IA sobre o resultado. Quando existir, deve ser rotulada como
  "inferência assistida" e mantida em estrutura própria da SPEC-023,
  nunca escrita retroativamente em
  `BehavioralAssessmentResultDimension.interpretation_text` (ADR-0023,
  seção "IA e Perfil Comportamental").

## 15. Cálculo

Aplicável exclusivamente a `origin_type = internal_application`.

- o cálculo pertence à metodologia e à versão do instrumento
  (`behavioral_instrument_version_id` + `calculation_method_version`,
  seção 4.10);
- deve ser determinístico e reproduzível: as mesmas respostas, na mesma
  versão do instrumento, sempre produzem o mesmo resultado;
- deve ser auditável (seção 29);
- nunca usa IA — nenhuma chamada a `AIGateway`, provider, modelo ou
  Prompt Registry ocorre nesta etapa (seção 23);
- não pode variar silenciosamente depois de a aplicação atingir
  `completed` — o resultado calculado é imutável a partir desse momento
  (seção 17), assim como a resposta que o originou;
- alteração de algoritmo/fórmula de cálculo exige nova
  `BehavioralInstrumentVersion` (seção 4.5, seção 16) — nunca uma
  alteração silenciosa que reinterprete resultados já calculados.

Esta SPEC **não inventa** nenhuma fórmula de cálculo. O contrato
funcional exigido é apenas: entrada = respostas da aplicação + regras de
cálculo da versão do instrumento — **nunca** o Blueprint, a Job Opening
Version ou qualquer outro contexto organizacional (seção 4.8, seção
16): esses permanecem exclusivamente referências históricas congeladas,
nunca entrada do cálculo determinístico, a menos que a própria
metodologia formal de um instrumento futuro declare explicitamente o
contrário — o que esta SPEC não antecipa nem inventa. Saída = um
`BehavioralAssessmentResult` com uma `BehavioralAssessmentResultDimension`
por dimensão avaliada. A fórmula concreta pertence à especificação de
cada instrumento individual, quando um for de fato definido.

### 15.1 Atomicidade do envio final (revisão destrutiva, seções 28-29)

Fica formalizado, sem ambiguidade, o ponto que a revisão destrutiva
exige resolver de forma inequívoca: **envio final (`submit`), cálculo,
persistência do resultado e transição para `completed` ocorrem em uma
única operação atômica**, dentro da mesma transação — nunca como passos
observáveis separados, e nunca existe um estado `completed` sem
resultado correspondente já persistido.

Sequência única, dentro de uma transação:

1. valida que todas as perguntas obrigatórias foram respondidas (seção
   10);
2. calcula o resultado de forma determinística (regras acima);
3. persiste `BehavioralAssessmentResult` e suas
   `BehavioralAssessmentResultDimension`;
4. transiciona a aplicação para `completed`;
5. registra evento e auditoria (seção 29).

**Se o cálculo falhar, por qualquer motivo, em qualquer passo:** a
transação inteira é revertida — a aplicação **permanece** `in_progress`,
as respostas em rascunho já salvas **permanecem preservadas**
(`submitted` continua `false`), e nenhum `BehavioralAssessmentResult`
parcial ou vazio é criado. O Candidate pode tentar o envio novamente
(reenvio idempotente, seção 18); o erro é reportado como uma falha
segura de envio, nunca como uma conclusão silenciosa sem resultado. Esta
SPEC **não** define um estado intermediário exposto (por exemplo,
`processing` ou `calculation_failed`) — a falha nunca fica visível como
um estado persistente da aplicação, porque a operação inteira nunca se
compromete parcialmente (mesmo princípio de atomicidade interna já
exigido pela SPEC-021, seção 8.3, para a criação de instância, aplicado
aqui ao envio final).

Esta mesma regra de atomicidade — nunca uma aplicação `completed` sem
`BehavioralAssessmentResult` correspondente — vale, por construção,
também para `origin_type = external_import` (seção 9.2): a importação
externa só entra em `completed` se o resultado permitido já estiver
integralmente persistido na mesma operação atômica.

## 16. Versionamento e não retroatividade

Uma aplicação concluída deve permanecer interpretável segundo o
instrumento e a versão vigentes no momento em que foi realizada — mesmo
princípio de não retroatividade já exigido pela ADR-0022 e reafirmado
por toda SPEC anterior desta jornada.

Mudanças posteriores em:

- `Candidate`;
- `CandidateApplication`;
- Vaga/Job Opening Version;
- Blueprint/Blueprint Version;
- o `BehavioralInstrument` (nova versão, novas dimensões, novos itens,
  nova metodologia de cálculo);
- a `JobOpeningBehavioralAssessmentSettings` (seção 4.12);

**nunca** reinterpretam silenciosamente uma `BehavioralAssessment`,
`BehavioralAssessmentResponse` ou `BehavioralAssessmentResult` histórico
já existente.

Referências/snapshots conceituais exigidos (seção 4.8):
`candidate_application_id`, `behavioral_instrument_version_id`,
`job_opening_id`/`job_opening_version_id`, `blueprint_version_id`
opcional. Como `BehavioralInstrumentVersion` já é, por si só, imutável
após `active` (seção 4.5), referenciar a versão é suficiente para
preservar o contexto completo do instrumento — diferente da SPEC-021,
que precisa de snapshot por pergunta porque o Banco de Perguntas não é
formalmente versionado (seção 6).

## 17. Tentativas e Reabertura

Cada `CandidateApplication` pode possuir múltiplas aplicações de um
mesmo instrumento (ou de instrumentos diferentes) ao longo do tempo,
sempre em sequência, nunca em paralelo — mesmo invariante central já
formalizado pela SPEC-021 (seção 11, seção 23): existe no máximo uma
aplicação em estado não final por `CandidateApplication` **por
instrumento** a qualquer momento (uma `CandidateApplication` pode,
porém, possuir aplicações não finais simultâneas de **instrumentos
diferentes** — por exemplo, uma aplicação `internal_application` do
instrumento A `in_progress` e uma aplicação `external_import` do
instrumento B já `completed`, sem conflito entre si, porque representam
avaliações independentes).

- **Primeira tentativa:** `attempt_number = 1`, `previous_attempt_id`
  nulo.
- **Nova tentativa:** somente após a tentativa anterior **do mesmo
  instrumento** atingir um estado final, mediante reabertura autorizada
  por owner/admin — nunca criada livremente pelo Candidate. Recebe novo
  `id`, novo snapshot de contexto, `attempt_number` incrementado,
  `previous_attempt_id` preenchido, e nunca copia respostas ou resultado
  da tentativa anterior.

**Qual versão do instrumento uma nova tentativa usa (revisão
destrutiva, seção 37):** a nova tentativa **sempre** resolve o
instrumento/versão **vigente no momento da reabertura** — via
`JobOpeningBehavioralAssessmentSettings` (seção 4.12) ou escolha
administrativa explícita de owner/admin — **nunca herdada da tentativa
anterior**. Se, entre a tentativa anterior e a reabertura, uma nova
`BehavioralInstrumentVersion` tiver sido publicada, a nova tentativa usa
essa versão nova; a tentativa anterior permanece vinculada,
imutavelmente, à versão que já usava (seção 16). Isso nunca
reinterpreta a tentativa antiga — cada tentativa é sempre interpretável
segundo a versão que de fato usou, mesmo que tentativas diferentes da
mesma `CandidateApplication` acabem usando versões diferentes do mesmo
instrumento ao longo do tempo.

Reabertura:

- somente owner/admin;
- somente depois que a tentativa anterior atingiu estado final;
- reavalia as mesmas condições de criação (`CandidateApplication`
  ativa, `Candidate` ativo, consentimento específico válido, seção 20);
- gera evento próprio, distinto do evento de criação técnica da nova
  tentativa;
- a tentativa anterior permanece preservada, imutável, para sempre.

Esta SPEC não define quantidade máxima de tentativas.

## 18. Idempotência

Mesmo princípio conceitual já exigido pela SPEC-021 (seção 22), aplicado
às operações desta SPEC:

- **disponibilização/criação:** uma criação repetida para o mesmo
  contexto (por exemplo, dois cliques em "aplicar instrumento") nunca
  produz duas aplicações não finais simultâneas do mesmo instrumento
  para a mesma `CandidateApplication`;
- **início:** duas chamadas de início nunca produzem dois eventos de
  início nem dois `started_at` divergentes;
- **salvar resposta em rascunho:** salvamentos repetidos da mesma
  resposta nunca criam múltiplos registros para o mesmo item — sempre
  upsert conceitual;
- **enviar (`submit`):** duas chamadas de envio nunca produzem duas
  transições para `completed`, nunca geram dois eventos de conclusão e
  nunca criam uma segunda tentativa;
- **cálculo:** o cálculo de resultado, quando reexecutado por qualquer
  motivo técnico antes da conclusão (nunca depois — seção 15), deve
  produzir o mesmo resultado para as mesmas respostas;
- **importação externa (`external_import`):** quando o provedor externo
  fornece um `external_reference_id` estável (seção 28), uma
  reimportação com o mesmo identificador, para a mesma Organization e o
  mesmo instrumento, nunca cria uma segunda aplicação — deve ser tratada
  como replay seguro, mesmo princípio de idempotência de replay já
  validado pela SPEC-021 (`createIfConfigured`, seção 8.2 daquela SPEC)
  para o cenário análogo de candidatura pública. Quando o provedor
  **não** fornece nenhum identificador externo estável, esta garantia de
  idempotência automática não pode ser oferecida pela plataforma — fica
  registrada como limitação explícita (seção 38), e a responsabilidade
  de não reenviar a mesma importação passa a ser operacional
  (owner/admin), nunca resolvida silenciosamente pelo sistema.

Esta SPEC não define mecanismo físico de idempotência (chave,
deduplicação, cabeçalho HTTP específico) — apenas exige o comportamento
observável acima.

## 19. Concorrência

Cenários a cobrir, com o banco de dados como autoridade final — mesmo
princípio já exigido por toda SPEC anterior desta jornada:

- dois inícios (`start`) simultâneos da mesma aplicação: apenas uma
  transição para `in_progress`, segunda é idempotente;
- dois salvamentos simultâneos da mesma resposta: revalidação dentro da
  transação, primeira operação confirmada prevalece;
- salvamento de resposta concorrendo com envio final: revalidação dentro
  da transação, primeira operação confirmada prevalece;
- dois envios finais (`submit`) simultâneos: apenas uma transição para
  `completed`, segunda é idempotente;
- cancelamento administrativo concorrendo com envio final do candidato:
  primeira operação confirmada prevalece, segunda recebe conflito
  seguro, nunca dois estados finais diferentes;
- expiração automática concorrendo com envio final (somente
  `internal_application`): primeira confirmada prevalece, resultado
  determinístico;
- duas criações concorrentes da primeira tentativa do mesmo instrumento
  para a mesma `CandidateApplication`: apenas uma aplicação não
  finalizada prevalece;
- duas autorizações concorrentes de reabertura: apenas uma nova
  tentativa prevalece;
- dois cálculos concorrentes da mesma aplicação (cenário técnico
  interno, nunca exposto diretamente ao Candidate): devem produzir o
  mesmo resultado determinístico e nunca gravar dois
  `BehavioralAssessmentResult` para a mesma aplicação.

Toda operação crítica desta SPEC deve ocorrer em transação, com
revalidação de estado dentro da própria transação.

## 20. Consentimento

A ADR-0023 (seção "Consentimento") exige finalidade específica: "uma
autorização genérica de consentimento não cobre automaticamente toda
análise futura." A SPEC-020 (seção 10.3) já antecipa exatamente esta
SPEC ao declarar que "consentimentos relacionados a capacidades futuras
— IA, Perfil Comportamental, DISC, comunicação comercial — nunca são
obrigatórios para realizar a candidatura básica... salvo se uma SPEC
própria futura estabelecer fundamento jurídico específico que exija o
contrário." Esta é essa SPEC própria.

Fica formalizado: nenhum dos consentimentos já existentes cobre,
automaticamente, a aplicação de um Instrumento Comportamental:

- o consentimento operacional geral do Candidate (SPEC-011, seção 8.14)
  continua sendo pré-condição mínima de qualquer processamento, mas
  **não** cobre, por si só, esta finalidade específica;
- o consentimento (quando existir, implicitamente reaproveitado) para a
  Pré-Entrevista **não** cobre esta finalidade;
- o consentimento de uso de IA (ADR-0016) **não** cobre esta finalidade,
  e é, de todo modo, irrelevante aqui, porque esta SPEC nunca usa IA
  (seção 23).

Esta SPEC reutiliza a estrutura já aprovada de `candidate_consents`
(SPEC-011, seção 8.14, seção 13.2) — nenhuma tabela nova de
consentimento é criada. Ela usa o campo `purpose`, já existente e
textual/livre naquela estrutura, para uma finalidade própria e
específica, distinta da finalidade do consentimento operacional geral.
Isso não exige nenhuma alteração de schema, campo ou regra da SPEC-011
— apenas um novo valor de `purpose`, dentro da mesma estrutura já
extensível por design.

**Valor canônico declarado por esta SPEC (revisão destrutiva, seção
19):** `purpose = "behavioral_assessment"` é o identificador canônico
desta finalidade — nunca uma string livre inventada pela implementação.
Qualquer texto de exibição ao Candidate (por exemplo, "Aplicação de
Instrumento de Perfil Comportamental") é responsabilidade da interface
(seção 32); o valor persistido e verificado pelo servidor é sempre o
identificador canônico acima, mesmo padrão de nomenclatura estável já
usado pela SPEC-011/SPEC-012 para `source = public_application`/
`public_portal` (SPEC-011, seção 8.3; SPEC-012, seção 4.1.1).

**Rastreabilidade ao instrumento (revisão destrutiva, seção 20):** um
consentimento com `purpose = "behavioral_assessment"` cobre a
finalidade genérica de aplicação de Perfil Comportamental, mas a
aplicação concreta (`BehavioralAssessment`, seção 4.7) deve conseguir
provar **qual** consentimento estava vigente e válido no momento da sua
criação — não apenas que "algum" consentimento com essa finalidade
existia. Por isso, a criação de toda `BehavioralAssessment` (incluindo
`origin_type = external_import`) deve registrar, em seu evento de
criação (`behavioral_assessment.created`/
`behavioral_assessment.external_result_imported`, seção 29), a
referência ao `candidate_consents.id` usado para autorizar a operação.
Isso não exige um vínculo estrutural novo entre `candidate_consents` e
`behavioral_instruments` — apenas que a decisão de autorização, tomada
no momento da criação, fique auditável e rastreável ao registro de
consentimento específico que a validou, nunca apenas inferida
implicitamente depois. Uma revisão futura pode decidir se o
consentimento deve, além da finalidade, identificar explicitamente o
instrumento/metodologia (por exemplo, quando um Candidate quiser
consentir com um instrumento e recusar outro) — esta versão trata
`purpose = "behavioral_assessment"` como cobrindo qualquer instrumento
permitido à Organization, sem diferenciar por instrumento individual,
por não haver, ainda, nenhum caso de uso concreto que exija essa
granularidade adicional.

Comportamento exigido:

- **consentimento não existe** para esta finalidade: bloqueia criação de
  nova aplicação (`internal_application` e `external_import`), início,
  resposta e envio; a importação de resultado externo (seção 28) também
  é bloqueada sem este consentimento;
- **`pending`:** mesmo bloqueio;
- **`revoked`:** mesmo bloqueio; aplicações já `completed` permanecem
  preservadas e consultáveis conforme as regras de permissão (seção
  25), mas nenhuma nova aplicação, resposta ou importação ocorre;
- **`expired`:** mesmo bloqueio;
- **`Candidate` `inactive`:** mesmo bloqueio já formalizado pela
  SPEC-021 (seção 16.1) para Pré-Entrevista, aplicado aqui sem
  divergência — inclusive bloqueando nova importação externa;
- **`CandidateApplication` finalizada:** bloqueia nova aplicação, de
  **ambos** os `origin_type` — inclusive uma tentativa de registrar
  importação externa depois da finalização é recusada. Uma aplicação já
  `in_progress` no momento da finalização deve ser tratada
  administrativamente (cancelamento), mesmo princípio já formalizado
  pela SPEC-013 para `Interview` em situação análoga.

Em todos os casos acima: o histórico já concluído (aplicações
`completed`, respostas submetidas, resultados calculados) **nunca é
apagado nem invalidado retroativamente** — o bloqueio afeta apenas
operações novas, nunca dados já registrados.

## 21. Privacidade e Minimização

Perfil Comportamental é tratado, por esta SPEC, como **dado
potencialmente sensível no contexto do produto e sujeito a minimização e
controle de acesso rigorosos** — esta SPEC não afirma nem assume
nenhuma classificação jurídica específica (por exemplo, "dado sensível"
no sentido da LGPD) para o resultado comportamental, porque essa
classificação depende do contexto e da metodologia de cada instrumento
concreto, e nenhuma decisão jurídica formal desse tipo está registrada
no repositório até esta versão. O rigor de acesso aplicado aqui é
equivalente ao já aplicado pela SPEC-011 a dados pessoais (seção 14),
independentemente da classificação jurídica que uma análise futura
venha a atribuir.

- **respostas brutas** (`BehavioralAssessmentResponse`): visíveis apenas
  a owner/admin da Organization e ao próprio Candidate (as suas
  próprias, enquanto `in_progress`, seção 10). Nunca visíveis a
  `member` nem a Platform Admin por padrão;
- **resultado/valores de dimensão**
  (`BehavioralAssessmentResultDimension`): mesma regra — owner/admin e,
  quando uma experiência futura de acompanhamento existir, o próprio
  Candidate sobre o seu próprio resultado (não definida nesta versão).
  Nunca `member` por padrão; Platform Admin nunca por padrão (seção 27);
- **apenas existência/status**: `member` (seção 25.2) e Platform Admin
  em leitura administrativa (seção 27) recebem, no máximo, isso;
- **retenção conceitual:** segue a mesma política de retenção já
  aplicável ao restante da `CandidateApplication` (SPEC-012) — esta SPEC
  não define uma política de retenção nova ou divergente;
- **auditoria:** nunca registra resposta bruta completa nem valor de
  dimensão completo (seção 29);
- **proibição de exposição pública:** nenhum resultado, resposta ou
  existência de aplicação é exposta por nenhuma rota pública desta SPEC
  além do acesso do próprio Candidate à sua própria aplicação
  `internal_application` em andamento (seção 26);
- **proibição de vazamento cross-Organization:** seção 30;
- **nenhum dado é enviado a provider externo de IA** nesta SPEC (seção 23) — a única "saída externa" desta SPEC é, no sentido inverso, a
  eventual **entrada** de um resultado já produzido por um provedor
  externo de instrumento (seção 28), nunca uma saída de dado da
  plataforma para fora dela.

## 22. Relação com a Pré-Entrevista (SPEC-021)

Esta SPEC **não**:

- transforma toda Pré-Entrevista em Perfil Comportamental;
- usa automaticamente respostas da Pré-Entrevista para inferir Perfil
  Comportamental;
- altera qualquer entidade da SPEC-021 (`PreInterview`,
  `PreInterviewQuestion`, `PreInterviewResponse`,
  `PreInterviewAccessToken`, `PreInterviewEvent`,
  `JobOpeningPreInterviewSettings`) — SPEC-021 permanece integralmente
  como já aprovada;
- cria dependência obrigatória entre os dois módulos.

Uma `CandidateApplication` pode:

- ter Pré-Entrevista sem Perfil Comportamental;
- ter Perfil Comportamental sem Pré-Entrevista (por exemplo, um
  `origin_type = external_import` aplicado independentemente do fluxo
  de Pré-Entrevista, ou um `internal_application` criado
  administrativamente sem nenhuma Pré-Entrevista ter ocorrido);
- ter ambos, sem nenhum vínculo estrutural entre as duas entidades;
- não ter nenhum dos dois.

Uma futura integração entre respostas da Pré-Entrevista e Perfil
Comportamental — por exemplo, um instrumento que reaproveite algumas
respostas já coletadas na Pré-Entrevista como parte de seu cálculo —
exige uma regra explícita, definida por revisão própria desta SPEC ou
de uma SPEC nova, nunca inventada silenciosamente aqui. A ADR-0023
("Perfil Comportamental") já antecipa essa possibilidade ("a partir das
respostas coletadas na Pré-Entrevista, **ou** de instrumento próprio
futuro") sem a definir — esta SPEC 0.1 mantém essa lacuna aberta,
deliberadamente, para revisão futura.

## 23. Relação com IA

Perfil Comportamental funciona integralmente sem IA. Nenhuma chamada a
`AIGateway`, provider, modelo ou Prompt Registry ocorre em nenhum passo
desta SPEC. IA não é requisito para:

- aplicar instrumento;
- salvar resposta;
- calcular resultado determinístico (seção 15);
- visualizar resultado;
- concluir aplicação;
- importar resultado externo.

A futura SPEC-023 (Pré-Análise Assistida por IA) poderá, quando
especificada, consumir `BehavioralAssessmentResult` (nunca respostas
brutas sem necessidade, seção 21) como uma das fontes de sua análise —
seguindo integralmente o que a ADR-0023 já define (seção "IA e Perfil
Comportamental"): a IA pode **resumir** resultados já produzidos por
instrumento formal, **correlacionar** evidências entre fontes,
**contextualizar** frente à Vaga/Blueprint, **sugerir** perguntas para
validação humana — mas nunca **fabricar** resultado de instrumento não
aplicado, nunca **apresentar** inferência como diagnóstico, nunca
**substituir** a metodologia formal do instrumento, nunca **declarar**
condição psicológica, nunca **decidir** contratação. Se existir, no
futuro, uma inferência comportamental produzida exclusivamente por IA
sem instrumento formal aplicado, ela deve ser identificada como
**"inferência assistida"**, e nunca apresentada como resultado de
instrumento formal — regra já fixada pela ADR-0023 e apenas referenciada
aqui, nunca implementada por esta SPEC.

## 24. Relação com o Dossiê Inteligente (SPEC-024, futura)

SPEC-024 ainda não existe. Esta SPEC produz um resultado rastreável
(`BehavioralAssessmentResult` + `BehavioralAssessmentResultDimension`,
com proveniência completa, seção 12) que **poderá** ser consumido
futuramente pelo Dossiê Inteligente, como uma das fontes possíveis
listadas pela ADR-0023 (seção "Dossiê Inteligente": "perfil
comportamental, quando existir").

Esta SPEC não implementa o Dossiê, não cria nenhuma regra de composição
entre fontes, e não cria nenhum score agregado. Ela apenas preserva
provenance e contexto suficientes (instrumento, versão, dimensões,
origem, `blueprint_version_id` quando aplicável) para que uma futura
composição rastreável seja possível, sem precisar reabrir esta SPEC para
adicionar rastreabilidade que já não exista.

## 25. Permissões

Todas as ações funcionais de owner, admin e member exigem User ativo,
Membership ativo, Organization ativa e role autorizada (mesmo padrão de
toda SPEC anterior). A resposta do Candidate (seção 10) é exceção
deliberada, análoga à já formalizada pela SPEC-020 e pela SPEC-021.

| Ação                                                                   | Platform Admin | owner | admin | member |                 Candidate                 |
| ---------------------------------------------------------------------- | :------------: | :---: | :---: | :----: | :---------------------------------------: |
| Administrar Instrumento Comportamental global                          |      Sim       |  Não  |  Não  |  Não   |                    Não                    |
| Administrar Instrumento Comportamental próprio da Organization         |      Não       |  Sim  |  Sim  |  Não   |                    Não                    |
| Habilitar instrumento global para a Organization                       |      Não       |  Sim  |  Sim  |  Não   |                    Não                    |
| Configurar Instrumento Comportamental da vaga (seção 4.12)             |      Não       |  Sim  |  Sim  |  Não   |                    Não                    |
| Criar aplicação para uma CandidateApplication (`internal_application`) |      Não       |  Sim  |  Sim  |  Não   |                    Não                    |
| Registrar aplicação por importação externa (`external_import`)         |      Não       |  Sim  |  Sim  |  Não   |                    Não                    |
| Consultar existência e status da aplicação (DTO restrito)              |      Não       |  Sim  |  Sim  | Restr. |              Sim (a própria)              |
| Consultar respostas brutas                                             |      Não       | Sim¹  | Sim¹  |  Não   | Sim (as próprias, enquanto `in_progress`) |
| Consultar resultado/valores de dimensão                                |      Não       |  Sim  |  Sim  |  Não   |  Conforme `candidate_result_visibility`²  |
| Iniciar aplicação (`internal_application`)                             |      Não       |  Não  |  Não  |  Não   |                    Sim                    |
| Registrar/corrigir resposta em rascunho                                |      Não       |  Não  |  Não  |  Não   |                    Sim                    |
| Enviar (transição para `completed`)                                    |      Não       |  Não  |  Não  |  Não   |                    Sim                    |
| Cancelar aplicação                                                     |      Não       |  Sim  |  Sim  |  Não   |                    Não                    |
| Autorizar reabertura (nova tentativa)                                  |      Não       |  Sim  |  Sim  |  Não   |                    Não                    |
| Consultar histórico/eventos                                            |      Não       |  Sim  |  Sim  |  Não   |                    Não                    |
| Leitura administrativa auditada com motivo                             |      Sim       |  Não  |  Não  |  Não   |                    Não                    |

¹ Padrão `visible`; a `BehavioralInstrumentVersion` usada pode declarar
`raw_response_owner_visibility = restricted` (seção 4.5), quando a
licença/metodologia do instrumento não permitir expor respostas
item a item mesmo a owner/admin — nesse caso, owner/admin continuam
recebendo o resultado estruturado (dimensões), nunca as respostas
brutas subjacentes. Esta restrição nunca se aplica a
`origin_type = external_import`, que nunca possui respostas brutas
nesta plataforma (seção 4.9).

² Ver seção 25.3 — `none` (padrão), `summary` ou `full`, sempre
resolvida no servidor a partir da `BehavioralInstrumentVersion` usada,
nunca decidida pelo cliente.

### 25.1 Owner e Admin

Ver seção 3.1 — mesmos poderes, avaliação explícita já registrada.
Poderes de owner/admin sobre respostas brutas ficam sujeitos à política
`raw_response_owner_visibility` do instrumento usado (nota¹ acima) —
nunca uma exceção à regra de que owner/admin nunca respondem em nome do
candidato (seção 10), apenas um limite adicional de leitura quando a
metodologia do instrumento exigir.

### 25.2 Member

Regra desta versão, deliberadamente mais restritiva que a já aprovada
pela SPEC-021 para Pré-Entrevista, por se tratar de informação
comportamental potencialmente sensível: `member` visualiza **apenas**:

- `id` da aplicação;
- `status`.

Diferente da SPEC-021 (que também expõe `attemptNumber` a `member`),
esta SPEC **não** expõe `attemptNumber` nem qualquer outro campo a
`member` — minimização adicional deliberada. `member` nunca visualiza:
conteúdo de item, resposta, resultado, valor de dimensão, motivo de
cancelamento, eventos, `blueprint_version_id`,
`behavioral_instrument_version_id`, proveniência externa, ou qualquer
outro campo fora da lista acima.

### 25.3 Candidate

O Candidate pode apenas (somente para aplicações `internal_application`
da própria `CandidateApplication`):

- acessar a própria aplicação via mecanismo seguro (seção 26);
- iniciar;
- salvar as próprias respostas em rascunho;
- enviar;
- consultar confirmação/status mínimo da própria aplicação.

O Candidate nunca:

- acessa aplicação de outra `CandidateApplication`;
- escolhe o instrumento ou a versão usada;
- altera o snapshot de contexto;
- cria nova tentativa arbitrariamente;
- cancela a própria aplicação;
- visualiza mais do que a política `candidate_result_visibility` da
  `BehavioralInstrumentVersion` usada permitir (seção 4.5).

**A visibilidade do resultado ao Candidate é sempre propriedade do
instrumento/versão, nunca decisão ad hoc de frontend** (revisão
destrutiva, seção 44): `candidate_result_visibility` define,
conceitualmente:

- `none` (**default** quando a versão não declarar o campo): o
  Candidate recebe apenas confirmação de conclusão, nunca dimensão nem
  interpretação — mesma reserva já aplicada pela SPEC-021 a conteúdo de
  recrutamento;
- `summary`: o Candidate recebe um resumo textual não determinístico
  (seção 14), sem valores numéricos de dimensão;
- `full`: o Candidate recebe as dimensões e interpretações completas,
  somente quando a metodologia formal do instrumento explicitamente
  permitir essa exposição direta.

Nenhuma implementação de frontend decide, por conta própria, qual dessas
três políticas se aplica — a decisão pertence sempre à
`BehavioralInstrumentVersion` (seção 4.5), resolvida no servidor.

### 25.4 Platform Admin (SuperAdmin)

Ver seção 27.

## 26. Acesso do Candidate sem mecanismo autenticado

Aplicável exclusivamente a aplicações `internal_application` (seção
4.3). Aplicações `external_import` nunca possuem fluxo de acesso do
Candidate, porque não existe nada para ele responder dentro da
plataforma.

A Fase 18 (SPEC-021, seção 25.1) já formalizou os invariantes que
qualquer mecanismo de acesso público do Candidate deve respeitar, sem
definir tecnologia física. Esta SPEC reutiliza **os mesmos invariantes
funcionais**, sem copiar implementação, respeitando a diferença de
domínio quando existir:

- **opaco:** não deve expor nem sugerir estrutura interna de dados;
- **não previsível:** não deve ser adivinhável ou enumerável por um
  terceiro;
- **com escopo (`scoped`) à `BehavioralAssessment`:** válido
  exclusivamente para a aplicação a que se refere, nunca reutilizável
  para outra `CandidateApplication`, outro instrumento ou outra
  Organization;
- **com expiração:** deve expirar conforme política a ser definida pela
  implementação;
- **sem revelar IDs internos;**
- **revogável:** pode ser invalidado sem depender de expiração natural;
- **múltiplos tokens simultâneos permitidos, revogação exclusivamente
  administrativa ou por cancelamento/expiração** — mesmo princípio já
  validado e corrigido pela revisão destrutiva da Fase 18 para o
  cenário de replay de token;
- **rate limiting por IP e por hash do token tentado, nunca pelo token
  bruto** — mesmo princípio já implementado e validado pela Fase 18;
- **nunca em log, nunca na URL/query string, apenas em header de
  transporte ou mecanismo equivalente.**

Esta SPEC não define JWT, UUID ou qualquer token físico específico —
apenas os invariantes acima.

## 27. Platform Admin (SuperAdmin)

- Platform Admin administra exclusivamente o catálogo de Instrumentos
  Comportamentais **globais** (`BehavioralInstrument.organization_id
IS NULL`, seção 4.4) — mesmo papel já exercido sobre `global_questions`
  (SPEC-009);
- Platform Admin nunca opera Instrumento Comportamental próprio de
  nenhuma Organization;
- Platform Admin nunca cria, inicia, responde, calcula, cancela ou
  reabre uma `BehavioralAssessment`;
- Platform Admin nunca registra importação externa em nome de uma
  Organization;
- Platform Admin realiza apenas leitura administrativa excepcional, com
  motivo obrigatório, auditoria obrigatória e escopo mínimo necessário —
  **nunca recebe resposta bruta nem valor de dimensão por padrão**,
  mesmo em leitura administrativa (minimização mais rigorosa que a
  SPEC-021, seção 24.4, por se tratar de informação potencialmente mais
  sensível). A leitura administrativa retorna, no máximo:
  `id`, `organizationId`, `candidateApplicationId`, `status`,
  `attemptNumber`, `behavioralInstrumentId`, `createdAt`, `updatedAt`.

### 27.1 Metadados administráveis × conteúdo protegido (revisão destrutiva, seção 48)

Fica formalizada a distinção explícita entre duas coisas que nunca devem
ser confundidas:

- **metadados administráveis do catálogo global** (`BehavioralInstrument`,
  `BehavioralInstrumentVersion`, `BehavioralInstrumentItem` quando
  `organization_id IS NULL`): Platform Admin legitimamente cria, edita,
  publica e arquiva esse conteúdo — é o próprio papel de "manter a
  biblioteca global" já exercido para `global_questions` (SPEC-009).
  Nada nesta seção restringe esse papel;
- **conteúdo protegido de aplicações dentro de uma Organization**
  (`BehavioralAssessment`, `BehavioralAssessmentResponse`,
  `BehavioralAssessmentResult`, `BehavioralAssessmentResultDimension`,
  mesmo quando a aplicação usa um instrumento **global**): Platform
  Admin nunca acessa esse conteúdo além da leitura administrativa
  minimizada já definida acima, mesmo sendo o administrador do
  instrumento global usado por aquela aplicação. Administrar o
  instrumento global nunca concede, por si só, acesso a nenhum dado
  produzido por nenhuma Organization que o utiliza — mesma fronteira já
  aplicada pela SPEC-009 (Platform Admin administra `global_questions`,
  mas nunca lê respostas ou avaliações que usam essas perguntas dentro
  de uma Organization).

## 28. Instrumento Externo — Proveniência

Aplicável exclusivamente a `origin_type = external_import` (seção 4.3).

Toda `BehavioralAssessment` com `origin_type = external_import` deve
registrar, conceitualmente, na própria aplicação ou em estrutura
vinculada a ela:

- `external_provider` (identificação textual do fornecedor/origem);
- `behavioral_instrument_id`/`behavioral_instrument_version_id`
  referenciando um `BehavioralInstrument` já registrado com `origin_type`
  compatível (mesmo que o instrumento em si nunca seja aplicado pela
  plataforma — ele ainda precisa de um registro mínimo de definição,
  seção 4.4, para que a proveniência seja rastreável);
- `external_reference_id`, quando necessário e seguro registrar (nunca
  um identificador que, por si só, permita acesso não autorizado ao
  sistema externo);
- `applied_at_external` (momento em que o instrumento foi, de fato,
  **iniciado/aplicado** externamente);
- `completed_at_external` (momento em que o instrumento foi, de fato,
  **concluído** externamente — conceitualmente distinto de
  `applied_at_external`, porque nem todo instrumento externo é
  respondido instantaneamente; quando o provedor não distinguir os dois
  momentos, ambos podem receber o mesmo valor, mas o campo permanece
  conceitualmente separado, nunca fundido em um único timestamp
  ambíguo);
- `imported_at` (momento em que o resultado foi registrado nesta
  plataforma — sempre posterior ou igual a `completed_at_external`);
- `imported_by_user_id` (o `owner`/`admin` que registrou a importação —
  seção 16 da revisão destrutiva: nunca nulo, nunca Platform Admin,
  nunca um ator fictício);
- o resultado permitido a armazenar (`BehavioralAssessmentResult` +
  `BehavioralAssessmentResultDimension`), nunca o conteúdo proprietário
  do instrumento em si (itens, questionário, fórmula);
- método de validação/proveniência, quando conhecido (por exemplo, um
  identificador de relatório assinado pelo provedor) — campo opcional,
  nunca uma prova criptográfica que esta SPEC não exige (seção 18);
- metadata mínima necessária à rastreabilidade, nunca segredo,
  credencial, payload bruto do provedor ou dado desnecessário.

A importação é sempre um ato administrativo de `owner`/`admin`
autorizado (seção 3, seção 25). Platform Admin nunca importa resultado
em nome de uma Organization. O Candidate nunca importa resultado
livremente — não existe, nesta SPEC, nenhum fluxo público de importação
externa.

Regra de segurança explícita: **esta SPEC nunca confia cegamente no
payload de importação externa.** No mínimo, o servidor deve validar
estruturalmente: formato dos campos, pertencimento a uma
`CandidateApplication` da mesma Organization do ator que registra a
importação, pertencimento do `behavioral_instrument_id` referenciado à
mesma Organization (ou a um instrumento global habilitado por ela,
seção 4.4), e ausência de mass assignment de campos protegidos (mesma
lista de proteção da seção 30). Validação técnica/criptográfica de
autenticidade do resultado externado (assinatura, certificado, chamada
de verificação ao provedor) fica para planejamento técnico posterior —
esta SPEC não a define nem a assume como já resolvida.

## 29. Auditoria

Eventos obrigatórios (nomes conceituais e ilustrativos, mesmo padrão já
usado por `pre_interview.*`, `candidate.*`, `candidate_application.*`):

- `behavioral_instrument.created`/`.updated`/`.activated`/`.inactivated`
  (definição do instrumento, global ou próprio);
- `behavioral_instrument_version.published`/`.archived`;
- `job_opening_behavioral_assessment_settings.updated`;
- `behavioral_assessment.created`;
- `behavioral_assessment.available`;
- `behavioral_assessment.started`;
- `behavioral_assessment.response_saved`;
- `behavioral_assessment.submitted`;
- `behavioral_assessment.result_calculated`;
- `behavioral_assessment.cancelled`;
- `behavioral_assessment.expired`;
- `behavioral_assessment.reopening_authorized`;
- `behavioral_assessment.new_attempt_created`;
- `behavioral_assessment.external_result_imported`;
- `behavioral_assessment.administrative_read`;
- `behavioral_assessment.permission_denied`;
- `behavioral_assessment.cross_organization_access_denied`;
- `behavioral_assessment.consent_blocked`.

Nunca registrar em auditoria:

- resposta bruta completa;
- valor de dimensão completo;
- texto de interpretação completo, quando extenso;
- conteúdo proprietário de instrumento externo;
- **payload bruto recebido de um provedor externo** (seção 28) —
  auditoria registra apenas os campos de proveniência estruturados já
  definidos (`external_provider`, identificadores de instrumento/versão,
  `applied_at_external`, `completed_at_external`, `imported_at`,
  `imported_by_user_id`), nunca o corpo bruto da requisição/arquivo
  recebido;
- consentimento detalhado;
- tokens, headers, segredos.

Auditoria crítica em criação, envio final, cálculo de resultado,
importação externa, cancelamento e autorização de reabertura deve
causar rollback quando falhar — mesmo padrão já exigido por toda SPEC
anterior desta jornada.

### 29.1 Timeline de domínio × log de auditoria (revisão destrutiva, seção 51)

`BehavioralAssessmentEvent` (seção 4.11) e os eventos de auditoria desta
seção são **estruturas distintas, nunca confundidas entre si** — mesma
separação conceitual já praticada pela SPEC-021 entre `PreInterviewEvent`
(linha do tempo própria da entidade) e a auditoria geral da plataforma:

- `BehavioralAssessmentEvent` é a **linha do tempo de domínio** de uma
  aplicação específica — visível a owner/admin como histórico funcional
  daquela aplicação (seção 25), sempre imutável, sempre vinculada a um
  `behavioral_assessment_id`;
- os eventos de auditoria listados nesta seção pertencem ao mecanismo de
  auditoria **geral da plataforma**, consultado de forma diferente
  (inclusive por Platform Admin, em leitura administrativa, seção 27),
  também sempre imutável.

Uma operação pode gerar um evento em cada uma das duas estruturas, para
finalidades diferentes (histórico funcional × trilha de auditoria de
segurança/conformidade) — nunca uma única estrutura fazendo o papel das
duas, e nunca uma substituindo a outra.

## 30. Multiempresa

Isolamento absoluto por Organization (ADR-0020), sem exceção:

- nenhum `BehavioralInstrument` próprio de uma Organization pode ser
  usado por outra Organization;
- um `BehavioralInstrument` global só pode ser usado por uma
  Organization que o habilitou explicitamente (seção 4.4);
- nenhuma `BehavioralAssessment` de Organização A pode ser referenciada,
  lida ou alterada por Organização B;
- nenhum token de acesso do Candidate (seção 26) resolve dado de outra
  Organization;
- mensagens de erro para acesso cruzado devem ser genéricas, sem revelar
  a existência de instrumento, aplicação, resposta ou resultado em
  outra Organization;
- Candidate da mesma pessoa em Organizations diferentes permanece
  isolado, conforme arquitetura já vigente (ADR-0013).

## 31. Organization Arquivada

Quando a Organization estiver `archived`:

- nenhum novo `BehavioralInstrument` próprio é criado ou alterado;
- nenhuma nova `BehavioralAssessment` é criada;
- nenhuma aplicação existente pode ser iniciada, respondida, enviada,
  cancelada, reaberta ou receber importação externa;
- dados existentes permanecem preservados;
- Platform Admin consulta somente administrativamente, com motivo e
  auditoria (mesmo padrão de toda SPEC anterior).

**Instrumentos globais nunca são afetados pelo arquivamento de uma
Organization (revisão destrutiva, seção 53):** um `BehavioralInstrument`
global (`organization_id IS NULL`, seção 4.4) continua existindo
normalmente na plataforma e continua disponível para **outras**
Organizations ativas que o tenham habilitado — o arquivamento de uma
Organization específica nunca desabilita, arquiva ou altera o
instrumento global em si, apenas impede que **aquela** Organization
arquivada o use operacionalmente, junto com todo o resto de suas
operações funcionais.

## 32. Interface Conceitual

- **Administração de instrumentos (Platform Admin):** biblioteca global
  de Instrumentos Comportamentais, versões, itens, publicação/
  arquivamento de versão.
- **Administração de instrumentos próprios (owner/admin):** criação e
  manutenção de instrumento próprio da Organization, quando aplicável;
  habilitação de instrumento global.
- **Configuração da vaga (owner/admin):** habilitar/desabilitar Perfil
  Comportamental, selecionar instrumento/versão.
- **Aplicação administrativa (owner/admin):** criar aplicação para uma
  `CandidateApplication`, registrar importação externa, consultar
  resultado, histórico, cancelar, autorizar reabertura.
- **Tela do candidato (`internal_application`):** introdução/finalidade,
  consentimento específico, itens do instrumento, indicação de
  progresso, salvamento de rascunho, ação de enviar, confirmação —
  nunca exibe valor de dimensão nem interpretação ao próprio Candidate
  nesta versão (seção 25.3).
- **DTO de member:** indicação de existência e status, sem conteúdo
  (seção 25.2).

Esta SPEC não define layout, wireframe ou biblioteca de componentes
visuais.

## 33. API Conceitual

| Operação                                 | Finalidade                                                                |
| ---------------------------------------- | ------------------------------------------------------------------------- |
| Administrar instrumento global           | Criar/atualizar/publicar/arquivar (Platform Admin).                       |
| Administrar instrumento próprio          | Criar/atualizar/publicar/arquivar (owner/admin).                          |
| Habilitar instrumento global             | Habilitar uso de um instrumento global pela Organization (owner/admin).   |
| Configurar Perfil Comportamental da vaga | Habilitar/desabilitar e definir instrumento/versão (owner/admin).         |
| Criar aplicação (`internal_application`) | Iniciar uma aplicação para uma CandidateApplication (owner/admin).        |
| Registrar importação (`external_import`) | Registrar aplicação e resultado já produzidos externamente (owner/admin). |
| Consultar aplicação (DTO por perfil)     | Retornar dados permitidos conforme a role do solicitante.                 |
| Iniciar aplicação                        | Candidate inicia uma aplicação `available`.                               |
| Salvar resposta em rascunho              | Candidate registra ou corrige resposta durante `in_progress`.             |
| Enviar aplicação                         | Candidate conclui, transição idempotente para `completed`.                |
| Cancelar aplicação                       | owner/admin encerra administrativamente com motivo.                       |
| Autorizar reabertura                     | owner/admin autoriza nova tentativa após estado final.                    |
| Consultar histórico                      | owner/admin consultam eventos da aplicação.                               |
| Leitura administrativa auditada          | Platform Admin consulta com motivo.                                       |

Esta SPEC não define URLs finais, contratos de request/response ou
schema de banco.

## 34. Banco Conceitual

Entidades propostas, com responsabilidade individual explícita (nenhuma
migration nesta tarefa):

| Entidade                                     | Responsabilidade                                                                                                                |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `behavioral_instruments`                     | Definição lógica do instrumento (global ou próprio de Organization) — o "o quê" (seção 4.4).                                    |
| `behavioral_instrument_versions`             | Manifesto imutável de uma versão específica do instrumento — dimensões, instruções, regras de aplicação (seção 4.5).            |
| `behavioral_instrument_items`                | Itens de uma versão específica do instrumento, cativos dela, usados apenas por instrumentos `internal_application` (seção 4.6). |
| `job_opening_behavioral_assessment_settings` | Preferência corrente da vaga: habilitado e qual versão de instrumento usar (seção 4.12). Nunca dispara aplicação sozinha.       |
| `behavioral_assessments`                     | Aplicação concreta do instrumento a uma CandidateApplication — a instância/tentativa (seção 4.7).                               |
| `behavioral_assessment_responses`            | Respostas do Candidate a itens do instrumento, somente para `internal_application` (seção 4.9).                                 |
| `behavioral_assessment_results`              | Um resultado calculado/importado por aplicação concluída (seção 4.10).                                                          |
| `behavioral_assessment_result_dimensions`    | Um valor por dimensão avaliada, vinculado ao resultado (seção 4.10).                                                            |
| `behavioral_assessment_events`               | Linha do tempo imutável de uma aplicação (seção 4.11, seção 29).                                                                |
| `behavioral_assessment_access_tokens`        | Tokens opacos de acesso público do Candidate, somente para `internal_application` (seção 26).                                   |

Nenhuma tabela nova de consentimento é criada — esta SPEC reutiliza
`candidate_consents` (SPEC-011) com um novo valor de `purpose` (seção
20).

Regras conceituais mínimas esperadas, quando implementada:

- `organization_id` obrigatório em todas as tabelas (nulo apenas em
  `behavioral_instruments`/`behavioral_instrument_versions` quando de
  origem global — mesmo padrão de `global_questions`);
- FKs compostas (nunca coluna única) para impedir cruzamento de
  Organization entre `behavioral_assessments` e
  `candidate_applications`, `job_opening_versions`,
  `organization_blueprint_versions`, mesmo padrão já usado pela SPEC-021
  e verificado fisicamente na migration da Fase 18;
- somente uma `behavioral_instrument_version` `active` por
  `behavioral_instrument` a qualquer momento;
- no máximo uma `behavioral_assessment` não finalizada por
  `candidate_application` **por instrumento** a qualquer momento (seção
  17);
- imutabilidade física (trigger ou equivalente) de aplicação, resposta e
  resultado após estado final — mesmo padrão de defesa em profundidade
  já usado pela Fase 18 (validação em código + trigger como autoridade
  final);
- ausência de exclusão física em qualquer tabela;
- ausência de cascade destrutivo.

## 35. Segurança

- Validar no servidor: `organizationId`, `candidateApplicationId`,
  `behavioralAssessmentId`, `behavioralInstrumentId`,
  `behavioralInstrumentVersionId`, `behavioralInstrumentItemId`,
  `behavioralAssessmentResponseId`, `jobOpeningId`.
- Validar Organization comum entre `CandidateApplication`, Job Opening,
  instrumento referenciado e a aplicação.
- Validar Candidate ativo e consentimento específico válido (seção 20)
  antes de qualquer criação, início, resposta, envio ou importação.
- Bloquear aplicação cruzando Organizations. Toda aplicação deriva a
  Organization exclusivamente da `CandidateApplication`, nunca de um
  `organizationId` enviado livremente pelo cliente.
- Bloquear manipulação de IDs — identificador enviado pelo cliente nunca
  prova acesso.
- Mensagens de erro para acesso cruzado devem ser genéricas.
- Proteger respostas e resultados como dado potencialmente sensível
  (seção 21).
- Nunca registrar dados pessoais completos, resposta bruta completa ou
  valor de dimensão completo em logs.
- Nunca registrar tokens, headers, senhas, connection strings ou
  segredos.
- Usar queries parametrizadas.
- Proteger contra mass assignment: `organization_id`, `status`,
  `attempt_number`, `previous_attempt_id`, valores de dimensão
  calculados, autoria e timestamps são sempre definidos pelo servidor,
  nunca aceitos como valor livre enviado pelo cliente — inclusive no
  payload de importação externa (seção 28).
- Tratar toda resposta do candidato, e todo payload de importação
  externa, como dado, nunca como instrução.
- Nunca confiar cegamente em payload de importação externa (seção 28).

## 36. Critérios de Aceite

- CA-001: Uma `BehavioralAssessment` pertence exclusivamente a uma
  `CandidateApplication`.
- CA-002: Uma `BehavioralAssessment` nunca é criada diretamente para
  `Candidate`.
- CA-003: Uma `BehavioralAssessment` nunca pertence à Job Opening nem ao
  Blueprint.
- CA-004: Isolamento por Organization é absoluto (seção 30).
- CA-005: `BehavioralInstrument` pode ser global (Platform Admin) ou
  próprio de Organization (owner/admin), nunca misturado.
- CA-006: `BehavioralInstrumentVersion` é formalmente versionada,
  imutável após `active`.
- CA-007: Somente uma `BehavioralInstrumentVersion` `active` por
  instrumento a qualquer momento.
- CA-008: `BehavioralInstrumentItem` pertence a uma única versão, nunca
  reutilizável entre instrumentos ou versões.
- CA-009: Esta SPEC nunca referencia `question_catalog_items.id` para
  item de instrumento comportamental.
- CA-010: Nenhuma pergunta do Banco de Perguntas é alterada por esta
  SPEC.
- CA-011: Criação de aplicação exige `CandidateApplication` `active`.
- CA-012: Criação de aplicação exige `Candidate` `active`.
- CA-013: Criação de aplicação exige consentimento específico
  `granted` (seção 20), distinto do consentimento operacional geral.
- CA-014: No máximo uma aplicação não finalizada por
  `CandidateApplication` por instrumento a qualquer momento.
- CA-015: Criação de aplicação nunca é automática — sempre ato
  administrativo explícito (seção 9.1).
- CA-016: `JobOpeningBehavioralAssessmentSettings` nunca dispara
  aplicação sozinha.
- CA-017: Snapshot de contexto é congelado no momento da criação da
  aplicação.
- CA-018: Alterar a versão do instrumento depois da criação de uma
  aplicação nunca altera essa aplicação já existente.
- CA-019: `origin_type = internal_application` segue a máquina de
  estados completa (seção 7.1).
- CA-020: `origin_type = external_import` nasce diretamente `completed`,
  nunca passa por `draft`/`available`/`in_progress`/`expired` (seção
  7.2).
- CA-021: Transições fora da matriz da seção 7.3 são sempre recusadas.
- CA-022: Estado final nunca retorna a estado operacional.
- CA-023: Resposta em rascunho pode ser salva e corrigida livremente
  durante `in_progress`.
- CA-024: Resposta submetida é imutável após `completed`.
- CA-025: Item obrigatório sem resposta bloqueia envio final.
- CA-026: Somente o Candidate identificado registra suas próprias
  respostas.
- CA-027: owner/admin nunca registram resposta em nome do candidato.
- CA-028: Envio final é idempotente.
- CA-029: Início é idempotente.
- CA-030: Salvamento de resposta é idempotente por item.
- CA-031: Resultado é calculado de forma determinística e reproduzível.
- CA-032: Resultado nunca usa IA.
- CA-033: Resultado nunca varia silenciosamente depois de `completed`.
- CA-034: Valor de dimensão nunca é agregado em score de contratação
  (seção 13).
- CA-035: Interpretação nunca usa linguagem determinística proibida
  (seção 14).
- CA-036: Perfil Comportamental nunca altera `current_stage`.
- CA-037: Perfil Comportamental nunca altera `application_status`,
  finalização, `rejected`, `hired`, score ou ranking.
- CA-038: Perfil Comportamental nunca é derivado automaticamente de
  respostas da Pré-Entrevista.
- CA-039: Nenhuma entidade da SPEC-021 é alterada por esta SPEC.
- CA-040: Reabertura sempre resulta em nova tentativa, nunca reativa a
  mesma aplicação finalizada.
- CA-041: Nova tentativa nunca copia respostas nem resultado da
  tentativa anterior.
- CA-042: Tentativa anterior permanece preservada após reabertura.
- CA-043: `Candidate` inativo bloqueia criação, início, resposta, envio,
  importação e reabertura, mas preserva histórico.
- CA-044: Consentimento específico inválido bloqueia as mesmas
  operações, mas preserva histórico.
- CA-045: Nenhuma chamada a `AIGateway`, provider, modelo ou Prompt
  Registry ocorre em nenhum passo desta SPEC.
- CA-046: `member` visualiza somente `id` e `status` (seção 25.2).
- CA-047: `member` nunca visualiza resposta, resultado ou valor de
  dimensão.
- CA-048: Platform Admin nunca aplica, responde, calcula, cancela ou
  reabre.
- CA-049: Platform Admin nunca recebe resposta bruta nem valor de
  dimensão, mesmo em leitura administrativa.
- CA-050: Organization arquivada bloqueia toda operação funcional desta
  SPEC.
- CA-051: Acesso cruzado entre Organizations é recusado sem vazar
  existência.
- CA-052: Mass assignment de campos protegidos é bloqueado, inclusive
  no payload de importação externa.
- CA-053: Importação externa nunca confia cegamente no payload recebido
  (seção 28).
- CA-054: Importação externa registra proveniência completa (provedor,
  instrumento, versão, momento de aplicação externa, momento de
  importação).
- CA-055: Importação externa nunca copia conteúdo proprietário do
  instrumento em si.
- CA-056: Reimportação do mesmo resultado externo nunca cria segunda
  aplicação.
- CA-057: Auditoria nunca registra resposta bruta completa nem valor de
  dimensão completo.
- CA-058: Falha de auditoria crítica em criação, envio, cálculo,
  importação, cancelamento ou reabertura causa rollback.
- CA-059: Não existe exclusão física de instrumento, versão, item,
  aplicação, resposta, resultado ou evento.
- CA-060: Nenhuma funcionalidade da SPEC-023 ou SPEC-024 é implementada
  antecipadamente por esta SPEC.
- CA-061: Nenhum algoritmo, questionário ou fórmula DISC é definido por
  esta SPEC.
- CA-062: Token de acesso do Candidate nunca é reutilizável fora da
  aplicação/Organization a que pertence (seção 26).
- CA-063: `available_at` e `started_at` nunca são preenchidos para
  `origin_type = external_import` (seção 4.7).
- CA-064: Importação externa registra `applied_at_external`,
  `completed_at_external`, `imported_at` e `imported_by_user_id`
  distintos e completos (seção 28).
- CA-065: `imported_by_user_id` nunca é nulo, nunca é Platform Admin e
  nunca é ator fictício (seção 16 da revisão destrutiva).
- CA-066: Uma `BehavioralInstrumentVersion` `archived` permanece
  integralmente interpretável para aplicações já `completed` que a
  referenciam (seção 4.5).
- CA-067: `BehavioralInstrumentItem` nunca é compartilhado fisicamente
  entre duas versões ou dois instrumentos, mesmo com texto idêntico
  (seção 6).
- CA-068: Envio final, cálculo, persistência do resultado e transição
  para `completed` ocorrem em uma única transação atômica (seção 15.1).
- CA-069: Falha no cálculo durante o envio final reverte a transação
  inteira — a aplicação permanece `in_progress`, respostas em rascunho
  permanecem preservadas, nenhum resultado parcial é criado (seção
  15.1).
- CA-070: Nenhuma aplicação atinge `completed` sem
  `BehavioralAssessmentResult` correspondente já persistido, em nenhum
  `origin_type` (seção 15.1, seção 9.2).
- CA-071: `draft` de uma `BehavioralAssessment` `internal_application`
  transiciona para `available` atomicamente na mesma operação de
  criação, nunca permanece como pausa funcional persistida (seção 7.1).
- CA-072: Nova tentativa resolve o instrumento/versão vigente no
  momento da reabertura, nunca herda a versão da tentativa anterior
  (seção 17).
- CA-073: Cálculo determinístico nunca usa Blueprint, Job Opening
  Version ou qualquer contexto organizacional como entrada, apenas como
  referência histórica (seção 15).
- CA-074: Nenhuma conversão arbitrária de texto em número, nenhuma
  normalização entre instrumentos diferentes, nenhuma média ou soma de
  dimensões, nenhuma "nota comportamental" ou "fit cultural", nenhum
  ranking (seção 13).
- CA-075: Interpretação humana (nota de owner/admin) nunca é gravada em
  `BehavioralAssessmentResultDimension` nem em `BehavioralAssessmentResult`
  — pertence a `candidate_application_notes` (SPEC-012), quando existir
  (seção 14.1).
- CA-076: `purpose = "behavioral_assessment"` é o valor canônico
  exigido para o consentimento desta finalidade — nenhuma outra string
  livre é aceita como equivalente (seção 20).
- CA-077: Toda criação de aplicação (`internal_application` e
  `external_import`) registra a referência ao `candidate_consents.id`
  que a autorizou (seção 20).
- CA-078: `CandidateApplication` finalizada bloqueia nova aplicação de
  **ambos** os `origin_type`, incluindo importação externa (seção 20).
- CA-079: Visibilidade do resultado ao Candidate é sempre resolvida no
  servidor a partir de `candidate_result_visibility` da
  `BehavioralInstrumentVersion` usada — nunca decidida pelo cliente
  (seção 25.3).
- CA-080: Visibilidade de respostas brutas a owner/admin pode ser
  restringida por `raw_response_owner_visibility` da versão do
  instrumento — nunca se aplica a `origin_type = external_import`
  (seção 25.1).
- CA-081: Platform Admin, mesmo administrando um instrumento global,
  nunca acessa dado de aplicação, resposta ou resultado de nenhuma
  Organization que o utiliza, além da leitura administrativa minimizada
  já definida (seção 27.1).
- CA-082: Auditoria nunca registra o payload bruto recebido de um
  provedor externo, apenas os campos de proveniência estruturados
  (seção 29).
- CA-083: `BehavioralAssessmentEvent` (timeline de domínio) e os
  eventos de auditoria geral são estruturas distintas, nunca uma
  substituindo a outra (seção 29.1).
- CA-084: Instrumento global permanece disponível para outras
  Organizations ativas quando uma Organization específica é arquivada
  (seção 31).

## 37. Testes Obrigatórios

Quando esta SPEC for implementada, os testes devem comprovar, no
mínimo, cobrindo as categorias abaixo:

### Unidade e validação

1. validação de `item_type` e resposta compatível;
2. validação de mass assignment de campos protegidos;
3. validação de payload de importação externa (estrutura mínima).

### Integração — instrumento e configuração

4. criar instrumento global (Platform Admin);
5. criar instrumento próprio (owner/admin);
6. publicar versão de instrumento (`draft` → `active`);
7. somente uma versão `active` por instrumento;
8. habilitar instrumento global para a Organization;
9. configurar Perfil Comportamental da vaga;
10. alterar configuração da vaga não afeta aplicação já criada.

### Integração — aplicação (`internal_application`)

11. criar aplicação para `CandidateApplication` `active`;
12. bloquear criação com `CandidateApplication` não `active`;
13. bloquear criação com `Candidate` inativo;
14. bloquear criação sem consentimento específico `granted`;
15. bloquear segunda aplicação não finalizada do mesmo instrumento;
16. iniciar aplicação `available`;
17. salvar resposta em rascunho durante `in_progress`;
18. bloquear envio final com item obrigatório sem resposta;
19. envio final bem-sucedido transiciona para `completed`;
20. resposta imutável após `completed` (nível de aplicação e nível de
    banco).

### Integração — aplicação (`external_import`)

21. registrar importação externa cria aplicação diretamente `completed`;
22. importação externa nunca passa por `draft`/`available`/
    `in_progress`;
23. reimportação do mesmo resultado externo não duplica aplicação;
24. importação com proveniência incompleta é recusada;
25. importação nunca copia conteúdo proprietário do instrumento.

### State machine e imutabilidade

26. cada transição permitida da matriz da seção 7.3 funciona;
27. cada transição proibida é recusada via SQL direto (trigger);
28. nenhum UPDATE é permitido após estado final;
29. DELETE é sempre proibido em qualquer tabela desta SPEC;
30. campos de contexto são imutáveis mesmo em estado operacional.

### Snapshot e versionamento

31. aplicação referencia `behavioral_instrument_version_id` congelado;
32. nova versão do instrumento não altera aplicação já criada;
33. arquivamento de versão não afeta aplicação já criada;
34. republicação de vaga ou nova Blueprint Version não altera aplicação
    já criada.

### Cálculo e resultado

35. cálculo determinístico produz o mesmo resultado para as mesmas
    respostas;
36. resultado nunca é recalculado silenciosamente após `completed`;
37. resultado nunca agrega dimensões em score único de contratação;
38. `interpretation_text`, quando presente, nunca usa termos proibidos
    (verificação de conteúdo, seção 14).

### Tentativas e reabertura

39. reabertura exige owner/admin;
40. reabertura bloqueada quando tentativa anterior não está em estado
    final;
41. nova tentativa nunca copia respostas nem resultado da anterior;
42. tentativa anterior preservada e consultável após reabertura.

### Consentimento, Candidate inativo, CandidateApplication finalizada

43. bloqueio por ausência de consentimento específico;
44. bloqueio por consentimento `pending`/`revoked`/`expired`;
45. bloqueio por `Candidate` inativo;
46. bloqueio por `CandidateApplication` finalizada;
47. histórico preservado em todos os bloqueios acima.

### Permissões e cross-tenant

48. owner cria/consulta/cancela/reabre;
49. admin possui os mesmos poderes de owner;
50. member visualiza somente `id` e `status`;
51. member nunca recebe resposta, resultado ou valor de dimensão;
52. Candidate nunca acessa aplicação de outra `CandidateApplication`;
53. Platform Admin nunca opera funcionalmente;
54. Platform Admin nunca recebe resposta ou valor de dimensão em leitura
    administrativa;
55. acesso cruzado entre Organizations é bloqueado com mensagem
    genérica, para instrumento, aplicação, resposta e resultado;
56. instrumento privado de uma Organization nunca é usado por outra.

### Acesso público, token e rate limiting

57. token de acesso é opaco, com escopo à aplicação, revogável;
58. token nunca resolve dado de outra Organization ou aplicação;
59. múltiplos tokens simultâneos permitidos sem revogar os anteriores em
    replay;
60. rate limiting por IP e por hash do token, nunca pelo token bruto;
61. 429 nunca funciona como oráculo de validade de token.

### Idempotência e concorrência

62. reenvio de início não duplica evento;
63. reenvio de salvamento de resposta não duplica registro;
64. reenvio de envio final não duplica conclusão nem tentativa;
65. duas criações concorrentes resultam em uma única aplicação
    operacional;
66. dois envios finais concorrentes resultam em uma única transição
    para `completed`;
67. cancelamento concorrendo com envio final produz conflito seguro;
68. expiração concorrendo com envio final produz resultado
    determinístico (`internal_application`).

### PII e logs

69. nenhuma resposta bruta nem valor de dimensão aparece em log de
    console;
70. nenhum token bruto aparece em log;
71. auditoria nunca contém resposta bruta completa nem valor de
    dimensão completo.

### Ausência de IA e regressão

72. fluxo completo funciona integralmente sem nenhuma chamada de IA;
73. nenhuma tabela, rota ou serviço de IA é criado por esta SPEC;
74. regressão: `CandidateApplication` (SPEC-012) não é alterada por
    esta SPEC — `current_stage`/`application_status` permanecem
    inalterados após conclusão de aplicação;
75. regressão: `PreInterview` (SPEC-021) não é alterada por esta SPEC.

### Itens adicionais (revisão destrutiva)

76. `available_at`/`started_at` nunca preenchidos para `external_import`;
77. importação externa registra `applied_at_external`,
    `completed_at_external`, `imported_at` e `imported_by_user_id`
    distintos;
78. `imported_by_user_id` nunca nulo e nunca Platform Admin;
79. versão `archived` continua interpretando aplicação `completed` que a
    referencia;
80. dois instrumentos/versões diferentes nunca compartilham a mesma
    linha física de item, mesmo com texto idêntico;
81. envio final + cálculo + persistência do resultado + `completed`
    ocorrem na mesma transação atômica;
82. falha de cálculo durante o envio final reverte a transação inteira,
    preserva respostas em rascunho, aplicação permanece `in_progress`;
83. reenvio após falha de cálculo é idempotente e bem-sucedido quando o
    problema for corrigido;
84. `draft` de aplicação `internal_application` nunca é observável como
    pausa persistida — transição para `available` sempre atômica com a
    criação;
85. nova tentativa resolve a versão do instrumento vigente no momento
    da reabertura, nunca herda a versão da tentativa anterior;
86. cálculo nunca lê Blueprint Version nem Job Opening Version como
    entrada;
87. cálculo nunca converte texto em número fora da regra formal do
    instrumento;
88. nenhuma média, soma ou normalização entre dimensões/instrumentos é
    calculada, mesmo internamente;
89. nota humana de owner/admin sobre um resultado nunca é persistida em
    `BehavioralAssessmentResultDimension`/`BehavioralAssessmentResult`;
90. criação de aplicação (ambos `origin_type`) rejeitada sem
    `purpose = "behavioral_assessment"` concedido;
91. evento de criação registra a referência ao `candidate_consents.id`
    usado;
92. `CandidateApplication` finalizada bloqueia importação externa, não
    apenas criação `internal_application`;
93. resultado exposto ao Candidate respeita `candidate_result_visibility`
    da versão (`none`/`summary`/`full`), nunca decidido pelo cliente;
94. respostas brutas ocultas a owner/admin quando
    `raw_response_owner_visibility = restricted`;
95. Platform Admin administrando instrumento global não ganha acesso a
    aplicação/resposta/resultado de nenhuma Organization que o usa;
96. auditoria nunca contém payload bruto de importação externa, apenas
    campos de proveniência estruturados;
97. `BehavioralAssessmentEvent` e evento de auditoria geral coexistem
    sem um substituir o outro;
98. instrumento global permanece operável por outras Organizations
    quando uma Organization específica é arquivada;
99. reimportação com `external_reference_id` estável não duplica
    aplicação; ausência de identificador estável é tratada como
    limitação registrada, nunca como falha silenciosa de deduplicação.

Esta SPEC não implementa os testes acima — apenas os especifica.

## 38. Limitações Conhecidas

- Esta SPEC não implementa código, banco, migrations, rotas, APIs, testes
  ou dependências.
- Não define nenhuma metodologia DISC concreta (seção 5).
- Não define fórmula de cálculo de nenhum instrumento concreto (seção
  15).
- Não define quantidade máxima de tentativas, tempo máximo/mínimo de
  resposta nem valor numérico de `expires_at` — ficam para
  especificação técnica futura.
- Não define o mecanismo técnico exato de acesso do Candidate sem
  autenticação como `User` — apenas seus invariantes (seção 26),
  reaproveitando os já validados pela Fase 18. Este ponto não impede a
  aprovação futura desta SPEC.
- Não define validação técnica/criptográfica de autenticidade de
  resultado importado externamente (seção 28) — apenas validação
  estrutural de servidor.
- Não define gatilho automático de criação de aplicação — decisão
  deliberada desta versão (seção 9.1); uma futura revisão pode
  introduzir um gatilho automático configurável, mediante revisão
  própria e explícita.
- Não define integração entre respostas da Pré-Entrevista e Perfil
  Comportamental (seção 22) — lacuna deliberadamente aberta pela
  ADR-0023 e mantida aberta por esta versão.
- Define apenas a política de visibilidade do resultado ao Candidate
  como propriedade do instrumento (`candidate_result_visibility`,
  seção 4.5, seção 25.3) — não define a interface concreta de uma
  eventual experiência de acompanhamento do Candidate para os modos
  `summary`/`full`, apenas o contrato de que essa visibilidade nunca é
  decidida pelo frontend.
- Não define o mecanismo físico exato de habilitação de instrumento
  global por Organization (seção 4.4) — apenas o padrão conceitual de
  duas camadas.
- Não garante idempotência automática de reimportação externa quando o
  provedor não fornecer identificador externo estável (seção 18) — a
  responsabilidade operacional de evitar reenvio passa a ser de
  owner/admin nesse cenário.
- Não define, nesta versão, consentimento granular por instrumento
  individual (seção 20) — `purpose = "behavioral_assessment"` cobre
  qualquer instrumento permitido à Organization; uma revisão futura
  pode decidir exigir granularidade por instrumento/metodologia, caso
  um caso de uso concreto surja.
- IA, Pré-Análise Assistida por IA e Dossiê Inteligente não são
  definidos nem implementados por esta SPEC — pertencem à SPEC-023 e à
  SPEC-024.
- Não há exclusão física.

## 39. Definição de Concluído

Para a implementação futura desta SPEC:

- SPEC aprovada antes do desenvolvimento (esta versão, `Aprovada`,
  `1.0`, já incorpora a revisão destrutiva documental — nota de revisão
  introdutória deste documento);
- nenhuma regra já aprovada pela SPEC-009, SPEC-010, SPEC-011, SPEC-012,
  SPEC-013, SPEC-014, SPEC-018, SPEC-019, SPEC-020 ou SPEC-021 foi
  redefinida ou contradita;
- critérios de aceite atendidos;
- testes obrigatórios implementados e passando;
- testes de segurança, multiempresa, concorrência e idempotência
  passando;
- rollback de auditoria crítica verificado;
- regras de segurança verificadas, incluindo os invariantes do
  mecanismo de acesso do Candidate (seção 26);
- migrations reproduzíveis quando houver banco;
- lint passando;
- formatação passando;
- build passando;
- documentação atualizada;
- auditoria revisada;
- nenhuma funcionalidade das SPEC-023 ou SPEC-024 implementada
  antecipadamente;
- commit realizado.
