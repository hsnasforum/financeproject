import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createPlanningArchiveContext,
  PLANNING_DATA_OWNER_IDS,
  resolvePlanningDataOwners,
  type PlanningArchiveContextInput,
} from "../../ops/backup/planningOwnerRegistry";
import {
  createPlanningWriterTargetRegistry,
  resolvePlanningNonArchiveWriterTarget,
  type PlanningWriterTarget,
} from "./writerOwnershipRegistry.mjs";
import { normalizePlanningRuntimePlatform } from "./runtimeRoots.mjs";

export const PLANNING_WRITER_TARGET_REGISTRY = createPlanningWriterTargetRegistry(PLANNING_DATA_OWNER_IDS);

export type ResolvedPlanningWriterTarget = Readonly<{
  target: PlanningWriterTarget;
  paths: readonly string[];
}>;

export function assertPlanningWriterPathCompatibility(
  pairs: readonly Readonly<{ legacyPath: string; canonicalPath: string }>[],
): void {
  for (const pair of pairs) {
    const legacyPath = path.resolve(pair.legacyPath);
    const canonicalPath = path.resolve(pair.canonicalPath);
    if (legacyPath === canonicalPath || !fs.existsSync(legacyPath)) continue;
    throw new Error(`PATH_MIGRATION_REQUIRED:${legacyPath}->${canonicalPath}`);
  }
}

export function resolvePlanningWriterTarget(
  targetId: string,
  input: PlanningArchiveContextInput & { externalPath?: string; tempRoot?: string } = {},
): ResolvedPlanningWriterTarget {
  const target = PLANNING_WRITER_TARGET_REGISTRY.find((entry) => entry.id === targetId);
  if (!target) throw new Error(`PLANNING_WRITER_TARGET_UNKNOWN:${targetId}`);

  const context = createPlanningArchiveContext(input);
  if (target.class === "archive-owner") {
    const owner = resolvePlanningDataOwners(context).find((entry) => entry.ownerId === target.archiveOwnerId);
    if (!owner) throw new Error(`PLANNING_ARCHIVE_OWNER_TARGET_UNKNOWN:${target.archiveOwnerId ?? ""}`);
    return Object.freeze({
      target,
      paths: Object.freeze(owner.locations.map((entry) => path.resolve(entry.targetPath))),
    });
  }

  const resolved = resolvePlanningNonArchiveWriterTarget(targetId, {
    cwd: context.cwd,
    env: context.env,
    platform: normalizePlanningRuntimePlatform(context.platform),
    homeDir: os.homedir(),
    externalPath: input.externalPath,
    tempRoot: input.tempRoot,
  });
  return Object.freeze({ target, paths: Object.freeze([resolved.path]) });
}
