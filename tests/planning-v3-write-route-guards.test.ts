import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DELETE as deleteCategoryRuleDELETE } from "../src/app/api/planning/v3/categories/rules/[id]/route";
import { POST as categoryRulesPOST } from "../src/app/api/planning/v3/categories/rules/route";
import { POST as profileDraftsPOST } from "../src/app/api/planning/v3/profile/drafts/route";
import { POST as profileDraftApplyPOST } from "../src/app/api/planning/v3/profile/drafts/[id]/apply/route";
import { POST as profileDraftPreflightPOST } from "../src/app/api/planning/v3/profile/drafts/[id]/preflight/route";
import { POST as draftCreateProfilePOST } from "../src/app/api/planning/v3/drafts/[id]/create-profile/route";
import { POST as draftPreviewPOST } from "../src/app/api/planning/v3/draft/preview/route";
import { POST as draftProfilePOST } from "../src/app/api/planning/v3/draft/profile/route";
import { DELETE as accountDELETE, PATCH as accountPATCH } from "../src/app/api/planning/v3/accounts/[id]/route";
import { POST as accountsPOST } from "../src/app/api/planning/v3/accounts/route";
import { DELETE as draftDeleteDELETE } from "../src/app/api/planning/v3/drafts/[id]/route";
import { POST as draftsPOST } from "../src/app/api/planning/v3/drafts/route";
import { POST as exposureProfilePOST } from "../src/app/api/planning/v3/exposure/profile/route";
import { POST as indicatorsSpecsPOST } from "../src/app/api/planning/v3/indicators/specs/route";
import { POST as newsSettingsPOST } from "../src/app/api/planning/v3/news/settings/route";
import { POST as newsSourcesPOST } from "../src/app/api/planning/v3/news/sources/route";
import { POST as newsRecoveryPOST } from "../src/app/api/planning/v3/news/recovery/route";
import { POST as newsRefreshPOST } from "../src/app/api/planning/v3/news/refresh/route";
import { POST as newsWeeklyPlanPOST } from "../src/app/api/planning/v3/news/weekly-plan/route";
import { POST as newsAlertsPOST } from "../src/app/api/planning/v3/news/alerts/route";
import { POST as newsAlertRulesPOST } from "../src/app/api/planning/v3/news/alerts/rules/route";
import { POST as newsNotesPOST } from "../src/app/api/planning/v3/news/notes/route";
import { PATCH as newsNotePATCH } from "../src/app/api/planning/v3/news/notes/[noteId]/route";
import { POST as journalEntriesPOST } from "../src/app/api/planning/v3/journal/entries/route";
import { PUT as journalEntryPUT } from "../src/app/api/planning/v3/journal/entries/[id]/route";
import { POST as routinesDailyPOST } from "../src/app/api/planning/v3/routines/daily/route";
import { POST as scenarioLibraryPOST } from "../src/app/api/planning/v3/scenarios/library/route";
import { POST as importCsvPOST } from "../src/app/api/planning/v3/import/csv/route";
import { PATCH as openingBalancesPATCH } from "../src/app/api/planning/v3/opening-balances/route";
import { POST as batchAccountPOST } from "../src/app/api/planning/v3/transactions/batches/[id]/account/route";
import { POST as mergeBatchesPOST } from "../src/app/api/planning/v3/transactions/batches/merge/route";
import { PATCH as accountOverridesPATCH } from "../src/app/api/planning/v3/transactions/account-overrides/route";
import { POST as transactionsImportCsvPOST } from "../src/app/api/planning/v3/transactions/import/csv/route";
import {
  DELETE as transactionOverridesDELETE,
  PATCH as transactionOverridesPATCH,
} from "../src/app/api/planning/v3/transactions/overrides/route";
import { PATCH as transferOverridesPATCH } from "../src/app/api/planning/v3/transactions/transfer-overrides/route";
import { POST as batchTxnOverridesPOST } from "../src/app/api/planning/v3/batches/[id]/txn-overrides/route";

const PROJECT_ROOT = process.cwd();
const V3_API_ROOT = path.join(PROJECT_ROOT, "src", "app", "api", "planning", "v3");

const LOCAL_HOST = "localhost:3100";
const LOCAL_ORIGIN = `http://${LOCAL_HOST}`;
const DEFAULT_CSRF = "csrf-token";
const USER_FACING_SAME_ORIGIN_WRITE_ROUTES = new Set([
  path.join(V3_API_ROOT, "accounts", "route.ts"),
  path.join(V3_API_ROOT, "accounts", "[id]", "route.ts"),
  path.join(V3_API_ROOT, "accounts", "[id]", "starting-balance", "route.ts"),
  path.join(V3_API_ROOT, "batches", "import", "csv", "route.ts"),
  path.join(V3_API_ROOT, "categories", "rules", "route.ts"),
  path.join(V3_API_ROOT, "categories", "rules", "[id]", "route.ts"),
  path.join(V3_API_ROOT, "draft", "apply", "route.ts"),
  path.join(V3_API_ROOT, "draft", "profile", "route.ts"),
  path.join(V3_API_ROOT, "draft", "preview", "route.ts"),
  path.join(V3_API_ROOT, "draft", "scenario", "route.ts"),
  path.join(V3_API_ROOT, "drafts", "route.ts"),
  path.join(V3_API_ROOT, "drafts", "[id]", "route.ts"),
  path.join(V3_API_ROOT, "drafts", "[id]", "create-profile", "route.ts"),
  path.join(V3_API_ROOT, "exposure", "profile", "route.ts"),
  path.join(V3_API_ROOT, "indicators", "specs", "route.ts"),
  path.join(V3_API_ROOT, "import", "csv", "route.ts"),
  path.join(V3_API_ROOT, "journal", "entries", "route.ts"),
  path.join(V3_API_ROOT, "journal", "entries", "[id]", "route.ts"),
  path.join(V3_API_ROOT, "news", "recovery", "route.ts"),
  path.join(V3_API_ROOT, "news", "refresh", "route.ts"),
  path.join(V3_API_ROOT, "news", "settings", "route.ts"),
  path.join(V3_API_ROOT, "news", "sources", "route.ts"),
  path.join(V3_API_ROOT, "news", "weekly-plan", "route.ts"),
  path.join(V3_API_ROOT, "news", "alerts", "route.ts"),
  path.join(V3_API_ROOT, "news", "alerts", "rules", "route.ts"),
  path.join(V3_API_ROOT, "news", "exposure", "route.ts"),
  path.join(V3_API_ROOT, "news", "notes", "route.ts"),
  path.join(V3_API_ROOT, "news", "notes", "[noteId]", "route.ts"),
  path.join(V3_API_ROOT, "opening-balances", "route.ts"),
  path.join(V3_API_ROOT, "profile", "drafts", "route.ts"),
  path.join(V3_API_ROOT, "profile", "drafts", "[id]", "route.ts"),
  path.join(V3_API_ROOT, "profile", "drafts", "[id]", "apply", "route.ts"),
  path.join(V3_API_ROOT, "profile", "drafts", "[id]", "preflight", "route.ts"),
  path.join(V3_API_ROOT, "profile", "draft", "route.ts"),
  path.join(V3_API_ROOT, "routines", "daily", "route.ts"),
  path.join(V3_API_ROOT, "scenarios", "library", "route.ts"),
  path.join(V3_API_ROOT, "transactions", "batches", "[id]", "route.ts"),
  path.join(V3_API_ROOT, "transactions", "batches", "[id]", "account", "route.ts"),
  path.join(V3_API_ROOT, "transactions", "batches", "import-csv", "route.ts"),
  path.join(V3_API_ROOT, "transactions", "account-overrides", "route.ts"),
  path.join(V3_API_ROOT, "transactions", "transfer-overrides", "route.ts"),
  path.join(V3_API_ROOT, "transactions", "import", "csv", "route.ts"),
  path.join(V3_API_ROOT, "batches", "[id]", "txn-overrides", "route.ts"),
]);

type RouteInvoker = (request: Request) => Promise<Response> | Response;

function walkRoutes(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const filePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkRoutes(filePath));
      continue;
    }
    if (entry.isFile() && entry.name === "route.ts") {
      out.push(filePath);
    }
  }
  return out.sort((a, b) => a.localeCompare(b));
}

function buildWriteRequest(input: {
  pathname: string;
  method: "POST" | "PUT" | "PATCH" | "DELETE";
  host?: string;
  origin?: string;
  referer?: string;
  cookie?: string;
  body?: Record<string, unknown>;
}): Request {
  const host = input.host ?? LOCAL_HOST;
  const origin = input.origin ?? `http://${host}`;
  const headers = new Headers({
    host,
    origin,
    referer: input.referer ?? `${origin}/planning/v3/news`,
    "content-type": "application/json",
  });
  if (input.cookie) headers.set("cookie", input.cookie);
  return new Request(`${origin}${input.pathname}`, {
    method: input.method,
    headers,
    body: JSON.stringify(input.body ?? {}),
  });
}

async function expectGuardCode(response: Response, expectedCode: string): Promise<void> {
  const payload = await response.json() as { ok?: boolean; error?: { code?: string } };
  expect(response.status).toBe(403);
  expect(payload.ok).toBe(false);
  expect(payload.error?.code).toBe(expectedCode);
}

const runtimeTargets: Array<{
  name: string;
  pathname: string;
  method: "POST" | "PUT" | "PATCH" | "DELETE";
  sameOriginRemoteAllowed: boolean;
  invoke: RouteInvoker;
}> = [
  {
    name: "categories.rules.POST",
    pathname: "/api/planning/v3/categories/rules",
    method: "POST",
    sameOriginRemoteAllowed: true,
    invoke: (request) => categoryRulesPOST(request),
  },
  {
    name: "draft.profile.POST",
    pathname: "/api/planning/v3/draft/profile",
    method: "POST",
    sameOriginRemoteAllowed: true,
    invoke: (request) => draftProfilePOST(request),
  },
  {
    name: "draft.preview.POST",
    pathname: "/api/planning/v3/draft/preview",
    method: "POST",
    sameOriginRemoteAllowed: true,
    invoke: (request) => draftPreviewPOST(request),
  },
  {
    name: "drafts.POST",
    pathname: "/api/planning/v3/drafts",
    method: "POST",
    sameOriginRemoteAllowed: true,
    invoke: (request) => draftsPOST(request),
  },
  {
    name: "drafts.id.createProfile.POST",
    pathname: "/api/planning/v3/drafts/draft_guard/create-profile",
    method: "POST",
    sameOriginRemoteAllowed: true,
    invoke: (request) => draftCreateProfilePOST(request, { params: Promise.resolve({ id: "draft_guard" }) }),
  },
  {
    name: "accounts.id.PATCH",
    pathname: "/api/planning/v3/accounts/acc_guard",
    method: "PATCH",
    sameOriginRemoteAllowed: true,
    invoke: (request) => accountPATCH(request, { params: Promise.resolve({ id: "acc_guard" }) }),
  },
  {
    name: "accounts.id.DELETE",
    pathname: "/api/planning/v3/accounts/acc_guard",
    method: "DELETE",
    sameOriginRemoteAllowed: true,
    invoke: (request) => accountDELETE(request, { params: Promise.resolve({ id: "acc_guard" }) }),
  },
  {
    name: "news.settings.POST",
    pathname: "/api/planning/v3/news/settings",
    method: "POST",
    sameOriginRemoteAllowed: true,
    invoke: (request) => newsSettingsPOST(request),
  },
  {
    name: "news.sources.POST",
    pathname: "/api/planning/v3/news/sources",
    method: "POST",
    sameOriginRemoteAllowed: true,
    invoke: (request) => newsSourcesPOST(request),
  },
  {
    name: "news.recovery.POST",
    pathname: "/api/planning/v3/news/recovery",
    method: "POST",
    sameOriginRemoteAllowed: true,
    invoke: (request) => newsRecoveryPOST(request),
  },
  {
    name: "news.refresh.POST",
    pathname: "/api/planning/v3/news/refresh",
    method: "POST",
    sameOriginRemoteAllowed: true,
    invoke: (request) => newsRefreshPOST(request),
  },
  {
    name: "indicators.specs.POST",
    pathname: "/api/planning/v3/indicators/specs",
    method: "POST",
    sameOriginRemoteAllowed: true,
    invoke: (request) => indicatorsSpecsPOST(request),
  },
  {
    name: "news.weeklyPlan.POST",
    pathname: "/api/planning/v3/news/weekly-plan",
    method: "POST",
    sameOriginRemoteAllowed: true,
    invoke: (request) => newsWeeklyPlanPOST(request),
  },
  {
    name: "news.alerts.POST",
    pathname: "/api/planning/v3/news/alerts",
    method: "POST",
    sameOriginRemoteAllowed: true,
    invoke: (request) => newsAlertsPOST(request),
  },
  {
    name: "news.alertRules.POST",
    pathname: "/api/planning/v3/news/alerts/rules",
    method: "POST",
    sameOriginRemoteAllowed: true,
    invoke: (request) => newsAlertRulesPOST(request),
  },
  {
    name: "news.notes.POST",
    pathname: "/api/planning/v3/news/notes",
    method: "POST",
    sameOriginRemoteAllowed: true,
    invoke: (request) => newsNotesPOST(request),
  },
  {
    name: "news.notes.noteId.PATCH",
    pathname: "/api/planning/v3/news/notes/note_guard",
    method: "PATCH",
    sameOriginRemoteAllowed: true,
    invoke: (request) => newsNotePATCH(request, { params: Promise.resolve({ noteId: "note_guard" }) }),
  },
  {
    name: "exposure.profile.POST",
    pathname: "/api/planning/v3/exposure/profile",
    method: "POST",
    sameOriginRemoteAllowed: true,
    invoke: (request) => exposureProfilePOST(request),
  },
  {
    name: "journal.entries.POST",
    pathname: "/api/planning/v3/journal/entries",
    method: "POST",
    sameOriginRemoteAllowed: true,
    invoke: (request) => journalEntriesPOST(request),
  },
  {
    name: "journal.entries.id.PUT",
    pathname: "/api/planning/v3/journal/entries/entry_guard",
    method: "PUT",
    sameOriginRemoteAllowed: true,
    invoke: (request) => journalEntryPUT(request, { params: Promise.resolve({ id: "entry_guard" }) }),
  },
  {
    name: "import.csv.POST",
    pathname: "/api/planning/v3/import/csv?csrf=csrf-token",
    method: "POST",
    sameOriginRemoteAllowed: true,
    invoke: (request) => importCsvPOST(request),
  },
  {
    name: "transactions.batch.account.POST",
    pathname: "/api/planning/v3/transactions/batches/batch_guard/account",
    method: "POST",
    sameOriginRemoteAllowed: true,
    invoke: (request) => batchAccountPOST(request, { params: Promise.resolve({ id: "batch_guard" }) }),
  },
  {
    name: "transactions.import.csv.POST",
    pathname: "/api/planning/v3/transactions/import/csv",
    method: "POST",
    sameOriginRemoteAllowed: true,
    invoke: (request) => transactionsImportCsvPOST(request),
  },
  {
    name: "transactions.accountOverrides.PATCH",
    pathname: "/api/planning/v3/transactions/account-overrides",
    method: "PATCH",
    sameOriginRemoteAllowed: true,
    invoke: (request) => accountOverridesPATCH(request),
  },
  {
    name: "transactions.transferOverrides.PATCH",
    pathname: "/api/planning/v3/transactions/transfer-overrides",
    method: "PATCH",
    sameOriginRemoteAllowed: true,
    invoke: (request) => transferOverridesPATCH(request),
  },
  {
    name: "batches.txnOverrides.POST",
    pathname: "/api/planning/v3/batches/batch_guard/txn-overrides",
    method: "POST",
    sameOriginRemoteAllowed: true,
    invoke: (request) => batchTxnOverridesPOST(request, { params: Promise.resolve({ id: "batch_guard" }) }),
  },
  {
    name: "categories.rules.id.DELETE",
    pathname: "/api/planning/v3/categories/rules/rule_guard?csrf=csrf-token",
    method: "DELETE",
    sameOriginRemoteAllowed: true,
    invoke: (request) => deleteCategoryRuleDELETE(request, { params: Promise.resolve({ id: "rule_guard" }) }),
  },
  {
    name: "routines.daily.POST",
    pathname: "/api/planning/v3/routines/daily",
    method: "POST",
    sameOriginRemoteAllowed: true,
    invoke: (request) => routinesDailyPOST(request),
  },
  {
    name: "scenarios.library.POST",
    pathname: "/api/planning/v3/scenarios/library",
    method: "POST",
    sameOriginRemoteAllowed: true,
    invoke: (request) => scenarioLibraryPOST(request),
  },
  {
    name: "profile.drafts.id.apply.POST",
    pathname: "/api/planning/v3/profile/drafts/draft_guard/apply",
    method: "POST",
    sameOriginRemoteAllowed: true,
    invoke: (request) => profileDraftApplyPOST(request, { params: Promise.resolve({ id: "draft_guard" }) }),
  },
  {
    name: "profile.drafts.id.preflight.POST",
    pathname: "/api/planning/v3/profile/drafts/draft_guard/preflight",
    method: "POST",
    sameOriginRemoteAllowed: true,
    invoke: (request) => profileDraftPreflightPOST(request, { params: Promise.resolve({ id: "draft_guard" }) }),
  },
  {
    name: "drafts.id.DELETE",
    pathname: "/api/planning/v3/drafts/draft_guard",
    method: "DELETE",
    sameOriginRemoteAllowed: true,
    invoke: (request) => draftDeleteDELETE(request, { params: Promise.resolve({ id: "draft_guard" }) }),
  },
  {
    name: "openingBalances.PATCH",
    pathname: "/api/planning/v3/opening-balances",
    method: "PATCH",
    sameOriginRemoteAllowed: true,
    invoke: (request) => openingBalancesPATCH(request),
  },
  {
    name: "transactions.overrides.PATCH",
    pathname: "/api/planning/v3/transactions/overrides",
    method: "PATCH",
    sameOriginRemoteAllowed: false,
    invoke: (request) => transactionOverridesPATCH(request),
  },
  {
    name: "transactions.overrides.DELETE",
    pathname: "/api/planning/v3/transactions/overrides",
    method: "DELETE",
    sameOriginRemoteAllowed: false,
    invoke: (request) => transactionOverridesDELETE(request),
  },
  {
    name: "transactions.batches.merge.POST",
    pathname: "/api/planning/v3/transactions/batches/merge",
    method: "POST",
    sameOriginRemoteAllowed: false,
    invoke: (request) => mergeBatchesPOST(request),
  },
];

describe("planning v3 write route guards", () => {
  it("v3 write routes keep same-origin/csrf guards, and only non-user routes require local-only", () => {
    const files = walkRoutes(V3_API_ROOT);
    const writeMethodRegex = /export\s+async\s+function\s+(POST|PUT|PATCH|DELETE)\s*\(/g;
    const writeRouteFiles: string[] = [];

    for (const filePath of files) {
      const source = fs.readFileSync(filePath, "utf-8");
      const hasWriteMethod = writeMethodRegex.test(source);
      if (!hasWriteMethod) continue;
      writeRouteFiles.push(filePath);

      expect(source).toMatch(/assertSameOrigin\s*\(/);
      expect(source).toMatch(/(assertCsrf|requireCsrf)\s*\(/);
      if (!USER_FACING_SAME_ORIGIN_WRITE_ROUTES.has(filePath)) {
        expect(source).toMatch(/assertLocalHost\s*\(/);
      }
    }

    expect(writeRouteFiles.length).toBeGreaterThan(0);
  });

  it("runtime write routes only keep local-only on non-user-facing endpoints", async () => {
    for (const target of runtimeTargets) {
      const request = buildWriteRequest({
        pathname: target.pathname,
        method: target.method,
        host: "example.com",
        origin: "http://example.com",
        referer: "http://example.com/planning/v3",
        cookie: `dev_action=1; dev_csrf=${DEFAULT_CSRF}`,
        body: { csrf: DEFAULT_CSRF },
      });
      const response = await target.invoke(request);
      if (target.sameOriginRemoteAllowed) {
        expect(response.status, target.name).not.toBe(403);
      } else {
        await expectGuardCode(response, "LOCAL_ONLY");
      }
    }
  });

  it("runtime write routes block origin mismatch", async () => {
    for (const target of runtimeTargets) {
      const request = buildWriteRequest({
        pathname: target.pathname,
        method: target.method,
        host: LOCAL_HOST,
        origin: "http://evil.com",
        referer: "http://evil.com/planning/v3",
        cookie: `dev_action=1; dev_csrf=${DEFAULT_CSRF}`,
        body: { csrf: DEFAULT_CSRF },
      });
      const response = await target.invoke(request);
      await expectGuardCode(response, "ORIGIN_MISMATCH");
    }
  });

  it("runtime write routes block csrf mismatch", async () => {
    for (const target of runtimeTargets) {
      const request = buildWriteRequest({
        pathname: target.pathname,
        method: target.method,
        host: LOCAL_HOST,
        origin: LOCAL_ORIGIN,
        referer: `${LOCAL_ORIGIN}/planning/v3/news`,
        cookie: "dev_action=1; dev_csrf=csrf-cookie",
        body: { csrf: "csrf-body-mismatch" },
      });
      const response = await target.invoke(request);
      await expectGuardCode(response, "CSRF_MISMATCH");
    }
  });

  it("selected user-facing routes allow same-origin remote host and still block cross-origin", async () => {
    const sameOriginRemoteDraft = await profileDraftsPOST(buildWriteRequest({
      pathname: "/api/planning/v3/profile/drafts",
      method: "POST",
      host: "example.com",
      origin: "http://example.com",
      referer: "http://example.com/planning/v3/profile/drafts",
      body: { csrf: DEFAULT_CSRF },
    }));
    expect(sameOriginRemoteDraft.status).not.toBe(403);

    const crossOriginDraft = await profileDraftsPOST(buildWriteRequest({
      pathname: "/api/planning/v3/profile/drafts",
      method: "POST",
      host: LOCAL_HOST,
      origin: "http://evil.com",
      referer: "http://evil.com/planning/v3/profile/drafts",
      body: { csrf: DEFAULT_CSRF },
    }));
    await expectGuardCode(crossOriginDraft, "ORIGIN_MISMATCH");

    const sameOriginRemoteAccounts = await accountsPOST(buildWriteRequest({
      pathname: "/api/planning/v3/accounts",
      method: "POST",
      host: "example.com",
      origin: "http://example.com",
      referer: "http://example.com/planning/v3/accounts",
      body: { csrf: DEFAULT_CSRF, kind: "bank" },
    }));
    expect(sameOriginRemoteAccounts.status).not.toBe(403);

    const crossOriginAccounts = await accountsPOST(buildWriteRequest({
      pathname: "/api/planning/v3/accounts",
      method: "POST",
      host: LOCAL_HOST,
      origin: "http://evil.com",
      referer: "http://evil.com/planning/v3/accounts",
      body: { csrf: DEFAULT_CSRF, kind: "bank" },
    }));
    await expectGuardCode(crossOriginAccounts, "ORIGIN_MISMATCH");

    const sameOriginRemoteWeeklyPlan = await newsWeeklyPlanPOST(buildWriteRequest({
      pathname: "/api/planning/v3/news/weekly-plan",
      method: "POST",
      host: "example.com",
      origin: "http://example.com",
      referer: "http://example.com/planning/v3/news",
      body: { csrf: DEFAULT_CSRF, topics: ["rates"], seriesIds: ["kr_base_rate"] },
    }));
    expect(sameOriginRemoteWeeklyPlan.status).not.toBe(403);

    const sameOriginRemoteCategoryRules = await categoryRulesPOST(buildWriteRequest({
      pathname: "/api/planning/v3/categories/rules",
      method: "POST",
      host: "example.com",
      origin: "http://example.com",
      referer: "http://example.com/planning/v3/categories/rules",
      body: {
        csrf: DEFAULT_CSRF,
        id: "rule_guard",
        categoryId: "food",
        match: { type: "contains", value: "meal" },
        priority: 50,
        enabled: true,
      },
    }));
    expect(sameOriginRemoteCategoryRules.status).not.toBe(403);

    const sameOriginRemoteDraftProfile = await draftProfilePOST(buildWriteRequest({
      pathname: "/api/planning/v3/draft/profile",
      method: "POST",
      host: "example.com",
      origin: "http://example.com",
      referer: "http://example.com/planning/v3/drafts/profile",
      body: { csrf: DEFAULT_CSRF, source: "csv" },
    }));
    expect(sameOriginRemoteDraftProfile.status).not.toBe(403);

    const sameOriginRemoteImportCsv = await importCsvPOST(buildWriteRequest({
      pathname: "/api/planning/v3/import/csv?csrf=csrf-token",
      method: "POST",
      host: "example.com",
      origin: "http://example.com",
      referer: "http://example.com/planning/v3/import",
      body: {
        csrf: DEFAULT_CSRF,
        csvText: [
          "date,amount,description",
          "2026-01-01,1000,salary",
        ].join("\\n"),
      },
    }));
    expect(sameOriginRemoteImportCsv.status).not.toBe(403);

    const sameOriginRemoteScenarioLibrary = await scenarioLibraryPOST(buildWriteRequest({
      pathname: "/api/planning/v3/scenarios/library",
      method: "POST",
      host: "example.com",
      origin: "http://example.com",
      referer: "http://example.com/planning/v3/scenarios",
      body: {
        csrf: DEFAULT_CSRF,
        items: [{ topicId: "rates", enabled: true, order: 0 }],
      },
    }));
    expect(sameOriginRemoteScenarioLibrary.status).not.toBe(403);

    const sameOriginRemoteBatchAccount = await batchAccountPOST(buildWriteRequest({
      pathname: "/api/planning/v3/transactions/batches/batch_guard/account",
      method: "POST",
      host: "example.com",
      origin: "http://example.com",
      referer: "http://example.com/planning/v3/transactions/batches/batch_guard",
      body: { csrf: DEFAULT_CSRF, accountId: "acc-main" },
    }), { params: Promise.resolve({ id: "batch_guard" }) });
    expect(sameOriginRemoteBatchAccount.status).not.toBe(403);

    const sameOriginRemoteAccountOverride = await accountOverridesPATCH(buildWriteRequest({
      pathname: "/api/planning/v3/transactions/account-overrides",
      method: "PATCH",
      host: "example.com",
      origin: "http://example.com",
      referer: "http://example.com/planning/v3/transactions/batches/batch_guard",
      body: { csrf: DEFAULT_CSRF, batchId: "batch_guard", txnId: "aaaaaaaaaaaaaaaaaaaaaaaa", accountId: "acc-main" },
    }));
    expect(sameOriginRemoteAccountOverride.status).not.toBe(403);

    const sameOriginRemoteTransferOverride = await transferOverridesPATCH(buildWriteRequest({
      pathname: "/api/planning/v3/transactions/transfer-overrides",
      method: "PATCH",
      host: "example.com",
      origin: "http://example.com",
      referer: "http://example.com/planning/v3/transactions/batches/batch_guard",
      body: { csrf: DEFAULT_CSRF, batchId: "batch_guard", txnId: "aaaaaaaaaaaaaaaaaaaaaaaa", forceTransfer: true },
    }));
    expect(sameOriginRemoteTransferOverride.status).not.toBe(403);

    const sameOriginRemoteBatchTxnOverride = await batchTxnOverridesPOST(buildWriteRequest({
      pathname: "/api/planning/v3/batches/batch_guard/txn-overrides",
      method: "POST",
      host: "example.com",
      origin: "http://example.com",
      referer: "http://example.com/planning/v3/transactions/batches/batch_guard",
      body: { csrf: DEFAULT_CSRF, txnId: "aaaaaaaaaaaaaaaaaaaaaaaa", kind: "auto" },
    }), { params: Promise.resolve({ id: "batch_guard" }) });
    expect(sameOriginRemoteBatchTxnOverride.status).not.toBe(403);

    const sameOriginRemoteCategoryRuleDelete = await deleteCategoryRuleDELETE(buildWriteRequest({
      pathname: "/api/planning/v3/categories/rules/rule_guard?csrf=csrf-token",
      method: "DELETE",
      host: "example.com",
      origin: "http://example.com",
      referer: "http://example.com/planning/v3/categories/rules",
    }), { params: Promise.resolve({ id: "rule_guard" }) });
    expect(sameOriginRemoteCategoryRuleDelete.status).not.toBe(403);
  });
});
