# 2026-03-10 SnapshotPicker Copy Helper

## 변경 전
1. 수정 대상 파일: `src/app/planning/_components/SnapshotPicker.tsx`, `src/app/planning/_lib/snapshotClipboard.ts`, `tests/planning/ui/snapshotClipboard.test.ts`, `work/3/10/2026-03-10-snapshot-picker-copy-helper.md`
2. 변경 이유: 저장소에 DOM 상호작용 테스트 환경이 없어 `Copy snapshotId` 경로를 그대로 클릭 테스트하기보다, 동일한 사용자 문구를 반환하는 순수 helper로 분리해 회귀를 먼저 막는 편이 더 작고 안전했습니다.
3. 실행할 검증 명령: `pnpm test tests/planning/ui/snapshotClipboard.test.ts tests/planning/components/snapshotPicker.test.tsx tests/planning/ui/workspaceSnapshotSelection.test.ts`, `pnpm exec eslint src/app/planning/_components/SnapshotPicker.tsx src/app/planning/_lib/snapshotClipboard.ts tests/planning/ui/snapshotClipboard.test.ts`

## 변경 내용
1. `copySnapshotIdToClipboard` helper를 추가해 latest 무시, clipboard 미지원, 복사 성공, 복사 실패 분기를 한 곳에서 처리하게 했습니다.
2. `SnapshotPicker`는 기존 문구를 유지한 채 helper 결과만 받아 `copyMessage`와 `copyError` 상태를 갱신하도록 바꿨습니다.
3. 새 단위 테스트에서 `navigator.clipboard.writeText` 대신 mock writer를 주입해 clipboard 경로를 DOM 없이 직접 검증했습니다.

## 검증
1. `pnpm test tests/planning/ui/snapshotClipboard.test.ts tests/planning/components/snapshotPicker.test.tsx tests/planning/ui/workspaceSnapshotSelection.test.ts` PASS
2. `pnpm exec eslint src/app/planning/_components/SnapshotPicker.tsx src/app/planning/_lib/snapshotClipboard.ts tests/planning/ui/snapshotClipboard.test.ts` PASS

## 남은 리스크와 엣지케이스
1. 이번 라운드는 clipboard 결과 분기만 잠갔습니다. 실제 버튼 클릭으로 메시지가 보이는지, `Details` 토글이 열리고 닫히는지는 여전히 DOM 상호작용 테스트 인프라가 생기면 추가 확인이 필요합니다.
2. `SnapshotPicker`와 `PlanningWorkspaceClient`가 각각 별도 copy 경로를 유지하고 있어, 장기적으로는 공통 clipboard helper 통합 여부를 다시 볼 수 있습니다.

## 다음 작업
- 이 메모는 `/work` 구조 정렬 배치에서 `다음 작업` 섹션만 보강했습니다.
- 실제 후속 우선순위는 더 최신 closeout 기준으로 다시 판단합니다.

## 변경 파일
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 변경 파일 상세는 기존 본문 기준으로 확인합니다.

## 사용 skill
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 사용 skill 상세는 기존 본문 기준으로 확인합니다.

## 남은 리스크
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 실제 잔여 리스크는 더 최신 closeout 기준으로 다시 판단합니다.
