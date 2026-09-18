import type { IncomingMessage, ServerResponse } from "node:http";
import { buildApp } from "../src/server/bootstrap";

// Entrypoint da Serverless Function do Vercel para toda a API (`/api/*` -- ver os `rewrites` em
// `vercel.json`, que encaminham qualquer requisicao sob `/api/` para ESTE arquivo preservando o
// path original, exatamente o que `createServer()` espera: suas rotas ja sao montadas com
// `app.use("/api", ...)`, ver `src/server/app.ts`).
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
