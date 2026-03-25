# 2026-03-22 N2 success-failure copy contract audit

## 변경 파일
- `analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md`
- `work/3/22/2026-03-22-n2-success-failure-copy-contract-audit.md`

## 사용 skill
- `planning-v3-batch-contract-narrowing`: same-id coexistence success/failure copy contract만 가장 작은 범위로 좁혀 문서 drift를 정리하는 데 사용.
- `planning-gate-selector`: docs-only 라운드로 분류해 `git diff --check`만 실행 검증으로 고정하는 데 사용.
- `work-log-closeout`: `/work` 종료 기록 형식으로 실제 수정 파일, 실행 검증, 남은 copy contract 리스크를 정리하는 데 사용.

## 변경 이유
- same-id coexistence `/account` success branch는 이미 열렸지만, success/failure copy가 무엇을 말하고 무엇을 숨겨야 하는지는 문서로 충분히 닫히지 않았다.
- 특히 zero-count verified success가 허용된 뒤에는 `updatedTransactionCount`를 visible binding 변화량처럼 읽지 않도록 user-facing contract를 더 명시할 필요가 있었다.

## 핵심 변경
- `analysis_docs/v2/13...`에 `same-id coexistence success/failure copy contract audit` 단락을 추가했다.
- current success body는 별도 success message 없이 `{ ok, batch, updatedTransactionCount }`만 유지하고, extra copy를 더해 `updatedTransactionCount`를 visible row change처럼 과장하지 않는다는 원칙을 문서에 못 박았다.
- zero-count verified success는 visible binding success와 양립 가능하며, `updatedTransactionCount === 0`은 legacy changed row count absence일 뿐이라는 점을 문서에 다시 명시했다.
- `secondary-failure`, `visible-verification-failed`는 둘 다 generic `INTERNAL` failure와 safe message만 user-facing으로 반환하고, operator repair payload나 rollback/verification detail은 internal boundary에만 남는다는 점을 정리했다.

## 검증
- 실행:
  - `git diff --check -- analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md analysis_docs/v2/11_post_phase3_vnext_backlog.md work/3/22/2026-03-22-n2-success-failure-copy-contract-audit.md`
- 미실행:
  - `pnpm test`
  - `pnpm build`
  - `pnpm lint`
  - `pnpm e2e:rc`

## 남은 리스크
- 이번 라운드는 docs-only라 current `/account` route copy를 실제로 바꾸지는 않았다.
- zero-count verified success와 generic `INTERNAL` failure가 현재는 모두 message-less success / generic failure 원칙에 기대고 있으므로, 더 세밀한 user-facing copy가 필요하면 후속 구현에서 route와 테스트를 함께 열어야 한다.
- operator evidence handoff는 여전히 internal contract로만 남아 있고, operator UI나 user-facing disclosure policy는 이번 라운드 비범위다.
