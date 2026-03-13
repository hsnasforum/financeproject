# 2026-03-11 DART 모니터 focus mode 확장과 미조회 전용 보기

## 내부 회의 요약
- 직전 라운드까지 `신규 공시만 보기`와 보기 옵션 저장은 들어갔지만, 아직 `아직 확인하지 않은 기업만 보기`를 바로 고르는 집중 모드가 없었다.
- 추가 기능 후보로는 `미조회만 보기`, 신규 공시 기업 상단 요약 리스트, planning/report 복귀가 있었고, 이번에는 가장 작은 범위에서 모니터 확인 효율을 높이는 `미조회 전용 focus mode`를 선택했다.
- 기존 저장소에는 `showPendingOnly`만 들어 있었기 때문에, 이번 라운드는 새 focus mode를 넣되 legacy 저장값도 계속 읽을 수 있게 마이그레이션 호환까지 함께 닫는 범위로 고정했다.

## 수정 대상 파일
- `src/lib/dart/dartDisclosureStore.ts`
- `src/components/DartDisclosureMonitorClient.tsx`
- `tests/dart-disclosure-store.test.ts`
- `tests/e2e/dart-flow.spec.ts`

## 변경 이유
- 신규 공시가 없는 날에도 사용자는 `아직 한 번도 확인하지 않은 기업`만 따로 보고 싶을 수 있다.
- 기존 boolean 기반 보기 옵션은 `all / pending / unchecked`처럼 늘어나는 집중 모드를 안전하게 표현하기 어렵다.
- 이미 저장된 로컬 상태를 깨지 않으면서 새 모드를 추가해야 재방문 UX와 하위 호환을 함께 지킬 수 있다.

## 변경 내용
- disclosure store의 보기 옵션을 `focusMode: "all" | "pending" | "unchecked"`로 확장하고, legacy `showPendingOnly` 값은 자동으로 `pending`으로 읽히게 했다.
- 모니터 화면은 `미조회만 보기`를 summary quick action과 보기 옵션 카드 모두에서 켜고 끌 수 있게 바꿨다.
- 빈 상태와 안내 문구는 `신규 공시 없음`과 `아직 미조회 없음`을 구분해 보여주도록 정리했다.
- DART store unit test는 새 focus mode 저장과 legacy 호환을 검증하고, DART E2E는 `미조회만 보기 -> 재진입 후 복원 -> 신규만 보기 -> 전체 복귀` 흐름까지 고정했다.

## 실행한 검증
- `pnpm lint`
- `pnpm test`
- `pnpm build`
- `pnpm e2e:rc:dart`
- `pnpm e2e:rc`

## 검증 결과
- `pnpm lint` PASS
- `pnpm test` PASS `612 files / 1741 tests`
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
