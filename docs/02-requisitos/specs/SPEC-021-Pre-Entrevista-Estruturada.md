# SPEC-021 - Pré-Entrevista Estruturada

**Status:** Aprovada
**Versão:** 1.0
**Fase:** 18
**Responsável de negócio:** Thiago Sousa
**Última atualização:** 2026-08-10
**Dependências:** SPEC-009 - Banco de Perguntas, SPEC-010 - Vagas, SPEC-011 - Candidatos (v1.2), SPEC-012 - Processo Seletivo (v1.1), SPEC-018 - Blueprint Organizacional / Implantação Guiada, SPEC-019 - Portal Público de Vagas, SPEC-020 - Candidatura Pública (v1.1), ADR-0013, ADR-0014, ADR-0015, ADR-0020, ADR-0021, ADR-0022, ADR-0023

**Nota de revisão (v1.0 — revisão final):** esta revisão fecha as decisões
de desenho que a versão inicial deste documento havia deixado abertas ou
implícitas: formaliza `JobOpeningPreInterviewSettings` como configuração
corrente (nunca histórico), distingue explicitamente Configuração ×
Instância × Tentativa, define o snapshot mínimo congelado em cada
instância, desacopla definitivamente a criação da Pré-Entrevista da
transação atômica da SPEC-020, define o critério determinístico de início
(`in_progress`), separa resposta em rascunho de resposta submetida,
formaliza o comportamento de Candidate inativo/consentimento inválido
(espelhando SPEC-012/SPEC-013), acrescenta idempotência do envio final e
amplia critérios de aceite e testes obrigatórios. Nenhuma regra de negócio
já registrada na versão anterior foi removida; esta revisão apenas
formaliza o que estava implícito e resolve as ambiguidades identificadas.
Nenhum conflito crítico foi encontrado com ADR-0013, ADR-0014, ADR-0015,
ADR-0020 a ADR-0023 ou com SPEC-009 a SPEC-013, SPEC-018 a SPEC-020.

## 1. Objetivo

Definir funcionalmente a **Pré-Entrevista Estruturada**: um formulário
estruturado, respondido pelo candidato depois de concluída a Candidatura
Pública (SPEC-020), que existe para coletar informações adicionais,
aprofundar respostas já dadas, validar requisitos declarados na vaga e
registrar evidências que preparem futuras análises humanas — nunca para
decidir contratação, gerar pontuação ou eliminar automaticamente um
candidato.

Esta SPEC formaliza exatamente o passo já antecipado, em nível
arquitetural, pela ADR-0023 (seção "Pré-Entrevista"): "toda Pré-Entrevista
pertence obrigatoriamente a uma `CandidateApplication`... a Pré-Entrevista
nunca altera o `Candidate` principal com score, etapa, ranking ou
decisão." Ela também cumpre o que a ADR-0023 deixou deliberadamente em
aberto para SPEC futura: "Uma SPEC futura decidirá se a Pré-Entrevista será
representada como uma etapa canônica nova do pipeline, ou como um subfluxo
anterior a `screening` ou dentro dela." Esta SPEC resolve essa lacuna na
seção 6.

**A Pré-Entrevista Estruturada funciona completamente sem Inteligência
Artificial.** Nenhuma etapa desta SPEC depende de IA, chama `AIGateway`, ou
é bloqueada pela ausência, indisponibilidade ou desabilitação de IA
(ADR-0016, "IA nunca é requisito estrutural"; item já reservado pelo
`BACKLOG.md`: "SPEC-021 deve funcionar integralmente sem IA habilitada").

Esta SPEC **reutiliza integralmente** as entidades `Candidate` (SPEC-011),
`CandidateApplication` (SPEC-012) e o Banco de Perguntas (SPEC-009) já
aprovados. Ela não cria um segundo cadastro de perguntas, não redefine
nenhuma regra já aprovada por essas SPECs, e define apenas a nova camada —
a Pré-Entrevista em si — que conecta perguntas já existentes a uma
candidatura já existente.

## 2. Fora do Escopo

Esta SPEC não define nem implementa:

- Inteligência Artificial, em qualquer forma (chamada a `AIGateway`,
  provider, modelo, Prompt Registry, adaptação de perguntas por IA);
- DISC;
- Perfil Comportamental;
- Pré-Análise Assistida por IA;
- Dossiê Inteligente do Candidato;
- score, ranking, matching, "fit" ou qualquer métrica de aprovação
  automática;
- decisão de contratação, eliminação automática ou qualquer efeito de RH
  decorrente diretamente da Pré-Entrevista;
- `Interview` (Entrevista humana, SPEC-013) — a Pré-Entrevista é conceito
  distinto e anterior, sem participante humano em tempo real (ADR-0023,
  seção "Relacionamento com Entrevistas");
- Banco de Perguntas (já definido integralmente pela SPEC-009 — esta SPEC
  apenas referencia `question_catalog_items.id`, nunca cria pergunta nova);
- redefinição de qualquer regra já aprovada pela SPEC-009, SPEC-010,
  SPEC-011, SPEC-012, SPEC-018, SPEC-019 ou SPEC-020;
- redefinição do fluxo de Candidatura Pública em si (SPEC-020) — esta SPEC
  começa depois que a `CandidateApplication` já existe e a confirmação já
  foi apresentada (SPEC-020, seção 6);
- alteração do enum de `current_stage` já definido pela SPEC-012/ADR-0014
  (`applied`, `screening`, `interview`, `assessment`, `offer`, `completed`)
  — ver seção 6;
- mecanismo técnico físico de acesso do Candidate sem autenticação como
  `User` (token, link opaco, identificador de acompanhamento) — apenas
  seus invariantes de segurança são registrados (seção 25.1);
- mecanismo técnico de execução assíncrona (fila técnica, worker, job
  queue) para a criação da instância — apenas o desacoplamento funcional é
  definido (seção 8.2);
- tempo máximo, tempo mínimo e quantidade máxima de perguntas — esses
  valores numéricos ficam para especificação técnica/implementação
  (seção 33);
- número máximo de tentativas — fica para especificação técnica/
  implementação (seção 11);
- implementar código, banco, migrations, rotas, APIs, testes ou
  dependências;
- excluir fisicamente qualquer dado.

Esses assuntos pertencem à SPEC-022 (Perfil Comportamental), SPEC-023
(Pré-Análise Assistida por IA), SPEC-024 (Dossiê Inteligente do Candidato),
ou às SPECs já aprovadas que esta SPEC apenas referencia.

## 3. Usuários Envolvidos

- **owner:** configura a Pré-Entrevista de uma vaga (seleciona perguntas do
  Banco de Perguntas, define se a vaga possui Pré-Entrevista), consulta
  respostas, cancela, autoriza reabertura (nova tentativa), consulta
  histórico.
- **admin:** colabora na configuração da Pré-Entrevista de uma vaga
  (seleciona perguntas, dentro do que a SPEC-009 já autoriza a admin sobre
  perguntas próprias), consulta respostas, cancela, autoriza reabertura,
  consulta histórico. Não possui nenhuma restrição adicional a owner nesta
  SPEC além das já existentes na matriz da seção 24 — nenhuma ação desta
  SPEC é exclusiva de owner (ver seção 24.1).
- **member:** visualiza somente que uma Pré-Entrevista existe e seu status,
  para candidaturas `active` que já pode visualizar (SPEC-012, seção 12);
  nunca visualiza o conteúdo das respostas; não administra, não cancela,
  não reabre. Esta é uma decisão deliberada da versão 1.0 (ver seção 24.2):
  respostas de Pré-Entrevista são material de recrutamento consultado
  apenas por `owner`/`admin` nesta fase, ainda sem um papel operacional de
  "entrevistador"/"recrutador" definido para `member` sobre este conteúdo
  específico.
- **Candidate:** a mesma pessoa candidata já definida pela SPEC-011,
  identificada por sua `CandidateApplication` (SPEC-012). É quem
  efetivamente responde à Pré-Entrevista, sem autenticação como `User`
  (SPEC-002) e sem `Membership` (SPEC-003) — o mesmo princípio de
  identidade já estabelecido pela SPEC-020, seção 16, para a candidatura
  pública. O Candidate nunca administra, nunca configura o roteiro de
  perguntas, nunca escolhe a Blueprint Version ou a Job Opening Version
  usadas, nunca altera snapshot, nunca cria tentativa arbitrariamente e
  nunca vê dados fora da sua própria Pré-Entrevista.
- **Platform Admin (SuperAdmin):** consulta administrativamente com motivo
  e auditoria, sem operar funcionalmente. Platform Admin nunca responde,
  nunca edita e nunca recebe respostas completas por padrão — apenas o
  mínimo necessário à finalidade administrativa declarada, minimizado, com
  o mesmo padrão de leitura administrativa de toda SPEC anterior
  (SPEC-011, seção 9; SPEC-012, seção 12; SPEC-013, seção "Platform
  Admin").

`Platform Admin` não é Role de Membership e não recebe permissões
funcionais de `owner`, `admin` ou `member` dentro da Organization
(ADR-0003, ADR-0020).

## 4. Conceitos

### 4.1 Três conceitos distintos

Esta SPEC formaliza três conceitos deliberadamente separados, para evitar
que "configuração", "execução" e "tentativa" sejam confundidos entre si:

- **A. Configuração da Vaga** (`JobOpeningPreInterviewSettings`, seção
  4.2): define **se** e **como** a Feature está configurada **atualmente**
  para uma `Job Opening`. É corrente, mutável, e nunca é histórico (seção
  4.2.1).
- **B. Instância de Pré-Entrevista** (`PreInterview`, seção 4.3): pertence
  obrigatoriamente a uma `CandidateApplication` e representa a execução
  concreta daquela candidatura, com o contexto necessário congelado no
  momento da sua criação (seção 4.3.1).
- **C. Tentativa** (seção 11): cada execução, ou reexecução, de uma
  Pré-Entrevista para a mesma `CandidateApplication` constitui uma
  instância histórica independente — cada tentativa **é** uma Instância
  (B), nunca uma subestrutura dela. "Tentativa" é o nome dado à posição
  sequencial (`attempt_number`) de uma Instância dentro do histórico da
  mesma `CandidateApplication`, nunca uma entidade física separada.

Nunca sobrescrever: uma Instância/Tentativa passada nunca é reaproveitada
por uma nova execução; uma nova execução é sempre uma nova Instância B com
seu próprio `attempt_number` C (seção 11).

### 4.2 Configuração de Pré-Entrevista da Vaga (`JobOpeningPreInterviewSettings`)

Conceito novo mínimo desta SPEC, necessário para resolver a pergunta do
fluxo principal "esta vaga possui Pré-Entrevista?" (seção 7) sem alterar
nenhum campo, tabela ou regra já aprovada pela SPEC-010.

É uma configuração própria desta SPEC — nunca uma alteração ao schema de
`job_openings` ou `job_opening_versions` — que referencia a `Job Opening`
exclusivamente por `id`, no mesmo padrão já usado pela SPEC-012
(`job_opening_version_id`) e pela SPEC-013 (`candidate_application_id`):
uma tabela nova, própria desta SPEC, com uma referência de chave
estrangeira a uma entidade já existente, nunca uma coluna nova dentro da
entidade referenciada.

Diferente do conteúdo da `Job Opening Version`, que é imutável após
publicação (SPEC-010, seção 12.1), esta configuração é deliberadamente
**mutável e corrente** — o mesmo padrão já usado por Feature Settings
(ADR-0017) e Provider Settings (ADR-0018), que também não são versionados
junto com o snapshot que os usa. Ela nunca se torna parte do manifesto
imutável da versão publicada da Vaga; ela é resolvida no momento em que a
Pré-Entrevista é criada (seção 8), nunca congelada junto com a versão da
Vaga. Isso evita reabrir a imutabilidade de `job_opening_versions` já
garantida pela SPEC-010.

Campos conceituais mínimos:

- `id`;
- `organization_id`;
- `job_opening_id`;
- `enabled` (disponibilidade operacional: a vaga possui Pré-Entrevista
  ativa ou não);
- lista ordenada de referências a `question_catalog_items.id`, cada uma
  com obrigatoriedade e ordem (mesmo modelo conceitual de `Interview
  Question`, SPEC-013, seção "Interview Question", sem herdar sua tabela);
- autoria de última alteração;
- timestamps.

Esta configuração nunca copia texto de pergunta — ela apenas referencia
`question_catalog_items.id` (seção 9). O snapshot textual só é produzido no
momento em que uma Pré-Entrevista concreta é criada para uma
`CandidateApplication` (seção 9.2), nunca antes disso.

#### 4.2.1 A configuração não é histórico

`JobOpeningPreInterviewSettings` é **configuração corrente** e pode evoluir
livremente, a qualquer momento, por ação de owner/admin (seção 24.1).

Fica formalizado, explicitamente:

- a Configuração da Vaga **nunca** deve ser consultada retroativamente
  para reinterpretar uma Pré-Entrevista já criada — ela representa apenas
  o estado vigente da Feature para futuras criações, nunca uma fonte de
  verdade para instâncias já existentes;
- quando uma instância concreta é criada, todo o contexto necessário
  (seção 4.3.1) é **congelado** naquela instância, e deixa de depender da
  Configuração da Vaga a partir desse momento;
- alterar a Configuração da Vaga depois que uma instância já foi criada
  **nunca** altera, reinterpreta ou realinha essa instância já existente
  (exemplo completo na seção 9.5) — mesmo princípio de não retroatividade
  já exigido pela ADR-0022 e reafirmado por toda SPEC anterior.

### 4.3 Instância de Pré-Entrevista (`PreInterview`)

Instância de um formulário estruturado, respondido pelo candidato,
vinculada exclusivamente a uma `CandidateApplication` (SPEC-012).
Representa a execução concreta de uma Tentativa (seção 4.1-C, seção 11)
daquela candidatura.

Campos conceituais mínimos:

- `id`;
- `organization_id`;
- `candidate_application_id`;
- `attempt_number` (seção 11 — número sequencial da tentativa dentro da
  mesma `CandidateApplication`, sem regra numérica de limite);
- `previous_attempt_id`, opcional (referência à instância imediatamente
  anterior, quando esta instância nasceu de uma reabertura, seção 12);
- `status` (seção 5);
- `job_opening_id` e `job_opening_version_id` (seção 4.3.1, seção 19 —
  equivalentes herdados e imutáveis, nunca fonte de verdade divergente da
  `CandidateApplication`);
- `blueprint_version_id`, opcional (seção 19);
- `started_at`, opcional;
- `submitted_at`, opcional;
- `cancelled_at`, opcional;
- `cancelled_by_user_id`, opcional;
- `cancellation_reason`, opcional;
- `expired_at`, opcional;
- autoria de criação (seção 8.4);
- timestamps.

A Pré-Entrevista **pertence exclusivamente à `CandidateApplication`**.
Ela:

- nunca pertence ao `Candidate` principal — nenhuma resposta, status,
  tentativa ou evento de Pré-Entrevista é gravado no `Candidate`
  (ADR-0023, seção "Pré-Entrevista"; SPEC-012, RN-037);
- nunca pertence à `Job Opening` nem à `Job Opening Version` — a vaga é
  apenas referenciada, por herança da `CandidateApplication`, nunca dona
  da instância (mesmo princípio já aplicado à `Interview` pela ADR-0015:
  "a entrevista não pertence diretamente a Job Opening");
- nunca pertence ao Blueprint Organizacional — o Blueprint apenas
  contextualiza (seção 19), nunca é proprietário da instância (ADR-0021,
  seção "Relacionamento com o Processo Seletivo": "o Blueprint nunca
  altera automaticamente decisões humanas");
- nunca pertence à Organization diretamente — o vínculo com a
  Organization é sempre derivado da `CandidateApplication`, nunca uma
  associação independente.

#### 4.3.1 Snapshot de contexto da instância

Ao criar a instância (seção 8.3), o sistema preserva, no mínimo, as
seguintes referências contextuais, equivalentes ao momento exato da
criação — nunca resolvidas novamente depois:

- `candidate_application_id` — vínculo estrutural permanente e imutável
  (seção 4.3);
- `job_opening_id` — herdado da `Job Opening` referenciada pela
  `CandidateApplication`, nunca resolvido de forma independente;
- `job_opening_version_id` — herdado, de forma imutável, da
  `job_opening_version_id` já registrada e imutável na
  `CandidateApplication` associada (SPEC-012, RN-007); esta SPEC nunca
  duplica esse valor de forma divergente — ele é sempre resolvido por
  vínculo com a `CandidateApplication`, mas conceitualmente presente e
  estável na instância, mesmo princípio já usado pela `Interview`
  (SPEC-013, ADR-0015: "esses contextos são herdados da
  CandidateApplication");
- `blueprint_version_id`, quando aplicável (seção 19) — registrado
  diretamente na instância, resolvido uma única vez no momento da
  criação;
- a configuração contextual necessária (o `enabled` e a lista de
  perguntas vigentes na Configuração da Vaga no momento exato da
  criação, seção 4.2);
- o conjunto de perguntas selecionadas para esta instância;
- o snapshot de cada pergunta (`PreInterviewQuestion`, seção 4.4, seção
  9.3).

Nenhuma dessas referências é reavaliada depois da criação. Alterações
futuras na `JobOpeningPreInterviewSettings`, republicação da Vaga, ou
ativação de uma nova Blueprint Version nunca alteram uma instância já
criada (seção 4.2.1, seção 19).

### 4.4 Pergunta Preparada (`PreInterviewQuestion`)

Representa uma pergunta incluída em uma Pré-Entrevista concreta, com
snapshot preservado no momento da inclusão. Ver seção 9.2 para a
justificativa desse desenho e seção 9.3 para o snapshot mínimo.

Campos conceituais mínimos:

- `id`;
- `organization_id`;
- `pre_interview_id`;
- `question_catalog_item_id`;
- snapshot de título;
- snapshot de texto;
- snapshot de tipo;
- snapshot de categoria;
- snapshot de opções;
- snapshot de configurações;
- ordem na instância;
- obrigatoriedade;
- timestamps.

`PreInterviewQuestion` nunca armazena resposta — respostas pertencem
exclusivamente a `PreInterviewResponse` (seção 4.5), uma entidade própria
e distinta.

### 4.5 Resposta (`PreInterviewResponse`)

Representa a resposta do candidato a uma `PreInterviewQuestion`.

Campos conceituais mínimos:

- `id`;
- `organization_id`;
- `pre_interview_id`;
- `pre_interview_question_id`;
- resposta estruturada;
- `submitted` (booleano — distingue resposta em rascunho/parcial de
  resposta submetida definitivamente, seção 10);
- timestamps.

### 4.6 Evento (`PreInterviewEvent`)

Registro imutável da linha do tempo de uma Pré-Entrevista. Ver seção 26.

## 5. Estados Canônicos

Estados canônicos, exclusivos desta entidade — nunca reutilizados de
`CandidateApplication` (SPEC-012), `Interview` (SPEC-013), `Candidate`
(SPEC-011) ou Blueprint (ADR-0022), consistente com o princípio de que
"estados de candidatura são independentes dos estados de Candidate e Job
Opening" (SPEC-012, RN-039) e de que os vocabulários de estado de cada
módulo "nunca devem ser confundidos entre si" (ADR-0022, seção "Estados
conceituais"):

- `draft`;
- `available`;
- `in_progress`;
- `completed`;
- `cancelled`;
- `expired`.

`completed`, `cancelled` e `expired` são estados finais. Estados finais
nunca retornam a um estado operacional (`draft`, `available`,
`in_progress`) — mesmo princípio aplicado a `CandidateApplication`
(SPEC-012, RN-016) e a `Interview` (SPEC-013, "estados finais nao retornam
para estados operacionais"). Nenhuma transição desta máquina de estados
jamais reabre uma instância histórica (seção 12).

### 5.1 `draft`

**Significado:** a instância foi criada, mas ainda está em preparação —
suas perguntas estão sendo definidas ou ajustadas — e nunca é visível ao
candidato neste estado.

**Papel preciso deste estado (para não deixar sem semântica clara):**
`draft` existe para o cenário em que owner/admin criam manualmente uma
instância para uma `CandidateApplication` já existente (fluxo interno,
seção 8.1) e ainda precisam ajustar seu conjunto de perguntas antes de
liberá-la ao candidato. No fluxo automático decorrente de Candidatura
Pública (seção 7), em que a Configuração da Vaga já está corrente e
congelada no momento da criação (seção 4.3.1), a instância nasce em
`draft` e transiciona para `available` imediatamente, na mesma operação de
criação (seção 8.3), sem intervenção humana intermediária — `draft` é,
nesse caminho, um estado transitório interno, nunca observável pelo
candidato, nunca persistido como uma pausa funcional.

**Quem pode alterar:** o sistema cria a instância neste estado (seção
8.1); owner/admin podem ajustar a lista de perguntas preparadas (por
exemplo, incluir uma pergunta adicional específica daquela candidatura)
enquanto o estado permanecer `draft`.

**Pode ir para:** `available` (quando a preparação é concluída e a
Pré-Entrevista é liberada ao candidato); `cancelled` (owner/admin cancela
antes de liberar, seção 13).

**Transições proibidas:** ir diretamente para `in_progress`, `completed`
ou `expired` sem passar por `available`.

### 5.2 `available`

**Significado:** a Pré-Entrevista está pronta e liberada; o candidato pode
acessá-la e ainda não a iniciou. Especificamente, `available` significa
que:

- a configuração contextual da instância já está congelada (seção
  4.3.1);
- a instância está pronta, com todas as perguntas preparadas;
- o Candidate pode iniciar a qualquer momento;
- nenhuma resposta foi ainda submetida, e nenhum evento caracterizando
  início (seção 5.3) ocorreu.

**Quem pode alterar:** o sistema libera para este estado a partir de
`draft`; o Candidate inicia (transição para `in_progress`, critério
determinístico na seção 5.3); owner/admin podem cancelar; o sistema marca
`expired` quando o prazo definido pela implementação decorrer sem início
(seção 14).

**Pode ir para:** `in_progress` (candidato inicia); `cancelled`
(owner/admin, seção 13); `expired` (sistema, seção 14).

**Transições proibidas:** ir diretamente para `completed` sem passar por
`in_progress`; retornar para `draft`.

### 5.3 `in_progress`

**Significado:** o candidato iniciou e está respondendo; respostas em
rascunho/parciais podem ser salvas (seção 10.1).

**Critério determinístico de início:** a transição de `available` para
`in_progress` ocorre no primeiro dos dois eventos a acontecer:

- uma ação explícita de "iniciar" registrada pelo Candidate (grava
  `started_at`); ou
- o primeiro salvamento válido de uma resposta em rascunho, quando a
  interface não exigir uma ação explícita de início separada.

Qualquer um dos dois eventos, o que ocorrer primeiro, transiciona a
instância para `in_progress` e grava `started_at`. Não existe estado
intermediário entre "ação de iniciar" e "primeira resposta salva" — o
sistema trata ambos como o mesmo evento funcional de início.

**Quem pode alterar:** o Candidate salva respostas em rascunho e realiza o
envio final (transição para `completed`, seção 10.2); owner/admin podem
cancelar administrativamente; o sistema marca `expired` quando o prazo
definido pela implementação decorrer sem envio final (seção 14).

**Pode ir para:** `completed` (candidato envia); `cancelled` (owner/admin,
seção 13); `expired` (sistema, seção 14).

**Transições proibidas:** retornar para `draft` ou `available`.

### 5.4 `completed`

**Significado:** o candidato enviou definitivamente a Pré-Entrevista;
todas as perguntas obrigatórias foram respondidas; a instância aguarda
análise humana. Estado final.

**Quem pode alterar:** ninguém — é terminal. Nenhum ator move a instância
para fora deste estado. A partir deste estado, respostas, perguntas
preparadas, snapshot e o próprio estado tornam-se integralmente imutáveis
(seção 17).

**Pode ir para:** nenhum estado (final). Uma nova tentativa é sempre uma
nova instância (seção 11, seção 12) — nunca uma transição de saída desta
mesma instância.

**Transições proibidas:** qualquer transição de saída desta mesma
instância, inclusive para `cancelled` ou `expired`. Em particular,
**nunca** `completed → in_progress`.

### 5.5 `cancelled`

**Significado:** encerramento administrativo, com motivo obrigatório
(por exemplo, candidatura cancelada, vaga encerrada, criação por engano,
decisão de negócio). Estado final. Somente owner/admin cancelam — o
Candidate nunca cancela explicitamente (seção 13).

**Quem pode alterar:** ninguém — é terminal a partir do momento em que é
atingido. Somente owner/admin podem levar a instância a este estado, a
partir de `draft`, `available` ou `in_progress`.

**Pode ir para:** nenhum estado (final).

**Transições proibidas:** qualquer transição de saída; nunca a partir de
`completed` ou `expired` (ambos também finais).

### 5.6 `expired`

**Significado:** o prazo de resposta, cujo valor numérico fica para a
implementação (seção 33), esgotou-se sem que o candidato tenha concluído
o envio (`expires_at` ultrapassado, seção 14). Estado final.

**Quem pode alterar:** o sistema marca automaticamente, a partir de
`available` ou `in_progress`; nenhum ator humano transiciona manualmente
para este estado (distinção deliberada de `cancelled`, que é sempre um
ato humano com motivo).

**Pode ir para:** nenhum estado (final).

**Transições proibidas:** qualquer transição de saída; nunca a partir de
`draft`, `completed` ou `cancelled`. Em particular, **nunca**
`expired → available`.

### 5.7 Resumo de transições permitidas

| De \ Para | draft | available | in_progress | completed | cancelled | expired |
| --- | :---: | :---: | :---: | :---: | :---: | :---: |
| draft | — | Sim | Não | Não | Sim | Não |
| available | Não | — | Sim | Não | Sim | Sim |
| in_progress | Não | Não | — | Sim | Sim | Sim |
| completed | Não | Não | Não | — | Não | Não |
| cancelled | Não | Não | Não | Não | — | Não |
| expired | Não | Não | Não | Não | Não | — |

Nenhuma transição fora desta matriz é aceita. Em especial, ficam
explicitamente confirmadas como sempre proibidas: `completed →
in_progress`, `expired → available`, `cancelled → available`, e qualquer
transição de saída a partir de `completed`, `cancelled` ou `expired`.

## 6. Relação com `current_stage`

Fica confirmado, definitivamente, para a versão 1.0 desta SPEC: a
Pré-Entrevista **não** cria nenhum valor novo no enum
`CandidateApplication.current_stage` (SPEC-012/ADR-0014: `applied`,
`screening`, `interview`, `assessment`, `offer`, `completed`). A SPEC-012
não é alterada por esta SPEC.

A Pré-Entrevista é um **subfluxo/entidade vinculada** à
`CandidateApplication`, com seu próprio ciclo de vida (seção 5) e seu
próprio `status`, que representa integralmente sua execução — nunca uma
etapa reaproveitada do pipeline de `current_stage`.

Uma futura decisão de integrar este subfluxo mais diretamente ao pipeline
(por exemplo, criando uma etapa canônica própria, ou condicionando
transições de `current_stage` ao status da Pré-Entrevista) exigirá revisão
própria e explícita — desta SPEC e, se necessário, da SPEC-012 — nunca uma
alteração silenciosa.

## 7. Efeito sobre a `CandidateApplication`

A Pré-Entrevista nunca altera automaticamente, na `CandidateApplication`
associada:

- `application_status`;
- `current_stage` (seção 6);
- finalização (`finalized_at`, `finalized_by_user_id`,
  `finalization_reason`);
- `rejected`;
- `hired`;
- score;
- ranking.

A conclusão de uma Pré-Entrevista (transição para `completed`, seção 5.4)
**apenas** conclui aquele subfluxo — ela nunca dispara, por si só, nenhuma
movimentação de pipeline, nenhuma finalização e nenhuma decisão sobre a
`CandidateApplication`. Qualquer movimentação do processo seletivo
permanece exclusivamente humana e funcional, seguindo integralmente as
regras já definidas pela SPEC-012 — mesmo princípio já aplicado à
`Interview` pela ADR-0015: "a entrevista não movimenta automaticamente a
CandidateApplication".

## 8. Fluxo Principal

```text
Portal Público (SPEC-019)
↓
Candidatura Pública (SPEC-020)
↓
CandidateApplication criada
↓
(SPEC-020 termina — confirmação já apresentada; ver seção 8.2)
↓
Sistema verifica: esta vaga possui Pré-Entrevista configurada e ativa?
↓
não → fluxo desta SPEC termina, CandidateApplication segue seu curso normal (SPEC-012)
↓
sim
↓
Sistema valida Candidate ativo, consentimento operacional válido,
CandidateApplication ativa e ausência de tentativa não finalizada (seção 11)
↓
Sistema cria instância da Pré-Entrevista (`draft` → `available`, seção 8.3)
↓
Candidato acessa e inicia (`in_progress`, critério da seção 5.3)
↓
Candidato responde (respostas em rascunho podem ser salvas, seção 10.1)
↓
Candidato envia (submissão final idempotente, seção 22)
↓
status `completed`
↓
aguarda análise humana (owner/admin, SPEC-012)
```

Nenhuma etapa deste fluxo envolve IA, pontuação, triagem automática ou
decisão (seção 25).

### 8.1 Condições para criar uma nova instância

Uma nova instância de Pré-Entrevista só pode ser criada quando,
simultaneamente:

- a `CandidateApplication` associada está `active` (SPEC-012, seção 5);
- o `Candidate` associado está `active` (SPEC-011, seção 5; ver seção 20
  para bloqueio quando `inactive`);
- o consentimento operacional do `Candidate` está `granted` (SPEC-011,
  seção 8.14; ver seção 20);
- a `Job Opening Version` referenciada pela `CandidateApplication`
  continua correspondendo a uma `Job Opening` cuja Configuração de
  Pré-Entrevista (seção 4.2) está `enabled` e possui ao menos uma pergunta
  configurada;
- não existe, para a mesma `CandidateApplication`, nenhuma outra instância
  de Pré-Entrevista em estado não final (`draft`, `available` ou
  `in_progress`) — no máximo uma instância operacional por
  `CandidateApplication` a qualquer momento (seção 11, seção 23);
- a Organization está ativa (não arquivada, seção 28).

Quando a vaga não possui Pré-Entrevista configurada e ativa, nenhuma
instância é criada, e o fluxo da `CandidateApplication` continua
normalmente, sem nenhum bloqueio ou pendência introduzida por esta SPEC.

### 8.2 Desacoplamento da SPEC-020

A criação da instância de Pré-Entrevista é uma **operação própria e
distinta desta SPEC**, executada como um segundo caso de uso, sempre
**depois** que a `CandidateApplication` já foi criada, validada e
confirmada pela SPEC-020 — nunca dentro da mesma transação atômica da
SPEC-020 (SPEC-020, seção 12: "1. validar a Vaga; ...; 6. criar a
CandidateApplication; ...; 8. confirmar (commit)" já encerra ali,
integralmente, o escopo transacional daquela SPEC).

Ficam formalizados, explicitamente:

- a SPEC-020 termina depois da `CandidateApplication` válida e da
  confirmação apresentada ao visitante — nada desta SPEC-021 é executado
  dentro do escopo transacional da SPEC-020;
- a criação e a disponibilização da Pré-Entrevista ocorrem em uma operação
  posterior, própria desta SPEC-021, lógica e temporalmente após a
  conclusão da SPEC-020;
- uma falha ao criar a instância de Pré-Entrevista **nunca** pode causar
  rollback da candidatura pública já concluída — a `CandidateApplication`
  permanece válida independentemente do resultado desta operação
  posterior;
- a candidatura continua válida e operacional mesmo se a Feature de
  Pré-Entrevista estiver temporariamente indisponível, com falha técnica,
  ou atrasada — mesmo princípio de fail-safe já estabelecido pela
  ADR-0016 e pela ADR-0019 para IA, aplicado aqui a esta Feature: ausência
  ou falha de uma capacidade opcional nunca bloqueia o fluxo humano
  principal já concluído.

Esta SPEC não define a tecnologia usada para essa execução posterior (fila
técnica, worker assíncrono, chamada síncrona imediatamente após a
confirmação, ou qualquer outro mecanismo). O que fica definido, em nível
funcional, é apenas: **criação automática, logicamente posterior à
CandidateApplication**, como um segundo caso de uso desacoplado — nunca a
mesma transação, nunca a mesma unidade atômica de falha. Definição de
tecnologia de fila (job queue) fica para especificação técnica futura.

### 8.3 Fluxo de criação

1. Sistema identifica a `CandidateApplication` recém-criada (ou, para
   fluxo interno, uma `CandidateApplication` já existente selecionada por
   owner/admin).
2. Sistema valida as condições da seção 8.1.
3. Sistema resolve a Configuração de Pré-Entrevista vigente da `Job
   Opening` (seção 4.2).
4. Sistema cria a instância em `draft`, com `attempt_number` calculado
   (seção 11) e o snapshot de contexto congelado (seção 4.3.1).
5. Sistema copia, para `PreInterviewQuestion`, o snapshot de cada pergunta
   configurada (seção 9.2, seção 9.3).
6. Sistema registra `job_opening_id`, `job_opening_version_id` e
   `blueprint_version_id`, quando aplicável (seção 19).
7. Sistema transiciona a instância para `available`.
8. Sistema registra evento de criação e evento de disponibilização
   (seção 26).
9. Sistema registra auditoria sem copiar dados pessoais completos.

Toda a operação (passos 4 a 8) deve ser atômica **em relação a si mesma**:
falha em qualquer etapa não deve deixar uma instância parcialmente criada,
sem perguntas preparadas ou em estado inconsistente — mesmo princípio já
exigido pela SPEC-012 (criação de `CandidateApplication`) e pela SPEC-013
(criação de `Interview`). Esta atomicidade é interna à criação da
Pré-Entrevista; ela nunca se estende retroativamente à transação já
concluída da SPEC-020 (seção 8.2).

### 8.4 Autoria da criação

A criação da instância de Pré-Entrevista é sempre um **ato do sistema**,
nunca atribuída a um `User`, a Platform Admin, a `owner`, a `admin` ou a
qualquer ator fictício — mesmo princípio conceitual já formalizado pela
SPEC-011 (`creation_origin`) e pela Blueprint Version (`created_source`,
Fase 15) para registros criados sem ator humano direto: `created_by_user_id`
é nulo, e a origem de criação é registrada como `system_triggered`
(quando decorrente de Candidatura Pública) ou, quando owner/admin cria
manualmente uma instância para uma candidatura interna (seção 8.1), o
`created_by_user_id` correspondente é preenchido.

## 9. Perguntas (Banco de Perguntas)

Esta SPEC não cria um Banco de Perguntas. Ela reutiliza integralmente a
SPEC-009. Cada Pré-Entrevista referencia perguntas por
`question_catalog_items.id`. Esta SPEC nunca copia o Banco de Perguntas em
si (não cria um segundo catálogo) e nunca altera pergunta alguma do
catálogo (SPEC-009 permanece a única autoridade sobre criação, edição e
inativação de perguntas).

### 9.1 Referência, não segundo catálogo

A Configuração de Pré-Entrevista da Vaga (seção 4.2) apenas referencia
`question_catalog_items.id` já existentes, pertencentes à mesma
Organization e operacionalmente ativos no momento em que são incluídos na
configuração. Nenhuma pergunta nova é criada por esta SPEC.

### 9.2 Snapshot no momento da inclusão

Quando uma pergunta referenciada é incluída em uma Pré-Entrevista
**concreta** (`PreInterviewQuestion`, seção 4.4, no momento da criação
descrita na seção 8.3), o sistema preserva um snapshot (seção 9.3) — o
mesmo padrão conceitual já estabelecido pela SPEC-013 e pela ADR-0015 para
`Interview Question`, para o mesmo problema técnico: perguntas do Banco de
Perguntas são mutáveis (podem ser editadas ou inativadas ao longo do
tempo, SPEC-009), e uma resposta já enviada pelo candidato precisa
permanecer interpretável segundo o texto exato que lhe foi apresentado,
sem reinterpretação retroativa quando o item do catálogo mudar depois
(ADR-0022, seção "Não retroatividade"; princípio geral de imutabilidade
histórica reafirmado em toda SPEC anterior).

Este snapshot não é a criação de um "segundo Banco de Perguntas": é a
preservação pontual do estado de uma referência já existente no momento em
que ela é usada — o mesmo princípio já usado pela SPEC-013 ("o snapshot da
pergunta deve preservar... alterações futuras no banco de perguntas não
modificam entrevistas já preparadas ou concluídas"), aqui aplicado como
**snapshot histórico do contexto de execução**, nunca como um catálogo
paralelo. A Configuração de Pré-Entrevista da Vaga (seção 4.2), por sua
vez, **não** mantém snapshot — ela guarda apenas a referência viva
(`question_catalog_items.id`), porque ainda não foi usada por nenhuma
candidatura concreta; o snapshot só nasce quando uma pergunta é
efetivamente incluída em uma instância.

### 9.3 Snapshot mínimo da pergunta

O snapshot preservado em `PreInterviewQuestion` deve conter, no mínimo, as
informações necessárias à interpretação histórica da resposta:

- `question_catalog_item_id`;
- título;
- texto;
- tipo;
- categoria (`category`, já campo obrigatório de `question_catalog_items`,
  SPEC-009);
- opções, quando aplicável ao tipo;
- configurações necessárias à interpretação da resposta;
- obrigatoriedade;
- ordem na instância.

Não copiar informações desnecessárias à interpretação histórica — em
particular, o snapshot nunca inclui autoria interna, histórico de edição
ou metadados administrativos do item do catálogo (SPEC-009), apenas o
conteúdo funcional necessário para exibir a pergunta e interpretar a
resposta corretamente.

O snapshot da pergunta **nunca** armazena resposta — respostas pertencem
exclusivamente a `PreInterviewResponse` (seção 4.5, seção 10), nunca ao
snapshot da pergunta preparada.

### 9.4 Regras

- pergunta referenciada deve pertencer à mesma Organization;
- pergunta deve estar operacionalmente ativa no momento em que é incluída
  na Configuração da Vaga (seção 4.2) ou em uma instância concreta;
- pergunta inativada depois da inclusão permanece preservada, por
  snapshot, na instância que já a incluiu;
- não deve haver pergunta duplicada na mesma instância;
- uma instância pode ser criada com pelo menos uma pergunta configurada —
  Configuração de Vaga sem nenhuma pergunta é equivalente a "vaga sem
  Pré-Entrevista" (seção 8.1);
- alterações futuras no Banco de Perguntas nunca alteram instâncias já
  criadas — respostas usam sempre o snapshot da `PreInterviewQuestion`,
  nunca o estado atual do catálogo.

### 9.5 Alteração da configuração após a criação de uma instância

Exemplo obrigatório de como o desacoplamento entre Configuração (A) e
Instância (B) funciona na prática (seção 4.1, seção 4.2.1):

```text
Configuração da Vaga = perguntas A, B e C
↓
CandidateApplication X recebe Pré-Entrevista
↓
instância congela A, B e C (snapshot, seção 4.3.1)
↓
Admin altera configuração para A, D e E
↓
CandidateApplication X continua respondendo A, B e C
↓
nova CandidateApplication Y recebe A, D e E
```

Nenhuma alteração retroativa: a instância de `CandidateApplication X` já
criada nunca é afetada pela mudança de configuração — ela permanece
vinculada exatamente ao conjunto de perguntas congelado no momento de sua
criação, mesmo que a Configuração da Vaga mude, seja desabilitada, ou seja
reabilitada com outro conjunto de perguntas depois (seção 21).

## 10. Execução e Respostas

Cada resposta pertence exclusivamente à `CandidateApplication`, por meio
da instância de Pré-Entrevista à qual está vinculada. Ela nunca modifica o
Banco de Perguntas (SPEC-009) e nunca modifica o `Candidate` (SPEC-011).

Esta SPEC distingue explicitamente dois conceitos, que nunca devem ser
confundidos:

### 10.1 Resposta em rascunho/parcial

- pode ser criada ou atualizada livremente enquanto a instância estiver
  `in_progress`, sem exigir todas as perguntas respondidas;
- pode ser corrigida pelo próprio Candidate quantas vezes forem
  necessárias, antes do envio final;
- `submitted = false` (seção 4.5);
- salvar uma resposta em rascunho pode, por si só, caracterizar o início
  da instância (transição `available → in_progress`, critério
  determinístico da seção 5.3);
- gera auditoria mínima (`pre_interview.response_saved`, seção 26), sem
  copiar o conteúdo completo da resposta.

### 10.2 Resposta submetida/final

- só existe a partir da transição da instância para `completed` (seção
  5.4), quando toda resposta em rascunho ainda pendente de perguntas
  obrigatórias é validada e o conjunto de respostas é definitivamente
  marcado como enviado (`submitted = true`);
- **imutável** a partir desse momento (seção 17) — nenhum ator, incluindo
  o próprio Candidate, altera uma resposta submetida;
- gera auditoria (`pre_interview.submitted`, seção 26).

Esta distinção é o que permite a UX normal de um formulário: salvamento
parcial livremente editável até o envio final, seguido de imutabilidade
completa depois dele — nunca o inverso (nunca imutabilidade desde cada
salvamento parcial individual).

### 10.3 Regras gerais

- `pre_interview_question_id` deve pertencer à mesma instância;
- resposta deve ser compatível com o tipo da pergunta (snapshot, seção
  9.3);
- perguntas obrigatórias precisam de resposta antes do envio final
  (transição para `completed`);
- somente o próprio Candidate identificado pela `CandidateApplication`
  pode registrar ou corrigir suas respostas, e apenas enquanto a instância
  estiver `in_progress`;
- owner/admin nunca respondem em nome do candidato — não há papel
  administrativo de preenchimento de resposta nesta SPEC;
- o envio final (`submit`) deve ser idempotente (seção 22) — um reenvio
  decorrente de falha de rede ou duplo clique nunca produz duas
  submissões nem dois eventos de conclusão.

## 11. Tentativas

Cada `CandidateApplication` pode possuir múltiplas instâncias de
Pré-Entrevista ao longo do tempo, sempre em sequência, nunca em paralelo.
Fica formalizado o invariante central desta SPEC: **existe no máximo uma
instância em estado não final** (`draft`, `available` ou `in_progress`)
por `CandidateApplication` a qualquer momento (seção 8.1, seção 23) — uma
`CandidateApplication` pode, no entanto, possuir histórico de múltiplas
tentativas já `completed`, `cancelled` ou `expired`, sem limite conceitual.

- **Primeira tentativa:** a instância criada pelo fluxo da seção 8, com
  `attempt_number = 1` e `previous_attempt_id` nulo.
- **Nova tentativa:** uma instância adicional, com:
  - novo `id`;
  - novo snapshot de contexto (seção 4.3.1), resolvido a partir da
    Configuração vigente da Vaga no momento da nova tentativa, nunca
    herdado da tentativa anterior;
  - nova data de criação;
  - novo conjunto de respostas, sempre vazio no início;
  - vínculo à mesma `CandidateApplication`;
  - `previous_attempt_id` preenchido com o `id` da tentativa
    imediatamente anterior, quando a nova tentativa decorrer de
    reabertura (seção 12);
  - `attempt_number` incrementado sequencialmente a partir da tentativa
    anterior da mesma `CandidateApplication`.

  Criada somente depois que a tentativa anterior atingiu um estado final
  (`completed`, `cancelled` ou `expired`) e mediante reabertura autorizada
  (seção 12) — nunca criada livremente pelo candidato.

Nunca sobrescrever: uma tentativa nova nunca modifica ou substitui os
dados de uma tentativa anterior (seção 17).

Esta SPEC não define uma quantidade máxima de tentativas — esse valor
numérico fica para a implementação (seção 33).

## 12. Reabertura

"Reabertura" é linguagem operacional para a decisão administrativa
(owner/admin) de autorizar uma nova tentativa após uma tentativa anterior
ter atingido um estado final — nunca a reativação da mesma instância.
Fisicamente/conceitualmente:

- a instância anterior permanece em seu estado final, imutável, para
  sempre (seção 17);
- uma nova tentativa é criada (seção 11), seguindo integralmente o fluxo
  da seção 8, com um novo `id`, um `attempt_number` incrementado e
  `previous_attempt_id` apontando para a tentativa anterior;
- a auditoria registra que a nova tentativa decorreu de uma reabertura
  (seção 26), distinta do evento de criação técnica da nova instância;
- a instância anterior **nunca** é mutada — reabrir nunca significa mover
  uma instância `cancelled` ou `expired` de volta para um estado
  operacional (transição explicitamente proibida, seção 5.5 e 5.6).

Regras:

- somente owner/admin autorizam reabertura;
- reabertura só é aplicável depois que a tentativa anterior atingiu um
  estado final (`completed`, `cancelled` ou `expired`);
- reabertura exige que as mesmas condições de criação (seção 8.1)
  continuem válidas no momento da nova tentativa (`CandidateApplication`
  `active`, `Candidate` `active`, consentimento `granted`, Configuração de
  Pré-Entrevista da Vaga ainda `enabled`);
- a autorização de reabertura é registrada como evento próprio,
  distinto do evento de criação da nova instância (seção 26) — a decisão
  humana e a criação técnica da nova tentativa são eventos conceitualmente
  diferentes, mesmo quando ocorrem em sequência imediata;
- reabertura nunca copia ou herda respostas da tentativa anterior; a nova
  instância começa vazia, com suas próprias `PreInterviewQuestion` (novo
  snapshot, resolvido a partir da Configuração vigente da Vaga no momento
  da reabertura, seção 9.2);
- a tentativa anterior permanece integralmente preservada em seu estado
  final, nunca sobrescrita ou removida (seção 18).

Esta SPEC não define regra numérica de quantas vezes uma
`CandidateApplication` pode ser reaberta.

## 13. Cancelamento

Cancelamento é o encerramento administrativo explícito de uma instância
ainda não finalizada.

Regras:

- permitido exclusivamente para owner e admin — o Candidate **nunca**
  cancela explicitamente a própria Pré-Entrevista nesta versão; quando o
  Candidate simplesmente abandona o preenchimento sem concluir, esse
  cenário é tratado pela expiração automática (seção 14), nunca por um
  cancelamento iniciado pelo Candidate;
- permitido a partir de `draft`, `available` ou `in_progress` — nunca a
  partir de um estado já final;
- exige motivo obrigatório (`cancellation_reason`);
- registra `cancelled_at` e `cancelled_by_user_id`;
- é estado final — nunca retorna a um estado operacional;
- preserva as respostas em rascunho já registradas até o momento do
  cancelamento, sem apagá-las;
- gera evento e auditoria (seção 26);
- nunca altera automaticamente a `CandidateApplication` associada (seção
  7) — o cancelamento da Pré-Entrevista é interno a ela, consistente com
  o princípio já estabelecido pela ADR-0015 para `Interview`.

## 14. Expiração

Expiração é a transição automática, realizada pelo sistema, quando o
prazo de resposta (`expires_at`), cujo valor numérico fica para a
implementação (seção 33), é ultrapassado sem que o candidato tenha
concluído o envio.

Regras:

- ocorre quando `expires_at`, configurado pela implementação para a
  instância, é ultrapassado;
- realizada exclusivamente pelo sistema, nunca por um ato humano direto
  (distinção deliberada de cancelamento, seção 13);
- pode ser aplicada tanto por avaliação em tempo de leitura (a instância
  é reconhecida como expirada na primeira consulta feita após
  `expires_at`) quanto por uma operação programada periódica — esta SPEC
  não define scheduler nem tecnologia de agendamento;
- aplicável a partir de `available` ou `in_progress`;
- registra `expired_at`;
- é estado final — nunca retorna a um estado operacional;
- preserva respostas em rascunho já registradas até o momento da
  expiração, sem apagá-las;
- gera evento e auditoria (seção 26);
- nunca altera automaticamente a `CandidateApplication` associada (seção
  7);
- o histórico da instância expirada permanece integralmente preservado
  (seção 18).

Uma instância `expired` pode originar uma nova tentativa somente por meio
de reabertura autorizada (seção 12), nunca automaticamente.

## 15. Configuração Habilitada/Desabilitada e Vaga Fechada

### 15.1 Desabilitar a Configuração da Vaga

Quando owner/admin desabilitam a Configuração de Pré-Entrevista de uma
vaga (`enabled = false`, seção 4.2):

- nenhuma nova `CandidateApplication` daquela `Job Opening`, a partir
  desse momento, recebe uma nova instância (seção 8.1);
- instâncias já criadas **nunca desaparecem** — elas permanecem
  integralmente preservadas, com seu contexto já congelado (seção 4.3.1),
  independentemente do estado atual da Configuração;
- instâncias em `available` ou `in_progress` no momento da desabilitação
  **continuam válidas e operacionais**, porque representam um contexto já
  congelado, e não um efeito colateral corrente da Configuração;
- cancelamento dessas instâncias, se desejado, deve ser uma ação
  administrativa explícita (seção 13), com motivo — nunca um efeito
  colateral silencioso de desabilitar a Configuração da Vaga.

### 15.2 Vaga fechada após a criação da Pré-Entrevista

Quando a `Job Opening` associada à `CandidateApplication` é encerrada,
pausada ou cancelada (SPEC-010) depois que uma Pré-Entrevista já foi
criada:

- a Pré-Entrevista já existente **não é apagada nem invalidada
  automaticamente**;
- o processo seletivo interno pode continuar normalmente para a
  `CandidateApplication` já existente, dentro do que a SPEC-012 já
  permite (mesmo princípio já aplicado pela SPEC-010: fechar a Vaga
  impede novas candidaturas, mas não altera automaticamente candidaturas
  existentes);
- esta SPEC **não cria** nenhuma regra automática de cancelamento da
  Pré-Entrevista decorrente do fechamento da Vaga, sem base na SPEC-012 —
  qualquer cancelamento continua sendo uma ação administrativa explícita
  (seção 13).

## 16. Candidate Inativo e Consentimento Inválido

Esta SPEC espelha, para a Pré-Entrevista, exatamente o mesmo padrão já
formalizado pela SPEC-012 (seção "Consentimento Inválido Após a Criação")
e pela SPEC-013 (seção "Consentimento, Candidate inativo e candidatura
finalizada") — nenhum tratamento divergente é criado aqui.

### 16.1 `Candidate` inativo

Quando o `Candidate` associado se torna `inactive` (SPEC-011, seção 5):

- bloqueia a criação de nova instância (seção 8.1);
- bloqueia o início de uma instância `available`;
- bloqueia novo salvamento de resposta em rascunho e o envio final;
- bloqueia reabertura (seção 12);
- **nunca apaga** instâncias, respostas ou eventos já existentes;
- permite cancelamento administrativo (owner/admin, seção 13) e leitura
  administrativa auditada (Platform Admin);
- instâncias já `completed` permanecem preservadas e consultáveis
  normalmente (o bloqueio afeta apenas novas operações, nunca dados já
  registrados).

### 16.2 Consentimento operacional inválido (`pending`, `revoked` ou `expired`)

Quando o consentimento operacional do `Candidate` deixa de estar
`granted` (SPEC-011, seção 8.14) depois da criação da instância:

- bloqueia a criação de nova instância (seção 8.1);
- bloqueia o início de uma instância `available`;
- bloqueia novo salvamento de resposta em rascunho e o envio final;
- bloqueia reabertura (seção 12);
- **nunca apaga** instâncias, respostas ou eventos já existentes;
- permite cancelamento administrativo (owner/admin, seção 13), com
  motivo, para encerramento necessário;
- permite leitura administrativa auditada (Platform Admin) e consulta de
  histórico mínima por owner/admin;
- **nunca** altera automaticamente o estado da instância — o bloqueio
  impede apenas novas operações, nunca transiciona a instância
  silenciosamente.

Este padrão é a mesma lógica já usada pela SPEC-012 (RN-028, RN-029,
RN-030) e pela SPEC-013 ("consentimento... bloqueia... criação de nova
entrevista; início; nova resposta; nova avaliação; conclusão
operacional"), aplicada aqui sem divergência.

## 17. Atualização

Uma resposta submetida definitivamente (seção 10.2) é imutável. O sistema
nunca edita ou sobrescreve uma resposta já submetida em uma instância que
atingiu `completed`. Isso inclui:

- respostas individuais (`PreInterviewResponse`, com `submitted = true`);
- perguntas preparadas (`PreInterviewQuestion`) — o snapshot preservado
  não é reprocessado nem realinhado ao estado atual do catálogo após
  `completed`;
- o snapshot de contexto da instância (seção 4.3.1);
- o próprio estado da instância (seção 5.4).

Se for permitido ao candidato responder novamente — por exemplo, para
corrigir uma resposta considerada incompleta —, isso nunca ocorre por
edição da instância já enviada: exige-se reabertura autorizada (seção 12)
e a criação de uma nova tentativa (seção 11). Nunca sobrescrever.

Enquanto a instância estiver `in_progress`, o candidato pode corrigir suas
próprias respostas em rascunho livremente, antes do envio final (seção
10.1) — essa correção não é "atualização de resposta submetida" (que é
vedada), mas edição normal de um rascunho ainda não concluído.

## 18. Read-only

Esta seção define quando e para quem o acesso à Pré-Entrevista é somente
leitura.

- **Depois de `completed`, `cancelled` ou `expired`:** a instância inteira
  (perguntas preparadas, respostas, metadados de estado) é somente
  leitura para todos os atores, sem exceção — nenhum ator, incluindo
  owner/admin, edita o conteúdo de uma instância finalizada (a única ação
  possível sobre uma instância finalizada é autorizar reabertura, que cria
  uma instância nova, seção 12).
- **owner/admin:** possuem leitura completa das respostas de qualquer
  instância da Organization, em qualquer estado, sempre somente leitura —
  a interação de owner/admin com o conteúdo das respostas nesta SPEC é
  exclusivamente de consulta, nunca de edição (owner/admin nunca
  respondem em nome do candidato, seção 10).
- **member:** leitura restrita ao DTO positivo (seção 24) — apenas
  existência e status da Pré-Entrevista, sempre somente leitura, nunca o
  conteúdo das respostas.
- **Candidate:** leitura e escrita das próprias respostas em rascunho
  apenas enquanto a instância estiver `in_progress`; a partir de
  `completed`, torna-se somente leitura também para o próprio Candidate,
  se e quando uma experiência futura de acompanhamento existir (seção
  25.1).
- **Platform Admin:** leitura administrativa auditada, com motivo,
  sempre somente leitura, nunca cria, responde, edita, cancela ou
  autoriza reabertura (seção 24).

## 19. Versionamento

A Pré-Entrevista deve registrar, no momento de sua criação:

- **Job Opening e Job Opening Version:** ambos herdados, de forma
  imutável, da `CandidateApplication` associada (SPEC-012, RN-002,
  RN-007) — a instância mantém referências conceitualmente equivalentes
  (`job_opening_id`, `job_opening_version_id`, seção 4.3.1) sem nunca se
  tornarem uma fonte de verdade divergente. Mudança ou nova publicação
  futura da Vaga nunca altera a instância já existente, nunca altera suas
  respostas, e nunca altera seu histórico — mesmo princípio de herança,
  sem duplicação divergente, já usado pela `Interview` (SPEC-013,
  ADR-0015: "esses contextos são herdados da CandidateApplication").
- **Blueprint Version:** quando a Pré-Entrevista utiliza contexto do
  Blueprint, registrada diretamente na instância (`blueprint_version_id`,
  seção 4.3), como referência de contexto no momento da criação —
  aplicação direta do que a ADR-0022 já antecipa, de forma prospectiva:
  "Pré-Entrevista pode registrar a versão do Blueprint usada" (ADR-0022,
  seção "Dossiê e Pré-Entrevista futuros"). Campo opcional, preenchido
  apenas quando existir uma Blueprint Version `active` resolvível para a
  Organization no momento da criação. Uma nova Blueprint Version, ativada
  depois, nunca reinterpreta a instância antiga, nunca altera as
  perguntas já congeladas, e nunca altera as respostas já registradas.
- **Question Version:** o Banco de Perguntas (SPEC-009) não possui, nesta
  fase, versionamento formal (ADR-0022, seção "Componentes ainda não
  versionados": "não há versionamento formal de perguntas"). Por isso,
  esta SPEC não registra um `question_version_id` autônomo — o snapshot
  por pergunta (`PreInterviewQuestion`, seção 9.2, seção 9.3) cumpre, na
  prática, o mesmo papel de preservação de contexto até que o Banco de
  Perguntas evolua para versionamento formal próprio, ocasião em que esta
  SPEC deverá ser revisada para registrar a referência explícita.

Nunca atualizar essas referências retroativamente: uma vez criada, a
Pré-Entrevista mantém `blueprint_version_id`, `job_opening_id` e
`job_opening_version_id` exatamente como resolvidos no momento de sua
criação, mesmo que o Blueprint seja reativado ou a Vaga seja republicada
depois (mesmo princípio de não retroatividade já exigido pela ADR-0022 e
pela SPEC-012).

## 20. Histórico

Toda mudança relevante de uma instância de Pré-Entrevista deve preservar
histórico imutável, registrado em `PreInterviewEvent` (seção 4.6, seção
26). Nenhum evento é apagado ou sobrescrito; uma correção deve gerar novo
evento, nunca substituir o evento original.

O histórico de uma instância finalizada (`completed`, `cancelled` ou
`expired`) permanece integralmente acessível a owner/admin e, mediante
motivo e auditoria, a Platform Admin — nunca apagado quando uma nova
tentativa é criada por reabertura (seção 12). Tentativas anteriores da
mesma `CandidateApplication` continuam consultáveis lado a lado com a
tentativa mais recente, inclusive por meio de `previous_attempt_id`
(seção 4.3, seção 11).

Histórico pertence à Organization da `CandidateApplication` e respeita o
mesmo isolamento multiempresa exigido em toda a plataforma (ADR-0020).

## 21. Concorrência

Cenários a cobrir, com o banco de dados como autoridade final (nunca a
aplicação sozinha):

- duas criações simultâneas da primeira tentativa para a mesma
  `CandidateApplication`: apenas uma instância não finalizada deve
  prevalecer (seção 11, seção 23) — protegida pela mesma restrição de
  unicidade operacional já usada, por analogia, pela SPEC-012 (RN-012,
  unicidade ativa de `CandidateApplication`);
- dois "iniciar" (`start`) simultâneos da mesma instância: apenas uma
  transição para `in_progress` deve ocorrer; a segunda operação é
  idempotente (seção 22), sem gerar segundo evento de início;
- dois salvamentos simultâneos da mesma resposta em rascunho: a instância
  deve ser revalidada dentro da transação antes de qualquer gravação — a
  primeira operação confirmada prevalece, sem perda silenciosa de dado;
- salvamento de resposta em rascunho concorrendo com o envio final: a
  instância deve ser revalidada dentro da transação antes de qualquer
  gravação — a primeira operação confirmada prevalece;
- dois envios finais (`submit`) simultâneos da mesma instância: apenas um
  deve produzir a transição para `completed`; o segundo é idempotente
  (seção 22) e recebe o mesmo resultado seguro, sem duplicar o evento de
  envio nem criar uma segunda tentativa;
- nova tentativa concorrente (duas autorizações simultâneas de
  reabertura, seção 12) para a mesma `CandidateApplication`: apenas uma
  nova tentativa deve prevalecer, protegida pela mesma restrição de
  instância não-finalizada única (seção 23);
- cancelamento administrativo concorrendo com envio final do candidato: a
  primeira operação confirmada prevalece; a segunda recebe conflito
  seguro, nunca duas transições simultâneas para estados finais
  diferentes (mesmo princípio já exigido pela SPEC-012, RN-069, e pela
  ADR-0022, seção "Concorrência");
- expiração automática concorrendo com envio final do candidato: a
  primeira confirmada prevalece — se o envio for confirmado antes da
  expiração ser processada, a instância permanece `completed`; se a
  expiração for confirmada primeiro, o envio subsequente é recusado com
  conflito seguro.

Toda operação crítica desta SPEC deve ocorrer em transação, com
revalidação de estado dentro da própria transação, impedindo qualquer
estado impossível — seguindo o mesmo padrão já exigido pela SPEC-012
(seção 7.1, "Concorrência de Pipeline") e pela SPEC-013 (seção "Início":
"operação deve ser transacional").

## 22. Idempotência

Operações públicas desta SPEC — iniciar, salvar resposta em rascunho, e
principalmente enviar (`submit final`) — podem sofrer retry de rede (falha
de conexão, duplo clique, timeout de cliente). Esta SPEC exige
comportamento idempotente onde necessário, sem definir a implementação
física exata (mesmo princípio conceitual já registrado pela SPEC-020,
seção 15, para o mesmo tipo de problema no fluxo público):

- **iniciar:** duas chamadas de início para a mesma instância nunca
  produzem dois eventos `pre_interview.started` nem dois `started_at`
  divergentes — a segunda chamada retorna o mesmo resultado da primeira,
  sem efeito colateral adicional;
- **salvar resposta em rascunho:** salvamentos repetidos da mesma
  resposta (mesmo `pre_interview_question_id`) nunca criam múltiplos
  registros de resposta para a mesma pergunta na mesma instância — o
  salvamento é sempre uma operação de upsert conceitual, nunca de
  inserção cega;
- **enviar (`submit final`):** é a operação mais crítica desta seção —
  `submit final` **não pode duplicar conclusão nem tentativa**: duas
  chamadas de envio para a mesma instância nunca produzem duas transições
  para `completed`, nunca geram dois eventos `pre_interview.submitted`, e
  nunca criam uma segunda tentativa. A segunda chamada, quando a primeira
  já foi confirmada, deve retornar o mesmo resultado seguro da primeira,
  sem efeito colateral adicional.

Esta SPEC não define implementação física (chave de idempotência,
mecanismo de deduplicação, cabeçalho HTTP específico) — apenas exige que
o comportamento observável seja idempotente nos três casos acima. Quando
uma implementação técnica futura optar por um mecanismo de chave de
idempotência, o mesmo princípio já registrado pela SPEC-020 (seção 15) —
chave transportada fora do payload de dados pessoais — deve ser
observado.

## 23. Invariante de Instância Única

Fica formalizado, como invariante central de concorrência e de integridade
de dados desta SPEC: **uma `CandidateApplication` nunca possui duas
tentativas simultaneamente operacionais** (`available` ou `in_progress`,
e por extensão `draft`) da mesma Pré-Entrevista. Ela pode possuir histórico
de múltiplas tentativas já finalizadas (`completed`, `cancelled` ou
`expired`), sem limite conceitual (seção 11).

Este invariante deve ser protegido por restrição de persistência (nunca
apenas pela aplicação) — mesmo padrão já exigido pela SPEC-012 para a
unicidade de `CandidateApplication` `active` por par Candidate + Job
Opening (RN-011, RN-012).

## 24. Permissões

Todas as ações funcionais de owner, admin e member exigem User ativo,
Membership ativo, Organization ativa e role autorizada (mesmo padrão de
toda SPEC anterior). A resposta do Candidate (seção 10) é uma exceção
deliberada, análoga à já formalizada pela SPEC-020 para a submissão
pública: não exige User nem Membership, pois não é uma ação funcional
executada por um membro da Organization.

| Ação | Platform Admin | owner | admin | member | Candidate |
| --- | :---: | :---: | :---: | :---: | :---: |
| Configurar Pré-Entrevista da vaga (habilitar, selecionar perguntas) | Não | Sim | Sim | Não | Não |
| Consultar existência e status da Pré-Entrevista (DTO restrito) | Não | Sim | Sim | Restr. | Sim (a própria) |
| Consultar respostas completas | Não | Sim | Sim | Não | Sim (as próprias, enquanto `in_progress`) |
| Iniciar Pré-Entrevista | Não | Não | Não | Não | Sim |
| Registrar/corrigir resposta em rascunho | Não | Não | Não | Não | Sim |
| Enviar (transição para `completed`) | Não | Não | Não | Não | Sim |
| Cancelar | Não | Sim | Sim | Não | Não |
| Autorizar reabertura (nova tentativa) | Não | Sim | Sim | Não | Não |
| Consultar histórico/eventos | Não | Sim | Sim | Não | Não |
| Leitura administrativa auditada com motivo | Sim | Não | Não | Não | Não |

### 24.1 Owner e Admin

Nesta versão, `owner` e `admin` possuem exatamente os mesmos poderes sobre
a Pré-Entrevista, sem nenhuma ação exclusiva de `owner` — diferente, por
exemplo, do padrão já usado pela SPEC-012 para `hired` (exclusivo de
`owner`) ou pela SPEC-005/SPEC-008/SPEC-010/ADR-0022 para publicação
(exclusiva de `owner`). Não há, nesta fase, nenhuma ação sobre a
Pré-Entrevista com risco ou impacto equivalente a essas, que justifique
reservar exclusividade a `owner`; ambos podem, igualmente:

- configurar a Pré-Entrevista da vaga (habilitar/desabilitar, selecionar
  perguntas, seção 4.2);
- consultar instâncias e histórico;
- consultar respostas completas;
- cancelar (seção 13);
- autorizar reabertura / criar nova tentativa (seção 12).

Uma revisão futura desta SPEC pode reservar exclusividade a `owner` sobre
alguma dessas ações, caso uma necessidade de negócio específica surja —
esta versão não antecipa essa restrição sem necessidade.

### 24.2 Member

A regra desta versão é intencional e definitiva para 1.0: `member`
visualiza somente existência e status da Pré-Entrevista (DTO abaixo), nunca
o conteúdo das respostas. Respostas de Pré-Entrevista são material de
recrutamento; nesta fase, apenas `owner`/`admin` as consultam. Ainda não
existe, em nenhuma SPEC aprovada, um papel operacional de
"entrevistador"/"recrutador" para `member` sobre este conteúdo específico
— quando esse papel existir, uma revisão própria desta SPEC deverá
ampliar essa permissão de forma explícita, nunca silenciosa.

DTO positivo de `member` (para `CandidateApplication` `active` que já
pode visualizar, SPEC-012, seção 12):

- `id` da Pré-Entrevista;
- `status`;
- `attempt_number`.

`member` nunca visualiza: conteúdo de perguntas, respostas, motivos de
cancelamento, eventos, `blueprint_version_id`, `job_opening_version_id`,
ou qualquer outro campo fora da lista acima.

### 24.3 Candidate

O Candidate pode apenas:

- acessar a própria instância via mecanismo seguro futuro (seção 25.1);
- iniciar (seção 5.3);
- salvar as próprias respostas em rascunho (seção 10.1);
- enviar (seção 10.2);
- consultar confirmação/status mínimo da própria instância.

O Candidate nunca:

- acessa instância de outra `CandidateApplication`;
- escolhe a Blueprint Version ou a Job Opening Version usadas (sempre
  resolvidas pelo sistema, seção 4.3.1);
- escolhe perguntas (sempre resolvidas pela Configuração da Vaga, seção
  4.2);
- altera o snapshot de contexto ou de pergunta;
- cria uma nova tentativa arbitrariamente (sempre depende de reabertura
  autorizada por owner/admin, seção 12);
- cancela a própria Pré-Entrevista (seção 13).

### 24.4 Platform Admin (SuperAdmin)

- Platform Admin nunca opera funcionalmente;
- Platform Admin nunca responde;
- Platform Admin nunca edita;
- Platform Admin realiza apenas leitura administrativa excepcional, com
  motivo obrigatório, auditoria obrigatória e escopo mínimo necessário —
  nunca recebe respostas completas por padrão; a leitura administrativa
  retorna dados minimizados, salvo necessidade estritamente justificada e
  registrada (mesmo padrão de leitura administrativa de toda SPEC
  anterior — SPEC-011, SPEC-012, SPEC-013).

## 25. Segurança

- Nunca enviar respostas para IA.
- Nunca gerar score.
- Nunca calcular DISC.
- Nunca gerar Perfil Comportamental.
- Nunca criar ranking.
- Nunca criar decisão automática — nenhuma regra desta SPEC elimina,
  aprova ou reprova um candidato automaticamente (ADR-0023, seção "Papel
  da IA" e seção "Filtros Objetivos versus IA": qualquer sinalização
  determinística de elegibilidade fica para SPEC futura própria, nunca
  implementada por esta SPEC).
- Validar no servidor: `organizationId`, `candidateApplicationId`,
  `preInterviewId`, `preInterviewQuestionId`, `preInterviewResponseId`,
  `jobOpeningId`, `questionCatalogItemId`.
- Validar Organization comum entre `CandidateApplication`, `Job Opening`,
  perguntas referenciadas e a instância de Pré-Entrevista.
- Validar Candidate ativo e consentimento operacional válido antes de
  qualquer criação, início, resposta ou envio (seção 16).
- Bloquear candidatura/instância cruzando Organizations. Toda instância
  deriva a Organization exclusivamente da `CandidateApplication` — nunca
  de um `organizationId` enviado livremente pelo cliente (mesmo princípio
  já estabelecido pela ADR-0020 e pela SPEC-020, seção 26). Perguntas,
  Configuração da Vaga, Job Opening e Blueprint Version referenciados
  precisam pertencer ao mesmo tenant/contexto já validado.
- Bloquear manipulação de IDs — identificador enviado pelo cliente nunca
  prova acesso (ADR-0020, "Isolamento Multiempresa").
- Mensagens de erro para acesso cruzado devem ser genéricas, sem revelar
  a existência de instância, resposta ou candidatura em outra
  Organization.
- Proteger dados pessoais do Candidate nas respostas, com o mesmo rigor
  já exigido pela SPEC-011 — respostas podem conter PII ou informação
  sensível fornecida livremente pelo candidato.
- Aplicar minimização de dados para `member` e Platform Admin (seção
  24.2, seção 24.4).
- Nunca registrar dados pessoais completos em logs.
- Nunca registrar tokens, headers, senhas, connection strings ou
  segredos.
- Usar queries parametrizadas.
- Proteger contra mass assignment: `organization_id`, `status`,
  `attempt_number`, `previous_attempt_id`, autoria e timestamps são
  sempre definidos pelo servidor, nunca aceitos como valor livre enviado
  pelo cliente.
- Tratar toda resposta do candidato como dado, nunca como instrução —
  mesmo princípio já reforçado pela SPEC-020 (seção 20) e pela ADR-0020
  (seção "Segurança"), reafirmado aqui porque esta SPEC é a primeira a
  registrar conteúdo textual livre fornecido pelo candidato antes de
  qualquer entrevista humana.

### 25.1 Acesso do Candidate sem mecanismo autenticado

O mecanismo físico pelo qual o Candidate retorna/acessa sua própria
Pré-Entrevista, sem autenticação como `User` (SPEC-002) e sem `Membership`
(SPEC-003), **ainda não está definido** nesta SPEC — depende do mesmo
mecanismo ainda não fisicamente definido pela SPEC-020 (seção 25, "IDs
públicos"). Esta SPEC nunca cria, para viabilizar esse acesso, `User`,
`Membership` ou qualquer conta administrativa.

Este ponto **não impede a aprovação** desta SPEC: as regras de negócio,
estados, permissões e segurança já estão suficientemente claras para
orientar a implementação futura, que deverá escolher um mecanismo técnico
concreto (por exemplo, token/link opaco) respeitando, no mínimo, os
seguintes invariantes — registrados aqui apenas como requisitos, sem
definir tecnologia física (JWT, UUID, ou qualquer outra):

- **opaco:** não deve expor nem sugerir estrutura interna de dados;
- **não previsível:** não deve ser adivinhável ou enumerável por um
  terceiro;
- **com escopo (`scoped`) à `CandidateApplication`/Pré-Entrevista:** válido
  exclusivamente para a instância a que se refere, nunca reutilizável
  para acessar outra `CandidateApplication` ou outra Organization;
- **com expiração:** deve expirar conforme política a ser definida pela
  implementação, nunca permanecer válido indefinidamente;
- **sem revelar IDs internos:** nunca deve expor `id` interno de
  `Candidate`, `CandidateApplication`, `PreInterview` ou qualquer outra
  entidade;
- **revogável:** deve poder ser invalidado quando necessário (por
  exemplo, em caso de suspeita de comprometimento), sem depender de sua
  expiração natural.

Esta SPEC não define JWT, UUID ou qualquer token físico específico —
apenas os invariantes acima, que qualquer mecanismo futuro deve respeitar.

## 26. Auditoria

Eventos obrigatórios:

- `pre_interview.settings_updated` (alteração da Configuração de
  Pré-Entrevista da Vaga, seção 4.2);
- `pre_interview.created`;
- `pre_interview.available` (liberação para o candidato);
- `pre_interview.started`;
- `pre_interview.response_saved` (rascunho/parcial, durante
  `in_progress`);
- `pre_interview.submitted` (envio final, transição para `completed`);
- `pre_interview.cancelled`;
- `pre_interview.expired`;
- `pre_interview.reopening_authorized` (decisão administrativa, seção
  12);
- `pre_interview.new_attempt_created` (criação técnica da nova tentativa,
  seção 11);
- `pre_interview.administrative_read`;
- `pre_interview.permission_denied`;
- `pre_interview.cross_organization_access_denied`.

Estes nomes são conceituais e ilustrativos, seguindo o mesmo padrão já
usado por `candidate.*` (SPEC-011), `candidate_application.*` (SPEC-012)
e eventos análogos de `Interview` (SPEC-013); a nomenclatura técnica final
é responsabilidade da implementação.

Nunca registrar:

- conteúdo completo de resposta;
- perfil completo do Candidate;
- consentimento detalhado;
- salário ou qualquer dado sensível do Candidate fora do escopo desta
  SPEC;
- tokens, headers, segredos.

Auditoria crítica em criação, envio final, cancelamento e autorização de
reabertura deve causar rollback quando falhar — mesmo padrão já exigido
pela SPEC-011, SPEC-012 e SPEC-013. Este rollback é sempre interno à
própria operação da Pré-Entrevista (seção 8.3) — nunca se estende à
`CandidateApplication` já criada e confirmada (seção 8.2).

O evento `pre_interview.created` deve registrar a autoria de criação
conforme a seção 8.4 (`system_triggered` ou `created_by_user_id`
preenchido), nunca atribuindo a criação automática a um ator fictício ou
"de sistema" inventado.

## 27. Integração

Esta SPEC integra exclusivamente com:

- `Candidate` (SPEC-011) — apenas para validar status e consentimento;
- `CandidateApplication` (SPEC-012) — vínculo estrutural exclusivo da
  instância (seção 4.3);
- `Job Opening` (SPEC-010) — apenas para resolver a Configuração de
  Pré-Entrevista da Vaga (seção 4.2) e herdar `job_opening_id`/
  `job_opening_version_id` por meio da `CandidateApplication` (seção 19);
- Blueprint Version (SPEC-018, ADR-0022) — apenas para registrar
  `blueprint_version_id` de contexto (seção 19);
- Banco de Perguntas (SPEC-009) — apenas para referenciar
  `question_catalog_items.id` (seção 9).

Nada além disso. Em particular, esta SPEC nunca integra com:

- infraestrutura de IA (ADR-0016 a ADR-0019, SPEC-014);
- `Interview` (SPEC-013) — Pré-Entrevista e Entrevista são etapas
  independentes (ADR-0023, seção "Relacionamento com Entrevistas");
- Perfil Comportamental, DISC, Pré-Análise Assistida por IA ou Dossiê
  Inteligente (SPEC-022 a SPEC-024, ainda não especificadas).

## 28. Organization Arquivada

Quando a Organization estiver `archived`:

- nenhuma nova instância de Pré-Entrevista é criada;
- nenhuma instância existente pode ser iniciada, respondida, enviada,
  cancelada ou reaberta operacionalmente;
- dados existentes permanecem preservados;
- Platform Admin consulta somente administrativamente, com motivo e
  auditoria (mesmo padrão de toda SPEC anterior).

## 29. API Conceitual

| Operação | Finalidade |
| --- | --- |
| Configurar Pré-Entrevista da vaga | Habilitar/desabilitar e definir perguntas (owner/admin). |
| Consultar configuração da vaga | Retornar a Configuração de Pré-Entrevista vigente (owner/admin). |
| Consultar Pré-Entrevista (DTO por perfil) | Retornar dados permitidos conforme a role/papel do solicitante. |
| Iniciar Pré-Entrevista | Candidate inicia uma instância `available`. |
| Salvar resposta em rascunho | Candidate registra ou corrige resposta durante `in_progress`. |
| Enviar Pré-Entrevista | Candidate conclui, transição idempotente para `completed`. |
| Cancelar Pré-Entrevista | owner/admin encerra administrativamente com motivo. |
| Autorizar reabertura | owner/admin autoriza nova tentativa após estado final. |
| Consultar histórico | owner/admin consultam eventos da instância. |
| Leitura administrativa auditada | Platform Admin consulta com motivo. |

Esta SPEC não define URLs finais, contratos de request/response ou
schema de banco.

## 30. Interface Conceitual

- **Configuração da vaga (owner/admin):** habilitar/desabilitar
  Pré-Entrevista, selecionar perguntas do Banco de Perguntas, definir
  obrigatoriedade e ordem.
- **Tela do candidato:** perguntas preparadas, indicação de progresso,
  salvamento de rascunho, ação de enviar, mensagem de confirmação.
- **Tela administrativa (owner/admin):** status da Pré-Entrevista por
  candidatura, respostas, histórico, ação de cancelar, ação de autorizar
  reabertura.
- **DTO de member:** indicação de existência e status, sem conteúdo.

Esta SPEC não define layout, wireframe ou biblioteca de componentes
visuais.

## 31. Critérios de Aceite

- CA-001: Uma Pré-Entrevista pertence exclusivamente a uma
  `CandidateApplication`.
- CA-002: Uma Pré-Entrevista nunca é criada diretamente para `Candidate`.
- CA-003: Uma Pré-Entrevista nunca é criada diretamente para `Job
  Opening`.
- CA-004: Uma Pré-Entrevista nunca pertence ao Blueprint Organizacional.
- CA-005: Uma Pré-Entrevista nunca pertence diretamente à Organization
  sem passar pela `CandidateApplication`.
- CA-006: Vaga sem Configuração de Pré-Entrevista habilitada não gera
  instância, e a `CandidateApplication` segue seu curso normal.
- CA-007: Vaga com Configuração habilitada e ao menos uma pergunta gera
  instância `draft` → `available` após a criação da `CandidateApplication`.
- CA-008: Criação de instância exige `CandidateApplication` `active`.
- CA-009: Criação de instância exige `Candidate` `active`.
- CA-010: Criação de instância exige consentimento operacional `granted`.
- CA-011: No máximo uma instância não finalizada existe por
  `CandidateApplication` a qualquer momento (seção 23).
- CA-012: Configuração da Vaga é sempre corrente e nunca reinterpreta
  instância já criada (seção 4.2.1).
- CA-013: Alterar a Configuração da Vaga depois da criação de uma
  instância não altera essa instância já existente (seção 9.5).
- CA-014: Snapshot de contexto (candidate_application_id, job_opening_id,
  job_opening_version_id, blueprint_version_id, perguntas) é congelado no
  momento da criação da instância (seção 4.3.1).
- CA-015: `job_opening_version_id` da instância corresponde exatamente ao
  já registrado, de forma imutável, na `CandidateApplication`.
- CA-016: `blueprint_version_id`, quando registrado, nunca é atualizado
  retroativamente.
- CA-017: Nova Blueprint Version nunca reinterpreta instância antiga, nem
  altera perguntas já congeladas, nem altera respostas.
- CA-018: Perguntas são referenciadas exclusivamente por
  `question_catalog_items.id`.
- CA-019: Nenhuma pergunta nova é criada por esta SPEC.
- CA-020: Nenhuma pergunta existente é alterada por esta SPEC.
- CA-021: Snapshot de pergunta é preservado no momento da inclusão em uma
  instância concreta, incluindo título, texto, tipo, categoria, opções,
  configurações, obrigatoriedade e ordem.
- CA-022: Snapshot de pergunta nunca armazena resposta.
- CA-023: Alteração futura no Banco de Perguntas não altera instância já
  criada.
- CA-024: Pergunta duplicada na mesma instância é bloqueada.
- CA-025: Pré-Entrevista não cria novo valor no enum `current_stage` da
  `CandidateApplication` (SPEC-012/ADR-0014) nesta versão.
- CA-026: Pré-Entrevista nunca altera automaticamente
  `application_status`, `current_stage`, finalização, `rejected`,
  `hired`, score ou ranking da `CandidateApplication`.
- CA-027: Conclusão da Pré-Entrevista conclui apenas o subfluxo, nunca a
  `CandidateApplication`.
- CA-028: A criação da instância de Pré-Entrevista ocorre em operação
  própria, sempre depois da conclusão da SPEC-020, nunca na mesma
  transação atômica.
- CA-029: Falha ao criar a instância de Pré-Entrevista nunca causa
  rollback da `CandidateApplication` já criada e confirmada.
- CA-030: A `CandidateApplication` permanece válida mesmo quando a
  Feature de Pré-Entrevista está temporariamente indisponível.
- CA-031: Transição para `in_progress` ocorre no primeiro entre: ação
  explícita de iniciar ou primeiro salvamento válido de resposta em
  rascunho (critério determinístico, seção 5.3).
- CA-032: Resposta em rascunho pode ser salva e corrigida livremente
  durante `in_progress`.
- CA-033: Resposta submetida (`completed`) é imutável.
- CA-034: Pergunta obrigatória sem resposta bloqueia o envio final.
- CA-035: Somente o Candidate identificado registra suas próprias
  respostas.
- CA-036: owner/admin nunca registram resposta em nome do candidato.
- CA-037: Envio final (`submit`) é idempotente — reenvio nunca duplica
  conclusão nem cria segunda tentativa.
- CA-038: Início (`start`) é idempotente.
- CA-039: Salvamento de resposta em rascunho é idempotente por pergunta.
- CA-040: Transições de estado seguem exatamente a matriz da seção 5.7;
  nenhuma transição fora dela é aceita.
- CA-041: Estado final nunca retorna a estado operacional; em especial,
  `completed → in_progress` e `expired → available` são sempre
  recusados.
- CA-042: Cancelamento exige motivo obrigatório e é permitido somente
  para owner/admin, nunca pelo Candidate.
- CA-043: Cancelamento é permitido somente a partir de estado não final.
- CA-044: Expiração é sempre automática, nunca um ato humano direto.
- CA-045: Expiração é permitida somente a partir de `available` ou
  `in_progress`.
- CA-046: Reabertura nunca reativa a mesma instância finalizada.
- CA-047: Reabertura sempre resulta em uma nova instância, com novo
  `attempt_number` e `previous_attempt_id` preenchido.
- CA-048: Nova tentativa nunca copia ou herda respostas da tentativa
  anterior.
- CA-049: Tentativa anterior permanece preservada e consultável após
  reabertura.
- CA-050: Somente owner/admin autorizam reabertura.
- CA-051: Desabilitar a Configuração da Vaga nunca apaga instâncias já
  criadas nem cancela automaticamente instâncias `available`/
  `in_progress`.
- CA-052: Vaga fechada, pausada ou cancelada depois da criação da
  Pré-Entrevista não apaga nem invalida automaticamente a instância já
  existente.
- CA-053: `Candidate` `inactive` bloqueia criação, início, resposta,
  envio e reabertura, mas preserva histórico e permite cancelamento
  administrativo (seção 16.1).
- CA-054: Consentimento operacional inválido bloqueia criação, início,
  resposta, envio e reabertura, mas preserva histórico e permite
  cancelamento administrativo e leitura administrativa (seção 16.2).
- CA-055: Nenhuma chamada a `AIGateway`, provider, modelo ou Prompt
  Registry ocorre em nenhum passo desta SPEC.
- CA-056: Nenhum score, ranking, DISC ou Perfil Comportamental é
  produzido por esta SPEC.
- CA-057: Nenhuma decisão automática de elegibilidade é produzida por
  esta SPEC.
- CA-058: `member` visualiza somente o DTO positivo definido na seção
  24.2.
- CA-059: `member` nunca visualiza conteúdo de resposta.
- CA-060: `owner` e `admin` possuem exatamente os mesmos poderes sobre a
  Pré-Entrevista nesta versão (seção 24.1).
- CA-061: Platform Admin nunca responde, edita, cancela ou autoriza
  reabertura.
- CA-062: Platform Admin realiza apenas leitura administrativa auditada
  com motivo, sem receber respostas completas por padrão.
- CA-063: Organization arquivada bloqueia toda operação funcional desta
  SPEC.
- CA-064: Acesso cruzado entre Organizations é recusado sem vazar
  existência de instância, resposta ou candidatura.
- CA-065: Tentativa de mass assignment de `organization_id`, `status`,
  `attempt_number`, `previous_attempt_id`, autoria ou timestamps é
  bloqueada.
- CA-066: Duas criações concorrentes de instância para a mesma
  `CandidateApplication` nunca produzem duas instâncias não finalizadas
  simultâneas.
- CA-067: Dois envios finais concorrentes da mesma instância nunca
  produzem duas transições para `completed`.
- CA-068: Cancelamento concorrendo com envio final nunca produz dois
  estados finais diferentes para a mesma instância.
- CA-069: Expiração concorrendo com envio final produz resultado
  determinístico, sem estado inconsistente.
- CA-070: Auditoria nunca registra conteúdo completo de resposta.
- CA-071: Falha de auditoria crítica em criação, envio, cancelamento ou
  reabertura causa rollback interno à operação da Pré-Entrevista, sem
  afetar a `CandidateApplication` já confirmada.
- CA-072: Não existe exclusão física de instância, pergunta preparada,
  resposta ou evento.
- CA-073: Histórico de tentativas anteriores permanece consultável após
  reabertura, inclusive por `previous_attempt_id`.
- CA-074: Dados persistem após recriar a aplicação.
- CA-075: Nenhuma funcionalidade das SPEC-022 a SPEC-024 é implementada
  antecipadamente por esta SPEC.
- CA-076: Configuração de Pré-Entrevista da Vaga nunca altera o schema
  ou o conteúdo imutável de `job_opening_versions` (SPEC-010).
- CA-077: Nenhum mecanismo de acesso do Candidate cria `User`,
  `Membership` ou conta administrativa.

## 32. Testes Obrigatórios

Quando esta SPEC for implementada, os testes devem comprovar, no mínimo:

### Settings (Configuração da Vaga)

1. habilitar Configuração de Pré-Entrevista de uma vaga;
2. desabilitar Configuração não apaga instâncias já criadas;
3. desabilitar Configuração não cancela automaticamente instância
   `available`/`in_progress`;
4. alterar perguntas da Configuração não afeta instância já criada
   (exemplo da seção 9.5);
5. Configuração nunca é consultada retroativamente para reinterpretar
   instância existente.

### Criação de instância

6. vaga sem Configuração habilitada não gera instância;
7. vaga com Configuração habilitada gera instância `draft` → `available`;
8. criação bloqueada quando `CandidateApplication` não está `active`;
9. criação bloqueada quando `Candidate` não está `active`;
10. criação bloqueada quando consentimento não está `granted`;
11. criação bloqueada quando já existe instância não finalizada para a
    mesma `CandidateApplication`;
12. criação bloqueada quando a Organization está arquivada;
13. autoria de criação automática nunca atribuída a ator fictício;
14. falha na criação da instância não causa rollback da
    `CandidateApplication` já confirmada;
15. `CandidateApplication` permanece válida quando a Feature de
    Pré-Entrevista está indisponível.

### Snapshot de contexto e de pergunta

16. snapshot de contexto congela `candidate_application_id`,
    `job_opening_id`, `job_opening_version_id`, `blueprint_version_id` e
    perguntas no momento da criação;
17. `job_opening_version_id` da instância corresponde ao já registrado na
    `CandidateApplication`;
18. `blueprint_version_id`, quando aplicável, nunca é atualizado depois
    da criação;
19. republicação futura da Vaga ou nova ativação de Blueprint não altera
    instância já criada;
20. pergunta referenciada de outra Organization é bloqueada;
21. pergunta inativa não pode ser incluída em nova configuração;
22. snapshot de pergunta preservado após alteração posterior da pergunta
    no catálogo;
23. snapshot de pergunta inclui título, texto, tipo, categoria, opções,
    configurações, obrigatoriedade e ordem;
24. snapshot de pergunta nunca armazena resposta;
25. pergunta duplicada na mesma instância é bloqueada;
26. instância sem nenhuma pergunta configurada não é criada.

### current_stage e efeito sobre CandidateApplication

27. Pré-Entrevista não cria nem altera valor de `current_stage`;
28. conclusão da Pré-Entrevista não altera `application_status` da
    `CandidateApplication`;
29. conclusão da Pré-Entrevista não finaliza, rejeita ou contrata a
    `CandidateApplication`;
30. conclusão da Pré-Entrevista não gera score nem ranking.

### Execução e respostas

31. transição para `in_progress` ocorre no primeiro entre ação explícita
    de iniciar e primeiro salvamento de resposta em rascunho;
32. duas chamadas de início não geram dois eventos de início;
33. resposta em rascunho salva e corrigida livremente durante
    `in_progress`;
34. resposta incompatível com o tipo da pergunta é recusada;
35. envio final bloqueado quando pergunta obrigatória está sem resposta;
36. envio final bem-sucedido transiciona para `completed`;
37. resposta submetida imutável após `completed`;
38. owner/admin não conseguem registrar resposta em nome do candidato.

### Estados e transições

39. cada transição permitida da matriz da seção 5.7 funciona
    corretamente;
40. cada transição proibida da matriz da seção 5.7 é recusada, incluindo
    explicitamente `completed → in_progress` e `expired → available`;
41. estado final nunca retorna a estado operacional.

### Cancelamento

42. cancelamento exige motivo;
43. cancelamento permitido somente para owner/admin, nunca para
    Candidate;
44. cancelamento bloqueado a partir de estado final;
45. cancelamento preserva respostas em rascunho já registradas.

### Expiração

46. expiração automática a partir de `available`;
47. expiração automática a partir de `in_progress`;
48. expiração nunca é um ato humano direto;
49. expiração preserva respostas em rascunho já registradas.

### Vaga fechada e Candidate inativo/consentimento

50. vaga encerrada/pausada/cancelada não apaga nem invalida
    automaticamente Pré-Entrevista já existente;
51. `Candidate` inativo bloqueia criação, início, resposta, envio e
    reabertura;
52. `Candidate` inativo preserva instâncias e histórico já existentes;
53. consentimento `pending`/`revoked`/`expired` bloqueia criação, início,
    resposta, envio e reabertura;
54. consentimento inválido permite cancelamento administrativo e leitura
    administrativa;
55. consentimento inválido nunca altera automaticamente o estado da
    instância.

### Tentativas e reabertura

56. reabertura exige owner/admin;
57. reabertura bloqueada quando a tentativa anterior não está em estado
    final;
58. reabertura gera nova instância com `attempt_number` incrementado e
    `previous_attempt_id` preenchido;
59. nova tentativa nunca copia respostas da tentativa anterior;
60. tentativa anterior permanece preservada e consultável após
    reabertura;
61. reabertura reavalia as condições de criação (`CandidateApplication`
    ativa, `Candidate` ativo, consentimento válido).

### Permissões

62. owner configura Configuração de Pré-Entrevista da vaga;
63. admin configura Configuração de Pré-Entrevista da vaga com os mesmos
    poderes de owner;
64. member não configura;
65. member visualiza somente o DTO positivo (existência e status);
66. member nunca recebe conteúdo de resposta;
67. Candidate nunca acessa instância de outra `CandidateApplication`;
68. Platform Admin não cria, responde, edita, cancela ou reabre;
69. Platform Admin realiza leitura administrativa somente com motivo, sem
    respostas completas por padrão.

### Segurança e multiempresa

70. acesso cruzado entre Organizations é bloqueado, com mensagem
    genérica;
71. manipulação de identificador não concede acesso a dado de outra
    Organization;
72. tentativa de mass assignment de campos protegidos (seção 25) é
    bloqueada;
73. Organization arquivada bloqueia toda operação funcional.

### Concorrência

74. duas criações simultâneas de instância para a mesma
    `CandidateApplication` resultam em apenas uma instância não
    finalizada;
75. dois envios finais simultâneos da mesma instância resultam em apenas
    uma transição para `completed`;
76. cancelamento concorrendo com envio final produz conflito seguro, sem
    dois estados finais diferentes;
77. expiração automática concorrendo com envio final produz resultado
    determinístico, sem estado inconsistente;
78. duas autorizações concorrentes de reabertura resultam em apenas uma
    nova tentativa.

### Idempotência

79. reenvio da mesma chamada de início não duplica evento nem estado;
80. reenvio do mesmo salvamento de resposta em rascunho não duplica
    registro de resposta;
81. reenvio da mesma chamada de envio final não duplica conclusão nem
    cria segunda tentativa.

### Auditoria e persistência

82. eventos obrigatórios (seção 26) são registrados corretamente;
83. auditoria nunca contém conteúdo completo de resposta;
84. falha de auditoria crítica em criação causa rollback interno, sem
    afetar a `CandidateApplication`;
85. falha de auditoria crítica em envio final causa rollback;
86. falha de auditoria crítica em cancelamento causa rollback;
87. falha de auditoria crítica em reabertura causa rollback;
88. nenhuma instância, pergunta, resposta ou evento é excluído
    fisicamente;
89. dados persistem após recriar a aplicação.

### IA e escopo

90. nenhuma chamada a `AIGateway`, provider, modelo ou Prompt Registry
    ocorre em nenhum teste desta SPEC;
91. nenhum score, ranking, DISC ou Perfil Comportamental é produzido;
92. fluxo completo (criação, resposta, envio) funciona integralmente com
    a infraestrutura de IA desabilitada ou inexistente.

Esta SPEC não implementa os testes acima — apenas os especifica.

## 33. Limitações Conhecidas

- Esta SPEC não implementa código, banco, migrations, rotas, APIs, testes
  ou dependências.
- Tempo máximo, tempo mínimo e quantidade máxima de perguntas por
  instância não são definidos nesta SPEC — ficam para especificação
  técnica futura.
- Valor numérico de `expires_at`/timeout de resposta não é definido nesta
  SPEC.
- Quantidade máxima de tentativas por `CandidateApplication` não é
  definida nesta SPEC.
- O mecanismo técnico exato de acesso do Candidate à própria instância
  sem autenticação como `User` não é definido nesta SPEC — apenas seus
  invariantes de segurança (seção 25.1). Este ponto não impede a
  aprovação desta SPEC.
- Tecnologia de execução assíncrona (fila técnica, worker, scheduler)
  para criação de instância e para expiração automática não é definida
  nesta SPEC — apenas o comportamento funcional esperado (seção 8.2,
  seção 14).
- Mecanismo físico de idempotência (chave, deduplicação, cabeçalho HTTP)
  não é definido nesta SPEC — apenas o comportamento observável exigido
  (seção 22).
- IA, DISC, Perfil Comportamental, Pré-Análise Assistida por IA e Dossiê
  Inteligente não são definidos nem implementados por esta SPEC —
  pertencem às SPEC-022 a SPEC-024.
- Esta SPEC não decide se, no futuro, a Pré-Entrevista passará a ser
  representada como uma etapa canônica própria de `current_stage`
  (SPEC-012/ADR-0014); por ora, ela permanece uma entidade independente,
  vinculada à `CandidateApplication` sem alterar esse enum (seção 6).
  Uma futura integração mais direta ao pipeline exigirá revisão própria.
- O snapshot de pergunta (seção 9.2, seção 9.3) substitui, nesta fase, um
  `question_version_id` formal, que ainda não existe porque o Banco de
  Perguntas (SPEC-009) não possui versionamento formal.
- Nesta versão, `member` não consulta respostas de Pré-Entrevista; a
  ampliação dessa permissão para um futuro papel operacional de
  entrevistador/recrutador fica para revisão própria (seção 24.2).
- Nesta versão, `owner` e `admin` possuem exatamente os mesmos poderes
  sobre a Pré-Entrevista; uma futura reserva de exclusividade a `owner`
  fica para revisão própria, caso necessária (seção 24.1).
- Não há exclusão física.
- Notificação ao candidato ou à Organization sobre disponibilidade,
  expiração próxima ou conclusão da Pré-Entrevista não é definida nesta
  SPEC.

## 34. Definição de Concluído

Para a implementação futura desta SPEC:

- SPEC aprovada antes do desenvolvimento;
- nenhuma regra já aprovada pela SPEC-009, SPEC-010, SPEC-011, SPEC-012,
  SPEC-018, SPEC-019 ou SPEC-020 foi redefinida ou contradita;
- critérios de aceite atendidos;
- testes obrigatórios implementados e passando;
- testes de segurança, multiempresa, concorrência e idempotência
  passando;
- rollback de auditoria crítica verificado, sem afetar a
  `CandidateApplication` já confirmada;
- regras de segurança verificadas, incluindo os invariantes do mecanismo
  de acesso do Candidate (seção 25.1);
- migrations reproduzíveis quando houver banco;
- lint passando;
- formatação passando;
- build passando;
- documentação atualizada;
- auditoria revisada;
- nenhuma funcionalidade das SPEC-022 a SPEC-024 implementada
  antecipadamente;
- commit realizado.
