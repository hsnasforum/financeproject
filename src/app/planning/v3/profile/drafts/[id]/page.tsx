import { ProfileDraftDetailClient, type DraftDetail } from "./_components/ProfileDraftDetailClient";
import { type ProfileOption } from "../_lib/preflightDisplay";
import {
  getCurrentUserProfileDraft,
  type ProfileDraftRecord,
} from "@/lib/planning/v3/service/profileDraftRepository";
import {
  listCurrentUserProfileMetas,
  type ProfileMetaRecord,
} from "@/lib/planning/v3/service/profileRepository";
import { withCurrentPlanningPageUser } from "@/lib/planning/server/pageAuth";

type PageProps = {
  params: Promise<{ id: string }>;
};

const DETAIL_LOAD_FAILED_MESSAGE = "상담 정보 초안 상세를 불러오지 못했습니다.";

export const dynamic = "force-dynamic";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeIsoOrEmpty(value: unknown): string {
  const text = asString(value);
  if (!text) return "";
  const ts = Date.parse(text);
  if (!Number.isFinite(ts)) return "";
  return new Date(ts).toISOString();
}

function sortProfileOptions(rows: ProfileOption[]): ProfileOption[] {
  return [...rows].sort((left, right) => {
    const leftTs = Date.parse(left.updatedAt ?? "");
    const rightTs = Date.parse(right.updatedAt ?? "");
    const leftValid = Number.isFinite(leftTs);
    const rightValid = Number.isFinite(rightTs);
    if (leftValid && rightValid && leftTs !== rightTs) {
      return rightTs - leftTs;
    }
    if (leftValid !== rightValid) {
      return rightValid ? 1 : -1;
    }
    return left.profileId.localeCompare(right.profileId);
  });
}

function toProfileOption(item: ProfileMetaRecord): ProfileOption {
  const name = asString(item.name);
  const updatedAt = normalizeIsoOrEmpty(item.updatedAt);
  return {
    profileId: item.profileId,
    ...(name ? { name } : {}),
    ...(updatedAt ? { updatedAt } : {}),
  };
}

function toDraftDetail(row: ProfileDraftRecord): DraftDetail {
  return {
    id: row.id,
    batchId: row.batchId,
    createdAt: row.createdAt,
    draftPatch: row.draftPatch,
    evidence: row.evidence,
    assumptions: row.assumptions,
    ...(row.stats ? { stats: row.stats } : {}),
  };
}

export default async function PlanningV3ProfileDraftDetailPage({ params }: PageProps) {
  const { id } = await params;
  let initialDraft: DraftDetail | null = null;
  let initialProfiles: ProfileOption[] = [];
  let initialMessage = "";

  try {
    const [draft, profileMetas] = await withCurrentPlanningPageUser(() => Promise.all([
      getCurrentUserProfileDraft(id),
      listCurrentUserProfileMetas().catch(() => []),
    ]));
    if (!draft) {
      initialMessage = DETAIL_LOAD_FAILED_MESSAGE;
    } else {
      initialDraft = toDraftDetail(draft);
    }
    initialProfiles = sortProfileOptions(profileMetas.map(toProfileOption));
  } catch {
    initialDraft = null;
    initialProfiles = [];
    initialMessage = DETAIL_LOAD_FAILED_MESSAGE;
  }

  return (
    <ProfileDraftDetailClient
      disableAutoLoad
      id={id}
      initialDraft={initialDraft}
      initialMessage={initialMessage}
      initialProfiles={initialProfiles}
    />
  );
}
