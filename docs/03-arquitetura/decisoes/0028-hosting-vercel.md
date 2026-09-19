# ADR 0028 - Hosting em Vercel

## Status

Aceita.

## Contexto

A ADR-0027 (seção 4, "Estratégia de Deploy") implementou toda a
prontidão operacional de código (CI/CD, security headers, CORS/CSRF,
observabilidade, rate limiting distribuído, backup/restore) mas
deliberadamente deixou o hosting em aberto: _"Hosting específico: não
decidido nesta ADR. Registrado como decisão separada, condicionada ao
plano técnico de cada sub-frente."_ Até este ponto, o projeto nunca
teve um processo de produção operado — nenhum `Dockerfile`, nenhum
script `start`, nenhum `vercel.json`, nenhuma configuração de hosting
de nenhum tipo existia no repositório.

Esta ADR decide: **Vercel**, com o frontend estático e a API como uma
única Serverless Function, no mesmo domínio (Modo A / mesma origem —
o modo que `src/server/http/trusted-origins.ts` já documentava desde a
Fase 31, sem nenhuma mudança de código necessária para ele).

## Alternativas consideradas

- **Processo Node tradicional (VPS/container) atrás de um proxy que
  também sirva o frontend estático.** Mais próximo do modelo "processo
  de longa duração" que a ADR-0027 assumia implicitamente (graceful
  shutdown, `app.listen()`). Descartado por exigir infraestrutura
  operada (imagem, orquestração, TLS, proxy) que este projeto não tem
  hoje e que a Vercel substitui sem custo de manutenção adicional.
- **Frontend na Vercel + backend em outro provedor (Modo B, origens
  distintas).** Também já suportado pelo código (CORS credenciado
  existe exatamente para isso). Descartado por introduzir uma segunda
  conta/provedor e uma superfície de CORS cross-origin real sem
  necessidade concreta hoje — Modo A é estritamente mais simples e o
  código já foi desenhado pensando nele como caminho preferencial.
- **Vercel com o backend inteiro reescrito em funções serverless
  nativas (uma função por rota).** Descartado: o roteador Express
  (`src/server/http/routes.ts`, ~280 rotas) já existe, é testado
  (centenas de testes de integração) e uma função Node aceita um app
  Express inteiro como handler sem nenhuma reescrita — reescrever rota
  por rota seria puro retrabalho sem ganho.

## Decisão

- Uma única Serverless Function (`api/index.ts`) recebe todo o
  tráfego de `/api/*` via `rewrites` (`vercel.json`) e delega
  integralmente ao `express()` já existente (`src/server/app.ts`,
  inalterado).
- `src/server/index.ts` (processo tradicional) e `api/index.ts`
  (Vercel) compartilham a mesma sequência de boot, extraída para
  `src/server/bootstrap.ts` (`buildApp()`) — nenhuma duplicação de
  lógica de configuração/segurança entre os dois entrypoints.
- Pool do Postgres dimensionado para o modelo serverless (`max: 3` por
  instância de função) — concorrência real vem de escalar o número de
  instâncias, não do tamanho de um pool único. Recomendação
  operacional: usar o connection pooler do Supabase (porta 6543) em
  produção — ver `docs/operacao/deploy-vercel.md` seção 4.
- **Ordem de deploy adaptada ao modelo atômico da Vercel**: a ADR-0027
  descrevia "migrations → deploy do backend → verificação de saúde →
  deploy do frontend" assumindo dois deploys separados. A Vercel
  publica frontend e API juntos, em um único deploy atômico — a ordem
  passa a ser "migrations (manual, antes) → deploy único → verificação
  de `/api/ready`", preservando a garantia real que a ADR-0027 buscava
  (nenhum código novo rodando contra um schema que ele ainda não
  espera) sem depender de uma topologia de dois hosts que este
  provedor não tem.
- Nenhuma variável de ambiente nova foi introduzida — apenas onde/como
  preencher as já existentes (`.env.example`, `docs/operacao/deploy-vercel.md`).
- Nenhum job de CD foi adicionado a `.github/workflows/ci.yml`: a
  integração nativa Git da Vercel (deploy automático por push/PR) já
  cobre exatamente o gatilho que um job customizado replicaria, sem
  necessidade de segredos de deploy no GitHub Actions.

## Consequências

- **Positivas**: zero infraestrutura operada manualmente (TLS,
  proxy, orquestração, scaling); rollback instantâneo nativo da
  plataforma; preview deployments automáticos por PR: reaproveita
  investimento já feito em CORS/CSRF Modo A/B, rate limiting
  distribuído via Postgres (compatível com múltiplas instâncias por
  construção) e configuração fail-fast (`assertProductionConfig`).
- **Negativas / limitações aceitas conscientemente** (detalhadas em
  `docs/operacao/deploy-vercel.md` seção 6): CSP completo do frontend
  estático não é gerado automaticamente (a origem real do Supabase é
  só conhecida em runtime, `vercel.json` não lê variáveis de
  ambiente); cookie `Secure` continua estritamente `APP_ENV=production`
  (contrato da Fase 29, não alterado); duração de execução de uma
  invocação de função é limitada pelo plano contratado; sem suporte a
  WebSocket/SSE (não usado por nenhuma rota hoje, confirmado por
  inspeção física).
- **Nenhuma mudança de comportamento observável do processo
  tradicional** (`src/server/index.ts`) — provado por
  `tests/phase30/bootstrap-smoke.test.ts`, que continua passando sem
  nenhuma alteração de expectativa.

## Revisão destrutiva: primeiro deploy real quebrou

O primeiro deploy real falhou em toda invocação (`FUNCTION_INVOCATION_FAILED`
/ `ERR_MODULE_NOT_FOUND: Cannot find module '.../src/server/bootstrap'`),
inclusive `/api/health`. Causa: a Vercel roda a function como Node ESM
nativo, que exige extensão explícita em todo import relativo — ausente
em `src/server/**` inteiro (estilo válido sob `tsx`/Vite/Vitest, que
resolvem isso via bundler, mas não sob o loader nativo do Node). Correção:
a fonte da function foi movida para `src/server/vercel-entry.ts` e passa a
ser **compilada** por `esbuild` (`npm run build:api`, parte de `npm run
build`) num único arquivo autocontido (`api/index.js`, gerado, gitignored,
nunca versionado) — nenhuma linha de `src/server/**` foi reescrita. Ver
`docs/operacao/deploy-vercel.md` seção 2.1 para o detalhe completo, e
`tests/ci/vercel-api-bundle.test.ts` para a prova (builda o mesmo bundle e
roda sob `node` puro, nunca `tsx`/Vitest — a única forma de reproduzir essa
classe de bug antes de um deploy real).

## Impacto no Código

`src/server/bootstrap.ts` (novo), `src/server/index.ts` (refatorado,
comportamento preservado), `src/server/vercel-entry.ts` (novo, fonte
da function), `vercel.json`, `.vercelignore` (novos), `package.json`
(`engines.node`, `esbuild` como devDependency, script `build:api`),
`tsconfig.json` e `eslint.config.js` (ajustados para a nova
localização da fonte; `api/` gerado e ignorado por ambos). Nenhuma
migration, nenhuma mudança de RBAC/tenant/lifecycle/rate
limiting/Auth. Única dependência nova: `esbuild`, devDependency,
necessária para compilar a function antes do deploy (ver revisão
destrutiva acima).
