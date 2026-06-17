import {
  createDraftFromBatch as createStoredProfileDraftFromBatch,
  deleteProfileDraft as deleteStoredProfileDraft,
  getProfileDraft as getStoredProfileDraft,
  isGenerateDraftInputError,
  listProfileDrafts as listStoredProfileDrafts,
} from "../store/draftStore";

export { isGenerateDraftInputError };

export type ProfileDraftRecord = NonNullable<Awaited<ReturnType<typeof getStoredProfileDraft>>>;
export type ProfileDraftListRecord = Awaited<ReturnType<typeof listStoredProfileDrafts>>[number];

export async function createCurrentUserProfileDraftFromBatch(
  batchId: string,
): Promise<Awaited<ReturnType<typeof createStoredProfileDraftFromBatch>>> {
  return createStoredProfileDraftFromBatch(batchId);
}

export async function listCurrentUserProfileDrafts(): Promise<Awaited<ReturnType<typeof listStoredProfileDrafts>>> {
  return listStoredProfileDrafts();
}

export async function getCurrentUserProfileDraft(
  id: string,
): Promise<Awaited<ReturnType<typeof getStoredProfileDraft>>> {
  return getStoredProfileDraft(id);
}

export async function deleteCurrentUserProfileDraft(
  id: string,
): Promise<Awaited<ReturnType<typeof deleteStoredProfileDraft>>> {
  return deleteStoredProfileDraft(id);
}
