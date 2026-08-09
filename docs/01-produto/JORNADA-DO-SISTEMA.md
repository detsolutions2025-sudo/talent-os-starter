# Jornada do Sistema — DoF — Gente & Seleção

## Nota de leitura (antes de tudo)

Este documento descreve a jornada **funcional** do produto, não a implementação
técnica. Não é SPEC. Não é ADR. Nenhuma tabela, rota, API, permissão ou regra
de negócio aqui descrita substitui ou altera o que já está definido em
`docs/03-arquitetura/decisoes/` (ADR-0001 a ADR-0022) e em
`docs/02-requisitos/specs/` (SPEC-001 a SPEC-014). Em caso de dúvida sobre uma
regra específica, a ADR ou SPEC correspondente é sempre a fonte de verdade.

Duas convenções usadas neste documento, para evitar ambiguidade:

- **Estado atual vs. visão de produto.** As jornadas de Organization,
  Membership, DNA Organizacional, Estrutura Organizacional, Competências,
  Perguntas, Cargos, Vagas, Candidatos, Processo Seletivo, Entrevistas e
  Infraestrutura de IA descrevem capacidades já especificadas e, em grande
  parte, já implementadas (Fases 1 a 11). Trechos marcados com "quando
  existir", "quando habilitada" ou "está previsto" — como Portal Público,
  Pré-Entrevista Inteligente, Dossiê Inteligente, DISC e Perfil Comportamental
  — descrevem **visão de produto**, ainda sem ADR ou SPEC própria. A seção 16
  lista isso explicitamente.
- **"Platform Admin (SuperAdmin)" e "RH".** Este documento usa **Platform
  Admin (SuperAdmin)** como forma padronizada de se referir ao mesmo perfil
  definido desde a ADR-0003 e a SPEC-004: `Platform Admin` é o termo
  arquitetural canônico; "SuperAdmin" é um nome comercial/operacional
  equivalente, usado na interface. Os dois termos representam a mesma
  autoridade de plataforma — não é um perfil novo, nem uma role adicional
  (ADR-0020, seção "Papel da DocFounder"). Este documento também usa "RH"
  para descrever a **função** de recrutamento e seleção exercida por pessoas
  autorizadas dentro da Organization, conforme Roles, Memberships e papéis
  operacionais aplicáveis — nunca uma role de Membership nova. Conforme a
  autorização já existente, RH pode ser exercido por Owner, Admin, Member
  autorizado (por exemplo, como participante de entrevista — ver seção 6),
  recrutador, entrevistador, gestor ou terceiro autorizado futuramente,
  sempre dentro do que sua role e seu papel operacional permitem (SPEC-004;
  ADR-0020, seção "Papel da DocFounder", termo "RH"). A SPEC-004 exclui
  explicitamente "perfis específicos de RH" do escopo de Roles & Permissions;
  este documento não cria esse perfil, nem qualquer role nova para
  "recrutador", "entrevistador" ou "gestor" — são papéis operacionais, nunca
  roles do sistema.

---

# 1. Objetivo

Este documento descreve, passo a passo, como o `DoF — Gente & Seleção`
funciona do ponto de vista de cada tipo de usuário: Platform Admin
(SuperAdmin) — o perfil de DocFounder —, Owner, Admin, Member, Candidato e a
rotina operacional de RH.
Ele existe para dar uma visão funcional única e legível, sem exigir leitura
de todas as ADRs e SPECs para entender o fluxo geral do produto.

Toda implementação, presente ou futura, deve permanecer consistente com esta
jornada. Quando um detalhe técnico específico for necessário, ele pertence à
ADR ou SPEC correspondente, nunca a este documento.

---

# 2. Visão Geral

- **DocFounder** desenvolve e opera a plataforma `DoF — Gente & Seleção`
  (ADR-0020, "Papel da DocFounder").
- Cada cliente possui sua própria **Organization** — a unidade autônoma
  fundamental do sistema (ADR-0003; ADR-0020).
- Cada Organization possui seu próprio **Blueprint Organizacional**: DNA
  Organizacional, Estrutura Organizacional e os catálogos que ela mesma
  preenche (ADR-0020, "Blueprint Organizacional").
- Toda operação de negócio ocorre dentro de uma Organization. Nenhuma
  entidade de negócio existe sem Organization, e nenhuma atravessa para outra
  (ADR-0003 em diante).
- Cada Organization possui autonomia sobre seus próprios dados e decisões —
  autonomia que nunca significa independência da plataforma: recursos
  globais (catálogos, IA) continuam sendo administrados por DocFounder, e a
  Organization opera dentro do que a plataforma disponibiliza (ADR-0020,
  "Decisão arquitetural").
- A plataforma fornece infraestrutura, catálogos globais e capacidades
  opcionais (como IA); ela nunca decide o negócio de nenhuma Organization
  (ADR-0020, "Responsabilidades").

---

# 3. Jornada do Platform Admin (SuperAdmin)

O Platform Admin (SuperAdmin, na interface comercial), definido desde a
ADR-0003 e a SPEC-004, é o perfil interno de DocFounder. Ele não é uma role
de Membership e não atua dentro do negócio de nenhuma Organization.

Fluxo típico:

Recebe novo cliente.

↓

Cria Organization (SPEC-001: exige um `User` ativo indicado como primeiro
`owner`, em operação atômica).

↓

Define plano (comercial — fora do escopo das ADRs e SPECs atuais; ver seção
16).

↓

Libera funcionalidades contratadas — disponibiliza Features de IA no
catálogo global (`feature_available_on_platform`, ADR-0017) e, quando
aplicável, credenciais `platform_managed` (ADR-0018).

↓

Cria Owner inicial (mesma operação atômica de criação da Organization,
SPEC-001, RN-002 a RN-006).

↓

Entrega acesso.

↓

Auxilia implantação.

↓

Presta suporte — inclui consulta administrativa auditada quando necessário
(nunca alteração funcional do negócio da Organization).

↓

Monitora infraestrutura.

↓

Disponibiliza novas funcionalidades — evolui o Blueprint Organizacional
(mecanismo), o Model Registry, o Prompt Registry e os catálogos globais
(ADR-0019, ADR-0020).

O Platform Admin (SuperAdmin) nunca:

- cria candidatos;
- cria vagas;
- entrevista candidatos;
- conduz recrutamento;
- altera cultura organizacional (DNA) de nenhuma Organization;
- interfere na decisão de contratação.

Ele administra somente a plataforma: disponibilidade (`platform_ai_allowed`,
ADR-0016), catálogos globais (competências, perguntas, Feature Catalog,
Provider Catalog, Model Registry, Prompt Registry), arquivamento/reativação
de Organizations e credenciais `platform_managed` (ADR-0001 a ADR-0020,
SPEC-001 a SPEC-014). Toda ação administrativa relevante gera auditoria.

---

# 4. Jornada do Owner

O Owner é o responsável máximo pela Organization (SPEC-004). Ele constrói e
mantém o Blueprint Organizacional e administra tudo o que a plataforma
disponibiliza para a Organization.

Primeiro acesso.

↓

Configura Organization — dados operacionais básicos (SPEC-001: `name`,
`slug`, `legalName`, `taxId`, `description`).

↓

Define identidade organizacional — cria e publica o DNA Organizacional:
missão, visão, propósito, valores, competências organizacionais, cultura,
estilo de liderança, ambiente de trabalho (SPEC-005).

↓

Constrói Blueprint — o conjunto de DNA, Estrutura Organizacional e catálogos
próprios que representa o conhecimento da Organization (ADR-0020, seção
"Blueprint Organizacional"; ver seção 13 deste documento).

↓

Configura departamentos — cria a Estrutura Organizacional (`Organizational
Unit`, hierarquia por relação pai/filhos) (SPEC-006).

↓

Configura cargos — cria e publica versões de Job Profile: missão, resumo,
responsabilidades, requisitos, escolaridade, modelo de trabalho, faixa
salarial (SPEC-008).

↓

Configura competências — cria competências próprias e/ou adota competências
globais do catálogo da plataforma (SPEC-007).

↓

Configura perguntas — cria perguntas próprias e/ou adota perguntas globais do
Banco de Perguntas da plataforma (SPEC-009).

↓

Configura critérios — associa competências e perguntas a Cargos, com nível
esperado e obrigatoriedade (SPEC-008); posteriormente, associa competências e
perguntas a Vagas específicas, incluindo pesos contextuais (SPEC-010; ver
nota sobre pesos na seção 13).

↓

Configura permissões — convida e administra Memberships, define roles
(`owner`, `admin`, `member`) dentro dos limites da SPEC-004 (SPEC-003).

↓

Convida usuários — cria Membership para Users existentes ou recém-criados
(SPEC-002, SPEC-003; o fluxo de convite por e-mail em si é uma evolução
futura — ver seção 16).

↓

Configura IA (quando contratada) — habilita `organization_ai_enabled`
(ADR-0016), habilita Features específicas
(`organization_feature_enabled`, ADR-0017), configura credencial BYOK
(`customer_managed`, ADR-0018) e configura routing/fallback (ADR-0019).

↓

Publica vagas — cria e publica versões de Job Opening vinculadas a uma versão
publicada de Cargo, abre a Vaga e, opcionalmente, configura divulgação
pública (SPEC-010; ver seção 10 deste documento).

↓

Acompanha processos — consulta candidaturas (`CandidateApplication`),
movimenta pipeline, acompanha entrevistas (SPEC-012, SPEC-013).

↓

Recebe relatórios — telemetria de uso, incluindo uso de IA quando habilitada
(ADR-0019, seção "Telemetria").

↓

Contrata candidatos — somente o Owner pode marcar uma candidatura como
`hired` nesta fase (SPEC-012, RN-020).

O Owner é o único perfil que: altera código de entidades já criadas (DNA não
possui código; Cargo, Vaga, competência e pergunta próprias sim), publica
Cargos e Vagas, cancela Vagas, e marca candidaturas como `hired`. Essas
restrições continuam valendo mesmo quando o Owner delega o trabalho do dia a
dia a um Admin.

---

# 5. Jornada do Admin

O Admin é o administrador operacional da Organization (SPEC-004). Ele opera o
dia a dia do recrutamento e da configuração do Blueprint, dentro de limites
específicos que o Owner não delega.

**O que Admin pode administrar:**

- criar e editar candidatos, vagas (rascunhos), cargos (rascunhos),
  competências próprias, perguntas próprias e unidades organizacionais;
- adotar competências e perguntas globais;
- pausar e encerrar Vagas;
- configurar divulgação pública de uma Vaga já publicada e aberta pelo Owner
  (SPEC-010, RN-070);
- movimentar pipeline de candidaturas, retirar, rejeitar e cancelar
  candidaturas (SPEC-012);
- administrar entrevistas (criar, agendar, cancelar, marcar no-show), mesmo
  sem ser participante (SPEC-013);
- registrar respostas e avaliações de entrevista quando também estiver
  registrado como participante `lead` ou `interviewer` (SPEC-013);
- adicionar e remover membros (`member`), consultar histórico administrativo
  (SPEC-003, SPEC-005 a SPEC-013).

**O que Admin pode visualizar:** tudo o que o Owner visualiza dentro da
Organization ativa, incluindo faixa salarial de Cargos e Vagas, instruções
internas e histórico administrativo.

**O que Admin nunca pode alterar:**

- arquivar ou reativar a Organization (SPEC-001, RN-012/013);
- alterar status da Organization;
- remover, desativar ou rebaixar o último owner ativo, nem promover alguém a
  `admin` (somente Owner promove — SPEC-004, matriz);
- alterar `code` de Organization Competency, Organization Question, Job
  Profile ou Job Opening após a criação (somente Owner altera código —
  SPEC-006 a SPEC-010);
- publicar DNA Organizacional, Job Profile ou Job Opening (somente Owner
  publica — SPEC-005, SPEC-008, SPEC-010);
- cancelar uma Vaga (somente Owner cancela — SPEC-010, RN-071/072);
- marcar uma candidatura como `hired` (somente Owner — SPEC-012, RN-020);
- criar, editar ou administrar catálogos globais de plataforma (competência
  global, pergunta global, Feature Catalog, Model Registry, Prompt Registry
  — exclusivo de Platform Admin (SuperAdmin)).

Sua participação operacional é, na prática, a rotina descrita na seção 8
("Jornada do RH") — junto com o Owner, o Admin é quem mais frequentemente
exerce essa atividade dentro da Organization.

---

# 6. Jornada do Member

O Member é o usuário comum da Organization (SPEC-004). Ele participa
operacionalmente apenas onde o módulo específico o permitir, sempre com
acesso restrito.

**Participação operacional:**

- consulta dados básicos da Organization ativa;
- visualiza a versão publicada do DNA Organizacional, sem acesso a rascunhos
  ou histórico (SPEC-005);
- visualiza unidades ativas da Estrutura Organizacional (SPEC-006);
- visualiza competências e perguntas ativas disponíveis no catálogo
  unificado, sem administrá-las (SPEC-007, SPEC-009);
- visualiza Cargos ativos e suas versões publicadas, sem faixa salarial
  (SPEC-008);
- visualiza Vagas abertas autorizadas, sem faixa salarial e sem instruções
  internas (SPEC-010);
- visualiza uma lista positiva restrita de candidatos, quando autorizado pelo
  módulo (SPEC-011);
- visualiza somente candidaturas `active` em um DTO restrito, sem histórico
  administrativo (SPEC-012).

**Entrevistas:** Member só participa de entrevistas quando adicionado como
`interview_participant`, com um papel específico (SPEC-013):

- **`observer`**: apenas visualiza a entrevista e seu roteiro; não registra
  resposta nem avaliação.
- **`interviewer`**: registra e corrige respostas durante `in_progress` e
  registra apenas sua própria avaliação.
- **`lead`**: administra a execução da entrevista em que participa — inicia,
  registra respostas, avalia, conclui, cancela, marca no-show.

Member nunca visualiza avaliações de outros entrevistadores durante a
execução, nem entrevistas em que não participa.

**Avaliações permitidas:** somente a própria avaliação (`evaluator_user_id`),
nunca a de outro entrevistador, mesmo com papel `lead` (SPEC-013).

**Restrições e limitações:** Member nunca administra Memberships, nunca
altera Roles, nunca arquiva ou reativa a Organization, nunca acessa outra
Organization, nunca visualiza salário, consentimento detalhado, observações
internas ou histórico administrativo de qualquer módulo, e nunca acessa
configuração administrativa de IA (ADR-0016 a ADR-0019; SPEC-004 a SPEC-014).

---

# 7. Jornada do Candidato

**Nota de escopo:** esta jornada descreve a experiência de produto planejada
de ponta a ponta. Nesta fase, o cadastro do candidato e a criação da
candidatura são operações internas, feitas por Owner/Admin (SPEC-011,
SPEC-012). A candidatura pública em si — o candidato se cadastrando
diretamente pelo Portal Público — está fora do escopo das SPECs aprovadas até
o momento (SPEC-010, SPEC-011 e SPEC-012 excluem explicitamente "candidatura
pública" e ficam para especificação futura). Descrevo abaixo a jornada-alvo
completa; a seção 16 reafirma o que ainda não tem SPEC própria.

Encontrar vaga — por divulgação em redes, indicação ou busca (ver seção 10,
Portal Público).

↓

Entrar no Portal Público — o site público da Organization que divulgou a
vaga.

↓

Conhecer a empresa — identidade pública derivada do Blueprint Organizacional
da Organization (nunca o DNA completo e interno, apenas o que a Organization
optar por tornar público).

↓

Ler detalhes da vaga — título público, descrição, responsabilidades,
requisitos, benefícios, localização, modelo de trabalho e, quando
configurado, faixa salarial (SPEC-010, "Divulgação Pública").

↓

Cadastrar-se — cria seu cadastro básico de Candidate dentro da Organization
(SPEC-011).

↓

Enviar currículo — dados estruturados (experiências, escolaridade,
certificações, idiomas, links profissionais); upload de arquivo de currículo
é limitação conhecida desta fase (SPEC-011, "Fora do Escopo").

↓

Realizar Pré-Entrevista (quando existir) — ver seção 11.

↓

Receber confirmação.

↓

Acompanhar candidatura — status (`application_status`) e etapa
(`current_stage`) da sua `CandidateApplication` (SPEC-012).

↓

Participar das entrevistas — conforme agendamento feito pela Organization
(SPEC-013).

↓

Receber retorno — decisão final da Organization (`hired`, `rejected` ou
`withdrawn`), sempre tomada por uma pessoa (RH/Owner), nunca pela IA
(ADR-0016; ADR-0020, "Princípios fundamentais").

Em nenhum momento desta jornada a IA aprova, reprova ou decide pelo
candidato. O consentimento do candidato é obrigatório e estruturado
(SPEC-011); revogá-lo bloqueia novo uso operacional dos seus dados, mas nunca
apaga o histórico já existente.

---

# 8. Jornada do RH

"RH", aqui, representa a função de recrutamento e seleção exercida por
pessoas autorizadas dentro da Organization, conforme Roles, Memberships e
papéis operacionais aplicáveis — Owner e Admin na maior parte das ações
descritas nesta jornada e, na execução da entrevista em si, também `member`
participante (ver seção 6). Papéis operacionais como recrutador,
entrevistador ou gestor, quando existirem, exercem essa mesma função dentro
da autorização que sua role de Membership já concede. Não é uma role própria
do sistema.

Receber candidatura — nova `CandidateApplication` criada, `current_stage =
applied` (SPEC-012).

↓

Analisar currículo — dados estruturados do Candidate (SPEC-011).

↓

Consultar Dossiê Inteligente (quando existir) — ver seção 12.

↓

Consultar relatório da IA (quando existir) — análise de apoio, nunca decisão
(ADR-0016 a ADR-0019).

↓

Agendar entrevistas — cria e agenda `Interview` vinculada à
`CandidateApplication`, com participantes e perguntas do Banco de Perguntas
(SPEC-013).

↓

Realizar entrevistas — inicia, registra respostas e avaliações, conclui
(SPEC-013).

↓

Avaliar candidato — cada `lead`/`interviewer` registra sua própria avaliação
por entrevista (`recommendation`, nota, pontos fortes/atenção) (SPEC-013).

↓

Comparar candidatos — consulta candidaturas, entrevistas e avaliações de
diferentes candidatos para a mesma Vaga (leitura autorizada por role).

↓

Tomar decisão — movimenta a candidatura (avanço, retorno ou salto de etapa,
com motivo obrigatório para salto) (SPEC-012).

↓

Contratar — marca a candidatura como `hired`; somente Owner nesta fase
(SPEC-012, RN-020). `hired` não cria automaticamente contratação, colaborador
ou onboarding (fora do escopo desta fase).

↓

Finalizar processo — `withdrawn`, `rejected`, `hired` ou `cancelled`; todo
estado final exige motivo e é definitivo (SPEC-012).

**Deixado explícito:** a decisão sempre pertence ao RH — à pessoa autorizada
que movimenta, finaliza ou contrata dentro do que sua role permite (por
exemplo, somente Owner marca `hired`, SPEC-012, RN-020). Nunca pertence à
IA.
Toda análise de IA, quando existir, é apoio: apresenta critério e evidência,
nunca aprova nem reprova sozinha (ADR-0016; `CONSTITUICAO_DO_PROJETO.md`;
`AGENTS.md`).

---

# 9. Papel da IA

**Quando atua:** somente quando as quatro condições da regra de execução
estiverem simultaneamente satisfeitas — `platform_ai_allowed`,
`organization_ai_enabled`, `feature_available_on_platform` e
`organization_feature_enabled` (ADR-0016; ADR-0017; ADR-0019, "Ordem
obrigatória de autorização"). Fora dessas condições, a IA nunca é acionada, e
nenhum dado de negócio é enviado a nenhum provider.

**Quando não atua:** quando qualquer uma das quatro condições acima for
falsa; quando a Organization não configurou credencial utilizável
(`Organization AI Provider Config`, ADR-0018); quando não há routing válido,
modelo compatível ou prompt publicado para a Feature (ADR-0019). Nesses
casos, o fluxo humano do módulo chamador continua normalmente — a ausência
de IA nunca bloqueia Candidate, Job Opening, CandidateApplication, Interview
ou qualquer outro fluxo (ADR-0016).

**Quais permissões precisa:** nenhuma permissão própria. A IA nunca é um
ator com Membership; toda execução de IA ocorre em nome do contexto validado
de uma Organization e de uma Feature específica, nunca por iniciativa
própria (ADR-0019, "AI Gateway").

**Como respeita cada camada:**

- **Blueprint Organizacional** (ADR-0020): a IA nunca cria, edita ou
  reinterpreta o DNA, a Estrutura Organizacional ou os catálogos próprios de
  uma Organization. Ela apenas consome, como dado de entrada minimizado, o
  que a Organization e sua governança (Owner/Admin) já publicaram.
- **Feature Policies** (`AI Feature Catalog` + `Organization AI Feature
  Settings`, ADR-0017): a IA só executa uma funcionalidade específica quando
  a plataforma a disponibilizou e a Organization a habilitou.
- **Provider Config** (`Organization AI Provider Config`, ADR-0018 — também
  referido como "Provider Policies" nesta jornada): a IA só resolve
  credencial depois das quatro condições de autorização, nunca antes, e
  nunca cruza Organizations ao resolver segredo.
- **AI Gateway** (ADR-0019): todo módulo de negócio que usa IA passa
  exclusivamente pelo `AIGateway`. Nenhum módulo importa SDK ou client de
  provider diretamente.
- **Prompt Registry** (ADR-0019): a IA só usa um `prompt_key` publicado, com
  versão registrada em cada execução; um prompt em `draft` ou `archived`
  nunca inicia execução nova.
- **Model Registry** (ADR-0019): a IA só usa um modelo ativo, compatível com
  a Feature (structured output, contexto, região quando aplicável).

**O que a IA nunca faz:**

- nunca cria regras próprias;
- nunca cria cultura organizacional;
- nunca cria critérios de avaliação;
- nunca decide contratação;
- nunca aprova nem reprova um candidato sozinha;
- nunca recebe dado de negócio fora do contexto autorizado da própria
  Organization, mesmo quando a credencial é `platform_managed` (ADR-0018,
  "Platform Managed"; ADR-0020, "Propriedade dos Dados").

Ela sempre trabalha utilizando apenas o contexto autorizado da Organization
— dados minimizados, validados pelo Prompt Registry, nunca o objeto completo
de Candidate, Interview ou CandidateApplication (ADR-0019, seção "Prompt e
dados sensíveis").

---

# 10. Portal Público

Cada Organization possui seu próprio Portal Público — a superfície pela qual
suas Vagas publicadas e abertas podem ser divulgadas (SPEC-010, "Divulgação
Pública").

O Portal Público pode:

- divulgar vagas abertas com título público, descrição, responsabilidades,
  requisitos, benefícios, localização, modelo de trabalho e, quando
  configurado, faixa salarial;
- compartilhar vagas por link direto com slug próprio, sem expor IDs
  internos (SPEC-010, RN-051).

Canais de divulgação previstos (produto, não SPEC de integração):

- LinkedIn;
- Instagram;
- Facebook;
- WhatsApp;
- Status do WhatsApp;
- link direto;
- QR Code.

Todo candidato inicia sua experiência pelo Portal Público (seção 7).

**Nota de escopo:** a mecânica detalhada do Portal Público como página
pública renderizada, os detalhes de cada canal de compartilhamento e a
candidatura pública em si (o candidato se cadastrando diretamente pela
página) ainda não têm ADR ou SPEC própria. O que já existe, especificado e
com regras de segurança definidas, é a divulgação pública da Vaga por slug
(SPEC-010) — a base técnica sobre a qual o Portal Público será construído.

---

# 11. Pré-Entrevista Inteligente

**Nota de escopo:** conceito de produto, sem ADR ou SPEC própria ainda. Não
existe implementação. Descrito aqui para orientar a visão funcional.

Após a candidatura, o candidato poderá responder perguntas inteligentes de
triagem inicial.

Essas perguntas pertencem exclusivamente à Organization — seguindo o mesmo
princípio já estabelecido para o Banco de Perguntas: perguntas próprias ou
adotadas globalmente, nunca compartilhadas entre Organizations (ADR-0011;
SPEC-009).

Quando a IA estiver habilitada para essa Feature específica na Organization
(ADR-0016 a ADR-0019), ela poderá gerar análises de apoio sobre as respostas.

Quando a IA estiver desabilitada — por falta de contratação, por decisão da
Organization, ou por indisponibilidade temporária — o fluxo continua
normalmente: o candidato responde, a candidatura segue seu processo, e o RH
avalia manualmente.

A Pré-Entrevista Inteligente jamais elimina automaticamente candidatos. Ela
é insumo de apoio para o RH, nunca um filtro automático de aprovação ou
reprovação (mesmo princípio da seção 9 e do ADR-0016).

---

# 12. Dossiê Inteligente

**Nota de escopo:** conceito de produto, sem ADR ou SPEC própria ainda. Não
existe implementação. Descrito aqui para orientar a visão funcional.

O RH recebe um relatório organizado sobre um candidato, reunindo informação
já existente e espalhada por diferentes entidades — nunca um novo dado
armazenado dentro do `Candidate` principal (ADR-0013: "Curriculos,
documentos, respostas, avaliações e histórico de processo não devem ficar
diretamente misturados na entidade principal do candidato").

Pode conter:

- currículo (dados estruturados do Candidate, SPEC-011);
- histórico (candidaturas e eventos da `CandidateApplication`, SPEC-012);
- competências (declaradas pelo candidato e/ou exigidas pela Vaga, via
  `competency_catalog_items.id`, SPEC-007/SPEC-010);
- evidências (registradas nas avaliações de entrevista, SPEC-013);
- respostas (registradas na entrevista, vinculadas ao snapshot da pergunta,
  SPEC-013);
- entrevistas (histórico de `Interview` da candidatura, SPEC-013);
- aderência ao Blueprint (comparação conceitual entre o perfil do candidato e
  o DNA/competências organizacionais da Organization — ADR-0020);
- aderência ao cargo (comparação conceitual entre o perfil do candidato e a
  versão publicada do Job Profile usada pela Vaga, SPEC-008/SPEC-010);
- DISC (quando existir);
- perfil comportamental (quando existir);
- análises de IA (quando habilitada) — sempre como texto de apoio com
  critérios e evidências, nunca como nota, ranking ou aprovação automática
  (ADR-0016; `CONSTITUICAO_DO_PROJETO.md`).

Sempre reforçar: é um instrumento de apoio. Nunca substitui a decisão
humana. O Dossiê Inteligente nunca produz `score`, `ranking` ou recomendação
vinculante — esses conceitos são explicitamente fora do escopo do processo
seletivo atual (SPEC-012, "Fora do Escopo") e, se algum dia existirem,
exigirão ADR e SPEC próprias que revisem esse limite explicitamente.

---

# 13. Blueprint Organizacional

O Blueprint Organizacional é o conjunto de mecanismos estruturais que toda
Organization usa para descrever a si mesma dentro da plataforma — e o
conteúdo que cada Organization preenche dentro desses mecanismos (ADR-0020,
"Blueprint Organizacional"). Ele representa o conhecimento organizacional da
empresa: é o maior ativo de propriedade exclusiva de cada Organization
(ADR-0020, "Propriedade dos Dados").

Pode conter:

- missão, visão, propósito (DNA Organizacional, SPEC-005);
- valores (DNA Organizacional, SPEC-005);
- competências (organizacionais, no DNA; e operacionais, no Catálogo de
  Competências, SPEC-005/SPEC-007);
- perfis e cargos (Job Profile e suas versões publicadas, SPEC-008);
- departamentos (Estrutura Organizacional / `Organizational Unit`,
  SPEC-006);
- perguntas (Banco de Perguntas próprio e adotado, SPEC-009);
- pesos e critérios (**nota importante**: pesos nunca pertencem ao item
  reutilizável do Blueprint em si — competência, pergunta ou cargo nunca têm
  peso próprio, por decisão explícita da ADR-0009. Pesos são definidos no
  contexto de uso, como a Vaga, quando ela vincula uma competência ou
  pergunta com um peso específico, SPEC-010. O Blueprint fornece o item
  reutilizável; o contexto de uso é quem atribui o peso);
- políticas (Feature Policies e políticas de fallback da Organization,
  ADR-0017/ADR-0019);
- configurações (Organization AI Settings, ADR-0016);
- Feature Settings (`Organization AI Feature Settings`, ADR-0017);
- Provider Settings (`Organization AI Provider Config`, ADR-0018).

O mecanismo do Blueprint — os tipos de unidade, as regras de versionamento,
o formato de cada catálogo — é definido e mantido por DocFounder e evolui
por ADR e SPEC de plataforma. O conteúdo dentro desse mecanismo é exclusivo
de cada Organization e nunca é compartilhado, copiado ou visível para outra
Organization (ADR-0020, "Isolamento Multiempresa").

Explicar que ele é o maior ativo da Organization: perder ou nunca construir
o Blueprint significa que a Organization não tem identidade cultural
registrada, não tem cargos formalizados, não tem competências ou perguntas
próprias — e, por consequência, não tem base para IA de apoio nem para um
processo seletivo consistente. Configurar o Blueprint é o primeiro passo real
de qualquer Organization nova (seção 4).

---

# 14. Fluxo Geral do Produto

DocFounder

↓

Cria Organization

↓

Owner configura Blueprint

↓

Publica vaga

↓

Portal Público

↓

Candidato

↓

Cadastro

↓

Pré-Entrevista

↓

IA (quando habilitada)

↓

Dossiê Inteligente

↓

RH

↓

Entrevista

↓

Contratação

---

# 15. Princípios Fundamentais

- IA é opcional. Nunca uma dependência estrutural de nenhum fluxo (ADR-0016).
- RH decide. A decisão de contratação sempre pertence a uma pessoa, nunca à
  IA (ADR-0016; ADR-0020).
- Cada Organization possui seu Blueprint. Mecanismo comum da plataforma,
  conteúdo exclusivo de cada Organization (ADR-0020).
- DocFounder fornece infraestrutura. Nunca decide o negócio de nenhuma
  Organization (ADR-0020, "Papel da DocFounder").
- Organization é proprietária dos dados. DocFounder opera a infraestrutura,
  nunca é proprietária do dado de negócio (ADR-0020, "Propriedade dos
  Dados").
- Nenhuma informação é compartilhada entre Organizations. Isolamento
  multiempresa é absoluto, sem exceção administrativa (ADR-0003 em diante;
  ADR-0020, "Isolamento Multiempresa").
- Toda IA trabalha apenas dentro do contexto autorizado — quatro condições
  simultâneas, dados minimizados, nunca o objeto de negócio completo
  (ADR-0016 a ADR-0019).

---

# 16. Fora do Escopo

Este documento não define:

- banco de dados;
- migrations;
- APIs;
- interfaces (telas, componentes, design);
- código;
- implementação técnica de qualquer capacidade descrita;
- providers de IA específicos;
- prompts;
- algoritmos (de IA, matching, ranking ou qualquer outro);
- DISC;
- Perfil Comportamental;
- Portal Público detalhado (mecânica de página pública, canais de
  compartilhamento, candidatura pública);
- Dossiê Inteligente detalhado (fontes exatas, algoritmo de composição,
  modelo de dados);
- Pré-Entrevista Inteligente detalhada (mecânica de perguntas adaptativas,
  modelo de dados, algoritmo);
- modelo comercial, planos e precificação entre DocFounder e Organization;
- fluxo de convite de usuário por e-mail;
- contratação, colaborador, onboarding, desenvolvimento ou retenção (módulos
  ainda sem SPEC própria — ver `docs/01-produto/BACKLOG.md`).

Esses assuntos pertencem a futuras ADRs e SPECs.

---

## Verificações realizadas

- Consistência revisada com ADR-0001 até ADR-0020.
- Consistência revisada com todas as SPECs aprovadas (SPEC-001 até
  SPEC-014).
- Nenhuma regra de negócio, permissão, campo ou entidade técnica foi
  redefinida — todas as referências são citações de reforço.
- Termos de produto sem ADR/SPEC própria (Portal Público, Pré-Entrevista
  Inteligente, Dossiê Inteligente, DISC, Perfil Comportamental, "Platform
  Admin (SuperAdmin)", "RH", "Provider Policies") foram explicitamente
  marcados como tal, nunca apresentados como já implementados ou já
  decididos.
