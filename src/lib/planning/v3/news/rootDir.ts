import path from "node:path";
import { resolveDataDir } from "@/lib/planning/storage/dataDir";
import {
  getPlanningUserDir,
  isPlanningNamespaceEnabled,
  resolvePlanningUserId,
} from "@/lib/planning/store/namespace";

export function resolveNewsRootDir(cwd = process.cwd()): string {
  if (isPlanningNamespaceEnabled()) {
    return path.join(getPlanningUserDir(resolvePlanningUserId(), cwd), "planning-v3", "news");
  }
  return path.join(resolveDataDir({ cwd }), "news");
}
