import type { IncomingMessage, ServerResponse } from "node:http";
import { buildApp } from "./bootstrap";

// Fonte da Serverless Function da Vercel para toda a API (`/api/*` -- ver os `rewrites` em
// `vercel.json`, que encaminham qualquer requisicao sob `/api/` para a function preservando o
// path original, exatamente o que `createServer()` espera: suas rotas ja sao montadas com
// `app.use("/api", ...)`, ver `src/server/app.ts`).
//
// Corrigido apos falha real em producao (primeiro deploy): a Vercel executa Node ESM nativo
// para funcoes TypeScript deste projeto (`"type": "module"` no package.json raiz) -- ao
// contrario de `tsx`/Vite/Vitest (que resolvem imports relativos sem extensao via bundler), o
// loader ESM nativo do Node EXIGE extensao explicita em todo import relativo, e este projeto
// inteiro (`src/server/**`) usa imports sem extensao. O resultado real observado foi
// `ERR_MODULE_NOT_FOUND: Cannot find module '/var/task/src/server/bootstrap'` em toda
// invocacao, inclusive `/api/health` (rota estatica, sem nenhuma dependencia de configuracao).
//
// Em vez de reescrever import relativo de ~200 arquivos de `src/server/**` (risco alto, sem
// beneficio para o processo tradicional que usa `tsx`), este arquivo e compilado para
// `api/index.js` por esbuild (`npm run build:api`, parte de `npm run build`) ANTES do deploy --
// um unico arquivo autocontido, com todo `src/server/**` já resolvido/embutido e apenas os
// pacotes de `node_modules` (express, pg, jose, ...) deixados de fora (`--packages=external`,
// resolvidos normalmente pelo Node em runtime). `api/index.ts` nunca existe como arquivo -- só
// o `.js` gerado, gitignored, ver `.gitignore`/`package.json`.
//
// `buildApp()` roda em escopo de MODULO (fora do handler), nao a cada requisicao: a Vercel
// reutiliza a mesma instancia de container ("warm") entre invocacoes proximas no tempo, entao o
// pool do Postgres e todos os servicos sao construidos uma unica vez por container e reutilizados
// -- nunca recriados por requisicao. Se a configuracao obrigatoria de producao/staging estiver
// ausente, `buildApp()` lanca de forma sincrona aqui (mesma garantia de `assertProductionConfig`
// usada pelo entrypoint tradicional, `src/server/index.ts`) e a Vercel reporta a falha da
// invocacao -- nunca uma API respondendo com configuracao invalida silenciosa.
//
// `max` de pool reduzido deliberadamente: cada instancia de function serverless mantem seu
// PROPRIO pool; a concorrencia real vem de escalar o NUMERO de instancias (Vercel), nao do
// tamanho do pool dentro de uma unica instancia. Ver docs/operacao/deploy-vercel.md para a
// recomendacao de usar a connection string do PgBouncer/pooler do Supabase (porta 6543) em
// producao -- nunca a conexao direta (porta 5432), que tem um limite baixo de conexoes
// simultaneas incompativel com o numero de instancias que a Vercel pode escalar sob carga.
const { app } = buildApp({ poolOptions: { max: 3 } });

export default function handler(request: IncomingMessage, response: ServerResponse) {
  // Um app Express e, em si, uma funcao `(req, res) => void` compativel com a assinatura que a
  // Vercel invoca -- nenhum adaptador/dependencia adicional (`@vercel/node` ou similar) e
  // necessaria: os objetos que a Vercel passa aqui estendem `IncomingMessage`/`ServerResponse`
  // nativos do Node, que e tudo que o Express precisa.
  app(request, response);
}
