# 2026-03-11 dart/reports UX and security hardening

## 수정 대상 파일
- `src/components/DartSearchClient.tsx`
- `src/components/PlanningReportsDashboardClient.tsx`
- `src/app/api/public/disclosure/company/route.ts`
- `tests/dart-company-route.test.ts`
- `tests/dart-search-client.test.tsx`

## 변경 이유
- DART 검색 첫 화면에서 아직 검색하지 않았는데도 결과 영역이 비어 보이거나, 빈 결과와 초기 상태가 같은 톤으로 보여 UX 구분이 약했습니다.
- reports 대시보드는 선택된 run id가 현재 목록과 어긋나면 대시보드가 통째로 비는 분기가 남아 있었습니다.
- OpenDART 회사 상세 route는 `corpCode`가 비어 있는지만 확인하고 형식 검증은 하지 않아, 잘못된 입력이 바로 upstream까지 전달될 수 있었습니다.

## 이번 변경
1. DART 검색은 초기 안내 상태와 빈 결과 상태를 분리해, 첫 진입에서는 검색 유도 문구를 보여주고 검색 후에만 빈 결과 안내를 보여주도록 조정했습니다.
2. reports 대시보드는 선택된 run이 현재 목록에서 사라졌을 때 첫 run으로 자동 복구하고, 그 짧은 구간에는 경고 inset을 보여 빈 화면을 막았습니다.
3. 회사 상세 API는 `corpCode`를 8자리 숫자로 검증하고, 잘못된 형식이면 400으로 즉시 차단하도록 보강했습니다.
4. DART 초기 상태와 회사 상세 route 입력 검증에 대한 단위 테스트를 추가했습니다.

## 검증
- `pnpm exec eslint src/components/DartSearchClient.tsx src/components/PlanningReportsDashboardClient.tsx src/app/api/public/disclosure/company/route.ts tests/dart-company-route.test.ts tests/dart-search-client.test.tsx`
- `pnpm test tests/dart-company-route.test.ts tests/dart-search-client.test.tsx tests/dart-corpcodes-search.test.ts`
- `pnpm build`

## [blocked] E2E
- `pnpm e2e:pw tests/e2e/dart-flow.spec.ts tests/e2e/flow-history-to-report.spec.ts --workers=1`
- `E2E_BASE_URL=http://127.0.0.1:3100 pnpm exec playwright test tests/e2e/dart-flow.spec.ts tests/e2e/flow-history-to-report.spec.ts --workers=1 --reporter=line`
- 두 경로 모두 코드 회귀가 아니라 Playwright Chromium launch 단계에서 `sandbox_host_linux.cc:41` / `shutdown: Operation not permitted`로 실패했습니다.

## 남은 리스크와 엣지케이스
- dev/runtime 로그에 남던 `/public/dart 500`, `/planning/reports 500`, webpack runtime noise는 이번 라운드에서 직접 수정하지 않았습니다.
- DART 검색은 이제 수동 검색 흐름이 기본이라, 과거처럼 기본 검색어를 자동 실행하던 동작에 기대는 사용자 스크립트가 있었다면 영향이 있을 수 있습니다.
- Playwright 브라우저 launch blocker가 풀리면 `dart-flow`와 `flow-history-to-report` E2E를 다시 확인해야 합니다.

## 다음 작업
- 이 메모는 `/work` 구조 정렬 배치에서 `다음 작업` 섹션만 보강했습니다.
- 실제 후속 우선순위는 더 최신 closeout 기준으로 다시 판단합니다.

## 사용 skill
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 사용 skill 상세는 기존 본문 기준으로 확인합니다.

## 남은 리스크
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 실제 잔여 리스크는 더 최신 closeout 기준으로 다시 판단합니다.
