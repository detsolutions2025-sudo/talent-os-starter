# SPEC-024 - Dossiê Inteligente do Candidato

**Status:** Aprovada
**Versão:** 1.1
**Fase:** 21
**Responsável de negócio:** Thiago Sousa
**Última atualização:** 2026-08-13
**Dependências:** SPEC-011 - Candidatos (v1.2), SPEC-012 - Processo Seletivo (v1.1), SPEC-013 - Entrevistas, SPEC-014 - Infraestrutura de IA, SPEC-018 - Blueprint Organizacional / Implantação Guiada, SPEC-021 - Pré-Entrevista Estruturada, SPEC-022 - Perfil Comportamental, SPEC-023 - Pré-Análise Assistida por IA (v1.1), ADR-0013, ADR-0014, ADR-0015, ADR-0016, ADR-0017, ADR-0018, ADR-0019, ADR-0020, ADR-0021, ADR-0022, ADR-0023

**Nota de revisão (v1.0 — revisão destrutiva documental):** esta versão
incorpora a revisão adversarial completa da v0.1. Foram corrigidos os pontos
que impediam implementação segura sem alterar ADR, BACKLOG, banco, código,
testes ou outra SPEC: o Dossiê passa a persistir o conteúdo efetivamente
apresentado, não apenas referências; `CandidateDossierSource` deixa de ser uma
referência polimórfica sem integridade discutida e passa a exigir FKs tipadas
nullable com `CHECK` discriminado; a Blueprint Version deixa de ser a
`active` no momento da geração e passa a ser apenas a versão contextual já
congelada por candidatura/vaga ou por fontes finalizadas; a seleção de fontes
é determinística e inclui todas as fontes elegíveis confirmadas até o snapshot
transacional; a fronteira de snapshot foi ampliada; concorrência,
idempotência, consentimento, finalização de candidatura, PII e critérios de
aceite/testes foram reforçados. Nenhum conflito crítico ou importante
permanece aberto nesta versão.

**Nota de fechamento final (v1.1 — Fase 21):** esta revisão fecha as
ambiguidades normativas remanescentes sem implementar código, banco, migration,
ADR, backlog ou outra SPEC. Em caso de divergência com texto anterior desta
SPEC, prevalecem as regras explícitas desta revisão: `CandidateDossier` só é
persistido quando a geração conclui com sucesso; `generating` e `failed` não
são estados persistidos de `CandidateDossier`; falhas não consomem
`version_number` e são registradas apenas em auditoria; `pre_interview` e
`interview` são contêineres/contexto, não `source_type` substantivo; duplo
clique/retry exige idempotência por chave/fingerprint, distinta de serialização
por lock.

## 1. Objetivo

Definir funcionalmente o **Dossiê Inteligente do Candidato**: uma
**composição estruturada, rastreável e contextualizada** de informações já
existentes sobre uma `CandidateApplication` — nunca uma nova avaliação, um
novo instrumento, um novo score, um ranking, um matching definitivo, uma
decisão ou uma recomendação automática de contratação.

Esta SPEC formaliza exatamente o que a ADR-0023 (seção "Dossiê Inteligente")
descreve e deixa para SPEC futura: "o Dossiê Inteligente é uma composição
rastreável de fontes já existentes... nunca uma avaliação única, um veredito
ou uma nota consolidada." Esta é essa SPEC.

O Dossiê existe para ajudar o Recrutador (`owner`/`admin`, ADR-0020, seção
"Responsabilidades") a **compreender o conjunto de evidências e análises já
produzidas** sobre uma candidatura — nunca para substituir a leitura de cada
fonte original, nunca para substituir a Entrevista Humana (SPEC-013), e nunca
para substituir a decisão humana (SPEC-012).

A cadeia conceitual que esta SPEC respeita, sem exceção, é a mesma já
formalizada pela ADR-0023:

```text
Dados → Evidências → Instrumentos → Análises assistidas → Dossiê →
Revisão humana → Decisão humana
```

O Dossiê é a penúltima etapa dessa cadeia, nunca a última. Ele nunca produz,
por si só, a "Revisão humana" nem a "Decisão humana" — essas continuam sendo
atos exclusivamente humanos, fora do escopo desta SPEC (seção 16).

### 1.1 Princípio fundamental: o Dossiê nunca transforma inferência em fato

Toda informação apresentada pelo Dossiê preserva sua origem. Esta SPEC
reutiliza, sem redefinir, a taxonomia de proveniência de cinco valores já
consolidada pela ADR-0023 (seção "Evidências e Rastreabilidade") e já
aplicada integralmente pela SPEC-023 (seção 12):

- `declared_data` (**dado declarado**);
- `observed_evidence` (**evidência observada**);
- `instrument_result` (**resultado de instrumento**);
- `human_evaluation` (**avaliação humana**);
- `ai_inference` (**inferência de IA**).

`origin_kind` (a classificação de proveniência acima) e a fonte técnica
específica (`source_type`, seção 10.1) são conceitos distintos e nunca se
confundem, exatamente como a ADR-0023 já precisou ("nota de precisão
normativa") e a SPEC-023 já reafirmou (seção 12): `origin_kind` classifica a
natureza/proveniência conceitual da evidência; `source_type` identifica
precisamente de qual entidade técnica ela veio. Um nunca substitui o outro.

Esta SPEC não redefine, em nenhum ponto, a ADR-0023 nem a SPEC-023. Onde
reutiliza um conceito já formalizado por elas, ela referencia, nunca
reformula.

## 2. Fora do Escopo

Esta SPEC não define nem implementa:

- Inteligência Artificial nova — nenhum novo prompt, nenhuma nova chamada ao
  `AIGateway`, nenhum novo modelo, nenhuma nova síntese generativa (seção 13);
- score global de candidato, `fit_score`, `hiring_score`,
  `cultural_fit_score`, ranking, `rank`, matching, `compatibility`,
  `recommendation`, `recommendation_to_hire`, `approve`, `reject` ou
  `decision`, em qualquer camada — banco, tipos, DTO, UI, exportação ou IA
  (seção 14 — proibição absoluta);
- decisão de contratação, eliminação automática, aprovação, reprovação, ou
  qualquer efeito de RH decorrente diretamente do Dossiê (seção 16);
- alteração de `Candidate`, `CandidateApplication.current_stage`,
  `application_status`, `rejected`, `hired`, `cancelled`, `withdrawn`,
  `Interview` ou avaliação humana — o Dossiê nunca escreve em nenhuma dessas
  entidades (seção 7, seção 16);
- Pré-Entrevista Estruturada (SPEC-021), Perfil Comportamental (SPEC-022),
  Pré-Análise Assistida por IA (SPEC-023) e Entrevistas (SPEC-013) — já
  definidas integralmente por essas SPECs/ADR; esta SPEC apenas **consome**,
  como leitura, o que elas já produzem, sem alterar nenhuma entidade, estado,
  regra ou permissão delas;
- infraestrutura de IA em si (`AIGateway`, Provider Routing, Prompt
  Registry, Model Registry, Secret Management, `AI Execution`) — já definida
  integralmente pelas ADR-0016 a ADR-0019 e pela SPEC-014;
- Blueprint Organizacional e seu ciclo de vida — já definidos integralmente
  pela ADR-0021, ADR-0022 e SPEC-018; esta SPEC apenas referencia a
  Blueprint Version usada como contexto opcional (seção 36);
- exportação em PDF ou qualquer outro documento estático — fora do escopo da
  v1, salvo requisito normativo explícito, que não foi encontrado nesta
  revisão (seção 41);
- nova metodologia comportamental ou DISC — já fora de escopo da SPEC-022,
  reafirmado aqui;
- nova finalidade de consentimento além da já decidida na seção 21;
- confirmação de identidade, autenticação ou qualquer mecanismo de acesso do
  Candidate — o Candidate **nunca** é ator desta SPEC (seção 3, seção 24);
- implementar código, banco, migrations, rotas, APIs, testes ou
  dependências;
- excluir fisicamente qualquer dado;
- alterar qualquer SPEC ou ADR já aprovada.

Esses assuntos pertencem às SPECs/ADR já aprovadas que esta SPEC apenas
referencia, ou a revisões futuras explícitas desta própria SPEC.

## 3. Usuários Envolvidos

- **owner:** solicita a geração de uma nova versão do Dossiê para uma
  `CandidateApplication` específica, consulta qualquer versão já gerada,
  consulta o histórico de versões, consulta a proveniência de cada item.
- **admin:** possui, nesta versão, exatamente os mesmos poderes operacionais
  de `owner` sobre esta SPEC — mesma avaliação já explicitada pela SPEC-021
  (seção 24.1), pela SPEC-022 (seção 3.1) e pela SPEC-023 (seção 3),
  reaplicada aqui pelo mesmo motivo: não existe, nesta fase, nenhuma ação
  sobre o Dossiê com risco ou impacto equivalente ao que já justifica
  exclusividade de `owner` em outras SPECs (por exemplo, `hired`,
  SPEC-012).
- **member:** visualiza somente que um Dossiê existe e sua versão/status
  mais recentes, para candidaturas `active` que já pode visualizar
  (SPEC-012, seção 12) — nunca o conteúdo. Mesma minimização rigorosa já
  aplicada pela SPEC-022 (seção 25.2) e pela SPEC-023 (seção 24.2), pelo
  mesmo motivo: o Dossiê agrega múltiplas fontes potencialmente sensíveis,
  incluindo Perfil Comportamental e Pré-Análise, e nunca deve expor,
  indiretamente, o que essas SPECs já restringem a `member`.
- **Candidate:** **não é ator desta SPEC.** O Dossiê é, por definição, um
  insumo de apoio ao Recrutador (ADR-0023, seção "Papel do Recrutador"),
  nunca uma etapa voltada ao candidato. O Candidate é o **sujeito** do
  Dossiê, nunca seu **ator** nem seu **leitor** nesta versão (seção 24;
  decisão registrada na seção 48.3).
- **Platform Admin (SuperAdmin):** administra a infraestrutura de IA
  eventualmente consumida por fontes do Dossiê (já definida pela ADR-0016 a
  ADR-0019 e pela SPEC-014, não redefinida aqui); consulta
  administrativamente versões do Dossiê com motivo e auditoria, sem operar
  funcionalmente e sem receber o conteúdo completo por padrão (seção 27).

`Platform Admin` não é Role de Membership e não recebe permissões funcionais
de `owner`, `admin` ou `member` dentro da Organization (ADR-0003, ADR-0020).

## 4. Conceitos

### 4.1 Dossiê Inteligente do Candidato

O conceito funcional amplo desta SPEC: uma composição estruturada,
rastreável e versionada de informações já existentes de uma
`CandidateApplication`. Representado, na prática, pela entidade
`CandidateDossier` (seção 4.3) e pelas referências rastreáveis que a compõem
(`CandidateDossierSource`, seção 4.4).

O Dossiê:

- pertence exclusivamente à `CandidateApplication` — nunca ao `Candidate`
  principal, nunca à Organization isoladamente, nunca à Job Opening
  isoladamente, nunca ao Blueprint isoladamente (ADR-0023, seção "Dossiê
  Inteligente"; seção 5 desta SPEC);
- é informação de apoio, nunca decisão (seção 14, seção 16);
- não é obrigatório para nenhuma `CandidateApplication`;
- nunca é gerado automaticamente — é sempre um ato administrativo explícito
  de `owner`/`admin` (seção 9.1), mesmo padrão já formalizado pela SPEC-021
  (seção 9), pela SPEC-022 (seção 9.1) e pela SPEC-023 (seção 9.1);
- **nunca inventa evidência nova, nunca sintetiza com IA nova** — ele
  compõe exclusivamente o que outras fontes já produziram e persistiram
  (seção 13, decisão definitiva);
- não altera `current_stage`, `application_status`, finalização, `rejected`,
  `hired`, score de contratação ou ranking (seção 7).

### 4.2 Por que esta SPEC não reabre a discussão de IA

A SPEC-023 já formaliza a camada de análise assistida por IA
(`PreAnalysis`/`PreAnalysisResult`/`PreAnalysisFinding`). O Dossiê consome
esse resultado como uma de suas fontes possíveis, classificada como
`ai_inference` (seção 11) — ele nunca reexecuta, reinterpreta ou duplica a
Pré-Análise. Esta é uma decisão definitiva desta SPEC (seção 13): nenhuma
nova chamada de IA é criada aqui. Se, no futuro, uma necessidade concreta de
síntese assistida adicional específica do Dossiê for identificada, ela
exige revisão explícita desta SPEC, respeitando integralmente o `AIGateway`
(ADR-0019, SPEC-014) — nunca uma implementação silenciosa nesta versão.

### 4.3 `CandidateDossier`

A geração concreta de uma versão do Dossiê para uma `CandidateApplication`
específica — o registro materializado e imutável de um checkpoint de
composição (seção 9).

Campos conceituais mínimos:

- `id`;
- `organization_id`;
- `candidate_application_id`;
- `version_number` (sequencial dentro da mesma `CandidateApplication`,
  iniciando em 1 — seção 17; deliberadamente **não** chamado
  `attempt_number`, porque o Dossiê nunca "tenta" algo que pode falhar por
  motivo externo como IA: cada geração bem-sucedida é sempre uma versão
  plena, nunca uma tentativa recuperável, seção 6);
- `previous_version_id`, opcional (referência à versão imediatamente
  anterior da mesma `CandidateApplication`, quando existir — seção 17);
- `status` (seção 6; nesta versão, sempre `generated` para registros
  persistidos);
- `requested_by_user_id` (sempre preenchido — nunca nulo, nunca
  `system_triggered`, mesmo princípio já exigido pela SPEC-023, seção 9.1);
- `requested_at`;
- `completed_at`;
- `job_opening_id` e `job_opening_version_id`, herdados de forma imutável da
  `CandidateApplication` no momento da geração (mesmo princípio já usado
  pela SPEC-021, seção 4.3.1; SPEC-022, seção 4.8; SPEC-023, seção 4.4);
- `blueprint_version_id`, opcional (a Blueprint Version contextual já
  congelada pela `CandidateApplication`/`Job Opening Version`, quando tal
  referência existir; nunca a Blueprint Version apenas `active` no momento da
  geração — seção 36);
- `presented_snapshot`, obrigatório (conteúdo
  estruturado, minimizado e já composto exatamente como será apresentado ao
  `owner`/`admin`, incluindo seções, itens, rótulos de proveniência,
  limitações e ordenação canônica — seção 12);
- `snapshot_schema_version` (versão do contrato estrutural usado para
  interpretar `presented_snapshot`);
- `content_hash` (hash canônico de `presented_snapshot` + provenance +
  ordenação, para verificação de integridade — seção 10.5);
- timestamps.

Pertence exclusivamente à `CandidateApplication`. Ela:

- nunca pertence ao `Candidate` principal;
- nunca pertence à Job Opening nem à Job Opening Version — apenas herdadas
  por referência;
- nunca pertence ao Blueprint Organizacional — o Blueprint apenas
  contextualiza (ADR-0021, seção "Relacionamento com o Processo Seletivo");
- nunca pertence diretamente à Organization — o vínculo é sempre derivado da
  `CandidateApplication`.

**Invariantes estruturais:**

- **nunca existe `CandidateDossier` em `generated` sem pelo menos um
  `CandidateDossierSource` correspondente**, salvo o caso legítimo descrito
  na seção 9.4 (candidatura sem nenhuma fonte além de si própria, ainda
  assim válido, mas registrado como tal);
- **`CandidateDossier` nunca é editado após persistido** — uma
  correção é sempre uma nova versão (seção 17);
- **uma versão histórica de `CandidateDossier` deve ser reconstruível
  exatamente como foi apresentada ao recrutador** a partir de
  `presented_snapshot` e das linhas de provenance persistidas, sem reler
  entidades mutáveis nem recompor conteúdo a partir do estado atual das
  fontes;
- **`CandidateDossier` nunca referencia `AI Execution`** (SPEC-014) — porque
  esta SPEC nunca aciona o `AIGateway` diretamente; quando o Dossiê inclui
  conteúdo originado de IA, ele o faz por meio de `pre_analysis_result`/
  `pre_analysis_finding` como `source_type` (seção 10.1), nunca por vínculo
  direto a uma execução técnica de IA.

### 4.4 `CandidateDossierSource`

Registro rastreável de cada fonte concreta incluída em uma versão do
Dossiê. Cada linha preserva a referência tipada à fonte, a classificação de
proveniência e o snapshot normalizado do item efetivamente apresentado. O
Dossiê nunca cria uma síntese nova, mas o que ele apresenta fica materializado
para impedir retroatividade falsa.

Campos conceituais mínimos:

- `id`;
- `organization_id`;
- `candidate_dossier_id`;
- `source_type` (canônico — seção 10.1);
- FKs tipadas nullable, conforme a forma discriminada da fonte: `candidate_id`,
  `job_opening_version_id`, `blueprint_version_id`, `pre_interview_response_id`,
  `behavioral_assessment_result_id`, `pre_analysis_result_id`,
  `pre_analysis_finding_id`, `interview_response_id` e
  `interview_evaluation_id`; FKs de contexto como `pre_interview_id` e
  `interview_id` podem existir apenas para validar pertencimento e congelar
  metadados de resposta/avaliação, nunca como `source_type` próprio (seção 43);
- `field_name`, opcional (nome conceitual do campo consumido, quando a fonte
  não for uma entidade com `id` próprio — por exemplo,
  `professional_summary` do `Candidate`);
- `origin_kind` (a classificação de proveniência, entre os cinco valores
  canônicos da ADR-0023 — seção 11);
- `content_hash`, obrigatório (hash do valor apresentado, para
  verificação de integridade — mesmo princípio já usado pela `AI Execution`,
  ADR-0019, e pela SPEC-023, seção 4.5);
- `snapshot_value`, condicional (seção 10.4 — obrigatório exclusivamente
  para `source_type = candidate_field`; nulo para os demais);
- `presented_value_snapshot`, obrigatório para todo `source_type` exibido
  (valor minimizado e normalizado efetivamente usado no
  `presented_snapshot`; pode ser objeto estruturado, nunca segredo, nunca
  resposta bruta proibida);
- `presented_order` (ordenação canônica dentro da seção de apresentação);
- timestamps.

`CandidateDossierSource` não é uma tabela universal de referências
polimórficas. A implementação futura deve usar FKs tipadas nullable com
`CHECK` discriminado por `source_type`, garantindo que exatamente a FK
compatível esteja preenchida e que todas as demais estejam nulas. O hash
serve para integridade; nunca substitui o snapshot quando a reconstrução
histórica depende do conteúdo apresentado.

### 4.5 Ausência de entidade de "Seção" persistida

Esta SPEC **não** cria uma entidade física de "seção" ou "item de exibição"
do Dossiê (`CandidateDossierSection`/`CandidateDossierItem`). A estrutura
conceitual de apresentação (seção 12) é persistida como
`CandidateDossier.presented_snapshot` e validada contra
`snapshot_schema_version`; as fontes continuam rastreadas em
`CandidateDossierSource`. Isso evita tanto recomposição dinâmica em leitura
quanto uma proliferação prematura de tabelas de UI. Uma implementação futura
pode normalizar esse snapshot em tabelas adicionais somente se demonstrar
necessidade técnica real, sem mudar a fonte de verdade histórica.

### 4.6 Ausência de entidade de evento própria

Esta SPEC **não** cria uma entidade `CandidateDossierEvent`. Decisão
registrada e justificada na seção 31.

## 5. Vínculo de Domínio

O Dossiê pertence **exclusivamente** à `CandidateApplication`.

- **Nunca** ao `Candidate` principal — o cadastro global do candidato
  (ADR-0013) permanece livre de qualquer composição, versão ou histórico de
  Dossiê, exatamente como já é livre de etapa, score, ranking ou decisão
  (SPEC-012, RN-037).
- **Nunca** à Organization isoladamente — não existe "Dossiê da
  Organization"; todo Dossiê é sempre de uma candidatura específica.
- **Nunca** à Job Opening isoladamente — a Vaga é apenas referenciada, por
  herança da `CandidateApplication` (seção 4.3), nunca proprietária do
  Dossiê.
- **Nunca** ao Blueprint isoladamente — o Blueprint apenas contextualiza
  (ADR-0021, seção "Relacionamento com o Processo Seletivo"; seção 36 desta
  SPEC).

Uma mesma `CandidateApplication` pode possuir **múltiplas versões** de
Dossiê ao longo do tempo (seção 17), preservando não retroatividade — nunca
um Dossiê único e mutável por candidatura.

**Decisão (materializado, versionado, gerado sob demanda — fecha a
ambiguidade explicitamente levantada por esta tarefa):** o Dossiê é
**gerado sob demanda, materializado e versionado**. Ele **nunca** é
composto dinamicamente a cada leitura. Justificativa:

1. A ADR-0022 (seção "Não retroatividade") já exige, para todo conceito
   agregado desta arquitetura (Blueprint), que "uma nova versão... nunca
   altera automaticamente" decisões ou evidências já produzidas com base
   numa versão anterior. Um Dossiê recomposto dinamicamente a cada leitura
   violaria esse princípio: duas consultas à "mesma" versão, em momentos
   diferentes, poderiam mostrar conteúdo diferente sem que nenhuma nova
   versão tivesse sido explicitamente gerada — quebrando a possibilidade de
   auditar exatamente o que o Recrutador viu quando decidiu.
2. Toda entidade equivalente já aprovada nesta jornada
   (`PreInterview`/SPEC-021, `BehavioralAssessment`/SPEC-022,
   `PreAnalysis`/SPEC-023) já adota exatamente este padrão: execução
   concreta, materializada, com resultado imutável e histórico de versões
   — nunca composição dinâmica sem persistência. O Dossiê, sendo o
   consumidor final dessas três, seria inconsistente se adotasse um
   paradigma diferente delas.
3. Composição dinâmica pura (sem persistência) impediria correlacionar
   precisamente "o que o Recrutador consultou" com "o que ele decidiu"
   depois — quebra de rastreabilidade que a ADR-0023 (seção "Evidências e
   Rastreabilidade") exige de forma explícita.

Consultar uma versão já gerada é sempre uma leitura pura de linhas já
persistidas (`CandidateDossier` + `CandidateDossierSource`) — nunca uma
recomposição. Apenas o **ato de gerar** (seção 9) executa a composição.

## 6. Estado Canônico

Estado de `CandidateDossier`, exclusivo desta entidade — nunca reutilizado de
`CandidateApplication`, `PreInterview`, `BehavioralAssessment`, `PreAnalysis`
ou `Interview` (mesmo princípio de vocabulários nunca confundidos já
formalizado pela ADR-0022 e reaplicado por toda SPEC desta jornada):

- `generated`.

Nesta versão, `CandidateDossier` representa somente o registro materializado,
imutável e bem-sucedido de uma composição. Não existe `CandidateDossier`
persistido em andamento nem `CandidateDossier` persistido em falha. Uma nova
geração bem-sucedida é sempre um novo `CandidateDossier` (seção 17), nunca uma
transição de saída de uma versão já persistida.

### 6.1 Por que esta SPEC não usa `unavailable`

A SPEC-023 usa `unavailable` para representar que a Feature de IA nunca
chegou a acionar o `AIGateway` porque alguma das quatro condições de
autorização de IA (ADR-0016/ADR-0017) falhou. O Dossiê **nunca** aciona o
`AIGateway` (seção 4.2, seção 13) — logo, não existe, nesta SPEC, nenhuma
condição de disponibilidade de infraestrutura de IA que possa bloquear a
geração antes dela começar. A ausência de fontes (nenhuma Pré-Entrevista,
nenhum Perfil Comportamental etc.) nunca bloqueia a geração (seção 9.4) —
ela apenas resulta em um Dossiê mais limitado, nunca em um estado
"indisponível". Por isso, `unavailable` é deliberadamente omitido desta
SPEC — diferença de desenho justificada, não uma omissão.

### 6.2 Por que esta SPEC não usa `cancelled`

A SPEC-023 precisa de `cancelled` porque sua execução depende de uma
chamada de rede externa, potencialmente longa, que pode ficar `running` por
tempo suficiente para justificar uma interrupção administrativa explícita.
A geração do Dossiê **nunca** depende de nenhuma chamada externa (seção
4.2) — ela é uma composição local, síncrona, dentro de uma única transação
curta (seção 9.2), que sempre conclui rapidamente com sucesso ou falha. Não
existe, na prática, uma janela operacional relevante para um ato
administrativo de cancelamento. Por isso, `cancelled` é deliberadamente
omitido — mesma lógica de "não copiar estado por reflexo" já usada por esta
SPEC na seção 6.1.

### 6.3 `generated`

**Significado:** a geração concluiu com sucesso; o `CandidateDossier` e
todos os seus `CandidateDossierSource` foram persistidos atomicamente
(seção 9.3). Estado final, imutável.

**Pode ir para:** nenhum estado (final). Uma nova geração é sempre um novo
`CandidateDossier` (seção 17).

### 6.4 Falha sem registro parcial

Se ocorrer falha técnica durante validação, composição, cálculo de hash,
auditoria crítica ou persistência, a transação inteira é revertida. Nenhum
`CandidateDossier`, nenhum `CandidateDossierSource`, nenhum `version_number` e
nenhum `previous_version_id` parcial permanece gravado. A falha é registrada em
auditoria como `candidate_dossier.generation_failed`, sem conteúdo sensível
(seção 30), e uma nova tentativa posterior reexecuta a geração normalmente.

### 6.5 Resumo de transições permitidas

Não há matriz de transição persistida nesta versão. O único estado observável
em `candidate_dossiers.status` é `generated`. Antes do commit não existe linha
funcional de `CandidateDossier`; depois do commit a linha é imutável. Uma
correção é sempre um novo `CandidateDossier` (seção 17).

## 7. Relação com `current_stage` e Efeito sobre a `CandidateApplication`

Fica confirmado: o Dossiê **não** cria nenhum valor novo no enum
`CandidateApplication.current_stage` (SPEC-012/ADR-0014: `applied`,
`screening`, `interview`, `assessment`, `offer`, `completed`). A SPEC-012
não é alterada por esta SPEC.

O Dossiê nunca altera automaticamente, na `CandidateApplication` associada:

- `application_status`;
- `current_stage`;
- finalização (`finalized_at`, `finalized_by_user_id`,
  `finalization_reason`);
- `rejected`;
- `hired`;
- `withdrawn`;
- `cancelled`;
- score de contratação;
- ranking.

A geração de um `CandidateDossier` (transição para `generated`, seção 6.4)
**apenas** produz uma versão consultável para leitura humana — ela nunca
dispara, por si só, nenhuma movimentação de pipeline, nenhuma finalização e
nenhuma decisão sobre a `CandidateApplication`. `hired` continua obedecendo
exclusivamente a SPEC-012 (RN-020: somente `owner` registra `hired`).

O Dossiê também nunca altera `Candidate`, `Interview` ou qualquer avaliação
humana já registrada (SPEC-013). Ele é estritamente um consumidor de
leitura de todas essas entidades, nunca um escritor.

## 8. Fluxo Principal

```text
CandidateApplication existente (SPEC-012)
↓
owner/admin decide gerar uma nova versão do Dossiê (decisão explícita —
nunca automática, seção 9.1)
↓
Sistema valida CandidateApplication ativa, Candidate ativo, consentimento
operacional válido (seção 21), Organization ativa
↓
Sistema abre transação curta (seção 9.2), bloqueia a CandidateApplication
(seção 18)
↓
Sistema resolve, dentro da mesma transação, cada fonte autorizada disponível
(seção 10) e registra CandidateDossierSource com origin_kind (seção 11)
↓
Sistema cria CandidateDossier (version_number = anterior + 1,
previous_version_id apontando à versão anterior, quando existir)
↓
Sistema confirma a transação — CandidateDossier é persistido como `generated`
↓
[falha técnica em qualquer etapa] → transação revertida → nenhuma versão
parcial persistida → falha auditada sem consumir `version_number`
↓
aguarda consulta humana (owner/admin, SPEC-012)
```

Nenhuma etapa deste fluxo decide, aprova, reprova, pontua ou movimenta
automaticamente a candidatura (seção 14, seção 16).

## 9. Geração

### 9.1 Por que a criação é sempre um ato administrativo explícito

Mesmo raciocínio já formalizado pela SPEC-021 (seção 9), pela SPEC-022
(seção 9.1) e pela SPEC-023 (seção 9.1): uma geração automática e silenciosa
do Dossiê, disparada por qualquer evento do sistema (por exemplo, conclusão
de uma Pré-Análise), produziria composições sem contexto humano direto
sobre aquela candidatura específica — o que esta SPEC nunca permite. A
geração de um `CandidateDossier` é **sempre** um ato explícito de
`owner`/`admin`, nunca `system_triggered`.

### 9.2 Fronteira transacional

Diferente da SPEC-023, a geração do Dossiê **nunca** depende de uma chamada
de rede externa (seção 4.2, seção 13) — ela lê exclusivamente dados já
persistidos localmente (`Candidate`, `CandidateApplication`, `Job Opening
Version`, Blueprint Version, `PreInterview`, `BehavioralAssessmentResult`,
`PreAnalysisResult`/`PreAnalysisFinding`, `Interview`/`InterviewEvaluation`).
Por isso, a geração inteira — validação, resolução de fontes, composição do
`presented_snapshot`, persistência do `CandidateDossier` e de todos os
`CandidateDossierSource` — ocorre em **uma única transação Postgres curta**,
nunca dividida em etapas como a SPEC-023 precisa fazer por causa de sua
chamada externa (SPEC-023, seção 9.2). Esta é uma simplificação deliberada,
justificada pela ausência de dependência de rede.

Se qualquer etapa dessa transação falhar, ela é revertida inteiramente. O
`CandidateDossier` correspondente não é persistido, nenhum `version_number` é
consumido e nenhum `CandidateDossierSource` parcial permanece gravado. A falha
é registrada apenas em auditoria segura (seção 30), nunca como estado
funcional persistido.

### 9.3 Atomicidade

A criação do `CandidateDossier`, de seu `presented_snapshot` e de todos os
seus `CandidateDossierSource` ocorre atomicamente, na mesma transação da
seção 9.2. Nunca existe um `CandidateDossier` em `generated` sem
`presented_snapshot`, com `CandidateDossierSource` ausentes, ou com fontes
parcialmente gravadas (invariante estrutural, seção 4.3).

### 9.4 Ausência de fonte nunca bloqueia a geração

Uma `CandidateApplication` sem Pré-Entrevista, sem Perfil Comportamental,
sem Pré-Análise, ou sem nenhuma Entrevista concluída, continua elegível
para geração de Dossiê — o resultado será naturalmente mais limitado, mas a
ausência de qualquer fonte opcional nunca bloqueia a geração (mesmo
princípio de fail-safe para ausência de fonte opcional já usado pela
SPEC-023, seção 10.5). O único requisito mínimo é a existência da própria
`CandidateApplication` e do `Candidate` associado — um Dossiê pode ser
gerado imediatamente após a criação da candidatura, contendo apenas
`candidate_field`, `job_opening_version` e, quando existir, `blueprint_version`
(seção 33).

**Ausência de fonte é sempre inferida, nunca persistida como campo
redundante:** a lista de tipos de fonte que não estavam disponíveis em uma
versão específica é sempre calculada, em tempo de leitura, comparando o
conjunto fixo de `source_type` autorizados (seção 10.1) com os
`CandidateDossierSource.source_type` efetivamente presentes naquela versão
— nunca um campo próprio armazenado em `CandidateDossier` (decisão de
modelo mínimo, seção 4.5).

### 9.5 Seleção determinística de fontes

Cada geração resolve um conjunto fechado de fontes elegíveis uma única vez,
dentro da transação da seção 9.2. A regra é **conjunto completo elegível**,
nunca "a última fonte" por inferência silenciosa:

- todos os `candidate_field` da lista positiva da seção 33.1 presentes no
  momento da geração;
- exatamente a `job_opening_version_id` já congelada na
  `CandidateApplication`;
- a `blueprint_version_id` contextual já congelada pela
  `CandidateApplication`/`Job Opening Version`, quando existir; se esse
  contexto ainda não existir fisicamente, o Dossiê não inventa nem usa a
  Blueprint Version `active` apenas por estar ativa agora;
- todas as `PreInterview` `completed` da mesma `CandidateApplication`,
  incluindo somente `PreInterviewResponse.submitted = true`;
- todos os `BehavioralAssessmentResult` `completed` da mesma
  `CandidateApplication`, respeitando visibilidade de resultado definida
  pela SPEC-022 e nunca consumindo respostas brutas;
- todos os `PreAnalysisResult` `completed` e seus
  `PreAnalysisFinding` da mesma `CandidateApplication`;
- todas as `Interview` `completed` da mesma `CandidateApplication`, suas
  respostas finalizadas e suas `InterviewEvaluation` já imutáveis após a
  conclusão.

A ordenação canônica é por `completed_at`/`submitted_at`/`created_at` da
fonte, conforme disponível no domínio da própria fonte, e por `id` como
desempate estável. Uma fonte confirmada depois do início da transação não
entra nesta versão; ela só pode aparecer em uma versão futura.

### 9.6 Condições para gerar uma nova versão

Uma nova versão do Dossiê só pode ser criada quando, simultaneamente:

- a `CandidateApplication` associada está `active` (SPEC-012, seção 5;
  com as exceções controladas da seção 28 para `rejected` e `hired`);
- o `Candidate` associado está `active` (SPEC-011, seção 5; seção 27);
- o consentimento operacional geral do `Candidate` está `granted` (SPEC-011,
  seção 8.14; seção 21);
- a Organization está ativa, não arquivada (seção 26);
- a requisição de geração traz `Idempotency-Key` válida para distinguir retry
  operacional de intenção explícita de criar nova versão (seção 19).

Não existe limite numérico de versões por `CandidateApplication` — mesma
decisão deliberada já adotada pela SPEC-023 (seção 20.3) para
`PreAnalysis`, pelo mesmo motivo: o controle de uso excessivo, se algum dia
necessário, é uma decisão de produto/negócio a ser adicionada por revisão
futura explícita, nunca inventada antecipadamente aqui. Diferente da
SPEC-023, esta decisão é ainda mais simples: como esta SPEC nunca aciona o
`AIGateway`, não existe nenhum custo técnico de IA a ser contido por um
limite de geração.

## 10. Fontes Autorizadas

### 10.1 `source_type` canônico

O Dossiê pode compor, exclusivamente:

- **`candidate_field`** — um subconjunto explícito de campos do `Candidate`
  (SPEC-011), listado na seção 33.1;
- **`job_opening_version`** — o conteúdo da versão publicada da Vaga
  referenciada de forma imutável pela `CandidateApplication` (SPEC-010,
  SPEC-012) — **nunca** a versão "atual" da Vaga, que pode ter republicado
  desde então (seção 17);
- **`blueprint_version`** — o subconjunto relevante do Blueprint
  Organizacional (missão, valores, cultura, competências organizacionais,
  critérios do Cargo vinculado), sempre a partir da Blueprint Version
  contextual já congelada pela `CandidateApplication`/`Job Opening Version`
  quando essa referência existir, ou pelas fontes finalizadas que já
  registraram seu próprio `blueprint_version_id`; nunca a Blueprint Version
  apenas `active` no momento da geração ou da consulta futura;
- **`pre_interview_response`** — uma resposta individual específica da
  Pré-Entrevista, sempre com o contexto da tentativa/pergunta congelado em
  `presented_value_snapshot`; a entidade `PreInterview` em si é contêiner,
  não evidência substantiva;
- **`behavioral_assessment_result`** — exclusivamente o resultado
  estruturado (`BehavioralAssessmentResultDimension.value` e
  `interpretation_text`) de uma `BehavioralAssessment` `completed`
  (SPEC-022) vinculada à mesma `CandidateApplication`, quando existir —
  **nunca** `BehavioralAssessmentResponse` (respostas brutas), seguindo
  exatamente o que a ADR-0023 já define ("a IA resume resultados já
  produzidos por instrumento formal", nunca acessa a resposta bruta
  subjacente) e o que a SPEC-022 já antecipa (seção 21) e a SPEC-023 já
  aplica (seção 10.1);
- **`pre_analysis_result`** — o `summary` e o `limitations` de um
  `PreAnalysisResult` (SPEC-023) `completed` vinculado à mesma
  `CandidateApplication`, quando existir;
- **`pre_analysis_finding`** — um `PreAnalysisFinding` individual (SPEC-023),
  quando referenciado isoladamente por categoria (seção 12);
- **`interview_response`** — uma `Interview Response` (SPEC-013) individual,
  sempre com o contexto da `Interview` congelado em
  `presented_value_snapshot`; a entidade `Interview` em si é contêiner, não
  evidência substantiva;
- **`interview_evaluation`** — uma `Interview Evaluation` (SPEC-013)
  individual de um entrevistador, imutável após `completed` (SPEC-013).

Nenhuma outra fonte, além destas nove, compõe o Dossiê. Esta lista é uma
allow-list fechada, nunca uma lista de exemplo — qualquer fonte fora dela
exige revisão explícita desta SPEC (seção 10.2, seção 48).

`PreInterview` e `Interview` podem aparecer como FKs/contexto técnico nas
linhas de resposta correspondentes, para validar pertencimento à mesma
`CandidateApplication` e preservar metadados apresentados. Elas nunca aparecem
como `source_type` próprio, porque são contêineres de tentativa/entrevista, não
o conteúdo substantivo declarado, observado ou avaliado.

### 10.2 Fontes explicitamente nunca utilizadas

O Dossiê **nunca** compõe, em nenhuma circunstância:

- `candidate_application_notes` (SPEC-012) — notas internas de processo
  seletivo são texto livre, informal e subjetivo, sem estrutura própria de
  proveniência; misturá-las como "evidência" classificada rigorosamente
  entre os cinco `origin_kind` da ADR-0023 confundiria opinião não
  estruturada com evidência rastreável. Decisão registrada e revisitável na
  seção 48.5;
- `candidate_internal_notes` (SPEC-011) — mesmo motivo da nota anterior:
  texto livre informal de owner/admin sobre o Candidate, sem estrutura de
  proveniência própria;
- `AI Execution` (SPEC-014) diretamente — o Dossiê nunca referencia uma
  execução técnica de IA; quando compõe conteúdo originado de IA, sempre o
  faz por meio de `pre_analysis_result`/`pre_analysis_finding` (seção 4.3);
- `salary_expectation`, consentimento detalhado, ou qualquer outro campo do
  `Candidate` fora da lista positiva da seção 33.1;
- avaliações ou fontes de **outra** `CandidateApplication` do mesmo
  `Candidate` (seção 17: cada candidatura é isolada; o Dossiê nunca cruza
  candidaturas, mesmo do mesmo candidato);
- dado de qualquer outra Organization, sob nenhuma circunstância (seção 35);
- currículo, documento ou arquivo (ainda não existem como campo aprovado do
  `Candidate`, SPEC-011).

### 10.3 Cross-candidatura: uma referência de fonte nunca pertence a outra `CandidateApplication`

Mesmo achado de segurança já formalizado pela SPEC-023 (seção 10.4),
reaplicado aqui com o mesmo rigor: toda fonte referenciada por FK tipada —
`pre_interview_id`, `pre_interview_response_id`,
`behavioral_assessment_result_id`, `pre_analysis_result_id`,
`pre_analysis_finding_id`, `interview_id`, `interview_response_id` e
`interview_evaluation_id` — deve pertencer **exatamente** à mesma
`candidate_application_id` do `CandidateDossier` sendo gerado, nunca apenas à
mesma Organization. Uma tentativa que viole essa regra é recusada com
mensagem genérica (seção 35) e auditada como
`candidate_dossier.cross_candidature_reference_denied` (seção 30.2).

### 10.4 Snapshot boundary: fonte rastreável e conteúdo apresentado

O Dossiê tem duas obrigações simultâneas:

1. preservar a fonte técnica rastreável por FK tipada; e
2. preservar o conteúdo efetivamente apresentado ao recrutador.

Por isso, toda `CandidateDossierSource` exibida deve possuir
`presented_value_snapshot`, mesmo quando a entidade de origem é finalizada ou
imutável. Esse snapshot não substitui a fonte original, mas garante que uma
versão histórica possa ser reconstruída sem reler joins atuais, sem depender
de correções posteriores e sem transformar hash em conteúdo.

`candidate_field` possui uma regra adicional: como `Candidate` (SPEC-011) não
tem versionamento formal, toda fonte com `source_type = candidate_field`
também deve preencher `snapshot_value` com o valor mínimo exato do campo no
momento da geração. Hash isolado nunca é suficiente para `candidate_field`.

Para as demais fontes, `snapshot_value` permanece nulo, mas
`presented_value_snapshot` é obrigatório quando qualquer informação dessa
fonte aparecer no `presented_snapshot`.

Regras por fonte:

| Fonte | Regra de snapshot |
| --- | --- |
| `candidate_field` | `snapshot_value` + `presented_value_snapshot` obrigatórios. |
| `job_opening_version` | snapshot do subconjunto exibido da versão contextual da vaga; nunca reler vaga atual. |
| `blueprint_version` | snapshot do subconjunto exibido da versão contextual; ausente se não houver contexto congelado. |
| `pre_interview_response` | somente tentativas `completed` e respostas `submitted = true`; snapshot do texto da pergunta, resposta apresentada, autoria do Candidate e contexto da tentativa. |
| `behavioral_assessment_result` | somente resultado estruturado permitido; snapshot do resultado apresentado; nunca resposta bruta. |
| `pre_analysis_result`/`pre_analysis_finding` | snapshot do resumo, limitações e achados apresentados, preservando `ai_inference`. |
| `interview_response`/`interview_evaluation` | somente entrevistas `completed`; snapshot do que foi apresentado, com contexto da entrevista, autoria do registrador/avaliador e timestamp quando aplicável. |

`snapshot_value` e `presented_value_snapshot` podem conter dado pessoal ou
conteúdo sensível e recebem exatamente o mesmo nível de proteção de acesso já
exigido para o restante do conteúdo do Dossiê (seção 24, seção 25). Auditoria
nunca registra esses campos.

### 10.5 Hash canônico

`content_hash` nunca substitui snapshot. Ele existe para verificar
integridade e detectar alteração indevida entre o conteúdo apresentado e a
provenance registrada.

O hash canônico de uma fonte deve considerar, no mínimo:

- `source_type`;
- FK tipada preenchida;
- `field_name`, quando aplicável;
- `origin_kind`;
- `presented_value_snapshot`;
- `snapshot_value`, quando existir;
- ordenação (`presented_order`);
- versão do schema de snapshot.

O hash canônico do `CandidateDossier` considera `presented_snapshot`, todos
os hashes de fonte, a ordenação final e `snapshot_schema_version`. A
canonicalização deve ser determinística (ordem estável de chaves, datas em
formato normalizado, ausência de campos voláteis como `updated_at` não
apresentado). Hash é integridade, não identidade funcional.

### 10.6 Interview Evaluation: legítima aqui, proibida na SPEC-023

**Distinção deliberada frente à SPEC-023 (seção 10.2):** a SPEC-023 proíbe,
de forma definitiva, que `Interview Evaluation` seja fonte de uma nova
síntese de IA, por risco de circularidade (a IA "leria" a opinião do
entrevistador e a devolveria reformulada como se fosse conclusão
independente). Essa proibição **não se aplica** a esta SPEC, pelo motivo
inverso e igualmente definitivo: o Dossiê **nunca sintetiza nada com IA**
(seção 4.2, seção 13) — ele apenas **exibe, ao Recrutador humano**, o que já
foi registrado por um humano, sempre rotulado explicitamente como
`human_evaluation` (seção 11), nunca misturado a `ai_inference`. Não existe
risco de circularidade quando o consumidor final é sempre um humano, nunca
outro sistema de IA. A ADR-0023 já autoriza isso explicitamente ao listar
"entrevistas humanas" e "avaliações humanas de entrevistadores" entre o que
o Dossiê pode reunir (seção "Dossiê Inteligente").

**Restrição obrigatória mesmo assim:** o Dossiê pode listar,
**individualmente**, cada `recommendation`/`overall_rating` humano já
registrado por entrevistador (SPEC-013), sempre atribuído a esse
entrevistador específico — ele **nunca** combina, calcula, resume em número
único, tira média, ou usa esses valores individuais para produzir qualquer
métrica agregada nova. Fazer isso recriaria, por composição, exatamente o
"score de contratação" que a seção 14 proíbe de forma absoluta.

## 11. Distinção entre Tipos de Origem (`origin_kind`)

Esta SPEC aplica, sem alteração, a taxonomia de cinco tipos já formalizada
pela ADR-0023 a todo `CandidateDossierSource.origin_kind`, mapeando cada
`source_type` autorizado (seção 10.1) exatamente assim:

| `source_type`                | `origin_kind`       | Justificativa |
| ----------------------------- | -------------------- | -------------- |
| `candidate_field`              | `declared_data`      | autoria do próprio candidato |
| `job_opening_version`          | `declared_data`      | conteúdo que a Organization publica e mantém (ADR-0023, nota de precisão normativa) |
| `blueprint_version`            | `declared_data`      | conteúdo que a Organization publica e mantém |
| `pre_interview_response`       | `declared_data`      | resposta individual de autoria do candidato |
| `behavioral_assessment_result` | `instrument_result`  | saída de instrumento formal aplicado |
| `pre_analysis_result`          | `ai_inference`       | síntese produzida pela SPEC-023 |
| `pre_analysis_finding`         | `ai_inference`       | achado individual produzido pela SPEC-023 |
| `interview_response`           | `observed_evidence`  | resposta registrada por humano durante a entrevista |
| `interview_evaluation`         | `human_evaluation`   | julgamento registrado por um entrevistador |

Este mapeamento é fixo e canônico — a implementação nunca infere
`origin_kind` a partir de outro campo em tempo de execução; ele é sempre
determinado diretamente pelo `source_type`, no momento em que a
`CandidateDossierSource` é criada.

Estes cinco tipos **nunca** são apresentados de forma indistinta.
Consistente com a ADR-0023 ("uma conclusão sem origem identificável não deve
ser exibida como informação válida do Dossiê"): nenhuma `CandidateDossierSource`
é persistida sem `origin_kind` preenchido, e a interface (seção 34) deve
sempre exibir, junto de cada item composto, sua origem.

### 11.1 Um item do Dossiê nunca pode aparentar ser fato quando é inferência ou opinião

Mesmo princípio já formalizado pela SPEC-023 (seção 12.1), aplicado aqui:
referenciar um `pre_analysis_finding` ou uma `interview_evaluation` no
Dossiê não transforma esse conteúdo em fato verificado pelo sistema — ele
continua sendo, respectivamente, sempre `ai_inference` e sempre
`human_evaluation`, exibidos sempre com atribuição explícita à sua fonte e
ao seu autor (quando aplicável), nunca como afirmação direta e absoluta do
próprio Dossiê.

## 12. Estrutura do Dossiê (apresentação, não schema)

A estrutura a seguir é **conceitual** e materializada em `presented_snapshot`,
com cada item ligado a uma ou mais linhas de `CandidateDossierSource`. Ela
nunca é recomputada em tempo de leitura a partir de fontes atuais. A lista é
organização de apresentação, não schema físico:

- resumo da candidatura (dados básicos de `Candidate` + `CandidateApplication`
  + `Job Opening Version`, todos `declared_data`);
- contexto da Vaga (`job_opening_version`);
- contexto organizacional (`blueprint_version`, quando existir);
- evidências declaradas (`candidate_field`, `pre_interview_response`);
- evidências observadas (`interview_response`);
- resultado de instrumento (`behavioral_assessment_result`, quando existir);
- síntese assistida por IA (`pre_analysis_result`/`pre_analysis_finding`,
  quando existir — sempre com o `disclaimer` já produzido pela SPEC-023,
  seção 4.6, nunca reescrito por esta SPEC);
- avaliações humanas (`interview_evaluation`, quando existirem);
- pontos fortes / pontos de atenção / possíveis riscos: agregação, **sem
  fusão**, de `PreAnalysisFinding` (categorias `ponto_forte`,
  `ponto_atencao`, `possivel_risco`, quando existirem) e de
  `InterviewEvaluation.strengths`/`attention_points` (quando existirem) —
  cada item sempre rotulado com seu próprio `origin_kind` e sua fonte
  exata, nunca combinado em uma lista única sem distinção (seção 11.1);
  perguntas ainda em aberto (`PreAnalysisFinding` categoria
  `pergunta_sugerida_para_validacao`, quando existir);
- limitações/informações ausentes (seção 9.4 — persistido no
  `presented_snapshot` como resultado da seleção de fontes daquela
  transação, sem criar campo redundante por tipo de fonte);
- histórico do processo: a lista de versões anteriores do próprio Dossiê
  (seção 17), nunca o histórico bruto de `candidate_application_events`
  (SPEC-012), que continua pertencendo exclusivamente à SPEC-012.

Esta lista **não é obrigatória em sua totalidade** — uma implementação
futura pode organizar a apresentação de forma diferente, desde que preserve
integralmente o princípio de proveniência (seção 11) e as proibições
absolutas (seção 14). Esta SPEC define o **modelo de dados** rastreável que
sustenta qualquer uma dessas organizações, nunca o layout final.

## 13. IA no Dossiê

**Decisão definitiva desta versão:** o Dossiê, nesta SPEC, **apenas compõe
dados e resultados já existentes** — incluindo `PreAnalysisResult`/
`PreAnalysisFinding` já produzidos pela SPEC-023. Ele **nunca** solicita uma
nova síntese assistida específica do Dossiê, nunca aciona o `AIGateway`
diretamente ou indiretamente, e nunca duplica a Pré-Análise.

Justificativa:

1. A SPEC-023 já fornece integralmente a camada de análise assistida da
   jornada do candidato (ADR-0023). Criar uma segunda camada de síntese de
   IA especificamente para o Dossiê duplicaria responsabilidade, custo,
   superfície de segurança (prompt injection, minimização de dados) e
   auditoria já resolvidos pela SPEC-023, sem necessidade demonstrada.
2. O princípio "IA nunca é requisito estrutural" (ADR-0016) fica mais forte
   quando o Dossiê — a etapa final da composição antes da decisão humana —
   funciona **integralmente sem IA habilitada** na Organization: um Dossiê
   sem nenhuma Pré-Análise ainda é útil (resumo, contexto, evidências
   observadas, avaliações humanas), consistente com a exigência explícita
   do `BACKLOG.md` de que "SPEC-024 deve possuir uma versão estrutural,
   utilizável pelo RH, mesmo quando a IA estiver desabilitada na
   Organization."
3. Nenhuma nova chamada de IA é necessária para atingir o objetivo desta
   SPEC (composição rastreável) — a necessidade concreta simplesmente não
   foi demonstrada.

Se, no futuro, uma síntese assistida **específica do Dossiê** for
identificada como necessária (por exemplo, uma narrativa unificada entre
fontes), isso exige revisão explícita desta SPEC, respeitando
integralmente o `AIGateway` e todas as quatro condições de autorização já
definidas pelas ADR-0016 a ADR-0019 e pela SPEC-014 — nunca uma implementação
silenciosa.

### 13.1 Consequência de teste obrigatória

Como esta SPEC nunca aciona o `AIGateway`, a suíte de testes obrigatória
(seção 46) deve garantir explicitamente: **nenhuma nova `AI Execution`
(SPEC-014) é criada durante a geração de nenhum `CandidateDossier`, em
nenhum cenário** — mesmo quando a `CandidateApplication` possui `PreAnalysis`
`completed` disponível como fonte.

## 14. Proibição Absoluta de Score, Ranking, Matching e Decisão Automática

Fica formalizado, sem exceção, aplicando diretamente a ADR-0023 (seção
"Scores" e seção "Papel da IA") ao escopo desta SPEC:

Esta SPEC **nunca** cria, em nenhuma camada — banco de dados, tipos, DTO,
UI, exportação ou IA:

- `overall_score`;
- `fit_score`;
- `hiring_score`;
- `cultural_fit_score`;
- `ranking` ou `rank`;
- `matching` ou `compatibility`;
- `recommendation` ou `recommendation_to_hire` no nível do Dossiê (uma
  `InterviewEvaluation.recommendation` individual continua existindo em seu
  próprio escopo, SPEC-013, e pode ser **exibida individualmente e
  atribuída** pelo Dossiê, nunca agregada — seção 10.6);
- `approve`/`reject` ou `decision` no nível do Dossiê;
- percentual de "fit" ou de aderência;
- classificação automática de aprovação, reprovação, eliminação ou
  contratação;
- qualquer campo que combine, calcule, tire média ou consolide múltiplos
  sinais individuais (achados de IA, avaliações humanas, resultados de
  instrumento) em um único indicador.

Estas restrições não são configuráveis por Organization, por Owner ou por
qualquer administrador — são invariantes arquiteturais desta SPEC,
idênticas em espírito às já formalizadas pela SPEC-023 (seção 15).

## 15. Linguagem

O Dossiê nunca apresenta, como resultado automático ou conclusão do
próprio sistema:

- "candidato ideal";
- "aprovado" / "reprovado";
- "recomendado para contratação";
- "fit definitivo";
- "compatível" / "incompatível";
- "deve ser contratado" / "deve ser rejeitado";
- qualquer termo equivalente de veredito automático.

Usa, em vez disso, a mesma linguagem de evidência, contexto, observação,
análise assistida e ponto para validação humana já formalizada pela
ADR-0023 (seção "Aderência") e já aplicada pela SPEC-022 (seção 14) e pela
SPEC-023 (seção 14):

- "evidências de aderência";
- "evidências não encontradas";
- "pontos para validação";
- "aderência potencial";
- "inconsistências";
- "pontos de atenção".

Quando o Dossiê exibe um `PreAnalysisFinding` ou `InterviewEvaluation`, ele
preserva integralmente a linguagem e a atribuição já produzidas por essas
SPECs (SPEC-023, seção 12.1, seção 14) — o Dossiê nunca reescreve,
resume ou reformula o texto de uma fonte já produzida; ele apenas o exibe
com sua origem.

## 16. Decisão Humana

Reforçado explicitamente, sem exceção: o Dossiê nunca altera:

- `Candidate`;
- `CandidateApplication.current_stage`;
- `application_status`;
- `rejected`;
- `hired`;
- `cancelled`;
- `withdrawn`;
- `Interview`;
- qualquer avaliação humana já registrada.

A decisão continua sendo exclusivamente humana. `hired` continua obedecendo
integralmente a SPEC-012 (RN-020: somente `owner` registra `hired`; RN-021:
`hired` não cria contratação, colaborador ou onboarding).

O Recrutador (`owner`/`admin`) permanece sempre soberano sobre toda decisão
da candidatura (ADR-0023, seção "Papel do Recrutador"). O Recrutador pode
ignorar integralmente qualquer conteúdo do Dossiê, sem necessidade de
justificativa técnica perante o sistema. Nenhum campo desta SPEC é
consumido automaticamente por nenhuma outra parte do sistema para produzir
efeito de negócio.

## 17. Histórico, Versionamento e Não Retroatividade

Se uma versão do Dossiê foi gerada, ela **nunca** muda silenciosamente
porque uma fonte posterior foi criada ou alterada:

- nova versão publicada da Vaga (SPEC-010, ADR-0012);
- nova versão do Blueprint ativada (ADR-0022, seção "Não retroatividade");
- nova tentativa de Pré-Entrevista concluída (SPEC-021, seção 19);
- nova aplicação de Perfil Comportamental concluída (SPEC-022, seção 16);
- nova execução de Pré-Análise concluída (SPEC-023, seção 17);
- nova Entrevista concluída ou nova `Interview Evaluation` registrada
  (SPEC-013);
- alteração de dados do `Candidate` (SPEC-011).

Nova informação sempre produz uma **nova versão explicitamente identificada**
(`CandidateDossier` com `version_number` incrementado e `previous_version_id`
apontando à anterior) — nunca uma sobrescrita da versão existente. Cada
versão anterior permanece imutável, íntegra e consultável, exatamente como
foi gerada.

Nenhum `CandidateDossier` é editado após persistido como `generated`. Nenhuma
implementação futura pode adicionar um mecanismo de "atualização" de uma versão
já existente — corrigir ou refletir uma mudança é sempre uma nova geração
explícita (seção 9, seção 18).

## 18. Regeneração e Concorrência

### 18.1 Quem pode gerar/regerar

Somente `owner`/`admin` (seção 24). Não existe geração automática, em
nenhuma circunstância (seção 9.1).

### 18.2 Quando

A qualquer momento em que as condições da seção 9.6 forem satisfeitas —
antes da entrevista, durante o processo, após entrevistas concluídas, ou
repetidamente ao longo da jornada (seção 33.5). Não existe uma única
geração "final" privilegiada; toda geração é uma versão igualmente válida
no histórico.

### 18.3 Limite

Nenhum limite numérico de gerações é definido por esta SPEC (seção 9.6).

### 18.4 Substituição de versão anterior

Uma nova geração **nunca substitui** a versão anterior — ela apenas se
torna a versão mais recente (`previous_version_id` aponta para a anterior);
a versão anterior permanece integralmente preservada e consultável (seção
17).

### 18.5 Concorrência

Mesmos princípios já exigidos por toda SPEC desta jornada — banco de dados
como autoridade final:

- **duas gerações simultâneas para a mesma `CandidateApplication`:** a
  geração adquire um bloqueio sobre a `CandidateApplication`
  (`SELECT ... FOR UPDATE` ou mecanismo equivalente) durante a transação da
  seção 9.2, impedindo que duas gerações concorrentes produzam
  `version_number` duplicados ou dois `CandidateDossier` referenciando a
  mesma versão anterior como `previous_version_id`; a primeira operação
  confirmada prevalece, a segunda recebe conflito seguro e pode
  simplesmente reiniciar como uma nova geração após a primeira concluir;
- **nova fonte surgindo durante a geração** (por exemplo, uma
  `PreAnalysis` concluindo no meio da janela): como a geração inteira ocorre
  em uma única transação curta (seção 9.2), o conjunto de fontes é resolvido
  de forma consistente dentro dessa transação (usando isolamento de
  transação suficiente para evitar leitura fantasma, por exemplo
  `REPEATABLE READ` ou equivalente) — uma fonte que só é confirmada
  **depois** que a transação de geração já começou não é incluída nesta
  versão; ela poderá ser incluída em uma geração futura (seção 9.6);
- **Entrevista sendo concluída durante a geração:** mesmo princípio acima —
  resolvido pela consistência de transação, nunca por uma segunda etapa
  externa (diferente da SPEC-023, que precisa revalidar antes de uma
  chamada de rede, seção 9.2 desta SPEC nunca tem essa necessidade, porque
  não há chamada externa);
- **`CandidateApplication` sendo finalizada durante a geração:** o bloqueio
  da `CandidateApplication` (mesmo lock desta seção) serializa a geração
  com qualquer operação concorrente de finalização (SPEC-012, seção 7.1) —
  a operação que confirmar primeiro prevalece; se a finalização confirmar
  antes, a geração em andamento é revertida sem persistir `CandidateDossier`
  nem consumir `version_number` (a `CandidateApplication` deixou de satisfazer
  a condição `active` da seção 9.6 dentro da própria transação); se a geração
  confirmar primeiro, ela é válida e a finalização prossegue normalmente em
  seguida.

## 19. Idempotência

Serialização e idempotência são responsabilidades distintas nesta SPEC.
O bloqueio da `CandidateApplication` (seção 18.5) impede interleavings
inconsistentes e duplicidade de `version_number`; ele não é suficiente para
identificar que duas requisições A/B são o mesmo duplo clique ou retry de rede.

Por isso, toda requisição de `Gerar Dossiê` deve enviar `Idempotency-Key`
obrigatória, com entropia suficiente e escopo por
`organization_id + candidate_application_id`. O servidor grava na versão
gerada:

- `idempotency_key_hash`, nunca a chave em claro;
- `request_fingerprint`, calculado a partir do payload normalizado
  (`candidate_application_id`, `generation_kind`, motivo de Dossiê final quando
  aplicável e versão do contrato de snapshot).

Regra obrigatória:

- se a mesma `Idempotency-Key` e o mesmo `request_fingerprint` forem recebidos
  novamente, inclusive após a primeira transação concluir, o sistema retorna o
  mesmo `CandidateDossier` já gerado, sem criar vN+1;
- se a mesma `Idempotency-Key` for reutilizada com fingerprint diferente, a
  requisição é recusada como conflito de reutilização de chave;
- se a geração anterior falhou antes do commit, não existe linha de Dossiê nem
  versão consumida; o retry com a mesma chave pode tentar novamente;
- gerar intencionalmente uma nova versão exige uma nova `Idempotency-Key` ou
  ação explícita equivalente de "gerar nova versão".

A persistência deve possuir constraint conceitual única sobre
`organization_id + candidate_application_id + idempotency_key_hash`, para que
duas requisições simultâneas A/B de duplo clique, mesmo serializadas pelo lock,
não possam produzir duas versões distintas. Single-flight em memória não é
suficiente como garantia canônica, porque não cobre múltiplas instâncias,
restart ou retry após commit.

## 20. Momento da Jornada

O Dossiê pode existir em qualquer ponto da jornada, desde que a
`CandidateApplication` esteja elegível conforme seção 9.6 e seção 28:

- **antes da Entrevista Humana** — útil para preparar o roteiro, usando
  Pré-Entrevista, Perfil Comportamental e Pré-Análise já disponíveis;
- **durante o processo** — entre múltiplas Entrevistas, incorporando o que
  já foi concluído até aquele momento;
- **após Entrevistas concluídas** — incorporando `Interview`/
  `Interview Evaluation`;
- **atualização/regeração ao longo da jornada** — toda vez que uma fonte
  nova relevante estiver disponível e o Recrutador quiser uma visão
  atualizada (seção 18).

Não existe apenas uma geração final privilegiada (seção 18.2). O histórico
completo de versões permanece sempre disponível (seção 17).

## 21. Consentimento

**Decisão definitiva desta versão:** o Dossiê **não** exige uma nova
finalidade própria de consentimento (`purpose`) em `candidate_consents`
(SPEC-011). Justificativa, aplicando diretamente o critério que a própria
ADR-0023 propõe ("se todas as fontes já possuem finalidades próprias e o
Dossiê apenas compõe internamente, considerar se nova finalidade é
realmente necessária"):

1. O Dossiê **nunca coleta** nenhum dado novo do candidato — ele apenas
   compõe, para leitura interna por `owner`/`admin`, resultados que já
   foram legitimamente coletados e processados sob suas próprias
   finalidades específicas: o consentimento operacional geral (SPEC-011,
   seção 8.14) já autoriza o processamento de `Candidate`/
   `CandidateApplication`; o consentimento `purpose = "behavioral_assessment"`
   (SPEC-022) já autorizou a aplicação do instrumento antes de o Dossiê
   existir; o consentimento `purpose = "ai_pre_analysis"` (SPEC-023) já
   autorizou aquela execução específica de IA antes de o Dossiê existir.
2. O Dossiê **nunca envia** nenhum dado a um provider externo (seção 13) —
   logo, não existe o mesmo risco de exposição a terceiro que justificou a
   exigência de finalidade específica para SPEC-022 e SPEC-023.
3. Compor, para leitura por quem já está autorizado a ler cada fonte
   individualmente (owner/admin, seção 24), o que já foi legitimamente
   produzido, é uma **finalidade de organização interna da informação**,
   não uma nova finalidade de processamento de dado pessoal distinta das já
   existentes.

**O que continua sendo exigido, sem exceção:** a geração de uma nova versão
do Dossiê exige que o consentimento operacional geral do `Candidate`
(SPEC-011, seção 8.14) esteja `granted` no momento da geração (seção 9.6) —
mesmo padrão já aplicado a toda operação nova sobre uma `CandidateApplication`
(SPEC-012, seção 6.9). Se esse consentimento estiver `pending`, `revoked` ou
`expired`, nenhuma nova geração ocorre; versões já geradas permanecem
preservadas e consultáveis pelas mesmas regras de permissão (seção 24),
mesmo princípio já exigido pela SPEC-012 (seção "Consentimento Invalido Apos
a Criacao") e reaplicado por toda SPEC desta jornada.

Revogação posterior de consentimentos específicos usados para produzir fontes
históricas (`purpose = "behavioral_assessment"` ou
`purpose = "ai_pre_analysis"`) bloqueia novas produções dessas fontes nas
SPECs correspondentes, mas não invalida resultados históricos validamente
produzidos nem impede o Dossiê de referenciá-los/materializá-los em uma nova
geração. A condição para essa nova composição é o consentimento operacional
geral atual estar `granted`. O Dossiê não cria nova finalidade, não chama IA,
não reaplica instrumento e não reprocessa dados em provider externo; ele apenas
organiza histórico interno já produzido sob sua finalidade própria.

Uma revisão futura pode decidir introduzir uma finalidade própria, caso
surja necessidade jurídica ou de produto concreta — isso exige revisão
explícita desta SPEC, nunca uma inferência silenciosa (mesmo padrão de
abertura já usado pela SPEC-023, seção 18.1).

### 21.1 Opt-out de IA

Consistente com a ADR-0016 e com a ADR-0023 (seção "Opt-out de IA"): quando
`platform_ai_allowed`, `organization_ai_enabled` ou a Feature Policy da
Pré-Análise (SPEC-014, ADR-0017) estiverem indisponíveis, o Dossiê continua
podendo ser gerado normalmente — ele simplesmente não terá nenhuma fonte
`pre_analysis_result`/`pre_analysis_finding` disponível (seção 9.4). A
ausência de IA nunca bloqueia a geração do Dossiê.

## 22. Privacidade e Minimização

Cada campo composto pelo Dossiê responde à pergunta: "isso precisa estar no
Dossiê para a finalidade de recrutamento desta candidatura específica?"

O Dossiê **nunca** inclui automaticamente:

- dados técnicos internos (`secret_reference`, credenciais, tokens);
- `prompt` completo ou payload bruto de qualquer `AI Execution` (SPEC-014) —
  o Dossiê nunca referencia `AI Execution` diretamente (seção 10.2);
- PII irrelevante do `Candidate` fora da lista positiva (seção 33.1);
- dado de outra `CandidateApplication` (seção 10.2, seção 17);
- dado de outra Organization (seção 35);
- `candidate_application_notes`/`candidate_internal_notes` (seção 10.2);
- `salary_expectation` (fora da lista positiva da seção 33.1, mesma
  restrição já aplicada pela SPEC-023, seção 10.1, a envio a IA, aqui
  aplicada por decisão própria à composição do Dossiê, mesmo sendo uma
  leitura estritamente interna a owner/admin);
- respostas brutas de Perfil Comportamental
  (`BehavioralAssessmentResponse`) — apenas o resultado estruturado (seção
  10.1);
- conteúdo restrito de prompt oficial (Prompt Registry, ADR-0019).

## 23. Diferença deliberada frente à SPEC-023 na inclusão de identidade

Diferente da SPEC-023 (seção 10.1.1, que exclui `full_name`/
`preferred_name` porque envia dado a um provider externo de IA), este
Dossiê **inclui** `full_name`/`preferred_name` do `Candidate` como fonte
`candidate_field` — porque o Dossiê nunca sai da plataforma, é lido
exclusivamente por `owner`/`admin` já autorizados a ver esses mesmos campos
diretamente em `Candidate` (SPEC-011), e sua finalidade primária ("resumo
da candidatura", seção 12) exige identificar de quem se trata. Esta é uma
decisão deliberada e justificada, nunca uma inconsistência com a SPEC-023.

## 24. Permissões

Todas as ações funcionais de `owner`, `admin` e `member` exigem User ativo,
Membership ativo, Organization ativa e role autorizada (mesmo padrão de
toda SPEC anterior).

| Ação | Platform Admin | owner | admin | member | Candidate |
| --- | :---: | :---: | :---: | :---: | :---: |
| Gerar nova versão do Dossiê | Não | Sim | Sim | Não | Não |
| Consultar versão específica (conteúdo completo) | Não | Sim | Sim | Não | Não |
| Consultar versão mais recente (conteúdo completo) | Não | Sim | Sim | Não | Não |
| Listar histórico de versões | Não | Sim | Sim | Não | Não |
| Consultar existência e status da versão mais recente (DTO restrito) | Não | Sim | Sim | Restr. | Não |
| Consultar proveniência/fontes de uma versão | Não | Sim | Sim | Não | Não |
| Leitura administrativa auditada com motivo | Sim | Não | Não | Não | Não |

### 24.1 Owner e Admin

Poderes idênticos nesta versão (seção 3). Ambos podem gerar, consultar
qualquer versão, consultar o histórico completo e a proveniência de cada
item.

### 24.2 Member

`member` visualiza somente:

- `id` da `CandidateDossier` mais recente;
- `version_number`;
- `status`.

Mesma minimização rigorosa já adotada pela SPEC-022 (seção 25.2) e pela
SPEC-023 (seção 24.2), pelo mesmo motivo: o Dossiê agrega múltiplas fontes
potencialmente sensíveis (incluindo Perfil Comportamental e Pré-Análise) —
exige, no mínimo, o mesmo rigor já aplicado a cada uma delas
individualmente. `member` nunca visualiza: nenhum `CandidateDossierSource`,
nenhum conteúdo composto, nenhuma versão além da mais recente, histórico de
versões anteriores, `blueprint_version_id`, ou qualquer campo fora da lista
acima.

### 24.3 Candidate

O Candidate **não possui nenhuma ação** nesta SPEC (seção 3). Ele nunca
acessa, visualiza ou influencia diretamente um Dossiê — mesmo a respeito da
própria candidatura. Decisão explícita, registrada e justificada na seção
48.3.

### 24.4 Platform Admin (SuperAdmin)

- administra exclusivamente a infraestrutura de IA consumida indiretamente
  por uma das fontes do Dossiê (a Pré-Análise, já definida pela ADR-0016 a
  ADR-0019 e pela SPEC-014) — **nunca** recebe conteúdo de candidatura só
  por administrar a plataforma (mesmo princípio já formalizado pela
  ADR-0023, seção "Platform Admin (SuperAdmin)");
- nunca gera, consulta funcionalmente ou administra um `CandidateDossier`
  como operação funcional;
- realiza apenas leitura administrativa excepcional, com motivo obrigatório
  e auditoria obrigatória, retornando dados minimizados por padrão — nunca
  o conteúdo completo composto, salvo necessidade estritamente justificada e
  registrada (seção 27, mesmo padrão de toda SPEC anterior).

### 24.5 Nenhum vazamento indireto para `member`

Mesmo achado de permissão já registrado pela SPEC-023 (seção 24.4),
reaplicado aqui: esta SPEC nunca adiciona nenhum campo relacionado a
`CandidateDossier` (existência, versão, contagem de gerações, ou qualquer
derivado) ao DTO de `CandidateApplication` já definido pela SPEC-012 — o
único ponto de leitura de `member` sobre esta Feature é a consulta direta e
já minimizada da seção 24.2.

## 25. Acesso

Esta SPEC **não possui rota pública** — diferente da SPEC-020, SPEC-021 e
SPEC-022, que precisam de um mecanismo de acesso do Candidate sem
autenticação. Como o Candidate nunca é ator desta SPEC (seção 3, seção
24.3), toda operação exige User ativo, Membership ativo e role autorizada
(`owner`/`admin`), exatamente como qualquer operação administrativa comum
de `CandidateApplication` (SPEC-012).

## 26. Organization Arquivada

Quando a Organization estiver `archived`:

- nenhuma nova versão do Dossiê é gerada;
- versões já geradas permanecem preservadas;
- Platform Admin consulta somente administrativamente, com motivo e
  auditoria;
- nenhuma reativação implícita ocorre por meio desta SPEC.

## 27. Candidate Inativo

Mesmo bloqueio já formalizado pela SPEC-013, pela SPEC-021 (seção 16.1),
pela SPEC-022 (seção 20) e pela SPEC-023 (seção 18.2), aplicado aqui sem
divergência:

- `Candidate` `inactive` bloqueia a geração de nova versão do Dossiê (seção
  9.5);
- versões do Dossiê já geradas permanecem integralmente preservadas e
  consultáveis pelas regras de permissão já definidas (seção 24);
- reativar o `Candidate` (SPEC-011, seção 6.5) volta a permitir novas
  gerações, sem necessidade de nenhuma ação especial desta SPEC.

## 28. `CandidateApplication` Final

A v1.0 não agrupa estados finais como se fossem equivalentes. A regra é por
estado:

| Estado | Nova geração de Dossiê | Justificativa |
| --- | --- | --- |
| `withdrawn` | Bloqueada. | A candidatura foi retirada pelo candidato; nova composição interna após retirada aumenta risco de tratamento sem finalidade operacional atual. |
| `cancelled` | Bloqueada. | Encerramento administrativo indica que o processo deixou de ser operacional; histórico já gerado permanece consultável. |
| `rejected` | Permitida uma única vez como **Dossiê final de registro**, se não existir versão posterior à finalização. | Pode haver necessidade legítima de registrar o conjunto de evidências que sustentou a decisão negativa já tomada, sem criar nova decisão. |
| `hired` | Permitida uma única vez como **Dossiê final de registro**, se não existir versão posterior à finalização. | Pode haver necessidade legítima de registrar o conjunto de evidências que sustentou a decisão positiva já tomada, sem criar contratação, onboarding ou colaborador. |

Regras obrigatórias para `rejected`/`hired`:

- a geração final deve ser solicitada por `owner`/`admin`, com motivo
  obrigatório;
- `finalized_at`, `finalized_by_user_id` e `finalization_reason` da
  `CandidateApplication` devem estar preenchidos (SPEC-012);
- a versão gerada deve registrar `generation_kind = final_record` e
  referenciar o estado final observado; gerações comuns usam
  `generation_kind = regular`;
- a geração final nunca altera a decisão, nunca cria nova recomendação,
  nunca reabre processo, nunca movimenta pipeline e nunca aciona IA;
- só pode existir uma versão final pós-decisão por `CandidateApplication`;
- `withdrawn` e `cancelled` nunca usam essa exceção;
- consentimento operacional revogado, expirado ou pendente ainda bloqueia
  nova geração final; histórico previamente gerado permanece preservado.

Essa é uma decisão de produto desta SPEC, não uma regra herdada
automaticamente de SPEC-012. Ela existe para cobrir o caso de "Dossiê final
para registro da decisão" sem permitir geração ilimitada pós-decisão nem
justificativa retroativa silenciosa.

Se já existirem versões `regular` antes da decisão humana, elas permanecem
imutáveis. O Dossiê `final_record`, quando permitido, recebe o próximo
`version_number` e `previous_version_id` aponta para a versão imediatamente
anterior, seja ela regular ou não. O banco deve impedir mais de um
`final_record` por `CandidateApplication` com uma restrição única parcial
conceitual.

## 29. Multiempresa

Toda a geração e consulta do Dossiê respeita integralmente o isolamento
multiempresa já formalizado pela ADR-0020: dados de `CandidateDossier` e
`CandidateDossierSource` de uma Organization nunca são lidos, gravados,
referenciados ou afetados por outra Organization, em nenhuma circunstância
— inclusive quando uma fonte composta (Pré-Análise) usou credencial de IA
`platform_managed` (ADR-0018, seção "Platform Managed"; ADR-0020, seção
"Isolamento Multiempresa"). A Blueprint Version usada para contextualizar
qualquer versão do Dossiê é sempre a da própria Organization do candidato,
nunca de outra (ADR-0021, seção "Relacionamento com IA").

### 29.1 Checklist de tentativas de ataque cross-tenant / cross-candidatura

A revisão desta SPEC avaliou explicitamente cada tentativa abaixo, usando
um `candidate_application_id` válido de uma Organization e IDs igualmente
válidos, porém pertencentes a **outra** Organization (ou, nos itens
marcados, à mesma Organization mas a outra candidatura):

| Tentativa | Bloqueio |
| --- | --- |
| `candidate_application_id` de outra Organization | Recusado — validação de Organization comum (seção 35); mensagem genérica |
| `CandidateApplication` de outra Organization | Recusado — Organization comum |
| `PreInterview` de outra candidatura (mesma ou outra Organization) | Recusado — mesma `candidate_application_id` exigida (seção 10.3) |
| `BehavioralAssessment` de outro `Candidate` (mesma ou outra Organization) | Recusado — mesma `candidate_application_id` exigida (seção 10.3) |
| `PreAnalysis`/`PreAnalysisFinding` de outra candidatura | Recusado — mesma `candidate_application_id` exigida (seção 10.3) |
| `Interview`/`InterviewEvaluation` de outra candidatura | Recusado — mesma `candidate_application_id` exigida (seção 10.3) |
| Blueprint Version de outra Organization | Recusado — resolvida sempre a partir da Organization do contexto validado, nunca aceita do cliente (ADR-0021) |
| Job Opening Version incompatível com a `CandidateApplication` | Recusado — herdada de forma imutável da própria `CandidateApplication` (seção 4.3), nunca aceita do cliente |
| `organization_id` informado diretamente no payload | Recusado — nunca aceito do cliente; sempre derivado da `CandidateApplication` resolvida no servidor (ADR-0020) |

Nenhuma dessas tentativas revela, na mensagem de erro, se o registro
referenciado existe em outra Organization ou pertence a outra candidatura —
todas retornam a mesma resposta genérica de acesso negado (seção 35),
consistente com o princípio já estabelecido pela ADR-0013/ADR-0014.

## 30. Auditoria

### 30.1 Eventos obrigatórios

- `candidate_dossier.generation_requested`;
- `candidate_dossier.generated`;
- `candidate_dossier.generation_failed`;
- `candidate_dossier.consulted_administratively` (Platform Admin);
- `candidate_dossier.permission_denied`;
- `candidate_dossier.cross_organization_access_denied`;
- `candidate_dossier.cross_candidature_reference_denied` (seção 10.3).

Estes nomes são conceituais e ilustrativos, seguindo o mesmo padrão já
usado por `pre_analysis.*` (SPEC-023) e `behavioral_assessment.*`
(SPEC-022); a nomenclatura técnica final é responsabilidade da
implementação.

### 30.2 O que a auditoria deve registrar (lista positiva)

- `organization_id`;
- `candidate_application_id`;
- `candidate_dossier_id` e `version_number`;
- `requested_by_user_id` (ator);
- `status` resultante da operação;
- lista de `source_type`/`origin_kind` efetivamente incluídos (nunca o
  conteúdo das fontes em si);
- timestamps;
- motivo, quando aplicável (leitura administrativa).

### 30.3 O que a auditoria nunca registra

- conteúdo completo de qualquer `CandidateDossierSource`;
- `snapshot_value` de qualquer `candidate_field`;
- perfil completo do `Candidate`;
- conteúdo de `PreAnalysisResult`/`PreAnalysisFinding` além de sua
  referência;
- conteúdo de `InterviewEvaluation` além de sua referência;
- tokens, headers, segredos, credenciais.

Auditoria crítica em geração (sucesso ou falha) deve causar rollback quando
falhar — mesmo padrão já exigido por toda SPEC anterior desta jornada.

## 31. Timeline

**Decisão explícita: esta SPEC não cria uma entidade `CandidateDossierEvent`
própria.** Justificativa (fecha a ambiguidade explicitamente levantada por
esta tarefa):

1. Diferente de `PreInterview`, `BehavioralAssessment` e `PreAnalysis` — que
   possuem ciclos de vida multi-etapa relevantes de narrar (agendamento,
   início, respostas parciais, conclusão, cancelamento, cada um separado no
   tempo) — a geração do Dossiê é **síncrona e de etapa única** (seção 9.2):
   ela persiste apenas a versão concluída com sucesso, como `generated`. Não
   existe uma sequência de sub-eventos funcionalmente distintos para registrar
   além da própria criação da versão.
2. Cada `CandidateDossier` já é, por construção, um registro imutável e
   com timestamp (`requested_at`, `completed_at`) — a própria
   sequência de linhas em `candidate_dossiers`, ordenada por
   `version_number`, **já é** o histórico funcional completo e suficiente
   (quem gerou, quando, o resultado).
3. O log de auditoria geral (`audit_events` ou equivalente, seção 30) já
   cobre integralmente os eventos de segurança/negócio relevantes
   (solicitação, sucesso, falha, acesso negado, leitura administrativa).

Duplicar essa informação em uma tabela `candidate_dossier_events` própria
não agregaria nenhuma rastreabilidade adicional — apenas repetiria dado já
disponível em duas tabelas diferentes, contrariando o princípio explícito
desta tarefa de "não copiar estados de módulos anteriores por reflexo" e
"não duplicar `audit_events` sem necessidade". Se, no futuro, o Dossiê
ganhar um ciclo de vida multi-etapa mais rico (por exemplo, um passo de
revisão/aprovação separado da geração), essa decisão deve ser revista
explicitamente.

## 32. Relação com SPEC-023 (Pré-Análise Assistida por IA)

`PreAnalysisResult`/`PreAnalysisFinding` entram no Dossiê como
`ai_inference` (seção 11). O Dossiê:

- **nunca** recalcula, reinterpreta ou reformula a origem de um
  `PreAnalysisResult`/`PreAnalysisFinding` — ele apenas referencia e exibe;
- pode referenciar `summary`, `limitations` e cada `PreAnalysisFinding`
  individual (com sua `category`, seção 12);
- **nunca** expõe `ai_execution_id`, `prompt_key`, `prompt_version`, ou
  qualquer metadado técnico de `AI Execution` (SPEC-014) como conteúdo de
  negócio ao Recrutador — esses permanecem exclusivamente metadados de
  auditoria (seção 30), consultáveis apenas via SPEC-014/ADR-0019, nunca
  reexpostos pelo Dossiê como se fossem informação funcional própria dele.

## 33. Relação com SPEC-022 (Perfil Comportamental)

O Perfil Comportamental continua sendo `instrument_result` (seção 11).
Nunca é tratado, pelo Dossiê, como score de contratação. O Dossiê:

- referencia exclusivamente `BehavioralAssessmentResult`/
  `BehavioralAssessmentResultDimension` (`value` e `interpretation_text`);
- **nunca** referencia `BehavioralAssessmentResponse` (respostas brutas);
- respeita integralmente `candidate_result_visibility` e
  `raw_response_owner_visibility` já definidas pela SPEC-022 (seção 4.5) —
  o Dossiê nunca contorna essas políticas por ser um consumidor diferente;
  ele só compõe o que a SPEC-022 já autoriza `owner`/`admin` a ver
  diretamente.

### 33.1 Lista positiva de `candidate_field`

Campos permitidos como `source_type = candidate_field`:

- `full_name`;
- `preferred_name`;
- `professional_summary`;
- `location` (cidade/estado, mesmo recorte já usado pela lista positiva de
  `member` na SPEC-011, seção 9, ainda que aqui o leitor seja owner/admin);
- experiências profissionais;
- escolaridade;
- certificações;
- idiomas;
- competências declaradas;
- disponibilidade;
- `work_authorization`.

Explicitamente excluídos: `email`, `phone`, `secondary_phone`, endereço
completo, detalhes de consentimento, `salary_expectation`,
`candidate_internal_notes` (seção 10.2) — minimização mantida mesmo para
leitor já autorizado, seguindo o princípio de que contato direto, expectativa
salarial e gestão de consentimento não são automaticamente "evidência de
candidatura"; são dados operacionais, negociais ou administrativos que não
precisam ser duplicados permanentemente em toda versão do Dossiê.

### 33.2 Nunca substitui a metodologia formal

O Dossiê nunca reinterpreta, resume com linguagem própria, ou apresenta de
forma diferente o resultado de um instrumento formal — ele exibe
exatamente o que a SPEC-022 já produziu, com a mesma linguagem não
determinística já exigida por ela (SPEC-022, seção 14).

## 34. Relação com SPEC-021 (Pré-Entrevista Estruturada)

A Pré-Entrevista continua preservando:

- pergunta (via `PreInterviewQuestion`, com seu snapshot já preservado pela
  SPEC-021);
- resposta submetida (`PreInterviewResponse` com `submitted = true`);
- tentativa (`attempt_number` da `PreInterview` usada);
- snapshot de contexto (`job_opening_version_id`, `blueprint_version_id` já
  registrados pela própria `PreInterview`, seção 4.3.1 da SPEC-021).

O Dossiê **nunca** usa rascunho — apenas `PreInterview` `completed`
(SPEC-021, seção 5) e apenas `PreInterviewResponse` com `submitted = true`
(seção 10.1). Uma `PreInterview` em andamento, expirada sem envio, ou
cancelada nunca é composta como fonte.

## 35. Relação com SPEC-013 (Entrevistas)

A Entrevista Humana permanece integralmente separada de IA (SPEC-013,
ADR-0015). O Dossiê distingue corretamente, sem exceção:

- **observação** (`interview_response`, `origin_kind =
  observed_evidence`) — o que foi registrado sobre o que o candidato
  respondeu durante a entrevista;
- **avaliação** (`interview_evaluation`, `origin_kind = human_evaluation`)
  — o julgamento do entrevistador;
- **nota humana individual** (`InterviewEvaluation.overall_rating`/
  `recommendation`) — pode ser exibida individualmente, atribuída ao
  entrevistador específico, **nunca** combinada ou agregada (seção 10.6,
  seção 14);
- **evidência** — qualquer conteúdo composto pelo Dossiê sempre carrega sua
  proveniência exata (seção 11).

O Dossiê **nunca** permite que a opinião humana registrada em
`InterviewEvaluation` seja transformada em fato objetivo — ela é sempre
exibida como `human_evaluation`, atribuída ao entrevistador específico, com
o mesmo texto já registrado pela SPEC-013, nunca reescrita ou resumida pelo
Dossiê.

Somente `Interview` e `InterviewEvaluation` **`completed`** (imutáveis,
SPEC-013) são elegíveis como fonte — uma entrevista `draft`, `scheduled`,
`in_progress`, `cancelled` ou `no_show` nunca é composta.

## 36. Relação com o Blueprint Organizacional

O Dossiê usa sempre a Blueprint Version correta: a versão contextual já
congelada pela candidatura/vaga ou pelas fontes finalizadas incluídas
(seção 10.1). Quando a arquitetura ainda não possuir uma referência
contextual física na `CandidateApplication`/`Job Opening Version`, o Dossiê
não resolve a Blueprint Version `active` atual como substituto silencioso; a
fonte `blueprint_version` simplesmente fica ausente, e as limitações do
`presented_snapshot` registram essa ausência. Contextualiza sem decidir — o
Dossiê **nunca** apresenta
"candidato combina/não combina com a empresa" como veredito (seção 15);
ele apresenta apenas evidências de aderência ao Blueprint, sempre como
ponto para validação humana (ADR-0021, seção "Relacionamento com o
Processo Seletivo").

## 37. Relação com a Vaga

O Dossiê usa sempre a `Job Opening Version` correta: a mesma versão
publicada, imutável, já referenciada pela `CandidateApplication` (SPEC-010,
SPEC-012) — nunca relê a versão "atual" da Vaga se a candidatura já
congelou outra (seção 17, mesmo princípio já exigido pela SPEC-012, RN-010).

## 38. Integração

Esta SPEC integra exclusivamente com:

- `CandidateApplication` (SPEC-012) — vínculo estrutural exclusivo (seção
  5);
- `Candidate` (SPEC-011) — apenas para validar status, consentimento
  operacional geral e ler o subconjunto de campos autorizado (seção 33.1);
- `Job Opening`/`Job Opening Version` (SPEC-010) — apenas para herdar
  referência e ler conteúdo da versão publicada;
- `PreInterview`/`PreInterviewResponse` (SPEC-021) — apenas como fonte
  opcional de leitura; nenhuma alteração é feita a essa entidade;
- `BehavioralAssessment`/`BehavioralAssessmentResult` (SPEC-022) — apenas
  como fonte opcional de leitura; nenhuma alteração é feita a essas
  entidades;
- `PreAnalysis`/`PreAnalysisResult`/`PreAnalysisFinding` (SPEC-023) —
  apenas como fonte opcional de leitura; nenhuma alteração é feita a essas
  entidades;
- `Interview`/`InterviewEvaluation` (SPEC-013) — apenas como fonte opcional
  de leitura; nenhuma alteração é feita a essas entidades;
- Blueprint Version (SPEC-018, ADR-0022) — apenas como contexto opcional de
  leitura.

Esta SPEC nunca integra diretamente com o `AIGateway`, com nenhum Provider
Adapter, com o Prompt Registry ou com o Model Registry (ADR-0016 a
ADR-0019, SPEC-014) — porque nunca aciona IA nova (seção 13).

## 39. API Conceitual

| Operação | Finalidade |
| --- | --- |
| Gerar Dossiê | `owner`/`admin` solicita uma nova versão para uma `CandidateApplication` (seção 9). |
| Consultar versão mais recente | Retornar o `CandidateDossier` de maior `version_number`, conforme o DTO da role do solicitante (seção 24). |
| Consultar versão específica | Retornar um `CandidateDossier` específico por `id`/`version_number`. |
| Listar versões | Retornar o histórico de `CandidateDossier` de uma `CandidateApplication` (`id`, `version_number`, `status`, `requested_at`). |
| Consultar fontes/proveniência de uma versão | Retornar os `CandidateDossierSource` de um `CandidateDossier`, com `source_type`/`origin_kind`. |
| Leitura administrativa auditada | Consulta excepcional por Platform Admin, com motivo (seção 27). |

Nenhuma rota pública existe (seção 25). Esta SPEC não define URLs finais,
contratos de request/response nem código de rota.

## 40. Interface Conceitual

- **botão/ação "Gerar Dossiê"**, visível a `owner`/`admin` dentro da tela de
  uma `CandidateApplication` já existente (SPEC-012);
- indicador de versão e status persistido (`generated`) para versões já
  concluídas;
- quando `generated`: exibição organizada pelas seções conceituais da seção
  12, **sempre** com indicação visível de origem (`origin_kind`) e fonte
  exata de cada item — nunca escondida atrás de um tooltip obscuro como
  única forma de descobrir a proveniência (exigência explícita desta
  tarefa: a origem deve ser legível diretamente na apresentação principal
  do item, não apenas disponível ao passar o mouse);
- indicação clara de limitações/fontes ausentes (seção 9.4);
- histórico de versões anteriores, consultável lado a lado;
- se uma solicitação de geração falhar antes do commit, mensagem segura, sem
  detalhe técnico sensível, com opção de tentar novamente; isso não corresponde
  a uma versão persistida.

Esta SPEC não define layout, wireframe ou biblioteca de componentes
visuais.

## 41. Exportação

**Fora do escopo da v1.** O Dossiê é, primeiro, um modelo de domínio e de
visualização (seção 4, seção 12) — não um documento estático. Nenhum
requisito normativo explícito de exportação (PDF ou equivalente) foi
encontrado nas ADRs 0013 a 0023, nas SPECs 011 a 023, ou no `BACKLOG.md`
durante a preparação desta SPEC. Exportação pode ser especificada em SPEC
futura, quando houver necessidade concreta demonstrada.

## 42. Performance

Princípios, sem definir micro-otimização prematura:

- a resolução de fontes durante a geração (seção 9.2) deve buscar cada tipo
  de fonte em consultas específicas e indexadas por
  `candidate_application_id`, nunca em N+1 descontroladas por item
  individual;
- respostas brutas de Perfil Comportamental (`BehavioralAssessmentResponse`)
  nunca são carregadas pela geração do Dossiê — apenas o resultado
  estruturado já minimizado (seção 33);
- a consulta de uma versão já gerada é sempre uma leitura direta de
  `CandidateDossier` + `CandidateDossierSource`, nunca uma recomposição
  (seção 5) — portanto, sempre rápida e previsível;
- a listagem de histórico de versões (seção 39) deve suportar paginação
  quando o número de versões crescer.

## 43. Banco Conceitual

Sem schema físico, sem migration. Estruturas conceituais equivalentes a:

- `candidate_dossiers`;
- `candidate_dossier_sources`.

Nenhuma outra tabela é criada por esta SPEC (seção 4.5, seção 31: nem
seção/item de apresentação, nem evento próprio).

Regras conceituais:

- `organization_id` obrigatório em toda tabela;
- `candidate_application_id` obrigatório em `candidate_dossiers`, com
  Organization idêntica à da `CandidateApplication` referenciada;
- `job_opening_id`/`job_opening_version_id` de `candidate_dossiers` sempre
  idênticos aos já registrados, de forma imutável, na
  `CandidateApplication` associada — nunca resolvidos de forma
  independente;
- `blueprint_version_id`, quando presente, referencia uma Blueprint Version
  contextual da mesma Organization, nunca resolvida apenas por estar
  `active` no momento da geração;
- `status` persistido limitado a `generated`;
- `presented_snapshot` obrigatório, validado por `snapshot_schema_version`;
- `content_hash` obrigatório, calculado conforme a seção 10.5;
- `generation_kind` limitado a `regular` ou `final_record`;
- `idempotency_key_hash` e `request_fingerprint` obrigatórios para toda
  geração bem-sucedida;
- restrição única conceitual em
  `organization_id + candidate_application_id + idempotency_key_hash`;
- restrição única parcial conceitual permitindo no máximo um
  `generation_kind = final_record` por `candidate_application_id`;
- `version_number` sequencial e único dentro da mesma
  `candidate_application_id`, protegido por constraint conceitual
  `UNIQUE(candidate_application_id, version_number)`;
- `previous_version_id`, quando presente, referencia sempre um
  `candidate_dossier` da mesma `candidate_application_id` e da mesma
  Organization, com `version_number` imediatamente anterior e sem ciclos;
- toda `candidate_dossier` em `status = generated` possui pelo menos um
  `candidate_dossier_source` correspondente, salvo quando nenhuma fonte
  opcional estava disponível no momento da geração (seção 9.4) — nesse
  caso, apenas as fontes estruturalmente sempre presentes
  (`candidate_field`, `job_opening_version`) são exigidas como mínimo;
- `candidate_dossier_sources.source_type` limitado aos valores canônicos da
  seção 10.1;
- `candidate_dossier_sources.origin_kind` limitado aos cinco valores
  canônicos da ADR-0023, sempre determinado por `source_type` conforme a
  tabela da seção 11;
- `candidate_dossier_sources` usa FKs tipadas nullable, nunca
  `source_type + source_reference_id` como referência polimórfica única;
- um `CHECK` discriminado por `source_type` garante a forma exata esperada
  para cada tipo: FKs substantivas obrigatórias preenchidas, FKs incompatíveis
  nulas e FKs de contexto permitidas somente quando pertencem à própria forma
  da fonte (`pre_interview_id` junto de `pre_interview_response_id`;
  `interview_id` junto de `interview_response_id` ou
  `interview_evaluation_id`);
- `field_name` é obrigatório apenas para `candidate_field` e nulo para
  fontes de entidade;
- `candidate_dossier_sources.snapshot_value` obrigatório quando
  `source_type = candidate_field`; nulo para os demais (seção 10.4);
- `candidate_dossier_sources.presented_value_snapshot` obrigatório para
  toda fonte apresentada (seção 10.4);
- `candidate_dossier_sources.content_hash` obrigatório para toda fonte
  apresentada (seção 10.5);
- `pre_interview_id`, `pre_interview_response_id`,
  `behavioral_assessment_result_id`, `pre_analysis_result_id`,
  `pre_analysis_finding_id`, `interview_id`, `interview_response_id` e
  `interview_evaluation_id`, quando presentes como fonte ou contexto, referenciam sempre uma
  entidade com a mesma `candidate_application_id` do `candidate_dossier`
  (nunca apenas a mesma Organization — seção 10.3);
- `job_opening_version_id` de fonte deve ser idêntico ao
  `job_opening_version_id` do `candidate_dossier`;
- `blueprint_version_id` de fonte, quando presente, deve ser a referência
  contextual já congelada, ou estar ligada a uma fonte finalizada que
  registrou essa mesma versão como contexto;
- ausência de cascade destrutivo;
- ausência de exclusão física, em qualquer fluxo normal;
- índices para Organization, `candidate_application_id`, `version_number` e
  `status`.

Esta SPEC não define SQL.

## 44. Segurança

- nunca criar score, ranking, matching ou decisão automática (seção 14);
- nunca acionar provider de IA diretamente ou indiretamente (seção 13);
- validar no servidor: `organizationId`, `candidateApplicationId`,
  `candidateDossierId`, `candidateDossierSourceId`, `jobOpeningId`,
  `preInterviewId`, `behavioralAssessmentId`, `preAnalysisId`,
  `interviewId`, `interviewEvaluationId`;
- validar Organization comum entre `CandidateApplication`, `Job Opening`,
  todas as fontes referenciadas e o `CandidateDossier`;
- validar, além da Organization comum, que toda fonte referenciada por FK
  tipada pertence exatamente à mesma `candidate_application_id` sendo
  composta — nunca apenas à mesma Organization (seção 10.3);
- validar Candidate ativo e consentimento operacional geral válido antes de
  qualquer geração (seção 21), com bloqueio dentro da mesma transação
  curta (seção 9.2, seção 18.5);
- bloquear geração cruzando Organizations — todo `CandidateDossier` deriva
  a Organization exclusivamente da `CandidateApplication`, nunca de um
  `organizationId` enviado pelo cliente (ADR-0020);
- bloquear manipulação de IDs — identificador enviado pelo cliente nunca
  prova acesso;
- mensagens de erro para acesso cruzado devem ser genéricas, sem revelar a
  existência de Dossiê, fonte ou candidatura em outra Organization ou outra
  candidatura (seção 29.1);
- proteger dados pessoais do Candidate no conteúdo composto, com o mesmo
  rigor já exigido pela SPEC-011;
- aplicar minimização de dados para `member` e Platform Admin (seção 24.2,
  seção 24.4);
- nunca registrar dados pessoais completos em logs;
- nunca registrar tokens, headers, senhas, connection strings, segredos ou
  credenciais de provider;
- usar queries parametrizadas;
- proteger contra mass assignment: `organization_id`, `status`,
  `version_number`, `previous_version_id`, autoria e timestamps são sempre
  definidos pelo servidor, nunca aceitos como valor livre enviado pelo
  cliente;
- tratar todo conteúdo composto pelo Dossiê (respostas, avaliações,
  achados) como dado a ser exibido, nunca como instrução — esta SPEC nunca
  monta nenhum prompt ou instrução de IA a partir desse conteúdo, porque
  nunca aciona IA (seção 13);
- nenhuma implementação futura de exportação (seção 41), quando existir,
  pode contornar as regras de permissão e minimização já definidas nesta
  SPEC.

## 45. Critérios de Aceite

- CA-001: Um `CandidateDossier` sempre pertence a exatamente uma
  `CandidateApplication`.
- CA-002: Um `CandidateDossier` nunca pertence diretamente ao `Candidate`.
- CA-003: Um `CandidateDossier` nunca pertence diretamente à Organization.
- CA-004: Um `CandidateDossier` nunca pertence diretamente à Job Opening.
- CA-005: Um `CandidateDossier` nunca pertence diretamente ao Blueprint.
- CA-006: Uma nova geração é sempre um ato explícito de `owner`/`admin`,
  nunca automática.
- CA-007: `requested_by_user_id` nunca é nulo.
- CA-008: Geração ocorre em uma única transação curta, sem chamada externa.
- CA-009: Nenhuma `AI Execution` (SPEC-014) é criada durante a geração de
  nenhum `CandidateDossier`, em nenhum cenário (seção 13.1).
- CA-010: Ausência de qualquer fonte opcional nunca bloqueia a geração.
- CA-011: Uma `CandidateApplication` recém-criada, sem nenhuma fonte
  opcional, ainda permite gerar um Dossiê mínimo.
- CA-012: Estado canônico persistido limitado a `generated`.
- CA-013: Falha técnica durante geração não persiste `CandidateDossier`, não
  consome `version_number` e não deixa fontes parciais.
- CA-014: Uma `CandidateDossier` em `generated` sempre possui pelo menos um
  `CandidateDossierSource` correspondente (salvo mínimo estrutural, seção
  43).
- CA-015: Uma falha durante a geração nunca deixa `CandidateDossierSource`
  parcialmente persistidos.
- CA-016: `Dossiê` nunca cria valor novo em `CandidateApplication.current_stage`.
- CA-017: `Dossiê` nunca altera `application_status`.
- CA-018: `Dossiê` nunca altera `Candidate`.
- CA-019: `Dossiê` nunca altera `Interview` nem avaliação humana já
  registrada.
- CA-020: `Dossiê` nunca marca `hired`, `rejected`, `withdrawn` ou
  `cancelled`.
- CA-021: Nenhum campo de score, ranking, matching, `fit`, aprovação ou
  reprovação existe em nenhuma camada.
- CA-022: `InterviewEvaluation.overall_rating`/`recommendation` pode ser
  exibido individualmente, atribuído ao entrevistador, mas nunca combinado
  em métrica agregada.
- CA-023: Nenhum texto do Dossiê usa linguagem determinística de aderência
  (seção 15).
- CA-024: Toda `CandidateDossierSource` possui `origin_kind` preenchido,
  mapeado corretamente a partir de `source_type` (seção 11).
- CA-025: Todo `PreAnalysisFinding` composto preserva sua classificação
  `ai_inference`.
- CA-026: Toda `InterviewEvaluation` composta preserva sua classificação
  `human_evaluation`.
- CA-027: `candidate_field` sempre grava `snapshot_value`; demais
  `source_type` nunca gravam `snapshot_value`.
- CA-028: `job_opening_version_id` do Dossiê é sempre o mesmo já registrado,
  de forma imutável, na `CandidateApplication`.
- CA-029: `blueprint_version_id` do Dossiê, quando presente, é sempre
  contexto já congelado da candidatura/vaga ou das fontes finalizadas; nunca
  a Blueprint Version apenas `active` no momento da geração.
- CA-030: Uma versão antiga do Dossiê nunca é alterada por uma nova versão
  publicada da Vaga, do Blueprint, ou por novas fontes surgidas depois.
- CA-031: Nova informação sempre produz uma nova versão do Dossiê, nunca
  sobrescreve a anterior.
- CA-032: `version_number` é sequencial e único por `CandidateApplication`.
- CA-033: `previous_version_id`, quando presente, sempre referencia uma
  versão da mesma `CandidateApplication`.
- CA-034: Nenhum limite numérico de versões é imposto por esta SPEC.
- CA-035: Apenas `owner`/`admin` podem gerar uma nova versão.
- CA-036: `member` nunca gera Dossiê.
- CA-037: `member` visualiza apenas `id`, `version_number` e `status` da
  versão mais recente de candidaturas `active` que já pode ver.
- CA-038: `member` nunca visualiza `CandidateDossierSource`.
- CA-039: Candidate nunca acessa, consulta ou influencia o Dossiê.
- CA-040: Platform Admin nunca gera nem opera funcionalmente um Dossiê.
- CA-041: Platform Admin realiza apenas leitura administrativa com motivo e
  auditoria.
- CA-042: Geração exige consentimento operacional geral do `Candidate`
  `granted`.
- CA-043: Consentimento `pending`, `revoked` ou `expired` bloqueia nova
  geração, mas preserva versões já geradas.
- CA-044: Candidate `inactive` bloqueia nova geração, mas preserva versões
  já geradas.
- CA-045: `CandidateApplication` `withdrawn` ou `cancelled` bloqueia nova
  geração, mas preserva versões já geradas.
- CA-045A: `CandidateApplication` `rejected` ou `hired` permite no máximo uma
  geração pós-finalização como Dossiê final de registro, com motivo
  obrigatório, `generation_kind = final_record` e sem alterar decisão,
  pipeline ou qualquer fonte.
- CA-046: Organization arquivada bloqueia nova geração, mas preserva
  versões já geradas.
- CA-047: Duas gerações concorrentes para a mesma `CandidateApplication`
  nunca produzem dois `CandidateDossier` com o mesmo `version_number`.
- CA-048: A segunda de duas gerações concorrentes recebe conflito seguro.
- CA-049: Uma fonte confirmada após o início da transação de geração nunca
  é incluída retroativamente nessa mesma versão.
- CA-050: Finalização da `CandidateApplication` concorrente com geração é
  resolvida de forma determinística, sem estado parcial.
- CA-051: Toda fonte referenciada por FK tipada pertence exatamente à mesma
  `candidate_application_id`, nunca apenas à mesma Organization.
- CA-052: Acesso cruzado entre Organizations é recusado com mensagem
  genérica.
- CA-053: Acesso cruzado entre candidaturas da mesma Organization é
  recusado com mensagem genérica e evento próprio
  (`cross_candidature_reference_denied`).
- CA-054: `organization_id` nunca é aceito diretamente do cliente.
- CA-055: Auditoria nunca registra conteúdo completo de fontes nem
  `snapshot_value`.
- CA-056: Falha de auditoria crítica em geração causa rollback.
- CA-057: Nenhuma tabela de "seção" ou "item de exibição" é criada.
- CA-058: Nenhuma tabela de evento próprio (`candidate_dossier_events`) é
  criada.
- CA-059: `full_name`/`preferred_name` do Candidate são incluídos como fonte
  legítima (diferente da SPEC-023).
- CA-060: `salary_expectation` nunca é composto no Dossiê padrão, mesmo para
  `owner`/`admin`.
- CA-061: `email`, `phone`, `secondary_phone`, endereço completo,
  `candidate_application_notes` e `candidate_internal_notes` nunca são
  compostos.
- CA-062: Apenas `PreInterview`/`Interview`/`InterviewEvaluation`
  `completed` (imutáveis) são elegíveis como fonte.
- CA-063: Nenhuma rota pública existe nesta SPEC.
- CA-064: Nenhuma exportação (PDF ou equivalente) é implementada nesta
  versão.
- CA-065: Persistência permanece após recriar a aplicação.
- CA-066: `CandidateDossier.generated` sempre possui `presented_snapshot`,
  `snapshot_schema_version` e `content_hash`.
- CA-067: Consulta de versão histórica nunca recompõe conteúdo lendo fontes
  atuais.
- CA-068: Toda fonte apresentada possui `presented_value_snapshot` e
  `content_hash`; `candidate_field` também possui `snapshot_value`.
- CA-069: `candidate_dossier_sources` usa FKs tipadas nullable com `CHECK`
  discriminado; não existe referência polimórfica única
  `source_type + source_reference_id`.
- CA-070: `blueprint_version_id` nunca é resolvido pela Blueprint Version
  apenas `active` no momento da geração; usa somente contexto já congelado
  ou permanece ausente.
- CA-071: Seleção de fontes inclui o conjunto completo de fontes elegíveis
  confirmadas até o início da transação, em ordenação canônica.

## 46. Testes Obrigatórios

Quando implementada, a funcionalidade deve possuir testes para:

### Domínio e vínculo

1. gerar Dossiê para `CandidateApplication` válida;
2. Dossiê nunca vinculado diretamente ao `Candidate`;
3. Dossiê nunca vinculado diretamente à Organization;
4. Dossiê nunca vinculado diretamente à Job Opening;
5. Dossiê nunca vinculado diretamente ao Blueprint;
6. `job_opening_id`/`job_opening_version_id` sempre herdados, imutáveis, da
   `CandidateApplication`;
7. `blueprint_version_id`, quando presente, sempre vem de contexto já
   congelado; nunca da versão apenas `active` no momento da geração.

### Ausência de IA nova

8. nenhuma `AI Execution` criada durante geração com todas as fontes
   disponíveis;
9. nenhuma `AI Execution` criada durante geração sem nenhuma fonte
   opcional disponível;
10. nenhuma `AI Execution` criada mesmo quando `PreAnalysis` `completed`
    está disponível como fonte.

### Ausência de score/decisão automática

11. nenhum campo de score, ranking, matching, `fit`, aprovação ou
    reprovação é persistido em nenhuma entidade;
12. `InterviewEvaluation.overall_rating` de dois entrevistadores diferentes
    nunca é combinado em um único valor;
13. texto composto nunca contém termos de linguagem determinística
    proibida (seção 15);
14. Dossiê nunca altera `application_status`, `current_stage`, `rejected`,
    `hired`, `withdrawn` ou `cancelled`.

### Fontes e proveniência

15. `candidate_field` sempre grava `snapshot_value`;
16. `job_opening_version` nunca grava `snapshot_value`, mas sempre grava
    `presented_value_snapshot`, FK tipada e hash;
17. `blueprint_version` nunca grava `snapshot_value`, mas sempre grava
    `presented_value_snapshot`, FK tipada e hash quando presente;
18. `pre_interview_response` só é composta quando `submitted = true`;
19. rascunho de `PreInterview` nunca é composto;
20. `behavioral_assessment_result` composto apenas do resultado
    estruturado, nunca de `BehavioralAssessmentResponse`;
21. `pre_analysis_result`/`pre_analysis_finding` compostos apenas quando
    `PreAnalysis.status = completed`;
22. `interview_response`/`interview_evaluation` compostos apenas quando
    `Interview.status = completed`;
23. `Interview` em `draft`/`scheduled`/`in_progress`/`cancelled`/`no_show`
    nunca é composta como fonte; pode aparecer apenas como contexto de uma
    resposta/avaliação elegível;
24. `candidate_application_notes` nunca é composta;
25. `candidate_internal_notes` nunca é composta;
26. dado de outra `CandidateApplication` do mesmo `Candidate` nunca é
    composto;
27. `origin_kind` de cada `source_type` corresponde exatamente à tabela da
    seção 11;
28. Dossiê sem nenhuma fonte opcional disponível ainda é gerado com sucesso
    (mínimo estrutural);
29. ausência de fonte é materializada como limitação no `presented_snapshot`
    da versão, sem campo redundante por tipo de fonte.

### Cross-tenant e cross-candidatura

30. `candidate_application_id` de outra Organization é recusado;
31. `PreInterview` de outra candidatura (mesma Organization) é recusada
    como fonte, mesmo com `candidate_application_id` correto no payload;
32. `BehavioralAssessment` de outro `Candidate` (mesma Organization) é
    recusado como fonte;
33. `PreAnalysis`/`PreAnalysisFinding` de outra candidatura é recusado como
    fonte;
34. `Interview`/`InterviewEvaluation` de outra candidatura é recusado como
    fonte;
35. Blueprint Version de outra Organization nunca é aceita, mesmo se
    enviada pelo cliente;
36. `organization_id` enviado diretamente pelo cliente é ignorado/recusado;
37. mensagens de erro de acesso cruzado nunca revelam existência de
    registro em outra Organization/candidatura;
38. evento `cross_candidature_reference_denied` é registrado corretamente.

### Permissões e visibilidade

39. `owner` gera nova versão;
40. `admin` gera nova versão;
41. `member` não gera;
42. `member` visualiza apenas `id`/`version_number`/`status` da versão mais
    recente;
43. `member` não visualiza nenhum `CandidateDossierSource`;
44. `member` não visualiza versões além da mais recente;
45. Candidate não possui nenhuma rota de acesso a esta Feature;
46. Platform Admin não gera nem consulta funcionalmente;
47. Platform Admin realiza leitura administrativa com motivo e auditoria;
48. Platform Admin sem motivo é recusado;
49. DTO de `CandidateApplication` (SPEC-012) nunca inclui campo relacionado
    a Dossiê além do já definido nesta SPEC para `member`.

### Consentimento

50. consentimento `granted` permite geração;
51. consentimento `pending` bloqueia nova geração;
52. consentimento `revoked` bloqueia nova geração;
53. consentimento `expired` bloqueia nova geração;
54. bloqueio de consentimento nunca invalida versões já geradas;
55. nenhuma nova finalidade de consentimento (`purpose`) é criada por esta
    SPEC.

### Candidate inativo / CandidateApplication final / Organization arquivada

56. `Candidate` `inactive` bloqueia nova geração;
57. `Candidate` `inactive` preserva versões já geradas;
58. `CandidateApplication` `rejected` permite no máximo uma geração final de
    registro, com motivo obrigatório e `generation_kind = final_record`;
59. `CandidateApplication` `hired` permite no máximo uma geração final de
    registro, com motivo obrigatório e `generation_kind = final_record`;
60. `CandidateApplication` `withdrawn` bloqueia nova geração;
61. `CandidateApplication` `cancelled` bloqueia nova geração;
62. `CandidateApplication` final preserva o histórico de versões já
    geradas, integralmente consultável;
63. Organization `archived` bloqueia nova geração;
64. Organization `archived` preserva versões já geradas;
65. Platform Admin consulta administrativamente mesmo com Organization
    arquivada, com motivo.

### Histórico, versionamento e não retroatividade

66. nova versão publicada da Vaga não altera versão já gerada do Dossiê;
67. nova Blueprint Version ativada não altera versão já gerada;
68. nova tentativa de Pré-Entrevista concluída não altera versão já gerada;
69. nova aplicação de Perfil Comportamental concluída não altera versão já
    gerada;
70. nova execução de Pré-Análise concluída não altera versão já gerada;
71. nova Entrevista concluída não altera versão já gerada;
72. edição de `Candidate` após a geração não altera `snapshot_value` já
    persistido;
73. `version_number` sequencial e sem duplicidade;
74. `previous_version_id` sempre da mesma `CandidateApplication`;
75. tentativa de editar um `CandidateDossier` já `generated` é recusada
    (imutabilidade).
75A. consulta de versão histórica renderiza a partir de `presented_snapshot`,
     sem reler fontes atuais.
75B. `presented_value_snapshot` existe para toda fonte apresentada.
75C. `candidate_dossier_sources` valida FKs tipadas nullable com `CHECK`
     discriminado por `source_type`.
75D. `previous_version_id` referencia a versão imediatamente anterior, da
     mesma `CandidateApplication`, sem ciclos.

### Concorrência e idempotência

76. duas gerações simultâneas para a mesma `CandidateApplication` nunca
    produzem dois `version_number` iguais;
77. segunda geração concorrente recebe conflito seguro;
78. fonte confirmada após o início da transação de geração não é incluída
    retroativamente;
79. finalização concorrente com geração é resolvida de forma
    determinística;
80. duplo clique/retry de rede com a mesma `Idempotency-Key` e o mesmo
    fingerprint retorna a mesma versão já gerada, sem criar vN+1.

### Auditoria

81. geração bem-sucedida é auditada;
82. geração falha é auditada;
83. leitura administrativa é auditada com motivo;
84. acesso negado é auditado;
85. auditoria nunca contém conteúdo completo de fonte;
86. auditoria nunca contém `snapshot_value`;
87. falha de auditoria crítica causa rollback da geração.

### Banco e segurança geral

88. `organization_id` obrigatório em todas as tabelas;
89. ausência de exclusão física de `CandidateDossier`;
90. ausência de exclusão física de `CandidateDossierSource`;
91. ausência de cascade destrutivo;
92. mass assignment de `status`, `version_number`, `previous_version_id` e
    autoria é bloqueado;
93. persistência permanece após recriar a aplicação;
94. nenhuma tabela de seção/item de apresentação é criada;
95. nenhuma tabela de evento próprio é criada.

## 47. Limitações Conhecidas

- esta SPEC não implementa código, banco, migrations, rotas, APIs, testes
  ou dependências;
- não define layout, wireframe ou biblioteca de componentes visuais (seção
  40);
- não define exportação (PDF ou equivalente) — fora de escopo da v1 (seção
  41);
- não define uma nova síntese assistida por IA específica do Dossiê —
  decisão deliberada, não uma lacuna técnica (seção 13);
- não resolve o mecanismo físico de snapshot para componentes do Blueprint
  ainda sem versionamento formal (Estrutura Organizacional, Catálogo de
  Competências, Banco de Perguntas) — essa lacuna já é reconhecida e aberta
  pela ADR-0022 (seção "Componentes ainda não versionados") e pela SPEC-018
  (seção 25), não resolvida por esta SPEC;
- não define política numérica de rate limit para a operação de geração —
  fica para especificação de implementação futura, caso necessário;
- não implementa o Dossiê como consultável pelo próprio Candidate — decisão
  registrada, revisitável (seção 48.3);
- permite apenas uma geração final de registro para `CandidateApplication`
  `rejected` ou `hired`, com motivo obrigatório, e bloqueia `withdrawn`/
  `cancelled` — decisão registrada, revisitável (seção 48.4);
- não altera nenhuma SPEC, ADR, código, banco ou migration já existente.

## 48. Ambiguidades Registradas

Consistente com a exigência desta tarefa de nunca esconder ambiguidade,
ficam registradas explicitamente as seguintes decisões desta versão 1.0,
como decisões fechadas nesta versão e pontos revisitáveis caso a experiência real de uso
demonstre necessidade de mudança:

### 48.1 Materializado vs. dinâmico

**Decidido nesta versão** (seção 5): materializado, versionado, gerado sob
demanda. Não é considerado um ponto em aberto — a justificativa
arquitetural (não retroatividade, ADR-0022) é considerada suficientemente
forte para fechar esta decisão nesta versão.

### 48.2 Novo consentimento ou não

**Decidido nesta versão** (seção 21): não é criada nova finalidade de
consentimento. Ponto em aberto: se uma regulamentação futura exigir
finalidade granular por tipo de composição (por exemplo, consentimento
específico para "seu Perfil Comportamental aparecer em um Dossiê"), esta
decisão precisará ser revista.

### 48.3 Candidate visibility

**Decidido nesta versão** (seção 3, seção 24.3): o Candidate nunca acessa o
Dossiê. Ponto em aberto: a `JORNADA-DO-SISTEMA.md` e a ADR-0023 não
excluem explicitamente essa possibilidade para versões futuras do produto
(por exemplo, um resumo de feedback pós-processo ao candidato) — esta SPEC
apenas garante que, **nesta versão**, isso não existe. Uma futura exposição
ao Candidate exigiria uma revisão própria e explícita desta SPEC, com nova
análise de privacidade e consentimento.

### 48.4 Geração após `CandidateApplication` final

**Decidido nesta versão** (seção 28): `withdrawn` e `cancelled` bloqueiam
nova geração; `rejected` e `hired` permitem uma única geração final de
registro, com motivo obrigatório, sem reabrir processo e sem alterar decisão.
Ponto revisitável: necessidade futura de geração automática no exato momento
da finalização ou de exceções regulatórias adicionais exige revisão explícita.

### 48.5 Inclusão/forma das avaliações humanas e exclusão de notas

**Decidido nesta versão** (seção 10.2, seção 10.7): `Interview`/
`InterviewEvaluation` são fontes legítimas; `candidate_application_notes` e
`candidate_internal_notes` são excluídas. Ponto em aberto: a exclusão das
notas é justificada pela natureza informal/não estruturada delas (seção
10.2), mas essa é uma decisão de produto, não uma restrição arquitetural
inegociável — uma revisão futura poderia decidir incluir notas com uma
nova subclassificação de `origin_kind` ou um tratamento visual claramente
diferenciado (por exemplo, "nota interna", nunca confundida com evidência).

### 48.6 Necessidade de nova IA

**Decidido nesta versão** (seção 13): não. Ponto em aberto: nenhuma
necessidade concreta de síntese unificada entre fontes foi demonstrada até
esta revisão; se surgir, exige revisão explícita desta SPEC e obediência
integral ao `AIGateway`.

### 48.7 Versionamento físico

**Decidido nesta versão** (seção 43): duas estruturas mínimas
(`candidate_dossiers`, `candidate_dossier_sources`), com
`presented_snapshot` materializado no Dossiê e FKs tipadas nas fontes, sem
tabela de seção nem de evento próprio. Ponto em aberto: a implementação
técnica final pode demonstrar necessidade de tabela adicional para normalizar
o snapshot por performance ou consulta, desde que preserve exatamente o
conteúdo histórico apresentado e a provenance definida nesta SPEC.

### 48.8 Exportação

**Decidido nesta versão** (seção 41): fora de escopo. Ponto em aberto:
demanda comercial futura por exportação em PDF/documento pode justificar
uma SPEC própria de exportação, que reutilizaria o modelo de dados aqui
definido sem alterá-lo.

## 49. Conflitos com ADRs e SPECs Aprovadas

Nenhum conflito crítico foi identificado entre esta SPEC e a ADR-0013 a
ADR-0023, ou entre esta SPEC e a SPEC-011 a SPEC-023, durante a preparação
desta versão. Todas as decisões desta SPEC foram verificadas contra:

- a taxonomia de cinco `origin_kind` da ADR-0023 (reutilizada sem
  redefinição, seção 11);
- a proibição absoluta de score/ranking/matching/decisão automática já
  formalizada pela ADR-0023, seção "Scores", e pela SPEC-012, RN-037
  (reforçada, nunca contradita, seção 14);
- o princípio de não retroatividade da ADR-0022 (aplicado integralmente ao
  Dossiê, seção 17);
- o princípio de que Platform Admin nunca recebe conteúdo de candidatura
  só por administrar a plataforma (ADR-0023, seção "Platform Admin
  (SuperAdmin)"; reforçado, seção 24.4);
- a regra de que IA nunca é requisito estrutural (ADR-0016; reforçada pela
  decisão de não acionar IA nova nesta SPEC, seção 13) — o
  `BACKLOG.md` já exige explicitamente que "SPEC-024 deve possuir uma
  versão estrutural, utilizável pelo RH, mesmo quando a IA estiver
  desabilitada na Organization"; esta SPEC atende esse requisito de forma
  mais forte do que o mínimo exigido, ao nunca depender de IA em nenhuma
  circunstância nesta versão.

Nenhuma seção desta SPEC exigiu recomendar bloqueio ou revisão de nenhuma
ADR/SPEC já aprovada. As únicas divergências deliberadas são frente a
**outra SPEC da mesma jornada** (SPEC-023), nunca frente a uma ADR — e
todas estão documentadas com justificativa própria (seção 10.6, seção 23,
seção 6.1, seção 6.2, seção 9.2, seção 19).

## 50. Definição de Concluído

Para a implementação futura desta SPEC:

- SPEC aprovada antes do desenvolvimento (esta versão 1.0 já incorpora a
  revisão destrutiva documental);
- ADR-0013 a ADR-0023 permanecem integralmente respeitadas, sem nenhuma
  redefinição por esta SPEC;
- SPEC-011 a SPEC-014, SPEC-018, SPEC-021, SPEC-022 e SPEC-023 permanecem
  integralmente respeitadas, sem nenhuma alteração de campo, tabela, regra
  ou permissão delas;
- critérios de aceite (seção 45) atendidos;
- testes obrigatórios (seção 46) implementados e passando;
- testes de segurança, isolamento multiempresa e cross-candidatura
  passando;
- nenhuma chamada a `AIGateway` ou a provider de IA existe em nenhum
  módulo desta Feature;
- nenhum score global, ranking, matching definitivo ou decisão automática
  é produzido, em nenhum teste;
- rollback de auditoria crítica verificado;
- migrations reproduzíveis quando houver banco;
- lint passando;
- formatação passando;
- build passando;
- documentação atualizada;
- segurança revisada;
- commit realizado.
