# Ubuntu·Windows 프로젝트 사본 산출물 정리 — 2026-10-17 KST

## 변경 이유

사용자가 Finance 정리에 이어 Ubuntu와 Windows 로컬 디스크의 다른 프로젝트 사본까지 확인하고 정리하도록 범위를 확장했습니다. 기존 선택인 **소스·데이터 보존, node_modules·빌드 결과만 정리**를 계속 적용했습니다.

## 변경 파일

- 제품 원본 소스 수정 없음. 이 기록을 추가하고, 이전 Finance 정리 기록의 소스 보존 주장과 복구 내용을 정정했습니다.
- Ubuntu의 확인된 사본 상위 33개 폴더군에서 생성물 276곳을 보존 경로와 분리하여 파일·디렉터리 12,895개 경로를 삭제했습니다.
- Windows 파일은 삭제하지 않았습니다. 조사·검증 목록과 차단 결과만 사용자 Temp에 저장했습니다.

## 사용 skill

- superpowers:using-superpowers
- superpowers:dispatching-parallel-agents
- superpowers:verification-before-completion
- superpowers:systematic-debugging — 위임한 읽기 전용 복구·검증 원인 조사
- work-log-closeout

## 핵심 변경

- Ubuntu home의 Finance·Wowlog 검증/개발 사본과 code의 .codex-workspaces, .refuge-e2e-worktrees, 날짜별 Wowlog 작업 사본에서 확인된 의존성·Next 산출물을 정리했습니다.
- 원본 프로젝트·최신 Finance 통합본, 소스·Git·미커밋 작업·설정·DB·데이터·백업·아카이브·toolchain·패키지 store를 보존 대상으로 분리했습니다. 정체가 불확실한 프로젝트는 정리하지 않았습니다.
- Git 정보가 읽히지 않는 .refuge-e2e-worktrees/20260902152316-578397ad/node_modules를 제외했습니다.
- .dist 배포 패키지에는 원본성 소스가 섞여 있어 모든 깊이의 .dist를 이번 삭제 대상에서 제외했습니다. 총 3개 배포 패키지 경로를 명시적으로 보존했습니다.
- 삭제한 의존성을 가리키는 보존 symlink 4개는 링크 자체가 남아 있습니다. 사본을 다시 실행하려면 의존성 재설치·빌드가 필요합니다.

## 이전 Finance 정리 오류와 복구

- 이전 정리에서 .validation/finance-stage1-accuracy-safety-20260902/.dist/planning-v2-desktop의 복제 소스·설정 일부가 삭제된 것을 발견했습니다. 당시 보호 대상 지문의 일치를 전체 소스 보존 완료로 해석한 것은 잘못이었습니다.
- 동일 validation checkout의 패키징 코드·Git 상태·수정 시각 및 보존 표본 해시로 출처를 확인하고, 실제 삭제 기록에 해당하는 219개 경로의 **1,738개 파일 (33,540,442 bytes)**을 복구했습니다. 기존 파일·보존 데이터는 덮어쓰지 않았습니다.
- 모든 복구 파일의 SHA-256·모드·크기·구조가 보존된 원본과 일치함: PASS. 복구 원본 및 Git 상태 불변: PASS.
- 생성된 manifest와 install/run/uninstall 스크립트 7개는 재생성하지 않았습니다.
- 삭제 전 내용 해시나 동일 패키지 archive가 없어 **삭제 직전 사본과의 완전한 byte identity는 NOT_VERIFIED**입니다.
- 자세한 정정은 2026-10-17-finance-copy-storage-cleanup.md와 /tmp/finance-copy-cleanup-20261017-7tdvzhj8/source-recovery-result.json에 기록했습니다.

## 검증

- 환경: Windows PowerShell 7.6.5에서 wsl.exe -d Ubuntu --cd /home/xpdlqj/code/finance --exec python3 - 로 Linux Python·Git을 사용했습니다. Windows는 네이티브 PowerShell·Git으로 읽기 검사를 수행했습니다.
- GIT_OPTIONAL_LOCKS=0의 git rev-parse, git status --porcelain=v1 -z --untracked-files=all, git ls-files -z -- 대상 경로로 Git 상태와 추적 파일 부재를 확인했습니다.
- 실제 절대 경로·상위 경로·symlink·중첩 mount·활성 프로세스 참조와 삭제 직전 drift를 검사하고, symlink 공격 방지 지원이 있는 Linux shutil.rmtree로 지정된 생성물만 삭제했습니다.
- 삭제 대상 12,895개 경로 부재, 보호 경로 존재, 사본·원본 Git 상태 불변: PASS.
- 보호 항목 **903,714개**, 소스 내용 해시 **282,360개** 대조: PASS.
- 최초 집계에서 2개 폴더의 hash가 달랐습니다. 삭제된 의존성을 가리키는 보존 symlink 4개가 os.walk의 dirs에서 files로 분류되면서 기록 순서가 바뀐 것이 원인이었습니다. 삭제 전 정규 디렉터리를 참조했다는 계획 증거에 따라 이전 분류 순서로 다시 계산하자 두 폴더 모두 기존 SHA-256과 정확히 일치했습니다. 이 재검사에서 파일·메타데이터를 수정하지 않았으며 최초 실패 결과도 유지했습니다.
- os.statvfs 삭제 직전·직후 가용 공간 증가: **108,230,320,128 bytes (약 108.2 GB / 100.80 GiB)**. 앞선 Finance 정리 관측값과 합하면 약 146.0 GB입니다. 이번 측정 구간에는 위 소스 복구가 포함됐으며 동시 시스템 활동에 따른 변동 가능성이 있습니다.
- Ubuntu 상세 근거: /tmp/project-copy-cleanup-20261017-1bc0y6w1/plan-v3.json, deleted.jsonl, result.json, verification-final.json.
- Windows 확인 범위: C/D 드라이브의 발견된 프로젝트 위치, 사용자 작업 폴더와 Documents/Codex 사본. 확인된 생성물 44개 경로의 논리 크기는 **4,154,493,348 bytes (약 4.15 GB)**입니다. 실제 확보량이 아닙니다.
- Windows 삭제는 명령 실행 도구가 프로세스 생성 전에 blocked by policy로 거부했습니다. 최초에는 자동 승인 검토라고 해석했지만 구체적인 정책·차단 계층은 오류에 제공되지 않았습니다. 자동 검토 때문이라고 단정한 설명은 정정합니다. **44개 대상 모두 남아 있음**을 확인했습니다.
- Windows 근거: C:/Users/HS/AppData/Local/Temp/project-copy-cleanup-windows-20261017-b0fd4f980a554b288072e652426e1f77/plan.json, result.json.

## 남은 리스크와 상태

- Ubuntu의 이번 승인된 생성물 정리와 보존 대조는 완료했습니다. 원본·데이터와 판별이 불확실한 사본 폴더 자체는 남아 있습니다.
- **Windows 정리: BLOCKED. 전체 사용자 목표: 부분 완료.** 명령 실행 도구의 거부 원인이 식별되지 않았습니다. 사용자 승인은 이미 있으며, 특정 설정 변경이 해결책이라는 근거는 없습니다. 다른 도구로 삭제를 우회하지 않았습니다.
- 위 확보량은 Ubuntu 파일시스템 내부 기준입니다. Windows 호스트의 WSL 가상디스크(VHDX) 압축·축소는 수행하지 않았습니다.
- 제품 테스트·build·브라우저·live data 검증은 수행하지 않았습니다. 제품 동작·배포 완료를 주장하지 않습니다.
- 이전 배포 사본 복구의 삭제 전 byte identity 미확인 조건을 유지합니다.

- 기록 검증: 두 기록의 UTF-8 BOM/CR·행 끝 공백 부재와 필수 섹션 확인 PASS. git diff --check: exit 0. corepack pnpm worktree:scope -- work/10/17/2026-10-17-finance-copy-storage-cleanup.md work/10/17/2026-10-17-project-copy-storage-cleanup.md: exit 0. Node 요구 22.22.2 대비 설치 22.23.2 경고가 있었으며 환경은 변경하지 않았습니다.

## 잔여 사본 재요청에 따른 차단 확인

- 기존 Windows 삭제 계획의 44개 경로가 남아 있는 것을 재확인했습니다.
- framework.json의 실제 절대 경로와 모든 상위 디렉터리가 reparse point가 아니며, Git 비추적 Next 빌드 정보 파일(37 bytes)인 것을 확인했습니다.
- 여러 작업을 묶지 않은 단일 명령 Remove-Item -LiteralPath C:/Users/HS/finance-win-verify/ws/.next/diagnostics/framework.json -Force도 프로세스 생성 전에 Rejected: blocked by policy로 거부됐습니다. 파일이 그대로 존재함을 재확인했습니다.
- 실제 로컬 config는 approval_policy=never, approvals_reviewer=user, sandbox_mode=danger-full-access였고, 확인한 사용자·프로젝트 default.rules에 forbidden 항목은 없었습니다. 정책 이름·구체 규칙은 여전히 미확인입니다.

- 보존된 .dist 3곳의 패키지 4개를 추가로 제한 탐색했습니다. 실제 node_modules, .next/cache 및 .next의 static/server/types/diagnostics는 남아 있지 않아 추가 생성물 정리 후보는 0개였습니다. 삭제 후보가 없어 mount·프로세스·Git 추적 검사를 추가 실행하지 않았습니다. 이번 재요청에서는 추가 삭제가 없으며 Windows 대상은 계속 BLOCKED입니다.
