import {
  createProfile,
  deleteProfile,
  getDefaultProfileId,
  getProfile,
  hardDeleteProfileFromTrash,
  listProfileMetas,
  listProfiles,
  listProfilesWithDefault,
  restoreProfileFromTrash,
  setDefaultProfile,
  updateProfile,
} from "../store/profileStore";
import { type PlanningProfileMeta, type PlanningProfileRecord } from "../store/types";
import { type ProfileV2 } from "../../v2/types";

export type CurrentUserPlanningProfileRecord = PlanningProfileRecord;
export type CurrentUserPlanningProfileMeta = PlanningProfileMeta;

export type CurrentUserPlanningProfileListWithDefault = {
  profiles: CurrentUserPlanningProfileRecord[];
  defaultProfileId?: string;
};

export async function listCurrentUserProfiles(): Promise<CurrentUserPlanningProfileRecord[]> {
  return listProfiles();
}

export async function listCurrentUserProfilesWithDefault(): Promise<CurrentUserPlanningProfileListWithDefault> {
  return listProfilesWithDefault();
}

export async function listCurrentUserProfileMetas(): Promise<CurrentUserPlanningProfileMeta[]> {
  return listProfileMetas();
}

export async function getCurrentUserDefaultProfileId(): Promise<string | undefined> {
  return getDefaultProfileId();
}

export async function setCurrentUserDefaultProfile(profileId: string): Promise<string> {
  return setDefaultProfile(profileId);
}

export async function getCurrentUserProfile(id: string): Promise<CurrentUserPlanningProfileRecord | null> {
  return getProfile(id);
}

export async function createCurrentUserProfile(input: {
  name: string;
  profile: ProfileV2;
}): Promise<CurrentUserPlanningProfileRecord> {
  return createProfile(input);
}

export async function updateCurrentUserProfile(
  id: string,
  patch: { name?: string; profile?: ProfileV2 },
): Promise<CurrentUserPlanningProfileRecord | null> {
  return updateProfile(id, patch);
}

export async function deleteCurrentUserProfile(id: string): Promise<boolean> {
  return deleteProfile(id);
}

export async function restoreCurrentUserProfileFromTrash(id: string): Promise<boolean> {
  return restoreProfileFromTrash(id);
}

export async function hardDeleteCurrentUserProfileFromTrash(id: string): Promise<boolean> {
  return hardDeleteProfileFromTrash(id);
}
