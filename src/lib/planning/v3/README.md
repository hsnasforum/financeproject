# Planning v3 Workspace

Planning v3는 신규 기능(연동/정밀 계산/멀티유저) 전용 작업 공간입니다.

## v2와의 차이
- v2: 동결 상태, bugfix/경미 개선만 허용
- v3: 신규 기능/아키텍처 확장 전용

## 작업 원칙
- v2 코어(`src/lib/planning/v2`, `src/lib/planning/core/v2`) 수정으로 신규 기능을 넣지 않습니다.
- 신규 기능은 v3 디렉토리에서 설계/구현합니다.
- v2 영향이 필요한 경우, 먼저 문서(`docs/planning-v3-kickoff.md`)에 영향 범위를 기록합니다.

## 권장 구조 (가이드만, 구현은 추후)
- `src/lib/planning/v3/providers/`
- `src/lib/planning/v3/service/`
- `src/lib/planning/v3/domain/`

## 현재 구현 범위 (V3-001)
- `domain/`: 계좌 거래/월별 현금흐름/프로필 초안 패치 타입
- `providers/`: CSV 기반 거래 로더 (`CsvAccountSourceProvider`)
- `service/`: 거래 -> 월 현금흐름 집계, 현금흐름 -> 프로필 초안 생성

### CSV Import Pipeline
1. `parseCsvTransactions(csvText, options)`
2. `aggregateMonthlyCashflow(transactions)`
3. `buildProfileDraftPatchFromCashflow(cashflow)`
4. `importCsvToDraft(csvText, options)`에서 위 3단계를 순서대로 결합

### Determinism & Safety
- 파싱/집계/초안 생성은 순수 함수로 구현(네트워크/파일 I/O 없음)
- 테스트 fixture 입력 기준으로 결과가 항상 동일해야 함
- 오류 데이터에는 원문 CSV 셀 값을 포함하지 않음
- `src/lib/planning/v3/**` 및 `tests/**`에서 `console.*` 출력 금지

### Test
- `pnpm test tests/planning-v3-csv-parse.test.ts tests/planning-v3-aggregate.test.ts tests/planning-v3-draftPatch.test.ts tests/planning-v3-importCsvDraft.test.ts`

## 비목표
- v2 프로필 자동 저장/자동 반영
- 은행 API/마이데이터 연동
- 추천/랭킹 로직
