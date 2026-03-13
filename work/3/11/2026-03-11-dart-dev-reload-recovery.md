# 2026-03-11 DART dev reload 복구 및 prod 병렬 재검증

## 변경 이유
- `pnpm e2e:parallel:classify -- --runs=5 --mode=development --skip-build --dev-port-base=3136` 기준으로 `dart-flow`가 `1/5 PASS`만 남고 반복 실패했다.
- 실패 공통점은 `/public/dart`에서 검색 API가 한 번 성공한 뒤 dev full reload가 늦게 섞이면서 검색 결과가 다시 비어 `dart-search-item`을 찾지 못하는 흐름이었다.
- 기존 `pending company href` 복구만으로는 검색 성공 뒤 늦게 도착하는 reload를 모두 흡수하지 못했다.

## 이번 변경
1. `src/components/DartSearchClient.tsx` 에 `pending search query` sessionStorage 키를 추가했다.
2. 검색 시작 시 dev 환경에서는 현재 query를 저장해 in-flight 검색 중 reload가 와도 복구할 수 있게 했다.
3. `/public/dart` 재진입 뒤 fresh pending query가 있으면 1회 자동 재검색하도록 복구했다.
4. pending query가 없어도 dev full reload 뒤 기본 검색어(`q`)로 1회 자동 재검색하도록 fallback을 보강했다.
5. 기존 `pending company href` 복구는 그대로 유지해 상세 페이지 이동 의도가 있으면 검색 복구보다 우선 처리되게 했다.

## 검증
1. `pnpm exec eslint src/components/DartSearchClient.tsx`
2. `pnpm e2e:pw tests/e2e/dart-flow.spec.ts --workers=1`
3. `pnpm e2e:parallel:classify -- --runs=3 --mode=development --skip-build --dev-port-base=3156`
4. `pnpm e2e:pw tests/e2e/flow-history-to-report.spec.ts --workers=1`
5. `pnpm e2e:parallel:report-flake:prod`

## 검증 결과
- `eslint` PASS
- `dart-flow` 단독 PASS
- `flow-history-to-report` 단독 PASS
- `pnpm e2e:parallel:report-flake:prod` PASS (`4 passed`)
- dev classify는 `2/3 PASS`
- 남은 실패는 `tests/e2e/flow-history-to-report.spec.ts` 의 `page.goto("/planning/reports") -> net::ERR_ABORTED` 1건이었다.
- 같은 dev classify PASS 로그 안에서도 `/planning/reports 500`, `Fast Refresh had to perform a full reload`, `__webpack_modules__[moduleId] is not a function` 흔적은 계속 남았다.
- 이번 수정 뒤 dev classify에서는 `dart-flow` 실패가 다시 나오지 않았다.

## 남은 리스크
- dev shared webpack runtime 노이즈는 여전히 남아 있고, 현재 대표 증상은 `/planning/reports` 진입 중 `ERR_ABORTED`다.
- 이번 라운드는 DART 검색 복구 축을 닫았지만, reports abort까지 deterministic하게 닫았다고 보긴 어렵다.

## 다음 라운드 우선순위
1. `pnpm e2e:parallel:classify -- --runs=5 --mode=development --skip-build --dev-port-base=3166` 로 reports abort 재현률을 다시 측정
2. `/planning/reports` 진입 직전/직후의 dev runtime 오류와 `ERR_ABORTED` 시점을 같은 로그 기준으로 다시 묶기
3. 필요하면 reports 첫 진입 fan-out 또는 dev-only prewarm 지점을 더 줄일지 검토

## 변경 파일
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 변경 파일 상세는 기존 본문 기준으로 확인합니다.

## 사용 skill
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 사용 skill 상세는 기존 본문 기준으로 확인합니다.
