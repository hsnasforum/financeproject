import fs from "node:fs";
import path from "node:path";
import { tsImport } from "tsx/esm/api";

const FIXTURE_PATH = path.join("tests", "planning-v2", "regression", "corpus", "case-002.json");
const DEFAULT_MC_PATHS = 200;
const DEFAULT_MC_SEED = 12345;
const DEFAULT_DEBT_HORIZON = 120;

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function round(value) {
  return Math.round(Number(value) || 0);
}

function normalizeAssumptions(raw) {
  const row = isRecord(raw) ? raw : {};
  return {
    inflationPct: Number.isFinite(Number(row.inflationPct)) ? Number(row.inflationPct) : 2.0,
    investReturnPct: Number.isFinite(Number(row.investReturnPct)) ? Number(row.investReturnPct) : 5.0,
    cashReturnPct: Number.isFinite(Number(row.cashReturnPct)) ? Number(row.cashReturnPct) : 2.0,
    withdrawalRatePct: Number.isFinite(Number(row.retirementWithdrawalRatePct))
      ? Number(row.retirementWithdrawalRatePct)
      : 4.0,
    debtRates: isRecord(row.debtRates) ? row.debtRates : {},
  };
}

function normalizeAprPct(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.abs(value) <= 1 ? value * 100 : value;
}

function toDebtLiabilities(profile) {
  return (Array.isArray(profile.debts) ? profile.debts : []).map((debt) => ({
    id: debt.id,
    name: debt.name,
    type: debt.repaymentType === "interestOnly" ? "interestOnly" : "amortizing",
    principalKrw: Math.max(0, Number(debt.balance) || 0),
    aprPct: normalizeAprPct(Number(debt.aprPct ?? debt.apr) || 0),
    remainingMonths: Math.max(1, Math.trunc(Number(debt.remainingMonths) || DEFAULT_DEBT_HORIZON)),
    minimumPaymentKrw: Math.max(0, Number(debt.minimumPayment) || 0),
  }));
}

function endNetWorth(result) {
  if (!result || !Array.isArray(result.timeline) || result.timeline.length < 1) return 0;
  return Number(result.timeline[result.timeline.length - 1]?.netWorth) || 0;
}

function logSection(title) {
  console.log(`\n[planning:v2:smoke] ${title}`);
}

async function loadTsExports(specifier) {
  const raw = await tsImport(specifier, { parentURL: import.meta.url });
  if (raw && typeof raw === "object" && raw.default && typeof raw.default === "object") {
    return raw.default;
  }
  return raw;
}

async function run() {
  const checks = [];
  try {
    const fixtureAbsolute = path.resolve(process.cwd(), FIXTURE_PATH);
    if (!fs.existsSync(fixtureAbsolute)) {
      throw new Error(`fixture missing: ${FIXTURE_PATH}`);
    }

    const fixture = JSON.parse(fs.readFileSync(fixtureAbsolute, "utf-8"));
    const rawInput = fixture?.input;
    if (!isRecord(rawInput)) {
      throw new Error("fixture input missing");
    }

    const validateModule = await loadTsExports("../src/lib/planning/v2/validate.ts");
    const simulateModule = await loadTsExports("../src/lib/planning/v2/simulateMonthly.ts");
    const scenariosModule = await loadTsExports("../src/lib/planning/v2/runScenarios.ts");
    const monteCarloModule = await loadTsExports("../src/lib/planning/v2/monteCarlo.ts");
    const actionsModule = await loadTsExports("../src/lib/planning/v2/actions/buildActions.ts");
    const debtModule = await loadTsExports("../src/lib/planning/v2/debt/strategy.ts");

    const validateProfileV2 = validateModule.validateProfileV2;
    const validateHorizonMonths = validateModule.validateHorizonMonths;
    const simulateMonthly = simulateModule.simulateMonthly;
    const runScenarios = scenariosModule.runScenarios;
    const runMonteCarlo = monteCarloModule.runMonteCarlo;
    const buildActionsFromPlan = actionsModule.buildActionsFromPlan;
    const computeDebtStrategy = debtModule.computeDebtStrategy;

    if (
      typeof validateProfileV2 !== "function"
      || typeof validateHorizonMonths !== "function"
      || typeof simulateMonthly !== "function"
      || typeof runScenarios !== "function"
      || typeof runMonteCarlo !== "function"
      || typeof buildActionsFromPlan !== "function"
      || typeof computeDebtStrategy !== "function"
    ) {
      throw new Error("required planning exports are missing");
    }

    const profile = validateProfileV2(rawInput.profile);
    const horizonMonths = validateHorizonMonths(rawInput.horizonMonths);
    const assumptions = normalizeAssumptions(rawInput.assumptions);
    const riskTolerance = asString(profile?.risk?.riskTolerance) || "mid";

    logSection("simulate");
    const simulate = simulateMonthly(
      profile,
      {
        inflation: assumptions.inflationPct,
        expectedReturn: assumptions.investReturnPct,
        debtRates: assumptions.debtRates,
      },
      horizonMonths,
    );
    checks.push({
      name: "simulate.timeline.nonempty",
      ok: Array.isArray(simulate.timeline) && simulate.timeline.length > 0,
      detail: `timeline=${simulate.timeline?.length ?? 0}`,
    });
    console.log(`timeline=${simulate.timeline.length} warnings=${simulate.warnings.length} endNetWorth=${round(endNetWorth(simulate)).toLocaleString("ko-KR")}`);

    logSection("scenarios");
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
    const conservative = scenarioRun.scenarios.find((entry) => entry.spec.id === "conservative");
    const aggressive = scenarioRun.scenarios.find((entry) => entry.spec.id === "aggressive");
    checks.push({
      name: "scenarios.count",
      ok: Array.isArray(scenarioRun.scenarios) && scenarioRun.scenarios.length === 2,
      detail: `count=${scenarioRun.scenarios?.length ?? 0}`,
    });
    console.log(
      `base=${round(endNetWorth(scenarioRun.base)).toLocaleString("ko-KR")} conservative=${round(endNetWorth(conservative?.result)).toLocaleString("ko-KR")} aggressive=${round(endNetWorth(aggressive?.result)).toLocaleString("ko-KR")}`,
    );

    logSection("monte-carlo");
    const monteCarlo = runMonteCarlo({
      profile,
      horizonMonths,
      baseAssumptions: {
        inflationPct: assumptions.inflationPct,
        investReturnPct: assumptions.investReturnPct,
        cashReturnPct: assumptions.cashReturnPct,
        withdrawalRatePct: assumptions.withdrawalRatePct,
        debtRates: assumptions.debtRates,
      },
      paths: DEFAULT_MC_PATHS,
      seed: DEFAULT_MC_SEED,
      riskTolerance,
    });
    checks.push({
      name: "monteCarlo.paths",
      ok: Number(monteCarlo?.meta?.paths) === DEFAULT_MC_PATHS,
      detail: `paths=${monteCarlo?.meta?.paths ?? "-"}`,
    });
    console.log(
      `paths=${monteCarlo.meta.paths} depletionProb=${Number(monteCarlo.probabilities.retirementDepletionBeforeEnd ?? 0).toFixed(3)} p50=${round(monteCarlo.percentiles.endNetWorthKrw.p50).toLocaleString("ko-KR")}`,
    );

    logSection("actions");
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
      monteCarlo,
    });
    checks.push({
      name: "actions.nonempty",
      ok: Array.isArray(actions) && actions.length > 0,
      detail: `actions=${actions?.length ?? 0}`,
    });
    console.log(`codes=${actions.map((item) => item.code).join(", ") || "-"}`);

    logSection("debt-strategy");
    const debt = computeDebtStrategy({
      liabilities: toDebtLiabilities(profile),
      monthlyIncomeKrw: Math.max(0, Number(profile.cashflow?.monthlyIncomeKrw ?? profile.monthlyIncomeNet) || 0),
      options: {
        extraPaymentKrw: 100_000,
        compareTermsMonths: [12, 24, 36, 60, 120],
      },
      horizonMonths: DEFAULT_DEBT_HORIZON,
      nowMonthIndex: 0,
    });
    checks.push({
      name: "debtStrategy.meta",
      ok: Number.isFinite(Number(debt?.meta?.debtServiceRatio)),
      detail: `dsr=${debt?.meta?.debtServiceRatio ?? "-"}`,
    });
    console.log(`dsr=${Number(debt.meta.debtServiceRatio).toFixed(4)} totalMonthlyPayment=${round(debt.meta.totalMonthlyPaymentKrw).toLocaleString("ko-KR")} whatIfExtra=${debt.whatIf.extraPayments.length}`);

    const failed = checks.filter((row) => !row.ok);
    if (failed.length > 0) {
      console.error("\n[planning:v2:smoke] FAIL");
      for (const row of failed) {
        console.error(` - ${row.name}: ${row.detail}`);
      }
      process.exit(1);
    }

    console.log("\n[planning:v2:smoke] PASS");
    for (const row of checks) {
      console.log(` - ${row.name}: ${row.detail}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    console.error(`[planning:v2:smoke] FAIL\n${message}`);
    process.exit(1);
  }
}

run();
