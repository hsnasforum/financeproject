import { afterEach, describe, expect, it, vi } from "vitest";

import {
  inputToMonthOffset,
  monthOffsetToInput,
} from "@/components/planning/workspace/panels/shared";
import {
  createDefaultProfileFormModel,
  hydrateProfileJsonEditorState,
  toProfileJson,
} from "@/lib/planning/ui/profileFormModel";

afterEach(() => {
  vi.useRealTimers();
});

describe("relative target month input", () => {
  it("keeps the same displayed and stored value when the wall clock changes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-15T03:00:00.000Z"));
    const firstDisplay = monthOffsetToInput(12);
    const firstStored = inputToMonthOffset(firstDisplay);

    vi.setSystemTime(new Date("2026-08-15T03:00:00.000Z"));
    const secondDisplay = monthOffsetToInput(12);
    const secondStored = inputToMonthOffset(secondDisplay);

    expect(firstDisplay).toBe("12");
    expect(secondDisplay).toBe(firstDisplay);
    expect(firstStored).toBe(12);
    expect(secondStored).toBe(12);
  });

  it("keeps targetMonth through save payload, stored record hydration, and reopened input", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-15T03:00:00.000Z"));
    const form = createDefaultProfileFormModel("목표 시점 저장 검증");
    form.goals = [{
      id: "goal-closeout",
      name: "독립 자금",
      targetAmount: 30_000_000,
      currentAmount: 2_000_000,
      targetMonth: inputToMonthOffset("36"),
      priority: 4,
      minimumMonthlyContribution: 300_000,
    }];
    const requestBody = JSON.parse(JSON.stringify({
      name: form.name,
      profile: toProfileJson(form),
    })) as { name: string; profile: ReturnType<typeof toProfileJson> };

    expect(requestBody.profile.goals[0]?.targetMonth).toBe(36);

    vi.setSystemTime(new Date("2026-11-15T03:00:00.000Z"));
    const storedRecord = {
      id: "profile-closeout",
      name: requestBody.name,
      profile: requestBody.profile,
    };
    const reopened = hydrateProfileJsonEditorState(storedRecord.profile, storedRecord.name);

    expect(reopened.form.goals[0]?.targetMonth).toBe(36);
    expect(monthOffsetToInput(reopened.form.goals[0]?.targetMonth ?? 0)).toBe("36");
  });
});
