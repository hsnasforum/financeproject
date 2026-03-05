import { describe, expect, it } from "vitest";
import { computeBurst } from "./computeBurst";

describe("planning v3 news trend computeBurst", () => {
  it("baseline 0 -> today 3 => High", () => {
    const result = computeBurst({
      today: { count: 3 },
      last7: [{ count: 0 }, { count: 0 }, { count: 0 }, { count: 0 }, { count: 0 }, { count: 0 }, { count: 0 }],
    });
    expect(result.grade).toBe("High");
  });

  it("baseline 5 -> today 9 => High", () => {
    const result = computeBurst({
      today: { count: 9 },
      last7: [{ count: 5 }, { count: 5 }, { count: 5 }, { count: 5 }, { count: 5 }, { count: 5 }, { count: 5 }],
    });
    expect(result.grade).toBe("High");
  });

  it("baseline 5 -> today 7 => Med", () => {
    const result = computeBurst({
      today: { count: 7 },
      last7: [{ count: 5 }, { count: 5 }, { count: 5 }, { count: 5 }, { count: 5 }, { count: 5 }, { count: 5 }],
    });
    expect(result.grade).toBe("Med");
  });

  it("insufficient history => Unknown", () => {
    const result = computeBurst({
      today: { count: 8 },
      last7: [{ count: 5 }, { count: 5 }, { count: 5 }],
    });
    expect(result.grade).toBe("Unknown");
  });
});

