# 2026-03-24 n5-recommend-host-surface-pre-result-entry-hierarchy-copy-helper-polish-spike

## 변경 파일
- `src/app/recommend/page.tsx`
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`
- `work/3/24/2026-03-24-n5-recommend-host-surface-pre-result-entry-hierarchy-copy-helper-polish-spike.md`

## 사용 skill
- `planning-gate-selector`: `/recommend` page copy/helper + docs sync 라운드에 맞춰 `pnpm lint`, `pnpm build`, `git diff --check`만 실행하고 `pnpm test`, `pnpm e2e:rc`, `pnpm planning:current-screens:guard`는 미실행 검증으로 남겼다.
- `route-ssot-check`: `/recommend`와 `/recommend/history` 실존 route, `docs/current-screens.md`의 `Public Stable` contract, href/current-screens 미변경 상태를 확인했다.
- `work-log-closeout`: 오늘 recommend 관련 최신 메모를 잇는 형식으로 이번 spike 변경과 검증 결과를 closeout note로 정리했다.

## 변경 이유
- `/recommend` host surface 안에서 pre-result entry hierarchy copy/helper만 가장 작게 구현해야 했고, result 이후 follow-through/support layer는 다시 열지 않아야 했다.
- 그래서 `비교 후보 보기`를 primary entry CTA로 유지하면서 `가중치 설정`을 secondary config/helper action으로 읽히게 만드는 문구만 좁게 조정했다.

## 핵심 변경
- `PageHeader` description과 상단 helper에서 이 화면이 현재 조건 기준 비교 단계라는 점과 `비교 후보 보기 → 가중치 설정`의 읽기 순서를 먼저 보이게 정리했다.
- summary card 제목을 `비교 시작 요약`으로 바꾸고, `비교 후보 보기`를 먼저 누른 뒤 필요할 때만 `가중치 설정`을 여는 entry helper 문구를 추가했다.
- loading 상태 문구를 `후보 정리 중`으로 좁히고, 가중치 패널 상단에 secondary config/helper 성격을 설명하는 안내를 넣었다.
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`와 `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`에는 이번 spike가 landing했고 비범위 경계는 그대로라는 sync 메모만 짧게 추가했다.

## 검증
- 실행: `pnpm lint`
  - 통과. 기존 저장소 경고 30건만 출력됐고 오류는 없었다.
- 실행: `pnpm build`
  - 통과.
- 실행: `git diff --check -- src/app/recommend/page.tsx analysis_docs/v2/11_post_phase3_vnext_backlog.md analysis_docs/v2/16_public_stable_ux_polish_backlog.md work/3/24/2026-03-24-n5-recommend-host-surface-pre-result-entry-hierarchy-copy-helper-polish-spike.md`
  - 통과.
- 미실행 검증: `pnpm test`
- 미실행 검증: `pnpm e2e:rc`
- 미실행 검증: `pnpm planning:current-screens:guard`

## 남은 리스크
- `src/app/recommend/page.tsx`에는 이번 라운드 범위를 넘는 result-after copy 변경분이 같은 워크트리에 이미 남아 있다. 이번 spike는 pre-result 구간만 추가로 조정했다.
- result 이후 `결과 저장`/`JSON`/`CSV`, `플래닝 연동`, trust cue, `비교 담기`, `상세 분석` 층위는 그대로라서 host surface 전체 위계는 후속 별도 cut 없이는 닫히지 않는다.
- route/href/current-screens 변경은 없었지만, stable user flow와 selector 회귀는 `pnpm e2e:rc`를 돌리기 전까지 미검증이다.
