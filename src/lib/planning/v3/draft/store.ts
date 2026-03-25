// CsvDraftRecord owner facade.
export {
  createDraft,
  createDraft as createCsvDraft,
  deleteDraft,
  deleteDraft as deleteCsvDraft,
  getDraft,
  getDraft as getCsvDraft,
  getDraft as getLegacyDraft,
  listDrafts,
  listDrafts as listCsvDrafts,
} from "../drafts/draftStore";

// DraftProfileRecord owner facade.
export {
  createDraftFromBatch,
  createDraftFromBatch as createProfileDraftFromBatch,
  deleteProfileDraft,
  getProfileDraft,
  isGenerateDraftInputError,
  listProfileDrafts,
} from "../store/draftStore";

// Shared bridge for preview/apply compatibility paths.
export {
  getDraft as getPreviewDraft,
  getDraft as getProfileDraftBridge,
} from "../store/draftStore";
