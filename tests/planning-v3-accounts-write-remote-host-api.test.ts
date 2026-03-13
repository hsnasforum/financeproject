import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DELETE as accountDELETE, PATCH as accountPATCH } from "../src/app/api/planning/v3/accounts/[id]/route";
import { POST as accountsPOST } from "../src/app/api/planning/v3/accounts/route";
import { PATCH as openingBalancesPATCH } from "../src/app/api/planning/v3/opening-balances/route";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalPlanningDataDir = process.env.PLANNING_DATA_DIR;

const REMOTE_HOST = "example.com";
const REMOTE_ORIGIN = `http://${REMOTE_HOST}`;
const EVIL_ORIGIN = "http://evil.com";

function requestJson(
  pathname: string,
  method: "POST" | "PATCH" | "DELETE",
  body: unknown,
  origin = REMOTE_ORIGIN,
  referer = `${REMOTE_ORIGIN}/planning/v3/accounts`,
): Request {
  return new Request(`${REMOTE_ORIGIN}${pathname}`, {
    method,
    headers: {
      host: REMOTE_HOST,
      origin,
      referer,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
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

describe("planning v3 accounts write remote host contract", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-v3-accounts-write-remote-host-"));
    env.NODE_ENV = "test";
    env.PLANNING_DATA_DIR = root;
  });

  afterEach(() => {
    if (typeof originalNodeEnv === "string") env.NODE_ENV = originalNodeEnv;
    else delete env.NODE_ENV;

    if (typeof originalPlanningDataDir === "string") env.PLANNING_DATA_DIR = originalPlanningDataDir;
    else delete env.PLANNING_DATA_DIR;

    fs.rmSync(root, { recursive: true, force: true });
  });

  it("allows same-origin remote host across account create/update/delete and opening balance save", async () => {
    const createResponse = await accountsPOST(requestJson(
      "/api/planning/v3/accounts",
      "POST",
      { csrf: "test", name: "Remote Main", kind: "bank" },
    ));
    expect(createResponse.status).toBe(201);
    const createPayload = await createResponse.json() as {
      ok?: boolean;
      account?: { id?: string; name?: string };
    };
    expect(createPayload.ok).toBe(true);
    expect(createPayload.account?.name).toBe("Remote Main");
    const accountId = String(createPayload.account?.id ?? "");
    expect(accountId).toBeTruthy();

    const updateResponse = await accountPATCH(
      requestJson(
        `/api/planning/v3/accounts/${encodeURIComponent(accountId)}`,
        "PATCH",
        { csrf: "test", name: "Remote Updated", kind: "checking", note: "memo" },
      ),
      { params: Promise.resolve({ id: accountId }) },
    );
    expect(updateResponse.status).toBe(200);
    const updatePayload = await updateResponse.json() as {
      ok?: boolean;
      account?: { name?: string; kind?: string; note?: string };
    };
    expect(updatePayload.ok).toBe(true);
    expect(updatePayload.account?.name).toBe("Remote Updated");
    expect(updatePayload.account?.kind).toBe("checking");
    expect(updatePayload.account?.note).toBe("memo");

    const openingResponse = await openingBalancesPATCH(requestJson(
      "/api/planning/v3/opening-balances",
      "PATCH",
      { csrf: "test", accountId, asOfDate: "2026-03-01", amountKrw: 150000 },
    ));
    expect(openingResponse.status).toBe(200);
    const openingPayload = await openingResponse.json() as {
      ok?: boolean;
      openingBalance?: { accountId?: string; amountKrw?: number; asOfDate?: string };
    };
    expect(openingPayload.ok).toBe(true);
    expect(openingPayload.openingBalance?.accountId).toBe(accountId);
    expect(openingPayload.openingBalance?.amountKrw).toBe(150000);
    expect(openingPayload.openingBalance?.asOfDate).toBe("2026-03-01");

    const deleteResponse = await accountDELETE(
      requestJson(
        `/api/planning/v3/accounts/${encodeURIComponent(accountId)}`,
        "DELETE",
        { csrf: "test" },
      ),
      { params: Promise.resolve({ id: accountId }) },
    );
    expect(deleteResponse.status).toBe(200);
    const deletePayload = await deleteResponse.json() as { ok?: boolean; deleted?: boolean };
    expect(deletePayload.ok).toBe(true);
    expect(deletePayload.deleted).toBe(true);
  });

  it("blocks cross-origin access across account write routes", async () => {
    await expectOriginMismatch(accountsPOST(requestJson(
      "/api/planning/v3/accounts",
      "POST",
      { csrf: "test", name: "Cross Origin", kind: "bank" },
      EVIL_ORIGIN,
      `${EVIL_ORIGIN}/planning/v3/accounts`,
    )));

    await expectOriginMismatch(accountPATCH(
      requestJson(
        "/api/planning/v3/accounts/acc-remote",
        "PATCH",
        { csrf: "test", name: "Cross Update" },
        EVIL_ORIGIN,
        `${EVIL_ORIGIN}/planning/v3/accounts`,
      ),
      { params: Promise.resolve({ id: "acc-remote" }) },
    ));

    await expectOriginMismatch(openingBalancesPATCH(requestJson(
      "/api/planning/v3/opening-balances",
      "PATCH",
      { csrf: "test", accountId: "acc-remote", asOfDate: "2026-03-01", amountKrw: 1000 },
      EVIL_ORIGIN,
      `${EVIL_ORIGIN}/planning/v3/accounts`,
    )));

    await expectOriginMismatch(accountDELETE(
      requestJson(
        "/api/planning/v3/accounts/acc-remote",
        "DELETE",
        { csrf: "test" },
        EVIL_ORIGIN,
        `${EVIL_ORIGIN}/planning/v3/accounts`,
      ),
      { params: Promise.resolve({ id: "acc-remote" }) },
    ));
  });
});
