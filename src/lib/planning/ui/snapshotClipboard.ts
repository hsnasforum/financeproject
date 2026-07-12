import { type SnapshotSelection } from "./snapshotSelection";

type ClipboardLike = {
  writeText?: (text: string) => Promise<void> | void;
} | null | undefined;

export type SnapshotClipboardResult = {
  error: boolean;
  message: string;
};

export async function copySnapshotIdToClipboard(
  selection: SnapshotSelection,
  clipboard?: ClipboardLike,
): Promise<SnapshotClipboardResult | null> {
  if (selection.mode !== "history") return null;
  if (!clipboard?.writeText) {
    return {
      error: true,
      message: "클립보드 복사를 지원하지 않는 환경입니다.",
    };
  }

  try {
    await clipboard.writeText(selection.id);
    return {
      error: false,
      message: "snapshotId를 복사했습니다.",
    };
  } catch {
    return {
      error: true,
      message: "snapshotId 복사에 실패했습니다.",
    };
  }
}
