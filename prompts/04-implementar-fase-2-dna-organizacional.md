# Implementação da Fase 2 — DNA Organizacional

Leia obrigatoriamente:

- `CONSTITUICAO_DO_PROJETO.md`
- `AGENTS.md`
- `SECURITY.md`
- `CHECKLIST-REVISAO.md`
- todas as decisões em `docs/03-arquitetura/decisoes/`
- `docs/02-requisitos/specs/SPEC-001-Organization.md`
- `docs/02-requisitos/specs/SPEC-004-Roles-Permissions.md`
- `docs/02-requisitos/specs/SPEC-005-DNA-Organizacional.md`

Implemente somente a Fase 2, seguindo integralmente a SPEC-005.

## Escopo

Implementar:

- criação de rascunho de DNA;
- edição de rascunho;
- descarte lógico de rascunho;
- publicação;
- histórico de versões;
- consulta da versão publicada;
- consulta administrativa auditada;
- permissões por role;
- persistência PostgreSQL;
- auditoria;
- interface simples;
- testes funcionais e de segurança.

Não implementar:

- inteligência artificial;
- DISC;
- cargos;
- vagas;
- candidatos;
- matching cultural;
- onboarding;
- desenvolvimento;
- retenção;
- restauração de versão antiga;
- republicação direta;
- múltiplos rascunhos ativos;
- exclusão física.

## Antes de alterar código

Apresente:

1. entendimento da SPEC-005;
2. modelo de dados proposto;
3. migration necessária;
4. formato dos valores e competências;
5. fluxo para criação de rascunho;
6. fluxo de publicação;
7. fluxo de descarte;
8. permissões por role;
9. estratégia de transação;
10. estratégia contra publicações simultâneas;
11. estratégia de auditoria;
12. rotas da API;
13. telas ou componentes da interface;
14. testes previstos;
15. arquivos que serão criados ou alterados;
16. riscos e limitações.

Não implemente antes de apresentar esse plano.

## Regras obrigatórias

### Persistência

Use PostgreSQL/Supabase como persistência principal.

Não usar armazenamento em memória no runtime principal.

Toda mudança no banco deve possuir migration reproduzível.

### Estrutura do DNA

Cada versão deve ser um snapshot completo.

Campos mínimos:

- `id`;
- `organization_id`;
- `version_number`;
- `status`;
- `mission`;
- `vision`;
- `purpose`;
- valores estruturados;
- competências estruturadas;
- cultura;
- estilo de liderança;
- ambiente de trabalho;
- `created_by_user_id`;
- `updated_by_user_id`;
- `published_by_user_id`;
- `created_at`;
- `updated_at`;
- `published_at`;
- `discarded_at`, quando aplicável.

Status permitidos:

- `draft`;
- `published`;
- `archived`.

### Valores

Cada valor deve possuir:

- nome;
- descrição;
- significado prático, quando informado;
- comportamentos esperados;
- comportamentos incompatíveis.

Limites:

- até 20 valores;
- nome com até 120 caracteres;
- descrição com até 2.000 caracteres;
- até 20 comportamentos esperados;
- até 20 comportamentos incompatíveis.

### Competências

Cada competência deve possuir:

- nome;
- descrição;
- importância.

Importância permitida:

- `low`;
- `medium`;
- `high`;
- `critical`.

Limites:

- até 30 competências;
- nome com até 120 caracteres;
- descrição com até 2.000 caracteres.

### Regras de rascunho

- apenas um rascunho ativo por Organization;
- rascunho ativo significa `status = draft` e `discarded_at` vazio;
- owner e admin podem criar rascunho;
- owner e admin podem editar rascunho;
- owner e admin podem descartar rascunho;
- member não pode acessar rascunho;
- rascunho descartado permanece no histórico administrativo;
- rascunho descartado não pode ser editado nem publicado.

### Criação baseada na versão publicada

Quando já existir uma versão publicada, a criação de novo rascunho deve copiar o conteúdo da versão publicada atual.

O novo rascunho deve possuir novo identificador e permanecer editável.

Não alterar a versão publicada original.

### Publicação

Somente owner pode publicar.

A publicação deve ocorrer em uma única transação:

1. validar User, Membership e Organization;
2. bloquear versões da Organization;
3. confirmar que o rascunho está ativo;
4. validar os campos obrigatórios;
5. validar limites;
6. arquivar a versão publicada anterior, quando existir;
7. definir número sequencial de versão;
8. publicar o rascunho;
9. registrar auditoria;
10. confirmar a transação.

Se qualquer etapa falhar, nada deve permanecer alterado.

Duas publicações simultâneas não podem gerar duas versões publicadas.

### Regras mínimas para publicação

Exigir:

- missão;
- visão;
- propósito;
- pelo menos um valor;
- pelo menos uma competência;
- todos os valores com nome e descrição;
- todas as competências com nome, descrição e importância válida.

Limites:

- missão: até 2.000 caracteres;
- visão: até 2.000 caracteres;
- propósito: até 2.000 caracteres.

### Imutabilidade

Versões `published` e `archived` são imutáveis.

Não criar rotas para editar versões publicadas ou arquivadas.

### Permissões

#### Owner

Pode:

- criar rascunho;
- editar rascunho;
- descartar rascunho;
- publicar;
- consultar versão publicada;
- consultar rascunho;
- consultar histórico.

#### Admin

Pode:

- criar rascunho;
- editar rascunho;
- descartar rascunho;
- consultar versão publicada;
- consultar rascunho;
- consultar histórico.

Não pode publicar.

#### Member

Pode somente:

- consultar a versão publicada atual.

Não pode:

- consultar rascunho;
- consultar histórico;
- criar;
- editar;
- descartar;
- publicar.

#### Platform Admin

Pode apenas consultar para suporte, auditoria ou investigação administrativa.

Essa consulta deve:

- exigir contexto administrativo explícito;
- exigir motivo;
- gerar auditoria;
- não copiar o conteúdo completo do DNA para o evento.

Platform Admin não pode criar, editar, descartar ou publicar DNA.

### Organization arquivada

Quando a Organization estiver `archived`:

- owner, admin e member não operam o DNA;
- member não consulta normalmente;
- Platform Admin consulta apenas em contexto administrativo auditado;
- nenhuma versão pode virar contexto operacional ativo.

### Segurança

Validar no servidor:

- User ativo;
- Membership ativo;
- Organization ativa;
- role;
- `organizationId`;
- `versionId`;
- propriedade do registro.

Não revelar existência de DNA de outra Organization.

Não registrar conteúdo completo em logs ou auditoria.

Não confiar na interface para autorização.

### Banco

Garantir:

- `organization_id` obrigatório;
- `version_number` único por Organization;
- somente uma versão `published` por Organization;
- somente um rascunho ativo por Organization;
- status canônicos;
- chaves estrangeiras;
- índices;
- ausência de exclusão em cascata destrutiva.

## API esperada

A nomenclatura pode seguir o padrão atual do projeto.

Operações mínimas:

- criar rascunho;
- consultar rascunho atual;
- atualizar rascunho;
- descartar rascunho;
- publicar;
- consultar versão publicada;
- listar histórico;
- consultar versão específica autorizada;
- consulta administrativa auditada.

## Interface mínima

Criar interface simples para:

- visualizar DNA publicado;
- visualizar rascunho quando autorizado;
- criar rascunho;
- editar missão, visão e propósito;
- gerenciar valores;
- gerenciar competências;
- editar cultura, liderança e ambiente;
- descartar rascunho;
- publicar quando owner;
- consultar histórico;
- identificar versão e status;
- apresentar erros de permissão claramente.

Não criar design avançado.

## Testes obrigatórios

Implementar testes para:

1. criar primeiro rascunho;
2. impedir segundo rascunho ativo;
3. criar rascunho copiando versão publicada;
4. editar rascunho;
5. descartar rascunho;
6. impedir edição de rascunho descartado;
7. impedir publicação de rascunho descartado;
8. owner publicar;
9. admin não publicar;
10. member não publicar;
11. member não visualizar rascunho;
12. member não visualizar histórico;
13. member visualizar versão publicada;
14. versão publicada imutável;
15. versão arquivada imutável;
16. apenas uma versão publicada por Organization;
17. publicação atômica;
18. rollback quando auditoria falha;
19. duas publicações simultâneas não geram duas versões publicadas;
20. `organizationId` manipulado;
21. `versionId` manipulado;
22. acesso cruzado entre Organizations;
23. Organization arquivada bloqueada;
24. Platform Admin consultar com motivo;
25. Platform Admin sem motivo ser bloqueado;
26. consulta administrativa gerar auditoria;
27. auditoria não armazenar conteúdo completo;
28. campos obrigatórios;
29. limites de tamanho;
30. pelo menos um valor;
31. pelo menos uma competência;
32. importância inválida recusada;
33. ausência de exclusão física;
34. persistência após recriar a aplicação.

Os testes de segurança e isolamento devem atingir a API integrada com PostgreSQL.

## Decisão arquitetural

Crie uma nova ADR documentando:

- modelagem escolhida;
- uso de snapshot completo;
- armazenamento estruturado de valores e competências;
- restrições de versão;
- estratégia transacional de publicação;
- estratégia de auditoria;
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
5. rotas da API;
6. fluxo da interface;
7. transação de publicação;
8. proteção contra concorrência;
9. permissões implementadas;
10. estratégia de auditoria;
11. testes criados;
12. resultado das verificações;
13. como testar manualmente;
14. limitações;
15. riscos restantes;
16. confirmação de que nenhuma funcionalidade futura foi criada.
