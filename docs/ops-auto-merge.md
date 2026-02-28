# Ops Auto-Merge Runbook

## 목적
- `/ops/auto-merge`에서 조건을 만족한 PR만 안전하게 squash merge 합니다.
- UI는 편의 기능이며 최종 판정/차단은 서버 액션 `mergePullRequestAction`이 수행합니다.

## 머지 흐름
1. Dev guard(local-only/same-origin/unlock/csrf) 검증
2. Kill switch(`AUTO_MERGE_ENABLED`) 검증
3. PR별 동시 실행 락 획득(`.data/locks/auto-merge-pr-{pr}.lock`)
4. PR 상태 검증(open, not draft, head SHA 일치)
5. 필수 라벨 검증(`AUTO_MERGE_REQUIRED_LABEL`)
6. 필수 체크 검증(`AUTO_MERGE_REQUIRED_CHECKS`, check-runs 우선/status fallback)
7. confirm 텍스트 정확 일치 검증
8. GitHub Merge API 호출(merge_method=`squash`)
9. 성공/실패 모두 audit log 기록

## 필요한 환경변수
- `GITHUB_TOKEN`
- `GITHUB_OWNER`
- `GITHUB_REPO`
- `AUTO_MERGE_ENABLED` (기본 `false`)
- `AUTO_MERGE_CONFIRM_TEMPLATE` (기본 `MERGE {PR} {SHA7}`)
- `AUTO_MERGE_POLICY_PATH` (기본 `.data/ops/auto-merge-policy.json`, 선택)

## Policy
- 파일 경로: `.data/ops/auto-merge-policy.json`
- 스키마(v1):
  - `version`
  - `enabled`
  - `mergeMethod` (`squash|merge|rebase`)
  - `requiredLabel`
  - `requiredChecks[]`
  - `minApprovals`
  - `requireClean`
  - `arm.defaultPollSeconds`
  - `arm.maxConcurrentPolls`
  - `updatedAt`, `updatedBy`
- 정책 저장은 `/ops/auto-merge/policy`에서 수행하며 local-only + same-origin + unlock + csrf를 강제합니다.
- 정책 변경은 audit event `AUTO_MERGE_POLICY_UPDATE`로 기록됩니다.

### Effective Policy
- `effective.enabled = (AUTO_MERGE_ENABLED === "true") && policy.enabled`
- env kill switch가 `false`면 policy에서 `enabled=true`여도 병합은 차단됩니다.
- `requiredLabel / requiredChecks / minApprovals / requireClean / mergeMethod`는 policy 값을 사용합니다.
- confirm 템플릿은 env `AUTO_MERGE_CONFIRM_TEMPLATE`를 사용합니다.
- ARM 기본 폴링/동시성은 policy `arm` 값을 기본으로 사용합니다.

## 사고 방지 장치
- Kill switch: `AUTO_MERGE_ENABLED !== "true"`면 즉시 차단
- 라벨 게이트: `policy.requiredLabel` 없으면 차단
- 승인 게이트: `policy.minApprovals` 이상 승인 필요 (사용자별 최신 리뷰 상태 기준)
- clean 게이트: `policy.requireClean=true`면 `mergeable_state=clean` 필수
- 동시 실행 락: 동일 PR 중복 요청 차단 (`MERGE_IN_PROGRESS`)
- 서버 재검증: UI 상태와 무관하게 서버에서 조건을 다시 검증

## 승인 게이트(min approvals)
- 리뷰 조회: `GET /repos/{owner}/{repo}/pulls/{prNumber}/reviews?per_page=100`
- 같은 리뷰어의 여러 리뷰는 모두 보되, **사용자별 최신 review state만** 반영합니다.
- 최신 state가 `APPROVED`인 사용자 수를 `approvalsCount`로 계산합니다.
- 최신 state가 `CHANGES_REQUESTED` 또는 `DISMISSED`면 승인으로 카운트하지 않습니다.
- `approvalsCount < AUTO_MERGE_MIN_APPROVALS`이면 `APPROVALS_MISSING`으로 거부됩니다.

## mergeable_state clean 강제
- `AUTO_MERGE_REQUIRE_CLEAN=true`일 때만 적용됩니다.
- PR `mergeable_state`가 `unknown`이면 500ms 간격으로 최대 3회 재조회합니다.
- 최종 state가 `clean`이 아니면 거부됩니다.
  - `dirty` -> `MERGE_CONFLICT`
  - `blocked` -> `BLOCKED`
  - `behind` -> `BEHIND`
  - `unknown` 지속 -> `UNKNOWN_MERGEABLE`
  - 그 외 -> `NOT_CLEAN`

## ARM 모드
- ARM은 `/ops/auto-merge` 페이지가 열려 있는 동안에만 동작합니다.
- ARM 상태는 `sessionStorage`에 탭 단위로 저장됩니다. (`ops:auto-merge:armed`)
  - 스키마: `{ version: 1, armed: { [prNumber]: { expectedHeadSha, confirmText, armedAt, lastCheckAt?, lastReasonCode? } } }`
- 페이지 로드 시 ARM 상태를 복원하고, PR 미존재/sha mismatch 항목은 자동 prune 됩니다.
- ARM이 켜진 PR만 eligibility API를 폴링합니다.
- 다중 ARM 시 동시 폴링 수는 policy `arm.maxConcurrentPolls` 기준으로 제한합니다.
- `eligible=true` + confirm 일치 시 자동으로 `mergePullRequestAction`을 호출합니다.
- 자동 실행도 동일하게 서버 액션에서 kill switch/라벨/체크/SHA/confirm/락을 모두 재검증합니다.
- 주요 reason code: `DISABLED`, `LABEL_MISSING`, `CHECKS_PENDING`, `CHECKS_FAIL`, `SHA_MISMATCH`, `DRAFT`, `NOT_OPEN`, `UNKNOWN`, `ELIGIBLE`

### ARM UX 규칙
- confirm 입력이 비어 있거나 expected confirm과 다르면 ARM 토글은 비활성화됩니다.
- ARM 상태에서 confirm 문자열이 expected와 달라지면 즉시 ARM 해제됩니다.
- PR head SHA가 바뀌면 해당 PR ARM은 자동 해제됩니다.
- 상단 배치 버튼:
  - `ARM all eligible`: 현재 eligible PR만 ARM 활성화
  - `Disarm all`: ARM 전체 해제
  - `Prune stale`: 목록 미존재/sha mismatch ARM 정리
  - `Refresh now`: 서버 데이터 즉시 새로고침

### 폴링/백오프 규칙
- 기본: policy `arm.defaultPollSeconds`
- `CHECKS_PENDING`: 10초
- `CHECKS_FAIL` / `LABEL_MISSING` / `DISABLED` / `DRAFT` / `NOT_OPEN` / `SHA_MISMATCH`: 60초
- 네트워크/500 오류: exponential backoff `15s -> 30s -> 60s -> ...` (최대 120초)
- 오류는 토스트(alert)로만 알리고, 고정 에러 배너는 유지하지 않습니다.

## Backup / Restore
- backup export/import/restore point whitelist에 `.data/ops/auto-merge-policy.json`이 포함됩니다.
- 따라서 백업 번들로 정책 파일을 함께 이동/복원할 수 있습니다.

## 운영 런북
### 기능 켜기/끄기
- 켜기: `AUTO_MERGE_ENABLED=true`
- 끄기: `AUTO_MERGE_ENABLED=false`

### 라벨 부여/회수
- 허용 대상 PR에 `AUTO_MERGE_REQUIRED_LABEL` 라벨 부여
- 즉시 차단하려면 라벨 제거

### 실패 원인별 조치
- `DISABLED`: kill switch 상태 확인 (`AUTO_MERGE_ENABLED`)
- `LABEL_MISSING`: PR 라벨 추가 여부 확인
- `IN_PROGRESS`: 동일 PR 동시 요청 종료 대기
- `CHECKS_FAIL`: 필수 체크 재실행/실패 원인 수정
- `APPROVALS_MISSING`: 필요한 승인 수 확보 후 재시도
- `MERGE_CONFLICT`: 충돌 해결 후 재시도
- `BLOCKED`: 브랜치 보호 규칙(필수 리뷰/체크) 해소
- `BEHIND`: base 브랜치 반영(merge/rebase) 후 재시도
- `UNKNOWN_MERGEABLE`: 잠시 대기 후 재시도
- `NOT_CLEAN`: mergeable_state 확인 후 차단 원인 해소
- `CONFIRM_MISMATCH`: expected confirm 문자열 재입력
- `SHA_MISMATCH`: 최신 head SHA 기준으로 다시 시도
- `DRAFT` / `NOT_OPEN`: PR 상태 변경 후 재시도
- `MERGE_API_FAIL`: GitHub API 응답 메시지 확인

### 락 파일이 남았을 때
- 락 경로: `.data/locks/auto-merge-pr-{prNumber}.lock`
- 서버는 lock mtime이 10분 초과면 stale로 간주하고 교체 시도
- 수동 정리 필요 시 stale lock 파일만 삭제하고 재시도
