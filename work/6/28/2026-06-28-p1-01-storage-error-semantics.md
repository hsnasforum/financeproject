# P1-01 저장 오류 의미 분리

## 범위
- 시작 SHA: `e266ddf97a1dab69c47b6974abae52214880f3c1`
- 문서 기준: 첨부 통합 Markdown의 P1-01 `not found / corrupt / unavailable` 분리 요구
- 중단 조건: 발생 없음
- 사용 skill: `planning-v3-batch-contract-narrowing`(stored-first/legacy fallback 계약 재확인), `planning-gate-selector`(검증 세트 선정), `work-log-closeout`(종료 기록 형식)

## 변경 요약
- `src/lib/planning/storage/serverFileRead.ts`를 추가해 `ENOENT`만 not-found로 처리하고 JSON/NDJSON 손상은 `StorageCorruptedError`, 권한/I/O/디렉터리 mismatch는 `StorageUnavailableError`로 분리했습니다.
- accounts/opening balances/batches/drafts/legacy transaction store가 손상 파일을 empty로 삼키지 않고 mutation 전에 예외를 전파하도록 바꿨습니다.
- v3 주요 API route에 저장 오류 응답 매핑을 추가해 `STORAGE_CORRUPT` 500, `STORAGE_UNAVAILABLE` 503, `fixHref=/ops/doctor`를 반환하게 했습니다.
- P0-02 이후 legacy-only batch 전제를 가진 테스트는 현재 stored batch 생성 경로로 보정했습니다.
- production bridge export 테스트는 P0-01 계약에 맞춰 `PLANNING_SINGLE_USER_MODE=1`과 동일 `PLANNING_DATA_DIR`에서 run을 만들도록 보정했습니다.

## 실패 후 성공 증거
- 수정 전 실패 확인: `corepack pnpm test tests/planning-v3-accountsStore.test.ts tests/planning-v3-openingBalancesStore.test.ts tests/planning-v3-batchesStore-importCsvToBatch.test.ts tests/planning-v3-profileDraftStore.test.ts tests/planning-v3-transactionStore.test.ts`
  - accounts/opening upsert가 손상 JSON을 empty로 취급해 성공
  - batch import가 손상 index 상태에서도 transaction 파일 생성
  - malformed NDJSON이 무시됨
  - profile draft 손상 파일이 목록에서 조용히 제외됨
- 추가 API 회귀: `tests/planning-v3-storage-error-api.test.ts`
  - corrupt JSON -> `STORAGE_CORRUPT`
  - directory mismatch -> `STORAGE_UNAVAILABLE`
  - corrupt batch index 상태에서 import mutation 차단
- 수정 후 targeted: `corepack pnpm test tests/planning-v3-accountsStore.test.ts tests/planning-v3-openingBalancesStore.test.ts tests/planning-v3-batchesStore-importCsvToBatch.test.ts tests/planning-v3-profileDraftStore.test.ts tests/planning-v3-transactionStore.test.ts tests/ops-error-contract.test.ts tests/planning-v3-storage-error-api.test.ts`
  - PASS, 7 files / 77 tests
- 수정 후 route 영향: `corepack pnpm test tests/planning-v3-accounts-profile-remote-host-api.test.ts tests/planning-v3-batch-cashflow-account-guard-api.test.ts tests/planning-v3-profile-draft-v2-api.test.ts tests/planning-v3-profile-drafts-api.test.ts tests/planning-v3-batches-import-csv-api.test.ts tests/planning-v3-batch-center-api.test.ts`
  - PASS, 6 files / 40 tests
- 전체 검증: `corepack pnpm test`
  - PASS, 725 files / 2382 tests
- 정적 검증: `corepack pnpm lint`, `corepack pnpm typecheck`, `git diff --check`
  - PASS

## 운영 확인
- topology: `/home/xpdlqj/code/finance`와 `.data/planning`은 같은 filesystem id `66513152`, type `ext2/ext3`로 확인했습니다.
- 현재 프로세스 `PLANNING_*` 환경변수: 없음.
- `.env.local`, `.env`의 `PLANNING_*` 항목: 없음으로 확인했습니다. `.env.development`, `.env.production`은 존재하지 않았습니다.
- legacy inventory: `.data/planning/v3` 경로 없음, legacy v3 후보 0개.
- canonical/shared inventory: `.data/planning/planning-v3` 파일 3개, `.data/planning/users` 파일 6개.
- quarantine/corrupt inventory: 0개.
- JSON/NDJSON 저장 후보 파일: 9개.

## migration/rollback
- 저장 포맷 변경 없음, migration 대상 없음.
- owner 불명 legacy 데이터 자동 배정 없음, quarantine 신규 발생 없음.
- rollback 검증은 별도 migration rollback이 아니라 mutation 차단으로 확인했습니다. 손상 batch index 상태에서 import API가 `.ndjson` 파일을 만들지 않는 테스트를 추가했습니다.

## 남은 리스크
- 모든 v3 route에 저장 오류 매핑을 전면 적용한 것은 아니며, 이번 범위는 P1-01 관련 store를 직접 사용하는 주요 사용자 route에 한정했습니다.
- 실제 권한 오류(`EACCES`)는 OS/마운트 정책에 의존하므로 API 테스트는 directory mismatch(`EISDIR`)로 unavailable 경로를 주입했습니다.
