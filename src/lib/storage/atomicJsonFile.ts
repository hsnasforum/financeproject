import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const STABLE_READ_MAX_ATTEMPTS = 3;

export type FileIdentity = {
  dev: number;
  ino: number;
  size: number;
  mtimeMs: number;
  ctimeMs: number;
};

function toFileIdentity(stat: fs.Stats): FileIdentity {
  return {
    dev: stat.dev,
    ino: stat.ino,
    size: stat.size,
    mtimeMs: stat.mtimeMs,
    ctimeMs: stat.ctimeMs,
  };
}

export function sameFileIdentity(left: FileIdentity, right: FileIdentity): boolean {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.size === right.size
    && left.mtimeMs === right.mtimeMs
    && left.ctimeMs === right.ctimeMs;
}

export function getFileIdentity(filePath: string): FileIdentity | null {
  for (let attempt = 0; attempt < STABLE_READ_MAX_ATTEMPTS; attempt += 1) {
    try {
      return toFileIdentity(fs.statSync(filePath));
    } catch {
      // A writer may be replacing the canonical file. Retry a small, fixed number of times.
    }
  }
  return null;
}

export function readStableTextFile(
  filePath: string,
  knownBefore?: FileIdentity,
): { raw: string; identity: FileIdentity } | null {
  let before = knownBefore;
  for (let attempt = 0; attempt < STABLE_READ_MAX_ATTEMPTS; attempt += 1) {
    try {
      const currentBefore = before ?? toFileIdentity(fs.statSync(filePath));
      const raw = fs.readFileSync(filePath, "utf-8");
      const after = toFileIdentity(fs.statSync(filePath));
      if (sameFileIdentity(currentBefore, after)) return { raw, identity: after };
    } catch {
      // Retry transient stat/read failures without falling back to stale memory.
    }
    before = undefined;
  }
  return null;
}

export function writeJsonFileAtomically(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp-${process.pid}-${crypto.randomUUID()}`;
  try {
    fs.writeFileSync(tempPath, JSON.stringify(value), "utf-8");
    fs.renameSync(tempPath, filePath);
  } finally {
    try {
      fs.rmSync(tempPath, { force: true });
    } catch {
      // Cleanup is best-effort and must not mask the write/rename result.
    }
  }
}
