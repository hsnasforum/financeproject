"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  assumptionsFormToRecord,
  parseAssumptionsEditorJson,
  splitAssumptionsRecord,
  type AssumptionsFormModel,
} from "@/lib/planning/ui/workspaceAssumptionsEditor";
import {
  debtOfferRowsToPayload,
  parseDebtOffersEditorJson,
  parseDebtOffersFormRows,
  type DebtOfferFormRow,
} from "@/lib/planning/ui/workspaceDebtOffersEditor";
import { defaults as planningExecutionDefaults } from "@/lib/planning/ui/workspaceUiState";
import { type PlanningFeatureFlags } from "@/lib/planning/config";
import { type AllocationPolicyId } from "@/lib/planning/v2/policy/types";
import {
  transitionWorkspaceExecutionOptionsForMode,
  type WorkspaceAdvancedExecutionOptions,
} from "@/components/planning/workspace/executionOptions";

const DEFAULT_ASSUMPTIONS_OVERRIDE = `{
  "inflationPct": 2.0,
  "expectedReturnPct": 5.0
}`;

const DEFAULT_DEBT_OFFERS_JSON = `[
  { "liabilityId": "demo-loan-1", "newAprPct": 5.4, "feeKrw": 90000, "title": "Refi A" }
]`;

const DEFAULT_OPTIMIZER_CONSTRAINTS_JSON = `{
  "minEmergencyMonths": 3,
  "maxDebtServiceRatio": 0.6
}`;

const DEFAULT_OPTIMIZER_KNOBS_JSON = `{
  "maxMonthlyContributionKrw": 300000,
  "allowExtraDebtPayment": true,
  "allowInvestContribution": true
}`;

const DEFAULT_OPTIMIZER_SEARCH_JSON = `{
  "candidates": 20,
  "keepTop": 5,
  "seed": 12345
}`;

export const PLANNING_BEGINNER_MODE_KEY = "planning:v2:beginnerMode";

type WorkspaceExecutionOptionsBundleInput = {
  featureFlags: PlanningFeatureFlags;
  advancedActionsBlockedByHealth: boolean;
};

type StorageReader = Pick<Storage, "getItem">;
type StorageWriter = Pick<Storage, "setItem">;

export function loadWorkspaceBeginnerMode(
  storage: StorageReader,
  fallback = true,
): boolean {
  const stored = storage.getItem(PLANNING_BEGINNER_MODE_KEY);
  if (stored === "false") return false;
  if (stored === "true") return true;
  return fallback;
}

export function persistWorkspaceBeginnerMode(
  storage: StorageWriter,
  beginnerMode: boolean,
): void {
  storage.setItem(PLANNING_BEGINNER_MODE_KEY, beginnerMode ? "true" : "false");
}

export function applyWorkspaceExecutionDisableState(input: {
  current: WorkspaceAdvancedExecutionOptions;
  advancedActionsBlockedByHealth: boolean;
  monteCarloServerDisabled: boolean;
  includeProductsServerDisabled: boolean;
  optimizerServerDisabled: boolean;
}): WorkspaceAdvancedExecutionOptions {
  let next = input.current;

  if (input.advancedActionsBlockedByHealth) {
    next = {
      ...next,
      runMonteCarloEnabled: false,
      runActionsEnabled: false,
    };
  }
  if (input.monteCarloServerDisabled) {
    next = {
      ...next,
      runMonteCarloEnabled: false,
    };
  }
  if (input.includeProductsServerDisabled) {
    next = {
      ...next,
      includeProducts: false,
    };
  }
  if (input.optimizerServerDisabled) {
    next = {
      ...next,
      runOptimizeEnabled: false,
    };
  }

  return next;
}

export function buildAssumptionsJsonFromForm(
  nextForm: AssumptionsFormModel,
  nextExtra: Record<string, unknown>,
): string {
  return pretty(assumptionsFormToRecord(nextForm, nextExtra));
}

export function parseWorkspaceAssumptionsJson(nextJson: string): {
  ok: boolean;
  assumptionsOverrideJson: string;
  assumptionsJsonError: string;
  assumptionsForm?: AssumptionsFormModel;
  assumptionsExtraOverrides?: Record<string, unknown>;
} {
  const parsed = parseAssumptionsEditorJson(nextJson);
  if (!parsed.ok) {
    return {
      ok: false,
      assumptionsOverrideJson: nextJson,
      assumptionsJsonError: parsed.error,
    };
  }

  return {
    ok: true,
    assumptionsOverrideJson: nextJson,
    assumptionsJsonError: "",
    assumptionsForm: parsed.form,
    assumptionsExtraOverrides: parsed.extra,
  };
}

export function buildDebtOffersJsonFromRows(rows: DebtOfferFormRow[]): string {
  return pretty(debtOfferRowsToPayload(rows));
}

export function parseWorkspaceDebtOffersJson(nextJson: string): {
  ok: boolean;
  debtOffersJson: string;
  debtOffersJsonError: string;
  debtOfferRows?: DebtOfferFormRow[];
} {
  const parsed = parseDebtOffersEditorJson(nextJson);
  if (!parsed.ok) {
    return {
      ok: false,
      debtOffersJson: nextJson,
      debtOffersJsonError: parsed.error,
    };
  }

  return {
    ok: true,
    debtOffersJson: nextJson,
    debtOffersJsonError: "",
    debtOfferRows: parsed.rows,
  };
}

export function useWorkspaceExecutionOptionsBundle({
  featureFlags,
  advancedActionsBlockedByHealth,
}: WorkspaceExecutionOptionsBundleInput) {
  const safeDefaults = useMemo(() => planningExecutionDefaults(true), []);
  const initialAssumptionsSplit = useMemo(() => {
    const parsed = JSON.parse(DEFAULT_ASSUMPTIONS_OVERRIDE) as Record<string, unknown>;
    return splitAssumptionsRecord(parsed);
  }, []);
  const initialAssumptionsJson = useMemo(
    () => buildAssumptionsJsonFromForm(initialAssumptionsSplit.form, initialAssumptionsSplit.extra),
    [initialAssumptionsSplit],
  );
  const initialDebtOfferRows = useMemo(() => {
    const parsed = JSON.parse(DEFAULT_DEBT_OFFERS_JSON) as unknown[];
    return parseDebtOffersFormRows(parsed);
  }, []);

  const [beginnerMode, setBeginnerMode] = useState(true);
  const [beginnerModeLoaded, setBeginnerModeLoaded] = useState(false);
  const [policyId, setPolicyId] = useState<AllocationPolicyId>("balanced");
  const [horizonMonths, setHorizonMonths] = useState(safeDefaults.horizonMonths);
  const [runTitle, setRunTitle] = useState("기본 실행");
  const [assumptionsOverrideJson, setAssumptionsOverrideJson] = useState(initialAssumptionsJson);
  const [assumptionsJsonError, setAssumptionsJsonError] = useState("");
  const [assumptionsForm, setAssumptionsForm] = useState<AssumptionsFormModel>(initialAssumptionsSplit.form);
  const [assumptionsExtraOverrides, setAssumptionsExtraOverrides] = useState<Record<string, unknown>>(initialAssumptionsSplit.extra);
  const [runScenariosEnabled, setRunScenariosEnabled] = useState(safeDefaults.runScenariosEnabled);
  const [runMonteCarloEnabled, setRunMonteCarloEnabled] = useState(safeDefaults.runMonteCarloEnabled);
  const [runActionsEnabled, setRunActionsEnabled] = useState(safeDefaults.runActionsEnabled);
  const [runDebtEnabled, setRunDebtEnabled] = useState(safeDefaults.runDebtEnabled);
  const [runOptimizeEnabled, setRunOptimizeEnabled] = useState(safeDefaults.runOptimizeEnabled);
  const [includeProducts, setIncludeProducts] = useState(safeDefaults.includeProducts);
  const [maxCandidatesPerAction, setMaxCandidatesPerAction] = useState("5");
  const [monteCarloPaths, setMonteCarloPaths] = useState(safeDefaults.monteCarloPaths);
  const [monteCarloSeed, setMonteCarloSeed] = useState(safeDefaults.monteCarloSeed);
  const [debtExtraPaymentKrw, setDebtExtraPaymentKrw] = useState(safeDefaults.debtExtraPaymentKrw);
  const [debtOffersJson, setDebtOffersJson] = useState(DEFAULT_DEBT_OFFERS_JSON);
  const [debtOffersJsonError, setDebtOffersJsonError] = useState("");
  const [debtOfferRows, setDebtOfferRows] = useState<DebtOfferFormRow[]>(initialDebtOfferRows);
  const [optimizerConstraintsJson, setOptimizerConstraintsJson] = useState(DEFAULT_OPTIMIZER_CONSTRAINTS_JSON);
  const [optimizerKnobsJson, setOptimizerKnobsJson] = useState(DEFAULT_OPTIMIZER_KNOBS_JSON);
  const [optimizerSearchJson, setOptimizerSearchJson] = useState(DEFAULT_OPTIMIZER_SEARCH_JSON);

  const previousBeginnerModeRef = useRef(beginnerMode);
  const advancedExecutionOptionsRef = useRef<WorkspaceAdvancedExecutionOptions | null>(null);

  const monteCarloServerDisabled = !featureFlags.monteCarloEnabled;
  const includeProductsServerDisabled = !featureFlags.includeProductsEnabled;
  const optimizerServerDisabled = !featureFlags.optimizerEnabled;
  const effectiveRunScenariosEnabled = beginnerMode ? true : runScenariosEnabled;
  const effectiveRunMonteCarloEnabled = beginnerMode
    ? false
    : (runMonteCarloEnabled && !advancedActionsBlockedByHealth && !monteCarloServerDisabled);
  const effectiveRunActionsEnabled = (beginnerMode ? true : runActionsEnabled) && !advancedActionsBlockedByHealth;
  const effectiveRunDebtEnabled = beginnerMode ? true : runDebtEnabled;
  const effectiveIncludeProducts = beginnerMode ? false : includeProducts;

  useEffect(() => {
    const nextState = applyWorkspaceExecutionDisableState({
      current: {
        runScenariosEnabled,
        runMonteCarloEnabled,
        runActionsEnabled,
        runDebtEnabled,
        runOptimizeEnabled,
        includeProducts,
      },
      advancedActionsBlockedByHealth,
      monteCarloServerDisabled,
      includeProductsServerDisabled,
      optimizerServerDisabled,
    });

    const hasDisableStateChange = nextState.runMonteCarloEnabled !== runMonteCarloEnabled
      || nextState.runActionsEnabled !== runActionsEnabled
      || nextState.runOptimizeEnabled !== runOptimizeEnabled
      || nextState.includeProducts !== includeProducts;
    if (!hasDisableStateChange) return;

    const timeoutId = window.setTimeout(() => {
      if (nextState.runMonteCarloEnabled !== runMonteCarloEnabled) {
        setRunMonteCarloEnabled(nextState.runMonteCarloEnabled);
      }
      if (nextState.runActionsEnabled !== runActionsEnabled) {
        setRunActionsEnabled(nextState.runActionsEnabled);
      }
      if (nextState.runOptimizeEnabled !== runOptimizeEnabled) {
        setRunOptimizeEnabled(nextState.runOptimizeEnabled);
      }
      if (nextState.includeProducts !== includeProducts) {
        setIncludeProducts(nextState.includeProducts);
      }
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [
    includeProducts,
    includeProductsServerDisabled,
    monteCarloServerDisabled,
    optimizerServerDisabled,
    runActionsEnabled,
    runDebtEnabled,
    runMonteCarloEnabled,
    runOptimizeEnabled,
    runScenariosEnabled,
    advancedActionsBlockedByHealth,
  ]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      try {
        setBeginnerMode(loadWorkspaceBeginnerMode(window.localStorage));
      } catch {
        // ignore storage failures
      } finally {
        setBeginnerModeLoaded(true);
      }
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    if (!beginnerModeLoaded) return;
    try {
      persistWorkspaceBeginnerMode(window.localStorage, beginnerMode);
    } catch {
      // ignore storage failures
    }
  }, [beginnerMode, beginnerModeLoaded]);

  useEffect(() => {
    const transition = transitionWorkspaceExecutionOptionsForMode({
      beginnerMode,
      wasBeginnerMode: previousBeginnerModeRef.current,
      current: {
        runScenariosEnabled,
        runMonteCarloEnabled,
        runActionsEnabled,
        runDebtEnabled,
        runOptimizeEnabled,
        includeProducts,
      },
      snapshot: advancedExecutionOptionsRef.current,
    });
    previousBeginnerModeRef.current = beginnerMode;
    advancedExecutionOptionsRef.current = transition.nextSnapshot;
    if (!transition.nextState) return;
    setRunScenariosEnabled(transition.nextState.runScenariosEnabled);
    setRunMonteCarloEnabled(transition.nextState.runMonteCarloEnabled);
    setRunActionsEnabled(transition.nextState.runActionsEnabled);
    setRunDebtEnabled(transition.nextState.runDebtEnabled);
    setRunOptimizeEnabled(transition.nextState.runOptimizeEnabled);
    setIncludeProducts(transition.nextState.includeProducts);
  }, [
    beginnerMode,
    includeProducts,
    runActionsEnabled,
    runDebtEnabled,
    runMonteCarloEnabled,
    runOptimizeEnabled,
    runScenariosEnabled,
  ]);

  const syncAssumptionsJsonFromForm = useCallback((
    nextForm: AssumptionsFormModel,
    nextExtra: Record<string, unknown>,
  ): void => {
    setAssumptionsOverrideJson(buildAssumptionsJsonFromForm(nextForm, nextExtra));
    setAssumptionsJsonError("");
  }, []);

  const applyAssumptionsForm = useCallback((nextForm: AssumptionsFormModel): void => {
    setAssumptionsForm(nextForm);
    syncAssumptionsJsonFromForm(nextForm, assumptionsExtraOverrides);
  }, [assumptionsExtraOverrides, syncAssumptionsJsonFromForm]);

  const replaceAssumptionsFromJsonText = useCallback((nextJson: string): void => {
    const parsed = parseWorkspaceAssumptionsJson(nextJson);
    setAssumptionsOverrideJson(parsed.assumptionsOverrideJson);
    if (!parsed.ok || !parsed.assumptionsForm || !parsed.assumptionsExtraOverrides) {
      setAssumptionsJsonError(parsed.assumptionsJsonError);
      return;
    }
    setAssumptionsJsonError("");
    setAssumptionsForm(parsed.assumptionsForm);
    setAssumptionsExtraOverrides(parsed.assumptionsExtraOverrides);
  }, []);

  const updateAssumptionsField = useCallback(<K extends keyof AssumptionsFormModel>(
    key: K,
    value: AssumptionsFormModel[K],
  ): void => {
    const nextForm = {
      ...assumptionsForm,
      [key]: value,
    };
    applyAssumptionsForm(nextForm);
  }, [applyAssumptionsForm, assumptionsForm]);

  const syncDebtOfferJsonFromRows = useCallback((rows: DebtOfferFormRow[]): void => {
    setDebtOffersJson(buildDebtOffersJsonFromRows(rows));
    setDebtOffersJsonError("");
  }, []);

  const applyDebtOfferRows = useCallback((rows: DebtOfferFormRow[]): void => {
    setDebtOfferRows(rows);
    syncDebtOfferJsonFromRows(rows);
  }, [syncDebtOfferJsonFromRows]);

  const replaceDebtOffersFromJsonText = useCallback((nextJson: string): void => {
    const parsed = parseWorkspaceDebtOffersJson(nextJson);
    setDebtOffersJson(parsed.debtOffersJson);
    if (!parsed.ok || !parsed.debtOfferRows) {
      setDebtOffersJsonError(parsed.debtOffersJsonError);
      return;
    }
    setDebtOffersJsonError("");
    setDebtOfferRows(parsed.debtOfferRows);
  }, []);

  const addDebtOfferRow = useCallback((): void => {
    applyDebtOfferRows([
      ...debtOfferRows,
      {
        rowId: nextExecutionRowId("offer"),
        liabilityId: "",
        title: "",
        newAprPct: 0,
        feeKrw: 0,
      },
    ]);
  }, [applyDebtOfferRows, debtOfferRows]);

  const removeDebtOfferRow = useCallback((index: number): void => {
    applyDebtOfferRows(debtOfferRows.filter((_, rowIndex) => rowIndex !== index));
  }, [applyDebtOfferRows, debtOfferRows]);

  const updateDebtOfferRow = useCallback((index: number, nextRow: DebtOfferFormRow): void => {
    applyDebtOfferRows(debtOfferRows.map((row, rowIndex) => (rowIndex === index ? nextRow : row)));
  }, [applyDebtOfferRows, debtOfferRows]);

  return {
    beginnerMode,
    beginnerModeLoaded,
    setBeginnerMode,
    policyId,
    setPolicyId,
    horizonMonths,
    setHorizonMonths,
    runTitle,
    setRunTitle,
    assumptionsOverrideJson,
    assumptionsJsonError,
    assumptionsForm,
    assumptionsExtraOverrides,
    updateAssumptionsField,
    replaceAssumptionsFromJsonText,
    runScenariosEnabled,
    setRunScenariosEnabled,
    runMonteCarloEnabled,
    setRunMonteCarloEnabled,
    runActionsEnabled,
    setRunActionsEnabled,
    runDebtEnabled,
    setRunDebtEnabled,
    runOptimizeEnabled,
    setRunOptimizeEnabled,
    includeProducts,
    setIncludeProducts,
    maxCandidatesPerAction,
    setMaxCandidatesPerAction,
    monteCarloPaths,
    setMonteCarloPaths,
    monteCarloSeed,
    setMonteCarloSeed,
    debtExtraPaymentKrw,
    setDebtExtraPaymentKrw,
    debtOffersJson,
    debtOffersJsonError,
    debtOfferRows,
    addDebtOfferRow,
    removeDebtOfferRow,
    updateDebtOfferRow,
    replaceDebtOffersFromJsonText,
    optimizerConstraintsJson,
    setOptimizerConstraintsJson,
    optimizerKnobsJson,
    setOptimizerKnobsJson,
    optimizerSearchJson,
    setOptimizerSearchJson,
    monteCarloServerDisabled,
    includeProductsServerDisabled,
    optimizerServerDisabled,
    effectiveRunScenariosEnabled,
    effectiveRunMonteCarloEnabled,
    effectiveRunActionsEnabled,
    effectiveRunDebtEnabled,
    effectiveIncludeProducts,
  };
}

function nextExecutionRowId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function pretty(value: unknown): string {
  return JSON.stringify(value, null, 2);
}
