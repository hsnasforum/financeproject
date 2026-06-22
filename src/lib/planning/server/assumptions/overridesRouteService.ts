import {
  AssumptionsOverrideEntrySchema,
  normalizeAssumptionsOverrides,
  type AssumptionsOverrideEntry,
} from "./overrides";
import {
  loadAssumptionsOverrides,
  loadAssumptionsOverridesByProfile,
  resetAssumptionsOverrides,
  saveAssumptionsOverrides,
} from "./overridesStorage";
import { getDefaultProfileId } from "../store/profileStore";
import { sanitizeRecordId } from "../../store/paths";

export type AssumptionsOverridesMutationInput = {
  csrf?: unknown;
  items?: unknown;
  item?: unknown;
  key?: unknown;
  value?: unknown;
  reason?: unknown;
  updatedAt?: unknown;
  profileId?: unknown;
} | null;

export type RouteAssumptionsOverridesResult = {
  profileId?: string;
  items: AssumptionsOverrideEntry[];
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeProfileId(value: unknown): string | undefined {
  const raw = asString(value);
  if (!raw) return undefined;
  try {
    return sanitizeRecordId(raw);
  } catch {
    return undefined;
  }
}

async function resolveTargetProfileId(input: unknown): Promise<string | undefined> {
  const candidate = normalizeProfileId(input);
  if (candidate) return candidate;
  const defaultProfileId = await getDefaultProfileId();
  return normalizeProfileId(defaultProfileId);
}

function parsePatchItem(body: AssumptionsOverridesMutationInput): AssumptionsOverrideEntry | null {
  if (!body) return null;
  const fromItem = AssumptionsOverrideEntrySchema.safeParse(body.item);
  if (fromItem.success) {
    const [normalized] = normalizeAssumptionsOverrides([fromItem.data]);
    return normalized ?? null;
  }
  const partial = AssumptionsOverrideEntrySchema.safeParse({
    key: body.key,
    value: body.value,
    reason: body.reason,
    updatedAt: body.updatedAt,
  });
  if (!partial.success) return null;
  const [normalized] = normalizeAssumptionsOverrides([partial.data]);
  return normalized ?? null;
}

export async function listRouteAssumptionsOverrides(
  profileIdInput: unknown,
): Promise<RouteAssumptionsOverridesResult> {
  const profileId = await resolveTargetProfileId(profileIdInput);
  const items = profileId
    ? await loadAssumptionsOverridesByProfile(profileId)
    : await loadAssumptionsOverrides();
  return {
    ...(profileId ? { profileId } : {}),
    items,
  };
}

export async function replaceRouteAssumptionsOverrides(
  body: AssumptionsOverridesMutationInput,
): Promise<RouteAssumptionsOverridesResult> {
  const profileId = await resolveTargetProfileId(body?.profileId);
  const items = await saveAssumptionsOverrides(body?.items, profileId);
  return {
    ...(profileId ? { profileId } : {}),
    items,
  };
}

export async function patchRouteAssumptionsOverrides(
  body: AssumptionsOverridesMutationInput,
): Promise<RouteAssumptionsOverridesResult> {
  const profileId = await resolveTargetProfileId(body?.profileId);
  const patchItem = parsePatchItem(body);
  if (!patchItem) {
    throw new Error("key/value(%) 기반 오버라이드 항목이 필요합니다.");
  }
  const currentItems = profileId
    ? await loadAssumptionsOverridesByProfile(profileId)
    : await loadAssumptionsOverrides();
  const nextItems = normalizeAssumptionsOverrides([...currentItems, patchItem]);
  const items = await saveAssumptionsOverrides(nextItems, profileId);
  return {
    ...(profileId ? { profileId } : {}),
    items,
  };
}

export async function resetRouteAssumptionsOverrides(profileIdInput: unknown): Promise<{
  profileId?: string;
}> {
  const profileId = await resolveTargetProfileId(profileIdInput);
  await resetAssumptionsOverrides(profileId);
  return {
    ...(profileId ? { profileId } : {}),
  };
}
