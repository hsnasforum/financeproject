"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { withDevCsrf } from "@/lib/dev/clientCsrf";
import {
  type AlertRulesGetResponse,
  type AlertRulesPostResponse,
  type ExposureDraft,
  type ExposureResponse,
  type GetSettingsResponse,
  type IndicatorCatalogRow,
  type IndicatorSpecsGetResponse,
  type NewsSettingsClientProps,
  type NewsSettingsController,
  type SourceRow,
  type SourceDraft,
  type TopicRow,
  type TopicDraft,
  type AlertRuleRow,
  asString,
  buildAlertRuleDraftEffective,
  buildSourceDrafts,
  buildTopicDrafts,
  canSaveNewsSettings,
  countKnownExposureFields,
  draftToProfile,
  emptyExposureDraft,
  getAlertRulesSectionStatus,
  getNewsSettingsSaveStatus,
  hasAlertRulesDraftChanges,
  normalizeWeightInput,
  parseAlertRuleOverridesJson,
  parseKeywords,
  profileToDraft,
  sortAlertRules,
} from "./shared";

type IndicatorSpecsState = {
  specsJson: string;
  indicatorCatalog: IndicatorCatalogRow[];
};

type AlertRulesState = {
  alertRulesUpdatedAt: string | null;
  alertRuleDefaults: AlertRuleRow[] | null;
  alertRulesJson: string;
};

type NewsSettingsLoadResult = {
  updatedAt: string | null;
  exposureUpdatedAt: string | null;
  sources: SourceRow[];
  topics: TopicRow[];
  sourceDrafts: Record<string, SourceDraft>;
  topicDrafts: Record<string, TopicDraft>;
  exposureDraft: ExposureDraft;
  indicatorSpecs: IndicatorSpecsState | null;
  alertRules: AlertRulesState | null;
};

function toIndicatorSpecsState(payload: IndicatorSpecsGetResponse | null | undefined): IndicatorSpecsState {
  const specs = payload?.data?.specs ?? [];
  const catalog = payload?.data?.catalog ?? [];
  return {
    specsJson: `${JSON.stringify(specs, null, 2)}\n`,
    indicatorCatalog: [...catalog].sort((a, b) => asString(a.id).localeCompare(asString(b.id))),
  };
}

function toAlertRulesState(payload: AlertRulesGetResponse | AlertRulesPostResponse | null | undefined): AlertRulesState {
  const defaults = payload?.data?.defaults?.rules ?? null;
  const overrides = payload?.data?.overrides?.rules ?? [];
  return {
    alertRulesUpdatedAt: payload?.data?.updatedAt ?? payload?.data?.overrides?.updatedAt ?? null,
    alertRuleDefaults: Array.isArray(defaults) ? sortAlertRules(defaults) : null,
    alertRulesJson: `${JSON.stringify(overrides, null, 2)}\n`,
  };
}

export function useNewsSettingsController({ csrf }: NewsSettingsClientProps): NewsSettingsController {
  const requestSeqRef = useRef(0);
  const [loading, setLoading] = useState(true);
  const [initialLoadFailed, setInitialLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [exposureUpdatedAt, setExposureUpdatedAt] = useState<string | null>(null);
  const [alertRulesUpdatedAt, setAlertRulesUpdatedAt] = useState<string | null>(null);
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [topics, setTopics] = useState<TopicRow[]>([]);
  const [sourceDrafts, setSourceDrafts] = useState<Record<string, SourceDraft>>({});
  const [initialSourceDrafts, setInitialSourceDrafts] = useState<Record<string, SourceDraft>>({});
  const [topicDrafts, setTopicDrafts] = useState<Record<string, TopicDraft>>({});
  const [initialTopicDrafts, setInitialTopicDrafts] = useState<Record<string, TopicDraft>>({});
  const [exposureDraft, setExposureDraft] = useState<ExposureDraft>(emptyExposureDraft());
  const [initialExposureDraft, setInitialExposureDraft] = useState<ExposureDraft>(emptyExposureDraft());
  const [sourcesJson, setSourcesJson] = useState("[]");
  const [sourcesIoLoading, setSourcesIoLoading] = useState(false);
  const [sourcesIoSummary, setSourcesIoSummary] = useState("");
  const [specsJson, setSpecsJson] = useState("[]");
  const [specsIoLoading, setSpecsIoLoading] = useState(false);
  const [specsIoSummary, setSpecsIoSummary] = useState("");
  const [indicatorCatalog, setIndicatorCatalog] = useState<IndicatorCatalogRow[]>([]);
  const [alertRuleDefaults, setAlertRuleDefaults] = useState<AlertRuleRow[]>([]);
  const [alertRulesJson, setAlertRulesJson] = useState("[]\n");
  const [initialAlertRulesJson, setInitialAlertRulesJson] = useState("[]\n");
  const [alertRulesPhase, setAlertRulesPhase] = useState<"idle" | "reloading" | "applying">("idle");
  const [alertRulesIoSummary, setAlertRulesIoSummary] = useState("");
  const [alertRulesLoadError, setAlertRulesLoadError] = useState("");

  const applyAlertRulesResponse = useCallback((payload: AlertRulesGetResponse | AlertRulesPostResponse | null | undefined) => {
    const next = toAlertRulesState(payload);
    setAlertRulesUpdatedAt(next.alertRulesUpdatedAt);
    if (next.alertRuleDefaults) setAlertRuleDefaults(next.alertRuleDefaults);
    setAlertRulesJson(next.alertRulesJson);
    setInitialAlertRulesJson(next.alertRulesJson);
    setAlertRulesLoadError("");
  }, []);

  const applyLoadResult = useCallback((next: NewsSettingsLoadResult) => {
    setUpdatedAt(next.updatedAt);
    setSources(next.sources);
    setTopics(next.topics);
    setExposureUpdatedAt(next.exposureUpdatedAt);
    setExposureDraft(next.exposureDraft);
    setInitialExposureDraft(next.exposureDraft);
    setSourceDrafts(next.sourceDrafts);
    setInitialSourceDrafts(next.sourceDrafts);
    setTopicDrafts(next.topicDrafts);
    setInitialTopicDrafts(next.topicDrafts);
    if (next.indicatorSpecs) {
      setSpecsJson(next.indicatorSpecs.specsJson);
      setIndicatorCatalog(next.indicatorSpecs.indicatorCatalog);
    }
    if (next.alertRules) {
      setAlertRulesUpdatedAt(next.alertRules.alertRulesUpdatedAt);
      if (next.alertRules.alertRuleDefaults) setAlertRuleDefaults(next.alertRules.alertRuleDefaults);
      setAlertRulesJson(next.alertRules.alertRulesJson);
      setInitialAlertRulesJson(next.alertRules.alertRulesJson);
    }
    setInitialLoadFailed(false);
    setErrorMessage("");
    setAlertRulesLoadError("");
  }, []);

  const load = useCallback(async (signal?: AbortSignal): Promise<NewsSettingsLoadResult> => {
    const [settingsResponse, exposureResponse] = await Promise.all([
      fetch("/api/planning/v3/news/settings", {
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
        headers: { "x-requested-with": "XMLHttpRequest" },
        signal,
      }),
      fetch("/api/planning/v3/exposure/profile", {
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
        headers: { "x-requested-with": "XMLHttpRequest" },
        signal,
      }),
    ]);
    const [specsResponse, alertRulesResponse] = await Promise.all([
      fetch("/api/planning/v3/indicators/specs", {
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
        headers: { "x-requested-with": "XMLHttpRequest" },
        signal,
      }).catch(() => null),
      fetch("/api/planning/v3/news/alerts/rules", {
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
        headers: { "x-requested-with": "XMLHttpRequest" },
        signal,
      }).catch(() => null),
    ]);
    const settingsPayload = (await settingsResponse.json().catch(() => null)) as GetSettingsResponse | null;
    const exposurePayload = (await exposureResponse.json().catch(() => null)) as ExposureResponse | null;
    const specsPayload = specsResponse ? (await specsResponse.json().catch(() => null)) as IndicatorSpecsGetResponse | null : null;
    const alertRulesPayload = alertRulesResponse ? (await alertRulesResponse.json().catch(() => null)) as AlertRulesGetResponse | null : null;

    if (!settingsResponse.ok || settingsPayload?.ok !== true || !settingsPayload.data) {
      throw new Error(settingsPayload?.error?.message ?? `HTTP ${settingsResponse.status}`);
    }
    if (!exposureResponse.ok || exposurePayload?.ok !== true) {
      throw new Error(exposurePayload?.error?.message ?? `HTTP ${exposureResponse.status}`);
    }

    const loadedSources = settingsPayload.data.sources ?? [];
    const loadedTopics = settingsPayload.data.topics ?? [];
    const nextExposureDraft = profileToDraft(exposurePayload.profile ?? null);
    return {
      updatedAt: settingsPayload.data.updatedAt ?? null,
      sources: loadedSources,
      topics: loadedTopics,
      exposureUpdatedAt: exposurePayload.profile?.savedAt ?? null,
      exposureDraft: nextExposureDraft,
      sourceDrafts: buildSourceDrafts(loadedSources),
      topicDrafts: buildTopicDrafts(loadedTopics),
      indicatorSpecs: specsResponse?.ok && specsPayload?.ok === true ? toIndicatorSpecsState(specsPayload) : null,
      alertRules: alertRulesResponse?.ok && alertRulesPayload?.ok === true ? toAlertRulesState(alertRulesPayload) : null,
    };
  }, []);

  useEffect(() => {
    const requestId = ++requestSeqRef.current;
    const controller = new AbortController();
    let active = true;

    async function loadNewsSettings() {
      try {
        const next = await load(controller.signal);
        if (!active || requestId !== requestSeqRef.current) return;
        applyLoadResult(next);
      } catch (error) {
        if (!active || requestId !== requestSeqRef.current || controller.signal.aborted) return;
        setInitialLoadFailed(true);
        setErrorMessage(error instanceof Error ? error.message : "설정을 불러오지 못했습니다.");
      } finally {
        if (active && requestId === requestSeqRef.current) {
          setLoading(false);
        }
      }
    }

    void loadNewsSettings();

    return () => {
      active = false;
      controller.abort();
    };
  }, [applyLoadResult, load]);

  const reloadFromServer = useCallback(async () => {
    const requestId = ++requestSeqRef.current;
    setLoading(true);
    setInitialLoadFailed(false);
    setErrorMessage("");
    setAlertRulesLoadError("");
    try {
      const next = await load();
      if (requestId !== requestSeqRef.current) return;
      applyLoadResult(next);
    } catch (error) {
      if (requestId !== requestSeqRef.current) return;
      setInitialLoadFailed(true);
      setErrorMessage(error instanceof Error ? error.message : "설정을 불러오지 못했습니다.");
    } finally {
      if (requestId === requestSeqRef.current) {
        setLoading(false);
      }
    }
  }, [applyLoadResult, load]);

  const parsedAlertRulesDraft = useMemo(() => parseAlertRuleOverridesJson(alertRulesJson), [alertRulesJson]);
  const alertRuleOverridesCount = parsedAlertRulesDraft.rules.length;
  const alertRuleDraftEffective = useMemo(
    () => sortAlertRules(buildAlertRuleDraftEffective(alertRuleDefaults, parsedAlertRulesDraft.rules)),
    [alertRuleDefaults, parsedAlertRulesDraft.rules],
  );

  const settingsDirty = useMemo(() => {
    for (const row of sources) {
      const draft = sourceDrafts[row.id] ?? { id: row.id, enabled: row.defaultEnabled, weight: String(row.defaultWeight) };
      const initial = initialSourceDrafts[row.id] ?? draft;
      if (draft.enabled !== initial.enabled || normalizeWeightInput(draft.weight) !== normalizeWeightInput(initial.weight)) return true;
    }
    for (const row of topics) {
      const draft = topicDrafts[row.id] ?? { id: row.id, keywordsText: "" };
      const initial = initialTopicDrafts[row.id] ?? draft;
      const parsed = parseKeywords(draft.keywordsText);
      const initialParsed = parseKeywords(initial.keywordsText);
      if (parsed.length !== initialParsed.length || !parsed.every((token, idx) => token === initialParsed[idx])) return true;
    }
    return JSON.stringify(exposureDraft) !== JSON.stringify(initialExposureDraft);
  }, [exposureDraft, initialExposureDraft, initialSourceDrafts, initialTopicDrafts, sourceDrafts, sources, topicDrafts, topics]);

  const alertRulesDirty = useMemo(() => hasAlertRulesDraftChanges(alertRulesJson, initialAlertRulesJson), [alertRulesJson, initialAlertRulesJson]);
  const canSaveSettings = useMemo(() => canSaveNewsSettings(settingsDirty, alertRulesDirty), [alertRulesDirty, settingsDirty]);
  const alertRulesStateKnown = !loading && !initialLoadFailed && !alertRulesLoadError;
  const newsSettingsStatusText = loading ? "로딩 중..." : getNewsSettingsSaveStatus(settingsDirty, alertRulesDirty, alertRulesStateKnown);
  const alertRulesSectionStatusText = getAlertRulesSectionStatus(alertRulesDirty, alertRulesPhase, alertRulesStateKnown);
  const activeSourceCount = sources.filter((row) => (sourceDrafts[row.id]?.enabled ?? row.defaultEnabled)).length;
  const overriddenTopicCount = topics.filter((row) => {
    const parsed = parseKeywords(topicDrafts[row.id]?.keywordsText ?? "");
    return !(parsed.length === row.defaultKeywords.length && parsed.every((token, index) => token === row.defaultKeywords[index]));
  }).length;
  const exposureCompletionCount = countKnownExposureFields(exposureDraft);
  const enabledIndicatorCount = indicatorCatalog.filter((row) => row.enabled !== false).length;

  const updateSourceEnabled = useCallback((id: string, value: boolean) => {
    setSourceDrafts((prev) => ({ ...prev, [id]: { ...(prev[id] ?? { id, enabled: value, weight: "1" }), enabled: value } }));
  }, []);

  const updateSourceWeight = useCallback((id: string, value: string) => {
    setSourceDrafts((prev) => ({ ...prev, [id]: { ...(prev[id] ?? { id, enabled: true, weight: value }), weight: value } }));
  }, []);

  const updateTopicKeywords = useCallback((id: string, value: string) => {
    setTopicDrafts((prev) => ({ ...prev, [id]: { ...(prev[id] ?? { id, keywordsText: "" }), keywordsText: value } }));
  }, []);

  const updateExposure = useCallback(<K extends keyof ExposureDraft>(key: K, value: ExposureDraft[K]) => {
    setExposureDraft((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSave = useCallback(async () => {
    if (!canSaveSettings) return;
    setSaving(true);
    setErrorMessage("");
    setNotice("");
    try {
      const sourceOverrides = sources.map((row) => {
        const draft = sourceDrafts[row.id];
        const weight = Number.isFinite(Number(draft?.weight)) ? Number(draft?.weight) : row.defaultWeight;
        const enabled = draft?.enabled ?? row.defaultEnabled;
        return {
          id: row.id,
          enabled: enabled === row.defaultEnabled ? undefined : enabled,
          weight: Math.abs(weight - row.defaultWeight) <= 1e-9 ? undefined : weight,
        };
      }).filter((row) => typeof row.enabled === "boolean" || typeof row.weight === "number");

      const topicOverrides = topics.map((row) => {
        const parsed = parseKeywords(topicDrafts[row.id]?.keywordsText ?? "");
        return {
          id: row.id,
          keywords: (parsed.length === row.defaultKeywords.length && parsed.every((token, idx) => token === row.defaultKeywords[idx])) ? undefined : parsed,
        };
      }).filter((row) => Array.isArray(row.keywords));

      const payload = withDevCsrf({ sources: sourceOverrides, topics: topicOverrides });
      if (!payload.csrf && csrf) payload.csrf = csrf;
      const res = await fetch("/api/planning/v3/news/settings", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json", "x-requested-with": "XMLHttpRequest" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("뉴스 기준 저장 실패");

      const expPayload = withDevCsrf({ profile: draftToProfile(exposureDraft) });
      if (!expPayload.csrf && csrf) expPayload.csrf = csrf;
      const expRes = await fetch("/api/planning/v3/exposure/profile", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json", "x-requested-with": "XMLHttpRequest" },
        body: JSON.stringify(expPayload),
      });
      if (!expRes.ok) throw new Error("프로필 저장 실패");

      setNotice("저장되었습니다.");
      await reloadFromServer();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "저장 중 오류");
    } finally {
      setSaving(false);
    }
  }, [canSaveSettings, csrf, exposureDraft, reloadFromServer, sourceDrafts, sources, topicDrafts, topics]);

  const handleIo = useCallback(async (target: "sources" | "specs", action: "export" | "import", mode?: "dry_run" | "apply") => {
    const isLoading = target === "sources" ? setSourcesIoLoading : setSpecsIoLoading;
    const setSummary = target === "sources" ? setSourcesIoSummary : setSpecsIoSummary;
    isLoading(true);
    setErrorMessage("");
    setSummary("");
    try {
      const url = target === "sources" ? "/api/planning/v3/news/sources" : "/api/planning/v3/indicators/specs";
      if (action === "export") {
        const res = await fetch(url, {
          method: "GET",
          cache: "no-store",
          credentials: "same-origin",
          headers: { "x-requested-with": "XMLHttpRequest" },
        });
        const payload = await res.json();
        if (!res.ok || !payload.ok) throw new Error("내보내기 실패");
        const json = target === "sources" ? payload.data?.items : payload.data?.specs;
        if (target === "sources") setSourcesJson(`${JSON.stringify(json, null, 2)}\n`);
        else setSpecsJson(`${JSON.stringify(json, null, 2)}\n`);
        setSummary("내보내기 완료");
      } else {
        const body = target === "sources" ? { mode, items: JSON.parse(sourcesJson) } : { mode, specs: JSON.parse(specsJson) };
        const payload = withDevCsrf(body);
        if (!payload.csrf && csrf) payload.csrf = csrf;
        const res = await fetch(url, {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json", "x-requested-with": "XMLHttpRequest" },
          body: JSON.stringify(payload),
        });
        const result = await res.json();
        if (!res.ok || !result.ok) throw new Error("가져오기 실패");
        setSummary(`${mode === "apply" ? "적용" : "분석"} 완료`);
        if (mode === "apply") await reloadFromServer();
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "IO 작업 중 오류");
    } finally {
      isLoading(false);
    }
  }, [csrf, reloadFromServer, sourcesJson, specsJson]);

  const handleAlertRulesAction = useCallback(async (action: "reload" | "apply") => {
    setAlertRulesPhase(action === "reload" ? "reloading" : "applying");
    setErrorMessage("");
    setNotice("");
    setAlertRulesIoSummary("");
    try {
      if (action === "reload") {
        const res = await fetch("/api/planning/v3/news/alerts/rules", {
          method: "GET",
          cache: "no-store",
          credentials: "same-origin",
          headers: { "x-requested-with": "XMLHttpRequest" },
        });
        const payload = await res.json();
        if (!res.ok || !payload.ok) throw new Error("불러오기 실패");
        applyAlertRulesResponse(payload);
        setAlertRulesIoSummary("최신 상태를 불러왔습니다.");
      } else {
        const parsed = parseAlertRuleOverridesJson(alertRulesJson);
        if (parsed.error) throw new Error(parsed.error);
        const payload = withDevCsrf({ rules: parsed.rules });
        if (!payload.csrf && csrf) payload.csrf = csrf;
        const res = await fetch("/api/planning/v3/news/alerts/rules", {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json", "x-requested-with": "XMLHttpRequest" },
          body: JSON.stringify(payload),
        });
        const result = await res.json();
        if (!res.ok || !result.ok) throw new Error("적용 실패");
        applyAlertRulesResponse(result);
        setAlertRulesIoSummary("적용 완료");
        setNotice("알림 규칙이 적용되었습니다.");
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "알림 규칙 작업 오류");
    } finally {
      setAlertRulesPhase("idle");
    }
  }, [alertRulesJson, applyAlertRulesResponse, csrf]);

  return {
    hero: {
      loading,
      saving,
      canSaveSettings,
      notice,
      errorMessage,
      updatedAt,
      newsSettingsStatusText,
      activeSourceCount,
      sourcesCount: sources.length,
      overriddenTopicCount,
      exposureCompletionCount,
      enabledIndicatorCount,
      alertRulesDirty,
      alertRulesSectionStatusText,
    },
    exposure: {
      loading,
      draft: exposureDraft,
      updateExposure,
    },
    sources: {
      loading,
      rows: sources,
      drafts: sourceDrafts,
      updateSourceEnabled,
      updateSourceWeight,
    },
    topics: {
      rows: topics,
      drafts: topicDrafts,
      updateTopicKeywords,
    },
    advanced: {
      updatedAt,
      exposureUpdatedAt,
      alertRulesUpdatedAt,
      newsSettingsStatusText,
      alertRulesSectionStatusText,
      exposureCompletionCount,
      alertRulesPhase,
      alertRulesDirty,
      alertRulesJson,
      alertRulesIoSummary,
      alertRuleOverridesCount,
      alertRuleDraftEffective,
      sourcesJson,
      sourcesIoLoading,
      sourcesIoSummary,
      specsJson,
      specsIoLoading,
      specsIoSummary,
      handleAlertRulesAction,
      setAlertRulesJson,
      setSourcesJson,
      setSpecsJson,
      handleIo,
    },
    actions: {
      handleSave,
    },
  };
}
