import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import readline from "node:readline/promises";
import { createIsolatedPlanningV2E2EOptions } from "./planning_v2_e2e_isolation.mjs";

const CORPUS_DIR = path.join("tests", "planning-v2", "regression", "corpus");
const BASELINE_DIR = path.join("tests", "planning-v2", "regression", "baseline");
const LATEST_REPORT_PATH = path.join(".data", "planning", "eval", "latest.json");

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toInt(value, fallback = 0) {
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function writeJsonAtomic(filePath, value) {
  ensureDir(filePath);
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
  fs.renameSync(tmpPath, filePath);
}

function toYyyyMmDd(date = new Date()) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toYyyyMmDdCompact(date = new Date()) {
  return toYyyyMmDd(date).replaceAll("-", "");
}

function normalizeRiskTolerance(raw) {
  if (!isRecord(raw)) return "mid";
  const direct = asString(raw.riskTolerance).toLowerCase();
  if (direct === "low" || direct === "mid" || direct === "high") return direct;

  const risk = isRecord(raw.risk) ? raw.risk : null;
  const nested = asString(risk?.riskTolerance).toLowerCase();
  if (nested === "low" || nested === "mid" || nested === "high") return nested;

  return "mid";
}

function normalizeAssumptions(raw) {
  const row = isRecord(raw) ? raw : {};

  const inflationPct = Number.isFinite(Number(row.inflationPct))
    ? Number(row.inflationPct)
    : Number.isFinite(Number(row.inflation))
      ? Number(row.inflation)
      : 2.0;

  const investReturnPct = Number.isFinite(Number(row.investReturnPct))
    ? Number(row.investReturnPct)
    : Number.isFinite(Number(row.expectedReturn))
      ? Number(row.expectedReturn)
      : 5.0;

  const cashReturnPct = Number.isFinite(Number(row.cashReturnPct))
    ? Number(row.cashReturnPct)
    : 2.0;

  const withdrawalRatePct = Number.isFinite(Number(row.withdrawalRatePct))
    ? Number(row.withdrawalRatePct)
    : Number.isFinite(Number(row.retirementWithdrawalRatePct))
      ? Number(row.retirementWithdrawalRatePct)
      : 4.0;

  const debtRates = isRecord(row.debtRates) ? row.debtRates : {};

  return {
    inflationPct,
    investReturnPct,
    cashReturnPct,
    withdrawalRatePct,
    debtRates,
  };
}

function normalizeSnapshotMeta(raw) {
  const row = isRecord(raw) ? raw : {};
  if (row.missing === true) {
    return { missing: true };
  }
  return {
    asOf: asString(row.asOf) || "2026-01-31",
    fetchedAt: asString(row.fetchedAt) || "2026-02-15T00:00:00.000Z",
    missing: false,
    ...(Number.isFinite(Number(row.warningsCount)) ? { warningsCount: toInt(row.warningsCount, 0) } : {}),
  };
}

function normalizeAprPct(value) {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return 0;
  return Math.abs(raw) <= 1 ? raw * 100 : raw;
}

function toLiabilitiesFromProfile(profile, fallbackMonths) {
  const debts = Array.isArray(profile?.debts) ? profile.debts : [];
  return debts.map((debt, index) => ({
    id: asString(debt?.id) || `debt-${index + 1}`,
    name: asString(debt?.name) || `Debt ${index + 1}`,
    type: debt?.repaymentType === "interestOnly" ? "interestOnly" : "amortizing",
    principalKrw: Math.max(0, Number(debt?.balance) || 0),
    aprPct: normalizeAprPct(debt?.aprPct ?? debt?.apr ?? 0),
    remainingMonths: Math.max(1, toInt(debt?.remainingMonths, fallbackMonths)),
    minimumPaymentKrw: Math.max(0, Number(debt?.minimumPayment) || 0),
  }));
}

function normalizeDebtOffers(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => (isRecord(entry) ? entry : null))
    .filter((entry) => entry !== null)
    .map((entry) => {
      const liabilityId = asString(entry.liabilityId);
      const newAprPct = Number(entry.newAprPct);
      if (!liabilityId || !Number.isFinite(newAprPct)) return null;
      const feeKrw = Number(entry.feeKrw);
      const title = asString(entry.title);
      return {
        liabilityId,
        newAprPct,
        ...(Number.isFinite(feeKrw) && feeKrw >= 0 ? { feeKrw: Math.round(feeKrw) } : {}),
        ...(title ? { title } : {}),
      };
    })
    .filter((entry) => entry !== null);
}

function parseArgs(argv) {
  const out = {
    update: false,
    reportOnly: false,
    confirm: "",
  };

  for (const arg of argv) {
    if (arg === "--update") {
      out.update = true;
      continue;
    }
    if (arg === "--report") {
      out.reportOnly = true;
      continue;
    }
    if (arg.startsWith("--confirm=")) {
      out.confirm = asString(arg.split("=")[1]);
    }
  }

  return out;
}

function getCorpusFiles(cwd) {
  const dirPath = path.join(cwd, CORPUS_DIR);
  if (!fs.existsSync(dirPath)) return [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
    .map((entry) => path.join(dirPath, entry.name))
    .sort((a, b) => a.localeCompare(b));
}

function baselinePathFor(cwd, caseId) {
  return path.join(cwd, BASELINE_DIR, `${caseId}.json`);
}

function reportPath(cwd) {
  return path.join(cwd, LATEST_REPORT_PATH);
}

function formatDiff(diff) {
  const base = `${diff.path} [${diff.kind}]`;
  if (diff.kind === "set") {
    return `${base} added=${(diff.added ?? []).join(",") || "-"} removed=${(diff.removed ?? []).join(",") || "-"}`;
  }
  if (typeof diff.diff === "number" && typeof diff.tolerance === "number") {
    return `${base} diff=${diff.diff} tolerance=${diff.tolerance} expected=${JSON.stringify(diff.expected)} actual=${JSON.stringify(diff.actual)}`;
  }
  return `${base} expected=${JSON.stringify(diff.expected)} actual=${JSON.stringify(diff.actual)}`;
}

async function promptConfirm(message) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    const answer = await rl.question(message);
    return asString(answer);
  } finally {
    rl.close();
  }
}

function readLatestReport(cwd) {
  const filePath = reportPath(cwd);
  if (!fs.existsSync(filePath)) {
    throw new Error(`report missing: ${path.relative(cwd, filePath)}`);
  }
  return readJson(filePath);
}

function runPnpmScript(script, cwd, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
    const child = spawn(command, [script], {
      cwd,
      env: {
        ...process.env,
        ...extraEnv,
      },
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? 1));
  });
}

async function loadTsExports(specifier) {
  const raw = await import(specifier);
  if (raw && typeof raw === "object" && raw.default && typeof raw.default === "object") {
    return raw.default;
  }
  return raw;
}

async function appendAudit(event, summary, details) {
  try {
    const auditModule = await loadTsExports("../src/lib/audit/auditLogStore.ts");
    if (typeof auditModule.append === "function") {
      auditModule.append({
        event,
        route: "scripts/planning_v2_regression.mjs",
        summary,
        details,
      });
    }
  } catch {
    // keep regression runner independent from audit failures
  }
}

function buildCaseError(id, title, message) {
  return {
    id,
    title,
    status: "FAIL",
    baselineFound: false,
    diffs: [{ path: "case", kind: "missing", expected: "valid input", actual: message }],
  };
}

async function runRegression() {
  const cwd = process.cwd();
  const generatedAt = new Date().toISOString();
  const args = parseArgs(process.argv.slice(2));

  if (args.reportOnly) {
    const latest = readLatestReport(cwd);
    const summary = latest?.summary ?? {};
    console.log(`[planning:v2:regress] latest generatedAt=${asString(latest?.generatedAt) || "-"}`);
    console.log(`[planning:v2:regress] total=${toInt(summary.total)} pass=${toInt(summary.pass)} fail=${toInt(summary.fail)}`);
    const failed = Array.isArray(latest?.cases) ? latest.cases.filter((item) => item?.status === "FAIL") : [];
    for (const row of failed) {
      console.log(`[planning:v2:regress] FAIL ${asString(row?.id)} - ${asString(row?.title)}`);
    }
    return;
  }

  const normalizeModule = await loadTsExports("../src/lib/planning/v2/regression/normalize.ts");
  const compareModule = await loadTsExports("../src/lib/planning/v2/regression/compare.ts");
  const simulateModule = await loadTsExports("../src/lib/planning/v2/simulateMonthly.ts");
  const scenariosModule = await loadTsExports("../src/lib/planning/v2/runScenarios.ts");
  const monteCarloModule = await loadTsExports("../src/lib/planning/v2/monteCarlo.ts");
  const actionsModule = await loadTsExports("../src/lib/planning/v2/actions/buildActions.ts");
  const healthModule = await loadTsExports("../src/lib/planning/v2/assumptionsHealth.ts");
  const debtModule = await loadTsExports("../src/lib/planning/v2/debt/strategy.ts");
  const validateModule = await loadTsExports("../src/lib/planning/v2/validate.ts");

  const normalizeRegressionOutput = normalizeModule.normalizeRegressionOutput;
  const compareRegressionExpected = compareModule.compareRegressionExpected;
  const simulateMonthly = simulateModule.simulateMonthly;
  const runScenarios = scenariosModule.runScenarios;
  const runMonteCarlo = monteCarloModule.runMonteCarlo;
  const buildActionsFromPlan = actionsModule.buildActionsFromPlan;
  const assessAssumptionsHealth = healthModule.assessAssumptionsHealth;
  const assessRiskAssumptionConsistency = healthModule.assessRiskAssumptionConsistency;
  const combineAssumptionsHealth = healthModule.combineAssumptionsHealth;
  const computeDebtStrategy = debtModule.computeDebtStrategy;
  const validateProfileV2 = validateModule.validateProfileV2;
  const validateHorizonMonths = validateModule.validateHorizonMonths;

  const corpusFiles = getCorpusFiles(cwd);
  if (corpusFiles.length === 0) {
    throw new Error(`no corpus files found: ${CORPUS_DIR}`);
  }

  const cases = [];

  for (const filePath of corpusFiles) {
    const raw = readJson(filePath);
    const id = asString(raw?.id) || path.basename(filePath, ".json");
    const title = asString(raw?.title) || id;

    try {
      if (!isRecord(raw?.input)) {
        cases.push(buildCaseError(id, title, "input missing"));
        continue;
      }

      const input = raw.input;
      const riskTolerance = normalizeRiskTolerance(input.profile);
      const profile = validateProfileV2(input.profile);
      const horizonMonths = validateHorizonMonths(input.horizonMonths);
      const assumptions = normalizeAssumptions(input.assumptions);
      const snapshotMeta = normalizeSnapshotMeta(input.snapshotMeta);
      const monteCarloInput = isRecord(input.monteCarlo) ? input.monteCarlo : null;
      const debtOffers = normalizeDebtOffers(input.debtOffers);

      const simulate = simulateMonthly(
        profile,
        {
          inflation: assumptions.inflationPct,
          expectedReturn: assumptions.investReturnPct,
          debtRates: assumptions.debtRates,
        },
        horizonMonths,
      );

      const scenarioRun = runScenarios({
        profile,
        horizonMonths,
        baseAssumptions: {
          inflationPct: assumptions.inflationPct,
          investReturnPct: assumptions.investReturnPct,
          cashReturnPct: assumptions.cashReturnPct,
          withdrawalRatePct: assumptions.withdrawalRatePct,
          debtRates: assumptions.debtRates,
        },
        riskTolerance,
      });

      const conservativeResult = scenarioRun.scenarios.find((entry) => entry.spec.id === "conservative")?.result;
      const aggressiveResult = scenarioRun.scenarios.find((entry) => entry.spec.id === "aggressive")?.result;

      const monteCarlo = monteCarloInput
        ? runMonteCarlo({
          profile,
          horizonMonths,
          baseAssumptions: {
            inflationPct: assumptions.inflationPct,
            investReturnPct: assumptions.investReturnPct,
            cashReturnPct: assumptions.cashReturnPct,
            withdrawalRatePct: assumptions.withdrawalRatePct,
            debtRates: assumptions.debtRates,
          },
          paths: toInt(monteCarloInput.paths, 1000),
          seed: toInt(monteCarloInput.seed, 12345),
          riskTolerance,
        })
        : undefined;

      const actions = buildActionsFromPlan({
        plan: simulate,
        profile,
        baseAssumptions: {
          inflationPct: assumptions.inflationPct,
          investReturnPct: assumptions.investReturnPct,
          cashReturnPct: assumptions.cashReturnPct,
          withdrawalRatePct: assumptions.withdrawalRatePct,
          debtRates: assumptions.debtRates,
        },
        ...(monteCarlo ? { monteCarlo } : {}),
      });

      const baseHealth = assessAssumptionsHealth({
        assumptions: {
          inflationPct: assumptions.inflationPct,
          investReturnPct: assumptions.investReturnPct,
          cashReturnPct: assumptions.cashReturnPct,
          withdrawalRatePct: assumptions.withdrawalRatePct,
          debtRates: assumptions.debtRates,
        },
        snapshotMeta,
      });
      const riskWarnings = assessRiskAssumptionConsistency(
        riskTolerance,
        {
          inflationPct: assumptions.inflationPct,
          investReturnPct: assumptions.investReturnPct,
          cashReturnPct: assumptions.cashReturnPct,
          withdrawalRatePct: assumptions.withdrawalRatePct,
          debtRates: assumptions.debtRates,
        },
      );
      const health = combineAssumptionsHealth(baseHealth, riskWarnings);

      const debtStrategy = computeDebtStrategy({
        liabilities: toLiabilitiesFromProfile(profile, horizonMonths),
        monthlyIncomeKrw: Math.max(0, Number(profile.cashflow?.monthlyIncomeKrw ?? profile.monthlyIncomeNet) || 0),
        horizonMonths,
        nowMonthIndex: 0,
        ...(debtOffers.length > 0 ? { offers: debtOffers } : {}),
      });

      const actual = normalizeRegressionOutput({
        simulate,
        scenarios: {
          base: scenarioRun.base,
          conservative: conservativeResult,
          aggressive: aggressiveResult,
        },
        ...(monteCarlo ? { monteCarlo } : {}),
        actions,
        health: health.summary,
        debtStrategy,
      });

      const baselineFilePath = baselinePathFor(cwd, id);
      const baselineFound = fs.existsSync(baselineFilePath);

      if (!baselineFound) {
        cases.push({
          id,
          title,
          status: "FAIL",
          baselineFound,
          actual,
          diffs: [{ path: "baseline", kind: "missing", expected: "baseline file", actual: null }],
        });
        continue;
      }

      const baseline = readJson(baselineFilePath);
      const expected = baseline?.expected;
      const compare = compareRegressionExpected(expected, actual);

      cases.push({
        id,
        title,
        status: compare.ok ? "PASS" : "FAIL",
        baselineFound,
        actual,
        expected,
        diffs: compare.diffs,
      });
    } catch (error) {
      cases.push(buildCaseError(id, title, error instanceof Error ? error.message : String(error)));
    }
  }

  const pass = cases.filter((row) => row.status === "PASS").length;
  const fail = cases.length - pass;

  for (const row of cases) {
    console.log(`[planning:v2:regress] ${row.status} ${row.id} - ${row.title}`);
    if (row.status === "FAIL") {
      for (const diff of row.diffs) {
        console.log(`  - ${formatDiff(diff)}`);
      }
    }
  }

  const report = {
    version: 1,
    generatedAt,
    mode: args.update ? "update" : "check",
    summary: {
      total: cases.length,
      pass,
      fail,
    },
    cases,
  };

  writeJsonAtomic(reportPath(cwd), report);
  console.log(`[planning:v2:regress] report=${path.relative(cwd, reportPath(cwd))}`);

  await appendAudit(
    "PLANNING_V2_REGRESS_RUN",
    `PLANNING_V2_REGRESS_RUN ${fail === 0 ? "SUCCESS" : "FAIL"}`,
    {
      result: fail === 0 ? "SUCCESS" : "FAIL",
      totalCases: cases.length,
      failCount: fail,
    },
  );

  if (args.update) {
    const expectedConfirm = `UPDATE_BASELINE planning-v2 ${toYyyyMmDdCompact(new Date())}`;
    console.log(`[planning:v2:regress] update requested. confirm required: ${expectedConfirm}`);

    const confirmText = args.confirm || await promptConfirm("Type confirm text to update baseline: ");
    if (confirmText !== expectedConfirm) {
      console.error("[planning:v2:regress] baseline update rejected: confirm mismatch");

      await appendAudit(
        "PLANNING_V2_BASELINE_UPDATE",
        "PLANNING_V2_BASELINE_UPDATE REJECTED",
        {
          result: "REJECTED",
          totalCases: cases.length,
          changedCases: cases.filter((row) => row.status === "FAIL").length,
          confirmMatched: false,
        },
      );
      process.exit(1);
    }

    const changedCases = [];
    for (const row of cases) {
      const outPath = baselinePathFor(cwd, row.id);
      const nextBaseline = {
        id: row.id,
        generatedAt,
        expected: row.actual,
      };
      writeJsonAtomic(outPath, nextBaseline);
      if (row.status !== "PASS") {
        changedCases.push(row.id);
      }
    }

    console.log(`[planning:v2:regress] baseline updated: ${cases.length} cases (${changedCases.length} changed)`);

    await appendAudit(
      "PLANNING_V2_BASELINE_UPDATE",
      "PLANNING_V2_BASELINE_UPDATE SUCCESS",
      {
        result: "SUCCESS",
        totalCases: cases.length,
        changedCases: changedCases.length,
        confirmMatched: true,
      },
    );

    return;
  }

  if (fail > 0) {
    process.exit(1);
  }

  const externalBaseUrl = asString(process.env.PLANNING_BASE_URL);
  if (externalBaseUrl) {
    const e2eExitCode = await runPnpmScript("planning:v2:e2e:full", cwd, { E2E_BASE_URL: externalBaseUrl });
    if (e2eExitCode !== 0) {
      throw new Error(`planning:v2:e2e:full failed with code ${e2eExitCode}`);
    }
    return;
  }

  const isolated = await createIsolatedPlanningV2E2EOptions(process.env, {
    defaultPort: 3326,
    preferredPort: process.env.PLANNING_FULL_E2E_PORT ?? process.env.PORT,
    scanFrom: process.env.PLANNING_FULL_E2E_SCAN_FROM,
    scanTo: process.env.PLANNING_FULL_E2E_SCAN_TO,
    sandboxPrefix: "finance-planning-full-e2e-",
  });
  console.log(
    `[planning:v2:regress] isolated full e2e port=${isolated.port} distDir=${isolated.distDir} reuseExistingServer=0 planningDataDir=${isolated.planningDataDir}`,
  );
  try {
    const e2eExitCode = await runPnpmScript("planning:v2:e2e:full", cwd, isolated.env);
    if (e2eExitCode !== 0) {
      throw new Error(`planning:v2:e2e:full failed with code ${e2eExitCode}`);
    }
  } finally {
    await isolated.cleanup();
  }
}

runRegression().catch(async (error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(`[planning:v2:regress] failed\n${message}`);

  await appendAudit(
    "PLANNING_V2_REGRESS_RUN",
    "PLANNING_V2_REGRESS_RUN FAIL",
    {
      result: "FAIL",
      message: asString(error instanceof Error ? error.message : String(error)),
    },
  );
  process.exit(1);
});
