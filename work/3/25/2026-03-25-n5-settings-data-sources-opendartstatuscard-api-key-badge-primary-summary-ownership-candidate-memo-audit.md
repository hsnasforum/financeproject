# 2026-03-25 n5-settings-data-sources-opendartstatuscard-api-key-badge-primary-summary-ownership-candidate-memo-audit

## 변경 파일
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`
- `work/3/25/2026-03-25-n5-settings-data-sources-opendartstatuscard-api-key-badge-primary-summary-ownership-candidate-memo-audit.md`

## 사용 skill
- `planning-gate-selector`: docs-only candidate audit 라운드로 분류해 지정된 `git diff --check -- ...`만 실행하고 나머지 검증은 미실행으로 남겼다.
- `route-ssot-check`: `docs/current-screens.md`와 `src/app/settings/data-sources/page.tsx`를 대조해 `/settings/data-sources` route/href contract와 `Public Stable` inventory 변경이 없음을 다시 확인했다.
- `dart-data-source-hardening`: API 키 badge와 primary summary가 같은 configured 근거를 어떤 층위로 나눠 읽혀야 하는지만 좁히고, `configured` semantics나 env/operator disclosure contract는 다시 열지 않았다.
- `work-log-closeout`: 이번 candidate memo audit의 role map, 다음 좁은 컷 권고, 실행 검증, 남은 리스크를 표준 `/work` 형식으로 정리했다.

## 변경 이유
- loading/error/empty fallback spike가 닫힌 뒤 현재 next smallest candidate로 남은 것은 `OpenDartStatusCard` 상단의 `API 키 연결됨/설정 필요` badge와 `사용자에게 먼저 보이는 기준` summary가 같은 configured signal을 어떻게 나눠 읽혀야 하는지였다.
- 이번 라운드는 구현 spike가 아니라, badge signal과 primary summary ownership을 docs-first로 먼저 좁혀 broad OpenDART card rewrite나 `configured` semantics 재정의로 번지지 않게 하기 위한 candidate memo audit이다.

## 핵심 변경
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`에 API-key badge-primary-summary role map을 추가해 badge는 summary-adjacent status chip, primary summary는 same signal의 user-flow explanation으로 정리했다.
- 같은 메모에서 둘이 같은 근거를 공유하지만 완전한 중복은 아니며, badge는 quick-status scan, primary summary는 사용자 흐름 설명이라는 서로 다른 읽는 층위를 가진다고 명시했다.
- current smallest viable next candidate를 `/settings/data-sources` `OpenDartStatusCard` API-key badge-primary-summary ownership copy/helper spike로 좁혔다.
- `configured` boolean semantics, `userSummary()` 분기, env/operator disclosure contract, badge 구조/배치, build/button/disclosure 구조, route/href contract는 비범위로 남겼다.
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`에는 같은 판단을 짧게 sync해 current next `N5` cut이 narrow API-key badge-primary-summary ownership copy/helper spike라는 점만 남겼다.

## 검증
- 실행: `git diff --check -- analysis_docs/v2/11_post_phase3_vnext_backlog.md analysis_docs/v2/16_public_stable_ux_polish_backlog.md work/3/25/2026-03-25-n5-settings-data-sources-opendartstatuscard-api-key-badge-primary-summary-ownership-candidate-memo-audit.md`
- 미실행: `pnpm test`
- 미실행: `pnpm lint`
- 미실행: `pnpm build`
- 미실행: `pnpm e2e:rc`
- 미실행: `pnpm planning:current-screens:guard`

## 남은 리스크
- badge와 primary summary ownership은 current component reading을 바탕으로 한 docs-first 권고라서, 실제 구현 전에는 한 번 더 좁은 copy/helper spike로만 확인하는 편이 안전하다. [검증 필요]
- `configured` boolean semantics나 `userSummary()` 분기 의미를 같이 손대기 시작하면, 단순 helper ownership이 아니라 env/config trust contract 논의로 커질 수 있다. [검증 필요]
- 상단 badge/summary, 하단 read-through/fallback, missing-index helper, dev-only disclosure, build result helper를 한 배치로 다시 열면 broad OpenDART card rewrite로 번질 수 있다. [검증 필요]
