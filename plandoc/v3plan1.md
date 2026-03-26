# financeproject v3 전체 계획 v1

## 작성 기준

- 기준일: 2026-03-26 (KST)
- 기준 문서:
  - `analysis_docs/v3/01_financeproject_v3_기획서.md`
  - `analysis_docs/v3/02_financeproject_v3_실행제안서.md`
  - `analysis_docs/v3/03_financeproject_v3_다음단계_실행계획.md`
  - `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- 기준 로그:
  - `work/3/26/2026-03-26-v3-import-to-planning-beta-representative-funnel-followthrough-closeout-docs-only-sync.md`
  - `work/3/26/2026-03-26-v3-import-to-planning-beta-post-closeout-next-official-axis-reselection-audit.md`
  - `work/3/26/2026-03-26-v3-import-to-planning-beta-targeted-gate-evidence-bundle-alignment-docs-only-sync.md`
  - `work/3/26/2026-03-26-v3-import-to-planning-beta-targeted-gate-evidence-bundle-baseline-execution-audit.md`
  - `work/3/26/2026-03-26-v3-import-to-planning-beta-ops-readiness-baseline-and-promotion-policy-closeout.md`

## 1. 현재 기준선

- v3의 현재 제품 메시지는 broad v3가 아니라 `Import-to-Planning Beta` 1축으로 읽는 편이 맞다.
- representative funnel은 아래 흐름으로 현재 closeout 상태다.
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
- representative funnel 내부 helper/handoff micro batch는 현재 `none for now`로 park하는 편이 맞다.
- `Stream B. Contract & QA`는 targeted proof set 문서 고정과 baseline PASS 기록까지 닫혔다.
- `Stream C. Ops & Readiness`는 disposable sandbox에서 `v3:doctor`, `v3:export`, `v3:restore` preview/apply, `v3:support-bundle` baseline까지 모두 기록됐다.
- promotion / exposure 질문은 이제 “broad v3를 더 열 것인가”가 아니라 “official entry, public beta inventory, stable destination tier를 실제로 바꿔야 하는 정책 trigger가 생겼는가”로 좁혀 읽는다.

## 2. 전체 단계 요약

| 단계 | 상태 | 목표 | 현재 판단 |
| --- | --- | --- | --- |
| Stage 1. Product Flow Baseline | 완료 후 parked | 대표 사용자 흐름을 실제 route/handoff 기준으로 닫기 | 현재 `none for now` |
| Stage 2. Stream B. Contract & QA | baseline closeout 완료 | targeted beta gate와 evidence bundle을 공식 proof set으로 고정 | PASS proof set 기록 완료 |
| Stage 3. Stream C. Ops & Readiness | baseline closeout 완료 | doctor/export/restore/support bundle 같은 운영 readiness를 baseline으로 고정 | restore preview/apply warning inventory와 archive 이동 semantics까지 분리 기록 |
| Stage 4. Promotion / Exposure | 정책 잠금 완료 | broader route promotion, visibility, stable/public 노출 확대 판단 | 현 시점 broad promotion 불필요 |

## 3. 단계별 상세 계획

### 3.1 Stage 1. Product Flow Baseline

범위:

- `/planning/v3/transactions` redirect alias
- `/planning/v3/transactions/batches` entry wording/CTA
- batch detail, balances, profile drafts, preflight/apply handoff
- stable `/planning` arrival/quickstart
- stable `/planning/runs`
- stable `/planning/reports`
- stable `/planning/reports/[id]`

현재 상태:

- representative funnel follow-through는 현재 구현과 `/work` closeout chain 기준으로 닫혀 있다.
- reports dashboard의 selected saved detail helper도 valid/stale/pending, focus revalidation, manual recheck까지 landed baseline이 있다.
- 따라서 이 단계는 새 micro spike를 더 열지 않고 parked baseline으로 유지한다.

완료 기준:

1. official beta representative funnel 경계가 문서와 실제 route에 맞는다.
2. entry, deep-link, stable destination tier가 섞이지 않는다.
3. representative funnel follow-through 관련 helper/handoff micro batch가 `none for now`로 closeout 된다.
4. 새 reopen trigger가 생기기 전까지 product-flow 내부 micro 배치를 다시 next candidate로 올리지 않는다.

### 3.2 Stage 2. Stream B. Contract & QA

목표:

- representative funnel을 무엇으로 검증하고, 무엇을 공식 proof로 인정할지 고정한다.

현재 proof set:

- base gate
  - `pnpm build`
  - `pnpm lint`
  - `pnpm test`
- representative e2e proof asset
  - `tests/e2e/v3-draft-apply.spec.ts`
  - `tests/e2e/planning-quickstart-preview.spec.ts`
  - `tests/e2e/flow-history-to-report.spec.ts`

이 단계에서 하는 일:

1. targeted beta gate와 evidence bundle의 경계를 문서로 고정한다.
2. 위 proof set을 실제로 실행해 baseline PASS/FAIL을 남긴다.
3. first failing asset이 나오면 가장 좁게 수정하고, proof set 기준으로 다시 닫는다.
4. adjacent broader regression asset과 targeted proof set을 섞지 않는다.

현재 상태:

- targeted beta gate / evidence bundle 정의는 docs-only sync까지 완료됐다.
- baseline execution audit에서 아래 묶음을 실제로 다시 실행했고 현재 PASS 기준선을 확보했다.
  - `pnpm build`
  - `pnpm lint`
  - `pnpm test`
  - `tests/e2e/v3-draft-apply.spec.ts`
  - `tests/e2e/planning-quickstart-preview.spec.ts`
  - `tests/e2e/flow-history-to-report.spec.ts`
- 따라서 Stream B는 “정의만 있는 상태”를 넘어 “baseline PASS가 한 번 기록된 상태”까지 왔다.
- 현재 질문도 더 이상 “proof set 정의”가 아니라, 이 proof set을 그대로 둔 채 operator readiness와 promotion policy를 어디까지 닫을지로 넘어갔다.

완료 기준:

1. targeted beta gate set과 evidence bundle asset map이 문서로 고정된다.
2. base gate 3개와 representative e2e 3개가 최소 1회 같은 기준선으로 PASS 기록을 남긴다.
3. first failing asset이 있었으면 최소 수정으로 해결되거나 [검증 필요] baseline으로 분리 기록된다.
4. `planning-v2-fast`, full `pnpm e2e:rc`, `planning:current-screens:guard`, `planning:ssot:check`의 조건부 위치가 문서와 `/work`에 일관되게 남는다.
5. 다음 질문이 “proof set 정의”가 아니라 “ops/readiness 축을 열지 여부”로 바뀐다.

### 3.3 Stage 3. Stream C. Ops & Readiness

목표:

- operator 관점에서 v3를 점검/백업/복구/지원 번들 수준까지 다룰 수 있는지 baseline을 남긴다.

핵심 asset:

- `pnpm v3:doctor`
- `pnpm v3:export`
- `pnpm v3:restore`
- `pnpm v3:support-bundle`

이 단계에서 하는 일:

1. 위 명령의 current baseline을 실제로 실행해 PASS/FAIL을 남긴다.
2. product-flow proof와 operator readiness를 같은 gate로 섞지 않는다.
3. 실패 시 product UI를 다시 여는 대신 ops surface/contract에 직접 연결된 가장 좁은 수정만 한다.

현재 상태:

- baseline execution audit에서 `/tmp/finance-v3-ops-audit` disposable sandbox를 만들고 아래 묶음을 실제로 실행했다.
  - `pnpm v3:doctor` PASS
  - `pnpm v3:export` PASS, archive=`/tmp/finance-v3-ops-audit/.data/exports/v3-data-backup-20260326124207.zip`
  - `pnpm v3:restore -- --in=.data/exports/v3-data-backup-20260326124207.zip` preview PASS, `errors=0 warnings=124`
  - `pnpm v3:restore -- --in=.data/exports/v3-data-backup-20260326124207.zip --apply` PASS, `restoredFiles=787`, `doctor ok=true`
  - `pnpm v3:support-bundle -- --out=.data/exports/v3-support-bundle-20260326124216.zip` PASS
- preview warning 124건은 `.data/news/**`, `.data/alerts/**`, `.data/indicators/specOverrides.json` 같은 허용 경로 내 확장 파일을 structure-only로 읽은 inventory다.
- `v3:restore --apply`는 현재 `.data` 전체를 먼저 `.data.bak-*`로 rename하기 때문에, archive를 `.data/exports` 아래에 둘 경우 apply 뒤 원래 archive path는 backup 쪽으로 이동한다. 이 archive placement semantics는 [검증 필요] operator residual risk로 분리한다.
- route/href/current-screens/public exposure는 건드리지 않고 ops baseline만 닫았다.

완료 기준:

1. `v3:doctor/export/restore/support-bundle` baseline 실행 기록이 남는다.
2. 각 명령의 성공/실패, 입력 조건, residual risk가 `/work`에 남는다.
3. operator readiness와 product-flow QA가 서로 다른 층위로 문서에 고정된다.
4. route/href/public exposure를 건드리지 않고도 ops baseline이 닫힌다.

### 3.4 Stage 4. Promotion / Exposure

목표:

- broad route promotion, visibility, stable/public 노출 확대를 검토한다.

현재 판단:

- Stream B와 Stream C baseline은 현재 기준으로 모두 닫혔다.
- `docs/current-screens.md`는 stable `/planning*` 경로를 `Public Stable`, `/planning/v3/*`를 `Public Beta`로 유지하고 있다.
- official entry는 representative funnel entry(`/planning/v3/transactions` redirect alias, `/planning/v3/transactions/batches`)와 stable destination tier(`/planning`, `/planning/runs`, `/planning/reports`, `/planning/reports/[id]`)로 계속 분리해 읽는다.
- 따라서 현 시점의 결론은 broad route promotion을 여는 것이 아니라, policy trigger가 생기기 전까지 현재 분류와 노출 정책을 잠그는 것이다.

이 단계에서만 검토할 수 있는 것:

- `/planning/v3/start` 재판단
- broader official entry 확대
- beta visibility / exposure policy
- stable/public IA 재편 여부

완료 기준:

1. Stream B와 Stream C가 모두 baseline 기준으로 닫힌다.
2. broad route promotion이 실제로 필요한 이유가 문서로 좁혀진다.
3. `docs/current-screens.md`, backlog, v3 실행 계획이 같은 정책을 가리킨다.
4. official entry, public beta inventory, stable destination tier가 더 이상 충돌하지 않는다.

## 4. 지금 기준 결론

- Stage 1부터 Stage 4까지의 completion criterion은 현재 기준으로 모두 충족됐다.
- 기본 follow-up은 없다. 이후 기본 상태는 `parked baseline 유지 + reopen trigger만 감시`다.
- 별도 후속 라운드를 연다면 아래 둘만 좁혀서 본다.
  1. restore warning inventory trimming 또는 apply 시 archive placement policy 정리 같은 operator safety 후속. [검증 필요]
  2. official entry / public beta inventory / stable destination tier를 실제로 바꿔야 하는 policy trigger

## 5. 단계별 완료 체크리스트

### Stage 1 체크리스트

- official entry / deep-link / stable destination 경계가 문서와 실제 구현에 맞는다.
- representative funnel helper micro batch가 closeout 상태다.
- reopen trigger가 없는 한 새 micro batch를 다시 열지 않는다.

### Stage 2 체크리스트

- targeted beta gate set이 문서로 고정돼 있다.
- evidence bundle asset map이 문서로 고정돼 있다.
- base gate 3개 PASS 기록이 있다.
- representative e2e 3개 PASS 기록이 있다.
- adjacent broader regression asset과 proof set이 구분돼 있다.

### Stage 3 체크리스트

- `v3:doctor` baseline 기록이 있다.
- `v3:export` baseline 기록이 있다.
- `v3:restore` baseline 기록이 있다.
- `v3:support-bundle` baseline 기록이 있다.
- operator readiness residual risk가 남아 있다면 [검증 필요]로 분리돼 있다.

### Stage 4 체크리스트

- Stream B, Stream C가 모두 닫혔다.
- exposure/promotion 질문이 broad rewrite가 아니라 실제 정책 질문으로 좁혀졌다.
- route inventory와 official entry policy가 함께 동기화돼 있다.

## 6. Reopen Trigger

아래가 생길 때만 닫힌 단계를 다시 연다.

- representative funnel route/href/query contract를 실제로 바꿔야 할 때
- stable `/planning`, `/planning/runs`, `/planning/reports` handoff semantics를 실제로 바꿔야 할 때
- targeted proof set을 바꾸는 새 공식 요구가 생길 때
- ops/readiness 명령의 실제 실패가 baseline으로 재현될 때
- beta visibility / exposure policy를 product/public 정책으로 끌어올려야 할 때

## 7. 비범위

- broad v3 route promotion
- stable/public IA 전면 재설계
- `/planning/v3/start` 즉시 승격
- `news/journal/exposure/scenarios` 메인 entry 승격
- 새 CI matrix 즉시 추가
- targeted proof set과 unrelated full regression을 같은 층위로 묶기

## 8. 한 줄 결론

- `analysis_docs/v3`의 현재 전체 계획은 `Import-to-Planning Beta representative funnel은 park`, `Stream B와 Stream C baseline은 모두 기록 완료`, `promotion / exposure는 정책 trigger가 생길 때만 다시 연다`로 정리하는 편이 가장 안정적이다.
