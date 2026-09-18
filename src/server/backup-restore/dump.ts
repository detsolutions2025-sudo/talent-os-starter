import {
  getForeignKeyDependencies,
  getSelfReferenceForeignKeys,
  listColumnsForAllTables,
  listTablesInSchema,
  topologicalSort,
  type QueryableClient,
  type SelfReferenceForeignKey
} from "./schema-introspection";
import { sortRowsBySelfReference } from "./row-ordering";

export type TableDump = {
  columns: string[];
  rows: Record<string, unknown>[];
};

export type SchemaDump = {
  formatVersion: 1;
  createdAt: string;
  schema: string;
  tableOrder: string[];
  tables: Record<string, TableDump>;
  // FKs de uma tabela para ela mesma, por tabela -- guardadas no proprio dump (em vez de
  // recalculadas so no momento do restore) para que o arquivo seja auto-descritivo e para que o
  // restore possa reaplicar a mesma ordenacao como defesa em profundidade (ver restore.ts).
  selfReferenceForeignKeys: Record<string, SelfReferenceForeignKey[]>;
};

// Backup logico: para cada tabela do schema (na ordem em que pode ser restaurada sem violar FK
// entre tabelas distintas), le todas as linhas via SELECT * e guarda como JSON simples (linhas +
// nomes de coluna). Deliberadamente NAO gera SQL textual -- o restore usa INSERT parametrizado,
// entao nao existe escaping manual de literal em nenhum dos dois lados.
//
// Para uma tabela com FK auto-referenciada (ex.: organizational_units.parent_id -> o proprio
// id), o SELECT nao tem NENHUMA garantia de ordem (Postgres pode devolver as linhas em qualquer
// sequencia fisica) -- por isso o dump ordena essas linhas explicitamente por dependencia
// (pai antes de filho) antes de grava-las, em vez de depender da ordem incidental do SELECT.
export async function dumpSchema(client: QueryableClient, schema: string): Promise<SchemaDump> {
  const tables = await listTablesInSchema(client, schema);
  const dependencies = await getForeignKeyDependencies(client, schema);
  const tableOrder = topologicalSort(tables, dependencies);
  const columnsByTable = await listColumnsForAllTables(client, schema);
  const selfReferenceForeignKeysByTable = await getSelfReferenceForeignKeys(client, schema);

  const tablesDump: Record<string, TableDump> = {};
  const selfReferenceForeignKeys: Record<string, SelfReferenceForeignKey[]> = {};
  for (const table of tableOrder) {
    const columns = columnsByTable.get(table) ?? [];
    const result = await client.query(`SELECT * FROM "${schema}"."${table}"`);
    const tableSelfReferenceForeignKeys = selfReferenceForeignKeysByTable.get(table) ?? [];

    tablesDump[table] = {
      columns,
      rows: sortRowsBySelfReference(table, result.rows, tableSelfReferenceForeignKeys)
    };
    if (tableSelfReferenceForeignKeys.length > 0) {
      selfReferenceForeignKeys[table] = tableSelfReferenceForeignKeys;
    }
  }

  return {
    formatVersion: 1,
    createdAt: new Date().toISOString(),
    schema,
    tableOrder,
    tables: tablesDump,
    selfReferenceForeignKeys
  };
}

export function countDumpRows(dump: SchemaDump): number {
  return Object.values(dump.tables).reduce((sum, table) => sum + table.rows.length, 0);
}
