import { describe, expect, it } from "vitest";
import { __test__ } from "../src/lib/publicApis/providers/subscription";

describe("subscription endpoint branching", () => {
  it("selects apt/urbty/remndr endpoints and candidates", () => {
    expect(__test__.endpointByHouseType("apt")).toContain("getAPTLttotPblancDetail");
    expect(__test__.endpointByHouseType("urbty")).toContain("getUrbyOfctLttotPblancDetail");
    expect(__test__.endpointByHouseType("remndr")).toContain("getRemndrLttotPblancDetail");

    const urbtyCandidates = __test__.endpointCandidatesByHouseType("urbty");
    expect(Array.isArray(urbtyCandidates)).toBe(true);
    expect(urbtyCandidates.length).toBeGreaterThan(1);
  });
});
