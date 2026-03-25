# 2026-03-24 n5-settings-data-sources-diagnostics-boundary-copy-helper-polish-spike

## 변경 파일
- `src/app/settings/data-sources/page.tsx`
- `work/3/24/2026-03-24-n5-settings-data-sources-diagnostics-boundary-copy-helper-polish-spike.md`

## 사용 skill
- `planning-gate-selector`: page-level copy/helper spike에 맞춰 `pnpm lint`, `pnpm build`, 지정된 `git diff --check -- ...`만 실행했다.
- `route-ssot-check`: `docs/current-screens.md`와 실제 page 파일을 대조해 route/href 변경 없이 section-level wording만 조정했는지 확인했다.
- `dart-data-source-hardening`: user-facing trust helper와 dev-only diagnostics disclosure가 섞이지 않도록 production 제한 안내와 diagnostics intro를 보수적으로 정리했다.
- `work-log-closeout`: 이번 single-surface spike의 변경점, 검증, 남은 리스크를 `/work` 형식으로 남겼다.

## 변경 이유
- `/settings/data-sources`의 trust/freshness helper는 이미 landing했고, 이번 라운드는 `확장 후보`와 `상세 운영 진단` 사이의 section-level boundary wording만 더 또렷하게 만드는 좁은 spike다.
- freshness/health policy, ping/build semantics, diagnostics 구조를 건드리지 않고도 support/follow-through layer와 dev-only diagnostics layer의 읽는 순서를 더 명확히 할 필요가 있었다.

## 핵심 변경
- `확장 후보` description을 위 신뢰 기준 이후에 읽는 보조 메모 톤으로 바꿔 support/follow-through layer임을 더 분명히 했다.
- `상세 운영 진단` description을 위 신뢰 기준/확장 후보 뒤에서 여는 개발용 진단이라는 순서로 정리했다.
- production diagnostics 제한 안내는 user-facing 상태 경고가 아니라, 위 신뢰 기준과 도움 안내만 남기고 raw 진단은 개발 환경에서만 연다는 disclosure boundary helper로 다듬었다.
- `DataSourceHealthTable`, `DataSourceStatusCard`, `OpenDartStatusCard` 내부 wording과 ping/build semantics는 건드리지 않았다.

## 검증
- 실행: `pnpm lint`
- 실행: `pnpm build`
- 실행: `git diff --check -- src/app/settings/data-sources/page.tsx analysis_docs/v2/11_post_phase3_vnext_backlog.md analysis_docs/v2/16_public_stable_ux_polish_backlog.md work/3/24/2026-03-24-n5-settings-data-sources-diagnostics-boundary-copy-helper-polish-spike.md`
- 미실행: `pnpm test`
- 미실행: `pnpm e2e:rc`
- 미실행: `pnpm planning:current-screens:guard`

## 남은 리스크
- `DataSourceHealthTable` 안의 `사용자 도움 기준 요약`과 raw diagnostics는 그대로라서, 다음 라운드에서 section-level helper를 넘어 component wording까지 같이 열면 diagnostics schema와 operator workflow를 다시 흔들 수 있다.
- `OpenDartStatusCard` build/status 영역과 `DataSourceStatusCard` recent ping/dev details는 여전히 diagnostics boundary 인접 surface라, 여기를 같이 건드리면 ping/build semantics와 env/operator disclosure contract를 다시 열게 될 수 있다.
