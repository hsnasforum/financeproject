# 2026-03-24 n5-recommend-planning-linkage-strip-copy-helper-polish-spike

## 변경 파일
- `src/app/recommend/page.tsx`
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`
- `work/3/24/2026-03-24-n5-recommend-planning-linkage-strip-copy-helper-polish-spike.md`

## 사용 skill
- `planning-gate-selector`: `/recommend` page planning-linkage strip copy/helper + docs sync 라운드에 맞춰 `pnpm lint`, `pnpm build`, `git diff --check`를 실행하고 `pnpm test`, `pnpm e2e:rc`, `pnpm planning:current-screens:guard`는 미실행 검증으로 남겼다.
- `route-ssot-check`: `/recommend`, `/recommend/history`, `docs/current-screens.md`를 대조해 이번 라운드에서 route contract, href, stable/public IA 변경이 없음을 확인했다.
- `work-log-closeout`: 오늘 recommend host-surface 관련 최신 메모를 잇는 형식으로 이번 planning-linkage strip spike 변경과 검증 결과를 `/work` closeout으로 정리했다.

## 변경 이유
- `/recommend` host surface의 `플래닝 연동` strip 안에서 title/description과 chip helper 위계만 가장 작게 구현해야 했다.
- 그래서 title/description은 primary planning context helper로, `연결된 액션`/`현재 단계`는 user-facing context summary로, `연결 근거`/`실행 상태 참고`/`플래닝 실행 ID`는 support/provenance helper로 더 또렷하게 읽히는 문구만 좁게 조정했다.

## 핵심 변경
- `src/app/recommend/page.tsx`의 `buildPlanningContextStrip()` title/description을 `흐름`, `맥락`, `보조 정보` 톤으로 보강해 이 strip이 planning-linked recommend를 해석하는 helper surface라는 점을 더 분명히 했다.
- `formatInferenceSourceLabel()`을 `플래닝 요약 참고`, `이전 플래닝 입력 참고`로 다듬고, strip 안에 `연결 근거`·`실행 상태 참고`·`플래닝 실행 ID · 연결 확인용` 같은 support/provenance helper 문구를 추가했다.
- description 아래에 현재 맥락 정보와 support provenance 정보를 어떻게 읽을지 설명하는 짧은 helper를 넣어 chip 위계를 더 분명히 했다.
- chip 표시 조건, `planning-summary`/`planningContext` inference semantics, planning linkage/store flow, result header, 결과 카드 trust cue/`비교 담기`/`상세 분석` semantics는 바꾸지 않았다.
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`와 `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`에는 이번 spike가 landing했고 비범위 경계는 그대로라는 sync 메모만 짧게 추가했다.

## 검증
- 실행: `pnpm lint`
  - 통과. 기존 저장소 경고 30건만 출력됐고 오류는 없었다.
- 실행: `pnpm build`
  - 통과.
- 실행: `git diff --check -- src/app/recommend/page.tsx analysis_docs/v2/11_post_phase3_vnext_backlog.md analysis_docs/v2/16_public_stable_ux_polish_backlog.md work/3/24/2026-03-24-n5-recommend-planning-linkage-strip-copy-helper-polish-spike.md`
  - 통과.
- 미실행 검증: `pnpm test`
- 미실행 검증: `pnpm e2e:rc`
- 미실행 검증: `pnpm planning:current-screens:guard`

## 남은 리스크
- current `플래닝 연동` strip의 chip 표시 조건과 inference source 자체는 그대로라, provenance/support helper 문구가 더 분명해졌어도 표시 규칙을 바꾸려면 별도 flow/contract cut이 필요하다.
- result header와 결과 카드 layer는 이번 spike 범위 밖이라, planning-linked recommend 전체 위계는 후속 별도 cut 없이는 한 번에 닫히지 않는다.
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`는 현재 워크트리 기준으로 untracked 상태라, 이번 라운드는 그 파일 안의 recommend section만 추가 sync했다.
