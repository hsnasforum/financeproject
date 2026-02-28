export type MigrationResult<T> = {
  ok: boolean;
  fromVersion: number;
  toVersion: number;
  changed: boolean;
  data?: T;
  warnings: string[];
  errors: string[];
};
