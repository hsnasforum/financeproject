# 2026-03-26 v3 import-to-planning beta draft-detail-preflight-report handoff copy alignment plan

## 변경 파일
- `work/3/26/2026-03-26-v3-import-to-planning-beta-draft-detail-preflight-report-handoff-copy-alignment-plan.md`

## 사용 skill
- `planning-v3-batch-contract-narrowing`: 오늘 같은 beta funnel 후속 라운드를 직전 `/work` 경계에서 이어받고, detail/preflight consumer copy만 다루며 API/계산 계약을 다시 열지 않기 위해 사용.
- `planning-gate-selector`: 이번 배치를 `TSX UI text + existing route handoff copy`로 분류하고 smallest safe verification set을 고르기 위해 사용.
- `route-ssot-check`: `docs/current-screens.md` 기준에서 `/planning/v3/profile/drafts/[id]`, `/planning/v3/profile/drafts/[id]/preflight`, `/planning/reports`가 이미 존재하는 route이며 이번 라운드에 inventory 재분류나 route 추가/삭제가 없음을 확인하기 위해 사용.
- `work-log-closeout`: planning-only round의 범위, 실행 검증, 남은 리스크, 다음 우선순위를 오늘 `/work` 형식으로 남기기 위해 사용.

## 변경 이유
- 같은 날 앞선 구현 라운드에서 `/planning/v3/transactions/batches -> balances -> profile/drafts`까지는 handoff copy가 정리됐지만, 실제 마지막 funnel인 `draft detail -> preflight/apply -> stable report`는 아직 이전 톤과 helper wording이 남아 있다.
- 사용자 요청 범위는 route inventory 재분류, API/계산 변경, broad funnel redesign이 아니라 마지막 handoff copy 정렬만 smallest safe batch로 닫는 것이다.
- 구현 전에 메인 에이전트가 직접 잡아야 할 핵심 경로와 병렬 가능한 보조 작업을 분리해 두지 않으면, preflight/apply semantics나 stable report entry 의미를 실수로 넓힐 위험이 있다.

## 핵심 변경
- 이번 라운드 구현 범위를 `ProfileDraftDetailClient`, `ProfileDraftPreflightClient`, 필요 시 관련 UI 테스트와 `v3-draft-apply` e2e 재검증으로 한정하는 단계 계획을 정리했다.
- `/planning/v3/profile/drafts/[id]`는 representative beta funnel의 마지막 검토 surface, `/planning/v3/profile/drafts/[id]/preflight`는 apply 직전 diff review surface, `/planning/reports`는 stable 결과 확인 도착점이라는 tier를 유지하기로 잠갔다.
- `/planning/v3/batches`, `/planning/v3/import/csv` 같은 raw/support route는 이번 라운드에서도 support/internal tier로만 다루고, route 추가·삭제·redirect 변경은 비범위로 못 박았다.
- 최소 검증은 `copy/UI test + lint + build + e2e:rc + diff check` 후보로 잡되, current-screens inventory와 route SSOT를 실제로 바꾸지 않으면 `pnpm planning:current-screens:guard`, `pnpm planning:ssot:check`는 미실행 검증으로 남기도록 정리했다.

## 검증
- `git diff --check -- work/3/26/2026-03-26-v3-import-to-planning-beta-draft-detail-preflight-report-handoff-copy-alignment-plan.md`
- [미실행] `pnpm test` — 이번 라운드는 planning note만 작성했고 구현/테스트 변경은 아직 없다.
- [미실행] `pnpm lint` — 이번 라운드는 planning note만 작성했고 TSX 변경은 아직 없다.
- [미실행] `pnpm build` — 이번 라운드는 planning note만 작성했고 route/page import 영향은 아직 없다.
- [미실행] `pnpm e2e:rc` — 사용자 흐름 구현 변경 전이라 아직 실행하지 않았다.
- [미실행] `pnpm planning:current-screens:guard` — route inventory/classification 자체를 바꾸지 않는 전제만 확인했고 문서 변경은 없다.
- [미실행] `pnpm planning:ssot:check` — route SSOT/catalog 자체를 수정하지 않는 전제만 확인했다.

## 남은 리스크
- `[검증 필요]` `ProfileDraftDetailClient`와 `ProfileDraftPreflightClient`는 현재 영문 제목(`Draft Preflight`, `Summary`, `Errors`, `Changes`)과 low-context helper가 섞여 있어, copy만 바꾸더라도 기존 테스트가 문자열에 강하게 묶여 있으면 기대보다 수정 범위가 넓어질 수 있다.
- `[검증 필요]` apply 이후 현재 e2e는 `/planning?profileId=...` redirect만 검증하고 있어, stable `/planning/reports` handoff wording alignment가 실제 flow expectation과 얼마나 맞는지 추가 확인이 필요하다.
- broad funnel 재설계나 report entry policy로 번지지 않게 하려면, 메인 구현은 existing href 유지와 copy hierarchy 조정까지만 직접 수행해야 한다.
