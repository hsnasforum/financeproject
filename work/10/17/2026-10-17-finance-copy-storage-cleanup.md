# Finance 사본 설치·빌드 산출물 정리 — 2026-10-17 KST

> 후속 검토에서 배포 패키지의 복제 소스가 삭제 대상에 포함된 오류를 확인하고 복구했습니다. 아래 정정과 검증 한계를 함께 읽어야 합니다.

## 변경 이유

사용자가 저장공간 확보를 위한 프로젝트 사본 정리를 요청했고, 조사 후 **소스·데이터를 보존하면서 node_modules·빌드 결과만 정리**하는 범위를 명시적으로 선택했습니다.

## 변경 파일

- 원본 제품 소스는 변경하지 않았습니다. 배포 사본의 복제 소스가 일부 잘못 삭제되어 아래 정정에 따라 복구했습니다. 이 종료 기록을 원본 저장소에 추가했습니다.
- `/home/xpdlqj/code/finance-clean-candidate-20261012`, `/home/xpdlqj/code/finance-candidate-baseline-20261015`, `.worktrees/finance-*` 8곳, `.validation/finance-*` 2곳의 확인된 생성물만 정리했습니다.
- 원본 `/home/xpdlqj/code/finance`, 최신 `/home/xpdlqj/code/finance-integration-20261015`, `.claude/worktrees`, 다른 프로젝트는 보존했습니다.

## 사용 skill

- `superpowers:using-superpowers`
- `superpowers:dispatching-parallel-agents`
- `superpowers:verification-before-completion`
- `work-log-closeout`

## 핵심 변경

- 상위 생성물 후보 48곳: `node_modules` 19곳, `.next` 28곳, `.dist` 1곳.
- 빌드 안의 `.data` 28개 서브트리, standalone 소스·데이터·작업 기록 및 심볼릭 링크 등을 원래 위치에 보존했습니다. 삭제 대상은 보호 경로를 제외한 파일·디렉터리 5,310개로 한정했습니다.
- 원본 소스·Git 이력·미커밋 변경·DB·toolchain·corepack 캐시·pnpm store는 유지했습니다. 배포 사본의 복제 소스·설정 일부는 삭제되었으며 아래 정정에 따라 복구했습니다.
- Git branch/worktree 등록, 원격, 배포, 설치본, 실제 DB 상태는 변경하지 않았습니다.

## 검증

- 실행 환경: Windows PowerShell에서 `wsl.exe -d Ubuntu --cd /home/xpdlqj/code/finance --exec python3 -`로 Linux Python/Git/du를 사용했습니다.
- `GIT_OPTIONAL_LOCKS=0 git status --porcelain=v1 -z --untracked-files=all`, `git rev-parse --show-toplevel HEAD`, `git ls-files -z -- <생성물 경로>`로 변경 상태와 추적 파일 부재를 확인했습니다.
- 삭제 직전 실제 절대 경로·symlink·중첩 mount·열린 프로세스 참조·경로 drift를 검사했습니다. Python의 symlink 공격 방지 rmtree 지원을 확인하고 승인된 생성물 경로만 삭제했습니다.
- 삭제 대상 5,310개 존재하지 않음: PASS.
- 보호 파일·디렉터리 281,731개 메타데이터 지문 일치: PASS. 내용 해시 검사는 수행하지 않았으며 secret/DB 내용을 읽거나 복사하지 않았습니다.
- 사본 및 원본·최신 통합본 Git 상태 동일: PASS(이 종료 기록을 추가하기 전).
- 보호 대상 406개 경로 유지: PASS.
- `du -scx --block-size=1 -- <대상 사본들>`: 47,266,361,344 → 7,986,819,072 bytes. 대상 폴더 할당량 39,279,542,272 bytes 감소.
- `os.statvfs` 삭제 직전·직후 WSL 가용 공간 변화: **+37,769,846,784 bytes (약 37.8 GB / 35.18 GiB)**. 동시 시스템 활동에 따른 변동 가능성이 있는 관측값입니다.
- hardlink 공유 때문에 생성물 할당량 합계와 실제 파일시스템 확보량을 구분했습니다.
- 삭제·검증 상세 임시 기록: `/tmp/finance-copy-cleanup-20261017-7tdvzhj8/result.json` 및 같은 폴더의 `plan.json`, `deleted.jsonl`.

- `corepack pnpm worktree:scope -- work/10/17/2026-10-17-finance-copy-storage-cleanup.md`: exit 0. 이번 기록 1개와 기존 범위 밖 파일 변경 7개를 구분했습니다.
- `git diff --check`: exit 0. 신규 미추적 기록의 `git diff --no-index --check /dev/null <기록>`은 exit 1, 출력 없음(신규 파일 차이). 별도 Python 검사로 기록의 UTF-8 BOM/CR·행 끝 공백 부재와 필수 섹션을 확인했습니다.

## 남은 리스크

- 보존한 사본에서 다시 개발·실행하려면 의존성 설치와 빌드가 필요합니다. 현재 원본과 최신 통합본의 실행 산출물은 정리하지 않았습니다.
- `worktree:scope`는 성공했으나 Node 요구 버전 22.22.2와 설치 버전 22.23.2의 engine 경고가 있었습니다. pnpm은 9.15.9였고 환경·의존성은 변경하지 않았습니다.
- 제품 소스 변경이 없어 제품 테스트·build·브라우저 검증은 실행하지 않았습니다. 제품 동작 정상이나 배포 완료를 주장하지 않습니다.
- Windows 호스트의 WSL VHDX 축소·압축은 수행하지 않았습니다. 위 확보량은 WSL 파일시스템 내부의 여유 공간입니다.
- 일부 사본·빌드 폴더는 소스·데이터 보존 때문에 남아 있습니다.

## 후속 검토 정정 및 복구

- 다른 프로젝트 사본까지 정리 범위를 확장하며 이전 삭제 계획과 실제 영수증을 재검토했습니다. `.validation/finance-stage1-accuracy-safety-20260902/.dist/planning-v2-desktop`의 배포 패키지 루트에서 복제 소스·설정·생성 스크립트 226개 경로가 삭제된 사실을 확인했습니다. 당초 보호 목록에 들어 있던 standalone 소스만 보존됐으므로, 앞선 보호 지문 PASS를 모든 소스 보존으로 해석한 것은 잘못입니다.
- 패키저 `scripts/planning_v2_desktop_build.mjs`의 직접 복사 흐름, 동일 validation checkout의 깨끗한 해당 소스 Git 상태, 원본·패키지 수정 시각 및 잔존 파일 표본 해시를 확인했습니다. 원본 checkout HEAD는 `421e4e324268517aea3d6f1e428301ba87e1a1c1`입니다.
- 삭제된 경로 중 원본과 직접 대응하는 219개 경로, 1,738개 파일, 33,540,442 bytes를 같은 checkout에서 복구했습니다. 기존 파일이나 보존 데이터는 덮어쓰지 않았습니다.
- Python `shutil.copytree(..., symlinks=True)`/`copy2`로 실제 삭제 영수증에 있는 원본성 경로만 복구했고, 전체 복구 파일의 SHA-256·모드·크기·구조가 원본과 일치함을 확인했습니다. 원본 내용 및 Git 상태 유지: PASS.
- 생성물 7개(`desktop-manifest.json`, install/run/uninstall의 sh/cmd)는 복구하거나 재생성하지 않았습니다. 패키저·빌드·실행은 수행하지 않았습니다.
- 삭제 전 전체 파일 내용 해시가 없고 동일 패키지 archive를 찾지 못해, 복구본과 삭제 직전 사본의 완전한 byte identity는 `NOT_VERIFIED`입니다. 원본과 복구본의 일치 검증과 구분합니다.
- 복구 상세 근거: `/tmp/finance-copy-cleanup-20261017-7tdvzhj8/source-recovery.jsonl`, `source-recovery-result.json`.
