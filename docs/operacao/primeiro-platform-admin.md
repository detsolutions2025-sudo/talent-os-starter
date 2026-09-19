# Primeiro Platform Admin

Bloco operacional. A tabela `platform_admins` (migration `0032`) é uma
allow-list interna — deliberadamente **sem** nenhuma rota HTTP para
criar o primeiro registro: _"Primeiro Platform Admin é inserido por
processo operacional manual, fora do fluxo HTTP desta Fase"_
(comentário da própria migration). Isto evita qualquer superfície
remota de "torne-se admin". Este documento é esse processo manual.

Platform Admin é diferente de "dono de uma Organization" (`Membership`
com `role=owner`): Platform Admin é global e dá acesso às rotas
`platform.*` (criar/gerenciar Organizations); para usar as
funcionalidades de RH dentro de um tenant, a pessoa também precisa de
um `Membership` numa Organization — ver seção 4.

## 1. Pré-requisito: o usuário precisa existir no Supabase Auth

Nenhum script deste repositório cria contas no Supabase Auth nem
manipula senha — isso é feito uma única vez, direto no dashboard do
projeto Supabase de destino (o mesmo apontado por `VITE_SUPABASE_URL`
naquele ambiente):

1. Supabase Dashboard → **Authentication → Users → Add user**.
2. E-mail e senha desejados (ex.: `admin@admin.com.br` /
   `Admin@123`). Marque **Auto Confirm User** (sem isso, o login real
   falha até a pessoa confirmar o e-mail).
3. Copie o **User UID** mostrado na lista de usuários — é o
   `external_id` usado no próximo passo.

## 2. Ligar o UID ao User/AuthIdentity/PlatformAdmin locais

Com `SUPABASE_DATABASE_URL` apontando para o Postgres **do mesmo
ambiente** do usuário criado acima (produção usa o pooler, porta 6543
— ver `docs/operacao/deploy-vercel.md` seção 4):

```
SUPABASE_DATABASE_URL="postgresql://...pooler...:6543/postgres?pgbouncer=true" \
  npm run auth:create-platform-admin -- \
  --email admin@admin.com.br \
  --name "Admin" \
  --external-id "<uid-copiado-do-passo-1>"
```

O script (`src/server/create-platform-admin.ts` →
`src/server/platform-admin-bootstrap.ts`) é **idempotente** — rodar de
novo com os mesmos dados não duplica nada, e reativa um Platform Admin
previamente revogado. Nunca usa a service-role key, nunca vê/manipula
senha. Coberto por
`tests/phase29/platform-admin-bootstrap-postgres.test.ts`.

## 3. Login

A pessoa faz login pela UI normalmente (`LoginScreen.tsx`, e-mail +
senha reais contra o Supabase Auth). No primeiro request autenticado,
`AuthService.resolveActor` (`src/server/auth/service.ts`) encontra o
`platform_admins` ativo e resolve `Actor = { kind: "platform",
userId }` — sem nenhuma configuração adicional.

## 4. Se também precisar gerenciar dados de RH (Organization)

Ser Platform Admin não cria uma Organization nem um Membership
automaticamente. Para isso, autenticado como o Platform Admin recém-
criado:

1. `POST /api/platform/organizations/bootstrap` com o nome/slug da
   Organization e o e-mail do futuro owner (pode ser o mesmo e-mail do
   Platform Admin) — cria um convite de bootstrap (SPEC-028 s16).
2. Aceitar o convite (`/accept-invite?invitation=<id>`, o link que o
   Supabase Auth envia) — isso materializa a Organization + o
   `Membership` `owner` na mesma transação já testada por
   `tests/phase1/*`.

Nenhum passo aqui exige mudança de código — é o mesmo fluxo de convite
já implementado e testado desde a Fase 29.

## 5. Segurança

- Nunca commitar a senha real nem a service-role key.
- Este script nunca deve ganhar uma rota HTTP equivalente — isso
  reintroduziria exatamente a superfície de ataque que a migration
  0032 evitou deliberadamente.
- Revogar um Platform Admin é uma operação simétrica manual (`UPDATE
platform_admins SET status = 'revoked', revoked_at = NOW(),
revoked_by_user_id = ... WHERE user_id = ...`) — sem CLI dedicado
  ainda; adicionar um exigiria a mesma disciplina de autorização deste
  documento.
