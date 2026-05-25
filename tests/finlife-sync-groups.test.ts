import { finlifeGroupEnvKey, resolveFinlifeGroupsForKind } from "../scripts/finlife_sync.mjs";
import { describe, expect, it } from "vitest";

describe("FINLIFE sync group resolution", () => {
  it("uses kind-specific group lists before the global group list", () => {
    const env: NodeJS.ProcessEnv = {
      NODE_ENV: "test",
      FINLIFE_TOPFIN_GRP_LIST: "020000",
      FINLIFE_PENSION_TOPFIN_GRP_LIST: "050000,060000",
    };

    expect(finlifeGroupEnvKey("pension")).toBe("FINLIFE_PENSION_TOPFIN_GRP_LIST");
    expect(finlifeGroupEnvKey("mortgage-loan")).toBe("FINLIFE_MORTGAGE_LOAN_TOPFIN_GRP_LIST");
    expect(resolveFinlifeGroupsForKind("deposit", env).groups).toEqual(["020000"]);
    expect(resolveFinlifeGroupsForKind("pension", env).groups).toEqual(["050000", "060000"]);
    expect(resolveFinlifeGroupsForKind("pension", env).sourceKey).toBe("FINLIFE_PENSION_TOPFIN_GRP_LIST");
  });

  it("uses the pension default before the deposit and saving group list", () => {
    const env: NodeJS.ProcessEnv = {
      NODE_ENV: "test",
      FINLIFE_TOPFIN_GRP_LIST: "020000",
    };

    expect(resolveFinlifeGroupsForKind("pension", env).groups).toEqual(["050000", "060000"]);
    expect(resolveFinlifeGroupsForKind("pension", env).sourceKey).toBe("FINLIFE_PENSION_TOPFIN_GRP_LIST default");
  });
});
