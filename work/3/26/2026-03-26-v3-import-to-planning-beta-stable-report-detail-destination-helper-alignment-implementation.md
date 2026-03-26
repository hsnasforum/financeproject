# 2026-03-26 v3 import-to-planning beta stable-report-detail destination-helper alignment implementation

## 변경 전 메모
1. 수정 대상 파일
- `src/components/PlanningReportDetailClient.tsx`
- 필요하면 관련 테스트 파일
2. 변경 이유
- `/planning/reports` landing/empty-state와 `/planning/runs` helper는 정리됐지만, `/planning/reports/[id]`는 아직 “저장된 실행 결과를 다시 읽는 상세 도착점” 문맥이 generic wording에 머물러 있다.
3. 실행할 검증 명령
- `pnpm lint`
- `pnpm build`
- `pnpm e2e:rc`
- 필요하면 관련 테스트 추가 또는 확장

## 변경 파일
- `src/components/PlanningReportDetailClient.tsx`
- `tests/e2e/flow-history-to-report.spec.ts`
- `work/3/26/2026-03-26-v3-import-to-planning-beta-stable-report-detail-destination-helper-alignment-implementation.md`

## 사용 skill
- `planning-gate-selector`: wording-only round에 맞는 최소 검증 세트를 `lint`, `build`, `e2e:rc`, `git diff --check`로 고정하고 조건부 guard 미실행 사유를 분리하기 위해 사용.
- `route-ssot-check`: `/planning/reports/[id]`를 포함한 stable/public route 목록과 현재 href/query semantics를 유지한 채 copy와 e2e만 조정하는지 확인하기 위해 사용.
- `work-log-closeout`: 변경 전 메모를 먼저 남기고, 구현 후 실제 변경/검증/남은 리스크를 같은 `/work` 파일에 closeout 형식으로 정리하기 위해 사용.

## 변경 이유
- 이번 라운드 목적은 `/planning/reports/[id]`를 새 entry로 만들지 않고, `/planning/reports`나 저장된 결과 흐름에서 이어 들어오는 상세 도착점으로 읽히게 만드는 smallest safe batch였다.
- route 추가/삭제, report fetch/download contract, compare 계산, entry policy는 열지 않고 `PageHeader`, 상단 helper, 메타 카드 helper, 대표 e2e만 조정했다.

## 핵심 변경
- `src/components/PlanningReportDetailClient.tsx`의 `PageHeader` title/description을 `플래닝 리포트 상세`와 `저장된 실행 결과를 다시 읽는 상세 도착 화면` 문맥으로 정리했다.
- 같은 파일의 action copy를 `추천 비교 기록으로 돌아가기`, `리포트 목록으로`로 조정하고, 헤더 아래에 `첫 진입점이 아닌 상세 도착점`이라는 helper 문장을 추가했다.
- report metadata 카드 상단에 run/recommend ref 유무에 맞춰 달라지는 `detailHelperText`를 넣어 저장된 실행 결과, 추천 비교 참조, 원문/PDF 후속 행동을 더 직접적으로 안내하게 했다.
- `tests/e2e/flow-history-to-report.spec.ts`에 saved report를 직접 생성한 뒤 `/planning/reports/[id]`로 들어가는 narrow e2e를 추가해 detail destination helper, 저장 결과 재읽기 문맥, `리포트 목록으로` action 노출을 직접 확인했다.
- detail route는 report id contract를 유지하므로 e2e도 run id가 아니라 saved report id를 만든 뒤 진입하도록 좁혔다.

## 검증
- `node scripts/playwright_with_webserver_debug.mjs test tests/e2e/flow-history-to-report.spec.ts --workers=1`
  - 결과: PASS
  - 비고: 새 report detail destination helper e2e를 포함해 4개 테스트 통과.
- `pnpm lint`
  - 결과: PASS
  - 비고: 저장소 기존 unused-var warning 25건은 그대로 남아 있다.
- `pnpm build`
  - 결과: PASS
- `pnpm e2e:rc`
  - 결과: PASS
  - 비고: 총 17개 테스트 통과. 새 report detail destination helper e2e 포함.
- `git diff --check -- src/components/PlanningReportDetailClient.tsx src/app/planning/reports/[id]/page.tsx tests/e2e/flow-history-to-report.spec.ts tests/planning-reports-page-fallback.test.tsx tests/planning/reports/reportDashboardOverrides.test.tsx work/3/26/2026-03-26-v3-import-to-planning-beta-stable-report-detail-destination-helper-alignment-implementation.md`
  - 결과: PASS
- [미실행] `pnpm planning:current-screens:guard` — route/href/query semantics를 바꾸지 않아 실행하지 않았다.
- [미실행] `pnpm planning:ssot:check` — route policy/catalog guard 자체를 바꾸지 않아 실행하지 않았다.

## 남은 리스크
- 이번 라운드는 stable report detail destination wording만 다뤘고, report schema, download API, compare 계산, route inventory, entry policy는 건드리지 않았다.
- [검증 필요] `src/components/PlanningRunsClient.tsx`의 상세 리포트 링크는 여전히 `/planning/reports/${selectedRun.id}`를 사용한다. 이번 라운드 중 초기 e2e 시도에서 detail route가 saved report id를 기대해 404가 나는 기존 contract mismatch가 드러났지만, route/report contract 변경은 범위 밖이라 수정하지 않았다.
- 따라서 이번 representative 검증은 `saved report 생성 -> /planning/reports/[id] 진입` 경로 기준으로 detail destination wording을 닫은 것이다. `/planning/runs`에서 detail route로 넘어가는 기존 href mismatch는 별도 배치에서 다시 다뤄야 한다.
