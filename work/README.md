# /work 정책

`/work`는 사용자에게 전달하는 마일스톤의 종료 기록입니다. 로컬 내용 검증과 승인된 Git 게시를 구분합니다.

## tracked 대상
- `work/<month>/<day>/YYYY-MM-DD-<slug>.md` 형식의 closeout 메모
- 이 파일처럼 디렉터리 운영 규칙을 설명하는 기준 문서

## 작성 원칙
- 작업 시작 시에는 먼저 `work/<현재월>/<현재일>/` 아래 md 파일 중 가장 최근 문서를 확인합니다.
- 현재 목표와 관련 소스부터 확인하고, 이전 작업을 잇는 경우에만 최신 관련 `/work` 기록을 대조합니다.
- 종료 기록을 저장할 때는 `work/<현재월>/<현재일>/` 폴더가 없으면 먼저 생성합니다.
- 한 라운드가 끝날 때 실제 변경, 실제 검증, 남은 리스크, 다음 우선순위를 한 파일에 정리합니다.
- `multi-agent:guard`는 실제 추적 상태를 보고합니다. 새 기록의 내용·경로·섹션은 별도로 확인하고, guard 때문에 임의로 stage·commit하지 않습니다.
- 새 closeout에는 `## 사용 skill` 섹션을 항상 두고, 실제 사용한 skill이 없으면 `- 없음`으로 적습니다.
- 후속 라운드는 이전 메모를 읽고 이어받되, 새 사실이 생기면 같은 날이라도 새 slug로 별도 파일을 추가합니다.
- 파일명은 `YYYY-MM-DD-<slug>.md` 형식을 유지해 연도와 작업 주제를 함께 식별합니다.
- 실행하지 않은 명령이나 검증 결과를 추측으로 적지 않습니다.
- worktree에 unrelated 변경이 남아 있으면 `pnpm worktree:scope -- <paths...>`로 이번 라운드 범위와 범위 밖 변경을 먼저 분리해 확인합니다.

## tracked 하지 않는 대상
- 임시 스크립트, scratch 메모, 로그, one-off 출력
- 이런 파일은 `tmp/` 또는 `work/local/` 아래에 두고 commit 대상에서 제외합니다.

## 권장 예시
- tracked closeout: `work/3/12/2026-03-12-multi-agent-guard-adoption-and-build-docs.md`
- local scratch: `work/local/<topic>.md`, `work/local/<topic>.log`

## 레거시 메모
- flat 경로(`work/YYYY-MM-DD-<slug>.md`) closeout은 더 이상 허용하지 않습니다. 남아 있으면 month/day 폴더로 이동한 뒤 링크도 함께 갱신합니다.
- `pnpm multi-agent:guard`는 최신 closeout 경로와 핵심 섹션을 함께 확인합니다.
- 최신 closeout이 아직 untracked여도 guard는 그 파일을 `latestWorkNote`로 보고 경로/섹션을 검증하며, 출력에 `latestWorkNoteTracking=tracked|untracked`를 같이 남깁니다.

## 제품 우선 기록 단위

- 사용자에게 전달하는 완료/차단 마일스톤마다 기록 하나를 남깁니다. 작은 수정·재시도·내부 인계마다 새 일지를 만들지 않습니다.
- 새 closeout을 guard에 맞추기 위해 임의로 git add·commit하지 않습니다. 기록의 내용 유효성과 Git 포함/원격 재현성은 별도 상태입니다.
- 기존 기록은 보존하며 과거 PASS를 현재 소스의 결과로 고쳐 쓰지 않습니다.
