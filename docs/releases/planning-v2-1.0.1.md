# Planning v2 Release Notes (1.0.1)

- Version: `1.0.1`
- Date: `2026-03-01`

## Highlights

### 1) `/planning` Form UX
- 기본 입력 경로를 폼 중심으로 고정했습니다(JSON 원문은 Advanced로 격리).
- 월 수입/지출, 자산, 부채, 목표 입력 흐름을 초보자 기준으로 단순화했습니다.
- 실시간 요약(잉여/DSR/비상금 등)과 실행 전 검증 메시지를 강화했습니다.

### 2) `/planning/reports` Dashboard
- 기본 화면을 run 기반 대시보드로 고정했습니다.
- 리포트 기본 뷰에서 raw dump를 제거하고, Advanced 토글에서만 원문을 노출합니다.
- Summary/Warnings/Goals/Top Actions/Interpretation 가시성을 표준화했습니다.

### 3) Warning Aggregation
- 월별 반복 경고를 코드+대상 기준으로 집계해 중복 노이즈를 줄였습니다.
- 경고 테이블은 빈 상태에서도 구조를 유지해 회귀 테스트 안정성을 높였습니다.

### 4) Stage Pipeline Visibility
- 단계별 상태(PENDING/RUNNING/SUCCESS/FAILED/SKIPPED) 표기를 표준화했습니다.
- 부분 실패/예산 초과(SKIPPED) 시 리포트 섹션 게이팅 메시지를 명확히 했습니다.

### 5) OPS Features
- assumptions/runs/doctor/feedback 중심 운영 콘솔 흐름을 정리했습니다.
- 운영 화면에 공통 로딩/에러/빈 상태를 적용해 무응답/공백 UX를 제거했습니다.

### 6) Security Hardening
- local-only + CSRF 정책을 상태 변경 API 경로에 일관 적용했습니다.
- 보안 헤더/CSP 기본 정책을 정리했습니다(적용 경로 기준).
- 로그/출력의 민감정보 마스킹(토큰/내부 경로 등) 기준을 유지했습니다.

## Frozen Policy Defaults
- Planning/Ops 기본 정책값은 아래 문서 기준으로 동결합니다.
- `docs/planning-v2-policy-defaults.md`

## CI Required Gates
- CI 최소 required gate:
  - `pnpm test`
  - `pnpm planning:v2:complete`

## Upgrade Notes
- Legacy APR 입력 `0 < x <= 1`은 percent로 자동 정규화됩니다(`x * 100`).
- canonical contract:
  - `debts[].aprPct` (percent)
  - `offers[].newAprPct` (percent)
- `offers[].liabilityId`는 `debts[].id`와 strict match가 필요하며, 불일치 시 검증 실패로 차단됩니다.
