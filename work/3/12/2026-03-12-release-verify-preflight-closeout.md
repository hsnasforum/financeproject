# 2026-03-12 release verify preflight closeout

## 변경 파일
- `scripts/release_verify.mjs`
- `package.json`
- `README.md`
- `docs/maintenance.md`
- `docs/release.md`
- `docs/planning-v2-release-checklist.md`
- `work/3/12/2026-03-12-release-verify-preflight-closeout.md`

## 사용 skill
- `planning-gate-selector`: runtime/release script 변경에 맞는 최소 검증 세트를 `node --check + eslint + release:verify + build`로 고르는 데 사용.
- `work-log-closeout`: 최근 `/work` 4건을 종합한 이번 라운드의 실제 변경, 실제 검증, 남은 리스크를 `/work` 형식으로 정리하는 데 사용.

## 변경 이유
- 최근 4건(`next-artifact-prune-dev-runtime-guard`, `release-runtime-infra-batch-plan`, `dev-guard-shortcut-followup-closeout`, `planning-report-bootstrap-and-legacy-redirect-hardening-closeout`)을 다시 대조한 결과, 공통으로 남은 실제 운영 리스크는 `release:verify`가 cleanup/preflight 없이 바로 게이트를 시작한다는 점이었다.
- `scripts/release_verify.mjs`는 이미 단일 진입점 역할을 할 수 있었지만, 실제 `package.json`의 `release:verify`는 여전히 인라인 체인으로 남아 있어 cleanup 계약과 문서가 분리돼 있었다.
- `cleanup:next-artifacts`는 이제 dev runtime이 살아 있어도 stale `.next-build*` 정리를 계속 수행할 수 있으므로, release gate의 시작 preflight로 연결해도 안전한 상태였다.

## 핵심 변경
- `scripts/release_verify.mjs`에 `cleanup:next-artifacts`를 필수 preflight gate로 추가했다.
- `package.json`의 `release:verify`를 인라인 체인 대신 `node scripts/release_verify.mjs` 단일 진입점으로 바꿔 release gate 계약을 한 곳으로 모았다.
- `README.md`, `docs/maintenance.md`, `docs/release.md`, `docs/planning-v2-release-checklist.md`에 `release:verify`가 먼저 cleanup preflight를 실행한다는 운영 규칙을 반영했다.
- 실제 `pnpm release:verify` 실행에서 preflight가 active dev runtime 상태에서도 root transient는 skip 하고 stale `.next-build*`만 정리한 뒤 나머지 planning/test/ssot gate를 끝까지 통과하는 것을 확인했다.

## 검증
- `node --check scripts/release_verify.mjs`
- `pnpm exec eslint scripts/release_verify.mjs`
- `git diff --check -- scripts/release_verify.mjs package.json README.md docs/maintenance.md docs/release.md docs/planning-v2-release-checklist.md`
- `pnpm release:verify`
- `pnpm build`
- `pnpm multi-agent:guard`

## 남은 리스크
- blocker 없음.
- 이번 배치는 `release:verify` preflight 부재를 닫은 것이다. shared transient 산출물 정리가 active runtime 중 skip 되는 운영 특성 자체는 유지되므로, 최종 릴리즈 직전 single-owner 순차 실행 원칙은 계속 필요하다.
- wrapper 로그 정규화와 dev guard shortcut의 잔여 raw 표면은 별도 작은 batch로 이어가는 편이 안전하다.

## 다음 라운드 우선순위
- `next_dev_safe` / `next_build_safe` / `next_prod_safe` 로그 중복과 warning 정규화 여부를 별도 runtime batch로 검토
- `AutoMergePolicyClient`, `OpsPlanningFeedbackClient` 등 남은 dev guard raw 표면에 공통 shortcut/helper를 재사용할지 점검
- `next.config.ts`의 글로벌 runtime 계약은 wrapper/env 차이를 더 좁게 분리한 뒤 별도 batch로 다루기
