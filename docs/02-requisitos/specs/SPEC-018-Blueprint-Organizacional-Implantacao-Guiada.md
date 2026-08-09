# SPEC-018 - Blueprint Organizacional / Implantacao Guiada

**Status:** Aprovada
**Versao:** 1.0
**Fase:** 15
**Responsavel de negocio:** Thiago Sousa
**Ultima atualizacao:** 2026-08-09

## 1. Objetivo

Definir funcionalmente como uma Organization passa de recem-criada para
operacionalmente preparada dentro do DoF - Gente & Selecao.

Esta SPEC transforma o conceito de Blueprint Organizacional, ja formalizado
pela ADR-0021 (o que o Blueprint e, a quem pertence e do que e composto) e
pela ADR-0022 (seu ciclo de vida conceitual: `draft`, `active`, `archived`,
versao como manifesto agregado e imutavel), em um fluxo funcional guiado de
implantacao: como a Organization percorre, etapa por etapa, a configuracao
inicial de cada componente ja existente do Blueprint (DNA Organizacional,
Estrutura Organizacional, Catalogo de Competencias, Cargos, Banco de
Perguntas, configuracoes de IA) ate estar pronta para operar.

O fluxo guiado de implantacao serve tanto para:

- implantacao conduzida pelo proprio cliente, sem apoio da DocFounder;
- implantacao assistida pela DocFounder, dentro dos limites ja definidos
  pela ADR-0021, secao "Consultoria", e pela ADR-0022, secao "Consultoria
  DocFounder".

A DocFounder auxilia. A Organization continua sendo proprietaria de todas
as informacoes que constroi durante a implantacao e a unica responsavel
pela aprovacao final da ativacao (ADR-0020, secao "Propriedade dos Dados";
ADR-0021, secao "Propriedade").

Esta SPEC define conceitos, etapas, regras de negocio, readiness, criterios
minimos de ativacao, permissoes, ciclo de vida do Blueprint Version,
historico, auditoria, seguranca, banco conceitual, API conceitual,
interface minima, criterios de aceite e testes obrigatorios.

## 2. Fora do escopo

Esta SPEC nao implementa:

- codigo, banco de dados, migrations, rotas ou dependencias;
- Portal Publico (fica para SPEC-019);
- Candidatura Publica (fica para SPEC-020);
- Pre-Entrevista Estruturada (fica para SPEC-021);
- Perfil Comportamental (fica para SPEC-022);
- DISC, instrumento ou metodologia (fica para SPEC-022, quando priorizada);
- Pre-Analise Assistida por IA (fica para SPEC-023);
- Dossie Inteligente do Candidato (fica para SPEC-024);
- mecanismo tecnico de acesso do Consultor de Implantacao DocFounder (fica
  para ADR ou SPEC propria futura, conforme ADR-0021 e ADR-0022);
- provider real de IA, prompt ou modelo (ja definidos, sem redefinicao,
  pelas ADR-0016 a ADR-0019 e SPEC-014);
- algoritmo definitivo, formula matematica ou peso do Indice de Maturidade
  Organizacional;
- billing, plano comercial ou precificacao;
- exclusao definitiva (fisica) de Organization;
- workflow de aprovacao em multiplos niveis para ativacao;
- interface final (wireframe, layout, componente visual);
- URLs finais de API, contratos de request/response ou schema de banco.

## 3. Usuarios envolvidos

- **Owner:** conduz e aprova a implantacao da propria Organization; unica
  role que ativa o Blueprint.
- **Admin:** colabora na configuracao dos modulos onde possui permissao
  propria; acompanha readiness; nao ativa.
- **Member:** nao administra implantacao; participa apenas quando uma
  etapa operacional especifica permitir, dentro do que sua role ja
  autoriza em cada componente.
- **Platform Admin (SuperAdmin):** cria Organization, libera plano e
  Features, verifica status administrativo da implantacao e presta
  suporte; nunca edita conteudo funcional do Blueprint nem ativa.
- **Consultor de Implantacao DocFounder:** papel operacional/organizacional
  da DocFounder, nao uma role canonica do sistema; auxilia diagnostico,
  levantamento, orientacao, parametrizacao, revisao e treinamento, sempre
  atuando atraves de uma pessoa autorizada da Organization (secao 12).

`Platform Admin` nao e Role de Membership e nao recebe permissoes
funcionais de `owner` ou `admin` (ADR-0003, SPEC-004).

## 4. Conceitos

### 4.1 Implantacao

Implantacao e o processo guiado de configuracao inicial e preparacao
operacional de uma Organization. Nao e apenas o cadastro da empresa
(SPEC-001): inclui a organizacao e a validacao do conhecimento necessario
para a Organization utilizar adequadamente o DoF - por exemplo, ter um DNA
Organizacional configurado, uma estrutura minima, ao menos um Cargo
publicado quando for iniciar recrutamento, e as configuracoes de IA
apropriadas quando aplicavel.

A implantacao nao e um modulo novo de dados de negocio. Ela e a experiencia
funcional guiada sobre os modulos que ja existem (SPEC-001 a SPEC-009, e
ADR-0016 a ADR-0019), organizada em torno do conceito de Blueprint
Organizacional (ADR-0021, ADR-0022).

### 4.2 Blueprint Organizacional

Cada Organization possui um unico Blueprint logico (ADR-0021, ADR-0022).
"Unico" significa que existe exatamente um Blueprint por Organization -
nunca varios em paralelo - nao que ele seja estatico. O Blueprint agrega
conceitualmente:

- DNA Organizacional (SPEC-005);
- Estrutura Organizacional (SPEC-006);
- Catalogo de Competencias (SPEC-007);
- Cargos / Job Profile (SPEC-008);
- Banco de Perguntas (SPEC-009);
- Feature Settings (ADR-0017) e Provider Settings (ADR-0018), quando a
  Organization utiliza IA.

O Blueprint nunca duplica o conteudo desses modulos; ele e a leitura
conceitual unificada de componentes que ja existem e ja sao isolados
individualmente por `organization_id` (ADR-0021, secao "Multiempresa").
Esta SPEC nao altera nenhum schema, regra ou permissao ja definida por
SPEC-005 a SPEC-009 ou pela ADR-0016 a ADR-0019.

### 4.3 Blueprint Version

Uma Blueprint Version e, conceitualmente, uma referencia agregada e
imutavel do contexto organizacional vigente em um momento especifico - um
manifesto de contexto, nunca uma copia completa dos dados dos modulos que a
compoem (ADR-0022, secao "Versao do Blueprint" e "Principio: manifesto de
contexto").

Cada Blueprint Version possui um dos tres estados conceituais definidos
pela ADR-0022:

- `draft`;
- `active`;
- `archived`.

Esses estados sao deliberadamente distintos, em vocabulario, do estado
`published` usado por DNA, Cargo e Vaga (SPEC-005, SPEC-008, SPEC-010) e do
status operacional `active`/`inactive` usado por Candidate, Job Profile e
Organizational Unit (ADR-0022, secao "Estados conceituais"). `active` de
Blueprint Version descreve o estado agregado do Blueprint como um todo;
`published` descreve o estado de cada componente individual.

### 4.4 Blueprint Manifest

O Blueprint Manifest e o conteudo referenciado por uma Blueprint Version:
o conjunto de referencias aos componentes e configuracoes que compunham o
contexto organizacional vigente naquele momento (secao 25).

### 4.5 Readiness

Readiness (prontidao) e uma propriedade computada sobre uma Blueprint
Version `draft` - nunca um quarto estado canonico do Blueprint (ADR-0022,
secao "Readiness e completude"). Ela expressa o grau de preparacao do
draft frente aos criterios minimos de ativacao definidos por esta SPEC
(secao 8) e aos pre-requisitos declarados por Features especificas (secao
9).

`draft` nao significa necessariamente incompleto: pode existir um draft
completo, com readiness `ready`, aguardando apenas a decisao do Owner de
ativa-lo (ADR-0022).

### 4.6 Indice de Maturidade Organizacional

O Indice de Maturidade Organizacional (`Organizational Maturity
Indicator`, ou equivalente em portugues) e um conceito distinto de
readiness. Ele e informativo, nunca bloqueia ativacao, nunca e usado como
score de qualidade da empresa, nunca compara Organizations entre si, e
nao e produzido obrigatoriamente por IA. Serve para ajudar a Organization e
a consultoria DocFounder a identificar areas ainda pouco configuradas
(secao 11).

## 5. Criacao inicial

Ao criar uma Organization (SPEC-001):

- deve existir uma situacao inicial de implantacao, criada junto com a
  Organization;
- o Blueprint da Organization comeca como uma Blueprint Version `draft`;
- nao ha ativacao automatica de nenhuma Blueprint Version;
- nao ha habilitacao automatica de IA, em nenhuma das camadas ja definidas
  pela ADR-0016 (`platform_ai_allowed`, `organization_ai_enabled`);
- nao ha habilitacao automatica de nenhuma Feature adicional (ADR-0017);
- o Owner e o responsavel por aprovar a ativacao final do Blueprint (secao
  6.10; secao 13.1).

Esta SPEC nao exige que a Organization complete toda a implantacao
imediatamente. Uma Organization pode operar com um Blueprint `draft` em
construcao por tempo indeterminado, dentro do que os criterios minimos de
ativacao permitirem consultar sem bloquear (secao 8).

## 6. Etapas da implantacao

O fluxo guiado de implantacao e organizado em dez etapas conceituais.
Nenhuma etapa cria dado novo alem do que os modulos referenciados ja
definem; cada etapa apenas orienta, verifica e organiza a configuracao
desses modulos existentes dentro do fluxo de implantacao.

### 6.1 Etapa 1 - Dados da Organization

Valida informacoes basicas ja definidas pela SPEC-001:

- nome;
- nome publico;
- dados institucionais aplicaveis;
- identidade visual futura, quando disponivel.

Esta SPEC nao reinventa nenhum campo ja definido pela SPEC-001.

### 6.2 Etapa 2 - DNA Organizacional

Verifica e orienta a configuracao de:

- missao;
- visao;
- valores;
- proposito;
- demais componentes ja previstos pela SPEC-005.

Esta SPEC nao duplica nenhuma regra da SPEC-005 (por exemplo, RN-006: no
maximo uma versao publicada por Organization; RN-018: admin nao publica).
A Etapa 2 apenas verifica readiness e referencia os dados existentes.

### 6.3 Etapa 3 - Estrutura Organizacional

Verifica e orienta a configuracao de:

- Organizational Units;
- departamentos/unidades;
- estrutura minima necessaria.

Esta SPEC nao duplica nenhuma regra da SPEC-006.

### 6.4 Etapa 4 - Competencias

Verifica e orienta a configuracao de:

- competencias organizacionais;
- competencias tecnicas;
- competencias comportamentais, quando aplicavel;
- catalogo utilizado pela Organization (proprio ou adotado globalmente).

Esta SPEC nao duplica nenhuma regra da SPEC-007.

### 6.5 Etapa 5 - Cargos

Verifica e orienta a configuracao de:

- Job Profiles;
- versoes publicadas;
- requisitos;
- competencias relacionadas;
- demais dados ja definidos pela SPEC-008.

Esta SPEC nao duplica nenhuma regra da SPEC-008.

### 6.6 Etapa 6 - Banco de Perguntas

Verifica e orienta a configuracao de:

- perguntas proprias;
- perguntas globais adotadas;
- categorias/tipos;
- perguntas disponiveis para uso.

Esta SPEC nao duplica nenhuma regra da SPEC-009.

### 6.7 Etapa 7 - Regras de recrutamento

Introduz o conceito funcional de configuracao da operacao de recrutamento
da Organization. Pode incluir futuramente:

- padroes de selecao;
- preferencias;
- criterios gerais;
- regras de uso de perguntas;
- configuracoes organizacionais de recrutamento.

Esta etapa nunca cria peso global em competencia ou pergunta. O peso
continua pertencendo exclusivamente ao contexto de uso (por exemplo, a
Vaga), conforme a ADR-0009, "peso pertence ao contexto de uso", ja
reafirmada pela ADR-0021, secao "Composicao".

### 6.8 Etapa 8 - Inteligencia Artificial

Etapa aplicavel somente quando a Organization utiliza IA. Mostra:

- disponibilidade de IA pela plataforma (`platform_ai_allowed`, ADR-0016);
- habilitacao da Organization (`organization_ai_enabled`, ADR-0016);
- Features disponiveis (`feature_available_on_platform`, ADR-0017);
- Features habilitadas (`organization_feature_enabled`, ADR-0017);
- status de configuracao de provider (ADR-0018).

Esta etapa nunca exige IA para ativar o Blueprint quando a Organization nao
utiliza IA (ADR-0016, "IA nunca e requisito estrutural"). Esta SPEC nao
duplica nenhuma regra da SPEC-014 nem da ADR-0016 a ADR-0019.

### 6.9 Etapa 9 - Validacao

O sistema calcula a readiness da Blueprint Version `draft` (secao 4.5) e
exibe:

- itens concluidos;
- itens pendentes;
- itens opcionais;
- bloqueios;
- recomendacoes.

O calculo de readiness basico nunca usa IA; e regra deterministica baseada
nos criterios de completude desta SPEC (secao 8).

### 6.10 Etapa 10 - Ativacao

Somente Owner pode ativar. Ao ativar, o sistema deve, conceitualmente:

- validar a readiness do draft (secao 8);
- confirmar a existencia da versao `draft`;
- criar o checkpoint/manifesto que se torna `active`;
- arquivar a Blueprint Version `active` anterior, quando existir;
- registrar auditoria;
- executar a operacao de forma atomica.

Esta SPEC nao define a implementacao fisica dessa operacao (secao 24).

## 7. Regras de Negocio

- RN-001: Toda Organization criada possui uma situacao inicial de
  implantacao, criada junto com a Organization (SPEC-001).
- RN-002: O Blueprint de uma Organization nasce como uma Blueprint Version
  `draft`.
- RN-003: Nao existe ativacao automatica de Blueprint no momento da
  criacao da Organization.
- RN-004: Nenhuma camada de IA (`platform_ai_allowed`,
  `organization_ai_enabled`) e habilitada automaticamente durante a
  criacao da Organization ou durante a implantacao (ADR-0016).
- RN-005: Nenhuma Feature adicional (`organization_feature_enabled`) e
  habilitada automaticamente durante a implantacao (ADR-0017).
- RN-006: Owner e o unico responsavel por aprovar a ativacao final do
  Blueprint.
- RN-007: A implantacao nao exige que a Organization complete todas as
  etapas imediatamente.
- RN-008: Cada Organization possui exatamente um Blueprint logico, nunca
  mais de um (ADR-0021, ADR-0022).
- RN-009: O Blueprint nunca duplica o conteudo dos modulos que ja existem
  e ja sao isolados por Organization (DNA, Estrutura Organizacional,
  Competencias, Cargos, Banco de Perguntas, Feature Settings, Provider
  Settings).
- RN-010: Cada Organization pode possuir no maximo uma Blueprint Version
  `active` por vez.
- RN-011: Cada Organization pode possuir no maximo uma Blueprint Version
  `draft` em construcao por vez, nesta primeira arquitetura.
- RN-012: Uma Organization pode possuir multiplas Blueprint Version
  `archived`, sem limite conceitual.
- RN-013: Ativar uma nova Blueprint Version arquiva a anterior de forma
  atomica.
- RN-014: Nunca podem existir duas Blueprint Version `active` simultaneas
  para a mesma Organization.
- RN-015: A Etapa "Dados da Organization" reutiliza exclusivamente os
  campos ja definidos pela SPEC-001, sem criar campo novo nesta SPEC.
- RN-016: A Etapa "DNA Organizacional" apenas verifica readiness e
  referencia dados existentes da SPEC-005, sem duplicar suas regras.
- RN-017: A Etapa "Estrutura Organizacional" apenas verifica readiness e
  referencia dados existentes da SPEC-006, sem duplicar suas regras.
- RN-018: A Etapa "Competencias" apenas verifica readiness e referencia
  dados existentes da SPEC-007, sem duplicar suas regras.
- RN-019: A Etapa "Cargos" apenas verifica readiness e referencia dados
  existentes da SPEC-008, sem duplicar suas regras.
- RN-020: A Etapa "Banco de Perguntas" apenas verifica readiness e
  referencia dados existentes da SPEC-009, sem duplicar suas regras.
- RN-021: A Etapa "Regras de recrutamento" nunca cria peso global de
  competencia ou pergunta; peso permanece exclusivamente no contexto de
  uso, conforme ADR-0009.
- RN-022: A Etapa "Inteligencia Artificial" apenas verifica readiness e
  referencia dados existentes das ADR-0016 a ADR-0019 e SPEC-014, sem
  duplicar suas regras.
- RN-023: A Etapa "Inteligencia Artificial" nunca e obrigatoria para
  ativacao quando a Organization nao utiliza IA.
- RN-024: A Etapa "Validacao" calcula readiness de forma deterministica,
  nunca por IA.
- RN-025: A Etapa "Ativacao" so pode ser executada por Owner.
- RN-026: Readiness e uma propriedade computada sobre uma Blueprint
  Version `draft`, nunca um quarto estado canonico do Blueprint.
- RN-027: Readiness possui estados conceituais `incomplete`, `ready` e
  `blocked`.
- RN-028: Readiness nunca ativa o Blueprint automaticamente; ativacao
  permanece sempre uma decisao explicita do Owner.
- RN-029: Criterios minimos de ativacao nunca exigem dado desnecessario a
  Organization (por exemplo, Provider Settings quando IA nao e usada).
- RN-030: Feature nao utilizada pela Organization nunca bloqueia a
  ativacao do Blueprint.
- RN-031: Features futuras podem declarar pre-requisitos proprios de
  readiness, sem alterar os criterios minimos definidos por esta SPEC.
- RN-032: Progresso de implantacao pode ser exibido como percentual, mas
  percentual nunca e criterio juridico ou automatico de ativacao.
- RN-033: O Indice de Maturidade Organizacional nunca bloqueia ativacao do
  Blueprint.
- RN-034: O Indice de Maturidade Organizacional nunca compara Organizations
  entre si.
- RN-035: O Indice de Maturidade Organizacional nao e produzido
  obrigatoriamente por IA.
- RN-036: Esta SPEC nao define formula matematica definitiva do Indice de
  Maturidade Organizacional.
- RN-037: "Consultor de Implantacao DocFounder" nao e uma role canonica do
  sistema (ADR-0021, ADR-0022).
- RN-038: A consultoria de implantacao nunca recebe Membership automatica
  de `owner` ou `admin`.
- RN-039: Platform Admin nunca e usado como atalho para editar o Blueprint
  durante consultoria.
- RN-040: Owner permanece a autoridade final de ativacao mesmo durante
  implantacao assistida por consultoria.
- RN-041: O mecanismo tecnico de acesso do consultor de implantacao fica
  fora do escopo desta SPEC.
- RN-042: Somente Owner ativa o Blueprint.
- RN-043: Admin nao ativa o Blueprint (mesmo padrao ja aplicado a
  publicacao de DNA, SPEC-005 RN-018, e de Cargo, SPEC-008 RN-026).
- RN-044: Admin pode colaborar na edicao do draft e nos modulos onde
  possui permissao propria.
- RN-045: Member nao administra implantacao, nao ativa Blueprint e nao
  altera readiness.
- RN-046: Platform Admin nao ativa Blueprint, nao edita conteudo funcional
  do Blueprint e nao conduz recrutamento.
- RN-047: Platform Admin pode criar Organization, liberar plano/Features e
  consultar status administrativo da implantacao, sempre de forma
  auditada e mediante motivo.
- RN-048: Uma Blueprint Version e um manifesto agregado e imutavel, nunca
  uma copia integral do conteudo dos modulos.
- RN-049: Para componentes ja versionados formalmente (DNA, Cargo, Vaga),
  o manifesto prefere referencia a versao especifica publicada.
- RN-050: Para componentes ainda sem versionamento formal (Estrutura
  Organizacional, Competencias, Banco de Perguntas), o mecanismo exato de
  snapshot ou referencia fica para especificacao tecnica futura.
- RN-051: Esta SPEC nao define o armazenamento fisico final do manifesto.
- RN-052: Uma Blueprint Version `draft` pode ser incompleta, pronta para
  ativacao (`ready`) ou bloqueada (`blocked`).
- RN-053: Uma Blueprint Version `draft` nunca cria um editor de conteudo
  paralelo aos mecanismos proprios de cada componente.
- RN-054: Uma Blueprint Version `active` e imutavel como checkpoint;
  alteracao contextual relevante exige uma nova versao `draft`.
- RN-055: Uma Blueprint Version `archived` permanece historico, nao
  recebe novas operacoes, continua referenciavel e nunca e apagada
  fisicamente pelo fluxo normal.
- RN-056: Owner e Admin autorizado podem consultar historico de Blueprint
  Version.
- RN-057: O historico de Blueprint Version nunca expoe segredo ou
  credencial.
- RN-058: Apos o Blueprint estar `active`, a Organization pode iniciar
  revisao criando uma nova Blueprint Version `draft`, sem alterar a versao
  `active` ate a nova ativacao.
- RN-059: Uma nova Blueprint Version nunca altera automaticamente Vagas
  publicadas, `CandidateApplication` existentes, Entrevistas, avaliacoes,
  relatorios, `AI Execution` concluidas, Pre-Entrevistas ja realizadas ou
  Dossies ja produzidos.
- RN-060: Devem ser auditados: implantacao iniciada, readiness consultada
  quando relevante, draft criado, ativacao solicitada, ativacao concluida,
  ativacao negada, versao arquivada, tentativa sem permissao, acesso
  administrativo e tentativa de acesso cross-Organization.
- RN-061: Auditoria nunca registra o conteudo completo do Blueprint.
- RN-062: Falha de auditoria critica durante a ativacao causa rollback da
  operacao.
- RN-063: Duas ativacoes concorrentes da mesma Organization nunca podem
  produzir duas Blueprint Version `active` simultaneas; a primeira
  confirmada prevalece e a segunda recebe conflito seguro.
- RN-064: Criacao concorrente de dois drafts para a mesma Organization
  deve ser impedida ou resolvida deterministicamente.
- RN-065: Ativacao concorrente com edicao de draft por Admin deve
  preservar um estado final deterministico, sem estado parcial.
- RN-066: Uma nova ativacao durante a resolucao de uma execucao de IA em
  andamento nunca altera o contexto ja resolvido daquela execucao.
- RN-067: Organization arquivada nao pode ativar Blueprint nem iniciar
  nova implantacao funcional.
- RN-068: Organization arquivada mantem historico consultavel apenas por
  canais autorizados.
- RN-069: Nenhuma Organization acessa readiness, historico ou Blueprint
  Version de outra Organization, em nenhuma circunstancia.
- RN-070: Nenhuma informacao de uma Organization e usada para beneficiar
  outra Organization, inclusive durante consultoria de implantacao.

## 8. Criterios minimos de ativacao

Esta SPEC propoe um conjunto minimo verificavel de criterios para que o
Owner possa ativar o Blueprint. Este conjunto e o criterio funcional
deterministico usado pela Etapa 9 - Validacao (secao 6.9) para calcular
readiness (secao 4.5):

- Organization esta `active` (nao arquivada);
- existe um Owner `active` na Organization;
- DNA Organizacional valido/publicado conforme a regra ja existente na
  SPEC-005;
- existe ao menos uma estrutura organizacional utilizavel, quando
  necessaria ao uso pretendido pela Organization;
- existe ao menos um Cargo publicado, quando a Organization for iniciar
  recrutamento;
- configuracao minima de competencias/perguntas, somente quando exigida
  pelas Features efetivamente utilizadas pela Organization;
- nenhuma inconsistencia critica pendente nos modulos ja verificados;
- nenhuma referencia cross-Organization detectada.

Importante: esta SPEC nunca exige dado desnecessario para a ativacao.
Exemplos:

- uma Organization sem IA nao precisa configurar Provider Settings para
  ativar seu Blueprint;
- uma Organization sem Portal Publico nao precisa configurar identidade
  publica ainda;
- uma Feature nao utilizada pela Organization nunca bloqueia a ativacao.

Esta lista e o conjunto minimo desta fase. Evolucao futura desses
criterios, quando necessaria, deve ser tratada por revisao desta propria
SPEC, sem exigir nova ADR, desde que nao contradiga os principios ja
fixados pela ADR-0022 (secao "Criterios de completude").

## 9. Readiness por Feature

Alem dos criterios minimos gerais (secao 8), Features especificas podem
declarar pre-requisitos proprios de readiness, sem alterar os criterios
minimos gerais nem o mecanismo basico de ativacao definido por esta SPEC.

Exemplos conceituais futuros, apenas ilustrativos:

- Portal Publico (SPEC-019) pode exigir identidade publica e ao menos uma
  Vaga publicavel;
- Pre-Entrevista Estruturada (SPEC-021) pode exigir Banco de Perguntas
  configurado, `CandidateApplication` e consentimentos aplicaveis;
- Features de IA podem exigir infraestrutura liberada
  (`platform_ai_allowed`, ADR-0016), Feature habilitada (ADR-0017) e
  routing/configuracao validos (ADR-0018, ADR-0019).

Esta SPEC define apenas o mecanismo conceitual de declaracao de
pre-requisito por Feature. Ela nao define os requisitos completos de
nenhuma Feature futura; isso fica para a SPEC propria de cada Feature
quando for priorizada.

## 10. Progresso da implantacao

O sistema pode exibir progresso de implantacao ao Owner e ao Admin, com:

- etapas concluidas;
- pendentes;
- opcionais;
- bloqueadas.

Percentual pode existir como representacao visual, por exemplo "7 de 10
etapas concluidas" ou "70% configurado". Percentual e apenas interface e
progresso; ele nunca substitui readiness real, que continua baseada
exclusivamente nas regras deterministicas da secao 8 e da secao 9.

## 11. Indice de Maturidade Organizacional

O Indice de Maturidade Organizacional (secao 4.6) e um indicador
informativo, separado do conceito de readiness (secao 4.5). Ele:

- e informativo;
- nunca bloqueia ativacao;
- nunca e um score de qualidade da empresa;
- nunca compara Organizations entre si;
- nao e produzido obrigatoriamente por IA;
- ajuda o cliente e a consultoria DocFounder a identificar areas ainda
  pouco configuradas.

Pode considerar, por exemplo, o grau de configuracao de: DNA, estrutura,
competencias, cargos, perguntas, processos e Features. Esta SPEC nao
define formula matematica definitiva; isso fica para especificacao ou
revisao futura desta propria SPEC.

## 12. Consultoria DocFounder

A DocFounder pode auxiliar a implantacao com:

- diagnostico;
- levantamento;
- orientacao;
- parametrizacao;
- revisao;
- treinamento.

Esta experiencia funcional segue integralmente os limites ja formalizados
pela ADR-0021, secao "Consultoria", e pela ADR-0022, secao "Consultoria
DocFounder":

- "Consultor de Implantacao DocFounder" e um papel operacional/
  organizacional, nao uma role canonica do sistema (que continua restrita a
  `owner`, `admin`, `member` e Platform Admin, SPEC-004);
- Platform Admin nunca e usado como atalho para editar conteudo funcional
  do Blueprint durante a consultoria, em nenhuma circunstancia;
- Owner continua sendo a autoridade final para toda decisao de ativacao,
  mesmo durante implantacao assistida;
- o acesso tecnico do consultor a plataforma fica fora do escopo desta
  SPEC; qualquer mecanismo futuro depende de autorizacao explicita da
  Organization e de ADR ou SPEC propria (ADR-0021, ADR-0022);
- toda alteracao produzida durante a consultoria continua pertencendo a
  Organization cliente, nunca a DocFounder.

## 13. Permissoes

### 13.1 Owner

Pode:

- visualizar a implantacao;
- editar/configurar modulos onde possui permissao (todos, dentro do que
  cada SPEC de componente ja autoriza a Owner);
- acompanhar readiness;
- consultar pendencias;
- criar nova Blueprint Version `draft` quando aplicavel;
- ativar o Blueprint;
- consultar historico;
- iniciar revisao futura (novo ciclo apos Go Live, secao 16).

Owner e a autoridade final de ativacao (RN-006, RN-025, RN-042).

### 13.2 Admin

Pode:

- colaborar na configuracao dos modulos onde possui permissao propria;
- visualizar progresso de implantacao;
- corrigir pendencias nos modulos em que possui permissao;
- consultar readiness.

Admin nao pode:

- ativar o Blueprint;
- alterar politicas exclusivas do Owner;
- habilitar IA quando isso for exclusivo do Owner (ADR-0016, secao
  "Autorizacao": somente Owner habilita/desabilita
  `organization_ai_enabled`).

### 13.3 Member

Member nao administra implantacao. Pode participar apenas quando uma etapa
operacional especifica permitir, dentro do que cada SPEC de componente ja
autoriza a Member.

Member nao pode:

- ativar o Blueprint;
- alterar readiness;
- administrar configuracao global de implantacao;
- acessar areas administrativas de implantacao sem permissao.

### 13.4 Platform Admin (SuperAdmin)

Pode:

- criar Organization, conforme regras ja existentes (SPEC-001);
- liberar plano/Features (`platform_ai_allowed`, `feature_available_on_
  platform`, conforme ADR-0016 e ADR-0017);
- verificar status administrativo da implantacao;
- prestar suporte;
- consultar dados minimos quando autorizado e auditado.

Platform Admin (SuperAdmin) nao pode:

- alterar missao, visao ou valores (DNA);
- editar Cargos;
- editar competencias;
- editar perguntas;
- alterar criterios (vinculos de competencia/pergunta com Cargo ou Vaga);
- ativar o Blueprint;
- conduzir recrutamento.

Esta hierarquia e consistente com a autorizacao ja registrada nas
ADR-0003, ADR-0016 a ADR-0019, ADR-0020 e SPEC-004 a SPEC-013: Platform
Admin continua sem role funcional dentro da Organization.

## 14. Ciclo de vida do Blueprint

### 14.1 Draft

Uma Blueprint Version `draft` representa o proximo checkpoint em
preparacao. Pode ser:

- incompleta;
- pronta para ativacao (`ready`, secao 4.5);
- bloqueada.

O draft pode referenciar componentes vigentes dos modulos existentes. Esta
SPEC nunca cria um editor de conteudo paralelo aos mecanismos proprios de
cada componente (RN-053; ADR-0022, secao "Blueprint como agregado").

### 14.2 Active

Uma Blueprint Version `active` representa o contexto organizacional
vigente da Organization. Ela deve ser imutavel como checkpoint. Qualquer
alteracao contextual relevante exige uma nova Blueprint Version `draft`,
nunca edicao direta da versao `active` (RN-054).

### 14.3 Archived

Uma Blueprint Version `archived`:

- permanece historico;
- nao recebe novas operacoes;
- continua referenciavel para fins de rastreabilidade, consulta autorizada
  e auditoria;
- nunca e apagada fisicamente pelo fluxo normal (RN-055; secao 20).

## 15. Historico

Owner e Admin autorizado podem consultar o historico de Blueprint Version,
incluindo:

- versao;
- estado;
- data de ativacao;
- ator;
- categorias/componentes envolvidos;
- motivo, quando aplicavel.

O historico nunca exibe segredo ou credencial. O historico nunca duplica
todo o conteudo do Blueprint quando referencias forem suficientes para
rastreabilidade (RN-048, RN-057).

## 16. Atualizacao apos Go Live

Depois que o Blueprint estiver `active`, a Organization pode iniciar
revisao a qualquer momento. Fluxo conceitual:

`active`

->

criar novo `draft`

->

ajustes nos modulos (usando os mecanismos proprios de cada componente)

->

calculo de readiness (Etapa 9)

->

Owner ativa (Etapa 10)

->

versao `active` anterior vira `archived`

Essa mudanca nunca altera automaticamente o historico ja registrado
(secao 17).

## 17. Nao retroatividade

Uma nova Blueprint Version nunca altera automaticamente:

- Vagas ja publicadas;
- `CandidateApplication` existentes;
- Entrevistas existentes;
- avaliacoes ja realizadas;
- relatorios ja produzidos;
- `AI Execution` ja concluidas;
- Pre-Entrevistas ja realizadas (quando existirem, SPEC-021);
- Dossies ja produzidos (quando existirem, SPEC-024).

Este principio e a aplicacao direta, no contexto da implantacao, do que a
ADR-0012, a ADR-0014, a ADR-0019 e a ADR-0022 ja exigem para seus proprios
dominios (RN-059).

## 18. Auditoria

Devem ser auditados, conceitualmente:

- `implantacao.iniciada`;
- `blueprint.readiness_consultada` (quando relevante);
- `blueprint.draft_criado`;
- `blueprint.ativacao_solicitada`;
- `blueprint.ativacao_concluida`;
- `blueprint.ativacao_negada`;
- `blueprint.versao_arquivada`;
- `blueprint.tentativa_sem_permissao`;
- `blueprint.acesso_administrativo`;
- `blueprint.tentativa_cross_organization`.

Estes nomes sao conceituais e ilustrativos, seguindo o padrao ja usado em
`organization_dna.*` (SPEC-005), `job_profile.*` (SPEC-008) e os nomes
conceituais ja registrados pela ADR-0022 (`blueprint.draft_created`,
`blueprint.activated`, entre outros); a nomenclatura tecnica final e
responsabilidade da implementacao.

A auditoria nunca registra o conteudo completo do Blueprint (RN-061). Ela
registra apenas: Organization; versao (identificador, quando aplicavel);
ator; acao; campos ou categorias alterados, quando seguro expor;
timestamps; motivo, quando aplicavel - o mesmo padrao ja exigido pela
ADR-0022, secao "Auditoria".

Falha em registrar auditoria critica durante a ativacao causa rollback da
operacao (RN-062).

## 19. Concorrencia

Cenarios que devem ser cobertos por criterios de aceite e testes:

- dois Owners tentando ativar Blueprint Version simultaneamente para a
  mesma Organization;
- dois drafts sendo criados simultaneamente para a mesma Organization;
- Admin editando o draft enquanto o Owner ativa;
- nova ativacao sendo solicitada enquanto uma operacao ja em andamento
  ainda esta resolvendo a versao `active` vigente.

Principios:

- o estado final precisa ser deterministico;
- nenhuma operacao pode deixar estado parcialmente aplicado;
- quem iniciou uma operacao com uma Blueprint Version valida mantem
  aquela referencia ate o fim da operacao, mesmo que uma nova versao seja
  ativada nesse intervalo (mesmo principio ja exigido pela ADR-0022, secao
  "IA e Blueprint" e "Concorrencia");
- a implementacao futura deve usar transacao, bloqueio de linha (`SELECT
  ... FOR UPDATE` ou equivalente) ou controle otimista quando aplicavel -
  o mesmo padrao ja exigido pela ADR-0004, ADR-0005/SPEC-005, ADR-0014/
  SPEC-012 e ADR-0018.

## 20. Organization arquivada

Quando a Organization estiver arquivada:

- nao pode ativar Blueprint;
- nao pode iniciar nova implantacao funcional;
- o historico permanece consultavel apenas por canais autorizados;
- Platform Admin (SuperAdmin) continua limitado a leitura administrativa
  auditada quando aplicavel, o mesmo padrao ja exigido pela SPEC-005 a
  SPEC-013 para Organization arquivada.

## 21. Seguranca

Esta SPEC garante:

- isolamento absoluto por Organization, em todo componente e em toda
  agregacao do Blueprint (ADR-0020, "Isolamento Multiempresa");
- nenhuma referencia cross-Organization em nenhuma etapa da implantacao;
- nenhuma Organization acessa readiness, historico, Blueprint Version ou
  Indice de Maturidade Organizacional de outra Organization;
- o Blueprint e informacao estrategica e recebe o mesmo nivel de protecao
  ja exigido pela ADR-0021, secao "Seguranca";
- nenhuma informacao de uma Organization e usada para beneficiar outra
  Organization, mesmo durante consultoria de implantacao (ADR-0020, secao
  "Propriedade dos Dados"; ADR-0021, secao "DocFounder").

Toda validacao de pertencimento a uma Organization e de permissao ocorre
no servidor. O identificador enviado pelo cliente nunca prova acesso
(`CONSTITUICAO_DO_PROJETO.md`; `AGENTS.md`).

## 22. Interface conceitual

Prever uma area funcional: "Implantacao / Blueprint Organizacional",
mostrando:

- etapas;
- progresso (secao 10);
- readiness (secao 4.5, secao 8);
- pendencias;
- recomendacoes;
- status do draft;
- versao ativa;
- historico.

A interface nunca substitui autorizacao server-side; toda acao exibida na
interface e revalidada no backend, consistente com `CONSTITUICAO_DO_
PROJETO.md`.

## 23. API conceitual

Prever operacoes conceituais para:

| Operacao | Finalidade |
| --- | --- |
| Consultar estado da implantacao | Retornar etapas, progresso e status geral |
| Consultar readiness | Retornar itens concluidos, pendentes, opcionais e bloqueios do draft atual |
| Criar draft | Iniciar uma nova Blueprint Version `draft` |
| Consultar draft | Retornar o draft em construcao |
| Validar draft | Recalcular readiness sob demanda |
| Ativar | Confirmar o checkpoint e tornar a versao `active` |
| Consultar versao ativa | Retornar a Blueprint Version `active` vigente |
| Consultar historico | Retornar as Blueprint Version `archived` da Organization |

Esta SPEC nao define URLs finais, contratos de request/response nem codigo
de rota. As operacoes acima sao conceituais, a serem detalhadas na
especificacao tecnica de implementacao.

## 24. Banco conceitual

Sem definir SQL, esta SPEC descreve estruturas equivalentes as seguintes
entidades conceituais:

### Blueprint

Entidade logica da Organization. Nao e uma tabela fisica isolada
necessariamente; pode ser resolvida, tecnicamente, apenas como a
Organization mais a Blueprint Version `active` vigente. Esta SPEC nao
decide a forma fisica exata.

### Blueprint Version

Campos conceituais:

- `id`;
- `organization_id`;
- `version_number`;
- `status` (`draft`, `active`, `archived`);
- `created_by_user_id`;
- `activated_by_user_id`, opcional;
- `created_at`;
- `activated_at`, opcional;
- `archived_at`, opcional;
- metadata segura (nunca segredo, credencial ou conteudo completo dos
  componentes).

### Blueprint Manifest

Representa as referencias/componentes do checkpoint (secao 25). Pode,
futuramente, conter referencias estruturadas, por exemplo:

- versao publicada de DNA Organizacional referenciada;
- versoes publicadas de Cargo referenciadas;
- referencia ao estado vigente (ou snapshot futuro) de Estrutura
  Organizacional, Competencias e Banco de Perguntas;
- referencia as Feature Settings e Provider Settings vigentes, quando
  aplicavel.

Esta SPEC nao define o armazenamento fisico final do manifesto (RN-051).

## 25. Manifesto

O Blueprint Manifest nunca e uma copia integral de todos os modulos. Ele
deve preservar apenas o contexto necessario a rastreabilidade (ADR-0022,
secao "Principio: manifesto de contexto").

Para componentes ja versionados formalmente (DNA - SPEC-005, Cargo -
SPEC-008, Vaga - SPEC-010), o manifesto deve preferir referencia direta a
versao publicada especifica usada no momento do checkpoint.

Para componentes ainda sem versionamento formal (Estrutura Organizacional
- SPEC-006; Catalogo de Competencias - SPEC-007; Banco de Perguntas -
SPEC-009), a futura implementacao devera escolher um mecanismo seguro de
snapshot ou de referencia auditavel. Esta SPEC nao resolve fisicamente essa
decisao agora, consistente com a ADR-0022, secao "Componentes ainda nao
versionados".

## 26. Criterios de aceite

- CA-001: Organization nova possui implantacao inicial criada
  automaticamente.
- CA-002: Blueprint da Organization inicia como Blueprint Version `draft`.
- CA-003: Nao ha ativacao automatica de Blueprint na criacao da
  Organization.
- CA-004: Owner consulta readiness do draft atual.
- CA-005: Admin consulta readiness do draft atual.
- CA-006: Member nao administra implantacao (nao ativa, nao cria draft,
  nao altera readiness).
- CA-007: Platform Admin nao edita Blueprint funcional.
- CA-008: Blueprint sem os criterios minimos definidos na secao 8 nao
  pode ser ativado.
- CA-009: Blueprint com readiness `ready` pode ser ativado pelo Owner.
- CA-010: Somente Owner ativa o Blueprint; Admin e Member recebem erro de
  permissao ao tentar.
- CA-011: Duas ativacoes concorrentes para a mesma Organization nao
  produzem dois Blueprint Version `active`; a segunda recebe conflito
  seguro.
- CA-012: Existe no maximo um Blueprint Version `draft` por Organization
  em construcao.
- CA-013: Ativacao arquiva a versao `active` anterior, quando existir, de
  forma atomica.
- CA-014: Historico de Blueprint Version e preservado apos ativacao.
- CA-015: Nova Blueprint Version nao altera automaticamente historico ja
  registrado (Vagas, `CandidateApplication`, Entrevistas, avaliacoes).
- CA-016: Organization arquivada nao pode ativar Blueprint nem iniciar
  nova implantacao funcional.
- CA-017: Organization sem IA contratada pode ativar seu Blueprint sem
  configurar Provider Settings.
- CA-018: Feature desabilitada, na plataforma ou na Organization, nao
  impoe pre-requisito de ativacao.
- CA-019: Provider de IA nao e obrigatorio quando a Organization nao usa
  IA.
- CA-020: Referencia cross-Organization em qualquer operacao de
  implantacao e recusada, sem revelar existencia do registro em outra
  Organization.
- CA-021: Eventos criticos de implantacao (draft criado, ativacao
  solicitada, ativacao concluida, ativacao negada, versao arquivada) sao
  auditados.
- CA-022: Falha de auditoria critica durante a ativacao causa rollback
  completo da operacao.
- CA-023: Calculo de readiness e deterministico, sem uso de IA.
- CA-024: Indice de Maturidade Organizacional nao bloqueia ativacao do
  Blueprint.
- CA-025: Percentual de progresso exibido na interface nunca substitui o
  resultado deterministico de readiness.
- CA-026: Admin nao ativa o Blueprint.
- CA-027: Platform Admin (SuperAdmin) nao ativa o Blueprint.
- CA-028: Blueprint Version `active` e imutavel como checkpoint; alteracao
  relevante exige novo `draft`.
- CA-029: Blueprint Version `archived` nao e removida fisicamente pelo
  fluxo normal.
- CA-030: Estado do Blueprint (draft/active/archived) persiste apos
  recriar a aplicacao (nao e apenas estado em memoria).
- CA-031: Platform Admin (SuperAdmin) nao acessa Blueprint, readiness ou
  historico de implantacao de outra Organization.
- CA-032: Auditoria de implantacao nunca registra o conteudo completo do
  Blueprint.
- CA-033: Consultoria DocFounder nunca resulta em Membership automatica
  de `owner` ou `admin` para o consultor.
- CA-034: Owner pode iniciar nova revisao (criar novo draft) apos o
  Blueprint estar `active`, sem alterar a versao `active` ate a nova
  ativacao.
- CA-035: Blueprint Manifest de uma versao `active` referencia a versao
  publicada especifica de componentes ja versionados (DNA, Cargo), quando
  existentes, em vez de duplicar seu conteudo.

## 27. Testes obrigatorios

Esta SPEC especifica os testes obrigatorios; ela nao os implementa.

### Funcionamento

- Organization nova cria implantacao inicial e Blueprint Version `draft`
  automaticamente.
- Etapa 9 (Validacao) calcula readiness `incomplete` para draft sem os
  criterios minimos.
- Etapa 9 calcula readiness `ready` para draft que atende aos criterios
  minimos.
- Etapa 10 (Ativacao) transforma um draft `ready` em Blueprint Version
  `active`.
- Ativacao arquiva a Blueprint Version `active` anterior, quando existir.
- Criacao de novo draft apos Go Live nao altera a versao `active` vigente
  ate a nova ativacao.
- Progresso de implantacao reflete corretamente etapas concluidas,
  pendentes, opcionais e bloqueadas.
- Readiness por Feature nao bloqueia ativacao quando a Feature nao e
  utilizada pela Organization.

### Permissoes

- Owner ativa o Blueprint com sucesso quando readiness e `ready`.
- Admin recebe erro de permissao ao tentar ativar o Blueprint.
- Member recebe erro de permissao ao tentar ativar o Blueprint, criar
  draft ou alterar readiness.
- Platform Admin (SuperAdmin) recebe erro de permissao ao tentar editar
  conteudo funcional do Blueprint ou ativar.
- Admin consegue colaborar na edicao de modulos onde possui permissao
  propria (por exemplo, editar rascunho de DNA, dentro do que a SPEC-005
  ja autoriza a Admin).
- Member consegue apenas consumir partes do Blueprint que sua role ja
  autoriza em cada componente.

### Multiempresa

- Owner de uma Organization nao consulta readiness, draft ou historico de
  Blueprint de outra Organization.
- Tentativa de ativar Blueprint informando `organization_id` de outra
  Organization e recusada e auditada.
- Mensagem de erro para acesso cruzado nao revela existencia de Blueprint
  ou de Blueprint Version em outra Organization.

### Readiness

- Draft sem DNA Organizacional publicado recebe readiness `incomplete` ou
  `blocked`, conforme criterio minimo definido.
- Draft sem nenhum Cargo publicado, quando a Organization pretende
  recrutar, recebe readiness `incomplete` ou `blocked`.
- Draft de Organization sem IA contratada nao e bloqueado pela ausencia de
  Provider Settings.
- Draft de Organization com Feature de IA desabilitada na plataforma nao
  e bloqueado pela ausencia de configuracao daquela Feature.

### Progress

- Percentual de progresso exibido na interface e apenas informativo e nao
  altera o resultado de readiness retornado pela API.
- Indice de Maturidade Organizacional nao aparece como pre-requisito de
  ativacao em nenhum teste de bloqueio.

### Ativacao

- Ativacao valida que o ator e o Owner da Organization.
- Ativacao valida que a Organization esta `active` (nao arquivada).
- Ativacao valida que existe um draft em construcao.
- Ativacao valida os criterios minimos vigentes antes de prosseguir.
- Ativacao gera evento de auditoria com ator, timestamp e resultado.
- Ativacao e atomica: falha em qualquer etapa nao deixa estado parcial.

### Concorrencia

- Dois Owners tentando ativar simultaneamente: apenas uma ativacao
  prevalece; a outra recebe conflito seguro, sem estado parcial.
- Duas criacoes simultaneas de draft para a mesma Organization: apenas um
  draft prevalece, ou a segunda tentativa e rejeitada deterministicamente.
- Admin editando o draft enquanto o Owner ativa: o estado final e
  deterministico, sem perda silenciosa de edicao nem estado inconsistente.
- Nova ativacao solicitada durante resolucao de uma `AI Execution` em
  andamento nao altera o contexto ja resolvido daquela execucao.

### Rollback

- Falha de auditoria critica durante a ativacao reverte toda a operacao
  (nenhuma Blueprint Version fica `active` parcialmente).
- Falha em qualquer etapa da ativacao nao deixa a versao anterior
  arquivada sem uma nova versao `active` correspondente.

### Historico

- Blueprint Version `archived` permanece consultavel por Owner e Admin
  autorizado apos a ativacao de uma nova versao.
- Historico de Blueprint Version nunca expoe segredo ou credencial.
- Historico preserva ator, data de ativacao e motivo, quando aplicavel.

### Imutabilidade

- Blueprint Version `active` nao pode ser editada diretamente; qualquer
  tentativa de alteracao de conteudo relevante exige criacao de novo
  draft.
- Blueprint Version `archived` nao pode ser reativada diretamente sem
  passar por um novo ciclo de draft e ativacao.

### Organization arquivada

- Organization arquivada nao permite criacao de novo draft.
- Organization arquivada nao permite ativacao de Blueprint.
- Historico de implantacao de Organization arquivada permanece consultavel
  apenas por canais autorizados (por exemplo, leitura administrativa
  auditada de Platform Admin).

### IA opcional

- Organization sem `organization_ai_enabled` ativa seu Blueprint
  normalmente, sem nenhum bloqueio relacionado a IA.
- Etapa 8 (Inteligencia Artificial) e exibida como nao aplicavel ou
  opcional quando a Organization nao usa IA.

### Feature opcional

- Feature de IA desabilitada na plataforma (`feature_available_on_
  platform = false`) nao impoe pre-requisito de configuracao para
  ativacao do Blueprint.
- Feature de IA desabilitada na Organization
  (`organization_feature_enabled = false`) nao impoe pre-requisito de
  configuracao para ativacao do Blueprint.

### Manifesto

- Blueprint Manifest de uma Blueprint Version `active` referencia a
  versao publicada especifica de DNA e de Cargo vigentes no momento da
  ativacao, quando esses componentes ja estiverem publicados.
- Blueprint Manifest nunca duplica o conteudo completo de DNA, Cargo,
  Estrutura Organizacional, Competencias ou Banco de Perguntas.

### Referencias

- Toda referencia entre Blueprint Version e componentes usa exclusivamente
  IDs internos, nunca nome, codigo, e-mail ou slug publico.
- Referencia a componente de outra Organization e recusada e auditada.

### Ausencia de delete fisico

- Nenhuma Blueprint Version, `active` ou `archived`, e removida
  fisicamente pelo fluxo normal da aplicacao.
- Tentativa de exclusao fisica de Blueprint Version fora dos fluxos
  previstos e recusada.

### Persistencia PostgreSQL

- Estado de Blueprint Version (`draft`, `active`, `archived`) persiste
  apos reiniciar a aplicacao.
- Historico de Blueprint Version persiste apos reiniciar a aplicacao.
- Auditoria de implantacao persiste apos reiniciar a aplicacao.

## 28. Limitacoes conhecidas

- O mecanismo fisico final do Blueprint Manifest ainda dependera do
  planejamento tecnico de uma especificacao futura.
- O Indice de Maturidade Organizacional nao possui formula final nesta
  fase.
- O acesso tecnico de consultoria da DocFounder nao esta definido nesta
  SPEC; fica para ADR ou SPEC futura, conforme ja registrado pela
  ADR-0021 e pela ADR-0022.
- Features futuras (Portal Publico, Candidatura Publica, Pre-Entrevista
  Estruturada, Perfil Comportamental, Pre-Analise Assistida por IA, Dossie
  Inteligente) adicionarao criterios proprios de readiness quando forem
  especificadas (SPEC-019 a SPEC-024).
- Alguns componentes do Blueprint (Estrutura Organizacional, Catalogo de
  Competencias, Banco de Perguntas) ainda nao possuem versionamento
  formal individual; o mecanismo de referencia desses componentes no
  manifesto fica para decisao tecnica futura.
- Esta SPEC nao define workflow de aprovacao em multiplos niveis para
  ativacao; ativacao permanece uma decisao unica do Owner nesta fase.

## 29. Definicao de concluido

A SPEC estara concluida quando:

- as regras de implantacao definidas nas secoes 5 a 10 estiverem
  implementadas;
- a Blueprint Version existir de forma persistente, com os tres estados
  conceituais (`draft`, `active`, `archived`);
- o calculo de readiness deterministica (secao 8) estiver funcionando;
- a ativacao for transacional e atomica (secao 6.10, secao 19);
- o historico estiver preservado e consultavel (secao 15);
- as permissoes da secao 13 estiverem aplicadas e testadas;
- o isolamento multiempresa estiver garantido e testado (secao 21);
- a auditoria critica estiver funcionando, com rollback em caso de falha
  (secao 18);
- todos os testes obrigatorios da secao 27 estiverem passando;
- nenhum modulo futuro fora do escopo desta SPEC (secao 2) tiver sido
  implementado indevidamente.
