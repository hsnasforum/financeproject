# 2026-07-10 Issue #197 FINLIFE upstream failure 회귀 방지

## 변경 파일

- `src/lib/sources/unifiedLoaders.ts`
- `tests/finlife-sync-upstream-failure.test.ts`
- `tests/finlife-unified-refresh-contract.test.ts`
- `work/7/10/2026-07-10-source-finlife-upstream-failure.md`

## 사용 skill

- `finance-skill-routing`: #197 후속을 data-source failure 회귀 범위로 축소
- `dart-data-source-hardening`: upstream failure, mock provenance, 기존 데이터 유지와 fail-open 동작 점검
- `planning-gate-selector`: focused test, lint, full test, build 검증 선택
- `work-log-closeout`: 실제 구현·검증·남은 리스크를 한글 handoff로 정리
- `github:github`: Issue #197과 PR #199 병합 후 남은 수용 기준 확인
- `manager` subagent: ExternalSourceSnapshot/adapter/failure 후보 중 upstream failure 회귀를 다음 최소 PR로 선정
- `reviewer` subagent: mock false positive와 runner rejection 공백을 찾고 수정 후 재검토

## 변경 이유

- PR #199는 persistence marker와 partial DB/snapshot failure를 보강했지만 runtime upstream failure가 기존 snapshot을 덮어쓰지 않는 계약은 직접 고정하지 않았습니다.
- fail-open mock 데이터가 live provenance로 오표시되지 않는지 실제 fixture/normalize 경로로 확인할 필요가 있었습니다.
- unified refresh runner가 예상 밖으로 reject할 경우 query 준비 흐름까지 실패할 수 있어 기존 `ok:false` fail-open 의도와 맞지 않았습니다.

## 핵심 변경

- live upstream 401 실패 시 `runFinlifeSnapshotSync`가 error result를 반환하고 `saveFinlifeSnapshot`을 호출하지 않는 테스트를 추가했습니다.
- fail-open은 실제 `mock-saving.json`, 실제 paging/normalize 경로를 사용해 `S001`, 3개 상품, `source=mock`, `fallbackUsed=true`를 검증합니다.
- unified refresh runner의 예상 밖 rejection을 `UNEXPECTED_REFRESH_ERROR` 내부 로그로 낮추고 query 준비 호출자에게 throw하지 않도록 했습니다.
- runner가 정상적으로 `ok:false`를 반환하는 경로와 reject하는 경로를 각각 회귀 테스트로 고정했습니다.

## 검증

- 최초 focused Vitest 6 files / 14 tests: PASS
- 실제 mock fixture 경로 전환 후 focused: FAIL, 예상 1개 대비 fixture 실제 3개 확인
- 최종 focused Vitest 6 files / 15 tests: PASS
- `corepack pnpm lint`: PASS, 최종 92초
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm test`: PASS, 최종 77.6초
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm build`: PASS, 220.5초
- reviewer 1차: mock payload false positive와 runner rejection 공백 Medium finding 2건 확인
- reviewer 최종: actionable finding 없음
- `corepack pnpm multi-agent:guard`: PASS
- `git diff --check`: PASS, closeout 작성 전 확인
- 미실행: 실제 FINLIFE upstream sync, retry exhaustion 429/5xx 실시간 재현, `corepack pnpm e2e:rc:data-sources`, 전체 `corepack pnpm e2e:rc`, production smoke, `corepack pnpm release:verify`

## 계약 영향

- Public URL/API/HTTP 응답 shape 변경 없음.
- DB schema, Prisma query/query semantics, DB write 동작 변경 없음.
- HTTP cache/revalidation 및 애플리케이션 cache 동작 변경 없음.
- snapshot JSON format과 정상 snapshot 저장 동작 변경 없음.
- runtime unified refresh가 예상 밖 runner rejection을 내부 error log로 기록한 뒤 반환하는 fail-open 동작만 추가했습니다.
- mock/live provenance 필드의 기존 동작은 변경하지 않고 실제 fixture 기반 테스트로 고정했습니다.

## 남은 리스크

- syncRunner의 429/5xx retry exhaustion은 실제 backoff 시간을 쓰므로 이번 focused 테스트에서 직접 고정하지 않았습니다.
- `UNEXPECTED_REFRESH_ERROR`는 외부 실패와 프로그래밍 오류를 동일하게 fail-open 처리합니다. 현재 query 가용성 우선 계약에는 맞지만 향후 error taxonomy 분리가 필요할 수 있습니다.
- unified query 호출자 전체를 통합해 이전 DB 결과가 계속 반환되는지까지는 E2E로 검증하지 않았습니다.
- runtime snapshot sync와 CLI Prisma DB sync의 공용 adapter, DB-backed completion evidence, `onlyNew` 기준 정렬은 Issue #197 후속으로 남습니다.
- 롤백 기준은 hard upstream failure가 snapshot을 저장하는 경우, fail-open mock이 live로 표시되는 경우, runner rejection이 public query 준비 흐름을 실패시키는 경우, public/DB/cache 계약 변화입니다.

## 다음 라운드

1. Issue #197 연결 후속 PR을 게시하고 리뷰, conflict, Actions job step 실행 여부를 확인합니다.
2. 이 PR도 Issue #197을 닫지 않고 upstream failure 회귀 방지 단계로만 기록합니다.
3. 다음 후보는 `ExternalSourceSnapshot` FINLIFE completion evidence를 새 Prisma 계약 없이 도입할 수 있는지와 runtime/CLI adapter 경계를 비교합니다.
