# 2026-07-10 planning telemetry rounding SSOT gate 복구

## 변경 파일

- `src/lib/planning/server/pages/planningPageLoadTelemetry.ts`
- `tests/planning/planningPageLoadTelemetry.test.ts`
- `work/7/10/2026-07-10-planning-telemetry-rounding-ssot.md`

## 사용 skill

- `finance-skill-routing`: audit와 planning 구현 라운드의 최소 skill 조합 선택
- `planning-gate-selector`: telemetry helper, SSOT guard, planning page build 영향 검증 세트 선택
- `route-ssot-check`: #115 route policy와 current-screens/SSOT guard 대조
- `github:github`: Issue #114/#115/#194/#195 상태와 수용 기준 확인 및 #114 완료 처리
- `work-log-closeout`: audit 실패와 수정 후 PASS를 분리한 한글 closeout 작성
- `manager` subagent: open Issue audit 우선, #194 차순위 결정
- `reviewer` subagent: rounding 동등성, import boundary, telemetry shape 정적 검토

## 변경 이유

- Issue #114와 #115가 실제 구현 충족 상태와 달리 open으로 남아 있어 현재 `main` 기준 audit가 필요했습니다.
- #115 audit 중 `planning:ssot:check`가 route policy가 아닌 page-load telemetry의 direct `Math.round` 2건 때문에 실패했습니다.
- 공통 `roundToInteger` 정책을 사용하면 guard baseline 예외 없이 기존 nearest-integer 의미를 유지할 수 있었습니다.

## 핵심 변경

- Issue https://github.com/hsnasforum/financeproject/issues/114 는 여섯 FINLIFE product route의 공통 gateway 사용과 direct source import 금지 근거를 남기고 완료 처리했습니다.
- Issue https://github.com/hsnasforum/financeproject/issues/195 를 등록해 current `main`의 planning SSOT gate drift를 독립 범위로 추적했습니다.
- duration과 env threshold 정규화의 direct `Math.round`를 `roundToInteger`로 교체했습니다.
- invalid/negative fallback, telemetry snapshot/logger 조건, env 이름과 public contract는 유지했습니다.
- fractional threshold와 fractional duration의 기존 nearest-integer 결과를 회귀 테스트로 고정했습니다.
- #115의 current-screens 9건, route policy 7건, deprecated planner guard는 통과했으며 #195 수정 후 전체 `planning:ssot:check`도 통과했습니다.

## 검증

- FINLIFE focused tests: PASS, 4 files / 9 tests
- `corepack pnpm planning:current-screens:guard`: PASS, 5 files / 9 tests
- 최초 `corepack pnpm planning:ssot:check`: FAIL, `planningPageLoadTelemetry.ts` direct `Math.round` 2건
- `corepack pnpm planner:deprecated:guard`: PASS
- route policy focused test: PASS, 1 file / 7 tests
- telemetry focused test: PASS, 1 file / 4 tests
- 수정 후 `corepack pnpm planning:ssot:check`: PASS, SSOT guard + 5 files / 9 tests
- 최초 `DATABASE_URL=file:./dev.db corepack pnpm lint`: 오류 출력 없이 184초 tool timeout
- 재실행 `DATABASE_URL=file:./dev.db corepack pnpm lint`: PASS, 200.3초
- `DATABASE_URL=file:./dev.db corepack pnpm planning:v2:complete`: PASS, fast E2E 8건
- `DATABASE_URL=file:./dev.db corepack pnpm test`: PASS
- `corepack pnpm cleanup:next-artifacts`: PASS
- `DATABASE_URL=file:./dev.db corepack pnpm build`: PASS, 539.2초
- reviewer: 기능 finding 없음. fractional duration 테스트 공백 1건 보강 완료
- 미실행: `corepack pnpm planning:v2:compat`, `corepack pnpm planning:v2:regress`, 수동 `docs/planning-v2-5min-selftest.md`, production 배포 smoke, `corepack pnpm release:verify`

## 남은 리스크

- `roundToInteger` 자체 정책이 바뀌면 telemetry duration/threshold도 함께 바뀌지만 fractional 회귀 테스트가 이를 감지합니다.
- build와 lint가 평소보다 오래 걸렸으나 재현 가능한 코드 오류는 없었고 모두 PASS했습니다.
- Public URL/API/HTTP 응답과 telemetry snapshot shape, DB schema, Prisma query semantics, storage, HTTP cache/revalidation, 외부 data-source 동작은 변경하지 않았습니다.
- #115는 route 정책 수용 기준과 전체 SSOT gate가 모두 통과한 근거를 Issue에 남긴 뒤 완료 여부를 확정해야 합니다.
- #194는 별도 Low 우선순위 구현 후보로 남아 있습니다.
- 롤백 기준은 duration/threshold rounding 결과 변화, invalid fallback 변화, slow-load logger 조건 변화, public/DB/cache 계약 변화입니다.

## 다음 라운드

1. #195 PR을 게시하고 최종 head의 CI/E2E job step 실행 여부를 확인한 뒤 병합합니다.
2. 병합된 `main`에서 `planning:ssot:check`를 근거로 #115를 완료 처리합니다.
3. 다음 코드 후보는 #194 profile update startup migration gate 중복 제거와 FINLIFE sync pipeline 별도 구조 Issue를 비교합니다.
