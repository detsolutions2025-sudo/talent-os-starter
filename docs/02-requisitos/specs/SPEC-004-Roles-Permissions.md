# SPEC-004 - Roles & Permissions

**Status:** Aprovada  
**Versao:** 1.0  
**Fase:** 1  
**Responsavel de negocio:** Thiago Sousa  
**Dependencias:** SPEC-001 - Organization, SPEC-002 - User, SPEC-003 - Membership  
**Ultima atualizacao:** 2026-08-05

## 1. Objetivo

Definir o vocabulario canonico, as Roles iniciais e a matriz centralizada de
autorizacao da Fase 1.

Nesta fase, as Roles de Membership sao fixas: `owner`, `admin` e `member`.

## 2. Fora do escopo

- Roles personalizadas;
- permissoes por campo;
- permissoes temporarias;
- departamentos e equipes;
- aprovadores de vagas;
- perfis especificos de RH;
- acesso de candidatos;
- acesso de suporte;
- modulo generico de configuracoes.

## 3. Vocabulario canonico

- **Organization:** empresa cliente do Talent OS.
- **User:** conta global de uma pessoa.
- **Membership:** vinculo entre User e Organization.
- **Role:** funcao exercida no Membership.
- **Platform Admin:** administrador interno da plataforma.
- **owner:** responsavel maximo dentro da Organization.
- **admin:** administrador operacional da Organization.
- **member:** usuario comum da Organization.

`Platform Admin` nao e uma Role de Membership. Platform Admin e um perfil interno
da plataforma, separado das Roles `owner`, `admin` e `member`.

## 4. Conceitos

- Role e a funcao do User dentro de uma Organization.
- Permission e uma acao autorizada.
- A autorizacao deve ser validada no servidor.
- Ocultar botao na interface nao substitui autorizacao.
- O modelo deve negar por padrao.
- Nenhuma Role concede acesso a outra Organization.

## 5. Funcoes iniciais

### Platform Admin

Perfil interno da plataforma.

Pode:

- criar Organization com primeiro owner ativo em operacao atomica;
- listar Organizations para administracao da plataforma;
- consultar Organization para administracao da plataforma;
- arquivar Organization;
- reativar Organization arquivada;
- criar e desativar Users conforme SPEC-002;
- criar primeiro owner conforme SPEC-001 e SPEC-003.

Nao e Membership e nao deve ser tratado como Role dentro de Organization.

### owner

Responsavel maximo pela Organization dentro do sistema.

Pode:

- consultar dados da Organization atual ativa;
- alterar campos operacionais da Organization autorizados pela SPEC-001;
- listar membros;
- adicionar membros;
- alterar Roles conforme matriz;
- ativar e desativar Memberships conforme matriz;
- administrar owners, sem remover, desativar ou rebaixar o ultimo owner ativo.

Nao pode:

- arquivar Organization;
- reativar Organization;
- alterar status da Organization;
- acessar outra Organization.

### admin

Administrador operacional da Organization.

Pode:

- consultar dados da Organization atual ativa;
- alterar campos operacionais da Organization autorizados pela SPEC-001;
- listar membros;
- adicionar members;
- alterar e desativar members;
- executar operacoes administrativas autorizadas nesta matriz.

Nao pode:

- arquivar Organization;
- reativar Organization;
- alterar status da Organization;
- remover ou rebaixar owner;
- tornar alguem owner;
- promover alguem para admin;
- agir fora da Organization atual.

### member

Usuario comum da Organization.

Pode:

- consultar dados basicos da Organization atual ativa;
- consultar os proprios dados;
- utilizar funcionalidades futuras que lhe forem liberadas por SPEC propria.

Nao pode:

- administrar Organization;
- administrar Memberships;
- alterar Roles;
- arquivar ou reativar Organization;
- acessar outra Organization.

## 6. Regras de negocio

- RN-001: Toda autorizacao e verificada no servidor.
- RN-002: A interface deve ocultar ou desabilitar acoes nao permitidas, mas isso
  nao e controle de seguranca suficiente.
- RN-003: Owner nao pode remover, desativar ou rebaixar o ultimo owner ativo.
- RN-004: Admin nao pode administrar owners.
- RN-005: Member nao pode administrar Memberships.
- RN-006: Nenhuma Role concede acesso a outra Organization.
- RN-007: User ou Membership inativo nao possui permissoes.
- RN-008: Organization arquivada nao pode ser selecionada como contexto atual.
- RN-009: Organization arquivada bloqueia operacoes normais.
- RN-010: Dados de Organization arquivada ficam disponiveis apenas para operacoes
  administrativas autorizadas da plataforma.
- RN-011: Somente Platform Admin pode arquivar Organization.
- RN-012: Somente Platform Admin pode reativar Organization arquivada.
- RN-013: Mudanca de Role produz efeito nas proximas requisicoes.
- RN-014: Acoes negadas relevantes devem ser auditadas.
- RN-015: Permissoes devem ser centralizadas para evitar regras duplicadas.
- RN-016: Nao criar modulo generico de configuracoes na Fase 1.

## 7. Matriz inicial

| Acao                                                              | Platform Admin |  owner   | admin | member |
| ----------------------------------------------------------------- | :------------: | :------: | :---: | :----: |
| Criar Organization com primeiro owner                             |      Sim       |   Nao    |  Nao  |  Nao   |
| Listar Organizations para administracao da plataforma             |      Sim       |   Nao    |  Nao  |  Nao   |
| Consultar Organization atual ativa                                |      Sim       |   Sim    |  Sim  |  Sim   |
| Alterar campos operacionais da Organization ativa                 |      Sim       |   Sim    |  Sim  |  Nao   |
| Alterar status da Organization                                    |      Sim       |   Nao    |  Nao  |  Nao   |
| Arquivar Organization                                             |      Sim       |   Nao    |  Nao  |  Nao   |
| Reativar Organization                                             |      Sim       |   Nao    |  Nao  |  Nao   |
| Selecionar Organization arquivada como contexto atual             |      Nao       |   Nao    |  Nao  |  Nao   |
| Operacoes normais em Organization arquivada                       |      Nao       |   Nao    |  Nao  |  Nao   |
| Consultar Organization arquivada para administracao da plataforma |      Sim       |   Nao    |  Nao  |  Nao   |
| Listar membros da Organization atual ativa                        |      Sim       |   Sim    |  Sim  |  Nao   |
| Adicionar member                                                  |      Sim       |   Sim    |  Sim  |  Nao   |
| Alterar member                                                    |      Sim       |   Sim    |  Sim  |  Nao   |
| Desativar member                                                  |      Sim       |   Sim    |  Sim  |  Nao   |
| Promover member para admin                                        |      Sim       |   Sim    |  Nao  |  Nao   |
| Promover para owner                                               |      Sim       |   Sim    |  Nao  |  Nao   |
| Administrar owner                                                 |      Sim       | Limitado |  Nao  |  Nao   |
| Remover, desativar ou rebaixar ultimo owner ativo                 |      Nao       |   Nao    |  Nao  |  Nao   |
| Acessar outra Organization                                        |      Nao       |   Nao    |  Nao  |  Nao   |

Campos operacionais da Organization na Fase 1 sao os definidos na SPEC-001.
Alteracoes de status, arquivamento e reativacao nao sao campos operacionais.

## 8. API conceitual

Toda rota protegida deve declarar ou aplicar a permissao necessaria.

Permissoes conceituais:

- `platform.organization.create`
- `platform.organization.read`
- `platform.organization.archive`
- `platform.organization.reactivate`
- `platform.user.create`
- `platform.user.deactivate`
- `organization.read`
- `organization.update_operational_fields`
- `membership.read`
- `membership.create`
- `membership.update`
- `membership.manage_owner`

A nomenclatura final pode ser ajustada, mas deve permanecer centralizada e
documentada.

## 9. Banco de dados

Nesta fase, a Role pode existir no Membership como valor restrito.

Nao criar tabela complexa de permissoes customizadas ainda.

Preparar o codigo para futura evolucao sem implementar prematuramente.

As regras devem ser implementaveis em SQLite local e PostgreSQL/Supabase.

## 10. Seguranca

- negar por padrao;
- validar Organization atual;
- bloquear Organization arquivada como contexto atual;
- validar User ativo;
- validar Membership ativo;
- validar Role;
- nao confiar em dados enviados pela interface;
- nao retornar detalhes internos excessivos em erros;
- auditar negacoes criticas;
- impedir acesso cruzado entre Organizations;
- impedir remocao, desativacao ou rebaixamento do ultimo owner ativo.

## 11. Auditoria

Registrar:

- mudanca de Role;
- tentativa de acao sem permissao;
- tentativa de administrar owner por admin;
- tentativa de acessar outra Organization;
- tentativa de arquivar Organization por owner, admin ou member;
- tentativa de reativar Organization por owner, admin ou member;
- tentativa de selecionar Organization arquivada como contexto atual;
- tentativa de operacao normal em Organization arquivada;
- tentativa de remover, desativar ou rebaixar ultimo owner ativo;
- arquivamento de Organization por Platform Admin;
- reativacao de Organization por Platform Admin.

## 12. Criterios de aceite

- CA-001: Platform Admin executa acoes de plataforma previstas.
- CA-002: Owner executa apenas acoes previstas.
- CA-003: Owner nao arquiva nem reativa Organization.
- CA-004: Admin nao administra owners.
- CA-005: Admin nao arquiva nem reativa Organization.
- CA-006: Member nao administra Memberships.
- CA-007: Member nao arquiva nem reativa Organization.
- CA-008: Nenhuma Role acessa outra Organization.
- CA-009: User e Membership inativos sao bloqueados.
- CA-010: Organization arquivada nao pode ser contexto atual.
- CA-011: Organization arquivada bloqueia operacoes normais.
- CA-012: Alteracao manual de requisicao nao contorna permissao.
- CA-013: Regras ficam centralizadas no servidor.
- CA-014: Negacao retorna resposta segura e gera auditoria quando necessario.
- CA-015: Ultimo owner ativo nao pode ser removido, desativado ou rebaixado.

## 13. Testes obrigatorios

Para cada acao protegida, testar:

- Platform Admin autorizado quando aplicavel;
- owner autorizado ou negado conforme matriz;
- admin autorizado ou negado conforme matriz;
- member autorizado ou negado conforme matriz;
- User sem Membership;
- Membership inativo;
- User inativo;
- Organization diferente;
- Organization arquivada;
- ID manipulado;
- auditoria da negacao.

Testes especificos obrigatorios:

- Platform Admin pode arquivar.
- Owner nao pode arquivar.
- Admin nao pode arquivar.
- Member nao pode arquivar.
- Platform Admin pode reativar.
- Owner nao pode reativar.
- Admin nao pode reativar.
- Member nao pode reativar.
- Tentativa negada de arquivamento ou reativacao gera auditoria.
- Organization arquivada nao pode ser selecionada.
- Operacoes normais em Organization arquivada sao bloqueadas.
- Ausencia de acesso cruzado entre Organizations.
- Impossibilidade de remover, desativar ou rebaixar o ultimo owner ativo.

## 14. Limitacoes conhecidas

- nao existem Roles personalizadas;
- nao existem permissoes por modulo de RH;
- nao existe suporte temporario;
- nao existe aprovacao em multiplos niveis;
- nao existe modulo generico de configuracoes.

## 15. Definicao de concluido

- matriz implementada;
- autorizacao centralizada;
- testes de integracao passando;
- testes de acesso cruzado passando;
- lint, formatacao e build passando;
- documentacao atualizada;
- seguranca revisada;
- commit realizado.
