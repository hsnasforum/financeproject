import {
  createProfile as createStoredProfile,
  getProfile as getStoredProfile,
  listProfileMetas as listStoredProfileMetas,
} from "../../store/profileStore";

export type ProfileRecord = Awaited<ReturnType<typeof getStoredProfile>>;
export type CreatedProfileRecord = Awaited<ReturnType<typeof createStoredProfile>>;
export type ProfileMetaRecord = Awaited<ReturnType<typeof listStoredProfileMetas>>[number];

export async function createCurrentUserProfile(
  input: Parameters<typeof createStoredProfile>[0],
): Promise<CreatedProfileRecord> {
  return createStoredProfile(input);
}

export async function getCurrentUserProfile(id: string): Promise<ProfileRecord> {
  return getStoredProfile(id);
}

export async function listCurrentUserProfileMetas(): Promise<Awaited<ReturnType<typeof listStoredProfileMetas>>> {
  return listStoredProfileMetas();
}
