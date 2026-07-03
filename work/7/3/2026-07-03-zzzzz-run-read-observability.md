# 2026-07-03 #116 run read observability 경계 분리

## 변경 파일
- `src/lib/planning/store/runReadObservability.ts`
- `src/lib/planning/store/runStore.ts`
- `tests/planning/runReadObservability.test.ts`
- `tests/planning-store.test.ts`
- `work/7/3/2026-07-03-pr127-followup-round-plan.md`
- `work/7/3/2026-07-03-zzzzz-run-read-observability.md`

## 사용 skill
- `finance-skill-routing`: 최신 `/work` 기준으로 이번 #116 구현 라운드의 skill 조합을 고르는 데 사용했습니다.
- `github:github`: PR #139, #135, #138, #137, #127 및 Issue #116 상태를 확인하는 데 사용했습니다.
- `planning-gate-selector`: runStore read 경계 변경의 focused/full 검증 범위를 정하는 데 사용했습니다.
- `work-log-closeout`: 이번 변경, 검증, 남은 리스크를 `/work` 형식으로 남기는 데 사용했습니다.
- `manager subagent`: #116 read/fallback 관측성 후보를 단계와 검증 소유권으로 재분해하는 데 사용했습니다.

## 변경 이유
- Issue #116의 남은 리스크 중 `runStore.ts`가 run read canonicalization, fallback metric 기록, diagnostics attempt 조립을 직접 소유하는 부분을 줄이기 위해서입니다.
- 기존 public API, `RunReadDiagnostic` shape, fallback metric key/sourceKey, migration persistence 조건은 유지하면서 read 관측성 helper만 분리했습니다.

## 핵심 변경
- `runReadObservability.ts`를 추가해 `RunReadDiagnostic` 타입, read meta detailed result 타입, fallback metric 기록 helper, diagnostics recorder를 분리했습니다.
- `readRunMetaByPathDetailed`는 canonicalization과 migration 결과를 만든 뒤 새 `recordRunReadFallbackUsage` helper로 metric 기록만 위임합니다.
- `diagnoseRunRead`는 partition hint/scan, legacy meta/file 순서를 유지하되 attempt 기록과 final status 판정을 `createRunReadDiagnosticRecorder`로 위임합니다.
- 새 단위 테스트로 fallback metric key/sourceKey와 diagnostics attempt/final status 조립을 고정했습니다.
- 기존 store 테스트는 unreadable/missing 진단의 attempt source 순서를 추가로 고정했습니다.

## 검증
- `corepack pnpm test tests/planning/runReadObservability.test.ts tests/planning-store.test.ts tests/planning/ops/metrics-api-routes.test.ts` PASS: 3 files / 22 tests
- `corepack pnpm lint` PASS
- `corepack pnpm test` PASS: 760 files / 2518 tests
- `corepack pnpm planning:v2:complete` PASS: fast e2e 6 passed
- `corepack pnpm planning:v2:compat --keep-sandbox` PASS: sandbox `/tmp/planning-v2-compat-1gFmv4`
- `corepack pnpm planning:v2:regress` PASS: 9 regression cases + full e2e 8 passed
- `corepack pnpm build` PASS

## Public API / 응답 shape / DB / cache 영향
- Public URL 변경 없음.
- API 응답 shape 변경 없음.
- `RunReadDiagnostic` export와 attempt/status shape 유지.
- run JSON 저장 포맷, vault 경로, migration persistence 조건 변경 없음.
- fallback metric key와 sourceKey 의미 유지.
- DB schema 및 Prisma query 변경 없음.
- cache/revalidation 동작 변경 없음.

## 남은 리스크
- #116의 migration/backfill 전체 재작성, partition hint/scan/legacy fallback 전체 재구성, blob read/write 분리는 이번 PR 범위에서 제외했습니다.
- `runStore.ts`에는 index scan/read/write와 migration persistence orchestration이 계속 남아 있어 다음 PR도 단일 축으로 좁히는 편이 안전합니다.
- 이번 PR은 PR #135 위에 쌓인 #116 stacked PR이므로 #135 merge 순서 또는 rebase가 필요할 수 있습니다.

## 다음 라운드 우선순위
- #116: `readRunMeta`의 partition hint/scan/legacy fallback 순서 조립을 storage path helper와 분리할지 검토합니다.
- #116: migration persistence와 backfill service bridge를 더 작은 adapter 단위로 나눌 수 있는지 확인합니다.
- #117: PR #139 merge 후 persistence adapter 추가 분리 필요 여부를 재평가합니다.
