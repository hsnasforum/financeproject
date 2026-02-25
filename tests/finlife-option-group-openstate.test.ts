import { describe, expect, it } from "vitest";
import { pruneOpen, toggleOpen } from "../src/lib/finlife/groupOpenState";

describe("finlife option group open state", () => {
  it("toggles one group key on and off", () => {
    const opened = toggleOpen({}, "P1");
    expect(opened).toEqual({ P1: true });

    const closed = toggleOpen(opened, "P1");
    expect(closed).toEqual({ P1: false });
  });

  it("prunes removed keys but keeps existing group state", () => {
    const prev = { P1: true, P2: false, P3: true };
    const next = pruneOpen(prev, ["P1", "P3"]);
    expect(next).toEqual({ P1: true, P3: true });
  });
});
