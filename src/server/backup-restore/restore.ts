import type { SchemaDump } from "./dump";
import { listTablesInSchema, type QueryableClient } from "./schema-introspection";
import { sortRowsBySelfReference } from "./row-ordering";

export class RestoreTargetNotEmptyError extends Error {
  constructor(
    public readonly table: string,
    public readonly schema: string
  ) {
    super(
      `Refusing to restore into "${schema}"."${table}": it already has rows. Restore only ` +
        "targets an empty schema created fresh for recovery (see docs/operacao/backup-restore.md)."
    );
    this.name = "RestoreTargetNotEmptyError";
  }
}

export class RestoreTargetMissingError extends Error {
  constructor(
    public readonly table: string,
    public readonly schema: string
  ) {
    super(
      `Refusing to restore into "${schema}"."${table}": the table does not exist there. Apply ` +
        "migrations to the target schema before restoring."
    );
    this.name = "RestoreTargetMissingError";
  }
}

// Falha fechado por padrao: se qualquer tabela do dump ja tiver linhas no destino, o restore
// para antes de inserir qualquer coisa. Isso e o que garante, mecanicamente, que o destino e
// realmente um schema vazio recem-criado -- nao depende de o operador "saber" se o destino e
// seguro (INV central deste modulo).
export async function assertTargetIsEmpty(
  client: QueryableClient,
  targetSchema: string,
  dump: SchemaDump
) {
  const existingTables = new Set(await listTablesInSchema(client, targetSchema));

  for (const table of dump.tableOrder) {
    if (!existingTables.has(table)) {
      throw new RestoreTargetMissingError(table, targetSchema);
    }
    const result = await client.query(`SELECT 1 FROM "${targetSchema}"."${table}" LIMIT 1`);
    if ((result.rowCount ?? 0) > 0) {
      throw new RestoreTargetNotEmptyError(table, targetSchema);
    }
  }
}

function toQueryValue(value: unknown): unknown {
  if (value !== null && typeof value === "object" && !(value instanceof Date)) {
    // jsonb/json colunas voltam do SELECT ja como objeto JS; o driver pg nao serializa objetos
    // arbitrarios automaticamente ao usa-los como parametro, entao stringificamos explicitamente.
    return JSON.stringify(value);
  }
  return value;
}

// Requer que o schema alvo ja exista com as tabelas migradas e vazias (assertTargetIsEmpty deve
// ser chamado antes por quem invoca esta funcao). Insere na ordem topologica do dump para nunca
// violar uma FK entre tabelas distintas.
//
// Para uma tabela com FK auto-referenciada, reaplica sortRowsBySelfReference antes de inserir --
// defesa em profundidade (idempotente se o dump ja veio ordenado por dumpSchema): protege tambem
// um arquivo de dump editado a mao ou vindo de outra fonte, sem exigir confiar cegamente na
// ordem ja gravada no JSON.
export async function restoreSchema(
  client: QueryableClient,
  targetSchema: string,
  dump: SchemaDump
) {
  for (const table of dump.tableOrder) {
    const tableDump = dump.tables[table];
    if (!tableDump || tableDump.rows.length === 0) continue;

    const rows = sortRowsBySelfReference(
      table,
      tableDump.rows,
      dump.selfReferenceForeignKeys?.[table] ?? []
    );

    const columnList = tableDump.columns.map((column) => `"${column}"`).join(", ");
    const placeholders = tableDump.columns.map((_, index) => `$${index + 1}`).join(", ");
    const insertSql = `INSERT INTO "${targetSchema}"."${table}" (${columnList}) VALUES (${placeholders})`;

    for (const row of rows) {
      const values = tableDump.columns.map((column) => toQueryValue(row[column]));
      await client.query(insertSql, values);
    }
  }
}
