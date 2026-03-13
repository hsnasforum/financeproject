# 2026-03-11 DART 모니터 직접 액션과 전용 RC 보강

## 내부 회의 요약
- 직전 라운드까지 `search -> company -> monitor` 컨텍스트 복원은 닫혔지만, 모니터 화면 안에서는 `새로고침`과 `확인 처리` 외에 바로 할 수 있는 동작이 부족했다.
- 추가 기능 후보로는 모니터 행 액션 강화, DART 전용 RC 묶음, planning/report 복귀가 있었고, 이번에는 사용자 가치가 크고 수정 범위가 가장 작은 `모니터 카드 직접 액션 + DART 전용 RC 단축` 조합을 선택했다.
- 이번 라운드는 `회사 상세로 이동`, `모니터에서 제거`, `운영 검증 단축`까지만 닫고, 전체 게이트를 다시 통과시키는 범위로 고정했다.

## 수정 대상 파일
- `src/components/DartDisclosureMonitorClient.tsx`
- `tests/e2e/dart-flow.spec.ts`
- `package.json`
- `README.md`
- `docs/README.md`

## 변경 이유
- 모니터 카드에서 회사 상세를 다시 보거나 관심 기업을 바로 제거하려면 사용자가 우회 동선을 밟아야 했다.
- DART 영역만 빠르게 다시 검증하려고 해도 기존에는 전체 RC 셋을 항상 실행해야 했다.
- 둘 다 작은 수정으로 UX와 운영 효율을 동시에 올릴 수 있는 지점이다.

## 변경 내용
- 모니터 카드마다 `회사 상세` 링크를 추가해 현재 즐겨찾기 기업에서 바로 회사 상세 화면으로 이동할 수 있게 했다.
- 같은 카드에 `모니터에서 제거` 버튼을 추가해 즐겨찾기 목록과 모니터 목록에서 즉시 빠지도록 연결했다.
- 모니터 액션은 기존 `corpName` 컨텍스트를 유지하는 `buildDartCompanyHref()`를 사용해 상세 진입 품질을 그대로 유지한다.
- DART 흐름 E2E는 모니터 카드에서 회사 상세로 이동하고 다시 모니터로 돌아와 제거까지 되는지 확인하도록 확장했다.
- `pnpm e2e:rc:dart` 스크립트를 추가하고 README, docs/README에 사용 시점을 기록했다.

## 실행한 검증
- `pnpm lint`
- `pnpm test`
- `pnpm build`
- `pnpm e2e:rc:dart`
- `pnpm e2e:rc`

## 검증 결과
- `pnpm lint` PASS
- `pnpm test` PASS `612 files / 1738 tests`
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
