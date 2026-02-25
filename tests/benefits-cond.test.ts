import { describe, expect, it } from "vitest";
import { __test__ } from "../src/lib/publicApis/providers/benefits";

describe("benefits cond params", () => {
  it("builds service name LIKE cond", () => {
    const conds = __test__.buildBenefitsConds("주거", "name");
    expect(conds["cond[서비스명::LIKE]"]).toBe("주거");
  });

  it("builds service field LIKE cond", () => {
    const conds = __test__.buildBenefitsConds("청년", "field");
    expect(conds["cond[서비스분야::LIKE]"]).toBe("청년");
  });
});

