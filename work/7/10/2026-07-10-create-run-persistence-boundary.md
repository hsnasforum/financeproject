# 2026-07-10 create-run persistence boundary

## 변경 파일
- Issue: https://github.com/hsnasforum/financeproject/issues/117
- 새 PR: https://github.com/hsnasforum/financeproject/pull/186
- 대체 대상 PR: https://github.com/hsnasforum/financeproject/pull/133
- base: `a536831653511f46b175134fb3cf53819daaf36f`
- code commit: `dc0c55e9913b742b8067df020c000b1c68cc34dc`
- `src/lib/planning/server/runs/createRunPersistence.ts`
- `src/lib/planning/server/runs/createRunService.ts`
- `tests/planning-v2-api/create-run-persistence.test.ts`
- `tests/planning-v2-api/create-run-service-boundary.test.ts`
- `work/7/10/2026-07-10-create-run-persistence-boundary.md`

## 사용 skill
- `finance-skill-routing`: planning v2 create-run 변경에 필요한 기본/조건부 skill 범위를 선정했습니다.
- `github:github`: Issue #117, PR #133의 상태, 댓글, review thread, patch와 새 PR 생성을 connector로 처리했습니다.
- `planning-gate-selector`: create-run persistence 경계에 맞는 focused/full/planning/compat/regress/build 검증 범위를 선정했습니다.
- `work-log-closeout`: 실행 사실, 영향 범위, 남은 리스크와 다음 라운드를 정리했습니다.
- `manager` subagent: 최신 main에 #133이 충족됐는지 판정하고 5단계 후속 흐름을 제안했습니다.
- `reviewer` subagent: staged 4-file diff의 타입, 예외 전파, env parsing, API/DB/cache 영향과 테스트 공백을 정적 검토했습니다.

## 변경 이유
- 최신 `main`에도 `createRunService.ts`가 `PLANNING_RUN_STORE_RAW_OUTPUTS`를 직접 해석하고 `createRunRecord`를 호출하고 있어 PR #133의 경계는 아직 충족되지 않았습니다.
- PR #133은 PR #127 head를 merge-base로 두고 최신 main보다 49개 커밋 뒤에 있어, 오래된 branch history를 끌고 가지 않고 최신 main에서 같은 의미를 최소 범위로 재구성했습니다.
- persistence 옵션과 repository 호출을 작은 helper로 옮겨 orchestration 변경이 저장 세부 정책에 미치는 범위를 줄였습니다.

## 핵심 변경
- `createRunPersistence.ts`가 raw-output env flag 해석과 `createRunRecord` 옵션 전달을 담당합니다.
- `createRunService.ts`는 assembled record input을 persistence helper에 넘기고 metrics/audit/response 흐름은 그대로 유지합니다.
- 단위 테스트가 env normalize, 기본 `process.env` 경로, injected repository 호출, persistence 실패 전파를 검증합니다.
- boundary test가 service의 env 직접 참조와 `deps.createRunRecord(...)` 직접 호출 재도입을 막습니다.
- route handler, planning engine, 저장 payload 의미는 변경하지 않았습니다.

## 검증
- `DATABASE_URL=file:./dev.db corepack pnpm install --frozen-lockfile`: PASS
- `DATABASE_URL=file:./dev.db corepack pnpm test tests/planning-v2-api/create-run-persistence.test.ts tests/planning-v2-api/create-run-service-boundary.test.ts tests/planning-v2-api/create-run-service-modules.test.ts tests/planning-v2-api/persistence-routes.test.ts`: PASS, 최종 4 files / 21 tests
- `DATABASE_URL=file:./dev.db corepack pnpm lint`: PASS, 테스트 보강 후 최종 재실행
- `DATABASE_URL=file:./dev.db corepack pnpm planning:v2:complete`: PASS, fast E2E 8 tests 포함
- `DATABASE_URL=file:./dev.db corepack pnpm planning:v2:compat --keep-sandbox`: PASS, sandbox `/tmp/planning-v2-compat-5aI4HW`
- `DATABASE_URL=file:./dev.db corepack pnpm planning:v2:regress`: PASS, regression 9 cases와 full E2E 10 tests 포함
- `DATABASE_URL=file:./dev.db corepack pnpm test`: PASS, 779 files / 2579 tests
- `corepack pnpm cleanup:next-artifacts`: PASS
- `DATABASE_URL=file:./dev.db corepack pnpm build`: PASS, production compile/TypeScript/static generation 250 pages
- `corepack pnpm multi-agent:guard`: PASS
- `git diff --cached --check`: PASS
- reviewer 참고 `corepack pnpm exec tsc -p tsconfig.json --noEmit --pretty false`: FAIL, 변경 파일이 아닌 기존 test type errors. production build TypeScript와 변경 대상 focused tests는 PASS했습니다.

## Public API / 응답 shape / DB query / cache 영향
- Public URL 변경 없음
- `/api/planning/run`, `/api/planning/v2/run`, `/api/planning/v2/runs` 응답 shape 변경 없음
- DB schema 및 Prisma query semantics 변경 없음
- 저장 payload shape 변경 없음
- `PLANNING_RUN_STORE_RAW_OUTPUTS=true` raw output 저장 옵션 동작 유지
- cache/revalidation 동작 변경 없음
- 내부 TypeScript helper와 테스트 경계만 추가

## 남은 리스크
- #117의 feature flag, profile/scenario/assumptions, stage pipeline, success response, audit/metrics runtime dependency 경계는 이 PR 범위 밖입니다.
- standalone `tsc --noEmit`은 기존 test type errors 때문에 repo 전체 독립 gate로는 통과하지 않으며, 이번 변경과 직접 관련된 오류는 확인되지 않았습니다.
- GitHub Actions는 최근 account billing/spending-limit 때문에 job 시작 전 실패할 수 있습니다.
- PR #133 이후 stacked PR은 새 main 기준으로 중복과 의존성을 다시 분류해야 합니다.

## 롤백 기준
- raw-output 저장 옵션 전달이 달라지거나 persistence 예외가 service error handler까지 도달하지 않으면 helper와 해당 테스트를 함께 되돌립니다.
- create-run public response, DB query semantics, 저장 payload 또는 cache 동작에 회귀가 확인되면 merge하지 않거나 즉시 revert합니다.

## 다음 작업
- PR #186 원격 Actions, mergeability와 review thread를 확인합니다.
- PR #186이 기준이 되면 PR #133에 superseded 근거를 남기고 close합니다.
- Issue #117에는 새 PR의 변경/검증/영향 범위를 기록합니다.
- #134 이후 stack은 현재 main에 미충족인 가장 작은 경계부터 하나씩 재구성합니다.
