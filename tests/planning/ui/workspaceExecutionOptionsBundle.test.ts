import { describe, expect, it } from "vitest";
import { ASSUMPTIONS_FORM_DEFAULT } from "../../../src/app/planning/_lib/workspaceAssumptionsEditor";
import {
  transitionWorkspaceExecutionOptionsForMode,
  type WorkspaceAdvancedExecutionOptions,
} from "../../../src/components/PlanningWorkspaceClient";
import {
  applyWorkspaceExecutionDisableState,
  buildAssumptionsJsonFromForm,
  buildDebtOffersJsonFromRows,
  loadWorkspaceBeginnerMode,
  parseWorkspaceAssumptionsJson,
  parseWorkspaceDebtOffersJson,
  persistWorkspaceBeginnerMode,
} from "../../../src/components/planning/workspace/useWorkspaceExecutionOptionsBundle";

function executionOptionsFixture(
  overrides?: Partial<WorkspaceAdvancedExecutionOptions>,
): WorkspaceAdvancedExecutionOptions {
  return {
    runScenariosEnabled: false,
    runMonteCarloEnabled: true,
    runActionsEnabled: true,
    runDebtEnabled: true,
    runOptimizeEnabled: true,
    includeProducts: true,
    ...overrides,
  };
}

function createStorageMock(seed?: Record<string, string>) {
  const values = new Map(Object.entries(seed ?? {}));
  return {
    getItem(key: string): string | null {
      return values.has(key) ? values.get(key) ?? null : null;
    },
    setItem(key: string, value: string): void {
      values.set(key, value);
    },
  };
}

describe("workspaceExecutionOptionsBundle", () => {
  it("loads and saves beginner mode through the existing storage key", () => {
    const storage = createStorageMock({
      "planning:v2:beginnerMode": "false",
    });

    expect(loadWorkspaceBeginnerMode(storage)).toBe(false);

    persistWorkspaceBeginnerMode(storage, true);

    expect(storage.getItem("planning:v2:beginnerMode")).toBe("true");
    expect(loadWorkspaceBeginnerMode(createStorageMock())).toBe(true);
  });

  it("restores saved advanced options when leaving beginner mode", () => {
    const snapshot = executionOptionsFixture({
      runScenariosEnabled: false,
      runMonteCarloEnabled: true,
      runActionsEnabled: false,
      runDebtEnabled: false,
      runOptimizeEnabled: true,
      includeProducts: true,
    });

    const transition = transitionWorkspaceExecutionOptionsForMode({
      beginnerMode: false,
      wasBeginnerMode: true,
      current: executionOptionsFixture({
        runScenariosEnabled: true,
        runMonteCarloEnabled: false,
        runActionsEnabled: true,
        runDebtEnabled: true,
        runOptimizeEnabled: false,
        includeProducts: false,
      }),
      snapshot,
    });

    expect(transition.nextState).toEqual(snapshot);
    expect(transition.nextSnapshot).toBeNull();
  });

  it("forces execution toggles off for health and server-disabled states", () => {
    expect(applyWorkspaceExecutionDisableState({
      current: executionOptionsFixture(),
      advancedActionsBlockedByHealth: true,
      monteCarloServerDisabled: true,
      includeProductsServerDisabled: true,
      optimizerServerDisabled: true,
    })).toEqual({
      runScenariosEnabled: false,
      runMonteCarloEnabled: false,
      runActionsEnabled: false,
      runDebtEnabled: true,
      runOptimizeEnabled: false,
      includeProducts: false,
    });
  });

  it("keeps assumptions form and json editor in sync", () => {
    const json = buildAssumptionsJsonFromForm({
      inflationPct: 2.1,
      expectedReturnPct: 5.2,
      cashReturnPct: 1.8,
      withdrawalRatePct: 4.0,
    }, {
      customOverride: true,
    });
    const parsed = parseWorkspaceAssumptionsJson(JSON.stringify({
      inflationPct: 2.3,
      expectedReturn: 4.9,
    }));
    const invalid = parseWorkspaceAssumptionsJson("{invalid-json");

    expect(JSON.parse(json)).toEqual({
      customOverride: true,
      inflationPct: 2.1,
      expectedReturnPct: 5.2,
      cashReturnPct: 1.8,
      withdrawalRatePct: 4.0,
      inflation: 2.1,
      expectedReturn: 5.2,
      investReturnPct: 5.2,
    });
    expect(parsed).toMatchObject({
      ok: true,
      assumptionsJsonError: "",
      assumptionsForm: {
        inflationPct: 2.3,
        expectedReturnPct: 4.9,
        cashReturnPct: ASSUMPTIONS_FORM_DEFAULT.cashReturnPct,
        withdrawalRatePct: ASSUMPTIONS_FORM_DEFAULT.withdrawalRatePct,
      },
      assumptionsExtraOverrides: {},
    });
    expect(invalid).toEqual({
      ok: false,
      assumptionsOverrideJson: "{invalid-json",
      assumptionsJsonError: "가정 JSON 파싱 실패: 형식을 확인하세요.",
    });
  });

  it("keeps debt offers rows and json editor in sync", () => {
    const json = buildDebtOffersJsonFromRows([
      {
        rowId: "offer-1",
        liabilityId: "loan-1",
        title: "Refi A",
        newAprPct: 5.4,
        feeKrw: 90_000,
      },
      {
        rowId: "offer-2",
        liabilityId: " ",
        title: "Ignored",
        newAprPct: 4.8,
        feeKrw: 50_000,
      },
    ]);
    const parsed = parseWorkspaceDebtOffersJson(JSON.stringify([
      {
        liabilityId: "loan-1",
        title: "Refi A",
        newAprPct: 5.4,
        feeKrw: 90_000,
      },
    ]));
    const invalid = parseWorkspaceDebtOffersJson("{invalid-json");

    expect(JSON.parse(json)).toEqual([
      {
        liabilityId: "loan-1",
        title: "Refi A",
        newAprPct: 5.4,
        feeKrw: 90_000,
      },
    ]);
    expect(parsed).toMatchObject({
      ok: true,
      debtOffersJsonError: "",
      debtOfferRows: [
        {
          rowId: "offer-1",
          liabilityId: "loan-1",
          title: "Refi A",
          newAprPct: 5.4,
          feeKrw: 90_000,
        },
      ],
    });
    expect(invalid).toEqual({
      ok: false,
      debtOffersJson: "{invalid-json",
      debtOffersJsonError: "리파이낸스 제안 JSON 파싱 실패: 형식을 확인하세요.",
    });
  });
});
