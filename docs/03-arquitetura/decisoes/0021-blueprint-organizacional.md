# ADR 0021 - Blueprint Organizacional

## Status

Aceita.

## Contexto

Ate este momento, o Talent OS ja estabeleceu:

- que cada Organization e uma unidade autonoma (ADR-0003; ADR-0020);
- que IA e uma capacidade opcional, nunca estrutural (ADR-0016);
- isolamento completo entre Organizations, em todo modulo (ADR-0003 em
  diante);
- infraestrutura completa de IA: politicas de Feature (ADR-0017), providers e
  credenciais (ADR-0018), AI Gateway, Provider Routing, Prompt Registry e
  Model Registry (ADR-0019);
- que o Feature Catalog, o Provider Catalog, o Model Registry e o Prompt
  Registry sao catalogos globais de plataforma, nunca de uma Organization
  (ADR-0017; ADR-0019).

A ADR-0020 formalizou "Organization como unidade autonoma" e, dentro dela,
nomeou pela primeira vez o conceito de "Blueprint Organizacional": o
mecanismo comum que toda Organization usa para descrever a si mesma, mantido
pela plataforma, preenchido com conteudo exclusivo de cada Organization
(ADR-0020, secao "Blueprint Organizacional"). Aquela ADR deliberadamente
deixou a composicao final do Blueprint em aberto: "novos modulos estruturais
que venham a compor o blueprint organizacional no futuro (por exemplo,
Cargos ou outros catalogos estruturais); sua inclusao formal no blueprint
exige analise e registro proprios quando forem especificados" (ADR-0020,
"Fora do escopo").

O documento `docs/01-produto/JORNADA-DO-SISTEMA.md` (secao 13) ja descreveu,
em nivel de produto, o que o Blueprint pode conter e por que ele e "o maior
ativo da Organization" — mas um documento de jornada funcional nao e uma
decisao arquitetural e nao pode, por si so, formalizar propriedade,
composicao, relacionamento com IA, seguranca ou regras de multiempresa.

Ainda falta, portanto, definir formalmente, como decisao arquitetural
propria: o que representa o conhecimento organizacional de uma Organization,
a quem ele pertence, do que ele e composto, como a IA pode usa-lo, como ele
se relaciona com o processo seletivo, e quais garantias de seguranca,
multiempresa e evolucao se aplicam especificamente a ele. Esta ADR resolve
essa lacuna.

## Objetivo

Formalizar o Blueprint Organizacional como decisao arquitetural propria,
expandindo o principio ja nomeado pela ADR-0020 e descrito em nivel de
produto pelo `JORNADA-DO-SISTEMA.md`, para que:

- exista uma unica fonte de verdade sobre o que o Blueprint representa, a
  quem pertence e do que e composto;
- a relacao entre Blueprint e IA fique definida de forma explicita e
  citavel, sem reabrir a infraestrutura ja decidida pelas ADR-0016 a
  ADR-0019;
- a relacao entre Blueprint e consultoria de implantacao da DocFounder fique
  definida sem contradizer a autorizacao ja estabelecida por SPEC-004 a
  SPEC-013;
- a lacuna deixada pela ADR-0020 sobre a composicao final do Blueprint (em
  particular, a inclusao de Cargos) fique resolvida.

## Decisao

Fica formalizado que **Blueprint Organizacional** e o conjunto estruturado
de conhecimento que representa como uma Organization recruta, seleciona e
desenvolve pessoas.

O Blueprint pertence exclusivamente a Organization. Nunca pertence a
plataforma. Nunca pertence a DocFounder.

Esta decisao e uma extensao formal da secao "Blueprint Organizacional" ja
registrada na ADR-0020, nunca uma substituicao dela. A ADR-0020 definiu o
principio geral — mecanismo comum da plataforma, conteudo exclusivo da
Organization — e deixou expressamente em aberto a composicao final e os
modulos estruturais futuros. Esta ADR e o registro proprio que a ADR-0020
exigiu: formaliza a composicao completa do Blueprint nesta fase, incluindo
Cargos, que a ADR-0020 citava como exemplo pendente.

Esta ADR nao cria nenhuma tabela, entidade fisica unica ou API chamada
"blueprint". O Blueprint e uma agregacao conceitual de componentes que, em
sua maioria, ja existem e ja sao isolados por Organization (DNA
Organizacional, Estrutura Organizacional, Catalogo de Competencias, Banco de
Perguntas, Cargos, configuracoes de IA por Organization). A formalizacao
aqui e do conceito e de suas garantias, nao da implementacao fisica.

## Principios

- O Blueprint e unico por Organization. Nao existe Blueprint compartilhado
  nem Blueprint parcialmente pertencente a mais de uma Organization.
- O Blueprint pode evoluir continuamente. Ele nunca e um artefato estatico
  ou "fechado" apos a implantacao inicial.
- O Blueprint nunca e compartilhado entre Organizations, em nenhuma
  circunstancia, inclusive contextos administrativos de plataforma
  (ADR-0020, "Isolamento Multiempresa").
- O Blueprint nunca e reutilizado por outra Organization. Duas Organizations
  podem usar o mesmo mecanismo (mesmos tipos de unidade, mesmo formato de
  catalogo), mas nunca o mesmo conteudo.
- O Blueprint pode ser expandido. Novos componentes podem se juntar a
  composicao definida nesta ADR por meio de ADR ou SPEC propria futura, sem
  reabrir esta decisao.
- O Blueprint pode ser versionado futuramente. Nesta fase, alguns
  componentes ja possuem versionamento formal — DNA Organizacional (SPEC-005),
  Job Profile (SPEC-008) e Job Opening (SPEC-010), todos com rascunho,
  publicacao e arquivamento imutaveis. Outros componentes ainda nao possuem
  versionamento formal — Estrutura Organizacional (SPEC-006), Catalogo de
  Competencias (SPEC-007, secao "Imutabilidade e historico": "sem
  versionamento formal, o catalogo representa o estado atual da
  competencia") e Banco de Perguntas (SPEC-009, "Limitacoes Conhecidas": "nao
  ha versionamento formal de perguntas"). Esta ADR nao altera esse estado;
  registra apenas que versionar os componentes que ainda nao possuem essa
  garantia e uma evolucao possivel, a ser tratada por SPEC propria quando
  priorizada.
- O Blueprint representa conhecimento estrategico da Organization, nunca um
  cadastro administrativo trivial.

## Composicao

O Blueprint pode conter:

- missao, visao e proposito (DNA Organizacional, SPEC-005);
- valores (DNA Organizacional, SPEC-005);
- cultura organizacional (DNA Organizacional, SPEC-005);
- competencias organizacionais (esperadas de todos os colaboradores, DNA
  Organizacional, SPEC-005);
- competencias tecnicas e competencias comportamentais (categorias do
  Catalogo de Competencias, proprias ou adotadas globalmente, SPEC-007);
- departamentos (Estrutura Organizacional / `Organizational Unit`,
  SPEC-006);
- cargos (Job Profile e suas versoes publicadas, SPEC-008);
- senioridades e perfis ideais (conceitos de produto ainda sem campo ou
  SPEC propria; ver "Fora do escopo");
- perguntas (Banco de Perguntas proprio e adotado globalmente, SPEC-009);
- pesos de avaliacao (nota importante: o peso nunca pertence ao item
  reutilizavel do Blueprint em si. Competencia, pergunta e cargo nunca
  possuem peso proprio, por decisao explicita e reafirmada da ADR-0009 —
  "peso pertence ao contexto de uso" — e confirmada em SPEC-007, SPEC-008 e
  SPEC-009. O peso e atribuido no contexto de uso, como a Vaga, quando ela
  vincula uma competencia ou pergunta do Blueprint com um peso especifico
  (SPEC-010). O Blueprint fornece o item avaliavel; o contexto de uso e quem
  atribui o peso a ele);
- criterios (vinculos entre Cargo/Vaga e competencias/perguntas, com nivel
  esperado e obrigatoriedade, SPEC-008/SPEC-010);
- politicas (Feature Policies e politicas de fallback da Organization,
  ADR-0017/ADR-0019);
- Feature Settings (`Organization AI Feature Settings`, ADR-0017);
- Provider Settings (`Organization AI Provider Config`, ADR-0018);
- configuracoes futuras.

Esta lista e extensivel. Novos componentes podem ser adicionados por ADR ou
SPEC propria, sem reabrir esta decisao.

## Relacionamento com IA

Toda execucao de IA que incorporar contexto organizacional resolve esse
contexto exclusivamente a partir do Blueprint da propria Organization. Sem
Blueprint — ou sem a parte especifica do Blueprint exigida por uma Feature —
nao existe contexto. Sem contexto, nao existe analise contextualizada.

Quando uma Feature de IA depende de um componente do Blueprint que a
Organization ainda nao construiu, essa Feature especifica nao executa; o
`AIGateway` retorna um erro de configuracao seguro
(`error_category = configuration_error`), nunca uma falha crua, e o fluxo
humano do modulo chamador continua normalmente (ADR-0016, "Fail-safe";
ADR-0019, secao "Falha de configuracao"). A ausencia de Blueprint, como a
ausencia de IA, nunca bloqueia um fluxo obrigatorio.

A IA nunca inventa conhecimento organizacional. Ela sempre utiliza
exclusivamente o Blueprint autorizado da propria Organization do contexto
validado da execucao, nunca o de outra Organization, mesmo quando a
credencial subjacente e `platform_managed` (ADR-0018, "Platform Managed";
ADR-0020, "Isolamento Multiempresa").

Esta ADR nao altera a mecanica ja definida pelas ADR-0016 a ADR-0019: a
selecao de qual parte do Blueprint entra em uma execucao especifica, a
minimizacao desses dados e a validacao contra o schema do prompt continuam
sendo responsabilidade do `AIGateway` e do Prompt Registry (ADR-0019, secao
"Prompt e dados sensiveis"). Esta ADR apenas declara, de forma explicita, que
a fonte de qualquer conhecimento organizacional usado por IA e sempre o
Blueprint — nunca uma fonte externa, generica ou de outra Organization.

## Relacionamento com o Processo Seletivo

O Blueprint influencia:

- criacao de vagas — toda Vaga referencia uma versao publicada de Cargo do
  Blueprint e pode usar competencias e perguntas do Blueprint (SPEC-010);
- perguntas — o roteiro de uma Vaga ou entrevista usa perguntas do Banco de
  Perguntas do Blueprint (SPEC-009/SPEC-010/SPEC-013);
- pre-entrevista — quando existir, usara perguntas proprias da Organization,
  seguindo o mesmo principio (`JORNADA-DO-SISTEMA.md`, secao 11);
- entrevistas — o roteiro preparado preserva um snapshot das perguntas do
  Blueprint no momento da preparacao (SPEC-013);
- avaliacoes — criterios contextuais de competencia e nivel esperado vem do
  vinculo Cargo/Vaga com o Blueprint (SPEC-008/SPEC-010/SPEC-013);
- relatorios;
- dossies inteligentes — quando existir, reunira informacao ja existente,
  incluindo aderencia ao Blueprint e ao Cargo (`JORNADA-DO-SISTEMA.md`,
  secao 12);
- futuras analises de IA.

O Blueprint nunca altera automaticamente decisoes humanas. Ele informa e
contextualiza; a decisao de contratacao permanece sempre com RH — a pessoa
com role `owner` ou `admin` que movimenta ou finaliza a candidatura
(ADR-0020, "Principios fundamentais"; `JORNADA-DO-SISTEMA.md`, secao 15).

## Propriedade

Todo Blueprint pertence exclusivamente a Organization. Isso vale mesmo
quando o Blueprint e criado ou ajustado durante consultoria de implantacao
da DocFounder (secao "Consultoria" abaixo). A plataforma nunca se torna
proprietaria do Blueprint, em nenhuma circunstancia — reafirmacao direta da
ADR-0020, secao "Propriedade dos Dados".

## Consultoria

Durante a implantacao, a DocFounder auxilia a construir o Blueprint da
Organization cliente. A consultoria:

- entrevista gestores;
- entende cultura;
- entende missao;
- entende competencias;
- parametriza a plataforma.

Apos concluida, o Blueprint pertence exclusivamente ao cliente, sem excecao.

**Esclarecimento necessario para nao contradizer SPEC-004 a SPEC-013:** a
consultoria de implantacao e um servico humano prestado pela DocFounder,
nunca uma operacao do perfil tecnico Platform Admin (ADR-0003; SPEC-004). A
criacao e a publicacao de conteudo do Blueprint — DNA, Estrutura
Organizacional, Cargos, competencias e perguntas proprias — continuam
exigindo Membership `owner` ou `admin` dentro da propria Organization,
exatamente como ja definido por cada SPEC de modulo: Platform Admin nao
administra conteudo de DNA (SPEC-005, RN-019), nao opera competencias
proprias como owner/admin (SPEC-007), nao opera cargo funcionalmente
(SPEC-008) e nao opera perguntas proprias como owner/admin (SPEC-009,
RN-011).

Fica adotada a seguinte regra sobre a atuacao da consultoria:

- "Consultor de Implantacao DocFounder" e um papel
  operacional/organizacional;
- nao e uma role canonica do sistema — que continua restrita a `owner`,
  `admin`, `member` e Platform Admin (SPEC-004);
- nao recebe automaticamente Membership `owner` ou `admin`, nem qualquer
  outra autorizacao automatica dentro da Organization cliente;
- nao utiliza Platform Admin como atalho para editar conteudo funcional do
  Blueprint, em nenhuma circunstancia;
- qualquer atuacao direta dentro da Organization depende de autorizacao
  explicita do cliente e de mecanismo tecnico futuro apropriado, ainda nao
  decidido por esta ADR;
- a forma tecnica de suporte e implantacao assistida sera objeto de ADR ou
  SPEC propria futura;
- toda alteracao produzida durante a consultoria continua pertencendo a
  Organization cliente, nunca a DocFounder (secao "Propriedade").

Platform Admin permanece limitado, durante e depois da consultoria, a
consulta administrativa auditada, no mesmo padrao ja estabelecido por
SPEC-005 a SPEC-013.

## Evolucao

O Blueprint nunca e considerado concluido. Ele evolui continuamente e pode
ser atualizado sempre que necessario, respeitando a governanca interna da
Organization (`owner`/`admin`, conforme SPEC-004) e as regras especificas ja
definidas para cada componente (por exemplo: DNA exige novo rascunho a
partir da versao publicada, SPEC-005; Cargo exige novo rascunho, SPEC-008;
Vaga exige novo rascunho, SPEC-010).

Essas mudancas nunca alteram automaticamente historicos ja registrados.
Candidaturas, entrevistas e execucoes de IA que ja usaram uma versao
anterior de um componente do Blueprint continuam preservadas, referenciando
exatamente o que foi usado no momento em que ocorreram — o mesmo principio
ja estabelecido pela ADR-0012 (Vagas versionadas), ADR-0014 (Configuracao
historica de CandidateApplication) e ADR-0019 (secao "Configuracao
historica" para prompt, modelo e routing de IA).

## Seguranca

O Blueprint e um ativo estrategico da Organization. Ele recebe o mesmo
nivel de protecao ja exigido para candidatos, entrevistas, avaliacoes e
execucoes de IA:

- validacao server-side de `organizationId` em toda leitura e gravacao de
  qualquer componente do Blueprint;
- autorizacao centralizada, seguindo a matriz da SPEC-004 e as regras
  especificas de cada SPEC de componente;
- auditoria de toda acao critica sobre qualquer componente do Blueprint;
- ausencia de exclusao fisica dos componentes que ja garantem isso (DNA,
  Estrutura Organizacional, competencias, perguntas, Cargos).

O Blueprint nunca pode ser exposto para outra Organization, em nenhuma
circunstancia, inclusive contextos administrativos de plataforma (ADR-0020,
"Isolamento Multiempresa").

## Multiempresa

Cada Organization possui exatamente um Blueprint logico: uma agregacao
conceitual dos componentes ja isolados por `organization_id` — DNA
Organizacional, Estrutura Organizacional, Catalogo de Competencias, Banco de
Perguntas, Cargos, Feature Settings e Provider Settings. Esta ADR nao cria
uma tabela, entidade fisica ou API unica chamada "blueprint"; ela formaliza
a leitura conceitual unificada de componentes que ja existem e ja sao
isolados individualmente.

Nenhuma Organization acessa cultura, competencias, perguntas, criterios ou
politicas de outra Organization — a mesma garantia absoluta ja estabelecida
por toda ADR desde a ADR-0003, sem excecao.

## DocFounder

A DocFounder fornece:

- metodologia;
- implantacao;
- suporte;
- treinamento.

A DocFounder nunca utiliza o Blueprint de um cliente para beneficiar outro.
Esta e uma reafirmacao direta da ADR-0020, secao "Propriedade dos Dados":
"DocFounder nunca usa dado de negocio de uma Organization em beneficio,
contexto ou analise de outra Organization, sob nenhuma justificativa,
incluindo agregacao, treinamento, benchmarking ou telemetria." Isso vale
integralmente para o Blueprint: nenhum conteudo de Blueprint de uma
Organization e usado para treinar modelo, ajustar prompt padrao, definir
metodologia de outra implantacao ou influenciar, direta ou indiretamente, o
Blueprint de outra Organization.

## Consequencias

- IA contextualizada: toda Feature de IA que precisar de contexto
  organizacional passa a ter uma fonte unica, explicita e auditavel para
  esse contexto.
- Personalizacao: cada Organization mantem identidade, criterios e processo
  seletivo proprios, sem depender de configuracao generica da plataforma.
- Diferenciacao competitiva: o Blueprint, como ativo estrategico exclusivo
  da Organization, e o que torna a analise de IA e o processo seletivo de
  cada cliente distintos dos demais.
- Autonomia do cliente: a Organization mantem controle total sobre seu
  proprio conhecimento organizacional, mesmo quando construido com apoio de
  consultoria da DocFounder.
- Baixo acoplamento: o Blueprint agrega componentes ja existentes e ja
  isolados (DNA, Estrutura Organizacional, Catalogo de Competencias, Banco
  de Perguntas, Cargos, configuracoes de IA) sem exigir nova infraestrutura
  fisica nem redesenhar o que ja foi decidido.
- Evolucao continua: a Organization pode atualizar seu Blueprint a qualquer
  momento sem reescrever historico ja registrado.
- Consultoria estruturada: a DocFounder tem um papel claro e limitado na
  construcao do Blueprint, sem jamais se tornar proprietaria dele nem
  operar com autoridade de Platform Admin sobre conteudo de Organization.

## Fora do escopo

Esta ADR nao define:

- banco de dados;
- tabelas;
- migrations;
- APIs;
- interfaces;
- implementacao tecnica de qualquer componente do Blueprint;
- Portal Publico;
- Pre-Entrevista Inteligente;
- Dossie Inteligente;
- DISC;
- Perfil Comportamental;
- AI Gateway (ja definido pela ADR-0019, nao redefinido aqui);
- Providers de IA (ja definidos pela ADR-0018/ADR-0019, nao redefinidos
  aqui);
- Prompts (ja definidos pela ADR-0019, Prompt Registry, nao redefinidos
  aqui).

Esses temas pertencem as proximas ADRs e SPECs.
