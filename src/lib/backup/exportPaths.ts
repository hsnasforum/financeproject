import fs from "node:fs";
import path from "node:path";
import { DEFAULT_SERVER_EXPORT_PATHS, isServerPathWhitelisted } from "./backupBundle";

export function collectServerPaths(cwd = process.cwd()): string[] {
  const out = new Set<string>(DEFAULT_SERVER_EXPORT_PATHS as readonly string[]);
  const scanDirs = [
    { absolute: path.join(cwd, "tmp", "dart"), relative: "tmp/dart" },
    { absolute: path.join(cwd, ".data", "planning", "assumptions", "history"), relative: ".data/planning/assumptions/history" },
    { absolute: path.join(cwd, ".data", "planning", "profiles"), relative: ".data/planning/profiles" },
    { absolute: path.join(cwd, ".data", "planning", "runs"), relative: ".data/planning/runs" },
    { absolute: path.join(cwd, ".data", "planning", "cache"), relative: ".data/planning/cache" },
    { absolute: path.join(cwd, ".data", "planning", "eval", "history"), relative: ".data/planning/eval/history" },
  ];

  for (const target of scanDirs) {
    if (!fs.existsSync(target.absolute)) continue;
    try {
      const entries = fs.readdirSync(target.absolute, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        if (!entry.name.toLowerCase().endsWith(".json")) continue;
        out.add(`${target.relative}/${entry.name}`.replaceAll("\\", "/"));
      }
    } catch {
      // ignore directory read errors per-path and continue with static list
    }
  }
  return [...out].filter((relativePath) => isServerPathWhitelisted(relativePath));
}
