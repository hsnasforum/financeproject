# 2026-10-06 Finance 독립 실행 검토본 통합

## 변경 파일

- 제품 코드 변경 없음. 이전 대시보드·재무 진단·리포트 구현을 현재 원본과 대조하고 그대로 패키징했다.
- 현재 목표: `FINANCE_ACTIVE_GOAL.md`. 종료 기록: 이 파일.
- 저장소 밖 산출물: `/home/xpdlqj/finance-recovery/desktop-review-20261006-221005`의 `artifact/`, `installed/`, `start-review.sh`, `검토본-안내.md`, `evaluation-identity.json`, 소스 baseline/manifest 및 실행 근거.

## 사용 skill

- planning-gate-selector: 코드에 다시 기능을 추가하지 않고 독립 패키지·설치·production의 실제 핵심 흐름을 검증. 기존 전체 test/RC를 무조건 반복하지 않음.
- work-log-closeout: 이번 전달 단위를 한 기록에 정리.

## 변경 이유

앞선 세 차례는 개발 사본과 원본 소스 반영까지였다. 이번에는 개발 저장소의 의존성이 없어도 실행되는 별도 검토 설치본을 만들어, 새 프로필 작성부터 저장·리포트·종료 후 재열기까지 연결되는지 확인했다. 기존 설치본 업데이트나 정식 게시를 자동 실행하지 않는다.

## 핵심 변경

- 이전 성공 build의 관련 소스 1,983파일과 lockfile은 현재 원본과 일치했지만 standalone/node_modules가 개발 원본을 가리키는 symlink여서 독립 패키지로 재사용하지 않았다. 같은 버전 의존성을 별도 복사하고 정상 build를 한 번 실행했다. generated bundle을 수작업으로 고치거나 검사 우회하지 않음.
- 공식 desktop build로 패키지 생성, pristine checksum 확인, self-contained installer로 새 폴더에 설치했다. `--skip-install --skip-shortcuts`로 추가 의존성 다운로드와 전역 바로가기 생성을 하지 않음.
- 기존 .env/DB 대신 새 검토본에만 독립 SQLite와 Planning data root를 설정했다. 실제 검토용 새 데이터와 합성 테스트 데이터도 분리했다.
- 원본 Git은 조회만 했다. manifest의 gitSha는 실제 기반 HEAD이며 미커밋 소스 revision을 가장하지 않는다. 정확한 파일 SHA와 working-tree patch를 별도 보존했다.
- 실행 스크립트는 기존 verify·desktop launcher를 사용한다. E2E 세션 override를 제거하고 loopback 3375에서 대시보드로 시작한다. 포트 충돌 시 다른 앱을 종료하지 않는다.

## 검증

- `corepack pnpm build`: PASS, 215.2초. 내부 의존성 위치가 바뀌어 필요한 재빌드이며 이번 한 번만 수행.
- `corepack pnpm planning:v2:desktop:build -- --no-next-build --artifact-dir=<새 artifact>`: PASS. 플랫폼 linux/x64, Node ABI 127.
- artifact `node scripts/planning_v2_desktop_verify.mjs --mode=pristine-install`: PASS.
- artifact의 `node scripts/planning_v2_desktop_install.mjs --self-contained-source --from=<artifact> --to=<새 installed> --skip-install --skip-shortcuts`: PASS. 이전 설치는 대상이 아님.
- 설치본 `node scripts/planning_v2_desktop_verify.mjs --mode=runtime`: PASS.
- 설치본 `node scripts/planning_v2_desktop_smoke.mjs --app-dir=<installed> --port=3371 --timeout-ms=90000`: PASS (7.28초). bootstrap·새 cookie jar 인증 재발급, 변조 broker 거절, 프로필/run/report/export, 종료 후 writer 정리를 기존 smoke로 검증.
- 설치본 production 서버를 기존 launcher로 띄우고 실제 bootstrap을 소비한 뒤 기존 Playwright 핵심 4흐름 PASS (20.88초): dashboard 프로필별 current/stale 재계산·이력 보존, 저장 시나리오/HTML·읽기 보존, 별도 리포트 보관·상세 도착, 간단 입력/미리보기/프로필·run 저장·결과/리포트.
- 종료 후 새 세션으로 같은 격리 저장소 재시작: run 7개의 ID와 기록 54파일 byte 동일. dashboard/planning/report GET으로 새 run이나 기록 변경 없음.
- 실제 설치본 production의 1440×1000/390×844 캡처를 열어 확인. 가로 넘침·키보드·반복 저장 assertion은 기존 브라우저 시나리오에 포함.
- Next/Prisma/better-sqlite3 모듈 해석 경로가 설치본 내부임을 확인. runtime symlink 6개 모두 설치 폴더 내부로만 연결. 개발 원본 node_modules에 연결된 상태를 독립 실행이라고 표시하지 않음.
- `start-review.sh --no-open`의 일반 시작(테스트 세션 override 없음), 준비된 /dashboard 경로, 인증 없는 보호 API 401을 확인하고 종료. 기본 Windows 브라우저 열기는 미검증.
- 전체 Vitest/RC/원격 CI/release gate는 이번 로컬 평가 배포를 위해 실행하지 않았으며 정식 릴리스 PASS가 아님.

## 보존·실패 구분

- 기반 HEAD `6a51f8d3a24394ba239838a78c8c19aa590fc180`, index SHA 보존. 제품 코드·의존성 버전·lockfile·전역 설정·기존 설치본·기존 사용자 DB와 .env 변경 없음.
- Windows `wsl.exe --list --quiet`가 exit 1을 반환하여 현재 등록 배포판/Windows 자동 실행을 확인하지 못함. 임의 배포판명이나 Windows 설치 성공을 만들지 않음.
- 후속 확인용 Python 한 줄의 구문 오류 1회는 실행 전 실패(원본/설치본 변경 없음)였고 올바른 명령으로 수정했다. 제품 테스트 실패로 합산하거나 성공으로 표시하지 않는다.

## 남은 리스크

- 이것은 WSL/Linux용 독립 **검토본**이다. Windows 네이티브 installer, Windows ACL/바로가기, Windows 기본 브라우저 자동 열기는 미검증.
- 합성 입력으로 확인했으며 실제 개인 재무 데이터나 live API 연동의 전체 정확성을 보증하지 않는다. 검토본은 새 data root를 사용하고 API 키를 설정하지 않았다.
- 현재 미커밋 변경과 원격 상태의 차이는 유지된다. 외부 게시·기존 설치본 교체·릴리스는 명시 승인과 해당 게이트가 필요하다.

## 다음 라운드

이제 로컬 검토본이 있으므로 같은 세 화면의 재설계나 전체 검사부터 반복하지 않는다. 다음에는 검토본에서 재현되는 사용자 흐름의 차단만 우선하며 Git 게시/기존 설치본 교체는 별도 승인 범위로 다룬다.

## 적용 결과

이번 기록과 현재 목표만 원본에 갱신한다. 실행 가능한 검토 설치본은 저장소 밖에 남기고, 모든 이번 검증 서버는 종료한다. 최종 source/index 보존과 runtime 잔여 PID 없음은 completion.json에 기록한다.
