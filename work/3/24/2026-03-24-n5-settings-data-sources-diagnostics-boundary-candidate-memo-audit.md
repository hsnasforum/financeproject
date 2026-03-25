# 2026-03-24 n5-settings-data-sources-diagnostics-boundary-candidate-memo-audit

## 변경 파일
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`
- `work/3/24/2026-03-24-n5-settings-data-sources-diagnostics-boundary-candidate-memo-audit.md`

## 사용 skill
- `planning-gate-selector`: docs-only candidate audit 라운드에 맞춰 지정된 `git diff --check -- ...`만 실행하고 나머지 검증은 미실행으로 남겼다.
- `route-ssot-check`: `docs/current-screens.md`와 `/settings/data-sources` 관련 코드 경로를 대조해 route/href contract와 `Public Stable` inventory 변경이 없음을 확인했다.
- `dart-data-source-hardening`: production diagnostics 비노출, dev-only raw diagnostics, recent ping/build affordance, health/error fallback 노출 경계를 점검해 user trust helper와 operator diagnostics를 섞지 않도록 메모를 좁혔다.
- `work-log-closeout`: diagnostics-boundary role map, defer 목록, 다음 narrow cut 권고를 `/work` 형식으로 남겼다.

## 변경 이유
- `/settings/data-sources`의 trust/freshness helper는 이미 landing했고, 남은 작은 축은 `확장 후보`와 `상세 운영 진단` 사이의 diagnostics boundary다.
- 이번 라운드는 구현이 아니라 production read-only 제한 안내와 dev-only diagnostics disclosure를 어떤 경계로 읽어야 하는지 먼저 고정해, broad diagnostics rewrite로 번지지 않도록 하기 위한 docs-first audit이다.

## 핵심 변경
- backlog에 diagnostics-boundary candidate memo를 추가해 `확장 후보`를 support/follow-through layer, `상세 운영 진단`을 dev/ops-only diagnostics boundary layer로 정리했다.
- production diagnostics 제한 카드는 user-facing trust helper의 실패 안내가 아니라 dev-only disclosure boundary helper라고 명시했고, raw health/error/ping/build detail은 user-facing helper와 같은 층위로 읽으면 안 된다는 점을 적었다.
- next smallest candidate를 broad diagnostics rewrite가 아니라 `/settings/data-sources` diagnostics-boundary copy/helper spike로 좁히고, `DataSourceHealthTable` 구조·health policy·ping/build semantics·env/operator flow 재설계는 비범위로 남겼다.

## 검증
- 실행: `git diff --check -- analysis_docs/v2/11_post_phase3_vnext_backlog.md analysis_docs/v2/16_public_stable_ux_polish_backlog.md work/3/24/2026-03-24-n5-settings-data-sources-diagnostics-boundary-candidate-memo-audit.md`
- 미실행: `pnpm test`
- 미실행: `pnpm lint`
- 미실행: `pnpm build`
- 미실행: `pnpm e2e:rc`
- 미실행: `pnpm planning:current-screens:guard`

## 남은 리스크
- `DataSourceHealthTable` 안의 `사용자 도움 기준 요약`은 dev API 집계 정보를 다루지만 용어상 user-facing helper의 연장처럼 읽힐 수 있어, 다음 라운드에서 wording을 넓게 건드리면 diagnostics schema와 operator workflow까지 다시 열릴 수 있다. [검증 필요]
- `OpenDartStatusCard`의 build/status 영역과 `DataSourceStatusCard`의 recent ping/dev details는 diagnostics boundary 인접 surface라서, section-level helper를 넘어 component wording까지 함께 열면 ping/build semantics와 env/operator disclosure contract를 다시 흔들 수 있다.
