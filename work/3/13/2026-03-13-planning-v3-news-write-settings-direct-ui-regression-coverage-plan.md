# 2026-03-13 planning-v3 news-write-settings-direct-ui-regression-coverage plan

## 변경 파일
- 코드 수정 없음
- `work/3/13/2026-03-13-planning-v3-news-write-settings-direct-ui-regression-coverage-plan.md`

## 사용 skill
- `work-log-closeout`: 이번 라운드의 범위 고정과 다음 UI 배치 분해를 저장소 `/work` 형식으로 남기기 위해 사용

## 변경 이유
- 최신 `news-write-settings-surface-followup` closeout이 다음 우선순위로 `news write/settings direct UI regression coverage`를 남겼습니다.
- 이번 요청은 범위를 `NewsAlertsClient / alerts page / NewsSettingsClient / direct UI tests`까지만 제한하고, route/API/read-only news/indicators/runtime으로 넓히지 않는 아주 짧은 단계 분해입니다.
- 따라서 구현 전에 direct UI regression coverage 배치의 파일 경계와 제외 범위를 먼저 고정합니다.

## 핵심 변경
- `NewsAlertsClient`와 `alerts/page`를 alerts UI 표면 1축으로 둡니다.
- `NewsSettingsClient`는 settings 상태 문구와 CTA 의미 정렬 축으로 분리합니다.
- direct UI tests는 `tests/planning-v3-news-alerts-ui.test.tsx`, `tests/planning-v3-news-settings-ui.test.tsx`까지만 포함합니다.
- `route/API/read-only news/indicators/runtime`과 e2e 범위는 이번 배치에서 제외합니다.

## 검증
- 기준선 확인
  - `ls -1t work/3/13 | head -n 5`
  - `sed -n '1,220p' work/3/13/2026-03-13-planning-v3-news-write-settings-surface-followup.md`
  - `sed -n '1,220p' work/3/13/2026-03-13-planning-v3-news-write-settings-surface-followup-plan.md`
- 범위 확인
  - `git status --short -- src/app/planning/v3/news/_components/NewsAlertsClient.tsx src/app/planning/v3/news/alerts/page.tsx src/app/planning/v3/news/settings/_components/NewsSettingsClient.tsx tests/planning-v3-news-alerts-ui.test.tsx tests/planning-v3-news-settings-ui.test.tsx tests/e2e/news-settings-alert-rules.spec.ts`
- 형식 확인
  - `git diff --no-index --check /dev/null work/3/13/2026-03-13-planning-v3-news-write-settings-direct-ui-regression-coverage-plan.md`
- 미실행 검증
  - `pnpm exec vitest run tests/planning-v3-news-alerts-ui.test.tsx tests/planning-v3-news-settings-ui.test.tsx`
  - `pnpm exec eslint src/app/planning/v3/news/_components/NewsAlertsClient.tsx src/app/planning/v3/news/alerts/page.tsx src/app/planning/v3/news/settings/_components/NewsSettingsClient.tsx tests/planning-v3-news-alerts-ui.test.tsx tests/planning-v3-news-settings-ui.test.tsx`
  - `pnpm build`
  - `pnpm e2e:rc`

## 남은 리스크
- `alerts/page`는 client wiring 성격이 강해서 실제 회귀 원인이 component와 page 사이 props 전달인지 test selector drift인지 다시 갈릴 수 있습니다.
- `tests/e2e/news-settings-alert-rules.spec.ts`는 dirty 상태지만 이번 direct UI 배치에는 포함하지 않았으므로, 이후 범위가 다시 넓어지지 않게 주의가 필요합니다.
- direct UI tests만으로는 route/API contract drift를 잡지 못하므로, 실제 구현 라운드에서 scope가 느슨해지면 별도 배치로 다시 잘라야 합니다.

## 이번 라운드 완료 항목
- `news-write-settings-direct-ui-regression-coverage` 배치를 UI component/page/test 범위로만 다시 잘랐습니다.
- 포함 범위를 `NewsAlertsClient`, `alerts/page`, `NewsSettingsClient`, direct UI tests로 고정했습니다.
- `route/API/read-only news/indicators/runtime`과 e2e 확장을 제외 범위로 명시했습니다.

## 다음 라운드
- 실제 구현 시 `alerts UI`와 `settings UI` 중 어느 쪽이 더 작은 회귀 단위인지 먼저 결정한 뒤 들어갑니다.
- direct UI tests를 수정하더라도 route/API/e2e는 별도 배치로 유지합니다.
