import fs from "node:fs";
import path from "node:path";
import { inspectFinlifeIdentityMigration, migrateFinlifeIdentityDatabase } from "../src/lib/finlife/sqliteIdentityMigration.mjs";
import { resolvePlanningSqliteDatabase } from "../src/lib/planning/deployment/runtimeDatabase.mjs";
import { resolvePlanningControlRoot } from "../src/lib/planning/deployment/runtimeRoot.mjs";
import { loadPlanningDesktopEnvironment, PLANNING_DESKTOP_RUNTIME_CONFIG_ENV_KEYS } from "./planning_v2_desktop_env.mjs";
import { assertManagedDesktopDatabasePath } from "./planning_desktop_install_state.mjs";

async function main() {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 1 || args[0] !== "--apply")) throw Object.assign(new Error("unsupported arguments"), { code: "USAGE" });
  const cwd = process.cwd();
  const manifest = path.join(cwd, "desktop-manifest.json");
  let managed = false;
  try {
    const stat = fs.lstatSync(manifest);
    if (!stat.isFile() || stat.isSymbolicLink()) throw Object.assign(new Error("invalid manifest"), { code: "MANAGED_MANIFEST_INVALID" });
    managed = true;
  } catch (error) { if (error.code !== "ENOENT") throw error; }
  await loadPlanningDesktopEnvironment({
    cwd, env: process.env,
    authoritativeKeys: managed ? PLANNING_DESKTOP_RUNTIME_CONFIG_ENV_KEYS : [],
  });
  if (managed) process.env.NODE_ENV = "production";
  const { databasePath } = resolvePlanningSqliteDatabase({ cwd, env: process.env });
  await assertManagedDesktopDatabasePath({ installDir: cwd, databasePath });
  if (!args.length) {
    const result = inspectFinlifeIdentityMigration({ cwd, databasePath });
    process.stdout.write(JSON.stringify({ mode: "inspect", ...result }) + "\n");
    return result.status === "blocked" ? 2 : 0;
  }
  const controlRoot = resolvePlanningControlRoot({ cwd, env: process.env });
  if (!process.env.PLANNING_WRITER_DATA_ROOT || fs.realpathSync(controlRoot) !== fs.realpathSync(process.env.PLANNING_WRITER_DATA_ROOT)) {
    throw Object.assign(new Error("use canonical migration writer"), { code: "MIGRATION_WRITER_REQUIRED" });
  }
  const result = await migrateFinlifeIdentityDatabase({
    cwd, databasePath, controlRoot, capability: process.env.PLANNING_WRITER_LEASE_CAPABILITY,
  });
  process.stdout.write(JSON.stringify({ mode: "apply", ...result }) + "\n");
  return 0;
}
main().then(code => { process.exitCode = code; }, error => {
  // Never print SQLite rows, raw JSON, credentials, or arbitrary trigger messages.
  process.stderr.write(JSON.stringify({
    status: "failed", code: /^[A-Za-z0-9_]+$/.test(error.code ?? "") ? error.code : "FINLIFE_MIGRATION_FAILED",
    migrationCommitted: error.migrationCommitted === true,
    ...(error.backupPath ? { backupPath: error.backupPath } : {}),
    ...(error.receiptPath ? { receiptPath: error.receiptPath } : {}),
  }) + "\n");
  process.exitCode = 1;
});
