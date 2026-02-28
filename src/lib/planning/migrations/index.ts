import { migrateProfileRecord } from "./profileMigrate.ts";
import { migrateRunRecord } from "./runMigrate.ts";
import { migrateAssumptionsSnapshot } from "./snapshotMigrate.ts";

export type MigrationFileKind = "profile" | "run" | "snapshot";

export function migrateAnyFile(kind: MigrationFileKind, json: unknown) {
  if (kind === "profile") return migrateProfileRecord(json);
  if (kind === "run") return migrateRunRecord(json);
  return migrateAssumptionsSnapshot(json);
}
