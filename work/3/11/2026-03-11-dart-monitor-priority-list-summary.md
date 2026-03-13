# 2026-03-11 DART 모니터 우선 확인 리스트와 summary 직접 액션

## 내부 회의 요약
- 직전 라운드까지는 `신규만 보기`, `미조회만 보기`, `전체 보기`를 저장하고 복원할 수 있었지만, summary 영역이 숫자만 보여줘서 사용자가 지금 바로 눌러 확인할 기업을 다시 목록에서 찾아야 했다.
- 추가 기능 후보로는 `지금 먼저 볼 기업` 상단 리스트, `신규 공시 기업만 새로고침`, planning/report 기능 복귀가 있었고, 이번에는 가장 작은 범위에서 체감 가치를 높이는 `summary 우선 확인 리스트`를 선택했다.
- 이번 라운드는 우선순위 계산 helper, summary 하단 quick action UI, DART 회귀 테스트 보강, 전체 게이트 검증까지 닫는 범위로 고정했다.

## 수정 대상 파일
- `src/lib/dart/disclosureMonitor.ts`
- `src/components/DartDisclosureMonitorClient.tsx`
- `tests/dart-disclosure-monitor-helpers.test.ts`
- `tests/e2e/dart-flow.spec.ts`

## 변경 이유
- summary 카드가 숫자만 보여주면 사용자는 다시 아래 카드 목록으로 내려가서 대상을 찾게 된다.
- DART 모니터는 `신규 공시 있음`, `아직 미조회`, `최근 확인` 우선순위가 이미 있으므로, 이 기준을 summary 아래에서 바로 노출하면 확인 흐름이 짧아진다.
- 이 기능은 기존 API 계약을 바꾸지 않고 helper와 UI 보강만으로 안전하게 추가할 수 있다.

## 변경 내용
- disclosure monitor helper에 `buildDisclosureMonitorPriorityList()`를 추가해 `신규 공시 -> 미조회 -> 최근 확인` 기준의 상위 3개 기업을 계산하도록 했다.
- summary 아래에 `지금 먼저 볼 기업` 블록을 추가하고, 각 항목에 상태 배지, 쉬운 설명, `회사 상세`, `바로 조회` 액션을 붙였다.
- DART E2E는 summary 우선 확인 리스트가 보이고, 그 링크로 회사 상세까지 진입되는 흐름을 고정했다.
- helper unit test는 우선순위 리스트 계산 결과를 직접 검증하도록 확장했다.

## 실행한 검증
- `pnpm lint`
- `pnpm test`
- `pnpm build`
- `pnpm e2e:rc:dart`
- `pnpm e2e:rc`

## 검증 결과
- `pnpm lint` PASS
- `pnpm test` PASS `612 files / 1742 tests`
- `pnpm build` PASS
- `pnpm e2e:rc:dart` PASS `3 passed`
- `pnpm e2e:rc` PASS `9 passed`

## 남은 리스크
- 이번 라운드 범위에서 재현된 미해결 리스크는 없다.

## 다음 작업
- 이 메모는 `/work` 구조 정렬 배치에서 `다음 작업` 섹션만 보강했습니다.
- 실제 후속 우선순위는 더 최신 closeout 기준으로 다시 판단합니다.

## 사용 skill
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 사용 skill 상세는 기존 본문 기준으로 확인합니다.
