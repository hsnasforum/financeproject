# 2026-06-23 DART company route service boundary

## 변경 파일
- `src/app/api/public/disclosure/company/route.ts`
- `src/lib/publicApis/dart/companyRoute.ts`
- `tests/dart-company-route.test.ts`

## 사용 skill
- `finance-skill-routing`: 이번 라운드를 Auth/User Scope 점검 이후 route/service 경계 정리로 좁혔습니다.
- `planning-gate-selector`: API route와 DART 흐름 변경에 맞는 검증 범위를 정했습니다.
- `dart-data-source-hardening`: DART env, fixture, upstream 실패, 사용자 노출 응답 shape 보존 여부를 점검했습니다.
- `work-log-closeout`: 변경 파일, 검증, 남은 리스크를 표준 형식으로 정리했습니다.
- `gpt-5.3-codex-spark` + `xhigh`: Auth/User Scope 후보가 최신 main에서 이미 routeAuth 경계에 있는지 정적 조사했습니다.

## 변경 이유
- 목표의 Repository/Data Ownership 정리 축에 맞춰 route handler 내부의 파일 읽기와 응답 매핑을 service/lib 계층으로 이동할 필요가 있었습니다.
- `src/app/api/public/disclosure/company/route.ts`는 DART fixture 파일 읽기와 OpenDART 응답 view-model 변환을 직접 수행하고 있었습니다.
- 이번 라운드는 사용자 경로와 응답 shape를 바꾸지 않고 route가 입력 검증, DART 호출, HTTP 응답 조립만 담당하도록 정리했습니다.

## 핵심 변경
- `companyRoute.ts`를 추가해 `corpCode` normalize/validate, fixture 데이터 로드, OpenDART 회사 payload의 public route data 매핑을 담당하게 했습니다.
- `company/route.ts`에서 `node:fs`, `node:path`, fixture parsing, live payload 매핑 로직을 제거했습니다.
- `DART_E2E_FIXTURE=1` fixture 응답, invalid corpCode 400, live OpenDART 오류 매핑은 유지했습니다.
- route data 매핑과 corpCode 검증 계약을 `tests/dart-company-route.test.ts`에 추가했습니다.

## 검증
- `corepack pnpm test tests/dart-company-route.test.ts tests/dart-company-parse.test.ts` PASS (`2` files, `5` tests)
- `corepack pnpm lint` PASS
- `corepack pnpm build` PASS
- `corepack pnpm e2e:rc:dart` PASS (`3` tests)
- `git diff --check` PASS

## 남은 리스크
- live OpenDART 호출 smoke는 실행하지 않았습니다. 이번 변경은 live 호출 함수와 env 이름을 바꾸지 않았습니다.
- `DART_E2E_FIXTURE=1` 경로는 여전히 테스트 fixture 파일에 의존합니다. 다만 파일 접근 책임이 route 밖 lib로 이동했습니다.
- DART corpCodes build route 등 다른 public disclosure route의 직접 파일 접근은 이번 PR 범위에서 다루지 않았습니다.
