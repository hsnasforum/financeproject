# 2026-03-24 recommend history follow-through candidate memo audit

## 변경 파일
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`
- `work/3/24/2026-03-24-n5-recommend-history-follow-through-candidate-memo-audit.md`

## 사용 skill
- `planning-gate-selector`: docs-only candidate audit 라운드에 맞춰 `git diff --check`만 실행했다.
- `route-ssot-check`: `/recommend/history`가 `docs/current-screens.md`의 `Public Stable` route로 유지되고, 이번 라운드에 route contract 변경이 없음을 확인했다.
- `work-log-closeout`: history-surface role map, 다음 후보, 보류 범위, 미실행 검증을 `/work` 종료 기록으로 남겼다.

## 변경 이유
- recommend cluster 안의 smallest viable next candidate로 좁힌 `/recommend/history`를 list/history-level action, detail/follow-through, support helper/analysis layer 기준으로 한 번 더 좁힐 필요가 있었다.
- compare/store/planning linkage를 건드리지 않고 copy/helper만 다룰 수 있는 경계가 없으면 다음 라운드가 broad recommend flow 조정으로 쉽게 커질 수 있었다.

## 핵심 변경
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`에 `/recommend/history` history/follow-through role map과 smallest viable next candidate를 추가했다.
- `새 추천 비교 열기`를 list-level 보조 action, row `상세 열기`/selection과 active run의 `상위 N개 비교 후보 담기`·`저장 당시 플래닝 보기`를 detail/follow-through layer, `공유·복구용 보조 정보`와 `실행 비교`를 support helper/analysis layer로 문서화했다.
- next cut recommendation을 broad implementation이 아니라 `/recommend/history` history/follow-through copy/helper polish spike로 좁혔다.
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`에도 같은 경계와 비범위 항목을 연결 메모로 반영했다.

## 검증
- `git diff --check -- analysis_docs/v2/11_post_phase3_vnext_backlog.md analysis_docs/v2/16_public_stable_ux_polish_backlog.md work/3/24/2026-03-24-n5-recommend-history-follow-through-candidate-memo-audit.md` — PASS

## 남은 리스크
- `/recommend/history`도 compare diff semantics, planning report deep-link, raw identifier helper가 한 화면에 함께 있어, 구현 spike로 바로 가면 범위가 커질 수 있다.
- `상위 N개 비교 후보 담기`, `저장 당시 플래닝 보기`, `공유·복구용 보조 정보`의 semantics를 바꾸는 일은 copy/helper 범위를 넘어 contract/flow 조정이 된다.
- 미실행 검증: `pnpm test`, `pnpm lint`, `pnpm build`, `pnpm e2e:rc`, `pnpm planning:current-screens:guard`
