# 2026-03-11 DART UX and security hardening

## 수정 대상 파일
- `src/components/DartSearchClient.tsx`
- `src/components/DartDisclosureMonitorClient.tsx`
- `middleware.ts`
- `tests/middleware-security.test.ts`
- `tests/e2e/dart-flow.spec.ts`

## 변경 이유
- `public/dart`는 dev 복구 로직 때문에 pending query가 없어도 기본값으로 자동 검색이 실행될 수 있었습니다.
- 첫 진입에서도 바로 `검색 결과가 없습니다.`가 보여 UX가 거칠었고, 검색 전 상태와 빈 결과 상태가 구분되지 않았습니다.
- DART 모니터의 외부 원문 링크는 새 탭으로 열리지만 `rel` 보호가 없었습니다.
- 공통 middleware의 CSP는 production에서도 `unsafe-eval`을 허용하고 있었고, 기본 cross-origin 보호 헤더가 더 들어갈 여지가 있었습니다.

## 이번 변경
1. DART 검색창 기본값을 빈 문자열로 바꾸고, pending query가 없을 때 자동 검색하던 effect를 제거했습니다.
2. 검색 전 idle 상태와 검색 후 empty 상태를 분리해 각각 다른 안내 문구를 보여주도록 바꿨습니다.
3. dev 복구용 `pending-company-href` 저장은 dev에서만 수행하게 줄였고, stale pending query는 복구 시점에 정리하도록 보강했습니다.
4. DART 모니터 외부 링크에 `rel="noopener noreferrer"`를 추가했습니다.
5. middleware에 `cross-origin-opener-policy`, `cross-origin-resource-policy`, `origin-agent-cluster`를 추가했고, production CSP에서는 `unsafe-eval`을 빼도록 조정했습니다.
6. middleware 보안 테스트와 DART flow E2E에 이번 동작을 고정하는 검증을 추가했습니다.

## 재현 / 검증
- `pnpm test tests/middleware-security.test.ts`
- `pnpm exec eslint src/components/DartSearchClient.tsx src/components/DartDisclosureMonitorClient.tsx middleware.ts tests/middleware-security.test.ts tests/e2e/dart-flow.spec.ts`
- `pnpm e2e:pw tests/e2e/dart-flow.spec.ts --workers=1`

## 남은 리스크와 엣지케이스
- 이번 변경은 `public/dart`의 검색/빈 상태 UX와 보안 헤더 축에만 제한했습니다. 다른 화면의 empty state 문구와 외부 링크 정책은 아직 동일 기준으로 정리되지 않았습니다.
- dev 런타임 로그에는 여전히 `Fast Refresh had to perform a full reload`, `/planning/reports 500`, `__webpack_modules__[moduleId] is not a function` 흔적이 남을 수 있습니다.
- production CSP는 `unsafe-eval`만 축소했고 `unsafe-inline`은 유지했습니다. 더 줄이려면 Next/App Router 런타임 요구사항과 전체 페이지를 같이 확인해야 합니다.

## 다음 작업
- 이 메모는 `/work` 구조 정렬 배치에서 `다음 작업` 섹션만 보강했습니다.
- 실제 후속 우선순위는 더 최신 closeout 기준으로 다시 판단합니다.

## 사용 skill
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 사용 skill 상세는 기존 본문 기준으로 확인합니다.

## 검증
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 실행 검증 상세는 기존 본문 기준으로 확인합니다.

## 남은 리스크
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 실제 잔여 리스크는 더 최신 closeout 기준으로 다시 판단합니다.
