import "dotenv/config";
import { readFileSync } from "node:fs";
import { createPostgresClient, redactDatabaseUrl, requirePostgresDatabaseUrl } from "../postgres";
import type { SchemaDump } from "./dump";
import { assertTargetIsEmpty, restoreSchema } from "./restore";
import { requireFlag } from "./cli-args";

// Nomes que nunca podem ser o alvo de um restore, independentemente de flag: sao schemas
// conhecidos como compartilhados/reais, nunca "descartaveis criados para a recuperacao".
const BLOCKED_TARGET_SCHEMAS = new Set(["public"]);

// Restore requer TRES coisas explicitas, nunca inferidas: o arquivo, o schema alvo, e uma
// confirmacao digitada igual ao schema alvo (protege contra copiar/colar o --target-schema
// errado). Alem disso, assertTargetIsEmpty (chamado abaixo) e o guarda mecanico real: o schema
// alvo precisa ja existir com as tabelas migradas e vazias -- nunca dados reais por baixo.
//
// Este script NAO bloqueia por APP_ENV=production: um restore real de disaster recovery
// acontece exatamente em producao, sempre para um schema novo e vazio criado so para a
// recuperacao (nunca sobrescrevendo o schema em uso) -- ver docs/operacao/backup-restore.md.
//
// Uso:
//   npm run db:restore -- --file backups/backup_x.json --target-schema recovery_2026_09_17 \
//     --confirm-target recovery_2026_09_17
async function main() {
  const argv = process.argv.slice(2);
  const file = requireFlag(argv, "file");
  const targetSchema = requireFlag(argv, "target-schema");
  const confirmTarget = requireFlag(argv, "confirm-target");

  if (confirmTarget !== targetSchema) {
    throw new Error(
      "--confirm-target must match --target-schema exactly (typed confirmation required)."
    );
  }
  if (BLOCKED_TARGET_SCHEMAS.has(targetSchema)) {
    throw new Error(
      `Refusing to restore into schema "${targetSchema}" -- this name is blocked as a known ` +
        "shared/real target. Restore only into a dedicated, disposable schema created for recovery."
    );
  }

  const dump = JSON.parse(readFileSync(file, "utf8")) as SchemaDump;

  const connectionString = requirePostgresDatabaseUrl();
  const client = createPostgresClient(connectionString);
  await client.connect();

  try {
    await assertTargetIsEmpty(client, targetSchema, dump);
    await restoreSchema(client, targetSchema, dump);

    console.log(
      `Restore completed into schema "${targetSchema}" from ${file} ` +
        `(${redactDatabaseUrl(connectionString)}).`
    );
  } finally {
    await client.end();
  }
}

main().catch((error: Error) => {
  console.error(`Restore failed: ${error.message}`);
  process.exitCode = 1;
});
