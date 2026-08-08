# SPEC-014 - Infraestrutura de IA

**Status:** Aprovada  
**Versao:** 1.0  
**Fase:** 11  
**Responsavel de negocio:** Thiago Sousa  
**Dependencias:** ADR-0016 - IA Opcional por Organization, ADR-0017 - Politicas de Funcionalidades de IA, ADR-0018 - Providers, Credenciais e Secret Management de IA, ADR-0019 - AI Gateway, Provider Routing, Prompt Registry e Telemetria  
**Ultima atualizacao:** 2026-08-07

## Objetivo

Especificar a infraestrutura central de IA do Talent OS antes da implementacao
de qualquer Feature de IA, transformando as decisoes das ADR-0016 a ADR-0019
em regras funcionais, dados, APIs conceituais, permissoes, criterios de aceite
e testes.

Nesta fase, o sistema deve permitir conceitualmente:

- configurar IA por Organization (`platform_ai_allowed` /
  `organization_ai_enabled`);
- administrar o catalogo global de Feature Policies
  (`feature_available_on_platform`) e o toggle por Organization
  (`organization_feature_enabled`);
- administrar um catalogo global de providers de IA;
- configurar credenciais de provider por Organization, em tres modos
  (`disabled`, `platform_managed`, `customer_managed`);
- administrar um Secret Management conceitual, sem armazenar segredo em texto
  puro no banco principal;
- administrar um Model Registry global;
- administrar um Prompt Registry global, versionado e imutavel apos
  publicacao;
- administrar Provider Routing por Organization + Feature, com prioridade
  deterministica;
- controlar fallback entre rotas exigindo simultaneamente
  `fallback_allowed_on_platform` (plataforma) e `fallback_enabled`
  (Organization), com revalidacao de compliance a cada tentativa;
- centralizar toda execucao de IA em um `AIGateway` conceitual, sem permitir
  que modulos de negocio chamem provider diretamente;
- registrar `AI Execution` com telemetria, custo tecnico estimado, timeout,
  rate limiting, retry e idempotencia;
- auditar toda alteracao de configuracao e toda execucao, incluindo selecao e
  rejeicao de routing;
- preservar isolamento multiempresa em todas as camadas;
- garantir fail-safe: indisponibilidade, desabilitacao ou falha de IA nunca
  bloqueia fluxo humano obrigatorio.

Esta SPEC nao implementa logica de avaliacao de `Candidate`.

## Fora do escopo

Esta fase nao implementa:

- avaliacao de candidato;
- matching;
- ranking;
- entrevistas por IA;
- onboarding assistido por IA;
- desenvolvimento assistido por IA;
- decisao automatica;
- provider padrao comercial;
- preco comercial;
- Secret Manager fisico especifico (produto ou fornecedor);
- AI Gateway como codigo, apenas como conceito e contrato;
- adapters de provider concretos;
- algoritmo de desempate de prioridade de routing;
- mapeamento tecnico exato de erros especificos de cada provider para as
  categorias canonicas de `error_category` (fica para implementacao do
  Provider Adapter);
- politica numerica exata de rate limit (test_connection e execucao),
  timeout, retry e idempotencia (ficam para especificacao tecnica de
  implementacao).

## Usuarios envolvidos

- Platform Admin;
- Owner da Organization;
- Admin da Organization;
- Member da Organization, apenas como usuario funcional de uma Feature de IA
  ja habilitada, nunca como administrador desta infraestrutura.

## AI Gateway - centralizacao obrigatoria

Toda execucao de IA do Talent OS passa exclusivamente pelo `AIGateway`
conceitual.

Regras:

- modulos de negocio (`InterviewService`, `CandidateApplicationService`,
  futura Avaliacao Assistida, Matching, Onboarding, Desenvolvimento e
  qualquer outro dominio, presente ou futuro) nao podem importar SDK ou
  client concreto de nenhum provider de IA;
- nenhum modulo de negocio chama OpenAI, Anthropic, Gemini, Azure OpenAI,
  Ollama ou qualquer outro provider diretamente;
- toda chamada de negocio passa pelo `AIGateway`, que resolve politicas,
  routing, credencial, modelo e prompt antes de acionar um Provider Adapter;
- adapters concretos de provider ficam atras do contrato conceitual de
  Provider Adapter (ADR-0019), nunca expostos a modulos de negocio;
- esta SPEC nao define a implementacao tecnica do `AIGateway` nem dos
  adapters, apenas a obrigatoriedade de centralizacao.

## Conceitos

### Organization AI Settings

Representa a disponibilidade de IA para uma Organization (ADR-0016).

Campos conceituais:

- `organization_id`;
- `platform_ai_allowed`;
- `organization_ai_enabled`;
- timestamps;
- autoria.

Regras:

- `platform_ai_allowed` e autoridade de Platform Admin;
- `organization_ai_enabled` e autoridade de Owner, e so pode ser definido
  como `true` quando `platform_ai_allowed = true`;
- toda nova Organization inicia com `platform_ai_allowed = false` (ou o valor
  da politica comercial vigente) e `organization_ai_enabled = false`;
- nao existe opt-in automatico;
- quando `platform_ai_allowed` transicionar de `true` para `false`, o valor
  armazenado de `organization_ai_enabled` nao e alterado automaticamente;
  permanece armazenado como preferencia da Organization, mas fica inerte
  enquanto `platform_ai_allowed` for `false`; nenhuma execucao ocorre nesse
  periodo;
- Owner nao consegue sobrepor o bloqueio da plataforma alterando
  `organization_ai_enabled` enquanto `platform_ai_allowed = false`;
- se `platform_ai_allowed` voltar para `true`, a preferencia anterior
  armazenada em `organization_ai_enabled` volta a ter efeito, sem
  necessidade de nova acao do Owner;
- historico e auditoria relacionados a `organization_ai_enabled` permanecem
  preservados durante todo o periodo em que a plataforma bloquear IA.

### AI Feature Catalog

Catalogo global de funcionalidades de IA, controlado pela plataforma
(ADR-0017, ADR-0019).

Campos conceituais:

- `feature_key`;
- nome;
- descricao;
- `feature_available_on_platform`;
- `fallback_allowed_on_platform`;
- timestamps.

Regras:

- somente Platform Admin cria entradas nesse catalogo;
- Organizations nao criam funcionalidades proprias de IA;
- `fallback_allowed_on_platform` pertence exclusivamente a este catalogo
  global; e um booleano controlado somente por Platform Admin; Owner, Admin
  e Member nunca o alteram;
- `fallback_allowed_on_platform = true` indica que a Feature pode,
  tecnicamente, usar fallback entre rotas; isso nao habilita fallback
  automaticamente para nenhuma Organization — a Organization ainda precisa
  definir `fallback_enabled = true` em `Organization AI Feature Settings`
  (secao "Fallback").

### Organization AI Feature Settings

Representa o toggle de uma Feature dentro de uma Organization (ADR-0017) e o
controle de fallback dessa Feature dentro dessa Organization (ADR-0019).

Unidade: par `organization_id` + `feature_key`.

Campos conceituais:

- `organization_feature_enabled`;
- `fallback_enabled`;
- timestamps;
- autoria.

Regras:

- somente Owner altera `organization_feature_enabled`, e apenas quando
  `feature_key` estiver com `feature_available_on_platform = true` no
  `AI Feature Catalog`;
- se a Feature for retirada da plataforma
  (`feature_available_on_platform = false`), o valor de
  `organization_feature_enabled` permanece armazenado, mas fica inerte; ao
  ser disponibilizada novamente, a preferencia anterior volta a valer sem
  nova acao do Owner;
- `fallback_enabled` pertence exclusivamente a esta entidade; o fallback e
  uma configuracao da Feature dentro da Organization, nunca uma propriedade
  de uma rota individual (`AI Provider Routing Policy`);
- somente Owner altera `fallback_enabled`, e o efeito pratico dessa escolha
  so existe quando `fallback_allowed_on_platform = true` no
  `AI Feature Catalog` (secao "Fallback");
- Admin e Member nunca alteram `organization_feature_enabled` nem
  `fallback_enabled`.

### AI Provider Catalog

Catalogo global de providers suportados pela plataforma (ADR-0018, ADR-0019).

Campos conceituais:

- `provider_key`;
- nome;
- status;
- capabilities;
- metadata.

Regras:

- catalogo administrado exclusivamente por Platform Admin;
- adicionar um provider ao catalogo nao exige alterar modulos de negocio.

### Organization AI Provider Config

Representa a configuracao de credencial de um provider para uma Organization
(ADR-0018).

Campos conceituais:

- `id`;
- `organization_id`;
- `provider`;
- `credential_mode`;
- `status`;
- `secret_reference`, opcional;
- `masked_identifier`, opcional;
- `configured_at`;
- `configured_by_user_id`;
- `last_validated_at`;
- `last_validation_status`;
- `revoked_at`;
- timestamps.

`credential_mode` (canonico):

- `disabled`;
- `platform_managed`;
- `customer_managed`.

`status` (canonico):

- `configured`;
- `invalid`;
- `revoked`;
- `error`.

Regras:

- unidade conceitual e o par `organization_id` + `provider`; uma Organization
  pode ter multiplos providers configurados simultaneamente, cada um com seu
  proprio `credential_mode`, `status` e `secret_reference`;
- ausencia de registro ativo equivale a `credential_mode = disabled`;
- a tabela nunca armazena a API Key diretamente; o unico vinculo com o
  segredo real e `secret_reference`;
- uma Organization pode acumular historico de configuracoes para o mesmo
  provider ao longo do tempo (por exemplo, apos rotacao ou revogacao);
- no maximo uma configuracao operacional ativa por par `organization_id` +
  `provider` em um dado momento;
- configuracoes antigas ou revogadas podem permanecer preservadas para fins
  de historico e auditoria, mas nunca sao resolvidas para novas execucoes;
- nao ha exclusao fisica de configuracoes antigas quando preservar metadados
  historicos for aplicavel.

`last_validation_status` (canonico, resultado do `test_connection`):

- `valid`;
- `invalid`;
- `revoked`;
- `error`;
- `unknown`.

### AI Model Registry

Catalogo global de modelos suportados pela plataforma (ADR-0019).

Campos conceituais:

- `provider`;
- `model_key`;
- `provider_model_identifier`;
- status;
- capabilities;
- `context_window`, opcional;
- metadata;
- timestamps.

Regras:

- catalogo administrado exclusivamente por Platform Admin;
- Organizations nao criam modelos arbitrarios no catalogo;
- frontend nunca envia `model` como string arbitraria; a selecao passa por
  Provider Routing e Model Registry;
- a compatibilidade entre um modelo e uma Feature segue a secao
  "Compatibilidade Feature x Modelo".

### AI Prompt Registry

Catalogo global de prompts versionados, pertencente a plataforma (ADR-0019).

Campos conceituais:

- `prompt_key`;
- `feature_key`;
- versao;
- status;
- template;
- input schema;
- output schema;
- metadata;
- autoria;
- timestamps.

Status (canonico):

- `draft`;
- `published`;
- `archived`.

Regras:

- prompt publicado e imutavel; qualquer alteracao de conteudo cria nova
  versao;
- somente `published` pode ser usado em execucao normal;
- prompt `archived` nao inicia novas execucoes, mas permanece disponivel para
  rastreabilidade historica de execucoes que ja o utilizaram.

### AI Provider Routing Policy

Representa a rota que uma Feature usa dentro de uma Organization (ADR-0019).

Unidade: `organization_id` + `feature_key`.

Campos conceituais:

- `organization_id`;
- `feature_key`;
- `provider`;
- `model`;
- `priority`;
- `status`;
- timestamps;
- autoria.

`AI Provider Routing Policy` nao possui campo `fallback_enabled` nem qualquer
outro campo de fallback. Cada rota contem apenas `provider`, `model`,
`priority` e `status`. O controle de fallback pertence exclusivamente a
`AI Feature Catalog.fallback_allowed_on_platform` e a
`Organization AI Feature Settings.fallback_enabled` (secao "Fallback"), nunca
a rota individual.

Regras de prioridade:

- `priority` e um numero inteiro positivo;
- menor numero significa maior prioridade;
- `priority` deve ser unica dentro do mesmo par `organization_id` +
  `feature_key`;
- duas rotas ativas com a mesma prioridade, para o mesmo par, sao
  configuracao invalida e bloqueiam a execucao daquele par ate serem
  corrigidas, gerando o evento de auditoria `ai.routing_invalid_denied`
  (secao "Auditoria");
- esta SPEC nao define algoritmo de desempate.

### AI Execution

Representa uma execucao concreta de IA que chegou a acionar um provider
(ADR-0019).

Campos conceituais:

- `id`;
- `organization_id`;
- `feature_key`;
- provider;
- model;
- `prompt_key`;
- `prompt_version`;
- `credential_mode`;
- status;
- `idempotency_key`, opcional;
- `correlation_id`;
- `started_at`;
- `finished_at`;
- `duration_ms`;
- `input_tokens`;
- `output_tokens`;
- `estimated_cost`;
- `error_category`;
- timestamps.

Status (canonico):

- `pending`;
- `running`;
- `succeeded`;
- `failed`;
- `cancelled`.

`error_category` (canonico, categorias internas normalizadas):

- `authentication_error`;
- `quota_exceeded`;
- `rate_limited`;
- `timeout`;
- `provider_unavailable`;
- `network_error`;
- `invalid_response`;
- `configuration_error`;
- `policy_denied`;
- `content_blocked`;
- `unknown_error`.

Regras de `error_category`:

- as categorias sao internas e normalizadas pelo `AIGateway`/Provider
  Adapter; nunca refletem o texto de erro bruto do provider;
- a mensagem original do provider nunca e usada como categoria nem
  persistida como `error_category`;
- providers diferentes devem ser mapeados para essas categorias canonicas
  quando possivel; o mapeamento tecnico exato fica para implementacao;
- detalhes sensiveis do erro ficam fora de logs, auditoria e resposta ao
  usuario final, mesmo quando a categoria e exposta;
- toda execucao que sofrer timeout registra `error_category = timeout`
  (secao "Timeout");
- toda execucao bloqueada por rate limit de execucao registra
  `error_category = rate_limited` (secao "Rate Limit de Execucao");
- toda execucao negada pelas quatro condicoes da "Regra de execucao" ou por
  routing/provider/modelo/prompt invalidos registra
  `error_category = configuration_error` ou `error_category = policy_denied`,
  conforme a causa.

Regras gerais:

- por padrao, `AI Execution` nao armazena prompt completo nem resposta
  completa; persiste referencias, hashes quando uteis, metadados, uso e
  categorias de erro;
- conteudo de negocio derivado de uma execucao (por exemplo, um resumo)
  pertence a entidade funcional propria da Feature, nunca a `AI Execution`
  nem ao `Candidate` principal;
- status de execucao nunca e confundido com resultado de negocio.

## Regra de execucao

Nenhuma execucao de IA pode resolver credencial ou montar payload de negocio
antes de validar, nesta ordem:

1. `platform_ai_allowed = true`;
2. `organization_ai_enabled = true`;
3. `feature_available_on_platform = true` (`AI Feature Catalog`);
4. `organization_feature_enabled = true` (`Organization AI Feature
Settings`).

Somente depois dessas quatro condicoes:

5. resolver routing (`AI Provider Routing Policy` valida para o par
   Organization + Feature);
6. validar provider (`Organization AI Provider Config` com
   `status = configured`);
7. validar modelo (ativo no Model Registry, permitido para a Organization);
8. validar compatibilidade Feature x Modelo (secao "Compatibilidade Feature
   x Modelo");
9. validar prompt publicado (`prompt_key` + versao com `status = published`);
10. resolver segredo (Secret Management conceitual, nunca antes deste ponto);
11. montar payload minimizado (somente os dados necessarios para aquela
    Feature, respeitando permissao e consentimento);
12. executar o provider, sob timeout configuravel (secao "Timeout") e apos
    verificacao de rate limit de execucao (secao "Rate Limit de Execucao");
13. validar a resposta contra o schema de output esperado;
14. registrar `AI Execution` (telemetria e auditoria, incluindo
    `ai.routing_selected`);
15. retornar um DTO tipado ao modulo chamador.

No passo 5 ("resolver routing"), o algoritmo do `AIGateway` consulta
`AI Feature Catalog.fallback_allowed_on_platform` e
`Organization AI Feature Settings.fallback_enabled` para o par Organization +
Feature antes de selecionar a rota:

- se `fallback_allowed_on_platform = false` OU `fallback_enabled = false`,
  somente a rota ativa de menor `priority` (a rota primaria) e considerada;
  nenhuma outra rota e avaliada;
- se `fallback_allowed_on_platform = true` E `fallback_enabled = true`, o
  Gateway percorre as rotas ativas em ordem crescente de `priority`,
  comecando pela rota primaria, avancando para a proxima somente quando a
  rota atual falhar por um motivo elegivel a fallback (ver secao
  "Fallback").

Se qualquer uma das quatro condicoes iniciais falhar, nenhuma credencial e
resolvida, nenhum dado de negocio e enviado, e nenhuma chamada externa ocorre.

## Falha de configuracao

Se nao houver routing valido, provider valido, modelo valido, prompt
publicado ou credencial utilizavel para o par Organization + Feature, o
sistema:

- nao executa o provider;
- retorna um erro de configuracao seguro (`error_category =
configuration_error`), sem detalhe sensivel;
- mantem o fluxo humano do modulo chamador funcionando normalmente.

## Fallback

O fallback pertence a configuracao da Feature, nunca a rota individual, e
exige duas camadas de autorizacao simultaneas:

- `fallback_allowed_on_platform` em `AI Feature Catalog` — autoridade de
  Platform Admin; indica se a Feature pode, tecnicamente, usar fallback;
- `fallback_enabled` em `Organization AI Feature Settings` — autoridade de
  Owner; indica se a Organization optou por usar fallback para aquela
  Feature.

`AI Provider Routing Policy` nunca possui campo de fallback.

### Resumo consolidado

- `Organization AI Feature Settings` possui `organization_feature_enabled` e
  `fallback_enabled`;
- `AI Feature Catalog` possui `feature_available_on_platform` e
  `fallback_allowed_on_platform`;
- `AI Provider Routing Policy` possui apenas `provider`, `model`, `priority`
  e `status`; nunca possui campo de fallback.

Algoritmo:

- se `fallback_enabled = false`, somente a rota ativa de menor `priority` e
  considerada;
- se `fallback_enabled = true` e `fallback_allowed_on_platform = true`, o
  Gateway pode percorrer as proximas rotas em ordem crescente de `priority`,
  respeitando retry, compliance e demais politicas;
- se `fallback_enabled = true` mas `fallback_allowed_on_platform = false`,
  o efeito e o mesmo de `fallback_enabled = false`: somente a rota primaria
  e considerada;
- prioridade duplicada e configuracao invalida, nunca ha desempate, e
  nenhuma execucao ocorre nesse par Organization + Feature ate a
  inconsistencia ser corrigida.

### Autorizacao

Fallback entre rotas exige, simultaneamente:

- `fallback_allowed_on_platform = true` (Platform Admin, catalogo global);
- `fallback_enabled = true` em `Organization AI Feature Settings` para
  aquele par Organization + Feature (Owner).

Se qualquer um dos dois estiver `false`, fallback nao ocorre. Owner nunca
altera `fallback_allowed_on_platform`. Admin e Member nunca alteram
`fallback_enabled` nem `fallback_allowed_on_platform`.

### Algoritmo do AIGateway

- se `fallback_allowed_on_platform = false` OU `fallback_enabled = false`, o
  Gateway considera apenas a rota ativa de menor `priority` (rota primaria);
  se essa rota falhar, a execucao falha e o fluxo humano continua
  normalmente;
- se `fallback_allowed_on_platform = true` E `fallback_enabled = true`, o
  Gateway percorre as rotas ativas do par Organization + Feature em ordem
  crescente de `priority`, tentando a proxima rota somente quando a rota
  atual falhar por um motivo elegivel a fallback (ver lista abaixo).

### Revalidacao e restricoes

Antes de cada tentativa de fallback, o sistema revalida, para a rota
candidata:

- Feature Policy;
- provider permitido;
- modelo permitido e compativel;
- credencial valida;
- regiao/residencia de dados;
- compliance;
- politica da Organization.

Fallback nunca ocorre automaticamente quando a causa da falha for:

- credencial invalida;
- provider proibido;
- Feature desabilitada;
- Organization sem IA;
- erro de politica;
- configuracao invalida;
- conteudo bloqueado por politica de seguranca.

### Auditoria do fallback

Toda tentativa de fallback registra: rota primaria, motivo seguro da falha,
`fallback_enabled` e `fallback_allowed_on_platform` no momento da execucao,
rota alternativa utilizada quando houver, quantidade de tentativas e
resultado final, sem payload completo, prompt completo ou segredo. Cada rota
tentada gera um evento `ai.routing_selected` (secao "Auditoria").

## Timeout

- toda chamada externa a um provider possui timeout configuravel;
- nunca existe chamada externa sem timeout definido;
- ao atingir o timeout, o `AIGateway` aborta ou encerra a tentativa conforme
  a capacidade tecnica disponivel do provider/adapter;
- timeout gera erro normalizado (`error_category = timeout`);
- apos um timeout, retry ou fallback so podem ocorrer conforme as politicas
  ja definidas nas secoes "Retry" e "Fallback"; o timeout, por si so, nao
  autoriza retry nem fallback;
- timeout nunca bloqueia o fluxo humano obrigatorio do modulo chamador
  (secoes "Falha de configuracao" e "Fail-safe");
- toda ocorrencia de timeout e registrada em `AI Execution` (`status =
failed`, `error_category = timeout`, `duration_ms` ate o momento do
  aborto);
- nenhuma resposta bruta ou conteudo sensivel do provider e registrado em
  decorrencia de um timeout.

A politica numerica exata de timeout (duracao em milissegundos por
provider/modelo/Feature) fica para especificacao de implementacao.

## Rate Limit de Execucao

O `AIGateway` deve suportar limites de taxa de execucao por:

- Organization;
- Feature;
- provider;
- model.

Regras:

- o rate limit de execucao e verificado antes de qualquer chamada externa ao
  provider;
- quando o limite estiver excedido, o provider nao e chamado;
- o Gateway retorna um erro seguro ao modulo chamador
  (`error_category = rate_limited`);
- a ocorrencia e registrada em `AI Execution`/telemetria quando aplicavel;
- a ocorrencia gera auditoria quando relevante (secao "Auditoria");
- rate limit de execucao nunca bloqueia o fluxo humano obrigatorio do
  modulo chamador;
- a politica numerica exata (limite, janela de tempo, combinacao de
  dimensoes) fica para implementacao tecnica.

Este rate limit e independente e separado do rate limit de `test_connection`
(secao "Test Connection"), que continua com sua propria politica.

## Retry

Retry somente ocorre para erro transitorio explicitamente permitido (por
exemplo, timeout, indisponibilidade temporaria, rate limit, falha
transitoria).

Regras:

- limitado a um numero maximo de tentativas;
- usa backoff entre tentativas;
- nunca e infinito;
- compativel com idempotencia (nao pode causar cobranca ou efeito de negocio
  duplicado);
- toda tentativa e registrada em telemetria.

A politica numerica exata (limite de tentativas, intervalo de backoff) fica
para especificacao de implementacao.

### Retry e Fallback combinados

A ordem obrigatoria de uma execucao, considerando retry e fallback, e:

1. selecionar a rota primaria (menor `priority` ativa);
2. executar essa rota;
3. se a execucao falhar por um erro transitorio permitido, aplicar retry
   limitado da mesma rota, conforme a secao "Retry";
4. se a falha persistir apos o retry, verificar
   `fallback_allowed_on_platform` (`AI Feature Catalog`) e
   `fallback_enabled` (`Organization AI Feature Settings`);
5. se ambos permitirem fallback, tentar a proxima rota valida, em ordem
   crescente de `priority`, revalidando compliance conforme a secao
   "Fallback" ("Revalidacao e restricoes");
6. repetir o ciclo retry -> fallback ate: sucesso; ausencia de rotas
   candidatas; limite de tentativas atingido; ou a politica impedir
   continuidade (por exemplo, causa de falha nao elegivel a fallback,
   conforme "Fallback").

Nunca:

- retry infinito;
- fallback silencioso — toda tentativa de fallback e auditada (secao
  "Auditoria do fallback");
- pular a revalidacao de compliance de uma rota alternativa;
- ignorar o timeout configurado (secao "Timeout");
- ignorar o rate limit de execucao (secao "Rate Limit de Execucao").

## Idempotencia

Features com risco de cobranca duplicada, analise duplicada ou persistencia
de resultado duplicado devem fornecer `idempotency_key` ao acionar o
`AIGateway`.

A infraestrutura deve impedir, quando a mesma operacao idempotente for
repetida com a mesma `idempotency_key`:

- cobranca duplicada indevida;
- resultados duplicados;
- persistencia duplicada de `AI Execution` equivalente.

Esta SPEC nao define a implementacao fisica dessa protecao.

## Prompt Registry - regras de administracao

Organizations nao editam prompt oficial nesta primeira versao.

Platform Admin:

- cria `prompt_key`;
- cria e versiona conteudo/template;
- publica versao;
- arquiva versao.

Owner pode visualizar qual `prompt_key`/versao esta sendo utilizada por uma
Feature, sem editar o conteudo oficial restrito do prompt.

## Model Registry - regras de administracao

Platform Admin controla o catalogo de modelos: provider, `model_key`,
identificador fisico no provider, disponibilidade, capabilities e
compatibilidade.

Owner escolhe apenas modelos que estejam, simultaneamente:

- disponiveis (ativos no Model Registry);
- de provider utilizavel pela Organization;
- compativeis com a Feature (secao "Compatibilidade Feature x Modelo");
- permitidos para aquela Organization.

Frontend nunca envia modelo arbitrario como string livre.

## Compatibilidade Feature x Modelo

Uma Feature pode exigir capacidades como:

- structured output;
- tamanho minimo de contexto (`context_window`);
- entrada textual;
- multimodalidade futura;
- regiao;
- residencia de dados;
- requisitos de seguranca/compliance.

Regras:

- o `AIGateway` valida a compatibilidade entre a Feature e o modelo
  selecionado antes de qualquer chamada externa (passo 8 da "Regra de
  execucao");
- um modelo incompativel nunca e executado;
- o Gateway nunca chama o provider "para ver se funciona" com um modelo cuja
  compatibilidade nao foi previamente validada;
- modelo incompativel gera erro de configuracao seguro
  (`error_category = configuration_error`);
- a ocorrencia gera auditoria/telemetria apropriada;
- o fluxo humano do modulo chamador permanece disponivel.

## Custo Tecnico

Distinguem-se dois conceitos:

### Custo tecnico

Custo estimado ou informado pelo provider para uma execucao especifica. Pode
considerar:

- `input_tokens`;
- `output_tokens`;
- modelo;
- provider;
- metadados de uso adicionais, quando disponiveis.

`AI Execution.estimated_cost` registra esse valor quando disponivel.

### Preco comercial

Fica fora do escopo desta SPEC.

Custo tecnico do provider e preco comercial cobrado pelo Talent OS do cliente
nunca devem ser confundidos; esta SPEC define apenas o registro do custo
tecnico estimado.

## Criptografia

Regras:

- toda credencial permanece criptografada em repouso;
- toda comunicacao relacionada a configuracao ou uso de credenciais e
  protegida por TLS/HTTPS;
- a plataforma deve preferir envelope encryption, utilizando KMS, Secret
  Manager, Vault ou tecnologia equivalente, a implementacao propria;
- o Talent OS nunca implementa criptografia propria (proprietaria) para
  proteger credenciais;
- nenhuma chave mestra de criptografia fica armazenada:
  - no codigo-fonte;
  - no banco principal;
  - em arquivos da aplicacao;
- `secret_reference` referencia o segredo armazenado externamente; o
  segredo nunca e persistido em texto puro no banco principal;
- a descriptografia do segredo ocorre somente durante uma execucao
  autorizada, nunca antes das quatro condicoes da "Regra de execucao" e da
  validacao de `Organization AI Provider Config`;
- o tempo de vida do segredo em memoria do processo e minimizado ao
  estritamente necessario para a operacao em curso;
- nenhuma rotina de auditoria, log ou tracing registra material
  criptografico (segredo, chave, token ou qualquer derivado que permita
  reconstrucao).

## Mascaramento de Credenciais

Regras:

- o frontend nunca recebe o segredo completo, em nenhuma circunstancia,
  inclusive apos o momento do cadastro inicial;
- o backend e o unico responsavel por calcular o mascaramento;
- a regra de mascaramento e centralizada em um unico ponto do backend,
  aplicada de forma uniforme a todos os providers;
- o mascaramento nunca revela:
  - prefixo suficiente para identificar o segredo;
  - quantidade exata de caracteres da credencial original;
  - qualquer conteudo parcial que permita reconstrucao ou inferencia do
    segredo;
- a interface (UI) recebe apenas o identificador ja mascarado
  (`masked_identifier`), calculado pelo backend;
- nenhuma API administrativa retorna o segredo completo, em nenhuma
  operacao (cadastro, consulta, teste de conexao, rotacao ou revogacao).

## BYOK

Owner pode:

- selecionar provider;
- escolher `customer_managed`;
- inserir credencial;
- validar credencial (`test_connection`);
- substituir credencial;
- revogar credencial.

Regras de segredo:

- enviado somente por HTTPS;
- nunca salvo em texto puro no banco principal;
- nunca retornado completo em nenhuma resposta de API;
- nunca logado;
- nunca auditado (nenhum evento de auditoria contem o segredo);
- nunca armazenado em `localStorage` ou qualquer storage de cliente.

O banco principal guarda somente `secret_reference` e os metadados
conceituais listados em `Organization AI Provider Config`.

## Platform Managed

Platform Admin administra as credenciais `platform_managed` da plataforma.

Regras:

- a Organization nunca visualiza o segredo de uma credencial
  `platform_managed`;
- todo consumo realizado com credencial `platform_managed` continua
  associado e mensuravel pela Organization que originou a chamada;
- a plataforma deve preferir segmentacao de credenciais `platform_managed`
  para reduzir blast radius, evitando uma unica chave global compartilhada
  quando o provider permitir isolamento melhor. A segmentacao fisica exata
  fica para implementacao.

## Test Connection

Regras por role:

- Owner pode executar teste real para configuracao `customer_managed`
  (BYOK), resolvendo o segredo somente no backend;
- Platform Admin pode testar apenas configuracoes `platform_managed`, nunca
  credencial `customer_managed` de uma Organization;
- Admin apenas consulta status, `last_validated_at` e
  `last_validation_status`; Admin nao dispara teste real nesta primeira
  versao;
- Member nao possui acesso a esta operacao.

Regras gerais:

- rate limit obrigatorio por Organization, provider e ator, proprio e
  separado do rate limit de execucao (secao "Rate Limit de Execucao");
- o teste realiza apenas a chamada minima necessaria para validar a
  credencial;
- o teste nunca envia dados de `Candidate`, `Interview` ou qualquer conteudo
  de negocio;
- tentativas excessivas sao recusadas e auditadas de forma segura, sem
  registrar segredo.

## Rotacao

A rotacao de uma credencial deve:

- validar a nova credencial (`test_connection`) antes da troca;
- preservar a configuracao antiga ativa se a nova falhar na validacao, sem
  troca parcial;
- trocar a referencia (`secret_reference`) atomicamente quando a nova for
  validada;
- usar transacao e bloqueio de linha (por exemplo, `SELECT ... FOR UPDATE`
  ou mecanismo equivalente) durante a operacao;
- impedir rotacao concorrente da mesma configuracao;
- impedir rotacao concorrendo com revogacao da mesma configuracao sem
  resolucao segura;
- garantir que, ao final, somente uma referencia fique ativa;
- gerar auditoria.

## Permissoes

### Platform Admin

Administra:

- disponibilidade global de IA (`platform_ai_allowed` por Organization);
- `AI Feature Catalog`, incluindo `feature_available_on_platform` e
  `fallback_allowed_on_platform` por Feature;
- `AI Provider Catalog`;
- `AI Model Registry`;
- `AI Prompt Registry`;
- restricoes globais de modelos/providers;
- credenciais `platform_managed`;
- politicas globais de fallback/routing (por exemplo, rota padrao futura);
- consulta de auditoria e telemetria administrativa.

Platform Admin nao:

- atua funcionalmente dentro da Organization;
- habilita automaticamente uma Feature para uma Organization;
- forca uma Organization a usar IA;
- acessa credencial `customer_managed` completa;
- altera resultados funcionais de IA ja produzidos;
- recebe role funcional dentro da Organization (consistente com ADR-0003,
  ADR-0013, ADR-0014).

### Owner

Administra, dentro da propria Organization:

- `organization_ai_enabled`;
- Feature toggles
  (`Organization AI Feature Settings.organization_feature_enabled`);
- provider configs BYOK (`customer_managed`);
- routing (`AI Provider Routing Policy` da propria Organization, contendo
  apenas `provider`, `model`, `priority` e `status` por rota);
- modelo permitido, entre os disponibilizados pela plataforma;
- prioridade de routing;
- `fallback_enabled` em `Organization AI Feature Settings`, cujo efeito
  pratico depende de `fallback_allowed_on_platform = true`.

Owner nao pode:

- criar provider no catalogo global;
- criar modelo arbitrario;
- publicar no `AI Prompt Registry` global;
- alterar o conteudo de um prompt oficial publicado;
- utilizar provider ou modelo bloqueado pela plataforma;
- alterar `feature_available_on_platform` ou `fallback_allowed_on_platform`.

### Admin

Somente visualizacao administrativa permitida: routing configurado, provider
selecionado, modelo selecionado, status, `prompt_key`/versao utilizados
(quando isso nao expuser conteudo restrito) e telemetria operacional
permitida.

Admin nao altera IA nesta primeira versao, incluindo `organization_ai_enabled`,
`organization_feature_enabled`, `fallback_enabled` e qualquer campo do
`AI Feature Catalog`.

### Member

Sem acesso administrativo a configuracao de IA, routing, Model Registry ou
Prompt Registry.

Member pode apenas utilizar funcionalidades de IA quando a Feature funcional
especifica permitir, dentro do modulo de negocio correspondente.

## Seguranca

Exigir:

- isolamento por Organization em toda leitura e gravacao;
- SQL parametrizado na implementacao futura;
- autorizacao server-side em toda operacao;
- protecao contra mass assignment;
- nenhum segredo exposto ao frontend apos o cadastro;
- nenhum segredo em logs;
- nenhum segredo em tracing;
- nenhum segredo em metricas;
- sanitizacao de erro retornado pelo provider, sempre mapeada para uma das
  categorias canonicas de `error_category` (secao "AI Execution"), nunca
  usando texto bruto do provider como categoria ou mensagem;
- conteudo de `Candidate`/`Interview` tratado como nao confiavel ao ser
  incorporado a um prompt (nunca altera instrucoes de sistema);
- nenhum acesso direto do modelo ao banco de dados;
- nenhum codigo retornado pela IA e executado;
- nenhum tool/function calling irrestrito nesta fase;
- nenhum modulo de negocio importa SDK ou client concreto de provider de IA
  (secao "AI Gateway - centralizacao obrigatoria").

## Telemetria

Registrar, por execucao:

- Organization;
- Feature;
- provider;
- model;
- prompt/version;
- duracao;
- tokens;
- status;
- custo tecnico estimado (`estimated_cost`, secao "Custo Tecnico");
- `error_category` normalizado.

Nao armazenar payload completo por padrao. Esta telemetria deve permitir, no
futuro, dashboards, quotas, billing, alertas e capacity planning, sem exigir
nova decisao arquitetural.

## Auditoria

Incluir eventos para:

- IA liberada/bloqueada pela plataforma (`platform_ai_allowed`);
- IA habilitada/desabilitada pela Organization (`organization_ai_enabled`),
  incluindo o caso em que o valor permanece armazenado, porem inerte, apos
  bloqueio de plataforma;
- Feature disponibilizada/retirada da plataforma
  (`feature_available_on_platform`);
- Feature habilitada/desabilitada pela Organization
  (`organization_feature_enabled`);
- `fallback_allowed_on_platform` alterado em `AI Feature Catalog`;
- `fallback_enabled` alterado em `Organization AI Feature Settings`;
- provider configurado;
- `credential_mode` alterado;
- credencial cadastrada/rotacionada/revogada;
- `test_connection` executado, com sucesso ou falha;
- rate limit de `test_connection` atingido;
- Model habilitado/desabilitado no Model Registry;
- Prompt publicado/arquivado;
- routing criado/alterado/desabilitado;
- prioridade de routing alterada;
- `ai.routing_selected`: rota efetivamente utilizada em uma execucao,
  registrando somente Organization, Feature, routing ID/referencia,
  provider, model, priority, execution ID e metadados seguros;
- `ai.routing_invalid_denied`: configuracao de routing invalida recusada,
  usada por exemplo para prioridade duplicada, provider inexistente, model
  inexistente, rota incompativel ou configuracao ambigua;
- fallback utilizado (rota primaria, motivo, `fallback_enabled` e
  `fallback_allowed_on_platform` no momento, rota alternativa, tentativas,
  resultado);
- execucao solicitada;
- execucao negada por politica;
- execucao concluida;
- execucao falhou (incluindo timeout e rate limit de execucao);
- rate limit de execucao atingido;
- tentativa de operacao sem permissao;
- tentativa concorrente rejeitada (rotacao/revogacao).

Nunca registrar segredo, credencial, header `Authorization`, prompt completo
contendo PII, resposta completa contendo PII, payload completo, ou conteudo
de negocio completo.

## API conceitual

Esta SPEC nao define URLs finais.

### Platform

- administrar `AI Feature Catalog`, incluindo
  `feature_available_on_platform` e `fallback_allowed_on_platform`;
- administrar `AI Provider Catalog`;
- administrar `AI Model Registry`;
- administrar `AI Prompt Registry`;
- administrar disponibilidade de IA por Organization
  (`platform_ai_allowed`);
- administrar credenciais `platform_managed`;
- consultar telemetria e auditoria administrativa.

### Organization

- consultar configuracao de IA da Organization;
- habilitar/desabilitar IA da Organization (`organization_ai_enabled`);
- consultar Feature Policies disponiveis (`feature_available_on_platform`);
- habilitar/desabilitar Feature (`organization_feature_enabled` em
  `Organization AI Feature Settings`);
- listar providers disponiveis;
- configurar BYOK (inserir credencial `customer_managed`);
- substituir/revogar credencial BYOK;
- consultar/testar status de credencial (`test_connection`);
- configurar routing (`AI Provider Routing Policy`: `provider`, `model`,
  `priority`, `status` por rota);
- configurar modelo permitido;
- configurar fallback (`fallback_enabled` em `Organization AI Feature
Settings`; `fallback_allowed_on_platform` e somente consultado, nunca
  alterado pela Organization);
- consultar uso/telemetria permitida para a Organization.

## Interface minima

Prever painel `Configuracoes > Inteligencia Artificial`, exibindo:

- IA permitida pela plataforma (`platform_ai_allowed`);
- IA habilitada pela Organization (`organization_ai_enabled`);
- Features disponiveis (`feature_available_on_platform`);
- Features habilitadas (`organization_feature_enabled`);
- providers configurados;
- modo da credencial;
- status da credencial;
- identificador mascarado;
- data/resultado da ultima validacao;
- routing configurado (`provider`, `model`, `priority`, `status` por rota);
- modelo selecionado;
- se a plataforma permite fallback para a Feature
  (`fallback_allowed_on_platform`, somente leitura para Owner/Admin);
- estado do fallback definido pela Organization (`fallback_enabled`);
- uso basico (telemetria permitida).

Owner administra o painel, exceto os campos de leitura controlados pela
plataforma. Admin somente visualiza. Member nao acessa. Platform Admin
possui console separado, fora deste painel de Organization.

## Banco conceitual

Estruturas equivalentes a:

- `organization_ai_settings`;
- `ai_feature_catalog`;
- `organization_ai_feature_settings`;
- `ai_provider_catalog`;
- `organization_ai_provider_configs`;
- `ai_model_registry`;
- `ai_prompt_registry`;
- `ai_provider_routing_policies`;
- `ai_executions`.

Regras conceituais:

- `organization_id` obrigatorio em toda tabela de escopo de Organization;
- `ai_feature_catalog` possui `feature_available_on_platform` e
  `fallback_allowed_on_platform`, ambos controlados exclusivamente por
  Platform Admin;
- unicidade de `organization_id` + `feature_key` em
  `organization_ai_feature_settings`, incluindo as colunas
  `organization_feature_enabled` e `fallback_enabled` dessa tabela;
- unicidade de `organization_id` + `provider` em
  `organization_ai_provider_configs` para configuracao ativa; configuracoes
  historicas (revogadas/substituidas) podem coexistir como registros
  inativos, nunca resolvidos em novas execucoes;
- unicidade de `priority` dentro de `organization_id` + `feature_key` em
  `ai_provider_routing_policies`;
- `ai_provider_routing_policies` nunca possui coluna de fallback; cada linha
  contem somente `organization_id`, `feature_key`, `provider`, `model`,
  `priority` e `status`. O controle de fallback vive exclusivamente em
  `ai_feature_catalog.fallback_allowed_on_platform` e
  `organization_ai_feature_settings.fallback_enabled`;
- unicidade de `prompt_key` + versao em `ai_prompt_registry`;
- unicidade de `provider` + `model_key` em `ai_model_registry`;
- `ai_executions.error_category` restrito aos valores canonicos definidos na
  secao "AI Execution", validado por constraint quando possivel;
- estados canonicos validados por constraint quando possivel
  (`credential_mode`, `status` de provider config, `status` de prompt,
  `status` de execucao, `error_category`);
- prompts `published` sao imutaveis em conteudo; nova versao nunca
  sobrescreve versao existente;
- ausencia de cascade destrutivo que apague `ai_executions`,
  `ai_prompt_registry` ou historico de auditoria ao remover provider, modelo
  ou routing;
- ausencia de exclusao fisica de `ai_executions`, versoes de prompt,
  configuracoes historicas de provider e eventos de auditoria;
- locks (`SELECT ... FOR UPDATE` ou equivalente) para rotacao, revogacao e
  mudanca de `credential_mode` concorrentes.

Esta SPEC nao define SQL.

## Desenvolvimento e Testes

Regras:

- testes unitarios usam mocks/fakes de Provider Adapter, nunca o adapter
  real de nenhum provider;
- testes comuns (unitarios e da suite padrao) nunca dependem de um provider
  real disponivel;
- testes de integracao reais, quando existirem, usam ambiente dedicado e
  controlado, nunca credenciais de cliente;
- o pipeline de CI nunca depende de OpenAI, Anthropic, Gemini, Azure OpenAI,
  Ollama ou qualquer outro provider externo para passar;
- respostas simuladas em teste sao deterministicas;
- testes de retry, fallback e timeout usam adapters simulados capazes de
  forcar as condicoes de erro necessarias (timeout, indisponibilidade, rate
  limit, falha transitoria) sem depender de rede real;
- testes de seguranca nunca usam segredos reais de nenhum provider ou
  cliente;
- nenhuma suite de teste obrigatoria depende de acesso a internet.

## Criterios de aceite

1. Nenhuma execucao ocorre quando `platform_ai_allowed = false`.
2. Nenhuma execucao ocorre quando `organization_ai_enabled = false`.
3. Nenhuma execucao ocorre quando `feature_available_on_platform = false`.
4. Nenhuma execucao ocorre quando `organization_feature_enabled = false`.
5. Nenhuma credencial e resolvida antes das quatro condicoes da "Regra de
   execucao" serem satisfeitas.
6. Toda nova Organization inicia com `platform_ai_allowed = false` e
   `organization_ai_enabled = false`.
7. Owner habilita/desabilita `organization_ai_enabled` somente quando
   `platform_ai_allowed = true`.
8. Owner habilita/desabilita `organization_feature_enabled` apenas quando
   `feature_available_on_platform = true`.
9. Quando `platform_ai_allowed` transiciona para `false`,
   `organization_ai_enabled` permanece armazenado sem alteracao automatica.
10. Enquanto `platform_ai_allowed = false`, `organization_ai_enabled` fica
    inerte e nenhuma execucao ocorre, mesmo que seu valor armazenado seja
    `true`.
11. Quando `platform_ai_allowed` volta para `true`, a preferencia anterior
    de `organization_ai_enabled` volta a ter efeito sem nova acao do Owner.
12. Owner nao consegue sobrepor `platform_ai_allowed = false` alterando
    `organization_ai_enabled`.
13. Admin nao altera nenhuma configuracao de IA nesta versao.
14. Member nao acessa configuracao administrativa de IA.
15. Segredo de credencial BYOK nunca e retornado em resposta de API.
16. Segredo de credencial BYOK nunca aparece em evento de auditoria.
17. Segredo de credencial de uma Organization nunca e resolvido para outra
    Organization.
18. `secret_reference` e o unico vinculo com o segredo armazenado no banco
    principal.
19. No maximo uma configuracao operacional ativa por par `organization_id` +
    `provider` em `organization_ai_provider_configs`.
20. Configuracoes antigas/revogadas de provider permanecem preservadas para
    historico, mas nunca sao resolvidas em novas execucoes.
21. Rotacao com nova credencial invalida preserva a configuracao anterior
    ativa.
22. Rotacao concorrente da mesma configuracao e bloqueada com sucesso.
23. Revogacao concorrendo com rotacao da mesma configuracao e resolvida com
    seguranca, sem estado parcialmente trocado.
24. `test_connection` nunca envia dado de `Candidate` ou `Interview`.
25. `test_connection` respeita rate limit proprio por Organization/provider/
    ator, separado do rate limit de execucao.
26. Routing ausente para um par Organization + Feature bloqueia execucao com
    erro seguro.
27. Prioridade duplicada dentro do mesmo par Organization + Feature bloqueia
    execucao, sem desempate, e gera o evento `ai.routing_invalid_denied`.
28. Provider com `status` diferente de `configured` bloqueia execucao.
29. Modelo inativo ou nao permitido bloqueia execucao.
30. Modelo incompativel com a Feature e recusado antes de qualquer chamada
    ao provider, sem tentativa de "ver se funciona".
31. Prompt `draft` nunca e usado em execucao normal.
32. Prompt `archived` nunca inicia nova execucao, mas permanece referenciavel
    em execucoes historicas.
33. Toda execucao registra exatamente o `prompt_key`/`prompt_version`
    resolvidos no inicio da execucao.
34. Publicar nova versao de prompt nunca reinterpreta execucoes ja
    concluidas.
35. Fallback nunca ocorre quando `fallback_allowed_on_platform = false`,
    mesmo com `fallback_enabled = true`.
36. Fallback nunca ocorre quando `fallback_enabled = false`, mesmo com
    `fallback_allowed_on_platform = true`.
37. Fallback ocorre somente quando `fallback_allowed_on_platform = true` E
    `fallback_enabled = true` simultaneamente.
38. Fallback nunca ocorre para credencial invalida, Feature desabilitada,
    Organization sem IA, erro de politica, configuracao invalida ou conteudo
    bloqueado, mesmo com as duas autorizacoes de fallback concedidas.
39. Fallback revalida compliance da rota alternativa antes de qualquer
    tentativa.
40. Quando fallback nao esta autorizado, apenas a rota ativa de menor
    `priority` e considerada.
41. `AI Provider Routing Policy` nunca possui campo de fallback; cada rota
    contem somente `provider`, `model`, `priority` e `status`.
42. `ai.routing_selected` e auditado para cada rota efetivamente utilizada
    em uma execucao.
43. `ai.routing_invalid_denied` e auditado para configuracao de routing
    invalida (prioridade duplicada, provider inexistente, model inexistente,
    rota incompativel ou configuracao ambigua).
44. Toda chamada externa ao provider possui timeout configuravel.
45. Timeout gera `error_category = timeout` e nunca bloqueia o fluxo humano
    obrigatorio.
46. Rate limit de execucao e verificado antes de qualquer chamada externa ao
    provider.
47. Rate limit de execucao excedido impede a chamada ao provider, retorna
    erro seguro e nunca bloqueia o fluxo humano obrigatorio.
48. `AI Execution.error_category` usa somente os valores canonicos
    definidos nesta SPEC.
49. Erro bruto do provider nunca e usado como `error_category` nem
    retornado ao usuario final.
50. Retry nunca e infinito e respeita limite maximo configurado.
51. `AI Execution` e registrada para toda chamada que chega a acionar um
    provider.
52. `AI Execution` nao armazena prompt completo nem resposta completa por
    padrao.
53. Tokens e custo tecnico estimado (`estimated_cost`) sao registrados
    quando disponiveis, sem se confundir com preco comercial.
54. Modelo incompativel com a Feature (structured output, context window,
    regiao etc.) e recusado antes de qualquer chamada ao provider.
55. Isolamento multiempresa e garantido em toda tabela e em toda resolucao
    de credencial, routing, prompt e execucao.
56. Mass assignment de `organization_id`, autoria, timestamps e status e
    bloqueado fora das operacoes proprias.
57. Toda alteracao critica de configuracao ou execucao gera auditoria.
58. Dados persistem apos reinicializacao da aplicacao futura.
59. Remover provider ou modelo do catalogo nao apaga `AI Execution`
    anteriores nem altera resultados historicos.
60. Nenhum modulo de negocio importa SDK ou client concreto de provider;
    toda execucao passa pelo `AIGateway`.
61. A ausencia, desabilitacao ou falha de IA nunca impede a criacao ou
    operacao normal de `Candidate`, `Job Opening`, `CandidateApplication`,
    `Interview` ou qualquer outro fluxo existente.
62. Toda credencial permanece criptografada em repouso.
63. Toda comunicacao relacionada a credenciais e protegida por TLS/HTTPS.
64. Nenhuma chave mestra de criptografia fica armazenada no codigo-fonte, no
    banco principal ou em arquivos da aplicacao.
65. O segredo nunca e persistido em texto puro no banco principal;
    `secret_reference` e o unico vinculo com o segredo real.
66. A descriptografia do segredo ocorre somente durante uma execucao
    autorizada, nunca antes das validacoes de politica.
67. Nenhuma rotina de auditoria, log ou tracing registra material
    criptografico.
68. O frontend nunca recebe o segredo completo, em nenhuma operacao,
    inclusive apos o cadastro inicial.
69. O mascaramento e calculado exclusivamente no backend, por regra
    centralizada e uniforme entre providers.
70. O mascaramento nunca revela prefixo suficiente, quantidade exata de
    caracteres, ou conteudo parcial que permita reconstrucao do segredo.
71. Nenhuma API administrativa retorna o segredo completo, em nenhuma
    operacao.
72. Testes unitarios usam mocks/fakes de Provider Adapter, nunca o adapter
    real.
73. Nenhum teste obrigatorio depende de provider real disponivel ou de
    acesso a internet.
74. CI nunca depende de OpenAI, Anthropic, Gemini, Azure OpenAI, Ollama ou
    qualquer outro provider externo para passar.
75. Testes de seguranca nunca usam segredos reais de provider ou de
    cliente.
76. A ordem retry -> fallback e respeitada: retry limitado da rota primaria
    ocorre antes de qualquer tentativa de fallback.
77. Fallback so e tentado apos a rota primaria falhar e o retry (quando
    aplicavel) se esgotar, e somente quando `fallback_allowed_on_platform`
    e `fallback_enabled` permitirem simultaneamente.
78. O ciclo retry/fallback termina em sucesso, ausencia de rotas
    candidatas, limite de tentativas, ou politica impedindo continuidade,
    nunca em retry infinito ou fallback silencioso.

## Testes obrigatorios

1. Bloquear execucao quando `platform_ai_allowed = false`.
2. Bloquear execucao quando `organization_ai_enabled = false`.
3. Bloquear execucao quando `feature_available_on_platform = false`.
4. Bloquear execucao quando `organization_feature_enabled = false`.
5. Garantir que nenhuma credencial e resolvida em nenhum dos quatro cenarios
   anteriores.
6. Verificar que `platform_ai_allowed = false` preserva o valor armazenado
   de `organization_ai_enabled` sem altera-lo automaticamente.
7. Verificar que a reativacao de `platform_ai_allowed` para `true` restaura
   o efeito da preferencia anterior de `organization_ai_enabled` sem nova
   acao do Owner.
8. Permitir Owner habilitando IA da Organization quando a plataforma
   permitir.
9. Bloquear Admin tentando alterar configuracao de IA.
10. Bloquear Member tentando acessar configuracao administrativa de IA.
11. Validar credencial BYOK valida com sucesso.
12. Rejeitar credencial BYOK invalida.
13. Garantir que o segredo nunca e retornado em nenhuma resposta de API.
14. Garantir que o segredo nunca aparece em nenhum evento de auditoria.
15. Bloquear resolucao de segredo de uma Organization para outra
    Organization.
16. Garantir isolamento de `Organization AI Provider Config` por
    Organization.
17. Garantir que apenas uma configuracao de provider fica operacionalmente
    ativa por Organization + provider.
18. Garantir que uma configuracao de provider historica (revogada ou
    substituida) nunca e usada em execucao nova.
19. Validar rotacao de credencial com sucesso.
20. Garantir que rotacao com credencial invalida preserva a configuracao
    anterior.
21. Bloquear rotacao concorrente da mesma configuracao.
22. Bloquear revogacao concorrendo com rotacao da mesma configuracao.
23. Executar `test_connection` com sucesso e atualizar
    `last_validated_at`/`last_validation_status`.
24. Bloquear excesso de chamadas a `test_connection` pelo rate limit proprio
    de `test_connection`.
25. Executar com routing valido para Organization + Feature.
26. Bloquear execucao com routing ausente.
27. Bloquear execucao com prioridade duplicada no mesmo par Organization +
    Feature, sem desempate.
28. Auditar prioridade duplicada como `ai.routing_invalid_denied`.
29. Bloquear execucao com provider invalido ou nao `configured`.
30. Bloquear execucao com modelo invalido ou indisponivel.
31. Bloquear execucao com modelo incompativel com a Feature antes de
    qualquer chamada ao provider.
32. Bloquear execucao com prompt em `draft`.
33. Bloquear execucao com prompt `archived`.
34. Executar com prompt `published`.
35. Garantir que a versao de prompt resolvida no inicio da execucao e
    preservada mesmo se uma nova versao for publicada durante a execucao.
36. Bloquear fallback quando `fallback_allowed_on_platform = false`, mesmo
    com `fallback_enabled = true`.
37. Bloquear fallback quando `fallback_enabled = false`, mesmo com
    `fallback_allowed_on_platform = true`.
38. Permitir fallback somente quando `fallback_allowed_on_platform = true`
    E `fallback_enabled = true` simultaneamente.
39. Executar apenas a rota primaria (menor `priority`) quando fallback nao
    estiver autorizado, falhando a execucao se essa rota falhar.
40. Percorrer as rotas em ordem crescente de `priority` quando fallback
    estiver autorizado por ambas as camadas.
41. Bloquear fallback quando a causa da falha for compliance, credencial
    invalida, Feature desabilitada, Organization sem IA, erro de politica ou
    configuracao invalida, mesmo com fallback autorizado.
42. Auditar `ai.routing_selected` para a rota efetivamente utilizada em uma
    execucao.
43. Auditar `ai.routing_invalid_denied` para provider inexistente, model
    inexistente, rota incompativel ou configuracao ambigua.
44. Aplicar timeout configuravel em toda chamada externa ao provider, sem
    chamada infinita.
45. Gerar `error_category = timeout` quando o timeout for atingido.
46. Verificar rate limit de execucao antes de qualquer chamada ao provider.
47. Bloquear execucao quando o rate limit de execucao for excedido, isolado
    por Organization/Feature/provider/modelo.
48. Gerar `error_category = authentication_error` para falha de autenticacao
    do provider.
49. Gerar `error_category = quota_exceeded` para quota excedida do provider.
50. Gerar `error_category = rate_limited` para rate limit do proprio
    provider.
51. Gerar `error_category = provider_unavailable` para indisponibilidade do
    provider.
52. Gerar `error_category = network_error` para erro de rede.
53. Gerar `error_category = invalid_response` para resposta incompativel
    com o schema esperado.
54. Gerar `error_category = configuration_error` para configuracao invalida
    (routing, provider, modelo).
55. Gerar `error_category = policy_denied` para negacao pelas quatro
    condicoes de autorizacao.
56. Gerar `error_category = content_blocked` para conteudo bloqueado por
    politica de seguranca.
57. Gerar `error_category = unknown_error` para erro nao mapeado a nenhuma
    categoria conhecida.
58. Aplicar retry limitado apenas para erro transitorio permitido, nunca
    infinito.
59. Registrar `AI Execution` para toda chamada que aciona um provider.
60. Registrar tokens e custo tecnico estimado (`estimated_cost`) quando
    disponiveis na resposta do provider.
61. Garantir que o payload completo do prompt e da resposta nao e
    persistido por padrao.
62. Garantir que erro do provider e sempre sanitizado e mapeado para uma
    categoria canonica antes de qualquer exposicao ou log.
63. Garantir isolamento multiempresa em configuracao, routing, credencial,
    prompt, modelo e execucao.
64. Bloquear mass assignment de campos internos (`organization_id`, autoria,
    timestamps, status) fora das operacoes proprias.
65. Garantir que eventos de auditoria obrigatorios sao registrados para
    cada operacao critica, incluindo `ai.routing_selected` e
    `ai.routing_invalid_denied`.
66. Garantir persistencia de configuracao e execucoes apos recriar a
    aplicacao.
67. Garantir que falha de IA (qualquer camada, incluindo timeout e rate
    limit) nao bloqueia o fluxo humano do modulo chamador.
68. Garantir que `Candidate`, `Job Opening`, `CandidateApplication`,
    `Interview` e demais fluxos continuam operando integralmente com IA
    indisponivel, desabilitada ou falhando.
69. Garantir que nenhum modulo de negocio (`InterviewService`, futura
    Avaliacao Assistida, Matching, Onboarding, Desenvolvimento) chama um
    provider de IA diretamente, sempre passando pelo `AIGateway`.
70. Garantir que `AI Provider Routing Policy` nao possui campo de fallback
    (validado por schema/constraint), contendo somente `provider`, `model`,
    `priority` e `status`.
71. Garantir que alterar `fallback_enabled` em `Organization AI Feature
Settings` afeta somente aquele par Organization + Feature, sem impactar
    outras Features ou outras Organizations.
72. Garantir que Owner nunca altera `fallback_allowed_on_platform` nem
    `feature_available_on_platform`.
73. Garantir que Admin e Member nunca alteram `fallback_enabled`,
    `fallback_allowed_on_platform`, `organization_feature_enabled` ou
    `organization_ai_enabled`.
74. Garantir que o banco principal nunca contem o segredo em texto puro,
    apenas `secret_reference` (verificacao de que a credencial permanece
    criptografada em repouso no Secret Management conceitual).
75. Bloquear configuracao de credencial fora de conexao TLS/HTTPS.
76. Garantir que nenhuma chave mestra de criptografia aparece em
    codigo-fonte, banco principal ou arquivos de configuracao versionados.
77. Garantir que a descriptografia do segredo so ocorre apos as quatro
    condicoes da "Regra de execucao" serem satisfeitas.
78. Garantir que logs, auditoria e tracing nunca contem material
    criptografico (segredo, chave, token).
79. Garantir que a resposta de cadastro de credencial nunca contem o
    segredo completo, apenas o identificador mascarado.
80. Garantir que o mascaramento e identico para credenciais de providers
    diferentes, seguindo a mesma regra centralizada.
81. Garantir que o mascaramento nunca expoe caracteres suficientes para
    reconstrucao do segredo original.
82. Garantir que nenhuma API administrativa (Owner, Admin, Platform Admin)
    retorna o segredo completo em nenhuma operacao.
83. Executar a suite de testes unitarios usando apenas mocks/fakes de
    Provider Adapter.
84. Garantir que a suite de testes obrigatoria passa sem acesso a internet
    ou a provider real.
85. Simular timeout, indisponibilidade, rate limit e falha transitoria via
    adapter simulado para testar retry e fallback.
86. Garantir que testes de seguranca nao utilizam segredo real de nenhum
    provider ou cliente.
87. Garantir que a rota primaria e retentada (retry limitado) antes de
    qualquer tentativa de fallback.
88. Garantir que fallback so e avaliado apos a falha persistir mesmo com
    retry aplicado.
89. Bloquear fallback quando `fallback_allowed_on_platform` ou
    `fallback_enabled` estiver `false`, mesmo apos falha da rota primaria.
90. Garantir que o ciclo retry/fallback termina corretamente em sucesso,
    ausencia de rotas, limite de tentativas, ou politica impedindo
    continuidade.
91. Garantir que o ciclo retry/fallback nunca ignora o timeout configurado
    nem o rate limit de execucao.

## Limitacoes

- Sem avaliacao de candidato por IA.
- Sem matching.
- Sem ranking.
- Sem entrevistas conduzidas por IA.
- Sem onboarding assistido por IA.
- Sem desenvolvimento assistido por IA.
- Sem decisao automatica.
- Sem provider padrao comercial definido.
- Sem preco comercial definido.
- Sem escolha de produto/fornecedor especifico de Secret Manager.
- Sem implementacao de adapters de provider concretos.
- Sem algoritmo de desempate de prioridade de routing.
- Sem mapeamento fisico exato de erros por provider (fica para
  implementacao do Provider Adapter).
- Sem politica numerica final de rate limit (test_connection e execucao),
  timeout, retry ou idempotencia.
- Sem interface de usuario final desenhada (apenas painel minimo descrito
  conceitualmente).

## Definicao de concluido

Esta fase sera considerada concluida quando:

- a configuracao de IA por Organization seguir as duas camadas da ADR-0016,
  incluindo o comportamento inerte de `organization_ai_enabled` quando a
  plataforma bloquear IA;
- Feature Policies seguirem o modelo de catalogo de plataforma
  (`feature_available_on_platform`) + toggle de Organization
  (`organization_feature_enabled`) da ADR-0017, com nomes de campo
  identicos aos definidos nas ADRs;
- credenciais seguirem os tres modos, o secret management conceitual e as
  regras de auditoria/rotacao/revogacao/concorrencia da ADR-0018, incluindo
  no maximo uma configuracao ativa por Organization + provider;
- o `AIGateway`, Provider Routing, Model Registry, Prompt Registry e
  `AI Execution` seguirem a ADR-0019, incluindo a ordem obrigatoria de
  autorizacao, o modelo de fallback com as duas camadas
  (`fallback_allowed_on_platform` + `fallback_enabled`), timeout e rate
  limit de execucao;
- todas as permissoes por role (Platform Admin, Owner, Admin, Member)
  estiverem implementadas conforme esta SPEC;
- toda operacao critica validar no servidor e gerar auditoria adequada,
  incluindo `ai.routing_selected` e `ai.routing_invalid_denied`;
- nenhum segredo trafegar para frontend, log, tracing, metrica ou auditoria;
- `error_category` usar exclusivamente os valores canonicos definidos nesta
  SPEC;
- fail-safe garantir que indisponibilidade, desabilitacao ou falha de IA
  nunca bloqueie fluxo humano obrigatorio, e que nenhum fluxo existente
  dependa de `AI Execution` bem-sucedida para continuar;
- nenhum modulo de negocio chamar provider de IA diretamente;
- os testes obrigatorios listados nesta SPEC estiverem implementados e
  aprovados em fase futura de implementacao;
- a documentacao permanecer consistente com as ADR-0016 a ADR-0019.
