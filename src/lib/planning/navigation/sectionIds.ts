export const REPORT_SECTION_IDS = {
  interpretation: "interpretation",
  warnings: "warnings",
  evidence: "evidence",
  candidates: "candidates",
} as const;

export const RUN_SECTION_IDS = {
  actionCenter: "action-center",
} as const;

export type ReportSectionId = (typeof REPORT_SECTION_IDS)[keyof typeof REPORT_SECTION_IDS];
export type RunSectionId = (typeof RUN_SECTION_IDS)[keyof typeof RUN_SECTION_IDS];

export function toHashHref(sectionId: string): `#${string}` {
  return `#${sectionId}`;
}
