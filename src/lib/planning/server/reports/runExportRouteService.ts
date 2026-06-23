import { resolveReportResultDtoFromRun } from "../../reports/reportInputContract";
import { type ResultDtoV1 } from "../../v2/resultDto";
import { getCurrentUserRun } from "../runs/repository";

export type CurrentUserRunResultExport = {
  resultDto: ResultDtoV1;
  filename: string;
};

export async function getCurrentUserRunResultExport(
  runId: string,
): Promise<CurrentUserRunResultExport | null> {
  const run = await getCurrentUserRun(runId);
  if (!run) return null;

  return {
    resultDto: resolveReportResultDtoFromRun(run),
    filename: `planning-run-result-${run.id}.json`,
  };
}
