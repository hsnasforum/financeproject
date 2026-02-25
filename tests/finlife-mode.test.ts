import { describe, expect, it } from "vitest";
import { resolveFinlifeMode } from "../src/lib/finlife/mode";

describe("resolveFinlifeMode", () => {
  it("defaults to live when no replay flags are present", () => {
    const mode = resolveFinlifeMode({
      searchParams: new URLSearchParams(),
      env: {},
    });

    expect(mode).toBe("live");
  });

  it("uses replay when fromFile=1", () => {
    const mode = resolveFinlifeMode({
      searchParams: new URLSearchParams("fromFile=1"),
      env: {},
    });

    expect(mode).toBe("replay");
  });

  it("uses replay when replay=1", () => {
    const mode = resolveFinlifeMode({
      searchParams: new URLSearchParams("replay=1"),
      env: {},
    });

    expect(mode).toBe("replay");
  });

  it("uses replay when FINLIFE_REPLAY=1", () => {
    const mode = resolveFinlifeMode({
      searchParams: new URLSearchParams(),
      env: { FINLIFE_REPLAY: "1" },
    });

    expect(mode).toBe("replay");
  });
});
