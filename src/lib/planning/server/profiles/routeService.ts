import { append as appendAuditLog } from "../../../audit/auditLogStore";
import { loadCanonicalProfile } from "../../v2/loadCanonicalProfile";
import { type ProfileV2 } from "../../v2/types";
import {
  createCurrentUserProfile,
  deleteCurrentUserProfile,
  getCurrentUserDefaultProfileId,
  getCurrentUserProfile,
  listCurrentUserProfileMetas,
  listCurrentUserProfiles,
  setCurrentUserDefaultProfile,
  updateCurrentUserProfile,
  type CurrentUserPlanningProfileRecord,
} from "./repository";

export type CurrentUserProfileMetaRow = {
  profileId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  isDefault: boolean;
};

export type CurrentUserProfileListMetaRowsResult = {
  rows: CurrentUserProfileMetaRow[];
  defaultProfileId?: string;
};

type ProfileAuditResult = "SUCCESS" | "ERROR";
type ProfileTrashAuditResult = ProfileAuditResult | "REJECTED";

function toProfileMetaRow(input: {
  profileId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  isDefault: boolean;
}): CurrentUserProfileMetaRow {
  return {
    profileId: input.profileId,
    name: input.name,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    isDefault: input.isDefault,
  };
}

async function getCurrentUserProfileMetaRow(profileId: string): Promise<CurrentUserProfileMetaRow | null> {
  const [metas, defaultProfileId] = await Promise.all([
    listCurrentUserProfileMetas(),
    getCurrentUserDefaultProfileId(),
  ]);
  const found = metas.find((item) => item.profileId === profileId);
  if (!found) return null;
  return toProfileMetaRow({
    profileId: found.profileId,
    name: found.name,
    createdAt: found.createdAt,
    updatedAt: found.updatedAt,
    isDefault: found.profileId === defaultProfileId,
  });
}

export function defaultCanonicalProfileForRoute(): ProfileV2 {
  return loadCanonicalProfile({
    monthlyIncomeNet: 0,
    monthlyEssentialExpenses: 0,
    monthlyDiscretionaryExpenses: 0,
    liquidAssets: 0,
    investmentAssets: 0,
    debts: [],
    goals: [],
  }).profile;
}

export function recordCurrentUserProfileAudit(input: {
  event: "PLANNING_PROFILE_CREATE" | "PLANNING_PROFILE_UPDATE" | "PLANNING_PROFILE_DELETE";
  route: string;
  result: ProfileAuditResult;
  recordId?: string | null;
  message: string;
}) {
  try {
    appendAuditLog({
      event: input.event,
      route: input.route,
      summary: `${input.event} ${input.result}: ${input.message}`,
      details: {
        result: input.result,
        recordId: input.recordId ?? null,
        message: input.message,
      },
    });
  } catch (error) {
    console.error("[audit] failed to append planning profile audit", error);
  }
}

export function recordCurrentUserProfileTrashAudit(input: {
  result: ProfileTrashAuditResult;
  id: string;
  message: string;
}) {
  try {
    appendAuditLog({
      event: "PLANNING_TRASH_MOVE",
      route: "/api/planning/v2/profiles/[id]",
      summary: `PLANNING_TRASH_MOVE ${input.result}: ${input.message}`,
      details: {
        result: input.result,
        kind: "profile",
        id: input.id,
        message: input.message,
      },
    });
  } catch (error) {
    console.error("[audit] failed to append planning trash move audit", error);
  }
}

export async function listCurrentUserProfilesForRoute(): Promise<CurrentUserPlanningProfileRecord[]> {
  return listCurrentUserProfiles();
}

export async function getCurrentUserProfileForRoute(
  profileId: string,
): Promise<CurrentUserPlanningProfileRecord | null> {
  return getCurrentUserProfile(profileId);
}

export async function createCurrentUserProfileForRoute(input: {
  name: string;
  profile: ProfileV2;
}): Promise<CurrentUserPlanningProfileRecord> {
  return createCurrentUserProfile(input);
}

export async function updateCurrentUserProfileForRoute(
  profileId: string,
  patch: { name?: string; profile?: ProfileV2 },
): Promise<CurrentUserPlanningProfileRecord | null> {
  return updateCurrentUserProfile(profileId, patch);
}

export async function deleteCurrentUserProfileForRoute(profileId: string): Promise<boolean> {
  return deleteCurrentUserProfile(profileId);
}

export async function listCurrentUserProfileMetaRowsForRoute(): Promise<CurrentUserProfileListMetaRowsResult> {
  const [items, defaultProfileId] = await Promise.all([
    listCurrentUserProfileMetas(),
    getCurrentUserDefaultProfileId(),
  ]);
  return {
    rows: items.map((item) => toProfileMetaRow(item)),
    ...(defaultProfileId ? { defaultProfileId } : {}),
  };
}

export async function createCurrentUserProfileMetaRowForRoute(input: {
  name: string;
  profile?: unknown;
  isDefault?: boolean;
}): Promise<CurrentUserProfileMetaRow> {
  const profile = input.profile !== undefined
    ? loadCanonicalProfile(input.profile).profile
    : defaultCanonicalProfileForRoute();
  const created = await createCurrentUserProfile({
    name: input.name,
    profile,
  });
  if (input.isDefault === true) {
    await setCurrentUserDefaultProfile(created.id);
  }
  const row = await getCurrentUserProfileMetaRow(created.id);
  return row ?? toProfileMetaRow({
    profileId: created.id,
    name: created.name,
    createdAt: created.createdAt,
    updatedAt: created.updatedAt,
    isDefault: input.isDefault === true,
  });
}

export async function getCurrentUserProfileMetaRowForRoute(
  profileId: string,
): Promise<CurrentUserProfileMetaRow | null> {
  return getCurrentUserProfileMetaRow(profileId);
}

export async function patchCurrentUserProfileMetaRowForRoute(input: {
  profileId: string;
  name?: string;
  isDefault?: true;
}): Promise<CurrentUserProfileMetaRow | null> {
  if (input.name) {
    const updated = await updateCurrentUserProfile(input.profileId, { name: input.name });
    if (!updated) return null;
  } else {
    const existing = await getCurrentUserProfile(input.profileId);
    if (!existing) return null;
  }

  if (input.isDefault === true) {
    await setCurrentUserDefaultProfile(input.profileId);
  }
  return getCurrentUserProfileMetaRow(input.profileId);
}
