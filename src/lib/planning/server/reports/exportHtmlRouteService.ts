import { buildStandaloneReportArtifactsFromRun } from "../../reports/standaloneReportArtifacts";
import { getCurrentUserRun } from "../runs/repository";

export type CurrentUserRunStandaloneReportHtml = {
  html: string;
  filename: string;
};

export async function getCurrentUserRunStandaloneReportHtml(input: {
  runId: string;
  printView: boolean;
  styleNonce: string;
}): Promise<CurrentUserRunStandaloneReportHtml | null> {
  const run = await getCurrentUserRun(input.runId);
  if (!run) return null;

  const { html } = buildStandaloneReportArtifactsFromRun(run, {
    printView: input.printView,
    styleNonce: input.styleNonce,
  });

  return {
    html,
    filename: `planning-run-${run.id}-report.html`,
  };
}
