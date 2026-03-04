import { regime, pctChange, zscore } from "../indicators/analytics";
import { type SeriesSnapshot } from "../indicators/contracts";
import {
  type ScenarioTemplate,
  type ScenarioTriggerOp,
  type ScenarioTriggerStatus,
  type TriggerEvaluation,
} from "./contracts";

type TriggerEvaluationResult = {
  status: ScenarioTriggerStatus;
  rationale: string;
  evaluations: TriggerEvaluation[];
};

function asSnapshotMap(seriesSnapshots: SeriesSnapshot[]): Map<string, SeriesSnapshot> {
  const map = new Map<string, SeriesSnapshot>();
  for (const snapshot of seriesSnapshots) {
    map.set(snapshot.seriesId, snapshot);
  }
  return map;
}

function compareNumeric(value: number, op: ScenarioTriggerOp, threshold: number): boolean {
  if (op === "gt") return value > threshold;
  if (op === "gte") return value >= threshold;
  if (op === "lt") return value < threshold;
  if (op === "lte") return value <= threshold;
  if (op === "eq") return value === threshold;
  return value !== threshold;
}

function compareText(value: string, op: ScenarioTriggerOp, expected: string): boolean {
  if (op === "eq") return value === expected;
  if (op === "neq") return value !== expected;
  return false;
}

function evaluateSingleRule(
  template: ScenarioTemplate,
  rule: ScenarioTemplate["triggers"][number],
  snapshotMap: Map<string, SeriesSnapshot>,
): TriggerEvaluation {
  const snapshot = snapshotMap.get(rule.seriesId);
  if (!snapshot) {
    return {
      ruleId: rule.id,
      label: rule.label,
      status: "unknown",
      rationale: `${template.name}:${rule.label} 데이터가 없어 평가를 보류합니다.`,
    };
  }

  if (rule.view === "regime") {
    const value = regime(snapshot.observations, rule.window);
    const expected = rule.regimeValue ?? "unknown";
    if (value === "unknown") {
      return {
        ruleId: rule.id,
        label: rule.label,
        status: "unknown",
        rationale: `${template.name}:${rule.label} 추세 정보가 부족해 평가를 보류합니다.`,
      };
    }

    const met = compareText(value, rule.op, expected);
    return {
      ruleId: rule.id,
      label: rule.label,
      status: met ? "met" : "not_met",
      rationale: `${template.name}:${rule.label} 추세 ${value} 기준에서 ${met ? "충족" : "미충족"}으로 관찰됩니다.`,
    };
  }

  const metric = rule.view === "pctChange"
    ? pctChange(snapshot.observations, rule.window)
    : zscore(snapshot.observations, rule.window);

  if (metric === null || typeof rule.threshold !== "number") {
    return {
      ruleId: rule.id,
      label: rule.label,
      status: "unknown",
      rationale: `${template.name}:${rule.label} 관측치가 부족해 평가를 보류합니다.`,
    };
  }

  const met = compareNumeric(metric, rule.op, rule.threshold);
  return {
    ruleId: rule.id,
    label: rule.label,
    status: met ? "met" : "not_met",
    rationale: `${template.name}:${rule.label} 지표 흐름 기준에서 ${met ? "충족" : "미충족"}으로 관찰됩니다.`,
  };
}

function summarizeStatus(evaluations: TriggerEvaluation[]): ScenarioTriggerStatus {
  if (evaluations.some((row) => row.status === "not_met")) return "not_met";
  if (evaluations.some((row) => row.status === "unknown")) return "unknown";
  return "met";
}

function summarizeRationale(templateName: string, evaluations: TriggerEvaluation[]): string {
  let met = 0;
  let notMet = 0;
  let unknown = 0;

  for (const row of evaluations) {
    if (row.status === "met") met += 1;
    else if (row.status === "not_met") notMet += 1;
    else unknown += 1;
  }

  return `${templateName} 트리거 평가: 충족 ${met}건, 미충족 ${notMet}건, 보류 ${unknown}건.`;
}

export function evaluateTriggers(seriesSnapshots: SeriesSnapshot[], template: ScenarioTemplate): TriggerEvaluationResult {
  const snapshotMap = asSnapshotMap(seriesSnapshots);
  const evaluations = template.triggers.map((rule) => evaluateSingleRule(template, rule, snapshotMap));

  return {
    status: summarizeStatus(evaluations),
    rationale: summarizeRationale(template.name, evaluations),
    evaluations,
  };
}
