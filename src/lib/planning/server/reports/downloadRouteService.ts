import { getCurrentUserReport } from "./repository";

export type CurrentUserReportMarkdownDownload = {
  markdown: string;
  filename: string;
};

export async function getCurrentUserReportMarkdownDownload(
  id: string,
): Promise<CurrentUserReportMarkdownDownload | null> {
  const report = await getCurrentUserReport(id);
  if (!report) return null;
  return {
    markdown: report.markdown,
    filename: `planning-report-${report.meta.id}.md`,
  };
}
