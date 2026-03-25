# 2026-03-24 n5-recommend-planning-linkage-strip-candidate-memo-audit

## 변경 파일
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`
- `work/3/24/2026-03-24-n5-recommend-planning-linkage-strip-candidate-memo-audit.md`

## 사용 skill
- `planning-gate-selector`: docs-only audit 라운드로 분류하고 `git diff --check`만 실행했으며, `pnpm test`, `pnpm lint`, `pnpm build`, `pnpm e2e:rc`, `pnpm planning:current-screens:guard`는 미실행 검증으로 남겼다.
- `route-ssot-check`: `/recommend`, `/recommend/history`, `docs/current-screens.md`를 대조해 이번 라운드에서 route contract, href, stable/public IA 변경이 없음을 확인했다.
- `work-log-closeout`: 오늘 recommend host-surface 관련 최신 메모를 잇는 형식으로 이번 planning-linkage strip docs-first candidate audit 결과를 `/work` note로 정리했다.

## 변경 이유
- `/recommend` host surface에서 result-header 다음으로 남은 작은 후속 축인 `플래닝 연동` strip을 어떤 배치로 자를지 먼저 고정할 필요가 있었다.
- 이번 라운드는 구현이 아니라 docs-only audit이므로, title/description/chip helper의 현재 읽기 위계와 broad-scope risk만 분리해 기록했다.

## 핵심 변경
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`에 `recommend planning-linkage strip candidate memo`를 추가해 title/description의 primary helper 역할과 `연결된 액션`/`단계` 대비 `연결 방식`/`실행 상태`/`플래닝 실행 ID`의 support/provenance 성격을 구분했다.
- 같은 메모에서 user-facing planning context helper와 support/debug 성격 정보가 current strip에서 같은 badge weight로 섞여 읽힐 수 있다는 점을 기록했다.
- 다음 smallest viable candidate를 planning-linkage strip copy/helper polish spike로 좁히고, planning linkage/store flow 재설계, inference semantics 변경, chip 표시 조건 변경은 broad-scope risk 또는 비범위로 못 박았다.
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`에는 위 결과를 후속 `N5` candidate memo audit 연결 메모로 짧게 sync했다.

## 검증
- 실행: `git diff --check -- analysis_docs/v2/11_post_phase3_vnext_backlog.md analysis_docs/v2/16_public_stable_ux_polish_backlog.md work/3/24/2026-03-24-n5-recommend-planning-linkage-strip-candidate-memo-audit.md`
  - 통과.
- 미실행 검증: `pnpm test`
- 미실행 검증: `pnpm lint`
- 미실행 검증: `pnpm build`
- 미실행 검증: `pnpm e2e:rc`
- 미실행 검증: `pnpm planning:current-screens:guard`

## 남은 리스크
- current `플래닝 연동` strip은 chip 표시 조건과 wording이 code helper (`buildPlanningContextStrip`)에 묶여 있어, 실제로 badge 우선순위나 노출 조건을 바꾸려면 docs-only 범위를 넘어 inference/provenance contract를 함께 건드릴 수 있다.
- 이번 audit은 strip만 좁힌 것이므로, result header 이후의 카드 helper, compare/store semantics, planning-linked action follow-through는 여전히 별도 cut 없이는 정리되지 않는다.
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`는 현재 워크트리 기준으로 untracked 상태라, 이번 라운드는 그 파일 안의 recommend section만 docs-first로 보강했다.
