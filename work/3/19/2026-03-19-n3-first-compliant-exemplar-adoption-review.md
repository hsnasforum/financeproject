# 2026-03-19 N3 first compliant exemplar adoption review

## 변경 파일
- `docs/release.md`
- `docs/release-checklist.md`
- `docs/maintenance.md`
- `work/3/19/2026-03-19-n3-first-compliant-exemplar-adoption-review.md`

## 사용 skill
- `work-log-closeout`: exemplar adoption review의 판정, 문서 보정, 검증 결과, 남은 리스크를 `/work` closeout 형식으로 정리했다.

## 변경 이유
- 직전 release-bound run에서 생성한 `work/3/19/2026-03-19-release-v1.0.4-main-verify.md`가 current `Tracked Release Note Quality Gate`를 실제로 완전 충족하는지 판단하고, 충족 시 `first compliant exemplar exists` 상태로 문서를 갱신할 필요가 있었다.
- legacy success/blocker exemplar를 바로 교체하지 않으면서도, current template adoption 기준선과 historical role reference를 분리해 문서 drift를 줄여야 했다.

## 핵심 변경
- `work/3/19/2026-03-19-release-v1.0.4-main-verify.md`를 current template의 필수 섹션과 순서 기준으로 다시 대조했다.
  - `변경 파일`, `사용 skill`, `대상 릴리즈`, `primary / companion final gate`, `conditional minor guard`, `advisory record`, `evidence 위치`, `미실행 gate`, `검증`, `남은 리스크`가 모두 존재하고 순서도 맞았다.
  - blocker / advisory / evidence / 미실행 gate가 섞이지 않았고, raw evidence는 `.data/planning/eval/latest.json` 경로만 남겼다.
  - 실제 명령, 경로, PASS/FAIL, residual risk / next owner도 note 본문과 모순되지 않았다.
- 판정은 `first compliant exemplar exists`로 고정했다.
- `docs/release.md`의 adoption status를 갱신해 `work/3/19/2026-03-19-release-v1.0.4-main-verify.md`를 current template adoption 기준선으로 명시했다.
- `docs/release-checklist.md`, `docs/maintenance.md`에는 legacy exemplar를 success/blocker 역할 reference로 유지한다는 점을 함께 맞췄다.
- current latest release closeout note 자체는 완전 준수를 막는 형식 누락이 없어 추가 수정하지 않았다.

## 판단 결과
- fully compliant exemplar
  - 있음
  - `work/3/19/2026-03-19-release-v1.0.4-main-verify.md`
- legacy exemplar 유지
  - success 역할 reference: `work/3/16/2026-03-16-release-v1.0.4-main-verify.md`
  - blocker/smoke 역할 reference: `work/3/13/2026-03-13-runtime-release-verify-smoke.md`
- 유지 원칙
  - first compliant exemplar는 current template adoption 기준선으로 사용한다.
  - legacy exemplar는 historical role reference로 유지하고 즉시 교체하지 않는다.

## 검증
- 실행한 검증
- `git diff --check -- work/3/19/2026-03-19-release-v1.0.4-main-verify.md docs/release.md docs/release-checklist.md docs/maintenance.md work/3/19/2026-03-19-n3-first-compliant-exemplar-adoption-review.md`
  - 결과: 통과
- 미실행 검증
- `pnpm lint`
- `pnpm build`
- `pnpm e2e:rc`
- `pnpm release:verify`
- 이유: 이번 라운드는 docs/note-only adoption review라 사용자 지시대로 `git diff --check`만 실행했다.

## 남은 리스크
- 현재 first compliant exemplar는 template adoption 기준선으로는 충분하지만, versioned stable release closeout의 장기 대표 success exemplar까지 대체할지는 후속 누적 사례를 더 본 뒤 판단하는 편이 안전하다.
- current worktree에는 unrelated dirty 변경이 계속 남아 있으므로, 실제 commit/PR에서는 이번 문서 범위를 분리해 확인해야 한다.

## 다음 라운드 우선순위
- `N3 compliant exemplar role split review after one more stable release-bound closeout`
