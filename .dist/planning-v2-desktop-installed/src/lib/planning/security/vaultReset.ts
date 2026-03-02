import fs from "node:fs/promises";
import path from "node:path";
import { ASSUMPTIONS_HISTORY_DIR, ASSUMPTIONS_PATH } from "../assumptions/storage";
import { resolveProfilesDir, resolveRunsDir } from "../store/paths";
import { resetVaultRuntime } from "./vaultState";

type VaultResetOptions = {
  keepAudit?: boolean;
};

export type VaultResetResult = {
  keepAudit: boolean;
  removed: string[];
};

const DEFAULT_AUDIT_PATH = ".data/ops/audit/events.ndjson";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function resolveAssumptionsPath(cwd = process.cwd()): string {
  const override = asString(process.env.PLANNING_ASSUMPTIONS_PATH);
  return path.resolve(cwd, override || ASSUMPTIONS_PATH);
}

function resolveAssumptionsHistoryDir(cwd = process.cwd()): string {
  const override = asString(process.env.PLANNING_ASSUMPTIONS_HISTORY_DIR);
  return path.resolve(cwd, override || ASSUMPTIONS_HISTORY_DIR);
}

function resolveVaultConfigPath(cwd = process.cwd()): string {
  const override = asString(process.env.PLANNING_VAULT_CONFIG_PATH);
  return path.resolve(cwd, override || ".data/planning/security/vault.json");
}

function resolveLegacyVaultConfigPath(cwd = process.cwd()): string {
  const override = asString(process.env.PLANNING_VAULT_CONFIG_PATH);
  return path.resolve(cwd, override || ".data/planning/security/vault.config.json");
}

function resolveAuditPath(cwd = process.cwd()): string {
  const override = asString(process.env.PLANNING_OPS_AUDIT_PATH);
  return path.resolve(cwd, override || DEFAULT_AUDIT_PATH);
}

function isUnsafePath(target: string, cwd = process.cwd()): boolean {
  const resolved = path.resolve(target);
  const resolvedCwd = path.resolve(cwd);
  if (!resolved) return true;
  if (resolved === path.parse(resolved).root) return true;
  if (resolved === resolvedCwd) return true;
  return false;
}

function dedupeSorted(paths: string[]): string[] {
  return Array.from(new Set(paths.map((entry) => path.resolve(entry))))
    .sort((a, b) => b.length - a.length);
}

async function removePath(target: string): Promise<boolean> {
  try {
    await fs.rm(target, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

export async function resetVaultAndPlanningData(options: VaultResetOptions = {}): Promise<VaultResetResult> {
  const cwd = process.cwd();
  const keepAudit = options.keepAudit !== false;

  const planningRoot = path.resolve(cwd, ".data/planning");
  const auditPath = resolveAuditPath(cwd);

  const targets = dedupeSorted([
    planningRoot,
    resolveProfilesDir(cwd),
    resolveRunsDir(cwd),
    resolveAssumptionsPath(cwd),
    resolveAssumptionsHistoryDir(cwd),
    resolveVaultConfigPath(cwd),
    resolveLegacyVaultConfigPath(cwd),
    ...(!keepAudit ? [auditPath, path.dirname(auditPath)] : []),
  ]);

  const unsafe = targets.find((entry) => isUnsafePath(entry, cwd));
  if (unsafe) {
    throw new Error(`VAULT_RESET_UNSAFE_PATH:${unsafe}`);
  }

  const removed: string[] = [];
  for (const target of targets) {
    const ok = await removePath(target);
    if (ok) {
      removed.push(path.relative(cwd, target).replaceAll("\\", "/") || ".");
    }
  }

  await resetVaultRuntime();
  return {
    keepAudit,
    removed,
  };
}
