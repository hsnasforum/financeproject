# 2026-03-26 v3 plan2 roadmap doc sync

## 변경 파일
- `plandoc/v3plan2.md`
- `work/3/26/2026-03-26-v3-plan2-roadmap-doc-sync.md`

## 사용 skill
- `planning-gate-selector`: docs-only 계획 문서 라운드에 맞는 최소 검증을 `git diff --check` 중심으로 고르기 위해 사용
- `work-log-closeout`: 이번 문서 라운드의 변경 파일, 실제 확인 범위, residual risk를 `/work` 형식으로 남기기 위해 사용

## 변경 이유
- 최신 `/work` 기준으로는 representative funnel, Stream B, Stream C, promotion policy까지 모두 closeout 또는 parked baseline으로 잠긴 상태인데, `v3plan1`은 “현재 어떤 단계가 다음 공식 축인가” 관점이 남아 있었다.
- 이번 라운드는 최신 closeout 기준으로 `analysis_docs/v3` 전체 계획을 다시 한 장으로 묶고, 무엇이 완료됐고 무엇이 trigger가 있을 때만 다시 열리는지 `plandoc/v3plan2.md`에 분명히 남기는 것이 목적이었다.

## 핵심 변경
- `plandoc/v3plan2.md`를 새로 만들고 현재 v3 전체 계획을 `Stage 1. Product Flow Baseline`, `Stage 2. Stream B. Contract & QA`, `Stage 3. Stream C. Ops & Readiness`, `Stage 4. Promotion / Exposure Policy` 4단계로 다시 정리했다.
- 각 단계별 현재 상태를 `완료 후 parked` 또는 `baseline evidence 확보`로 정리하고, 더 이상 next implementation batch가 아닌 상태를 문서로 명시했다.
- representative funnel closeout, targeted proof set PASS baseline, ops baseline execution evidence, promotion policy sync를 전체 완료 기준으로 묶었다.
- immediate next step은 새 기능 배치가 아니라 `parked baseline 유지`로 두고, 후속 라운드를 굳이 열 때만 `operator safety follow-up audit` 또는 `promotion policy trigger audit` 두 후보로 좁혔다.
- broad v3 promotion, stable/public IA 재설계, `/planning/v3/start` 즉시 승격 같은 비범위를 다시 잠갔다.

## 검증
- `ls -lt work/3/26 | head -n 20`
  - 최신 `/work`가 `2026-03-26-v3-import-to-planning-beta-ops-readiness-baseline-and-promotion-policy-closeout.md`인지 확인
- `sed -n '1,240p' work/3/26/2026-03-26-v3-import-to-planning-beta-ops-readiness-baseline-and-promotion-policy-closeout.md`
  - 최신 closeout 범위와 실제 실행된 Stream C baseline evidence 확인
- `sed -n '1,220p' plandoc/v3plan1.md`
  - 기존 v3plan1 상태와 현재 문서 기준 비교
- `sed -n '1,260p' analysis_docs/v3/03_financeproject_v3_다음단계_실행계획.md`
  - analysis_docs/v3 현재 단계와 official policy 기준 확인
- `sed -n '860,980p' analysis_docs/v2/11_post_phase3_vnext_backlog.md`
  - latest backlog closeout memo와 next-axis 기록 확인
- `git diff --check -- docs/current-screens.md plandoc/v3plan1.md analysis_docs/v3/03_financeproject_v3_다음단계_실행계획.md analysis_docs/v2/11_post_phase3_vnext_backlog.md work/3/26/2026-03-26-v3-import-to-planning-beta-ops-readiness-baseline-and-promotion-policy-closeout.md`
  PASS
- `git diff --check -- plandoc/v3plan2.md work/3/26/2026-03-26-v3-plan2-roadmap-doc-sync.md`
  PASS
- `[미실행] pnpm lint`
  - 이번 새 변경은 문서 추가만이라 실행하지 않음
- `[미실행] pnpm test`
  - 이번 새 변경은 문서 추가만이라 실행하지 않음
- `[미실행] pnpm build`
  - 이번 새 변경은 문서 추가만이라 실행하지 않음
- `[미실행] pnpm planning:current-screens:guard`
  - route inventory/href를 새로 바꾸지 않아 실행하지 않음
- `[미실행] pnpm planning:ssot:check`
  - route policy/catalog 코드를 새로 바꾸지 않아 실행하지 않음
- `[미실행] pnpm e2e:rc`
  - 이번 새 변경은 문서 추가만이라 full regression을 다시 실행하지 않음

## 남은 리스크
- `v3plan2`는 최신 closeout 기준을 한 장으로 정리한 문서라, operator safety 후속이나 policy trigger reopen이 실제로 생기면 다시 동기화가 필요하다.
- 현재 전체 계획은 “docs-first 기준으로 사실상 닫힌 상태”를 정리한 것이지, broad v3 promotion이나 장기 product expansion을 승인한 문서는 아니다.
- `v3:restore` warning inventory와 archive placement semantics는 여전히 [검증 필요] operator residual risk로 남아 있으므로, 실제 운영 runbook 단계에서는 별도 보수적 판단이 필요하다.
