# ADR 0001 - Base tecnica da Fase 0

## Status

Aceita na Fase 0.

## Contexto

O Talent OS precisa iniciar como uma aplicacao web local, tipada, testavel e sem
dependencias de producao. A arquitetura tambem deve preparar o projeto para
multiempresa sem implementar funcionalidades de RH nesta fase.

## Decisao

Usar Vite, React e TypeScript para a interface web, Express com TypeScript para
o servidor local e SQLite local como banco de desenvolvimento.

Na primeira tentativa, Prisma foi avaliado para versionar o banco. O schema era
valido, mas o schema engine falhou localmente sem diagnostico util em Node 24.
Para manter a Fase 0 simples, sem dependencia de engine externo e sem bloquear a
execucao local, a base usa `node:sqlite` e um arquivo SQL versionado.

A separacao multiempresa comeca por um tipo e utilitario de `TenantContext`. Toda
funcionalidade futura que acessar dados de negocio devera receber um contexto de
empresa validado pelo servidor. O identificador enviado pelo navegador nao sera
considerado prova de permissao.

## Consequencias

- O ambiente local roda sem servicos externos.
- O banco de desenvolvimento fica em arquivo local e nao exige credenciais reais.
- A evolucao para uma camada de dados mais completa pode ser reavaliada quando a
  Fase 1 definir autenticacao, empresas e permissoes.
- A evolucao para autenticacao, empresas e papeis fica reservada para a Fase 1.
- A regra de tenant obrigatorio ja possui teste automatizado.

## Restricoes mantidas

- Nenhuma funcionalidade de RH foi implementada.
- Nenhuma integracao real de IA foi criada.
- Nenhum segredo real foi adicionado ao repositorio.
