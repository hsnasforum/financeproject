# 2026-03-11 dart monitor summary and filter guard

## 수정 대상 파일
- `src/components/DartDisclosureMonitorClient.tsx`
- `src/lib/dart/disclosureMonitor.ts`
- `tests/dart-disclosure-monitor-helpers.test.ts`

## 변경 이유
- DART 공시 모니터 탭은 조회 조건을 잘못 넣어도 왜 버튼이 막히는지, 현재 어떤 기준으로 보고 있는지 한눈에 알기 어려웠다.
- 워치리스트를 여러 개 두었을 때 신규 공시와 아직 미조회 기업 수를 별도로 보기가 어려워 재탐색 효율이 떨어졌다.

## 무엇이 바뀌었는지
- 공시 모니터 탭에 요약 카드 4종(모니터링 기업, 신규 공시, 확인 전 기업, 아직 미조회)을 추가했다.
- 현재 조회 기준을 칩 형태로 노출하고, 오늘/최근 7일/최근 30일/기간 초기화 프리셋을 추가했다.
- 날짜 입력은 draft 상태로 분리해 잘못된 값이 즉시 저장되지 않게 했고, 형식 또는 기간이 잘못되면 쉬운 한국어 안내와 함께 조회 버튼을 비활성화했다.
- 관련 계산은 `src/lib/dart/disclosureMonitor.ts` helper로 분리하고 테스트를 추가했다.

## 검증 명령
- `pnpm exec eslint src/components/DartDisclosureMonitorClient.tsx src/lib/dart/disclosureMonitor.ts tests/dart-disclosure-monitor-helpers.test.ts`
- `pnpm test tests/dart-disclosure-monitor-helpers.test.ts tests/dart-search-client.test.tsx`
- `pnpm build`
- `pnpm e2e:rc`

## 결과
- 대상 eslint PASS
- unit test PASS
- `pnpm build` PASS
- `pnpm e2e:rc` PASS (`8 passed`)

## 남은 리스크
- 현재 이번 변경 범위에서 재현된 미해결 리스크는 없다.
- [가정] 공시 모니터 카드 자체를 직접 검증하는 E2E는 아직 없으므로, 이후 monitor 탭 전용 시나리오가 필요해지면 별도 추가한다.

## 다음 작업
- 이 메모는 `/work` 구조 정렬 배치에서 `다음 작업` 섹션만 보강했습니다.
- 실제 후속 우선순위는 더 최신 closeout 기준으로 다시 판단합니다.

## 사용 skill
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 사용 skill 상세는 기존 본문 기준으로 확인합니다.
