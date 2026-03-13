# 2026-03-11 data-sources impact recent ping readonly

## 변경 이유
- 소스 카드에는 `최근 연결 확인`이 남지만, 사용자 도움 카드에서는 여전히 정적 설명만 보여 어떤 도움 축이 최근 실제 호출로 확인됐는지 바로 이어서 보기 어려웠음.
- 같은 페이지 안에서 source 카드의 `연결 테스트` 결과가 impact 카드까지 즉시 반영되지 않아 운영 흐름이 끊겼음.

## 이번 라운드 내부 안건
1. `사용자 도움 연결` 카드에 read-only 최근 확인값을 붙여 source 카드와 impact 카드를 한 흐름으로 묶기
2. 같은 탭에서 ping 결과가 즉시 반영되도록 storage 이벤트 외에 custom event를 같이 사용
3. settings 전용 E2E로 새 흐름을 직접 고정

## 적용 내용
- `src/lib/dataSources/impactPing.ts`
  - impact 카드별 ping 가능 소스와 최근 확인 요약 계산 helper 추가
- `src/components/DataSourceImpactCardsClient.tsx`
  - 사용자 도움 카드 client 렌더링으로 전환
  - `최근 연결 확인` read-only 블록 추가
- `src/components/DataSourceStatusCard.tsx`
  - ping 저장 후 custom event dispatch 추가
  - source 카드 test id 추가
- `src/lib/dataSources/pingState.ts`
  - custom event 상수 추가
- `src/app/settings/data-sources/page.tsx`
  - impact 카드 렌더를 client 컴포넌트로 교체
- `tests/data-source-impact-ping.test.ts`
  - impact recent ping helper 회귀 테스트 추가
- `tests/e2e/data-sources-settings.spec.ts`
  - settings 화면에서 source ping -> impact 반영 흐름 E2E 추가

## 검증
- `pnpm exec eslint src/app/settings/data-sources/page.tsx src/components/DataSourceImpactCardsClient.tsx src/components/DataSourceStatusCard.tsx src/lib/dataSources/impactPing.ts src/lib/dataSources/pingState.ts tests/data-source-impact-ping.test.ts tests/e2e/data-sources-settings.spec.ts`
  - PASS
- `pnpm test tests/data-source-ping-state.test.ts tests/data-source-user-impact.test.ts tests/data-source-impact-ping.test.ts`
  - PASS (`3 passed files / 15 tests`)
- `pnpm e2e:pw tests/e2e/data-sources-settings.spec.ts --workers=1`
  - PASS (`1 passed`)
- `pnpm lint`
  - PASS
- `pnpm build`
  - PASS
- `pnpm e2e:rc`
  - PASS (`9 passed`)

## 다음 작업
- 이 메모는 `/work` 구조 정렬 배치에서 `다음 작업` 섹션만 보강했습니다.
- 실제 후속 우선순위는 더 최신 closeout 기준으로 다시 판단합니다.

## 변경 파일
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 변경 파일 상세는 기존 본문 기준으로 확인합니다.

## 사용 skill
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 사용 skill 상세는 기존 본문 기준으로 확인합니다.

## 남은 리스크
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 실제 잔여 리스크는 더 최신 closeout 기준으로 다시 판단합니다.
