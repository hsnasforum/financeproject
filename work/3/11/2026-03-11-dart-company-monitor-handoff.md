# 2026-03-11 dart company monitor handoff

## 수정 대상 파일
- `src/lib/dart/query.ts`
- `src/components/DartSearchClient.tsx`
- `src/components/DartCompanyPageClient.tsx`
- `tests/dart-query-helpers.test.ts`
- `tests/e2e/dart-flow.spec.ts`

## 변경 이유
- DART 상세에서 회사를 즐겨찾기에 넣은 뒤 공시 모니터링 탭으로 다시 이동하려면 사용자가 직접 탭을 한 번 더 찾아야 했다.
- 검색 결과 복원은 이미 있었지만, 상세에서 모니터 탭으로 넘기는 직접 경로와 해당 E2E 고정이 부족했다.

## 무엇이 바뀌었는지
- `buildDartSearchHref()`가 `tab=monitor`를 안전하게 만들 수 있게 확장됐다.
- `/public/dart`는 URL의 `tab=monitor`를 읽어 모니터 탭으로 바로 열린다.
- 회사 상세는 `모니터링에 추가하고 보기` 또는 `공시 모니터링으로 보기` 버튼으로 즐겨찾기 추가와 탭 이동을 바로 처리한다.
- `dart-flow` E2E는 검색 결과 복원 뒤 모니터 탭 이동까지 확인하도록 확장했다.

## 검증 명령
- `pnpm exec eslint src/lib/dart/query.ts src/components/DartSearchClient.tsx src/components/DartCompanyPageClient.tsx tests/dart-query-helpers.test.ts tests/e2e/dart-flow.spec.ts`
- `pnpm test tests/dart-query-helpers.test.ts tests/dart-search-client.test.tsx`
- `pnpm build`
- `pnpm e2e:rc`

## 결과
- 이번 라운드 검증 결과는 메인 답변에 기록한다.

## 남은 리스크
- 현재 목표는 DART 검색 -> 상세 -> 모니터 handoff 경로를 줄이는 것이며, 기기 간 즐겨찾기 동기화는 여전히 브라우저 로컬 저장소 범위다.

## 다음 작업
- 이 메모는 `/work` 구조 정렬 배치에서 `다음 작업` 섹션만 보강했습니다.
- 실제 후속 우선순위는 더 최신 closeout 기준으로 다시 판단합니다.

## 사용 skill
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 사용 skill 상세는 기존 본문 기준으로 확인합니다.
