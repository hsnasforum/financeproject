import { describe, expect, it } from "vitest";

import { createManualConfirmInput, verifyConfirm } from "@/lib/ops/confirm";

describe("manual destructive confirmation", () => {
  it("requires the user to enter the exact confirmation text", () => {
    const opened = createManualConfirmInput("DELETE run", "run-1");

    expect(opened).toEqual({
      expectedConfirm: "DELETE run run-1",
      confirmText: "",
    });
    expect(verifyConfirm(opened.confirmText, opened.expectedConfirm)).toBe(false);
    expect(verifyConfirm("DELETE run wrong", opened.expectedConfirm)).toBe(false);
    expect(verifyConfirm(opened.expectedConfirm, opened.expectedConfirm)).toBe(true);
  });

  it("starts blank again after a dialog is closed and reopened", () => {
    const firstOpen = createManualConfirmInput("EMPTY_TRASH", "all");
    const typed = { ...firstOpen, confirmText: firstOpen.expectedConfirm };
    const reopened = createManualConfirmInput("EMPTY_TRASH", "all");

    expect(verifyConfirm(typed.confirmText, typed.expectedConfirm)).toBe(true);
    expect(reopened.confirmText).toBe("");
    expect(verifyConfirm(reopened.confirmText, reopened.expectedConfirm)).toBe(false);
  });
});
