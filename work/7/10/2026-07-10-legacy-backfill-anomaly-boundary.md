# 2026-07-10 legacy backfill anomaly boundary

## 변경 파일
- `scripts/planning_v2_backfill_legacy_runs.mjs`
- `scripts/planning_v2_legacy_backfill_anomalies.mjs`
- `scripts/planning_v2_ops_safety.mjs`
- `src/lib/planning/store/runLegacyBackfillService.ts`
- `src/lib/planning/store/runLegacyBackfillStore.ts`
- `src/lib/planning/store/runStore.ts`
- `tests/planning/ops-safety.test.ts`
- `tests/planning/runLegacyBackfillStore.test.ts`
- `work/7/10/2026-07-10-legacy-backfill-anomaly-boundary.md`

## 사용 skill
- `github:github`: PR #165/#166/#170/#171의 stack, 리뷰, CI, base/head 상태를 connector로 확인했습니다.
- `github:gh-fix-ci`: PR #163과 main Actions 실패가 job 시작 전 billing/spending-limit 차단인지 check annotation으로 확인했습니다.
- `planning-gate-selector`: runStore와 ops script 변경에 필요한 focused/full/planning/compat/regress/build gate를 선정했습니다.
- `work-log-closeout`: 실행 사실, 영향 범위, 남은 리스크와 다음 작업을 `/work` 형식으로 정리했습니다.

## 변경 이유
- PR #165와 #166의 process-global startup telemetry는 shared promise와 동시 요청에서 source/attempt를 특정 요청의 원인처럼 오인시킬 수 있어 merge 없이 닫았습니다.
- PR #170/#171의 legacy backfill anomaly 아이디어는 유효하지만 기존 patch는 candidate 식별자 sample과 raw error message 전달 범위가 넓었습니다.
- 최신 main에서 anomaly event와 운영 집계를 privacy-safe 필드로 제한해 skip/failure 원인을 확인하면서 기존 backfill 결과 계약을 유지했습니다.

## 핵심 변경
- legacy backfill anomaly를 `outcome`, `reason`, `candidateReason`, `runKind`, 허용 목록의 `errorName`으로만 기록합니다.
- run/profile ID와 raw error message는 anomaly recorder event 및 새 aggregate block에 포함하지 않습니다.
- recorder의 sync throw와 async reject를 격리하고 Promise 완료를 기다리지 않아 backfill 결과와 진행을 막지 않습니다.
- standalone backfill CLI와 ops safety report/log에 reason/candidate reason/error name/run kind 집계를 추가합니다.
- `LegacyRunBackfillResult`의 `selected/migrated/skipped/failed/candidates` shape는 변경하지 않습니다.

## 검증
- `DATABASE_URL=file:./dev.db corepack pnpm install --frozen-lockfile`: PASS
- `node --check scripts/planning_v2_legacy_backfill_anomalies.mjs`: PASS
- `node --check scripts/planning_v2_backfill_legacy_runs.mjs`: PASS
- `node --check scripts/planning_v2_ops_safety.mjs`: PASS
- `DATABASE_URL=file:./dev.db corepack pnpm test tests/planning/runLegacyBackfillStore.test.ts tests/planning/ops-safety.test.ts tests/planning-store.test.ts`: PASS, 3 files / 33 tests
- `DATABASE_URL=file:./dev.db corepack pnpm lint`: PASS
- `DATABASE_URL=file:./dev.db corepack pnpm planning:v2:complete`: PASS, fast E2E 8 tests 포함
- `DATABASE_URL=file:./dev.db corepack pnpm planning:v2:compat --keep-sandbox`: PASS, sandbox `/tmp/planning-v2-compat-Z8LX8x`
- `DATABASE_URL=file:./dev.db corepack pnpm planning:v2:regress`: PASS, regression 9 cases 및 full E2E 10 tests 포함
- `DATABASE_URL=file:./dev.db corepack pnpm test`: PASS
- `corepack pnpm cleanup:next-artifacts`: PASS
- `DATABASE_URL=file:./dev.db corepack pnpm build`: PASS
- `corepack pnpm multi-agent:guard`: PASS
- `git diff --cached --check`: PASS

## Public API / DB / cache 영향
- Public URL/API/응답 shape 변경: 없음
- `LegacyRunBackfillResult` shape 변경: 없음
- 내부 TypeScript backfill options에 optional recorder callback만 추가
- DB schema/Prisma query semantics 변경: 없음
- 저장 payload shape 변경: 없음
- HTTP cache/revalidation 변경: 없음
- 운영 script/report 변경: anomaly가 있을 때만 `applyAnomalies` aggregate와 `[apply-anomalies]` log block을 추가

## 남은 리스크
- async recorder는 best-effort non-blocking이므로 호출 완료 전에 backfill이 끝날 수 있습니다. 현재 production collector는 동기 in-memory 수집기입니다.
- `applyAnomalies`는 anomaly가 있을 때만 존재하는 optional report field이므로 report consumer는 필드 부재를 허용해야 합니다.
- 기존 candidate sample 출력의 run/profile ID는 이번 변경 전 동작으로 유지됩니다. 새 anomaly event와 aggregate block만 식별자를 포함하지 않습니다.
- anomaly summary는 CLI/ops report/log에 남으며 별도 영속 metrics/audit store에는 연결하지 않았습니다.
- GitHub Actions billing/spending-limit 차단은 저장소 코드로 자체 해소할 수 없습니다.

## 다음 작업
- 새 branch를 push하고 #116 연결 PR을 생성한 뒤 PR #170/#171을 superseded 처리합니다.
- 새 PR의 원격 CI가 billing 차단이면 job step/annotation을 확인하고 로컬 gate 결과와 분리해 기록합니다.
- 이후 #117 create-run persistence/side-effect stack을 최신 main 기준으로 재검토합니다.
