# 2026-07-03 runs load telemetry

## 변경 파일
- `src/lib/planning/server/pages/planningPageLoadTelemetry.ts`
- `src/lib/planning/server/pages/planningRscLoaders.ts`
- `tests/planning/planningPageLoadTelemetry.test.ts`
- `docs/runtime.md`
- `work/7/3/2026-07-03-runs-load-telemetry.md`

## 사용 skill
- finance-skill-routing: PR #127 이후 Finance Project 후속 범위와 조건부 skill 판단
- planning-gate-selector: `/planning/runs` RSC loader 관측성 변경에 필요한 focused/full gate 선정
- work-log-closeout: 작업 종료 기록 형식과 필수 항목 반영
- github:github: PR #127/#145 및 Issue #116 후속 연결 상태 확인
- manager subagent: #116/#117 후속 범위 재분해와 작은 PR 후보 검토

## 변경 이유
- #116 후속 리스크로 남은 legacy fixture slow path 원인 분석을 위해, `/planning/runs` 초기 RSC load가 느려질 때 어느 단계에서 시간이 쓰였는지 서버 로그로 확인할 수 있어야 했다.
- runStore migration/trash/legacy fallback 의미를 바로 바꾸면 stacked PR과 회귀 위험이 커지므로, 이번 라운드는 public contract를 건드리지 않는 관측성 보강으로 제한했다.
- 운영자가 임계값을 조정할 수 있도록 `PLANNING_PAGE_LOAD_SLOW_MS` 문서를 추가하되, 로그에는 profile/run id나 저장 payload를 포함하지 않도록 제한했다.

## 핵심 변경
- `planningPageLoadTelemetry.ts`에 route, safe context, 단계별 duration/status/errorName을 기록하는 서버 전용 slow-load telemetry helper를 추가했다.
- `loadPlanningRunsPageInitialData`의 `userScope`, `defaultProfileId`, `profiles`, `runs`, `actionProgress` 단계를 telemetry로 감쌌고, 성공/전체 fallback 모두에서 `finish`를 호출한다.
- 기존 fallback notice, `profilesReady`/`runsReady`, returned object shape, profile/run 조회 limit과 filter 조건은 유지했다.
- `planningPageLoadTelemetry.test.ts`로 slow threshold logging, threshold 이하 no-log, env threshold parsing을 고정했다.
- `docs/runtime.md`에 `/planning/runs` slow-load telemetry와 `PLANNING_PAGE_LOAD_SLOW_MS` 설정, 로그 민감정보 제한을 기록했다.

## 검증
- `corepack pnpm test tests/planning/planningPageLoadTelemetry.test.ts`: PASS, 1 file / 3 tests
- `corepack pnpm test tests/next-artifact-prune.test.ts tests/next-dev-safe-bridge-status.test.ts tests/playwright-install-chromium.test.ts tests/desktop-artifact-provenance.test.ts tests/planning/auth/postgresReadinessScript.test.ts tests/planning-v2-static-guard.test.ts`: FAIL, `tests/planning/auth/postgresReadinessScript.test.ts`가 `DATABASE_URL` 부재를 기대 환경으로 사용해 4 tests 실패
- `DATABASE_URL="postgresql://finance_user:local-only@127.0.0.1:1/finance_test?schema=public" corepack pnpm test tests/planning/auth/postgresReadinessScript.test.ts`: PASS, 15 tests
- `DATABASE_URL="postgresql://finance_user:local-only@127.0.0.1:1/finance_test?schema=public" corepack pnpm test`: PASS, 766 files / 2537 tests
- `corepack pnpm lint`: PASS
- `corepack pnpm planning:v2:complete`: PASS, fast e2e 8 tests 포함
- `corepack pnpm planning:v2:compat --keep-sandbox`: PASS, sandbox `/tmp/planning-v2-compat-jviF1d`
- `corepack pnpm planning:v2:regress`: PASS, regression 9 cases + full e2e 10 tests
- `corepack pnpm build`: PASS
- `git diff --check`: PASS
- `corepack pnpm multi-agent:guard`: PASS

## 남은 리스크
- Public URL/API, 응답 shape, DB schema, Prisma query semantics, cache/revalidation 동작 변경은 없다. 서버 로그와 optional env 문서만 추가했다.
- 기본 slow threshold가 5000ms라 일반 로컬 실행의 1~2초대 `/planning/runs` load에는 로그가 남지 않는다. slow path 재현 시 임계값을 낮춰 원인 단계 로그를 수집해야 한다.
- #116의 migration/trash/legacy fallback 전체 재작성과 index/blob persistence boundary 분리는 아직 남아 있다.
- #117 persistence adapter 추가 분리는 이번 PR 범위가 아니며, 열린 stack과 충돌하지 않도록 별도 PR에서 재평가해야 한다.
