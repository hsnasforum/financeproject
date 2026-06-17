import {
  readExposureProfile as readStoredExposureProfile,
  saveExposureProfile as saveStoredExposureProfile,
} from "../exposure/store";

export type ExposureProfileRecord = ReturnType<typeof readStoredExposureProfile>;
export type SavedExposureProfileRecord = ReturnType<typeof saveStoredExposureProfile>;

export function readCurrentUserExposureProfile(): ExposureProfileRecord {
  return readStoredExposureProfile();
}

export function saveCurrentUserExposureProfile(input: unknown): SavedExposureProfileRecord {
  return saveStoredExposureProfile(input);
}
