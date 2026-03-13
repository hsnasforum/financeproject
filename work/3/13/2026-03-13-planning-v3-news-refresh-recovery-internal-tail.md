# 2026-03-13 planning-v3 news-refresh-recovery-internal-tail

## 변경 파일
- 코드 추가 수정 없음
- close 범위로 확인한 dirty subset
  - `planning/v3/news/cli/newsRefresh.ts`
  - `planning/v3/news/recovery.ts`
  - `planning/v3/news/recovery.test.ts`
  - `planning/v3/news/rootDir.ts`
  - `src/app/api/planning/v3/news/recovery/route.ts`
  - `src/app/api/planning/v3/news/refresh/route.ts`
  - `tests/planning-v3-news-refresh-recovery-remote-host-api.test.ts`
  - `tests/planning-v3-news-digest-indicator-root.test.ts`
- `work/3/13/2026-03-13-planning-v3-news-refresh-recovery-internal-tail.md`

## 사용 skill
- `planning-gate-selector`: 이번 배치를 `logic/test + API route` 축으로 분류하고 `vitest -> eslint -> build -> diff check`만 실행하도록 잠그는 데 사용
- `work-log-closeout`: 이번 close 결과와 다음 우선순위를 `/work` 형식으로 남기는 데 사용

## 변경 이유
- latest residue note `work/3/13/2026-03-13-planning-v3-news-indicators-residue-rescan-next-batch-split.md`가 남은 후보 중 `news refresh/recovery/internal tail`을 다음 실제 구현 1순위로 추천했다.
- 이 축은 user-facing copy나 settings/write surface를 다시 열지 않고 `import-safe guard`, `env-aware root`, `same-origin + CSRF` contract만으로 닫을 수 있는 가장 작은 내부 배치였다.
- 이미 closeout으로 잠긴 `news read-only surface`, `news write/settings surface`, `indicators connector harness`, `indicators specs import/root contract`는 이번 라운드에서 다시 열지 않았다.

## 핵심 변경
- audit 결과, 이번 batch 범위의 dirty diff는 이미 목적과 맞게 정렬돼 있었고 추가 코드 수정은 필요하지 않았다.
- `planning/v3/news/cli/newsRefresh.ts`는 `main()` 자동 실행 대신 `isMain` guard를 사용해 route/test import 시 side effect가 없도록 유지됐다.
- `planning/v3/news/recovery.ts`와 `planning/v3/news/recovery.test.ts`는 explicit `rootDir` 없이도 `resolveNewsRootDir()`와 `PLANNING_DATA_DIR`를 따라 preview/apply가 같은 news root를 쓰는 계약을 유지했다.
- `src/app/api/planning/v3/news/refresh/route.ts`와 `src/app/api/planning/v3/news/recovery/route.ts`는 `assertSameOrigin(request)` + `requireCsrf(..., { allowWhenCookieMissing: true })` 조합으로 remote-host same-origin contract와 현재 test 기대를 맞췄다.
- 조건부 추가 파일은 `planning/v3/indicators/rootDir.ts`, `planning/v3/alerts/rootDir.ts`, `src/lib/planning/storage/dataDir.ts`만 env-aware root reference 확인용으로 열었고, `planning/v3/news/digest.test.ts`는 열지 않았다.

## 검증
- 기준선 / audit
  - `sed -n '1,260p' work/3/13/2026-03-13-planning-v3-news-indicators-residue-rescan-next-batch-split.md`
  - `git diff --name-only -- planning/v3/news/cli/newsRefresh.ts planning/v3/news/recovery.ts planning/v3/news/recovery.test.ts planning/v3/news/rootDir.ts src/app/api/planning/v3/news/recovery/route.ts src/app/api/planning/v3/news/refresh/route.ts tests/planning-v3-news-refresh-recovery-remote-host-api.test.ts tests/planning-v3-news-digest-indicator-root.test.ts`
  - `git diff -- planning/v3/news/cli/newsRefresh.ts planning/v3/news/recovery.ts planning/v3/news/recovery.test.ts planning/v3/news/rootDir.ts src/app/api/planning/v3/news/recovery/route.ts src/app/api/planning/v3/news/refresh/route.ts tests/planning-v3-news-refresh-recovery-remote-host-api.test.ts tests/planning-v3-news-digest-indicator-root.test.ts`
  - `sed -n '1,220p' src/lib/planning/storage/dataDir.ts`
  - `sed -n '1,220p' planning/v3/news/rootDir.ts`
  - `sed -n '1,220p' planning/v3/indicators/rootDir.ts`
  - `sed -n '1,220p' planning/v3/alerts/rootDir.ts`
- 실행한 검증
  - `pnpm exec vitest run planning/v3/news/recovery.test.ts tests/planning-v3-news-refresh-recovery-remote-host-api.test.ts tests/planning-v3-news-digest-indicator-root.test.ts`
  - PASS (`3 files`, `8 tests`)
  - `pnpm exec eslint planning/v3/news/cli/newsRefresh.ts planning/v3/news/recovery.ts planning/v3/news/recovery.test.ts planning/v3/news/rootDir.ts src/app/api/planning/v3/news/recovery/route.ts src/app/api/planning/v3/news/refresh/route.ts tests/planning-v3-news-refresh-recovery-remote-host-api.test.ts tests/planning-v3-news-digest-indicator-root.test.ts`
  - PASS
  - `pnpm build`
  - PASS
- 미실행 검증
  - `pnpm e2e:rc`
  - `pnpm release:verify`
  - `pnpm test`
  - 전체 `pnpm lint`

## 남은 리스크
- 이번 라운드는 batch 범위의 dirty diff를 close했지만, branch 전체에는 다른 dirty cluster가 남아 있어 다음 라운드에서도 범위 잠금이 필요하다.
- `planning/v3/news/rootDir.ts`는 이번 라운드에서 별도 수정이 없었고, env-aware root reference 확인만 했다. 이후 다른 news write-side batch가 root contract를 다시 건드리면 same-origin/CSRF 축과 섞이지 않게 분리해야 한다.

## 다음 라운드 우선순위
1. `news notes/weekly-plan write contract`
2. [가정] 그 이후에도 residue가 섞여 보이면 이미 closeout된 `news refresh/recovery/internal tail`을 다시 열지 말고 write-side만 별도 배치로 잠근다.
