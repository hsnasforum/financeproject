import { describe, expect, it } from "vitest";
import { selectRunRetentionTargets } from "../../src/lib/planning/store/runRetention";

describe("run retention target selection", () => {
  const entries = [
    { id: "alice-old", profileId: "alice", createdAt: "2026-01-01T00:00:00.000Z" },
    { id: "alice-new", profileId: "alice", createdAt: "2026-01-03T00:00:00.000Z" },
    { id: "alice-mid", profileId: "alice", createdAt: "2026-01-02T00:00:00.000Z" },
    { id: "bob-old", profileId: "bob", createdAt: "2026-01-01T00:00:00.000Z" },
    { id: "bob-new", profileId: "bob", createdAt: "2026-01-02T00:00:00.000Z" },
  ];

  it("keeps the newest runs per profile", () => {
    expect(selectRunRetentionTargets(entries, { maxPerProfile: 2 }).map((row) => row.id)).toEqual([
      "alice-old",
    ]);
  });

  it("limits deletion candidates to the requested profile", () => {
    expect(selectRunRetentionTargets(entries, { maxPerProfile: 1, profileId: "bob" }).map((row) => row.id)).toEqual([
      "bob-old",
    ]);
  });

  it("uses id order as a deterministic tie breaker", () => {
    const tied = [
      { id: "a", profileId: "same", createdAt: "invalid" },
      { id: "c", profileId: "same", createdAt: "invalid" },
      { id: "b", profileId: "same", createdAt: "invalid" },
    ];

    expect(selectRunRetentionTargets(tied, { maxPerProfile: 1 }).map((row) => row.id)).toEqual(["b", "a"]);
  });
});
