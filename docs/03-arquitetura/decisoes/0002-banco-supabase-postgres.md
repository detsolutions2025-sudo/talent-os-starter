# ADR 0002 - Supabase Postgres para banco remoto

## Status

Aceita apos a Fase 0.

## Contexto

O projeto precisa estar preparado para usar Supabase como banco remoto de
desenvolvimento ou homologacao. As regras do projeto proibem segredos no codigo,
uso de dados reais em desenvolvimento e acesso a producao por agentes.

## Decisao

Manter SQLite local para execucao simples da Fase 0 e adicionar migracoes SQL
versionadas para Supabase Postgres.

As credenciais do Supabase devem ficar somente em `.env`, usando
`SUPABASE_DATABASE_URL`. O arquivo `.env.example` mostra apenas o formato da
variavel, sem segredo real.

O comando `npm run db:migrate:supabase` aplica as migracoes pendentes e registra
o historico em `schema_migrations`. O comando recusa execucao quando
`APP_ENV=production`.

## Consequencias

- O projeto continua rodando localmente sem servicos externos.
- O banco remoto pode ser preparado com migracoes repetiveis e auditaveis.
- A Fase 1 ainda devera definir tabelas multiempresa, autenticacao, papeis e
  testes de acesso cruzado.
- Migracoes destrutivas seguem proibidas sem decisao explicita e revisao humana.
