import fs from "node:fs";
import path from "node:path";

function parseKeep(argv) {
  for (const token of argv) {
    if (!token.startsWith("--keep=")) continue;
    const n = Number(token.slice("--keep=".length));
    if (Number.isInteger(n) && n > 0) return n;
  }
  return 10;
}

function collectFiles(rootDir) {
  const out = [];
  const stack = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      const rel = path.relative(rootDir, fullPath).replaceAll("\\", "/");
      const isTopPattern = /^finlife_.*\.normalized\.v\d+\.json(\.gz)?$/i.test(entry.name);
      const isNestedPattern = rel.startsWith("finlife/") && /\.json(\.gz)?$/i.test(entry.name);
      if (isTopPattern || isNestedPattern) out.push(fullPath);
    }
  }
  return out;
}

function main() {
  const keep = parseKeep(process.argv.slice(2));
  const artifactsDir = path.join(process.cwd(), "artifacts");
  if (!fs.existsSync(artifactsDir)) {
    console.log("[artifacts:prune] artifacts directory not found. nothing to prune.");
    return;
  }

  const files = collectFiles(artifactsDir).map((filePath) => {
    const stat = fs.statSync(filePath);
    return { filePath, mtimeMs: stat.mtimeMs };
  });
  files.sort((a, b) => b.mtimeMs - a.mtimeMs);

  const kept = files.slice(0, keep);
  const deleted = files.slice(keep);
  for (const file of deleted) fs.unlinkSync(file.filePath);

  console.log("[artifacts:prune] done");
  console.log(`- scanned: ${files.length}`);
  console.log(`- kept: ${kept.length}`);
  console.log(`- deleted: ${deleted.length}`);
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[artifacts:prune] failed: ${message}`);
  process.exit(1);
}

