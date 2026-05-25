# 2026-05-26 PR24 E2E webserver fix

## 변경 파일
- `playwright.config.ts`
- `work/5/26/2026-05-26-pr24-e2e-webserver-fix.md`

## 사용 skill
- `planning-gate-selector`: Playwright 전역 설정 변경에 맞는 검증 범위를 정하기 위해 사용했습니다.
- `gh-fix-ci`: PR #24 GitHub Actions 실패 로그를 확인하고 CI 실패 원인을 분리하기 위해 사용했습니다.
- `work-log-closeout`: 실제 변경, 실행한 검증, 남은 리스크를 `/work` 형식으로 남기기 위해 사용했습니다.

## 변경 이유
- PR #24의 E2E Smoke Actions가 `BASE_URL=http://127.0.0.1:3100`을 설정한 상태에서 Playwright `webServer`를 생략해 로컬 서버가 뜨지 않았습니다.
- 실패 로그의 공통 증상은 `connect ECONNREFUSED 127.0.0.1:3100`였고, 페이지 단위 assertion 실패가 아니라 테스트 서버 기동 조건 문제였습니다.
- 로컬/CI에서 쓰는 `BASE_URL`은 기준 URL 지정 용도이고, 서버 생략은 별도 외부 서버 URL인 `E2E_EXTERNAL_BASE_URL`에서만 일어나야 합니다.

## 핵심 변경
- `BASE_URL`, `E2E_BASE_URL`, `PLANNING_BASE_URL`에 로컬 URL이 들어와도 Playwright `webServer`를 계속 띄우도록 조건을 `E2E_EXTERNAL_BASE_URL` 기준으로 좁혔습니다.
- `PORT`가 명시되지 않은 경우 설정된 base URL의 포트를 읽어 `next_dev_safe` 서버 포트로 사용하게 했습니다.
- 외부에서 이미 떠 있는 서버를 대상으로 테스트해야 하는 경우는 기존처럼 `E2E_EXTERNAL_BASE_URL`로 `webServer`를 생략합니다.
- PR #24의 `dart_index_present`, `dart_index_missing`, 기본 RC E2E 조건을 로컬에서 재현 검증했습니다.

## 검증
- `BASE_URL=http://127.0.0.1:3100 DART_CORPCODES_INDEX_PATH=tests/fixtures/dart/corpCodes.index.sample.json DART_E2E_FIXTURE=1 corepack pnpm e2e -- tests/e2e/dart-flow.spec.ts` PASS: 3 passed
- `BASE_URL=http://127.0.0.1:3100 DART_CORPCODES_INDEX_PATH=tmp/dart/e2e-ci-check-corpCodes.index.json DART_E2E_FIXTURE=1 DART_E2E_BUILD_STUB=1 DART_E2E_EXPECT_MISSING=1 corepack pnpm e2e -- tests/e2e/dart-missing-index.spec.ts tests/e2e/dart-build-index.spec.ts` PASS: 2 passed
- `corepack pnpm lint` PASS
- `git diff --check` PASS
- `corepack pnpm e2e:rc` PASS: 24 passed, 1 skipped

## 남은 리스크
- 원격 Actions 재실행 결과는 아직 확인 전입니다. 커밋과 push 이후 PR #24의 새 head SHA 기준 CI/E2E 결과를 다시 확인해야 합니다.
- 이 변경은 Playwright 실행 설정에 한정되며 앱 런타임 로직은 바꾸지 않았습니다.
- 문서나 사용자 경로는 바뀌지 않았으므로 `docs/current-screens.md` 갱신은 필요하지 않은 것으로 판단했습니다.

## 다음 라운드 우선순위
- 현재 변경을 커밋하고 `pr37-planning-v3-txn-overrides` 원격 브랜치에 push합니다.
- PR #24의 새 head SHA 기준 GitHub Actions CI와 E2E Smoke를 확인합니다.
- 원격 CI가 다시 실패하면 새 로그에서 앱 assertion 실패와 환경 설정 실패를 분리해 후속 수정합니다.
