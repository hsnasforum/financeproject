import fs from "node:fs";
import path from "node:path";

const FINGERPRINT_OPTIONS = {
  maxDepth: 8,
  arraySampleSize: 3,
};

const IGNORE_PATHS = [
  "$.meta.generatedAt",
  "$.generatedAt",
  "$.meta.syncedAt",
  "$.meta.updatedAt",
  "$.meta.fetchedAt",
  "$.status.lastUpdatedAt",
];

const cwd = process.cwd();
const dataDir = path.join(cwd, ".data");
const baselinePath = path.join(cwd, "docs", "schema-baselines.json");
const reportPath = path.join(cwd, "docs", "schema-drift-report.md");

function valueTypeOf(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function appendObjectPath(basePath, key) {
  if (/^[A-Za-z0-9_-]+$/.test(key)) {
    return `${basePath}.${key}`;
  }
  return `${basePath}[${JSON.stringify(key)}]`;
}

function addType(map, pathText, typeText) {
  const bucket = map.get(pathText) ?? new Set();
  bucket.add(typeText);
  map.set(pathText, bucket);
}

function walkFingerprint(value, pathText, depth, options, map) {
  const valueType = valueTypeOf(value);
  addType(map, pathText, valueType);

  if (depth >= options.maxDepth) return;

  if (Array.isArray(value)) {
    const sampled = value.slice(0, Math.max(0, options.arraySampleSize));
    for (const item of sampled) {
      walkFingerprint(item, `${pathText}[]`, depth + 1, options, map);
    }
    return;
  }

  if (!value || typeof value !== "object") return;
  const keys = Object.keys(value).sort((a, b) => a.localeCompare(b));
  for (const key of keys) {
    walkFingerprint(value[key], appendObjectPath(pathText, key), depth + 1, options, map);
  }
}

function createSchemaFingerprint(json, optionsInput) {
  const options = {
    maxDepth: optionsInput?.maxDepth ?? 8,
    arraySampleSize: optionsInput?.arraySampleSize ?? 3,
    rootPath: optionsInput?.rootPath ?? "$",
  };
  const map = new Map();
  walkFingerprint(json, options.rootPath, 0, options, map);

  const entries = [...map.entries()]
    .map(([pathText, types]) => ({
      path: pathText,
      types: [...types].sort((a, b) => a.localeCompare(b)),
    }))
    .sort((a, b) => a.path.localeCompare(b.path));

  return {
    maxDepth: options.maxDepth,
    arraySampleSize: options.arraySampleSize,
    entries,
  };
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function globToRegex(glob) {
  const tokens = [...glob].map((char) => (char === "*" ? ".*" : escapeRegex(char)));
  return new RegExp(`^${tokens.join("")}$`);
}

function buildIgnoreMatchers(ignorePaths) {
  return ignorePaths.map((rule) => (rule instanceof RegExp ? rule : globToRegex(rule)));
}

function shouldIgnore(pathText, matchers) {
  return matchers.some((matcher) => matcher.test(pathText));
}

function fingerprintMap(fingerprint, matchers) {
  const map = new Map();
  for (const entry of fingerprint.entries) {
    if (shouldIgnore(entry.path, matchers)) continue;
    map.set(entry.path, [...new Set(entry.types)].sort((a, b) => a.localeCompare(b)));
  }
  return map;
}

function diffSchemaFingerprint(baseline, current, options = {}) {
  const ignoreMatchers = buildIgnoreMatchers(options.ignorePaths ?? []);
  const baselineMap = fingerprintMap(baseline, ignoreMatchers);
  const currentMap = fingerprintMap(current, ignoreMatchers);

  const breaking = [];
  const nonBreaking = [];
  const allPaths = [...new Set([...baselineMap.keys(), ...currentMap.keys()])].sort((a, b) => a.localeCompare(b));

  for (const pathText of allPaths) {
    const baselineTypes = baselineMap.get(pathText) ?? [];
    const currentTypes = currentMap.get(pathText) ?? [];
    const inBaseline = baselineMap.has(pathText);
    const inCurrent = currentMap.has(pathText);

    if (inBaseline && !inCurrent) {
      breaking.push({ change: "removed", path: pathText, baselineTypes, currentTypes: [] });
      continue;
    }
    if (!inBaseline && inCurrent) {
      nonBreaking.push({ change: "added", path: pathText, baselineTypes: [], currentTypes });
      continue;
    }
    if (inBaseline && inCurrent && baselineTypes.join("|") !== currentTypes.join("|")) {
      breaking.push({ change: "type_changed", path: pathText, baselineTypes, currentTypes });
    }
  }
  return { breaking, nonBreaking };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function listSnapshots() {
  if (!fs.existsSync(dataDir)) return [];
  return fs
    .readdirSync(dataDir)
    .filter((name) => name.endsWith(".json"))
    .sort((a, b) => a.localeCompare(b));
}

function fingerprintSnapshots(fileNames) {
  const snapshots = {};
  for (const fileName of fileNames) {
    const fullPath = path.join(dataDir, fileName);
    const parsed = readJson(fullPath);
    snapshots[fileName] = createSchemaFingerprint(parsed, FINGERPRINT_OPTIONS);
  }
  return snapshots;
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function toTypeText(types) {
  if (!types || types.length === 0) return "-";
  return types.join("|");
}

function buildReportMarkdown(input) {
  const lines = [];
  lines.push("# Schema Drift Report");
  lines.push("");
  lines.push(`- Generated at: ${input.generatedAt}`);
  lines.push(`- Mode: ${input.mode}`);
  lines.push(`- Snapshot dir: \`.data\``);
  lines.push(`- Fingerprint options: maxDepth=${FINGERPRINT_OPTIONS.maxDepth}, arraySampleSize=${FINGERPRINT_OPTIONS.arraySampleSize}`);
  lines.push(`- Ignore paths: ${IGNORE_PATHS.join(", ")}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push("| Snapshot | Breaking | Non-breaking |");
  lines.push("| --- | ---: | ---: |");
  for (const row of input.summaryRows) {
    lines.push(`| ${row.fileName} | ${row.breaking} | ${row.nonBreaking} |`);
  }
  lines.push("");

  if (input.breakingChanges.length === 0) {
    lines.push("## Breaking Changes");
    lines.push("");
    lines.push("- 없음");
    lines.push("");
  } else {
    lines.push("## Breaking Changes");
    lines.push("");
    for (const group of input.breakingChanges) {
      lines.push(`### ${group.fileName}`);
      lines.push("");
      for (const change of group.items.slice(0, 100)) {
        lines.push(`- \`${change.change}\` \`${change.path}\` (${toTypeText(change.baselineTypes)} -> ${toTypeText(change.currentTypes)})`);
      }
      if (group.items.length > 100) {
        lines.push(`- ... ${group.items.length - 100} more`);
      }
      lines.push("");
    }
  }

  if (input.nonBreakingChanges.length === 0) {
    lines.push("## Non-breaking Changes");
    lines.push("");
    lines.push("- 없음");
    lines.push("");
  } else {
    lines.push("## Non-breaking Changes");
    lines.push("");
    for (const group of input.nonBreakingChanges) {
      lines.push(`### ${group.fileName}`);
      lines.push("");
      for (const change of group.items.slice(0, 100)) {
        lines.push(`- \`${change.change}\` \`${change.path}\` (${toTypeText(change.baselineTypes)} -> ${toTypeText(change.currentTypes)})`);
      }
      if (group.items.length > 100) {
        lines.push(`- ... ${group.items.length - 100} more`);
      }
      lines.push("");
    }
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

function writeBaseline(snapshots) {
  const sortedEntries = Object.entries(snapshots).sort((a, b) => a[0].localeCompare(b[0]));
  const orderedSnapshots = Object.fromEntries(sortedEntries);

  const baseline = {
    version: 1,
    generatedAt: new Date().toISOString(),
    fingerprint: {
      maxDepth: FINGERPRINT_OPTIONS.maxDepth,
      arraySampleSize: FINGERPRINT_OPTIONS.arraySampleSize,
      ignorePaths: IGNORE_PATHS,
    },
    snapshots: orderedSnapshots,
  };

  ensureDir(baselinePath);
  fs.writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`, "utf-8");
}

function main() {
  const args = process.argv.slice(2);
  const shouldUpdate = args.includes("--update");
  const mode = shouldUpdate ? "update" : "check";

  const fileNames = listSnapshots();
  if (fileNames.length === 0) {
    throw new Error("No .json snapshots found under .data/");
  }

  const currentSnapshots = fingerprintSnapshots(fileNames);

  if (shouldUpdate) {
    writeBaseline(currentSnapshots);
  }

  if (!fs.existsSync(baselinePath)) {
    const report = buildReportMarkdown({
      generatedAt: new Date().toISOString(),
      mode,
      summaryRows: fileNames.map((fileName) => ({ fileName, breaking: "-", nonBreaking: "-" })),
      breakingChanges: [
        {
          fileName: "(baseline)",
          items: [
            {
              change: "removed",
              path: "docs/schema-baselines.json",
              baselineTypes: ["object"],
              currentTypes: [],
            },
          ],
        },
      ],
      nonBreakingChanges: [],
    });
    ensureDir(reportPath);
    fs.writeFileSync(reportPath, report, "utf-8");
    console.error("[schema:report] baseline not found: docs/schema-baselines.json");
    console.error("[schema:report] run `pnpm schema:update` to create/update baseline");
    process.exit(1);
  }

  const baselineDoc = readJson(baselinePath);
  const baselineSnapshots = baselineDoc?.snapshots ?? {};
  const baselineFiles = Object.keys(baselineSnapshots).sort((a, b) => a.localeCompare(b));
  const allFiles = [...new Set([...baselineFiles, ...fileNames])].sort((a, b) => a.localeCompare(b));

  const breakingChanges = [];
  const nonBreakingChanges = [];
  const summaryRows = [];

  for (const fileName of allFiles) {
    const baselineFingerprint = baselineSnapshots[fileName] ?? null;
    const currentFingerprint = currentSnapshots[fileName] ?? null;

    if (!baselineFingerprint && currentFingerprint) {
      nonBreakingChanges.push({
        fileName,
        items: [
          {
            change: "added",
            path: "$",
            baselineTypes: [],
            currentTypes: ["object"],
          },
        ],
      });
      summaryRows.push({ fileName, breaking: 0, nonBreaking: 1 });
      continue;
    }

    if (baselineFingerprint && !currentFingerprint) {
      breakingChanges.push({
        fileName,
        items: [
          {
            change: "removed",
            path: "$",
            baselineTypes: ["object"],
            currentTypes: [],
          },
        ],
      });
      summaryRows.push({ fileName, breaking: 1, nonBreaking: 0 });
      continue;
    }

    if (!baselineFingerprint || !currentFingerprint) {
      summaryRows.push({ fileName, breaking: 0, nonBreaking: 0 });
      continue;
    }

    const diff = diffSchemaFingerprint(baselineFingerprint, currentFingerprint, {
      ignorePaths: IGNORE_PATHS,
    });

    if (diff.breaking.length > 0) {
      breakingChanges.push({
        fileName,
        items: diff.breaking,
      });
    }

    if (diff.nonBreaking.length > 0) {
      nonBreakingChanges.push({
        fileName,
        items: diff.nonBreaking,
      });
    }

    summaryRows.push({
      fileName,
      breaking: diff.breaking.length,
      nonBreaking: diff.nonBreaking.length,
    });
  }

  const report = buildReportMarkdown({
    generatedAt: new Date().toISOString(),
    mode,
    summaryRows,
    breakingChanges,
    nonBreakingChanges,
  });

  ensureDir(reportPath);
  fs.writeFileSync(reportPath, report, "utf-8");

  const totalBreaking = breakingChanges.reduce((acc, group) => acc + group.items.length, 0);
  const totalNonBreaking = nonBreakingChanges.reduce((acc, group) => acc + group.items.length, 0);

  console.log("[schema:report] generated docs/schema-drift-report.md");
  console.log(`[schema:report] snapshots=${fileNames.length} breaking=${totalBreaking} nonBreaking=${totalNonBreaking}`);
  if (shouldUpdate) {
    console.log("[schema:report] updated docs/schema-baselines.json");
    return;
  }
  if (totalBreaking > 0) {
    console.error("[schema:report] breaking schema drift detected");
    process.exit(1);
  }
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[schema:report] failed: ${message}`);
  process.exit(1);
}
