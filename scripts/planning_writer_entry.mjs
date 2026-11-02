import path from "node:path";
import fs from "node:fs/promises";
import { loadPlanningDesktopEnvironment, PLANNING_DESKTOP_RUNTIME_CONFIG_ENV_KEYS } from "./planning_v2_desktop_env.mjs";
import {
  acquirePlanningWriterLease,
  verifyPlanningWriterLeaseCapability,
} from "../src/lib/planning/deployment/writerLease.mjs";
import { assertPlanningWriterId } from "../src/lib/planning/deployment/writerRegistry.mjs";
import {
  inspectPlanningDataRoot,
  resolvePlanningControlRoot,
  resolvePlanningDataRoot,
} from "../src/lib/planning/deployment/runtimeRoot.mjs";
import { spawnRegisteredPlanningWriterChild } from "./planning_writer_child.mjs";

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function parseArgs(argv) {
  const separator = argv.indexOf("--");
  if (separator < 1 || separator >= argv.length - 1) {
    throw new Error("usage: planning_writer_entry.mjs <writer-id> -- <command> [args...]");
  }
  return {
    writerId: assertPlanningWriterId(argv[0]),
    command: argv[separator + 1],
    args: argv.slice(separator + 2),
  };
}

function waitForExit(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve({ code: child.exitCode, signal: child.signalCode });
  }
  return new Promise((resolve) => {
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
}

function signalChildGroup(child, signal) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  try {
    if (process.platform !== "win32" && typeof child.pid === "number") {
      process.kill(-child.pid, signal);
    } else {
      child.kill(signal);
    }
  } catch {
    // The child may already be exiting.
  }
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.writerId === "finlife:identity:migrate:apply") {
    let managed = false;
    try {
      const stats = await fs.lstat(path.join(process.cwd(), "desktop-manifest.json"));
      if (stats.isSymbolicLink() || !stats.isFile()) {
        throw new Error("managed desktop manifest must be a regular file");
      }
      managed = true;
    } catch (error) {
      if (!error || typeof error !== "object" || error.code !== "ENOENT") throw error;
    }
    await loadPlanningDesktopEnvironment({
      cwd: process.cwd(),
      env: process.env,
      authoritativeKeys: managed ? PLANNING_DESKTOP_RUNTIME_CONFIG_ENV_KEYS : [],
    });
    if (managed) process.env.NODE_ENV = "production";
  }
  const planningRoot = resolvePlanningDataRoot({ cwd: process.cwd(), env: process.env });
  const controlRoot = resolvePlanningControlRoot({ cwd: process.cwd(), env: process.env });
  const [inspectedPlanning, inspected] = await Promise.all([
    inspectPlanningDataRoot({ dataRoot: planningRoot }),
    inspectPlanningDataRoot({ dataRoot: controlRoot }),
  ]);
  if (inspectedPlanning.dataRootKind !== "local" || inspected.dataRootKind !== "local") {
    throw new Error(
      `planning writer requires a verified local data root (planning=${inspectedPlanning.dataRootKind}, app=${inspected.dataRootKind})`,
    );
  }
  if (path.dirname(inspectedPlanning.dataRoot) !== inspected.dataRoot) {
    throw new Error("planning writer data root crosses the app-root boundary");
  }

  const inheritedCapability = asString(process.env.PLANNING_WRITER_LEASE_CAPABILITY);
  const inheritedRoot = asString(process.env.PLANNING_WRITER_DATA_ROOT);
  let lease = null;
  let capability = inheritedCapability;
  if (inheritedCapability || inheritedRoot) {
    if (!inheritedCapability || !inheritedRoot) {
      throw new Error("incomplete inherited planning writer lease capability");
    }
    const inherited = await verifyPlanningWriterLeaseCapability({
      dataRoot: inheritedRoot,
      capability: inheritedCapability,
    });
    if (inherited.dataRoot !== inspected.dataRoot) {
      throw new Error("inherited planning writer lease belongs to a different data root");
    }
  } else {
    lease = await acquirePlanningWriterLease({
      dataRoot: inspected.dataRoot,
      writerId: parsed.writerId,
    });
    capability = lease.capability;
  }

  const childEnv = {
    ...process.env,
    PLANNING_DATA_DIR: inspectedPlanning.dataRoot,
    PLANNING_WRITER_DATA_ROOT: inspected.dataRoot,
    PLANNING_WRITER_LEASE_CAPABILITY: capability,
    PLANNING_WRITER_ENTRYPOINT_ID: parsed.writerId,
  };
  let child;
  let shuttingDown = false;
  const onSignal = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    signalChildGroup(child, signal);
  };
  process.on("SIGINT", () => onSignal("SIGINT"));
  process.on("SIGTERM", () => onSignal("SIGTERM"));

  try {
    child = await spawnRegisteredPlanningWriterChild({
      dataRoot: inspected.dataRoot,
      capability,
      command: parsed.command,
      args: parsed.args,
      cwd: process.cwd(),
      env: childEnv,
    });
    const result = await waitForExit(child);
    if (result.signal) return 128;
    return result.code ?? 1;
  } finally {
    if (lease) await lease.release();
  }
}

main().then((code) => {
  process.exit(code);
}, (error) => {
  const message = error instanceof Error ? error.message : String(error);
  const code = error && typeof error === "object" && typeof error.code === "string"
    ? error.code
    : "PLANNING_WRITER_FAILED";
  process.stderr.write(`[planning-writer] failed code=${code} ${message}\n`);
  process.exit(1);
});
