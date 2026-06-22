import { getCurrentUserShareReport } from "./repository";

export type CurrentUserShareReportMarkdownDownload = {
  markdown: string;
  filename: string;
};

export async function getCurrentUserShareReportMarkdownDownload(
  id: string,
): Promise<CurrentUserShareReportMarkdownDownload | null> {
  const report = await getCurrentUserShareReport(id);
  if (!report) return null;
  return {
    markdown: report.markdown,
    filename: `planning-share-${report.meta.id}.md`,
  };
}
