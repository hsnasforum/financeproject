import { describe, expect, it } from "vitest";
import {
  resolveWorkspaceQuickStartAppliedNotice,
  resolveWorkspaceWizardAppliedNotice,
} from "../../../src/components/planning/workspace/useWorkspaceQuickStartHandoff";

describe("workspaceQuickStartHandoff", () => {
  it("keeps quickstart and wizard follow-through notices stable", () => {
    expect(resolveWorkspaceWizardAppliedNotice()).toBe("위저드 결과를 적용했습니다. 필요 시 값을 조정한 뒤 저장하세요.");
    expect(resolveWorkspaceQuickStartAppliedNotice("profile-1")).toBe(
      "간단 시작 입력을 적용했습니다. 현재 프로필과 편집값이 달라졌을 수 있으니 저장 여부를 먼저 확인하고 첫 실행으로 이어가세요.",
    );
    expect(resolveWorkspaceQuickStartAppliedNotice("")).toBe(
      "간단 시작 입력을 적용했습니다. 다음 단계는 프로필 저장이며, 저장 뒤 첫 실행과 결과 저장을 거쳐 리포트를 확인할 수 있습니다.",
    );
  });
});
