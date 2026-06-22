# 2026-06-22 sync smoke allowlist 축소

## 변경 파일
- `scripts/security_route_guard_scan.mjs`
- `work/6/22/2026-06-22-sync-smoke-allowlist-trim.md`

## 사용 skill
- finance-skill-routing: 최신 `/work` 기준으로 Auth/User Scope 후속 라운드에 필요한 기본 skill 조합을 확인했습니다.
- planning-gate-selector: security scan script-only 변경에 맞춰 `node --check`, `sec:check`, `lint`, `git diff --check`를 선택했습니다.
- route-ssot-check: `/api/sync/smoke`의 실제 route guard와 문서 기준을 확인했고, route surface나 `docs/current-screens.md` 변경은 필요 없다고 판단했습니다.
- work-log-closeout: 실제 변경 파일, 검증 결과, 남은 리스크를 `/work` 종료 기록으로 남겼습니다.

## 변경 이유
- `/api/sync/smoke`는 이미 `decideTrustedOrigin`으로 Origin/Host 신뢰 결정을 수행합니다.
- `security_route_guard_scan.mjs`도 `decideTrustedOrigin`을 public mutation guard로 인정하므로, 별도 allowlist 예외는 중복이었습니다.
- public mutation allowlist를 줄여 보안 예외 표면을 더 작게 유지합니다.

## 핵심 변경
- `PUBLIC_MUTATION_ALLOWLIST`에서 `src/app/api/sync/smoke/route.ts` 예외를 제거했습니다.
- route 코드는 변경하지 않았고, 기존 trusted-origin guard 계약을 그대로 사용했습니다.
- `sec:check` 결과 public mutation allowlist가 5건에서 4건으로 줄었습니다.

## 검증
- PASS: `node --check scripts/security_route_guard_scan.mjs`
- PASS: `corepack pnpm sec:check`
- PASS: `git diff --check`
- PASS: `corepack pnpm lint`
- 미실행: `corepack pnpm build`는 App Router runtime/source 변경이 아니라 security scan script-only 변경이라 실행하지 않았습니다.
- 미실행: `corepack pnpm planning:current-screens:guard`는 route 목록, href, docs/current-screens 변경이 없어 실행하지 않았습니다.
- 미실행: `corepack pnpm e2e:rc`는 사용자 flow, selector, navigation 변경이 없어 실행하지 않았습니다.

## 남은 리스크
- public mutation allowlist는 4건 남아 있습니다. `feedback`과 `gov24` 계열은 각 surface별로 공개 입력/외부 데이터 성격을 나눠 후속 보안 라운드에서 줄여야 합니다.
- `/api/sync/smoke` 자체는 여전히 개발/로컬 smoke 용도입니다. 이번 변경은 중복 allowlist 제거이며 route 동작 강화는 아닙니다.

## 다음 라운드
- 이어지는 작업자는 이 기록의 남은 리스크와 검증 필요 항목을 기준으로 후속 scope를 좁힙니다.
