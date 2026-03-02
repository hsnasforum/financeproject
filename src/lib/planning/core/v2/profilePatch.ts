import { PlanningV2ValidationError, type ProfileV2 } from "./types";

export type ScenarioPatchField =
  | "monthlyIncomeNet"
  | "monthlyEssentialExpenses"
  | "monthlyDiscretionaryExpenses";

export type ScenarioPatch =
  | {
    op: "mul" | "set";
    field: ScenarioPatchField;
    value: number;
  }
  | {
    op: "debt.mulMinimumPayment" | "debt.setMinimumPayment";
    debtId: string;
    value: number;
  };

function cloneProfile(profile: ProfileV2): ProfileV2 {
  if (typeof globalThis.structuredClone === "function") {
    return globalThis.structuredClone(profile);
  }
  return JSON.parse(JSON.stringify(profile)) as ProfileV2;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asFiniteNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function validatePatchShape(patch: unknown, index: number): void {
  if (!isRecord(patch)) {
    throw new PlanningV2ValidationError("Invalid scenario patch", [
      { path: `scenario.patch[${index}]`, message: "must be an object" },
    ]);
  }
  const value = asFiniteNumber(patch.value);
  if (value === null) {
    throw new PlanningV2ValidationError("Invalid scenario patch", [
      { path: `scenario.patch[${index}].value`, message: "must be a finite number" },
    ]);
  }
  const op = asString(patch.op);
  if (
    op !== "mul"
    && op !== "set"
    && op !== "debt.mulMinimumPayment"
    && op !== "debt.setMinimumPayment"
  ) {
    throw new PlanningV2ValidationError("Invalid scenario patch", [
      {
        path: `scenario.patch[${index}].op`,
        message: "must be one of mul|set|debt.mulMinimumPayment|debt.setMinimumPayment",
      },
    ]);
  }
  if (op === "mul" || op === "set") {
    const field = asString(patch.field);
    if (
      field !== "monthlyIncomeNet"
      && field !== "monthlyEssentialExpenses"
      && field !== "monthlyDiscretionaryExpenses"
    ) {
      throw new PlanningV2ValidationError("Invalid scenario patch", [
        {
          path: `scenario.patch[${index}].field`,
          message: "must be one of monthlyIncomeNet|monthlyEssentialExpenses|monthlyDiscretionaryExpenses",
        },
      ]);
    }
  } else {
    const debtId = asString(patch.debtId);
    if (!debtId) {
      throw new PlanningV2ValidationError("Invalid scenario patch", [
        {
          path: `scenario.patch[${index}].debtId`,
          message: "must be a non-empty string",
        },
      ]);
    }
  }
}

function assertMulFactor(factor: number, patchPath: string): void {
  if (!(factor > 0 && factor <= 2)) {
    throw new PlanningV2ValidationError("Invalid scenario patch", [
      { path: patchPath, message: "mul factor must be > 0 and <= 2" },
    ]);
  }
}

function assertNonNegative(nextValue: number, patchPath: string): void {
  if (!Number.isFinite(nextValue) || nextValue < 0) {
    throw new PlanningV2ValidationError("Invalid scenario patch", [
      { path: patchPath, message: "result must be >= 0" },
    ]);
  }
}

function applyRootPatch(
  profile: ProfileV2,
  patch: Extract<ScenarioPatch, { op: "mul" | "set" }>,
  index: number,
): void {
  const base = profile[patch.field];
  if (!Number.isFinite(base)) {
    throw new PlanningV2ValidationError("Invalid scenario patch", [
      { path: `scenario.patch[${index}].field`, message: "target field is not numeric" },
    ]);
  }
  if (patch.op === "mul") {
    assertMulFactor(patch.value, `scenario.patch[${index}].value`);
  }
  const next = patch.op === "set" ? patch.value : base * patch.value;
  assertNonNegative(next, `scenario.patch[${index}]`);
  profile[patch.field] = next;
}

function applyDebtPatch(
  profile: ProfileV2,
  patch: Extract<ScenarioPatch, { op: "debt.mulMinimumPayment" | "debt.setMinimumPayment" }>,
  index: number,
): void {
  const debtId = asString(patch.debtId);
  const debt = profile.debts.find((row) => asString(row.id) === debtId);
  if (!debt) {
    throw new PlanningV2ValidationError("Invalid scenario patch", [
      {
        path: `scenario.patch[${index}].debtId`,
        message: `debtId '${debtId}' not found`,
      },
    ]);
  }
  if (!Number.isFinite(debt.minimumPayment)) {
    throw new PlanningV2ValidationError("Invalid scenario patch", [
      {
        path: `scenario.patch[${index}].debtId`,
        message: "minimumPayment is not numeric",
      },
    ]);
  }
  if (patch.op === "debt.mulMinimumPayment") {
    assertMulFactor(patch.value, `scenario.patch[${index}].value`);
  }
  const next = patch.op === "debt.setMinimumPayment"
    ? patch.value
    : debt.minimumPayment * patch.value;
  assertNonNegative(next, `scenario.patch[${index}]`);
  debt.minimumPayment = next;
}

export function applyProfilePatch(profile: ProfileV2, patch: ScenarioPatch[]): ProfileV2 {
  const rows = Array.isArray(patch) ? patch : [];
  if (rows.length < 1) return cloneProfile(profile);
  const next = cloneProfile(profile);
  rows.forEach((entry, index) => {
    validatePatchShape(entry, index);
    if ("field" in entry) {
      applyRootPatch(next, entry, index);
      return;
    }
    applyDebtPatch(next, entry, index);
  });
  return next;
}
