import { beforeEach, describe, expect, it } from "vitest";
import { clearSingleflightForTest, singleflight } from "../src/lib/cache/singleflight";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("singleflight", () => {
  beforeEach(() => {
    clearSingleflightForTest();
  });

  it("shares one in-flight promise for the same key", async () => {
    let calls = 0;

    const run = () => singleflight("same", async () => {
      calls += 1;
      await sleep(20);
      return 42;
    });

    const [a, b, c] = await Promise.all([run(), run(), run()]);

    expect(a).toBe(42);
    expect(b).toBe(42);
    expect(c).toBe(42);
    expect(calls).toBe(1);
  });

  it("runs again after the first promise is settled", async () => {
    let calls = 0;

    const first = await singleflight("once", async () => {
      calls += 1;
      return "first";
    });

    const second = await singleflight("once", async () => {
      calls += 1;
      return "second";
    });

    expect(first).toBe("first");
    expect(second).toBe("second");
    expect(calls).toBe(2);
  });
});
