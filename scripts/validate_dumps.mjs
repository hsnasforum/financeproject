import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const FORBIDDEN_KEYS = new Set([
  "auth",
  "servicekey",
  "service_key",
  "apikey",
  "authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
]);

const FORBIDDEN_PATTERNS = [
  "finlife.fss.or.kr",
  "finlifeapi",
  "apis.data.go.kr",
  "servicekey=",
  "auth=",
];

function childPath(base, key) {
  if (typeof key === "number") return `${base}[${key}]`;
  if (!base) return key;
  return `${base}.${key}`;
}

function scanValue(value, pathNow = "$", out = []) {
  if (value === null || value === undefined) return out;
  if (typeof value === "string") {
    const lower = value.toLowerCase();
    for (const rule of FORBIDDEN_PATTERNS) {
      if (lower.includes(rule)) out.push({ type: "string", path: pathNow, rule });
    }
    return out;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      scanValue(value[i], childPath(pathNow, i), out);
    }
    return out;
  }
  if (typeof value === "object") {
    for (const [key, next] of Object.entries(value)) {
      const keyLower = key.toLowerCase();
      const keyPath = childPath(pathNow, key);
      if (FORBIDDEN_KEYS.has(keyLower)) out.push({ type: "key", path: keyPath, rule: keyLower });
      scanValue(next, keyPath, out);
    }
  }
  return out;
}

function shouldScan(fileName) {
  return /\.normalized.*\.json(\.gz)?$/i.test(fileName);
}

function collectFiles(rootDir) {
  if (!fs.existsSync(rootDir)) return [];
  const out = [];
  const stack = [rootDir];
  while (stack.length > 0) {
    const dir = stack.pop();
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (shouldScan(entry.name)) out.push(fullPath);
    }
  }
  return out;
}

function readJsonFile(filePath) {
  const raw = fs.readFileSync(filePath);
  if (filePath.endsWith(".gz")) {
    return JSON.parse(zlib.gunzipSync(raw).toString("utf-8"));
  }
  return JSON.parse(raw.toString("utf-8"));
}

function main() {
  const modeArg = process.argv.slice(2).find((arg) => arg.startsWith("--mode="));
  const modeRaw = modeArg ? modeArg.slice("--mode=".length).trim().toLowerCase() : "all";
  const mode = modeRaw === "fixtures" ? "fixtures" : "all";

  const roots = mode === "fixtures"
    ? [path.join(process.cwd(), "tests", "fixtures")]
    : [
        path.join(process.cwd(), "tests", "fixtures"),
        path.join(process.cwd(), "artifacts"),
      ];
  const files = roots.flatMap((root) => collectFiles(root));
  let scannedBytes = 0;
  const allViolations = [];

  for (const filePath of files) {
    const stat = fs.statSync(filePath);
    scannedBytes += stat.size;
    let parsed;
    try {
      parsed = readJsonFile(filePath);
    } catch {
      allViolations.push({
        filePath,
        type: "parse",
        path: "$",
        rule: "invalid_json_or_gzip",
      });
      continue;
    }
    const violations = scanValue(parsed);
    for (const violation of violations) {
      allViolations.push({
        filePath,
        ...violation,
      });
    }
  }

  if (allViolations.length > 0) {
    console.error("[validate:dumps] forbidden data detected:");
    for (const violation of allViolations) {
      console.error(`- file=${path.relative(process.cwd(), violation.filePath)} path=${violation.path} rule=${violation.rule}`);
    }
    process.exit(2);
  }

  console.log("[validate:dumps] ok");
  console.log(`- mode: ${mode}`);
  console.log(`- scannedFiles: ${files.length}`);
  console.log(`- scannedBytes: ${scannedBytes}`);
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[validate:dumps] failed: ${message}`);
  process.exit(1);
}
