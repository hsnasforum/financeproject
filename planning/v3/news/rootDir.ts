import path from "node:path";
import { resolveDataDir } from "../../../src/lib/planning/storage/dataDir";

export function resolveNewsRootDir(cwd = process.cwd()): string {
  return path.join(resolveDataDir({ cwd }), "news");
}
