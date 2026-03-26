# 2026-03-26 v3 import-to-planning beta targeted-gate-evidence-bundle alignment docs-only sync

## 변경 전 메모

1. 수정 대상 파일
- `analysis_docs/v3/03_financeproject_v3_다음단계_실행계획.md`
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- 필요하면 `docs/planning-v3-kickoff.md`

2. 변경 이유
- next official axis는 `Stream B. Contract & QA`로 이미 재선정됐고, 이제 current smallest official question은 targeted beta gate/evidence bundle을 existing asset 기준으로 어디까지 고정할지다.

3. 실행할 검증 명령
- `git diff --check -- analysis_docs/v3/03_financeproject_v3_다음단계_실행계획.md analysis_docs/v2/11_post_phase3_vnext_backlog.md work/3/26/2026-03-26-v3-import-to-planning-beta-targeted-gate-evidence-bundle-alignment-docs-only-sync.md`

## 변경 파일

- `analysis_docs/v3/03_financeproject_v3_다음단계_실행계획.md`
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `work/3/26/2026-03-26-v3-import-to-planning-beta-targeted-gate-evidence-bundle-alignment-docs-only-sync.md`

## 사용 skill

- `planning-gate-selector`: docs-only 라운드에서 `base gate`, `targeted beta gate`, `conditional gate`, `Stream C defer`를 같은 층위로 섞지 않고 최소 검증 세트만 남기기 위해 사용
- `route-ssot-check`: `docs/current-screens.md` inventory, `planning:current-screens:guard`, `planning:ssot:check`를 official proof set과 분리해 읽기 위해 사용
- `work-log-closeout`: 이번 docs-only sync를 `/work` 표준 형식으로 기록하기 위해 사용

## 변경 이유

- next official axis는 이미 `Stream B. Contract & QA`로 재선정됐고, 이제 current smallest official question은 existing asset 중 무엇을 `Import-to-Planning Beta` 공식 proof set으로 인정할지 고정하는 일이었다.
- 이 시점에서 새 script나 새 CI matrix를 먼저 만들면 representative funnel proof, broader stable/public regression, ops readiness를 한 번에 섞어 읽게 될 위험이 커서, docs-only로 층위부터 잠그는 편이 더 안전했다.

## 핵심 변경

- `analysis_docs/v3/03_financeproject_v3_다음단계_실행계획.md`에 `3.4 targeted beta gate / evidence bundle alignment` section을 추가해 current proof asset을 `base gate 3개 + representative e2e 3개`로 고정했다.
- 같은 문서에서 `tests/e2e/planning-v2-fast.spec.ts`와 `pnpm e2e:rc`는 adjacent broader regression asset이지 current representative funnel targeted proof set은 아니라는 점을 분리해 적었다.
- `pnpm planning:current-screens:guard`, `pnpm planning:ssot:check`는 conditional gate로만 유지하고, `pnpm v3:doctor/export/restore/support-bundle`은 계속 `Stream C. Ops & Readiness` asset으로 defer한다고 명시했다.
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`에도 같은 결론을 local 연결 메모로 추가해, post-closeout 후속 질문이 helper micro spike가 아니라 targeted beta proof set 정의라는 점을 backlog 기준선에 맞췄다.
- `docs/current-screens.md`와 `docs/planning-v3-kickoff.md`는 route inventory/classification이나 장기 epic 정의를 바꾸지 않아 수정하지 않았다.

## 검증

- 실행:
  - `git diff --check -- analysis_docs/v3/03_financeproject_v3_다음단계_실행계획.md analysis_docs/v2/11_post_phase3_vnext_backlog.md work/3/26/2026-03-26-v3-import-to-planning-beta-targeted-gate-evidence-bundle-alignment-docs-only-sync.md`

- 미실행:
  - `pnpm lint`
  - `pnpm test`
  - `pnpm build`
  - `pnpm planning:current-screens:guard`
  - `pnpm planning:ssot:check`
  - `pnpm e2e:rc`
  - `pnpm v3:doctor`
  - `pnpm v3:export`
  - `pnpm v3:restore`
  - `pnpm v3:support-bundle`
  - 이유: 이번 라운드는 docs-only sync이며 구현 코드, route inventory, runtime contract, ops script 실행 방식을 바꾸지 않았다.

## 남은 리스크

- 이번 문서는 proof set을 “무엇으로 인정할지”만 잠갔고, 아직 이를 단일 script나 CI matrix로 집계하지는 않았다. 후속 라운드에서 실행 방식까지 닫을 때는 representative funnel proof와 broader stable/public smoke를 다시 섞지 않도록 조심해야 한다.
- `tests/e2e/planning-v2-fast.spec.ts`와 `pnpm e2e:rc`는 여전히 유용한 인접 regression asset이지만, current targeted beta gate로 승격한 것은 아니다. 이 경계를 흐리면 `Stream B`와 `Stream C`, stable/public regression이 다시 한 덩어리로 읽힐 수 있다.
