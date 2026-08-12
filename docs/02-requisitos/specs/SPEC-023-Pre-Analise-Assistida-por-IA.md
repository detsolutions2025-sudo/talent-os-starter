# SPEC-023 - Pré-Análise Assistida por IA

**Status:** Aprovada
**Versão:** 1.0
**Fase:** 20
**Responsável de negócio:** Thiago Sousa
**Última atualização:** 2026-08-11
**Dependências:** SPEC-009 - Banco de Perguntas, SPEC-010 - Vagas, SPEC-011 - Candidatos (v1.2), SPEC-012 - Processo Seletivo (v1.1), SPEC-014 - Infraestrutura de IA, SPEC-018 - Blueprint Organizacional / Implantação Guiada, SPEC-021 - Pré-Entrevista Estruturada, SPEC-022 - Perfil Comportamental, ADR-0013, ADR-0014, ADR-0015, ADR-0016, ADR-0017, ADR-0018, ADR-0019, ADR-0020, ADR-0021, ADR-0022, ADR-0023

**Nota de revisão (v1.0 — revisão destrutiva):** a versão 0.1 (Rascunho)
deste documento registrava cinco ambiguidades explícitas, sem solução
implícita. Esta revisão fecha as cinco de forma definitiva: (1)
`Interview Evaluation` nunca é fonte desta Feature, em nenhuma versão —
risco de circularidade com avaliação humana e ordem da jornada da ADR-0023,
seção 10.2; (2) `feature_key = "candidate_pre_analysis"` passa a ser
definitivo e estável, não mais proposto, seção 20.1; (3) consentimento
`purpose = "ai_pre_analysis"` permanece único e amplo por finalidade, sem
granularidade por fonte, mesmo padrão da SPEC-022, seção 18.1; (4) cada
execução é imutável e independente, nunca "reaberta" — reanálise é sempre
uma nova `PreAnalysis`, relacionada à anterior apenas por
`previous_attempt_id` como linhagem, seção 9.3; (5) nenhum limite numérico
de tentativas é inventado — o controle de custo é delegado integralmente ao
rate limit e à telemetria já existentes na SPEC-014, seção 20.3. Além
disso, esta revisão corrigiu achados adicionais de segurança e de domínio:
ausência de `snapshot_value` para evidências de `Candidate` (que não possui
versionamento formal, seção 4.5.1); envio desnecessário de `full_name`/
`preferred_name` ao provider (seção 10.1.1); ausência de validação
cross-candidatura para `pre_interview_id`/`behavioral_assessment_id`/
`consent_id` dentro da mesma Organization (seção 10.4); fronteira
transacional implícita e potencialmente incorreta entre a chamada externa
ao `AIGateway` e a persistência local (seção 9.2, seção 9.4); ausência de
revalidação de consentimento imediatamente antes do envio (seção 9.5);
ausência de garantia de que uma execução nunca fica presa em `running`
(seção 4.4); ausência de campo de limitações/incertezas no resultado
(seção 13.1.1); invariantes de mitigação de prompt injection insuficientes
(seção 23); e reforço de que administrar infraestrutura de IA nunca concede
acesso automático a conteúdo funcional (seção 24.3, seção 24.4). O
detalhamento completo de cada decisão está na seção 40. Nenhum conflito
crítico ou importante permanece em aberto após esta revisão (seção 43).

## 1. Objetivo

Definir funcionalmente a **Pré-Análise Assistida por IA**: uma síntese
opcional, produzida por Inteligência Artificial através do `AIGateway`
(SPEC-014, ADR-0019), sobre evidências já existentes e rastreáveis de uma
`CandidateApplication` — nunca uma nova coleta de dado, nunca uma decisão,
nunca um score de contratação, nunca um veredito de aderência.

Esta SPEC formaliza exatamente o passo que a ADR-0023 (seção "Análise
Assistida por IA") descreve e deixa para SPEC futura: "quando a Organization
tiver IA habilitada para a Feature correspondente... a IA pode analisar o
material já disponível na candidatura: respostas da Pré-Entrevista, Perfil
Comportamental, DISC quando existir, competências declaradas ou observadas, e
contexto do Blueprint Organizacional relevante." Esta é essa SPEC.

**A Pré-Análise Assistida por IA é inteiramente opcional.** Nenhuma etapa do
processo seletivo depende dela. Nenhuma `CandidateApplication` é bloqueada,
atrasada ou alterada pela ausência, indisponibilidade, desabilitação ou falha
desta Feature (ADR-0016, "IA nunca é requisito estrutural"; ADR-0023,
princípio 2: "a ausência ou falha de IA nunca bloqueia a candidatura, a
pré-entrevista, a entrevista humana ou a decisão final").

Esta SPEC **reutiliza integralmente** `Candidate` (SPEC-011),
`CandidateApplication` (SPEC-012), a infraestrutura de IA completa (ADR-0016
a ADR-0019, SPEC-014), o Blueprint Organizacional (ADR-0021, ADR-0022,
SPEC-018), a Pré-Entrevista Estruturada (SPEC-021) e o Perfil Comportamental
(SPEC-022) já aprovados. Ela não redefine nenhuma regra, nenhum campo,
nenhuma permissão e nenhum estado já aprovado por essas SPECs — apenas
consome, como leitura, o que essas entidades já expõem, e define a nova
camada de síntese assistida que se apoia sobre elas.

Esta SPEC reaproveita, sempre que o problema é genuinamente o mesmo, o padrão
arquitetural já validado pela SPEC-021 e pela SPEC-022 (Configuração ×
Execução × Tentativa; snapshot de contexto; não retroatividade; idempotência;
concorrência via banco de dados) — e se afasta deliberadamente desse padrão
onde o problema é diferente (seção 9.1, seção 4.2): esta SPEC não tem uma
fase de resposta do candidato, porque o candidato nunca participa da
Pré-Análise.

## 2. Fora do Escopo

Esta SPEC não define nem implementa:

- Inteligência Artificial em si — nenhum algoritmo, nenhum modelo, nenhum
  prompt concreto, nenhuma fórmula de síntese (isso é conteúdo do Prompt
  Registry e do Model Registry, já definidos pela ADR-0019 e pela SPEC-014,
  nunca redefinidos aqui);
- **Dossiê Inteligente do Candidato (SPEC-024)** — o Dossiê é uma composição
  rastreável de múltiplas fontes (ADR-0023, seção "Dossiê Inteligente"),
  incluindo, no futuro, o resultado desta SPEC como uma de suas fontes
  possíveis. Esta SPEC produz um resultado consumível pelo Dossiê; ela nunca
  implementa o Dossiê em si, nunca define seu layout, sua composição final
  entre fontes, nem qualquer regra própria dele;
- score global de candidato, ranking automático, nota final universal,
  percentual definitivo de "fit", matching definitivo ou classificação
  automática de aprovação/reprovação (ADR-0023, seção "Scores" — proibição
  absoluta, detalhada na seção 15 desta SPEC);
- alteração automática de `application_status` ou `current_stage` da
  `CandidateApplication` (SPEC-012/ADR-0014) — nenhum valor novo é criado
  nesse enum, e nenhuma transição é disparada por esta SPEC (seção 7);
- decisão de contratação, eliminação automática, aprovação, reprovação ou
  qualquer efeito de RH decorrente diretamente da Pré-Análise (seção 15,
  seção 16);
- `Interview` (Entrevista humana, SPEC-013) — conceito distinto e
  independente; esta SPEC não altera nenhuma regra da SPEC-013;
- Pré-Entrevista Estruturada (já definida integralmente pela SPEC-021) e
  Perfil Comportamental (já definido integralmente pela SPEC-022) — esta
  SPEC apenas **consome**, como fonte de leitura, o que essas SPECs já
  produzem, sem alterar nenhuma entidade, estado, regra ou permissão delas;
- infraestrutura de IA em si (`AIGateway`, Provider Routing, Prompt
  Registry, Model Registry, Secret Management, AI Execution) — já definida
  integralmente pelas ADR-0016 a ADR-0019 e pela SPEC-014; esta SPEC apenas
  **consome** essa infraestrutura como Feature consumidora (seção 20), sem
  redefinir nenhuma de suas regras;
- Blueprint Organizacional e seu ciclo de vida — já definidos integralmente
  pela ADR-0021, ADR-0022 e SPEC-018; esta SPEC apenas referencia a
  Blueprint Version vigente como contexto opcional (seção 12);
- qualquer metodologia DISC específica — fora de escopo tanto desta SPEC
  quanto da SPEC-022 (que já registra essa mesma exclusão);
- confirmação de identidade, autenticação ou qualquer mecanismo de acesso do
  Candidate — o Candidate **nunca** é ator desta SPEC (seção 3, seção 25);
- mecanismo técnico de execução assíncrona (fila, worker, scheduler) para a
  chamada ao `AIGateway` — apenas o desacoplamento funcional é exigido
  (seção 9.2), mesmo princípio já usado pela SPEC-021 (seção 8.2);
- política numérica de rate limit, timeout, retry ou fallback — todas já
  definidas pela SPEC-014/ADR-0019, nunca redefinidas aqui (seção 21);
- schema físico do prompt de Pré-Análise, seu `prompt_key` definitivo, seu
  schema de input/output exato — isso é conteúdo do Prompt Registry
  (ADR-0019, SPEC-014), administrado por Platform Admin; esta SPEC apenas
  registra os requisitos funcionais que esse prompt deve respeitar (seção
  13, seção 14);
- implementar código, banco, migrations, rotas, APIs, testes ou
  dependências;
- excluir fisicamente qualquer dado.

Esses assuntos pertencem à SPEC-024 (Dossiê Inteligente do Candidato), ao
Prompt Registry/Model Registry administrados por Platform Admin (ADR-0019,
SPEC-014), ou às SPECs já aprovadas que esta SPEC apenas referencia.

## 3. Usuários Envolvidos

- **owner:** solicita a execução da Pré-Análise para uma `CandidateApplication`
  específica, consulta o resultado, cancela uma execução em andamento,
  solicita nova execução (reanálise), consulta histórico.
- **admin:** possui, nesta versão, exatamente os mesmos poderes operacionais
  de `owner` sobre esta SPEC — mesma avaliação já explicitada pela SPEC-021
  (seção 24.1) e pela SPEC-022 (seção 3.1), reaplicada aqui pelo mesmo
  motivo: não existe, nesta fase, nenhuma ação sobre a Pré-Análise com risco
  ou impacto equivalente ao que já justifica exclusividade de `owner` em
  outras SPECs (por exemplo, `hired`, SPEC-012).
- **member:** visualiza somente que uma Pré-Análise existe e seu status,
  para candidaturas `active` que já pode visualizar (SPEC-012, seção 12) —
  nunca o conteúdo do resultado. Esta SPEC aplica a mesma minimização
  rigorosa já adotada pela SPEC-022 (seção 25.2), pelo mesmo motivo:
  informação sintetizada por IA sobre múltiplas fontes potencialmente
  sensíveis exige, no mínimo, o mesmo rigor já aplicado ao Perfil
  Comportamental (seção 24.2 desta SPEC).
- **Candidate:** **não é ator desta SPEC.** Diferente da Pré-Entrevista
  (SPEC-021) e do Perfil Comportamental na modalidade `internal_application`
  (SPEC-022), a Pré-Análise nunca é respondida, iniciada ou visualizada pelo
  próprio candidato — ela é, por definição, uma síntese interna de apoio ao
  Recrutador (ADR-0023, seção "Papel do Recrutador"), nunca uma etapa
  voltada ao candidato. O Candidate é o **sujeito** da análise, nunca seu
  **ator** (seção 25).
- **Platform Admin (SuperAdmin):** administra a infraestrutura de IA
  consumida por esta Feature (catálogo da Feature, Model Registry, Prompt
  Registry, Provider Catalog — já definidos pela ADR-0016 a ADR-0019 e pela
  SPEC-014, não redefinidos aqui); consulta administrativamente execuções de
  Pré-Análise com motivo e auditoria, sem operar funcionalmente e sem
  receber o conteúdo completo do resultado por padrão (seção 27).

`Platform Admin` não é Role de Membership e não recebe permissões funcionais
de `owner`, `admin` ou `member` dentro da Organization (ADR-0003, ADR-0020).

## 4. Conceitos

### 4.1 Pré-Análise Assistida por IA

O conceito funcional amplo desta SPEC: uma síntese estruturada, produzida por
IA através do `AIGateway`, sobre evidências já existentes de uma
`CandidateApplication`. Representada, na prática, pela entidade `PreAnalysis`
(seção 4.4) e por seu `PreAnalysisResult` (seção 4.6), quando concluída com
sucesso.

A Pré-Análise:

- pertence exclusivamente à `CandidateApplication` — nunca ao `Candidate`
  principal (ADR-0023, princípio 4; ADR-0013; ADR-0014);
- é informação de apoio, nunca decisão (seção 15, seção 16);
- não é obrigatória para nenhuma `CandidateApplication`;
- nunca é gerada automaticamente — é sempre um ato administrativo explícito
  de `owner`/`admin` (seção 9.1);
- nunca inventa evidência — ela sintetiza exclusivamente o que já existe e é
  rastreável (seção 10, seção 11);
- não altera `current_stage`, `application_status`, finalização, `rejected`,
  `hired`, score de contratação ou ranking (seção 7).

### 4.2 Por que esta SPEC não usa Configuração × Instância × Tentativa por Vaga

A SPEC-021 e a SPEC-022 definem uma configuração própria por `Job Opening`
(`JobOpeningPreInterviewSettings`, `JobOpeningBehavioralAssessmentSettings`)
porque, nesses dois domínios, a Organization precisa decidir, com
antecedência, **quais perguntas** ou **qual instrumento** usar antes de
qualquer candidato responder.

A Pré-Análise não tem esse problema: ela não possui itens, perguntas ou
instrumento configurável por vaga — ela é sempre a mesma Feature de IA
(`feature_key`, seção 20), aplicada sobre o que já existe em uma
`CandidateApplication` específica, no momento em que `owner`/`admin` decide
executá-la. Por isso, esta SPEC **não define** nenhuma
`JobOpeningPreAnalysisSettings`. A disponibilidade da Feature é inteiramente
governada pela infraestrutura de IA já existente — `platform_ai_allowed`,
`organization_ai_enabled` (ADR-0016), `feature_available_on_platform`,
`organization_feature_enabled` (ADR-0017) — nunca por uma configuração nova e
paralela por Vaga.

Esta é uma diferença deliberada de desenho, não uma omissão — mesmo padrão
de justificativa explícita já usado pela SPEC-022 (seção 9.1) para explicar
por que sua criação é manual, e não automática.

### 4.2.1 Verificação explícita: solicitação, execução e resultado são a mesma entidade de negócio?

A revisão destrutiva desta versão avaliou explicitamente se "solicitação",
"execução" e "resultado" precisam ser três entidades separadas. A decisão é:
**não** — `PreAnalysis` representa, em uma única entidade com estado, tanto
a solicitação quanto a execução, porque as duas nunca têm ciclo de vida
independente uma da outra nesta SPEC: não existe "solicitação pendente de
aprovação" separada de "execução" (diferente, por exemplo, de um fluxo de
aprovação em dois passos) — o ato de solicitar (`owner`/`admin` aciona a
operação) e o início da execução (`requested` → validação → `running`)
ocorrem sempre na mesma operação lógica, sem intervalo funcional relevante
entre eles. Separar as duas em tabelas distintas duplicaria a mesma chave
primária sem nenhum ganho de rastreabilidade. `PreAnalysisResult` **é**
separado (seção 4.6) porque ele **tem** ciclo de vida distinto: só passa a
existir depois que a execução é bem-sucedida, e precisa permanecer
consultável independentemente do envelope de execução que o produziu — o
mesmo critério de separação já usado pela SPEC-022 (seção 4.10) entre
`BehavioralAssessment` e `BehavioralAssessmentResult`.

### 4.3 Quatro camadas conceituais

Esta SPEC formaliza quatro camadas, que nunca devem ser confundidas entre si
— mesmo princípio de separação já usado pela SPEC-021 (seção 4.1) e pela
SPEC-022 (seção 4.2):

- **A. Execução** (`PreAnalysis`, seção 4.4): o pedido concreto de
  Pré-Análise para uma `CandidateApplication` específica, com seu ciclo de
  vida próprio (seção 5).
- **B. Evidências consumidas** (`PreAnalysisEvidence`, seção 4.5): a lista
  rastreável de fontes que efetivamente alimentaram aquela execução — nunca
  o conteúdo integral dessas fontes, apenas a referência a elas (seção 11).
- **C. Resultado** (`PreAnalysisResult`, seção 4.6): a saída estruturada,
  sempre não determinística em linguagem (seção 14), sempre rastreável às
  evidências que a originaram (seção 12).
- **D. Execução técnica de IA** (`AI Execution`, já definida pela SPEC-014,
  nunca redefinida aqui): a chamada real ao provider, com telemetria,
  custo, status técnico e categoria de erro — referenciada por `PreAnalysis`
  (`ai_execution_id`), nunca duplicada.

A cadeia é sempre unidirecional: `Evidências existentes` → `Execução (A)` →
`AI Execution (D)` → `Resultado (C)`, com `Evidências (B)` registradas como
parte da execução. Uma alteração posterior em qualquer evidência de origem
(nova versão do Blueprint, nova tentativa de Pré-Entrevista, edição de
`Candidate`) nunca reinterpreta retroativamente uma `PreAnalysis` já
concluída (seção 17).

### 4.4 `PreAnalysis`

A execução concreta da Pré-Análise para uma `CandidateApplication`
específica.

Campos conceituais mínimos:

- `id`;
- `organization_id`;
- `candidate_application_id`;
- `attempt_number` (seção 9.3 — número sequencial dentro da mesma
  `CandidateApplication`, sem limite numérico definido por esta SPEC);
- `previous_attempt_id`, opcional;
- `status` (seção 5);
- `requested_by_user_id` (sempre preenchido — nunca nulo, nunca
  `system_triggered`; seção 9.1);
- `requested_at`;
- `job_opening_id` e `job_opening_version_id`, herdados de forma imutável da
  `CandidateApplication` (mesmo princípio da SPEC-021, seção 4.3.1, e da
  SPEC-022, seção 4.8);
- `blueprint_version_id`, opcional (seção 12);
- `pre_interview_id`, opcional (referência à instância específica de
  `PreInterview`, SPEC-021, usada como evidência, quando existir e for
  utilizada — seção 10);
- `behavioral_assessment_id`, opcional (referência à `BehavioralAssessment`,
  SPEC-022, usada como evidência, quando existir e for utilizada — seção
  10);
- `consent_id` (referência ao `candidate_consents.id` com
  `purpose = "ai_pre_analysis"` vigente no momento da criação — seção 18);
- `ai_execution_id`, opcional (referência à `AI Execution`, SPEC-014; nulo
  enquanto a execução não chegar a acionar o `AIGateway` — seção 20);
- `completed_at`, opcional;
- `failed_at`, opcional;
- `unavailable_at`, opcional;
- `cancelled_at`, `cancelled_by_user_id`, `cancellation_reason`, opcionais;
- `error_category`, opcional (mesmos valores canônicos já definidos pela
  SPEC-014, seção "AI Execution", nunca uma lista paralela nova — seção 21);
- timestamps.

Pertence exclusivamente à `CandidateApplication`. Ela:

- nunca pertence ao `Candidate` principal;
- nunca pertence à Job Opening nem à Job Opening Version — apenas herdadas
  por referência;
- nunca pertence ao Blueprint Organizacional — o Blueprint apenas
  contextualiza (ADR-0021, seção "Relacionamento com o Processo Seletivo");
- nunca pertence diretamente à Organization — o vínculo é sempre derivado da
  `CandidateApplication`;
- nunca pertence à `AI Execution` — a relação é o inverso: `PreAnalysis` é a
  entidade de negócio que referencia a `AI Execution` técnica, nunca o
  contrário (mesmo princípio já formalizado pela ADR-0019, seção "Conteúdo
  da execução": "conteúdo de negócio derivado de uma execução... fica em
  entidade funcional própria da Feature").

**Invariantes estruturais (revisão destrutiva):**

- **nunca existe `PreAnalysis` em `completed` sem exatamente um
  `PreAnalysisResult` correspondente** — nenhum estado, nenhuma exceção
  (seção 9.4);
- **nunca existe `PreAnalysis` em `unavailable` com `ai_execution_id`
  preenchido** — `unavailable` significa, por definição, que o `AIGateway`
  nunca foi acionado (seção 5.5, seção 20);
- **`PreAnalysis` nunca permanece em `running` indefinidamente.** Toda
  chamada externa ao provider já possui timeout obrigatório e limitado,
  garantido pelo próprio `AIGateway` (SPEC-014, seção "Timeout"): "nunca
  existe uma chamada externa sem timeout definido." Em operação normal, o
  `AIGateway` sempre retorna sucesso ou falha dentro desse limite, e a
  `PreAnalysis` transiciona para `completed`/`failed` de forma correspondente.
  Se, por falha de infraestrutura própria (por exemplo, o processo que
  aguardava a resposta assíncrona do `AIGateway` foi encerrado antes de
  processá-la), uma `PreAnalysis` permanecer em `running` além de um prazo
  operacional razoável, a implementação **deve** prever um mecanismo de
  reconciliação que a transicione para `failed`
  (`error_category = unknown_error`), nunca deixando-a presa
  indefinidamente nem permitindo que ela seja tratada como `completed` sem
  resultado. Este mecanismo de reconciliação é uma exigência funcional desta
  SPEC; sua implementação física (job periódico, verificação em toda
  leitura, ou equivalente) fica para especificação técnica futura.

### 4.5 `PreAnalysisEvidence`

Registro rastreável de cada fonte efetivamente consumida por uma execução de
Pré-Análise — nunca o conteúdo integral da fonte, apenas sua referência e
sua classificação de origem (seção 12).

Campos conceituais mínimos:

- `id`;
- `organization_id`;
- `pre_analysis_id`;
- `source_type` (canônico — seção 10.1);
- `source_reference_id`, opcional (o `id` da entidade de origem, quando
  aplicável — por exemplo, `pre_interview_response_id`,
  `behavioral_assessment_result_id`; nulo quando a fonte não possui um `id`
  individual referenciável, como um campo agregado do `Candidate`, caso em
  que `field_name` identifica a origem);
- `field_name`, opcional (nome conceitual do campo consumido, quando a fonte
  não for uma entidade com `id` próprio — por exemplo, `professional_summary`
  do `Candidate`);
- `origin_kind` (a classificação de proveniência, entre os cinco valores
  canônicos formalizados pela ADR-0023, seção "Evidências e Rastreabilidade"
  — seção 12);
- `content_hash`, opcional (hash do conteúdo efetivamente enviado, quando útil
  para verificação de integridade — mesmo princípio já usado pela AI
  Execution, ADR-0019, seção "Conteúdo da execução": "hashes, quando úteis
  para verificação de integridade"; nunca o conteúdo em si);
- `snapshot_value`, condicional (seção 4.5.1 — obrigatório exclusivamente
  para `source_type = candidate_field`; nulo para os demais);
- timestamps.

Como regra geral, `PreAnalysisEvidence` nunca duplica o valor completo da
evidência — apenas referência, classificação e, quando necessário, hash de
integridade. O conteúdo em si permanece exclusivamente na entidade de
origem, nunca duplicado aqui — mesmo princípio de "nunca duplicar dado" já
usado pela ADR-0022 para o Blueprint Manifest (seção "Principio: manifesto
de contexto") e pela SPEC-014 para `AI Execution` (seção "Conteúdo da
execução"). A seção 4.5.1 formaliza a única exceção deliberada a essa regra
geral.

#### 4.5.1 Exceção obrigatória: `snapshot_value` para `candidate_field`

**Achado da revisão destrutiva (correção crítica):** para toda fonte cujo
conteúdo original já é imutável por construção de outra SPEC —
`job_opening_version` (SPEC-010, versão publicada imutável),
`pre_interview_response` (SPEC-021, imutável após `submitted = true`),
`behavioral_assessment_result` (SPEC-022, imutável após `completed`) e
`blueprint_version` (ADR-0022, imutável após `active`) — apenas referência +
`content_hash` são suficientes para reconstituir historicamente o que foi
enviado, porque a fonte original nunca muda depois.

Isso **não é verdade** para `candidate_field`: o `Candidate` (SPEC-011) não
possui nenhum mecanismo de versionamento formal — seus campos podem ser
editados livremente por `owner`/`admin` a qualquer momento (SPEC-011, seção
6.3). Se um campo do `Candidate` usado como evidência for editado depois da
execução, um `content_hash` isolado **nunca permite reconstituir** o valor
original efetivamente enviado — ele só prova integridade quando comparado a
um valor que já se perdeu. Isso quebraria a rastreabilidade histórica
exigida pela seção 11 e pela ADR-0023 (seção "Evidências e
Rastreabilidade").

Por isso, fica formalizado, sem exceção: toda `PreAnalysisEvidence` com
`source_type = candidate_field` **deve** armazenar, em `snapshot_value`, o
valor mínimo exato do campo efetivamente enviado ao `AIGateway` no momento
da execução — nunca apenas seu hash. Mesmo princípio de preservação de
contexto já exigido pela SPEC-013 e pela SPEC-021 (seção 9.2) para o
snapshot de perguntas do Banco de Perguntas, que também não possui
versionamento formal próprio (ADR-0022, seção "Componentes ainda não
versionados").

`snapshot_value` de `candidate_field` contém dado pessoal do candidato (por
exemplo, um trecho de resumo profissional) e recebe exatamente o mesmo
nível de proteção de acesso já exigido para `PreAnalysisResult` (seção 24,
seção 25): nunca visível a `member`, nunca visível a Platform Admin fora de
leitura administrativa minimizada e justificada.

### 4.6 `PreAnalysisResult` e `PreAnalysisFinding`

O resultado estruturado de uma `PreAnalysis` concluída com sucesso — a saída
que o Recrutador efetivamente consulta. Separado em duas entidades, mesmo
princípio de separação já usado pela SPEC-022 (seção 4.10, `Result` ×
`ResultDimension`), para não misturar o envelope da execução com seus
achados individuais.

`PreAnalysisResult` (um por `PreAnalysis` concluída com sucesso):

- `id`;
- `organization_id`;
- `pre_analysis_id`;
- `ai_execution_id` (redundante com o de `PreAnalysis`, por rastreabilidade
  direta — mesmo padrão já usado pela SPEC-022, seção 4.10, para
  `behavioral_instrument_version_id`);
- `prompt_key`, `prompt_version` (redundante com o que a `AI Execution` já
  registra, por rastreabilidade direta do que gerou este resultado
  específico — ADR-0019, seção "Prompt version utilizado");
- `summary` (texto narrativo, sempre em linguagem não determinística —
  seção 14);
- `limitations` (texto obrigatório — seção 13.1.1: lista, em linguagem
  simples, quais fontes da seção 10.1 **não** estavam disponíveis ou não
  foram utilizadas nesta execução, para que o resultado nunca seja lido como
  mais completo do que realmente é);
- `disclaimer` (rótulo fixo obrigatório, nunca omitido — seção 16: algo
  equivalente a "informação de apoio gerada por IA; nunca constitui decisão,
  aprovação, reprovação ou score");
- `calculated_at` (= `finished_at` da `AI Execution` correspondente);
- timestamps.

`PreAnalysisFinding` (zero ou mais por `PreAnalysisResult` — achados
individuais, cada um rastreável às evidências que o originaram):

- `id`;
- `organization_id`;
- `pre_analysis_result_id`;
- `category` (canônico — seção 13.2: `evidencia_aderencia`,
  `evidencia_nao_encontrada`, `ponto_forte`, `ponto_atencao`,
  `possivel_risco`, `pergunta_sugerida_para_validacao`);
- `text` (sempre em linguagem não determinística — seção 14);
- referência às evidências que sustentam este achado específico, por meio
  de um ou mais `PreAnalysisEvidence.id` (seção 12: cada achado deve
  apontar para pelo menos uma evidência rastreável, nunca ficar sem
  origem);
- ordem;
- timestamps.

Ambas as entidades são sempre **inferência de IA** (seção 12) por
construção — o próprio ato de sintetizar, mesmo quando cita evidências de
outra origem (dado declarado, resultado de instrumento, avaliação humana),
é sempre uma interpretação de IA sobre elas, nunca uma cópia direta.

### 4.7 `PreAnalysisEvent`

Registro imutável da linha do tempo de uma `PreAnalysis`. Ver seção 29.

### 4.8 Relação com `AI Execution` (SPEC-014)

`PreAnalysis` é a entidade de negócio; `AI Execution` (SPEC-014, ADR-0019) é
a trilha técnica da chamada ao provider. Esta SPEC nunca duplica o que a `AI
Execution` já registra (tokens, duração, custo estimado, `provider`,
`model`, `credential_mode`) — ela apenas referencia `ai_execution_id` e, por
rastreabilidade direta do resultado específico, `prompt_key`/`prompt_version`
em `PreAnalysisResult` (seção 4.6).

Uma `PreAnalysis` só possui `ai_execution_id` preenchido quando a execução
efetivamente chegou a acionar o `AIGateway` (seção 20) — uma `PreAnalysis`
que nunca passou das quatro condições de autorização (`unavailable`, seção
5.5) nunca possui `ai_execution_id`, porque nenhuma `AI Execution` chegou a
ser criada para ela (mesmo princípio já formalizado pela SPEC-014: "se
qualquer uma das quatro condições iniciais falhar, nenhuma credencial é
resolvida, nenhum dado de negócio é enviado, e nenhuma chamada externa
ocorre").

## 5. Estados Canônicos

Estados de `PreAnalysis`, exclusivos desta entidade — nunca reutilizados de
`CandidateApplication`, `PreInterview`, `BehavioralAssessment` ou `AI
Execution` (mesmo princípio de vocabulários nunca confundidos já formalizado
pela ADR-0022, seção "Estados conceituais", e reaplicado pela SPEC-021,
seção 5, e pela SPEC-022, seção 7):

- `requested`;
- `running`;
- `completed`;
- `failed`;
- `unavailable`;
- `cancelled`.

`completed`, `failed`, `unavailable` e `cancelled` são estados finais.
Estados finais nunca retornam a um estado operacional. Uma nova execução é
sempre uma nova `PreAnalysis` (seção 9.3), nunca uma transição de saída de
uma execução já finalizada.

### 5.1 `requested`

**Significado:** `owner`/`admin` solicitou explicitamente a execução; o
sistema está validando as condições de criação (seção 9.1, seção 9.3) e as
quatro condições de autorização de IA (seção 20) antes de decidir se aciona
o `AIGateway`.

**Quem pode alterar:** o sistema cria a execução neste estado e a transiciona
imediatamente, na mesma operação lógica, para `running` — no instante exato
em que o `AIGateway` é efetivamente acionado (seção 9.2) — ou diretamente
para `unavailable` (quando qualquer condição de autorização falha antes de
qualquer chamada externa, seção 5.5) — nunca observado como uma pausa
funcional persistida, mesmo princípio já usado pela SPEC-022 (seção 7.1)
para o papel transitório de `draft`.

**Pode ir para:** `running`; `unavailable`; `cancelled` (owner/admin cancela
antes de qualquer chamada externa ocorrer, caso a implementação permita essa
janela).

### 5.2 `running`

**Significado:** o `AIGateway` foi acionado; a execução está em andamento
(aguardando resposta do provider, validação de schema, ou qualquer etapa
intermediária da "Regra de execução" da SPEC-014).

**Quem pode alterar:** o sistema, ao receber o resultado do `AIGateway`
(sucesso ou falha técnica); `owner`/`admin` podem cancelar administrativamente
uma execução travada; o mecanismo de reconciliação (seção 4.4) pode marcar
como `failed` uma execução que excedeu o prazo operacional razoável sem
resposta.

**Pode ir para:** `completed`; `failed`; `cancelled`. Nenhuma `PreAnalysis`
permanece em `running` indefinidamente (seção 4.4).

### 5.3 `completed`

**Significado:** a execução concluiu com sucesso; `PreAnalysisResult` e seus
`PreAnalysisFinding` foram persistidos atomicamente junto com esta transição
(seção 9.4 — mesmo princípio de atomicidade já formalizado pela SPEC-022,
seção 15.1, para o cálculo do Perfil Comportamental). Estado final.

**Pode ir para:** nenhum estado (final). Uma nova execução é sempre uma nova
`PreAnalysis` (seção 9.3).

### 5.4 `failed`

**Significado:** a execução foi acionada (`AI Execution` existe), mas falhou
por motivo técnico normalizado (timeout, indisponibilidade, erro de rede,
resposta inválida — mesmos `error_category` canônicos da SPEC-014). Nenhum
`PreAnalysisResult` é criado. Estado final.

**Pode ir para:** nenhum estado (final). Uma nova tentativa exige nova
`PreAnalysis` (seção 9.3).

### 5.5 `unavailable`

**Significado:** a execução nunca chegou a acionar o `AIGateway`, porque
pelo menos uma das condições de autorização (as quatro da ADR-0016/ADR-0017,
mais a ausência de routing/provider/modelo/prompt válidos, SPEC-014) não foi
satisfeita. Diferente de `failed` (que pressupõe uma tentativa técnica real
ao provider), `unavailable` significa que a Feature simplesmente não está
disponível para aquela Organization/candidatura naquele momento. Estado
final.

**Pode ir para:** nenhum estado (final). Nova tentativa exige nova
`PreAnalysis`, criada a qualquer momento em que `owner`/`admin` solicitar
novamente — não há mecanismo de "notificação automática de disponibilidade"
nesta SPEC.

### 5.6 `cancelled`

**Significado:** encerramento administrativo explícito, com motivo
obrigatório. Somente `owner`/`admin` cancelam — nunca o sistema, nunca o
Candidate (que não é ator desta SPEC). Estado final.

**Pode ir para:** nenhum estado (final).

### 5.7 Resumo de transições permitidas

| De \ Para   | requested | running | completed | failed | unavailable | cancelled |
| ----------- | :-------: | :-----: | :-------: | :----: | :----------: | :-------: |
| requested   |     —     |   Sim   |    Não    |  Não   |     Sim      |    Sim    |
| running     |    Não    |    —    |    Sim    |  Sim   |     Não      |    Sim    |
| completed   |    Não    |   Não   |     —     |  Não   |     Não      |    Não    |
| failed      |    Não    |   Não   |    Não    |   —    |     Não      |    Não    |
| unavailable |    Não    |   Não   |    Não    |  Não   |      —       |    Não    |
| cancelled   |    Não    |   Não   |    Não    |  Não   |     Não      |     —     |

Nenhuma transição fora desta matriz é aceita. Em particular:
`completed → running`, `failed → running` e `unavailable → running` estão
sempre proibidas — nenhum estado final é reaberto; uma correção é sempre uma
nova `PreAnalysis` (seção 9.3).

## 6. Relação com `current_stage`

Fica confirmado, para a versão 0.1 desta SPEC: a Pré-Análise **não** cria
nenhum valor novo no enum `CandidateApplication.current_stage`
(SPEC-012/ADR-0014: `applied`, `screening`, `interview`, `assessment`,
`offer`, `completed`). A SPEC-012 não é alterada por esta SPEC.

## 7. Efeito sobre a `CandidateApplication`

A Pré-Análise nunca altera automaticamente, na `CandidateApplication`
associada:

- `application_status`;
- `current_stage`;
- finalização (`finalized_at`, `finalized_by_user_id`,
  `finalization_reason`);
- `rejected`;
- `hired`;
- score de contratação;
- ranking.

A conclusão de uma `PreAnalysis` (transição para `completed`, seção 5.3)
**apenas** produz um `PreAnalysisResult` disponível para consulta — ela
nunca dispara, por si só, nenhuma movimentação de pipeline, nenhuma
finalização e nenhuma decisão sobre a `CandidateApplication`. Mesmo
princípio já aplicado pela SPEC-021 (seção 7), pela SPEC-022 (seção 8) e
pela ADR-0015 à `Interview`.

## 8. Fluxo Principal

```text
CandidateApplication existente (SPEC-012)
↓
owner/admin decide solicitar Pré-Análise (decisão explícita — nunca
automática, seção 9.1)
↓
Sistema valida CandidateApplication ativa, Candidate ativo, consentimento
específico deste propósito concedido (seção 18), ausência de execução não
finalizada (seção 9.3), Organization ativa
↓
Sistema cria PreAnalysis (`requested`)
↓
Sistema valida as quatro condições de autorização de IA (ADR-0016, ADR-0017)
e a existência de routing/provider/modelo/prompt válidos (SPEC-014)
↓
[condições não satisfeitas]              [condições satisfeitas]
↓                                          ↓
`unavailable`                              `running` — Sistema aciona o
↓                                          AIGateway (seção 20)
fluxo da CandidateApplication              ↓
continua normalmente                       [sucesso]         [falha técnica]
                                            ↓                 ↓
                                            Sistema calcula    `failed`
                                            e persiste         ↓
                                            PreAnalysisResult  fluxo da
                                            atomicamente        CandidateApplication
                                            (seção 9.4)         continua normalmente
                                            ↓
                                            `completed`
                                            ↓
                                            aguarda consulta humana
                                            (owner/admin, SPEC-012)
```

Nenhuma etapa deste fluxo decide, aprova, reprova, pontua ou movimenta
automaticamente a candidatura (seção 15, seção 16).

## 9. Criação e Execução

### 9.1 Por que a criação é sempre um ato administrativo explícito

Mesmo raciocínio já formalizado pela SPEC-022 (seção 9.1), reaplicado aqui
com um motivo adicional: a Pré-Análise sintetiza múltiplas fontes
potencialmente sensíveis (evidências declaradas, resultado de instrumento
comportamental, avaliação humana) através de um provider externo de IA. Uma
criação automática e silenciosa, disparada por qualquer evento do sistema
(por exemplo, conclusão da Pré-Entrevista), enviaria dado de candidato a um
provider de IA sem uma decisão humana direta e contextual sobre aquela
candidatura específica — o que esta SPEC nunca permite. A criação de uma
`PreAnalysis` é **sempre** um ato explícito de `owner`/`admin`, nunca
`system_triggered`.

### 9.2 Desacoplamento e Fronteira Transacional

A chamada ao `AIGateway` (seção 20) é uma requisição de rede externa,
potencialmente demorada e sujeita a falha técnica — ela **nunca** pode fazer
parte de uma transação Postgres longa (uma transação de banco aberta não
deve nunca aguardar uma chamada de rede externa antes de confirmar ou
reverter). Fica formalizada, sem ambiguidade, a fronteira transacional desta
SPEC:

1. **Transação curta 1 — preparação:** valida as condições da seção 9.1 e
   da seção 9.3, valida as quatro condições de autorização de IA e a
   existência de routing/provider/modelo/prompt válidos (seção 20), resolve
   e registra as evidências (`PreAnalysisEvidence`, seção 10, seção 11) e
   cria/atualiza o registro de `PreAnalysis` em `requested`. Esta transação
   confirma (`commit`) **antes** de qualquer chamada ao `AIGateway`.
2. **Chamada externa, fora de transação:** o `AIGateway` é acionado com o
   payload já resolvido pela transação 1. Esta etapa não mantém nenhuma
   transação Postgres aberta enquanto aguarda a resposta do provider.
3. **Transação curta 2 — persistência do resultado:** ao receber a resposta
   do `AIGateway` (sucesso ou falha), uma segunda transação persiste, de
   forma atômica **entre si** — nunca atômica com a chamada externa da
   etapa 2, que já terminou —, `PreAnalysisResult`, todos os
   `PreAnalysisFinding`, e a transição de `PreAnalysis` para
   `completed`/`failed` (seção 9.4).

Esta SPEC não define a tecnologia usada entre as etapas 1 e 3 (chamada
síncrona imediata, fila, worker assíncrono) — mesmo princípio de
desacoplamento tecnológico já formalizado pela SPEC-021 (seção 8.2). O que
fica definido, em nível funcional, é apenas: uma falha ao acionar ou
concluir o `AIGateway` nunca afeta a `CandidateApplication` nem qualquer
outra entidade além da própria `PreAnalysis` (fail-safe, seção 20.2).

### 9.3 Condições para criar uma nova execução

Uma nova `PreAnalysis` só pode ser criada quando, simultaneamente:

- a `CandidateApplication` associada está `active` (SPEC-012, seção 5);
- o `Candidate` associado está `active` (SPEC-011, seção 5);
- existe um consentimento válido (`granted`) com
  `purpose = "ai_pre_analysis"` para o `Candidate` (seção 18);
- não existe, para a mesma `CandidateApplication`, nenhuma outra
  `PreAnalysis` em estado não final (`requested` ou `running`) — no máximo
  uma execução operacional por `CandidateApplication` a qualquer momento;
- a Organization está ativa (não arquivada, seção 28).

**Decisão definitiva desta revisão destrutiva (fecha a ambiguidade 40.4 da
v0.1):** cada `PreAnalysis` é **imutável e independente** a partir do
momento em que atinge um estado final. Não existe, nesta SPEC, nenhum
mecanismo de "reabertura" que reative, edite ou reinterprete uma execução
histórica — mesmo padrão de imutabilidade final já exigido por toda SPEC
anterior desta jornada (SPEC-012, SPEC-013, SPEC-021, SPEC-022). Uma nova
solicitação nunca "reabre" nada: ela é sempre uma **nova execução
funcional**, começando do zero (`requested`), sem herdar estado, evidência
ou resultado de nenhuma execução anterior.

A única relação entre uma nova execução e a anterior é a **referência
explícita e rastreável** `previous_attempt_id` (linhagem), nunca uma
dependência funcional ou uma cópia de dado. Diferente da SPEC-021 e da
SPEC-022, esta SPEC **não exige** uma autorização formal de "reabertura"
separada da própria solicitação, porque, aqui, os dois atos coincidem
estrutural e temporalmente: não há candidato respondendo entre eles, e toda
criação já é, por definição, um ato de `owner`/`admin` (seção 9.1). Isso é
uma escolha deliberada de desenho, registrada e justificada — não uma
omissão. Qualquer nova solicitação, mesmo imediatamente após uma
`PreAnalysis` anterior ter atingido `completed`, `failed`, `unavailable` ou
`cancelled`, é permitida diretamente, desde que as condições da seção 9.3
sejam satisfeitas, e é sempre registrada com `attempt_number` incrementado
e `previous_attempt_id` preenchido (seção 17).

### 9.4 Atomicidade

**Decisão definitiva:** a atomicidade exigida por esta SPEC refere-se
exclusivamente à **transação curta 2** definida na seção 9.2 (persistência
pós-resposta) — nunca a uma transação que abrangeria a chamada externa ao
`AIGateway`, o que é tecnicamente impossível e nunca exigido aqui.

Depois que o `AIGateway` retorna uma resposta de sucesso, a validação dessa
resposta contra o schema esperado (SPEC-014, seção "Structured Output"), a
persistência de `PreAnalysisResult` e de todos os `PreAnalysisFinding`, e a
transição de `PreAnalysis` para `completed` ocorrem em uma única transação
Postgres — mesmo princípio de atomicidade já formalizado pela SPEC-022
(seção 15.1) para o cálculo do Perfil Comportamental, aplicado aqui apenas à
etapa de persistência, nunca à chamada de rede que já a precedeu e já
terminou.

Se qualquer etapa dessa transação falhar (por exemplo, falha ao persistir um
`PreAnalisFinding`): a transação inteira é revertida, e a `PreAnalysis`
transiciona para `failed` (`error_category = unknown_error` ou categoria
mais específica quando disponível), nunca permanecendo em `running`
indefinidamente (seção 4.4) nem sendo marcada como `completed` sem
resultado correspondente persistido (seção 4.4, invariante estrutural).

### 9.5 Revalidação imediatamente antes do envio ao `AIGateway`

Entre a transação curta 1 (seção 9.2, onde as condições da seção 9.3 e as
quatro condições de autorização de IA são validadas) e o instante real de
envio do payload ao `AIGateway`, existe uma janela de tempo, ainda que
curta, em que o estado do sistema pode mudar — por exemplo, o consentimento
`purpose = "ai_pre_analysis"` ser revogado, o `Candidate` ser inativado, ou
`organization_feature_enabled` ser desabilitado por outro ator. Fica
formalizado: a implementação **deve** revalidar, imediatamente antes do
envio efetivo ao `AIGateway` (nunca apenas no momento da criação do
registro `requested`):

- que o consentimento `purpose = "ai_pre_analysis"` continua `granted`;
- que o `Candidate` continua `active`;
- que a `CandidateApplication` continua `active`;
- que a Organization continua ativa.

Se qualquer uma dessas condições falhar nessa revalidação, a `PreAnalysis`
transiciona para `unavailable` (nunca `running`), e nenhum payload chega a
ser efetivamente enviado ao provider. Este princípio é uma extensão direta
do padrão de revalidação dentro da transação já exigido pela SPEC-012
(seção "Concorrência de Pipeline") e pela SPEC-021 (seção 21), aplicado
aqui ao ponto específico de menor tolerância a corrida desta SPEC: o
instante imediatamente anterior ao envio de dado de candidato a um
provider externo.

### 9.6 Alteração de configuração durante execução em andamento

Uma vez que uma `PreAnalysis` transiciona para `running` (ou seja, o
`AIGateway` já foi efetivamente acionado, seção 9.2), alterar
`organization_feature_enabled`, `organization_ai_enabled`, routing ou
qualquer outra política de IA (ADR-0016 a ADR-0019, SPEC-014) **nunca**
cancela essa execução já em andamento — a mudança de política produz efeito
apenas sobre novas execuções solicitadas depois dela, nunca sobre uma que já
está em curso. Esta SPEC não define nem exige nenhum mecanismo de
cancelamento remoto de uma chamada já em andamento ao provider — mesmo
limite técnico já implícito em toda a infraestrutura de IA (nenhuma ADR de
0016 a 0019 define esse mecanismo).

## 10. Fontes e Evidências

### 10.1 Fontes autorizadas (`source_type` canônico)

A Pré-Análise pode consumir, exclusivamente:

- **`candidate_field`** — um subconjunto explícito e minimizado de campos do
  `Candidate` (SPEC-011): resumo profissional, experiências, escolaridade,
  certificações, idiomas, competências declaradas, disponibilidade.
  **Nunca** inclui: **`full_name`, `preferred_name`** (achado da revisão
  destrutiva — seção 10.1.1), e-mail (em qualquer formato), telefone,
  localização detalhada, salário pretendido, consentimento, observações
  internas — mesma lista de exclusão já usada pela SPEC-011 (seção 9) para
  o DTO de `member`, endurecida aqui como o padrão mínimo de minimização
  para envio a um provider externo, ainda que o ator desta SPEC seja
  `owner`/`admin`, não `member` (seção 19 detalha a justificativa completa);
- **`job_opening_version`** — o conteúdo já público/interno da versão
  publicada da Vaga usada pela candidatura (título, descrição,
  responsabilidades, requisitos, competências vinculadas) — nunca a faixa
  salarial nem instruções internas restritas;
- **`pre_interview_response`** — respostas **submetidas** (nunca rascunho,
  nunca de uma tentativa não finalizada) de uma `PreInterview` `completed`
  (SPEC-021) vinculada à mesma `CandidateApplication`, quando existir;
- **`behavioral_assessment_result`** — exclusivamente o resultado
  estruturado (`BehavioralAssessmentResultDimension.value` e
  `interpretation_text`) de uma `BehavioralAssessment` `completed`
  (SPEC-022) vinculada à mesma `CandidateApplication`, quando existir —
  **nunca** `BehavioralAssessmentResponse` (respostas brutas), seguindo
  exatamente o que a ADR-0023 já define para este cenário (seção "IA e
  Perfil Comportamental": a IA "resume resultados já produzidos por
  instrumento formal", nunca acessa a resposta bruta subjacente) e o que a
  SPEC-022 já antecipa (seção 23: a SPEC-023 consumirá
  `BehavioralAssessmentResult`, "nunca respostas brutas sem necessidade");
- **`blueprint_version`** — o subconjunto do Blueprint Organizacional
  relevante à Vaga (missão, valores, cultura, competências organizacionais,
  critérios do Cargo vinculado), sempre a partir da Blueprint Version
  `active` no momento da execução (ADR-0021, seção "Relacionamento com IA").

Nenhuma outra fonte, além destas cinco, é enviada ao `AIGateway` por esta
Feature. Esta lista é uma allow-list fechada, nunca uma lista de exemplo —
qualquer fonte fora dela exige revisão explícita desta SPEC (seção 10.1.1,
seção 23).

#### 10.1.1 Por que o nome do candidato nunca é enviado

**Achado de minimização excessiva de PII (revisão destrutiva, correção
crítica):** a versão 0.1 incluía `full_name`/`preferred_name` na lista de
campos autorizados. Esta revisão remove ambos, porque a Pré-Análise nunca
precisa saber **quem** é o candidato para produzir evidência sobre
competências, experiências ou aderência — a vinculação de identidade já
existe, no lado da plataforma, por meio de `candidate_application_id`
(nunca exposto ao provider como identificador de negócio, seção 25); a tela
que exibe o resultado ao Recrutador (fora do escopo desta SPEC) já sabe de
qual candidatura se trata e pode associar o `PreAnalysisResult` ao nome
correto sem que o nome jamais precise trafegar até um provider externo de
IA. Quando o texto do prompt precisar de um referente textual, deve usar um
rótulo genérico (por exemplo, "o candidato"), nunca o nome real.

#### 10.1.2 Limitação registrada: PII em campos de texto livre

Campos de texto livre incluídos na allow-list (`professional_summary`,
descrições de experiência, respostas de Pré-Entrevista) podem conter dado
pessoal inserido pelo próprio candidato dentro do texto — por exemplo, um
telefone ou e-mail alternativo digitado livremente em um resumo
profissional. **Esta SPEC não define, e a infraestrutura atual (ADR-0016 a
ADR-0019, SPEC-014) não oferece, nenhum mecanismo de detecção ou redação
automática de PII embutida em texto livre.** Esta é uma limitação
explicitamente registrada (seção 38), não resolvida por esta versão — não
inventada como solução por esta revisão, porque nenhuma infraestrutura de
suporte a isso existe hoje no repositório.

### 10.2 Decisão definitiva: `Interview Evaluation` nunca é fonte desta Feature

**Fecha a ambiguidade 40.1 da v0.1.** A ADR-0023 (seção "Análise Assistida
por IA") lista "competências declaradas **ou observadas**" como material
analisável pela IA. "Observadas" poderia, em tese, significar avaliação
humana de entrevistador (`Interview Evaluation`, SPEC-013). Esta revisão
decide, de forma definitiva e permanente — não apenas para esta versão —
que `interview_evaluation` **nunca** é um `source_type` autorizado desta
Feature, por dois motivos independentes e cada um suficiente por si só:

1. **Ordem da jornada (ADR-0023, seção "Jornada Completa"):** a Pré-Análise
   ocorre estruturalmente **antes** da Entrevista Humana na jornada
   descrita pela própria ADR-0023 (etapas 9-12 antes da etapa 14). Permitir
   que uma reanálise tardia consumisse avaliações de entrevista
   introduziria uma segunda finalidade totalmente diferente — comparar/
   corroborar avaliação humana já registrada — que pertence, por natureza,
   à composição multi-fonte do Dossiê Inteligente (SPEC-024, ainda não
   especificada), nunca a esta SPEC.
2. **Risco de circularidade (motivo determinante desta decisão):** enviar
   `Interview Evaluation` — um julgamento humano já registrado — de volta a
   um provider de IA para produzir uma "síntese" criaria um caminho indireto
   pelo qual a IA leria a opinião do próprio entrevistador e a devolveria
   reformulada como se fosse uma conclusão independente. Isso violaria
   diretamente o princípio de independência entre avaliação humana e IA já
   formalizado pela ADR-0016 (seção "Independência entre avaliação humana e
   IA": "resultados produzidos por humanos e resultados produzidos por IA
   pertencem a entidades distintas... um resultado de IA nunca substitui,
   sobrescreve ou se mistura com um resultado humano") e criaria a aparência
   de uma segunda validação independente que, na prática, apenas ecoaria a
   primeira — o mesmo risco já identificado pela seção 10.3 desta SPEC para
   `candidate_application_notes`, aqui ainda mais grave porque `Interview
   Evaluation` é uma avaliação formal e estruturada (SPEC-013), não uma nota
   informal.

Consumo de dado de `Interview`/`Interview Evaluation` pela jornada de IA,
se algum dia for necessário, pertence exclusivamente a uma revisão futura e
explícita da ADR-0023 e/ou a uma SPEC própria (por exemplo, um módulo de
composição do Dossiê Inteligente que, por desenho, já separa e rotula cada
fonte, SPEC-024) — nunca a esta SPEC de Pré-Análise.

### 10.3 Fontes explicitamente nunca utilizadas

A Pré-Análise **nunca** consome, em nenhuma circunstância:

- `candidate_application_notes` (SPEC-012) — notas internas são juízo
  humano subjetivo, nunca tratado como evidência objetiva de entrada para
  IA nesta SPEC; misturar avaliação humana registrada como nota com síntese
  de IA criaria um caminho indireto para a IA "aprender" a opinião do
  recrutador e devolvê-la disfarçada de análise nova — o oposto do
  princípio de independência entre avaliação humana e IA (ADR-0016, seção
  "Independência entre avaliação humana e IA");
- avaliações de outras `CandidateApplication` do mesmo `Candidate` (seção
  17: cada candidatura é isolada; a Pré-Análise nunca cruza candidaturas,
  mesmo do mesmo candidato);
- `salary_expectation`, endereço completo, `secondary_phone`,
  `work_authorization` ou qualquer outro dado fora da lista positiva da
  seção 10.1;
- currículo, documento ou arquivo (ainda não existem como campo aprovado do
  `Candidate`, SPEC-011, seção 2);
- dado de qualquer outra Organization, sob nenhuma circunstância (seção
  30).

### 10.4 Cross-candidatura: uma referência de evidência nunca pertence a outra `CandidateApplication`

**Achado de segurança (revisão destrutiva, correção crítica — vazamento
cross-tenant/cross-candidatura):** a validação de "mesma Organization"
(seção 25, seção 30) é necessária, mas **não é suficiente**. Um `owner`/
`admin` malicioso ou uma falha de implementação poderia, dentro da **mesma**
Organization, tentar informar um `pre_interview_id`, um
`behavioral_assessment_id` ou um `consent_id` válidos, pertencentes a
**outro** `Candidate`/`CandidateApplication` da mesma Organization —
cruzando indevidamente dados de duas pessoas candidatas distintas dentro do
mesmo tenant. Fica formalizado, sem exceção:

- `pre_interview_id`, quando informado, deve pertencer exatamente à mesma
  `candidate_application_id` da `PreAnalysis` sendo criada — nunca apenas à
  mesma Organization;
- `behavioral_assessment_id`, quando informado, deve pertencer exatamente à
  mesma `candidate_application_id` — mesma regra;
- `consent_id` deve pertencer exatamente ao mesmo `Candidate` da
  `CandidateApplication` sendo analisada — nunca a outro `Candidate`, mesmo
  da mesma Organization.

Uma tentativa que viole qualquer uma dessas três regras é recusada com
mensagem genérica (seção 25) e auditada como
`pre_analysis.cross_candidature_reference_denied` (seção 29.2) — nunca
apenas como uma variação de `cross_organization_access_denied`, porque o
vazamento aqui não é entre Organizations, é entre candidaturas dentro da
mesma Organization, um risco distinto que merece sinalização própria.

### 10.5 Ausência de fonte nunca bloqueia

Uma `CandidateApplication` sem Pré-Entrevista, sem Perfil Comportamental, ou
sem ambos, continua elegível para Pré-Análise — o resultado será
naturalmente mais limitado, mas a ausência de qualquer fonte opcional nunca
bloqueia a execução (mesmo princípio de fail-safe para ausência de
configuração opcional já usado pela SPEC-019, seção 8, para o Blueprint no
Portal Público). O único requisito mínimo de evidência é a existência da
própria `CandidateApplication` e do `Candidate` associado.

## 11. Proveniência

Toda `PreAnalysis` que chega a `completed` deve registrar, em
`PreAnalysisEvidence` (seção 4.5), exatamente quais fontes concretas
alimentaram aquela execução específica — nunca uma lista genérica do que
"poderia" ter sido usado, sempre o que **de fato** foi enviado ao prompt
(ADR-0019, seção "Prompt e dados sensíveis": "o Gateway aplica minimização
de dados; envia somente os dados necessários"). Isso permite, no mínimo:

- reconstruir exatamente o que embasou um resultado específico, para fins
  de auditoria e de consulta humana (ADR-0023, seção "Evidências e
  Rastreabilidade": "nenhuma conclusão apresentada ao Recrutador pode ficar
  sem origem identificável");
- que uma futura composição do Dossiê Inteligente (SPEC-024) saiba
  exatamente quais fontes uma `PreAnalysis` específica já cobriu, sem
  precisar reexecutar a mesma síntese.

## 12. Distinção entre Tipos de Origem

Esta SPEC aplica, sem nenhuma alteração, a taxonomia de cinco tipos já
formalizada pela ADR-0023 (seção "Evidências e Rastreabilidade") a todo
`PreAnalysisEvidence.origin_kind`:

- `declared_data` (**dado declarado**) — informação fornecida diretamente
  pelo candidato (por exemplo, campos do `Candidate`, respostas da
  Pré-Entrevista);
- `observed_evidence` (**evidência observada**) — informação registrada por
  um humano durante entrevista ou avaliação (nunca utilizada por esta
  Feature — decisão definitiva, seção 10.2 — mantida na taxonomia apenas
  por completude conceitual, para uso exclusivo de módulos futuros como o
  Dossiê Inteligente, SPEC-024);
- `instrument_result` (**resultado de instrumento**) — saída de um
  instrumento formal aplicado (`BehavioralAssessmentResult`, quando
  existir);
- `human_evaluation` (**avaliação humana**) — julgamento registrado por um
  entrevistador (nunca utilizada por esta Feature — decisão definitiva,
  seção 10.2);
- `ai_inference` (**inferência de IA**) — o próprio conteúdo produzido por
  esta SPEC (`PreAnalysisFinding`, `PreAnalysisResult.summary`), sempre
  classificado como tal, nunca apresentado com outra origem.

Estes cinco tipos **nunca** são apresentados de forma indistinta. Todo
`PreAnalysisFinding` deve referenciar explicitamente ao menos uma
`PreAnalysisEvidence`, e cada evidência carrega seu próprio `origin_kind` —
permitindo que a interface (fora do escopo desta SPEC) sempre exiba, junto
de cada achado, de onde ele veio. Um `PreAnalysisFinding` sem nenhuma
evidência rastreável associada nunca deve ser persistido nem exibido como
informação válida (ADR-0023: "uma conclusão sem origem identificável não
deve ser exibida como informação válida do Dossiê" — aplicado aqui,
antecipadamente, ao próprio resultado da Pré-Análise, não apenas ao futuro
Dossiê).

### 12.1 Um achado nunca pode aparentar ser fato quando é inferência

**Achado da revisão destrutiva:** referenciar uma evidência de origem
`declared_data` ou `instrument_result` em um `PreAnalysisFinding` **não
transforma** o achado em um dado factual verificado pelo sistema — o
achado continua sendo sempre `ai_inference` por construção (seção 4.6),
mesmo quando cita ou resume algo que o candidato declarou ou que um
instrumento formal produziu. Todo `PreAnalysisFinding.text` que restituir
conteúdo de uma evidência de outra origem deve fazê-lo em linguagem de
**atribuição explícita** — por exemplo, "segundo o candidato declarou...",
"o resultado do instrumento indica...", nunca como afirmação direta e
absoluta do próprio sistema (mesma regra de linguagem detalhada na seção
14). Isso impede que a leitura de um achado confunda "o que a fonte disse"
com "o que a IA concluiu a partir da fonte" — os dois nunca são a mesma
coisa, mesmo quando o texto do achado é uma citação quase literal da fonte.

## 13. Composição do Resultado

### 13.1 O que o resultado pode conter

Mesma lista de conteúdo já formalizada pela ADR-0023 (seção "Dossiê
Inteligente") para o Dossiê futuro, aplicada aqui, com antecedência, ao
escopo mais restrito desta SPEC (uma síntese sobre uma candidatura, nunca
uma composição de dossiê completo):

- resumo da candidatura, a partir das fontes disponíveis (seção 10);
- competências percebidas nas fontes analisadas;
- pontos fortes;
- pontos de atenção;
- possíveis riscos (sempre como evidência a validar, nunca como veredito);
- evidências de aderência ao Cargo/Vaga (nunca veredito de aderência —
  seção 14);
- evidências de aderência ao Blueprint (nunca veredito de aderência);
- possíveis perguntas sugeridas para validação em Entrevista Humana.

#### 13.1.1 Limitações e incertezas (`PreAnalysisResult.limitations`)

**Achado da revisão destrutiva:** um resultado que só lista o que foi
encontrado, sem nunca declarar o que **não** foi coberto, corre o risco de
ser lido pelo Recrutador como mais completo do que realmente é. Fica
formalizado que `PreAnalysisResult.limitations` (seção 4.6) é um campo
**obrigatório**, preenchido pelo próprio prompt desta Feature (schema de
output, seção 22), que deve declarar, no mínimo:

- quais das cinco fontes autorizadas (seção 10.1) estavam disponíveis e
  foram efetivamente usadas nesta execução, e quais não estavam (por
  exemplo, "nenhuma Pré-Entrevista concluída disponível para esta
  candidatura no momento da análise");
- quando aplicável, que a ausência de uma fonte não significa nenhuma
  conclusão sobre o candidato — apenas que aquela evidência específica não
  existia ou não pôde ser usada.

Este campo nunca é omitido, mesmo quando todas as fontes estavam
disponíveis (nesse caso, `limitations` declara explicitamente que nenhuma
fonte estava ausente).

### 13.2 Categorias canônicas de `PreAnalysisFinding.category`

- `evidencia_aderencia`;
- `evidencia_nao_encontrada`;
- `ponto_forte`;
- `ponto_atencao`;
- `possivel_risco`;
- `pergunta_sugerida_para_validacao`.

Nenhuma outra categoria é criada por esta SPEC. Em particular, **não existe**
categoria `score`, `ranking`, `recomendacao`, `veredito` ou `aprovacao` —
sua ausência é deliberada, não uma omissão (seção 15).

### 13.3 O que o resultado nunca contém

- score numérico único de candidato;
- ranking ou posição comparativa entre candidatos;
- percentual de "fit" ou de aderência;
- recomendação de aprovação, reprovação, contratação ou eliminação;
- qualquer campo apresentado como fato, decisão, aprovação, reprovação,
  score, ranking ou recomendação vinculante (ADR-0023, seção "Dossiê
  Inteligente": "nenhum campo... é apresentado como fato, decisão,
  aprovação, reprovação, score, ranking ou recomendação vinculante").

## 14. Linguagem e Aderência

Esta SPEC aplica, sem alteração, o princípio de linguagem não determinística
já formalizado pela ADR-0023 (seção "Aderência") a todo `summary` e a todo
`PreAnalysisFinding.text`.

Proibido, em qualquer texto produzido por esta Feature:

- "compatível" / "incompatível";
- "candidato ideal";
- "não serve";
- "aprovar" / "reprovar";
- "deve ser contratado" / "deve ser rejeitado";
- qualquer afirmação de diagnóstico clínico ou psicológico (herdado
  diretamente da restrição já aplicada pela SPEC-022, seção 14, quando o
  `PreAnalysisFinding` referenciar `instrument_result`).

Preferido:

- "evidências de aderência";
- "evidências não encontradas";
- "pontos para validação";
- "aderência potencial";
- "inconsistências";
- "pontos de atenção".

Esta é a mesma restrição de linguagem já usada pela SPEC-022 (seção 14) para
o Perfil Comportamental, e a mesma já registrada pela ADR-0023 para toda a
jornada — nenhuma exceção é criada por esta SPEC.

**Atribuição obrigatória (reforço direto da seção 12.1):** todo texto que
restituir conteúdo de uma evidência (`declared_data`, `instrument_result`)
deve usar linguagem de atribuição explícita à fonte ("segundo o candidato
declarou...", "o resultado do instrumento indica..."), nunca apresentar
esse conteúdo como fato verificado diretamente pelo sistema. Probabilidade
e incerteza nunca são convertidas em afirmação categórica: termos como
"provavelmente", "pode indicar", "sugere", quando aplicável ao grau real de
certeza do achado, são preferíveis a uma afirmação seca e definitiva.

## 15. Proibições Absolutas

Fica formalizado, sem exceção, aplicando diretamente a ADR-0023 (seção
"Papel da IA" e seção "Scores") ao escopo desta SPEC:

Esta SPEC **nunca**:

- cria score global de candidato;
- cria ranking automático entre candidatos;
- cria nota final universal ou percentual definitivo de "fit";
- cria matching definitivo entre candidato e vaga;
- classifica automaticamente aprovação ou reprovação;
- elimina candidatos;
- aprova candidatos;
- reprova candidatos;
- decide contratação;
- altera `Candidate`;
- altera `CandidateApplication` (além da própria criação/atualização de
  `PreAnalysis` e suas entidades filhas);
- altera `Interview` nem qualquer avaliação humana já registrada;
- altera automaticamente `application_status` ou `current_stage` (seção 7);
- declara condição psicológica;
- fabrica resultado de instrumento não aplicado (por exemplo, nunca produz
  um "resultado DISC" quando nenhum instrumento formal foi de fato
  aplicado — se não existir `BehavioralAssessmentResult`, a Pré-Análise
  simplesmente não possui essa fonte, nunca a inventa).

Estas restrições não são configuráveis por Organization, por Owner ou por
qualquer administrador — são invariantes arquiteturais desta SPEC.

## 16. Papel Estritamente Assistivo

A Pré-Análise participa da jornada exclusivamente como apoio informativo
(ADR-0023, seção "Papel da IA"):

- todo `PreAnalysisResult` carrega o `disclaimer` obrigatório (seção 4.6);
- o Recrutador (`owner`/`admin`) permanece sempre soberano sobre toda
  decisão da candidatura (ADR-0023, seção "Papel do Recrutador");
- o Recrutador pode ignorar integralmente qualquer `PreAnalysisFinding`, sem
  necessidade de justificativa técnica perante o sistema;
- nenhum campo desta SPEC é consumido automaticamente por nenhuma outra
  parte do sistema para produzir efeito de negócio — o resultado só produz
  efeito quando um humano autorizado o lê e decide agir sobre ele fora
  desta SPEC (por exemplo, movimentando manualmente o pipeline via
  SPEC-012).

## 17. Não Retroatividade e Isolamento entre Candidaturas

Uma `PreAnalysis` concluída nunca é reinterpretada automaticamente quando
qualquer uma de suas fontes muda depois:

- nova versão do Blueprint ativada (ADR-0022, seção "Não retroatividade");
- nova tentativa de Pré-Entrevista concluída (SPEC-021, seção 19);
- nova tentativa de Perfil Comportamental concluída (SPEC-022, seção 16);
- alteração de dados do `Candidate` (SPEC-011);
- nova versão publicada da Vaga (SPEC-010, ADR-0012).

Uma reanálise que deva refletir essas mudanças é sempre uma nova
`PreAnalysis` explícita (seção 9.3), nunca uma atualização silenciosa da
anterior — mesmo princípio já exigido pela ADR-0019 (seção "Modelo
utilizado"), pela ADR-0022 (seção "Não retroatividade") e pela SPEC-022
(seção 16).

Cada `PreAnalysis` e seu `PreAnalysisResult` pertencem exclusivamente à
`CandidateApplication` para a qual foram gerados. Nenhuma `PreAnalysis`
referencia, cita ou é influenciada por dado de outra `CandidateApplication`,
mesmo quando ambas pertencem ao mesmo `Candidate` na mesma Organization
(mesmo princípio de isolamento por candidatura já reforçado pela seção
10.3).

## 18. Consentimento

Mesmo padrão já formalizado pela SPEC-022 (seção 20) para o Perfil
Comportamental, aplicado aqui a uma finalidade distinta:

- o consentimento operacional geral do `Candidate` (SPEC-011, seção 8.14)
  **não** cobre, por si só, esta finalidade específica;
- o consentimento de Pré-Entrevista (quando existir) e o consentimento de
  Perfil Comportamental (`purpose = "behavioral_assessment"`, SPEC-022)
  **não** cobrem esta finalidade;
- esta SPEC reutiliza integralmente a estrutura já aprovada de
  `candidate_consents` (SPEC-011) — nenhuma tabela nova de consentimento é
  criada.

**Valor canônico declarado por esta SPEC:** `purpose = "ai_pre_analysis"` é
o identificador canônico desta finalidade, no mesmo padrão de nomenclatura
estável já usado pela SPEC-011/SPEC-012/SPEC-022 (`source =
public_application`, `source = public_portal`, `purpose =
"behavioral_assessment"`).

**Rastreabilidade ao consentimento:** toda `PreAnalysis`, ao ser criada,
registra `consent_id` (seção 4.4) apontando ao registro específico de
`candidate_consents` vigente e válido no momento da criação — mesmo
princípio de rastreabilidade exata já exigido pela SPEC-022 (seção 20) para
`BehavioralAssessment`, nunca apenas inferido implicitamente depois.
`consent_id` **deve** pertencer exatamente ao mesmo `Candidate` da
`CandidateApplication` sendo analisada — nunca a outro `Candidate`, mesmo da
mesma Organization (seção 10.4). As categorias/fontes efetivamente
utilizadas por cada execução ficam provadas, de forma independente do
consentimento, por `PreAnalysisEvidence` (seção 11): o consentimento prova
**autorização**; a evidência prova **o que foi de fato usado**. As duas
provas nunca se substituem.

### 18.1 Decisão definitiva sobre granularidade (fecha a ambiguidade 40.3 da v0.1)

Esta revisão decide manter um único consentimento amplo por finalidade —
`purpose = "ai_pre_analysis"` cobre qualquer combinação das cinco fontes
autorizadas (seção 10.1) usada por qualquer execução, sem exigir
consentimento separado por fonte individual (por exemplo, um consentimento
específico só para o uso da Pré-Entrevista, outro só para o Perfil
Comportamental). Motivos:

- mesmo padrão de granularidade já adotado, sem divergência, pela SPEC-022
  (seção 20) para `purpose = "behavioral_assessment"` — introduzir
  granularidade nova apenas para esta SPEC criaria inconsistência entre
  Features de IA irmãs da mesma jornada, sem necessidade concreta
  demonstrada;
- nenhum caso de uso real, hoje, exige que um candidato aceite a análise de
  sua Pré-Entrevista mas recuse a de seu Perfil Comportamental dentro da
  mesma execução — introduzir essa granularidade agora seria especular
  sobre uma necessidade ainda não comprovada;
- a rastreabilidade de **quais** fontes cada execução específica de fato
  usou já é garantida, independentemente da granularidade do consentimento,
  por `PreAnalysisEvidence` (seção 11, seção 18) — a ausência de
  granularidade no consentimento não reduz a rastreabilidade real.

Uma revisão futura pode introduzir granularidade por fonte, caso surja
necessidade jurídica ou de produto concreta — isso exigirá revisão explícita
desta SPEC, nunca uma inferência silenciosa.

### 18.2 Consentimento revogado durante execução em andamento

**Achado de concorrência (revisão destrutiva):** se o consentimento
`purpose = "ai_pre_analysis"` for revogado **depois** que uma `PreAnalysis`
já transicionou para `running` (ou seja, o `AIGateway` já foi acionado,
seção 9.2), essa revogação:

- **nunca** cancela retroativamente a chamada já em andamento — dado já
  enviado a um provider externo não pode ser "recolhido" (mesma limitação
  técnica reconhecida pela seção 9.6 para mudança de Feature Settings);
- bloqueia toda **nova** execução a partir desse momento (seção 9.3);
- **não invalida** o `PreAnalysisResult` que essa execução já em andamento
  produzir ao concluir — o resultado permanece como registro histórico
  válido, mesmo padrão de preservação de histórico já exigido pela SPEC-012
  (seção "Consentimento Invalido Apos a Criacao") e pela SPEC-022 (seção
  20) para o mesmo tipo de situação.

A revalidação de consentimento imediatamente antes do envio ao `AIGateway`
(seção 9.5) é o único ponto em que uma revogação recente ainda consegue
impedir uma execução — depois desse ponto, a execução já em curso segue até
seu desfecho natural (`completed` ou `failed`).

Comportamento exigido, para os demais cenários de bloqueio:

- consentimento **ausente**, `pending`, `revoked` ou `expired` para
  `purpose = "ai_pre_analysis"`: bloqueia a criação de nova `PreAnalysis`;
  a tentativa recusada nunca chega a acionar o `AIGateway` (seção 20);
- `Candidate` `inactive`: mesmo bloqueio já formalizado pela SPEC-021
  (seção 16.1) e pela SPEC-022 (seção 20), aplicado aqui sem divergência;
- `CandidateApplication` finalizada: bloqueia nova `PreAnalysis` — uma
  `PreAnalysis` já `running` no momento da finalização deve seguir até seu
  desfecho natural (mesmo princípio da revogação de consentimento acima),
  nunca sendo cancelada automaticamente pela finalização;
- em todos os casos: o histórico já concluído (`PreAnalysis` `completed`,
  `failed` ou `unavailable`, e seus resultados) **nunca é apagado nem
  invalidado retroativamente** — o bloqueio afeta apenas operações novas.

### 18.3 Opt-out de IA

Consistente com a ADR-0016 (IA nunca é requisito estrutural) e com a
ADR-0023 (seção "Opt-out de IA"): quando o consentimento de
`purpose = "ai_pre_analysis"` não existir ou não for concedido, a
`CandidateApplication` segue seu processo normal, integralmente, sem
nenhuma Pré-Análise — a ausência dela nunca é um bloqueio de nenhuma outra
etapa (Pré-Entrevista, Perfil Comportamental, Entrevista Humana, decisão
final).

## 19. Privacidade e Minimização

- a Pré-Análise é tratada com o mesmo rigor de acesso já exigido pela
  SPEC-011 (dados pessoais) e pela SPEC-022 (informação comportamental
  potencialmente sensível) — potencialmente mais sensível ainda, por
  combinar múltiplas fontes em uma única síntese;
- o `AIGateway` (seção 20) recebe somente os campos explicitamente listados
  na seção 10.1, nunca o objeto completo de `Candidate`,
  `CandidateApplication`, `PreInterview` ou `BehavioralAssessment` (mesmo
  princípio já exigido pela ADR-0019, seção "Prompt e dados sensíveis": "o
  Gateway nunca envia automaticamente o objeto completo... para um
  provider");
- `full_name` e `preferred_name` do `Candidate` **nunca** são enviados ao
  provider, em nenhuma circunstância (seção 10.1.1) — o vínculo de
  identidade permanece exclusivamente no lado da plataforma;
- resultado (`PreAnalysisResult`, `PreAnalysisFinding`) e evidências com
  `snapshot_value` (`PreAnalysisEvidence`, seção 4.5.1) visíveis apenas a
  `owner`/`admin` da Organization e, mediante motivo e auditoria, a
  Platform Admin de forma minimizada (seção 27);
- `member` recebe apenas existência e status (seção 24.2), nunca conteúdo;
- nenhuma resposta bruta de Pré-Entrevista, nenhuma resposta bruta de
  Perfil Comportamental e nenhum dado fora da lista positiva da seção 10.1
  é enviado ao provider;
- PII eventualmente embutida em campo de texto livre (seção 10.1.2) é uma
  limitação registrada, não uma garantia desta SPEC;
- auditoria nunca registra o conteúdo completo do resultado nem das
  evidências (seção 29);
- nenhum resultado, evidência ou existência de `PreAnalysis` é exposto por
  nenhuma rota pública — esta SPEC não possui nenhuma rota pública, em
  nenhuma circunstância (diferente da SPEC-020/SPEC-021/SPEC-022, que
  possuem fluxo público voltado ao candidato; esta SPEC nunca tem
  contraparte pública, porque o Candidate nunca é ator dela, seção 3, seção
  25).

## 20. Integração com o `AIGateway`

Toda execução desta Feature ocorre **exclusivamente** através do
`AIGateway` (ADR-0019, SPEC-014). Esta SPEC:

- **nunca** chama diretamente OpenAI, Anthropic, Gemini, Azure OpenAI,
  Ollama ou qualquer outro provider;
- **nunca** importa ou conhece SDK ou client concreto de nenhum provider
  (mesma restrição já formalizada pela SPEC-014, seção "AI Gateway -
  centralização obrigatória");
- respeita integralmente, sem exceção e sem redefinição, a ordem obrigatória
  de autorização já definida pela SPEC-014 (seção "Regra de execução"):
  1. `platform_ai_allowed = true`;
  2. `organization_ai_enabled = true`;
  3. `feature_available_on_platform = true` para o `feature_key` desta
     Feature (seção 20.1);
  4. `organization_feature_enabled = true` para o mesmo `feature_key`;
  5. routing válido (`AI Provider Routing Policy`) para o par
     Organization + `feature_key`;
  6. provider `configured` (ADR-0018);
  7. modelo ativo, permitido e compatível com a Feature;
  8. prompt `published`;
  9. resolução de segredo (nunca antes dos passos 1-8);
  10. montagem do payload minimizado (seção 19);
  11. execução do provider, sob timeout e rate limit já definidos pela
      SPEC-014;
  12. validação da resposta contra o schema de output esperado
      (`Structured Output`, seção 13);
  13. registro de `AI Execution` (telemetria e auditoria);
  14. retorno de um DTO tipado a esta SPEC.

Se qualquer uma das quatro primeiras condições falhar, a `PreAnalysis`
transiciona diretamente para `unavailable` (seção 5.5), sem que nenhuma
credencial seja resolvida e sem que nenhum dado de negócio seja enviado a
nenhum provider.

### 20.1 `feature_key` canônico

**Decisão definitiva desta revisão destrutiva (fecha a ambiguidade 40.2 da
v0.1):** o `feature_key` desta Feature é `candidate_pre_analysis` — um
identificador estável, definitivo e vinculante para qualquer implementação
futura desta SPEC, nunca mais tratado como proposta em aberto. Nenhuma
implementação futura usa outro valor.

Esta decisão não conflita com a ADR-0017 (seção "Catálogo de
funcionalidades"): a ADR-0017 atribui a Platform Admin a prerrogativa de
**registrar/disponibilizar** entradas no `AI Feature Catalog`
(`feature_available_on_platform`) — um ato administrativo de plataforma —
nunca a prerrogativa de **nomear** o identificador de uma Feature já
definida por uma SPEC funcional aprovada. Mesmo padrão já usado por toda
SPEC anterior desta jornada para fixar identificadores canônicos estáveis
sem invadir competência administrativa: a SPEC-011 fixa os valores
canônicos de `source`; a SPEC-012 fixa `source = public_portal`; a SPEC-022
fixa `purpose = "behavioral_assessment"`. Platform Admin continua sendo
quem executa o ato de disponibilizar `candidate_pre_analysis` no catálogo
global (`feature_available_on_platform = true`) e quem decide
`fallback_allowed_on_platform` para ela — apenas o **nome** do identificador
já está fixado por esta SPEC, para que a implementação tenha uma identidade
estável desde o primeiro dia, sem depender de uma decisão administrativa
externa ao documento técnico.

### 20.2 Fail-safe

Falha, indisponibilidade ou desabilitação de qualquer camada da
infraestrutura de IA nunca bloqueia o fluxo humano da `CandidateApplication`
(ADR-0016; ADR-0019, seção "Fail-safe"; SPEC-014). Quando a Pré-Análise não
pode executar ou falha, a `CandidateApplication` segue seu processo
inteiramente normal — `owner`/`admin` avaliam manualmente, exatamente como
se a Feature não existisse.

### 20.3 Fallback, retry, timeout e rate limit

Esta SPEC **nunca reimplementa** lógica própria de retry, fallback, timeout
ou rate limit — toda essa responsabilidade pertence exclusivamente ao
`AIGateway`, já definida integralmente pela SPEC-014/ADR-0019. Esta SPEC
apenas reage ao resultado final que o `AIGateway` devolve (sucesso →
`completed`; falha técnica normalizada → `failed`; negação de política →
`unavailable`), nunca decide ela mesma se deve tentar novamente ou usar uma
rota alternativa.

**Decisão definitiva sobre custo e repetição (fecha a ambiguidade 40.5 da
v0.1):** esta SPEC **não define nenhum número máximo de execuções** por
`CandidateApplication` — nenhum limite arbitrário é inventado. O controle de
custo desta Feature é deliberadamente delegado, por inteiro, aos mecanismos
já existentes e genéricos da SPEC-014/ADR-0019, distinguindo três conceitos
que esta revisão nunca confunde entre si:

- **retry/fallback técnico** (interno ao `AIGateway`, seção 20.3): invisível
  a esta SPEC — do ponto de vista de `PreAnalysis`, uma execução é sempre
  uma única chamada lógica ao `AIGateway`, não importa quantas tentativas
  técnicas internas ele realize antes de responder;
- **idempotência da mesma solicitação** (seção 36): duplo clique ou retry de
  rede do mesmo pedido nunca cria uma segunda `PreAnalysis` — é a mesma
  execução, nunca uma nova;
- **nova execução funcional** (seção 9.3): uma decisão humana explícita e
  deliberada de `owner`/`admin` de pedir uma nova análise. Esta SPEC nunca
  limita numericamente quantas vezes essa decisão pode ser tomada; o
  controle de custo real já existe, sem necessidade de duplicação, em três
  camadas já aprovadas:
  1. o invariante de "no máximo uma execução não finalizada por
     `CandidateApplication`" (seção 9.3, seção 32) impede rajadas
     concorrentes;
  2. o rate limit de execução por Organization/Feature/provider/modelo já
     exigido pela SPEC-014 (seção "Rate Limit de Execução") se aplica
     integralmente a `candidate_pre_analysis`, sem necessidade de nenhuma
     política numérica nova nesta SPEC;
  3. cada nova execução é uma ação paga e visível: o custo técnico estimado
     de cada `AI Execution` (`estimated_cost`, SPEC-014, seção "Custo
     Tecnico") fica disponível a `owner`/`admin` pela telemetria já exigida
     pela SPEC-014, tornando o custo de repetição transparente ao
     Recrutador sem exigir um limite artificial desta SPEC.

Se, no futuro, a experiência real de uso demonstrar necessidade de um limite
de negócio específico para esta Feature, isso exige revisão explícita desta
SPEC — nunca uma invenção antecipada e arbitrária nesta revisão.

## 21. `error_category`

`PreAnalysis.error_category`, quando preenchido, usa exclusivamente os
valores canônicos já definidos pela SPEC-014 (seção "AI Execution") — esta
SPEC não cria uma lista paralela:

`authentication_error`, `quota_exceeded`, `rate_limited`, `timeout`,
`provider_unavailable`, `network_error`, `invalid_response`,
`configuration_error`, `policy_denied`, `content_blocked`, `unknown_error`.

Uma `PreAnalysis` `unavailable` (seção 5.5) sempre registra
`error_category = configuration_error` ou `error_category = policy_denied`,
conforme a causa exata (SPEC-014, seção "Regras de `error_category`") —
nunca uma categoria que sugira tentativa técnica real ao provider, porque
nenhuma ocorreu.

## 22. Structured Output

Sempre que o provider e o modelo suportarem, o `AIGateway` retorna resposta
estruturada validada contra um schema de output esperado (SPEC-014, seção
"Structured Output"). Esta SPEC exige que o schema de output do
`prompt_key` desta Feature (a ser definido pelo Prompt Registry, Platform
Admin) produza, no mínimo, um formato mapeável diretamente para
`PreAnalysisResult` + lista de `PreAnalysisFinding` — nunca texto livre não
estruturado. Uma resposta que não valide contra esse schema é rejeitada
pelo `AIGateway` antes de chegar a esta SPEC (SPEC-014: "rejeita respostas
incompatíveis com o schema, sem repassá-las adiante como se fossem
válidas") e é tratada como `failed` com `error_category = invalid_response`.

## 23. Prompt Injection e Conteúdo Não Confiável

Todo conteúdo vindo de `Candidate`, `PreInterviewResponse`,
`BehavioralAssessmentResult` ou descrição de `Job Opening` é sempre tratado
como conteúdo não confiável quando incorporado ao prompt desta Feature —
mesma regra já formalizada pela ADR-0019 (seção "Prompt Injection e conteúdo
não confiável") e pela `CONSTITUICAO_DO_PROJETO.md`/`AGENTS.md`: currículos e
respostas são dados, nunca instruções.

### 23.1 Invariantes obrigatórios (revisão destrutiva)

Fica formalizado, sem exceção, o conjunto de invariantes que esta SPEC exige
do desenho do prompt desta Feature (Prompt Registry, ADR-0019, SPEC-014) —
esta SPEC não implementa esses invariantes tecnicamente, mas exige que a
implementação futura os respeite:

- **conteúdo de evidência nunca é instrução:** todo texto vindo das fontes
  da seção 10.1 (`candidate_field`, `job_opening_version`,
  `pre_interview_response`, `behavioral_assessment_result`,
  `blueprint_version`) é transmitido ao modelo exclusivamente como dado de
  entrada estruturado, nunca concatenado ou interpolado dentro da instrução
  de sistema/desenvolvedor do prompt — mesma separação entre instrução e
  dado já exigida pela ADR-0019 (seção "Prompt Injection e conteúdo não
  confiável": "instruções e dados são mantidos separados na montagem do
  request");
- **conteúdo de evidência nunca escolhe provider, modelo ou prompt:** a
  resolução de routing (`AI Provider Routing Policy`), do modelo e da
  versão do prompt ocorre inteiramente antes de qualquer evidência ser lida
  (SPEC-014, seção "Regra de execução", passos 5-9) — nenhum texto de
  candidato, por mais persuasivo que seja, pode influenciar essa escolha,
  porque ela já está decidida quando o conteúdo é incorporado;
- **conteúdo de evidência nunca amplia a lista de fontes:** a allow-list da
  seção 10.1 é resolvida inteiramente pelo servidor, antes da chamada ao
  `AIGateway` (transação curta 1, seção 9.2) — um texto de candidato que
  contenha algo como "considere também minhas outras candidaturas" ou
  "leia minhas notas internas" nunca resulta em nenhuma fonte adicional
  sendo lida; esta Feature não possui nenhum mecanismo de busca dinâmica de
  dado a partir do conteúdo do prompt;
- **nenhum tool/function calling:** esta Feature não expõe, nem usa,
  nenhuma capacidade de chamada de ferramenta ao modelo — mesma restrição
  já formalizada pela SPEC-014 (seção "Segurança": "nenhum tool/function
  calling irrestrito existe nesta primeira arquitetura"). O modelo nunca
  pode, por meio de conteúdo de evidência, solicitar execução de código,
  consulta a banco de dados ou qualquer ação fora da geração de texto/
  estrutura de saída;
- **saída sempre validada contra schema fechado:** mesmo que uma tentativa
  de injeção convença o modelo a tentar produzir um campo fora do schema
  esperado (por exemplo, um campo de "score" ou "recomendação" que não
  existe em `PreAnalysisFinding`, seção 13.2), a validação de Structured
  Output do `AIGateway` (seção 22, SPEC-014) rejeita a resposta inteira
  antes que ela chegue a esta SPEC — o schema fechado é, por construção,
  uma barreira contra saída fora do formato esperado, mesmo quando a
  tentativa de manipulação parte do conteúdo da evidência.

### 23.2 Limitação registrada, não solução inventada

Esta SPEC **não define, e a infraestrutura atual (ADR-0016 a ADR-0019,
SPEC-014) não oferece**, nenhum classificador ou mecanismo de detecção
ativa de conteúdo malicioso/injeção dentro do texto de uma evidência antes
de seu envio — a mitigação descrita nesta seção é inteiramente estrutural
(separação dado/instrução, resolução de fontes fixada antes da leitura de
conteúdo, ausência de ferramentas, validação de schema de saída), nunca
baseada em inspeção de conteúdo. Esta é uma limitação explicitamente
registrada (seção 38), consistente com o que a ADR-0019 já reconhece como
limite da arquitetura atual, não uma lacuna inventada ou escondida por esta
revisão.

## 24. Permissões

Todas as ações funcionais de `owner`, `admin` e `member` exigem User ativo,
Membership ativo, Organization ativa e role autorizada (mesmo padrão de
toda SPEC anterior).

| Ação | Platform Admin | owner | admin | member |
| --- | :---: | :---: | :---: | :---: |
| Solicitar Pré-Análise (`requested`) | Não | Sim | Sim | Não |
| Consultar existência e status (DTO restrito) | Não | Sim | Sim | Restr. |
| Consultar resultado completo (`PreAnalysisResult`/`PreAnalysisFinding`) | Não | Sim | Sim | Não |
| Consultar evidências (`PreAnalysisEvidence`) | Não | Sim | Sim | Não |
| Cancelar execução em andamento | Não | Sim | Sim | Não |
| Solicitar nova execução (reanálise) | Não | Sim | Sim | Não |
| Consultar histórico/eventos | Não | Sim | Sim | Não |
| Administrar catálogo/routing/prompt/modelo desta Feature (ADR-0016 a ADR-0019, SPEC-014) | Sim | Não¹ | Não | Não |
| Leitura administrativa auditada com motivo | Sim | Não | Não | Não |

¹ `owner` administra `organization_ai_enabled`, `organization_feature_enabled`
para esta Feature, e routing/provider/modelo dentro da própria Organization —
já definido integralmente pela SPEC-014 (seção "Permissões"), não redefinido
aqui.

### 24.1 Candidate

O Candidate **não possui nenhuma ação** nesta SPEC (seção 3). Ele nunca
acessa, visualiza ou influencia diretamente uma `PreAnalysis` — mesmo a
respeito da própria candidatura. Isso não é uma restrição de acesso a um
dado que de outra forma lhe pertenceria: é uma consequência direta de a
Pré-Análise nunca ser uma etapa voltada ao candidato.

### 24.2 Member

`member` visualiza somente:

- `id` da `PreAnalysis`;
- `status`.

Mesma minimização rigorosa já adotada pela SPEC-022 (seção 25.2), pelo
mesmo motivo: síntese de IA sobre múltiplas fontes potencialmente sensíveis
exige, no mínimo, o mesmo rigor já aplicado ao Perfil Comportamental.
`member` nunca visualiza: `summary`, `PreAnalysisFinding`, evidências,
`error_category`, motivo de cancelamento, eventos, `blueprint_version_id`,
`ai_execution_id`, ou qualquer outro campo fora da lista acima.

### 24.3 Platform Admin (SuperAdmin)

- administra exclusivamente a infraestrutura de IA já definida pela
  ADR-0016 a ADR-0019 e pela SPEC-014 (catálogo da Feature, Model Registry,
  Prompt Registry, disponibilidade por Organization) — nunca o conteúdo
  funcional de uma `PreAnalysis` específica;
- nunca solicita, cancela ou administra uma `PreAnalysis` como operação
  funcional;
- realiza apenas leitura administrativa excepcional, com motivo obrigatório
  e auditoria obrigatória, retornando dados minimizados por padrão (nunca o
  `summary`/`PreAnalysisFinding` completos, salvo necessidade estritamente
  justificada e registrada — mesmo padrão de toda SPEC anterior).

**Achado de permissão (revisão destrutiva):** administrar a infraestrutura
de IA consumida por esta Feature (Model Registry, Prompt Registry, catálogo
da Feature) **nunca** concede, automaticamente, acesso ao conteúdo funcional
de nenhuma `PreAnalysis` específica de nenhuma Organization — são
autoridades completamente distintas, mesmo quando exercidas pela mesma
pessoa (Platform Admin). Configurar qual modelo ou prompt uma Feature usa
não é o mesmo que ler o resultado de uma execução concreta contendo dado de
candidato; a segunda ação exige sempre a leitura administrativa explícita e
auditada descrita acima, nunca decorre implicitamente da primeira.

### 24.4 Nenhum vazamento indireto para `member`

**Achado de permissão (revisão destrutiva):** esta SPEC nunca adiciona
nenhum campo relacionado a `PreAnalysis` (existência, status, contagem de
execuções, ou qualquer derivado) ao DTO de `CandidateApplication` já
definido pela SPEC-012 — o único ponto de leitura de `member` sobre esta
Feature é a consulta direta e já minimizada da seção 24.2 (`id` + `status`).
Nenhum evento de auditoria, nenhuma rota secundária e nenhum campo agregado
em outra entidade pode revelar a `member`, indiretamente, o conteúdo do
`summary`, de um `PreAnalysisFinding` ou de qualquer `PreAnalysisEvidence` —
mesma garantia de minimização estrita já registrada na seção 19.

## 25. Segurança

- nunca chamar provider diretamente (seção 20);
- nunca criar score, ranking, matching ou decisão automática (seção 15);
- validar no servidor: `organizationId`, `candidateApplicationId`,
  `preAnalysisId`, `preAnalysisResultId`, `preAnalysisFindingId`,
  `preAnalysisEvidenceId`, `jobOpeningId`, `preInterviewId`,
  `behavioralAssessmentId`, `consentId`;
- validar Organization comum entre `CandidateApplication`, `Job Opening`,
  `PreInterview` (quando referenciada), `BehavioralAssessment` (quando
  referenciada) e a `PreAnalysis`;
- **validar, além da Organization comum, que `preInterviewId` e
  `behavioralAssessmentId`, quando informados, pertencem exatamente à
  mesma `candidateApplicationId`, e que `consentId` pertence exatamente ao
  mesmo `Candidate` — nunca apenas à mesma Organization (seção 10.4,
  achado de segurança da revisão destrutiva)**;
- validar Candidate ativo e consentimento operacional válido para
  `purpose = "ai_pre_analysis"` antes de qualquer criação (seção 18), com
  revalidação obrigatória imediatamente antes do envio ao `AIGateway`
  (seção 9.5);
- bloquear execução cruzando Organizations — toda `PreAnalysis` deriva a
  Organization exclusivamente da `CandidateApplication`, nunca de um
  `organizationId` enviado pelo cliente (mesmo princípio da ADR-0020);
- bloquear manipulação de IDs — identificador enviado pelo cliente nunca
  prova acesso;
- mensagens de erro para acesso cruzado devem ser genéricas, sem revelar a
  existência de execução, resultado ou candidatura em outra Organization;
- proteger dados pessoais do Candidate no resultado, com o mesmo rigor já
  exigido pela SPEC-011;
- aplicar minimização de dados para `member` e Platform Admin (seção 24.2,
  seção 24.3);
- nunca registrar dados pessoais completos em logs;
- nunca registrar tokens, headers, senhas, connection strings, segredos ou
  credenciais de provider;
- nunca registrar prompt completo nem resposta completa do provider em log,
  auditoria ou telemetria (mesma restrição já exigida pela SPEC-014/
  ADR-0019 para toda `AI Execution`);
- usar queries parametrizadas;
- proteger contra mass assignment: `organization_id`, `status`,
  `attempt_number`, `previous_attempt_id`, `ai_execution_id`, autoria e
  timestamps são sempre definidos pelo servidor, nunca aceitos como valor
  livre enviado pelo cliente;
- tratar todo conteúdo vindo de `Candidate`, `PreInterviewResponse` ou
  `BehavioralAssessmentResult` como dado, nunca como instrução (seção 23).

## 26. Acesso

Esta SPEC **não possui rota pública** — diferente da SPEC-020, SPEC-021 e
SPEC-022, que precisam de um mecanismo de acesso do Candidate sem
autenticação (token opaco, seção 25.1 daquelas SPECs). Como o Candidate
nunca é ator desta SPEC (seção 3, seção 24.1), toda operação exige User
ativo, Membership ativo e role autorizada (`owner`/`admin`), exatamente como
qualquer operação administrativa comum de `CandidateApplication` (SPEC-012).

## 27. Leitura Administrativa (Platform Admin)

Segue exatamente o mesmo padrão já formalizado por toda SPEC anterior
(SPEC-011, seção 9; SPEC-012, seção 12; SPEC-013, seção "Platform Admin";
SPEC-021, seção 24.4; SPEC-022, seção 27): motivo obrigatório, auditoria
obrigatória, escopo mínimo necessário, dados minimizados por padrão (nunca
`summary`/`PreAnalysisFinding` completos, salvo necessidade estritamente
justificada e registrada).

## 28. Organization Arquivada

Quando a Organization estiver `archived`:

- nenhuma nova `PreAnalysis` é criada;
- nenhuma `PreAnalysis` existente pode ser cancelada operacionalmente por
  `owner`/`admin` (a Organization arquivada já bloqueia toda operação
  funcional de `owner`/`admin`, mesmo padrão de SPEC-011 a SPEC-022);
- dados existentes permanecem preservados;
- Platform Admin consulta somente administrativamente, com motivo e
  auditoria.

## 29. Auditoria

### 29.1 Timeline de domínio × auditoria geral

Mesma separação já formalizada pela SPEC-022 (seção 29.1): `PreAnalysisEvent`
é a linha do tempo funcional da execução (consultável por `owner`/`admin`
dentro do contexto da `CandidateApplication`); a auditoria geral
(`audit_events` ou equivalente) é o registro de segurança transversal da
plataforma. Ambas nunca armazenam o conteúdo completo do resultado nem das
evidências.

### 29.2 Eventos obrigatórios

- `pre_analysis.requested`;
- `pre_analysis.running`;
- `pre_analysis.completed`;
- `pre_analysis.failed`;
- `pre_analysis.unavailable`;
- `pre_analysis.cancelled`;
- `pre_analysis.reanalysis_requested` (nova tentativa, seção 9.3);
- `pre_analysis.administrative_read`;
- `pre_analysis.permission_denied`;
- `pre_analysis.cross_organization_access_denied`;
- `pre_analysis.cross_candidature_reference_denied` (seção 10.4).

Estes nomes são conceituais e ilustrativos, seguindo o mesmo padrão já
usado por `pre_interview.*` (SPEC-021) e `behavioral_assessment.*`
(SPEC-022); a nomenclatura técnica final é responsabilidade da
implementação.

### 29.3 O que a auditoria deve registrar (lista positiva)

Para permitir investigação e reprodução histórica sem nunca expor segredo
ou PII desnecessária, cada evento crítico desta seção registra, no mínimo:

- `organization_id`;
- `candidate_application_id`;
- `pre_analysis_id` e `attempt_number`;
- `requested_by_user_id` (ator);
- `status` resultante da operação;
- `consent_id` referenciado (nunca o conteúdo do consentimento);
- `ai_execution_id`, `prompt_key`, `prompt_version`, quando aplicável —
  suficientes para localizar a trilha técnica completa em `AI Execution`
  (SPEC-014) sem duplicar tokens, custo ou telemetria já registrados lá;
- `error_category`, quando aplicável;
- lista de `source_type`/`origin_kind` efetivamente utilizados (nunca o
  conteúdo das evidências em si — seção 12);
- timestamps;
- motivo, quando aplicável (cancelamento, leitura administrativa).

### 29.4 O que a auditoria nunca registra

- `summary` completo;
- `PreAnalysisFinding.text` completo;
- `limitations` completo;
- conteúdo completo ou `snapshot_value` de qualquer evidência referenciada;
- perfil completo do Candidate;
- prompt completo, resposta completa do provider;
- tokens, headers, segredos, credenciais.

Auditoria crítica em criação e conclusão (sucesso ou falha) deve causar
rollback quando falhar — mesmo padrão já exigido por toda SPEC anterior.

O evento `pre_analysis.requested` sempre registra `requested_by_user_id`
(nunca nulo, nunca `system_triggered` — seção 9.1).

## 30. Multiempresa

Toda a Pré-Análise respeita integralmente o isolamento multiempresa já
formalizado pela ADR-0020: dados de `PreAnalysis`, `PreAnalysisResult`,
`PreAnalysisFinding` e `PreAnalysisEvidence` de uma Organization nunca são
lidos, gravados, referenciados ou afetados por outra Organization, em
nenhuma circunstância — inclusive quando a credencial de IA subjacente é
`platform_managed` (ADR-0018, seção "Platform Managed"; ADR-0020, seção
"Isolamento Multiempresa"). A Blueprint Version usada para contextualizar
qualquer execução é sempre a da própria Organization do candidato, nunca de
outra (ADR-0021, seção "Relacionamento com IA").

### 30.1 Checklist de tentativas de ataque cross-tenant (revisão destrutiva)

A revisão destrutiva desta versão avaliou explicitamente cada tentativa
abaixo, usando um `candidate_application_id` válido de uma Organization e
IDs igualmente válidos, porém pertencentes a **outra** Organization (ou, nos
itens marcados, à mesma Organization mas a outra candidatura — seção 10.4):

| Tentativa | Bloqueio |
| --- | --- |
| `candidate_application_id` de outra Organization | Recusado — validação de Organization comum (seção 25); mensagem genérica (seção 25) |
| `pre_interview_id` de outra Organization | Recusado — Organization comum (seção 25) |
| `pre_interview_id` de outro Candidate na **mesma** Organization | Recusado — mesma `candidate_application_id` exigida (seção 10.4) |
| `behavioral_assessment_id` de outra Organization | Recusado — Organization comum (seção 25) |
| `behavioral_assessment_id` de outro Candidate na **mesma** Organization | Recusado — mesma `candidate_application_id` exigida (seção 10.4) |
| `blueprint_version_id` de outra Organization | Recusado — resolvido sempre a partir da Organization do contexto validado, nunca aceito do cliente (seção 10.1, ADR-0021) |
| `consent_id` de outra Organization | Recusado — Organization comum (seção 25) |
| `consent_id` de outro Candidate na **mesma** Organization | Recusado — mesmo `Candidate` exigido (seção 10.4, seção 18) |
| `ai_execution_id` de outra Organization | Não aplicável como ataque — campo nunca aceito do cliente, sempre definido pelo servidor (seção 25, mass assignment) |
| `organization_id` informado diretamente no payload | Recusado — nunca aceito do cliente; sempre derivado da `CandidateApplication` resolvida no servidor (seção 25, ADR-0020) |

Nenhuma dessas tentativas revela, na mensagem de erro, se o registro
referenciado existe em outra Organization ou pertence a outra candidatura —
todas retornam a mesma resposta genérica de acesso negado (seção 25),
consistente com o princípio já estabelecido pela ADR-0013/ADR-0014
("mensagens de erro para acesso cruzado devem ser genéricas e não revelar a
existência de Candidate, Job Opening, versão ou candidatura em outra
Organization").

## 31. Integração

Esta SPEC integra exclusivamente com:

- `CandidateApplication` (SPEC-012) — vínculo estrutural exclusivo (seção
  4.4);
- `Candidate` (SPEC-011) — apenas para validar status, consentimento e ler
  o subconjunto de campos autorizado (seção 10.1);
- `Job Opening`/`Job Opening Version` (SPEC-010) — apenas para herdar
  referência e ler conteúdo da versão publicada (seção 10.1);
- `PreInterview` (SPEC-021) — apenas como fonte opcional de leitura (seção
  10.1); nenhuma alteração é feita a essa entidade;
- `BehavioralAssessment`/`BehavioralAssessmentResult` (SPEC-022) — apenas
  como fonte opcional de leitura (seção 10.1); nenhuma alteração é feita a
  essas entidades;
- Blueprint Version (SPEC-018, ADR-0022) — apenas como contexto opcional de
  leitura (seção 10.1, seção 12);
- infraestrutura de IA completa (ADR-0016 a ADR-0019, SPEC-014) — como
  Feature consumidora do `AIGateway`, nunca redefinindo nenhuma de suas
  regras (seção 20).

Esta SPEC nunca integra diretamente com:

- `Interview` (SPEC-013) — etapa independente; ver seção 10.2 para a
  decisão definitiva de que `Interview Evaluation` nunca é fonte desta
  Feature;
- SPEC-024 (Dossiê Inteligente) — ainda não especificada; esta SPEC apenas
  produz um resultado que **poderá**, no futuro, ser consumido por ela
  (seção 2).

## 32. Banco Conceitual

Sem schema físico, sem migration. Estruturas conceituais equivalentes a:

- `pre_analyses`;
- `pre_analysis_evidences`;
- `pre_analysis_results`;
- `pre_analysis_findings`;
- `pre_analysis_events`.

Regras conceituais:

- `organization_id` obrigatório em toda tabela;
- `candidate_application_id` obrigatório em `pre_analyses`, com Organization
  idêntica à da `CandidateApplication` referenciada;
- `ai_execution_id`, quando presente, referencia uma `AI Execution` (SPEC-014)
  da mesma Organization;
- `consent_id` obrigatório, referenciando um `candidate_consents` com
  `purpose = "ai_pre_analysis"` da mesma Organization **e do mesmo
  `Candidate`** da `CandidateApplication` (nunca apenas da mesma
  Organization — seção 10.4);
- `pre_interview_id`, quando presente, referencia uma `PreInterview` com a
  mesma `candidate_application_id` (nunca apenas a mesma Organization —
  seção 10.4);
- `behavioral_assessment_id`, quando presente, referencia uma
  `BehavioralAssessment` com a mesma `candidate_application_id` (mesma
  regra);
- `pre_analysis_evidences.snapshot_value` obrigatório quando
  `source_type = candidate_field`; nulo para os demais `source_type`
  (seção 4.5.1);
- `pre_analysis_results.limitations` obrigatório, nunca nulo, em todo
  `PreAnalysisResult` (seção 13.1.1);
- no máximo uma `PreAnalysis` em estado não final (`requested` ou `running`)
  por `CandidateApplication` a qualquer momento — restrição de persistência,
  nunca apenas de aplicação (mesmo padrão já exigido pela SPEC-012, RN-012,
  para `CandidateApplication` `active` única por par Candidate + Job
  Opening);
- `attempt_number` sequencial e único dentro da mesma
  `candidate_application_id`;
- `status` limitado aos valores canônicos da seção 5;
- `error_category`, quando presente, limitado aos valores canônicos já
  definidos pela SPEC-014;
- `origin_kind` de `pre_analysis_evidences` limitado aos cinco valores
  canônicos da seção 12;
- `category` de `pre_analysis_findings` limitado aos valores canônicos da
  seção 13.2;
- todo `pre_analysis_finding` referencia ao menos uma
  `pre_analysis_evidence` da mesma `pre_analysis_result`/`pre_analysis`
  (seção 12);
- toda `pre_analysis` em `status = completed` possui exatamente um
  `pre_analysis_result` correspondente; nenhuma `pre_analysis` em
  `completed` existe sem resultado (seção 4.4, seção 9.4);
- toda `pre_analysis` em `status = unavailable` possui `ai_execution_id`
  nulo (seção 4.4, seção 5.5);
- `previous_attempt_id`, quando presente, referencia sempre uma
  `pre_analysis` da mesma `candidate_application_id` (nunca de outra
  candidatura);
- ausência de cascade destrutivo;
- ausência de exclusão física, em qualquer fluxo normal;
- índices para Organization, `candidate_application_id`, `status` e
  `ai_execution_id`.

Esta SPEC não define SQL.

## 33. API Conceitual

| Operação | Finalidade |
| --- | --- |
| Solicitar Pré-Análise | `owner`/`admin` solicita execução para uma `CandidateApplication` (seção 9). |
| Consultar Pré-Análise (DTO por perfil) | Retornar dados permitidos conforme a role do solicitante (seção 24). |
| Consultar resultado | Retornar `PreAnalysisResult` + `PreAnalysisFinding`, quando `completed`. |
| Consultar evidências | Retornar `PreAnalysisEvidence` de uma execução, quando `completed`. |
| Cancelar execução | Encerrar administrativamente uma execução `requested`/`running`. |
| Consultar histórico/eventos | Retornar `PreAnalysisEvent` de todas as tentativas da candidatura. |
| Leitura administrativa auditada | Consulta excepcional por Platform Admin, com motivo. |

Esta SPEC não define URLs finais, contratos de request/response nem código
de rota.

## 34. Interface Conceitual

- **Botão/ação "Solicitar Pré-Análise"**, visível a `owner`/`admin` dentro
  da tela de uma `CandidateApplication` já existente (SPEC-012);
- indicador de status (`requested`, `running`, `completed`, `failed`,
  `unavailable`, `cancelled`);
- quando `completed`: exibição do `summary`, dos `PreAnalysisFinding`
  (agrupados por categoria, seção 13.2), sempre com indicação visível de
  origem de cada achado (seção 12) e do `disclaimer` fixo (seção 16);
- quando `failed`/`unavailable`: mensagem segura, sem detalhe técnico
  sensível, com opção de nova solicitação;
- histórico de tentativas anteriores da mesma candidatura, consultável lado
  a lado.

Esta SPEC não define layout, wireframe ou biblioteca de componentes
visuais.

## 35. Concorrência

Mesmos princípios já exigidos por toda SPEC anterior desta jornada — banco
de dados como autoridade final:

- duas solicitações simultâneas de Pré-Análise para a mesma
  `CandidateApplication`: apenas uma execução não finalizada deve
  prevalecer (seção 9.3, seção 32);
- cancelamento administrativo concorrendo com a conclusão da execução
  (`AIGateway` retornando sucesso/falha ao mesmo tempo): a primeira operação
  confirmada prevalece; a segunda recebe conflito seguro, nunca dois
  estados finais diferentes para a mesma `PreAnalysis`;
- persistência do resultado (seção 9.4) deve ser atômica e não pode ocorrer
  duas vezes para a mesma `PreAnalysis` mesmo sob reexecução técnica
  interna (por exemplo, reentrega de uma resposta assíncrona do
  `AIGateway`);
- **consentimento revogado ou `Candidate` inativado durante a preparação**
  (entre a transação curta 1 e o envio efetivo ao `AIGateway`): resolvido
  pela revalidação obrigatória imediatamente antes do envio (seção 9.5) —
  a execução é abortada como `unavailable` se qualquer condição falhar
  nesse ponto, nunca enviada com dado desatualizado sobre a autorização;
- **`organization_feature_enabled`/routing alterado enquanto uma execução já
  está `running`**: nunca cancela a execução já em andamento (seção 9.6) —
  afeta apenas execuções futuras;
- **fontes mudando entre a preparação e a chamada ao Gateway** (por exemplo,
  uma nova resposta de Pré-Entrevista sendo submetida no meio da janela): o
  conjunto de evidências (`PreAnalysisEvidence`) é resolvido uma única vez,
  dentro da transação curta 1 (seção 9.2), e nunca é reconsultado depois
  desse ponto — a execução usa exatamente o que foi congelado ali, mesmo
  que a fonte original mude um instante depois; qualquer mudança posterior
  só é capturada por uma nova execução futura (seção 9.3, seção 17).

## 36. Idempotência

- **solicitação:** duas chamadas de solicitação para o mesmo contexto, em
  rápida sucessão (por exemplo, duplo clique), nunca produzem duas
  `PreAnalysis` não finalizadas simultâneas para a mesma
  `CandidateApplication` — a segunda chamada, quando uma primeira já está
  `requested`/`running`, retorna o mesmo resultado da primeira, sem criar
  uma segunda execução;
- **conclusão:** o recebimento (potencialmente duplicado, por retry técnico
  interno) do mesmo resultado do `AIGateway` para a mesma `PreAnalysis`
  nunca persiste dois `PreAnalysisResult` para a mesma execução.

Esta SPEC não define mecanismo físico de idempotência (chave, cabeçalho) —
apenas exige o comportamento observável acima, mesmo princípio já usado pela
SPEC-021 (seção 22) e pela SPEC-022 (seção 18).

## 37. Custo

O custo técnico de cada execução já é registrado pela `AI Execution`
correspondente (`estimated_cost`, SPEC-014, seção "Custo Tecnico") — esta
SPEC não duplica esse registro, apenas o referencia por `ai_execution_id`
(seção 4.4). Esta SPEC não define preço comercial da Feature.

## 38. Limitações Conhecidas

- esta SPEC não implementa código, banco, migrations, rotas, APIs, testes
  ou dependências;
- não define o prompt concreto, seu schema de input/output exato, nem sua
  versão inicial — isso é responsabilidade do Prompt Registry (Platform
  Admin, ADR-0019, SPEC-014); o `feature_key` (`candidate_pre_analysis`,
  seção 20.1) já é definitivo, mas seu **registro efetivo** no `AI Feature
  Catalog` (`feature_available_on_platform = true`) continua sendo um ato
  administrativo de Platform Admin, ainda pendente até a implementação;
- não define política numérica de rate limit específica desta Feature além
  da já genérica da SPEC-014 (decisão deliberada — seção 20.3);
- não define o texto exato do `disclaimer` obrigatório, do texto de
  `limitations` nem dos textos de consentimento
  (`purpose = "ai_pre_analysis"`) — apenas exige sua existência funcional e
  seu conteúdo mínimo (seção 13.1.1, seção 16, seção 18);
- não implementa nenhum mecanismo de detecção/redação automática de PII
  embutida em texto livre (seção 10.1.2) — limitação estrutural registrada,
  não resolvida por esta versão;
- não implementa nenhum classificador de detecção de prompt injection
  (seção 23.2) — a mitigação é inteiramente estrutural/arquitetural;
- não define o mecanismo de reconciliação físico exato para execuções
  travadas em `running` (seção 4.4) — apenas a exigência funcional de que
  ele exista;
- não implementa o Dossiê Inteligente do Candidato (SPEC-024);
- não altera nenhuma SPEC, ADR, código, banco ou migration já existente.

## 39. Definição de Concluído

Para a implementação futura desta SPEC:

- SPEC aprovada antes do desenvolvimento — condição já satisfeita por esta
  revisão destrutiva, que resolveu de forma definitiva as cinco
  ambiguidades da v0.1 (seção 40);
- ADR-0016 a ADR-0019, ADR-0023, SPEC-014, SPEC-021 e SPEC-022 permanecem
  integralmente respeitadas, sem nenhuma redefinição por esta SPEC;
- critérios de aceite (seção 41) atendidos;
- testes obrigatórios (seção 42) implementados e passando;
- testes de segurança, isolamento multiempresa e fail-safe passando;
- nenhuma chamada direta a provider de IA existe em nenhum módulo de
  negócio — toda execução passa pelo `AIGateway`;
- nenhum score global, ranking, matching definitivo ou decisão automática
  é produzido, em nenhum teste;
- rollback de auditoria crítica verificado;
- migrations reproduzíveis quando houver banco;
- lint passando;
- formatação passando;
- build passando;
- documentação atualizada;
- auditoria revisada;
- nenhuma funcionalidade da SPEC-024 implementada antecipadamente;
- commit realizado.

## 40. Decisões da Revisão Destrutiva (v0.1 → v1.0)

Esta seção documenta como cada uma das cinco ambiguidades explicitamente
registradas pela v0.1 foi fechada por esta revisão destrutiva, e lista os
achados adicionais de segurança/domínio corrigidos no mesmo processo. Nenhum
item desta seção permanece em aberto como bloqueio de aprovação (seção 43).

### 40.1 `Interview Evaluation` como fonte — RESOLVIDA

**Decisão definitiva:** `interview_evaluation` nunca é `source_type`
autorizado desta Feature, em nenhuma versão, em nenhuma reanálise — decisão
permanente, não apenas "desta versão". Motivos completos: seção 10.2
(ordem da jornada da ADR-0023 + risco de circularidade entre avaliação
humana e IA, o motivo determinante). Consumo de dado de `Interview` pela
jornada de IA, se necessário no futuro, pertence exclusivamente a uma
revisão futura e explícita da ADR-0023 e/ou a uma SPEC própria (por
exemplo, SPEC-024), nunca a esta SPEC.

### 40.2 `feature_key` canônico — RESOLVIDA

**Decisão definitiva:** `feature_key = "candidate_pre_analysis"`,
estável e vinculante para qualquer implementação futura (seção 20.1). O
único ato administrativo ainda pendente é o **registro** desse identificador
já fixado no `AI Feature Catalog` por Platform Admin — uma execução
operacional prevista pela própria ADR-0017, nunca uma decisão de nomenclatura
em aberto.

### 40.3 Granularidade do consentimento — RESOLVIDA

**Decisão definitiva:** um único consentimento amplo por finalidade
(`purpose = "ai_pre_analysis"`), sem granularidade por fonte individual
nesta versão — mesmo padrão da SPEC-022, sem necessidade concreta
demonstrada para divergir (seção 18.1). A prova de **quais** fontes cada
execução específica usou continua garantida, independentemente da
granularidade do consentimento, por `PreAnalysisEvidence` (seção 11, seção
18).

### 40.4 Semântica de reexecução — RESOLVIDA

**Decisão definitiva:** cada `PreAnalysis` é imutável e independente a
partir do estado final; não existe "reabertura" de resultado histórico
nesta SPEC — apenas nova execução, com `previous_attempt_id` como relação
explícita de linhagem, nunca como dependência funcional (seção 9.3). A
ausência de uma camada de autorização de reabertura separada é uma escolha
de desenho justificada (os dois atos coincidem estrutural e temporalmente
nesta Feature), não uma omissão.

### 40.5 Política de repetição e custo — RESOLVIDA

**Decisão definitiva:** nenhum número máximo é definido por esta SPEC. O
controle de custo é delegado inteiramente aos mecanismos já existentes da
SPEC-014 (rate limit de execução por Organization/Feature/provider/modelo,
telemetria de custo por execução) e ao invariante de "no máximo uma
execução não finalizada por vez" já exigido pela seção 9.3 — sem inventar
um limite de negócio arbitrário (seção 20.3).

### 40.6 Achados adicionais corrigidos nesta revisão (fora das cinco ambiguidades originais)

Registrados aqui apenas como changelog de auditoria da revisão; o texto
normativo de cada um já está incorporado à seção correspondente:

- `PreAnalysisEvidence.snapshot_value` obrigatório para `candidate_field`
  (seção 4.5.1) — o `content_hash` isolado era insuficiente para reconstituir
  historicamente um campo de `Candidate` que não possui versionamento formal;
- remoção de `full_name`/`preferred_name` da allow-list de envio ao provider
  (seção 10.1.1) — minimização de PII desnecessária;
- validação de `pre_interview_id`/`behavioral_assessment_id`/`consent_id`
  contra a mesma `candidate_application_id`/`Candidate`, não apenas a mesma
  Organization (seção 10.4) — fechamento de um vazamento cross-candidatura
  dentro do mesmo tenant;
- fronteira transacional explícita entre a preparação (Postgres), a chamada
  externa ao `AIGateway` (fora de transação) e a persistência do resultado
  (Postgres) — seção 9.2, seção 9.4;
- revalidação obrigatória de consentimento/status imediatamente antes do
  envio ao `AIGateway`, fechando uma janela de corrida (seção 9.5);
- garantia de que nenhuma `PreAnalysis` permanece em `running`
  indefinidamente, com mecanismo de reconciliação exigido (seção 4.4);
- `PreAnalysisResult.limitations` obrigatório, evitando impressão de
  completude falsa (seção 13.1.1);
- regra de atribuição de linguagem para achados que citam evidência de
  outra origem, nunca apresentando inferência como fato (seção 12.1, seção
  14);
- invariantes explícitos de mitigação de prompt injection e registro
  explícito da limitação de detecção de conteúdo (seção 23);
- reforço de que administrar infraestrutura de IA nunca concede a Platform
  Admin acesso automático a conteúdo funcional, e de que `member` nunca
  recebe vazamento indireto por nenhuma outra rota (seção 24.3, seção
  24.4);
- checklist explícito de tentativas de ataque cross-tenant (seção 30.1).

## 41. Critérios de Aceite

- CA-001: Pré-Análise pertence exclusivamente a uma `CandidateApplication`.
- CA-002: Pré-Análise nunca é criada automaticamente; sempre exige
  `requested_by_user_id` preenchido.
- CA-003: Candidate nunca acessa, inicia ou visualiza uma Pré-Análise.
- CA-004: Nenhuma `PreAnalysis` é criada sem consentimento `granted` com
  `purpose = "ai_pre_analysis"`.
- CA-005: `PreAnalysis.consent_id` sempre referencia o consentimento
  específico vigente no momento da criação.
- CA-006: `Candidate` `inactive` bloqueia nova `PreAnalysis`.
- CA-007: `CandidateApplication` finalizada bloqueia nova `PreAnalysis`.
- CA-008: Existe no máximo uma `PreAnalysis` em estado não final por
  `CandidateApplication` a qualquer momento.
- CA-009: Nenhuma `PreAnalysis` acessa dado de outra Organization.
- CA-010: Nenhuma `PreAnalysis` referencia dado de outra
  `CandidateApplication`, mesmo do mesmo Candidate.
- CA-011: Toda execução respeita as quatro condições de autorização de IA
  (ADR-0016, ADR-0017) antes de qualquer chamada externa.
- CA-012: Quando qualquer uma das quatro condições falha, a `PreAnalysis`
  transiciona para `unavailable`, sem `ai_execution_id` preenchido.
- CA-013: Nenhum módulo desta Feature chama provider de IA diretamente —
  toda execução passa pelo `AIGateway`.
- CA-014: Toda `PreAnalysis` `completed` possui `ai_execution_id`
  preenchido.
- CA-015: Toda `PreAnalysis` `completed` possui exatamente um
  `PreAnalysisResult` correspondente, persistido atomicamente com a
  transição de estado.
- CA-016: Falha de cálculo/persistência do resultado nunca deixa a
  `PreAnalysis` em `completed` sem `PreAnalysisResult`.
- CA-017: Todo `PreAnalysisFinding` referencia ao menos uma
  `PreAnalysisEvidence`.
- CA-018: Nenhum `PreAnalysisFinding` é persistido ou exibido sem origem
  identificável.
- CA-019: `PreAnalysisEvidence.origin_kind` está sempre limitado aos cinco
  valores canônicos da seção 12.
- CA-020: Nenhuma evidência do tipo `human_evaluation` ou
  `observed_evidence` é utilizada — decisão definitiva e permanente (seção
  10.2, seção 40.1).
- CA-021: `candidate_application_notes` nunca é utilizada como fonte de
  entrada.
- CA-022: Respostas brutas de `BehavioralAssessment` nunca são enviadas ao
  `AIGateway` — apenas `BehavioralAssessmentResult`.
- CA-023: Apenas respostas **submetidas** (`submitted = true`) de uma
  `PreInterview` `completed` podem ser usadas como evidência.
- CA-024: Campos de `Candidate` fora da lista positiva da seção 10.1 nunca
  são enviados ao `AIGateway`.
- CA-025: Faixa salarial e instruções internas de `Job Opening Version`
  nunca são enviadas ao `AIGateway`.
- CA-026: Nenhum resultado contém score numérico único de candidato.
- CA-027: Nenhum resultado contém ranking ou posição comparativa entre
  candidatos.
- CA-028: Nenhum resultado contém percentual de "fit".
- CA-029: Nenhum resultado contém recomendação de aprovação, reprovação,
  contratação ou eliminação.
- CA-030: Nenhuma categoria de `PreAnalysisFinding` fora das seis
  canônicas da seção 13.2 é criada.
- CA-031: Nenhum texto de resultado usa linguagem determinística proibida
  (seção 14).
- CA-032: `PreAnalysisResult.disclaimer` está sempre preenchido.
- CA-033: Pré-Análise nunca altera `application_status`.
- CA-034: Pré-Análise nunca altera `current_stage`.
- CA-035: Pré-Análise nunca finaliza `CandidateApplication`.
- CA-036: Pré-Análise nunca altera `Candidate`.
- CA-037: Pré-Análise nunca altera `Interview` nem avaliação humana
  existente.
- CA-038: Falha, indisponibilidade ou desabilitação de IA nunca bloqueia o
  fluxo da `CandidateApplication`.
- CA-039: `CandidateApplication` sem Pré-Entrevista e sem Perfil
  Comportamental continua elegível para Pré-Análise.
- CA-040: Nova versão de Blueprint, nova tentativa de Pré-Entrevista ou
  nova tentativa de Perfil Comportamental nunca reinterpreta uma
  `PreAnalysis` já concluída.
- CA-041: Reanálise é sempre uma nova `PreAnalysis`, nunca uma edição da
  anterior.
- CA-042: `attempt_number` é sequencial e único por `CandidateApplication`.
- CA-043: `previous_attempt_id`, quando preenchido, referencia uma
  `PreAnalysis` anterior da mesma `CandidateApplication`.
- CA-044: `member` visualiza somente `id` e `status`.
- CA-045: `member` nunca visualiza `summary`, `PreAnalysisFinding` ou
  evidências.
- CA-046: Platform Admin nunca opera funcionalmente uma `PreAnalysis`.
- CA-047: Platform Admin consulta administrativamente somente com motivo e
  auditoria.
- CA-048: `owner` e `admin` possuem os mesmos poderes operacionais nesta
  SPEC.
- CA-049: `error_category`, quando preenchido, usa exclusivamente valores
  canônicos já definidos pela SPEC-014.
- CA-050: Organization arquivada bloqueia criação de nova `PreAnalysis`.
- CA-051: Auditoria nunca registra `summary`, `PreAnalysisFinding.text`,
  prompt completo, resposta completa do provider ou segredo.
- CA-052: Falha de auditoria crítica em criação ou conclusão causa
  rollback.
- CA-053: Acesso cruzado entre Organizations é recusado sem revelar
  existência de dado.
- CA-054: Mass assignment de `organization_id`, `status`, `attempt_number`,
  `ai_execution_id`, autoria e timestamps é bloqueado.
- CA-055: Duas solicitações simultâneas para a mesma `CandidateApplication`
  nunca produzem duas execuções não finalizadas.
- CA-056: Cancelamento concorrendo com conclusão nunca produz dois estados
  finais diferentes para a mesma `PreAnalysis`.
- CA-057: Persistência do resultado nunca ocorre duas vezes para a mesma
  `PreAnalysis`.
- CA-058: Não existe exclusão física de `PreAnalysis`, resultado, achado,
  evidência ou evento.
- CA-059: Esta SPEC não define nem implementa nenhum aspecto do Dossiê
  Inteligente (SPEC-024).
- CA-060: Nenhuma tabela, rota, campo ou regra já aprovada por SPEC-009 a
  SPEC-022 é alterada por esta SPEC.
- CA-061: `full_name` e `preferred_name` do `Candidate` nunca são enviados
  ao `AIGateway` (seção 10.1.1).
- CA-062: Toda `PreAnalysisEvidence` com `source_type = candidate_field`
  possui `snapshot_value` preenchido (seção 4.5.1).
- CA-063: Nenhuma `PreAnalysisEvidence` com `source_type` diferente de
  `candidate_field` possui `snapshot_value` preenchido.
- CA-064: `pre_interview_id`, quando informado, pertence exatamente à mesma
  `candidate_application_id` da `PreAnalysis` (seção 10.4).
- CA-065: `behavioral_assessment_id`, quando informado, pertence exatamente
  à mesma `candidate_application_id` (seção 10.4).
- CA-066: `consent_id` pertence exatamente ao mesmo `Candidate` da
  `CandidateApplication` sendo analisada (seção 10.4, seção 18).
- CA-067: Tentativa de referenciar `pre_interview_id`,
  `behavioral_assessment_id` ou `consent_id` de outra candidatura da mesma
  Organization é recusada e gera
  `pre_analysis.cross_candidature_reference_denied`.
- CA-068: Nenhuma `PreAnalysis` permanece em `running` além do prazo
  operacional sem ser reconciliada para `failed` (seção 4.4).
- CA-069: `PreAnalysisResult.limitations` está sempre preenchido, mesmo
  quando todas as fontes estavam disponíveis (seção 13.1.1).
- CA-070: Todo `PreAnalysisFinding` que cita evidência de outra origem usa
  linguagem de atribuição explícita, nunca apresenta a evidência como fato
  verificado pelo próprio sistema (seção 12.1, seção 14).
- CA-071: A revalidação de consentimento, status do `Candidate`, status da
  `CandidateApplication` e status da Organization ocorre imediatamente
  antes do envio ao `AIGateway`, não apenas no momento da criação (seção
  9.5).
- CA-072: Revogação de consentimento durante uma execução `running` nunca
  invalida o `PreAnalysisResult` que essa execução já em andamento
  produzir (seção 18.2).
- CA-073: Alteração de `organization_feature_enabled`/routing durante uma
  execução `running` nunca cancela essa execução (seção 9.6).
- CA-074: A resolução de evidências ocorre uma única vez, na transação
  curta 1, e nunca é reconsultada depois desse ponto para a mesma execução
  (seção 9.2, seção 35).
- CA-075: Nenhuma transação Postgres permanece aberta durante a chamada de
  rede ao `AIGateway` (seção 9.2).
- CA-076: `feature_key = "candidate_pre_analysis"` é o único identificador
  usado por qualquer implementação desta SPEC (seção 20.1).
- CA-077: Nenhum limite numérico arbitrário de tentativas é implementado
  por esta SPEC; o controle de custo depende exclusivamente da
  infraestrutura já definida pela SPEC-014 (seção 20.3).
- CA-078: Conteúdo de evidência nunca altera o provider, modelo ou prompt
  selecionados para a execução (seção 23.1).
- CA-079: Conteúdo de evidência nunca resulta em leitura de fonte adicional
  além da allow-list já resolvida pelo servidor (seção 23.1).
- CA-080: Esta Feature nunca expõe nenhuma capacidade de tool/function
  calling ao modelo (seção 23.1).
- CA-081: Uma tentativa de resposta do modelo fora do schema esperado
  (por exemplo, contendo campo de score) é rejeitada pelo `AIGateway` antes
  de chegar a esta SPEC (seção 22, seção 23.1).
- CA-082: Administrar o catálogo/routing/modelo/prompt desta Feature nunca
  concede a Platform Admin acesso ao conteúdo funcional de nenhuma
  `PreAnalysis` (seção 24.3).
- CA-083: Nenhum campo relacionado a `PreAnalysis` é adicionado ao DTO de
  `CandidateApplication` já definido pela SPEC-012 (seção 24.4).
- CA-084: Auditoria registra `ai_execution_id`, `prompt_key`,
  `prompt_version`, `consent_id` e a lista de `source_type`/`origin_kind`
  usados, sem nunca registrar o conteúdo das evidências (seção 29.3).

## 42. Testes Obrigatórios

Quando esta SPEC for implementada, os testes devem comprovar, no mínimo:

### Criação e autorização

1. Criar `PreAnalysis` com `requested_by_user_id` preenchido.
2. Bloquear criação sem consentimento `purpose = "ai_pre_analysis"`.
3. Bloquear criação com consentimento `pending`.
4. Bloquear criação com consentimento `revoked`.
5. Bloquear criação com consentimento `expired`.
6. Bloquear criação com `Candidate` `inactive`.
7. Bloquear criação com `CandidateApplication` finalizada.
8. Bloquear segunda execução não finalizada concorrente para a mesma
   `CandidateApplication`.
9. Permitir nova execução após uma anterior atingir estado final.

### Autorização de IA (quatro condições)

10. Bloquear execução (`unavailable`) quando `platform_ai_allowed = false`.
11. Bloquear execução quando `organization_ai_enabled = false`.
12. Bloquear execução quando `feature_available_on_platform = false` para
    `candidate_pre_analysis`.
13. Bloquear execução quando `organization_feature_enabled = false`.
14. Garantir que nenhuma credencial é resolvida em nenhum dos quatro
    cenários acima.
15. Garantir que `ai_execution_id` permanece nulo quando `unavailable`.

### AIGateway e execução

16. Executar com routing, provider, modelo e prompt válidos.
17. Bloquear execução sem routing válido.
18. Bloquear execução com prompt não `published`.
19. Registrar `ai_execution_id` corretamente ao transicionar para
    `running`.
20. Simular falha técnica do provider (timeout, indisponibilidade) e
    verificar transição para `failed` com `error_category` correspondente.
21. Simular resposta incompatível com o schema esperado e verificar
    `error_category = invalid_response`.
22. Garantir que nenhum teste depende de provider real (mocks/fakes de
    Provider Adapter, mesmo padrão da SPEC-014).

### Resultado e evidências

23. Persistir `PreAnalysisResult` e `PreAnalysisFinding` atomicamente com a
    transição para `completed`.
24. Garantir que falha após resposta do provider reverte toda a transação
    (aplicação permanece em estado seguro, sem `completed` parcial).
25. Garantir que todo `PreAnalysisFinding` referencia ao menos uma
    `PreAnalysisEvidence`.
26. Bloquear persistência de `PreAnalysisFinding` sem evidência associada.
27. Garantir que `PreAnalysisEvidence.origin_kind` está sempre entre os
    cinco valores canônicos.
28. Garantir que nenhuma evidência do tipo `human_evaluation` ou
    `observed_evidence` é criada nesta versão.

### Fontes e minimização

29. Garantir que apenas os campos de `Candidate` da lista positiva são
    enviados ao `AIGateway`.
30. Garantir que `salary_expectation`, endereço completo e
    `secondary_phone` nunca são enviados.
31. Garantir que `candidate_application_notes` nunca é usada como fonte.
32. Garantir que respostas brutas de `BehavioralAssessment` nunca são
    enviadas — apenas `BehavioralAssessmentResult`.
33. Garantir que apenas respostas submetidas (`submitted = true`) de
    `PreInterview` `completed` são usadas.
34. Garantir que rascunhos de `PreInterviewResponse` nunca são usados.
35. Garantir que faixa salarial e instruções internas de `Job Opening
    Version` nunca são enviadas.
36. Garantir que dado de outra `CandidateApplication` do mesmo Candidate
    nunca é usado.
37. Garantir que `CandidateApplication` sem Pré-Entrevista nem Perfil
    Comportamental ainda pode gerar `PreAnalysis` `completed`.

### Proibições absolutas

38. Garantir que nenhum campo de score global de candidato é persistido.
39. Garantir que nenhum campo de ranking é persistido.
40. Garantir que nenhum campo de percentual de "fit" é persistido.
41. Garantir que nenhum campo de recomendação de aprovação/reprovação é
    persistido.
42. Garantir que nenhuma categoria de `PreAnalysisFinding` fora das seis
    canônicas é aceita.
43. Garantir que nenhum texto de resultado contém termos determinísticos
    proibidos (verificação de conteúdo em teste, quando aplicável à
    implementação).
44. Garantir que `PreAnalysisResult.disclaimer` está sempre preenchido.
45. Garantir que a Pré-Análise nunca altera `application_status`.
46. Garantir que a Pré-Análise nunca altera `current_stage`.
47. Garantir que a Pré-Análise nunca finaliza `CandidateApplication`.
48. Garantir que a Pré-Análise nunca altera `Candidate`.
49. Garantir que a Pré-Análise nunca altera `Interview` ou avaliação
    humana existente.

### Fail-safe

50. Garantir que falha de IA nunca bloqueia consulta, movimentação de
    pipeline ou finalização da `CandidateApplication`.
51. Garantir que desabilitar a Feature (`organization_feature_enabled =
    false`) não afeta `PreAnalysis` já `completed`.
52. Garantir que `CandidateApplication` continua operável integralmente
    quando toda `PreAnalysis` associada está `unavailable`/`failed`.

### Não retroatividade

53. Garantir que ativar uma nova Blueprint Version não altera uma
    `PreAnalysis` já `completed`.
54. Garantir que uma nova tentativa de Pré-Entrevista não altera uma
    `PreAnalysis` já `completed`.
55. Garantir que uma nova tentativa de Perfil Comportamental não altera
    uma `PreAnalysis` já `completed`.
56. Garantir que reanálise cria uma nova `PreAnalysis`, nunca sobrescreve a
    anterior.
57. Garantir que `attempt_number` é sequencial e `previous_attempt_id` é
    preenchido corretamente na reanálise.

### Permissões

58. Owner solicita Pré-Análise com sucesso.
59. Admin solicita Pré-Análise com sucesso.
60. Member é bloqueado ao tentar solicitar.
61. Member visualiza somente `id` e `status`.
62. Member nunca recebe `summary`, achados ou evidências.
63. Candidate não possui nenhuma rota de acesso a esta Feature.
64. Platform Admin é bloqueado ao tentar solicitar funcionalmente.
65. Platform Admin realiza leitura administrativa somente com motivo.
66. Platform Admin sem motivo é recusado.

### Multiempresa

67. Bloquear `PreAnalysis` referenciando `CandidateApplication` de outra
    Organization.
68. Bloquear referência a `PreInterview` ou `BehavioralAssessment` de
    outra Organization.
69. Mensagem de erro para acesso cruzado não revela existência do dado em
    outra Organization.
70. Garantir que a Blueprint Version usada é sempre da própria Organization
    do candidato.

### Concorrência e idempotência

71. Duas solicitações simultâneas para a mesma `CandidateApplication`
    resultam em apenas uma execução não finalizada.
72. Cancelamento concorrendo com conclusão: primeira operação confirmada
    prevalece, sem dois estados finais diferentes.
73. Reentrega duplicada do mesmo resultado técnico nunca cria dois
    `PreAnalysisResult` para a mesma `PreAnalysis`.

### Segurança e auditoria

74. Auditoria não registra `summary` nem `PreAnalysisFinding.text`
    completos.
75. Auditoria não registra prompt completo nem resposta completa do
    provider.
76. Auditoria não registra segredo, token, header ou credencial.
77. Rollback ocorre quando auditoria crítica falha na criação.
78. Rollback ocorre quando auditoria crítica falha na conclusão.
79. Mass assignment de `status`, `ai_execution_id` e `organization_id` é
    bloqueado.
80. Persistência de `PreAnalysis` e resultado permanece após recriar a
    aplicação.
81. Nenhuma exclusão física de `PreAnalysis`, resultado, achado, evidência
    ou evento é permitida.

### Organization arquivada

82. Bloquear criação de nova `PreAnalysis` quando a Organization está
    arquivada.
83. Dados existentes permanecem consultáveis apenas por canais
    autorizados quando a Organization está arquivada.

### Fora de escopo

84. Nenhuma tabela, rota ou serviço de Dossiê Inteligente (SPEC-024) é
    criado.
85. Nenhuma alteração é feita a nenhuma tabela ou regra de SPEC-009 a
    SPEC-022.

### Snapshot e provenance (revisão destrutiva)

86. Editar um campo do `Candidate` depois de uma execução `completed` e
    verificar que `PreAnalysisEvidence.snapshot_value` preserva o valor
    original efetivamente enviado.
87. Garantir que `content_hash` isolado nunca é usado como única prova para
    `source_type = candidate_field`.
88. Garantir que fontes já imutáveis (`job_opening_version`,
    `pre_interview_response`, `behavioral_assessment_result`,
    `blueprint_version`) nunca exigem `snapshot_value`.
89. Garantir que todo achado (`PreAnalysisFinding`) referencia
    exclusivamente evidências (`PreAnalysisEvidence`) da mesma execução.
90. Garantir que `PreAnalysisResult.limitations` está preenchido em toda
    execução `completed`, incluindo quando todas as fontes estavam
    disponíveis.
91. Garantir que um achado que cita `declared_data` ou `instrument_result`
    usa linguagem de atribuição, nunca apresenta a evidência como fato do
    sistema.

### Nome do candidato nunca enviado

92. Garantir que `full_name` e `preferred_name` nunca aparecem no payload
    efetivamente enviado ao `AIGateway`.
93. Garantir que o resultado ainda é produzido corretamente sem o nome do
    candidato no payload (a identidade é resolvida apenas na camada de
    apresentação, fora desta SPEC).

### Cross-candidatura (mesmo tenant, candidaturas diferentes)

94. Bloquear `pre_interview_id` pertencente a outra `CandidateApplication`
    da mesma Organization.
95. Bloquear `behavioral_assessment_id` pertencente a outra
    `CandidateApplication` da mesma Organization.
96. Bloquear `consent_id` pertencente a outro `Candidate` da mesma
    Organization.
97. Garantir que a tentativa acima gera
    `pre_analysis.cross_candidature_reference_denied` e mensagem genérica.

### Consentimento (revogação mid-flight e revalidação)

98. Revogar consentimento imediatamente antes do envio ao `AIGateway` e
    verificar que a execução transiciona para `unavailable`, nunca
    `running`.
99. Revogar consentimento depois que a execução já está `running` e
    verificar que o `PreAnalysisResult` produzido ao final permanece válido
    e consultável.
100. Verificar que a revogação acima bloqueia apenas novas execuções, nunca
     a que já estava em andamento.
101. Inativar o `Candidate` entre a criação (`requested`) e o envio ao
     `AIGateway`, verificando bloqueio na revalidação.

### Reexecução e imutabilidade

102. Verificar que uma nova execução nunca copia evidência, resultado ou
     achado de uma execução anterior.
103. Verificar que `previous_attempt_id` é sempre uma referência de
     linhagem, nunca uma dependência funcional (a nova execução funciona
     integralmente mesmo que a anterior seja consultada ou não).
104. Verificar que nenhuma execução anterior é editada, "reaberta" ou
     reinterpretada por uma nova execução.

### Fronteira transacional e reconciliação

105. Verificar que a transação de preparação (evidências + `requested`)
     confirma antes de qualquer chamada ao `AIGateway`.
106. Verificar que nenhuma transação Postgres aberta aguarda a resposta de
     rede do `AIGateway`.
107. Verificar que a persistência do resultado (transação 2) é atômica em
     relação a si mesma, independentemente da duração da chamada externa
     que a precedeu.
108. Simular uma `PreAnalysis` presa em `running` além do prazo operacional
     e verificar que o mecanismo de reconciliação a transiciona para
     `failed`.

### Alteração de configuração durante execução em andamento

109. Desabilitar `organization_feature_enabled` enquanto uma `PreAnalysis`
     está `running` e verificar que essa execução não é cancelada.
110. Verificar que a mudança acima bloqueia apenas novas execuções
     solicitadas depois dela.

### Custo e repetição

111. Verificar que esta SPEC não impõe nenhum limite numérico de tentativas
     além do invariante de uma execução não finalizada por vez.
112. Verificar que o rate limit de execução da SPEC-014
     (Organization/Feature/provider/modelo) é aplicado a
     `candidate_pre_analysis` sem necessidade de configuração adicional
     desta SPEC.
113. Verificar que o custo técnico estimado de cada execução fica
     disponível via `ai_execution_id` referenciado.

### Prompt injection

114. Simular conteúdo de evidência contendo instrução direcionada ao
     modelo (por exemplo, "ignore as instruções anteriores") e verificar
     que o comportamento da execução não muda.
115. Simular conteúdo de evidência tentando referenciar uma fonte fora da
     allow-list e verificar que nenhuma fonte adicional é lida.
116. Verificar que a Feature nunca invoca nenhuma capacidade de tool/
     function calling.
117. Simular uma resposta do modelo contendo um campo fora do schema
     esperado (por exemplo, um campo de score) e verificar que o
     `AIGateway` rejeita a resposta antes que ela chegue a esta SPEC.

### Permissões (achados adicionais)

118. Verificar que uma conta de Platform Admin com acesso ao Model
     Registry/Prompt Registry desta Feature não consegue, por si só, ler o
     `summary`/`PreAnalysisFinding` de nenhuma `PreAnalysis` sem leitura
     administrativa explícita e auditada.
119. Verificar que nenhum campo relacionado a `PreAnalysis` aparece no DTO
     de `CandidateApplication` consultado por `member` (SPEC-012).
120. Verificar que nenhum evento de auditoria consultável por `member`
     revela `summary`, achados ou evidências.

## 43. Conflitos e Ambiguidades Restantes (pós-revisão destrutiva)

**Conflitos críticos ou importantes:** nenhum identificado após esta
revisão. Todas as cinco ambiguidades registradas pela v0.1 foram fechadas
de forma definitiva (seção 40.1 a seção 40.5), e todos os achados adicionais
de segurança e de domínio levantados por esta revisão destrutiva foram
corrigidos diretamente no corpo desta SPEC (seção 40.6). Nenhuma ADR
(0001 a 0023), nenhuma SPEC (001 a 022) e nenhuma regra do
`BACKLOG.md`/`TEMPLATE_SPEC.md` foi contradita.

**Pendência administrativa não bloqueante:** o registro efetivo de
`feature_key = "candidate_pre_analysis"` no `AI Feature Catalog`
(`feature_available_on_platform`) continua sendo um ato de Platform Admin,
a ser executado no momento da implementação (ADR-0017) — o **nome** já está
definitivamente fixado por esta SPEC (seção 20.1); apenas a **execução**
administrativa do registro depende de Platform Admin, exatamente como
qualquer entrada nova do catálogo global.

**Dependência textual não bloqueante:** o conteúdo exato do prompt desta
Feature (`prompt_key`, template, schema de input/output) permanece,
propositalmente, fora do escopo desta SPEC (seção 2) — pertence ao Prompt
Registry, administrado por Platform Admin (ADR-0019, SPEC-014). Esta SPEC
já define, de forma vinculante, os requisitos funcionais mínimos que esse
prompt deve satisfazer (seção 13, seção 14, seção 22, seção 23), o que é
suficiente para que a implementação futura do prompt não exija reabrir este
documento.

**Escopo deliberadamente não resolvido nesta revisão:** o Dossiê
Inteligente do Candidato (SPEC-024) permanece inteiramente não especificado
— esta SPEC preserva, propositalmente, apenas a rastreabilidade necessária
(`PreAnalysisResult`, `PreAnalysisEvidence`) para que ele possa, no futuro,
consumir o resultado desta Feature como uma de suas fontes, sem exigir
nenhuma alteração retroativa nesta SPEC quando SPEC-024 for especificada.
