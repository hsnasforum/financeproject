# 2026-07-04 startup migration failure retry

## 변경 파일
- `src/lib/planning/migrations/manager.ts`
- `tests/planning/migrations/manager.test.ts`
- `work/7/4/2026-07-04-startup-migration-failure-retry.md`

## 사용 skill
- `finance-skill-routing`: financeproject 구조 개선 라운드에 필요한 기본 skill 조합 확인
- `planning-gate-selector`: planning v2 migration/cache 동작 변경에 필요한 검증 세트 선정
- `work-log-closeout`: `/work` 종료 기록 형식과 필수 항목 확인
- `github:github`: PR `#161` 및 Issue `#116`, `#117` 상태 확인
- `manager subagent`: PR `#161` 이후 다음 라운드 범위 분해 확인

## 변경 이유
- `#116` 후속으로 startup migration 실패 결과가 프로세스 단위 promise cache에 계속 남아 같은 storage key에서 재시도되지 않는 리스크를 줄였습니다.
- 성공한 startup migration cache는 유지해 기존 정상 경로의 중복 실행 방지 동작은 보존했습니다.
- 실패한 startup 결과만 cache에서 제거해 transient state-path/write 실패가 해소된 뒤 다음 호출에서 다시 migration을 시도할 수 있게 했습니다.

## 핵심 변경
- `runPlanningMigrationsOnStartup`에 실패 결과 cache 제거 경계를 추가했습니다.
- 성공 결과는 기존처럼 같은 프로세스에서 같은 promise/result를 재사용합니다.
- manager 테스트에 성공 cache 유지와 실패 후 동일 key 재시도 계약을 추가했습니다.
- Public URL/API/응답 shape, DB schema, Prisma query semantics, route cache/revalidation 동작은 변경하지 않았습니다.
- 내부 startup migration promise cache 동작은 `failed` 결과에 한해 변경되었습니다.

## 검증
- `corepack pnpm test tests/planning/migrations/manager.test.ts tests/planning/startupMigrationGate.test.ts`: PASS, 2 files / 9 tests
- `corepack pnpm lint`: PASS
- `DATABASE_URL=postgresql://finance:finance@localhost:5432/finance corepack pnpm test`: PASS, 777 files / 2570 tests
- `corepack pnpm planning:v2:complete`: PASS, fast e2e 8 passed
- `corepack pnpm planning:v2:compat --keep-sandbox`: PASS, sandbox `/tmp/planning-v2-compat-qYzbbC`
- `corepack pnpm planning:v2:regress`: PASS, 9 regression cases + full e2e 10 passed
- `corepack pnpm cleanup:next-artifacts`: PASS
- `DATABASE_URL=postgresql://finance:finance@localhost:5432/finance corepack pnpm build`: PASS
- `git diff --check`: PASS
- `corepack pnpm multi-agent:guard`: PASS

## 남은 리스크
- 이번 변경은 startup migration `failed` 결과만 재시도 가능하게 하며, `partial` 결과의 재시도 정책은 기존 cache 동작을 유지합니다.
- migration/trash/legacy fallback 정책 자체는 변경하지 않았습니다.
- `#116`의 큰 구조 개선은 여러 stacked PR로 나뉘어 있으므로 선행 PR merge 순서에 따라 rebase 또는 base 변경이 필요할 수 있습니다.

## 다음 라운드 우선순위
- #116: `partial` startup migration 결과의 lifetime 정책이 vault unlock 이후 운영 요구와 맞는지 별도 검토합니다.
- #116: trash/legacy fallback 전체 재작성은 compat 계약과 rollback 기준을 먼저 고정한 뒤 별도 PR로 분리합니다.
- #117: persistence adapter 후속은 열린 stack 충돌 위험이 낮아진 뒤 진행합니다.
