import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { POST as exposureProfilePOST } from "../src/app/api/planning/v3/exposure/profile/route";
import { POST as newsRefreshPOST } from "../src/app/api/planning/v3/news/refresh/route";
import { POST as newsSettingsPOST } from "../src/app/api/planning/v3/news/settings/route";
import { POST as newsAlertRulesPOST } from "../src/app/api/planning/v3/news/alerts/rules/route";
import { POST as newsNotesPOST } from "../src/app/api/planning/v3/news/notes/route";
import { PATCH as newsNotePATCH } from "../src/app/api/planning/v3/news/notes/[noteId]/route";
import { POST as journalEntriesPOST } from "../src/app/api/planning/v3/journal/entries/route";
import { PUT as journalEntryPUT } from "../src/app/api/planning/v3/journal/entries/[id]/route";

const PROJECT_ROOT = process.cwd();
const V3_API_ROOT = path.join(PROJECT_ROOT, "src", "app", "api", "planning", "v3");

const LOCAL_HOST = "localhost:3100";
const LOCAL_ORIGIN = `http://${LOCAL_HOST}`;
const DEFAULT_CSRF = "csrf-token";

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
  method: "POST" | "PUT" | "PATCH";
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
  method: "POST" | "PUT" | "PATCH";
  invoke: RouteInvoker;
}> = [
  {
    name: "news.refresh.POST",
    pathname: "/api/planning/v3/news/refresh",
    method: "POST",
    invoke: (request) => newsRefreshPOST(request),
  },
  {
    name: "news.settings.POST",
    pathname: "/api/planning/v3/news/settings",
    method: "POST",
    invoke: (request) => newsSettingsPOST(request),
  },
  {
    name: "news.alertRules.POST",
    pathname: "/api/planning/v3/news/alerts/rules",
    method: "POST",
    invoke: (request) => newsAlertRulesPOST(request),
  },
  {
    name: "news.notes.POST",
    pathname: "/api/planning/v3/news/notes",
    method: "POST",
    invoke: (request) => newsNotesPOST(request),
  },
  {
    name: "news.notes.noteId.PATCH",
    pathname: "/api/planning/v3/news/notes/note_guard",
    method: "PATCH",
    invoke: (request) => newsNotePATCH(request, { params: Promise.resolve({ noteId: "note_guard" }) }),
  },
  {
    name: "exposure.profile.POST",
    pathname: "/api/planning/v3/exposure/profile",
    method: "POST",
    invoke: (request) => exposureProfilePOST(request),
  },
  {
    name: "journal.entries.POST",
    pathname: "/api/planning/v3/journal/entries",
    method: "POST",
    invoke: (request) => journalEntriesPOST(request),
  },
  {
    name: "journal.entries.id.PUT",
    pathname: "/api/planning/v3/journal/entries/entry_guard",
    method: "PUT",
    invoke: (request) => journalEntryPUT(request, { params: Promise.resolve({ id: "entry_guard" }) }),
  },
];

describe("planning v3 write route guards", () => {
  it("all v3 write routes include local-only/same-origin/csrf guard calls", () => {
    const files = walkRoutes(V3_API_ROOT);
    const writeMethodRegex = /export\s+async\s+function\s+(POST|PUT|PATCH|DELETE)\s*\(/g;
    const writeRouteFiles: string[] = [];

    for (const filePath of files) {
      const source = fs.readFileSync(filePath, "utf-8");
      const hasWriteMethod = writeMethodRegex.test(source);
      if (!hasWriteMethod) continue;
      writeRouteFiles.push(filePath);

      expect(source).toMatch(/assertLocalHost\s*\(/);
      expect(source).toMatch(/assertSameOrigin\s*\(/);
      expect(source).toMatch(/(assertCsrf|requireCsrf)\s*\(/);
    }

    expect(writeRouteFiles.length).toBeGreaterThan(0);
  });

  it("runtime write routes block non-local host", async () => {
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
      await expectGuardCode(response, "LOCAL_ONLY");
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
});
