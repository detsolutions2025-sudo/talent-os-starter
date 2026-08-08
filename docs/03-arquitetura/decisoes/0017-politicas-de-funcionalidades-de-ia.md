# ADR 0017 - Politicas de funcionalidades de IA

## Status

Aceita.

## Contexto

A ADR-0016 estabeleceu que IA e uma capacidade opcional do Talent OS e definiu
duas camadas canonicas de disponibilidade por Organization:

- `platform_ai_allowed`, autoridade de Platform Admin;
- `organization_ai_enabled`, autoridade do Owner.

A ADR-0016 tambem definiu que a execucao de IA exige uma terceira condicao —
"a funcionalidade especifica estiver permitida pela politica futura de
features" — e deixou essa condicao explicitamente fora do seu escopo, para ser
definida em ADR posterior.

O Talent OS ja projeta multiplas funcionalidades futuras baseadas em IA,
distintas entre si em proposito e em modulo de negocio associado. Essas
funcionalidades precisam poder ser habilitadas ou desabilitadas de forma
independente, sem que a introducao de uma nova funcionalidade exija alterar
funcionalidades ja existentes ou os modulos de negocio que as consomem.

Esta revisao fecha as ambiguidades restantes: de quem e o catalogo de
funcionalidades, em qual nivel o estado de cada funcionalidade e controlado, e
quais papeis administram esse estado. A terceira condicao da ADR-0016, antes
representada por uma unica flag `ai_feature.enabled`, passa a ser expressa
formalmente como duas subcondicoes: disponibilidade da funcionalidade na
plataforma e habilitacao da funcionalidade na Organization.

Esta ADR define exclusivamente como funcionalidades de IA sao habilitadas ou
desabilitadas dentro de cada Organization. Providers, credenciais, API Keys,
Secret Manager, modelos de IA, prompts, AI Gateway, custos e implementacao
tecnica ficam fora do escopo desta decisao e deverao ser tratados em ADRs
posteriores.

## Decisao

### Catalogo de funcionalidades

O catalogo de AI Feature Policies pertence a plataforma, nao a Organization.

- A plataforma define quais funcionalidades de IA existem no catalogo.
- Cada Organization controla apenas o estado de cada funcionalidade que a
  plataforma disponibilizou para uso.
- Organizations nao podem criar funcionalidades proprias de IA nem adicionar
  entradas ao catalogo.

Exemplos iniciais de funcionalidades do catalogo (lista ilustrativa, nao
exaustiva):

- AI Assisted Evaluation;
- Interview Summary;
- Interview Insights;
- Candidate Matching;
- Candidate Ranking;
- Question Suggestions;
- Onboarding Assistant;
- Development Assistant.

Essa lista podera crescer no futuro, por decisao da plataforma, sem alterar
modulos existentes e sem revisar esta ADR. Cada nova funcionalidade recebe sua
propria AI Feature Policy, seguindo as mesmas regras aqui definidas.

### Escopo da configuracao

O estado de uma AI Feature Policy e sempre um par **Organization + Feature**.

Nunca existe um estado global unico de uma Feature valendo igualmente para
todas as Organizations. Duas Organizations podem manter estados diferentes
para a mesma funcionalidade ao mesmo tempo.

Exemplo conceitual:

- Organization A: `Interview Summary = enabled`, `Candidate Matching = disabled`;
- Organization B: `Interview Summary = disabled`, `Candidate Matching = enabled`.

### Estados

Cada AI Feature Policy e controlada em dois niveis independentes, cada um com
exatamente dois estados canonicos:

- No nivel de plataforma: `feature_available_on_platform`, com valores
  `true` (disponibilizada) ou `false` (retirada/nao disponibilizada). Esse
  estado e unico por funcionalidade e vale para toda a plataforma.
- No nivel de Organization: `organization_feature_enabled`, com valores
  `true` (habilitada) ou `false` (desabilitada). Esse estado e especifico do
  par Organization + Feature, conforme a secao anterior.

Nenhum outro estado deve ser criado para uma AI Feature Policy, em nenhum dos
dois niveis.

### Permissoes

**Platform Admin**

- define quais funcionalidades existem no catalogo da plataforma;
- pode disponibilizar (`feature_available_on_platform = true`) ou retirar
  (`feature_available_on_platform = false`) uma funcionalidade da plataforma;
- nao habilita automaticamente nenhuma funcionalidade dentro de nenhuma
  Organization: disponibilizar uma funcionalidade na plataforma nao altera
  `organization_feature_enabled` de nenhuma Organization.

**Owner**

- habilita ou desabilita `organization_feature_enabled` para funcionalidades
  disponiveis (`feature_available_on_platform = true`) dentro da sua
  Organization;
- nao pode habilitar uma funcionalidade que a plataforma nao disponibilizou.

**Admin**

- pode visualizar a configuracao de Feature Policies da Organization;
- nao altera Feature Policies nesta primeira versao.

**Member**

- nao possui acesso administrativo a Feature Policies: nao visualiza
  configuracao administrativa nem altera o estado de nenhuma funcionalidade.

Esta hierarquia e consistente com a autorizacao definida na ADR-0016 para
`platform_ai_allowed` e `organization_ai_enabled`: Platform Admin continua sem
role funcional dentro da Organization e controla apenas disponibilidade, nunca
uso funcional; Owner administra dentro do que a plataforma permite; Admin
apenas visualiza; Member nao tem acesso administrativo.

### Regra de execucao

Uma funcionalidade de IA especifica so pode executar quando, simultaneamente:

- `platform_ai_allowed == true`;
- `organization_ai_enabled == true`;
- `feature_available_on_platform == true`;
- `organization_feature_enabled == true`.

Se qualquer uma dessas quatro condicoes for falsa, nenhuma chamada a provider
pode ocorrer para essa funcionalidade especifica. Esta regra formaliza a
"politica futura de features" citada pela ADR-0016 como terceira condicao da
regra efetiva de execucao de IA, agora expressa como duas subcondicoes: o nivel
de catalogo da plataforma e o nivel de habilitacao da Organization.

### Independencia entre funcionalidades

Habilitar ou desabilitar uma AI Feature Policy, em qualquer nivel, nao altera
o estado de nenhuma outra AI Feature Policy.

Exemplo: `Interview Summary = enabled` e `Candidate Matching = disabled` podem
coexistir na mesma Organization, ao mesmo tempo. A funcionalidade habilitada
continua operando normalmente, sempre respeitando `platform_ai_allowed` e
`organization_ai_enabled` definidos pela ADR-0016.

### Independencia dos modulos de negocio

Modulos de negocio (`Candidate`, `Job Opening`, `CandidateApplication`,
`Interview` e demais, presentes ou futuros) nunca verificam provider,
credenciais ou infraestrutura de IA diretamente.

Cada modulo apenas consulta, conceitualmente, se uma determinada AI Feature
esta disponivel para a Organization atual. A infraestrutura de IA, quando
especificada em ADR posterior, e responsavel por resolver provider, credenciais,
modelo e demais detalhes tecnicos necessarios para a execucao.

### Historico

Desabilitar uma AI Feature Policy, seja pela Organization
(`organization_feature_enabled = false`) seja pela plataforma retirando a
funcionalidade do catalogo (`feature_available_on_platform = false`):

- nao remove analises ja produzidas por essa funcionalidade;
- nao remove auditoria ja registrada;
- nao remove historico de execucoes anteriores;
- apenas bloqueia novas execucoes dessa funcionalidade a partir do momento da
  desabilitacao.

### Auditoria

Devem ser auditados, por funcionalidade:

- Feature disponibilizada pela plataforma (`feature_available_on_platform`
  passando para `true`);
- Feature retirada da plataforma (`feature_available_on_platform` passando
  para `false`);
- Feature habilitada pela Organization (`organization_feature_enabled`
  passando para `true`);
- Feature desabilitada pela Organization (`organization_feature_enabled`
  passando para `false`);
- tentativa de execucao quando a Feature estiver indisponivel, por qualquer
  combinacao em que `platform_ai_allowed`, `organization_ai_enabled`,
  `feature_available_on_platform` ou `organization_feature_enabled` estejam em
  `false`.

A auditoria nunca registra:

- prompts;
- respostas completas geradas por IA;
- credenciais, chaves ou segredos;
- dados pessoais completos.

Este padrao de auditoria e consistente com o definido pela ADR-0016 para
`platform_ai_allowed` e `organization_ai_enabled`: cada registro identifica quem
executou a acao, quando, o estado resultante e o motivo administrativo quando
aplicavel, sem armazenar conteudo de negocio ou segredos.

### Seguranca

Nenhuma informacao pode ser enviada para IA quando qualquer uma das quatro
condicoes da regra de execucao estiver falsa:

- IA global (`platform_ai_allowed`) desabilitada;
- IA da Organization (`organization_ai_enabled`) desabilitada;
- a funcionalidade indisponivel na plataforma (`feature_available_on_platform`
  falso);
- a funcionalidade desabilitada na Organization (`organization_feature_enabled`
  falso).

Nao ha excecao operacional, atalho administrativo ou modo de emergencia que
contorne essa regra.

### Escalabilidade

A arquitetura de AI Feature Policies deve permitir adicionar novas
funcionalidades de IA ao catalogo da plataforma sem alterar funcionalidades ja
existentes, sem alterar modulos de negocio ja implementados e sem revisar as
ADRs 0016 ou 0017.

## Consequencias

- A ADR-0016 fica completa: as quatro condicoes da regra efetiva de execucao de
  IA (`platform_ai_allowed`, `organization_ai_enabled`,
  `feature_available_on_platform`, `organization_feature_enabled`) ficam
  formalmente definidas.
- O catalogo de funcionalidades de IA e centralizado na plataforma; nenhuma
  Organization decide o que existe, apenas o que usa dentro do que existe.
- Novas funcionalidades de IA podem ser adicionadas ao catalogo sem exigir
  alteracao de funcionalidades ja existentes.
- Modulos de negocio permanecem desacoplados de provider, credenciais e demais
  detalhes de infraestrutura de IA.
- Uma funcionalidade de IA pode ser desabilitada isoladamente, pela plataforma
  ou pela Organization, para investigar problema, aplicar politica ou conter
  custo, sem afetar as demais.
- O historico e a auditoria de uma funcionalidade permanecem intactos mesmo
  apos sua desabilitacao, em qualquer dos dois niveis.

## Fora do escopo

Esta ADR nao define nem implementa:

- providers de IA;
- OpenAI, Gemini, Claude, Ollama, Azure OpenAI ou qualquer provider especifico;
- credenciais, chaves de API ou Secret Manager;
- Prompt Registry ou gestao de prompts;
- AI Gateway;
- modelos de IA ou parametros de inferencia;
- cobranca ou custos;
- telemetria;
- implementacao tecnica de qualquer AI Feature.

Esses temas deverao possuir ADRs ou especificacoes proprias quando forem
priorizados.

## Restricoes mantidas

- IA continua sendo capacidade opcional do Talent OS (ADR-0016).
- Nenhum modulo de negocio depende de uma AI Feature especifica para funcionar.
- Platform Admin nao recebe role funcional dentro da Organization (ADR-0003,
  ADR-0013, ADR-0014, ADR-0016).
- Nao ha exclusao de historico ou auditoria ao alterar o estado de uma AI
  Feature Policy, em nenhum nivel.
- Resultados humanos permanecem independentes de qualquer AI Feature Policy
  (ADR-0015, ADR-0016).
- Organizations nao podem criar funcionalidades proprias de IA; o catalogo
  pertence exclusivamente a plataforma.
