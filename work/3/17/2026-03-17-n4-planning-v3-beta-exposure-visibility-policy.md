# 2026-03-17 N4 planning/v3 beta exposure visibility policy

## 변경 파일

- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `analysis_docs/v2/15_planning_v3_beta_exposure_visibility_policy.md`
- `work/3/17/2026-03-17-n4-planning-v3-beta-exposure-visibility-policy.md`

## 사용 skill

- `finance-skill-routing`: analysis-only 문서 라운드에서 실제로 필요한 skill을 최소 조합으로 고르고, `docs/current-screens.md`를 읽기 전용 inventory로만 다루도록 범위를 잠그는 데 사용
- `work-log-closeout`: 이번 라운드의 문서 변경, 실제 실행 명령, 남은 리스크를 `/work` 형식으로 정리하는 데 사용

## 변경 이유

- `N1~N3`에서 owner, API/import-export/rollback contract, QA gate tier는 잠겼지만, `planning/v3`를 다음 사이클에 어디까지 public beta로 보여 줄지는 아직 문서로 고정되지 않았다.
- `docs/current-screens.md`는 현재 route inventory를 보여 주지만, next-cycle에서 어떤 route를 entry, deep-link, internal로 다룰지는 별도 policy가 필요했다.
- 구현을 건드리기 전에 raw batch/import/support route를 public beta entry로 올리지 않는 범위를 먼저 잠가 둘 필요가 있었다.

## 핵심 변경

- `analysis_docs/v2/15_planning_v3_beta_exposure_visibility_policy.md`를 신설해 `planning/v3` route 25개를 `public beta entry`, `public beta deep-link only`, `internal/experimental only`로 모두 분류했다.
- 각 group마다 포함 route, 분류 이유, `N3` gate 전제조건, 사용자 노출 톤/안내 수준을 함께 고정했다.
- `docs/current-screens.md`는 current inventory이고, `N4` 문서는 next-cycle policy overlay라는 역할 분리를 명시했다.
- `planning/v3`를 public stable처럼 노출하지 않으며 raw batch/import/support route를 entry로 올리지 않는 금지 규칙을 문서에 추가했다.
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`의 `N4` 항목에 새 정책 문서 연결 메모를 추가했다.

## 검증

- 실행한 확인
- `git status --short`
- `rg --files src/app/planning/v3`
- `git diff --check -- analysis_docs/v2/11_post_phase3_vnext_backlog.md analysis_docs/v2/15_planning_v3_beta_exposure_visibility_policy.md work/3/17/2026-03-17-n4-planning-v3-beta-exposure-visibility-policy.md`
- 미실행 검증
- 사용자 지시로 `pnpm build`, `pnpm test`, `pnpm lint`, `pnpm e2e:rc`, `pnpm planning:current-screens:guard`, `pnpm planning:ssot:check`, `pnpm release:verify`는 실행하지 않았다.

## 남은 리스크

- `docs/current-screens.md`는 여전히 broad `Public Beta` inventory를 유지하므로, 다음 구현 라운드에서 실제 nav/link 정책과 current inventory의 표현 차이를 다시 맞춰야 한다.
- `/planning/v3/accounts`와 `/planning/v3/profile/draft`는 helper 성격이 있어 deep-link only로 두었지만, 실제 beta onboarding 구현에서는 CTA 연결 방식이 추가로 필요할 수 있다.
- `news`, `exposure`, `scenarios`, `journal` 계열은 이번 문서에서 internal/experimental로 묶었고, public beta 승격 여부는 별도 owner/gate 검토 없이는 다시 열지 않는 것이 안전하다.
