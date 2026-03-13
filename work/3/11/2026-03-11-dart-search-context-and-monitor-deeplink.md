# 2026-03-11 DART 검색 컨텍스트와 모니터 deep link 마감

## 수정 대상 파일
- `src/app/public/dart/page.tsx`
- `src/components/DartCompanyPageClient.tsx`
- `src/components/DartDisclosureMonitorClient.tsx`
- `src/components/DartSearchClient.tsx`
- `src/lib/dart/dartStore.ts`
- `src/lib/dart/query.ts`
- `tests/dart-query-helpers.test.ts`
- `tests/e2e/dart-flow.spec.ts`

## 변경 이유
- DART 검색 결과에서 회사 상세로 갔다가 다시 검색 결과로 돌아오는 흐름은 복구됐지만, 회사 상세에서 모니터 탭으로 이동할 때 hydration 타이밍에 따라 즐겨찾기 저장과 pending href 정리가 빠져 E2E가 깨졌다.
- `/public/dart`는 `useSearchParams()`를 쓰는 client 컴포넌트를 suspense 없이 바로 렌더하고 있어서 production build에서 prerender error가 났다.
- 모니터 탭은 같은 탭에서 즐겨찾기가 바뀌어도 자동 갱신되지 않아, deep link로 추가한 회사가 즉시 보이지 않았다.

## 변경 내용
- 회사 상세의 모니터 액션을 버튼 기반 JS 이동에서 링크 기반 deep link로 바꾸고, 이동 전 pending href를 지우도록 정리했다.
- `buildDartMonitorHref()`를 추가해 `tab=monitor`, `corpCode`, `corpName`을 안전하게 싣는 URL을 만들었다.
- DART 검색 화면은 monitor deep link를 받으면 해당 회사를 즐겨찾기에 추가하고, pending company href를 정리한 뒤 URL을 `/public/dart?tab=monitor`로 정리한다.
- 검색 화면의 pending company href 복구는 `tab=monitor`나 `q`가 있는 명시적 진입을 가로채지 않도록 줄였다.
- 즐겨찾기 저장 시 같은 탭에서도 즉시 갱신되도록 `dart:favorites-updated` 이벤트를 추가했고, 검색/모니터 화면이 이 이벤트를 구독하게 했다.
- `/public/dart` 페이지는 `Suspense` fallback으로 감싸 build의 `missing suspense with csr bailout`를 해결했다.
- E2E는 `검색 -> 회사 상세 -> 검색 결과 복귀 -> 모니터 탭 이동`과 `모니터 빈 상태 탈출`까지 확인하도록 고정했다.

## 실행한 검증
- `pnpm exec eslint src/lib/dart/dartStore.ts src/components/DartDisclosureMonitorClient.tsx src/components/DartSearchClient.tsx src/components/DartCompanyPageClient.tsx src/lib/dart/query.ts tests/dart-query-helpers.test.ts tests/e2e/dart-flow.spec.ts`
- `pnpm exec eslint src/app/public/dart/page.tsx`
- `pnpm test tests/dart-query-helpers.test.ts tests/dart-store.test.ts tests/dart-search-client.test.tsx tests/dart-disclosure-monitor-helpers.test.ts`
- `pnpm e2e:pw tests/e2e/dart-flow.spec.ts --workers=1`
- `pnpm lint`
- `pnpm test`
- `pnpm build`
- `pnpm e2e:rc`

## 검증 결과
- eslint PASS
- 대상 unit test PASS
- `tests/e2e/dart-flow.spec.ts` PASS
- `pnpm lint` PASS
- `pnpm test` PASS `612 files / 1738 tests`
- `pnpm build` PASS
- `pnpm e2e:rc` PASS `9 passed`

## 남은 리스크
- monitor deep link에서 회사명이 hydration 전 URL에 실리지 않으면 첫 렌더 watchlist에는 `corpCode`만 먼저 보일 수 있다.
- 현재 기준으로 기능 실패나 build 실패로 이어지는 남은 재현 축은 없다.

## 다음 작업
- 이 메모는 `/work` 구조 정렬 배치에서 `다음 작업` 섹션만 보강했습니다.
- 실제 후속 우선순위는 더 최신 closeout 기준으로 다시 판단합니다.

## 사용 skill
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 사용 skill 상세는 기존 본문 기준으로 확인합니다.
