import { spawn } from "node:child_process";

let findRedactionIssues = () => [];
let diffRuns = null;

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeBaseUrl(raw) {
  const input = asString(raw);
  if (!input) return null;
  try {
    const parsed = new URL(input);
    return parsed.toString().replace(/\/+$/, "");
  } catch {
    return null;
  }
}

function sanitizeMessage(input) {
  const text = asString(input);
  if (!text) return "unknown";
  return text
    .replace(/(GITHUB_TOKEN(?:_DISPATCH)?|BOK_ECOS_API_KEY|ECOS_API_KEY|FINLIFE_[A-Z0-9_]*(?:KEY|TOKEN))/gi, "$1***")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer ***")
    .replace(/\.data\/[^\s\"'`)]*/g, ".data/***");
}

function parseArgs(argv) {
  const rawArgs = argv.slice(2);
  const args = new Set(rawArgs);
  const suiteArg = rawArgs.find((arg) => arg.startsWith("--suite="));
  const suiteRaw = suiteArg ? asString(suiteArg.split("=")[1]).toLowerCase() : "";
  const suite = suiteRaw === "fast" ? "fast" : "full";
  return {
    keep: args.has("--keep"),
    withProducts: args.has("--with-products"),
    suite,
  };
}

function runPnpmScript(script, env) {
  return new Promise((resolve, reject) => {
    const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
    const child = spawn(command, [script], {
      cwd: process.cwd(),
      env,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? 1));
  });
}

async function runPlaywrightAcceptance(baseUrl, suite) {
  const script = suite === "fast" ? "planning:v2:e2e:fast" : "planning:v2:e2e:full";
  const exitCode = await runPnpmScript(script, {
    ...process.env,
    E2E_BASE_URL: baseUrl,
  });
  if (exitCode !== 0) {
    throw new Error(`${script} failed with code ${exitCode}`);
  }
  return script;
}

function printStep(ok, label, detail = "") {
  const status = ok ? "PASS" : "FAIL";
  console.log(`[planning:v2:acceptance] ${status} ${label}${detail ? ` - ${detail}` : ""}`);
}

function assertNoLeak(label, payload) {
  const issues = findRedactionIssues(payload);
  if (issues.length > 0) {
    throw new Error(`${label} leak detected: ${issues.map((entry) => entry.code).join(",")}`);
  }
}

function hasSnapshotMeta(payload) {
  const snapshot = payload?.meta?.snapshot;
  if (!snapshot || typeof snapshot !== "object") return false;
  if ("missing" in snapshot) return true;
  return "asOf" in snapshot || "fetchedAt" in snapshot || "id" in snapshot;
}

function toApiErrorMessage(payload) {
  if (!payload || typeof payload !== "object") return "empty payload";
  const error = payload.error;
  if (error && typeof error === "object" && typeof error.message === "string") {
    return sanitizeMessage(error.message);
  }
  if (typeof payload.message === "string") {
    return sanitizeMessage(payload.message);
  }
  return "request failed";
}

async function requestJson(baseUrl, input) {
  const url = `${baseUrl}${input.path}`;
  const headers = {
    origin: baseUrl,
    referer: `${baseUrl}/planning`,
    ...(input.body !== undefined ? { "content-type": "application/json" } : {}),
    ...(input.headers ?? {}),
  };
  const response = await fetch(url, {
    method: input.method,
    headers,
    body: input.body !== undefined ? JSON.stringify(input.body) : undefined,
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null);
  return { response, payload, url };
}

async function requestText(baseUrl, input) {
  const url = `${baseUrl}${input.path}`;
  const headers = {
    origin: baseUrl,
    referer: `${baseUrl}/planning/runs`,
    ...(input.headers ?? {}),
  };
  const response = await fetch(url, {
    method: input.method,
    headers,
    cache: "no-store",
  });
  const text = await response.text();
  return { response, text, url };
}

async function requestLegacyRedirect(baseUrl, path) {
  const url = `${baseUrl}${path}`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      origin: baseUrl,
      referer: `${baseUrl}/planning`,
    },
    redirect: "manual",
    cache: "no-store",
  });
  return { response, url };
}

async function assertLegacyPlannerRedirect(baseUrl, legacyPath, label) {
  const legacyPlanner = await requestLegacyRedirect(baseUrl, legacyPath);
  if (legacyPlanner.response.status !== 307 && legacyPlanner.response.status !== 308) {
    throw new Error(`legacy route redirect failed: ${legacyPath} status=${legacyPlanner.response.status}`);
  }
  const legacyLocation = asString(legacyPlanner.response.headers.get("location"));
  if (!legacyLocation) {
    throw new Error(`legacy route redirect failed: ${legacyPath} missing Location header`);
  }
  const legacyRedirectPath = new URL(legacyLocation, baseUrl).pathname;
  const expectedPath = legacyPath.startsWith("/planner/")
    ? `/planning/${legacyPath.slice("/planner/".length)}`
    : "/planning";
  if (legacyRedirectPath !== expectedPath) {
    throw new Error(`legacy route redirect failed: ${legacyPath} location=${legacyLocation}`);
  }
  printStep(true, label, `${legacyPlanner.response.status} -> ${legacyRedirectPath}`);
}

function buildAcceptanceProfile() {
  return {
    monthlyIncomeNet: 4_800_000,
    monthlyEssentialExpenses: 1_750_000,
    monthlyDiscretionaryExpenses: 850_000,
    liquidAssets: 2_400_000,
    investmentAssets: 7_100_000,
    debts: [
      {
        id: "acceptance-loan-1",
        name: "Acceptance Loan",
        balance: 18_000_000,
        minimumPayment: 420_000,
        aprPct: 6.2,
        remainingMonths: 84,
        repaymentType: "amortizing",
      },
    ],
    goals: [
      { id: "goal-emergency", name: "Emergency", targetAmount: 12_000_000, targetMonth: 12, priority: 5 },
      { id: "goal-lump", name: "Lump Sum", targetAmount: 24_000_000, targetMonth: 60, priority: 4 },
      { id: "goal-ret", name: "Retirement", targetAmount: 280_000_000, targetMonth: 300, priority: 5 },
    ],
  };
}

function summarizeRunForLog(run) {
  const summary = run?.outputs?.simulate?.summary;
  if (!summary || typeof summary !== "object") return "summary-unavailable";
  const endNetWorth = Number(summary.endNetWorthKrw ?? 0);
  const worstCash = Number(summary.worstCashKrw ?? 0);
  return `endNetWorth=${Math.round(endNetWorth)}, worstCash=${Math.round(worstCash)}`;
}

async function cleanupCreated(baseUrl, runIds, profileId) {
  for (const runId of runIds) {
    await requestJson(baseUrl, {
      method: "DELETE",
      path: `/api/planning/v2/runs/${encodeURIComponent(runId)}`,
      body: {},
    }).catch(() => undefined);
  }
  if (profileId) {
    await requestJson(baseUrl, {
      method: "DELETE",
      path: `/api/planning/v2/profiles/${encodeURIComponent(profileId)}`,
      body: {},
    }).catch(() => undefined);
  }
}

async function run() {
  const redactionModule = await import("../src/lib/planning/smoke/redactionCheck.ts");
  findRedactionIssues = (
    redactionModule.findRedactionIssues
    ?? redactionModule.default?.findRedactionIssues
    ?? findRedactionIssues
  );

  const diffModule = await import("../src/lib/planning/v2/diffRuns.ts");
  diffRuns = diffModule.diffRuns ?? diffModule.default?.diffRuns ?? null;
  if (typeof diffRuns !== "function") {
    throw new Error("diffRuns import failed");
  }

  const options = parseArgs(process.argv);
  const baseUrl = normalizeBaseUrl(process.env.PLANNING_BASE_URL);
  if (!baseUrl) {
    console.error("[planning:v2:acceptance] FAIL PLANNING_BASE_URL is required (e.g. http://localhost:3100)");
    process.exit(1);
  }

  console.log(`[planning:v2:acceptance] BASE_URL=${baseUrl}`);

  let profileId = "";
  const runIds = [];
  const createdName = `Acceptance Profile ${Date.now()}`;

  try {
    await assertLegacyPlannerRedirect(baseUrl, "/planner", "legacy /planner redirect");
    await assertLegacyPlannerRedirect(baseUrl, "/planner/legacy", "legacy /planner/* redirect");

    const createProfile = await requestJson(baseUrl, {
      method: "POST",
      path: "/api/planning/v2/profiles",
      body: {
        name: createdName,
        profile: buildAcceptanceProfile(),
      },
    });
    if (!createProfile.response.ok || !createProfile.payload?.ok || !createProfile.payload?.data?.id) {
      throw new Error(`profiles create failed: ${createProfile.response.status} ${toApiErrorMessage(createProfile.payload)}`);
    }
    assertNoLeak("profiles:create", createProfile.payload);
    profileId = String(createProfile.payload.data.id);
    printStep(true, "profiles create", `profileId=${profileId}`);

    const profile = buildAcceptanceProfile();
    const basePayload = {
      profile,
      horizonMonths: 120,
      assumptions: {},
    };

    const simulate = await requestJson(baseUrl, {
      method: "POST",
      path: "/api/planning/v2/simulate",
      body: basePayload,
    });
    if (!simulate.response.ok || !simulate.payload?.ok || !hasSnapshotMeta(simulate.payload)) {
      throw new Error(`simulate failed: ${simulate.response.status} ${toApiErrorMessage(simulate.payload)}`);
    }
    assertNoLeak("simulate", simulate.payload);
    printStep(true, "simulate", "horizon=120");

    const scenarios = await requestJson(baseUrl, {
      method: "POST",
      path: "/api/planning/v2/scenarios",
      body: basePayload,
    });
    if (!scenarios.response.ok || !scenarios.payload?.ok || !hasSnapshotMeta(scenarios.payload)) {
      throw new Error(`scenarios failed: ${scenarios.response.status} ${toApiErrorMessage(scenarios.payload)}`);
    }
    assertNoLeak("scenarios", scenarios.payload);
    printStep(true, "scenarios", "base/conservative/aggressive");

    if (options.withProducts) {
      const actionsWithProducts = await requestJson(baseUrl, {
        method: "POST",
        path: "/api/planning/v2/actions",
        body: {
          ...basePayload,
          includeProducts: true,
          maxCandidatesPerAction: 3,
        },
      });
      if (!actionsWithProducts.response.ok || !actionsWithProducts.payload?.ok || !hasSnapshotMeta(actionsWithProducts.payload)) {
        throw new Error(`actions(with-products) failed: ${actionsWithProducts.response.status} ${toApiErrorMessage(actionsWithProducts.payload)}`);
      }
      assertNoLeak("actions:with-products", actionsWithProducts.payload);
      printStep(true, "actions with products", "includeProducts=true");
    }

    const runOne = await requestJson(baseUrl, {
      method: "POST",
      path: "/api/planning/v2/runs",
      body: {
        profileId,
        title: "Acceptance Run A",
        input: {
          horizonMonths: 120,
          assumptionsOverride: {},
          runScenarios: true,
          getActions: true,
          analyzeDebt: true,
          includeProducts: false,
        },
      },
    });
    if (!runOne.response.ok || !runOne.payload?.ok || !runOne.payload?.data?.id) {
      throw new Error(`runs create A failed: ${runOne.response.status} ${toApiErrorMessage(runOne.payload)}`);
    }
    assertNoLeak("runs:create:A", runOne.payload);
    const runOneId = String(runOne.payload.data.id);
    runIds.push(runOneId);
    printStep(true, "runs create A", `runId=${runOneId}`);

    const runTwo = await requestJson(baseUrl, {
      method: "POST",
      path: "/api/planning/v2/runs",
      body: {
        profileId,
        title: "Acceptance Run B",
        input: {
          horizonMonths: 120,
          assumptionsOverride: {
            inflation: 2.4,
          },
          runScenarios: true,
          getActions: true,
          analyzeDebt: true,
          includeProducts: false,
        },
      },
    });
    if (!runTwo.response.ok || !runTwo.payload?.ok || !runTwo.payload?.data?.id) {
      throw new Error(`runs create B failed: ${runTwo.response.status} ${toApiErrorMessage(runTwo.payload)}`);
    }
    assertNoLeak("runs:create:B", runTwo.payload);
    const runTwoId = String(runTwo.payload.data.id);
    runIds.push(runTwoId);
    printStep(true, "runs create B", `runId=${runTwoId}`);

    const listRuns = await requestJson(baseUrl, {
      method: "GET",
      path: `/api/planning/v2/runs?profileId=${encodeURIComponent(profileId)}&limit=50`,
    });
    const listRows = Array.isArray(listRuns.payload?.data) ? listRuns.payload.data : [];
    const listedIds = new Set(listRows.map((row) => String(row?.id ?? "")));
    if (!listRuns.response.ok || !listRuns.payload?.ok || !listedIds.has(runOneId) || !listedIds.has(runTwoId)) {
      throw new Error(`runs list failed: ${listRuns.response.status} ${toApiErrorMessage(listRuns.payload)}`);
    }
    assertNoLeak("runs:list", listRuns.payload);
    printStep(true, "runs list", `count=${listRows.length}`);

    const runAGet = await requestJson(baseUrl, {
      method: "GET",
      path: `/api/planning/v2/runs/${encodeURIComponent(runOneId)}`,
    });
    if (!runAGet.response.ok || !runAGet.payload?.ok || runAGet.payload?.data?.id !== runOneId) {
      throw new Error(`run A read failed: ${runAGet.response.status} ${toApiErrorMessage(runAGet.payload)}`);
    }
    assertNoLeak("runs:get:A", runAGet.payload);

    const runBGet = await requestJson(baseUrl, {
      method: "GET",
      path: `/api/planning/v2/runs/${encodeURIComponent(runTwoId)}`,
    });
    if (!runBGet.response.ok || !runBGet.payload?.ok || runBGet.payload?.data?.id !== runTwoId) {
      throw new Error(`run B read failed: ${runBGet.response.status} ${toApiErrorMessage(runBGet.payload)}`);
    }
    assertNoLeak("runs:get:B", runBGet.payload);

    const diff = diffRuns(runAGet.payload.data, runBGet.payload.data);
    if (!diff || typeof diff !== "object") {
      throw new Error("run diff unavailable");
    }
    printStep(true, "runs compare", `${summarizeRunForLog(runAGet.payload.data)} -> ${summarizeRunForLog(runBGet.payload.data)}`);

    const runExport = await requestText(baseUrl, {
      method: "GET",
      path: `/api/planning/v2/runs/${encodeURIComponent(runOneId)}/export`,
    });
    const contentType = (runExport.response.headers.get("content-type") || "").toLowerCase();
    if (!runExport.response.ok || !contentType.includes("application/json")) {
      throw new Error(`run export failed: ${runExport.response.status}`);
    }
    assertNoLeak("runs:export", runExport.text);
    const exported = JSON.parse(runExport.text);
    if (
      !exported
      || exported.version !== 1
      || !exported.summary
      || !exported.warnings
    ) {
      throw new Error("run export payload mismatch");
    }
    printStep(true, "run export", `content-type=${contentType.split(";")[0]}`);

    if (!options.keep) {
      await cleanupCreated(baseUrl, runIds, profileId);
      printStep(true, "cleanup", "runs/profile deleted");
      profileId = "";
      runIds.length = 0;
    } else {
      printStep(true, "cleanup", "skipped (--keep)");
    }

    const executedSuite = await runPlaywrightAcceptance(baseUrl, options.suite);
    printStep(true, "ui acceptance", executedSuite);

    printStep(true, "complete", "ACCEPTANCE PASS");
    console.log("ACCEPTANCE PASS");
  } catch (error) {
    printStep(false, "abort", sanitizeMessage(error instanceof Error ? error.message : String(error)));

    if (!options.keep) {
      await cleanupCreated(baseUrl, runIds, profileId);
    }
    process.exit(1);
  }
}

run().catch((error) => {
  console.error(`[planning:v2:acceptance] FAIL ${sanitizeMessage(error instanceof Error ? error.message : String(error))}`);
  process.exit(1);
});
