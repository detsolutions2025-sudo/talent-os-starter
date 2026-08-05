# SPEC-007 - Catalogo de Competencias

**Status:** Aprovada  
**Versao:** 1.0  
**Fase:** 4  
**Responsavel de negocio:** Thiago Sousa  
**Ultima atualizacao:** 2026-08-05

## 1. Objetivo

Especificar um catalogo hibrido de competencias para o Talent OS, composto por:

- biblioteca global mantida pela plataforma;
- biblioteca propria de cada Organization;
- adocao de competencias globais pelas Organizations;
- catalogo unificado com identificador operacional proprio para uso futuro por
  cargos, vagas, entrevistas, avaliacoes e IA.

Esta SPEC define regras de negocio, permissoes, dados, seguranca, auditoria,
modelo conceitual de banco, interface minima, criterios de aceite e testes
obrigatorios.

## 2. Fora do escopo

- Implementar codigo, rotas, componentes, banco, migrations ou dependencias.
- Criar categorias personalizadas.
- Versionar formalmente competencias.
- Implementar cargos, vagas, entrevistas, avaliacoes, matching, IA ou
  recomendacoes.
- Implementar busca semantica, ranking ou deduplicacao automatica.
- Permitir exclusao fisica de competencias ou adocoes.
- Permitir que empresas editem conteudo de competencias globais.
- Criar regras de permissao fora da matriz centralizada.

## 3. Usuarios envolvidos

- **Platform Admin:** perfil interno da plataforma. Administra somente a
  biblioteca global e pode consultar dados de Organization apenas em contexto
  administrativo auditado.
- **owner:** usuario com Membership ativo na Organization. Administra
  competencias proprias e adocoes, incluindo alteracao de codigo proprio.
- **admin:** usuario com Membership ativo na Organization. Administra
  competencias proprias e adocoes, exceto alteracao de codigo proprio apos
  criacao.
- **member:** usuario com Membership ativo na Organization. Visualiza apenas
  competencias ativas disponiveis para uso na Organization.

`Platform Admin` nao e Role de Membership e nao recebe role funcional dentro da
Organization.

## 4. Conceitos

Nota de terminologia: o termo "importar", usado em documentos anteriores,
significa "adotar" e nao representa copia de dados. Nesta SPEC, o termo oficial
e "adotar".

### 4.1 Global Competency

Competencia oficial criada e mantida pela plataforma.

- Pertence a plataforma.
- Nao pertence a uma Organization.
- Somente Platform Admin pode criar, alterar, ativar, inativar ou depreciar.
- Empresas nao podem editar seu conteudo.
- Pode ser adotada por varias Organizations.
- Seu ID interno pode ser usado pela plataforma e pela adocao, mas nao deve ser
  usado diretamente por cargos, vagas, entrevistas, avaliacoes ou IA.

### 4.2 Organization Competency

Competencia propria de uma Organization.

- Pertence obrigatoriamente a uma Organization.
- Pode ser criada e alterada por usuarios autorizados da Organization ativa.
- Nao pode ser visualizada por outra Organization.
- Nunca pode mudar de Organization.
- Seu ID interno pode ser usado pela propria estrutura da competencia, mas nao
  deve ser usado diretamente por cargos, vagas, entrevistas, avaliacoes ou IA.

### 4.3 Adopted Competency

Associacao entre uma Organization e uma Global Competency.

- Nao copia a competencia global.
- Referencia a competencia global pelo ID interno.
- Permite que a Organization passe a utilizar a competencia global.
- Nao permite alterar o conteudo global.
- Pode ser inativada para impedir uso futuro sem apagar historico.
- Deve ser unica por par Organization + Global Competency.

`organization_adopted_competencies` controla a adocao e seu historico. Ela nao e
a referencia operacional que modulos futuros devem usar.

### 4.4 Competency Catalog Item

Entidade conceitual chamada `competency_catalog_items`.

Representa um item utilizavel no catalogo de uma Organization e fornece a
referencia operacional unificada para modulos futuros.

- Possui `id` proprio e globalmente unico.
- Pertence obrigatoriamente a uma Organization.
- Possui origem `global` ou `organization`.
- Quando a origem e `global`, referencia uma Global Competency adotada.
- Quando a origem e `organization`, referencia uma Organization Competency.
- Cargos, vagas, entrevistas, avaliacoes e IA devem referenciar apenas
  `competency_catalog_items.id`.
- Modulos futuros nunca devem referenciar diretamente `global_competencies.id`
  ou `organization_competencies.id`.
- A origem deve continuar disponivel para exibicao e autorizacao.
- IDs de catalog item nunca podem atravessar Organizations.

## 5. Categorias canonicas

As categorias persistidas e expostas pela API nesta fase sao fixas:

- `technical`
- `behavioral`
- `leadership`
- `management`
- `tools`
- `languages`
- `compliance`
- `safety`
- `other`

A interface pode exibir nomes em portugues, mas os valores tecnicos persistidos
devem permanecer canonicos. Categorias personalizadas nao fazem parte desta fase.

## 6. Status canonicos

### 6.1 Global Competency

- `active`
- `inactive`
- `deprecated`

### 6.2 Organization Competency

- `active`
- `inactive`

### 6.3 Adopted Competency

- `active`
- `inactive`

### 6.4 Competency Catalog Item

- `active`
- `inactive`

Nao existe exclusao fisica. Inativacao e depreciacao preservam historico e
vinculos ja existentes.

## 7. Fluxos principais

### 7.1 Administracao da biblioteca global

1. Platform Admin acessa a biblioteca global.
2. Cria ou atualiza uma Global Competency.
3. Sistema valida campos, codigo, categoria, status e niveis.
4. Sistema persiste a alteracao em transacao quando aplicavel.
5. Sistema registra auditoria.
6. Sistema confirma a operacao.

### 7.2 Criacao de competencia propria

1. Owner ou admin acessa uma Organization ativa.
2. Informa os dados da Organization Competency.
3. Sistema valida Membership ativo, Organization atual, permissao e campos.
4. Sistema impede codigo duplicado dentro da Organization.
5. Sistema salva a competencia vinculada a Organization.
6. Sistema registra auditoria.

### 7.3 Adocao de competencia global

1. Owner ou admin lista competencias globais disponiveis para adocao.
2. Seleciona uma Global Competency ativa.
3. Sistema valida Organization atual, Membership, permissao e status global.
4. Sistema impede adocao duplicada do mesmo par Organization + Global
   Competency.
5. Sistema cria a associacao sem copiar o conteudo global.
6. Sistema cria ou atualiza o `competency_catalog_item` correspondente em
   transacao.
7. Sistema registra auditoria.

### 7.4 Catalogo unificado da Organization

1. Usuario autorizado acessa o catalogo da Organization atual ativa.
2. Sistema valida contexto e permissao no servidor.
3. Sistema le `competency_catalog_items` da Organization atual.
4. Sistema retorna competencias proprias ativas e competencias globais adotadas
   com adocao ativa e Global Competency `active` ou `deprecated`.
5. Cada item informa origem, identificador operacional unificado, nome, codigo,
   categoria, status de disponibilidade, status da competencia de origem e se
   pode ser editado pela Organization.

## 8. Regras de negocio

- RN-001: Global Competency pertence a plataforma e nao possui
  `organization_id`.
- RN-002: Organization Competency pertence obrigatoriamente a uma Organization.
- RN-003: Adopted Competency associa uma Organization a uma Global Competency
  sem copiar seu conteudo.
- RN-003A: `competency_catalog_items` fornece o identificador operacional
  unificado que modulos futuros devem usar.
- RN-003B: Cargos, vagas, entrevistas, avaliacoes e IA devem referenciar apenas
  `competency_catalog_items.id`.
- RN-003C: Modulos futuros nunca devem referenciar diretamente
  `global_competencies.id` ou `organization_competencies.id`.
- RN-003D: Um `competency_catalog_item` pertence obrigatoriamente a uma
  Organization e nunca pode ser usado no contexto de outra Organization.
- RN-004: Toda leitura e gravacao de dados de Organization deve validar a
  Organization atual no servidor.
- RN-005: Identificadores enviados pelo navegador nao provam acesso.
- RN-006: Competencia propria nunca pode mudar de Organization.
- RN-007: Empresa nao pode editar competencia global.
- RN-008: Platform Admin nao opera competencias proprias como owner ou admin.
- RN-009: Global Competency so pode ser criada, editada, ativada, inativada ou
  depreciada por Platform Admin.
- RN-010: Organization Competency pode ser criada e alterada por owner ou admin
  da Organization ativa.
- RN-011: Somente owner pode alterar codigo de Organization Competency apos
  criacao.
- RN-012: Member nao administra competencias.
- RN-013: Organization arquivada bloqueia criacao, edicao, adocao, ativacao e
  inativacao por owner, admin e member.
- RN-014: Organization arquivada nao possui consulta operacional normal por
  member.
- RN-015: Platform Admin pode consultar dados de Organization arquivada ou ativa
  apenas em contexto administrativo auditado.
- RN-016: Competencias e adocoes nao sao excluidas fisicamente.
- RN-017: Codigo e obrigatorio, normalizado, unico conforme escopo e
  case-insensitive para unicidade.
- RN-018: Codigo nao muda automaticamente quando o nome muda.
- RN-019: Nome nao e identificador tecnico.
- RN-020: Nomes podem se repetir entre Organizations diferentes e podem
  coincidir com nomes globais.
- RN-021: Competencia ativa deve possuir definicao obrigatoria.
- RN-022: Para ativacao, os cinco niveis de proficiencia sao obrigatorios.
- RN-023: Global Competency `active` pode ser adotada.
- RN-024: Global Competency `deprecated` nao aceita novas adocoes.
- RN-025: Global Competency `inactive` nao aceita novas adocoes nem uso
  operacional novo.
- RN-026: Adocao inativa nao pode ser usada em novos vinculos futuros.
- RN-027: Reativacao de adocao e permitida somente quando a Global Competency
  associada estiver `active`.
- RN-028: Catalogo unificado nao deve duplicar IDs nem tratar nome como chave.
- RN-029: Referencias futuras devem usar `competency_catalog_items.id`.
- RN-030: Mudancas relevantes devem gerar auditoria.
- RN-031: Alteracoes de conteudo podem impactar usos futuros, mas nao devem
  reescrever snapshots historicos de modulos futuros.
- RN-032: Uma competencia global adotada deve possuir um
  `competency_catalog_item` associado.
- RN-033: Uma competencia propria ativa deve possuir um
  `competency_catalog_item` associado.
- RN-034: O catalogo unificado deve ser lido a partir de
  `competency_catalog_items`.
- RN-035: `organization_adopted_competencies` controla a adocao e seu historico;
  `competency_catalog_items` fornece o identificador operacional unificado.
- RN-036: A implementacao deve garantir consistencia transacional entre
  `organization_adopted_competencies` e `competency_catalog_items`.
- RN-037: A mudanca de Global Competency de `active` para `deprecated` nao
  inativa automaticamente adocoes existentes.
- RN-038: Adocoes ativas ja existentes de uma Global Competency `deprecated`
  permanecem visiveis no catalogo da Organization.
- RN-039: Adocoes ativas ja existentes de uma Global Competency `deprecated`
  podem continuar sendo usadas operacionalmente.
- RN-040: A interface deve sinalizar claramente quando uma competencia global
  adotada estiver depreciada.
- RN-041: Uma adocao inativa de Global Competency `deprecated` nao pode ser
  reativada.
- RN-042: Vinculos historicos existentes permanecem preservados.
- RN-043: Modulos futuros devem impedir novo uso apenas quando a adocao estiver
  inativa ou a Global Competency estiver `inactive`.
- RN-044: Mudanca de Global Competency de `active` para `deprecated` deve gerar
  auditoria.

## 9. Dados necessarios

### 9.1 Campos comuns de competencia

| Campo                | Obrigatorio | Observacao                                          |
| -------------------- | ----------: | --------------------------------------------------- |
| `id`                 |         Sim | Identificador interno gerado pelo sistema.          |
| `code`               |         Sim | Codigo tecnico normalizado e unico no escopo.       |
| `name`               |         Sim | Nome exibido da competencia.                        |
| `category`           |         Sim | Valor canonico definido nesta SPEC.                 |
| `definition`         | Condicional | Obrigatorio para competencia ativa.                 |
| `positive_evidences` |         Sim | Lista estruturada, pode ser vazia quando permitido. |
| `negative_evidences` |         Sim | Lista estruturada, pode ser vazia quando permitido. |
| `practical_examples` |         Nao | Lista estruturada opcional.                         |
| `proficiency_levels` |         Sim | Cinco niveis obrigatorios para ativacao.            |
| `status`             |         Sim | Status canonico conforme o tipo da competencia.     |
| `created_by_user_id` |         Sim | Autor da criacao, quando houver usuario aplicavel.  |
| `updated_by_user_id` |         Nao | Ultimo usuario que alterou, quando aplicavel.       |
| `created_at`         |         Sim | Data/hora de criacao.                               |
| `updated_at`         |         Sim | Data/hora da ultima alteracao.                      |

Organization Competency tambem deve possuir `organization_id` obrigatorio.

### 9.2 Codigo

O codigo deve:

- ser obrigatorio;
- possuir entre 2 e 50 caracteres;
- aceitar letras, numeros, hifen e sublinhado;
- possuir uma representacao normalizada para unicidade;
- nao diferenciar maiusculas e minusculas para unicidade;
- nao mudar automaticamente quando o nome mudar.

O `code` exibido pode preservar a forma informada pelo usuario, respeitados os
caracteres permitidos. A unicidade deve usar uma representacao normalizada que:

- remova espacos laterais;
- ignore diferencas entre maiusculas e minusculas.

A implementacao pode usar coluna derivada, indice funcional ou mecanismo
equivalente no PostgreSQL. O valor normalizado nao deve ser usado como
referencia de dominio.

Regras de unicidade:

- Global Competency: codigo unico na plataforma.
- Organization Competency: codigo unico dentro da Organization.

Apos criacao:

- somente Platform Admin pode alterar codigo global;
- somente owner pode alterar codigo de competencia propria;
- mudanca de codigo deve gerar auditoria.

### 9.3 Nome

O nome deve:

- ser obrigatorio;
- possuir entre 2 e 150 caracteres;
- poder se repetir entre Organizations diferentes;
- poder coincidir com nome de competencia global;
- nao ser usado como identificador tecnico.

### 9.4 Definicao

- Campo obrigatorio para competencia ativa.
- Limite inicial: ate 4.000 caracteres.

### 9.5 Evidencias positivas e negativas

Cada item deve possuir:

- texto;
- ordem de exibicao.

Limites:

- ate 30 evidencias positivas;
- ate 30 evidencias negativas;
- ate 500 caracteres por item.

### 9.6 Exemplos praticos

Lista opcional de situacoes ou aplicacoes concretas.

Limites:

- ate 20 exemplos;
- ate 1.000 caracteres por exemplo.

### 9.7 Niveis de proficiencia

Usar cinco niveis fixos:

1. `basic`
2. `intermediate`
3. `proficient`
4. `advanced`
5. `reference`

Cada nivel deve possuir:

- numero de 1 a 5;
- codigo canonico;
- nome exibido;
- descricao;
- evidencias observaveis opcionais.

Regras:

- os cinco niveis sao obrigatorios para ativacao;
- numeros nao podem se repetir;
- codigos nao podem se repetir;
- ordem e fixa de 1 a 5;
- descricao de cada nivel e obrigatoria;
- cada descricao pode possuir ate 2.000 caracteres.

### 9.8 Competency Catalog Item

Cada `competency_catalog_item` deve possuir:

| Campo                        | Obrigatorio | Observacao                                  |
| ---------------------------- | ----------: | ------------------------------------------- |
| `id`                         |         Sim | Identificador proprio e globalmente unico.  |
| `organization_id`            |         Sim | Organization dona do item de catalogo.      |
| `origin`                     |         Sim | `global` ou `organization`.                 |
| `global_competency_id`       | Condicional | Obrigatorio quando `origin = global`.       |
| `organization_competency_id` | Condicional | Obrigatorio quando `origin = organization`. |
| `status`                     |         Sim | Status operacional do item no catalogo.     |
| `created_at`                 |         Sim | Data/hora de criacao.                       |
| `updated_at`                 |         Sim | Data/hora da ultima alteracao.              |

Regras:

- quando `origin = global`, deve existir `global_competency_id` e nao deve
  existir `organization_competency_id`;
- quando `origin = organization`, deve existir `organization_competency_id` e
  nao deve existir `global_competency_id`;
- o item deve pertencer obrigatoriamente a uma Organization;
- uma competencia global adotada gera um `competency_catalog_item`;
- uma competencia propria ativa tambem possui um `competency_catalog_item`;
- a origem deve continuar disponivel para exibicao e autorizacao;
- IDs de catalog item nunca podem atravessar Organizations.

## 10. Permissoes

| Acao                                                      | Platform Admin | owner | admin | member |
| --------------------------------------------------------- | :------------: | :---: | :---: | :----: |
| Criar Global Competency                                   |      Sim       |  Nao  |  Nao  |  Nao   |
| Editar Global Competency                                  |      Sim       |  Nao  |  Nao  |  Nao   |
| Alterar codigo global                                     |      Sim       |  Nao  |  Nao  |  Nao   |
| Ativar, inativar ou depreciar Global Competency           |      Sim       |  Nao  |  Nao  |  Nao   |
| Consultar historico global                                |      Sim       |  Nao  |  Nao  |  Nao   |
| Visualizar catalogo global disponivel                     |      Sim       |  Sim  |  Sim  |  Nao   |
| Criar Organization Competency                             |      Nao       |  Sim  |  Sim  |  Nao   |
| Editar Organization Competency                            |      Nao       |  Sim  |  Sim  |  Nao   |
| Alterar codigo de Organization Competency apos criacao    |      Nao       |  Sim  |  Nao  |  Nao   |
| Ativar ou inativar Organization Competency                |      Nao       |  Sim  |  Sim  |  Nao   |
| Adotar Global Competency                                  |      Nao       |  Sim  |  Sim  |  Nao   |
| Ativar ou inativar adocao                                 |      Nao       |  Sim  |  Sim  |  Nao   |
| Visualizar competencias ativas disponiveis para uso       |      Nao       |  Sim  |  Sim  |  Sim   |
| Consultar historico da Organization                       |      Nao       |  Sim  |  Sim  |  Nao   |
| Consulta administrativa auditada de dados de Organization |      Sim       |  Nao  |  Nao  |  Nao   |

Todas as permissoes dependem de User ativo, Membership ativo quando aplicavel,
Organization ativa quando aplicavel e autorizacao validada no servidor.

## 11. Operacoes conceituais

### 11.1 Plataforma

| Operacao                     | Finalidade                                     |
| ---------------------------- | ---------------------------------------------- |
| Criar competencia global     | Cadastrar competencia oficial da plataforma.   |
| Listar catalogo global       | Consultar biblioteca global.                   |
| Consultar competencia global | Ver detalhes de uma competencia global.        |
| Atualizar competencia global | Alterar conteudo ou metadados permitidos.      |
| Ativar competencia global    | Liberar uso operacional e novas adocoes.       |
| Inativar competencia global  | Bloquear novas adocoes e uso operacional novo. |
| Depreciar competencia global | Preservar historico e bloquear novas adocoes.  |
| Consultar historico global   | Ver eventos de auditoria da biblioteca global. |

### 11.2 Organization

| Operacao                               | Finalidade                                        |
| -------------------------------------- | ------------------------------------------------- |
| Criar competencia propria              | Cadastrar competencia da Organization atual.      |
| Listar catalogo unificado              | Ver competencias proprias e adotadas ativas.      |
| Consultar competencia                  | Ver detalhes permitidos da competencia.           |
| Atualizar competencia propria          | Alterar dados autorizados.                        |
| Ativar ou inativar competencia propria | Controlar uso futuro da competencia propria.      |
| Listar globais disponiveis             | Ver competencias globais adotaveis.               |
| Adotar competencia global              | Criar associacao com uma Global Competency.       |
| Ativar ou inativar adocao              | Controlar uso futuro da competencia adotada.      |
| Consultar catalog item                 | Validar item operacional unificado permitido.     |
| Consultar historico                    | Ver eventos da Organization.                      |
| Consulta administrativa auditada       | Permitir consulta excepcional por Platform Admin. |

## 12. Catalogo unificado da Organization

A Organization deve visualizar em uma mesma listagem:

- competencias proprias ativas;
- competencias globais adotadas ativas cuja Global Competency esteja `active`
  ou `deprecated`.

Cada item deve informar:

- origem: `global` ou `organization`;
- identificador operacional unificado (`competency_catalog_items.id`);
- nome;
- codigo;
- categoria;
- status de disponibilidade;
- status da competencia de origem;
- se pode ser editado pela Organization.

Regras:

- Nome nao pode ser usado como chave.
- IDs de Global Competency e Organization Competency nao devem ser usados por
  modulos futuros como referencia operacional.
- O catalogo unificado deve ser lido a partir de `competency_catalog_items`.
- Competencias globais aparecem para a Organization somente quando adotadas,
  com adocao ativa e status global `active` ou `deprecated`.
- Competencias globais adotadas com status global `deprecated` permanecem
  visiveis e utilizaveis enquanto a adocao estiver ativa.
- Competencias globais adotadas com status global `inactive` nao aparecem para
  novo uso operacional.
- Competencias proprias de outra Organization nunca aparecem.
- Adocao inativa e competencia propria inativa nao aparecem para uso operacional
  novo.
- Cargos, vagas, entrevistas, avaliacoes e IA devem receber somente
  `competency_catalog_items.id`.

## 13. Interface

Interface minima prevista:

- aba "Biblioteca Global";
- aba "Competencias da Empresa";
- aba "Catalogo Utilizado";
- formulario para criar competencia propria;
- edicao de competencia propria;
- ativacao e inativacao de competencia propria;
- adocao de competencia global;
- ativacao e inativacao de adocao;
- indicacao clara de origem `global` ou `organization`;
- sinalizacao clara quando uma competencia global adotada estiver depreciada;
- visualizacao de niveis de proficiencia;
- visualizacao de evidencias positivas e negativas;
- visualizacao de exemplos praticos;
- filtros por categoria e status;
- mensagens claras de permissao.

Nao implementar design avancado nesta fase. A interface pode ocultar ou
desabilitar acoes nao permitidas, mas a autorizacao real deve permanecer no
servidor.

## 14. Banco de dados

Quando implementada, a funcionalidade deve prever minimamente quatro estruturas:

- `global_competencies`;
- `organization_competencies`;
- `organization_adopted_competencies`.
- `competency_catalog_items`.

### 14.1 `global_competencies`

Campos minimos:

- `id`;
- `code`;
- `name`;
- `category`;
- `definition`;
- `positive_evidences`;
- `negative_evidences`;
- `practical_examples`;
- `proficiency_levels`;
- `status`;
- `created_by_user_id`;
- `updated_by_user_id`;
- `created_at`;
- `updated_at`.

Restricoes esperadas:

- codigo global unico sem diferenciar maiusculas e minusculas;
- unicidade baseada em representacao normalizada do codigo;
- status limitado a `active`, `inactive` e `deprecated`;
- categoria limitada aos valores canonicos;
- ausencia de `organization_id`;
- ausencia de exclusao em cascata destrutiva;
- indices para codigo normalizado, categoria e status.

### 14.2 `organization_competencies`

Campos minimos:

- `id`;
- `organization_id`;
- `code`;
- `name`;
- `category`;
- `definition`;
- `positive_evidences`;
- `negative_evidences`;
- `practical_examples`;
- `proficiency_levels`;
- `status`;
- `created_by_user_id`;
- `updated_by_user_id`;
- `created_at`;
- `updated_at`.

Restricoes esperadas:

- `organization_id` obrigatorio com chave estrangeira;
- codigo unico por Organization sem diferenciar maiusculas e minusculas;
- unicidade baseada em representacao normalizada do codigo;
- status limitado a `active` e `inactive`;
- categoria limitada aos valores canonicos;
- bloqueio de mudanca de `organization_id`;
- ausencia de exclusao em cascata destrutiva;
- indices para `organization_id`, codigo normalizado, categoria e status.

### 14.3 `organization_adopted_competencies`

Campos minimos:

- `id`;
- `organization_id`;
- `global_competency_id`;
- `status`;
- `adopted_by_user_id`;
- `created_at`;
- `updated_at`;
- `updated_by_user_id`.

Restricoes esperadas:

- `organization_id` obrigatorio com chave estrangeira;
- `global_competency_id` obrigatorio com chave estrangeira;
- par `organization_id` + `global_competency_id` unico;
- status limitado a `active` e `inactive`;
- ausencia de exclusao em cascata destrutiva;
- indices para `organization_id`, `global_competency_id` e status.

`organization_adopted_competencies` controla a adocao e seu historico. Ela deve
ser mantida consistente com `competency_catalog_items` em transacao.

### 14.4 `competency_catalog_items`

Campos minimos:

- `id`;
- `organization_id`;
- `origin`;
- `global_competency_id`;
- `organization_competency_id`;
- `status`;
- `created_at`;
- `updated_at`.

Restricoes esperadas:

- `id` proprio e globalmente unico;
- `organization_id` obrigatorio com chave estrangeira;
- `origin` limitado a `global` ou `organization`;
- quando `origin = global`, `global_competency_id` obrigatorio e
  `organization_competency_id` nulo;
- quando `origin = organization`, `organization_competency_id` obrigatorio e
  `global_competency_id` nulo;
- status limitado a `active` e `inactive`;
- ausencia de exclusao em cascata destrutiva;
- bloqueio de uso do item fora da sua Organization;
- indices para `organization_id`, `origin`, `global_competency_id`,
  `organization_competency_id` e status;
- restricoes para evitar duplicacao de item para a mesma competencia de origem
  dentro da mesma Organization.

`competency_catalog_items` fornece o identificador operacional unificado.
Cargos, vagas, entrevistas, avaliacoes e IA devem referenciar apenas
`competency_catalog_items.id`. A implementacao deve garantir consistencia
transacional entre:

- criacao, ativacao e inativacao de `organization_adopted_competencies`;
- criacao, ativacao e inativacao do respectivo `competency_catalog_item`;
- ativacao e inativacao de Organization Competency e seu respectivo
  `competency_catalog_item`.

### 14.5 Estruturas JSON

Esta SPEC permite JSONB para listas estruturadas de evidencias, exemplos e
niveis, desde que:

- exista validacao forte no servidor;
- o formato seja documentado;
- os limites desta SPEC sejam aplicados;
- nao haja dependencia de pesquisa complexa nesses itens nesta fase.

Formato conceitual:

- evidencias: lista de objetos com `text` e `display_order`;
- exemplos: lista de objetos com `text` e `display_order`;
- niveis: lista de objetos com `number`, `code`, `display_name`,
  `description` e `observable_evidences`.

Migrations futuras devem ser reproduziveis, compativeis com PostgreSQL/Supabase
e sem mudancas destrutivas sem revisao humana.

## 15. Seguranca

- Validar no servidor `organizationId`, `competencyId`,
  `globalCompetencyId` e `competencyCatalogItemId`.
- Bloquear acesso cruzado entre Organizations.
- Bloquear uso de `competency_catalog_items.id` de outra Organization.
- Nunca confiar no identificador enviado pelo navegador como prova de acesso.
- Impedir que competencia propria mude de Organization.
- Impedir que empresa altere competencia global.
- Impedir que Platform Admin receba role funcional de Membership.
- Limitar consultas sempre ao contexto correto.
- Retornar mensagens de erro que nao revelem competencias privadas de outra
  Organization.
- Auditar tentativas relevantes de acesso cruzado, edicao indevida e acao sem
  permissao.
- Registrar auditoria sem conteudo completo desnecessario.
- Nao usar dados reais em testes ou exemplos.
- Nao expor segredos, tokens, connection strings ou dados pessoais
  desnecessarios em logs.
- Tratar qualquer conteudo textual de competencias como dado, nao como instrucao
  para IA em modulos futuros.
- Impedir que modulos futuros usem diretamente IDs das tabelas de origem como
  referencia operacional.

## 16. Auditoria

Eventos obrigatorios:

- `global_competency.created`;
- `global_competency.updated`;
- `global_competency.code_changed`;
- `global_competency.activated`;
- `global_competency.inactivated`;
- `global_competency.deprecated`;
- `organization_competency.created`;
- `organization_competency.updated`;
- `organization_competency.code_changed`;
- `organization_competency.activated`;
- `organization_competency.inactivated`;
- `organization_competency.cross_organization_access_denied`;
- `adopted_competency.created`;
- `adopted_competency.activated`;
- `adopted_competency.inactivated`;
- `competency_catalog_item.created`;
- `competency_catalog_item.activated`;
- `competency_catalog_item.inactivated`;
- `competency_catalog_item.cross_organization_access_denied`;
- `competency.global_edit_denied`;
- `competency.permission_denied`;
- `competency.administrative_read`;

Cada evento deve registrar, quando aplicavel:

- identificador da Organization;
- identificador da Global Competency;
- identificador da Organization Competency;
- identificador da adocao;
- identificador do Competency Catalog Item;
- usuario ou agente responsavel;
- acao;
- data e hora;
- resultado;
- campos alterados;
- motivo de negacao.

Eventos comuns nao devem registrar listas completas de evidencias, exemplos ou
niveis. Devem registrar identificadores, acao e campos alterados.

## 17. Imutabilidade e historico

Competencias nao sao versionadas formalmente nesta fase.

Entretanto:

- alteracoes relevantes devem gerar auditoria;
- referencias futuras sempre usam `competency_catalog_items.id`;
- dados historicos nao podem ser apagados;
- inativacao nao quebra vinculos ja existentes;
- depreciacao de Global Competency nao inativa automaticamente adocoes
  existentes;
- mudancas de conteudo podem impactar usos futuros;
- mudancas de conteudo nao devem reescrever snapshots historicos de modulos
  futuros.

Limitacao registrada: sem versionamento formal, o catalogo representa o estado
atual da competencia. Modulos futuros que precisem preservar texto, evidencias
ou niveis no momento do uso devem criar snapshots proprios, referenciando o
`competency_catalog_items.id` usado na operacao.

## 18. Organization arquivada

Quando a Organization estiver `archived`:

- owner, admin e member nao podem criar, editar, adotar, ativar ou inativar
  competencias;
- member nao possui consulta operacional normal;
- Platform Admin pode consultar somente em contexto administrativo auditado;
- competencias proprias e adocoes permanecem preservadas;
- nenhuma competencia ou adocao e excluida fisicamente.

## 19. Criterios de aceite

- CA-001: Biblioteca global existe separada de Organizations.
- CA-002: Apenas Platform Admin administra Global Competency.
- CA-003: Competencias proprias pertencem obrigatoriamente a uma Organization.
- CA-004: Competencias proprias sao isoladas por Organization.
- CA-005: A mesma Organization nao adota duas vezes a mesma Global Competency.
- CA-006: Adocao referencia Global Competency por ID e nao copia conteudo.
- CA-007: Empresa e impedida de editar competencia global.
- CA-008: Catalogo unificado mostra competencias proprias ativas e globais
  adotadas ativas com Global Competency `active` ou `deprecated`.
- CA-009: Catalogo unificado informa origem, `competency_catalog_items.id`,
  codigo, nome, categoria, status, status da origem e editabilidade.
- CA-010: Codigo global e unico na plataforma, case-insensitive.
- CA-011: Codigo proprio e unico dentro da Organization, case-insensitive.
- CA-012: Mesmo codigo proprio pode existir em Organizations diferentes.
- CA-013: Mudanca de nome nao altera codigo automaticamente.
- CA-014: Cinco niveis de proficiencia sao obrigatorios para ativacao.
- CA-015: Categorias e status aceitam apenas valores canonicos.
- CA-016: Global Competency `deprecated` nao aceita novas adocoes.
- CA-017: Adocoes existentes sao preservadas, permanecem visiveis e podem
  continuar sendo usadas apos depreciacao global, enquanto a adocao estiver
  ativa.
- CA-018: Global Competency `inactive` nao aceita novas adocoes nem uso
  operacional novo.
- CA-019: Nao existe exclusao fisica de competencias ou adocoes.
- CA-020: Organization arquivada bloqueia operacoes normais.
- CA-021: Permissoes seguem a matriz desta SPEC e a SPEC-004.
- CA-022: Tentativas negadas relevantes geram auditoria.
- CA-023: Auditoria nao registra conteudo completo desnecessario.
- CA-024: Acesso cruzado entre Organizations e bloqueado.
- CA-025: Competencia propria nao pode mudar de Organization.
- CA-026: Platform Admin consulta dados de Organization apenas
  administrativamente e com auditoria.
- CA-027: Competencia global adotada gera `competency_catalog_item` da
  Organization.
- CA-028: Competencia propria ativa possui `competency_catalog_item` da
  Organization.
- CA-029: Modulos futuros usam somente `competency_catalog_items.id` como
  referencia operacional.
- CA-030: `competency_catalog_items.id` de outra Organization nao pode ser usado.
- CA-031: Adocao inativa de Global Competency `deprecated` nao pode ser
  reativada.
- CA-032: Depreciacao global nao inativa automaticamente adocoes existentes.
- CA-033: Unicidade de codigo usa representacao normalizada sem diferenciar
  maiusculas/minusculas e sem espacos laterais.

## 20. Testes obrigatorios

Quando implementada, a funcionalidade deve possuir testes para:

1. Platform Admin criar competencia global.
2. Usuario de Organization nao criar global.
3. Codigo global duplicado.
4. Unicidade global sem diferenciar maiusculas/minusculas.
5. Owner criar competencia propria.
6. Admin criar competencia propria.
7. Member nao criar.
8. Codigo proprio duplicado na mesma Organization.
9. Mesmo codigo em Organizations diferentes.
10. Owner alterar codigo proprio.
11. Admin nao alterar codigo proprio.
12. Empresa nao editar competencia global.
13. Adotar competencia global ativa.
14. Impedir adocao duplicada.
15. Impedir nova adocao de global deprecated.
16. Impedir nova adocao de global inactive.
17. Preservar adocao existente apos depreciacao.
18. Inativar adocao.
19. Reativar adocao permitida.
20. Catalogo unificado sem duplicacoes.
21. Member visualizar somente competencias disponiveis.
22. Evidencias acima do limite.
23. Exemplos acima do limite.
24. Niveis incompletos.
25. Nivel duplicado.
26. Codigo de nivel invalido.
27. Categoria invalida.
28. Status invalido.
29. Organization arquivada bloquear operacoes.
30. Manipulacao de `organizationId`.
31. Manipulacao de `competencyId`.
32. Manipulacao de `globalCompetencyId`.
33. Tentativa de mover competencia propria para outra Organization.
34. Platform Admin consultar Organization apenas administrativamente.
35. Auditoria das operacoes principais.
36. Auditoria sem conteudo completo.
37. Ausencia de exclusao fisica.
38. Persistencia apos recriar aplicacao.
39. Item unificado de competencia global adotada.
40. Item unificado de competencia propria.
41. Referencias futuras nao usando IDs diretos das tabelas de origem.
42. Tentativa de usar catalog item de outra Organization.
43. Global deprecated permanecendo visivel e utilizavel em adocao ativa
    existente.
44. Global deprecated recusando nova adocao.
45. Adocao inativa de global deprecated recusando reativacao.
46. Depreciacao nao inativando adocoes existentes.
47. Normalizacao de code sem diferenciar maiusculas e minusculas.

## 21. Limitacoes conhecidas

- Esta SPEC nao implementa codigo.
- Esta SPEC nao cria banco, migrations, rotas ou dependencias.
- Nao ha categorias personalizadas nesta fase.
- Nao ha versionamento formal de competencias.
- Nao ha snapshots historicos do catalogo nesta fase.
- Nao ha deduplicacao automatica entre competencias globais e proprias.
- Nao ha busca avancada por evidencias, exemplos ou niveis.
- Nao ha IA usando competencias nesta fase.
- Nao ha modulos de cargos, vagas, entrevistas ou avaliacoes nesta fase.

## 22. Definicao de concluido

Para a implementacao futura desta SPEC:

- criterios de aceite atendidos;
- testes obrigatorios implementados e passando;
- testes de acesso cruzado passando;
- regras de seguranca verificadas;
- lint passando;
- formatacao passando;
- build passando;
- migrations reproduziveis quando houver banco;
- documentacao atualizada;
- auditoria revisada;
- aprovacao humana;
- commit realizado.
