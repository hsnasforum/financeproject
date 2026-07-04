# 2026-07-04 startup migration gate observability

## 변경 파일
- `src/lib/planning/store/startupMigrationGate.ts`
- `src/lib/planning/server/pages/planningRscLoaders.ts`
- `tests/planning/startupMigrationGate.test.ts`
- `work/7/4/2026-07-04-startup-migration-gate-observability.md`

## 사용 skill
- `finance-skill-routing`: financeproject 구조 개선 라운드에 필요한 기본 skill 조합 확인
- `planning-gate-selector`: planning v2 startup migration/read telemetry 변경에 필요한 검증 세트 선정
- `work-log-closeout`: `/work` 종료 기록 형식과 필수 항목 확인
- `github:github`: PR `#157`, `#160` 및 Issue `#116`, `#117` 상태 확인
- `manager subagent`: PR `#160` 이후 다음 라운드 범위 분해와 `#116` 우선순위 재확인

## 변경 이유
- `#116` 후속으로 profile read path에서 실행되는 startup migration gate의 결과가 `/planning/runs` slow-load 로그에서 구분되지 않는 관측성 공백을 줄였습니다.
- 기존 `manager.ts`에는 startup migration promise cache가 이미 있어 새 캐시를 만들지 않고, gate가 마지막 결과를 메모리 스냅샷으로 기록하도록만 보강했습니다.
- route 응답, store payload, migration 실행 정책을 바꾸지 않고, slow page telemetry context에 이번 요청에서 갱신된 startup migration 상태만 싣도록 했습니다.

## 핵심 변경
- `startupMigrationGate`에 `ok`, `partial`, `failed`, `unavailable` 상태 스냅샷과 sequence 기반 telemetry context helper를 추가했습니다.
- `ensurePlanningStartupMigrations`의 기존 반환값과 strict/best-effort 동작은 유지했습니다.
- `/planning/runs` RSC loader는 요청 시작 시점의 startup migration sequence를 기준으로, 현재 요청에서 갱신된 gate 결과만 slow-load telemetry context에 포함합니다.
- 단위 테스트로 성공, partial, strict 예외, best-effort 예외, stale sequence 제외 계약을 고정했습니다.
- Public URL/API/응답 shape, DB schema, Prisma query semantics, cache/revalidation 동작은 변경하지 않았습니다.

## 검증
- `corepack pnpm test tests/planning/startupMigrationGate.test.ts tests/planning-reports-page-fallback.test.tsx tests/planning/planningPageLoadTelemetry.test.ts`: PASS, 3 files / 13 tests
- `corepack pnpm lint`: PASS
- `DATABASE_URL=postgresql://finance:finance@localhost:5432/finance corepack pnpm test`: PASS, 777 files / 2568 tests
- `corepack pnpm planning:v2:complete`: PASS, fast e2e 8 passed
- `corepack pnpm planning:v2:compat --keep-sandbox`: PASS, sandbox `/tmp/planning-v2-compat-0a4hny`
- `corepack pnpm planning:v2:regress`: PASS, 9 regression cases + full e2e 10 passed
- `corepack pnpm cleanup:next-artifacts`: PASS
- `DATABASE_URL=postgresql://finance:finance@localhost:5432/finance corepack pnpm build`: PASS
- `git diff --check`: PASS
- `corepack pnpm multi-agent:guard`: PASS

## 남은 리스크
- 이번 변경은 startup migration gate 결과의 관측성만 보강하며, migration/trash/legacy fallback 정책 자체는 변경하지 않았습니다.
- startup migration promise cache의 lifetime 정책은 `manager.ts` 기존 동작을 유지합니다. 실패 결과 재시도 정책 변경은 별도 Issue/PR에서 다루는 편이 안전합니다.
- `#116`의 큰 구조 개선은 여러 stacked PR로 나뉘어 있으므로 선행 PR merge 순서에 따라 rebase 또는 base 변경이 필요할 수 있습니다.

## 다음 라운드 우선순위
- #116: startup migration promise cache의 실패 결과 lifetime/재시도 정책을 현재 운영 요구와 비교해 별도 follow-up으로 분리할지 검토합니다.
- #116: trash/legacy fallback 전체 재작성은 compat 계약과 rollback 기준을 먼저 고정한 뒤 별도 PR로 분리합니다.
- #117: persistence adapter 후속은 열린 stack 충돌 위험이 낮아진 뒤 진행합니다.
