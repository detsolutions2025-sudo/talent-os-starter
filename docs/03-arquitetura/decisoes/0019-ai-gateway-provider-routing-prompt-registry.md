# ADR 0019 - AI Gateway, Provider Routing, Prompt Registry e Telemetria

## Status

Aceita.

## Contexto

As ADRs 0016, 0017 e 0018 definiram, em camadas sucessivas, que IA e uma
capacidade opcional do Talent OS (`platform_ai_allowed`,
`organization_ai_enabled`), que cada funcionalidade de IA possui uma politica
propria pertencente ao catalogo da plataforma (`feature_available_on_platform`,
`organization_feature_enabled`) e como credenciais de provider sao
configuradas, protegidas, testadas, rotacionadas e auditadas por Organization
(`organization_ai_provider_configs`). Nenhuma dessas ADRs define, porem, como
uma chamada de IA efetivamente acontece: quem monta a requisicao, quem escolhe
provider e modelo, quem resolve o prompt, quem valida a resposta e quem
registra o que aconteceu.

Sem essa peca, modulos de negocio futuros (Entrevistas, Avaliacao Assistida,
Matching, Onboarding, Desenvolvimento) teriam caminho aberto para chamar um
provider de IA diretamente, duplicando logica de autorizacao, credencial,
prompt e telemetria em cada modulo, e arriscando violar as regras ja
estabelecidas.

A `CONSTITUICAO_DO_PROJETO.md` exige que a IA auxilie mas nunca decida
contratacao, que toda recomendacao apresente criterios e evidencias, que toda
analise registre modelo, versao e data, que dados de empresas diferentes nunca
compartilhem contexto, que curriculos e respostas sejam tratados como dados e
nunca como instrucoes, e que o sistema permita revisao humana. O `AGENTS.md`
reforca que a IA nao aprova nem reprova candidatos sozinha, que toda
recomendacao deve explicar criterios e evidencias, que o sistema deve registrar
modelo, versao e momento da analise, que curriculos e respostas podem conter
instrucoes maliciosas e devem ser tratados apenas como dados, e que nenhum dado
de uma empresa pode ser enviado no contexto de outra. O `SECURITY.md` exige
menor acesso possivel, separacao total entre empresas, dados protegidos em
transito e em repouso, auditoria de acoes importantes, decisao humana em
contratacao, nenhum segredo no codigo, e lista a falha de servico externo de IA
como teste de seguranca obrigatorio.

Esta ADR define a arquitetura central de execucao de IA do Talent OS: um unico
ponto de entrada conceitual que conecta politicas de IA, Feature Policies,
providers, credenciais, modelos, prompts, roteamento, telemetria e tolerancia a
falhas. Nenhum modulo de negocio deve chamar diretamente OpenAI, Anthropic,
Gemini, Azure OpenAI, Ollama ou qualquer outro provider.

Uma primeira versao desta ADR deixou em aberto quem administra routing, Model
Registry e Prompt Registry, como prioridades de roteamento sao decididas de
forma deterministica, e como fallback e autorizado e auditado. Esta revisao
fecha essas lacunas de governanca e roteamento, sem ampliar o escopo para
logica de negocio de nenhuma Feature especifica.

Esta ADR nao define a logica de negocio de nenhuma funcionalidade especifica
(por exemplo, a futura Avaliacao Assistida), nem implementa codigo.

## Decisao

### 1. AI Gateway

Existe um unico ponto conceitual de entrada para qualquer execucao de IA no
Talent OS, referido como `AIGateway`.

Todo modulo futuro que precisar de IA utiliza esse Gateway, incluindo, sem se
limitar a:

- Entrevistas;
- Avaliacao Assistida;
- Matching;
- Onboarding;
- Desenvolvimento.

Nunca:

- `InterviewService -> OpenAI` (modulo de negocio chamando provider
  diretamente).

Sempre:

- `InterviewService -> AIGateway -> Provider Adapter`.

Nenhum modulo de negocio deve importar ou conhecer um SDK de provider
diretamente.

### 2. Responsabilidades do Gateway

O `AIGateway` deve, para cada execucao solicitada, nesta ordem conceitual:

1. receber contexto validado da Organization;
2. receber `feature_key`;
3. verificar politicas (ADR-0016 e ADR-0017);
4. selecionar configuracao de provider;
5. selecionar modelo;
6. resolver credencial (ADR-0018);
7. resolver prompt versionado;
8. montar request seguro;
9. executar o provider;
10. normalizar a resposta;
11. registrar telemetria;
12. registrar auditoria;
13. retornar um resultado tipado ao modulo chamador.

Nenhuma dessas etapas pode ser pulada ou reordenada de forma a expor segredo ou
dado de negocio antes das validacoes de politica.

### 3. Ordem obrigatoria de autorizacao

Antes de resolver qualquer segredo ou montar payload com dados de negocio, o
Gateway valida, nesta ordem:

1. `platform_ai_allowed = true` (ADR-0016);
2. `organization_ai_enabled = true` (ADR-0016);
3. `feature_available_on_platform = true` (ADR-0017);
4. `organization_feature_enabled = true` (ADR-0017).

Somente apos essas quatro condicoes serem verdadeiras, o Gateway prossegue
para:

5. resolver routing/provider;
6. validar Provider Config (ADR-0018);
7. resolver segredo (ADR-0018);
8. montar o request.

Se qualquer uma das quatro condicoes iniciais falhar:

- nenhuma credencial e resolvida;
- nenhum dado de negocio e enviado a nenhum provider;
- nenhuma chamada externa ocorre.

Esta ordem formaliza, no nivel do Gateway, a regra ja estabelecida pela
ADR-0018 de que credencial valida nao autoriza execucao por si so.

### 4. Provider Adapter

Existe uma abstracao conceitual `AIProviderAdapter`. Cada provider suportado
pela plataforma implementa o mesmo contrato conceitual dessa abstracao.

Exemplos futuros de adapter (lista ilustrativa, nao exaustiva):

- `OpenAIAdapter`;
- `AzureOpenAIAdapter`;
- `AnthropicAdapter`;
- `GeminiAdapter`;
- `OllamaAdapter`.

O dominio de negocio nao conhece nenhuma dessas classes concretas; ele conhece
apenas o `AIGateway` e o resultado tipado que recebe de volta.

### 5. Contrato do Provider Adapter

O contrato conceitual de `AIProviderAdapter` inclui operacoes como:

- `validateCredential`;
- `execute`;
- `normalizeError`;
- `getUsage`;
- `getCapabilities`.

Esta ADR nao fixa assinatura de codigo para essas operacoes; a implementacao
tecnica exata fica para especificacao posterior.

### 6. Permissoes - Platform Admin

Platform Admin pode:

- administrar o `AI Model Registry`;
- publicar, arquivar e desabilitar modelos suportados;
- administrar o catalogo global de prompts (`AI Prompt Registry`);
- publicar e arquivar versoes de prompts;
- administrar disponibilidade global de providers;
- definir politicas globais de routing (por exemplo, a rota padrao futura da
  secao "Provider padrao");
- definir restricoes globais de modelos/providers;
- consultar auditoria e telemetria administrativa.

Platform Admin nao:

- atua funcionalmente dentro da Organization;
- habilita automaticamente uma Feature para uma Organization (essa decisao
  continua sendo do Owner, conforme ADR-0017);
- forca uma Organization a usar IA (essa decisao continua sendo do Owner,
  conforme ADR-0016);
- acessa credencial `customer_managed` completa (ADR-0018);
- altera resultados funcionais de IA ja produzidos.

### 7. Permissoes - Owner

Owner pode administrar, dentro da propria Organization:

- routing das Features disponibilizadas pela plataforma;
- provider preferencial;
- modelo permitido, entre os modelos disponibilizados pela plataforma;
- prioridade de routing;
- habilitacao de fallback, quando a plataforma permitir (secao "Permissao de
  fallback");
- configuracao BYOK, conforme ADR-0018.

Owner nao pode:

- criar provider no catalogo global;
- criar modelo arbitrario;
- publicar no Prompt Registry global;
- alterar o conteudo de um prompt oficial publicado;
- utilizar provider ou modelo bloqueado pela plataforma.

### 8. Permissoes - Admin e Member

**Admin**

Pode visualizar:

- routing configurado;
- provider selecionado;
- modelo selecionado;
- status;
- `prompt_key`/versao utilizados, quando isso nao expuser conteudo restrito;
- telemetria operacional permitida.

Admin nao pode alterar routing nesta primeira versao.

**Member**

Nao possui acesso administrativo ao `AIGateway`, routing, Model Registry ou
Prompt Registry.

Member pode apenas utilizar funcionalidades de IA quando a Feature funcional
especifica permitir, dentro do modulo de negocio correspondente.

Esta hierarquia e consistente com a autorizacao ja registrada nas ADRs 0016,
0017 e 0018: Platform Admin continua sem role funcional dentro da Organization
e controla apenas catalogos e disponibilidade de plataforma; Owner administra
dentro do que a plataforma permite; Admin apenas visualiza; Member nao tem
acesso administrativo.

### 9. Provider Routing

A escolha de qual provider e qual modelo uma Feature utiliza e uma decisao
separada da Feature Policy (ADR-0017). Feature Policy decide _se_ a
funcionalidade pode executar; Provider Routing decide _com qual provider e
modelo_ ela executa quando pode.

A unidade de routing e sempre o par `organization_id` + `feature_key`. Existe
o conceito de `AI Provider Routing Policy`, com os seguintes campos
conceituais:

- `organization_id`;
- `feature_key`;
- `provider`;
- `model`;
- `priority`;
- `status`;
- timestamps.

### 10. Regra de roteamento

Uma Organization pode ter multiplos providers configurados (ADR-0018, secao
"Multiplos providers por Organization").

Para cada par `organization_id` + `feature_key`:

- pode existir uma ou mais rotas candidatas (`AI Provider Routing Policy`),
  desde que as prioridades entre elas sejam deterministicas (secao
  "Prioridade");
- o Gateway usa apenas providers configurados e permitidos para aquela
  Organization;
- o provider da rota precisa estar com `status = configured` (ADR-0018);
- o `credential_mode` da configuracao precisa estar utilizavel (nao
  `disabled`, nem `invalid`, nem `revoked`);
- o modelo selecionado precisa ser permitido pelo Model Registry e compativel
  com a Feature (secao "Compatibilidade Feature x Modelo").

Sem rota valida:

- o Gateway nao executa;
- retorna um erro de configuracao seguro, sem detalhes sensiveis;
- o fluxo humano do modulo chamador continua funcionando normalmente.

### 11. Prioridade

Cada `AI Provider Routing Policy` possui uma `priority`, com as seguintes
regras:

- `priority` e um numero inteiro positivo;
- menor numero significa maior prioridade;
- `priority` deve ser unica dentro do mesmo par `organization_id` +
  `feature_key`;
- duas rotas ativas com a mesma prioridade, para o mesmo par
  `organization_id` + `feature_key`, sao configuracao invalida;
- a implementacao futura (banco de dados ou camada de validacao) deve impedir
  duplicidade de prioridade dentro do mesmo par.

Exemplo conceitual:

- prioridade 1 -> Provider A / Model X;
- prioridade 2 -> Provider B / Model Y;
- prioridade 3 -> Provider C / Model Z.

Esta ADR nao cria algoritmo de desempate para prioridades conflitantes. Se
houver inconsistencia de prioridade:

- o Gateway nao executa;
- retorna um erro de configuracao seguro;
- a inconsistencia e auditada.

### 12. Rota primaria

Quando fallback estiver desabilitado para o par `organization_id` +
`feature_key`:

- somente a rota ativa de menor `priority` (numero mais baixo) e considerada;
- se essa rota falhar, a execucao falha;
- o fluxo humano do modulo chamador continua (secao "Fail-safe").

Quando fallback estiver habilitado:

- as rotas seguintes, em ordem crescente de `priority`, podem ser
  consideradas, conforme a politica de fallback (secoes "Permissao de
  fallback", "Condicoes de fallback" e "Fallback e compliance").

### 13. Provider padrao

Esta ADR nao define OpenAI, nem qualquer outro provider, como padrao universal
da plataforma.

A plataforma podera definir uma rota padrao no futuro, administrada por
Platform Admin (secao "Permissoes - Platform Admin"), mas essa rota:

- deve ser explicita, registrada como configuracao, nunca implicita no codigo;
- deve ser auditavel;
- nunca escolhe provider silenciosamente na ausencia de qualquer politica de
  roteamento configurada. Na ausencia de rota valida, aplica-se a secao
  "Regra de roteamento" ("Sem rota valida").

### 14. Multiplos providers e fallback

O modelo de `AI Provider Routing Policy` permite, conceitualmente, prioridades
entre providers configurados para a mesma Feature (secao "Prioridade").

Fallback entre providers so pode ocorrer quando explicitamente permitido pela
politica da Feature/Organization. Nao ha fallback automatico entre providers
por padrao.

Motivos para essa restricao:

- custo;
- privacidade;
- residencia de dados;
- compliance;
- diferencas de comportamento entre modelos.

### 15. Permissao de fallback

Fallback exige duas autorizacoes simultaneas:

- a plataforma permite fallback para aquela Feature (Platform Admin, secao
  "Permissoes - Platform Admin");
- o Owner habilitou fallback para aquele par Organization + Feature (secao
  "Permissoes - Owner").

Sem ambas as autorizacoes, fallback nao ocorre.

Admin e Member nao habilitam fallback, consistente com a secao "Permissoes -
Admin e Member".

### 16. Condicoes de fallback

Se o fallback estiver habilitado conforme a secao "Permissao de fallback", ele
so pode ocorrer para erros operacionais seguros, por exemplo:

- timeout;
- indisponibilidade temporaria;
- rate limit;
- falha transitoria.

Fallback nunca ocorre automaticamente em caso de:

- credencial invalida;
- provider proibido;
- Feature desabilitada;
- Organization sem IA;
- erro de politica;
- conteudo bloqueado por politica de seguranca;
- configuracao invalida.

### 17. Fallback e compliance

Antes de tentar uma rota alternativa, o Gateway revalida, para a rota
candidata:

- provider permitido;
- modelo permitido;
- regiao/residencia de dados;
- credencial valida;
- Feature Policy (ADR-0017);
- politica da Organization;
- compatibilidade do modelo (secao "Compatibilidade Feature x Modelo").

O Gateway nunca assume que um provider alternativo possui a mesma politica de
privacidade ou compliance da rota principal; cada rota candidata e validada de
forma independente antes do uso.

### 18. Fallback e auditoria

Devem ser registrados, para cada tentativa de fallback:

- rota primaria selecionada;
- motivo seguro da falha da rota primaria;
- fallback permitido ou negado, e por qual motivo (politica de plataforma,
  politica da Organization, ou ambas);
- rota alternativa efetivamente utilizada, quando houver;
- quantidade de tentativas realizadas;
- resultado final da execucao.

Nunca registrar payload completo, prompt completo ou segredo nesses eventos.

### 19. Retry

Retry nao e automatico por padrao para qualquer tipo de erro.

Retry pode ser permitido apenas para erros transitorios, e quando permitido
deve:

- possuir um limite maximo de tentativas;
- usar backoff entre tentativas;
- evitar duplicidade de cobranca ou de efeito de negocio;
- registrar cada tentativa em telemetria.

### 20. Retry e fallback combinados

A ordem conceitual de uma execucao, considerando retry e fallback, e:

1. tentativa na rota primaria (menor `priority` ativa);
2. retry limitado da propria rota, apenas quando permitido pela secao
   "Retry";
3. se ainda falhar e fallback estiver autorizado (secao "Permissao de
   fallback"): tentar a proxima rota permitida, em ordem crescente de
   `priority`, revalidando-a conforme a secao "Fallback e compliance";
4. repetir ate: sucesso, fim das rotas candidatas, ou limite de tentativas.

Nunca existe retry infinito. Nunca existe fallback silencioso: toda tentativa
de fallback segue a secao "Fallback e auditoria".

### 21. Idempotencia

Features que possam disparar repetidamente a mesma analise podem fornecer um
`idempotency_key` ao Gateway.

Features com risco de cobranca duplicada, analise duplicada ou persistencia de
resultado duplicado devem fornecer `idempotency_key`.

O Gateway deve permitir, conceitualmente, controle de duplicidade usando essa
chave antes de permitir retry ou fallback em operacoes consideradas
idempotentes. Esta ADR nao define a implementacao fisica dessa protecao; ela
fica para especificacao tecnica posterior.

### 22. Fail-safe

Falha da IA nunca bloqueia um fluxo humano obrigatorio.

Exemplos:

- a entrevista continua, mesmo sem resumo automatico;
- a candidatura continua, mesmo sem matching automatico;
- a avaliacao humana continua, mesmo sem apoio de IA.

Quando a IA nao pode executar ou falha, o modulo chamador recebe um estado
seguro de dominio, por exemplo `AI_UNAVAILABLE` ou equivalente, nunca uma
falha que interrompa o fluxo de negocio.

### 23. Model Registry

Existe o conceito de `AI Model Registry`. O catalogo de modelos pertence a
plataforma, seguindo o mesmo principio ja estabelecido pela ADR-0017 para o
catalogo de Feature Policies: a plataforma define o que existe, a Organization
usa dentro do que existe.

Platform Admin controla, conceitualmente:

- provider;
- `model_key`;
- identificador fisico do modelo no provider
  (`provider_model_identifier`);
- disponibilidade;
- capabilities;
- compatibilidade.

Campos conceituais de uma entrada do Model Registry:

- `provider`;
- `model_key`;
- `provider_model_identifier`;
- `status`;
- `capabilities`;
- `context_window`, opcional;
- `metadata`;
- timestamps.

Organizations nao criam modelos arbitrarios no catalogo.

### 24. Modelos permitidos

Uma Organization pode selecionar apenas um modelo que esteja, simultaneamente:

- ativo no Model Registry;
- de um provider permitido e utilizavel para aquela Organization;
- compativel com a Feature em execucao (secao "Compatibilidade Feature x
  Modelo");
- permitido para aquela Organization pela politica futura de modelos.

O modelo nunca e enviado livremente pelo frontend como string arbitraria; a
selecao de modelo passa pelo Provider Routing e pelo Model Registry.

### 25. Compatibilidade Feature x Modelo

A plataforma mantem uma politica explicita de compatibilidade entre Feature e
modelo.

Uma Feature pode exigir capacidades como:

- structured output;
- tamanho minimo de contexto (`context_window`);
- suporte textual;
- suporte multimodal futuro;
- regiao especifica;
- requisitos de seguranca.

O Gateway recusa um modelo incompativel antes de executar qualquer chamada.
Nunca se tenta "ver se funciona" chamando o provider com um modelo cuja
compatibilidade nao foi validada previamente.

### 26. Prompt Registry - catalogo de prompts

O catalogo de prompts pertence a plataforma.

Platform Admin administra:

- `prompt_key`;
- versoes;
- publicacao;
- arquivamento;
- schemas de input e de output;
- metadata.

Organizations nao criam nem modificam prompts oficiais nesta primeira versao
da arquitetura.

Prompts nao ficam espalhados pelo codigo dos modulos de negocio. Cada prompt
possui, conceitualmente:

- `prompt_key`;
- Feature relacionada;
- versao;
- status;
- conteudo/template;
- schema de input;
- schema de output esperado;
- metadata;
- autoria;
- timestamps.

### 27. Prompt Registry - selecao do prompt

A Feature define qual `prompt_key` utiliza. O Gateway resolve a versao
publicada permitida para aquele `prompt_key`, conforme a configuracao e a
politica vigente.

Owner nao edita o conteudo do prompt. Isso evita prompt customizado arbitrario
por Organization nesta primeira arquitetura, mantendo o comportamento de cada
Feature de IA auditavel e consistente entre Organizations.

### 28. Versionamento de prompts

Um prompt e imutavel apos publicacao. Qualquer alteracao de conteudo cria uma
nova versao, nunca sobrescreve a versao existente.

Exemplo conceitual: `candidate_evaluation:v1`, `candidate_evaluation:v2`.

Toda execucao registra exatamente a versao de prompt utilizada (ver secao "AI
Execution" e "Prompt version utilizado"). Resultados historicos nunca sao
reinterpretados automaticamente por um novo prompt.

### 29. Status de prompt

Cada versao de prompt possui um dos seguintes estados canonicos:

- `draft`;
- `published`;
- `archived`.

Somente `published` pode ser usado em execucao normal pelo Gateway.

### 30. Prompt por Feature

Cada Feature referencia explicitamente um `prompt_key` e uma versao publicada
especifica. O Gateway nunca escolhe prompt por texto ou nome informal; a
referencia e sempre por identificador estruturado.

### 31. Prompt e dados sensiveis

Templates de prompt nunca contem segredos.

Ao montar o prompt para uma execucao, o Gateway:

- aplica minimizacao de dados;
- envia somente os dados necessarios para aquela Feature especifica;
- respeita as permissoes do ator que solicitou a execucao;
- respeita o consentimento operacional do Candidate, quando aplicavel;
- respeita a politica da Feature.

O Gateway nunca envia automaticamente o objeto completo de `Candidate`,
`Interview` ou `CandidateApplication` para um provider.

### 32. Structured Output

Sempre que o provider e o modelo suportarem, o Gateway prefere respostas
estruturadas em vez de texto livre.

O Gateway:

- define um schema de saida esperado por Feature/prompt;
- valida a resposta do provider contra esse schema no servidor;
- rejeita respostas incompativeis com o schema, sem repassa-las adiante como
  se fossem validas;
- nunca confia diretamente no texto bruto retornado pelo modelo como fonte de
  verdade.

O modulo de negocio chamador recebe um DTO tipado e validado, nunca a resposta
crua do provider.

### 33. Prompt Injection e conteudo nao confiavel

Dados vindos de `Candidate`, respostas de entrevista, futuro curriculo, notas
internas ou descricao de `Job Opening` sao sempre tratados como conteudo nao
confiavel quando incorporados a um prompt.

Regras:

- conteudo de usuario nunca pode alterar instrucoes de sistema do prompt;
- instrucoes e dados sao mantidos separados na montagem do request;
- toda saida do modelo e validada antes de uso (ver "Structured Output");
- o Gateway nunca executa comandos sugeridos pelo modelo;
- o modelo nunca recebe acesso direto a banco de dados ou a sistema
  operacional.

Esta secao formaliza, no nivel do Gateway, a regra ja registrada na
`CONSTITUICAO_DO_PROJETO.md` e no `AGENTS.md` de que curriculos e respostas sao
dados, nunca instrucoes.

### 34. AI Execution

Existe o conceito de `AI Execution`. Cada chamada ao Gateway que chega a
executar um provider possui um identificador interno unico.

Campos conceituais:

- `id`;
- `organization_id`;
- `feature_key`;
- `provider`;
- `model`;
- `prompt_key`;
- `prompt_version`;
- `credential_mode`;
- `status`;
- `started_at`;
- `finished_at`;
- `duration_ms`;
- `input_tokens`, quando disponivel;
- `output_tokens`, quando disponivel;
- `estimated_cost`, quando disponivel;
- `error_category`, opcional;
- `correlation_id`;
- timestamps.

### 35. Status de execucao

`AI Execution.status` usa os seguintes valores canonicos:

- `pending`;
- `running`;
- `succeeded`;
- `failed`;
- `cancelled`.

Status de execucao nunca e confundido com resultado de negocio: uma execucao
`succeeded` apenas significa que o provider respondeu e a resposta foi validada
com sucesso, nao que a Feature aprovou, recomendou ou decidiu algo sobre um
Candidate.

### 36. Conteudo da execucao

Por padrao, `AI Execution` nao armazena o prompt completo nem a resposta
completa.

`AI Execution` persiste:

- referencias (`prompt_key`, `prompt_version`, `provider`, `model`);
- hashes, quando uteis para verificacao de integridade;
- metadados;
- uso (tokens, duracao, custo estimado);
- status;
- categorias de erro.

Conteudo de negocio derivado de uma execucao (por exemplo, um resumo de
entrevista) fica em entidade funcional propria da Feature, quando necessario e
autorizado, seguindo a separacao ja estabelecida pela ADR-0015 e pela ADR-0016
entre resultados de IA e o `Candidate` principal.

### 37. Prompt version utilizado

Cada execucao registra exatamente `prompt_key` e `prompt_version` utilizados.

Se uma nova versao de prompt for publicada durante uma execucao em andamento:

- a execucao em andamento continua associada a versao ja resolvida no inicio
  daquela execucao;
- a nova versao vale apenas para novas execucoes iniciadas apos a publicacao.

### 38. Modelo utilizado

Cada execucao registra exatamente `provider`, `model_key` e o identificador ou
versionamento aplicavel do modelo naquele momento.

Mudancas futuras no Model Registry nunca reinterpretam execucoes anteriores.

### 39. Configuracao historica

Alterar routing:

- nao modifica `AI Execution` existentes;
- nao modifica resultados anteriores;
- nao substitui provider, model ou prompt ja registrados historicamente em uma
  execucao.

Historico e imutavel para fins de rastreabilidade.

### 40. Telemetria

Por execucao, o Gateway registra:

- Organization;
- Feature;
- provider;
- modelo;
- prompt e versao;
- duracao;
- tokens;
- status;
- custo estimado;
- erro normalizado, quando aplicavel.

Essa telemetria deve permitir, no futuro:

- dashboards;
- quotas;
- billing;
- alertas;
- capacity planning.

### 41. Custo

O Gateway deve conseguir registrar custo estimado por execucao quando houver
dados suficientes do provider para calcula-lo.

Esta ADR nao define precos comerciais do Talent OS.

Ficam separados conceitualmente:

- custo tecnico do provider (o que o provider cobra pela chamada);
- preco comercial futuro do Talent OS (o que a plataforma cobra do cliente).

### 42. Rate Limits

O Gateway deve suportar limites de taxa por:

- Organization;
- Feature;
- provider;
- modelo.

A politica numerica exata (limite, janela de tempo) fica fora do escopo desta
ADR.

Quando um limite for excedido:

- o provider nao e chamado;
- o Gateway retorna um erro seguro ao modulo chamador;
- a ocorrencia e registrada em telemetria e, quando aplicavel, em auditoria.

### 43. Timeout

Toda execucao externa ao provider possui timeout configuravel. Nunca existe
uma chamada externa sem timeout definido.

Um timeout gera um erro normalizado (ver secao "Provider indisponivel"),
nunca uma excecao bruta propagada ao modulo chamador.

### 44. Auditoria

Devem ser auditados, no nivel de execucao:

- execucao solicitada;
- execucao negada por politica;
- routing selecionado;
- execucao concluida;
- execucao falhou;
- fallback utilizado;
- rate limit atingido;
- tentativa sem permissao;
- resolucao de credencial negada.

A auditoria nunca registra:

- credenciais;
- headers `Authorization`;
- prompt completo contendo PII;
- resposta completa contendo PII;
- segredos.

Este padrao e consistente com o ja definido pelas ADRs 0016, 0017 e 0018.

### 45. Auditoria de configuracao

Devem ser auditados, no nivel de configuracao:

- routing criado;
- routing alterado;
- routing desabilitado;
- prioridade alterada;
- fallback habilitado ou desabilitado;
- modelo selecionado;
- prompt publicado;
- prompt arquivado;
- modelo disponibilizado ou desabilitado no Model Registry;
- tentativa de configuracao sem permissao;
- configuracao invalida recusada (por exemplo, prioridade duplicada).

Aplicam-se as mesmas restricoes da secao "Auditoria": nunca registrar
credenciais, segredos ou conteudo completo sensivel.

### 46. Seguranca

- Segredo e resolvido somente depois que todas as politicas aplicaveis forem
  aprovadas (secao "Ordem obrigatoria de autorizacao").
- O provider recebe somente dados minimizados, nunca objetos completos de
  negocio.
- Toda resposta do provider e validada antes de ser usada (secao "Structured
  Output").
- O provider nunca recebe acesso ao banco de dados do Talent OS.
- Nenhum tool/function calling irrestrito existe nesta primeira arquitetura.
- Nenhum codigo retornado pela IA e executado pelo Talent OS.
- Nenhum comando sugerido pelo modelo e executado automaticamente.

### 47. Seguranca administrativa

Toda alteracao de routing, Model Registry ou Prompt Registry deve:

- validar o ator (quem esta fazendo a alteracao);
- validar o escopo (Organization, quando aplicavel; plataforma, quando
  aplicavel);
- usar autorizacao server-side, nunca confiar em controle exibido apenas no
  frontend;
- ser auditada (secao "Auditoria de configuracao");
- nao depender da UI para impor a regra de autorizacao;
- rejeitar mass assignment de campos nao esperados pela operacao;
- nao permitir referencia arbitraria a provider, model ou prompt inexistente
  no respectivo catalogo.

### 48. Data residency e compliance

O Provider Routing futuro deve poder considerar, quando necessario:

- regiao;
- residencia de dados;
- contrato;
- politica do cliente;
- provider permitido.

Esta ADR nao implementa regras especificas de data residency ou compliance,
mas a arquitetura de routing definida aqui (`AI Provider Routing Policy`,
priorizacao, restricao de fallback, revalidacao de compliance na secao
"Fallback e compliance") nao impede que essas regras sejam adicionadas em
especificacao posterior.

### 49. Observabilidade

Tracing e logs relacionados a execucao de IA usam:

- `execution_id`;
- `organization_id`;
- `feature_key`;
- provider e modelo;
- status.

Tracing e logs nunca incluem:

- segredo;
- prompt completo;
- payload completo;
- resposta completa.

### 50. Provider indisponivel

Quando o provider estiver indisponivel, o Gateway:

- normaliza o erro;
- atualiza a `AI Execution` correspondente;
- nao quebra o fluxo humano do modulo chamador (secao "Fail-safe");
- so aciona fallback se a politica da Feature/Organization permitir (secoes
  "Permissao de fallback" e "Condicoes de fallback");
- permite nova tentativa posterior, manual ou automatica conforme a regra da
  Feature.

### 51. Provider ou modelo removido

Remover um provider ou um modelo do catalogo da plataforma:

- impede novas execucoes que dependeriam dele;
- nao altera resultados historicos ja produzidos;
- nao apaga `AI Execution` anteriores;
- referencias historicas (`provider`, `model`, `prompt_key`,
  `prompt_version`) permanecem intactas (secao "Configuracao historica").

### 52. Prompt arquivado

Um prompt em status `archived`:

- nao inicia novas execucoes;
- permanece disponivel para rastreabilidade historica;
- resultados existentes continuam referenciando a versao que utilizaram, mesmo
  apos o arquivamento.

### 53. Multiempresa

Toda `AI Execution` carrega `organization_id`.

Routing, credencial, telemetria e resultados de uma execucao sempre pertencem
a mesma Organization. O Gateway nunca usa configuracao de routing, credencial
ou prompt de uma Organization diferente daquela do contexto validado da
requisicao, seguindo o mesmo principio de isolamento ja estabelecido pelas
ADRs 0003, 0013, 0014, 0015, 0016, 0017 e 0018.

### 54. Desenvolvimento e testes

- Testes automatizados usam adapters falsos/mocks de provider.
- Nenhum teste comum depende de provider real.
- Testes de integracao reais, se existirem, usam credenciais de ambiente
  proprio e controlado, nunca credenciais de cliente.
- CI nao depende obrigatoriamente de provider externo para passar.
- Respostas simuladas em teste sao deterministicas.

Estas regras sao consistentes com a `CONSTITUICAO_DO_PROJETO.md` e o
`AGENTS.md` quanto a nao usar dados reais e nao depender de acesso externo nao
controlado durante desenvolvimento e testes.

## Fluxo de integracao com as ADRs anteriores

A sequencia conceitual de uma execucao de IA, do pedido da Feature ate a
entrega do resultado, e:

1. Feature solicita IA;
2. ADR-0016: IA esta permitida para a Organization
   (`platform_ai_allowed` + `organization_ai_enabled`)?
3. ADR-0017: a Feature esta permitida
   (`feature_available_on_platform` + `organization_feature_enabled`)?
4. ADR-0019: existe routing valido para essa Feature nessa Organization
   (prioridade deterministica, secao "Prioridade")?
5. ADR-0018: o provider e a credencial resolvidos pelo routing sao validos?
6. o prompt referenciado esta `published`?
7. o modelo selecionado e valido no Model Registry e compativel com a
   Feature?
8. o Gateway executa o provider;
9. o Gateway valida a resposta contra o schema esperado;
10. o Gateway registra a `AI Execution` (telemetria e auditoria);
11. o Gateway entrega o resultado tipado a Feature.

Qualquer falha em um passo anterior interrompe a sequencia nesse ponto, sem
avancar para os passos seguintes, e sem expor segredo ou dado de negocio alem
do estritamente necessario para aquele passo. Quando fallback estiver
autorizado (secao "Permissao de fallback"), os passos 4 a 9 podem se repetir
para a proxima rota candidata, seguindo a secao "Retry e fallback
combinados".

## Consequencias

- Nenhum modulo de negocio chama um provider de IA diretamente; todos passam
  pelo `AIGateway`, o que centraliza autorizacao, credencial, prompt,
  telemetria e auditoria em um unico ponto.
- Adicionar um novo provider, modelo ou prompt nao exige alterar modulos de
  negocio existentes, pois eles dependem apenas do contrato do Gateway.
- A ordem de autorizacao definida aqui torna explicito, no nivel de
  infraestrutura, que nenhuma chamada externa ocorre antes das quatro
  condicoes das ADRs 0016 e 0017 serem satisfeitas.
- A governanca fica explicita: Platform Admin administra catalogos de
  plataforma (Model Registry, Prompt Registry, disponibilidade de provider,
  politicas globais); Owner administra routing e fallback dentro do que a
  plataforma disponibiliza; Admin apenas visualiza; Member nao tem acesso
  administrativo.
- Prioridade de routing deterministica (numero inteiro unico por par
  Organization + Feature) elimina ambiguidade de qual rota e a primaria, sem
  exigir um algoritmo de desempate.
- Fallback exige dupla autorizacao (plataforma e Owner) e revalidacao completa
  de compliance antes de qualquer tentativa alternativa, reduzindo o risco de
  uma rota alternativa violar residencia de dados ou politica de privacidade
  da rota principal.
- Prompts versionados e imutaveis permitem auditar exatamente o que foi
  utilizado em cada execucao passada, mesmo apos evolucao futura do prompt;
  Owner nunca edita o conteudo de um prompt oficial.
- `AI Execution` fornece uma trilha tecnica completa (provider, modelo, prompt,
  status, uso, custo) sem duplicar dados de negocio, que continuam pertencendo
  as entidades funcionais de cada Feature.
- Fail-safe garante que qualquer falha de IA, de qualquer natureza, nunca
  impede um fluxo humano obrigatorio de continuar.
- Telemetria e auditoria detalhadas, incluindo auditoria de configuracao,
  preparam a plataforma para quotas, billing, alertas e capacity planning
  futuros sem exigir nova decisao arquitetural para esses temas.

## Fora do escopo

Esta ADR nao define:

- a logica da futura SPEC de Avaliacao Assistida;
- criterios de avaliacao de `Candidate`;
- ranking;
- decisao automatica;
- prompt especifico de nenhuma Feature de avaliacao;
- precos comerciais;
- provider escolhido como padrao;
- implementacao fisica do Secret Manager (ja fora de escopo pela ADR-0018);
- implementacao de adapters concretos;
- politica numerica exata de rate limit, retry e timeout;
- algoritmo de desempate de prioridade de routing;
- implementacao fisica de idempotencia;
- codigo.

Esses pontos terao ADR ou especificacao propria quando forem priorizados.

## Restricoes mantidas

- IA continua sendo capacidade opcional do Talent OS (ADR-0016).
- A regra efetiva de execucao de IA continua exigindo as quatro condicoes das
  ADRs 0016 e 0017, agora aplicadas explicitamente pela ordem de autorizacao
  do Gateway.
- Credenciais continuam seguindo o modelo de modos, secret management,
  auditoria e isolamento multiempresa da ADR-0018; o Gateway nao introduz
  nenhum caminho alternativo de resolucao de credencial.
- Platform Admin nao recebe role funcional dentro da Organization (ADR-0003,
  ADR-0013, ADR-0014, ADR-0016, ADR-0017, ADR-0018).
- Owner nao cria provider ou modelo no catalogo global, nem publica no Prompt
  Registry global, nem edita o conteudo de um prompt oficial publicado.
- Admin nao altera routing, Model Registry ou Prompt Registry nesta primeira
  versao; apenas visualiza. Member nao possui acesso administrativo.
- IA nao aprova nem reprova candidatos sozinha; resultados de IA permanecem
  separados de avaliacoes humanas (ADR-0015, ADR-0016).
- Nenhuma chave, senha ou token pode ser salva no codigo
  (`CONSTITUICAO_DO_PROJETO.md`).
- Dados de empresas diferentes nunca podem compartilhar contexto de IA
  (`CONSTITUICAO_DO_PROJETO.md`, `AGENTS.md`).
- Toda acao critica sobre execucao, routing, prompt ou modelo gera auditoria.
- Nao ha exclusao de historico de `AI Execution`, prompts ou routing ao
  remover, arquivar ou desabilitar provider, modelo, prompt ou rota.
- Fallback nunca e automatico nem silencioso; exige dupla autorizacao e gera
  auditoria propria.
