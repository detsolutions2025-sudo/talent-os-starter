// Fase 31 (ADR-0027; SPEC-030 v1.0, secao 7.6). CORS montado incondicionalmente em `app.ts` --
// com a lista de origens vazia (Modo A, default de `createServer()`), o delegate abaixo nunca
// aprova nenhuma origem, entao nenhum header `Access-Control-*` e emitido para nenhuma
// requisicao real; um preflight `OPTIONS` de qualquer origem recebe uma resposta sem
// `Access-Control-Allow-Origin`, que o navegador trata como negado (RN-035), sem exigir nenhuma
// mudanca de regra de negocio (RN-033). Isso preserva, sem nenhum efeito colateral, todo o
// comportamento de todos os ~30 arquivos de teste existentes que chamam `createServer()` sem
// conhecer este parametro.
import cors, { type CorsOptions, type CorsOptionsDelegate } from "cors";
import type { Request } from "express";

// RN-028: inventario real de verbos usados pela API (9 rotas PUT/DELETE reais confirmadas na
// SPEC, secao 20) -- nunca a lista desatualizada (GET/POST/PATCH) citada por engano em ADR-0027
// secao 7. Revisar nesta constante a cada mudanca real de inventario (RN-028/INV-06), nunca por
// conveniencia/simetria.
const ALLOWED_METHODS = ["GET", "POST", "PATCH", "PUT", "DELETE"];

// RN-029: cabecalhos realmente enviados pelo frontend -- `Content-Type` (toda mutacao),
// `Idempotency-Key` (Fase 17/29, mutacoes idempotentes), `Authorization` (rotas token-based da
// classe D: Pre-Entrevista, Avaliacao Comportamental, Proposta). Nunca um wildcard.
const ALLOWED_HEADERS = ["Content-Type", "Idempotency-Key", "Authorization"];

// INV-02/RN-030/RN-032: `credentials` e computado POR REQUISICAO, nunca como `true` estatico --
// o pacote `cors`, quando `credentials: true` e passado de forma estatica, emite
// `Access-Control-Allow-Credentials: true` em TODA resposta, mesmo para uma origem nao aprovada
// (a ausencia de `Access-Control-Allow-Origin` ainda bloqueia o navegador nesse caso, mas RN-032
// exige explicitamente que o header de credentials so seja enviado quando a origem corresponde
// exatamente a uma entrada configurada). O delegate por requisicao abaixo resolve isso: quando a
// origem nao e aprovada, nem `Access-Control-Allow-Origin` nem `Access-Control-Allow-Credentials`
// sao enviados.
export function createCorsOptionsDelegate(
  trustedOrigins: ReadonlySet<string>
): CorsOptionsDelegate<Request> {
  return (request, callback) => {
    const origin = request.header("Origin");
    // RN-031: igualdade exata contra a lista configurada -- nunca prefixo/sufixo/substring/regex.
    // `Origin: null` (RN-019) e qualquer origem ausente nunca casam com nenhuma entrada real.
    const isAllowed = origin !== undefined && trustedOrigins.has(origin);

    const options: CorsOptions = {
      // `origin: true` faz o pacote `cors` refletir de volta o `Origin` exato da requisicao
      // (nunca `*`) -- combinado com `credentials` computado abaixo, satisfaz INV-02/RN-030
      // estruturalmente (fisicamente impossivel responder `*` + credentials por este caminho).
      origin: isAllowed,
      credentials: isAllowed,
      methods: ALLOWED_METHODS,
      allowedHeaders: ALLOWED_HEADERS
    };
    callback(null, options);
  };
}

export function createCorsMiddleware(trustedOrigins: ReadonlySet<string>) {
  return cors(createCorsOptionsDelegate(trustedOrigins));
}
