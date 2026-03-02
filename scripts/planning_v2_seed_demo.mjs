const DEMO_PROFILE_NAME = "Demo Profile";
const DEMO_RUN_TITLE = "Demo Run (defaults)";
const DEMO_HORIZON_MONTHS = 360;
const DEMO_MC_PATHS = 300;
const DEMO_MC_SEED = 12345;

function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeAprPct(value) {
  if (!Number.isFinite(value)) return 0;
  if (Math.abs(value) <= 1) return value * 100;
  return value;
}

function parseRiskTolerance(rawProfile) {
  if (!isRecord(rawProfile)) return "mid";
  const direct = typeof rawProfile.riskTolerance === "string" ? rawProfile.riskTolerance.trim().toLowerCase() : "";
  if (direct === "low" || direct === "mid" || direct === "high") return direct;
  const nested = isRecord(rawProfile.risk) && typeof rawProfile.risk.riskTolerance === "string"
    ? rawProfile.risk.riskTolerance.trim().toLowerCase()
    : "";
  if (nested === "low" || nested === "mid" || nested === "high") return nested;
  return "mid";
}

function toLiabilitiesFromProfile(profile, fallbackMonths) {
  return (Array.isArray(profile.debts) ? profile.debts : []).map((debt) => ({
    id: debt.id,
    name: debt.name,
    type: debt.repaymentType === "interestOnly" ? "interestOnly" : "amortizing",
    principalKrw: Math.max(0, Number(debt.balance) || 0),
    aprPct: normalizeAprPct(Number(debt.aprPct ?? debt.apr) || 0),
    remainingMonths: Math.max(1, Math.trunc(Number(debt.remainingMonths) || fallbackMonths)),
    minimumPaymentKrw: Math.max(0, Number(debt.minimumPayment) || 0),
  }));
}

function pickKeyTimelinePoints(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const candidates = [0, 12, 24, rows.length - 1];
  const seen = new Set();
  const out = [];
  for (const index of candidates) {
    if (index < 0 || index >= rows.length || seen.has(index)) continue;
    seen.add(index);
    out.push({ monthIndex: index, row: rows[index] });
  }
  return out;
}

function summarizePlan(plan) {
  const rows = Array.isArray(plan.timeline) ? plan.timeline : [];
  const first = rows[0];
  const last = rows[rows.length - 1];
  const worst = rows.reduce((min, row) => (row.liquidAssets < min.liquidAssets ? row : min), rows[0] ?? {
    month: 1,
    liquidAssets: 0,
  });

  return {
    startNetWorthKrw: first?.netWorth ?? 0,
    endNetWorthKrw: last?.netWorth ?? 0,
    netWorthDeltaKrw: (last?.netWorth ?? 0) - (first?.netWorth ?? 0),
    worstCashMonthIndex: Math.max(0, (worst?.month ?? 1) - 1),
    worstCashKrw: worst?.liquidAssets ?? 0,
    goalsAchievedCount: (plan.goalStatus ?? []).filter((goal) => goal.achieved).length,
    goalsMissedCount: (plan.goalStatus ?? []).filter((goal) => !goal.achieved).length,
    warningsCount: (plan.warnings ?? []).length,
  };
}

function summarizeScenarioResult(result) {
  const summary = summarizePlan(result);
  return {
    endNetWorthKrw: summary.endNetWorthKrw,
    worstCashMonthIndex: summary.worstCashMonthIndex,
    worstCashKrw: summary.worstCashKrw,
    goalsAchievedCount: summary.goalsAchievedCount,
    warningsCount: summary.warningsCount,
  };
}

function buildSnapshotMeta(snapshot, snapshotId) {
  if (!snapshot) return { missing: true };
  return {
    ...(snapshotId ? { id: snapshotId } : {}),
    asOf: snapshot.asOf,
    fetchedAt: snapshot.fetchedAt,
    missing: false,
    warningsCount: Array.isArray(snapshot.warnings) ? snapshot.warnings.length : 0,
    sourcesCount: Array.isArray(snapshot.sources) ? snapshot.sources.length : 0,
  };
}

const DEMO_PROFILE_RAW = {
  monthlyIncomeNet: 5_100_000,
  monthlyEssentialExpenses: 1_800_000,
  monthlyDiscretionaryExpenses: 850_000,
  liquidAssets: 6_500_000,
  investmentAssets: 18_000_000,
  debts: [
    {
      id: "demo-loan-1",
      name: "Mortgage A",
      balance: 78_000_000,
      minimumPayment: 1_120_000,
      aprPct: 4.8,
      remainingMonths: 180,
      repaymentType: "amortizing",
    },
  ],
  goals: [
    {
      id: "goal-emergency",
      name: "Emergency Fund",
      targetAmount: 16_000_000,
      currentAmount: 3_500_000,
      targetMonth: 24,
      priority: 5,
      minimumMonthlyContribution: 300_000,
    },
    {
      id: "goal-home-downpayment",
      name: "Lump Sum Goal",
      targetAmount: 45_000_000,
      currentAmount: 5_000_000,
      targetMonth: 84,
      priority: 4,
      minimumMonthlyContribution: 350_000,
    },
    {
      id: "goal-retirement",
      name: "Retirement",
      targetAmount: 420_000_000,
      currentAmount: 20_000_000,
      targetMonth: 300,
      priority: 5,
      minimumMonthlyContribution: 450_000,
    },
  ],
  cashflow: {
    monthlyIncomeKrw: 5_100_000,
    monthlyFixedExpensesKrw: 1_800_000,
    monthlyVariableExpensesKrw: 850_000,
    phases: [
      {
        id: "phase-work",
        title: "Working",
        range: { startMonth: 0, endMonth: 239 },
        monthlyIncomeKrw: 5_100_000,
        monthlyFixedExpensesKrw: 1_800_000,
        monthlyVariableExpensesKrw: 850_000,
        incomeGrowthPctYoY: 0.02,
      },
      {
        id: "phase-retire",
        title: "Retired",
        range: { startMonth: 240, endMonth: 359 },
        monthlyIncomeKrw: 450_000,
        monthlyFixedExpensesKrw: 1_550_000,
        monthlyVariableExpensesKrw: 700_000,
      },
    ],
    pensions: [
      {
        id: "pension-nps",
        title: "National Pension",
        range: { startMonth: 240, endMonth: 359 },
        monthlyPayoutKrw: 1_200_000,
      },
    ],
    contributions: [
      {
        id: "contrib-invest",
        title: "Invest Auto Transfer",
        range: { startMonth: 0, endMonth: 239 },
        from: "cash",
        to: "investments",
        monthlyAmountKrw: 300_000,
      },
      {
        id: "contrib-pension",
        title: "Pension Auto Transfer",
        range: { startMonth: 0, endMonth: 239 },
        from: "cash",
        to: "pension",
        monthlyAmountKrw: 150_000,
      },
    ],
    rules: {
      phaseOverlapPolicy: "sum",
    },
  },
  risk: {
    riskTolerance: "mid",
  },
};

async function run() {
  const {
    listProfiles,
    createProfile,
  } = await import("../src/lib/planning/store/profileStore.ts");
  const {
    listRuns,
    createRun,
  } = await import("../src/lib/planning/store/runStore.ts");
  const {
    loadLatestAssumptionsSnapshot,
    findAssumptionsSnapshotId,
  } = await import("../src/lib/planning/assumptions/storage.ts");
  const {
    mapSnapshotToAssumptionsV2,
    mapSnapshotToScenarioExtrasV2,
  } = await import("../src/lib/planning/assumptions/mapSnapshotToAssumptionsV2.ts");
  const { DEFAULT_ASSUMPTIONS_V2 } = await import("../src/lib/planning/v2/defaults.ts");
  const {
    assessAssumptionsHealth,
    assessRiskAssumptionConsistency,
    combineAssumptionsHealth,
  } = await import("../src/lib/planning/v2/assumptionsHealth.ts");
  const {
    toScenarioAssumptionsV2,
  } = await import("../src/lib/planning/v2/scenarios.ts");
  const { validateProfileV2 } = await import("../src/lib/planning/v2/validate.ts");
  const { simulateMonthly } = await import("../src/lib/planning/v2/simulateMonthly.ts");
  const { runScenarios } = await import("../src/lib/planning/v2/runScenarios.ts");
  const { runMonteCarlo } = await import("../src/lib/planning/v2/monteCarlo.ts");
  const { buildActionsFromPlan } = await import("../src/lib/planning/v2/actions/buildActions.ts");
  const { computeDebtStrategy } = await import("../src/lib/planning/v2/debt/strategy.ts");

  const riskTolerance = parseRiskTolerance(DEMO_PROFILE_RAW);
  const normalizedProfile = validateProfileV2(DEMO_PROFILE_RAW);

  const profiles = await listProfiles();
  let profileRecord = profiles.find((row) => row.name === DEMO_PROFILE_NAME) ?? null;
  let profileCreated = false;
  if (!profileRecord) {
    profileRecord = await createProfile({
      name: DEMO_PROFILE_NAME,
      profile: normalizedProfile,
    });
    profileCreated = true;
  }

  const existingRuns = await listRuns({ profileId: profileRecord.id, limit: 200 });
  const existingRun = existingRuns.find((row) => row.title === DEMO_RUN_TITLE) ?? null;
  if (existingRun) {
    console.log(`[planning:v2:seed] profile=${profileRecord.id} (${profileCreated ? "created" : "existing"})`);
    console.log(`[planning:v2:seed] run=${existingRun.id} (existing, skipped)`);
    return;
  }

  const snapshot = await loadLatestAssumptionsSnapshot();
  const snapshotId = snapshot ? await findAssumptionsSnapshotId(snapshot) : undefined;
  const snapshotMeta = buildSnapshotMeta(snapshot, snapshotId);

  const mappedFromSnapshot = mapSnapshotToAssumptionsV2(snapshot);
  const mappedScenarioExtras = mapSnapshotToScenarioExtrasV2(snapshot);
  const finalSimulationAssumptions = {
    ...DEFAULT_ASSUMPTIONS_V2,
    ...mappedFromSnapshot,
  };
  const baseAssumptions = toScenarioAssumptionsV2(finalSimulationAssumptions, {
    ...mappedScenarioExtras.extra,
  });

  const baseHealth = assessAssumptionsHealth({
    assumptions: baseAssumptions,
    snapshotMeta,
  });
  const riskWarnings = assessRiskAssumptionConsistency(riskTolerance, baseAssumptions);
  const health = combineAssumptionsHealth(baseHealth, [...riskWarnings, ...mappedScenarioExtras.warnings]);

  const plan = simulateMonthly(normalizedProfile, finalSimulationAssumptions, DEMO_HORIZON_MONTHS);
  const scenarios = runScenarios({
    profile: normalizedProfile,
    horizonMonths: DEMO_HORIZON_MONTHS,
    baseAssumptions,
    riskTolerance,
  });
  const monteCarlo = runMonteCarlo({
    profile: normalizedProfile,
    horizonMonths: DEMO_HORIZON_MONTHS,
    baseAssumptions,
    paths: DEMO_MC_PATHS,
    seed: DEMO_MC_SEED,
    riskTolerance,
  });

  const actions = buildActionsFromPlan({
    plan,
    profile: normalizedProfile,
    baseAssumptions,
    snapshotMeta: {
      asOf: snapshot?.asOf,
      missing: !snapshot,
    },
    monteCarlo,
  });

  const debtStrategy = computeDebtStrategy({
    liabilities: toLiabilitiesFromProfile(normalizedProfile, DEMO_HORIZON_MONTHS),
    monthlyIncomeKrw: Math.max(
      0,
      normalizedProfile.cashflow?.monthlyIncomeKrw ?? normalizedProfile.monthlyIncomeNet,
    ),
    offers: [],
    options: {
      extraPaymentKrw: 100_000,
      compareTermsMonths: [12, 24, 36, 60, 120],
    },
    horizonMonths: DEMO_HORIZON_MONTHS,
    nowMonthIndex: 0,
  });

  const createdRun = await createRun({
    profileId: profileRecord.id,
    title: DEMO_RUN_TITLE,
    input: {
      horizonMonths: DEMO_HORIZON_MONTHS,
      ...(snapshotId ? { snapshotId } : {}),
      runScenarios: true,
      getActions: true,
      analyzeDebt: true,
      includeProducts: false,
      monteCarlo: {
        paths: DEMO_MC_PATHS,
        seed: DEMO_MC_SEED,
      },
    },
    meta: {
      snapshot: snapshotMeta,
      health: {
        warningsCodes: health.summary.warningCodes,
        criticalCount: health.summary.criticalCount,
        ...(typeof health.summary.snapshotStaleDays === "number"
          ? { snapshotStaleDays: health.summary.snapshotStaleDays }
          : {}),
      },
    },
    outputs: {
      simulate: {
        summary: summarizePlan(plan),
        warnings: (plan.warnings ?? []).map((warning) => warning.reasonCode),
        goalsStatus: plan.goalStatus,
        keyTimelinePoints: pickKeyTimelinePoints(plan.timeline),
      },
      scenarios: {
        table: [
          { id: "base", title: "Base", ...summarizeScenarioResult(scenarios.base) },
          ...scenarios.scenarios.map((entry) => ({
            id: entry.spec.id,
            title: entry.spec.title,
            ...summarizeScenarioResult(entry.result),
            diffVsBase: entry.diffVsBase.keyMetrics,
          })),
        ],
        shortWhyByScenario: Object.fromEntries(
          scenarios.scenarios.map((entry) => [entry.spec.id, entry.diffVsBase.shortWhy]),
        ),
      },
      monteCarlo: {
        probabilities: monteCarlo.probabilities,
        percentiles: monteCarlo.percentiles,
        notes: monteCarlo.notes,
      },
      actions: {
        actions,
      },
      debtStrategy: {
        summary: {
          debtServiceRatio: round2(debtStrategy.meta.debtServiceRatio),
          totalMonthlyPaymentKrw: debtStrategy.meta.totalMonthlyPaymentKrw,
          warningsCount: debtStrategy.warnings.length,
        },
        warnings: debtStrategy.warnings.map((warning) => ({
          code: warning.code,
          message: warning.message,
        })),
        summaries: debtStrategy.summaries,
        ...(debtStrategy.refinance ? { refinance: debtStrategy.refinance } : {}),
        whatIf: debtStrategy.whatIf,
      },
    },
  });

  console.log(`[planning:v2:seed] profile=${profileRecord.id} (${profileCreated ? "created" : "existing"})`);
  console.log(`[planning:v2:seed] run=${createdRun.id} (created)`);
}

run().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(`[planning:v2:seed] FAIL\n${message}`);
  process.exit(1);
});
