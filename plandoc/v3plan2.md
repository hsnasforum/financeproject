# financeproject v3 전체 계획 v2

## 작성 기준

- 기준일: 2026-03-26 (KST)
- 기준 문서:
  - `analysis_docs/v3/01_financeproject_v3_기획서.md`
  - `analysis_docs/v3/02_financeproject_v3_실행제안서.md`
  - `analysis_docs/v3/03_financeproject_v3_다음단계_실행계획.md`
  - `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- 기준 로그:
  - `work/3/26/2026-03-26-v3-import-to-planning-beta-targeted-gate-evidence-bundle-baseline-execution-audit.md`
  - `work/3/26/2026-03-26-v3-import-to-planning-beta-ops-readiness-baseline-and-promotion-policy-closeout.md`
  - `work/3/26/2026-03-26-v3-ops-readiness-operator-safety-follow-up-audit.md`

## 1. 현재 결론

- `analysis_docs/v3`의 현재 제품 기준선은 broad v3 확장이 아니라 `Import-to-Planning Beta` 1축이다.
- representative funnel은 현재 구현, representative e2e, `/work` closeout chain 기준으로 닫혀 있다.
- `Stream B. Contract & QA`는 targeted beta gate / evidence bundle 정의와 baseline PASS 기록까지 확보했다.
- `Stream C. Ops & Readiness`는 disposable sandbox 기준으로 `v3:doctor`, `v3:export`, `v3:restore`, `v3:support-bundle` baseline execution evidence와 operator safety follow-up closeout까지 확보했다.
- `v3:restore` warning 124건은 current baseline 기준 restore blocker가 아니라 `UNKNOWN_ALLOWED_PATH` warning-only inventory notice로 읽고, safest archive placement rule은 current `.data` 밖 절대 경로로 `docs/runbook.md`에 고정했다.
- promotion / exposure는 당장 새 작업 축이 아니라, explicit policy trigger가 생길 때만 다시 여는 parked 영역으로 둔다.

## 2. 전체 단계 지도

| 단계 | 목적 | 현재 상태 | 다음 판단 |
| --- | --- | --- | --- |
| Stage 1. Product Flow Baseline | representative funnel과 stable destination을 닫는다 | 완료 후 parked | `none for now` |
| Stage 2. Stream B. Contract & QA | official proof set을 고정하고 baseline PASS를 남긴다 | 완료 후 parked | 추가 trigger 없으면 유지 |
| Stage 3. Stream C. Ops & Readiness | operator baseline 실행 evidence를 남긴다 | 완료 후 parked | `none for now` |
| Stage 4. Promotion / Exposure Policy | official entry, public beta inventory, stable destination tier를 정책으로 분리한다 | 완료 후 parked | policy trigger 있을 때만 reopen |

## 3. 단계별 상세 계획과 완료 기준

### 3.1 Stage 1. Product Flow Baseline

범위:

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

현재 상태:

- representative funnel follow-through는 closeout 상태다.
- stable `/planning`, `/planning/runs`, `/planning/reports`, `/planning/reports/[id]` helper/handoff micro batch도 현재 `none for now`로 park한다.

완료 기준:

1. official beta entry, deep-link, stable destination tier가 문서와 실제 route에 맞는다.
2. representative funnel helper/handoff micro batch가 closeout memo로 잠긴다.
3. product-flow 내부 current next candidate가 더 이상 새 helper spike가 아니라 trigger-specific reopen으로 바뀐다.

### 3.2 Stage 2. Stream B. Contract & QA

핵심 proof set:

- base gate
  - `pnpm build`
  - `pnpm lint`
  - `pnpm test`
- representative e2e proof asset
  - `tests/e2e/v3-draft-apply.spec.ts`
  - `tests/e2e/planning-quickstart-preview.spec.ts`
  - `tests/e2e/flow-history-to-report.spec.ts`

현재 상태:

- targeted beta gate / evidence bundle 정의는 문서로 고정됐다.
- 위 proof set은 baseline execution audit에서 실제로 PASS 기록을 남겼다.
- `planning-v2-fast`와 full `pnpm e2e:rc`는 adjacent broader regression asset로 계속 분리한다.

완료 기준:

1. targeted beta gate set과 evidence bundle asset map이 문서로 고정된다.
2. base gate 3개와 representative e2e 3개가 최소 1회 같은 기준선으로 PASS 기록을 남긴다.
3. first failing asset이 있었다면 최소 수정으로 정리되거나 별도 residual risk로 분리된다.
4. conditional gate인 `planning:current-screens:guard`, `planning:ssot:check`의 위치가 일관되게 남는다.

### 3.3 Stage 3. Stream C. Ops & Readiness

핵심 asset:

- `pnpm v3:doctor`
- `pnpm v3:export`
- `pnpm v3:restore`
- `pnpm v3:support-bundle`

현재 상태:

- `/tmp/finance-v3-ops-audit` disposable sandbox에서 위 4개 baseline이 모두 실행됐다.
- `v3:restore`는 preview/apply 모두 PASS고, warning 124건은 current baseline 기준 restore blocker가 아니라 `UNKNOWN_ALLOWED_PATH` warning-only inventory notice로 남아 있다.
- safest archive placement rule은 current `.data` 밖 절대 경로이고, `docs/runbook.md`에 operator rule이 이미 landed 했다.
- 따라서 `operator safety follow-up audit`은 future candidate가 아니라 현재 closeout 완료 항목으로 읽는 편이 맞다.

완료 기준:

1. `v3:doctor/export/restore/support-bundle` 실행 evidence가 `/work`에 남는다.
2. product-flow proof와 operator readiness가 서로 다른 층위로 문서에 분리된다.
3. warning inventory 분류와 archive placement 운영 규칙이 `/work`와 `docs/runbook.md`에 고정된다.
4. route/href/public exposure를 건드리지 않고 ops baseline을 닫는다.

### 3.4 Stage 4. Promotion / Exposure Policy

현재 상태:

- official entry는 representative funnel entry로 유지한다.
- `/planning/v3/*`는 current-screens 기준 `Public Beta` inventory로 유지한다.
- stable `/planning`, `/planning/runs`, `/planning/reports`, `/planning/reports/[id]`는 destination tier로 분리해 읽는다.
- broad route promotion, IA 재설계, `/planning/v3/start` 승격은 현재 trigger가 없다.

완료 기준:

1. official entry, public beta inventory, stable destination tier가 서로 다른 층위라는 점이 문서에 고정된다.
2. `docs/current-screens.md`, `analysis_docs/v3`, backlog memo가 같은 정책을 가리킨다.
3. promotion / exposure는 broad rewrite가 아니라 explicit policy trigger가 생길 때만 다시 연다는 결론이 남는다.

## 4. 지금 기준 다음 단계

### 4.1 기본 next step

- 기본 next step은 새 구현 배치가 아니라 `parked baseline 유지`다.
- 즉, 현재 `analysis_docs/v3` 기준으로는 새 micro batch를 억지로 열지 않는 편이 맞다.

### 4.2 후속 reopen이 필요해진다면

아래처럼 trigger-specific일 때만 다시 연다.

1. restore validator / whitelist contract 또는 archive persistence semantics를 실제로 바꿔야 할 때
2. `promotion policy trigger audit`
   - official entry, public beta inventory, stable destination tier를 실제로 바꿔야 하는 요구가 생겼는지 확인

현재 판단:

- 둘 다 아직 필수 next step은 아니다.
- 기본값은 `none for now`에 가깝고, 실제 trigger가 생길 때만 다시 여는 편이 안전하다.

## 5. 전체 완료 기준

`analysis_docs/v3` 기준 현재 계획 라운드를 “완료”로 보는 기준은 아래다.

1. representative funnel이 route/handoff 기준으로 closeout 상태다.
2. targeted beta gate / evidence bundle이 문서와 baseline PASS 기록으로 닫혔다.
3. ops/readiness baseline이 doctor/export/restore/support-bundle evidence까지 남겼다.
4. official entry, public beta inventory, stable destination tier 정책이 문서로 분리 정리됐다.
5. 남은 항목이 broad 구현 backlog가 아니라 trigger-specific reopen 조건으로만 남는다.

## 6. Reopen Trigger

아래가 생길 때만 현재 parked 상태를 다시 연다.

- representative funnel route/href/query contract를 실제로 바꿔야 할 때
- stable `/planning`, `/planning/runs`, `/planning/reports` handoff semantics를 실제로 바꿔야 할 때
- targeted proof set 자체를 바꿔야 하는 새 공식 요구가 생길 때
- restore validator / whitelist contract 또는 archive persistence semantics를 실제로 바꿔야 할 때
- official entry, public beta inventory, stable destination tier를 다시 정해야 하는 정책 trigger가 생길 때

## 7. 비범위

- broad v3 route promotion
- stable/public IA 전면 재설계
- `/planning/v3/start` 즉시 승격
- `news/journal/exposure/scenarios` 메인 entry 승격
- 새 CI matrix 즉시 추가
- targeted proof set과 unrelated broader regression asset을 같은 층위로 묶기

## 8. 한 줄 결론

- `analysis_docs/v3`의 현재 전체 계획은 사실상 한 바퀴 닫혔고, 지금 가장 안전한 운영 방식은 `representative funnel park + Stream B/Stream C baseline 유지 + trigger 있을 때만 reopen`이다.
