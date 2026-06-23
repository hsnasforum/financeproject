import { buildStandaloneReportArtifactsFromRun } from "../../../../app/planning/reports/_lib/standaloneReportArtifacts";
import { getCurrentUserRun } from "../runs/repository";

export type CurrentUserRunReportHtml = {
  html: string;
  htmlFilename: string;
  pdfFilename: string;
};

export async function getCurrentUserRunReportHtml(input: {
  runId: string;
  printView?: boolean;
}): Promise<CurrentUserRunReportHtml | null> {
  const run = await getCurrentUserRun(input.runId);
  if (!run) return null;

  const { html } = buildStandaloneReportArtifactsFromRun(run, {
    printView: input.printView ?? false,
  });

  return {
    html,
    htmlFilename: `planning-run-report-${run.id}.html`,
    pdfFilename: `planning-run-${run.id}.pdf`,
  };
}
