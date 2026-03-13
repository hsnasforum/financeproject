# 2026-03-10 SnapshotPicker Interaction Contract

## 변경 전
1. 수정 대상 파일: `tests/planning/components/snapshotPicker.interaction.test.tsx`, `work/3/10/2026-03-10-snapshot-picker-interaction-contract.md`
2. 변경 이유: `SnapshotPicker`의 초기 렌더 계약은 이미 잠겼지만, `Details` 토글과 `Copy snapshotId`의 성공/미지원/실패 경로는 아직 모두 직접 검증되지 않았습니다.
3. 실행할 검증 명령: `pnpm test tests/planning/components/snapshotPicker.interaction.test.tsx tests/planning/components/snapshotPicker.test.tsx tests/planning/ui/workspaceSnapshotSelection.test.ts tests/planning-v2-api/assumptions-snapshots-route.test.ts`, `pnpm exec eslint tests/planning/components/snapshotPicker.interaction.test.tsx`

## 변경 내용
1. React hook을 테스트 안에서 얇게 모사해 DOM 의존성 없이 `SnapshotPicker` 상호작용 경로를 검증하는 테스트를 추가했습니다.
2. `advancedEnabled=true`일 때 `Details` 버튼이 닫힌 상태에서 시작하고, 클릭 뒤 details 패널과 핵심 값이 열리는지 확인했습니다.
3. history 선택 상태에서 `Copy snapshotId`의 성공, 클립보드 미지원, `writeText` 실패 문구를 각각 확인했습니다.

## 검증
1. `pnpm test tests/planning/components/snapshotPicker.interaction.test.tsx tests/planning/components/snapshotPicker.test.tsx tests/planning/ui/workspaceSnapshotSelection.test.ts tests/planning-v2-api/assumptions-snapshots-route.test.ts` PASS
2. `pnpm exec eslint tests/planning/components/snapshotPicker.interaction.test.tsx` PASS

## 남은 리스크와 엣지케이스
1. DOM 렌더러를 쓰지 않기 때문에 실제 브라우저 접근성 속성 반영이나 focus 이동은 검증하지 않습니다.
2. `latest` 모드에서 비활성화된 copy 버튼의 클릭 차단은 현재 disabled 속성에 간접 의존하고 있어, 브라우저 레벨 이벤트 차단까지는 검증하지 않습니다.

## 다음 작업
- 이 메모는 `/work` 구조 정렬 배치에서 `다음 작업` 섹션만 보강했습니다.
- 실제 후속 우선순위는 더 최신 closeout 기준으로 다시 판단합니다.

## 변경 파일
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 변경 파일 상세는 기존 본문 기준으로 확인합니다.

## 사용 skill
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 사용 skill 상세는 기존 본문 기준으로 확인합니다.

## 남은 리스크
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 실제 잔여 리스크는 더 최신 closeout 기준으로 다시 판단합니다.
