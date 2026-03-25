# 2026-03-22 N2 same-id coexistence explicit mirror write audit

## 변경 파일
- `analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md`
- `work/3/22/2026-03-22-n2-same-id-coexistence-mirror-write-audit.md`

## 사용 skill
- `planning-v3-batch-contract-narrowing`: same-id stored/legacy coexistence에서 mirror write 후보를 reader facade, writer owner, legacy bridge 기준으로 좁혀 정리했다.
- `planning-gate-selector`: audit/docs-only 라운드로 분류하고 `git diff --check`만 실행 검증으로 남기도록 최소 게이트를 골랐다.
- `work-log-closeout`: 이번 audit 결론, 실행 검증, 비범위와 잔여 리스크를 `/work` 형식으로 정리했다.

## 변경 이유
- same-id stored-meta + legacy coexistence는 reader 쪽 stored-first visible binding은 정렬됐지만 `/account` command success는 아직 explicit guard로 막혀 있다.
- 다음 단계 후보로 mirror write 또는 dual-write를 검토하려면, 어떤 write 순서가 가능한지와 partial failure/rollback contract가 어디서 막히는지 코드 기준으로 다시 정리할 필요가 있었다.
- 이번 라운드는 구현이 아니라 future mirror write를 열기 전 계약을 안전하게 자르는 audit이 목적이었다.

## 핵심 변경
- `analysis_docs/v2/13...`에 same-id coexistence explicit mirror write audit 단락을 추가해 `stored -> legacy`, `legacy -> stored`, `[미확인] best-effort dual-write` 세 후보를 분리해서 적었다.
- `stored -> legacy`는 visible reader와 first write owner를 맞추는 후보지만, legacy write 실패 시 stored meta primary binding을 원복할 rollback contract가 아직 없다는 점을 명시했다.
- `legacy -> stored`는 legacy append-write가 먼저 성공하면 visible reader는 계속 예전 stored binding을 보여 줄 수 있어 success semantics가 더 쉽게 과장된다는 점과, legacy `createdAt` drift가 hidden fallback metadata로 남을 수 있다는 점을 기록했다.
- smallest safe next cut은 `explicit mirror write bootstrap`이 아니라 `rollback ordering contract`로 정리했다. 즉 write 순서, secondary failure 시 rollback 순서, rollback까지 닫히지 않을 때의 user-facing failure를 먼저 확정해야 한다.
- 비범위도 함께 고정했다. same-id coexistence explicit mirror write 구현, partial-failure retry UX, legacy writer deprecation execution, stored/legacy owner merge, row rewrite, index repair는 이번 라운드에 포함하지 않았다.

## 검증
- 실행:
  - `git diff --check -- work/3/22/2026-03-22-n2-same-id-coexistence-mirror-write-audit.md analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md`
- 미실행 검증:
  - `pnpm test`
  - `pnpm lint`
  - `pnpm build`
  - `pnpm e2e:rc`

## 남은 리스크
- 이번 라운드는 audit/docs-only라 mirror write나 dual-write를 실제로 구현하거나 테스트하지 않았다.
- `stored -> legacy`를 future candidate로 보더라도, 기존 stored meta snapshot 원복과 legacy append-write failure 처리 순서를 닫는 contract가 아직 없다.
- same-id coexistence는 여전히 canonical writer owner가 하나로 정해지지 않았으므로, rollback ordering contract 없이 broad dual-write를 열면 visible state와 hidden fallback metadata가 서로 다른 시점으로 갈라질 수 있다.
