# Implementação da Fase 3 — Estrutura Organizacional

Leia obrigatoriamente:

- `CONSTITUICAO_DO_PROJETO.md`
- `AGENTS.md`
- `SECURITY.md`
- `CHECKLIST-REVISAO.md`
- todas as decisões em `docs/03-arquitetura/decisoes/`
- `docs/02-requisitos/specs/SPEC-001-Organization.md`
- `docs/02-requisitos/specs/SPEC-004-Roles-Permissions.md`
- `docs/02-requisitos/specs/SPEC-006-Estrutura-Organizacional.md`

Implemente somente a Fase 3, seguindo integralmente a SPEC-006.

## Escopo

Implementar:

- entidade `Organizational Unit`;
- hierarquia por `parent_id`;
- criação de unidades raiz e filhas;
- consulta em árvore;
- consulta de unidades ativas;
- atualização;
- movimentação na hierarquia;
- inativação;
- reativação;
- consulta administrativa auditada;
- persistência PostgreSQL/Supabase;
- auditoria;
- interface simples;
- testes funcionais e de segurança.

Não implementar:

- cargos;
- vagas;
- colaboradores;
- organograma de pessoas;
- workflows;
- centros de custo;
- tipos personalizados;
- drag-and-drop;
- importação em massa;
- exclusão física.

## Antes de alterar código

Apresente:

1. entendimento da SPEC-006;
2. modelo de dados;
3. migration necessária;
4. estratégia de hierarquia com `parent_id`;
5. estratégia para impedir ciclos;
6. estratégia para limitar profundidade a 10 níveis;
7. estratégia de movimentação;
8. estratégia de inativação e reativação;
9. permissões por role;
10. estratégia de auditoria;
11. rotas da API;
12. interface;
13. testes previstos;
14. arquivos que serão criados ou alterados;
15. riscos e limitações.

Não implemente antes de apresentar esse plano.

## Decisão de arquitetura

Use inicialmente o modelo **Adjacency List**, com:

- uma coluna `parent_id`;
- chave estrangeira autorreferente;
- várias unidades raiz permitidas;
- consultas recursivas no PostgreSQL quando necessário.

Não implementar `Closure Table` ou `Materialized Path` nesta fase.

Registre a decisão em uma nova ADR.

## Modelo mínimo

Criar a tabela `organizational_units` com:

- `id`;
- `organization_id`;
- `code`;
- `name`;
- `type`;
- `parent_id`;
- `manager_name`;
- `manager_email`;
- `description`;
- `display_order`;
- `status`;
- `created_by_user_id`;
- `updated_by_user_id`;
- `created_at`;
- `updated_at`;
- `inactivated_at`.

## Tipos permitidos

- `board`;
- `directorate`;
- `department`;
- `division`;
- `branch`;
- `office`;
- `team`;
- `squad`;
- `unit`;
- `other`.

Não aceitar tipos fora dessa lista.

## Status permitidos

- `active`;
- `inactive`.

Não existe exclusão física.

## Código

O campo `code` deve:

- ser obrigatório;
- possuir entre 2 e 50 caracteres;
- aceitar letras, números, hífen e sublinhado;
- ser normalizado;
- ser único por Organization sem diferenciar maiúsculas de minúsculas;
- não mudar automaticamente quando o nome mudar.

Depois da criação:

- somente `owner` pode alterar o código;
- a alteração deve gerar auditoria;
- `admin` não pode alterar o código.

## Nome

O nome deve:

- ser obrigatório;
- possuir entre 2 e 150 caracteres;
- poder ser repetido;
- não ser usado como identificador técnico.

## Hierarquia

Cada unidade pode possuir zero ou uma unidade pai.

Uma unidade pai deve:

- existir;
- pertencer à mesma Organization;
- estar ativa.

Regras:

- uma unidade não pode ser pai de si mesma;
- ciclos diretos e indiretos são proibidos;
- raiz é considerada nível 1;
- profundidade máxima é 10;
- uma Organization pode possuir várias raízes;
- uma unidade nunca muda de Organization.

## Movimentação

A movimentação deve ocorrer em operação própria.

Antes de mover:

1. validar User, Membership e Organization;
2. validar unidade atual;
3. validar nova unidade pai, quando informada;
4. confirmar mesma Organization;
5. impedir autorreferência;
6. impedir ciclo;
7. calcular profundidade resultante;
8. considerar toda a subárvore movida;
9. impedir profundidade final acima de 10;
10. registrar auditoria;
11. executar em transação quando necessário.

Mover uma unidade para raiz deve ser permitido usando `parent_id` vazio.

## Inativação

Uma unidade pode ser inativada quando:

- está ativa;
- não possui filhas ativas;
- a Organization está ativa;
- o usuário possui permissão.

Ao inativar:

- definir status `inactive`;
- preencher `inactivated_at`;
- preservar gestor e demais dados apenas para histórico;
- impedir uso operacional;
- registrar auditoria.

Não inativar automaticamente as filhas.

## Reativação

Uma unidade pode ser reativada quando:

- está inativa;
- a Organization está ativa;
- a unidade pai está ativa, quando existir;
- o usuário possui permissão.

Ao reativar:

- definir status `active`;
- limpar `inactivated_at`;
- registrar auditoria.

## Gestor

Nesta fase, armazenar apenas:

- `manager_name`;
- `manager_email`.

Regras:

- ambos opcionais;
- e-mail deve ser válido quando informado;
- não criar vínculo com User, Membership ou colaborador;
- unidade inativa não pode aparecer como responsável operacional ativa;
- os dados permanecem salvos para histórico.

## Ordem de exibição

`display_order` deve:

- ser inteiro;
- aceitar valor mínimo zero;
- organizar unidades irmãs;
- usar nome como segundo critério quando houver empate.

## Permissões

### Owner

Pode:

- criar;
- visualizar;
- atualizar todos os campos;
- alterar código;
- mover;
- inativar;
- reativar;
- consultar histórico.

### Admin

Pode:

- criar;
- visualizar;
- atualizar campos permitidos;
- mover;
- inativar;
- reativar;
- consultar histórico.

Não pode alterar `code` após a criação.

### Member

Pode apenas:

- visualizar unidades ativas da própria Organization.

Não pode:

- visualizar unidades inativas;
- criar;
- alterar;
- mover;
- inativar;
- reativar;
- consultar histórico administrativo.

### Platform Admin

Pode apenas consultar em contexto administrativo auditado.

Não pode criar, alterar, mover, inativar ou reativar unidades.

## Organization arquivada

Quando a Organization estiver `archived`:

- owner, admin e member não podem operar a estrutura;
- member não possui consulta operacional normal;
- nenhuma unidade pode ser criada, alterada, movida, inativada ou reativada;
- Platform Admin pode consultar apenas pela rota administrativa auditada.

## Segurança

Toda operação deve validar no servidor:

- User ativo;
- Membership ativo;
- Organization;
- status da Organization;
- role;
- `organizationId`;
- `unitId`;
- `parentId`;
- propriedade dos registros.

Não confiar na interface.

Não revelar a existência de unidades de outra Organization.

Todas as consultas devem ser limitadas à Organization atual.

## Banco de dados

A migration deve garantir:

- `organization_id` obrigatório;
- chave estrangeira para Organization;
- chave estrangeira autorreferente para `parent_id`;
- código único por Organization sem diferenciar maiúsculas e minúsculas;
- status restrito;
- type restrito;
- `display_order >= 0`;
- índices para:

  - `organization_id`;
  - `parent_id`;
  - `status`;
  - `type`;
  - `display_order`;

- ausência de exclusão em cascata destrutiva.

A prevenção de ciclos deve existir no servidor e ser coberta por testes.

## API mínima

A nomenclatura deve seguir o padrão existente.

Operações mínimas:

- criar unidade;
- listar árvore;
- listar unidades ativas;
- consultar unidade;
- atualizar unidade;
- mover unidade;
- inativar;
- reativar;
- consultar histórico;
- consulta administrativa auditada.

Exemplos conceituais:

- `POST /api/organizations/:organizationId/organizational-units`
- `GET /api/organizations/:organizationId/organizational-units/tree`
- `GET /api/organizations/:organizationId/organizational-units`
- `GET /api/organizations/:organizationId/organizational-units/:unitId`
- `PATCH /api/organizations/:organizationId/organizational-units/:unitId`
- `POST /api/organizations/:organizationId/organizational-units/:unitId/move`
- `POST /api/organizations/:organizationId/organizational-units/:unitId/inactivate`
- `POST /api/organizations/:organizationId/organizational-units/:unitId/reactivate`
- rota administrativa própria para Platform Admin.

## Interface mínima

Criar interface simples para:

- visualizar árvore;
- criar raiz;
- criar unidade filha;
- editar unidade;
- selecionar tipo;
- selecionar unidade pai;
- informar gestor;
- definir ordem;
- mover unidade;
- inativar;
- reativar;
- filtrar ativas e inativas;
- exibir status;
- apresentar erros claramente.

Não implementar drag-and-drop.

## Auditoria

Registrar:

- criação;
- alteração;
- mudança de código;
- movimentação;
- inativação;
- reativação;
- tentativa de ciclo;
- tentativa de acesso cruzado;
- tentativa de ação sem permissão;
- consulta administrativa.

Não registrar conteúdo pessoal desnecessário.

Não copiar registros completos para auditoria.

## Testes obrigatórios

Implementar testes PostgreSQL integrados para:

1. criar unidade raiz;
2. criar unidade filha;
3. criar várias raízes;
4. código duplicado na mesma Organization;
5. mesmo código em Organizations diferentes;
6. unicidade sem diferenciar maiúsculas e minúsculas;
7. nome repetido permitido;
8. código inválido;
9. tipo inválido;
10. status inválido;
11. unidade pai inexistente;
12. unidade pai de outra Organization;
13. unidade pai inativa;
14. autorreferência;
15. ciclo direto;
16. ciclo indireto;
17. profundidade maior que 10;
18. mover unidade validamente;
19. mover unidade para raiz;
20. mover subárvore respeitando profundidade;
21. owner alterar código;
22. admin ser impedido de alterar código;
23. member visualizar somente ativas;
24. member não alterar;
25. owner e admin operarem conforme permissão;
26. inativar unidade sem filhas ativas;
27. bloquear inativação com filhas ativas;
28. bloquear criação de filha em unidade inativa;
29. reativar com pai ativo;
30. bloquear reativação com pai inativo;
31. Platform Admin apenas consultar administrativamente;
32. Platform Admin não operar;
33. Organization arquivada bloquear operações;
34. manipulação de `organizationId`;
35. manipulação de `unitId`;
36. manipulação de `parentId`;
37. tentativa de mover unidade para outra Organization;
38. auditoria das operações principais;
39. ausência de exclusão física;
40. persistência após recriar a aplicação.

Os testes de isolamento devem atingir a API integrada com PostgreSQL.

## Decisão arquitetural

Crie uma ADR documentando:

- uso de Adjacency List;
- motivo da escolha;
- limite de profundidade;
- prevenção de ciclos;
- estratégia de consultas recursivas;
- possíveis caminhos de evolução futura.

## Verificações finais

Execute:

- migrations;
- testes;
- lint;
- formatação;
- build;
- auditoria de dependências.

## Entrega obrigatória

Informe:

1. resumo;
2. arquivos criados e alterados;
3. modelo de dados;
4. migration;
5. rotas da API;
6. estratégia de hierarquia;
7. prevenção de ciclos;
8. controle de profundidade;
9. permissões;
10. auditoria;
11. interface;
12. testes;
13. resultado das verificações;
14. como testar manualmente;
15. limitações;
16. riscos restantes;
17. confirmação de que nenhum módulo futuro foi criado.
