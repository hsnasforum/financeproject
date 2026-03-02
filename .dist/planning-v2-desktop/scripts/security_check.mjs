import { spawnSync } from "node:child_process";

const checks = [
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
];

function listClientComponentFiles() {
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
  const result = spawnSync(check.cmd, check.args, {
    stdio: "pipe",
    encoding: "utf8",
  });

  const stdout = String(result.stdout ?? "").trim();
  const stderr = String(result.stderr ?? "").trim();

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
