// Toda introspeccao abaixo le apenas nomes de schema/tabela/coluna ja catalogados pelo proprio
// Postgres (information_schema) -- nunca interpola texto vindo de fora do banco. Interpolar
// esses nomes de volta em SQL (dump.ts/restore.ts) e seguro pelo mesmo motivo.

// Interface minima e explicita (em vez de importar Client/Pool de "pg") -- assim tanto um
// Client dedicado (usado pelos scripts de CLI) quanto um Pool ja aberto (reaproveitado pelo
// teste de backup->restore via createPostgresTestDatabase) satisfazem este tipo estruturalmente,
// sem depender de unificar os overloads reais de node-postgres.
export type QueryableClient = {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: unknown[]
  ): Promise<{ rows: T[]; rowCount: number | null }>;
};

// "schema_migrations" (src/server/migrations.ts) e bookkeeping do PROPRIO runner de migrations,
// nunca dado de dominio: toda schema recem-migrada -- inclusive um alvo de restore corretamente
// preparado -- ja tem linhas ali por construcao propria. Trata-la como tabela normal faria
// qualquer restore ser recusado por "destino nao vazio" mesmo num destino genuinamente vazio de
// dados reais, e faria o dump duplicar/colidir esse historico ao restaurar. Por isso e excluida
// aqui, no unico ponto que lista tabelas para dump/verificacao/restore.
const INFRASTRUCTURE_TABLES = new Set(["schema_migrations"]);

export async function listTablesInSchema(
  client: QueryableClient,
  schema: string
): Promise<string[]> {
  const result = await client.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = $1 AND table_type = 'BASE TABLE'
       AND table_name <> ALL($2::text[])
     ORDER BY table_name`,
    [schema, [...INFRASTRUCTURE_TABLES]]
  );

  return result.rows.map((row) => row.table_name);
}

export async function listColumnsForTable(
  client: QueryableClient,
  schema: string,
  table: string
): Promise<string[]> {
  const result = await client.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = $1 AND table_name = $2
     ORDER BY ordinal_position`,
    [schema, table]
  );

  return result.rows.map((row) => row.column_name);
}

// Uma unica ida ao banco para as colunas de TODAS as tabelas do schema, em vez de uma consulta
// por tabela -- o schema real deste projeto tem dezenas de tabelas, e cada round-trip pesa
// latencia de rede real contra o Postgres remoto (Supabase). Usada por dumpSchema.
export async function listColumnsForAllTables(
  client: QueryableClient,
  schema: string
): Promise<Map<string, string[]>> {
  const result = await client.query<{ table_name: string; column_name: string }>(
    `SELECT table_name, column_name FROM information_schema.columns
     WHERE table_schema = $1
     ORDER BY table_name, ordinal_position`,
    [schema]
  );

  const columnsByTable = new Map<string, string[]>();
  for (const row of result.rows) {
    if (!columnsByTable.has(row.table_name)) {
      columnsByTable.set(row.table_name, []);
    }
    columnsByTable.get(row.table_name)!.push(row.column_name);
  }
  return columnsByTable;
}

// Para cada tabela, o conjunto de OUTRAS tabelas (no mesmo schema) para as quais ela tem uma FK.
// Auto-referencias (ex.: organizational_units.parent_id -> organizational_units.id) sao
// deliberadamente excluidas: elas nunca afetam a ordem relativa entre duas tabelas diferentes.
// A ordem das LINHAS dentro de uma tabela auto-referenciada e resolvida a parte, por
// getSelfReferenceForeignKeys + row-ordering.ts.
export async function getForeignKeyDependencies(
  client: QueryableClient,
  schema: string
): Promise<Map<string, Set<string>>> {
  const result = await client.query<{ table_name: string; foreign_table_name: string }>(
    `SELECT DISTINCT
       tc.table_name AS table_name,
       ccu.table_name AS foreign_table_name
     FROM information_schema.table_constraints tc
     JOIN information_schema.constraint_column_usage ccu
       ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
     WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = $1`,
    [schema]
  );

  const deps = new Map<string, Set<string>>();
  for (const row of result.rows) {
    if (row.table_name === row.foreign_table_name) continue;
    if (!deps.has(row.table_name)) {
      deps.set(row.table_name, new Set());
    }
    deps.get(row.table_name)!.add(row.foreign_table_name);
  }
  return deps;
}

// Kahn/DFS topologico: tabelas referenciadas aparecem antes de quem as referencia, para que o
// restore possa inserir na mesma ordem sem violar nenhuma FK. Um ciclo entre tabelas distintas
// nao e esperado neste schema (auto-referencias ja foram filtradas acima); se ocorrer, o guarda
// de pilha abaixo evita loop infinito e apenas deixa a tabela na posicao em que foi visitada.
export function topologicalSort(tables: string[], deps: Map<string, Set<string>>): string[] {
  const visited = new Set<string>();
  const result: string[] = [];

  function visit(table: string, stack: Set<string>) {
    if (visited.has(table) || stack.has(table)) return;
    stack.add(table);
    for (const dependency of deps.get(table) ?? []) {
      if (tables.includes(dependency)) {
        visit(dependency, stack);
      }
    }
    stack.delete(table);
    visited.add(table);
    result.push(table);
  }

  for (const table of tables) {
    visit(table, new Set());
  }

  return result;
}

export type SelfReferenceForeignKeyRow = {
  table_name: string;
  local_columns: string[];
  referenced_columns: string[];
};

export type SelfReferenceForeignKey = {
  localColumns: string[];
  referencedColumns: string[];
};

// Detecta genericamente qualquer FK de uma tabela para ELA MESMA (simples ou composta), com as
// colunas local/referenciada corretamente pareadas por posicao -- por isso usa os catalogos
// nativos do Postgres (pg_constraint.conkey/confkey, que preservam essa ordem) em vez de
// information_schema.key_column_usage/constraint_column_usage, que NAO garantem correlacionar a
// posicao da coluna local com a da coluna referenciada para uma FK composta (a organizational_units,
// por exemplo: FOREIGN KEY (organization_id, parent_id) REFERENCES organizational_units
// (organization_id, id) -- sem essa ordem, "parent_id" poderia ser incorretamente pareada com
// "organization_id"). Nao especifico de organizational_units: funciona para qualquer tabela cuja
// FK aponte para si mesma.
export async function getSelfReferenceForeignKeys(
  client: QueryableClient,
  schema: string
): Promise<Map<string, SelfReferenceForeignKey[]>> {
  const result = await client.query<SelfReferenceForeignKeyRow>(
    `SELECT
       rel.relname AS table_name,
       (
         SELECT array_agg(att.attname::text ORDER BY u.ord)
         FROM unnest(con.conkey) WITH ORDINALITY AS u(attnum, ord)
         JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = u.attnum
       ) AS local_columns,
       (
         SELECT array_agg(att.attname::text ORDER BY u.ord)
         FROM unnest(con.confkey) WITH ORDINALITY AS u(attnum, ord)
         JOIN pg_attribute att ON att.attrelid = con.confrelid AND att.attnum = u.attnum
       ) AS referenced_columns
     FROM pg_constraint con
     JOIN pg_class rel ON rel.oid = con.conrelid
     JOIN pg_namespace ns ON ns.oid = rel.relnamespace
     WHERE con.contype = 'f' AND con.conrelid = con.confrelid AND ns.nspname = $1
     ORDER BY table_name`,
    [schema]
  );

  const byTable = new Map<string, SelfReferenceForeignKey[]>();
  for (const row of result.rows) {
    if (!byTable.has(row.table_name)) {
      byTable.set(row.table_name, []);
    }
    byTable.get(row.table_name)!.push({
      localColumns: row.local_columns,
      referencedColumns: row.referenced_columns
    });
  }
  return byTable;
}
