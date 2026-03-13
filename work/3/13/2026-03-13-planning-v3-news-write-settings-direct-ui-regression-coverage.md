# 2026-03-13 planning-v3 news-write-settings-direct-ui-regression-coverage

## 변경 파일
- 실제 수정
  - `tests/planning-v3-news-alerts-ui.test.tsx`
- audit/검증 대상
  - `src/app/planning/v3/news/_components/NewsAlertsClient.tsx`
  - `src/app/planning/v3/news/alerts/page.tsx`
  - `src/app/planning/v3/news/settings/_components/NewsSettingsClient.tsx`
  - `tests/planning-v3-news-settings-ui.test.tsx`
- `work/3/13/2026-03-13-planning-v3-news-write-settings-direct-ui-regression-coverage.md`

## 사용 skill
- `planning-gate-selector`: direct UI test 추가 범위에 맞는 최소 검증 세트를 `vitest + eslint + diff check`로 유지하는 데 사용
- `work-log-closeout`: 실제 수정 파일, 실행한 검증, 미실행 검증, 다음 우선순위를 `/work` 형식으로 정리하는 데 사용

## 변경 이유
- current branch `pr37-planning-v3-txn-overrides`의 이름과 이번 `news write/settings direct UI regression coverage` 축이 어긋나므로, 이번 라운드는 alerts/settings component와 direct UI test 범위로만 제한했다.
- latest `news write/settings surface follow-up` note가 남긴 다음 우선순위 1번은 `NewsAlertsClient`, `NewsSettingsClient`의 direct UI regression coverage 보강이었다.
- route/API/build 계약은 직전 라운드에서 이미 닫혔고, 남은 공백은 alerts/settings 화면의 CTA, 상태 문구, 필터/도움말 표면이 회귀 없이 유지되는지 직접 고정하는 일이었다.

## 핵심 변경
- `tests/planning-v3-news-alerts-ui.test.tsx`를 확대해 alerts 화면의 hero CTA, 빠른 필터, 날짜 토글, loading 상태 문구, 현재 필터 결과 요약을 정적 렌더 기준으로 직접 고정했다.
- `tests/planning-v3-news-settings-ui.test.tsx`는 기존 dirty 상태를 그대로 유지한 채 재검증했다. 메인 저장 CTA, 알림 규칙 오버라이드 섹션, follow-through 링크, helper 기반 상태 문구 분리가 이미 이번 배치 목적과 맞았다.
- `NewsAlertsClient.tsx`, `alerts/page.tsx`, `NewsSettingsClient.tsx`는 조건부로 읽어 확인만 했고 수정하지 않았다.
- selector 보강용 `data-testid` 추가나 page shell 수정은 필요하지 않았다. 이번 라운드는 test-only로 닫았다.

## 검증
- 기준선/범위 확인
  - `sed -n '1,240p' work/3/13/2026-03-13-planning-v3-news-write-settings-surface-followup.md`
  - `git status --short -- src/app/planning/v3/news/_components/NewsAlertsClient.tsx src/app/planning/v3/news/alerts/page.tsx src/app/planning/v3/news/settings/_components/NewsSettingsClient.tsx tests/planning-v3-news-alerts-ui.test.tsx tests/planning-v3-news-settings-ui.test.tsx`
  - `sed -n '1,220p' .codex/skills/planning-gate-selector/SKILL.md`
  - `sed -n '1,220p' .codex/skills/work-log-closeout/SKILL.md`
- 정적 audit
  - `sed -n '1,260p' tests/planning-v3-news-alerts-ui.test.tsx`
  - `sed -n '1,320p' tests/planning-v3-news-settings-ui.test.tsx`
  - `sed -n '1,320p' src/app/planning/v3/news/_components/NewsAlertsClient.tsx`
  - `sed -n '1,360p' src/app/planning/v3/news/settings/_components/NewsSettingsClient.tsx`
  - `rg -n "renderToStaticMarkup\\(|toContain\\(" tests/planning-v3-*.test.tsx`
  - `rg -n "export function NewsSettingsClient|export function NewsAlertsClient|export function .*Status|export function .*Hint|export function .*Save" src/app/planning/v3/news/settings/_components/NewsSettingsClient.tsx src/app/planning/v3/news/_components/NewsAlertsClient.tsx`
  - `sed -n '320,620p' src/app/planning/v3/news/_components/NewsAlertsClient.tsx`
  - `sed -n '620,760p' src/app/planning/v3/news/settings/_components/NewsSettingsClient.tsx`
- 실행한 검증
  - `pnpm exec vitest run tests/planning-v3-news-alerts-ui.test.tsx tests/planning-v3-news-settings-ui.test.tsx`
  - `pnpm exec eslint src/app/planning/v3/news/_components/NewsAlertsClient.tsx src/app/planning/v3/news/alerts/page.tsx src/app/planning/v3/news/settings/_components/NewsSettingsClient.tsx tests/planning-v3-news-alerts-ui.test.tsx tests/planning-v3-news-settings-ui.test.tsx`
  - `bash -lc 'out=$(git diff --no-index --check -- /dev/null tests/planning-v3-news-alerts-ui.test.tsx 2>&1); if [ -n "$out" ]; then printf "%s" "$out"; exit 1; fi'`
  - `bash -lc 'out=$(git diff --no-index --check -- /dev/null work/3/13/2026-03-13-planning-v3-news-write-settings-direct-ui-regression-coverage.md 2>&1); if [ -n "$out" ]; then printf "%s" "$out"; exit 1; fi'`
- 미실행 검증
  - `pnpm build` [사유] component source 수정이 없어서 이번 라운드에서는 생략
  - `pnpm e2e:rc`
  - `pnpm release:verify`

## 남은 리스크
- alerts/settings direct UI regression coverage는 생겼지만, 현재 방식이 `renderToStaticMarkup` 중심이라 client-side 상호작용까지는 잠그지 않는다.
- `tests/planning-v3-news-settings-ui.test.tsx`는 상태 문구와 helper 계약을 넓게 고정하지만, 실제 fetch 이후 화면 전이까지는 다루지 않는다.
- 남은 news 배치는 UI surface보다 더 넓은 `news/indicators residue` 재분해가 필요할 수 있다.

## 이번 라운드 완료 항목
- `news write/settings direct UI regression coverage` 배치를 direct UI test 범위로 잠갔다.
- alerts 화면의 CTA/필터/loading 요약을 새 direct UI assertions로 고정했다.
- settings 화면의 저장 CTA, 알림 규칙 적용 상태, follow-through 링크 분리가 기존 direct UI test로 충분함을 재검증했다.

## 다음 라운드 우선순위
1. [가정] `news/indicators residue` 재스캔 후 남은 표면을 다시 1축씩 분해
