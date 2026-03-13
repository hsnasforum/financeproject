# 2026-03-11 DART 모니터 우선순위 정렬과 신규만 보기

## 내부 회의 요약
- 직전 라운드까지 모니터 카드의 직접 액션과 DART 전용 RC 단축은 닫혔지만, 워치리스트가 늘어날수록 사용자가 지금 무엇을 먼저 봐야 하는지 바로 구분하기 어렵다는 UX 공백이 남아 있었다.
- 추가 기능 후보로는 모니터 집중 보기, DART 운영 문서 분리, planning/report 복귀가 있었고, 이번에는 가장 작은 범위에서 체감 가치가 큰 `신규 공시 우선 정렬 + 신규만 보기`를 선택했다.
- 이번 라운드는 보기 우선순위만 보강하고, helper/unit test/DART E2E/전체 RC까지 다시 통과시키는 것으로 범위를 고정했다.

## 수정 대상 파일
- `src/lib/dart/disclosureMonitor.ts`
- `src/components/DartDisclosureMonitorClient.tsx`
- `tests/dart-disclosure-monitor-helpers.test.ts`
- `tests/e2e/dart-flow.spec.ts`

## 변경 이유
- 모니터 카드가 많아지면 신규 공시가 있는 기업과 아직 보지 않은 기업을 사용자가 직접 찾느라 시선 이동이 커진다.
- 신규가 하나도 없는 시점에 `신규만 보기` 같은 집중 모드가 없으면, 지금 당장 볼 대상이 없는지도 한 번에 알기 어렵다.
- 이 문제는 계산 계약을 바꾸지 않고도 표시 우선순위와 안내만으로 안전하게 개선할 수 있다.

## 변경 내용
- 모니터 워치리스트 정렬 helper를 추가해 `신규 공시 있는 기업 -> 아직 미조회인 기업 -> 이미 확인한 기업` 순으로 정렬하도록 고정했다.
- 모니터 화면에 `신규 공시 있는 기업만 보기` 토글과 현재 보기 상태 안내 문구를 추가했다.
- 토글이 켜졌는데 신규 공시가 없으면 비어 있는 리스트 대신 안전한 `EmptyState`와 `전체 기업 보기` 복귀 버튼을 보여준다.
- DART helper unit test는 정렬 우선순위를 검증하도록 확장했고, DART E2E는 `신규만 보기 -> 빈 상태 -> 전체 보기 복귀` 흐름까지 확인하도록 보강했다.

## 실행한 검증
- `pnpm lint`
- `pnpm test`
- `pnpm build`
- `pnpm e2e:rc:dart`
- `pnpm e2e:rc`

## 검증 결과
- `pnpm lint` PASS
- `pnpm test` PASS `612 files / 1739 tests`
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
