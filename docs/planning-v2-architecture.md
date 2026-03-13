# Planning v2 Architecture

## 설계 원칙
- 엔진(`src/lib/planning/core/v2/*`)은 오프라인 순수 함수로 유지합니다.
- 최신성은 실시간 네트워크 호출이 아니라 assumptions snapshot 주입으로 처리합니다.
- 서버 네트워크는 snapshot sync/finlife 조회처럼 운영 경계에서만 허용합니다.
- 계산/저장 데이터의 통화 단위는 KRW(raw number)로 고정하고, locale 차이는 표시 레이어(i18n/format)에서만 처리합니다.

## 모듈 경계
- Core (`src/lib/planning/core/v2`)
  - `simulateMonthly`, scenarios, monte-carlo, actions, debt strategy
  - 순수 계산/검증/설명 생성
- Server (`src/lib/planning/server/*` + 기존 서버 구현)
  - API/OPS에서 사용하는 서버 전용 접근 경계
  - assumptions/cache/store/migrations/ops I/O를 서버 경계로 통합
- Assumptions (`src/lib/planning/assumptions`)
  - fetch/sync/storage/history
  - 외부 지표 수집 + 로컬 스냅샷 영속화
- Actions + Product candidates
  - plan 경고/지표를 실행 항목으로 변환
  - finlife 후보는 서버에서만 조회, 결과는 비교용 요약
- Store (`src/lib/planning/store`)
  - profiles/runs 파일 저장소
  - run은 profileId 참조 + 요약 출력 중심 저장
- Ops (`src/app/ops`, `src/lib/ops`)
  - local-only + CSRF + audit + backup/restore + doctor

## 공식 경로

- 공식 계산 SSOT:
  - `src/lib/planning/core/v2/*`
- 공식 엔진 진입:
  - `src/lib/planning/engine/*`
  - `src/lib/planning/server/v2/toEngineInput.ts`
- 공식 report 경로:
  - `run -> resultDto -> ReportInputContract -> ReportVM`
  - 구현 위치:
    - `src/lib/planning/reports/reportInputContract.ts`
    - `src/app/planning/reports/_lib/reportViewModel.ts`
    - `src/app/api/planning/v2/runs/[id]/report/route.ts`
    - `src/app/api/planning/reports/[runId]/export.html/route.ts`

신규 계산/정책/리포트 해석은 위 경로에만 추가합니다.

추가 금지 경로:

- `src/lib/planner/*`
- `src/app/report/*`
- `src/components/ReportClient.tsx`
- `src/app/recommend/*` 내부의 독자적 금융 상태 판정

원칙:

- UI는 `run.outputs.*`를 직접 재해석하기보다 `ResultDto` 또는 `ReportVM`을 소비한다.
- `planner_last_snapshot_v1` 기반 경로는 legacy 전용으로 유지한다.
- `recommend`는 planning stage 입력 계약이 확장되기 전까지 planning engine의 대체 판정을 만들지 않는다.

## Import 경계 규칙
- `app/api/planning/v2/*`는 `src/lib/planning/server/*` 경로를 우선 사용합니다.
- `use client` 파일은 `src/lib/planning/server/*` import를 금지합니다.
- `src/lib/planning/core/*`는 `src/lib/planning/server/*` import를 금지합니다.
- 경계 위반은 `pnpm planning:v2:guard`에서 정적 스캔으로 차단합니다.

## 재현성
- 실행 재현 키:
  - `snapshotId`
  - run input (`horizon`, `assumptions override`, `monteCarlo seed/paths` 등)
  - regression corpus/baseline
- run 레코드와 snapshot history를 함께 사용하면 과거 결과를 재실행/비교할 수 있습니다.

## 데이터 정책 (요약)
- 필수 백업(A): assumptions latest/history, profiles, runs
- 선택 백업(B): cache, eval report/history
- B 누락은 복구 가능(재계산 가능)하나, A 누락은 재현성/사용자 데이터 손실 위험이 큽니다.

## 보안/프라이버시 가드
- planning/ops API는 local-only 정책(localhost/127.0.0.1/::1)으로 제한합니다.
- 변경/비용이 큰 POST는 same-origin 검증을 기본으로 적용합니다.
- CSRF 쿠키(`dev_csrf`)가 있는 요청은 body `csrf`와 일치해야 통과합니다.
- API 응답에는 키/토큰(예: ECOS/GitHub/finlife)과 내부 경로(`.data/...`)를 노출하지 않습니다.
- 스냅샷 응답은 요약 메타(`id/asOf/fetchedAt/missing/warningsCount/sourcesCount`) 중심으로 전달합니다.
- Actions/Monte Carlo/Debt는 "후보 비교용, 보장 아님" 고지를 표준 문구로 유지합니다.

## 기능 플래그
- planning 관련 기능 플래그는 `src/lib/planning/config.ts`에서 단일 진입점으로 읽습니다.
- 기본값:
  - `PLANNING_DEBUG_ENABLED=false`
  - `ECOS_ENABLED=true`(키 없으면 fallback)
  - `PLANNING_MONTE_CARLO_ENABLED=true`
  - `PLANNING_INCLUDE_PRODUCTS_ENABLED=false`
- 서버 플래그가 비활성화된 기능은 UI에서 안내하고, API에서도 실행을 거부합니다.
