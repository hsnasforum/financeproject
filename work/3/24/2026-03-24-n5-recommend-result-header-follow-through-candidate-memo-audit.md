# 2026-03-24 n5-recommend-result-header-follow-through-candidate-memo-audit

## 변경 파일
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`
- `work/3/24/2026-03-24-n5-recommend-result-header-follow-through-candidate-memo-audit.md`

## 사용 skill
- `planning-gate-selector`: docs-only audit 라운드로 분류하고 `git diff --check`만 실행했으며, `pnpm test`, `pnpm lint`, `pnpm build`, `pnpm e2e:rc`, `pnpm planning:current-screens:guard`는 미실행 검증으로 남겼다.
- `route-ssot-check`: `/recommend`, `/recommend/history`, `docs/current-screens.md`를 대조해 이번 라운드에서 route contract, href, stable/public IA 변경이 없음을 확인했다.
- `work-log-closeout`: 오늘 recommend host-surface 관련 최신 메모를 잇는 형식으로 이번 docs-first candidate audit 결과를 `/work` note로 정리했다.

## 변경 이유
- `/recommend` host surface의 pre-result entry spike 다음으로, result 이후 첫 줄에서 보이는 `추천 결과` header와 `결과 저장`/`JSON`/`CSV` 묶음을 어떤 작은 후속 배치로 자를지 먼저 고정할 필요가 있었다.
- 이번 라운드는 구현이 아니라 docs-first audit이므로, copy/helper로 좁게 다룰 수 있는 문제와 export/save semantics 재설계 없이는 건드리면 안 되는 문제를 구분하는 메모만 남겼다.

## 핵심 변경
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`에 `recommend result-header follow-through candidate memo`를 추가해 `추천 결과` title, score disclaimer, shared `feedback` message, `결과 저장`/`JSON`/`CSV`의 현재 읽기 위계를 정리했다.
- 같은 메모에서 `결과 저장`은 post-result primary follow-through, `JSON`/`CSV`는 support export helper로 읽는 것이 자연스럽다는 점과, current button cluster가 이를 같은 층위처럼 보이게 만들 수 있다는 혼선을 기록했다.
- shared `feedback` ownership 분리, save/export 구조 재배치, `플래닝 연동` strip, 결과 카드 trust cue/`비교 담기`/`상세 분석`, compare/store semantics는 broad-scope risk 또는 비범위로 못 박았다.
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`에는 위 결과를 후속 `N5` candidate memo audit 연결 메모로 짧게 sync했다.

## 검증
- 실행: `git diff --check -- analysis_docs/v2/11_post_phase3_vnext_backlog.md analysis_docs/v2/16_public_stable_ux_polish_backlog.md work/3/24/2026-03-24-n5-recommend-result-header-follow-through-candidate-memo-audit.md`
  - 통과.
- 미실행 검증: `pnpm test`
- 미실행 검증: `pnpm lint`
- 미실행 검증: `pnpm build`
- 미실행 검증: `pnpm e2e:rc`
- 미실행 검증: `pnpm planning:current-screens:guard`

## 남은 리스크
- current `/recommend` code의 header `feedback` slot은 save/export 전용이 아니라 카드의 `비교 담기` 완료 메시지도 함께 보여 준다. 이 ownership을 실제로 분리하려면 docs-only 범위를 넘어 state/UI 조정이 필요하다.
- 이번 audit은 result-header layer만 좁힌 것이므로, `플래닝 연동` strip과 결과 카드 follow-through/support layer는 여전히 별도 cut 없이는 정리되지 않는다.
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`는 아직 git tracked 파일이 아니라 현재 워크트리 기준으로는 untracked 상태다. 이번 라운드는 그 파일 안의 recommend section만 docs-first로 보강했다.
