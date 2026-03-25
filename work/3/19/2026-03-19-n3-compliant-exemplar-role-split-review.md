# 2026-03-19 N3 compliant exemplar role split review

## 변경 파일
- `docs/release.md`
- `docs/release-checklist.md`
- `docs/maintenance.md`
- `work/3/19/2026-03-19-n3-compliant-exemplar-role-split-review.md`

## 사용 skill
- `planning-gate-selector`: 이번 라운드를 docs-only로 유지하고 `git diff --check`만 실행하는 최소 검증 세트를 고정했다.
- `work-log-closeout`: exemplar role split 판단, 문서 보정, 미실행 검증, 남은 리스크를 `/work` closeout 형식으로 정리했다.

## 변경 이유
- first compliant exemplar가 생긴 뒤에도 success/blocker 역할 reference와 template adoption 기준선이 같은 역할로 읽히지 않도록 장기 운영 규칙을 더 분명히 남길 필요가 있었다.
- 지금 당장 exemplar를 교체하지 않으면서도, 다음 stable release-bound closeout 1건이 더 쌓였을 때 어떤 조건에서 success/blocker role review를 열지 잠가야 문서 drift를 줄일 수 있다.

## 핵심 변경
- exemplar 체계를 3층으로 다시 고정했다.
  - template adoption 기준선: `work/3/19/2026-03-19-release-v1.0.4-main-verify.md`
  - success historical role reference: `work/3/16/2026-03-16-release-v1.0.4-main-verify.md`
  - blocker/smoke historical role reference: `work/3/13/2026-03-13-runtime-release-verify-smoke.md`
- `docs/release.md`에는 role split과 future review trigger를 추가했다.
  - success role review는 다음 stable release-bound closeout 1건이 더 생긴 뒤에만 연다.
  - 새 success note는 tracked `/work`, fully compliant, same-owner final gate closeout이어야 하고, legacy success exemplar보다 success handoff 흐름이 더 분명해야 한다.
  - blocker review는 새 blocked/smoke compliant note가 생기고 첫 blocker + 미실행 gate 분리가 더 선명할 때만 연다.
- `docs/release-checklist.md`, `docs/maintenance.md`에는 위 role split과 review trigger를 운영 체크 관점으로 맞췄다.
- 기존 exemplar note와 current first compliant exemplar note 자체는 수정하지 않았다.

## 판단 결과
- exemplar role split
  - template adoption 기준선과 success/blocker 역할 reference를 분리 유지한다.
- future review trigger
  - success review: 다음 stable release-bound closeout 1건 추가 + fully compliant + same-owner final gate closeout + 더 읽기 쉬운 success handoff
  - blocker review: 새 blocked/smoke compliant note + 첫 blocker/미실행 gate 분리가 더 명확함
- 즉시 교체 여부
  - 없음

## 검증
- 실행한 검증
- `git diff --check -- docs/release.md docs/release-checklist.md docs/maintenance.md work/3/19/2026-03-19-n3-compliant-exemplar-role-split-review.md`
  - 결과: 통과
- 미실행 검증
- `pnpm lint`
- `pnpm build`
- `pnpm e2e:rc`
- `pnpm release:verify`
- 이유: 이번 라운드는 docs-only role split review라 사용자 지시대로 `git diff --check`만 실행했다.

## 남은 리스크
- success role review trigger는 문서상으로는 잠겼지만, 실제로 더 읽기 쉬운 success handoff의 기준은 다음 stable closeout이 하나 더 생겨야 비교 가능하다.
- current worktree에는 unrelated dirty 변경이 남아 있으므로, 실제 commit/PR에서는 이번 docs-only 범위를 분리해 확인해야 한다.

## 다음 라운드 우선순위
- `N3 success exemplar replacement review when one more compliant stable closeout exists`
