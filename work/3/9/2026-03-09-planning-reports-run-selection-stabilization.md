# 2026-03-09 planning reports run selection stabilization

### 작업 배경

- 공식 리포트 경로 `/planning/reports` 는 현재 제품 기준 핵심 결과 허브다.
- 기존 구현은 `runId` 로 진입해도 최신 50개 목록 안에 없으면 선택 대상이 사라질 수 있었다.
- 같은 패턴이 `/planning/reports/prototype` 에도 반복되어 deep link 안정성이 부족했다.

### 변경 파일

- `src/lib/planning/reports/runSelection.ts`
- `src/app/planning/reports/page.tsx`
- `src/app/planning/reports/prototype/page.tsx`
- `src/components/PlanningReportsDashboardClient.tsx`
- `src/components/PlanningReportsPrototypeClient.tsx`
- `tests/planning/reports/runSelection.test.ts`

### 변경 내용

- requested `runId` 를 정확히 조회해서 실제 소속 profile 기준으로 리포트 범위를 다시 잡는 공용 helper를 추가했다.
- 최신 50개 목록에 없는 오래된 run도 리포트 선택 목록에 보존되도록 병합 로직을 넣었다.
- 공식 리포트와 프로토타입 리포트 모두 서버 페이지와 클라이언트 재조회 흐름에서 같은 보정 로직을 사용하게 맞췄다.
- 회귀 테스트를 추가해 오래된 run deep link가 빠지지 않는 조건을 고정했다.

### 검증

- `pnpm test tests/planning/reports/runSelection.test.ts tests/planning-v2/reportViewModel.test.ts tests/planning/reports/recommendationSignals.test.ts tests/planning-v2-api/report-contract-mode-route.test.ts`
- `pnpm exec eslint src/app/planning/reports/page.tsx src/app/planning/reports/prototype/page.tsx src/components/PlanningReportsDashboardClient.tsx src/components/PlanningReportsPrototypeClient.tsx src/lib/planning/reports/runSelection.ts tests/planning/reports/runSelection.test.ts`

### 빌드/타입 상태

- `pnpm build` 는 webpack compile 후 TypeScript 단계에서 실패했다.
- `pnpm typecheck` 로 확인한 결과 실패 원인은 이번 변경 파일이 아니라 저장소 전반의 기존 타입 오류다.
- 대표 위치:
  - `planning/v3/indicators/connectors/*.test.ts`
  - `planning/v3/news/*.test.ts`
  - `tests/planning-v2/reportViewModel.test.ts`
  - `tests/planning/reports/reportDashboardOverrides.test.tsx`

### 남은 리스크

- 현재 클라이언트 보정은 서버가 넘긴 `initialRuns` 기준으로 오래된 run을 유지한다.
- 전체 저장소 typecheck가 막혀 있어 이번 변경을 포함한 전역 build 신뢰도는 아직 낮다.
- 다음 우선순위는 planning 공식 report 경로 기준으로 deep link/e2e 한 번 더 확인하고, 이어서 전체 타입 오류 정리 범위를 분리하는 것이다.

## 다음 작업
- 이 메모는 `/work` 구조 정렬 배치에서 `다음 작업` 섹션만 보강했습니다.
- 실제 후속 우선순위는 더 최신 closeout 기준으로 다시 판단합니다.

## 변경 파일
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 변경 파일 상세는 기존 본문 기준으로 확인합니다.

## 사용 skill
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 사용 skill 상세는 기존 본문 기준으로 확인합니다.

## 검증
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 실행 검증 상세는 기존 본문 기준으로 확인합니다.

## 남은 리스크
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 실제 잔여 리스크는 더 최신 closeout 기준으로 다시 판단합니다.
