import {
  deleteDraft,
  getDraft,
  listDrafts,
  type DraftV1,
} from "../drafts/draftStore";

export type CsvDraftListRow = Pick<DraftV1, "id" | "createdAt" | "source" | "meta">;

export async function listCsvDrafts(): Promise<CsvDraftListRow[]> {
  return listDrafts();
}

export async function getCsvDraft(id: string): Promise<DraftV1 | null> {
  return getDraft(id);
}

export async function deleteCsvDraft(id: string): Promise<boolean> {
  return deleteDraft(id);
}
