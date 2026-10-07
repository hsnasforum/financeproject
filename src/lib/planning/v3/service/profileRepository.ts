import {
  createProfile as createStoredProfile,
  getProfile as getStoredProfile,
  getProfileUpdateSnapshot as getStoredProfileUpdateSnapshot,
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

export async function getCurrentUserProfileUpdateSnapshot(id: string): Promise<Awaited<ReturnType<typeof getStoredProfileUpdateSnapshot>>> {
  return getStoredProfileUpdateSnapshot(id);
}

export async function listCurrentUserProfileMetas(): Promise<Awaited<ReturnType<typeof listStoredProfileMetas>>> {
  return listStoredProfileMetas();
}
