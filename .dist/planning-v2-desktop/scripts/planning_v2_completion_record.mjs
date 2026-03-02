import fs from "node:fs/promises";
import path from "node:path";
import { readJsonIfExists, writeJsonAtomic } from "./planning_v2_ops_common.mjs";

const RECORD_REL = ".data/planning/release/V2_COMPLETION_RECORD.json";

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function parseArgs(argv) {
  let version = "";
  let baseUrl = "";
  for (const token of argv) {
    if (!token.startsWith("--")) continue;
    const [rawKey, ...rest] = token.slice(2).split("=");
    const key = asString(rawKey);
    const value = asString(rest.join("="));
    if (key === "version") version = value;
    if (key === "base-url") baseUrl = value;
  }
  return { version, baseUrl };
}

async function statIfExists(absPath) {
  try {
    const stat = await fs.stat(absPath);
    if (!stat.isFile()) return null;
    return stat;
  } catch (error) {
    const nodeError = error;
    if (nodeError?.code === "ENOENT") return null;
    throw error;
  }
}

async function readTextIfExists(absPath) {
  try {
    return await fs.readFile(absPath, "utf8");
  } catch (error) {
    const nodeError = error;
    if (nodeError?.code === "ENOENT") return "";
    throw error;
  }
}

function normalizeRel(cwd, absPath) {
  return path.relative(cwd, absPath).replaceAll("\\", "/");
}

async function pickLatestExisting(cwd, candidateRelPaths) {
  const rows = [];
  for (const relPath of candidateRelPaths) {
    const absPath = path.resolve(cwd, relPath);
    const stat = await statIfExists(absPath);
    if (!stat) continue;
    rows.push({
      relPath: normalizeRel(cwd, absPath),
      absPath,
      mtimeMs: stat.mtimeMs,
    });
  }
  if (rows.length < 1) return null;
  rows.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return rows[0];
}

function inferGateOk(logText) {
  const text = asString(logText);
  if (!text) return false;
  if (/status\s*=\s*SKIPPED/i.test(text)) return false;
  if (/exitCode\s*=\s*0/i.test(text)) return true;
  if (/exit\s*=\s*0/i.test(text)) return true;
  if (/\bFAIL\b/i.test(text)) return false;
  if (/\bPASS\b/i.test(text)) return true;
  return false;
}

async function resolveGate(cwd, candidates) {
  const picked = await pickLatestExisting(cwd, candidates);
  if (!picked) return { ok: false, log: "" };
  const text = await readTextIfExists(picked.absPath);
  return {
    ok: inferGateOk(text),
    log: picked.relPath,
  };
}

async function main() {
  const cwd = path.resolve(process.cwd());
  const args = parseArgs(process.argv.slice(2));
  const version = asString(args.version);
  const baseUrl = asString(args.baseUrl);
  if (!version) {
    throw new Error("missing required option: --version");
  }

  const recordAbs = path.resolve(cwd, RECORD_REL);
  const existing = await readJsonIfExists(recordAbs);
  if (existing && asString(existing.version) === version) {
    console.log(normalizeRel(cwd, recordAbs));
    return;
  }

  const completeGate = await resolveGate(cwd, [
    ".data/planning/release/logs/complete.log",
    `.data/planning/release/logs/final-report-${version}-complete.log`,
  ]);
  const regressGate = await resolveGate(cwd, [
    ".data/planning/release/logs/regress.log",
    `.data/planning/release/logs/final-report-${version}-regress.log`,
  ]);
  const acceptanceGate = await resolveGate(cwd, [
    ".data/planning/release/logs/acceptance.log",
    `.data/planning/release/logs/final-report-${version}-acceptance.log`,
  ]);

  const finalReportRel = `docs/releases/planning-v2-final-report-${version}.md`;
  const releaseNotesRel = `docs/releases/planning-v2-${version}.md`;
  const evidenceBundleRel = `.data/planning/release/planning-v2-evidence-${version}.tar.gz`;

  const finalReportExists = await statIfExists(path.resolve(cwd, finalReportRel));
  const releaseNotesExists = await statIfExists(path.resolve(cwd, releaseNotesRel));
  const evidenceBundleExists = await statIfExists(path.resolve(cwd, evidenceBundleRel));

  const record = {
    version,
    completedAt: new Date().toISOString(),
    gates: {
      complete: completeGate,
      regress: regressGate,
      acceptance: {
        ...acceptanceGate,
        ...(baseUrl ? { baseUrl } : {}),
      },
    },
    artifacts: {
      finalReport: finalReportExists ? finalReportRel : "",
      releaseNotes: releaseNotesExists ? releaseNotesRel : "",
      evidenceBundle: evidenceBundleExists ? evidenceBundleRel : "",
    },
  };

  await writeJsonAtomic(recordAbs, record);
  console.log(normalizeRel(cwd, recordAbs));
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(`[planning:v2:record] FAIL\n${message}`);
  process.exit(1);
});
