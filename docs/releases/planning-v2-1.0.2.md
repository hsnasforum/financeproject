# Planning v2 Release Notes (1.0.2)

- Version: `1.0.2`
- Date: `2026-03-02`

## Highlights

### 1) `/planning` Form UX
- JSON 기본 입력을 폼 중심 UX로 고정하고 Advanced 편집으로 분리했습니다.
- 입력/저장 단위를 `aprPct`, `newAprPct` percent 기준으로 정리했습니다.
- 실행 전 검증과 요약 가독성을 개선했습니다.

### 2) `/planning/reports` Dashboard
- 기본 화면을 run 기반 대시보드로 유지하고 raw 출력은 Advanced로 제한했습니다.
- Summary/Warnings/Goals/Top Actions 중심 레이아웃을 유지합니다.

### 3) Warning Aggregation
- 월별 반복 경고를 code+subjectKey 기준으로 집계해 노이즈를 줄였습니다.
- unknown warning code는 안전한 fallback으로 표시합니다.

### 4) Stage Pipeline Statuses
- 단계 상태(PENDING/RUNNING/SUCCESS/FAILED/SKIPPED)와 부분 실패 표현을 고정했습니다.
- simulate 실패 시 후속 단계 차단, MC 예산 초과는 `SKIPPED(BUDGET_EXCEEDED)` 규칙을 유지합니다.

### 5) Ops Doctor + Actions
- `/ops/doctor` 점검, `/ops/actions` 실행, preview/confirm 안전 흐름을 운영 계약으로 고정했습니다.
- 지원 번들(export.zip)과 redaction gate 테스트를 포함합니다.

### 6) Security
- local-only + CSRF 정책을 상태 변경 경로에 유지합니다.
- 민감정보(토큰/키/내부경로/원문 blob) 노출 금지 정책을 유지합니다.

## Migration Notes
- Legacy APR 입력 `0 < x <= 1`은 percent로 정규화(`x * 100`)됩니다.
- canonical contract:
  - `debts[].aprPct` (percent)
  - `offers[].newAprPct` (percent)
- `offers[].liabilityId`는 `debts[].id`와 strict match가 필요하며, 불일치 시 저장/실행이 차단됩니다.

## Policy Defaults (Frozen)
- `planningPolicy`: `src/lib/planning/catalog/planningPolicy.ts`
- `opsPolicy`: `src/lib/ops/opsPolicy.ts`
- 문서 기준값: `docs/planning-v2-policy-defaults.md`

## Required CI Gates
- `pnpm test`
- `pnpm planning:v2:complete`
- `pnpm planning:v2:compat`

## Release Tag
- 기준 태그: `v1.0.2`
