## 변경 파일
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `work/3/24/2026-03-24-n5-settings-data-sources-trust-freshness-owner-candidate-memo-audit.md`

## 사용 skill
- `planning-gate-selector`: docs-only audit 라운드에 맞는 최소 검증 세트를 유지했다.
- `route-ssot-check`: `docs/current-screens.md` 기준으로 `/settings/data-sources`가 현재 `Public Stable` inventory와 충돌 없이 다뤄지는지 확인했다.
- `dart-data-source-hardening`: env 누락, 요청 실패, stale/partial payload, production diagnostics 비노출 상태에서 trust helper와 operator diagnostics 경계를 점검했다.
- `work-log-closeout`: 이번 docs-first audit 결과와 다음 컷 권고를 `/work` 형식에 맞춰 남겼다.

## 변경 이유
- `/settings/data-sources`는 trust/freshness owner surface라서 broad UI polish로 열면 health/freshness policy, env 설명, ping semantics까지 함께 다시 열릴 위험이 있다.
- 이번 라운드는 구현이 아니라 user-facing trust helper와 dev/ops diagnostics의 읽는 층위를 먼저 좁혀, 다음 smallest cut을 안전한 page-shell spike로 고정하기 위한 문서 감사다.

## 핵심 변경
- backlog에 `/settings/data-sources` role map을 추가해 `PageHeader`와 `먼저 확인할 신뢰 요약`을 orientation layer, impact/source/OpenDART card를 user-facing current-state helper, `상세 운영 진단`을 dev/ops diagnostics layer로 정리했다.
- env 누락, 요청 실패, stale 상태, partial payload, recent ping 부재, production diagnostics 비노출 같은 failure mode를 user helper와 raw diagnostics 중 어디에 남겨야 하는지 boundary를 명시했다.
- 다음 smallest candidate를 broad data-sources UI polish가 아니라 `/settings/data-sources` page-shell trust-summary vs diagnostics-boundary copy/helper spike로 좁혔다.

## 검증
- 실행: `git diff --check -- analysis_docs/v2/11_post_phase3_vnext_backlog.md analysis_docs/v2/16_public_stable_ux_polish_backlog.md work/3/24/2026-03-24-n5-settings-data-sources-trust-freshness-owner-candidate-memo-audit.md`
- 미실행: `pnpm test`
- 미실행: `pnpm lint`
- 미실행: `pnpm build`
- 미실행: `pnpm e2e:rc`
- 미실행: `pnpm planning:current-screens:guard`

## 남은 리스크
- `DataSourceStatusCard`, `OpenDartStatusCard`, `DataSourceHealthTable`는 user trust helper와 dev/operator affordance를 모두 안고 있어, 다음 라운드에서 component-level wording까지 한 번에 열면 narrow spike 범위를 넘기 쉽다.
- `최근 연결 확인`, read-only health, 기준 시점 계산 근거는 copy/helper가 아니라 freshness/health semantics에 가까워서 별도 contract cut 없이 손대면 위험하다.
