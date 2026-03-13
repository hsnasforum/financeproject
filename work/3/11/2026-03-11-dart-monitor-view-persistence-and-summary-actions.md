# 2026-03-11 DART 모니터 보기 옵션 복원과 요약 액션

## 내부 회의 요약
- 직전 라운드에서 `신규 공시만 보기`와 우선순위 정렬은 들어갔지만, 사용자가 페이지를 다시 열면 보기 모드가 초기화되어 반복 클릭이 필요하다는 UX 공백이 남아 있었다.
- 추가 기능 후보로는 보기 옵션 저장, 요약 카드 quick action, DART 운영 문서 분리가 있었고, 이번에는 가장 작은 범위에서 체감 가치가 큰 `보기 옵션 저장 + 요약 영역 빠른 전환`을 선택했다.
- 이번 라운드는 보기 옵션 상태를 저장하고, summary에서 바로 그 상태로 전환하는 액션까지 닫은 뒤 unit test와 RC 게이트까지 다시 통과시키는 범위로 고정했다.

## 수정 대상 파일
- `src/lib/dart/dartDisclosureStore.ts`
- `src/components/DartDisclosureMonitorClient.tsx`
- `tests/dart-disclosure-store.test.ts`
- `tests/e2e/dart-flow.spec.ts`

## 변경 이유
- `신규 공시만 보기`는 유용하지만 재방문 시 초기화되면 반복 조작 비용이 생긴다.
- 요약 카드에서 바로 `신규만 보기`나 `전체 보기`로 전환할 수 없으면, 보기 옵션 카드까지 시선을 다시 내려야 한다.
- 이 문제는 API 계약을 바꾸지 않고 로컬 저장과 UI 액션만으로 해결할 수 있다.

## 변경 내용
- disclosure store에 모니터 보기 옵션(`showPendingOnly`) 저장 필드를 추가하고, settings와 분리해서 안전하게 읽고 쓰도록 했다.
- 모니터 화면은 마운트 시 저장된 보기 옵션을 복원하고, 토글/복귀 버튼/summary quick action 모두 같은 저장 경로를 쓰도록 정리했다.
- 요약 영역에 `신규 공시 N곳만 보기`, `전체 기업 보기` 버튼을 추가해 상단에서 즉시 집중 모드 전환이 가능하게 했다.
- DART store unit test는 보기 옵션 저장 복원을 검증하도록 확장했고, DART E2E는 summary quick action으로 모드를 켠 뒤 재진입해도 그 상태가 유지되는지 확인하도록 보강했다.

## 실행한 검증
- `pnpm lint`
- `pnpm test`
- `pnpm build`
- `pnpm e2e:rc:dart`
- `pnpm e2e:rc`

## 검증 결과
- `pnpm lint` PASS
- `pnpm test` PASS `612 files / 1740 tests`
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
