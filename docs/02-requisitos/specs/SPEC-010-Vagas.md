# SPEC-010 - Vagas

**Status:** Aprovada  
**Versão:** 1.0  
**Fase:** 7  
**Responsável de negócio:** Thiago Sousa  
**Última atualização:** 2026-08-05

## 1. Objetivo

Especificar o módulo de Vagas do Talent OS.

A Vaga representa um processo de contratação para uma ou mais posições dentro de
uma Organization. Ela referencia uma versão publicada específica de Cargo, pode
estar associada a uma Organizational Unit ativa, possui conteúdo próprio
versionado e pode ser preparada para divulgação pública separada da entidade
principal.

Esta SPEC define:

- criação de Vaga;
- versionamento;
- vínculo obrigatório com versão publicada de Cargo;
- vínculo opcional com Organizational Unit;
- competências contextualizadas;
- perguntas de triagem;
- publicação interna;
- divulgação pública;
- abertura, pausa, encerramento e cancelamento;
- permissões;
- auditoria;
- segurança multiempresa;
- modelo conceitual de banco;
- critérios de aceite e testes obrigatórios.

## 2. Fora do Escopo

- Implementar código, banco, migrations, rotas, testes ou dependências.
- Implementar candidatos.
- Implementar candidatura pública.
- Implementar pipeline de seleção.
- Implementar entrevistas.
- Implementar avaliações.
- Implementar matching.
- Implementar IA.
- Implementar propostas.
- Implementar aprovação em múltiplos níveis.
- Implementar colaboradores ou ocupantes da Vaga.
- Excluir fisicamente Vagas, versões, competências ou perguntas vinculadas.

## 3. Usuários Envolvidos

- **owner:** administra Vagas da Organization ativa, altera código, publica,
  abre, pausa, encerra, cancela, configura divulgação pública e consulta
  histórico.
- **admin:** cria e edita Vagas e drafts, pausa, encerra, configura divulgação
  pública quando permitido e consulta histórico, mas não altera código, não
  publica e não cancela.
- **member:** visualiza apenas Vagas abertas autorizadas, sem faixa salarial,
  sem instruções internas, sem drafts e sem histórico administrativo.
- **Platform Admin:** consulta Vagas apenas em contexto administrativo auditado,
  com motivo, sem operar funcionalmente a Vaga.

`Platform Admin` não é Role de Membership e não recebe permissões funcionais de
`owner`, `admin` ou `member` dentro da Organization.

## 4. Conceitos

### 4.1 Job Opening

Entidade estável da Vaga.

Representa o processo de contratação ao longo do tempo e pertence
obrigatoriamente a uma Organization.

Campos conceituais:

- `id`;
- `organization_id`;
- `code`;
- `normalized_code`;
- `title`;
- `status`;
- `organizational_unit_id`, opcional;
- autoria;
- timestamps.

`title` é o nome interno e operacional da Vaga. Ele é usado em listagens
administrativas, pode ser alterado por owner/admin, não é necessariamente
exibido ao público, não é identificador técnico e deve possuir no máximo 150
caracteres.

### 4.2 Job Opening Version

Snapshot completo do conteúdo da Vaga.

Cada versão pertence à mesma Organization da Vaga e preserva o conteúdo publicado
ou em rascunho. Publicar nova versão não altera versões anteriores.

Campos conceituais:

- `id`;
- `job_opening_id`;
- `organization_id`;
- `version_number`;
- `status`;
- `job_profile_version_id`;
- `public_title`;
- `positions_count`;
- conteúdo completo;
- autoria;
- dados de publicação;
- dados de descarte;
- timestamps.

`job_profile_version_id` existe na versão da Vaga, não em `job_openings`. Cada
versão preserva a versão exata do Cargo usada naquele momento.

`public_title` é o título público da versão, faz parte do snapshot versionado,
pode mudar entre versões, é usado na divulgação pública, deve possuir no máximo
150 caracteres e é obrigatório para publicação.

`positions_count` existe somente em `job_opening_versions`. Cada versão preserva
a quantidade de posições válida naquele momento. O valor mínimo é 1 e o máximo
inicial é 1.000.

### 4.3 Job Opening Competency

Competência contextualizada para uma versão da Vaga.

Deve referenciar somente:

- `competency_catalog_items.id`.

Campos conceituais:

- `competency_catalog_item_id`;
- `expected_level`;
- `required`;
- `weight`;
- `display_order`;
- observação opcional.

### 4.4 Job Opening Question

Pergunta contextualizada para triagem em uma versão da Vaga.

Deve referenciar somente:

- `question_catalog_items.id`.

Campos conceituais:

- `question_catalog_item_id`;
- `required`;
- `display_order`;
- `weight`, opcional;
- configuração contextual opcional.

Não armazenar resposta nesta fase.

### 4.5 Publicação Pública

Divulgação pública da Vaga, separada da publicação interna da versão.

Prever:

- `is_public`;
- slug público único;
- data de publicação pública;
- data de retirada pública;
- prazo de candidatura.

O slug público não deve expor IDs internos.

`application_deadline` pertence à configuração de divulgação pública da Vaga, não
ao snapshot de `job_opening_versions`.

## 5. Status Canônicos

### 5.1 Job Opening

- `draft`
- `open`
- `paused`
- `closed`
- `cancelled`

### 5.2 Job Opening Version

- `draft`
- `published`
- `archived`

Não existe exclusão física. Estados finais e versões arquivadas preservam
histórico.

## 6. Fluxos Principais

### 6.1 Criar Vaga

Na criação, `job_openings` recebe apenas os dados estáveis da Vaga. O primeiro
draft em `job_opening_versions` recebe `job_profile_version_id`,
`public_title`, `positions_count` e o conteúdo versionado. `job_openings` não
deve possuir `job_profile_version_id` nem `positions_count`.

1. Owner ou admin acessa uma Organization ativa.
2. Seleciona uma versão `published` de Job Profile da mesma Organization.
3. Opcionalmente seleciona uma Organizational Unit ativa da mesma Organization.
4. Informa código, título e quantidade de posições.
5. Sistema valida User ativo, Membership ativo, Organization ativa e role.
6. Sistema valida Cargo publicado, Job Profile ativo, unidade, código e
   isolamento.
7. Sistema cria `job_opening` com status `draft`.
8. Sistema cria primeira `job_opening_version` em `draft`.
9. Sistema registra auditoria.

### 6.2 Editar Draft

Enquanto o draft não foi publicado, owner/admin podem trocar
`job_profile_version_id` por outra versão `published` de Cargo da mesma
Organization. Cargo `draft`, `archived`, inativo ou de outra Organization deve
ser recusado na edição do draft e novamente no momento da publicação.

1. Owner ou admin seleciona uma Vaga permitida.
2. Sistema valida Vaga, Organization, versão `draft` ativa e permissões.
3. Usuário edita conteúdo, competências, perguntas e dados de divulgação.
4. Sistema valida formatos, pesos, referências e dados sensíveis.
5. Sistema salva o draft e registra auditoria.

### 6.3 Publicar Versão

Somente owner pode publicar.

Para publicar, a versão deve possuir `public_title` obrigatório com até 150
caracteres e `positions_count` entre 1 e 1.000.

A publicação deve ocorrer em transação:

1. validar User, Membership, Organization e role;
2. bloquear a Vaga e suas versões;
3. validar draft ativo;
4. validar Cargo publicado;
5. validar Organizational Unit;
6. validar competências;
7. validar pesos;
8. validar perguntas;
9. arquivar versão publicada anterior;
10. atribuir número sequencial;
11. publicar nova versão;
12. registrar auditoria;
13. confirmar transação.

Falha em qualquer etapa deve causar rollback completo. Duas publicações
simultâneas não podem gerar duas versões publicadas.

### 6.4 Abrir, Pausar, Encerrar e Cancelar

Abrir, pausar e encerrar exigem versão publicada. Cancelar draft pode ocorrer sem
versão publicada, conforme as regras de estado operacional.

- owner pode abrir, pausar, encerrar e cancelar;
- admin pode pausar e encerrar;
- member apenas visualiza Vagas abertas permitidas.

### 6.5 Divulgação Pública

Admin pode configurar divulgação pública somente quando já existe versão
publicada válida, a Vaga está `open` e o owner já realizou a publicação interna
da versão. Admin não pode publicar versão nem tornar pública uma Vaga sem versão
publicada.

1. Owner ou admin autorizado configura divulgação pública.
2. Sistema valida que existe versão publicada válida e que a Vaga está `open`.
3. Sistema valida que a publicação interna foi realizada por owner.
4. Sistema valida slug público único, reservado e sem IDs internos.
5. Sistema valida `application_deadline` futura quando informada.
6. Sistema aplica configuração de exibição de faixa salarial.
7. Sistema registra auditoria.

Pausar, encerrar ou cancelar a Vaga deve retirar a Vaga da página pública.

## 7. Regras de Negócio

- RN-001: Job Opening pertence obrigatoriamente a uma Organization.
- RN-002: Job Opening nunca pode mudar de Organization.
- RN-003: Job Opening representa processo de contratação, não candidato, pessoa
  contratada ou pipeline.
- RN-004: Job Opening pode representar uma ou mais posições.
- RN-005: Código é obrigatório, normalizado e único por Organization.
- RN-006: Código não diferencia maiúsculas e minúsculas para unicidade.
- RN-007: Código não muda automaticamente quando o título muda.
- RN-008: Após criação, somente owner pode alterar código.
- RN-009: Admin não altera código.
- RN-010: Mudança de código gera auditoria.
- RN-011: A Vaga deve referenciar uma versão `published` específica de Job
  Profile.
- RN-012: Não usar `job_profiles.id` isoladamente como referência do conteúdo do
  Cargo.
- RN-013: A versão de Cargo deve pertencer à mesma Organization.
- RN-014: O Job Profile deve estar ativo no momento da criação da Vaga.
- RN-015: Versões `draft` ou `archived` de Cargo são recusadas.
- RN-016: Alterações futuras no Cargo não modificam Vagas existentes.
- RN-017: O vínculo com a versão do Cargo fica em `job_opening_versions` e é
  imutável após a publicação daquela versão.
- RN-018: Para mudar o Cargo de uma Vaga publicada, deve ser criado novo draft
  da Vaga, sem criar nova entidade Job Opening.
- RN-019: Organizational Unit é opcional.
- RN-020: Quando informada, a Organizational Unit deve pertencer à mesma
  Organization e estar ativa.
- RN-021: Unidade inativa não pode ser usada em nova Vaga.
- RN-022: Após a primeira publicação, mudança de Organizational Unit exige nova
  versão da Vaga.
- RN-023: Criação da Vaga gera versão `draft`.
- RN-024: Cada Vaga pode possuir no máximo um draft ativo.
- RN-025: Cada Vaga pode possuir no máximo uma versão `published`.
- RN-026: Versões `published` e `archived` são imutáveis.
- RN-027: Novo draft copia a versão publicada quando houver.
- RN-028: Draft descartado usa `discarded_at` e permanece armazenado.
- RN-029: Não existe exclusão física.
- RN-030: Vaga encerrada ou cancelada não recebe novo draft nesta fase.
- RN-031: Reabertura de Vaga encerrada fica fora desta fase.
- RN-032: Competências da Vaga usam somente `competency_catalog_items.id`.
- RN-033: Competência deve pertencer à mesma Organization e estar
  operacionalmente ativa.
- RN-034: Não pode haver competência duplicada na mesma versão.
- RN-035: `expected_level` deve estar entre 1 e 5.
- RN-036: Peso de competência na Vaga deve estar entre 0 e 100.
- RN-037: Quando houver competências, a soma dos pesos deve ser 100 para
  publicação.
- RN-038: Competências copiadas do Cargo podem ser ajustadas sem alterar o Cargo.
- RN-039: Perguntas da Vaga usam somente `question_catalog_items.id`.
- RN-040: Pergunta deve pertencer ao catálogo da mesma Organization e estar
  ativa e operacional.
- RN-041: Não pode haver pergunta duplicada na mesma versão.
- RN-042: A Vaga não altera o conteúdo original da pergunta.
- RN-043: Resposta correta continua fora desta fase.
- RN-044: Peso e obrigatoriedade de pergunta pertencem à Vaga.
- RN-045: Perguntas globais adotadas continuam sendo referenciadas pelo catalog
  item.
- RN-046: Member não visualiza faixa salarial.
- RN-047: Member não visualiza instruções internas.
- RN-048: Publicação pública da faixa salarial é configurável.
- RN-049: Apenas Vaga `open` pode ficar pública.
- RN-050: Vaga pausada, encerrada ou cancelada não aparece na página pública.
- RN-051: Slug público não deve expor IDs internos.
- RN-052: Candidatura não faz parte desta fase.
- RN-053: Platform Admin consulta apenas administrativamente, com motivo e
  auditoria.
- RN-054: Organization arquivada bloqueia operações normais e remove Vagas da
  exposição pública.
- RN-055: `positions_count` existe somente em `job_opening_versions`, com mínimo
  1 e máximo inicial 1.000.
- RN-056: `job_openings.title` é título interno, administrativo, alterável por
  owner/admin, não técnico, não público obrigatório e limitado a 150 caracteres.
- RN-057: `job_opening_versions.public_title` é título público versionado,
  obrigatório para publicação e limitado a 150 caracteres.
- RN-058: Competências podem ser lista vazia. Quando vazia, não há regra de soma
  de pesos.
- RN-059: Cada versão pode ter no máximo 50 competências.
- RN-060: Quando houver uma ou mais competências, a soma dos pesos deve ser
  exatamente 100. Peso 0 é permitido e mantém vínculo explícito.
- RN-061: Competência usada em versão publicada permanece preservada
  historicamente mesmo se depois for inativada.
- RN-062: Para criar ou publicar novo draft, toda competência vinculada deve
  estar operacionalmente ativa e pertencer à mesma Organization.
- RN-063: Perguntas podem ser lista vazia e cada versão pode ter no máximo 100
  perguntas.
- RN-064: Peso de pergunta é opcional, deve estar entre 0 e 100 quando informado,
  é valor relativo e não precisa somar 100.
- RN-065: Pergunta usada em versão publicada permanece preservada historicamente
  mesmo se depois for inativada.
- RN-066: Para criar ou publicar novo draft, toda pergunta vinculada deve estar
  operacionalmente ativa e pertencer à mesma Organization.
- RN-067: `application_deadline` é opcional, deve possuir data e hora e deve ser
  futura no momento da publicação pública.
- RN-068: Encerramento ou cancelamento operacional prevalece sobre o prazo de
  candidatura, e `application_deadline` pode continuar armazenado após a Vaga
  ser encerrada ou cancelada.
- RN-069: Quando `application_deadline` expira, a Vaga deixa automaticamente de
  aceitar candidatura pública e sai da listagem pública de oportunidades abertas,
  mas nesta fase o status operacional não muda automaticamente de `open` para
  `closed`.
- RN-070: Página pública por slug expirado deve sinalizar que o prazo encerrou.
- RN-071: `draft -> cancelled` pode ocorrer sem versão publicada, somente por
  owner; o draft ativo permanece preservado, mas não pode mais ser editado ou
  publicado.
- RN-072: `paused -> cancelled` pressupõe versão publicada, somente owner pode
  executar, remove imediatamente a divulgação pública e é estado final.
- RN-073: `closed` e `cancelled` são estados finais, não há reabertura nesta fase
  e Vagas finalizadas não recebem novo draft.
- RN-074: Slug público é opcional até a primeira divulgação pública, deve ser
  único globalmente ou em namespace sem colisão pública, aceitar apenas
  caracteres seguros para URL e nunca conter IDs internos.
- RN-075: Após a primeira publicação pública, o slug não pode ser alterado nesta
  fase. Slugs antigos não são reutilizados, não há redirecionamento nesta fase e
  o slug permanece reservado após retirada, encerramento ou cancelamento.

## 8. Dados Necessários

### 8.1 Job Opening

| Campo                    | Obrigatório | Observação                                 |
| ------------------------ | ----------: | ------------------------------------------ |
| `id`                     |         Sim | Identificador interno gerado pelo sistema. |
| `organization_id`        |         Sim | Organization proprietária da Vaga.         |
| `code`                   |         Sim | Código exibido.                            |
| `normalized_code`        |         Sim | Representação normalizada para unicidade.  |
| `title`                  |         Sim | Título interno da Vaga.                    |
| `status`                 |         Sim | Status canônico de Job Opening.            |
| `organizational_unit_id` |         Não | Unidade ativa da mesma Organization.       |
| `created_by_user_id`     |         Sim | Usuário responsável pela criação.          |
| `updated_by_user_id`     |         Não | Usuário responsável pela última alteração. |
| `created_at`             |         Sim | Data/hora de criação.                      |
| `updated_at`             |         Sim | Data/hora da última alteração.             |

### 8.2 Código

O código deve:

- ser obrigatório;
- possuir entre 2 e 50 caracteres;
- aceitar letras, números, hífen e sublinhado;
- preservar o formato exibido;
- usar representação normalizada para unicidade;
- ignorar diferenças entre maiúsculas e minúsculas;
- ser único por Organization;
- não ser referência de domínio para módulos futuros.

### 8.3 Job Opening Version

Campos mínimos:

- `id`;
- `job_opening_id`;
- `organization_id`;
- `version_number`;
- `status`;
- `job_profile_version_id`;
- `public_title`;
- `description`;
- `responsibilities`;
- `requirements`;
- `benefits`;
- `location`;
- `work_model`;
- `work_schedule`;
- `salary_range`;
- `positions_count`;
- `expected_start_date`;
- `internal_instructions`;
- `public_instructions`;
- dados de autoria;
- `published_at`;
- `discarded_at`;
- timestamps.

### 8.4 Conteúdo da Vaga

Cada versão deve possuir:

- título público;
- descrição;
- responsabilidades;
- requisitos;
- benefícios;
- localização;
- modelo de trabalho;
- jornada;
- faixa salarial opcional;
- quantidade de posições;
- data prevista de início;
- competências;
- perguntas de triagem;
- instruções internas opcionais;
- instruções públicas opcionais.

Responsabilidades e requisitos podem iniciar copiados da versão publicada do
Cargo. Depois podem ser ajustados no draft da Vaga sem alterar o Cargo original.

## 9. Conteúdo Estruturado

### 9.1 Responsabilidades

Lista estruturada. Pode iniciar copiada do Cargo.

Cada item deve possuir:

- texto;
- ordem.

### 9.2 Requisitos

Lista estruturada. Pode iniciar copiada do Cargo e pode ser ajustada no draft.

Quando existirem, todos os requisitos devem respeitar estrutura e validações
definidas para Vaga. A alteração da Vaga não altera o Cargo original.

### 9.3 Benefícios

Lista estruturada de textos. Não deve conter dados pessoais reais.

### 9.4 Localização

Estrutura conceitual com:

- país;
- região/estado;
- cidade;
- endereço público opcional;
- observação pública opcional.

### 9.5 Modelo de Trabalho

Valores canônicos:

- `onsite`
- `hybrid`
- `remote`
- `flexible`

### 9.6 Jornada

Estrutura simples com:

- horas semanais;
- descrição;
- turno opcional.

### 9.7 Faixa Salarial

Opcional.

Quando informada:

- mínimo;
- máximo;
- moeda;
- periodicidade.

Regras:

- mínimo não pode ser maior que máximo;
- valores não podem ser negativos;
- moeda deve usar código ISO;
- periodicidade deve ser `monthly`, `hourly` ou `annual`;
- member não visualiza faixa salarial;
- página pública só mostra faixa salarial quando a configuração permitir.

## 10. Competências da Vaga

Competências podem iniciar copiadas do Cargo.

Competências podem ser uma lista vazia. Cada versão pode possuir de 0 a 50
competências.

Cada vínculo contextual deve possuir:

- `competency_catalog_item_id`;
- nível esperado;
- obrigatória ou desejável;
- peso;
- ordem;
- observação opcional.

Regras:

- usar somente `competency_catalog_items.id`;
- validar mesma Organization;
- validar disponibilidade operacional;
- não duplicar competência;
- `expected_level` entre 1 e 5;
- peso inteiro ou decimal entre 0 e 100;
- peso 0 é permitido, mas mantém o vínculo explicitamente associado à versão;
- soma total dos pesos deve ser 100 para publicação, quando houver
  competências;
- quando a lista estiver vazia, não há regra de soma de pesos;
- competência usada em versão publicada permanece preservada historicamente mesmo
  que depois seja inativada;
- para criar ou publicar novo draft, a competência deve estar operacionalmente
  ativa e pertencer à mesma Organization;
- ajustes na Vaga não alteram o Cargo nem a competência original.

## 11. Perguntas de Triagem

A Vaga pode utilizar perguntas do Banco de Perguntas.

Perguntas podem ser uma lista vazia. Cada versão pode possuir de 0 a 100
perguntas.

Cada vínculo deve possuir:

- `question_catalog_item_id`;
- obrigatória ou opcional;
- ordem;
- peso opcional;
- configuração contextual opcional.

Regras:

- usar somente `question_catalog_items.id`;
- validar mesma Organization;
- validar status ativo e disponibilidade operacional;
- não duplicar pergunta;
- peso é opcional;
- quando informado, peso deve estar entre 0 e 100;
- pesos de perguntas são valores relativos e não precisam somar 100;
- a Vaga não altera o conteúdo original da pergunta;
- resposta correta continua fora desta fase;
- resposta de candidato não é armazenada nesta fase;
- peso de pergunta pertence à Vaga;
- pergunta usada em versão publicada permanece preservada historicamente mesmo
  que depois seja inativada;
- para criar ou publicar novo draft, a pergunta deve estar operacionalmente
  ativa e pertencer à mesma Organization;
- perguntas globais adotadas continuam sendo referenciadas pelo catalog item.

## 12. Versionamento

Regras:

- criação da Vaga gera versão `draft`;
- apenas um draft ativo por Vaga;
- apenas uma versão publicada por Vaga;
- versão publicada é imutável;
- versão arquivada é imutável;
- novo draft copia a versão publicada;
- draft descartado usa `discarded_at`;
- não existe exclusão física.
- o primeiro draft recebe uma versão publicada de Cargo;
- novo draft copia o `job_profile_version_id` da versão publicada anterior;
- enquanto o draft não foi publicado, owner/admin podem trocar o Cargo por outra
  versão publicada da mesma Organization;
- após publicação, o vínculo da versão com o Cargo torna-se imutável;
- Cargo draft, archived, inativo ou de outra Organization é recusado na
  publicação.

### 12.1 Publicação

Somente owner pode publicar.

Publicação deve ser transacional e segura contra concorrência:

- bloquear Vaga e versões;
- validar referências;
- validar pesos;
- arquivar versão publicada anterior;
- atribuir `version_number` sequencial;
- publicar draft;
- auditar;
- confirmar ou reverter tudo.

### 12.2 Imutabilidade

Versões `published` e `archived` não podem ter conteúdo, referências,
competências, perguntas, salário ou instruções alterados. A única transição
permitida para uma versão `published` é ser arquivada automaticamente durante a
publicação de uma nova versão.

## 13. Estado Operacional da Vaga

Transições permitidas:

- `draft -> open`
- `open -> paused`
- `paused -> open`
- `open -> closed`
- `paused -> closed`
- `draft -> cancelled`
- `open -> cancelled`
- `paused -> cancelled`

Regras:

- `closed` é final;
- `cancelled` é final;
- Vaga sem versão publicada não pode ficar `open`;
- `draft -> cancelled` pode ocorrer sem versão publicada, somente por owner; o
  draft ativo permanece preservado, mas não pode mais ser editado ou publicado;
- `paused -> cancelled` pressupõe versão publicada, somente por owner, remove
  imediatamente a divulgação pública e é estado final;
- Vaga encerrada ou cancelada não recebe novo draft nesta fase;
- reabertura de Vaga encerrada fica fora desta fase.

## 14. Divulgação Pública

A divulgação pública deve ser separada da publicação interna da versão.

Prever:

- `is_public`;
- slug público único;
- data de publicação pública;
- data de retirada pública;
- prazo de candidatura;
- configuração de exibição de salário.

Regras:

- apenas Vaga `open` pode ficar pública;
- admin só pode configurar divulgação pública quando já houver versão publicada
  válida, Vaga `open` e publicação interna feita por owner;
- pausar remove temporariamente da página pública;
- encerrar ou cancelar remove da página pública;
- Organization arquivada remove a Vaga da página pública;
- `application_deadline` é opcional, deve possuir data e hora e deve ser futura
  no momento da publicação pública;
- `application_deadline` pode continuar armazenado após encerramento ou
  cancelamento;
- encerramento ou cancelamento operacional prevalece sobre o prazo;
- quando o prazo expira, a Vaga deixa automaticamente de aceitar candidatura
  pública, sai da listagem pública de oportunidades abertas e a página pública
  deve sinalizar que o prazo encerrou;
- nesta fase, a expiração do prazo não altera automaticamente o status
  operacional de `open` para `closed`;
- slug é opcional até a primeira divulgação pública;
- slug deve ser único globalmente ou em namespace que não permita colisão
  pública;
- slug não deve expor IDs internos;
- slug deve aceitar apenas caracteres seguros para URL;
- depois da primeira publicação pública, o slug não pode ser alterado nesta fase;
- slugs antigos não são reutilizados;
- não haverá redirecionamento nesta fase;
- ao retirar a Vaga da divulgação, o slug permanece reservado;
- Vaga encerrada ou cancelada preserva o slug;
- tentativa de reutilização deve ser recusada;
- página pública não deve mostrar faixa salarial quando a configuração proibir;
- candidatura não faz parte desta fase.

## 15. Permissões

Todas as operações normais exigem:

- User ativo;
- Membership ativo;
- Organization ativa;
- role autorizada.

Quando qualquer condição não for atendida, o acesso deve ser negado de forma
segura, sem revelar dados de outra Organization, e a tentativa deve gerar
auditoria quando aplicável.

| Ação                                     | Platform Admin | owner | admin | member |
| ---------------------------------------- | :------------: | :---: | :---: | :----: |
| Criar Vaga                               |      Não       |  Sim  |  Sim  |  Não   |
| Alterar código                           |      Não       |  Sim  |  Não  |  Não   |
| Alterar título interno                   |      Não       |  Sim  |  Sim  |  Não   |
| Alterar dados estáveis antes de publicar |      Não       |  Sim  |  Sim  |  Não   |
| Criar draft                              |      Não       |  Sim  |  Sim  |  Não   |
| Editar draft                             |      Não       |  Sim  |  Sim  |  Não   |
| Descartar draft                          |      Não       |  Sim  |  Sim  |  Não   |
| Publicar versão                          |      Não       |  Sim  |  Não  |  Não   |
| Abrir Vaga                               |      Não       |  Sim  |  Não  |  Não   |
| Pausar Vaga                              |      Não       |  Sim  |  Sim  |  Não   |
| Encerrar Vaga                            |      Não       |  Sim  |  Sim  |  Não   |
| Cancelar Vaga                            |      Não       |  Sim  |  Não  |  Não   |
| Configurar divulgação pública aberta     |      Não       |  Sim  |  Sim  |  Não   |
| Visualizar Vagas abertas permitidas      |      Não       |  Sim  |  Sim  |  Sim   |
| Visualizar faixa salarial                |      Não       |  Sim  |  Sim  |  Não   |
| Visualizar instruções internas           |      Não       |  Sim  |  Sim  |  Não   |
| Consultar histórico                      |      Não       |  Sim  |  Sim  |  Não   |
| Consulta administrativa auditada         |      Sim       |  Não  |  Não  |  Não   |

### 15.1 Owner

Pode criar, alterar código, editar draft, descartar draft, publicar, abrir,
pausar, encerrar, cancelar, configurar divulgação pública, visualizar salário e
consultar histórico.

### 15.2 Admin

Pode criar, editar draft, descartar draft, pausar, encerrar, configurar
divulgação pública quando a Vaga estiver aberta, visualizar salário e consultar
histórico.

Não pode alterar código, publicar ou cancelar.

### 15.3 Member

Pode visualizar Vagas abertas autorizadas.

Não visualiza:

- salário;
- instruções internas;
- drafts;
- histórico administrativo.

### 15.4 Platform Admin

Pode somente consultar administrativamente com motivo e auditoria.

Não pode operar funcionalmente a Vaga.

## 16. Organization Arquivada

Quando a Organization estiver `archived`:

- nenhuma operação normal é permitida;
- nenhuma Vaga pode ficar pública;
- owner, admin e member não consultam operacionalmente;
- Platform Admin consulta apenas administrativamente;
- dados permanecem preservados.

## 17. API Conceitual

| Operação                          | Finalidade                                                   |
| --------------------------------- | ------------------------------------------------------------ |
| Criar Vaga                        | Criar Job Opening e primeiro draft.                          |
| Listar Vagas                      | Listar Vagas permitidas.                                     |
| Listar abertas                    | Listar Vagas abertas permitidas.                             |
| Listar inativas/finalizadas       | Listar pausadas, encerradas ou canceladas para owner/admin.  |
| Consultar Vaga                    | Obter Vaga permitida.                                        |
| Alterar dados estáveis            | Alterar código/título/unidade quando permitido.              |
| Criar draft                       | Criar novo draft baseado na versão publicada.                |
| Editar draft                      | Alterar conteúdo, competências e perguntas.                  |
| Descartar draft                   | Marcar draft como descartado.                                |
| Publicar versão                   | Publicar draft em transação.                                 |
| Consultar versão publicada        | Obter snapshot publicado atual.                              |
| Listar histórico                  | Listar versões e eventos permitidos.                         |
| Abrir                             | Alterar Vaga para `open` quando houver versão publicada.     |
| Pausar                            | Alterar Vaga `open` para `paused`.                           |
| Encerrar                          | Alterar Vaga `open` ou `paused` para `closed`.               |
| Cancelar                          | Alterar Vaga permitida para `cancelled`.                     |
| Configurar divulgação pública     | Alterar slug, visibilidade e exibição pública.               |
| Consultar página pública por slug | Consultar conteúdo público permitido sem expor IDs internos. |
| Leitura administrativa auditada   | Consulta excepcional por Platform Admin com motivo.          |

Todas as operações devem validar no servidor:

- `organizationId`;
- `jobOpeningId`;
- `jobOpeningVersionId`;
- `jobProfileVersionId`;
- `organizationalUnitId`;
- `competencyCatalogItemId`;
- `questionCatalogItemId`;
- slug público.

## 18. Interface

Interface mínima prevista:

- lista de Vagas;
- criação de Vaga;
- seleção de Cargo publicado;
- seleção opcional de Organizational Unit;
- edição de conteúdo;
- gerenciamento de competências e pesos;
- gerenciamento de perguntas;
- publicação;
- abertura;
- pausa;
- encerramento;
- cancelamento;
- configuração de divulgação pública;
- histórico;
- mensagens claras de permissão.

Não implementar candidatura.

A interface pode ocultar ou desabilitar ações não permitidas, mas o servidor
continua sendo a autoridade final.

## 19. Banco de Dados Conceitual

Quando implementada, a funcionalidade deve prever minimamente:

- `job_openings`;
- `job_opening_versions`;
- `job_opening_version_competencies`;
- `job_opening_version_questions`.

Pode usar JSONB para:

- responsabilidades;
- requisitos;
- benefícios;
- localização;
- jornada;
- faixa salarial;
- instruções.

### 19.1 `job_openings`

Campos mínimos:

- `id`;
- `organization_id`;
- `code`;
- `normalized_code`;
- `title`;
- `status`;
- `organizational_unit_id`;
- `is_public`;
- `public_slug`;
- `public_published_at`;
- `public_unpublished_at`;
- `application_deadline`;
- `created_by_user_id`;
- `updated_by_user_id`;
- `created_at`;
- `updated_at`.

Restrições esperadas:

- `organization_id` obrigatório;
- código único por Organization;
- slug público único;
- slug público reservado após primeira divulgação, retirada, encerramento ou
  cancelamento;
- slug público imutável após primeira publicação pública;
- status limitado aos valores canônicos;
- Organizational Unit da mesma Organization quando houver;
- bloqueio de mudança de `organization_id`;
- ausência de cascade destrutivo;
- índices para Organization, código normalizado, status, slug e referências.

### 19.2 `job_opening_versions`

Campos mínimos:

- `id`;
- `job_opening_id`;
- `organization_id`;
- `version_number`;
- `status`;
- `job_profile_version_id`;
- `public_title`;
- `positions_count`;
- conteúdo completo;
- autoria;
- `published_at`;
- `discarded_at`;
- timestamps.

Restrições esperadas:

- `organization_id` consistente com Job Opening;
- um draft ativo por Vaga;
- uma versão `published` por Vaga;
- `version_number` único por Vaga quando preenchido;
- `version_number` obrigatório para `published` e `archived`;
- Job Profile Version publicada, ativa e da mesma Organization no momento da
  publicação;
- `public_title` obrigatório para publicação, com máximo de 150 caracteres;
- `positions_count` obrigatório entre 1 e 1.000;
- versões `published` e `archived` imutáveis;
- ausência de cascade destrutivo;
- índices para Organization, Vaga, status, versão e descarte.

### 19.3 `job_opening_version_competencies`

Campos mínimos:

- `id`;
- `organization_id`;
- `job_opening_version_id`;
- `competency_catalog_item_id`;
- `expected_level`;
- `required`;
- `weight`;
- `display_order`;
- `note`;
- timestamps.

Restrições esperadas:

- competência da mesma Organization;
- vínculo único por versão e competência;
- `expected_level` entre 1 e 5;
- peso entre 0 e 100;
- máximo de 50 competências por versão;
- soma dos pesos exatamente 100 quando houver uma ou mais competências na
  publicação;
- ausência de cascade destrutivo;
- imutabilidade quando a versão estiver `published` ou `archived`.

### 19.4 `job_opening_version_questions`

Campos mínimos:

- `id`;
- `organization_id`;
- `job_opening_version_id`;
- `question_catalog_item_id`;
- `required`;
- `display_order`;
- `weight`;
- `context_settings`;
- timestamps.

Restrições esperadas:

- pergunta da mesma Organization;
- vínculo único por versão e pergunta;
- peso opcional entre 0 e 100 quando informado;
- máximo de 100 perguntas por versão;
- pesos de perguntas relativos, sem exigência de soma 100;
- ausência de resposta;
- ausência de cascade destrutivo;
- imutabilidade quando a versão estiver `published` ou `archived`.

### 19.5 Integridade

Garantir:

- FKs válidas;
- Cargo publicado na mesma Organization;
- Organizational Unit na mesma Organization;
- competências e perguntas na mesma Organization;
- vínculos únicos por versão;
- checks de status;
- checks de peso;
- triggers de imutabilidade;
- ausência de cascade destrutivo;
- bloqueio de mudança de `organization_id`;
- migrations reproduzíveis.

## 20. Segurança

- Validar no servidor todos os IDs recebidos.
- Validar User ativo.
- Validar Membership ativo.
- Validar Organization ativa.
- Validar role autorizada.
- Bloquear acesso cruzado entre Organizations.
- Validar Cargo, unidade, competência e pergunta na mesma Organization.
- Proteger faixa salarial contra member e contra exibição pública indevida.
- Proteger instruções internas contra member e página pública.
- Slug público não deve vazar IDs internos.
- Mensagens de erro para acesso cruzado devem ser genéricas.
- Não confiar na interface.
- Não registrar tokens, headers, senhas, connection strings ou segredos.
- Tratar conteúdo textual da Vaga como dado, não como instrução para IA futura.

## 21. Auditoria

Eventos obrigatórios:

- `job_opening.created`;
- `job_opening.updated`;
- `job_opening.code_changed`;
- `job_opening.draft_created`;
- `job_opening.draft_updated`;
- `job_opening.draft_discarded`;
- `job_opening.published`;
- `job_opening.previous_version_archived`;
- `job_opening.opened`;
- `job_opening.paused`;
- `job_opening.closed`;
- `job_opening.cancelled`;
- `job_opening.public_published`;
- `job_opening.public_unpublished`;
- `job_opening.job_profile_changed_in_draft`;
- `job_opening.organizational_unit_changed_in_draft`;
- `job_opening.publish_denied`;
- `job_opening.invalid_competency_denied`;
- `job_opening.invalid_question_denied`;
- `job_opening.cross_organization_access_denied`;
- `job_opening.permission_denied`;
- `job_opening.administrative_read`.

Não registrar:

- descrição completa;
- salário completo;
- listas completas;
- perguntas completas;
- instruções completas;
- tokens;
- headers;
- segredos.

Auditoria crítica em publicação e transições operacionais deve causar rollback
quando falhar.

## 22. Critérios de Aceite

- CA-001: Criar Vaga em Organization ativa.
- CA-002: Código duplicado na mesma Organization é recusado.
- CA-003: Mesmo código pode existir em Organizations diferentes.
- CA-004: Unicidade de código ignora maiúsculas/minúsculas.
- CA-005: Owner altera código.
- CA-006: Admin não altera código.
- CA-007: Vaga referencia versão publicada de Cargo.
- CA-008: Cargo `draft` é recusado.
- CA-009: Cargo `archived` é recusado.
- CA-010: Cargo de outra Organization é recusado.
- CA-011: Organizational Unit de outra Organization é recusada.
- CA-012: Organizational Unit inativa é recusada.
- CA-013: Criar draft.
- CA-014: Impedir segundo draft ativo.
- CA-015: Publicar versão.
- CA-016: Admin não publica.
- CA-017: Member não publica.
- CA-018: Publicação é atômica.
- CA-019: Concorrência de publicação não gera duas versões publicadas.
- CA-020: Versão `published` é imutável.
- CA-021: Versão `archived` é imutável.
- CA-022: Competência de outra Organization é recusada.
- CA-023: Competência inativa é recusada.
- CA-024: Peso diferente de 100 impede publicação quando houver competências.
- CA-025: Peso inválido é recusado.
- CA-026: Pergunta de outra Organization é recusada.
- CA-027: Pergunta inativa é recusada.
- CA-028: Pergunta duplicada é recusada.
- CA-029: Member não recebe salário.
- CA-030: Member não recebe instruções internas.
- CA-031: Abrir sem versão publicada é recusado.
- CA-032: Abrir validamente.
- CA-033: Pausar.
- CA-034: Reabrir após pausa.
- CA-035: Encerrar.
- CA-036: Cancelar.
- CA-037: Transição inválida é recusada.
- CA-038: Slug público é único.
- CA-039: Página pública existe somente para Vaga aberta e pública.
- CA-040: Vaga pausada fica fora da página pública.
- CA-041: Vaga encerrada fica fora da página pública.
- CA-042: Organization arquivada bloqueia operações normais.
- CA-043: User sem Membership é bloqueado.
- CA-044: Membership inativo é bloqueado.
- CA-045: User inativo é bloqueado.
- CA-046: Manipulação de IDs não libera acesso.
- CA-047: Platform Admin apenas consulta administrativamente.
- CA-048: Auditoria não registra conteúdo completo.
- CA-049: Falha de auditoria crítica causa rollback.
- CA-050: Não existe exclusão física.
- CA-051: Persistência após recriar aplicação.
- CA-052: `positions_count` existe somente em `job_opening_versions`.
- CA-053: Título interno pode ser diferente do título público.
- CA-054: Cada versão preserva o Cargo usado por `job_profile_version_id`.
- CA-055: Mudança de Cargo ocorre apenas em draft.
- CA-056: Competências vazias são permitidas.
- CA-057: Competências presentes devem somar exatamente 100.
- CA-058: Mais de 50 competências na versão é recusado.
- CA-059: Perguntas vazias são permitidas.
- CA-060: Peso de pergunta é opcional, relativo e não exige soma 100.
- CA-061: Mais de 100 perguntas na versão é recusado.
- CA-062: Item inativado após publicação não quebra histórico da versão
  publicada.
- CA-063: Item inativo é recusado em nova publicação.
- CA-064: Prazo expirado retira disponibilidade pública sem fechar a Vaga.
- CA-065: `draft -> cancelled` sem publicação é permitido somente para owner.
- CA-066: `paused -> cancelled` exige publicação prévia e é permitido somente
  para owner.
- CA-067: Admin configura divulgação pública somente após publicação interna do
  owner.
- CA-068: Slug público é imutável após primeira publicação e não pode ser
  reutilizado.
- CA-069: Slug duplicado é recusado.
- CA-070: Consulta pública por slug retirado, pausado, encerrado ou cancelado
  não expõe dados internos nem permite candidatura pública.

## 23. Testes Obrigatórios

Quando implementada, a funcionalidade deve possuir testes para:

1. criar Vaga;
2. código duplicado;
3. owner alterar código;
4. admin não alterar código;
5. Cargo draft recusado;
6. Cargo archived recusado;
7. Cargo de outra Organization recusado;
8. unidade de outra Organization recusada;
9. unidade inativa recusada;
10. criar draft;
11. impedir segundo draft ativo;
12. publicar;
13. admin não publicar;
14. member não publicar;
15. publicação atômica;
16. concorrência de publicação;
17. versão published imutável;
18. versão archived imutável;
19. competência de outra Organization;
20. competência inativa;
21. pesos diferentes de 100;
22. peso inválido;
23. pergunta de outra Organization;
24. pergunta inativa;
25. pergunta duplicada;
26. member sem salário;
27. member sem instruções internas;
28. abrir sem versão publicada;
29. abrir validamente;
30. pausar;
31. reabrir após pausa;
32. encerrar;
33. cancelar;
34. transição inválida;
35. slug público único;
36. página pública somente para Vaga aberta;
37. Vaga pausada fora da página pública;
38. Vaga encerrada fora da página pública;
39. Organization arquivada;
40. User sem Membership;
41. Membership inativo;
42. User inativo;
43. manipulação de IDs;
44. Platform Admin apenas consulta administrativamente;
45. auditoria sem conteúdo completo;
46. rollback quando auditoria falha;
47. ausência de exclusão física;
48. persistência após recriar aplicação.
49. `positions_count` existir somente na versão;
50. título interno diferente do título público;
51. cada versão preservar o Cargo usado;
52. mudança de Cargo apenas em draft;
53. competências vazias permitidas;
54. competências presentes somarem exatamente 100;
55. máximo de 50 competências;
56. perguntas vazias permitidas;
57. peso de pergunta relativo e opcional;
58. máximo de 100 perguntas;
59. item inativado após publicação não quebrar histórico;
60. item inativo ser recusado em nova publicação;
61. prazo expirado retirar disponibilidade pública sem fechar a Vaga;
62. `draft -> cancelled` sem publicação;
63. `paused -> cancelled` com publicação;
64. admin configurar divulgação somente após publicação do owner;
65. slug imutável e não reutilizável;
66. slug duplicado recusado;
67. tentativa de alterar slug após primeira divulgação pública;
68. tentativa de reutilizar slug reservado;
69. consulta pública por slug retirado, pausado, encerrado ou cancelado.

## 24. Limitações Conhecidas

- Esta SPEC não implementa código.
- Esta SPEC não cria banco, migrations, rotas, testes ou dependências.
- Não há candidatos.
- Não há candidatura pública.
- Não há pipeline.
- Não há entrevistas.
- Não há avaliações.
- Não há matching.
- Não há IA.
- Não há propostas.
- Não há aprovação em múltiplos níveis.
- Não há reabertura de Vaga encerrada.
- Não há exclusão física.

## 25. Definição de Concluído

Para a implementação futura desta SPEC:

- SPEC aprovada antes do desenvolvimento;
- ADR-0012 aceita ou ajustada;
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
