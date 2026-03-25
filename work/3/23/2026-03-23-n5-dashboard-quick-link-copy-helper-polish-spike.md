# 2026-03-23 dashboard quick-link copy-helper polish spike

## 변경 파일
- `src/components/DashboardClient.tsx`
- `work/3/23/2026-03-23-n5-dashboard-quick-link-copy-helper-polish-spike.md`

## 사용 skill
- `planning-gate-selector`: copy/helper-only dashboard 변경에 맞는 최소 검증 세트를 유지했다.
- `work-log-closeout`: `/work` 종료 기록 형식과 실행 사실을 맞춰 남겼다.

## 변경 이유
- `/dashboard`의 `바로 이동` block이 primary CTA처럼 읽히지 않고 tertiary quick-link shortcut 묶음으로 읽히게 문구를 더 또렷하게 맞출 필요가 있었다.
- hero, `최근 플랜`, `플랜 액션과 비교 후보`를 다시 열지 않고 section/card description만 좁게 다루는 single-surface spike가 목적이었다.

## 핵심 변경
- `바로 이동` section description을 `필요한 화면을 빠르게 여는 바로가기 모음`으로 조정했다.
- `플래닝`, `리포트`, `추천 허브`, `상품 탐색`, `공시 탐색` 카드 설명을 각 화면을 빠르게 여는 shortcut/helper 톤으로 통일했다.
- href, 카드 순서, block 순서, hero/다른 dashboard section 구조는 변경하지 않았다.

## 검증
- `pnpm lint` — PASS, 변경과 무관한 기존 warning 30건 유지
- `pnpm build` — PASS
- `git diff --check -- src/components/DashboardClient.tsx analysis_docs/v2/11_post_phase3_vnext_backlog.md analysis_docs/v2/16_public_stable_ux_polish_backlog.md work/3/23/2026-03-23-n5-dashboard-quick-link-copy-helper-polish-spike.md` — PASS

## 남은 리스크
- quick-link 층위는 아직 카드의 시각 스타일과 현재 block 배치에도 일부 의존한다.
- 이후 라운드에서 shortcut 재배치나 카드 우선순위 변경까지 열리면 이번 copy/helper polish 범위를 넘어 broad dashboard IA 변경으로 커질 수 있다.
- 미실행 검증: `pnpm test`, `pnpm e2e:rc`, `pnpm planning:current-screens:guard`
