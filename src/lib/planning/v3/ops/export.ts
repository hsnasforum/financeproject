import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertPlanningOwnerAuxiliaryPathOutsideOwners,
  buildPlanningOwnerArchive,
  readPlanningOwnerSecretFile,
  writePlanningOwnerArchiveFile,
} from "@/lib/ops/backup/planningOwnerArchive";
import {
  createPlanningArchiveContext,
  resolvePlanningDataOwners,
} from "@/lib/ops/backup/planningOwnerRegistry";
import { encodeZip, type ZipFileEntry } from "@/lib/ops/backup/zipCodec";

type V3ExportSection = {
  key: string;
  relDir: string;
};

export type V3ExportSectionSummary = {
  section: string;
  relDir: string;
  scannedFiles: number;
  exportedFiles: number;
  skippedFiles: number;
  bytes: number;
};

export type V3ExportSummary = {
  generatedAt: string;
  archivePath: string;
  archiveBytes: number;
  totals: {
    scannedFiles: number;
    exportedFiles: number;
    skippedFiles: number;
    sourceBytes: number;
  };
  sections: V3ExportSectionSummary[];
};

type V3ExportPlan = {
  generatedAt: string;
  archivePath: string;
  entries: ZipFileEntry[];
  totals: V3ExportSummary["totals"];
  sections: V3ExportSectionSummary[];
};

type BuildV3ExportInput = {
  cwd?: string;
  out?: string;
  now?: Date;
};

export type V3OwnerExportSummary = {
  archiveFormat: "planning-owner-vault-v1";
  generatedAt: string;
  archivePath: string;
  archiveBytes: number;
  encryptedBytes: number;
  owners: number;
  files: number;
  sourceBytes: number;
  emptyOwners: number;
  missingLocations: number;
};

type RunV3OwnerExportInput = {
  cwd?: string;
  out?: string;
  now?: Date;
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  userId?: string;
  appVersion?: string;
  secret: Uint8Array;
  confirmQuiesced: boolean;
};

type ParsedArgs = {
  out?: string;
  format: "legacy" | "owner";
  passphraseFile?: string;
  confirmQuiesced: boolean;
};

const V3_EXPORT_SECTIONS: V3ExportSection[] = [
  { key: "news", relDir: ".data/news" },
  { key: "indicators", relDir: ".data/indicators" },
  { key: "alerts", relDir: ".data/alerts" },
  { key: "journal", relDir: ".data/journal" },
  { key: "exposure", relDir: ".data/exposure" },
  { key: "planningV3Drafts", relDir: ".data/planning_v3_drafts" },
];

const SECRET_FILE_RE = /(^|[._-])(secret|token|credential|password|passwd|private[_-]?key|api[_-]?key)([._-]|$)/i;
const ENV_FILE_RE = /(^|\/)\.env(?:\.|$)/i;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toPosix(filePath: string): string {
  return filePath.replaceAll("\\", "/");
}

function parseArgs(argv: string[]): ParsedArgs {
  let out = "";
  let format: ParsedArgs["format"] = "legacy";
  let passphraseFile = "";
  let confirmQuiesced = false;
  for (const token of argv) {
    const normalized = asString(token);
    if (!normalized.startsWith("--")) continue;
    if (normalized.startsWith("--passphrase=")) {
      throw new Error("ARG_FORBIDDEN:--passphrase=<literal>");
    }
    if (normalized === "--ack-quiesced") {
      confirmQuiesced = true;
      continue;
    }
    if (normalized.startsWith("--format=")) {
      const requested = normalized.slice("--format=".length);
      if (requested !== "legacy" && requested !== "owner") {
        throw new Error("ARG_INVALID:--format=<legacy|owner>");
      }
      format = requested;
      continue;
    }
    if (normalized.startsWith("--passphrase-file=")) {
      passphraseFile = normalized.slice("--passphrase-file=".length);
      continue;
    }
    if (normalized.startsWith("--out=")) {
      out = normalized.slice("--out=".length);
    }
  }
  return {
    format,
    confirmQuiesced,
    ...(out ? { out } : {}),
    ...(passphraseFile ? { passphraseFile } : {}),
  };
}

function formatStamp(now: Date): string {
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  const hh = String(now.getUTCHours()).padStart(2, "0");
  const mi = String(now.getUTCMinutes()).padStart(2, "0");
  const ss = String(now.getUTCSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}${hh}${mi}${ss}`;
}

function collectFilesRecursively(rootDir: string): string[] {
  if (!fs.existsSync(rootDir)) return [];
  const out: string[] = [];

  const walk = (currentDir: string): void => {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      const absolutePath = path.join(currentDir, entry.name);
      if (entry.isSymbolicLink()) {
        continue;
      }
      if (entry.isDirectory()) {
        walk(absolutePath);
        continue;
      }
      if (entry.isFile()) {
        out.push(absolutePath);
      }
    }
  };

  walk(rootDir);
  return out.sort((a, b) => a.localeCompare(b));
}

function resolveArchivePath(rootDir: string, outPath: string | undefined, now: Date): string {
  const normalizedOut = asString(outPath);
  if (normalizedOut) {
    return path.isAbsolute(normalizedOut)
      ? normalizedOut
      : path.resolve(rootDir, normalizedOut);
  }
  const stamp = formatStamp(now);
  return path.join(rootDir, ".data", "exports", `v3-data-backup-${stamp}.zip`);
}

function resolveOwnerArchivePath(rootDir: string, outPath: string | undefined, now: Date): string {
  const normalizedOut = asString(outPath);
  if (normalizedOut) {
    return path.isAbsolute(normalizedOut)
      ? normalizedOut
      : path.resolve(rootDir, normalizedOut);
  }
  return path.join(rootDir, ".data", "exports", `v3-owner-backup-${formatStamp(now)}.owner.enc.json`);
}

function shouldSkipForSafety(relativePath: string): boolean {
  const normalized = toPosix(relativePath).toLowerCase();
  if (ENV_FILE_RE.test(normalized)) return true;
  const baseName = path.posix.basename(normalized);
  if (baseName.startsWith(".env")) return true;
  return SECRET_FILE_RE.test(baseName);
}

export function buildV3ExportPlan(input: BuildV3ExportInput = {}): V3ExportPlan {
  const rootDir = path.resolve(asString(input.cwd) || process.cwd());
  const now = input.now instanceof Date ? input.now : new Date();
  const archivePath = resolveArchivePath(rootDir, input.out, now);

  const sections: V3ExportSectionSummary[] = [];
  const entries: ZipFileEntry[] = [];
  let scannedFiles = 0;
  let exportedFiles = 0;
  let skippedFiles = 0;
  let sourceBytes = 0;

  for (const section of V3_EXPORT_SECTIONS) {
    const sectionRoot = path.join(rootDir, section.relDir);
    const sectionSummary: V3ExportSectionSummary = {
      section: section.key,
      relDir: section.relDir,
      scannedFiles: 0,
      exportedFiles: 0,
      skippedFiles: 0,
      bytes: 0,
    };

    for (const absolutePath of collectFilesRecursively(sectionRoot)) {
      const relToRoot = toPosix(path.relative(rootDir, absolutePath));
      if (!relToRoot || relToRoot.startsWith("..")) {
        sectionSummary.skippedFiles += 1;
        skippedFiles += 1;
        continue;
      }

      sectionSummary.scannedFiles += 1;
      scannedFiles += 1;

      const normalizedAbsolute = path.resolve(absolutePath);
      if (normalizedAbsolute === archivePath || shouldSkipForSafety(relToRoot)) {
        sectionSummary.skippedFiles += 1;
        skippedFiles += 1;
        continue;
      }

      const bytes = fs.readFileSync(absolutePath);
      entries.push({
        path: relToRoot,
        bytes,
      });
      sectionSummary.exportedFiles += 1;
      sectionSummary.bytes += bytes.length;
      exportedFiles += 1;
      sourceBytes += bytes.length;
    }

    sections.push(sectionSummary);
  }

  return {
    generatedAt: now.toISOString(),
    archivePath,
    entries,
    totals: {
      scannedFiles,
      exportedFiles,
      skippedFiles,
      sourceBytes,
    },
    sections,
  };
}

export function writeV3ExportArchive(plan: V3ExportPlan): V3ExportSummary {
  fs.mkdirSync(path.dirname(plan.archivePath), { recursive: true });
  const zipBytes = encodeZip(plan.entries);
  fs.writeFileSync(plan.archivePath, zipBytes);

  return {
    generatedAt: plan.generatedAt,
    archivePath: plan.archivePath,
    archiveBytes: zipBytes.length,
    totals: plan.totals,
    sections: plan.sections,
  };
}

export function runV3Export(input: BuildV3ExportInput = {}): V3ExportSummary {
  const plan = buildV3ExportPlan(input);
  return writeV3ExportArchive(plan);
}

export async function runV3OwnerExport(input: RunV3OwnerExportInput): Promise<V3OwnerExportSummary> {
  const rootDir = path.resolve(asString(input.cwd) || process.cwd());
  const now = input.now instanceof Date ? input.now : new Date();
  const context = createPlanningArchiveContext({
    cwd: rootDir,
    env: input.env,
    platform: input.platform,
    userId: input.userId,
  });
  const owners = resolvePlanningDataOwners(context);
  const archivePath = resolveOwnerArchivePath(rootDir, input.out, now);
  await assertPlanningOwnerAuxiliaryPathOutsideOwners({
    owners,
    candidatePath: archivePath,
    platform: context.platform,
    purpose: "archive",
  });
  const built = await buildPlanningOwnerArchive({
    context,
    owners,
    archiveId: crypto.randomUUID(),
    generatedAt: now.toISOString(),
    appVersion: asString(input.appVersion) || asString(process.env.npm_package_version) || "unknown",
    secret: input.secret,
    confirmQuiesced: input.confirmQuiesced,
  });
  try {
    await writePlanningOwnerArchiveFile({
      archivePath,
      encryptedBytes: built.encryptedBytes,
      owners,
      platform: context.platform,
    });
    return {
      archiveFormat: "planning-owner-vault-v1",
      generatedAt: built.manifest.generatedAt,
      archivePath,
      archiveBytes: built.archiveBytes,
      encryptedBytes: built.encryptedBytesLength,
      owners: built.manifest.owners.length,
      files: built.collectionSummary.files,
      sourceBytes: built.collectionSummary.bytes,
      emptyOwners: built.collectionSummary.emptyOwnerIds.length,
      missingLocations: built.collectionSummary.missingLocations,
    };
  } finally {
    built.encryptedBytes.fill(0);
  }
}

function printSummary(plan: V3ExportPlan): void {
  console.log(`[v3:export] generatedAt=${plan.generatedAt}`);
  console.log(`[v3:export] totals scanned=${plan.totals.scannedFiles} exported=${plan.totals.exportedFiles} skipped=${plan.totals.skippedFiles} sourceBytes=${plan.totals.sourceBytes}`);
  for (const row of plan.sections) {
    console.log(`[v3:export] ${row.section} (${row.relDir}) scanned=${row.scannedFiles} exported=${row.exportedFiles} skipped=${row.skippedFiles} bytes=${row.bytes}`);
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.format === "owner") {
    if (!args.passphraseFile) {
      throw new Error("ARG_REQUIRED:--passphrase-file=<path>");
    }
    const rootDir = process.cwd();
    const context = createPlanningArchiveContext({ cwd: rootDir });
    const owners = resolvePlanningDataOwners(context);
    const secretPath = path.resolve(rootDir, args.passphraseFile);
    await assertPlanningOwnerAuxiliaryPathOutsideOwners({
      owners,
      candidatePath: secretPath,
      platform: context.platform,
      purpose: "secret",
    });
    const secret = await readPlanningOwnerSecretFile({
      secretPath,
      platform: context.platform,
    });
    try {
      const result = await runV3OwnerExport({
        out: args.out,
        secret,
        confirmQuiesced: args.confirmQuiesced,
      });
      console.log(`[v3:export] format=${result.archiveFormat} generatedAt=${result.generatedAt}`);
      console.log(`[v3:export] totals owners=${result.owners} files=${result.files} emptyOwners=${result.emptyOwners} missingLocations=${result.missingLocations} sourceBytes=${result.sourceBytes}`);
      console.log(`[v3:export] archive=${result.archivePath}`);
      console.log(`[v3:export] archiveBytes=${result.archiveBytes} encryptedBytes=${result.encryptedBytes}`);
    } finally {
      secret.fill(0);
    }
    return;
  }
  const plan = buildV3ExportPlan({ out: args.out });
  printSummary(plan);
  const result = writeV3ExportArchive(plan);
  console.log(`[v3:export] archive=${result.archivePath}`);
  console.log(`[v3:export] archiveBytes=${result.archiveBytes}`);
}

const isMain = (() => {
  if (!process.argv[1]) return false;
  const current = fileURLToPath(import.meta.url);
  return path.resolve(process.argv[1]) === current;
})();

if (isMain) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "export_failed";
    console.error(`[v3:export] ${message}`);
    process.exitCode = 1;
  });
}
