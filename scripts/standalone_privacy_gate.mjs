import fs from "node:fs";
import path from "node:path";
import { PUBLIC_SNAPSHOT_FILES } from "./public_snapshot_assets.mjs";

// Privacy gate for generated standalone output. It inspects paths, entry types and link targets only; file contents
// are never read. Next.js copies every traced file into `<distDir>/standalone` and additionally copies the source
// `.env`/`.env.production` (next/dist/build/index.js writeStandaloneDirectory), so the trace exclusions in
// next.config.ts are re-checked here and a build only gets a receipt when everything passes.

export const STANDALONE_PRIVACY_RECEIPT = "standalone-privacy-receipt.json";
export const STANDALONE_PRIVACY_RECEIPT_VERSION = 1;
export const TRACE_COPY_FAILURE_PATTERN = /Failed to copy traced files/;
// A warning may span chunks; output from the other stream must not interrupt or complete it.
export function createTraceCopyFailureDetector() {
  const tails = { stdout: "", stderr: "" };
  let seen = false;
  return {
    push(stream, chunk) {
      const text = tails[stream] + (typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
      if (TRACE_COPY_FAILURE_PATTERN.test(text)) seen = true;
      tails[stream] = text.slice(-128);
      return seen;
    },
    get seen() { return seen; },
  };
}
// Known source-only alias links that the desktop builder omits (planning_v2_desktop_build.mjs).
export const SOURCE_ONLY_STANDALONE_ALIASES = Object.freeze([
  "tmp/txn-batch-detail-client-audit.tsx",
  "tmp/flow-v3-import-to-cashflow-audit.spec.ts",
]);

const PRIVATE_TOP_LEVEL = new Set(["tmp", "work", "__meta", ".claude", ".dist", ".git", ".data", "finance-private-backups"]);
const CREDENTIAL_NAMES = new Set([".npmrc", ".netrc", ".pgpass", ".git-credentials", "credentials.json", "service-account.json"]);
const ATTEMPT_MARKER = /^finlife_(deposit|saving|mortgage-loan|rent-house-loan|credit-loan)_sync_attempt\.json$/;
const OFFICIAL = new Set(PUBLIC_SNAPSHOT_FILES);
const MAX_REPORTED = 200;

const toPosix = (value) => String(value).split(path.sep).join("/");
const within = (root, candidate) => {
  const relative = path.relative(root, candidate);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
};
const lstatOrNull = (target) => fs.lstatSync(target, { throwIfNoEntry: false }) ?? null;

// Returns the private class of a project- or output-relative path, or null for a deployable path.
export function classifyPrivatePath(relativePath) {
  const rel = toPosix(relativePath).replace(/^\.\//, "");
  if (!rel || rel === ".") return null;
  const segments = rel.split("/");
  const base = segments[segments.length - 1];
  if (PRIVATE_TOP_LEVEL.has(segments[0])) return `private-directory:${segments[0]}`;
  if (segments.some((segment) => segment === "private-after" || segment === "finance-private-backups")) return "private-backup";
  if ((/^\.env(\..+)?$/i.test(base) || /^env\.local$/i.test(base)) && !/\.example$/i.test(base)) return "real-env-file";
  if (/\.(db|sqlite|sqlite3)(-(wal|shm|journal))?$/i.test(base)) return "database-file";
  if (CREDENTIAL_NAMES.has(base.toLowerCase()) || /\.(pem|key|p12|pfx)$/i.test(base) || /^id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/i.test(base)) {
    return "credential-file";
  }
  return null;
}

// Full counts per violation code are kept separately from the bounded list of reported samples.
function createReport() {
  const seen = new Set();
  const violations = [];
  const byCode = {};
  let total = 0;
  return {
    add(code, entryPath) {
      const key = `${code}\0${entryPath}`;
      if (seen.has(key)) return;
      seen.add(key);
      total += 1;
      byCode[code] = (byCode[code] ?? 0) + 1;
      if (violations.length < MAX_REPORTED) violations.push({ code, path: entryPath });
    },
    result(counts) {
      return { ok: total === 0, violationCount: total, violationsByCode: byCode, violations, counts };
    },
  };
}

function mergeByCode(...results) {
  const merged = {};
  for (const result of results) {
    for (const [code, count] of Object.entries(result.violationsByCode ?? {})) merged[code] = (merged[code] ?? 0) + count;
  }
  return merged;
}

function walkTrace(distDirPath) {
  const files = [];
  for (const name of ["next-server.js.nft.json", "next-minimal-server.js.nft.json"]) {
    const candidate = path.join(distDirPath, name);
    if (lstatOrNull(candidate)?.isFile()) files.push(candidate);
  }
  const serverDir = path.join(distDirPath, "server");
  const stack = lstatOrNull(serverDir)?.isDirectory() ? [serverDir] : [];
  while (stack.length > 0) {
    const dir = stack.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(entryPath);
      else if (entry.isFile() && entry.name.endsWith(".nft.json")) files.push(entryPath);
    }
  }
  return files.sort();
}

// Every file Next.js will copy into standalone comes from these trace lists (next/dist/build/utils.js copyTracedFiles).
export function auditBuildTraces({ projectRoot, distDir = ".next" }) {
  const root = fs.realpathSync(projectRoot);
  const distDirPath = path.join(root, distDir);
  const report = createReport();
  let entries = 0;
  const traceFiles = walkTrace(distDirPath);
  for (const traceFile of traceFiles) {
    const trace = JSON.parse(fs.readFileSync(traceFile, "utf8"));
    for (const entry of Array.isArray(trace.files) ? trace.files : []) {
      entries += 1;
      const absolute = path.resolve(path.dirname(traceFile), entry);
      if (absolute === root) {
        report.add("trace-project-root", ".");
        continue;
      }
      if (!within(root, absolute)) {
        report.add("trace-outside-project", toPosix(path.relative(root, absolute)));
        continue;
      }
      const relative = toPosix(path.relative(root, absolute));
      const stats = lstatOrNull(absolute);
      if (stats?.isDirectory()) report.add("trace-directory", relative);
      const privateClass = classifyPrivatePath(relative);
      if (privateClass) report.add(privateClass, relative);
    }
  }
  return report.result({ traceFiles: traceFiles.length, traceEntries: entries });
}

function officialSourceLinkTargets(projectRoot, distDir) {
  return new Map([
    [toPosix(path.join(distDir, "static")), path.join(projectRoot, distDir, "static")],
    ["public", path.join(projectRoot, "public")],
    ["prisma", path.join(projectRoot, "prisma")],
  ]);
}

function auditDataDirectory(dataDir, phase, report) {
  const stats = lstatOrNull(dataDir);
  if (!stats) {
    report.add("standalone-data-missing", ".data");
    return 0;
  }
  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    report.add("standalone-data-not-directory", ".data");
    return 0;
  }
  let official = 0;
  for (const entry of fs.readdirSync(dataDir, { withFileTypes: true })) {
    const entryStats = fs.lstatSync(path.join(dataDir, entry.name));
    const regular = entryStats.isFile() && !entryStats.isSymbolicLink() && entryStats.nlink === 1;
    const allowed = OFFICIAL.has(entry.name) || (phase === "build" && ATTEMPT_MARKER.test(entry.name));
    if (!allowed) report.add("standalone-data-unexpected-entry", `.data/${entry.name}`);
    else if (!regular) report.add("standalone-data-not-regular", `.data/${entry.name}`);
    else if (OFFICIAL.has(entry.name)) official += 1;
  }
  if (official !== OFFICIAL.size) report.add("standalone-data-official-incomplete", ".data");
  return official;
}

// phase "build": just after `next build` + public snapshot preparation; no link may leave standalone.
// phase "source-input": a source standalone about to be packaged; runtime links to the project's own
//   <distDir>/static, public and prisma are allowed with their exact targets, and the builder's known source-only
//   aliases are tolerated because they are omitted from the artifact. `.data` is skipped (never copied).
// phase "artifact-final": packaged standalone; no external link at all and `.data` is exactly the official files.
export function auditStandaloneTree({ standaloneDir, phase, projectRoot = "", distDir = ".next" }) {
  if (!["build", "source-input", "artifact-final"].includes(phase)) throw new Error(`unknown standalone audit phase: ${phase}`);
  const report = createReport();
  const standaloneStats = lstatOrNull(standaloneDir);
  if (!standaloneStats || standaloneStats.isSymbolicLink() || !standaloneStats.isDirectory()) {
    report.add("standalone-not-directory", ".");
    return report.result({ files: 0, directories: 0, links: 0, publicSnapshots: 0 });
  }
  const standaloneReal = fs.realpathSync(standaloneDir);
  const officialLinks = phase === "source-input" && projectRoot ? officialSourceLinkTargets(fs.realpathSync(projectRoot), distDir) : new Map();
  const counts = { files: 0, directories: 0, links: 0, publicSnapshots: 0 };
  let dataSeen = false;
  const stack = [""];
  while (stack.length > 0) {
    const relativeDir = stack.pop();
    for (const entry of fs.readdirSync(path.join(standaloneReal, relativeDir), { withFileTypes: true })) {
      const relative = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
      const absolute = path.join(standaloneReal, relative);
      const stats = fs.lstatSync(absolute);
      if (relative === ".data") {
        dataSeen = true;
        if (phase !== "source-input") counts.publicSnapshots = auditDataDirectory(absolute, phase, report);
        continue;
      }
      // The builder omits its known source-only alias links (they are never copied).
      if (phase === "source-input" && stats.isSymbolicLink() && SOURCE_ONLY_STANDALONE_ALIASES.includes(relative)) continue;
      if (stats.isSymbolicLink()) {
        counts.links += 1;
        const privateClass = classifyPrivatePath(relative);
        if (privateClass) report.add(privateClass, relative);
        const officialTarget = officialLinks.get(relative);
        // On a packaging input every other link is materialized or rejected by the desktop builder itself
        // (escaping, dangling, file and cyclic links have dedicated errors there); the final audit allows none.
        if (phase === "source-input" && officialTarget === undefined) continue;
        let targetReal;
        try { targetReal = fs.realpathSync(absolute); } catch { report.add("standalone-dangling-link", relative); continue; }
        const officialOk = officialTarget !== undefined && fs.existsSync(officialTarget) && targetReal === fs.realpathSync(officialTarget);
        if (!within(standaloneReal, targetReal) && !officialOk) report.add("standalone-external-link", relative);
        continue;
      }
      // Directories are walked, not judged by name: every file or link below a private directory is reported with
      // its own path, and an empty directory carries no data.
      if (stats.isDirectory()) {
        counts.directories += 1;
        stack.push(relative);
        continue;
      }
      const privateClass = classifyPrivatePath(relative);
      if (privateClass) report.add(privateClass, relative);
      if (stats.isFile()) {
        counts.files += 1;
      } else if (phase !== "source-input") {
        // Packaging inputs keep the desktop builder's dedicated unsupported-entry error.
        report.add("standalone-unsupported-entry", relative);
      }
    }
  }
  if (phase !== "source-input" && !dataSeen) report.add("standalone-data-missing", ".data");
  return report.result(counts);
}

// Whole packaged artifact: the standalone tree with the strict final rules, and every other entry by name and type.
export function auditArtifactTree({ artifactDir }) {
  const report = createReport();
  const artifactReal = fs.realpathSync(artifactDir);
  const standaloneRelative = ".next/standalone";
  const standalone = auditStandaloneTree({ standaloneDir: path.join(artifactReal, standaloneRelative), phase: "artifact-final" });
  const stack = [""];
  let files = 0;
  while (stack.length > 0) {
    const relativeDir = stack.pop();
    for (const entry of fs.readdirSync(path.join(artifactReal, relativeDir), { withFileTypes: true })) {
      const relative = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
      if (relative === standaloneRelative) continue;
      const stats = fs.lstatSync(path.join(artifactReal, relative));
      if (stats.isSymbolicLink()) {
        report.add("artifact-link", relative);
        continue;
      }
      if (stats.isDirectory()) {
        stack.push(relative);
        continue;
      }
      const privateClass = classifyPrivatePath(relative);
      if (privateClass) report.add(privateClass, relative);
      if (stats.isFile()) files += 1;
      else report.add("artifact-unsupported-entry", relative);
    }
  }
  const own = report.result({ nonStandaloneFiles: files });
  return {
    ok: standalone.ok && own.ok,
    violationCount: standalone.violationCount + own.violationCount,
    violationsByCode: mergeByCode(standalone, own),
    violations: [
      ...standalone.violations.map((v) => ({ ...v, path: `${standaloneRelative}/${v.path}` })),
      ...own.violations,
    ].slice(0, MAX_REPORTED),
    counts: { ...standalone.counts, ...own.counts },
  };
}

export function formatPrivacyViolations(result, limit = 20) {
  const shown = result.violations.slice(0, limit).map((entry) => `${entry.code} ${entry.path}`).join("; ");
  const rest = result.violationCount - Math.min(limit, result.violations.length);
  return rest > 0 ? `${shown}; +${rest} more` : shown;
}

function resolveStandaloneDir(projectRoot, distDir) {
  const root = fs.realpathSync(projectRoot);
  const distDirPath = path.resolve(root, distDir);
  if (!within(root, distDirPath)) throw new Error(`build output directory escapes the project root: ${distDir}`);
  return { root, distDirPath, standaloneDir: path.join(distDirPath, "standalone") };
}

// Next.js copies the source `.env` into standalone; the launcher already passes the source env files to the server
// (planning_v2_desktop_env.mjs), so only that exact generated copy is removed. `.env.production` is never removed
// here: its presence stops the build so the settings it carries are not lost silently.
export function removeGeneratedStandaloneEnv({ projectRoot, distDir = ".next" }) {
  const { root, standaloneDir } = resolveStandaloneDir(projectRoot, distDir);
  const standaloneStats = lstatOrNull(standaloneDir);
  if (!standaloneStats) return { removed: false };
  if (standaloneStats.isSymbolicLink() || !standaloneStats.isDirectory() || fs.realpathSync(standaloneDir) !== standaloneDir) {
    throw new Error("standalone output must be a canonical directory inside the project");
  }
  if (lstatOrNull(path.join(standaloneDir, ".env.production"))) {
    throw new Error("generated standalone .env.production found; it is not removed automatically (decide how its settings reach the server first)");
  }
  const target = path.join(standaloneDir, ".env");
  const stats = lstatOrNull(target);
  if (!stats) return { removed: false };
  if (stats.isSymbolicLink() || !stats.isFile() || stats.nlink !== 1 || fs.realpathSync(target) !== target) {
    throw new Error("generated standalone .env is not a plain single-link file; refusing to remove it");
  }
  const source = lstatOrNull(path.join(root, ".env"));
  if (source && source.dev === stats.dev && source.ino === stats.ino) {
    throw new Error("generated standalone .env resolves to the source .env; refusing to remove it");
  }
  fs.unlinkSync(target);
  return { removed: true };
}

function readBuildId(distDirPath) {
  const file = path.join(distDirPath, "BUILD_ID");
  const stats = lstatOrNull(file);
  if (!stats || stats.isSymbolicLink() || !stats.isFile()) return "";
  return fs.readFileSync(file, "utf8").trim();
}

function receiptPath(distDirPath) {
  return path.join(distDirPath, STANDALONE_PRIVACY_RECEIPT);
}

export function invalidateStandalonePrivacyReceipt({ projectRoot, distDir = ".next" }) {
  const { distDirPath } = resolveStandaloneDir(projectRoot, distDir);
  const file = receiptPath(distDirPath);
  const stats = lstatOrNull(file);
  if (!stats) return false;
  if (stats.isSymbolicLink() || !stats.isFile()) throw new Error("standalone privacy receipt is not a regular file");
  fs.unlinkSync(file);
  return true;
}

export function writeStandalonePrivacyReceipt({ projectRoot, distDir = ".next", summary = {} }) {
  const { distDirPath, standaloneDir } = resolveStandaloneDir(projectRoot, distDir);
  const buildId = readBuildId(distDirPath);
  if (!buildId) throw new Error("build output has no BUILD_ID; cannot issue a standalone privacy receipt");
  const standaloneBuildId = readBuildId(path.join(standaloneDir, toPosix(distDir)));
  if (standaloneBuildId !== buildId) throw new Error("standalone BUILD_ID does not match the build output");
  const receipt = { version: STANDALONE_PRIVACY_RECEIPT_VERSION, distDir: toPosix(distDir), buildId, issuedAt: new Date().toISOString(), summary };
  fs.writeFileSync(receiptPath(distDirPath), `${JSON.stringify(receipt, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o644 });
  return receipt;
}

// Source runtime check: the selected build output must carry a receipt for its current BUILD_ID.
export function verifyStandalonePrivacyReceipt({ projectRoot, distDir = ".next" }) {
  const { distDirPath, standaloneDir } = resolveStandaloneDir(projectRoot, distDir);
  const file = receiptPath(distDirPath);
  const stats = lstatOrNull(file);
  const stale = (reason) => new Error(`standalone privacy receipt ${reason} for ${toPosix(distDir)}; run \`pnpm build\` so the privacy gate can pass first`);
  if (!stats) throw stale("is missing");
  if (stats.isSymbolicLink() || !stats.isFile()) throw stale("is not a regular file");
  let receipt;
  try { receipt = JSON.parse(fs.readFileSync(file, "utf8")); } catch { throw stale("is unreadable"); }
  const buildId = readBuildId(distDirPath);
  if (receipt?.version !== STANDALONE_PRIVACY_RECEIPT_VERSION || receipt.distDir !== toPosix(distDir) || !buildId || receipt.buildId !== buildId) {
    throw stale("does not match the current BUILD_ID");
  }
  if (lstatOrNull(standaloneDir) && readBuildId(path.join(standaloneDir, toPosix(distDir))) !== buildId) {
    throw stale("does not match the standalone BUILD_ID");
  }
  return receipt;
}

// next_prod_safe decision: a source build needs a receipt for the selected standalone output, or for the requested
// next-start output when no standalone exists. Only a managed installation with a standalone runtime is exempt;
// its identity is asserted by preparePublicSnapshotRuntime and its checksum was verified at install time.
export function verifySourceRuntimePrivacyReceipt({ projectRoot, standaloneDistDir = "", requestedDistDir = "", managedInstallation = false }) {
  if (managedInstallation && standaloneDistDir) return { checked: false, reason: "managed-installation" };
  const distDir = standaloneDistDir || requestedDistDir || ".next";
  const receipt = verifyStandalonePrivacyReceipt({ projectRoot, distDir });
  return { checked: true, distDir, buildId: receipt.buildId };
}

export function auditStandaloneBuild({ projectRoot, distDir = ".next" }) {
  const { standaloneDir } = resolveStandaloneDir(projectRoot, distDir);
  const traces = auditBuildTraces({ projectRoot, distDir });
  const standalone = auditStandaloneTree({ standaloneDir, phase: "build", projectRoot, distDir });
  const violations = [...traces.violations.map((v) => ({ ...v, path: `trace:${v.path}` })), ...standalone.violations.map((v) => ({ ...v, path: `standalone:${v.path}` }))];
  return {
    ok: traces.ok && standalone.ok,
    violationCount: traces.violationCount + standalone.violationCount,
    violationsByCode: { trace: traces.violationsByCode, standalone: standalone.violationsByCode },
    violations: violations.slice(0, MAX_REPORTED),
    counts: { ...traces.counts, ...standalone.counts },
  };
}
