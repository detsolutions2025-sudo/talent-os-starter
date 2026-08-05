# SPEC-005 - DNA Organizacional

**Status:** Aprovada
**Versao:** 1.0
**Fase:** 2  
**Responsavel de negocio:** Thiago Sousa  
**Dependencias:** SPEC-001 - Organization, SPEC-002 - User, SPEC-003 - Membership, SPEC-004 - Roles & Permissions  
**Ultima atualizacao:** 2026-08-05

## 1. Objetivo

Permitir que cada `Organization` defina oficialmente sua identidade, cultura e
principios de funcionamento.

O DNA Organizacional sera a referencia utilizada por modulos futuros de cargos,
vagas, entrevistas, onboarding, desenvolvimento, retencao e inteligencia
artificial.

Nesta fase, o DNA sera exclusivamente cadastrado, versionado, publicado e
consultado por usuarios autorizados. Nao ha geracao automatica por IA e nenhuma
decisao automatizada sobre pessoas.

## 2. Fora do escopo

Nao fazem parte desta SPEC:

- geracao automatica por IA;
- DISC;
- testes comportamentais;
- perfil de cargo;
- perfil de candidato;
- matching cultural;
- avaliacao de desempenho;
- onboarding;
- sugestoes automaticas de melhoria;
- restauracao de versao anterior;
- republicacao direta de versao antiga;
- reativacao de versao antiga;
- workflow de aprovacao;
- permissoes customizadas por campo;
- tabelas definitivas para valores e competencias.

Para usar uma versao antiga novamente, uma fase futura devera especificar a
criacao de um novo rascunho baseado nela. Esse fluxo nao faz parte desta fase.

## 3. Conceitos

- **DNA Organizacional:** identidade cultural e operacional de uma
  `Organization`.
- **Versao do DNA:** snapshot completo do DNA em determinado momento.
- **Rascunho ativo:** versao editavel com status `draft`.
- **Rascunho descartado:** versao em `draft` preservada para auditoria, marcada
  como descartada e fora do fluxo operacional.
- **Versao publicada:** versao oficial atual com status `published`.
- **Versao arquivada:** versao historica imutavel com status `archived`.
- **Historico:** conjunto de versoes publicadas anteriores e versoes arquivadas.
- **Organization atual:** Organization ativa validada no servidor.

Cada versao do DNA sera um registro completo. Depois de publicada, a versao se
torna imutavel.

## 4. Estrutura do DNA

O DNA sera composto pelos blocos abaixo.

### 4.1 Identidade

Campos obrigatorios para publicacao:

- missao;
- visao;
- proposito.

Limites iniciais:

- missao: ate 2.000 caracteres;
- visao: ate 2.000 caracteres;
- proposito: ate 2.000 caracteres.

### 4.2 Valores

Cada valor deve possuir:

- nome;
- descricao;
- significado pratico;
- exemplos de comportamentos esperados;
- exemplos de comportamentos incompativeis.

Regras iniciais:

- para publicar, deve existir pelo menos 1 valor;
- cada valor deve possuir nome e descricao;
- nome de valor: ate 120 caracteres;
- descricao de valor: ate 2.000 caracteres;
- ate 20 valores por versao;
- ate 20 comportamentos esperados por valor;
- ate 20 comportamentos incompativeis por valor.

### 4.3 Cultura Organizacional

Descreve como a empresa trabalha.

Exemplos:

- tomada de decisao;
- colaboracao;
- comunicacao;
- inovacao;
- autonomia;
- responsabilidade.

### 4.4 Competencias Organizacionais

Competencias esperadas de todos os colaboradores.

Cada competencia deve possuir:

- nome;
- descricao;
- nivel de importancia;
- exemplos praticos.

Regras iniciais:

- para publicar, deve existir pelo menos 1 competencia organizacional;
- cada competencia deve possuir nome e descricao;
- nome de competencia: ate 120 caracteres;
- descricao de competencia: ate 2.000 caracteres;
- ate 30 competencias por versao.

Escala canonica de importancia:

- `low`
- `medium`
- `high`
- `critical`

### 4.5 Estilo de Lideranca

Define como lideres devem atuar.

Exemplos:

- desenvolvimento de pessoas;
- feedback;
- delegacao;
- comunicacao;
- tomada de decisao.

### 4.6 Ambiente de Trabalho

Descreve caracteristicas gerais da empresa.

Exemplos:

- colaboracao;
- flexibilidade;
- ritmo;
- autonomia;
- inovacao;
- qualidade.

## 5. Estados e transicoes

Estados permitidos:

- `draft`
- `published`
- `archived`

Transicoes permitidas:

- criacao -> `draft`;
- `draft` -> `published`;
- `published` -> `archived`, somente dentro da publicacao de uma nova versao;
- `archived` nao muda de estado.

Regras:

- no maximo um rascunho ativo por Organization;
- no maximo uma versao publicada por Organization;
- versoes publicadas e arquivadas nao podem ser editadas;
- editar um DNA publicado significa criar um novo rascunho a partir dele;
- versoes nunca sao excluidas fisicamente;
- nao e permitido arquivamento isolado da unica versao publicada;
- uma Organization nao pode ficar sem versao publicada por uma acao de
  arquivamento isolada.

## 6. Versionamento

Cada publicacao gera uma nova versao sequencial.

Exemplos:

- v1;
- v2;
- v3.

Regras:

- `version_number` deve ser obrigatorio para versoes `published` e `archived`;
- `version_number` deve ser unico por Organization quando preenchido;
- a publicacao atribui o proximo numero sequencial disponivel;
- versoes anteriores permanecem disponiveis para consulta autorizada e
  auditoria;
- uma versao publicada e um snapshot completo do conteudo no momento da
  publicacao;
- rascunhos podem ser atualizados ate a publicacao ou descarte;
- descartar rascunho nao exclui fisicamente nenhuma versao.

## 7. Fluxos

### 7.1 Criar rascunho

1. Usuario autorizado acessa uma Organization ativa.
2. Sistema valida User ativo, Membership ativo e permissao no servidor.
3. Sistema verifica que nao existe outro rascunho ativo para a Organization.
4. Sistema cria uma nova versao com status `draft`.
5. Sistema registra auditoria.

### 7.2 Editar rascunho

1. Usuario autorizado informa alteracoes.
2. Sistema valida `organizationId` e `versionId` no servidor.
3. Sistema confirma que a versao pertence a Organization validada.
4. Sistema confirma que a versao esta em `draft`.
5. Sistema valida limites e formato.
6. Sistema salva alteracoes e registra auditoria.

### 7.3 Publicar rascunho

A publicacao deve ocorrer em uma unica transacao:

1. bloquear as versoes da Organization;
2. validar que o rascunho ainda e valido;
3. arquivar a versao publicada anterior, se existir;
4. publicar o rascunho;
5. atribuir numero sequencial de versao;
6. registrar auditoria;
7. confirmar a transacao.

Se qualquer etapa falhar, nenhuma alteracao deve permanecer.

Duas publicacoes simultaneas nao podem resultar em duas versoes publicadas.

### 7.4 Descartar rascunho

1. Usuario autorizado solicita descarte de uma versao `draft`.
2. Sistema valida User, Membership, Organization, `versionId` e permissao.
3. Sistema impede descarte de versoes `published` ou `archived`.
4. Sistema marca o rascunho como descartado sem mudar seu status canonico.
5. Sistema registra auditoria.

Um rascunho descartado:

- permanece armazenado;
- nao conta como rascunho ativo;
- nao pode ser editado;
- nao pode ser publicado;
- nao pode ser visualizado por `member`;
- pode ser consultado apenas por `owner`, `admin` ou Platform Admin autorizado
  em contexto administrativo auditado.

## 8. Permissoes

As permissoes detalhadas devem seguir a matriz da SPEC-004 e ser validadas no
servidor.

### 8.1 Platform Admin

Pode somente consultar DNA para:

- suporte;
- auditoria;
- investigacao administrativa.

Nao pode:

- criar DNA;
- editar DNA;
- publicar DNA;
- arquivar DNA;
- descartar rascunho.

Toda consulta administrativa deve ser auditada e deve registrar:

- motivo;
- usuario responsavel;
- Organization;
- data/hora.

O conteudo completo do DNA nao deve ser copiado para o evento de auditoria.

### 8.2 Owner

Pode:

- criar o primeiro rascunho;
- criar novo rascunho quando nao existir outro rascunho ativo;
- editar o rascunho;
- descartar o rascunho;
- publicar;
- visualizar versao publicada;
- visualizar historico;
- visualizar rascunho.

### 8.3 Admin

Pode:

- criar rascunho quando nao existir outro;
- editar o rascunho;
- descartar o rascunho;
- visualizar versao publicada;
- visualizar historico;
- visualizar rascunho.

Nao pode publicar.

### 8.4 Member

Pode apenas:

- visualizar a versao publicada atual da propria Organization ativa.

Nao pode:

- visualizar rascunhos;
- visualizar historico;
- criar;
- editar;
- publicar;
- descartar.

## 9. Organization arquivada

Quando a Organization estiver `archived`:

- `owner`, `admin` e `member` nao podem criar, editar, publicar ou descartar DNA;
- `member` nao pode consultar normalmente;
- `Platform Admin` pode consultar somente em contexto administrativo auditado;
- nenhuma versao pode se tornar contexto ativo operacional;
- dados permanecem armazenados para historico e auditoria.

## 10. Auditoria

Eventos obrigatorios:

- `organization_dna.draft_created`
- `organization_dna.draft_updated`
- `organization_dna.draft_discarded`
- `organization_dna.published`
- `organization_dna.previous_version_archived`
- `organization_dna.admin_read`
- `organization_dna.read_denied`
- `organization_dna.create_denied`
- `organization_dna.update_denied`
- `organization_dna.publish_denied`
- `organization_dna.discard_denied`
- `organization_dna.cross_organization_access_denied`
- `organization_dna.archived_organization_denied`

Cada evento deve registrar, quando aplicavel:

- `organization_id`;
- `version_id`;
- `actor_user_id`;
- acao;
- resultado;
- motivo de negacao;
- motivo administrativo, quando for consulta por Platform Admin;
- data/hora.

Nao registrar:

- conteudo completo do DNA;
- tokens;
- senhas;
- connection strings;
- chaves de API;
- dados pessoais desnecessarios.

## 11. API conceitual

Operacoes previstas:

- criar rascunho;
- consultar versao publicada atual;
- consultar rascunho;
- consultar versao especifica autorizada;
- listar historico;
- atualizar rascunho;
- publicar rascunho;
- descartar rascunho;
- consultar administrativamente como Platform Admin.

Operacoes removidas desta fase:

- restaurar versao anterior;
- republicar diretamente versao antiga;
- reativar versao antiga;
- arquivar isoladamente a unica versao publicada.

Rotas conceituais possiveis:

- `GET /api/organizations/:organizationId/dna`
- `GET /api/organizations/:organizationId/dna/versions`
- `GET /api/organizations/:organizationId/dna/versions/:versionId`
- `POST /api/organizations/:organizationId/dna/drafts`
- `PATCH /api/organizations/:organizationId/dna/drafts/:versionId`
- `POST /api/organizations/:organizationId/dna/drafts/:versionId/publish`
- `POST /api/organizations/:organizationId/dna/drafts/:versionId/discard`

As rotas finais devem validar `organizationId` e `versionId` no servidor. O ID
enviado pelo cliente nao prova acesso.

## 12. Modelagem

Adotar uma entidade principal de versao completa, vinculada obrigatoriamente a
Organization.

Tabela conceitual esperada: `organization_dna_versions`.

Campos minimos:

| Campo                      | Regra                                                                                            |
| -------------------------- | ------------------------------------------------------------------------------------------------ |
| `id`                       | Chave primaria.                                                                                  |
| `organization_id`          | Obrigatorio, chave estrangeira para `organizations`.                                             |
| `version_number`           | Sequencial por Organization; obrigatorio para `published` e `archived`; unico quando preenchido. |
| `status`                   | `draft`, `published` ou `archived`.                                                              |
| `mission`                  | Obrigatorio para publicacao, ate 2.000 caracteres.                                               |
| `vision`                   | Obrigatorio para publicacao, ate 2.000 caracteres.                                               |
| `purpose`                  | Obrigatorio para publicacao, ate 2.000 caracteres.                                               |
| `values_content`           | Conteudo estruturado de valores.                                                                 |
| `competencies_content`     | Conteudo estruturado de competencias.                                                            |
| `culture_content`          | Cultura organizacional.                                                                          |
| `leadership_style_content` | Estilo de lideranca.                                                                             |
| `work_environment_content` | Ambiente de trabalho.                                                                            |
| `created_by_user_id`       | User responsavel pela criacao.                                                                   |
| `updated_by_user_id`       | User responsavel pela ultima atualizacao.                                                        |
| `published_by_user_id`     | User responsavel pela publicacao, quando houver.                                                 |
| `discarded_by_user_id`     | User responsavel pelo descarte, quando houver.                                                   |
| `created_at`               | Data/hora de criacao.                                                                            |
| `updated_at`               | Data/hora da ultima atualizacao.                                                                 |
| `published_at`             | Data/hora da publicacao, quando houver.                                                          |
| `discarded_at`             | Data/hora do descarte, quando houver.                                                            |

Nesta fase, valores e competencias podem ser armazenados como JSON estruturado,
desde que:

- tenham validacao forte no servidor;
- possuam formato documentado;
- sejam versionados como parte do snapshot completo;
- nao dificultem uma futura migracao para tabelas proprias.

Essa e uma decisao de implementacao futura, nao uma obrigacao arquitetural
definitiva.

Formato minimo sugerido para `values_content`:

```json
[
  {
    "name": "Texto",
    "description": "Texto",
    "practicalMeaning": "Texto",
    "expectedBehaviors": ["Texto"],
    "incompatibleBehaviors": ["Texto"]
  }
]
```

Formato minimo sugerido para `competencies_content`:

```json
[
  {
    "name": "Texto",
    "description": "Texto",
    "importance": "medium",
    "examples": ["Texto"]
  }
]
```

## 13. Restricoes de banco

Restricoes esperadas:

- `organization_id` obrigatorio;
- `version_number` obrigatorio para versoes `published` e `archived`;
- `version_number` unico por Organization quando preenchido;
- somente uma versao `published` por Organization;
- somente um `draft` ativo por Organization;
- status limitado aos valores canonicos;
- sem exclusao em cascata destrutiva;
- chaves estrangeiras validas para Organization e Users relacionados;
- indices para Organization, status e versionamento;
- migration reproduzivel quando houver implementacao.

Em PostgreSQL, a unicidade de `published` e `draft` pode ser implementada por
indices unicos parciais. A estrategia final deve ser registrada no plano de
implementacao.

## 14. Seguranca

Regras obrigatorias:

- validar `organizationId` no servidor;
- validar `versionId` no servidor;
- garantir que a versao pertence a Organization validada;
- negar acesso cruzado;
- nao revelar existencia de DNA de outra Organization;
- nao registrar conteudo completo em logs ou auditoria;
- nao expor rascunhos para `member`;
- nao expor historico para `member`;
- nao confiar em permissoes da interface;
- validar User ativo;
- validar Membership ativo;
- validar Organization ativa para operacoes normais;
- bloquear Organization arquivada conforme esta SPEC;
- usar consultas parametrizadas;
- executar publicacao em transacao.

## 15. Regras de negocio

- RN-001: Todo DNA pertence obrigatoriamente a uma Organization.
- RN-002: Todo registro de versao pertence obrigatoriamente a uma Organization.
- RN-003: Cada versao e um snapshot completo.
- RN-004: Versoes publicadas e arquivadas sao imutaveis.
- RN-005: No maximo um rascunho ativo por Organization.
- RN-006: No maximo uma versao publicada por Organization.
- RN-007: Editar DNA publicado cria novo rascunho baseado nele.
- RN-008: Versoes nao sao excluidas fisicamente.
- RN-009: Para publicar, missao, visao e proposito sao obrigatorios.
- RN-010: Para publicar, deve existir pelo menos 1 valor valido.
- RN-011: Para publicar, deve existir pelo menos 1 competencia valida.
- RN-012: Todos os valores devem possuir nome e descricao.
- RN-013: Todas as competencias devem possuir nome e descricao.
- RN-014: A importancia de competencia deve usar escala canonica.
- RN-015: A publicacao deve ser transacional.
- RN-016: Duas publicacoes simultaneas nao podem gerar duas versoes publicadas.
- RN-017: `member` acessa apenas a versao publicada atual.
- RN-018: `admin` nao publica.
- RN-019: `Platform Admin` nao administra conteudo de DNA.
- RN-020: Consulta administrativa de Platform Admin deve ser auditada com motivo.
- RN-021: Rascunhos e historico nao sao expostos a `member`.
- RN-022: Organization arquivada bloqueia operacoes normais.
- RN-023: Acoes negadas relevantes devem gerar auditoria.

## 16. Criterios de aceite

- CA-001: A SPEC deve estar aprovada antes do início da implementação.
- CA-002: No maximo um rascunho ativo por Organization.
- CA-003: No maximo uma versao publicada por Organization.
- CA-004: Versao publicada e imutavel.
- CA-005: Versao arquivada e imutavel.
- CA-006: Owner cria, edita, descarta e publica rascunho autorizado.
- CA-007: Admin cria, edita e descarta rascunho autorizado.
- CA-008: Admin nao publica.
- CA-009: Member visualiza apenas a versao publicada atual.
- CA-010: Member nao visualiza rascunho.
- CA-011: Member nao visualiza historico.
- CA-012: Platform Admin consulta apenas em contexto administrativo auditado.
- CA-013: Platform Admin nao cria, edita, publica, arquiva ou descarta DNA.
- CA-014: Publicacao arquiva a versao anterior e publica a nova em uma unica
  transacao.
- CA-015: Falha em qualquer etapa de publicacao nao deixa estado parcial.
- CA-016: Publicacoes concorrentes nao geram duas versoes publicadas.
- CA-017: Organization arquivada bloqueia operacoes normais de DNA.
- CA-018: `organizationId` manipulado nao concede acesso.
- CA-019: `versionId` manipulado nao concede acesso.
- CA-020: Auditoria nao copia conteudo completo do DNA.
- CA-021: Nao ha restauracao, republicacao direta ou reativacao de versao antiga
  nesta fase.
- CA-022: Nenhuma versao publicada ou arquivada e excluida fisicamente.
- CA-023: Rascunho descartado permanece armazenado e nao pode ser editado ou
  publicado.

## 17. Testes obrigatorios

### 17.1 Funcionamento

- criar rascunho;
- editar rascunho;
- descartar rascunho;
- publicar rascunho;
- consultar versao publicada;
- consultar rascunho autorizado;
- consultar historico autorizado;
- impedir criacao de segundo rascunho ativo na mesma Organization;
- impedir segunda versao publicada na mesma Organization;
- validar limites de campos;
- validar valores e competencias minimos para publicacao;
- validar escala canonica de importancia.

### 17.2 Seguranca

- owner publica;
- admin nao publica;
- member nao ve rascunho;
- member nao ve historico;
- member nao cria;
- member nao edita;
- member nao descarta;
- Platform Admin nao cria, edita, publica, arquiva ou descarta;
- Platform Admin consulta apenas com contexto administrativo auditado;
- acesso cruzado com `organizationId` manipulado;
- acesso cruzado com `versionId` manipulado;
- User sem Membership bloqueado;
- Membership inativo bloqueado;
- User inativo bloqueado;
- Organization arquivada bloqueada;
- auditoria sem conteudo completo;
- nao revelar existencia de DNA de outra Organization.

### 17.3 Banco e transacoes

- `organization_id` obrigatorio;
- `version_number` obrigatorio para versoes publicadas e arquivadas;
- `version_number` unico por Organization quando preenchido;
- somente uma versao `published` por Organization;
- somente um `draft` ativo por Organization;
- status restrito aos valores canonicos;
- versao publicada imutavel;
- versao arquivada imutavel;
- publicacao atomica;
- concorrencia de publicacao;
- auditoria persistida;
- ausencia de exclusao fisica;
- rascunho descartado preservado e bloqueado para edicao/publicacao;
- sem exclusao em cascata destrutiva;
- migrations reproduziveis.

## 18. Limitacoes conhecidas

- Esta SPEC nao implementa codigo.
- Esta SPEC nao cria migration.
- Esta SPEC nao cria tabela.
- Esta SPEC nao aprova implementacao ainda.
- Nao ha IA nesta SPEC.
- Nao ha avaliacao automatica de candidatos.
- Nao ha relacao direta com vagas ou cargos nesta SPEC.
- Nao ha restauracao de versao anterior.
- Nao ha republicacao direta de versao antiga.
- Nao ha workflow de aprovacao.
- Nao ha permissoes customizadas por campo.
- Valores e competencias em JSON estruturado sao possibilidade de implementacao,
  nao decisao definitiva de arquitetura.

## 19. Definicao de concluido

A implementacao futura sera considerada concluida quando:

- SPEC aprovada antes do desenvolvimento;
- criterios de aceite atendidos;
- testes de funcionamento passando;
- testes de seguranca passando;
- testes de acesso cruzado passando;
- testes de concorrencia e transacao passando;
- migration criada quando houver implementacao;
- lint passando;
- formatacao passando;
- build passando;
- documentacao atualizada;
- seguranca revisada;
- nenhum codigo de modulo futuro implementado antecipadamente;
- commit realizado.
