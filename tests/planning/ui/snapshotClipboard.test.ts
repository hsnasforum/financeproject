import { describe, expect, it, vi } from "vitest";
import { copySnapshotIdToClipboard } from "../../../src/app/planning/_lib/snapshotClipboard";

describe("snapshotClipboard", () => {
  it("skips clipboard work for latest selection", async () => {
    const writeText = vi.fn();

    await expect(copySnapshotIdToClipboard({ mode: "latest" }, { writeText })).resolves.toBeNull();
    expect(writeText).not.toHaveBeenCalled();
  });

  it("returns a fallback message when clipboard api is unavailable", async () => {
    await expect(copySnapshotIdToClipboard({ mode: "history", id: "snap-1" })).resolves.toEqual({
      error: true,
      message: "클립보드 복사를 지원하지 않는 환경입니다.",
    });
  });

  it("writes snapshot id and returns success feedback", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);

    await expect(copySnapshotIdToClipboard({ mode: "history", id: "snap-1" }, { writeText })).resolves.toEqual({
      error: false,
      message: "snapshotId를 복사했습니다.",
    });
    expect(writeText).toHaveBeenCalledWith("snap-1");
  });

  it("returns failure feedback when clipboard write rejects", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("write failed"));

    await expect(copySnapshotIdToClipboard({ mode: "history", id: "snap-1" }, { writeText })).resolves.toEqual({
      error: true,
      message: "snapshotId 복사에 실패했습니다.",
    });
    expect(writeText).toHaveBeenCalledWith("snap-1");
  });
});
