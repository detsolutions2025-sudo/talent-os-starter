# ADR 0004 - Persistencia PostgreSQL do nucleo multiempresa

## Status

Aceita na Fase 1.1.

## Contexto

A Fase 1 implementou o nucleo multiempresa com armazenamento em memoria. A
revisao tecnica identificou que o runtime principal precisava persistir Users,
Organizations, Memberships e auditoria no PostgreSQL/Supabase para cumprir as
SPECs aprovadas e a decisao de banco remoto.

## Decisao

Substituir o armazenamento principal em memoria por uma porta de persistencia
`CoreRepository`, consumida pelo dominio e implementada por um adapter
PostgreSQL.

O dominio permanece responsavel por regras de negocio, autorizacao e auditoria.
O SQL fica restrito ao adapter `PostgresCoreRepository`, com consultas
parametrizadas via `pg`.

O `MemoryCoreRepository` pode permanecer apenas para testes rapidos e uso
explicito. Ele nao e fallback silencioso do runtime principal.

## Transacoes

Operacoes criticas usam `repository.transaction`:

- criacao de User quando auditada;
- criacao de Organization, primeiro Membership owner e auditoria;
- criacao de Membership;
- atualizacao de Membership;
- arquivamento e reativacao de Organization com auditoria.

No PostgreSQL, transacoes usam `BEGIN`, `COMMIT` e `ROLLBACK` no mesmo client.
Falhas de auditoria em operacoes criticas revertem a transacao.

## Ultimo owner

Antes de rebaixar ou desativar um owner ativo, o adapter PostgreSQL bloqueia os
Memberships da Organization com `SELECT ... FOR UPDATE`, conta owners ativos
dentro da transacao e recusa a alteracao quando restaria zero owner ativo.

Duas requisicoes concorrentes nao devem deixar a Organization sem owner ativo.

## Testes

Os testes de persistencia criam um schema PostgreSQL temporario, aplicam as
migrations versionadas nesse schema e removem o schema ao final. Isso evita
dependencia de dados existentes no banco compartilhado.

Os testes recusam execucao com `APP_ENV=production`.

## Banco indisponivel

O runtime principal exige `SUPABASE_DATABASE_URL`. Se a variavel estiver ausente
ou invalida, a aplicacao falha de forma visivel ao iniciar. Nao ha fallback
automatico para memoria.

## Consequencias

- O runtime principal passa a persistir dados no PostgreSQL/Supabase.
- A API preserva os contratos HTTP da Fase 1.
- A execucao local agora exige banco PostgreSQL configurado para a API completa.
- SQLite permanece apenas como base historica da Fase 0 e nao como persistencia
  principal do nucleo multiempresa.

## Restricoes mantidas

- Nenhum modulo futuro foi criado.
- Nenhum modulo de RH foi criado.
- Nenhuma integracao de IA foi criada.
- Platform Admin continua fora das Roles de Membership.
