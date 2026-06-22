import { beforeEach, describe, expect, it, vi } from "vitest";
import { runAllowedFix } from "../../../src/lib/dev/runScript";
import {
  getOpsActionDefinition,
  previewOpsAction,
  runOpsAction,
} from "../../../src/lib/ops/actions/registry";
import { type OpsActionId } from "../../../src/lib/ops/actions/types";

vi.mock("../../../src/lib/dev/runScript", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/lib/dev/runScript")>();
  return {
    ...actual,
    runAllowedFix: vi.fn(),
  };
});

const sourceActions = [
  ["FINLIFE_SYNC_IF_STALE", "FINLIFE_SYNC_IF_STALE", "FinLife"],
  ["DATAGO_SYNC", "DATAGO_SYNC", "DataGo"],
  ["GOV24_SYNC_IF_STALE", "GOV24_SYNC_IF_STALE", "Gov24"],
  ["NEWS_REFRESH", "NEWS_REFRESH", "뉴스"],
  ["INDICATORS_REFRESH", "INDICATORS_REFRESH", "지표"],
] as const satisfies ReadonlyArray<readonly [OpsActionId, string, string]>;

describe("ops source refresh actions", () => {
  beforeEach(() => {
    vi.mocked(runAllowedFix).mockReset();
    vi.mocked(runAllowedFix).mockResolvedValue({
      ok: true,
      tookMs: 12,
      stdoutTail: "done",
      stderrTail: "",
    });
  });

  it("registers individual public source refresh actions", () => {
    for (const [actionId,, label] of sourceActions) {
      const definition = getOpsActionDefinition(actionId);

      expect(definition).toMatchObject({ id: actionId });
      expect(definition?.dangerous).toBeUndefined();
      expect(definition?.requirePreview).toBeUndefined();
      expect(definition?.title).toContain(label);
    }
  });

  it("previews source refresh actions without marking them as destructive", async () => {
    for (const [actionId,, label] of sourceActions) {
      const preview = await previewOpsAction(actionId, {});

      expect(preview.ok).toBe(true);
      expect(preview.summary.text).toContain(label);
    }
  });

  it("runs source refresh actions through the allowed fix catalog", async () => {
    for (const [actionId, fixId] of sourceActions) {
      const result = await runOpsAction(actionId, {});

      expect(result.ok).toBe(true);
      expect(result.data?.fixId).toBe(fixId);
    }

    expect(runAllowedFix).toHaveBeenCalledTimes(sourceActions.length);
    for (const [, fixId] of sourceActions) {
      expect(runAllowedFix).toHaveBeenCalledWith(fixId);
    }
  });
});
