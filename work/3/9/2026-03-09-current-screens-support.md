# 2026-03-09 Current Screens Support Alignment

### Scope

- Continued route SSOT cleanup after report-route and ops-route alignment.
- Targeted real public/support routes already used by dashboard, settings, feedback, and planning UI.

### Problem

- `docs/current-screens.md` still missed several real public routes that are already linked in the app:
  - `/feedback`
  - `/feedback/list`
  - `/feedback/[id]`
  - `/planning/runs/[id]`
  - `/planning/trash`
  - `/settings`
  - `/settings/backup`
  - `/settings/maintenance`
  - `/settings/recovery`
- That left the route SSOT behind actual internal navigation.

### Changes

- Updated `docs/current-screens.md` to include the support/settings/planning public routes above.
- Added regression test:
  - `tests/planning/catalog/currentScreens.supportRoutes.test.ts`

### Validation

- `pnpm test tests/planning/catalog/currentScreens.supportRoutes.test.ts tests/planning/catalog/currentScreens.opsRoutes.test.ts tests/planning/catalog/currentScreens.reportRoutes.test.ts`

### Notes

- Remaining undocumented real routes are now mostly legacy/prototype/v3-specific:
  - `/planner*`
  - `/planning/reports/prototype`
  - `/planning/v3/*`
  - `/debug/planning-v2`
- Those should be handled in a separate slice because they need explicit classification rather than a simple public-route add.

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
