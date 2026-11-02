import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { DAILY_REFRESH_CANONICAL_SNAPSHOT_FILES } from "./daily_refresh_contract.mjs";
import { assertDesktopInstallationIdentity } from "./planning_desktop_install_state.mjs";

export const PUBLIC_SNAPSHOT_FILES = Object.freeze([...DAILY_REFRESH_CANONICAL_SNAPSHOT_FILES]);
const PUBLIC_SET = new Set(PUBLIC_SNAPSHOT_FILES);
const KINDS = ["deposit", "saving", "mortgage-loan", "rent-house-loan", "credit-loan"];
const ATTEMPTS = KINDS.map(kind => "finlife_" + kind + "_sync_attempt.json");
const PHASES = new Set(["db", "snapshot", "completion", "integrity", "fetch"]);
const ERRORS = new Set(["DB_SYNC_FAILED", "SNAPSHOT_WRITE_FAILED", "COMPLETION_WRITE_FAILED", "FINLIFE_INTEGRITY_FAILED", "SYNC_FAILED"]);
const samePath = (a, b) => process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
const inside = (parent, child) => {
  const relative = path.relative(parent, child);
  return relative !== "" && relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative);
};

// Never follow a source/target ancestor junction or a linked/hardlinked leaf.
function plain(target, kind, { missing = false } = {}) {
  const absolute = path.resolve(target);
  const root = path.parse(absolute).root;
  const parts = absolute.slice(root.length).split(path.sep).filter(Boolean);
  let current = root;
  for (let index = 0; index <= parts.length; index++) {
    if (index) current = path.join(current, parts[index - 1]);
    const st = fs.lstatSync(current, { throwIfNoEntry: false });
    if (!st) {
      if (missing && index === parts.length) return null;
      throw new Error("snapshot asset path is missing");
    }
    if (st.isSymbolicLink() || !samePath(fs.realpathSync(current), path.resolve(current))) throw new Error("snapshot asset link/canonical path rejected");
    const leaf = index === parts.length;
    if (leaf && kind === "file") {
      if (!st.isFile() || st.nlink > 1) throw new Error("snapshot asset must be a regular unlinked file");
    } else if (!st.isDirectory()) throw new Error("snapshot asset path must be a regular directory");
  }
  return absolute;
}
function context({ cwd = process.cwd(), standaloneServer, generatedRoot = cwd }) {
  const sourceRoot = plain(cwd, "directory");
  const outputRoot = plain(generatedRoot, "directory");
  const server = plain(standaloneServer, "file");
  const standalone = path.dirname(server);
  if (path.basename(server) !== "server.js" || path.basename(standalone) !== "standalone" || !inside(outputRoot, standalone)) throw new Error("standalone snapshot target is outside the generated root");
  const sourceData = path.join(sourceRoot, ".data");
  if (samePath(sourceData, standalone) || inside(sourceData, standalone) || inside(standalone, sourceData)) throw new Error("standalone snapshot target overlaps source data");
  const dataDir = path.join(standalone, ".data");
  plain(dataDir, "directory", { missing: true });
  return { sourceRoot, standalone, dataDir };
}
function checkLeaf(dataDir, name) {
  if (!PUBLIC_SET.has(name) && !ATTEMPTS.includes(name)) throw new Error("unknown managed snapshot asset");
  return plain(path.join(dataDir, name), "file", { missing: true });
}
function removeKnown(dataDir, name) {
  if (checkLeaf(dataDir, name)) fs.unlinkSync(path.join(dataDir, name));
}
function replaceFile(dataDir, name, source, text) {
  checkLeaf(dataDir, name);
  const temporary = path.join(dataDir, ".snapshot-" + crypto.randomUUID() + ".tmp");
  try {
    if (source) fs.copyFileSync(source, temporary, fs.constants.COPYFILE_EXCL);
    else fs.writeFileSync(temporary, text, { flag: "wx", mode: 0o600 });
    fs.renameSync(temporary, path.join(dataDir, name));
  } finally {
    // Unique file created by this operation in the validated generated directory.
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}
export function copyPublicSnapshots(options) {
  const { sourceRoot, dataDir } = context(options);
  const sourceData = plain(path.join(sourceRoot, ".data"), "directory", { missing: true });
  const inputs = PUBLIC_SNAPSHOT_FILES.map(name => ({ name, file: sourceData ? plain(path.join(sourceData, name), "file", { missing: true }) : null }));
  if (options.required && inputs.some(input => !input.file)) throw new Error("required public snapshot is missing");
  if (fs.existsSync(dataDir)) for (const { name } of inputs) checkLeaf(dataDir, name);
  else fs.mkdirSync(dataDir);
  let copied = 0, removed = 0;
  for (const { name, file } of inputs) {
    if (file) { replaceFile(dataDir, name, file); copied++; }
    else { if (checkLeaf(dataDir, name)) removed++; removeKnown(dataDir, name); }
  }
  return { copied, removed, dataDir };
}
// Runtime check: only the managed names (official nine + known FINLIFE attempt markers) are validated.
// Other entries written by the running app (for example scenarios/overrides.json or *.tmp-*) are neither
// read nor removed and do not block startup. Artifacts keep the strict exact-nine check below.
export function assertManagedSnapshotEntries(dataDir, { required = false } = {}) {
  const directory = plain(dataDir, "directory", { missing: !required });
  if (!directory) return { count: 0 };
  let count = 0;
  for (const name of PUBLIC_SNAPSHOT_FILES) {
    if (plain(path.join(directory, name), "file", { missing: !required })) count++;
  }
  for (const name of ATTEMPTS) plain(path.join(directory, name), "file", { missing: true });
  if (required && count !== PUBLIC_SNAPSHOT_FILES.length) throw new Error("required public snapshot is missing");
  return { count };
}
export function assertPublicSnapshotDirectory(dataDir, { required = false, operational = false } = {}) {
  const directory = plain(dataDir, "directory", { missing: !required });
  if (!directory) return { count: 0 };
  const allowed = new Set([...PUBLIC_SNAPSHOT_FILES, ...(operational ? ATTEMPTS : [])]);
  let count = 0;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (!allowed.has(entry.name)) throw new Error("unexpected generated snapshot data entry");
    plain(path.join(directory, entry.name), "file");
    if (PUBLIC_SET.has(entry.name)) count++;
  }
  if (required && count !== PUBLIC_SNAPSHOT_FILES.length) throw new Error("required public snapshot is missing");
  return { count };
}
function syncSourceAttemptState({ cwd, standaloneServer }) {
  const { sourceRoot, dataDir } = context({ cwd, standaloneServer });
  const sourceData = plain(path.join(sourceRoot, ".data"), "directory", { missing: true });
  const states = ATTEMPTS.map(name => {
    const file = sourceData ? plain(path.join(sourceData, name), "file", { missing: true }) : null;
    if (!file) return { name, state: null };
    if (fs.statSync(file).size > 16_384) throw new Error("invalid FINLIFE sync state");
    let value;
    try { value = JSON.parse(fs.readFileSync(file, "utf8")); } catch { throw new Error("invalid FINLIFE sync state"); }
    if (!value || !["running", "failed"].includes(value.status) || !PHASES.has(value.phase)
      || ![value.startedAt, value.updatedAt].every(t => typeof t === "string" && Number.isFinite(Date.parse(t)))
      || (value.errorCode !== undefined && !ERRORS.has(value.errorCode))) throw new Error("invalid FINLIFE sync state");
    return { name, state: { status: value.status, phase: value.phase, startedAt: value.startedAt, updatedAt: value.updatedAt, ...(value.errorCode ? { errorCode: value.errorCode } : {}) } };
  });
  for (const { name } of states) checkLeaf(dataDir, name);
  for (const { name, state } of states) {
    if (state) replaceFile(dataDir, name, null, JSON.stringify(state) + "\n");
    else if (laterOfficialSyncSucceeded(sourceData, dataDir, name)) removeKnown(dataDir, name);
  }
}
const isoMs = value => typeof value === "string" && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;
function readSmallJson(file, limit) {
  try { return fs.statSync(file).size > limit ? null : JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
}
// Without a root marker, a valid generated running/failed marker (for example from an in-app refresh) is kept,
// unless the root official snapshot was written strictly after the marker's last update. Only the full official
// sync writes that snapshot and it clears its own marker after completion, so that is proof of a later success.
// Equal/invalid/missing times and invalid generated markers are never removed here.
function laterOfficialSyncSucceeded(sourceData, dataDir, name) {
  const generated = checkLeaf(dataDir, name);
  if (!generated || !sourceData) return false;
  const marker = readSmallJson(generated, 16_384);
  if (!marker || !["running", "failed"].includes(marker.status) || !PHASES.has(marker.phase) || typeof marker.startedAt !== "string") return false;
  const updatedAt = isoMs(marker.updatedAt);
  if (updatedAt === null) return false;
  const snapshot = plain(path.join(sourceData, name.replace(/_sync_attempt\.json$/, "_snapshot.json")), "file", { missing: true });
  const generatedAt = snapshot ? isoMs(readSmallJson(snapshot, 64 * 1024 * 1024)?.meta?.generatedAt) : null;
  return generatedAt !== null && generatedAt > updatedAt;
}
export function prepareSourceSnapshotAssets(options) {
  const result = copyPublicSnapshots(options);
  // Source-only, sanitized operational state preserves the existing failure reader.
  // The desktop builder never copies this state into its public-file package.
  syncSourceAttemptState(options);
  assertManagedSnapshotEntries(result.dataDir);
  return result;
}
export async function preparePublicSnapshotRuntime(options) {
  const { sourceRoot, dataDir } = context(options);
  const manifest = path.join(sourceRoot, "desktop-manifest.json");
  if (fs.lstatSync(manifest, { throwIfNoEntry: false })) {
    plain(manifest, "file");
    await assertDesktopInstallationIdentity(sourceRoot);
    // Package files win; runtime-written attempt markers and other runtime entries are kept.
    assertManagedSnapshotEntries(dataDir, { required: true });
    return { managed: true, copied: 0, removed: 0, dataDir };
  }
  return { managed: false, ...prepareSourceSnapshotAssets(options) };
}
