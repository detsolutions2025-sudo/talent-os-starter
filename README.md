# Talent OS

Plataforma SaaS multiempresa para gestao inteligente de talentos.

## Objetivo inicial

Construir um MVP com:

1. Empresas e usuarios
2. DNA organizacional
3. Biblioteca de cargos
4. Vagas
5. Candidatos
6. Processo seletivo
7. Avaliacao assistida por IA
8. Relatorio para decisao humana
9. Auditoria e seguranca entre empresas

## Regra principal

A IA auxilia. A decisao final e humana.

## Estado atual

Fase 1.1 concluida: nucleo multiempresa com Organizations, Users, Memberships,
roles iniciais, autorizacao centralizada no servidor, auditoria inicial e
persistencia PostgreSQL/Supabase no runtime principal.

## Como iniciar

1. Copie `.env.example` para `.env`.
2. Instale dependencias com `npm install`.
3. Defina `SUPABASE_DATABASE_URL` com uma connection string PostgreSQL/Supabase
   de desenvolvimento.
4. Aplique as migrations com `npm run db:migrate:supabase`.
5. Para usar a interface local, defina `VITE_DEV_USER_ID` com o ID de um User
   ativo que possua Membership ativo em uma Organization.
6. Inicie a aplicacao com `npm run dev`.
7. Abra `http://127.0.0.1:5173`.

## Governanca do projeto

Antes de iniciar qualquer alteracao, leia `CONSTITUICAO_DO_PROJETO.md`.

O fluxo obrigatorio de trabalho esta em
`docs/00-governanca/PROCESSO_DE_DESENVOLVIMENTO.md`.

Novas funcionalidades devem possuir especificacao baseada em
`docs/02-requisitos/specs/TEMPLATE_SPEC.md`.

## Comandos uteis

- `npm run dev`: inicia web e API local.
- `npm run test`: executa testes automatizados.
- `npm run lint`: verifica padrao de codigo.
- `npm run build`: verifica tipos e gera build web.
- `npm run db:push`: cria ou atualiza o banco SQLite de desenvolvimento.
- `npm run db:check:supabase`: testa a conexao com Supabase Postgres sem aplicar
  migracoes.
- `npm run db:migrate:supabase`: aplica migracoes no Supabase Postgres de
  desenvolvimento/homologacao.

## Supabase

Para preparar um banco Supabase de desenvolvimento ou homologacao:

1. Crie ou edite `.env`.
2. Defina `APP_ENV=development`.
3. Defina `SUPABASE_DATABASE_URL` com a connection string do Supabase Postgres.
4. Rode `npm run db:check:supabase`.
5. Rode `npm run db:migrate:supabase`.

Nunca coloque a connection string real em `.env.example`, documentacao, prompts
ou testes.

## Persistencia da Fase 1.1

O runtime principal da API usa PostgreSQL/Supabase por meio de
`SUPABASE_DATABASE_URL`. Se a variavel estiver ausente ou invalida, a API falha
ao iniciar de forma visivel. O armazenamento em memoria existe apenas para testes
rapidos explicitos e nao e usado como fallback automatico.

Os testes de persistencia usam `TEST_DATABASE_URL`, quando definida, ou
`SUPABASE_DATABASE_URL`. Cada execucao cria um schema temporario, aplica as
migrations nesse schema e remove tudo ao final.

## Fase 1

Identificacao temporaria de desenvolvimento e teste:

- `x-dev-platform-admin: true`
- `x-dev-user-id: <user-id>`

Esses headers nao sao autenticacao de producao.

Rotas principais:

- `POST /api/dev/users`
- `GET /api/dev/me`
- `POST /api/organizations`
- `GET /api/organizations`
- `GET /api/organizations/:organizationId`
- `PATCH /api/organizations/:organizationId`
- `POST /api/organizations/:organizationId/archive`
- `POST /api/organizations/:organizationId/reactivate`
- `GET /api/organizations/:organizationId/memberships`
- `POST /api/organizations/:organizationId/memberships`
- `PATCH /api/memberships/:membershipId`

## Seguranca

- Nao use dados reais em desenvolvimento.
- Nao coloque segredos em `.env.example`, prompts, logs ou testes.
- Toda funcionalidade futura com dados de negocio deve validar a empresa atual no
  servidor.
