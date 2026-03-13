# 2026-03-13 planning-v3 news-write-settings-surface-followup

## 변경 파일
- 추가 코드 수정 없음
- audit/closeout 대상 dirty subset
  - `planning/v3/alerts/store.ts`
  - `planning/v3/alerts/store.test.ts`
  - `planning/v3/news/settings.ts`
  - `planning/v3/news/settings.test.ts`
  - `planning/v3/news/notes.ts`
  - `planning/v3/news/weeklyPlan.ts`
  - `planning/v3/news/recovery.ts`
  - `planning/v3/news/recovery.test.ts`
  - `planning/v3/news/cli/newsRefresh.ts`
  - `src/app/api/planning/v3/news/alerts/route.ts`
  - `src/app/api/planning/v3/news/alerts/rules/route.ts`
  - `src/app/api/planning/v3/news/notes/route.ts`
  - `src/app/api/planning/v3/news/notes/[noteId]/route.ts`
  - `src/app/api/planning/v3/news/recovery/route.ts`
  - `src/app/api/planning/v3/news/refresh/route.ts`
  - `src/app/api/planning/v3/news/settings/route.ts`
  - `src/app/api/planning/v3/news/weekly-plan/route.ts`
  - `src/app/planning/v3/news/_components/NewsAlertsClient.tsx`
  - `src/app/planning/v3/news/alerts/page.tsx`
  - `src/app/planning/v3/news/settings/_components/NewsSettingsClient.tsx`
  - `tests/planning-v3-news-alerts-api.test.ts`
  - `tests/planning-v3-news-notes-api.test.ts`
  - `tests/planning-v3-news-weekly-plan-api.test.ts`
- `work/3/13/2026-03-13-planning-v3-news-write-settings-surface-followup.md`

## 사용 skill
- `planning-gate-selector`: write-side route, env-aware root, same-origin/CSRF, user-facing component 범위에 맞는 최소 검증 세트를 `vitest + eslint + build + diff check`로 잠그는 데 사용
- `work-log-closeout`: 이번 audit/closeout 결과와 미실행 검증, 다음 우선순위를 `/work` 형식으로 정리하는 데 사용

## 변경 이유
- 현재 branch `pr37-planning-v3-txn-overrides`의 이름과 이번 `news write/settings surface` 배치 축이 어긋나므로, 이번 라운드는 write-side route/API/UI surface 검증 범위로만 제한했다.
- latest `indicators specs import/root contract` note가 다음 우선순위 1번으로 `news write/settings surface`를 남겼다.
- 현재 dirty subset은 `alerts/settings/notes/weekly-plan/recovery/refresh + 직접 route/test + alerts/settings user-facing surface`로 응집돼 있고, `news read-only / indicators / runtime`를 다시 열지 않고도 원인 분리가 가능하다.
- 이번 라운드는 write-side contract를 새로 설계하는 것이 아니라, 이미 남아 있던 dirty contract가 route payload, same-origin/CSRF, env-aware root, CTA/empty-error-help 표면까지 실제로 일관되게 동작하는지 확인하고 좁은 검증으로 잠그는 것이 목적이다.

## 핵심 변경
- `alerts/store.ts`, `news/settings.ts`, `news/notes.ts`, `news/weeklyPlan.ts`, `news/recovery.ts`는 hard-coded `process.cwd()/.data/...` 기본값 대신 각 `rootDir` helper를 call-time default root로 읽는 방향으로 이미 정렬돼 있었고, direct tests도 그 계약을 그대로 고정하고 있었다.
- `alerts / notes / settings / weekly-plan / recovery / refresh` route는 `assertSameOrigin`과 `requireCsrf(..., { allowWhenCookieMissing: true })`, `@/lib/planning/v3/...` import path 정리 위에서 direct API tests 기대와 일치했다. 이번 라운드에서 추가 route 수정은 하지 않았다.
- `NewsAlertsClient.tsx`는 알림 상태 저장, 필터, empty/help surface, follow-through 링크를 write-side alerts payload에 맞게 사용하는 상태였고, `alerts/page.tsx`는 `dev_csrf`를 그대로 client에 넘겨 same-origin write 흐름을 유지하고 있었다.
- `NewsSettingsClient.tsx`는 메인 저장 대상과 알림 규칙 적용 상태를 분리해서 안내하고, 저장/적용 CTA 의미를 서로 섞지 않도록 상태 문구를 유지하고 있었다. 이번 라운드에서는 selector나 copy를 추가 수정하지 않았다.
- 조건부로 추가 UI test나 caller 범위를 열지는 않았다. `recovery.ts`와 `newsRefresh.ts`는 회귀 방지 계약 설명용으로만 확인했고, `read-only news / indicators / runtime`으로는 확대하지 않았다.

## 검증
- 기준선/범위 확인
  - `sed -n '1,220p' .codex/skills/planning-gate-selector/SKILL.md`
  - `sed -n '1,220p' .codex/skills/work-log-closeout/SKILL.md`
  - `sed -n '1,220p' work/3/13/2026-03-13-planning-v3-indicators-specs-import-root-contract.md`
  - `git status --short -- planning/v3/alerts/store.ts planning/v3/alerts/store.test.ts planning/v3/news/settings.ts planning/v3/news/settings.test.ts planning/v3/news/notes.ts planning/v3/news/weeklyPlan.ts planning/v3/news/recovery.ts planning/v3/news/recovery.test.ts planning/v3/news/cli/newsRefresh.ts src/app/api/planning/v3/news/alerts/route.ts src/app/api/planning/v3/news/alerts/rules/route.ts src/app/api/planning/v3/news/notes/route.ts src/app/api/planning/v3/news/notes/[noteId]/route.ts src/app/api/planning/v3/news/recovery/route.ts src/app/api/planning/v3/news/refresh/route.ts src/app/api/planning/v3/news/settings/route.ts src/app/api/planning/v3/news/weekly-plan/route.ts src/app/planning/v3/news/_components/NewsAlertsClient.tsx src/app/planning/v3/news/alerts/page.tsx src/app/planning/v3/news/settings/_components/NewsSettingsClient.tsx tests/planning-v3-news-alerts-api.test.ts tests/planning-v3-news-notes-api.test.ts tests/planning-v3-news-weekly-plan-api.test.ts`
- 정적 audit
  - `git diff -- planning/v3/alerts/store.ts planning/v3/news/settings.ts planning/v3/news/notes.ts planning/v3/news/weeklyPlan.ts planning/v3/news/recovery.ts planning/v3/news/cli/newsRefresh.ts`
  - `git diff -- src/app/api/planning/v3/news/alerts/route.ts src/app/api/planning/v3/news/alerts/rules/route.ts src/app/api/planning/v3/news/notes/route.ts src/app/api/planning/v3/news/notes/[noteId]/route.ts src/app/api/planning/v3/news/recovery/route.ts src/app/api/planning/v3/news/refresh/route.ts src/app/api/planning/v3/news/settings/route.ts src/app/api/planning/v3/news/weekly-plan/route.ts`
  - `git diff -- src/app/planning/v3/news/_components/NewsAlertsClient.tsx src/app/planning/v3/news/alerts/page.tsx src/app/planning/v3/news/settings/_components/NewsSettingsClient.tsx tests/planning-v3-news-alerts-api.test.ts tests/planning-v3-news-notes-api.test.ts tests/planning-v3-news-weekly-plan-api.test.ts planning/v3/alerts/store.test.ts planning/v3/news/settings.test.ts planning/v3/news/recovery.test.ts`
  - `sed -n '1,260p' src/app/planning/v3/news/_components/NewsAlertsClient.tsx`
  - `sed -n '1,260p' src/app/planning/v3/news/settings/_components/NewsSettingsClient.tsx`
  - `sed -n '1,220p' src/app/planning/v3/news/alerts/page.tsx`
  - `sed -n '1,260p' tests/planning-v3-news-notes-api.test.ts`
  - `sed -n '1,240p' tests/planning-v3-news-weekly-plan-api.test.ts`
- 실행한 검증
  - `pnpm exec vitest run planning/v3/alerts/store.test.ts planning/v3/news/settings.test.ts planning/v3/news/recovery.test.ts tests/planning-v3-news-alerts-api.test.ts tests/planning-v3-news-notes-api.test.ts tests/planning-v3-news-weekly-plan-api.test.ts`
  - `pnpm exec eslint planning/v3/alerts/store.ts planning/v3/alerts/store.test.ts planning/v3/news/settings.ts planning/v3/news/settings.test.ts planning/v3/news/notes.ts planning/v3/news/weeklyPlan.ts planning/v3/news/recovery.ts planning/v3/news/recovery.test.ts planning/v3/news/cli/newsRefresh.ts src/app/api/planning/v3/news/alerts/route.ts src/app/api/planning/v3/news/alerts/rules/route.ts src/app/api/planning/v3/news/notes/route.ts src/app/api/planning/v3/news/notes/[noteId]/route.ts src/app/api/planning/v3/news/recovery/route.ts src/app/api/planning/v3/news/refresh/route.ts src/app/api/planning/v3/news/settings/route.ts src/app/api/planning/v3/news/weekly-plan/route.ts src/app/planning/v3/news/_components/NewsAlertsClient.tsx src/app/planning/v3/news/alerts/page.tsx src/app/planning/v3/news/settings/_components/NewsSettingsClient.tsx tests/planning-v3-news-alerts-api.test.ts tests/planning-v3-news-notes-api.test.ts tests/planning-v3-news-weekly-plan-api.test.ts`
  - `pnpm build`
  - `git diff --check -- planning/v3/alerts/store.ts planning/v3/alerts/store.test.ts planning/v3/news/settings.ts planning/v3/news/settings.test.ts planning/v3/news/notes.ts planning/v3/news/weeklyPlan.ts planning/v3/news/recovery.ts planning/v3/news/recovery.test.ts planning/v3/news/cli/newsRefresh.ts src/app/api/planning/v3/news/alerts/route.ts src/app/api/planning/v3/news/alerts/rules/route.ts src/app/api/planning/v3/news/notes/route.ts src/app/api/planning/v3/news/notes/[noteId]/route.ts src/app/api/planning/v3/news/recovery/route.ts src/app/api/planning/v3/news/refresh/route.ts src/app/api/planning/v3/news/settings/route.ts src/app/api/planning/v3/news/weekly-plan/route.ts src/app/planning/v3/news/_components/NewsAlertsClient.tsx src/app/planning/v3/news/alerts/page.tsx src/app/planning/v3/news/settings/_components/NewsSettingsClient.tsx tests/planning-v3-news-alerts-api.test.ts tests/planning-v3-news-notes-api.test.ts tests/planning-v3-news-weekly-plan-api.test.ts work/3/13/2026-03-13-planning-v3-news-write-settings-surface-followup.md`
- 미실행 검증
  - `pnpm e2e:rc`
  - `pnpm release:verify`
  - `pnpm planning:v2:complete`

## 남은 리스크
- 이번 라운드는 write-side route/API/build 계약만 좁게 잠갔으므로 `NewsAlertsClient`와 `NewsSettingsClient`에 대한 direct UI regression coverage는 여전히 별도 배치로 남아 있다.
- `alerts/rules`와 `settings` 화면은 상태 문구와 CTA 의미를 유지하고 있지만, 이번 라운드에서는 UI test를 추가하지 않았기 때문에 selector drift는 다음 좁은 배치에서 다시 잠그는 편이 안전하다.
- 추가 코드 수정은 하지 않았기 때문에 현재 dirty의 의미는 “계약이 이미 맞는 상태를 direct tests + build로 잠금”에 가깝다.

## 이번 라운드 완료 항목
- `news write/settings surface` 배치를 `alerts/settings/notes/weekly-plan/recovery/refresh + 직접 route/test + write-side user-facing surface` 범위로 잠갔다.
- env-aware root, same-origin/CSRF, notes CRUD, weekly-plan 저장, alerts 상태 저장 contract가 direct tests와 build까지 일치함을 확인했다.
- `read-only news / indicators / runtime` 재오픈 없이 현재 dirty subset만 검증으로 닫았다.

## 다음 라운드 우선순위
1. `news write/settings direct UI regression coverage`
2. [가정] `news/indicators residue` 재스캔 후 남은 표면을 다시 1축씩 분해
