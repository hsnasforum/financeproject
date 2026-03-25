# 2026-03-24 n5-recommend-host-surface-candidate-memo-audit

## 변경 파일
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`
- `work/3/24/2026-03-24-n5-recommend-host-surface-candidate-memo-audit.md`

## 사용 skill
- `planning-gate-selector`: docs-only audit 라운드에 맞춰 `git diff --check`만 실행하도록 검증 범위를 고정했다.
- `route-ssot-check`: `/recommend`, `/recommend/history`가 `docs/current-screens.md` 기준 `Public Stable` route contract를 유지하는지 확인했다.
- `work-log-closeout`: recommend host surface candidate memo 결과와 다음 컷을 `/work` closeout으로 정리했다.

## 변경 이유
- `/recommend/history` spike가 닫힌 뒤 다음 후보는 `/recommend` host surface지만, 이 화면은 조건 form, planning linkage, save/export, compare helper가 한 화면에 겹쳐 있어 바로 구현으로 가면 범위가 쉽게 커진다.
- 그래서 host surface 전체를 구현 대상으로 여는 대신, 어떤 sub-batch만 small-batch polish로 안전하게 자를 수 있는지 docs-first로 먼저 고정할 필요가 있었다.

## 핵심 변경
- `/recommend`를 pre-result entry layer와 post-result follow-through/support helper layer로 나눠 host surface 역할을 문서에 정리했다.
- 가장 작은 다음 후보를 broad host overhaul이 아니라 `PageHeader` description, 상단 helper, summary card entry helper tone, `비교 후보 보기`/`가중치 설정` 층위를 다루는 pre-result entry hierarchy copy/helper polish spike로 좁혔다.
- result header의 `결과 저장`/`JSON`/`CSV`, `플래닝 연동` strip, 결과 카드 trust cue/`비교 담기`, compare/store semantics, planning linkage/store flow는 계속 비범위로 못 박았다.

## 검증
- 실행: `git diff --check -- analysis_docs/v2/11_post_phase3_vnext_backlog.md analysis_docs/v2/16_public_stable_ux_polish_backlog.md work/3/24/2026-03-24-n5-recommend-host-surface-candidate-memo-audit.md`

## 남은 리스크
- `/recommend` host surface는 result 이후 follow-through가 많은 화면이라 pre-result helper만 건드려도 구현 라운드에서 post-result CTA까지 함께 손대고 싶은 유혹이 크다.
- planning linkage strip, 결과 카드 trust cue, save/export/compare semantics를 같이 열면 recommend flow 재설계로 커질 수 있다.
- 미실행 검증: `pnpm test`, `pnpm lint`, `pnpm build`, `pnpm e2e:rc`, `pnpm planning:current-screens:guard`
