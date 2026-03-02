# Planning v2 UX Freeze

목적: Planning v2 UI/리포트 UX를 동결해 사용자 경험 흔들림을 방지하고, 신규 확장은 v3로 분리합니다.

## 동결 대상
- `/planning` 입력 폼 구조: 필드명/단위/기본 입력 흐름.
- 결과 탭 구조: `Summary`, `Warnings & Goals`, `Actions`, `Scenarios` 기본 구성.
- `ResultInterpretationCard`: 해석 가이드 톤/문장 스타일(과장/권유 금지).
- HTML 리포트: 섹션 순서와 표 구성(`Executive Summary`, `Warnings`, `Goals`, `Action Plan`).
- `/planning/runs` 및 `/planning/reports`의 실행 기록 기반 리포트 접근 흐름(리포트 보기/다운로드).

## 변경 금지
- `warningGlossary.ko` 의미/조치 문장 대폭 변경(큰 변경은 v3).
- `ResultDtoV1` 필드 제거 또는 필드 의미/계약 변경.
- 리포트 섹션 순서 변경, 기본 표 구조 파괴.
- 해석 가이드 문구의 정책성/권유성 변경.

## 변경 허용
- 오타/문구 미세 수정.
- 버그 픽스(계산 오류, 데이터 누출, 명백한 UX 결함).
- 접근성/안정성 개선(기존 계약 유지 범위).

## 변경 시 필수 게이트
- `pnpm planning:v2:complete`
- `pnpm planning:v2:report:test`
- `pnpm planning:v2:guide:test`
- `pnpm planning:v2:regress` (planning core 변경 시)

## 회귀 기준(리포트/가이드)
- 리포트 회귀: `tests/planning-v2/report/htmlReport.test.ts`
- 해석 가이드 회귀: `tests/planning/v2/insights/interpret.test.ts`
- 정책: 문구/출력 변경이 필요한 경우 baseline 갱신보다 변경 사유를 먼저 검토하고, v2 범위를 넘으면 v3로 이관.

## v3 분리 규칙
- UX 구조 변경(탭 재구성, 출력 계약 변경, 리포트 포맷 재설계)은 v3에서만 진행.
- v2는 운영 안정화와 버그 수정 중심으로 유지.
