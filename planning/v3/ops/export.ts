import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { encodeZip, type ZipFileEntry } from "../../../src/lib/ops/backup/zipCodec";

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

type ParsedArgs = {
  out?: string;
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
  for (const token of argv) {
    const normalized = asString(token);
    if (!normalized.startsWith("--")) continue;
    if (normalized.startsWith("--out=")) {
      out = normalized.slice("--out=".length);
    }
  }
  return out ? { out } : {};
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

function printSummary(plan: V3ExportPlan): void {
  console.log(`[v3:export] generatedAt=${plan.generatedAt}`);
  console.log(`[v3:export] totals scanned=${plan.totals.scannedFiles} exported=${plan.totals.exportedFiles} skipped=${plan.totals.skippedFiles} sourceBytes=${plan.totals.sourceBytes}`);
  for (const row of plan.sections) {
    console.log(`[v3:export] ${row.section} (${row.relDir}) scanned=${row.scannedFiles} exported=${row.exportedFiles} skipped=${row.skippedFiles} bytes=${row.bytes}`);
  }
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
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
  main();
}
