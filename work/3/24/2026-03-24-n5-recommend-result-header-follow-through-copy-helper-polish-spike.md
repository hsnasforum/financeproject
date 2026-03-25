# 2026-03-24 n5-recommend-result-header-follow-through-copy-helper-polish-spike

## 변경 파일
- `src/app/recommend/page.tsx`
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`
- `work/3/24/2026-03-24-n5-recommend-result-header-follow-through-copy-helper-polish-spike.md`

## 사용 skill
- `planning-gate-selector`: `/recommend` page result-header copy/helper + docs sync 라운드에 맞춰 `pnpm lint`, `pnpm build`, `git diff --check`를 실행하고 `pnpm test`, `pnpm e2e:rc`, `pnpm planning:current-screens:guard`는 미실행 검증으로 남겼다.
- `route-ssot-check`: `/recommend`, `/recommend/history`, `docs/current-screens.md`를 대조해 이번 라운드에서 route contract, href, stable/public IA 변경이 없음을 확인했다.
- `work-log-closeout`: 오늘 recommend host-surface 관련 최신 메모를 잇는 형식으로 이번 result-header spike 변경과 검증 결과를 `/work` closeout으로 정리했다.

## 변경 이유
- `/recommend` host surface에서 pre-result 다음으로 가장 작은 후속 축인 result header follow-through layer를 copy/helper만으로 구현해야 했다.
- 그래서 `결과 저장`을 post-result primary follow-through로, `JSON`/`CSV`를 support export helper로 더 쉽게 읽히게 만드는 문구만 좁게 조정하고, button 동작이나 shared `feedback` ownership은 그대로 두었다.

## 핵심 변경
- `src/app/recommend/page.tsx` result header의 score disclaimer를 `비교 참고용` 톤으로 보강해 점수가 확정 우열이 아니라 현재 조건 기준 비교값이라는 점을 더 분명히 했다.
- 같은 header 안에 `결과 저장`은 나중에 다시 보기 위한 기록용이고 `JSON`/`CSV`는 필요할 때만 내려받는 보조 기능이라는 helper 문구를 추가했다.
- button 동작, shared `feedback` state ownership, button cluster 자체 순서, `플래닝 연동` strip, 결과 카드 trust cue/`비교 담기`/`상세 분석` semantics는 바꾸지 않았다.
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`와 `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`에는 이번 spike가 landing했고 비범위 경계는 그대로라는 sync 메모만 짧게 추가했다.

## 검증
- 실행: `pnpm lint`
  - 통과. 기존 저장소 경고 30건만 출력됐고 오류는 없었다.
- 실행: `pnpm build`
  - 통과.
- 실행: `git diff --check -- src/app/recommend/page.tsx analysis_docs/v2/11_post_phase3_vnext_backlog.md analysis_docs/v2/16_public_stable_ux_polish_backlog.md work/3/24/2026-03-24-n5-recommend-result-header-follow-through-copy-helper-polish-spike.md`
  - 통과.
- 미실행 검증: `pnpm test`
- 미실행 검증: `pnpm e2e:rc`
- 미실행 검증: `pnpm planning:current-screens:guard`

## 남은 리스크
- current `/recommend` header의 shared `feedback` slot은 `결과 저장`/`JSON`/`CSV`뿐 아니라 카드의 `비교 담기` 완료 메시지도 함께 보여 준다. ownership을 실제로 분리하려면 이번 narrow spike 범위를 넘어 state/UI 조정이 필요하다.
- result header helper는 정리됐지만 `플래닝 연동` strip과 결과 카드 follow-through/support layer는 여전히 별도 cut 없이는 정리되지 않는다.
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`는 현재 워크트리 기준으로 untracked 상태라, 이번 라운드는 그 파일 안의 recommend section만 추가 sync했다.
