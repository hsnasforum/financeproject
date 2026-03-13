# 2026-03-10 SnapshotPicker Render Contract

## 변경 전
1. 수정 대상 파일: `tests/planning/components/snapshotPicker.test.tsx`, `work/3/10/2026-03-10-snapshot-picker-render-contract.md`
2. 변경 이유: `SnapshotPicker`의 `latest 없음`, stale 상태, warning chip, 동기화 안내 문구가 helper/API 테스트만으로는 직접 잠기지 않아 회귀 여지가 있었습니다.
3. 실행할 검증 명령: `pnpm test tests/planning/components/snapshotPicker.test.tsx tests/planning/ui/workspaceSnapshotSelection.test.ts tests/planning-v2-api/assumptions-snapshots-route.test.ts`, `pnpm exec eslint tests/planning/components/snapshotPicker.test.tsx`

## 변경 내용
1. `SnapshotPicker` 초기 렌더 계약을 서버 렌더 문자열 기준으로 검증하는 테스트를 추가했습니다.
2. `latest 없음 + stale risk + warningsCount > 0 + advancedEnabled` 조합에서 안내 문구, 링크, 배지, 닫힌 details 패널 상태를 함께 고정했습니다.
3. fresh latest 렌더에서 `Fresh` 배지와 최신 스냅샷 라벨 노출, 동기화 안내 비노출도 함께 확인했습니다.

## 검증
1. `pnpm test tests/planning/components/snapshotPicker.test.tsx tests/planning/ui/workspaceSnapshotSelection.test.ts tests/planning-v2-api/assumptions-snapshots-route.test.ts` PASS
2. `pnpm exec eslint tests/planning/components/snapshotPicker.test.tsx` PASS

## 남은 리스크와 엣지케이스
1. 이번 테스트는 초기 렌더 계약만 다룹니다. `Details` 열기 상호작용과 `Copy snapshotId` 클립보드 경로는 아직 별도 상호작용 테스트가 없습니다.
2. latest/history 라벨 포맷의 전체 문자열보다는 핵심 조각만 잠갔기 때문에, 포맷 순서 자체를 바꾸는 회귀는 helper 테스트가 따로 필요할 수 있습니다.

## 다음 작업
- 이 메모는 `/work` 구조 정렬 배치에서 `다음 작업` 섹션만 보강했습니다.
- 실제 후속 우선순위는 더 최신 closeout 기준으로 다시 판단합니다.

## 변경 파일
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 변경 파일 상세는 기존 본문 기준으로 확인합니다.

## 사용 skill
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 사용 skill 상세는 기존 본문 기준으로 확인합니다.

## 남은 리스크
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 실제 잔여 리스크는 더 최신 closeout 기준으로 다시 판단합니다.
