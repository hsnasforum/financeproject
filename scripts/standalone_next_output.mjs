import fs from "node:fs";
import path from "node:path";
import { STANDALONE_PRIVACY_RECEIPT } from "./standalone_privacy_gate.mjs";

const posix = p => p.replace(/\\/g, "/");
const equal = (a, b) => process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
const inside = (root, p) => { const r = path.relative(root, p); return r !== "" && r !== ".." && !r.startsWith(".." + path.sep) && !path.isAbsolute(r); };
const stat = p => fs.lstatSync(p, { throwIfNoEntry: false }) ?? null;
function plain(p, directory) {
  const s = stat(p);
  if (!s || s.isSymbolicLink() || (directory ? !s.isDirectory() : !s.isFile() || s.nlink !== 1) || !equal(fs.realpathSync(p), path.resolve(p))) {
    throw new Error("Next generated path must be canonical and unlinked");
  }
  return s;
}
function walk(dir, visitor) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name), s = fs.lstatSync(p);
    visitor(p, s);
    if (s.isDirectory() && !s.isSymbolicLink()) walk(p, visitor);
  }
}
function packageIdentity(p, sourceMetadata = false) {
  try {
    plain(p, true);
    const metadata = path.join(p, "package.json");
    // pnpm can hardlink its source metadata to its content-addressed store. It is read only here;
    // the generated counterpart still has to be an ordinary single-link copy.
    if (sourceMetadata) {
      const s = stat(metadata);
      if (!s || s.isSymbolicLink() || !s.isFile() || !equal(fs.realpathSync(metadata), path.resolve(metadata))) throw new Error();
    } else plain(metadata, false);
    const value = JSON.parse(fs.readFileSync(path.join(p, "package.json"), "utf8"));
    if (typeof value.name !== "string" || typeof value.version !== "string" || !value.name || !value.version) throw new Error();
    return value;
  } catch { throw new Error("dependency counterpart must be an already traced regular package"); }
}

// Next 16.3.8's route-exclude postprocessor joins globs with native Windows separators; picomatch
// treats those as escapes. Re-apply only the explicit .data exclusion at the fresh generated boundary.
// All other private traces remain blocking audit failures. This is never a runtime preparation step.
export function normalizeNextStandaloneOutput({ projectRoot, distDir = ".next" }) {
  const root = fs.realpathSync(projectRoot), dist = path.resolve(root, distDir);
  if (!inside(root, dist) || !/^\.next(?:$|-)/.test(path.basename(dist))) throw new Error("Next generated directory is invalid");
  plain(dist, true);
  if (stat(path.join(dist, STANDALONE_PRIVACY_RECEIPT))) throw new Error("refusing to normalize a previously admitted runtime build");
  const out = path.join(dist, "standalone"); plain(out, true); plain(path.join(out, "server.js"), false);
  const changes = [];
  const inspectTrace = p => {
    plain(p, false);
    const value = JSON.parse(fs.readFileSync(p, "utf8"));
    if (!Array.isArray(value.files) || value.files.some(f => typeof f !== "string")) throw new Error("invalid Next trace files");
    const files = value.files.filter(f => {
      const absolute = path.resolve(path.dirname(p), f), rel = posix(path.relative(root, absolute));
      return !(inside(root, absolute) && (rel === ".data" || rel.startsWith(".data/")));
    });
    if (files.length !== value.files.length) changes.push({ p, value: { ...value, files }, removed: value.files.length - files.length });
  };
  for (const name of ["next-server.js.nft.json", "next-minimal-server.js.nft.json"]) {
    const p = path.join(dist, name); if (stat(p)) inspectTrace(p);
  }
  const server = path.join(dist, "server");
  if (stat(server)) {
    plain(server, true);
    walk(server, (p, s) => { if (s.isSymbolicLink()) throw new Error("Next trace directory contains a link"); if (s.isFile() && p.endsWith(".nft.json")) inspectTrace(p); });
  }
  const data = path.join(out, ".data");
  if (stat(data)) {
    try {
      plain(data, true);
      walk(data, (p, s) => { if (s.isDirectory()) plain(p, true); else plain(p, false); });
    } catch { throw new Error("generated .data contains a link or unsupported entry; nothing removed"); }
  }

  const relocations = [];
  // Next preserves pnpm's absolute junction targets on Windows. The corresponding package has already
  // been copied into standalone by tracing. Point only these verified dependencies at that exact copy.
  walk(out, (link, s) => {
    if (!s.isSymbolicLink()) return;
    const rel = posix(path.relative(out, link));
    let target; try { target = fs.realpathSync(link); } catch { throw new Error("dependency link is unresolved"); }
    if (inside(out, target)) return;
    const sourceRel = posix(path.relative(root, target));
    const match = /^node_modules\/\.pnpm\/[^/]+\/node_modules\/((?:@[^/]+\/)?[^/]+)$/.exec(sourceRel);
    if (!rel.startsWith("node_modules/") || !inside(root, target) || !match) throw new Error("dependency link escapes verified project pnpm packages");
    const sourcePackage = packageIdentity(target, true), copy = path.join(out, path.relative(root, target)), copiedPackage = packageIdentity(copy);
    if (sourcePackage.name !== match[1] || copiedPackage.name !== sourcePackage.name || copiedPackage.version !== sourcePackage.version) {
      throw new Error("dependency counterpart identity differs");
    }
    relocations.push({ link, copy });
  });
  // All inputs have been checked before changing the fresh output. The source .data and dependencies
  // are never written. Unknown non-data private paths are deliberately left for the strict privacy gate.
  for (const { p, value } of changes) fs.writeFileSync(p, JSON.stringify(value));
  if (stat(data)) fs.rmSync(data, { recursive: true });
  for (const { link, copy } of relocations) {
    fs.unlinkSync(link);
    fs.symlinkSync(process.platform === "win32" ? copy : path.relative(path.dirname(link), copy), link, process.platform === "win32" ? "junction" : "dir");
  }
  return { dataTraceEntriesRemoved: changes.reduce((n, c) => n + c.removed, 0), dependencyLinksRelocated: relocations.length };
}
