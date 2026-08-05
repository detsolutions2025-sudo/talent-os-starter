# SPEC-009 - Banco de Perguntas

**Status:** Aprovada  
**Versão:** 1.0  
**Fase:** 6  
**Responsável de negócio:** Thiago Sousa  
**Última atualização:** 2026-08-05

## 1. Objetivo

Especificar um Banco de Perguntas híbrido para o Talent OS, composto por:

- biblioteca global mantida pela plataforma;
- biblioteca própria de cada Organization;
- adoção de perguntas globais pelas Organizations;
- catálogo unificado com identificador operacional próprio;
- associação opcional com competências;
- reutilização futura por vagas, entrevistas, avaliações, onboarding e IA.

Perguntas são itens reutilizáveis. Elas não pertencem diretamente a uma vaga ou
entrevista e não carregam peso, pontuação, obrigatoriedade contextual, resposta
correta ou critério de aprovação.

## 2. Fora do Escopo

- Implementar código, banco, migrations, rotas, testes ou dependências.
- Implementar vagas, entrevistas, avaliações, onboarding, matching ou IA.
- Implementar respostas de candidatos ou colaboradores.
- Implementar respostas corretas.
- Implementar critérios de avaliação, aprovação ou reprovação.
- Implementar pontuação, peso ou obrigatoriedade contextual na pergunta.
- Implementar versionamento formal de perguntas.
- Implementar busca semântica ou deduplicação automática.
- Excluir fisicamente perguntas, adoções ou catalog items.
- Permitir que Organizations editem perguntas globais.

## 3. Usuários Envolvidos

- **Platform Admin:** administra a biblioteca global de perguntas e consulta
  dados de Organization apenas em contexto administrativo auditado.
- **owner:** administra perguntas próprias, altera código próprio, adota
  perguntas globais e consulta histórico da Organization.
- **admin:** administra perguntas próprias, exceto alteração de código após
  criação, adota perguntas globais e consulta histórico da Organization.
- **member:** visualiza apenas perguntas ativas disponíveis no catálogo
  unificado da Organization.

`Platform Admin` não é Role de Membership e não recebe permissões funcionais de
`owner`, `admin` ou `member` dentro da Organization.

## 4. Conceitos

### 4.1 Global Question

Pergunta oficial da plataforma.

- Mantida por Platform Admin.
- Não pertence a uma Organization.
- Pode ser adotada por várias Organizations.
- Não pode ser editada pelas empresas.
- Seu ID interno pode ser usado pela plataforma e pela adoção, mas não deve ser
  usado diretamente por módulos consumidores.

### 4.2 Organization Question

Pergunta própria da empresa.

- Pertence obrigatoriamente a uma Organization.
- Não pode ser acessada por outra Organization.
- Nunca muda de Organization.
- Pode ser associada a zero ou uma competência por
  `competency_catalog_items.id`.
- Seu ID interno não deve ser usado diretamente por módulos consumidores.

### 4.3 Adopted Question

Associação entre uma Organization e uma Global Question.

- Não cria cópia da pergunta global.
- Mantém referência à pergunta global.
- Pode ser ativada ou inativada.
- Preserva histórico.
- Deve ser única por Organization + Global Question.

### 4.4 Question Catalog Item

Entidade conceitual chamada `question_catalog_items`.

Representa um item utilizável no catálogo de perguntas de uma Organization e
fornece a referência operacional unificada para módulos futuros.

Campos conceituais:

- `id`;
- `organization_id`;
- `origin`: `global` ou `organization`;
- `global_question_id`, opcional;
- `organization_question_id`, opcional;
- `status`;
- timestamps.

Regras:

- quando `origin = global`, deve existir `global_question_id` e não deve
  existir `organization_question_id`;
- quando `origin = organization`, deve existir `organization_question_id` e não
  deve existir `global_question_id`;
- o item deve pertencer obrigatoriamente a uma Organization;
- uma pergunta global adotada gera ou mantém um `question_catalog_item`;
- uma pergunta própria ativa também possui um `question_catalog_item`;
- módulos futuros devem referenciar apenas `question_catalog_items.id`;
- módulos futuros nunca devem referenciar diretamente `global_questions.id` ou
  `organization_questions.id`;
- IDs de catalog item nunca podem atravessar Organizations.

## 5. Tipos de Pergunta

Usar tipos canônicos:

- `open_text`
- `long_text`
- `single_choice`
- `multiple_choice`
- `yes_no`
- `numeric`
- `scale`
- `date`
- `situational`
- `behavioral`
- `technical`

A interface pode traduzir os nomes, mas a API e o banco devem preservar os
valores canônicos.

## 6. Categorias Canônicas

Usar categorias canônicas:

- `general`
- `technical`
- `behavioral`
- `situational`
- `culture`
- `leadership`
- `management`
- `compliance`
- `safety`
- `screening`
- `other`

## 7. Status Canônicos

### 7.1 Global Question

- `active`
- `inactive`
- `deprecated`

### 7.2 Organization Question

- `active`
- `inactive`

### 7.3 Adopted Question

- `active`
- `inactive`

### 7.4 Question Catalog Item

- `active`
- `inactive`

Não existe exclusão física. Inativação e depreciação preservam histórico e
vínculos já existentes.

## 8. Fluxos Principais

### 8.1 Administração da Biblioteca Global

1. Platform Admin acessa a biblioteca global de perguntas.
2. Cria ou atualiza uma Global Question.
3. Sistema valida campos, código, tipo, categoria, opções, configurações e
   status.
4. Sistema registra auditoria.
5. Sistema confirma a operação.

### 8.2 Criação de Pergunta Própria

1. Owner ou admin acessa uma Organization ativa.
2. Informa dados da pergunta própria.
3. Sistema valida User ativo, Membership ativo, Organization ativa e role.
4. Sistema valida código, tipo, categoria, opções, configurações e competência
   associada quando houver.
5. Sistema cria a Organization Question.
6. Sistema cria ou mantém o `question_catalog_item` correspondente em transação.
7. Sistema registra auditoria.

### 8.3 Adoção de Pergunta Global

1. Owner ou admin lista perguntas globais disponíveis para adoção.
2. Seleciona uma Global Question `active`.
3. Sistema valida User ativo, Membership ativo, Organization ativa, role e
   status global.
4. Sistema impede adoção duplicada do mesmo par Organization + Global Question.
5. Sistema cria a adoção sem copiar conteúdo global.
6. Sistema cria ou mantém o `question_catalog_item` correspondente em transação.
7. Sistema registra auditoria.

### 8.4 Catálogo Unificado

1. Usuário autorizado acessa o catálogo de perguntas da Organization.
2. Sistema valida contexto e permissão no servidor.
3. Sistema lê `question_catalog_items` da Organization atual.
4. Sistema retorna perguntas próprias ativas e perguntas globais adotadas ativas
   com Global Question `active` ou `deprecated`.
5. Cada item informa origem, identificador operacional unificado, código,
   título, tipo, categoria, status de disponibilidade, status da origem e
   indicação de depreciação quando aplicável.

## 9. Regras de Negócio

- RN-001: Global Question pertence à plataforma e não possui `organization_id`.
- RN-002: Organization Question pertence obrigatoriamente a uma Organization.
- RN-003: Organization Question nunca pode mudar de Organization.
- RN-004: Adopted Question associa uma Organization a uma Global Question sem
  copiar seu conteúdo.
- RN-005: Question Catalog Item fornece o identificador operacional unificado.
- RN-006: Vagas, entrevistas, avaliações, onboarding e IA devem referenciar
  apenas `question_catalog_items.id`.
- RN-007: Módulos futuros nunca devem referenciar diretamente
  `global_questions.id` ou `organization_questions.id`.
- RN-008: Toda leitura e gravação de dados de Organization deve validar a
  Organization atual no servidor.
- RN-009: Identificadores enviados pelo navegador não provam acesso.
- RN-010: Empresa não pode editar pergunta global.
- RN-011: Platform Admin não opera perguntas próprias como owner ou admin.
- RN-012: Somente Platform Admin administra Global Question.
- RN-013: Owner e admin administram Organization Question.
- RN-014: Somente owner pode alterar código de Organization Question após
  criação.
- RN-015: Admin não altera código de Organization Question após criação.
- RN-016: Member não administra perguntas.
- RN-017: Organization arquivada bloqueia operações normais por owner, admin e
  member.
- RN-018: Platform Admin pode consultar dados de Organization apenas em contexto
  administrativo auditado.
- RN-019: Perguntas, adoções e catalog items não são excluídos fisicamente.
- RN-020: Código é obrigatório, normalizado, único conforme escopo e
  case-insensitive para unicidade.
- RN-021: Código não muda automaticamente quando título ou texto mudam.
- RN-022: Código não deve ser usado como referência de domínio.
- RN-023: Título e texto da pergunta são obrigatórios.
- RN-024: Tipos, categorias e status aceitam apenas valores canônicos.
- RN-025: Perguntas `single_choice` e `multiple_choice` exigem opções válidas.
- RN-026: Perguntas que não são de escolha não devem receber opções de escolha.
- RN-027: Perguntas `scale` exigem configurações de escala válidas.
- RN-028: Perguntas `numeric` podem possuir configurações numéricas válidas.
- RN-029: Pergunta não possui peso, pontuação, obrigatoriedade contextual,
  resposta correta ou critério de aprovação.
- RN-030: Qualquer campo de peso ou pontuação enviado nesta fase deve ser
  recusado.
- RN-031: Organization Question pode estar associada a zero ou uma competência.
- RN-032: Quando houver associação com competência, deve usar somente
  `competency_catalog_items.id`.
- RN-033: A competência associada deve pertencer à mesma Organization e estar
  operacionalmente disponível.
- RN-034: Global Question não deve apontar diretamente para catalog item de uma
  Organization.
- RN-035: Na Fase 6, somente perguntas próprias da Organization podem
  referenciar `competency_catalog_items.id`.
- RN-036: Perguntas globais adotadas podem receber vínculo contextual em módulo
  futuro, não nesta SPEC.
- RN-037: Global Question `active` pode ser adotada.
- RN-038: Global Question `deprecated` não aceita novas adoções.
- RN-039: Adoções ativas existentes de Global Question `deprecated` permanecem
  visíveis e utilizáveis enquanto a adoção estiver ativa.
- RN-040: Depreciação global não inativa adoções automaticamente.
- RN-041: Adoção inativa de Global Question `deprecated` não pode ser reativada.
- RN-042: Global Question `inactive` não aceita novas adoções nem novo uso
  operacional.
- RN-043: Inativar adoção inativa o respectivo catalog item.
- RN-044: Reativar adoção é permitido somente quando a Global Question estiver
  `active`.
- RN-045: A implementação deve garantir consistência transacional entre adoção e
  catalog item.
- RN-046: Referências futuras usam IDs internos, nunca texto, título ou código.

## 10. Dados Necessários

### 10.1 Campos Comuns de Pergunta

| Campo                        | Obrigatório | Observação                                          |
| ---------------------------- | ----------: | --------------------------------------------------- |
| `id`                         |         Sim | Identificador interno gerado pelo sistema.          |
| `code`                       |         Sim | Código exibido.                                     |
| `normalized_code`            |         Sim | Representação normalizada para unicidade.           |
| `title`                      |         Sim | Título exibido.                                     |
| `question_text`              |         Sim | Texto completo da pergunta.                         |
| `description`                |         Não | Descrição auxiliar.                                 |
| `type`                       |         Sim | Tipo canônico.                                      |
| `category`                   |         Sim | Categoria canônica.                                 |
| `instructions`               |         Não | Instruções de aplicação ou uso.                     |
| `options`                    | Condicional | Obrigatório para escolhas.                          |
| `settings`                   | Condicional | Configurações de escala ou número quando houver.    |
| `competency_catalog_item_id` |         Não | Apenas para Organization Question nesta fase.       |
| `status`                     |         Sim | Status canônico conforme origem.                    |
| `created_by_user_id`         |         Sim | Usuário responsável pela criação, quando aplicável. |
| `updated_by_user_id`         |         Não | Usuário responsável pela última alteração.          |
| `created_at`                 |         Sim | Data/hora de criação.                               |
| `updated_at`                 |         Sim | Data/hora da última alteração.                      |

Organization Question também deve possuir `organization_id` obrigatório.

### 10.2 Código

O código deve:

- ser obrigatório;
- possuir entre 2 e 50 caracteres;
- aceitar letras, números, hífen e sublinhado;
- preservar o formato exibido;
- usar representação normalizada para unicidade;
- remover espaços laterais na normalização;
- ignorar diferenças entre maiúsculas e minúsculas;
- não ser usado como referência de domínio.

Unicidade:

- Global Question: código único na plataforma.
- Organization Question: código único dentro da Organization.

Após criação:

- somente Platform Admin altera código global;
- somente owner altera código próprio;
- mudança de código gera auditoria.

### 10.3 Título, Texto, Descrição e Instruções

Título:

- obrigatório;
- entre 2 e 150 caracteres.

Texto da pergunta:

- obrigatório;
- entre 2 e 4.000 caracteres.

Descrição:

- opcional;
- até 4.000 caracteres.

Instruções:

- opcionais;
- até 4.000 caracteres.

### 10.4 Opções

Obrigatórias apenas para:

- `single_choice`;
- `multiple_choice`.

Cada opção deve possuir:

- `id` interno estável;
- texto;
- ordem;
- status ativo.

Limites:

- mínimo 2 opções;
- máximo 50 opções;
- até 500 caracteres por opção.

Não definir resposta correta nesta fase.

### 10.5 Escala

Para perguntas `scale`, exigir:

- valor mínimo;
- valor máximo;
- passo;
- rótulo mínimo, opcional;
- rótulo máximo, opcional.

Regras:

- mínimo menor que máximo;
- passo maior que zero;
- máximo de 20 pontos possíveis.

### 10.6 Perguntas Numéricas

Permitir configurações opcionais:

- mínimo;
- máximo;
- casas decimais;
- unidade.

Quando mínimo e máximo existirem, mínimo não pode ser maior que máximo. Casas
decimais devem ser número inteiro não negativo.

## 11. Associação com Competência

Uma pergunta pode estar associada a zero ou uma competência.

Quando associada:

- usar somente `competency_catalog_items.id`;
- a competência deve pertencer à mesma Organization;
- a competência deve estar operacionalmente disponível;
- o servidor deve validar a Organization da competência;
- mensagens de erro não devem revelar competências de outra Organization.

Para perguntas globais, permitir apenas uma referência conceitual global futura,
mas não implementar vínculo global com competência nesta fase.

Na Fase 6:

- somente perguntas próprias da Organization podem referenciar
  `competency_catalog_items.id`;
- perguntas globais adotadas podem receber vínculo contextual em módulo futuro,
  não nesta SPEC.

## 12. Adoção e Catálogo Unificado

Owner e admin podem adotar pergunta global `active`.

Regras:

- adoção única por Organization + Global Question;
- adoção não copia conteúdo;
- adoção cria ou mantém `question_catalog_item`;
- operação transacional;
- inativar adoção inativa o catalog item;
- reativar somente quando permitido;
- catálogo unificado deve ser lido a partir de `question_catalog_items`.

O catálogo unificado da Organization deve conter:

- perguntas próprias ativas;
- perguntas globais adotadas ativas cuja Global Question esteja `active` ou
  `deprecated`.

Cada item deve informar:

- `question_catalog_items.id`;
- origem;
- código;
- título;
- tipo;
- categoria;
- status de disponibilidade;
- status da pergunta de origem;
- indicação de depreciação;
- se pode ser editado pela Organization.

## 13. Depreciação e Inativação Global

Global Question `deprecated`:

- não aceita novas adoções;
- adoções ativas existentes continuam visíveis e utilizáveis;
- não inativa adoções automaticamente;
- adoção inativa não pode ser reativada;
- interface deve sinalizar depreciação;
- vínculos históricos permanecem preservados.

Global Question `inactive`:

- não aceita novas adoções;
- não permite novo uso operacional;
- preserva histórico;
- deve impedir reativação de adoções enquanto permanecer inactive.

## 14. Permissões

Todas as permissões devem ser validadas no servidor, com User ativo, Membership
ativo quando aplicável, Organization ativa para operações normais e role
autorizada.

| Ação                                                      | Platform Admin | owner | admin | member |
| --------------------------------------------------------- | :------------: | :---: | :---: | :----: |
| Criar Global Question                                     |      Sim       |  Não  |  Não  |  Não   |
| Editar Global Question                                    |      Sim       |  Não  |  Não  |  Não   |
| Alterar código global                                     |      Sim       |  Não  |  Não  |  Não   |
| Ativar, inativar ou depreciar Global Question             |      Sim       |  Não  |  Não  |  Não   |
| Consultar histórico global                                |      Sim       |  Não  |  Não  |  Não   |
| Criar Organization Question                               |      Não       |  Sim  |  Sim  |  Não   |
| Editar Organization Question                              |      Não       |  Sim  |  Sim  |  Não   |
| Alterar código de Organization Question após criação      |      Não       |  Sim  |  Não  |  Não   |
| Ativar ou inativar Organization Question                  |      Não       |  Sim  |  Sim  |  Não   |
| Adotar Global Question                                    |      Não       |  Sim  |  Sim  |  Não   |
| Ativar ou inativar adoção                                 |      Não       |  Sim  |  Sim  |  Não   |
| Visualizar perguntas ativas disponíveis                   |      Não       |  Sim  |  Sim  |  Sim   |
| Consultar histórico da Organization                       |      Não       |  Sim  |  Sim  |  Não   |
| Consulta administrativa auditada de dados de Organization |      Sim       |  Não  |  Não  |  Não   |

### 14.1 Platform Admin

Pode criar, editar, alterar código, ativar, inativar, depreciar e consultar
histórico de perguntas globais.

Pode consultar perguntas de Organization somente administrativamente, com motivo
e auditoria.

Não pode operar perguntas próprias como owner/admin.

### 14.2 Owner

Pode criar pergunta própria, editar, alterar código, ativar, inativar, adotar
global, ativar ou inativar adoção, visualizar catálogo unificado e consultar
histórico.

### 14.3 Admin

Pode criar pergunta própria, editar exceto código, ativar, inativar, adotar
global, ativar ou inativar adoção, visualizar catálogo unificado e consultar
histórico.

### 14.4 Member

Pode apenas visualizar perguntas ativas disponíveis no catálogo unificado.

Não pode administrar.

## 15. Peso, Pontuação e Obrigatoriedade

A pergunta não possui:

- peso;
- pontuação;
- obrigatoriedade contextual;
- resposta correta;
- critério de aprovação.

Esses dados pertencem aos módulos consumidores, como entrevistas, vagas,
avaliações, formulários ou onboarding.

Qualquer campo de peso ou pontuação enviado nesta fase deve ser recusado.

## 16. Organization Arquivada

Quando a Organization estiver `archived`:

- owner, admin e member não operam perguntas;
- member não possui consulta operacional normal;
- perguntas, adoções e catalog items permanecem preservados;
- Platform Admin consulta apenas administrativamente, com motivo e auditoria.

## 17. API Conceitual

### 17.1 Plataforma

| Operação                   | Finalidade                                     |
| -------------------------- | ---------------------------------------------- |
| Criar global               | Criar pergunta oficial da plataforma.          |
| Listar globais             | Consultar biblioteca global.                   |
| Consultar global           | Obter detalhes de uma pergunta global.         |
| Atualizar global           | Alterar dados permitidos da pergunta global.   |
| Ativar global              | Liberar uso operacional e novas adoções.       |
| Inativar global            | Bloquear novas adoções e uso operacional novo. |
| Depreciar global           | Preservar histórico e bloquear novas adoções.  |
| Consultar histórico global | Ver auditoria da biblioteca global.            |

### 17.2 Organization

| Operação                            | Finalidade                                        |
| ----------------------------------- | ------------------------------------------------- |
| Criar pergunta própria              | Cadastrar pergunta da Organization atual.         |
| Listar perguntas próprias           | Listar perguntas próprias permitidas.             |
| Listar catálogo unificado           | Ver perguntas próprias e adotadas disponíveis.    |
| Consultar por catalog item          | Obter item operacional unificado permitido.       |
| Atualizar pergunta própria          | Alterar dados autorizados.                        |
| Ativar ou inativar pergunta própria | Controlar uso futuro da pergunta própria.         |
| Listar globais disponíveis          | Ver perguntas globais adotáveis.                  |
| Adotar global                       | Criar associação com uma Global Question.         |
| Ativar ou inativar adoção           | Controlar uso futuro da pergunta adotada.         |
| Consultar histórico                 | Ver eventos da Organization.                      |
| Consulta administrativa auditada    | Permitir consulta excepcional por Platform Admin. |

Todas as operações devem validar IDs no servidor:

- `organizationId`;
- `globalQuestionId`;
- `organizationQuestionId`;
- `adoptionId`;
- `questionCatalogItemId`;
- `competencyCatalogItemId`, quando houver.

## 18. Interface

Interface mínima prevista:

- Biblioteca Global;
- Perguntas da Empresa;
- Catálogo Utilizado;
- criação e edição;
- seleção de tipo e categoria;
- edição de opções;
- configurações de escala;
- configurações numéricas;
- associação opcional com competência;
- adoção de global;
- origem visível;
- filtros;
- sinalização de depreciação;
- mensagens claras de permissão.

A interface pode ocultar ou desabilitar ações não permitidas, mas a autorização
real deve permanecer no servidor.

## 19. Banco de Dados Conceitual

Quando implementada, a funcionalidade deve prever minimamente:

- `global_questions`;
- `organization_questions`;
- `organization_adopted_questions`;
- `question_catalog_items`.

### 19.1 `global_questions`

Campos mínimos:

- `id`;
- `code`;
- `normalized_code`;
- `title`;
- `question_text`;
- `description`;
- `type`;
- `category`;
- `instructions`;
- `options`;
- `settings`;
- `status`;
- `created_by_user_id`;
- `updated_by_user_id`;
- `created_at`;
- `updated_at`.

Restrições esperadas:

- ausência de `organization_id`;
- código global único sem diferenciar maiúsculas/minúsculas;
- unicidade baseada em representação normalizada do código;
- status limitado a `active`, `inactive` e `deprecated`;
- tipo e categoria limitados aos valores canônicos;
- JSONB validado para opções e configurações;
- ausência de exclusão em cascata destrutiva;
- índices para código normalizado, tipo, categoria e status.

### 19.2 `organization_questions`

Campos mínimos:

- todos os campos comuns de pergunta;
- `organization_id`;
- `competency_catalog_item_id`, opcional.

Restrições esperadas:

- `organization_id` obrigatório com chave estrangeira;
- código único por Organization sem diferenciar maiúsculas/minúsculas;
- unicidade baseada em representação normalizada do código;
- status limitado a `active` e `inactive`;
- tipo e categoria limitados aos valores canônicos;
- `competency_catalog_item_id` deve pertencer à mesma Organization;
- bloqueio de mudança de `organization_id`;
- ausência de exclusão em cascata destrutiva;
- índices para `organization_id`, código normalizado, tipo, categoria, status e
  `competency_catalog_item_id`.

### 19.3 `organization_adopted_questions`

Campos mínimos:

- `id`;
- `organization_id`;
- `global_question_id`;
- `status`;
- `adopted_by_user_id`;
- `updated_by_user_id`;
- `created_at`;
- `updated_at`.

Restrições esperadas:

- `organization_id` obrigatório com chave estrangeira;
- `global_question_id` obrigatório com chave estrangeira;
- par `organization_id` + `global_question_id` único;
- status limitado a `active` e `inactive`;
- ausência de exclusão em cascata destrutiva;
- índices para `organization_id`, `global_question_id` e status.

### 19.4 `question_catalog_items`

Campos mínimos:

- `id`;
- `organization_id`;
- `origin`;
- `global_question_id`;
- `organization_question_id`;
- `status`;
- `created_at`;
- `updated_at`.

Restrições esperadas:

- `id` próprio e globalmente único;
- `organization_id` obrigatório com chave estrangeira;
- `origin` limitado a `global` ou `organization`;
- quando `origin = global`, `global_question_id` obrigatório e
  `organization_question_id` nulo;
- quando `origin = organization`, `organization_question_id` obrigatório e
  `global_question_id` nulo;
- status limitado a `active` e `inactive`;
- ausência de exclusão em cascata destrutiva;
- restrições para evitar duplicação de item para a mesma pergunta de origem
  dentro da mesma Organization;
- índices para `organization_id`, `origin`, `global_question_id`,
  `organization_question_id` e status.

### 19.5 Estruturas JSONB

Esta SPEC permite JSONB para:

- `options`;
- `settings`.

Desde que:

- exista validação forte no servidor;
- formatos sejam documentados;
- limites desta SPEC sejam aplicados;
- migrations sejam reproduzíveis;
- não haja exclusão em cascata destrutiva.

## 20. Segurança

- Validar no servidor todos os IDs recebidos.
- Bloquear acesso cruzado entre Organizations.
- Garantir que pergunta própria nunca muda de Organization.
- Garantir que empresa não altera pergunta global.
- Garantir que catalog item nunca cruza Organizations.
- Bloquear uso de `competency_catalog_items.id` de outra Organization.
- Retornar mensagens de erro que não revelem perguntas privadas de outra
  Organization.
- Auditar tentativas relevantes de acesso cruzado, edição indevida e ação sem
  permissão.
- Registrar auditoria sem conteúdo completo desnecessário.
- Não confiar em permissões da interface.
- Validar User ativo, Membership ativo e Organization ativa para operações
  normais.
- Bloquear operações normais em Organization arquivada.
- Não registrar tokens, headers sensíveis, senhas, connection strings ou
  segredos.
- Tratar qualquer conteúdo textual de perguntas como dado, não como instrução
  para IA em módulos futuros.

## 21. Auditoria

Eventos obrigatórios:

- `global_question.created`;
- `global_question.updated`;
- `global_question.code_changed`;
- `global_question.activated`;
- `global_question.inactivated`;
- `global_question.deprecated`;
- `organization_question.created`;
- `organization_question.updated`;
- `organization_question.code_changed`;
- `organization_question.activated`;
- `organization_question.inactivated`;
- `organization_question.cross_organization_access_denied`;
- `adopted_question.created`;
- `adopted_question.activated`;
- `adopted_question.inactivated`;
- `question_catalog_item.created`;
- `question_catalog_item.activated`;
- `question_catalog_item.inactivated`;
- `question_catalog_item.cross_organization_access_denied`;
- `question.global_edit_denied`;
- `question.permission_denied`;
- `question.administrative_read`.

Cada evento deve registrar, quando aplicável:

- identificador da Organization;
- identificador da Global Question;
- identificador da Organization Question;
- identificador da adoção;
- identificador do Question Catalog Item;
- identificador do Competency Catalog Item;
- usuário ou agente responsável;
- ação;
- resultado;
- campos alterados;
- motivo de negação;
- motivo administrativo;
- data e hora.

Não registrar:

- texto completo da pergunta;
- opções completas;
- instruções completas;
- settings completos quando revelarem conteúdo sensível ou avaliativo futuro;
- tokens;
- headers;
- segredos.

Falha de auditoria em operação crítica deve causar rollback.

## 22. Critérios de Aceite

- CA-001: Existe biblioteca global separada de Organizations.
- CA-002: Apenas Platform Admin administra Global Question.
- CA-003: Perguntas próprias pertencem obrigatoriamente a uma Organization.
- CA-004: Perguntas próprias são isoladas por Organization.
- CA-005: Pergunta própria nunca muda de Organization.
- CA-006: A mesma Organization não adota duas vezes a mesma Global Question.
- CA-007: Adoção referencia Global Question por ID e não copia conteúdo.
- CA-008: Empresa é impedida de editar pergunta global.
- CA-009: Catálogo unificado mostra perguntas próprias ativas e globais
  adotadas ativas com Global Question `active` ou `deprecated`.
- CA-010: Catálogo unificado informa origem, `question_catalog_items.id`,
  código, título, tipo, categoria, status, status da origem e depreciação.
- CA-011: Código global é único na plataforma, case-insensitive.
- CA-012: Código próprio é único dentro da Organization, case-insensitive.
- CA-013: Mesmo código próprio pode existir em Organizations diferentes.
- CA-014: Tipos, categorias e status aceitam apenas valores canônicos.
- CA-015: Perguntas de escolha exigem opções válidas.
- CA-016: Perguntas abertas não aceitam opções de escolha.
- CA-017: Pergunta `scale` exige configuração válida.
- CA-018: Configuração numérica inválida é recusada.
- CA-019: Global Question `deprecated` não aceita novas adoções.
- CA-020: Adoções existentes de Global Question `deprecated` permanecem
  visíveis e utilizáveis enquanto ativas.
- CA-021: Global Question `inactive` não aceita novas adoções nem novo uso
  operacional.
- CA-022: Adoção inativa de Global Question `deprecated` não pode ser reativada.
- CA-023: Depreciação global não inativa adoções existentes.
- CA-024: Não existe exclusão física.
- CA-025: Organization arquivada bloqueia operações normais.
- CA-026: Permissões seguem esta SPEC e a SPEC-004.
- CA-027: Tentativas negadas relevantes geram auditoria.
- CA-028: Auditoria não registra conteúdo completo desnecessário.
- CA-029: Acesso cruzado entre Organizations é bloqueado.
- CA-030: Platform Admin consulta dados de Organization apenas
  administrativamente e com auditoria.
- CA-031: Organization Question pode referenciar somente
  `competency_catalog_items.id` da mesma Organization.
- CA-032: Global Question não aponta diretamente para catalog item de
  Organization.
- CA-033: Campo de peso enviado indevidamente é recusado.
- CA-034: Campo de pontuação enviado indevidamente é recusado.
- CA-035: Módulos futuros usam somente `question_catalog_items.id` como
  referência operacional.
- CA-036: `question_catalog_items.id` de outra Organization não pode ser usado.
- CA-037: Unicidade de código usa representação normalizada sem diferenciar
  maiúsculas/minúsculas e sem espaços laterais.
- CA-038: Falha de auditoria crítica causa rollback.

## 23. Testes Obrigatórios

Quando implementada, a funcionalidade deve possuir testes para:

1. Platform Admin criar global.
2. Usuário comum não criar global.
3. Código global duplicado.
4. Unicidade global sem diferenciar maiúsculas/minúsculas.
5. Owner criar própria.
6. Admin criar própria.
7. Member não criar.
8. Código próprio duplicado na mesma Organization.
9. Mesmo código em Organizations diferentes.
10. Owner alterar código próprio.
11. Admin não alterar código próprio.
12. Empresa não editar global.
13. Adoção ativa.
14. Adoção duplicada.
15. Catalog item criado.
16. Global deprecated bloquear nova adoção.
17. Adoção existente continuar utilizável.
18. Global inactive bloquear uso novo.
19. Reativação de adoção conforme status global.
20. Tipo inválido.
21. Categoria inválida.
22. Opções ausentes em pergunta de escolha.
23. Opções indevidas em pergunta aberta.
24. Escala inválida.
25. Configuração numérica inválida.
26. Peso enviado indevidamente.
27. Pontuação enviada indevidamente.
28. Competência de outra Organization.
29. Catalog item de pergunta de outra Organization.
30. User sem Membership.
31. Membership inativo.
32. User inativo.
33. Organization arquivada.
34. Manipulação de `organizationId`.
35. Manipulação de `globalQuestionId`.
36. Manipulação de `organizationQuestionId`.
37. Manipulação de `adoptionId`.
38. Manipulação de `questionCatalogItemId`.
39. Manipulação de `competencyCatalogItemId`.
40. Platform Admin apenas consultar administrativamente.
41. Auditoria das operações principais.
42. Auditoria sem texto completo.
43. Rollback quando auditoria falha.
44. Concorrência de adoção.
45. Ausência de exclusão física.
46. Persistência após recriar aplicação.

## 24. Limitações Conhecidas

- Esta SPEC não implementa código.
- Esta SPEC não cria banco, migrations, rotas, testes ou dependências.
- Não há respostas de candidatos ou colaboradores.
- Não há resposta correta.
- Não há critérios de avaliação ou aprovação.
- Não há peso, pontuação ou obrigatoriedade contextual na pergunta.
- Não há versionamento formal de perguntas.
- Não há snapshots históricos de pergunta nesta fase.
- Não há busca semântica ou deduplicação automática.
- Não há vagas, entrevistas, avaliações, onboarding, matching ou IA nesta fase.
- Perguntas globais não possuem vínculo direto com `competency_catalog_items.id`
  nesta fase.

## 25. Definição de Concluído

Para a implementação futura desta SPEC:

- SPEC aprovada antes do desenvolvimento;
- ADR-0011 aceita ou ajustada;
- critérios de aceite atendidos;
- testes obrigatórios implementados e passando;
- testes de segurança passando;
- testes de acesso cruzado passando;
- testes de concorrência e transação passando;
- regras de segurança verificadas;
- migrations reproduzíveis quando houver banco;
- lint passando;
- formatação passando;
- build passando;
- documentação atualizada;
- auditoria revisada;
- nenhuma funcionalidade futura implementada antecipadamente;
- commit realizado.
