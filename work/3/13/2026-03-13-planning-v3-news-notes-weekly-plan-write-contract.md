# 2026-03-13 planning-v3 news-notes-weekly-plan-write-contract

## 변경 파일
- 코드 추가 수정 없음
- close 범위로 확인한 dirty subset
  - `planning/v3/news/notes.ts`
  - `planning/v3/news/weeklyPlan.ts`
  - `src/app/api/planning/v3/news/notes/route.ts`
  - `src/app/api/planning/v3/news/notes/[noteId]/route.ts`
  - `src/app/api/planning/v3/news/weekly-plan/route.ts`
  - `tests/planning-v3-news-notes-api.test.ts`
  - `tests/planning-v3-news-weekly-plan-api.test.ts`
- `work/3/13/2026-03-13-planning-v3-news-notes-weekly-plan-write-contract.md`

## 사용 skill
- `planning-gate-selector`: 이번 배치를 `logic/test + API route` 축으로 분류하고 `vitest -> eslint -> build -> diff check`만 실행하도록 잠그는 데 사용
- `work-log-closeout`: 이번 close 결과와 다음 우선순위를 `/work` 형식으로 남기는 데 사용

## 변경 이유
- latest note `work/3/13/2026-03-13-planning-v3-news-refresh-recovery-internal-tail.md`가 다음 라운드 우선순위 1번으로 `news notes/weekly-plan write contract`를 남겼다.
- 이 축은 남은 news write-side 후보 중 가장 작은 coherent subset으로, `notes/weekly-plan` logic과 route contract만으로 닫을 수 있는 범위였다.
- 이미 closeout으로 잠긴 `news read-only surface`, `news write/settings surface`, `news refresh/recovery/internal tail`, `indicators connector harness`, `indicators specs import/root contract`는 이번 라운드에서 다시 열지 않았다.

## 핵심 변경
- audit 결과, 이번 batch 범위의 dirty diff는 이미 목적과 맞게 정렬돼 있었고 추가 코드 수정은 필요하지 않았다.
- `planning/v3/news/notes.ts`와 `planning/v3/news/weeklyPlan.ts`는 `resolveNewsRootDir()`를 기본 root로 사용해 `PLANNING_DATA_DIR` 기준의 env-aware news root를 따라 notes/weekly-plan write가 같은 위치에 저장되도록 유지됐다.
- `src/app/api/planning/v3/news/notes/route.ts`, `src/app/api/planning/v3/news/notes/[noteId]/route.ts`, `src/app/api/planning/v3/news/weekly-plan/route.ts`는 `assertSameOrigin(request)` + `requireCsrf(..., { allowWhenCookieMissing: true })` 조합으로 same-origin + CSRF write contract와 현재 route guard 기대를 맞췄다.
- direct API test 기준으로 notes create/update/delete와 weekly-plan save/load payload semantics는 현재 route schema와 logic normalization에 맞게 정렬돼 있었다.
- 조건부 추가 파일은 `src/lib/dev/devGuards.ts`와 `tests/planning-v3-write-route-guards.test.ts`만 guard contract 교차 확인용으로 열었고, reopen 금지 범위의 read-only/settings/refresh/indicators 모듈은 열지 않았다.

## 검증
- 기준선 / audit
  - `sed -n "1,240p" work/3/13/2026-03-13-planning-v3-news-refresh-recovery-internal-tail.md`
  - `git status --short -- planning/v3/news/notes.ts planning/v3/news/weeklyPlan.ts src/app/api/planning/v3/news/notes/route.ts src/app/api/planning/v3/news/notes/[noteId]/route.ts src/app/api/planning/v3/news/weekly-plan/route.ts tests/planning-v3-news-notes-api.test.ts tests/planning-v3-news-weekly-plan-api.test.ts`
  - `git diff -- planning/v3/news/notes.ts planning/v3/news/weeklyPlan.ts`
  - `git diff -- src/app/api/planning/v3/news/notes/route.ts src/app/api/planning/v3/news/notes/[noteId]/route.ts src/app/api/planning/v3/news/weekly-plan/route.ts`
  - `git diff -- tests/planning-v3-news-notes-api.test.ts tests/planning-v3-news-weekly-plan-api.test.ts`
  - `sed -n "1,220p" src/lib/dev/devGuards.ts`
  - `sed -n "240,340p" tests/planning-v3-write-route-guards.test.ts`
  - `sed -n "540,700p" tests/planning-v3-write-route-guards.test.ts`
- 실행한 검증
  - `pnpm exec vitest run tests/planning-v3-news-notes-api.test.ts tests/planning-v3-news-weekly-plan-api.test.ts`
  - PASS (`2 files`, `4 tests`)
  - `pnpm exec eslint planning/v3/news/notes.ts planning/v3/news/weeklyPlan.ts src/app/api/planning/v3/news/notes/route.ts src/app/api/planning/v3/news/notes/[noteId]/route.ts src/app/api/planning/v3/news/weekly-plan/route.ts tests/planning-v3-news-notes-api.test.ts tests/planning-v3-news-weekly-plan-api.test.ts`
  - PASS
  - `pnpm build`
  - PASS
- 미실행 검증
  - `pnpm e2e:rc`
  - `pnpm release:verify`
  - `pnpm test`
  - 전체 `pnpm lint`

## 남은 리스크
- 이번 라운드는 batch 범위의 dirty diff를 close했지만 branch 전체에는 다른 dirty cluster가 남아 있어 다음 라운드에서도 범위 잠금이 필요하다.
- [가정] latest residue split 기준으로 news의 남은 작은 write-side tail은 이번 배치로 모두 소진됐다. 이후에도 news residue가 다시 보이면 이미 close한 `refresh/recovery` 또는 `notes/weekly-plan` 축을 섞지 말고 새 범위만 다시 분리해야 한다.

## 다음 라운드 우선순위
1. [가정] `news` residue가 실제로 모두 닫혔는지 재확인하고, 남은 dirty cluster를 news 밖 범위 기준으로 다시 분해
2. [가정] branch 전체 closeout 전에 reopen 금지 축(`news read-only`, `news write/settings`, `news refresh/recovery/internal tail`, `news notes/weekly-plan write contract`)을 다시 섞지 않기
