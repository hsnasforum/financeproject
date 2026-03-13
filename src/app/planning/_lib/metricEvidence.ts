import { getAllocationPolicy } from "@/lib/planning/v2/policy/presets";
import { type AllocationPolicyId } from "@/lib/planning/v2/policy/types";
import { type ProfileV2 } from "@/lib/planning/v2/types";
import { type EvidenceItem } from "@/lib/planning/v2/insights/evidence";

type BuildMetricEvidenceArgs = {
  profile: ProfileV2;
  policyId: AllocationPolicyId;
};

function asFiniteNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function buildMetricEvidence(args: BuildMetricEvidenceArgs): EvidenceItem[] {
  const profile = args.profile;
  const incomeNet = Math.max(0, asFiniteNumber(profile.monthlyIncomeNet));
  const essential = Math.max(0, asFiniteNumber(profile.monthlyEssentialExpenses));
  const discretionary = Math.max(0, asFiniteNumber(profile.monthlyDiscretionaryExpenses));
  const monthlyExpenses = essential + discretionary;
  const liquidAssets = Math.max(0, asFiniteNumber(profile.liquidAssets));
  const totalMinDebtPayment = (Array.isArray(profile.debts) ? profile.debts : []).reduce((sum, debt) => {
    return sum + Math.max(0, asFiniteNumber(debt?.minimumPayment));
  }, 0);

  const monthlySurplus = incomeNet - essential - discretionary - totalMinDebtPayment;
  const dsrPct = incomeNet > 0 ? (totalMinDebtPayment / incomeNet) * 100 : undefined;

  const policy = getAllocationPolicy(args.policyId);
  const minEmergencyMonths = Math.max(0, asFiniteNumber(policy.rules.minEmergencyMonths));
  const emergencyTargetKrw = monthlyExpenses * minEmergencyMonths;
  const emergencyGapKrw = Math.max(0, emergencyTargetKrw - liquidAssets);
  const emergencyMonths = monthlyExpenses > 0 ? (liquidAssets / monthlyExpenses) : undefined;

  return [
    {
      id: "monthlySurplus",
      title: "월 잉여현금",
      formula: "incomeNet - essential - discretionary - minDebtPayment",
      inputs: [
        { label: "월 실수령", value: incomeNet, unitKind: "krw" },
        { label: "필수지출", value: essential, unitKind: "krw" },
        { label: "선택지출", value: discretionary, unitKind: "krw" },
        { label: "최소 월 부채상환 합계", value: totalMinDebtPayment, unitKind: "krw" },
        { label: "월 잉여현금", value: monthlySurplus, unitKind: "krw" },
      ],
      assumptions: [
        "월 단위, 입력값 기준",
      ],
    },
    {
      id: "dsrPct",
      title: "부채부담률(DSR)",
      formula: "totalMinDebtPayment / incomeNet * 100",
      inputs: [
        { label: "최소 월 부채상환 합계", value: totalMinDebtPayment, unitKind: "krw" },
        { label: "월 실수령", value: incomeNet, unitKind: "krw" },
        { label: "DSR", value: typeof dsrPct === "number" ? dsrPct : "N/A", unitKind: "pct" },
      ],
      assumptions: [
        "incomeNet<=0이면 계산 불가",
      ],
      ...(typeof dsrPct !== "number"
        ? { notes: ["월 실수령이 0 이하이면 DSR을 계산하지 않습니다."] }
        : {}),
    },
    {
      id: "emergency",
      title: "비상금 커버",
      formula: "target = monthlyExpenses * minEmergencyMonths; gap = max(0, target - liquidAssets); months = liquidAssets / monthlyExpenses",
      inputs: [
        { label: "월 지출(필수+선택)", value: monthlyExpenses, unitKind: "krw" },
        { label: "정책 최소 비상금 개월", value: minEmergencyMonths, unitKind: "months" },
        { label: "현금성 자산", value: liquidAssets, unitKind: "krw" },
        { label: "비상금 목표액", value: emergencyTargetKrw, unitKind: "krw" },
        { label: "비상금 부족분", value: emergencyGapKrw, unitKind: "krw" },
        { label: "현재 비상금 커버", value: typeof emergencyMonths === "number" ? emergencyMonths : "N/A", unitKind: "months" },
      ],
      assumptions: [
        `policy preset의 minEmergencyMonths 사용(${minEmergencyMonths}개월)`,
      ],
      ...(typeof emergencyMonths !== "number"
        ? { notes: ["월 지출이 0 이하이면 커버 개월을 계산하지 않습니다."] }
        : {}),
    },
  ];
}
