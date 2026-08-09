# ADR 0020 - Organization como unidade autonoma

## Status

Aceita.

## Contexto

Desde a ADR-0003, o Talent OS e multiempresa: toda a plataforma gira em torno de
`Organization`, `User` e `Membership`, com autorizacao centralizada no servidor
e identificador enviado pelo cliente nunca aceito como prova de permissao.

Cada ADR subsequente reafirmou, de forma independente e para um modulo
diferente, o mesmo principio: `Organizational Unit` (ADR-0007) pertence a uma
Organization e nunca muda de Organization; `organization_dna_versions`
(ADR-0005) pertence a uma Organization; `organization_competencies` (ADR-0010)
e isolada por `organization_id`, enquanto `global_competencies` e administrada
somente por Platform Admin; perguntas proprias (ADR-0011) pertencem a
Organization enquanto perguntas globais pertencem a plataforma; `Job Opening`
(ADR-0012), `Candidate` (ADR-0013), `CandidateApplication` (ADR-0014) e
`Interview` (ADR-0015) pertencem exatamente a uma Organization, com vinculo
imutavel e sem excecao; e a infraestrutura de IA (ADR-0016 a ADR-0019) repete o
mesmo desenho para `organization_ai_settings`,
`organization_ai_feature_settings`, `organization_ai_provider_configs`,
`ai_provider_routing_policies` e `ai_executions`, sempre com catalogos globais
de plataforma (`ai_feature_catalog`, `ai_provider_catalog`,
`ai_model_registry`, `ai_prompt_registry`) que uma Organization consome, mas
nunca cria ou controla.

Todas essas ADRs tambem repetem, cada uma a sua maneira, que Platform Admin nao
recebe role funcional dentro da Organization (explicito nas ADR-0003, 0011,
0012, 0013, 0014, 0016, 0017, 0018 e 0019) e que dados de uma Organization
nunca atravessam para outra, sob nenhuma circunstancia (explicito nas
ADR-0013, 0014, 0015, 0016, 0018 e 0019).

Ate aqui, esse principio nunca foi registrado como uma decisao arquitetural
propria. Ele existe apenas como um padrao repetido, module a modulo, em texto
proprio de cada ADR. Isso cria risco de divergencia redacional entre ADRs
futuras, dificulta apontar uma unica fonte de verdade quando uma nova SPEC
precisa justificar isolamento por Organization, e obriga cada nova ADR a
reescrever, com suas proprias palavras, uma regra que ja deveria ser
tratada como assentada.

Esta ADR nao inaugura o principio de isolamento multiempresa. Ela formaliza,
em um unico lugar, o que ja esta em vigor desde a ADR-0003 e foi confirmado por
todas as ADRs posteriores, e explicita a fronteira entre a autonomia de uma
Organization e a autoridade de Platform Admin sobre catalogos e politicas de
plataforma — fronteira ja praticada, mas nunca antes escrita como principio
geral e unico.

## Objetivo

Consolidar, em uma unica ADR de referencia, o principio ja praticado por todas
as ADRs anteriores de que cada Organization opera como unidade autonoma de
dados, decisao e configuracao dentro do Talent OS, para que:

- SPECs e ADRs futuras possam referenciar esta decisao diretamente, em vez de
  reformular o mesmo principio a cada novo modulo;
- a fronteira entre autonomia de Organization e autoridade de plataforma
  (Platform Admin, catalogos globais) fique definida uma unica vez, de forma
  explicita, para todos os modulos presentes e futuros;
- alteracoes, expansoes ou excecoes a este principio exijam revisao explicita
  desta ADR, em vez de decisoes implicitas e dispersas modulo a modulo.

Esta ADR nao introduz nenhuma capacidade nova. Ela nomeia e centraliza uma
regra arquitetural que ja rege o sistema inteiro desde a Fase 1.

## Decisao arquitetural

Fica decidido que `Organization` e a unidade autonoma fundamental de operacao
do Talent OS. Toda entidade de dado de negocio, presente ou futura, pertence
exatamente a uma Organization, e essa Organization opera sobre seus proprios
dados, sua propria configuracao e suas proprias decisoes sem depender, ser
influenciada por, ou influenciar qualquer outra Organization.

Autonomia de Organization, nesta arquitetura, significa duas coisas
simultaneas, nunca uma sem a outra:

- **isolamento**: dados, configuracao e decisoes de uma Organization nunca sao
  lidos, gravados, referenciados, herdados ou afetados por outra Organization,
  sob nenhuma circunstancia, em nenhum modulo, presente ou futuro;
- **autogoverno interno**: dentro dos limites que a plataforma disponibiliza,
  cada Organization decide por si mesma — por meio de sua propria governanca
  interna de Membership (`owner`, `admin`, `member`) — como usar, habilitar,
  configurar ou operar cada capacidade que a plataforma oferece.

Autonomia de Organization nao significa independencia da plataforma. Recursos,
catalogos e politicas de escopo global (Platform Admin, catalogos globais de
competencias, perguntas, Feature Catalog, Provider Catalog, Model Registry e
Prompt Registry de IA, e qualquer catalogo global futuro) continuam sendo
administrados exclusivamente pela plataforma. Uma Organization consome,
adota ou opera dentro desses recursos, mas nunca os cria, edita ou controla
diretamente. A autoridade de Platform Admin sobre esses recursos globais nao e
uma excecao a autonomia da Organization: e uma camada distinta, que rege a
plataforma como um todo, nunca o negocio interno de uma Organization
especifica.

Esta decisao nao cria, renomeia ou altera nenhuma tabela, entidade, rota ou
regra ja definida pelas ADRs anteriores. Ela formaliza, como principio unico e
citavel, o que a ADR-0003 estabeleceu para o nucleo multiempresa e o que cada
ADR de 0005 a 0019 confirmou, modulo a modulo, para seu proprio dominio.

## Principios fundamentais

1. Toda entidade de dado de negocio, presente ou futura, pertence exatamente a
   uma Organization. Nao existe entidade de negocio sem Organization e nao
   existe entidade de negocio compartilhada entre Organizations.
2. Dados de uma Organization nunca sao visiveis, graváveis, referenciaveis ou
   operaveis por outra Organization, em nenhuma circunstancia, inclusive em
   contextos administrativos de plataforma.
3. O identificador de Organization, ou de qualquer entidade vinculada a ela,
   enviado pelo cliente nunca prova pertencimento ou permissao. Toda validacao
   de pertencimento a Organization ocorre no servidor, em toda leitura e em
   toda gravacao.
4. A autonomia de uma Organization sobre seus proprios dados e decisoes nunca
   depende do estado, da configuracao ou da existencia de outra Organization.
5. Recursos e catalogos de escopo global pertencem exclusivamente a plataforma
   e sao administrados somente por Platform Admin. Uma Organization pode
   consumir, adotar ou operar dentro desses recursos, mas nunca os cria, edita
   ou controla diretamente.
6. A governanca interna de uma Organization (papeis de Membership: `owner`,
   `admin`, `member`) e distinta e independente da autoridade de Platform
   Admin. Platform Admin nunca recebe role funcional dentro de uma
   Organization e nunca decide, em lugar da Organization, sobre o negocio
   interno dela.
7. Autoridade de plataforma (Platform Admin, catalogos globais, politicas
   globais) opera em camada distinta da autonomia de Organization: rege a
   disponibilidade e as regras da plataforma como um todo, nunca substitui
   nem se sobrepoe ao autogoverno interno de uma Organization especifica
   dentro do que a plataforma disponibiliza.
8. Nenhum modulo, presente ou futuro, pode criar relacao de dependencia
   operacional direta entre duas Organizations distintas, nem introduzir dado
   de negocio compartilhado entre Organizations, sem uma ADR propria que
   reavalie explicitamente este principio.
9. Autonomia de Organization nunca dispensa isolamento, autorizacao
   server-side ou auditoria ja exigidos pelas ADRs anteriores. Autonomia
   amplia o autogoverno interno da Organization; nunca reduz as garantias de
   isolamento e seguranca ja estabelecidas.

## Papel da DocFounder

DocFounder e a empresa que desenvolve e opera a plataforma comercializada como
`DoF — Gente & Seleção`. Toda autoridade que as ADRs anteriores atribuem a
Platform Admin (ADR-0003, 0011 a 0019) e exercida por DocFounder: e DocFounder
quem controla a disponibilidade da plataforma, administra os catalogos
globais, mantem credenciais `platform_managed` e define politicas que valem
para toda a base de Organizations.

DocFounder opera a plataforma; nao opera o negocio de nenhuma Organization.
Platform Admin e a autoridade tecnica de DocFounder sobre a plataforma, nunca
uma role funcional dentro de uma Organization — principio ja assentado nas
ADRs anteriores (ADR-0003, 0011, 0012, 0013, 0014, 0016, 0017, 0018, 0019) e
que esta ADR nao altera, apenas nomeia a origem dessa autoridade.

O papel de DocFounder e:

- desenvolver, operar e manter a plataforma que hospeda todas as
  Organizations;
- administrar os catalogos globais que a plataforma disponibiliza
  (competencias, perguntas, Feature Catalog, Provider Catalog, Model
  Registry, Prompt Registry de IA, e demais catalogos globais futuros);
- definir e evoluir o blueprint organizacional (secao seguinte) que toda
  Organization usa para se estruturar;
- garantir isolamento, seguranca e auditoria como responsabilidade da propria
  plataforma, independente da adesao de qualquer Organization especifica a
  uma capacidade opcional;
- disponibilizar, nunca impor, capacidades como Inteligencia Artificial —
  cabe a cada Organization decidir se e como usa o que DocFounder
  disponibiliza.

DocFounder nunca decide, em lugar de uma Organization, sobre o negocio
interno dela: avaliacao de candidatos, estrutura organizacional, processo
seletivo, uso especifico de IA e qualquer outra decisao operacional
pertencem exclusivamente a Organization, dentro do que a plataforma
disponibiliza.

## Blueprint Organizacional

DocFounder define e mantem um blueprint organizacional unico: o conjunto de
mecanismos estruturais que toda Organization usa para descrever a si mesma
dentro da plataforma. Ate esta ADR, esse blueprint e composto por:

- **DNA Organizacional** (ADR-0005): identidade cultural e operacional da
  Organization, versionada e imutavel apos publicacao;
- **Estrutura Organizacional** (ADR-0006, ADR-0007): hierarquia de
  `Organizational Unit` por relacao pai/filhos, sem exclusao fisica;
- catalogos operacionais que cada Organization pode adotar ou criar dentro do
  proprio escopo (competencias — ADR-0008, ADR-0010; perguntas — ADR-0011), e
  os modulos estruturais futuros que vierem a compor o mesmo padrao.

O blueprint e unico e comum a todas as Organizations: o mecanismo — tipos de
`Organizational Unit`, regras de versionamento do DNA, regras de hierarquia,
formato de catalogo — e definido por DocFounder e evolui por ADR e SPEC
propria, nunca por decisao de uma Organization individual.

O conteudo preenchido dentro do blueprint e exclusivo de cada Organization.
Duas Organizations usam o mesmo mecanismo, mas nunca compartilham conteudo: o
DNA de uma Organization, sua arvore de unidades e suas competencias e
perguntas proprias pertencem somente a ela, seguindo o principio de
isolamento ja registrado nesta ADR.

Nenhuma Organization pode alterar o blueprint em si — apenas seu proprio
conteudo dentro dele. Alterar o mecanismo do blueprint (novos tipos de
unidade, novas regras de versionamento, novos modulos estruturais) exige nova
ADR ou SPEC de plataforma, nunca decisao unilateral de uma Organization.

## IA

A infraestrutura de IA (ADR-0016 a ADR-0019) e a primeira aplicacao concreta
e completa do principio desta ADR, e permanece integralmente subordinada a
ele.

IA e uma capacidade que DocFounder disponibiliza atraves da plataforma; nunca
uma dependencia estrutural de nenhuma Organization (ADR-0016). Cada
Organization decide, de forma autonoma e dentro do que DocFounder libera
(`platform_ai_allowed`, `feature_available_on_platform`, catalogos de
provider, modelo e prompt), se e como usa IA: `organization_ai_enabled`,
`organization_feature_enabled`, credenciais BYOK ou platform-managed,
routing e fallback — toda essa configuracao pertence exclusivamente a
Organization que a define (ADR-0016 a ADR-0019).

Os catalogos globais de IA (`ai_feature_catalog`, `ai_provider_catalog`,
`ai_model_registry`, `ai_prompt_registry`) fazem parte do blueprint que
DocFounder mantem: sao mecanismo comum, administrados exclusivamente por
Platform Admin, nunca criados ou controlados por uma Organization (ADR-0017,
ADR-0019).

Nenhuma execucao de IA, nenhuma credencial e nenhum dado de negocio enviado a
um provider atravessa Organizations, mesmo quando a credencial subjacente e
`platform_managed` e pertence tecnicamente a DocFounder (ADR-0018, secao
"Platform Managed"; ADR-0019, secao "Multiempresa"). Toda `AI Execution`
carrega `organization_id` e pertence exclusivamente a Organization que a
originou.

## Propriedade dos Dados

Cada Organization e proprietaria de todos os dados de negocio que cria e
mantem na plataforma: DNA Organizacional, Estrutura Organizacional,
competencias e perguntas proprias, Vagas, Candidatos, CandidateApplication,
Interview, execucoes de IA associadas ao seu contexto, e qualquer entidade de
negocio futura.

DocFounder opera a infraestrutura que armazena e processa esses dados, mas
nunca e proprietaria deles. Isso vale inclusive quando o processamento usa
recursos administrados por DocFounder — por exemplo, uma credencial de IA
`platform_managed` (ADR-0018): a infraestrutura pode ser da plataforma, mas o
resultado e sempre atribuido e pertence a Organization que originou a
chamada (ADR-0018, secao "Platform Managed": "todo consumo realizado com
credencial platform_managed deve sempre ser atribuido a Organization que
originou a chamada").

DocFounder nunca usa dado de negocio de uma Organization em beneficio,
contexto ou analise de outra Organization, sob nenhuma justificativa,
incluindo agregacao, treinamento, benchmarking ou telemetria. Telemetria e
metricas administrativas de plataforma (ADR-0019, secao "Telemetria") podem
existir sobre uso da plataforma, mas nunca misturam ou expoem dado de negocio
de uma Organization para outra.

Catalogos globais (competencias, perguntas, catalogos de IA) nao sao dado de
negocio de nenhuma Organization: sao ativos da plataforma, de propriedade de
DocFounder, disponibilizados para consumo. Adotar um item global nao
transfere propriedade em nenhuma direcao — a Organization nao passa a ser
dona do item global adotado, e DocFounder nao passa a ser dona do uso que a
Organization faz dele.

Encerrar, arquivar ou desabilitar uma capacidade nao transfere propriedade
dos dados ja produzidos para DocFounder nem para outra Organization. Os
dados permanecem da Organization que os originou, sujeitos apenas as
politicas de retencao vigentes.

## Isolamento Multiempresa

Isolamento multiempresa e a face tecnica do principio de autonomia desta ADR,
ja implementada de forma consistente desde a ADR-0003 e confirmada por toda
ADR posterior:

- toda tabela de dado de negocio carrega `organization_id`, validado no
  servidor em toda leitura e gravacao (ADR-0003, ADR-0013, ADR-0014,
  ADR-0015, ADR-0019);
- nenhum identificador enviado pelo cliente — de Organization ou de qualquer
  entidade vinculada a ela — prova pertencimento ou permissao (ADR-0003 em
  diante, reafirmado em toda ADR de modulo de negocio);
- relacionamentos entre entidades usam apenas IDs internos, nunca nome,
  e-mail, titulo, codigo ou slug publico como referencia de dominio
  (ADR-0011 a ADR-0015);
- mensagens de erro para tentativa de acesso cruzado sao genericas e nunca
  revelam a existencia de um registro em outra Organization (ADR-0014,
  ADR-0015);
- operacoes concorrentes que envolvem estado critico da Organization usam
  bloqueio transacional (`SELECT ... FOR UPDATE` ou equivalente) para nunca
  deixar estado parcialmente aplicado (ADR-0004, ADR-0005, ADR-0014,
  ADR-0018);
- segredos e credenciais de uma Organization nunca sao resolvidos por outra
  Organization, mesmo quando ambas configuram o mesmo provider (ADR-0018,
  secao "Isolamento multiempresa");
- toda execucao, routing, credencial e telemetria de IA pertencem
  exclusivamente a Organization do contexto validado da requisicao, nunca a
  configuracao de outra Organization (ADR-0019, secao "Multiempresa").

Isolamento multiempresa nao e responsabilidade de um modulo especifico: e uma
garantia transversal que todo modulo presente e futuro deve implementar,
testar e nunca enfraquecer. Testes de acesso cruzado entre Organizations sao
parte obrigatoria de definicao de pronto de qualquer modulo, consistente com
`CONSTITUICAO_DO_PROJETO.md` e `AGENTS.md`.

## Responsabilidades

As secoes anteriores desta ADR usam cinco termos com responsabilidades
distintas. Antes da matriz, cada um fica definido precisamente:

- **Plataforma**: o sistema tecnico em si — codigo, infraestrutura, banco de
  dados, `AIGateway` e demais mecanismos que executam as regras definidas
  pelas ADRs. A Plataforma nao decide nada por conta propria; ela aplica o
  que foi decidido por DocFounder (mecanismo, disponibilidade) ou pela
  Organization (configuracao, uso).
- **Organization**: a unidade autonoma definida por esta ADR — o tenant,
  proprietario de seus dados de negocio e responsavel por suas proprias
  decisoes operacionais, dentro do que a Plataforma disponibiliza.
- **DocFounder**: a empresa que desenvolve e opera a Plataforma, exercendo a
  autoridade de Platform Admin conforme definido em "Papel da DocFounder".
- **RH**: as pessoas que exercem, na pratica, os papeis de Membership
  (`owner`, `admin`, `member`) dentro de uma Organization. RH e a face humana
  da Organization: quem efetivamente usa o produto, toma decisoes de
  recrutamento e selecao, e revisa o que a IA produz. RH nunca e um ator
  separado da Organization para fins de isolamento ou propriedade de dados —
  e a Organization quem atua atraves de RH.
- **IA**: a capacidade opcional descrita nas ADR-0016 a ADR-0019 e na secao
  "IA" desta ADR. IA nunca e um ator autonomo de decisao; ela executa tarefas
  de apoio quando a Organization a habilita, dentro do que DocFounder libera.

| Responsabilidade | Plataforma | Organization | DocFounder | RH | IA |
| --- | --- | --- | --- | --- | --- |
| Infraestrutura tecnica, hospedagem e disponibilidade do sistema | Executa | Consome | Opera e mantem | Consome | Nao aplicavel |
| Liberar capacidade na plataforma (`platform_ai_allowed`, `feature_available_on_platform`, catalogos) | Aplica a regra | Nao decide | Decide | Nao decide | Nao aplicavel |
| Administrar catalogos globais (competencias, perguntas, Feature/Provider/Model/Prompt de IA) | Armazena e serve | Consome ou adota | Administra (Platform Admin) | Consome pelo produto | Nao aplicavel |
| Definir o mecanismo do blueprint organizacional (tipos de unidade, regras de versionamento) | Implementa | Nao altera | Define e evolui | Nao aplicavel | Nao aplicavel |
| Preencher o conteudo do blueprint (DNA, estrutura, catalogos proprios) | Persiste e isola | Proprietaria do conteudo | Nunca acessa nem edita | Preenche na pratica | Nao aplicavel |
| Habilitar e configurar capacidade dentro da Organization (`organization_ai_enabled`, routing, credenciais) | Aplica a regra | Decide | Nao decide | Executa a configuracao | Nao aplicavel |
| Conduzir o processo seletivo (Vaga, Candidato, pipeline, Entrevista) | Registra e audita | Responsavel | Nao participa | Executa | Apoia quando habilitada |
| Decisao final de contratacao | Nao decide | Responsavel pelo resultado | Nao decide | Decide | Nunca decide |
| Propriedade dos dados de negocio | Custodia tecnica | Proprietaria | Nunca proprietaria | Opera em nome da Organization | Nao aplicavel |
| Execucao tecnica de uma chamada de IA, quando habilitada | Executa via `AIGateway` | Autoriza o uso | Fornece a infraestrutura opcional | Solicita e usa o resultado | Executa a tarefa de apoio |
| Revisao humana da saida de IA | Nao aplicavel | Exige | Nao aplicavel | Revisa e decide | Nunca dispensa revisao |
| Isolamento multiempresa e seguranca da infraestrutura | Garante | Beneficia-se | Garante como operadora | Beneficia-se | Nunca contorna |
| Auditoria de acoes criticas | Registra o evento | Consulta as proprias | Consulta administrativa | Consulta as proprias | Gera evento auditavel |
| Governanca interna (`owner`, `admin`, `member`) | Aplica a regra | Define e exerce | Nao participa | Exerce os papeis | Nao aplicavel |

A matriz nao cria responsabilidade nova: ela organiza, lado a lado, o que ja
foi decidido nas secoes "Papel da DocFounder", "Blueprint Organizacional",
"IA", "Propriedade dos Dados" e "Isolamento Multiempresa" desta ADR, e o que
ja estava decidido nas ADR-0003 a ADR-0019.

## Restricoes

- DocFounder nunca usa dado de negocio de uma Organization em beneficio,
  contexto ou analise de outra Organization, mesmo operando a infraestrutura
  compartilhada.
- DocFounder, atraves de Platform Admin, nunca recebe role funcional dentro
  de uma Organization e nunca decide, em lugar de RH, sobre o negocio interno
  de uma Organization.
- Nenhuma Organization pode alterar o mecanismo do blueprint organizacional
  nem os catalogos globais que DocFounder mantem; a autonomia da Organization
  e sobre o proprio conteudo, nunca sobre o mecanismo comum da plataforma.
- Nenhuma Organization acessa, referencia ou e afetada por dados,
  configuracao ou decisoes de outra Organization, em nenhuma circunstancia.
- IA nunca decide contratacao, nunca substitui a decisao de RH, e nunca
  executa sem que as quatro condicoes de autorizacao das ADR-0016 a ADR-0019
  estejam satisfeitas.
- IA nunca recebe dado de negocio de uma Organization fora do contexto
  daquela mesma Organization, mesmo quando a credencial subjacente e
  `platform_managed`.
- Nenhum modulo, presente ou futuro, cria relacao de dependencia operacional
  direta entre duas Organizations sem uma ADR propria que reavalie
  explicitamente o principio de autonomia desta ADR.
- Ausencia, desabilitacao ou falha de qualquer capacidade — incluindo IA —
  nunca impede o funcionamento normal do nucleo de negocio de uma
  Organization (ADR-0016).
- Nao ha exclusao fisica de dado de negocio de uma Organization pelo fluxo
  normal, consistente com toda ADR anterior que trata de historico e
  auditoria.

## Seguranca

Toda validacao de pertencimento a uma Organization e de permissao de RH
(`owner`, `admin`, `member`) ocorre no servidor. O identificador enviado pelo
cliente — de Organization, Membership, ou qualquer entidade de negocio —
nunca prova acesso, consistente com `CONSTITUICAO_DO_PROJETO.md` e
`AGENTS.md`.

Toda acao critica de qualquer um dos cinco atores desta ADR gera auditoria:
liberacao ou bloqueio de capacidade por DocFounder, decisao operacional de RH
dentro da Organization, e execucao de IA. Falha em registrar auditoria
critica bloqueia a operacao correspondente, consistente com o padrao ja
adotado nas ADR-0005, ADR-0014, ADR-0015 e ADR-0016 a ADR-0019.

Segredos e credenciais nunca ficam no codigo-fonte, nunca aparecem em log,
auditoria, tracing ou metricas, e nunca sao resolvidos fora do contexto da
Organization que os configurou (ADR-0018). DocFounder, como operadora da
Plataforma, nao acessa credencial `customer_managed` completa de nenhuma
Organization.

IA trata todo conteudo vindo de uma Organization — curriculos, respostas,
notas internas, descricao de Vaga — como dado, nunca como instrucao. IA
nunca executa comando sugerido por um modelo, nunca acessa diretamente o
banco de dados, e nunca toma decisao automatica de contratacao. RH mantem
sempre a decisao final e a possibilidade de revisao humana, consistente com
`CONSTITUICAO_DO_PROJETO.md`, `AGENTS.md` e `SECURITY.md`.

Testes de acesso cruzado entre Organizations, de permissao insuficiente de
RH, e de falha de servico externo de IA sao parte obrigatoria da definicao de
pronto de qualquer modulo presente ou futuro, consistente com `SECURITY.md`.

Nenhum dos cinco atores desta ADR — Plataforma, Organization, DocFounder, RH
ou IA — pode contornar isolamento multiempresa, autorizacao server-side ou
auditoria para ganhar conveniencia operacional. Essas garantias sao
condicao de existencia da autonomia de Organization definida por esta ADR,
nunca um obstaculo a ser removido.

## Consequencias

- Toda SPEC e ADR futura pode citar esta ADR diretamente como fonte unica do
  principio de isolamento e autonomia de Organization, em vez de reformular a
  mesma regra a cada novo modulo.
- Todo modulo novo, presente ou futuro, deve ser avaliado contra esta ADR
  antes de introduzir qualquer relacionamento, catalogo ou capacidade que
  toque mais de uma Organization.
- A matriz de responsabilidades da secao "Responsabilidades" passa a ser
  referencia direta para modelar permissao, autoria e auditoria de qualquer
  capacidade nova, incluindo modulos ainda nao especificados.
- O conceito de blueprint organizacional (DNA Organizacional, Estrutura
  Organizacional e catalogos operacionais) fica formalmente nomeado; modulos
  estruturais futuros podem declarar explicitamente se alteram o mecanismo
  comum da plataforma ou apenas preenchem conteudo autonomo de Organization.
- A distincao entre autoridade de plataforma (DocFounder / Platform Admin) e
  autogoverno interno de Organization (RH / Membership) fica disponivel como
  criterio direto para revisao de seguranca e para futuras decisoes de
  permissao.
- Revisoes de seguranca e de arquitetura passam a ter um documento unico de
  referencia para validar isolamento multiempresa e limites de autonomia, em
  vez de inspecionar cada ADR de modulo individualmente.
- Esta ADR nao exige nenhuma migracao, alteracao de codigo, nova tabela ou
  nova rota. Nenhuma consequencia tecnica imediata decorre da sua aceitacao,
  alem do uso editorial e de revisao descrito acima.

## Fora do escopo

Esta ADR nao define nem implementa:

- relacionamento entre duas ou mais Organizations (grupos, holdings,
  franquias, consorcios, ou qualquer estrutura de organizacao-mae e
  organizacao-filha); se algum dia for necessario, exigira ADR propria que
  reavalie explicitamente o principio de autonomia aqui estabelecido;
- exclusao fisica, fusao, cisao ou transferencia de dados de uma Organization
  para outra; o ciclo de vida ja decidido de uma Organization (criacao,
  arquivamento, reativacao) continua regido pela ADR-0003 e ADR-0004, sem
  alteracao; exclusao fisica da propria Organization permanece indefinida e
  fica para ADR futura, caso seja necessaria;
- modelo comercial, precificacao, planos ou limites contratuais entre
  DocFounder e uma Organization;
- escolha de fornecedor de hospedagem, infraestrutura fisica ou SLA;
- a estrutura interna da propria DocFounder como empresa; DocFounder nao e
  uma Organization nesta arquitetura e nao esta sujeita ao modelo de
  Membership;
- novos modulos estruturais que venham a compor o blueprint organizacional no
  futuro (por exemplo, Cargos ou outros catalogos estruturais); sua inclusao
  formal no blueprint exige analise e registro proprios quando forem
  especificados;
- qualquer alteracao as regras de autorizacao, rate limit, retry, fallback,
  auditoria ou secret management ja definidas pelas ADR-0016 a ADR-0019;
- interface de usuario para qualquer um dos conceitos descritos nesta ADR.

Esses temas deverao possuir ADR ou especificacao propria quando forem
priorizados.
