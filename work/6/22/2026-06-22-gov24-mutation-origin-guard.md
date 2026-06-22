# 2026-06-22 Gov24 mutation origin guard

## 수정 대상 파일
- `src/app/api/gov24/_lib/trustedOriginGuard.ts`
- `src/app/api/gov24/simple-find/route.ts`
- `src/app/api/gov24/sync/route.ts`
- `scripts/security_route_guard_scan.mjs`
- `tests/gov24-route-guards.test.ts`
- `work/6/22/2026-06-22-gov24-mutation-origin-guard.md`

## 사용 skill
- `finance-skill-routing`: Finance Project 변경에 필요한 조건부 skill 범위 확인
- `planning-gate-selector`: 라우트/security 변경에 맞는 최소 검증 세트 선정
- `route-ssot-check`: 사용자 경로 변경 없음과 SSOT 영향 없음 확인
- `dart-data-source-hardening`: Gov24 공공데이터/fallback/freshness 성격의 실패 모드 점검
- `work-log-closeout`: 종료 기록 형식 정리

## 변경 이유
- 보안 스캔의 `PUBLIC_MUTATION_ALLOWLIST`에 남아 있던 Gov24 공개 POST 2건을 예외로 방치하지 않기 위해 same-origin/trusted-origin guard로 표준화했습니다.
- `/gov24` 화면의 브라우저 same-origin 호출은 유지하면서, Origin 누락 또는 신뢰되지 않은 cross-site POST는 upstream sync/search 작업 전에 403으로 차단합니다.
- 공공데이터 화면에서 실패 원인을 숨기지 않도록 거부 응답도 `meta.fallback.sourceKey=gov24`, `reason=origin_rejected`를 유지합니다.

## 핵심 변경
- `guardGov24MutationOrigin`을 추가해 `decideTrustedOrigin` 기반으로 Gov24 mutation 요청을 검사합니다.
- `simple-find`, `sync` POST 라우트 시작 지점에 origin guard를 적용했습니다.
- 보안 스캔 allowlist를 빈 목록으로 줄이고 Gov24 guard 패턴을 정식 guard로 인식하게 했습니다.
- same-origin 성공/기존 validation 유지, Origin 누락, untrusted Origin, upstream 미실행을 route 테스트로 고정했습니다.

## 검증
- PASS: `corepack pnpm vitest run tests/gov24-route-guards.test.ts`
- PASS: `node --check scripts/security_route_guard_scan.mjs`
- PASS: `corepack pnpm sec:check` (`publicMutationAllowlist=0`)
- PASS: `corepack pnpm planning:ssot:check`
- PASS: `corepack pnpm lint`
- PASS: `corepack pnpm build` (124초 제한에서는 출력 없이 timeout, 300초 제한 재실행 통과)
- PASS: `corepack pnpm test` (695 files, 2224 tests)
- PASS: `git diff --check`

## 남은 리스크와 엣지케이스
- [검증 필요] 브라우저가 아닌 no-Origin 클라이언트가 Gov24 sync/simple-find를 직접 호출하던 비공식 경로는 이제 403을 받습니다.
- [미실행] live Gov24 upstream smoke 또는 `daily:refresh:strict`는 실행하지 않았습니다. 이번 변경은 route guard와 fallback shape에 한정했습니다.
- [미실행] UI/e2e는 실행하지 않았습니다. 사용자 경로, selector, 화면 상태는 변경하지 않았고 `/gov24`의 same-origin fetch 계약은 route 테스트와 build로 확인했습니다.

## 다음 라운드
- 이어지는 작업자는 이 기록의 남은 리스크와 검증 필요 항목을 기준으로 후속 scope를 좁힙니다.
