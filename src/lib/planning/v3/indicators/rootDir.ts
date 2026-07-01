import path from "node:path";
import { resolveDataDir } from "@/lib/planning/storage/dataDir";

export function resolveIndicatorsRootDir(cwd = process.cwd()): string {
  return path.join(resolveDataDir({ cwd }), "indicators");
}
