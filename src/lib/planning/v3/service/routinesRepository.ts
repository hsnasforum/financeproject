import {
  readDailyRoutineChecklist as readStoredDailyRoutineChecklist,
  saveDailyRoutineChecklist as saveStoredDailyRoutineChecklist,
} from "../routines/store";

export type DailyRoutineChecklistRecord = ReturnType<typeof readStoredDailyRoutineChecklist>;
export type SavedDailyRoutineChecklistRecord = ReturnType<typeof saveStoredDailyRoutineChecklist>;

export function readCurrentUserDailyRoutineChecklist(date: string): DailyRoutineChecklistRecord {
  return readStoredDailyRoutineChecklist(date);
}

export function saveCurrentUserDailyRoutineChecklist(input: unknown): SavedDailyRoutineChecklistRecord {
  return saveStoredDailyRoutineChecklist(input);
}
