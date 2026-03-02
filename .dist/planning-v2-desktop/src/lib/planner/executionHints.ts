import { type PlannerInput } from "@/lib/planner/metrics";

export function buildBenefitQueries(input: PlannerInput): string[] {
  const tags: string[] = [];
  if (input.goalName.includes("주거") || input.goalName.includes("내집")) tags.push("주거");
  if (input.goalName.includes("청년")) tags.push("청년");
  if (input.goalName.includes("취업")) tags.push("취업");
  if (input.goalName.includes("육아") || input.goalName.includes("출산")) tags.push("육아");
  if (tags.length === 0) tags.push("주거", "청년", "의료");
  return tags.slice(0, 3);
}

export function inferSubscriptionRegion(goalName: string): string {
  if (goalName.includes("부산")) return "부산";
  if (goalName.includes("대구")) return "대구";
  if (goalName.includes("인천")) return "인천";
  if (goalName.includes("대전")) return "대전";
  if (goalName.includes("광주")) return "광주";
  if (goalName.includes("울산")) return "울산";
  return "서울";
}
