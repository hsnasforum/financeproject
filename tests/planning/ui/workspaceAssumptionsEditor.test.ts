import { describe, expect, it } from "vitest";
import {
  ASSUMPTIONS_FORM_DEFAULT,
  assumptionsFormToRecord,
  parseAssumptionsEditorJson,
  splitAssumptionsRecord,
} from "../../../src/app/planning/_lib/workspaceAssumptionsEditor";

describe("workspaceAssumptionsEditor", () => {
  it("splits assumptions form fields from extra overrides", () => {
    const split = splitAssumptionsRecord({
      inflation: 2.4,
      expectedReturnPct: 5.8,
      cashReturnPct: 1.9,
      withdrawalRatePct: 4.1,
      customOverride: true,
    });

    expect(split.form).toEqual({
      inflationPct: 2.4,
      expectedReturnPct: 5.8,
      cashReturnPct: 1.9,
      withdrawalRatePct: 4.1,
    });
    expect(split.extra).toEqual({
      customOverride: true,
    });
  });

  it("builds assumptions record with compatibility fields", () => {
    const record = assumptionsFormToRecord({
      inflationPct: 2.1,
      expectedReturnPct: 5.2,
      cashReturnPct: 1.8,
      withdrawalRatePct: 4.0,
    }, {
      customOverride: true,
    });

    expect(record).toEqual({
      customOverride: true,
      inflationPct: 2.1,
      expectedReturnPct: 5.2,
      cashReturnPct: 1.8,
      withdrawalRatePct: 4.0,
      inflation: 2.1,
      expectedReturn: 5.2,
      investReturnPct: 5.2,
    });
  });

  it("rebuilds minimal defaults into canonical record", () => {
    const split = splitAssumptionsRecord({
      inflationPct: 2.0,
      expectedReturnPct: 5.0,
    });
    const record = assumptionsFormToRecord(split.form, split.extra);

    expect(record).toEqual({
      inflationPct: 2.0,
      expectedReturnPct: 5.0,
      cashReturnPct: ASSUMPTIONS_FORM_DEFAULT.cashReturnPct,
      withdrawalRatePct: ASSUMPTIONS_FORM_DEFAULT.withdrawalRatePct,
      inflation: 2.0,
      expectedReturn: 5.0,
      investReturnPct: 5.0,
    });
  });

  it("parses editor json or returns a stable error", () => {
    const parsed = parseAssumptionsEditorJson(JSON.stringify({
      inflationPct: 2.3,
      expectedReturn: 4.9,
    }));
    const invalid = parseAssumptionsEditorJson("{invalid-json");

    expect(parsed).toMatchObject({
      ok: true,
      form: {
        inflationPct: 2.3,
        expectedReturnPct: 4.9,
        cashReturnPct: ASSUMPTIONS_FORM_DEFAULT.cashReturnPct,
        withdrawalRatePct: ASSUMPTIONS_FORM_DEFAULT.withdrawalRatePct,
      },
      extra: {},
    });
    expect(invalid).toEqual({
      ok: false,
      error: "가정 JSON 파싱 실패: 형식을 확인하세요.",
    });
  });
});
