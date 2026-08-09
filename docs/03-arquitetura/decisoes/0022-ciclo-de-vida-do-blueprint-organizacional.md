# ADR 0022 - Ciclo de vida do Blueprint Organizacional

## Status

Aceita.

Esta ADR nasceu como `Proposta`, com um conjunto de ambiguidades
arquiteturais explicitamente registradas. Esta revisao fecha essas
ambiguidades: define "versao do Blueprint" como um manifesto agregado e
imutavel (nunca uma copia de dados), esclarece que ativacao e um checkpoint
sobre componentes que continuam sendo autoridade de seus proprios dados,
distingue formalmente componentes ja versionados dos que ainda nao sao, e
revisa o texto de consultoria da DocFounder para nao afirmar um mecanismo
tecnico de acesso ainda nao decidido. Nenhum conflito critico ou importante
com a ADR-0001 a ADR-0021 ou com as SPECs aprovadas foi encontrado nesta
revisao — o unico ponto de atencao registrado (numeracao de SPEC futura) e
descrito na secao "Criterios de completude" e no relatorio desta tarefa.

## Contexto

A ADR-0021 definiu o Blueprint Organizacional como o conjunto de
conhecimento e configuracoes que representa como uma Organization recruta,
seleciona e, futuramente, desenvolve pessoas. Aquela ADR formalizou o que o
Blueprint e, a quem pertence e do que e composto — mas deixou
deliberadamente em aberto o seu ciclo de vida.

Ainda falta definir:

- como o Blueprint nasce;
- quando pode ser usado operacionalmente;
- quem pode altera-lo;
- como evolui;
- como historico e preservado;
- como processos seletivos antigos convivem com mudancas futuras do
  Blueprint;
- como futuras analises de IA sabem qual contexto organizacional utilizar.

Esta ADR fecha essas decisoes conceituais, sem definir schema fisico, API ou
implementacao.

## Objetivo

Formalizar o ciclo de vida conceitual do Blueprint Organizacional — o que
significa uma "versao" dele, seus estados, quem pode altera-lo, como ele
evolui, como preserva historico e como se relaciona com execucoes de IA e
com processos seletivos ja em andamento — de forma consistente com a
ADR-0021 e com o padrao de versionamento ja estabelecido para DNA
Organizacional (SPEC-005), Cargo (SPEC-008) e Vaga (SPEC-010).

## Natureza do Blueprint

Cada Organization possui um unico Blueprint logico. "Unico" significa que
existe exatamente um Blueprint por Organization — nunca varios Blueprints
paralelos, nunca um Blueprint por departamento ou por Vaga — nao que ele seja
estatico ou de versao unica ao longo do tempo.

Esse Blueprint evolui ao longo do tempo. "Unico Blueprint" nao significa uma
unica versao fisica congelada: o mesmo Blueprint logico pode, e deve, passar
por multiplas geracoes de conteudo conforme a Organization amadurece sua
cultura, sua estrutura, seus cargos e seus criterios.

O historico precisa ser preservado. Mudancas de Blueprint nunca podem
reescrever decisoes ou evidencias historicas ja produzidas com base numa
versao anterior — o mesmo principio ja aplicado a DNA Organizacional
(SPEC-005: "versoes publicadas e arquivadas sao imutaveis"), a Cargo
(SPEC-008) e a Vaga (SPEC-010).

## Versao do Blueprint

Uma versao do Blueprint e, conceitualmente, uma **referencia agregada e
imutavel do contexto organizacional vigente** — nunca uma copia completa
dos dados de todos os modulos que a compoem.

A futura implementacao devera possuir algum identificador estavel de versao
do Blueprint. Esse identificador deve permitir que futuras entidades
registrem `blueprint_version_id`, ou referencia conceitualmente
equivalente, quando precisarem preservar qual contexto organizacional
estava vigente no momento de uma operacao (secoes "Componentes ja
versionados", "Snapshot e referencia historica" e "IA e Blueprint").

Esta ADR nao define tabela fisica para esse identificador. Ver "Fora do
escopo".

### Principio: manifesto de contexto

A versao do Blueprint funciona como um **manifesto de contexto**: ela
registra quais componentes e configuracoes compunham o contexto
organizacional vigente naquele momento, sem duplicar o conteudo desses
componentes.

Pode referenciar conceitualmente:

- versao vigente do DNA Organizacional;
- configuracoes culturais;
- competencias relevantes;
- cargos/perfis aplicaveis;
- perguntas/configuracoes vigentes;
- politicas;
- criterios;
- Feature Settings relevantes;
- demais componentes definidos futuramente.

O manifesto nunca duplica conteudo completo apenas para formar o Blueprint.
Cada modulo continua sendo autoridade de seus proprios dados — reforcado
pela ADR-0021, secao "Multiempresa": o Blueprint "formaliza a leitura
conceitual unificada de componentes que ja existem e ja sao isolados
individualmente".

## Blueprint como agregado

O Blueprint nao substitui:

- DNA Organizacional (SPEC-005);
- Estrutura Organizacional (SPEC-006);
- Catalogo de Competencias (SPEC-007);
- Cargos (SPEC-008);
- Banco de Perguntas (SPEC-009);
- Feature Settings (ADR-0017);
- Provider Settings (ADR-0018);
- demais modulos, presentes ou futuros.

O Blueprint agrega e referencia esses componentes; ele nunca e um segundo
editor para o mesmo conteudo. Criar, editar e publicar conteudo continua
sendo responsabilidade exclusiva do mecanismo proprio de cada componente
(SPEC-005 a SPEC-009). Este principio fundamenta a definicao de "checkpoint
agregado" usada na secao "Ativacao".

## Estados conceituais

O Blueprint, como conceito agregado, possui tres estados conceituais:

- `draft`;
- `active`;
- `archived`.

Esta ADR nao cria estados adicionais.

**Nota de nomenclatura:** o estado `active` do Blueprint e deliberadamente
diferente, em dois sentidos, de terminologia ja usada em outros modulos:

- e diferente de `published`, usado por DNA, Cargo e Vaga (SPEC-005,
  SPEC-008, SPEC-010) — `active` descreve o estado agregado do Blueprint
  como um todo (a Organization esta operacionalmente pronta), enquanto
  `published` descreve o estado de cada componente individual (esta versao
  especifica do DNA, deste Cargo, desta Vaga);
- e diferente do status operacional `active`/`inactive` usado por Candidate
  (SPEC-011), Job Profile (SPEC-008) e Organizational Unit (SPEC-006) — que
  descreve se um registro individual esta disponivel para uso corrente ou
  foi inativado, nunca um estado de ciclo de vida versionado.

Os tres vocabularios — `active` de Blueprint, `published` de componente
versionado, `active`/`inactive` de registro operacional — nunca devem ser
confundidos entre si.

### draft

- em construcao;
- ainda nao e referencia operacional;
- pode ser editado por atores autorizados (secao "Responsabilidade e
  autorizacao");
- pode ser usado em validacao ou simulacao interna;
- nao deve ser utilizado por processos seletivos reais;
- nao significa necessariamente incompleto — ver "Readiness e completude".

### active

- versao vigente da Organization;
- referencia para novas operacoes;
- utilizada por novas vagas, processos e analises quando aplicavel;
- imutavel enquanto ativa — qualquer alteracao relevante de conteudo deve
  gerar uma nova versao `draft`, nunca editar a versao `active` diretamente
  (mesmo principio de imutabilidade ja aplicado a versoes `published` de
  DNA, Cargo e Vaga).

### archived

- versao historica;
- nao utilizada para novas operacoes;
- continua disponivel para rastreabilidade;
- nunca e apagada fisicamente por fluxo normal (secao "Exclusao").

Esta ADR nao define tabela para esses estados. Ver secao "Fora do escopo".

## Uma versao ativa por Organization

- cada Organization pode possuir no maximo uma versao `active` do Blueprint
  por vez;
- pode existir no maximo um `draft` em construcao por Organization, nesta
  primeira arquitetura, salvo decisao futura especifica que abra excecao;
- uma Organization pode possuir multiplas versoes `archived` ao longo do
  tempo, sem limite conceitual;
- ativar uma nova versao deve arquivar a anterior de forma atomica;
- nunca pode haver duas versoes `active` simultaneas para a mesma
  Organization.

Esta regra espelha exatamente o padrao ja estabelecido para DNA
Organizacional ("no maximo uma versao publicada por Organization", SPEC-005,
RN-006), para Job Profile ("apenas uma versao publicada por Job Profile",
SPEC-008, RN-018) e para Job Opening ("apenas uma versao publicada por
Vaga", SPEC-010, RN-025). O Blueprint, como agregacao, adota o mesmo
principio no nivel agregado.

## Readiness e completude

Alem dos tres estados canonicos (secao "Estados conceituais"), esta ADR
reconhece **readiness** (prontidao) como uma propriedade computada sobre um
`draft` — nunca um quarto estado canonico do Blueprint.

Tres situacoes distintas, dentro dos mesmos tres estados:

- **Blueprint em construcao**: um `draft` que ainda nao atende aos
  criterios de completude vigentes (secao "Criterios de completude");
- **Blueprint valido para ativacao**: um `draft` que ja atende aos
  criterios de completude vigentes, mas ainda nao foi ativado — aguardando
  decisao do Owner;
- **Blueprint ativo**: a versao `active` corrente.

`draft` nao significa necessariamente invalido. Pode existir um draft
completo, pronto, aguardando apenas a decisao do Owner de ativa-lo.
Readiness e consultavel a qualquer momento por Owner e Admin (secao
"Responsabilidade e autorizacao"), mas nunca ativa o Blueprint
automaticamente — ativacao permanece sempre uma decisao explicita do Owner
(secao "Ativacao").

## Criacao inicial

Fluxo conceitual:

1. Organization e criada (SPEC-001);
2. Blueprint inicial nasce como `draft`;
3. Owner configura informacoes — usando os mecanismos ja existentes de cada
   componente (rascunho de DNA, Estrutura Organizacional, competencias,
   perguntas, Cargos);
4. consultoria DocFounder pode auxiliar (secao "Consultoria DocFounder");
5. validacoes sao realizadas contra os criterios minimos vigentes (secoes
   "Criterios de completude" e "Readiness e completude");
6. Owner aprova ativacao;
7. Blueprint torna-se `active`;
8. a Organization passa a estar operacionalmente pronta para utilizar
   recursos que dependam dele.

Esta ADR nao exige que todos os modulos futuros dependam obrigatoriamente do
Blueprint completo. A ativacao progressiva e permitida, conforme criterios de
completude definidos futuramente (secao "Criterios de completude") — por
exemplo, uma Organization pode ativar seu Blueprint sem IA contratada, e
ativar Feature Settings/Provider Settings apenas quando decidir usar IA
(consistente com a ADR-0016: IA nunca e requisito estrutural).

## Responsabilidade e autorizacao

### Owner

Pode:

- iniciar o Blueprint;
- editar o `draft`;
- solicitar e confirmar a ativacao;
- criar nova versao;
- consultar historico;
- arquivar, conforme regras futuras.

Owner e a autoridade final da Organization para tornar uma versao
operacional. Esta regra espelha exatamente o padrao ja estabelecido: somente
Owner publica DNA (SPEC-005, RN-018/CA-006), somente Owner publica Job
Profile (SPEC-008, RN-026), somente Owner publica Job Opening (SPEC-010,
secao 12.1). Ativar o Blueprint e a mesma autoridade, agora aplicada ao
nivel agregado.

### Admin

Pode:

- colaborar na edicao do `draft`;
- configurar os modulos/componentes nos quais possui permissao propria (por
  exemplo, editar rascunho de DNA ou de Cargo, dentro do que SPEC-005 e
  SPEC-008 ja autorizam a Admin);
- consultar a readiness do draft atual (secao "Readiness e completude");
- consultar a versao `active`;
- consultar historico quando autorizado.

Admin nao ativa versao em nome do Owner nesta primeira arquitetura — mesmo
limite ja aplicado a publicacao de DNA (SPEC-005: "admin nao publica") e de
Job Profile (SPEC-008: "admin nao pode... publicar").

### Member

Pode:

- consumir as partes do Blueprint necessarias as suas funcoes (por exemplo,
  visualizar a versao publicada do DNA, unidades ativas, competencias e
  perguntas ativas, Cargos publicados — sempre dentro do que cada SPEC de
  componente ja autoriza a Member).

Member nao administra o ciclo de vida do Blueprint.

### Platform Admin

- nao edita Blueprint funcional;
- nao ativa Blueprint;
- nao altera cultura, criterios, pesos ou regras do cliente;
- pode realizar leitura administrativa auditada quando autorizado pelas
  politicas da plataforma — o mesmo padrao ja aplicado a todo componente do
  Blueprint (SPEC-005 RN-019, SPEC-006, SPEC-007, SPEC-008, SPEC-009,
  SPEC-010).

## Consultoria DocFounder

Esta ADR nao transforma consultoria em role funcional nova.

- "Consultor de Implantacao DocFounder" e um papel operacional/organizacional
  da DocFounder como empresa, nao uma role canonica do sistema (que continua
  restrita a `owner`, `admin`, `member` e Platform Admin — SPEC-004);
- a consultoria atua mediante autorizacao da Organization;
- toda acao funcional sobre o Blueprint continua sujeita a autorizacao da
  propria Organization, seguindo as mesmas regras de qualquer outro ator.
  Esta ADR nao afirma que o consultor recebe automaticamente Membership
  `owner` ou `admin`: a forma tecnica exata pela qual a consultoria obtem
  autorizacao para atuar dentro da plataforma (Membership temporaria,
  acesso assistido supervisionado, ou outro mecanismo) permanece em aberto e
  exige decisao propria (ver "Fora do escopo");
- Platform Admin nao deve ser usado como atalho para editar o Blueprint, em
  nenhuma circunstancia — esta restricao e definitiva e independe da
  decisao tecnica pendente acima.

Esta secao reforca, e agora esta plenamente consistente com, o esclarecimento
registrado na ADR-0021, secao "Consultoria": a consultoria de implantacao e
um servico humano, nunca uma operacao do perfil tecnico Platform Admin, e o
consultor nao recebe automaticamente Membership `owner` ou `admin`.

O mecanismo tecnico exato de acesso temporario da consultoria nao e
decidido nesta ADR. Fica para uma ADR ou SPEC futura de implantacao e
suporte assistido (ver "Fora do escopo").

## Ativacao

`Ativar Blueprint` significa criar ou confirmar um **checkpoint imutavel**
do contexto organizacional que passara a valer para novas operacoes. Nao
significa republicar ou copiar fisicamente todos os componentes.

Ativar o Blueprint e um checkpoint agregado sobre o estado atual dos
componentes do Blueprint — DNA, Estrutura Organizacional, Catalogo de
Competencias, Banco de Perguntas, Cargos, Feature Settings, Provider
Settings — cada um deles publicado ou atualizado por meio do seu proprio
mecanismo ja existente (SPEC-005 a SPEC-009, ADR-0017, ADR-0018). Ativar o
Blueprint nao e um editor de conteudo paralelo aos mecanismos ja existentes
de cada componente (secao "Blueprint como agregado"); e a confirmacao de
que o conjunto vigente desses componentes esta pronto para uso operacional.

Fluxo conceitual:

componentes/configuracoes evoluem

↓

novo Blueprint `draft` agrega referencias

↓

validacao (readiness — secao "Readiness e completude")

↓

Owner ativa

↓

checkpoint torna-se `active`

↓

Blueprint anteriormente ativo vira `archived`

A ativacao deve, conceitualmente:

- validar o ator (deve ser Owner da Organization);
- validar que a Organization esta ativa (nao arquivada);
- validar que existe um `draft` do Blueprint em construcao;
- validar os criterios minimos obrigatorios vigentes (secoes "Criterios de
  completude" e "Readiness e completude");
- impedir ativacao concorrente (secao "Concorrencia");
- arquivar a versao `active` anterior, quando existir;
- ativar a nova versao;
- registrar auditoria;
- ocorrer atomicamente.

Falha em qualquer etapa nao deve deixar estado parcial — o mesmo padrao ja
exigido para a publicacao de DNA (SPEC-005, secao 7.3: "se qualquer etapa
falhar, nenhuma alteracao deve permanecer"), de Job Profile (SPEC-008,
RN-027/028) e de Job Opening (SPEC-010, secao 12.1).

## Criterios de completude

Esta ADR nao define, ainda, todos os campos obrigatorios para considerar um
Blueprint pronto para ativacao. Formaliza apenas o principio:

Um Blueprint pode ser ativado somente quando satisfizer os criterios de
completude aplicaveis aquela Organization especifica.

Esses criterios devem depender:

- dos modulos em uso pela Organization;
- das Features de IA habilitadas (ADR-0017);
- das funcionalidades contratadas;
- das dependencias tecnicas necessarias entre componentes.

Exemplos:

- uma Organization sem IA contratada nao precisa configurar Provider
  Settings para ativar seu Blueprint — IA continua sendo uma capacidade
  opcional, nunca um requisito estrutural (ADR-0016);
- uma Feature de IA desabilitada, na plataforma ou na Organization, nao deve
  impor configuracao obrigatoria para ativacao, sem necessidade real
  (ADR-0017);
- ativacao nao significa, em nenhuma hipotese, preencher obrigatoriamente
  todo campo existente na plataforma.

Uma SPEC futura devera definir os criterios minimos verificaveis de
completude. **Nota de numeracao:** o pedido desta revisao referenciou essa
SPEC futura provisoriamente como "SPEC-015". `docs/01-produto/BACKLOG.md`
ja reserva SPEC-015, SPEC-016 e SPEC-017 para Propostas, Onboarding e
Desenvolvimento e Retencao, respectivamente — nenhuma delas e sobre
completude de Blueprint. Esta ADR nao fixa um numero de SPEC para esse
trabalho futuro; o numero definitivo deve ser atribuido no momento em que
essa SPEC for efetivamente priorizada e registrada no backlog, para nao
colidir com a numeracao ja reservada. Ver relatorio desta tarefa.

## Evolucao

Uma Organization pode evoluir o Blueprint apos a ativacao.

Fluxo conceitual:

`active`

↓

criar novo `draft`

↓

editar (usando os mecanismos proprios de cada componente alterado)

↓

validar

↓

ativar

↓

versao anterior vira `archived`

O Blueprint nunca deve ser editado silenciosamente na sua versao `active`
quando a mudanca afetar contexto historico (secao "Mudancas menores"
distingue o que pode ser simples do que exige nova versao).

## Mudancas menores

Nem toda alteracao precisa gerar uma nova versao do Blueprint. Esta ADR
distingue conceitualmente duas categorias, sem definir a lista fisica final:

### Dados operacionais nao historicos

Exemplos possiveis:

- descricao editorial;
- textos auxiliares;
- informacao sem impacto analitico.

Podem, futuramente, admitir atualizacao simples, sem exigir nova versao do
Blueprint.

### Dados que alteram contexto

Exemplos:

- missao;
- visao;
- valores;
- cultura;
- criterios;
- competencias relevantes;
- perfis ideais;
- regras de analise;
- parametros usados pela IA.

Devem preservar historico e versionamento — qualquer alteracao nesses dados
exige nova versao `draft` do Blueprint, nunca edicao direta da versao
`active`.

Uma SPEC futura deve classificar precisamente cada campo em uma das duas
categorias. Esta ADR nao decide a lista final agora.

## Historico

Uma versao do Blueprint, uma vez `active`, e imutavel como referencia
historica — o mesmo principio ja aplicado a toda versao `published` de DNA,
Cargo e Vaga (secao "Natureza do Blueprint").

Depois de `active`:

- alteracoes contextuais relevantes exigem um novo `draft` (secao
  "Mudancas menores");
- ativar um novo `draft` nao altera a versao anterior, que apenas transita
  para `archived`;
- um Blueprint `archived` continua referenciavel para fins de
  rastreabilidade, consulta autorizada e auditoria;
- nenhum historico e reinterpretado quando uma nova versao e ativada (secao
  "Nao retroatividade").

## Componentes ja versionados

Componentes que ja possuem versionamento formal proprio continuam
utilizando exclusivamente seus proprios mecanismos, sem alteracao por esta
ADR:

- DNA Organizacional — rascunho, publicacao e arquivamento (SPEC-005);
- Cargo / Job Profile — rascunho, publicacao e arquivamento (SPEC-008);
- Vaga / Job Opening — rascunho, publicacao e arquivamento (SPEC-010);
- demais modulos futuros que venham a versionar formalmente seu conteudo.

A versao do Blueprint (manifesto, secao "Versao do Blueprint") pode,
futuramente, referenciar versoes especificas desses componentes quando isso
for necessario para rastreabilidade — por exemplo, apontando para o
`version_number` especifico de uma versao publicada de DNA ou de Cargo no
momento da ativacao. Esta ADR nao altera os schemas existentes desses
componentes para viabilizar essa referencia; isso fica para SPEC futura
(secao "Fora do escopo").

## Componentes ainda nao versionados

Componentes sem versionamento formal continuam validos nesta fase e nao sao
bloqueados por esta ADR:

- Estrutura Organizacional (SPEC-006);
- Catalogo de Competencias (SPEC-007, secao "Imutabilidade e historico":
  "sem versionamento formal, o catalogo representa o estado atual da
  competencia");
- Banco de Perguntas (SPEC-009, "Limitacoes Conhecidas": "nao ha
  versionamento formal de perguntas").

A futura SPEC do Blueprint (secao "Criterios de completude") devera decidir
como o manifesto preservara o contexto necessario desses componentes no
momento de cada ativacao. Possibilidades tecnicas futuras podem incluir:

- referencia direta ao estado atual, sem congelamento;
- snapshot minimo do subconjunto usado;
- versao propria futura desses componentes;
- outro mecanismo auditavel equivalente.

Esta ADR nao escolhe o mecanismo fisico agora.

## Snapshot e referencia historica

Principio fundamental: processos seletivos historicos devem permanecer
interpretaveis segundo o contexto vigente quando ocorreram.

Portanto, como necessidade arquitetural para SPECs e migrations futuras
(nunca como alteracao imediata de schema existente):

- Job Opening futura pode referenciar a versao do Blueprint usada no
  momento de sua publicacao, complementando o vinculo ja existente com
  `job_profile_version_id` (SPEC-010, SPEC-012);
- CandidateApplication futura pode preservar referencia contextual ao
  Blueprint quando necessario;
- Pre-Entrevista pode registrar a versao do Blueprint usada;
- Dossie Inteligente deve registrar qual versao do Blueprint sustentou a
  analise;
- AI Execution deve poder ser correlacionada com o contexto do Blueprint
  usado, complementando o que a ADR-0019 ja registra para `prompt_key` e
  `prompt_version`.

Esta ADR nao altera agora os schemas existentes de `job_opening_versions`,
`candidate_applications` ou `ai_executions`. Registra apenas a necessidade
arquitetural para SPECs e migrations futuras (ver "Fora do escopo").

## Dossie e Pre-Entrevista futuros

Registrado prospectivamente, sem implementar:

- Pre-Entrevista devera poder registrar qual versao do Blueprint
  contextualizou sua analise;
- Dossie Inteligente devera informar qual versao do Blueprint sustentou
  suas conclusoes;
- analises futuras devem preservar essa referencia;
- reanalise com um Blueprint novo e sempre uma nova operacao explicita e
  auditada, nunca uma substituicao silenciosa da analise original (secao
  "Nao retroatividade").

Esta ADR nao implementa Pre-Entrevista nem Dossie Inteligente. Ver "Fora do
escopo".

## IA e Blueprint

Toda analise de IA que dependa de contexto organizacional deve resolver uma
versao especifica do Blueprint antes de iniciar. A execucao fica vinculada
a essa versao ate o fim.

Fluxo conceitual:

Blueprint v3 ativo

↓

AI Execution inicia usando v3

↓

Blueprint v4 e ativado

↓

execucao em andamento continua em v3

↓

novas execucoes passam a usar v4

Nunca mudar o contexto no meio de uma execucao. Nunca reinterpretar
automaticamente uma execucao historica com um Blueprint mais novo.

Este principio espelha exatamente o que a ADR-0019 ja exige para prompts:
"se uma nova versao de prompt for publicada durante uma execucao em
andamento, a execucao em andamento continua associada a versao ja resolvida
no inicio daquela execucao" (ADR-0019, secao "Prompt version utilizado").

O identificador exato de "versao do Blueprint" referenciado neste exemplo
(por exemplo, um numero sequencial de ativacao) e uma necessidade
arquitetural registrada por esta ADR (secao "Versao do Blueprint"); seu
mecanismo fisico exato fica para SPEC futura (ver "Fora do escopo").

## Processos em andamento

A ativacao de uma nova versao do Blueprint nao deve alterar automaticamente:

- Vagas ja publicadas;
- `CandidateApplication` existentes;
- Entrevistas existentes;
- avaliacoes realizadas;
- relatorios ja produzidos;
- `AI Execution` concluidas.

Novas operacoes utilizam a versao vigente do Blueprint conforme regra da
futura SPEC funcional correspondente. Este principio e uma extensao direta
do que a ADR-0012 ja estabelece para Vagas ("alteracoes futuras no Cargo nao
modificam versoes existentes da Vaga") e do que a ADR-0014 estabelece para
`CandidateApplication` ("mudancas futuras na Vaga nunca alteram uma
candidatura existente").

## Nao retroatividade

Uma nova versao do Blueprint nunca altera automaticamente:

- Vagas ja publicadas;
- candidaturas (`CandidateApplication`) existentes;
- Entrevistas existentes;
- avaliacoes ja realizadas;
- Pre-Entrevistas futuras ja concluidas;
- Dossies Inteligentes futuros ja produzidos;
- `AI Execution` ja concluidas;
- relatorios ja produzidos;
- decisoes humanas ja registradas.

Um Blueprint novo nunca:

- recalcula automaticamente analises antigas;
- altera score ou indicador historico;
- reescreve relatorio ja produzido;
- modifica decisao humana ja registrada;
- substitui evidencia ja registrada;
- muda historico.

Se, no futuro, existir a necessidade de "reanalise com Blueprint atual",
essa reanalise deve ser uma nova operacao explicita e auditada, que
preserva a analise original intacta — nunca uma sobrescrita. Este principio
e consistente com o que a ADR-0019 ja exige para Model Registry: "mudancas
futuras no Model Registry nunca reinterpretam execucoes anteriores"
(ADR-0019, secao "Modelo utilizado").

## Auditoria

Devem ser auditados, conceitualmente:

- `blueprint.draft_created`;
- `blueprint.draft_updated`;
- `blueprint.activation_requested`;
- `blueprint.activated`;
- `blueprint.activation_denied`;
- `blueprint.previous_version_archived`;
- `blueprint.administrative_read`;
- `blueprint.permission_denied`;
- `blueprint.cross_organization_access_denied`.

Estes nomes sao conceituais e ilustrativos, seguindo o padrao ja usado em
`organization_dna.*` (SPEC-005), `job_profile.*` (SPEC-008) e
`job_opening.*` (SPEC-010); a nomenclatura final e responsabilidade de SPEC
futura.

Auditoria nunca deve registrar o conteudo completo do Blueprint. Deve
registrar apenas:

- Organization;
- versao (identificador, quando aplicavel);
- ator;
- acao;
- campos ou categorias alterados, quando seguro expor;
- timestamps;
- motivo, quando aplicavel.

Este padrao e identico ao ja exigido para DNA Organizacional (SPEC-005,
secao "Auditoria": "a auditoria nao copia o conteudo completo do DNA").

## Seguranca

O Blueprint contem informacao estrategica. Regras:

- isolamento absoluto por Organization, em todo componente e em toda
  agregacao;
- nenhuma leitura cruzada entre Organizations;
- historico protegido com o mesmo rigor do conteudo vigente;
- versao arquivada continua protegida — arquivamento nunca reduz o nivel de
  protecao de acesso;
- nenhuma IA recebe versao de Blueprint de outra Organization, mesmo quando
  a credencial subjacente e `platform_managed` (ADR-0018; ADR-0021, secao
  "Relacionamento com IA");
- nenhuma consultoria reutiliza Blueprint de um cliente em outro cliente,
  reafirmando a ADR-0021, secao "DocFounder".

## Exclusao

Esta ADR nao define exclusao fisica do Blueprint.

- versoes historicas nao devem ser apagadas por fluxo funcional normal;
- arquivamento e o mecanismo de retirada operacional, nunca exclusao;
- retencao, anonimizacao ou exclusao definitiva devem seguir politica
  futura e especifica de compliance, fora do escopo desta ADR — o mesmo
  tratamento ja dado pela ADR-0013 para anonimizacao futura de Candidate.

## Concorrencia

Cenarios principais a considerar em implementacao futura:

- dois Owners tentando ativar versoes simultaneamente;
- Owner ativando enquanto Admin edita o `draft`;
- duas criacoes simultaneas de `draft`;
- ativacao de nova versao enquanto uma Feature de IA esta resolvendo
  contexto para uma execucao em andamento.

Principios:

- o estado final precisa ser deterministico;
- nenhuma operacao pode deixar estado parcialmente aplicado;
- quem iniciou uma operacao com uma versao do Blueprint valida mantem
  aquela referencia ate o fim da operacao, mesmo que uma nova versao seja
  ativada nesse intervalo (mesmo principio da secao "IA e Blueprint");
  novas operacoes, iniciadas apos a ativacao, usam a versao nova;
- a implementacao futura deve usar transacao, bloqueio de linha (`SELECT
  ... FOR UPDATE` ou equivalente) ou controle otimista quando aplicavel —
  o mesmo padrao ja exigido pela ADR-0004 (protecao do ultimo owner),
  ADR-0005/SPEC-005 (publicacao de DNA), ADR-0014/SPEC-012 (concorrencia de
  candidatura) e ADR-0018 (rotacao de credencial).

## Relacionamento com modulos existentes

Esta ADR nao altera retroativamente:

- DNA Organizacional (SPEC-005);
- Estrutura Organizacional (SPEC-006);
- Competencias (SPEC-007);
- Cargos (SPEC-008);
- Banco de Perguntas (SPEC-009);
- Vagas (SPEC-010);
- Candidatos (SPEC-011);
- `CandidateApplication` (SPEC-012);
- Entrevistas (SPEC-013);
- Infraestrutura de IA (ADR-0016 a ADR-0019, SPEC-014).

Ela fornece uma regra arquitetural conceitual para futuras integracoes e
futuros versionamentos entre o Blueprint e esses modulos, nunca uma
alteracao imediata de nenhum deles.

## Consequencias

**Beneficios:**

- rastreabilidade completa entre uma decisao/analise e o contexto
  organizacional vigente no momento em que ela ocorreu;
- IA contextualizada de forma estavel e auditavel;
- historico confiavel, nunca reescrito silenciosamente;
- seguranca reforcada sobre um ativo estrategico;
- evolucao organizacional continua, sem exigir "recomecar do zero";
- ausencia de reinterpretacao silenciosa de analises e decisoes passadas;
- consultoria de implantacao estruturada, sem ambiguidade de autoridade;
- previsibilidade arquitetural para Features de IA futuras que dependam de
  contexto organizacional.

**Custos:**

- maior complexidade de versionamento, agora tambem no nivel agregado do
  Blueprint, alem do nivel de cada componente;
- necessidade futura de snapshots e referencias entre Job Opening,
  CandidateApplication, Pre-Entrevista, Dossie Inteligente e AI Execution;
- necessidade de politicas de completude bem definidas antes da ativacao;
- maior cuidado exigido em cenarios de concorrencia;
- necessidade de migrations futuras para introduzir qualquer mecanismo
  fisico de versionamento agregado do Blueprint.

## Fora do escopo

Esta ADR nao define:

- schema fisico do manifesto de versao do Blueprint;
- migrations;
- endpoints;
- interface de usuario;
- composicao tecnica final do manifesto;
- lista exata de criterios de completude (fica para SPEC futura — ver nota
  de numeracao na secao "Criterios de completude");
- mecanismo tecnico exato de acesso temporario do consultor de implantacao;
- Portal Publico;
- Candidatura Publica;
- Pre-Entrevista Inteligente (mecanica detalhada);
- DISC;
- Perfil Comportamental;
- Dossie Inteligente (mecanica detalhada);
- algoritmo de IA;
- exclusao definitiva da Organization;
- politica legal de retencao.

Esses temas pertencem as proximas ADRs e SPECs.
