import "dotenv/config";
import { grantPlatformAdmin } from "./platform-admin-bootstrap";
import { createPostgresPool, redactDatabaseUrl, requirePostgresDatabaseUrl } from "./postgres";

// CLI para `grantPlatformAdmin()` (ver platform-admin-bootstrap.ts para o contrato completo e a
// justificativa: primeiro Platform Admin e um processo manual deliberadamente fora do fluxo
// HTTP, nunca uma rota da API).
//
// Pre-requisito: a pessoa ja precisa existir como usuario no Supabase Auth do PROJETO DE
// DESTINO (Dashboard -> Authentication -> Users -> Add user, com e-mail/senha reais). Copie o
// "User UID" mostrado ali para --external-id -- este script nunca cria/edita nada no Supabase
// Auth (nenhuma service-role key, nenhuma senha passa por aqui).
//
// Uso:
//   SUPABASE_DATABASE_URL="postgresql://...pooler...:6543/postgres?pgbouncer=true" \
//     npx tsx src/server/create-platform-admin.ts \
//     --email admin@admin.com.br --name "Admin" --external-id "<uid-do-supabase-auth>"
function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token.startsWith("--")) {
      args[token.slice(2)] = argv[index + 1] ?? "";
      index += 1;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.email || !args.name || !args["external-id"]) {
    console.error(
      'Uso: npx tsx src/server/create-platform-admin.ts --email "admin@dominio.com" --name "Nome" --external-id "<uid-do-supabase-auth>"'
    );
    process.exit(1);
  }

  const connectionString = requirePostgresDatabaseUrl();
  const pool = createPostgresPool(connectionString);

  try {
    const result = await grantPlatformAdmin(pool, {
      email: args.email,
      name: args.name,
      externalId: args["external-id"]
    });

    console.log(
      result.userCreated ? `User criado: ${result.userId}` : `User existente: ${result.userId}`
    );
    console.log(
      result.identityCreated
        ? "AuthIdentity criada, ligando ao Supabase Auth UID informado."
        : "AuthIdentity ja existia para este User."
    );
    console.log(
      result.grantedNow
        ? "Platform Admin concedido/reativado."
        : "User ja era Platform Admin ativo -- nada a fazer."
    );
    console.log(`\nBanco: ${redactDatabaseUrl(connectionString)}`);
    console.log(`Pronto. ${args.email} sera resolvido como Platform Admin ao fazer login.`);
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
