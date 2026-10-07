import path from "node:path";
import { verifyPlanningWriterLeaseCapability } from "../src/lib/planning/deployment/writerLease.mjs";
import {
  inspectPlanningDataRoot,
  resolvePlanningControlRoot,
  resolvePlanningDatabaseFacts,
  resolvePlanningDataRoot,
} from "../src/lib/planning/deployment/runtimeRoot.mjs";
import { assertPlanningRuntimePolicy } from "../src/lib/planning/deployment/runtimePolicy.mjs";
import {
  assertPlanningSqliteSchema,
  resolvePlanningSqliteDatabase,
} from "../src/lib/planning/deployment/runtimeDatabase.mjs";

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

export async function verifyPlanningDesktopRuntimeStartup(options = {}) {
  const env = options.env ?? process.env;
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const bindHost = asString(options.bindHost);
  if (bindHost !== "127.0.0.1") {
    throw new Error("desktop-local runtime must bind to 127.0.0.1");
  }

  const planningCandidate = resolvePlanningDataRoot({ cwd, env });
  const controlCandidate = resolvePlanningControlRoot({ cwd, env });
  const [planningRoot, controlRoot] = await Promise.all([
    inspectPlanningDataRoot({ dataRoot: planningCandidate }),
    inspectPlanningDataRoot({ dataRoot: controlCandidate }),
  ]);
  if (planningRoot.dataRootKind !== "local" || controlRoot.dataRootKind !== "local") {
    throw new Error("desktop-local runtime data root is not a verified local filesystem");
  }
  if (path.dirname(planningRoot.dataRoot) !== controlRoot.dataRoot) {
    throw new Error("desktop-local runtime data root crosses the app-root boundary");
  }

  const capability = asString(env.PLANNING_WRITER_LEASE_CAPABILITY);
  const capabilityRoot = asString(env.PLANNING_WRITER_DATA_ROOT);
  if (!capability || capabilityRoot !== controlRoot.dataRoot) {
    throw new Error("desktop-local runtime writer capability is missing or belongs to another root");
  }
  const lease = await verifyPlanningWriterLeaseCapability({
    dataRoot: controlRoot.dataRoot,
    capability,
  });
  if (lease.writerId !== "runtime.desktop") {
    throw new Error(`desktop-local runtime cannot inherit writer ${lease.writerId}`);
  }
  if (!lease.childPids.includes(process.ppid)) {
    throw new Error("desktop-local runtime parent is not registered in the active writer lease");
  }

  const database = resolvePlanningDatabaseFacts(env);
  if (database.databaseProvider !== "sqlite" || database.databaseConnection !== "file") {
    throw new Error("desktop-local runtime supports only a local SQLite file database");
  }
  const databaseLocation = resolvePlanningSqliteDatabase({ cwd, env });
  if (asString(env.DATABASE_URL) !== databaseLocation.databaseUrl) {
    throw new Error("desktop-local runtime requires the canonical platform-compatible SQLite DATABASE_URL from the launcher");
  }
  const databaseSchema = assertPlanningSqliteSchema({
    cwd,
    databasePath: databaseLocation.databasePath,
  });
  const decision = assertPlanningRuntimePolicy(env);
  return Object.freeze({
    decision,
    planningRoot: planningRoot.dataRoot,
    controlRoot: controlRoot.dataRoot,
    lease,
    database: Object.freeze({
      ...database,
      ...databaseLocation,
      schema: databaseSchema,
    }),
  });
}
