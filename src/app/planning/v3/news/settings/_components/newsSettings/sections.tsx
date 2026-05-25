import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { SubSectionHeader } from "@/components/ui/SubSectionHeader";
import {
  reportHeroPrimaryActionClassName,
  ReportHeroCard,
  ReportHeroStatCard,
  ReportHeroStatGrid,
} from "@/components/ui/ReportTone";
import { cn } from "@/lib/utils";
import { NewsNavigation } from "../../../_components/NewsNavigation";
import {
  ALERT_RULES_FOLLOW_THROUGH_LINK_CLASSNAME,
  SETTINGS_PANEL_CLASSNAME,
  SETTINGS_PANEL_SUBTLE_CLASSNAME,
  SETTINGS_ROW_PANEL_CLASSNAME,
  type ExposureDraft,
  type NewsSettingsAdvancedState,
  type NewsSettingsExposureState,
  type NewsSettingsHeroState,
  type NewsSettingsSourcesState,
  type NewsSettingsTopicsState,
  asString,
  formatAlertRuleKind,
  formatAlertRuleSummary,
  formatDateTime,
} from "./shared";

const EXPOSURE_FIELDS: Array<{
  label: string;
  key: keyof ExposureDraft;
  options: Array<[ExposureDraft[keyof ExposureDraft], string]>;
}> = [
  { label: "부채 보유", key: "hasDebt", options: [["unknown", "미입력"], ["yes", "있음"], ["no", "없음"]] },
  { label: "금리 유형", key: "rateType", options: [["unknown", "미입력"], ["fixed", "고정"], ["variable", "변동"], ["mixed", "혼합"], ["none", "해당 없음"]] },
  { label: "재조정 민감도", key: "repricingHorizon", options: [["unknown", "미입력"], ["short", "단기"], ["medium", "중기"], ["long", "장기"], ["none", "해당 없음"]] },
  { label: "필수지출 비중", key: "essentialExpenseShare", options: [["unknown", "미입력"], ["low", "낮음"], ["medium", "중간"], ["high", "높음"]] },
  { label: "주거비 비중", key: "rentOrMortgageShare", options: [["unknown", "미입력"], ["low", "낮음"], ["medium", "중간"], ["high", "높음"]] },
  { label: "소득 안정성", key: "incomeStability", options: [["unknown", "미입력"], ["stable", "안정"], ["moderate", "보통"], ["fragile", "취약"]] },
];

type NewsSettingsHeroSectionProps = {
  state: NewsSettingsHeroState;
  onSave: () => void;
};

export function NewsSettingsHeroSection({ state, onSave }: NewsSettingsHeroSectionProps) {
  return (
    <section>
      <ReportHeroCard
        kicker="Signal Settings"
        title="뉴스 기준 설정"
        description="구독할 뉴스 소스, 관심 토픽, 내 상황 프로필을 한 화면에서 정리해 브리핑 해석 기준과 후속 알림 흐름을 안정적으로 맞춥니다."
        className="overflow-hidden border border-slate-200/90 bg-white shadow-sm shadow-slate-200/50"
        contentClassName="space-y-6 p-6 md:p-8 lg:p-9"
        action={(
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={state.saving || state.loading || !state.canSaveSettings}
              onClick={onSave}
              className={cn(
                reportHeroPrimaryActionClassName,
                "disabled:opacity-60 disabled:hover:bg-primary bg-primary hover:bg-primary border-primary/10 shadow-sm shadow-primary/10",
              )}
            >
              {state.saving ? "저장 중..." : "뉴스 기준/내 상황 저장"}
            </button>
          </div>
        )}
      >
        <div className="rounded-[1.75rem] border border-slate-200/90 bg-surface-muted/80 px-3 py-3 md:px-4">
          <NewsNavigation />
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(280px,0.9fr)]">
          <div className="space-y-4">
            <div className="rounded-[1.75rem] border border-primary/10 bg-primary/10 px-5 py-4">
              <div className="flex items-start gap-3">
                <div className="mt-1 h-2.5 w-2.5 flex-none animate-pulse rounded-full bg-primary" />
                <div className="space-y-2">
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-navy">현재 저장 상태</p>
                  <p className="text-sm font-bold leading-relaxed tracking-tight text-slate-800">
                    {state.newsSettingsStatusText}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-[1.75rem] border border-slate-200/90 bg-surface-muted/80 px-5 py-4">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">빠른 이동</p>
              <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-[0.18em]">
                <a href="#news-settings-exposure" className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-slate-600 transition-colors hover:border-slate-300 hover:bg-surface-muted">상황 프로필</a>
                <a href="#news-settings-sources" className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-slate-600 transition-colors hover:border-slate-300 hover:bg-surface-muted">뉴스 소스</a>
                <a href="#news-settings-topics" className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-slate-600 transition-colors hover:border-slate-300 hover:bg-surface-muted">관심 토픽</a>
                <a href="#news-settings-alert-rules" className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-slate-600 transition-colors hover:border-slate-300 hover:bg-surface-muted">알림 규칙</a>
                <a href="#news-settings-advanced" className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-slate-600 transition-colors hover:border-slate-300 hover:bg-surface-muted">고급 설정</a>
              </div>
            </div>
          </div>

          <div className={SETTINGS_PANEL_SUBTLE_CLASSNAME}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">작업 순서</p>
                <p className="mt-2 text-lg font-black tracking-tight text-navy">주요 입력은 왼쪽, 상태와 고급 관리는 오른쪽에 모았습니다.</p>
              </div>
              <span className="rounded-full bg-white px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">
                Updated {formatDateTime(state.updatedAt)}
              </span>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
              <div className="rounded-[1.35rem] border border-white/80 bg-white/90 px-4 py-3">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">프로필 기준</p>
                <p className="mt-2 text-sm font-bold text-slate-800">{state.exposureCompletionCount}/10 입력</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">내 상황 프로필을 먼저 채우면 이후 브리핑과 시나리오 해석 기준이 안정됩니다.</p>
              </div>
              <div className="rounded-[1.35rem] border border-white/80 bg-white/90 px-4 py-3">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">소스·토픽 상태</p>
                <p className="mt-2 text-sm font-bold text-slate-800">{state.activeSourceCount}개 소스, {state.overriddenTopicCount}개 토픽 조정</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">반복 카드 대신 밴드형 작업면으로 묶어 스캔 순서를 단순하게 유지합니다.</p>
              </div>
              <div className="rounded-[1.35rem] border border-white/80 bg-white/90 px-4 py-3">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">알림 규칙 상태</p>
                <p className="mt-2 text-sm font-bold text-slate-800">{state.alertRulesDirty ? "적용 전 변경 있음" : "현재 적용 기준 유지 중"}</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">{state.alertRulesSectionStatusText}</p>
              </div>
            </div>
          </div>
        </div>

        <ReportHeroStatGrid className="gap-3 xl:grid-cols-4">
          <ReportHeroStatCard
            label="활성 소스"
            value={`${state.activeSourceCount}/${state.sourcesCount}`}
            description="반영 중인 뉴스 미디어 수"
            className="border-slate-200/80 bg-surface-muted/80 px-4 py-4 hover:bg-white"
          />
          <ReportHeroStatCard
            label="토픽 최적화"
            value={`${state.overriddenTopicCount}개`}
            description="커스텀 키워드 적용 중"
            className="border-slate-200/80 bg-surface-muted/80 px-4 py-4 hover:bg-white"
          />
          <ReportHeroStatCard
            label="프로필 완성도"
            value={`${state.exposureCompletionCount}/10`}
            description="개인화 영향 분석 지표"
            className="border-slate-200/80 bg-surface-muted/80 px-4 py-4 hover:bg-white"
          />
          <ReportHeroStatCard
            label="지표 카탈로그"
            value={`${state.enabledIndicatorCount}개`}
            description="추적 중인 활성 지표 수"
            className="border-slate-200/80 bg-surface-muted/80 px-4 py-4 hover:bg-white"
          />
        </ReportHeroStatGrid>

        {state.notice || state.errorMessage ? (
          <div className="rounded-[1.5rem] border border-slate-200/90 bg-surface-muted/90 px-5 py-4">
            {state.notice ? <p className="flex items-center gap-2 text-xs font-bold text-navy"><span>✅</span> {state.notice}</p> : null}
            {state.errorMessage ? <p className="flex items-center gap-2 text-xs font-bold text-rose-600"><span>❌</span> {state.errorMessage}</p> : null}
          </div>
        ) : null}
      </ReportHeroCard>
    </section>
  );
}

export function NewsSettingsExposureSection({ state }: { state: NewsSettingsExposureState }) {
  return (
    <section>
      <Card id="news-settings-exposure" className="rounded-[2.5rem] border border-slate-200/90 bg-white p-6 shadow-sm shadow-slate-200/40 md:p-8">
        <div className="rounded-[1.75rem] border border-slate-200/90 bg-surface-muted/75 p-5 md:p-6">
          <SubSectionHeader
            title="내 상황 프로필"
            description="먼저 내 상황을 맞춰 두면, 이후 뉴스 해석과 시나리오 영향 분석이 같은 기준에서 움직입니다."
            className="mb-5"
            titleClassName="text-xl"
            descriptionClassName="max-w-2xl text-sm"
          />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {EXPOSURE_FIELDS.map((field) => (
              <label key={field.key} className={SETTINGS_ROW_PANEL_CLASSNAME}>
                <span className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">{field.label}</span>
                <select
                  className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-700 outline-none transition-colors focus:border-primary"
                  value={state.draft[field.key]}
                  onChange={(event) => state.updateExposure(field.key, event.target.value as ExposureDraft[typeof field.key])}
                >
                  {field.options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
            ))}
          </div>
        </div>
      </Card>
    </section>
  );
}

export function NewsSettingsSourcesSection({ state }: { state: NewsSettingsSourcesState }) {
  return (
    <section>
      <Card id="news-settings-sources" className="rounded-[2.5rem] border border-slate-200/90 bg-white p-6 shadow-sm shadow-slate-200/40 md:p-8">
        <SubSectionHeader
          title="소스 우선순위"
          description="토글과 가중치 입력만 남기고, 소스 목록은 한 줄 작업면으로 정리해 어디부터 확인할지 바로 읽히게 했습니다."
          className="mb-5"
          titleClassName="text-xl"
          descriptionClassName="max-w-2xl text-sm"
        />
        {state.loading ? <p className="animate-pulse text-sm text-slate-500">불러오는 중...</p> : (
          <div className="overflow-hidden rounded-[1.75rem] border border-slate-200/90 bg-surface-muted/80">
            <div className="hidden grid-cols-[minmax(0,1.3fr)_auto_auto] gap-4 border-b border-slate-200/80 px-5 py-3 text-[10px] font-black uppercase tracking-[0.22em] text-slate-400 md:grid">
              <span>뉴스 소스</span>
              <span className="text-center">가중치</span>
              <span className="text-center">사용</span>
            </div>
            <div className="divide-y divide-slate-200/70">
              {state.rows.map((row) => (
                <div key={row.id} className="grid gap-4 px-4 py-4 transition-colors hover:bg-white/80 md:grid-cols-[minmax(0,1.3fr)_auto_auto] md:items-center md:px-5">
                  <div className="min-w-0">
                    <p className="text-sm font-black tracking-tight text-navy">{row.name}</p>
                    <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
                      {row.country} · {row.language} · Default {row.defaultWeight}
                    </p>
                  </div>
                  <label className="flex items-center justify-between gap-3 md:justify-self-end">
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 md:hidden">가중치</span>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="3"
                      value={state.drafts[row.id]?.weight ?? String(row.defaultWeight)}
                      onChange={(event) => state.updateSourceWeight(row.id, event.target.value)}
                      className="w-20 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 outline-none transition-colors focus:border-primary"
                    />
                  </label>
                  <label className="flex items-center justify-between gap-3 md:justify-self-end">
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 md:hidden">사용</span>
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                      checked={state.drafts[row.id]?.enabled ?? row.defaultEnabled}
                      onChange={(event) => state.updateSourceEnabled(row.id, event.target.checked)}
                    />
                  </label>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>
    </section>
  );
}

export function NewsSettingsTopicsSection({ state }: { state: NewsSettingsTopicsState }) {
  return (
    <section>
      <Card id="news-settings-topics" className="rounded-[2.5rem] border border-slate-200/90 bg-white p-6 shadow-sm shadow-slate-200/40 md:p-8">
        <SubSectionHeader
          title="토픽 키워드"
          description="기본 키워드를 대체할 때만 수정하도록 기본값과 입력면을 같은 행 안에서 읽히게 배치했습니다."
          className="mb-5"
          titleClassName="text-xl"
          descriptionClassName="max-w-2xl text-sm"
        />
        <div className="grid gap-4">
          {state.rows.map((row) => (
            <div key={row.id} className={SETTINGS_PANEL_SUBTLE_CLASSNAME}>
              <div className="grid gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:items-start">
                <div className="min-w-0">
                  <p className="text-base font-black tracking-tight text-navy">{row.label}</p>
                  <p className="mt-2 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
                    기본: {row.defaultKeywords.join(", ")}
                  </p>
                </div>
                <textarea
                  value={state.drafts[row.id]?.keywordsText ?? ""}
                  onChange={(event) => state.updateTopicKeywords(row.id, event.target.value)}
                  placeholder="기본 키워드 대신 사용할 단어들..."
                  rows={3}
                  className="w-full rounded-[1.35rem] border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 outline-none transition-colors focus:border-primary"
                />
              </div>
            </div>
          ))}
        </div>
      </Card>
    </section>
  );
}

export function NewsSettingsAdvancedSection({ state }: { state: NewsSettingsAdvancedState }) {
  return (
    <>
      <section>
        <Card className="rounded-[2.25rem] border border-slate-200/90 bg-surface-muted/90 p-6 shadow-sm shadow-slate-200/40">
          <SubSectionHeader
            title="보조 컨텍스트"
            description="왼쪽 작업면을 조정할 때 바로 참고할 저장 기준과 알림 상태를 한곳에 모았습니다."
            className="mb-5"
            titleClassName="text-lg"
            descriptionClassName="text-sm"
          />
          <div className="space-y-3">
            <div className={SETTINGS_PANEL_CLASSNAME}>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">뉴스 기준 저장 상태</p>
              <p className="mt-2 text-sm font-bold leading-relaxed text-slate-800">{state.newsSettingsStatusText}</p>
              <p className="mt-2 text-xs text-slate-500">기준 반영 시각: {formatDateTime(state.updatedAt)}</p>
            </div>
            <div className={SETTINGS_PANEL_CLASSNAME}>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">프로필 기준 반영</p>
              <p className="mt-2 text-sm font-bold text-slate-800">{state.exposureCompletionCount}/10 항목 입력</p>
              <p className="mt-2 text-xs text-slate-500">프로필 저장 시각: {formatDateTime(state.exposureUpdatedAt)}</p>
            </div>
            <div className={SETTINGS_PANEL_CLASSNAME}>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">알림 규칙 현재 적용 상태</p>
              <p className="mt-2 text-sm font-bold leading-relaxed text-slate-800">{state.alertRulesSectionStatusText}</p>
              <p className="mt-2 text-xs text-slate-500">알림 규칙 기준 시각: {formatDateTime(state.alertRulesUpdatedAt)}</p>
            </div>
          </div>
        </Card>
      </section>

      <section>
        <Card id="news-settings-advanced" className="rounded-[2.5rem] border border-slate-200/90 bg-white p-6 shadow-sm shadow-slate-200/40 md:p-8">
          <SubSectionHeader
            title="고급 관리 및 알림 규칙"
            description="알림 조건 오버라이드와 소스·지표 JSON 벌크 관리를 보조 패널로 분리해, 주 작업면과 목적이 섞이지 않게 했습니다."
            className="mb-5"
            titleClassName="text-xl"
            descriptionClassName="text-sm"
          />

          <details id="news-settings-alert-rules" className="group rounded-[1.9rem] border border-slate-200/90 bg-surface-muted/75 p-5" open>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-400 transition-transform group-open:rotate-90">▶</span>
                <div>
                  <p className="text-sm font-black uppercase tracking-[0.18em] text-navy">알림 규칙 오버라이드 (JSON)</p>
                  <p className="mt-1 text-xs text-slate-500">알림 규칙은 이 섹션에서만 적용되며, 메인 저장과 별개입니다.</p>
                </div>
              </div>
              <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-black text-slate-500 tabular-nums">OVERRIDE: {state.alertRuleOverridesCount}</span>
            </summary>
            <div className="mt-5 space-y-5">
              <div className={SETTINGS_PANEL_CLASSNAME}>
                <div className="mb-4 flex flex-wrap items-center gap-3">
                  <button type="button" onClick={() => { void state.handleAlertRulesAction("reload"); }} disabled={state.alertRulesPhase !== "idle" || state.alertRulesDirty} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700 transition-colors hover:bg-surface-muted disabled:opacity-60"> {state.alertRulesPhase === "reloading" ? "로딩 중..." : "현재 적용값 불러오기"} </button>
                  <button type="button" onClick={() => { void state.handleAlertRulesAction("apply"); }} disabled={state.alertRulesPhase !== "idle" || !state.alertRulesDirty} className="rounded-xl bg-slate-900 px-5 py-2 text-xs font-black text-white transition-colors hover:bg-slate-800 disabled:opacity-60"> {state.alertRulesPhase === "applying" ? "적용 중..." : "알림 규칙 적용"} </button>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                  <span className="text-slate-500">적용 뒤 결과 확인</span>
                  <Link href="/planning/v3/news/alerts" className={ALERT_RULES_FOLLOW_THROUGH_LINK_CLASSNAME}>알림함 확인</Link>
                  <Link href="/planning/v3/news" className={ALERT_RULES_FOLLOW_THROUGH_LINK_CLASSNAME}>Digest 확인</Link>
                </div>
                <p className="mt-4 text-xs font-bold leading-relaxed text-slate-600">{state.alertRulesSectionStatusText}</p>
              </div>
              <textarea value={state.alertRulesJson} onChange={(event) => state.setAlertRulesJson(event.target.value)} rows={6} className="w-full rounded-[1.6rem] border border-slate-200 bg-slate-950 p-5 font-mono text-[11px] text-primary outline-none shadow-inner focus:ring-1 focus:ring-primary" placeholder="JSON 오버라이드 입력..." />
              {state.alertRulesIoSummary ? <p className="text-xs font-bold text-primary">✅ {state.alertRulesIoSummary}</p> : null}
              <div className="space-y-3">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">활성 규칙 리스트 ({state.alertRuleDraftEffective.length})</p>
                <div className="max-h-64 overflow-auto rounded-[1.6rem] border border-slate-200 bg-white">
                  <table className="min-w-full text-left">
                    <thead className="sticky top-0 border-b border-slate-200 bg-surface-muted">
                      <tr className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                        <th className="px-4 py-3">유형</th>
                        <th className="px-4 py-3">조건</th>
                        <th className="px-4 py-3 text-center">상태</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {state.alertRuleDraftEffective.map((row) => (
                        <tr key={row.id} className="transition-colors hover:bg-surface-muted/80">
                          <td className="px-4 py-4">
                            <p className="text-xs font-black text-navy">{asString(row.name) || row.id}</p>
                            <p className="text-[10px] font-bold uppercase text-slate-400">{formatAlertRuleKind(row.kind)}</p>
                          </td>
                          <td className="px-4 py-4 text-xs font-medium leading-relaxed text-slate-600">{formatAlertRuleSummary(row)}</td>
                          <td className="px-4 py-4 text-center">
                            <span className={cn("inline-block rounded-lg px-2 py-0.5 text-[10px] font-black tabular-nums", row.enabled !== false ? "bg-primary/5 text-navy" : "bg-surface-muted text-slate-400")}>{row.enabled !== false ? "ACTIVE" : "DISABLED"}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </details>

          <details className="group mt-5 rounded-[1.9rem] border border-slate-200/90 bg-surface-muted/75 p-5">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-400 transition-transform group-open:rotate-90">▶</span>
                <div>
                  <p className="text-sm font-black uppercase tracking-[0.18em] text-navy">소스 및 지표 벌크 IO (고급)</p>
                  <p className="mt-1 text-xs text-slate-500">수동 편집보다 대량 동기화가 필요한 경우에만 여는 보조 작업면입니다.</p>
                </div>
              </div>
            </summary>
            <div className="mt-5 space-y-6">
              <div className={SETTINGS_PANEL_CLASSNAME}>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-navy">뉴스 소스 데이터 (JSON)</p>
                </div>
                <textarea value={state.sourcesJson} onChange={(event) => state.setSourcesJson(event.target.value)} rows={4} className="mt-4 w-full rounded-[1.35rem] border border-slate-200 bg-slate-950 p-4 font-mono text-[10px] text-sky-400 outline-none shadow-inner" />
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <button type="button" disabled={state.sourcesIoLoading} onClick={() => { void state.handleIo("sources", "export"); }} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700 transition-colors hover:bg-surface-muted shadow-sm">내보내기</button>
                  <button type="button" disabled={state.sourcesIoLoading} onClick={() => { void state.handleIo("sources", "import", "dry_run"); }} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700 transition-colors hover:bg-surface-muted shadow-sm">가져오기 (Dry-run)</button>
                  <button type="button" disabled={state.sourcesIoLoading} onClick={() => { void state.handleIo("sources", "import", "apply"); }} className="rounded-xl bg-slate-900 px-5 py-2 text-xs font-black text-white transition-colors hover:bg-slate-800 shadow-sm">가져오기 (적용)</button>
                </div>
                {state.sourcesIoSummary ? <p className="mt-3 text-[11px] font-bold text-primary">✅ {state.sourcesIoSummary}</p> : null}
              </div>
              <div className={SETTINGS_PANEL_CLASSNAME}>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-navy">지표 Series Specs (JSON)</p>
                </div>
                <textarea value={state.specsJson} onChange={(event) => state.setSpecsJson(event.target.value)} rows={4} className="mt-4 w-full rounded-[1.35rem] border border-slate-200 bg-slate-950 p-4 font-mono text-[10px] text-sky-400 outline-none shadow-inner" />
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <button type="button" disabled={state.specsIoLoading} onClick={() => { void state.handleIo("specs", "export"); }} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700 transition-colors hover:bg-surface-muted shadow-sm">내보내기</button>
                  <button type="button" disabled={state.specsIoLoading} onClick={() => { void state.handleIo("specs", "import", "dry_run"); }} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700 transition-colors hover:bg-surface-muted shadow-sm">가져오기 (Dry-run)</button>
                  <button type="button" disabled={state.specsIoLoading} onClick={() => { void state.handleIo("specs", "import", "apply"); }} className="rounded-xl bg-slate-900 px-5 py-2 text-xs font-black text-white transition-colors hover:bg-slate-800 shadow-sm">가져오기 (적용)</button>
                </div>
                {state.specsIoSummary ? <p className="mt-3 text-[11px] font-bold text-primary">✅ {state.specsIoSummary}</p> : null}
              </div>
            </div>
          </details>
        </Card>
      </section>
    </>
  );
}
