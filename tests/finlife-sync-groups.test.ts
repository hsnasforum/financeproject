import { finlifeGroupEnvKey, resolveFinlifeGroupsForKind, SUPPORTED_FINLIFE_KINDS } from "../scripts/finlife_sync.mjs";
import { describe, expect, it } from "vitest";

describe("FINLIFE sync group resolution", () => {
  it("uses kind-specific group lists before the global group list", () => {
    const env: NodeJS.ProcessEnv = {
      NODE_ENV: "test",
      FINLIFE_TOPFIN_GRP_LIST: "020000",
      FINLIFE_MORTGAGE_LOAN_TOPFIN_GRP_LIST: "020000,030300",
    };

    expect(finlifeGroupEnvKey("mortgage-loan")).toBe("FINLIFE_MORTGAGE_LOAN_TOPFIN_GRP_LIST");
    expect(resolveFinlifeGroupsForKind("deposit", env).groups).toEqual(["020000"]);
    expect(resolveFinlifeGroupsForKind("deposit", env).sourceKey).toBe("FINLIFE_TOPFIN_GRP_LIST");
    expect(resolveFinlifeGroupsForKind("mortgage-loan", env).groups).toEqual(["020000", "030300"]);
    expect(resolveFinlifeGroupsForKind("mortgage-loan", env).sourceKey).toBe("FINLIFE_MORTGAGE_LOAN_TOPFIN_GRP_LIST");
  });

  it("no longer syncs pension savings from FINLIFE", () => {
    // The FINLIFE pension endpoint returns loan-shaped or empty pages; pension comes from `pnpm pension:sync`.
    expect(SUPPORTED_FINLIFE_KINDS).not.toContain("pension");
  });
});
