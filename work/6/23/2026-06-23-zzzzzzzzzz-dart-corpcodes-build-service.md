# 2026-06-23 DART corpcodes build service boundary

## 변경 파일
- `src/app/api/public/disclosure/corpcodes/build/route.ts`
- `src/lib/publicApis/dart/corpIndexBuildService.ts`
- `tests/dart-corpindex-build-service.test.ts`
- `work/6/23/2026-06-23-zzzzzzzzzz-dart-corpcodes-build-service.md`

## 사용 skill
- `finance-skill-routing`: 최신 `/work` 우선순위에 맞춰 DART `corpcodes/build` service 경계 분리로 범위를 좁혔습니다.
- `planning-gate-selector`: DART API route/helper 변경에 맞춰 표적 테스트, lint/typecheck/build, DART e2e 검증을 선택했습니다.
- `work-log-closeout`: 실제 변경 파일, 실행 검증, 남은 리스크를 표준 `/work` 형식으로 정리했습니다.
- `dart-data-source-hardening`: DART build endpoint의 env, 실패 payload, secret masking, fallback/stub 동작을 기존 계약 안에서 확인했습니다.
- `gpt-5.3-codex-spark` + `xhigh`: 관련 테스트 위치와 최소 service 함수 경계를 병렬로 정적 조사했습니다.

## 변경 이유
- `POST /api/public/disclosure/corpcodes/build` route가 guard, 파일 복사, python 실행, cache invalidation, stdout/stderr tail masking, HTTP 응답 매핑을 한 파일에서 모두 처리하고 있었습니다.
- 운영형 SaaS 기준으로 route handler는 접근 제어와 응답 매핑에 가깝게 줄이고, 파일/프로세스 접근은 DART service 계층으로 분리할 필요가 있었습니다.
- route path, env 이름, JSON payload shape는 그대로 유지하면서 책임 경계만 좁혔습니다.

## 핵심 변경
- `buildCorpCodesIndex` service를 추가해 stub index 복사, `scripts/dart_corpcode_build.py` 실행, cache invalidation, 성공/실패 payload 정규화를 담당하게 했습니다.
- route handler는 dev/local guard, production token guard, service 호출, `NextResponse.json` 매핑만 수행하도록 축소했습니다.
- production token 판정은 기존 `canBuildCorpIndex` helper를 사용해 `indexBuildGuard` 계약 테스트와 연결했습니다.
- service 단위 테스트로 stub build, python 누락 실패 payload, OpenDART secret masking, long tail trimming을 고정했습니다.
- `DART_INDEX_BUILD_TOKEN`, `DART_E2E_BUILD_STUB`, `DART_CORPCODES_INDEX_PATH` 이름과 기존 response field는 변경하지 않았습니다.

## 검증
- `corepack pnpm test tests/dart-corpindex-build-service.test.ts tests/dart-corpcodes-build-auth.test.ts tests/dart-corpindex-build-guard.test.ts tests/dart-corpcodes-search.test.ts tests/corpcodes-path.test.ts` PASS (`5` files, `20` tests)
- `corepack pnpm lint` PASS
- `corepack pnpm typecheck` PASS
- `corepack pnpm build` PASS
- `corepack pnpm e2e:rc:dart` PASS (`3` tests)
- `git diff --check` PASS

## 남은 리스크
- 실제 OpenDART live corpCode ZIP 다운로드는 실행하지 않았습니다. 이번 라운드는 service 경계 분리와 stub/실패 payload 계약 검증에 집중했습니다.
- `pnpm verify`는 최신 `/work` 기준 기존 `finlife_credit-loan_snapshot.json` schema drift로 실패하는 상태라 이번 라운드에서 반복 실행하지 않았습니다.
- E2E는 `tests/e2e/dart-flow.spec.ts` 중심의 DART 사용자 흐름을 확인했으며, `tests/e2e/dart-build-index.spec.ts` 단독 build 버튼 플로우는 별도 후속 검증 후보로 남깁니다.

## 다음 라운드 우선순위
- PostgreSQL readiness gate를 release checklist와 더 촘촘히 연결합니다.
- Planning API repository/data ownership 정리에서 route handler 직접 파일/DB 접근 후보를 다음 작은 PR로 분리합니다.
- `pnpm verify`를 막는 `finlife_credit-loan_snapshot.json` schema drift 처리 방식을 별도 PR로 결정합니다.
