/** The slice of D1 used by the server stores and the in-memory test database. */
export interface Statement {
  bind(...values: unknown[]): Statement;
  first<Row = Record<string, unknown>>(column?: string): Promise<Row | null>;
  all<Row = Record<string, unknown>>(): Promise<{ results: Row[] }>;
  run(): Promise<{ success: boolean; meta: { changes: number; last_row_id: number } }>;
}

export interface Database {
  prepare(sql: string): Statement;
}
