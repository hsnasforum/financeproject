# 2026-03-24 n5-settings-data-sources-datasourcehealthtable-operator-read-only-meta-boundary-candidate-memo-audit

## 변경 파일
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`
- `work/3/24/2026-03-24-n5-settings-data-sources-datasourcehealthtable-operator-read-only-meta-boundary-candidate-memo-audit.md`

## 사용 skill
- `planning-gate-selector`: docs-only candidate audit 라운드에 맞춰 지정된 `git diff --check -- ...`만 실행하고 나머지 검증은 미실행으로 남겼다.
- `route-ssot-check`: `docs/current-screens.md`와 `/settings/data-sources` 관련 코드 경로를 대조해 route/href contract와 `Public Stable` inventory 변경이 없음을 확인했다.
- `dart-data-source-hardening`: `DataSourceHealthTable`의 raw health row, read-only meta, recent error log가 user-facing trust helper와 섞이지 않는지 다시 점검하고, diagnostics schema/ping-build semantics는 비범위로 고정했다.
- `work-log-closeout`: `DataSourceHealthTable` role map, defer 목록, 다음 narrow cut 권고를 `/work` 형식으로 남겼다.

## 변경 이유
- `/settings/data-sources` diagnostics-boundary spike 이후에도 `DataSourceHealthTable` 안의 `사용자 도움 기준 요약`이 user-facing helper의 연장처럼 읽힐 여지가 남아 있다.
- 이번 라운드는 구현이 아니라 `Fallback & 쿨다운 진단`, `사용자 도움 기준 요약`, `최근 오류 로그`의 층위를 먼저 고정해 broad diagnostics table rewrite로 번지지 않도록 하기 위한 docs-first audit이다.

## 핵심 변경
- backlog에 `DataSourceHealthTable` operator/read-only-meta boundary memo를 추가해 `Fallback & 쿨다운 진단`을 operator raw diagnostics, `사용자 도움 기준 요약`을 operator read-only-meta, `최근 오류 로그`를 raw incident log로 정리했다.
- `사용자 도움 기준 요약`은 Health API가 사용자 화면에 주입한 meta를 운영자가 다시 읽는 층위이지, user-facing canonical helper를 다시 제공하는 블록이 아니라는 점을 문서에 명시했다.
- next smallest candidate를 broad diagnostics table rewrite가 아니라 `/settings/data-sources` `DataSourceHealthTable` operator/read-only-meta boundary copy/helper spike로 좁혔다.
- `/api/dev/data-sources/health` schema, read-only meta 조합 기준, `/api/dev/errors/recent` column/trace flow, ping/build semantics, table/card 구조 변경은 비범위로 남겼다.

## 검증
- 실행: `git diff --check -- analysis_docs/v2/11_post_phase3_vnext_backlog.md analysis_docs/v2/16_public_stable_ux_polish_backlog.md work/3/24/2026-03-24-n5-settings-data-sources-datasourcehealthtable-operator-read-only-meta-boundary-candidate-memo-audit.md`
- 미실행: `pnpm test`
- 미실행: `pnpm lint`
- 미실행: `pnpm build`
- 미실행: `pnpm e2e:rc`
- 미실행: `pnpm planning:current-screens:guard`

## 남은 리스크
- `사용자 도움 기준 요약`은 제목 자체가 user-facing helper처럼 들릴 수 있어, 다음 라운드에서 wording을 조금만 바꿔도 read-only meta와 canonical user helper 경계가 다시 흐려질 수 있다. [검증 필요]
- `Fallback & 쿨다운 진단`, `최근 오류 로그`는 raw operator diagnostics이지만 `/api/dev/data-sources/health`, `/api/dev/errors/recent`, trace copy flow와 직결돼 있어, broad rewrite로 들어가면 diagnostics schema와 operator workflow까지 함께 흔들릴 수 있다.
