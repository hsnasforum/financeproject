# 2026-03-25 n5-settings-data-sources-opendartstatuscard-api-key-badge-primary-summary-ownership-copy-helper-polish-spike

## 변경 파일
- `src/components/OpenDartStatusCard.tsx`
- `work/3/25/2026-03-25-n5-settings-data-sources-opendartstatuscard-api-key-badge-primary-summary-ownership-copy-helper-polish-spike.md`

## 사용 skill
- `planning-gate-selector`: copy/helper 단일 표면 스파이크로 분류해 `pnpm lint`, `pnpm build`, 지정된 `git diff --check -- ...`만 실행했다.
- `route-ssot-check`: `docs/current-screens.md`와 `src/app/settings/data-sources/page.tsx`를 대조해 `/settings/data-sources` route/href contract 변경이 없음을 다시 확인했다.
- `dart-data-source-hardening`: API key quick-status chip과 primary summary의 읽는 층위만 더 또렷하게 정리하고, `configured` semantics나 env/operator disclosure contract는 다시 열지 않았다.
- `work-log-closeout`: 이번 copy/helper polish spike의 실제 landed 범위, 실행 검증, 미실행 검증, 잔여 리스크를 `/work` 형식으로 정리했다.

## 변경 이유
- candidate memo audit에서 우측 badge는 configured 여부를 빠르게 보여 주는 status chip, 좌측 `사용자에게 먼저 보이는 기준`은 같은 signal을 사용자 흐름 관점에서 풀어 쓰는 primary summary로 읽어야 한다고 정리했다.
- 이번 작업은 `configured` semantics나 `userSummary()` 분기 재설계가 아니라, badge의 quick-status tone과 primary summary의 user-flow explanation tone만 더 또렷하게 만드는 single-surface spike다.

## 핵심 변경
- badge 아래에 짧은 helper를 추가해 이 영역이 API 키 설정 여부만 빠르게 보여 주는 quick-status chip이라는 점을 분명히 했다.
- `사용자에게 먼저 보이는 기준` card 안에 짧은 helper를 추가해 위 상태 표시를 먼저 보고 아래 문장으로 사용자 흐름 의미를 읽는 순서를 더 또렷하게 만들었다.
- `configuredLabel`과 `userSummary()` 분기, badge 색상/배치/크기, loading/error/empty fallback, missing-index warning, details disclosure 구조는 건드리지 않았다.
- 구현 범위가 current memo와 같아 `analysis_docs/v2/11_post_phase3_vnext_backlog.md`, `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`는 수정하지 않았다.

## 검증
- 실행: `pnpm lint`
- 실행: `pnpm build`
- 실행: `git diff --check -- src/components/OpenDartStatusCard.tsx analysis_docs/v2/11_post_phase3_vnext_backlog.md analysis_docs/v2/16_public_stable_ux_polish_backlog.md work/3/25/2026-03-25-n5-settings-data-sources-opendartstatuscard-api-key-badge-primary-summary-ownership-copy-helper-polish-spike.md`
- 참고: `pnpm lint`는 이번 변경과 무관한 기존 `@typescript-eslint/no-unused-vars` 경고 30건만 보고했다.
- 미실행: `pnpm test`
- 미실행: `pnpm e2e:rc`
- 미실행: `pnpm planning:current-screens:guard`

## 남은 리스크
- badge와 primary summary wording은 정리됐지만, `configured` boolean semantics나 `userSummary()` 분기 의미를 같이 바꾸기 시작하면 copy/helper 범위를 넘어 env/config trust contract 논의로 커질 수 있다. [검증 필요]
- badge와 summary의 구조/배치까지 같이 다시 열면 단순 helper ownership이 아니라 상단 summary layout 조정으로 번질 수 있다. [검증 필요]
- 상단 badge/summary, 하단 read-through/fallback, missing-index helper, dev-only disclosure, build result helper를 한꺼번에 다시 열면 broad OpenDART card rewrite로 번질 수 있다. [검증 필요]
