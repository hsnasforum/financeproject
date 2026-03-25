# 2026-03-23 N2 hybrid retained fileName compat bridge retirement-proof audit

## 변경 파일
- `analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md`
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `work/3/23/2026-03-23-n2-hybrid-retained-fileName-compat-bridge-retirement-proof-audit.md`

## 사용 skill
- `planning-v3-batch-contract-narrowing`: batch detail/helper contract 안에서 hybrid retained blank provenance `fileName` bridge의 retirement-proof 경계만 좁게 문서화하는 데 사용했다.
- `planning-gate-selector`: docs-only audit 라운드로 분류해 지정된 `git diff --check -- ...`만 실행 검증으로 선택하고 `pnpm` gates는 미실행 검증으로 남기는 데 사용했다.
- `work-log-closeout`: 실제 수정 문서, 실행 검증, 남은 subset/evidence 리스크를 표준 `/work` 형식으로 정리하는 데 사용했다.

## 변경 이유
- blank stored provenance subcase proof는 이미 테스트로 닫혔지만, `hybrid-legacy-summary-retained`에서 이 helper-owned `fileName` bridge를 앞으로 어떤 historical subset까지 정상 compat debt로 볼지는 아직 문서로 좁혀져 있지 않았다.
- 이번 라운드는 provenance backfill이나 fallback 제거가 아니라, visible compat subset과 no-visible-bridge subset을 분리하는 retirement-proof contract audit이 목표였다.

## 핵심 변경
- `analysis_docs/v2/13...`에 hybrid retained `fileName` bridge retirement-proof memo를 추가해 current subset map을 `stored provenance present`, `blank stored provenance + legacy fileName present`, `blank stored provenance + legacy fileName blank`로 분리했다.
- 같은 문서에 current runtime evidence boundary를 추가해, today 구분 가능한 것은 stored/legacy `fileName` blank 여부뿐이고 provenance origin 자체를 가르는 explicit stored marker는 없다고 고정했다.
- 유지 가능한 compat subset 후보는 `blank stored provenance + legacyBatch.fileName present`로, retirement candidate subset 후보는 `blank stored provenance + legacyBatch.fileName blank`로 남겼다.
- next cut recommendation은 provenance-only backfill보다 먼저 helper/test 수준에서 `visible fileName bridge subset` predicate를 `stored provenance.fileName blank + legacyBatch.fileName present`로 더 좁히는 것이라고 적었다.
- `analysis_docs/v2/11...`에는 다음 `N2` cut이 backfill 구현이 아니라 visible compat subset과 no-visible-bridge subset을 가르는 retirement-proof audit이라는 메모만 2줄 추가했다.

## 검증
- `git diff --check -- analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md analysis_docs/v2/11_post_phase3_vnext_backlog.md work/3/23/2026-03-23-n2-hybrid-retained-fileName-compat-bridge-retirement-proof-audit.md`
  - PASS
- 미실행 검증:
- `pnpm test`
- `pnpm build`
- `pnpm lint`
- `pnpm e2e:rc`

## 남은 리스크
- current runtime은 blank stored provenance의 origin이 정상 optional-input omission인지, historical route/input handoff gap인지, later migration strip인지 구분하지 못한다. [미확인]
- `blank stored provenance + legacyBatch.fileName blank` subset은 visible output 기준 retirement candidate로 좁힐 수 있지만, helper internal 분류를 실제로 tightening하려면 blank/blank fixture proof가 아직 더 필요하다. [검증 필요]
- metadata-only provenance backfill과 broad fallback 제거는 여전히 migration 완료 사실이나 trusted provenance source proof 없이 열 수 없다.
