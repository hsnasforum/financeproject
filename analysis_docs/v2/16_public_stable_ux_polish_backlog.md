# 16. public/stable UX polish backlog

작성 기준: `N4 planning/v3 beta exposure visibility policy`, `financeproject_next_stage_plan`, `docs/current-screens.md`, 2026-03-19(KST)
범위: 기존 `Public Stable` surface의 copy / helper / trust / CTA polish backlog 정의

---

## 1. 목적

이 문서는 새 기능이나 새 route를 만들지 않고,
이미 존재하는 stable/public surface의 UX polish를
다음 사이클용 보조 backlog로 고정하기 위한 문서입니다.

이번 문서의 목적은 아래 5가지입니다.

1. `N5`를 독립 대형 축이 아니라 small-batch 보조 backlog로 다시 고정한다.
2. polish 대상 surface를 실제 `Public Stable` route 기준으로만 묶는다.
3. copy / helper / trust / CTA polish의 허용 범위를 문서로 잠근다.
4. `contract-first` backlog를 막지 않도록 금지 규칙과 이관 규칙을 함께 남긴다.
5. `P1 ~ P3` 완료 항목을 reopen하지 않고, 후속 polish queue로만 관리한다.

---

## 2. 입력 문서와 해석 규칙

### 2.1 입력 문서

- backlog 기준:
  - `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- beta exposure 경계 기준:
  - `analysis_docs/v2/15_planning_v3_beta_exposure_visibility_policy.md`
- 기존 제품화 완료 기준:
  - `analysis_docs/v2/financeproject_next_stage_plan.md`
- 현재 route inventory 기준:
  - `docs/current-screens.md`
- 직전 연결 메모:
  - `work/3/23/2026-03-23-n4-visibility-policy-ssot-readiness-audit.md`

### 2.2 해석 규칙

- 이 문서에서 `stable/public surface`는 `docs/current-screens.md`의 `Public Stable` route만 뜻한다.
- `Public Beta`, `Legacy Redirect`, `Local-only Ops`, `Dev/Debug`는 이번 backlog 대상이 아니다.
- `planning/v3` 관련 노출 범위는 `N4` 문서에서 이미 잠겼으므로 여기서 다시 열지 않는다.
- `P1 ~ P3` 완료 메모는 reopen 대상이 아니라, 현재 stable surface에 남은 후속 polish 기준선으로만 사용한다.
- 이 문서에서 `polish`는 copy, helper, trust cue, CTA 위계, 점진적 공개, empty/fallback 안내 정리를 뜻한다.
- route 추가, 기능 추가, stable 승격, beta exposure 재분류, 계약 변경은 `N5`의 범위가 아니다.

---

## 3. 공통 원칙

- `N5`는 독립 대형 축이 아니라 contract-first 뒤에 붙는 small-batch 보조 backlog다.
- blocker가 아닌 범위에서만 열고, `N1 ~ N4`를 늦추는 공통 의존성을 만들지 않는다.
- 사용자 문구는 비전문가 기준 쉬운 한국어를 유지한다.
- raw 상태, 내부 용어, 설정/운영 정보는 전면 노출보다 점진적 공개와 설정/보조 레이어 이동을 우선한다.
- public surface에는 얇은 helper와 trust cue만 두고, raw 운영 정보는 기존 trust hub나 해당 host surface의 보조 레이어에 남긴다.
- 기존 Public IA와 stable route inventory를 유지한다.
- 이미 닫힌 `P1 ~ P3` 결과는 다시 설계하지 않고, 좁은 follow-up polish queue로만 다룬다.

---

## 4. polish 대상 surface 분류

## 4.1 시작점 / 진입 surface

### 포함 route

- `/`
- `/dashboard`

### polish 초점

- 시작 문구와 두 갈래 진입 CTA를 더 쉽게 읽히게 정리한다.
- 첫 화면에서 무엇을 먼저 할 수 있는지 한 문장으로 이해되게 다듬는다.
- 정보 과밀을 늘리지 않고, 핵심 CTA와 짧은 helper 위계만 다룬다.

### first-batch candidate audit memo

- home vs dashboard entry-role map
  - `/`는 `HomeHero`, `QuickTiles`, `TodayQueue`, `HomeStatusStrip`, `ServiceLinks`, `HomePortalClient`를 묶는 broad home overview/shortcut surface다.
  - `/dashboard`는 current `Public IA`에서 `홈/대시보드` 대표 경로로 읽히는 main entry이며, 최근 실행·다음 액션·바로가기 허브를 한 host surface 안에 모은다.
- first-batch viable candidate
  - 가장 작은 첫 `N5` batch 후보는 `/dashboard` 단독 host surface다.
  - trust/helper/copy/CTA polish만으로도 hero 문구, recent-run follow-through, quick-link helper를 한 배치 안에서 다듬을 수 있고, stable IA/nav 재편 없이 닫을 여지가 크다.
- wording drift / `[검증 필요]` subset
  - `/` 단독은 CTA와 helper가 여러 레이어에 걸쳐 중복될 수 있어, 작은 문구 정리도 home IA 우선순위 조정으로 오해될 수 있다. [검증 필요]
  - `/ + /dashboard` pair는 현재 단계에서 too broad하다. home hero/shortcut과 dashboard recent-run hub를 동시에 만지면 stable entry hierarchy 재조정으로 번질 수 있으므로 첫 배치 후보로는 과하다. [검증 필요]

### dashboard CTA hierarchy audit memo

- dashboard CTA hierarchy map
  - hero CTA 묶음이 current primary CTA layer다. recent run이 있으면 `재무 상태 다시 보기`가 primary next action이고, `조건에 맞는 상품 비교`는 parallel branch CTA, `플랜 다시 계산`과 `새로고침`은 support control이다.
  - recent run이 없으면 hero의 `재무 상태 진단 시작`이 primary CTA이고, `조건에 맞는 상품 비교`는 secondary branch CTA, `새로고침`은 support control이다.
  - `최근 플랜`은 저장된 실행을 다시 여는 follow-through surface이며, `Report`가 first follow-through, `Re-run`은 secondary support action이다.
  - `플랜 액션과 비교 후보`는 latest run 이후의 follow-through/support hub로 읽고, hero primary CTA와 같은 레벨의 entry CTA로 다시 올리지 않는다.
  - `바로 이동`은 stable surface catalog shortcut 묶음으로 두고 tertiary quick-link layer로만 읽는다.
- landed hero polish spike
  - `/dashboard` hero CTA hierarchy copy/helper polish는 2026-03-23 spike에서 landing했다.
  - recent run이 있으면 hero title·description·helper가 `재무 상태 다시 보기`를 먼저 읽히게 하고, `조건에 맞는 상품 비교`는 필요 시 이어지는 branch CTA로 남겼다.
  - recent run이 없으면 hero title·description·helper가 `재무 상태 진단 시작`을 기본 출발점으로 읽히게 하고, `조건에 맞는 상품 비교`는 secondary branch CTA로 유지했다.
  - support CTA 문구는 `플랜 다시 계산`에서 `같은 조건으로 다시 계산`으로만 좁게 조정했고, CTA destination, block order, card structure, stable IA/nav는 바꾸지 않았다.
- next smallest candidate
  - hero 다음으로 가장 작은 `/dashboard` 후속 후보는 `최근 플랜` follow-through copy/helper audit이다.
  - 이 후보도 recent-run card reorder나 action hub 재배치가 아니라, recent-run block 안의 follow-through 설명과 support action 위계를 다시 읽기 쉽게 만드는 범위로만 좁힌다.
- wording drift / `[검증 필요]` subset
  - `최근 플랜`, `플랜 액션과 비교 후보`, `바로 이동` 블록의 우선순위를 한 번에 다시 쓰면 hero primary CTA 조정보다 큰 dashboard IA 재정렬로 번질 수 있다. [검증 필요]
  - `추천 허브`, `리포트`, `플래닝`, `다시 계산` 사이의 canonical entry를 새로 정의하거나 block 순서를 바꾸는 일은 `N5` small-batch 범위가 아니다. [검증 필요]

### recent-plan follow-through audit memo

- recent-plan follow-through hierarchy map
  - `최근 플랜` 블록의 card-level primary follow-through는 각 카드의 `리포트 다시 보기 →`다. 저장된 실행 결과를 다시 여는 첫 액션을 여기로 읽는다.
  - card-level `같은 조건으로 다시 계산`은 같은 실행 조건으로 다시 계산하는 secondary support action이다. `리포트 다시 보기 →`와 같은 층위의 primary CTA로 다시 올리지 않는다.
  - section header `View All →`는 저장된 실행 목록 전체를 여는 list-level action이다. 개별 카드의 primary follow-through와 같은 층위로 읽히지 않게 유지한다.
  - empty state의 `저장된 실행이 아직 없습니다.`와 `플래닝을 한 번 저장하면 이곳에서 먼저 리포트를 다시 열고, 필요하면 같은 조건으로 다시 계산할 수 있습니다.`는 first-time entry CTA가 아니라, 저장 후 follow-through가 생긴다는 안내로만 읽는다.
- landed recent-plan polish spike
  - `/dashboard` `최근 플랜` copy/helper polish는 2026-03-23 spike에서 landing했다.
  - 실제 변경 범위는 section description, empty-state helper, card footer CTA tone/copy에 한정된다.
  - `View All →` header action, href destination, card order, block order, metrics/summary 구조는 바꾸지 않았다.
- next smallest candidate
  - `최근 플랜` 다음으로 가장 작은 `/dashboard` 후속 후보는 `플랜 액션과 비교 후보` block의 docs-first copy/helper candidate memo다.
  - 이 후보는 구현 spike가 아니라, latest action/candidate follow-through를 block 내부 문구와 helper 층위 기준으로 먼저 좁히는 audit 메모 수준으로만 남긴다.
- wording drift / `[검증 필요]` subset
  - card order를 바꾸거나 `View All →`를 hero/entry CTA처럼 올리는 일은 `최근 플랜` block 내부 polish가 아니라 dashboard IA 재정렬에 가깝다. [검증 필요]
  - `플랜 액션과 비교 후보`, `바로 이동`, hero CTA hierarchy와 우선순위를 다시 묶는 일은 이번 후속 범위를 넘는다. [검증 필요]

### action-candidate follow-through candidate memo

- action-candidate follow-through hierarchy map
  - `플랜 액션과 비교 후보` block의 block-level action은 header `Action Hub →` 또는 `Pick Hub →`다. latest run 유무에 따라 전체 action/candidate hub로 이어지는 top-level action으로만 읽는다.
  - action card의 `액션 이어보기 →`는 각 액션 상세를 다시 여는 card-level follow-through다. header action과 같은 층위의 block-level CTA로 다시 올리지 않는다.
  - candidate card는 현재 정보 요약 surface다. 금리, provider, why-this 요약을 보여 주는 summary card로 두고, 별도 primary CTA를 새로 붙이지 않는다.
  - empty state의 `저장된 액션과 후보가 없습니다.`와 `먼저 플랜을 저장하면 이곳에서 저장된 액션을 다시 보고, 필요하면 추천 허브에서 직접 비교를 이어갈 수 있습니다.`는 block-level fallback helper다. hero/recent-plan의 primary follow-through와 같은 층위의 entry CTA로 읽히지 않게 유지한다.
- landed action-candidate polish spike
  - `/dashboard` `플랜 액션과 비교 후보` copy/helper polish는 2026-03-23 spike에서 landing했다.
  - 실제 변경 범위는 section description, action card CTA tone/copy, empty-state helper에 한정된다.
  - header action text/placement, href destination, candidate card direct CTA 부재, card order, block order는 바꾸지 않았다.
- next smallest candidate
  - `플랜 액션과 비교 후보` 다음으로 가장 작은 `/dashboard` 후속 후보는 `바로 이동` block의 docs-first candidate memo다.
  - 이 후보는 구현 spike가 아니라, stable surface shortcut 묶음을 tertiary quick-link layer로 유지하면서 block 내부 문구와 helper 경계를 먼저 좁히는 audit 메모 수준으로만 남긴다.
- wording drift / `[검증 필요]` subset
  - action hub header를 hero/entry CTA처럼 끌어올리거나 action card와 같은 층위로 재설계하는 일은 block 내부 polish가 아니라 dashboard IA 재정렬에 가깝다. [검증 필요]
  - candidate card에 직접 CTA를 추가하거나 `최근 플랜`, `바로 이동`, hero CTA hierarchy와 우선순위를 다시 묶는 일은 이번 후속 범위를 넘는다. [검증 필요]

### quick-link post-spike sync

- quick-link shortcut hierarchy map
  - `바로 이동` block은 current `/dashboard`의 primary CTA layer가 아니라 stable surface catalog shortcut 묶음이다. hero, `최근 플랜`, `플랜 액션과 비교 후보` 다음에 오는 tertiary quick-link layer로만 읽는다.
  - `플래닝`, `리포트`, `추천 허브`, `상품 탐색`, `공시 탐색` 카드는 각 stable surface로 빠르게 이동하는 shortcut이다. 각 카드 자체를 new entry CTA나 canonical start point로 다시 올리지 않는다.
  - landed 범위는 section description을 `필요한 화면을 빠르게 여는 바로가기 모음`으로 조정하고, 각 shortcut card description을 화면을 빠르게 여는 helper 톤으로 맞춘 데까지다.
  - href destination, shortcut 추가/삭제, 카드 순서, block 순서는 바뀌지 않았다.
- next smallest candidate
  - quick-link 다음으로 가장 작은 `/dashboard` 후속 후보는 `최근 피드백` block의 docs-first candidate memo다.
  - 이 후보도 구현 spike가 아니라, feedback list-level action과 card-level read-through를 block 내부 copy/helper 기준으로 먼저 좁히는 audit 메모 수준으로만 남긴다.
- wording drift / `[검증 필요]` subset
  - shortcut 카드의 상대 우선순위를 다시 짜거나 특정 카드를 hero/recent-plan/action-candidate와 같은 entry CTA처럼 끌어올리는 일은 block 내부 polish가 아니라 dashboard IA 재정렬에 가깝다. [검증 필요]
  - shortcut route를 추가/삭제하거나 stable/beta/internal 분류를 다시 여는 일은 이번 후속 범위를 넘는다. [검증 필요]

### recent-feedback post-spike sync

- recent-feedback hierarchy map
  - `최근 피드백` block의 block-level action은 header `View Feed →`다. 전체 피드백 목록으로 이어지는 list-level action으로만 읽고, hero/recent-plan/action-candidate/quick-link와 같은 primary entry CTA로 올리지 않는다.
  - 각 feedback card는 개별 feedback detail로 이어지는 card-level read-through/follow-through다. 최신 메모를 다시 읽고 맥락을 이어보는 supporting surface로 유지한다.
  - landed 범위는 section description을 `최근에 남긴 메모와 개선 요청 흐름을 다시 확인하세요`로 조정하고, fallback category를 `메모`로 맞추며, card-level read-through helper tone과 empty-state helper를 보강한 데까지다.
  - `View Feed →`, href destination, card 순서, 표시 개수, block 순서는 바뀌지 않았다.
  - `최근 피드백`은 `/dashboard`에서 hero, `최근 플랜`, `플랜 액션과 비교 후보`, `바로 이동`보다 낮은 우선순위의 supporting surface로만 읽는다.
- next smallest candidate
  - `최근 피드백` 다음으로 가장 작은 후속 후보는 dashboard 재배치가 아니라 `/feedback` route cluster의 docs-first candidate memo다.
  - 이 후보도 구현 spike가 아니라, `feedback`/`feedback/list`/`feedback/[id]`를 support surface 관점에서 어디까지 작은 copy/helper batch로 자를지 먼저 좁히는 audit 메모 수준으로만 남긴다.
- wording drift / `[검증 필요]` subset
  - `최근 피드백`을 dashboard의 새 primary CTA surface처럼 재격상하거나 hero/recent-plan/action-candidate와 같은 층위로 다시 배치하는 일은 block 내부 polish가 아니라 dashboard IA 재정렬에 가깝다. [검증 필요]
  - feedback list/detail route를 바꾸거나 카드 수, 정렬, 정보 구조를 다시 설계하는 일은 이번 후속 범위를 넘는다. [검증 필요]

## 4.2 planning stable surface

### 포함 route

- `/planning`
- `/planning/runs`
- `/planning/runs/[id]`
- `/planning/reports`
- `/planning/reports/[id]`
- `/planning/trash`

### polish 초점

- 진단 결과, 실행 기록, 보고서, 휴지통 흐름의 copy와 CTA 연결을 더 자연스럽게 다듬는다.
- 계산 근거, 가정, 현재 상태, 다음 액션의 위계를 쉽게 읽히게 정리한다.
- raw 계산식이나 내부 상태를 전면에 내세우기보다 요약 helper와 점진적 공개를 우선한다.

## 4.3 recommend / action follow-through surface

### 포함 route

- `/recommend`
- `/recommend/history`

### polish 초점

- 추천 사유, planning 연계 설명, action CTA 문구를 더 쉽게 읽히게 다듬는다.
- 추천을 확정 답안처럼 보이게 하지 않고 현재 조건 기준 비교/참고라는 톤을 유지한다.
- trust cue, why helper, 비교 CTA는 기존 stable route 안에서만 얇게 조정한다.

### recommend route-cluster candidate memo

- recommend route-cluster role map
  - `/recommend`는 현재 조건 기준 비교를 시작하는 host surface다. `상품 추천 비교`, 조건 입력 form, planning linkage strip, 결과 카드, compare/save/export follow-through를 한 화면에서 묶어 현재 조건 기준 후보를 비교하는 시작점으로 읽는다.
  - `/recommend/history`는 저장한 추천 결과를 다시 읽는 history/follow-through surface다. `추천 비교 기록`, 저장 실행 목록, `새 추천 비교 열기`, 선택 실행 상세, compare diff를 기준으로 저장 당시 조건과 다음 행동을 다시 확인하는 후속 surface로 읽는다.
  - 두 route는 역할이 다르다. `/recommend`는 새 비교를 여는 host surface이고, `/recommend/history`는 저장된 결과를 다시 열어 follow-through로 이어지는 surface다. current copy와 CTA는 이 경계를 대체로 유지하지만, planning linkage/helper와 compare follow-through가 얽혀 있어 작은 문구 조정도 범위가 쉽게 커질 수 있다.
- smallest viable next candidate
  - recommend cluster 안에서 가장 작은 다음 후보는 `/recommend/history` docs-first candidate memo audit이다.
  - `/recommend/history`는 route 수가 하나이고 저장 기록 재확인, planning report로의 follow-through, compare diff helper를 중심으로 좁게 자를 수 있어, current `/recommend` host surface보다 risk가 작다.
  - `/recommend` host surface는 조건 form, data freshness, planning linkage, compare bag, save/export가 한 화면에 겹쳐 있어 첫 구현 배치로 바로 열기에는 too broad하다.
- defer for now / `[검증 필요]`
  - `/recommend` host surface의 planning linkage strip, 결과 카드 trust cue, compare/save/export follow-through를 함께 조정하면 planning linkage/store flow 재설계로 번질 수 있다. [검증 필요]
  - `/recommend/history`에서도 compare diff semantics, stored run raw identifier helper, planning report deep-link policy를 바꾸기 시작하면 copy/helper 범위를 넘어 contract/flow 조정이 된다. [검증 필요]
  - `/recommend`와 `/recommend/history`의 canonical 관계를 다시 정의하거나 stable/public IA를 재편하는 일은 이번 범위를 넘는다. [검증 필요]
- next cut recommendation
  - current next `N5` cut은 broad implementation이 아니라 `/recommend/history` history/follow-through candidate memo audit이어야 한다.
  - 비범위 항목은 planning linkage/store flow 재설계, compare/save/export semantics 변경, data freshness policy 조정, route contract 변경, stable/public IA 재편이다.

### recommend history follow-through candidate memo

- recommend history-surface role map
  - `/recommend/history`는 저장한 추천 결과를 다시 보는 history/follow-through surface다. `추천 비교 기록` header, 저장 실행 목록, `새 추천 비교 열기`, 선택 실행 상세, `실행 비교`를 기준으로 저장 당시 조건과 다음 행동을 다시 읽는 화면으로 유지한다.
  - `새 추천 비교 열기`는 history surface를 벗어나 `/recommend` host surface로 돌아가는 list-level 보조 action이다. 저장 기록 재확인 자체를 대신하는 primary CTA로 다시 올리지 않는다.
  - 왼쪽 `실행 목록`의 `상세 열기`와 실행 선택은 row-level read-through다. 저장 시점, 저장 조건, `buildNextActionHelper`가 detail panel과 compare diff로 이어지는 follow-through expectation을 준다.
  - 오른쪽 `선택 실행 상세`의 `상위 N개 비교 후보 담기`, `저장 당시 플래닝 보기`는 active run 기준 follow-through action이다. raw identifier helper는 `공유·복구용 보조 정보`로 남겨 support helper layer에 둔다.
  - 하단 `실행 비교`는 primary entry가 아니라 support comparison layer다. 변경/신규/제외 항목을 읽어 저장 시점 차이를 비교하는 보조 분석 영역으로만 유지한다.
- smallest viable next candidate
  - `/recommend/history` 안에서 가장 작은 다음 후보는 history/follow-through copy/helper polish spike다.
  - 범위는 `PageHeader` description, 저장 실행 목록 helper, `선택 실행 상세`의 다음 행동 helper, raw identifier 안내 문구처럼 list/history-level action과 detail/follow-through hierarchy를 더 쉽게 읽히게 만드는 문구 정리에 한정한다.
  - compare diff 테이블, compare bag semantics, planning report deep-link contract, save/export 동작, 저장 실행 selection mechanic은 바꾸지 않는다.
  - smallest safe next implementation cut은 broad recommend/store/planning linkage 재설계가 아니라 `/recommend/history` history/follow-through copy/helper polish spike다.
- wording drift / `[검증 필요]` subset
  - `상위 N개 비교 후보 담기`나 `저장 당시 플래닝 보기`의 action semantics를 바꾸는 일은 copy/helper polish가 아니라 compare/store/planning linkage 조정에 가깝다. [검증 필요]
  - `공유·복구용 보조 정보`를 primary CTA처럼 올리거나 raw identifier/helper policy를 바꾸는 일은 support helper 범위를 넘는다. [검증 필요]
  - `/recommend`와 `/recommend/history`의 canonical 관계를 재정의하거나, compare diff를 새 primary workflow처럼 재배치하는 일은 `N5` small-batch 범위를 넘는다. [검증 필요]

### recommend history follow-through post-spike sync memo

- landed 범위
  - `/recommend/history` history/follow-through copy/helper polish는 이미 landing했고, 실제 변경 범위는 `PageHeader` description, empty-state description/helper, active run next-action helper tone, `공유·복구용 보조 정보` 안내 문구 조정까지다.
  - 저장 기록 재읽기, active run follow-through, support helper/raw identifier 확인의 층위를 더 또렷하게 만들었지만 compare/store/planning linkage 동작은 다시 설계하지 않았다.
- 유지된 경계
  - `새 추천 비교 열기`는 계속 list-level 보조 action으로 남고, `상위 N개 비교 후보 담기`와 `저장 당시 플래닝 보기`의 semantics는 그대로 유지됐다.
  - href destination, compare/store 동작, row/card 순서, planning report deep-link contract, raw identifier helper policy, `Public Stable` route inventory도 바뀌지 않았다.
- next smallest candidate
  - current next `N5` question은 history-surface copy/helper를 구현할지 여부가 아니라, recommend cluster 다음으로 가장 작은 후속 batch를 무엇으로 둘지다.
  - 현 시점의 smallest candidate는 broad recommend flow 재설계가 아니라 `/recommend` host-surface docs-first candidate memo다.

### recommend host-surface candidate memo

- recommend host-surface role map
  - `/recommend`는 현재 조건 기준 비교를 시작하는 host surface다. `상품 추천 비교` header, 상단 helper, 조건 form, summary card의 `비교 후보 보기`를 기준으로 현재 입력값으로 비교를 시작하는 entry 역할을 맡는다.
  - result가 열리면 상단의 `결과 저장`/`JSON`/`CSV`, `플래닝 연동` strip, 결과 카드의 freshness/trust cue, `비교 담기`, `상세 분석`이 follow-through와 support helper layer를 이룬다. 이들은 entry CTA를 대체하는 first-read layer가 아니다.
  - 하단 `지난 추천 히스토리`는 host surface의 primary task를 대신하지 않는 보조 history surface다. 저장된 마지막 실행을 다시 확인하는 fallback layer로만 남긴다.
  - current copy는 pre-result entry와 post-result follow-through를 모두 설명하고 있어, `비교 후보 보기` 이후의 저장/export/compare helper가 같은 층위처럼 읽힐 여지가 있다.
- smallest viable next candidate
  - `/recommend` host surface 안에서 가장 작은 다음 후보는 pre-result entry hierarchy copy/helper polish spike다.
  - 범위는 `PageHeader` description, 상단 helper, summary card의 entry helper tone, `비교 후보 보기`와 `가중치 설정`의 층위를 더 쉽게 읽히게 만드는 문구 정리에 한정한다.
  - 이렇게 자르면 planning linkage strip, 결과 카드 trust cue, save/export/compare follow-through, last-history helper를 건드리지 않고도 host surface의 첫 읽기 부담을 줄일 수 있다.
- defer for now / `[검증 필요]`
  - result header의 `결과 저장`/`JSON`/`CSV` tone을 함께 조정하면 save/export semantics 오해나 post-result follow-through 재정의로 번질 수 있다. [검증 필요]
  - `플래닝 연동` strip의 title/description/label을 바꾸는 일은 planning linkage 승인 범위처럼 읽힐 수 있어 copy polish보다 contract/flow 조정에 가깝다. [검증 필요]
  - 결과 카드의 freshness/trust cue, `비교 담기`, `상세 분석` 위계를 함께 손보면 compare/store semantics, data trust helper, detail drawer follow-through까지 한 번에 얽힌다. [검증 필요]
  - `/recommend`와 `/recommend/history`의 canonical 관계를 다시 정의하거나 stable/public IA를 재편하는 일은 `N5` small-batch 범위를 넘는다. [검증 필요]
- next cut recommendation
  - current next `N5` cut은 broad implementation이 아니라 `/recommend` host surface pre-result entry hierarchy copy/helper polish spike여야 한다.
  - 비범위 항목은 compare/store semantics 변경, planning linkage/store flow 재설계, planning report deep-link contract 변경, export/save 동작 변경, raw identifier/helper policy 변경, stable/public IA 재편이다.

### recommend host-surface pre-result entry hierarchy post-spike sync

- `/recommend` host-surface pre-result entry hierarchy copy/helper polish는 landing했고, 실제 변경 범위는 `PageHeader` description, 상단 helper, summary card entry helper tone, `비교 후보 보기`/`가중치 설정` 주변 안내 문구 정리에 한정된다.
- result header `결과 저장`/`JSON`/`CSV`, `플래닝 연동` strip, 결과 카드 trust cue/`비교 담기`/`상세 분석` semantics, compare/store flow, `Public Stable` route contract는 그대로 유지됐다.

### recommend result-header follow-through candidate memo

- recommend result-header role map
  - current `/recommend` result header의 `추천 결과` title과 item count는 "비교 결과가 열렸다"는 상태를 먼저 알려 주는 result-open label이다. 바로 옆의 score disclaimer는 현재 조건·가중치 기준 비교값이라는 기대치를 주고, 가입 전 재확인이 필요하다는 trust/helper tone을 유지한다.
  - header 오른쪽 `feedback` message는 post-result action confirmation surface로 보이지만, current code 기준으로 `결과 저장`, `JSON`, `CSV`뿐 아니라 카드의 `비교 담기` 완료 메시지도 같은 슬롯에 들어온다. 그래서 result-header follow-through와 card-level compare action confirmation이 같은 위치에서 섞여 읽힐 여지가 있다.
  - `결과 저장`은 현재 비교 실행을 나중에 `/recommend/history`에서 다시 읽기 위한 post-result primary follow-through로 보는 편이 자연스럽다. 반면 `JSON`/`CSV`는 저장 흐름을 대신하는 primary action이 아니라, 필요할 때 꺼내는 support export helper로 읽어야 한다.
  - 하지만 current button cluster는 `결과 저장`/`JSON`/`CSV`를 같은 outline button treatment로 나란히 보여 주고 있어, first read에서 save follow-through와 export helper가 거의 같은 층위처럼 보일 수 있다.
- smallest viable next candidate
  - `/recommend` host surface 안에서 pre-result 다음으로 가장 작은 후속 후보는 result-header follow-through copy/helper polish spike다.
  - 범위는 `추천 결과` title 주변 helper, score disclaimer tone, `결과 저장`과 `JSON`/`CSV`의 역할을 더 쉽게 읽히게 만드는 좁은 copy/helper 정리에 한정한다.
  - 이렇게 자르면 `플래닝 연동` strip, 결과 카드 trust cue, `비교 담기`, `상세 분석`, compare/store semantics를 건드리지 않고도 post-result 첫 읽기 혼선을 줄일 수 있다.
- broad-scope risk subset / `[검증 필요]`
  - header `feedback` ownership을 save/export 전용으로 분리하거나, `JSON`/`CSV`를 dropdown/더보기로 빼거나, `결과 저장` 버튼 variant·배치를 구조적으로 다시 짜기 시작하면 narrow copy/helper polish를 넘는다. 이는 export/save presentation contract, compare/store feedback ownership, header-card interaction까지 함께 열 수 있으므로 broad-scope risk다. [검증 필요]
- next cut recommendation
  - current next `N5` cut은 broad implementation이 아니라 `/recommend` result-header follow-through copy/helper polish spike여야 한다.
  - 비범위 항목은 export/save 동작 변경, compare/store semantics 변경, shared feedback state ownership 분리, `플래닝 연동` strip 문구 변경, 결과 카드 trust cue/`비교 담기`/`상세 분석` semantics 변경, `/recommend/history` 재수정, route contract 변경, stable/public IA 재편이다.

### recommend result-header follow-through post-spike sync

- `/recommend` result-header follow-through copy/helper polish는 landing했고, 실제 변경 범위는 score disclaimer tone과 `결과 저장` 대 `JSON`/`CSV` 역할을 설명하는 helper 문구 정리에 한정된다.
- button 동작, shared `feedback` ownership, button cluster 구조, `플래닝 연동` strip, 결과 카드 trust cue/`비교 담기`/`상세 분석` semantics, `Public Stable` route contract는 그대로 유지됐다.

### recommend planning-linkage strip candidate memo

- planning-linkage strip role map
  - current `/recommend`의 `플래닝 연동` strip은 "이 추천이 현재 플래닝 결과와 어떤 맥락으로 함께 열렸는지"를 먼저 설명하는 contextual helper surface다. title과 description은 추천 비교를 planning action/stage와 함께 읽게 만드는 primary helper이고, planning 결과 자체의 승인이나 확정 답안을 주는 surface는 아니다.
  - chip 묶음 중 `연결된 액션`, `단계`는 user-facing planning context summary에 가깝다. 반면 `연결 방식`, `실행 상태`, `플래닝 실행 ID`는 provenance/support 정보 성격이 더 강하다. current code에서는 이 값들이 같은 badge weight로 함께 노출돼 user-facing helper와 support/debug 정보가 비슷한 층위로 읽힐 여지가 있다.
  - 특히 `연결 방식`의 `planning-summary handoff`, `legacy planningContext` wording과 `플래닝 실행 ID`는 구현/연계 provenance에 가까운데, title/description 바로 옆이나 아래에 붙어 있어 "지금 무엇을 참고해 비교를 읽어야 하는지"보다 "어떤 내부 handoff로 열렸는지"가 같이 전면에 보일 수 있다.
  - current strip은 result card나 compare/store flow를 대신하는 CTA surface가 아니라, planning-linked recommend를 해석하는 context helper + support provenance surface의 혼합 레이어로 보는 편이 정확하다.
- smallest viable next candidate
  - `/recommend` host surface 안에서 result-header 다음으로 가장 작은 후속 후보는 planning-linkage strip copy/helper polish spike다.
  - 범위는 title/description의 primary helper tone과 chip helper 위계를 더 쉽게 읽히게 만드는 문구 정리에 한정한다.
  - 이렇게 자르면 result header, 결과 카드 trust cue, `비교 담기`, `상세 분석`, compare/store semantics를 건드리지 않고도 planning-linked recommend 해석 부담을 줄일 수 있다.
- broad-scope risk subset / `[검증 필요]`
  - chip 표시 조건을 바꾸거나 `runId`를 숨기고 별도 debug/helper layer로 빼거나, `planning-summary`/`planningContext`/stage inference/readiness 의미를 다시 정의하기 시작하면 narrow copy/helper polish를 넘는다. 이는 planning linkage/store flow, provenance ownership, planning-report handoff contract까지 함께 열 수 있으므로 broad-scope risk다. [검증 필요]
- next cut recommendation
  - current next `N5` cut은 broad implementation이 아니라 `/recommend` planning-linkage strip copy/helper polish spike여야 한다.
  - 비범위 항목은 planning linkage/store flow 재설계, `planning-summary`/`planningContext` inference semantics 변경, chip 표시 조건/ownership 변경, `플래닝 실행 ID` lifecycle 변경, result-header helper 재수정, 결과 카드 trust cue/`비교 담기`/`상세 분석` semantics 변경, `/recommend/history` 재수정, route contract 변경, stable/public IA 재편이다.

### recommend planning-linkage strip post-spike sync

- `/recommend` planning-linkage strip copy/helper polish는 landing했고, 실제 변경 범위는 title/description tone, chip helper label, `플래닝 실행 ID`의 support/provenance helper tone 정리에 한정된다.
- chip 표시 조건, `planning-summary`/`planningContext` inference semantics, planning linkage/store flow, result-header, 결과 카드 trust cue/`비교 담기`/`상세 분석` semantics, `Public Stable` route contract는 그대로 유지됐다.

### recommend route-cluster post-polish closeout memo

- recommend route-cluster role map
  - `/recommend`는 current-condition comparison host surface다. pre-result entry, result-header follow-through, planning-linkage strip, 결과 카드 follow-through를 한 화면에서 묶되, 새 비교를 여는 host 역할로 유지한다.
  - `/recommend/history`는 saved-run history/follow-through surface다. 저장 실행 목록, active run detail, compare diff, planning report deep-link를 통해 저장 당시 조건과 다음 행동을 다시 읽는 후속 surface로 유지한다.
- landed scope summary
  - `/recommend` host surface에서는 host pre-result entry hierarchy, result-header follow-through, planning-linkage strip small-batch polish가 이미 landing했다.
  - landed 범위는 `PageHeader` description, 상단 helper, summary card entry helper tone, `비교 후보 보기`/`가중치 설정` 주변 안내 문구, score disclaimer tone, `결과 저장` 대 `JSON`/`CSV` helper, planning-linkage strip title/description tone, chip helper label, `플래닝 실행 ID` support/provenance helper tone 정리까지다.
  - `/recommend/history`에서는 history/follow-through small-batch polish가 이미 landing했고, 실제 변경 범위는 `PageHeader` description, empty-state description/helper, active run next-action helper tone, `공유·복구용 보조 정보` 안내 문구 조정까지다.
- unchanged boundary list
  - compare/save/export semantics, planning linkage/store flow, planning report deep-link contract, raw identifier/helper policy, route/href contract, stable/public IA는 바뀌지 않았다.
  - `결과 저장`/`JSON`/`CSV` 동작, shared `feedback` ownership, chip 표시 조건, `planning-summary`/`planningContext` inference semantics, 결과 카드 trust cue/`비교 담기`/`상세 분석` semantics, `새 추천 비교 열기`, `상위 N개 비교 후보 담기`, `저장 당시 플래닝 보기`, compare/store 동작, row/card 순서도 그대로 유지됐다.
- current next question
  - current next question은 더 이상 recommend cluster 내부의 새 spike를 무엇으로 둘지 여부가 아니라, 이 cluster를 현재 상태로 parked할 수 있는지 여부다.
  - broad reopen trigger와 micro polish backlog를 같은 큐에 다시 섞지 않고, cluster closeout 이후의 후속 질문은 trigger 존재 여부를 먼저 묻는 docs-first 판단으로만 둔다. [검증 필요]
- future reopen trigger only
  - compare/save/export semantics, planning linkage/store flow, planning report deep-link contract, raw identifier/helper policy를 다시 정의해야 할 때.
  - result card trust cue, `비교 담기`, `상세 분석`, shared `feedback` ownership처럼 host follow-through semantics를 다시 열어야 할 때.
  - `/recommend`와 `/recommend/history`의 canonical 관계, route/href contract, stable/public IA를 다시 정의해야 할 때.
  - 반대로 wording sync, current inventory 재확인, closeout memo 보강만으로는 reopen trigger가 아니다.
- next smallest candidate recommendation
  - recommend route cluster는 현 상태로 stable/public cluster 기준 parked할 수 있다. current next recommendation은 cluster 내부 새 구현 배치가 아니라, reopen trigger가 실제로 생겼는지 확인하는 docs-first 판단으로만 둔다.
  - 후속 라운드가 필요해도 first cut은 broad implementation이나 새 micro spike가 아니라 trigger-specific audit/closeout 확인이어야 한다.

## 4.4 상품 / 공공정보 / 탐색 surface

### 포함 route

- `/products`
- `/products/catalog`
- `/products/catalog/[id]`
- `/products/deposit`
- `/products/saving`
- `/products/pension`
- `/products/mortgage-loan`
- `/products/rent-house-loan`
- `/products/credit-loan`
- `/products/compare`
- `/benefits`
- `/compare`
- `/gov24`
- `/help`
- `/housing/afford`
- `/housing/subscription`
- `/invest/companies`
- `/public/dart`
- `/public/dart/company`
- `/tools/fx`

### polish 초점

- 결과 기준, 최신성 helper, 비교 맥락, deep-link CTA를 host surface 맥락에 맞게 더 짧고 분명하게 다듬는다.
- public 정보 surface를 독립 운영 콘솔처럼 보이게 하지 않고, 사용자가 다음에 확인할 행동 근거 레이어로 읽히게 유지한다.
- source 상태, diagnostics, fallback 상세는 raw 운영 정보로 확장하지 않고 필요한 최소 helper만 남긴다.

### products/public/explore route-cluster candidate selection audit memo

- products/public/explore cluster map
  - `products host / compare family`: `/products`, `/compare`, `/products/compare`, `/products/catalog`, `/products/catalog/[id]`, `/products/deposit`, `/products/saving`, `/products/pension`, `/products/mortgage-loan`, `/products/rent-house-loan`, `/products/credit-loan`을 묶는다. `/compare`는 독립 surface라기보다 `/products/compare`로 바로 이어지는 alias route라서, cluster 경계는 products family 기준으로 읽는 편이 맞다.
  - `public benefit lookup family`: `/benefits`, `/gov24`를 묶는다. 둘 다 조건 입력, snapshot/generatedAt, 수동 갱신, completion/helper 성격이 강해 copy/helper만 만져도 freshness/source contract 판단이 따라붙는다.
  - `public disclosure family`: `/public/dart`, `/public/dart/company`를 묶는다. 기업 검색, 개황, 공시 모니터링, source/as-of helper가 함께 있어 disclosure follow-through와 trust cue를 분리해서 봐야 한다.
  - `fx utility family`: `/tools/fx` 단일 route다. 화면은 비교적 작지만 `기준 환율`, `기준일`, 참고 지표 문구가 실제 source/freshness helper와 직접 맞물린다.
- smallest viable next candidate
  - 현 시점의 smallest viable next candidate는 broad `products/public/explore` cluster 구현이 아니라 `/products` host-surface docs-first candidate memo audit이다.
  - `/products`는 current `Public Stable` inventory 안에서 단일 host entry surface로 읽히고, `PageHeader`, hero helper, `통합 카탈로그에서 비교 시작`, 카테고리 바로가기 위계만 좁게 다뤄도 다음 small-batch를 자를 수 있다.
  - `/products/compare`·`/products/catalog`처럼 compare/filter/store semantics가 붙은 화면이나, `/benefits`·`/gov24`·`/public/dart*`·`/tools/fx`처럼 freshness/source helper가 강한 화면보다 risk가 낮다.
- defer for now / `[검증 필요]`
  - `/products/catalog`, `/products/compare`, `/compare`는 비교 조건, 필터, compare follow-through semantics가 얽혀 있어 host-surface 첫 배치로 열면 범위가 바로 넓어진다. [검증 필요]
  - `/benefits`, `/gov24`는 snapshot generatedAt, 수동 갱신, completion/helper, 공공 API 기준 문구가 함께 노출돼 있어 copy/helper polish만으로 닫기 어렵다. [검증 필요]
  - `/public/dart`, `/public/dart/company`는 기업 개황, 공시 모니터링, source/as-of helper, follow-through deep-link가 한 cluster로 묶여 있어 public disclosure trust cue 재정의로 번질 수 있다. [검증 필요]
  - `/tools/fx`는 단일 route라 작아 보이지만, 기준 환율/기준일/참고 지표 helper가 실제 산출값 기대치와 직접 연결돼 있어 `/products`보다 먼저 여는 후보로는 덜 안전하다. [검증 필요]
- next cut recommendation
  - current next `N5` cut은 바로 구현 spike가 아니라 `/products` host-surface candidate memo audit이어야 한다.
  - first cut은 `/products` 한 화면에서 entry hierarchy와 category shortcut helper를 어떻게 읽히게 할지 docs-first로 고정하고, 그 뒤에 copy/helper polish spike 여부를 판단하는 순서가 맞다.
  - 비범위 항목은 `/compare` redirect/route contract 변경, `/products/catalog`·`/products/compare` compare/filter semantics 변경, public-data freshness/source policy 변경, stable/public IA 재편이다.

### products host-surface candidate memo

- products host-surface role map
  - `/products`는 `금융탐색` 축의 host entry surface다. 사용자가 곧바로 상품 결론을 받는 화면이 아니라, 통합 카탈로그로 넓게 시작할지 개별 상품군으로 바로 들어갈지 고르는 시작점으로 읽는다.
  - `PageHeader`와 hero copy는 “어디서 시작할지 정하는 단계”라는 기대치를 주고, `통합 카탈로그에서 비교 시작`은 broad entry를 여는 primary CTA다.
  - `카테고리 바로가기`와 각 상품군 card는 primary CTA와 동급의 결론 action이 아니라, 이미 볼 상품군을 아는 사용자를 위한 secondary shortcut layer다.
  - compare deep-link와 source/freshness helper는 current `/products` host surface의 first-read owner가 아니다. 실제 compare follow-through는 `/products/catalog`의 `비교 후보 담기`와 `/products/compare`에서, source/freshness 판단은 downstream catalog/detail/public-data surface에서 더 강하게 나타난다. [미확인]: future cut에서 host surface에 이 정보를 새로 끌어올릴 근거는 현재 없다.
- smallest viable next candidate
  - host surface 안의 smallest viable next candidate는 `/products` entry hierarchy copy/helper polish spike다.
  - 범위는 `PageHeader` description, hero helper, primary CTA와 `카테고리 바로가기` description, category card entry helper tone처럼 “통합 시작” 대 “이미 정한 상품군 shortcut” 위계를 더 쉽게 읽히게 만드는 문구 정리에 한정한다.
  - compare/store flow, `/products/catalog` follow-through, source/freshness helper는 이번 smallest cut owner가 아니다.
- defer for now / `[검증 필요]`
  - `/products/catalog`의 `비교 후보 담기`, compare notice, `/products/compare` 연결을 `/products` host surface의 primary follow-through처럼 다시 설명하는 일은 compare semantics 재설계로 번질 수 있다. [검증 필요]
  - host surface에 source/freshness helper를 새로 올리거나 downstream 카탈로그의 기준 시점 설명을 여기서 선반영하는 일은 data-source policy 경계를 흐릴 수 있다. [검증 필요]
  - category card badge 체계, 개별 상품군 route copy, `/products/catalog` filter/search 구조를 함께 만지는 일은 host-surface small batch 범위를 넘는다. [검증 필요]
- next cut recommendation
  - current next `N5` cut은 `/products` host-surface entry hierarchy copy/helper polish spike여야 한다.
  - first implementation도 hero와 section/card helper tone 정리 정도로만 닫고, `/products/catalog` compare/filter helper나 downstream freshness/source wording은 별도 라운드에서 다룬다.
  - 비범위 항목은 route/href 변경, `/compare` alias 정책 변경, `/products/catalog`·`/products/compare` compare/filter semantics 변경, source/freshness policy 변경, stable/public IA 재편이다.

### products host-surface post-spike sync memo

- landed scope
  - `/products` host-surface entry hierarchy copy/helper polish는 landing했고, 실제 변경 범위는 `PageHeader` description, hero helper와 본문 문구, primary CTA 아래 보조 문구, `카테고리 바로가기` description, category card description과 entry helper label tone 조정까지다.
  - `통합 카탈로그에서 비교 시작`은 broad entry layer로 유지됐고, category card는 `통합으로 시작` 또는 `이 상품군 보기` 같은 shortcut tone으로 더 분명하게 정리됐다.
- unchanged boundary
  - `href` destination, card 순서, `/products/catalog`·`/products/compare` compare/filter semantics, compare deep-link semantics, source/freshness helper policy, downstream route contract는 그대로 유지됐다.
  - `/products`는 계속 결론 화면이 아니라 비교 시작점을 고르는 host entry surface로 남고, compare deep-link와 source/freshness helper는 current first-read owner로 끌어올리지 않았다.
- next smallest candidate
  - current next `N5` question은 host-surface copy/helper를 구현할지 여부가 아니라, products family 안에서 다음으로 가장 작은 후속 batch를 무엇으로 둘지다.
  - 현 시점의 smallest candidate는 broad family implementation이 아니라 `/products/catalog` docs-first candidate memo audit이다.
  - 다만 `/products/catalog`은 filter/search, compare notice, `비교 후보 담기`, 대표 옵션 helper가 함께 있어, first cut은 implementation spike가 아니라 compare/freshness 경계를 다시 자르는 docs-first memo여야 한다. [검증 필요]

### products-catalog compare-filter-follow-through candidate memo

- products-catalog role map
  - `/products/catalog`은 products family의 compare/filter host-follow-through surface다. 사용자는 여기서 상품군과 검색·필터를 조정해 후보를 좁히고, 각 row/card에서 상세 재확인이나 compare basket follow-through로 이어진다.
  - `PageHeader`, 상단 helper, sticky control panel의 `상품군 선택`, `키워드 검색`, `제공 기관 필터`, 기간/최소 금리, `지금 기준으로 보기`는 primary control layer다. 이 영역은 “현재 조건 기준으로 비교 후보를 다시 불러오고 좁힌다”는 기대치를 준다.
  - result card의 `지금 비교 중인 대표 옵션`과 “실제 가입 조건은 상세에서 다시 확인” helper는 preview/trust helper layer다. 이 카드는 확정 결론이 아니라 현재 목록에서 빠르게 읽는 미리보기로 남는다.
  - row-level `상세에서 다시 확인`은 primary read-through action이고, `비교 후보 담기`와 global `compareNotice`는 `/products/compare`로 이어지는 secondary compare follow-through layer다.
  - source/freshness helper는 current `/products/catalog`의 first-read owner가 아니다. response type에 `generatedAt`가 있어도 현재 UI에 노출되지 않으므로, 이 라운드에서는 현재 검색/필터 기준 설명만 catalog-level expectation으로 본다. [미확인]
- smallest viable next candidate
  - catalog 안의 smallest viable next candidate는 `/products/catalog` compare follow-through copy/helper polish spike다.
  - 범위는 `compareNotice`, row-level `비교 후보 담기` 주변 helper tone, `지금 비교 중인 대표 옵션` helper처럼 compare basket follow-through와 preview helper의 층위를 더 쉽게 읽히게 만드는 문구 정리에 한정한다.
  - filter/search control semantics, sorting/filtering behavior, compare basket 저장 정책, `/products/compare` contract는 이번 smallest cut owner가 아니다.
- defer for now / `[검증 필요]`
  - `상품군 선택`, `키워드 검색`, `제공 기관 필터`, 기간/최소 금리, `샘플 데이터 포함`, `지금 기준으로 보기`의 control semantics를 다시 설계하는 일은 copy/helper polish보다 검색/필터 contract 조정에 가깝다. [검증 필요]
  - compare basket max 개수, 저장 방식, `/products/compare`의 `비교 후보 더 담기`·`비교함 비우기` 흐름까지 함께 손보는 일은 compare/store semantics 재설계로 번질 수 있다. [검증 필요]
  - meta `generatedAt` 같은 source/freshness helper를 catalog 상단에 새로 끌어올리거나 결과 기준 문구를 정책 수준으로 확장하는 일은 current source/freshness policy 경계를 넘는다. [검증 필요]
  - `/products/catalog/[id]` detail helper, `/products/compare` comparison table wording, provider/filter chip 구조까지 함께 여는 일은 catalog single-surface batch 범위를 넘는다. [검증 필요]
- next cut recommendation
  - current next `N5` cut은 broad catalog rewrite가 아니라 `/products/catalog` compare follow-through copy/helper polish spike여야 한다.
  - first implementation은 `compareNotice`, `비교 후보 담기`, `대표 옵션` helper tone 정리 정도로만 닫고, filter/search control copy나 compare/store contract는 별도 라운드로 남긴다.
  - 비범위 항목은 route/href 변경, `/products/catalog` filter/search semantics 변경, compare basket/store semantics 변경, source/freshness helper policy 변경, `/products/compare` 구현 변경, stable/public IA 재편이다.

### products-catalog compare follow-through post-spike sync memo

- landed scope
  - `/products/catalog` compare follow-through copy/helper polish는 landing했고, 실제 변경 범위는 `compareNotice` 본문, compareNotice 아래 보조 helper, row-level `비교 후보 담기` helper, `대표 옵션` preview helper tone 조정까지다.
  - compare follow-through helper는 “후보를 담아 두고 나란히 다시 보는 일은 `/products/compare`에서 이어진다”는 방향으로 더 분명해졌고, `대표 옵션`은 current list의 1차 미리보기라는 tone으로 정리됐다.
- unchanged boundary
  - sticky control panel의 filter/search control 구조, compare basket/store semantics, `/products/compare` route/구현, source/freshness helper policy, row/card 순서, href destination은 그대로 유지됐다.
  - `/products/catalog` 안의 control layer, preview/trust layer, compare follow-through layer 구분만 또렷해졌고, compare basket 정책이나 filter/search contract를 다시 설계하지는 않았다.
- next smallest candidate
  - current next `N5` question은 catalog compare helper를 구현할지 여부가 아니라, products family 안에서 다음으로 가장 작은 후속 batch를 무엇으로 둘지다.
  - 현 시점의 smallest candidate는 broad catalog rewrite가 아니라 `/products/compare` docs-first candidate memo audit이다.
  - 다만 `/products/compare`는 compare basket 상태, 비우기/제거, empty state, desktop/mobile comparison read-through가 함께 있어, first cut은 implementation spike가 아니라 compare read-through와 basket action helper 경계를 다시 자르는 docs-first memo여야 한다. [검증 필요]

### products-compare read-through-and-basket-action candidate memo

- products-compare role map
  - `/products/compare`는 compare basket에 담은 후보를 나란히 다시 읽는 read-through surface다. `PageHeader`, 상단 helper, desktop/mobile comparison view는 “현재 담아 둔 후보의 차이를 같은 기준으로 다시 읽는다”는 기대치를 준다.
  - 상단 summary card의 `비교 중인 후보`, `읽을 수 있는 후보`는 read-through context summary다. 이 수치는 현재 basket 상태를 요약하지만, table/card comparison 자체를 대체하는 primary action은 아니다.
  - `새로고침`, `비교함 비우기`, `비교 후보 더 담기`는 basket action/helper layer다. read-through를 돕는 follow-through action이지만, 비교 결과를 읽는 primary task보다 앞서는 결론 CTA로 다시 올리지는 않는다.
  - empty state와 “최소 2개의 상품이 필요합니다” fallback은 basket action fallback이다. read-through surface가 비어 있을 때 catalog로 되돌아가게 돕지만, `/products/compare` 자체를 catalog entry로 재정의하지는 않는다.
  - desktop table과 mobile card의 `대표 금리`, `가입 기간`, `예금자 보호`, `다음 확인 포인트`, `상세에서 다시 확인`은 primary read-through layer다. basket action과 다른 층위로 유지해야 한다.
- smallest viable next candidate
  - compare surface 안의 smallest viable next candidate는 `/products/compare` basket-action hierarchy copy/helper polish spike다.
  - 범위는 상단 summary card의 action helper tone, empty state/최소 2개 fallback 안내, `비교 후보 더 담기`·`비교함 비우기`·`새로고침`이 read-through를 보조하는 후속 action으로 읽히게 만드는 문구 정리에 한정한다.
  - comparison table/card 자체의 read-through field set과 remove action semantics는 이번 smallest cut owner가 아니다.
- defer for now / `[검증 필요]`
  - compare basket max 개수, `clearCompareIdsStorage`/`removeCompareIdFromStorage` 동작, refresh fetch contract를 다시 정의하는 일은 copy/helper polish가 아니라 basket/store semantics 재설계에 가깝다. [검증 필요]
  - desktop/mobile comparison table의 항목 구성, `다음 확인 포인트`/`대표 금리`/`예금자 보호` labeling, detail read-through CTA를 함께 손보는 일은 read-through surface broad rewrite로 번질 수 있다. [검증 필요]
  - X 버튼 제거 affordance, empty state action destination, `/products/catalog`과 `/products/catalog/[id]` deep-link contract를 바꾸는 일은 route/action contract 변경으로 번질 수 있다. [검증 필요]
  - summary counts의 계산 방식이나 `읽을 수 있는 후보` 집계 기준을 바꾸는 일은 helper 톤 조정보다 상태 semantics 조정에 가깝다. [검증 필요]
- next cut recommendation
  - current next `N5` cut은 broad compare surface rewrite가 아니라 `/products/compare` basket-action hierarchy copy/helper polish spike여야 한다.
  - first implementation은 top summary/action row와 empty/insufficient fallback helper 정리 정도로만 닫고, desktop/mobile read-through copy와 basket policy는 별도 라운드로 남긴다.
  - 비범위 항목은 route/href 변경, compare basket/store semantics 변경, empty-state destination 변경, desktop/mobile comparison field set 재구성, source/freshness helper policy 변경, stable/public IA 재편이다.

### products-compare post-spike sync memo

- landed scope
  - `/products/compare` first copy/helper polish는 landing했고, 실제 변경 범위는 `PageHeader` description, 상단 helper 문구, summary count label, `비교함 비우기`, `비교 후보 더 담기`, top summary helper, empty-state / insufficient-state helper, `대표 금리`, `다음 확인 포인트`, `상세에서 다시 확인`, kind label의 한국어 정리까지다.
  - compare surface는 “확정 추천”이 아니라 compare basket read-through라는 기대치를 더 분명히 주게 됐고, basket action label도 `비교 중인 후보`, `읽을 수 있는 후보`, `비교 후보 더 담기` 같은 helper 톤으로 정리됐다.
- unchanged boundary
  - compare basket/store semantics, `새로고침`·제거·비우기 action behavior, href destination, desktop/mobile comparison field set, row/card 순서, route contract는 그대로 유지됐다.
  - 이번 spike는 basket action/helper와 read-through copy를 더 쉽게 읽히게 만든 문구 조정이지, compare basket 정책이나 comparison 구조 재설계가 아니다.
- next smallest candidate
  - current next `N5` question은 products-compare basket-action helper를 구현할지 여부가 아니라, products family 안에서 다음으로 가장 작은 후속 batch를 무엇으로 둘지다.
  - 현 시점의 smallest candidate는 broad compare rewrite가 아니라 `/products/compare` desktop/mobile read-through helper docs-first memo다.
  - 다만 desktop table과 mobile card는 같은 read-through 목적을 공유하면서도 복제된 label과 helper가 많아, first cut은 implementation spike가 아니라 read-through helper boundary를 다시 자르는 docs-first memo여야 한다. [검증 필요]

### products-compare desktop-mobile read-through helper candidate memo

- products-compare read-through role map
  - desktop table과 mobile card는 둘 다 compare basket에 담은 후보를 같은 기준으로 다시 읽는 primary read-through surface다. 차이는 배치 방식뿐이고, basket action row와 별개로 “비교 항목을 읽고 상세에서 다시 확인한다”는 목적을 공유한다.
  - `대표 금리`, `가입 기간`, `예금자 보호`는 scan-friendly read-through label이다. 각 후보를 빠르게 나란히 읽게 해 주는 factual layer이지, 결론을 대신하는 trust cue나 basket action은 아니다.
  - `다음 확인 포인트`는 위 세 항목 다음에 붙는 interpretive helper다. comparison field set 자체를 늘리기보다 “이 후보에서 다음으로 볼 요약/메모”를 읽게 해 주는 secondary read-through helper로 남겨야 한다.
  - `상세에서 다시 확인`은 row/card 내부의 detail validation CTA다. `/products/catalog/[id]`로 이어지는 support follow-through이지만, 상단 basket action과 같은 층위의 global action으로 다시 올리지는 않는다.
  - 현재 basket action/helper는 summary card 상단에 모여 있고, desktop/mobile read-through helper는 table/card 내부에 묶여 있다. 위치상 분리는 이미 되어 있으므로, 이번 축에서는 label/helper hierarchy만 더 또렷하게 다루는 편이 맞다.
- smallest viable next candidate
  - compare surface 안의 smallest viable next candidate는 `/products/compare` desktop/mobile read-through helper copy/helper polish spike다.
  - 범위는 desktop table과 mobile card에서 공유하는 `대표 금리`·`가입 기간`·`예금자 보호`·`다음 확인 포인트`·`상세에서 다시 확인`의 읽는 순서와 역할을 더 쉽게 이해하게 만드는 문구 정리에 한정한다.
  - basket action row, empty/insufficient fallback, remove action affordance, comparison schema 자체는 이번 smallest cut owner가 아니다.
- defer for now / `[검증 필요]`
  - desktop table과 mobile card의 field set을 추가/삭제하거나 `상품 유형` 포함 여부를 다시 설계하는 일은 helper polish가 아니라 comparison schema 재정의에 가깝다. [검증 필요]
  - `대표 금리`의 계산 기준, `가입 기간` 대표 옵션 선택 규칙, `예금자 보호` 판정 source를 바꾸는 일은 copy/helper가 아니라 data/semantics 변경이다. [검증 필요]
  - `상세에서 다시 확인` destination, remove button 위치/동작, basket max/refresh/clear contract를 바꾸는 일은 route 또는 basket/store policy 변경으로 번질 수 있다. [검증 필요]
  - desktop table과 mobile card의 구조를 합치거나 한쪽만 다른 CTA/label set으로 바꾸는 일은 narrow helper polish보다 broad layout rewrite에 가깝다. [검증 필요]
- next cut recommendation
  - current next `N5` cut은 broad compare surface 재배치가 아니라 `/products/compare` desktop/mobile read-through helper copy/helper polish spike여야 한다.
  - first implementation은 shared read-through label과 `다음 확인 포인트`/`상세에서 다시 확인` hierarchy tone 정리 정도로만 닫고, comparison field set 재구성이나 basket action 재조정은 별도 라운드로 남긴다.
  - 비범위 항목은 route/href 변경, compare basket/store semantics 변경, summary/action row 재수정, empty-state destination 변경, desktop/mobile comparison field set 재구성, stable/public IA 재편이다.

### products-compare desktop-mobile read-through helper post-spike sync memo

- landed scope
  - `/products/compare` desktop/mobile read-through helper copy/helper polish는 landing했고, 실제 변경 범위는 shared read-through helper 한 줄, desktop `비교 항목`의 helper tone, desktop/mobile 공통 `다음 확인 포인트 메모`, desktop/mobile 공통 `상세에서 조건 다시 확인` 문구 정리까지다.
  - desktop table과 mobile card는 같은 read-through 순서를 공유한다는 점이 더 분명해졌고, `다음 확인 포인트`는 secondary helper, detail CTA는 validation CTA라는 읽는 순서가 복제된 label 수준에서 맞춰졌다.
- unchanged boundary
  - `대표 금리`·`가입 기간`·`예금자 보호` factual scan layer, basket action row, empty-state destination, `/products/catalog` deep-link contract, comparison field set, remove button 동작, basket/store semantics, route contract는 그대로 유지됐다.
  - 이번 spike는 read-through helper hierarchy를 더 또렷하게 만든 copy 정리이지, compare surface schema나 action semantics 재설계가 아니다.

### products/public/explore route-cluster post-polish closeout memo

- cluster role map
  - `/products`는 products/public/explore cluster 안의 host entry surface다. broad entry hierarchy와 category shortcut을 정리하는 시작점 역할을 맡는다.
  - `/products/catalog`은 compare/filter host-follow-through surface다. 검색·필터 control과 compare follow-through가 만나는 제품 탐색 중심 layer로 유지된다.
  - `/products/compare`는 compare basket read-through surface다. `/compare`는 여전히 독립 재설계 대상이 아니라 `/products/compare` alias route로 읽는 편이 맞다. [검증 필요]
  - `/benefits`, `/gov24`, `/public/dart`, `/public/dart/company`, `/tools/fx`는 같은 broad stable/public inventory에 남아 있지만, 이번 closeout의 landed scope와는 분리된 public-data/freshness or disclosure family로 계속 defer한다. [검증 필요]
- landed scope
  - `/products` host-surface entry hierarchy small-batch polish는 landing했다. 실제 landed 범위는 `PageHeader` description, hero/helper, primary CTA 보조 문구, `카테고리 바로가기` description, category card description과 entry helper tone 정리까지다.
  - `/products/catalog` compare follow-through small-batch polish도 landing했다. 실제 landed 범위는 `compareNotice` 본문과 helper, row-level `비교 후보 담기` helper, `대표 옵션` preview helper tone 정리까지다.
  - `/products/compare` basket-action helper small-batch polish도 landing했다. 실제 landed 범위는 `PageHeader` description, 상단 helper, summary count label, `비교함 비우기`, `비교 후보 더 담기`, top summary helper, empty/insufficient helper, `대표 금리`·`다음 확인 포인트`·`상세에서 다시 확인`·kind label 한국어 정리까지다.
  - `/products/compare` desktop/mobile read-through helper small-batch polish도 landing했다. shared read-through helper, desktop `비교 항목` helper tone, desktop/mobile 공통 `다음 확인 포인트 메모`, desktop/mobile 공통 `상세에서 조건 다시 확인` 문구 정리까지가 현재 cluster closeout에 포함되는 마지막 landed scope다.
- defer for now / `[검증 필요]`
  - `/benefits`
  - `/gov24`
  - `/public/dart`
  - `/public/dart/company`
  - `/tools/fx`
  - `/products/catalog/[id]` downstream detail contract
- unchanged boundary
  - compare/filter semantics
  - compare basket/store semantics
  - source/freshness policy
  - `/products/catalog/[id]` downstream detail contract
  - `/compare` alias policy
  - route/href contract
  - stable/public IA
- current next question
  - current next question은 더 이상 products cluster 내부에서 새 micro spike를 무엇으로 자를지 여부가 아니다.
  - 이제 질문은 이 cluster를 current parked 상태로 둘 수 있는지, 그리고 reopen trigger가 실제로 생겼는지 여부다. landed된 `/products`, `/products/catalog`, `/products/compare` sub-surface와 defer route를 다시 한 큐로 섞어 broad family 구현 질문으로 되돌리지 않는 편이 맞다. [검증 필요]
- future reopen trigger
  - compare/filter semantics, compare basket/store semantics, source/freshness policy, `/products/catalog/[id]` detail contract, `/compare` alias/route contract, stable/public IA를 다시 정의해야 할 때만 products cluster reopen을 검토한다.
  - 또는 `/benefits`, `/gov24`, `/public/dart*`, `/tools/fx` 중 하나가 독립적인 trigger-specific docs-first question으로 다시 좁혀졌을 때만 별도 surface reopen을 검토한다. wording sync나 closeout memo 보강만으로는 reopen trigger가 아니다. [검증 필요]
- next cut recommendation
  - current recommendation은 products cluster 내부 새 구현 배치가 아니라, current parked 상태를 유지하면서 trigger 발생 여부를 docs-first로만 재판단하는 것이다.
  - broad stable/public rewrite가 위험한 이유는 landed된 products host/catalog/compare helper polish와 defer된 public-data/freshness/disclosure family를 다시 한 묶음으로 열면 compare/filter/store semantics와 source/freshness/disclosure contract를 동시에 흔들 가능성이 크기 때문이다. [검증 필요]

## 4.5 설정 / trust hub / 유지보수 surface

### 포함 route

- `/settings`
- `/settings/alerts`
- `/settings/backup`
- `/settings/data-sources`
- `/settings/maintenance`
- `/settings/recovery`

### polish 초점

- 사용자 질문 중심 문구, 읽는 순서, 요약 블록, follow-through CTA를 먼저 다듬는다.
- raw 운영 정보는 숨기지 않더라도 상단 요약보다 뒤의 점진적 공개 영역으로 유지한다.
- `settings/data-sources`는 계속 trust hub owner로 두고, 다른 stable surface의 raw 운영 정보를 여기로 모으는 원칙을 유지한다.

### settings/trust-hub route-cluster candidate selection audit memo

- settings/trust-hub cluster map
  - `/settings`는 `내 설정`의 host entry surface다. `데이터 신뢰`, `알림 규칙`, `백업 및 복원`, `시스템 복구`, `유지 관리`로 어디서 설정을 시작할지 고르는 card hub 역할에 가깝다.
  - `/settings/data-sources`는 trust/freshness owner다. 최신 기준, 연결 상태, 사용자 영향, 운영 진단이 함께 있어 copy/helper만 건드려도 data-source health/freshness 기대치와 맞물린다.
  - `/settings/alerts`는 DART 알림 규칙/preset/filter surface다. rule kind, preset, regex, sample alerts가 함께 있어 wording polish가 바로 rule/filter semantics 질문으로 번질 수 있다.
  - `/settings/backup`, `/settings/recovery`, `/settings/maintenance`는 operator/maintenance surface다. export/import/restore, reset/offline repair, retention/cleanup처럼 side effect가 큰 action과 raw 운영 정보가 함께 있다.
  - `docs/current-screens.md` 기준으로 위 route는 모두 `Public Stable` 실존 경로다. 이번 selection audit은 다음 후보만 고르고 route contract나 IA 분류는 바꾸지 않는다.
- smallest viable next candidate
  - settings/trust-hub cluster 안의 smallest viable next candidate는 `/settings` host surface다.
  - 현재 `/settings`는 얇은 header + card hub로 구성돼 있어, copy/helper hierarchy를 좁게 정리해도 trust/data-source policy나 recovery/backup semantics를 다시 열지 않을 여지가 가장 크다.
  - 따라서 next safest cut은 broad settings family 구현이 아니라 `/settings` host-surface docs-first candidate memo audit이다.
- defer for now / `[검증 필요]`
  - `/settings/data-sources`는 data health/freshness, impact summary, 운영 진단을 함께 다루므로 trust hub owner 정책을 다시 열 위험이 크다. [검증 필요]
  - `/settings/backup`, `/settings/recovery`, `/settings/maintenance`는 destructive/export semantics와 dev unlock flow가 얽혀 있어 copy/helper polish만으로 닫기 어렵다. [검증 필요]
  - `/settings/alerts`는 preset/rule/filter/regex semantics와 sample alert read-through가 함께 있어 host surface보다 작은 다음 후보로 보기 어렵다. [검증 필요]
- next cut recommendation
  - current next `N5` cut은 broad settings/trust-hub rewrite가 아니라 `/settings` host-surface candidate memo audit이어야 한다.
  - first docs-first cut은 `PageHeader`, card description, `Setup ▶` 같은 entry helper가 어떤 hierarchy로 읽혀야 하는지부터 고정하고, 실제 spike 여부는 그 다음에 결정한다.
  - 비범위 항목은 route/href 변경, trust/data-source health/freshness policy 변경, recovery/backup semantics 변경, stable/public IA 재편이다.

### settings host-surface candidate memo

- settings host-surface role map
  - `/settings`는 `내 설정`의 host entry surface다. 이 화면의 primary task는 특정 설정을 직접 끝내는 것이 아니라, `데이터 신뢰`, `알림 규칙`, `백업 및 복원`, `시스템 복구`, `유지 관리` 중 어디로 들어갈지 고르는 데 있다.
  - `PageHeader`는 “내 설정에서 어떤 종류의 관리 작업을 시작하는지”를 먼저 설명하는 orientation layer다. trust/data-source 기준이나 recovery semantics를 여기서 다시 상세 설명하는 owner는 아니다.
  - card title과 description은 peer shortcut layer다. 다섯 카드가 서로 다른 설정 축으로 나뉜다는 점을 빠르게 읽게 해 주는 안내이며, 이 화면 안에서 하나만 primary CTA로 올려야 하는 구조는 아니다.
  - 반복되는 `Setup ▶`는 card-level entry helper다. 실제 설정을 시작하는 보조 신호지만, card title/description보다 먼저 읽히는 action CTA로 강조할 필요는 없다.
  - current `/settings`의 first-read 문제는 “어디서 시작할지 고르는 host hub”라는 기대치보다 card별 action 느낌이 먼저 나올 수 있다는 점이다. 따라서 host-surface에서는 hero/context와 card helper tone만 좁게 다루는 편이 맞다.
- smallest viable next candidate
  - settings/trust-hub 안에서 `/settings` host surface의 smallest viable next candidate는 entry hierarchy copy/helper polish spike다.
  - 범위는 `PageHeader` description, host helper tone, card description, `Setup ▶` 같은 entry helper를 “설정을 시작할 영역 선택”으로 더 쉽게 읽히게 만드는 문구 정리에 한정한다.
  - card 순서, href destination, downstream route meaning은 이번 smallest cut owner가 아니다.
- defer for now / `[검증 필요]`
  - `/settings`에서 각 card의 설명을 더 구체화하는 과정에서 `데이터 신뢰`의 freshness/trust owner 역할이나 `백업/복구/유지 관리`의 위험 작업 semantics를 대신 설명하기 시작하면 scope가 넓어진다. [검증 필요]
  - `Setup ▶`를 route별로 다른 CTA로 갈라 쓰거나, 특정 card만 hero 수준으로 올리는 일은 host hub의 peer shortcut 구조를 흔들 수 있다. [검증 필요]
  - host surface에 status badge, freshness cue, destructive warning을 끌어올리는 일은 downstream owner route의 contract를 다시 여는 것에 가깝다. [검증 필요]
- next cut recommendation
  - current next `N5` cut은 broad settings family rewrite가 아니라 `/settings` host-surface entry hierarchy copy/helper polish spike여야 한다.
  - first implementation은 `PageHeader`, card description, `Setup ▶` helper tone 정리 정도로만 닫고, trust/data-source detail이나 recovery/backup semantics helper는 각 downstream surface에 남긴다.
  - 비범위 항목은 route/href 변경, card 순서 변경, trust/data-source health/freshness policy 변경, recovery/backup semantics 변경, stable/public IA 재편이다.

### settings host-surface post-spike sync memo

- landed scope
  - `/settings` host-surface entry hierarchy copy/helper polish는 landing했고, 실제 변경 범위는 `PageHeader` description, host helper 문구 1개, card description tone, `이 설정 열기 ▶` helper tone 정리까지다.
  - host surface는 특정 설정을 끝내는 곳이 아니라 어디서 시작할지 고르는 card hub라는 기대치를 더 분명히 주게 됐고, 다섯 card는 계속 peer shortcut layer로 유지됐다.
- unchanged boundary
  - href destination, card 순서, downstream trust/data-source freshness owner 역할, recovery/backup semantics, route contract는 그대로 유지됐다.
  - 이번 spike는 host entry hierarchy copy/helper를 더 쉽게 읽히게 만든 문구 조정이지, downstream route 의미나 trust hub 정책 재설계가 아니다.
- next smallest candidate
  - current next `N5` question은 host-surface copy/helper를 구현할지 여부가 아니라, settings family 안에서 다음으로 가장 작은 후속 batch를 무엇으로 둘지다.
  - 현 시점의 smallest candidate는 broad settings rewrite가 아니라 `/settings/data-sources` docs-first candidate memo audit이다.
  - 다만 `data-sources`는 trust/freshness owner이므로 바로 구현 spike로 들어가기보다 role map과 helper boundary를 먼저 다시 자르는 docs-first 라운드가 선행돼야 한다. [검증 필요]

### settings-data-sources trust-freshness-owner candidate memo

- settings-data-sources role map
  - `/settings/data-sources`는 추천·공시·혜택·주거 화면이 어떤 데이터 기준으로 보이는지 설명하는 trust/freshness owner surface다. `PageHeader`와 상단 `먼저 확인할 신뢰 요약`은 “지금 결과를 어떤 기준으로 읽어야 하는지”를 먼저 잡아 주는 orientation layer다.
  - `질문별 데이터 기준 요약`과 `데이터별 최신 기준`, `공시 데이터 연결 상태`는 user-facing current-state/helper layer다. 사용자 영향, 현재 읽는 기준, 기준 시점, 최근 연결 확인을 먼저 읽게 하며, env 키나 raw operator detail은 이 layer의 primary owner가 아니다.
  - `확장 후보`는 trust owner 아래의 support/follow-through layer다. 지금 당장 필요한 진단이 아니라 이후 확장 가능성을 설명하는 보조 안내로 남는다.
  - `상세 운영 진단`은 dev/ops-only diagnostics layer다. production에서는 비노출 또는 read-only 제한 안내로 닫히고, 개발 환경에서만 fallback/cooldown/최근 오류 로그 같은 raw 진단을 펼친다.
  - failure mode 기준으로도 층위가 갈린다. env 누락/설정 필요, request 실패, partial payload, stale read-only health, recent ping 부재는 user-facing helper에서 현재 상태를 보수적으로 설명해야 하고, 실제 raw error/health row는 dev diagnostics에만 남겨야 한다.
- smallest viable next candidate
  - current surface 안의 smallest viable next candidate는 `/settings/data-sources` page-shell trust-summary vs diagnostics-boundary candidate다.
  - first implementation으로 바로 넓게 들어가기보다, `PageHeader`, `먼저 확인할 신뢰 요약`, `상세 운영 진단` introduction처럼 page-shell copy/helper에서 user-facing trust helper와 dev diagnostics의 읽는 순서를 더 또렷하게 만드는 좁은 spike가 가장 안전하다.
  - `DataSourceImpactCardsClient`, `DataSourceStatusCard`, `OpenDartStatusCard`, `DataSourceHealthTable` 내부 semantics까지 한 번에 열면 smallest cut을 넘는다.
- defer for now / `[검증 필요]`
  - freshness/health policy, `최근 연결 확인` ping semantics, read-only health 집계 기준, `기준 시점` 계산 근거를 바꾸는 일은 copy/helper polish가 아니라 owner policy 변경에 가깝다. [검증 필요]
  - env 누락 설명, optional env wording, auto build/ping action affordance, dev-only details disclosure를 다시 설계하는 일은 operator flow와 security/runtime contract에 걸친다. [검증 필요]
  - `DataSourceHealthTable`의 fallback/cooldown/error log 구조나 `OpenDartStatusCard`의 build/status flow를 함께 손보는 일은 diagnostics broad rewrite로 번질 수 있다. [검증 필요]
  - `showRecentPing`, localStorage snapshot, partial payload에서의 card-level read-only health 표시 기준을 바꾸는 일은 helper tone 조정보다 상태 semantics 조정에 가깝다. [검증 필요]
- next cut recommendation
  - current next `N5` cut은 broad data-sources UI polish가 아니라 `/settings/data-sources` page-shell trust-summary vs diagnostics-boundary copy/helper candidate를 바탕으로 한 narrow spike여야 한다.
  - first implementation 범위는 `PageHeader`, `먼저 확인할 신뢰 요약`, diagnostics entry helper, production에서의 diagnostics 제한 안내처럼 page-level hierarchy만 정리하는 데 한정하는 편이 안전하다.
  - 비범위 항목은 route/href 변경, trust/data-source freshness policy 변경, ping semantics 변경, env/operator 설명 재설계, diagnostics table/card 구조 변경, stable/public IA 재편이다.
  - broad data-sources polish가 위험한 이유는 한 화면 안에 user-facing trust helper, read-only freshness state, recent ping snapshot, dev-only diagnostics, OpenDART build/status flow가 함께 있어 작은 wording 수정도 곧바로 health/freshness contract나 operator affordance 의미를 바꿀 수 있기 때문이다.

### settings-data-sources actual-landing-scope post-spike closeout sync

- actual landed scope
  - `/settings/data-sources` trust/freshness helper polish는 이미 landing했고, 실제 변경 범위는 `PageHeader` description, `먼저 확인할 신뢰 요약` title/description과 3단계 helper, 상단 in-page jump helper, `질문별 데이터 기준 요약` 제목/설명과 impact card label tone, `데이터별 최신 기준` 설명 tone까지 포함한다.
  - component layer에서도 user-facing trust helper 정리가 이미 들어가 있다. `DataSourceStatusCard`는 `현재 읽는 기준`과 dev-only details를 분리해 읽게 하고, `OpenDartStatusCard`는 user summary와 dev-only index info를 나눠 놓았다.
  - 따라서 original narrow candidate가 상정했던 page-shell 수준보다 실제 landed scope는 조금 넓다. 다만 widening은 copy/helper 경계 정리까지이며, freshness policy나 action semantics 변경으로 번지지는 않았다.
- unchanged boundary
  - route/href contract, trust/data-source freshness policy, ping/build action semantics, diagnostics table 구조, env contract, `docs/current-screens.md` inventory는 그대로 유지됐다.
  - `DataSourceHealthTable`의 raw 진단 구조와 `DataSourceImpactCardsClient`/`DataSourceStatusCard`/`OpenDartStatusCard`의 상태 계산 기준도 이번 closeout 기준으로는 재설계되지 않았다.
- `[검증 필요]` risk
  - 현재 safe하게 landing한 범위는 user-facing trust helper와 dev-only disclosure boundary까지다. 여기서 더 나아가 `최근 연결 확인`, read-only health, generatedAt/기준 시점, build/ping affordance까지 함께 손보면 곧바로 freshness/health semantics와 operator flow를 다시 열게 된다. [검증 필요]
- next smallest candidate
  - current next question은 “data-sources trust helper spike를 구현할지”가 아니라, 이미 landing한 scope 이후에 남은 diagnostics-heavy surface를 어디서 다시 자를지다.
  - if this route stays in scope, safest next `N5` cut은 broad data-sources rewrite가 아니라 `/settings/data-sources` diagnostics-boundary docs-first memo다. 범위는 `상세 운영 진단` introduction, production read-only diagnostics 안내, `확장 후보`와 diagnostics adjacency 정도로만 좁히는 편이 안전하다.
  - 비범위 항목은 route/href 변경, trust/data-source freshness policy 변경, ping/build semantics 변경, env/operator 설명 재설계, diagnostics table/card 구조 변경, stable/public IA 재편이다.

### settings-data-sources diagnostics-boundary candidate memo

- settings-data-sources diagnostics-boundary role map
  - `확장 후보`는 trust/freshness owner 아래의 support/follow-through layer다. 현재 사용자에게 보이는 기준을 다시 설명하는 primary trust helper가 아니라, 다음 단계에서 넓힐 수 있는 후보와 노출 전 체크를 정리하는 보조 블록으로 읽는 편이 맞다.
  - `상세 운영 진단`은 dev/ops-only diagnostics boundary layer다. `DataSourceHealthTable`이 다루는 fallback/cooldown, raw health aggregation, 최근 오류 로그는 사용자용 현재 상태 설명과 분리된 후행 진단으로 남아야 한다.
  - production에서 보이는 diagnostics 제한 카드는 “데이터가 비었다”는 사용자 상태 경고가 아니라, detailed diagnostics disclosure가 dev-only라는 boundary helper다. user-facing trust helper는 위 카드들에서 이미 닫히고, production 안내는 그 뒤에 dev-only 정보 비노출 사실만 정리해야 한다.
  - raw health/error/ping/build detail은 user-facing helper와 같은 층위로 읽히면 안 된다. 특히 `DataSourceHealthTable` 안의 `사용자 도움 기준 요약`은 dev API가 주입하는 read-only meta를 보는 operator read-through로 해석해야지, 위 user-facing trust helper의 연장으로 올리면 안 된다.
- smallest viable next candidate
  - current diagnostics-boundary surface의 smallest viable next candidate는 `/settings/data-sources` section-level copy/helper polish spike다.
  - 가장 안전한 첫 구현 범위는 `확장 후보` description, `상세 운영 진단` introduction, production read-only 제한 안내처럼 page-level boundary wording만 정리하는 것이다.
  - `DataSourceHealthTable` 내부 title/description, `OpenDartStatusCard` dev action wording, `DataSourceStatusCard` ping/build affordance는 이 smallest cut에 포함하지 않는다.
- defer for now / `[검증 필요]`
  - `DataSourceHealthTable`의 `Fallback & 쿨다운 진단`, `사용자 도움 기준 요약`, `최근 오류 로그` 구조를 다시 묶거나 rename하는 일은 diagnostics schema와 operator workflow를 다시 여는 일에 가깝다. [검증 필요]
  - health API 집계 기준, read-only meta 노출 기준, recent ping snapshot, OpenDART build/status 버튼 semantics를 바꾸는 일은 copy/helper polish가 아니라 freshness/health policy와 action contract 변경이다. [검증 필요]
  - env/operator disclosure, dev-only details visibility, production nonexposure 규칙을 다시 설계하는 일은 security/runtime contract까지 걸린다. [검증 필요]
  - `확장 후보`를 현재 trust helper보다 앞세우거나 diagnostics와 시각적으로 합치는 일은 support/follow-through vs diagnostics boundary를 흐리게 만들 수 있다. [검증 필요]
- next cut recommendation
  - current next `N5` cut은 broad diagnostics rewrite가 아니라 `/settings/data-sources` diagnostics-boundary copy/helper spike여야 한다.
  - first implementation은 `확장 후보`가 support/follow-through라는 점, `상세 운영 진단`이 dev-only라는 점, production에서는 diagnostics를 제한하고 위 trust helper만 read-only로 남긴다는 점을 더 쉽게 읽히게 하는 문구 정리에만 한정하는 편이 안전하다.
  - 비범위 항목은 route/href 변경, trust/data-source freshness policy 변경, ping/build semantics 변경, env/operator 설명 재설계, diagnostics table/card 구조 변경, stable/public IA 재편이다.
  - broad diagnostics rewrite가 위험한 이유는 한 구역 안에 raw health row, fallback/cooldown, recent error log, read-only meta, OpenDART build/status flow가 함께 있어 작은 helper 수정도 곧바로 operator affordance나 freshness contract 의미를 바꿀 수 있기 때문이다.

### settings-data-sources diagnostics-boundary post-spike sync memo

- landed scope
  - `/settings/data-sources` diagnostics-boundary copy/helper polish는 landing했고, 실제 변경 범위는 `확장 후보` section description, `상세 운영 진단` section description, production diagnostics 제한 안내 문구, production helper paragraph 정리까지다.
  - 이번 spike로 `확장 후보`는 위 trust helper 뒤에 읽는 support/follow-through layer, `상세 운영 진단`은 그 다음에 여는 dev-only diagnostics boundary라는 읽기 순서가 더 분명해졌다.
- unchanged boundary
  - `DataSourceHealthTable` 구조, `DataSourceStatusCard` wording, `OpenDartStatusCard` wording, ping/build semantics, freshness/health policy, route/href contract는 그대로 유지됐다.
  - raw health row, read-only meta, recent ping/build affordance의 노출 방식도 이번 spike 기준으로는 재설계되지 않았다.
- next smallest candidate
  - current next question은 diagnostics-boundary wording을 구현할지 여부가 아니라, 그 다음 diagnostics-heavy surface를 어디서 다시 자를지다.
  - safest next `N5` candidate는 broad diagnostics rewrite가 아니라 `/settings/data-sources` `DataSourceHealthTable` operator/read-only-meta boundary docs-first memo다.
  - 특히 `사용자 도움 기준 요약` title이 operator read-through인지 user-facing helper의 연장인지 다시 자르는 docs-first 정리가 선행돼야 한다. [검증 필요]
  - 비범위 항목은 route/href 변경, freshness/health policy 변경, ping/build semantics 변경, env/operator disclosure 재설계, diagnostics table/card 구조 변경, stable/public IA 재편이다.

### settings-data-sources DataSourceHealthTable operator-read-only-meta boundary candidate memo

- `DataSourceHealthTable` role map
  - `Fallback & 쿨다운 진단`은 명확한 dev/operator diagnostics layer다. source configured/replay/next retry/last snapshot row는 사용자에게 바로 보이는 기준을 다시 설명하는 것이 아니라, fallback과 retry 상태를 운영자가 점검하는 raw diagnostics table로 읽는 편이 맞다.
  - `사용자 도움 기준 요약`은 user-facing trust helper의 연장이 아니라 operator read-only-meta layer다. 여기서 보여 주는 read-only title/status/checkedAt와 `health API 집계`는 “사용자 화면에 어떤 최신 기준이 주입됐는지”를 운영자가 다시 읽는 메타 요약이지, 사용자용 canonical helper를 다시 제공하는 블록이 아니다.
  - `최근 오류 로그`는 가장 raw한 dev/ops-only diagnostics layer다. route/source/code/status/message/trace ID는 operator incident read-through로 남겨야 하며, user-facing trust helper와 같은 읽기 층위로 올리면 안 된다.
  - current confusion point는 `사용자 도움 기준 요약`이라는 title 때문에 operator meta가 user-facing helper의 연장처럼 보일 수 있다는 점이다. 실제로는 `PageHeader`·impact card·source/OpenDART card에서 user helper는 이미 닫히고, `DataSourceHealthTable`은 그 뒤의 diagnostics surface다.
- smallest viable next candidate
  - current surface 안의 smallest viable next candidate는 `/settings/data-sources` `DataSourceHealthTable` operator/read-only-meta boundary copy/helper spike다.
  - 가장 안전한 첫 구현 범위는 `Fallback & 쿨다운 진단`, `사용자 도움 기준 요약`, `최근 오류 로그` section title/description을 “raw operator diagnostics / operator meta / incident log” 경계로 더 또렷하게 읽히게 만드는 문구 정리다.
  - row schema, badge meaning, trace copy affordance, loading/empty/error semantics는 이 smallest cut에 포함하지 않는다.
- defer for now / `[검증 필요]`
  - `/api/dev/data-sources/health` 응답 구조, read-only meta 조합 기준, `health API 집계` 계산 로직, OpenDART configured 보조 정보는 diagnostics schema와 freshness/health policy에 걸친다. [검증 필요]
  - `/api/dev/errors/recent` limit, trace copy flow, route/source/code/status/message column set을 바꾸는 일은 operator incident workflow 변경에 가깝다. [검증 필요]
  - `Fallback & 쿨다운 진단` table column 재배치, `사용자 도움 기준 요약` card 구성 재배치, `최근 오류 로그` table 리디자인은 broad diagnostics table rewrite로 번질 수 있다. [검증 필요]
  - `DataSourceStatusCard`/`OpenDartStatusCard`와 `DataSourceHealthTable` 사이에서 recent ping/build/helper wording을 한 번에 다시 맞추려 들면 ping/build semantics와 env/operator disclosure contract를 다시 열게 된다. [검증 필요]
- next cut recommendation
  - current next `N5` cut은 broad diagnostics table rewrite가 아니라 `/settings/data-sources` `DataSourceHealthTable` operator/read-only-meta boundary copy/helper spike여야 한다.
  - first implementation은 operator raw diagnostics, operator read-only meta, recent incident log의 읽기 층위를 title/description 수준에서만 분리하는 편이 안전하다.
  - 비범위 항목은 route/href 변경, freshness/health policy 변경, ping/build semantics 변경, env/operator flow 재설계, diagnostics table/card 구조 변경, stable/public IA 재편이다.
  - broad diagnostics table rewrite가 위험한 이유는 한 컴포넌트 안에 `/api/dev/data-sources/health` raw row, read-only meta, health aggregation, `/api/dev/errors/recent` incident log, trace copy flow가 함께 있어 작은 문구 수정도 곧바로 diagnostics schema나 operator workflow 의미를 바꿀 수 있기 때문이다.

### settings-data-sources DataSourceHealthTable operator-read-only-meta boundary post-spike sync memo

- actual landed scope
  - `DataSourceHealthTable` operator/read-only-meta boundary copy/helper polish는 landing했고, 실제 변경 범위는 component 상단 operator helper 문구, `Fallback & 쿨다운 진단` → `운영 fallback · 쿨다운 진단`, `사용자 도움 기준 요약` → `운영용 read-only 메타 요약`, `최근 오류 로그` → `운영 최근 오류 로그`, 각 section description tone 조정까지다.
- unchanged boundary
  - table/card 구조, column 구성, `readOnly`/`healthSummary` 렌더링 로직, trace copy flow, ping/build semantics, freshness/health policy, route/href contract는 그대로 유지됐다.
- current next question
  - current next question은 더 이상 `DataSourceHealthTable` wording을 구현할지 여부가 아니라, 남은 diagnostics-adjacent surface를 어떤 docs-first cut으로 다시 자를지다.
- next smallest candidate
  - safest next `N5` candidate는 broad diagnostics rewrite가 아니라 `/settings/data-sources` `DataSourceStatusCard`·`OpenDartStatusCard` dev-action/disclosure boundary docs-first memo다. [검증 필요]
  - 이 다음 cut도 recent ping/build action wording, dev-only disclosure, user-facing current-state helper 경계만 좁게 정리해야 한다.
- residual risk
  - `DataSourceStatusCard`의 recent ping snapshot과 dev details disclosure, `OpenDartStatusCard`의 build/status action과 dev-only index info는 한 카드 안에서 같이 읽히므로, 바로 broad rewrite로 들어가면 ping/build semantics와 env/operator disclosure contract를 다시 열 수 있다. [검증 필요]

### settings-data-sources status-cards dev-action-disclosure boundary candidate memo

- status-cards role map
  - `DataSourceStatusCard`에서 `사용자에게 보이는 영향`은 primary user-facing current-state helper이고, `현재 읽는 기준`은 그 다음 trust/read-basis helper다.
  - `DataSourceStatusCard`의 `최근 연결 확인`은 dev-only disclosure가 아니라 현재 읽는 기준을 보조하는 support validation helper다. 다만 recent ping snapshot tone과 badge가 강해 개발용 상태처럼 읽힐 여지가 있어, user-facing helper와 dev-only disclosure 사이의 경계 메모가 필요하다.
  - `DataSourceStatusCard`의 `개발용 연결 조건과 메모 보기`는 명확한 dev-only disclosure layer이고, footer `DataSourcePingButton`은 그 아래의 dev-only action layer다.
  - `OpenDartStatusCard`에서 `사용자에게 먼저 보이는 기준`은 primary user summary, `지금 읽는 기준`은 read-through trust basis다. 우측 `필요할 때만 보는 개발용 관리`와 그 안의 build/refresh button, `개발용 인덱스 정보 보기`는 dev-action/disclosure boundary로 읽어야 한다.
  - production에서는 `OpenDartStatusCard` 우측 영역이 action 대신 read-only disclosure로만 남고, `DataSourceStatusCard`는 `canPing` false일 때 dev details와 ping action을 숨긴다. route/page contract를 바꾸지 않는 한 이 boundary는 copy/helper로만 좁게 다루는 편이 안전하다.
- smallest viable next candidate
  - current surface 안의 smallest viable next candidate는 `/settings/data-sources` `DataSourceStatusCard`·`OpenDartStatusCard` dev-action/disclosure boundary copy/helper spike다.
  - 가장 안전한 첫 구현 범위는 card header helper, `최근 연결 확인` 주변 안내, `개발용 연결 조건과 메모 보기`, `필요할 때만 보는 개발용 관리`, `개발용 인덱스 정보 보기`의 tone을 정리해 user helper와 dev-only disclosure/action의 읽는 순서를 더 분명히 만드는 문구 조정이다.
  - ping/build action behavior, snapshot badge/status 의미, env key 출력, build notice/error notice wording ownership은 이 smallest cut에 포함하지 않는다.
- defer for now / `[검증 필요]`
  - `DataSourceStatusCard`의 recent ping snapshot은 local storage 기반이라 visibility/ownership을 바꾸면 ping snapshot semantics와 저장 contract를 다시 열 수 있다. [검증 필요]
  - `OpenDartStatusCard`의 build endpoint, `canAutoBuild`, `autoBuildDisabledReason`, build notice/error는 action semantics와 operator workflow에 걸친다. [검증 필요]
  - `DataSourceStatusCard` env key 노출, `autoEndpointHint`, `source.status.message`, `OpenDartStatusCard` primaryPath/message disclosure를 재설계하는 일은 env/operator disclosure contract 변경에 가깝다. [검증 필요]
  - 두 카드를 한 번에 재배치하거나 status badge/notice 위치를 바꾸는 일은 broad card rewrite로 번질 수 있다. [검증 필요]
- next cut recommendation
  - current next `N5` cut은 broad status-card rewrite가 아니라 `/settings/data-sources` status-cards dev-action/disclosure boundary copy/helper spike여야 한다.
  - first implementation은 user-facing current-state helper, support validation helper, dev-only disclosure, dev-only action의 층위를 title/description/helper 수준에서만 분리하는 편이 안전하다.
  - 비범위 항목은 route/href 변경, ping/build semantics 변경, freshness/health policy 변경, env/operator disclosure contract 재설계, status schema 변경, stable/public IA 재편이다.
  - broad card rewrite가 위험한 이유는 `DataSourceStatusCard`와 `OpenDartStatusCard` 안에 user summary, read-basis, recent ping/build status, dev-only disclosure, action affordance가 함께 있어 문구 수정이 곧바로 ping/build flow ownership과 operator disclosure 의미를 흔들 수 있기 때문이다.

### settings-data-sources status-cards dev-action-disclosure boundary post-spike sync memo

- landed scope
  - status-cards dev-action/disclosure boundary copy/helper polish는 landing했고, 실제 변경 범위는 `DataSourceStatusCard` header helper, `최근 연결 확인 참고`와 보조 helper, `개발용 연결 조건과 내부 메모만 보기` disclosure tone, footer ping helper, `OpenDartStatusCard` header helper, `필요할 때만 여는 개발용 관리` 영역 helper, build action helper, `개발용 인덱스 정보만 보기` disclosure helper 조정까지다.
  - 이번 spike로 두 카드 모두 user-facing current-state helper를 먼저 읽고, dev-only disclosure/action은 아래 또는 우측 개발용 관리 구간에서만 읽는다는 순서가 더 분명해졌다.
- unchanged boundary
  - ping/build button 동작, endpoint, local storage snapshot ownership, env key/endpoint/message disclosure 구조, status schema, route/href contract, card 구조 재배치는 그대로 유지됐다.
  - `buildNotice`/`buildError`, recent ping snapshot detail ownership, disabled reason semantics도 이번 spike 기준으로는 재설계되지 않았다.
- current next question
  - current next question은 더 이상 status-card wording을 구현할지 여부가 아니라, 그 다음 diagnostics-adjacent smallest cut을 무엇으로 둘지다.
- next smallest candidate
  - safest next `N5` candidate는 broad data-sources rewrite가 아니라 `/settings/data-sources` `DataSourceStatusCard` recent-ping support-helper ownership docs-first memo다. [검증 필요]
  - `OpenDartStatusCard` build notice/error와 dev-action wording은 action semantics와 더 강하게 묶여 있으므로, recent ping support-helper 경계를 먼저 좁히는 편이 안전하다.
- residual risk
  - `DataSourceStatusCard`의 recent ping snapshot은 wording으로 support helper임을 분명히 했어도 local storage 기반 ownership이 그대로라, visibility나 ownership을 다시 건드리면 ping snapshot semantics와 저장 contract를 다시 열 수 있다. [검증 필요]
  - `OpenDartStatusCard`의 build/refresh action, disabled reason, build notice/error는 helper tone만 정리된 상태라, broad rewrite로 가면 ping/build semantics와 env/operator disclosure contract를 다시 흔들 수 있다. [검증 필요]

### settings-data-sources recent-ping support-helper ownership post-spike sync memo

- actual landed scope
  - recent-ping support-helper ownership copy/helper polish는 landing했고, 실제 변경 범위는 `최근 연결 확인 참고` title, recent evidence layer를 설명하는 support helper 한 줄, `fetchedAt`/detail chips 안내, footer helper 문구 조정까지다.
  - 이번 spike로 recent ping snapshot은 `현재 읽는 기준`을 다시 확인할 때만 참고하는 support evidence라는 읽는 순서가 더 분명해졌다.
- unchanged boundary
  - `DataSourcePingButton` 동작, `/api/dev/data-sources/ping` endpoint contract, local storage snapshot ownership, `DATA_SOURCE_PING_UPDATED_EVENT`, `createDataSourcePingSnapshot()` contract, snapshot schema, route/href contract는 그대로 유지됐다.
  - snapshot badge/status 의미, detail chips field set, stale 표기, hidden/show 조건, stable/public IA도 이번 spike 기준으로는 재설계되지 않았다.
- current next question
  - current next question은 더 이상 recent-ping helper wording을 구현할지 여부가 아니라, status surface 안에서 그 다음 smallest docs-first cut을 무엇으로 둘지다.
- next smallest candidate
  - safest next `N5` candidate는 broad ping/status rewrite가 아니라 더 작은 docs-first candidate memo 수준이어야 한다.
  - if this route stays in scope, current narrow candidate는 `/settings/data-sources` `OpenDartStatusCard` build-notice/disabled-reason helper ownership docs-first memo다. build endpoint, button semantics, env/operator disclosure contract 재설계는 포함하지 않는다. [검증 필요]
- residual risk
  - recent ping snapshot은 wording만 support helper로 좁혀졌고 storage/event ownership은 그대로라, 이를 다시 열면 곧바로 ping semantics와 snapshot contract를 건드리게 된다. [검증 필요]
  - `OpenDartStatusCard`의 build/refresh action, `autoBuildDisabledReason`, `buildNotice`/`buildError`는 helper wording과 action semantics가 더 강하게 묶여 있어, broad rewrite로 가면 ping/build semantics와 env/operator disclosure contract를 다시 흔들 수 있다. [검증 필요]

### settings-data-sources OpenDartStatusCard build-notice-disabled-reason helper ownership post-spike sync memo

- actual landed scope
  - build-notice/disabled-reason helper ownership copy/helper polish는 landing했고, 실제 변경 범위는 dev-only 관리 영역 introduction/helper, build/refresh action 위 helper, `autoBuildDisabledReason` helper tone, 하단 `buildNotice`/`buildError` 영역 label/helper 조정까지다.
  - 이번 spike로 `autoBuildDisabledReason`은 dev-only disabled-state helper, `buildNotice`/`buildError`는 build action result helper라는 읽는 순서가 더 분명해졌다.
- unchanged boundary
  - build endpoint, button semantics, `canAutoBuild`/disabled 조건, `primaryPath`/`status.message` disclosure 구조, status schema, route/href contract, card 구조 재배치는 그대로 유지됐다.
  - `사용자에게 먼저 보이는 기준`, `지금 읽는 기준`, 인덱스 준비/마지막 생성 기준/회사 수의 user-facing trust/read-through helper 구조도 이번 spike 기준으로는 재설계되지 않았다.
- current next question
  - current next question은 더 이상 OpenDART helper wording을 구현할지 여부가 아니라, 그 다음 smallest docs-first cut을 무엇으로 둘지다.
- next smallest candidate
  - safest next `N5` candidate는 broad OpenDART/data-sources rewrite가 아니라 더 작은 docs-first candidate memo 수준이어야 한다.
  - if this route stays in scope, current narrow candidate는 `/settings/data-sources` `OpenDartStatusCard` `primaryPath`/`status.message` disclosure ownership docs-first memo다. build endpoint, button semantics, env/operator disclosure contract 재설계는 포함하지 않는다. [검증 필요]
- residual risk
  - `buildNotice`/`buildError`는 wording으로 action-result helper임을 더 분명히 했어도 card 하단에 남아 있으므로, 위치나 의미를 다시 정의하면 current-state helper와 action-result helper 경계를 다시 열 수 있다. [검증 필요]
  - `autoBuildDisabledReason`은 여전히 build button disabled semantics와 직접 묶여 있어, button 조건이나 operator workflow를 건드리면 helper wording만의 문제로 남지 않는다. [검증 필요]
  - `primaryPath`, `status.message`, `개발용 인덱스 정보만 보기`는 dev-only disclosure ownership과 env/operator disclosure contract에 더 가깝다. 이를 build result helper와 함께 다시 열면 broad OpenDART card rewrite로 번질 수 있다. [검증 필요]

### settings-data-sources OpenDartStatusCard primaryPath-status.message disclosure ownership candidate memo

- OpenDartStatusCard disclosure role map
  - `사용자에게 먼저 보이는 기준`과 `지금 읽는 기준`은 user-facing trust/read-through helper다. API 키, 인덱스 준비 여부, 마지막 생성 기준, 회사 수를 현재 검색/상세 화면이 어떤 기준으로 읽히는지 설명하는 층위로 유지한다.
  - `개발용 인덱스 정보만 보기` 전체는 build action result helper와 다른 dev-only disclosure layer다. details를 열기 전까지 숨겨지고, 현재 인덱스 trace와 운영 메모를 개발 환경에서만 다시 보는 disclosure로 읽어야 한다.
  - `primaryPath`는 user-facing 현재 상태가 아니라 dev-only index trace disclosure다. 인덱스 파일 경로를 추적하는 operator/developer 메모로만 남겨야 한다.
  - `status.message`는 user-facing 경고가 아니라 operator/dev disclosure memo다. 현재 card에서는 왼쪽 user-facing warning에 raw message를 그대로 싣지 않고, details 내부 `개발용 안내`에서만 노출하므로 disclosure ownership으로 읽는 편이 맞다.
  - card 하단 `buildNotice`/`buildError`는 방금 실행한 점검 결과를 보여 주는 action-result helper다. `primaryPath`/`status.message` disclosure와 source와 수명이 다르므로 같은 층위로 합치면 안 된다.
- smallest viable next candidate
  - current surface 안의 smallest viable next candidate는 `/settings/data-sources` `OpenDartStatusCard` `primaryPath`/`status.message` disclosure ownership copy/helper spike다.
  - 가장 안전한 첫 구현 범위는 `개발용 인덱스 정보만 보기` summary/helper, `인덱스 파일 경로`, `개발용 안내` 주변 문구를 더 분명히 해 path/message를 user-facing current-state나 build action result가 아니라 dev-only disclosure 메모로 읽히게 만드는 문구 정리다.
  - `사용자에게 먼저 보이는 기준`, `지금 읽는 기준`, build/refresh action helper, `autoBuildDisabledReason`, `buildNotice`/`buildError`는 이 smallest cut에서 다시 설계하지 않는다.
- defer for now / `[검증 필요]`
  - `status.message`의 source semantics, `primaryPath`의 trusted provenance, details open/closed interaction은 env/operator disclosure contract와 붙어 있다. wording을 넘어 source나 policy를 다시 정의하는 일은 docs-first 범위를 넘는다. [검증 필요]
  - build endpoint, button semantics, `canAutoBuild`/disabled 조건, `buildNotice`/`buildError` semantics를 disclosure 문제와 함께 다시 여는 일은 action layer와 disclosure layer를 동시에 흔든다. [검증 필요]
  - `status.message`를 왼쪽 user-facing warning으로 다시 승격하거나, `primaryPath`를 항상 보이는 상태 정보처럼 올리는 일은 trust/read-through helper와 dev-only disclosure boundary를 동시에 흐린다. [검증 필요]
- next cut recommendation
  - current next `N5` cut은 broad OpenDART card rewrite가 아니라 `/settings/data-sources` `OpenDartStatusCard` `primaryPath`/`status.message` disclosure ownership copy/helper spike여야 한다.
  - first implementation은 build endpoint, button semantics, `canAutoBuild`/disabled 조건, build result semantics, status schema를 건드리지 않고, details disclosure layer를 dev-only trace/memo로 더 또렷하게 읽히게 만드는 문구 정리에만 머무는 편이 안전하다.
  - 비범위 항목은 실제 UI 구현, `src/components/OpenDartStatusCard.tsx` 로직 수정, build endpoint 변경, button semantics 변경, `canAutoBuild`/disabled 조건 변경, `buildNotice`/`buildError` semantics 재정의, status schema 변경, route/href 변경, stable/public IA 재편이다.
  - broad OpenDART card rewrite가 위험한 이유는 한 카드 안에 user-facing trust/read-through helper, dev-only action, action-result helper, disabled-state helper, details disclosure가 함께 붙어 있어, disclosure 문구를 다시 쓰는 일이 곧바로 env/operator disclosure contract와 current-state ownership 재설계로 번지기 쉽기 때문이다.

### settings-data-sources OpenDartStatusCard primaryPath-status.message disclosure ownership post-spike sync memo

- actual landed scope
  - primaryPath-status.message disclosure ownership copy/helper polish는 landing했고, 실제 변경 범위는 `개발용 인덱스 정보만 보기` helper tone, `인덱스 파일 경로` 주변 helper, `개발용 운영 메모` label/helper tone 조정까지다.
  - 이번 spike로 details disclosure layer는 user-facing trust/read-through helper나 card 하단 `buildNotice`/`buildError` action-result helper와 다른 dev-only index trace/운영 메모라는 읽는 순서가 더 분명해졌다.
- unchanged boundary
  - build endpoint, button semantics, `canAutoBuild`/disabled 조건, `buildNotice`/`buildError` semantics, `status.message` source semantics, `primaryPath` provenance 정의, details open/closed interaction, status schema, route/href contract는 그대로 유지됐다.
  - `사용자에게 먼저 보이는 기준`, `지금 읽는 기준`, 좌측 missing-index user-facing warning block의 구조/위치도 이번 spike 기준으로는 재설계되지 않았다.
- current next question
  - current next question은 더 이상 disclosure wording을 구현할지 여부가 아니라, 그 다음 smallest docs-first cut을 무엇으로 둘지다.
- next smallest candidate
  - safest next `N5` candidate는 broad OpenDART/data-sources rewrite가 아니라 더 작은 docs-first candidate memo 수준이어야 한다.
  - if this route stays in scope, current narrow candidate는 `/settings/data-sources` `OpenDartStatusCard` missing-index user-facing warning ownership docs-first memo다. 좌측 warning block을 user-facing 추가 주의 helper로 읽을지, 위 user summary의 제한 상태를 반복하는 support helper로 읽을지부터 좁히고 raw `status.message` 승격이나 build/button/disclosure contract 재설계는 포함하지 않는다. [검증 필요]
- residual risk
  - `status.message` source semantics와 `primaryPath` provenance는 이번 spike에서도 그대로라, 이를 다시 열면 곧바로 env/operator disclosure contract 재정의로 번질 수 있다. [검증 필요]
  - 좌측 missing-index warning, 상단 user summary/read-through helper, details disclosure layer를 한 배치로 다시 열면 user-facing trust helper와 dev-only disclosure boundary를 동시에 흔들 수 있다. [검증 필요]

### settings-data-sources OpenDartStatusCard missing-index user-facing warning ownership candidate memo

- missing-index warning role map
  - `사용자에게 먼저 보이는 기준`은 missing index 상황에서도 가장 먼저 읽는 primary summary다. API 키 준비 여부와 회사 검색/공시 상세 제한 상태를 한 문단으로 먼저 닫는다.
  - `지금 읽는 기준`은 인덱스 준비 여부, 마지막 생성 기준, 회사 수를 보여 주는 read-through basis다. amber warning block보다 먼저 읽히는 current-state 사실 층위로 유지한다.
  - `!exists && status?.message`일 때 보이는 좌측 amber warning block은 raw `status.message`를 직접 노출하는 current-state warning이라기보다, 위 summary/read-through에서 이미 설명한 missing-index 제한을 한 번 더 짚어 주는 user-facing secondary helper로 읽는 편이 맞다.
  - 이 block은 좌측 user-facing 영역 안에 남는 추가 주의/helper 층위이며, `개발용 인덱스 정보만 보기` details disclosure나 하단 `buildNotice`/`buildError` action-result helper와는 source와 독자가 다르다.
  - raw `status.message`는 계속 details 내부 `개발용 운영 메모`에만 남아 있으므로, amber warning block을 operator/dev disclosure로 재해석하거나 raw message를 user-facing으로 승격하면 안 된다.
- smallest viable next candidate
  - current surface 안의 smallest viable next candidate는 `/settings/data-sources` `OpenDartStatusCard` missing-index user-facing warning ownership copy/helper spike다.
  - 가장 안전한 첫 구현 범위는 좌측 amber warning block의 title/helper tone을 정리해, 이 block을 현재 상태 facts를 새로 추가하는 경고가 아니라 위 summary/read-through를 보조하는 추가 주의/helper로 읽히게 만드는 문구 정리다.
  - `사용자에게 먼저 보이는 기준`, `지금 읽는 기준`, details disclosure layer, build/refresh action helper, `autoBuildDisabledReason`, `buildNotice`/`buildError`는 이 smallest cut에서 다시 설계하지 않는다.
- defer for now / `[검증 필요]`
  - `status.message` source semantics, `primaryPath` provenance, details open/closed interaction은 env/operator disclosure contract와 붙어 있다. amber warning 문제와 함께 source나 policy를 다시 정의하는 일은 docs-first 범위를 넘는다. [검증 필요]
  - amber warning의 show/hide 조건인 `!exists && status?.message`를 바꾸거나, raw `status.message`를 좌측에 직접 노출하는 일은 copy/helper 정리가 아니라 warning contract 재설계에 가깝다. [검증 필요]
  - 좌측 warning block을 user summary 안으로 흡수하거나 `지금 읽는 기준` 표와 합치는 일은 trust/read-through helper 구조 자체를 흔들 수 있다. [검증 필요]
- next cut recommendation
  - current next `N5` cut은 broad OpenDART card rewrite가 아니라 `/settings/data-sources` `OpenDartStatusCard` missing-index user-facing warning ownership copy/helper spike여야 한다.
  - first implementation은 raw `status.message` 승격 없이 좌측 amber warning의 reading order와 helper tone만 정리하고, build endpoint, button semantics, `canAutoBuild`/disabled 조건, `buildNotice`/`buildError` semantics, `status.message` source semantics, status schema는 건드리지 않는 편이 안전하다.
  - 비범위 항목은 실제 UI 구현, `src/components/OpenDartStatusCard.tsx` 로직 수정, build endpoint 변경, button semantics 변경, `canAutoBuild`/disabled 조건 변경, `buildNotice`/`buildError` semantics 재정의, `status.message` source semantics 변경, `primaryPath` provenance 정의 변경, details interaction 변경, status schema 변경, route/href 변경, stable/public IA 재편이다.
  - broad OpenDART card rewrite가 위험한 이유는 한 카드 안에 primary summary, read-through basis, missing-index helper, dev-only disclosure, build action/result helper가 함께 있어, amber warning ownership을 다시 쓰는 일이 곧바로 current-state warning contract와 env/operator disclosure contract를 동시에 흔들기 쉽기 때문이다.

### settings-data-sources OpenDartStatusCard missing-index user-facing warning ownership post-spike sync memo

- actual landed scope
  - missing-index user-facing warning ownership copy/helper polish는 landing했고, 실제 변경 범위는 좌측 amber warning block label, warning 본문 tone, user-facing secondary helper 한 줄 조정까지다.
  - 이번 spike로 amber warning block은 raw current-state warning이 아니라, 위 primary summary와 read-through basis를 다시 짚는 user-facing secondary helper라는 읽는 순서가 더 분명해졌다.
- unchanged boundary
  - raw `status.message`는 계속 details 내부 `개발용 운영 메모`에 남아 있고, warning show/hide 조건 `!exists && status?.message`, build endpoint, button semantics, `canAutoBuild`/disabled 조건, `buildNotice`/`buildError` semantics, details disclosure 구조, route/href contract는 그대로 유지됐다.
  - `사용자에게 먼저 보이는 기준`, `지금 읽는 기준`, details disclosure layer, build action/result helper의 구조와 위치도 이번 spike 기준으로는 재설계되지 않았다.
- current next question
  - current next question은 더 이상 missing-index warning wording을 구현할지 여부가 아니라, 그 다음 smallest docs-first cut을 무엇으로 둘지다.
- next smallest candidate
  - safest next `N5` candidate는 broad OpenDART/data-sources rewrite가 아니라 더 작은 docs-first candidate memo 수준이어야 한다.
  - if this route stays in scope, current narrow candidate는 `/settings/data-sources` `OpenDartStatusCard` loading-error empty-state helper ownership docs-first memo다. `상태를 불러오는 중...`, fetch error, `정보 없음`이 `지금 읽는 기준` 안의 read-through fallback인지 별도 상태 helper인지부터 좁히고, fetch/status contract reopen이나 raw `status.message` 승격은 포함하지 않는다. [검증 필요]
- residual risk
  - loading/error empty-state helper를 다시 열 때 fetch failure semantics와 current-state helper 층위를 동시에 건드리면, 단순 문구 정리를 넘어 fetch/status ownership 논의로 번질 수 있다. [검증 필요]
  - 좌측 user-facing summary/read-through/warning helper, 우측 dev-only disclosure, 하단 build result helper를 한 배치로 다시 열면 broad OpenDART card rewrite로 커질 수 있다. [검증 필요]

### settings-data-sources OpenDartStatusCard loading-error empty-state helper ownership candidate memo

- loading-error empty-state role map
  - `사용자에게 먼저 보이는 기준`은 loading/error/empty 여부와 무관하게 먼저 읽는 primary summary다. API 키 준비 여부와 검색/상세 제한 가능성을 먼저 닫고, 아래 `지금 읽는 기준` fallback과는 다른 층위로 유지한다.
  - `지금 읽는 기준`은 기본적으로 인덱스 준비 여부, 마지막 생성 기준, 회사 수를 보여 주는 read-through basis다. `loading`, fetch error, `정보 없음`은 이 basis를 대신하는 fallback slot으로 읽어야 한다.
  - `상태를 불러오는 중...`은 read-through basis 확인을 잠시 보류하는 transitional helper다. 실패나 빈 상태가 아니라, current-state basis를 아직 확인 중이라는 임시 상태로 읽는 편이 맞다.
  - fetch error는 read-through basis fetch에 실패했다는 failure fallback이다. missing-index user-facing warning이나 dev-only disclosure와 달리, 현재 기준을 확인하지 못한 상태를 사용자에게 알리는 fallback으로 읽어야 한다.
  - `정보 없음`은 explicit error 없이 status가 비어 있을 때 남는 empty fallback이다. fetch error와 같은 red slot을 쓰더라도, 실패 원인을 말하는 문구가 아니라 확인할 기준 정보가 아직 비어 있는 상태를 나타내는 placeholder로 구분하는 편이 안전하다.
  - 이 fallback slot은 좌측 user-facing 영역 안에 남는 read-through basis 보조 상태/helper 층위다. missing-index secondary helper, details 내부 `개발용 운영 메모`, 하단 `buildNotice`/`buildError` action-result helper와는 source와 독자가 다르다.
- smallest viable next candidate
  - current surface 안의 smallest viable next candidate는 `/settings/data-sources` `OpenDartStatusCard` loading-error empty-state helper ownership copy/helper spike다.
  - 가장 안전한 첫 구현 범위는 `상태를 불러오는 중...`, fetch error, `정보 없음`의 wording만 정리해 loading은 transitional helper, error는 failure fallback, empty는 empty placeholder로 읽히게 만드는 문구 정리다.
  - `사용자에게 먼저 보이는 기준`, 정상 `지금 읽는 기준` 사실 블록, missing-index warning helper, details disclosure layer, build/refresh action helper, `autoBuildDisabledReason`, `buildNotice`/`buildError`는 이 smallest cut에서 다시 설계하지 않는다.
- defer for now / `[검증 필요]`
  - `fetchStatus()`의 response contract, 409/null handling, `status`가 null이면서 `error`가 비어 있는 경로의 semantics를 다시 정의하는 일은 copy/helper 범위를 넘는다. [검증 필요]
  - fetch error와 `정보 없음`이 현재 같은 red fallback slot을 쓰는 이유를 구조나 스타일 수준에서 다시 분리하는 일은 UI 구조/contract 문제로 커질 수 있다. [검증 필요]
  - fallback slot을 missing-index warning과 합치거나, dev-only disclosure에서 다시 설명하는 일은 user-facing trust helper와 operator disclosure 경계를 동시에 흐린다. [검증 필요]
- next cut recommendation
  - current next `N5` cut은 broad OpenDART card rewrite가 아니라 `/settings/data-sources` `OpenDartStatusCard` loading-error empty-state helper ownership copy/helper spike여야 한다.
  - first implementation은 fetch/status contract 재설계 없이 fallback wording만 정리하고, raw `status.message` 승격, build endpoint, button semantics, `canAutoBuild`/disabled 조건, `buildNotice`/`buildError` semantics, details disclosure 구조, status schema는 건드리지 않는 편이 안전하다.
  - 비범위 항목은 실제 UI 구현, `src/components/OpenDartStatusCard.tsx` 로직 수정, build endpoint 변경, button semantics 변경, `canAutoBuild`/disabled 조건 변경, `buildNotice`/`buildError` semantics 재정의, `status.message` source semantics 변경, `primaryPath` provenance 정의 변경, details interaction 변경, status schema 변경, route/href 변경, stable/public IA 재편이다.
  - broad OpenDART card rewrite가 위험한 이유는 한 카드 안에 primary summary, read-through basis facts, fallback slot, missing-index helper, dev-only disclosure, build action/result helper가 함께 있어, loading/error empty-state wording을 다시 쓰는 일이 곧바로 fetch/status contract와 disclosure contract를 동시에 흔들기 쉽기 때문이다.

### settings-data-sources OpenDartStatusCard loading-error empty-state helper ownership post-spike sync memo

- actual landed scope
  - loading-error empty-state helper ownership copy/helper polish는 landing했고, 실제 변경 범위는 `지금 읽는 기준을 확인하는 중입니다...`, loading helper 한 줄, `지금 읽는 기준을 아직 불러오지 못했습니다.`, fetch error helper 한 줄, `지금 읽는 기준 정보가 아직 없습니다.`, empty placeholder helper 한 줄 조정까지다.
  - 세 문구는 모두 `지금 읽는 기준` 안의 같은 fallback slot에 남아 있고, loading은 transitional helper, fetch error는 failure fallback, empty는 empty placeholder로 읽히게 정리됐다.
- unchanged boundary
  - `fetchStatus()` response contract, 409/null handling, `status` null 처리 로직, build endpoint, button semantics, `canAutoBuild`/disabled 조건, `buildNotice`/`buildError` semantics, details disclosure 구조, route/href contract는 그대로 유지됐다.
  - `사용자에게 먼저 보이는 기준`, 정상 `지금 읽는 기준` 사실 블록, missing-index warning helper, dev-only disclosure layer, build action/result helper의 구조와 위치도 이번 spike 기준으로는 재설계되지 않았다.
- current next question
  - current next question은 더 이상 loading/error/empty wording을 구현할지 여부가 아니라, 그 다음 smallest docs-first cut을 무엇으로 둘지다.
- next smallest candidate
  - safest next `N5` candidate는 broad OpenDART/data-sources rewrite가 아니라 더 작은 docs-first candidate memo 수준이어야 한다.
  - if this route stays in scope, current narrow candidate는 `/settings/data-sources` `OpenDartStatusCard` API-key badge-primary-summary ownership docs-first memo다. `API 키 연결됨/설정 필요` badge와 `사용자에게 먼저 보이는 기준` summary가 같은 configured signal을 어떤 층위로 나눠 읽혀야 하는지부터 좁히고, `configured` boolean semantics, `userSummary()` 분기, env/operator disclosure contract reopen은 포함하지 않는다. [검증 필요]
- residual risk
  - loading/error/empty fallback wording은 정리됐지만, 같은 card 상단의 API 키 badge와 primary summary ownership까지 곧바로 다시 쓰기 시작하면 current-state summary contract를 재정의하는 일로 번질 수 있다. [검증 필요]
  - 좌측 primary summary/read-through/fallback slot, missing-index helper, 우측 dev-only disclosure, 하단 build result helper를 한 배치로 다시 열면 broad OpenDART card rewrite로 커질 수 있다. [검증 필요]

### settings-data-sources OpenDartStatusCard API-key badge-primary-summary ownership candidate memo

- API-key badge-primary-summary role map
  - 우측 `API 키 연결됨/설정 필요` badge는 `configured` 여부를 한눈에 먼저 보여 주는 summary-adjacent status chip이다. 카드 전체의 read-through basis나 missing-index 제한 상태를 대신 설명하는 본문이 아니라, 설정 준비 여부를 빠르게 스캔하는 compact signal로 읽어야 한다.
  - 좌측 `사용자에게 먼저 보이는 기준` summary는 같은 `configured` 근거를 사용자 흐름 관점에서 풀어 쓰는 primary summary다. 회사 검색과 공시 상세가 현재 어떤 제한 또는 기준으로 읽히는지 먼저 닫아 주는 문단으로 유지하는 편이 맞다.
  - badge와 primary summary는 같은 신호를 공유하지만 완전한 중복은 아니다. badge는 `설정이 되어 있는가`를 짧게 답하고, primary summary는 `그 설정 상태가 사용자 흐름에 무엇을 의미하는가`를 설명하는 서로 다른 읽는 층위다.
  - badge는 dev-only disclosure나 env/operator 메모를 담는 자리가 아니고, primary summary도 build action result helper나 raw operator disclosure를 끌어오는 층위가 아니다. 둘을 하나의 경고/운영 안내로 합치면 상단 user-facing summary contract가 흐려진다.
- smallest viable next candidate
  - current surface 안의 smallest viable next candidate는 `/settings/data-sources` `OpenDartStatusCard` API-key badge-primary-summary ownership copy/helper spike다.
  - 가장 안전한 첫 구현 범위는 badge와 primary summary가 같은 configured signal을 서로 다른 층위로 읽히게 하는 wording/helper 정리다. chip의 quick-status tone과 summary의 user-flow explanation tone만 더 또렷하게 맞추고, 상태 계산이나 분기 로직은 건드리지 않는 편이 안전하다.
  - `지금 읽는 기준` facts/fallback slot, missing-index warning helper, details disclosure layer, build/refresh action helper, `autoBuildDisabledReason`, `buildNotice`/`buildError`는 이 smallest cut에서 다시 설계하지 않는다.
- defer for now / `[검증 필요]`
  - `configured` boolean semantics를 다시 정의하거나, `userSummary()` 분기 기준을 바꾸거나, env/operator disclosure contract를 다시 여는 일은 copy/helper 범위를 넘는다. [검증 필요]
  - badge 색상 체계, 위치, 크기, card header 배치까지 다시 만지는 일은 ownership memo가 아니라 구조 조정에 가깝다. [검증 필요]
  - primary summary에 loading/error/empty fallback이나 missing-index warning semantics를 다시 섞는 일은 top summary layer와 read-through basis layer 경계를 동시에 흔든다. [검증 필요]
- next cut recommendation
  - current next `N5` cut은 broad OpenDART card rewrite가 아니라 `/settings/data-sources` `OpenDartStatusCard` API-key badge-primary-summary ownership copy/helper spike여야 한다.
  - first implementation은 badge와 summary의 읽는 순서와 역할만 더 또렷하게 정리하고, `configured` boolean semantics, `userSummary()` 분기, build endpoint, button semantics, `canAutoBuild`/disabled 조건, details disclosure 구조, route/href 변경은 포함하지 않는 편이 안전하다.
  - 비범위 항목은 실제 UI 구현, `src/components/OpenDartStatusCard.tsx` 재수정, `configured` boolean semantics 변경, `userSummary()` 분기 변경, build endpoint 변경, button semantics 변경, `canAutoBuild`/disabled 조건 변경, details disclosure 구조 변경, route 추가/삭제, stable/public IA 재편이다.
  - broad OpenDART card rewrite가 위험한 이유는 card 상단에 header helper, API key chip, primary summary가 있고 그 아래에 read-through basis, fallback slot, missing-index helper, dev-only disclosure, build action/result helper가 연속으로 붙어 있어, badge-summary wording만 건드려도 곧바로 configured semantics와 다른 helper 층위를 함께 흔들기 쉽기 때문이다.

### settings-data-sources OpenDartStatusCard API-key badge-primary-summary ownership post-spike sync memo

- actual landed scope
  - API-key badge-primary-summary ownership copy/helper polish는 landing했고, 실제 변경 범위는 badge 아래 quick-status helper 한 줄과 `사용자에게 먼저 보이는 기준` 안의 순서 helper 한 줄 조정까지다.
  - 이 조정으로 badge는 API key 설정 여부를 먼저 빠르게 스캔하는 chip으로, primary summary는 그 상태가 회사 검색과 공시 상세에 무엇을 뜻하는지 이어서 읽는 summary로 더 또렷하게 분리됐다.
- unchanged boundary
  - `configuredLabel`, `userSummary()` 분기, badge 색상/배치/크기, loading/error/empty fallback wording, missing-index warning wording, details disclosure 구조, route/href contract는 그대로 유지됐다.
  - `지금 읽는 기준` facts/fallback slot, dev-only disclosure layer, build action/result helper의 구조와 위치도 이번 spike 기준으로는 재설계되지 않았다.
- current next question
  - current next question은 더 이상 badge-summary wording을 구현할지 여부가 아니라, 그 다음 smallest docs-first cut을 무엇으로 둘지다.
- next smallest candidate
  - safest next `N5` candidate는 broad OpenDART/data-sources rewrite가 아니라 더 작은 docs-first candidate memo 수준이어야 한다.
  - if this route stays in scope, current narrow candidate는 `/settings/data-sources` `OpenDartStatusCard` section-header helper ownership docs-first memo다. `공시 데이터 연결 상태` 아래 header helper가 top summary/read-through와 dev-only 관리 구간의 읽는 순서를 어떤 층위에서 안내하는지부터 좁히고, `configured` semantics, `userSummary()` 분기, env/operator disclosure contract reopen은 포함하지 않는다. [검증 필요]
- residual risk
  - badge-summary wording은 정리됐지만, 상단 header helper까지 곧바로 다시 쓰기 시작하면 card top-level orientation copy와 내부 summary ownership을 함께 흔들 수 있다. [검증 필요]
  - 상단 header helper, badge/summary, 하단 read-through/fallback, missing-index helper, dev-only disclosure, build result helper를 한 배치로 다시 열면 broad OpenDART card rewrite로 커질 수 있다. [검증 필요]

### settings-data-sources OpenDartStatusCard section-header helper ownership candidate memo

- section-header helper role map
  - `공시 데이터 연결 상태` 아래 helper는 card 전체를 여는 top-level orientation layer에 가깝다. 이 카드가 회사 검색/공시 상세의 현재 읽는 기준을 먼저 보여 주고, 개발용 인덱스 정보와 점검 액션은 아래 관리 구간에서만 확인하게 만드는 큰 읽기 방향을 먼저 잡아 준다.
  - 이 helper는 상단 badge와 `사용자에게 먼저 보이는 기준`을 먼저 읽게 하고, 우측 dev-only 관리 구간은 아래에서만 확인하게 만드는 reading-order bridge helper 역할도 함께 가진다. 즉, 단순한 section subtitle이라기보다 top user-facing layer와 lower dev-only boundary를 이어 주는 안내 문장으로 읽는 편이 맞다.
  - 현재 한 문장 안에 user-facing trust orientation과 dev-only boundary 안내가 함께 들어 있어 두 층위가 맞닿아 있다. 다만 이것이 곧바로 구조 문제를 뜻하는 것은 아니고, 현재 round에서는 copy/helper만으로도 어느 쪽을 먼저 읽어야 하는지 더 또렷하게 좁힐 여지가 있다.
  - 이 helper 자체를 badge/summary의 일부나 dev-only 관리 설명으로 흡수하면 card top-level orientation이 사라지거나, 반대로 dev-only boundary가 상단 user-facing trust helper에 섞일 수 있다.
- smallest viable next candidate
  - current surface 안의 smallest viable next candidate는 `/settings/data-sources` `OpenDartStatusCard` section-header helper ownership copy/helper spike다.
  - 가장 안전한 첫 구현 범위는 현재 한 문장이 맡는 top-level orientation과 reading-order bridge 역할을 wording 수준에서 더 분명히 하는 정리다. 상단 user-facing 기준을 먼저 읽고, 개발용 관리는 아래에서만 확인한다는 순서를 더 또렷하게 만드는 helper polish면 충분하다.
  - badge quick-status helper, `사용자에게 먼저 보이는 기준` helper, `지금 읽는 기준` facts/fallback slot, missing-index warning helper, details disclosure layer, build/refresh action helper, `buildNotice`/`buildError`는 이 smallest cut에서 다시 설계하지 않는다.
- defer for now / `[검증 필요]`
  - card header block 구조, badge 위치, summary 카드 위치, 좌우 column 배치까지 다시 만지는 일은 helper ownership이 아니라 card top-level information architecture 재조정에 가깝다. [검증 필요]
  - `configured` boolean semantics, `userSummary()` 분기, env/operator disclosure contract를 다시 여는 일은 header helper wording 범위를 넘는다. [검증 필요]
  - section helper를 dev-only management 소개 문구와 합치거나, badge-summary helper와 합쳐 상단 한 덩어리로 다시 설계하는 일은 top-level orientation과 lower boundary를 동시에 흔든다. [검증 필요]
- next cut recommendation
  - current next `N5` cut은 broad OpenDART card rewrite가 아니라 `/settings/data-sources` `OpenDartStatusCard` section-header helper ownership copy/helper spike여야 한다.
  - first implementation은 section helper가 card 전체 orientation이면서 lower dev-only boundary로 내려가는 reading-order guide라는 점만 더 또렷하게 정리하고, `configured` semantics, `userSummary()` 분기, build endpoint, button semantics, `canAutoBuild`/disabled 조건, details disclosure 구조, route/href 변경은 포함하지 않는 편이 안전하다.
  - 비범위 항목은 실제 UI 구현, `src/components/OpenDartStatusCard.tsx` 재수정, `configured` boolean semantics 변경, `userSummary()` 분기 변경, build endpoint 변경, button semantics 변경, `canAutoBuild`/disabled 조건 변경, details disclosure 구조 변경, route 추가/삭제, stable/public IA 재편이다.
  - broad OpenDART card rewrite가 위험한 이유는 이 helper가 card 맨 위에서 badge, primary summary, read-through basis, missing-index warning, dev-only disclosure, build result helper 전체의 읽는 방향에 닿아 있어, 문구 한 줄을 다시 쓰는 일이 곧바로 전체 surface hierarchy 논의로 커지기 쉽기 때문이다.

### settings-data-sources OpenDartStatusCard section-header helper ownership post-spike sync memo

- actual landed scope
  - section-header helper ownership copy/helper polish는 landing했고, 실제 변경 범위는 `공시 데이터 연결 상태` 아래 helper 한 줄을 `상단 상태 표시와 사용자용 요약`을 먼저 읽고 `아래 관리 구간`은 나중에 확인하게 만드는 reading-order bridge tone으로 조정한 것까지다.
  - 이 조정으로 section helper는 card 전체 orientation layer이면서 상단 user-facing summary와 하단 dev-only 관리 구간 사이의 reading-order guide라는 점이 더 직접적으로 드러났다.
- unchanged boundary
  - `configured` boolean semantics, `userSummary()` 분기, badge quick-status helper, `사용자에게 먼저 보이는 기준` helper, loading/error/empty fallback wording, missing-index warning wording, details disclosure 구조, build endpoint/button semantics, route/href contract는 그대로 유지됐다.
  - `지금 읽는 기준`의 정상 facts block과 fallback slot, dev-only disclosure layer, build action/result helper의 구조와 위치도 이번 spike 기준으로는 재설계되지 않았다.
- current next question
  - current next question은 더 이상 section-header wording을 구현할지 여부가 아니라, 그 다음 smallest docs-first cut을 무엇으로 둘지다.
- next smallest candidate
  - safest next `N5` candidate는 broad OpenDART/data-sources rewrite가 아니라 더 작은 docs-first candidate memo 수준이어야 한다.
  - if this route stays in scope, current narrow candidate는 `/settings/data-sources` `OpenDartStatusCard` read-through basis facts ownership docs-first memo다. `지금 읽는 기준`의 정상 intro sentence와 fact rows (`인덱스 준비`, `마지막 생성 기준`, `회사 수`)가 top summary, fallback slot, missing-index helper, dev-only layers와 어떤 층위로 읽혀야 하는지부터 좁히고, `configured` semantics, `userSummary()` 분기, fetch/status contract, build/button semantics, details disclosure 구조, route/href contract reopen은 포함하지 않는다. [검증 필요]
- residual risk
  - section-header는 닫혔지만, 이어서 `지금 읽는 기준` 정상 facts와 상단 summary를 한 배치로 다시 열면 top-level orientation 정리에서 card IA 재조정으로 쉽게 커질 수 있다. [검증 필요]
  - 정상 facts block, fallback slot, missing-index helper, dev-only disclosure를 한 번에 다시 열면 broad OpenDART card rewrite로 번질 수 있다. [검증 필요]

### settings-data-sources OpenDartStatusCard read-through-basis-facts ownership candidate memo

- read-through basis facts role map
  - `지금 읽는 기준` 아래 정상 intro sentence는 이 카드의 user-facing read-through basis opener다. top summary에서 먼저 닫은 상태 설명 뒤에, 아래 facts가 실제로 회사 검색과 공시 상세를 어떤 기준으로 읽게 하는지 이어 주는 bridge sentence로 읽는 편이 맞다.
  - fact rows `인덱스 준비`, `마지막 생성 기준`, `회사 수`는 support evidence layer나 dev-only trace가 아니라 user-facing current basis facts다. 현재 검색/상세 화면이 어떤 준비 상태와 마지막 생성 기준 위에서 읽히는지 보여 주는 본문 facts로 유지하는 쪽이 안전하다.
  - 이 facts block은 top summary 바로 뒤에 오는 primary read-through basis layer다. loading/error/empty는 같은 자리에서 이 layer를 잠시 대신하는 fallback slot이고, missing-index helper는 facts를 읽은 뒤 제한 상태를 한 번 더 짚는 secondary helper로 두는 편이 맞다.
  - 우측 dev-only disclosure와 build action/result helper는 facts block과 source, 독자, 수명이 다르다. `primaryPath`/`status.message` trace나 build result를 이 facts block 일부로 섞기 시작하면 user-facing basis layer와 operator/dev layer 경계가 흐려진다.
- smallest viable next candidate
  - current surface 안의 smallest viable next candidate는 `/settings/data-sources` `OpenDartStatusCard` read-through basis facts ownership copy/helper spike다.
  - 가장 안전한 첫 구현 범위는 정상 intro sentence가 facts block을 user-facing basis layer로 더 또렷하게 여는지, facts labels/tone이 support evidence나 dev memo처럼 읽히지 않는지 wording 수준에서만 정리하는 것이다.
  - `사용자에게 먼저 보이는 기준`, loading/error/empty fallback slot, missing-index helper, details disclosure layer, build/refresh action helper, `buildNotice`/`buildError`는 이 smallest cut에서 다시 설계하지 않는다.
- defer for now / `[검증 필요]`
  - `인덱스 준비`, `마지막 생성 기준`, `회사 수`의 source-of-truth, show/hide 조건, formatting rule을 바꾸는 일은 copy/helper 범위를 넘고 `fetchStatus()` contract나 status schema 의미를 건드릴 수 있다. [검증 필요]
  - facts block을 missing-index helper와 합치거나, fallback slot과 같은 문단으로 다시 쓰는 일은 current basis facts와 부재/제한 상태 helper를 동시에 흔든다. [검증 필요]
  - facts block을 dev-only disclosure나 build result helper와 한 배치로 다시 묶는 일은 operator/dev layer와 user-facing basis layer를 동시에 흔든다. [검증 필요]
- next cut recommendation
  - current next `N5` cut은 broad OpenDART card rewrite가 아니라 `/settings/data-sources` `OpenDartStatusCard` read-through basis facts ownership copy/helper spike여야 한다.
  - first implementation은 facts block이 primary read-through basis layer라는 점만 더 또렷하게 정리하고, `configured` semantics, `userSummary()` 분기, `fetchStatus()` 로직, status schema, build endpoint, button semantics, details disclosure 구조, route/href 변경은 포함하지 않는 편이 안전하다.
  - 비범위 항목은 실제 UI 구현, `src/components/OpenDartStatusCard.tsx` 재수정, `configured` boolean semantics 변경, `userSummary()` 분기 변경, `fetchStatus()` 로직 수정, status schema 변경, build endpoint 변경, button semantics 변경, details disclosure 구조 변경, route 추가/삭제, stable/public IA 재편이다.
  - broad OpenDART card rewrite가 위험한 이유는 이 facts block이 top summary와 fallback slot 사이에서 missing-index helper, dev-only disclosure, build result helper까지 모두 맞닿는 중간 layer라서, 문구 몇 줄을 다시 쓰는 일만으로도 current-basis facts, failure fallback, operator disclosure contract를 한꺼번에 흔들기 쉽기 때문이다.

### settings-data-sources OpenDartStatusCard read-through-basis-facts ownership post-spike sync memo

- actual landed scope
  - read-through-basis-facts ownership copy/helper polish는 landing했고, 실제 변경 범위는 `지금 읽는 기준` 정상 intro sentence를 `아래 세 항목은 개발용 메모가 아니라 ... 현재 기준`으로 조정하고, facts rows를 `인덱스 준비 상태`, `마지막 생성 시점`, `반영된 회사 수`로 정리한 것까지다.
  - 이 조정으로 facts block은 support evidence나 dev memo가 아니라, 지금 공시 검색과 상세 화면이 어떤 기준으로 읽히는지 보여 주는 user-facing current basis facts라는 점이 더 직접적으로 드러났다.
- unchanged boundary
  - `configured` boolean semantics, `userSummary()` 분기, `fetchStatus()` 로직, loading/error/empty fallback wording, missing-index warning wording, details disclosure 구조, build endpoint/button semantics, route/href contract는 그대로 유지됐다.
  - top summary layer, fallback slot, missing-index helper, dev-only disclosure layer, build action/result helper의 구조와 위치도 이번 spike 기준으로는 재설계되지 않았다.
- current next question
  - current next question은 더 이상 facts block wording을 구현할지 여부가 아니라, 그 다음 smallest docs-first cut을 무엇으로 둘지다.
- next smallest candidate
  - safest next `N5` candidate는 broad OpenDART/data-sources rewrite가 아니라 더 작은 docs-first candidate memo 수준이어야 한다.
  - if this route stays in scope, current narrow candidate는 `/settings/data-sources` `OpenDartStatusCard` facts-row scan-hierarchy docs-first memo다. `인덱스 준비 상태`, `마지막 생성 시점`, `반영된 회사 수` 3개 row를 사용자가 어떤 순서와 위계로 훑어야 하는지부터 좁히고, `configured` semantics, `userSummary()` 분기, `fetchStatus()` contract, status schema, build/button semantics, details disclosure 구조, route/href contract reopen은 포함하지 않는다. [검증 필요]
- residual risk
  - facts block wording은 닫혔지만, 다음 cut에서 facts row scan hierarchy와 top summary/fallback/missing-index helper를 한 배치로 다시 열면 copy/helper 범위를 넘어 card IA 재조정으로 쉽게 커질 수 있다. [검증 필요]
  - row order나 강조를 다시 쓰면서 source-of-truth, formatting, show/hide까지 건드리기 시작하면 `fetchStatus()`/status schema와 current-basis helper 경계가 함께 흔들릴 수 있다. [검증 필요]

### settings-data-sources OpenDartStatusCard facts-row scan-hierarchy candidate memo

- facts-row scan-hierarchy role map
  - `인덱스 준비 상태`, `마지막 생성 시점`, `반영된 회사 수` 3개 row는 모두 user-facing current basis facts이지만, 완전히 병렬인 정보라기보다 readiness → freshness → coverage 순서로 훑는 편이 더 자연스럽다.
  - 첫 row는 `인덱스 준비 상태`다. 사용자는 이 값으로 지금 공시 검색과 상세 화면의 basis가 실제로 준비돼 있는지부터 먼저 확인한다.
  - 둘째 row는 `마지막 생성 시점`이다. readiness를 확인한 뒤, 현재 basis가 얼마나 최근 생성 기준인지 freshness를 읽는다.
  - 셋째 row는 `반영된 회사 수`다. readiness와 freshness를 본 뒤, 마지막으로 coverage breadth를 가늠하는 support fact로 읽는다.
  - 이 row trio는 top summary와 `사용자에게 먼저 보이는 기준`을 반복하는 요약이 아니라, 그 다음에 이어지는 current basis facts layer로 유지하는 편이 맞다. loading/error/empty는 이 layer를 잠시 대신하는 fallback slot이고, missing-index helper는 이 trio 뒤의 secondary helper이며, dev-only disclosure와 build action/result helper는 별도 operator/dev layer로 계속 분리해 둔다.
- smallest viable next candidate
  - current smallest viable next candidate는 broad OpenDART/data-sources rewrite가 아니라 `/settings/data-sources` `OpenDartStatusCard` facts-row scan-hierarchy copy/helper spike 정도다.
  - first implementation은 row trio의 scan order가 readiness → freshness → coverage라는 점만 더 직접적으로 읽히게 하는 copy/helper 정리에 머무는 편이 안전하다. [검증 필요]
- defer for now / `[검증 필요]`
  - row 순서를 실제로 바꾸거나, 특정 row를 숨기거나, source-of-truth를 교체하거나, date/count formatting rule을 다시 정하는 일은 copy/helper 범위를 넘어 `fetchStatus()` contract와 status schema 의미를 함께 흔들 수 있다. [검증 필요]
  - facts row trio를 loading/error/empty fallback, missing-index helper, dev-only disclosure와 한 문단이나 한 블록으로 다시 엮는 일은 current basis facts layer와 failure/operator layer를 동시에 재설계하게 된다. [검증 필요]
  - top summary와 facts row trio를 한 표면에서 다시 압축하거나, broad OpenDART card rewrite로 이어지는 IA 재배치는 이번 후보 범위를 넘는다. [검증 필요]
- next cut recommendation
  - current next `N5` cut은 broad redesign이 아니라 `/settings/data-sources` `OpenDartStatusCard` facts-row scan-hierarchy copy/helper spike로 두는 편이 맞다.
  - 비범위 항목은 실제 UI 구현, `src/components/OpenDartStatusCard.tsx` 재수정, row 순서 변경, source-of-truth 변경, show/hide 조건 변경, formatting rule 변경, `configured` boolean semantics 변경, `userSummary()` 분기 변경, `fetchStatus()` 로직 수정, status schema 변경, build endpoint 변경, button semantics 변경, details disclosure 구조 변경, route 추가/삭제, stable/public IA 재편이다.
- broad rewrite risk
  - 이 row trio는 top summary 바로 아래 current basis layer이면서, 동시에 fallback slot, missing-index helper, dev-only disclosure와 인접해 있다. 그래서 scan hierarchy를 broad rewrite로 풀면 copy/helper 문제를 넘어서 summary ownership, failure fallback, operator disclosure contract를 한 번에 다시 열 가능성이 크다. [검증 필요]

### settings-data-sources OpenDartStatusCard facts-row scan-hierarchy post-spike sync memo

- actual landed scope
  - facts-row scan-hierarchy copy/helper polish는 landing했고, 실제 변경 범위는 facts trio intro helper를 `아래 세 항목은 순서대로 준비 여부, 마지막 생성 시점, 반영 범위를 읽는 현재 기준입니다.`로 조정하고, row labels를 `1. 인덱스 준비 상태`, `2. 마지막 생성 시점`, `3. 반영된 회사 수`로 정리한 것까지다.
  - 이 조정으로 row trio는 같은 current basis facts layer 안에서 readiness → freshness → coverage 순서로 훑는 흐름이 helper와 label tone만으로 더 직접적으로 드러나게 됐다.
- unchanged boundary
  - 실제 row 순서, source-of-truth, show/hide 조건, date/count formatting rule은 그대로 유지됐다.
  - `configured` boolean semantics, `userSummary()` 분기, `fetchStatus()` 로직, loading/error/empty fallback wording, missing-index warning wording, details disclosure 구조, build endpoint/button semantics, route/href contract도 그대로 유지됐다.
- current next question
  - current next question은 더 이상 facts-row scan-hierarchy wording을 구현할지 여부가 아니라, 그 다음 smallest docs-first cut을 무엇으로 둘지다.
- next smallest candidate
  - safest next `N5` candidate는 broad OpenDART/data-sources rewrite가 아니라 더 작은 docs-first candidate memo 수준이어야 한다.
  - if this route stays in scope, current narrow candidate는 `/settings/data-sources` `OpenDartStatusCard` facts-row value-emphasis docs-first memo다. 번호 prefix와 현재 row values가 readiness/freshness/coverage를 충분히 닫아 주는지부터 좁게 확인하고, row 순서 변경, source-of-truth 변경, show/hide 조건 변경, formatting rule 변경, `configured` semantics, `userSummary()`, `fetchStatus()` contract, status schema, build/button semantics, details disclosure 구조, route/href contract reopen은 포함하지 않는다. [검증 필요]
- residual risk
  - scan hierarchy wording은 닫혔지만, 다음 cut에서 row value emphasis를 reason/fallback/missing-index helper와 한 배치로 다시 열면 copy/helper 범위를 넘어 card IA 재조정으로 쉽게 커질 수 있다. [검증 필요]
  - number prefix나 row value emphasis를 다시 손보면서 formatting, show/hide, source-of-truth까지 건드리기 시작하면 `fetchStatus()`/status schema와 facts layer 경계가 함께 흔들릴 수 있다. [검증 필요]

### settings-data-sources OpenDartStatusCard facts-row value-emphasis candidate memo

- facts-row value-emphasis role map
  - `1. 인덱스 준비 상태` value는 trio 안에서 가장 강한 primary readiness signal이다. 첫 row 위치, 번호 prefix, `준비됨`/`확인 필요` binary wording, emerald/rose contrast가 함께 작동해 현재 상태만으로도 “지금 basis가 준비됐는지”를 먼저 닫아 준다.
  - `2. 마지막 생성 시점` value는 freshness anchor이지만, trio 안에서 가장 약한 emphasis다. row 위치와 label 덕분에 freshness row라는 점은 읽히지만, raw timestamp 자체는 “최근인지/오래됐는지”를 사용자 해석에 더 맡기는 편이다. 현재 basis fact로는 유지 가능하되, 추가 보강이 필요하다면 copy/helper 차원에서만 좁게 다루는 편이 안전하다. [검증 필요]
  - `3. 반영된 회사 수` value는 굵은 숫자 강조 덕분에 coverage breadth를 가늠하는 support fact로 읽힌다. 첫 두 row처럼 primary gate는 아니지만, support fact layer에서는 현재 emphasis로도 충분한 편이다.
  - 따라서 번호 prefix와 현재 value styling만으로 readiness → freshness → coverage를 대부분 닫고는 있지만, 실제로 helper를 다시 연다면 대상은 row order나 formatting이 아니라 freshness meaning closure 쪽으로만 좁히는 편이 맞다. [검증 필요]
- smallest viable next candidate
  - current smallest viable next candidate는 broad OpenDART/data-sources rewrite가 아니라 `/settings/data-sources` `OpenDartStatusCard` facts-row freshness-read helper docs-first memo 정도다.
  - first implementation이 필요해도 `마지막 생성 시점` value가 freshness를 어떻게 읽어야 하는지 보조하는 helper/copy만 검토하고, 다른 row의 source-of-truth나 layout/value formatting은 건드리지 않는 편이 안전하다. [검증 필요]
- defer for now / `[검증 필요]`
  - row 순서를 실제로 바꾸거나, source-of-truth를 교체하거나, show/hide 조건을 조정하거나, date/count formatting rule 자체를 다시 정하는 일은 value-emphasis 범위를 넘어 `fetchStatus()` contract와 status schema 의미를 함께 흔들 수 있다. [검증 필요]
  - `준비됨`/`확인 필요` 색상 의미를 재정의하거나 count/date value styling token까지 함께 다시 설계하는 일은 copy/helper가 아니라 broader visual-state contract 조정에 가깝다. [검증 필요]
  - freshness emphasis 문제를 fallback slot, missing-index helper, dev-only disclosure/helper와 한 배치로 다시 풀기 시작하면 current basis facts layer와 failure/operator layer를 동시에 재설계하게 된다. [검증 필요]
- next cut recommendation
  - current next `N5` cut은 broad redesign이 아니라 `/settings/data-sources` `OpenDartStatusCard` facts-row freshness-read helper docs-first memo로 두는 편이 맞다.
  - 비범위 항목은 실제 UI 구현, `src/components/OpenDartStatusCard.tsx` 재수정, row 순서 변경, source-of-truth 변경, show/hide 조건 변경, formatting rule 변경, `configured` boolean semantics 변경, `userSummary()` 분기 변경, `fetchStatus()` 로직 수정, status schema 변경, build endpoint 변경, button semantics 변경, details disclosure 구조 변경, route 추가/삭제, stable/public IA 재편이다.
- broad rewrite risk
  - value emphasis를 broad OpenDART card rewrite로 풀면 row value tone 문제 하나 때문에 row order, formatting, fallback helper, missing-index helper, dev-only disclosure까지 한 번에 다시 열 가능성이 크다. 특히 freshness row의 해석 보강은 copy/helper 수준에서 닫을 수 있는데, 이를 layout/contract 문제로 확장하면 small-surface polish 범위를 바로 벗어나게 된다. [검증 필요]

### settings-data-sources OpenDartStatusCard facts-row freshness-read helper candidate memo

- facts-row freshness-read helper role map
  - `2. 마지막 생성 시점` row는 trio 안에서 support evidence가 아니라 freshness anchor다. `1. 인덱스 준비 상태`로 readiness를 확인한 뒤, 사용자는 이 row에서 “현재 공시 검색과 상세 화면이 마지막으로 어떤 생성 기준을 읽는가”를 이어서 확인하게 된다.
  - 현재 raw timestamp는 마지막 생성 기준 시점이라는 사실 자체는 user-facing current basis facts로 충분히 남긴다. 다만 이 값만으로는 “이 시점이 지금 읽는 기준과 어떤 관계인지”를 사용자가 스스로 해석해야 해서 freshness meaning closure는 완전히 닫히지 않는다. [검증 필요]
  - helper를 다시 연다면 raw timestamp를 바꾸거나 상대 시간을 계산하는 것이 아니라, 이 시점이 현재 공시 검색/상세 화면의 마지막 생성 기준이라는 점을 한 줄로 풀어 주는 read helper여야 한다. stale 여부 판단, 경고 톤, freshness threshold를 새로 만들면 안 된다. [검증 필요]
  - 이 helper question은 top summary, loading/error/empty fallback slot, missing-index helper, dev-only disclosure/build helper와 분리된 같은 current basis facts layer 안에서만 다루는 편이 맞다.
- smallest viable next candidate
  - current smallest viable next candidate는 broad OpenDART/data-sources rewrite가 아니라 `/settings/data-sources` `OpenDartStatusCard` facts-row freshness-read helper copy/helper spike 정도다.
  - first implementation이 필요해도 `2. 마지막 생성 시점` row 주변에 한 줄 helper를 두어 raw timestamp의 의미만 닫고, timestamp formatting, row order, source-of-truth, stale threshold logic은 건드리지 않는 편이 안전하다. [검증 필요]
- defer for now / `[검증 필요]`
  - 상대 시간 표현, stale/최신 판정, 경고 문구, freshness badge를 새로 붙이는 일은 helper 범위를 넘어 formatting rule과 `fetchStatus()`/status schema 의미를 함께 흔들 수 있다. [검증 필요]
  - `마지막 생성 시점` row를 top summary나 fallback slot과 합치거나, missing-index helper와 한 문단으로 재배치하는 일은 current basis facts layer와 failure/helper layer를 동시에 재설계하게 된다. [검증 필요]
  - helper 보강을 이유로 row 순서, source-of-truth, show/hide 조건, count/date formatting rule을 다시 여는 일은 이번 후보 범위를 넘는다. [검증 필요]
- next cut recommendation
  - current next `N5` cut은 broad redesign이 아니라 `/settings/data-sources` `OpenDartStatusCard` facts-row freshness-read helper copy/helper spike로 두는 편이 맞다.
  - 비범위 항목은 실제 UI 구현, `src/components/OpenDartStatusCard.tsx` 재수정, row 순서 변경, source-of-truth 변경, show/hide 조건 변경, formatting rule 변경, `configured` boolean semantics 변경, `userSummary()` 분기 변경, `fetchStatus()` 로직 수정, status schema 변경, build endpoint 변경, button semantics 변경, details disclosure 구조 변경, route 추가/삭제, stable/public IA 재편이다.
- broad rewrite risk
  - freshness helper는 원래 raw timestamp의 meaning closure만 다루면 되는 작은 문제다. 이를 broad OpenDART card rewrite로 풀면 freshness helper 하나 때문에 top summary, fallback, missing-index helper, dev-only disclosure, formatting contract까지 한 번에 다시 열 가능성이 크다. [검증 필요]

### settings-data-sources OpenDartStatusCard facts-row freshness-read helper post-spike sync memo

- actual landed scope
  - facts-row freshness-read helper copy/helper polish는 landing했고, 실제 변경 범위는 `2. 마지막 생성 시점` row를 label/value 줄과 helper 한 줄로만 벌리고, raw timestamp 아래에 `위 시점은 현재 공시 검색과 상세 화면이 마지막으로 읽는 생성 기준입니다.` 문구를 추가한 것까지다.
  - 이 조정으로 `2. 마지막 생성 시점` row는 raw timestamp를 바꾸지 않은 채, user-facing current basis facts layer 안에서 freshness meaning closure가 한 줄 helper로 더 직접적으로 드러나게 됐다.
- unchanged boundary
  - row 순서, source-of-truth, show/hide 조건, timestamp formatting rule은 그대로 유지됐다.
  - stale 여부 판단, 상대 시간 계산, freshness badge/warning tone, `configured` boolean semantics, `userSummary()` 분기, `fetchStatus()` 로직, status schema, loading/error/empty fallback wording, missing-index warning wording, details disclosure 구조, build endpoint/button semantics, route/href contract도 그대로 유지됐다.
- current next question
  - current next question은 더 이상 freshness-read helper를 구현할지 여부가 아니라, 그 다음 smallest docs-first cut을 무엇으로 둘지다.
- next smallest candidate
  - safest next `N5` candidate는 broad OpenDART/data-sources rewrite가 아니라 더 작은 docs-first candidate memo 수준이어야 한다.
  - if this route stays in scope, current narrow candidate는 `/settings/data-sources` `OpenDartStatusCard` facts-row coverage-read helper docs-first memo다. `3. 반영된 회사 수` value가 현재 공시 검색/상세 화면의 반영 범위를 어디까지 뜻하는지부터 좁게 확인하고, row 순서 변경, source-of-truth 변경, show/hide 조건 변경, formatting rule 변경, `configured` semantics, `userSummary()`, `fetchStatus()` contract, status schema, build/button semantics, details disclosure 구조, route/href contract reopen은 포함하지 않는다. [검증 필요]
- residual risk
  - freshness helper wording은 닫혔지만, 다음 cut에서 coverage read helper를 freshness/fallback/missing-index helper와 한 배치로 다시 열면 copy/helper 범위를 넘어 card IA 재조정으로 쉽게 커질 수 있다. [검증 필요]
  - coverage helper를 이유로 count 의미, formatting, source-of-truth, show/hide까지 건드리기 시작하면 `fetchStatus()`/status schema와 facts layer 경계가 함께 흔들릴 수 있다. [검증 필요]

### settings-data-sources OpenDartStatusCard facts-row coverage-read helper candidate memo

- facts-row coverage-read helper role map
  - `3. 반영된 회사 수` row는 trio 안에서 단순 support evidence가 아니라 coverage breadth fact다. readiness와 freshness를 본 뒤, 사용자는 이 row에서 현재 공시 검색/상세 화면이 어느 정도 회사 범위를 반영한 기준으로 읽히는지 마지막으로 가늠하게 된다.
  - 현재 raw count는 user-facing current basis facts로서 규모감 자체는 충분히 남긴다. 다만 이 숫자만으로는 “반영된 회사 수”가 total market을 뜻하는지, 현재 검색/상세 기준에 반영된 범위를 뜻하는지, completeness를 보장하는지까지를 사용자가 스스로 해석해야 해서 coverage meaning closure는 완전히 닫히지 않는다. [검증 필요]
  - helper를 다시 연다면 raw count를 바꾸거나 completeness/staleness 판단을 추가하는 것이 아니라, 이 숫자가 현재 공시 검색과 상세 화면에 반영된 회사 범위를 읽는 기준이라는 점을 한 줄로 풀어 주는 read helper여야 한다. 전체 시장 보장, 누락 경고, 임계치 판정으로 확장하면 안 된다. [검증 필요]
  - 이 helper question은 top summary, readiness/freshness rows, loading/error/empty fallback slot, missing-index helper, dev-only disclosure/build helper와 분리된 같은 current basis facts layer 안에서만 다루는 편이 맞다.
- smallest viable next candidate
  - current smallest viable next candidate는 broad OpenDART/data-sources rewrite가 아니라 `/settings/data-sources` `OpenDartStatusCard` facts-row coverage-read helper copy/helper spike 정도다.
  - first implementation이 필요해도 `3. 반영된 회사 수` row 주변에 한 줄 helper를 두어 raw count의 의미만 닫고, count formatting, row order, source-of-truth, completeness logic은 건드리지 않는 편이 안전하다. [검증 필요]
- defer for now / `[검증 필요]`
  - total market 대비 비율, completeness 판정, 누락 경고, coverage badge를 새로 붙이는 일은 helper 범위를 넘어 formatting rule과 `fetchStatus()`/status schema 의미를 함께 흔들 수 있다. [검증 필요]
  - `반영된 회사 수` row를 top summary나 missing-index helper와 합치거나, fallback slot과 같은 문단으로 다시 배치하는 일은 current basis facts layer와 failure/helper layer를 동시에 재설계하게 된다. [검증 필요]
  - helper 보강을 이유로 row 순서, source-of-truth, show/hide 조건, count formatting rule을 다시 여는 일은 이번 후보 범위를 넘는다. [검증 필요]
- next cut recommendation
  - current next `N5` cut은 broad redesign이 아니라 `/settings/data-sources` `OpenDartStatusCard` facts-row coverage-read helper copy/helper spike로 두는 편이 맞다.
  - 비범위 항목은 실제 UI 구현, `src/components/OpenDartStatusCard.tsx` 재수정, row 순서 변경, source-of-truth 변경, show/hide 조건 변경, formatting rule 변경, `configured` boolean semantics 변경, `userSummary()` 분기 변경, `fetchStatus()` 로직 수정, status schema 변경, build endpoint 변경, button semantics 변경, details disclosure 구조 변경, route 추가/삭제, stable/public IA 재편이다.
- broad rewrite risk
  - coverage helper는 원래 raw count의 meaning closure만 다루면 되는 작은 문제다. 이를 broad OpenDART card rewrite로 풀면 count helper 하나 때문에 row order, completeness contract, missing-index helper, fallback, dev-only disclosure까지 한 번에 다시 열 가능성이 크다. [검증 필요]

### settings-data-sources OpenDartStatusCard facts-row coverage-read helper post-spike sync memo

- landed scope sync
  - facts-row coverage-read helper copy/helper polish는 landing했고, 실제 변경 범위는 `3. 반영된 회사 수` row를 label/value 줄과 helper 한 줄로만 벌린 뒤 raw count 아래에 `위 수는 현재 공시 검색과 상세 화면에 반영된 회사 범위를 읽는 기준입니다.` 문구를 추가한 것까지다.
  - 이는 raw count를 total market, completeness, 누락 경고로 확장한 것이 아니라, user-facing current basis facts layer 안에서 현재 공시 검색/상세 화면의 반영 범위를 읽는 기준이라는 meaning closure만 더한 조정이다.
- unchanged boundary
  - row 순서, source-of-truth, show/hide 조건, count formatting rule, total-market 보장, completeness 판정, 누락 경고, coverage badge, `configured` semantics, `userSummary()` 분기, `fetchStatus()` 로직, status schema, freshness helper wording, loading/error/empty fallback wording, missing-index warning wording, details disclosure 구조, build endpoint/button semantics, route/href contract는 바뀌지 않았다.
  - 코드/route/layout 차원에서는 `src/components/OpenDartStatusCard.tsx`의 row 3 wrapper/helper 한 줄 외에 `docs/current-screens.md`와 `src/app/settings/data-sources/page.tsx` contract 수정이 없었다.
- current next question
  - current next question은 더 이상 coverage-read helper를 구현할지 여부가 아니라, 그 다음 smallest docs-first cut을 무엇으로 둘지다.
- next smallest candidate
  - if this route stays in scope, current narrow candidate는 `/settings/data-sources` `OpenDartStatusCard` facts-row helper-saturation docs-first memo다. intro, freshness helper, coverage helper가 합쳐진 현재 facts trio가 이미 충분한 meaning closure를 제공하는지부터 점검하고, 추가 row-level helper를 더 붙이기 전에 stop line을 문서로 먼저 확정하는 편이 안전하다. [검증 필요]
  - 이 다음 후보에서도 row 순서 변경, source-of-truth 변경, show/hide 조건 변경, formatting rule 변경, total-market/completeness semantics 추가, `configured` semantics 변경, `userSummary()` 분기 변경, `fetchStatus()` 로직 수정, status schema 변경, build/button/disclosure/route contract reopen은 비범위다.

### settings-data-sources OpenDartStatusCard facts-row helper-saturation candidate memo

- facts-row helper-saturation role map
  - 현재 facts trio layer는 intro 한 줄이 `준비 여부 → 마지막 생성 시점 → 반영 범위`를 먼저 선언하고, `2. 마지막 생성 시점` helper가 freshness anchor의 raw timestamp meaning을, `3. 반영된 회사 수` helper가 coverage breadth fact의 raw count meaning을 각각 닫는 구조다.
  - 이 조합 덕분에 row-level meaning closure는 현재 범위에서는 대체로 충분해 보인다. row 1은 label/value 자체로 readiness signal이 강하고, row 2와 row 3은 helper가 각각 생성 기준과 반영 범위 의미를 붙여 줘 trio 전체를 read-through basis facts로 읽게 만든다. [검증 필요]
  - 남은 애매함은 helper 한 줄이 더 없어서라기보다 row 순서, source-of-truth, show/hide, formatting, total-market/completeness semantics 같은 계약 문제에 더 가깝다. 따라서 추가 row-level helper는 곧바로 top summary, fallback, missing-index, dev-only disclosure와의 경계를 다시 건드리는 IA 재조정으로 커질 위험이 있다. [검증 필요]
- smallest viable next candidate
  - current smallest viable next candidate는 broad OpenDART/data-sources rewrite나 추가 row-level helper spike가 아니라 `/settings/data-sources` `OpenDartStatusCard` facts-row stop-line docs-first memo 정도다.
  - 그 memo는 현재 intro + freshness helper + coverage helper 조합을 facts trio layer의 stop line 후보로 고정하고, 새로운 helper를 더 붙이기 전에 정말 필요한 오해 지점이 있는지부터 확인하는 수준에 머무는 편이 안전하다. [검증 필요]
- defer for now / `[검증 필요]`
  - `1. 인덱스 준비 상태` 아래에 새 helper를 더 붙이거나, facts trio 하단에 종합 bridge 문구를 한 줄 더 추가하는 일은 현재 layer 내부의 redundancy를 높이고 top summary 역할과 겹칠 수 있다. [검증 필요]
  - facts trio helper를 이유로 loading/error/empty fallback, missing-index helper, dev-only disclosure/build helper와 문단 관계를 다시 조정하는 일은 small-surface polish 범위를 넘는다. [검증 필요]
  - row 순서, source-of-truth, show/hide 조건, formatting rule, total-market/completeness semantics, `fetchStatus()`/status schema 계약을 다시 여는 일은 helper saturation 후보 범위를 벗어난다. [검증 필요]
- next cut recommendation
  - current next `N5` cut은 broad redesign이나 새 helper spike가 아니라 `/settings/data-sources` `OpenDartStatusCard` facts-row stop-line docs-first memo로 두는 편이 맞다.
  - 비범위 항목은 실제 UI 구현, `src/components/OpenDartStatusCard.tsx` 재수정, row 순서 변경, source-of-truth 변경, show/hide 조건 변경, formatting rule 변경, total-market/completeness semantics 추가, `configured` boolean semantics 변경, `userSummary()` 분기 변경, `fetchStatus()` 로직 수정, status schema 변경, build endpoint 변경, button semantics 변경, details disclosure 구조 변경, route 추가/삭제, stable/public IA 재편이다.
- broad rewrite risk
  - 현 시점의 남은 질문은 helper가 부족한가보다 stop line을 어디에 둘 것인가에 가깝다. 이를 broad OpenDART card rewrite로 풀면 facts trio saturation 확인 하나 때문에 top summary, fallback, warning, dev-only disclosure, semantics 계약까지 한 번에 다시 열 가능성이 크다. [검증 필요]

### settings-data-sources OpenDartStatusCard facts-row stop-line candidate memo

- facts-row stop-line role map
  - 현재 facts trio layer는 `지금 읽는 기준` intro가 readiness → freshness → coverage read order를 선언하고, `2. 마지막 생성 시점` helper와 `3. 반영된 회사 수` helper가 각 raw value의 meaning closure를 붙여 주는 조합이다. row 1은 label/value 자체가 충분히 강한 readiness signal이라, trio 전체로 보면 추가 row-level helper 없이도 read-through basis facts layer가 대체로 닫혀 있는 편이다. [검증 필요]
  - 따라서 이 조합은 facts trio layer 내부의 사실상 stop line 후보로 볼 수 있다. 더 남아 있는 질문은 helper 부족보다는 row 순서, source-of-truth, show/hide 조건, formatting, total-market/completeness semantics, `fetchStatus()`/status schema 계약처럼 다른 층위에서 나온다. [검증 필요]
  - top summary, loading/error/empty fallback, missing-index helper, dev-only disclosure/build helper와 facts trio layer의 읽는 경계도 현재 상태에서는 비교적 잠겨 있다. 여기서 helper를 더 늘리면 facts trio layer 자체보다 상하위 레이어 경계를 다시 흔들 가능성이 더 크다. [검증 필요]
- smallest viable next candidate
  - current smallest viable next candidate는 broad OpenDART/data-sources rewrite나 새 row-level helper spike가 아니라 `/settings/data-sources` `OpenDartStatusCard` facts-row stop-line closeout docs-only sync 정도다.
  - 그 sync는 현재 intro + freshness helper + coverage helper 조합을 facts trio layer의 종료선 후보로 backlog에 고정하고, 이후에는 helper 추가보다 contract/IA reopen 여부를 별도 질문으로 분리하는 수준에 머무는 편이 안전하다. [검증 필요]
- defer for now / `[검증 필요]`
  - facts trio 하단에 종합 helper를 한 줄 더 붙이거나 `1. 인덱스 준비 상태` 아래 보조 문장을 추가하는 일은 stop line 확인보다 redundancy를 늘리고 top summary와 역할을 겹치게 만들 수 있다. [검증 필요]
  - facts trio layer를 이유로 fallback, missing-index helper, dev-only disclosure/build helper와의 문단 경계를 다시 조정하는 일은 small-surface polish를 넘어 IA reopen으로 커진다. [검증 필요]
  - row 순서, source-of-truth, show/hide 조건, formatting rule, total-market/completeness semantics, `fetchStatus()`/status schema 계약을 다시 여는 일은 stop-line 후보 범위를 벗어난다. [검증 필요]
- next cut recommendation
  - current next `N5` cut은 broad redesign이나 추가 helper 구현이 아니라 `/settings/data-sources` `OpenDartStatusCard` facts-row stop-line closeout docs-only sync로 두는 편이 맞다.
  - 비범위 항목은 실제 UI 구현, `src/components/OpenDartStatusCard.tsx` 재수정, row 순서 변경, source-of-truth 변경, show/hide 조건 변경, formatting rule 변경, total-market/completeness semantics 추가, `configured` boolean semantics 변경, `userSummary()` 분기 변경, `fetchStatus()` 로직 수정, status schema 변경, build endpoint 변경, button semantics 변경, details disclosure 구조 변경, route 추가/삭제, stable/public IA 재편이다.
- broad rewrite risk
  - 지금 남은 질문은 facts trio helper를 더 만들 것인가보다 현 조합을 종료선으로 확정할 수 있는가에 가깝다. 이를 broad OpenDART card rewrite로 풀면 facts trio stop line 확인 하나 때문에 top summary, fallback, warning, dev-only disclosure, contract semantics까지 한 번에 다시 열 가능성이 크다. [검증 필요]

### settings-data-sources OpenDartStatusCard facts-row stop-line closeout memo

- closeout scope sync
  - 현재 facts trio layer는 `지금 읽는 기준` intro, `2. 마지막 생성 시점` helper, `3. 반영된 회사 수` helper 조합을 기준으로 일단 닫는 편이 맞다. 이 closeout은 현 조합이 facts trio layer 내부에서는 더 이상 future stop-line candidate가 아니라 현재 종료선으로 읽힌다는 상태를 backlog에 고정하는 작업이다.
  - facts trio layer 내부에서는 readiness → freshness → coverage read-through meaning closure가 현재 수준에서 충분한 편으로 보고, 추가 row-level helper를 기본값으로 남기지 않는다. [검증 필요]
- unchanged boundary
  - `src/components/OpenDartStatusCard.tsx` 구현, row 순서, source-of-truth, show/hide 조건, formatting rule, total-market/completeness semantics, `configured` semantics, `userSummary()` 분기, `fetchStatus()` 로직, status schema, build endpoint/button semantics, details disclosure 구조, route/href contract는 바뀌지 않는다.
  - top summary, loading/error/empty fallback, missing-index helper, dev-only disclosure/build helper와 facts trio layer의 경계도 현재 상태에서 잠그는 편이 맞다. facts trio closeout을 이유로 상하위 레이어를 다시 섞지 않는다. [검증 필요]
- current next question
  - current next question은 더 이상 facts trio를 더 다듬을지 여부가 아니라, 이 카드에서 정말 남아 있는 smallest docs-first cut이 있는지 아니면 다른 surface로 넘어갈지다.
- next smallest candidate
  - if this route stays in scope, current narrow candidate는 `/settings/data-sources` `OpenDartStatusCard` residual-cut triage docs-first memo다. facts trio layer는 reopen하지 않고, 이 카드 내부에 아직 남은 docs-only 미세 조정이 있는지부터 확인한다. [검증 필요]
  - 이 다음 후보에서도 `src/components/OpenDartStatusCard.tsx` 재수정, row 순서 변경, source-of-truth 변경, show/hide 조건 변경, formatting rule 변경, total-market/completeness semantics 추가, `configured` semantics 변경, `userSummary()` 분기 변경, `fetchStatus()` 로직 수정, status schema 변경, build/button/disclosure/route contract reopen은 비범위다.
- broad rewrite risk
  - 현재 facts trio layer는 일단 닫힌 상태라서, 이 지점에서 broad OpenDART card rewrite로 바로 가면 종료선 closeout 하나 때문에 top summary, fallback, warning, dev-only disclosure, semantics 계약을 한 번에 다시 열 가능성이 크다. [검증 필요]

### settings-data-sources OpenDartStatusCard residual-cut triage candidate memo

- residual-cut triage role map
  - facts trio layer를 reopen하지 않는다는 전제를 두면, 현재 카드 안에서 별도로 남아 있는 질문은 row-level helper 부족보다 top summary, loading/error/empty fallback, missing-index helper, dev-only disclosure/build helper와의 경계나 underlying contract 의미에 더 가깝다.
  - 이 남은 질문들은 docs-only micro cut으로 떼어 내기 어렵다. 어느 한 surface만 다시 다듬기 시작해도 `configured` semantics, `userSummary()` 분기, `fetchStatus()` contract, status schema, build/button/disclosure/route contract 같은 더 큰 read contract를 다시 건드릴 가능성이 높다. [검증 필요]
  - 따라서 현재 카드 내부의 residual ambiguity는 “다음 작은 copy/helper spike”라기보다 “이 카드를 현재 상태에서 닫고 다른 surface로 넘어갈 것인가”에 가까운 triage question으로 보는 편이 안전하다. [검증 필요]
- smallest viable next candidate
  - current smallest viable next candidate는 `none for now`다.
  - facts trio closeout 이후의 card-internal ambiguity는 micro docs-first cut으로 안정적으로 분리되지 않고, 억지로 자르면 broad IA/contract reopen으로 커질 가능성이 더 크다. [검증 필요]
- defer for now / `[검증 필요]`
  - top summary만 다시 열어 facts trio와의 bridge를 한 번 더 조정하는 일은 summary/facts boundary를 다시 흔들 수 있다. [검증 필요]
  - loading/error/empty fallback이나 missing-index helper만 따로 다시 다듬는 일은 fallback/helper layer와 facts trio closeout 상태를 다시 섞게 될 수 있다. [검증 필요]
  - dev-only disclosure/build helper만 별도 micro cut으로 다시 여는 일도 operator/dev layer와 public read layer contract를 다시 만질 위험이 있다. [검증 필요]
- next cut recommendation
  - current next cut recommendation은 `OpenDartStatusCard` 내부에서 새 spike를 억지로 만들지 않고 `none for now`로 두는 편이 맞다.
  - 다음 우선순위는 이 카드가 아니라 다른 surface로 넘기거나, 정말 reopen이 필요할 때만 별도 contract/IA 질문으로 승격해 다시 여는 방식이어야 한다.
  - 비범위 항목은 `src/components/OpenDartStatusCard.tsx` 재수정, facts trio layer 재오픈, row 순서 변경, source-of-truth 변경, show/hide 조건 변경, formatting rule 변경, total-market/completeness semantics 추가, `configured` semantics 변경, `userSummary()` 분기 변경, `fetchStatus()` 로직 수정, status schema 변경, build endpoint/button semantics 변경, details disclosure 구조 변경, route 추가/삭제, stable/public IA 재편이다.
- broad rewrite risk
  - residual ambiguity triage 단계에서 broad OpenDART card rewrite로 가면, 현재 closeout된 facts trio와 top summary/fallback/missing-index/dev-only disclosure 경계를 모두 동시에 다시 열어 작은 의문을 큰 재설계로 증폭시킬 가능성이 크다. [검증 필요]

### settings-data-sources OpenDartStatusCard residual-cut triage closeout memo

- closeout scope sync
  - 이번 closeout에서 확정하는 것은 `OpenDartStatusCard` 내부 residual ambiguity가 현재 상태에서는 stable한 micro docs-first cut으로 더 분리되지 않는다는 판단이다.
  - facts trio closeout 이후 card-internal smallest viable next candidate는 현재 `none for now`로 잠그고, current next question을 “이 카드 안에서 무엇을 더 다듬을 것인가”가 아니라 “이 카드를 닫고 다음 surface로 넘어갈 것인가”로 옮긴다. [검증 필요]
- unchanged boundary
  - `src/components/OpenDartStatusCard.tsx` 구현, facts trio layer, top summary, loading/error/empty fallback, missing-index helper, dev-only disclosure 구조, `configured` semantics, `userSummary()` 분기, `fetchStatus()` 로직, status schema, build/button/disclosure/route contract는 바뀌지 않는다.
  - 이번 closeout은 새 spike를 만들지 않고 현재 카드 경계만 문서에 잠그는 작업이다. micro copy polish 명목으로 상하위 layer를 다시 섞지 않는다. [검증 필요]
- reopen rule
  - 이후 reopen이 필요하더라도 next cut을 다시 `OpenDartStatusCard` 내부 micro copy/helper spike로 두지 않는다.
  - reopen trigger는 top summary, fallback, missing-index helper, dev-only disclosure 중 하나의 문구 polish가 아니라, 별도 contract/IA question으로 승격할 근거가 생겼을 때로만 좁힌다. [검증 필요]
- next cut recommendation
  - current next cut recommendation은 `OpenDartStatusCard` 내부에서는 `none for now`로 닫고, 다음 우선순위를 다른 stable surface 쪽으로 넘기는 편이 맞다.
  - broad OpenDART card rewrite뿐 아니라 card-internal micro spike도 현 시점 backlog의 current next question으로 남기지 않는다. [검증 필요]
- broad rewrite risk
  - residual-cut triage를 future polish queue로 남겨 두면 closeout된 facts trio와 top summary/fallback/missing-index/dev-only disclosure 경계를 다시 흔들 위험이 있다. reopen은 별도 contract/IA 질문으로 승격된 뒤에만 다루는 편이 안전하다. [검증 필요]

### settings-trust-hub route-cluster post-polish closeout memo

- cluster role map
  - `/settings`는 settings/trust-hub cluster 안의 host entry surface다. 어떤 설정 영역으로 들어갈지 고르는 card hub 역할을 맡는다.
  - `/settings/data-sources`는 trust/freshness owner surface다. 현재 landed scope는 page-shell trust summary, diagnostics-boundary wording, `DataSourceHealthTable` operator/read-only-meta boundary, `DataSourceStatusCard` current-basis/support-helper/dev-action 경계, `OpenDartStatusCard` user-facing vs dev-only/read-through/facts-row closure까지 포함한다. [검증 필요]
  - `OpenDartStatusCard`는 `residual-cut triage closeout` 기준으로 card-internal smallest viable next candidate를 현재 `none for now`로 잠근 상태다. 이 카드 안에서 새 micro spike를 다시 만들지 않는다. [검증 필요]
  - `/settings/alerts`는 alerts rule/preset/filter/regex surface고, `/settings/backup`, `/settings/recovery`, `/settings/maintenance`는 side effect가 큰 operator-maintenance surface로 계속 분리해 읽는다. [검증 필요]
- landed scope
  - `/settings` host-surface entry hierarchy small-batch polish는 landing했다. 실제 landed 범위는 `PageHeader` description, host helper, card description tone, `이 설정 열기 ▶` helper tone 정리까지다.
  - `/settings/data-sources` trust/freshness owner small-batch polish도 landing했다. 실제 landed 범위는 `PageHeader`, `먼저 확인할 신뢰 요약`과 3단계 helper, 상단 in-page jump helper, impact/source card helper tone, diagnostics-boundary wording, `DataSourceHealthTable` operator/read-only-meta naming, `DataSourceStatusCard` recent-ping/dev-action helper boundary, `OpenDartStatusCard` user summary/read-through/facts trio/dev-only disclosure helper boundary까지다. [검증 필요]
  - `OpenDartStatusCard` residual-cut triage closeout은 현재 cluster closeout 범위 안에 포함된다. 이 closeout에서 확정한 것은 card-internal next cut이 더 이상 future micro spike가 아니라 현재 `none for now`라는 상태다. [검증 필요]
- defer for now / `[검증 필요]`
  - `/settings/alerts`
  - `/settings/backup`
  - `/settings/recovery`
  - `/settings/maintenance`
- unchanged boundary
  - route/href contract
  - trust/data-source health/freshness policy
  - alerts rule/preset/filter/regex semantics
  - backup/recovery/maintenance side-effect semantics
  - build/ping/storage/event contract
  - stable/public IA
- current next question
  - current next question은 더 이상 settings cluster 내부에서 새 micro spike를 무엇으로 자를지 여부가 아니다.
  - 이제 질문은 이 cluster를 current parked 상태로 둘 수 있는지, 그리고 reopen trigger가 실제로 생겼는지 여부다. landed된 `/settings` host, parked된 `/settings/data-sources`, defer된 alerts/backup/recovery/maintenance를 다시 섞어 “settings family 전체 구현 완료”나 broad family rewrite 질문으로 되돌리지 않는 편이 맞다. [검증 필요]
- future reopen trigger
  - trust/data-source health/freshness policy, build/ping/storage/event contract, `OpenDartStatusCard`/diagnostics boundary를 contract 수준에서 다시 정의해야 할 때만 `/settings/data-sources` reopen을 검토한다.
  - alerts rule/preset/filter/regex semantics를 다시 정의해야 하거나, backup/recovery/maintenance side-effect flow를 docs-first contract question으로 다시 좁혀야 할 때만 해당 route reopen을 검토한다.
  - route/href contract 또는 stable/public IA 변경도 reopen trigger가 될 수 있다. wording sync나 closeout memo 보강만으로는 reopen trigger가 아니다. [검증 필요]
- next cut recommendation
  - current recommendation은 settings cluster 내부 새 구현 배치가 아니라, current parked 상태를 유지하면서 trigger 발생 여부를 docs-first로만 재판단하는 것이다.
  - broad stable/public rewrite가 위험한 이유는 `/settings` host entry hierarchy, `/settings/data-sources` trust/freshness owner, alerts rule semantics, backup/recovery/maintenance side-effect flow를 한 큐로 다시 열면 trust/data-source policy와 operator contract를 동시에 흔들 가능성이 크기 때문이다. [검증 필요]

## 4.6 피드백 / 보조 support surface

### 포함 route

- `/feedback`
- `/feedback/list`
- `/feedback/[id]`

### polish 초점

- 사용자 기대치, 회신 흐름, 다음 행동 안내를 더 쉽게 정리한다.
- 운영/개발용 정보보다 사용자용 도움말과 후속 CTA를 앞세운다.
- support 성격을 유지하되 ops/debug 성격으로 새지 않게 다듬는다.

### feedback route-cluster boundary audit memo

- feedback route-cluster role map
  - `/feedback`는 새 의견, 질문, 도움 요청을 저장하는 entry surface다. `의견과 도움 요청 남기기`, `내용 저장하기`와 저장 후 list/detail 재확인 안내를 기준으로, 새 의견 접수 시작점으로만 읽는다.
  - `/feedback/list`는 저장한 피드백을 다시 보는 history surface다. `저장한 피드백 다시 보기`, 필터/검색, `새 의견 남기기`, empty state의 `첫 의견 작성하기`를 기준으로, 접수 내역을 다시 훑고 detail로 이어지는 목록으로 읽는다.
  - `/feedback/[id]`는 개별 접수 내용을 다시 읽고 다음 확인 메모를 보는 detail read-through surface다. `피드백 상세`, `내역`, `새 의견`, 진행 상태/확인 메모/공유 보조 정보 구성을 기준으로, 제출 당시 맥락과 이후 확인 포인트를 다시 읽는 상세 저장본으로 유지한다.
  - `docs/current-screens.md` 기준으로 `/feedback`, `/feedback/list`, `/feedback/[id]`는 모두 `Public Stable` 실존 route다. 이번 audit에서는 route 추가/삭제나 분류 변경이 없으므로 inventory SSOT는 그대로 유지한다.
- first cluster candidate
  - route-cluster 첫 후보는 `/feedback` entry surface다.
  - 새 의견 접수 expectation, 저장 후 follow-through 안내, 진단 번들 helper 같은 entry copy/helper를 가장 작은 배치로 먼저 좁힐 수 있고, list/detail/history 흐름 재설계 없이도 닫을 여지가 크다.
  - smallest safe next implementation cut은 broad feedback flow 재설계가 아니라 `/feedback` entry surface docs-first candidate memo다.
- wording drift / `[검증 필요]` subset
  - `/feedback/list`와 `/feedback/[id]`는 history/read-through 경계가 비교적 명확하지만, 둘을 한 배치로 묶어 필터/상세 작업영역/개발용 보조 정보까지 함께 손보면 support IA 재정렬로 번질 수 있다. [검증 필요]
  - `/feedback/[id]`의 진행 상태, 확인 메모, 체크리스트, 개발용 복구 액션까지 같은 문제로 다시 설계하는 일은 copy/helper polish가 아니라 flow/role 재설계에 가깝다. [검증 필요]
  - `/feedback`를 `/feedback/list`와 합치거나 canonical entry를 바꾸는 일, route redirect/정책 변경, dashboard support hub와의 역할 통합은 이번 후속 범위를 넘는다. [검증 필요]

### feedback entry-surface candidate memo

- feedback entry-surface role map
  - `/feedback`는 새 의견, 질문, 도움 요청을 저장하는 support entry surface다. `의견과 도움 요청 남기기`, `내용 저장하기`, 저장 후 list/detail 재확인 안내를 기준으로, entry 역할은 새 기록을 남기는 데서 닫힌다.
  - hero/header와 `무엇을 남기나요?` 안내는 “확정 답변을 받는 곳”이 아니라 “문제 상황과 개선 아이디어를 기록해 두는 곳”이라는 기대치를 먼저 준다. support entry로 남겨야 하는 핵심 문구는 이 기대치와 저장 후 follow-through 안내다.
  - `공유용 진단 번들`은 primary entry CTA가 아니라, 직접 공유나 지원 대응이 필요할 때만 쓰는 support helper다. diagnostics 정책이나 ops/debug flow owner처럼 보이게 다시 올리지 않는다.
  - `대시보드로 이동`은 entry를 벗어나는 보조 이동이고, `/feedback`의 canonical start point를 대신하지 않는다.
- first implementation candidate
  - route-cluster 안에서 가장 작은 첫 구현 후보는 `/feedback` entry surface copy/helper polish spike다.
  - 범위는 page header description, `무엇을 남기나요?` 안내, 저장 후 notice, `공유용 진단 번들` helper/주의 문구처럼 기대치와 support tone을 더 쉽게 읽히게 만드는 문구 정리에 한정한다.
  - 카테고리/메시지 form 구조, 저장 후 route 흐름, diagnostics 수집 정책, 번들 생성 정책, CTA destination은 바꾸지 않는다.
  - smallest safe next implementation cut은 broad feedback flow 재설계가 아니라 `/feedback` entry surface copy/helper polish spike다.
- wording drift / `[검증 필요]` subset
  - `공유용 진단 번들`을 entry의 동급 primary CTA처럼 끌어올리거나 diagnostics 정책/보안 경계를 다시 설계하는 일은 copy/helper polish가 아니라 support flow 재설계에 가깝다. [검증 필요]
  - 저장 후 list/detail 안내를 후속 route 변경이나 자동 이동 정책으로 확장하는 일, `/feedback/list`·`/feedback/[id]`와 entry 역할을 다시 섞는 일은 이번 후속 범위를 넘는다. [검증 필요]
  - `대시보드로 이동`의 위치나 canonical entry 관계를 다시 정의하는 일, feedback route cluster 자체의 정책/redirect를 바꾸는 일은 `N5` small-batch 범위를 넘는다. [검증 필요]

### feedback entry-surface post-spike sync memo

- landed 범위
  - `/feedback` entry surface copy/helper polish는 이미 landing했고, 실제 변경 범위는 `PageHeader` description, `무엇을 남기나요?` 안내, 저장 성공 notice, `공유용 진단 번들` helper/notice, 민감정보 주의 문구의 support tone 정리까지다.
  - 저장 성공 notice는 이후 목록/상세 follow-through를 더 또렷하게 읽히는 방향으로 정리됐고, 진단 번들 helper는 오류 재현이나 지원 대응에 직접 공유가 필요할 때만 쓰는 support helper로 더 분명히 적혔다.
- 유지된 경계
  - href destination, 버튼 수, form field 구조, diagnostics payload/policy, 저장 후 route 흐름은 그대로 유지됐다.
  - `내용 저장하기`는 계속 primary entry CTA이고, `공유용 진단 번들`은 support helper, `대시보드로 이동`은 보조 이동으로 남는다.
- next smallest candidate
  - current next `N5` question은 entry-surface copy/helper를 구현할지 여부가 아니라, entry-surface 다음으로 가장 작은 feedback 후속 batch를 무엇으로 둘지다.
  - 현 시점의 smallest candidate는 broad feedback flow 재설계가 아니라 `/feedback/list` history-surface docs-first candidate memo다.

### feedback history-surface candidate memo

- feedback history-surface role map
  - `/feedback/list`는 저장한 피드백을 다시 보는 support history surface다. `저장한 피드백 다시 보기` header, 상태/우선순위/마감일 조건으로 다시 훑는 목록, detail route로 이어지는 `기록 보기 ▶`를 기준으로, 새 접수보다 기존 기록 재확인에 초점을 둔다.
  - `새 의견 남기기`는 list-level action이지만 history surface의 primary 목적을 대체하지 않는다. 새 접수 entry로 돌아가는 보조 action일 뿐, 각 row/card의 detail follow-through와 같은 층위의 primary CTA로 다시 올리지 않는다.
  - `상세로 들어가면 남긴 내용, 첨부 진단, 진행 상태와 다음 확인 메모를 함께 다시 볼 수 있습니다.` helper는 card/detail follow-through expectation을 주는 문구다. 이 문구는 list 화면의 filter/search owner 설명이 아니라, detail read-through로 이어지는 안내로만 유지한다.
  - empty state `아직 저장된 피드백이 없습니다`와 `첫 의견 작성하기`는 history surface fallback이다. support entry가 비어 있을 때 `/feedback`로 되돌아가게 돕지만, history surface 자체를 entry 화면으로 재정의하지는 않는다.
- first implementation candidate
  - `/feedback/list`에서 가장 작은 구현 후보는 history-surface copy/helper polish spike다.
  - 범위는 page header description, detail follow-through helper, empty-state description, `기록 보기 ▶`처럼 detail read-through를 더 또렷하게 읽히게 만드는 문구 정리에 한정한다.
  - filter/search control 배치, 상태/우선순위/마감일 IA, row/card 순서, route destination, `/feedback/[id]` detail contract는 바꾸지 않는다.
  - smallest safe next implementation cut은 broad feedback flow 재설계가 아니라 `/feedback/list` history-surface copy/helper polish spike다.
- wording drift / `[검증 필요]` subset
  - filter/search IA를 재배치하거나 `새 의견 남기기`를 header primary CTA처럼 재격상하는 일은 copy/helper polish가 아니라 history/entry 역할 재설계에 가깝다. [검증 필요]
  - `기록 보기 ▶`를 detail read-through가 아닌 action CTA로 바꾸거나 `/feedback/[id]`의 진행 메모/진단 재확인 경계를 다시 설계하는 일은 이번 후속 범위를 넘는다. [검증 필요]
  - `/feedback/list` empty state를 entry canonical start로 다시 설명하거나 `/feedback`와 `/feedback/list`를 redirect/정책 수준에서 합치는 일은 `N5` small-batch 범위를 넘는다. [검증 필요]

### feedback history-surface post-spike sync memo

- landed 범위
  - `/feedback/list` history-surface copy/helper polish는 이미 landing했고, 실제 변경 범위는 `PageHeader` description, empty-state description/action label tone, detail follow-through helper, mobile/desktop CTA tone 조정까지다.
  - empty state는 먼저 기록을 남기고 이후 history list로 돌아오는 fallback 흐름을 더 쉽게 읽히게 정리됐고, list/card CTA는 detail read-through 톤을 더 분명히 드러내는 방향으로 맞춰졌다.
- 유지된 경계
  - href destination, filter/search control 배치, row/card 순서, 표시 개수, `/feedback/[id]` detail contract는 그대로 유지됐다.
  - `새 의견 남기기`는 계속 list-level 보조 action이고, `상세 기록 보기 →`는 row/card의 detail read-through follow-through로 남는다.
- next smallest candidate
  - current next `N5` question은 history-surface copy/helper를 구현할지 여부가 아니라, history-surface 다음으로 가장 작은 feedback 후속 batch를 무엇으로 둘지다.
  - 현 시점의 smallest candidate는 broad feedback flow 재설계가 아니라 `/feedback/[id]` detail read-through docs-first candidate memo다.

### feedback detail read-through candidate memo

- feedback detail-surface role map
  - `/feedback/[id]`는 개별 접수 내용을 다시 읽고 다음 확인 메모를 보는 detail read-through surface다. `피드백 상세` header, 본문 메시지, `진행 상태와 다음 확인 메모` 구성을 기준으로 제출 당시 맥락과 이후 확인 포인트를 이어서 보는 저장본으로 유지한다.
  - header action인 `내역`과 `새 의견`은 detail의 primary task를 대신하지 않는다. `내역`은 history surface로 돌아가는 보조 이동이고, `새 의견`은 entry surface로 넘어가는 보조 이동일 뿐, detail read-through보다 앞서는 primary CTA로 다시 올리지 않는다.
  - `이 화면에서 먼저 보는 정보`는 사용자용 read-through helper다. 이 블록은 “확정 답변”보다 “제출 당시 상황과 다음 확인 메모를 다시 보는 화면”이라는 기대치를 먼저 준다.
  - `공유·지원용 보조 정보`와 `공유·지원용 내보내기`는 support helper layer다. 직접 공유, 복구, 지원 대응이 필요할 때만 여는 보조 영역으로 유지하고, public first-read 영역의 핵심 정보처럼 다시 올리지 않는다.
  - `개발용 복구 액션`은 dev-only recovery helper 성격이므로 user-facing detail read-through copy와 같은 층위로 섞지 않는다.
- first implementation candidate
  - detail surface에서 가장 작은 구현 후보는 `/feedback/[id]` detail read-through copy/helper polish spike다.
  - 범위는 page header description, `이 화면에서 먼저 보는 정보` helper, `공유·지원용 보조 정보`/`공유·지원용 내보내기` 안내 문구처럼 read-through와 support helper 경계를 더 쉽게 읽히게 만드는 문구 정리에 한정한다.
  - 상태/우선순위/일정/태그/체크리스트 편집 흐름, 저장 동작, export 버튼 구조, issue template 흐름, dev recovery action 정책, route destination은 바꾸지 않는다.
  - smallest safe next implementation cut은 broad feedback flow 재설계가 아니라 `/feedback/[id]` detail read-through copy/helper polish spike다.
- wording drift / `[검증 필요]` subset
  - `개발용 복구 액션`의 노출 정책이나 Dev unlock/실행 흐름을 다시 설계하는 일은 copy/helper polish가 아니라 ops/debug 정책 조정에 가깝다. [검증 필요]
  - `공유·지원용 내보내기`를 primary CTA처럼 재격상하거나 JSON/Issue/export semantics를 바꾸는 일은 support helper 조정보다 flow 재설계에 가깝다. [검증 필요]
  - `내역`/`새 의견`의 위치나 canonical 관계를 다시 정의하는 일, `/feedback/list`·`/feedback`·`/feedback/[id]`의 route 흐름을 바꾸는 일은 `N5` small-batch 범위를 넘는다. [검증 필요]

### feedback detail read-through post-spike sync memo

- landed scope
  - `/feedback/[id]` detail read-through copy/helper polish는 이미 landing했고, 실제 변경 범위는 `PageHeader` description, `이 화면에서 먼저 보는 정보` helper, `공유·지원용 보조 정보` helper, `공유·지원용 내보내기` helper 문구 조정까지다.
  - read-through first-read layer와 support helper layer를 더 또렷하게 구분했지만, detail flow나 저장 구조를 다시 설계하지는 않았다.
- unchanged boundary
  - `내역`/`새 의견` href와 보조 이동 역할, 상태/우선순위/체크리스트 편집 흐름, export action semantics, dev recovery action 정책은 그대로 유지됐다.
  - `/feedback`, `/feedback/list`, `/feedback/[id]` cluster의 route contract와 `Public Stable` inventory도 바뀌지 않았다.
- next cut recommendation
  - current next `N5` question은 detail read-through copy/helper를 구현할지 여부가 아니라, feedback cluster 다음으로 가장 작은 후속 batch를 무엇으로 둘지다.
  - 현 시점의 smallest candidate는 broad feedback flow 재설계가 아니라 `feedback route-cluster post-polish closeout memo` 같은 docs-first candidate다.

### feedback route-cluster post-polish closeout memo

- feedback route-cluster role map
  - `/feedback`는 support entry surface다. 새 의견과 도움 요청을 남기는 entry 역할로 유지하고, `내용 저장하기`를 primary entry CTA로 둔다.
  - `/feedback/list`는 history surface다. 저장한 피드백을 다시 보며, `새 의견 남기기`는 list-level 보조 action이고 각 row/card는 detail read-through follow-through로 이어진다.
  - `/feedback/[id]`는 detail read-through surface다. 제출 당시 맥락, 진행 상태, 다음 확인 메모를 다시 읽고 필요할 때만 support/export helper를 펼쳐 본다.
- landed scope summary
  - entry surface에서는 `PageHeader` description, `무엇을 남기나요?` 안내, 저장 성공 notice, `공유용 진단 번들` helper/notice, 민감정보 주의 문구를 support entry 톤으로 정리했다.
  - history surface에서는 `PageHeader` description, empty-state description/action label tone, detail follow-through helper, mobile/desktop CTA tone을 support history/read-through 위계에 맞춰 정리했다.
  - detail surface에서는 `PageHeader` description, `이 화면에서 먼저 보는 정보`, `공유·지원용 보조 정보`, `공유·지원용 내보내기` helper를 read-through first-read layer와 support helper layer가 섞이지 않도록 정리했다.
- unchanged boundary list
  - `/feedback`, `/feedback/list`, `/feedback/[id]` route contract와 `docs/current-screens.md`의 `Public Stable` inventory는 그대로 유지됐다.
  - entry/history/detail의 flow semantics, 저장 후 route 흐름, `내역`/`새 의견`/`새 의견 남기기`/`View Feed →`의 기본 역할 관계는 바뀌지 않았다.
  - diagnostics payload/policy, export semantics, dev recovery action 정책, detail 편집 흐름, history filter/search IA, row/card 또는 block 순서도 바뀌지 않았다.
- future reopen trigger only
  - feedback flow 재설계가 필요해 entry/history/detail의 canonical 관계나 저장 후 이동 흐름을 다시 정의해야 할 때.
  - route policy 변경, `Public Stable` inventory 조정, route 추가/삭제, support surface 분류 변경이 필요할 때.
  - diagnostics/export/dev recovery helper 정책을 다시 정의하거나 user-facing first-read layer와 ops/dev helper 경계를 재설계해야 할 때.
  - history filter/search IA 재배치, detail 편집 흐름 재구성, entry helper를 primary CTA처럼 재격상하는 등 surface hierarchy 자체를 바꿔야 할 때.
  - 반대로 wording sync, closeout memo 보강, current inventory 재확인만 하는 라운드는 reopen trigger가 아니다.
- next smallest candidate recommendation
  - feedback route cluster는 현 상태로 stable support surface로 parked할 수 있다. current next `N5` question은 cluster 안의 새 구현 배치를 찾는 것이 아니라, reopen trigger가 실제로 생겼는지 여부를 확인하는 docs-first 판단이다.
  - 후속 라운드가 필요해도 first cut은 broad implementation이 아니라 trigger-specific audit memo여야 한다.

### next stable/public cluster selection audit memo

- remaining stable/public cluster map
  - `planning stable surface`는 `/planning`, `/planning/runs`, `/planning/runs/[id]`, `/planning/reports`, `/planning/reports/[id]`, `/planning/trash`를 포함한다. 결과 설명, 실행 기록, 보고서, 휴지통 흐름이 얽혀 있어 copy/helper만 열어도 broad result-flow 조정으로 번지기 쉽다.
  - `recommend / action follow-through surface`는 `/recommend`, `/recommend/history` 두 route를 묶는다. 현재 조건 기준 비교, planning linkage helper, 저장 히스토리 follow-through가 한 cluster 안에서 이어진다.
  - `상품 / 공공정보 / 탐색 surface`는 `/products*`, `/benefits`, `/compare`, `/gov24`, `/housing/*`, `/invest/companies`, `/public/dart*`, `/tools/fx`를 포함한다. route 수가 많고 freshness/source helper 밀도가 높아 small-batch 첫 후보로는 과하다.
  - `설정 / trust hub / 유지보수 surface`는 `/settings*` 묶음이다. data trust, backup/recovery, maintenance처럼 support/ops 성격이 강한 helper가 많아 wording 조정만으로도 policy 오해가 생길 수 있다.
- smallest viable next candidate
  - 현 시점의 next stable/public cluster 후보는 `recommend / action follow-through surface`다.
  - 이유는 `Public Stable` route가 `/recommend`, `/recommend/history` 두 개로 비교적 작고, `/dashboard` 및 `/feedback`처럼 route contract를 바꾸지 않고도 host-surface copy/helper hierarchy를 docs-first로 먼저 좁힐 수 있기 때문이다.
  - 다만 이 cluster도 planning linkage, compare/store follow-through가 얽혀 있어 바로 구현 spike보다 candidate memo audit부터 여는 편이 안전하다.
- defer for now
  - `planning stable surface`는 run/report/trash semantics와 계산 결과 설명 층위가 묶여 있어 지금 열면 broad-scope risk가 크다.
  - `상품 / 공공정보 / 탐색 surface`는 최신성 helper, source trust cue, route family 수가 많아 single cluster로 잡기에는 과하다.
  - `설정 / trust hub / 유지보수 surface`는 data-source trust hub owner와 recovery/maintenance helper가 함께 있어 wording polish만으로 닫기 어렵다.
- next cut recommendation
  - current next `N5` cut은 broad implementation이 아니라 `recommend route-cluster candidate memo audit` 같은 docs-first narrowing round여야 한다.
  - first cut도 cluster 전체 구현보다 `/recommend` host surface와 `/recommend/history` follow-through surface를 어떻게 자를지부터 정리하는 audit이 더 안전하다.
  - 비범위 항목은 planning stable result-flow 재설계, product/public-data freshness policy 조정, settings trust/ops policy 변경, stable/public IA 재편이다.

### stable-public remaining-surface reselection audit memo

- parked baseline
  - `/feedback` route cluster는 current closeout memo 기준으로 parked 상태를 유지한다. wording sync, closeout memo 보강, current inventory 재확인만으로는 reopen trigger가 되지 않으므로 이번 remaining-surface reselection에서는 제외한다.
- remaining stable/public cluster map
  - `planning stable surface`는 `/planning`, `/planning/runs`, `/planning/runs/[id]`, `/planning/reports`, `/planning/reports/[id]`, `/planning/trash`를 포함한다. 결과 설명, 실행 기록, 보고서, 휴지통 흐름이 얽혀 있어 지금도 broad result-flow 조정으로 번질 위험이 크다.
  - `recommend route cluster`는 `/recommend`, `/recommend/history` 두 route를 묶는다. history, host pre-result, result-header, planning-linkage strip small cut이 모두 landing한 현재 상태에서는 남은 질문이 새 micro spike라기보다 cluster를 parked 경계로 닫을지 여부에 더 가깝다. [검증 필요]
  - `products/public/explore cluster`는 `/products*`, `/benefits`, `/compare`, `/gov24`, `/housing/*`, `/invest/companies`, `/public/dart*`, `/tools/fx`를 포함한다. `/products` host, `/products/catalog`, `/products/compare`의 좁은 read-through/helper cut은 landing했지만, 남은 family는 freshness/source/disclosure trust helper와 더 강하게 묶여 있어 broad family를 다시 여는 편이 위험하다. [검증 필요]
  - `settings/trust-hub family`는 `/settings*` 묶음이다. `/settings` host와 `/settings/data-sources`는 landing했고 `OpenDartStatusCard`도 `none for now`로 닫혔지만, 남은 `alerts`/`backup`/`recovery`/`maintenance`는 rule/filter semantics나 side effect가 큰 operator flow와 더 가깝다. [검증 필요]
- current smallest viable next candidate
  - current smallest viable next candidate는 `recommend route-cluster post-polish closeout memo`다.
  - `/recommend` cluster는 host/history/result-header/planning-linkage 이후에 새 UI spike를 하나 더 안전하게 떼어 내기보다, 이미 landing한 좁은 cut의 경계와 reopen trigger를 cluster 단위로 잠그는 docs-first 정리가 더 작다. [검증 필요]
- defer for now
  - `planning stable surface`는 run/report/trash result-flow와 계산 근거 설명이 묶여 있어 current reselection 기준에서도 broad-scope risk가 크다.
  - `products/public/explore cluster`는 남은 중심 후보가 compare/filter/store semantics 또는 freshness/source/disclosure helper와 가까워, broad cluster를 다시 열지 않고 그대로 defer하는 편이 맞다. [검증 필요]
  - `settings/trust-hub family`는 남은 route가 alerts rule/preset/filter, backup/recovery/maintenance operator semantics에 더 가깝고, wording polish만으로 안정적으로 분리되는 micro cut이 뚜렷하지 않다. [검증 필요]
  - `/feedback` route cluster는 parked 유지 상태라 reopen trigger가 실제로 생길 때까지 defer 대상이 아니라 제외 상태로 둔다.
- next cut recommendation
  - current next `N5` cut은 broad stable/public 구현이 아니라 `recommend route-cluster post-polish closeout memo` 같은 docs-first closeout sync여야 한다.
  - first cut은 `/recommend` host/history 역할, pre-result/result-header/planning-linkage/history landed scope, unchanged boundary, future reopen trigger만 잠그고 새 copy/helper spike를 만들지 않는 편이 안전하다. [검증 필요]
- non-scope
  - 실제 UI 구현, `/recommend` 또는 `/recommend/history` 재수정, route 추가/삭제, stable/public IA 재편, planning linkage/store flow 재설계, compare/save/export semantics 변경, result card trust cue/`비교 담기`/`상세 분석` semantics 변경, products compare/filter/store semantics 변경, settings trust/ops policy 변경은 이번 reselection 범위가 아니다.
- broad rewrite risk
  - broad stable/public rewrite로 가면 planning result-flow, recommend compare/store semantics, products source/freshness helper, public disclosure trust cue, settings trust/ops policy가 한 큐로 다시 얽힌다. 그러면 current docs-first reselection이 작은 closeout/park 판단이 아니라 multi-surface contract reopen으로 커질 가능성이 높다. [검증 필요]

### stable-public post-cluster-closeout reselection audit memo

- parked baseline
  - `/feedback` route cluster는 current closeout memo 기준으로 parked 상태를 유지한다. wording sync, closeout memo 보강, current inventory 재확인만으로는 reopen trigger가 아니다.
  - `recommend route cluster`도 current closeout memo 기준으로 parked 상태를 유지한다. cluster 내부 새 spike가 아니라 trigger-specific docs-first question이 생겼는지 여부만 남는다. [검증 필요]
  - `products/public/explore cluster`도 current closeout memo 기준으로 parked 상태를 유지한다. landed된 `/products`/`/products/catalog`/`/products/compare`와 defer route를 다시 한 큐로 섞지 않는다. [검증 필요]
  - `settings/trust-hub cluster`도 current closeout memo 기준으로 parked 상태를 유지한다. `/settings` host와 `/settings/data-sources` landed scope, `OpenDartStatusCard` `none for now`, defer된 alerts/backup/recovery/maintenance를 다시 broad family 구현 질문으로 되돌리지 않는다. [검증 필요]
- post-cluster-closeout stable/public cluster map
  - current remaining stable/public cluster는 사실상 `planning stable surface` 하나다. 포함 route는 `/planning`, `/planning/runs`, `/planning/runs/[id]`, `/planning/reports`, `/planning/reports/[id]`, `/planning/trash`다.
  - 그 외 cluster인 `/feedback`, `/recommend`, `products/public/explore`, `settings/trust-hub`는 모두 parked baseline으로 유지하고, 이번 reselection에서는 reopen 대상이 아니라 제외 상태로 둔다.
- planning stable surface micro-cut check
  - 겉으로는 `/planning/reports` dashboard host read-through memo나 `/planning/runs` history helper memo가 다음 micro cut처럼 보일 수 있다. 하지만 현재 code path를 보면 `/planning` host는 quick-start/save-run과 `/planning/runs`·`/planning/reports` deep-link를 같은 surface에서 함께 소유하고, `/planning/runs`는 history, compare, report follow-through, delete/restore-to-trash를 같이 다룬다. [검증 필요]
  - `/planning/reports`와 `/planning/reports/[id]`도 run scope selection, baseline compare, saved-report creation, recommend history reverse-link, product/benefit follow-through를 한 surface에서 함께 다룬다. `/planning/trash`는 runs/reports restore/delete/empty와 planning/runs return flow를 같이 가진다. [검증 필요]
  - 따라서 planning stable surface 안에서 보이는 남은 질문은 route-local copy/helper 부족이라기보다 runId/profileId selection, report save/deep-link, recommend/product follow-through, trash restore/delete semantics처럼 broad result-flow/contract 층위에 더 가깝다. 현 시점에는 stable한 micro docs-first cut으로 분리됐다고 보기 어렵다. [검증 필요]
- current smallest viable next candidate
  - current smallest viable next candidate는 현재 `none for now`다.
  - `planning stable surface` 안에서 apparent narrow candidate를 억지로 하나 고르면 result-flow/contract reopen으로 바로 커질 가능성이 높아, post-cluster-closeout 기준에서는 새로운 docs-first spike를 권장하지 않는다. [검증 필요]
- defer for now
  - `planning stable surface`
  - `/feedback` route cluster parked baseline 유지
  - `recommend route cluster` parked baseline 유지
  - `products/public/explore cluster` parked baseline 유지
  - `settings/trust-hub cluster` parked baseline 유지
- next cut recommendation
  - current next `N5` recommendation은 stable/public backlog 안에서 새 구현 배치나 새 micro spike를 만드는 것이 아니라, 현재 상태를 `none for now`로 인정하고 trigger-specific docs-first question이 실제로 생겼을 때만 다시 여는 것이다.
  - 비범위 항목은 실제 UI 구현, 이미 closeout된 cluster 재오픈, route 추가/삭제, stable/public IA 재편, planning result-flow 재설계, compare/filter/store semantics 변경, settings trust/ops policy 변경, freshness/source/build/store policy 변경이다.
- broad rewrite risk
  - 여기서 broad stable/public rewrite로 가면 remaining `planning stable surface`의 run/report/trash contract와, 이미 parked된 recommend/products/settings/feedback cluster의 compare/store/source/trust/support 정책이 다시 한 큐로 얽힌다. 그러면 current reselection의 목적이던 “남은 smallest safe cut 판별”이 아니라 multi-surface contract reopen으로 커질 위험이 높다. [검증 필요]

### stable-public none-for-now closeout memo

- closeout scope sync
  - 이번 closeout에서 확정하는 것은 `/feedback`, `recommend`, `products/public/explore`, `settings/trust-hub` cluster가 모두 parked baseline으로 잠겼다는 상태다.
  - current remaining stable/public surface는 사실상 `planning stable surface` 하나지만, 현재 code path와 route 경계 기준으로는 이것도 stable한 micro docs-first cut으로 더 분리되지 않는다고 본다. [검증 필요]
  - 따라서 current smallest viable next candidate는 현재 `none for now`로 잠그고, `N5 stable/public`은 새 micro spike를 더 만들지 않는 상태로 닫는다. [검증 필요]
- unchanged boundary
  - `src/app/planning/page.tsx`, `src/app/planning/runs/page.tsx`, `src/app/planning/runs/[id]/page.tsx`, `src/app/planning/reports/page.tsx`, `src/app/planning/reports/[id]/page.tsx`, `src/app/planning/trash/page.tsx` 구현은 바뀌지 않는다.
  - route/href contract, planning run/report/trash result-flow contract, compare/filter/store semantics, settings trust/ops policy, freshness/source/build/store policy, stable/public IA도 바뀌지 않는다.
  - 이번 closeout은 새 구현 배치나 새 candidate memo를 만드는 것이 아니라, 현재 parked baseline과 planning stable defer 경계만 문서에 고정하는 작업이다. [검증 필요]
- current next question
  - current next question은 더 이상 “다음 micro spike를 무엇으로 둘 것인가”가 아니다.
  - 이제 질문은 trigger-specific reopen이 실제로 생겼는지 여부다. wording sync, closeout memo 보강, current inventory 재확인만으로는 current next question을 다시 열지 않는다. [검증 필요]
- future reopen trigger
  - planning run/report/trash contract를 다시 정의해야 할 때
  - route/href contract를 다시 정의해야 할 때
  - result-flow/IA question이 trigger-specific docs-first question으로 다시 좁혀질 때
  - 그 밖에 parked baseline과 planning stable defer 경계를 실제로 흔드는 trigger-specific docs-first question이 생겼을 때
- next cut recommendation
  - current next recommendation은 새 구현 배치가 아니라 `none for now`를 유지하고, trigger-specific reopen 존재 여부를 docs-first로만 확인하는 것이다.
  - broad stable/public rewrite뿐 아니라 planning stable surface 안의 억지 micro spike도 현 시점 backlog의 current next로 남기지 않는다. [검증 필요]
- broad rewrite risk
  - stable/public을 broad rewrite로 다시 열면 remaining `planning stable surface`의 run/report/trash result-flow contract와, 이미 parked된 recommend/products/settings/feedback cluster의 compare/store/source/trust/support 정책이 한 번에 다시 얽힌다. closeout된 cluster boundary와 defer boundary를 동시에 흔들 가능성이 크다. [검증 필요]

---

## 5. small-batch backlog 규칙

- 한 배치는 한 개의 host surface 또는 하나의 안정된 route cluster만 다룬다.
- 한 배치에서 동시에 여러 IA 축을 넓게 손보지 않는다.
- 허용되는 변경은 아래 범위로 제한한다.
  - 쉬운 한국어 기준 copy 정리
  - helper 문구/위치/길이 조정
  - trust cue / freshness helper / follow-through CTA 정리
  - empty / error / fallback 문구 정리
  - 같은 stable surface 안에서의 위계와 점진적 공개 조정
- 한 배치가 아래 중 하나를 요구하면 `N5`가 아니라 별도 backlog로 분리한다.
  - 새 route
  - 새 기능
  - 새 stable 승격
  - beta exposure 재개
  - API / DTO / owner / import-export / rollback 규칙 변경
  - release gate / route policy 재정의
- 배치 목표는 `한 번에 큰 개선`이 아니라 `한 화면에서 한 가지 읽기 문제를 줄이는 것`으로 잡는다.

---

## 6. contract-first backlog를 막지 않기 위한 금지 규칙

- `N1 ~ N4`보다 `N5`가 우선순위를 가져서는 안 된다.
- `N5`를 이유로 `planning/v3` beta exposure 논의를 다시 열지 않는다.
- `planning/v3`를 public stable처럼 설명하거나 stable surface에 섞지 않는다.
- contract, schema, API, import-export, rollback, QA gate 문제를 polish 문서로 흡수하지 않는다.
- raw 상태, 내부 용어, 설정/운영 정보를 public 첫 화면이나 핵심 결과 영역의 전면 문구로 올리지 않는다.
- P1~P3 완료 항목을 대형 재설계 과제로 reopen하지 않는다.
- 기존 stable route의 host 역할을 바꾸는 nav/IA 재편을 `N5` 범위에서 진행하지 않는다.

---

## 7. 다음 구현 라운드로 넘기는 규칙

1. 구현 라운드는 `4절`의 한 surface 분류 안에서 한 개 route 또는 한 route cluster만 선택한다.
2. 구현 목표는 copy/helper/trust/CTA 정리 중 하나로만 좁힌다.
3. 기존 stable route 사이의 안내와 위계만 다루고, 새 beta/stable 경계는 만들지 않는다.
4. raw 운영 정보가 더 필요해 보여도 public surface에서 먼저 늘리지 말고, 기존 trust hub나 support 레이어로 보내는 방식을 우선 검토한다.
5. route 추가, beta/public 경계 조정, contract/gate 변경이 필요해지면 즉시 `N5` 범위 밖으로 분리한다.
6. `docs/current-screens.md`는 inventory로 유지하고, copy-only 라운드에서는 기본적으로 수정하지 않는다.
7. 후속 closeout은 `P1 ~ P3 reopen`이 아니라 `stable/public polish queue`의 작은 후속 배치로만 기록한다.

---

## 8. 이번 단계 결론

- `N5`는 기존 stable/public surface의 copy/helper/trust/CTA polish를 관리하는 small-batch 보조 backlog로 고정한다.
- polish 대상은 `docs/current-screens.md`의 `Public Stable` route로 한정한다.
- `planning/v3` beta exposure와 stable 승격 논의는 이번 backlog에서 다시 열지 않는다.
- 기존 `P1 ~ P3` 완료 항목은 reopen하지 않고, 필요한 후속 개선만 좁은 polish queue로 이어 간다.

### stable-surface alignment audit memo

- already aligned subset
  - `4.1 ~ 4.6` route 묶음은 `docs/current-screens.md`의 `Public Stable` inventory 39개와 1:1로 맞는다.
  - `Public Beta`, `Legacy Redirect`, `Local-only Ops`, `Dev/Debug`, `planning/v3`는 route 목록과 금지 규칙 양쪽에서 다시 끌어오지 않는다.
  - `analysis_docs/v2/15_planning_v3_beta_exposure_visibility_policy.md`의 parked `N4` policy overlay SSOT와도 충돌하지 않고, stable/public polish backlog로만 읽힌다.
- wording drift / `[검증 필요]` subset
  - current route coverage나 범위 문구 자체의 drift는 확인되지 않았다.
  - 남는 `[검증 필요]`는 future implementation round에서 `N5`를 이유로 stable IA/nav 변경, beta/internal surface 혼입, `planning/v3` stable 승격 논의를 다시 끌어오는지 여부다. [검증 필요]
