# 2026-07-04 startup migration cache invalidation

## 사용 skill
- `finance-skill-routing`: financeproject 작업 기본/조건부 skill 확인
- `planning-gate-selector`: startup migration, ops security route service 변경에 필요한 검증 범위 선정
- `work-log-closeout`: `/work` 종료 기록 형식 정리
- `github:github`: PR/Issue 상태 확인 및 PR 작성 흐름 기준 확인

## 연결 Issue
- #116 runStore migration/trash/legacy fallback 경계 분리 후속

## 변경 요약
- `runPlanningMigrationsOnStartup`의 성공/partial 캐시 보존 정책은 유지했습니다.
- startup migration cache를 명시적으로 비우는 `invalidatePlanningStartupMigrationCache` helper를 추가했습니다.
- vault configure/unlock/change-passphrase/reset 성공 후 ops security route service에서 startup migration cache를 무효화합니다.
- vault unlock 이후 기존 `partial` startup result가 계속 재사용되는 회귀를 막는 manager 테스트를 추가했습니다.
- vault mutation service가 cache invalidation 호출을 유지하는 boundary 테스트를 추가했습니다.

## 변경 파일
- `src/lib/planning/migrations/manager.ts`
- `src/lib/planning/server/security/opsSecurityConfigureRouteService.ts`
- `src/lib/planning/server/security/opsSecurityLockRouteService.ts`
- `src/lib/planning/server/security/opsSecurityChangePassphraseRouteService.ts`
- `src/lib/planning/server/security/opsSecurityResetRouteService.ts`
- `tests/planning/migrations/manager.test.ts`
- `tests/planning/ops/ops-security-startup-migration-cache-boundary.test.ts`
- `work/7/4/2026-07-04-startup-migration-cache-invalidation.md`

## 검증 결과
- `corepack pnpm test tests/planning/migrations/manager.test.ts tests/planning/ops/ops-security-startup-migration-cache-boundary.test.ts tests/planning/ops/ops-security-lock-unlock-route-service-boundary.test.ts tests/planning/ops/ops-security-configure-route-service-boundary.test.ts tests/planning/ops/ops-security-change-passphrase-route-service-boundary.test.ts tests/planning/ops/ops-security-reset-route-service-boundary.test.ts`: PASS, 6 files / 15 tests
- `git diff --check`: PASS
- `DATABASE_URL=postgresql://finance:finance@localhost:5432/finance corepack pnpm test`: PASS, 778 files / 2572 tests
- `corepack pnpm lint`: 최초 병렬 실행은 full test와 겹쳐 timeout, 단독 재실행 PASS
- `corepack pnpm planning:v2:complete`: PASS
- `corepack pnpm planning:v2:compat --keep-sandbox`: PASS, sandbox `/tmp/planning-v2-compat-eTk9H0`
- `corepack pnpm planning:v2:regress`: PASS
- `corepack pnpm cleanup:next-artifacts`: PASS
- `DATABASE_URL=postgresql://finance:finance@localhost:5432/finance corepack pnpm build`: PASS
- `corepack pnpm multi-agent:guard`: PASS

## Public API / DB / cache 영향
- Public URL/API/응답 shape 변경: 없음
- DB schema/Prisma query semantics 변경: 없음
- HTTP cache/revalidation 변경: 없음
- 내부 cache 동작 변경: ops security vault configure/unlock/change-passphrase/reset 성공 후 startup migration in-memory cache를 비웁니다. `ok`/`partial` 결과 자체의 cache 보존 정책은 그대로 유지합니다.

## 남은 리스크
- `vaultState`를 route service 없이 직접 호출하는 내부 테스트/유틸 경로는 자동 invalidation 대상이 아닙니다. 순환 import를 피하기 위해 production ops route service 경계에서 처리했고, 직접 호출 경로는 필요 시 helper를 명시 호출해야 합니다.
- #116의 migration/trash/legacy fallback 전체 재작성은 이번 PR 범위에서 제외했습니다.

## 다음 작업
- #116: migration/trash/legacy fallback 관측성 및 경계 추가 분리 여부 재검토
- #117: run creation persistence adapter와 audit/metrics side-effect 경계 추가 분리
