# 2026-06-23 Planning v3 뉴스 refresh/recovery 사용자 root 고정

## 변경 파일
- `src/app/api/planning/v3/news/refresh/route.ts`
- `src/app/api/planning/v3/news/recovery/route.ts`
- `src/lib/planning/v3/news/rootDir.ts`
- `planning/v3/news/recovery.ts`
- `tests/planning-v3-news-refresh-recovery-remote-host-api.test.ts`
- `docs/news-refresh.md`

## 사용 skill
- `finance-skill-routing`: Finance Project 기본/조건부 skill 선택.
- `planning-gate-selector`: Planning v3 news route 변경에 맞는 검증 게이트 선택.
- `work-log-closeout`: 이번 라운드 종료 기록 작성.
- `gpt-5.3-codex-spark + xhigh`: refresh/recovery/today/trends 사용자 root 계약 정적 조사.

## 변경 이유
Planning v3 news의 `search`, `trends`, `alerts`는 사용자별 namespace 계약을 따라가고 있었지만, `refresh`와 `recovery`는 내부 작업 실행 시 root 전달이 명시되지 않아 전역 `.data/news`로 회귀할 수 있는 위험이 남아 있었습니다. 이번 라운드는 인증된 현재 사용자 root를 refresh/recovery 실행에 고정하고, 조회 route와 같은 사용자별 cache를 보도록 회귀 테스트를 추가했습니다.

## 핵심 변경
- `/api/planning/v3/news/refresh`가 인증 후 현재 사용자 news root를 계산해 `runNewsRefresh({ rootDir })`로 전달합니다.
- `/api/planning/v3/news/recovery`가 preview/apply 모두 현재 사용자 news root를 사용합니다.
- recovery write target 라벨이 사용자 namespace에서는 `.data/planning/users/{userId}/planning-v3/news/...`로 표시됩니다.
- trusted-header auth 환경에서 Alice refresh/recovery 결과가 Alice root에만 쓰이고 Bob 조회에는 노출되지 않는 테스트를 추가했습니다.
- `docs/news-refresh.md`에 Planning v3 namespace에서 refresh/recovery가 현재 사용자 root를 갱신한다는 계약을 추가했습니다.

## 검증
- `corepack pnpm test tests/planning-v3-news-refresh-recovery-remote-host-api.test.ts tests/planning-v3-news-api.test.ts planning/v3/news/recovery.test.ts planning/v3/news/cli/newsRefresh.test.ts`
- `corepack pnpm test tests/planning-v3-news-refresh-recovery-remote-host-api.test.ts tests/planning-v3-news-api.test.ts tests/planning-v3-news-user-scope.test.ts tests/planning-v3-write-route-guards.test.ts planning/v3/news/recovery.test.ts planning/v3/news/cli/newsRefresh.test.ts planning/v3/news/store/store.test.ts`
- `corepack pnpm typecheck`
- `corepack pnpm lint`
- `corepack pnpm planning:user-scope:check`
- `corepack pnpm planning:auth:check`
- `corepack pnpm sec:check`
- `git diff --check`
- `corepack pnpm planning:ssot:check`
- `corepack pnpm test`
- `corepack pnpm build`

## 남은 리스크
- `PLANNING_NAMESPACE_ENABLED=false` 환경은 기존처럼 legacy `.data/news` root를 사용합니다.
- UI selector나 href 변경은 없어 `pnpm e2e:rc`는 실행하지 않았습니다.
- recovery write target은 운영자가 읽는 상대 라벨입니다. 절대 filesystem 경로가 필요하면 별도 diagnostic 필드를 추가해야 합니다.

## 다음 라운드 우선순위
1. Planning API route의 `withCurrentPlanningUser` 직접 사용 5건을 routeAuth 표준 helper로 정리합니다.
2. PostgreSQL migration readiness의 manifest/export/dry-run/checksum 게이트를 작은 PR로 분리합니다.
3. browser storage 44개 파일을 영구 설정, 임시 draft, dev/ops unlock, legacy fallback으로 분류합니다.
