# Implementação da Fase 4 — Catálogo de Competências

Leia obrigatoriamente:

- `CONSTITUICAO_DO_PROJETO.md`
- `AGENTS.md`
- `SECURITY.md`
- `CHECKLIST-REVISAO.md`
- todas as decisões em `docs/03-arquitetura/decisoes/`
- `docs/02-requisitos/specs/SPEC-001-Organization.md`
- `docs/02-requisitos/specs/SPEC-004-Roles-Permissions.md`
- `docs/02-requisitos/specs/SPEC-007-Catalogo-de-Competencias.md`

Implemente somente a Fase 4, seguindo integralmente a SPEC-007.

## Escopo

Implementar:

- biblioteca global de competências;
- competências próprias da Organization;
- adoção de competências globais;
- catálogo operacional unificado por Organization;
- referência operacional por `competency_catalog_items.id`;
- ativação, inativação e depreciação;
- permissões por role;
- persistência PostgreSQL/Supabase;
- auditoria;
- interface simples;
- testes funcionais, de segurança, isolamento e persistência.

Não implementar:

- cargos;
- vagas;
- entrevistas;
- avaliações;
- matching;
- inteligência artificial;
- pesos;
- categorias personalizadas;
- versionamento formal de competências;
- exclusão física.

## Antes de alterar código

Apresente:

1. entendimento da SPEC-007;
2. modelo de dados;
3. migration proposta;
4. relação entre:

   - `global_competencies`;
   - `organization_competencies`;
   - `organization_adopted_competencies`;
   - `competency_catalog_items`;

5. fluxo de criação global;
6. fluxo de criação própria;
7. fluxo de adoção;
8. fluxo de ativação, inativação e depreciação;
9. estratégia de consistência transacional;
10. permissões;
11. estratégia de auditoria;
12. rotas da API;
13. interface;
14. testes;
15. arquivos que serão criados ou alterados;
16. riscos e limitações.

Não implemente antes de apresentar esse plano.

## Arquitetura obrigatória

O domínio de Competências deve possuir serviço próprio.

Módulos futuros deverão consumir a referência operacional de competência pelo serviço ou contrato do módulo.

Não permitir que módulos futuros dependam diretamente das tabelas internas de origem quando existir serviço responsável.

## Estruturas obrigatórias

### Global Competency

Representa uma competência oficial da plataforma.

Campos mínimos:

- `id`;
- `code`;
- `normalized_code`;
- `name`;
- `category`;
- `definition`;
- `positive_evidences`;
- `negative_evidences`;
- `practical_examples`;
- `proficiency_levels`;
- `status`;
- autoria;
- timestamps.

Não possui `organization_id`.

### Organization Competency

Representa uma competência própria da empresa.

Campos mínimos:

- `id`;
- `organization_id`;
- `code`;
- `normalized_code`;
- `name`;
- `category`;
- `definition`;
- `positive_evidences`;
- `negative_evidences`;
- `practical_examples`;
- `proficiency_levels`;
- `status`;
- autoria;
- timestamps.

Nunca muda de Organization.

### Organization Adopted Competency

Representa a adoção de uma competência global.

Campos mínimos:

- `id`;
- `organization_id`;
- `global_competency_id`;
- `status`;
- autoria;
- timestamps.

Não copia o conteúdo global.

### Competency Catalog Item

Representa a referência operacional unificada.

Campos mínimos:

- `id`;
- `organization_id`;
- `origin`;
- `global_competency_id`, opcional;
- `organization_competency_id`, opcional;
- `status`;
- timestamps.

Regras:

- `origin = global` exige `global_competency_id`;
- `origin = organization` exige `organization_competency_id`;
- apenas uma referência de origem pode estar preenchida;
- o item sempre pertence a uma Organization;
- módulos futuros usam apenas `competency_catalog_items.id`;
- nenhum item pode atravessar Organizations.

## Categorias permitidas

- `technical`;
- `behavioral`;
- `leadership`;
- `management`;
- `tools`;
- `languages`;
- `compliance`;
- `safety`;
- `other`.

Não aceitar categorias fora da lista.

## Status permitidos

### Global Competency

- `active`;
- `inactive`;
- `deprecated`.

### Organization Competency

- `active`;
- `inactive`.

### Adopted Competency

- `active`;
- `inactive`.

### Competency Catalog Item

- `active`;
- `inactive`.

Não existe exclusão física.

## Código

O campo `code` deve:

- ser obrigatório;
- possuir entre 2 e 50 caracteres;
- aceitar letras, números, hífen e sublinhado;
- preservar a forma exibida;
- usar representação normalizada para unicidade;
- remover espaços laterais;
- ignorar diferenças entre maiúsculas e minúsculas;
- não ser usado como referência de domínio.

Regras:

- código global único na plataforma;
- código próprio único dentro da Organization;
- somente Platform Admin altera código global;
- somente owner altera código próprio;
- toda mudança gera auditoria.

## Nome e definição

Nome:

- obrigatório;
- entre 2 e 150 caracteres.

Definição:

- obrigatória para competência ativa;
- até 4.000 caracteres.

## Evidências

### Evidências positivas

- até 30 itens;
- até 500 caracteres por item;
- cada item possui texto e ordem.

### Evidências negativas

- até 30 itens;
- até 500 caracteres por item;
- cada item possui texto e ordem.

## Exemplos práticos

- opcionais;
- até 20 itens;
- até 1.000 caracteres por item.

## Níveis de proficiência

Usar obrigatoriamente cinco níveis:

1. `basic`
2. `intermediate`
3. `proficient`
4. `advanced`
5. `reference`

Cada nível deve possuir:

- número;
- código;
- nome exibido;
- descrição;
- evidências observáveis opcionais.

Regras:

- os cinco níveis são obrigatórios para ativação;
- ordem fixa de 1 a 5;
- números não podem repetir;
- códigos não podem repetir;
- descrição obrigatória;
- até 2.000 caracteres por descrição.

## Biblioteca global

Somente Platform Admin pode:

- criar;
- editar;
- alterar código;
- ativar;
- inativar;
- depreciar;
- consultar histórico.

Usuários de Organization não podem alterar competências globais.

## Competências próprias

### Owner

Pode:

- criar;
- editar;
- alterar código;
- ativar;
- inativar;
- consultar histórico.

### Admin

Pode:

- criar;
- editar, exceto código;
- ativar;
- inativar;
- consultar histórico.

### Member

Pode apenas visualizar competências próprias ativas disponíveis no catálogo operacional.

## Adoção

Owner e admin podem adotar competência global `active`.

Regras:

- adoção única por Organization e Global Competency;
- adoção não copia conteúdo;
- adoção cria ou mantém `competency_catalog_item`;
- adoção e item operacional devem permanecer consistentes;
- a operação deve ser transacional;
- inativação da adoção inativa o item operacional;
- reativação reativa o item quando permitido.

## Depreciação

Quando uma Global Competency muda para `deprecated`:

- não aceita novas adoções;
- adoções ativas existentes permanecem visíveis;
- adoções ativas existentes continuam disponíveis para uso operacional;
- adoções existentes não são inativadas automaticamente;
- adoção inativa não pode ser reativada;
- vínculos históricos permanecem preservados;
- interface deve sinalizar a depreciação;
- mudança deve gerar auditoria.

## Inativação global

Quando uma Global Competency muda para `inactive`:

- não aceita novas adoções;
- não permite novo uso operacional;
- adoções existentes permanecem armazenadas;
- itens operacionais correspondentes devem ficar indisponíveis conforme a SPEC;
- histórico deve permanecer preservado.

A implementação deve documentar claramente como mantém a consistência entre status global, adoção e item operacional.

## Catálogo operacional unificado

A Organization deve visualizar em uma única listagem:

- competências próprias ativas;
- competências globais adotadas e disponíveis.

Cada item deve informar:

- `competency_catalog_item_id`;
- origem;
- código;
- nome;
- categoria;
- status;
- status global quando a origem for global;
- se pode ser editado pela Organization;
- sinalização de depreciação.

Não usar nome ou código como chave.

## Organization arquivada

Quando a Organization estiver `archived`:

- owner, admin e member não podem operar competências;
- member não possui consulta operacional normal;
- competências próprias, adoções e catalog items permanecem preservados;
- Platform Admin pode consultar dados da Organization apenas em contexto administrativo auditado.

## Platform Admin

Platform Admin:

- administra somente a biblioteca global;
- não opera competências próprias como owner/admin;
- pode consultar dados de Organization apenas por rota administrativa;
- consulta administrativa exige motivo;
- consulta administrativa gera auditoria;
- não recebe role de Membership.

## Segurança

Validar no servidor:

- User ativo;
- Membership ativo;
- Organization ativa;
- role;
- `organizationId`;
- `competencyId`;
- `globalCompetencyId`;
- `adoptionId`;
- `competencyCatalogItemId`;
- propriedade de todos os registros.

Não confiar na interface.

Não revelar competência privada de outra Organization.

Não permitir alteração de `organization_id`.

Não registrar conteúdos completos, listas completas ou dados pessoais desnecessários em auditoria.

## Banco de dados

A migration deve garantir:

- código global único, sem diferenciar maiúsculas e minúsculas;
- código próprio único por Organization;
- adoção única por Organization + Global Competency;
- catálogo operacional consistente;
- apenas uma origem preenchida por catalog item;
- FKs válidas;
- categorias e status canônicos;
- índices adequados;
- ausência de cascade destrutivo;
- bloqueio de mudança de `organization_id`;
- armazenamento estruturado das listas;
- migrations reproduzíveis.

Pode usar JSONB para:

- evidências;
- exemplos;
- níveis.

Desde que exista validação forte no servidor.

## Transações obrigatórias

Usar transação para:

- criação de competência própria + catalog item;
- adoção global + catalog item;
- ativação ou inativação que afete mais de uma tabela;
- mudança de status global que exija atualização operacional;
- auditoria de operações críticas.

Falha da auditoria crítica deve reverter a operação.

## API mínima

### Plataforma

- criar competência global;
- listar catálogo global;
- consultar competência global;
- atualizar;
- ativar;
- inativar;
- depreciar;
- consultar histórico.

### Organization

- criar competência própria;
- listar catálogo unificado;
- consultar competência disponível;
- atualizar competência própria;
- ativar/inativar competência própria;
- listar globais disponíveis;
- adotar global;
- ativar/inativar adoção;
- consultar histórico;
- consulta administrativa auditada.

## Interface mínima

Criar:

- aba Biblioteca Global;
- aba Competências da Empresa;
- aba Catálogo Utilizado;
- criação de competência própria;
- edição;
- ativação/inativação;
- adoção de global;
- origem visível;
- níveis de proficiência;
- evidências;
- filtros por categoria e status;
- sinalização de competência depreciada;
- mensagens claras de permissão.

Não criar design avançado.

## Auditoria

Registrar:

- criação global;
- edição global;
- mudança de código;
- ativação;
- inativação;
- depreciação;
- criação própria;
- adoção;
- reativação e inativação de adoção;
- tentativa de acesso cruzado;
- tentativa de edição indevida;
- ação sem permissão;
- consulta administrativa.

Não registrar:

- listas completas de evidências;
- listas completas de níveis;
- conteúdo completo da competência;
- tokens;
- headers;
- segredos.

## Testes obrigatórios

Implementar testes PostgreSQL integrados para:

1. Platform Admin criar global;
2. usuário de Organization não criar global;
3. código global duplicado;
4. unicidade global sem diferenciar maiúsculas/minúsculas;
5. owner criar competência própria;
6. admin criar competência própria;
7. member não criar;
8. código próprio duplicado na mesma Organization;
9. mesmo código em Organizations diferentes;
10. owner alterar código próprio;
11. admin não alterar código próprio;
12. empresa não editar global;
13. adotar global ativa;
14. adoção criar catalog item;
15. competência própria criar catalog item;
16. impedir adoção duplicada;
17. impedir adoção de global deprecated;
18. impedir adoção de global inactive;
19. preservar adoção ativa após depreciação;
20. manter adoção depreciada visível e utilizável;
21. impedir reativação de adoção inativa quando global deprecated;
22. depreciação não inativar adoções existentes;
23. inativar adoção;
24. reativar adoção quando permitido;
25. catálogo unificado sem duplicações;
26. member visualizar somente disponíveis;
27. User sem Membership;
28. Membership inativo;
29. User inativo;
30. evidências acima do limite;
31. exemplos acima do limite;
32. níveis incompletos;
33. nível duplicado;
34. código de nível inválido;
35. categoria inválida;
36. status inválido;
37. Organization arquivada bloquear operações;
38. manipulação de `organizationId`;
39. manipulação de competência própria;
40. manipulação de competência global;
41. manipulação de adoptionId;
42. manipulação de catalog item;
43. tentativa de mudar competência própria de Organization;
44. catalog item de outra Organization;
45. Platform Admin consultar Organization somente administrativamente;
46. auditoria das operações principais;
47. auditoria sem conteúdo completo;
48. rollback quando auditoria crítica falha;
49. ausência de exclusão física;
50. persistência após recriar aplicação.

Os testes devem atingir a API integrada com PostgreSQL.

## ADR

Crie uma nova ADR documentando:

- quatro estruturas do catálogo;
- referência operacional por `competency_catalog_items.id`;
- separação entre biblioteca global e própria;
- adoção sem cópia;
- comportamento de `deprecated`;
- uso de JSONB;
- estratégia transacional;
- limitações conhecidas.

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
5. rotas;
6. fluxo de adoção;
7. catálogo unificado;
8. comportamento de depreciação;
9. permissões;
10. auditoria;
11. interface;
12. testes;
13. resultados das verificações;
14. como testar manualmente;
15. limitações;
16. riscos restantes;
17. confirmação de que nenhum módulo futuro foi criado.
