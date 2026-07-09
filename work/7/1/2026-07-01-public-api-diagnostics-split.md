# 2026-07-01 Public API diagnostics split

## 변경 파일
- `src/lib/http/publicApiDiagnostics.ts`
- `src/app/api/public/benefits/search/route.ts`
- `src/app/api/recommend/route.ts`
- `tests/public-api-diagnostics.test.ts`
- `tests/recommend-api.test.ts`

## 사용 skill
- `planning-gate-selector`: API route, public message, 테스트 계약 변경에 필요한 검증 범위를 고르는 데 사용했습니다.
- `dart-data-source-hardening`: public/open data failure, stale/missing snapshot, 사용자 안내와 운영자 진단 분리를 점검하는 데 사용했습니다.
- `work-log-closeout`: 변경 후 `/work` 종료 기록 형식을 맞추는 데 사용했습니다.

## 변경 이유
- `benefits/search`의 snapshot missing 응답이 `/api/dev/benefits/snapshot/refresh`를 사용자 메시지로 안내했습니다.
- `recommend`의 후보 없음 성공 payload가 `pnpm live:smoke`와 `pnpm products:sync`를 사용자 메시지로 반환했습니다.
- 일반 사용자가 실행할 수 없는 내부 endpoint/명령이 public API body에 섞여 UI가 부정확한 복구 행동을 보여줄 수 있었습니다.

## 핵심 변경
- `publicErrorMessage`, `opsDiagnostic`, `buildPublicDiagnosticMeta`를 `publicApiDiagnostics`로 분리했습니다.
- benefits snapshot missing 기본 응답은 쉬운 사용자 안내와 `traceId`/`diagnosticId`만 포함하게 바꿨습니다.
- recommend 후보 없음 기본 응답은 조건을 넓히거나 재조회하라는 사용자 안내와 `diagnosticId`만 포함하게 바꿨습니다.
- 운영자 hint는 server log와 `debug=1` meta에서만 보이게 했습니다.
- benefits/recommend 계약 테스트에서 기본 응답 `message`와 기본 `meta.debug`에 `/api/dev`, `pnpm`, `snapshot refresh`, `Run` 문자열이 없음을 검증했습니다.

## 검증
- `pnpm vitest run tests/public-api-diagnostics.test.ts tests/recommend-api.test.ts`: PASS, 2 files / 12 tests
- `rg -n -f /tmp/patterns122.txt src/app src/lib tests`: PASS. 정확한 패턴 파일에는 `pnpm`, `/api/dev`, `snapshot.*refresh`, `Run `을 넣었습니다. 306 hits가 남았고, 확인한 범위에서는 dev/ops/test 코드, `autoRun`/`SavedRecommendRun` 같은 식별자, 또는 debug-only diagnostic hint였습니다.
- `rg -n -e 'pnpm' -e '/api/dev' -e 'snapshot.*refresh' -e 'Run ' src/app/api/public/benefits/search/route.ts src/app/api/recommend/route.ts src/app/recommend/page.tsx src/components/BenefitsClient.tsx src/lib/http/publicApiDiagnostics.ts tests/public-api-diagnostics.test.ts tests/recommend-api.test.ts`: PASS. 대상 public route 기본 message에는 내부 명령 문자열이 남지 않았고, 남은 내부 문자열은 dev-only UI fetch, 식별자, diagnostic mapper/test에 한정됩니다.
- `pnpm lint`: PASS
- `pnpm typecheck`: PASS
- `pnpm test`: PASS, 750 files / 2481 tests
- `pnpm build`: PASS
- `git diff --check`: PASS

## 남은 리스크
- 전체 public API schema migration은 제외했습니다. 이번 라운드는 benefits/recommend의 확인된 노출 지점만 고쳤습니다.
- `BenefitsClient`에는 development 전용 스냅샷 강제 갱신 버튼이 `/api/dev/benefits/snapshot/refresh`를 호출합니다. production UI에는 노출되지 않지만, #123 이후 route registry/dev surface 정책 정리 때 함께 재확인할 수 있습니다.
- `publicApiDiagnostics`의 운영자 hint에는 내부 endpoint/명령이 남아 있습니다. 기본 public response에는 노출하지 않고, server log 또는 명시적 `debug=1` meta로만 확인한다는 계약입니다.
- 재시도한 실패: PowerShell에서 `|`, `&&`, `<`, trailing-space `Run ` 패턴을 직접 쓴 검색/출력 명령은 shell이 먼저 해석해 실패했습니다. `bash -lc`와 패턴 파일 방식으로 재실행해 확인했습니다.
