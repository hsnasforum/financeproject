let findRedactionIssues = () => [];

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
    .replace(/(GITHUB_TOKEN(?:_DISPATCH)?|ECOS_API_KEY|FINLIFE_[A-Z0-9_]*(?:KEY|TOKEN))/gi, "$1***")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer ***")
    .replace(/\.data\/[^\s"'`)]*/g, ".data/***");
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

function printStep(ok, label, detail = "") {
  const status = ok ? "PASS" : "FAIL";
  console.log(`[planning:v2:smoke:http] ${status} ${label}${detail ? ` - ${detail}` : ""}`);
}

function buildSmokeProfile() {
  return {
    monthlyIncomeNet: 4_600_000,
    monthlyEssentialExpenses: 1_700_000,
    monthlyDiscretionaryExpenses: 800_000,
    liquidAssets: 1_800_000,
    investmentAssets: 6_200_000,
    debts: [
      {
        id: "smoke-loan-1",
        name: "Smoke Loan",
        balance: 16_000_000,
        minimumPayment: 390_000,
        apr: 0.061,
        remainingMonths: 72,
        repaymentType: "amortizing",
      },
    ],
    goals: [
      { id: "goal-emergency", name: "Emergency", targetAmount: 10_000_000, targetMonth: 12, priority: 5 },
      { id: "goal-lump", name: "Lump Sum", targetAmount: 18_000_000, targetMonth: 48, priority: 4 },
      { id: "goal-ret", name: "Retirement", targetAmount: 220_000_000, targetMonth: 240, priority: 5 },
    ],
  };
}

async function run() {
  const redactionModule = await import("../src/lib/planning/smoke/redactionCheck.ts");
  findRedactionIssues = (
    redactionModule.findRedactionIssues
    ?? redactionModule.default?.findRedactionIssues
    ?? findRedactionIssues
  );

  const baseUrl = normalizeBaseUrl(process.env.PLANNING_BASE_URL);
  if (!baseUrl) {
    console.error("[planning:v2:smoke:http] FAIL PLANNING_BASE_URL is required (e.g. http://localhost:3100)");
    process.exit(1);
  }
  console.log(`[planning:v2:smoke:http] BASE_URL=${baseUrl}`);

  let profileId = "";
  let runId = "";
  const keepRecords = asString(process.env.PLANNING_SMOKE_KEEP) === "1";
  const createdName = `HTTP Smoke Profile ${Date.now()}`;

  try {
    const health = await requestJson(baseUrl, { method: "GET", path: "/api/health" });
    if (health.response.ok) {
      printStep(true, "health", `/api/health ${health.response.status}`);
      assertNoLeak("health", health.payload);
    } else {
      printStep(true, "health", "skipped (no /api/health endpoint)");
    }

    const listProfiles = await requestJson(baseUrl, {
      method: "GET",
      path: "/api/planning/v2/profiles",
    });
    if (!listProfiles.response.ok || !listProfiles.payload?.ok || !Array.isArray(listProfiles.payload?.data)) {
      throw new Error(`profiles list failed: ${listProfiles.response.status} ${toApiErrorMessage(listProfiles.payload)}`);
    }
    assertNoLeak("profiles:list", listProfiles.payload);
    printStep(true, "profiles GET", `count=${listProfiles.payload.data.length}`);

    const createProfile = await requestJson(baseUrl, {
      method: "POST",
      path: "/api/planning/v2/profiles",
      body: {
        name: createdName,
        profile: buildSmokeProfile(),
      },
    });
    if (!createProfile.response.ok || !createProfile.payload?.ok || !createProfile.payload?.data?.id) {
      throw new Error(`profiles create failed: ${createProfile.response.status} ${toApiErrorMessage(createProfile.payload)}`);
    }
    assertNoLeak("profiles:create", createProfile.payload);
    profileId = String(createProfile.payload.data.id);
    printStep(true, "profiles POST", `profileId=${profileId}`);

    const patchProfile = await requestJson(baseUrl, {
      method: "PATCH",
      path: `/api/planning/v2/profiles/${encodeURIComponent(profileId)}`,
      body: {
        name: `${createdName} (patched)`,
        profile: buildSmokeProfile(),
      },
    });
    if (!patchProfile.response.ok || !patchProfile.payload?.ok) {
      throw new Error(`profiles patch failed: ${patchProfile.response.status} ${toApiErrorMessage(patchProfile.payload)}`);
    }
    assertNoLeak("profiles:patch", patchProfile.payload);
    printStep(true, "profiles PATCH");

    const profile = buildSmokeProfile();
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
    printStep(true, "simulate POST");

    const scenarios = await requestJson(baseUrl, {
      method: "POST",
      path: "/api/planning/v2/scenarios",
      body: basePayload,
    });
    if (!scenarios.response.ok || !scenarios.payload?.ok || !hasSnapshotMeta(scenarios.payload)) {
      throw new Error(`scenarios failed: ${scenarios.response.status} ${toApiErrorMessage(scenarios.payload)}`);
    }
    assertNoLeak("scenarios", scenarios.payload);
    printStep(true, "scenarios POST");

    const monteCarlo = await requestJson(baseUrl, {
      method: "POST",
      path: "/api/planning/v2/monte-carlo",
      body: {
        ...basePayload,
        monteCarlo: {
          paths: 200,
          seed: 12345,
        },
      },
    });
    if (!monteCarlo.response.ok || !monteCarlo.payload?.ok || !hasSnapshotMeta(monteCarlo.payload)) {
      throw new Error(`monte-carlo failed: ${monteCarlo.response.status} ${toApiErrorMessage(monteCarlo.payload)}`);
    }
    assertNoLeak("monte-carlo", monteCarlo.payload);
    printStep(true, "monte-carlo POST");

    const actions = await requestJson(baseUrl, {
      method: "POST",
      path: "/api/planning/v2/actions",
      body: {
        ...basePayload,
        includeProducts: false,
      },
    });
    if (!actions.response.ok || !actions.payload?.ok || !hasSnapshotMeta(actions.payload)) {
      throw new Error(`actions failed: ${actions.response.status} ${toApiErrorMessage(actions.payload)}`);
    }
    assertNoLeak("actions", actions.payload);
    printStep(true, "actions POST");

    const debt = await requestJson(baseUrl, {
      method: "POST",
      path: "/api/planning/v2/debt-strategy",
      body: {
        profile,
        offers: [],
        options: {
          extraPaymentKrw: 50_000,
        },
      },
    });
    if (!debt.response.ok || !debt.payload?.ok || !hasSnapshotMeta(debt.payload)) {
      throw new Error(`debt-strategy failed: ${debt.response.status} ${toApiErrorMessage(debt.payload)}`);
    }
    assertNoLeak("debt-strategy", debt.payload);
    printStep(true, "debt-strategy POST");

    const runCreate = await requestJson(baseUrl, {
      method: "POST",
      path: "/api/planning/v2/runs",
      body: {
        profileId,
        title: "HTTP Smoke Run",
        input: {
          horizonMonths: 120,
          assumptionsOverride: {},
          runScenarios: true,
          getActions: true,
          analyzeDebt: true,
          includeProducts: false,
          monteCarlo: {
            paths: 100,
            seed: 12345,
          },
          debtStrategy: {
            offers: [],
            options: {
              extraPaymentKrw: 50_000,
            },
          },
        },
      },
    });
    if (!runCreate.response.ok || !runCreate.payload?.ok || !runCreate.payload?.data?.id) {
      throw new Error(`runs create failed: ${runCreate.response.status} ${toApiErrorMessage(runCreate.payload)}`);
    }
    assertNoLeak("runs:create", runCreate.payload);
    runId = String(runCreate.payload.data.id);
    printStep(true, "runs POST", `runId=${runId}`);

    const runList = await requestJson(baseUrl, {
      method: "GET",
      path: `/api/planning/v2/runs?profileId=${encodeURIComponent(profileId)}&limit=20`,
    });
    const listRows = Array.isArray(runList.payload?.data) ? runList.payload.data : [];
    if (!runList.response.ok || !runList.payload?.ok || !listRows.some((row) => row?.id === runId)) {
      throw new Error(`runs list failed: ${runList.response.status} ${toApiErrorMessage(runList.payload)}`);
    }
    assertNoLeak("runs:list", runList.payload);
    printStep(true, "runs GET(list)");

    const runGet = await requestJson(baseUrl, {
      method: "GET",
      path: `/api/planning/v2/runs/${encodeURIComponent(runId)}`,
    });
    if (!runGet.response.ok || !runGet.payload?.ok || runGet.payload?.data?.id !== runId) {
      throw new Error(`runs get failed: ${runGet.response.status} ${toApiErrorMessage(runGet.payload)}`);
    }
    assertNoLeak("runs:get", runGet.payload);
    printStep(true, "runs GET(one)");

    if (!keepRecords) {
      const runDelete = await requestJson(baseUrl, {
        method: "DELETE",
        path: `/api/planning/v2/runs/${encodeURIComponent(runId)}`,
        body: {},
      });
      if (!runDelete.response.ok || !runDelete.payload?.ok) {
        throw new Error(`runs delete failed: ${runDelete.response.status} ${toApiErrorMessage(runDelete.payload)}`);
      }
      assertNoLeak("runs:delete", runDelete.payload);
      printStep(true, "runs DELETE");
      runId = "";

      const profileDelete = await requestJson(baseUrl, {
        method: "DELETE",
        path: `/api/planning/v2/profiles/${encodeURIComponent(profileId)}`,
        body: {},
      });
      if (!profileDelete.response.ok || !profileDelete.payload?.ok) {
        throw new Error(`profiles delete failed: ${profileDelete.response.status} ${toApiErrorMessage(profileDelete.payload)}`);
      }
      assertNoLeak("profiles:delete", profileDelete.payload);
      printStep(true, "profiles DELETE");
      profileId = "";
    } else {
      printStep(true, "cleanup", "skipped (PLANNING_SMOKE_KEEP=1)");
    }

    printStep(true, "complete", "all checks passed");
  } catch (error) {
    printStep(false, "abort", sanitizeMessage(error instanceof Error ? error.message : String(error)));

    if (!keepRecords && runId) {
      await requestJson(baseUrl, {
        method: "DELETE",
        path: `/api/planning/v2/runs/${encodeURIComponent(runId)}`,
        body: {},
      }).catch(() => undefined);
    }
    if (!keepRecords && profileId) {
      await requestJson(baseUrl, {
        method: "DELETE",
        path: `/api/planning/v2/profiles/${encodeURIComponent(profileId)}`,
        body: {},
      }).catch(() => undefined);
    }

    process.exit(1);
  }
}

run().catch((error) => {
  console.error(`[planning:v2:smoke:http] FAIL ${sanitizeMessage(error instanceof Error ? error.message : String(error))}`);
  process.exit(1);
});
