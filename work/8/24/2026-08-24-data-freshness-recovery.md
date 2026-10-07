# 데이터 최신성·부분 실패 복구 보완

## 작업 전 정리

- 수정 대상: Planning 가정치 health/보충 수집, DART corpCodes 상태·검색·설정 화면, 대시보드 보조 데이터 로딩과 관련 테스트·화면 카탈로그.
- 변경 이유: 경제 기준일과 수집 시각 혼용, ECOS 일부 성공 시 CPI·예금금리 누락, 손상된 DART 파일의 정상 표시, 보조 API 무응답 시 대시보드 무한 대기를 해소한다.
- 계획 검증: focused Vitest, 변경 파일 ESLint, TypeScript, current-screens guard. 전체 lint/test/build/e2e는 마지막 통합 라운드에서 단일 실행한다.

## 무엇이 바뀌었는지

- 가정치 stale 판정을 실제 기준일 `asOf`로 수행하고, 수집 시각 `fetchedAt` 누락을 데이터 누락으로 오인하지 않게 했다.
- snapshot 원천 경고와 CPI·현금수익률 누락을 사용자 해석 경고로 승격하고, ECOS 일부 성공 뒤에도 독립 HTML 보충값을 병합한다.
- DART corpCodes의 파일 존재(`exists`)와 파싱 가능(`usable`)을 분리해 손상 인덱스를 status/search 모두 동일한 409 제한 상태로 표시한다.
- 대시보드 보조 요청에 8초 제한과 unmount 중단을 적용하고, 부분 성공 데이터와 저장된 플랜은 계속 사용할 수 있게 했다.
- DART 상태 카드·데이터 소스 영향 요약이 누락, 오래됨, 최신성 미확인, 파일 읽기 실패를 서로 다른 안내로 보여준다.

## 검증 방법 및 결과

- `corepack pnpm exec vitest run tests/dashboard-view-model.test.tsx tests/dart-corpcodes-search.test.ts tests/data-source-impact-health.test.ts tests/planning-assumptions tests/planning-v2/assumptionsHealth.test.ts`
  - 13개 파일, 72개 테스트 PASS.
- `corepack pnpm exec tsc --noEmit --incremental false`
  - PASS.
- `corepack pnpm planning:current-screens:guard`
  - 5개 파일, 11개 테스트 PASS.
- 변경 파일 대상 `corepack pnpm exec eslint ...`
  - PASS.
- 변경 파일 대상 `git diff --check -- ...`
  - PASS.

## 남은 리스크와 엣지케이스

- ECOS 성공 시에도 HTML 보충 요청이 추가되어 assumptions 동기화 시간이 늘 수 있고, 상류 HTML 구조 변경은 snapshot warning으로 남는다.
- 실제 느린 외부 API 환경에서 대시보드 8초 제한의 체감과 브라우저 부분 실패 화면은 최종 e2e/production smoke에서 확인해야 한다.
- 손상 인덱스는 안전하게 제한되지만 복구 자체는 기존 개발 환경 인덱스 생성 흐름에 의존한다.

## 사용 skill

- `finance-skill-routing`: 이번 batch의 최소 skill 조합 선택.
- `planning-gate-selector`: 데이터/UI 변경에 필요한 focused 및 최종 검증 세트 선택.
- `dart-data-source-hardening`: 최신성, 외부 소스 부분 실패, fallback, 사용자 안내 계약 점검.
- `route-ssot-check`: 공개 DART API 상태 계약과 `docs/current-screens.md` 정합성 확인.
- `work-log-closeout`: 변경 파일·검증·잔여 위험을 이 문서 형식으로 기록.
