import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ persist: vi.fn(), attempt: vi.fn() }));
vi.mock("../scripts/finlife_cli_common.mjs", async (importOriginal) => ({
  ...await importOriginal<typeof import("../scripts/finlife_cli_common.mjs")>(),
  getFinlifeConfig: () => ({ baseUrl: "https://fixture.invalid", apiKey: "fixture" }),
  writeSyncAttempt: mocks.attempt,
  fetchFinlifePage: async ({ kind }: { kind: string }) => {
    // Deposit receives credit-loan rows, so its integrity check fails while credit-loan completes.
    const base = { fin_co_no: "0010001", fin_prdt_cd: "SHARED", dcls_month: "202609", ...(kind === "credit-loan" || kind === "deposit" ? {crdt_prdt_type:"2"} : {loan_type:"1"}) };
    return { result: { err_cd:"000", prdt_div:"C", now_page_no:1,max_page_no:1,total_count:1,baseList:[base],optionList:[base] } };
  },
}));
vi.mock("../scripts/finlife_persistence.mjs", async (importOriginal) => ({
  ...await importOriginal<typeof import("../scripts/finlife_persistence.mjs")>(),
  persistFinlifeSyncKind: mocks.persist,
}));
import { runSyncKinds } from "../scripts/finlife_sync.mjs";
describe("FINLIFE independent kind completion", () => {
  it("rejects the whole command while preserving successful kinds after one kind's integrity failure", async () => {
    mocks.persist.mockResolvedValue({dbSync:{}});
    await expect(runSyncKinds(["deposit","credit-loan"], {topFinGrpNo:"020000"})).rejects.toThrow("deposit");
    expect(mocks.persist).toHaveBeenCalledTimes(1);
    expect(mocks.persist.mock.calls[0][0].kind).toBe("credit-loan");
    expect(mocks.attempt).toHaveBeenCalledWith("deposit",expect.objectContaining({status:"failed",errorCode:"FINLIFE_INTEGRITY_FAILED"}));
  });
});
