# 2026-03-19 N5 public/stable UX polish backlog

## 변경 파일

- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`
- `work/3/19/2026-03-19-n5-public-stable-ux-polish-backlog.md`

## 사용 skill

- `finance-skill-routing`: analysis-only 문서 라운드에서 필요한 skill을 최소 조합으로 고르고, `docs/current-screens.md`를 inventory로만 다루도록 범위를 잠그는 데 사용
- `work-log-closeout`: 이번 라운드의 문서 변경, 실제 실행 명령, 남은 리스크를 `/work` 형식으로 정리하는 데 사용

## 변경 이유

- `N4`에서 `planning/v3` beta exposure 정책은 잠겼지만, 기존 stable/public surface의 copy/helper/trust/CTA polish를 어떤 기준으로 후속 관리할지는 아직 별도 문서로 고정되지 않았다.
- `N5`는 contract-first를 막지 않는 보조 backlog여야 하므로, 실제 stable route만 기준으로 한 small-batch 규칙을 먼저 문서화할 필요가 있었다.
- `P1 ~ P3` 완료 항목을 reopen하지 않고, 좁은 follow-up polish queue로만 이어 가는 경계를 backlog 문서에 남겨야 했다.

## 핵심 변경

- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`를 신설해 `N5`를 stable/public surface 전용 small-batch backlog로 고정했다.
- `Public Stable` route만 기준으로 시작점, planning, recommend, 상품/공공정보, settings/trust hub, feedback surface 분류를 정리했다.
- copy/helper/trust/CTA polish의 허용 범위와, contract-first backlog를 막지 않기 위한 금지 규칙을 문서로 잠갔다.
- `planning/v3` beta exposure를 다시 열지 않으며, 새 route/새 기능/새 stable 승격을 `N5` 범위에 넣지 않는 원칙을 명시했다.
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`의 `N5` 항목에 새 문서 연결 메모를 추가했다.

## 검증

- 실행한 확인
- `git status --short`
- `sed -n '1,260p' analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `sed -n '1,260p' analysis_docs/v2/15_planning_v3_beta_exposure_visibility_policy.md`
- `sed -n '1,260p' analysis_docs/v2/financeproject_next_stage_plan.md`
- `sed -n '1,260p' docs/current-screens.md`
- `sed -n '1,240p' work/3/17/2026-03-17-n4-planning-v3-beta-exposure-visibility-policy.md`
- `rg -n "trust|helper|copy|CTA|데이터 신뢰|시작점|카피|신뢰|도움말|설정" analysis_docs/v2/financeproject_next_stage_plan.md analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `rg --files src/app | rg '(^src/app/page\\.tsx$|^src/app/dashboard/page\\.tsx$|^src/app/planning(/.*)?/page\\.tsx$|^src/app/recommend(/.*)?/page\\.tsx$|^src/app/products(/.*)?/page\\.tsx$|^src/app/public/dart(/.*)?/page\\.tsx$|^src/app/settings(/.*)?/page\\.tsx$|^src/app/benefits/page\\.tsx$|^src/app/compare/page\\.tsx$|^src/app/gov24/page\\.tsx$|^src/app/help/page\\.tsx$|^src/app/housing/.*/page\\.tsx$|^src/app/invest/companies/page\\.tsx$|^src/app/feedback(/.*)?/page\\.tsx$|^src/app/tools/fx/page\\.tsx$)'`
- `git diff --check -- analysis_docs/v2/11_post_phase3_vnext_backlog.md analysis_docs/v2/16_public_stable_ux_polish_backlog.md`
- 미실행 검증
- 사용자 지시로 `pnpm build`, `pnpm test`, `pnpm lint`, `pnpm e2e:rc`는 실행하지 않았다.

## 남은 리스크

- `N5`는 backlog 기준만 잠근 상태라, 실제 구현 라운드에서는 어느 stable surface를 먼저 고를지 별도 우선순위 판단이 필요하다.
- 일부 polish 후보는 copy만 손보면 끝나지 않고 helper 위치나 CTA handoff 조정이 함께 필요할 수 있어, 구현 라운드에서는 scope가 넓어지지 않도록 배치 쪼개기가 중요하다.
- 현재 워크트리에는 이전 `N4` 문서 변경과 `.codex/agents/*` dirty 상태가 남아 있으므로, 후속 라운드에서 commit 범위를 더 엄격히 구분해야 한다.
