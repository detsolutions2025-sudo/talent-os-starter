import "dotenv/config";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createPostgresClient, redactDatabaseUrl, requirePostgresDatabaseUrl } from "../postgres";
import { countDumpRows, dumpSchema } from "./dump";
import { requireFlag, readFlag } from "./cli-args";

// Backup logico de leitura (SELECT apenas) -- deliberadamente NAO bloqueado por
// assertSafeMigrationEnvironment: ao contrario de migration/restore, rodar backup em producao e
// exatamente o uso real esperado (ver docs/operacao/backup-restore.md).
//
// Uso:
//   npm run db:backup -- --schema public --out-dir backups
//
// --schema e obrigatorio (sem default: o operador decide explicitamente o que esta salvando).
async function main() {
  const argv = process.argv.slice(2);
  const schema = requireFlag(argv, "schema");
  const outDir = readFlag(argv, "out-dir") ?? "backups";

  const connectionString = requirePostgresDatabaseUrl();
  const client = createPostgresClient(connectionString);
  await client.connect();

  try {
    const dump = await dumpSchema(client, schema);
    mkdirSync(outDir, { recursive: true });

    const fileName = `backup_${schema}_${dump.createdAt.replace(/[:.]/g, "-")}.json`;
    const filePath = resolve(outDir, fileName);

    if (existsSync(filePath)) {
      throw new Error(`Refusing to overwrite existing backup file: ${filePath}`);
    }

    writeFileSync(filePath, JSON.stringify(dump), "utf8");

    console.log(
      `Backup written to ${filePath} (schema="${schema}", tables=${dump.tableOrder.length}, ` +
        `rows=${countDumpRows(dump)}, source=${redactDatabaseUrl(connectionString)})`
    );
  } finally {
    await client.end();
  }
}

main().catch((error: Error) => {
  console.error(`Backup failed: ${error.message}`);
  process.exitCode = 1;
});
