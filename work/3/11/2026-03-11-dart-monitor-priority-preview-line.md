# 2026-03-11 DART 모니터 priority 카드 최근 공시 1줄 요약

## 내부 회의 요약
- 직전 라운드에서 `지금 먼저 볼 기업` 리스트와 직접 액션은 들어갔지만, 카드 안 정보가 상태 설명 위주라 실제 어떤 공시를 볼지 클릭 전에는 감이 약했다.
- 추가 기능 후보로는 priority 카드 최근 공시 1줄 요약, 신규 공시 기업만 새로고침, planning/report 복귀가 있었고, 이번에는 가장 작은 범위에서 정보 밀도를 높이는 `priority 카드 preview 문구`를 선택했다.
- 이번 라운드는 helper에서 preview 문구를 안전하게 계산하고, priority 카드에 노출하고, unit test와 DART/전체 RC를 다시 통과시키는 범위로 고정했다.

## 수정 대상 파일
- `src/lib/dart/disclosureMonitor.ts`
- `src/components/DartDisclosureMonitorClient.tsx`
- `tests/dart-disclosure-monitor-helpers.test.ts`
- `tests/e2e/dart-flow.spec.ts`

## 변경 이유
- priority 카드가 상태만 보여주면 사용자는 어떤 공시가 보일지 모르고 클릭해야 한다.
- 아직 조회하지 않은 기업은 안전한 안내가 필요하고, 이미 조회한 기업은 최근 공시 제목 1줄만 있어도 정보량이 크게 올라간다.
- 이 기능은 기존 API나 저장 구조를 바꾸지 않고 helper와 UI 보강만으로 안전하게 넣을 수 있다.

## 변경 내용
- disclosure monitor helper에 priority 카드용 `previewText` 계산을 추가했다.
- `pending`은 신규 공시 제목과 날짜를 우선 보여주고, `unchecked`는 `최근 공시를 아직 불러오지 않았습니다.`, `checked`는 최근 공시 제목 또는 안전한 fallback 문구를 보여주도록 했다.
- priority 카드 UI는 상태 설명 아래에 preview 한 줄을 추가했다.
- helper unit test와 DART E2E는 preview 문구까지 검증하도록 확장했다.

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
