# 2026-03-10 SnapshotPicker Selection Model

## 변경 전
1. 수정 대상 파일: `src/app/planning/_lib/snapshotPickerModel.ts`, `src/app/planning/_components/SnapshotPicker.tsx`, `tests/planning/ui/snapshotPickerModel.test.ts`, `work/3/10/2026-03-10-snapshot-picker-selection-model.md`
2. 변경 이유: `SnapshotPicker` 안에 남아 있던 선택값 encode/decode, selected item 해석, details 버튼 문구를 helper로 분리해 렌더 테스트 밖에서도 직접 잠글 필요가 있었습니다.
3. 실행할 검증 명령: `pnpm test tests/planning/ui/snapshotPickerModel.test.ts tests/planning/ui/snapshotClipboard.test.ts tests/planning/components/snapshotPicker.test.tsx tests/planning/ui/workspaceSnapshotSelection.test.ts tests/planning-v2-api/assumptions-snapshots-route.test.ts`, `pnpm exec eslint src/app/planning/_lib/snapshotPickerModel.ts src/app/planning/_components/SnapshotPicker.tsx tests/planning/ui/snapshotPickerModel.test.ts`, `pnpm build`

## 변경 내용
1. `SnapshotPicker`의 선택값 문자열 변환과 selected snapshot 해석을 `snapshotPickerModel` helper로 분리했습니다.
2. details 버튼 라벨도 같은 helper에서 관리하도록 옮겨, 버튼 문구와 분기 기준을 한 곳에서 고정했습니다.
3. 새 unit test로 latest/history 선택값, invalid 값 무시, selected item 해석, details 라벨을 직접 검증합니다.

## 검증
1. [미실행] `pnpm test tests/planning/ui/snapshotPickerModel.test.ts tests/planning/ui/snapshotClipboard.test.ts tests/planning/components/snapshotPicker.test.tsx tests/planning/ui/workspaceSnapshotSelection.test.ts tests/planning-v2-api/assumptions-snapshots-route.test.ts`
2. [미실행] `pnpm exec eslint src/app/planning/_lib/snapshotPickerModel.ts src/app/planning/_components/SnapshotPicker.tsx tests/planning/ui/snapshotPickerModel.test.ts`
3. [미실행] `pnpm build`

## 남은 리스크와 엣지케이스
1. 이번 라운드는 DOM click 자체를 재현하지 못했고, `Details` 패널 열림 상태는 helper와 기존 초기 렌더 계약으로 간접 커버합니다.
2. 브라우저 clipboard permission 거부나 실제 button click flow는 jsdom 또는 e2e 기반 상호작용 테스트가 추가돼야 완전히 잠깁니다.

## 다음 작업
- 이 메모는 `/work` 구조 정렬 배치에서 `다음 작업` 섹션만 보강했습니다.
- 실제 후속 우선순위는 더 최신 closeout 기준으로 다시 판단합니다.

## 변경 파일
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 변경 파일 상세는 기존 본문 기준으로 확인합니다.

## 사용 skill
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 사용 skill 상세는 기존 본문 기준으로 확인합니다.

## 남은 리스크
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 실제 잔여 리스크는 더 최신 closeout 기준으로 다시 판단합니다.
