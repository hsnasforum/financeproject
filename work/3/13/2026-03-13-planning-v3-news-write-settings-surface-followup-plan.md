# 2026-03-13 planning-v3 news write/settings surface follow-up plan

## 변경 파일
- work/3/13/2026-03-13-planning-v3-news-write-settings-surface-followup-plan.md

## 사용 skill
- planning-gate-selector: write-side news 배치의 최소 검증 세트를 vitest/eslint/build/diff check로 고정하는 데 사용
- work-log-closeout: 이번 계획 라운드의 /work 기록 형식과 필수 섹션을 맞추는 데 사용

## 변경 이유
- `news read-only surface`는 직전 라운드에서 닫혔고, 남은 news dirty는 write-side route와 user-facing settings/alerts 표면으로 응집된다.
- 이번 턴은 구현이 아니라 배치 분해 요청이므로, write-side payload와 CTA/empty-error-help 표면만 다루는 3~5단계 계획과 최소 검증 세트를 고정한다.

## 핵심 변경
- `alerts/settings/notes/weekly-plan/recovery/refresh`를 하나의 write-side news 배치로 잠그고 read-only news, indicators, runtime 축은 명시적으로 제외했다.
- 메인 에이전트가 직접 확인할 핵심 파일을 `logic/store`, `route`, `user-facing component`, `direct API test` 네 묶음으로 나눴다.
- 최소 검증 세트를 `vitest -> eslint -> build -> diff check`로 고정했다.
- 이번 턴에는 코드 수정과 실행 검증을 하지 않았다.

## 검증
- 실행한 검증
  - `git diff --no-index --check -- /dev/null work/3/13/2026-03-13-planning-v3-news-write-settings-surface-followup-plan.md`
- 미실행 검증
  - `pnpm exec vitest run planning/v3/alerts/store.test.ts planning/v3/news/settings.test.ts planning/v3/news/recovery.test.ts tests/planning-v3-news-alerts-api.test.ts tests/planning-v3-news-notes-api.test.ts tests/planning-v3-news-weekly-plan-api.test.ts`
  - `pnpm exec eslint planning/v3/alerts/store.ts planning/v3/alerts/store.test.ts planning/v3/news/settings.ts planning/v3/news/settings.test.ts planning/v3/news/notes.ts planning/v3/news/weeklyPlan.ts planning/v3/news/recovery.ts planning/v3/news/recovery.test.ts planning/v3/news/cli/newsRefresh.ts src/app/api/planning/v3/news/alerts/route.ts src/app/api/planning/v3/news/alerts/rules/route.ts src/app/api/planning/v3/news/notes/route.ts src/app/api/planning/v3/news/notes/[noteId]/route.ts src/app/api/planning/v3/news/recovery/route.ts src/app/api/planning/v3/news/refresh/route.ts src/app/api/planning/v3/news/settings/route.ts src/app/api/planning/v3/news/weekly-plan/route.ts src/app/planning/v3/news/_components/NewsAlertsClient.tsx src/app/planning/v3/news/alerts/page.tsx src/app/planning/v3/news/settings/_components/NewsSettingsClient.tsx tests/planning-v3-news-alerts-api.test.ts tests/planning-v3-news-notes-api.test.ts tests/planning-v3-news-weekly-plan-api.test.ts`
  - `pnpm build`
  - `git diff --check -- <실제 변경 파일들> work/3/13/2026-03-13-planning-v3-news-write-settings-surface-followup.md`

## 남은 리스크
- 실제 구현 라운드에서 `refresh/recovery`가 route payload보다 internal contract 문제로 읽히면 범위가 넓어질 수 있다.
- `alerts/settings` UI는 direct UI test가 현재 범위에 없어서, selector나 copy drift가 생기면 조건부 UI test가 추가될 수 있다.
- branch 이름은 여전히 `pr37-planning-v3-txn-overrides`라서 배치 의미와 작업 이력이 어긋난다.

## 다음 라운드 우선순위
- `planning-v3 news-write-settings-surface-followup` 구현 라운드
