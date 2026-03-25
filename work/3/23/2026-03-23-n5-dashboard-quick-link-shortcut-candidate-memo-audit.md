# 2026-03-23 N5 dashboard quick-link shortcut candidate memo audit

## 변경 파일
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `work/3/23/2026-03-23-n5-dashboard-quick-link-shortcut-candidate-memo-audit.md`

## 사용 skill
- `planning-gate-selector`: docs-only audit 라운드라 `git diff --check -- ...`만 최소 검증으로 유지했다.
- `work-log-closeout`: quick-link block hierarchy 결론, 미실행 검증, 다음 후보를 `/work` 표준 형식으로 정리했다.

## 변경 이유
- `/dashboard`의 다음 smallest candidate로 좁혀진 `바로 이동` block을 실제 구현 전에 더 좁혀, stable surface shortcut 묶음을 primary CTA가 아닌 tertiary quick-link layer로 문서 기준에서 고정해야 했다.

## 핵심 변경
- `analysis_docs/v2/16...`에 `quick-link shortcut candidate memo`를 추가해 `바로 이동` block을 stable surface catalog shortcut 묶음으로 정리하고, `플래닝`, `리포트`, `추천 허브`, `상품 탐색`, `공시 탐색`을 entry CTA가 아닌 quick-link card로 읽는다고 명시했다.
- section description과 카드 description은 hero/recent-plan/action-candidate보다 낮은 우선순위의 shortcut helper로만 읽고, shortcut route 추가/삭제나 우선순위 재편은 비범위라고 적었다.
- 다음 smallest candidate를 `바로 이동` block 내부 quick-link copy/helper polish spike로 좁히고, section description과 각 카드 helper 문구 정도만 후속 구현 후보로 남겼다.
- `analysis_docs/v2/11...` backlog 메모도 같은 상태로 동기화해 shortcut 재배치나 dashboard IA 변경보다 `바로 이동` block 내부 quick-link polish가 더 작은 후속 배치라고 남겼다.

## 검증
- 실행:
  - `git diff --check -- analysis_docs/v2/11_post_phase3_vnext_backlog.md analysis_docs/v2/16_public_stable_ux_polish_backlog.md work/3/23/2026-03-23-n5-dashboard-quick-link-shortcut-candidate-memo-audit.md`
- 미실행:
  - `pnpm test`
  - `pnpm build`
  - `pnpm lint`
  - `pnpm e2e:rc`
  - `pnpm planning:current-screens:guard`

## 남은 리스크
- 이번 라운드는 quick-link candidate memo만 다뤘으므로, 실제 후속 구현에서 shortcut 재배치나 카드 우선순위 변경까지 함께 열리면 다시 broad dashboard overhaul로 번질 수 있다.
- `바로 이동` block은 stable/public surface shortcut 묶음이므로, 후속 구현에서도 route 추가/삭제나 stable/beta/internal 재분류를 섞지 않도록 경계를 유지해야 한다.
