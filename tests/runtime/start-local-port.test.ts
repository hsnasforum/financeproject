import { describe, expect, it } from "vitest";
import { buildPortCandidates, choosePort } from "../../scripts/start_local_port.mjs";

describe("start:local port selection helper", () => {
  it("builds candidates with preferred port first", () => {
    const candidates = buildPortCandidates({
      preferredPort: 3100,
      scanFrom: 3101,
      scanTo: 3105,
    });
    expect(candidates).toEqual([3100, 3101, 3102, 3103, 3104, 3105]);
  });

  it("returns the first available port", async () => {
    const candidates = [3100, 3101, 3102];
    const chosen = await choosePort(candidates, async (port) => port === 3102);
    expect(chosen).toBe(3102);
  });

  it("returns 0 when no candidate is available", async () => {
    const chosen = await choosePort([3100, 3101], async () => false);
    expect(chosen).toBe(0);
  });
});

