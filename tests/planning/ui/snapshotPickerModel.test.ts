import { describe, expect, it } from "vitest";
import {
  buildSnapshotPickerSelectValue,
  getSnapshotDetailsToggleLabel,
  parseSnapshotPickerSelectValue,
  resolveSnapshotPickerSelectedItem,
} from "../../../src/app/planning/_lib/snapshotPickerModel";

describe("snapshotPickerModel", () => {
  it("builds and parses latest and history select values", () => {
    expect(buildSnapshotPickerSelectValue({ mode: "latest" })).toBe("latest");
    expect(buildSnapshotPickerSelectValue({ mode: "history", id: "snap-1" })).toBe("history:snap-1");
    expect(parseSnapshotPickerSelectValue("latest")).toEqual({ mode: "latest" });
    expect(parseSnapshotPickerSelectValue("history:snap-1")).toEqual({ mode: "history", id: "snap-1" });
  });

  it("ignores invalid select values", () => {
    expect(parseSnapshotPickerSelectValue("history:")).toBeNull();
    expect(parseSnapshotPickerSelectValue("manual")).toBeNull();
  });

  it("resolves the selected item from latest and history collections", () => {
    const latest = { id: "latest-snap" };
    const history = [{ id: "snap-1" }, { id: "snap-2" }];

    expect(resolveSnapshotPickerSelectedItem({ latest, history }, { mode: "latest" })).toEqual(latest);
    expect(resolveSnapshotPickerSelectedItem({ latest, history }, { mode: "history", id: "snap-2" })).toEqual(history[1]);
    expect(resolveSnapshotPickerSelectedItem({ latest, history }, { mode: "history", id: "missing" })).toBeUndefined();
  });

  it("returns the correct details button labels", () => {
    expect(getSnapshotDetailsToggleLabel(false)).toBe("Details");
    expect(getSnapshotDetailsToggleLabel(true)).toBe("Details 닫기");
  });
});
