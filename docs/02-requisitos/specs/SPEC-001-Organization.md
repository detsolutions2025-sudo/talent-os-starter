# SPEC-001 - Organization

**Status:** Aprovada  
**Versao:** 1.0  
**Fase:** 1  
**Responsavel de negocio:** Thiago Sousa  
**Ultima atualizacao:** 2026-08-05

## 1. Objetivo

Definir a entidade `Organization`, que representa uma empresa cliente dentro do
Talent OS.

`Organization` e a base da separacao multiempresa. Todas as futuras entidades de
negocio que pertencerem a uma empresa deverao se relacionar direta ou
indiretamente com uma `Organization`, respeitando as regras de acesso,
seguranca, auditoria e isolamento entre empresas.

## 2. Conceitos

- **Organization:** empresa cliente cadastrada no Talent OS.
- **Platform Admin:** administrador interno da plataforma. Nao e uma role de
  Membership.
- **Organization ativa:** organization disponivel para uso operacional.
- **Organization arquivada:** organization preservada no banco, mas retirada do
  uso operacional normal.
- **Slug:** identificador textual simplificado, usado para referencia interna ou
  futura composicao de URLs.
- **Isolamento multiempresa:** garantia de que dados de uma organization nao
  aparecem no contexto de outra.

## 3. Regras de negocio

- RN-001: Somente Platform Admin pode criar `Organizations`.
- RN-002: A criacao de uma `Organization` exige indicar um `User` existente e
  ativo como primeiro `owner`.
- RN-003: A criacao da `Organization` e do primeiro `Membership` deve ocorrer em
  uma unica operacao atomica.
- RN-004: Se a criacao da `Organization` falhar, nenhum `Membership` deve ser
  criado.
- RN-005: Se a criacao do primeiro `Membership` falhar, a `Organization` nao deve
  permanecer criada.
- RN-006: A operacao de criacao deve terminar com exatamente um primeiro owner
  ativo.
- RN-007: Usuario inexistente ou inativo nao pode ser owner inicial.
- RN-008: Toda `Organization` criada deve iniciar com status persistido `active`.
- RN-009: A interface pode apresentar `active` como "Ativa".
- RN-010: `Organizations` nao podem ser excluidas fisicamente pelo fluxo oficial.
- RN-011: `Organizations` podem ser arquivadas.
- RN-012: Somente Platform Admin pode arquivar `Organizations`.
- RN-013: Somente Platform Admin pode reativar `Organizations` arquivadas.
- RN-014: `owner`, `admin` e `member` nao podem arquivar ou reativar
  `Organizations`.
- RN-015: Uma `Organization` arquivada permanece armazenada e preserva
  Memberships, historico e auditoria.
- RN-016: Uma `Organization` arquivada nao pode ser selecionada como contexto
  atual.
- RN-017: Uma `Organization` arquivada nao aceita operacoes normais.
- RN-018: Dados de uma `Organization` arquivada ficam disponiveis apenas para
  operacoes administrativas autorizadas da plataforma.
- RN-019: O nome da `Organization` e obrigatorio.
- RN-020: O slug da `Organization` e obrigatorio, normalizado e unico.
- RN-021: Toda consulta futura de dados de negocio deve validar a organization
  atual no servidor.
- RN-022: Identificadores enviados pelo navegador nao provam acesso a uma
  `Organization`.
- RN-023: A matriz detalhada de autorizacao deve seguir a SPEC-004.
- RN-024: Acoes criticas envolvendo `Organization` devem gerar auditoria.
- RN-025: Dados reais nao devem ser usados em desenvolvimento ou testes.
- RN-026: Nenhum segredo, token ou senha deve ser registrado em logs de auditoria.

## 4. Campos obrigatorios

| Campo       | Tipo conceitual | Regra                                   |
| ----------- | --------------- | --------------------------------------- |
| `id`        | Identificador   | Gerado pelo sistema e unico.            |
| `name`      | Texto           | Nome exibido da organization.           |
| `slug`      | Texto           | Valor normalizado, unico e obrigatorio. |
| `status`    | Enum            | Valor inicial persistido: `active`.     |
| `createdAt` | Data/hora       | Gerado na criacao.                      |
| `updatedAt` | Data/hora       | Atualizado a cada alteracao.            |

Valores canonicos persistidos e usados na API:

- `active`
- `archived`

## 5. Campos opcionais

| Campo                 | Tipo conceitual | Observacao                                              |
| --------------------- | --------------- | ------------------------------------------------------- |
| `legalName`           | Texto           | Razao social, quando aplicavel.                         |
| `taxId`               | Texto           | Identificador fiscal, sem uso de dados reais em testes. |
| `description`         | Texto           | Descricao interna da organization.                      |
| `archivedAt`          | Data/hora       | Preenchido quando a organization for arquivada.         |
| `archivedByUserId`    | Identificador   | Platform Admin responsavel pelo arquivamento.           |
| `reactivatedAt`       | Data/hora       | Preenchido quando a organization for reativada.         |
| `reactivatedByUserId` | Identificador   | Platform Admin responsavel pela reativacao.             |

Campos opcionais podem ser adiados na implementacao, desde que a decisao seja
documentada no plano da tarefa.

## 6. Permissoes

As permissoes detalhadas devem seguir a matriz da SPEC-004.

Regras essenciais desta entidade:

- Platform Admin pode criar `Organizations`.
- Platform Admin pode consultar `Organizations` para fins administrativos.
- Platform Admin pode arquivar `Organizations`.
- Platform Admin pode reativar `Organizations` arquivadas.
- `owner`, `admin` e `member` nao podem arquivar ou reativar `Organizations`.
- `owner` e `admin` podem alterar somente campos operacionais autorizados desta
  SPEC, quando houver Membership ativo e a Organization estiver ativa.
- Alteracoes de status nao fazem parte das permissoes de `owner` ou `admin`.
- Nao criar modulo generico de configuracoes na Fase 1.

Campos operacionais alteraveis por `owner` e `admin` na Fase 1:

- `name`
- `slug`
- `legalName`
- `taxId`
- `description`

## 7. Auditoria

Eventos obrigatorios:

- `organization.created`
- `organization.updated`
- `organization.archived`
- `organization.reactivated`
- `organization.access_denied`
- `membership.created_initial_owner`

Cada evento deve registrar, quando disponivel:

- identificador da organization;
- usuario ou agente responsavel pela acao;
- tipo de acao;
- data e hora;
- resultado da acao;
- motivo de negacao, quando houver.

Nao registrar senhas, tokens, connection strings, chaves de API ou dados
pessoais desnecessarios.

## 8. API conceitual

| Operacao                             | Permissao                                          | Finalidade                                                          |
| ------------------------------------ | -------------------------------------------------- | ------------------------------------------------------------------- |
| Criar organization com owner inicial | Platform Admin                                     | Criar Organization e primeiro Membership owner em operacao atomica. |
| Listar organizations                 | Platform Admin                                     | Consultar organizations cadastradas.                                |
| Consultar organization               | Platform Admin ou usuario autorizado pela SPEC-004 | Obter dados basicos permitidos.                                     |
| Atualizar campos operacionais        | Platform Admin, owner ou admin autorizado          | Alterar campos operacionais permitidos.                             |
| Arquivar organization                | Platform Admin                                     | Arquivar sem excluir dados.                                         |
| Reativar organization                | Platform Admin                                     | Retornar organization arquivada para status `active`.               |

Nao deve existir operacao conceitual de exclusao fisica de `Organization`.

## 9. Modelo de banco

Tabela conceitual esperada: `organizations`.

Campos minimos:

| Campo                    | Restricao esperada                           |
| ------------------------ | -------------------------------------------- |
| `id`                     | Chave primaria.                              |
| `name`                   | Obrigatorio.                                 |
| `slug`                   | Obrigatorio e unico.                         |
| `status`                 | Obrigatorio, valores `active` ou `archived`. |
| `created_at`             | Obrigatorio.                                 |
| `updated_at`             | Obrigatorio.                                 |
| `archived_at`            | Opcional.                                    |
| `archived_by_user_id`    | Opcional.                                    |
| `reactivated_at`         | Opcional.                                    |
| `reactivated_by_user_id` | Opcional.                                    |

Restricoes esperadas:

- unicidade de `slug`;
- status limitado aos valores canonicos;
- ausencia de exclusao fisica como fluxo oficial;
- compatibilidade com SQLite local e PostgreSQL/Supabase;
- migracoes reproduziveis quando houver implementacao.

A criacao atomica de `Organization` e primeiro `Membership` deve ser transacional
no servidor e compativel com SQLite local e PostgreSQL/Supabase.

## 10. Criterios de aceite

- CA-001: Somente Platform Admin cria `Organization`.
- CA-002: Criacao exige User existente e ativo como owner inicial.
- CA-003: Criacao de Organization e primeiro Membership e atomica.
- CA-004: Falha na Organization nao cria Membership.
- CA-005: Falha no Membership nao deixa Organization criada.
- CA-006: Operacao termina com exatamente um primeiro owner ativo.
- CA-007: Organization nasce com status `active`.
- CA-008: Organization nao pode ser excluida fisicamente.
- CA-009: Organization pode ser arquivada apenas por Platform Admin.
- CA-010: Organization pode ser reativada apenas por Platform Admin.
- CA-011: Organization arquivada nao pode ser contexto atual.
- CA-012: Organization arquivada bloqueia operacoes normais.
- CA-013: Tentativas negadas geram auditoria.
- CA-014: Nenhum acesso cruzado entre Organizations e permitido.

## 11. Testes obrigatorios

Quando a entidade for implementada, os testes devem comprovar:

- Platform Admin cria `Organization` com primeiro owner ativo.
- Owner inicial inexistente falha.
- Owner inicial inativo falha.
- Criacao atomica de Organization e primeiro owner.
- Falha na criacao de Organization nao cria Membership.
- Falha na criacao do Membership nao deixa Organization criada.
- Exatamente um primeiro owner e criado.
- `Organization` nasce com status `active`.
- Slug duplicado e recusado.
- Slug e normalizado de forma consistente.
- Platform Admin pode arquivar.
- Owner nao pode arquivar.
- Admin nao pode arquivar.
- Member nao pode arquivar.
- Platform Admin pode reativar.
- Owner, admin e member nao podem reativar.
- Organization arquivada nao pode ser selecionada como contexto atual.
- Organization arquivada bloqueia operacoes normais.
- Dados de uma Organization nao aparecem em outra.
- Criacao, arquivamento, reativacao e tentativas negadas geram auditoria.
- Nenhum segredo e registrado em auditoria ou logs.

## 12. Limitacoes

- Esta SPEC nao implementa codigo.
- Esta SPEC nao cria migrations.
- Esta SPEC nao cria tabelas.
- Esta SPEC nao define autenticacao real.
- Esta SPEC nao define convites.
- Esta SPEC nao define modulo generico de configuracoes.
- Esta SPEC nao define DNA organizacional, cargos, vagas, candidatos,
  recrutamento, IA, cobranca ou integracoes externas.
