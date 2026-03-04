import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { resolveDataDir } from "../../../src/lib/planning/storage/dataDir";
import {
  ExposureProfileSchema,
  normalizeExposureProfile,
  parseExposureProfileInput,
  type ExposureProfile,
  type ExposureProfileInput,
} from "./contracts";
import { parseWithV3Whitelist } from "../security/whitelist";

function assertServerOnly(): void {
  if (typeof window !== "undefined") {
    throw new Error("planning v3 exposure store is server-only.");
  }
}

export function resolveExposureDir(cwd = process.cwd()): string {
  return path.join(resolveDataDir({ cwd }), "exposure");
}

export function resolveExposureProfilePath(cwd = process.cwd()): string {
  return path.join(resolveExposureDir(cwd), "profile.json");
}

function atomicWriteJson(filePath: string, value: unknown): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const temp = path.join(dir, `.tmp-${randomUUID()}.json`);
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
  fs.renameSync(temp, filePath);
}

export function readExposureProfile(cwd = process.cwd()): ExposureProfile | null {
  assertServerOnly();
  const filePath = resolveExposureProfilePath(cwd);
  if (!fs.existsSync(filePath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as unknown;
    return normalizeExposureProfile(parsed);
  } catch {
    return null;
  }
}

export function saveExposureProfile(input: unknown, cwd = process.cwd()): ExposureProfile {
  assertServerOnly();
  const normalizedInput: ExposureProfileInput = parseExposureProfileInput(input);
  const next = parseWithV3Whitelist(ExposureProfileSchema, normalizeExposureProfile({
    ...normalizedInput,
    savedAt: new Date().toISOString(),
  }), {
    scope: "persistence",
    context: "exposure.store.profile",
  });

  atomicWriteJson(resolveExposureProfilePath(cwd), next);
  return next;
}
