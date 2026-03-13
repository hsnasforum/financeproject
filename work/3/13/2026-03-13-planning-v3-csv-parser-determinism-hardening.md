# 2026-03-13 planning-v3 csv-parser determinism hardening

## 변경 파일
- 코드 추가 수정 없음
- `work/3/13/2026-03-13-planning-v3-csv-parser-determinism-hardening.md`

## 사용 skill
- `planning-gate-selector`: internal parser contract 배치에 맞춰 `vitest + eslint + diff check`까지만 유지하는 최소 검증 세트를 고르는 데 사용
- `work-log-closeout`: parser determinism audit 결과, 조건부 미포함 범위, 실행/미실행 검증을 `/work` 형식으로 정리하는 데 사용

## 브랜치 메모
- 현재 브랜치는 `pr37-planning-v3-txn-overrides`다.
- branch 의미와 이번 `csv-parser determinism` 축이 어긋나므로, `tests/planning-v3/csv-parse.test.ts`와 `src/lib/planning/v3/providers/csv/csvProvider.ts`만 잠그고 upload UI, drafts upload flow, import route로 번지지 않게 제한했다.

## 변경 이유
- latest `csv/drafts residue next-batch breakdown` note가 다음 구현 1순위로 `csv parser determinism hardening`을 추천했다.
- 현재 direct dirty는 `tests/planning-v3/csv-parse.test.ts` 1파일에 모여 있고, audit 결과 `src/lib/planning/v3/providers/csv/csvProvider.ts`는 이미 deterministic하게 동작하고 있었다.
- 따라서 이번 라운드는 parser semantic 확장 없이, 현재 dirty test가 고정하려는 계약이 실제 구현과 맞는지 검증하고 `/work`에 잠그는 것이 가장 작은 처리였다.

## 핵심 변경
- 이번 라운드에서 code churn은 추가하지 않았다.
- `tests/planning-v3/csv-parse.test.ts`의 현재 dirty는 아래 계약을 고정한다.
  - 같은 `sample.csv` 입력을 두 번 넣었을 때 `transactions` 배열이 같은 순서와 값으로 반복 반환된다.
  - 기존 `stats`와 대표 row normalization expectation은 유지된다.
- `src/lib/planning/v3/providers/csv/csvProvider.ts` audit 결과, determinism을 깨는 지점은 보이지 않았다.
  - `parseCsvTransactions`는 `parsed.rows`를 index 순서대로 순회한다.
  - `transactions.push(...)`와 `errors.push(...)`만 사용하고, 반환 전에 추가 sort/random/date-now 기반 재배열이 없다.
  - `stats`도 `transactions.length`와 `errors.length`에서 바로 계산한다.
- 결론적으로 이번 batch는 provider 수정 없이 current dirty test hardening만으로 닫을 수 있었다.

## determinism 계약에서 실제로 조정한 내용
- 추가 코드 수정은 하지 않았다.
- 현재 dirty test assertion `expect(repeated.transactions).toEqual(first.transactions)`이 이번 라운드에서 잠근 계약의 전부다.
- 이 assertion은
  - transaction 배열 순서 결정성
  - 각 row normalization 결과 값 결정성
  를 한 번에 확인하고, 기존 `stats` assertion과 함께 parse result repeatability를 충분히 설명한다.

## 조건부 포함 여부
- `src/lib/planning/v3/providers/csv/csvParse.ts`
  - 열지 않았다.
  - `csvProvider.ts`만으로도 determinism 경로 설명이 충분했고, helper 수준으로 내려가야 할 nondeterministic source는 보이지 않았다.
- 추가 csv test
  - `tests/planning-v3-csv-parse.test.ts`
  - `tests/planning-v3-csv-hardening.test.ts`
  - `tests/planning-v3/csv-import.test.ts`
  - `tests/planning-v3/csvAccountSourceProvider.test.ts`
  - 실행하지 않았다.
  - provider 수정이 없고 기본 test가 PASS했으므로 이번 라운드에서는 넓히지 않았다.

## 검증
- 기준선 확인
  - `sed -n '1,240p' work/3/13/2026-03-13-planning-v3-csv-drafts-residue-next-batch-breakdown.md`
  - `sed -n '1,220p' work/3/13/2026-03-13-planning-v3-csv-import-route-same-origin-contract-followup.md`
  - `sed -n '1,220p' work/3/13/2026-03-13-planning-v3-draft-preview-legacy-fallback-alignment.md`
- 상태 잠금 / audit
  - `git status --short -- tests/planning-v3/csv-parse.test.ts src/lib/planning/v3/providers/csv/csvProvider.ts src/lib/planning/v3/providers/csv/csvParse.ts tests/planning-v3-csv-parse.test.ts tests/planning-v3-csv-hardening.test.ts tests/planning-v3/csv-import.test.ts tests/planning-v3/csvAccountSourceProvider.test.ts`
  - `git diff -- tests/planning-v3/csv-parse.test.ts src/lib/planning/v3/providers/csv/csvProvider.ts`
  - `sed -n '1,240p' tests/planning-v3/csv-parse.test.ts`
  - `rg -n "export function parseCsvTransactions|function buildHeaderMap|push\\(|stats|errors|sort\\(|Map\\(|Set\\(|Object\\.keys|Object\\.entries|for \\(const .* of" src/lib/planning/v3/providers/csv/csvProvider.ts`
  - `sed -n '260,420p' src/lib/planning/v3/providers/csv/csvProvider.ts`
- 테스트
  - `pnpm exec vitest run tests/planning-v3/csv-parse.test.ts`
  - PASS (`1 file`, `1 test`)
- eslint
  - `pnpm exec eslint tests/planning-v3/csv-parse.test.ts src/lib/planning/v3/providers/csv/csvProvider.ts`
  - PASS

## 미실행 검증
- `pnpm exec vitest run tests/planning-v3/csv-parse.test.ts tests/planning-v3-csv-parse.test.ts tests/planning-v3-csv-hardening.test.ts tests/planning-v3/csv-import.test.ts tests/planning-v3/csvAccountSourceProvider.test.ts`
- `pnpm build`
- `pnpm e2e:rc`
- `pnpm release:verify`
- `pnpm planning:v2:complete`
- `pnpm planning:current-screens:guard`

## 남은 리스크
- 이번 라운드는 `sample.csv` fixture 반복 호출 결정성만 직접 고정했다. 다른 fixture shape까지 같은 수준의 repetition assertion이 필요한지는 후속 parser semantics 변경 때 다시 판단해야 한다.
- `tests/planning-v3/csv-parse.test.ts`는 현재 dirty 상태 그대로 PASS했지만, 이 변경은 아직 broader csv consumer tests와 함께 재확인한 상태는 아니다. 다만 provider 수정이 없어서 이번 라운드에서는 넓히지 않았다.
- upload UI, drafts upload flow, import route는 의도적으로 제외했다. 이후 csv 관련 변경이 생겨도 parser determinism batch와 섞지 않는 편이 안전하다.

## 다음 라운드 우선순위
1. `drafts upload-flow compatibility hardening`
2. `csv upload entry UI polish`
3. 이번 `csv-parser determinism hardening` 범위는 재오픈하지 않는다.
