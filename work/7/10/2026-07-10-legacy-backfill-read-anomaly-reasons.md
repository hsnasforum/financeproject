# 2026-07-10 legacy backfill read anomaly reason 보강

## 변경 파일

- `src/lib/planning/store/runRecordCodec.ts`
- `src/lib/planning/store/runLegacyBackfillReadStore.ts`
- `src/lib/planning/store/runLegacyBackfillService.ts`
- `src/lib/planning/store/runLegacyBackfillStore.ts`
- `src/lib/planning/store/runStore.ts`
- `scripts/planning_v2_legacy_backfill_anomalies.mjs`
- `scripts/planning_v2_backfill_legacy_runs.mjs`
- `scripts/planning_v2_ops_safety.mjs`
- `tests/planning/runRecordCodec.test.ts`
- `tests/planning/runLegacyBackfillReadStore.test.ts`
- `tests/planning/runLegacyBackfillStore.test.ts`
- `tests/planning/ops-safety.test.ts`
- `work/7/10/2026-07-10-legacy-backfill-read-anomaly-reasons.md`

## 사용 skill

- `finance-skill-routing`: planning store 구현 라운드의 최소 skill 조합 선택
- `planning-gate-selector`: legacy/run compatibility와 ops script 변경의 검증 세트 선택
- `github:github`: Issue #116, PR #181과 기존 후속 기록 확인
- `work-log-closeout`: 한글 closeout 형식과 다음 작업 인계 정리
- `manager` subagent: #116 다음 범위를 raw-read fallback reason과 operation-scoped consumer로 제한
- `reviewer` subagent: aggregate 의미, source attribution, limit/sort 연결과 privacy 정적 검토

## 변경 이유

- legacy backfill candidate scan은 malformed JSON과 normalizable하지 않은 run record를 모두 nullable read 결과로 축약해 fallback 원인을 잃었습니다.
- 기존 apply anomaly collector가 operation-scoped로 존재하므로 process-global telemetry 없이 이 경계에만 원인을 연결할 수 있었습니다.
- 기존 source 순서, decode 예외 전파, public backfill 결과와 저장 의미는 유지해야 했습니다.

## 핵심 변경

- JSON read 상세 결과를 `found`, `missing`, `invalid-json`으로 분리하고 기존 nullable `readJsonFile` wrapper를 유지했습니다.
- raw backfill read가 path를 노출하지 않는 source/reason fallback 결과를 반환하고, 기존 partition -> legacy meta -> legacy file 순서를 유지합니다.
- selected candidate마다 첫 meaningful fallback만 `rawInvalidJson` 또는 `rawInvalidRunRecord` anomaly로 기록합니다.
- recovered fallback은 최종 candidate 상태와 혼동하지 않도록 ops aggregate에서 `recoveredReadFallbackEvents`로 집계합니다.
- source aggregate는 `partition-meta`, `legacy-meta`, `legacy-file`만 허용하고 임의 문자열은 버립니다.
- reviewer 지적에 따라 partition path가 없을 때 첫 legacy meta read의 source를 바로잡고, sort/limit 이후 선택된 candidate만 기록하는 테스트를 추가했습니다.

## 검증

- `node --check scripts/planning_v2_legacy_backfill_anomalies.mjs`: PASS
- `node --check scripts/planning_v2_backfill_legacy_runs.mjs`: PASS
- `node --check scripts/planning_v2_ops_safety.mjs`: PASS
- `DATABASE_URL=file:./dev.db corepack pnpm test tests/planning/runRecordCodec.test.ts tests/planning/runLegacyBackfillReadStore.test.ts tests/planning/runLegacyBackfillStore.test.ts tests/planning/ops-safety.test.ts`: PASS, 4 files / 24 tests
- `DATABASE_URL=file:./dev.db corepack pnpm lint`: PASS
- `DATABASE_URL=file:./dev.db corepack pnpm planning:v2:complete`: PASS, fast E2E 8건
- `DATABASE_URL=file:./dev.db corepack pnpm planning:v2:compat --keep-sandbox`: PASS, sandbox `/tmp/planning-v2-compat-2NFoNz`
- `DATABASE_URL=file:./dev.db corepack pnpm planning:v2:regress`: PASS, regression 9건 / full E2E 10건
- `DATABASE_URL=file:./dev.db corepack pnpm test`: PASS
- `corepack pnpm cleanup:next-artifacts`: PASS
- `DATABASE_URL=file:./dev.db corepack pnpm build`: PASS, 159.3초
- `corepack pnpm multi-agent:guard`: PASS
- reviewer finding: Medium 집계 의미 1건, Low source attribution 1건과 limit/sort 테스트 공백을 보강했습니다.
- 미실행: 수동 `docs/planning-v2-5min-selftest.md`, production 배포 smoke, `corepack pnpm release:verify`

## 남은 리스크

- 한 candidate가 raw-read fallback에서 복구된 뒤 migration post-check에 실패하면 anomaly event는 recovered와 failed 두 건이 될 수 있습니다. `LegacyRunBackfillResult` candidate 수와 anomaly event 수는 서로 다른 계약입니다.
- candidate scan 중 `decodeStoredPayload` 예외는 기존처럼 operation 전체에 전파되며 이번 변경에서 실패 복구 정책을 바꾸지 않았습니다.
- 모든 raw source가 missing인 경우는 기존 `unreadableMeta`로 유지하며, 정상적인 missing fallback을 별도 anomaly로 집계하지 않습니다.
- Public URL/API/HTTP 응답 shape와 `LegacyRunBackfillResult` shape는 변경하지 않았습니다.
- 내부 TypeScript anomaly event에는 optional `source`와 `recovered` outcome이 추가됐고, ops safety JSON/log의 optional `applyAnomalies`에는 `recoveredReadFallbackEvents`, `bySource`가 additive하게 추가됩니다.
- DB schema, Prisma query semantics, stored run payload/index/blob/trash/migration 순서, HTTP cache/revalidation 동작은 변경하지 않았습니다.
- 롤백 기준은 decode 예외가 fallback으로 축약되는 경우, source 순서 변경, public backfill result 변화, 식별자/path 노출, DB/cache 계약 변화입니다.

## 다음 라운드

1. PR을 게시하고 최종 head 기준 CI/E2E workflow의 실제 step 실행 여부를 확인합니다.
2. PR #181은 #116 runStore 범위와 분리해 최신 `main` 기반 replacement 또는 별도 Issue로 재분류합니다.
3. #116의 남은 decode exception 운영 실패 정책은 기존 전파 계약 변경이 필요한 별도 합의 항목으로 남깁니다.
