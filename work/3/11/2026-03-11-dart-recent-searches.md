# 2026-03-11 dart recent searches

## 수정 대상 파일
- `src/lib/dart/query.ts`
- `src/lib/dart/dartStore.ts`
- `src/components/DartSearchClient.tsx`
- `tests/dart-query-helpers.test.ts`
- `tests/dart-store.test.ts`
- `tests/dart-search-client.test.tsx`
- `tests/e2e/dart-flow.spec.ts`
- `docs/opendart-setup.md`

## 변경 이유
- `/public/dart`는 최근 조회 기업은 남기지만, 사용자가 방금 검색했던 회사명 자체를 다시 실행하는 빠른 경로는 없었다.
- 검색 성공 후 회사 상세를 보고 돌아왔을 때 다시 입력해야 하는 마찰이 있어, 작은 로컬 기능으로 재탐색 UX를 보강할 필요가 있었다.

## 무엇이 바뀌었는지
- DART 검색어 정규화 helper를 공통 함수로 분리했다.
- 최근 성공 검색어를 로컬 저장소에 최대 8개까지 저장하는 store를 추가했다.
- `/public/dart` 검색 카드 아래에 최근 검색어 칩과 비우기 액션을 추가했다.
- 최근 검색어 칩을 누르면 입력값을 복원하고 즉시 다시 검색하도록 연결했다.
- OpenDART setup 문서에 새 동작을 반영했다.

## 검증 명령
- `pnpm test tests/dart-query-helpers.test.ts tests/dart-store.test.ts tests/dart-search-client.test.tsx`
- `pnpm exec eslint src/lib/dart/query.ts src/lib/dart/dartStore.ts src/components/DartSearchClient.tsx tests/dart-query-helpers.test.ts tests/dart-store.test.ts tests/dart-search-client.test.tsx tests/e2e/dart-flow.spec.ts`
- `pnpm build`
- `pnpm e2e:pw tests/e2e/dart-flow.spec.ts --workers=1` [환경 제약으로 미완료]
- `E2E_EXTERNAL_BASE_URL=http://127.0.0.1:3100 node scripts/playwright_with_webserver_debug.mjs test tests/e2e/dart-flow.spec.ts --workers=1` [환경 제약으로 미완료]

## 결과
- 대상 unit/static test PASS
- 대상 eslint PASS
- `pnpm build` PASS
- 첫 build 시도는 기존 stray `next build --webpack` 락 때문에 실패했고, 프로세스 정리 후 재실행에서 PASS했다.
- Playwright E2E는 코드 오류가 아니라 이 세션의 포트 바인드 `EPERM`과 Chromium sandbox 종료 오류로 완료하지 못했다.

## 남은 리스크
- 최근 검색어는 브라우저 로컬 저장소 기준이라 기기/브라우저가 바뀌면 공유되지 않는다.
- 현재는 성공한 검색어만 저장하며, 빈 결과 검색어까지 남기지는 않는다.
- [미확인] Playwright E2E는 환경 제약 때문에 이번 라운드에서 끝까지 확인하지 못했다.

## 다음 작업
- 이 메모는 `/work` 구조 정렬 배치에서 `다음 작업` 섹션만 보강했습니다.
- 실제 후속 우선순위는 더 최신 closeout 기준으로 다시 판단합니다.

## 사용 skill
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 사용 skill 상세는 기존 본문 기준으로 확인합니다.
