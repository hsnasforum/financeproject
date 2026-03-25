# 2026-03-19 N3 gate command ownership and release mapping hardening

## 변경 파일
- `analysis_docs/v2/14_planning_v3_qa_gate_and_golden_dataset.md`
- `docs/maintenance.md`
- `docs/release-checklist.md`
- `work/3/19/2026-03-19-n3-gate-command-ownership-release-mapping-hardening.md`

## 사용 skill
- `planning-gate-selector`: 이번 라운드를 docs-only로 유지하고 `git diff --check`만 실행하는 최소 검증 세트를 고정했다.
- `work-log-closeout`: ownership/release mapping 보정 내용, 실행 예시, 검증 결과, 다음 후속 배치를 `/work` 형식으로 정리했다.

## 변경 이유
- `N3` bootstrap 문서는 tier 매핑과 golden dataset inventory를 정리했지만, `single-owner final gate`, `subset gate`, `beta targeted gate`, `repair/bootstrap evidence`의 경계와 호출 예시가 아직 충분히 선명하지 않았다.
- `analysis_docs/v2/14...`, `docs/maintenance.md`, `docs/release-checklist.md` 사이에서 stable final gate와 beta/ops-dev 비승격 원칙을 같은 톤으로 잠글 필요가 있었다.

## 핵심 변경
- `analysis_docs/v2/14...`에 `subset gate`, `beta targeted gate`, `repair/bootstrap evidence` 용어를 추가하고, `pnpm release:verify -> pnpm build -> pnpm e2e:rc`를 stable final single-owner closeout 순서로 명시했다.
- `pnpm e2e:rc:dart`, `pnpm e2e:rc:data-sources`를 scoped stable subset gate로 재정의하고, full stable RC의 `pnpm e2e:rc` 대체가 아니라는 점을 표와 matrix에 모두 적었다.
- beta targeted Playwright는 existing runner pattern인 `node scripts/playwright_with_webserver_debug.mjs test <spec> --workers=1` 예시로 고정했다.
- `pnpm v3:doctor`, `pnpm v3:support-bundle`, `pnpm v3:restore`, `pnpm v3:migrate`, `pnpm planning:v3:import:csv`는 stable release gate가 아니라 ops/dev repair/bootstrap evidence라고 명시했다.
- `docs/maintenance.md`, `docs/release-checklist.md`에도 stable final single-owner gate와 subset/beta/ops-dev 비승격 원칙을 같은 문구 계열로 맞췄다.

## ownership / release mapping 정리
- stable final single-owner gate
  - primary: `pnpm release:verify`
  - companion: `pnpm build`
  - companion: `pnpm e2e:rc` (`사용자 경로/셀렉터 영향이 있을 때`)
- stable subset gate
  - `pnpm e2e:rc:dart`
  - `pnpm e2e:rc:data-sources`
  - 위 두 명령은 scoped stable helper 확인용이며 full stable RC closeout을 대체하지 않는다.
- beta targeted gate
  - `node scripts/playwright_with_webserver_debug.mjs test tests/e2e/flow-v3-import-to-cashflow.spec.ts --workers=1`
  - `node scripts/playwright_with_webserver_debug.mjs test tests/e2e/v3-draft-apply.spec.ts --workers=1`
  - relevant `tests/planning-v3-*`는 `pnpm test <file...>`로 좁힌다.
- ops/dev repair/bootstrap evidence
  - `pnpm v3:doctor`
  - `pnpm v3:support-bundle`
  - `pnpm v3:restore`
  - `pnpm v3:migrate`
  - `pnpm planning:v3:import:csv`

## 문서 보정 내용
- `analysis_docs/v2/14_planning_v3_qa_gate_and_golden_dataset.md`
  - command 분류 용어, stable final closeout 순서, subset gate 비대체 원칙, beta targeted 호출 예시, ops/dev repair evidence 성격을 추가했다.
- `docs/maintenance.md`
  - stable release candidate 최소 single-owner gate와 subset gate 비대체 원칙, beta/ops-dev 비승격 원칙을 추가했다.
- `docs/release-checklist.md`
  - `release:verify`, `build`, `e2e:rc`를 primary/companion final gate로 구분하고, subset gate와 beta/ops-dev 명령이 stable release blocker에 자동 포함되지 않는다고 명시했다.

## 검증
- 실행한 검증
- `git diff --check -- analysis_docs/v2/14_planning_v3_qa_gate_and_golden_dataset.md docs/maintenance.md docs/release-checklist.md work/3/19/2026-03-19-n3-gate-command-ownership-release-mapping-hardening.md`
  - 결과: 통과
- 미실행 검증
- `pnpm lint`
- `pnpm build`
- `pnpm e2e:rc`
- `pnpm release:verify`
- 이유: 이번 라운드는 docs-only라 사용자 지시대로 `git diff --check`만 실행했다.

## 남은 리스크
- `planning:v2:guard`, `planning:v2:engine:guard`, `planning:v2:freeze:guard`, `planning:v2:ops:*` 같은 보조 명령은 여전히 broad inventory 수준이며, 어떤 변경에서 언제 붙일지까지는 다음 배치에서 더 좁혀야 한다.
- beta targeted Playwright는 script alias가 아니라 runner pattern 기반이므로, 후속 배치에서 호출 ownership과 증적 남기는 위치를 더 엄격히 잠글 필요가 있다.
- 현재 워크트리에는 unrelated dirty 변경이 계속 남아 있으므로, 실제 커밋/PR에서는 이번 docs-only 범위를 분리해 확인해야 한다.

## 다음 N3 후속 배치 제안
- `N3 guard/minor gate classification and evidence logging matrix`
