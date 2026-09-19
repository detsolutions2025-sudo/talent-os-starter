# Deploy em Vercel

Bloco operacional (hosting, referenciado como decisão em aberto pela
ADR-0027 seção 4: "Hosting específico: não decidido nesta ADR"). Este
documento decide e registra essa escolha — Vercel — e como usar o que
já foi implementado; não é uma nova Fase de produto, não altera regra
de domínio, RBAC, tenant isolation, rate limiting, Auth ou contrato de
API algum.

## 1. Arquitetura escolhida

**Modo A (mesma origem)** — o mesmo já previsto e documentado por
`src/server/http/trusted-origins.ts` desde a Fase 31. Um único projeto
Vercel serve:

- o **frontend estático** (`vite build` → `dist/`), pela CDN da Vercel;
- a **API** (`/api/*`), como uma única Serverless Function
  (`api/index.ts`) que reaproveita o mesmo `express()` já usado pelo
  processo tradicional — nenhuma rota foi reescrita.

`vercel.json` faz o roteamento:

- `rewrites`: `/api/:path*` → `/api` (a função recebe o path original,
  ex. `/api/organizations/123` — é exatamente o que `createServer()`
  espera, já que suas rotas são montadas com `app.use("/api", ...)`);
  qualquer outro path → `/index.html` (fallback de SPA — as rotas
  públicas como `/vagas/:slug`, `/pre-interview`, `/proposal`,
  `/accept-invite` são resolvidas no cliente por `main.tsx`, nunca por
  arquivos físicos; sem este fallback, um refresh direto nessas URLs
  devolveria 404 da CDN).
- `headers`: cabeçalhos de segurança estáticos (sem dependência de
  origem dinâmica) aplicados às respostas do frontend — ver seção 6
  para o que **não** está coberto aqui.

## 2. Componentes desta wave

- `src/server/bootstrap.ts` — `buildApp()`, extraída de `index.ts`:
  toda a sequência de boot (handlers de resiliência →
  `assertProductionConfig` → pool → serviços → `createServer()`),
  agora compartilhada por dois entrypoints. A ordem é **contrato**,
  provado por `tests/phase30/bootstrap-smoke.test.ts` (spawn real do
  processo).
- `src/server/index.ts` — entrypoint tradicional (`npm run dev:api`,
  ou qualquer hosting baseado em processo de longa duração):
  `buildApp()` + `app.listen()` + `registerGracefulShutdown()`.
  Comportamento observável idêntico a antes desta wave.
- `api/index.ts` — entrypoint da Vercel: `buildApp({ poolOptions: { max: 3 } })`
  uma única vez por instância de função (reaproveitada entre
  invocações "warm" do mesmo container), exportado como handler
  `(req, res) => void`. Nunca chama `listen()`/graceful shutdown — a
  Vercel gerencia o ciclo de vida do processo.
- `vercel.json`, `.vercelignore` — descritos acima/abaixo.
- `package.json`: `engines.node = "22.x"` (mesma versão já fixada em
  `.github/workflows/ci.yml`) — a Vercel lê este campo para escolher o
  runtime Node da função e do build.

## 3. Variáveis de ambiente por ambiente Vercel

Nenhuma variável nova de código foi criada. Configure em **Vercel →
Project → Settings → Environment Variables**, usando exatamente os
nomes já documentados em `.env.example`:

| Variável                                                                   | Production                                                               | Preview                                                                        |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| `APP_ENV`                                                                  | `production`                                                             | `staging`                                                                      |
| `SUPABASE_DATABASE_URL`                                                    | pooler do projeto de produção (seção 4)                                  | pooler do projeto de homologação (ou o mesmo, se ainda não houver um separado) |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | projeto Supabase de produção                                             | projeto Supabase correspondente                                                |
| `TRUSTED_FRONTEND_ORIGINS`                                                 | `https://<domínio de produção>`                                          | `https://<domínio de preview>` (ver nota abaixo)                               |
| `AI_PROVIDER`, `AI_API_KEY`                                                | `disabled` até um provider real ser decidido (fora do escopo desta wave) | idem                                                                           |

Nota sobre Preview: a Vercel gera uma URL nova a cada deploy de PR
(`*-git-<branch>-<team>.vercel.app`, e também uma fixa por branch). Se
`TRUSTED_FRONTEND_ORIGINS` não acompanhar a URL exata do preview em
questão, CORS/CSRF bloqueiam esse preview especificamente — o gate de
`assertProductionConfig` continua satisfeito (a variável está
presente), mas requisições reais de dentro do preview seriam
rejeitadas por `createCsrfMiddleware`/`createCorsMiddleware`
(comportamento correto e documentado, não um bug). Duas opções
aceitáveis: (a) usar o domínio fixo de branch da Vercel para
`main`/branches de release, testando preview de PR apenas via
requisições diretas à function (sem depender do navegador para
mutações cookie-autenticadas); ou (b) atribuir um domínio Vercel fixo
("Custom Domain") a um ambiente de staging real. Nenhuma das duas
exige mudança de código.

`APP_URL`, `VITE_DEV_USER_ID`, `DATABASE_URL` (SQLite) são
exclusivamente de desenvolvimento local — nunca configuradas na
Vercel.

## 4. Banco de dados: pooler, nunca conexão direta

Cada instância de Serverless Function abre seu próprio `pg.Pool`
(`api/index.ts`, `max: 3`). Sob carga, a Vercel pode escalar para
dezenas de instâncias simultâneas — a conexão **direta** do Postgres
(porta 5432) tem um limite baixo de conexões concorrentes (a
configuração padrão do Supabase gira em torno de 60–90) e estouraria
rapidamente nesse cenário.

Use, em produção/preview, a connection string do **Transaction
pooler** do Supabase (Project Settings → Database → Connection
Pooling), porta **6543**, com `?pgbouncer=true`. O código já é
compatível com PgBouncer em modo transação: toda transação de negócio
usa `pool.connect()` dedicado para o bloco `BEGIN...COMMIT` (nunca
`SET` de sessão nem `LISTEN`/advisory lock fora de uma transação) —
verificado fisicamente nesta wave, nenhuma mudança de código foi
necessária para isso.

## 5. Migrations: passo manual, antes do deploy

`assertSafeMigrationEnvironment()` (`src/server/postgres.ts`) **recusa
rodar com `APP_ENV=production`** — isso é deliberado e não muda com
esta wave. `npm run db:migrate:supabase` continua sendo executado
manualmente (ou por um job de CI separado e deliberado, nunca pelo
build da Vercel), com `SUPABASE_DATABASE_URL` apontando para o banco
de produção mas `APP_ENV` **não** definido como `production` só para
essa execução pontual.

Ordem recomendada (mesma já registrada em `ci.yml`, adaptada ao
deploy atômico da Vercel — frontend e API sempre publicam juntos em
um único deploy, diferente do "backend depois frontend" hipotético de
uma topologia com dois hosts separados):

1. Rodar as migrations pendentes contra o banco de produção.
2. Disparar o deploy na Vercel (push em `main`, ou promoção manual de
   um preview já testado).
3. Confirmar `GET /api/ready` → `200 {"status":"ok"}` no domínio de
   produção.
4. Se `/api/ready` não responder OK, usar o rollback instantâneo da
   Vercel (seção 7) antes de investigar — nunca deixar o domínio de
   produção servindo uma versão com API fora do ar.

`npm run build` (usado pela Vercel) permanece **somente**
`tsc --noEmit && vite build` — nenhuma migration é executada durante o
build, de propósito.

## 6. Limitações conhecidas (registradas, não escondidas)

- **CSP do frontend estático**: os cabeçalhos declarados em
  `vercel.json` (seção 1) cobrem o que é estático e não depende de
  ambiente. Uma `Content-Security-Policy` completa para o HTML/JS
  servido pela CDN exigiria incluir a origem real do projeto Supabase
  (`VITE_SUPABASE_URL`) em `connect-src` — `vercel.json` não lê
  variáveis de ambiente em tempo de execução, então isso não foi
  hardcoded aqui (evita repetir, para o frontend estático, o mesmo erro
  que `src/server/http/security-headers.ts` já evita para `/api`:
  nunca um `project-ref` fixo/fictício). O CSP de `/api/*` (JSON,
  nunca HTML) já é gerado corretamente a partir da variável real, sem
  nenhuma mudança nesta wave. Se uma CSP completa do frontend for
  necessária, o caminho é gerar esse header a partir de uma variável
  de ambiente no momento do build (fora do escopo desta wave).
- **Cookie `Secure`**: continua estritamente `APP_ENV === "production"`
  (nunca `staging`) — contrato da Fase 29, fora do escopo alterar
  aqui. Como toda URL da Vercel é HTTPS (produção e preview), a
  ausência da flag `Secure` em preview (`APP_ENV=staging`) não expõe o
  cookie sobre um canal em texto claro (não existe HTTP simples nesses
  domínios) — é uma diferença cosmética de contrato, não uma
  vulnerabilidade nova.
- **Duração de execução da função**: o plano da Vercel determina o
  limite de duração de uma invocação (10s no plano Hobby; maior em
  planos pagos). Nenhuma rota hoje depende de processamento longo — a
  IA em produção usa deliberadamente `UnavailableProviderAdapter`
  (Fase 11) — mas isso deve ser reavaliado se/quando um provider real
  de IA for conectado.
- **Sem WebSocket/SSE**: confirmado, por inspeção, que nada em
  `src/server` usa `res.write` para streaming, `EventSource` ou
  `socket.io` — Serverless Functions da Vercel não sustentam conexões
  persistentes desse tipo. Se isso mudar no futuro, exige revisão
  desta arquitetura.

## 7. Rollback

A Vercel mantém cada deploy anterior imutável e acessível — "Promote
to Production" (ou `vercel rollback` via CLI) troca o deploy ativo
instantaneamente, sem rebuild. Nenhum mecanismo adicional foi criado
por esta wave; é a estratégia nativa da plataforma escolhida.

## 8. Checklist antes do primeiro deploy real

- [ ] Projeto Supabase de produção criado, com a connection string do
      **pooler** (porta 6543) em mãos.
- [ ] Migrations aplicadas contra esse banco (seção 5, passo 1).
- [ ] Todas as variáveis da seção 3 configuradas na Vercel, para
      **Production** e para **Preview**.
- [ ] `TRUSTED_FRONTEND_ORIGINS` de Production apontando para o
      domínio público real (custom domain, se houver, não o
      `*.vercel.app` gerado, caso um domínio próprio seja usado).
- [ ] Repositório GitHub conectado ao projeto Vercel (Import
      Project) — a própria Vercel builda e publica a cada push em
      `main` (Production) e a cada PR (Preview); nenhum job de CD
      adicional foi criado em `.github/workflows/ci.yml` para isso
      (a ADR-0027 já registrava essa decisão como "fica para quando o
      hosting real for decidido" — decidido agora, sem exigir um
      workflow próprio, já que a integração nativa da Vercel cobre
      exatamente esse gatilho).
- [ ] Após o primeiro deploy: `GET /api/ready` OK, e ao menos um
      fluxo público (`/vagas/:slug`) carregando com CSS aplicado
      (confirma que o rewrite de SPA fallback está correto).
- [ ] Primeiro Platform Admin criado — ver
      `docs/operacao/primeiro-platform-admin.md` (processo manual
      deliberado, sem rota HTTP equivalente).
