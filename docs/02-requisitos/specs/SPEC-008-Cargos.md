# SPEC-008 - Cargos

**Status:** Aprovada  
**Versao:** 1.0  
**Fase:** 5  
**Responsavel de negocio:** Thiago Sousa  
**Ultima atualizacao:** 2026-08-05

## 1. Objetivo

Especificar o modulo de Cargos como perfil versionado de uma funcao
organizacional.

O Cargo:

- representa uma funcao;
- nao representa uma pessoa;
- nao representa uma lotacao;
- pode ser reutilizado por varias Organizational Units;
- sera usado futuramente por vagas, entrevistas, onboarding, avaliacao e IA.

Esta SPEC define conceitos, versionamento, dados, permissoes, seguranca,
auditoria, banco conceitual, operacoes, interface minima, criterios de aceite e
testes obrigatorios.

## 2. Fora do escopo

- Implementar codigo, banco, migrations, rotas ou dependencias.
- Implementar lotacao ou vinculo definitivo com Organizational Unit.
- Implementar colaboradores, pessoas ocupantes do cargo ou historico de
  ocupacao.
- Implementar vagas, entrevistas, onboarding, avaliacao, IA ou matching.
- Implementar pesos de competencias.
- Implementar workflow de aprovacao em multiplos niveis.
- Implementar permissoes customizadas por campo, exceto a protecao explicita de
  faixa salarial para `member`.
- Excluir fisicamente cargos, versoes ou vinculos de competencia.

## 3. Usuarios envolvidos

- **owner:** administra cargos da Organization ativa, altera codigo e publica
  versoes.
- **admin:** administra cargos da Organization ativa, exceto alteracao de codigo
  e publicacao.
- **member:** visualiza apenas Job Profiles ativos e versoes publicadas
  permitidas, sem faixa salarial.
- **Platform Admin:** consulta apenas em contexto administrativo auditado e nao
  opera cargos funcionalmente.

`Platform Admin` nao e Role de Membership e nao recebe permissoes funcionais de
`owner` ou `admin`.

## 4. Conceitos

### 4.1 Job Profile

Representa o cargo como entidade estavel.

O Job Profile identifica a funcao ao longo do tempo. Ele nao representa uma
pessoa, nao representa uma lotacao e nao deve ser duplicado apenas porque e
utilizado em unidades diferentes.

Deve possuir:

- `id`;
- `organization_id`;
- `code`;
- `name`;
- `status`;
- autoria;
- timestamps.

### 4.2 Job Profile Version

Representa uma versao completa e imutavel do perfil do cargo.

Deve possuir:

- `id`;
- `job_profile_id`;
- `organization_id`;
- `version_number`;
- `status`;
- conteudo completo do cargo;
- autoria;
- timestamps;
- dados de publicacao.

Versoes `published` e `archived` sao snapshots imutaveis. Rascunhos usam status
`draft`; rascunho ativo significa `status = 'draft'` e `discarded_at IS NULL`.

### 4.3 Job Profile Competency

Representa a competencia exigida pela versao do cargo.

Deve referenciar somente:

- `competency_catalog_items.id`.

Nunca deve referenciar diretamente:

- `global_competencies.id`;
- `organization_competencies.id`;
- nome da competencia;
- codigo da competencia.

### 4.4 Job Profile Organizational Assignment

Nesta fase, nao implementar lotacao nem vinculo definitivo com unidade
organizacional.

Regras:

- o cargo e independente da unidade;
- modulos futuros poderao associar o cargo a uma ou mais Organizational Units;
- o vinculo futuro deve usar o ID interno do Job Profile e o ID interno da
  Organizational Unit;
- nao duplicar o cargo apenas porque ele e utilizado em unidades diferentes.

## 5. Status canonicos

### 5.1 Job Profile

- `active`
- `inactive`

### 5.2 Job Profile Version

- `draft`
- `published`
- `archived`

Nao existe exclusao fisica. Dados inativos, arquivados e descartados permanecem
armazenados para historico e auditoria.

## 6. Fluxos principais

### 6.1 Criar Job Profile

1. Owner ou admin acessa uma Organization ativa.
2. Informa codigo e nome do cargo.
3. Sistema valida User ativo, Membership ativo, Organization atual e permissao.
4. Sistema valida codigo, nome e unicidade dentro da Organization.
5. Sistema cria o Job Profile com status `active`.
6. Sistema registra auditoria.

### 6.2 Criar ou editar rascunho

1. Owner ou admin seleciona um Job Profile ativo.
2. Sistema valida Organization, Job Profile, permissao e ausencia de outro
   rascunho ativo quando for criar.
3. Sistema cria rascunho inicial ou novo rascunho baseado na versao publicada.
4. Usuario edita o conteudo da versao.
5. Sistema valida formatos, limites e referencias permitidas.
6. Sistema salva o rascunho e registra auditoria.

### 6.3 Publicar rascunho

Somente owner pode publicar.

A publicacao deve ocorrer em transacao:

1. validar User, Membership, Organization e role;
2. bloquear versoes do Job Profile;
3. validar Job Profile ativo;
4. validar rascunho ativo;
5. validar campos obrigatorios;
6. validar competencias;
7. validar requisitos;
8. arquivar versao publicada anterior;
9. atribuir numero sequencial;
10. publicar rascunho;
11. registrar auditoria;
12. confirmar transacao.

Falha em qualquer etapa deve gerar rollback completo. Duas publicacoes
simultaneas nao podem gerar duas versoes publicadas.

### 6.4 Descartar rascunho

1. Owner ou admin solicita descarte de um rascunho.
2. Sistema valida User, Membership, Organization, Job Profile, versao e
   permissao.
3. Sistema confirma que a versao esta em `draft` e nao esta descartada.
4. Sistema marca `discarded_at` e preserva o registro.
5. Sistema registra auditoria.

Rascunho descartado permanece armazenado, nao pode ser editado, nao pode ser
publicado e nao cria novo status canonico.

## 7. Regras de negocio

- RN-001: Todo Job Profile pertence obrigatoriamente a uma Organization.
- RN-002: Job Profile nunca pode mudar de Organization.
- RN-003: Job Profile representa uma funcao, nao uma pessoa.
- RN-004: Job Profile nao representa lotacao.
- RN-005: Job Profile pode ser reutilizado por varias Organizational Units.
- RN-006: Nesta fase, nao existe vinculo definitivo com Organizational Unit.
- RN-007: Modulos futuros devem vincular cargos e unidades por IDs internos,
  sem duplicar o cargo.
- RN-008: Codigo do cargo e obrigatorio, normalizado para unicidade e unico
  dentro da Organization.
- RN-009: Codigo nao diferencia maiusculas e minusculas para unicidade.
- RN-010: Codigo nao muda automaticamente quando o nome muda.
- RN-011: Apos criacao, somente owner pode alterar codigo.
- RN-012: Admin nao pode alterar codigo.
- RN-013: Toda mudanca de codigo gera auditoria.
- RN-014: Nome do cargo e obrigatorio e nao e identificador tecnico.
- RN-015: Nome pode se repetir em Organizations diferentes.
- RN-016: Nome nao precisa mudar quando uma nova versao for publicada.
- RN-017: Cada Job Profile pode possuir no maximo um rascunho ativo.
- RN-018: Cada Job Profile pode possuir no maximo uma versao publicada.
- RN-019: Versoes publicadas e arquivadas sao imutaveis.
- RN-020: Editar uma versao publicada cria novo rascunho baseado nela.
- RN-021: Versoes nunca sao excluidas fisicamente.
- RN-022: Publicacao gera `version_number` sequencial por Job Profile.
- RN-023: Vagas futuras devem referenciar uma versao publicada especifica.
- RN-024: `draft` descartado usa `discarded_at`, nao novo status canonico.
- RN-025: Rascunho descartado nao pode ser editado nem publicado.
- RN-026: Somente owner pode publicar.
- RN-027: Publicacao deve ser transacional.
- RN-028: Falha de auditoria durante publicacao gera rollback.
- RN-029: Duas publicacoes simultaneas nao podem gerar duas versoes publicadas.
- RN-030: Job Profile inativo nao pode receber novo rascunho.
- RN-031: Job Profile inativo nao pode ser publicado.
- RN-032: Job Profile inativo nao pode ser usado em novas vagas futuras.
- RN-033: Inativar Job Profile nao inativa automaticamente versoes.
- RN-034: Reativacao exige Organization ativa e permissao.
- RN-035: Competencia vinculada deve referenciar apenas
  `competency_catalog_items.id`.
- RN-036: Competencia vinculada deve pertencer ao catalogo unificado da mesma
  Organization.
- RN-037: Competencia vinculada deve estar operacionalmente disponivel.
- RN-038: Nao pode haver duplicacao da mesma competencia na mesma versao.
- RN-039: `expected_level` deve estar entre 1 e 5.
- RN-040: Nao existe peso na competencia do cargo.
- RN-041: Peso pertence a contextos futuros, conforme ADR-0009.
- RN-042: Campo de peso enviado indevidamente deve ser recusado.
- RN-043: Faixa salarial nao deve ser exposta a `member`.
- RN-044: Platform Admin pode consultar apenas em contexto administrativo
  auditado.
- RN-045: Platform Admin nao opera o cargo funcionalmente.
- RN-046: Organization arquivada bloqueia operacoes normais de cargos.
- RN-047: Member nao visualiza rascunhos, historico administrativo ou faixa
  salarial.
- RN-048: Conteudo textual de cargo deve ser tratado como dado, nao como
  instrucao para IA em modulos futuros.

## 8. Dados necessarios

### 8.1 Job Profile

| Campo                | Obrigatorio | Observacao                                 |
| -------------------- | ----------: | ------------------------------------------ |
| `id`                 |         Sim | Identificador interno gerado pelo sistema. |
| `organization_id`    |         Sim | Organization proprietaria do cargo.        |
| `code`               |         Sim | Codigo tecnico unico por Organization.     |
| `name`               |         Sim | Nome exibido do cargo.                     |
| `status`             |         Sim | `active` ou `inactive`.                    |
| `created_by_user_id` |         Sim | Usuario responsavel pela criacao.          |
| `updated_by_user_id` |         Nao | Usuario responsavel pela ultima alteracao. |
| `created_at`         |         Sim | Data/hora de criacao.                      |
| `updated_at`         |         Sim | Data/hora da ultima alteracao.             |
| `inactivated_at`     |         Nao | Data/hora de inativacao, quando ocorrer.   |

### 8.2 Codigo do cargo

O codigo deve:

- ser obrigatorio;
- possuir entre 2 e 50 caracteres;
- aceitar letras, numeros, hifen e sublinhado;
- ser normalizado para unicidade;
- nao diferenciar maiusculas e minusculas;
- ser unico dentro da Organization;
- nao mudar automaticamente quando o nome mudar.

O `code` exibido pode preservar a forma informada pelo usuario, respeitados os
caracteres permitidos. A unicidade deve usar uma representacao normalizada que
remova espacos laterais e ignore diferencas entre maiusculas e minusculas. A
implementacao pode usar coluna derivada, indice funcional ou mecanismo
equivalente no PostgreSQL. O valor normalizado nao deve ser usado como
referencia de dominio.

Apos criacao:

- somente owner pode alterar o codigo;
- admin nao pode alterar;
- toda mudanca gera auditoria.

### 8.3 Nome do cargo

O nome deve:

- ser obrigatorio;
- possuir entre 2 e 150 caracteres;
- poder se repetir em Organizations diferentes;
- nao ser identificador tecnico;
- nao precisar mudar quando uma nova versao for publicada.

### 8.4 Job Profile Version

Cada versao deve possuir:

| Campo                  | Obrigatorio | Observacao                                         |
| ---------------------- | ----------: | -------------------------------------------------- |
| `id`                   |         Sim | Identificador interno da versao.                   |
| `job_profile_id`       |         Sim | Job Profile dono da versao.                        |
| `organization_id`      |         Sim | Organization proprietaria, igual a do Job Profile. |
| `version_number`       | Condicional | Obrigatorio para `published` e `archived`.         |
| `status`               |         Sim | `draft`, `published` ou `archived`.                |
| `title`                |         Sim | Titulo exibido na versao.                          |
| `mission`              | Condicional | Obrigatoria para publicacao.                       |
| `summary`              | Condicional | Obrigatorio para publicacao.                       |
| `responsibilities`     |         Sim | Lista estruturada de responsabilidades.            |
| `requirements`         |         Sim | Lista estruturada de requisitos.                   |
| `education`            |         Sim | Estrutura simples de escolaridade.                 |
| `certifications`       |         Nao | Lista estruturada opcional.                        |
| `languages`            |         Nao | Lista estruturada opcional.                        |
| `tools`                |         Nao | Lista estruturada opcional.                        |
| `work_model`           |         Sim | Valor canonico.                                    |
| `work_schedule`        |         Sim | Estrutura simples de jornada.                      |
| `travel_requirement`   |         Sim | Valor canonico.                                    |
| `salary_range`         |         Nao | Faixa salarial opcional e protegida.               |
| `notes`                |         Nao | Observacoes opcionais.                             |
| `created_by_user_id`   |         Sim | Usuario que criou a versao.                        |
| `updated_by_user_id`   |         Nao | Usuario que atualizou o rascunho.                  |
| `published_by_user_id` |         Nao | Usuario que publicou, quando houver.               |
| `discarded_by_user_id` |         Nao | Usuario que descartou, quando houver.              |
| `created_at`           |         Sim | Data/hora de criacao.                              |
| `updated_at`           |         Sim | Data/hora da ultima alteracao.                     |
| `published_at`         |         Nao | Data/hora de publicacao.                           |
| `discarded_at`         |         Nao | Data/hora de descarte do rascunho.                 |

## 9. Conteudo da versao

### 9.1 Missao do cargo

- Obrigatoria para publicacao.
- Limite: ate 2.000 caracteres.

### 9.2 Resumo

- Obrigatorio para publicacao.
- Limite: ate 4.000 caracteres.

### 9.3 Responsabilidades

Lista obrigatoria.

Cada responsabilidade deve possuir:

- texto;
- ordem.

Limites:

- minimo 1 item para publicacao;
- maximo 50 itens;
- ate 1.000 caracteres por item.

### 9.4 Requisitos

Lista de condicoes objetivas. `requirements` pode ser uma lista vazia e
requisitos nao sao obrigatorios para publicacao.

Cada requisito deve possuir:

- texto;
- tipo;
- obrigatorio ou desejavel;
- ordem.

Tipos canonicos:

- `education`
- `experience`
- `certification`
- `license`
- `availability`
- `travel`
- `location`
- `language`
- `tool`
- `other`

Limites:

- maximo 50 requisitos;
- ate 1.000 caracteres por item.

Quando existirem requisitos, todos devem seguir a estrutura, tipos canonicos,
limites e validacoes definidos nesta SPEC. Missao, resumo e pelo menos uma
responsabilidade continuam obrigatorios para publicacao.

### 9.5 Competencias vinculadas

Cada vinculo deve possuir:

- `competency_catalog_item_id`;
- `expected_level`;
- `required`;
- `order`;
- observacao opcional.

Regras:

- `expected_level` deve ser de 1 a 5;
- a competencia deve pertencer ao catalogo unificado da mesma Organization;
- a competencia deve estar operacionalmente disponivel;
- nao pode haver duplicacao da mesma competencia na mesma versao;
- nao existe peso na competencia;
- peso pertence a contextos futuros, conforme ADR-0009.

### 9.6 Escolaridade

Nesta fase, armazenar como estrutura simples:

- nivel;
- area;
- obrigatorio ou desejavel;
- observacao opcional.

Niveis canonicos:

- `elementary`
- `high_school`
- `technical`
- `undergraduate`
- `postgraduate`
- `masters`
- `doctorate`
- `not_required`

### 9.7 Certificacoes

Lista opcional.

Cada item deve possuir:

- nome;
- obrigatorio ou desejavel;
- validade exigida, opcional;
- observacao opcional.

### 9.8 Idiomas

Lista opcional.

Cada item deve possuir:

- idioma;
- nivel esperado;
- obrigatorio ou desejavel.

Niveis canonicos:

- `basic`
- `intermediate`
- `advanced`
- `fluent`
- `native`

### 9.9 Ferramentas

Lista opcional.

Cada item deve possuir:

- nome;
- nivel esperado;
- obrigatorio ou desejavel.

Niveis canonicos:

- `basic`
- `intermediate`
- `advanced`
- `expert`

### 9.10 Modelo de trabalho

Valores canonicos:

- `onsite`
- `hybrid`
- `remote`
- `flexible`

### 9.11 Jornada

Estrutura simples com:

- horas semanais;
- descricao;
- turno, opcional.

### 9.12 Viagens

Valores canonicos:

- `none`
- `occasional`
- `frequent`

### 9.13 Faixa salarial

Opcional.

Quando informada, deve possuir:

- valor minimo;
- valor maximo;
- moeda;
- periodicidade.

Periodicidade:

- `monthly`
- `hourly`
- `annual`

Regras:

- valor minimo nao pode ser maior que o maximo;
- valores nao podem ser negativos;
- moeda deve usar codigo ISO;
- nao expor faixa salarial a `member` sem permissao especifica definida em SPEC
  futura.

## 10. Versionamento

Regras:

- apenas um rascunho ativo por Job Profile;
- apenas uma versao publicada por Job Profile;
- versoes publicadas e arquivadas sao imutaveis;
- editar uma versao publicada cria novo rascunho baseado nela;
- versoes nunca sao excluidas fisicamente;
- publicacao gera numero sequencial por Job Profile;
- vagas futuras devem referenciar uma versao publicada especifica.

### 10.1 Estados e transicoes

- criacao -> `draft`;
- `draft` -> `published`;
- `published` -> `archived`, somente na publicacao de nova versao;
- `archived` permanece imutavel.

Rascunho descartado:

- permanece armazenado;
- nao pode ser editado;
- nao pode ser publicado;
- nao cria novo status canonico;
- usa `discarded_at`.

## 11. Permissoes

Todas as permissoes devem ser validadas no servidor, com User ativo, Membership
ativo quando aplicavel e Organization ativa para operacoes normais.

| Acao                             | Platform Admin | owner | admin | member |
| -------------------------------- | :------------: | :---: | :---: | :----: |
| Criar Job Profile                |      Nao       |  Sim  |  Sim  |  Nao   |
| Atualizar dados estaveis         |      Nao       |  Sim  |  Sim  |  Nao   |
| Alterar codigo apos criacao      |      Nao       |  Sim  |  Nao  |  Nao   |
| Criar rascunho                   |      Nao       |  Sim  |  Sim  |  Nao   |
| Editar rascunho                  |      Nao       |  Sim  |  Sim  |  Nao   |
| Descartar rascunho               |      Nao       |  Sim  |  Sim  |  Nao   |
| Publicar rascunho                |      Nao       |  Sim  |  Nao  |  Nao   |
| Ativar ou inativar Job Profile   |      Nao       |  Sim  |  Sim  |  Nao   |
| Consultar versao publicada       |      Nao       |  Sim  |  Sim  |  Sim   |
| Consultar rascunho               |      Nao       |  Sim  |  Sim  |  Nao   |
| Consultar historico              |      Nao       |  Sim  |  Sim  |  Nao   |
| Visualizar faixa salarial        |      Nao       |  Sim  |  Sim  |  Nao   |
| Consulta administrativa auditada |      Sim       |  Nao  |  Nao  |  Nao   |

### 11.1 Owner

Pode criar cargo, criar rascunho, editar rascunho, alterar codigo, descartar
rascunho, publicar, ativar e inativar Job Profile, consultar versao publicada,
consultar historico e visualizar faixa salarial.

### 11.2 Admin

Pode criar cargo, criar rascunho, editar rascunho, descartar rascunho, ativar e
inativar Job Profile, consultar versao publicada, consultar historico e
visualizar faixa salarial.

Nao pode alterar codigo nem publicar.

### 11.3 Member

Pode visualizar Job Profiles ativos e apenas versoes publicadas. Nao visualiza
faixa salarial, rascunhos, historico administrativo ou Job Profiles inativos.
Nao cria, edita, descarta, publica, ativa ou inativa.

### 11.4 Platform Admin

Pode somente consultar em contexto administrativo auditado. Nao pode operar o
cargo funcionalmente.

## 12. Inativacao do Job Profile

Quando inativo:

- nao pode receber novo rascunho;
- nao pode ser usado em novas vagas futuras;
- versoes anteriores permanecem preservadas;
- publicacao nao e permitida;
- owner e admin podem consultar historico;
- owner e admin podem listar Job Profiles inativos;
- reativacao exige Organization ativa e permissao.

Nao inativar automaticamente versoes.

## 13. Organization arquivada

Quando a Organization estiver `archived`:

- owner, admin e member nao podem operar cargos;
- member nao possui consulta operacional normal;
- Platform Admin pode consultar apenas administrativamente;
- nenhum cargo pode ser criado, editado, publicado, ativado ou inativado;
- dados permanecem preservados para historico e auditoria.

## 14. API conceitual

| Operacao                         | Finalidade                                             |
| -------------------------------- | ------------------------------------------------------ |
| Criar Job Profile                | Criar cargo em Organization ativa.                     |
| Listar cargos ativos             | Consultar cargos ativos permitidos.                    |
| Listar cargos inativos           | Consultar Job Profiles inativos para owner/admin.      |
| Consultar cargo                  | Consultar Job Profile permitido.                       |
| Atualizar dados estaveis         | Alterar nome ou metadados estaveis permitidos.         |
| Criar rascunho                   | Criar rascunho inicial ou baseado na versao publicada. |
| Consultar rascunho               | Obter rascunho permitido para owner/admin.             |
| Editar rascunho                  | Alterar conteudo da versao `draft`.                    |
| Descartar rascunho               | Marcar rascunho como descartado.                       |
| Publicar                         | Publicar rascunho em transacao.                        |
| Consultar versao publicada       | Obter versao publicada atual permitida.                |
| Listar historico                 | Listar versoes e eventos permitidos.                   |
| Consultar versao especifica      | Obter versao permitida por ID.                         |
| Ativar Job Profile               | Reativar cargo quando permitido.                       |
| Inativar Job Profile             | Inativar cargo sem excluir historico.                  |
| Consulta administrativa auditada | Consulta excepcional por Platform Admin.               |

Todas as operacoes devem validar `organizationId`, `jobProfileId`, `versionId`
e `competencyCatalogItemId` no servidor quando aplicavel.

Owner e admin podem listar Job Profiles inativos, consultar historico e reativar
quando a Organization estiver ativa e as permissoes forem validas. Member nao
pode visualizar Job Profiles inativos.

## 15. Interface

Interface minima prevista:

- listagem de cargos;
- criar cargo;
- visualizar status;
- editar rascunho;
- missao;
- resumo;
- responsabilidades;
- requisitos;
- competencias;
- escolaridade;
- certificacoes;
- idiomas;
- ferramentas;
- modelo de trabalho;
- jornada;
- viagens;
- faixa salarial;
- publicar;
- descartar;
- historico;
- mensagens claras de permissao.

Nao implementar design avancado. A interface pode ocultar ou desabilitar acoes
nao permitidas, mas a autorizacao real deve permanecer no servidor.

## 16. Banco de dados

Quando implementada, a funcionalidade deve prever minimamente:

- `job_profiles`;
- `job_profile_versions`;
- `job_profile_version_competencies`.

### 16.1 `job_profiles`

Campos minimos:

- `id`;
- `organization_id`;
- `code`;
- `name`;
- `status`;
- `created_by_user_id`;
- `updated_by_user_id`;
- `created_at`;
- `updated_at`;
- `inactivated_at`.

Restricoes esperadas:

- `organization_id` obrigatorio com chave estrangeira;
- codigo unico por Organization sem diferenciar maiusculas/minusculas;
- unicidade baseada em representacao normalizada do codigo;
- status limitado a `active` e `inactive`;
- bloqueio de mudanca de `organization_id`;
- ausencia de exclusao em cascata destrutiva;
- indices para `organization_id`, codigo normalizado, status e nome.

### 16.2 `job_profile_versions`

Campos minimos:

- `id`;
- `job_profile_id`;
- `organization_id`;
- `version_number`;
- `status`;
- `title`;
- `mission`;
- `summary`;
- `responsibilities`;
- `requirements`;
- `education`;
- `certifications`;
- `languages`;
- `tools`;
- `work_model`;
- `work_schedule`;
- `travel_requirement`;
- `salary_range`;
- `notes`;
- `created_by_user_id`;
- `updated_by_user_id`;
- `published_by_user_id`;
- `discarded_by_user_id`;
- `created_at`;
- `updated_at`;
- `published_at`;
- `discarded_at`.

Restricoes esperadas:

- `job_profile_id` obrigatorio com chave estrangeira;
- `organization_id` obrigatorio e consistente com o Job Profile;
- `version_number` obrigatorio para `published` e `archived`;
- `version_number` unico por Job Profile quando preenchido;
- apenas uma versao `published` por Job Profile;
- apenas um rascunho ativo por Job Profile;
- status limitado a `draft`, `published` e `archived`;
- versoes `published` e `archived` imutaveis;
- `discarded_at` usado para rascunho descartado;
- ausencia de exclusao em cascata destrutiva;
- indices para `organization_id`, `job_profile_id`, status,
  `version_number` e `discarded_at`.

Em PostgreSQL, a unicidade de `published` e de rascunho ativo pode ser
implementada por indices unicos parciais. A estrategia final deve ser registrada
no plano de implementacao.

### 16.3 `job_profile_version_competencies`

Campos minimos:

- `id`;
- `organization_id`;
- `job_profile_version_id`;
- `competency_catalog_item_id`;
- `expected_level`;
- `required`;
- `display_order`;
- `note`;
- `created_at`;
- `updated_at`.

Restricoes esperadas:

- `organization_id` obrigatorio;
- `job_profile_version_id` obrigatorio com chave estrangeira;
- `competency_catalog_item_id` obrigatorio com chave estrangeira para
  `competency_catalog_items.id`;
- competencia deve pertencer a mesma Organization da versao;
- vinculo unico por versao + `competency_catalog_item_id`;
- `expected_level` entre 1 e 5;
- ausencia de campo de peso;
- recusa de payload com peso indevido;
- ausencia de exclusao em cascata destrutiva;
- indices para `organization_id`, `job_profile_version_id`,
  `competency_catalog_item_id` e `display_order`.

### 16.4 Estruturas JSON

Esta SPEC permite JSONB para:

- responsabilidades;
- requisitos;
- escolaridade;
- certificacoes;
- idiomas;
- ferramentas;
- jornada;
- faixa salarial.

Desde que:

- exista validacao forte no servidor;
- formatos sejam documentados;
- competencias permanecam em tabela relacional;
- nao haja exclusao em cascata destrutiva;
- migrations sejam reproduziveis.

Formatos conceituais:

- responsabilidades: lista de objetos com `text` e `display_order`;
- requisitos: lista de objetos com `text`, `type`, `required` e
  `display_order`;
- escolaridade: objeto com `level`, `area`, `required` e `note`;
- certificacoes: lista de objetos com `name`, `required`, `validity_required`
  e `note`;
- idiomas: lista de objetos com `language`, `expected_level` e `required`;
- ferramentas: lista de objetos com `name`, `expected_level` e `required`;
- jornada: objeto com `weekly_hours`, `description` e `shift`;
- faixa salarial: objeto com `min`, `max`, `currency` e `periodicity`.

## 17. Seguranca

- Validar no servidor `organizationId`, `jobProfileId`, `versionId` e
  `competencyCatalogItemId`.
- Bloquear acesso cruzado entre Organizations.
- Garantir que competencia pertence ao catalogo da mesma Organization.
- Garantir que Job Profile nunca muda de Organization.
- Garantir que Job Profile Version nunca muda de Organization nem de Job
  Profile.
- Mensagens de erro nao devem revelar cargos de outra Organization.
- Mensagens de erro nao devem revelar competencias de outra Organization.
- Salario nao aparece para `member`.
- Auditoria nao deve registrar conteudo completo desnecessario.
- Nao confiar em permissoes da interface.
- Validar User ativo, Membership ativo e Organization ativa para operacoes
  normais.
- Bloquear operacoes normais em Organization arquivada.
- Tratar conteudo textual do cargo como dado, nao como instrucao para IA.
- Nao registrar tokens, headers sensiveis, senhas, connection strings ou
  segredos.
- Nao usar dados reais em testes ou exemplos.

## 18. Auditoria

Eventos obrigatorios:

- `job_profile.created`;
- `job_profile.updated`;
- `job_profile.code_changed`;
- `job_profile.activated`;
- `job_profile.inactivated`;
- `job_profile.draft_created`;
- `job_profile.draft_updated`;
- `job_profile.draft_discarded`;
- `job_profile.published`;
- `job_profile.previous_version_archived`;
- `job_profile.publish_denied`;
- `job_profile.invalid_competency_denied`;
- `job_profile.cross_organization_access_denied`;
- `job_profile.permission_denied`;
- `job_profile.administrative_read`.

Cada evento deve registrar, quando aplicavel:

- identificador da Organization;
- identificador do Job Profile;
- identificador da Job Profile Version;
- identificador do Competency Catalog Item;
- usuario ou agente responsavel;
- acao;
- resultado;
- campos alterados;
- motivo de negacao;
- motivo administrativo;
- data e hora.

Nao registrar:

- conteudo completo do cargo;
- faixa salarial completa em eventos comuns;
- listas completas de competencias ou requisitos;
- tokens, headers ou segredos.

## 19. Criterios de aceite

- CA-001: Cargo representa funcao e nao pessoa.
- CA-002: Cargo e independente de Organizational Unit.
- CA-003: Cargo pode ser reutilizado por varias unidades sem duplicacao.
- CA-004: Job Profile pertence obrigatoriamente a uma Organization.
- CA-005: Job Profile nunca muda de Organization.
- CA-006: Codigo e unico por Organization, case-insensitive.
- CA-007: Mesmo codigo pode existir em Organizations diferentes.
- CA-008: Apenas owner altera codigo apos criacao.
- CA-009: Alteracao de codigo gera auditoria.
- CA-010: Apenas um rascunho ativo por Job Profile.
- CA-011: Apenas uma versao publicada por Job Profile.
- CA-012: Versao publicada e imutavel.
- CA-013: Versao arquivada e imutavel.
- CA-014: Publicacao e atomica e gera numero sequencial.
- CA-015: Falha na publicacao nao deixa estado parcial.
- CA-016: Concorrencia de publicacao nao gera duas versoes publicadas.
- CA-017: Rascunho descartado permanece armazenado e bloqueado.
- CA-018: Competencias usam somente `competency_catalog_items.id`.
- CA-019: Competencia de outra Organization e recusada.
- CA-020: Competencia inativa e recusada para novo vinculo.
- CA-021: `expected_level` aceita apenas valores de 1 a 5.
- CA-022: Competencia duplicada na mesma versao e recusada.
- CA-023: Nao existe peso em competencia de cargo.
- CA-024: Peso enviado indevidamente e recusado.
- CA-025: Faixa salarial e protegida contra visualizacao por `member`.
- CA-026: Owner publica.
- CA-027: Admin nao publica.
- CA-028: Member nao visualiza rascunho.
- CA-029: Member nao visualiza historico.
- CA-030: Member nao visualiza salario.
- CA-031: Platform Admin somente consulta administrativamente com auditoria.
- CA-032: Job Profile inativo bloqueia novo rascunho e publicacao.
- CA-033: Organization arquivada bloqueia operacoes normais.
- CA-034: Nao existe exclusao fisica.
- CA-035: Eventos principais geram auditoria.
- CA-036: Auditoria nao registra conteudo completo desnecessario.
- CA-037: Acesso cruzado entre Organizations e bloqueado.
- CA-038: Vagas futuras devem referenciar versao publicada especifica.
- CA-039: Toda operacao normal de cargos exige User ativo, Membership ativo,
  Organization ativa e role autorizada. Quando qualquer condicao falhar, o
  acesso e negado de forma segura, nenhuma informacao de outra Organization e
  revelada e a tentativa gera auditoria quando aplicavel.

## 20. Testes obrigatorios

Quando implementada, a funcionalidade deve possuir testes para:

1. criar Job Profile;
2. codigo duplicado na mesma Organization;
3. mesmo codigo em Organizations diferentes;
4. unicidade sem diferenciar maiusculas/minusculas;
5. owner alterar codigo;
6. admin nao alterar codigo;
7. criar primeiro rascunho;
8. impedir segundo rascunho ativo;
9. editar rascunho;
10. descartar rascunho;
11. impedir editar rascunho descartado;
12. impedir publicar rascunho descartado;
13. owner publicar;
14. admin nao publicar;
15. member nao publicar;
16. member nao visualizar rascunho;
17. member nao visualizar historico;
18. member nao visualizar salario;
19. versao publicada imutavel;
20. versao arquivada imutavel;
21. apenas uma versao publicada;
22. publicacao atomica;
23. rollback quando auditoria falha;
24. concorrencia de publicacao;
25. competencia de outra Organization;
26. competency catalog item inativo;
27. competencia duplicada na mesma versao;
28. nivel esperado invalido;
29. peso enviado indevidamente ser recusado;
30. requisito invalido;
31. escolaridade invalida;
32. idioma invalido;
33. ferramenta invalida;
34. modelo de trabalho invalido;
35. faixa salarial invalida;
36. moeda invalida;
37. Organization arquivada bloquear operacoes;
38. Job Profile inativo bloquear novo rascunho/publicacao;
39. manipulacao de `organizationId`;
40. manipulacao de `jobProfileId`;
41. manipulacao de `versionId`;
42. manipulacao de `competencyCatalogItemId`;
43. tentativa de mudar Job Profile de Organization;
44. Platform Admin somente consultar administrativamente;
45. auditoria das operacoes principais;
46. auditoria sem conteudo completo;
47. ausencia de exclusao fisica;
48. persistencia apos recriar aplicacao.
49. User sem Membership tentando acessar ou alterar cargo.
50. Membership inativo tentando acessar ou alterar cargo.
51. User inativo tentando acessar ou alterar cargo.
52. Acao protegida negada para User sem Membership, Membership inativo e User
    inativo.
53. Auditoria gerada para negacoes relevantes de autorizacao.
54. Resposta sem exposicao de dados internos ou de outra Organization.

## 21. Limitacoes conhecidas

- Esta SPEC nao implementa codigo.
- Esta SPEC nao cria banco, migrations, rotas ou dependencias.
- Nao ha lotacao nem vinculo definitivo com Organizational Unit nesta fase.
- Nao ha modulo de colaboradores ou ocupantes do cargo.
- Nao ha vagas, entrevistas, onboarding, avaliacao, IA ou matching nesta fase.
- Nao ha pesos de competencias nesta SPEC.
- Nao ha workflow de aprovacao.
- Nao ha permissoes customizadas por campo alem da protecao de salario para
  `member`.
- Conteudos estruturados podem usar JSONB, mas competencias devem permanecer em
  tabela relacional.

## 22. Definicao de concluido

Para a implementacao futura desta SPEC:

- SPEC aprovada antes do desenvolvimento;
- criterios de aceite atendidos;
- testes obrigatorios implementados e passando;
- testes de seguranca passando;
- testes de acesso cruzado passando;
- testes de concorrencia e transacao passando;
- regras de seguranca verificadas;
- migrations reproduziveis quando houver banco;
- lint passando;
- formatacao passando;
- build passando;
- documentacao atualizada;
- auditoria revisada;
- nenhuma funcionalidade futura implementada antecipadamente;
- commit realizado.
