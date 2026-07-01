# P1-02 저장소 mutation 직렬화

## 범위
- 시작 SHA: `d1860e73b52a10ae186d2e006684a11160fd1d8e`
- 브랜치: `codex/p1-02-storage-concurrency`
- 문서 기준: 첨부 통합 Markdown의 P1-02 `사용자·저장 키별 mutation 직렬화와 복수 파일 commit 경계 도입`
- 중단 조건: 발생 없음. 현재 확인된 topology에서는 여러 Node 프로세스/인스턴스가 같은 `PLANNING_DATA_DIR`를 공유한다는 근거가 없어 단일 프로세스 keyed queue 범위로 구현했습니다.
- 사용 skill: `planning-gate-selector`(P1-02 검증 세트 선정), `work-log-closeout`(`/work` 종료 기록 형식)

## 변경 요약
- `src/lib/planning/storage/storeWriteLock.ts`를 추가해 사용자·저장 키 단위 process-local keyed write queue와 reentrant lock을 도입했습니다.
- run index, run action progress, v3 accounts, opening balances, batch index mutation의 read-modify-write 구간을 lock으로 감쌌습니다.
- `saveBatch`는 transaction 파일 작성 후 index commit 실패 시 새 transaction 파일을 제거하거나 이전 파일을 복원하도록 rollback 경계를 추가했습니다.
- `/ops/doctor`의 storage consistency 검사에 planning v3 batch index와 transaction `.ndjson` 파일 간 missing/orphan 진단을 추가했습니다.
- `docs/deploy.md`에 현재 lock이 단일 Node 프로세스 내부 직렬화이며, 공유 파일 루트 다중 프로세스 topology는 file lock/CAS/DB transaction 없이는 지원 완료로 볼 수 없다고 명시했습니다.
- 신규 회귀 테스트로 병렬 계좌 생성, 기초잔액 upsert, batch save, run 생성, action progress 갱신, batch index commit 실패 주입, doctor missing/orphan 감지를 검증했습니다.

## 실패 후 성공 증거
- 수정 전 실패 확인: `corepack pnpm test tests/planning-v3-store-concurrency.test.ts`
  - account create 100개 병렬 후 최종 1개만 남음
  - opening balance upsert 100개 병렬 후 최종 1개만 남음
  - batch save 100개 병렬 후 index 최종 1개만 남음
- 수정 전 실패 확인: `corepack pnpm test tests/planning-store-concurrency.test.ts`
  - run create 100개 병렬 테스트는 당시 통과했지만, action progress 20개 병렬 갱신은 최종 done 1개만 남아 실패했습니다.
- doctor 회귀 수정 전 실패 확인: `corepack pnpm test tests/planning/storage-consistency-recovery.test.ts`
  - planning v3 batch index 항목만 남고 transaction `.ndjson`가 없는 경우 `PLANNING_V3_BATCH_TXN_MISSING` 이슈가 나오지 않아 실패했습니다.
- 수정 후 targeted: `corepack pnpm test tests/planning-v3-store-concurrency.test.ts tests/planning-store-concurrency.test.ts`
  - PASS, 2 files / 6 tests
- 수정 후 doctor targeted: `corepack pnpm test tests/planning-v3-store-concurrency.test.ts tests/planning-store-concurrency.test.ts tests/planning/storage-consistency-recovery.test.ts tests/planning/ops/ops-doctor-route-action-response.test.ts`
  - PASS, 4 files / 10 tests
- 수정 후 관련 store/API: `corepack pnpm test tests/planning-v3-accountsStore.test.ts tests/planning-v3-openingBalancesStore.test.ts tests/planning-v3-batchesStore-importCsvToBatch.test.ts tests/planning-v3-batches-import-csv-api.test.ts tests/planning-store.test.ts tests/planning/v2/runActionStore.test.ts tests/planning-v2-api/run-action-progress-route.test.ts`
  - PASS, 7 files / 49 tests
- 전체 검증: `corepack pnpm test`
  - PASS, 727 files / 2389 tests
- 회귀 게이트: `corepack pnpm planning:v2:regress`
  - PASS, 9 regression cases + Playwright 8 tests
- 운영 안전 게이트: `corepack pnpm planning:v2:ops:safety`
  - PASS, legacyCandidates=0
- 정적 검증: `corepack pnpm lint`, `corepack pnpm typecheck`, `git diff --check`
  - PASS

## 운영 확인
- topology: `/home/xpdlqj/code/finance`와 `.data/planning`은 같은 filesystem id `ef53`, type `ext2/ext3`로 확인했습니다.
- 현재 프로세스 `PLANNING_*` 환경변수: 0개.
- `.env.local`, `.env`의 `PLANNING_*` 항목: 각각 0개. `.env.development`, `.env.production`은 존재하지 않습니다.
- legacy inventory: `.data/planning/v3` 경로 없음, legacy v3 파일 0개.
- canonical/shared inventory: `.data/planning/planning-v3` 파일 3개, `.data/planning/users` 파일 6개.
- quarantine/corrupt inventory: quarantine 파일 0개, `*.corrupt*` 파일 0개.
- JSON/NDJSON 파일 inventory: `.data/planning` 전체 기준 JSON 23개, NDJSON 5개입니다. 이 중 cache/trash/ops 산출물이 포함되어 P1-02 직접 영향 저장소 수와는 다릅니다.

## migration/rollback
- 저장 포맷 변경 없음, API 응답 포맷 변경 없음, migration 대상 없음.
- owner 불명 legacy 데이터 자동 배정 없음, quarantine 신규 발생 없음.
- rollback 검증: batch index commit 실패 주입 시 새 transaction `.ndjson` 파일이 남지 않는 테스트를 추가했습니다.
- doctor 검증: batch index에는 있으나 transaction 파일이 없는 경우 `PLANNING_V3_BATCH_TXN_MISSING`, index에 없는 transaction 파일이 남은 경우 `PLANNING_V3_BATCH_TXN_ORPHAN`을 보고합니다.
- 호환성 변화: 단일 Node 프로세스 내부에서 같은 사용자·저장 키의 mutation은 직렬화됩니다. 다중 프로세스 공유 파일 저장소는 여전히 비지원이며, process-local queue를 분산 lock으로 간주하지 않습니다.

## 남은 리스크
- 다중 Node 프로세스나 여러 인스턴스가 같은 `PLANNING_DATA_DIR`를 공유하는 운영 topology가 발견되면 별도 P0/P1로 file lock, CAS, SQLite/PostgreSQL transaction 중 하나를 먼저 확정해야 합니다.
- lock key가 저장 파일 단위로 비교적 넓어 burst write 구간에서 지연이 늘 수 있습니다. 장시간 queue가 관측되면 기능별 lock key 세분화나 revision CAS로 재검토합니다.
- doctor는 missing/orphan을 감지하지만 자동 삭제나 자동 복구는 수행하지 않습니다. 기존 데이터 정리는 별도 확인형 repair action으로 분리하는 것이 안전합니다.
