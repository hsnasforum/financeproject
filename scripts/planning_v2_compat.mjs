import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { createIsolatedPlanningV2E2EOptions } from "./planning_v2_e2e_isolation.mjs";

const FIXTURE_ROOT = path.resolve(process.cwd(), "tests/fixtures/compat");
const PLAIN_STORAGE_FIXTURE = "v1_plain_storage";
const COMPAT_TESTS = [
  "tests/planning/migrations/compat-fixtures.test.ts",
  "tests/planning/ops/doctorMigrationCheck.test.ts",
];

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function hasFlag(argv, flag) {
  return argv.includes(flag);
}

function unwrapModule(modRaw) {
  if (modRaw?.default && typeof modRaw.default === "object") return modRaw.default;
  return modRaw;
}

async function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? process.cwd(),
      env: options.env ?? process.env,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? 1));
  });
}

async function runPnpm(script, options = {}) {
  const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const code = await runCommand(command, [script], options);
  if (code !== 0) {
    throw new Error(`${script} failed with code ${code}`);
  }
}

async function runPnpmArgs(args, options = {}) {
  const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const code = await runCommand(command, args, options);
  if (code !== 0) {
    throw new Error(`pnpm ${args.join(" ")} failed with code ${code}`);
  }
}

async function loadMigrationManager() {
  const raw = await import("../src/lib/planning/migrations/manager.ts");
  const mod = unwrapModule(raw);
  if (
    typeof mod.inspectPlanningMigrations !== "function"
    || typeof mod.runPlanningMigrations !== "function"
    || typeof mod.getPlanningMigrationStatePath !== "function"
  ) {
    throw new Error("planning migration manager exports not found");
  }
  return mod;
}

async function readFixtureMeta(fixtureDir) {
  const metaPath = path.join(fixtureDir, "fixture.meta.json");
  try {
    const raw = await fs.readFile(metaPath, "utf-8");
    const parsed = JSON.parse(raw);
    return {
      id: asString(parsed.id) || path.basename(fixtureDir),
      description: asString(parsed.description),
      vaultPassphrase: asString(parsed.vaultPassphrase),
    };
  } catch {
    return {
      id: path.basename(fixtureDir),
      description: "",
      vaultPassphrase: "",
    };
  }
}

async function runPlainStorageCompatGate(options) {
  const fixtureDir = path.join(FIXTURE_ROOT, PLAIN_STORAGE_FIXTURE);
  const fixtureStat = await fs.stat(fixtureDir).catch(() => null);
  if (!fixtureStat?.isDirectory()) {
    throw new Error(`fixture not found: ${fixtureDir}`);
  }

  const sandboxRoot = await fs.mkdtemp(path.join(os.tmpdir(), "planning-v2-compat-"));
  try {
    await fs.cp(fixtureDir, sandboxRoot, { recursive: true, force: true });
    const planningDataRoot = path.join(sandboxRoot, ".data");
    const compatEnv = {
      ...process.env,
      PLANNING_DATA_DIR: planningDataRoot,
      PLANNING_MIGRATION_STATE_PATH: path.join(planningDataRoot, "planning/migrations/migrationState.json"),
      PLANNING_MIGRATION_SNAPSHOT_DIR: path.join(planningDataRoot, "planning/migrations/snapshots"),
      PLANNING_STORAGE_JOURNAL_PATH: path.join(planningDataRoot, "planning/storage/journal.ndjson"),
    };

    const manager = await loadMigrationManager();
    const before = await manager.inspectPlanningMigrations({ baseDir: sandboxRoot });
    if ((before.summary.pending ?? 0) < 1) {
      throw new Error("compat fixture should require at least one migration");
    }

    const result = await manager.runPlanningMigrations({ baseDir: sandboxRoot, trigger: "ops" });
    if (result.summary.failed > 0) {
      throw new Error(`compat migration failed: failed=${result.summary.failed}`);
    }

    const statePath = manager.getPlanningMigrationStatePath(sandboxRoot);
    const stateRaw = JSON.parse(await fs.readFile(statePath, "utf-8"));
    if (!stateRaw?.lastAttempt || asString(stateRaw.lastAttempt.trigger) !== "ops") {
      throw new Error("migration state not recorded for compat fixture");
    }

    console.log(`[planning:v2:compat] migration PASS fixture=${PLAIN_STORAGE_FIXTURE} state=${path.relative(process.cwd(), statePath).replaceAll("\\", "/")}`);
    if (!options.skipComplete) {
      await runPnpm("planning:v2:complete", {
        cwd: process.cwd(),
        env: compatEnv,
      });
    } else {
      console.log("[planning:v2:compat] skip planning:v2:complete (--skip-complete)");
    }

    if (options.withAcceptance && !options.skipComplete) {
      const isolated = await createIsolatedPlanningV2E2EOptions(compatEnv, {
        defaultPort: 3226,
        preferredPort: compatEnv.PLANNING_FAST_E2E_PORT ?? compatEnv.PORT,
        scanFrom: compatEnv.PLANNING_FAST_E2E_SCAN_FROM,
        scanTo: compatEnv.PLANNING_FAST_E2E_SCAN_TO,
        sandboxPrefix: "finance-planning-compat-e2e-",
      });
      console.log(
        `[planning:v2:compat] isolated acceptance fast e2e port=${isolated.port} distDir=${isolated.distDir} reuseExistingServer=0 planningDataDir=${isolated.planningDataDir}`,
      );
      try {
        await runPnpm("planning:v2:e2e:fast", {
          cwd: process.cwd(),
          env: isolated.env,
        });
      } finally {
        await isolated.cleanup();
      }
    }
  } finally {
    if (!options.keepSandbox) {
      await fs.rm(sandboxRoot, { recursive: true, force: true }).catch(() => undefined);
    } else {
      console.log(`[planning:v2:compat] sandbox kept: ${sandboxRoot}`);
    }
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const withAcceptance = hasFlag(argv, "--with-acceptance");
  const keepSandbox = hasFlag(argv, "--keep-sandbox");
  const skipComplete = hasFlag(argv, "--skip-complete");

  console.log("[planning:v2:compat] run compat fixture tests");
  await runPnpmArgs(["test", ...COMPAT_TESTS], { cwd: process.cwd(), env: process.env });

  console.log("[planning:v2:compat] run migration + complete gate on plain legacy fixture");
  await runPlainStorageCompatGate({ withAcceptance, keepSandbox, skipComplete });

  const encryptedMeta = await readFixtureMeta(path.join(FIXTURE_ROOT, "v2_encrypted_storage"));
  if (encryptedMeta.id) {
    console.log(
      `[planning:v2:compat] encrypted fixture present (${encryptedMeta.id}) - validated by compat unit tests`,
    );
  }

  console.log("[planning:v2:compat] PASS");
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(`[planning:v2:compat] FAIL\n${message}`);
  process.exit(1);
});
