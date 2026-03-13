# 2026-03-13 planning-v3 API contract follow-up

## 변경 파일
- 코드 수정 없음
- `work/3/13/2026-03-13-planning-v3-api-contract-followup.md`

## 사용 skill
- `planning-gate-selector`: API contract 배치에 맞춰 계약 테스트, route/test lint, build만 실행하도록 검증 범위를 고르기 위해 사용
- `work-log-closeout`: audit 결과, 포함/제외 범위, 실행한 검증과 다음 라운드를 `/work` 형식으로 남기기 위해 사용

## 브랜치 메모
- 현재 브랜치는 `pr37-planning-v3-txn-overrides`다.
- branch 의미와 작업 축이 더 어긋나고 있으나, 이번 라운드는 같은 dirty 브랜치에서 `planning-v3 API contract`만 분리해 audit-only로 닫았다.

## 실제 contract mismatch 여부
- 없었다.
- `categories / journal / routines / scenarios / indicators` route의 request/response shape, status code, same-origin/CSRF 계약은 현재 테스트가 기대하는 계약과 일치했다.
- 이번 라운드의 dirty는 실제 계약 mismatch라기보다 아직 separate batch closeout이 안 된 route/test 묶음으로 판단했다.

## audit에 포함한 파일
- `src/app/api/planning/v3/categories/rules/route.ts`
- `src/app/api/planning/v3/categories/rules/[id]/route.ts`
- `src/app/api/planning/v3/indicators/specs/route.ts`
- `src/app/api/planning/v3/journal/entries/route.ts`
- `src/app/api/planning/v3/journal/entries/[id]/route.ts`
- `src/app/api/planning/v3/routines/daily/route.ts`
- `src/app/api/planning/v3/scenarios/library/route.ts`
- `tests/planning-v3-exposure-api.test.ts`
- `tests/planning-v3-indicators-specs-import-api.test.ts`
- `tests/planning-v3-internal-route-contract.test.ts`
- `tests/planning-v3-journal-api.test.ts`
- `tests/planning-v3-routines-api.test.ts`
- `tests/planning-v3-user-facing-remote-host-api.test.ts`
- `tests/planning-v3-write-route-guards.test.ts`
- `tests/planning-v3-categories-rules-api.test.ts`

## 제외 파일
- `src/app/planning/v3/categories/rules/_components/RulesClient.tsx`
- `src/app/planning/v3/journal/JournalClient.tsx`
- `src/app/planning/v3/scenarios/_components/ScenarioLibraryClient.tsx`
- `news/settings` 전체
- `transactions/accounts` 전체
- `balances` 전체
- `drafts/profile` 전체
- `import/csv` 전체
- `store/helper` 전체
- `quickstart/home/reports`
- 새 엔진 도입
- 저장모델 변경
- route 추가
- docs 대량 수정
- `pnpm e2e:rc`
- `pnpm release:verify`
- `[조건부 제외 유지] src/app/api/planning/v3/exposure/profile/route.ts`
- `[조건부 제외 유지] tests/planning-v3-balances-api.test.ts`

## request/response/guard 정리
- `categories/rules`
  - `GET`: same-origin + query csrf, `200 { ok, items }`
  - `POST`: same-origin + body csrf, `200 { ok, rule }`, 입력 오류는 `400 INPUT`
  - `DELETE`: same-origin + query csrf, `200 { ok, deleted }`, 입력 오류는 `400 INPUT`
- `journal/entries`
  - `GET`: same-origin read, `200 { ok, entries }`
  - `POST`: same-origin + body csrf, `200 { ok, entry }`, 입력 오류는 `400 INPUT`
  - `[id] GET/PUT`: read는 same-origin, write는 same-origin + body csrf, 없는 엔트리는 `404 NOT_FOUND`
- `routines/daily`
  - `GET`: same-origin read, 잘못된 `date`는 `400 INPUT`
  - `POST`: same-origin + body csrf, `200 { ok, checklist }`, 입력 오류는 `400 INPUT`
- `indicators/specs`
  - `GET`: same-origin read, `200 { ok, data: { specs, catalog } }`
  - `POST`: same-origin + body csrf, `200 { ok, data: { mode, preview, applied } }`, 입력 오류는 `400 INPUT`
- `scenarios/library`
  - `GET`: same-origin read, `200 { ok, data: { updatedAt, rows } }`
  - `POST`: same-origin + body csrf, `200 { ok, data: { updatedAt, rows, overrideCount } }`, 입력 오류는 `400 INPUT`
- guard 일관성
  - user-facing route는 same-origin remote host를 허용했고, cross-origin write는 `403 ORIGIN_MISMATCH`, dev csrf cookie가 있을 때 csrf 불일치는 `403 CSRF_MISMATCH`로 유지됐다.
  - internal/local-only 규칙은 `tests/planning-v3-internal-route-contract.test.ts` 기준으로 transaction helper route에만 남아 있었고, 이번 배치 대상 route에는 다시 섞이지 않았다.

## 핵심 변경
- 실제 route 코드 수정은 하지 않았다.
- route 7개와 계약 테스트 묶음을 다시 읽어 request/response shape, status code, guard 패턴을 현재 기준선과 대조했다.
- `user-facing remote-host`, `write-route guards`, `internal-route contract` 테스트를 함께 돌려 user-facing route와 internal/local-only route 구분이 다시 흐려지지 않았음을 확인했다.
- `exposure`는 조건부 포함 후보였지만, 현재 계약 테스트가 통과해 route 파일 자체는 다시 열지 않았다.

## 검증
- `pnpm exec vitest run tests/planning-v3-categories-rules-api.test.ts tests/planning-v3-journal-api.test.ts tests/planning-v3-routines-api.test.ts tests/planning-v3-indicators-specs-import-api.test.ts tests/planning-v3-user-facing-remote-host-api.test.ts tests/planning-v3-write-route-guards.test.ts tests/planning-v3-internal-route-contract.test.ts tests/planning-v3-exposure-api.test.ts`
  - PASS
- `pnpm exec eslint src/app/api/planning/v3/categories/rules/route.ts src/app/api/planning/v3/categories/rules/[id]/route.ts src/app/api/planning/v3/indicators/specs/route.ts src/app/api/planning/v3/journal/entries/route.ts src/app/api/planning/v3/journal/entries/[id]/route.ts src/app/api/planning/v3/routines/daily/route.ts src/app/api/planning/v3/scenarios/library/route.ts tests/planning-v3-categories-rules-api.test.ts tests/planning-v3-journal-api.test.ts tests/planning-v3-routines-api.test.ts tests/planning-v3-indicators-specs-import-api.test.ts tests/planning-v3-user-facing-remote-host-api.test.ts tests/planning-v3-write-route-guards.test.ts tests/planning-v3-internal-route-contract.test.ts tests/planning-v3-exposure-api.test.ts`
  - PASS
- `pnpm build`
  - PASS
- `git diff --check -- src/app/api/planning/v3/categories/rules/route.ts src/app/api/planning/v3/categories/rules/[id]/route.ts src/app/api/planning/v3/indicators/specs/route.ts src/app/api/planning/v3/journal/entries/route.ts src/app/api/planning/v3/journal/entries/[id]/route.ts src/app/api/planning/v3/routines/daily/route.ts src/app/api/planning/v3/scenarios/library/route.ts work/3/13/2026-03-13-planning-v3-api-contract-followup.md`
  - PASS

## 미실행 검증
- `pnpm e2e:rc`
- `pnpm release:verify`
- `pnpm planning:v2:complete`
- `pnpm planning:current-screens:guard`

## 남은 리스크
- 이번 라운드에서는 실제 API contract mismatch를 찾지 못했지만, route/test 파일들은 여전히 dirty 상태다. 다음 큰 bucket에서 다른 축과 섞지 않도록 continue note가 필요하다.
- `tests/planning-v3-exposure-api.test.ts`는 통과했으나, `exposure/profile` route 자체는 조건부 제외를 유지했다. 향후 exposure contract 전용 배치가 열리면 그때 route와 테스트를 다시 같이 본다.

## 다음 라운드 우선순위
- 다음 라운드는 `store/helper` 또는 별도 isolated bucket으로 이동하고, 이미 닫은 `quickstart/home`, `news/settings`, `txn-overrides follow-through`, `user-facing page follow-up`은 새 runtime 이슈가 없으면 다시 열지 않는다.
