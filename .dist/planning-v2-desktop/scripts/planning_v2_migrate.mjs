import fs from "node:fs/promises";
import path from "node:path";
import { tsImport } from "tsx/esm/api";

const REQUIRED_CONFIRM = "MIGRATE PLANNING V2";
const RESTORE_POINT_RELATIVE = "tmp/backup_restore_point.json";

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function parseArgs(argv) {
  const out = {
    dryRun: false,
    apply: false,
    confirm: "",
    namespaceUser: "",
    encrypt: false,
  };

  for (const token of argv) {
    if (!token.startsWith("--")) continue;
    if (token === "--dry-run") out.dryRun = true;
    if (token === "--apply") out.apply = true;
    if (token === "--encrypt") out.encrypt = true;
    const [rawKey, ...rest] = token.slice(2).split("=");
    const key = asString(rawKey);
    const value = asString(rest.join("="));
    if (key === "confirm") out.confirm = value;
    if (key === "namespace-user") out.namespaceUser = value;
  }

  if (!out.dryRun && !out.apply) {
    out.dryRun = true;
  }
  return out;
}

async function writeJsonAtomic(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tmpPath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
  await fs.rename(tmpPath, filePath);
}

async function readTextIfExists(filePath) {
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch (error) {
    const nodeError = error;
    if (nodeError?.code === "ENOENT") return null;
    throw error;
  }
}

function printPlanSummary(plan) {
  console.log("[planning:v2:migrate] summary");
  console.log(`- target=${plan.target}`);
  console.log(`- scanned=${plan.scanned}`);
  console.log(`- upgradable=${plan.upgradable}`);
  console.log(`- failed=${plan.failed}`);
  console.log(`- changedCount=${plan.summary.changedCount}`);
  console.log(`- failedCount=${plan.summary.failedCount}`);

  const sample = plan.actions
    .filter((row) => row.changed || row.errors.length > 0 || row.warnings.length > 0)
    .slice(0, 10);
  if (sample.length < 1) return;
  console.log("[planning:v2:migrate] sample");
  for (const row of sample) {
    const status = row.errors.length > 0 ? "FAILED" : row.changed ? "CHANGED" : "UNCHANGED";
    console.log(`- [${status}] ${row.kind} ${row.path} v${row.fromVersion}->v${row.toVersion}`);
    if (row.warnings.length > 0) {
      console.log(`  warnings=${row.warnings.join(",")}`);
    }
    if (row.errors.length > 0) {
      console.log(`  errors=${row.errors.join(",")}`);
    }
  }
}

function printNamespacePlanSummary(plan) {
  console.log("[planning:v2:migrate] namespace");
  console.log(`- userId=${plan.userId}`);
  console.log(`- scanned=${plan.scanned}`);
  console.log(`- movable=${plan.movable}`);
  console.log(`- failed=${plan.failed}`);

  const sample = plan.actions
    .filter((row) => row.movable || row.errors.length > 0)
    .slice(0, 10);
  if (sample.length < 1) return;
  console.log("[planning:v2:migrate] namespace sample");
  for (const row of sample) {
    const status = row.errors.length > 0 ? "FAILED" : "MOVE";
    console.log(`- [${status}] ${row.kind} ${row.fromPath} -> ${row.toPath}`);
    if (row.errors.length > 0) console.log(`  errors=${row.errors.join(",")}`);
  }
}

async function appendAudit(event, summary, details) {
  try {
    const modRaw = await tsImport("../src/lib/audit/auditLogStore.ts", { parentURL: import.meta.url });
    const mod = modRaw?.default && typeof modRaw.default === "object" ? modRaw.default : modRaw;
    if (typeof mod.append === "function") {
      mod.append({
        event,
        route: "/scripts/planning_v2_migrate",
        summary,
        details,
      });
    }
  } catch {
    // ignore audit failures in CLI
  }
}

async function createRestorePoint(cwd) {
  const exportRaw = await tsImport("../src/lib/backup/exportPaths.ts", { parentURL: import.meta.url });
  const bundleRaw = await tsImport("../src/lib/backup/backupBundle.ts", { parentURL: import.meta.url });
  const exportMod = exportRaw?.default && typeof exportRaw.default === "object" ? exportRaw.default : exportRaw;
  const bundleMod = bundleRaw?.default && typeof bundleRaw.default === "object" ? bundleRaw.default : bundleRaw;

  if (typeof exportMod.collectServerPaths !== "function" || typeof bundleMod.buildBundle !== "function") {
    return { ok: false, reason: "restore_helpers_unavailable" };
  }

  const serverPaths = exportMod.collectServerPaths(cwd);
  const serverFilesMap = {};
  for (const relPath of serverPaths) {
    const absPath = path.resolve(cwd, relPath);
    const text = await readTextIfExists(absPath);
    serverFilesMap[relPath] = text;
  }

  const bundle = bundleMod.buildBundle({
    serverFilesMap,
    clientStorageMap: {},
  });
  const outPath = path.resolve(cwd, RESTORE_POINT_RELATIVE);
  await writeJsonAtomic(outPath, bundle);
  return { ok: true, path: RESTORE_POINT_RELATIVE };
}

async function main() {
  const cwd = path.resolve(process.cwd());
  const args = parseArgs(process.argv.slice(2));
  const runnerRaw = await tsImport("../src/lib/planning/migrations/runner.ts", { parentURL: import.meta.url });
  const runner = runnerRaw?.default && typeof runnerRaw.default === "object" ? runnerRaw.default : runnerRaw;
  if (typeof runner.planMigrations !== "function" || typeof runner.applyMigrations !== "function") {
    throw new Error("migration runner exports not found");
  }

  const plan = await runner.planMigrations({ target: "all", baseDir: cwd });
  printPlanSummary(plan);
  let namespacePlan = null;
  if (args.namespaceUser) {
    if (typeof runner.planNamespaceMigration !== "function") {
      throw new Error("namespace migration planner exports not found");
    }
    namespacePlan = await runner.planNamespaceMigration({
      baseDir: cwd,
      userId: args.namespaceUser,
    });
    printNamespacePlanSummary(namespacePlan);
  }

  if (args.dryRun) {
    const hasFailure = plan.summary.failedCount > 0 || Boolean(namespacePlan && namespacePlan.summary.failedCount > 0);
    await appendAudit(
      "PLANNING_MIGRATE_DRYRUN",
      hasFailure ? "planning migrate dry-run 실패" : "planning migrate dry-run 완료",
      {
        result: hasFailure ? "ERROR" : "SUCCESS",
        scanned: plan.scanned,
        upgradable: plan.upgradable,
        changedCount: plan.summary.changedCount,
        failedCount: plan.summary.failedCount,
        namespaceUser: args.namespaceUser || undefined,
        namespaceScanned: namespacePlan?.scanned,
        namespaceMovable: namespacePlan?.movable,
        namespaceFailed: namespacePlan?.summary.failedCount,
      },
    );
    if (hasFailure) {
      process.exit(1);
    }
    return;
  }

  if (args.confirm !== REQUIRED_CONFIRM) {
    console.error(`[planning:v2:migrate] confirm mismatch (required: "${REQUIRED_CONFIRM}")`);
    process.exit(1);
  }

  const namespaceHasFailure = Boolean(namespacePlan && namespacePlan.summary.failedCount > 0);
  if (plan.summary.failedCount > 0 || namespaceHasFailure) {
    console.error("[planning:v2:migrate] apply blocked: dry-run has failures");
    process.exit(1);
  }

  let restorePoint = { ok: false, reason: "not_attempted" };
  try {
    restorePoint = await createRestorePoint(cwd);
    if (restorePoint.ok) {
      console.log(`[planning:v2:migrate] restorePoint=${restorePoint.path}`);
    } else {
      console.log(`[planning:v2:migrate] restorePoint skipped (${restorePoint.reason})`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "restore_point_failed";
    restorePoint = { ok: false, reason: message };
    console.log(`[planning:v2:migrate] restorePoint failed (${message})`);
  }

  const applied = await runner.applyMigrations(plan, { baseDir: cwd });
  console.log(`[planning:v2:migrate] applied=${applied.applied} failed=${applied.failed}`);

  let namespaceApplied = { moved: 0, failed: 0, encrypted: 0 };
  if (namespacePlan) {
    if (typeof runner.applyNamespaceMigration !== "function") {
      throw new Error("namespace migration apply exports not found");
    }
    const encryptionPassphrase = args.encrypt ? process.env.PLANNING_ENCRYPTION_PASSPHRASE ?? "" : "";
    if (args.encrypt && !encryptionPassphrase.trim()) {
      throw new Error("PLANNING_ENCRYPTION_PASSPHRASE_REQUIRED");
    }

    namespaceApplied = await runner.applyNamespaceMigration(namespacePlan, {
      baseDir: cwd,
      userId: namespacePlan.userId,
      encryptionPassphrase: encryptionPassphrase.trim() || undefined,
    });
    console.log(
      `[planning:v2:migrate] namespace moved=${namespaceApplied.moved} failed=${namespaceApplied.failed} encrypted=${namespaceApplied.encrypted}`,
    );
  }

  const result = applied.failed > 0 || namespaceApplied.failed > 0 ? "ERROR" : "SUCCESS";
  await appendAudit(
    "PLANNING_MIGRATE_APPLY",
    result === "SUCCESS" ? "planning migrate apply 완료" : "planning migrate apply 실패",
    {
      result,
      scanned: plan.scanned,
      upgradable: plan.upgradable,
      changedCount: plan.summary.changedCount,
      failedCount: applied.failed,
      appliedCount: applied.applied,
      namespaceUser: namespacePlan?.userId,
      namespaceMoved: namespaceApplied.moved,
      namespaceFailed: namespaceApplied.failed,
      encryptedCount: namespaceApplied.encrypted,
      restorePoint: restorePoint.ok ? "CREATED" : "SKIPPED",
    },
  );

  if (applied.failed > 0 || namespaceApplied.failed > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(`[planning:v2:migrate] FAIL\n${message}`);
  process.exit(1);
});
