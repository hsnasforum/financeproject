# 2026-03-23 N4 visibility policy overlay alignment audit

## 변경 파일
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `analysis_docs/v2/15_planning_v3_beta_exposure_visibility_policy.md`
- `work/3/23/2026-03-23-n4-visibility-policy-overlay-alignment-audit.md`

## 사용 skill
- `planning-gate-selector`: docs-only sync/audit round로 분류해 지정된 `git diff --check -- ...`만 실행 검증으로 선택하고, `pnpm test`, `pnpm build`, `pnpm lint`, `pnpm e2e:rc`, `pnpm planning:current-screens:guard`는 미실행으로 남겼다.
- `route-ssot-check`: `docs/current-screens.md`의 current route inventory와 `analysis_docs/v2/15...` overlay policy가 실제 page surface 및 `N3` gate matrix와 충돌하지 않는지 비교하는 데 사용했다.
- `work-log-closeout`: 이번 N4 docs-only alignment audit의 문서 보정 범위, 실제 실행 검증, 남은 리스크를 저장소 표준 `/work` 형식으로 정리하는 데 사용했다.

## 변경 이유
- `analysis_docs/v2/15...`는 next-cycle visibility overlay 문서지만, current route SSOT와 `N3` gate matrix 위에서 읽을 때 일부 route group은 alignment를 더 또렷하게 적어 두는 편이 안전했다.
- 이번 라운드는 route 구현 변경이나 실제 노출 정책 적용이 아니라, `15` 문서가 `docs/current-screens.md`와 `14` 문서 위에서 일관되게 읽히는지 audit하고 필요한 wording sync만 남기는 것이 목적이었다.

## 핵심 변경
- `analysis_docs/v2/15...`에 overlay alignment audit memo를 추가해, `/planning/v3/transactions` redirect alias, `balances`/`profile/drafts`/`transactions/batches` entry 후보, `batches*`/`import/csv`/`exposure` internal 분류는 current `N2`/`N3` 기준과 대체로 맞는다고 적었다.
- 같은 메모에서 `/planning/v3/news*`, `/planning/v3/journal`, 그리고 `/planning/v3/batches` vs `/planning/v3/transactions/batches`는 current-screens의 broad `Public Beta` inventory와 next-cycle overlay를 함께 읽어야 하는 wording drift `[검증 필요]` subset으로 분리했다.
- `analysis_docs/v2/11...` N4 연결 메모도 같은 기준으로 맞춰, overlay가 대체로 정합하지만 residual wording gap은 좁은 sync/audit 대상으로만 남긴다고 적었다.

## 검증
- `git diff --check -- analysis_docs/v2/11_post_phase3_vnext_backlog.md analysis_docs/v2/15_planning_v3_beta_exposure_visibility_policy.md work/3/23/2026-03-23-n4-visibility-policy-overlay-alignment-audit.md`
  - PASS
- 미실행 검증:
- `pnpm test`
- `pnpm build`
- `pnpm lint`
- `pnpm e2e:rc`
- `pnpm planning:current-screens:guard`

## 남은 리스크
- current alignment conclusion은 route inventory와 overlay policy가 완전히 동일하다는 뜻이 아니라, “next-cycle overlay로 읽을 때 큰 충돌은 없고 일부 wording drift만 남는다”는 뜻이다.
- `news/*`, `journal`, `batches` vs `transactions/batches`는 actual route 존재와 current Public Beta inventory 때문에 future implementation round에서 잘못 읽히기 쉬운 부분이라, 구현 전 다시 확인이 필요하다. [검증 필요]
- 이번 audit만으로 nav/홈/헤더 노출 변경, beta 승격, production exposure 정책 적용 안전성이 생기지는 않는다.
