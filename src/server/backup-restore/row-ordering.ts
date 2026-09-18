import type { SelfReferenceForeignKey } from "./schema-introspection";

export class RowCycleError extends Error {
  constructor(
    public readonly table: string,
    public readonly rowIndexes: number[]
  ) {
    super(
      `Refusing to order rows of "${table}": rows ${rowIndexes.join(" -> ")} form a self-` +
        "reference cycle (no row can come before all the rows it depends on). Restore refuses " +
        "to insert this table -- fix the cyclic data before backing it up again."
    );
    this.name = "RowCycleError";
  }
}

function keyOf(row: Record<string, unknown>, columns: string[]): string | null {
  const parts: unknown[] = [];
  for (const column of columns) {
    const value = row[column];
    // Postgres nunca aplica uma FK composta quando QUALQUER coluna local e NULL -- a linha
    // simplesmente nao tem dependencia nenhuma por essa FK (e o caso normal de uma raiz de
    // hierarquia, ex.: organizational_units com parent_id NULL).
    if (value === null || value === undefined) return null;
    parts.push(value);
  }
  // JSON.stringify de um array e uma chave inequivoca (nunca precisa de separador manual entre
  // as partes, o que evitou um bug real: um separador de controle escrito por engano virou um
  // byte NUL literal no arquivo fonte na primeira versao deste modulo).
  return JSON.stringify(parts);
}

// Ordena as linhas de UMA tabela para que uma linha "pai" (referenciada por FK
// auto-referenciada) sempre apareca antes de quem a referencia -- o dump nao pode confiar na
// ordem incidental devolvida pelo SELECT (Postgres nao garante nenhuma ordem sem ORDER BY).
// Generico para qualquer FK auto-referenciada (simples ou composta) detectada pela introspeccao
// de schema, nao apenas organizational_units.
//
// Falha fechada em vez de tentar contornar: se as linhas formarem um ciclo (so alcancavel via
// UPDATE, ja que o INSERT original sempre respeitou a FK -- ver comentario em dump.ts), lanca
// RowCycleError em vez de produzir uma ordem parcial ou ignorar a dependencia.
export function sortRowsBySelfReference(
  table: string,
  rows: Record<string, unknown>[],
  selfReferenceForeignKeys: SelfReferenceForeignKey[]
): Record<string, unknown>[] {
  // Nao usa "rows.length <= 1" como atalho: mesmo uma unica linha pode apontar para um pai
  // ausente do dump (inconsistencia que deve ser detectada aqui, nao so na hora do INSERT real).
  if (selfReferenceForeignKeys.length === 0) {
    return rows;
  }

  // Para cada definicao de FK, um indice de "linhas que podem ser pai" por chave (colunas
  // referenciadas). A UNIQUE/PK que toda FK exige garante no maximo uma linha por chave.
  const parentIndexByForeignKey = selfReferenceForeignKeys.map((foreignKey) => {
    const index = new Map<string, number>();
    rows.forEach((row, rowIndex) => {
      const key = keyOf(row, foreignKey.referencedColumns);
      if (key !== null) index.set(key, rowIndex);
    });
    return index;
  });

  const dependsOn = new Map<number, Set<number>>();
  rows.forEach((row, rowIndex) => {
    selfReferenceForeignKeys.forEach((foreignKey, foreignKeyIndex) => {
      const localKey = keyOf(row, foreignKey.localColumns);
      if (localKey === null) return;

      const parentIndex = parentIndexByForeignKey[foreignKeyIndex].get(localKey);
      if (parentIndex === undefined) {
        throw new Error(
          `Self-reference row ordering for "${table}": row ${rowIndex} points to a parent ` +
            `(${foreignKey.localColumns.join(",")}) that does not exist in this dump -- the ` +
            "dump is inconsistent with the source database's own foreign key."
        );
      }
      if (parentIndex === rowIndex) return; // uma linha que aponta para si mesma nao precisa de ordem

      if (!dependsOn.has(rowIndex)) {
        dependsOn.set(rowIndex, new Set());
      }
      dependsOn.get(rowIndex)!.add(parentIndex);
    });
  });

  const NOT_VISITED = 0;
  const IN_PROGRESS = 1;
  const DONE = 2;
  const state = new Array<0 | 1 | 2>(rows.length).fill(NOT_VISITED);
  const order: number[] = [];

  function visit(index: number, chain: number[]) {
    if (state[index] === DONE) return;
    if (state[index] === IN_PROGRESS) {
      throw new RowCycleError(table, [...chain, index]);
    }

    state[index] = IN_PROGRESS;
    for (const dependency of dependsOn.get(index) ?? []) {
      visit(dependency, [...chain, index]);
    }
    state[index] = DONE;
    order.push(index);
  }

  for (let index = 0; index < rows.length; index += 1) {
    visit(index, []);
  }

  return order.map((rowIndex) => rows[rowIndex]);
}
