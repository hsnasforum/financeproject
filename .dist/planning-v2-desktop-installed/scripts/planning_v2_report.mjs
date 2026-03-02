import fs from "node:fs/promises";
import path from "node:path";
import { tsImport } from "tsx/esm/api";

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toIsoTimestamp(now = new Date()) {
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  const hh = String(now.getUTCHours()).padStart(2, "0");
  const mi = String(now.getUTCMinutes()).padStart(2, "0");
  const ss = String(now.getUTCSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
}

function parseArgs(argv) {
  const out = {
    runId: "",
    inputJson: "",
    outPath: "",
  };
  for (const token of argv) {
    if (!token.startsWith("--")) continue;
    const [rawKey, ...rest] = token.slice(2).split("=");
    const key = asString(rawKey);
    const value = asString(rest.join("="));
    if (key === "run-id") out.runId = value;
    if (key === "input-json") out.inputJson = value;
    if (key === "out") out.outPath = value;
  }
  return out;
}

async function writeTextAtomic(filePath, content) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tmp, content, "utf-8");
  await fs.rename(tmp, filePath);
}

function parseRiskTolerance(rawProfile) {
  if (!isRecord(rawProfile)) return "mid";
  const direct = asString(rawProfile.riskTolerance).toLowerCase();
  if (direct === "low" || direct === "mid" || direct === "high") return direct;
  if (isRecord(rawProfile.risk)) {
    const nested = asString(rawProfile.risk.riskTolerance).toLowerCase();
    if (nested === "low" || nested === "mid" || nested === "high") return nested;
  }
  return "mid";
}

function normalizeAprPct(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.abs(numeric) <= 1 ? numeric * 100 : numeric;
}

function toLiabilitiesFromProfile(profile, fallbackMonths = 120) {
  return (Array.isArray(profile.debts) ? profile.debts : []).map((debt) => ({
    id: debt.id,
    name: debt.name,
    type: debt.repaymentType === "interestOnly" ? "interestOnly" : "amortizing",
    principalKrw: Math.max(0, Number(debt.balance) || 0),
    aprPct: normalizeAprPct(debt.aprPct ?? debt.apr ?? 0),
    remainingMonths: Math.max(1, Math.trunc(Number(debt.remainingMonths) || fallbackMonths)),
    minimumPaymentKrw: Math.max(0, Number(debt.minimumPayment) || 0),
  }));
}

async function loadTs(specifier) {
  const rawModule = await tsImport(specifier, { parentURL: import.meta.url });
  if (rawModule && typeof rawModule === "object" && rawModule.default && typeof rawModule.default === "object") {
    return rawModule.default;
  }
  return rawModule;
}

async function resolveInput(args) {
  const runStore = await loadTs("../src/lib/planning/server/store/runStore.ts");
  const profileStore = await loadTs("../src/lib/planning/server/store/profileStore.ts");
  const validate = await loadTs("../src/lib/planning/server/v2/validate.ts");

  const getRun = runStore.getRun;
  const getProfile = profileStore.getProfile;
  const validateProfileV2 = validate.validateProfileV2;
  const validateHorizonMonths = validate.validateHorizonMonths;

  if (asString(args.runId)) {
    const run = await getRun(args.runId);
    if (!run) throw new Error(`run not found: ${args.runId}`);
    const profileRecord = await getProfile(run.profileId);
    if (!profileRecord) throw new Error(`profile not found: ${run.profileId}`);

    return {
      source: `run:${run.id}`,
      profile: validateProfileV2(profileRecord.profile),
      horizonMonths: validateHorizonMonths(run.input?.horizonMonths ?? 120),
      assumptionsOverridesRaw: isRecord(run.input?.assumptionsOverride) ? run.input.assumptionsOverride : {},
      snapshotId: asString(run.input?.snapshotId) || undefined,
      options: {
        policyId: asString(run.input?.policyId) || "balanced",
        runScenarios: run.input?.runScenarios !== false,
        runMonteCarlo: isRecord(run.input?.monteCarlo),
        runActions: run.input?.getActions !== false,
        runDebt: run.input?.analyzeDebt === true,
        monteCarlo: isRecord(run.input?.monteCarlo) ? run.input.monteCarlo : undefined,
        debtStrategy: isRecord(run.input?.debtStrategy) ? run.input.debtStrategy : undefined,
      },
      title: run.title || `Run ${run.id}`,
      snapshotMetaHint: run.meta?.snapshot,
    };
  }

  if (asString(args.inputJson)) {
    const parsed = JSON.parse(args.inputJson);
    if (!isRecord(parsed)) throw new Error("input-json must be an object");
    return {
      source: "input-json",
      profile: validateProfileV2(parsed.profile),
      horizonMonths: validateHorizonMonths(parsed.horizonMonths),
      assumptionsOverridesRaw: isRecord(parsed.assumptions) ? parsed.assumptions : {},
      snapshotId: asString(parsed.snapshotId) || undefined,
      options: {
        policyId: asString(parsed.policyId) || "balanced",
        runScenarios: parsed.runScenarios !== false,
        runMonteCarlo: isRecord(parsed.monteCarlo),
        runActions: parsed.getActions !== false,
        runDebt: parsed.analyzeDebt === true,
        monteCarlo: isRecord(parsed.monteCarlo) ? parsed.monteCarlo : undefined,
        debtStrategy: isRecord(parsed.debtStrategy) ? parsed.debtStrategy : undefined,
      },
      title: asString(parsed.title) || "Planning Report",
    };
  }

  throw new Error("provide --run-id=<id> or --input-json='<json>'");
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const planningServiceModule = await loadTs("../src/lib/planning/server/v2/service.ts");
  const reportModule = await loadTs("../src/lib/planning/server/v2/report.ts");

  const createPlanningService = planningServiceModule.createPlanningService;
  const toMarkdownReport = reportModule.toMarkdownReport;
  if (typeof createPlanningService !== "function" || typeof toMarkdownReport !== "function") {
    throw new Error("planning exports missing");
  }
  const planningService = createPlanningService();

  const input = await resolveInput(args);
  const riskTolerance = parseRiskTolerance(input.profile);
  const resolved = await planningService.resolveAssumptionsContext({
    profile: input.profile,
    riskTolerance,
    assumptionsOverridesRaw: input.assumptionsOverridesRaw,
    requestedSnapshotId: input.snapshotId,
  });

  const simulate = planningService.simulate(
    input.profile,
    resolved.simulationAssumptions,
    input.horizonMonths,
    { policyId: input.options.policyId },
  );
  let scenarios = undefined;
  if (input.options.runScenarios) {
    scenarios = planningService.scenarios({
      profile: input.profile,
      horizonMonths: input.horizonMonths,
      baseAssumptions: resolved.assumptions,
      riskTolerance,
      policyId: input.options.policyId,
    });
  }

  let monteCarlo = undefined;
  if (input.options.runMonteCarlo) {
    const row = isRecord(input.options.monteCarlo) ? input.options.monteCarlo : {};
    monteCarlo = planningService.monteCarlo({
      profile: input.profile,
      horizonMonths: input.horizonMonths,
      baseAssumptions: resolved.assumptions,
      riskTolerance,
      policyId: input.options.policyId,
      paths: Math.max(1, Math.trunc(Number(row.paths) || 2000)),
      seed: Math.trunc(Number(row.seed) || 12345),
    });
  }

  let actions = undefined;
  if (input.options.runActions) {
    actions = {
      actions: planningService.buildActions({
        plan: simulate,
        profile: input.profile,
        baseAssumptions: resolved.assumptions,
        snapshotMeta: {
          asOf: resolved.snapshotMeta.asOf,
          missing: resolved.snapshotMeta.missing,
        },
        monteCarlo,
      }),
    };
  }

  let debt = undefined;
  if (input.options.runDebt) {
    const debtStrategy = isRecord(input.options.debtStrategy) ? input.options.debtStrategy : {};
    debt = planningService.computeDebtStrategy({
      liabilities: toLiabilitiesFromProfile(input.profile),
      monthlyIncomeKrw: Math.max(0, Number(input.profile.cashflow?.monthlyIncomeKrw ?? input.profile.monthlyIncomeNet) || 0),
      offers: Array.isArray(debtStrategy.offers) ? debtStrategy.offers : [],
      options: isRecord(debtStrategy.options) ? debtStrategy.options : undefined,
      nowMonthIndex: 0,
      horizonMonths: 120,
    });
  }

  const generatedAt = new Date().toISOString();
  const markdown = toMarkdownReport({
    title: input.title,
    generatedAt,
    snapshot: resolved.snapshotMeta,
    assumptionsLabel: `${resolved.assumptions.inflationPct.toFixed(1)}% inflation / ${resolved.assumptions.investReturnPct.toFixed(1)}% return`,
    plan: simulate,
    scenarios,
    monteCarlo,
    actions,
    ...(debt ? { debt } : {}),
  });

  const defaultOut = path.join(".data", "planning", "reports", `${toIsoTimestamp()}.md`);
  const outRel = asString(args.outPath) || defaultOut;
  const outAbs = path.resolve(process.cwd(), outRel);
  await writeTextAtomic(outAbs, markdown);

  console.log(`[planning:v2:report] source=${input.source}`);
  console.log(`[planning:v2:report] report=${path.relative(process.cwd(), outAbs).replaceAll("\\", "/")}`);
}

run().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(`[planning:v2:report] FAIL\n${message}`);
  process.exit(1);
});
