import {
  createJournalEntry as createStoredJournalEntry,
  getJournalEntry as getStoredJournalEntry,
  listJournalEntries as listStoredJournalEntries,
  updateJournalEntry as updateStoredJournalEntry,
} from "../journal/store";

export type JournalEntryRecord = ReturnType<typeof getStoredJournalEntry>;
export type JournalEntryList = ReturnType<typeof listStoredJournalEntries>;
export type CreatedJournalEntryRecord = ReturnType<typeof createStoredJournalEntry>;
export type UpdatedJournalEntryRecord = ReturnType<typeof updateStoredJournalEntry>;

export function listCurrentUserJournalEntries(): JournalEntryList {
  return listStoredJournalEntries();
}

export function getCurrentUserJournalEntry(id: string): JournalEntryRecord {
  return getStoredJournalEntry(id);
}

export function createCurrentUserJournalEntry(input: unknown): CreatedJournalEntryRecord {
  return createStoredJournalEntry(input);
}

export function updateCurrentUserJournalEntry(id: string, input: unknown): UpdatedJournalEntryRecord {
  return updateStoredJournalEntry(id, input);
}
