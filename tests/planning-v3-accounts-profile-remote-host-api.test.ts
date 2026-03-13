import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as accountsGET } from "../src/app/api/planning/v3/accounts/route";
import { GET as startingBalanceGET } from "../src/app/api/planning/v3/accounts/[id]/starting-balance/route";
import { GET as openingBalancesGET } from "../src/app/api/planning/v3/opening-balances/route";
import { GET as profileDraftGET } from "../src/app/api/planning/v3/profile/draft/route";
import { GET as profileDraftDetailGET } from "../src/app/api/planning/v3/profile/drafts/[id]/route";
import { GET as profileDraftsGET } from "../src/app/api/planning/v3/profile/drafts/route";
import { appendBatchFromCsv } from "../src/lib/planning/v3/service/transactionStore";
import { createDraftFromBatch } from "../src/lib/planning/v3/draft/store";
import { upsertOpeningBalance } from "../src/lib/planning/v3/openingBalances/store";
import { createAccount } from "../src/lib/planning/v3/store/accountsStore";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalPlanningDataDir = process.env.PLANNING_DATA_DIR;
const REMOTE_HOST = "example.com";
const REMOTE_ORIGIN = `http://${REMOTE_HOST}`;
const EVIL_ORIGIN = "http://evil.com";

function requestGet(pathname: string, refererPath: string): Request {
  return new Request(`${REMOTE_ORIGIN}${pathname}`, {
    method: "GET",
    headers: {
      host: REMOTE_HOST,
      origin: REMOTE_ORIGIN,
      referer: `${REMOTE_ORIGIN}${refererPath}`,
    },
  });
}

function requestCrossOrigin(pathname: string, refererPath: string): Request {
  return new Request(`${REMOTE_ORIGIN}${pathname}`, {
    method: "GET",
    headers: {
      host: REMOTE_HOST,
      origin: EVIL_ORIGIN,
      referer: `${EVIL_ORIGIN}${refererPath}`,
    },
  });
}

async function expectOriginMismatch(response: Response | Promise<Response>) {
  const resolved = await response;
  expect(resolved.status).toBe(403);
  const payload = await resolved.json() as {
    ok?: boolean;
    error?: { code?: string };
  };
  expect(payload.ok).toBe(false);
  expect(payload.error?.code).toBe("ORIGIN_MISMATCH");
}

describe("planning v3 accounts/profile remote host contract", () => {
  let root = "";
  let accountId = "";
  let batchId = "";
  let draftId = "";

  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-v3-accounts-profile-remote-host-"));
    env.NODE_ENV = "test";
    env.PLANNING_DATA_DIR = root;

    const account = await createAccount({ name: "Main", kind: "checking" });
    accountId = account.id;
    await upsertOpeningBalance(accountId, "2026-03-01", 150000);

    const created = await appendBatchFromCsv({
      accountId,
      csvText: [
        "date,amount,description",
        "2026-01-01,3000000,salary",
        "2026-01-02,-1200000,rent",
        "2026-02-01,3200000,salary",
        "2026-02-02,-1100000,rent",
        "2026-03-01,3100000,salary",
        "2026-03-02,-1150000,rent",
      ].join("\n"),
      mapping: { dateKey: "date", amountKey: "amount", descKey: "description" },
      fileName: "remote-host-profile.csv",
    });
    batchId = created.batch.id;

    const draft = await createDraftFromBatch(batchId);
    draftId = draft.id;
  });

  afterEach(() => {
    if (typeof originalNodeEnv === "string") env.NODE_ENV = originalNodeEnv;
    else delete env.NODE_ENV;
    if (typeof originalPlanningDataDir === "string") env.PLANNING_DATA_DIR = originalPlanningDataDir;
    else delete env.PLANNING_DATA_DIR;
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("allows same-origin remote host across accounts and profile draft GET routes", async () => {
    const accountsResponse = await accountsGET(
      requestGet("/api/planning/v3/accounts?csrf=test", "/planning/v3/accounts"),
    );
    expect(accountsResponse.status).toBe(200);
    const accountsPayload = await accountsResponse.json() as {
      ok?: boolean;
      items?: Array<{ id?: string }>;
    };
    expect(accountsPayload.ok).toBe(true);
    expect((accountsPayload.items ?? []).some((row) => row.id === accountId)).toBe(true);

    const openingBalancesResponse = await openingBalancesGET(
      requestGet("/api/planning/v3/opening-balances?csrf=test", "/planning/v3/accounts"),
    );
    expect(openingBalancesResponse.status).toBe(200);
    const openingBalancesPayload = await openingBalancesResponse.json() as {
      ok?: boolean;
      data?: Record<string, { amountKrw?: number; asOfDate?: string }>;
    };
    expect(openingBalancesPayload.ok).toBe(true);
    expect(openingBalancesPayload.data?.[accountId]?.amountKrw).toBe(150000);

    const startingBalanceResponse = await startingBalanceGET(
      requestGet(`/api/planning/v3/accounts/${encodeURIComponent(accountId)}/starting-balance?csrf=test`, "/planning/v3/accounts"),
      { params: Promise.resolve({ id: accountId }) },
    );
    expect(startingBalanceResponse.status).toBe(200);
    const startingBalancePayload = await startingBalanceResponse.json() as {
      ok?: boolean;
      accountId?: string;
      hasStartingBalance?: boolean;
      startingBalanceKrw?: number;
    };
    expect(startingBalancePayload.ok).toBe(true);
    expect(startingBalancePayload.accountId).toBe(accountId);
    expect(startingBalancePayload.hasStartingBalance).toBe(false);
    expect(startingBalancePayload.startingBalanceKrw).toBeUndefined();

    const profileDraftResponse = await profileDraftGET(
      requestGet(`/api/planning/v3/profile/draft?batchId=${encodeURIComponent(batchId)}&csrf=test`, "/planning/v3/profile/draft"),
    );
    expect(profileDraftResponse.status).toBe(200);
    const profileDraftPayload = await profileDraftResponse.json() as { ok?: boolean; meta?: { batchId?: string } };
    expect(profileDraftPayload.ok).toBe(true);
    expect(profileDraftPayload.meta?.batchId).toBe(batchId);

    const profileDraftsResponse = await profileDraftsGET(
      requestGet("/api/planning/v3/profile/drafts?csrf=test", "/planning/v3/profile/drafts"),
    );
    expect(profileDraftsResponse.status).toBe(200);
    const profileDraftsPayload = await profileDraftsResponse.json() as {
      ok?: boolean;
      data?: Array<{ id?: string }>;
    };
    expect(profileDraftsPayload.ok).toBe(true);
    expect((profileDraftsPayload.data ?? []).some((row) => row.id === draftId)).toBe(true);

    const profileDraftDetailResponse = await profileDraftDetailGET(
      requestGet(`/api/planning/v3/profile/drafts/${encodeURIComponent(draftId)}?csrf=test`, "/planning/v3/profile/drafts"),
      { params: Promise.resolve({ id: draftId }) },
    );
    expect(profileDraftDetailResponse.status).toBe(200);
    const profileDraftDetailPayload = await profileDraftDetailResponse.json() as {
      ok?: boolean;
      data?: { id?: string; batchId?: string };
    };
    expect(profileDraftDetailPayload.ok).toBe(true);
    expect(profileDraftDetailPayload.data?.id).toBe(draftId);
    expect(profileDraftDetailPayload.data?.batchId).toBe(batchId);
  });

  it("blocks cross-origin access across accounts and profile draft GET routes", async () => {
    await expectOriginMismatch(accountsGET(
      requestCrossOrigin("/api/planning/v3/accounts?csrf=test", "/planning/v3/accounts"),
    ));

    await expectOriginMismatch(openingBalancesGET(
      requestCrossOrigin("/api/planning/v3/opening-balances?csrf=test", "/planning/v3/accounts"),
    ));

    await expectOriginMismatch(startingBalanceGET(
      requestCrossOrigin(`/api/planning/v3/accounts/${encodeURIComponent(accountId)}/starting-balance?csrf=test`, "/planning/v3/accounts"),
      { params: Promise.resolve({ id: accountId }) },
    ));

    await expectOriginMismatch(profileDraftGET(
      requestCrossOrigin(`/api/planning/v3/profile/draft?batchId=${encodeURIComponent(batchId)}&csrf=test`, "/planning/v3/profile/draft"),
    ));

    await expectOriginMismatch(profileDraftsGET(
      requestCrossOrigin("/api/planning/v3/profile/drafts?csrf=test", "/planning/v3/profile/drafts"),
    ));

    await expectOriginMismatch(profileDraftDetailGET(
      requestCrossOrigin(`/api/planning/v3/profile/drafts/${encodeURIComponent(draftId)}?csrf=test`, "/planning/v3/profile/drafts"),
      { params: Promise.resolve({ id: draftId }) },
    ));
  });
});
