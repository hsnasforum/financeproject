# 배치 삭제 무결성·추천 기록 되돌리기

## 작업 전 정리

- 수정 대상: Planning v3 배치/override 저장소와 DELETE facade, 추천 기록·최근 결과 화면, 관련 저장 계약 테스트와 v3 경계 ADR.
- 변경 이유: 배치를 삭제해도 override sidecar가 남아 재가져오기 때 과거 수정값이 부활하고, 추천 기록 삭제는 오클릭 뒤 복구할 수 없던 문제를 해소한다.
- 계획 검증: v3 batch/override 및 추천 저장소 focused Vitest, 변경 파일 ESLint, TypeScript, diff-check. 전체 build/e2e는 마지막 통합 라운드에서 실행한다.

## 무엇이 바뀌었는지

- 배치 DELETE가 metadata·transaction NDJSON과 같은 사용자 namespace의 category/account/transfer override sidecar를 함께 정리한다.
- sidecar와 batch를 삭제하기 전에 세 sidecar를 검증·스냅샷하고, 중간 실패 시 남아 있는 batch의 override를 병합 복원한다.
- transaction unlink 실패와 index 갱신 실패를 숨기지 않으며, index/NDJSON 불일치가 생기지 않도록 기존 파일을 복구한다.
- namespace 모드에서는 runtime-shared legacy 동일 ID가 사용자 canonical 배치 삭제를 막지 않고, 다른 사용자 sidecar·legacy 파일·profile draft는 보존한다.
- 추천 저장 기록의 개별/전체 삭제와 최근 추천 결과 삭제에 현재 owner 범위의 1회 되돌리기, 구체적 접근성 이름과 polite live status를 추가했다.

## 검증 방법 및 결과

- `corepack pnpm exec vitest run tests/planning-v3-batches-api.test.ts tests/planning-v3-transactions-batches-user-scope.test.ts tests/planning-v3-batchesStore-importCsvToBatch.test.ts tests/planning-v3-txnOverridesStore.test.ts tests/recommend-history-undo.test.tsx tests/saved-runs-store.test.ts tests/recommend-storage-adapter.test.ts`
  - 7개 파일, 62개 테스트 PASS.
- `corepack pnpm exec tsc --noEmit --incremental false`
  - PASS.
- 변경 파일 대상 `corepack pnpm exec eslint ...`
  - PASS.
- 변경 파일 대상 `git diff --check -- ...`
  - PASS.

## 남은 리스크와 엣지케이스

- sidecar 3종과 batch store는 각각 기존 write lock을 사용한다. 실패 복원은 제공하지만, 동일 batch에 대한 override 갱신과 삭제가 정확히 동시에 실행되는 다중 저장소 경쟁은 공통 lifecycle lock이나 DB transaction 없이 완전 직렬화되지 않는다.
- 추천 기록 되돌리기는 현재 화면 세션의 가장 최근 삭제 1회만 유지하며 새 삭제가 이전 복구 지점을 대체한다.
- 브라우저를 새로고침하거나 닫으면 추천 삭제 복구 지점은 사라진다. 서버 휴지통이나 새 localStorage key는 이번 범위에 추가하지 않았다.

## 사용 skill

- `planning-v3-batch-contract-narrowing`: stored-first owner, legacy fallback, synthetic batch와 사용자 삭제 경계를 보존했다.
- `planning-gate-selector`: 저장/API/UI 변경의 focused 및 최종 검증 세트를 선택했다.
- `route-ssot-check`: 추천 화면의 기존 공개 경로와 링크를 실제 route SSOT에 대조했다.
- `work-log-closeout`: 변경·검증·잔여 위험을 이 문서 형식으로 기록했다.
