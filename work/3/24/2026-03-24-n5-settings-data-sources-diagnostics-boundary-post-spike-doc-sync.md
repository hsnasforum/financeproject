# 2026-03-24 n5-settings-data-sources-diagnostics-boundary-post-spike-doc-sync

## 변경 파일
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`
- `work/3/24/2026-03-24-n5-settings-data-sources-diagnostics-boundary-post-spike-doc-sync.md`

## 사용 skill
- `planning-gate-selector`: docs-only post-spike sync 라운드에 맞춰 지정된 `git diff --check -- ...`만 실행하고 나머지 검증은 미실행으로 남겼다.
- `route-ssot-check`: `docs/current-screens.md`와 실제 `/settings/data-sources` page를 대조해 route/href contract와 `Public Stable` inventory 변경이 없음을 확인했다.
- `dart-data-source-hardening`: diagnostics 제한 안내가 user-facing 상태 경고로 오해되지 않는지, raw diagnostics와 operator read-through가 여전히 분리돼 있는지 다시 점검했다.
- `work-log-closeout`: diagnostics-boundary landed scope, unchanged boundary, 다음 docs-first candidate를 `/work` closeout 형식으로 남겼다.

## 변경 이유
- 방금 landing한 `/settings/data-sources` diagnostics-boundary copy/helper polish를 backlog 문서 기준으로 정확히 동기화해야 했다.
- 이번 라운드는 코드 재수정이 아니라, diagnostics-boundary spike가 이미 닫혔다는 상태와 그 다음 smallest cut만 docs-only로 맞추는 sync 작업이다.

## 핵심 변경
- backlog에 diagnostics-boundary post-spike sync memo를 추가해 실제 landed 범위를 `확장 후보` section description, `상세 운영 진단` section description, production diagnostics 제한 안내 문구, production helper paragraph 조정으로 고정했다.
- 같은 메모에서 `DataSourceHealthTable` 구조, `DataSourceStatusCard` wording, `OpenDartStatusCard` wording, ping/build semantics, freshness/health policy, route/href contract가 바뀌지 않았음을 명시했다.
- current next question이 더 이상 diagnostics-boundary wording 구현 여부가 아니라, 남은 diagnostics-heavy surface를 어떤 docs-first cut으로 다시 자를지라는 점을 반영했다.
- next smallest candidate는 broad diagnostics rewrite가 아니라 `/settings/data-sources` `DataSourceHealthTable` operator/read-only-meta boundary docs-first memo로만 좁혔다. [검증 필요]

## 검증
- 실행: `git diff --check -- analysis_docs/v2/11_post_phase3_vnext_backlog.md analysis_docs/v2/16_public_stable_ux_polish_backlog.md work/3/24/2026-03-24-n5-settings-data-sources-diagnostics-boundary-post-spike-doc-sync.md`
- 미실행: `pnpm test`
- 미실행: `pnpm lint`
- 미실행: `pnpm build`
- 미실행: `pnpm e2e:rc`
- 미실행: `pnpm planning:current-screens:guard`

## 남은 리스크
- `DataSourceHealthTable` 안의 `사용자 도움 기준 요약`은 아직도 operator read-through인지 user-facing helper의 연장인지 경계가 얇아, 다음 라운드에서 wording을 바로 열면 diagnostics schema와 operator workflow까지 다시 흔들 수 있다. [검증 필요]
- `OpenDartStatusCard` build/status 영역과 `DataSourceStatusCard` recent ping/dev details는 diagnostics boundary 인접 surface라, `DataSourceHealthTable` memo 이후에도 broad rewrite로 번지지 않도록 계속 작은 배치로 잘라야 한다.
