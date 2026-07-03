# 2026-07-03 #116 startup migration gate 후속

## 범위
- Issue: #116 runStore migration/trash/legacy fallback 경계 분리 후속
- Branch: `codex/116-startup-migration-gate`
- Base: `codex/116-run-create-store-boundary`
- PR: 생성 예정

## 사용 skill
- `finance-skill-routing`: financeproject 후속 작업의 조건부 skill 선택
- `planning-gate-selector`: planning v2/store 변경 검증 범위 선정
- `work-log-closeout`: 이번 라운드 작업 기록 형식 정리
- `github:github`: PR/Issue 상태 확인
- `manager subagent`: PR #148 이후 다음 작은 PR 후보 재분해

## 변경 요약
- `runPlanningMigrationsOnStartup` 직접 호출을 store 전용 `startupMigrationGate` helper로 이동했습니다.
- `runStore`는 기존처럼 startup migration 예외를 전파하는 strict 호출로 유지했습니다.
- `profileStore`는 기존처럼 예외 시 프로필 읽기 흐름을 막지 않는 best-effort 호출로 유지했습니다.
- strict/best-effort 동작을 고정하는 단위 테스트를 추가했습니다.

## 변경 파일
- `src/lib/planning/store/startupMigrationGate.ts`
- `src/lib/planning/store/runStore.ts`
- `src/lib/planning/store/profileStore.ts`
- `tests/planning/startupMigrationGate.test.ts`
- `work/7/3/2026-07-03-zzzzzzzzzzzzzz-startup-migration-gate.md`

## 검증
- `corepack pnpm test tests/planning/startupMigrationGate.test.ts tests/planning-store.test.ts tests/planning/migrations/compat-fixtures.test.ts tests/planning/runLegacyBackfillStore.test.ts` PASS
- `corepack pnpm lint` PASS
- `DATABASE_URL=postgresql://finance:finance@localhost:5432/finance corepack pnpm test` PASS
- `corepack pnpm planning:v2:compat --keep-sandbox` PASS, sandbox `/tmp/planning-v2-compat-mekM7U`
- `corepack pnpm planning:v2:regress` PASS
- `corepack pnpm cleanup:next-artifacts` PASS
- `corepack pnpm planning:v2:complete` PASS on standalone rerun
- `DATABASE_URL=postgresql://finance:finance@localhost:5432/finance corepack pnpm build` PASS
- `git diff --check && git diff --cached --check` PASS
- `corepack pnpm multi-agent:guard` PASS after note staging

## 참고 실패
- `corepack pnpm planning:v2:complete`를 `planning:v2:compat`/`planning:v2:regress`와 병렬 실행한 첫 시도는 fast e2e 마지막 프로필 생성 요청에서 `socket hang up`으로 실패했습니다.
- 같은 변경 상태에서 `cleanup:next-artifacts` 후 단독 재실행은 PASS였고, 병렬 e2e 부하에 따른 일시 실패로 판단합니다.

## 영향
- Public URL/API/응답 shape 변경 없음.
- DB schema, Prisma query semantics 변경 없음.
- cache/revalidation 동작 변경 없음.
- migration 실행 결과와 profile/run 저장 파일 형식 변경 없음.

## 남은 리스크
- startup migration 호출 정책은 한 곳으로 모았지만, profile read path의 중복 호출 수 자체를 줄이는 계측/최적화는 후속입니다.
- runStore trash/legacy fallback 전체 재작성은 이번 PR 범위에서 제외했습니다.

## 다음 라운드 우선순위
- `/planning/runs` slow path에서 default profile/profile list/run list 각각의 startup migration 호출 비용을 계측합니다.
- 필요 시 read wrapper 또는 legacy fallback diagnostics만 별도 PR로 분리합니다.
- #117 persistence adapter 후속은 열린 stack과 충돌 위험이 낮아진 뒤 진행합니다.
