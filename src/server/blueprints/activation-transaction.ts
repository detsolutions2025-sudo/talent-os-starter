import type { BlueprintTransaction } from "./transaction";

// Mesma forma de BlueprintTransactionRunner, mas a implementacao Postgres (ver
// persistence/postgres-blueprint-repository.ts, `createPostgresBlueprintService`) abre a
// transacao com `BEGIN ISOLATION LEVEL REPEATABLE READ` em vez do `BEGIN` simples
// (READ COMMITTED, o default usado por todo o resto do projeto). Usado exclusivamente pela
// ativacao (Plano Tecnico Revisado, item 7): garante que a mesma consulta aos componentes
// resolvidos usada por `calculateReadiness` e por `buildManifestItems` nunca observe um
// estado intermediario mesmo se o codigo futuramente precisar reconsultar algum modulo dentro
// da mesma transacao.
export type BlueprintActivationTransactionRunner = <T>(
  callback: (transaction: BlueprintTransaction) => Promise<T>
) => Promise<T>;
