export type PlanningAiSummary = {
  headline: string;
  paragraphs: string[];
};

export type PlanningAiSummaryInput = {
  verdictHeadline: string;
  primaryActionTitle?: string;
  primaryActionDescription?: string;
  diagnostics: Array<{ title: string; description: string }>;
  monthlyOperatingGuide?: {
    headline: string;
    basisLabel: string;
  };
};

export function buildFallbackPlanningAiSummary(input: PlanningAiSummaryInput): PlanningAiSummary {
  const paragraphs: string[] = [];
  paragraphs.push(input.verdictHeadline);

  if (input.monthlyOperatingGuide) {
    paragraphs.push(`${input.monthlyOperatingGuide.headline} ${input.monthlyOperatingGuide.basisLabel}`.trim());
  }

  if (input.primaryActionTitle) {
    const actionLine = input.primaryActionDescription
      ? `지금은 '${input.primaryActionTitle}'부터 처리하는 편이 좋습니다. ${input.primaryActionDescription}`
      : `지금은 '${input.primaryActionTitle}'부터 처리하는 편이 좋습니다.`;
    paragraphs.push(actionLine);
  }

  paragraphs.push(
    ...input.diagnostics
      .slice(0, 2)
      .map((diag) => `${diag.title} 기준으로 보면 ${diag.description}`),
  );

  return {
    headline: "맞춤 설명",
    paragraphs: paragraphs.filter((line) => line.trim().length > 0).slice(0, 4),
  };
}
