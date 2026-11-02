import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const repository = process.cwd();
const profile = {
  monthlyIncomeNet: 4_200_000, monthlyEssentialExpenses: 1_800_000,
  monthlyDiscretionaryExpenses: 600_000, liquidAssets: 2_000_000,
  investmentAssets: 1_000_000, debts: [], goals: [],
};
function record(id: string) {
  return { version: 1, schemaVersion: 2, id, name: "private-synthetic-profile", profile,
    createdAt: "2026-03-01T00:00:00.000Z", updatedAt: "2026-03-01T00:00:00.000Z" };
}
function write(file: string, raw: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof raw === "string" ? raw : JSON.stringify(raw));
}
function fileFingerprint(file: string) {
  const bytes = fs.readFileSync(file);
  const stat = fs.statSync(file);
  return { bytes, hash: crypto.createHash("sha256").update(bytes).digest("hex"),
    size: stat.size, mtimeMs: stat.mtimeMs };
}
type Reply = { status: number; body: { ok: boolean; error?: { code: string; message: string; fixHref?: string }; data?: unknown } };
type ProcessResult = { pid: number; list: Reply; detail: Reply; good: Reply; other: Reply;
  missing: Reply; invalid: Reply; unauthenticated: Reply; crossOrigin: Reply; invalidInput: Reply;
  startup: { status: string; result: string } };

async function readThroughFreshProcess(root: string, namespace = true): Promise<ProcessResult> {
  const url = (relative: string) => JSON.stringify(pathToFileURL(path.join(repository, relative)).href);
  // Load modules with the repository tsconfig, then move startup's fixed cwd scan into the sandbox.
  const program = `
    const unwrap = mod => mod.default ?? mod;
    const listRoute = unwrap(await import(${url("src/app/api/planning/v2/profiles/route.ts")}));
    const detailRoute = unwrap(await import(${url("src/app/api/planning/v2/profiles/[id]/route.ts")}));
    const gate = unwrap(await import(${url("src/lib/planning/store/startupMigrationGate.ts")}));
    process.chdir(${JSON.stringify(root)});
    const request = (id, user = "owner-a", extra = {}) => new Request("http://localhost:3000/api/planning/v2/profiles" + (id ? "/" + id : ""), {
      headers: { host: "localhost:3000", origin: "http://localhost:3000", referer: "http://localhost:3000/planning",
        ...(user ? { "x-planning-user-id": user } : {}), ...extra },
    });
    const reply = async response => ({ status: response.status, body: await response.json() });
    const detail = (id, user) => detailRoute.GET(request(id, user), { params: Promise.resolve({ id }) });
    const result = {
      pid: process.pid,
      list: await reply(await listRoute.GET(request(""))),
      detail: await reply(await detail("default-profile", "owner-a")),
      good: await reply(await detail("good", "owner-a")),
      other: await reply(await detail("default-profile", "owner-b")),
      missing: await reply(await detail("missing", "owner-a")),
      invalid: await reply(await detail("../invalid", "owner-a")),
      unauthenticated: await reply(await listRoute.GET(request("", ""))),
      crossOrigin: await reply(await listRoute.GET(request("", "owner-a", { origin: "https://example.invalid", referer: "https://example.invalid/planning" }))),
      invalidInput: await reply(await listRoute.POST(new Request("http://localhost:3000/api/planning/v2/profiles", {
        method: "POST", headers: { host: "localhost:3000", origin: "http://localhost:3000", "x-planning-user-id": "owner-a", "content-type": "application/json" },
        body: JSON.stringify({ profile: null }),
      }))),
      startup: gate.getPlanningStartupMigrationGateSnapshot(),
    };
    process.stdout.write(JSON.stringify(result));
  `;
  return await runInFreshProcess(root, program, namespace) as ProcessResult;
}

async function runInFreshProcess(root: string, program: string, namespace: boolean): Promise<unknown> {
  const childEnv = { ...process.env };
  for (const key of Object.keys(childEnv)) {
    if (key.startsWith("PLANNING_") || ["AUTH_SECRET", "NEXTAUTH_SECRET"].includes(key)) delete childEnv[key];
  }
  Object.assign(childEnv, {
    NODE_ENV: "test",
    DATABASE_URL: `file:${path.join(root, "test.db")}`,
    XDG_DATA_HOME: path.join(root, "xdg-data"),
    XDG_CONFIG_HOME: path.join(root, "xdg-config"),
    XDG_CACHE_HOME: path.join(root, "xdg-cache"),
    PLANNING_DATA_DIR: path.join(root, ".data", "planning"),
    PLANNING_NAMESPACE_ENABLED: namespace ? "1" : "0", PLANNING_SINGLE_USER_MODE: "0",
    PLANNING_AUTH_REQUIRED: "1", PLANNING_TRUST_AUTH_HEADERS: "1",
  });
  const child = await execFileAsync(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", program], {
    cwd: repository, env: childEnv, timeout: 30_000, maxBuffer: 1024 * 1024,
  });
  return JSON.parse(child.stdout) as unknown;
}

type SingleOperation = "list" | "create" | "upsert" | "update" | "detail";
async function requestInFreshProcess(root: string, operation: SingleOperation) {
  const url = (relative: string) => JSON.stringify(pathToFileURL(path.join(repository, relative)).href);
  const program = `
    const unwrap = mod => mod.default ?? mod;
    const route = unwrap(await import(${url("src/app/api/planning/v2/profiles/route.ts")}));
    const store = unwrap(await import(${url("src/lib/planning/store/profileStore.ts")}));
    const gate = unwrap(await import(${url("src/lib/planning/store/startupMigrationGate.ts")}));
    process.chdir(${JSON.stringify(root)});
    const operation = ${JSON.stringify(operation)};
    const result = { pid: process.pid };
    try {
      if (operation === "list" || operation === "create") {
        const request = new Request("http://localhost:3000/api/planning/v2/profiles", {
          method: operation === "list" ? "GET" : "POST",
          headers: { host: "localhost:3000", origin: "http://localhost:3000",
            "x-planning-user-id": "owner-a", "content-type": "application/json" },
          ...(operation === "create" ? { body: JSON.stringify({ name: "new", profile: ${JSON.stringify(profile)} }) } : {}),
        });
        const response = await route[operation === "list" ? "GET" : "POST"](request);
        result.reply = { status: response.status, body: await response.json() };
      } else if (operation === "upsert") {
        result.value = await store.upsertProfileRecord({ id: "legacy-a", name: "changed", profile: ${JSON.stringify(profile)} });
      } else if (operation === "update") {
        result.value = await store.updateProfile("legacy-a", { name: "changed" });
      } else {
        result.value = await store.getProfile("legacy-a");
      }
    } catch (error) { result.error = error.name; }
    result.startup = gate.getPlanningStartupMigrationGateSnapshot();
    process.stdout.write(JSON.stringify(result));
  `;
  return await runInFreshProcess(root, program, false) as {
    pid: number; reply?: Reply; error?: string;
    value?: { id: string; profile: { debts: unknown[]; goals: unknown[] } };
    startup: { result: string } | null;
  };
}

describe("profile routes with real startup and separate process restarts", () => {
  let root: string;
  const ownerPath = (user: string, id: string) => path.join(root, ".data", "planning", "users", user, "vault", "profiles", id, "profile.json");
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-profile-route-restart-"));
    write(ownerPath("owner-b", "default-profile"), record("default-profile"));
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it.each(["malformed JSON", "record schema", "payload schema", "same-ID legacy", "mixed profiles", "failed startup"])(
    "preserves %s through list/detail routes across two processes", async scenario => {
      const file = ownerPath("owner-a", "default-profile");
      const other = ownerPath("owner-b", "default-profile");
      const raw = scenario === "record schema" ? { version: 1, profile }
        : scenario === "payload schema" ? { ...record("default-profile"), profile: {} } : "{";
      write(file, raw);
      const files = [file, other];
      if (scenario === "same-ID legacy") {
        const legacy = path.join(root, ".data", "planning", "users", "owner-a", "profiles", "default-profile.json");
        write(legacy, record("default-profile"));
        files.push(legacy);
      }
      if (scenario === "mixed profiles") {
        const good = ownerPath("owner-a", "good");
        write(good, record("good"));
        files.push(good);
      }
      if (scenario === "failed startup") {
        const startupLegacy = path.join(root, ".data", "planning", "profiles", "broken.json");
        write(startupLegacy, "{");
        files.push(startupLegacy);
      }
      const before = files.map(fileFingerprint);
      const pids = [];
      for (let run = 0; run < 2; run += 1) {
        const result = await readThroughFreshProcess(root);
        pids.push(result.pid);
        for (const reply of [result.list, result.detail]) {
          expect(reply.status).toBe(500);
          expect(reply.body.ok).toBe(false);
          expect(reply.body.error?.code).toBe("STORAGE_CORRUPT");
          expect(reply.body.error?.fixHref).toBeUndefined();
          const body = JSON.stringify(reply.body);
          for (const secret of [root, "profile.json", "private-synthetic-profile", "4200000", "ciphertext", "/ops/doctor", "stack"]) {
            expect(body).not.toContain(secret);
          }
        }
        expect(result.other.status).toBe(200);
        if (scenario === "mixed profiles") expect(result.good.status).toBe(200);
        expect(result.missing.body.error?.code).toBe("NO_DATA");
        expect(result.invalid.body.error?.message).toBe("Invalid record id");
        expect(result.unauthenticated.status).toBe(401);
        expect(result.crossOrigin.status).toBe(403);
        expect(result.invalidInput.body.error?.code).toBe("INPUT");
        if (scenario === "failed startup") expect(result.startup.result).toBe("failed");
        expect(files.map(fileFingerprint)).toEqual(before);
      }
      expect(new Set(pids).size).toBe(2);
    }, 60_000,
  );

  it("maps a real filesystem read failure to STORAGE_UNAVAILABLE", async () => {
    const file = ownerPath("owner-a", "default-profile");
    fs.mkdirSync(file, { recursive: true });
    const result = await readThroughFreshProcess(root);
    for (const reply of [result.list, result.detail]) {
      expect(reply.status).toBe(503);
      expect(reply.body.error?.code).toBe("STORAGE_UNAVAILABLE");
      expect(JSON.stringify(reply.body)).not.toContain(root);
    }
    expect(fs.statSync(file).isDirectory()).toBe(true);
  }, 30_000);

  it.each(["legacy collision", "legacy payload corruption"])(
    "checks the actual startup legacy directory before rewriting %s", async scenario => {
      const legacy = path.join(root, ".data", "planning", "profiles", "default-profile.json");
      const partition = path.join(root, ".data", "planning", "vault", "profiles", "default-profile", "profile.json");
      const validLegacy = JSON.parse(fs.readFileSync(path.join(repository, "tests/fixtures/compat/profile-record-v1.json"), "utf8"));
      validLegacy.id = "default-profile";
      write(legacy, scenario === "legacy collision" ? validLegacy : { ...record("default-profile"), profile: {} });
      const files = [legacy];
      if (scenario === "legacy collision") {
        write(partition, "{");
        files.push(partition);
      }
      const before = files.map(fileFingerprint);
      const pids = [];
      for (let run = 0; run < 2; run += 1) {
        const result = await readThroughFreshProcess(root, false);
        pids.push(result.pid);
        expect(result.list.body.error?.code).toBe("STORAGE_CORRUPT");
        expect(result.detail.body.error?.code).toBe("STORAGE_CORRUPT");
        expect(files.map(fileFingerprint)).toEqual(before);
        expect(fs.existsSync(legacy + ".bak")).toBe(false);
      }
      expect(new Set(pids).size).toBe(2);
    }, 60_000,
  );

  it.each(["list", "create", "upsert", "update"] as const)(
    "preflights unrelated partitions before startup during %s", async operation => {
      const legacy = path.join(root, ".data", "planning", "profiles", "legacy-a.json");
      const bad = path.join(root, ".data", "planning", "vault", "profiles", "broken-b", "profile.json");
      const migrated = path.join(root, ".data", "planning", "vault", "profiles", "legacy-a", "profile.json");
      const validLegacy = JSON.parse(fs.readFileSync(path.join(repository, "tests/fixtures/compat/profile-record-v1.json"), "utf8"));
      validLegacy.id = "legacy-a";
      write(legacy, validLegacy);
      write(bad, "{");
      const files = [legacy, bad];
      const before = files.map(fileFingerprint);
      const pids = [];
      for (let run = 0; run < 2; run += 1) {
        const result = await requestInFreshProcess(root, operation);
        pids.push(result.pid);
        if (operation === "list" || operation === "create") {
          expect.soft(result.reply?.status).toBe(500);
          expect.soft(result.reply?.body.error?.code).toBe("STORAGE_CORRUPT");
        } else {
          expect.soft(result.error).toBe("StorageCorruptedError");
        }
        // Inspect immediately after this one failing request, before any healthy detail read.
        expect.soft(files.map(file => fs.existsSync(file) ? fileFingerprint(file) : null)).toEqual(before);
        expect.soft(fs.existsSync(legacy + ".bak")).toBe(false);
        expect.soft(fs.existsSync(migrated)).toBe(false);
      }
      expect(new Set(pids).size).toBe(2);
    }, 60_000,
  );

  it.each(["debt balance", "non-object debt", "goal amount alias", "remainingMonths", "targetMonth", "termMonths", "dueMonth"])(
    "rejects legacy %s before real startup writes", async scenario => {
      const legacy = path.join(root, ".data", "planning", "profiles", "legacy-a.json");
      const validLegacy = JSON.parse(fs.readFileSync(path.join(repository, "tests/fixtures/compat/profile-record-v1.json"), "utf8"));
      validLegacy.id = "legacy-a";
      if (scenario === "debt balance") validLegacy.profile.debts[0].balance = "broken";
      if (scenario === "remainingMonths" || scenario === "termMonths") {
        if (scenario === "termMonths") delete validLegacy.profile.debts[0].remainingMonths;
        validLegacy.profile.debts[0][scenario] = "broken";
      }
      if (scenario === "targetMonth" || scenario === "dueMonth") {
        if (scenario === "dueMonth") delete validLegacy.profile.goals[0].targetMonth;
        validLegacy.profile.goals[0][scenario] = "broken";
      }
      if (scenario === "non-object debt") {
        validLegacy.profile.debts[0] = "broken";
        delete validLegacy.profile.debtOffers;
      }
      if (scenario === "goal amount alias") {
        validLegacy.profile.goalsV2 = [{ amount: "broken", savedAmount: 0 }];
        delete validLegacy.profile.goals;
      }
      write(legacy, validLegacy);
      const before = fileFingerprint(legacy);
      for (const operation of ["list", "detail"] as const) {
        const result = await requestInFreshProcess(root, operation);
        if (operation === "list") expect(result.reply?.body.error?.code).toBe("STORAGE_CORRUPT");
        else expect(result.error).toBe("StorageCorruptedError");
        expect(fileFingerprint(legacy)).toEqual(before);
        expect(fs.existsSync(legacy + ".bak")).toBe(false);
        expect(fs.existsSync(path.join(root, ".data", "planning", "vault", "profiles", "legacy-a"))).toBe(false);
      }
    }, 60_000,
  );

  it("allows real startup migration of populated v1 on a healthy detail request", async () => {
    const legacy = path.join(root, ".data", "planning", "profiles", "legacy-a.json");
    const validLegacy = JSON.parse(fs.readFileSync(path.join(repository, "tests/fixtures/compat/profile-record-v1.json"), "utf8"));
    validLegacy.id = "legacy-a";
    write(legacy, validLegacy);
    const bad = path.join(root, ".data", "planning", "vault", "profiles", "broken-b", "profile.json");
    write(bad, "{");
    const badBefore = fileFingerprint(bad);
    const result = await requestInFreshProcess(root, "detail");
    expect(result.error).toBeUndefined();
    expect(result.value?.id).toBe("legacy-a");
    expect(result.value?.profile.debts).toHaveLength(1);
    expect(result.value?.profile.debts[0]).toMatchObject({ balance: 120_000_000, remainingMonths: 220 });
    expect(result.value?.profile.goals).toHaveLength(1);
    expect(result.value?.profile.goals[0]).toMatchObject({ targetAmount: 18_000_000, currentAmount: 8_000_000, targetMonth: 24 });
    expect(result.startup?.result).toBe("ok");
    expect(fs.existsSync(legacy)).toBe(false);
    expect(fs.existsSync(legacy + ".bak")).toBe(true);
    expect(fileFingerprint(bad)).toEqual(badBefore);
  }, 30_000);

  it("keeps normal new-store initialization stable across fresh processes", async () => {
    const first = await readThroughFreshProcess(root);
    const file = ownerPath("owner-a", "default-profile");
    const before = fileFingerprint(file);
    const second = await readThroughFreshProcess(root);
    expect(first.list.status).toBe(200);
    expect(second.list.status).toBe(200);
    expect(second.detail.status).toBe(200);
    expect(fileFingerprint(file)).toEqual(before);
    expect(fs.readdirSync(path.dirname(path.dirname(file))).filter(name => name !== "index.json")).toEqual(["default-profile"]);
  }, 60_000);

  it("reads a healthy partition beside a corrupt partition in the default startup layout", async () => {
    const partitions = path.join(root, ".data", "planning", "vault", "profiles");
    write(path.join(partitions, "default-profile", "profile.json"), "{");
    write(path.join(partitions, "good", "profile.json"), record("good"));
    const result = await readThroughFreshProcess(root, false);
    expect(result.list.body.error?.code).toBe("STORAGE_CORRUPT");
    expect(result.detail.body.error?.code).toBe("STORAGE_CORRUPT");
    expect(result.good.status).toBe(200);
  }, 30_000);
});
