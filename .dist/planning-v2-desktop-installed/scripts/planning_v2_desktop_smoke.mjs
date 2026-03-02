import { spawn } from "node:child_process";
import path from "node:path";

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function parseArgs(argv) {
  const out = {
    appDir: process.cwd(),
    port: 3210,
    timeoutMs: 90_000,
  };
  for (const token of argv) {
    if (!token.startsWith("--")) continue;
    const [rawKey, ...rawRest] = token.slice(2).split("=");
    const key = asString(rawKey);
    const value = rawRest.join("=");
    if (key === "app-dir") out.appDir = asString(value) || out.appDir;
    if (key === "port") {
      const parsed = Math.trunc(Number(value));
      if (Number.isFinite(parsed) && parsed > 0 && parsed < 65536) out.port = parsed;
    }
    if (key === "timeout-ms") {
      const parsed = Math.trunc(Number(value));
      if (Number.isFinite(parsed) && parsed >= 5_000 && parsed <= 300_000) out.timeoutMs = parsed;
    }
  }
  return out;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseSetCookie(rawSetCookie) {
  const line = asString(rawSetCookie);
  if (!line) return null;
  const first = line.split(";", 1)[0] || "";
  const eqIndex = first.indexOf("=");
  if (eqIndex < 1) return null;
  const key = first.slice(0, eqIndex).trim();
  const value = first.slice(eqIndex + 1).trim();
  if (!key) return null;
  return { key, value };
}

function setCookieFromHeaders(headers, jar) {
  const values = [];
  if (typeof headers.getSetCookie === "function") {
    values.push(...headers.getSetCookie());
  } else {
    const single = headers.get("set-cookie");
    if (single) values.push(single);
  }
  for (const raw of values) {
    const parsed = parseSetCookie(raw);
    if (!parsed) continue;
    jar[parsed.key] = parsed.value;
  }
}

function toCookieHeader(jar) {
  return Object.entries(jar)
    .map(([key, value]) => `${key}=${value}`)
    .join("; ");
}

async function request(baseUrl, input, jar) {
  const url = `${baseUrl}${input.path}`;
  const headers = {
    origin: baseUrl,
    referer: `${baseUrl}/planning`,
    ...(input.body !== undefined ? { "content-type": "application/json" } : {}),
    ...input.headers,
  };
  const cookie = toCookieHeader(jar);
  if (cookie) headers.cookie = cookie;

  const response = await fetch(url, {
    method: input.method,
    headers,
    body: input.body !== undefined ? JSON.stringify(input.body) : undefined,
    redirect: "manual",
    cache: "no-store",
  });
  setCookieFromHeaders(response.headers, jar);
  const payload = await response.json().catch(() => null);
  return { response, payload };
}

function buildSmokeProfile() {
  return {
    monthlyIncomeNet: 4_600_000,
    monthlyEssentialExpenses: 1_700_000,
    monthlyDiscretionaryExpenses: 800_000,
    liquidAssets: 2_000_000,
    investmentAssets: 6_000_000,
    debts: [
      {
        id: "desktop-smoke-loan-1",
        name: "Desktop Smoke Loan",
        balance: 8_000_000,
        minimumPayment: 250_000,
        aprPct: 5.1,
        remainingMonths: 48,
      },
    ],
    goals: [
      {
        id: "desktop-smoke-goal-1",
        name: "Emergency",
        targetAmount: 12_000_000,
        targetMonth: 12,
        priority: 5,
      },
    ],
  };
}

async function waitForPlanning(baseUrl, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(`${baseUrl}/planning`, { cache: "no-store" });
      if (res.ok) {
        const html = await res.text();
        if (html.includes("planning-profile-form") || html.includes("/planning")) {
          return;
        }
      }
    } catch {
      // wait for server
    }
    await sleep(500);
  }
  throw new Error(`planning page did not respond within ${timeoutMs}ms`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const appDir = path.resolve(args.appDir);
  const baseUrl = `http://127.0.0.1:${args.port}`;
  const jar = {};

  const pnpmCmd = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const server = spawn(pnpmCmd, ["dev", "--", "--host", "127.0.0.1", "--port", String(args.port)], {
    cwd: appDir,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  server.stdout.on("data", (chunk) => {
    process.stdout.write(`[desktop-smoke][dev] ${String(chunk)}`);
  });
  server.stderr.on("data", (chunk) => {
    process.stderr.write(`[desktop-smoke][dev] ${String(chunk)}`);
  });

  try {
    await waitForPlanning(baseUrl, args.timeoutMs);

    const status = await request(baseUrl, { method: "GET", path: "/api/ops/security/status" }, jar);
    if (!status.response.ok || !status.payload?.ok) {
      throw new Error(`vault status failed: ${status.response.status}`);
    }

    const csrf = asString(status.payload.csrfToken);
    const vault = status.payload?.data ?? {};
    if (vault.configured && vault.unlocked !== true) {
      const passphrase = asString(process.env.PLANNING_VAULT_PASSPHRASE);
      if (!passphrase) {
        throw new Error("vault is locked; set PLANNING_VAULT_PASSPHRASE for smoke unlock");
      }
      const unlock = await request(
        baseUrl,
        {
          method: "POST",
          path: "/api/ops/security/unlock",
          body: {
            csrf,
            passphrase,
          },
        },
        jar,
      );
      if (!unlock.response.ok || !unlock.payload?.ok) {
        throw new Error(`vault unlock failed: ${unlock.response.status}`);
      }
    }

    const profiles = await request(baseUrl, { method: "GET", path: "/api/planning/v2/profiles" }, jar);
    if (!profiles.response.ok || !profiles.payload?.ok || !Array.isArray(profiles.payload.data)) {
      throw new Error(`profiles list failed: ${profiles.response.status}`);
    }

    let profileId = asString(profiles.payload.data[0]?.id);
    if (!profileId) {
      const created = await request(
        baseUrl,
        {
          method: "POST",
          path: "/api/planning/v2/profiles",
          body: {
            name: `Desktop Smoke ${Date.now()}`,
            profile: buildSmokeProfile(),
          },
        },
        jar,
      );
      if (!created.response.ok || !created.payload?.ok) {
        throw new Error(`profile create failed: ${created.response.status}`);
      }
      profileId = asString(created.payload.data?.id);
    }

    if (!profileId) {
      throw new Error("profile id is empty");
    }

    const run = await request(
      baseUrl,
      {
        method: "POST",
        path: "/api/planning/v2/runs",
        body: {
          profileId,
          input: {
            horizonMonths: 12,
          },
        },
      },
      jar,
    );
    if (!run.response.ok || !run.payload?.ok) {
      throw new Error(`run create failed: ${run.response.status}`);
    }
    const runId = asString(run.payload.data?.id);
    if (!runId) {
      throw new Error("run id missing");
    }

    const reportsPage = await fetch(`${baseUrl}/planning/reports?runId=${encodeURIComponent(runId)}`, {
      cache: "no-store",
    });
    if (!reportsPage.ok) {
      throw new Error(`reports page failed: ${reportsPage.status}`);
    }

    const reportHtml = await fetch(`${baseUrl}/api/planning/v2/runs/${encodeURIComponent(runId)}/report`, {
      cache: "no-store",
      headers: {
        origin: baseUrl,
        referer: `${baseUrl}/planning/reports?runId=${encodeURIComponent(runId)}`,
      },
    });
    if (!reportHtml.ok) {
      throw new Error(`run report endpoint failed: ${reportHtml.status}`);
    }

    process.stdout.write(`[planning:v2:desktop:smoke] PASS runId=${runId}\n`);
  } finally {
    server.kill("SIGTERM");
    await sleep(700);
    if (!server.killed) {
      server.kill("SIGKILL");
    }
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`[planning:v2:desktop:smoke] failed\n${message}\n`);
  process.exit(1);
});
