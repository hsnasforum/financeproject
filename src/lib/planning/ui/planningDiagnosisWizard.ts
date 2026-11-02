import { isApiBaseResponse } from "@/lib/http/apiContract";
import { roundKrw } from "@/lib/planning/calc";
import { appendProfileIdQuery, normalizeProfileId } from "@/lib/planning/profileScope";
import { type PlanningRunOverallStatus } from "@/lib/planning/store/types";
import {
  estimateDebtMonthlyPaymentKrw,
  summarizeProfileForm,
  toProfileJson,
  validateProfileForm,
  type ProfileFormDebt,
  type ProfileFormGoal,
  type ProfileFormModel,
} from "@/lib/planning/ui/profileFormModel";
import { suggestProfileNormalizations } from "@/lib/planning/v2/normalizeProfile";
import { parsePlanningRunHorizonMonthsText } from "@/lib/planning/v2/planningRunInputContract";
import { type ProfileV2 } from "@/lib/planning/v2/types";

export type DiagnosisStep = 1 | 2 | 3 | 4 | 5;
export type DiagnosisChoice = "" | "none" | "some";

export type DiagnosisDebtDraft = {
  id: string;
  name: string;
  balance: string;
  aprPct: string;
  monthlyPayment: string;
  remainingMonths: string;
  repaymentType: "" | ProfileFormDebt["repaymentType"];
};

export type DiagnosisGoalDraft = {
  id: string;
  name: string;
  targetAmount: string;
  currentAmount: string;
  targetMonth: string;
  priority: string;
  minimumMonthlyContribution: string;
};

export type DiagnosisDraft = {
  profileName: string;
  birthYear: string;
  gender: string;
  sido: string;
  sigungu: string;
  monthlyIncomeNet: string;
  monthlyEssentialExpenses: string;
  monthlyDiscretionaryExpenses: string;
  liquidAssets: string;
  investmentAssets: string;
  debtChoice: DiagnosisChoice;
  debts: DiagnosisDebtDraft[];
  goalChoice: DiagnosisChoice;
  goals: DiagnosisGoalDraft[];
  horizonMonths: string;
};

export type DiagnosisTextField = Exclude<keyof DiagnosisDraft, "debtChoice" | "debts" | "goalChoice" | "goals">;

export type DiagnosisIssue = {
  fieldId: string;
  label: string;
  message: string;
  kind: "missing" | "invalid" | "range";
};

export type DiagnosisStage = "profile" | "run" | "report";

export type DiagnosisSubmissionState = {
  status: "idle" | "running" | "complete" | "rejected" | "partial" | "unknown";
  stage: DiagnosisStage | null;
  failedStage: DiagnosisStage | null;
  profileId: string;
  runId: string;
  reportId: string;
  runStatus: PlanningRunOverallStatus | "";
  message: string;
};

export type DiagnosisSessionState = {
  draft: DiagnosisDraft;
  step: DiagnosisStep;
  exampleLoaded: boolean;
  attemptedStep: number;
  confirmedWarnings: string | null;
  submission: DiagnosisSubmissionState;
};

export type DiagnosisAction =
  | { type: "setField"; field: DiagnosisTextField; value: string }
  | { type: "setDebtChoice"; value: DiagnosisChoice }
  | { type: "setGoalChoice"; value: DiagnosisChoice }
  | { type: "addDebt" }
  | { type: "updateDebt"; index: number; patch: Partial<DiagnosisDebtDraft> }
  | { type: "removeDebt"; index: number }
  | { type: "addGoal" }
  | { type: "updateGoal"; index: number; patch: Partial<DiagnosisGoalDraft> }
  | { type: "removeGoal"; index: number }
  | { type: "loadExample" }
  | { type: "goToStep"; step: DiagnosisStep }
  | { type: "attemptStep"; step: DiagnosisStep }
  | { type: "confirmWarnings"; signature: string | null }
  | { type: "reset" }
  | { type: "submissionStarted" }
  | { type: "submissionProgress"; patch: Partial<DiagnosisSubmissionState> };

export type PlanningWriteResult<T> =
  | { status: "ok"; record: T }
  | { status: "failed"; message: string; recordId?: string }
  | { status: "unknown"; message: string; recordId?: string };

export type DiagnosisRunRecord = {
  id: string;
  overallStatus?: PlanningRunOverallStatus;
};

export type DiagnosisGuard = {
  blockers: string[];
  warnings: string[];
  signature: string;
};

export type DiagnosisSubmitDeps = {
  saveProfile: (input: { name: string; profile: ProfileV2 }) => Promise<PlanningWriteResult<{ id: string }>>;
  runDiagnosis: (profileId: string) => Promise<PlanningWriteResult<DiagnosisRunRecord>>;
  saveReport: (runId: string) => Promise<PlanningWriteResult<{ id: string }>>;
};

export type DiagnosisSubmission =
  | { ok: true; name: string; form: ProfileFormModel; profile: ProfileV2; warnings: string[] }
  | { ok: false; issues: DiagnosisIssue[] };

export type DiagnosisSummaryRow = {
  label: string;
  value: string;
};

export const DIAGNOSIS_STEPS: ReadonlyArray<{ step: DiagnosisStep; title: string }> = [
  { step: 1, title: "기본 정보" },
  { step: 2, title: "수입·지출" },
  { step: 3, title: "자산·부채" },
  { step: 4, title: "목표" },
  { step: 5, title: "확인·실행" },
];

export const DIAGNOSIS_STAGE_LABELS: Record<DiagnosisStage, string> = {
  profile: "프로필 저장",
  run: "진단 실행",
  report: "리포트 보관",
};

export const DIAGNOSIS_FIELD_LABELS: Record<DiagnosisTextField, string> = {
  profileName: "프로필 이름",
  birthYear: "출생연도",
  gender: "성별",
  sido: "시/도",
  sigungu: "시/군/구",
  monthlyIncomeNet: "월 실수령 (원)",
  monthlyEssentialExpenses: "필수지출 (원)",
  monthlyDiscretionaryExpenses: "재량지출(선택지출) (원)",
  liquidAssets: "현금(예금) (원)",
  investmentAssets: "투자자산 (원)",
  horizonMonths: "분석 기간 (개월)",
};

export const DIAGNOSIS_UNCLEAR_SAVE_MESSAGE = "서버 응답을 확인하지 못해 저장 여부를 알 수 없습니다. 같은 내용을 다시 보내지 않았습니다.";

const DIAGNOSIS_LEAVE_MESSAGE = "저장하지 않은 재무 진단 입력이 있습니다. 이 페이지를 나가면 입력이 사라집니다.";

const MISSING_MESSAGE = "이 칸을 입력해 주세요.";
const INVALID_NUMBER_MESSAGE = "숫자로 입력해 주세요.";
const DEBT_MONTHS_MAX = 600;
const GOAL_MONTHS_MAX = 1200;
const GOAL_PRIORITY_MAX = 5;
const GOAL_PRIORITY_DEFAULT = 3;

const EMPTY_FORM: ProfileFormModel = {
  name: "",
  monthlyIncomeNet: 0,
  monthlyEssentialExpenses: 0,
  monthlyDiscretionaryExpenses: 0,
  liquidAssets: 0,
  investmentAssets: 0,
  debts: [],
  goals: [],
};

// Synthetic household; never a real person's values and never written anywhere by loading it.
export const DIAGNOSIS_EXAMPLE_DRAFT: DiagnosisDraft = {
  profileName: "예시 1인 가구",
  birthYear: "",
  gender: "",
  sido: "",
  sigungu: "",
  monthlyIncomeNet: "4,100,000",
  monthlyEssentialExpenses: "2,000,000",
  monthlyDiscretionaryExpenses: "700,000",
  liquidAssets: "20,000,000",
  investmentAssets: "30,000,000",
  debtChoice: "some",
  debts: [{
    id: "debt-1",
    name: "예시 주거대출",
    balance: "60,000,000",
    aprPct: "4.5",
    monthlyPayment: "621,830",
    remainingMonths: "120",
    repaymentType: "amortizing",
  }],
  goalChoice: "some",
  goals: [{
    id: "goal-1",
    name: "예시 목돈 마련",
    targetAmount: "30,000,000",
    currentAmount: "0",
    targetMonth: "36",
    priority: "3",
    minimumMonthlyContribution: "0",
  }],
  horizonMonths: "120",
};

export function createEmptyDiagnosisDraft(): DiagnosisDraft {
  return {
    profileName: "",
    birthYear: "",
    gender: "",
    sido: "",
    sigungu: "",
    monthlyIncomeNet: "",
    monthlyEssentialExpenses: "",
    monthlyDiscretionaryExpenses: "",
    liquidAssets: "",
    investmentAssets: "",
    debtChoice: "",
    debts: [],
    goalChoice: "",
    goals: [],
    horizonMonths: "",
  };
}

export function diagnosisFieldId(field: DiagnosisTextField | "debtChoice" | "goalChoice" | "debtAdd" | "goalAdd"): string {
  return `diagnosis-field-${field}`;
}

export function diagnosisDebtFieldId(index: number, field: keyof Omit<DiagnosisDebtDraft, "id">): string {
  return `diagnosis-debt-${index}-${field}`;
}

export function diagnosisGoalFieldId(index: number, field: keyof Omit<DiagnosisGoalDraft, "id">): string {
  return `diagnosis-goal-${index}-${field}`;
}

export type DiagnosisNumberParse =
  | { kind: "blank" }
  | { kind: "invalid" }
  | { kind: "value"; value: number };

export function parseDiagnosisNumber(text: string): DiagnosisNumberParse {
  const normalized = text.replaceAll(",", "").trim();
  if (!normalized) return { kind: "blank" };
  if (!/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(normalized)) return { kind: "invalid" };
  const value = Number(normalized);
  return Number.isFinite(value) ? { kind: "value", value } : { kind: "invalid" };
}

function requireText(issues: DiagnosisIssue[], fieldId: string, label: string, text: string): void {
  if (!text.trim()) issues.push({ fieldId, label, message: MISSING_MESSAGE, kind: "missing" });
}

function requireNumber(issues: DiagnosisIssue[], fieldId: string, label: string, text: string): number | null {
  const parsed = parseDiagnosisNumber(text);
  if (parsed.kind === "blank") {
    issues.push({ fieldId, label, message: MISSING_MESSAGE, kind: "missing" });
    return null;
  }
  if (parsed.kind === "invalid") {
    issues.push({ fieldId, label, message: INVALID_NUMBER_MESSAGE, kind: "invalid" });
    return null;
  }
  return parsed.value;
}

function checkWholeRange(
  issues: DiagnosisIssue[],
  fieldId: string,
  label: string,
  value: number | null,
  max: number,
): void {
  if (value === null || (Number.isInteger(value) && value >= 1 && value <= max)) return;
  issues.push({ fieldId, label, message: `1~${max} 사이의 정수로 입력해 주세요.`, kind: "range" });
}

function rangeIssues(form: ProfileFormModel, resolveField: (message: string) => DiagnosisIssue["fieldId"]): DiagnosisIssue[] {
  return validateProfileForm(form).errors.map((message) => {
    const text = message.replace("APR", "연이율");
    return { fieldId: resolveField(message), label: text, message: text, kind: "range" as const };
  });
}

function validateBasicStep(draft: DiagnosisDraft): DiagnosisIssue[] {
  const issues: DiagnosisIssue[] = [];
  requireText(issues, diagnosisFieldId("profileName"), DIAGNOSIS_FIELD_LABELS.profileName, draft.profileName);
  const birthYear = parseDiagnosisNumber(draft.birthYear);
  if (birthYear.kind === "invalid" || (birthYear.kind === "value" && !Number.isInteger(birthYear.value))) {
    issues.push({
      fieldId: diagnosisFieldId("birthYear"),
      label: DIAGNOSIS_FIELD_LABELS.birthYear,
      message: INVALID_NUMBER_MESSAGE,
      kind: "invalid",
    });
  } else if (birthYear.kind === "value") {
    issues.push(...rangeIssues({ ...EMPTY_FORM, birthYear: birthYear.value }, () => diagnosisFieldId("birthYear")));
  }
  return issues;
}

const AMOUNT_ERROR_FIELDS: ReadonlyArray<[string, DiagnosisTextField]> = [
  ["월 실수령", "monthlyIncomeNet"],
  ["필수지출", "monthlyEssentialExpenses"],
  ["선택지출", "monthlyDiscretionaryExpenses"],
  ["현금성 자산", "liquidAssets"],
  ["투자자산", "investmentAssets"],
];

function amountFieldFor(message: string): string {
  const field = AMOUNT_ERROR_FIELDS.find(([label]) => message.startsWith(label))?.[1];
  return diagnosisFieldId(field ?? "monthlyIncomeNet");
}

function validateCashflowStep(draft: DiagnosisDraft): DiagnosisIssue[] {
  const issues: DiagnosisIssue[] = [];
  const monthlyIncomeNet = requireNumber(issues, diagnosisFieldId("monthlyIncomeNet"), DIAGNOSIS_FIELD_LABELS.monthlyIncomeNet, draft.monthlyIncomeNet);
  const monthlyEssentialExpenses = requireNumber(issues, diagnosisFieldId("monthlyEssentialExpenses"), DIAGNOSIS_FIELD_LABELS.monthlyEssentialExpenses, draft.monthlyEssentialExpenses);
  const monthlyDiscretionaryExpenses = requireNumber(issues, diagnosisFieldId("monthlyDiscretionaryExpenses"), DIAGNOSIS_FIELD_LABELS.monthlyDiscretionaryExpenses, draft.monthlyDiscretionaryExpenses);
  if (monthlyIncomeNet === null || monthlyEssentialExpenses === null || monthlyDiscretionaryExpenses === null) return issues;
  return rangeIssues({ ...EMPTY_FORM, monthlyIncomeNet, monthlyEssentialExpenses, monthlyDiscretionaryExpenses }, amountFieldFor);
}

function debtRowToForm(row: DiagnosisDebtDraft): ProfileFormDebt {
  return {
    id: row.id,
    name: row.name.trim(),
    balance: requiredValue(row.balance),
    aprPct: requiredValue(row.aprPct),
    monthlyPayment: requiredValue(row.monthlyPayment),
    remainingMonths: requiredValue(row.remainingMonths),
    repaymentType: row.repaymentType === "interestOnly" ? "interestOnly" : "amortizing",
  };
}

function goalRowToForm(row: DiagnosisGoalDraft): ProfileFormGoal {
  return {
    id: row.id,
    name: row.name.trim(),
    targetAmount: requiredValue(row.targetAmount),
    currentAmount: requiredValue(row.currentAmount),
    targetMonth: requiredValue(row.targetMonth),
    priority: optionalValue(row.priority, GOAL_PRIORITY_DEFAULT),
    minimumMonthlyContribution: optionalValue(row.minimumMonthlyContribution, 0),
  };
}

// Blank is rejected here on purpose: reaching a form value means the user answered it.
function requiredValue(text: string): number {
  const parsed = parseDiagnosisNumber(text);
  if (parsed.kind !== "value") throw new Error("입력하지 않은 값은 저장할 수 없습니다.");
  return parsed.value;
}

function optionalValue(text: string, fallback: number): number {
  return parseDiagnosisNumber(text).kind === "blank" ? fallback : requiredValue(text);
}

function debtFieldFor(message: string): string {
  const row = Number(/^부채 (\d+):/.exec(message)?.[1] ?? 1) - 1;
  if (message.includes("월 상환액")) return diagnosisDebtFieldId(row, "monthlyPayment");
  if (message.includes("APR")) return diagnosisDebtFieldId(row, "aprPct");
  if (message.includes("잔여개월")) return diagnosisDebtFieldId(row, "remainingMonths");
  if (message.includes("잔액")) return diagnosisDebtFieldId(row, "balance");
  return diagnosisDebtFieldId(row, "name");
}

function validateAssetStep(draft: DiagnosisDraft): DiagnosisIssue[] {
  const issues: DiagnosisIssue[] = [];
  const liquidAssets = requireNumber(issues, diagnosisFieldId("liquidAssets"), DIAGNOSIS_FIELD_LABELS.liquidAssets, draft.liquidAssets);
  const investmentAssets = requireNumber(issues, diagnosisFieldId("investmentAssets"), DIAGNOSIS_FIELD_LABELS.investmentAssets, draft.investmentAssets);

  if (!draft.debtChoice) {
    issues.push({ fieldId: diagnosisFieldId("debtChoice"), label: "부채 여부", message: "부채가 있는지 선택해 주세요.", kind: "missing" });
  } else if (draft.debtChoice === "some") {
    if (draft.debts.length < 1) {
      issues.push({ fieldId: diagnosisFieldId("debtAdd"), label: "부채 항목", message: "부채를 1건 이상 추가해 주세요.", kind: "missing" });
    }
    draft.debts.forEach((row, index) => {
      const prefix = `부채 ${index + 1} `;
      requireText(issues, diagnosisDebtFieldId(index, "name"), `${prefix}이름`, row.name);
      requireNumber(issues, diagnosisDebtFieldId(index, "balance"), `${prefix}잔액`, row.balance);
      requireNumber(issues, diagnosisDebtFieldId(index, "aprPct"), `${prefix}연이율`, row.aprPct);
      requireNumber(issues, diagnosisDebtFieldId(index, "monthlyPayment"), `${prefix}월상환액`, row.monthlyPayment);
      const months = requireNumber(issues, diagnosisDebtFieldId(index, "remainingMonths"), `${prefix}잔여개월`, row.remainingMonths);
      checkWholeRange(issues, diagnosisDebtFieldId(index, "remainingMonths"), `${prefix}잔여개월`, months, DEBT_MONTHS_MAX);
      requireText(issues, diagnosisDebtFieldId(index, "repaymentType"), `${prefix}상환방식`, row.repaymentType);
    });
  }
  if (issues.length > 0 || liquidAssets === null || investmentAssets === null) return issues;

  const debts = draft.debtChoice === "some" ? draft.debts.map(debtRowToForm) : [];
  return rangeIssues({ ...EMPTY_FORM, liquidAssets, investmentAssets, debts }, (message) => (
    message.startsWith("부채") ? debtFieldFor(message) : amountFieldFor(message)
  ));
}

function goalFieldFor(message: string): string {
  const row = Number(/^목표 (\d+):/.exec(message)?.[1] ?? 1) - 1;
  if (message.includes("목표액")) return diagnosisGoalFieldId(row, "targetAmount");
  if (message.includes("현재금액")) return diagnosisGoalFieldId(row, "currentAmount");
  if (message.includes("목표월")) return diagnosisGoalFieldId(row, "targetMonth");
  if (message.includes("우선순위")) return diagnosisGoalFieldId(row, "priority");
  if (message.includes("최소월적립")) return diagnosisGoalFieldId(row, "minimumMonthlyContribution");
  return diagnosisGoalFieldId(row, "name");
}

function validateGoalStep(draft: DiagnosisDraft): DiagnosisIssue[] {
  const issues: DiagnosisIssue[] = [];
  if (!draft.goalChoice) {
    issues.push({ fieldId: diagnosisFieldId("goalChoice"), label: "목표 여부", message: "목표가 있는지 선택해 주세요.", kind: "missing" });
    return issues;
  }
  if (draft.goalChoice === "none") return issues;
  if (draft.goals.length < 1) {
    issues.push({ fieldId: diagnosisFieldId("goalAdd"), label: "목표 항목", message: "목표를 1건 이상 추가해 주세요.", kind: "missing" });
    return issues;
  }
  draft.goals.forEach((row, index) => {
    const prefix = `목표 ${index + 1} `;
    requireText(issues, diagnosisGoalFieldId(index, "name"), `${prefix}이름`, row.name);
    requireNumber(issues, diagnosisGoalFieldId(index, "targetAmount"), `${prefix}목표액`, row.targetAmount);
    requireNumber(issues, diagnosisGoalFieldId(index, "currentAmount"), `${prefix}현재액`, row.currentAmount);
    const months = requireNumber(issues, diagnosisGoalFieldId(index, "targetMonth"), `${prefix}기간`, row.targetMonth);
    checkWholeRange(issues, diagnosisGoalFieldId(index, "targetMonth"), `${prefix}기간`, months, GOAL_MONTHS_MAX);

    const priority = parseDiagnosisNumber(row.priority);
    if (priority.kind === "invalid") {
      issues.push({ fieldId: diagnosisGoalFieldId(index, "priority"), label: `${prefix}우선순위`, message: INVALID_NUMBER_MESSAGE, kind: "invalid" });
    } else if (priority.kind === "value") {
      checkWholeRange(issues, diagnosisGoalFieldId(index, "priority"), `${prefix}우선순위`, priority.value, GOAL_PRIORITY_MAX);
    }
    if (parseDiagnosisNumber(row.minimumMonthlyContribution).kind === "invalid") {
      issues.push({ fieldId: diagnosisGoalFieldId(index, "minimumMonthlyContribution"), label: `${prefix}최소납입`, message: INVALID_NUMBER_MESSAGE, kind: "invalid" });
    }
  });
  if (issues.length > 0) return issues;
  return rangeIssues({ ...EMPTY_FORM, goals: draft.goals.map(goalRowToForm) }, goalFieldFor);
}

function validateConfirmStep(draft: DiagnosisDraft): DiagnosisIssue[] {
  const issues: DiagnosisIssue[] = [];
  const label = DIAGNOSIS_FIELD_LABELS.horizonMonths;
  const fieldId = diagnosisFieldId("horizonMonths");
  if (requireNumber(issues, fieldId, label, draft.horizonMonths) === null) return issues;
  if (parsePlanningRunHorizonMonthsText(draft.horizonMonths.replaceAll(",", "").trim()) === null) {
    issues.push({ fieldId, label, message: "분석 기간은 1~1200개월 사이여야 합니다.", kind: "range" });
  }
  return issues;
}

export function validateDiagnosisStep(draft: DiagnosisDraft, step: DiagnosisStep): DiagnosisIssue[] {
  if (step === 1) return validateBasicStep(draft);
  if (step === 2) return validateCashflowStep(draft);
  if (step === 3) return validateAssetStep(draft);
  if (step === 4) return validateGoalStep(draft);
  return validateConfirmStep(draft);
}

export function buildDiagnosisProfileForm(draft: DiagnosisDraft): ProfileFormModel {
  const birthYear = parseDiagnosisNumber(draft.birthYear);
  return {
    name: draft.profileName.trim(),
    ...(birthYear.kind === "value" ? { birthYear: birthYear.value } : {}),
    ...(draft.gender === "F" || draft.gender === "M" ? { gender: draft.gender } : {}),
    ...(draft.sido ? { sido: draft.sido } : {}),
    ...(draft.sigungu ? { sigungu: draft.sigungu } : {}),
    monthlyIncomeNet: requiredValue(draft.monthlyIncomeNet),
    monthlyEssentialExpenses: requiredValue(draft.monthlyEssentialExpenses),
    monthlyDiscretionaryExpenses: requiredValue(draft.monthlyDiscretionaryExpenses),
    liquidAssets: requiredValue(draft.liquidAssets),
    investmentAssets: requiredValue(draft.investmentAssets),
    debts: draft.debtChoice === "some" ? draft.debts.map(debtRowToForm) : [],
    goals: draft.goalChoice === "some" ? draft.goals.map(goalRowToForm) : [],
  };
}

export function buildDiagnosisSubmission(draft: DiagnosisDraft): DiagnosisSubmission {
  const issues = DIAGNOSIS_STEPS.flatMap(({ step }) => validateDiagnosisStep(draft, step));
  if (issues.length > 0) return { ok: false, issues };
  try {
    const form = buildDiagnosisProfileForm(draft);
    const profile = toProfileJson(form);
    const warnings = [
      ...validateProfileForm(form).warnings.map((warning) => warning.replace(/^[A-Z_]+: /, "")),
      ...suggestProfileNormalizations(profile).map((suggestion) => suggestion.message),
    ];
    return { ok: true, name: form.name, form, profile, warnings };
  } catch (error) {
    const message = error instanceof Error ? error.message : "입력값을 확인해 주세요.";
    return {
      ok: false,
      issues: [{ fieldId: diagnosisFieldId("profileName"), label: message, message, kind: "invalid" }],
    };
  }
}

export function estimateDiagnosisDebtPayment(row: DiagnosisDebtDraft): number | null {
  if (!row.repaymentType) return null;
  const balance = parseDiagnosisNumber(row.balance);
  const aprPct = parseDiagnosisNumber(row.aprPct);
  const remainingMonths = parseDiagnosisNumber(row.remainingMonths);
  if (balance.kind !== "value" || aprPct.kind !== "value" || remainingMonths.kind !== "value") return null;
  return estimateDebtMonthlyPaymentKrw({
    id: row.id,
    name: row.name,
    balance: balance.value,
    aprPct: aprPct.value,
    monthlyPayment: 0,
    remainingMonths: remainingMonths.value,
    repaymentType: row.repaymentType,
  });
}

function formatKrw(value: number): string {
  return `${new Intl.NumberFormat("ko-KR").format(roundKrw(value))}원`;
}

export function buildDiagnosisSummary(draft: DiagnosisDraft): DiagnosisSummaryRow[] {
  const form = buildDiagnosisProfileForm(draft);
  const summary = summarizeProfileForm(form);
  const debtTotal = form.debts.reduce((sum, debt) => sum + debt.balance, 0);
  return [
    { label: "프로필 이름", value: form.name },
    { label: "월 실수령", value: formatKrw(form.monthlyIncomeNet) },
    { label: "필수지출", value: formatKrw(form.monthlyEssentialExpenses) },
    { label: "재량지출", value: formatKrw(form.monthlyDiscretionaryExpenses) },
    { label: "현금(예금)", value: formatKrw(form.liquidAssets) },
    { label: "투자자산", value: formatKrw(form.investmentAssets) },
    {
      label: "부채",
      value: form.debts.length > 0
        ? `${form.debts.length}건 · 잔액 ${formatKrw(debtTotal)} · 월상환 ${formatKrw(summary.estimatedMonthlyDebtPaymentKrw)}`
        : "없음",
    },
    {
      label: "목표",
      value: form.goals.length > 0 ? `${form.goals.length}건 · ${form.goals.map((goal) => goal.name).join(", ")}` : "없음",
    },
    { label: "월 운영여유", value: formatKrw(summary.monthlySurplusKrw - summary.estimatedMonthlyDebtPaymentKrw) },
  ];
}

export function listDiagnosisAppliedDefaults(draft: DiagnosisDraft): string[] {
  if (draft.goalChoice !== "some") return [];
  return draft.goals.flatMap((goal) => [
    ...(parseDiagnosisNumber(goal.priority).kind === "blank" ? [`${goal.name}: 우선순위 ${GOAL_PRIORITY_DEFAULT}`] : []),
    ...(parseDiagnosisNumber(goal.minimumMonthlyContribution).kind === "blank" ? [`${goal.name}: 최소납입 0원`] : []),
  ]);
}

function createInitialSubmission(): DiagnosisSubmissionState {
  return {
    status: "idle",
    stage: null,
    failedStage: null,
    profileId: "",
    runId: "",
    reportId: "",
    runStatus: "",
    message: "",
  };
}

export function createInitialDiagnosisState(): DiagnosisSessionState {
  return {
    draft: createEmptyDiagnosisDraft(),
    step: 1,
    exampleLoaded: false,
    attemptedStep: 0,
    confirmedWarnings: null,
    submission: createInitialSubmission(),
  };
}

function isDraftLocked(state: DiagnosisSessionState): boolean {
  return state.submission.status !== "idle" && state.submission.status !== "rejected";
}

function nextRowId(prefix: string, rows: Array<{ id: string }>): string {
  const used = rows.map((row) => Number(row.id.slice(prefix.length + 1))).filter(Number.isFinite);
  return `${prefix}-${Math.max(0, ...used) + 1}`;
}

function reduceDraft(draft: DiagnosisDraft, action: DiagnosisAction): DiagnosisDraft {
  switch (action.type) {
    case "setField":
      return {
        ...draft,
        [action.field]: action.value,
        ...(action.field === "sido" ? { sigungu: "" } : {}),
      };
    case "setDebtChoice":
      return { ...draft, debtChoice: action.value };
    case "setGoalChoice":
      return { ...draft, goalChoice: action.value };
    case "addDebt":
      return {
        ...draft,
        debts: [...draft.debts, {
          id: nextRowId("debt", draft.debts),
          name: "",
          balance: "",
          aprPct: "",
          monthlyPayment: "",
          remainingMonths: "",
          repaymentType: "",
        }],
      };
    case "updateDebt":
      return {
        ...draft,
        debts: draft.debts.map((row, index) => (index === action.index ? { ...row, ...action.patch } : row)),
      };
    case "removeDebt":
      return { ...draft, debts: draft.debts.filter((_, index) => index !== action.index) };
    case "addGoal":
      return {
        ...draft,
        goals: [...draft.goals, {
          id: nextRowId("goal", draft.goals),
          name: "",
          targetAmount: "",
          currentAmount: "",
          targetMonth: "",
          priority: "",
          minimumMonthlyContribution: "",
        }],
      };
    case "updateGoal":
      return {
        ...draft,
        goals: draft.goals.map((row, index) => (index === action.index ? { ...row, ...action.patch } : row)),
      };
    case "removeGoal":
      return { ...draft, goals: draft.goals.filter((_, index) => index !== action.index) };
    default:
      return draft;
  }
}

export function reduceDiagnosisState(state: DiagnosisSessionState, action: DiagnosisAction): DiagnosisSessionState {
  switch (action.type) {
    case "reset":
      return state.submission.status === "running" ? state : createInitialDiagnosisState();
    case "submissionStarted":
      return { ...state, submission: { ...createInitialSubmission(), status: "running", stage: "profile" } };
    case "submissionProgress":
      return { ...state, submission: { ...state.submission, ...action.patch } };
    default:
      break;
  }
  if (isDraftLocked(state)) return state;
  switch (action.type) {
    case "loadExample":
      return {
        ...state,
        draft: structuredClone(DIAGNOSIS_EXAMPLE_DRAFT),
        exampleLoaded: true,
        confirmedWarnings: null,
      };
    case "goToStep":
      return { ...state, step: action.step };
    case "attemptStep":
      return { ...state, attemptedStep: Math.max(state.attemptedStep, action.step) };
    case "confirmWarnings":
      return { ...state, confirmedWarnings: action.signature };
    default:
      return { ...state, draft: reduceDraft(state.draft, action) };
  }
}

export function resolveDiagnosisNext(
  state: DiagnosisSessionState,
): { advance: true; nextStep: DiagnosisStep } | { advance: false; focusFieldId: string } {
  const firstIssue = validateDiagnosisStep(state.draft, state.step)[0];
  if (firstIssue) return { advance: false, focusFieldId: firstIssue.fieldId };
  if (state.step >= 5) return { advance: false, focusFieldId: "" };
  return { advance: true, nextStep: (state.step + 1) as DiagnosisStep };
}

export function isDiagnosisDirty(state: DiagnosisSessionState): boolean {
  if (state.submission.status === "complete") return false;
  if (state.exampleLoaded) return true;
  const { debts, goals, ...texts } = state.draft;
  return debts.length > 0 || goals.length > 0 || Object.values(texts).some((value) => value.trim().length > 0);
}

export function syncDiagnosisBeforeUnload(
  target: Pick<EventTarget, "addEventListener" | "removeEventListener">,
  dirty: boolean,
): () => void {
  if (!dirty) return () => undefined;
  const warn = (event: Event): void => {
    event.preventDefault();
    (event as BeforeUnloadEvent).returnValue = DIAGNOSIS_LEAVE_MESSAGE;
  };
  target.addEventListener("beforeunload", warn);
  return () => target.removeEventListener("beforeunload", warn);
}

export function resolvePlanningWorkspaceEntry(input: {
  initialSelectedProfileId: string;
  view: string | null | undefined;
  beginnerMode: boolean;
  beginnerModeLoaded: boolean;
}): "wizard" | "full" | "pending" {
  if (input.view === "full" || normalizeProfileId(input.initialSelectedProfileId)) return "full";
  if (!input.beginnerModeLoaded) return "pending";
  return input.beginnerMode ? "wizard" : "full";
}

// Lives only in this tab's memory: it survives leaving the screen, not a reload, and is written
// from browser event handlers only, so a server render always sees the blank state.
export function createDiagnosisSessionStore() {
  const serverState = createInitialDiagnosisState();
  const listeners = new Set<() => void>();
  let state = createInitialDiagnosisState();

  return {
    getState: (): DiagnosisSessionState => state,
    getServerState: (): DiagnosisSessionState => serverState,
    subscribe: (listener: () => void): (() => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispatch: (action: DiagnosisAction): void => {
      const next = reduceDiagnosisState(state, action);
      if (next === state) return;
      state = next;
      listeners.forEach((listener) => listener());
    },
  };
}

export type DiagnosisSessionStore = ReturnType<typeof createDiagnosisSessionStore>;

export const planningDiagnosisSession = createDiagnosisSessionStore();

export function canStartDiagnosisSubmission(state: DiagnosisSessionState, guard: DiagnosisGuard): boolean {
  if (state.submission.status !== "idle" && state.submission.status !== "rejected") return false;
  if (state.submission.reportId) return false;
  if (guard.blockers.length > 0) return false;
  return guard.signature === "" || state.confirmedWarnings === guard.signature;
}

export function canResetDiagnosis(state: DiagnosisSessionState, acknowledged: boolean): boolean {
  const { status } = state.submission;
  if (status === "running") return false;
  return status === "partial" || status === "unknown" ? acknowledged : true;
}

export function classifyPlanningWriteResponse<T extends { id?: string }>(input: {
  response: Pick<Response, "ok" | "status">;
  payload: unknown;
  message: string;
}): PlanningWriteResult<T & { id: string }> {
  const { response, payload, message } = input;
  if (!isApiBaseResponse(payload)) return { status: "unknown", message: DIAGNOSIS_UNCLEAR_SAVE_MESSAGE };
  if (response.ok && payload.ok) {
    const record = (payload as { data?: T }).data;
    return record?.id
      ? { status: "ok", record: record as T & { id: string } }
      : { status: "unknown", message: DIAGNOSIS_UNCLEAR_SAVE_MESSAGE };
  }
  const rejected = response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429;
  return rejected ? { status: "failed", message } : { status: "unknown", message: DIAGNOSIS_UNCLEAR_SAVE_MESSAGE };
}

async function settleWrite<T>(write: () => Promise<PlanningWriteResult<T>>): Promise<PlanningWriteResult<T>> {
  try {
    return await write();
  } catch {
    return { status: "unknown", message: DIAGNOSIS_UNCLEAR_SAVE_MESSAGE };
  }
}

// One explicit click, three writes in order. Nothing here resends, resumes or rolls back: a stop
// keeps the confirmed ids and the submitted draft for the existing screens to take over.
export async function submitDiagnosisDraft(input: {
  store: DiagnosisSessionStore;
  guard: DiagnosisGuard;
  deps: DiagnosisSubmitDeps;
}): Promise<void> {
  const { store, guard, deps } = input;
  const state = store.getState();
  if (!canStartDiagnosisSubmission(state, guard)) return;
  const submission = buildDiagnosisSubmission(state.draft);
  if (!submission.ok) return;

  store.dispatch({ type: "submissionStarted" });
  const finish = (patch: Partial<DiagnosisSubmissionState>): void => {
    store.dispatch({ type: "submissionProgress", patch: { stage: null, ...patch } });
  };

  const profile = await settleWrite(() => deps.saveProfile({ name: submission.name, profile: submission.profile }));
  if (profile.status !== "ok") {
    finish({
      status: profile.status === "failed" ? "rejected" : "unknown",
      failedStage: "profile",
      message: profile.message,
    });
    return;
  }
  const profileId = profile.record.id;
  store.dispatch({ type: "submissionProgress", patch: { profileId, stage: "run" } });

  const run = await settleWrite(() => deps.runDiagnosis(profileId));
  if (run.status !== "ok") {
    finish({
      status: run.status === "failed" ? "partial" : "unknown",
      failedStage: "run",
      runId: run.recordId ?? "",
      message: run.message,
    });
    return;
  }
  const runId = run.record.id;
  store.dispatch({
    type: "submissionProgress",
    patch: { runId, runStatus: run.record.overallStatus ?? "", stage: "report" },
  });

  const report = await settleWrite(() => deps.saveReport(runId));
  if (report.status !== "ok") {
    finish({
      status: report.status === "failed" ? "partial" : "unknown",
      failedStage: "report",
      message: report.message,
    });
    return;
  }
  finish({ status: "complete", reportId: report.record.id });
}

export function buildDiagnosisResultLinks(submission: Pick<DiagnosisSubmissionState, "profileId" | "runId" | "reportId">) {
  const { profileId, runId, reportId } = submission;
  return {
    reportHref: reportId ? `/planning/reports/${encodeURIComponent(reportId)}` : "",
    runHref: runId
      ? appendProfileIdQuery(`/planning/runs?selected=${encodeURIComponent(runId)}`, profileId)
      : appendProfileIdQuery("/planning/runs", profileId),
    profileHref: profileId ? appendProfileIdQuery("/planning", profileId) : "/planning?view=full#planning-input-section",
  };
}
