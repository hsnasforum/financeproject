# 2026-10-06 Finance 목표 보존 수정 독립 검토 설치본

## 변경 파일

- `FINANCE_ACTIVE_GOAL.md`: 새 검토본 경로와 실제 검증 범위, 이전 완료 기록 보존.
- 이 기록. 제품 코드·테스트·의존성·lockfile은 이번 라운드에서 수정하지 않았다.
- 저장소 밖 `/home/xpdlqj/finance-recovery/desktop-goal-review-20261006`: `artifact/`, `installed/`, 독립 `.env.local`, `start-review.sh`, `start-review.cmd`, `open-windows-browser.sh`, `검토본-안내.md`, 격리 검사 도구·데이터·근거.

## 사용 skill

- finance-skill-routing: 앞선 목표 보존 작업의 최소 스킬 선택을 이어받음.
- planning-gate-selector: build 재사용과 새 설치본 수용 동선 검사를 구분.
- playwright: 새 설치본에 연결한 실제 브라우저 저장·재열기 검증.
- work-log-closeout: 이번 설치·전달을 한 기록으로 정리.

## 변경 이유

사용자가 목표 보존 수정이 들어간 새 독립 설치본과 두 저장·재열기 흐름의 실검증을 요청했다. 이전 설치본·실제 데이터·기존 미커밋 변경을 보존하고 지원되는 WSL/Linux production 패키지 경계를 사용했다.

## 핵심 변경

- 현재 nonignored build 입력 1,829파일과 직전 자체 포함 build 사본의 SHA-256 일치를 확인하고 `--no-next-build`로 재사용했다. 별도 테스트·설정 9파일도 일치한다. ignored source-only 18파일(생성 provider assets와 dev coverage route)은 이전 검증 사본에 없으며 재사용 증거에서 제외 파일로 명시했다.
- 새 artifact·설치·Planning root·SQLite 경로를 사용했다. 새 `.env.local`을 설치 전에 준비하고 공식 installer의 DB 준비 경계를 유지했다. 원래 설치본이나 사용자 설정·DB를 복사하지 않았다.
- 새 설치본의 production E2E, 세션 bootstrap, 목표 1개 리포트 재열기, 마지막 목표 삭제 후 빈 목록 저장·재열기와 재시작을 확인했다. 과거 리포트는 당시 목표 1개를 보존하고 저장 파일 11개는 재시작·조회 전후 byte가 일치했다.
- 사용자 실행과 합성 검사 데이터는 분리했다. Windows용 시작 명령도 Ubuntu의 공식 runtime verify/launcher를 호출한다. BROWSER 연결은 해당 실행에만 적용하며 전역 설정은 바꾸지 않는다.
- Sol Max 하위 작업에 설치 계약 조사와 최종 정적 검토를 맡겼고 메인은 패키지·설치·서버·브라우저·통합 검증을 소유했다. 병렬 파일 수정은 없었다.

## 검증

- WSL Ubuntu, Linux Git, Node 22.23.2, Corepack pnpm 9.15.9. 프로젝트 engines의 Node 22.22.2 경고를 숨기지 않았다. 설치 manifest는 linux/x64, Node ABI 127이다.
- 이전 라운드 `corepack pnpm build` 성공 및 Vitest 6files/54tests, 수정 TS/TSX 5파일 lint, dev E2E 3개 결과는 관련 입력 일치를 확인해 재사용했다. 이번 새 실행 결과로 표시하지 않는다.
- 검증 사본에서 `corepack pnpm planning:v2:desktop:build -- --no-next-build --artifact-dir=/home/xpdlqj/finance-recovery/desktop-goal-review-20261006/artifact`: PASS. manifest 기반 SHA 조회에는 원본 Git을 읽기 전용으로 참조했다. SHA는 기반 commit이지 미커밋 작업 전체의 식별자가 아니다.
- 새 artifact에서 `node scripts/planning_v2_desktop_verify.mjs --mode=pristine-install`: PASS.
- `node scripts/planning_v2_desktop_install.mjs --self-contained-source --from=/home/xpdlqj/finance-recovery/desktop-goal-review-20261006/artifact --to=/home/xpdlqj/finance-recovery/desktop-goal-review-20261006/installed --skip-install --skip-shortcuts`: PASS, 40,952파일 검증. `--skip-install`은 패키지 다운로드만 생략하며 공식 Prisma safe script로 새 SQLite를 준비했다.
- 설치본에서 `node scripts/planning_v2_desktop_verify.mjs --mode=runtime`: PASS.
- `node scripts/planning_v2_desktop_smoke.mjs --app-dir=/home/xpdlqj/finance-recovery/desktop-goal-review-20261006/installed --port=3384 --timeout-ms=90000`: PASS. 인증·저장·production-hidden 경계 포함.
- `python3 /home/xpdlqj/finance-recovery/desktop-goal-review-20261006/check-installed-journey.py`: PASS. 설치본 공식 launcher를 3386에서 실행하고 세션 broker의 one-shot bootstrap을 소비했다. 별도 합성 가정·DB·Planning root를 사용했다.
- 설치본 연결 `E2E_EXTERNAL_BASE_URL=http://127.0.0.1:3386 corepack pnpm e2e:pw tests/e2e/planning-quickstart-preview.spec.ts --runtime=production --grep 'previews before' --workers=1 --retries=0 --output=<새 evidence/browser-results>`: 1 PASS, 13.0초. 대시보드부터 실제 UI로 진행했다.
- 재시작 후 `node <새 검토본>/check-restart-browser.cjs`: PASS. 빈 목표 UI와 기존 저장 리포트 목표 1개 확인. 첫 리포트 screenshot이 hydration loading 중이어서 visible 조건을 보강한 뒤 재열기만 반복했고, 완전히 렌더링된 screenshot을 열어 확인했다. 제품 테스트 assertion은 완화하지 않았다.
- 설치 symlink 6개는 모두 설치 내부를 가리켰다. standalone 기준 `next`, `@prisma/client`, `better-sqlite3` 모듈이 설치 내부에서 해석됐다.
- 사용자용 `bash <새 검토본>/start-review.sh`: 정상 packaged production 3385 Ready. Windows의 `Invoke-WebRequest`에서 인증 없는 profiles API는 403으로 보호됐다. 일반 검토 데이터에는 합성 profile을 넣지 않았다.
- 최초 Windows PowerShell `.ps1` 브라우저 helper는 OS 실행 정책에 막혀 제거했다. 정책을 변경하지 않고 공식 Windows launcher와 같은 `cmd /c start` 연결로 교체했다. 다만 직접 브라우저 실행 확인 명령은 자동 승인 검토가 `blocked by policy`로 차단했다. 추가 일반 세션 read-only probe도 차단되어 실행하지 않았다. 구체적 사유는 반환되지 않았으며 우회·권한 변경을 하지 않았다. `browser opened` 로그나 UI 탭 조회만으로 자동 열기 성공을 주장하지 않는다.
- 근거: 새 검토본의 `evidence/build-reuse.json`, `test-reuse.json`, `install-isolation.json`, `installed-journey-summary.json`, `installed-restart-browser.log`, `user-launch.json`, 화면 캡처와 실행 로그.
- Sol의 최종 정적 검토에서 구체적인 수정 필요 결함은 없었다. build ID의 candidate→artifact→설치본 일치, 목표 관련 source 복사본 일치, 설치·데이터 경계와 실행 wrapper를 대조했으며 Windows 자동 열기는 미확인으로 유지했다.
- `corepack pnpm worktree:scope -- FINANCE_ACTIVE_GOAL.md work/10/6/2026-10-06-finance-goal-review-install.md`와 scoped `git diff --check`: PASS. 원본 baseline 4,407파일 중 이번에는 현재 목표 문서만 변경됐고 종료 기록 하나만 추가됐다. 나머지 baseline byte, 기존 설치 manifest·설정·DB 3파일 hash, Git HEAD/index가 그대로임을 확인했다. `evidence/preservation.json`에 기록했다.

## 미실행 검증

Windows 기본 브라우저 자동 열기의 실제 성공은 미확인이다. Windows 네이티브 설치, 전체 test/RC/release gate, live 외부 API, 실제 사용자 금융 데이터, 기존 설치 업데이트와 원격 CI/게시는 수행하지 않았다.

## 남은 리스크

- 사용자 시작 명령의 일반 runtime 및 loopback 연결까지 검증했고 브라우저 자동 열기에는 위 도구 제한이 남았다. 명령 실행 후 브라우저가 열리지 않는 경우 그 연결만 별도 확인해야 한다.
- 기존 저장 리포트는 당시 스냅샷이다. 목표 삭제 후 새 결과를 원하면 다시 계산·기록 저장한다.
- 기존 제품 버전과 기반 commit은 새 미커밋 소스 전체의 release ID가 아니다. 검토본 폴더와 파일 hash 증거로 구분한다.

## 다음 라운드

이번에는 새 독립 검토본 전달까지 진행했다. Windows 브라우저 자동 열기의 미확인 범위 외에 추가 제품 수정이나 게시를 시작하지 않는다.
