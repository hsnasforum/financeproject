# 2026-06-22 feedback mutation Origin guard

## 변경 파일
- `scripts/security_route_guard_scan.mjs`
- `src/app/api/feedback/_lib/trustedOriginGuard.ts`
- `src/app/api/feedback/route.ts`
- `src/app/api/feedback/[id]/route.ts`
- `tests/feedback-route-guards.test.ts`
- `work/6/22/2026-06-22-feedback-mutation-origin-guard.md`

## 사용 skill
- finance-skill-routing: Auth/User Scope 보안 라운드에 필요한 기본 skill 조합을 확인했습니다.
- planning-gate-selector: API route, security scan, 테스트 추가에 맞춰 targeted vitest, `sec:check`, `planning:ssot:check`, `lint`, `test`, `build`를 선택했습니다.
- route-ssot-check: feedback URL surface는 유지되고 route guard만 강화됨을 확인해 `docs/current-screens.md` 갱신은 제외했습니다.
- work-log-closeout: 변경 파일, 검증 결과, 남은 리스크를 `/work` 종료 기록으로 남겼습니다.

## 변경 이유
- `POST /api/feedback`와 `PATCH /api/feedback/[id]`는 공개 feedback 흐름을 유지하는 mutation route였지만, Origin/Host 검증 없이 `PUBLIC_MUTATION_ALLOWLIST` 예외에 남아 있었습니다.
- 공개 기능은 유지하되 cross-site mutation을 막고, 보안 예외 표면을 줄이기 위해 기존 trusted-origin 정책을 feedback mutation에 적용했습니다.

## 핵심 변경
- feedback mutation 공용 guard `guardFeedbackMutationOrigin`을 추가해 `decideTrustedOrigin` 기반으로 same-origin/trusted-origin 요청만 허용합니다.
- `POST /api/feedback`와 `PATCH /api/feedback/[id]` 시작부에서 guard를 실행해 missing/untrusted Origin은 403으로 차단합니다.
- security route scan에서 feedback 2건 allowlist 예외를 제거하고, route-local guard 호출을 명시 public mutation guard로 인정했습니다.
- `tests/feedback-route-guards.test.ts`로 same-origin 성공, missing Origin 차단, untrusted Origin 차단, PATCH 미변경 보존을 고정했습니다.
- `sec:check` 결과 public mutation allowlist가 4건에서 2건으로 줄었습니다.

## 검증
- PASS: `corepack pnpm vitest run tests/feedback-route-guards.test.ts`
- PASS: `node --check scripts/security_route_guard_scan.mjs`
- PASS: `corepack pnpm sec:check`
- PASS: `corepack pnpm planning:ssot:check`
- PASS: `corepack pnpm lint`
- PASS: `corepack pnpm build`
- PASS: `corepack pnpm test`
- PASS: `git diff --check`
- 미실행: `corepack pnpm e2e:rc`는 UI, navigation, selector, route surface 변경이 없어 실행하지 않았습니다.

## 남은 리스크
- public mutation allowlist는 Gov24 계열 2건이 남아 있습니다. Gov24는 공공데이터/freshness/fallback 영향이 있어 `dart-data-source-hardening`을 포함한 별도 라운드로 분리해야 합니다.
- Origin 헤더가 없는 비브라우저 feedback submit/update 클라이언트는 이제 403을 받습니다. 현재 제품 UI는 브라우저 same-origin fetch를 사용하므로 정상 경로는 유지됩니다.

## 다음 라운드
- 이어지는 작업자는 이 기록의 남은 리스크와 검증 필요 항목을 기준으로 후속 scope를 좁힙니다.
