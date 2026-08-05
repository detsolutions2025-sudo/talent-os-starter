# ADR 0003 - Nucleo multiempresa da Fase 1

## Status

Aceita na Fase 1.

## Contexto

A Fase 1 implementa o nucleo multiempresa do Talent OS: Organizations, Users,
Memberships, Roles, contexto da Organization atual, autorizacao centralizada e
auditoria inicial.

As SPECs aprovadas exigem que o servidor valide todo acesso, que o identificador
enviado pelo navegador nao prove permissao, que a criacao de Organization e
primeiro owner seja atomica e que Organizations arquivadas nao aceitem operacoes
normais.

## Decisao

Centralizar a autorizacao no servidor com uma matriz baseada na SPEC-004. Todas
as operacoes protegidas recebem um Actor temporario de desenvolvimento/teste e,
quando aplicavel, uma Organization atual validada no servidor.

Durante a Fase 1, a identificacao temporaria usa headers:

- `x-dev-platform-admin: true`
- `x-dev-user-id: <user-id>`

Esses headers so podem funcionar em `APP_ENV=development` ou `APP_ENV=test`.
Fora desses ambientes, a identificacao temporaria falha de forma segura.

## Consequencias

- A interface pode ocultar acoes, mas a seguranca real fica no servidor.
- Os testes de isolamento exercitam a API Express, nao apenas funcoes auxiliares.
- A troca futura para autenticacao real deve substituir apenas a resolucao do
  Actor, preservando a autorizacao central.
- A criacao de Organization com primeiro owner deve permanecer transacional.
- A protecao do ultimo owner deve ocorrer dentro da operacao de alteracao de
  Membership.

## Restricoes mantidas

- Nenhuma autenticacao definitiva foi implementada.
- Nenhum modulo de RH foi criado.
- Nenhuma integracao de IA foi criada.
- Platform Admin nao e Role de Membership.
