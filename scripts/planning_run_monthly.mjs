import { tsImport } from "tsx/esm/api";

const DEFAULT_HORIZON_MONTHS = 120;
const DEFAULT_POLICY_ID = "balanced";
const DEFAULT_MONTE_CARLO_PATHS = 500;
const DEFAULT_MONTE_CARLO_SEED = 12345;
const DEFAULT_COMPARE_TERMS_MONTHS = [12, 24, 36, 60, 120];
const POLICY_IDS = new Set(["balanced", "safety", "growth"]);

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function asInt(value, fallback) {
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseRiskTolerance(rawProfile) {
  if (!rawProfile || typeof rawProfile !== "object" || Array.isArray(rawProfile)) return "mid";
  const direct = asString(rawProfile.riskTolerance).toLowerCase();
  if (direct === "low" || direct === "mid" || direct === "high") return direct;
  const nested = rawProfile.risk && typeof rawProfile.risk === "object" && !Array.isArray(rawProfile.risk)
    ? asString(rawProfile.risk.riskTolerance).toLowerCase()
    : "";
  if (nested === "low" || nested === "mid" || nested === "high") return nested;
  return "mid";
}

function toLiabilitiesFromProfile(profile, fallbackMonths, decimalToAprPct) {
  return (Array.isArray(profile.debts) ? profile.debts : []).map((debt) => ({
    id: debt.id,
    name: debt.name,
    type: debt.repaymentType === "interestOnly" ? "interestOnly" : "amortizing",
    principalKrw: Math.max(0, Number(debt.balance) || 0),
    aprPct: Number.isFinite(debt.aprPct) ? debt.aprPct : decimalToAprPct(Number(debt.apr) || 0),
    remainingMonths: Math.max(1, Math.trunc(Number(debt.remainingMonths) || fallbackMonths)),
    minimumPaymentKrw: Math.max(0, Number(debt.minimumPayment) || 0),
  }));
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

function pickKeyTimelinePoints(rows) {
  if (!Array.isArray(rows) || rows.length < 1) return [];
  const out = [];
  const candidates = [0, 12, 24, rows.length - 1];
  const seen = new Set();
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

function parseArgs(argv) {
  const out = {
    profileId: "",
    horizonMonths: DEFAULT_HORIZON_MONTHS,
    policyId: DEFAULT_POLICY_ID,
    title: "",
    withMonteCarlo: false,
    monteCarloPaths: DEFAULT_MONTE_CARLO_PATHS,
    monteCarloSeed: DEFAULT_MONTE_CARLO_SEED,
  };
  for (const token of argv) {
    if (!token.startsWith("--")) continue;
    if (token === "--with-monte-carlo") {
      out.withMonteCarlo = true;
      continue;
    }
    const [rawKey, ...rawValue] = token.slice(2).split("=");
    const key = asString(rawKey);
    const value = rawValue.join("=");
    if (key === "profile-id") out.profileId = asString(value);
    if (key === "title") out.title = asString(value);
    if (key === "policy-id") {
      const candidate = asString(value) || DEFAULT_POLICY_ID;
      out.policyId = POLICY_IDS.has(candidate) ? candidate : DEFAULT_POLICY_ID;
    }
    if (key === "horizon-months") out.horizonMonths = Math.max(1, Math.min(720, asInt(value, DEFAULT_HORIZON_MONTHS)));
    if (key === "mc-paths") out.monteCarloPaths = Math.max(1, Math.min(20_000, asInt(value, DEFAULT_MONTE_CARLO_PATHS)));
    if (key === "mc-seed") out.monteCarloSeed = asInt(value, DEFAULT_MONTE_CARLO_SEED) >>> 0;
  }
  return out;
}

async function loadTsModule(path) {
  const raw = await tsImport(path, { parentURL: import.meta.url });
  return raw?.default && typeof raw.default === "object" ? raw.default : raw;
}

async function resolveTargetProfileId(explicitProfileId, profileStore) {
  if (explicitProfileId) return explicitProfileId;
  const defaultId = await profileStore.getDefaultProfileId();
  if (defaultId) return defaultId;
  const profiles = await profileStore.listProfiles();
  return profiles[0]?.id ?? "";
}

async function main() {
  const startedAt = Date.now();
  const args = parseArgs(process.argv.slice(2));

  const [
    opsPolicy,
    assumptionsStorage,
    assumptionsMap,
    profileStore,
    runActionStore,
    runStore,
    assumptionsHealth,
    budget,
    defaults,
    debtStrategy,
    monteCarlo,
    runScenariosModule,
    scenarios,
    simulateMonthlyModule,
    stagePipeline,
    resultDto,
    preflight,
    aprBoundary,
    canonicalProfileModule,
    reproducibility,
    actionsBuilder,
    scheduledTasks,
  ] = await Promise.all([
    loadTsModule("../src/lib/ops/opsPolicy.ts"),
    loadTsModule("../src/lib/planning/server/assumptions/storage.ts"),
    loadTsModule("../src/lib/planning/server/assumptions/mapSnapshotToAssumptionsV2.ts"),
    loadTsModule("../src/lib/planning/server/store/profileStore.ts"),
    loadTsModule("../src/lib/planning/server/store/runActionStore.ts"),
    loadTsModule("../src/lib/planning/server/store/runStore.ts"),
    loadTsModule("../src/lib/planning/server/v2/assumptionsHealth.ts"),
    loadTsModule("../src/lib/planning/server/v2/budget.ts"),
    loadTsModule("../src/lib/planning/server/v2/defaults.ts"),
    loadTsModule("../src/lib/planning/server/v2/debt/strategy.ts"),
    loadTsModule("../src/lib/planning/server/v2/monteCarlo.ts"),
    loadTsModule("../src/lib/planning/server/v2/runScenarios.ts"),
    loadTsModule("../src/lib/planning/server/v2/scenarios.ts"),
    loadTsModule("../src/lib/planning/server/v2/simulateMonthly.ts"),
    loadTsModule("../src/lib/planning/v2/stagePipeline.ts"),
    loadTsModule("../src/lib/planning/v2/resultDto.ts"),
    loadTsModule("../src/lib/planning/v2/preflight.ts"),
    loadTsModule("../src/lib/planning/v2/aprBoundary.ts"),
    loadTsModule("../src/lib/planning/v2/loadCanonicalProfile.ts"),
    loadTsModule("../src/lib/planning/v2/reproducibility.ts"),
    loadTsModule("../src/lib/planning/server/v2/actions/buildActions.ts"),
    loadTsModule("../src/lib/ops/scheduledTasks.ts"),
  ]);

  const guard = await scheduledTasks.ensureScheduledTaskVaultUnlocked();
  if (!guard?.ok) {
    await scheduledTasks.appendScheduledTaskEvent({
      taskName: "PLANNING_RUN_MONTHLY",
      status: "FAILED",
      code: "LOCKED",
      durationMs: Math.max(0, Date.now() - startedAt),
      message: guard.message ?? "Vault is locked",
    });
    process.stderr.write("[planning:run:monthly] failed code=LOCKED\nVault is locked. Unlock via /ops/security\n");
    process.exit(2);
    return;
  }

  const profileId = await resolveTargetProfileId(args.profileId, profileStore);
  if (!profileId) {
    throw new Error("기본 profile을 찾을 수 없습니다. /planning에서 프로필을 먼저 저장하세요.");
  }

  const profileRecord = await profileStore.getProfile(profileId);
  if (!profileRecord) {
    throw new Error(`profile not found: ${profileId}`);
  }

  const canonicalProfile = canonicalProfileModule.loadCanonicalProfile(profileRecord.profile).profile;
  const monteCarloConfig = args.withMonteCarlo
    ? {
      paths: args.monteCarloPaths,
      seed: args.monteCarloSeed,
    }
    : undefined;

  const preflightIssues = preflight.preflightRun({
    profile: canonicalProfile,
    selectedSnapshot: { mode: "latest" },
    debtOffers: [],
    ...(monteCarloConfig
      ? {
        monteCarlo: {
          enabled: true,
          paths: monteCarloConfig.paths,
          horizonMonths: args.horizonMonths,
        },
      }
      : {}),
  });
  const preflightBlocks = preflightIssues.filter((issue) => issue.severity === "block");
  if (preflightBlocks.length > 0) {
    const joined = preflightBlocks.map((issue) => `${issue.code}: ${issue.message}`).join("\n");
    throw new Error(`preflight blocked\n${joined}`);
  }
  const preflightWarns = preflightIssues.filter((issue) => issue.severity === "warn");

  const snapshot = await assumptionsStorage.loadLatestAssumptionsSnapshot();
  const snapshotId = snapshot ? await assumptionsStorage.findAssumptionsSnapshotId(snapshot) : undefined;
  const snapshotMeta = buildSnapshotMeta(snapshot, snapshotId);

  const mappedFromSnapshot = assumptionsMap.mapSnapshotToAssumptionsV2(snapshot);
  const mappedScenarioExtras = assumptionsMap.mapSnapshotToScenarioExtrasV2(snapshot);
  const finalSimulationAssumptions = {
    ...defaults.DEFAULT_ASSUMPTIONS_V2,
    ...mappedFromSnapshot,
  };
  const baseAssumptions = scenarios.toScenarioAssumptionsV2(
    finalSimulationAssumptions,
    {
      ...mappedScenarioExtras.extra,
    },
  );

  const riskTolerance = parseRiskTolerance(canonicalProfile);
  const baseHealth = assumptionsHealth.assessAssumptionsHealth({
    assumptions: baseAssumptions,
    snapshotMeta,
  });
  const riskWarnings = assumptionsHealth.assessRiskAssumptionConsistency(riskTolerance, baseAssumptions);
  const health = assumptionsHealth.combineAssumptionsHealth(baseHealth, [...riskWarnings, ...mappedScenarioExtras.warnings]);
  const debtLiabilities = toLiabilitiesFromProfile(canonicalProfile, args.horizonMonths, aprBoundary.decimalToAprPct);

  const monteCarloBudget = monteCarloConfig
    ? budget.checkMonteCarloBudget({ paths: monteCarloConfig.paths, horizonMonths: args.horizonMonths })
    : null;

  let plan = null;
  let scenariosResult = null;
  let monteCarloResult = null;
  let actionsResult = null;
  let debtStrategyResult = null;

  const pipeline = await stagePipeline.runStagePipeline({
    simulate: {
      outputRefKey: "outputs.simulate",
      run: () => {
        plan = simulateMonthlyModule.simulateMonthly(canonicalProfile, finalSimulationAssumptions, args.horizonMonths, {
          policyId: args.policyId,
        });
        return plan;
      },
    },
    scenarios: {
      enabled: true,
      outputRefKey: "outputs.scenarios",
      run: () => {
        scenariosResult = runScenariosModule.runScenarios({
          profile: canonicalProfile,
          horizonMonths: args.horizonMonths,
          baseAssumptions,
          riskTolerance,
          policyId: args.policyId,
        });
        return scenariosResult;
      },
    },
    monteCarlo: {
      enabled: Boolean(monteCarloConfig),
      ...(monteCarloConfig && monteCarloBudget && !monteCarloBudget.ok
        ? {
          preSkipped: {
            reason: "BUDGET_EXCEEDED",
            message: monteCarloBudget.message,
          },
        }
        : {}),
      outputRefKey: "outputs.monteCarlo",
      run: () => {
        if (!monteCarloConfig) return null;
        monteCarloResult = monteCarlo.runMonteCarlo({
          profile: canonicalProfile,
          horizonMonths: args.horizonMonths,
          baseAssumptions,
          policyId: args.policyId,
          paths: monteCarloConfig.paths,
          seed: monteCarloConfig.seed,
          riskTolerance,
        });
        return monteCarloResult;
      },
    },
    actions: {
      enabled: true,
      outputRefKey: "outputs.actions",
      run: () => {
        if (!plan) throw new Error("simulate result is not available");
        actionsResult = actionsBuilder.buildActionsFromPlan({
          plan,
          profile: canonicalProfile,
          baseAssumptions,
          snapshotMeta: {
            asOf: snapshot?.asOf,
            missing: !snapshot,
          },
          ...(monteCarloResult ? { monteCarlo: monteCarloResult } : {}),
        });
        return actionsResult;
      },
    },
    debt: {
      enabled: true,
      outputRefKey: "outputs.debtStrategy",
      run: () => {
        debtStrategyResult = debtStrategy.computeDebtStrategy({
          liabilities: debtLiabilities,
          monthlyIncomeKrw: Math.max(
            0,
            canonicalProfile.cashflow?.monthlyIncomeKrw ?? canonicalProfile.monthlyIncomeNet,
          ),
          offers: [],
          options: {
            extraPaymentKrw: 0,
            compareTermsMonths: DEFAULT_COMPARE_TERMS_MONTHS,
          },
          horizonMonths: args.horizonMonths,
          nowMonthIndex: 0,
        });
        return debtStrategyResult;
      },
    },
  });

  if (!plan || pipeline.overallStatus === "FAILED") {
    throw new Error("simulate stage failed");
  }

  const outputs = {
    simulate: {
      summary: summarizePlan(plan),
      warnings: plan.warnings.map((warning) => warning.reasonCode),
      goalsStatus: plan.goalStatus,
      keyTimelinePoints: pickKeyTimelinePoints(plan.timeline),
    },
    ...(scenariosResult
      ? {
        scenarios: {
          table: [
            {
              id: "base",
              title: "Base",
              ...summarizeScenarioResult(scenariosResult.base),
            },
            ...scenariosResult.scenarios.map((entry) => ({
              id: entry.spec.id,
              title: entry.spec.title,
              ...summarizeScenarioResult(entry.result),
              diffVsBase: entry.diffVsBase.keyMetrics,
            })),
          ],
          shortWhyByScenario: Object.fromEntries(
            scenariosResult.scenarios.map((entry) => [entry.spec.id, entry.diffVsBase.shortWhy]),
          ),
        },
      }
      : {}),
    ...(monteCarloResult
      ? {
        monteCarlo: {
          probabilities: monteCarloResult.probabilities,
          percentiles: monteCarloResult.percentiles,
          notes: monteCarloResult.notes,
        },
      }
      : {}),
    ...(Array.isArray(actionsResult)
      ? {
        actions: {
          actions: actionsResult,
        },
      }
      : {}),
    ...(debtStrategyResult
      ? {
        debtStrategy: {
          summary: {
            debtServiceRatio: debtStrategyResult.meta.debtServiceRatio,
            totalMonthlyPaymentKrw: debtStrategyResult.meta.totalMonthlyPaymentKrw,
            warningsCount: debtStrategyResult.warnings.length,
          },
          warnings: debtStrategyResult.warnings.map((warning) => ({
            code: warning.code,
            message: warning.message,
          })),
          summaries: debtStrategyResult.summaries,
          ...(debtStrategyResult.refinance ? { refinance: debtStrategyResult.refinance } : {}),
          whatIf: debtStrategyResult.whatIf,
        },
      }
      : {}),
  };

  const resultDtoBuilt = resultDto.buildResultDtoV1({
    generatedAt: new Date().toISOString(),
    policyId: args.policyId,
    meta: {
      snapshot: snapshotMeta,
      health: health.summary,
    },
    simulate: outputs.simulate,
    scenarios: outputs.scenarios,
    monteCarlo: outputs.monteCarlo,
    actions: outputs.actions,
    debt: outputs.debtStrategy,
  });
  const reproducibilityMeta = reproducibility.buildRunReproducibilityMeta({
    profile: canonicalProfile,
    assumptionsSnapshotId: snapshotId,
    assumptionsSnapshot: snapshot,
  });

  const runTitle = args.title || `Monthly Run ${new Date().toISOString().slice(0, 10)}`;
  const policy = opsPolicy.loadOpsPolicy();
  const created = await runStore.createRun({
    profileId: profileRecord.id,
    title: runTitle,
    overallStatus: pipeline.overallStatus,
    stages: pipeline.stages,
    input: {
      horizonMonths: args.horizonMonths,
      policyId: args.policyId,
      ...(snapshotId ? { snapshotId } : {}),
      runScenarios: true,
      getActions: true,
      analyzeDebt: true,
      includeProducts: false,
      ...(monteCarloConfig ? { monteCarlo: monteCarloConfig } : {}),
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
    reproducibility: reproducibilityMeta,
    outputs: {
      resultDto: resultDtoBuilt,
      ...outputs,
    },
  }, {
    maxPerProfile: policy.runs.defaultKeepCount,
  });
  await runActionStore.ensureRunActionPlan(created).catch(() => undefined);

  const stageSummary = (pipeline.stages ?? [])
    .map((stage) => `${stage.id}:${stage.status}`)
    .join(", ");
  process.stdout.write(`[planning:run:monthly] ok\n`);
  process.stdout.write(`runId=${created.id}\n`);
  process.stdout.write(`profileId=${created.profileId}\n`);
  process.stdout.write(`snapshotId=${snapshotId ?? "latest:none"}\n`);
  process.stdout.write(`overallStatus=${pipeline.overallStatus}\n`);
  process.stdout.write(`stages=${stageSummary}\n`);
  process.stdout.write(`retention.maxPerProfile=${policy.runs.defaultKeepCount}\n`);
  process.stdout.write(`policyId=${asString(args.policyId) || DEFAULT_POLICY_ID}\n`);
  process.stdout.write(`horizonMonths=${args.horizonMonths}\n`);
  process.stdout.write(`monteCarlo=${monteCarloConfig ? `on(paths=${monteCarloConfig.paths},seed=${monteCarloConfig.seed})` : "off"}\n`);
  process.stdout.write(`preflightWarns=${preflightWarns.length}\n`);
  for (const issue of preflightWarns) {
    process.stdout.write(`warn=${issue.code}:${issue.message}\n`);
  }

  await scheduledTasks.appendScheduledTaskEvent({
    taskName: "PLANNING_RUN_MONTHLY",
    status: "SUCCESS",
    code: "OK",
    durationMs: Math.max(0, Date.now() - startedAt),
    meta: {
      runId: created.id,
      profileId: created.profileId,
      ...(snapshotId ? { snapshotId } : {}),
      overallStatus: pipeline.overallStatus,
    },
  });
}

main().catch(async (error) => {
  const scheduledTasks = await loadTsModule("../src/lib/ops/scheduledTasks.ts");
  const code = scheduledTasks.toScheduledTaskErrorCode(error);
  const message = scheduledTasks.toScheduledTaskErrorMessage(error);
  await scheduledTasks.appendScheduledTaskEvent({
    taskName: "PLANNING_RUN_MONTHLY",
    status: "FAILED",
    code,
    message,
  });
  process.stderr.write(`[planning:run:monthly] failed code=${code}\n${message}\n`);
  process.exit(code === "LOCKED" ? 2 : 1);
});
