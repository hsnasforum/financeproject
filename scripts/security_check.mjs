import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const checks = [
  {
    name: "repo-no-tracked-private-key",
    cmd: "git",
    args: [
      "grep",
      "-I",
      "-n",
      "-E",
      "-e",
      "-----BEGIN (OPENSSH |RSA |EC |DSA )?PRIVATE KEY-----",
      "--",
      ".",
    ],
    allowNoMatch: true,
  },
  {
    name: "repo-history-no-private-key",
    cmd: "git",
    args: [
      "log",
      "--all",
      "--full-history",
      "-G",
      "-----BEGIN (OPENSSH |RSA |EC |DSA )?PRIVATE KEY-----",
      "--format=%H %s",
      "--",
      ".",
      ":(exclude)tests/fixtures/**",
      ":(exclude)scripts/security_check.mjs",
    ],
    failOnOutput: true,
  },
  {
    name: "report-export-secret-pattern",
    cmd: "rg",
    args: [
      "-n",
      "(process\\.env|GITHUB_TOKEN|ECOS_API_KEY|BOK_ECOS_API_KEY|DEV_ACTION_TOKEN|Bearer\\s+)",
      "src/app/api/planning/reports",
      "--glob",
      "!**/*.test.*",
    ],
    allowNoMatch: true,
  },
  {
    name: "report-export-raw-dump",
    cmd: "rg",
    args: [
      "-n",
      "(<pre>\\{|```json|JSON\\.stringify\\(.*run)",
      "src/app/api/planning/reports/[runId]/export.html/route.ts",
    ],
    allowNoMatch: true,
  },
  {
    name: "report-export-no-inline-print-script",
    cmd: "rg",
    args: [
      "-n",
      "(<script>.*window\\.print\\(|window\\.addEventListener\\(['\\\"]load['\\\"].*window\\.print\\()",
      "src/lib/planning/reports/standaloneHtmlReport.ts",
    ],
    allowNoMatch: true,
  },
  {
    name: "pdf-report-no-new-function-loader",
    cmd: "rg",
    args: [
      "-n",
      "new Function\\(",
      "src/lib/planning/v2/report/pdfReport.ts",
    ],
    allowNoMatch: true,
  },
  {
    name: "root-layout-no-external-font-stylesheet",
    cmd: "rg",
    args: [
      "-n",
      "cdn\\.jsdelivr\\.net|pretendardvariable-dynamic-subset\\.min\\.css",
      "src/app/layout.tsx",
    ],
    allowNoMatch: true,
  },
  {
    name: "kdb-endpoint-no-insecure-http",
    cmd: "rg",
    args: [
      "-n",
      "http://apis\\.data\\.go\\.kr",
      "src/lib/sources/datago/kdb.ts",
      "scripts/datago_sync.mjs",
    ],
    allowNoMatch: true,
  },
  {
    name: "app-runtime-no-inline-style-tag",
    cmd: "rg",
    args: [
      "-n",
      "<style>|styled-jsx|jsx global",
      "src/app",
      "src/components",
      "--glob",
      "!**/*.test.*",
    ],
    allowNoMatch: true,
  },
  {
    name: "app-runtime-no-inline-style-attr",
    cmd: "rg",
    args: [
      "-n",
      "style\\s*=\\s*\\{\\{",
      "src/app",
      "src/components",
      "--glob",
      "!**/*.test.*",
    ],
    allowNoMatch: true,
  },
  {
    name: "app-runtime-no-style-mutation",
    cmd: "rg",
    args: [
      "-n",
      "(\\.style\\.[A-Za-z_$][A-Za-z0-9_$]*\\s*=|setAttribute\\(\\s*['\\\"]style['\\\"]|style\\.setProperty\\()",
      "src/app",
      "src/components",
      "src/lib/browser",
      "--glob",
      "!**/*.test.*",
    ],
    allowNoMatch: true,
  },
  {
    name: "app-runtime-no-framer-motion",
    cmd: "rg",
    args: [
      "-n",
      "from ['\\\"]framer-motion['\\\"]",
      "src/app",
      "src/components",
      "--glob",
      "!**/*.test.*",
    ],
    allowNoMatch: true,
  },
  {
    name: "app-runtime-no-next-image",
    cmd: "rg",
    args: [
      "-n",
      "from ['\\\"]next/image['\\\"]",
      "src/app",
      "src/components",
      "--glob",
      "!**/*.test.*",
    ],
    allowNoMatch: true,
  },
  {
    name: "standalone-report-no-inline-style-attr",
    cmd: "rg",
    args: [
      "-n",
      "style=",
      "src/lib/planning/reports/standaloneHtmlReport.ts",
    ],
    allowNoMatch: true,
  },
];

const REPO_ROOT = process.cwd();
const RIPGREP_AVAILABLE = spawnSync("rg", ["--version"], {
  stdio: "pipe",
  encoding: "utf8",
}).status === 0;

function checkRepositoryHistoryReadiness() {
  const result = spawnSync("git", ["rev-parse", "--is-shallow-repository"], {
    cwd: REPO_ROOT,
    stdio: "pipe",
    encoding: "utf8",
  });
  const stdout = String(result.stdout ?? "").trim();
  const stderr = String(result.stderr ?? "").trim();
  if (result.status !== 0) {
    return { ok: false, output: stderr || stdout || "unable to determine repository history depth" };
  }
  if (stdout === "true") {
    return {
      ok: false,
      output: "private-key history scan requires a full clone; fetch complete history before running sec:check",
    };
  }
  if (stdout !== "false") {
    return { ok: false, output: `unexpected shallow-repository status: ${stdout || "empty"}` };
  }
  return { ok: true, output: "" };
}

function normalizeRelative(filePath) {
  return path.relative(REPO_ROOT, filePath).split(path.sep).join("/");
}

function isCodeFile(filePath) {
  return /\.(tsx?|jsx?|mjs|cjs)$/.test(filePath);
}

function walkFiles(targetPath, output) {
  const stat = statSync(targetPath);
  if (stat.isFile()) {
    output.push(targetPath);
    return;
  }
  const entries = readdirSync(targetPath, { withFileTypes: true });
  for (const entry of entries) {
    const nextPath = path.join(targetPath, entry.name);
    if (entry.isDirectory()) {
      walkFiles(nextPath, output);
    } else if (entry.isFile()) {
      output.push(nextPath);
    }
  }
}

function collectFilesFromTargets(targets, excludeTests = false) {
  const files = [];
  for (const target of targets) {
    const absolute = path.resolve(REPO_ROOT, target);
    try {
      walkFiles(absolute, files);
    } catch {
      return { ok: false, error: `missing target path: ${target}`, files: [] };
    }
  }
  const filtered = files
    .map((filePath) => normalizeRelative(filePath))
    .filter((filePath) => isCodeFile(filePath))
    .filter((filePath) => (excludeTests ? !/\.test\./.test(filePath) : true));
  return { ok: true, files: Array.from(new Set(filtered)) };
}

function findMatches(patternSource, files) {
  const pattern = new RegExp(patternSource);
  const matches = [];
  for (const filePath of files) {
    const absolute = path.resolve(REPO_ROOT, filePath);
    const content = readFileSync(absolute, "utf8");
    const lines = content.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (!pattern.test(line)) continue;
      matches.push(`${filePath}:${index + 1}:${line.trim()}`);
    }
  }
  return matches;
}

function listTargetBlankTags(content) {
  return content.match(/<[A-Za-z][^>]*target="_blank"[^>]*>/gs) ?? [];
}

function hasSafeRel(tag) {
  const relMatch = tag.match(/rel\s*=\s*["']([^"']+)["']/);
  if (!relMatch) return false;
  const relValue = relMatch[1] ?? "";
  return /\bnoopener\b/.test(relValue) && /\bnoreferrer\b/.test(relValue);
}

function parseRipgrepArgs(args) {
  let pattern = "";
  let excludeTests = false;
  const targets = [];
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === "-n" || token === "-l") continue;
    if (token === "--glob") {
      const globValue = args[index + 1] ?? "";
      if (globValue === "!**/*.test.*") {
        excludeTests = true;
      }
      index += 1;
      continue;
    }
    if (pattern.length === 0) {
      pattern = token;
      continue;
    }
    if (!token.startsWith("-")) {
      targets.push(token);
    }
  }
  return { pattern, targets, excludeTests };
}

function listClientComponentFiles() {
  if (!RIPGREP_AVAILABLE) {
    const collected = collectFilesFromTargets(["src"], true);
    if (!collected.ok) {
      throw new Error(`failed to discover client files: ${collected.error}`);
    }
    const clientDirective = /^\s*["']use client["'];?\s*$/;
    const clientFiles = collected.files.filter((filePath) => {
      const absolute = path.resolve(REPO_ROOT, filePath);
      const content = readFileSync(absolute, "utf8");
      return content.split(/\r?\n/).some((line) => clientDirective.test(line));
    });
    return clientFiles;
  }

  const result = spawnSync(
    "rg",
    [
      "-l",
      "^[\\\"']use client[\\\"']",
      "src",
      "--glob",
      "!**/*.test.*",
    ],
    { stdio: "pipe", encoding: "utf8" },
  );
  if (result.status === 1) return [];
  if (result.status !== 0) {
    throw new Error(`failed to discover client files: ${String(result.stderr ?? "").trim()}`);
  }
  return String(result.stdout ?? "")
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function runCheck(check) {
  if (!RIPGREP_AVAILABLE && check.cmd === "rg") {
    const parsed = parseRipgrepArgs(check.args);
    if (!parsed.pattern) {
      return { ok: false, output: `${check.name}: missing pattern` };
    }
    const collected = collectFilesFromTargets(parsed.targets, parsed.excludeTests);
    if (!collected.ok) {
      return { ok: false, output: `${check.name}: ${collected.error}` };
    }
    const matches = findMatches(parsed.pattern, collected.files);
    if (matches.length > 0) {
      return {
        ok: false,
        output: matches.join("\n"),
      };
    }
    return { ok: true, output: "" };
  }

  const result = spawnSync(check.cmd, check.args, {
    stdio: "pipe",
    encoding: "utf8",
  });

  const stdout = String(result.stdout ?? "").trim();
  const stderr = String(result.stderr ?? "").trim();

  if (check.failOnOutput) {
    if (result.status !== 0) {
      return {
        ok: false,
        output: stderr || stdout || `${check.name}: check failed to execute`,
      };
    }
    return stdout
      ? { ok: false, output: stdout }
      : { ok: true, output: "" };
  }

  if (result.status === 0) {
    return {
      ok: false,
      output: stdout || stderr || `${check.name}: pattern matched`,
    };
  }

  if (check.allowNoMatch && result.status === 1) {
    return { ok: true, output: "" };
  }

  return {
    ok: false,
    output: stderr || stdout || `${check.name}: check failed to execute`,
  };
}

let failed = false;
const historyReadiness = checkRepositoryHistoryReadiness();
if (historyReadiness.ok) {
  console.log("[sec:check] PASS repository-history-readiness");
} else {
  failed = true;
  console.error("[sec:check] FAIL repository-history-readiness");
  console.error(historyReadiness.output);
}

if (process.argv.includes("--history-readiness-only")) {
  process.exit(failed ? 1 : 0);
}

if (process.argv.includes("--private-key-history-only")) {
  const historyCheck = checks.find((check) => check.name === "repo-history-no-private-key");
  const outcome = runCheck(historyCheck);
  if (outcome.ok) {
    console.log("[sec:check] PASS repo-history-no-private-key");
  } else {
    failed = true;
    console.error("[sec:check] FAIL repo-history-no-private-key");
    if (outcome.output) console.error(outcome.output);
  }
  process.exit(failed ? 1 : 0);
}

try {
  const clientFiles = listClientComponentFiles();
  if (clientFiles.length > 0) {
    const clientLeakCheck = runCheck({
      name: "client-env-secret-leak",
      cmd: "rg",
      args: [
        "-n",
        "process\\.env\\.(DEV_ACTION_TOKEN|GITHUB_TOKEN|BOK_ECOS_API_KEY|ECOS_API_KEY|FINLIFE_[A-Z0-9_]*(KEY|TOKEN))",
        ...clientFiles,
      ],
      allowNoMatch: true,
    });
    if (clientLeakCheck.ok) {
      console.log("[sec:check] PASS client-env-secret-leak");
    } else {
      failed = true;
      console.error("[sec:check] FAIL client-env-secret-leak");
      if (clientLeakCheck.output) {
        console.error(clientLeakCheck.output);
      }
    }
  } else {
    console.log("[sec:check] PASS client-env-secret-leak (no client files found)");
  }
} catch (error) {
  failed = true;
  console.error("[sec:check] FAIL client-env-secret-leak");
  console.error(error instanceof Error ? error.message : String(error));
}

try {
  const collected = collectFilesFromTargets(["src"], true);
  if (!collected.ok) {
    failed = true;
    console.error("[sec:check] FAIL target-blank-safe-rel");
    console.error(collected.error);
  } else {
    const violations = [];
    for (const filePath of collected.files) {
      const absolute = path.resolve(REPO_ROOT, filePath);
      const content = readFileSync(absolute, "utf8");
      const tags = listTargetBlankTags(content);
      for (const tag of tags) {
        if (hasSafeRel(tag)) continue;
        violations.push(`${filePath}::${tag.replace(/\s+/g, " ").trim()}`);
      }
    }
    if (violations.length > 0) {
      failed = true;
      console.error("[sec:check] FAIL target-blank-safe-rel");
      console.error(violations.join("\n"));
    } else {
      console.log("[sec:check] PASS target-blank-safe-rel");
    }
  }
} catch (error) {
  failed = true;
  console.error("[sec:check] FAIL target-blank-safe-rel");
  console.error(error instanceof Error ? error.message : String(error));
}

for (const check of checks) {
  const outcome = runCheck(check);
  if (outcome.ok) {
    console.log(`[sec:check] PASS ${check.name}`);
    continue;
  }
  failed = true;
  console.error(`[sec:check] FAIL ${check.name}`);
  if (outcome.output) {
    console.error(outcome.output);
  }
}

if (failed) {
  process.exit(1);
}

console.log("[sec:check] PASS");
