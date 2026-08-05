# SPEC-006 - Estrutura Organizacional

**Status:** Aprovada
**Versao:** 1.0
**Fase:** 3  
**Responsavel de negocio:** Thiago Sousa  
**Ultima atualizacao:** 2026-08-05

## 1. Objetivo

Especificar o modulo de Estrutura Organizacional do Talent OS.

A estrutura de cada `Organization` sera representada por uma unica entidade
chamada `Organizational Unit`. O tipo da unidade indicara se ela representa uma
diretoria, departamento, filial, equipe, squad ou outra forma organizacional.

Esta SPEC prepara a implementacao futura sem criar codigo, banco, migrations,
rotas ou dependencias.

## 2. Fora do escopo

- Codigo de aplicacao;
- migrations;
- criacao de tabelas;
- rotas de API;
- novas dependencias;
- drag-and-drop;
- tipos personalizados de unidade;
- vinculo do gestor com `User`, `Membership` ou colaborador;
- modulo de colaboradores;
- cargos;
- vagas;
- candidatos;
- DISC;
- inteligencia artificial;
- aprovacoes organizacionais;
- historico detalhado com diff completo de dados.

## 3. Usuarios envolvidos

- **owner:** opera a estrutura funcional da Organization ativa.
- **admin:** opera a estrutura funcional da Organization ativa.
- **member:** visualiza apenas unidades ativas da Organization atual.
- **Platform Admin:** consulta em contexto administrativo auditado, sem operar a
  estrutura funcional da empresa.

`Platform Admin` nao e uma Role de Membership e nao recebe permissoes funcionais
de `owner` ou `admin`.

## 4. Conceitos

- **Organizational Unit:** unidade da estrutura organizacional de uma
  `Organization`.
- **Unidade raiz:** Organizational Unit sem `parent_id`.
- **Unidade filha:** Organizational Unit com `parent_id` apontando para outra
  unidade da mesma Organization.
- **Hierarquia:** relacao pai/filhos entre Organizational Units.
- **Codigo:** identificador textual unico dentro da Organization, independente
  do nome exibido.
- **Tipo:** classificacao canonica da unidade nesta fase.
- **Gestor informado:** nome e e-mail opcionais, sem vinculo tecnico com conta
  de usuario nesta fase.

## 5. Fluxo principal

1. Usuario autorizado seleciona uma Organization ativa como contexto.
2. Usuario acessa a Estrutura Organizacional.
3. Sistema lista a arvore permitida para o perfil.
4. Usuario autorizado cria, altera, move, inativa ou reativa uma unidade.
5. Sistema valida permissoes, Organization, unidade, hierarquia e campos.
6. Sistema persiste a alteracao sem exclusao fisica.
7. Sistema registra auditoria das acoes criticas.
8. Sistema retorna a estrutura atualizada ou erro seguro.

## 6. Regras de negocio

- RN-001: Toda unidade da estrutura deve ser uma `Organizational Unit`.
- RN-002: Toda Organizational Unit pertence obrigatoriamente a uma
  `Organization`.
- RN-003: Toda leitura e gravacao deve validar a Organization atual no servidor.
- RN-004: Identificadores enviados pela interface nao provam acesso.
- RN-005: O codigo da unidade e obrigatorio, normalizado e unico dentro da
  Organization.
- RN-006: A unicidade do codigo nao deve diferenciar maiusculas de minusculas.
- RN-007: O codigo nao muda automaticamente quando o nome da unidade muda.
- RN-008: O nome e obrigatorio e nao e identificador tecnico.
- RN-009: Nomes podem se repetir em pontos diferentes da hierarquia.
- RN-010: O tipo e obrigatorio e deve usar apenas valores canonicos desta fase.
- RN-011: Tipos personalizados nao fazem parte da Fase 3.
- RN-012: Uma unidade pode nao ter pai ou pode ter exatamente uma unidade pai.
- RN-013: Uma unidade pode possuir varias unidades filhas.
- RN-014: Uma Organization pode possuir varias unidades raiz.
- RN-015: A unidade pai, quando informada, deve pertencer a mesma Organization.
- RN-016: Uma unidade nao pode ser pai de si mesma.
- RN-017: Ciclos diretos ou indiretos sao proibidos.
- RN-018: Mover uma unidade nao pode criar ciclo.
- RN-019: A profundidade maxima inicial da hierarquia e de 10 niveis.
- RN-020: O calculo de profundidade deve considerar a unidade raiz como nivel 1.
- RN-021: Nao existe exclusao fisica de Organizational Unit.
- RN-022: Status permitidos: `active` e `inactive`.
- RN-023: Uma unidade inativa permanece armazenada e disponivel para historico e
  consultas administrativas autorizadas.
- RN-024: Uma unidade inativa nao pode receber novas unidades filhas.
- RN-025: Uma unidade inativa nao pode ser escolhida como nova unidade pai.
- RN-026: Uma unidade inativa nao deve aparecer como opcao operacional padrao.
- RN-027: Inativar uma unidade com filhas ativas deve ser bloqueado.
- RN-028: Para inativar uma unidade com filhas ativas, o usuario deve antes
  mover ou inativar as filhas.
- RN-029: Reativar uma unidade exige Organization ativa.
- RN-030: Reativar uma unidade com pai exige que a unidade pai esteja ativa.
- RN-031: O gestor deve ser armazenado apenas como `manager_name` e
  `manager_email` nesta fase.
- RN-032: `manager_email` deve ser validado quando informado.
- RN-033: `display_order` organiza unidades irmas.
- RN-034: `display_order` deve ser inteiro com valor minimo zero.
- RN-035: Unidades irmas com a mesma ordem podem ser ordenadas por nome como
  criterio secundario.
- RN-036: Organization arquivada bloqueia operacoes normais sobre estrutura
  organizacional.
- RN-037: Platform Admin pode consultar estrutura de Organization arquivada
  apenas em contexto administrativo auditado.
- RN-038: Nenhuma unidade pode ser reativada quando a Organization estiver
  arquivada.
- RN-039: Uma Organizational Unit nunca pode mudar de Organization.
- RN-040: Caso seja necessario mover uma unidade para outra empresa, uma nova
  unidade deve ser criada na Organization destino.
- RN-041: O historico de uma Organizational Unit nunca atravessa Organizations.
- RN-042: Apos criado, o campo `code` pode ser alterado somente por `owner`.
- RN-043: Toda alteracao de `code` deve gerar auditoria.
- RN-044: Uma unidade inativa nao pode possuir gestor ativo definido
  operacionalmente.
- RN-045: Na Fase 3, dados de gestor em unidade inativa devem ser mantidos
  apenas para historico.
- RN-046: Unidade inativa nao pode aparecer como responsavel ativa em selecoes
  futuras.
- RN-047: Modulos futuros devem referenciar Organizational Unit pelo `id`
  interno.
- RN-048: Modulos futuros nao devem referenciar Organizational Unit pelo nome ou
  pelo codigo.

## 7. Tipos canonicos

Valores permitidos para `type` nesta fase:

- `board`
- `directorate`
- `department`
- `division`
- `branch`
- `office`
- `team`
- `squad`
- `unit`
- `other`

A interface pode apresentar traducoes em portugues, mas os valores persistidos e
usados na API devem ser os valores canonicos acima.

## 8. Dados necessarios

| Campo                | Obrigatorio | Observacao                                                         |
| -------------------- | ----------: | ------------------------------------------------------------------ |
| `id`                 |         Sim | Identificador unico gerado pelo sistema.                           |
| `organization_id`    |         Sim | Organization proprietaria da unidade.                              |
| `code`               |         Sim | Codigo unico por Organization, normalizado.                        |
| `name`               |         Sim | Nome exibido da unidade.                                           |
| `type`               |         Sim | Valor canonico fixo desta fase.                                    |
| `parent_id`          |         Nao | Unidade pai da mesma Organization.                                 |
| `manager_name`       |         Nao | Nome do gestor informado, sem vinculo com User nesta fase.         |
| `manager_email`      |         Nao | E-mail do gestor informado, validado quando presente.              |
| `description`        |         Nao | Descricao operacional da unidade.                                  |
| `display_order`      |         Sim | Inteiro maior ou igual a zero para ordenacao entre unidades irmas. |
| `status`             |         Sim | `active` ou `inactive`.                                            |
| `created_by_user_id` |         Sim | Usuario responsavel pela criacao.                                  |
| `updated_by_user_id` |         Sim | Usuario responsavel pela ultima alteracao.                         |
| `created_at`         |         Sim | Data/hora de criacao.                                              |
| `updated_at`         |         Sim | Data/hora da ultima alteracao.                                     |
| `inactivated_at`     |         Nao | Data/hora da inativacao, quando ocorrer.                           |

### 8.1 Regras de codigo

- Obrigatorio.
- Unico dentro da Organization.
- Nao muda automaticamente quando o nome muda.
- Deve ser normalizado.
- Deve possuir entre 2 e 50 caracteres.
- Pode conter letras, numeros, hifen e sublinhado.
- Nao deve diferenciar maiusculas de minusculas para unicidade.
- Apos criado, pode ser alterado somente por `owner`.
- Toda alteracao deve gerar auditoria.

Exemplos validos:

- `DIR-COM`
- `DEP-RH`
- `FIL-CWB`
- `SQUAD-01`

### 8.2 Regras de nome

- Obrigatorio.
- Deve possuir entre 2 e 150 caracteres.
- Pode ser repetido em pontos diferentes da hierarquia.
- Nao deve ser usado como identificador tecnico.

## 9. Permissoes

A matriz detalhada de autorizacao deve permanecer centralizada na SPEC-004.

Regras essenciais desta SPEC:

### Owner

Pode, dentro de Organization ativa e com Membership ativo:

- criar Organizational Unit;
- visualizar Organizational Units;
- alterar dados;
- alterar `code`;
- mover unidade;
- inativar unidade;
- reativar unidade;
- consultar historico.

### Admin

Pode, dentro de Organization ativa e com Membership ativo:

- criar Organizational Unit;
- visualizar Organizational Units;
- alterar dados, exceto `code`;
- mover unidade;
- inativar unidade;
- reativar unidade;
- consultar historico.

### Member

Pode:

- visualizar apenas unidades ativas da Organization atual ativa.

Nao pode:

- criar;
- alterar;
- mover;
- inativar;
- reativar;
- consultar historico administrativo.

### Platform Admin

Pode:

- consultar estrutura em contexto administrativo auditado.

Nao pode:

- criar;
- alterar;
- mover;
- inativar;
- reativar;
- operar a estrutura funcional da empresa.

## 10. Organization arquivada

Quando a Organization estiver `archived`:

- `owner`, `admin` e `member` nao podem criar, alterar, mover, inativar ou
  reativar unidades;
- `member` nao possui consulta operacional normal;
- Organization arquivada nao pode ser selecionada como contexto operacional;
- Platform Admin pode consultar apenas em contexto administrativo auditado;
- nenhuma unidade pode ser reativada;
- dados permanecem armazenados para historico e administracao autorizada.

## 11. Interface

A interface minima deve prever:

- visualizacao em arvore;
- criacao de unidade;
- edicao de unidade;
- selecao de tipo;
- selecao de unidade pai;
- movimentacao de unidade;
- campos de gestor;
- inativacao;
- reativacao;
- filtro de unidades ativas e inativas;
- mensagens claras de erro.

Nao exigir drag-and-drop nesta fase.

A interface deve ocultar ou desabilitar acoes nao permitidas, mas o servidor
continua sendo responsavel pela autorizacao real.

## 12. API conceitual

| Operacao                         | Finalidade                                                  |
| -------------------------------- | ----------------------------------------------------------- |
| Criar unidade                    | Criar Organizational Unit em Organization ativa.            |
| Listar arvore completa           | Consultar arvore permitida para owner/admin.                |
| Listar unidades ativas           | Consultar unidades ativas para uso operacional.             |
| Consultar unidade                | Obter unidade permitida dentro da Organization validada.    |
| Atualizar dados                  | Alterar campos editaveis de uma unidade ativa ou inativa.   |
| Mover unidade                    | Alterar `parent_id` e/ou `display_order`.                   |
| Inativar unidade                 | Marcar unidade como `inactive`, sem exclusao fisica.        |
| Reativar unidade                 | Retornar unidade para `active` quando regras permitirem.    |
| Consultar historico              | Consultar eventos da estrutura para usuarios autorizados.   |
| Consulta administrativa auditada | Permitir leitura por Platform Admin com motivo e auditoria. |

Operacoes devem negar por padrao quando a permissao nao estiver explicitamente
prevista.

## 13. Movimentacao e hierarquia

Mover uma unidade deve:

1. validar a Organization atual no servidor;
2. validar a unidade movida;
3. validar a nova unidade pai, quando informada;
4. confirmar que unidade e novo pai pertencem a mesma Organization;
5. impedir autorreferencia;
6. impedir ciclos diretos;
7. impedir ciclos indiretos;
8. impedir profundidade acima de 10 niveis;
9. impedir uso de pai inativo;
10. registrar auditoria;
11. ocorrer em transacao quando a consistencia exigir.

Quando `parent_id` for removido, a unidade passa a ser uma unidade raiz, desde
que as demais regras sejam respeitadas.

## 14. Banco de dados

Tabela conceitual esperada: `organizational_units`.

Campos minimos:

| Campo                | Restricao esperada                             |
| -------------------- | ---------------------------------------------- |
| `id`                 | Chave primaria.                                |
| `organization_id`    | Obrigatorio, FK para `organizations(id)`.      |
| `code`               | Obrigatorio.                                   |
| `name`               | Obrigatorio.                                   |
| `type`               | Obrigatorio, restrito aos tipos canonicos.     |
| `parent_id`          | Opcional, FK autorreferente.                   |
| `manager_name`       | Opcional.                                      |
| `manager_email`      | Opcional.                                      |
| `description`        | Opcional.                                      |
| `display_order`      | Obrigatorio, inteiro maior ou igual a zero.    |
| `status`             | Obrigatorio, restrito a `active` e `inactive`. |
| `created_by_user_id` | Obrigatorio, FK para `users(id)`.              |
| `updated_by_user_id` | Obrigatorio, FK para `users(id)`.              |
| `created_at`         | Obrigatorio.                                   |
| `updated_at`         | Obrigatorio.                                   |
| `inactivated_at`     | Opcional.                                      |

Restricoes e indices esperados:

- `organization_id` obrigatorio;
- `organization_id` imutavel apos a criacao;
- codigo unico por Organization sem diferenciar maiusculas de minusculas;
- chave estrangeira autorreferente para `parent_id`;
- `parent_id` sem exclusao em cascata destrutiva;
- indices para `organization_id`, `parent_id`, `status`, `type` e
  `display_order`;
- restricao de status;
- restricao de type;
- timestamps consistentes;
- migration reproduzivel;
- ausencia de exclusao fisica no fluxo oficial.

A prevencao de ciclos deve existir no servidor e ser coberta por testes. O banco
pode reforcar restricoes estruturais, mas nao substitui a validacao de
hierarquia no servidor.

## 15. Seguranca

- Validar `organizationId`, `unitId` e `parentId` no servidor.
- Bloquear acesso cruzado entre Organizations.
- Bloquear qualquer tentativa de alterar a Organization de uma unidade
  existente.
- Nunca confiar apenas na interface.
- Consultas devem sempre ser limitadas a Organization atual validada.
- `parentId` manipulado para unidade de outra Organization deve retornar erro
  seguro sem revelar detalhes da unidade externa.
- `unitId` manipulado para unidade de outra Organization deve retornar erro
  seguro sem revelar existencia de dados externos.
- Mensagens de erro nao devem expor detalhes internos ou dados de outra
  Organization.
- Auditoria nao deve registrar conteudo pessoal desnecessario.
- Auditoria nao deve registrar tokens, headers sensiveis, senhas, connection
  strings ou segredos.
- Platform Admin nao deve receber permissoes funcionais de `owner` ou `admin`.
- Operacoes em Organization arquivada devem ser bloqueadas para usuarios
  funcionais.

## 16. Auditoria

Eventos obrigatorios:

- criacao de unidade;
- alteracao de unidade;
- alteracao de codigo;
- movimentacao de unidade;
- inativacao de unidade;
- reativacao de unidade;
- tentativa de ciclo;
- tentativa de acesso cruzado;
- tentativa de acao sem permissao;
- consulta administrativa da plataforma.

Eventos comuns nao devem registrar o conteudo completo anterior e posterior da
unidade. Registrar apenas:

- identificador da Organization;
- identificador da unidade;
- identificador do ator, quando aplicavel;
- tipo de acao;
- resultado;
- campos alterados, quando necessario;
- motivo administrativo, quando aplicavel;
- data e hora.

## 17. Criterios de aceite

- CA-001: Criar unidade raiz em Organization ativa.
- CA-002: Criar unidade filha em Organization ativa.
- CA-003: Permitir varias unidades raiz na mesma Organization.
- CA-004: Recusar codigo duplicado na mesma Organization.
- CA-005: Permitir o mesmo codigo em Organizations diferentes.
- CA-006: Aplicar unicidade de codigo sem diferenciar maiusculas de minusculas.
- CA-007: Permitir nome repetido em pontos diferentes da hierarquia.
- CA-008: Recusar tipo invalido.
- CA-009: Recusar status invalido.
- CA-010: Recusar unidade pai inexistente.
- CA-011: Recusar unidade pai de outra Organization sem revelar dados externos.
- CA-012: Recusar autorreferencia.
- CA-013: Recusar ciclo direto.
- CA-014: Recusar ciclo indireto.
- CA-015: Recusar profundidade maior que 10 niveis.
- CA-016: Permitir movimentacao valida.
- CA-017: Inativar unidade sem filhas ativas.
- CA-018: Bloquear inativacao de unidade com filhas ativas.
- CA-019: Bloquear criacao de nova filha em unidade inativa.
- CA-020: Bloquear escolha de pai inativo.
- CA-021: Permitir reativacao quando a Organization e o pai estiverem ativos.
- CA-022: Bloquear reativacao quando o pai estiver inativo.
- CA-023: Member visualiza somente unidades ativas.
- CA-024: Member nao cria, altera, move, inativa ou reativa unidades.
- CA-025: Owner e admin operam conforme permissoes desta SPEC e SPEC-004.
- CA-026: Platform Admin apenas consulta administrativamente com auditoria.
- CA-027: Organization arquivada bloqueia operacoes normais.
- CA-028: Manipulacao de `organizationId`, `unitId` ou `parentId` nao permite
  acesso cruzado.
- CA-029: Nao existe exclusao fisica.
- CA-030: Eventos criticos geram auditoria.
- CA-031: Organizational Unit nao pode mudar de Organization.
- CA-032: Historico de unidade nao atravessa Organizations.
- CA-033: Apenas owner altera `code` apos criacao.
- CA-034: Alteracao de `code` gera auditoria.
- CA-035: Unidade inativa nao aparece como responsavel ativa em selecoes
  futuras.
- CA-036: Modulos futuros referenciam Organizational Unit pelo `id` interno, nao
  por nome ou codigo.

## 18. Testes obrigatorios

1. Criar unidade raiz.
2. Criar unidade filha.
3. Criar varias raizes.
4. Codigo duplicado na mesma Organization.
5. Mesmo codigo em Organizations diferentes.
6. Unicidade sem diferenciar maiusculas e minusculas.
7. Nome repetido permitido.
8. Tipo invalido.
9. Status invalido.
10. Unidade pai inexistente.
11. Unidade pai de outra Organization.
12. Autorreferencia.
13. Ciclo direto.
14. Ciclo indireto.
15. Profundidade maior que 10.
16. Mover unidade validamente.
17. Inativar unidade sem filhas ativas.
18. Bloquear inativacao com filhas ativas.
19. Bloquear nova filha em unidade inativa.
20. Bloquear pai inativo.
21. Reativar com pai ativo.
22. Bloquear reativacao com pai inativo.
23. Member somente visualiza unidades ativas.
24. Member nao altera.
25. Owner e admin operam conforme permissao.
26. Platform Admin apenas consulta administrativamente.
27. Organization arquivada bloqueia operacoes.
28. Manipulacao de `organizationId`.
29. Manipulacao de `unitId`.
30. Manipulacao de `parentId`.
31. Auditoria de criacao, alteracao, movimentacao, inativacao e reativacao.
32. Persistencia apos recriar a aplicacao.
33. Ausencia de exclusao fisica.
34. Bloquear alteracao de `organization_id` de uma unidade existente.
35. Bloquear admin e member alterando `code`.
36. Permitir owner alterando `code` com auditoria.
37. Garantir que unidade inativa nao seja listada como responsavel ativa.
38. Garantir que referencias futuras usem `id` interno em contratos e modelos.

## 19. Limitacoes conhecidas

- Esta SPEC nao implementa codigo.
- Esta SPEC nao cria banco, migrations, rotas ou dependencias.
- Tipos personalizados ficam para fase futura.
- Gestor nao possui vinculo com `User`, `Membership` ou colaborador nesta fase.
- Nao ha drag-and-drop nesta fase.
- Nao ha modulo de colaboradores nesta fase.
- Nao ha cargos, vagas, candidatos, DISC ou inteligencia artificial nesta fase.
- Historico detalhado com diff completo fica fora do escopo inicial.

## 20. Definicao de concluido

- SPEC revisada;
- criterios de aceite verificaveis;
- testes obrigatorios definidos;
- compatibilidade com SPEC-001 e SPEC-004 revisada;
- seguranca multiempresa descrita;
- banco conceitual descrito;
- nenhuma alteracao de codigo;
- nenhuma migration criada;
- nenhuma dependencia instalada;
- aprovacao antes da implementacao.
