# 03. financeproject v3 다음 단계 실행 계획

작성 기준

- 기준 문서: `analysis_docs/v3/01_financeproject_v3_기획서.md`, `analysis_docs/v3/02_financeproject_v3_실행제안서.md`
- 기준 시점: 2026-03-26 (KST)
- 추가 확인 범위: `docs/current-screens.md`, `docs/planning-v3-kickoff.md`, `package.json`, `src/app/planning/v3/**`, `work/3/25/*`, `work/3/26/*`
- 문서 목적: v3 문서의 공통 결론을 actual kickoff 기준선과 representative funnel closeout 상태로 동기화

문서 성격

- `[현행 확인]`: 저장소 파일과 최신 `/work`에서 직접 확인한 내용
- `[해석]`: 확인된 사실을 바탕으로 한 구조 판단
- `[권장]`: 다음 단계 실행을 위한 제안
- `[검증 필요]`: 실제 팀 운영/배포/사용자 기대에 따라 다시 확인해야 하는 항목

---

## 0. 실행 결론

[권장]

`analysis_docs/v3` 기준 다음 단계는 broad v3 추진이 아니라 아래 한 흐름을 1차 베타 제품으로 고정하는 것이다.

> **Import-to-Planning Beta**
> `transactions -> batches -> balances -> profile/drafts -> preflight/apply -> stable planning/runs/reports`

[해석]

- `01`, `02` 문서의 공통 결론은 모두 `Option B. 로컬-퍼스트 Import-to-Planning Beta`다.
- 따라서 다음 단계의 핵심은 기능 추가보다 **공식 entry, deep-link, internal 경계**를 먼저 잠그고, 그다음 **한 개의 사용자 funnel**만 구현/검증 대상으로 삼는 것이다.

---

## 1. 기준선 요약

### 1.1 최신 저장소 기준

[현행 확인]

- 최신 `/work` 기준선은 `2026-03-26-v3-import-to-planning-beta-representative-funnel-followthrough-closeout-docs-only-sync.md`와 같은 날짜의 representative funnel implementation chain까지 반영된 상태다.
- `planning/v3` 하위에는 이미 다음 route surface가 존재한다.
  - `transactions`
  - `transactions/batches`
  - `transactions/batches/[id]`
  - `balances`
  - `profile/drafts`
  - `profile/drafts/[id]`
  - `profile/drafts/[id]/preflight`
  - 그 외 `accounts`, `batches`, `drafts`, `news*`, `journal`, `exposure`, `scenarios`, `start`, `import/csv`
- `package.json`에는 다음 명령이 이미 존재한다.
  - `pnpm v3:doctor`
  - `pnpm v3:export`
  - `pnpm v3:restore`
  - `pnpm planning:v3:import:csv`
  - `pnpm planning:current-screens:guard`
  - `pnpm planning:ssot:check`
  - `pnpm build`
  - `pnpm lint`
  - `pnpm test`

### 1.2 current-screens와의 관계

[현행 확인]

- `docs/current-screens.md`는 `/planning/v3/*` 전체를 `Public Beta / experimental / in-progress` inventory로 유지하고 있다.

[해석]

- 이것은 **“존재하는 Public Beta route inventory”**를 뜻한다.
- 반면 `analysis_docs/v3/01`, `02`가 제안하는 것은 **“공식적으로 먼저 보여 줄 베타 진입 경로”**다.
- 즉, 현재 기준에서는 `current-screens`와 `analysis_docs/v3`가 충돌한다고 보기보다, **inventory와 official entry 범위가 다르다**고 읽는 것이 맞다.

### 1.3 기존 kickoff 문서와의 관계

[현행 확인]

- `docs/planning-v3-kickoff.md`는 계좌연동/정밀 세금·연금/optimizer/멀티유저를 더 넓은 v3 epic으로 정의한다.

[해석]

- 이 문서는 **장기 v3 방향**에 가깝고,
- `analysis_docs/v3/01`, `02`는 **현재 저장소 기준으로 실제 다음 사이클에 착수 가능한 좁은 베타 제품 정의**에 가깝다.

[권장]

- 다음 단계 실행 기준은 `docs/planning-v3-kickoff.md`보다 `analysis_docs/v3/01`, `02`를 우선한다.
- kickoff 문서는 background 문서로 유지하되, 현재 구현/검증 순서는 본 문서 기준으로 해석한다.

---

## 2. 공식 1차 베타 범위

### 2.1 Official Entry

[권장]

1차 베타에서 공식적으로 보여 줄 entry는 아래 4개 축으로 제한한다.

| route | 현재 상태 | Phase 1 판단 | 비고 |
| --- | --- | --- | --- |
| `/planning/v3/transactions` | 실존 route, 현재는 `/planning/v3/transactions/batches`로 즉시 redirect | official beta entry 유지 | 사용자용 시작 alias로만 읽는다. 독립 funnel 확장은 이번 라운드 비범위다. |
| `/planning/v3/transactions/batches` | 실존 page | official beta entry 유지 | 실제 import batch 작업 중심 진입점이다. |
| `/planning/v3/balances` | 실존 page | official beta entry 유지 | import 결과를 월별 흐름/잔액 맥락으로 읽는 확인 축이다. |
| `/planning/v3/profile/drafts` | 실존 page | official beta entry 유지 | stable planning handoff 직전 검토 entry다. |

- `/planning/v3/transactions`
- `/planning/v3/transactions/batches`
- `/planning/v3/balances`
- `/planning/v3/profile/drafts`

[해석]

- 첫 진입 설명력은 `/planning/v3/transactions`가 가장 높다.
- `/planning/v3/transactions/batches`는 실제 작업 중심 진입점이다.
- `/planning/v3/balances`는 가져온 데이터가 어떤 흐름으로 읽히는지 보여 주는 projection 확인 축이다.
- `/planning/v3/profile/drafts`는 stable planning handoff 직전의 검토 축이다.

### 2.2 Deep-link Only

[권장]

공식 entry는 아니지만 1차 베타 funnel 안에서 필요한 deep-link는 아래와 같다.

| route | 현재 상태 | Phase 1 판단 | 비고 |
| --- | --- | --- | --- |
| `/planning/v3/transactions/batches/[id]` | 실존 page | deep-link only 유지 | 배치 상세/보정용이다. |
| `/planning/v3/profile/drafts/[id]` | 실존 page | deep-link only 유지 | 초안 개별 검토용이다. |
| `/planning/v3/profile/drafts/[id]/preflight` | 실존 page | deep-link only 유지 | apply 전 영향 범위 확인용이다. |
| `/planning/reports` | stable 실존 page | deep-link only 유지 | v3 공식 entry가 아니라 stable 결과 확인 도착점이다. |

- `/planning/v3/transactions/batches/[id]`
- `/planning/v3/profile/drafts/[id]`
- `/planning/v3/profile/drafts/[id]/preflight`
- stable `/planning/reports`

### 2.3 1차 메인 진입으로 올리지 않을 경로

[권장]

다음 경로는 존재하더라도 1차 베타의 메인 entry/홍보 축으로 올리지 않는다.

- `/planning/v3/news*`
- `/planning/v3/journal`
- `/planning/v3/exposure`
- `/planning/v3/scenarios`
- `/planning/v3/accounts`
- `/planning/v3/batches`
- `/planning/v3/drafts*`
- `/planning/v3/import/csv`

[검증 필요]

아래 경로는 현행 route inventory에는 남아 있지만, 이번 Phase 1 kickoff 기준선에서는 `non-entry/internal` 또는 `non-entry/onboarding wrapper 후보`로만 읽는다.

| route group | 현재 상태 | Phase 1 판단 | 이유 |
| --- | --- | --- | --- |
| `/planning/v3/news*` | 실존 page군 | non-entry/internal | import-to-planning funnel과 다른 제품 메시지다. |
| `/planning/v3/journal` | 실존 page | non-entry/internal | 판단 기록 축이며 1차 베타 메인 entry와 다르다. |
| `/planning/v3/exposure` | 실존 page | non-entry/internal | import-to-planning 핵심 흐름보다 별도 설정 성격이 강하다. |
| `/planning/v3/scenarios` | 실존 page | non-entry/internal | broad v3 exploration 축으로 남긴다. |
| `/planning/v3/accounts` | 실존 page | non-entry/internal | 1차 공식 entry보다 뒤의 보조 정리 축이다. |
| `/planning/v3/batches` | 실존 page | non-entry/internal | raw batch center 성격으로 읽고 `transactions/batches`를 사용자-facing overlay로 둔다. |
| `/planning/v3/drafts*` | 실존 page군 | non-entry/internal | compat/raw draft cluster로 유지한다. |
| `/planning/v3/import/csv` | 실존 page | non-entry/internal | raw import surface이며 공식 entry로 승격하지 않는다. |
| `/planning/v3/start` | 실존 page | non-entry/onboarding wrapper 후보 | 현재 구현은 news/exposure/journal readiness checklist 중심이라 import funnel entry와 직접 맞지 않는다. |

[해석]

- `docs/current-screens.md`의 `Public Beta inventory`는 route 존재/분류의 SSOT이고,
- 여기서 말하는 `official entry`, `deep-link only`, `non-entry/internal`은 이번 베타 kickoff용 노출 우선순위 overlay다.
- 즉, route inventory를 바꾸지 않고도 official entry proposal을 더 좁게 잠글 수 있다.

### 2.4 `/planning/v3/start` 판단 메모

[현행 확인]

- `/planning/v3/start`는 현재 `첫 실행 체크리스트` page이며, `.data/news/*`, `.data/exposure/*`, `.data/journal/*` 존재 여부를 읽고 `/planning/v3/news`, `/planning/v3/news/settings`, `/planning/v3/exposure`, `/planning/v3/journal`로 이어지는 local readiness wrapper 성격이 강하다.

[권장]

- 이번 Phase 1에서는 `/planning/v3/start`를 official beta entry로 승격하지 않는다.
- 가장 안전한 현재 해석은 `non-entry/onboarding wrapper 후보`다.
- 후속 reopen trigger는 아래 둘 중 하나가 실제로 생길 때만 둔다.
  1. `/planning/v3/start`가 import-to-planning funnel 전용 onboarding으로 다시 설계될 때
  2. `/planning/v3/transactions` redirect alias보다 `/planning/v3/start`가 더 적절한 공식 첫 진입점이라는 근거가 생길 때

---

## 3. 대표 사용자 흐름

[권장]

다음 단계의 기준 시나리오는 아래 하나로 고정한다.

1. 사용자가 `/planning/v3/transactions`로 진입한다.
2. CSV import 또는 batch 진입을 통해 거래내역을 가져온다.
3. `/planning/v3/transactions/batches`와 `/planning/v3/transactions/batches/[id]`에서 배치를 확인/보정한다.
4. `/planning/v3/balances`에서 월별 흐름과 잔액 맥락을 확인한다.
5. `/planning/v3/profile/drafts`에서 자동 초안을 검토한다.
6. `/planning/v3/profile/drafts/[id]/preflight`에서 apply 전 영향 범위를 확인한다.
7. apply 뒤 stable `/planning?profileId=...`로 도착해 첫 실행과 결과 저장을 마친다.
8. stable `/planning/runs`에서 저장된 실행 기록을 다시 읽고 비교한다.
9. stable `/planning/reports`에서 저장된 결과를 다시 읽는다.
10. 필요하면 stable `/planning/reports/[id]`에서 saved detail tier를 연다.

[해석]

- 이 시나리오가 닫히면 v3는 “거래내역 기반 자동 초안 생성형 플래너”라는 메시지를 실제 제품 흐름으로 설명할 수 있다.
- 반대로 `news/journal/exposure/scenarios`를 함께 올리면 제품 메시지가 다시 분산된다.

### 3.1 첫 구현 배치 권장

[권장]

첫 구현 배치는 아래 한 묶음만 연다.

1. `transactions` entry wording 또는 redirect alias 확인
2. `transactions/batches` 목록과 `transactions/batches/[id]` 상세/보정 흐름
3. `balances` projection 확인
4. `profile/drafts` 목록/상세
5. `preflight/apply`를 거쳐 stable `/planning` 도착, `/planning/runs`, `/planning/reports`, `/planning/reports/[id]` follow-through까지 닫히는 handoff

[해석]

- 이 배치는 `Import-to-Planning Beta`의 대표 funnel과 1:1로 맞는다.
- `/planning/v3/news*`, `/planning/v3/journal`, `/planning/v3/exposure`, `/planning/v3/scenarios`, `/planning/v3/start` 재설계는 이 배치를 막는 선행 조건이 아니다.

### 3.2 2026-03-26 follow-through closeout sync

[현행 확인]

- 현재 official beta representative funnel은 아래 경로 축으로 읽는 편이 맞다.
  - `/planning/v3/transactions`
  - `/planning/v3/transactions/batches`
  - `/planning/v3/transactions/batches/[id]`
  - `/planning/v3/balances`
  - `/planning/v3/profile/drafts`
  - `/planning/v3/profile/drafts/[id]`
  - `/planning/v3/profile/drafts/[id]/preflight`
  - stable `/planning`
  - stable `/planning/runs`
  - stable `/planning/reports`
  - stable `/planning/reports/[id]`
- `/planning/v3/transactions`는 지금도 redirect alias를 유지한다.
- stable `/planning/runs`는 history/comparison tier다.
- stable `/planning/reports`는 기본 destination tier다.
- stable `/planning/reports/[id]`는 saved detail tier다.
- reports dashboard의 selected saved detail helper는 valid/stale/pending, focus/visibility revalidation, manual recheck까지 current implementation 기준으로 닫힌 상태다.

[권장]

- representative funnel closeout map은 아래 1개로 잠근다.
  - `transactions -> batches -> batch detail -> balances -> profile drafts -> draft detail -> preflight/apply -> stable /planning -> stable /planning/runs -> stable /planning/reports -> stable /planning/reports/[id]`
- already-landed handoff boundary는 아래처럼 읽는다.
  - entry surface: `/planning/v3/transactions` redirect alias, `/planning/v3/transactions/batches` beta entry wording/CTA
  - beta follow-through: batch detail, balances, profile drafts, draft detail, preflight/apply copy/handoff
  - stable arrival: `/planning?profileId=...` next-step focus handoff, quickstart 4단계 wording
  - stable history/comparison: `/planning/runs` landing, selected state, compare state, no-runs/no-selection helper, valid single-run handoff
  - stable destination: `/planning/reports` landing/empty state, dashboard saved-detail save handoff, stale fallback, pending helper, focus revalidation, manual recheck
  - saved detail: `/planning/reports/[id]` destination helper
- 아래 micro helper chain은 current smallest viable next candidate를 `none for now`로 잠근다.
  - stable `/planning` quickstart 내부 새 micro helper batch
  - stable `/planning/runs` helper wording 추가 micro spike
  - stable `/planning/reports` selected saved detail helper 추가 micro spike
  - stable `/planning/reports/[id]` destination wording 추가 micro spike
- future reopen trigger는 아래 경우로만 둔다.
  - route/href/query contract를 실제로 바꿔야 하는 요구
  - stable `/planning` quickstart semantics, runs-to-report handoff semantics, saved detail validation/freshness semantics를 실제로 바꿔야 하는 요구
  - representative funnel 외의 다음 공식 축을 고를 제품 결정
  - saved detail background refresh, polling, new entry promotion처럼 현재 비범위 결정을 다시 열어야 하는 요구
- broad 비범위는 그대로 유지한다.
  - broad v3 route promotion
  - `/planning/v3/start` 승격
  - `news/journal/exposure/scenarios` 메인 entry 승격
  - stable/public IA 재설계
  - route inventory/current-screens 재분류

[해석]

- 현재 단계에서 더 안전한 질문은 “reports helper 안에서 무엇을 더 미세하게 다듬을 것인가”가 아니다.
- 대표 funnel의 entry, follow-through, stable destination, saved-detail fallback이 current implementation 기준으로 이미 연결돼 있어, 같은 체인 안에서 새 micro helper batch를 계속 열면 route tier와 entry policy, saved-detail contract까지 다시 흔들릴 위험이 더 크다.
- 따라서 current next question은 trigger-specific reopen이 실제로 생겼는지 여부, 또는 import-to-planning beta 다음 공식 축을 무엇으로 고를지 여부로 바꾸는 편이 맞다.

### 3.3 2026-03-26 post-closeout next official axis reselection audit

[현행 확인]

- already-landed product-flow boundary는 아래 representative e2e 자산으로 다시 확인된다.
  - `tests/e2e/v3-draft-apply.spec.ts`: `profile/drafts -> preflight/apply -> /planning?profileId=...`
  - `tests/e2e/planning-quickstart-preview.spec.ts`: stable `/planning` 도착, next-step focus handoff, 첫 실행/결과 저장/리포트 follow-through
  - `tests/e2e/flow-history-to-report.spec.ts`: stable `/planning/runs -> /planning/reports -> /planning/reports/[id]`, saved-detail valid/stale/pending, focus revalidation, manual recheck
- current gate/readiness asset map은 아래처럼 나뉜다.
  - product-flow QA asset: `pnpm build`, `pnpm lint`, `pnpm test`, `pnpm planning:current-screens:guard`, 그리고 위 3개 representative e2e spec
  - ops/readiness asset: `pnpm v3:doctor`, `pnpm v3:export`, `pnpm v3:restore`, `pnpm v3:support-bundle`, 그리고 `planning/v3/ops/{doctor,export,restore,supportBundle}.ts`
- `package.json` 기준 현재 저장소에는 targeted beta gate 전용 명령은 없고, representative funnel을 증명할 수 있는 build/lint/test/e2e asset과 별도로 ops/readiness command가 공존한다.
- 같은 날짜의 DART triage note는 isolated rerun green 상태이며, `/public/dart` baseline 이슈가 이번 import-to-planning beta 축 재선정과 직접 충돌하지 않는다.

[권장]

- post-closeout next-axis map은 아래 2개 층으로만 읽는다.
  - `Stream B. Contract & QA`: representative funnel targeted beta gate + evidence bundle 선정
  - `Stream C. Ops & Readiness`: `pnpm v3:doctor`, `pnpm v3:export`, `pnpm v3:restore`, `pnpm v3:support-bundle` 운영/복구 루틴 정리
- current smallest viable next official axis는 `Stream B. Contract & QA` 1개로 고정하는 편이 맞다.
- `Stream B`를 지금 열 경우 current smallest official question은 아래 1개다.
  - 이미 landed한 representative e2e와 base gate를 묶어 `transactions -> preflight/apply -> stable /planning -> /planning/runs -> /planning/reports -> /planning/reports/[id]`를 증명하는 targeted beta gate/evidence bundle을 어디까지로 고정할 것인가
- `Stream C`를 지금 열 경우 current smallest official question은 아래 1개지만, 이번 라운드의 next official axis로는 후순위로 둔다.
  - `pnpm v3:doctor`, `pnpm v3:export`, `pnpm v3:restore`, `pnpm v3:support-bundle`를 operator readiness로 어떻게 실행/기록할지, 그리고 support bundle / feedback triage 접점을 어디서 닫을지
- `Stream B`의 current non-goal은 아래처럼 잠근다.
  - `pnpm v3:doctor`/`export`/`restore` 실운영 루틴 확정
  - restore apply rehearsal, backup/rollback policy 확정
  - support bundle 배포/feedback triage 운영 규칙 확정
  - broad v3 promotion
  - stable/public IA 재설계

[해석]

- `Stream B`는 이미 landed한 user-path asset을 묶어 “무엇을 베타 증거로 인정할지”만 정하면 되므로, broad reopen 없이 가장 작게 열 수 있다.
- 반면 `Stream C`는 export/restore/support bundle처럼 `.data` 백업/복구와 operator workflow를 포함하므로, readiness와 recovery semantics를 함께 다뤄야 해 현재 단계의 smallest docs-only cut보다 한 층 넓다.
- 따라서 representative funnel closeout 뒤의 current next question은 새 helper micro batch가 아니라 `Stream B` targeted beta gate/evidence bundle 선정으로 좁히고, `Stream C`는 후속 공식 축으로 보류하는 편이 안전하다.

### 3.4 2026-03-26 targeted beta gate / evidence bundle alignment

[현행 확인]

- current code 기준 representative funnel proof asset은 아래 2개 층으로 이미 존재한다.
  - base gate: `pnpm build`, `pnpm lint`, `pnpm test`
  - representative e2e asset: `tests/e2e/v3-draft-apply.spec.ts`, `tests/e2e/planning-quickstart-preview.spec.ts`, `tests/e2e/flow-history-to-report.spec.ts`
- `tests/e2e/planning-v2-fast.spec.ts`는 stable `/planning`, `/planning/runs`, `/planning/reports`, legacy redirect, 접근성 control을 넓게 확인하는 인접 stable regression asset이지만, import-to-planning beta representative funnel만을 증명하는 좁은 proof set은 아니다.
- `pnpm e2e:rc`도 current stable/public smoke 묶음으로는 유효하지만, `v3-draft-apply.spec.ts`를 포함하지 않고 DART/data-sources/news surface까지 함께 묶으므로 current targeted beta gate와는 층위가 다르다.
- `pnpm planning:current-screens:guard`와 `pnpm planning:ssot:check`는 route inventory/href/catalog 영향이 있을 때만 쓰는 conditional gate다.
- `pnpm v3:doctor`, `pnpm v3:export`, `pnpm v3:restore`, `pnpm v3:support-bundle`은 계속 `Stream C. Ops & Readiness` asset이다.

[권장]

- current targeted beta gate set은 아래 1개로 잠근다.
  - `pnpm build`
  - `pnpm lint`
  - `pnpm test`
  - `tests/e2e/v3-draft-apply.spec.ts`
  - `tests/e2e/planning-quickstart-preview.spec.ts`
  - `tests/e2e/flow-history-to-report.spec.ts`
- evidence bundle asset map은 아래처럼 읽는다.
  - `tests/e2e/v3-draft-apply.spec.ts`: `profile/drafts -> preflight/apply -> stable /planning?profileId=...` apply handoff proof
  - `tests/e2e/planning-quickstart-preview.spec.ts`: stable `/planning` arrival, next-step focus handoff, 첫 실행/결과 저장/리포트 follow-through proof
  - `tests/e2e/flow-history-to-report.spec.ts`: stable `/planning/runs -> /planning/reports -> /planning/reports/[id]`, single-run handoff, compare 흐름, saved-detail valid/stale/pending/focus/manual-recheck proof
  - `pnpm build`, `pnpm lint`, `pnpm test`: representative funnel proof를 지탱하는 repository baseline gate
- conditional gate rule은 아래처럼 고정한다.
  - route inventory/current-screens 영향이 있을 때만 `pnpm planning:current-screens:guard`
  - route policy와 catalog guard를 함께 건드릴 때만 `pnpm planning:ssot:check`
- 아래 asset은 `Stream C`로 defer한다.
  - `pnpm v3:doctor`
  - `pnpm v3:export`
  - `pnpm v3:restore`
  - `pnpm v3:support-bundle`
- 아래는 broad 비범위로 유지한다.
  - 새 package script 추가
  - 새 representative e2e/CI matrix 추가
  - `pnpm e2e:rc`를 targeted beta gate로 재정의
  - `tests/e2e/planning-v2-fast.spec.ts`를 representative funnel proof set으로 승격
  - broad v3 route promotion

[해석]

- 이번 라운드는 이미 있는 asset을 “어떤 층으로 읽을지” 고정하는 작업이지, 새 gate 체계를 구현하는 작업이 아니다.
- 아직 dedicated script가 없는 상태에서 새 command나 CI matrix를 먼저 만들면, representative funnel proof와 stable/public smoke, 그리고 `Stream C` ops readiness를 한 덩어리로 묶어 읽게 될 위험이 크다.
- 따라서 지금은 `targeted beta gate set`과 `evidence bundle asset map`을 문서로만 잠그고, 실행 방식의 집계 자동화는 별도 후속 라운드에서 다루는 편이 맞다.

---

## 4. Phase 1 kickoff 계획

### 4.1 목표

[권장]

Phase 1의 목표는 “무엇을 보여 줄지”를 먼저 잠그는 것이다.  
즉, broad v3 정리가 아니라 **entry/funnel/gate 기준선**을 닫는 단계다.

### 4.2 이번 Phase 1에서 잠글 항목

[권장]

1. 공식 제품 문장 1개
2. official entry 4개 route
3. deep-link only route 목록
4. internal/experimental route 목록
5. 대표 사용자 시나리오 1개
6. beta 기본 게이트 세트
7. stable 조건부 게이트 세트

### 4.3 이번 Phase 1에서 아직 열지 않을 항목

[권장]

- cloud/multi-user
- auth/tenant/encryption 본구현
- news/journal/exposure/scenarios 전면 승격
- stable IA/nav 전면 개편
- v3 전체 공개 승격

### 4.4 broad v3 route promotion을 지금 열면 위험한 이유

[권장]

1. `docs/current-screens.md`의 inventory는 route 존재 사실이고, official beta entry는 노출 우선순위 overlay인데 이를 섞으면 current-screens 재분류를 성급히 열게 된다.
2. `/planning/v3/start`, `news*`, `journal`, `exposure`, `scenarios`는 현재 import-to-planning funnel과 다른 제품 메시지를 갖고 있어 공식 entry로 올리면 베타 가치 제안이 분산된다.
3. 현재 `/planning/v3/transactions`조차 독립 page가 아니라 `transactions/batches` redirect alias이므로, broad promotion은 실체보다 넓은 진입 정책을 먼저 약속하는 문제가 생긴다.
4. stable `/planning/reports`와의 handoff를 닫기 전에 broad v3 entry를 늘리면 “무엇을 먼저 검증할 것인가”보다 “무엇을 다 보여 줄 것인가”가 앞서게 된다.

---

## 5. 워크스트림별 착수 순서

### Stream A. Product Flow

[권장]

첫 구현 배치는 아래 순서로 좁힌다.

1. `/planning/v3/transactions` entry wording / redirect alias
2. `/planning/v3/transactions/batches`와 `/planning/v3/transactions/batches/[id]` handoff
3. `/planning/v3/balances`, `/planning/v3/profile/drafts`, `/planning/v3/profile/drafts/[id]`, `/planning/v3/profile/drafts/[id]/preflight` follow-through
4. stable `/planning` arrival, stable `/planning/runs`, stable `/planning/reports`, stable `/planning/reports/[id]` destination/helper chain
5. current representative funnel closeout 이후 `none for now` stop line 확인

### Stream B. Contract & QA

[권장]

1. base gate를 `pnpm build`, `pnpm lint`, `pnpm test`로 고정
2. representative e2e asset을 `tests/e2e/v3-draft-apply.spec.ts`, `tests/e2e/planning-quickstart-preview.spec.ts`, `tests/e2e/flow-history-to-report.spec.ts` 3개로 고정
3. 위 6개 asset을 current targeted beta gate/evidence bundle proof set으로 문서에 고정
4. `pnpm planning:current-screens:guard`, `pnpm planning:ssot:check`는 conditional gate로만 유지
5. `pnpm v3:doctor`/`export`/`restore`/`support-bundle`는 별도 ops/readiness 층으로 유지

### Stream C. Ops & Readiness

[권장]

1. `pnpm v3:doctor` 기준선 확인
2. `pnpm v3:export`, `pnpm v3:restore` preview/apply 안전 루틴 확인
3. `pnpm v3:support-bundle`과 support bundle / feedback triage 접점 정리
4. 이 축은 `Stream B` targeted beta gate 선정 이후의 후속 공식 축으로 다룬다

---

## 6. 검증 기준

### 6.1 docs-only 계획 라운드

[권장]

- `git diff --check -- analysis_docs/v3/03_financeproject_v3_다음단계_실행계획.md analysis_docs/v2/11_post_phase3_vnext_backlog.md work/3/26/2026-03-26-v3-import-to-planning-beta-targeted-gate-evidence-bundle-alignment-docs-only-sync.md`

### 6.2 Stream B base gate

[권장]

- `pnpm build`
- `pnpm lint`
- `pnpm test`

### 6.3 Stream B targeted beta gate / evidence bundle

[권장]

- `tests/e2e/v3-draft-apply.spec.ts`
- `tests/e2e/planning-quickstart-preview.spec.ts`
- `tests/e2e/flow-history-to-report.spec.ts`

[해석]

- 이 3개 spec은 current representative funnel proof asset이며, 현재는 asset set으로 고정한다.
- 아직 별도 package script나 CI matrix를 새로 만들지 않았으므로, current 문서 기준선은 “무엇을 돌려야 하는가”보다 “무엇을 official proof set으로 인정하는가”를 잠그는 데 초점을 둔다.

### 6.4 조건부 게이트

[권장]

- route inventory/current-screens 영향 시
  - `pnpm planning:current-screens:guard`
- route policy와 catalog guard를 함께 건드릴 때
  - `pnpm planning:ssot:check`

### 6.5 Stream C로 defer하는 ops/readiness asset

[권장]

- `pnpm v3:doctor`
- `pnpm v3:export`
- `pnpm v3:restore`
- `pnpm v3:support-bundle`

---

## 7. 현재 closeout 상태와 다음 질문

[권장]

- `Import-to-Planning Beta` representative funnel follow-through chain은 현재 기준으로 closeout 가능한 상태다.
- current smallest viable next candidate는 이 체인 안에서 `none for now`로 둔다.
- current smallest viable next official axis는 `Stream B. Contract & QA`다.
- `Stream B`의 current smallest official question은 representative funnel targeted beta gate/evidence bundle을 existing asset 기준으로 어디까지 고정할지다.
- current targeted beta gate는 base gate 3개와 representative e2e asset 3개를 묶은 proof set으로 읽고, `pnpm e2e:rc`나 `planning-v2-fast` 같은 broader regression asset과는 구분한다.
- `Stream C. Ops & Readiness`는 별도 후속 축으로 남기고, product-flow beta proof와 ops/readiness routine을 같은 층위로 섞지 않는다.

### 다음 질문

1. representative funnel 안에서 route/href/query/result-flow contract를 실제로 바꿔야 하는 trigger-specific reopen이 생겼는가
2. existing build/lint/test/e2e 자산 중 무엇을 import-to-planning beta targeted gate/evidence bundle로 고정할 것인가
3. `Stream C` ops/readiness 축은 `Stream B` 이후 어느 범위에서 따로 열 것인가

### current non-goal

- reports/runs/helper micro spike 재개
- `Stream B`와 `Stream C`를 같은 라운드에 동시 착수
- 새 package script 추가
- 새 CI matrix 설계
- broad v3 route promotion
- stable/public IA 재설계
- `docs/current-screens.md` inventory 재분류
- 이미 green으로 닫힌 2026-03-26 helper batch 재개

---

## 8. 최종 권장

[권장]

지금 `financeproject v3`의 다음 단계는  
“무엇을 더 만들 것인가”보다  
“무엇을 먼저 베타 제품으로 고정할 것인가”를 잠그는 작업이다.

따라서 다음 단계는 아래처럼 진행하는 것이 가장 안전하다.

> **`analysis_docs/v3/01`, `02`의 결론을 기준으로  
> official beta entry는 그대로 유지하되,  
> `transactions -> batches -> balances -> profile/drafts -> preflight/apply -> stable /planning -> /planning/runs -> /planning/reports -> /planning/reports/[id]`  
> representative funnel follow-through를 closeout 상태로 잠그고,  
> current next question은 새 helper micro batch가 아니라 `Stream B. Contract & QA` targeted beta gate/evidence bundle 선정으로 넘기고,  
> `Stream C. Ops & Readiness`는 별도 후속 축으로 분리한다.**
