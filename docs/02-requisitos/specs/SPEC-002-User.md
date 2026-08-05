# SPEC-002 - User

**Status:** Aprovada  
**Versao:** 1.0  
**Fase:** 1  
**Responsavel de negocio:** Thiago Sousa  
**Dependencias:** SPEC-001 - Organization, SPEC-004 - Roles & Permissions  
**Ultima atualizacao:** 2026-08-05

## 1. Objetivo

Representar uma pessoa que pode acessar o Talent OS.

O `User` existe globalmente na plataforma e pode participar de uma ou mais
Organizations por meio de Memberships separados.

## 2. Fora do escopo

- login social;
- recuperacao de senha;
- autenticacao multifator;
- SSO;
- cobranca;
- perfil de candidato;
- perfil de colaborador;
- permissoes detalhadas por modulo.

## 3. Conceitos

- Um e-mail representa uma unica conta global.
- O usuario nao pertence diretamente a uma unica Organization.
- O acesso a uma Organization depende de Membership ativo.
- O usuario pode estar `active` ou `inactive`.
- Usuario inativo nao pode autenticar nem acessar nenhuma Organization.
- A matriz detalhada de autorizacao deve seguir a SPEC-004.

## 4. Usuarios envolvidos

- Platform Admin.
- Usuario da Organization.

Agente de suporte autorizado fica fora da Fase 1.

## 5. Fluxo principal

1. Platform Admin informa nome e e-mail.
2. Sistema normaliza o e-mail.
3. Sistema verifica duplicidade.
4. Sistema cria o usuario com status canonico `active`.
5. Sistema registra auditoria.
6. O usuario somente acessa Organizations apos possuir Membership ativo e
   permissao validada no servidor.

## 6. Regras de negocio

- RN-001: O e-mail deve ser unico na plataforma.
- RN-002: O e-mail deve ser salvo sem espacos laterais e em letras minusculas.
- RN-003: Um usuario pode participar de varias Organizations.
- RN-004: Usuario inativo nao pode autenticar nem acessar dados.
- RN-005: A desativacao do usuario nao apaga seu historico.
- RN-006: Usuario nao pode ser excluido fisicamente pelo fluxo normal.
- RN-007: Alteracoes de nome, e-mail e status devem ser auditadas.
- RN-008: A criacao de usuario nao concede acesso automatico a nenhuma
  Organization.
- RN-009: O sistema nao deve expor se um e-mail existe em respostas publicas.
- RN-010: Dados de autenticacao nunca devem ser armazenados em texto simples.
- RN-011: Valores canonicos persistidos e usados na API: `active` e `inactive`.
- RN-012: Nenhum outro status de User faz parte da Fase 1.
- RN-013: Regras detalhadas de permissao devem seguir a SPEC-004.

## 7. Dados necessarios

| Campo        | Obrigatorio | Observacao              |
| ------------ | ----------: | ----------------------- |
| `id`         |         Sim | Identificador interno.  |
| `name`       |         Sim | Nome exibido.           |
| `email`      |         Sim | Unico e normalizado.    |
| `status`     |         Sim | `active` ou `inactive`. |
| `created_at` |         Sim | Data de criacao.        |
| `updated_at` |         Sim | Data de atualizacao.    |

## 8. Permissoes

As permissoes detalhadas devem seguir a SPEC-004.

Regras essenciais desta entidade:

- Platform Admin pode criar e desativar usuarios.
- O proprio usuario pode consultar seus dados basicos.
- Alteracao de e-mail exige fluxo seguro e sera aprofundada em SPEC futura.
- Usuarios de Organization nao podem listar todos os usuarios globais.

## 9. Interface

Nesta fase, a interface pode ser simples:

- identificacao do usuario atual;
- nome;
- e-mail;
- status;
- Organizations acessiveis.

Nao criar painel global completo.

## 10. API conceitual

| Operacao                | Finalidade                            |
| ----------------------- | ------------------------------------- |
| Criar usuario           | Criar conta global.                   |
| Consultar usuario atual | Retornar dados seguros da sessao.     |
| Atualizar usuario       | Alterar dados permitidos.             |
| Desativar usuario       | Bloquear acesso sem apagar historico. |

## 11. Banco de dados

Tabela conceitual: `users`.

Restricoes:

- e-mail unico;
- status limitado a `active` ou `inactive`;
- datas obrigatorias;
- sem vinculo direto obrigatorio com Organization;
- sem exclusao em cascata do historico;
- compatibilidade com SQLite local e PostgreSQL/Supabase.

Toda mudanca estrutural deve possuir migracao reproduzivel quando houver
implementacao.

## 12. Seguranca

- validacao de entrada no servidor;
- normalizacao de e-mail antes da verificacao;
- nenhuma senha em logs;
- nenhuma listagem global para usuarios comuns;
- resposta publica nao confirma existencia de conta;
- usuario inativo sempre bloqueado;
- ausencia de acesso cruzado entre Organizations;
- autorizacao centralizada conforme SPEC-004.

## 13. Auditoria

Registrar:

- `user.created`
- `user.name_changed`
- `user.email_changed`
- `user.activated`
- `user.deactivated`
- `user.inactive_access_denied`

## 14. Criterios de aceite

- CA-001: E-mails equivalentes nao criam usuarios duplicados.
- CA-002: Usuario ativo pode ser associado a mais de uma Organization via
  Membership.
- CA-003: Usuario inativo nao acessa nenhuma Organization.
- CA-004: Desativacao preserva historico.
- CA-005: Criacao nao concede acesso automatico a Organization.
- CA-006: Alteracoes relevantes geram auditoria.
- CA-007: Somente `active` e `inactive` sao usados como status de User na Fase 1.

## 15. Testes obrigatorios

- criacao valida;
- e-mail invalido;
- e-mail duplicado;
- normalizacao de e-mail;
- usuario inativo bloqueado;
- ausencia de acesso sem Membership;
- ausencia de acesso cruzado entre Organizations;
- auditoria de criacao e mudanca de status;
- ausencia de segredo ou senha em logs;
- nenhuma criacao de usuario com status diferente de `active` ou `inactive` na
  Fase 1.

## 16. Limitacoes conhecidas

- autenticacao real sera especificada separadamente;
- convites serao especificados separadamente;
- MFA e SSO ficam para fases futuras;
- suporte autorizado fica para fase futura.

## 17. Definicao de concluido

- criterios atendidos;
- testes passando;
- lint, formatacao e build passando;
- migracao criada quando houver implementacao;
- documentacao atualizada;
- seguranca revisada;
- commit realizado.
