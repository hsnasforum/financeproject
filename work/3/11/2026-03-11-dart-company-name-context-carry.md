# 2026-03-11 DART 회사명 컨텍스트 전달과 즉시 복원

## 내부 회의 요약
- 직전 라운드의 남은 리스크는 `search -> company -> monitor` 이동 중 회사명이 hydration 전에 URL에 실리지 않으면 첫 표시가 `corpCode` 위주로 보일 수 있다는 점이었다.
- 추가 기능 후보는 여러 가지였지만, 가장 작은 범위에서 사용자 가치가 큰 것은 회사명 컨텍스트를 URL과 복구 경로에 함께 실어 `검색 결과`, `최근 조회`, `즐겨찾기`, `모니터 deep link` 모두 같은 품질로 맞추는 것이었다.
- 이번 라운드는 그 경로만 닫고, 관련 게이트를 다시 통과시키는 것으로 범위를 고정했다.

## 수정 대상 파일
- `src/lib/dart/query.ts`
- `src/components/DartSearchClient.tsx`
- `src/components/DartCompanyPageClient.tsx`
- `tests/dart-query-helpers.test.ts`
- `tests/e2e/dart-flow.spec.ts`

## 변경 이유
- 검색 결과에서 회사 상세로 갈 때 회사명은 화면에 보이지만 URL 계약에는 포함되지 않아, dev 복구나 빠른 이동에서 이름 컨텍스트가 사라질 여지가 있었다.
- 회사 상세의 최근 조회/즐겨찾기 링크도 `corpCode` 위주라, 다시 진입할 때 이름을 즉시 보여주기 어렵다.
- 이 리스크는 기능 실패로는 이어지지 않았지만, 표시 품질과 컨텍스트 일관성 측면에서 닫는 편이 맞다.

## 변경 내용
- `normalizeDartCorpName()`과 `buildDartCompanyHref(..., corpName?)`를 추가해 회사명도 안전하게 URL에 포함하도록 정리했다.
- DART 검색 결과 링크와 pending company href 복구 경로는 `corpName`까지 유지하도록 바꿨다.
- 회사 상세는 `corpName` query를 monitor deep link와 링크 복구 컨텍스트에 사용하고, 회사 API가 내려온 뒤에는 canonical 이름으로 최근 조회와 즐겨찾기를 다시 맞추도록 보강했다.
- 회사 상세의 즐겨찾기/최근 조회 링크도 안전한 helper를 사용해 회사명 컨텍스트를 함께 전달한다.
- 모니터 deep link는 URL에 실린 이름을 참고하되, 가능하면 회사 API를 한 번 더 조회해 canonical 회사명을 즐겨찾기에 저장하도록 바꿨다.
- E2E는 회사 상세 진입 URL에 `corpName=`이 실제로 포함되는지까지 확인하도록 보강했다.

## 실행한 검증
- `pnpm exec eslint src/lib/dart/query.ts src/components/DartSearchClient.tsx src/components/DartCompanyPageClient.tsx tests/dart-query-helpers.test.ts tests/e2e/dart-flow.spec.ts`
- `pnpm test tests/dart-query-helpers.test.ts tests/dart-store.test.ts tests/dart-search-client.test.tsx tests/dart-disclosure-monitor-helpers.test.ts`
- `pnpm e2e:pw tests/e2e/dart-flow.spec.ts --workers=1`
- `pnpm lint`
- `pnpm test`
- `pnpm build`
- `pnpm e2e:rc`

## 검증 결과
- 대상 eslint PASS
- 대상 unit test PASS
- `tests/e2e/dart-flow.spec.ts` PASS
- `pnpm lint` PASS
- `pnpm test` PASS `612 files / 1738 tests`
- `pnpm build` PASS
- `pnpm e2e:rc` PASS `9 passed`

## 남은 리스크
- 이번 라운드 범위에서 재현된 미해결 리스크는 없다.

## 다음 작업
- 이 메모는 `/work` 구조 정렬 배치에서 `다음 작업` 섹션만 보강했습니다.
- 실제 후속 우선순위는 더 최신 closeout 기준으로 다시 판단합니다.

## 사용 skill
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 사용 skill 상세는 기존 본문 기준으로 확인합니다.
