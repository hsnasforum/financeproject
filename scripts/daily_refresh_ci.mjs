import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DAILY_REFRESH_APPROVED_PR_PATHS,
  collectDailyRefreshArtifactEvidence,
  parseDailyRefreshFreshnessReport,
  sha256Text,
  validateDailyRefreshGitChanges,
  validateDailyRefreshEnvironment,
  validateDailyRefreshResult,
} from "./daily_refresh_contract.mjs";

function parseArgs(argv) {
  const options = {
    checkEnv: false,
    resultPath: "tmp/daily_refresh_result.json",
    evidencePath: "tmp/daily_refresh_evidence.json",
    prBodyPath: "tmp/daily_refresh_pr_body.md",
  };
  for (const token of argv) {
    if (token === "--check-env") {
      options.checkEnv = true;
      continue;
    }
    if (token.startsWith("--result=")) {
      options.resultPath = token.slice("--result=".length);
      continue;
    }
    if (token.startsWith("--evidence=")) {
      options.evidencePath = token.slice("--evidence=".length);
      continue;
    }
    if (token.startsWith("--pr-body=")) {
      options.prBodyPath = token.slice("--pr-body=".length);
      continue;
    }
    throw new Error(`unknown option: ${token}`);
  }
  return options;
}

function resolveFromCwd(cwd, filePath) {
  return path.isAbsolute(filePath) ? filePath : path.join(cwd, filePath);
}

function writeText(filePath, text) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text, "utf-8");
}

function appendText(filePath, text) {
  if (!filePath) return;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, text, "utf-8");
}

function safeMessage(error) {
  const text = error instanceof Error ? error.message : String(error);
  return text
    .replace(/[^\p{L}\p{N}\s._:/()\-]/gu, "?")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300) || "unknown error";
}

function escapeMarkdown(value) {
  return String(value ?? "")
    .replace(/\|/g, "\\|")
    .replace(/[\r\n]+/g, " ")
    .trim();
}

function buildRunUrl(env) {
  const server = String(env.GITHUB_SERVER_URL ?? "").trim();
  const repository = String(env.GITHUB_REPOSITORY ?? "").trim();
  const runId = String(env.GITHUB_RUN_ID ?? "").trim();
  if (!server || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository) || !/^\d+$/.test(runId)) return null;
  try {
    const parsed = new URL(server);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash) return null;
    return `${parsed.origin}${parsed.pathname.replace(/\/$/, "")}/${repository}/actions/runs/${runId}`;
  } catch {
    return null;
  }
}

function toStepEvidence(result) {
  return result.steps.map((step) => ({
    name: step.name,
    status: step.status,
    tookMs: step.tookMs,
  }));
}

function assertEvidenceTiming(resultGeneratedAt, freshnessGeneratedAt, verifiedAt) {
  const resultTime = Date.parse(resultGeneratedAt);
  const freshnessTime = Date.parse(freshnessGeneratedAt);
  const verifiedTime = Date.parse(verifiedAt);
  const futureToleranceMs = 5 * 60 * 1_000;
  const maxRunAgeMs = 6 * 60 * 60 * 1_000;

  if (resultTime > verifiedTime + futureToleranceMs || freshnessTime > verifiedTime + futureToleranceMs) {
    throw new Error("daily refresh evidence timestamp is in the future");
  }
  if (freshnessTime + futureToleranceMs < resultTime) {
    throw new Error("freshness report predates daily refresh result");
  }
  if (verifiedTime - resultTime > maxRunAgeMs || verifiedTime - freshnessTime > maxRunAgeMs) {
    throw new Error("daily refresh evidence is too old");
  }
}

function renderSuccessReport(input) {
  const lines = [
    "# Daily Refresh 자동 갱신",
    "",
    `- summary.ok: \`${input.result.ok ? "true" : "false"}\``,
    `- mode: \`${input.result.mode}\``,
    `- result generatedAt: \`${input.result.generatedAt}\``,
    `- freshness generatedAt: \`${input.freshness.generatedAt}\``,
    `- result SHA-256: \`${input.resultSha256}\``,
  ];
  if (input.runUrl) lines.push(`- workflow run: ${input.runUrl}`);

  lines.push(
    "",
    "## Step status",
    "",
    "| Step | Status | Took(ms) |",
    "| --- | --- | ---: |",
  );
  for (const step of input.steps) {
    lines.push(`| ${escapeMarkdown(step.name)} | ${escapeMarkdown(step.status)} | ${step.tookMs} |`);
  }

  lines.push(
    "",
    "## Freshness",
    "",
    `- total: ${input.freshness.total}`,
    `- fresh: ${input.freshness.fresh}`,
    `- stale: ${input.freshness.stale}`,
    `- missingTimestamp: ${input.freshness.missingTimestamp}`,
    `- invalidTimestamp: ${input.freshness.invalidTimestamp}`,
    "",
    "## Approved artifact provenance",
    "",
    "| Path | Bytes | Modified at | SHA-256 |",
    "| --- | ---: | --- | --- |",
  );
  for (const artifact of input.artifacts) {
    lines.push(`| ${escapeMarkdown(artifact.path)} | ${artifact.bytes} | ${artifact.modifiedAt} | \`${artifact.sha256}\` |`);
  }
  lines.push(
    "",
    "> Modified at은 Actions workspace의 파일 수정 시각이며 upstream 원천 데이터의 기준일을 대신하지 않습니다.",
    "",
  );
  return lines.join("\n");
}

function renderFailureReport(reason, runUrl) {
  const lines = [
    "# Daily Refresh 검증 실패",
    "",
    "- summary.ok: `false`",
    "- automated PR: `blocked`",
    `- reason: ${escapeMarkdown(reason)}`,
  ];
  if (runUrl) lines.push(`- workflow run: ${runUrl}`);
  lines.push("");
  return lines.join("\n");
}

function writeGithubOutputs(filePath, values) {
  if (!filePath) return;
  const body = Object.entries(values)
    .map(([key, value]) => `${key}=${String(value).replace(/[\r\n]+/g, "")}`)
    .join("\n");
  appendText(filePath, `${body}\n`);
}

export function runDailyRefreshCi(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;
  const resultPath = resolveFromCwd(cwd, options.resultPath ?? "tmp/daily_refresh_result.json");
  const evidencePath = resolveFromCwd(cwd, options.evidencePath ?? "tmp/daily_refresh_evidence.json");
  const prBodyPath = resolveFromCwd(cwd, options.prBodyPath ?? "tmp/daily_refresh_pr_body.md");
  const outputPath = options.outputPath ?? env.GITHUB_OUTPUT;
  const stepSummaryPath = options.stepSummaryPath ?? env.GITHUB_STEP_SUMMARY;
  const runUrl = options.runUrl ?? buildRunUrl(env);
  const verifiedAt = (options.now ?? new Date()).toISOString();

  let result = null;
  let resultSha256 = null;
  try {
    const rawText = fs.readFileSync(resultPath, "utf-8");
    resultSha256 = sha256Text(rawText);
    result = validateDailyRefreshResult(JSON.parse(rawText), { requireStrict: true });
    if (!result.ok) throw new Error("daily refresh result is not ok");

    const doctor = result.steps.find((step) => step.name === "data:doctor");
    if (doctor?.status !== "ok") {
      throw new Error("data:doctor did not complete successfully");
    }

    const freshnessText = fs.readFileSync(path.join(cwd, "docs", "data-freshness-report.md"), "utf-8");
    const freshness = parseDailyRefreshFreshnessReport(freshnessText, {
      requireStrict: true,
      requireFresh: true,
    });
    assertEvidenceTiming(result.generatedAt, freshness.generatedAt, verifiedAt);
    const artifacts = collectDailyRefreshArtifactEvidence(cwd);
    const changedPaths = validateDailyRefreshGitChanges(cwd);
    const steps = toStepEvidence(result);
    const evidence = {
      schemaVersion: 1,
      verifiedAt,
      ok: true,
      runUrl,
      result: {
        generatedAt: result.generatedAt,
        mode: result.mode,
        sha256: resultSha256,
      },
      freshness,
      steps,
      approvedPaths: [...DAILY_REFRESH_APPROVED_PR_PATHS],
      changedPaths,
      artifacts,
    };
    const report = renderSuccessReport({
      result,
      resultSha256,
      freshness,
      steps,
      artifacts,
      runUrl,
    });
    writeText(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
    writeText(prBodyPath, report);
    appendText(stepSummaryPath, report);
    writeGithubOutputs(outputPath, {
      ok: "true",
      generated_at: result.generatedAt,
      result_sha256: resultSha256,
    });
    return { exitCode: 0, evidence, report };
  } catch (error) {
    const reason = safeMessage(error);
    const evidence = {
      schemaVersion: 1,
      verifiedAt,
      ok: false,
      runUrl,
      result: result ? {
        generatedAt: result.generatedAt,
        mode: result.mode,
        ok: result.ok,
        sha256: resultSha256,
        steps: toStepEvidence(result),
      } : null,
      error: {
        code: "DAILY_REFRESH_EVIDENCE_INVALID",
        message: reason,
      },
    };
    const report = renderFailureReport(reason, runUrl);
    writeText(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
    writeText(prBodyPath, report);
    appendText(stepSummaryPath, report);
    writeGithubOutputs(outputPath, {
      ok: "false",
      generated_at: result?.generatedAt ?? "",
      result_sha256: resultSha256 ?? "",
    });
    return { exitCode: 1, evidence, report };
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.checkEnv) {
    validateDailyRefreshEnvironment(process.env);
    console.log("[daily:refresh:ci] required env preflight passed");
    return;
  }
  const result = runDailyRefreshCi(args);
  process.exitCode = result.exitCode;
}

const invokedPath = process.argv[1];
const modulePath = fileURLToPath(import.meta.url);

if (invokedPath && path.resolve(invokedPath) === path.resolve(modulePath)) {
  main().catch((error) => {
    console.error(`[daily:refresh:ci] unexpected error: ${safeMessage(error)}`);
    process.exitCode = 1;
  });
}
