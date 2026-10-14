# Planning v2 Policy Defaults (Frozen, v1.0.2)

이 문서는 v2 기본 정책값의 기준(Single Source of Truth)을 고정합니다.
기본값 변경은 bugfix 범위를 넘어설 수 있으므로, v2에서는 임의 변경하지 않습니다.

## Planning Policy Defaults

소스: `src/lib/planning/catalog/planningPolicy.ts`

- `dsr.cautionPct`: `40`
- `dsr.riskPct`: `60`
- `emergencyFundMonths.caution`: `6` (`EMERGENCY_FUND_TARGET_MONTHS`, 2026-10-14 사용자 결정으로 3 → 6)
- `emergencyFundMonths.risk`: `1`

## Emergency Fund Standard

소스: `src/lib/planning/calc/emergencyFundPolicy.ts`

- `EMERGENCY_FUND_TARGET_MONTHS`: `6` (월 생활비 기준 개월 수)
- 같은 값을 단계 엔진 기본값, `balanced`/`safety`/`growth` preset의 `minEmergencyMonths`, 행동 제안 목표,
  optimizer 기본 제약, 해석 정책 `emergencyFundMonths.caution`, v3 거래 기반 초안 추정이 함께 사용합니다.
- 저장된 실행은 생성 시점의 해석 정책(`reproducibility.policy`)을 유지하므로 기존 리포트의 판정은 바뀌지 않고,
  새 실행부터 6개월 기준이 적용됩니다.
- `monthlySurplusKrw.cautionMax`: `0`
- `monthlySurplusKrw.riskMax`: `-1`
- `monteCarlo.cautionDepletionPct`: `10`
- `monteCarlo.riskDepletionPct`: `30`
- `snapshot.staleCautionDays`: `45`
- `snapshot.staleRiskDays`: `120`
- `warnings.cautionCount`: `8`

## Ops Policy Defaults

소스: `src/lib/ops/opsPolicy.ts`

- assumptions
  - `staleCautionDays`: `45`
  - `staleRiskDays`: `120`
- runs
  - `defaultPageSize`: `20`
  - `maxPageSize`: `200`
  - `defaultKeepDays`: `90`
  - `defaultKeepCount`: `50`
  - `maxKeepDays`: `3650`
  - `maxKeepCount`: `5000`
- doctor
  - `requiredEnvVars`: `["NODE_ENV"]`
  - `successRunWarnDays`: `30`
  - `scheduledRunFailureWarnCount`: `3`
  - `scheduledRunFailureWindowDays`: `14`
- backup
  - `maxUploadBytes`: `26214400` (25 MiB)
  - `maxEntries`: `10000`
  - `maxPreviewIds`: `200`
- metrics
  - `failureRateWarnPct`: `20`
  - `latencyRegressionWarnMs`: `2500`
  - `refreshFailureWarnCount`: `3`
  - `shortWindowHours`: `24`
  - `longWindowDays`: `7`
- dataQuality
  - `finlifeSnapshotStaleWarnDays`: `30`
  - `dartCorpIndexStaleWarnDays`: `14`

## Freeze Rule

1. 위 기본값은 v2 동결 구간에서 변경하지 않습니다.
2. 불가피한 변경 시:
   - `docs/releases/planning-v2-{version}.md`에 근거/영향/롤백을 기록합니다.
   - `pnpm planning:v2:complete` + `pnpm planning:v2:regress` 통과를 확인합니다.
3. 환경변수 override는 운영 편의 목적이며, 코드 기본값(SSOT)을 대체하지 않습니다.
