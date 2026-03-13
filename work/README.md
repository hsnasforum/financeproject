# /work 정책

`/work`는 라운드 종료 기록을 남기는 tracked closeout 디렉터리입니다.

## tracked 대상
- `work/<month>/<day>/YYYY-MM-DD-<slug>.md` 형식의 closeout 메모
- 이 파일처럼 디렉터리 운영 규칙을 설명하는 기준 문서

## 작성 원칙
- 작업 시작 시에는 먼저 `work/<현재월>/<현재일>/` 아래 md 파일 중 가장 최근 문서를 확인합니다.
- 오늘 문서가 없으면 전날 날짜 폴더의 `/work` 문서 중 최신 파일을 확인하고 이어받습니다.
- 종료 기록을 저장할 때는 `work/<현재월>/<현재일>/` 폴더가 없으면 먼저 생성합니다.
- 한 라운드가 끝날 때 실제 변경, 실제 검증, 남은 리스크, 다음 우선순위를 한 파일에 정리합니다.
- 새 closeout에는 `## 사용 skill` 섹션을 항상 두고, 실제 사용한 skill이 없으면 `- 없음`으로 적습니다.
- 후속 라운드는 이전 메모를 읽고 이어받되, 새 사실이 생기면 같은 날이라도 새 slug로 별도 파일을 추가합니다.
- 파일명은 `YYYY-MM-DD-<slug>.md` 형식을 유지해 연도와 작업 주제를 함께 식별합니다.
- 실행하지 않은 명령이나 검증 결과를 추측으로 적지 않습니다.

## tracked 하지 않는 대상
- 임시 스크립트, scratch 메모, 로그, one-off 출력
- 이런 파일은 `tmp/` 또는 `work/local/` 아래에 두고 commit 대상에서 제외합니다.

## 권장 예시
- tracked closeout: `work/3/12/2026-03-12-multi-agent-guard-adoption-and-build-docs.md`
- local scratch: `work/local/<topic>.md`, `work/local/<topic>.log`

## 레거시 메모
- flat 경로(`work/YYYY-MM-DD-<slug>.md`) closeout은 더 이상 허용하지 않습니다. 남아 있으면 month/day 폴더로 이동한 뒤 링크도 함께 갱신합니다.
- `pnpm multi-agent:guard`는 최신 closeout 경로와 핵심 섹션을 함께 확인합니다.
