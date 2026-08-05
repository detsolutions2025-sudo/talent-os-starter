# SPEC-003 - Membership

**Status:** Aprovada  
**Versao:** 1.0  
**Fase:** 1  
**Responsavel de negocio:** Thiago Sousa  
**Dependencias:** SPEC-001 - Organization, SPEC-002 - User, SPEC-004 - Roles & Permissions  
**Ultima atualizacao:** 2026-08-05

## 1. Objetivo

Representar o vinculo entre um User e uma Organization.

O `Membership` determina se o User participa da Organization, qual Role possui e
se o acesso esta ativo.

## 2. Fora do escopo

- permissoes por modulo;
- convites por e-mail;
- equipes;
- departamentos;
- cargos organizacionais;
- acesso temporario de suporte;
- cobranca por usuario;
- arquivamento ou reativacao de Organization.

## 3. Conceitos

- Um User pode possuir varios Memberships.
- Uma Organization pode possuir varios Memberships.
- Um mesmo User nao pode possuir dois Memberships para a mesma Organization.
- Toda Organization ativa deve possuir pelo menos um owner ativo.
- Membership inativo nao concede acesso.
- A matriz detalhada de autorizacao deve seguir a SPEC-004.

## 4. Fluxo principal

1. Usuario autorizado atua dentro de uma Organization ativa.
2. Informa o User que sera vinculado.
3. Define a Role inicial.
4. Sistema valida permissao conforme SPEC-004.
5. Sistema valida User ativo, Organization ativa e duplicidade.
6. Sistema cria o Membership ativo.
7. Sistema registra auditoria.

## 5. Regras de negocio

- RN-001: A combinacao User + Organization deve ser unica.
- RN-002: Todo Membership deve possuir Role valida: `owner`, `admin` ou `member`.
- RN-003: Todo Membership deve possuir status canonico `active` ou `inactive`.
- RN-004: Membership inativo nao permite acesso.
- RN-005: A criacao de Organization deve criar exatamente um primeiro owner ativo
  na mesma operacao atomica definida pela SPEC-001.
- RN-006: Nao pode ser removido, desativado ou rebaixado o ultimo owner ativo.
- RN-007: Membership nao deve ser excluido fisicamente pelo fluxo normal.
- RN-008: Mudancas de Role e status devem ser auditadas.
- RN-009: O servidor deve validar o Membership em toda operacao da Organization.
- RN-010: Informar manualmente um Organization ID nao concede acesso.
- RN-011: User inativo permanece bloqueado mesmo com Membership ativo.
- RN-012: Organization arquivada nao aceita operacoes normais de seus membros.
- RN-013: Organization arquivada nao pode ser selecionada como contexto atual.
- RN-014: Regras detalhadas de permissao devem seguir a SPEC-004.

## 6. Dados necessarios

| Campo             | Obrigatorio | Observacao                    |
| ----------------- | ----------: | ----------------------------- |
| `id`              |         Sim | Identificador.                |
| `organization_id` |         Sim | Organization vinculada.       |
| `user_id`         |         Sim | User vinculado.               |
| `role`            |         Sim | `owner`, `admin` ou `member`. |
| `status`          |         Sim | `active` ou `inactive`.       |
| `joined_at`       |         Sim | Entrada na Organization.      |
| `created_at`      |         Sim | Criacao.                      |
| `updated_at`      |         Sim | Atualizacao.                  |

## 7. Permissoes

As permissoes detalhadas devem seguir a SPEC-004.

Regras essenciais desta entidade:

- Platform Admin cria o primeiro owner somente durante a operacao atomica de
  criacao da Organization definida pela SPEC-001.
- Owner pode administrar Memberships dentro dos limites da SPEC-004.
- Admin pode administrar apenas Memberships permitidos pela SPEC-004.
- Member nao pode administrar Memberships.
- Ninguem pode remover, desativar ou rebaixar o ultimo owner ativo.
- Nenhuma Role de Membership pode arquivar ou reativar Organization.

## 8. Interface

Interface simples para:

- listar membros da Organization atual;
- mostrar nome, e-mail, Role e status;
- adicionar Membership;
- alterar Role;
- ativar ou desativar Membership;
- apresentar mensagens claras de acesso negado.

Nao criar painel completo de administracao.

## 9. API conceitual

| Operacao                   | Finalidade                                        |
| -------------------------- | ------------------------------------------------- |
| Listar Memberships         | Listar membros da Organization atual autorizada.  |
| Criar Membership           | Vincular User ativo a Organization ativa.         |
| Atualizar Role             | Alterar Role conforme SPEC-004.                   |
| Atualizar status           | Ativar ou desativar Membership conforme SPEC-004. |
| Consultar Membership atual | Validar acesso e Role.                            |

## 10. Banco de dados

Tabela conceitual: `memberships`.

Restricoes:

- chave unica em `organization_id` + `user_id`;
- referencias validas para Organization e User;
- Role dentro do conjunto `owner`, `admin`, `member`;
- status dentro do conjunto `active`, `inactive`;
- indices para `organization_id` e `user_id`;
- protecao do ultimo owner validada em transacao no servidor;
- compatibilidade com SQLite local e PostgreSQL/Supabase.

## 11. Seguranca

- contexto da Organization validado no servidor;
- consulta sempre limitada a Organization atual autorizada;
- alteracao de ID no cliente nao modifica autorizacao;
- resposta nao deve revelar membros de outra Organization;
- operacoes criticas devem ser transacionais;
- tentativa negada gera auditoria;
- Organization arquivada bloqueia operacoes normais;
- autorizacao centralizada conforme SPEC-004.

## 12. Auditoria

Registrar:

- `membership.created`
- `membership.created_initial_owner`
- `membership.role_changed`
- `membership.activated`
- `membership.deactivated`
- `membership.last_owner_change_denied`
- `membership.cross_organization_access_denied`
- `membership.permission_denied`

## 13. Criterios de aceite

- CA-001: User acessa apenas Organizations com Membership ativo.
- CA-002: Membership duplicado e recusado.
- CA-003: Ultimo owner ativo nao pode ser removido, desativado ou rebaixado.
- CA-004: Member nao administra Memberships.
- CA-005: Admin administra apenas dentro das regras da SPEC-004.
- CA-006: User inativo permanece bloqueado.
- CA-007: Organization arquivada bloqueia operacoes normais.
- CA-008: Organization arquivada nao pode ser contexto atual.
- CA-009: Tentativas negadas geram auditoria.
- CA-010: Nao ha acesso cruzado entre Organizations.

## 14. Testes obrigatorios

- criar Membership valido;
- recusar Membership duplicado;
- acessar Organization permitida;
- bloquear Organization nao permitida;
- bloquear alteracao manual de Organization ID;
- bloquear Membership inativo;
- bloquear User inativo;
- impedir remocao do ultimo owner ativo;
- impedir desativacao do ultimo owner ativo;
- impedir rebaixamento do ultimo owner ativo;
- impedir member de administrar;
- permitir acao autorizada de owner;
- permitir acao autorizada de admin conforme matriz;
- bloquear operacoes normais em Organization arquivada;
- impedir selecionar Organization arquivada como contexto atual;
- garantir ausencia de dados cruzados;
- registrar auditoria de negacao.

## 15. Limitacoes conhecidas

- convites por e-mail ainda nao incluidos;
- Roles customizadas ainda nao incluidas;
- acesso de suporte ainda nao incluido;
- permissao por modulo ainda nao incluida.

## 16. Definicao de concluido

- criterios atendidos;
- testes de integracao e acesso cruzado passando;
- lint, formatacao e build passando;
- migracao criada quando houver implementacao;
- documentacao atualizada;
- seguranca revisada;
- commit realizado.
