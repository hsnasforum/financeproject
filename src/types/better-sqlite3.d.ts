declare module "better-sqlite3" {
  type BindParams = Record<string, unknown> | unknown[];

  type StatementRunResult = {
    changes: number;
    lastInsertRowid: number | bigint;
  };

  interface Statement<Row = Record<string, unknown>> {
    safeIntegers(toggle?: boolean): this;
    run(...params: unknown[]): StatementRunResult;
    run(params: BindParams): StatementRunResult;
    get(...params: unknown[]): Row | undefined;
    get(params: BindParams): Row | undefined;
    all(...params: unknown[]): Row[];
    all(params: BindParams): Row[];
  }

  type DatabaseOptions = {
    readonly?: boolean;
    fileMustExist?: boolean;
    timeout?: number;
    verbose?: ((message?: unknown, ...args: unknown[]) => void) | undefined;
  };

  class Database {
    constructor(filename: string, options?: DatabaseOptions);
    prepare<Row = Record<string, unknown>>(source: string): Statement<Row>;
    transaction<Args extends unknown[], Return>(fn: (...args: Args) => Return): (...args: Args) => Return;
    exec(source: string): this;
    pragma(source: string, options?: Record<string, unknown>): unknown;
    backup(filename: string): Promise<{ totalPages: number; remainingPages: number }>;
    close(): this;
  }

  export default Database;
}
