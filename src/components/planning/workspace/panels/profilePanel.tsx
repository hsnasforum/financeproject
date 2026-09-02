import { estimateDebtMonthlyPaymentKrw } from "@/lib/planning/ui/profileFormModel";
import ProfileV2Form from "@/components/planning/ProfileV2Form";
import { Button } from "@/components/ui/Button";
import {
  bodyCompactFieldClassName,
  bodyFieldClassName,
  bodyLabelClassName,
  bodyTextAreaClassName,
} from "@/components/ui/BodyTone";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { SubSectionHeader } from "@/components/ui/SubSectionHeader";
import type { PlanningWorkspaceGroups } from "@/components/planning/workspace/groups";
import { cn } from "@/lib/utils";
import { formatKrw, formatPct } from "@/lib/planning/i18n/format";
import { SIDO_ADMIN_2025 } from "@/lib/regions/kr_admin_2025";
import {
  formatGroupedIntegerInput,
  formatSeverityKo,
  inputToMonthOffset,
  monthOffsetToInput,
  normalizeLooseNumberText,
  toFiniteNumber,
} from "@/components/planning/workspace/panels/shared";

const BEGINNER_MAX_DEBT_ROWS = 3;

export function PlanningWorkspaceProfilePanel({
  profile,
  actions,
}: {
  profile: PlanningWorkspaceGroups["profile"];
  actions: PlanningWorkspaceGroups["actions"];
}) {
  const {
    locale,
    beginnerMode,
    loadingProfiles,
    profiles,
    profilesLoadError,
    selectedProfileId,
    profileName,
    profileJsonDraft,
    profileJsonError,
    profileForm,
    benefitSigunguOptions,
    liveSummary,
    pendingProfileSave,
    pendingSuggestions,
    acceptedSuggestionCodes,
    savingProfile,
    running,
    profileValidation,
    beginnerGoals,
    beginnerEmergencyMonths,
  } = profile;
  const {
    setSelectedProfileId,
    loadProfiles,
    markProfileEditorLocalEdit,
    setProfileName,
    updateProfileField,
    applyProfileForm,
    addDebtRow,
    removeDebtRow,
    updateDebtRow,
    addGoalRow,
    removeGoalRow,
    updateGoalRow,
    updateBeginnerGoal,
    replaceProfileFromJsonText,
    applyProfileJsonEditorAction,
    copyProfileJsonEditorAction,
    loadSampleProfileAction,
    beginProfileSave,
    applySuggestedProfileSaveAction,
    continueProfileSaveWithoutSuggestionsAction,
    deleteProfileAction,
    clearPendingSuggestions,
    toggleSuggestionCode,
  } = actions;
  const selectNeedsPendingOption = Boolean(
    selectedProfileId
    && !profiles.some((profileOption) => profileOption.id === selectedProfileId),
  );

  return (
    <ProfileV2Form modeLabel={beginnerMode ? "초보자 모드" : "고급 모드"}>
      <fieldset className="contents" disabled={running}>
      {loadingProfiles && profiles.length < 1 ? (
        <LoadingState
          title="프로필 목록을 불러오는 중입니다"
          description="저장된 프로필을 확인하고 있습니다."
          testId="planning-profiles-loading-state"
        />
      ) : null}
      {profilesLoadError ? (
        <ErrorState
          message={profilesLoadError}
          retryLabel="다시 불러오기"
          onRetry={() => {
            void loadProfiles(selectedProfileId);
          }}
          testId="planning-profiles-error-state"
        />
      ) : null}
      {!loadingProfiles && !profilesLoadError && profiles.length < 1 ? (
        <EmptyState
          actionLabel="샘플 프로필 불러오기"
          description="저장된 프로필이 없습니다. 샘플을 불러온 뒤 저장해서 시작할 수 있습니다."
          onAction={loadSampleProfileAction}
          title="저장된 프로필이 없습니다"
        />
      ) : null}

      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-surface-muted p-3">
          <span className="ml-1 text-[10px] font-black uppercase tracking-widest text-slate-400">프로필 선택</span>
          <select
            className="flex-1 cursor-pointer bg-transparent text-sm font-bold outline-none"
            aria-label="프로필 선택"
            disabled={running}
            value={selectedProfileId}
            onChange={(event) => setSelectedProfileId(event.target.value)}
          >
            {selectNeedsPendingOption ? <option hidden value={selectedProfileId} /> : null}
            {profiles.length === 0 ? <option value="">저장된 프로필 없음</option> : null}
            {profiles.map((profileOption) => (
              <option key={profileOption.id} value={profileOption.id}>{profileOption.name}</option>
            ))}
          </select>
        </div>

      </div>

      <div onFocusCapture={markProfileEditorLocalEdit}>
        <label className={`block text-xs ${bodyLabelClassName}`}>
          프로필 이름
          <input
            className={cn(bodyFieldClassName, "h-11 rounded-xl border-slate-200 font-bold focus:border-primary focus:ring-primary/10")}
            value={profileName}
            onChange={(event) => {
              setProfileName(event.target.value);
              updateProfileField("name", event.target.value);
            }}
          />
        </label>
      </div>

      <div className="space-y-6 rounded-[2rem] border border-slate-100 bg-surface-muted/50 p-6" onFocusCapture={markProfileEditorLocalEdit}>
        <SubSectionHeader title="혜택 추천용 기본 조건" titleClassName="text-sm" description="출생연도, 성별, 지역을 입력하여 추천 범위를 좁힙니다." />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <label className={`block text-xs ${bodyLabelClassName}`}>
            출생연도
            <input
              className={cn(bodyFieldClassName, "h-10 rounded-xl border-slate-200")}
              inputMode="numeric"
              placeholder="예: 1994"
              type="text"
              value={profileForm.birthYear ? String(profileForm.birthYear) : ""}
              onChange={(event) => {
                const raw = normalizeLooseNumberText(event.target.value).replace(/\D/g, "");
                updateProfileField("birthYear", raw ? Math.trunc(Number(raw)) : undefined);
              }}
            />
          </label>
          <label className={`block text-xs ${bodyLabelClassName}`}>
            성별
            <select
              className={cn(bodyFieldClassName, "h-10 rounded-xl border-slate-200")}
              value={profileForm.gender ?? ""}
              onChange={(event) => {
                const next = event.target.value;
                updateProfileField("gender", next === "" ? undefined : next as "M" | "F");
              }}
            >
              <option value="">선택 안 함</option>
              <option value="F">여성</option>
              <option value="M">남성</option>
            </select>
          </label>
          <label className={`block text-xs ${bodyLabelClassName}`}>
            시/도
            <select
              className={cn(bodyFieldClassName, "h-10 rounded-xl border-slate-200")}
              value={profileForm.sido ?? ""}
              onChange={(event) => {
                const nextSido = event.target.value;
                applyProfileForm({
                  ...profileForm,
                  sido: nextSido || "",
                  sigungu: "",
                });
              }}
            >
              <option value="">선택 안 함</option>
              {SIDO_ADMIN_2025.map((entry) => (
                <option key={entry.code} value={entry.name}>{entry.name}</option>
              ))}
            </select>
          </label>
          <label className={`block text-xs ${bodyLabelClassName}`}>
            시/군/구
            <select
              className={cn(bodyFieldClassName, "h-10 rounded-xl border-slate-200")}
              disabled={!profileForm.sido}
              value={profileForm.sigungu ?? ""}
              onChange={(event) => updateProfileField("sigungu", event.target.value || "")}
            >
              <option value="">선택 안 함</option>
              {benefitSigunguOptions.map((entry) => (
                <option key={entry.code} value={entry.name}>{entry.name}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="space-y-6 rounded-[2rem] border border-slate-100 bg-surface-muted/50 p-6" onFocusCapture={markProfileEditorLocalEdit}>
        <SubSectionHeader title="월 현금흐름" titleClassName="text-sm" />
        <div className="grid gap-3 sm:grid-cols-3">
          <label className={`block text-xs ${bodyLabelClassName}`}>
            월 실수령
            <div className="mt-1 flex items-center gap-2">
              <input
                className={cn(bodyFieldClassName.replace("mt-1 ", ""), "h-10 rounded-xl border-slate-200")}
                inputMode="numeric"
                type="text"
                placeholder="예: 5,100,000"
                value={formatGroupedIntegerInput(profileForm.monthlyIncomeNet)}
                onChange={(event) => updateProfileField("monthlyIncomeNet", toFiniteNumber(event.target.value))}
              />
              <span className="text-[11px] font-medium text-slate-500">(원)</span>
            </div>
          </label>
          <label className={`block text-xs ${bodyLabelClassName}`}>
            필수지출
            <div className="mt-1 flex items-center gap-2">
              <input
                className={cn(bodyFieldClassName.replace("mt-1 ", ""), "h-10 rounded-xl border-slate-200")}
                inputMode="numeric"
                type="text"
                placeholder="예: 2,200,000"
                value={formatGroupedIntegerInput(profileForm.monthlyEssentialExpenses)}
                onChange={(event) => updateProfileField("monthlyEssentialExpenses", toFiniteNumber(event.target.value))}
              />
              <span className="text-[11px] font-medium text-slate-500">(원)</span>
            </div>
          </label>
          <label className={`block text-xs ${bodyLabelClassName}`}>
            선택지출
            <div className="mt-1 flex items-center gap-2">
              <input
                className={cn(bodyFieldClassName.replace("mt-1 ", ""), "h-10 rounded-xl border-slate-200")}
                inputMode="numeric"
                type="text"
                placeholder="예: 900,000"
                value={formatGroupedIntegerInput(profileForm.monthlyDiscretionaryExpenses)}
                onChange={(event) => updateProfileField("monthlyDiscretionaryExpenses", toFiniteNumber(event.target.value))}
              />
              <span className="text-[11px] font-medium text-slate-500">(원)</span>
            </div>
          </label>
        </div>
      </div>

      <div className="space-y-6 rounded-[2rem] border border-slate-100 bg-surface-muted/50 p-6" onFocusCapture={markProfileEditorLocalEdit}>
        <SubSectionHeader title="자산" titleClassName="text-sm" />
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={`block text-xs ${bodyLabelClassName}`}>
            현금(예금)
            <div className="mt-1 flex items-center gap-2">
              <input
                className={cn(bodyFieldClassName.replace("mt-1 ", ""), "h-10 rounded-xl border-slate-200")}
                inputMode="numeric"
                type="text"
                placeholder="예: 12,000,000"
                value={formatGroupedIntegerInput(profileForm.liquidAssets)}
                onChange={(event) => updateProfileField("liquidAssets", toFiniteNumber(event.target.value))}
              />
              <span className="text-[11px] font-medium text-slate-500">(원)</span>
            </div>
          </label>
          <label className={`block text-xs ${bodyLabelClassName}`}>
            투자자산
            <div className="mt-1 flex items-center gap-2">
              <input
                className={cn(bodyFieldClassName.replace("mt-1 ", ""), "h-10 rounded-xl border-slate-200")}
                inputMode="numeric"
                type="text"
                placeholder="예: 18,000,000"
                value={formatGroupedIntegerInput(profileForm.investmentAssets)}
                onChange={(event) => updateProfileField("investmentAssets", toFiniteNumber(event.target.value))}
              />
              <span className="text-[11px] font-medium text-slate-500">(원)</span>
            </div>
          </label>
        </div>
      </div>

      <div className="space-y-6 rounded-[2rem] border border-slate-100 bg-surface-muted/50 p-6" onFocusCapture={markProfileEditorLocalEdit}>
        <SubSectionHeader
          title="부채 리스트"
          titleClassName="text-sm"
          description={beginnerMode ? "초보자 모드는 부채 1~3개 입력을 권장합니다." : undefined}
          action={(
            <Button
              disabled={beginnerMode && profileForm.debts.length >= BEGINNER_MAX_DEBT_ROWS}
              onClick={addDebtRow}
              size="sm"
              variant="outline"
              className="rounded-xl bg-white font-bold"
            >
              부채 추가
            </Button>
          )}
        />

        {profileForm.debts.length === 0 ? (
          <EmptyState
            className="border-dashed bg-white/50"
            description="부채가 없다면 비워두고 진행해도 됩니다. 월 상환액이 있는 항목만 추가하세요."
            title="등록된 부채가 없습니다."
          />
        ) : (
          <div className="space-y-3">
            {profileForm.debts.map((debt, index) => {
              const estimated = estimateDebtMonthlyPaymentKrw(debt);
              return (
                <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm" key={debt.id || `debt-${index}`}>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className={`block text-xs ${bodyLabelClassName}`}>
                      부채 ID
                      <input
                        className={cn(bodyFieldClassName, "rounded-lg border-slate-200")}
                        value={debt.id}
                        onChange={(event) => updateDebtRow(index, { ...debt, id: event.target.value })}
                      />
                    </label>
                    <label className={`block text-xs ${bodyLabelClassName}`}>
                      이름
                      <input
                        className={cn(bodyFieldClassName, "rounded-lg border-slate-200")}
                        value={debt.name}
                        onChange={(event) => updateDebtRow(index, { ...debt, name: event.target.value })}
                      />
                    </label>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <label className={`block text-xs ${bodyLabelClassName}`}>
                      대출 잔액
                      <div className="mt-1 flex min-w-0 items-center gap-2">
                        <input
                          className={cn(bodyCompactFieldClassName, "min-w-0 flex-1 rounded-lg border-slate-200")}
                          inputMode="numeric"
                          type="text"
                          placeholder="예: 25,000,000"
                          value={formatGroupedIntegerInput(debt.balance)}
                          onChange={(event) => updateDebtRow(index, { ...debt, balance: toFiniteNumber(event.target.value) })}
                        />
                        <span className="text-[11px] font-medium text-slate-500">(원)</span>
                      </div>
                    </label>
                    <label className={`block text-xs ${bodyLabelClassName}`}>
                      금리
                      <div className="mt-1 flex min-w-0 items-center gap-2">
                        <input
                          className={cn(bodyCompactFieldClassName, "min-w-0 flex-1 rounded-lg border-slate-200")}
                          type="number"
                          placeholder="예: 4.8"
                          value={debt.aprPct}
                          onChange={(event) => updateDebtRow(index, { ...debt, aprPct: toFiniteNumber(event.target.value) })}
                        />
                        <span className="text-[11px] font-medium text-slate-500">(%)</span>
                      </div>
                    </label>
                    <label className={`block text-xs ${bodyLabelClassName}`}>
                      최소 상환액
                      <div className="mt-1 flex min-w-0 items-center gap-2">
                        <input
                          className={cn(bodyCompactFieldClassName, "min-w-0 flex-1 rounded-lg border-slate-200")}
                          inputMode="numeric"
                          type="text"
                          min={0}
                          placeholder="예: 650,000"
                          value={formatGroupedIntegerInput(debt.monthlyPayment)}
                          onChange={(event) => updateDebtRow(index, { ...debt, monthlyPayment: Math.max(0, toFiniteNumber(event.target.value)) })}
                        />
                        <span className="text-[11px] font-medium text-slate-500">(원)</span>
                      </div>
                    </label>
                  </div>
                  <details className="mt-4 rounded-xl border border-slate-100 bg-surface-muted p-4">
                    <summary className="cursor-pointer text-xs font-black uppercase tracking-widest text-slate-500">상환 조건(고급)</summary>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <label className={`block text-xs ${bodyLabelClassName}`}>
                        상환 방식
                        <select
                          className={cn(bodyFieldClassName, "rounded-lg border-slate-200")}
                          value={debt.repaymentType}
                          onChange={(event) => updateDebtRow(index, {
                            ...debt,
                            repaymentType: event.target.value === "interestOnly" ? "interestOnly" : "amortizing",
                          })}
                        >
                          <option value="amortizing">원리금 분할상환</option>
                          <option value="interestOnly">이자만 상환</option>
                        </select>
                      </label>
                      <label className={`block text-xs ${bodyLabelClassName}`}>
                        남은 개월
                        <div className="mt-1 flex min-w-0 items-center gap-2">
                          <input
                            className={cn(bodyCompactFieldClassName, "min-w-0 flex-1 rounded-lg border-slate-200")}
                            type="number"
                            min={1}
                            placeholder="예: 60"
                            value={debt.remainingMonths}
                            onChange={(event) => updateDebtRow(index, { ...debt, remainingMonths: Math.max(1, Math.trunc(toFiniteNumber(event.target.value, 1))) })}
                          />
                          <span className="text-[11px] font-medium text-slate-500">(개월)</span>
                        </div>
                      </label>
                    </div>
                    <div className="mt-4 flex items-center justify-between gap-2 text-xs">
                      <p className="font-medium italic text-slate-500">추정 월상환액(참고): <span className="font-black text-navy">{formatKrw(locale, estimated)}</span></p>
                      <Button
                        aria-label={`부채 ${index + 1} 추정 월상환액 적용`}
                        onClick={() => updateDebtRow(index, { ...debt, monthlyPayment: estimated })}
                        size="sm"
                        variant="outline"
                        className="h-8 rounded-lg bg-white"
                      >
                        추정치 적용
                      </Button>
                    </div>
                  </details>
                  <div className="mt-4 flex items-center justify-between border-t border-slate-50 pt-4">
                    <p className="text-xs font-bold text-primary">입력 월상환액: {formatKrw(locale, debt.monthlyPayment)}</p>
                    <Button
                      aria-label={`부채 ${index + 1} 삭제`}
                      disabled={beginnerMode && profileForm.debts.length <= 1}
                      onClick={() => removeDebtRow(index)}
                      size="sm"
                      variant="ghost"
                      className="h-8 font-bold text-rose-600 hover:bg-rose-50"
                    >
                      삭제
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="space-y-6 rounded-[2rem] border border-slate-100 bg-surface-muted/50 p-6" onFocusCapture={markProfileEditorLocalEdit}>
        <SubSectionHeader
          title="목표"
          titleClassName="text-sm"
          action={!beginnerMode && <Button onClick={addGoalRow} size="sm" variant="outline" className="rounded-xl bg-white font-bold">목표 추가</Button>}
        />
        {beginnerMode ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <label className="block text-xs font-bold uppercase tracking-widest text-slate-500">
                비상금 목표(개월)
                <input
                  className="mt-2 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold"
                  min={1}
                  type="number"
                  value={beginnerEmergencyMonths}
                  onChange={(event) => {
                    const months = Math.max(1, Math.trunc(toFiniteNumber(event.target.value, beginnerEmergencyMonths)));
                    const monthlyExpenses = Math.max(0, profileForm.monthlyEssentialExpenses + profileForm.monthlyDiscretionaryExpenses);
                    updateBeginnerGoal("emergency", {
                      targetAmount: Math.round(monthlyExpenses * months),
                    });
                  }}
                />
              </label>
            </div>
            <div className="grid gap-4 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm sm:grid-cols-2">
              <label className="block text-xs font-bold uppercase tracking-widest text-slate-500">
                목돈 목표 금액(KRW)
                <input
                  className="mt-2 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold"
                  min={0}
                  inputMode="numeric"
                  type="text"
                  value={formatGroupedIntegerInput(beginnerGoals.lumpSum.targetAmount)}
                  onChange={(event) => updateBeginnerGoal("lumpSum", { targetAmount: Math.max(0, toFiniteNumber(event.target.value)) })}
                />
              </label>
              <label className="block text-xs font-bold uppercase tracking-widest text-slate-500">
                목돈 목표까지 남은 기간(개월)
                <input
                  className="mt-2 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold"
                  inputMode="numeric"
                  max={1200}
                  min={1}
                  step={1}
                  type="number"
                  value={monthOffsetToInput(beginnerGoals.lumpSum.targetMonth)}
                  onChange={(event) => updateBeginnerGoal("lumpSum", { targetMonth: inputToMonthOffset(event.target.value, beginnerGoals.lumpSum.targetMonth) })}
                />
              </label>
            </div>
            <div className="grid gap-4 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm sm:grid-cols-2">
              <label className="block text-xs font-bold uppercase tracking-widest text-slate-500">
                은퇴 목표 금액(KRW)
                <input
                  className="mt-2 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold"
                  min={0}
                  inputMode="numeric"
                  type="text"
                  value={formatGroupedIntegerInput(beginnerGoals.retirement.targetAmount)}
                  onChange={(event) => updateBeginnerGoal("retirement", { targetAmount: Math.max(0, toFiniteNumber(event.target.value)) })}
                />
              </label>
              <label className="block text-xs font-bold uppercase tracking-widest text-slate-500">
                은퇴 목표까지 남은 기간(개월)
                <input
                  className="mt-2 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold"
                  inputMode="numeric"
                  max={1200}
                  min={1}
                  step={1}
                  type="number"
                  value={monthOffsetToInput(beginnerGoals.retirement.targetMonth)}
                  onChange={(event) => updateBeginnerGoal("retirement", { targetMonth: inputToMonthOffset(event.target.value, beginnerGoals.retirement.targetMonth) })}
                />
              </label>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {profileForm.goals.length === 0 ? (
              <EmptyState
                className="border-dashed bg-white/50"
                description="목돈 마련이나 은퇴 목표가 있다면 추가하여 달성 가능성을 비교해 보세요."
                title="등록된 목표가 없습니다."
              />
            ) : (
              <div className="space-y-3">
                {profileForm.goals.map((goal, index) => (
                  <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm" key={goal.id || `goal-${index}`}>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className={`block text-xs ${bodyLabelClassName}`}>
                        목표 ID
                        <input
                          className={cn(bodyFieldClassName, "rounded-lg border-slate-200")}
                          value={goal.id}
                          onChange={(event) => updateGoalRow(index, { ...goal, id: event.target.value })}
                          placeholder="goal-id"
                        />
                      </label>
                      <label className={`block text-xs ${bodyLabelClassName}`}>
                        목표 이름
                        <input
                          className={cn(bodyFieldClassName, "rounded-lg border-slate-200")}
                          value={goal.name}
                          onChange={(event) => updateGoalRow(index, { ...goal, name: event.target.value })}
                          placeholder="목표 이름"
                        />
                      </label>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      <label className={`block text-xs ${bodyLabelClassName}`}>
                        목표 금액
                        <input
                          className={cn(bodyCompactFieldClassName, "mt-1 w-full rounded-lg border-slate-200")}
                          inputMode="numeric"
                          type="text"
                          value={formatGroupedIntegerInput(goal.targetAmount)}
                          onChange={(event) => updateGoalRow(index, { ...goal, targetAmount: Math.max(0, toFiniteNumber(event.target.value)) })}
                        />
                      </label>
                      <label className={`block text-xs ${bodyLabelClassName}`}>
                        현재 금액
                        <input
                          className={cn(bodyCompactFieldClassName, "mt-1 w-full rounded-lg border-slate-200")}
                          inputMode="numeric"
                          type="text"
                          value={formatGroupedIntegerInput(goal.currentAmount)}
                          onChange={(event) => updateGoalRow(index, { ...goal, currentAmount: Math.max(0, toFiniteNumber(event.target.value)) })}
                        />
                      </label>
                      <label className={`block text-xs ${bodyLabelClassName}`}>
                        목표까지 남은 기간(개월)
                        <input
                          className={cn(bodyCompactFieldClassName, "mt-1 w-full rounded-lg border-slate-200")}
                          inputMode="numeric"
                          max={1200}
                          min={1}
                          step={1}
                          type="number"
                          value={monthOffsetToInput(goal.targetMonth)}
                          onChange={(event) => updateGoalRow(index, { ...goal, targetMonth: inputToMonthOffset(event.target.value, goal.targetMonth) })}
                        />
                      </label>
                    </div>
                    <div className="mt-4 flex items-center justify-between border-t border-slate-50 pt-4">
                      <div className="flex gap-4">
                        <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                          우선순위
                          <input
                            className="h-7 w-12 rounded border-slate-200 text-center font-bold text-slate-700"
                            type="number"
                            min={1}
                            value={goal.priority}
                            onChange={(event) => updateGoalRow(index, { ...goal, priority: Math.max(1, Math.trunc(toFiniteNumber(event.target.value, 1))) })}
                          />
                        </label>
                        <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                          최소 납입
                          <input
                            className="h-7 w-24 rounded border-slate-200 text-center font-bold text-slate-700"
                            inputMode="numeric"
                            type="text"
                            value={formatGroupedIntegerInput(goal.minimumMonthlyContribution)}
                            onChange={(event) => updateGoalRow(index, { ...goal, minimumMonthlyContribution: Math.max(0, toFiniteNumber(event.target.value)) })}
                          />
                        </label>
                      </div>
                      <Button aria-label={`목표 ${index + 1} 삭제`} onClick={() => removeGoalRow(index)} size="sm" variant="ghost" className="h-8 font-bold text-rose-600 hover:bg-rose-50">
                        삭제
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="grid gap-3 rounded-[2rem] border border-primary/10 bg-primary/5 p-6 text-xs">
        <div className="flex items-center justify-between">
          <span className="font-bold text-navy">월 잉여금</span>
          <span className="text-lg font-black tabular-nums text-success">{formatKrw(locale, liveSummary.monthlySurplus)}</span>
        </div>
        <div className="h-px bg-primary/50" />
        <div className="grid grid-cols-2 gap-4 text-[11px] font-bold text-navy">
          <p className="flex justify-between"><span>DSR</span> <span>{formatPct(locale, liveSummary.dsrPct)}</span></p>
          <p className="flex justify-between"><span>총 월상환</span> <span>{formatKrw(locale, liveSummary.totalMonthlyDebtPayment)}</span></p>
          <p className="flex justify-between"><span>비상금 목표</span> <span>{formatKrw(locale, liveSummary.emergencyTargetKrw)}</span></p>
          <p className="flex justify-between"><span>비상금 부족</span> <span className="text-rose-600">{formatKrw(locale, liveSummary.emergencyGapKrw)}</span></p>
        </div>
      </div>

      {profileValidation.errors.length > 0 ? (
        <div className="space-y-2 rounded-2xl border border-rose-100 bg-rose-50 p-5">
          <p className="text-sm font-black text-rose-800">입력 오류 ({profileValidation.errors.length})</p>
          <div className="space-y-1 text-xs font-bold text-rose-700/80">
            {profileValidation.errors.map((item) => (
              <p key={item}>• {item}</p>
            ))}
          </div>
        </div>
      ) : null}

      {profileValidation.warnings.length > 0 ? (
        <div className="space-y-2 rounded-2xl border border-amber-100 bg-amber-50 p-5">
          <p className="text-sm font-black text-amber-800">입력 경고 ({profileValidation.warnings.length})</p>
          <div className="space-y-1 text-xs font-bold text-amber-700/80">
            {profileValidation.warnings.map((item) => (
              <p key={item}>• {item}</p>
            ))}
          </div>
        </div>
      ) : null}

      <details className="rounded-2xl border border-slate-200 p-4" data-testid="planning-advanced-panel" onFocusCapture={markProfileEditorLocalEdit}>
        <summary className="cursor-pointer text-xs font-black uppercase tracking-widest text-slate-400" data-testid="planning-advanced-toggle">
          고급(개발자): Profile JSON
        </summary>
        <label className={`mt-4 block text-xs ${bodyLabelClassName}`}>
          편집 (JSON)
          <textarea
            className={cn(bodyTextAreaClassName, "mt-2 min-h-[200px] rounded-xl border-slate-200 font-mono")}
            data-testid="planning-json-editor"
            value={profileJsonDraft}
            onChange={(event) => replaceProfileFromJsonText(event.target.value)}
          />
          {profileJsonError ? <p className="mt-2 text-xs text-rose-700">{profileJsonError}</p> : null}
        </label>
        <div className="mt-4 flex gap-2">
          <Button onClick={() => applyProfileJsonEditorAction()} size="sm" variant="outline" className="h-9 rounded-lg bg-white font-bold">Apply JSON</Button>
          <Button onClick={() => void copyProfileJsonEditorAction()} size="sm" variant="ghost" className="h-9 rounded-lg font-bold">Copy</Button>
        </div>
      </details>

      {pendingSuggestions.length > 0 ? (
        <div className="space-y-4 rounded-[2rem] border border-amber-100 bg-amber-50 p-6">
          <p className="text-sm font-black text-amber-900">입력 정규화 제안 ({pendingSuggestions.length})</p>
          <p className="text-xs italic leading-relaxed text-amber-800">선택한 항목만 반영해 저장합니다. 선택하지 않으면 원본 그대로 저장됩니다.</p>
          <div className="space-y-2">
            {pendingSuggestions.map((suggestion) => (
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-amber-200 bg-white p-3" key={suggestion.code}>
                <input
                  checked={acceptedSuggestionCodes.includes(suggestion.code)}
                  onChange={(event) => toggleSuggestionCode(suggestion.code, event.target.checked)}
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                />
                <span className="text-xs font-bold text-slate-700">[{formatSeverityKo(suggestion.severity)}] {suggestion.message}</span>
              </label>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 pt-2">
            <Button disabled={savingProfile || !pendingProfileSave} onClick={() => void applySuggestedProfileSaveAction()} size="sm" variant="primary" className="h-10 rounded-xl px-5 font-bold">선택 적용 후 저장</Button>
            <Button disabled={savingProfile || !pendingProfileSave} onClick={() => void continueProfileSaveWithoutSuggestionsAction()} size="sm" variant="outline" className="h-10 rounded-xl bg-white px-5 font-bold">변경 없이 저장</Button>
            <Button disabled={savingProfile} onClick={() => clearPendingSuggestions()} size="sm" variant="ghost" className="h-10 rounded-xl px-5 font-bold">취소</Button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2 border-t border-slate-50 pt-4">
        <Button data-testid="planning-profile-create-button" disabled={savingProfile} id="planning-profile-create-button" onClick={() => beginProfileSave("create")} variant="primary" className="h-10 rounded-full px-6 font-bold">새로 만들기</Button>
        <Button disabled={savingProfile || !selectedProfileId} onClick={() => beginProfileSave("duplicate")} variant="outline" className="h-10 rounded-full bg-white px-6 font-bold">복제</Button>
        <Button data-testid="planning-profile-update-button" disabled={savingProfile || !selectedProfileId} id="planning-profile-update-button" onClick={() => beginProfileSave("update")} variant="outline" className="h-10 rounded-full bg-white px-6 font-bold">저장</Button>
        <Button disabled={savingProfile || !selectedProfileId} onClick={() => void deleteProfileAction()} variant="ghost" className="h-10 rounded-full px-6 font-bold text-rose-600 hover:bg-rose-50">삭제</Button>
        <Button data-testid="planning-profile-refresh-button" disabled={loadingProfiles} id="planning-profile-refresh-button" onClick={() => void loadProfiles(selectedProfileId)} variant="ghost" className="h-10 rounded-full px-4 font-bold">새로고침</Button>
        <Button disabled={savingProfile} onClick={loadSampleProfileAction} variant="ghost" className="h-10 rounded-full px-4 font-bold">샘플 프로필</Button>
      </div>
      </fieldset>
    </ProfileV2Form>
  );
}
