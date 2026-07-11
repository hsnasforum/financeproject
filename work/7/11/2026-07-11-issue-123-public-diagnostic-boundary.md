# 2026-07-11 Issue #123 public API error와 ops diagnostic 분리

- Issue: https://github.com/hsnasforum/financeproject/issues/123
- 후속 Issue: https://github.com/hsnasforum/financeproject/issues/220
- 기준 브랜치: `codex/123-dart-public-diagnostic-boundary`
- 기준 main: `1a3d4bb4dd16b6eb59d08da85c7c1c49d67e0f00`

## 변경 파일

- `src/lib/publicApis/dart/missingIndex.ts`
- `src/app/api/public/disclosure/corpcodes/search/route.ts`
- `src/app/api/public/disclosure/corpcodes/status/route.ts`
- `src/components/InvestCompaniesClient.tsx`
- `tests/dart-corpcodes-search.test.ts`
- `tests/e2e/dart-missing-index.spec.ts`
- `tests/e2e/helpers/e2eTest.ts`
- `docs/opendart-setup.md`
- `work/7/11/2026-07-11-issue-123-public-diagnostic-boundary.md`

## 사용 skill

- `planning-gate-selector`: route/UI 변경에 필요한 최소·전체 검증 세트 선택
- `dart-data-source-hardening`: DART 누락 데이터, fallback, 사용자 안내, 운영 문서 경계 점검
- `playwright`: 누락 인덱스 dev/production 사용자 흐름과 public UI 비노출 확인
- `work-log-closeout`: 변경, 검증, 잔여 위험, 다음 라운드 기록

## 변경 이유

- benefits/recommend 경로는 이미 사용자 message와 운영 진단을 분리하고 있었습니다.
- 현재 코드 재점검에서 DART corpCodes 누락 응답의 `message`와 `/invest/companies` 화면이 내부 스크립트 명령을 노출하는 실제 미충족 경로로 확인됐습니다.
- 기존 URL, 상태 코드, error code, 응답 키/타입을 유지하면서 기본 사용자 응답과 명시적 debug 진단만 분리했습니다.

## 핵심 변경

1. `CORPCODES_INDEX_MISSING` 기본 `message`를 쉬운 한국어 사용자 안내로 교체했습니다.
2. `hintCommand`와 `hintCommandWithPath` 키 및 string 타입은 유지하고 기본값을 빈 문자열로 바꿨습니다. 기존 명령 값은 `debug=1` 요청에서만 반환합니다.
3. search/status route가 같은 payload builder 옵션을 사용하도록 맞췄고 status route는 App Router 계약에 맞춰 `GET(request: Request)`를 사용합니다.
4. `/invest/companies`의 상시 노출 개발용 수동 복구 명령을 제거하고 상태 확인·자동 생성 흐름은 유지했습니다.
5. 단위 테스트가 기본/명시적 debug 값을 정확히 고정하고, dev/production E2E가 `/public/dart`와 `/invest/companies`에서 운영 명령 비노출을 확인합니다.
6. `/invest/companies`를 상호작용 E2E 경로로 등록해 dev HMR WebSocket 대체가 hydration을 막지 않도록 했습니다.
7. OpenDART 운영 문서에 기본 응답, debug 진단, public UI 경계를 반영했습니다.

## public 계약 영향

- URL/HTTP method: 변경 없음
- 누락 상태 HTTP status: `409` 유지
- error code: `CORPCODES_INDEX_MISSING` 유지
- 응답 키/타입: 변경 없음
- 응답 값: 기본 `message`가 사용자 안내로 바뀌고, 기본 `hintCommand*` 값은 빈 문자열로 바뀜
- 명시적 진단: `debug=1`에서 기존 `hintCommand*` 명령 문자열 유지
- DB schema/Prisma query semantics: 변경 없음
- cache/revalidation/fetch cache 동작: 변경 없음
- DART 인덱스 생성, invalidation, 상태 확인 동작: 변경 없음

## 검증

- `corepack pnpm vitest run tests/dart-corpcodes-search.test.ts tests/public-api-diagnostics.test.ts tests/recommend-api.test.ts`: PASS, 3 files / 14 tests
- 관련 파일 ESLint: PASS
- `corepack pnpm lint`: PASS
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm test`: 최종 PASS, 804 files / 2,709 tests
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm build`: PASS, TypeScript 및 250 pages 생성
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm e2e:rc:dart`: PASS, 3 tests
- 강제 누락 dev E2E: PASS, 2 tests
- `PLANNING_SINGLE_USER_MODE=true` 강제 누락 production E2E: PASS, 2 tests
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm e2e:rc`: PASS, 26 passed / 1 skipped
- `corepack pnpm planning:v2:complete`: PASS, fast E2E 8 tests 포함
- `corepack pnpm planning:v2:compat --keep-sandbox`: PASS, sandbox `/tmp/planning-v2-compat-uY6Dq7`
- `corepack pnpm planning:v2:regress`: PASS, 9 regression cases 및 full E2E 10 tests
- `corepack pnpm multi-agent:guard`: PASS
- `rg -n -e '/api/dev' -e pnpm -e scripts/ -e live:smoke -e products:sync src/app/api/public`: no matches
- `git diff --check`: PASS

## 실패와 재확인

- status route를 처음 `GET(request?: Request)`로 바꿨을 때 Next.js App Router build type gate가 실패했습니다. `GET(request: Request)`로 고쳐 최종 build를 통과했습니다.
- status route 단위 테스트 한 곳이 인자 없는 호출을 유지해 focused test가 실패했습니다. 명시적 `Request`를 전달하도록 고쳤습니다.
- 독립 리뷰에서 `/invest/companies`의 정적 수동 복구 명령 노출과 E2E 공백을 발견해 UI 제거 및 E2E를 추가했습니다.
- 새 `/invest/companies` dev E2E는 HMR WebSocket 대체 때문에 hydration 전에 form submit이 발생해 두 차례 실패했습니다. 해당 상호작용 경로를 helper 예외에 추가한 뒤 dev/production에서 모두 통과했습니다.
- production E2E 직후 full test는 `.next/standalone` runtime symlink와 desktop artifact copy가 충돌해 `desktop-artifact-provenance` 2건만 실패했습니다. 재빌드 후 단독 4건과 full 2,709건이 통과했으며 구조적 순서 의존성은 Issue #220으로 분리했습니다.
- production E2E 첫 실행은 `PLANNING_SINGLE_USER_MODE` 미지정으로 시작이 차단됐습니다. 명시적 single-user 설정 후 통과했습니다.

## 남은 리스크

- `debug=1`은 기존 public diagnostic 정책에 따라 운영 명령을 반환합니다. 향후 인증된 ops 전용 진단으로 강화하려면 별도 계약 합의가 필요합니다.
- `primaryPath`와 `triedPaths`는 기존 호환 계약에 따라 기본 응답에 남아 있습니다. 경로 자체도 민감 진단으로 분류한다면 별도 Issue에서 단계적으로 좁혀야 합니다.
- generic error helper 전체를 sanitizer로 바꾸지는 않았습니다. 현재 측정된 public message 누출 경로만 최소 수정했습니다.
- production E2E와 desktop artifact 테스트의 실행 순서 의존성은 Issue #220에서 해소해야 합니다.

## 롤백 기준

- payload builder 옵션, route 전달부, public UI 안내, 테스트 helper 예외를 파일별로 되돌릴 수 있습니다.
- 롤백 시 기존 내부 명령 노출이 다시 생기므로 #123 수용 기준 미충족 상태임을 명시해야 합니다.

## 다음 라운드

1. #123 PR 생성, Actions 상태 확인, 병합, Issue 종료
2. #220 runtime symlink 수명과 desktop artifact copy 경계 중 더 작은 수정 지점 선택
3. 기존 미처리 구조 Issue #120 또는 #122를 현재 main 기준으로 재분류
