"use client";

import { useCallback } from "react";
import { withDevCsrf } from "@/lib/dev/clientCsrf";
import { isApiBaseResponse } from "@/lib/http/apiContract";
import { t, type Locale } from "@/lib/planning/i18n";
import { suggestProfileNormalizations, type NormalizationSuggestion } from "@/lib/planning/v2/normalizeProfile";
import {
  parseProfileNormalizationDisclosure,
  type ProfileNormalizationDisclosure,
} from "@/lib/planning/v2/normalizationDisclosure";
import { type ProfileV2 } from "@/lib/planning/v2/types";
import { type PlanningProfileRecord } from "@/lib/planning/store/types";
import {
  normalizeDraft,
  normalizeDraftWithDisclosure,
  toProfileJson,
  type FormDraft,
  type ProfileFormModel,
} from "@/app/planning/_lib/profileFormModel";
import { type ProfileSaveMode } from "@/components/planning/workspace/useWorkspaceProfileBundle";

type ApiError = {
  code?: string;
  message?: string;
  issues?: string[];
};

type ApiResponse<T> = {
  ok?: boolean;
  data?: T;
  meta?: Record<string, unknown>;
  error?: ApiError;
};

type WorkspaceProfileSyncActionInput = {
  locale: Locale;
  selectedProfileId: string;
  selectedProfile: PlanningProfileRecord | null;
  profileName: string;
  profileForm: ProfileFormModel;
  profileValidationErrors: string[];
  loadProfiles: (nextSelectedId?: string) => Promise<void>;
  pushWorkspaceError: (message: string) => void;
  setPendingProfileSave: (value: { mode: ProfileSaveMode; profile: ProfileV2 } | null) => void;
  setPendingSuggestions: (value: NormalizationSuggestion[]) => void;
  setAcceptedSuggestionCodes: (value: string[]) => void;
  setLastNormalizationDisclosure: (value: ProfileNormalizationDisclosure | null) => void;
};

function truncate(text: string, max = 120): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max)}...`;
}

function resolveApiErrorMessage(locale: Locale, error: ApiError | undefined, fallbackMessage: string): string {
  const code = typeof error?.code === "string" ? error.code.trim().toUpperCase() : "";
  const mapped = code ? t(locale, code) : "";
  const raw = typeof error?.message === "string" ? error.message.trim() : "";
  const base = mapped && mapped !== code ? mapped : (raw || fallbackMessage);
  if (raw && mapped && mapped !== code && raw !== mapped) return `${base} (${truncate(raw)})`;
  return base;
}

function parseApiPayload<T>(
  locale: Locale,
  res: Response,
  payload: ApiResponse<T> | null,
  fallbackMessage: string,
): { ok: boolean; errorMessage: string } {
  if (!isApiBaseResponse(payload)) {
    return {
      ok: false,
      errorMessage: `${fallbackMessage}: 응답 파싱 실패`,
    };
  }
  const typedPayload = payload as ApiResponse<T>;
  if (!res.ok || !typedPayload.ok) {
    return {
      ok: false,
      errorMessage: resolveApiErrorMessage(locale, typedPayload.error, fallbackMessage),
    };
  }
  return { ok: true, errorMessage: "" };
}

function pretty(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function useWorkspaceProfileSyncAction({
  locale,
  selectedProfileId,
  selectedProfile,
  profileName,
  profileForm,
  profileValidationErrors,
  loadProfiles,
  pushWorkspaceError,
  setPendingProfileSave,
  setPendingSuggestions,
  setAcceptedSuggestionCodes,
  setLastNormalizationDisclosure,
}: WorkspaceProfileSyncActionInput): () => Promise<boolean> {
  return useCallback(async (): Promise<boolean> => {
    if (!selectedProfileId) {
      pushWorkspaceError("저장할 프로필을 먼저 선택하세요.");
      return false;
    }

    if (profileValidationErrors.length > 0) {
      pushWorkspaceError(`프로필 입력 오류를 먼저 수정하세요.\n- ${profileValidationErrors.join("\n- ")}`);
      return false;
    }
    const parsedProfile = toProfileJson(profileForm);
    const canonicalProfile = normalizeDraftWithDisclosure(parsedProfile as unknown as FormDraft, profileName);

    const suggestions = suggestProfileNormalizations(parsedProfile);
    if (suggestions.length > 0) {
      setPendingProfileSave({ mode: "update", profile: parsedProfile });
      setPendingSuggestions(suggestions);
      setAcceptedSuggestionCodes([]);
      pushWorkspaceError("프로필 저장 전 정규화 제안을 먼저 확인해주세요.");
      return false;
    }

    const before = pretty(normalizeDraft((selectedProfile?.profile ?? {}) as FormDraft, selectedProfile?.name ?? profileName));
    const after = pretty(canonicalProfile.profile);
    const dirty = before !== after || (selectedProfile?.name ?? "") !== profileName;
    if (!dirty) return true;

    const res = await fetch(`/api/planning/v2/profiles/${encodeURIComponent(selectedProfileId)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(withDevCsrf({
        name: profileName,
        profile: canonicalProfile.profile,
      })),
    });
    const payload = (await res.json().catch(() => null)) as ApiResponse<PlanningProfileRecord> | null;
    const parsedPayload = parseApiPayload(locale, res, payload, "실행 기록 저장 전 프로필 동기화에 실패했습니다.");
    if (!parsedPayload.ok) {
      pushWorkspaceError(parsedPayload.errorMessage);
      return false;
    }
    const normalizationFromResponse = parseProfileNormalizationDisclosure(payload?.meta?.normalization);
    setLastNormalizationDisclosure(normalizationFromResponse ?? canonicalProfile.normalization);

    await loadProfiles(selectedProfileId);
    return true;
  }, [
    loadProfiles,
    locale,
    profileForm,
    profileName,
    profileValidationErrors,
    pushWorkspaceError,
    selectedProfile,
    selectedProfileId,
    setAcceptedSuggestionCodes,
    setLastNormalizationDisclosure,
    setPendingProfileSave,
    setPendingSuggestions,
  ]);
}
