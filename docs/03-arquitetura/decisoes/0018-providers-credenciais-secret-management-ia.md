# ADR 0018 - Providers, credenciais e secret management de IA

## Status

Aceita.

## Contexto

A ADR-0016 estabeleceu que IA e uma capacidade opcional do Talent OS,
controlada por `platform_ai_allowed` e `organization_ai_enabled`. A ADR-0017
completou a regra efetiva de execucao com `feature_available_on_platform` e
`organization_feature_enabled`, formalizando o catalogo de funcionalidades de
IA pertencente a plataforma. Nenhuma das duas ADRs anteriores define como uma
credencial de provider de IA e configurada, armazenada, resolvida, protegida,
rotacionada, testada ou auditada.

A `CONSTITUICAO_DO_PROJETO.md` exige, entre outras regras, que nenhuma chave,
senha ou token seja salvo no codigo, que toda validacao de empresa e permissao
ocorra no servidor, que toda acao critica gere auditoria e que arquivos, cache,
filas e contexto de IA permanecam separados por empresa. O `AGENTS.md` reforca
que agentes nao devem expor segredos e que a separacao multiempresa vale tambem
para IA. O `SECURITY.md` exige menor acesso possivel, separacao total entre
empresas, dados protegidos em transito e em repouso, auditoria de acoes
importantes, decisao humana em contratacao, nenhum segredo no codigo, e lista
como teste obrigatorio a falha de servico externo de IA.

O Talent OS precisa operar em tres cenarios de credencial de IA por
Organization, todos igualmente validos:

- sem IA (nenhuma credencial resolvida);
- com IA fornecida pela plataforma (credencial administrada pela plataforma);
- com credencial propria do cliente (modelo BYOK - Bring Your Own Key).

Uma primeira versao desta ADR deixou em aberto como uma Organization lida com
multiplos providers, quais sao os estados canonicos de `status`, como
transicoes de `credential_mode` sao protegidas, como concorrencia e retencao de
segredo antigo sao tratadas, e como responsabilidades de teste de conexao se
dividem entre papeis. Esta revisao fecha essas lacunas, sem ampliar o escopo
para AI Gateway, Prompt Registry ou implementacao fisica do Secret Manager.

Esta ADR define exclusivamente o modelo conceitual de credenciais, secret
management e autorizacao associada. Prompts e regras de negocio da futura
Avaliacao Assistida por IA nao sao definidos aqui, nem o roteamento de qual
provider uma funcionalidade de IA utiliza em cada execucao.

## Decisao

### 1. Modos de credencial

Toda Organization possui um modo canonico de credencial de IA, por provider,
com os seguintes valores:

- `disabled`;
- `platform_managed`;
- `customer_managed`.

**`disabled`**

- nenhuma credencial e resolvida para essa Organization/provider;
- nenhuma chamada ao provider e permitida.

**`platform_managed`**

- o Talent OS utiliza uma credencial administrada pela propria plataforma;
- a Organization nao recebe nem visualiza a credencial;
- custos e limites de uso poderao ser administrados pela plataforma.

**`customer_managed`**

- a Organization fornece sua propria credencial (modelo BYOK);
- o custo do provider pertence normalmente a conta do cliente;
- o Talent OS utiliza a credencial somente dentro das politicas autorizadas por
  esta ADR e pelas ADRs 0016 e 0017.

A ausencia de qualquer configuracao ativa para uma Organization/provider e
equivalente a `credential_mode = disabled`.

### 2. Transicoes de credential_mode

Transicoes entre `disabled`, `platform_managed` e `customer_managed` sao
sempre explicitas e auditadas. Nunca ocorre mudanca automatica de modo.

- Transicao para `customer_managed` exige uma nova credencial valida, aprovada
  por `test_connection`, antes de o modo ser ativado.
- Transicao para `platform_managed` exige que a plataforma possua uma
  credencial `platform_managed` valida e disponivel para aquele provider antes
  de o modo ser ativado.
- Transicao para `disabled` bloqueia imediatamente novas resolucoes de
  credencial para aquela Organization/provider.
- Falha durante qualquer transicao preserva o modo e a configuracao
  anteriores; nao existe estado parcialmente trocado.
- A atomicidade dos metadados durante uma transicao segue a mesma exigencia
  descrita na secao "Rotacao de credenciais" e o mesmo mecanismo de bloqueio
  descrito na secao "Concorrencia em operacoes de credencial".

### 3. Provider Config

Existe uma configuracao conceitual por Organization e por provider, referida
como `organization_ai_provider_configs`.

Campos conceituais:

- `id`;
- `organization_id`;
- `provider`;
- `credential_mode`;
- `status` (ver secao "Status da configuracao");
- `secret_reference`, opcional;
- `masked_identifier`, opcional;
- `configured_at`;
- `configured_by_user_id`;
- `last_validated_at`, opcional;
- `last_validation_status`, opcional;
- `revoked_at`, opcional;
- timestamps de criacao e atualizacao.

Esta tabela nunca armazena API Key diretamente. O unico vinculo com o segredo
real e `secret_reference`.

### 4. Status da configuracao

`organization_ai_provider_configs.status` possui exatamente estes estados
canonicos:

- `configured`;
- `invalid`;
- `revoked`;
- `error`.

Regras:

- `configured`: a configuracao existe e a ultima validacao conhecida foi
  bem-sucedida;
- `invalid`: a credencial foi rejeitada ou considerada invalida pelo provider;
- `revoked`: a credencial ou configuracao foi explicitamente revogada;
- `error`: ocorreu erro operacional temporario durante validacao ou uso, sem
  que a credencial em si tenha sido classificada como invalida.

A ausencia de configuracao continua sendo representada pela inexistencia do
registro em `organization_ai_provider_configs`, nunca por um valor adicional de
`status`.

### 5. Multiplos providers por Organization

- Uma Organization pode possuir multiplos providers de IA configurados
  simultaneamente.
- Cada configuracao e identificada conceitualmente pelo par `organization_id` +
  `provider`.
- Cada configuracao possui seu proprio `credential_mode`, `status` e
  `secret_reference`, independentes das configuracoes de outros providers da
  mesma Organization.
- Possuir multiplos providers configurados nao significa que todos estao
  ativos para todas as funcionalidades de IA da Organization.

A escolha de qual provider uma Feature especifica utiliza fica para ADR
posterior de AI Gateway / Provider Routing, conforme a proxima secao.

### 6. Providers

A arquitetura deve suportar multiplos providers de IA, sem amarrar o dominio a
nenhum provider especifico.

Exemplos futuros de provider (lista ilustrativa, nao exaustiva):

- OpenAI;
- Azure OpenAI;
- Anthropic;
- Google Gemini;
- Ollama;
- Mistral;
- outros.

Cada provider e identificado por um identificador canonico estavel, usado em
`organization_ai_provider_configs.provider`. Adicionar um novo provider ao
catalogo nao deve exigir alterar o dominio de `Candidate`, `Job Opening`,
`CandidateApplication`, `Interview` ou qualquer outro modulo de negocio.

### 7. Relacao Feature x Provider

Esta ADR nao decide roteamento de funcionalidades de IA para providers.

- Feature Policy (ADR-0017) decide se uma funcionalidade pode executar,
  respeitando `feature_available_on_platform` e `organization_feature_enabled`.
- Provider Config (esta ADR) decide se um provider esta configurado e
  utilizavel para uma Organization, respeitando `credential_mode` e `status`.
- Um futuro AI Gateway decidira qual provider e qual modelo serao efetivamente
  utilizados em cada execucao de uma Feature.

Esta ADR nao cria acoplamento direto entre uma Feature especifica e um
provider especifico. Essa relacao fica para a ADR de AI Gateway / Provider
Routing.

### 8. Secret Management

Credenciais nunca sao armazenadas em texto puro no banco principal do Talent
OS.

O armazenamento real do segredo usa, conceitualmente, um Secret Manager, Vault,
KMS ou tecnologia equivalente, externo ao banco principal.

O banco principal armazena apenas `secret_reference`, um identificador opaco
que permite localizar o segredo no servico externo. Por exemplo:
`org-ai-secret-<id>`. O banco principal nunca armazena valores no formato de
uma chave real de provider (por exemplo, algo no formato `sk-...`).

### 9. Criptografia

- Credenciais sao criptografadas em repouso no servico de secret management.
- Toda conexao usada para configurar credencial ocorre por HTTPS/TLS.
- Deve existir isolamento logico por Organization no armazenamento e na
  resolucao de segredos.
- O Talent OS nao desenvolve criptografia propria para proteger credenciais.
- A arquitetura deve preferir envelope encryption, KMS ou Secret Manager
  gerenciado a implementacao caseira.
- Chaves mestras de criptografia nunca ficam no codigo-fonte nem no banco
  principal.

### 10. Exposicao e mascaramento da credencial

Depois de salva, uma credencial nunca retorna completa para o frontend, em
nenhuma circunstancia.

- Owner ve apenas status e identificador mascarado, no formato aproximado
  `************7Ks2`.
- Admin ve apenas provider e status, sem qualquer parte da credencial.
- Member nao acessa configuracao de credencial.
- Platform Admin nao visualiza o segredo completo de uma credencial
  `customer_managed`.

Regras de mascaramento:

- o mascaramento revela somente a informacao minima necessaria para
  identificacao visual da credencial pelo usuario;
- o mascaramento nunca revela prefixo, contagem exata de caracteres ou
  qualquer informacao que permita reconstrucao ou inferencia da credencial
  original;
- o formato exato de mascaramento pode variar por provider, mas a regra de
  mascaramento e centralizada em um unico ponto do backend e testavel
  isoladamente;
- o frontend nunca recebe o segredo completo para calcular a mascara; ele
  recebe apenas o valor ja mascarado, calculado no backend.

Nenhuma API, log, tela ou export retorna a chave original apos o momento do
cadastro.

### 11. Permissoes

**Platform Admin**

Pode:

- definir os providers suportados pela plataforma;
- administrar credenciais `platform_managed`;
- executar teste de conexao real apenas para configuracoes `platform_managed`;
- visualizar status de configuracao de qualquer Organization;
- revogar um provider da plataforma;
- consultar auditoria.

Nao pode:

- visualizar credencial `customer_managed` completa de nenhuma Organization;
- testar credencial `customer_managed` de uma Organization como operacao
  funcional.

**Owner**

Pode:

- escolher `customer_managed` quando permitido pela plataforma;
- inserir nova credencial;
- substituir credencial existente;
- executar teste de conexao real, resolvendo o segredo no backend;
- revogar a propria credencial `customer_managed`;
- visualizar status;
- visualizar identificador mascarado.

**Admin**

Pode:

- visualizar provider configurado;
- visualizar modo de credencial;
- visualizar status atual;
- visualizar `last_validated_at` e `last_validation_status`.

Nao pode:

- cadastrar credencial;
- substituir credencial;
- revelar credencial;
- exportar credencial;
- disparar `test_connection` real nesta primeira versao.

**Member**

Sem acesso administrativo a configuracao de provider ou credencial.

Esta hierarquia e consistente com a autorizacao ja registrada nas ADRs 0016 e
0017: Platform Admin continua sem role funcional dentro da Organization; Owner
administra dentro do que a plataforma permite; Admin apenas visualiza; Member
nao tem acesso administrativo.

### 12. Fluxo BYOK

1. Owner escolhe o provider.
2. Owner escolhe `customer_managed`.
3. Owner informa a credencial em formulario seguro.
4. O frontend envia a credencial via HTTPS.
5. O backend valida o formato do payload.
6. O backend testa a conexao com o provider usando a credencial informada.
7. Se a credencial for valida:
   - o backend grava o segredo no Secret Manager;
   - recebe um `secret_reference`;
   - persiste no banco principal somente a referencia e os metadados
     conceituais listados na secao "Provider Config";
   - descarta o segredo da memoria do processo assim que possivel.
8. A operacao gera auditoria.
9. O frontend recebe apenas confirmacao de sucesso e o valor mascarado da
   credencial.

Nunca, em nenhuma etapa deste fluxo:

- registrar a credencial em log;
- enviar a credencial em query string;
- armazenar a credencial em `localStorage` ou qualquer storage de cliente;
- armazenar a credencial no banco principal em texto puro;
- incluir a credencial em registro de auditoria;
- retornar a credencial completa em qualquer resposta de API.

### 13. Platform Managed

- A credencial `platform_managed` pertence a plataforma, nao a Organization.
- Ela pode ser compartilhada tecnicamente entre varias Organizations apenas se
  o isolamento de uso, telemetria e limites entre Organizations estiver
  garantido.
- A Organization nunca recebe o segredo de uma credencial `platform_managed`.
- Todo consumo realizado com credencial `platform_managed` deve sempre ser
  atribuido a Organization que originou a chamada.
- Quotas e custos futuros associados a uso `platform_managed` devem ser
  mensuraveis por Organization, mesmo quando a credencial subjacente for
  compartilhada.

Como padrao arquitetural recomendado:

- a plataforma deve preferir segmentacao de credenciais `platform_managed`
  para reduzir blast radius, evitando uma unica credencial global compartilhada
  quando o provider permitir isolamento melhor;
- a implementacao podera adotar, por exemplo, credencial por Organization,
  credencial por grupo/tenant, ou pool segmentado de credenciais;
- uma chave global unica compartilhada por todas as Organizations so deve ser
  usada se limites, telemetria, isolamento e risco associado forem avaliados e
  considerados aceitaveis.

A escolha fisica exata de segmentacao fica para implementacao e infraestrutura
futura, fora do escopo desta ADR.

### 14. Teste de conexao

Existe uma operacao conceitual `test_connection`, disponivel para
configuracoes `customer_managed` e, quando aplicavel, `platform_managed`.

A operacao deve:

- resolver o segredo somente no backend, nunca no frontend;
- realizar uma chamada minima e segura ao provider, suficiente apenas para
  validar a credencial;
- nunca enviar dados de `Candidate`, `Interview` ou qualquer outro dado de
  negocio nessa chamada de teste;
- atualizar `last_validated_at`;
- atualizar `last_validation_status`;
- auditar sucesso ou falha do teste, sem registrar o segredo.

Estados possiveis de `last_validation_status`:

- `valid`;
- `invalid`;
- `revoked`;
- `error`;
- `unknown`.

**Por role:**

- Owner pode executar validacao real do provider (`test_connection`
  funcional), resolvendo o segredo no backend.
- Admin pode apenas visualizar o status atual, `last_validated_at` e
  `last_validation_status`; Admin nao pode disparar `test_connection` real
  nesta primeira versao.
- Platform Admin pode executar teste real apenas para configuracoes
  `platform_managed`; Platform Admin nao pode testar credencial
  `customer_managed` de uma Organization como operacao funcional.

**Rate limit:**

- `test_connection` deve possuir rate limit por Organization, por provider e
  por ator que a executa;
- nao pode ser utilizado como endpoint de uso arbitrario do provider;
- deve realizar apenas a chamada minima necessaria para validar a credencial;
- nunca envia dados de `Candidate`, `Interview` ou qualquer conteudo de
  negocio;
- tentativas excessivas devem ser recusadas e auditadas de forma segura, sem
  registrar segredo.

A politica numerica exata de rate limit (limite e janela de tempo) fica para
implementacao futura.

### 15. Rotacao de credenciais

1. Owner informa uma nova credencial para um provider ja configurado.
2. A nova credencial e validada via `test_connection` antes de substituir a
   ativa.
3. A nova credencial e armazenada no Secret Manager, recebendo novo
   `secret_reference`.
4. A nova referencia passa a ser a ativa para aquela Organization/provider.
5. A referencia anterior e revogada, ou removida do Secret Manager, conforme a
   politica de retencao descrita na secao "Retencao no Secret Manager".
6. A operacao gera auditoria.

Se a nova credencial falhar na validacao:

- a configuracao antiga permanece ativa;
- nenhuma troca parcial acontece;
- nenhuma chamada de negocio passa a usar uma credencial nao validada.

A atualizacao dos metadados da configuracao (`credential_mode`,
`secret_reference`, `masked_identifier`, `status`, `last_validated_at`,
`last_validation_status`) deve ser transacional: ou todos os metadados da nova
credencial sao gravados de forma consistente, ou nenhum e gravado. O bloqueio
da configuracao durante a rotacao segue a secao "Concorrencia em operacoes de
credencial".

### 16. Revogacao

- Owner pode revogar uma credencial `customer_managed` da propria
  Organization.
- Platform Admin pode revogar uma credencial `platform_managed`.

Revogar uma credencial deve:

- impedir novas chamadas ao provider usando aquela credencial, imediatamente;
- preservar o historico de configuracoes e execucoes anteriores;
- manter a auditoria associada;
- nunca apagar registros historicos de uso.

### 17. Concorrencia em operacoes de credencial

Rotacao, substituicao, mudanca de `credential_mode` e revogacao alteram o
estado ativo de uma configuracao de credencial. Todas essas operacoes devem:

- usar transacao para os metadados da configuracao;
- bloquear a configuracao correspondente durante a operacao, por exemplo com
  `SELECT ... FOR UPDATE` ou mecanismo equivalente de bloqueio de linha;
- impedir que duas rotacoes simultaneas da mesma configuracao produzam um
  resultado inconsistente;
- impedir que uma rotacao concorra com uma revogacao da mesma configuracao sem
  resolucao segura;
- garantir que, ao final de qualquer uma dessas operacoes, somente uma
  referencia de credencial fique ativa para aquela Organization/provider.

Este padrao de bloqueio e consistente com o ja utilizado pela ADR-0004 para
proteger o ultimo owner ativo de uma Organization contra alteracoes
concorrentes.

### 18. Retencao no Secret Manager

- Esta ADR nao define o prazo fisico de retencao de segredos antigos no
  Secret Manager.
- Uma credencial antiga deixa de ser utilizavel imediatamente apos rotacao ou
  revogacao, independentemente de quando for fisicamente destruida no Secret
  Manager.
- A retencao ou destruicao fisica do segredo antigo segue politica futura de
  seguranca e compliance, a ser definida em especificacao tecnica posterior.
- O historico de auditoria e os metadados de `organization_ai_provider_configs`
  nao dependem da permanencia do segredo antigo no Secret Manager; historico e
  auditoria permanecem integros mesmo apos a destruicao fisica do segredo.

### 19. Falha de provider e seguranca de erros

Quando o provider retornar autenticacao invalida, quota excedida, timeout,
indisponibilidade ou erro de rede, o Talent OS:

- nao deve bloquear nenhum fluxo humano do modulo de negocio afetado;
- deve registrar um status operacional seguro do ocorrido, sem dados
  sensiveis;
- deve permitir nova tentativa posterior, manual ou automatica, conforme regra
  de cada funcionalidade;
- nunca deve vazar a resposta bruta e sensivel do provider para o usuario final
  ou para logs de negocio.

Reforcando o tratamento de erro:

- respostas brutas do provider nunca sao retornadas ao usuario final nem
  registradas integralmente em log;
- erros de provider sao normalizados para um conjunto de categorias seguras
  antes de qualquer exposicao (por exemplo: autenticacao invalida, quota
  excedida, timeout, indisponibilidade, erro de rede, erro desconhecido);
- mensagens de erro expostas ao usuario sao sanitizadas, sem reproduzir texto
  bruto do provider;
- logs e tracing relacionados a falhas de provider usam apenas codigo ou
  categoria de erro seguros, nunca o corpo da resposta do provider;
- nenhuma parte de um segredo ou conteudo sensivel pode aparecer em uma
  mensagem de erro, log ou trace.

### 20. Auditoria

Devem ser auditados:

- provider configurado;
- `credential_mode` alterado;
- credencial cadastrada;
- credencial substituida;
- credencial revogada;
- rotacao iniciada;
- rotacao concluida;
- rotacao falhou;
- teste de conexao executado;
- teste de conexao falhou;
- rate limit de teste de conexao atingido;
- tentativa de operacao sem permissao;
- tentativa concorrente rejeitada;
- resolucao de credencial negada, incluindo negacao decorrente das condicoes
  da secao "Integracao com ADR-0016 e ADR-0017".

A auditoria nunca registra:

- API Key;
- token;
- segredo;
- header `Authorization`;
- corpo completo enviado ao provider;
- resposta completa do provider.

### 21. Isolamento multiempresa

- Toda configuracao de provider pertence exatamente a uma Organization.
- Um `secret_reference` nunca pode ser resolvido por outra Organization alem
  daquela a que pertence.
- A Organization A nunca usa credencial BYOK da Organization B, mesmo quando
  ambas configuram o mesmo provider.
- Logs, auditoria e telemetria relacionados a credenciais e execucoes de IA
  sempre carregam `organization_id`.
- Resolver um segredo exige contexto de Organization validado no servidor,
  seguindo o mesmo principio ja estabelecido pelas ADRs anteriores de que o
  identificador enviado pelo cliente nunca prova permissao.

### 22. Integracao com ADR-0016 e ADR-0017

A existencia de uma credencial valida NAO significa que a IA pode executar.

Antes de resolver qualquer credencial, a infraestrutura deve validar, nesta
ordem:

- `platform_ai_allowed` (ADR-0016);
- `organization_ai_enabled` (ADR-0016);
- `feature_available_on_platform` (ADR-0017);
- `organization_feature_enabled` (ADR-0017).

Somente depois dessas quatro verificacoes passarem a infraestrutura pode
tentar resolver o provider e a credencial associada. Uma credencial configurada
e validada, isoladamente, nunca autoriza execucao.

### 23. Comportamento da Feature retirada da plataforma

- Se `feature_available_on_platform = false`, o valor de
  `organization_feature_enabled` permanece armazenado com seu valor anterior;
  ele nao e apagado nem forcado para `false`.
- Enquanto a funcionalidade estiver retirada da plataforma, esse valor fica
  inerte: nenhuma execucao ocorre, independentemente do valor armazenado.
- Se a funcionalidade for disponibilizada novamente
  (`feature_available_on_platform = true`), a preferencia anterior da
  Organization volta a ter efeito sem necessidade de nova configuracao pelo
  Owner.
- Toda retirada e restauracao de funcionalidade segue a auditoria ja prevista
  na ADR-0017.

### 24. Seguranca de memoria e logs

- Segredos nunca sao impressos em log, em nenhum nivel de severidade.
- Excecoes que envolvam chamadas a provider devem ser sanitizadas antes de
  qualquer registro, conforme a secao "Falha de provider e seguranca de
  erros".
- O tempo de vida de um segredo em memoria do processo deve ser minimizado ao
  estritamente necessario para a operacao em curso.
- Segredos nunca sao incluidos em metricas.
- Segredos nunca sao incluidos em tracing.
- Segredos nunca sao enviados para o frontend apos o momento da configuracao
  inicial.

### 25. Desenvolvimento local e testes

- Testes automatizados nunca usam chaves reais de clientes.
- Ambientes de desenvolvimento e teste usam segredos proprios de
  desenvolvimento ou providers simulados, quando possivel.
- Fixtures de teste nunca contem credenciais reais de nenhum provider.
- `.env.example` nunca contem uma chave valida, apenas placeholders.
- Pipelines de CI nunca imprimem segredo, mesmo em caso de falha.

Estas regras sao consistentes com a `CONSTITUICAO_DO_PROJETO.md` (dados reais
de candidatos nao podem ser usados em desenvolvimento ou testes; nenhuma chave,
senha ou token pode ser salvo no codigo) e com o `SECURITY.md` (dados reais em
desenvolvimento e senhas em arquivo sao proibicoes explicitas).

## Consequencias

- O Talent OS pode operar nos tres cenarios exigidos: sem IA, com credencial da
  plataforma, ou com credencial propria do cliente, sem que nenhum deles exija
  alterar modulos de negocio.
- Uma Organization pode configurar multiplos providers de forma independente,
  cada um com seu proprio ciclo de vida de credencial, sem que isso implique
  roteamento automatico de nenhuma Feature para nenhum provider.
- Nenhuma credencial real trafega ou repousa no banco principal; o banco
  principal so conhece referencias e metadados.
- A introducao de um novo provider nao exige alterar o dominio de negocio, pois
  a resolucao de provider/credencial e uma preocupacao de infraestrutura
  separada.
- A resolucao de credencial nunca ocorre isoladamente: sempre depende das
  quatro condicoes definidas pelas ADRs 0016 e 0017, reforcando que
  credenciais nunca sao, por si so, autorizacao de execucao.
- Rotacao, substituicao, mudanca de modo e revogacao de credenciais preservam
  continuidade operacional (a configuracao anterior so sai de uso quando a
  nova for validada), sao protegidas contra concorrencia e nunca apagam
  historico.
- Responsabilidades de teste de conexao ficam claramente divididas por papel,
  evitando que Admin ou Platform Admin executem validacao funcional de
  credencial fora de sua competencia.
- A implementacao tecnica do Secret Manager, do fluxo de criptografia, da
  segmentacao de credenciais `platform_managed`, da politica de retencao fisica
  e da infraestrutura de resolucao de provider fica para especificacao e ADR
  proprios, respeitando os principios aqui definidos.

## Fora do escopo

Esta ADR nao define:

- AI Gateway;
- Prompt Registry;
- prompts;
- modelos especificos;
- fallback entre modelos;
- roteamento de Feature para provider (mapeamento Feature x Provider);
- logica de avaliacao;
- matching;
- ranking;
- cobranca final;
- implementacao fisica especifica do Secret Manager (por exemplo, produto ou
  fornecedor escolhido);
- politica numerica exata de rate limit de `test_connection`;
- prazo fisico exato de retencao de segredos antigos no Secret Manager;
- segmentacao fisica exata de credenciais `platform_managed`;
- provider escolhido como padrao da plataforma.

Esses pontos terao ADR ou especificacao posterior.

## Restricoes mantidas

- IA continua sendo capacidade opcional do Talent OS (ADR-0016).
- A regra efetiva de execucao de IA continua exigindo as quatro condicoes das
  ADRs 0016 e 0017, mesmo com credencial configurada e valida.
- Platform Admin nao recebe role funcional dentro da Organization (ADR-0003,
  ADR-0013, ADR-0014, ADR-0016, ADR-0017).
- Nenhuma chave, senha ou token pode ser salva no codigo
  (`CONSTITUICAO_DO_PROJETO.md`).
- Dados de empresas diferentes nunca podem compartilhar contexto de IA
  (`CONSTITUICAO_DO_PROJETO.md`, `AGENTS.md`).
- Toda acao critica sobre credenciais gera auditoria.
- Nao ha exclusao de historico ou auditoria ao alterar, rotacionar ou revogar
  uma credencial.
- Esta ADR nao cria acoplamento entre uma Feature especifica e um provider
  especifico; essa relacao fica para a futura ADR de AI Gateway / Provider
  Routing.
