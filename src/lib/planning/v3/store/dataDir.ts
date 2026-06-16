import path from "node:path";
import {
  getPlanningUserDir,
  isPlanningNamespaceEnabled,
  resolvePlanningUserId,
} from "../../store/namespace";
import { resolvePlanningDataDir } from "../../storage/dataDir";

export function resolvePlanningV3DataDir(cwd = process.cwd()): string {
  if (!isPlanningNamespaceEnabled()) {
    return path.join(resolvePlanningDataDir({ cwd }), "planning-v3");
  }

  return path.join(getPlanningUserDir(resolvePlanningUserId(), cwd), "planning-v3");
}

export function resolvePlanningV3LegacyDataDir(cwd = process.cwd()): string {
  if (!isPlanningNamespaceEnabled()) {
    return path.join(resolvePlanningDataDir({ cwd }), "v3");
  }

  return path.join(getPlanningUserDir(resolvePlanningUserId(), cwd), "v3");
}
