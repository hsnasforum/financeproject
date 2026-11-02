# Finance 현재 제품 목표

기준일: 2026-10-07. 반복 감독 없이 실제로 쓸 결과를 만들고, 검증·기록의 불필요한 반복을 줄인다.

## 현재 상태

**desktop-local 인증 수정은 유지하고 WSL → Windows 기본 브라우저 전달을 수정**한 새 독립 검토 설치본을 만들었다. PowerShell에서 공식 launcher를 실행하여 Windows Chrome이 one-shot bootstrap을 소비하고, 실제 세션 쿠키를 전송하며 대시보드와 재무 진단에 진입하는 것을 확인했다. 기존 대시보드·재무 진단·저장 리포트 개선과 입력 목표/빈 목표 보존 수정도 유지한다. 정식 출시나 기존 설치본 업데이트는 아니다.

- Windows 실행: `wsl -d Ubuntu -- bash /home/xpdlqj/finance-recovery/desktop-wsl-browser-20261007/start-review.sh`
- 설치: `/home/xpdlqj/finance-recovery/desktop-wsl-browser-20261007/installed` (3393 포트, 독립 검토 데이터)
- 실행/데이터/한계 안내: 같은 폴더 상위의 `검토본-안내.md`.
- 현재 근거: `work/10/7/2026-10-07-finance-wsl-browser-handoff.md`.

## 보존한 이전 완료

- 대시보드: `work/10/6/2026-10-06-finance-product-first-dashboard.md`.
- 재무 진단 입력·결과: `work/10/6/2026-10-06-finance-planning-product-flow.md`.
- 저장 리포트: `work/10/6/2026-10-06-finance-saved-report-flow.md`.
- 이전 독립 검토본: `work/10/6/2026-10-06-finance-standalone-review.md`. 기존 `/home/xpdlqj/finance-recovery/desktop-review-20261006-221005` 설치·데이터를 보존했다.
- 목표 보존 수정: `work/10/6/2026-10-06-finance-goal-preservation-trial.md`.
- 목표 보존 독립 설치·저장·재열기·재시작 검증: `work/10/6/2026-10-06-finance-goal-review-install.md`. 해당 설치와 데이터도 보존했다.
- Desktop 인증 분리: `work/10/7/2026-10-07-finance-desktop-auth-policy.md`. 해당 소스·설치·데이터도 보존했다.

이 문서를 읽었다는 이유로 완료된 작업이나 전체 테스트를 재실행하지 않는다. 현재 실제 소스와 검증 범위를 대조하고 새 사용자 목표만 이어간다.

## 이번 범위와 결과

WSL을 native Linux와 구분하여 `cmd.exe`로 실제 bootstrap URL을 Windows 기본 브라우저에 전달한다. Windows opener의 정상 종료까지 기다리며, 로그는 `browser launch requested`로 표시한다. native Linux의 `xdg-open`과 macOS의 `open`은 유지한다. nonce/session, Auth.js, `default` identity와 일반 production 인증 정책은 이번에 변경하지 않았다.

이번 unit/integration 36개·ESLint·공식 패키지/설치/manifest·desktop smoke를 통과했다. Next build 입력 1,656개가 이전 최종 빌드와 같음을 확인해 빌드를 재사용했다. 기존 인증 회귀·사용자 범위·목표 저장·재열기 결과도 관련 코드가 바뀌지 않은 범위에서 재사용했다.

Windows Chrome 실기에서 사전 cookie/header 주입 없이 최초 bootstrap 303 → `/dashboard` 200 → `/planning` 200을 확인했다. 최종 `/planning`과 보호 API 요청에 `planning.desktop-session` 쿠키가 실제 포함됐다. 실행 중 재호출도 새 bootstrap을 소비했다. `UntrustedHost=0`, `MissingSecret=0`. 진단 계측을 뺀 동일 시작 명령도 다시 확인했다. 기존 설치·실제 DB·환경 파일·lockfile과 Git HEAD/index를 보존했으며, 새 검토 데이터와 smoke 데이터를 분리했다.

정식 릴리스, 기존 설치 교체, 원격 CI/게시, Windows 네이티브 지원 검증과 live 외부 API는 별도다. 현재 Git SHA는 기존 기반 commit이며 전체 미커밋 결과의 commit으로 표시하지 않는다.

## 이후의 원칙

검토본에서 재현되는 실제 차단을 해결하는 것을 우선한다. 범위를 무한 확장하거나 새 감독 체계를 추가하지 않는다. 로컬 구현·비파괴 검증은 자율 진행하고 외부 게시/기존 데이터 변경은 유효한 별도 승인 안에서만 한다.
