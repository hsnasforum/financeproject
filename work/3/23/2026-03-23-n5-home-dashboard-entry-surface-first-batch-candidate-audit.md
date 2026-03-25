# 2026-03-23 N5 home-dashboard entry surface first-batch candidate audit

## 변경 파일
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `work/3/23/2026-03-23-n5-home-dashboard-entry-surface-first-batch-candidate-audit.md`

## 사용 skill
- `planning-gate-selector`: docs-only audit 라운드라 `git diff --check -- ...`만 최소 검증으로 유지했다.
- `route-ssot-check`: `docs/current-screens.md`, `src/app/page.tsx`, `src/app/dashboard/page.tsx`를 대조해 `/`와 `/dashboard`의 current stable IA 역할을 확인했다.
- `work-log-closeout`: 이번 audit 결론, 검증, 남은 리스크를 `/work` 표준 형식으로 정리했다.

## 변경 이유
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`의 `4.1 시작점 / 진입 surface`를 실제 current stable IA와 page 역할 기준으로 더 좁혀, 첫 `N5` batch를 `/` 단독, `/dashboard` 단독, pair 중 어디까지로 잡는 것이 가장 작은지 판단할 필요가 있었다.

## 핵심 변경
- `docs/current-screens.md` 기준 current stable IA는 `/`를 "핵심 바로가기만 제공하는 홈", `/dashboard`를 "메인 진입점"으로 구분하고 있음을 확인했다.
- 실제 구현 기준으로 `/`는 `HomeHero`, `QuickTiles`, `TodayQueue`, `HomeStatusStrip`, `ServiceLinks`, `HomePortalClient`를 조합한 broad portal surface이고, `/dashboard`는 `DashboardClient`로 recent run/action hub와 quick-link host를 묶는 main workspace entry를 제공한다는 점을 확인했다.
- `analysis_docs/v2/16...`에는 first-batch viable candidate를 `/dashboard` 단독 host surface로 추가했다. hero 문구, recent-run follow-through, quick-link helper를 trust/helper/copy/CTA polish만으로 좁게 다듬을 수 있고 stable IA/nav 재편 없이 닫을 여지가 크다고 봤다.
- `/` 단독과 `/ + /dashboard` pair는 `[검증 필요]` broad-scope risk로 남겼다. 홈은 CTA와 helper가 여러 레이어에 걸쳐 중복돼 작은 문구 조정도 home IA 우선순위 변경으로 읽힐 수 있고, pair는 stable entry hierarchy 재조정으로 곧바로 커질 가능성이 크다.
- `analysis_docs/v2/11...` backlog 메모를 같은 상태로 동기화해 next `N5` 구현 라운드가 열리더라도 broad home/dashboard overhaul보다 `/dashboard` single-surface batch가 더 작은 후속 컷이라고 남겼다.

## 검증
- 실행:
  - `git diff --check -- analysis_docs/v2/11_post_phase3_vnext_backlog.md analysis_docs/v2/16_public_stable_ux_polish_backlog.md work/3/23/2026-03-23-n5-home-dashboard-entry-surface-first-batch-candidate-audit.md`
- 미실행:
  - `pnpm test`
  - `pnpm build`
  - `pnpm lint`
  - `pnpm e2e:rc`
  - `pnpm planning:current-screens:guard`

## 남은 리스크
- 이번 라운드는 candidate boundary만 잠갔으므로, 실제 `/dashboard` polish 구현이 quick-link 재배열이나 홈 진입 hierarchy 변경으로 커지면 `N5` small-batch 범위를 다시 벗어날 수 있다.
- `/`는 hero, quick entry, service links, recent-run portal이 함께 있어 작은 copy/helper 조정도 home IA 우선순위 조정으로 해석될 수 있으므로 첫 배치 후보로는 계속 조심해야 한다.
