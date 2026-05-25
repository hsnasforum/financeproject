export const REPORT_ADVANCED_RAW_DEFAULT_OPEN = false;

export type ReportAdvancedToggleReadinessInput = {
  clientReady: boolean;
  loading: boolean;
  runsCount: number;
  selectedRunId: string;
  hasSelectedRun: boolean;
};

export function resolveReportAdvancedToggleReady(input: ReportAdvancedToggleReadinessInput): boolean {
  if (!input.clientReady) return false;
  if (input.loading) return false;
  if (!input.selectedRunId.trim()) return false;
  if (!input.hasSelectedRun) return false;
  return input.runsCount > 0;
}
