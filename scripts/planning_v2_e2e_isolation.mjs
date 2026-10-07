import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildPortCandidates } from "./start_local_port.mjs";

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function toPort(value, fallback) {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 65535) return fallback;
  return parsed;
}

function hasExplicitPlanningStorage(env) {
  return [
    "PLANNING_DATA_DIR",
    "PLANNING_PROFILES_DIR",
    "PLANNING_RUNS_DIR",
    "PLANNING_VAULT_CONFIG_PATH",
  ].some((key) => asString(env[key]));
}

export function createPlanningDesktopE2EEnvironment(baseEnv, options = {}) {
  const databaseUrl = asString(options.databaseUrl);
  const planningDataDir = asString(options.planningDataDir);
  const sessionToken = asString(options.sessionToken);
  if (!databaseUrl) {
    throw new Error("planning desktop e2e database URL is required");
  }
  if (!planningDataDir) {
    throw new Error("planning desktop e2e data directory is required");
  }
  if (!/^[A-Za-z0-9_-]{43,}$/.test(sessionToken)) {
    throw new Error("planning desktop e2e session token must be a high-entropy base64url token");
  }

  const resolvedPlanningDataDir = path.resolve(planningDataDir);
  const controlRoot = path.dirname(resolvedPlanningDataDir);
  return {
    ...baseEnv,
    PLANNING_E2E_DESKTOP_DATABASE_URL: databaseUrl,
    PLANNING_E2E_DESKTOP_DATA_DIR: resolvedPlanningDataDir,
    PLANNING_E2E_DESKTOP_BOOTSTRAP_FILE: path.join(controlRoot, "runtime", "e2e-bootstrap.url"),
    PLANNING_E2E_DESKTOP_SESSION_TOKEN: sessionToken,
  };
}

export async function createIsolatedPlanningV2E2EOptions(baseEnv = process.env, options = {}) {
  const defaultPort = toPort(options.defaultPort, 3226);
  const preferredPort = toPort(options.preferredPort ?? baseEnv.PORT, defaultPort);
  const scanFrom = toPort(options.scanFrom, Math.max(1, preferredPort + 1));
  const scanTo = toPort(options.scanTo, Math.min(65535, preferredPort + 40));
  const candidates = buildPortCandidates({
    preferredPort,
    scanFrom,
    scanTo,
  });
  const explicitPreferredPort = asString(options.preferredPort ?? baseEnv.PORT);
  const hasPinnedPort = explicitPreferredPort.length > 0;
  const fallbackCandidates = hasPinnedPort ? candidates : candidates.slice(1);
  const portIndex = fallbackCandidates.length > 0
    ? Math.abs((process.pid + Date.now()) % fallbackCandidates.length)
    : 0;
  const port = hasPinnedPort
    ? preferredPort
    : (fallbackCandidates[portIndex] ?? candidates[0] ?? 0);
  if (!port) {
    throw new Error(`isolated planning e2e port unavailable (preferred=${preferredPort})`);
  }

  const runId = `${port}-${process.pid}-${Date.now()}`;
  const distDir = `${asString(options.distDirPrefix) || ".next-e2e"}-${runId}`;
  const env = {
    ...baseEnv,
    PORT: String(port),
    PLAYWRIGHT_REUSE_EXISTING_SERVER: "0",
    PLAYWRIGHT_DIST_DIR: distDir,
  };

  let planningDataDir = asString(env.PLANNING_DATA_DIR) || asString(env.PLANNING_PROFILES_DIR) || "<shared>";
  let sandboxRoot = "";
  const isolatePlanningData = options.forceIsolatedPlanningData === true
    || (!hasExplicitPlanningStorage(baseEnv) && options.allowSharedPlanningData !== true);

  if (isolatePlanningData) {
    sandboxRoot = await fs.mkdtemp(path.join(os.tmpdir(), `${asString(options.sandboxPrefix) || "finance-planning-e2e-"}${runId}-`));
    const planningRoot = path.join(sandboxRoot, "planning");
    env.PLANNING_DATA_DIR = planningRoot;
    env.PLANNING_PROFILES_DIR = path.join(planningRoot, "profiles");
    env.PLANNING_RUNS_DIR = path.join(planningRoot, "runs");
    env.PLANNING_VAULT_CONFIG_PATH = path.join(planningRoot, "security", "vault.json");
    env.PLANNING_MIGRATION_STATE_PATH = path.join(planningRoot, "migrations", "migrationState.json");
    env.PLANNING_MIGRATION_SNAPSHOT_DIR = path.join(planningRoot, "migrations", "snapshots");
    env.PLANNING_STORAGE_JOURNAL_PATH = path.join(planningRoot, "storage", "journal.ndjson");
    planningDataDir = planningRoot;
  }

  return {
    env,
    port,
    distDir,
    planningDataDir,
    cleanup: async () => {
      await fs.rm(path.join(process.cwd(), distDir), { recursive: true, force: true }).catch(() => undefined);
      if (sandboxRoot) {
        await fs.rm(sandboxRoot, { recursive: true, force: true }).catch(() => undefined);
      }
    },
  };
}
