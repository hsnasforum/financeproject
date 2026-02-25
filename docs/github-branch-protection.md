# GitHub Branch Protection (A5 = A)

CI `verify` 통과를 기본 브랜치 병합의 필수 조건으로 설정하는 체크리스트입니다.

1. 기본 브랜치명을 먼저 확인
2. 확인 방법: `Code` 탭 브랜치 드롭다운 또는 `Settings` -> `Branches` -> `Default branch`
3. `Settings` -> `Branches` -> `Branch protection rules` -> `Add rule` 이동
4. `Branch name pattern`에 확인한 기본 브랜치명 입력
5. `Require status checks to pass before merging` 체크
6. Status checks 목록에서 `verify` 관련 체크(또는 CI workflow job 이름) 선택
7. `Require branches to be up to date before merging` 체크(권장)
8. 필요 시 `Require a pull request before merging` 체크
9. `Save changes`

참고:

- Status check 목록은 Actions가 최소 1회 실행된 후 표시됩니다.
- 권장 최소 정책은 \"CI verify 필수 통과\"입니다.
