# 2026-07-01 Benefits/Gov24 공공혜택 흐름 통합

## 대상 Issue
- GitHub Issue: #122 `[High] Benefits/Gov24 공공혜택 흐름 통합`

## 사용 skill
- `planning-gate-selector`: public route, API, UI, e2e 변경에 필요한 검증 범위 선정
- `route-ssot-check`: `/benefits`, `/gov24` 공개 경로와 `docs/current-screens.md` 정합성 확인
- `dart-data-source-hardening`: 공공/외부 데이터 snapshot, fallback, freshness, 사용자 안내 문구 점검
- `work-log-closeout`: 변경 종료 기록 작성
- `manager` subagent: #122 범위 분해와 영향 파일/검증 후보 정리

## 수정 대상 파일
- `src/lib/publicApis/benefitsFlowContract.ts`
- `src/components/BenefitsClient.tsx`
- `src/components/Gov24Client.tsx`
- `src/app/api/gov24/search/route.ts`
- `src/app/api/gov24/simple-find/route.ts`
- `src/components/PlanningRunsClient.tsx`
- `docs/current-screens.md`
- `docs/README.md`
- `tests/benefits-gov24-flow-contract.test.ts`

## 변경 이유
- `/benefits`와 `/gov24`가 모두 공개 경로인데 snapshot 없음, 일부 누락, empty, API 실패 문구가 각 화면에 흩어져 있었다.
- public API response와 사용자 UI에는 `/api/dev`, `pnpm`, 내부 script 같은 운영자 진단 힌트가 노출되지 않아야 했다.
- Gov24 guided finder와 Benefits canonical search는 데이터 원천과 상세 기능은 다르지만, 공공혜택 사용자 안내와 fallback 기준은 같은 contract를 써야 했다.

## 구현 요약
- `benefitsFlowContract.ts`를 추가해 공공혜택 disclaimer, loading, empty, request failed, snapshot missing 문구와 error sanitizer를 공통화했다.
- `buildBenefitsSnapshotStatus`와 `benefitResultSummary`로 snapshot 상태, 기준 시점, 부분 누락, 결과 요약 표시를 공유 view contract로 묶었다.
- `BenefitsClient`와 `Gov24Client`가 API error, catch fallback, empty/result/snapshot 안내를 공통 helper로 표시하도록 바꿨다.
- `/api/gov24/search`, `/api/gov24/simple-find`의 snapshot missing meta가 내부 명령 대신 공통 사용자 메시지를 반환하도록 정리했다.
- `docs/current-screens.md`, `docs/README.md`에 `/benefits`는 대표 검색, `/gov24`는 조건형 찾기이며 fallback/error 표시 정책을 공유한다고 기록했다.
- e2e 회귀로 드러난 planning 실행 비교 선택 경합을 `PlanningRunsClient`에서 selected run seed와 단일 peer 자동 해석으로 보정했다.

## 확인 명령과 결과
- `pnpm vitest run tests/benefits-gov24-flow-contract.test.ts tests/external-api-error-contract.test.ts tests/gov24-route-guards.test.ts tests/gov24-simplefind-pagination.test.ts tests/benefits-snapshot-no-autorebuild.test.ts`: PASS, 5 files / 13 tests
- `pnpm typecheck`: PASS
- `pnpm lint`: PASS
- `rg -n -e 'pnpm' -e '/api/dev' -e 'snapshot.*refresh' -e 'Run ' src/components src/app/api src/lib/publicApis tests docs`: PASS, 남은 hit는 dev-only refresh 버튼, sanitizer 패턴, 문서/테스트 fixture로 확인
- `pnpm planning:current-screens:guard`: PASS, 5 files / 9 tests
- `pnpm planning:ssot:check`: PASS, `[planning:ssot:check] PASS`
- `pnpm test`: PASS, 753 files / 2496 tests
- `pnpm build`: PASS
- `PORT=3139 PLANNING_DATA_DIR=.data/planning-e2e-122-flow-rerun2 pnpm e2e tests/e2e/flow-history-to-report.spec.ts --workers=1`: PASS, 10 passed
- `PORT=3141 PLANNING_DATA_DIR=.data/planning-e2e-122-quickstart-rerun pnpm e2e tests/e2e/planning-quickstart-preview.spec.ts --workers=1`: PASS, 3 passed
- `PORT=3142 PLANNING_DATA_DIR=.data/planning-e2e-122-full-rerun2 pnpm e2e:rc`: PASS, 24 passed / 1 skipped
- `git diff --check`: PASS

## 실패/재시도 기록
- `pnpm typecheck` 1차는 `sanitizeBenefitUserMessage` 기본 fallback 타입이 literal로 좁혀져 `snapshotMissing` 문자열 전달에서 실패했다. fallback 인자를 `string`으로 명시해 수정한 뒤 PASS를 확인했다.
- `PORT=3136 PLANNING_DATA_DIR=.data/planning-e2e-122-full pnpm e2e:rc` 1차는 cold compile timeout 1건과 planning 비교 helper 미노출 1건으로 실패했다.
- `PORT=3137 PLANNING_DATA_DIR=.data/planning-e2e-122-flow pnpm e2e tests/e2e/flow-history-to-report.spec.ts --workers=1`은 selected run checkbox와 async run reload 경합으로 비교 helper가 표시되지 않아 실패했다. `PlanningRunsClient` 보정 후 targeted spec PASS를 확인했다.
- `PORT=3140 PLANNING_DATA_DIR=.data/planning-e2e-122-full-rerun pnpm e2e:rc`는 quickstart fallback injection 경합으로 1건 실패했다. 같은 spec targeted 재실행 PASS 후 full `e2e:rc` 재실행 PASS를 확인했다.
- PowerShell에서 Bash 변수와 파이프 인용이 충돌해 임시 데이터 정리 명령 1회가 실패했다. PowerShell 네이티브 경로 검증 후 `.data/planning-e2e-122-*`만 삭제했다.

## 남은 리스크와 엣지케이스
- Gov24 원천 API, detail, sync 정책은 이번 범위에서 바꾸지 않았다. 통합 범위는 사용자 표시 contract와 snapshot/error/fallback 안내에 한정된다.
- `BenefitsClient`의 dev-only refresh 버튼은 non-production에서만 `/api/dev/benefits/snapshot/refresh`를 호출한다. public 사용자 메시지 sanitizer가 내부 명령 노출을 막지만, production hidden 전제는 계속 유지해야 한다.
- full e2e 로그에 `PlanningReportsDashboard`의 `<details open>` hydration mismatch warning이 남아 있다. 최종 PASS에는 영향이 없었지만 별도 정리 후보이다.
- legacy route/API 삭제는 telemetry/access log와 실제 사용처 확인 전까지 확정하지 않는 정책을 유지했다.

## 롤백 기준
- 공개 화면에서 내부 endpoint, `pnpm`, script 실행 안내가 다시 보이면 helper를 되돌리기보다 sanitizer 적용 경로를 추가한다.
- Benefits/Gov24 결과 수나 empty 안내가 실제 API 응답과 맞지 않으면 `benefitResultSummary`와 snapshot status builder를 우선 점검한다.
- planning 비교 UX가 회귀하면 `PlanningRunsClient`의 selected run seed 변경은 별도로 되돌릴 수 있다.

## 다음 라운드 우선순위
- 등록된 우선순위 12개 Issue는 #114부터 #125까지 모두 로컬 구현과 검증을 완료했다.
- 다음 단계는 전체 변경분 최종 감사, PR 작성 전 변경 범위 review, legacy 삭제 판단에 필요한 telemetry/access log 확보이다.
